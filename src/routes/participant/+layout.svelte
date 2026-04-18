<script lang="ts">
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import { browser, dev } from '$app/environment';
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import { UserCircle, Layers, Filter, Navigation, Settings, Plus } from 'lucide-svelte';
	import { mapNavCallbacks } from './map/nav-store.svelte';
	import {
		createParticipantGateway,
		type ParticipantGateway
	} from '$lib/participant-state/gateway.svelte';
	import { setupPersistence } from '$lib/participant-state/persistence.svelte';
	import {
		setParticipantGateway,
		getCachedSession,
		resetAllParticipantState,
		getLastActiveHints,
		writeLastActiveHints,
		roleIdsEqual,
		switchActiveParticipant,
		pruneStaleParticipantDbs,
		cleanupLegacyDatabase,
	} from '$lib/participant-state/context.svelte';
	import { setSyncCollections, startPushListener, runCatchUpSync, syncStatus, appLoadingMessage } from '$lib/participant-state/sync.svelte';
	import { setupRealtime } from '$lib/participant-state/realtime.svelte';
	import { initEnabledFeatures } from '$lib/participant-state/enabled-features.svelte';

	// Register service worker for PWA using absolute path.
	// virtual:pwa-register generates relative "./sw.js" which breaks on sub-paths like /participant/map.
	onMount(async () => {
		// vite-pwa is configured with devOptions.enabled = false, so /sw.js only
		// exists in production builds. Skip registration in dev to avoid a 404.
		if (!browser || !('serviceWorker' in navigator) || dev) return;

		try {
			const registration = await navigator.serviceWorker.register('/sw.js', {
				scope: '/',
				type: 'classic'
			});
			console.log('Service worker registered:', registration.scope);

			// Auto-update lifecycle: reload when a new SW takes control.
			// The generated SW calls skipWaiting() + clientsClaim(), so a waiting
			// worker activates immediately. We listen for the controller swap and
			// reload so the page picks up the fresh precache -- this replaces the
			// update handling that virtual:pwa-register used to provide.
			navigator.serviceWorker.addEventListener('controllerchange', () => {
				window.location.reload();
			});

			// The initial page HTML loads BEFORE the SW exists, so the SW never
			// captures it via runtime caching. Once the SW activates, proactively
			// put the current page into the pages-cache so the app can start offline.
			const sw = registration.active || registration.waiting || registration.installing;
			if (sw) {
				const cacheOnActivation = () => {
					if (sw.state === 'activated') {
						cacheCurrentPage();
					} else {
						sw.addEventListener('statechange', () => {
							if (sw.state === 'activated') cacheCurrentPage();
						});
					}
				};
				cacheOnActivation();
			}
		} catch (error) {
			// Firefox with strict cookie/privacy settings silently blocks SW registration.
			// Safari may also fail in private browsing. Log but don't crash.
			console.error('Service worker registration error:', error);
		}
	});

	async function cacheCurrentPage() {
		try {
			const cache = await caches.open('pages-cache');
			const existing = await cache.match(window.location.href);
			if (!existing) {
				await cache.add(window.location.href);
				console.log('Cached current page for offline use');
			}
		} catch (e) {
			// Non-critical -- will be cached on next online visit via NetworkFirst.
			console.warn('Failed to cache current page:', e);
		}
	}

	let { data, children } = $props();

	// Hide layout chrome on login page
	const isLoginPage = $derived($page.url.pathname === '/participant/login');

	// Gateway state
	let gateway: ParticipantGateway | null = $state(null);
	let gatewayInitialized = $state(false);

	// Offline session state (for when server is unreachable)
	let offlineSession = $state<{ participantId: string; projectId: string; email: string } | null>(null);

	// Cleanup functions for push listener, realtime, and visibility listener
	let cleanupPushListener: (() => void) | null = null;
	let cleanupRealtime: (() => void) | null = null;
	let cleanupVisibility: (() => void) | null = null;

	// Active participant/role/project identifiers. Each participant gets their
	// own IndexedDB ("participant-state__${id}"), so cross-participant data
	// leakage is structurally impossible. We track role and project id too so
	// we can wipe that participant's DB when their role or project changes
	// server-side -- role-gated workflows/tools cached under the old role
	// must not render under the new one.
	let currentParticipantId: string | null = null;
	let currentRoleIds: string[] = [];
	let currentProjectId: string | null = null;

	function normalizeRoleIds(raw: unknown): string[] {
		if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string');
		if (typeof raw === 'string' && raw) return [raw];
		return [];
	}

	// One-shot: delete the legacy pre-namespacing DB on first boot after this
	// change lands. Fire-and-forget -- safe to call repeatedly.
	if (typeof window !== 'undefined') {
		cleanupLegacyDatabase().catch((e) =>
			console.warn('Legacy DB cleanup failed (non-fatal):', e)
		);
	}

	// syncStatus.current is reactive (imported $state from sync.svelte.ts)

	function teardownGateway() {
		cleanupPushListener?.();
		cleanupRealtime?.();
		cleanupVisibility?.();
		cleanupPushListener = null;
		cleanupRealtime = null;
		cleanupVisibility = null;
		gateway = null;
		gatewayInitialized = false;
	}

	// Stop background processes when layout unmounts
	onDestroy(() => {
		teardownGateway();
	});

	// Create gateway synchronously if participant is available.
	// setContext() MUST be called during synchronous component init -- not in $effect --
	// otherwise child components calling getContext() get null.
	//
	// Switching participants = opening a different IndexedDB (the DB is
	// namespaced by participant id), so "cross-participant leak" is
	// structurally impossible. Same participant with a changed role or
	// project triggers a scoped reset of *that* participant's DB so
	// role-gated workflows/tools don't bleed across role changes.
	let rolePendingReset: Promise<void> | null = null;
	if (data.participant) {
		const participant = data.participant;
		const newId = participant.id;
		const newRoleIds = normalizeRoleIds(participant.role_id);
		const newProjectId = participant.project_id;

		const hints = getLastActiveHints();
		const idChanged = !!hints.participantId && hints.participantId !== newId;
		const sameIdRoleChanged =
			hints.participantId === newId && !!hints.roleIds && !roleIdsEqual(hints.roleIds, newRoleIds);
		const sameIdProjectChanged =
			hints.participantId === newId && !!hints.projectId && hints.projectId !== newProjectId;

		// Point the IDB layer at this participant's own DB *before* the gateway
		// is created. This is synchronous and cheap -- it only updates a
		// module-level string; the real open happens lazily in getDB().
		switchActiveParticipant(newId);

		if (sameIdRoleChanged || sameIdProjectChanged) {
			// Same participant, but their role or project changed server-side.
			// Role-gated workflows/tools/stages cached under the old role must
			// not render under the new one. Wipe this participant's DB; the
			// background sync will repopulate it under the new role/project.
			// We kick this off async and gate the gateway init on it via
			// `rolePendingReset` so live queries don't race the delete.
			rolePendingReset = resetAllParticipantState()
				.catch((e) => console.error('Failed to reset state on role/project change:', e))
				.then(() => {
					// resetAllParticipantState clears the active id; set it again.
					switchActiveParticipant(newId);
					writeLastActiveHints({
						participantId: newId,
						roleIds: newRoleIds,
						projectId: newProjectId
					});
				});
		} else {
			// Persist hints immediately. For an id change this is "new
			// participant took over"; for no change this is "same session".
			writeLastActiveHints({
				participantId: newId,
				roleIds: newRoleIds,
				projectId: newProjectId
			});
			// If another participant was active on this device before, their
			// orphaned DB should be pruned to bound storage. Fire-and-forget.
			if (idChanged && typeof window !== 'undefined') {
				pruneStaleParticipantDbs(newId).catch((e) =>
					console.warn('Failed to prune stale participant DBs:', e)
				);
			}
		}

		currentParticipantId = newId;
		currentRoleIds = newRoleIds;
		currentProjectId = newProjectId;

		gateway = createParticipantGateway(newId, newProjectId);
		setParticipantGateway(gateway);
		setupPersistence(gateway);
		initEnabledFeatures(newId, (participant as { enabled_features?: unknown }).enabled_features);
	} else {
		// No server-authenticated participant. Leave the active DB unset here
		// and let the offline-session check below restore it from the hint
		// (see `checkOfflineSession`).
		const hints = getLastActiveHints();
		currentParticipantId = hints.participantId;
		currentRoleIds = hints.roleIds ?? [];
		currentProjectId = hints.projectId;
	}

	// Reactive gateway lifecycle: recreate when participant changes in-session.
	// The sync init block above handles the first mount; this effect handles
	// live changes (e.g. form-based re-auth without a full reload).
	$effect(() => {
		const participant = data.participant;
		if (!participant) {
			// Auth lost -- tear down but keep IndexedDB on disk so a later
			// offline reload can still reach it via the cached session. We
			// keep the active DB handle pointed at the last participant.
			if (currentParticipantId) {
				teardownGateway();
				currentParticipantId = null;
			}
			return;
		}

		const newId = participant.id;
		const newRoleIds = normalizeRoleIds(participant.role_id);
		const newProjectId = participant.project_id;

		// Same participant, same role/project, already initialized -- nothing to do.
		if (
			newId === currentParticipantId &&
			roleIdsEqual(newRoleIds, currentRoleIds) &&
			newProjectId === currentProjectId &&
			gateway
		) return;

		const roleOrProjectChanged =
			newId === currentParticipantId &&
			(!roleIdsEqual(newRoleIds, currentRoleIds) || newProjectId !== currentProjectId);

		if (currentParticipantId && currentParticipantId !== newId) {
			// Different participant took over in-session. Tear down the old
			// gateway and switch the DB layer to the new participant's own DB.
			// No wipe: the old participant's DB on disk is still theirs, and
			// will be pruned on next login.
			teardownGateway();
			if (typeof window !== 'undefined') {
				pruneStaleParticipantDbs(newId).catch((e) =>
					console.warn('Failed to prune stale participant DBs:', e)
				);
			}
		} else if (roleOrProjectChanged) {
			// Same participant, role or project changed server-side. Wipe
			// their DB so role-gated data doesn't leak across the change.
			teardownGateway();
			resetAllParticipantState()
				.catch((e) => console.error('Failed to reset state on role/project change:', e))
				.then(() => {
					switchActiveParticipant(newId);
				});
		}

		switchActiveParticipant(newId);
		writeLastActiveHints({
			participantId: newId,
			roleIds: newRoleIds,
			projectId: newProjectId
		});

		currentParticipantId = newId;
		currentRoleIds = newRoleIds;
		currentProjectId = newProjectId;

		const gw = createParticipantGateway(newId, newProjectId);
		gateway = gw;
		setParticipantGateway(gw);
		setupPersistence(gw);
	});

	// Initialize gateway data asynchronously
	$effect(() => {
		if (gateway && !gatewayInitialized) {
			initGatewayData();
		}
	});

	// Check for cached offline session if server didn't provide participant
	$effect(() => {
		if (!data.participant && !gateway && !offlineSession && browser) {
			checkOfflineSession();
		}
	});

	async function checkOfflineSession() {
		// The active-participant hint was already read during the sync init
		// block and written to currentParticipantId. Point the DB layer at
		// that hint's DB before reading the cached session -- otherwise we'd
		// hit the "No active participant" error in getDB().
		const hintedId = currentParticipantId;
		if (!hintedId) return;

		switchActiveParticipant(hintedId);
		const cached = await getCachedSession();

		if (cached) {
			// Restore offline session -- in local-first mode, the app always works
			offlineSession = cached;
			currentParticipantId = cached.participantId;
			currentProjectId = cached.projectId;
			// Make sure the DB layer is pointed at the session's participant
			// (should match the hint, but be defensive).
			switchActiveParticipant(cached.participantId);
			gateway = createParticipantGateway(cached.participantId, cached.projectId);
			setParticipantGateway(gateway);
			setupPersistence(gateway);
		}
	}

	async function initGatewayData() {
		const gw = gateway;
		if (!gw) return;

		try {
			// If a role/project change forced a scoped wipe of this
			// participant's DB, wait for it to complete before gw.init()
			// opens the (recreated) DB. Otherwise live queries could race
			// the delete.
			if (rolePendingReset) {
				await rolePendingReset;
				rolePendingReset = null;
			}

			// Initialize gateway (opens IndexedDB)
			await gw.init();
			gatewayInitialized = true;
			console.log('Participant gateway initialized');

			// Collections to sync -- use dynamic list from server (all non-system collections)
			const collections = data.collectionNames ?? [];

			// Set collections for sync module (used by triggerSync, runCatchUpSync)
			setSyncCollections(collections);

			// Push listener: debounced upload on local writes
			cleanupPushListener = startPushListener(gw);

			// Realtime: SSE subscriptions + catch-up on reconnect
			cleanupRealtime = setupRealtime(collections, () => {
				runCatchUpSync(gw);
			});

			// Catch-up on tab focus (with cooldown)
			let lastCatchUp = 0;
			const CATCHUP_COOLDOWN_MS = 30_000;

			const handleVisibility = () => {
				if (document.visibilityState === 'visible' && navigator.onLine) {
					const now = Date.now();
					if (now - lastCatchUp > CATCHUP_COOLDOWN_MS) {
						lastCatchUp = now;
						runCatchUpSync(gw);
					}
				}
			};

			document.addEventListener('visibilitychange', handleVisibility);
			cleanupVisibility = () => {
				document.removeEventListener('visibilitychange', handleVisibility);
			};
		} catch (error) {
			console.error('Failed to initialize gateway:', error);
		}
	}
