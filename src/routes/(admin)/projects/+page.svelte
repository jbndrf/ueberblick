<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { ChevronDown, EllipsisVertical, Download, Upload } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();
	let fileInput: HTMLInputElement;
	let exporting = $state(false);
	let importing = $state(false);

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
</script>

<input
	bind:this={fileInput}
	type="file"
	accept=".json"
	class="hidden"
	onchange={onFileSelected}
/>

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
