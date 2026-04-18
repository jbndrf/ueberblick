<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Switch } from '$lib/components/ui/switch';
	import * as Dialog from '$lib/components/ui/dialog';
	import {
		LogOut,
		User,
		Shield,
		CircleHelp,
		Loader2,
		Download,
		Smartphone,
		Globe,
		Trash2,
		HardDrive,
		Package,
		SlidersHorizontal,
		Wifi,
		WifiOff,
		CloudUpload
	} from 'lucide-svelte';
	import { sanitizeHtml } from '$lib/sanitize-html';
	import { getParticipantGateway } from '$lib/participant-state/context.svelte';
	import { getFullLocalCopyMode, setFullLocalCopyMode } from '$lib/participant-state/context.svelte';
	import { getNetworkStatus } from '$lib/participant-state/network.svelte';
	import { triggerSync } from '$lib/participant-state/sync.svelte';
	import {
		getDownloadProgress,
		deletePack,
		getDownloadCompleteSignal,
		syncProjectData,
		resetDownloadProgress
	} from '$lib/participant-state';
	import { deleteDownloadedFiles } from '$lib/participant-state/file-cache';
	import { createPersistedTab } from '$lib/participant-state/ui-state.svelte';
	import { getPocketBase } from '$lib/pocketbase';
	import { getDB, getStorageStats, type DownloadedPackage, type StorageStats } from '$lib/participant-state/db';
	import { createPWAState, initPWAInstallListeners } from '$lib/utils/pwa-detection.svelte';
	import { onMount } from 'svelte';
	import PackageSelector from '$lib/components/map/package-selector.svelte';
	import ThemeToggleInline from '$lib/components/theme-toggle-inline.svelte';
	import FontSizeInline from '$lib/components/font-size-inline.svelte';
	import LanguageSelectorInline from '$lib/components/language-selector-inline.svelte';
	import AdvancedFeaturesPanel from './AdvancedFeaturesPanel.svelte';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		open: boolean;
		participant?: {
			id: string;
			name: string;
			email?: string;
			project_id?: string;
		};
		roles?: Array<{ id: string; name: string }>;
		collectionNames?: string[];
		fileFields?: Record<string, string[]>;
		infoPages?: Array<{ id: string; title: string; content: string }>;
		onLogout?: () => void;
	}

	let {
		open = $bindable(),
		participant,
		roles = [],
		collectionNames = [],
		fileFields = {},
		infoPages = [],
		onLogout
	}: Props = $props();

	// Gateway for online/offline state
	const gateway = getParticipantGateway();

	// Network status
	const network = getNetworkStatus();

	// PWA state
	const pwa = createPWAState();

	const tab = createPersistedTab('settings', 'profile');

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

	// Info page dialog
	let infoPageDialogOpen = $state(false);
	let selectedInfoPage = $state<{ id: string; title: string; content: string } | null>(null);

	// Full local copy mode (controls media caching)
	let fullLocalCopy = $state(false);
	let isTogglingMode = $state(false);

	// Storage stats
	let storageStats = $state<StorageStats | null>(null);

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
			loadPackMetadata();
		}
	});

	onMount(async () => {
		initPWAInstallListeners();
		await loadPackMetadata();
		storageStats = await getStorageStats();
	});

	// Refresh storage stats when the sheet opens
	$effect(() => {
		if (open) {
			getStorageStats().then((s) => (storageStats = s));
		}
	});

	async function loadPackMetadata() {
		isLoadingPack = true;
		try {
			const db = await getDB();
			const packs = await db.getAll('packages');
			const readyPacks = packs.filter((p) => p.status === 'ready');
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
			const db = await getDB();
			await db.delete('packages', currentPack.id);
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
				const pb = getPocketBase();
				await syncProjectData(collectionNames, pb, fileFields);
				setFullLocalCopyMode(true);
				fullLocalCopy = true;
			} else {
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

	function handleLogout() {
		onLogout?.();
		open = false;
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

	function formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
</script>

<Sheet.Root bind:open>
	<Sheet.ContentNoOverlay side="right" class="w-80">
		<Sheet.Header>
			<Sheet.Title>{m.participantSettingsSheetTitle?.() ?? 'Settings'}</Sheet.Title>
		</Sheet.Header>

		<Tabs.Root bind:value={tab.value} class="mt-2 flex flex-1 flex-col overflow-hidden">
			<Tabs.List class="w-full shrink-0">
				<Tabs.Trigger value="profile">
					<User class="h-4 w-4" />
					<span>{m.participantSettingsSheetTabProfile?.() ?? 'Profile'}</span>
				</Tabs.Trigger>
				<Tabs.Trigger value="preferences">
					<SlidersHorizontal class="h-4 w-4" />
					<span>{m.participantSettingsSheetTabPrefs?.() ?? 'Prefs'}</span>
				</Tabs.Trigger>
				<Tabs.Trigger value="offline">
					<HardDrive class="h-4 w-4" />
					<span>{m.participantSettingsSheetTabOffline?.() ?? 'Offline'}</span>
				</Tabs.Trigger>
			</Tabs.List>

			<!-- Profile Tab -->
			<Tabs.Content value="profile" class="overflow-y-auto py-4 pr-1">
				<div class="space-y-3">
					<!-- Connection Status -->
					<div class="rounded-lg border p-3 {network.online ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950' : 'border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950'}">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								{#if network.online}
									<Wifi class="h-4 w-4 text-green-600 dark:text-green-400" />
									<span class="text-sm font-medium text-green-700 dark:text-green-300">{m.participantSettingsSheetOnline?.() ?? 'Online'}</span>
								{:else}
									<WifiOff class="h-4 w-4 text-orange-600 dark:text-orange-400" />
									<span class="text-sm font-medium text-orange-700 dark:text-orange-300">{m.participantSettingsSheetOffline?.() ?? 'Offline'}</span>
								{/if}
							</div>
							{#if gateway}
								<Button
									variant="outline"
									size="sm"
									onclick={handleManualSync}
									disabled={isSyncing || !network.online}
								>
									{#if isSyncing}
										<Loader2 class="mr-1 h-3 w-3 animate-spin" />
										{m.participantSettingsSheetSyncing?.() ?? 'Syncing...'}
									{:else}
										<CloudUpload class="mr-1 h-3 w-3" />
										{m.participantSettingsSheetSyncNow?.() ?? 'Sync Now'}
									{/if}
								</Button>
							{/if}
						</div>
						{#if gateway}
							{#if syncError}
								<p class="mt-1 text-xs text-destructive">{syncError}</p>
							{:else if gateway.pendingCount > 0}
								<p class="mt-1 text-xs text-orange-600 dark:text-orange-400">
									{m.participantSettingsSheetPendingChanges?.({ count: gateway.pendingCount }) ?? `${gateway.pendingCount} unsaved change${gateway.pendingCount === 1 ? '' : 's'} waiting to upload.`}
								</p>
							{:else}
								<p class="mt-1 text-xs {network.online ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}">
									{(network.online ? (m.participantSettingsSheetNoChanges?.() ?? 'No changes to sync.') : (m.participantSettingsSheetOfflineQueue?.() ?? 'No pending changes, but new edits will queue locally.'))}
								</p>
							{/if}
						{/if}
					</div>

					{#if participant}
						<div class="rounded-lg border bg-muted/50 p-3">
							<div class="flex items-center gap-2">
								<User class="h-4 w-4 text-muted-foreground" />
								<div>
									<div class="text-sm font-medium">{participant.name}</div>
									{#if participant.email}
										<div class="text-xs text-muted-foreground">{participant.email}</div>
									{/if}
								</div>
							</div>
							<Button variant="outline" size="sm" class="mt-2 w-full justify-start" onclick={handleLogout}>
								<LogOut class="mr-2 h-4 w-4" />
								{m.participantSettingsSheetLogout?.() ?? 'Logout'}
							</Button>
						</div>
					{/if}

					{#if roles.length > 0}
						<div class="rounded-lg border bg-muted/50 p-3">
							<div class="mb-2 flex items-center gap-2 text-sm font-medium">
								<Shield class="h-4 w-4" />
								<span>{m.participantSettingsSheetRoles?.() ?? 'Roles'}</span>
							</div>
							<div class="flex flex-wrap gap-1">
								{#each roles as role}
									<Badge variant="secondary">{role.name}</Badge>
								{/each}
							</div>
						</div>
					{/if}

					{#if infoPages.length > 0}
						{#each infoPages as page}
							<button
								class="w-full rounded-lg border bg-muted/50 p-3 text-left transition-colors hover:bg-muted"
								onclick={() => { selectedInfoPage = page; infoPageDialogOpen = true; }}
							>
								<div class="flex items-center gap-2">
									<CircleHelp class="h-4 w-4 text-muted-foreground" />
									<span class="text-sm font-medium">{page.title}</span>
								</div>
							</button>
						{/each}
					{/if}
				</div>
			</Tabs.Content>

			<!-- Preferences Tab -->
			<Tabs.Content value="preferences" class="overflow-y-auto py-4 pr-1">
				<div class="space-y-4">
					<ThemeToggleInline />
					<FontSizeInline />
					<LanguageSelectorInline />
					<AdvancedFeaturesPanel />
				</div>
			</Tabs.Content>

			<!-- Offline & Data Tab -->
			<Tabs.Content value="offline" class="overflow-y-auto py-4 pr-1">
				<div class="space-y-4">

					<!-- INSTALL AS APP -->
					<div class="rounded-md border p-3 space-y-2">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								{#if pwa.isPWA}
									<Smartphone class="h-4 w-4 text-green-600" />
									<span class="text-sm font-medium">{m.participantSettingsSheetAppInstalled?.() ?? 'App Installed'}</span>
								{:else}
									<Globe class="h-4 w-4 text-muted-foreground" />
									<span class="text-sm font-medium">{m.participantSettingsSheetRunningInBrowser?.() ?? 'Running in Browser'}</span>
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
									{m.participantSettingsSheetInstall?.() ?? 'Install'}
								</Button>
							{/if}
						</div>

						{#if pwa.isPWA}
							<p class="text-xs text-green-600 dark:text-green-400">
								{m.participantSettingsSheetPwaRunningStandalone?.() ?? 'Running as a standalone app with full offline support.'}
							</p>
						{:else}
							<p class="text-xs text-muted-foreground">
								{m.participantSettingsSheetPwaInstallHint?.() ?? 'You can add this to your home screen as a standalone app. This is required if you want to start the app without an internet connection. Without it, you can only go offline while the app is already open.'}
							</p>
						{/if}

						<details class="mt-1">
							<summary class="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
								{m.participantSettingsSheetTechnicalDetails?.() ?? 'Technical details'}
							</summary>
							<div class="mt-1 space-y-1 text-xs">
								<div class="flex justify-between">
									<span class="text-muted-foreground">{m.participantSettingsSheetServiceWorker?.() ?? 'Service Worker:'}</span>
									<span
										class={pwa.swStatus === 'registered'
											? 'text-green-600'
											: pwa.swStatus === 'error'
												? 'text-red-600'
												: 'text-yellow-600'}
									>
										{pwa.swStatus}
									</span>
								</div>
								<div class="flex justify-between">
									<span class="text-muted-foreground">{m.participantSettingsSheetInstallPrompt?.() ?? 'Install prompt:'}</span>
									<span class={pwa.canInstall ? 'text-green-600' : 'text-yellow-600'}>
										{(pwa.canInstall ? (m.participantSettingsSheetAvailable?.() ?? 'available') : (m.participantSettingsSheetNotAvailable?.() ?? 'not available'))}
									</span>
								</div>
								{#if pwa.swError}
									<div class="text-red-600">Error: {pwa.swError}</div>
								{/if}
							</div>
						</details>
					</div>

					<!-- OFFLINE DATA -->
					<div class="space-y-2">
						<h4 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{m.participantSettingsSheetOfflineData?.() ?? 'Offline Data'}</h4>

						<!-- Map Tiles -->
						<div class="rounded-md border p-3 space-y-2">
							<div class="text-sm font-medium">{m.participantSettingsSheetMapTiles?.() ?? 'Map Tiles'}</div>
							<p class="text-xs text-muted-foreground">
								{m.participantSettingsSheetMapTilesDesc?.() ?? 'Map imagery is loaded from online sources while you have a connection. For offline use, your project admin can create downloadable tile packages for specific areas, which can then be imported into the application.'}
							</p>

							{#if downloadProgress && downloadProgress.status === 'downloading'}
								<div class="rounded-md bg-blue-50 p-2 dark:bg-blue-950">
									<div class="flex items-center gap-2">
										<Loader2 class="h-4 w-4 animate-spin text-blue-600" />
										<span class="text-xs font-medium text-blue-700 dark:text-blue-300">
											{m.participantSettingsSheetDownloading?.() ?? 'Downloading...'}
										</span>
									</div>
									<p class="mt-1 text-xs text-blue-600 dark:text-blue-400">
										{downloadProgress.current_operation}
									</p>
									{#if downloadProgress.completed_items > 0}
										<p class="text-xs text-blue-600 dark:text-blue-400">
											{m.participantSettingsSheetItemsDownloaded?.({ count: downloadProgress.completed_items }) ?? `${downloadProgress.completed_items} items downloaded`}
										</p>
									{/if}
								</div>
							{:else if isLoadingPack}
								<div class="flex items-center gap-2 text-sm text-muted-foreground">
									<Loader2 class="h-4 w-4 animate-spin" />
									<span>{m.participantSettingsSheetLoading?.() ?? 'Loading...'}</span>
								</div>
							{:else if currentPack}
								<div class="rounded-md bg-green-50 p-2 dark:bg-green-950">
									<div class="flex items-center gap-2">
										<Package class="h-4 w-4 text-green-600" />
										<span class="text-xs font-medium text-green-700 dark:text-green-300">
											{currentPack.name}
										</span>
									</div>
									<div class="mt-1 space-y-0.5 text-xs text-green-600 dark:text-green-400">
										<p>{formatDate(currentPack.downloadedAt)}</p>
										<p>
											{m.participantSettingsSheetTileCount?.({ count: currentPack.tileCount.toLocaleString() }) ?? `${currentPack.tileCount.toLocaleString()} tiles`}
											{#if currentPack.fileSizeBytes}
												({formatFileSize(currentPack.fileSizeBytes)})
											{/if}
										</p>
									</div>
								</div>

								<div class="flex flex-wrap gap-2">
									<Button
										variant="outline"
										size="sm"
										class="flex-1"
										onclick={handleOpenPackages}
									>
										<Package class="mr-1 h-3 w-3" />
										{m.participantSettingsSheetChangeArea?.() ?? 'Change Area'}
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
											{m.participantSettingsSheetConfirmDelete?.() ?? 'Confirm Delete'}
										</Button>
									{:else}
										<Button
											variant="outline"
											size="sm"
											class="flex-1"
											onclick={() => (showDeleteConfirm = true)}
										>
											<Trash2 class="mr-1 h-3 w-3" />
											{m.participantSettingsSheetDelete?.() ?? 'Delete'}
										</Button>
									{/if}
								</div>
							{:else}
								<p class="text-xs text-orange-600 dark:text-orange-400">
									{m.participantSettingsSheetNoTiles?.() ?? 'No tiles downloaded. The map will not work offline.'}
								</p>
								<Button
									variant="default"
									size="sm"
									class="w-full"
									onclick={handleOpenPackages}
								>
									<Package class="mr-2 h-4 w-4" />
									{m.participantSettingsSheetDownloadTiles?.() ?? 'Download Tiles'}
								</Button>
							{/if}
						</div>

						<!-- Offline Images -->
						{#if gateway}
							<div class="rounded-md border p-3 space-y-2">
								<div class="flex items-center justify-between">
									<span class="text-sm font-medium">{m.participantSettingsSheetOfflineImages?.() ?? 'Offline Images'}</span>
									<Switch
										checked={fullLocalCopy}
										onCheckedChange={handleToggleFullLocalCopy}
										disabled={isTogglingMode || isSyncing}
									/>
								</div>

								{#if isTogglingMode}
									<div class="flex items-center gap-2 text-sm text-blue-600">
										<Loader2 class="h-4 w-4 animate-spin" />
										<span>
											{(fullLocalCopy ? (m.participantSettingsSheetDownloadingThumbnails?.() ?? 'Downloading thumbnails...') : (m.participantSettingsSheetRemovingCachedImages?.() ?? 'Removing cached images...'))}
										</span>
									</div>
									{#if downloadProgress}
										<p class="text-xs text-muted-foreground">
											{downloadProgress.current_operation}
										</p>
									{/if}
								{:else if fullLocalCopy}
									<p class="text-xs text-green-600 dark:text-green-400">
										{m.participantSettingsSheetThumbnailsCached?.() ?? 'Photo thumbnails are cached for offline viewing.'}
									</p>
								{:else}
									<p class="text-xs text-muted-foreground">
										{m.participantSettingsSheetOfflineImagesDesc?.() ?? 'When enabled, low-resolution thumbnails of photos are saved to your device so images are visible offline without using too much storage. When disabled, no images are shown while offline. Full-resolution images are always loaded from the server when you have a connection.'}
									</p>
								{/if}
							</div>
						{/if}
					</div>

					<!-- STORAGE USAGE -->
					{#if storageStats}
						<div class="space-y-2">
							<h4 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{m.participantSettingsSheetStorage?.() ?? 'Storage'}</h4>
							<div class="rounded-md border p-3 space-y-3">
								<!-- Usage bar -->
								{#if storageStats.quota > 0}
									<div class="space-y-1">
										<div class="flex items-center justify-between text-xs">
											<span class="text-muted-foreground">
												{formatFileSize(storageStats.usage)} of {formatFileSize(storageStats.quota)}
											</span>
											<span class="font-medium">{storageStats.percentUsed.toFixed(1)}%</span>
										</div>
										<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
											<div
												class="h-full rounded-full transition-all {storageStats.percentUsed > 90 ? 'bg-red-500' : storageStats.percentUsed > 70 ? 'bg-orange-500' : 'bg-primary'}"
												style="width: {Math.min(storageStats.percentUsed, 100)}%"
											></div>
										</div>
									</div>
								{/if}

								<!-- Item counts -->
								<div class="grid grid-cols-3 gap-2 text-center">
									<div class="rounded bg-muted/50 px-2 py-1.5">
										<div class="text-sm font-medium">{storageStats.counts.tiles.toLocaleString()}</div>
										<div class="text-[10px] text-muted-foreground">{m.participantSettingsSheetStorageTiles?.() ?? 'Tiles'}</div>
									</div>
									<div class="rounded bg-muted/50 px-2 py-1.5">
										<div class="text-sm font-medium">{storageStats.counts.files.toLocaleString()}</div>
										<div class="text-[10px] text-muted-foreground">{m.participantSettingsSheetStorageFiles?.() ?? 'Files'}</div>
									</div>
									<div class="rounded bg-muted/50 px-2 py-1.5">
										<div class="text-sm font-medium">{storageStats.counts.records.toLocaleString()}</div>
										<div class="text-[10px] text-muted-foreground">{m.participantSettingsSheetStorageRecords?.() ?? 'Records'}</div>
									</div>
								</div>

								<!-- Persistence status -->
								<div class="flex items-center justify-between text-xs">
									<span class="text-muted-foreground">{m.participantSettingsSheetPersistentStorage?.() ?? 'Persistent storage'}</span>
									<span class={storageStats.persistent ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}>
										{(storageStats.persistent ? (m.participantSettingsSheetStorageEnabled?.() ?? 'Enabled') : (m.participantSettingsSheetStorageNotGuaranteed?.() ?? 'Not guaranteed'))}
									</span>
								</div>
							</div>
						</div>
					{/if}

				</div>
			</Tabs.Content>
		</Tabs.Root>
	</Sheet.ContentNoOverlay>
</Sheet.Root>

<!-- Info Page Dialog -->
<Dialog.Root bind:open={infoPageDialogOpen}>
	<Dialog.Content class="flex max-h-[80vh] flex-col gap-4 overflow-hidden sm:max-w-lg">
		<Dialog.Header class="shrink-0">
			<Dialog.Title>{selectedInfoPage?.title ?? ''}</Dialog.Title>
		</Dialog.Header>
		{#if selectedInfoPage}
			<div class="prose prose-sm dark:prose-invert max-w-none min-h-0 flex-1 overflow-y-auto break-words">
				{@html sanitizeHtml(selectedInfoPage.content)}
			</div>
		{/if}
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
