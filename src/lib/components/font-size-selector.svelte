<script lang="ts">
	import { fontSizeStore } from '$lib/stores/font-size.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { ALargeSmall, Check } from 'lucide-svelte';

	const currentSize = $derived(fontSizeStore.current);

	const options = [
		{ value: 'xs' as const, label: 'Extra Small' },
		{ value: 'small' as const, label: 'Small' },
		{ value: 'medium' as const, label: 'Medium' },
		{ value: 'large' as const, label: 'Large' },
		{ value: 'xl' as const, label: 'Extra Large' }
	];
</script>

<DropdownMenu.Sub>
	<DropdownMenu.SubTrigger>
		<ALargeSmall class="mr-2 h-4 w-4" />
		<span>Font Size</span>
	</DropdownMenu.SubTrigger>
	<DropdownMenu.SubContent>
		{#each options as option}
			<DropdownMenu.Item onclick={() => fontSizeStore.set(option.value)}>
				<span>{option.label}</span>
				{#if currentSize === option.value}
					<Check class="ml-auto h-4 w-4" />
				{/if}
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.SubContent>
</DropdownMenu.Sub>
