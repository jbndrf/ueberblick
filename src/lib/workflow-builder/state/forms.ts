/**
 * Form + form-field operations (tools_forms, tools_form_field_refs).
 *
 * Also home of the connection-tool ordering helper and the protocol-form
 * ownership set (forms backing a protocol tool are hidden from regular form
 * lists).
 */

import { generateId, deepEqual } from '../utils';
import type { ToolsForm, ToolsFormField, TrackedForm, TrackedFormField } from '../types';
import { applyUpdate } from './tracked';
import type { WorkflowBuilderState } from '../state.svelte';

/** Ids of forms owned 1:1 by a protocol tool. */
export function getProtocolFormIds(state: WorkflowBuilderState): Set<string> {
	const ids = new Set<string>();
	for (const tool of state.visibleProtocolTools) {
		if (tool.data.protocol_form_id) {
			ids.add(tool.data.protocol_form_id);
		}
	}
	return ids;
}

/** Get the next tool_order value for a connection's tools. */
export function nextToolOrder(state: WorkflowBuilderState, connectionId: string): number {
	const existing = [
		...getFormsForConnection(state, connectionId),
		...state.visibleEditTools.filter((e) => e.data.connection_id === connectionId),
		...state.visibleProtocolTools.filter((p) => p.data.connection_id === connectionId)
	];
	return Math.max(-1, ...existing.map((t) => t.data.tool_order ?? 0)) + 1;
}

export function addForm(
	state: WorkflowBuilderState,
	target: { connectionId: string } | { stageId: string } | { isGlobal: true }
): ToolsForm {
	const isStageAttached = 'stageId' in target;
	const isGlobal = 'isGlobal' in target;
	const connectionId = 'connectionId' in target ? target.connectionId : undefined;

	const newForm: ToolsForm = {
		id: generateId(),
		workflow_id: state.workflowId,
		connection_id: connectionId,
		stage_id: isStageAttached ? target.stageId : undefined,
		name: 'New Form',
		...(connectionId && { tool_order: nextToolOrder(state, connectionId) }),
		// Stage-attached and global forms need their own button/role config;
		// connection-attached forms inherit from the connection.
		...((isStageAttached || isGlobal) && {
			allowed_roles: [],
			visual_config: {
				button_label: 'Submit'
			}
		})
	};

	state.forms.push({
		data: newForm,
		status: 'new'
	});

	return newForm;
}

export function updateForm(
	state: WorkflowBuilderState,
	id: string,
	updates: Partial<ToolsForm>
): void {
	const form = state.forms.find((f) => f.data.id === id);
	if (!form) return;
	applyUpdate(form, updates);
}

export function deleteForm(state: WorkflowBuilderState, id: string): void {
	const form = state.forms.find((f) => f.data.id === id);
	if (!form) return;

	// Delete related fields
	const relatedFields = state.formFields.filter((f) => f.data.form_id === id);
	for (const field of relatedFields) {
		deleteFormField(state, field.data.id);
	}

	if (form.status === 'new') {
		state.forms = state.forms.filter((f) => f.data.id !== id);
	} else {
		form.status = 'deleted';
	}
}

export function getFormsForConnection(
	state: WorkflowBuilderState,
	connectionId: string
): TrackedForm[] {
	const protocolFormIds = getProtocolFormIds(state);
	return state.visibleForms.filter(
		(f) => f.data.connection_id === connectionId && !protocolFormIds.has(f.data.id)
	);
}

export function getFormsForStage(state: WorkflowBuilderState, stageId: string): TrackedForm[] {
	const protocolFormIds = getProtocolFormIds(state);
	return state.visibleForms.filter(
		(f) => f.data.stage_id === stageId && !protocolFormIds.has(f.data.id)
	);
}

export function getGlobalForms(state: WorkflowBuilderState): TrackedForm[] {
	const protocolFormIds = getProtocolFormIds(state);
	return state.visibleForms.filter(
		(f) => !f.data.stage_id && !f.data.connection_id && !protocolFormIds.has(f.data.id)
	);
}

// =============================================================================
// Form fields
// =============================================================================

export function addFormField(
	state: WorkflowBuilderState,
	formId: string,
	fieldType: ToolsFormField['field_type'],
	rowIndex: number,
	columnPosition: ToolsFormField['column_position'],
	page: number = 1
): ToolsFormField {
	const existingFields = state.visibleFormFields.filter((f) => f.data.form_id === formId);

	// A new ref must point at a `workflow_field_defs` row. We synthesize a
	// placeholder `_temp_`-prefixed field_def_id here; the save path in
	// `builder/+page.server.ts saveWorkflow` recognises the prefix and replaces
	// it with the id of a freshly-created field def. Definitional fields are
	// kept on the ref shape for the legacy UI; the save action splits them out.
	const tempDefId = `_temp_${generateId()}`;
	const newField: ToolsFormField = {
		id: generateId(),
		form_id: formId,
		field_def_id: tempDefId,
		field_label: 'New Field',
		field_type: fieldType,
		field_order: existingFields.length,
		page,
		row_index: rowIndex,
		column_position: columnPosition,
		is_required: false
	};

	state.formFields.push({
		data: newField,
		status: 'new'
	});

	// Mirror this form-field as a workflow_field_def in client state so
	// the field library (and other def-consumers) see it immediately,
	// without waiting for a save+refresh round-trip. The `_temp_` id is
	// excluded from getChanges().fieldDefs — the server materialises the
	// real def via the formFields.new save path.
	state.fieldDefs.push({
		data: {
			id: tempDefId,
			workflow_id: state.workflowId,
			label: 'New Field',
			field_type: fieldType,
			write_mode: 'singleton',
			output_type: '',
			view_roles: [],
			validation_rules: null,
			field_options: null,
			compute_expression: '',
			compute_depends_on: []
		},
		status: 'new'
	});

	return newField;
}

