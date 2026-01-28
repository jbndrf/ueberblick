<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import {
		LogOut,
		User,
		Shield,
		Wifi,
		WifiOff,
		Loader2,
		Download,
		Upload,
		Smartphone,
		Globe,
		MapPin,
		Trash2,
		RefreshCw,
		HardDrive
	} from 'lucide-svelte';
	import { getParticipantGateway } from '$lib/participant-state/context.svelte';
	import { uploadChanges } from '$lib/participant-state/sync.svelte';
	import {
		getDownloadProgress,
		getDownloadedPacks,
		deletePack,
		cacheSession,
		clearAllData,
		signalOfflineModeChange,
		getDownloadCompleteSignal,
		type OfflinePackMetadata
	} from '$lib/participant-state';
	import { createPWAState, initPWAInstallListeners } from '$lib/utils/pwa-detection.svelte';
	import { Switch } from '$lib/components/ui/switch';
	import { onMount } from 'svelte';

	interface Props {
		open: boolean;
		onClose?: () => void;
		participant?: {
			id: string;
			name: string;
			email?: string;
			project_id?: string;
		};
		roles?: Array<{ id: string; name: string }>;
		onLogout?: () => void;
		onSelectArea?: () => void;
	}

	let {
		open = $bindable(),
		onClose,
		participant,
		roles = [],
		onLogout,
		onSelectArea
	}: Props = $props();

	// Gateway for online/offline state
	const gateway = getParticipantGateway();

	// PWA state
	const pwa = createPWAState();

	// Download progress
	const downloadProgress = $derived(getDownloadProgress());

	// Pack metadata
	let currentPack = $state<OfflinePackMetadata | null>(null);
	let isLoadingPack = $state(true);

	// Sync state
	let isSyncing = $state(false);
	let syncError = $state<string | null>(null);

	// Delete confirmation
	let showDeleteConfirm = $state(false);
	let isDeleting = $state(false);

	// User-controlled offline mode (distinct from network status)
	let userOfflineMode = $state(false);
	let isGoingOnline = $state(false);

	// Initialize offline mode from gateway state
	$effect(() => {
		if (gateway) {
			userOfflineMode = !gateway.isOnline;
		}
	});

	// Watch for download complete signal to reload pack metadata
	const downloadCompleteSignal = $derived(getDownloadCompleteSignal());
	let prevDownloadSignal = 0;

	$effect(() => {
		const signal = downloadCompleteSignal;
		if (signal > prevDownloadSignal) {
			prevDownloadSignal = signal;
			console.log('[tools-menu] Download complete signal received, reloading pack metadata...');
			loadPackMetadata();
		}
	});

	onMount(async () => {
		initPWAInstallListeners();
		await loadPackMetadata();
	});

	async function loadPackMetadata() {
		isLoadingPack = true;
		try {
			const packs = await getDownloadedPacks();
			currentPack = packs.length > 0 ? packs[0] : null;
		} catch (error) {
			console.error('Failed to load pack metadata:', error);
		} finally {
			isLoadingPack = false;
		}
	}

	async function handleUploadChanges() {
		if (!gateway) return;

		isSyncing = true;
		syncError = null;

		try {
			await uploadChanges(gateway);
		} catch (error) {
			syncError = error instanceof Error ? error.message : 'Upload failed';
			console.error('Upload error:', error);
		} finally {
			isSyncing = false;
		}
	}

	async function handleDeletePack() {
		if (!currentPack) return;

		isDeleting = true;
		try {
			await deletePack(currentPack.id);
			currentPack = null;
			showDeleteConfirm = false;
		} catch (error) {
			console.error('Failed to delete pack:', error);
		} finally {
			isDeleting = false;
		}
	}

	async function handleToggleOfflineMode(checked: boolean) {
		if (!gateway || !participant || !participant.project_id) return;

		if (checked) {
			// Going offline: cache session, switch gateway
			await cacheSession({
				id: participant.id,
				project_id: participant.project_id,
				email: participant.email
			});
			gateway.setOfflineMode(true);
			userOfflineMode = true;

			// Signal mode change to trigger data reload from IndexedDB
			signalOfflineModeChange();
		} else {
			// Going online: sync first, then clear data
			await handleGoOnline();
		}
	}

	async function handleGoOnline() {
		if (!gateway) return;

		isGoingOnline = true;
		try {
			// 1. Sync pending changes
			if (gateway.pendingCount > 0) {
				await uploadChanges(gateway);
			}

			// 2. Clear all local data
			await clearAllData();

			// 3. Switch gateway to online
			gateway.setOfflineMode(false);
			userOfflineMode = false;

			// 4. Signal mode change to trigger data reload from server
			signalOfflineModeChange();
		} catch (error) {
			console.error('Failed to go online:', error);
			syncError = error instanceof Error ? error.message : 'Sync failed';
		} finally {
			isGoingOnline = false;
		}
	}

	function handleSelectArea() {
		open = false;
		onSelectArea?.();
	}

	function handleClose() {
		open = false;
		onClose?.();
	}

	function handleLogout() {
		onLogout?.();
		handleClose();
	}

	function formatDate(isoString: string): string {
		return new Date(isoString).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatCoordinates(center: { lat: number; lon: number }): string {
		return `${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}`;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[90vh] max-w-md overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>Tools & Settings</Dialog.Title>
			<Dialog.Description>Participant information and offline settings</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 py-4">
			<!-- Participant Info -->
			{#if participant}
				<div class="rounded-lg border bg-muted/50 p-4">
					<div class="mb-2 flex items-center gap-2 text-sm font-medium">
						<User class="h-4 w-4" />
						<span>Participant</span>
					</div>
					<div class="space-y-1">
						<div class="font-medium">{participant.name}</div>
						{#if participant.email}
							<div class="text-sm text-muted-foreground">{participant.email}</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Roles -->
			{#if roles.length > 0}
				<div class="rounded-lg border bg-muted/50 p-4">
					<div class="mb-3 flex items-center gap-2 text-sm font-medium">
						<Shield class="h-4 w-4" />
						<span>Your Roles</span>
					</div>
					<div class="flex flex-wrap gap-2">
						{#each roles as role}
							<Badge variant="secondary">{role.name}</Badge>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Offline Section -->
			<div class="rounded-lg border p-4">
				<div class="mb-3 flex items-center gap-2 text-sm font-medium">
					<HardDrive class="h-4 w-4" />
					<span>Offline Mode</span>
				</div>

				<!-- App Mode Indicator -->
				<div class="mb-4 rounded-md bg-muted/50 p-3">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							{#if pwa.isPWA}
								<Smartphone class="h-4 w-4 text-green-600" />
								<span class="text-sm">Installed App</span>
							{:else}
								<Globe class="h-4 w-4 text-blue-600" />
								<span class="text-sm">Browser</span>
							{/if}
						</div>
						{#if !pwa.isPWA}
							<Button
								variant="outline"
								size="sm"
								onclick={() => pwa.install()}
								disabled={!pwa.canInstall}
							>
								<Download class="mr-1 h-3 w-3" />
								Install App
							</Button>
						{/if}
					</div>

					<!-- Debug info -->
					<div class="mt-2 space-y-1 border-t pt-2 text-xs">
						<div class="flex justify-between">
							<span class="text-muted-foreground">Service Worker:</span>
							<span class={pwa.swStatus === 'registered' ? 'text-green-600' : pwa.swStatus === 'error' ? 'text-red-600' : 'text-yellow-600'}>
								{pwa.swStatus}
							</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">Install prompt:</span>
							<span class={pwa.canInstall ? 'text-green-600' : 'text-yellow-600'}>
								{pwa.canInstall ? 'available' : 'not available'}
							</span>
						</div>
						{#if pwa.swError}
							<div class="text-red-600">Error: {pwa.swError}</div>
						{/if}
					</div>

					{#if !pwa.isPWA}
						<p class="mt-2 text-xs text-muted-foreground">
							{#if pwa.canInstall}
								Click "Install App" to add to your home screen for offline access.
							{:else if pwa.swStatus === 'registered'}
								SW ready. Use browser menu "Add to Home Screen".
							{:else}
								Waiting for service worker...
							{/if}
						</p>
					{/if}
				</div>

				<!-- Download Status / Area Selection -->
				<div class="space-y-3">
					<div class="text-sm font-medium">Offline Data</div>

					{#if downloadProgress && downloadProgress.status === 'downloading'}
						<!-- Download in progress -->
						<div class="rounded-md bg-blue-50 p-3 dark:bg-blue-950">
							<div class="mb-2 flex items-center gap-2">
								<Loader2 class="h-4 w-4 animate-spin text-blue-600" />
								<span class="text-sm font-medium text-blue-700 dark:text-blue-300">
									Downloading...
								</span>
							</div>
							<p class="text-xs text-blue-600 dark:text-blue-400">
								{downloadProgress.current_operation}
							</p>
							{#if downloadProgress.completed_items > 0}
								<p class="mt-1 text-xs text-blue-600 dark:text-blue-400">
									{downloadProgress.completed_items} items downloaded
								</p>
							{/if}
						</div>
					{:else if isLoadingPack}
						<!-- Loading pack info -->
						<div class="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 class="h-4 w-4 animate-spin" />
							<span>Loading...</span>
						</div>
					{:else if currentPack}
						<!-- Has downloaded data -->
						<div class="rounded-md bg-green-50 p-3 dark:bg-green-950">
							<div class="mb-2 flex items-center gap-2">
								<MapPin class="h-4 w-4 text-green-600" />
								<span class="text-sm font-medium text-green-700 dark:text-green-300">
									{currentPack.radius_km} km radius
								</span>
							</div>
							<div class="space-y-1 text-xs text-green-600 dark:text-green-400">
								<p>Center: {formatCoordinates(currentPack.center)}</p>
								<p>Downloaded: {formatDate(currentPack.created_at)}</p>
								<p>
									{currentPack.marker_count} markers, {currentPack.instance_count} instances,
									{currentPack.tile_count.toLocaleString()} tiles
								</p>
							</div>
						</div>

						<!-- Pack Actions -->
						<div class="flex gap-2">
							<Button variant="outline" size="sm" class="flex-1" onclick={handleSelectArea}>
								<RefreshCw class="mr-1 h-3 w-3" />
								Update Area
							</Button>
							{#if showDeleteConfirm}
								<Button
									variant="destructive"
									size="sm"
									class="flex-1"
									onclick={handleDeletePack}
									disabled={isDeleting}
								>
									{#if isDeleting}
										<Loader2 class="mr-1 h-3 w-3 animate-spin" />
									{/if}
									Confirm Delete
								</Button>
							{:else}
								<Button
									variant="outline"
									size="sm"
									class="flex-1"
									onclick={() => (showDeleteConfirm = true)}
								>
									<Trash2 class="mr-1 h-3 w-3" />
									Delete
								</Button>
							{/if}
						</div>
					{:else}
						<!-- No data downloaded -->
						<p class="mb-3 text-xs text-muted-foreground">
							Download map tiles and data for a specific area to work offline.
						</p>
						<Button variant="default" size="sm" class="w-full" onclick={handleSelectArea}>
							<MapPin class="mr-2 h-4 w-4" />
							Select Area to Download
						</Button>
					{/if}
				</div>
			</div>

			<!-- Sync Status (when offline with pending changes) -->
			{#if gateway && gateway.pendingCount > 0}
				<div class="rounded-lg border bg-orange-50 p-4 dark:bg-orange-950">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<Upload class="h-4 w-4 text-orange-600" />
							<span class="text-sm font-medium text-orange-700 dark:text-orange-300">
								{gateway.pendingCount} changes pending
							</span>
						</div>
						<Button
							variant="outline"
							size="sm"
							onclick={handleUploadChanges}
							disabled={isSyncing || !navigator.onLine}
						>
							{#if isSyncing}
								<Loader2 class="mr-1 h-3 w-3 animate-spin" />
								Syncing...
							{:else}
								<Upload class="mr-1 h-3 w-3" />
								Sync Now
							{/if}
						</Button>
					</div>
					{#if syncError}
						<p class="mt-2 text-xs text-destructive">{syncError}</p>
					{:else if !navigator.onLine}
						<p class="mt-2 text-xs text-orange-600 dark:text-orange-400">
							Connect to the internet to sync your changes.
						</p>
					{/if}
				</div>
			{/if}

			<!-- Offline Mode Toggle -->
			{#if gateway && currentPack}
				<div class="rounded-lg border p-4">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							{#if userOfflineMode}
								<WifiOff class="h-4 w-4 text-orange-600" />
								<span class="text-sm font-medium">Offline Mode</span>
							{:else}
								<Wifi class="h-4 w-4 text-green-600" />
								<span class="text-sm font-medium">Online Mode</span>
							{/if}
						</div>

						<Switch
							checked={userOfflineMode}
							onCheckedChange={handleToggleOfflineMode}
							disabled={isGoingOnline || isSyncing}
						/>
					</div>

					{#if userOfflineMode}
						<p class="mt-2 text-xs text-muted-foreground">
							Working from local data. Toggle off to sync and go online.
						</p>
					{:else}
						<p class="mt-2 text-xs text-muted-foreground">
							Connected to server. Toggle on to work offline.
						</p>
					{/if}

					{#if isGoingOnline}
						<div class="mt-2 flex items-center gap-2 text-sm text-blue-600">
							<Loader2 class="h-4 w-4 animate-spin" />
							<span>Syncing and going online...</span>
						</div>
					{/if}
				</div>
			{:else if gateway}
				<!-- No pack downloaded - show simple status -->
				<div class="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
					{#if navigator.onLine}
						<Wifi class="h-4 w-4 text-green-600" />
						<span class="text-sm">Connected</span>
					{:else}
						<WifiOff class="h-4 w-4 text-orange-600" />
						<span class="text-sm">No Connection</span>
					{/if}
				</div>
			{/if}

			<!-- Actions -->
			<div class="space-y-2 pt-2">
				<Button variant="outline" class="w-full justify-start" onclick={handleLogout}>
					<LogOut class="mr-2 h-4 w-4" />
					Logout
				</Button>
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={handleClose}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
