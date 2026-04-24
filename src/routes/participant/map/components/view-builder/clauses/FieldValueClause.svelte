<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { X } from '@lucide/svelte';
	import type { FilterClause } from '$lib/participant-state/types';
	import type { BuilderContext, FilterableFieldOption } from '../types';
	import ClauseTextContains from './ClauseTextContains.svelte';
	import ClauseNumberRange from './ClauseNumberRange.svelte';
	import ClauseDateRange from './ClauseDateRange.svelte';
	import ClauseOptionMultiSelect from './ClauseOptionMultiSelect.svelte';

	type FieldValueClauseT = Extract<FilterClause, { field: 'field_value' }>;

	interface Props {
		clause: FieldValueClauseT;
		ctx: BuilderContext;
		onChange: (next: FieldValueClauseT) => void;
		onRemove: () => void;
	}

	let { clause, ctx, onChange, onRemove }: Props = $props();

	const field = $derived(
		ctx.filterableFields.find(
			(f) => f.workflow_id === clause.workflow_id && f.field_key === clause.field_key
		)
	);

	/**
	 * Decide which editor to render. Select-family fields with no resolvable
	 * options (e.g. custom_table_selector) drop to the contains editor so
	 * the field remains filterable even without a lookup pipeline.
	 */
	const editorKind = $derived.by(() => {
		if (!field) return 'contains' as const;
		switch (field.field_type) {
			case 'short_text':
			case 'long_text':
			case 'email':
				return 'contains' as const;
			case 'number':
				return 'number_range' as const;
			case 'date':
				return 'date_range' as const;
			case 'dropdown':
			case 'multiple_choice':
			case 'smart_dropdown':
				return field.options.length > 0 ? ('in' as const) : ('contains' as const);
			case 'custom_table_selector':
				return 'contains' as const;
			default:
				return 'contains' as const;
		}
	});

	// If the clause's op doesn't match the editor kind (e.g. a view saved
	// under an older shape, or the field type changed), coerce to a fresh
	// default-valued clause of the right shape.
	$effect(() => {
		if (!field) return;
		const wanted = editorKind;
		if (clause.op === wanted) return;
		onChange(defaultClause(field, wanted));
	});

	function defaultClause(
		f: FilterableFieldOption,
		kind: 'in' | 'contains' | 'number_range' | 'date_range'
	): FieldValueClauseT {
		const base = { field: 'field_value' as const, workflow_id: f.workflow_id, field_key: f.field_key };
		if (kind === 'in') return { ...base, op: 'in', values: [] };
		if (kind === 'contains') return { ...base, op: 'contains', text: '' };
		if (kind === 'number_range') return { ...base, op: 'number_range', min: null, max: null };
		return { ...base, op: 'date_range', from: null, to: null };
	}
</script>

<div class="space-y-2 rounded-md border p-3">
	<div class="flex items-start justify-between gap-2">
		<div class="min-w-0 flex-1">
			<div class="truncate text-sm font-medium">
				{field?.field_label ?? clause.field_key}
			</div>
			{#if field}
				<div class="truncate text-xs text-muted-foreground">{field.workflow_name}</div>
			{/if}
		</div>
		<Button variant="ghost" size="icon" class="h-6 w-6 shrink-0" onclick={onRemove}>
			<X class="h-3.5 w-3.5" />
		</Button>
	</div>

	{#if field && clause.op === 'contains'}
		<ClauseTextContains {clause} {onChange} />
	{:else if field && clause.op === 'number_range'}
		<ClauseNumberRange {clause} {onChange} />
	{:else if field && clause.op === 'date_range'}
		<ClauseDateRange {clause} {onChange} />
	{:else if field && clause.op === 'in'}
		<ClauseOptionMultiSelect {clause} options={field.options} {onChange} />
	{/if}
</div>
