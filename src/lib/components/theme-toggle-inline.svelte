<script lang="ts">
	import { themeStore } from '$lib/stores/theme.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Sun, Moon } from '@lucide/svelte';
	import { themeToggleInlineDarkLabel, themeToggleInlineLabel, themeToggleInlineLightLabel } from '$lib/paraglide/messages';

	const currentTheme = $derived(themeStore.current);
</script>

<div class="flex items-center justify-between">
	<div class="flex items-center gap-2 text-sm">
		{#if currentTheme === 'dark'}
			<Moon class="h-4 w-4" />
		{:else}
			<Sun class="h-4 w-4" />
		{/if}
		<span>{themeToggleInlineLabel?.() ?? 'Theme'}</span>
	</div>
	<div class="flex gap-1">
		<Button
			variant={currentTheme === 'light' ? 'default' : 'outline'}
			size="sm"
			onclick={() => themeStore.set('light')}
		>
			<Sun class="h-3 w-3" />
			{themeToggleInlineLightLabel?.() ?? 'Light'}
		</Button>
		<Button
			variant={currentTheme === 'dark' ? 'default' : 'outline'}
			size="sm"
			onclick={() => themeStore.set('dark')}
		>
			<Moon class="h-3 w-3" />
			{themeToggleInlineDarkLabel?.() ?? 'Dark'}
		</Button>
	</div>
</div>
