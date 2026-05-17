<script lang="ts">
	import { fontSizeStore } from '$lib/stores/font-size.svelte';
	import { Button } from '$lib/components/ui/button';
	import { ALargeSmall } from '@lucide/svelte';
	import { fontSizeInlineL, fontSizeInlineLabel, fontSizeInlineM, fontSizeInlineS, fontSizeInlineXl, fontSizeInlineXs } from '$lib/paraglide/messages';

	const currentSize = $derived(fontSizeStore.current);

	const options = [
		{ value: 'xs' as const, label: fontSizeInlineXs() },
		{ value: 'small' as const, label: fontSizeInlineS() },
		{ value: 'medium' as const, label: fontSizeInlineM() },
		{ value: 'large' as const, label: fontSizeInlineL() },
		{ value: 'xl' as const, label: fontSizeInlineXl() }
	];
</script>

<div class="flex items-center justify-between">
	<div class="flex items-center gap-2 text-sm">
		<ALargeSmall class="h-4 w-4" />
		<span>{fontSizeInlineLabel()}</span>
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
