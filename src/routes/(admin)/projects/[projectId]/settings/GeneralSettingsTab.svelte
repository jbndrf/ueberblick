<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import { FileText, Plus, Pencil, Trash2, Upload, X, Image } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	// Info pages state
	let dialogOpen = $state(false);
	let editingPage = $state<any>(null);
	let deleteConfirmId = $state<string | null>(null);

	// Icon upload state
	let iconFileInput = $state<HTMLInputElement | null>(null);
	let iconPreview = $state<string | null>(null);
	let isUploadingIcon = $state(false);

	// Display name state
	let displayName = $state(data.displayName ?? '');
	let isSavingDisplayName = $state(false);

	function openCreate() {
		editingPage = null;
		dialogOpen = true;
	}

	function openEdit(page: any) {
		editingPage = page;
		dialogOpen = true;
	}

	function handleIconPreview(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = () => {
				iconPreview = reader.result as string;
			};
			reader.readAsDataURL(file);
		}
	}
</script>

<div class="space-y-8">
	<!-- App Branding Section -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				<Image class="h-5 w-5" />
				{m.settingsAppBranding()}
			</Card.Title>
			<Card.Description>{m.settingsAppBrandingDescription()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<div class="flex items-start gap-6">
				<!-- Current Icon Preview -->
				<div class="shrink-0">
					{#if iconPreview}
						<img src={iconPreview} alt="Icon preview" class="h-20 w-20 rounded-lg border object-cover" />
					{:else if data.iconUrl}
						<img src={data.iconUrl} alt="Project icon" class="h-20 w-20 rounded-lg border object-cover" />
					{:else}
						<div class="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed bg-muted/50">
							<Image class="h-8 w-8 text-muted-foreground" />
						</div>
					{/if}
				</div>

				<!-- Upload Form & Display Name -->
				<div class="flex-1 space-y-4">
					<!-- Display Name -->
					<form
						method="POST"
						action="?/updateDisplayName"
						use:enhance={() => {
							isSavingDisplayName = true;
							return async ({ result }) => {
								isSavingDisplayName = false;
								if (result.type === 'success') {
									toast.success(m.commonSave());
									await invalidateAll();
								} else {
									toast.error('Failed to save display name');
								}
							};
						}}
					>
						<div class="space-y-2">
							<Label for="display_name">{m.settingsDisplayName()}</Label>
							<div class="flex items-center gap-3">
								<Input
									id="display_name"
									name="display_name"
									bind:value={displayName}
									placeholder={data.project.name}
									class="max-w-xs"
								/>
								<Button type="submit" size="sm" disabled={isSavingDisplayName}>
									{m.commonSave()}
								</Button>
							</div>
							<p class="text-xs text-muted-foreground">{m.settingsDisplayNameHint()}</p>
						</div>
					</form>

					<!-- Icon Upload -->
					<form
						method="POST"
						action="?/updateAppIcon"
						enctype="multipart/form-data"
						use:enhance={() => {
							isUploadingIcon = true;
							return async ({ result }) => {
								isUploadingIcon = false;
								if (result.type === 'success') {
									toast.success(m.settingsUploadIcon());
									iconPreview = null;
									await invalidateAll();
								} else {
									toast.error('Failed to upload icon');
								}
							};
						}}
					>
						<div class="space-y-2">
							<Label>{m.settingsUploadIcon()}</Label>
							<div class="flex items-center gap-3">
								<Input
									type="file"
									name="icon"
									accept="image/png,image/jpeg,image/svg+xml,image/webp"
									bind:ref={iconFileInput}
									onchange={handleIconPreview}
									class="max-w-xs"
								/>
								<Button type="submit" size="sm" disabled={isUploadingIcon || !iconPreview}>
									<Upload class="mr-2 h-4 w-4" />
									{m.settingsUploadIcon()}
								</Button>
							</div>
						</div>
					</form>
					<p class="text-xs text-muted-foreground">{m.settingsIconHint()}</p>

					{#if data.iconUrl}
						<form
							method="POST"
							action="?/removeAppIcon"
							use:enhance={() => {
								return async ({ result }) => {
									if (result.type === 'success') {
										toast.success(m.settingsRemoveIcon());
										iconPreview = null;
										await invalidateAll();
									} else {
										toast.error('Failed to remove icon');
									}
								};
							}}
						>
							<Button type="submit" variant="ghost" size="sm" class="text-destructive">
								<X class="mr-2 h-4 w-4" />
								{m.settingsRemoveIcon()}
							</Button>
						</form>
					{/if}
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Info Pages Section -->
	<Card.Root>
		<Card.Header>
			<div class="flex items-center justify-between">
				<div>
					<Card.Title class="flex items-center gap-2">
						<FileText class="h-5 w-5" />
						{m.infoPagesTitle()}
					</Card.Title>
					<Card.Description>{m.infoPagesDescription()}</Card.Description>
				</div>
				<Button onclick={openCreate}>
					<Plus class="mr-2 h-4 w-4" />
					{m.infoPagesCreate()}
				</Button>
			</div>
		</Card.Header>
		<Card.Content>
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
											action="?/deleteInfoPage"
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
		</Card.Content>
	</Card.Root>
</div>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content class="max-h-[85vh] sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>
				{editingPage ? m.infoPagesEdit() : m.infoPagesCreate()}
			</Dialog.Title>
		</Dialog.Header>

		<form
			method="POST"
			action={editingPage ? '?/updateInfoPage' : '?/createInfoPage'}
			class="flex min-h-0 flex-col gap-4 overflow-y-auto"
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
					class="max-h-[40vh]"
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
