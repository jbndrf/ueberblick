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
	import { Textarea } from '$lib/components/ui/textarea';
	import { Map, Plus, Layers, Star, Settings, Package, Download, Trash2, Loader2, MapPin, Pencil } from 'lucide-svelte';
	import { RegionSelector } from '$lib/components/map';
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';
	import { formatArea, formatTileCount, estimateTileCount, calculatePolygonAreaKm2 } from '$lib/utils/geo-utils';
	import type { Feature, Polygon } from 'geojson';
	import { BaseTable, type BaseColumnConfig } from '$lib/components/admin/base-table';
	import type { MapLayerWithSource, MapLayerConfig } from '$lib/types/map-layer';
	import type { MapSource } from '$lib/types/map-sources';

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
	let showCreateLayerDialog = $state(false);
	let showDeleteLayerDialog = $state(false);
	let showDefaultsDialog = $state(false);
	let selectedLayer = $state<MapLayerWithSource | null>(null);
	let isSubmitting = $state(false);
	let isSavingDefaults = $state(false);

	// Offline packages state
	let showCreatePackageDialog = $state(false);
	let showDeletePackageDialog = $state(false);
	let selectedPackage = $state<OfflinePackage | null>(null);
	let isCreatingPackage = $state(false);
	let packageFormData = $state({
		name: '',
		zoom_min: 10,
		zoom_max: 17, // OSM max is 19, keep reasonable default
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

	function validateGeoJson(value: string): boolean {
		if (!value.trim()) {
			packageGeoJsonError = 'GeoJSON is required';
			return false;
		}
		try {
			const parsed = JSON.parse(value);
			const polygon = extractPolygon(parsed);
			if (!polygon) {
				packageGeoJsonError = 'Must contain a Polygon or MultiPolygon';
				return false;
			}
			packageGeoJsonError = '';
			return true;
		} catch {
			packageGeoJsonError = 'Invalid JSON format';
			return false;
		}
	}

	function extractPolygon(geojson: any): object | null {
		if (!geojson || typeof geojson !== 'object') return null;

		// Direct Polygon or MultiPolygon geometry
		if (geojson.type === 'Polygon' || geojson.type === 'MultiPolygon') {
			return geojson;
		}

		// Feature with Polygon or MultiPolygon geometry
		if (geojson.type === 'Feature' && geojson.geometry) {
			if (geojson.geometry.type === 'Polygon' || geojson.geometry.type === 'MultiPolygon') {
				return geojson.geometry;
			}
		}

		// FeatureCollection - extract first polygon feature
		if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
			for (const feature of geojson.features) {
				if (feature.type === 'Feature' && feature.geometry) {
					if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
						return feature.geometry;
					}
				}
			}
		}

		return null;
	}

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
		// Pre-select all active layers
		packageFormData.layers = data.mapLayers.map((l: MapLayerWithSource) => l.id);
		showCreatePackageDialog = true;
	}

	async function handleCreatePackage() {
		if (!selectedRegion) {
			toast.error('Please draw a region on the map');
			return;
		}
		if (!packageFormData.name.trim()) {
			toast.error('Package name is required');
			return;
		}
		if (packageFormData.layers.length === 0) {
			toast.error('At least one layer must be selected');
			return;
		}

		isCreatingPackage = true;
		try {
			// Use the geometry from the selected region
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
				toast.success('Package created and processing started');
				showCreatePackageDialog = false;
				resetPackageForm();
				invalidateAll();
			} else {
				toast.error(result.data?.message || 'Failed to create package');
			}
		} catch (error) {
			toast.error('Failed to create package');
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
				toast.success('Package deleted');
				showDeletePackageDialog = false;
				selectedPackage = null;
				invalidateAll();
			} else {
				toast.error('Failed to delete package');
			}
		} catch {
			toast.error('Failed to delete package');
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
			header: 'Name',
			accessorKey: 'name',
			fieldType: 'text',
			capabilities: { sortable: true, filterable: true }
		},
		{
			id: 'status',
			header: 'Status',
			accessorKey: 'status',
			fieldType: 'text',
			capabilities: { sortable: true, filterable: true }
		},
		{
			id: 'zoom_range',
			header: 'Zoom',
			accessorFn: (row) => `${row.zoom_min}-${row.zoom_max}`,
			fieldType: 'text',
			capabilities: { sortable: false }
		},
		{
			id: 'tile_count',
			header: 'Tiles',
			accessorFn: (row) => row.tile_count?.toLocaleString() ?? '-',
			fieldType: 'text',
			capabilities: { sortable: true }
		},
		{
			id: 'file_size',
			header: 'Size',
			accessorFn: (row) => formatFileSize(row.file_size_bytes),
			fieldType: 'text',
			capabilities: { sortable: true }
		},
		{
			id: 'visible_to_roles',
			header: 'Visible to Roles',
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
					throw new Error(result.data?.message || 'Update failed');
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
				toast.success('Map defaults saved');
				showDefaultsDialog = false;
				invalidateAll();
			} else if (result.type === 'failure') {
				toast.error(result.data?.message || 'Failed to save map defaults');
			}
		}
	});

	// Layer form
	const {
		form: layerForm,
		enhance: layerEnhance,
		reset: resetLayerForm
	} = superForm(data.layerForm, {
		validators: zodClient(mapLayerSchema),
		dataType: 'json',
		resetForm: true,
		onSubmit: () => {
			isSubmitting = true;
		},
		onResult: ({ result }) => {
			isSubmitting = false;
			if (result.type === 'success') {
				toast.success('Layer saved');
				showCreateLayerDialog = false;
				resetLayerForm();
				invalidateAll();
			} else if (result.type === 'failure') {
				toast.error(result.data?.message ?? 'Failed to save layer');
			}
		}
	});

	// Get source name from layer
	function getSourceName(layer: MapLayerWithSource): string {
		return layer.expand?.source_id?.name || 'Unknown source';
	}

	// Get source type from layer
	function getSourceType(layer: MapLayerWithSource): string {
		const sourceType = layer.expand?.source_id?.source_type;
		if (!sourceType) return '-';
		return sourceType.charAt(0).toUpperCase() + sourceType.slice(1);
	}

	// Handle source selection - auto-fill name
	function handleSourceSelect(sourceId: string) {
		if (sourceId) {
			const source = data.mapSources.find((s: MapSource) => s.id === sourceId);
			if (source && !$layerForm.name) {
				$layerForm.name = source.name;
			}
		}
	}

	// Layer management
	function openCreateLayerDialog() {
		resetLayerForm();
		$layerForm = {
			source_id: '',
			name: '',
			display_order: data.mapLayers.length,
			visible_to_roles: [],
			is_base_layer: !data.baseLayer,
			is_active: true,
			config: { opacity: 1 }
		};
		showCreateLayerDialog = true;
	}

	function openDeleteLayerDialog(layer: MapLayerWithSource) {
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

	async function setAsBaseLayer(layer: MapLayerWithSource) {
		const formData = new FormData();
		formData.append('id', layer.id);

		try {
			const response = await fetch('?/setBaseLayer', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();
			if (result.type === 'success') {
				toast.success('Base layer updated');
				invalidateAll();
			} else {
				toast.error('Failed to set base layer');
			}
		} catch {
			toast.error('Failed to set base layer');
		}
	}

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

	// Layer table columns (reactive to update entityConfig when data changes)
	const layerColumns = $derived.by((): BaseColumnConfig<MapLayerWithSource>[] => [
		{
			id: 'name',
			header: m.mapLayerName(),
			accessorKey: 'name',
			fieldType: 'text',
			capabilities: { sortable: true, filterable: true }
		},
		{
			id: 'source',
			header: 'Source',
			accessorFn: (row) => getSourceName(row),
			fieldType: 'text',
			capabilities: { sortable: true, filterable: true }
		},
		{
			id: 'source_type',
			header: 'Type',
			accessorFn: (row) => getSourceType(row),
			fieldType: 'text',
			capabilities: { sortable: true, filterable: true }
		},
		{
			id: 'opacity',
			header: 'Opacity',
			accessorFn: (row) => {
				const opacity = (row.config as MapLayerConfig)?.opacity;
				return opacity !== undefined ? `${Math.round(opacity * 100)}%` : '100%';
			},
			fieldType: 'text',
			capabilities: { sortable: false }
		},
		{
			id: 'visible_to_roles',
			header: 'Visible to Roles',
			accessorFn: (row) => {
				// Return IDs - the entityConfig handles displaying names
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
					throw new Error(result.data?.message || 'Update failed');
				}
			}
		},
		{
			id: 'is_base_layer',
			header: 'Base',
			accessorKey: 'is_base_layer',
			fieldType: 'boolean',
			capabilities: { sortable: true, filterable: true }
		}
	]);
</script>

<div class="flex flex-col gap-6 min-w-0 w-full">
	<!-- Page Header -->
	<div class="flex items-start justify-between gap-6">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">{m.mapSettingsTitle()}</h1>
			<p class="text-muted-foreground">{m.mapSettingsSubtitle()}</p>
		</div>

		<!-- Map Defaults Summary -->
		<div class="shrink-0 text-sm text-right">
			<div class="text-muted-foreground">
				Default view: Zoom {effectiveDefaults().zoom}, Center {effectiveDefaults().center.lat.toFixed(4)}, {effectiveDefaults().center.lng.toFixed(4)}
			</div>
			<Button variant="ghost" size="sm" class="h-7 text-xs" onclick={() => (showDefaultsDialog = true)}>
				<Settings class="mr-1 h-3 w-3" />
				Edit defaults
			</Button>
		</div>
	</div>

	<!-- Tabs for Layers and Offline Packages -->
	<Tabs.Root bind:value={currentTab}>
		<Tabs.List>
			<Tabs.Trigger value="layers" class="flex items-center gap-2">
				<Layers class="h-4 w-4" />
				Layers
			</Tabs.Trigger>
			<Tabs.Trigger value="offline" class="flex items-center gap-2">
				<Package class="h-4 w-4" />
				Offline Packages
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
								{m.mapLayersTitle()}
							</Card.Title>
							<Card.Description>
								{#if data.baseLayer}
									Base layer: <strong>{data.baseLayer.name}</strong>
								{:else}
									No base layer configured - add a layer and mark it as base
								{/if}
							</Card.Description>
						</div>
						<Button onclick={openCreateLayerDialog} disabled={data.mapSources.length === 0}>
							<Plus class="mr-2 h-4 w-4" />
							Add Layer
						</Button>
					</div>
				</Card.Header>
				<Card.Content>
					{#if data.mapSources.length === 0}
						<div class="flex flex-col items-center justify-center py-12 text-center">
							<Map class="h-12 w-12 text-muted-foreground mb-4" />
							<p class="text-lg font-medium">No map sources available</p>
							<p class="text-muted-foreground mb-4">
								Add sources in the <a href="/map-sources" class="underline">Map Sources</a> page first
							</p>
						</div>
					{:else}
						<BaseTable
							data={data.mapLayers}
							columns={layerColumns}
							getRowId={(row) => row.id}
							emptyMessage={m.mapLayersEmpty()}
							emptySubMessage={m.mapLayersEmptyDescription()}
							showToolbar={true}
							showEditMode={true}
							editModeLabel="Edit mode"
							rowActions={{
								header: 'Actions',
								onDelete: openDeleteLayerDialog,
								customActions: [
									{
										label: 'Set as Base',
										icon: Star,
										onClick: setAsBaseLayer,
										isVisible: (row) => !row.is_base_layer
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
								Offline Packages
							</Card.Title>
							<Card.Description>
								Create tile packages for offline use by participants
							</Card.Description>
						</div>
						<Button onclick={openCreatePackageDialog} disabled={data.mapLayers.length === 0}>
							<Plus class="mr-2 h-4 w-4" />
							Create Package
						</Button>
					</div>
				</Card.Header>
				<Card.Content>
					{#if data.mapLayers.length === 0}
						<div class="flex flex-col items-center justify-center py-12 text-center">
							<Package class="h-12 w-12 text-muted-foreground mb-4" />
							<p class="text-lg font-medium">No layers configured</p>
							<p class="text-muted-foreground mb-4">
								Add map layers first before creating offline packages
							</p>
						</div>
					{:else if !data.offlinePackages || data.offlinePackages.length === 0}
						<div class="flex flex-col items-center justify-center py-12 text-center">
							<Package class="h-12 w-12 text-muted-foreground mb-4" />
							<p class="text-lg font-medium">No offline packages</p>
							<p class="text-muted-foreground mb-4">
								Create your first package to enable offline maps for participants
							</p>
							<Button onclick={openCreatePackageDialog}>
								<Plus class="mr-2 h-4 w-4" />
								Create Package
							</Button>
						</div>
					{:else}
						<BaseTable
							data={data.offlinePackages}
							columns={packageColumns}
							getRowId={(row) => row.id}
							emptyMessage="No offline packages"
							emptySubMessage="Create a package to enable offline maps"
							showToolbar={true}
							showEditMode={true}
							editModeLabel="Edit mode"
							rowActions={{
								header: 'Actions',
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

<!-- Create Layer Dialog -->
<Dialog.Root bind:open={showCreateLayerDialog}>
	<Dialog.Content class="max-w-xl">
		<Dialog.Header>
			<Dialog.Title>Add Map Layer</Dialog.Title>
			<Dialog.Description>Add a layer from your map sources library</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action="?/createLayer" use:layerEnhance class="space-y-4">
			<div class="space-y-2">
				<Label for="source_id">Source</Label>
				<select
					id="source_id"
					name="source_id"
					bind:value={$layerForm.source_id}
					onchange={(e) => handleSourceSelect(e.currentTarget.value)}
					class="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
					required
				>
					<option value="">-- Select a source --</option>
					{#each data.mapSources as source}
						<option value={source.id}>
							{source.name} ({source.source_type})
						</option>
					{/each}
				</select>
				<p class="text-xs text-muted-foreground">
					Manage sources in <a href="/map-sources" class="underline">Map Sources</a>
				</p>
			</div>

			<div class="space-y-2">
				<Label for="layer_name">Layer Name</Label>
				<Input id="layer_name" name="name" bind:value={$layerForm.name} required />
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div class="space-y-2">
					<Label for="layer_opacity">Opacity</Label>
					<Input
						id="layer_opacity"
						name="config.opacity"
						type="number"
						min="0"
						max="1"
						step="0.1"
						bind:value={$layerForm.config.opacity}
					/>
				</div>
				<div class="space-y-2">
					<Label for="layer_order">Display Order</Label>
					<Input
						id="layer_order"
						name="display_order"
						type="number"
						min="0"
						bind:value={$layerForm.display_order}
					/>
				</div>
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div class="space-y-2">
					<Label for="min_zoom">Min Zoom (optional)</Label>
					<Input
						id="min_zoom"
						name="config.min_zoom"
						type="number"
						min="0"
						max="22"
						bind:value={$layerForm.config.min_zoom}
						placeholder="0"
					/>
				</div>
				<div class="space-y-2">
					<Label for="max_zoom">Max Zoom (optional)</Label>
					<Input
						id="max_zoom"
						name="config.max_zoom"
						type="number"
						min="0"
						max="22"
						bind:value={$layerForm.config.max_zoom}
						placeholder="22"
					/>
				</div>
			</div>

			<div class="flex items-center gap-6">
				<div class="flex items-center space-x-2">
					<Switch id="is_base_layer" name="is_base_layer" bind:checked={$layerForm.is_base_layer} />
					<Label for="is_base_layer">Base Layer</Label>
				</div>
				<div class="flex items-center space-x-2">
					<Switch id="layer_is_active" name="is_active" bind:checked={$layerForm.is_active} />
					<Label for="layer_is_active">Active</Label>
				</div>
			</div>

			{#if $layerForm.is_base_layer && data.baseLayer}
				<p class="text-sm text-muted-foreground">
					This will replace "{data.baseLayer.name}" as the base layer.
				</p>
			{/if}

			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (showCreateLayerDialog = false)}>
					Cancel
				</Button>
				<Button type="submit" disabled={isSubmitting || !$layerForm.source_id}>
					{isSubmitting ? 'Saving...' : 'Add Layer'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Project Map Defaults Dialog -->
<Dialog.Root bind:open={showDefaultsDialog}>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Map Default View</Dialog.Title>
			<Dialog.Description>
				Fallback settings when no base layer is configured
			</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action="?/saveDefaults" use:defaultsEnhance class="space-y-4">
			<div class="space-y-2">
				<Label for="default_zoom">Default Zoom</Label>
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
					<Label for="center_lat">Center Latitude</Label>
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
					<Label for="center_lng">Center Longitude</Label>
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
					Cancel
				</Button>
				<Button type="submit" disabled={isSavingDefaults}>
					{isSavingDefaults ? 'Saving...' : 'Save Defaults'}
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
					{#if selectedLayer.is_base_layer}
						<Badge variant="destructive" class="mt-2">This is the base layer</Badge>
					{/if}
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={handleDeleteLayer}>Delete</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Create Package Dialog -->
<Dialog.Root bind:open={showCreatePackageDialog}>
	<Dialog.Content class="max-w-2xl max-h-[90vh] flex flex-col">
		<Dialog.Header class="shrink-0">
			<Dialog.Title>Create Offline Package</Dialog.Title>
			<Dialog.Description>
				Define a region and select layers to include in the offline package.
				Participants will be able to download this package for offline use.
			</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-4 py-4 overflow-y-auto flex-1 pr-2">
			<div class="grid gap-2">
				<Label for="package_name">Package Name</Label>
				<Input
					id="package_name"
					bind:value={packageFormData.name}
					placeholder="e.g., Downtown Area"
					required
				/>
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div class="grid gap-2">
					<Label for="zoom_min">Min Zoom</Label>
					<Input
						id="zoom_min"
						type="number"
						min="0"
						max="22"
						bind:value={packageFormData.zoom_min}
					/>
				</div>
				<div class="grid gap-2">
					<Label for="zoom_max">Max Zoom</Label>
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
				<Label>Region</Label>
				{#if selectedRegion && regionStats()}
					<div class="flex items-center justify-between p-3 border rounded-md bg-muted/50">
						<div class="flex items-center gap-2">
							<MapPin class="h-4 w-4 text-muted-foreground" />
							<div>
								<div class="text-sm font-medium">{formatArea(regionStats()!.area)}</div>
								<div class="text-xs text-muted-foreground">{formatTileCount(regionStats()!.tiles)} tiles at zoom {packageFormData.zoom_min}-{packageFormData.zoom_max}</div>
							</div>
						</div>
						<Button variant="outline" size="sm" onclick={() => (showRegionSelector = true)}>
							<Pencil class="h-4 w-4 mr-1" />
							Edit Region
						</Button>
					</div>
				{:else}
					<Button variant="outline" class="w-full justify-start h-auto py-4" onclick={() => (showRegionSelector = true)}>
						<MapPin class="h-5 w-5 mr-2 text-muted-foreground" />
						<div class="text-left">
							<div class="font-medium">Draw Region on Map</div>
							<div class="text-xs text-muted-foreground">Click to open the map and select an area</div>
						</div>
					</Button>
				{/if}
			</div>

			<div class="grid gap-2">
				<Label>Layers to Include</Label>
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
							{#if layer.is_base_layer}
								<Badge variant="outline" class="text-xs">Base</Badge>
							{/if}
						</label>
					{/each}
				</div>
			</div>

			<div class="grid gap-2">
				<Label>Visible to Roles</Label>
				<MobileMultiSelect
					bind:selectedIds={packageFormData.visible_to_roles}
					options={data.roles}
					getOptionId={(r) => r.id}
					getOptionLabel={(r) => r.name}
					getOptionDescription={(r) => r.description}
					placeholder="All roles (leave empty for all)"
				/>
				<p class="text-xs text-muted-foreground">
					Leave empty to make this package available to all roles.
				</p>
			</div>
		</div>

		<Dialog.Footer class="shrink-0">
			<Button type="button" variant="outline" onclick={() => (showCreatePackageDialog = false)}>
				Cancel
			</Button>
			<Button onclick={handleCreatePackage} disabled={isCreatingPackage}>
				{#if isCreatingPackage}
					<Loader2 class="mr-2 h-4 w-4 animate-spin" />
					Creating...
				{:else}
					Create Package
				{/if}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Delete Package Dialog -->
<AlertDialog.Root bind:open={showDeletePackageDialog}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete Package</AlertDialog.Title>
			<AlertDialog.Description>
				Are you sure you want to delete this offline package? This action cannot be undone.
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
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={handleDeletePackage} class="bg-destructive text-destructive-foreground hover:bg-destructive/90">
				Delete
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
