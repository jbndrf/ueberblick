<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { getParticipantGateway } from '$lib/participant-state/context.svelte';
	import { MapCanvas, BottomControlBar, LayerSheet, FilterSheet, WorkflowSelector } from './components';
	import { MarkerDetailModule, WorkflowInstanceDetailModule, FormFillModule, createSelection, type Selection, type Marker, type WorkflowConnection, type ToolQueueItem, type ToolEdit } from './modules';
	import type { Map as LeafletMap } from 'leaflet';
	import { mapNavCallbacks } from './nav-store.svelte';

	interface Workflow {
		id: string;
		name: string;
		workflow_type: 'incident' | 'survey';
		description?: string;
	}

	interface PendingWorkflow {
		workflow: Workflow;
		coordinates?: { lat: number; lng: number };
	}

	interface ActiveToolFlow {
		instanceId: string;
		connection: WorkflowConnection;
		toolQueue: ToolQueueItem[];
		currentToolIndex: number;
	}

	interface Props {
		data: {
			participant: {
				id: string;
				role_id?: string;
				[key: string]: unknown;
			};
		};
	}

	let { data }: Props = $props();

	const gateway = getParticipantGateway();

	// Map reference
	let map = $state<LeafletMap | null>(null);

	// UI state
	let layerSheetOpen = $state(false);
	let filterSheetOpen = $state(false);
	let workflowSelectorOpen = $state(false);
	let isSelectingCoordinates = $state(false);

	// Set up navigation callbacks for header (desktop) navigation
	onMount(() => {
		mapNavCallbacks.set({
			onLayersClick: () => (layerSheetOpen = true),
			onFiltersClick: () => (filterSheetOpen = true),
			onLocationClick: centerOnLocation,
			onToolsClick: () => {},
			onWorkflowClick: () => (workflowSelectorOpen = !workflowSelectorOpen)
		});
	});

	onDestroy(() => {
		mapNavCallbacks.set({});
	});

	// Selection state
	let selection = $state<Selection>(createSelection.none());

	// Workflow creation state
	let pendingWorkflow = $state<PendingWorkflow | null>(null);
	let formFillOpen = $state(false);

	// Tool flow state (for action buttons in WorkflowInstanceDetailModule)
	let activeToolFlow = $state<ActiveToolFlow | null>(null);

	// Data state - loaded via gateway
	let mapLayers = $state<any[]>([]);
	let markers = $state<any[]>([]);
	let workflowInstances = $state<any[]>([]);
	let workflows = $state<Workflow[]>([]);
	let workflowStages = $state<any[]>([]);
	let isLoading = $state(true);

	// Layer state
	let activeBaseLayerId = $state<string | null>(null);
	let activeOverlayIds = $state<string[]>([]);

	// Filter state - which categories/workflows are visible on map
	let visibleCategoryIds = $state<string[]>([]);
	let visibleWorkflowIds = $state<string[]>([]);

	// Load all data via gateway
	$effect(() => {
		loadData();
	});

	async function loadData() {
		try {
			isLoading = true;

			// Load all in parallel
			const [layersResult, markersResult, instancesResult, workflowsResult, stagesResult] = await Promise.all([
				gateway.collection('map_layers').getFullList({
					filter: 'is_active = true',
					expand: 'source_id',
					sort: 'display_order'
				}),
				gateway.collection('markers').getFullList({
					expand: 'category_id'
				}),
				gateway.collection('workflow_instances').getFullList({
					expand: 'workflow_id'
				}),
				gateway.collection('workflows').getFullList({
					filter: 'is_active = true'
				}),
				gateway.collection('workflow_stages').getFullList()
			]);

			mapLayers = layersResult;
			markers = markersResult;
			workflowInstances = instancesResult;
			workflows = workflowsResult as Workflow[];
			workflowStages = stagesResult;

			console.log('Loaded markers:', markers.length);
			console.log('Loaded workflow instances:', workflowInstances.length);
			console.log('Loaded workflows:', workflows.length);

			// Initialize layer selection
			if (!activeBaseLayerId && mapLayers.length) {
				const firstBase = mapLayers.find((l) => l.is_base_layer);
				if (firstBase) activeBaseLayerId = firstBase.id;
			}

			// Initialize filters - all categories/workflows visible by default
			if (visibleCategoryIds.length === 0 && markers.length > 0) {
				// Get unique category IDs from markers
				const categoryIds = [...new Set(markers.map((m) => m.category_id).filter(Boolean))];
				visibleCategoryIds = categoryIds;
			}
			if (visibleWorkflowIds.length === 0 && workflowInstances.length > 0) {
				// Get unique workflow IDs from instances
				const workflowIds = [...new Set(workflowInstances.map((i) => i.workflow_id).filter(Boolean))];
				visibleWorkflowIds = workflowIds;
			}
		} catch (error) {
			console.error('Failed to load map data:', error);
		} finally {
			isLoading = false;
		}
	}

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

	// ==========================================================================
	// Marker Selection & Navigation
	// ==========================================================================

	// Visible markers for navigation (filtered by category)
	const selectableMarkers = $derived(
		markers.filter((m) => visibleCategoryIds.includes(m.category_id) && m.location?.lat && m.location?.lon)
	);

	// Current selection index
	const currentIndex = $derived.by(() => {
		if (selection.type !== 'marker') return -1;
		return selectableMarkers.findIndex((m) => m.id === selection.markerId);
	});

	// Navigation capabilities
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
	// Workflow Creation
	// ==========================================================================

	function handleWorkflowSelect(workflow: Workflow, coordinates?: { lat: number; lng: number }) {
		console.log('Workflow selected:', workflow, 'Coordinates:', coordinates);

		// Store pending workflow and open form
		pendingWorkflow = { workflow, coordinates };
		formFillOpen = true;
	}

	async function handleFormSubmit(formValues: Record<string, unknown>, connectionId: string) {
		if (!pendingWorkflow) return;

		const { workflow, coordinates } = pendingWorkflow;

		// Find the start stage for this workflow
		const stages = workflowStages.filter((s: any) => s.workflow_id === workflow.id);
		const startStage = stages.find((s: any) => s.stage_type === 'start') || stages[0];

		if (!startStage) {
			console.error('No start stage found for workflow:', workflow.id);
			throw new Error('No start stage found');
		}

		try {
			// Create workflow instance through gateway
			const instance = await gateway.collection('workflow_instances').create({
				workflow_id: workflow.id,
				current_stage_id: startStage.id,
				status: 'active',
				created_by: data.participant.id,
				location: coordinates ? { lat: coordinates.lat, lon: coordinates.lng } : null,
				files: []
			});

			console.log('Workflow instance created:', instance.id);

			// Save form field values
			const fieldEntries = Object.entries(formValues).filter(([_, value]) => value !== null && value !== undefined && value !== '');

			for (const [fieldId, value] of fieldEntries) {
				// Handle file values separately
				if (Array.isArray(value) && value.length > 0 && value[0] instanceof File) {
					// File upload - create FormData
					const formData = new FormData();
					formData.append('instance_id', instance.id);
					formData.append('field_key', fieldId);
					formData.append('stage_id', startStage.id);
					formData.append('value', '');
					formData.append('file_value', value[0]);

					await gateway.collection('workflow_instance_field_values').create(formData);
				} else {
					// Regular value - stringify if needed
					const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

					await gateway.collection('workflow_instance_field_values').create({
						instance_id: instance.id,
						field_key: fieldId,
						stage_id: startStage.id,
						value: stringValue
					});
				}
			}

			// Refresh instances
			const instancesResult = await gateway.collection('workflow_instances').getFullList({
				expand: 'workflow_id'
			});
			workflowInstances = instancesResult;

			// Note: Don't clear pendingWorkflow here - let handleFormClose() do it
			// when the form component calls onClose() after completing its cleanup
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
	// Tool Flow (from WorkflowInstanceDetailModule actions)
	// ==========================================================================

	function handleStartToolFlow(instanceId: string, connection: WorkflowConnection, toolQueue: ToolQueueItem[]) {
		console.log('Starting tool flow:', { instanceId, connection, toolQueue });

		activeToolFlow = {
			instanceId,
			connection,
			toolQueue,
			currentToolIndex: 0
		};

		// Start the first tool
		startCurrentTool();
	}

	function handleStartEditTool(instanceId: string, editTool: ToolEdit) {
		console.log('Starting edit tool:', { instanceId, editTool });
		// TODO: Implement EditModule to handle editing fields
		// For now, log the action - EditModule will be implemented later
		alert(`Edit tool "${editTool.name}" not yet implemented`);
	}

	function startCurrentTool() {
		if (!activeToolFlow) return;

		const currentTool = activeToolFlow.toolQueue[activeToolFlow.currentToolIndex];
		if (!currentTool) {
			// No more tools - execute transition
			executeToolFlowTransition();
			return;
		}

		if (currentTool.type === 'form') {
			// Open form fill module for this form
			formFillOpen = true;
		} else if (currentTool.type === 'edit') {
			// Edit tools not yet implemented - skip to next
			advanceToolFlow();
		}
	}

	async function handleToolFlowFormSubmit(formValues: Record<string, unknown>, connectionId: string) {
		if (!activeToolFlow) return;

		const currentTool = activeToolFlow.toolQueue[activeToolFlow.currentToolIndex];
		if (!currentTool || currentTool.type !== 'form') return;

		// Find the target stage from the connection
		const targetStageId = activeToolFlow.connection.to_stage_id;

		try {
			// Save form field values for this instance
			const fieldEntries = Object.entries(formValues).filter(([_, value]) => value !== null && value !== undefined && value !== '');

			for (const [fieldId, value] of fieldEntries) {
				if (Array.isArray(value) && value.length > 0 && value[0] instanceof File) {
					// File upload
					const formData = new FormData();
					formData.append('instance_id', activeToolFlow.instanceId);
					formData.append('field_key', fieldId);
					formData.append('stage_id', targetStageId);
					formData.append('value', '');
					formData.append('file_value', value[0]);

					await gateway.collection('workflow_instance_field_values').create(formData);
				} else {
					// Regular value
					const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

					await gateway.collection('workflow_instance_field_values').create({
						instance_id: activeToolFlow.instanceId,
						field_key: fieldId,
						stage_id: targetStageId,
						value: stringValue
					});
				}
			}

			// Advance to next tool
			advanceToolFlow();
		} catch (error) {
			console.error('Failed to submit tool flow form:', error);
			throw error;
		}
	}

	function advanceToolFlow() {
		if (!activeToolFlow) return;

		const nextIndex = activeToolFlow.currentToolIndex + 1;

		if (nextIndex >= activeToolFlow.toolQueue.length) {
			// All tools complete - execute transition
			executeToolFlowTransition();
		} else {
			// More tools to run
			activeToolFlow = { ...activeToolFlow, currentToolIndex: nextIndex };
			startCurrentTool();
		}
	}

	async function executeToolFlowTransition() {
		if (!activeToolFlow) return;

		try {
			// Update instance to new stage
			await gateway.collection('workflow_instances').update(activeToolFlow.instanceId, {
				current_stage_id: activeToolFlow.connection.to_stage_id
			});

			console.log('Tool flow transition complete:', activeToolFlow.instanceId);

			// Refresh instances
			const instancesResult = await gateway.collection('workflow_instances').getFullList({
				expand: 'workflow_id'
			});
			workflowInstances = instancesResult;

			// Clear tool flow
			activeToolFlow = null;
			formFillOpen = false;
		} catch (error) {
			console.error('Failed to execute transition:', error);
		}
	}

	function handleToolFlowFormClose() {
		// If closing during tool flow, cancel the whole flow
		activeToolFlow = null;
		formFillOpen = false;
	}

	function handleMapReady(leafletMap: LeafletMap) {
		map = leafletMap;
	}

	function handleMapClick() {
		// Close sidebar when clicking on empty map area (not dragging)
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
</script>

<div class="relative h-full w-full">
	<MapCanvas
		layers={mapLayers}
		{activeBaseLayerId}
		{activeOverlayIds}
		{markers}
		{visibleCategoryIds}
		{workflowInstances}
		{visibleWorkflowIds}
		onMarkerClick={handleMarkerClick}
		onWorkflowInstanceClick={handleWorkflowInstanceClick}
		onMapReady={handleMapReady}
		onMapClick={handleMapClick}
	/>

	<BottomControlBar
		onLayersClick={() => (layerSheetOpen = true)}
		onFiltersClick={() => (filterSheetOpen = true)}
		onLocationClick={centerOnLocation}
		{workflows}
		{map}
		onWorkflowSelect={handleWorkflowSelect}
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
		onCategoryToggle={handleCategoryToggle}
		onWorkflowToggle={handleWorkflowToggle}
	/>

	<!-- Marker Detail Module -->
	{#if selection.type === 'marker'}
		<MarkerDetailModule
			{selection}
			participantRoleId={data.participant?.role_id || ''}
			onClose={handleSelectionClose}
			onNext={handleNavigateNext}
			onPrevious={handleNavigatePrevious}
			{canGoNext}
			{canGoPrevious}
		/>
	{/if}

	<!-- Workflow Instance Detail Module -->
	{#if selection.type === 'workflowInstance'}
		<WorkflowInstanceDetailModule
			{selection}
			onClose={handleSelectionClose}
			onStartToolFlow={handleStartToolFlow}
			onStartEditTool={handleStartEditTool}
		/>
	{/if}

	<!-- Form Fill Module for Workflow Creation -->
	{#if pendingWorkflow && formFillOpen}
		<FormFillModule
			workflowId={pendingWorkflow.workflow.id}
			bind:isOpen={formFillOpen}
			onSubmit={handleFormSubmit}
			onClose={handleFormClose}
		/>
	{/if}

	<!-- Form Fill Module for Tool Flow (action from existing instance) -->
	{#if activeToolFlow && formFillOpen}
		{@const currentTool = activeToolFlow.toolQueue[activeToolFlow.currentToolIndex]}
		{#if currentTool?.type === 'form'}
			<FormFillModule
				workflowId={activeToolFlow.connection.workflow_id}
				connectionId={activeToolFlow.connection.id}
				bind:isOpen={formFillOpen}
				onSubmit={handleToolFlowFormSubmit}
				onClose={handleToolFlowFormClose}
			/>
		{/if}
	{/if}

	{#if isLoading}
		<div class="absolute inset-0 flex items-center justify-center bg-background/50">
			<div class="text-muted-foreground">Loading map...</div>
		</div>
	{/if}
</div>
