<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import { FileText, Plus, Pencil, Trash2, Upload, X, Image, AlertTriangle } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { getPocketBase } from '$lib/pocketbase';

	let { data } = $props();

	// Delete-project flow
	type ProjectDeleteCounts = {
		workflows: number;
		participants: number;
		roles: number;
		mapLayers: number;
		customTables: number;
		infoPages: number;
		offlinePackages: number;
		instances: number;
	};
	let deleteProjectOpen = $state(false);
	let deletingProject = $state(false);
	let projectDeleteCounts = $state<ProjectDeleteCounts | null>(null);
	let projectDeleteCountsLoading = $state(false);
	let projectDeleteConfirmInput = $state('');
	let projectDeleteConfirmOk = $derived.by(() => {
		if (!projectDeleteCounts) return false;
		if (projectDeleteCounts.instances === 0) return true;
		return projectDeleteConfirmInput.trim() === String(projectDeleteCounts.instances);
	});

	async function loadProjectDeleteCounts() {
		projectDeleteCountsLoading = true;
		try {
			const pb = getPocketBase();
			const projectId = data.project.id;
			const filter = `project_id = "${projectId}"`;
			const one = (collection: string, f = filter) =>
				pb.collection(collection).getList(1, 1, { filter: f, skipTotal: false, requestKey: null })
					.then((r) => r.totalItems).catch(() => 0);
			const [workflows, participants, roles, mapLayers, customTables, infoPages, offlinePackages, instances] = await Promise.all([
				one('workflows'),
				one('participants'),
				one('roles'),
				one('map_layers'),
				one('custom_tables'),
				one('info_pages'),
				one('offline_packages'),
				one('workflow_instances', `workflow_id.project_id = "${projectId}"`),
			]);
			projectDeleteCounts = { workflows, participants, roles, mapLayers, customTables, infoPages, offlinePackages, instances };
		} finally {
			projectDeleteCountsLoading = false;
		}
	}

	$effect(() => {
		if (deleteProjectOpen && !projectDeleteCounts && !projectDeleteCountsLoading) {
			void loadProjectDeleteCounts();
		}
		if (!deleteProjectOpen) {
			projectDeleteCounts = null;
			projectDeleteConfirmInput = '';
		}
	});

	async function handleDeleteProject() {
		if (deletingProject) return;
		deletingProject = true;
		try {
			const response = await fetch('?/deleteProject', { method: 'POST', body: new FormData() });
			const result = deserialize(await response.text()) as {
				type: string;
				location?: string;
				data?: { message?: string };
			};
			if (result.type === 'redirect' && result.location) {
				toast.success(m.projectsDeleteSuccess?.() ?? 'Project deleted');
				await goto(result.location);
			} else {
				toast.error(result.data?.message || (m.projectsDeleteError?.() ?? 'Failed to delete project'));
			}
		} catch (err) {
			console.error('Error deleting project:', err);
			toast.error(m.projectsDeleteError?.() ?? 'Failed to delete project');
		} finally {
			deletingProject = false;
			deleteProjectOpen = false;
		}
	}

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

	<!-- Danger Zone -->
	<Card.Root class="border-destructive/50">
		<Card.Header>
			<Card.Title class="flex items-center gap-2 text-destructive">
				<AlertTriangle class="h-5 w-5" />
				{m.settingsDangerZone?.() ?? 'Danger Zone'}
			</Card.Title>
			<Card.Description>
				{m.settingsDangerZoneDescription?.() ?? 'Irreversible actions. Deleting the project removes all of its data permanently.'}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<div class="flex items-center justify-between gap-4">
				<div>
					<div class="font-medium">{m.projectsDelete?.() ?? 'Delete project'}</div>
					<div class="text-sm text-muted-foreground">
						{m.projectsDeleteHint?.({ name: data.project.name }) ?? `Permanently delete "${data.project.name}" and everything it contains.`}
					</div>
				</div>
				<Button variant="destructive" onclick={() => (deleteProjectOpen = true)}>
					<Trash2 class="h-4 w-4 mr-2" />
					{m.projectsDelete?.() ?? 'Delete project'}
				</Button>
			</div>
		</Card.Content>
	</Card.Root>
