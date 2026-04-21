<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Button } from '$lib/components/ui/button';
	import { X } from '@lucide/svelte';
	import type { FilterClause } from '$lib/participant-state/types';
	import type { BuilderContext } from '../types';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		clause: Extract<FilterClause, { field: 'created_by' }>;
		ctx: BuilderContext;
		onChange: (next: Extract<FilterClause, { field: 'created_by' }>) => void;
		onRemove: () => void;
	}

	let { clause, ctx, onChange, onRemove }: Props = $props();

	function toggle(id: string, on: boolean) {
		const next = new Set(clause.values);
		if (on) next.add(id);
		else next.delete(id);
		onChange({ ...clause, values: [...next] });
	}
</script>

<div class="space-y-2 rounded-md border p-3">
	<div class="flex items-center justify-between gap-2">
		<span class="text-xs font-semibold uppercase text-muted-foreground">
			{m.participantFilterBuilderClauseCreatedBy?.() ?? 'Created by'}
		</span>
		<Button variant="ghost" size="icon" class="h-6 w-6" onclick={onRemove}>
			<X class="h-3.5 w-3.5" />
		</Button>
	</div>

	{#if ctx.creators.length === 0}
		<p class="text-xs text-muted-foreground">
			{m.participantFilterBuilderNoCreators?.() ?? 'No creators yet.'}
		</p>
	{:else}
		<div class="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
			{#each ctx.creators as c}
				{@const checked = clause.values.includes(c.id)}
				<label class="flex cursor-pointer items-center gap-2 text-sm">
					<Checkbox
						{checked}
						onCheckedChange={(next) => toggle(c.id, next === true)}
					/>
					<span class="truncate">{c.label}</span>
				</label>
			{/each}
		</div>
	{/if}
</div>
