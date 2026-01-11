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
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Badge } from '$lib/components/ui/badge';
	import { Map, Plus, Layers, Star, Settings } from 'lucide-svelte';
	import { BaseTable, type BaseColumnConfig } from '$lib/components/admin/base-table';
	import type { MapLayerWithSource, MapLayerConfig } from '$lib/types/map-layer';
	import type { MapSource } from '$lib/types/map-sources';

	let { data } = $props();

	// Dialog state
	let showCreateLayerDialog = $state(false);
	let showDeleteLayerDialog = $state(false);
	let showDefaultsDialog = $state(false);
	let selectedLayer = $state<MapLayerWithSource | null>(null);
	let isSubmitting = $state(false);
	let isSavingDefaults = $state(false);

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

	// Layer table columns
	const layerColumns: BaseColumnConfig<MapLayerWithSource>[] = [
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
				if (!row.visible_to_roles || row.visible_to_roles.length === 0) return [];
				return row.visible_to_roles.map((roleId: string) => {
					const role = data.roles.find((r) => r.id === roleId);
					return role?.name || roleId;
				});
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
	];
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

	<!-- Map Layers Section -->
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
