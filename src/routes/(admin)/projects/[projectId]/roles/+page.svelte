<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { toast } from 'svelte-sonner';
	import { Users } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { BaseTable, type BaseColumnConfig } from '$lib/components/admin/base-table';
	import { page } from '$app/stores';
	import { deserialize } from '$app/forms';
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';
	import CrudDialogs, { type CrudDialogConfig } from '$lib/components/admin/crud-dialogs.svelte';
	import { createFieldUpdateHandler } from '$lib/utils/table-actions';

	type Role = {
		id: string;
		name: string;
		description?: string;
		created_at: string;
		project_id: string;
		assigned_participants?: Array<{
			id: string;
			name: string;
		}>;
	};

	let { data }: { data: PageData } = $props();

	let tableRef: BaseTable<Role>;
	let createDialogOpen = $state(false);
	let editDialogOpen = $state(false);
	let deleteDialogOpen = $state(false);
	let editParticipantsDialogOpen = $state(false);
	let selectedRole = $state<Role | null>(null);
	let selectedParticipantIds = $state<string[]>([]);

	// Create participant callback for MobileMultiSelect (uses server action)
	async function createParticipant(name: string) {
		const formData = new FormData();
		formData.append('name', name);

		const response = await fetch('?/createParticipant', {
			method: 'POST',
			body: formData
		});

		const result = deserialize(await response.text());
		if (result.type === 'success' && result.data?.entity) {
			await invalidateAll();
			return result.data.entity;
		}
		throw new Error('Failed to create participant');
	}

	// Create reusable update handler
	const updateField = createFieldUpdateHandler('updateField');

	// Dialog configuration for CRUD operations
	const dialogConfig: CrudDialogConfig = {
		entityName: 'Role',
		fields: [
			{
				name: 'name',
				label: m.rolesName(),
				type: 'text',
				placeholder: m.rolesNamePlaceholder(),
				required: true
			},
			{
				name: 'description',
				label: m.rolesDescription_field(),
				type: 'textarea',
				placeholder: m.rolesDescriptionPlaceholder(),
				rows: 3
			}
		],
		createAction: '?/create',
		updateAction: '?/update',
		deleteAction: '?/delete',
		messages: {
			createTitle: m.rolesCreateRole(),
			editTitle: m.rolesEdit(),
			deleteTitle: m.rolesDelete(),
			deleteConfirm: m.rolesDeleteConfirm(),
			createSuccess: m.rolesCreateSuccess(),
			updateSuccess: m.rolesUpdateSuccess(),
			deleteSuccess: m.rolesDeleteSuccess(),
			createError: m.rolesCreateError(),
			updateError: m.rolesUpdateError(),
			deleteError: m.rolesDeleteError(),
			cancel: m.commonCancel(),
			save: m.commonSave(),
			create: m.commonCreate(),
			delete: m.commonDelete()
		}
	};

	// Global filter function
	const globalFilterFn = (row: any, _columnId: string, filterValue: string) => {
		const searchValue = String(filterValue).toLowerCase();
		const role = row.original;
		return (
			role.name.toLowerCase().includes(searchValue) ||
			(role.description && role.description.toLowerCase().includes(searchValue)) ||
			false
		);
	};

	// Map participants to each role
	const roleParticipants = $derived.by(() => {
		const mapping: Record<string, Array<{ id: string; name: string }>> = {};
		data.participants.forEach((participant) => {
			if (participant.role_id && Array.isArray(participant.role_id)) {
				participant.role_id.forEach((roleId: string) => {
					if (!mapping[roleId]) {
						mapping[roleId] = [];
					}
					mapping[roleId].push({
						id: participant.id,
						name: participant.name
					});
				});
			}
		});
		return mapping;
	});

	// Enhance roles with assigned participants
	const enhancedRoles = $derived(
		data.roles.map((role) => ({
			...role,
			assigned_participants: roleParticipants[role.id] || []
		}))
	);

	// Define table columns using BaseColumnConfig
	const columns: BaseColumnConfig<Role>[] = [
		{
			id: 'name',
			header: m.rolesName(),
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
			header: m.rolesDescription_field(),
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
			id: 'assigned_participants',
			header: m.rolesParticipants?.() ?? 'Assigned Participants',
			accessorFn: (row) => {
				if (!row.assigned_participants || row.assigned_participants.length === 0) return 0;
				return row.assigned_participants.length;
			},
			fieldType: 'number',
			capabilities: {
				editable: false,
				sortable: true,
				filterable: false,
				readonly: true
			}
		}
	];

	function openEditParticipants(role: Role) {
		selectedRole = role;
		selectedParticipantIds = role.assigned_participants?.map((p) => p.id) || [];
		editParticipantsDialogOpen = true;
	}

	function handleParticipantsUpdateSuccess() {
		editParticipantsDialogOpen = false;
		selectedRole = null;
		invalidateAll();
		toast.success(m.rolesUpdateSuccess?.() ?? 'Participants updated successfully');
	}

	function handleParticipantsUpdateError() {
		toast.error(m.rolesUpdateError?.() ?? 'Failed to update participants');
	}

	/**
	 * Generate a unique access token for participant
	 */
	function generateUniqueToken(): string {
		const timestamp = Date.now().toString(36);
		const randomPart = Math.random().toString(36).substring(2, 15);
		const additionalRandom = Math.random().toString(36).substring(2, 8);

		// Add additional entropy using crypto
		let cryptoRandom = '';
		if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
			const array = new Uint8Array(4);
			crypto.getRandomValues(array);
			cryptoRandom = Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
		}

		return `${timestamp}-${randomPart}-${additionalRandom}${cryptoRandom ? '-' + cryptoRandom : ''}`;
	}
