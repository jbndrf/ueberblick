<script lang="ts">
	import { fontSizeStore } from '$lib/stores/font-size.svelte';
	import { Button } from '$lib/components/ui/button';
	import { ALargeSmall } from 'lucide-svelte';

	const currentSize = $derived(fontSizeStore.current);

	const options = [
		{ value: 'xs' as const, label: 'XS' },
		{ value: 'small' as const, label: 'S' },
		{ value: 'medium' as const, label: 'M' },
		{ value: 'large' as const, label: 'L' },
		{ value: 'xl' as const, label: 'XL' }
	];
</script>

<div class="flex items-center justify-between">
	<div class="flex items-center gap-2 text-sm">
		<ALargeSmall class="h-4 w-4" />
		<span>Font Size</span>
	</div>
	<div class="flex gap-1">
		{#each options as option}
			<Button
				variant={currentSize === option.value ? 'default' : 'outline'}
				size="sm"
				class="px-2"
				onclick={() => fontSizeStore.set(option.value)}
			>
				{option.label}
			</Button>
		{/each}
	</div>
</div>
