<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { FolderPlus } from '@lucide/svelte';
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';
	import type { Combinator, Group, Node } from './tree';
	import { makeClause, nextId } from './tree';
	import type { BuilderContext } from './types';
	import { buildSourceOptions, type SourceOption } from './source-options';
	import ClauseRow from './ClauseRow.svelte';
	import Self from './GroupNode.svelte';

	interface Props {
		group: Group;
		ctx: BuilderContext;
		depth?: number;
		maxDepth?: number;
		onChange: (next: Group) => void;
		onRemove?: () => void;
	}

	let { group, ctx, depth = 0, maxDepth = 2, onChange, onRemove }: Props = $props();

	const sourceOptions = $derived(buildSourceOptions(ctx));

	function replaceChild(index: number, next: Node | null) {
		const children = next
			? group.children.map((c, i) => (i === index ? next : c))
			: group.children.filter((_, i) => i !== index);
		onChange({ ...group, children });
	}

	function addClause(sourceId: string) {
		const opt = sourceOptions.find((o) => o.id === sourceId);
		if (!opt) return;
		onChange({ ...group, children: [...group.children, makeClause(opt.source)] });
	}

	function addGroup() {
		const fresh: Group = { kind: 'group', id: nextId(), combinator: 'and', children: [] };
		onChange({ ...group, children: [...group.children, fresh] });
	}

	function flipCombinator() {
		const next: Combinator = group.combinator === 'and' ? 'or' : 'and';
		onChange({ ...group, combinator: next });
	}

	const canNest = $derived(depth < maxDepth);

	let pickerSelected = $state<string[]>([]);
	$effect(() => {
		if (pickerSelected.length > 0) {
			addClause(pickerSelected[0]);
			pickerSelected = [];
		}
	});
</script>

<div
	class="space-y-2 rounded-md {depth > 0
		? 'border border-dashed bg-muted/30 p-2'
		: ''}"
>
	{#if depth > 0}
		<div class="flex items-center justify-between">
			<button
				class="rounded-md border bg-background px-2 py-0.5 text-xs font-semibold uppercase tracking-wide hover:bg-accent"
				onclick={flipCombinator}
				title="Toggle AND / OR"
			>
				{group.combinator === 'and' ? 'ALL of' : 'ANY of'}
			</button>
			{#if onRemove}
				<Button variant="ghost" size="sm" class="h-6 px-2 text-xs" onclick={onRemove}>
					Remove group
				</Button>
			{/if}
		</div>
	{/if}

	{#each group.children as child, i (child.id)}
		{#if i > 0}
			<!-- Combinator chip between siblings: clicking it flips the whole
			     group's combinator. Renders as a centered tiny pill. -->
			<div class="flex justify-center">
				<button
					class="rounded-full border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent"
					onclick={flipCombinator}
					title="Toggle AND / OR"
				>
					{group.combinator}
				</button>
			</div>
		{/if}

		{#if child.kind === 'clause'}
			<ClauseRow
				clause={child}
				{ctx}
				onChange={(next) => replaceChild(i, next)}
				onRemove={() => replaceChild(i, null)}
			/>
		{:else}
			<Self
				group={child}
				{ctx}
				depth={depth + 1}
				{maxDepth}
				onChange={(next) => replaceChild(i, next)}
				onRemove={() => replaceChild(i, null)}
			/>
		{/if}
	{/each}

	<div class="flex flex-wrap items-center gap-2 pt-1">
		<div class="min-w-[10rem] flex-1">
			<MobileMultiSelect
				options={sourceOptions}
				selectedIds={pickerSelected}
				getOptionId={(o: SourceOption) => o.id}
				getOptionLabel={(o: SourceOption) => o.label}
				getOptionDescription={(o: SourceOption) => o.group}
				onSelectedIdsChange={(ids) => (pickerSelected = ids)}
				singleSelect
				placeholder={group.children.length === 0 ? '+ Add filter' : '+ Add condition'}
				disablePortal
			/>
		</div>
		{#if canNest}
			<Button variant="outline" size="sm" class="h-8" onclick={addGroup}>
				<FolderPlus class="mr-1 h-3.5 w-3.5" />
				Group
			</Button>
		{/if}
	</div>
</div>
