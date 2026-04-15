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
				{m.settingsAppBranding?.() ?? 'App Branding'}
			</Card.Title>
			<Card.Description>{m.settingsAppBrandingDescription?.() ?? 'Customize the icon and name shown in the participant app'}</Card.Description>
		</Card.Header>
		<Card.Content>
			<div class="flex items-start gap-6">
				<!-- Current Icon Preview -->
				<div class="shrink-0">
					{#if iconPreview}
						<img src={iconPreview} alt={m.generalSettingsIconPreviewAlt?.() ?? 'Icon preview'} class="h-20 w-20 rounded-lg border object-cover" />
					{:else if data.iconUrl}
						<img src={data.iconUrl} alt={m.generalSettingsProjectIconAlt?.() ?? 'Project icon'} class="h-20 w-20 rounded-lg border object-cover" />
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
									toast.success(m.generalSettingsDisplayNameSaved?.() ?? 'Display name saved');
									await invalidateAll();
								} else {
									toast.error(m.generalSettingsDisplayNameSaveError?.() ?? 'Failed to save display name');
								}
							};
						}}
					>
						<div class="space-y-2">
							<Label for="display_name">{m.settingsDisplayName?.() ?? 'App Name'}</Label>
							<div class="flex items-center gap-3">
								<Input
									id="display_name"
									name="display_name"
									bind:value={displayName}
									placeholder={data.project.name}
									class="max-w-xs"
								/>
								<Button type="submit" size="sm" disabled={isSavingDisplayName}>
									{m.commonSave?.() ?? 'Save'}
								</Button>
							</div>
							<p class="text-xs text-muted-foreground">{m.settingsDisplayNameHint?.() ?? 'Name shown in the participant app header. Leave empty to use the project name.'}</p>
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
									toast.success(m.generalSettingsIconUploaded?.() ?? 'Icon uploaded');
									iconPreview = null;
									await invalidateAll();
								} else {
									toast.error(m.generalSettingsIconUploadError?.() ?? 'Failed to upload icon');
								}
							};
						}}
					>
						<div class="space-y-2">
							<Label>{m.settingsUploadIcon?.() ?? 'Upload Icon'}</Label>
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
									{m.settingsUploadIcon?.() ?? 'Upload Icon'}
								</Button>
							</div>
						</div>
					</form>
					<p class="text-xs text-muted-foreground">{m.settingsIconHint?.() ?? 'PNG, JPG, SVG, or WebP. Max 2MB.'}</p>

					{#if data.iconUrl}
						<form
							method="POST"
							action="?/removeAppIcon"
							use:enhance={() => {
								return async ({ result }) => {
									if (result.type === 'success') {
										toast.success(m.generalSettingsIconRemoved?.() ?? 'Icon removed');
										iconPreview = null;
										await invalidateAll();
									} else {
										toast.error(m.generalSettingsIconRemoveError?.() ?? 'Failed to remove icon');
									}
								};
							}}
						>
							<Button type="submit" variant="ghost" size="sm" class="text-destructive">
								<X class="mr-2 h-4 w-4" />
								{m.settingsRemoveIcon?.() ?? 'Remove Icon'}
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
						{m.infoPagesTitle?.() ?? 'Info Pages'}
					</Card.Title>
					<Card.Description>{m.infoPagesDescription?.() ?? 'Manage informational pages shown to participants (e.g. privacy policy, imprint)'}</Card.Description>
				</div>
				<Button onclick={openCreate}>
					<Plus class="mr-2 h-4 w-4" />
					{m.infoPagesCreate?.() ?? 'Add Info Page'}
				</Button>
			</div>
		</Card.Header>
		<Card.Content>
			{#if data.infoPages.length === 0}
				<div class="rounded-lg border border-dashed p-8 text-center">
					<FileText class="mx-auto h-12 w-12 text-muted-foreground" />
					<h3 class="mt-2 text-sm font-semibold">{m.infoPagesEmpty?.() ?? 'No info pages'}</h3>
					<p class="mt-1 text-sm text-muted-foreground">{m.infoPagesEmptyDescription?.() ?? 'Create info pages to display legal or informational content to participants'}</p>
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
														toast.success(m.infoPagesDeleteSuccess?.() ?? 'Info page deleted successfully');
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
		</Card.Content>
	</Card.Root>
</div>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content class="max-h-[85vh] sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>
				{editingPage ? (m.infoPagesEdit?.() ?? 'Edit Info Page') : (m.infoPagesCreate?.() ?? 'Add Info Page')}
			</Dialog.Title>
		</Dialog.Header>

		<form
			method="POST"
			action={editingPage ? '?/updateInfoPage' : '?/createInfoPage'}
			class="flex min-h-0 flex-col gap-4 overflow-y-auto"
			use:enhance={() => {
				return async ({ result }) => {
					if (result.type === 'success') {
						toast.success(editingPage ? (m.infoPagesUpdateSuccess?.() ?? 'Info page updated successfully') : (m.infoPagesCreateSuccess?.() ?? 'Info page created successfully'));
						dialogOpen = false;
						editingPage = null;
						await invalidateAll();
					} else {
						toast.error(editingPage ? (m.infoPagesUpdateError?.() ?? 'Failed to update info page') : (m.infoPagesCreateError?.() ?? 'Failed to create info page'));
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
				<p class="text-xs text-muted-foreground">{m.infoPagesContentHint?.() ?? 'HTML is supported. You can use tags for links, paragraphs, bold, italic, lists, and headings.'}</p>
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
