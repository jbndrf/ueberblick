<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import {
		commonCancel,
		commonClose,
		commonCopy,
		commonCreate,
		commonDelete,
		commonSave,
		commonYes,
		rolesActions,
		rolesAssignedParticipants,
		rolesCreateError,
		rolesCreateRole,
		rolesCreateSuccess,
		rolesCreateYourFirst,
		rolesDelete,
		rolesDeleteConfirm,
		rolesDeleteError,
		rolesDeleteSuccess,
		rolesDescription,
		rolesDescriptionPlaceholder,
		rolesDescription_field,
		rolesEdit,
		rolesEditModeLabel,
		rolesEditParticipants,
		rolesInactive,
		rolesName,
		rolesNamePlaceholder,
		rolesNoRoles,
		rolesQuotaHelp,
		rolesQuotaInvalid,
		rolesQuotaMaxInstancesLabel,
		rolesQuotaSave,
		rolesQuotaSaveError,
		rolesQuotaSaved,
		rolesSelectOrSearchParticipants,
		rolesSelfJoin,
		rolesSelfJoinDisabled,
		rolesSelfJoinEnabled,
		rolesSelfJoinInfoDefaultActive,
		rolesSelfJoinInfoDefaultEmail,
		rolesSelfJoinInfoDefaultLandingPage,
		rolesSelfJoinInfoDefaultName,
		rolesSelfJoinInfoDefaultRetention,
		rolesSelfJoinInfoDefaultRetentionValue,
		rolesSelfJoinInfoDefaultRole,
		rolesSelfJoinInfoDefaultsTitle,
		rolesSelfJoinInfoDescription,
		rolesSelfJoinInfoTitle,
		rolesSelfJoinInfoUrlHint,
		rolesSelfJoinInfoUrlLabel,
		rolesSelfJoinNotEnabled,
		rolesSelfJoinShowUrl,
		rolesSelfJoinToggleError,
		rolesSelfJoinUrlCopied,
		rolesSelfJoinUrlCopyError,
		rolesTitle,
		rolesUpdateError,
		rolesUpdateSuccess
	} from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { Badge } from '$lib/components/ui/badge';
	import { toast } from 'svelte-sonner';
	import {
		Users, Eye, EyeOff, FilePlus, FileMinus, Pencil, PencilOff,
		Lock, ChevronRight, Wrench, TriangleAlert, ShieldCheck, Link
	} from '@lucide/svelte';
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
		self_joinable?: boolean;
		join_slug?: string;
		max_instances?: number;
		assigned_participants?: Array<{
			id: string;
			name: string;
		}>;
	};

	async function toggleSelfJoinable(rowId: string, value: boolean) {
		const formData = new FormData();
		formData.append('id', rowId);
		formData.append('enabled', String(value));
		try {
			const res = await fetch('?/toggleSelfJoinable', { method: 'POST', body: formData });
			if (!res.ok) {
				toast.error(rolesSelfJoinToggleError?.() ?? 'Failed to update self-join setting');
				return;
			}
			await invalidateAll();
			toast.success(
				value
					? (rolesSelfJoinEnabled?.() ?? 'Self-join enabled')
					: (rolesSelfJoinDisabled?.() ?? 'Self-join disabled')
			);
		} catch (err) {
			console.error(err);
			toast.error(rolesSelfJoinToggleError?.() ?? 'Failed to update self-join setting');
		}
	}

	async function copyJoinUrl(slug: string) {
		const url = `${window.location.origin}/join/${slug}`;
		try {
			await navigator.clipboard.writeText(url);
			toast.success(rolesSelfJoinUrlCopied?.() ?? 'Join URL copied');
		} catch {
			toast.error(rolesSelfJoinUrlCopyError?.() ?? 'Could not copy URL');
		}
	}

	let { data }: { data: PageData } = $props();

	const projectId = $derived($page.params.projectId);

	let currentTab = $state('roles');
	let tableRef: BaseTable<Role>;
	let createDialogOpen = $state(false);
	let editDialogOpen = $state(false);
	let deleteDialogOpen = $state(false);
	let editParticipantsDialogOpen = $state(false);
	let joinInfoDialogOpen = $state(false);
	let joinInfoRole = $state<Role | null>(null);
	let selectedRole = $state<Role | null>(null);
	let selectedParticipantIds = $state<string[]>([]);

	const joinInfoUrl = $derived(
		joinInfoRole?.join_slug && typeof window !== 'undefined'
			? `${window.location.origin}/join/${joinInfoRole.join_slug}`
			: ''
	);

	function openJoinInfo(role: Role) {
		if (!role.self_joinable || !role.join_slug) {
			toast.error(
				rolesSelfJoinNotEnabled?.() ?? 'Enable self-join first to get a join URL'
			);
			return;
		}
		joinInfoRole = role;
		quotaInput = role.max_instances ?? 0;
		joinInfoDialogOpen = true;
	}

	let quotaInput = $state(0);
	let savingQuota = $state(false);

	async function saveQuota() {
		if (!joinInfoRole) return;
		const value = Number(quotaInput);
		if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
			toast.error(rolesQuotaInvalid?.() ?? 'Quota must be a non-negative whole number');
			return;
		}
		savingQuota = true;
		try {
			const formData = new FormData();
			formData.append('id', joinInfoRole.id);
			formData.append('maxInstances', String(value));
			const res = await fetch('?/updateRoleInstanceQuota', { method: 'POST', body: formData });
			if (!res.ok) {
				toast.error(rolesQuotaSaveError?.() ?? 'Failed to save quota');
				return;
			}
			await invalidateAll();
			toast.success(rolesQuotaSaved?.() ?? 'Quota saved');
		} catch (err) {
			console.error(err);
			toast.error(rolesQuotaSaveError?.() ?? 'Failed to save quota');
		} finally {
			savingQuota = false;
		}
	}

	function selectJoinUrlInput(e: Event) {
		(e.currentTarget as HTMLInputElement).select();
	}

	// --- Roles tab logic ---
	async function createParticipant(name: string): Promise<{ id: string; name: string }> {
		const formData = new FormData();
		formData.append('name', name);

		const response = await fetch('?/createParticipant', {
			method: 'POST',
			body: formData
		});

		const result = deserialize(await response.text());
		if (result.type === 'success' && result.data?.entity) {
			await invalidateAll();
			return result.data.entity as unknown as { id: string; name: string };
		}
		throw new Error('Failed to create participant');
	}

	const updateField = createFieldUpdateHandler('updateField');

	const dialogConfig: CrudDialogConfig = {
		entityName: 'Role',
		fields: [
			{
				name: 'name',
				label: rolesName(),
				type: 'text',
				placeholder: rolesNamePlaceholder(),
				required: true
			},
			{
				name: 'description',
				label: rolesDescription_field(),
				type: 'textarea',
				placeholder: rolesDescriptionPlaceholder(),
				rows: 3
			}
		],
		createAction: '?/create',
		updateAction: '?/update',
		deleteAction: '?/delete',
		messages: {
			createTitle: rolesCreateRole(),
			editTitle: rolesEdit(),
			deleteTitle: rolesDelete(),
			deleteConfirm: rolesDeleteConfirm(),
			createSuccess: rolesCreateSuccess(),
			updateSuccess: rolesUpdateSuccess(),
			deleteSuccess: rolesDeleteSuccess(),
			createError: rolesCreateError(),
			updateError: rolesUpdateError(),
			deleteError: rolesDeleteError(),
			cancel: commonCancel(),
			save: commonSave(),
			create: commonCreate(),
			delete: commonDelete()
		}
	};

	const globalFilterFn = (row: any, _columnId: string, filterValue: string) => {
		const searchValue = String(filterValue).toLowerCase();
		const role = row.original;
		return (
			role.name.toLowerCase().includes(searchValue) ||
			(role.description && role.description.toLowerCase().includes(searchValue)) ||
			false
		);
	};

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

	const enhancedRoles = $derived(
		data.roles.map((role) => ({
			...role,
			assigned_participants: roleParticipants[role.id] || []
		}))
	);

	const columns = $derived.by((): BaseColumnConfig<Role>[] => [
		{
			id: 'name',
			header: rolesName(),
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
			header: rolesDescription_field(),
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
			id: 'self_joinable',
			header: rolesSelfJoin?.() ?? 'Self-join',
			accessorKey: 'self_joinable',
			fieldType: 'boolean',
			capabilities: {
				sortable: true,
				filterable: true,
				editable: false
			},
			booleanConfig: {
				onToggle: toggleSelfJoinable
			}
		},
		{
			id: 'assigned_participants',
			header: rolesAssignedParticipants?.() ?? 'Assigned Participants',
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
	]);

	function openEditParticipants(role: Role) {
		selectedRole = role;
		selectedParticipantIds = role.assigned_participants?.map((p) => p.id) || [];
		editParticipantsDialogOpen = true;
	}

	function handleParticipantsUpdateSuccess() {
		editParticipantsDialogOpen = false;
		selectedRole = null;
		invalidateAll();
		toast.success(rolesUpdateSuccess?.() ?? 'Participants updated successfully');
	}

	function handleParticipantsUpdateError() {
		toast.error(rolesUpdateError?.() ?? 'Failed to update participants');
	}

	function generateUniqueToken(): string {
		const timestamp = Date.now().toString(36);
		const randomPart = Math.random().toString(36).substring(2, 15);
		const additionalRandom = Math.random().toString(36).substring(2, 8);

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
		<h1 class="text-3xl font-bold tracking-tight">{rolesTitle()}</h1>
		<p class="text-muted-foreground">{rolesDescription()}</p>
	</div>

	<!-- Permissions live in the workflow builder (object inspectors + model tab
	     matrix) — this page is role lifecycle only: names, join, participants. -->
	<Tabs.Root bind:value={currentTab}>
		<Tabs.List>
			<Tabs.Trigger value="roles" class="flex items-center gap-2">
				<ShieldCheck class="h-4 w-4" />
				{rolesTitle()}
			</Tabs.Trigger>
		</Tabs.List>

		<!-- ROLES TAB -->
		<Tabs.Content value="roles">
			<BaseTable
				bind:this={tableRef}
				data={enhancedRoles as unknown as Role[]}
				{columns}
				{globalFilterFn}
				getRowId={(row) => row.id}
				enableRowSelection={true}
				enableShiftSelect={true}
				showToolbar={true}
				showEditMode={true}
				editModeLabel={rolesEditModeLabel?.() ?? 'Edit roles inline'}
				emptyMessage={rolesNoRoles()}
				emptySubMessage={rolesCreateYourFirst()}
				rowActions={{
					header: rolesActions(),
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
							label: rolesEditParticipants?.() ?? 'Edit Participants',
							icon: Users,
							onClick: openEditParticipants
						},
						{
							label: rolesSelfJoinShowUrl?.() ?? 'Show join URL & defaults',
							icon: Link,
							onClick: openJoinInfo
						}
					]
				}}
				inlineRowCreation={{
					enabled: true,
					createButtonLabel: rolesCreateRole(),
					requiredFields: ['name'],
					excludeFields: ['assigned_participants'],
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
							toast.success(rolesCreateSuccess());
						} else {
							toast.error(rolesCreateError());
							throw new Error('Failed to create role');
						}
					}
				}}
			/>
		</Tabs.Content>

		<!-- PERMISSIONS TAB -->
	</Tabs.Root>
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

