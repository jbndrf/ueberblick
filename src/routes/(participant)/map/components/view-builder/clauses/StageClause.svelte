<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Button } from '$lib/components/ui/button';
	import { X } from '@lucide/svelte';
	import type { FilterClause } from '$lib/participant-state/types';
	import type { BuilderContext } from '../types';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		clause: Extract<FilterClause, { field: 'stage' }>;
		ctx: BuilderContext;
		onChange: (next: Extract<FilterClause, { field: 'stage' }>) => void;
		onRemove: () => void;
	}

	let { clause, ctx, onChange, onRemove }: Props = $props();

	const stages = $derived(ctx.stagesByWorkflow.get(clause.workflow_id) ?? []);

	function setWorkflow(workflowId: string) {
		onChange({ ...clause, workflow_id: workflowId, values: [] });
	}

	function toggleStage(stageId: string, on: boolean) {
		const next = new Set(clause.values);
		if (on) next.add(stageId);
		else next.delete(stageId);
		onChange({ ...clause, values: [...next] });
	}
</script>

<div class="space-y-2 rounded-md border p-3">
	<div class="flex items-center justify-between gap-2">
		<span class="text-xs font-semibold uppercase text-muted-foreground">
			{m.participantFilterBuilderClauseStage?.() ?? 'Stage'}
		</span>
		<Button variant="ghost" size="icon" class="h-6 w-6" onclick={onRemove}>
			<X class="h-3.5 w-3.5" />
		</Button>
	</div>

	<select
		class="h-8 w-full rounded-md border bg-background px-2 text-sm"
		value={clause.workflow_id}
		onchange={(e) => setWorkflow((e.currentTarget as HTMLSelectElement).value)}
	>
		<option value="" disabled>
			{m.participantFilterBuilderPickWorkflow?.() ?? 'Pick a workflow…'}
		</option>
		{#each ctx.workflows as wf}
			<option value={wf.id}>{wf.name}</option>
		{/each}
	</select>

	{#if clause.workflow_id && stages.length > 0}
		<div class="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
			{#each stages as stage}
				{@const checked = clause.values.includes(stage.id)}
				<label class="flex cursor-pointer items-center gap-2 text-sm">
					<Checkbox
						{checked}
						onCheckedChange={(next) => toggleStage(stage.id, next === true)}
					/>
					<span class="truncate">{stage.name}</span>
				</label>
			{/each}
		</div>
	{:else if clause.workflow_id}
		<p class="text-xs text-muted-foreground">
			{m.participantFilterBuilderNoStages?.() ?? 'No stages for this workflow.'}
		</p>
	{/if}
</div>
