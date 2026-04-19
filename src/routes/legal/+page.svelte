<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import { ArrowLeft } from 'lucide-svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>{m.legalIndexTitle?.() ?? 'Legal Notices'}</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-4 py-8 sm:py-12">
	<div class="mb-6">
		<Button variant="ghost" size="sm" href="/" class="-ml-2">
			<ArrowLeft class="mr-1 h-4 w-4" />
			{m.legalBack?.() ?? 'Back'}
		</Button>
	</div>

	<h1 class="mb-6 text-2xl font-semibold">{m.legalIndexTitle?.() ?? 'Legal Notices'}</h1>

	<ul class="space-y-2">
		{#each data.pages as page}
			<li>
				<a href={`/legal/${page.slug}`} class="text-primary underline-offset-4 hover:underline">
					{page.title}
				</a>
			</li>
		{/each}
	</ul>
</div>
