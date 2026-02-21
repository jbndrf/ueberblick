<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { Workflow as WorkflowIcon, Hammer, Palette, Copy, Import } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { BaseTable, type BaseColumnConfig } from '$lib/components/admin/base-table';
	import CrudDialogs, { type CrudDialogConfig } from '$lib/components/admin/crud-dialogs.svelte';
	import { createFieldUpdateHandler, createToggleHandler } from '$lib/utils/table-actions';
	import { Label } from '$lib/components/ui/label';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Dialog from '$lib/components/ui/dialog';
	import { ChevronDown } from 'lucide-svelte';
	import WorkflowIconDesigner from '$lib/components/admin/workflow-icon-designer.svelte';
	import { getPocketBase } from '$lib/pocketbase';

	type Workflow = {
		id: string;
		name: string;
		description?: string;
		workflow_type: 'incident' | 'survey';
		is_active: boolean;
		created: string;
		updated?: string;
		project_id: string;
	};

	let { data }: { data: PageData } = $props();

	let tableRef: BaseTable<Workflow>;
	let createDialogOpen = $state(false);
	let editDialogOpen = $state(false);
	let deleteDialogOpen = $state(false);
	let selectedWorkflow = $state<Workflow | null>(null);
	let selectedWorkflowType = $state<'incident' | 'survey'>('incident');

	let duplicating = $state(false);

	// Icon designer state
	let iconDesignerOpen = $state(false);
	let iconDesignerWorkflow = $state<Workflow | null>(null);
	let iconDesignerStages = $state<any[]>([]);
	let iconDesignerWorkflowIconConfig = $state<any>(undefined);
	let iconDesignerFilterMode = $state<'none' | 'stage' | 'field'>('none');
	let iconDesignerFilterFieldOptions = $state<string[]>([]);
	let iconDesignerFilterValueIcons = $state<Record<string, any>>({});

	// Import dialog state
	let importDialogOpen = $state(false);
	let importSelectedProjectId = $state('');
	let importWorkflows = $state<Array<{ id: string; name: string }>>([]);
	let importSelectedWorkflowId = $state('');
	let importLoading = $state(false);
	let importFetchingWorkflows = $state(false);

	async function onImportProjectChange(projectId: string) {
		importSelectedProjectId = projectId;
		importSelectedWorkflowId = '';
		importWorkflows = [];
		if (!projectId) return;

		importFetchingWorkflows = true;
		try {
			const pb = getPocketBase();
			const wfs = await pb.collection('workflows').getFullList({
				filter: `project_id = "${projectId}"`,
				sort: 'name'
			});
			importWorkflows = wfs.map((w: any) => ({ id: w.id, name: w.name }));
		} catch (err) {
			console.error('Error fetching workflows for project:', err);
			toast.error('Failed to load workflows');
		} finally {
			importFetchingWorkflows = false;
		}
	}

	async function handleImport() {
		if (!importSelectedWorkflowId) return;
		importLoading = true;
		try {
			const formData = new FormData();
			formData.append('sourceWorkflowId', importSelectedWorkflowId);
			const response = await fetch('?/importFromProject', {
				method: 'POST',
				body: formData
			});
			const result = await response.json();
			if (result.type === 'success') {
				await invalidateAll();
				toast.success('Workflow imported. Role permissions have been reset and must be configured for this project.');
				importDialogOpen = false;
				importSelectedProjectId = '';
				importSelectedWorkflowId = '';
				importWorkflows = [];
			} else {
				toast.error('Failed to import workflow');
			}
		} catch (err) {
			console.error('Error importing workflow:', err);
			toast.error('Failed to import workflow');
		} finally {
			importLoading = false;
		}
	}

	async function openIconDesigner(workflow: Workflow) {
		try {
			const pb = getPocketBase();
			// Fetch stages, full workflow data, and field tags client-side
			const [stages, fullWorkflow, fieldTagRecords] = await Promise.all([
				pb.collection('workflow_stages').getFullList({
					filter: `workflow_id = "${workflow.id}"`,
					sort: 'stage_order'
				}),
				pb.collection('workflows').getOne(workflow.id),
				pb.collection('tools_field_tags').getFullList({
					filter: `workflow_id = "${workflow.id}"`
				})
			]);
			iconDesignerWorkflow = workflow;
			iconDesignerStages = stages;
			iconDesignerWorkflowIconConfig = (fullWorkflow as any).icon_config?.svgContent
				? (fullWorkflow as any).icon_config
				: undefined;
			iconDesignerFilterValueIcons = (fullWorkflow as any).filter_value_icons || {};

			// Determine filter mode from field tags
			let filterMode: 'none' | 'stage' | 'field' = 'none';
			let filterFieldOptions: string[] = [];

			for (const ft of fieldTagRecords) {
				const mappings = (ft.tag_mappings || []) as Array<{ tagType: string; fieldId: string | null; config: Record<string, unknown> }>;
				const filterable = mappings.find((m) => m.tagType === 'filterable');
				if (!filterable) continue;

				const filterBy = (filterable.config?.filterBy as string) || 'field';
				if (filterBy === 'stage') {
					filterMode = 'stage';
				} else if (filterBy === 'field' && filterable.fieldId) {
					filterMode = 'field';
					// Fetch the form field to get its options
					try {
						const formField = await pb.collection('tools_form_fields').getOne(filterable.fieldId);
						const opts = (formField.field_options as any)?.options || [];
						filterFieldOptions = opts.map((o: any) => o.label || o);
					} catch {
						// Field might have been deleted
					}
				}
			}

			iconDesignerFilterMode = filterMode;
			iconDesignerFilterFieldOptions = filterFieldOptions;
			iconDesignerOpen = true;
		} catch (err) {
			console.error('Error loading icon designer data:', err);
			toast.error('Failed to load workflow data');
		}
	}

	async function handleSaveWorkflowIcon(config: any) {
		if (!iconDesignerWorkflow) return;

		const formData = new FormData();
		formData.append('id', iconDesignerWorkflow.id);
		formData.append('iconConfig', config ? JSON.stringify(config) : '');

		const response = await fetch('?/updateIconConfig', {
			method: 'POST',
			body: formData
		});

		const result = await response.json();
		if (result.type !== 'success') {
			throw new Error('Failed to save');
		}
		await invalidateAll();
	}

	async function handleSaveStageIcon(stageId: string, config: any) {
		const formData = new FormData();
		formData.append('stageId', stageId);
		formData.append('iconConfig', config ? JSON.stringify(config) : '');

		const response = await fetch('?/updateStageIconConfig', {
			method: 'POST',
			body: formData
		});

		const result = await response.json();
		if (result.type !== 'success') {
			throw new Error('Failed to save');
		}
	}

	async function handleSaveFilterValueIcon(value: string, config: any) {
		if (!iconDesignerWorkflow) return;

		// Update local state first
		const updated = { ...iconDesignerFilterValueIcons };
		if (config) {
			updated[value] = config;
		} else {
			delete updated[value];
		}
		iconDesignerFilterValueIcons = updated;

		// Persist to server
		const formData = new FormData();
		formData.append('id', iconDesignerWorkflow.id);
		formData.append('filterValueIcons', JSON.stringify(updated));

		const response = await fetch('?/updateFilterValueIcons', {
			method: 'POST',
			body: formData
		});

		const result = await response.json();
		if (result.type !== 'success') {
			throw new Error('Failed to save');
		}
	}

	// Create reusable update handlers
	const updateField = createFieldUpdateHandler('updateField');
	const toggleStatus = createToggleHandler('toggleStatus', 'is_active');

	// Dialog configuration for CRUD operations
	const dialogConfig: CrudDialogConfig = {
		entityName: 'Workflow',
		fields: [
			{
				name: 'name',
				label: 'Name',
				type: 'text',
				placeholder: 'Enter a descriptive name for this workflow',
				required: true
			},
			{
				name: 'description',
				label: 'Description',
				type: 'textarea',
				placeholder: 'Enter a brief summary of what this workflow accomplishes',
				rows: 3
			}
		],
		createAction: '?/create',
		updateAction: '?/update',
		deleteAction: '?/delete',
		messages: {
			createTitle: 'Create Workflow',
			editTitle: 'Edit Workflow',
			deleteTitle: 'Delete Workflow',
			deleteConfirm:
				'Are you sure you want to delete this workflow? This will also delete all associated stages and actions. This action cannot be undone.',
			createSuccess: 'Workflow created successfully',
			updateSuccess: 'Workflow updated successfully',
			deleteSuccess: 'Workflow deleted successfully',
			createError: 'Failed to create workflow',
			updateError: 'Failed to update workflow',
			deleteError: 'Failed to delete workflow',
			cancel: m.commonCancel(),
			save: m.commonSave(),
			create: 'Create',
			delete: m.commonDelete()
		}
	};

	// Global filter function
	const globalFilterFn = (row: any, _columnId: string, filterValue: string) => {
		const searchValue = String(filterValue).toLowerCase();
		const workflow = row.original;
		return (
			workflow.name.toLowerCase().includes(searchValue) ||
			(workflow.description && workflow.description.toLowerCase().includes(searchValue)) ||
			workflow.workflow_type.toLowerCase().includes(searchValue) ||
			false
		);
	};

	// Define table columns using BaseColumnConfig
	const columns = $derived<BaseColumnConfig<Workflow>[]>([
		{
			id: 'name',
			header: 'Name',
			accessorKey: 'name',
			fieldType: 'text',
			capabilities: {
				editable: true,
				sortable: true,
				filterable: true
			},
			onUpdate: (rowId, value) => updateField(rowId, value, 'name')
		},
		{
			id: 'description',
			header: 'Description',
			accessorKey: 'description',
			fieldType: 'text',
			capabilities: {
				editable: true,
				sortable: true,
				filterable: true
			},
			onUpdate: (rowId, value) => updateField(rowId, value, 'description')
		},
		{
			id: 'workflow_type',
			header: 'Type',
			accessorKey: 'workflow_type',
			fieldType: 'dropdown',
			capabilities: {
				editable: true,
				sortable: true,
				filterable: true
			},
			onUpdate: (rowId, value) => updateField(rowId, value, 'workflow_type'),
			dropdownConfig: {
				options: [
					{ value: 'incident', label: 'Incident' },
					{ value: 'survey', label: 'Survey' }
				]
			},
			cellRenderer: workflowTypeCell
		},
		{
			id: 'is_active',
			header: 'Status',
			accessorKey: 'is_active',
			fieldType: 'boolean',
			capabilities: {
				sortable: true,
				filterable: true,
				editable: false
			},
			booleanConfig: {
				onToggle: toggleStatus
			}
		},
		{
			id: 'created',
			header: 'Created',
			accessorKey: 'created',
			fieldType: 'date',
			capabilities: {
				sortable: true,
				filterable: false,
				editable: false,
				readonly: true
			}
		}
	]);

