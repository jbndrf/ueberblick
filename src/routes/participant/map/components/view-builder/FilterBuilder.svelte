<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Plus } from '@lucide/svelte';
	import type { FilterClause } from '$lib/participant-state/types';
	import type { BuilderContext, ClauseKind } from './types';
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

	let pickerOpen = $state(false);

	function addClause(kind: ClauseKind) {
		pickerOpen = false;
		const firstWorkflow = ctx.workflows[0]?.id ?? '';
		const firstField = ctx.filterableFields[0];
		let fresh: FilterClause;
		switch (kind) {
			case 'stage':
				fresh = { field: 'stage', workflow_id: firstWorkflow, op: 'in', values: [] };
				break;
			case 'field_value':
				fresh = {
					field: 'field_value',
					workflow_id: firstField?.workflow_id ?? firstWorkflow,
					field_key: firstField?.field_key ?? '',
					op: 'in',
					values: []
				};
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

<div class="space-y-3">
	<div class="flex items-center justify-between">
		<h4 class="text-sm font-medium">
			{m.participantFilterBuilderTitle?.() ?? 'Advanced filters'}
		</h4>
		<span class="text-xs text-muted-foreground">
			{m.participantFilterBuilderAndHint?.() ?? 'All conditions must match'}
		</span>
	</div>

	{#if clauses.length === 0}
		<p class="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
			{m.participantFilterBuilderEmpty?.() ?? 'No advanced filters yet. Add one below.'}
		</p>
	{/if}

	{#each clauses as clause, i (i)}
		{#if clause.field === 'stage'}
			<StageClause
				{clause}
				{ctx}
				onChange={(next) => patchClause(i, next)}
				onRemove={() => removeClause(i)}
			/>
		{:else if clause.field === 'field_value'}
			<FieldValueClause
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
			class="w-full justify-start"
			onclick={() => (pickerOpen = !pickerOpen)}
		>
			<Plus class="mr-2 h-4 w-4" />
			{m.participantFilterBuilderAddClause?.() ?? 'Add condition'}
		</Button>

		{#if pickerOpen}
			<div
				class="absolute left-0 right-0 z-10 mt-1 overflow-hidden rounded-md border bg-popover shadow-md"
				role="menu"
			>
				<button
					class="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
					onclick={() => addClause('stage')}
				>
					{m.participantFilterBuilderClauseStage?.() ?? 'Stage'}
				</button>
				<button
					class="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
					onclick={() => addClause('field_value')}
				>
					{m.participantFilterBuilderClauseFieldValue?.() ?? 'Field value'}
				</button>
				<button
					class="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
					onclick={() => addClause('created')}
				>
					{m.participantFilterBuilderClauseCreated?.() ?? 'Created date'}
				</button>
				<button
					class="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
					onclick={() => addClause('updated')}
				>
					{m.participantFilterBuilderClauseUpdated?.() ?? 'Updated date'}
				</button>
				<button
					class="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
					onclick={() => addClause('created_by')}
				>
					{m.participantFilterBuilderClauseCreatedBy?.() ?? 'Created by'}
				</button>
			</div>
		{/if}
	</div>
</div>
