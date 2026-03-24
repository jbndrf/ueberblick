<script lang="ts">
	import ModuleShell from '$lib/components/module-shell.svelte';
	import type { ClusterDetail } from '$lib/components/map/supercluster-manager';
	import type { VisualKeyRegistry } from '$lib/components/map/donut-cluster-icon';

	interface Props {
		clusterData: ClusterDetail | null;
		visualKeyRegistry: VisualKeyRegistry;
		isOpen?: boolean;
		onClose: () => void;
	}

	let { clusterData, visualKeyRegistry, isOpen = $bindable(false), onClose }: Props = $props();

	interface BreakdownRow {
		key: string;
		color: string;
		label: string;
		count: number;
		percentage: number;
	}

	const rows = $derived.by<BreakdownRow[]>(() => {
		if (!clusterData) return [];
		const total = clusterData.totalCount;
		return Object.entries(clusterData.counts)
			.map(([key, count]) => {
				const info = visualKeyRegistry.get(key);
				return {
					key,
					color: info?.color || '#9ca3af',
					label: info?.label || key,
					count,
					percentage: Math.round((count / total) * 100)
				};
			})
			.sort((a, b) => b.count - a.count);
	});
</script>

<ModuleShell
	{isOpen}
	title="{clusterData?.totalCount ?? 0} items"
	subtitle={clusterData?.clusterType === 'marker' ? 'Markers' : 'Workflow Instances'}
	onClose={() => { isOpen = false; onClose(); }}
	mobileHeightPeek={25}
	mobileHeightExpanded={60}
>
	{#snippet content()}
		<div class="flex flex-col gap-1 p-4">
			{#each rows as row (row.key)}
				<div class="flex items-center gap-3 rounded-lg px-2 py-1.5">
					<div
						class="h-3 w-3 shrink-0 rounded-full"
						style:background-color={row.color}
					></div>
					<span class="min-w-0 flex-1 truncate text-sm">{row.label}</span>
					<span class="tabular-nums text-muted-foreground shrink-0 text-sm font-medium">
						{row.count}
					</span>
					<div class="h-2 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
						<div
							class="h-full rounded-full transition-all"
							style:width="{row.percentage}%"
							style:background-color={row.color}
						></div>
					</div>
					<span class="tabular-nums text-muted-foreground w-8 shrink-0 text-right text-xs">
						{row.percentage}%
					</span>
				</div>
			{/each}
		</div>
	{/snippet}
</ModuleShell>
