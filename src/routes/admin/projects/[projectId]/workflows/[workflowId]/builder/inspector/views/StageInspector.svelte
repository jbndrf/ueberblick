<script lang="ts">
	import { StagePreviewView } from '../../right-sidebar/views/stage-preview';
	import type {
		StageAction,
		TimelineStage,
		IncomingFormGroup
	} from '../../right-sidebar/views/stage-preview';
	import { getBuilderContext, selectTool, openProtocolTool } from '../../builder-context.svelte';
	import { workflowBuilderConnectionFallback } from '$lib/paraglide/messages';
	import EmptyInspector from './EmptyInspector.svelte';

	const ctx = getBuilderContext();
	const { state, ui, roles, createRole } = ctx;

	const stageId = $derived(ui.selection.type === 'stage' ? ui.selection.id : null);

	// Participant-sidebar lookalike data for the selected stage.
	const previewData = $derived.by(() => {
		if (!stageId) return null;
		const tracked = state.getStageById(stageId);
		if (!tracked) return null;
		const stage = tracked.data;

		// Outgoing connections (= transition buttons)
		const outgoing: StageAction[] = state.visibleConnections
			.filter((c) => c.data.from_stage_id === stageId)
			.map((c) => {
				const conn = c.data;
				return {
					type: 'connection' as const,
					id: conn.id,
					buttonLabel: conn.visual_config?.button_label || conn.action_name,
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
				buttonLabel: t.data.visual_config?.button_label || t.data.name,
				buttonColor: t.data.visual_config?.button_color,
				self_edit_roles: t.data.self_edit_roles || [],
				any_edit_roles: t.data.any_edit_roles || [],
				tool: t.data
			}));

		// Stage forms (stage-attached, = form buttons)
		const stageFormActions: StageAction[] = state.getFormsForStage(stageId).map((f) => ({
			type: 'stage_form' as const,
			id: f.data.id,
			buttonLabel: f.data.visual_config?.button_label || f.data.name,
			buttonColor: f.data.visual_config?.button_color,
			allowed_roles: f.data.allowed_roles || [],
			form: f.data
		}));

		// Global tools (shown at every stage)
		const globalToolActions: StageAction[] = state.getGlobalEditTools().map((t) => ({
			type: 'global_tool' as const,
			id: t.data.id,
			buttonLabel: t.data.visual_config?.button_label || t.data.name,
			buttonColor: t.data.visual_config?.button_color,
			self_edit_roles: t.data.self_edit_roles || [],
			any_edit_roles: t.data.any_edit_roles || [],
			tool: t.data
		}));

		// Incoming forms (from connections targeting this stage) for the Details tab
		const incomingForms: IncomingFormGroup[] = [];
		for (const c of state.visibleConnections.filter((c) => c.data.to_stage_id === stageId)) {
			for (const tf of state.getFormsForConnection(c.data.id)) {
				incomingForms.push({
					connectionName:
						c.data.action_name || (workflowBuilderConnectionFallback?.() ?? 'Connection'),
					form: tf.data,
					fields: state.getFieldsForForm(tf.data.id).map((f) => f.data)
				});
			}
		}

		// Timeline: ancestors -> current -> rest
		const ancestors = state.getAncestorStages(stageId);
		const allStages = state.visibleStages.map((s) => s.data);
		const ancestorIds = new Set(ancestors.map((a) => a.data.id));
		const timeline: TimelineStage[] = [
			...ancestors.map((a) => ({
				id: a.data.id,
				name: a.data.stage_name,
				status: 'completed' as const
			})),
			{ id: stageId, name: stage.stage_name, status: 'current' as const },
			...allStages
				.filter((s) => s.id !== stageId && !ancestorIds.has(s.id))
				.map((s) => ({ id: s.id, name: s.stage_name, status: 'future' as const }))
		];

		return {
			stage,
			actions: [...outgoing, ...stageToolActions, ...stageFormActions] as StageAction[],
			globalTools: globalToolActions,
			timeline,
			availableTargetStages: allStages.filter((s) => s.id !== stageId),
			incomingForms
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

{#if previewData && stageId}
	<StagePreviewView
		stage={previewData.stage}
		actions={previewData.actions}
		globalTools={previewData.globalTools}
		timeline={previewData.timeline}
		{roles}
		availableTargetStages={previewData.availableTargetStages}
		incomingForms={previewData.incomingForms}
		onStageRename={(sid, name) => state.updateStage(sid, { stage_name: name })}
		onStageDelete={handleDeleteStage}
		onClose={() => ui.deselect()}
		onSelectConnection={(connectionId) => ui.select({ type: 'connection', id: connectionId })}
		onSelectTool={(_toolType, toolId) => selectTool(ctx, toolId)}
		onAddConnection={(from, to) => state.addConnection(from, to)}
		onAddStageTool={handleAddStageTool}
		onCreateRole={createRole}
		onCreateStageAndConnect={handleCreateStageAndConnect}
		onHighlightEdge={(edgeId) => (ui.hoverEdgeId = edgeId)}
		onHighlightStageTool={(toolId) => (ui.hoverStageToolId = toolId)}
	/>
{:else}
	<EmptyInspector />
{/if}
