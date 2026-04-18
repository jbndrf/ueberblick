<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { X } from 'lucide-svelte';
	import type { FilterClause } from '$lib/participant-state/types';
	import * as m from '$lib/paraglide/messages';

	type DateClause = Extract<FilterClause, { field: 'created' | 'updated' }>;

	interface Props {
		clause: DateClause;
		onChange: (next: DateClause) => void;
		onRemove: () => void;
	}

	let { clause, onChange, onRemove }: Props = $props();

	type Mode = 'between' | 'older_than_days' | 'newer_than_days';

	function setField(field: 'created' | 'updated') {
		onChange({ ...clause, field } as DateClause);
	}

	function setMode(mode: Mode) {
		if (mode === 'between') {
			onChange({ field: clause.field, op: 'between', from: null, to: null });
		} else {
			onChange({ field: clause.field, op: mode, days: 7 });
		}
	}

	function setBetween(side: 'from' | 'to', value: string) {
		if (clause.op !== 'between') return;
		onChange({ ...clause, [side]: value || null } as DateClause);
	}

	function setDays(value: string) {
		if (clause.op === 'between') return;
		const parsed = parseInt(value, 10);
		if (!Number.isFinite(parsed) || parsed <= 0) return;
		onChange({ ...clause, days: parsed } as DateClause);
	}
</script>

<div class="space-y-2 rounded-md border p-3">
	<div class="flex items-center justify-between gap-2">
		<span class="text-xs font-semibold uppercase text-muted-foreground">
			{m.participantFilterBuilderClauseDate?.() ?? 'Date'}
		</span>
		<Button variant="ghost" size="icon" class="h-6 w-6" onclick={onRemove}>
			<X class="h-3.5 w-3.5" />
		</Button>
	</div>

	<div class="grid grid-cols-2 gap-2">
		<select
			class="h-8 rounded-md border bg-background px-2 text-sm"
			value={clause.field}
			onchange={(e) => setField((e.currentTarget as HTMLSelectElement).value as 'created' | 'updated')}
		>
			<option value="created">{m.participantFilterBuilderDateFieldCreated?.() ?? 'Created'}</option>
			<option value="updated">{m.participantFilterBuilderDateFieldUpdated?.() ?? 'Updated'}</option>
		</select>

		<select
			class="h-8 rounded-md border bg-background px-2 text-sm"
			value={clause.op}
			onchange={(e) => setMode((e.currentTarget as HTMLSelectElement).value as Mode)}
		>
			<option value="older_than_days">{m.participantFilterBuilderOpOlder?.() ?? 'Older than (days)'}</option>
			<option value="newer_than_days">{m.participantFilterBuilderOpNewer?.() ?? 'Newer than (days)'}</option>
			<option value="between">{m.participantFilterBuilderOpBetween?.() ?? 'Between'}</option>
		</select>
	</div>

	{#if clause.op === 'between'}
		<div class="grid grid-cols-2 gap-2">
			<Input
				type="date"
				class="h-8"
				value={clause.from ?? ''}
				onchange={(e) => setBetween('from', (e.currentTarget as HTMLInputElement).value)}
			/>
			<Input
				type="date"
				class="h-8"
				value={clause.to ?? ''}
				onchange={(e) => setBetween('to', (e.currentTarget as HTMLInputElement).value)}
			/>
		</div>
	{:else}
		<Input
			type="number"
			min="1"
			step="1"
			class="h-8"
			value={clause.days}
			onchange={(e) => setDays((e.currentTarget as HTMLInputElement).value)}
		/>
	{/if}
</div>
