<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import type { FilterClause } from '$lib/participant-state/types';
	import * as m from '$lib/paraglide/messages';

	type NumberClause = Extract<FilterClause, { field: 'field_value'; op: 'number_range' }>;

	interface Props {
		clause: NumberClause;
		onChange: (next: NumberClause) => void;
	}

	let { clause, onChange }: Props = $props();

	function setBound(side: 'min' | 'max', raw: string) {
		if (raw === '') {
			onChange({ ...clause, [side]: null } as NumberClause);
			return;
		}
		const parsed = Number(raw);
		if (!Number.isFinite(parsed)) return;
		onChange({ ...clause, [side]: parsed } as NumberClause);
	}
</script>

<div class="grid grid-cols-2 gap-2">
	<Input
		type="number"
		class="h-9"
		placeholder={m.participantFilterClauseNumberMin?.() ?? 'Min'}
		value={clause.min ?? ''}
		oninput={(e) => setBound('min', (e.currentTarget as HTMLInputElement).value)}
	/>
	<Input
		type="number"
		class="h-9"
		placeholder={m.participantFilterClauseNumberMax?.() ?? 'Max'}
		value={clause.max ?? ''}
		oninput={(e) => setBound('max', (e.currentTarget as HTMLInputElement).value)}
	/>
</div>
