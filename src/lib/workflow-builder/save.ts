/**
 * Workflow Builder Save Logic
 *
 * Uses PocketBase batch API for atomic saves.
 */

import type PocketBase from 'pocketbase';
import type { WorkflowBuilderState } from './state.svelte';

export interface SaveResult {
	success: boolean;
	error?: string;
}

/**
 * Save all changes to the database using PocketBase batch API.
 * Operations are executed in dependency order:
 * 1. Stages (no dependencies)
 * 2. Connections (depend on stages)
 * 3. Forms (depend on connections or stages)
 * 4. Form fields (depend on forms)
 * 5. Edit tools (depend on connections and fields)
 */
export async function saveWorkflow(
	pb: PocketBase,
	state: WorkflowBuilderState
): Promise<SaveResult> {
	const changes = state.getChanges();

	// Check if there are any changes
	const hasChanges =
		changes.stages.new.length > 0 ||
		changes.stages.modified.length > 0 ||
		changes.stages.deleted.length > 0 ||
		changes.connections.new.length > 0 ||
		changes.connections.modified.length > 0 ||
		changes.connections.deleted.length > 0 ||
		changes.forms.new.length > 0 ||
		changes.forms.modified.length > 0 ||
		changes.forms.deleted.length > 0 ||
		changes.formFields.new.length > 0 ||
		changes.formFields.modified.length > 0 ||
		changes.formFields.deleted.length > 0 ||
		changes.editTools.new.length > 0 ||
		changes.editTools.modified.length > 0 ||
		changes.editTools.deleted.length > 0;

	if (!hasChanges) {
		return { success: true };
	}

	try {
		const batch = pb.createBatch();

		// =======================================================================
		// 1. Stages
		// =======================================================================
		for (const stage of changes.stages.new) {
			batch.collection('workflow_stages').create(stage);
		}
		for (const stage of changes.stages.modified) {
			batch.collection('workflow_stages').update(stage.id, stage);
		}
		for (const stageId of changes.stages.deleted) {
			batch.collection('workflow_stages').delete(stageId);
		}

		// =======================================================================
		// 2. Connections
		// =======================================================================
		for (const conn of changes.connections.new) {
			batch.collection('workflow_connections').create(conn);
		}
		for (const conn of changes.connections.modified) {
			batch.collection('workflow_connections').update(conn.id, conn);
		}
		for (const connId of changes.connections.deleted) {
			batch.collection('workflow_connections').delete(connId);
		}

		// =======================================================================
		// 3. Forms
		// =======================================================================
		for (const form of changes.forms.new) {
			batch.collection('tools_forms').create(form);
		}
		for (const form of changes.forms.modified) {
			batch.collection('tools_forms').update(form.id, form);
		}
		for (const formId of changes.forms.deleted) {
			batch.collection('tools_forms').delete(formId);
		}

		// =======================================================================
		// 4. Form Fields
		// =======================================================================
		for (const field of changes.formFields.new) {
			batch.collection('tools_form_fields').create(field);
		}
		for (const field of changes.formFields.modified) {
			batch.collection('tools_form_fields').update(field.id, field);
		}
		for (const fieldId of changes.formFields.deleted) {
			batch.collection('tools_form_fields').delete(fieldId);
		}

		// =======================================================================
		// 5. Edit Tools
		// =======================================================================
		for (const tool of changes.editTools.new) {
			batch.collection('tools_edit').create(tool);
		}
		for (const tool of changes.editTools.modified) {
			batch.collection('tools_edit').update(tool.id, tool);
		}
		for (const toolId of changes.editTools.deleted) {
			batch.collection('tools_edit').delete(toolId);
		}

		// Execute batch
		await batch.send();

		// Mark state as saved
		state.markAsSaved();

		return { success: true };
	} catch (error) {
		console.error('Failed to save workflow:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

/**
 * Save just the workflow metadata (name, etc)
 */
export async function saveWorkflowMetadata(
	pb: PocketBase,
	workflowId: string,
	data: { name?: string }
): Promise<SaveResult> {
	try {
		await pb.collection('workflows').update(workflowId, data);
		return { success: true };
	} catch (error) {
		console.error('Failed to save workflow metadata:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}
