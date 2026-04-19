<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import { ArrowLeft } from 'lucide-svelte';

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

	<article class="prose prose-slate dark:prose-invert max-w-none">
		<h1>{data.page.title}</h1>
		{@html data.page.content}
	</article>
</div>
