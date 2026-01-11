<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { ComponentType } from 'svelte';

	interface ControlButton {
		icon: ComponentType;
		label: string;
		onclick: () => void;
		active?: boolean;
	}

	interface Props {
		buttons: ControlButton[];
	}

	let { buttons }: Props = $props();
</script>

<div class="pointer-events-auto fixed right-4 top-20 z-[1000] hidden flex-col gap-2 lg:flex">
	{#each buttons as button}
		{@const Icon = button.icon}
		<Button
			onclick={button.onclick}
			variant={button.active ? 'default' : 'secondary'}
			size="icon"
			class="h-10 w-10 shadow-lg"
			title={button.label}
		>
			<Icon class="h-4 w-4" />
		</Button>
	{/each}
</div>
