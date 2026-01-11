<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { mapSettingsSchema, mapLayerSchema } from '$lib/schemas/map-settings';
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
	import { Map, Plus, Layers, Trash2, Star, Check } from 'lucide-svelte';
	import { BaseTable, type BaseColumnConfig } from '$lib/components/admin/base-table';
	import type { MapLayer } from '$lib/types/map-layer';

	let { data } = $props();

	// Dialog state
	let showCreateLayerDialog = $state(false);
	let showDeleteLayerDialog = $state(false);
	let selectedLayer = $state<MapLayer | null>(null);
	let isSubmitting = $state(false);
	let isSaving = $state(false);
	let saveTimeout: ReturnType<typeof setTimeout> | null = null;

	// Settings form (view settings only - zoom and center)
	const {
		form: settingsForm,
		errors: settingsErrors,
		enhance: settingsEnhance
	} = superForm(data.settingsForm, {
		validators: zodClient(mapSettingsSchema),
		dataType: 'json',
		onSubmit: () => {
			isSaving = true;
		},
		onResult: ({ result }) => {
			isSaving = false;
			if (result.type === 'success') {
				invalidateAll();
			} else if (result.type === 'failure') {
				toast.error(result.data?.message || m.mapSettingsSaveError());
			}
		}
	});

	// Auto-save settings with debounce
	let formRef: HTMLFormElement | undefined = $state();
	let isInitialLoad = true;
	$effect(() => {
		// Track all form values
		const _ = [$settingsForm.min_zoom, $settingsForm.max_zoom, $settingsForm.default_zoom, $settingsForm.center_lat, $settingsForm.center_lng];

		// Skip initial load
		if (isInitialLoad) {
			isInitialLoad = false;
			return;
		}

		// Clear existing timeout
		if (saveTimeout) {
			clearTimeout(saveTimeout);
		}

		// Debounce save
		saveTimeout = setTimeout(() => {
			if (formRef) {
				formRef.requestSubmit();
			}
		}, 500);
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

	// Get base layer info
	const baseLayer = $derived(data.mapLayers.find((l) => l.is_base_layer && l.is_active));

	// Layer management
	function openCreateLayerDialog() {
		resetLayerForm();
		$layerForm = {
			name: '',
			layer_type: 'tile',
			url: '',
			config: { opacity: 1, attribution: '' },
			display_order: data.mapLayers.length,
			visible_to_roles: [],
			is_base_layer: !baseLayer, // Default to base if none exists
			is_active: true
		};
		showCreateLayerDialog = true;
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

	async function setAsBaseLayer(layer: MapLayer) {
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

	// Layer table columns
	const layerColumns: BaseColumnConfig<MapLayer>[] = [
		{
			id: 'name',
			header: m.mapLayerName(),
			accessorKey: 'name',
			fieldType: 'text',
			capabilities: { sortable: true, filterable: true }
		},
		{
			id: 'layer_type',
			header: m.mapLayerType(),
			accessorFn: (row) => row.layer_type?.toUpperCase() || '-',
			fieldType: 'text',
			capabilities: { sortable: true, filterable: true }
		},
		{
			id: 'url',
			header: m.mapLayerUrl(),
			accessorFn: (row) => {
				if (!row.url) return '-';
				return row.url.length > 40 ? row.url.substring(0, 37) + '...' : row.url;
			},
			fieldType: 'text',
			capabilities: { sortable: false, filterable: false }
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
	<!-- Page Header with Default View Settings -->
	<div class="flex items-start justify-between gap-6">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">{m.mapSettingsTitle()}</h1>
			<p class="text-muted-foreground">{m.mapSettingsSubtitle()}</p>
		</div>

		<!-- Compact Map View Settings - inline with header -->
		<form bind:this={formRef} method="POST" action="?/saveSettings" use:settingsEnhance class="shrink-0 flex flex-col gap-1.5 text-sm">
			<div class="flex items-center gap-2">
				<span class="text-muted-foreground w-14">Zoom:</span>
				<Input
					id="min_zoom"
					name="min_zoom"
					type="number"
					min="0"
					max="22"
					class="h-7 w-14 text-sm"
					bind:value={$settingsForm.min_zoom}
				/>
				<span class="text-muted-foreground text-xs">min</span>
				<Input
					id="max_zoom"
					name="max_zoom"
					type="number"
					min="0"
					max="22"
					class="h-7 w-14 text-sm"
					bind:value={$settingsForm.max_zoom}
				/>
				<span class="text-muted-foreground text-xs">max</span>
				<Input
					id="default_zoom"
					name="default_zoom"
					type="number"
					min="0"
					max="22"
					class="h-7 w-14 text-sm"
					bind:value={$settingsForm.default_zoom}
				/>
				<span class="text-muted-foreground text-xs">default</span>
			</div>
			<div class="flex items-center gap-2">
				<span class="text-muted-foreground w-14">Center:</span>
				<Input
					id="center_lat"
					name="center_lat"
					type="number"
					step="0.0001"
					class="h-7 w-24 text-sm"
					bind:value={$settingsForm.center_lat}
				/>
				<span class="text-muted-foreground text-xs">lat</span>
				<Input
					id="center_lng"
					name="center_lng"
					type="number"
					step="0.0001"
					class="h-7 w-24 text-sm"
					bind:value={$settingsForm.center_lng}
				/>
				<span class="text-muted-foreground text-xs">lng</span>
				{#if isSaving}
					<span class="text-muted-foreground text-xs ml-2">saving...</span>
				{/if}
			</div>
		</form>
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
						{#if baseLayer}
							Base layer: <strong>{baseLayer.name}</strong>
						{:else}
							No base layer configured - add a tile layer and mark it as base
						{/if}
					</Card.Description>
				</div>
				<Button onclick={openCreateLayerDialog}>
					<Plus class="mr-2 h-4 w-4" />
					Add Layer
				</Button>
			</div>
		</Card.Header>
		<Card.Content>
			<BaseTable
				data={data.mapLayers.filter((l) => l.is_active)}
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
							isVisible: (row) => !row.is_base_layer && row.layer_type === 'tile'
						}
					]
				}}
			/>
		</Card.Content>
	</Card.Root>
</div>

<!-- Create Layer Dialog -->
<Dialog.Root bind:open={showCreateLayerDialog}>
	<Dialog.Content class="max-w-xl">
		<Dialog.Header>
			<Dialog.Title>Add Map Layer</Dialog.Title>
			<Dialog.Description>Add a tile layer, WMS service, or GeoJSON overlay</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action="?/createLayer" use:layerEnhance class="space-y-4">
			<div class="space-y-2">
				<Label for="layer_name">Name</Label>
				<Input id="layer_name" name="name" bind:value={$layerForm.name} required />
			</div>

			<div class="space-y-2">
				<Label for="layer_type">Layer Type</Label>
				<select
					id="layer_type"
					name="layer_type"
					bind:value={$layerForm.layer_type}
					class="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
				>
					<option value="tile">TILE</option>
					<option value="wms">WMS</option>
					<option value="geojson">GEOJSON</option>
					<option value="custom">CUSTOM</option>
				</select>
			</div>

			<div class="space-y-2">
				<Label for="layer_url">URL</Label>
				<Input
					id="layer_url"
					name="url"
					bind:value={$layerForm.url}
					placeholder={'https://tile.openstreetmap.org/{z}/{x}/{y}.png'}
				/>
			</div>

			<div class="space-y-2">
				<Label for="layer_attribution">Attribution</Label>
				<Input
					id="layer_attribution"
					name="config.attribution"
					bind:value={$layerForm.config.attribution}
					placeholder="OpenStreetMap contributors"
				/>
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

			{#if $layerForm.is_base_layer && baseLayer}
				<p class="text-sm text-muted-foreground">
					This will replace "{baseLayer.name}" as the base layer.
				</p>
			{/if}

			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (showCreateLayerDialog = false)}>
					Cancel
				</Button>
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting ? 'Saving...' : 'Add Layer'}
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
