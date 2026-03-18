/**
 * Workflow Builder Save Logic
 *
 * Uses PocketBase batch API for atomic saves.
 * Also syncs entry connection's allowed_roles to workflow.entry_allowed_roles
 * for efficient PocketBase rule enforcement on instance creation.
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
		changes.editTools.deleted.length > 0 ||
		changes.protocolTools.new.length > 0 ||
		changes.protocolTools.modified.length > 0 ||
		changes.protocolTools.deleted.length > 0 ||
		changes.automations.new.length > 0 ||
		changes.automations.modified.length > 0 ||
		changes.automations.deleted.length > 0;

	console.log('[saveWorkflow] Changes detected:', {
		stages: { new: changes.stages.new.length, modified: changes.stages.modified.length, deleted: changes.stages.deleted.length },
		connections: { new: changes.connections.new.length, modified: changes.connections.modified.length, deleted: changes.connections.deleted.length },
		forms: { new: changes.forms.new.length, modified: changes.forms.modified.length, deleted: changes.forms.deleted.length },
		formFields: { new: changes.formFields.new.length, modified: changes.formFields.modified.length, deleted: changes.formFields.deleted.length },
		editTools: { new: changes.editTools.new.length, modified: changes.editTools.modified.length, deleted: changes.editTools.deleted.length },
		protocolTools: { new: changes.protocolTools.new.length, modified: changes.protocolTools.modified.length, deleted: changes.protocolTools.deleted.length },
		automations: { new: changes.automations.new.length, modified: changes.automations.modified.length, deleted: changes.automations.deleted.length }
	});

	if (!hasChanges) {
		console.log('[saveWorkflow] No changes detected, skipping save');
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

		// =======================================================================
		// 6. Protocol Tools
		// =======================================================================
		for (const tool of changes.protocolTools.new) {
			batch.collection('tools_protocol').create(tool);
		}
		for (const tool of changes.protocolTools.modified) {
			batch.collection('tools_protocol').update(tool.id, tool);
		}
		for (const toolId of changes.protocolTools.deleted) {
			batch.collection('tools_protocol').delete(toolId);
		}

		// =======================================================================
		// 7. Automations
		// =======================================================================
		for (const automation of changes.automations.new) {
			batch.collection('tools_automation').create(automation);
		}
		for (const automation of changes.automations.modified) {
			batch.collection('tools_automation').update(automation.id, automation);
		}
		for (const automationId of changes.automations.deleted) {
			batch.collection('tools_automation').delete(automationId);
		}

		// Execute batch
		await batch.send();

		// Sync entry connection's allowed_roles to workflow.entry_allowed_roles
		// This enables efficient PocketBase rule enforcement for instance creation
		await syncEntryAllowedRoles(pb, state);

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
 * Sync entry connection's allowed_roles to workflow.entry_allowed_roles.
 * Entry connection is the connection where from_stage_id is null (workflow start point).
 * This field is used by PocketBase rules to control who can create new instances.
 */
async function syncEntryAllowedRoles(
	pb: PocketBase,
	state: WorkflowBuilderState
): Promise<void> {
	// Find the entry connection (from_stage_id is null or empty string)
	const entryConnection = state.visibleConnections.find(
		(c) => !c.data.from_stage_id
	);

	console.log('[syncEntryAllowedRoles] Entry connection found:', entryConnection?.data.id);
	console.log('[syncEntryAllowedRoles] Entry connection allowed_roles:', entryConnection?.data.allowed_roles);

	// Get the allowed_roles from entry connection (empty array if none or not found)
	const entryAllowedRoles = entryConnection?.data.allowed_roles ?? [];

	console.log('[syncEntryAllowedRoles] Syncing to workflow:', state.workflowId, 'roles:', entryAllowedRoles);

	// Update the workflow with the entry_allowed_roles
	try {
		await pb.collection('workflows').update(state.workflowId, {
			entry_allowed_roles: entryAllowedRoles
		});
		console.log('[syncEntryAllowedRoles] Sync successful');
	} catch (error) {
		console.error('[syncEntryAllowedRoles] Sync failed:', error);
		throw error;
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
