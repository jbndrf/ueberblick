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
		permissionsCanCreate,
		permissionsCanUpdate,
		permissionsCanView,
		permissionsDescription,
		permissionsGlobalTools,
		permissionsHiddenButGranted,
		permissionsMapLayers,
		permissionsMarkerCategories,
		permissionsNoEntities,
		permissionsOfflinePackages,
		permissionsSelectRole,
		permissionsTables,
		permissionsTitle,
		permissionsWorkflows,
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

	<Tabs.Root bind:value={currentTab}>
		<Tabs.List>
			<Tabs.Trigger value="roles" class="flex items-center gap-2">
				<ShieldCheck class="h-4 w-4" />
				{rolesTitle()}
			</Tabs.Trigger>
			<Tabs.Trigger value="permissions" class="flex items-center gap-2">
				<Eye class="h-4 w-4" />
				{permissionsTitle()}
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
		<Tabs.Content value="permissions">
			<div class="flex flex-col gap-0 min-w-0 w-full">
				<!-- Sticky header with role selector -->
				<div class="sticky top-0 z-10 bg-background border-b pb-3 pt-1 mb-4">
					<div class="flex items-center justify-between gap-4">
						<p class="text-muted-foreground text-sm">{permissionsDescription()}</p>
						<div class="flex items-center gap-2 shrink-0">
							<label for="role-select" class="text-sm text-muted-foreground whitespace-nowrap">
								{permissionsSelectRole()}:
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
						<span class="flex items-center gap-1"><Eye class="h-3 w-3" /> {permissionsCanView()}</span>
						<span class="flex items-center gap-1"><FilePlus class="h-3 w-3" /> {permissionsCanCreate()}</span>
						<span class="flex items-center gap-1"><Pencil class="h-3 w-3" /> {permissionsCanUpdate?.() ?? 'Update'}</span>
					</div>
				</div>

				<!-- WORKFLOWS -->
				{#if data.permWorkflows.length > 0}
					<section class="mb-6">
						<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{permissionsWorkflows()}</h3>
						<div class="space-y-1">
							{#each data.permWorkflows as wf}
								{@const wfCanRead = hasAccess(selectedPermRoleId, wf.visibleToRoles)}
								{@const wfCanCreate = hasAccess(selectedPermRoleId, wf.entryAllowedRoles)}
								{@const wfDenied = !wfCanRead}
								{@const hiddenButGranted = wfDenied && hasGrantedSubPermissions(selectedPermRoleId, wf)}

								<div class="border rounded-lg overflow-hidden">
									<div class="flex items-center gap-2 px-3 py-2 bg-muted/30">
										<a
											href="/admin/projects/{projectId}/workflows/{wf.id}"
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
													{permissionsHiddenButGranted()}
												</Tooltip.Content>
											</Tooltip.Root>
										{/if}
										{#if wf.privateInstances}
											<Lock class="h-3.5 w-3.5 text-muted-foreground" />
										{/if}
										{#if !wf.isActive}
											<Badge variant="outline" class="text-xs">{rolesInactive?.() ?? 'Inactive'}</Badge>
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
															{@render permIcon('update', canUse, () => togglePermission('tools_edit', tool.id, 'any_edit_roles'))}
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
													<span class="text-muted-foreground flex-1 {dimmed}">{permissionsGlobalTools?.() ?? 'Global Tools'}</span>
												</div>
												{#each wf.globalTools as tool}
													{@const canUse = hasAccess(selectedPermRoleId, tool.allowedRoles)}
													<div class="flex items-center gap-2 px-3 py-1 pl-10 text-xs">
														<Pencil class="h-3 w-3 shrink-0 text-muted-foreground {dimmed}" />
														<span class="text-muted-foreground flex-1 min-w-0 truncate {dimmed}">{tool.name}</span>
														<div class="flex items-center gap-2 shrink-0 w-20 justify-end">
															<span class="w-5"></span>
															<span class="w-5"></span>
															{@render permIcon('update', canUse, () => togglePermission('tools_edit', tool.id, 'any_edit_roles'))}
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
						<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{permissionsTables()}</h3>
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
						<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{permissionsMarkerCategories()}</h3>
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
						<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{permissionsMapLayers()}</h3>
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
						<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{permissionsOfflinePackages()}</h3>
						<div class="border rounded-lg divide-y">
							{#each data.permPackages as entity}
								{@render simpleEntityRow(entity, 'map-settings', 'offline_packages')}
							{/each}
						</div>
					</section>
				{/if}

				{#if data.permWorkflows.length === 0 && data.permTables.length === 0 && data.permCategories.length === 0 && data.permLayers.length === 0 && data.permPackages.length === 0}
					<div class="text-center py-8 text-muted-foreground">
						{permissionsNoEntities()}
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

<!-- Permission icon snippet -->
{#snippet permIcon(type: 'read' | 'create' | 'update', allowed: boolean, onclick: () => void)}
	<button
		class="w-5 flex items-center justify-center cursor-pointer hover:scale-125 transition-transform disabled:opacity-50 disabled:cursor-wait"
		title={type === 'read' ? permissionsCanView() : type === 'create' ? permissionsCanCreate() : (permissionsCanUpdate?.() ?? 'Update')}
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
			href="/admin/projects/{projectId}/{routeSegment}/{entity.id}"
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