/**
 * Add a form-field reference pointing at an EXISTING workflow_field_defs row.
 * Unlike `addFormField`, this does not synthesize a new def — the ref carries
 * a real `field_def_id`. Legacy denormalized fields (label/type/etc.) are
 * populated from the def so the existing UI continues to render.
 */
export function addFormFieldRef(
	state: WorkflowBuilderState,
	formId: string,
	fieldDefId: string,
	rowIndex: number,
	columnPosition: ToolsFormField['column_position'],
	page: number = 1
): ToolsFormField | null {
	const def = state.getFieldDefById(fieldDefId);
	if (!def) return null;
	const existingFields = state.visibleFormFields.filter((f) => f.data.form_id === formId);
	const newField: ToolsFormField = {
		id: generateId(),
		form_id: formId,
		field_def_id: fieldDefId,
		field_label: def.label ?? '',
		field_type: def.field_type,
		field_order: existingFields.length,
		page,
		row_index: rowIndex,
		column_position: columnPosition,
		is_required: false,
		placeholder: '',
		help_text: '',
		validation_rules: def.validation_rules ?? undefined,
		field_options: def.field_options ?? undefined,
		write_mode: def.write_mode,
		compute_expression: def.compute_expression
	};
	state.formFields.push({ data: newField, status: 'new' });
	return newField;
}

export function updateFormField(
	state: WorkflowBuilderState,
	id: string,
	updates: Partial<ToolsFormField>
): void {
	const field = state.formFields.find((f) => f.data.id === id);
	if (!field) return;
	applyUpdate(field, updates);

	// Mirror definitional changes to the matching tracked field def
	// (only for shadow `_temp_*` defs created by addFormField — real defs
	// are owned by the field library and shouldn't be mutated implicitly).
	const defId = field.data.field_def_id;
	if (typeof defId === 'string' && defId.startsWith('_temp_')) {
		const def = state.fieldDefs.find((d) => d.data.id === defId);
		if (def) {
			if (updates.field_label !== undefined) def.data.label = updates.field_label ?? '';
			if (updates.field_type !== undefined) def.data.field_type = updates.field_type;
			if (updates.field_options !== undefined)
				def.data.field_options = updates.field_options ?? null;
			if (updates.validation_rules !== undefined)
				def.data.validation_rules = updates.validation_rules ?? null;
			if ((updates as any).write_mode !== undefined)
				def.data.write_mode = (updates as any).write_mode;
			if ((updates as any).compute_expression !== undefined)
				def.data.compute_expression = (updates as any).compute_expression ?? '';
		}
	}
}

export function deleteFormField(state: WorkflowBuilderState, id: string): void {
	const field = state.formFields.find((f) => f.data.id === id);
	if (!field) return;

	// Update edit tools that reference this field
	for (const editTool of state.editTools) {
		if (editTool.data.editable_fields.includes(id)) {
			const newFields = editTool.data.editable_fields.filter((f) => f !== id);
			applyUpdate(editTool, { editable_fields: newFields });
		}
	}

	// Protocol tools denormalize the same `editable_fields` shape as
	// edit tools — keep them in sync too.
	for (const pt of state.protocolTools) {
		if (pt.status === 'deleted') continue;
		if (!pt.data.editable_fields?.includes(id)) continue;
		pt.data.editable_fields = pt.data.editable_fields.filter((f) => f !== id);
		if (pt.status === 'unchanged' && !deepEqual(pt.data, pt.original)) {
			pt.status = 'modified';
		}
	}

	// Remove any field tag mappings that reference this field
	for (const ft of state.fieldTags) {
		if (ft.status === 'deleted') continue;
		const before = ft.data.tag_mappings.length;
		ft.data.tag_mappings = ft.data.tag_mappings.filter((m) => m.fieldId !== id);
		if (ft.data.tag_mappings.length !== before && ft.status === 'unchanged') {
			if (!deepEqual(ft.data, ft.original)) {
				ft.status = 'modified';
			}
		}
	}

	// Drop the shadow def created by addFormField when the form-field
	// itself goes away. Real (`workflow_field_defs`-backed) refs leave
	// the def alone — it may still be referenced elsewhere or edited
	// independently via the field library.
	const defId = field.data.field_def_id;
	if (typeof defId === 'string' && defId.startsWith('_temp_')) {
		state.fieldDefs = state.fieldDefs.filter((d) => d.data.id !== defId);
	}

	if (field.status === 'new') {
		state.formFields = state.formFields.filter((f) => f.data.id !== id);
	} else {
		field.status = 'deleted';
	}
}

export function getFieldsForForm(state: WorkflowBuilderState, formId: string): TrackedFormField[] {
	return state.visibleFormFields
		.filter((f) => f.data.form_id === formId)
		.sort((a, b) => (a.data.field_order ?? 0) - (b.data.field_order ?? 0));
}
