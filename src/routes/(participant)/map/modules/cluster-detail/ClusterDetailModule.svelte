<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import ModuleShell from '$lib/components/module-shell.svelte';
	import type { WorkflowClusterGroup, WorkflowClusterRow } from '$lib/components/map/supercluster-manager';

	interface Props {
		groups: WorkflowClusterGroup[];
		totalCount: number;
		activeRowKey: string | null;
		activeWorkflowId: string | null;
		isOpen?: boolean;
		onRowTap: (workflowId: string, row: WorkflowClusterRow) => void;
		onClose: () => void;
	}

	let {
		groups,
		totalCount,
		activeRowKey,
		activeWorkflowId,
		isOpen = $bindable(false),
		onRowTap,
		onClose
	}: Props = $props();
</script>

<ModuleShell
	{isOpen}
	title={(m.participantClusterDetailInstancesCount?.({ count: totalCount }) ?? `${totalCount} Instances`)}
	subtitle={(groups.length === 1 ? (m.participantClusterDetailWorkflowSingular?.() ?? 'Workflow') : (m.participantClusterDetailWorkflowPlural?.({ count: groups.length }) ?? `${groups.length} Workflows`))}
	onClose={() => { isOpen = false; onClose(); }}
	mobileHeightPeek={35}
	mobileHeightExpanded={75}
>
	{#snippet content()}
		<div class="flex flex-col gap-4 p-4">
			{#each groups as group, gi (group.workflowId)}
				<div class="flex flex-col gap-1.5">
					<div class="flex items-center justify-between px-1">
						<h4 class="text-sm font-semibold">{group.workflowName}</h4>
						<span class="text-muted-foreground text-xs">{group.totalCount}</span>
					</div>

					{#each group.rows as row (row.key)}
						<button
							class="flex items-center gap-3 rounded-lg p-3 text-left transition-colors
								{activeRowKey === row.key && activeWorkflowId === group.workflowId
								? 'bg-primary/10 ring-primary/30 ring-1'
								: 'bg-muted/30 hover:bg-muted/50 active:bg-muted/70'}"
							onclick={() => onRowTap(group.workflowId, row)}
						>
							<div
								class="h-4 w-4 shrink-0 rounded-full"
								style:background-color={row.color}
							></div>
							<div class="min-w-0 flex-1">
								<span class="block truncate text-sm font-medium">{row.label}</span>
								<span class="text-muted-foreground text-xs">
									{(row.count === 1 ? (m.participantClusterDetailItemSingular?.() ?? 'item') : (m.participantClusterDetailItemPlural?.({ count: row.count }) ?? `${row.count} items`))}
								</span>
							</div>
							<div class="w-20 shrink-0">
								<div class="bg-muted h-2.5 w-full overflow-hidden rounded-full">
									<div
										class="h-full rounded-full transition-all duration-300"
										style:width="{row.percentage}%"
										style:background-color={row.color}
									></div>
								</div>
							</div>
							<span class="text-muted-foreground w-10 shrink-0 text-right text-xs tabular-nums">
								{row.percentage}%
							</span>
						</button>
					{/each}
				</div>

				{#if gi < groups.length - 1}
					<hr class="border-border" />
				{/if}
			{/each}
		</div>
	{/snippet}
</ModuleShell>
