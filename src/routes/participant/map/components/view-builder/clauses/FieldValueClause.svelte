<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Button } from '$lib/components/ui/button';
	import { X } from 'lucide-svelte';
	import type { FilterClause } from '$lib/participant-state/types';
	import type { BuilderContext } from '../types';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		clause: Extract<FilterClause, { field: 'field_value' }>;
		ctx: BuilderContext;
		onChange: (next: Extract<FilterClause, { field: 'field_value' }>) => void;
		onRemove: () => void;
	}

	let { clause, ctx, onChange, onRemove }: Props = $props();

	const availableFields = $derived(ctx.filterableFields);
	const selectedField = $derived(
		availableFields.find(
			(f) => f.workflow_id === clause.workflow_id && f.field_key === clause.field_key
		)
	);

	function setField(serialized: string) {
		const [workflow_id, field_key] = serialized.split('|');
		onChange({ ...clause, workflow_id, field_key, values: [] });
	}

	function toggleValue(value: string, on: boolean) {
		const next = new Set(clause.values);
		if (on) next.add(value);
		else next.delete(value);
		onChange({ ...clause, values: [...next] });
	}

	const currentKey = $derived(`${clause.workflow_id}|${clause.field_key}`);
</script>

<div class="space-y-2 rounded-md border p-3">
	<div class="flex items-center justify-between gap-2">
		<span class="text-xs font-semibold uppercase text-muted-foreground">
			{m.participantFilterBuilderClauseFieldValue?.() ?? 'Field value'}
		</span>
		<Button variant="ghost" size="icon" class="h-6 w-6" onclick={onRemove}>
			<X class="h-3.5 w-3.5" />
		</Button>
	</div>

	<select
		class="h-8 w-full rounded-md border bg-background px-2 text-sm"
		value={currentKey}
		onchange={(e) => setField((e.currentTarget as HTMLSelectElement).value)}
	>
		<option value="|" disabled>
			{m.participantFilterBuilderPickField?.() ?? 'Pick a field…'}
		</option>
		{#each availableFields as opt}
			<option value={`${opt.workflow_id}|${opt.field_key}`}>{opt.field_label}</option>
		{/each}
	</select>

	{#if selectedField && selectedField.values.length > 0}
		<div class="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
			{#each selectedField.values as value}
				{@const checked = clause.values.includes(value)}
				<label class="flex cursor-pointer items-center gap-2 text-sm">
					<Checkbox
						{checked}
						onCheckedChange={(next) => toggleValue(value, next === true)}
					/>
					<span class="truncate">{value}</span>
				</label>
			{/each}
		</div>
	{:else if selectedField}
		<p class="text-xs text-muted-foreground">
			{m.participantFilterBuilderNoFieldValues?.() ?? 'No values present yet.'}
		</p>
	{/if}
</div>
