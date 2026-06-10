/**
 * Apply transfer parts into the builder's in-memory state.
 *
 * Imports go exclusively through the public `add*`/`update*` methods on
 * `WorkflowBuilderState`, producing the same `status:'new'` items a human
 * clicking the builder would. No ids are minted for the DB here — the existing
 * save path resolves `_temp_*` placeholders and reuses/creates field defs by
 * label. This module's only real work is **label/key → id resolution within the
 * imported bundle**, plus flagging cross-references that can't survive an
 * isolated copy.
 */
import type { WorkflowBuilderState } from '../state.svelte';
import type { ToolsFormField, ColumnPosition } from '../types';
import type { ConditionalLogic, FieldCondition } from '$lib/form-engine/conditional-logic';
import type { FormPart, FormPartField } from './part-schema';

export type ImportWarning = { field?: string; message: string };
export type FormImportResult = { formId: string; created: number; warnings: ImportWarning[] };

export type FormTarget = { connectionId: string } | { stageId: string } | { isGlobal: true };

/** Walk a condition tree, remapping each leaf's `field` (a label) to a def id.
 *  Returns null (and records a warning) if any referenced label is unresolved —
 *  a partially-applied visibility rule is worse than none. */
function remapConditionLabels(
	cond: FieldCondition,
	resolve: (label: string) => string | undefined,
	onMissing: (label: string) => void
): FieldCondition | null {
	switch (cond.op) {
		case 'and':
		case 'or': {
			const conds = cond.conds.map((c) => remapConditionLabels(c, resolve, onMissing));
			if (conds.some((c) => c === null)) return null;
			return { op: cond.op, conds: conds as FieldCondition[] };
		}
		case 'is_empty':
		case 'is_not_empty': {
			const id = resolve(cond.field);
			if (!id) {
				onMissing(cond.field);
				return null;
			}
			return { op: cond.op, field: id };
		}
		default: {
			const id = resolve(cond.field);
			if (!id) {
				onMissing(cond.field);
				return null;
			}
			return { op: cond.op, field: id, value: cond.value };
		}
	}
}

export function remapLogicLabels(
	logic: ConditionalLogic | null | undefined,
	resolve: (label: string) => string | undefined,
	onMissing: (label: string) => void
): ConditionalLogic | null {
	if (!logic?.show_if) return null;
	const show_if = remapConditionLabels(logic.show_if, resolve, onMissing);
	return show_if ? { show_if } : null;
}

/**
 * Import a `form` part into the builder, attaching the new form to `target`.
 *
 * Field resolution: each field's `label` is matched against the workflow's
 * known field defs (real registry + defs synthesized earlier in this import).
 * A match reuses that def (no duplicate); a miss creates a new def via the
 * `_temp_*` placeholder flow. Label-based references inside the bundle
 * (conditional_logic, smart_dropdown source) are resolved in a second pass.
 */
export function importFormPart(
	state: WorkflowBuilderState,
	part: FormPart,
	target: FormTarget
): FormImportResult {
	const warnings: ImportWarning[] = [];

	const form = state.addForm(target);
	state.updateForm(form.id, { name: part.name, pages: part.pages ?? [] });

	// label -> field_def_id, seeded with the existing registry so an imported
	// field reuses a same-labelled def instead of forking a duplicate. Grows as
	// new fields are created during this import.
	const labelToDefId = new Map<string, string>();
	for (const d of state.fieldDefs) {
		if (d.status !== 'deleted') labelToDefId.set(d.data.label, d.data.id);
	}

	// Created refs, paired with their source part-field, for the second pass.
	const created: Array<{ ref: ToolsFormField; src: FormPartField; reused: boolean }> = [];

	part.fields.forEach((pf, index) => {
		const page = pf.page ?? 1;
		const row = pf.row ?? index;
		const column: ColumnPosition = pf.column ?? 'full';

		const existingDefId = labelToDefId.get(pf.label);
		let ref: ToolsFormField | null;
		let reused: boolean;

		if (existingDefId) {
			// Reuse an existing def — its type/options win; we only apply per-form
			// presentation below. addFormFieldRef copies the def's current options
			// onto the ref, so the server's def update stays a no-op.
			ref = state.addFormFieldRef(form.id, existingDefId, row, column, page);
			reused = true;
		} else {
			// New field — synthesize a def via the placeholder flow, then write the
			// part's definitional bits onto it.
			ref = state.addFormField(form.id, pf.type, row, column, page);
			reused = false;
			state.updateFormField(ref.id, {
				field_label: pf.label,
				field_type: pf.type,
				field_options: pf.field_options ?? undefined,
				validation_rules: pf.validation_rules ?? undefined,
				...(pf.write_mode ? { write_mode: pf.write_mode } : {}),
				...(pf.compute_expression ? { compute_expression: pf.compute_expression } : {})
			} as Partial<ToolsFormField>);
			if (ref.field_def_id) labelToDefId.set(pf.label, ref.field_def_id);
		}

		if (!ref) {
			warnings.push({ field: pf.label, message: `Could not create field "${pf.label}".` });
			return;
		}

		// Per-form presentation applies to reused and new fields alike.
		state.updateFormField(ref.id, {
			is_required: pf.required ?? false,
			placeholder: pf.placeholder ?? '',
			help_text: pf.help_text ?? ''
		});

		created.push({ ref, src: pf, reused });
	});

	// Second pass: resolve label-based cross-references now that every field
	// has a def id.
	const resolveLabel = (label: string) => labelToDefId.get(label);

	for (const { ref, src, reused } of created) {
		// Conditional logic is per-form (lives on the ref) → applies to all fields.
		if (src.conditional_logic) {
			const remapped = remapLogicLabels(src.conditional_logic, resolveLabel, (missing) => {
				warnings.push({
					field: src.label,
					message: `Conditional logic on "${src.label}" references unknown field "${missing}" — rule dropped.`
				});
			});
			state.updateFormField(ref.id, { conditional_logic: remapped });
		}

		// smart_dropdown source is def-level → only for newly created defs. Reused
		// defs keep their own source binding.
		if (!reused && src.type === 'smart_dropdown' && src.field_options) {
			const opts = { ...src.field_options } as Record<string, unknown>;
			const sourceLabel = opts.source_field_label;
			delete opts.source_field_label;
			if (typeof sourceLabel === 'string' && sourceLabel) {
				const sourceId = resolveLabel(sourceLabel);
				if (sourceId) {
					opts.source_field = sourceId;
				} else {
					warnings.push({
						field: src.label,
						message: `Smart dropdown "${src.label}" references unknown source field "${sourceLabel}" — source left unconfigured.`
					});
				}
			}
			state.updateFormField(ref.id, { field_options: opts });
		}
	}

	return { formId: form.id, created: created.length, warnings };
}
