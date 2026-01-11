<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { X } from 'lucide-svelte';
	import { fly } from 'svelte/transition';

	interface Props {
		open: boolean;
		onclose: () => void;
		title: string;
		children: any;
	}

	let { open = $bindable(), onclose, title, children }: Props = $props();
</script>

{#if open}
	<div
		transition:fly={{ x: 300, duration: 200 }}
		class="pointer-events-auto fixed right-0 top-0 z-[1001] hidden h-full w-80 flex-col border-l bg-background shadow-lg lg:flex"
	>
		<div class="flex items-center justify-between border-b px-4 py-3">
			<h3 class="font-semibold">{title}</h3>
			<Button onclick={onclose} variant="ghost" size="icon" class="h-8 w-8">
				<X class="h-4 w-4" />
			</Button>
		</div>
		<div class="flex-1 overflow-auto p-4">
			{@render children()}
		</div>
	</div>
{/if}