</script>

{#if isLoginPage}
	{@render children()}
{:else}
	<!-- Mobile-optimized layout for authenticated participants -->
	<div class="fixed inset-0 flex flex-col overflow-hidden">
		<!-- Header -->
		<header class="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
			<div class="flex items-center gap-2">
				{#if data.projectIcon}
					<img src={data.projectIcon} alt="" class="h-8 w-8 rounded-lg object-cover" />
				{:else}
					<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
							<circle cx="12" cy="10" r="3"></circle>
						</svg>
					</div>
				{/if}
				{#if syncStatus.current}
					<span class="text-sm text-muted-foreground animate-pulse">{(m.participantLayoutSyncingData?.({ done: syncStatus.current.done, total: syncStatus.current.total })) ?? `Syncing data (${syncStatus.current.done}/${syncStatus.current.total})`}</span>
				{:else if appLoadingMessage.value}
					<span class="text-sm text-muted-foreground animate-pulse">{appLoadingMessage.value}</span>
				{:else}
					<span class="font-semibold">{data.projectName ?? (m.participantLayoutAppName?.() ?? 'Überblick')}</span>
				{/if}
			</div>

			<!-- Desktop Navigation (hidden on mobile) -->
			<div class="hidden md:flex items-center gap-1">
				<Button variant="ghost" size="icon" onclick={() => $mapNavCallbacks.onLayersClick?.()} title={m.mapFilterLayers?.() ?? 'Layers'}>
					<Layers class="h-5 w-5" />
				</Button>
				<Button variant="ghost" size="icon" onclick={() => $mapNavCallbacks.onFiltersClick?.()} title={m.mapFilters?.() ?? 'Filters'}>
					<Filter class="h-5 w-5" />
				</Button>
				<Button variant="ghost" size="icon" onclick={() => $mapNavCallbacks.onWorkflowClick?.()} title={m.participantLayoutNew?.() ?? 'New'}>
					<Plus class="h-5 w-5" />
				</Button>
				<Button variant="ghost" size="icon" onclick={() => $mapNavCallbacks.onLocationClick?.()} title={m.mapMyLocation?.() ?? 'My Location'}>
					<Navigation class="h-5 w-5" />
				</Button>
				<Button variant="ghost" size="icon" onclick={() => $mapNavCallbacks.onToolsClick?.()} title={m.mapTools?.() ?? 'Tools'}>
					<Settings class="h-5 w-5" />
				</Button>
			</div>

			{#if data.participant || offlineSession}
				<Button variant="ghost" size="icon" onclick={() => $mapNavCallbacks.onToolsClick?.()}>
					<UserCircle class="h-5 w-5" />
					<span class="sr-only">{m.profileAccount()}</span>
				</Button>
			{/if}
		</header>

		<!-- Main Content -->
		<main class="flex-1 overflow-hidden">
			{#if gateway || offlineSession || !data.participant}
				{@render children()}
			{:else}
				<div class="flex h-full items-center justify-center text-sm text-muted-foreground">
					<span class="animate-pulse">{m.participantLayoutLoading?.() ?? 'Loading…'}</span>
				</div>
			{/if}
		</main>
	</div>
{/if}
