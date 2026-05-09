<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Badge } from '$lib/components/ui/badge';
	import { Map, Plus, Star, Loader2, Upload } from '@lucide/svelte';
	import { BaseTable, type BaseColumnConfig } from '$lib/components/admin/base-table';
	import { PRESET_SOURCES, type MapLayer, type MapLayerConfig } from '$lib/types/map-layer';
	import { chunkedUpload } from '$lib/upload/chunked-uploader';
	import SettingsSection from '../SettingsSection.svelte';

	let { data } = $props();

	let showAddLayerDialog = $state(false);
	let addLayerMode = $state<'preset' | 'tile' | 'wms' | 'upload'>('preset');
	let showDeleteLayerDialog = $state(false);
	let selectedLayer = $state<MapLayer | null>(null);
	let isSubmitting = $state(false);

	type UploadProgress =
		| { phase: 'uploading'; loaded: number; total: number; percent: number }
		| { phase: 'processing'; status: string; percent: number };
	let uploadFile = $state<File | null>(null);
	let uploadTileFormat = $state<'png' | 'jpg' | 'webp'>('png');
	let uploadName = $state('');
	let isUploading = $state(false);
	let uploadLayerId = $state<string | null>(null);
	let uploadProgress = $state<UploadProgress | null>(null);

	let tileUrlName = $state('');
	let tileUrlUrl = $state('');
	let tileUrlAttribution = $state('');
	let tileUrlAsBase = $state(false);

	let wmsName = $state('');
	let wmsUrl = $state('');
	let wmsLayers = $state('');
	let wmsAttribution = $state('');
	let wmsFormat = $state('image/png');
	let wmsTransparent = $state(true);
	let wmsVersion = $state('1.1.1');
	let wmsAsBase = $state(false);

	const layerColumns = $derived.by((): BaseColumnConfig<MapLayer>[] => [
		{
			id: 'name',
			header: m.mapLayerName(),
			accessorKey: 'name',
			fieldType: 'text',
			capabilities: { sortable: true, filterable: true }
		},
		{
			id: 'source_type',
			header: m.mapSettingsColumnType?.() ?? 'Type',
			accessorFn: (row) => row.source_type.charAt(0).toUpperCase() + row.source_type.slice(1),
			fieldType: 'text',
			capabilities: { sortable: true, filterable: true }
		},
		{
			id: 'opacity',
			header: m.mapSettingsColumnOpacity?.() ?? 'Opacity',
			accessorFn: (row) => (row.config as MapLayerConfig)?.opacity ?? 1,
			fieldType: 'custom',
			capabilities: { sortable: false },
			cellRenderer: opacityCell
		},
		{
			id: 'visible_to_roles',
			header: m.mapSettingsColumnVisibleToRoles?.() ?? 'Visible to Roles',
			accessorFn: (row) => {
				if (!row.visible_to_roles || row.visible_to_roles.length === 0) return [];
				return row.visible_to_roles;
			},
			fieldType: 'array',
			capabilities: { editable: true, sortable: false, filterable: true },
			entityConfig: {
				getEntityId: (role) => role.id,
				getEntityName: (role) => role.name,
				getEntityDescription: (role) => role.description,
				availableEntities: data.roles,
				allowCreate: false
			},
			onUpdate: async (rowId: string, value: string[]) => {
				const formData = new FormData();
				formData.append('layerId', rowId);
				formData.append('roleIds', JSON.stringify(value));

				const response = await fetch('?/updateLayerRoles', {
					method: 'POST',
					body: formData
				});

				const result = await response.json();
				if (result.type === 'success') {
					await invalidateAll();
				} else {
					throw new Error(
						result.data?.message || (m.mapSettingsUpdateFailed?.() ?? 'Update failed')
					);
				}
			}
		},
		{
			id: 'layer_type',
			header: m.mapSettingsColumnBase?.() ?? 'Base',
			accessorFn: (row) => row.layer_type === 'base',
			fieldType: 'boolean',
			capabilities: { sortable: true, filterable: true }
		}
	]);

	async function handleAddPreset(presetId: string) {
		isSubmitting = true;
		try {
			const formData = new FormData();
			formData.append('preset_id', presetId);
			const hasBase = data.mapLayers.some((l: MapLayer) => l.layer_type === 'base');
			formData.append('layer_type', hasBase ? 'overlay' : 'base');

			const response = await fetch('?/addPreset', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();
			if (result.type === 'success') {
				toast.success(m.mapSettingsLayerAdded?.() ?? 'Layer added');
				showAddLayerDialog = false;
				invalidateAll();
			} else {
				toast.error(
					result.data?.message || (m.mapSettingsLayerAddError?.() ?? 'Failed to add layer')
				);
			}
		} catch {
			toast.error(m.mapSettingsLayerAddError?.() ?? 'Failed to add layer');
		} finally {
			isSubmitting = false;
		}
	}

	async function handleAddTile() {
		if (!tileUrlName.trim() || !tileUrlUrl.trim()) return;
		isSubmitting = true;
		try {
			const formData = new FormData();
			formData.append('name', tileUrlName);
			formData.append('url', tileUrlUrl);
			formData.append('attribution', tileUrlAttribution);
			formData.append('layer_type', tileUrlAsBase ? 'base' : 'overlay');

			const response = await fetch('?/addTile', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();
			if (result.type === 'success') {
				toast.success(m.mapSettingsTileLayerAdded?.() ?? 'Tile layer added');
				showAddLayerDialog = false;
				tileUrlName = '';
				tileUrlUrl = '';
				tileUrlAttribution = '';
				tileUrlAsBase = false;
				invalidateAll();
			} else {
				toast.error(
					result.data?.message || (m.mapSettingsLayerAddError?.() ?? 'Failed to add layer')
				);
			}
		} catch {
			toast.error(m.mapSettingsLayerAddError?.() ?? 'Failed to add layer');
		} finally {
			isSubmitting = false;
		}
	}

	async function handleAddWms() {
		if (!wmsName.trim() || !wmsUrl.trim() || !wmsLayers.trim()) return;
		isSubmitting = true;
		try {
			const formData = new FormData();
			formData.append('name', wmsName);
			formData.append('url', wmsUrl);
			formData.append('layers', wmsLayers);
			formData.append('attribution', wmsAttribution);
			formData.append('format', wmsFormat);
			formData.append('transparent', String(wmsTransparent));
			formData.append('version', wmsVersion);
			formData.append('layer_type', wmsAsBase ? 'base' : 'overlay');

			const response = await fetch('?/addWms', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();
			if (result.type === 'success') {
				toast.success(m.mapSettingsWmsLayerAdded?.() ?? 'WMS layer added');
				showAddLayerDialog = false;
				wmsName = '';
				wmsUrl = '';
				wmsLayers = '';
				wmsAttribution = '';
				wmsFormat = 'image/png';
				wmsTransparent = true;
				wmsVersion = '1.1.1';
				wmsAsBase = false;
				invalidateAll();
			} else {
				toast.error(
					result.data?.message || (m.mapSettingsLayerAddError?.() ?? 'Failed to add layer')
				);
			}
		} catch {
			toast.error(m.mapSettingsLayerAddError?.() ?? 'Failed to add layer');
		} finally {
			isSubmitting = false;
		}
	}

	async function handleUpload() {
		if (!uploadFile || !uploadName.trim()) return;
		isUploading = true;
		try {
			const { id: layerId } = await chunkedUpload({
				file: uploadFile,
				initUrl: '/api/map-layers/upload/init',
				initBody: {
					name: uploadName,
					tile_format: uploadTileFormat,
					project_id: data.project.id,
					layer_type: 'overlay'
				},
				idField: 'layerId',
				chunkUrl: (id, i) => `/api/map-layers/upload/${id}/chunk/${i}`,
				chunksUrl: (id) => `/api/map-layers/upload/${id}/chunks`,
				finalizeUrl: (id) => `/api/map-layers/upload/${id}/finalize`,
				onProgress: (p) => {
					uploadProgress = {
						phase: 'uploading',
						loaded: p.loaded ?? 0,
						total: p.total ?? 0,
						percent: p.percent
					};
				}
			});
			uploadLayerId = layerId;

			toast.success(
				m.mapSettingsUploadCompleteProcessing?.() ?? 'Upload complete, processing tiles...'
			);
			uploadProgress = { phase: 'processing', status: 'pending', percent: 0 };
			pollUploadStatus(layerId);
		} catch (err) {
			console.error('Upload error:', err);
			toast.error(
				err instanceof Error ? err.message : (m.mapSettingsUploadFailed?.() ?? 'Upload failed')
			);
			uploadProgress = null;
			isUploading = false;
		}
	}

	async function pollUploadStatus(layerId: string) {
		const poll = async () => {
			try {
				const response = await fetch(`/api/map-layers/${layerId}/status`);
				const result = await response.json();
				uploadProgress = {
					phase: 'processing',
					status: result.status,
					percent: result.progress ?? 0
				};

				if (result.status === 'completed') {
					toast.success(m.mapSettingsTileProcessingComplete?.() ?? 'Tile processing complete');
					uploadFile = null;
					uploadName = '';
					uploadLayerId = null;
					uploadProgress = null;
					isUploading = false;
					showAddLayerDialog = false;
					invalidateAll();
				} else if (result.status === 'failed') {
					toast.error(
						result.error_message || (m.mapSettingsProcessingFailed?.() ?? 'Processing failed')
					);
					uploadProgress = null;
					isUploading = false;
				} else {
					setTimeout(poll, 2000);
				}
			} catch {
				setTimeout(poll, 3000);
			}
		};
		poll();
	}

	function openDeleteLayerDialog(layer: MapLayer) {
		selectedLayer = layer;
		showDeleteLayerDialog = true;
	}

	async function handleDeleteLayer() {
		if (!selectedLayer) return;

		const formData = new FormData();
		formData.append('id', selectedLayer.id);

		try {
			const response = await fetch('?/deleteLayer', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();
			if (result.type === 'success') {
				toast.success(m.mapLayerDeleteSuccess());
				showDeleteLayerDialog = false;
				selectedLayer = null;
				invalidateAll();
			} else {
				toast.error(m.mapLayerDeleteError());
			}
		} catch {
			toast.error(m.mapLayerDeleteError());
		}
	}

	async function toggleLayerType(layer: MapLayer) {
		const formData = new FormData();
		formData.append('id', layer.id);

		try {
			const response = await fetch('?/toggleLayerType', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();
			if (result.type === 'success') {
				const newType = layer.layer_type === 'base' ? 'overlay' : 'base';
				toast.success(
					newType === 'base'
						? (m.mapSettingsLayerSetAsBase?.() ?? 'Layer set as base')
						: (m.mapSettingsLayerSetAsOverlay?.() ?? 'Layer set as overlay')
				);
				invalidateAll();
			} else {
				toast.error(m.mapSettingsLayerTypeUpdateError?.() ?? 'Failed to update layer type');
			}
		} catch {
			toast.error(m.mapSettingsLayerTypeUpdateError?.() ?? 'Failed to update layer type');
		}
	}

	async function handleOpacityChange(layerId: string, opacity: number) {
		try {
			const formData = new FormData();
			formData.append('layerId', layerId);
			formData.append('opacity', String(opacity));

			const response = await fetch('?/updateLayerOpacity', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();
			if (result.type === 'success') {
				await invalidateAll();
			} else {
				toast.error(result.data?.message || (m.mapSettingsUpdateFailed?.() ?? 'Update failed'));
			}
		} catch {
			toast.error(m.mapSettingsUpdateFailed?.() ?? 'Update failed');
		}
	}

	const addedPresetUrls = $derived(
		new Set(data.mapLayers.map((l: MapLayer) => l.url).filter(Boolean))
	);

	const baseLayers = $derived(data.mapLayers.filter((l: MapLayer) => l.layer_type === 'base'));
</script>

{#snippet opacityCell({
	value,
	row,
	isEditing
}: {
	value: number;
	row: MapLayer;
	isEditing?: boolean;
})}
	{@const pct = Math.round((value ?? 1) * 100)}
	{#if isEditing}
		<div class="flex items-center gap-2">
			<input
				type="range"
				min="0"
				max="100"
				step="1"
				value={pct}
				class="h-2 w-24 cursor-pointer accent-primary"
				oninput={(e) => {
					const el = e.currentTarget as HTMLInputElement;
					const label = el.nextElementSibling as HTMLSpanElement | null;
					if (label) label.textContent = `${el.value}%`;
				}}
				onchange={(e) => {
					const next = Number((e.currentTarget as HTMLInputElement).value) / 100;
					handleOpacityChange(row.id, next);
				}}
			/>
			<span class="w-10 text-xs text-muted-foreground tabular-nums">{pct}%</span>
		</div>
	{:else}
		<span class="text-sm">{pct}%</span>
	{/if}
{/snippet}

<SettingsSection
	name={m.mapLayersTitle?.() ?? 'Map Layers'}
	description={baseLayers.length > 0
		? `${m.mapSettingsBaseLayersLabel?.() ?? 'Base layers'}: ${baseLayers.map((l: MapLayer) => l.name).join(', ')}`
		: (m.mapSettingsNoBaseLayerConfigured?.() ??
			'No base layer configured - add a layer and mark it as base')}
>
	{#snippet actions()}
		<Button onclick={() => (showAddLayerDialog = true)}>
			<Plus class="mr-2 h-4 w-4" />
			{m.mapSettingsAddLayer?.() ?? 'Add Layer'}
		</Button>
	{/snippet}

	{#if data.mapLayers.length === 0}
		<div
			class="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center"
		>
			<Map class="mb-4 h-12 w-12 text-muted-foreground" />
			<p class="text-lg font-medium">{m.mapSettingsNoLayersYet?.() ?? 'No layers yet'}</p>
			<p class="mb-4 text-muted-foreground">
				{m.mapSettingsNoLayersDescription?.() ??
					'Add a preset, tile URL, WMS, or upload tiles to get started'}
			</p>
			<Button onclick={() => (showAddLayerDialog = true)}>
				<Plus class="mr-2 h-4 w-4" />
				{m.mapSettingsAddLayer?.() ?? 'Add Layer'}
			</Button>
		</div>
	{:else}
		<BaseTable
			data={data.mapLayers}
			columns={layerColumns}
			getRowId={(row) => row.id}
			emptyMessage={m.mapLayersEmpty?.() ?? 'No map layers configured'}
			emptySubMessage={m.mapLayersEmptyDescription?.() ??
				'Map layers will appear here once tile sets are processed'}
			showToolbar={true}
			showEditMode={true}
			editModeLabel={m.mapSettingsEditMode?.() ?? 'Edit mode'}
			rowActions={{
				header: m.mapSettingsActions?.() ?? 'Actions',
				onDelete: openDeleteLayerDialog,
				customActions: [
					{
						label: (row) =>
							row.layer_type === 'base'
								? (m.mapSettingsSetAsOverlay?.() ?? 'Set as Overlay')
								: (m.mapSettingsSetAsBase?.() ?? 'Set as Base'),
						icon: Star,
						onClick: toggleLayerType
					}
				]
			}}
		/>
	{/if}
</SettingsSection>

<!-- Add Layer Dialog -->
<Dialog.Root bind:open={showAddLayerDialog}>
	<Dialog.Content class="flex max-h-[90vh] max-w-2xl flex-col">
		<Dialog.Header class="shrink-0">
			<Dialog.Title>{m.mapSettingsAddMapLayerTitle?.() ?? 'Add Map Layer'}</Dialog.Title>
			<Dialog.Description>
				{m.mapSettingsAddMapLayerDescription?.() ?? 'Choose a preset, enter a URL, or upload tiles'}
			</Dialog.Description>
		</Dialog.Header>

		<Tabs.Root bind:value={addLayerMode} class="flex flex-1 flex-col overflow-hidden">
			<Tabs.List class="shrink-0">
				<Tabs.Trigger value="preset">{m.mapSettingsPresets?.() ?? 'Presets'}</Tabs.Trigger>
				<Tabs.Trigger value="tile">{m.mapSettingsTileUrl?.() ?? 'Tile URL'}</Tabs.Trigger>
				<Tabs.Trigger value="wms">{m.mapSettingsWms?.() ?? 'WMS'}</Tabs.Trigger>
				<Tabs.Trigger value="upload">
					<Upload class="mr-1 h-4 w-4" />
					{m.mapSettingsUpload?.() ?? 'Upload'}
				</Tabs.Trigger>
			</Tabs.List>

			<div class="flex-1 overflow-y-auto pt-4 pr-2">
				<Tabs.Content value="preset">
					<div class="grid gap-2">
						{#each PRESET_SOURCES as preset (preset.id)}
							<button
								class="flex w-full items-center justify-between rounded-md border p-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
								disabled={isSubmitting || addedPresetUrls.has(preset.url)}
								onclick={() => handleAddPreset(preset.id)}
							>
								<div>
									<div class="text-sm font-medium">{preset.name}</div>
									<div class="text-xs text-muted-foreground">
										{preset.sourceType === 'wms'
											? (m.mapSettingsWms?.() ?? 'WMS')
											: (m.mapSettingsTiles?.() ?? 'Tiles')} -- {m.mapSettingsZoomLabel?.() ??
											'Zoom'}
										{preset.minZoom ?? 0}-{preset.maxZoom ?? 19}
									</div>
								</div>
								{#if addedPresetUrls.has(preset.url)}
									<Badge variant="outline" class="text-xs"
										>{m.mapSettingsAdded?.() ?? 'Added'}</Badge
									>
								{:else}
									<Plus class="h-4 w-4 text-muted-foreground" />
								{/if}
							</button>
						{/each}
					</div>
				</Tabs.Content>

				<Tabs.Content value="tile">
					<div class="space-y-4">
						<div class="space-y-2">
							<Label for="tile_name">{m.mapSettingsFieldName?.() ?? 'Name'}</Label>
							<Input
								id="tile_name"
								bind:value={tileUrlName}
								placeholder={m.mapSettingsTileLayerPlaceholder?.() ?? 'My Tile Layer'}
								required
							/>
						</div>
						<div class="space-y-2">
							<Label for="tile_url">{m.mapSettingsTileUrlTemplate?.() ?? 'Tile URL Template'}</Label
							>
							<Input
								id="tile_url"
								bind:value={tileUrlUrl}
								placeholder={'https://example.com/{z}/{x}/{y}.png'}
								required
							/>
							<p class="text-xs text-muted-foreground">
								{m.mapSettingsTilePlaceholderHint?.() ?? 'URL must contain z, x and y placeholders'}
							</p>
						</div>
						<div class="space-y-2">
							<Label for="tile_attribution">
								{m.mapSettingsAttributionOptional?.() ?? 'Attribution (optional)'}
							</Label>
							<Input id="tile_attribution" bind:value={tileUrlAttribution} />
						</div>
						<div class="flex items-center space-x-2">
							<Switch id="tile_as_base" bind:checked={tileUrlAsBase} />
							<Label for="tile_as_base">
								{m.mapSettingsSetAsBaseLayer?.() ?? 'Set as base layer'}
							</Label>
						</div>
						<Button
							onclick={handleAddTile}
							disabled={isSubmitting || !tileUrlName.trim() || !tileUrlUrl.trim()}
						>
							{isSubmitting
								? (m.mapSettingsAdding?.() ?? 'Adding...')
								: (m.mapSettingsAddTileLayer?.() ?? 'Add Tile Layer')}
						</Button>
					</div>
				</Tabs.Content>

				<Tabs.Content value="wms">
					<div class="space-y-4">
						<div class="space-y-2">
							<Label for="wms_name">{m.mapSettingsFieldName?.() ?? 'Name'}</Label>
							<Input
								id="wms_name"
								bind:value={wmsName}
								placeholder={m.mapSettingsWmsLayerPlaceholder?.() ?? 'My WMS Layer'}
								required
							/>
						</div>
						<div class="space-y-2">
							<Label for="wms_url">{m.mapSettingsWmsUrl?.() ?? 'WMS URL'}</Label>
							<Input
								id="wms_url"
								bind:value={wmsUrl}
								placeholder="https://example.com/wms"
								required
							/>
						</div>
						<div class="space-y-2">
							<Label for="wms_layers">{m.mapSettingsLayers?.() ?? 'Layers'}</Label>
							<Input id="wms_layers" bind:value={wmsLayers} placeholder="layer_name" required />
						</div>
						<div class="grid grid-cols-2 gap-4">
							<div class="space-y-2">
								<Label for="wms_format">{m.mapSettingsFormat?.() ?? 'Format'}</Label>
								<Input id="wms_format" bind:value={wmsFormat} />
							</div>
							<div class="space-y-2">
								<Label for="wms_version">{m.mapSettingsVersion?.() ?? 'Version'}</Label>
								<Input id="wms_version" bind:value={wmsVersion} />
							</div>
						</div>
						<div class="space-y-2">
							<Label for="wms_attribution">
								{m.mapSettingsAttributionOptional?.() ?? 'Attribution (optional)'}
							</Label>
							<Input id="wms_attribution" bind:value={wmsAttribution} />
						</div>
						<div class="flex items-center gap-4">
							<div class="flex items-center space-x-2">
								<Switch id="wms_transparent" bind:checked={wmsTransparent} />
								<Label for="wms_transparent">{m.mapSettingsTransparent?.() ?? 'Transparent'}</Label>
							</div>
							<div class="flex items-center space-x-2">
								<Switch id="wms_as_base" bind:checked={wmsAsBase} />
								<Label for="wms_as_base">{m.mapSettingsBaseLayer?.() ?? 'Base layer'}</Label>
							</div>
						</div>
						<Button
							onclick={handleAddWms}
							disabled={isSubmitting || !wmsName.trim() || !wmsUrl.trim() || !wmsLayers.trim()}
						>
							{isSubmitting
								? (m.mapSettingsAdding?.() ?? 'Adding...')
								: (m.mapSettingsAddWmsLayer?.() ?? 'Add WMS Layer')}
						</Button>
					</div>
				</Tabs.Content>

				<Tabs.Content value="upload">
					<div class="space-y-4">
						<div class="space-y-2">
							<Label for="upload_name">{m.mapSettingsFieldName?.() ?? 'Name'}</Label>
							<Input
								id="upload_name"
								bind:value={uploadName}
								placeholder={m.mapSettingsCustomTilesPlaceholder?.() ?? 'My Custom Tiles'}
								required
							/>
						</div>
						<div class="space-y-2">
							<Label>{m.mapSettingsTileFormat?.() ?? 'Tile Format'}</Label>
							<div class="flex gap-2">
								{#each ['png', 'jpg', 'webp'] as fmt (fmt)}
									<Button
										variant={uploadTileFormat === fmt ? 'default' : 'outline'}
										size="sm"
										onclick={() => (uploadTileFormat = fmt as 'png' | 'jpg' | 'webp')}
									>
										{fmt.toUpperCase()}
									</Button>
								{/each}
							</div>
						</div>
						<div class="space-y-2">
							<Label>{m.mapSettingsZipFile?.() ?? 'ZIP File'}</Label>
							<Input
								type="file"
								accept=".zip"
								onchange={(e) => {
									const files = (e.target as HTMLInputElement).files;
									uploadFile = files?.[0] ?? null;
									if (uploadFile && !uploadName) {
										uploadName = uploadFile.name.replace('.zip', '');
									}
								}}
							/>
							<p class="text-xs text-muted-foreground">
								{m.mapSettingsZipFileHint?.() ?? 'ZIP archive with tiles in z/x/y.ext format'}
							</p>
						</div>
						{#if uploadProgress}
							<div class="space-y-1">
								{#if uploadProgress.phase === 'uploading'}
									<p class="text-sm">
										{m.mapSettingsUploadingLabel?.() ?? 'Uploading...'}
										{(uploadProgress.loaded / 1024 / 1024).toFixed(1)} MB / {(
											uploadProgress.total /
											1024 /
											1024
										).toFixed(1)} MB ({uploadProgress.percent}%)
									</p>
								{:else}
									<p class="text-sm">
										{m.mapSettingsProcessingLabel?.() ?? 'Processing...'}
										{uploadProgress.percent}%
									</p>
								{/if}
								<div class="h-2 w-full rounded-full bg-muted">
									<div
										class="h-2 rounded-full bg-primary transition-all"
										style="width: {uploadProgress.percent}%"
									></div>
								</div>
							</div>
						{/if}
						<Button
							onclick={handleUpload}
							disabled={isUploading || !uploadFile || !uploadName.trim()}
						>
							{#if isUploading}
								<Loader2 class="mr-2 h-4 w-4 animate-spin" />
								{m.mapSettingsUploadingLabel?.() ?? 'Uploading...'}
							{:else}
								<Upload class="mr-2 h-4 w-4" />
								{m.mapSettingsUploadTiles?.() ?? 'Upload Tiles'}
							{/if}
						</Button>
					</div>
				</Tabs.Content>
			</div>
		</Tabs.Root>
	</Dialog.Content>
</Dialog.Root>

<!-- Delete Layer Dialog -->
<AlertDialog.Root bind:open={showDeleteLayerDialog}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.mapLayerDeleteTitle()}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.mapLayerDeleteConfirmation()}
				{#if selectedLayer}
					<strong class="mt-2 block">{selectedLayer.name}</strong>
					{#if selectedLayer.layer_type === 'base'}
						<Badge variant="destructive" class="mt-2">
							{m.mapSettingsThisIsBaseLayer?.() ?? 'This is the base layer'}
						</Badge>
					{/if}
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.mapSettingsCancel?.() ?? 'Cancel'}</AlertDialog.Cancel>
			<AlertDialog.Action onclick={handleDeleteLayer}>
				{m.mapSettingsDeleteConfirm?.() ?? 'Delete'}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
