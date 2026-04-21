<script lang="ts">
	import type { Component } from 'svelte';
	import type { IconProps } from '@lucide/svelte';

	interface NavItem {
		icon: Component<IconProps>;
		label: string;
		value: string;
	}

	interface Props {
		items: NavItem[];
		value: string;
		onchange?: (value: string) => void;
	}

	let { items, value = $bindable(), onchange }: Props = $props();

	function handleClick(itemValue: string) {
		value = itemValue;
		if (onchange) {
			onchange(itemValue);
		}
	}
</script>

<nav
	class="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
>
	<div class="flex h-16 items-center justify-around">
		{#each items as item}
			{@const Icon = item.icon}
			<button
				onclick={() => handleClick(item.value)}
				class="flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors hover:bg-muted/50 {value ===
				item.value
					? 'text-primary'
					: 'text-muted-foreground'}"
			>
				<Icon class="h-5 w-5" />
				<span class="text-xs font-medium">{item.label}</span>
			</button>
		{/each}
	</div>
</nav>
