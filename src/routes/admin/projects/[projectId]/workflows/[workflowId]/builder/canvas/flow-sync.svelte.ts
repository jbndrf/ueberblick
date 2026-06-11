/**
 * State → xyflow projection.
 *
 * Derives canvas nodes/edges from the builder state and keeps them in sync.
 * Node positions are canvas-local until save (the page syncs them back to
 * state in handleSave). The untrack() dance below is load-bearing — xyflow
 * needs $state.raw arrays, and reading `nodes` inside its own dependency
 * effect would loop.
 */

import { untrack } from 'svelte';
import type { Node, Edge } from '@xyflow/svelte';
import type {
	WorkflowStage,
	WorkflowConnection,
	TrackedForm,
	TrackedEditTool,
	ToolsProtocol
} from '$lib/workflow-builder';
import type {
	ToolInstance,
	FormToolConfig,
	EditToolConfig,
	ProtocolToolConfig
} from '$lib/workflow-builder/tools';
import type { BuilderContext } from '../builder-context.svelte';
import { selectTool } from '../builder-context.svelte';
import {
	workflowBuilderDefaultFormLabel,
	workflowBuilderDefaultEditLabel,
	workflowBuilderDefaultProtocolLabel,
	workflowBuilderEntryLabel
} from '$lib/paraglide/messages';

// Pre-defined region colors for visual distinction
const regionColors = ['#059669', '#7c3aed', '#d97706', '#dc2626', '#0891b2', '#be185d'];

export class FlowSync {
	nodes = $state.raw<Node[]>([]);
	edges = $state.raw<Edge[]>([]);

	private ctx: BuilderContext;

	/** Must be constructed during component init ($effect needs a root). */
	constructor(ctx: BuilderContext) {
		this.ctx = ctx;
		const state = ctx.state;

		this.nodes = [
			...this.stagesToNodes(state.visibleStages.map((s) => s.data)),
			...this.entryConnectionsToMarkerNodes(
				state.visibleConnections.map((c) => c.data),
				state.visibleStages.map((s) => s.data),
				new Map()
			)
		];
		this.edges = this.connectionsToEdges(
			state.visibleConnections.map((c) => c.data),
			new Set()
		);

		// Sync nodes when state changes. Include tools in dependencies so
		// badges update on canvas.
		$effect(() => {
			const _forms = state.visibleForms;
			const _editTools = state.visibleEditTools;
			const _protocolTools = state.visibleProtocolTools;
			const _stages = state.visibleStages;
			const _connections = state.visibleConnections;
			const _hoverToolId = ctx.ui.hoverStageToolId;

			// Preserve current node positions (they're only synced to state on save)
			// Use untrack to read nodes without creating circular dependency
			const currentPositions = untrack(() => new Map(this.nodes.map((n) => [n.id, n.position])));

			const stageNodes = this.stagesToNodes(_stages.map((s) => s.data)).map((node) => {
				const currentPos = currentPositions.get(node.id);
				return currentPos ? { ...node, position: currentPos } : node;
			});

			const entryMarkerNodes = this.entryConnectionsToMarkerNodes(
				_connections.map((c) => c.data),
				_stages.map((s) => s.data),
				currentPositions
			).map((node) => {
				const currentPos = currentPositions.get(node.id);
				return currentPos ? { ...node, position: currentPos } : node;
			});

			this.nodes = [...stageNodes, ...entryMarkerNodes];
		});

		// Sync edges when state or highlight changes.
		$effect(() => {
			const _forms = state.visibleForms;
			const _editTools = state.visibleEditTools;
			const _protocolTools = state.visibleProtocolTools;
			const _connections = state.visibleConnections;
			const highlighted = new Set<string>();
			if (ctx.ui.hoverEdgeId) highlighted.add(ctx.ui.hoverEdgeId);

			this.edges = this.connectionsToEdges(
				_connections.map((c) => c.data),
				highlighted
			);
		});

		// Sync selection highlight onto canvas nodes.
		$effect(() => {
			const sel = ctx.ui.selection;
			const selectedNodeId = sel.type === 'stage' ? sel.id : null;

			const updatedNodes = untrack(() => this.nodes).map((n) => {
				const shouldSelect = n.id === selectedNodeId;
				if (!!n.selected === shouldSelect) return n;
				return { ...n, selected: shouldSelect };
			});
			if (updatedNodes.some((n, i) => n !== untrack(() => this.nodes)[i])) {
				this.nodes = updatedNodes;
			}
		});
	}

