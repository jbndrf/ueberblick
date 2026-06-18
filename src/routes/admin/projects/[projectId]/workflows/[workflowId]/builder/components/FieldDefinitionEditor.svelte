<script lang="ts">
	/**
	 * The complete field DEFINITION view (the field underneath). Reuses the form
	 * builder's field-config editors (scope='field' = label, type, options,
	 * validation, compute) over a synthetic row, and adds visibility.
	 *
	 * Two kinds of definition, mirroring the DB:
	 *  - `defId`  → a shared workflow field def (`updateFieldDef`); has write-mode,
	 *    compute and per-field visibility.
	 *  - `local`  → a protocol form's inline local field (`form.local_fields`),
	 *    addressed by form + key. No write-mode/compute/visibility — it lives only
	 *    on that protocol form.
	 *
	 * Used as Panel 3 (drilled from a form field) and as the data-view field's
	 * one-and-only view.
	 */
	import FieldConfigPanel from '../right-sidebar/views/form-editor/FieldConfigPanel.svelte';
	import RoleSelect from './RoleSelect.svelte';
	import { getBuilderContext } from '../builder-context.svelte';
	import type { ToolsFormField, ProtocolLocalFieldDef } from '$lib/workflow-builder';
	import { builderFieldVisibilityLabel, builderFieldVisibilityHint } from '$lib/paraglide/messages';

	interface Props {
		/** A shared workflow field def. */
		defId?: string;
		/** A protocol form's inline local field. */
		local?: { formId: string; key: string };
	}
	let { defId, local }: Props = $props();

	const { state: builderState, roles } = getBuilderContext();

	const def = $derived(defId ? builderState.getFieldDefById(defId) : null);
	const localForm = $derived(local ? (builderState.getFormById(local.formId)?.data ?? null) : null);
	const localField = $derived(
		local && localForm
			? ((localForm.local_fields ?? []).find((lf) => lf.key === local.key) ?? null)
			: null
	);

	const LOCAL_PREFIX = 'local:';

	function localToField(lf: ProtocolLocalFieldDef): ToolsFormField {
		return {
			id: `${LOCAL_PREFIX}${lf.key}`,
			form_id: local?.formId ?? '',
			field_def_id: undefined,
			field_order: 0,
			page: lf.page,
			row_index: lf.row_index,
			column_position: lf.column_position,
			field_label: lf.label,
			field_type: lf.field_type,
			is_required: lf.required,
			placeholder: lf.placeholder ?? undefined,
			help_text: lf.help_text ?? undefined,
			field_options: lf.field_options ?? undefined,
			conditional_logic: lf.conditional_logic ?? null
		} as ToolsFormField;
	}

	// Smart-dropdown source pool. A workflow def can reference any dropdown/MC field
	// workflow-wide; a protocol-local field can additionally reference its SIBLING
	// local fields — those live only on the protocol form, so getAllFormFields()
	// misses them, which is why protocol smart dropdowns reported "no fields found".
	const ancestorFields = $derived.by(() => {
		const base = builderState.getAllFormFields();
		if (local && localForm) {
			const siblings = (localForm.local_fields ?? [])
				.filter((lf) => lf.key !== local.key)
				.map(localToField);
			if (siblings.length > 0) {
				base.push({
					stage: {
						id: 'current',
						workflow_id: builderState.workflowId,
						stage_name: localForm.name || 'This form',
						stage_type: 'intermediate'
					},
					form: localForm,
					fields: siblings
				});
			}
		}
		return base;
	});

	// FieldConfigPanel edits a form-field row; we feed it a synthetic row carrying
	// the def-level fields (the form-presentation half is hidden by scope='field').
	const syntheticField = $derived<ToolsFormField | null>(
		def
			? ({
					id: def.id,
					form_id: '',
					field_def_id: def.id,
					field_order: 0,
					page: 1,
					row_index: 0,
					column_position: 'full',
					field_label: def.label,
					field_type: def.field_type,
					field_options: def.field_options ?? undefined,
					validation_rules: def.validation_rules ?? undefined,
					conditional_logic: undefined,
					is_required: false,
					placeholder: '',
					help_text: '',
					write_mode: def.write_mode,
					compute_expression: def.compute_expression,
					compute_depends_on: def.compute_depends_on,
					output_type: def.output_type
				} as ToolsFormField)
			: localField
				? localToField(localField)
				: null
	);

	function applyDefUpdate(u: Partial<ToolsFormField>) {
		if (defId) {
			const patch: Record<string, unknown> = {};
			if (u.field_label !== undefined) patch.label = u.field_label;
			if (u.field_type !== undefined) patch.field_type = u.field_type;
			if (u.write_mode !== undefined) patch.write_mode = u.write_mode;
			if (u.field_options !== undefined) patch.field_options = u.field_options;
			if (u.validation_rules !== undefined) patch.validation_rules = u.validation_rules;
			if (u.compute_expression !== undefined) patch.compute_expression = u.compute_expression;
			if (Object.keys(patch).length > 0) builderState.updateFieldDef(defId, patch);
			return;
		}
		if (local && localForm) {
			// Local fields carry their definition inline. `validation_rules` has no
			// home on ProtocolLocalFieldDef, so (as before) only options/type/label
			// persist; everything else (placeholder/help/required) is edited in the
			// form-presentation panel.
			const next = (localForm.local_fields ?? []).map((lf) => {
				if (lf.key !== local.key) return lf;
				return {
					...lf,
					label: u.field_label ?? lf.label,
					field_type:
						(u.field_type as ProtocolLocalFieldDef['field_type'] | undefined) ?? lf.field_type,
					field_options:
						u.field_options !== undefined ? (u.field_options ?? null) : lf.field_options
				};
			});
			builderState.updateForm(local.formId, { local_fields: next });
		}
	}
</script>

{#if syntheticField}
	<div class="field-def-editor">
		<FieldConfigPanel
			field={syntheticField}
			scope="field"
			{ancestorFields}
			{roles}
			showAdvanced={!local}
			onUpdate={applyDefUpdate}
		/>
		{#if def && defId}
			<div class="visibility">
				<RoleSelect
					selectedIds={def.view_roles ?? []}
					{roles}
					onChange={(ids) => builderState.updateFieldDef(defId, { view_roles: ids })}
					label={builderFieldVisibilityLabel?.() ?? 'Visible to roles'}
					help={builderFieldVisibilityHint?.() ?? 'Set per field. Empty = visible to everyone.'}
				/>
			</div>
		{/if}
	</div>
{/if}

<style>
	.field-def-editor {
		display: flex;
		flex-direction: column;
	}

	.visibility {
		padding: 0.75rem;
		border-top: 1px solid hsl(var(--border));
	}
</style>
