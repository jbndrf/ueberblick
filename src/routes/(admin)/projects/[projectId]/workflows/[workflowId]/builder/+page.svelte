<script lang="ts">
	import { untrack } from 'svelte';
	import {
		SvelteFlowProvider,
		type Node,
		type Edge,
		type NodeTypes,
		type EdgeTypes,
		type NodeEventWithPointer,
		type Connection
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';

	import WorkflowCanvas from './WorkflowCanvas.svelte';

	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Separator } from '$lib/components/ui/separator';
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
		Workflow,
		Loader2
	} from 'lucide-svelte';

	import type { PageData } from './$types';
	import StageNode from './StageNode.svelte';
	import EntryMarkerNode from './EntryMarkerNode.svelte';
	import ActionEdge from './ActionEdge.svelte';
	import { ContextSidebar, createContext, type SelectionContext, type StageData } from './context-sidebar';
	import { RightSidebar } from './right-sidebar';
	import {
		createWorkflowBuilderState,
		saveWorkflow,
		type WorkflowStage,
		type WorkflowConnection,
		type TrackedForm,
		type TrackedFormField,
		type TrackedEditTool,
		type ToolsForm,
		type ToolsFormField,
		type ToolsEdit,
		type VisualConfig
	} from '$lib/workflow-builder';
	import type { ToolInstance, FormToolConfig, EditToolConfig } from '$lib/workflow-builder/tools';
	import type { ColumnPosition } from '$lib/workflow-builder';
	import { getPocketBase } from '$lib/pocketbase';

	let { data }: { data: PageData } = $props();

	// ==========================================================================
	// State Management
	// ==========================================================================

	const builderState = createWorkflowBuilderState(data.workflow.id);

	// Initialize state from server data
	$effect(() => {
		builderState.initFromServer({
			workflowName: data.workflow?.name,
			stages: data.stages,
			connections: data.connections,
			forms: data.forms,
			formFields: data.formFields,
			editTools: data.editTools
		});
	});

	// Saving state
	let isSaving = $state(false);
	let saveError = $state<string | null>(null);

	async function handleSave() {
		isSaving = true;
		saveError = null;

		// First sync positions from xyflow nodes to state
		for (const node of nodes) {
			builderState.updateStage(node.id, {
				position_x: node.position.x,
				position_y: node.position.y
			});
		}

		const result = await saveWorkflow(getPocketBase(), builderState);

		isSaving = false;
		if (!result.success) {
			saveError = result.error || 'Failed to save';
		}
	}

	// ==========================================================================
	// Tool Instance Helpers
	// ==========================================================================

	/**
	 * Convert forms to ToolInstances for display on canvas
	 */
	function formsToToolInstances(forms: TrackedForm[]): ToolInstance[] {
		return forms.map((form, index) => ({
			id: form.data.id,
			toolType: 'form',
			config: {
				toolType: 'form',
				formId: form.data.id,
				buttonLabel: form.data.name || 'Form'
			} as FormToolConfig,
			order: index
		}));
	}

	/**
	 * Convert edit tools to ToolInstances for display on canvas
	 */
	function editToolsToToolInstances(editTools: TrackedEditTool[]): ToolInstance[] {
		return editTools.map((tool, index) => ({
			id: tool.data.id,
			toolType: 'edit',
			config: {
				toolType: 'edit',
				editableFields: tool.data.editable_fields,
				buttonLabel: tool.data.name || 'Edit'
			} as EditToolConfig,
			order: index + 100 // Offset to keep forms first
		}));
	}

	/**
	 * Get all tools for a connection
	 */
	function getToolsForConnection(connectionId: string): ToolInstance[] {
		const forms = builderState.getFormsForConnection(connectionId);
		const editTools = builderState.getEditToolsForConnection(connectionId);
		return [...formsToToolInstances(forms), ...editToolsToToolInstances(editTools)];
	}

	/**
	 * Get all tools for a stage
	 */
	function getToolsForStage(stageId: string): ToolInstance[] {
		const forms = builderState.getFormsForStage(stageId);
		const editTools = builderState.getEditToolsForStage(stageId);
		return [...formsToToolInstances(forms), ...editToolsToToolInstances(editTools)];
	}

	// ==========================================================================
	// XYFlow Integration
	// ==========================================================================

	const nodeTypes: NodeTypes = {
		stage: StageNode,
		entryMarker: EntryMarkerNode
	};

	const edgeTypes: EdgeTypes = {
		action: ActionEdge
	};

	// Convert state stages to xyflow nodes
	function stagesToNodes(stages: WorkflowStage[]): Node[] {
		return stages.map((stage) => ({
			id: stage.id,
			type: 'stage',
			position: {
				x: stage.position_x || 100,
				y: stage.position_y || 100
			},
			data: {
				title: stage.stage_name,
				key: stage.id.slice(0, 8), // Short ID for display
				stageType: stage.stage_type,
				visible_to_roles: stage.visible_to_roles || [],
				tools: getToolsForStage(stage.id),
				onSelectTool: (toolId: string) => handleSelectStageTool(stage.id, toolId),
				onAddTool: () => handleAddStageToolClick(stage.id)
			}
		}));
	}

	// Generate virtual entry marker nodes for entry connections (from_stage_id = null)
	function entryConnectionsToMarkerNodes(
		connections: WorkflowConnection[],
		stages: WorkflowStage[],
		currentNodePositions: Map<string, { x: number; y: number }>
	): Node[] {
		const entryConnections = connections.filter((conn) => !conn.from_stage_id);

		return entryConnections.map((conn) => {
			// Find target stage position
			const targetStage = stages.find((s) => s.id === conn.to_stage_id);
			// Use current node position if available (for drag updates), otherwise use state position
			const currentPos = currentNodePositions.get(conn.to_stage_id);
			const targetX = currentPos?.x ?? targetStage?.position_x ?? 100;
			const targetY = currentPos?.y ?? targetStage?.position_y ?? 100;

			return {
				id: `entry-marker-${conn.id}`,
				type: 'entryMarker',
				position: {
					x: targetX - 180, // Position 180px to the left of start stage
					y: targetY + 10 // Slightly below center for visual alignment
				},
				data: {
					label: 'Entry',
					connectionId: conn.id
				},
				draggable: false,
				selectable: false // Selection happens via the edge, not the marker
			};
		});
	}

	// Convert state connections to xyflow edges (including entry connections)
	function connectionsToEdges(connections: WorkflowConnection[]): Edge[] {
		return connections.map((conn) => {
			const isEntryConnection = !conn.from_stage_id;
			const isSelfLoop = !isEntryConnection && conn.from_stage_id === conn.to_stage_id;

			return {
				id: conn.id,
				// For entry connections, use the virtual marker node as source
				source: isEntryConnection ? `entry-marker-${conn.id}` : (conn.from_stage_id as string),
				target: conn.to_stage_id,
				label: conn.visual_config?.button_label || conn.action_name,
				type: 'action',
				animated: isSelfLoop,
				style: isEntryConnection
					? 'stroke: rgb(34 197 94); stroke-dasharray: 5 5;'
					: conn.visual_config?.button_color
						? `stroke: ${conn.visual_config.button_color}`
						: undefined,
				data: {
					tools: getToolsForConnection(conn.id),
					isSelfLoop,
					isEntry: isEntryConnection,
					onSelectTool: (toolId: string) => handleSelectConnectionTool(conn.id, toolId),
					onAddTool: () => handleAddProgressToolForEdge(conn.id),
					allowed_roles: conn.allowed_roles || [],
					visual_config: conn.visual_config || {}
				}
			};
		});
	}

	// Reactive nodes/edges from state (use $state.raw for xyflow compatibility)
	let nodes = $state.raw<Node[]>([
		...stagesToNodes(builderState.visibleStages.map((s) => s.data)),
		...entryConnectionsToMarkerNodes(
			builderState.visibleConnections.map((c) => c.data),
			builderState.visibleStages.map((s) => s.data),
			new Map()
		)
	]);
	let edges = $state.raw<Edge[]>(
		connectionsToEdges(builderState.visibleConnections.map((c) => c.data))
	);

	// Sync nodes/edges when state changes
	// Include forms and editTools in dependencies so tools update on canvas
	$effect(() => {
		// Access these to create dependency
		const _forms = builderState.visibleForms;
		const _editTools = builderState.visibleEditTools;
		const _stages = builderState.visibleStages;
		const _connections = builderState.visibleConnections;

		// Preserve current node positions (they're only synced to state on save)
		// Use untrack to read nodes without creating circular dependency
		const currentPositions = untrack(() => new Map(nodes.map((n) => [n.id, n.position])));

		// Generate stage nodes with preserved positions
		const stageNodes = stagesToNodes(_stages.map((s) => s.data)).map((node) => {
			const currentPos = currentPositions.get(node.id);
			return currentPos ? { ...node, position: currentPos } : node;
		});

		// Generate entry marker nodes (positioned relative to their target stages)
		const entryMarkerNodes = entryConnectionsToMarkerNodes(
			_connections.map((c) => c.data),
			_stages.map((s) => s.data),
			currentPositions
		);

		nodes = [...stageNodes, ...entryMarkerNodes];
	});

	$effect(() => {
		// Access these to create dependency - force re-run when tools change
		const _forms = builderState.visibleForms;
		const _editTools = builderState.visibleEditTools;
		const _connections = builderState.visibleConnections;

		// Log for debugging entry connection tools
		console.log('All forms:', _forms.map(f => ({ id: f.data.id, connection_id: f.data.connection_id, stage_id: f.data.stage_id, name: f.data.name })));
		const entryConns = _connections.filter(c => !c.data.from_stage_id);
		for (const ec of entryConns) {
			const tools = getToolsForConnection(ec.data.id);
			console.log('Entry connection', ec.data.id, 'has tools:', tools);
		}

		edges = connectionsToEdges(_connections.map((c) => c.data));
	});

	// Connection state
	let connectingFrom = $state<string | null>(null);

	// Selection context for context sidebar
	let selectionContext = $state<SelectionContext>(createContext.none());

	// Derived helpers
	const selectedStageId = $derived(
		selectionContext.type === 'stage' ? selectionContext.stageId : null
	);
	const hasStartStage = $derived(builderState.hasStartStage);

	// Form editor derived state
	const selectedForm = $derived.by((): ToolsForm | null => {
		if (selectionContext.type !== 'form') return null;
		const form = builderState.getFormById(selectionContext.formId);
		return form?.data ?? null;
	});

	const formFields = $derived.by((): TrackedFormField[] => {
		if (selectionContext.type !== 'form') return [];
		return builderState.getFieldsForForm(selectionContext.formId);
	});

	// Ancestor fields for smart dropdown configuration
	const ancestorFields = $derived.by(() => {
		if (selectionContext.type !== 'form') return [];
		// Only get ancestors if form is attached to a connection
		if (selectionContext.attachedTo.type === 'connection') {
			return builderState.getAncestorFormFields(selectionContext.attachedTo.connectionId);
		}
		return [];
	});

	// Edit tool editor derived state
	const selectedEditTool = $derived.by((): ToolsEdit | null => {
		if (selectionContext.type !== 'editTool') return null;
		const editTool = builderState.getEditToolById(selectionContext.editToolId);
		return editTool?.data ?? null;
	});

	// Ancestor fields for edit tool configuration
	const editToolAncestorFields = $derived.by(() => {
		if (selectionContext.type !== 'editTool') return [];
		// Get ancestors based on what the edit tool is attached to
		if (selectionContext.attachedTo.type === 'connection') {
			return builderState.getAncestorFormFields(selectionContext.attachedTo.connectionId);
		} else if (selectionContext.attachedTo.type === 'stage') {
			return builderState.getAncestorFormFieldsForStage(selectionContext.attachedTo.stageId);
		}
		return [];
	});

	// Stage edit tools for property view (when a stage is selected)
	const stageEditTools = $derived.by((): ToolsEdit[] => {
		if (selectionContext.type !== 'stage') return [];
		const tools = builderState.getEditToolsForStage(selectionContext.stageId);
		return tools.map(t => t.data);
	});

	// Connection forms for property view (when a connection/action is selected)
	const connectionForms = $derived.by((): ToolsForm[] => {
		if (selectionContext.type !== 'action') return [];
		const forms = builderState.getFormsForConnection(selectionContext.actionId);
		return forms.map(f => f.data);
	});

	// Connection edit tools for property view (when a connection/action is selected)
	const connectionEditTools = $derived.by((): ToolsEdit[] => {
		if (selectionContext.type !== 'action') return [];
		const tools = builderState.getEditToolsForConnection(selectionContext.actionId);
		return tools.map(t => t.data);
	});

	// Callback when a new node is added via drag-drop (from DefaultPanel)
	function onNodeAdded(node: Node) {
		// Add to state with proper type
		const stageType = node.data.stageType as 'start' | 'intermediate' | 'end';
		builderState.addStage(stageType, node.position);
	}

	// Handle node context menu (right-click to connect)
	const handleNodeContextMenu: NodeEventWithPointer<MouseEvent> = ({ event, node }) => {
		event.preventDefault();

		// Ignore entry markers for connections
		if (node.type === 'entryMarker') return;

		const nodeId = node.id;

		if (connectingFrom === null) {
			// Start connection
			connectingFrom = nodeId;
		} else if (connectingFrom === nodeId) {
			// Same node - create edit action (self-loop)
			builderState.addConnection(nodeId, nodeId);
			connectingFrom = null;
		} else {
			// Different node - create normal transition
			builderState.addConnection(connectingFrom, nodeId);
			connectingFrom = null;
		}
	};

	// Cancel connection on canvas click
	function onPaneClick() {
		connectingFrom = null;
		selectionContext = createContext.none();
	}

	// Handle connection via handle drag (standard xyflow way)
	function handleConnect(connection: Connection) {
		if (!connection.source || !connection.target) return;
		builderState.addConnection(connection.source, connection.target);
	}

	// Handle node click for selection
	function onNodeClick({ node }: { node: Node }) {
		// Ignore entry marker clicks (or select the entry edge instead)
		if (node.type === 'entryMarker') {
			// Find and select the entry edge
			const connectionId = node.data.connectionId as string;
			const edge = edges.find((e) => e.id === connectionId);
			if (edge) {
				selectionContext = createContext.action(edge);
			}
			return;
		}
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
			// Check for affected connections
			const affected = builderState.getAffectedConnections(selectedStageId);
			if (affected.length > 0) {
				// TODO: Show warning dialog before deleting
				// For now, cascade delete
				builderState.deleteStage(selectedStageId, true);
			} else {
				builderState.deleteStage(selectedStageId, false);
			}
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
			builderState.deleteConnection(selectionContext.actionId);
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

	// Tool handlers
	function handleAddStageTool(toolType: string) {
		if (!selectedStageId) return;

		if (toolType === 'form') {
			// Create a new form attached to this stage
			builderState.addForm({ stageId: selectedStageId });
		} else if (toolType === 'edit') {
			// Create a new edit tool attached to this stage
			builderState.addEditTool({ stageId: selectedStageId });
		}
	}

	function handleAddProgressTool(toolType: string) {
		if (selectionContext.type === 'action') {
			const connectionId = selectionContext.actionId;

			if (toolType === 'form') {
				// Create a new form attached to this connection
				builderState.addForm({ connectionId });
			} else if (toolType === 'edit') {
				// Create a new edit tool attached to this connection
				builderState.addEditTool({ connectionId });
			}
		}
	}

	function handleAddProgressToolForEdge(edgeId: string) {
		// Select the edge and open the tool picker in sidebar
		const edge = edges.find((e) => e.id === edgeId);
		if (edge) {
			selectionContext = createContext.action(edge);
		}
	}

	/**
	 * Handle tool selection on a stage (from canvas click)
	 */
	function handleSelectStageTool(stageId: string, toolId: string) {
		// Find the tool to determine its type
		const forms = builderState.getFormsForStage(stageId);
		const editTools = builderState.getEditToolsForStage(stageId);

		const form = forms.find(f => f.data.id === toolId);
		if (form) {
			selectionContext = createContext.form(toolId, { type: 'stage', stageId });
			return;
		}

		const editTool = editTools.find(e => e.data.id === toolId);
		if (editTool) {
			selectionContext = createContext.editTool(toolId, { type: 'stage', stageId });
		}
	}

	/**
	 * Handle tool selection on a connection (from canvas click)
	 */
	function handleSelectConnectionTool(connectionId: string, toolId: string) {
		// Find the tool to determine its type
		const forms = builderState.getFormsForConnection(connectionId);
		const editTools = builderState.getEditToolsForConnection(connectionId);

		const form = forms.find(f => f.data.id === toolId);
		if (form) {
			selectionContext = createContext.form(toolId, { type: 'connection', connectionId });
			return;
		}

		const editTool = editTools.find(e => e.data.id === toolId);
		if (editTool) {
			selectionContext = createContext.editTool(toolId, { type: 'connection', connectionId });
		}
	}

	/**
	 * Handle add tool button click on stage
	 */
	function handleAddStageToolClick(stageId: string) {
		// Select the stage and let sidebar show tool picker
		const node = nodes.find(n => n.id === stageId);
		if (node) {
			selectionContext = createContext.stage(node as Node<StageData>);
		}
	}

	// Right sidebar handlers
	function handleStageRename(stageId: string, newName: string) {
		builderState.updateStage(stageId, { stage_name: newName });
	}

	function handleStageRolesChange(stageId: string, roleIds: string[]) {
		builderState.updateStage(stageId, { visible_to_roles: roleIds });
	}

	function handleEdgeRename(edgeId: string, newName: string) {
		const conn = builderState.getConnectionById(edgeId);
		if (conn) {
			builderState.updateConnection(edgeId, {
				visual_config: {
					...conn.data.visual_config,
					button_label: newName
				}
			});
		}
	}

	function handleEdgeRolesChange(edgeId: string, roleIds: string[]) {
		builderState.updateConnection(edgeId, { allowed_roles: roleIds });
	}

	function handleEdgeSettingsChange(edgeId: string, settings: Record<string, unknown>) {
		const conn = builderState.getConnectionById(edgeId);
		if (conn) {
			builderState.updateConnection(edgeId, {
				visual_config: {
					...conn.data.visual_config,
					button_label: settings.buttonLabel as string | undefined,
					button_color: settings.buttonColor as string | undefined,
					requires_confirmation: settings.requiresConfirmation as boolean | undefined,
					confirmation_message: settings.confirmationMessage as string | undefined
				}
			});
		}
	}

	function handleSelectAction(edge: Edge) {
		selectionContext = createContext.action(edge);
	}

	function handleSelectStage(node: Node<StageData>) {
		selectionContext = createContext.stage(node);
	}

	// Form editor handlers
	function handleFormNameChange(formId: string, name: string) {
		builderState.updateForm(formId, { name });
	}

	function handleAddFormField(formId: string, fieldType: string, page: number, rowIndex: number, columnPosition: ColumnPosition) {
		// Add the field with explicit row positioning
		builderState.addFormField(
			formId,
			fieldType as ToolsFormField['field_type'],
			rowIndex,
			columnPosition,
			page
		);
	}

	function handleFormFieldUpdate(fieldId: string, updates: Partial<ToolsFormField>) {
		builderState.updateFormField(fieldId, updates);
	}

	function handleFormFieldDelete(fieldId: string) {
		builderState.deleteFormField(fieldId);
	}

	function handleFormFieldsReorder(formId: string, fieldIds: string[]) {
		// Update field_order for each field based on new order
		fieldIds.forEach((fieldId, index) => {
			builderState.updateFormField(fieldId, { field_order: index });
		});
	}

	function handleFormAddPage(formId: string) {
		// Get all fields for this form to find the next page number
		const formFields = builderState.getFieldsForForm(formId);
		const maxPage = formFields.reduce((max, f) => Math.max(max, f.data.page ?? 1), 1);
		const nextPage = maxPage + 1;

		// Add a placeholder field on the new page so it shows up
		const newField = builderState.addFormField(formId, 'short_text', 0, 'full', nextPage);
		if (newField) {
			builderState.updateFormField(newField.id, {
				page_title: `Page ${nextPage}`,
				field_label: 'New Field'
			});
		}
	}

	function handleFormDeletePage(formId: string, page: number) {
		// Get all fields on this page and delete them
		const formFields = builderState.getFieldsForForm(formId);
		const fieldsOnPage = formFields.filter(f => (f.data.page ?? 1) === page);

		for (const field of fieldsOnPage) {
			builderState.deleteFormField(field.data.id);
		}
	}

	function handleFormPageTitleChange(formId: string, page: number, title: string) {
		// Update page_title on the first field of the page
		const formFields = builderState.getFieldsForForm(formId);
		const fieldsOnPage = formFields
			.filter(f => (f.data.page ?? 1) === page)
			.sort((a, b) => (a.data.field_order ?? 0) - (b.data.field_order ?? 0));

		if (fieldsOnPage.length > 0) {
			builderState.updateFormField(fieldsOnPage[0].data.id, { page_title: title });
		}
	}

	function handleFormClose() {
		selectionContext = createContext.none();
	}

	function handleFormRolesChange(formId: string, roleIds: string[]) {
		builderState.updateForm(formId, { allowed_roles: roleIds });
	}

	function handleFormVisualConfigChange(formId: string, config: VisualConfig) {
		builderState.updateForm(formId, { visual_config: config });
	}

	// Edit tool editor handlers
	function handleEditToolNameChange(editToolId: string, name: string) {
		builderState.updateEditTool(editToolId, { name });
	}

	function handleEditToolFieldsChange(editToolId: string, fieldIds: string[]) {
		builderState.updateEditTool(editToolId, { editable_fields: fieldIds });
	}

	function handleEditToolRolesChange(editToolId: string, roleIds: string[]) {
		builderState.updateEditTool(editToolId, { allowed_roles: roleIds });
	}

	function handleEditToolVisualConfigChange(editToolId: string, config: VisualConfig) {
		builderState.updateEditTool(editToolId, { visual_config: config });
	}

	function handleEditToolClose() {
		selectionContext = createContext.none();
	}

	function handleEditToolDelete(editToolId: string) {
		builderState.deleteEditTool(editToolId);
		selectionContext = createContext.none();
	}

	// Tool handlers for stage property panel
	function handleToolRolesChange(toolId: string, roleIds: string[]) {
		builderState.updateEditTool(toolId, { allowed_roles: roleIds });
	}

	function handleToolVisualConfigChange(toolId: string, config: VisualConfig) {
		builderState.updateEditTool(toolId, { visual_config: config });
	}

	// Handle tool selection from sidebar Tools tab
	function handleSelectToolFromSidebar(toolType: string, toolId: string) {
		if (selectionContext.type === 'stage') {
			// Tool on a stage
			if (toolType === 'edit') {
				selectionContext = createContext.editTool(toolId, { type: 'stage', stageId: selectionContext.stageId });
			} else if (toolType === 'form') {
				selectionContext = createContext.form(toolId, { type: 'stage', stageId: selectionContext.stageId });
			}
		} else if (selectionContext.type === 'action') {
			// Tool on a connection
			if (toolType === 'edit') {
				selectionContext = createContext.editTool(toolId, { type: 'connection', connectionId: selectionContext.actionId });
			} else if (toolType === 'form') {
				selectionContext = createContext.form(toolId, { type: 'connection', connectionId: selectionContext.actionId });
			}
		}
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
					<Loader2 class="h-4 w-4 mr-2 animate-spin" />
					Saving...
				{:else}
					<Save class="h-4 w-4 mr-2" />
					Save{builderState.isDirty ? '*' : ''}
				{/if}
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
				value={builderState.workflowName}
				oninput={(e) => (builderState.workflowName = e.currentTarget.value)}
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
			onAddStageTool={handleAddStageTool}
			onChangeActionType={handleChangeActionType}
			onEditAction={handleEditAction}
			onDeleteAction={handleDeleteAction}
			onAddProgressTool={handleAddProgressTool}
			onToggleRequired={handleToggleRequired}
			onMoveFieldUp={handleMoveFieldUp}
			onMoveFieldDown={handleMoveFieldDown}
			onDuplicateField={handleDuplicateField}
			onEditField={handleEditField}
			onDeleteField={handleDeleteField}
		/>

		<!-- Canvas (main area) -->
		<div class="canvas-container">
			<SvelteFlowProvider>
				<WorkflowCanvas
					bind:nodes
					bind:edges
					{nodeTypes}
					{edgeTypes}
					{hasStartStage}
					{connectingFrom}
					onNodesChange={(n) => (nodes = n)}
					onEdgesChange={(e) => (edges = e)}
					{onPaneClick}
					{onNodeClick}
					{onEdgeClick}
					onNodeContextMenu={handleNodeContextMenu}
					{onNodeAdded}
					onConnect={handleConnect}
				/>
			</SvelteFlowProvider>
		</div>

		<!-- Right Sidebar (context-aware: PropertyView when selected, PreviewView otherwise) -->
		<RightSidebar
			context={selectionContext}
			workflowName={builderState.workflowName}
			{nodes}
			{edges}
			roles={data.roles}
			{selectedForm}
			{formFields}
			{ancestorFields}
			{selectedEditTool}
			{editToolAncestorFields}
			{stageEditTools}
			{connectionForms}
			{connectionEditTools}
			onStageRename={handleStageRename}
			onStageDelete={handleDeleteStage}
			onStageRolesChange={handleStageRolesChange}
			onEdgeRename={handleEdgeRename}
			onEdgeDelete={handleDeleteAction}
			onEdgeRolesChange={handleEdgeRolesChange}
			onEdgeSettingsChange={handleEdgeSettingsChange}
			onSelectAction={handleSelectAction}
			onSelectStage={handleSelectStage}
			onToolRolesChange={handleToolRolesChange}
			onToolVisualConfigChange={handleToolVisualConfigChange}
			onSelectTool={handleSelectToolFromSidebar}
			onFormNameChange={handleFormNameChange}
			onAddFormField={handleAddFormField}
			onFormFieldUpdate={handleFormFieldUpdate}
			onFormFieldDelete={handleFormFieldDelete}
			onFormFieldsReorder={handleFormFieldsReorder}
			onFormAddPage={handleFormAddPage}
			onFormDeletePage={handleFormDeletePage}
			onFormPageTitleChange={handleFormPageTitleChange}
			onFormClose={handleFormClose}
			onFormRolesChange={handleFormRolesChange}
			onFormVisualConfigChange={handleFormVisualConfigChange}
			onEditToolNameChange={handleEditToolNameChange}
			onEditToolFieldsChange={handleEditToolFieldsChange}
			onEditToolDelete={handleEditToolDelete}
			onEditToolClose={handleEditToolClose}
		/>
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
