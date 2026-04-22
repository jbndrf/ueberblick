<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { ChevronDown, EllipsisVertical, Download, Upload, Package, FolderArchive } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Progress } from '$lib/components/ui/progress';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { chunkedUpload } from '$lib/upload/chunked-uploader';

	let { data } = $props();
	let fileInput: HTMLInputElement;
	let archiveFileInput: HTMLInputElement;
	let exporting = $state(false);
	let importing = $state(false);
	let exportingArchive = $state(false);
	let importingArchive = $state(false);

	async function handleExport(projectId: string, projectName: string) {
		if (exporting) return;
		exporting = true;
		try {
			const response = await fetch('/projects/export-schema', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ projectId })
			});
			if (!response.ok) {
				throw new Error(`Export failed: ${response.statusText}`);
			}
			const schema = await response.json();
			const blob = new Blob([JSON.stringify(schema, null, 2)], {
				type: 'application/json'
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${projectName.toLowerCase().replace(/\s+/g, '-')}-schema.json`;
			a.click();
			URL.revokeObjectURL(url);
			toast.success(m.projectsExportSuccess?.() ?? 'Project schema exported');
		} catch (err) {
			console.error('Error exporting:', err);
			toast.error(m.projectsExportError?.() ?? 'Failed to export project schema');
		} finally {
			exporting = false;
		}
	}

	async function handleImport(file: File) {
		if (importing) return;
		importing = true;
		try {
			const formData = new FormData();
			formData.append('file', file);
			const response = await fetch('?/importSchema', {
				method: 'POST',
				body: formData
			});
			const result = await response.json();
			if (result.type === 'success') {
				await invalidateAll();
				toast.success(m.projectsImportSuccess?.() ?? 'Project imported successfully');
			} else {
				toast.error(result.data?.message || (m.projectsImportError?.() ?? 'Failed to import project'));
			}
		} catch (err) {
			console.error('Error importing:', err);
			toast.error(m.projectsImportError?.() ?? 'Failed to import project');
		} finally {
			importing = false;
		}
	}

	function onFileSelected(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			handleImport(file);
			input.value = '';
		}
	}

	async function handleExportArchive(projectId: string, projectName: string) {
		if (exportingArchive) return;
		exportingArchive = true;
		try {
			const response = await fetch('/projects/export-archive', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ projectId, includeParticipants: true })
			});
			if (!response.ok) throw new Error(`Export failed: ${response.statusText}`);
			const blob = await response.blob();
			const cd = response.headers.get('Content-Disposition') || '';
			const match = cd.match(/filename="([^"]+)"/);
			const filename = match ? match[1] : `${projectName.toLowerCase().replace(/\s+/g, '-')}.zip`;
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);
			toast.success(m.projectsExportArchiveSuccess?.() ?? 'Project archive exported');
		} catch (err) {
			console.error('Error exporting archive:', err);
			toast.error(m.projectsExportArchiveError?.() ?? 'Failed to export project archive');
		} finally {
			exportingArchive = false;
		}
	}

	let archiveDialogOpen = $state(false);
	let archiveFile = $state<File | null>(null);
	let archiveName = $state('');
	let archivePhase = $state<'idle' | 'uploading' | 'processing' | 'done' | 'failed'>('idle');
	let archivePercent = $state(0);
	let archiveLabel = $state('');
	let archiveError = $state('');

	function resetArchiveDialog() {
		archiveFile = null;
		archiveName = '';
		archivePhase = 'idle';
		archivePercent = 0;
		archiveLabel = '';
		archiveError = '';
		importingArchive = false;
	}

	async function pollImportStatus(importId: string): Promise<'done' | 'failed'> {
		while (true) {
			await new Promise((r) => setTimeout(r, 1000));
			let res: Response;
			try {
				res = await fetch(`/api/project-imports/upload/${importId}/status`);
			} catch {
				continue;
			}
			if (!res.ok) continue;
			const s = (await res.json()) as {
				status: string;
				progress: number;
				label?: string;
				error?: string;
			};
			archivePercent = s.progress;
			archiveLabel = s.label ?? '';
			if (s.status === 'completed') {
				archivePhase = 'done';
				return 'done';
			}
			if (s.status === 'failed') {
				archivePhase = 'failed';
				archiveError = s.error ?? 'Import failed';
				return 'failed';
			}
		}
	}

	async function handleImportArchive() {
		if (!archiveFile || importingArchive) return;
		importingArchive = true;
		archivePhase = 'uploading';
		archivePercent = 0;
		archiveError = '';
		try {
			const { id: importId } = await chunkedUpload({
				file: archiveFile,
				initUrl: '/api/project-imports/upload/init',
				initBody: {
					name: archiveName.trim() || undefined,
					filename: archiveFile.name
				},
				idField: 'importId',
				chunkUrl: (id, i) => `/api/project-imports/upload/${id}/chunk/${i}`,
				chunksUrl: (id) => `/api/project-imports/upload/${id}/chunks`,
				finalizeUrl: (id) => `/api/project-imports/upload/${id}/finalize`,
				onProgress: (p) => {
					archivePercent = p.percent;
					archiveLabel = `${(((p.loaded ?? 0) / 1024 / 1024) | 0)} / ${(((p.total ?? 0) / 1024 / 1024) | 0)} MB`;
				}
			});

			archivePhase = 'processing';
			archivePercent = 0;
			archiveLabel = 'Queued';
			const outcome = await pollImportStatus(importId);

			if (outcome === 'done') {
				await invalidateAll();
				toast.success(m.projectsImportArchiveSuccess?.() ?? 'Project archive imported');
			} else {
				toast.error(archiveError || (m.projectsImportArchiveError?.() ?? 'Failed to import project archive'));
			}
		} catch (err) {
			console.error('Error importing archive:', err);
			archivePhase = 'failed';
			archiveError = err instanceof Error ? err.message : 'Upload failed';
			toast.error(archiveError);
		} finally {
			importingArchive = false;
		}
	}

	function onArchiveFileSelected(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			archiveFile = file;
			archiveDialogOpen = true;
			input.value = '';
		}
	}
</script>

<input
	bind:this={fileInput}
	type="file"
	accept=".json"
	class="hidden"
	onchange={onFileSelected}
/>
<input
	bind:this={archiveFileInput}
	type="file"
	accept=".zip"
	class="hidden"
	onchange={onArchiveFileSelected}
/>

<Dialog.Root
	bind:open={archiveDialogOpen}
	onOpenChange={(o) => {
		if (!o && archivePhase !== 'uploading' && archivePhase !== 'processing') resetArchiveDialog();
	}}
>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{m.projectsImportArchive?.() ?? 'Import full project (ZIP)'}</Dialog.Title>
		</Dialog.Header>
		<div class="space-y-4">
			{#if archiveFile}
				<div class="text-sm text-muted-foreground">
					{archiveFile.name} — {((archiveFile.size / 1024 / 1024) | 0)} MB
				</div>
			{/if}
			{#if archivePhase === 'idle'}
				<div class="space-y-2">
					<Label for="archive-name">Name override (optional)</Label>
					<Input
						id="archive-name"
						bind:value={archiveName}
						placeholder="Leave empty to use archive's project name"
					/>
				</div>
			{:else}
				<div class="space-y-2">
					<div class="text-sm font-medium capitalize">{archivePhase}</div>
					<Progress value={archivePercent} max={100} />
					<div class="text-xs text-muted-foreground">
						{archivePercent}%{archiveLabel ? ` — ${archiveLabel}` : ''}
					</div>
					{#if archiveError}
						<div class="text-sm text-destructive">{archiveError}</div>
					{/if}
				</div>
			{/if}
		</div>
		<Dialog.Footer>
			{#if archivePhase === 'idle'}
				<Button variant="outline" onclick={() => (archiveDialogOpen = false)}>
					{m.commonCancel?.() ?? 'Cancel'}
				</Button>
				<Button onclick={handleImportArchive} disabled={!archiveFile || importingArchive}>
					{m.projectsImportArchive?.() ?? 'Import'}
				</Button>
			{:else if archivePhase === 'done' || archivePhase === 'failed'}
				<Button
					onclick={() => {
						archiveDialogOpen = false;
						resetArchiveDialog();
					}}
				>
					{m.commonClose?.() ?? 'Close'}
				</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<div class="container mx-auto p-6">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-3xl font-bold">{m.navProjects?.() ?? 'Projects'}</h1>
		<div class="flex">
			<Button href="/projects/new" class="rounded-r-none">{m.projectsCreateProject?.() ?? 'Create Project'}</Button>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							class="rounded-l-none border-l border-l-primary-foreground/20 px-2"
							disabled={importing}
						>
							<ChevronDown class="size-4" />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					<DropdownMenu.Item onclick={() => fileInput.click()}>
						<Upload class="mr-2 size-4" />
						{m.projectsImportFromFile?.() ?? 'Import from File'}
					</DropdownMenu.Item>
					<DropdownMenu.Item
						onclick={() => archiveFileInput.click()}
						disabled={importingArchive}
					>
						<FolderArchive class="mr-2 size-4" />
						{m.projectsImportArchive?.() ?? 'Import full project (ZIP)'}
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</div>

	<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
		{#each data.projects as project}
			<Card.Root>
				<Card.Header>
					<div class="flex items-start justify-between">
						<div>
							<Card.Title>{project.name}</Card.Title>
							{#if project.description}
								<Card.Description>{project.description}</Card.Description>
							{:else if project.created}
								<Card.Description>
									{m.projectsCreatedLabel?.() ?? 'Created'}: {new Date(project.created).toLocaleDateString()}
								</Card.Description>
							{/if}
						</div>
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<Button {...props} variant="ghost" size="icon-sm">
										<EllipsisVertical class="size-4" />
									</Button>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end">
								<DropdownMenu.Item
									onclick={() => handleExport(project.id, project.name)}
									disabled={exporting}
								>
									<Download class="mr-2 size-4" />
									{m.projectsExportSchema?.() ?? 'Export Schema'}
								</DropdownMenu.Item>
								<DropdownMenu.Item
									onclick={() => handleExportArchive(project.id, project.name)}
									disabled={exportingArchive}
								>
									<Package class="mr-2 size-4" />
									{m.projectsExportArchive?.() ?? 'Export full project (ZIP)'}
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</div>
				</Card.Header>
				<Card.Content>
					<Button href="/projects/{project.id}/participants" class="w-full">
						{m.projectsOpenProject?.() ?? 'Open Project'}
					</Button>
				</Card.Content>
			</Card.Root>
		{:else}
			<div class="col-span-full text-center">
				<p class="mb-4 text-muted-foreground">
					{m.projectsEmptyState?.() ?? 'No projects found. Create your first project to get started.'}
				</p>
				<Button href="/projects/new">{m.projectsCreateProject?.() ?? 'Create Project'}</Button>
			</div>
		{/each}
	</div>
</div>