</script>

<div class="flex flex-col gap-6 min-w-0 w-full">
	<!-- Header -->
	<div>
		<h1 class="text-3xl font-bold tracking-tight">{m.rolesTitle()}</h1>
		<p class="text-muted-foreground">{m.rolesDescription()}</p>
	</div>

	<!-- Base Table -->
	<BaseTable
		bind:this={tableRef}
		data={enhancedRoles}
		{columns}
		{globalFilterFn}
		getRowId={(row) => row.id}
		enableRowSelection={true}
		enableShiftSelect={true}
		showToolbar={true}
		showEditMode={true}
		editModeLabel="Edit roles inline"
		emptyMessage={m.rolesNoRoles()}
		emptySubMessage={m.rolesCreateYourFirst()}
		rowActions={{
			header: m.rolesActions(),
			onEdit: (role) => {
				selectedRole = role;
				editDialogOpen = true;
			},
			onDelete: (role) => {
				selectedRole = role;
				deleteDialogOpen = true;
			},
			customActions: [
				{
					label: m.rolesEditParticipants?.() ?? 'Edit Participants',
					icon: Users,
					onClick: openEditParticipants
				}
			]
		}}
		inlineRowCreation={{
			enabled: true,
			createButtonLabel: m.rolesCreateRole(),
			requiredFields: ['name'],
			onCreateRow: async (rowData) => {
				const formData = new FormData();
				formData.append('name', rowData.name || '');
				formData.append('description', rowData.description || '');

				const response = await fetch('?/create', {
					method: 'POST',
					body: formData
				});

				const result = await response.json();
				if (result.type === 'success') {
					await invalidateAll();
					toast.success(m.rolesCreateSuccess());
				} else {
					toast.error(m.rolesCreateError());
					throw new Error('Failed to create role');
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
	bind:selectedEntity={selectedRole}
	onCreateOpenChange={(open) => (createDialogOpen = open)}
	onEditOpenChange={(open) => (editDialogOpen = open)}
	onDeleteOpenChange={(open) => (deleteDialogOpen = open)}
	onEntityChange={(entity) => (selectedRole = entity as Role | null)}
/>

<!-- Edit Participants Dialog -->
<Dialog.Root bind:open={editParticipantsDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{m.rolesEditParticipants?.() ?? 'Edit Participants'}</Dialog.Title>
		</Dialog.Header>
		{#if selectedRole}
			<form
				method="POST"
				action="?/updateParticipants"
				use:enhance={() => {
					return async ({ result }) => {
						if (result.type === 'success') {
							handleParticipantsUpdateSuccess();
						} else if (result.type === 'failure') {
							handleParticipantsUpdateError();
						}
					};
				}}
			>
				<input type="hidden" name="roleId" value={selectedRole.id} />
				<input type="hidden" name="participantIds" value={JSON.stringify(selectedParticipantIds)} />
				<div class="py-4">
					<MobileMultiSelect
						bind:selectedIds={selectedParticipantIds}
						options={data.participants}
						getOptionId={(p) => p.id}
						getOptionLabel={(p) => p.name}
						allowCreate={true}
						onCreateOption={createParticipant}
						placeholder="Select or search participants..."
					/>
				</div>
				<Dialog.Footer>
					<Button
						type="button"
						variant="outline"
						onclick={() => (editParticipantsDialogOpen = false)}
					>
						{m.commonCancel()}
					</Button>
					<Button type="submit">{m.commonSave()}</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
