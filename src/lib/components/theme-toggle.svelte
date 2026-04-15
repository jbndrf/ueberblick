<script lang="ts">
	import { themeStore } from '$lib/stores/theme.svelte';
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import { Sun, Moon } from 'lucide-svelte';

	function toggleTheme() {
		themeStore.toggle();
	}
</script>

<Button
	variant="outline"
	size="icon"
	onclick={toggleTheme}
	aria-label={themeStore.isDark ? (m.switchToLightMode?.() ?? 'Switch to light mode') : (m.switchToDarkMode?.() ?? 'Switch to dark mode')}
>
	{#if themeStore.isDark}
		<Sun class="h-5 w-5" />
	{:else}
		<Moon class="h-5 w-5" />
	{/if}
</Button>
