<script lang="ts" generics="TData, TValue">
	import type { Column } from '@tanstack/table-core';
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import * as Command from '$lib/components/ui/command';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { ArrowUpDown, ArrowUp, ArrowDown, ListFilter } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		column: Column<TData, TValue>;
		title: string;
		sortable?: boolean;
		filterable?: boolean;
	};

	let { column, title, sortable = true, filterable = true }: Props = $props();

	const facetedUniqueValues = $derived(column.getFacetedUniqueValues());
	const filterValue = $derived(column.getFilterValue() as any[] | undefined);
	const uniqueValues = $derived(
		facetedUniqueValues ? Array.from(facetedUniqueValues.keys()).sort() : []
	);
	const isSorted = $derived(column.getIsSorted());

	// Helper function to get display value for filter options
	function getDisplayValue(value: any): string {
		if (value === '__empty__') {
			return m.participantsNoRoles();
		}
		return String(value || '-');
	}

	// Helper function to get the actual filter value (translate display back to internal)
	function getFilterValueForSelection(value: any): any {
		// If the display shows "No roles assigned", we need to filter by the __empty__ key
		if (value === '__empty__') {
			return m.participantsNoRoles();
		}
		return value;
	}
</script>

{#if sortable && filterable}
	<div class="flex items-center gap-2">
		<Button
			variant="ghost"
			size="sm"
			class="-ml-3 h-8 data-[state=open]:bg-accent"
			onclick={() => {
				column.toggleSorting(isSorted === 'asc');
			}}
		>
			<span>{title}</span>
			{#if isSorted === 'asc'}
				<ArrowUp class="ml-2 h-4 w-4" />
			{:else if isSorted === 'desc'}
				<ArrowDown class="ml-2 h-4 w-4" />
			{:else}
				<ArrowUpDown class="ml-2 h-4 w-4" />
			{/if}
		</Button>

		<Popover.Root>
			<Popover.Trigger
				class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 h-8 px-2 data-[state=open]:bg-accent"
			>
				{#if filterValue && filterValue.length > 0}
					<div
						class="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground"
					>
						{filterValue.length}
					</div>
				{:else}
					<ListFilter class="h-4 w-4" />
				{/if}
			</Popover.Trigger>
			<Popover.Content class="w-[200px] p-0" align="start">
				<Command.Root>
					<Command.Input placeholder={`Filter ${title.toLowerCase()}...`} />
					<Command.List>
						<Command.Empty>No results found.</Command.Empty>
						<Command.Group>
							{#each uniqueValues as value}
								{@const actualFilterValue = getFilterValueForSelection(value)}
								{@const isSelected = filterValue?.includes(actualFilterValue) ?? false}
								{@const count = facetedUniqueValues?.get(value) ?? 0}
								<Command.Item
									value={String(value)}
									onSelect={() => {
										const currentFilter = filterValue || [];
										if (isSelected) {
											column.setFilterValue(currentFilter.filter((v) => v !== actualFilterValue));
										} else {
											column.setFilterValue([...currentFilter, actualFilterValue]);
										}
									}}
								>
									<div class="flex items-center gap-2 w-full">
										<Checkbox checked={isSelected} />
										<span class="flex-1 truncate">{getDisplayValue(value)}</span>
										<span class="text-xs text-muted-foreground">({count})</span>
									</div>
								</Command.Item>
							{/each}
						</Command.Group>
						{#if filterValue && filterValue.length > 0}
							<Command.Separator />
							<Command.Group>
								<Command.Item
									onselect={() => {
										column.setFilterValue(undefined);
									}}
									class="justify-center text-center"
								>
									Clear filter
								</Command.Item>
							</Command.Group>
						{/if}
					</Command.List>
				</Command.Root>
			</Popover.Content>
		</Popover.Root>
	</div>
{:else if sortable}
	<Button
		variant="ghost"
		size="sm"
		class="-ml-3 h-8 data-[state=open]:bg-accent"
		onclick={() => {
			column.toggleSorting(isSorted === 'asc');
		}}
	>
		<span>{title}</span>
		{#if isSorted === 'asc'}
			<ArrowUp class="ml-2 h-4 w-4" />
		{:else if isSorted === 'desc'}
			<ArrowDown class="ml-2 h-4 w-4" />
		{:else}
			<ArrowUpDown class="ml-2 h-4 w-4" />
		{/if}
	</Button>
{:else}
	<span class="text-sm font-medium">{title}</span>
{/if}