</script>

{#snippet workflowTypeCell({ value, row, isEditing }: { value: any; row: Workflow; isEditing?: boolean })}
	{#if isEditing}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger asChild>
				{#snippet child({ props })}
					<Button variant="outline" size="sm" class="h-8 w-full justify-between" {...props}>
						{value === 'incident' ? 'Incident' : 'Survey'}
						<ChevronDown class="ml-2 h-3 w-3" />
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content>
				<DropdownMenu.Item
					onclick={async () => {
						await updateField(row.id, 'incident', 'workflow_type');
					}}
				>
					Incident
				</DropdownMenu.Item>
				<DropdownMenu.Item
					onclick={async () => {
						await updateField(row.id, 'survey', 'workflow_type');
					}}
				>
					Survey
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{:else}
		{@const isIncident = value === 'incident'}
		{@const badgeClass = isIncident
			? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
			: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'}
		{@const label = isIncident ? 'Incident' : 'Survey'}
		<span class="inline-flex items-center px-2 py-1 rounded text-xs font-medium {badgeClass}">
			{label}
		</span>
	{/if}
{/snippet}

{#snippet importButton()}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger asChild>
			{#snippet child({ props })}
				<Button variant="outline" size="sm" class="rounded-r-none border-r-0 px-2" {...props}>
					<ChevronDown class="h-4 w-4" />
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="start">
			<DropdownMenu.Item onclick={() => (importDialogOpen = true)}>
				<Import class="mr-2 h-4 w-4" />
				Import from Project
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/snippet}

<div class="flex flex-col gap-6 min-w-0 w-full">
	<!-- Header -->
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Workflows</h1>
		<p class="text-muted-foreground">Manage incident and survey workflows for your project</p>
	</div>

	<!-- Base Table -->
	<BaseTable
		bind:this={tableRef}
		data={data.workflows || []}
		{columns}
		{globalFilterFn}
		getRowId={(row) => row.id}
		enableRowSelection={true}
		enableShiftSelect={true}
		showToolbar={true}
		showEditMode={true}
		editModeLabel="Edit workflows inline"
		emptyMessage="No workflows yet"
		emptySubMessage="Create your first workflow to get started"
		rowActions={{
			header: 'Actions',
			customActions: [
				{
					label: 'Build',
					icon: Hammer,
					onClick: (workflow) => {
						goto(`/projects/${$page.params.projectId}/workflows/${workflow.id}/builder`);
					}
				},
				{
					label: 'Design Icon',
					icon: Palette,
					onClick: (workflow) => {
						setTimeout(() => openIconDesigner(workflow), 0);
					}
				},
				{
					label: 'Duplicate',
					icon: Copy,
					onClick: async (workflow) => {
						if (duplicating) return;
						duplicating = true;
						try {
							const formData = new FormData();
							formData.append('id', workflow.id);
							const response = await fetch('?/duplicate', {
								method: 'POST',
								body: formData
							});
							const result = await response.json();
							if (result.type === 'success') {
								await invalidateAll();
								toast.success(`Workflow duplicated as "Copy of ${workflow.name}"`);
							} else {
								toast.error('Failed to duplicate workflow');
							}
						} catch (err) {
							console.error('Error duplicating workflow:', err);
							toast.error('Failed to duplicate workflow');
						} finally {
							duplicating = false;
						}
					}
				}
			],
			onEdit: (workflow) => {
				selectedWorkflow = workflow;
				editDialogOpen = true;
			},
			onDelete: (workflow) => {
				selectedWorkflow = workflow;
				deleteDialogOpen = true;
			}
		}}
		createAreaPrefix={importButton}
		inlineRowCreation={{
			enabled: true,
			createButtonLabel: 'Create Workflow',
			requiredFields: ['name', 'workflow_type'],
			excludeFields: ['is_active', 'created'],
			onCreateRow: async (rowData) => {
				const formData = new FormData();
				formData.append('name', rowData.name || '');
				formData.append('description', rowData.description || '');
				formData.append('workflow_type', rowData.workflow_type || 'incident');
				formData.append('is_active', 'true');

				const response = await fetch('?/create', {
					method: 'POST',
					body: formData
				});

				const result = await response.json();
				if (result.type === 'success') {
					await invalidateAll();
					toast.success('Workflow created successfully');
				} else {
					toast.error('Failed to create workflow');
					throw new Error('Failed to create workflow');
				}
			}
		}}
	/>
</div>

<!-- CRUD Dialogs (Create, Edit, Delete) -->
<CrudDialogs
	config={dialogConfig}
	bind:createOpen={createDialogOpen}
	bind:editOpen={editDialogOpen}
	bind:deleteOpen={deleteDialogOpen}
	bind:selectedEntity={selectedWorkflow}
	onCreateOpenChange={(open) => {
		createDialogOpen = open;
		if (open) {
			selectedWorkflowType = 'incident';
		}
	}}
	onEditOpenChange={(open) => {
		editDialogOpen = open;
		if (open && selectedWorkflow) {
			selectedWorkflowType = selectedWorkflow.workflow_type;
		}
	}}
	onDeleteOpenChange={(open) => (deleteDialogOpen = open)}
	onEntityChange={(entity) => {
		selectedWorkflow = entity as Workflow | null;
		if (entity) {
			selectedWorkflowType = (entity as Workflow).workflow_type;
		}
	}}
>
	{#snippet additionalFields()}
		<div class="grid gap-2">
			<Label for="workflow_type">Type</Label>
			<select
				id="workflow_type"
				name="workflow_type"
				bind:value={selectedWorkflowType}
				class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
			>
				<option value="incident">Incident Workflow</option>
				<option value="survey">Survey Workflow</option>
			</select>
			<p class="text-xs text-muted-foreground">
				Incident workflows will create a marker on the map. Survey workflows won't.
			</p>
		</div>
	{/snippet}
</CrudDialogs>

<!-- Import from Project Dialog -->
<Dialog.Root bind:open={importDialogOpen} onOpenChange={(open) => {
	if (!open) {
		importSelectedProjectId = '';
		importSelectedWorkflowId = '';
		importWorkflows = [];
	}
}}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Import Workflow from Project</Dialog.Title>
			<Dialog.Description>
				Select a project and workflow to import. Role permissions will be reset and must be configured after import.
			</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-4 py-4">
			<div class="grid gap-2">
				<Label for="import-project">Project</Label>
				<select
					id="import-project"
					value={importSelectedProjectId}
					onchange={(e) => onImportProjectChange(e.currentTarget.value)}
					class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				>
					<option value="">Select a project...</option>
					{#each (data.projects || []).filter((p) => p.id !== $page.params.projectId) as project}
						<option value={project.id}>{project.name}</option>
					{/each}
				</select>
			</div>
			<div class="grid gap-2">
				<Label for="import-workflow">Workflow</Label>
				<select
					id="import-workflow"
					value={importSelectedWorkflowId}
					onchange={(e) => (importSelectedWorkflowId = e.currentTarget.value)}
					disabled={!importSelectedProjectId || importFetchingWorkflows}
					class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
				>
					<option value="">{importFetchingWorkflows ? 'Loading...' : 'Select a workflow...'}</option>
					{#each importWorkflows as wf}
						<option value={wf.id}>{wf.name}</option>
					{/each}
				</select>
			</div>
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (importDialogOpen = false)}>Cancel</Button>
			<Button
				onclick={handleImport}
				disabled={!importSelectedWorkflowId || importLoading}
			>
				{importLoading ? 'Importing...' : 'Import'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Workflow Icon Designer Modal -->
{#if iconDesignerOpen && iconDesignerWorkflow}
	<div class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" onclick={() => {
		iconDesignerOpen = false;
		iconDesignerWorkflow = null;
	}}></div>
	<div class="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]">
		<WorkflowIconDesigner
			workflowName={iconDesignerWorkflow.name}
			initialIconConfig={iconDesignerWorkflowIconConfig}
			stages={iconDesignerStages}
			filterMode={iconDesignerFilterMode}
			filterFieldOptions={iconDesignerFilterFieldOptions}
			filterValueIcons={iconDesignerFilterValueIcons}
			onSaveWorkflowIcon={handleSaveWorkflowIcon}
			onSaveStageIcon={handleSaveStageIcon}
			onSaveFilterValueIcon={handleSaveFilterValueIcon}
			onCancel={() => {
				iconDesignerOpen = false;
				iconDesignerWorkflow = null;
			}}
		/>
	</div>
{/if}
