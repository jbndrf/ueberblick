<script lang="ts">
	import {
		SvelteFlow,
		Controls,
		Background,
		MiniMap,
		type Node,
		type Edge,
		type NodeTypes,
		type NodeEventWithPointer
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';

	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Separator } from '$lib/components/ui/separator';
	import * as Tabs from '$lib/components/ui/tabs';
	import {
		Save,
		Undo2,
		Redo2,
		ZoomIn,
		ZoomOut,
		Maximize2,
		Download,
		Upload,
		Trash2,
		CircleHelp,
		Play,
		Square,
		CircleStop,
		Workflow,
		RefreshCw,
		MapPin,
		Clock,
		User,
		FileText,
		History
	} from 'lucide-svelte';

	import type { PageData } from './$types';
	import StageNode from './StageNode.svelte';
	import { ContextSidebar, createContext, type SelectionContext, type StageData } from './context-sidebar';

	let { data }: { data: PageData } = $props();

	// Node types registration
	const nodeTypes: NodeTypes = {
		stage: StageNode
	};

	// Convert database stages to xyflow nodes
	function stagesToNodes(stages: typeof data.stages): Node[] {
		if (!stages || stages.length === 0) {
			return [];
		}

		return stages.map((stage) => ({
			id: stage.id,
			type: 'stage',
			position: {
				x: stage.position_x || 100,
				y: stage.position_y || 100
			},
			data: {
				title: stage.title,
				key: stage.key,
				stageType: stage.type,
				maxHours: stage.max_hours
			}
		}));
	}

	// Convert database actions to xyflow edges
	function actionsToEdges(actions: typeof data.actions): Edge[] {
		if (!actions || actions.length === 0) {
			return [];
		}

		return actions.map((action) => ({
			id: action.id,
			source: action.from_stage_id,
			target: action.to_stage_id,
			label: action.button_label || action.name,
			type: action.is_edit_action ? 'smoothstep' : 'default',
			animated: action.is_edit_action,
			style: action.button_color ? `stroke: ${action.button_color}` : undefined
		}));
	}

	// Initialize state with data from server (Svelte 5 $state.raw for xyflow)
	let nodes = $state.raw<Node[]>(stagesToNodes(data.stages));
	let edges = $state.raw<Edge[]>(actionsToEdges(data.actions));

	// Workflow name (editable)
	let workflowName = $state(data.workflow?.name || 'Untitled Workflow');

	// Connection state
	let connectingFrom = $state<string | null>(null);

	// Selection context for context sidebar
	let selectionContext = $state<SelectionContext>(createContext.none());

	// Derived helpers
	const selectedStageId = $derived(
		selectionContext.type === 'stage' ? selectionContext.stageId : null
	);
	const hasStartStage = $derived(nodes.some((n) => n.data.stageType === 'start'));

	// Preview tab
	let previewTab = $state('overview');

	// Handle drop on canvas
	function onDrop(event: DragEvent) {
		event.preventDefault();
		if (!event.dataTransfer) return;

		const type = event.dataTransfer.getData('application/xyflow') as 'start' | 'intermediate' | 'end';
		if (!type) return;

		// Check if start node already exists
		if (type === 'start' && hasStartStage) {
			console.warn('Only one start node allowed');
			return;
		}

		// Get drop position relative to canvas
		const canvasEl = event.currentTarget as HTMLElement;
		const bounds = canvasEl.getBoundingClientRect();
		const position = {
			x: event.clientX - bounds.left,
			y: event.clientY - bounds.top
		};

		const newNode: Node = {
			id: `temp_${Date.now()}`,
			type: 'stage',
			position,
			data: {
				title: type === 'start' ? 'Start' : type === 'end' ? 'End' : 'New Stage',
				key: `${type}_${Date.now()}`,
				stageType: type,
				maxHours: null
			}
		};

		nodes = [...nodes, newNode];
		// Don't select - stay at canvas view
	}

	function onDragOver(event: DragEvent) {
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
	}

	// Get selected stage data
	const selectedStage = $derived(nodes.find((n) => n.id === selectedStageId));

	// Get fields for a stage (placeholder until we have real data)
	function getFieldsForStage(stageId: string) {
		// TODO: Return actual form fields from data.formFields filtered by stage
		return [];
	}

	// Handle node context menu (right-click to connect)
	const handleNodeContextMenu: NodeEventWithPointer<MouseEvent> = ({ event, node }) => {
		event.preventDefault();
		const nodeId = node.id;

		if (connectingFrom === null) {
			// Start connection
			connectingFrom = nodeId;
		} else if (connectingFrom === nodeId) {
			// Same node - create edit action
			const newEdge: Edge = {
				id: `action_${Date.now()}`,
				source: nodeId,
				target: nodeId,
				label: 'Edit',
				type: 'smoothstep',
				animated: true
			};
			edges = [...edges, newEdge];
			connectingFrom = null;
		} else {
			// Different node - create normal action
			const newEdge: Edge = {
				id: `action_${Date.now()}`,
				source: connectingFrom,
				target: nodeId,
				label: 'Action'
			};
			edges = [...edges, newEdge];
			connectingFrom = null;
		}
	};

	// Cancel connection on canvas click
	function onPaneClick() {
		connectingFrom = null;
		selectionContext = createContext.none();
	}

	// Handle node click for selection
	function onNodeClick({ node }: { node: Node }) {
		selectionContext = createContext.stage(node as Node<StageData>);
	}

	// Handle edge click for selection
	function onEdgeClick({ edge }: { edge: Edge }) {
		selectionContext = createContext.action(edge);
	}

	// Context sidebar callbacks (stubs - will be implemented later)
	function handleAddField(fieldType: string) {
		console.log('Add field:', fieldType, 'to stage:', selectedStageId);
		// TODO: Open field creation modal or add field directly
	}

	function handleEditStage() {
		console.log('Edit stage:', selectedStageId);
		// TODO: Open stage edit modal
	}

	function handleDeleteStage() {
		if (selectedStageId) {
			nodes = nodes.filter((n) => n.id !== selectedStageId);
			edges = edges.filter((e) => e.source !== selectedStageId && e.target !== selectedStageId);
			selectionContext = createContext.none();
		}
	}

	function handleChangeActionType(type: string) {
		console.log('Change action type:', type);
		// TODO: Update action type
	}

	function handleEditAction() {
		console.log('Edit action');
		// TODO: Open action edit modal
	}

	function handleDeleteAction() {
		if (selectionContext.type === 'action') {
			edges = edges.filter((e) => e.id !== selectionContext.actionId);
			selectionContext = createContext.none();
		}
	}

	function handleToggleRequired() {
		console.log('Toggle required');
		// TODO: Toggle field required state
	}

	function handleMoveFieldUp() {
		console.log('Move field up');
		// TODO: Reorder field
	}

	function handleMoveFieldDown() {
		console.log('Move field down');
		// TODO: Reorder field
	}

	function handleDuplicateField() {
		console.log('Duplicate field');
		// TODO: Duplicate field
	}

	function handleEditField() {
		console.log('Edit field');
		// TODO: Open field edit modal
	}

	function handleDeleteField() {
		console.log('Delete field');
		// TODO: Delete field
	}
