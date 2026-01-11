<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import EntitySelector from '$lib/components/entity-selector.svelte';
	import { toast } from 'svelte-sonner';
	import { Settings } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { BaseTable, type BaseColumnConfig } from '$lib/components/admin/base-table';
	import type { CustomTable } from './columns';
	import { formatDistanceToNow } from 'date-fns';

	let { data }: { data: PageData } = $props();

	let tableRef: BaseTable<CustomTable>;
	let createDialogOpen = $state(false);
	let editDialogOpen = $state(false);
	let deleteDialogOpen = $state(false);
	let selectedTable = $state<CustomTable | null>(null);
	let createVisibleToRoles = $state<string[]>([]);
	let editVisibleToRoles = $state<string[]>([]);

	// Update editVisibleToRoles when selectedTable changes
	$effect(() => {
		if (selectedTable) {
			editVisibleToRoles = selectedTable.visible_to_roles || [];
		}
	});

	const globalFilterFn = (row: any, _columnId: string, filterValue: string) => {
		const searchValue = String(filterValue).toLowerCase();
		const customTable = row.original;
		return (
			customTable.table_name.toLowerCase().includes(searchValue) ||
			customTable.display_name.toLowerCase().includes(searchValue) ||
			(customTable.description && customTable.description.toLowerCase().includes(searchValue)) ||
			false
		);
	};

	// Define table columns using BaseColumnConfig
	const columns: BaseColumnConfig<CustomTable>[] = [
		{
			id: 'table_name',
			header: m.customTablesTableName(),
			accessorKey: 'table_name',
			fieldType: 'text',
			capabilities: {
				editable: false,
				readonly: true,
				sortable: true,
				filterable: true
			}
		},
		{
			id: 'display_name',
			header: m.customTablesDisplayName(),
			accessorKey: 'display_name',
			fieldType: 'text',
			capabilities: {
				editable: true,
				sortable: true,
				filterable: true
			},
			onUpdate: async (rowId: string, value: string) => {
				const formData = new FormData();
				formData.append('id', rowId);
				formData.append('field', 'display_name');
				formData.append('value', value);

				const response = await fetch('?/updateField', {
					method: 'POST',
					body: formData
				});

				const result = await response.json();
				if (result.type === 'success') {
					await invalidateAll();
				} else {
					throw new Error(result.data?.message || 'Update failed');
				}
			}
		},
		{
			id: 'description',
			header: m.rolesDescription_field(),
			accessorKey: 'description',
			fieldType: 'text',
			capabilities: {
				editable: true,
				sortable: true,
				filterable: true
			},
			onUpdate: async (rowId: string, value: string) => {
				const formData = new FormData();
				formData.append('id', rowId);
				formData.append('field', 'description');
				formData.append('value', value);

				const response = await fetch('?/updateField', {
					method: 'POST',
					body: formData
				});

				const result = await response.json();
				if (result.type === 'success') {
					await invalidateAll();
				} else {
					throw new Error(result.data?.message || 'Update failed');
				}
			}
		},
		{
			id: 'main_column',
			header: m.customTablesMainColumn(),
			accessorKey: 'main_column',
			fieldType: 'text',
			capabilities: {
				editable: false,
				sortable: true,
				filterable: false
			}
		},
		{
			id: 'visible_to_roles',
			header: m.customTablesVisibleToRoles(),
			accessorFn: (row) => {
				return row.visible_to_roles || [];
			},
			fieldType: 'array',
			capabilities: {
				editable: true,
				sortable: false,
				filterable: false
			},
			entityConfig: {
				getEntityId: (role) => role.id,
				getEntityName: (role) => role.name,
				getEntityDescription: (role) => role.description,
				availableEntities: data.roles,
				allowCreate: false
			},
			onUpdate: async (rowId: string, value: string) => {
				const formData = new FormData();
				formData.append('id', rowId);
				formData.append('field', 'visible_to_roles');
				formData.append('value', value);

				const response = await fetch('?/updateField', {
					method: 'POST',
					body: formData
				});

				const result = await response.json();
				if (result.type === 'success') {
					await invalidateAll();
				} else {
					throw new Error(result.data?.message || 'Update failed');
				}
			}
		},
		{
			id: 'created',
			header: m.customTablesCreated(),
			accessorFn: (row) => {
				try {
					const date = new Date(row.created);
					if (isNaN(date.getTime())) return '-';
					return formatDistanceToNow(date, { addSuffix: true });
				} catch {
					return '-';
				}
			},
			fieldType: 'text',
			capabilities: {
				editable: false,
				sortable: true,
				filterable: false
			}
		}
	];

	function handleSuccess(message: string) {
		createDialogOpen = false;
		editDialogOpen = false;
		deleteDialogOpen = false;
		selectedTable = null;
		invalidateAll();
		toast.success(message);
	}

	function handleError(message: string) {
		toast.error(message);
	}
