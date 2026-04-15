<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { mapLayerSchema, projectMapDefaultsSchema } from '$lib/schemas/map-settings';
	import * as m from '$lib/paraglide/messages';
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Badge } from '$lib/components/ui/badge';
	import { Map, Plus, Layers, Star, Settings, Package, Loader2, MapPin, Pencil, Upload } from 'lucide-svelte';
	import { RegionSelector } from '$lib/components/map';
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';
	import { formatArea, formatTileCount, estimateTileCount, calculatePolygonAreaKm2 } from '$lib/utils/geo-utils';
	import type { Feature, Polygon } from 'geojson';
	import { BaseTable, type BaseColumnConfig } from '$lib/components/admin/base-table';
	import { PRESET_SOURCES, type MapLayer, type MapLayerConfig } from '$lib/types/map-layer';

	// Type for offline packages
	type OfflinePackage = {
		id: string;
		name: string;
		project_id: string;
		region_geojson: object;
		zoom_min: number;
		zoom_max: number;
		layers: string[];
		visible_to_roles: string[];
		status: 'draft' | 'processing' | 'ready' | 'failed';
		error_message?: string;
		tile_count?: number;
		file_size_bytes?: number;
		created: string;
		updated: string;
	};

	let { data } = $props();

	// Current tab
	let currentTab = $state('layers');

	// Layer dialog state
	let showAddLayerDialog = $state(false);
	let addLayerMode = $state<'preset' | 'tile' | 'wms' | 'upload'>('preset');
	let showDeleteLayerDialog = $state(false);
	let showDefaultsDialog = $state(false);
	let selectedLayer = $state<MapLayer | null>(null);
	let isSubmitting = $state(false);
	let isSavingDefaults = $state(false);

	// Upload state
	const CHUNK_SIZE = 10 * 1024 * 1024;
	type UploadProgress =
		| { phase: 'uploading'; loaded: number; total: number; percent: number }
		| { phase: 'processing'; status: string; percent: number };
	let uploadFile = $state<File | null>(null);
	let uploadTileFormat = $state<'png' | 'jpg' | 'webp'>('png');
	let uploadName = $state('');
	let isUploading = $state(false);
	let uploadLayerId = $state<string | null>(null);
	let uploadProgress = $state<UploadProgress | null>(null);

	// Tile URL form state
	let tileUrlName = $state('');
	let tileUrlUrl = $state('');
	let tileUrlAttribution = $state('');
	let tileUrlAsBase = $state(false);

	// WMS form state
	let wmsName = $state('');
	let wmsUrl = $state('');
	let wmsLayers = $state('');
	let wmsAttribution = $state('');
	let wmsFormat = $state('image/png');
	let wmsTransparent = $state(true);
	let wmsVersion = $state('1.1.1');
	let wmsAsBase = $state(false);

	// Offline packages state
	let showCreatePackageDialog = $state(false);
	let showDeletePackageDialog = $state(false);
	let selectedPackage = $state<OfflinePackage | null>(null);
	let isCreatingPackage = $state(false);
	let packageFormData = $state({
		name: '',
		zoom_min: 10,
		zoom_max: 17,
		region_geojson: '',
		layers: [] as string[],
		visible_to_roles: [] as string[]
	});

	// Package form validation
	let packageGeoJsonError = $state('');

	// Region selector state
	let showRegionSelector = $state(false);
	let selectedRegion: Feature<Polygon> | null = $state(null);

	// Derived stats for selected region
	let regionStats = $derived(() => {
		if (!selectedRegion) return null;
		const zoomLevels = Array.from(
			{ length: packageFormData.zoom_max - packageFormData.zoom_min + 1 },
			(_, i) => packageFormData.zoom_min + i
		);
		return {
			area: calculatePolygonAreaKm2(selectedRegion),
			tiles: estimateTileCount(selectedRegion, zoomLevels)
		};
	});

	function resetPackageForm() {
		packageFormData = {
			name: '',
			zoom_min: 10,
			zoom_max: 16,
			region_geojson: '',
			layers: [],
			visible_to_roles: []
		};
		packageGeoJsonError = '';
		selectedRegion = null;
	}

	function openCreatePackageDialog() {
		resetPackageForm();
		packageFormData.layers = data.mapLayers.map((l: MapLayer) => l.id);
		showCreatePackageDialog = true;
	}

	async function handleCreatePackage() {
		if (!selectedRegion) {
			toast.error(m.mapSettingsRegionRequired?.() ?? 'Please draw a region on the map');
			return;
		}
		if (!packageFormData.name.trim()) {
			toast.error(m.mapSettingsPackageNameRequired?.() ?? 'Package name is required');
			return;
		}
		if (packageFormData.layers.length === 0) {
			toast.error(m.mapSettingsLayerRequired?.() ?? 'At least one layer must be selected');
			return;
		}

		isCreatingPackage = true;
		try {
			const polygon = selectedRegion.geometry;

			const formData = new FormData();
			formData.append('name', packageFormData.name);
			formData.append('zoom_min', packageFormData.zoom_min.toString());
			formData.append('zoom_max', packageFormData.zoom_max.toString());
			formData.append('region_geojson', JSON.stringify(polygon));
			formData.append('layers', JSON.stringify(packageFormData.layers));
			formData.append('visible_to_roles', JSON.stringify(packageFormData.visible_to_roles));

			const response = await fetch('?/createPackage', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();
			if (result.type === 'success') {
				toast.success(m.mapSettingsPackageCreatedProcessing?.() ?? 'Package created and processing started');
				showCreatePackageDialog = false;
				resetPackageForm();
				invalidateAll();
			} else {
				toast.error(result.data?.message || (m.mapSettingsPackageCreateError?.() ?? 'Failed to create package'));
			}
		} catch (error) {
			toast.error(m.mapSettingsPackageCreateError?.() ?? 'Failed to create package');
		} finally {
			isCreatingPackage = false;
		}
	}

	async function handleDeletePackage() {
		if (!selectedPackage) return;

		try {
			const formData = new FormData();
			formData.append('id', selectedPackage.id);

			const response = await fetch('?/deletePackage', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();
			if (result.type === 'success') {
				toast.success(m.mapSettingsPackageDeleted?.() ?? 'Package deleted');
				showDeletePackageDialog = false;
				selectedPackage = null;
				invalidateAll();
			} else {
				toast.error(m.mapSettingsPackageDeleteError?.() ?? 'Failed to delete package');
			}
		} catch {
			toast.error(m.mapSettingsPackageDeleteError?.() ?? 'Failed to delete package');
		}
	}

	function formatFileSize(bytes: number | undefined): string {
		if (!bytes) return '-';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
		switch (status) {
			case 'ready': return 'default';
			case 'processing': return 'secondary';
			case 'failed': return 'destructive';
			default: return 'outline';
		}
	}

	// Package table columns
	const packageColumns = $derived.by((): BaseColumnConfig<OfflinePackage>[] => [
		{
			id: 'name',
			header: m.mapSettingsColumnName?.() ?? 'Name',
			accessorKey: 'name',
			fieldType: 'text',
			capabilities: { sortable: true, filterable: true }
		},
		{
			id: 'status',
			header: m.mapSettingsColumnStatus?.() ?? 'Status',
			accessorKey: 'status',
			fieldType: 'text',
			capabilities: { sortable: true, filterable: true }
		},
		{
			id: 'zoom_range',
			header: m.mapSettingsColumnZoom?.() ?? 'Zoom',
			accessorFn: (row) => `${row.zoom_min}-${row.zoom_max}`,
			fieldType: 'text',
			capabilities: { sortable: false }
		},
		{
			id: 'tile_count',
			header: m.mapSettingsColumnTiles?.() ?? 'Tiles',
			accessorFn: (row) => row.tile_count?.toLocaleString() ?? '-',
			fieldType: 'text',
			capabilities: { sortable: true }
		},
		{
			id: 'file_size',
			header: m.mapSettingsColumnSize?.() ?? 'Size',
			accessorFn: (row) => formatFileSize(row.file_size_bytes),
			fieldType: 'text',
			capabilities: { sortable: true }
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
				formData.append('packageId', rowId);
				formData.append('roleIds', JSON.stringify(value));

				const response = await fetch('?/updatePackageRoles', {
					method: 'POST',
					body: formData
				});

				const result = await response.json();
				if (result.type === 'success') {
					await invalidateAll();
				} else {
					throw new Error(result.data?.message || (m.mapSettingsUpdateFailed?.() ?? 'Update failed'));
				}
			}
		}
	]);

	// Project defaults form
	const {
		form: defaultsForm,
		enhance: defaultsEnhance
	} = superForm(data.defaultsForm, {
		validators: zodClient(projectMapDefaultsSchema),
		dataType: 'json',
		onSubmit: () => {
			isSavingDefaults = true;
		},
		onResult: ({ result }) => {
			isSavingDefaults = false;
			if (result.type === 'success') {
				toast.success(m.mapSettingsDefaultsSaved?.() ?? 'Map defaults saved');
				showDefaultsDialog = false;
				invalidateAll();
			} else if (result.type === 'failure') {
				toast.error(result.data?.message || (m.mapSettingsDefaultsSaveError?.() ?? 'Failed to save map defaults'));
			}
		}
	});

	// Get effective map defaults (from base layer config or project defaults)
	const effectiveDefaults = $derived(() => {
		if (data.baseLayer?.config) {
			const config = data.baseLayer.config as MapLayerConfig;
			if (config.default_zoom !== undefined && config.default_center) {
				return {
					zoom: config.default_zoom,
					center: config.default_center
				};
			}
		}
		return data.mapDefaults;
	});

	// Layer table columns
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
			accessorFn: (row) => {
				const opacity = (row.config as MapLayerConfig)?.opacity;
				return opacity !== undefined ? `${Math.round(opacity * 100)}%` : '100%';
			},
			fieldType: 'text',
			capabilities: { sortable: false }
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
					throw new Error(result.data?.message || (m.mapSettingsUpdateFailed?.() ?? 'Update failed'));
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

	// Add preset layer
	async function handleAddPreset(presetId: string) {
		isSubmitting = true;
		try {
			const formData = new FormData();
			formData.append('preset_id', presetId);
			// First preset added becomes base layer
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
				toast.error(result.data?.message || (m.mapSettingsLayerAddError?.() ?? 'Failed to add layer'));
			}
		} catch {
			toast.error(m.mapSettingsLayerAddError?.() ?? 'Failed to add layer');
		} finally {
			isSubmitting = false;
		}
	}

	// Add tile URL layer
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
				toast.error(result.data?.message || (m.mapSettingsLayerAddError?.() ?? 'Failed to add layer'));
			}
		} catch {
			toast.error(m.mapSettingsLayerAddError?.() ?? 'Failed to add layer');
		} finally {
			isSubmitting = false;
		}
	}

	// Add WMS layer
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
				toast.error(result.data?.message || (m.mapSettingsLayerAddError?.() ?? 'Failed to add layer'));
			}
		} catch {
			toast.error(m.mapSettingsLayerAddError?.() ?? 'Failed to add layer');
		} finally {
			isSubmitting = false;
		}
	}

	// Handle file upload (chunked)
	async function putChunk(layerId: string, index: number, buf: ArrayBuffer): Promise<void> {
		let lastErr: unknown = null;
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				const res = await fetch(`/api/map-layers/upload/${layerId}/chunk/${index}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/octet-stream' },
					body: buf
				});
				if (res.ok) return;
				lastErr = new Error(`HTTP ${res.status}`);
			} catch (e) {
				lastErr = e;
			}
			await new Promise((r) => setTimeout(r, 1000));
		}
		throw lastErr ?? new Error('Chunk upload failed');
	}

	async function handleUpload() {
		if (!uploadFile || !uploadName.trim()) return;
		isUploading = true;
		const file = uploadFile;
		try {
			const totalSize = file.size;
			const totalChunks = Math.max(1, Math.ceil(totalSize / CHUNK_SIZE));
			uploadProgress = { phase: 'uploading', loaded: 0, total: totalSize, percent: 0 };

			const initRes = await fetch('/api/map-layers/upload/init', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: uploadName,
					tile_format: uploadTileFormat,
					project_id: data.project.id,
					layer_type: 'overlay',
					total_size: totalSize,
					total_chunks: totalChunks
				})
			});
			if (!initRes.ok) {
				throw new Error('Upload init failed');
			}
			const initJson = (await initRes.json()) as { layerId: string; chunk_size: number };
			const { layerId } = initJson;
			const chunkSize = initJson.chunk_size || CHUNK_SIZE;
			uploadLayerId = layerId;

			const statusRes = await fetch(`/api/map-layers/upload/${layerId}/chunks`);
			const chunksInfo = (await statusRes.json()) as { received: number[] };
			const received = new Set<number>(chunksInfo.received ?? []);

			const chunkLen = (i: number) => Math.min(chunkSize, totalSize - i * chunkSize);
			let loaded = 0;
			for (const i of received) loaded += chunkLen(i);
			uploadProgress = {
				phase: 'uploading',
				loaded,
				total: totalSize,
				percent: totalSize ? Math.round((loaded / totalSize) * 100) : 0
			};

			for (let i = 0; i < totalChunks; i++) {
				if (received.has(i)) continue;
				const start = i * chunkSize;
				const end = Math.min(start + chunkSize, totalSize);
				const buf = await file.slice(start, end).arrayBuffer();
				await putChunk(layerId, i, buf);
				loaded += chunkLen(i);
				uploadProgress = {
					phase: 'uploading',
					loaded,
					total: totalSize,
					percent: totalSize ? Math.round((loaded / totalSize) * 100) : 0
				};
			}

			let finalized = false;
			for (let pass = 0; pass < 3; pass++) {
				const finRes = await fetch(`/api/map-layers/upload/${layerId}/finalize`, {
					method: 'POST'
				});
				const finJson = (await finRes.json()) as { ok?: boolean; missing?: number[] };
				if (finRes.ok && finJson.ok) {
					finalized = true;
					break;
				}
				if (Array.isArray(finJson.missing) && finJson.missing.length > 0 && pass < 2) {
					for (const idx of finJson.missing) {
						const start = idx * chunkSize;
						const end = Math.min(start + chunkSize, totalSize);
						const buf = await file.slice(start, end).arrayBuffer();
						await putChunk(layerId, idx, buf);
					}
					continue;
				}
				break;
			}
			if (!finalized) {
				throw new Error('Finalize failed');
			}

			toast.success(m.mapSettingsUploadCompleteProcessing?.() ?? 'Upload complete, processing tiles...');
			uploadProgress = { phase: 'processing', status: 'pending', percent: 0 };
			pollUploadStatus(layerId);
		} catch (err) {
			console.error('Upload error:', err);
			toast.error(err instanceof Error ? err.message : (m.mapSettingsUploadFailed?.() ?? 'Upload failed'));
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
					toast.error(result.error_message || (m.mapSettingsProcessingFailed?.() ?? 'Processing failed'));
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

	// Already-added preset IDs
	const addedPresetUrls = $derived(
		new Set(data.mapLayers.map((l: MapLayer) => l.url).filter(Boolean))
	);
</script>

<div class="flex flex-col gap-6 min-w-0 w-full">
	<!-- Map Defaults Summary -->
	<div class="flex items-center justify-between">
		<div class="text-sm text-muted-foreground">
			{m.mapSettingsDefaultViewLabel?.() ?? 'Default view'}: {m.mapSettingsZoomLabel?.() ?? 'Zoom'} {effectiveDefaults().zoom}, {m.mapSettingsCenterLabel?.() ?? 'Center'} {effectiveDefaults().center.lat.toFixed(4)}, {effectiveDefaults().center.lng.toFixed(4)}
		</div>
		<Button variant="ghost" size="sm" class="h-7 text-xs" onclick={() => (showDefaultsDialog = true)}>
			<Settings class="mr-1 h-3 w-3" />
			{m.mapSettingsEditDefaults?.() ?? 'Edit defaults'}
		</Button>
	</div>

	<!-- Tabs for Layers and Offline Packages -->
	<Tabs.Root bind:value={currentTab}>
		<Tabs.List>
			<Tabs.Trigger value="layers" class="flex items-center gap-2">
				<Layers class="h-4 w-4" />
				{m.mapSettingsTabLayers?.() ?? 'Layers'}
			</Tabs.Trigger>
			<Tabs.Trigger value="offline" class="flex items-center gap-2">
				<Package class="h-4 w-4" />
				{m.mapSettingsTabOfflinePackages?.() ?? 'Offline Packages'}
			</Tabs.Trigger>
		</Tabs.List>

		<!-- Layers Tab -->
		<Tabs.Content value="layers">
			<Card.Root>
				<Card.Header>
					<div class="flex items-center justify-between">
						<div>
							<Card.Title class="flex items-center gap-2">
								<Layers class="h-5 w-5" />
								{m.mapLayersTitle?.() ?? 'Map Layers'}
							</Card.Title>
							<Card.Description>
								{@const baseLayers = data.mapLayers.filter((l: MapLayer) => l.layer_type === 'base')}
								{#if baseLayers.length > 0}
									{m.mapSettingsBaseLayersLabel?.() ?? 'Base layers'}: <strong>{baseLayers.map((l: MapLayer) => l.name).join(', ')}</strong>
								{:else}
									{m.mapSettingsNoBaseLayerConfigured?.() ?? 'No base layer configured - add a layer and mark it as base'}
								{/if}
							</Card.Description>
						</div>
						<Button onclick={() => (showAddLayerDialog = true)}>
							<Plus class="mr-2 h-4 w-4" />
							{m.mapSettingsAddLayer?.() ?? 'Add Layer'}
						</Button>
					</div>
				</Card.Header>
				<Card.Content>
					{#if data.mapLayers.length === 0}
						<div class="flex flex-col items-center justify-center py-12 text-center">
							<Map class="h-12 w-12 text-muted-foreground mb-4" />
							<p class="text-lg font-medium">{m.mapSettingsNoLayersYet?.() ?? 'No layers yet'}</p>
							<p class="text-muted-foreground mb-4">
								{m.mapSettingsNoLayersDescription?.() ?? 'Add a preset, tile URL, WMS, or upload tiles to get started'}
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
							emptySubMessage={m.mapLayersEmptyDescription?.() ?? 'Map layers will appear here once tile sets are processed'}
							showToolbar={true}
							showEditMode={true}
							editModeLabel={m.mapSettingsEditMode?.() ?? 'Edit mode'}
							rowActions={{
								header: m.mapSettingsActions?.() ?? 'Actions',
								onDelete: openDeleteLayerDialog,
								customActions: [
									{
										label: (row) => row.layer_type === 'base'
											? (m.mapSettingsSetAsOverlay?.() ?? 'Set as Overlay')
											: (m.mapSettingsSetAsBase?.() ?? 'Set as Base'),
										icon: Star,
										onClick: toggleLayerType
									}
								]
							}}
						/>
					{/if}
				</Card.Content>
			</Card.Root>
		</Tabs.Content>

		<!-- Offline Packages Tab -->
		<Tabs.Content value="offline">
			<Card.Root>
				<Card.Header>
					<div class="flex items-center justify-between">
						<div>
							<Card.Title class="flex items-center gap-2">
								<Package class="h-5 w-5" />
								{m.mapSettingsOfflinePackagesTitle?.() ?? 'Offline Packages'}
							</Card.Title>
							<Card.Description>
								{m.mapSettingsOfflinePackagesDescription?.() ?? 'Create tile packages for offline use by participants'}
							</Card.Description>
						</div>
						<Button onclick={openCreatePackageDialog} disabled={data.mapLayers.length === 0}>
							<Plus class="mr-2 h-4 w-4" />
							{m.mapSettingsCreatePackage?.() ?? 'Create Package'}
						</Button>
					</div>
				</Card.Header>
				<Card.Content>
					{#if data.mapLayers.length === 0}
						<div class="flex flex-col items-center justify-center py-12 text-center">
							<Package class="h-12 w-12 text-muted-foreground mb-4" />
							<p class="text-lg font-medium">{m.mapSettingsNoLayersConfigured?.() ?? 'No layers configured'}</p>
							<p class="text-muted-foreground mb-4">
								{m.mapSettingsAddLayersFirst?.() ?? 'Add map layers first before creating offline packages'}
							</p>
						</div>
					{:else if !data.offlinePackages || data.offlinePackages.length === 0}
						<div class="flex flex-col items-center justify-center py-12 text-center">
							<Package class="h-12 w-12 text-muted-foreground mb-4" />
							<p class="text-lg font-medium">{m.mapSettingsNoOfflinePackages?.() ?? 'No offline packages'}</p>
							<p class="text-muted-foreground mb-4">
								{m.mapSettingsNoOfflinePackagesDescription?.() ?? 'Create your first package to enable offline maps for participants'}
							</p>
							<Button onclick={openCreatePackageDialog}>
								<Plus class="mr-2 h-4 w-4" />
								{m.mapSettingsCreatePackage?.() ?? 'Create Package'}
							</Button>
						</div>
					{:else}
						<BaseTable
							data={data.offlinePackages}
							columns={packageColumns}
							getRowId={(row) => row.id}
							emptyMessage={m.mapSettingsNoOfflinePackages?.() ?? 'No offline packages'}
							emptySubMessage={m.mapSettingsCreatePackageHint?.() ?? 'Create a package to enable offline maps'}
							showToolbar={true}
							showEditMode={true}
							editModeLabel={m.mapSettingsEditMode?.() ?? 'Edit mode'}
							rowActions={{
								header: m.mapSettingsActions?.() ?? 'Actions',
								onDelete: (pkg) => {
									selectedPackage = pkg;
									showDeletePackageDialog = true;
								}
							}}
						/>
					{/if}
				</Card.Content>
			</Card.Root>
		</Tabs.Content>
	</Tabs.Root>
</div>

<!-- Add Layer Dialog (absorbs map-sources functionality) -->
<Dialog.Root bind:open={showAddLayerDialog}>
	<Dialog.Content class="max-w-2xl max-h-[90vh] flex flex-col">
		<Dialog.Header class="shrink-0">
			<Dialog.Title>{m.mapSettingsAddMapLayerTitle?.() ?? 'Add Map Layer'}</Dialog.Title>
			<Dialog.Description>{m.mapSettingsAddMapLayerDescription?.() ?? 'Choose a preset, enter a URL, or upload tiles'}</Dialog.Description>
		</Dialog.Header>

		<Tabs.Root bind:value={addLayerMode} class="flex-1 overflow-hidden flex flex-col">
			<Tabs.List class="shrink-0">
				<Tabs.Trigger value="preset">{m.mapSettingsPresets?.() ?? 'Presets'}</Tabs.Trigger>
				<Tabs.Trigger value="tile">{m.mapSettingsTileUrl?.() ?? 'Tile URL'}</Tabs.Trigger>
				<Tabs.Trigger value="wms">{m.mapSettingsWms?.() ?? 'WMS'}</Tabs.Trigger>
				<Tabs.Trigger value="upload">
					<Upload class="h-4 w-4 mr-1" />
					{m.mapSettingsUpload?.() ?? 'Upload'}
				</Tabs.Trigger>
			</Tabs.List>

			<div class="overflow-y-auto flex-1 pr-2 pt-4">
				<Tabs.Content value="preset">
					<!-- Preset Sources -->
					<div class="grid gap-2">
						{#each PRESET_SOURCES as preset}
							<button
								class="flex items-center justify-between p-3 border rounded-md hover:bg-muted/50 transition-colors text-left w-full disabled:opacity-50"
								disabled={isSubmitting || addedPresetUrls.has(preset.url)}
								onclick={() => handleAddPreset(preset.id)}
							>
								<div>
									<div class="font-medium text-sm">{preset.name}</div>
									<div class="text-xs text-muted-foreground">
										{preset.sourceType === 'wms' ? (m.mapSettingsWms?.() ?? 'WMS') : (m.mapSettingsTiles?.() ?? 'Tiles')} -- {m.mapSettingsZoomLabel?.() ?? 'Zoom'} {preset.minZoom ?? 0}-{preset.maxZoom ?? 19}
									</div>
								</div>
								{#if addedPresetUrls.has(preset.url)}
									<Badge variant="outline" class="text-xs">{m.mapSettingsAdded?.() ?? 'Added'}</Badge>
								{:else}
									<Plus class="h-4 w-4 text-muted-foreground" />
								{/if}
							</button>
						{/each}
					</div>
				</Tabs.Content>

				<Tabs.Content value="tile">
					<!-- Tile URL Form -->
					<div class="space-y-4">
						<div class="space-y-2">
							<Label for="tile_name">{m.mapSettingsFieldName?.() ?? 'Name'}</Label>
							<Input id="tile_name" bind:value={tileUrlName} placeholder={m.mapSettingsTileLayerPlaceholder?.() ?? 'My Tile Layer'} required />
						</div>
						<div class="space-y-2">
							<Label for="tile_url">{m.mapSettingsTileUrlTemplate?.() ?? 'Tile URL Template'}</Label>
							<Input id="tile_url" bind:value={tileUrlUrl} placeholder={"https://example.com/{z}/{x}/{y}.png"} required />
							<p class="text-xs text-muted-foreground">{m.mapSettingsTilePlaceholderHint?.() ?? 'URL must contain z, x and y placeholders'}</p>
						</div>
						<div class="space-y-2">
							<Label for="tile_attribution">{m.mapSettingsAttributionOptional?.() ?? 'Attribution (optional)'}</Label>
							<Input id="tile_attribution" bind:value={tileUrlAttribution} />
						</div>
						<div class="flex items-center space-x-2">
							<Switch id="tile_as_base" bind:checked={tileUrlAsBase} />
							<Label for="tile_as_base">{m.mapSettingsSetAsBaseLayer?.() ?? 'Set as base layer'}</Label>
						</div>
						<Button onclick={handleAddTile} disabled={isSubmitting || !tileUrlName.trim() || !tileUrlUrl.trim()}>
							{isSubmitting ? (m.mapSettingsAdding?.() ?? 'Adding...') : (m.mapSettingsAddTileLayer?.() ?? 'Add Tile Layer')}
						</Button>
					</div>
				</Tabs.Content>

				<Tabs.Content value="wms">
					<!-- WMS Form -->
					<div class="space-y-4">
						<div class="space-y-2">
							<Label for="wms_name">{m.mapSettingsFieldName?.() ?? 'Name'}</Label>
							<Input id="wms_name" bind:value={wmsName} placeholder={m.mapSettingsWmsLayerPlaceholder?.() ?? 'My WMS Layer'} required />
						</div>
						<div class="space-y-2">
							<Label for="wms_url">{m.mapSettingsWmsUrl?.() ?? 'WMS URL'}</Label>
							<Input id="wms_url" bind:value={wmsUrl} placeholder="https://example.com/wms" required />
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
							<Label for="wms_attribution">{m.mapSettingsAttributionOptional?.() ?? 'Attribution (optional)'}</Label>
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
						<Button onclick={handleAddWms} disabled={isSubmitting || !wmsName.trim() || !wmsUrl.trim() || !wmsLayers.trim()}>
							{isSubmitting ? (m.mapSettingsAdding?.() ?? 'Adding...') : (m.mapSettingsAddWmsLayer?.() ?? 'Add WMS Layer')}
						</Button>
					</div>
				</Tabs.Content>

				<Tabs.Content value="upload">
					<!-- Upload Form -->
					<div class="space-y-4">
						<div class="space-y-2">
							<Label for="upload_name">{m.mapSettingsFieldName?.() ?? 'Name'}</Label>
							<Input id="upload_name" bind:value={uploadName} placeholder={m.mapSettingsCustomTilesPlaceholder?.() ?? 'My Custom Tiles'} required />
						</div>
						<div class="space-y-2">
							<Label>{m.mapSettingsTileFormat?.() ?? 'Tile Format'}</Label>
							<div class="flex gap-2">
								{#each ['png', 'jpg', 'webp'] as fmt}
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
							<p class="text-xs text-muted-foreground">{m.mapSettingsZipFileHint?.() ?? 'ZIP archive with tiles in z/x/y.ext format'}</p>
						</div>
						{#if uploadProgress}
							<div class="space-y-1">
								{#if uploadProgress.phase === 'uploading'}
									<p class="text-sm">
										{m.mapSettingsUploadingLabel?.() ?? 'Uploading...'} {(uploadProgress.loaded / 1024 / 1024).toFixed(1)} MB / {(uploadProgress.total / 1024 / 1024).toFixed(1)} MB ({uploadProgress.percent}%)
									</p>
								{:else}
									<p class="text-sm">{m.mapSettingsProcessingLabel?.() ?? 'Processing...'} {uploadProgress.percent}%</p>
								{/if}
								<div class="w-full bg-muted rounded-full h-2">
									<div
										class="bg-primary h-2 rounded-full transition-all"
										style="width: {uploadProgress.percent}%"
									></div>
								</div>
							</div>
						{/if}
						<Button onclick={handleUpload} disabled={isUploading || !uploadFile || !uploadName.trim()}>
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

<!-- Project Map Defaults Dialog -->
<Dialog.Root bind:open={showDefaultsDialog}>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>{m.mapSettingsDefaultViewTitle?.() ?? 'Map Default View'}</Dialog.Title>
			<Dialog.Description>
				{m.mapSettingsDefaultViewDescription?.() ?? 'Fallback settings when no base layer is configured'}
			</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action="?/saveDefaults" use:defaultsEnhance class="space-y-4">
			<div class="space-y-2">
				<Label for="default_zoom">{m.mapSettingsDefaultZoom?.() ?? 'Default Zoom'}</Label>
				<Input
					id="default_zoom"
					name="zoom"
					type="number"
					min="0"
					max="22"
					bind:value={$defaultsForm.zoom}
				/>
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div class="space-y-2">
					<Label for="min_zoom">{m.mapSettingsMinZoom?.() ?? 'Min Zoom'}</Label>
					<Input
						id="min_zoom"
						name="min_zoom"
						type="number"
						min="0"
						max="22"
						bind:value={$defaultsForm.min_zoom}
					/>
				</div>
				<div class="space-y-2">
					<Label for="max_zoom">{m.mapSettingsMaxZoom?.() ?? 'Max Zoom'}</Label>
					<Input
						id="max_zoom"
						name="max_zoom"
						type="number"
						min="0"
						max="22"
						bind:value={$defaultsForm.max_zoom}
					/>
				</div>
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div class="space-y-2">
					<Label for="center_lat">{m.mapSettingsCenterLat?.() ?? 'Center Latitude'}</Label>
					<Input
						id="center_lat"
						name="center.lat"
						type="number"
						step="0.0001"
						min="-90"
						max="90"
						bind:value={$defaultsForm.center.lat}
					/>
				</div>
				<div class="space-y-2">
					<Label for="center_lng">{m.mapSettingsCenterLng?.() ?? 'Center Longitude'}</Label>
					<Input
						id="center_lng"
						name="center.lng"
						type="number"
						step="0.0001"
						min="-180"
						max="180"
						bind:value={$defaultsForm.center.lng}
					/>
				</div>
			</div>

			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (showDefaultsDialog = false)}>
					{m.mapSettingsCancel?.() ?? 'Cancel'}
				</Button>
				<Button type="submit" disabled={isSavingDefaults}>
					{isSavingDefaults ? (m.mapSettingsSaving?.() ?? 'Saving...') : (m.mapSettingsSaveDefaults?.() ?? 'Save Defaults')}
				</Button>
			</Dialog.Footer>
		</form>
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
					<strong class="block mt-2">{selectedLayer.name}</strong>
					{#if selectedLayer.layer_type === 'base'}
						<Badge variant="destructive" class="mt-2">{m.mapSettingsThisIsBaseLayer?.() ?? 'This is the base layer'}</Badge>
					{/if}
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.mapSettingsCancel?.() ?? 'Cancel'}</AlertDialog.Cancel>
			<AlertDialog.Action onclick={handleDeleteLayer}>{m.mapSettingsDeleteConfirm?.() ?? 'Delete'}</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Create Package Dialog -->
<Dialog.Root bind:open={showCreatePackageDialog}>
	<Dialog.Content class="max-w-2xl max-h-[90vh] flex flex-col">
		<Dialog.Header class="shrink-0">
			<Dialog.Title>{m.mapSettingsCreateOfflinePackageTitle?.() ?? 'Create Offline Package'}</Dialog.Title>
			<Dialog.Description>
				{m.mapSettingsCreateOfflinePackageDescription?.() ?? 'Define a region and select layers to include in the offline package. Participants will be able to download this package for offline use.'}
			</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-4 py-4 overflow-y-auto flex-1 pr-2">
			<div class="grid gap-2">
				<Label for="package_name">{m.mapSettingsPackageNameLabel?.() ?? 'Package Name'}</Label>
				<Input
					id="package_name"
					bind:value={packageFormData.name}
					placeholder={m.mapSettingsPackageNamePlaceholder?.() ?? 'e.g., Downtown Area'}
					required
				/>
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div class="grid gap-2">
					<Label for="zoom_min">{m.mapSettingsMinZoom?.() ?? 'Min Zoom'}</Label>
					<Input
						id="zoom_min"
						type="number"
						min="0"
						max="22"
						bind:value={packageFormData.zoom_min}
					/>
				</div>
				<div class="grid gap-2">
					<Label for="zoom_max">{m.mapSettingsMaxZoom?.() ?? 'Max Zoom'}</Label>
					<Input
						id="zoom_max"
						type="number"
						min="0"
						max="22"
						bind:value={packageFormData.zoom_max}
					/>
				</div>
			</div>

			<div class="grid gap-2">
				<Label>{m.mapSettingsRegionLabel?.() ?? 'Region'}</Label>
				{#if selectedRegion && regionStats()}
					<div class="flex items-center justify-between p-3 border rounded-md bg-muted/50">
						<div class="flex items-center gap-2">
							<MapPin class="h-4 w-4 text-muted-foreground" />
							<div>
								<div class="text-sm font-medium">{formatArea(regionStats()!.area)}</div>
								<div class="text-xs text-muted-foreground">{formatTileCount(regionStats()!.tiles)} {m.mapSettingsTilesAtZoom?.() ?? 'tiles at zoom'} {packageFormData.zoom_min}-{packageFormData.zoom_max}</div>
							</div>
						</div>
						<Button variant="outline" size="sm" onclick={() => (showRegionSelector = true)}>
							<Pencil class="h-4 w-4 mr-1" />
							{m.mapSettingsEditRegion?.() ?? 'Edit Region'}
						</Button>
					</div>
				{:else}
					<Button variant="outline" class="w-full justify-start h-auto py-4" onclick={() => (showRegionSelector = true)}>
						<MapPin class="h-5 w-5 mr-2 text-muted-foreground" />
						<div class="text-left">
							<div class="font-medium">{m.mapSettingsDrawRegion?.() ?? 'Draw Region on Map'}</div>
							<div class="text-xs text-muted-foreground">{m.mapSettingsDrawRegionHint?.() ?? 'Click to open the map and select an area'}</div>
						</div>
					</Button>
				{/if}
			</div>

			<div class="grid gap-2">
				<Label>{m.mapSettingsLayersToInclude?.() ?? 'Layers to Include'}</Label>
				<div class="border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
					{#each data.mapLayers as layer}
						<label class="flex items-center gap-2 cursor-pointer">
							<input
								type="checkbox"
								checked={packageFormData.layers.includes(layer.id)}
								onchange={(e) => {
									if (e.currentTarget.checked) {
										packageFormData.layers = [...packageFormData.layers, layer.id];
									} else {
										packageFormData.layers = packageFormData.layers.filter(id => id !== layer.id);
									}
								}}
								class="h-4 w-4 rounded border-gray-300"
							/>
							<span class="text-sm">{layer.name}</span>
							{#if layer.layer_type === 'base'}
								<Badge variant="outline" class="text-xs">{m.mapSettingsBaseLayerBadge?.() ?? 'Base'}</Badge>
							{/if}
						</label>
					{/each}
				</div>
			</div>

			<div class="grid gap-2">
				<Label>{m.mapSettingsVisibleToRoles?.() ?? 'Visible to Roles'}</Label>
				<MobileMultiSelect
					bind:selectedIds={packageFormData.visible_to_roles}
					options={data.roles}
					getOptionId={(r) => r.id}
					getOptionLabel={(r) => r.name}
					getOptionDescription={(r) => r.description}
					placeholder={m.mapSettingsAllRolesPlaceholder?.() ?? 'All roles (leave empty for all)'}
				/>
				<p class="text-xs text-muted-foreground">
					{m.mapSettingsAllRolesHelp?.() ?? 'Leave empty to make this package available to all roles.'}
				</p>
			</div>
		</div>

		<Dialog.Footer class="shrink-0">
			<Button type="button" variant="outline" onclick={() => (showCreatePackageDialog = false)}>
				{m.mapSettingsCancel?.() ?? 'Cancel'}
			</Button>
			<Button onclick={handleCreatePackage} disabled={isCreatingPackage}>
				{#if isCreatingPackage}
					<Loader2 class="mr-2 h-4 w-4 animate-spin" />
					{m.mapSettingsCreating?.() ?? 'Creating...'}
				{:else}
					{m.mapSettingsCreatePackage?.() ?? 'Create Package'}
				{/if}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Delete Package Dialog -->
<AlertDialog.Root bind:open={showDeletePackageDialog}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.mapSettingsDeletePackageTitle?.() ?? 'Delete Package'}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.mapSettingsDeletePackageConfirmation?.() ?? 'Are you sure you want to delete this offline package? This action cannot be undone.'}
				{#if selectedPackage}
					<strong class="block mt-2">{selectedPackage.name}</strong>
					{#if selectedPackage.status === 'ready'}
						<p class="text-sm text-muted-foreground mt-1">
							{selectedPackage.tile_count?.toLocaleString()} tiles, {formatFileSize(selectedPackage.file_size_bytes)}
						</p>
					{/if}
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.mapSettingsCancel?.() ?? 'Cancel'}</AlertDialog.Cancel>
			<AlertDialog.Action onclick={handleDeletePackage} class="bg-destructive text-destructive-foreground hover:bg-destructive/90">
				{m.mapSettingsDeleteConfirm?.() ?? 'Delete'}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Region Selector Dialog -->
<RegionSelector
	bind:open={showRegionSelector}
	mapLayers={data.mapLayers}
	mapDefaults={data.mapDefaults}
	zoomMin={packageFormData.zoom_min}
	zoomMax={packageFormData.zoom_max}
	initialRegion={selectedRegion}
	onConfirm={(region) => {
		selectedRegion = region;
		showRegionSelector = false;
	}}
	onCancel={() => {
		showRegionSelector = false;
	}}
/>
