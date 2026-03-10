<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import { getParticipantGateway, resetAllParticipantState } from '$lib/participant-state/context.svelte';
	import {
		getDownloadProgress,
		getDownloadCompleteSignal
	} from '$lib/participant-state';
	import { resetPocketBase } from '$lib/pocketbase';
	import { disconnectRealtime } from '$lib/participant-state';
	import { Loader2 } from 'lucide-svelte';
	import { MapCanvas, BottomControlBar, LayerSheet, FilterSheet, WorkflowSelector, SettingsSheet } from './components';
	import { WorkflowInstanceDetailModule, createSelection, type Selection, type Marker } from './modules';
	import { FormFillTool } from './modules/workflow-instance-detail/tools';
	import ModuleShell from '$lib/components/module-shell.svelte';
	import type { Map as LeafletMap } from 'leaflet';
	import { mapNavCallbacks } from './nav-store.svelte';

	interface Workflow {
		id: string;
		name: string;
		workflow_type: 'incident' | 'survey';
		description?: string;
		entry_button_label?: string;
		entry_allowed_roles?: string[];
		filter_value_icons?: Record<string, any>;
	}

	interface PendingWorkflow {
		workflow: Workflow;
		coordinates?: { lat: number; lng: number };
	}

	interface Props {
		data: {
			participant: {
				id: string;
				role_id?: string;
				[key: string]: unknown;
			};
			collectionNames?: string[];
			fileFields?: Record<string, string[]>;
		};
	}

	let { data }: Props = $props();

	/** Parse a field value that might be a JSON array (multiple_choice) into individual values */
	function splitMultiValue(value: string): string[] {
		if (value.startsWith('[')) {
			try { return JSON.parse(value); } catch { /* fall through */ }
		}
		return [value];
	}

	const gateway = getParticipantGateway();

	// Map reference
	let map = $state<LeafletMap | null>(null);

	// UI state
	let layerSheetOpen = $state(false);
	let filterSheetOpen = $state(false);
	let workflowSelectorOpen = $state(false);
	let isSelectingCoordinates = $state(false);
	let settingsSheetOpen = $state(false);

	// Set up navigation callbacks for header (desktop) navigation
	onMount(() => {
		mapNavCallbacks.set({
			onLayersClick: () => (layerSheetOpen = true),
			onFiltersClick: () => (filterSheetOpen = true),
			onLocationClick: centerOnLocation,
			onToolsClick: () => (settingsSheetOpen = true),
			onWorkflowClick: () => (workflowSelectorOpen = !workflowSelectorOpen)
		});
	});

	onDestroy(() => {
		mapNavCallbacks.set({});
	});

	// Selection state
	let selection = $state<Selection>(createSelection.none());

	// Workflow creation state (for new workflows via entry form)
	let pendingWorkflow = $state<PendingWorkflow | null>(null);
	let formFillOpen = $state(false);

	// Shared bottom sheet expanded state (preserves peek/expanded when switching sheets)
	let sheetExpanded = $state(false);

	// Track if location editing is active (from WorkflowInstanceDetailModule)
	let isEditingLocation = $state(false);

	// ==========================================================================
	// Live Queries -- reactive, auto-updating from IndexedDB
	// ==========================================================================

	const layersLive = gateway.collection('map_layers').live({ filter: 'is_active = true', sort: 'display_order' });
	const markersLive = gateway.collection('markers').live({ expand: 'category_id' });
	const instancesLive = gateway.collection('workflow_instances').live({ expand: 'workflow_id' });
	const workflowsLive = gateway.collection('workflows').live({ filter: 'is_active = true' });
	const stagesLive = gateway.collection('workflow_stages').live();
	const fieldTagsLive = gateway.collection('tools_field_tags').live();
	const fieldValuesLive = gateway.collection('workflow_instance_field_values').live();
	const connectionsLive = gateway.collection('workflow_connections').live({ filter: 'from_stage_id = ""' });

	// Derived data from live queries
	const mapLayers = $derived(layersLive.records);
	const markers = $derived(markersLive.records);
	const workflowInstances = $derived(instancesLive.records);
	const workflowStages = $derived(stagesLive.records);
	const fieldTags = $derived(fieldTagsLive.records);
	const fieldValues = $derived(fieldValuesLive.records);

	// Workflows with entry labels derived from connections, filtered by participant role
	const workflows: Workflow[] = $derived.by(() => {
		const entryLabelByWorkflow = new Map<string, string>();
		for (const conn of connectionsLive.records) {
			const label = (conn.visual_config as any)?.button_label;
			if (label) entryLabelByWorkflow.set(conn.workflow_id as string, label);
		}
		const participantRoleId = data.participant.role_id;
		return (workflowsLive.records as any[])
			.filter(wf => {
				const roles = wf.entry_allowed_roles;
				return !roles || roles.length === 0 || (participantRoleId && roles.includes(participantRoleId));
			})
			.map(wf => ({
				...wf,
				entry_button_label: entryLabelByWorkflow.get(wf.id) || wf.name
			}));
	});

	// Loading: true until first IndexedDB read completes for key collections
	const isLoading = $derived(layersLive.loading && markersLive.loading);

	// Cleanup live queries on destroy
	onDestroy(() => {
		layersLive.destroy();
		markersLive.destroy();
		instancesLive.destroy();
		workflowsLive.destroy();
		stagesLive.destroy();
		fieldTagsLive.destroy();
		fieldValuesLive.destroy();
		connectionsLive.destroy();
	});

	// Layer state
	let activeBaseLayerId = $state<string | null>(null);
	let activeOverlayIds = $state<string[]>([]);

	// Filter state - which categories/workflows are visible on map
	let visibleCategoryIds = $state<string[]>([]);
	let visibleWorkflowIds = $state<string[]>([]);

	// Tag value visibility: workflowId -> Set of visible tag values (all visible by default)
	let visibleTagValues = $state<Map<string, Set<string>>>(new Map());

	// ==========================================================================
	// Initialization Effects (run once when data first arrives)
	// ==========================================================================

	// Initialize default base layer selection
	$effect(() => {
		if (mapLayers.length && !untrack(() => activeBaseLayerId)) {
			const firstBase = mapLayers.find((l: any) => l.layer_type === 'base');
			if (firstBase) activeBaseLayerId = firstBase.id;
		}
	});

	// Initialize filters - all categories visible by default
	$effect(() => {
		if (markers.length > 0 && untrack(() => visibleCategoryIds.length) === 0) {
			const categoryIds = [...new Set(markers.map((m: any) => m.category_id).filter(Boolean))];
			visibleCategoryIds = categoryIds;
		}
	});

	// Initialize filters - all workflows visible by default
	$effect(() => {
		if (workflowInstances.length > 0 && untrack(() => visibleWorkflowIds.length) === 0) {
			const workflowIds = [...new Set(workflowInstances.map((i: any) => i.workflow_id).filter(Boolean))];
			visibleWorkflowIds = workflowIds;
		}
	});

	// Initialize tag value visibility - all values visible by default
	$effect(() => {
		if (fieldTags.length > 0 && untrack(() => visibleTagValues.size) === 0) {
			const newMap = new Map<string, Set<string>>();
			for (const ft of fieldTags) {
				const mappings = (ft as any).tag_mappings || [];
				for (const mapping of mappings) {
					if (mapping.tagType !== 'filterable') continue;
					const wfId = (ft as any).workflow_id;
					const filterBy = (mapping.config?.filterBy as string) || 'field';

					if (filterBy === 'stage') {
						const vals = new Set<string>();
						for (const inst of workflowInstances) {
							if ((inst as any).workflow_id === wfId && (inst as any).current_stage_id) {
								vals.add((inst as any).current_stage_id);
							}
						}
						if (vals.size > 0) {
							newMap.set(wfId, vals);
						}
					} else if (mapping.fieldId) {
						const vals = new Set<string>();
						for (const fv of fieldValues) {
							if ((fv as any).field_key === mapping.fieldId && (fv as any).value) {
								for (const v of splitMultiValue((fv as any).value)) {
									vals.add(v);
								}
							}
						}
						if (vals.size > 0) {
							newMap.set(wfId, vals);
						}
					}
				}
			}
			visibleTagValues = newMap;
		}
	});

	// ==========================================================================
	// Download Progress & Event Signals
	// ==========================================================================

	const downloadProgress = $derived(getDownloadProgress());

	// ==========================================================================
	// Derived Filter Data
	// ==========================================================================

	/**
	 * For each workflow with a "filterable" tag mapping, build a map:
	 * instanceId -> filter value (stage ID or field value depending on mode)
	 */
	const filterableValues = $derived.by(() => {
		const map = new Map<string, string>();
		for (const ft of fieldTags) {
			const mappings = ((ft as any).tag_mappings || []) as Array<{ tagType: string; fieldId: string | null; config: Record<string, unknown> }>;
			for (const mapping of mappings) {
				if (mapping.tagType !== 'filterable') continue;
				const filterBy = (mapping.config?.filterBy as string) || 'field';

				if (filterBy === 'stage') {
					for (const inst of workflowInstances) {
						if ((inst as any).workflow_id === (ft as any).workflow_id && (inst as any).current_stage_id) {
							map.set((inst as any).id, (inst as any).current_stage_id);
						}
					}
				} else if (mapping.fieldId) {
					for (const fv of fieldValues) {
						if ((fv as any).field_key === mapping.fieldId && (fv as any).value) {
							map.set((fv as any).instance_id, (fv as any).value);
						}
					}
				}
			}
		}
		return map;
	});

	// ==========================================================================
	// Marker Selection & Navigation
	// ==========================================================================

	const selectableMarkers = $derived(
		markers.filter((m: any) => visibleCategoryIds.includes(m.category_id) && m.location?.lat && m.location?.lon)
	);

	const currentIndex = $derived.by(() => {
		if (selection.type !== 'marker') return -1;
		return selectableMarkers.findIndex((m: any) => m.id === selection.markerId);
	});

	const canGoNext = $derived(currentIndex >= 0 && currentIndex < selectableMarkers.length - 1);
	const canGoPrevious = $derived(currentIndex > 0);

	function handleMarkerClick(marker: any) {
		selection = createSelection.marker(marker.id);
	}

	function handleWorkflowInstanceClick(instance: any) {
		selection = createSelection.workflowInstance(instance.id);
	}

	function handleSelectionClose() {
		selection = createSelection.none();
	}

	function handleNavigateNext() {
		if (!canGoNext) return;
		const nextMarker = selectableMarkers[currentIndex + 1];
		if (nextMarker) {
			selection = createSelection.marker(nextMarker.id);
		}
	}

	function handleNavigatePrevious() {
		if (!canGoPrevious) return;
		const prevMarker = selectableMarkers[currentIndex - 1];
		if (prevMarker) {
			selection = createSelection.marker(prevMarker.id);
		}
	}

	// ==========================================================================
	// UI Handlers
	// ==========================================================================

	function handleOverlayToggle(id: string, active: boolean) {
		if (active) {
			activeOverlayIds = [...activeOverlayIds, id];
		} else {
			activeOverlayIds = activeOverlayIds.filter((x) => x !== id);
		}
	}

	function handleCategoryToggle(categoryId: string, visible: boolean) {
		if (visible) {
			visibleCategoryIds = [...visibleCategoryIds, categoryId];
		} else {
			visibleCategoryIds = visibleCategoryIds.filter((x) => x !== categoryId);
		}
	}

	function handleWorkflowToggle(workflowId: string, visible: boolean) {
		if (visible) {
			visibleWorkflowIds = [...visibleWorkflowIds, workflowId];
		} else {
			visibleWorkflowIds = visibleWorkflowIds.filter((x) => x !== workflowId);
		}
	}

	function handleTagValueToggle(workflowId: string, tagValue: string, visible: boolean) {
		const newMap = new Map(visibleTagValues);
		const current = newMap.get(workflowId) ?? new Set<string>();
		const updated = new Set(current);
		if (visible) {
			updated.add(tagValue);
		} else {
			updated.delete(tagValue);
		}
		newMap.set(workflowId, updated);
		visibleTagValues = newMap;

		if (updated.size > 0 && !visibleWorkflowIds.includes(workflowId)) {
			visibleWorkflowIds = [...visibleWorkflowIds, workflowId];
		} else if (updated.size === 0 && visibleWorkflowIds.includes(workflowId)) {
			visibleWorkflowIds = visibleWorkflowIds.filter((x) => x !== workflowId);
		}
	}

	// ==========================================================================
	// Workflow Creation (new workflow via entry form)
	// ==========================================================================

	function handleWorkflowSelect(workflow: Workflow, coordinates?: { lat: number; lng: number }) {
		console.log('Workflow selected:', workflow, 'Coordinates:', coordinates);
		pendingWorkflow = { workflow, coordinates };
		formFillOpen = true;
	}

	async function handleFormSubmit(formValues: Record<string, unknown>, connectionId: string) {
		if (!pendingWorkflow) return;

		const { workflow, coordinates } = pendingWorkflow;

		const stages = workflowStages.filter((s: any) => s.workflow_id === workflow.id);
		const startStage = stages.find((s: any) => s.stage_type === 'start') || stages[0];

		if (!startStage) {
			console.error('No start stage found for workflow:', workflow.id);
			throw new Error('No start stage found');
		}

		try {
			const instance = await gateway.collection('workflow_instances').create({
				workflow_id: workflow.id,
				current_stage_id: (startStage as any).id,
				status: 'active',
				created_by: data.participant.id,
				location: coordinates ? { lat: coordinates.lat, lon: coordinates.lng } : null,
				files: []
			});

			console.log('Workflow instance created:', instance.id);

			const fieldEntries = Object.entries(formValues).filter(([_, value]) => value !== null && value !== undefined && value !== '');

			const createdFields = fieldEntries.map(([fieldId, value]) => ({
				field_key: fieldId,
				value: Array.isArray(value) && value[0] instanceof File
					? `[${(value as File[]).length} file(s)]`
					: typeof value === 'object' ? JSON.stringify(value) : String(value)
			}));

			const toolUsage = await gateway.collection('workflow_instance_tool_usage').create({
				instance_id: instance.id,
				stage_id: (startStage as any).id,
				executed_by: gateway.participantId,
				executed_at: new Date().toISOString(),
				metadata: {
					action: 'instance_created',
					location: coordinates ? { lat: coordinates.lat, lon: coordinates.lng } : null,
					created_fields: createdFields
				}
			}) as { id: string };

			for (const [fieldId, value] of fieldEntries) {
				if (Array.isArray(value) && value.length > 0 && value[0] instanceof File) {
					for (const file of value as File[]) {
						const formData = new FormData();
						formData.append('instance_id', instance.id);
						formData.append('field_key', fieldId);
						formData.append('stage_id', (startStage as any).id);
						formData.append('value', '');
						formData.append('file_value', file);
						formData.append('created_by_action', toolUsage.id);

						await gateway.collection('workflow_instance_field_values').create(formData);
					}
				} else {
					const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

					await gateway.collection('workflow_instance_field_values').create({
						instance_id: instance.id,
						field_key: fieldId,
						stage_id: (startStage as any).id,
						value: stringValue,
						created_by_action: toolUsage.id
					});
				}
			}

			// Live queries auto-update via notifyDataChange from gateway.create()

			// Ensure the new workflow type is visible
			if (!visibleWorkflowIds.includes(workflow.id)) {
				visibleWorkflowIds = [...visibleWorkflowIds, workflow.id];
			}

			formFillOpen = false;
			pendingWorkflow = null;
			selection = createSelection.workflowInstance(instance.id);
		} catch (error) {
			console.error('Failed to create workflow instance:', error);
			throw error;
		}
	}

	function handleFormClose() {
		formFillOpen = false;
		pendingWorkflow = null;
	}

	// ==========================================================================
	// Map Handlers
	// ==========================================================================

	function handleMapReady(leafletMap: LeafletMap) {
		map = leafletMap;
	}

	function handleMapClick() {
		if (isEditingLocation) return;
		if (selection.type !== 'none') {
			selection = createSelection.none();
		}
	}

	function centerOnLocation() {
		if ('geolocation' in navigator && map) {
			navigator.geolocation.getCurrentPosition(
				(position) => {
					const { latitude, longitude } = position.coords;
					map?.setView([latitude, longitude], 16);
				},
				(error) => {
					console.error('Geolocation error:', error);
				}
			);
		}
	}

	async function handleLogout() {
		try {
			disconnectRealtime();
			await resetAllParticipantState();
			resetPocketBase();
			await fetch('/participant/logout', {
				method: 'POST',
				redirect: 'manual'
			});
		} catch (error) {
			console.error('Logout error:', error);
		}
		window.location.href = '/participant/login';
	}