</script>

<div class="flex flex-col gap-6 min-w-0 w-full">
	<!-- Header -->
	<div>
		<h1 class="text-3xl font-bold tracking-tight">{m.customTablesTitle()}</h1>
		<p class="text-muted-foreground">{m.customTablesDescription()}</p>
	</div>

	<!-- Base Table -->
	<BaseTable
		bind:this={tableRef}
		data={data.customTables}
		{columns}
		{globalFilterFn}
		getRowId={(row) => row.id}
		enableRowSelection={true}
		enableShiftSelect={true}
		showToolbar={true}
		showEditMode={true}
		editModeLabel="Edit tables inline"
		emptyMessage={m.customTablesNoTables()}
		emptySubMessage={m.customTablesCreateYourFirst()}
		rowActions={{
			header: m.rolesActions(),
			onEdit: (table) => {
				selectedTable = table;
				editDialogOpen = true;
			},
			onDelete: (table) => {
				selectedTable = table;
				deleteDialogOpen = true;
			},
			customActions: [
				{
					label: m.customTablesEditStructure() ?? 'Edit Structure',
					icon: Settings,
					onClick: (table) => {
						window.location.href = `/projects/${$page.params.projectId}/custom-tables/${table.id}`;
					}
				}
			]
		}}
		inlineRowCreation={{
			enabled: true,
			createButtonLabel: m.customTablesCreateTable(),
			requiredFields: ['table_name', 'display_name', 'main_column'],
			onCreateRow: async (rowData) => {
				const formData = new FormData();
				formData.append('table_name', rowData.table_name || '');
				formData.append('display_name', rowData.display_name || '');
				formData.append('description', rowData.description || '');
				formData.append('main_column', rowData.main_column || '');

				const response = await fetch('?/create', {
					method: 'POST',
					body: formData
				});

				const result = await response.json();
				if (result.type === 'success') {
					await invalidateAll();
					toast.success(m.customTablesCreateSuccess());
				} else {
					toast.error(m.customTablesCreateError());
					throw new Error('Failed to create table');
				}
			}
		}}
	/>
</div>

<!-- Create Table Dialog -->
<Dialog.Root bind:open={createDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{m.customTablesCreateTable()}</Dialog.Title>
		</Dialog.Header>
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				return async ({ result }) => {
					if (result.type === 'success') {
						handleSuccess(m.customTablesCreateSuccess());
					} else if (result.type === 'failure') {
						handleError(m.customTablesCreateError());
					}
				};
			}}
		>
			<div class="grid gap-4 py-4">
				<div class="grid gap-2">
					<Label for="table_name">{m.customTablesTableName()}</Label>
					<Input
						id="table_name"
						name="table_name"
						placeholder={m.customTablesTableNamePlaceholder()}
						required
					/>
					<p class="text-xs text-muted-foreground">{m.customTablesTableNameValidation()}</p>
				</div>
				<div class="grid gap-2">
					<Label for="display_name">{m.customTablesDisplayName()}</Label>
					<Input
						id="display_name"
						name="display_name"
						placeholder={m.customTablesDisplayNamePlaceholder()}
						required
					/>
				</div>
				<div class="grid gap-2">
					<Label for="description">{m.rolesDescription_field()}</Label>
					<Textarea
						id="description"
						name="description"
						placeholder={m.customTablesDescriptionPlaceholder()}
						rows={3}
					/>
				</div>
				<div class="grid gap-2">
					<Label for="main_column">{m.customTablesMainColumn()}</Label>
					<Input
						id="main_column"
						name="main_column"
						placeholder={m.customTablesMainColumnPlaceholder()}
						required
					/>
					<p class="text-xs text-muted-foreground">{m.customTablesMainColumnHelp()}</p>
				</div>
				<div class="grid gap-2">
					<Label>{m.customTablesVisibleToRoles()}</Label>
					<EntitySelector
						bind:selectedEntityIds={createVisibleToRoles}
						availableEntities={data.roles}
						getEntityId={(r) => r.id}
						getEntityName={(r) => r.name}
						getEntityDescription={(r) => r.description}
						allowCreate={false}
						placeholder="Type # to see all roles..."
					/>
				</div>
				<input type="hidden" name="visible_to_roles" value={JSON.stringify(createVisibleToRoles)} />
			</div>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (createDialogOpen = false)}>
					{m.commonCancel()}
				</Button>
				<Button type="submit">{m.commonCreate()}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Edit Table Dialog -->
