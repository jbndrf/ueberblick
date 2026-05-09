<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import type { FilterClause } from '$lib/participant-state/types';

	type DateClause = Extract<FilterClause, { field: 'field_value'; op: 'date_range' }>;

	interface Props {
		clause: DateClause;
		onChange: (next: DateClause) => void;
	}

	let { clause, onChange }: Props = $props();

	function setBound(side: 'from' | 'to', raw: string) {
		onChange({ ...clause, [side]: raw || null } as DateClause);
	}
</script>

<div class="grid grid-cols-2 gap-2">
	<Input
		type="date"
		class="h-9"
		value={clause.from ?? ''}
		onchange={(e) => setBound('from', (e.currentTarget as HTMLInputElement).value)}
	/>
	<Input
		type="date"
		class="h-9"
		value={clause.to ?? ''}
		onchange={(e) => setBound('to', (e.currentTarget as HTMLInputElement).value)}
	/>
</div>
