<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { ArrowLeft } from 'lucide-svelte';
	import * as m from '$lib/paraglide/messages';

	type FooterPage = { slug: string; title: string; content: string };

	let {
		visible = false,
		title = '',
		body = '',
		acceptLabel = 'Accept',
		rejectLabel = 'Reject',
		footerPages = [],
		action = '?/setConsent',
		returnTo = ''
	}: {
		visible?: boolean;
		title?: string;
		body?: string;
		acceptLabel?: string;
		rejectLabel?: string;
		footerPages?: FooterPage[];
		action?: string;
		returnTo?: string;
	} = $props();

	let activePage = $state<FooterPage | null>(null);
</script>

{#if visible}
	<div
		class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
		role="dialog"
		aria-modal="true"
		aria-labelledby="consent-heading"
	>
		<div
			class="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border bg-background shadow-xl"
		>
			{#if activePage}
				<div class="flex items-center gap-2 border-b px-4 py-3">
					<Button
						variant="ghost"
						size="sm"
						onclick={() => (activePage = null)}
						class="-ml-2"
					>
						<ArrowLeft class="mr-1 h-4 w-4" />
						{m.consentModalBack?.() ?? 'Back'}
					</Button>
				</div>
				<div class="overflow-y-auto p-6">
					<h2 id="consent-heading" class="mb-4 text-xl font-semibold">{activePage.title}</h2>
					<article class="prose prose-slate dark:prose-invert max-w-none">
						{@html activePage.content}
					</article>
				</div>
			{:else}
				<div class="overflow-y-auto p-6">
					<h1 id="consent-heading" class="mb-4 text-xl font-semibold">
						{title || (m.consentModalDefaultTitle?.() ?? 'Cookies & Data Processing')}
					</h1>
					{#if body}
						<div class="prose prose-slate dark:prose-invert max-w-none text-sm">
							{@html body}
						</div>
					{:else}
						<p class="text-sm text-muted-foreground">
							{m.consentModalDefaultBody?.() ??
								'This application uses only technically necessary cookies for login and settings. No tracking or analytics is performed.'}
						</p>
					{/if}
				</div>

				{#if footerPages.length > 0}
					<div class="flex flex-wrap gap-x-4 gap-y-1 border-t bg-muted/30 px-6 py-3 text-xs">
						{#each footerPages as page (page.slug)}
							<button
								type="button"
								class="text-primary underline-offset-4 hover:underline"
								onclick={() => (activePage = page)}
							>
								{page.title}
							</button>
						{/each}
					</div>
				{/if}

				<form
					method="POST"
					{action}
					class="flex flex-col gap-2 border-t p-4 sm:flex-row sm:justify-end"
				>
					{#if returnTo}
						<input type="hidden" name="returnTo" value={returnTo} />
					{/if}
					<Button type="submit" variant="outline" name="decision" value="rejected">
						{rejectLabel}
					</Button>
					<Button type="submit" name="decision" value="accepted">
						{acceptLabel}
					</Button>
				</form>
			{/if}
		</div>
	</div>
{/if}
