<script lang="ts">
	import { fontSizeStore } from '$lib/stores/font-size.svelte';
	import { Button } from '$lib/components/ui/button';
	import { ALargeSmall } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages';

	const currentSize = $derived(fontSizeStore.current);

	const options = [
		{ value: 'xs' as const, label: m.fontSizeInlineXs() },
		{ value: 'small' as const, label: m.fontSizeInlineS() },
		{ value: 'medium' as const, label: m.fontSizeInlineM() },
		{ value: 'large' as const, label: m.fontSizeInlineL() },
		{ value: 'xl' as const, label: m.fontSizeInlineXl() }
	];
</script>

<div class="flex items-center justify-between">
	<div class="flex items-center gap-2 text-sm">
		<ALargeSmall class="h-4 w-4" />
		<span>{m.fontSizeInlineLabel()}</span>
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