<!-- Self-Join URL & Defaults Dialog -->
<Dialog.Root bind:open={joinInfoDialogOpen}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>
				{rolesSelfJoinInfoTitle?.() ?? 'Self-join link'}
				{#if joinInfoRole}
					<span class="text-muted-foreground font-normal">— {joinInfoRole.name}</span>
				{/if}
			</Dialog.Title>
			<Dialog.Description>
				{rolesSelfJoinInfoDescription?.() ??
					'Anyone with this link can register themselves as a guest participant in this role.'}
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-5 py-2">
			<div class="space-y-2">
				<label for="join-url-input" class="text-sm font-medium">
					{rolesSelfJoinInfoUrlLabel?.() ?? 'Join URL'}
				</label>
				<div class="flex items-center gap-2">
					<input
						id="join-url-input"
						type="text"
						readonly
						value={joinInfoUrl}
						onclick={selectJoinUrlInput}
						onfocus={selectJoinUrlInput}
						class="flex-1 h-9 rounded-md border border-input bg-muted/40 px-3 py-1 font-mono text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring select-all"
					/>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onclick={() => joinInfoRole?.join_slug && copyJoinUrl(joinInfoRole.join_slug)}
					>
						{commonCopy?.() ?? 'Copy'}
					</Button>
				</div>
				<p class="text-xs text-muted-foreground">
					{rolesSelfJoinInfoUrlHint?.() ??
						'If the Copy button does nothing in your browser, click the field and copy manually.'}
				</p>
			</div>

			<div class="space-y-2">
				<label for="quota-max-instances" class="text-sm font-medium">
					{rolesQuotaMaxInstancesLabel?.() ?? 'Max workflow instances per participant (0 = unlimited)'}
				</label>
				<div class="flex items-center gap-2">
					<input
						id="quota-max-instances"
						type="number"
						min="0"
						step="1"
						bind:value={quotaInput}
						class="flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
					/>
					<Button type="button" variant="default" size="sm" disabled={savingQuota} onclick={saveQuota}>
						{rolesQuotaSave?.() ?? 'Save'}
					</Button>
				</div>
				<p class="text-xs text-muted-foreground">
					{rolesQuotaHelp?.() ?? 'Applies to anyone in this role. Lifetime total; admin deletions free the count.'}
				</p>
			</div>

			<div class="space-y-2">
				<h4 class="text-sm font-medium">
					{rolesSelfJoinInfoDefaultsTitle?.() ?? 'Defaults applied on self-join'}
				</h4>
				<ul class="space-y-1.5 rounded-md border bg-muted/20 p-3 text-sm">
					<li class="flex justify-between gap-4">
						<span class="text-muted-foreground">{rolesSelfJoinInfoDefaultName?.() ?? 'Name'}</span>
						<span class="font-mono">Guest</span>
					</li>
					<li class="flex justify-between gap-4">
						<span class="text-muted-foreground">{rolesSelfJoinInfoDefaultRole?.() ?? 'Role'}</span>
						<span>{joinInfoRole?.name ?? ''}</span>
					</li>
					<li class="flex justify-between gap-4">
						<span class="text-muted-foreground">{rolesSelfJoinInfoDefaultEmail?.() ?? 'Email'}</span>
						<span class="font-mono text-xs">p-…@placeholder.local</span>
					</li>
					<li class="flex justify-between gap-4">
						<span class="text-muted-foreground">{rolesSelfJoinInfoDefaultActive?.() ?? 'Active'}</span>
						<span>{commonYes?.() ?? 'Yes'}</span>
					</li>
					<li class="flex justify-between gap-4">
						<span class="text-muted-foreground">{rolesSelfJoinInfoDefaultLandingPage?.() ?? 'Lands on'}</span>
						<span class="font-mono">/map</span>
					</li>
					<li class="flex justify-between gap-4">
						<span class="text-muted-foreground">{rolesSelfJoinInfoDefaultRetention?.() ?? 'Auto-delete after'}</span>
						<span>{rolesSelfJoinInfoDefaultRetentionValue?.() ?? '90 days of inactivity'}</span>
					</li>
				</ul>
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (joinInfoDialogOpen = false)}>
				{commonClose?.() ?? 'Close'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Edit Participants Dialog -->
<Dialog.Root bind:open={editParticipantsDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{rolesEditParticipants?.() ?? 'Edit Participants'}</Dialog.Title>
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
						options={data.participants as unknown as Array<{ id: string; name: string }>}
						getOptionId={(p: { id: string; name: string }) => p.id}
						getOptionLabel={(p: { id: string; name: string }) => p.name}
						allowCreate={true}
						onCreateOption={createParticipant}
						placeholder={rolesSelectOrSearchParticipants?.() ?? 'Select or search participants...'}
					/>
				</div>
				<Dialog.Footer>
					<Button
						type="button"
						variant="outline"
						onclick={() => (editParticipantsDialogOpen = false)}
					>
						{commonCancel()}
					</Button>
					<Button type="submit">{commonSave()}</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
