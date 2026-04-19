<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Card from '$lib/components/ui/card';
	import { toast } from 'svelte-sonner';
	import { ExternalLink, Trash2, Plus } from 'lucide-svelte';

	let { data } = $props();

	// Local state for the create-new-page form.
	let newTitle = $state('');
	let newSlug = $state('');
	let newContent = $state('');
	let newShowInFooter = $state(true);

	function savedToast(type: 'success' | 'error', msg: string) {
		if (type === 'success') toast.success(msg);
		else toast.error(msg);
	}
</script>

<div class="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
	<div>
		<h1 class="text-2xl font-semibold">
			{m.instanceSettingsTitle?.() ?? 'Instance Settings'}
		</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			{m.instanceSettingsDescription?.() ??
				'These pages apply instance-wide and are publicly visible. Only the instance owner can edit them.'}
		</p>
	</div>

	<!-- Consent gate + banner configuration -->
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.instanceSettingsConsentTitle?.() ?? 'Cookie Consent Banner'}</Card.Title>
			<Card.Description>
				{m.instanceSettingsConsentDesc?.() ??
					'Configure the consent modal shown before participants log in. Pages marked "Show in consent footer" appear as clickable links inside the modal with a back button.'}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/updateSettings"
				class="space-y-4"
				use:enhance={() => {
					return async ({ result }) => {
						if (result.type === 'success') {
							savedToast('success', m.instanceSettingsSaveSuccess?.() ?? 'Saved.');
							await invalidateAll();
						} else {
							savedToast('error', m.instanceSettingsSaveError?.() ?? 'Save failed.');
						}
					};
				}}
			>
				<input type="hidden" name="id" value={data.settings?.id ?? ''} />

				<div class="flex items-start gap-2">
					<Checkbox
						id="require_consent_before_login"
						name="require_consent_before_login"
						checked={data.settings?.require_consent_before_login ?? false}
					/>
					<div class="space-y-1">
						<Label for="require_consent_before_login">
							{m.instanceSettingsRequireConsent?.() ?? 'Require cookie consent before login'}
						</Label>
						<p class="text-xs text-muted-foreground">
							{m.instanceSettingsRequireConsentHint?.() ??
								'When off, the login page is shown directly (useful for internal deployments).'}
						</p>
					</div>
				</div>

				<div class="space-y-2">
					<Label for="consent_banner_title">
						{m.instanceSettingsBannerTitle?.() ?? 'Banner heading'}
					</Label>
					<Input
						id="consent_banner_title"
						name="consent_banner_title"
						value={data.settings?.consent_banner_title ?? ''}
						placeholder="Consent to Cookies & Data processing"
					/>
				</div>

				<div class="space-y-2">
					<Label for="consent_banner_body">
						{m.instanceSettingsBannerBody?.() ?? 'Banner body (HTML allowed)'}
					</Label>
					<Textarea
						id="consent_banner_body"
						name="consent_banner_body"
						rows={6}
						value={data.settings?.consent_banner_body ?? ''}
						class="font-mono text-xs"
					/>
				</div>

				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="consent_accept_label">
							{m.instanceSettingsAcceptLabel?.() ?? 'Accept button label'}
						</Label>
						<Input
							id="consent_accept_label"
							name="consent_accept_label"
							value={data.settings?.consent_accept_label ?? 'Accept'}
						/>
					</div>
					<div class="space-y-2">
						<Label for="consent_reject_label">
							{m.instanceSettingsRejectLabel?.() ?? 'Reject button label'}
						</Label>
						<Input
							id="consent_reject_label"
							name="consent_reject_label"
							value={data.settings?.consent_reject_label ?? 'Reject'}
						/>
					</div>
				</div>

				<div class="flex justify-end">
					<Button type="submit">{m.instanceSettingsSave?.() ?? 'Save'}</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>

	<!-- Existing legal pages -->
	<div>
		<h2 class="text-lg font-semibold">
			{m.instanceSettingsPagesTitle?.() ?? 'Legal Pages'}
		</h2>
		<p class="mt-1 text-sm text-muted-foreground">
			{m.instanceSettingsPagesDesc?.() ??
				'Each page is reachable at /legal/<slug>. Pages marked "Show in consent footer" appear as links inside the consent modal.'}
		</p>
	</div>

	{#each data.pages as page (page.id)}
		<Card.Root>
			<Card.Header>
				<div class="flex items-center justify-between gap-2">
					<Card.Title>{page.title}</Card.Title>
					<a
						href={`/legal/${page.slug}`}
						target="_blank"
						rel="noopener"
						class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
					>
						/legal/{page.slug}
						<ExternalLink class="h-3 w-3" />
					</a>
				</div>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="?/updatePage"
					class="space-y-4"
					use:enhance={() => {
						return async ({ result }) => {
							if (result.type === 'success') {
								savedToast('success', m.instanceSettingsSaveSuccess?.() ?? 'Saved.');
								await invalidateAll();
							} else {
								savedToast('error', m.instanceSettingsSaveError?.() ?? 'Save failed.');
							}
						};
					}}
				>
					<input type="hidden" name="id" value={page.id} />

					<div class="grid gap-4 sm:grid-cols-[2fr_1fr_auto]">
						<div class="space-y-2">
							<Label for={`title-${page.id}`}>
								{m.instanceSettingsFieldTitle?.() ?? 'Title'}
							</Label>
							<Input
								id={`title-${page.id}`}
								name="title"
								required
								value={page.title}
							/>
						</div>

						<div class="space-y-2">
							<Label for={`slug-${page.id}`}>
								{m.instanceSettingsFieldSlug?.() ?? 'Slug (URL)'}
							</Label>
							<Input
								id={`slug-${page.id}`}
								name="slug"
								required
								value={page.slug}
							/>
						</div>

						<div class="space-y-2">
							<Label for={`sort-${page.id}`}>
								{m.instanceSettingsFieldSortOrder?.() ?? 'Order'}
							</Label>
							<Input
								id={`sort-${page.id}`}
								name="sort_order"
								type="number"
								min="0"
								value={page.sort_order}
							/>
						</div>
					</div>

					<div class="flex items-center gap-2">
						<Checkbox
							id={`footer-${page.id}`}
							name="show_in_consent_footer"
							checked={page.show_in_consent_footer}
						/>
						<Label for={`footer-${page.id}`}>
							{m.instanceSettingsFieldShowInFooter?.() ?? 'Show in consent footer'}
						</Label>
					</div>

					<div class="space-y-2">
						<Label for={`content-${page.id}`}>
							{m.instanceSettingsFieldContent?.() ?? 'Content (HTML allowed)'}
						</Label>
						<Textarea
							id={`content-${page.id}`}
							name="content"
							rows={14}
							value={page.content}
							class="font-mono text-xs"
						/>
					</div>

					<div class="flex justify-between">
						<Button
							type="submit"
							variant="ghost"
							class="text-destructive"
							formaction="?/deletePage"
							onclick={(e) => {
								if (!confirm(m.instanceSettingsDeleteConfirm?.() ?? 'Delete this page?')) {
									e.preventDefault();
								}
							}}
						>
							<Trash2 class="mr-1 h-4 w-4" />
							{m.instanceSettingsDelete?.() ?? 'Delete'}
						</Button>

						<Button type="submit">
							{m.instanceSettingsSave?.() ?? 'Save'}
						</Button>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	{/each}

	<!-- Create new -->
	<Card.Root>
		<Card.Header>
			<Card.Title>
				<Plus class="inline h-5 w-5" />
				{m.instanceSettingsAddPage?.() ?? 'Add legal page'}
			</Card.Title>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/createPage"
				class="space-y-4"
				use:enhance={() => {
					return async ({ result }) => {
						if (result.type === 'success') {
							savedToast('success', m.instanceSettingsCreateSuccess?.() ?? 'Created.');
							newTitle = '';
							newSlug = '';
							newContent = '';
							newShowInFooter = true;
							await invalidateAll();
						} else {
							savedToast('error', m.instanceSettingsCreateError?.() ?? 'Create failed.');
						}
					};
				}}
			>
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="new-title">{m.instanceSettingsFieldTitle?.() ?? 'Title'}</Label>
						<Input id="new-title" name="title" required bind:value={newTitle} />
					</div>
					<div class="space-y-2">
						<Label for="new-slug">
							{m.instanceSettingsFieldSlug?.() ?? 'Slug (URL)'}
						</Label>
						<Input
							id="new-slug"
							name="slug"
							placeholder={m.instanceSettingsFieldSlugHint?.() ?? 'auto from title if empty'}
							bind:value={newSlug}
						/>
					</div>
				</div>

				<div class="flex items-center gap-2">
					<Checkbox
						id="new-footer"
						name="show_in_consent_footer"
						bind:checked={newShowInFooter}
					/>
					<Label for="new-footer">
						{m.instanceSettingsFieldShowInFooter?.() ?? 'Show in consent footer'}
					</Label>
				</div>

				<div class="space-y-2">
					<Label for="new-content">
						{m.instanceSettingsFieldContent?.() ?? 'Content (HTML allowed)'}
					</Label>
					<Textarea
						id="new-content"
						name="content"
						rows={10}
						bind:value={newContent}
						class="font-mono text-xs"
					/>
				</div>

				<div class="flex justify-end">
					<Button type="submit">
						{m.instanceSettingsCreate?.() ?? 'Create page'}
					</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
