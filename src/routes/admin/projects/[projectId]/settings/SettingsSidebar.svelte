<script lang="ts" module>
	import type { Component } from 'svelte';

	export type SidebarStatus = 'on' | 'off' | 'unavailable' | 'none';
	export type SidebarTone = 'default' | 'destructive';
	export type SidebarItem = {
		id: string;
		label: string;
		icon?: Component;
		status?: SidebarStatus;
		tone?: SidebarTone;
	};
	export type SidebarGroup = {
		caption: string;
		items: SidebarItem[];
	};
</script>

<script lang="ts">
	let {
		groups,
		current,
		onSelect
	}: {
		groups: SidebarGroup[];
		current: string;
		onSelect: (id: string) => void;
	} = $props();
</script>

<nav class="flex w-full flex-col gap-4 md:w-56" aria-label="Settings sections">
	{#each groups as group (group.caption)}
		<div class="space-y-1">
			<div class="px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
				{group.caption}
			</div>
			<ul class="space-y-0.5">
				{#each group.items as item (item.id)}
					{@const active = item.id === current}
					{@const destructive = item.tone === 'destructive'}
					<li>
						<button
							type="button"
							onclick={() => onSelect(item.id)}
							aria-current={active ? 'page' : undefined}
							class="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors {active
								? destructive
									? 'bg-destructive/10 font-medium text-destructive'
									: 'bg-accent font-medium text-accent-foreground'
								: destructive
									? 'text-destructive hover:bg-destructive/10'
									: 'hover:bg-accent/50'}"
						>
							{#if item.icon}
								{@const Icon = item.icon}
								<Icon
									class="h-4 w-4 shrink-0 {destructive ? 'text-destructive' : 'text-muted-foreground'}"
								/>
							{/if}
							<span class="flex-1 truncate">{item.label}</span>
							{#if item.status === 'on'}
								<span class="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true"></span>
							{:else if item.status === 'off'}
								<span
									class="h-2 w-2 shrink-0 rounded-full border border-muted-foreground/40"
									aria-hidden="true"
								></span>
							{:else if item.status === 'unavailable'}
								<span
									class="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/30 opacity-40"
									aria-hidden="true"
								></span>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/each}
</nav>
