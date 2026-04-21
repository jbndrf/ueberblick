<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { X } from '@lucide/svelte';
	import * as Drawer from '$lib/components/ui/drawer';

	interface Props {
		open: boolean;
		title: string;
		onclose: () => void;
		children: any;
	}

	let { open = $bindable(), title, onclose, children }: Props = $props();

	let isMobile = $state(false);

	function updateDeviceMode() {
		isMobile = window.innerWidth < 1024;
	}

	function close() {
		open = false;
		onclose?.();
	}

	onMount(() => {
		updateDeviceMode();
		window.addEventListener('resize', updateDeviceMode);
		return () => window.removeEventListener('resize', updateDeviceMode);
	});
</script>

{#if isMobile}
	<!-- Mobile: Bottom Drawer -->
	<Drawer.Root bind:open>
		<Drawer.Content>
			<Drawer.Header>
				<Drawer.Title>{title}</Drawer.Title>
			</Drawer.Header>
			<div class="max-h-[60vh] overflow-auto p-4">
				{@render children()}
			</div>
			<Drawer.Footer>
				<Button variant="outline" onclick={close}>Close</Button>
			</Drawer.Footer>
		</Drawer.Content>
	</Drawer.Root>
{:else}
	<!-- Desktop: Side Panel -->
	{#if open}
		<!-- Backdrop -->
		<button
			class="pointer-events-auto fixed inset-0 z-[999] bg-black/20"
			onclick={close}
			aria-label="Close panel"
		></button>

		<!-- Panel -->
		<div
			class="pointer-events-auto fixed right-0 top-0 z-[1001] flex h-full w-96 flex-col border-l bg-background shadow-xl"
		>
			<div class="flex items-center justify-between border-b px-4 py-3">
				<h3 class="font-semibold">{title}</h3>
				<Button onclick={close} variant="ghost" size="icon" class="h-8 w-8">
					<X class="h-4 w-4" />
				</Button>
			</div>
			<ScrollArea class="flex-1">
				<div class="p-4">
					{@render children()}
				</div>
			</ScrollArea>
		</div>
	{/if}
{/if}
