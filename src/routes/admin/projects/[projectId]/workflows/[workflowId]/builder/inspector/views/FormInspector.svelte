<script lang="ts">
	import { FormEditorView } from '../../right-sidebar/views/form-editor';
	import { getBuilderContext } from '../../builder-context.svelte';
	import { importFormPart, type FormTarget } from '$lib/workflow-builder/transfer';
	import type { FormPart, FormImportResult } from '$lib/workflow-builder/transfer';
	import type {
		ToolsFormField,
		FormFieldConfig,
		WorkflowFieldDef,
		FormPage,
		ColumnPosition,
		ProtocolLocalFieldDef
	} from '$lib/workflow-builder';
	import {
		workflowBuilderPageTitleDefault,
		workflowBuilderNewFieldLabel
	} from '$lib/paraglide/messages';
	import EmptyInspector from './EmptyInspector.svelte';

	const ctx = getBuilderContext();
	const { state, ui, roles, createRole } = ctx;

	const formId = $derived(ui.selection.type === 'form' ? ui.selection.id : null);
	const form = $derived(formId ? (state.getFormById(formId)?.data ?? null) : null);
	const formFields = $derived(formId ? state.getFieldsForForm(formId) : []);

	// Ancestor fields for smart dropdown configuration — only meaningful for
	// connection-attached forms (attachment derived from the entity itself).
	const ancestorFields = $derived.by(() => {
		if (!form?.connection_id) return [];
		return state.getAncestorFormFields(form.connection_id);
	});

	const formBacksProtocolTool = $derived(
		!!form && state.visibleProtocolTools.some((p) => p.data.protocol_form_id === form.id)
	);

	function splitFieldPatch(fieldId: string, updates: Partial<ToolsFormField>) {
		const refPatch: Partial<FormFieldConfig> = {};
		if (updates.field_order !== undefined) refPatch.field_order = updates.field_order;
		if (updates.page !== undefined) refPatch.page = updates.page;
		if (updates.row_index !== undefined) refPatch.row_index = updates.row_index;
		if (updates.column_position !== undefined) refPatch.column_position = updates.column_position;
		if (updates.is_required !== undefined) refPatch.is_required = updates.is_required;
		if (updates.placeholder !== undefined) refPatch.placeholder = updates.placeholder;
		if (updates.help_text !== undefined) refPatch.help_text = updates.help_text;
		if (updates.conditional_logic !== undefined)
			refPatch.conditional_logic = updates.conditional_logic;
		if (Object.keys(refPatch).length > 0) {
			state.updateFieldRefConfig(fieldId, refPatch);
		}

		const defPatch: Partial<WorkflowFieldDef> = {};
		if (updates.field_label !== undefined) defPatch.label = updates.field_label;
		if (updates.field_type !== undefined) defPatch.field_type = updates.field_type;
		if (updates.field_options !== undefined) defPatch.field_options = updates.field_options ?? null;
		if (updates.validation_rules !== undefined)
			defPatch.validation_rules = updates.validation_rules ?? null;
		if (updates.write_mode !== undefined) defPatch.write_mode = updates.write_mode;
		if (updates.compute_expression !== undefined)
			defPatch.compute_expression = updates.compute_expression;
		if (Object.keys(defPatch).length > 0) {
			const defId = state.getFormFieldById(fieldId)?.data.field_def_id;
			if (defId) state.updateFieldDef(defId, defPatch);
		}
	}

	function setPageMeta(page: number, patch: Partial<FormPage>) {
		if (!formId) return;
		const pages: FormPage[] = [...(state.getFormById(formId)?.data.pages ?? [])];
		const idx = pages.findIndex((p) => p.page === page);
		if (idx >= 0) {
			pages[idx] = { ...pages[idx], ...patch };
		} else {
			pages.push({ page, title: '', description: '', ...patch });
		}
		state.updateForm(formId, { pages });
	}

	function handleAddPage() {
		if (!formId) return;
		const maxPage = state
			.getFieldsForForm(formId)
			.reduce((max, f) => Math.max(max, f.data.page ?? 1), 1);
		const nextPage = maxPage + 1;

		const pages: FormPage[] = [...(state.getFormById(formId)?.data.pages ?? [])];
		pages.push({
			page: nextPage,
			title: workflowBuilderPageTitleDefault?.({ page: nextPage }) ?? `Page ${nextPage}`,
			description: ''
		});
		state.updateForm(formId, { pages });

		// Placeholder field so the page shows up
		state.addFormField(
			formId,
			'short_text',
			0,
			'full',
			nextPage,
			workflowBuilderNewFieldLabel?.() ?? 'New Field'
		);
	}

	function handleDeletePage(page: number) {
		if (!formId) return;
		// Non-destructive: fields on the deleted page move to the previous page;
		// pages above it shift down so numbering stays contiguous.
		for (const field of state.getFieldsForForm(formId)) {
			const p = field.data.page ?? 1;
			if (p === page) {
				state.updateFieldRefConfig(field.data.id, { page: Math.max(1, page - 1) });
			} else if (p > page) {
				state.updateFieldRefConfig(field.data.id, { page: p - 1 });
			}
		}
		const pages: FormPage[] = (state.getFormById(formId)?.data.pages ?? [])
			.filter((p) => p.page !== page)
			.map((p) => (p.page > page ? { ...p, page: p.page - 1 } : p));
		state.updateForm(formId, { pages });
	}

	/**
	 * Create a NEW form from a pasted/edited YAML definition. Attached to the
	 * same target as the currently-open form, then selected.
	 */
	function handleImportForm(part: FormPart): FormImportResult | undefined {
		let target: FormTarget = { isGlobal: true };
		if (form?.connection_id) target = { connectionId: form.connection_id };
		else if (form?.stage_id) target = { stageId: form.stage_id };
		const result = importFormPart(state, part, target);
		ui.select({ type: 'form', id: result.formId });
		return result;
	}
