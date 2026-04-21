<script lang="ts">
	import { setLocale, getLocale } from '$lib/paraglide/runtime';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Languages, Check } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages';

	let currentLocale = $state(getLocale());

	const languageOptions = [
		{ value: 'en', label: m.languageSelectorDropdownEnglish() },
		{ value: 'de', label: m.languageSelectorDropdownDeutsch() }
	] as const;

	function handleLocaleChange(value: string) {
		setLocale(value as 'en' | 'de');
		currentLocale = value as 'en' | 'de';
	}

	const currentLanguage = $derived(
		languageOptions.find((l) => l.value === currentLocale) ?? languageOptions[0]
	);
</script>

<DropdownMenu.Sub>
	<DropdownMenu.SubTrigger>
		<Languages class="mr-2 h-4 w-4" />
		<span>{m.languageSelectorDropdownLanguage()}</span>
	</DropdownMenu.SubTrigger>
	<DropdownMenu.SubContent>
		{#each languageOptions as option}
			<DropdownMenu.Item onclick={() => handleLocaleChange(option.value)}>
				<span>{option.label}</span>
				{#if currentLocale === option.value}
					<Check class="ml-auto h-4 w-4" />
				{/if}
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.SubContent>
</DropdownMenu.Sub>
