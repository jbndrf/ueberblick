<script lang="ts">
	import { StagePreviewView } from '../../right-sidebar/views/stage-preview';
	import type { StageAction } from '../../right-sidebar/views/stage-preview';
	import { getBuilderContext, selectTool, openProtocolTool } from '../../builder-context.svelte';
	import { resolveButtonLabel } from '$lib/workflow-builder';

	const ctx = getBuilderContext();
	const { state, ui, roles } = ctx;

	const stageId = $derived(ui.selection.type === 'stage' ? ui.selection.id : null);

	// Participant-sidebar lookalike data. With no stage selected this is the
	// "default view" — just the data tabs, no stage-specific action buttons.
	const previewData = $derived.by(() => {
		const empty = {
			stage: null,
			actions: [] as StageAction[],
			globalTools: [] as StageAction[],
			availableTargetStages: []
		};
		if (!stageId) return empty;
		const tracked = state.getStageById(stageId);
		if (!tracked) return empty;
		const stage = tracked.data;

		// Outgoing connections (= transition buttons)
		const outgoing: StageAction[] = state.visibleConnections
			.filter((c) => c.data.from_stage_id === stageId)
			.map((c) => {
				const conn = c.data;
				return {
					type: 'connection' as const,
					id: conn.id,
					buttonLabel: resolveButtonLabel(conn.visual_config, conn.action_name),
					buttonColor: conn.visual_config?.button_color,
					allowed_roles: conn.allowed_roles || [],
					targetStage: state.getStageById(conn.to_stage_id)?.data,
					forms: state.getFormsForConnection(conn.id).map((f) => f.data),
					editTools: state.getEditToolsForConnection(conn.id).map((t) => t.data)
				};
			});

		// Stage edit tools (non-global, = tool buttons)
		const stageToolActions: StageAction[] = state
			.getNonGlobalEditToolsForStage(stageId)
			.map((t) => ({
				type: 'stage_tool' as const,
				id: t.data.id,
				buttonLabel: resolveButtonLabel(t.data.visual_config, t.data.name),
				buttonColor: t.data.visual_config?.button_color,
				self_edit_roles: t.data.self_edit_roles || [],
				any_edit_roles: t.data.any_edit_roles || [],
				tool: t.data
			}));

		// Stage forms (stage-attached, = form buttons)
		const stageFormActions: StageAction[] = state.getFormsForStage(stageId).map((f) => ({
			type: 'stage_form' as const,
			id: f.data.id,
			buttonLabel: resolveButtonLabel(f.data.visual_config, f.data.name),
			buttonColor: f.data.visual_config?.button_color,
			allowed_roles: f.data.allowed_roles || [],
			form: f.data
		}));

		// Global tools (shown at every stage)
		const globalToolActions: StageAction[] = state.getGlobalEditTools().map((t) => ({
			type: 'global_tool' as const,
			id: t.data.id,
			buttonLabel: resolveButtonLabel(t.data.visual_config, t.data.name),
			buttonColor: t.data.visual_config?.button_color,
			self_edit_roles: t.data.self_edit_roles || [],
			any_edit_roles: t.data.any_edit_roles || [],
			tool: t.data
		}));

		const allStages = state.visibleStages.map((s) => s.data);

		return {
			stage,
			actions: [...outgoing, ...stageToolActions, ...stageFormActions] as StageAction[],
			globalTools: globalToolActions,
			availableTargetStages: allStages.filter((s) => s.id !== stageId)
		};
	});

	function handleAddStageTool(sid: string, toolType: string) {
		if (toolType === 'form') {
			state.addForm({ stageId: sid });
		} else if (toolType === 'edit') {
			state.addEditTool({ stageId: sid });
		} else if (toolType === 'protocol') {
			const tool = state.addProtocolTool({ stageId: sid });
			openProtocolTool(ctx, tool.id);
		}
	}

	function handleCreateStageAndConnect(fromStageId: string) {
		const source = state.getStageById(fromStageId)?.data;
		const existingOutgoing = state.visibleConnections.filter(
			(c) => c.data.from_stage_id === fromStageId
		).length;
		const position = source
			? {
					x: (source.position_x ?? 100) + 280,
					y: (source.position_y ?? 100) + existingOutgoing * 120
				}
			: undefined;
		const newStage = state.addStage('intermediate', position);
		state.addConnection(fromStageId, newStage.id);
	}

	function handleDeleteStage(sid: string) {
		state.deleteStage(sid, state.getAffectedConnections(sid).length > 0);
		ui.deselect();
	}
</script>

<StagePreviewView
	stage={previewData.stage}
	actions={previewData.actions}
	globalTools={previewData.globalTools}
	{roles}
	availableTargetStages={previewData.availableTargetStages}
	onStageRename={(sid, name) => state.updateStage(sid, { stage_name: name })}
	onStageDelete={handleDeleteStage}
	onClose={() => ui.deselect()}
	onSelectConnection={(connectionId) => ui.select({ type: 'connection', id: connectionId })}
	onSelectTool={(_toolType, toolId) => selectTool(ctx, toolId)}
	onAddConnection={(from, to) => state.addConnection(from, to)}
	onAddStageTool={handleAddStageTool}
	onCreateStageAndConnect={handleCreateStageAndConnect}
	onHighlightEdge={(edgeId) => (ui.hoverEdgeId = edgeId)}
	onHighlightStageTool={(toolId) => (ui.hoverStageToolId = toolId)}
/>
