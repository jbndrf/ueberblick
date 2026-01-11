<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Progress } from '$lib/components/ui/progress';
	import { Badge } from '$lib/components/ui/badge';
	import {
		Map,
		Plus,
		Link,
		Globe,
		Loader2,
		Check,
		Layers,
		Upload,
		FileArchive,
		FileJson,
		AlertCircle
	} from 'lucide-svelte';
	import { BaseTable, type BaseColumnConfig } from '$lib/components/admin/base-table';
	import type { MapSource, TileSourceConfig, WmsSourceConfig } from '$lib/types/map-sources';
	import { PRESET_SOURCES } from '$lib/types/map-sources';

	let { data } = $props();

	// Dialog state
	let showAddDialog = $state(false);
	let showDeleteDialog = $state(false);
	let selectedSource = $state<MapSource | null>(null);
	let activeTab = $state('upload');

	// Upload state
	let uploadFile = $state<File | null>(null);
	let uploadName = $state('');
	let uploadFormat = $state<'png' | 'jpg' | 'webp'>('png');
	let isUploading = $state(false);
	let uploadProgress = $state(0);
	let processingSourceId = $state<string | null>(null);
	let pollInterval = $state<ReturnType<typeof setInterval> | null>(null);

	// Tile source state
	let tileName = $state('');
	let tileUrl = $state('');
	let tileAttribution = $state('');
	let isAddingTile = $state(false);

	// WMS source state
	let wmsName = $state('');
	let wmsUrl = $state('');
	let wmsLayers = $state('');
	let wmsAttribution = $state('');
	let wmsFormat = $state('image/png');
	let wmsTransparent = $state(true);
	let wmsVersion = $state('1.1.1');
	let isAddingWms = $state(false);

	// GeoJSON source state
	let geojsonName = $state('');
	let geojsonUrl = $state('');
	let geojsonData = $state('');
	let geojsonAttribution = $state('');
	let isAddingGeojson = $state(false);

	// Helper to get config value safely
	function getConfigValue<T>(source: MapSource, key: string): T | undefined {
		const config = source.config as Record<string, unknown> | null;
		return config?.[key] as T | undefined;
	}

	// File input handling
	function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			uploadFile = file;
			if (!uploadName) {
				uploadName = file.name.replace(/\.zip$/i, '');
			}
		}
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file && file.name.endsWith('.zip')) {
			uploadFile = file;
			if (!uploadName) {
				uploadName = file.name.replace(/\.zip$/i, '');
			}
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
	}

	// Upload handling
	async function handleUpload() {
		if (!uploadFile || !uploadName.trim()) {
			toast.error('Please provide a name and select a ZIP file');
			return;
		}

		isUploading = true;
		uploadProgress = 0;

		try {
			const formData = new FormData();
			formData.append('name', uploadName.trim());
			formData.append('tile_format', uploadFormat);
			formData.append('file', uploadFile);

			const response = await fetch('/api/map-sources/upload', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.message || 'Upload failed');
			}

			const result = await response.json();
			processingSourceId = result.id;

			toast.success('Upload complete, processing tiles...');
			startPolling(result.id);

			uploadFile = null;
			uploadName = '';
		} catch (err) {
			console.error('Upload error:', err);
			toast.error(err instanceof Error ? err.message : 'Upload failed');
			isUploading = false;
		}
	}

	function startPolling(sourceId: string) {
		if (pollInterval) {
			clearInterval(pollInterval);
		}

		pollInterval = setInterval(async () => {
			try {
				const response = await fetch(`/api/map-sources/${sourceId}/status`);
				if (!response.ok) throw new Error('Failed to get status');

				const status = await response.json();
				uploadProgress = status.progress || 0;

				if (status.status === 'completed') {
					stopPolling();
					toast.success(`Processing complete! ${status.tile_count} tiles extracted.`);
					isUploading = false;
					processingSourceId = null;
					showAddDialog = false;
					invalidateAll();
				} else if (status.status === 'failed') {
					stopPolling();
					toast.error(status.error_message || 'Processing failed');
					isUploading = false;
					processingSourceId = null;
					invalidateAll();
				}
			} catch (err) {
				console.error('Polling error:', err);
			}
		}, 2000);
	}

	function stopPolling() {
		if (pollInterval) {
			clearInterval(pollInterval);
			pollInterval = null;
		}
	}

	$effect(() => {
		return () => stopPolling();
	});

	// Tile source handling
	async function handleAddTile() {
		if (!tileName.trim() || !tileUrl.trim()) {
			toast.error('Please provide a name and URL');
			return;
		}

		isAddingTile = true;

		const formData = new FormData();
		formData.append('name', tileName.trim());
		formData.append('url', tileUrl.trim());
		formData.append('attribution', tileAttribution.trim());

		try {
			const response = await fetch('?/addTile', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();
			if (result.type === 'success') {
				toast.success('Tile source added');
				showAddDialog = false;
				tileName = '';
				tileUrl = '';
				tileAttribution = '';
				invalidateAll();
			} else {
				toast.error(result.data?.message || 'Failed to add source');
			}
		} catch {
			toast.error('Failed to add source');
		} finally {
			isAddingTile = false;
		}
	}

	// WMS source handling
	async function handleAddWms() {
		if (!wmsName.trim() || !wmsUrl.trim() || !wmsLayers.trim()) {
			toast.error('Please provide name, URL, and layers');
			return;
		}

		isAddingWms = true;

		const formData = new FormData();
		formData.append('name', wmsName.trim());
		formData.append('url', wmsUrl.trim());
		formData.append('layers', wmsLayers.trim());
		formData.append('attribution', wmsAttribution.trim());
		formData.append('format', wmsFormat);
		formData.append('transparent', String(wmsTransparent));
		formData.append('version', wmsVersion);

		try {
			const response = await fetch('?/addWms', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();
			if (result.type === 'success') {
				toast.success('WMS source added');
				showAddDialog = false;
				wmsName = '';
				wmsUrl = '';
				wmsLayers = '';
				wmsAttribution = '';
				wmsFormat = 'image/png';
				wmsTransparent = true;
				wmsVersion = '1.1.1';
				invalidateAll();
			} else {
				toast.error(result.data?.message || 'Failed to add source');
			}
		} catch {
			toast.error('Failed to add source');
		} finally {
			isAddingWms = false;
		}
	}

	// GeoJSON source handling
	async function handleAddGeojson() {
		if (!geojsonName.trim()) {
			toast.error('Please provide a name');
			return;
		}

		if (!geojsonUrl.trim() && !geojsonData.trim()) {
			toast.error('Please provide either a URL or GeoJSON data');
			return;
		}

		isAddingGeojson = true;

		const formData = new FormData();
		formData.append('name', geojsonName.trim());
		formData.append('url', geojsonUrl.trim());
		formData.append('attribution', geojsonAttribution.trim());
		formData.append('data', geojsonData.trim());

		try {
			const response = await fetch('?/addGeojson', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();
			if (result.type === 'success') {
				toast.success('GeoJSON source added');
				showAddDialog = false;
				geojsonName = '';
				geojsonUrl = '';
				geojsonData = '';
				geojsonAttribution = '';
				invalidateAll();
			} else {
				toast.error(result.data?.message || 'Failed to add source');
			}
		} catch {
			toast.error('Failed to add source');
		} finally {
			isAddingGeojson = false;
		}
	}

	// Preset handling
	async function handleAddPreset(preset: (typeof PRESET_SOURCES)[0]) {
		const formData = new FormData();
		formData.append('preset_id', preset.id);

		try {
			const response = await fetch('?/addPreset', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();
			if (result.type === 'success') {
				toast.success(`${preset.name} added`);
				invalidateAll();
			} else {
				toast.error(result.data?.message || 'Failed to add preset');
			}
		} catch {
			toast.error('Failed to add preset');
		}
	}

	// Check if preset is already added
	function isPresetAdded(presetUrl: string): boolean {
		return data.mapSources.some((s) => s.url === presetUrl);
	}

	// Delete handling
	function openDeleteDialog(source: MapSource) {
		selectedSource = source;
		showDeleteDialog = true;
	}

	async function handleDelete() {
		if (!selectedSource) return;

		const formData = new FormData();
		formData.append('id', selectedSource.id);

		try {
			const response = await fetch('?/delete', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();
			if (result.type === 'success') {
				toast.success('Source deleted');
				showDeleteDialog = false;
				selectedSource = null;
				invalidateAll();
			} else {
				toast.error(result.data?.message || 'Failed to delete source');
			}
		} catch {
			toast.error('Failed to delete source');
		}
	}

	// Reset dialog state when opening
	function openAddDialog() {
		uploadFile = null;
		uploadName = '';
		tileName = '';
		tileUrl = '';
		tileAttribution = '';
		wmsName = '';
		wmsUrl = '';
		wmsLayers = '';
		wmsAttribution = '';
		geojsonName = '';
		geojsonUrl = '';
		geojsonData = '';
		geojsonAttribution = '';
		activeTab = 'upload';
		showAddDialog = true;
	}

	// Table columns
	const columns: BaseColumnConfig<MapSource>[] = [
		{
			id: 'name',
			header: 'Name',
			accessorKey: 'name',
			fieldType: 'text',
			capabilities: { sortable: true, filterable: true }
		},
		{
			id: 'source_type',
			header: 'Type',
			accessorFn: (row) => {
				switch (row.source_type) {
					case 'tile':
						return 'Tile';
					case 'wms':
						return 'WMS';
					case 'uploaded':
						return 'Uploaded';
					case 'preset':
						return 'Preset';
					case 'geojson':
						return 'GeoJSON';
					default:
						return row.source_type;
				}
			},
			fieldType: 'text',
			capabilities: { sortable: true, filterable: true }
		},
		{
			id: 'status',
			header: 'Status',
			accessorFn: (row) => {
				if (row.source_type !== 'uploaded') return 'Ready';
				if (row.status === 'completed') return 'Ready';
				if (row.status === 'processing') return `Processing (${row.progress}%)`;
				if (row.status === 'failed') return 'Failed';
				return row.status || 'Ready';
			},
			fieldType: 'text',
			capabilities: { sortable: true }
		},
		{
			id: 'tile_count',
			header: 'Tiles',
			accessorFn: (row) => {
				if (row.source_type !== 'uploaded') return '-';
				return row.tile_count?.toLocaleString() || '-';
			},
			fieldType: 'text',
			capabilities: { sortable: true }
		},
		{
			id: 'zoom_range',
			header: 'Zoom',
			accessorFn: (row) => {
				const minZoom = getConfigValue<number>(row, 'detected_min_zoom');
				const maxZoom = getConfigValue<number>(row, 'detected_max_zoom');
				if (minZoom !== undefined && maxZoom !== undefined) {
					return `${minZoom}-${maxZoom}`;
				}
				return '-';
			},
			fieldType: 'text',
			capabilities: { sortable: false }
		},
		{
			id: 'created',
			header: 'Created',
			accessorFn: (row) => new Date(row.created).toLocaleDateString(),
			fieldType: 'text',
			capabilities: { sortable: true }
		}
	];

	function getSourceIcon(type: string) {
		switch (type) {
			case 'wms':
				return Layers;
			case 'tile':
				return Link;
			case 'uploaded':
				return FileArchive;
			case 'preset':
				return Globe;
			case 'geojson':
				return FileJson;
			default:
				return Map;
		}
	}
</script>

<div class="flex flex-col gap-6 min-w-0 w-full">
	<!-- Page Header -->
	<div class="flex items-start justify-between gap-6">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Map Sources</h1>
			<p class="text-muted-foreground">
				Manage tile, WMS, and GeoJSON sources available across all your projects
			</p>
		</div>
		<Button onclick={openAddDialog}>
			<Plus class="mr-2 h-4 w-4" />
			Add Source
		</Button>
	</div>

	<!-- Sources List -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				<Map class="h-5 w-5" />
				Your Map Sources
			</Card.Title>
			<Card.Description>These sources can be used as layers in any of your projects</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.mapSources.length === 0}
				<div class="flex flex-col items-center justify-center py-12 text-center">
					<Map class="h-12 w-12 text-muted-foreground mb-4" />
					<p class="text-lg font-medium">No map sources yet</p>
					<p class="text-muted-foreground mb-4">
						Add a preset, tile URL, WMS, GeoJSON, or upload custom tiles
					</p>
					<Button onclick={openAddDialog}>
						<Plus class="mr-2 h-4 w-4" />
						Add Source
					</Button>
				</div>
			{:else}
				<BaseTable
					data={data.mapSources}
					{columns}
					getRowId={(row) => row.id}
					emptyMessage="No sources"
					showToolbar={true}
					rowActions={{
						header: 'Actions',
						onDelete: openDeleteDialog
					}}
				/>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- Quick Add Presets -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Quick Add Presets</Card.Title>
			<Card.Description>Common tile sources you can add with one click</Card.Description>
		</Card.Header>
		<Card.Content>
			<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
				{#each PRESET_SOURCES as preset}
					{@const added = isPresetAdded(preset.url)}
					<Button
						variant={added ? 'secondary' : 'outline'}
						class="h-auto py-3 flex flex-col items-center gap-1"
						onclick={() => !added && handleAddPreset(preset)}
						disabled={added}
					>
						{#if added}
							<Check class="h-4 w-4 text-green-600" />
						{:else}
							<Globe class="h-4 w-4" />
						{/if}
						<span class="text-xs font-medium">{preset.name}</span>
					</Button>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>
</div>

<!-- Add Source Dialog -->
<Dialog.Root bind:open={showAddDialog}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Add Map Source</Dialog.Title>
			<Dialog.Description>Upload tiles or add a URL-based source</Dialog.Description>
		</Dialog.Header>

		{#if isUploading && processingSourceId}
			<!-- Processing state -->
			<div class="space-y-4 py-4">
				<div class="flex items-center gap-3">
					<Loader2 class="h-5 w-5 animate-spin text-primary" />
					<span>Processing tiles...</span>
				</div>
				<Progress value={uploadProgress} class="w-full" />
				<p class="text-sm text-muted-foreground text-center">{uploadProgress}% complete</p>
			</div>
		{:else}
			<Tabs.Root bind:value={activeTab} class="w-full">
				<Tabs.List class="grid w-full grid-cols-4">
					<Tabs.Trigger value="upload">
						<Upload class="mr-1 h-3 w-3" />
						Upload
					</Tabs.Trigger>
					<Tabs.Trigger value="tile">
						<Link class="mr-1 h-3 w-3" />
						Tile
					</Tabs.Trigger>
					<Tabs.Trigger value="wms">
						<Layers class="mr-1 h-3 w-3" />
						WMS
					</Tabs.Trigger>
					<Tabs.Trigger value="geojson">
						<FileJson class="mr-1 h-3 w-3" />
						GeoJSON
					</Tabs.Trigger>
				</Tabs.List>

				<!-- Upload Tab -->
				<Tabs.Content value="upload" class="space-y-4 pt-4">
					<div class="space-y-2">
						<Label for="upload_name">Name</Label>
						<Input id="upload_name" bind:value={uploadName} placeholder="My Custom Tiles" required />
					</div>

					<div class="space-y-2">
						<Label for="tile_format">Tile Format</Label>
						<select
							id="tile_format"
							bind:value={uploadFormat}
							class="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
						>
							<option value="png">PNG</option>
							<option value="jpg">JPEG</option>
							<option value="webp">WebP</option>
						</select>
					</div>

					<div class="space-y-2">
						<Label>ZIP File</Label>
						<div
							class="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
							ondrop={handleDrop}
							ondragover={handleDragOver}
							role="button"
							tabindex="0"
							onclick={() => document.getElementById('file_input')?.click()}
							onkeydown={(e) => e.key === 'Enter' && document.getElementById('file_input')?.click()}
						>
							{#if uploadFile}
								<div class="flex items-center justify-center gap-2">
									<FileArchive class="h-8 w-8 text-primary" />
									<div class="text-left">
										<p class="font-medium">{uploadFile.name}</p>
										<p class="text-sm text-muted-foreground">
											{(uploadFile.size / 1024 / 1024).toFixed(2)} MB
										</p>
									</div>
								</div>
							{:else}
								<Upload class="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
								<p class="text-sm text-muted-foreground">Drag and drop, or click to browse</p>
							{/if}
						</div>
						<input
							id="file_input"
							type="file"
							accept=".zip,application/zip"
							class="hidden"
							onchange={handleFileSelect}
						/>
					</div>

					<div class="text-xs text-muted-foreground">Expected: z/x/y.png (e.g., 10/512/341.png)</div>

					<div class="flex justify-end gap-2 pt-2">
						<Button variant="outline" onclick={() => (showAddDialog = false)}>Cancel</Button>
						<Button onclick={handleUpload} disabled={!uploadFile || !uploadName.trim() || isUploading}>
							{#if isUploading}
								<Loader2 class="mr-2 h-4 w-4 animate-spin" />
								Uploading...
							{:else}
								<Upload class="mr-2 h-4 w-4" />
								Upload
							{/if}
						</Button>
					</div>
				</Tabs.Content>

				<!-- Tile URL Tab -->
				<Tabs.Content value="tile" class="space-y-4 pt-4">
					<div class="space-y-2">
						<Label for="tile_name">Name</Label>
						<Input id="tile_name" bind:value={tileName} placeholder="My Tile Server" required />
					</div>

					<div class="space-y-2">
						<Label for="tile_url">Tile URL</Label>
						<Input
							id="tile_url"
							bind:value={tileUrl}
							placeholder={'https://tiles.example.com/{z}/{x}/{y}.png'}
							required
						/>
						<p class="text-xs text-muted-foreground">
							Use &#123;z&#125;, &#123;x&#125;, &#123;y&#125; placeholders for coordinates
						</p>
					</div>

					<div class="space-y-2">
						<Label for="tile_attribution">Attribution (optional)</Label>
						<Input id="tile_attribution" bind:value={tileAttribution} placeholder="Data provider" />
					</div>

					<div class="flex justify-end gap-2 pt-2">
						<Button variant="outline" onclick={() => (showAddDialog = false)}>Cancel</Button>
						<Button onclick={handleAddTile} disabled={!tileName.trim() || !tileUrl.trim() || isAddingTile}>
							{#if isAddingTile}
								<Loader2 class="mr-2 h-4 w-4 animate-spin" />
								Adding...
							{:else}
								<Plus class="mr-2 h-4 w-4" />
								Add Source
							{/if}
						</Button>
					</div>
				</Tabs.Content>

				<!-- WMS Tab -->
				<Tabs.Content value="wms" class="space-y-4 pt-4">
					<div class="space-y-2">
						<Label for="wms_name">Name</Label>
						<Input id="wms_name" bind:value={wmsName} placeholder="My WMS Server" required />
					</div>

					<div class="space-y-2">
						<Label for="wms_url">WMS URL</Label>
						<Input
							id="wms_url"
							bind:value={wmsUrl}
							placeholder="https://wms.example.com/service"
							required
						/>
					</div>

					<div class="space-y-2">
						<Label for="wms_layers">Layers</Label>
						<Input id="wms_layers" bind:value={wmsLayers} placeholder="layer1,layer2" required />
						<p class="text-xs text-muted-foreground">Comma-separated WMS layer names</p>
					</div>

					<div class="grid grid-cols-2 gap-4">
						<div class="space-y-2">
							<Label for="wms_format">Format</Label>
							<select
								id="wms_format"
								bind:value={wmsFormat}
								class="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
							>
								<option value="image/png">PNG</option>
								<option value="image/jpeg">JPEG</option>
								<option value="image/gif">GIF</option>
							</select>
						</div>

						<div class="space-y-2">
							<Label for="wms_version">Version</Label>
							<select
								id="wms_version"
								bind:value={wmsVersion}
								class="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
							>
								<option value="1.1.1">1.1.1</option>
								<option value="1.3.0">1.3.0</option>
							</select>
						</div>
					</div>

					<div class="flex items-center gap-2">
						<Checkbox id="wms_transparent" bind:checked={wmsTransparent} />
						<Label for="wms_transparent" class="text-sm font-normal">Transparent background</Label>
					</div>

					<div class="space-y-2">
						<Label for="wms_attribution">Attribution (optional)</Label>
						<Input id="wms_attribution" bind:value={wmsAttribution} placeholder="Data provider" />
					</div>

					<div class="flex justify-end gap-2 pt-2">
						<Button variant="outline" onclick={() => (showAddDialog = false)}>Cancel</Button>
						<Button
							onclick={handleAddWms}
							disabled={!wmsName.trim() || !wmsUrl.trim() || !wmsLayers.trim() || isAddingWms}
						>
							{#if isAddingWms}
								<Loader2 class="mr-2 h-4 w-4 animate-spin" />
								Adding...
							{:else}
								<Plus class="mr-2 h-4 w-4" />
								Add Source
							{/if}
						</Button>
					</div>
				</Tabs.Content>

				<!-- GeoJSON Tab -->
				<Tabs.Content value="geojson" class="space-y-4 pt-4">
					<div class="space-y-2">
						<Label for="geojson_name">Name</Label>
						<Input id="geojson_name" bind:value={geojsonName} placeholder="My GeoJSON Layer" required />
					</div>

					<div class="space-y-2">
						<Label for="geojson_url">URL (optional)</Label>
						<Input
							id="geojson_url"
							bind:value={geojsonUrl}
							placeholder="https://example.com/data.geojson"
						/>
						<p class="text-xs text-muted-foreground">URL to a GeoJSON file</p>
					</div>

					<div class="space-y-2">
						<Label for="geojson_data">Or paste GeoJSON data</Label>
						<Textarea
							id="geojson_data"
							bind:value={geojsonData}
							placeholder={'{"type": "FeatureCollection", "features": [...]}'}
							rows={6}
							class="font-mono text-xs"
						/>
					</div>

					<div class="space-y-2">
						<Label for="geojson_attribution">Attribution (optional)</Label>
						<Input id="geojson_attribution" bind:value={geojsonAttribution} placeholder="Data provider" />
					</div>

					<div class="flex justify-end gap-2 pt-2">
						<Button variant="outline" onclick={() => (showAddDialog = false)}>Cancel</Button>
						<Button
							onclick={handleAddGeojson}
							disabled={!geojsonName.trim() || (!geojsonUrl.trim() && !geojsonData.trim()) || isAddingGeojson}
						>
							{#if isAddingGeojson}
								<Loader2 class="mr-2 h-4 w-4 animate-spin" />
								Adding...
							{:else}
								<Plus class="mr-2 h-4 w-4" />
								Add Source
							{/if}
						</Button>
					</div>
				</Tabs.Content>
			</Tabs.Root>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<!-- Delete Confirmation Dialog -->
<AlertDialog.Root bind:open={showDeleteDialog}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete Source</AlertDialog.Title>
			<AlertDialog.Description>
				Are you sure you want to delete this source? This may affect layers using it.
				{#if selectedSource?.source_type === 'uploaded'}
					This will also remove all tile files.
				{/if}
				{#if selectedSource}
					<strong class="block mt-2">{selectedSource.name}</strong>
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={handleDelete}>Delete</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
