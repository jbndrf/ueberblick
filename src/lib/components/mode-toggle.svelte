<script lang="ts">
	import { themeStore } from '$lib/stores/theme.svelte';
	import { modeToggleDark, modeToggleLight, modeToggleTheme } from '$lib/paraglide/messages';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Sun, Moon, Check } from '@lucide/svelte';

	const currentTheme = $derived(themeStore.current);
</script>

<DropdownMenu.Sub>
	<DropdownMenu.SubTrigger>
		{#if currentTheme === 'dark'}
			<Moon class="mr-2 h-4 w-4" />
		{:else}
			<Sun class="mr-2 h-4 w-4" />
		{/if}
		<span>{modeToggleTheme?.() ?? 'Theme'}</span>
	</DropdownMenu.SubTrigger>
	<DropdownMenu.SubContent>
		<DropdownMenu.Item onclick={() => themeStore.set('light')}>
			<Sun class="mr-2 h-4 w-4" />
			<span>{modeToggleLight?.() ?? 'Light'}</span>
			{#if currentTheme === 'light'}
				<Check class="ml-auto h-4 w-4" />
			{/if}
		</DropdownMenu.Item>
		<DropdownMenu.Item onclick={() => themeStore.set('dark')}>
			<Moon class="mr-2 h-4 w-4" />
			<span>{modeToggleDark?.() ?? 'Dark'}</span>
			{#if currentTheme === 'dark'}
				<Check class="ml-auto h-4 w-4" />
			{/if}
		</DropdownMenu.Item>
	</DropdownMenu.SubContent>
</DropdownMenu.Sub>
