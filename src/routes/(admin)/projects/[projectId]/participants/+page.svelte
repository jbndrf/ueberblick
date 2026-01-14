<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { toast } from 'svelte-sonner';
	import { UserCog } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { BaseTable, type BaseColumnConfig } from '$lib/components/admin/base-table';
	import type { Participant } from './columns';
	import CustomFieldManagerGeneric, {
		type FieldConfig
	} from '$lib/components/admin/custom-field-manager-generic.svelte';
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';
	import CrudDialogs, { type CrudDialogConfig } from '$lib/components/admin/crud-dialogs.svelte';
	import { deserialize } from '$app/forms';
	import {
		createFieldUpdateHandler,
		createCustomFieldUpdateHandler,
		createArrayFieldUpdateHandler,
		createToggleHandler
	} from '$lib/utils/table-actions';

	let { data }: { data: PageData } = $props();

	let tableRef: BaseTable<Participant>;
	let createDialogOpen = $state(false);
	let editDialogOpen = $state(false);
	let deleteDialogOpen = $state(false);
	let customFieldsDialogOpen = $state(false);
	let editRolesDialogOpen = $state(false);
	let selectedParticipant = $state<Participant | null>(null);
	let selectedRoleIds = $state<string[]>([]);

	// Create reusable update handlers
	const updateField = createFieldUpdateHandler('updateField');
	const updateCustomField = createCustomFieldUpdateHandler('updateCustomField');
	const updateRoles = createArrayFieldUpdateHandler('updateRoles', 'roleIds', 'participantId');
	const toggleStatus = createToggleHandler('toggleStatus', 'is_active');

	// Create role callback for MobileMultiSelect (uses server action)
	async function createRole(name: string) {
		const formData = new FormData();
		formData.append('name', name);

		const response = await fetch('?/createRole', {
			method: 'POST',
			body: formData
		});

		const result = deserialize(await response.text());
		if (result.type === 'success' && result.data?.entity) {
			await invalidateAll();
			return result.data.entity;
		}
		throw new Error('Failed to create role');
	}

	// Dialog configuration for CRUD operations
	const dialogConfig: CrudDialogConfig = {
		entityName: 'Participant',
		fields: [
			{
				name: 'name',
				label: m.participantsName(),
				type: 'text',
				placeholder: m.participantsNamePlaceholder(),
				required: true
			},
			{
				name: 'email',
				label: m.participantsEmail(),
				type: 'email',
				placeholder: m.participantsEmailPlaceholder()
			},
			{
				name: 'phone',
				label: m.participantsPhone(),
				type: 'text',
				placeholder: m.participantsPhonePlaceholder()
			}
		],
		createAction: '?/create',
		updateAction: '?/update',
		deleteAction: '?/delete',
		messages: {
			createTitle: m.participantsCreateParticipant(),
			editTitle: m.participantsEdit(),
			deleteTitle: m.participantsDelete(),
			deleteConfirm: m.participantsDeleteConfirm(),
			createSuccess: m.participantsCreateSuccess(),
			updateSuccess: m.participantsUpdateSuccess(),
			deleteSuccess: m.participantsDeleteSuccess(),
			createError: m.participantsCreateError(),
			updateError: m.participantsUpdateError(),
			deleteError: m.participantsDeleteError(),
			cancel: m.commonCancel(),
			save: m.commonSave(),
			create: m.commonCreate(),
			delete: m.commonDelete()
		}
	};

	const customFieldConfig: FieldConfig = {
		tableName: 'participant_custom_fields',
		fieldIdColumn: 'id',
		fieldNameColumn: 'field_name',
		fieldTypeColumn: 'field_type',
		isRequiredColumn: 'is_required',
		defaultValueColumn: 'default_value',
		foreignKeyColumn: 'project_id',
		foreignKeyValue: $page.params.projectId,
		createAction: 'createCustomField',
		updateAction: 'updateCustomFieldDefinition',
		deleteAction: 'deleteCustomFieldDefinition',
		labels: {
			title: 'Custom Fields',
			description: 'Define additional fields for participants in this project',
			addButton: 'Add Field',
			fieldName: 'Field Name',
			fieldType: 'Field Type',
			defaultValue: 'Default Value (Optional)',
			required: 'Required field',
			noFields: 'No custom fields defined yet',
			createSuccess: 'Custom field created successfully',
			createError: 'Failed to create custom field',
			updateSuccess: 'Custom field updated successfully',
			updateError: 'Failed to update custom field',
			deleteSuccess: 'Custom field deleted successfully',
			deleteError: 'Failed to delete custom field',
			deleteConfirm:
				'Are you sure you want to delete this custom field? This will remove the field definition but preserve existing data in participant metadata.'
		}
	};

	const globalFilterFn = (row: any, _columnId: string, filterValue: string) => {
		if (!filterValue) return true;
		const searchValue = String(filterValue).toLowerCase();
		const participant = row.original;
		return (
			participant.name?.toLowerCase().includes(searchValue) ||
			participant.email?.toLowerCase().includes(searchValue) ||
			participant.phone?.toLowerCase().includes(searchValue) ||
			false
		);
	};

	// Define table columns using BaseColumnConfig (core + dynamic custom fields)
	const columns = $derived.by((): BaseColumnConfig<Participant>[] => {
		const coreColumns: BaseColumnConfig<Participant>[] = [
		{
			id: 'name',
			header: m.participantsName(),
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
			id: 'email',
			header: m.participantsEmail(),
			accessorKey: 'email',
			fieldType: 'text',
			capabilities: {
				editable: true,
				sortable: true,
				filterable: true
			},
			onUpdate: (rowId, value) => updateField(rowId, value, 'email')
		},
		{
			id: 'phone',
			header: m.participantsPhone(),
			accessorKey: 'phone',
			fieldType: 'text',
			capabilities: {
				editable: true,
				sortable: true,
				filterable: true
			},
			onUpdate: (rowId, value) => updateField(rowId, value, 'phone')
		},
		{
			id: 'token',
			header: m.participantsToken(),
			accessorKey: 'token',
			fieldType: 'text',
			capabilities: {
				copyable: true,
				editable: false,
				sortable: false,
				filterable: false,
				readonly: true
			}
		},
		{
			id: 'roles',
			header: m.participantsRoles(),
			accessorFn: (row) => {
				// Return the role IDs for the entity selector
				if (!row.role_id || row.role_id.length === 0) return [];
				return row.role_id;
			},
			fieldType: 'array',
			capabilities: {
				editable: true,
				sortable: false,
				filterable: true
			},
			entityConfig: {
				getEntityId: (role) => role.id,
				getEntityName: (role) => role.name,
				getEntityDescription: (role) => role.description,
				availableEntities: data.roles,
				allowCreate: true,
				onCreateEntity: createRole
			},
			onUpdate: updateRoles
		},
		{
			id: 'is_active',
			header: m.participantsStatus(),
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
		}
	];

		// Add custom fields as dynamic columns
		const customFieldColumns: BaseColumnConfig<Participant>[] = (data.customFields || []).map(
			(field) => ({
				id: `custom_${field.field_name}`,
				header: field.field_name,
				accessorFn: (row) => row.metadata?.[field.field_name] ?? null,
				fieldType: field.field_type as any,
				capabilities: {
					editable: true,
					sortable: true,
					filterable: true
				},
				onUpdate: (rowId, value) => updateCustomField(rowId, value, field.field_name)
			})
		);

		return [...coreColumns, ...customFieldColumns];
	});

	function openEditRoles(participant: Participant) {
		selectedParticipant = participant;
		selectedRoleIds = participant.role_id || [];
		editRolesDialogOpen = true;
	}

	function handleRolesUpdateSuccess() {
		editRolesDialogOpen = false;
		selectedParticipant = null;
		invalidateAll();
		toast.success(m.participantsUpdateSuccess?.() ?? 'Roles updated successfully');
	}

	function handleRolesUpdateError() {
		toast.error(m.participantsUpdateError?.() ?? 'Failed to update roles');
	}
