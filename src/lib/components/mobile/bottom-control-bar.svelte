<script lang="ts">
	import type { ComponentType } from 'svelte';

	interface ControlButton {
		icon: ComponentType;
		label: string;
		onclick: () => void;
	}

	interface Props {
		buttons: ControlButton[];
	}

	let { buttons }: Props = $props();
</script>

<div
	class="fixed bottom-0 left-0 right-0 z-[1000] flex items-center justify-around border-t bg-background/95 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden"
>
	{#each buttons as button}
		{@const Icon = button.icon}
		<button
			onclick={button.onclick}
			class="flex h-12 w-12 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
			title={button.label}
		>
			<Icon class="h-5 w-5" />
		</button>
	{/each}
</div>
