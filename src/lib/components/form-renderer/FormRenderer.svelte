<script lang="ts">
	import FieldRenderer from './FieldRenderer.svelte';
	import {
		type FormMode,
		type FormFieldWithValue,
		type FormValues,
		type FieldContext,
		type PageGroup,
		type FormPage,
		groupFieldsByLayout,
		getColumnClass,
		getTotalPages
	} from './types';

	// ==========================================================================
	// Props
	// ==========================================================================

	interface Props {
		mode: FormMode;
		fields: FormFieldWithValue[];
		values?: FormValues;
		onValueChange?: (fieldId: string, value: unknown) => void;
		onFileChange?: (fieldId: string, files: File[]) => void;
		paginated?: boolean;
		currentPage?: number;
		onPageChange?: (page: number) => void;
		errors?: Record<string, string>;
		fileCollection?: string;
		/** Per-page metadata (title + description). */
		pages?: FormPage[];
		/**
		 * Per-field editability override. When provided, each field renders in
		 * `edit` mode if its id is in this set, else `view` mode — `mode` is
		 * ignored. Used by the participant detail-view edit tool. When omitted,
		 * the single `mode` applies to every field (unchanged behavior).
		 */
		editableFieldIds?: string[];
	}

	let {
		mode,
		fields,
		values = {},
		onValueChange,
		onFileChange,
		paginated = false,
		currentPage = 1,
		onPageChange,
		errors = {},
		fileCollection = 'workflow_field_values',
		pages = [],
		editableFieldIds
	}: Props = $props();

	const editableSet = $derived(editableFieldIds ? new Set(editableFieldIds) : null);

	function fieldMode(fieldId: string): FormMode {
		if (!editableSet) return mode;
		return editableSet.has(fieldId) ? 'edit' : 'view';
	}

	// ==========================================================================
	// Derived
	// ==========================================================================

	// Merge field values with passed values
	const fieldsWithValues = $derived.by((): FormFieldWithValue[] => {
		return fields.map((field) => ({
			...field,
			value: values[field.id] ?? field.value
		}));
	});

	// Group fields by layout (page -> row)
	const pageGroups = $derived(groupFieldsByLayout(fieldsWithValues, pages));

	// Total pages
	const totalPages = $derived(getTotalPages(fields));

	// Current page fields (for paginated mode)
	const currentPageGroup = $derived.by((): PageGroup | null => {
		if (!paginated) return null;
		return pageGroups.find((pg) => pg.page === currentPage) || null;
	});

	// Context for smart dropdowns
	const fieldContext = $derived.by((): FieldContext => ({
		values,
		fields
	}));

	// ==========================================================================
	// Handlers
	// ==========================================================================

	function handleValueChange(fieldId: string, value: unknown) {
		onValueChange?.(fieldId, value);
	}

	function handleFileChange(fieldId: string, files: File[]) {
		onFileChange?.(fieldId, files);
	}

	// ==========================================================================
	// Page Navigation (Paginated Mode)
	// ==========================================================================

	function goToPage(page: number) {
		if (page >= 1 && page <= totalPages) {
			onPageChange?.(page);
		}
	}

	function nextPage() {
		goToPage(currentPage + 1);
	}

	function prevPage() {
		goToPage(currentPage - 1);
	}
</script>

{#snippet renderRow(row: { rowIndex: number; fields: FormFieldWithValue[] })}
	<div class="flex flex-wrap gap-4">
		{#each row.fields as field (field.id)}
			<div class={getColumnClass(field.column_position)}>
				<FieldRenderer
					mode={fieldMode(field.id)}
					{field}
					value={values[field.id] ?? field.value}
					error={errors[field.id]}
					context={fieldContext}
					{fileCollection}
					onValueChange={(v) => handleValueChange(field.id, v)}
					onFileChange={(files) => handleFileChange(field.id, files)}
				/>
			</div>
		{/each}
	</div>
{/snippet}

{#snippet renderPageGroup(pageGroup: PageGroup)}
	<div class="space-y-4">
		{#if pageGroup.pageTitle}
			<h4 class="text-sm font-semibold text-foreground border-b border-border pb-2">
				{pageGroup.pageTitle}
			</h4>
		{/if}

		{#if pageGroup.pageDescription}
			<p class="text-sm text-muted-foreground whitespace-pre-line">
				{pageGroup.pageDescription}
			</p>
		{/if}

		<div class="space-y-4">
			{#each pageGroup.rows as row}
				{@render renderRow(row)}
			{/each}
		</div>
	</div>
{/snippet}

<div class="space-y-6">
	{#if paginated}
		<!-- PAGINATED MODE - just render current page fields, navigation handled by parent -->
		{#if currentPageGroup}
			{@render renderPageGroup(currentPageGroup)}
		{/if}
	{:else}
		<!-- INLINE MODE (all pages shown with headers) -->
		{#each pageGroups as pageGroup}
			{@render renderPageGroup(pageGroup)}
		{/each}
	{/if}
</div>
