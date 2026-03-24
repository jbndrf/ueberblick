<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import { FileText, Plus, Pencil, Trash2 } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';

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

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold">{m.infoPagesTitle()}</h1>
			<p class="text-muted-foreground">{m.infoPagesDescription()}</p>
		</div>
		<Button onclick={openCreate}>
			<Plus class="mr-2 h-4 w-4" />
			{m.infoPagesCreate()}
		</Button>
	</div>

	{#if data.infoPages.length === 0}
		<div class="rounded-lg border border-dashed p-8 text-center">
			<FileText class="mx-auto h-12 w-12 text-muted-foreground" />
			<h3 class="mt-2 text-sm font-semibold">{m.infoPagesEmpty()}</h3>
			<p class="mt-1 text-sm text-muted-foreground">{m.infoPagesEmptyDescription()}</p>
		</div>
	{:else}
		<div class="space-y-3">
			{#each data.infoPages as page}
				<div class="rounded-lg border p-4">
					<div class="flex items-start justify-between gap-4">
						<div class="flex items-start gap-3 min-w-0">
							<FileText class="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
							<div class="min-w-0">
								<h3 class="font-medium">{page.title}</h3>
								<p class="mt-1 text-sm text-muted-foreground line-clamp-2">
									{@html page.content}
								</p>
								<p class="mt-1 text-xs text-muted-foreground">
									{m.infoPagesSort()}: {page.sort_order || 0}
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
									action="?/delete"
									use:enhance={() => {
										return async ({ result }) => {
											if (result.type === 'success') {
												toast.success(m.infoPagesDeleteSuccess());
												deleteConfirmId = null;
												await invalidateAll();
											} else {
												toast.error(m.infoPagesDeleteError());
											}
										};
									}}
								>
									<input type="hidden" name="id" value={page.id} />
									<Button variant="destructive" size="sm" type="submit">
										{m.commonDelete()}
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
</div>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>
				{editingPage ? m.infoPagesEdit() : m.infoPagesCreate()}
			</Dialog.Title>
		</Dialog.Header>

		<form
			method="POST"
			action={editingPage ? '?/update' : '?/create'}
			class="space-y-4"
			use:enhance={() => {
				return async ({ result }) => {
					if (result.type === 'success') {
						toast.success(editingPage ? m.infoPagesUpdateSuccess() : m.infoPagesCreateSuccess());
						dialogOpen = false;
						editingPage = null;
						await invalidateAll();
					} else {
						toast.error(editingPage ? m.infoPagesUpdateError() : m.infoPagesCreateError());
					}
				};
			}}
		>
			{#if editingPage}
				<input type="hidden" name="id" value={editingPage.id} />
			{/if}

			<div class="space-y-2">
				<Label for="title">{m.infoPagesFieldTitle()}</Label>
				<Input
					id="title"
					name="title"
					required
					placeholder={m.infoPagesFieldTitlePlaceholder()}
					value={editingPage?.title ?? ''}
				/>
			</div>

			<div class="space-y-2">
				<Label for="content">{m.infoPagesFieldContent()}</Label>
				<Textarea
					id="content"
					name="content"
					required
					rows={8}
					placeholder={m.infoPagesFieldContentPlaceholder()}
					value={editingPage?.content ?? ''}
				/>
				<p class="text-xs text-muted-foreground">{m.infoPagesContentHint()}</p>
			</div>

			<div class="space-y-2">
				<Label for="sort_order">{m.infoPagesSort()}</Label>
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
					{m.commonCancel()}
				</Button>
				<Button type="submit">
					{editingPage ? m.commonSave() : m.commonCreate()}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