</script>

{#if form && formId}
	<FormEditorView
		{form}
		fields={formFields}
		{ancestorFields}
		{roles}
		onFormNameChange={(name) => state.updateForm(formId, { name })}
		onAddField={(fieldType, page, rowIndex, columnPosition) =>
			state.addFormField(
				formId,
				fieldType as ToolsFormField['field_type'],
				rowIndex,
				columnPosition,
				page
			)}
		fieldDefs={state.effectiveFieldDefs.map((d) => d.data)}
		onAddFieldRef={(defId, page, rowIndex, columnPosition) =>
			state.addFormFieldRef(formId, defId, rowIndex, columnPosition, page)}
		onFieldUpdate={splitFieldPatch}
		onFieldDelete={(fieldId) => state.deleteFormField(fieldId)}
		onFieldsReorder={(fieldIds) =>
			fieldIds.forEach((fieldId, index) =>
				state.updateFieldRefConfig(fieldId, { field_order: index })
			)}
		onAddPage={handleAddPage}
		onDeletePage={handleDeletePage}
		onPageTitleChange={(page, title) => setPageMeta(page, { title })}
		onPageDescriptionChange={(page, description) => setPageMeta(page, { description })}
		onClose={() => ui.deselect()}
		onDelete={formBacksProtocolTool
			? undefined
			: () => {
					state.deleteForm(formId);
					ui.deselect();
				}}
		onPaletteExpandedChange={(expanded) => (ui.paletteExpanded = expanded)}
		showLocalFields={formBacksProtocolTool}
		localFields={form.local_fields ?? []}
		onLocalFieldsChange={(next: ProtocolLocalFieldDef[]) =>
			state.updateForm(formId, { local_fields: next })}
		onImportForm={handleImportForm}
		getDefUsageCount={(defId) => state.getRefsForDef(defId).length}
	/>
{:else}
	<EmptyInspector />
{/if}
