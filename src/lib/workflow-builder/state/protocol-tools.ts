/**
 * Protocol tool operations (tools_protocol).
 */

import { generateId } from '../utils';
import type { ToolsProtocol, TrackedProtocolTool } from '../types';
import { applyUpdate } from './tracked';
import { nextToolOrder, deleteForm } from './forms';
import type { WorkflowBuilderState } from '../state.svelte';

export function addProtocolTool(
	state: WorkflowBuilderState,
	opts: {
		stageId?: string;
		connectionId?: string;
		isGlobal?: boolean;
	}
): ToolsProtocol {
	// Global protocol tools = region definitions, start with empty stage_ids
	// (admin picks which stages form the region)
	const stageId = opts.isGlobal ? [] : opts.stageId ? [opts.stageId] : [];

	const isStageAttached = !opts.connectionId && !opts.isGlobal;

	const newProtocolTool: ToolsProtocol = {
		id: generateId(),
		workflow_id: state.workflowId,
		connection_id: opts.connectionId,
		stage_id: stageId,
		is_global: opts.isGlobal ?? false,
		name: opts.isGlobal ? 'Protocol Region' : 'Protocol',
		editable_fields: [],
		prefill_config: {},
		allowed_roles: [],
		...(opts.connectionId && { tool_order: nextToolOrder(state, opts.connectionId) }),
		...(isStageAttached && {
			visual_config: {
				button_label: 'Protocol'
			}
		})
	};

	state.protocolTools.push({
		data: newProtocolTool,
		status: 'new'
	});

	return newProtocolTool;
}

export function updateProtocolTool(
	state: WorkflowBuilderState,
	id: string,
	updates: Partial<ToolsProtocol>
): void {
	const tool = state.protocolTools.find((p) => p.data.id === id);
	if (!tool) return;
	applyUpdate(tool, updates);
}

export function deleteProtocolTool(state: WorkflowBuilderState, id: string): void {
	const tool = state.protocolTools.find((p) => p.data.id === id);
	if (!tool) return;

	// The protocol form is owned 1:1 by its protocol tool (see
	// `getProtocolFormIds`). Cascade its deletion so the now-orphaned
	// form doesn't reappear in the regular forms list.
	if (tool.data.protocol_form_id) {
		deleteForm(state, tool.data.protocol_form_id);
	}

	if (tool.status === 'new') {
		state.protocolTools = state.protocolTools.filter((p) => p.data.id !== id);
	} else {
		tool.status = 'deleted';
	}
}

/**
 * Get non-global protocol tools for a stage (for stage toolbars).
 * Global protocol tools (regions) are shown in the global toolbar only.
 */
export function getProtocolToolsForStage(
	state: WorkflowBuilderState,
	stageId: string
): TrackedProtocolTool[] {
	return state.visibleProtocolTools.filter((p) => {
		if (p.data.is_global) return false;
		if (p.data.connection_id) return false;
		const stageIds = p.data.stage_id;
		if (!stageIds || stageIds.length === 0) return false;
		return stageIds.includes(stageId);
	});
}

export function getProtocolToolsForConnection(
	state: WorkflowBuilderState,
	connectionId: string
): TrackedProtocolTool[] {
	return state.visibleProtocolTools.filter((p) => p.data.connection_id === connectionId);
}

export function getGlobalProtocolTools(state: WorkflowBuilderState): TrackedProtocolTool[] {
	return state.visibleProtocolTools.filter((p) => p.data.is_global);
}
