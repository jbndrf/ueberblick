<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import {
		LogOut,
		User,
		Shield,
		Loader2,
		Download,
		Smartphone,
		Globe,
		Trash2,
		HardDrive,
		Package,
		RefreshCw
	} from 'lucide-svelte';
	import { getParticipantGateway } from '$lib/participant-state/context.svelte';
	import { getFullLocalCopyMode, setFullLocalCopyMode } from '$lib/participant-state/context.svelte';
	import { triggerSync } from '$lib/participant-state/sync.svelte';
	import {
		getDownloadProgress,
		deletePack,
		getDownloadCompleteSignal,
		syncProjectData,
		resetDownloadProgress
	} from '$lib/participant-state';
	import { deleteDownloadedFiles } from '$lib/participant-state/file-cache';
	import { getPocketBase } from '$lib/pocketbase';
	import { getDB, type DownloadedPackage } from '$lib/participant-state/db';
	import { createPWAState, initPWAInstallListeners } from '$lib/utils/pwa-detection.svelte';
	import { Switch } from '$lib/components/ui/switch';
	import { onMount } from 'svelte';
	import PackageSelector from './package-selector.svelte';

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
		collectionNames?: string[];
		fileFields?: Record<string, string[]>;
		onLogout?: () => void;
	}

	let {
		open = $bindable(),
		onClose,
		participant,
		roles = [],
		collectionNames = [],
		fileFields = {},
		onLogout
	}: Props = $props();

	// Gateway for online/offline state
	const gateway = getParticipantGateway();

	// PWA state
	const pwa = createPWAState();

	// Download progress
	const downloadProgress = $derived(getDownloadProgress());

	// Downloaded package info
	let currentPack = $state<DownloadedPackage | null>(null);
	let isLoadingPack = $state(true);

	// Sync state
	let isSyncing = $state(false);
	let syncError = $state<string | null>(null);

	// Delete confirmation
	let showDeleteConfirm = $state(false);
	let isDeleting = $state(false);

	// Package selector dialog
	let showPackageSelector = $state(false);

	// Full local copy mode (controls media caching)
	let fullLocalCopy = $state(false);
	let isTogglingMode = $state(false);

	// Initialize from localStorage
	$effect(() => {
		fullLocalCopy = getFullLocalCopyMode();
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
			const db = await getDB();
			const packs = await db.getAll('packages');
			const readyPacks = packs.filter(p => p.status === 'ready');
			currentPack = readyPacks.length > 0 ? readyPacks[0] : null;
		} catch (error) {
			console.error('Failed to load pack metadata:', error);
		} finally {
			isLoadingPack = false;
		}
	}

	async function handleDeletePack() {
		if (!currentPack) return;

		isDeleting = true;
		try {
			// Delete from packages store
			const db = await getDB();
			await db.delete('packages', currentPack.id);

			// Also clear cached data using pack-downloader utility
			await deletePack(currentPack.id);

			currentPack = null;
			showDeleteConfirm = false;
		} catch (error) {
			console.error('Failed to delete pack:', error);
		} finally {
			isDeleting = false;
		}
	}

	async function handleToggleFullLocalCopy(checked: boolean) {
		if (!gateway || !participant || !participant.project_id) return;

		isTogglingMode = true;
		syncError = null;

		try {
			if (checked) {
				// Light -> Full Local Copy: download thumbnails for all file records
				const pb = getPocketBase();
				await syncProjectData(collectionNames, pb, fileFields);

				setFullLocalCopyMode(true);
				fullLocalCopy = true;
			} else {
				// Full Local Copy -> Light: delete all downloaded files
				await deleteDownloadedFiles();

				setFullLocalCopyMode(false);
				fullLocalCopy = false;
			}
		} catch (error) {
			console.error('Failed to toggle full local copy:', error);
			syncError = error instanceof Error ? error.message : 'Toggle failed';
		} finally {
			isTogglingMode = false;
			setTimeout(() => resetDownloadProgress(), 2000);
		}
	}

	async function handleManualSync() {
		if (!gateway) return;

		isSyncing = true;
		syncError = null;

		try {
			await triggerSync(gateway);
		} catch (error) {
			syncError = error instanceof Error ? error.message : 'Sync failed';
		} finally {
			isSyncing = false;
		}
	}

	function handleOpenPackages() {
		showPackageSelector = true;
	}

	function handlePackageDownloaded() {
		loadPackMetadata();
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

	function formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
								<Package class="h-4 w-4 text-green-600" />
								<span class="text-sm font-medium text-green-700 dark:text-green-300">
									{currentPack.name}
								</span>
							</div>
							<div class="space-y-1 text-xs text-green-600 dark:text-green-400">
								<p>Downloaded: {formatDate(currentPack.downloadedAt)}</p>
								<p>
									{currentPack.tileCount.toLocaleString()} tiles
									{#if currentPack.fileSizeBytes}
										({formatFileSize(currentPack.fileSizeBytes)})
									{/if}
								</p>
							</div>
						</div>

						<!-- Pack Actions -->
						<div class="flex flex-wrap gap-2">
							<Button variant="outline" size="sm" class="flex-1" onclick={handleOpenPackages}>
								<Package class="mr-1 h-3 w-3" />
								Get Packages
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
							Download an offline package to work without internet.
						</p>
						<Button variant="default" size="sm" class="w-full" onclick={handleOpenPackages}>
								<Package class="mr-2 h-4 w-4" />
								Download Package
							</Button>
					{/if}
				</div>
			</div>

			<!-- Sync Status -->
			{#if gateway}
				<div class="rounded-lg border p-4">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<RefreshCw class="h-4 w-4 text-muted-foreground" />
							<span class="text-sm font-medium">Sync</span>
						</div>
						<div class="flex items-center gap-2">
							{#if gateway.pendingCount > 0}
								<span class="text-xs text-orange-600 dark:text-orange-400">
									{gateway.pendingCount} pending
								</span>
							{/if}
							<Button
								variant="outline"
								size="sm"
								onclick={handleManualSync}
								disabled={isSyncing || !navigator.onLine}
							>
								{#if isSyncing}
									<Loader2 class="mr-1 h-3 w-3 animate-spin" />
									Syncing...
								{:else}
									<RefreshCw class="mr-1 h-3 w-3" />
									Sync Now
								{/if}
							</Button>
						</div>
					</div>
					{#if syncError}
						<p class="mt-2 text-xs text-destructive">{syncError}</p>
					{:else}
						<p class="mt-2 text-xs text-muted-foreground">
							Data syncs automatically in the background. Records are always available locally.
						</p>
					{/if}
				</div>
			{/if}

			<!-- Full Local Copy Toggle -->
			{#if gateway}
				<div class="rounded-lg border p-4">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<HardDrive class="h-4 w-4 text-muted-foreground" />
							<span class="text-sm font-medium">Full Local Copy</span>
						</div>

						<Switch
							checked={fullLocalCopy}
							onCheckedChange={handleToggleFullLocalCopy}
							disabled={isTogglingMode || isSyncing}
						/>
					</div>

					{#if isTogglingMode}
						<div class="mt-2 flex items-center gap-2 text-sm text-blue-600">
							<Loader2 class="h-4 w-4 animate-spin" />
							<span>{fullLocalCopy ? 'Downloading images for offline...' : 'Removing cached images...'}</span>
						</div>
						{#if downloadProgress}
							<p class="mt-1 text-xs text-muted-foreground">
								{downloadProgress.current_operation}
							</p>
						{/if}
					{:else if fullLocalCopy}
						<p class="mt-2 text-xs text-muted-foreground">
							Image thumbnails are cached locally. Everything works offline.
						</p>
					{:else}
						<p class="mt-2 text-xs text-muted-foreground">
							Images load from server when online. Data is always available locally.
						</p>
					{/if}
					{#if !currentPack}
						<p class="mt-1 text-xs text-orange-600 dark:text-orange-400">
							Download a tile package for offline map tiles.
						</p>
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

<!-- Package Selector Dialog -->
{#if participant?.project_id}
	<PackageSelector
		bind:open={showPackageSelector}
		projectId={participant.project_id}
		onClose={() => (showPackageSelector = false)}
		onDownloadComplete={handlePackageDownloaded}
	/>
{/if}
