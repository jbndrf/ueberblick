<script lang="ts">
	import { deserialize } from '$app/forms';
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { AlertTriangle, Trash2 } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { getPocketBase } from '$lib/pocketbase';
	import SettingsSection from '../SettingsSection.svelte';

	let { data } = $props();

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
	const projectDeleteConfirmOk = $derived.by(() => {
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
				pb
					.collection(collection)
					.getList(1, 1, { filter: f, skipTotal: false, requestKey: null })
					.then((r) => r.totalItems)
					.catch(() => 0);
			const [
				workflows,
				participants,
				roles,
				mapLayers,
				customTables,
				infoPages,
				offlinePackages,
				instances
			] = await Promise.all([
				one('workflows'),
				one('participants'),
				one('roles'),
				one('map_layers'),
				one('custom_tables'),
				one('info_pages'),
				one('offline_packages'),
				one('workflow_instances', `workflow_id.project_id = "${projectId}"`)
			]);
			projectDeleteCounts = {
				workflows,
				participants,
				roles,
				mapLayers,
				customTables,
				infoPages,
				offlinePackages,
				instances
			};
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
				toast.error(
					result.data?.message || (m.projectsDeleteError?.() ?? 'Failed to delete project')
				);
			}
		} catch (err) {
			console.error('Error deleting project:', err);
			toast.error(m.projectsDeleteError?.() ?? 'Failed to delete project');
		} finally {
			deletingProject = false;
			deleteProjectOpen = false;
		}
	}
</script>

<SettingsSection
	name={m.settingsDangerZone?.() ?? 'Danger Zone'}
	description={m.settingsDangerZoneDescription?.() ??
		'Irreversible actions. Deleting the project removes all of its data permanently.'}
>
	<div class="flex items-center justify-between gap-4 rounded-md border border-destructive/50 p-4">
		<div>
			<div class="flex items-center gap-2 font-medium text-destructive">
				<AlertTriangle class="h-4 w-4" />
				{m.projectsDelete?.() ?? 'Delete project'}
			</div>
			<div class="mt-1 text-sm text-muted-foreground">
				{m.projectsDeleteHint?.({ name: data.project.name }) ??
					`Permanently delete "${data.project.name}" and everything it contains.`}
			</div>
		</div>
		<Button variant="destructive" onclick={() => (deleteProjectOpen = true)}>
			<Trash2 class="mr-2 h-4 w-4" />
			{m.projectsDelete?.() ?? 'Delete project'}
		</Button>
	</div>
</SettingsSection>

<AlertDialog.Root bind:open={deleteProjectOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.projectsDeleteTitle?.() ?? 'Delete project'}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.projectsDeleteIntro?.({ name: data.project.name }) ??
					`This permanently deletes "${data.project.name}" and everything inside it. This action cannot be undone.`}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<div class="space-y-3 text-sm">
			{#if projectDeleteCountsLoading && !projectDeleteCounts}
				<div class="text-muted-foreground">
					{m.projectsDeleteLoadingCounts?.() ?? 'Loading dependencies…'}
				</div>
			{:else if projectDeleteCounts}
				{@const c = projectDeleteCounts}
				{@const configRows = [
					{
						n: c.workflows,
						label:
							m.projectsDeleteCountWorkflows?.({ n: c.workflows }) ?? `${c.workflows} workflows`
					},
					{
						n: c.roles,
						label: m.projectsDeleteCountRoles?.({ n: c.roles }) ?? `${c.roles} roles`
					},
					{
						n: c.mapLayers,
						label:
							m.projectsDeleteCountMapLayers?.({ n: c.mapLayers }) ?? `${c.mapLayers} map layers`
					},
					{
						n: c.customTables,
						label:
							m.projectsDeleteCountCustomTables?.({ n: c.customTables }) ??
							`${c.customTables} custom tables`
					},
					{
						n: c.infoPages,
						label:
							m.projectsDeleteCountInfoPages?.({ n: c.infoPages }) ?? `${c.infoPages} info pages`
					},
					{
						n: c.offlinePackages,
						label:
							m.projectsDeleteCountOfflinePackages?.({ n: c.offlinePackages }) ??
							`${c.offlinePackages} offline packages`
					}
				].filter((r) => r.n > 0)}
				{@const dataRows = [
					{
						n: c.participants,
						label:
							m.projectsDeleteCountParticipants?.({ n: c.participants }) ??
							`${c.participants} participants`
					},
					{
						n: c.instances,
						label:
							m.projectsDeleteCountInstances?.({ n: c.instances }) ??
							`${c.instances} workflow entries`
					}
				].filter((r) => r.n > 0)}
				{#if configRows.length === 0 && dataRows.length === 0}
					<div class="text-muted-foreground">
						{m.projectsDeleteNoDependencies?.() ?? 'No associated data.'}
					</div>
				{:else}
					<div class="font-medium">{m.projectsDeleteAlsoDeleted?.() ?? 'Also deleted:'}</div>
					<ul class="list-disc space-y-0.5 pl-5 text-muted-foreground">
						{#each configRows as r (r.label)}
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
					<div class="space-y-2 border-t pt-2">
						<label for="project-delete-confirm" class="block text-sm">
							{m.deleteConfirmPrompt?.() ??
								'To confirm, type the number of workflow entries (shown above) below:'}
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
			<AlertDialog.Cancel disabled={deletingProject}>
				{m.commonCancel?.() ?? 'Cancel'}
			</AlertDialog.Cancel>
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
