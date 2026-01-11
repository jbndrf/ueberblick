<script lang="ts">
	import { setLocale, getLocale } from '$lib/paraglide/runtime';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Languages, Check } from 'lucide-svelte';

	let currentLocale = $state(getLocale());

	const languageOptions = [
		{ value: 'en', label: 'English', flag: '🇬🇧' },
		{ value: 'de', label: 'Deutsch', flag: '🇩🇪' }
	] as const;

	function handleLocaleChange(value: string) {
		setLocale(value as 'en' | 'de');
		currentLocale = value as 'en' | 'de';
	}

	const currentLanguage = $derived(
		languageOptions.find((l) => l.value === currentLocale) || languageOptions[0]
	);
</script>

<DropdownMenu.Sub>
	<DropdownMenu.SubTrigger>
		<Languages class="mr-2 h-4 w-4" />
		<span>Language</span>
		<span class="ml-auto text-xs text-muted-foreground">{currentLanguage.flag}</span>
	</DropdownMenu.SubTrigger>
	<DropdownMenu.SubContent>
		{#each languageOptions as option}
			<DropdownMenu.Item onclick={() => handleLocaleChange(option.value)}>
				<span class="mr-2">{option.flag}</span>
				<span>{option.label}</span>
				{#if currentLocale === option.value}
					<Check class="ml-auto h-4 w-4" />
				{/if}
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.SubContent>
</DropdownMenu.Sub>
