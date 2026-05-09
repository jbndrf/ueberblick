<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { Plus, Package, Loader2, MapPin, Pencil } from '@lucide/svelte';
	import { RegionSelector } from '$lib/components/map';
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';
	import {
		formatArea,
		formatTileCount,
		estimateTileCount,
		calculatePolygonAreaKm2
	} from '$lib/utils/geo-utils';
	import type { Feature, Polygon } from 'geojson';
	import { BaseTable, type BaseColumnConfig } from '$lib/components/admin/base-table';
	import type { MapLayer } from '$lib/types/map-layer';
	import SettingsSection from '../SettingsSection.svelte';

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

	let packageGeoJsonError = $state('');
	let showRegionSelector = $state(false);
	let selectedRegion: Feature<Polygon> | null = $state(null);

	const regionStats = $derived(() => {
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
				toast.success(
					m.mapSettingsPackageCreatedProcessing?.() ?? 'Package created and processing started'
				);
				showCreatePackageDialog = false;
				resetPackageForm();
				invalidateAll();
			} else {
				toast.error(
					result.data?.message ||
						(m.mapSettingsPackageCreateError?.() ?? 'Failed to create package')
				);
			}
		} catch {
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
					throw new Error(
						result.data?.message || (m.mapSettingsUpdateFailed?.() ?? 'Update failed')
					);
				}
			}
		}
	]);
</script>

<SettingsSection
	name={m.mapSettingsOfflinePackagesTitle?.() ?? 'Offline Packages'}
	description={m.mapSettingsOfflinePackagesDescription?.() ??
		'Create tile packages for offline use by participants'}
>
	{#snippet actions()}
		<Button onclick={openCreatePackageDialog} disabled={data.mapLayers.length === 0}>
			<Plus class="mr-2 h-4 w-4" />
			{m.mapSettingsCreatePackage?.() ?? 'Create Package'}
		</Button>
	{/snippet}

	{#if data.mapLayers.length === 0}
		<div
			class="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center"
		>
			<Package class="mb-4 h-12 w-12 text-muted-foreground" />
			<p class="text-lg font-medium">
				{m.mapSettingsNoLayersConfigured?.() ?? 'No layers configured'}
			</p>
			<p class="mb-4 text-muted-foreground">
				{m.mapSettingsAddLayersFirst?.() ?? 'Add map layers first before creating offline packages'}
			</p>
		</div>
	{:else if !data.offlinePackages || data.offlinePackages.length === 0}
		<div
			class="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center"
		>
			<Package class="mb-4 h-12 w-12 text-muted-foreground" />
			<p class="text-lg font-medium">
				{m.mapSettingsNoOfflinePackages?.() ?? 'No offline packages'}
			</p>
			<p class="mb-4 text-muted-foreground">
				{m.mapSettingsNoOfflinePackagesDescription?.() ??
					'Create your first package to enable offline maps for participants'}
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
			emptySubMessage={m.mapSettingsCreatePackageHint?.() ??
				'Create a package to enable offline maps'}
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
</SettingsSection>

<!-- Create Package Dialog -->
<Dialog.Root bind:open={showCreatePackageDialog}>
	<Dialog.Content class="flex max-h-[90vh] max-w-2xl flex-col">
		<Dialog.Header class="shrink-0">
			<Dialog.Title>
				{m.mapSettingsCreateOfflinePackageTitle?.() ?? 'Create Offline Package'}
			</Dialog.Title>
			<Dialog.Description>
				{m.mapSettingsCreateOfflinePackageDescription?.() ??
					'Define a region and select layers to include in the offline package. Participants will be able to download this package for offline use.'}
			</Dialog.Description>
		</Dialog.Header>
		<div class="grid flex-1 gap-4 overflow-y-auto py-4 pr-2">
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
					<div class="flex items-center justify-between rounded-md border bg-muted/50 p-3">
						<div class="flex items-center gap-2">
							<MapPin class="h-4 w-4 text-muted-foreground" />
							<div>
								<div class="text-sm font-medium">{formatArea(regionStats()!.area)}</div>
								<div class="text-xs text-muted-foreground">
									{formatTileCount(regionStats()!.tiles)}
									{m.mapSettingsTilesAtZoom?.() ?? 'tiles at zoom'}
									{packageFormData.zoom_min}-{packageFormData.zoom_max}
								</div>
							</div>
						</div>
						<Button variant="outline" size="sm" onclick={() => (showRegionSelector = true)}>
							<Pencil class="mr-1 h-4 w-4" />
							{m.mapSettingsEditRegion?.() ?? 'Edit Region'}
						</Button>
					</div>
				{:else}
					<Button
						variant="outline"
						class="h-auto w-full justify-start py-4"
						onclick={() => (showRegionSelector = true)}
					>
						<MapPin class="mr-2 h-5 w-5 text-muted-foreground" />
						<div class="text-left">
							<div class="font-medium">{m.mapSettingsDrawRegion?.() ?? 'Draw Region on Map'}</div>
							<div class="text-xs text-muted-foreground">
								{m.mapSettingsDrawRegionHint?.() ?? 'Click to open the map and select an area'}
							</div>
						</div>
					</Button>
				{/if}
			</div>

			<div class="grid gap-2">
				<Label>{m.mapSettingsLayersToInclude?.() ?? 'Layers to Include'}</Label>
				<div class="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
					{#each data.mapLayers as layer (layer.id)}
						<label class="flex cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								checked={packageFormData.layers.includes(layer.id)}
								onchange={(e) => {
									if (e.currentTarget.checked) {
										packageFormData.layers = [...packageFormData.layers, layer.id];
									} else {
										packageFormData.layers = packageFormData.layers.filter(
											(id: string) => id !== layer.id
										);
									}
								}}
								class="h-4 w-4 rounded border-gray-300"
							/>
							<span class="text-sm">{layer.name}</span>
							{#if layer.layer_type === 'base'}
								<Badge variant="outline" class="text-xs">
									{m.mapSettingsBaseLayerBadge?.() ?? 'Base'}
								</Badge>
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
					{m.mapSettingsAllRolesHelp?.() ??
						'Leave empty to make this package available to all roles.'}
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
			<AlertDialog.Title>
				{m.mapSettingsDeletePackageTitle?.() ?? 'Delete Package'}
			</AlertDialog.Title>
			<AlertDialog.Description>
				{m.mapSettingsDeletePackageConfirmation?.() ??
					'Are you sure you want to delete this offline package? This action cannot be undone.'}
				{#if selectedPackage}
					<strong class="mt-2 block">{selectedPackage.name}</strong>
					{#if selectedPackage.status === 'ready'}
						<p class="mt-1 text-sm text-muted-foreground">
							{selectedPackage.tile_count?.toLocaleString()} tiles, {formatFileSize(
								selectedPackage.file_size_bytes
							)}
						</p>
					{/if}
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.mapSettingsCancel?.() ?? 'Cancel'}</AlertDialog.Cancel>
			<AlertDialog.Action
				onclick={handleDeletePackage}
				class="text-destructive-foreground bg-destructive hover:bg-destructive/90"
			>
				{m.mapSettingsDeleteConfirm?.() ?? 'Delete'}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

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
