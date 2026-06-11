/**
 * Edit tool operations (tools_edit).
 */

import { generateId } from '../utils';
import type { ToolsEdit, TrackedEditTool } from '../types';
import { applyUpdate } from './tracked';
import { nextToolOrder } from './forms';
import type { WorkflowBuilderState } from '../state.svelte';

export function addEditTool(
	state: WorkflowBuilderState,
	target: { connectionId: string } | { stageId: string }
): ToolsEdit {
	const isStageAttached = 'stageId' in target;
	const connectionId = 'connectionId' in target ? target.connectionId : undefined;

	const newEditTool: ToolsEdit = {
		id: generateId(),
		workflow_id: state.workflowId,
		connection_id: connectionId,
		stage_id: isStageAttached ? [target.stageId] : undefined,
		name: 'Edit Fields',
		editable_fields: [],
		edit_mode: 'form_fields',
		is_global: false,
		...(connectionId && { tool_order: nextToolOrder(state, connectionId) }),
		// Stage-attached edit tools need their own config; connection-attached tools inherit
		...(isStageAttached && {
			self_edit_roles: [],
			any_edit_roles: [],
			visual_config: {
				button_label: 'Edit'
			}
		})
	};

	state.editTools.push({
		data: newEditTool,
		status: 'new'
	});

	return newEditTool;
}

/**
 * Add a global edit tool (available on all stages).
 * The stage_id array will be synced with all stages on save.
 */
export function addGlobalEditTool(
	state: WorkflowBuilderState,
	editMode: 'form_fields' | 'location' = 'form_fields'
): ToolsEdit {
	const allStageIds = state.visibleStages.map((s) => s.data.id);

	const newEditTool: ToolsEdit = {
		id: generateId(),
		workflow_id: state.workflowId,
		connection_id: undefined,
		stage_id: allStageIds,
		name: editMode === 'location' ? 'Edit Location' : 'Edit Fields',
		editable_fields: [],
		edit_mode: editMode,
		is_global: true,
		self_edit_roles: [],
		any_edit_roles: [],
		visual_config: {
			button_label: editMode === 'location' ? 'Location' : 'Edit'
		}
	};

	state.editTools.push({
		data: newEditTool,
		status: 'new'
	});

	return newEditTool;
}

/**
 * Sync global tools to include all current stages.
 * Call this before saving the workflow.
 */
export function syncGlobalToolStages(state: WorkflowBuilderState): void {
	const allStageIds = state.visibleStages.map((s) => s.data.id);
	for (const tool of state.editTools) {
		if (tool.data.is_global && tool.status !== 'deleted') {
			tool.data.stage_id = allStageIds;
			if (tool.status === 'unchanged') {
				tool.status = 'modified';
			}
		}
	}
	// Note: global protocol tools are NOT auto-synced -- their stage_ids
	// define a region boundary, manually configured by the admin.
}

export function updateEditTool(
	state: WorkflowBuilderState,
	id: string,
	updates: Partial<ToolsEdit>
): void {
	const tool = state.editTools.find((e) => e.data.id === id);
	if (!tool) return;
	applyUpdate(tool, updates);
}

export function deleteEditTool(state: WorkflowBuilderState, id: string): void {
	const tool = state.editTools.find((e) => e.data.id === id);
	if (!tool) return;

	if (tool.status === 'new') {
		state.editTools = state.editTools.filter((e) => e.data.id !== id);
	} else {
		tool.status = 'deleted';
	}
}

export function getEditToolsForConnection(
	state: WorkflowBuilderState,
	connectionId: string
): TrackedEditTool[] {
	return state.visibleEditTools.filter((e) => e.data.connection_id === connectionId);
}

/**
 * Get edit tools for a specific stage (includes global tools).
 * Filters by checking if stageId is in the stage_id array.
 */
export function getEditToolsForStage(
	state: WorkflowBuilderState,
	stageId: string
): TrackedEditTool[] {
	return state.visibleEditTools.filter((e) => {
		const stageIds = e.data.stage_id;
		if (!stageIds || stageIds.length === 0) return false;
		return stageIds.includes(stageId);
	});
}

/**
 * Get only non-global edit tools for a specific stage.
 * Used by property panels to show stage-specific tools.
 */
export function getNonGlobalEditToolsForStage(
	state: WorkflowBuilderState,
	stageId: string
): TrackedEditTool[] {
	return state.visibleEditTools.filter((e) => {
		if (e.data.is_global) return false;
		const stageIds = e.data.stage_id;
		if (!stageIds || stageIds.length === 0) return false;
		return stageIds.includes(stageId);
	});
}

/** Get all global edit tools. */
export function getGlobalEditTools(state: WorkflowBuilderState): TrackedEditTool[] {
	return state.visibleEditTools.filter((e) => e.data.is_global);
}
