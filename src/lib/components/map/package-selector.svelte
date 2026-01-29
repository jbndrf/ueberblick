<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Progress } from '$lib/components/ui/progress';
	import { Package, Download, Loader2, CheckCircle, AlertCircle, Upload } from 'lucide-svelte';
	import { getPocketBase } from '$lib/pocketbase';
	import { onMount } from 'svelte';
	import {
		extractAndStoreTiles,
		getPackageMetadata,
		type ZipExtractionProgress
	} from '$lib/participant-state/tile-cache.svelte';
	import { getDB, type DownloadedPackage } from '$lib/participant-state/db';
	import { signalDownloadComplete } from '$lib/participant-state/download-events.svelte';
	import { storeRecords } from '$lib/participant-state/pack-downloader.svelte';

	// GeoJSON types for region
	type GeoJSONPolygon = {
		type: 'Polygon';
		coordinates: number[][][];
	};
	type GeoJSONMultiPolygon = {
		type: 'MultiPolygon';
		coordinates: number[][][][];
	};
	type GeoJSONFeature = {
		type: 'Feature';
		geometry: GeoJSONPolygon | GeoJSONMultiPolygon;
		properties?: Record<string, unknown>;
	};
	type RegionGeoJSON = GeoJSONPolygon | GeoJSONMultiPolygon | GeoJSONFeature;

	interface OfflinePackage {
		id: string;
		name: string;
		project_id: string;
		status: 'draft' | 'processing' | 'ready' | 'failed';
		region_geojson: RegionGeoJSON;
		tile_count?: number;
		file_size_bytes?: number;
		zoom_min: number;
		zoom_max: number;
		archive_file?: string;
		created: string;
	}

	interface Props {
		open: boolean;
		projectId: string;
		onClose?: () => void;
		onDownloadComplete?: () => void;
	}

	let {
		open = $bindable(),
		projectId,
		onClose,
		onDownloadComplete
	}: Props = $props();

	let packages = $state<OfflinePackage[]>([]);
	let isLoading = $state(true);
	let loadError = $state<string | null>(null);

	// Download state
	let downloadingPackageId = $state<string | null>(null);
	let downloadProgress = $state<{
		phase: 'fetching' | 'extracting' | 'complete' | 'error';
		progress: number;
		message: string;
	} | null>(null);

	// Already downloaded packages
	let downloadedPackageIds = $state<Set<string>>(new Set());

	// File import
	let fileInput: HTMLInputElement;
	let isImporting = $state(false);

	onMount(async () => {
		await loadPackages();
		await loadDownloadedPackages();
	});

	async function loadPackages() {
		isLoading = true;
		loadError = null;

		try {
			const pb = getPocketBase();
			packages = await pb.collection('offline_packages').getFullList<OfflinePackage>({
				filter: `project_id = "${projectId}" && status = "ready"`,
				sort: '-created'
			});
		} catch (err) {
			console.error('Failed to load packages:', err);
			loadError = 'Failed to load available packages';
		} finally {
			isLoading = false;
		}
	}

	async function loadDownloadedPackages() {
		try {
			const db = await getDB();
			const downloaded = await db.getAll('packages');
			downloadedPackageIds = new Set(downloaded.filter(p => p.status === 'ready').map(p => p.id));
		} catch {
			// Ignore errors
		}
	}

	function formatFileSize(bytes: number | undefined): string {
		if (!bytes) return '-';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	/**
	 * Get bounding box from GeoJSON region
	 */
	function getBboxFromRegion(region: RegionGeoJSON): { minLon: number; minLat: number; maxLon: number; maxLat: number } {
		let coords: number[][][] = [];

		if (region.type === 'Feature') {
			const geom = region.geometry;
			if (geom.type === 'Polygon') {
				coords = geom.coordinates;
			} else if (geom.type === 'MultiPolygon') {
				coords = geom.coordinates.flat();
			}
		} else if (region.type === 'Polygon') {
			coords = region.coordinates;
		} else if (region.type === 'MultiPolygon') {
			coords = region.coordinates.flat();
		}

		let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
		for (const ring of coords) {
			for (const [lon, lat] of ring) {
				if (lon < minLon) minLon = lon;
				if (lon > maxLon) maxLon = lon;
				if (lat < minLat) minLat = lat;
				if (lat > maxLat) maxLat = lat;
			}
		}

		return { minLon, minLat, maxLon, maxLat };
	}

	/**
	 * Download project data (markers, workflows, etc.) for a region
	 */
	async function downloadPackageData(pkg: OfflinePackage): Promise<void> {
		const pb = getPocketBase();
		const bbox = getBboxFromRegion(pkg.region_geojson);

		// Build bounding box filter for geo-located data
		const bboxFilter = `location.lat >= ${bbox.minLat} && location.lat <= ${bbox.maxLat} && location.lon >= ${bbox.minLon} && location.lon <= ${bbox.maxLon}`;

		// Download markers within region
		downloadProgress = { phase: 'extracting', progress: 60, message: 'Downloading markers...' };
		const markers = await pb.collection('markers').getFullList({
			filter: `project_id = "${pkg.project_id}" && ${bboxFilter}`
		});
		await storeRecords('markers', markers);

		// Download workflow instances within region
		downloadProgress = { phase: 'extracting', progress: 65, message: 'Downloading workflow instances...' };
		const instances = await pb.collection('workflow_instances').getFullList({
			filter: bboxFilter
		});
		await storeRecords('workflow_instances', instances);

		// Download field values for instances
		if (instances.length > 0) {
			downloadProgress = { phase: 'extracting', progress: 70, message: 'Downloading field values...' };
			const instanceIds = instances.map((i) => i.id);
			const batchSize = 20;
			for (let i = 0; i < instanceIds.length; i += batchSize) {
				const batch = instanceIds.slice(i, i + batchSize);
				const filterParts = batch.map((id) => `instance_id = "${id}"`);
				const fieldValues = await pb.collection('workflow_instance_field_values').getFullList({
					filter: filterParts.join(' || ')
				});
				await storeRecords('workflow_instance_field_values', fieldValues);
			}
		}

		// Download reference data (non-geo)
		downloadProgress = { phase: 'extracting', progress: 75, message: 'Downloading categories...' };
		const categories = await pb.collection('marker_categories').getFullList({
			filter: `project_id = "${pkg.project_id}"`
		});
		await storeRecords('marker_categories', categories);

		downloadProgress = { phase: 'extracting', progress: 78, message: 'Downloading roles...' };
		const roles = await pb.collection('roles').getFullList({
			filter: `project_id = "${pkg.project_id}"`
		});
		await storeRecords('roles', roles);

		downloadProgress = { phase: 'extracting', progress: 80, message: 'Downloading workflows...' };
		const workflows = await pb.collection('workflows').getFullList({
			filter: `project_id = "${pkg.project_id}"`
		});
		await storeRecords('workflows', workflows);

		if (workflows.length > 0) {
			const workflowIds = workflows.map((w) => w.id);
			const workflowFilter = workflowIds.map((id) => `workflow_id = "${id}"`).join(' || ');

			downloadProgress = { phase: 'extracting', progress: 83, message: 'Downloading stages...' };
			const stages = await pb.collection('workflow_stages').getFullList({
				filter: workflowFilter
			});
			await storeRecords('workflow_stages', stages);

			downloadProgress = { phase: 'extracting', progress: 86, message: 'Downloading connections...' };
			const connections = await pb.collection('workflow_connections').getFullList({
				filter: workflowFilter
			});
			await storeRecords('workflow_connections', connections);

			downloadProgress = { phase: 'extracting', progress: 89, message: 'Downloading forms...' };
			const forms = await pb.collection('tools_forms').getFullList({
				filter: workflowFilter
			});
			await storeRecords('tools_forms', forms);

			if (forms.length > 0) {
				const formFilter = forms.map((f) => `form_id = "${f.id}"`).join(' || ');
				const fields = await pb.collection('tools_form_fields').getFullList({
					filter: formFilter
				});
				await storeRecords('tools_form_fields', fields);
			}

			if (stages.length > 0) {
				downloadProgress = { phase: 'extracting', progress: 92, message: 'Downloading edit tools...' };
				const stageFilter = stages.map((s) => `stage_id ~ "${s.id}"`).join(' || ');
				const editTools = await pb.collection('tools_edit').getFullList({
					filter: stageFilter
				});
				await storeRecords('tools_edit', editTools);
			}
		}

		// Download map layers and sources
		downloadProgress = { phase: 'extracting', progress: 95, message: 'Downloading map layers...' };
		const mapLayers = await pb.collection('map_layers').getFullList({
			filter: `project_id = "${pkg.project_id}" && is_active = true`,
			expand: 'source_id'
		});
		await storeRecords('map_layers', mapLayers);

		// Extract unique sources
		const sources: { id: string }[] = [];
		const seenSourceIds = new Set<string>();
		for (const layer of mapLayers) {
			const source = (layer as { expand?: { source_id?: { id: string } } }).expand?.source_id;
			if (source && !seenSourceIds.has(source.id)) {
				seenSourceIds.add(source.id);
				sources.push(source);
			}
		}
		await storeRecords('map_sources', sources);
	}

	/**
	 * Save ZIP data to the user's downloads folder
	 */
	function saveZipToDownloads(zipData: Uint8Array, packageName: string): void {
		// Copy to a new ArrayBuffer to avoid TypeScript SharedArrayBuffer issues
		const copy = new Uint8Array(zipData);
		const blob = new Blob([copy], { type: 'application/zip' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${packageName}.zip`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	}

	/**
	 * Handle importing a ZIP file from the user's device
	 */
	async function handleFileImport(event: Event): Promise<void> {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;

		isImporting = true;
		downloadProgress = { phase: 'extracting', progress: 0, message: 'Reading file...' };

		try {
			// Read file as ArrayBuffer
			const arrayBuffer = await file.arrayBuffer();
			const zipData = new Uint8Array(arrayBuffer);

			// Try to extract metadata from the ZIP
			const metadata = await getPackageMetadata(zipData);
			const packageName = metadata?.name as string || file.name.replace('.zip', '');
			const packageId = metadata?.id as string || `imported-${Date.now()}`;

			downloadProgress = { phase: 'extracting', progress: 0, message: 'Extracting tiles...' };

			// Extract tiles to IndexedDB
			const tileCount = await extractAndStoreTiles(zipData, (progress: ZipExtractionProgress) => {
				const pct = progress.total > 0 ? Math.round((progress.extracted / progress.total) * 100) : 0;
				downloadProgress = {
					phase: 'extracting',
					progress: pct,
					message: `Extracting tiles... ${progress.extracted}/${progress.total}`
				};
			});

			// Save package metadata to IndexedDB
			const db = await getDB();
			const downloadedPkg: DownloadedPackage = {
				id: packageId,
				name: packageName,
				projectId: projectId,
				downloadedAt: new Date().toISOString(),
				tileCount,
				fileSizeBytes: zipData.length,
				status: 'ready'
			};
			await db.put('packages', downloadedPkg);

			downloadProgress = { phase: 'complete', progress: 100, message: `Imported ${tileCount} tiles` };
			downloadedPackageIds = new Set([...downloadedPackageIds, packageId]);

			// Signal download complete
			signalDownloadComplete();
			onDownloadComplete?.();

		} catch (err) {
			console.error('Import failed:', err);
			downloadProgress = {
				phase: 'error',
				progress: 0,
				message: err instanceof Error ? err.message : 'Import failed'
			};
		} finally {
			isImporting = false;
			// Reset file input
			if (fileInput) fileInput.value = '';

			// Clear progress after a delay
			setTimeout(() => {
				if (downloadProgress?.phase === 'complete') {
					downloadProgress = null;
				}
			}, 2000);
		}
	}

	async function handleDownload(pkg: OfflinePackage) {
		if (!pkg.archive_file) {
			downloadProgress = { phase: 'error', progress: 0, message: 'Package has no archive file' };
			return;
		}

		downloadingPackageId = pkg.id;
		downloadProgress = { phase: 'fetching', progress: 0, message: 'Downloading package...' };

		try {
			const pb = getPocketBase();

			// Get a file token for the protected archive file
			const token = await pb.files.getToken();
			const archiveUrl = pb.files.getURL(pkg, pkg.archive_file, { token });

			// Fetch the ZIP file
			const response = await fetch(archiveUrl);
			if (!response.ok) {
				throw new Error(`Download failed: ${response.status}`);
			}

			const contentLength = response.headers.get('content-length');
			const totalSize = contentLength ? parseInt(contentLength, 10) : 0;

			// Read the response as a stream for progress tracking
			const reader = response.body?.getReader();
			if (!reader) {
				throw new Error('Failed to read response');
			}

			const chunks: Uint8Array[] = [];
			let receivedLength = 0;

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				chunks.push(value);
				receivedLength += value.length;

				if (totalSize > 0) {
					const progress = Math.round((receivedLength / totalSize) * 100);
					downloadProgress = {
						phase: 'fetching',
						progress,
						message: `Downloading... ${formatFileSize(receivedLength)} / ${formatFileSize(totalSize)}`
					};
				}
			}

			// Combine chunks into a single array
			const zipData = new Uint8Array(receivedLength);
			let position = 0;
			for (const chunk of chunks) {
				zipData.set(chunk, position);
				position += chunk.length;
			}

			// Save ZIP to user's downloads folder for offline import later
			downloadProgress = { phase: 'fetching', progress: 100, message: 'Saving to downloads...' };
			saveZipToDownloads(zipData, pkg.name);

			// Extract tiles
			downloadProgress = { phase: 'extracting', progress: 0, message: 'Extracting tiles...' };

			const tileCount = await extractAndStoreTiles(zipData, (progress: ZipExtractionProgress) => {
				// Scale progress to 0-50% for tile extraction
				const pct = progress.total > 0 ? Math.round((progress.extracted / progress.total) * 50) : 0;
				downloadProgress = {
					phase: 'extracting',
					progress: pct,
					message: `Extracting tiles... ${progress.extracted}/${progress.total}`
				};
			});

			// Download project data (markers, workflows, etc.) for the package region
			await downloadPackageData(pkg);

			// Save package metadata to IndexedDB
			const db = await getDB();
			const downloadedPkg: DownloadedPackage = {
				id: pkg.id,
				name: pkg.name,
				projectId: pkg.project_id,
				downloadedAt: new Date().toISOString(),
				tileCount,
				fileSizeBytes: receivedLength,
				status: 'ready'
			};
			await db.put('packages', downloadedPkg);

			downloadProgress = { phase: 'complete', progress: 100, message: 'Package ready for offline use' };
			downloadedPackageIds = new Set([...downloadedPackageIds, pkg.id]);

			// Signal download complete
			signalDownloadComplete();
			onDownloadComplete?.();

		} catch (err) {
			console.error('Download failed:', err);
			downloadProgress = {
				phase: 'error',
				progress: 0,
				message: err instanceof Error ? err.message : 'Download failed'
			};
		} finally {
			// Clear downloading state after a delay
			setTimeout(() => {
				if (downloadProgress?.phase === 'complete') {
					downloadingPackageId = null;
					downloadProgress = null;
				}
			}, 2000);
		}
	}

	function handleClose() {
		if ((downloadingPackageId || isImporting) && downloadProgress?.phase !== 'complete' && downloadProgress?.phase !== 'error') {
			// Don't close while downloading or importing
			return;
		}
		open = false;
		onClose?.();
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2">
				<Package class="h-5 w-5" />
				Offline Packages
			</Dialog.Title>
			<Dialog.Description>
				Select a package to download for offline use
			</Dialog.Description>
		</Dialog.Header>

		<div class="py-4">
			{#if isLoading}
				<div class="flex items-center justify-center py-8">
					<Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
				</div>
			{:else if loadError}
				<div class="flex flex-col items-center justify-center py-8 text-center">
					<AlertCircle class="h-8 w-8 text-destructive mb-2" />
					<p class="text-sm text-destructive">{loadError}</p>
					<Button variant="outline" size="sm" class="mt-4" onclick={loadPackages}>
						Try Again
					</Button>
				</div>
			{:else if packages.length === 0}
				<div class="flex flex-col items-center justify-center py-8 text-center">
					<Package class="h-8 w-8 text-muted-foreground mb-2" />
					<p class="text-sm text-muted-foreground">No packages available</p>
					<p class="text-xs text-muted-foreground mt-1">
						Ask your project admin to create an offline package
					</p>
				</div>
			{:else}
				<div class="space-y-3">
					{#each packages as pkg}
						{@const isDownloading = downloadingPackageId === pkg.id}
						{@const isDownloaded = downloadedPackageIds.has(pkg.id)}

						<div
							class="rounded-lg border p-3 transition-colors"
							class:bg-green-50={isDownloaded}
							class:dark:bg-green-950={isDownloaded}
						>
							<div class="flex items-start justify-between gap-3">
								<div class="flex-1 min-w-0">
									<div class="font-medium truncate">{pkg.name}</div>
									<div class="text-xs text-muted-foreground mt-1 space-y-0.5">
										<div>Zoom: {pkg.zoom_min}-{pkg.zoom_max}</div>
										<div>
											{pkg.tile_count?.toLocaleString() ?? '?'} tiles,
											{formatFileSize(pkg.file_size_bytes)}
										</div>
									</div>
								</div>

								<div class="shrink-0">
									{#if isDownloaded && !isDownloading}
										<Badge variant="outline" class="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
											<CheckCircle class="h-3 w-3 mr-1" />
											Downloaded
										</Badge>
									{:else if isDownloading}
										<Badge variant="secondary">
											<Loader2 class="h-3 w-3 mr-1 animate-spin" />
											{downloadProgress?.phase === 'fetching' ? 'Downloading' : 'Extracting'}
										</Badge>
									{:else}
										<Button
											variant="outline"
											size="sm"
											onclick={() => handleDownload(pkg)}
											disabled={!!downloadingPackageId}
										>
											<Download class="h-4 w-4 mr-1" />
											Download
										</Button>
									{/if}
								</div>
							</div>

							{#if isDownloading && downloadProgress}
								<div class="mt-3">
									<Progress value={downloadProgress.progress} class="h-2" />
									<p class="text-xs text-muted-foreground mt-1">
										{downloadProgress.message}
									</p>
								</div>
							{/if}

							{#if isDownloading && downloadProgress?.phase === 'error'}
								<div class="mt-2 text-xs text-destructive">
									{downloadProgress.message}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			<!-- Import from file section -->
			<div class="mt-4 pt-4 border-t">
				<p class="text-sm text-muted-foreground mb-3">
					Have a previously downloaded package? Import it here:
				</p>
				<input
					type="file"
					accept=".zip"
					class="hidden"
					bind:this={fileInput}
					onchange={handleFileImport}
				/>
				<Button
					variant="outline"
					size="sm"
					class="w-full"
					onclick={() => fileInput?.click()}
					disabled={isImporting || !!downloadingPackageId}
				>
					{#if isImporting}
						<Loader2 class="h-4 w-4 mr-2 animate-spin" />
						Importing...
					{:else}
						<Upload class="h-4 w-4 mr-2" />
						Import Package from File
					{/if}
				</Button>

				{#if isImporting && downloadProgress}
					<div class="mt-3">
						<Progress value={downloadProgress.progress} class="h-2" />
						<p class="text-xs text-muted-foreground mt-1">
							{downloadProgress.message}
						</p>
					</div>
				{/if}
			</div>
		</div>

		<Dialog.Footer>
			<Button
				variant="outline"
				onclick={handleClose}
				disabled={(downloadingPackageId !== null || isImporting) && downloadProgress?.phase !== 'complete' && downloadProgress?.phase !== 'error'}
			>
				{(downloadingPackageId || isImporting) && downloadProgress?.phase !== 'complete' && downloadProgress?.phase !== 'error'
					? (isImporting ? 'Importing...' : 'Downloading...')
					: 'Close'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
