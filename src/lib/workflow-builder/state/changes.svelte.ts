/**
 * Save serialization: collect new/modified/deleted rows per collection
 * ($state.snapshot converts reactive proxies to plain objects for the API),
 * and post-save cleanup (markAsSaved).
 */

import { deepEqual } from '../utils';
import type { WorkflowBuilderState } from '../state.svelte';

/**
 * Get all changes grouped by operation type.
 * Uses $state.snapshot() to convert reactive proxies to plain objects for API calls.
 */
export function buildChanges(state: WorkflowBuilderState) {
	return {
		stages: {
			new: state.stages.filter((s) => s.status === 'new').map((s) => $state.snapshot(s.data)),
			modified: state.stages
				.filter((s) => s.status === 'modified')
				.map((s) => $state.snapshot(s.data)),
			deleted: state.stages.filter((s) => s.status === 'deleted').map((s) => s.data.id)
		},
		connections: {
			new: state.connections.filter((c) => c.status === 'new').map((c) => $state.snapshot(c.data)),
			modified: state.connections
				.filter((c) => c.status === 'modified')
				.map((c) => $state.snapshot(c.data)),
			deleted: state.connections.filter((c) => c.status === 'deleted').map((c) => c.data.id)
		},
		forms: {
			new: state.forms.filter((f) => f.status === 'new').map((f) => $state.snapshot(f.data)),
			modified: state.forms
				.filter((f) => f.status === 'modified')
				.map((f) => $state.snapshot(f.data)),
			deleted: state.forms.filter((f) => f.status === 'deleted').map((f) => f.data.id)
		},
		formFields: {
			new: state.formFields.filter((f) => f.status === 'new').map((f) => $state.snapshot(f.data)),
			modified: state.formFields
				.filter((f) => f.status === 'modified')
				.map((f) => $state.snapshot(f.data)),
			deleted: state.formFields.filter((f) => f.status === 'deleted').map((f) => f.data.id)
		},
		editTools: {
			new: state.editTools.filter((e) => e.status === 'new').map((e) => $state.snapshot(e.data)),
			modified: state.editTools
				.filter((e) => e.status === 'modified')
				.map((e) => $state.snapshot(e.data)),
			deleted: state.editTools.filter((e) => e.status === 'deleted').map((e) => e.data.id)
		},
		protocolTools: {
			new: state.protocolTools
				.filter((p) => p.status === 'new')
				.map((p) => $state.snapshot(p.data)),
			modified: state.protocolTools
				.filter((p) => p.status === 'modified')
				.map((p) => $state.snapshot(p.data)),
			deleted: state.protocolTools.filter((p) => p.status === 'deleted').map((p) => p.data.id)
		},
		automations: {
			new: state.automations.filter((a) => a.status === 'new').map((a) => $state.snapshot(a.data)),
			modified: state.automations
				.filter((a) => a.status === 'modified')
				.map((a) => $state.snapshot(a.data)),
			deleted: state.automations.filter((a) => a.status === 'deleted').map((a) => a.data.id)
		},
		fieldTags: {
			new: state.fieldTags.filter((ft) => ft.status === 'new').map((ft) => $state.snapshot(ft.data)),
			modified: state.fieldTags
				.filter((ft) => ft.status === 'modified')
				.map((ft) => $state.snapshot(ft.data)),
			deleted: state.fieldTags.filter((ft) => ft.status === 'deleted').map((ft) => ft.data.id)
		},
		fieldDefs: {
			// Shadow defs (id starts with `_temp_`) are mirrors of new form
			// fields; the server creates them via the formFields.new save
			// path, so don't double-send them here.
			new: state.fieldDefs
				.filter((d) => d.status === 'new' && !d.data.id.startsWith('_temp_'))
				.map((d) => $state.snapshot(d.data)),
			modified: state.fieldDefs
				.filter((d) => d.status === 'modified' && !d.data.id.startsWith('_temp_'))
				.map((d) => $state.snapshot(d.data)),
			deleted: state.fieldDefs
				.filter((d) => d.status === 'deleted' && !d.data.id.startsWith('_temp_'))
				.map((d) => d.data.id)
		},
		// Workflow-level permission fields. `dirty` lets the save action skip
		// the `workflows` update when nothing here changed. `entry_allowed_roles`
		// is NOT sent — the save action derives it from the entry connection.
		workflow: {
			id: state.workflowPermissions.id,
			visible_to_roles: $state.snapshot(state.workflowPermissions.visible_to_roles) ?? [],
			private_instances: state.workflowPermissions.private_instances ?? false,
			dirty: !deepEqual(state.workflowPermissions, state.workflowPermissionsOriginal)
		}
	};
}

/** Call after successful save: drop deleted rows, reset statuses + originals. */
export function markAsSaved(state: WorkflowBuilderState): void {
	// Remove deleted items
	state.stages = state.stages.filter((s) => s.status !== 'deleted');
	state.connections = state.connections.filter((c) => c.status !== 'deleted');
	state.forms = state.forms.filter((f) => f.status !== 'deleted');
	state.formFields = state.formFields.filter((f) => f.status !== 'deleted');
	state.editTools = state.editTools.filter((e) => e.status !== 'deleted');
	state.protocolTools = state.protocolTools.filter((p) => p.status !== 'deleted');
	state.automations = state.automations.filter((a) => a.status !== 'deleted');
	state.fieldTags = state.fieldTags.filter((ft) => ft.status !== 'deleted');

	// Mark all as unchanged and update originals
	// Use $state.snapshot() to convert reactive proxies to plain objects
	for (const stage of state.stages) {
		stage.status = 'unchanged';
		stage.original = $state.snapshot(stage.data);
	}
	for (const conn of state.connections) {
		conn.status = 'unchanged';
		conn.original = $state.snapshot(conn.data);
	}
	for (const form of state.forms) {
		form.status = 'unchanged';
		form.original = $state.snapshot(form.data);
	}
	for (const field of state.formFields) {
		field.status = 'unchanged';
		field.original = $state.snapshot(field.data);
	}
	for (const tool of state.editTools) {
		tool.status = 'unchanged';
		tool.original = $state.snapshot(tool.data);
	}
	for (const tool of state.protocolTools) {
		tool.status = 'unchanged';
		tool.original = $state.snapshot(tool.data);
	}
	for (const automation of state.automations) {
		automation.status = 'unchanged';
		automation.original = $state.snapshot(automation.data);
	}
	for (const ft of state.fieldTags) {
		ft.status = 'unchanged';
		ft.original = $state.snapshot(ft.data);
	}
	state.fieldDefs = state.fieldDefs.filter((d) => d.status !== 'deleted');
	for (const d of state.fieldDefs) {
		d.status = 'unchanged';
		d.original = $state.snapshot(d.data);
	}
	state.workflowPermissionsOriginal = $state.snapshot(state.workflowPermissions);
}
