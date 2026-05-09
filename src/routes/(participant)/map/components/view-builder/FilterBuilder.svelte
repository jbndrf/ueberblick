<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Plus } from '@lucide/svelte';
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';
	import type { FilterClause } from '$lib/participant-state/types';
	import type {
		BuilderContext,
		ClauseKind,
		FilterableFieldOption
	} from './types';
	import StageClause from './clauses/StageClause.svelte';
	import FieldValueClause from './clauses/FieldValueClause.svelte';
	import DateClause from './clauses/DateClause.svelte';
	import CreatedByClause from './clauses/CreatedByClause.svelte';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		clauses: FilterClause[];
		ctx: BuilderContext;
		onChange: (next: FilterClause[]) => void;
	}

	let { clauses, ctx, onChange }: Props = $props();

	/**
	 * The field picker is a flat list of `FilterableFieldOption`, one entry
	 * per (workflow, form field). Selecting an entry adds a field_value
	 * clause configured for the field's type; deselecting removes whatever
	 * field_value clause targets that exact (workflow, field_key).
	 */
	function fieldKey(f: FilterableFieldOption): string {
		return `${f.workflow_id}|${f.field_key}`;
	}

	const selectedFieldKeys = $derived(
		clauses
			.filter((c): c is Extract<FilterClause, { field: 'field_value' }> => c.field === 'field_value')
			.map((c) => `${c.workflow_id}|${c.field_key}`)
	);

	function defaultFieldClause(f: FilterableFieldOption): FilterClause {
		const base = { field: 'field_value' as const, workflow_id: f.workflow_id, field_key: f.field_key };
		switch (f.field_type) {
			case 'number':
				return { ...base, op: 'number_range', min: null, max: null };
			case 'date':
				return { ...base, op: 'date_range', from: null, to: null };
			case 'dropdown':
			case 'multiple_choice':
			case 'smart_dropdown':
				return f.options.length > 0
					? { ...base, op: 'in', values: [] }
					: { ...base, op: 'contains', text: '' };
			default:
				return { ...base, op: 'contains', text: '' };
		}
	}

	function handleFieldPickerChange(nextIds: string[]) {
		const nextSet = new Set(nextIds);
		const currentSet = new Set(selectedFieldKeys);
		// Idempotent: MobileMultiSelect fires onSelectedIdsChange on every
		// selectedIds reference change, including parent-pushed updates.
		// Without this guard the handler bounces and freezes the UI.
		if (
			nextSet.size === currentSet.size &&
			[...nextSet].every((id) => currentSet.has(id))
		) {
			return;
		}
		const keptClauses = clauses.filter((c) => {
			if (c.field !== 'field_value') return true;
			return nextSet.has(`${c.workflow_id}|${c.field_key}`);
		});
		const added: FilterClause[] = [];
		for (const id of nextIds) {
			if (currentSet.has(id)) continue;
			const f = ctx.filterableFields.find((x) => fieldKey(x) === id);
			if (f) added.push(defaultFieldClause(f));
		}
		onChange([...keptClauses, ...added]);
	}

	let otherPickerOpen = $state(false);

	function addOtherClause(kind: Exclude<ClauseKind, 'field_value'>) {
		otherPickerOpen = false;
		const firstWorkflow = ctx.workflows[0]?.id ?? '';
		let fresh: FilterClause;
		switch (kind) {
			case 'stage':
				fresh = { field: 'stage', workflow_id: firstWorkflow, op: 'in', values: [] };
				break;
			case 'created':
				fresh = { field: 'created', op: 'older_than_days', days: 7 };
				break;
			case 'updated':
				fresh = { field: 'updated', op: 'older_than_days', days: 7 };
				break;
			case 'created_by':
				fresh = { field: 'created_by', op: 'in', values: [] };
				break;
		}
		onChange([...clauses, fresh]);
	}

	function patchClause(index: number, next: FilterClause) {
		onChange(clauses.map((c, i) => (i === index ? next : c)));
	}

	function removeClause(index: number) {
		onChange(clauses.filter((_, i) => i !== index));
	}
</script>

<div class="space-y-4">
	<!-- Field picker: selecting fields creates per-type filter clauses.
	     Text fields get a "Contains…" input, number fields get min/max,
	     date fields get a date range, dropdown-like fields get their own
	     mobile-multi-select. -->
	<div>
		<label class="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground" for="view-field-picker">
			{m.participantFilterBuilderFieldsLabel?.() ?? 'Filter fields'}
		</label>
		<MobileMultiSelect
			options={ctx.filterableFields}
			selectedIds={selectedFieldKeys}
			getOptionId={fieldKey}
			getOptionLabel={(f) => f.field_label}
			getOptionDescription={(f) => f.workflow_name}
			onSelectedIdsChange={handleFieldPickerChange}
			placeholder={m.participantFilterBuilderFieldsPlaceholder?.() ?? 'Add fields to filter by…'}
			summarizeMultiple
			disablePortal
		/>
	</div>

	{#if clauses.some((c) => c.field === 'field_value')}
		<div class="space-y-2">
			{#each clauses as clause, i (i)}
				{#if clause.field === 'field_value'}
					<FieldValueClause
						{clause}
						{ctx}
						onChange={(next) => patchClause(i, next)}
						onRemove={() => removeClause(i)}
					/>
				{/if}
			{/each}
		</div>
	{/if}

	<!-- Other non-field conditions: stage, created/updated date, created_by. -->
	<div class="space-y-2">
		{#each clauses as clause, i (i)}
			{#if clause.field === 'stage'}
				<StageClause
					{clause}
					{ctx}
					onChange={(next) => patchClause(i, next)}
					onRemove={() => removeClause(i)}
				/>
			{:else if clause.field === 'created' || clause.field === 'updated'}
				<DateClause
					{clause}
					onChange={(next) => patchClause(i, next)}
					onRemove={() => removeClause(i)}
				/>
			{:else if clause.field === 'created_by'}
				<CreatedByClause
					{clause}
					{ctx}
					onChange={(next) => patchClause(i, next)}
					onRemove={() => removeClause(i)}
				/>
			{/if}
		{/each}

		<div class="relative">
			<Button
				variant="outline"
				size="sm"
				class="w-full justify-start"
				onclick={() => (otherPickerOpen = !otherPickerOpen)}
			>
				<Plus class="mr-2 h-4 w-4" />
				{m.participantFilterBuilderAddOther?.() ?? 'Add other condition'}
			</Button>

			{#if otherPickerOpen}
				<div
					class="absolute left-0 right-0 z-10 mt-1 overflow-hidden rounded-md border bg-popover shadow-md"
					role="menu"
				>
					<button
						class="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
						onclick={() => addOtherClause('stage')}
					>
						{m.participantFilterBuilderClauseStage?.() ?? 'Stage'}
					</button>
					<button
						class="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
						onclick={() => addOtherClause('created')}
					>
						{m.participantFilterBuilderClauseCreated?.() ?? 'Created date'}
					</button>
					<button
						class="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
						onclick={() => addOtherClause('updated')}
					>
						{m.participantFilterBuilderClauseUpdated?.() ?? 'Updated date'}
					</button>
					<button
						class="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
						onclick={() => addOtherClause('created_by')}
					>
						{m.participantFilterBuilderClauseCreatedBy?.() ?? 'Created by'}
					</button>
				</div>
			{/if}
		</div>
	</div>
</div>
