<script lang="ts">
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';
	import type { FilterClause } from '$lib/participant-state/types';
	import * as m from '$lib/paraglide/messages';

	type InClause = Extract<FilterClause, { field: 'field_value'; op: 'in' }>;

	interface Props {
		clause: InClause;
		options: { id: string; label: string }[];
		onChange: (next: InClause) => void;
	}

	let { clause, options, onChange }: Props = $props();

	function handleIdsChange(ids: string[]) {
		// Idempotent: MobileMultiSelect's onSelectedIdsChange effect fires on
		// every selectedIds push (including parent-driven ones); without this
		// guard the handler bounces and pegs the main thread.
		const cur = clause.values;
		if (ids.length === cur.length && ids.every((id, i) => id === cur[i])) return;
		onChange({ ...clause, values: ids });
	}
</script>

{#if options.length === 0}
	<p class="text-xs text-muted-foreground">
		{m.participantFilterClauseNoOptions?.() ?? 'No options to pick from.'}
	</p>
{:else}
	<MobileMultiSelect
		{options}
		selectedIds={clause.values}
		getOptionId={(o) => o.id}
		getOptionLabel={(o) => o.label}
		onSelectedIdsChange={handleIdsChange}
		placeholder={m.participantFilterClauseOptionsPlaceholder?.() ?? 'Any value'}
		disablePortal
	/>
{/if}
