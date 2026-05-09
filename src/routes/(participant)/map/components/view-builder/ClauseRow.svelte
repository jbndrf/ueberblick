<script lang="ts">
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';
	import { Button } from '$lib/components/ui/button';
	import { X } from '@lucide/svelte';
	import type { Clause, ClauseSource, ClauseValue, Operator } from './tree';
	import { makeClause, sourceKey } from './tree';
	import type { BuilderContext } from './types';
	import { operatorLabel, operatorsFor, valueForOp } from './operators';
	import { buildSourceOptions, type SourceOption } from './source-options';

	import InMultiSelect from './value-editors/InMultiSelect.svelte';
	import TextContains from './value-editors/TextContains.svelte';
	import BetweenNumbers from './value-editors/BetweenNumbers.svelte';
	import BetweenDates from './value-editors/BetweenDates.svelte';
	import DaysAgo from './value-editors/DaysAgo.svelte';

	interface Props {
		clause: Clause;
		ctx: BuilderContext;
		onChange: (next: Clause) => void;
		onRemove: () => void;
	}

	let { clause, ctx, onChange, onRemove }: Props = $props();

	const sourceOptions = $derived(buildSourceOptions(ctx));
	const currentSourceId = $derived(sourceKey(clause.source));
	const currentSourceOption = $derived(sourceOptions.find((s) => s.id === currentSourceId));

	const ops = $derived(
		operatorsFor(clause.source).map((op) => ({ id: op, label: operatorLabel(op) }))
	);

	function setSource(next: ClauseSource) {
		onChange(makeClause(next));
	}

	function setOp(op: Operator) {
		onChange({ ...clause, op, value: valueForOp(op, clause.value) });
	}

	function setValue(value: ClauseValue) {
		onChange({ ...clause, value });
	}

	// Value-editor picker for the (op, value) pair.
	// Treats `op = eq` on text-like fields as a contains-style single-line input
	// because that's what users mean when they pick "equals" for free text.
	const showEditor = $derived(
		clause.value.type !== 'none' &&
			!(clause.op === 'is_empty' || clause.op === 'is_not_empty' || clause.op === 'is_me')
	);

	function valueOptionsForIn(): { id: string; label: string }[] {
		const s = clause.source;
		if (s.kind === 'field_value') return s.options;
		if (s.kind === 'stage') return ctx.stagesByWorkflow.get(s.workflow_id)?.map((x) => ({ id: x.id, label: x.name })) ?? [];
		if (s.kind === 'created_by') return ctx.creators.map((c) => ({ id: c.id, label: c.label }));
		return [];
	}
</script>

<div class="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2">
	<!-- Field pill: tap to swap field. -->
	<div class="min-w-[8rem]">
		<MobileMultiSelect
			options={sourceOptions}
			selectedIds={currentSourceOption ? [currentSourceOption.id] : []}
			getOptionId={(o: SourceOption) => o.id}
			getOptionLabel={(o: SourceOption) => o.label}
			getOptionDescription={(o: SourceOption) => o.group}
			onSelectedIdsChange={(ids) => {
				const next = sourceOptions.find((s) => s.id === ids[0]);
				if (next && next.id !== currentSourceId) setSource(next.source);
			}}
			singleSelect
			placeholder="Field"
			disablePortal
		/>
	</div>

	<!-- Operator pill -->
	<div class="min-w-[7rem]">
		<MobileMultiSelect
			options={ops}
			selectedIds={[clause.op]}
			getOptionId={(o) => o.id}
			getOptionLabel={(o) => o.label}
			onSelectedIdsChange={(ids) => {
				const op = ids[0] as Operator | undefined;
				if (op && op !== clause.op) setOp(op);
			}}
			singleSelect
			placeholder="Operator"
			disablePortal
		/>
	</div>

	<!-- Value editor: shape depends on (op, value.type) -->
	{#if showEditor}
		<div class="flex flex-1 basis-40 items-center gap-2">
			{#if clause.value.type === 'values'}
				<InMultiSelect
					options={valueOptionsForIn()}
					values={clause.value.values}
					onChange={(values) => setValue({ type: 'values', values })}
				/>
			{:else if clause.value.type === 'text'}
				<TextContains
					text={clause.value.text}
					onChange={(text) => setValue({ type: 'text', text })}
				/>
			{:else if clause.value.type === 'number_range'}
				<BetweenNumbers
					min={clause.value.min}
					max={clause.value.max}
					onChange={(n) => setValue({ type: 'number_range', ...n })}
				/>
			{:else if clause.value.type === 'date_range'}
				<BetweenDates
					from={clause.value.from}
					to={clause.value.to}
					onChange={(d) => setValue({ type: 'date_range', ...d })}
				/>
			{:else if clause.value.type === 'days'}
				<DaysAgo days={clause.value.days} onChange={(days) => setValue({ type: 'days', days })} />
			{/if}
		</div>
	{/if}

	<Button variant="ghost" size="icon" class="h-7 w-7 shrink-0" onclick={onRemove} title="Remove">
		<X class="h-3.5 w-3.5" />
	</Button>
</div>