</script>

<div class="workflow-builder">
	<!-- Toolbar -->
	<div class="toolbar">
		<div class="toolbar-left">
			<Button variant="outline" size="sm">
				<Save class="h-4 w-4 mr-2" />
				Save
			</Button>

			<Separator orientation="vertical" class="h-6" />

			<Button variant="ghost" size="icon" class="h-8 w-8" title="Undo">
				<Undo2 class="h-4 w-4" />
			</Button>
			<Button variant="ghost" size="icon" class="h-8 w-8" title="Redo">
				<Redo2 class="h-4 w-4" />
			</Button>

			<Separator orientation="vertical" class="h-6" />

			<Button variant="ghost" size="icon" class="h-8 w-8" title="Zoom In">
				<ZoomIn class="h-4 w-4" />
			</Button>
			<Button variant="ghost" size="icon" class="h-8 w-8" title="Zoom Out">
				<ZoomOut class="h-4 w-4" />
			</Button>
			<Button variant="ghost" size="icon" class="h-8 w-8" title="Fit to View">
				<Maximize2 class="h-4 w-4" />
			</Button>

			<Separator orientation="vertical" class="h-6" />

			<Button variant="ghost" size="sm">
				<Download class="h-4 w-4 mr-2" />
				Export
			</Button>
			<Button variant="ghost" size="sm">
				<Upload class="h-4 w-4 mr-2" />
				Import
			</Button>

			<Separator orientation="vertical" class="h-6" />

			<Button variant="ghost" size="sm">
				<Workflow class="h-4 w-4 mr-2" />
				Data Flow
			</Button>

			<Separator orientation="vertical" class="h-6" />

			<Button variant="ghost" size="sm" class="text-destructive hover:text-destructive">
				<Trash2 class="h-4 w-4 mr-2" />
				Clear
			</Button>
		</div>

		<div class="toolbar-right">
			<Input
				bind:value={workflowName}
				class="w-64 h-8"
				placeholder="Workflow name..."
			/>
			<Button variant="ghost" size="icon" class="h-8 w-8" title="Help">
				<CircleHelp class="h-4 w-4" />
			</Button>
		</div>
	</div>

	<div class="builder-content">
		<!-- Context Sidebar (left) -->
		<ContextSidebar
			context={selectionContext}
			{hasStartStage}
			onAddField={handleAddField}
			onEditStage={handleEditStage}
			onDeleteStage={handleDeleteStage}
			onChangeActionType={handleChangeActionType}
			onEditAction={handleEditAction}
			onDeleteAction={handleDeleteAction}
			onToggleRequired={handleToggleRequired}
			onMoveFieldUp={handleMoveFieldUp}
			onMoveFieldDown={handleMoveFieldDown}
			onDuplicateField={handleDuplicateField}
			onEditField={handleEditField}
			onDeleteField={handleDeleteField}
		/>

		<!-- Canvas (main area) -->
		<div class="canvas-container" role="application" ondrop={onDrop} ondragover={onDragOver}>
			{#if connectingFrom}
				<div class="connecting-indicator">
					Connecting from node... Right-click another node to connect, or click canvas to cancel.
				</div>
			{/if}

			<SvelteFlow
				bind:nodes
				bind:edges
				{nodeTypes}
				fitView
				onpaneclick={onPaneClick}
				onnodeclick={onNodeClick}
				onedgeclick={onEdgeClick}
				onnodecontextmenu={handleNodeContextMenu}
			>
				<Controls />
				<Background />
				<MiniMap />
			</SvelteFlow>
		</div>

		<!-- Preview Sidebar (right side) -->
		<div class="preview-sidebar">
			<div class="preview-header">
				<div class="preview-title">
					<span class="text-sm font-medium">{workflowName}</span>
					<span class="text-xs text-muted-foreground">Participant View</span>
				</div>
				<Button variant="ghost" size="icon" class="h-7 w-7" title="Refresh Preview">
					<RefreshCw class="h-3.5 w-3.5" />
				</Button>
			</div>

			<Tabs.Root bind:value={previewTab} class="flex-1 flex flex-col">
				<Tabs.List class="preview-tabs">
					<Tabs.Trigger value="overview">Overview</Tabs.Trigger>
					<Tabs.Trigger value="details">Details</Tabs.Trigger>
					<Tabs.Trigger value="audit">Audit</Tabs.Trigger>
				</Tabs.List>

				<div class="preview-content">
					<Tabs.Content value="overview" class="preview-tab-content">
						<!-- Mock location info -->
						<div class="preview-section">
							<div class="preview-section-header">
								<MapPin class="h-4 w-4 text-muted-foreground" />
								<span>Location</span>
							</div>
							<div class="preview-mock-field">
								<span class="text-sm text-muted-foreground">Sample Location</span>
							</div>
						</div>

						<!-- Timestamps -->
						<div class="preview-section">
							<div class="preview-section-header">
								<Clock class="h-4 w-4 text-muted-foreground" />
								<span>Timeline</span>
							</div>
							<div class="preview-info-row">
								<span class="text-xs text-muted-foreground">Created</span>
								<span class="text-xs">--</span>
							</div>
							<div class="preview-info-row">
								<span class="text-xs text-muted-foreground">Updated</span>
								<span class="text-xs">--</span>
							</div>
						</div>

						<!-- Current stage -->
						<div class="preview-section">
							<div class="preview-section-header">
								<User class="h-4 w-4 text-muted-foreground" />
								<span>Status</span>
							</div>
							<div class="preview-info-row">
								<span class="text-xs text-muted-foreground">Current Stage</span>
								<span class="text-xs">{selectedStage?.data?.title || 'None selected'}</span>
							</div>
						</div>

						<!-- Form fields overview -->
						<div class="preview-section">
							<div class="preview-section-header">
								<FileText class="h-4 w-4 text-muted-foreground" />
								<span>Form Fields</span>
							</div>
							{#if nodes.length === 0}
								<p class="text-xs text-muted-foreground py-2">No stages yet</p>
							{:else}
								{#each nodes as node}
									<div class="preview-stage-summary">
										<div class="preview-stage-name">
											{#if node.data.stageType === 'start'}
												<Play class="h-3 w-3 text-green-500" />
											{:else if node.data.stageType === 'end'}
												<CircleStop class="h-3 w-3 text-pink-500" />
											{:else}
												<Square class="h-3 w-3 text-blue-500" />
											{/if}
											<span class="text-xs font-medium">{node.data.title}</span>
										</div>
										<span class="text-xs text-muted-foreground">0 fields</span>
									</div>
								{/each}
							{/if}
						</div>
					</Tabs.Content>

					<Tabs.Content value="details" class="preview-tab-content">
						{#if !selectedStage}
							<div class="preview-empty">
								<FileText class="h-8 w-8 text-muted-foreground/50" />
								<p class="text-sm text-muted-foreground">Select a stage to preview its form</p>
							</div>
						{:else}
							<!-- Stage header -->
							<div class="preview-stage-header">
								<div class="preview-stage-badge" class:start={selectedStage.data.stageType === 'start'} class:end={selectedStage.data.stageType === 'end'}>
									{selectedStage.data.stageType}
								</div>
								<h3 class="text-sm font-medium">{selectedStage.data.title}</h3>
							</div>

							<!-- Stage tabs (sub-navigation) -->
							<div class="preview-stage-tabs">
								{#each nodes as node}
									<button
										class="preview-stage-tab"
										class:active={node.id === selectedStageId}
										onclick={() => (selectionContext = createContext.stage(node as Node<StageData>))}
									>
										{node.data.title}
									</button>
								{/each}
							</div>

							<!-- Form fields preview -->
							<div class="preview-form">
								<p class="text-xs text-muted-foreground text-center py-8">
									No form fields configured yet.<br />
									Double-click the stage to add fields.
								</p>
							</div>
						{/if}
					</Tabs.Content>

					<Tabs.Content value="audit" class="preview-tab-content">
						<div class="preview-section">
							<div class="preview-section-header">
								<History class="h-4 w-4 text-muted-foreground" />
								<span>Activity Log</span>
							</div>
							<div class="preview-audit-list">
								<p class="text-xs text-muted-foreground text-center py-4">
									Preview mode - no activity yet
								</p>
							</div>
						</div>
					</Tabs.Content>
				</div>
			</Tabs.Root>
		</div>
	</div>
</div>

<style>
	.workflow-builder {
		display: flex;
		flex-direction: column;
		height: calc(100vh - 4rem - 3rem);
		margin: -1.5rem;
		background: var(--background);
	}

	.toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		gap: 1rem;
		flex-shrink: 0;
	}

	.toolbar-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.toolbar-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.builder-content {
		display: flex;
		flex: 1;
		overflow: hidden;
	}

	.canvas-container {
		flex: 1;
		position: relative;
		background: hsl(var(--muted) / 0.3);
	}

	.connecting-indicator {
		position: absolute;
		top: 1rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 10;
		padding: 0.5rem 1rem;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border-radius: 0.375rem;
		font-size: 0.875rem;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}

	/* Preview Sidebar */
	.preview-sidebar {
		width: 360px;
		border-left: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
	}

	.preview-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid hsl(var(--border));
	}

	.preview-title {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.preview-tabs {
		width: 100%;
		justify-content: stretch;
		border-radius: 0;
		background: transparent;
		border-bottom: 1px solid hsl(var(--border));
		padding: 0 0.5rem;
	}

	.preview-content {
		flex: 1;
		overflow-y: auto;
	}

	.preview-tab-content {
		padding: 0;
	}

	.preview-section {
		padding: 1rem;
		border-bottom: 1px solid hsl(var(--border));
	}

	.preview-section-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		font-weight: 500;
		text-transform: uppercase;
		color: hsl(var(--muted-foreground));
		margin-bottom: 0.75rem;
	}

	.preview-mock-field {
		padding: 0.5rem 0.75rem;
		background: hsl(var(--muted) / 0.5);
		border-radius: 0.375rem;
		border: 1px dashed hsl(var(--border));
	}

	.preview-info-row {
		display: flex;
		justify-content: space-between;
		padding: 0.25rem 0;
	}

	.preview-stage-summary {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0.75rem;
		background: hsl(var(--accent) / 0.3);
		border-radius: 0.375rem;
		margin-bottom: 0.375rem;
	}

	.preview-stage-name {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.preview-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1rem;
		gap: 0.75rem;
		text-align: center;
	}

	.preview-stage-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		border-bottom: 1px solid hsl(var(--border));
	}

	.preview-stage-badge {
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		background: hsl(var(--accent));
		color: hsl(var(--accent-foreground));
	}

	.preview-stage-badge.start {
		background: hsl(142 76% 36% / 0.15);
		color: hsl(142 76% 36%);
	}

	.preview-stage-badge.end {
		background: hsl(346 87% 60% / 0.15);
		color: hsl(346 87% 60%);
	}

	.preview-stage-tabs {
		display: flex;
		gap: 0.25rem;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid hsl(var(--border));
		overflow-x: auto;
	}

	.preview-stage-tab {
		font-size: 0.75rem;
		padding: 0.375rem 0.75rem;
		border-radius: 0.25rem;
		background: transparent;
		border: none;
		cursor: pointer;
		white-space: nowrap;
		color: hsl(var(--muted-foreground));
		transition: all 0.15s;
	}

	.preview-stage-tab:hover {
		background: hsl(var(--accent));
	}

	.preview-stage-tab.active {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
	}

	.preview-form {
		padding: 1rem;
	}

	.preview-audit-list {
		min-height: 100px;
	}

	/* XYFlow overrides */
	:global(.svelte-flow) {
		background: transparent !important;
	}

	:global(.svelte-flow__minimap) {
		background: hsl(var(--card)) !important;
		border: 1px solid hsl(var(--border)) !important;
		border-radius: 0.375rem;
	}

	:global(.svelte-flow__controls) {
		border: 1px solid hsl(var(--border)) !important;
		border-radius: 0.375rem;
		overflow: hidden;
	}

	:global(.svelte-flow__controls-button) {
		background: hsl(var(--card)) !important;
		border-bottom: 1px solid hsl(var(--border)) !important;
	}

	:global(.svelte-flow__controls-button:hover) {
		background: hsl(var(--accent)) !important;
	}

	:global(.svelte-flow__controls-button svg) {
		fill: hsl(var(--foreground)) !important;
	}
</style>