	/** Write canvas-local node positions back into builder state (on save). */
	syncPositionsToState(): void {
		for (const node of this.nodes) {
			if (node.type !== 'stage') continue;
			this.ctx.state.updateStage(node.id, {
				position_x: node.position.x,
				position_y: node.position.y
			});
		}
	}

	// =========================================================================
	// Tool instance projection (canvas badges)
	// =========================================================================

	private formsToToolInstances(forms: TrackedForm[]): ToolInstance[] {
		return forms.map((form, index) => ({
			id: form.data.id,
			toolType: 'form',
			config: {
				toolType: 'form',
				formId: form.data.id,
				buttonLabel: form.data.name || (workflowBuilderDefaultFormLabel?.() ?? 'Form')
			} as FormToolConfig,
			order: index
		}));
	}

	private editToolsToToolInstances(editTools: TrackedEditTool[]): ToolInstance[] {
		return editTools.map((tool, index) => ({
			id: tool.data.id,
			toolType: 'edit',
			config: {
				toolType: 'edit',
				editableFields: tool.data.editable_fields,
				buttonLabel: tool.data.name || (workflowBuilderDefaultEditLabel?.() ?? 'Edit')
			} as EditToolConfig,
			order: index + 100 // Offset to keep forms first
		}));
	}

	private protocolToolsToToolInstances(protocolTools: { data: ToolsProtocol }[]): ToolInstance[] {
		return protocolTools.map((tool, index) => ({
			id: tool.data.id,
			toolType: 'protocol',
			config: {
				toolType: 'protocol',
				buttonLabel: tool.data.name || (workflowBuilderDefaultProtocolLabel?.() ?? 'Protocol')
			} as ProtocolToolConfig,
			order: index + 200 // Offset to keep forms and edit tools first
		}));
	}

	private getToolsForConnection(connectionId: string): ToolInstance[] {
		const state = this.ctx.state;
		return [
			...this.formsToToolInstances(state.getFormsForConnection(connectionId)),
			...this.editToolsToToolInstances(state.getEditToolsForConnection(connectionId)),
			...this.protocolToolsToToolInstances(state.getProtocolToolsForConnection(connectionId))
		];
	}

	private getToolsForStage(stageId: string): ToolInstance[] {
		const state = this.ctx.state;
		return [
			...this.formsToToolInstances(state.getFormsForStage(stageId)),
			...this.editToolsToToolInstances(state.getNonGlobalEditToolsForStage(stageId)),
			...this.protocolToolsToToolInstances(state.getProtocolToolsForStage(stageId))
		];
	}

	private getRegionsForStage(stageId: string): Array<{ id: string; name: string; color: string }> {
		const globalProtocols = this.ctx.state.getGlobalProtocolTools();
		const result: Array<{ id: string; name: string; color: string }> = [];
		for (let i = 0; i < globalProtocols.length; i++) {
			const tool = globalProtocols[i];
			if (tool.data.stage_id?.includes(stageId)) {
				result.push({
					id: tool.data.id,
					name: tool.data.name,
					color: regionColors[i % regionColors.length]
				});
			}
		}
		return result;
	}

	// =========================================================================
	// Node / edge generation
	// =========================================================================

