<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';
	import { toast } from 'svelte-sonner';
	import { deserialize } from '$app/forms';
	import { getPocketBase } from '$lib/pocketbase';

	type ProjectRef = { id: string; name: string };

	let {
		open = $bindable(false),
		currentProjectId,
		projects,
		onImported
	}: {
		open?: boolean;
		currentProjectId: string;
		projects: Promise<ProjectRef[]> | ProjectRef[];
		onImported: (newWorkflowId: string) => void | Promise<void>;
	} = $props();

	let selectedProjectId = $state('');
	let selectedWorkflowId = $state('');
	let workflows = $state<Array<{ id: string; name: string }>>([]);
	let fetchingWorkflows = $state(false);
	let submitting = $state(false);

	async function onProjectChange(projectId: string) {
		selectedProjectId = projectId;
		selectedWorkflowId = '';
		workflows = [];
		if (!projectId) return;

		fetchingWorkflows = true;
		try {
			const pb = getPocketBase();
			const wfs = await pb.collection('workflows').getFullList({
				filter: `project_id = "${projectId}"`,
				sort: 'name'
			});
			workflows = wfs.map((w: any) => ({ id: w.id, name: w.name }));
		} catch (err) {
			console.error('Error fetching workflows for project:', err);
			toast.error(m.workflowsLoadFailed?.() ?? 'Failed to load workflows');
		} finally {
			fetchingWorkflows = false;
		}
	}

	function reset() {
		selectedProjectId = '';
		selectedWorkflowId = '';
		workflows = [];
	}

	async function handleImport() {
		if (!selectedWorkflowId) return;
		submitting = true;
		try {
			const formData = new FormData();
			formData.append('sourceWorkflowId', selectedWorkflowId);
			const response = await fetch('?/importFromProject', {
				method: 'POST',
				body: formData
			});
			const result = deserialize(await response.text()) as {
				type: string;
				data?: { importedWorkflowId?: string; message?: string };
			};
			if (result.type === 'success') {
				const newId = result.data?.importedWorkflowId ?? '';
				toast.success(m.workflowsImportSuccess?.() ?? 'Workflow imported. Role permissions have been reset and must be configured for this project.');
				open = false;
				reset();
				if (newId) await onImported(newId);
			} else {
				toast.error(result.data?.message || (m.workflowsImportError?.() ?? 'Failed to import workflow'));
			}
		} catch (err) {
			console.error('Error importing workflow:', err);
			toast.error(m.workflowsImportError?.() ?? 'Failed to import workflow');
		} finally {
			submitting = false;
		}
	}
</script>

<Dialog.Root
	bind:open
	onOpenChange={(o) => {
		if (!o) reset();
	}}
>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{m.workflowsImportDialogTitle?.() ?? 'Import Workflow from Project'}</Dialog.Title>
			<Dialog.Description>
				{m.workflowsImportDialogDescription?.() ?? 'Select a project and workflow to import. Role permissions will be reset and must be configured after import.'}
			</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-4 py-4">
			<div class="grid gap-2">
				<Label for="import-project">{m.workflowsImportProjectLabel?.() ?? 'Project'}</Label>
				<select
					id="import-project"
					value={selectedProjectId}
					onchange={(e) => onProjectChange(e.currentTarget.value)}
					class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				>
					<option value="">{m.workflowsImportProjectPlaceholder?.() ?? 'Select a project...'}</option>
					{#await Promise.resolve(projects) then projectsList}
						{#each projectsList.filter((p) => p.id !== currentProjectId) as project}
							<option value={project.id}>{project.name}</option>
						{/each}
					{/await}
				</select>
			</div>
			<div class="grid gap-2">
				<Label for="import-workflow">{m.workflowsImportWorkflowLabel?.() ?? 'Workflow'}</Label>
				<select
					id="import-workflow"
					value={selectedWorkflowId}
					onchange={(e) => (selectedWorkflowId = e.currentTarget.value)}
					disabled={!selectedProjectId || fetchingWorkflows}
					class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
				>
					<option value=""
						>{fetchingWorkflows
							? (m.workflowsImportLoading?.() ?? 'Loading...')
							: (m.workflowsImportWorkflowPlaceholder?.() ?? 'Select a workflow...')}</option
					>
					{#each workflows as wf}
						<option value={wf.id}>{wf.name}</option>
					{/each}
				</select>
			</div>
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>{m.commonCancel?.() ?? 'Cancel'}</Button>
			<Button onclick={handleImport} disabled={!selectedWorkflowId || submitting}>
				{submitting
					? (m.workflowsImportInProgress?.() ?? 'Importing...')
					: (m.workflowsImportButton?.() ?? 'Import')}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
