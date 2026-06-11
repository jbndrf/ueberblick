/**
 * Graph traversal queries over stages/connections/forms — ancestor lookups
 * used by smart dropdowns, protocol prefill pickers and global edit tools.
 */

import type { WorkflowStage, ToolsForm, ToolsFormField, TrackedStage } from '../types';
import { getFormsForConnection, getFormsForStage, getFieldsForForm } from './forms';
import type { WorkflowBuilderState } from '../state.svelte';

export interface StageFormFields {
	stage: WorkflowStage;
	form: ToolsForm;
	fields: ToolsFormField[];
}

/**
 * Get all ancestor stages for a given stage (stages that can reach this stage)
 * Traverses backwards through connections
 */
export function getAncestorStages(state: WorkflowBuilderState, stageId: string): TrackedStage[] {
	const visited = new Set<string>();
	const ancestors: TrackedStage[] = [];

	const traverse = (currentStageId: string) => {
		// Find all connections leading TO this stage
		const incomingConnections = state.visibleConnections.filter(
			(c) => c.data.to_stage_id === currentStageId && c.data.from_stage_id
		);

		for (const conn of incomingConnections) {
			const fromStageId = conn.data.from_stage_id!;
			if (!visited.has(fromStageId)) {
				visited.add(fromStageId);
				const stage = state.visibleStages.find((s) => s.data.id === fromStageId);
				if (stage) {
					ancestors.push(stage);
					traverse(fromStageId);
				}
			}
		}
	};

	traverse(stageId);
	return ancestors;
}

/** Get all ancestor stages for a connection (based on its source stage). */
export function getAncestorStagesForConnection(
	state: WorkflowBuilderState,
	connectionId: string
): TrackedStage[] {
	const connection = state.visibleConnections.find((c) => c.data.id === connectionId);
	if (!connection || !connection.data.from_stage_id) return [];

	// Include the source stage itself plus its ancestors
	const sourceStage = state.visibleStages.find((s) => s.data.id === connection.data.from_stage_id);
	const ancestors = getAncestorStages(state, connection.data.from_stage_id);

	if (sourceStage) {
		return [sourceStage, ...ancestors];
	}
	return ancestors;
}

/**
 * Get all form fields from ancestor stages, grouped by stage and form
 * Used for smart dropdown source field selection
 */
export function getAncestorFormFields(
	state: WorkflowBuilderState,
	connectionId: string
): StageFormFields[] {
	const ancestorStages = getAncestorStagesForConnection(state, connectionId);
	const result: StageFormFields[] = [];

	for (const trackedStage of ancestorStages) {
		// Get forms for this stage
		const stageForms = getFormsForStage(state, trackedStage.data.id);
		for (const trackedForm of stageForms) {
			const fields = getFieldsForForm(state, trackedForm.data.id);
			if (fields.length > 0) {
				result.push({
					stage: trackedStage.data,
					form: trackedForm.data,
					fields: fields.map((f) => f.data)
				});
			}
		}

		// Also get forms from connections leading TO this stage
		const incomingConnections = state.visibleConnections.filter(
			(c) => c.data.to_stage_id === trackedStage.data.id
		);
		for (const conn of incomingConnections) {
			const connForms = getFormsForConnection(state, conn.data.id);
			for (const trackedForm of connForms) {
				const fields = getFieldsForForm(state, trackedForm.data.id);
				if (fields.length > 0) {
					result.push({
						stage: trackedStage.data,
						form: trackedForm.data,
						fields: fields.map((f) => f.data)
					});
				}
			}
		}
	}

	return result;
}

/**
 * Get all form fields from ancestor stages for a stage-attached tool.
 * Similar to getAncestorFormFields but starts from a stage instead of a connection.
 */
export function getAncestorFormFieldsForStage(
	state: WorkflowBuilderState,
	stageId: string
): StageFormFields[] {
	const result: StageFormFields[] = [];

	// Get forms from connections leading INTO this stage
	const incomingConnections = state.visibleConnections.filter(
		(c) => c.data.to_stage_id === stageId
	);

	for (const conn of incomingConnections) {
		const connForms = getFormsForConnection(state, conn.data.id);
		for (const trackedForm of connForms) {
			const fields = getFieldsForForm(state, trackedForm.data.id);
			if (fields.length > 0) {
				// Use the source stage if available, otherwise create a placeholder
				const sourceStage = conn.data.from_stage_id
					? state.visibleStages.find((s) => s.data.id === conn.data.from_stage_id)
					: null;
				result.push({
					stage: sourceStage?.data ?? {
						id: 'entry',
						workflow_id: state.workflowId,
						stage_name: 'Entry',
						stage_type: 'start'
					},
					form: trackedForm.data,
					fields: fields.map((f) => f.data)
				});
			}
		}
	}

	// Get all ancestor stages and their forms
	const ancestorStages = getAncestorStages(state, stageId);
	for (const trackedStage of ancestorStages) {
		// Get forms attached directly to this stage
		const stageForms = getFormsForStage(state, trackedStage.data.id);
		for (const trackedForm of stageForms) {
			const fields = getFieldsForForm(state, trackedForm.data.id);
			if (fields.length > 0) {
				result.push({
					stage: trackedStage.data,
					form: trackedForm.data,
					fields: fields.map((f) => f.data)
				});
			}
		}

		// Get forms from connections leading INTO this ancestor stage
		const ancestorIncoming = state.visibleConnections.filter(
			(c) => c.data.to_stage_id === trackedStage.data.id
		);
		for (const conn of ancestorIncoming) {
			const connForms = getFormsForConnection(state, conn.data.id);
			for (const trackedForm of connForms) {
				const fields = getFieldsForForm(state, trackedForm.data.id);
				if (fields.length > 0) {
					result.push({
						stage: trackedStage.data,
						form: trackedForm.data,
						fields: fields.map((f) => f.data)
					});
				}
			}
		}
	}

	return result;
}

/**
 * Get all form fields from all forms across all stages and connections.
 * Used for global edit tools to show all available fields.
 */
export function getAllFormFields(state: WorkflowBuilderState): StageFormFields[] {
	const result: StageFormFields[] = [];

	// Get all stages in order
	for (const trackedStage of state.visibleStages) {
		// Get forms attached directly to this stage
		const stageForms = getFormsForStage(state, trackedStage.data.id);
		for (const trackedForm of stageForms) {
			const fields = getFieldsForForm(state, trackedForm.data.id);
			if (fields.length > 0) {
				result.push({
					stage: trackedStage.data,
					form: trackedForm.data,
					fields: fields.map((f) => f.data)
				});
			}
		}

		// Get forms from connections leading INTO this stage
		const incomingConnections = state.visibleConnections.filter(
			(c) => c.data.to_stage_id === trackedStage.data.id
		);
		for (const conn of incomingConnections) {
			const connForms = getFormsForConnection(state, conn.data.id);
			for (const trackedForm of connForms) {
				const fields = getFieldsForForm(state, trackedForm.data.id);
				if (fields.length > 0) {
					// Use the source stage if available, otherwise create a placeholder
					const sourceStage = conn.data.from_stage_id
						? state.visibleStages.find((s) => s.data.id === conn.data.from_stage_id)
						: null;
					result.push({
						stage: sourceStage?.data ?? {
							id: 'entry',
							workflow_id: state.workflowId,
							stage_name: 'Entry',
							stage_type: 'start'
						},
						form: trackedForm.data,
						fields: fields.map((f) => f.data)
					});
				}
			}
		}
	}

	return result;
}
