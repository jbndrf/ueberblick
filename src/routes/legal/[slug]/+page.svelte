<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import { ArrowLeft } from '@lucide/svelte';
	import { sanitizeHtml } from '$lib/sanitize-html';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.page.title}</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-4 py-8 sm:py-12">
	<div class="mb-6">
		<Button variant="ghost" size="sm" href="/" class="-ml-2">
			<ArrowLeft class="mr-1 h-4 w-4" />
			{m.legalBack?.() ?? 'Back'}
		</Button>
	</div>

	<article class="info-content break-words">
		{@html sanitizeHtml(data.page.content)}
	</article>
</div>
