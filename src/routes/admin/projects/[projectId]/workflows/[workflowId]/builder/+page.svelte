<script lang="ts">
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { SvelteFlowProvider, type NodeTypes, type EdgeTypes } from '@xyflow/svelte';
	import type { Node, Edge, Connection } from '@xyflow/svelte';
	import type { NodeEventWithPointer } from '@xyflow/svelte';
	import { Save, Loader2, Workflow, ShieldCheck, Code2, CircleHelp } from '@lucide/svelte';

	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	import StageNode from './StageNode.svelte';
	import EntryMarkerNode from './EntryMarkerNode.svelte';
	import ActionEdge from './ActionEdge.svelte';
	import WorkflowCanvas from './WorkflowCanvas.svelte';
	import WorkflowCodeView from './WorkflowCodeView.svelte';
	import ModelOverviewView from './model/ModelOverviewView.svelte';
	import CatalogSidebar from './catalog/CatalogSidebar.svelte';
	import InspectorHost from './inspector/InspectorHost.svelte';
	import { BuilderUi, setBuilderContext, selectTool, type Role } from './builder-context.svelte';
	import { FlowSync } from './canvas/flow-sync.svelte';

	import { createWorkflowBuilderState } from '$lib/workflow-builder';
	import {
		workflowBuilderFailedToCreateRole,
		workflowBuilderFailedToSave,
		workflowBuilderHelp,
		workflowBuilderSave,
		workflowBuilderSaving,
		workflowBuilderWorkflowNamePlaceholder,
		workflowCodeToggle,
		permMatrixCanvasLabel,
		modelTabLabel
	} from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// ==========================================================================
	// State + shared builder context
	// ==========================================================================

	const builderState = createWorkflowBuilderState(data.workflow.id);

	// Initialize state from server data
	$effect(() => {
		builderState.initFromServer({
			workflowName: data.workflow?.name,
			workflow: {
				id: data.workflow.id,
				visible_to_roles: data.workflow.visible_to_roles ?? [],
				private_instances: data.workflow.private_instances ?? false
			},
			stages: data.stages,
			connections: data.connections,
			forms: data.forms,
			fieldRefs: data.fieldRefs,
			editTools: data.editTools,
			protocolTools: data.protocolTools,
			automations: data.automations,
			fieldTags: data.fieldTags,
			fieldDefs: data.fieldDefs
		});
	});

	const ui = new BuilderUi();

	// Create role via server action (used by every role multi-select).
	async function createRole(name: string): Promise<Role> {
		const formData = new FormData();
		formData.append('name', name);

		const response = await fetch('?/createRole', {
			method: 'POST',
			body: formData
		});

		const result = deserialize(await response.text());
		if (result.type === 'success' && result.data?.entity) {
			await invalidateAll();
			return result.data.entity as Role;
		}
		throw new Error(workflowBuilderFailedToCreateRole?.() ?? 'Failed to create role');
	}

	const ctx = setBuilderContext({
		state: builderState,
		ui,
		get roles() {
			return (data.roles ?? []).map(
				(r: { id: unknown; name?: unknown; description?: unknown }) => ({
					id: String(r.id),
					name: String(r.name ?? ''),
					description: r.description ? String(r.description) : undefined
				})
			);
		},
		get projectWorkflows() {
			return (data.projectWorkflows ?? []).map((w: { id: unknown; name?: unknown }) => ({
				id: String(w.id),
				name: String(w.name ?? '')
			}));
		},
		createRole
	});

	// ==========================================================================
	// Canvas (xyflow projection)
	// ==========================================================================

	const nodeTypes: NodeTypes = {
		stage: StageNode,
		entryMarker: EntryMarkerNode
	};

	const edgeTypes: EdgeTypes = {
		action: ActionEdge
	};

	const flow = new FlowSync(ctx);

	const hasStartStage = $derived(builderState.hasStartStage);

	// Callback when a new node is added via drag-drop (from the catalog palette)
	function onNodeAdded(node: Node) {
		const stageType = node.data.stageType as 'start' | 'intermediate' | 'end';
		builderState.addStage(stageType, node.position);
	}

	// Right-click to connect: first click arms, second click connects.
	const handleNodeContextMenu: NodeEventWithPointer<MouseEvent> = ({ event, node }) => {
		event.preventDefault();
		if (node.type === 'entryMarker') return;

		const nodeId = node.id;
		if (ui.connectingFrom === null) {
			ui.connectingFrom = nodeId;
		} else if (ui.connectingFrom === nodeId) {
			// Same node - create edit action (self-loop)
			builderState.addConnection(nodeId, nodeId);
			ui.connectingFrom = null;
		} else {
			builderState.addConnection(ui.connectingFrom, nodeId);
			ui.connectingFrom = null;
		}
	};

	// Empty-canvas click only deselects.
	function onPaneClick() {
		ui.connectingFrom = null;
		ui.deselect();
	}

	// Handle connection via handle drag (standard xyflow way)
	function handleConnect(connection: Connection) {
		if (!connection.source || !connection.target) return;
		builderState.addConnection(connection.source, connection.target);
	}

	function onNodeClick({ node }: { node: Node }) {
		// Entry marker click opens the entry connection's inspector
		if (node.type === 'entryMarker') {
			ui.select({ type: 'connection', id: node.data.connectionId as string });
			return;
		}
		ui.select({ type: 'stage', id: node.id });
	}

	function onEdgeClick({ edge }: { edge: Edge }) {
		ui.select({ type: 'connection', id: edge.id });
	}

	// ==========================================================================
	// Save
	// ==========================================================================

	let isSaving = $state(false);
	let saveError = $state<string | null>(null);

	async function handleSave() {
		isSaving = true;
		saveError = null;

		// Canvas positions are canvas-local until save
		flow.syncPositionsToState();
		// Global tools always span all stages
		builderState.syncGlobalToolStages();

		const changes = builderState.getChanges();
		const formData = new FormData();
		formData.append('changes', JSON.stringify(changes));

		try {
			const response = await fetch('?/saveWorkflow', {
				method: 'POST',
				body: formData
			});

			const result = deserialize(await response.text());
			if (result.type === 'success') {
				builderState.markAsSaved();
			} else {
				saveError =
					((result as { data?: { message?: string } }).data?.message ??
						workflowBuilderFailedToSave?.()) ||
					'Failed to save';
			}
		} catch (err) {
			saveError =
				err instanceof Error ? err.message : (workflowBuilderFailedToSave?.() ?? 'Failed to save');
		}

		isSaving = false;
	}
