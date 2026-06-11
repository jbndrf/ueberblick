/**
 * Connection operations (workflow_connections), incl. entry connections
 * (from_stage_id = null = workflow start point).
 */

import { generateId } from '../utils';
import type { WorkflowConnection, TrackedConnection } from '../types';
import { applyUpdate } from './tracked';
import { deleteForm } from './forms';
import { deleteEditTool } from './edit-tools';
import { deleteProtocolTool } from './protocol-tools';
import type { WorkflowBuilderState } from '../state.svelte';

/**
 * Create an entry connection (workflow start point).
 * Entry connections have from_stage_id = null.
 */
export function addEntryConnection(
	state: WorkflowBuilderState,
	toStageId: string
): WorkflowConnection {
	const entryConnection: WorkflowConnection = {
		id: generateId(),
		workflow_id: state.workflowId,
		from_stage_id: null,
		to_stage_id: toStageId,
		action_name: 'entry',
		visual_config: {
			button_label: state.workflowName || 'Start'
		}
	};

	state.connections.push({
		data: entryConnection,
		status: 'new'
	});

	return entryConnection;
}

export function addConnection(
	state: WorkflowBuilderState,
	fromStageId: string,
	toStageId: string
): WorkflowConnection {
	const isEditAction = fromStageId === toStageId;

	const newConnection: WorkflowConnection = {
		id: generateId(),
		workflow_id: state.workflowId,
		from_stage_id: fromStageId,
		to_stage_id: toStageId,
		action_name: isEditAction ? 'edit' : 'transition',
		visual_config: {
			button_label: isEditAction ? 'Edit' : 'Continue'
		}
	};

	state.connections.push({
		data: newConnection,
		status: 'new'
	});

	return newConnection;
}

export function updateConnection(
	state: WorkflowBuilderState,
	id: string,
	updates: Partial<WorkflowConnection>
): void {
	const conn = state.connections.find((c) => c.data.id === id);
	if (!conn) return;
	applyUpdate(conn, updates);
}

export function deleteConnection(state: WorkflowBuilderState, id: string): void {
	const conn: TrackedConnection | undefined = state.connections.find((c) => c.data.id === id);
	if (!conn) return;

	// Also delete related forms and edit tools
	const relatedForms = state.forms.filter((f) => f.data.connection_id === id);
	for (const form of relatedForms) {
		deleteForm(state, form.data.id);
	}

	const relatedEditTools = state.editTools.filter((e) => e.data.connection_id === id);
	for (const tool of relatedEditTools) {
		deleteEditTool(state, tool.data.id);
	}

	const relatedProtocolTools = state.protocolTools.filter((p) => p.data.connection_id === id);
	for (const tool of relatedProtocolTools) {
		deleteProtocolTool(state, tool.data.id);
	}

	if (conn.status === 'new') {
		state.connections = state.connections.filter((c) => c.data.id !== id);
	} else {
		conn.status = 'deleted';
	}
}
