/**
 * Survey action handlers
 * High-level API for submitting surveys offline-first
 */

import { dispatch, createAction, type SubmitSurveyPayload } from '$lib/offline';

/**
 * Submit a survey (offline-first)
 * Returns the submission ID immediately, queues for sync
 */
export async function submitSurvey(params: {
	formId: string;
	markerId: string;
	workflowInstanceId?: string;
	answers: Record<string, unknown>;
}): Promise<string> {
	const payload: SubmitSurveyPayload = {
		form_id: params.formId,
		marker_id: params.markerId,
		workflow_instance_id: params.workflowInstanceId,
		answers: params.answers
	};

	const action = createAction('SUBMIT_SURVEY', payload);
	return await dispatch(action);
}

/**
 * Submit a survey with validation
 */
export async function submitValidatedSurvey(params: {
	formId: string;
	markerId: string;
	workflowInstanceId?: string;
	answers: Record<string, unknown>;
	requiredFields?: string[];
}): Promise<string> {
	// Validate required fields
	if (params.requiredFields) {
		for (const field of params.requiredFields) {
			if (!(field in params.answers) || params.answers[field] === null || params.answers[field] === undefined || params.answers[field] === '') {
				throw new Error(`Required field missing: ${field}`);
			}
		}
	}

	// Validate form ID
	if (!params.formId || params.formId.trim() === '') {
		throw new Error('Form ID is required');
	}

	// Validate marker ID
	if (!params.markerId || params.markerId.trim() === '') {
		throw new Error('Marker ID is required');
	}

	return await submitSurvey(params);
}

/**
 * Submit a partial survey (save draft)
 * Useful for long forms where users might want to save progress
 */
export async function saveSurveyDraft(params: {
	formId: string;
	markerId: string;
	workflowInstanceId?: string;
	answers: Record<string, unknown>;
}): Promise<string> {
	// Mark this as a draft in the properties
	const answersWithDraft = {
		...params.answers,
		__draft: true,
		__saved_at: new Date().toISOString()
	};

	return await submitSurvey({
		...params,
		answers: answersWithDraft
	});
}