</script>

<div class="relative h-full w-full">
	<MapCanvas
		layers={mapLayers}
		{activeBaseLayerId}
		{activeOverlayIds}
		{markers}
		{visibleCategoryIds}
		{workflowInstances}
		{workflowStages}
		{visibleWorkflowIds}
		{filterableValues}
		{visibleTagValues}
		{workflows}
		onMarkerClick={handleMarkerClick}
		onWorkflowInstanceClick={handleWorkflowInstanceClick}
		onMapReady={handleMapReady}
		onMapClick={handleMapClick}
	/>

	<BottomControlBar
		onLayersClick={() => (layerSheetOpen = true)}
		onFiltersClick={() => (filterSheetOpen = true)}
		onToolsClick={() => (settingsSheetOpen = true)}
		onLocationClick={centerOnLocation}
		{workflows}
		{map}
		onWorkflowSelect={handleWorkflowSelect}
		{isEditingLocation}
	/>

	<!-- Desktop Workflow Selector (mobile handled by BottomControlBar) -->
	<div class="hidden md:block">
		<WorkflowSelector
			{workflows}
			{map}
			bind:isOpen={workflowSelectorOpen}
			bind:isSelectingCoordinates
			onWorkflowSelect={handleWorkflowSelect}
		/>
	</div>

	<LayerSheet
		bind:open={layerSheetOpen}
		layers={mapLayers}
		{activeBaseLayerId}
		{activeOverlayIds}
		onBaseLayerChange={(id) => (activeBaseLayerId = id)}
		onOverlayToggle={handleOverlayToggle}
	/>

	<FilterSheet
		bind:open={filterSheetOpen}
		{markers}
		{workflowInstances}
		{visibleCategoryIds}
		{visibleWorkflowIds}
		{fieldTags}
		{fieldValues}
		{visibleTagValues}
		{workflowStages}
		{workflows}
		onCategoryToggle={handleCategoryToggle}
		onWorkflowToggle={handleWorkflowToggle}
		onTagValueToggle={handleTagValueToggle}
	/>

	<!-- Workflow Instance Detail Module (handles tool flows internally) -->
	{#if selection.type === 'workflowInstance'}
		<WorkflowInstanceDetailModule
			{selection}
			{map}
			bind:isExpanded={sheetExpanded}
			bind:isEditingLocation
			onClose={handleSelectionClose}
		/>
	{/if}

	<!-- Form Fill for NEW Workflow Creation (uses shared ModuleShell + FormFillTool) -->
	{#if pendingWorkflow && formFillOpen}
		<ModuleShell
			bind:isOpen={formFillOpen}
			bind:isExpanded={sheetExpanded}
			title={pendingWorkflow.workflow.name}
			onClose={handleFormClose}
		>
			{#snippet content()}
				<FormFillTool
					workflowId={pendingWorkflow.workflow.id}
					onSubmit={handleFormSubmit}
					onCancel={handleFormClose}
				/>
			{/snippet}
		</ModuleShell>
	{/if}

	<!-- Settings Sheet -->
	<SettingsSheet
		bind:open={settingsSheetOpen}
		participant={data.participant ? {
			id: data.participant.id,
			name: String(data.participant.name || data.participant.email || 'Participant'),
			email: data.participant.email ? String(data.participant.email) : undefined,
			project_id: data.participant.project_id ? String(data.participant.project_id) : undefined
		} : undefined}
		roles={[]}
		collectionNames={data.collectionNames ?? []}
		fileFields={data.fileFields ?? {}}
		onLogout={handleLogout}
	/>

	<!-- Floating download progress (always visible outside modal) -->
	{#if downloadProgress && downloadProgress.status === 'downloading'}
		<div class="fixed bottom-20 left-4 right-4 z-[1200] md:left-auto md:right-4 md:w-80">
			<div class="rounded-lg bg-background/95 p-3 shadow-lg backdrop-blur-sm border">
				<div class="flex items-center gap-2 mb-2">
					<Loader2 class="h-4 w-4 animate-spin text-blue-600" />
					<span class="text-sm font-medium">Downloading offline data...</span>
				</div>
				<p class="text-xs text-muted-foreground">{downloadProgress.current_operation}</p>
			</div>
		</div>
	{/if}

	{#if isLoading}
		<div class="absolute inset-0 flex items-center justify-center bg-background/50">
			<div class="text-muted-foreground">Loading map...</div>
		</div>
	{/if}
</div>
