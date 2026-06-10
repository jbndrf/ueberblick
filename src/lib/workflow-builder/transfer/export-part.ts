/**
 * Build transfer parts from the builder's in-memory model.
 *
 * The exporter strips every id and replaces id-based cross-references with
 * label-based ones, so the emitted part is portable and LLM-editable.
 */
import type { ToolsForm, ToolsFormField } from '../types';
import type { ConditionalLogic, FieldCondition } from '$lib/form-engine/conditional-logic';
import type { FormPart, FormPartField } from './part-schema';
import { PART_VERSION } from './part-schema';

/** Resolves a field-def id to its label. Used to rewrite id-based references. */
export type LabelResolver = (fieldDefId: string) => string | undefined;

/** Rewrite the `field` ids inside a conditional_logic tree to field labels. */
function conditionRefsToLabels(cond: FieldCondition, resolve: LabelResolver): FieldCondition {
	switch (cond.op) {
		case 'and':
		case 'or':
			return { op: cond.op, conds: cond.conds.map((c) => conditionRefsToLabels(c, resolve)) };
		case 'is_empty':
		case 'is_not_empty':
			return { op: cond.op, field: resolve(cond.field) ?? cond.field };
		default:
			return { op: cond.op, field: resolve(cond.field) ?? cond.field, value: cond.value };
	}
}

function logicRefsToLabels(
	logic: ConditionalLogic | null | undefined,
	resolve: LabelResolver
): ConditionalLogic | null {
	if (!logic?.show_if) return logic ?? null;
	return { show_if: conditionRefsToLabels(logic.show_if, resolve) };
}

/**
 * Rewrite a smart_dropdown's id-based `source_field` to a label-based
 * `source_field_label`. Leaves other field_options untouched. `source_stage_id`
 * is dropped (cross-stage references can't survive an isolated form copy).
 */
function fieldOptionsRefsToLabels(
	type: string,
	options: Record<string, unknown> | null | undefined,
	resolve: LabelResolver
): Record<string, unknown> | null {
	if (!options) return options ?? null;
	if (type !== 'smart_dropdown') return options;
	const next: Record<string, unknown> = { ...options };
	const sourceId = next.source_field;
	if (typeof sourceId === 'string' && sourceId) {
		next.source_field_label = resolve(sourceId) ?? sourceId;
	}
	delete next.source_field;
	delete next.source_stage_id;
	return next;
}

/**
 * Serialize one form (and the fields belonging to it) into a portable `form`
 * part. `resolve` maps any field-def id to its label — pass
 * `state`-backed resolution so references to fields outside this form still
 * translate; it falls back to the form's own fields.
 */
export function buildFormPart(
	form: ToolsForm,
	fields: ToolsFormField[],
	resolve?: LabelResolver
): FormPart {
	// Local id→label map from this form's own fields (covers the common case
	// where smart-dropdown / conditional-logic references point at sibling fields).
	const localLabels = new Map<string, string>();
	for (const f of fields) {
		if (f.field_def_id) localLabels.set(f.field_def_id, f.field_label);
	}
	const resolveLabel: LabelResolver = (id) => resolve?.(id) ?? localLabels.get(id);

	const partFields: FormPartField[] = fields.map((f) => ({
		label: f.field_label,
		type: f.field_type,
		...(f.write_mode && f.write_mode !== 'singleton' ? { write_mode: f.write_mode } : {}),
		page: f.page ?? 1,
		row: f.row_index ?? 0,
		column: f.column_position ?? 'full',
		required: f.is_required ?? false,
		placeholder: f.placeholder ?? null,
		help_text: f.help_text ?? null,
		field_options: fieldOptionsRefsToLabels(f.field_type, f.field_options, resolveLabel),
		validation_rules: f.validation_rules ?? null,
		...(f.compute_expression ? { compute_expression: f.compute_expression } : {}),
		conditional_logic: logicRefsToLabels(f.conditional_logic, resolveLabel)
	}));

	return {
		ueberblick_part: 'form',
		version: PART_VERSION,
		name: form.name,
		pages: form.pages ?? [],
		fields: partFields
	};
}