</div>

<!-- Delete project confirm dialog -->
<AlertDialog.Root bind:open={deleteProjectOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.projectsDeleteTitle?.() ?? 'Delete project'}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.projectsDeleteIntro?.({ name: data.project.name }) ?? `This permanently deletes "${data.project.name}" and everything inside it. This action cannot be undone.`}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<div class="text-sm space-y-3">
			{#if projectDeleteCountsLoading && !projectDeleteCounts}
				<div class="text-muted-foreground">{m.projectsDeleteLoadingCounts?.() ?? 'Loading dependencies…'}</div>
			{:else if projectDeleteCounts}
				{@const c = projectDeleteCounts}
				{@const configRows = [
					{ n: c.workflows, label: m.projectsDeleteCountWorkflows?.({ n: c.workflows }) ?? `${c.workflows} workflows` },
					{ n: c.roles, label: m.projectsDeleteCountRoles?.({ n: c.roles }) ?? `${c.roles} roles` },
					{ n: c.mapLayers, label: m.projectsDeleteCountMapLayers?.({ n: c.mapLayers }) ?? `${c.mapLayers} map layers` },
					{ n: c.customTables, label: m.projectsDeleteCountCustomTables?.({ n: c.customTables }) ?? `${c.customTables} custom tables` },
					{ n: c.infoPages, label: m.projectsDeleteCountInfoPages?.({ n: c.infoPages }) ?? `${c.infoPages} info pages` },
					{ n: c.offlinePackages, label: m.projectsDeleteCountOfflinePackages?.({ n: c.offlinePackages }) ?? `${c.offlinePackages} offline packages` },
				].filter((r) => r.n > 0)}
				{@const dataRows = [
					{ n: c.participants, label: m.projectsDeleteCountParticipants?.({ n: c.participants }) ?? `${c.participants} participants` },
					{ n: c.instances, label: m.projectsDeleteCountInstances?.({ n: c.instances }) ?? `${c.instances} workflow entries` },
				].filter((r) => r.n > 0)}
				{#if configRows.length === 0 && dataRows.length === 0}
					<div class="text-muted-foreground">{m.projectsDeleteNoDependencies?.() ?? 'No associated data.'}</div>
				{:else}
					<div class="font-medium">{m.projectsDeleteAlsoDeleted?.() ?? 'Also deleted:'}</div>
					<ul class="list-disc pl-5 space-y-0.5 text-muted-foreground">
						{#each configRows as r}
							<li>{r.label}</li>
						{/each}
						{#if dataRows.length > 0}
							<li class="font-semibold text-foreground">
								{dataRows.map((r) => r.label).join(' · ')}
							</li>
						{/if}
					</ul>
				{/if}
				{#if c.instances > 0}
					<div class="pt-2 border-t space-y-2">
						<label for="project-delete-confirm" class="block text-sm">
							{m.deleteConfirmPrompt?.() ?? 'To confirm, type the number of workflow entries (shown above) below:'}
						</label>
						<input
							id="project-delete-confirm"
							type="text"
							inputmode="numeric"
							pattern="[0-9]*"
							autocomplete="off"
							bind:value={projectDeleteConfirmInput}
							placeholder={m.deleteConfirmPlaceholder?.() ?? 'Number'}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
				{/if}
			{/if}
		</div>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={deletingProject}>{m.commonCancel?.() ?? 'Cancel'}</AlertDialog.Cancel>
			<AlertDialog.Action
				class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
				onclick={handleDeleteProject}
				disabled={deletingProject || !projectDeleteConfirmOk}
			>
				{m.commonDelete?.() ?? 'Delete'}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

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
