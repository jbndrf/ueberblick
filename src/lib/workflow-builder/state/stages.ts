/**
 * Stage operations (workflow_stages) incl. cross-entity delete cascades.
 */

import { generateId } from '../utils';
import type { WorkflowStage, TrackedConnection, StageType } from '../types';
import { applyUpdate } from './tracked';
import { addEntryConnection, deleteConnection } from './connections';
import { deleteForm } from './forms';
import { deleteEditTool } from './edit-tools';
import { deleteProtocolTool } from './protocol-tools';
import type { WorkflowBuilderState } from '../state.svelte';

export function addStage(
	state: WorkflowBuilderState,
	type: StageType,
	position?: { x: number; y: number }
): WorkflowStage {
	const newStage: WorkflowStage = {
		id: generateId(),
		workflow_id: state.workflowId,
		stage_name: type === 'start' ? 'Start' : type === 'end' ? 'End' : 'New Stage',
		stage_type: type,
		stage_order: state.visibleStages.length,
		position_x: position?.x ?? 100,
		position_y: position?.y ?? 100
	};

	state.stages.push({
		data: newStage,
		status: 'new'
	});

	// Auto-create entry connection for start stages
	if (type === 'start') {
		addEntryConnection(state, newStage.id);
	}

	// Add new stage to all global tools
	for (const tool of state.editTools) {
		if (tool.data.is_global && tool.status !== 'deleted') {
			if (!tool.data.stage_id) {
				tool.data.stage_id = [];
			}
			tool.data.stage_id.push(newStage.id);
			if (tool.status === 'unchanged') {
				tool.status = 'modified';
			}
		}
	}
	// Note: global protocol tools are NOT auto-synced -- their stage_ids
	// define a region boundary, manually configured by the admin.

	return newStage;
}

export function updateStage(
	state: WorkflowBuilderState,
	id: string,
	updates: Partial<WorkflowStage>
): void {
	const stage = state.stages.find((s) => s.data.id === id);
	if (!stage) return;
	applyUpdate(stage, updates);
}

/** Connections that reference a stage — used for delete-warning display. */
export function getAffectedConnections(
	state: WorkflowBuilderState,
	stageId: string
): TrackedConnection[] {
	return state.visibleConnections.filter(
		(c) => c.data.from_stage_id === stageId || c.data.to_stage_id === stageId
	);
}

export function deleteStage(
	state: WorkflowBuilderState,
	id: string,
	cascadeConnections = false
): void {
	const stage = state.stages.find((s) => s.data.id === id);
	if (!stage) return;

	if (cascadeConnections) {
		// Delete related connections
		const affectedConns = getAffectedConnections(state, id);
		for (const conn of affectedConns) {
			deleteConnection(state, conn.data.id);
		}
	}

	// Delete forms attached directly to this stage
	const relatedForms = state.forms.filter((f) => f.data.stage_id === id);
	for (const form of relatedForms) {
		deleteForm(state, form.data.id);
	}

	// Handle edit tools with array-based stage_id
	for (const tool of state.editTools) {
		if (tool.status === 'deleted') continue;
		const stageIds = tool.data.stage_id;
		if (!stageIds || !stageIds.includes(id)) continue;

		if (tool.data.is_global) {
			// Global tools: just remove this stage from the array
			tool.data.stage_id = stageIds.filter((sid) => sid !== id);
			if (tool.status === 'unchanged') {
				tool.status = 'modified';
			}
		} else if (stageIds.length === 1) {
			// Non-global with only this stage: delete the tool
			deleteEditTool(state, tool.data.id);
		} else {
			// Non-global with multiple stages: remove this stage
			tool.data.stage_id = stageIds.filter((sid) => sid !== id);
			if (tool.status === 'unchanged') {
				tool.status = 'modified';
			}
		}
	}

	// Handle protocol tools with array-based stage_id
	for (const tool of state.protocolTools) {
		if (tool.status === 'deleted') continue;
		const stageIds = tool.data.stage_id;
		if (!stageIds || !stageIds.includes(id)) continue;

		if (tool.data.is_global) {
			tool.data.stage_id = stageIds.filter((sid) => sid !== id);
			if (tool.status === 'unchanged') {
				tool.status = 'modified';
			}
		} else if (stageIds.length === 1) {
			deleteProtocolTool(state, tool.data.id);
		} else {
			tool.data.stage_id = stageIds.filter((sid) => sid !== id);
			if (tool.status === 'unchanged') {
				tool.status = 'modified';
			}
		}
	}

	if (stage.status === 'new') {
		// Never saved, remove from array
		state.stages = state.stages.filter((s) => s.data.id !== id);
	} else {
		// Mark for deletion
		stage.status = 'deleted';
	}
}
