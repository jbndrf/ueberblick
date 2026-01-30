<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import * as m from '$lib/paraglide/messages';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import ModeToggle from '$lib/components/mode-toggle.svelte';
	import LanguageSelectorDropdown from '$lib/components/language-selector-dropdown.svelte';
	import { UserCircle, LogOut, Layers, Filter, Navigation, Settings, Plus } from 'lucide-svelte';
	import { mapNavCallbacks } from './map/nav-store.svelte';
	import {
		createParticipantGateway,
		type ParticipantGateway
	} from '$lib/participant-state/gateway.svelte';
	import { setupPersistence } from '$lib/participant-state/persistence.svelte';
	import {
		setParticipantGateway,
		setReferenceData,
		getCachedSession,
		clearCachedSession
	} from '$lib/participant-state/context.svelte';
	import { startSyncLoop } from '$lib/participant-state/sync.svelte';
	import { setupRealtime } from '$lib/participant-state/realtime.svelte';

	// Register service worker for PWA
	onMount(async () => {
		if (browser && 'serviceWorker' in navigator) {
			try {
				const { registerSW } = await import('virtual:pwa-register');
				const updateSW = registerSW({
					onRegisteredSW(swScriptUrl, registration) {
						console.log('Service worker registered:', swScriptUrl);
					},
					onRegisterError(error) {
						console.error('Service worker registration error:', error);
					}
				});
			} catch (e) {
				console.log('PWA registration not available:', e);
			}
		}
	});

	let { data, children } = $props();

	// Hide layout chrome on login page
	const isLoginPage = $derived($page.url.pathname === '/participant/login');

	// Gateway state
	let gateway: ParticipantGateway | null = $state(null);
	let gatewayInitialized = $state(false);

	// Offline session state (for when server is unreachable)
	let offlineSession = $state<{ participantId: string; projectId: string; email: string } | null>(null);

	// Cleanup functions for sync loop and realtime
	let cleanupSyncLoop: (() => void) | null = null;
	let cleanupRealtime: (() => void) | null = null;

	// Create gateway synchronously if participant is available
	// This allows $effect in setupPersistence to work during component init
	if (data.participant) {
		gateway = createParticipantGateway(data.participant.id, data.participant.project_id);
		setParticipantGateway(gateway);

		// Set up auto-persistence (uses $effect, must be called during init)
		setupPersistence(gateway);
	}

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
		if (!gateway) return;

		try {
			// Initialize (loads from IndexedDB)
			await gateway.init();
			gatewayInitialized = true;
			console.log('Participant gateway initialized');

			// Start background sync loop and realtime subscriptions
			// Collections to sync (participant-accessible collections)
			const syncCollections = [
				'markers',
				'marker_categories',
				'workflows',
				'workflow_stages',
				'workflow_connections',
				'workflow_instances',
				'workflow_instance_field_values',
				'workflow_instance_tool_usage',
				'tools_forms',
				'tools_form_fields',
				'tools_edit',
				'roles',
				'map_layers',
				'map_sources'
			];

			cleanupSyncLoop = startSyncLoop(gateway, syncCollections);
			cleanupRealtime = setupRealtime(syncCollections);
		} catch (error) {
			console.error('Failed to initialize gateway:', error);
		}
	}

	async function handleSignOut() {
		try {
			// Stop sync loop and realtime before logout
			cleanupSyncLoop?.();
			cleanupRealtime?.();

			// Clear cached offline session
			await clearCachedSession();
			// Call logout endpoint to clear cookie
			await fetch('/participant/logout', {
				method: 'POST',
				redirect: 'manual'
			});
		} catch (error) {
			console.error('Logout error:', error);
		} finally {
			// Navigate to login page with full reload
			await goto('/participant/login', { replaceState: true, invalidateAll: true });
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
				<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
						<circle cx="12" cy="10" r="3"></circle>
					</svg>
				</div>
				<span class="font-semibold">Karte</span>
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
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button variant="ghost" size="icon" {...props}>
								<UserCircle class="h-5 w-5" />
								<span class="sr-only">{m.profileAccount()}</span>
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="w-56">
						<DropdownMenu.Label>
							<div class="flex flex-col space-y-1">
								<p class="text-sm font-medium leading-none">{m.profileAccount()}</p>
								{#if data.participant?.email || offlineSession?.email}
									<p class="text-xs leading-none text-muted-foreground">
										{data.participant?.email || offlineSession?.email}
									</p>
								{/if}
							</div>
						</DropdownMenu.Label>
						<DropdownMenu.Separator />

						<!-- Theme Toggle -->
						<ModeToggle />

						<!-- Language Selector -->
						<LanguageSelectorDropdown />

						<DropdownMenu.Separator />
						<DropdownMenu.Item onclick={handleSignOut}>
							<LogOut class="mr-2 h-4 w-4" />
							{m.profileSignOut()}
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}
		</header>

		<!-- Main Content -->
		<main class="flex-1 overflow-hidden">
			{@render children()}
		</main>
	</div>
{/if}
