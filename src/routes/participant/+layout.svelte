<script lang="ts">
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
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
	} from '$lib/participant-state/context.svelte';
	import { setSyncCollections, startPushListener, runCatchUpSync } from '$lib/participant-state/sync.svelte';
	import { setupRealtime } from '$lib/participant-state/realtime.svelte';

	// Register service worker for PWA using absolute path.
	// virtual:pwa-register generates relative "./sw.js" which breaks on sub-paths like /participant/map.
	onMount(async () => {
		if (!browser || !('serviceWorker' in navigator)) return;

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

	// Track current participant ID to detect re-auth with different account
	let currentParticipantId: string | null = null;

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
	if (data.participant) {
		currentParticipantId = data.participant.id;
		gateway = createParticipantGateway(data.participant.id, data.participant.project_id);
		setParticipantGateway(gateway);
		setupPersistence(gateway);
	}

	// Reactive gateway lifecycle: recreate when participant changes (re-auth with different account)
	$effect(() => {
		const participant = data.participant;
		if (!participant) {
			// Auth lost -- tear down but keep IndexedDB for offline mode
			if (currentParticipantId) {
				teardownGateway();
				currentParticipantId = null;
			}
			return;
		}

		// Same participant, already initialized -- nothing to do
		if (participant.id === currentParticipantId && gateway) return;

		// Different participant -- tear down old, clear stale data, create new
		if (currentParticipantId && currentParticipantId !== participant.id) {
			teardownGateway();
			// Clear all data from old participant to prevent orphaned records causing conflicts
			resetAllParticipantState().catch((e) => console.error('Failed to reset state:', e));
		}

		currentParticipantId = participant.id;
		const gw = createParticipantGateway(participant.id, participant.project_id);
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
		const cached = await getCachedSession();

		if (cached) {
			// Restore offline session -- in local-first mode, the app always works
			offlineSession = cached;
			gateway = createParticipantGateway(cached.participantId, cached.projectId);
			setParticipantGateway(gateway);
			setupPersistence(gateway);
		}
	}

	async function initGatewayData() {
		const gw = gateway;
		if (!gw) return;

		try {
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
				<span class="font-semibold">{data.projectName ?? 'Überblick'}</span>
			</div>

			<!-- Desktop Navigation (hidden on mobile) -->
			<div class="hidden md:flex items-center gap-1">
				<Button variant="ghost" size="icon" onclick={() => $mapNavCallbacks.onLayersClick?.()} title="Layers">
					<Layers class="h-5 w-5" />
				</Button>
				<Button variant="ghost" size="icon" onclick={() => $mapNavCallbacks.onFiltersClick?.()} title="Filters">
					<Filter class="h-5 w-5" />
				</Button>
				<Button variant="ghost" size="icon" onclick={() => $mapNavCallbacks.onWorkflowClick?.()} title="New">
					<Plus class="h-5 w-5" />
				</Button>
				<Button variant="ghost" size="icon" onclick={() => $mapNavCallbacks.onLocationClick?.()} title="Location">
					<Navigation class="h-5 w-5" />
				</Button>
				<Button variant="ghost" size="icon" onclick={() => $mapNavCallbacks.onToolsClick?.()} title="Tools">
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
			{@render children()}
		</main>
	</div>
{/if}