<Dialog.Root bind:open={editDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{m.customTablesEdit()}</Dialog.Title>
		</Dialog.Header>
		{#if selectedTable}
			<form
				method="POST"
				action="?/update"
				use:enhance={() => {
					return async ({ result }) => {
						if (result.type === 'success') {
							handleSuccess(m.customTablesUpdateSuccess());
						} else if (result.type === 'failure') {
							handleError(m.customTablesUpdateError());
						}
					};
				}}
			>
				<input type="hidden" name="id" value={selectedTable.id} />
				<div class="grid gap-4 py-4">
					<div class="grid gap-2">
						<Label for="edit-table_name">{m.customTablesTableName()}</Label>
						<Input
							id="edit-table_name"
							name="table_name"
							value={selectedTable.table_name}
							placeholder={m.customTablesTableNamePlaceholder()}
							required
						/>
						<p class="text-xs text-muted-foreground">{m.customTablesTableNameValidation()}</p>
					</div>
					<div class="grid gap-2">
						<Label for="edit-display_name">{m.customTablesDisplayName()}</Label>
						<Input
							id="edit-display_name"
							name="display_name"
							value={selectedTable.display_name}
							placeholder={m.customTablesDisplayNamePlaceholder()}
							required
						/>
					</div>
					<div class="grid gap-2">
						<Label for="edit-description">{m.rolesDescription_field()}</Label>
						<Textarea
							id="edit-description"
							name="description"
							value={selectedTable.description || ''}
							placeholder={m.customTablesDescriptionPlaceholder()}
							rows={3}
						/>
					</div>
					<div class="grid gap-2">
						<Label for="edit-main_column">{m.customTablesMainColumn()}</Label>
						<Input
							id="edit-main_column"
							name="main_column"
							value={selectedTable.main_column}
							placeholder={m.customTablesMainColumnPlaceholder()}
							required
						/>
						<p class="text-xs text-muted-foreground">{m.customTablesMainColumnHelp()}</p>
					</div>
					<div class="grid gap-2">
						<Label>{m.customTablesVisibleToRoles()}</Label>
						<EntitySelector
							bind:selectedEntityIds={editVisibleToRoles}
							availableEntities={data.roles}
							getEntityId={(r) => r.id}
							getEntityName={(r) => r.name}
							getEntityDescription={(r) => r.description}
							allowCreate={false}
							placeholder="Type # to see all roles..."
						/>
					</div>
					<input type="hidden" name="visible_to_roles" value={JSON.stringify(editVisibleToRoles)} />
				</div>
				<Dialog.Footer>
					<Button type="button" variant="outline" onclick={() => (editDialogOpen = false)}>
						{m.commonCancel()}
					</Button>
					<Button type="submit">{m.commonSave()}</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<!-- Delete Table Dialog -->
<AlertDialog.Root bind:open={deleteDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.customTablesDelete()}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.customTablesDeleteConfirm()}
			</AlertDialog.Description>
		</AlertDialog.Header>
		{#if selectedTable}
			<AlertDialog.Footer>
				<AlertDialog.Cancel>{m.commonCancel()}</AlertDialog.Cancel>
				<form
					method="POST"
					action="?/delete"
					use:enhance={() => {
						return async ({ result }) => {
							if (result.type === 'success') {
								handleSuccess(m.customTablesDeleteSuccess());
							} else if (result.type === 'failure') {
								handleError(m.customTablesDeleteError());
							}
						};
					}}
				>
					<input type="hidden" name="id" value={selectedTable.id} />
					<AlertDialog.Action
						type="submit"
						class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
					>
						{m.commonDelete()}
					</AlertDialog.Action>
				</form>
			</AlertDialog.Footer>
		{/if}
	</AlertDialog.Content>
</AlertDialog.Root>
