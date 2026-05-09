<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import { FileText, Plus, Pencil, Trash2 } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { stripHtml } from '$lib/sanitize-html';
	import SettingsSection from '../SettingsSection.svelte';

	let { data } = $props();

	let dialogOpen = $state(false);
	let editingPage = $state<any>(null);
	let deleteConfirmId = $state<string | null>(null);

	function openCreate() {
		editingPage = null;
		dialogOpen = true;
	}

	function openEdit(page: any) {
		editingPage = page;
		dialogOpen = true;
	}
</script>

<SettingsSection
	name={m.infoPagesTitle?.() ?? 'Info Pages'}
	description={m.infoPagesDescription?.() ??
		'Manage informational pages shown to participants (e.g. privacy policy, imprint)'}
>
	{#snippet actions()}
		<Button onclick={openCreate}>
			<Plus class="mr-2 h-4 w-4" />
			{m.infoPagesCreate?.() ?? 'Add Info Page'}
		</Button>
	{/snippet}

	{#if data.infoPages.length === 0}
		<div class="rounded-lg border border-dashed p-8 text-center">
			<FileText class="mx-auto h-12 w-12 text-muted-foreground" />
			<h3 class="mt-2 text-sm font-semibold">{m.infoPagesEmpty?.() ?? 'No info pages'}</h3>
			<p class="mt-1 text-sm text-muted-foreground">
				{m.infoPagesEmptyDescription?.() ??
					'Create info pages to display legal or informational content to participants'}
			</p>
		</div>
	{:else}
		<div class="space-y-3">
			{#each data.infoPages as page (page.id)}
				<div class="rounded-lg border p-4">
					<div class="flex items-start justify-between gap-4">
						<div class="flex min-w-0 items-start gap-3">
							<FileText class="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
							<div class="min-w-0">
								<h3 class="font-medium">{page.title}</h3>
								<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">
									{stripHtml(page.content)}
								</p>
								<p class="mt-1 text-xs text-muted-foreground">
									{m.infoPagesSort?.() ?? 'Sort Order'}: {page.sort_order || 0}
								</p>
							</div>
						</div>
						<div class="flex shrink-0 gap-1">
							<Button variant="ghost" size="icon" onclick={() => openEdit(page)}>
								<Pencil class="h-4 w-4" />
							</Button>
							{#if deleteConfirmId === page.id}
								<form
									method="POST"
									action="?/deleteInfoPage"
									use:enhance={() => {
										return async ({ result }) => {
											if (result.type === 'success') {
												toast.success(
													m.infoPagesDeleteSuccess?.() ?? 'Info page deleted successfully'
												);
												deleteConfirmId = null;
												await invalidateAll();
											} else {
												toast.error(m.infoPagesDeleteError?.() ?? 'Failed to delete info page');
											}
										};
									}}
								>
									<input type="hidden" name="id" value={page.id} />
									<Button variant="destructive" size="sm" type="submit">
										{m.commonDelete?.() ?? 'Delete'}
									</Button>
								</form>
							{:else}
								<Button variant="ghost" size="icon" onclick={() => (deleteConfirmId = page.id)}>
									<Trash2 class="h-4 w-4" />
								</Button>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</SettingsSection>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content class="max-h-[85vh] sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>
				{editingPage
					? (m.infoPagesEdit?.() ?? 'Edit Info Page')
					: (m.infoPagesCreate?.() ?? 'Add Info Page')}
			</Dialog.Title>
		</Dialog.Header>

		<form
			method="POST"
			action={editingPage ? '?/updateInfoPage' : '?/createInfoPage'}
			class="flex min-h-0 flex-col gap-4 overflow-y-auto"
			use:enhance={() => {
				return async ({ result }) => {
					if (result.type === 'success') {
						toast.success(
							editingPage
								? (m.infoPagesUpdateSuccess?.() ?? 'Info page updated successfully')
								: (m.infoPagesCreateSuccess?.() ?? 'Info page created successfully')
						);
						dialogOpen = false;
						editingPage = null;
						await invalidateAll();
					} else {
						toast.error(
							editingPage
								? (m.infoPagesUpdateError?.() ?? 'Failed to update info page')
								: (m.infoPagesCreateError?.() ?? 'Failed to create info page')
						);
					}
				};
			}}
		>
			{#if editingPage}
				<input type="hidden" name="id" value={editingPage.id} />
			{/if}

			<div class="space-y-2">
				<Label for="title">{m.infoPagesFieldTitle?.() ?? 'Title'}</Label>
				<Input
					id="title"
					name="title"
					required
					placeholder={m.infoPagesFieldTitlePlaceholder?.() ?? 'e.g. Privacy Policy, Imprint'}
					value={editingPage?.title ?? ''}
				/>
			</div>

			<div class="space-y-2">
				<Label for="content">{m.infoPagesFieldContent?.() ?? 'Content'}</Label>
				<Textarea
					id="content"
					name="content"
					required
					rows={8}
					class="max-h-[40vh]"
					placeholder={m.infoPagesFieldContentPlaceholder?.() ?? 'HTML content of the page...'}
					value={editingPage?.content ?? ''}
				/>
				<p class="text-xs text-muted-foreground">
					{m.infoPagesContentHint?.() ??
						'HTML is supported. You can use tags for links, paragraphs, bold, italic, lists, and headings.'}
				</p>
			</div>

			<div class="space-y-2">
				<Label for="sort_order">{m.infoPagesSort?.() ?? 'Sort Order'}</Label>
				<Input
					id="sort_order"
					name="sort_order"
					type="number"
					min="0"
					value={editingPage?.sort_order ?? 0}
				/>
			</div>

			<Dialog.Footer>
				<Button variant="outline" type="button" onclick={() => (dialogOpen = false)}>
					{m.commonCancel?.() ?? 'Cancel'}
				</Button>
				<Button type="submit">
					{editingPage ? (m.commonSave?.() ?? 'Save') : (m.commonCreate?.() ?? 'Create')}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
