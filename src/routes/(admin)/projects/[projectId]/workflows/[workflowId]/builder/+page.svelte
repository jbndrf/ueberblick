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

	import {
		Save,
		CircleHelp,
		Loader2
	} from 'lucide-svelte';

	import type { PageData } from './$types';
	import StageNode from './StageNode.svelte';
	import EntryMarkerNode from './EntryMarkerNode.svelte';
	import ActionEdge from './ActionEdge.svelte';
	import { ContextSidebar, createContext, type SelectionContext, type StageData } from './context-sidebar';
	import { RightSidebar } from './right-sidebar';
	import type { StageAction, TimelineStage, IncomingFormGroup } from './right-sidebar/views/stage-preview';
	import type { FormFieldWithValue } from '$lib/components/form-renderer';
	import {
		createWorkflowBuilderState,
		type WorkflowStage,
		type WorkflowConnection,
		type TrackedForm,
		type TrackedFormField,
		type TrackedEditTool,
		type ToolsForm,
		type ToolsFormField,
		type ToolsEdit,
		type ToolsAutomation,
		type VisualConfig,
		type TriggerType,
		type TriggerConfig,
		type AutomationStep
	} from '$lib/workflow-builder';
	import type { ToolInstance, FormToolConfig, EditToolConfig, AutomationToolConfig, FieldTagToolConfig } from '$lib/workflow-builder/tools';
	import { ToolBar } from '$lib/workflow-builder/components';
	import type { ColumnPosition } from '$lib/workflow-builder';
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

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
			editTools: data.editTools,
			automations: data.automations,
			fieldTags: data.fieldTags
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

		// Sync global tools to have all stage IDs
		builderState.syncGlobalToolStages();

		// Use server action for saving
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
				saveError = (result.data as any)?.message || 'Failed to save';
			}
		} catch (err) {
			saveError = err instanceof Error ? err.message : 'Failed to save';
		}

		isSaving = false;
	}

	// Create role callback for MobileMultiSelect components in property panels
	async function createRole(name: string) {
		const formData = new FormData();
		formData.append('name', name);

		const response = await fetch('?/createRole', {
			method: 'POST',
			body: formData
		});

		const result = deserialize(await response.text());
		if (result.type === 'success' && result.data?.entity) {
			await invalidateAll();
			return result.data.entity;
		}
		throw new Error('Failed to create role');
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
		const editTools = builderState.getNonGlobalEditToolsForStage(stageId);
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
				x: stage.position_x ?? 100,
				y: stage.position_y ?? 100
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
					label: conn.visual_config?.button_label || conn.action_name || 'Entry',
					connectionId: conn.id
				},
				draggable: false,
				selectable: false // Selection happens via the edge, not the marker
			};
		});
	}

	// Convert state connections to xyflow edges (including entry connections)
	function connectionsToEdges(connections: WorkflowConnection[], highlighted: Set<string>): Edge[] {
		return connections.map((conn) => {
			const isEntryConnection = !conn.from_stage_id;
			const isSelfLoop = !isEntryConnection && conn.from_stage_id === conn.to_stage_id;
			const isHighlighted = highlighted.has(conn.id);

			const classes = [
				isEntryConnection ? 'entry-edge' : '',
				isHighlighted ? 'highlighted' : ''
			].filter(Boolean).join(' ') || undefined;

			return {
				id: conn.id,
				// For entry connections, use the virtual marker node as source
				source: isEntryConnection ? `entry-marker-${conn.id}` : (conn.from_stage_id as string),
				target: conn.to_stage_id,
				label: conn.visual_config?.button_label || conn.action_name,
				type: 'action',
				animated: isSelfLoop,
				class: classes,
				style: !isEntryConnection && conn.visual_config?.button_color
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
		connectionsToEdges(builderState.visibleConnections.map((c) => c.data), new Set())
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
		// Preserve existing entry marker positions, only calculate fresh for new markers
		const entryMarkerNodes = entryConnectionsToMarkerNodes(
			_connections.map((c) => c.data),
			_stages.map((s) => s.data),
			currentPositions
		).map((node) => {
			const currentPos = currentPositions.get(node.id);
			return currentPos ? { ...node, position: currentPos } : node;
		});

		nodes = [...stageNodes, ...entryMarkerNodes];
	});

	$effect(() => {
		// Access these to create dependency - force re-run when tools change
		const _forms = builderState.visibleForms;
		const _editTools = builderState.visibleEditTools;
		const _connections = builderState.visibleConnections;
		const _highlighted = highlightedEdgeIds;

		edges = connectionsToEdges(_connections.map((c) => c.data), _highlighted);
	});

	// Connection state
	let connectingFrom = $state<string | null>(null);

	// Selection context for context sidebar
	let selectionContext = $state<SelectionContext>(createContext.none());

	// Sync selection highlight onto canvas nodes
	// Edge selection is handled natively by xyflow on canvas clicks
	$effect(() => {
		const ctx = selectionContext;

		const selectedNodeId = ctx.type === 'stage' ? ctx.stageId : null;

		const updatedNodes = untrack(() => nodes).map(n => {
			const shouldSelect = n.id === selectedNodeId;
			if (!!n.selected === shouldSelect) return n;
			return { ...n, selected: shouldSelect };
		});
		if (updatedNodes.some((n, i) => n !== untrack(() => nodes)[i])) {
			nodes = updatedNodes;
		}
	});

	// ========================================================================
	// Edge Highlighting
	// ========================================================================

	let hoverEdgeId = $state<string | null>(null);

	// Edges to highlight (from button hover/click in stage preview)
	const highlightedEdgeIds = $derived.by(() => {
		const ids = new Set<string>();
		if (hoverEdgeId) ids.add(hoverEdgeId);
		return ids;
	});

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
		} else if (selectionContext.attachedTo.type === 'global') {
			// For global tools, get all form fields from all stages
			return builderState.getAllFormFields();
		}
		return [];
	});

	// Stage edit tools for property view (when a stage is selected)
	const stageEditTools = $derived.by((): ToolsEdit[] => {
		if (selectionContext.type !== 'stage') return [];
		const tools = builderState.getNonGlobalEditToolsForStage(selectionContext.stageId);
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

	// Global edit tools (is_global=true, available on all stages)
	const globalEditTools = $derived.by(() => {
		return builderState.getGlobalEditTools();
	});

	// ==========================================================================
	// Automation State
	// ==========================================================================

	const automations = $derived(builderState.visibleAutomations.map(a => a.data));

	const selectedAutomation = $derived.by((): ToolsAutomation | null => {
		if (selectionContext.type !== 'automation') return null;
		const automation = builderState.getAutomationById(selectionContext.automationId);
		return automation?.data ?? null;
	});

	// Stage options for automation dropdowns
	const automationStages = $derived(
		builderState.visibleStages.map(s => ({ id: s.data.id, name: s.data.stage_name }))
	);

	// Field options for automation dropdowns (all form fields across the workflow)
	const automationFieldOptions = $derived.by(() => {
		const options: { key: string; label: string }[] = [];
		for (const form of builderState.visibleForms) {
			const fields = builderState.getFieldsForForm(form.data.id);
			for (const field of fields) {
				// Use field ID as key (matches field_key in field_values)
				options.push({
					key: field.data.id,
					label: field.data.field_label || field.data.id
				});
			}
		}
		return options;
	});

	// ==========================================================================
	// Field Tag State
	// ==========================================================================

	const fieldTagMappings = $derived.by(() => {
		const ft = builderState.getFieldTagForWorkflow();
		return ft?.data.tag_mappings ?? [];
	});

	const fieldTagAllFormFields = $derived.by(() => {
		return builderState.getAllFormFields();
	});

	function handleFieldTagMappingChange(tagType: string, fieldId: string | null, config?: Record<string, unknown>) {
		builderState.setTagMapping(tagType, fieldId, config);
	}

	function handleFieldTagConfigChange(tagType: string, config: Record<string, unknown>) {
		builderState.updateTagMappingConfig(tagType, config);
	}

	// ==========================================================================
	// Stage Preview Data (participant sidebar lookalike)
	// ==========================================================================

	const stagePreviewData = $derived.by(() => {
		if (selectionContext.type !== 'stage') return null;
		const stageId = selectionContext.stageId;
		const stageData = builderState.getStageById(stageId);
		if (!stageData) return null;

		const stage = stageData.data;

		// Outgoing connections (= transition buttons)
		const outgoing: StageAction[] = builderState.visibleConnections
			.filter((c) => c.data.from_stage_id === stageId)
			.map((c) => {
				const conn = c.data;
				const targetStage = builderState.getStageById(conn.to_stage_id);
				const connForms = builderState.getFormsForConnection(conn.id).map((f) => f.data);
				const connEditTools = builderState.getEditToolsForConnection(conn.id).map((t) => t.data);
				return {
					type: 'connection' as const,
					id: conn.id,
					buttonLabel: conn.visual_config?.button_label || conn.action_name,
					buttonColor: conn.visual_config?.button_color,
					allowed_roles: conn.allowed_roles || [],
					edge: edges.find((e) => e.id === conn.id),
					targetStage: targetStage?.data,
					forms: connForms,
					editTools: connEditTools
				};
			});

		// Stage edit tools (non-global, = tool buttons)
		const stageToolActions: StageAction[] = builderState
			.getNonGlobalEditToolsForStage(stageId)
			.map((t) => ({
				type: 'stage_tool' as const,
				id: t.data.id,
				buttonLabel: t.data.visual_config?.button_label || t.data.name,
				buttonColor: t.data.visual_config?.button_color,
				allowed_roles: t.data.allowed_roles || [],
				tool: t.data
			}));

		// Stage forms (stage-attached, = form buttons)
		const stageFormActions: StageAction[] = builderState
			.getFormsForStage(stageId)
			.map((f) => ({
				type: 'stage_form' as const,
				id: f.data.id,
				buttonLabel: f.data.visual_config?.button_label || f.data.name,
				buttonColor: f.data.visual_config?.button_color,
				allowed_roles: f.data.allowed_roles || [],
				form: f.data
			}));

		// Global tools (shown at every stage)
		const globalToolActions: StageAction[] = builderState.getGlobalEditTools().map((t) => ({
			type: 'global_tool' as const,
			id: t.data.id,
			buttonLabel: t.data.visual_config?.button_label || t.data.name,
			buttonColor: t.data.visual_config?.button_color,
			allowed_roles: t.data.allowed_roles || [],
			tool: t.data
		}));

		// Incoming forms (from connections targeting this stage) for the Details tab
		const incomingForms: IncomingFormGroup[] = [];
		const incomingConnections = builderState.visibleConnections
			.filter((c) => c.data.to_stage_id === stageId);
		for (const c of incomingConnections) {
			const connForms = builderState.getFormsForConnection(c.data.id);
			for (const tf of connForms) {
				const fields = builderState.getFieldsForForm(tf.data.id).map((f) => f.data);
				incomingForms.push({
					connectionName: c.data.action_name || 'Connection',
					form: tf.data,
					fields
				});
			}
		}

		// Timeline: compute ancestors and descendants
		const ancestors = builderState.getAncestorStages(stageId);
		const allStages = builderState.visibleStages.map((s) => s.data);
		const ancestorIds = new Set(ancestors.map((a) => a.data.id));

		// Build timeline from ancestors -> current -> rest
		const timelineStages: TimelineStage[] = [];
		for (const a of ancestors) {
			timelineStages.push({
				id: a.data.id,
				name: a.data.stage_name,
				status: 'completed'
			});
		}
		timelineStages.push({
			id: stageId,
			name: stage.stage_name,
			status: 'current'
		});
		// Add stages that are not ancestors and not current
		for (const s of allStages) {
			if (s.id !== stageId && !ancestorIds.has(s.id)) {
				timelineStages.push({
					id: s.id,
					name: s.stage_name,
					status: 'future'
				});
			}
		}

		// Available target stages for new connections (exclude self-loops for now)
		const availableTargetStages = allStages.filter((s) => s.id !== stageId);

		return {
			stage,
			actions: [...outgoing, ...stageToolActions, ...stageFormActions] as StageAction[],
			globalTools: globalToolActions,
			timeline: timelineStages,
			availableTargetStages,
			incomingForms
		};
	});

	// Per-stage form groups for PreviewView (workflow overview)
	// Each entry includes form name, allowed_roles, and fields -- enables role filtering
	type PreviewFormGroup = { formName: string; allowedRoles: string[]; fields: FormFieldWithValue[] };
	const previewStageFields = $derived.by(() => {
		const map = new Map<string, PreviewFormGroup[]>();
		for (const s of builderState.visibleStages) {
			const groups: PreviewFormGroup[] = [];
			// Forms from incoming connections
			const incoming = builderState.visibleConnections.filter(c => c.data.to_stage_id === s.data.id);
			for (const c of incoming) {
				for (const f of builderState.getFormsForConnection(c.data.id)) {
					groups.push({
						formName: f.data.name || 'Unnamed form',
						allowedRoles: f.data.allowed_roles || [],
						fields: builderState.getFieldsForForm(f.data.id).map(ff => ff.data as unknown as FormFieldWithValue)
					});
				}
			}
			// Stage-attached forms
			for (const f of builderState.getFormsForStage(s.data.id)) {
				groups.push({
					formName: f.data.name || 'Unnamed form',
					allowedRoles: f.data.allowed_roles || [],
					fields: builderState.getFieldsForForm(f.data.id).map(ff => ff.data as unknown as FormFieldWithValue)
				});
			}
			map.set(s.data.id, groups);
		}
		return map;
	});

	// Convert global edit tools to ToolInstances for ToolBar display
	const globalToolInstances = $derived.by((): ToolInstance[] => {
		const editInstances: ToolInstance[] = globalEditTools.map((tool, index) => ({
			id: tool.data.id,
			toolType: 'edit',
			config: {
				toolType: 'edit' as const,
				editableFields: tool.data.editable_fields || [],
				buttonLabel: tool.data.name
			} satisfies EditToolConfig,
			order: index
		}));
		const automationInstances: ToolInstance[] = automations.map((a, index) => ({
			id: a.id,
			toolType: 'automation',
			config: {
				toolType: 'automation' as const,
				buttonLabel: a.name
			} satisfies AutomationToolConfig,
			order: editInstances.length + index
		}));
		const ft = builderState.getFieldTagForWorkflow();
		const result: ToolInstance[] = [...editInstances, ...automationInstances];
		if (ft) {
			result.push({
				id: '__field_tags__',
				toolType: 'field_tag',
				config: { toolType: 'field_tag' } satisfies FieldTagToolConfig,
				order: editInstances.length + automationInstances.length
			});
		}
		return result;
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
		// Entry marker click opens the entry edge config sidebar
		if (node.type === 'entryMarker') {
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

	function handleEditToolEditModeChange(editToolId: string, editMode: 'form_fields' | 'location') {
		builderState.updateEditTool(editToolId, { edit_mode: editMode });
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

	// Handle tool deletion from sidebar Tools tab
	function handleDeleteToolFromSidebar(toolType: string, toolId: string) {
		if (toolType === 'form') {
			builderState.deleteForm(toolId);
		} else if (toolType === 'edit') {
			builderState.deleteEditTool(toolId);
		}
	}

	// Global tool handlers
	function handleOpenGlobalToolPicker() {
		// Open context sidebar with tool picker for global tools
		selectionContext = createContext.addTool({ type: 'global' });
	}

	function handleAddGlobalTool(toolType: string) {
		if (toolType === 'edit') {
			const tool = builderState.addGlobalEditTool('form_fields');
			selectionContext = createContext.editTool(tool.id, { type: 'global' });
		} else if (toolType === 'automation') {
			const automation = builderState.addAutomation('on_transition');
			selectionContext = createContext.automation(automation.id);
		} else if (toolType === 'field_tag') {
			builderState.getOrCreateFieldTag();
			selectionContext = createContext.fieldTags();
		}
	}

	function handleSelectGlobalTool(toolId: string) {
		if (toolId === '__field_tags__') {
			selectionContext = createContext.fieldTags();
			return;
		}
		// Check if it's an automation or edit tool
		const isAutomation = builderState.getAutomationById(toolId);
		if (isAutomation) {
			selectionContext = createContext.automation(toolId);
		} else {
			selectionContext = createContext.editTool(toolId, { type: 'global' });
		}
	}

	function handleGlobalToolsLabelClick() {
		selectionContext = createContext.globalTools();
	}

	function handleDeleteGlobalTool(toolType: string, toolId: string) {
		if (toolType === 'edit') {
			builderState.deleteEditTool(toolId);
		} else if (toolType === 'field_tag') {
			builderState.deleteFieldTag();
		}
		// If we were viewing this tool, go back to global tools panel
		if (selectionContext.type === 'editTool' && selectionContext.editToolId === toolId) {
			selectionContext = createContext.globalTools();
		}
		if (selectionContext.type === 'fieldTags') {
			selectionContext = createContext.globalTools();
		}
	}

	// ==========================================================================
	// Automation Handlers
	// ==========================================================================

	function handleSelectAutomation(automationId: string) {
		selectionContext = createContext.automation(automationId);
	}

	function handleAddAutomation() {
		const automation = builderState.addAutomation('on_transition');
		selectionContext = createContext.automation(automation.id);
	}

	function handleToggleAutomation(automationId: string, enabled: boolean) {
		builderState.updateAutomation(automationId, { is_enabled: enabled });
	}

	function handleDeleteAutomation(automationId: string) {
		builderState.deleteAutomation(automationId);
		if (selectionContext.type === 'automation' && selectionContext.automationId === automationId) {
			selectionContext = createContext.globalTools();
		}
	}

	function handleAutomationNameChange(automationId: string, name: string) {
		builderState.updateAutomation(automationId, { name });
	}

	function handleAutomationEnabledChange(automationId: string, enabled: boolean) {
		builderState.updateAutomation(automationId, { is_enabled: enabled });
	}

	function handleAutomationTriggerTypeChange(automationId: string, triggerType: TriggerType) {
		builderState.updateAutomation(automationId, { trigger_type: triggerType });
	}

	function handleAutomationTriggerConfigChange(automationId: string, config: TriggerConfig) {
		builderState.updateAutomation(automationId, { trigger_config: config });
	}

	function handleAutomationStepsChange(automationId: string, steps: AutomationStep[]) {
		builderState.updateAutomation(automationId, { steps });
	}

	function handleAutomationClose() {
		selectionContext = createContext.globalTools();
	}

	function handleDeleteFieldTags() {
		builderState.deleteFieldTag();
		selectionContext = createContext.globalTools();
	}

	// Currently selected global tool ID (for ToolBar highlighting)
	const selectedGlobalToolId = $derived.by(() => {
		if (selectionContext.type === 'editTool' && selectionContext.attachedTo.type === 'global') {
			return selectionContext.editToolId;
		}
		if (selectionContext.type === 'automation') {
			return selectionContext.automationId;
		}
		if (selectionContext.type === 'fieldTags') {
			return '__field_tags__';
		}
		return undefined;
	});

	// ==========================================================================
	// Stage Preview Handlers
	// ==========================================================================

	function handleAddConnectionFromPreview(fromStageId: string, toStageId: string) {
		builderState.addConnection(fromStageId, toStageId);
	}

	function handleCreateStageAndConnect(fromStageId: string) {
		const sourceNode = nodes.find(n => n.id === fromStageId);
		if (!sourceNode) {
			const newStage = builderState.addStage('intermediate');
			builderState.addConnection(fromStageId, newStage.id);
			return;
		}

		// Stack vertically when multiple stages branch from the same source
		const existingOutgoing = edges.filter(
			e => e.source === fromStageId && !e.data?.isEntry
		).length;

		const position = {
			x: sourceNode.position.x + 280,
			y: sourceNode.position.y + existingOutgoing * 120
		};
		const newStage = builderState.addStage('intermediate', position);
		builderState.addConnection(fromStageId, newStage.id);
	}

	function handleHighlightEdge(edgeId: string | null) {
		hoverEdgeId = edgeId;
	}

	function handleHighlightStageTool(toolId: string | null) {
		const stageId = selectionContext.type === 'stage' ? selectionContext.stageId : null;
		if (!stageId) return;
		nodes = nodes.map(n =>
			n.id === stageId
				? { ...n, data: { ...n.data, selectedToolId: toolId } }
				: n
		);
	}

	function handleAddStageToolFromPreview(stageId: string, toolType: string) {
		if (toolType === 'form') {
			builderState.addForm({ stageId });
		} else if (toolType === 'edit') {
			builderState.addEditTool({ stageId });
		}
	}

	function handleButtonLabelChange(actionId: string, actionType: string, label: string) {
		if (actionType === 'connection') {
			const conn = builderState.getConnectionById(actionId);
			if (conn) {
				builderState.updateConnection(actionId, {
					visual_config: { ...conn.data.visual_config, button_label: label }
				});
			}
		} else if (actionType === 'stage_tool' || actionType === 'global_tool') {
			builderState.updateEditTool(actionId, {
				visual_config: {
					...builderState.getEditToolById(actionId)?.data.visual_config,
					button_label: label
				}
			});
		} else if (actionType === 'stage_form') {
			builderState.updateForm(actionId, {
				visual_config: {
					...builderState.getFormById(actionId)?.data.visual_config,
					button_label: label
				}
			});
		}
	}

	function handleButtonColorChange(actionId: string, actionType: string, color: string) {
		if (actionType === 'connection') {
			const conn = builderState.getConnectionById(actionId);
			if (conn) {
				builderState.updateConnection(actionId, {
					visual_config: { ...conn.data.visual_config, button_color: color }
				});
			}
		} else if (actionType === 'stage_tool' || actionType === 'global_tool') {
			builderState.updateEditTool(actionId, {
				visual_config: {
					...builderState.getEditToolById(actionId)?.data.visual_config,
					button_color: color
				}
			});
		} else if (actionType === 'stage_form') {
			builderState.updateForm(actionId, {
				visual_config: {
					...builderState.getFormById(actionId)?.data.visual_config,
					button_color: color
				}
			});
		}
	}

	function handleButtonRolesChange(actionId: string, actionType: string, roleIds: string[]) {
		if (actionType === 'connection') {
			builderState.updateConnection(actionId, { allowed_roles: roleIds });
		} else if (actionType === 'stage_tool' || actionType === 'global_tool') {
			builderState.updateEditTool(actionId, { allowed_roles: roleIds });
		} else if (actionType === 'stage_form') {
			builderState.updateForm(actionId, { allowed_roles: roleIds });
		}
	}

	function handleButtonDelete(actionId: string, actionType: string) {
		if (actionType === 'connection') {
			builderState.deleteConnection(actionId);
		} else if (actionType === 'stage_tool' || actionType === 'global_tool') {
			builderState.deleteEditTool(actionId);
		} else if (actionType === 'stage_form') {
			builderState.deleteForm(actionId);
		}
	}

	function handleSelectToolFromPreview(toolType: string, toolId: string) {
		if (selectionContext.type === 'stage') {
			if (toolType === 'form') {
				selectionContext = createContext.form(toolId, { type: 'stage', stageId: selectionContext.stageId });
			} else if (toolType === 'edit') {
				selectionContext = createContext.editTool(toolId, { type: 'stage', stageId: selectionContext.stageId });
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
			onAddGlobalTool={handleAddGlobalTool}
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
					{onPaneClick}
					{onNodeClick}
					{onEdgeClick}
					onNodeContextMenu={handleNodeContextMenu}
					{onNodeAdded}
					onConnect={handleConnect}
				/>
			</SvelteFlowProvider>

			<!-- Global Tools - same style as stage/edge toolbars -->
			<div class="global-tools-bar">
				<button class="global-tools-label" onclick={handleGlobalToolsLabelClick}>Global Tools</button>
				<ToolBar
					tools={globalToolInstances}
					selectedToolId={selectedGlobalToolId}
					onSelectTool={handleSelectGlobalTool}
					onAddTool={handleOpenGlobalToolPicker}
				/>
			</div>
		</div>

		<!-- Right Sidebar (context-aware: PropertyView when selected, PreviewView otherwise) -->
		<RightSidebar
			context={selectionContext}
			workflowName={builderState.workflowName}
			{nodes}
			{edges}
			stageFields={previewStageFields}
			roles={data.roles}
			{selectedForm}
			{formFields}
			{ancestorFields}
			{selectedEditTool}
			{editToolAncestorFields}
			{stageEditTools}
			{connectionForms}
			{connectionEditTools}
			globalEditTools={globalEditTools.map(t => t.data)}
			{automations}
			{selectedAutomation}
			{automationStages}
			{automationFieldOptions}
			{fieldTagMappings}
			{fieldTagAllFormFields}
			onFieldTagMappingChange={handleFieldTagMappingChange}
			onFieldTagConfigChange={handleFieldTagConfigChange}
			onFieldTagDelete={handleDeleteFieldTags}
			{stagePreviewData}
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
			onDeleteTool={handleDeleteToolFromSidebar}
			onCreateRole={createRole}
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
			onEditToolEditModeChange={handleEditToolEditModeChange}
			onEditToolDelete={handleEditToolDelete}
			onEditToolClose={handleEditToolClose}
			onGlobalToolDelete={handleDeleteGlobalTool}
			onSelectAutomation={handleSelectAutomation}
			onAddAutomation={handleAddAutomation}
			onToggleAutomation={handleToggleAutomation}
			onDeleteAutomation={handleDeleteAutomation}
			onAutomationNameChange={handleAutomationNameChange}
			onAutomationEnabledChange={handleAutomationEnabledChange}
			onAutomationTriggerTypeChange={handleAutomationTriggerTypeChange}
			onAutomationTriggerConfigChange={handleAutomationTriggerConfigChange}
			onAutomationStepsChange={handleAutomationStepsChange}
			onAutomationClose={handleAutomationClose}
			onAddConnection={handleAddConnectionFromPreview}
			onAddStageTool={handleAddStageToolFromPreview}
			onButtonLabelChange={handleButtonLabelChange}
			onButtonColorChange={handleButtonColorChange}
			onButtonRolesChange={handleButtonRolesChange}
			onButtonDelete={handleButtonDelete}
			onCreateStageAndConnect={handleCreateStageAndConnect}
			onHighlightEdge={handleHighlightEdge}
			onHighlightStageTool={handleHighlightStageTool}
			onDeselect={() => (selectionContext = createContext.none())}
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

	/* Global Tools Bar - positioned top-left of canvas */
	.global-tools-bar {
		position: absolute;
		top: 1rem;
		left: 1rem;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.global-tools-label {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
		padding: 0.25rem 0.5rem;
		background: oklch(from var(--card) l c h / 0.9);
		border: 1px solid transparent;
		border-radius: 0.25rem;
		backdrop-filter: blur(4px);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.global-tools-label:hover {
		color: hsl(var(--foreground));
		background: hsl(var(--accent));
		border-color: hsl(var(--border));
	}

	.global-tools-label.active {
		color: hsl(var(--foreground));
		background: hsl(var(--accent));
		border-color: hsl(var(--border));
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
