<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';
	import { Workflow as WorkflowIcon, Hammer } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { BaseTable, type BaseColumnConfig } from '$lib/components/admin/base-table';
	import CrudDialogs, { type CrudDialogConfig } from '$lib/components/admin/crud-dialogs.svelte';
	import { createFieldUpdateHandler, createToggleHandler } from '$lib/utils/table-actions';
	import { Label } from '$lib/components/ui/label';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { ChevronDown } from 'lucide-svelte';

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
