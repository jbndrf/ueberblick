<script lang="ts">
	import { setLocale, getLocale } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { Languages, Check } from 'lucide-svelte';

	let currentLocale = $state(getLocale());

	const languageOptions = [
		{ value: 'en', label: m.languageSwitcherEnglish?.() ?? 'English' },
		{ value: 'de', label: m.languageSwitcherDeutsch?.() ?? 'Deutsch' }
	] as const;

	function handleLocaleChange(value: string) {
		setLocale(value as 'en' | 'de');
		currentLocale = value as 'en' | 'de';
	}

	const currentLabel = $derived(
		languageOptions.find((l) => l.value === currentLocale)?.label || (m.languageSwitcherEnglish?.() ?? 'English')
	);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline" size="sm" class="gap-2">
				<Languages class="h-4 w-4" />
				{currentLabel}
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-36">
		<DropdownMenu.RadioGroup value={currentLocale} onValueChange={handleLocaleChange}>
			{#each languageOptions as option}
				<DropdownMenu.RadioItem value={option.value}>
					{option.label}
				</DropdownMenu.RadioItem>
			{/each}
		</DropdownMenu.RadioGroup>
	</DropdownMenu.Content>
</DropdownMenu.Root>
