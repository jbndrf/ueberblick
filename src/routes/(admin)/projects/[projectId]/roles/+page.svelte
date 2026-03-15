<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { Badge } from '$lib/components/ui/badge';
	import { toast } from 'svelte-sonner';
	import {
		Users, Eye, EyeOff, FilePlus, FileMinus, Pencil, PencilOff,
		Lock, ChevronRight, Wrench, TriangleAlert, ShieldCheck
	} from 'lucide-svelte';
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

	const projectId = $derived($page.params.projectId);

	let currentTab = $state('roles');
	let tableRef: BaseTable<Role>;
	let createDialogOpen = $state(false);
	let editDialogOpen = $state(false);
	let deleteDialogOpen = $state(false);
	let editParticipantsDialogOpen = $state(false);
	let selectedRole = $state<Role | null>(null);
	let selectedParticipantIds = $state<string[]>([]);

	// --- Permissions tab state ---
	let selectedPermRoleId = $state(data.roles[0]?.id || '');
	let toggling = $state<string | null>(null);
	const allRoleIds = $derived(data.roles.map((r: any) => r.id));

	function hasAccess(roleId: string, allowedRoles: string[]): boolean {
		return allowedRoles.length === 0 || allowedRoles.includes(roleId);
	}

	async function togglePermission(collection: string, recordId: string, field: string) {
		const key = `${collection}:${recordId}:${field}`;
		if (toggling) return;
		toggling = key;
		try {
			const formData = new FormData();
			formData.append('collection', collection);
			formData.append('recordId', recordId);
			formData.append('field', field);
			formData.append('roleId', selectedPermRoleId);
			formData.append('allRoleIds', JSON.stringify(allRoleIds));
			const res = await fetch('?/toggleRole', { method: 'POST', body: formData });
			if (!res.ok) console.error('Toggle failed:', res.status);
			await invalidateAll();
		} catch (err) {
			console.error('Toggle error:', err);
		} finally {
			toggling = null;
		}
	}

	function hasGrantedSubPermissions(roleId: string, wf: typeof data.permWorkflows[0]): boolean {
		for (const stage of wf.stages) {
			if (hasAccess(roleId, stage.visibleToRoles)) return true;
			for (const form of stage.forms) {
				if (hasAccess(roleId, form.allowedRoles)) return true;
			}
			for (const tool of stage.editTools) {
				if (hasAccess(roleId, tool.allowedRoles)) return true;
			}
			for (const conn of stage.connections) {
				if (hasAccess(roleId, conn.allowedRoles)) return true;
			}
		}
		for (const tool of wf.globalTools) {
			if (hasAccess(roleId, tool.allowedRoles)) return true;
		}
		return false;
	}

	// --- Roles tab logic ---
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

	const updateField = createFieldUpdateHandler('updateField');

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
		toast.success(m.rolesUpdateSuccess?.() ?? 'Participants updated successfully');
	}

	function handleParticipantsUpdateError() {
		toast.error(m.rolesUpdateError?.() ?? 'Failed to update participants');
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
		<h1 class="text-3xl font-bold tracking-tight">{m.rolesTitle()}</h1>
		<p class="text-muted-foreground">{m.rolesDescription()}</p>
	</div>

	<Tabs.Root bind:value={currentTab}>
		<Tabs.List>
			<Tabs.Trigger value="roles" class="flex items-center gap-2">
				<ShieldCheck class="h-4 w-4" />
				{m.rolesTitle()}
			</Tabs.Trigger>
			<Tabs.Trigger value="permissions" class="flex items-center gap-2">
				<Eye class="h-4 w-4" />
				{m.permissionsTitle()}
			</Tabs.Trigger>
		</Tabs.List>

		<!-- ROLES TAB -->
		<Tabs.Content value="roles">
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
							toast.success(m.rolesCreateSuccess());
						} else {
							toast.error(m.rolesCreateError());
							throw new Error('Failed to create role');
						}
					}
				}}
			/>
		</Tabs.Content>

		<!-- PERMISSIONS TAB -->
		<Tabs.Content value="permissions">
			<div class="flex flex-col gap-0 min-w-0 w-full">
				<!-- Sticky header with role selector -->
				<div class="sticky top-0 z-10 bg-background border-b pb-3 pt-1 mb-4">
					<div class="flex items-center justify-between gap-4">
						<p class="text-muted-foreground text-sm">{m.permissionsDescription()}</p>
						<div class="flex items-center gap-2 shrink-0">
							<label for="role-select" class="text-sm text-muted-foreground whitespace-nowrap">
								{m.permissionsSelectRole()}:
							</label>
							<select
								id="role-select"
								bind:value={selectedPermRoleId}
								class="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
							>
								{#each data.roles as role}
									<option value={role.id}>{role.name}</option>
								{/each}
							</select>
						</div>
					</div>

					<!-- R / C / U legend -->
					<div class="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
						<span class="flex items-center gap-1"><Eye class="h-3 w-3" /> {m.permissionsCanView()}</span>
						<span class="flex items-center gap-1"><FilePlus class="h-3 w-3" /> {m.permissionsCanCreate()}</span>
						<span class="flex items-center gap-1"><Pencil class="h-3 w-3" /> Update</span>
					</div>
				</div>

				<!-- WORKFLOWS -->
				{#if data.permWorkflows.length > 0}
					<section class="mb-6">
						<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{m.permissionsWorkflows()}</h3>
						<div class="space-y-1">
							{#each data.permWorkflows as wf}
								{@const wfCanRead = hasAccess(selectedPermRoleId, wf.visibleToRoles)}
								{@const wfCanCreate = hasAccess(selectedPermRoleId, wf.entryAllowedRoles)}
								{@const wfDenied = !wfCanRead}
								{@const hiddenButGranted = wfDenied && hasGrantedSubPermissions(selectedPermRoleId, wf)}

								<div class="border rounded-lg overflow-hidden">
									<div class="flex items-center gap-2 px-3 py-2 bg-muted/30">
										<a
											href="/projects/{projectId}/workflows/{wf.id}"
											class="text-sm font-medium hover:underline flex items-center gap-1 flex-1 min-w-0 truncate"
										>
											{wf.name}
											<ChevronRight class="h-3 w-3 shrink-0" />
										</a>
										{#if hiddenButGranted}
											<Tooltip.Root>
												<Tooltip.Trigger>
													<TriangleAlert class="h-4 w-4 text-amber-500 shrink-0" />
												</Tooltip.Trigger>
												<Tooltip.Content class="max-w-xs text-xs">
													{m.permissionsHiddenButGranted()}
												</Tooltip.Content>
											</Tooltip.Root>
										{/if}
										{#if wf.privateInstances}
											<Lock class="h-3.5 w-3.5 text-muted-foreground" />
										{/if}
										{#if !wf.isActive}
											<Badge variant="outline" class="text-xs">Inactive</Badge>
										{/if}
										<div class="flex items-center gap-2 shrink-0 w-20 justify-end">
											{@render permIcon('read', wfCanRead, () => togglePermission('workflows', wf.id, 'visible_to_roles'))}
											{@render permIcon('create', wfCanCreate, () => togglePermission('workflows', wf.id, 'entry_allowed_roles'))}
											<span class="w-5"></span>
										</div>
									</div>

									{#if wf.stages.length > 0 || wf.globalTools.length > 0}
										{@const dimmed = wfDenied ? 'opacity-30' : ''}
										<div class="divide-y divide-border/50">
											{#each wf.stages as stage}
												{@const stageCanRead = hasAccess(selectedPermRoleId, stage.visibleToRoles)}

												<div class="flex items-center gap-2 px-3 py-1.5 pl-6 text-sm">
													<span class="text-muted-foreground flex-1 min-w-0 truncate {dimmed}">{stage.name}</span>
													<div class="flex items-center gap-2 shrink-0 w-20 justify-end">
														{@render permIcon('read', stageCanRead, () => togglePermission('workflow_stages', stage.id, 'visible_to_roles'))}
														<span class="w-5"></span>
														<span class="w-5"></span>
													</div>
												</div>

												{#each stage.forms as form}
													{@const canUse = hasAccess(selectedPermRoleId, form.allowedRoles)}
													<div class="flex items-center gap-2 px-3 py-1 pl-10 text-xs">
														<FilePlus class="h-3 w-3 shrink-0 text-muted-foreground {dimmed}" />
														<span class="text-muted-foreground flex-1 min-w-0 truncate {dimmed}">{form.name}</span>
														<div class="flex items-center gap-2 shrink-0 w-20 justify-end">
															<span class="w-5"></span>
															{@render permIcon('create', canUse, () => togglePermission('tools_forms', form.id, 'allowed_roles'))}
															<span class="w-5"></span>
														</div>
													</div>
												{/each}

												{#each stage.editTools as tool}
													{@const canUse = hasAccess(selectedPermRoleId, tool.allowedRoles)}
													<div class="flex items-center gap-2 px-3 py-1 pl-10 text-xs">
														<Pencil class="h-3 w-3 shrink-0 text-muted-foreground {dimmed}" />
														<span class="text-muted-foreground flex-1 min-w-0 truncate {dimmed}">{tool.name}</span>
														<div class="flex items-center gap-2 shrink-0 w-20 justify-end">
															<span class="w-5"></span>
															<span class="w-5"></span>
															{@render permIcon('update', canUse, () => togglePermission('tools_edit', tool.id, 'allowed_roles'))}
														</div>
													</div>
												{/each}

												{#each stage.connections as conn}
													{@const canUse = hasAccess(selectedPermRoleId, conn.allowedRoles)}
													<div class="flex items-center gap-2 px-3 py-1 pl-10 text-xs">
														<ChevronRight class="h-3 w-3 shrink-0 text-muted-foreground {dimmed}" />
														<span class="text-muted-foreground flex-1 min-w-0 truncate {dimmed}">{conn.actionName}</span>
														<div class="flex items-center gap-2 shrink-0 w-20 justify-end">
															<span class="w-5"></span>
															<span class="w-5"></span>
															{@render permIcon('update', canUse, () => togglePermission('workflow_connections', conn.id, 'allowed_roles'))}
														</div>
													</div>
												{/each}
											{/each}

											{#if wf.globalTools.length > 0}
												<div class="flex items-center gap-2 px-3 py-1.5 pl-6 text-sm">
													<Wrench class="h-3 w-3 shrink-0 text-muted-foreground {dimmed}" />
													<span class="text-muted-foreground flex-1 {dimmed}">Global Tools</span>
												</div>
												{#each wf.globalTools as tool}
													{@const canUse = hasAccess(selectedPermRoleId, tool.allowedRoles)}
													<div class="flex items-center gap-2 px-3 py-1 pl-10 text-xs">
														<Pencil class="h-3 w-3 shrink-0 text-muted-foreground {dimmed}" />
														<span class="text-muted-foreground flex-1 min-w-0 truncate {dimmed}">{tool.name}</span>
														<div class="flex items-center gap-2 shrink-0 w-20 justify-end">
															<span class="w-5"></span>
															<span class="w-5"></span>
															{@render permIcon('update', canUse, () => togglePermission('tools_edit', tool.id, 'allowed_roles'))}
														</div>
													</div>
												{/each}
											{/if}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</section>
				{/if}

				<!-- TABLES -->
				{#if data.permTables.length > 0}
					<section class="mb-6">
						<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{m.permissionsTables()}</h3>
						<div class="border rounded-lg divide-y">
							{#each data.permTables as entity}
								{@render simpleEntityRow(entity, 'custom-tables', 'custom_tables')}
							{/each}
						</div>
					</section>
				{/if}

				<!-- MARKER CATEGORIES -->
				{#if data.permCategories.length > 0}
					<section class="mb-6">
						<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{m.permissionsMarkerCategories()}</h3>
						<div class="border rounded-lg divide-y">
							{#each data.permCategories as entity}
								{@render simpleEntityRow(entity, 'marker-categories', 'marker_categories')}
							{/each}
						</div>
					</section>
				{/if}

				<!-- MAP LAYERS -->
				{#if data.permLayers.length > 0}
					<section class="mb-6">
						<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{m.permissionsMapLayers()}</h3>
						<div class="border rounded-lg divide-y">
							{#each data.permLayers as entity}
								{@render simpleEntityRow(entity, 'map-settings', 'map_layers')}
							{/each}
						</div>
					</section>
				{/if}

				<!-- OFFLINE PACKAGES -->
				{#if data.permPackages.length > 0}
					<section class="mb-6">
						<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{m.permissionsOfflinePackages()}</h3>
						<div class="border rounded-lg divide-y">
							{#each data.permPackages as entity}
								{@render simpleEntityRow(entity, 'map-settings', 'offline_packages')}
							{/each}
						</div>
					</section>
				{/if}

				{#if data.permWorkflows.length === 0 && data.permTables.length === 0 && data.permCategories.length === 0 && data.permLayers.length === 0 && data.permPackages.length === 0}
					<div class="text-center py-8 text-muted-foreground">
						{m.permissionsNoEntities()}
					</div>
				{/if}
			</div>
		</Tabs.Content>
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

<!-- Permission icon snippet -->
{#snippet permIcon(type: 'read' | 'create' | 'update', allowed: boolean, onclick: () => void)}
	<button
		class="w-5 flex items-center justify-center cursor-pointer hover:scale-125 transition-transform disabled:opacity-50 disabled:cursor-wait"
		title={type}
		disabled={toggling !== null}
		{onclick}
	>
		{#if type === 'read'}
			{#if allowed}
				<Eye class="h-4 w-4 text-green-600 dark:text-green-400" />
			{:else}
				<EyeOff class="h-4 w-4 text-destructive/40" />
			{/if}
		{:else if type === 'create'}
			{#if allowed}
				<FilePlus class="h-4 w-4 text-blue-600 dark:text-blue-400" />
			{:else}
				<FileMinus class="h-4 w-4 text-destructive/40" />
			{/if}
		{:else}
			{#if allowed}
				<Pencil class="h-4 w-4 text-amber-600 dark:text-amber-400" />
			{:else}
				<PencilOff class="h-4 w-4 text-destructive/40" />
			{/if}
		{/if}
	</button>
{/snippet}

<!-- Simple entity row (tables, categories, layers, packages) -->
{#snippet simpleEntityRow(entity: { id: string; name: string; visibleToRoles: string[] }, routeSegment: string, collection: string)}
	{@const canRead = hasAccess(selectedPermRoleId, entity.visibleToRoles)}
	<div class="flex items-center gap-2 px-3 py-2">
		<a
			href="/projects/{projectId}/{routeSegment}/{entity.id}"
			class="text-sm hover:underline flex items-center gap-1 flex-1 min-w-0 truncate"
		>
			{entity.name}
			<ChevronRight class="h-3 w-3 shrink-0" />
		</a>
		<div class="flex items-center gap-2 shrink-0 w-20 justify-end">
			{@render permIcon('read', canRead, () => togglePermission(collection, entity.id, 'visible_to_roles'))}
			<span class="w-5"></span>
			<span class="w-5"></span>
		</div>
	</div>
{/snippet}