	private stagesToNodes(stages: WorkflowStage[]): Node[] {
		const ctx = this.ctx;
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
				regions: this.getRegionsForStage(stage.id),
				tools: this.getToolsForStage(stage.id),
				selectedToolId: ctx.ui.hoverStageToolId ?? undefined,
				onSelectTool: (toolId: string) => selectTool(ctx, toolId),
				onAddTool: () => ctx.ui.select({ type: 'stage', id: stage.id })
			}
		}));
	}

	// Generate virtual entry marker nodes for entry connections (from_stage_id = null)
	private entryConnectionsToMarkerNodes(
		connections: WorkflowConnection[],
		stages: WorkflowStage[],
		currentNodePositions: Map<string, { x: number; y: number }>
	): Node[] {
		const entryConnections = connections.filter((conn) => !conn.from_stage_id);

		return entryConnections.map((conn) => {
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
					label:
						conn.visual_config?.button_label ||
						conn.action_name ||
						(workflowBuilderEntryLabel?.() ?? 'Entry'),
					connectionId: conn.id
				},
				draggable: false,
				selectable: false // Selection happens via the edge, not the marker
			};
		});
	}

	private connectionsToEdges(connections: WorkflowConnection[], highlighted: Set<string>): Edge[] {
		const ctx = this.ctx;
		// Group directed connections by `${from}->${to}` so we can fan out
		// connections that share the same stage pair (parallel and/or
		// bidirectional) instead of letting them render on top of each other.
		const PARALLEL_GAP = 28; // px between fanned-out parallel lanes
		const BIDIR_BULGE = 45; // px base bulge when a reverse connection exists

		const directedGroups = new Map<string, string[]>();
		for (const conn of connections) {
			if (!conn.from_stage_id || conn.from_stage_id === conn.to_stage_id) continue;
			const key = `${conn.from_stage_id}->${conn.to_stage_id}`;
			(directedGroups.get(key) ?? directedGroups.set(key, []).get(key)!).push(conn.id);
		}

		// Signed perpendicular offset (to the right of travel direction) for a
		// connection. Same-direction duplicates fan symmetrically around the
		// base; if a reverse connection exists, the whole fan is pushed to one
		// side so the opposing direction's fan sits clear of it.
		function curveOffsetFor(conn: WorkflowConnection): number {
			if (!conn.from_stage_id || conn.from_stage_id === conn.to_stage_id) return 0;
			const group = directedGroups.get(`${conn.from_stage_id}->${conn.to_stage_id}`);
			if (!group) return 0;
			const n = group.length;
			const i = group.indexOf(conn.id);
			const hasReverse = directedGroups.has(`${conn.to_stage_id}->${conn.from_stage_id}`);
			const base = hasReverse ? BIDIR_BULGE : 0;
			return base + (i - (n - 1) / 2) * PARALLEL_GAP;
		}

		return connections.map((conn) => {
			const isEntryConnection = !conn.from_stage_id;
			const isSelfLoop = !isEntryConnection && conn.from_stage_id === conn.to_stage_id;
			const curveOffset = isEntryConnection || isSelfLoop ? 0 : curveOffsetFor(conn);
			const isHighlighted = highlighted.has(conn.id);

			const classes =
				[isEntryConnection ? 'entry-edge' : '', isHighlighted ? 'highlighted' : '']
					.filter(Boolean)
					.join(' ') || undefined;

			return {
				id: conn.id,
				// For entry connections, use the virtual marker node as source
				source: isEntryConnection ? `entry-marker-${conn.id}` : (conn.from_stage_id as string),
				target: conn.to_stage_id,
				label: conn.visual_config?.button_label || conn.action_name,
				type: 'action',
				animated: isSelfLoop,
				class: classes,
				style:
					!isEntryConnection && conn.visual_config?.button_color
						? `stroke: ${conn.visual_config.button_color}`
						: undefined,
				data: {
					tools: this.getToolsForConnection(conn.id),
					isSelfLoop,
					curveOffset,
					isEntry: isEntryConnection,
					hasSentry: (conn.sentry?.length ?? 0) > 0,
					onSelectTool: (toolId: string) => selectTool(ctx, toolId),
					onAddTool: () => ctx.ui.select({ type: 'connection', id: conn.id }),
					allowed_roles: conn.allowed_roles || [],
					visual_config: conn.visual_config || {},
					sentry: conn.sentry ?? []
				}
			};
		});
	}
}