</script>

<div class="flex flex-col gap-6 min-w-0 w-full">
	<!-- Header -->
	<div>
		<h1 class="text-3xl font-bold tracking-tight">{m.participantsTitle()}</h1>
		<p class="text-muted-foreground">{m.participantsDescription()}</p>
	</div>

	<!-- Base Table -->
	<BaseTable
		bind:this={tableRef}
		data={data.participants}
		{columns}
		{globalFilterFn}
		enableRowSelection={true}
		enableShiftSelect={true}
		showToolbar={true}
		showEditMode={true}
		editModeLabel={m.participantsEdit?.() ?? 'Edit mode'}
		emptyMessage={m.participantsNoParticipants()}
		emptySubMessage={m.participantsCreateYourFirst()}
		rowActions={{
			header: m.rolesActions(),
			onEdit: (participant) => {
				selectedParticipant = participant;
				selectedRoleIds = participant.role_id || [];
				editDialogOpen = true;
			},
			onDelete: (participant) => {
				selectedParticipant = participant;
				deleteDialogOpen = true;
			},
			customActions: [
				{
					label: m.participantsEditRoles?.() ?? 'Edit Roles',
					icon: UserCog,
					onClick: openEditRoles
				}
			]
		}}
		columnManagement={{
			fields: data.customFields,
			onOpen: () => (customFieldsDialogOpen = true)
		}}
		inlineRowCreation={{
			enabled: true,
			createButtonLabel: m.participantsCreateParticipant(),
			requiredFields: ['name'],
			excludeFields: ['token', 'is_active'],
			onCreateRow: async (rowData) => {
				const formData = new FormData();
				formData.append('name', rowData.name || '');
				formData.append('email', rowData.email || '');
				formData.append('phone', rowData.phone || '');

				const response = await fetch('?/create', {
					method: 'POST',
					body: formData,
					headers: {
						'Accept': 'application/json'
					}
				});

				const result = await response.json();
				if (result.type === 'success' || result.data?.success) {
					await invalidateAll();
					toast.success(m.participantsCreateSuccess());
				} else {
					const errorMessage = result.data?.message || m.participantsCreateError();
					toast.error(errorMessage);
					throw new Error('Failed to create participant');
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
	bind:selectedEntity={selectedParticipant}
	onCreateOpenChange={(open) => (createDialogOpen = open)}
	onEditOpenChange={(open) => (editDialogOpen = open)}
	onDeleteOpenChange={(open) => (deleteDialogOpen = open)}
	onEntityChange={(entity) => (selectedParticipant = entity as Participant | null)}
/>

<!-- Edit Roles Dialog -->
<Dialog.Root bind:open={editRolesDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{m.participantsEditRoles?.() ?? 'Edit Roles'}</Dialog.Title>
		</Dialog.Header>
		{#if selectedParticipant}
			<form
				method="POST"
				action="?/updateRoles"
				use:enhance={() => {
					return async ({ result }) => {
						if (result.type === 'success') {
							handleRolesUpdateSuccess();
						} else if (result.type === 'failure') {
							handleRolesUpdateError();
						}
					};
				}}
			>
				<input type="hidden" name="participantId" value={selectedParticipant.id} />
				<input type="hidden" name="roleIds" value={JSON.stringify(selectedRoleIds)} />
				<div class="py-4">
					<MobileMultiSelect
						bind:selectedIds={selectedRoleIds}
						options={data.roles}
						getOptionId={(r) => r.id}
						getOptionLabel={(r) => r.name}
						getOptionDescription={(r) => r.description}
						allowCreate={true}
						onCreateOption={createRole}
						placeholder="Select or search roles..."
					/>
				</div>
				<Dialog.Footer>
					<Button type="button" variant="outline" onclick={() => (editRolesDialogOpen = false)}>
						{m.commonCancel()}
					</Button>
					<Button type="submit">{m.commonSave()}</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<!-- Custom Fields Management Dialog -->
<Dialog.Root bind:open={customFieldsDialogOpen}>
	<Dialog.Content class="max-w-2xl">
		<CustomFieldManagerGeneric fields={data.customFields} config={customFieldConfig} />
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (customFieldsDialogOpen = false)}>
				Close
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
