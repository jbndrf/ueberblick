/**
 * Workflow action handlers
 * High-level API for managing workflow progress offline-first
 */

import { dispatch, createAction, type UpdateWorkflowProgressPayload } from '$lib/offline';

/**
 * Advance workflow to next stage (offline-first)
 * Returns the progress ID immediately, queues for sync
 */
export async function advanceWorkflowStage(params: {
	workflowId: string;
	markerId: string;
	newStageId: string;
}): Promise<string> {
	const payload: UpdateWorkflowProgressPayload = {
		workflow_id: params.workflowId,
		marker_id: params.markerId,
		new_stage_id: params.newStageId
	};

	const action = createAction('UPDATE_WORKFLOW_PROGRESS', payload);
	return await dispatch(action);
}

/**
 * Start a workflow for a marker
 */
export async function startWorkflow(params: {
	workflowId: string;
	markerId: string;
	initialStageId: string;
}): Promise<string> {
	return await advanceWorkflowStage({
		workflowId: params.workflowId,
		markerId: params.markerId,
		newStageId: params.initialStageId
	});
}

/**
 * Complete a workflow stage
 */
export async function completeWorkflowStage(params: {
	workflowId: string;
	markerId: string;
	completedStageId: string;
	nextStageId?: string;
}): Promise<string> {
	// If next stage is provided, advance to it
	// Otherwise, just mark current stage as completed
	const newStageId = params.nextStageId || params.completedStageId;

	return await advanceWorkflowStage({
		workflowId: params.workflowId,
		markerId: params.markerId,
		newStageId
	});
}
