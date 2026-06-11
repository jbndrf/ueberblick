/**
 * Form + form-field operations (tools_forms, tools_form_field_refs).
 *
 * Form fields are stored as raw refs (`state.fieldRefs`: { id, form_id,
 * field_def_id, config }). The flattened `ToolsFormField` shape the UI renders
 * is RESOLVED on read (ref ⊕ def) — see `resolveFieldRef`. Writes are explicit:
 * presentation → `updateFieldRefConfig`, definition → `updateFieldDef`.
 *
 * Also home of the connection-tool ordering helper and the protocol-form
 * ownership set (forms backing a protocol tool are hidden from regular form
 * lists).
 */

import { generateId } from '../utils';
import type {
	ToolsForm,
	ToolsFormField,
	FormFieldRef,
	FormFieldConfig,
	TrackedForm,
	TrackedFieldRef,
	TrackedFormField,
	WorkflowFieldDef
} from '../types';
import { applyUpdate, markModifiedIfChanged } from './tracked';
import { deleteFieldDef, uniqueDefLabel } from './field-defs';
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

	// Delete related field refs
	const relatedRefs = state.fieldRefs.filter((f) => f.data.form_id === id);
	for (const ref of relatedRefs) {
		deleteFormField(state, ref.data.id);
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
// Form fields (refs + resolved read-model)
// =============================================================================

/** Resolve a ref against its def into the flattened read-model shape. */
export function resolveFieldRef(state: WorkflowBuilderState, ref: FormFieldRef): ToolsFormField {
	const def: WorkflowFieldDef | undefined = state.getFieldDefById(ref.field_def_id);
	const config = ref.config ?? {};
	return {
		id: ref.id,
		form_id: ref.form_id,
		field_def_id: ref.field_def_id,
		field_order: config.field_order ?? 0,
		page: config.page ?? 1,
		row_index: config.row_index ?? 0,
		column_position: config.column_position ?? 'full',
		is_required: config.is_required ?? false,
		placeholder: config.placeholder ?? '',
		help_text: config.help_text ?? '',
		conditional_logic: config.conditional_logic ?? null,
		field_label: def?.label ?? '',
		field_type: def?.field_type ?? 'short_text',
		field_options: def?.field_options ?? undefined,
		validation_rules: def?.validation_rules ?? undefined,
		write_mode: def?.write_mode ?? 'singleton',
		compute_expression: def?.compute_expression ?? ''
	};
}

function resolveTracked(state: WorkflowBuilderState, ref: TrackedFieldRef): TrackedFormField {
	return { data: resolveFieldRef(state, ref.data), status: ref.status };
}

/**
 * Add a brand-new field to a form: creates a REAL field def (pre-minted id,
 * label de-duplicated against the unique (workflow_id,label) index) plus a ref
 * pointing at it. Both are tracked `new` and saved via their own change groups.
 */
export function addFormField(
	state: WorkflowBuilderState,
	formId: string,
	fieldType: ToolsFormField['field_type'],
	rowIndex: number,
	columnPosition: ToolsFormField['column_position'],
	page: number = 1,
	label: string = 'New Field'
): ToolsFormField {
	const def = state.addFieldDef({
		label: uniqueDefLabel(state, label),
		field_type: fieldType
	});
	// addFormFieldRef cannot fail here — the def was just created.
	return addFormFieldRef(state, formId, def.id, rowIndex, columnPosition, page)!;
}

/** Add a form-field ref pointing at an EXISTING workflow_field_defs row. */
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
	const existingFields = state.visibleFieldRefs.filter((f) => f.data.form_id === formId);
	const ref: FormFieldRef = {
		id: generateId(),
		form_id: formId,
		field_def_id: fieldDefId,
		config: {
			field_order: existingFields.length,
			page,
			row_index: rowIndex,
			column_position: columnPosition,
			is_required: false
		}
	};
	state.fieldRefs.push({ data: ref, status: 'new' });
	return resolveFieldRef(state, ref);
}

/** Patch the per-form presentation config of a ref. */
export function updateFieldRefConfig(
	state: WorkflowBuilderState,
	refId: string,
	patch: Partial<FormFieldConfig>
): void {
	const ref = state.fieldRefs.find((f) => f.data.id === refId);
	if (!ref) return;
	ref.data.config = { ...ref.data.config, ...patch };
	markModifiedIfChanged(ref);
}

/**
 * Delete a form-field ref. The referenced def stays in the library — unless it
 * was created in this session (`new`) and no other ref points at it, in which
 * case the def (incl. tag/edit-tool cleanup) is removed too: an undone
 * drag-and-drop should not leave a stray def behind.
 */
export function deleteFormField(state: WorkflowBuilderState, refId: string): void {
	const ref = state.fieldRefs.find((f) => f.data.id === refId);
	if (!ref) return;

	const defId = ref.data.field_def_id;

	if (ref.status === 'new') {
		state.fieldRefs = state.fieldRefs.filter((f) => f.data.id !== refId);
	} else {
		ref.status = 'deleted';
	}

	const def = state.fieldDefs.find((d) => d.data.id === defId);
	if (def && def.status === 'new') {
		const stillReferenced = state.fieldRefs.some(
			(f) => f.status !== 'deleted' && f.data.field_def_id === defId
		);
		if (!stillReferenced) {
			deleteFieldDef(state, defId);
		}
	}
}

export function getFieldsForForm(state: WorkflowBuilderState, formId: string): TrackedFormField[] {
	return state.visibleFieldRefs
		.filter((f) => f.data.form_id === formId)
		.map((f) => resolveTracked(state, f))
		.sort((a, b) => (a.data.field_order ?? 0) - (b.data.field_order ?? 0));
}

/** Resolved read-model for a single ref id. */
export function getFormFieldById(
	state: WorkflowBuilderState,
	refId: string
): TrackedFormField | undefined {
	const ref = state.fieldRefs.find((f) => f.data.id === refId);
	return ref ? resolveTracked(state, ref) : undefined;
}

/** Visible refs pointing at a def — usage lookup for the library/def panel. */
export function getRefsForDef(state: WorkflowBuilderState, defId: string): TrackedFieldRef[] {
	return state.visibleFieldRefs.filter((f) => f.data.field_def_id === defId);
}
