<script lang="ts">
	import { setLocale, getLocale } from '$lib/paraglide/runtime';
	import { Button } from '$lib/components/ui/button';
	import { Languages } from 'lucide-svelte';

	let currentLocale = $state(getLocale());

	function handleLocaleChange(value: string) {
		setLocale(value as 'en' | 'de');
		currentLocale = value as 'en' | 'de';
	}
</script>

<div class="flex items-center justify-between">
	<div class="flex items-center gap-2 text-sm">
		<Languages class="h-4 w-4" />
		<span>Language</span>
	</div>
	<div class="flex gap-1">
		<Button
			variant={currentLocale === 'en' ? 'default' : 'outline'}
			size="sm"
			onclick={() => handleLocaleChange('en')}
		>
			EN
		</Button>
		<Button
			variant={currentLocale === 'de' ? 'default' : 'outline'}
			size="sm"
			onclick={() => handleLocaleChange('de')}
		>
			DE
		</Button>
	</div>
</div>
