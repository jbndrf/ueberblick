<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { getParticipantGateway } from '$lib/participant-state/context.svelte';
	import {
		getDownloadProgress,
		getDownloadCompleteSignal,
		getOfflineModeChangeSignal
	} from '$lib/participant-state';
	import { Loader2 } from 'lucide-svelte';
	import { MapCanvas, BottomControlBar, LayerSheet, FilterSheet, WorkflowSelector } from './components';
	import { WorkflowInstanceDetailModule, createSelection, type Selection, type Marker } from './modules';
	import { FormFillTool } from './modules/workflow-instance-detail/tools';
	import ModuleShell from '$lib/components/module-shell.svelte';
	import { ToolsMenu } from '$lib/components/map';
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

	const gateway = getParticipantGateway();

	// Map reference
	let map = $state<LeafletMap | null>(null);

	// UI state
	let layerSheetOpen = $state(false);
	let filterSheetOpen = $state(false);
	let workflowSelectorOpen = $state(false);
	let isSelectingCoordinates = $state(false);
	let toolsMenuOpen = $state(false);

	// Set up navigation callbacks for header (desktop) navigation
	onMount(() => {
		mapNavCallbacks.set({
			onLayersClick: () => (layerSheetOpen = true),
			onFiltersClick: () => (filterSheetOpen = true),
			onLocationClick: centerOnLocation,
			onToolsClick: () => (toolsMenuOpen = true),
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

	// Data state - loaded via gateway
	let mapLayers = $state<any[]>([]);
	let markers = $state<any[]>([]);
	let workflowInstances = $state<any[]>([]);
	let workflows = $state<Workflow[]>([]);
	let workflowStages = $state<any[]>([]);
	let isLoading = $state(true);

	// Guard to prevent concurrent loadData() calls (avoids PocketBase auto-cancellation)
	let loadDataInFlight = false;

	// Layer state
	let activeBaseLayerId = $state<string | null>(null);
	let activeOverlayIds = $state<string[]>([]);

	// Filter state - which categories/workflows are visible on map
	let visibleCategoryIds = $state<string[]>([]);
	let visibleWorkflowIds = $state<string[]>([]);

	// ==========================================================================
	// Download Progress & Event Signals
	// ==========================================================================

	// Reactive download progress (always visible when downloading)
	const downloadProgress = $derived(getDownloadProgress());

	// Event signals for reactive data reload
	const downloadCompleteSignal = $derived(getDownloadCompleteSignal());
	const offlineModeSignal = $derived(getOfflineModeChangeSignal());

	// Track previous signal values to detect changes
	let prevDownloadSignal = 0;
	let prevOfflineSignal = 0;

	// Load data on mount
	$effect(() => {
		loadData();
	});

	// Reload on download complete
	$effect(() => {
		const signal = downloadCompleteSignal;
		if (signal > prevDownloadSignal) {
			prevDownloadSignal = signal;
			console.log('[map page] Download complete signal received, reloading data...');
			loadData();
		}
	});

	// Reload on offline mode change
	$effect(() => {
		const signal = offlineModeSignal;
		if (signal > prevOfflineSignal) {
			prevOfflineSignal = signal;
			console.log('[map page] Offline mode change signal received, reloading data...');
			loadData();
		}
	});

	async function loadData() {
		// Prevent concurrent calls to avoid PocketBase auto-cancellation
		if (loadDataInFlight) {
			console.log('[loadData] Already loading, skipping duplicate request');
			return;
		}
		loadDataInFlight = true;

		try {
			isLoading = true;
			console.log('[loadData] Gateway online status:', gateway.isOnline);

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

			console.log('[loadData] Loaded map layers:', mapLayers);
			console.log('[loadData] First layer expand:', mapLayers[0]?.expand);
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
			loadDataInFlight = false;
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
	// Workflow Creation (new workflow via entry form)
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

			// Build list of field values for audit log
			const fieldEntries = Object.entries(formValues).filter(([_, value]) => value !== null && value !== undefined && value !== '');

			const createdFields = fieldEntries.map(([fieldId, value]) => ({
				field_key: fieldId,
				value: Array.isArray(value) && value[0] instanceof File
					? `[${(value as File[]).length} file(s)]`
					: typeof value === 'object' ? JSON.stringify(value) : String(value)
			}));

			// Create tool_usage record for audit trail (instance creation)
			const toolUsage = await gateway.collection('workflow_instance_tool_usage').create({
				instance_id: instance.id,
				stage_id: startStage.id,
				executed_by: gateway.participantId,
				executed_at: new Date().toISOString(),
				metadata: {
					action: 'instance_created',
					location: coordinates ? { lat: coordinates.lat, lon: coordinates.lng } : null,
					created_fields: createdFields
				}
			}) as { id: string };

			// Save form field values with link to tool_usage
			for (const [fieldId, value] of fieldEntries) {
				// Handle file values separately
				if (Array.isArray(value) && value.length > 0 && value[0] instanceof File) {
					// File upload - create separate record for each file
					for (const file of value as File[]) {
						const formData = new FormData();
						formData.append('instance_id', instance.id);
						formData.append('field_key', fieldId);
						formData.append('stage_id', startStage.id);
						formData.append('value', '');
						formData.append('file_value', file);
						formData.append('created_by_action', toolUsage.id);

						await gateway.collection('workflow_instance_field_values').create(formData);
					}
				} else {
					// Regular value - stringify if needed
					const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

					await gateway.collection('workflow_instance_field_values').create({
						instance_id: instance.id,
						field_key: fieldId,
						stage_id: startStage.id,
						value: stringValue,
						created_by_action: toolUsage.id
					});
				}
			}

			// Refresh instances and update visibility filter
			await refreshWorkflowInstances();

			// Ensure the new workflow type is visible
			if (!visibleWorkflowIds.includes(workflow.id)) {
				visibleWorkflowIds = [...visibleWorkflowIds, workflow.id];
			}

			// Close form and show the new instance
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
	// Refresh Helpers
	// ==========================================================================

	async function refreshWorkflowInstances() {
		const instancesResult = await gateway.collection('workflow_instances').getFullList({
			expand: 'workflow_id'
		});
		workflowInstances = instancesResult;
	}

	// ==========================================================================
	// Map Handlers
	// ==========================================================================

	function handleMapReady(leafletMap: LeafletMap) {
		map = leafletMap;
	}

	function handleMapClick() {
		// Don't close if location editing is active (let LocationEditTool handle clicks)
		if (isEditingLocation) return;

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

	async function handleLogout() {
		try {
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
		{visibleWorkflowIds}
		{gateway}
		onMarkerClick={handleMarkerClick}
		onWorkflowInstanceClick={handleWorkflowInstanceClick}
		onMapReady={handleMapReady}
		onMapClick={handleMapClick}
	/>

	<BottomControlBar
		onLayersClick={() => (layerSheetOpen = true)}
		onFiltersClick={() => (filterSheetOpen = true)}
		onToolsClick={() => (toolsMenuOpen = true)}
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
		onCategoryToggle={handleCategoryToggle}
		onWorkflowToggle={handleWorkflowToggle}
	/>

	<!-- Workflow Instance Detail Module (handles tool flows internally) -->
	{#if selection.type === 'workflowInstance'}
		<WorkflowInstanceDetailModule
			{selection}
			{map}
			bind:isExpanded={sheetExpanded}
			bind:isEditingLocation
			onClose={handleSelectionClose}
			onInstanceUpdated={refreshWorkflowInstances}
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

	<!-- Tools Menu -->
	<ToolsMenu
		bind:open={toolsMenuOpen}
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