</script>

<div class="workflow-builder">
	<!-- Toolbar -->
	<div class="toolbar">
		<div class="toolbar-left">
			<Button
				variant={builderState.isDirty ? 'default' : 'outline'}
				size="sm"
				onclick={handleSave}
				disabled={isSaving || !builderState.isDirty}
			>
				{#if isSaving}
					<Loader2 class="mr-2 h-4 w-4 animate-spin" />
					{workflowBuilderSaving?.() ?? 'Saving...'}
				{:else}
					<Save class="mr-2 h-4 w-4" />
					{(workflowBuilderSave?.() ?? 'Save') + (builderState.isDirty ? '*' : '')}
				{/if}
			</Button>

			<div class="view-toggle">
				<Button
					variant={ui.view === 'canvas' ? 'default' : 'outline'}
					size="sm"
					onclick={() => (ui.view = 'canvas')}
				>
					<Workflow class="mr-2 h-4 w-4" />
					{permMatrixCanvasLabel?.() ?? 'Workflow'}
				</Button>
				<Button
					variant={ui.view === 'model' ? 'default' : 'outline'}
					size="sm"
					onclick={() => (ui.view = 'model')}
				>
					<ShieldCheck class="mr-2 h-4 w-4" />
					{modelTabLabel?.() ?? 'Model'}
				</Button>
				<Button
					variant={ui.view === 'code' ? 'default' : 'outline'}
					size="sm"
					onclick={() => (ui.view = 'code')}
				>
					<Code2 class="mr-2 h-4 w-4" />
					{workflowCodeToggle?.() ?? 'Code'}
				</Button>
			</div>

			{#if saveError}
				<span class="save-error">{saveError}</span>
			{/if}
		</div>

		<div class="toolbar-right">
			<Input
				value={builderState.workflowName}
				oninput={(e) => (builderState.workflowName = e.currentTarget.value)}
				class="h-8 w-64"
				placeholder={workflowBuilderWorkflowNamePlaceholder?.() ?? 'Workflow name...'}
			/>
			<Button variant="ghost" size="icon" class="h-8 w-8" title={workflowBuilderHelp?.() ?? 'Help'}>
				<CircleHelp class="h-4 w-4" />
			</Button>
		</div>
	</div>

	<div class="builder-content">
		{#if ui.view === 'model'}
			<ModelOverviewView projectId={String(data.workflow.project_id)} />
		{:else if ui.view === 'code'}
			<WorkflowCodeView {builderState} roles={ctx.roles} />
		{:else}
			<!-- Catalog (left): what exists globally / what can be added -->
			<CatalogSidebar />

			<!-- Canvas (center) -->
			<div class="canvas-container">
				<SvelteFlowProvider>
					<WorkflowCanvas
						bind:nodes={flow.nodes}
						bind:edges={flow.edges}
						{nodeTypes}
						{edgeTypes}
						{hasStartStage}
						connectingFrom={ui.connectingFrom}
						{onPaneClick}
						{onNodeClick}
						{onEdgeClick}
						onNodeContextMenu={handleNodeContextMenu}
						{onNodeAdded}
						onConnect={handleConnect}
					/>
				</SvelteFlowProvider>
			</div>

			<!-- Inspector (right): configuration of the current selection -->
			<InspectorHost />
		{/if}
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
		gap: 1rem;
		flex-shrink: 0;
		/* Light mode: visible background and border */
		background: oklch(0.96 0.005 250);
		border-bottom: 1px solid oklch(0.88 0.01 250);
	}

	:global(.dark) .toolbar {
		background: hsl(var(--muted));
		border-bottom-color: oklch(1 0 0 / 20%);
	}

	.toolbar-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.view-toggle {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.save-error {
		font-size: 0.75rem;
		color: hsl(var(--destructive));
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
		background: hsl(var(--card));
	}

	/* XYFlow overrides */
	:global(.svelte-flow) {
		background: transparent !important;
	}
</style>
