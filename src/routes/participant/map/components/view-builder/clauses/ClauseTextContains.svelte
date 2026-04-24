<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import type { FilterClause } from '$lib/participant-state/types';
	import * as m from '$lib/paraglide/messages';

	type TextClause = Extract<FilterClause, { field: 'field_value'; op: 'contains' }>;

	interface Props {
		clause: TextClause;
		onChange: (next: TextClause) => void;
	}

	let { clause, onChange }: Props = $props();
</script>

<Input
	type="text"
	class="h-9"
	placeholder={m.participantFilterClauseTextPlaceholder?.() ?? 'Contains…'}
	value={clause.text}
	oninput={(e) => onChange({ ...clause, text: (e.currentTarget as HTMLInputElement).value })}
/>
