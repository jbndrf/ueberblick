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
	import { toast } from 'svelte-sonner';
	import { Settings, Palette, Users } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { BaseTable, type BaseColumnConfig } from '$lib/components/admin/base-table';
	import type { MarkerCategory } from './columns';
	import { formatDistanceToNow } from 'date-fns';
	import MarkerIconDesigner from '$lib/components/admin/marker-icon-designer.svelte';
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';
	import { deserialize } from '$app/forms';

	let { data }: { data: PageData } = $props();

	let tableRef: BaseTable<MarkerCategory>;
	let createDialogOpen = $state(false);
	let editDialogOpen = $state(false);
	let deleteDialogOpen = $state(false);
	let iconDesignerOpen = $state(false);
	let editRolesDialogOpen = $state(false);
	let selectedCategory = $state<MarkerCategory | null>(null);
	let selectedRoleIds = $state<string[]>([]);

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

	const globalFilterFn = (row: any, _columnId: string, filterValue: string) => {
		const searchValue = String(filterValue).toLowerCase();
		const category = row.original;
		return (
			category.name.toLowerCase().includes(searchValue) ||
			(category.description && category.description.toLowerCase().includes(searchValue)) ||
			false
		);
	};

	// Define table columns using BaseColumnConfig (reactive to update entityConfig when data changes)
	const columns = $derived.by((): BaseColumnConfig<MarkerCategory>[] => [
		{
			id: 'icon_preview',
			header: 'Icon',
			accessorFn: (row) => row.icon_config,
			cellRenderer: iconCellRenderer,
			fieldType: 'text',
			capabilities: {
				editable: false,
				sortable: false,
				filterable: false
			}
		},
		{
			id: 'name',
			header: m.markerCategoriesName?.() ?? 'Name',
			accessorKey: 'name',
			fieldType: 'text',
			capabilities: {
				editable: true,
				sortable: true,
				filterable: true
			},
			onUpdate: async (rowId: string, value: string) => {
				const formData = new FormData();
				formData.append('id', rowId);
				formData.append('field', 'name');
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
			id: 'visible_to_roles',
			header: m.mapLayerVisibleToRoles?.() ?? 'Visible to Roles',
			accessorFn: (row) => {
				// Return the role IDs directly for entity selector
				if (!row.visible_to_roles || row.visible_to_roles.length === 0) return [];
				return row.visible_to_roles;
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
			onUpdate: async (rowId: string, value: string[]) => {
				const formData = new FormData();
				formData.append('categoryId', rowId);
				formData.append('roleIds', JSON.stringify(value));

				const response = await fetch('?/updateCategoryRoles', {
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
	]);

	function handleSuccess(message: string) {
		createDialogOpen = false;
		editDialogOpen = false;
		deleteDialogOpen = false;
		selectedCategory = null;
		invalidateAll();
		toast.success(message);
	}

	function handleError(message: string) {
		toast.error(message);
	}

	async function handleIconSave(config: any) {
		if (!selectedCategory) return;

		try {
			const formData = new FormData();
			formData.append('id', selectedCategory.id);
			formData.append('iconConfig', JSON.stringify(config));

			const response = await fetch('?/updateIconConfig', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();
			if (result.type === 'success') {
				iconDesignerOpen = false;
				selectedCategory = null;
				await invalidateAll();
				toast.success('Icon configuration saved successfully');
			} else {
				toast.error('Failed to save icon configuration');
			}
		} catch (error) {
			toast.error('Error saving icon configuration');
		}
	}

	function openEditRoles(category: MarkerCategory) {
		selectedCategory = category;
		selectedRoleIds = category.visible_to_roles || [];
		editRolesDialogOpen = true;
	}

	function handleRolesUpdateSuccess() {
		editRolesDialogOpen = false;
		selectedCategory = null;
		invalidateAll();
		toast.success(m.markerCategoriesUpdateSuccess?.() ?? 'Roles updated successfully');
	}

	function handleRolesUpdateError() {
		toast.error(m.markerCategoriesUpdateError?.() ?? 'Failed to update roles');
	}
</script>

<div class="flex flex-col gap-6 min-w-0 w-full">
	<!-- Header -->
	<div>
		<h1 class="text-3xl font-bold tracking-tight">{m.markerCategoriesTitle?.() ?? 'Marker Categories'}</h1>
		<p class="text-muted-foreground">{m.markerCategoriesDescription?.() ?? 'Manage marker categories for your project'}</p>
	</div>

	<!-- Base Table -->
	<BaseTable
		bind:this={tableRef}
		data={data.markerCategories}
		{columns}
		{globalFilterFn}
		getRowId={(row) => row.id}
		enableRowSelection={true}
		enableShiftSelect={true}
		showToolbar={true}
		showEditMode={true}
		editModeLabel="Edit categories inline"
		emptyMessage={m.markerCategoriesNoCategories?.() ?? 'No marker categories'}
		emptySubMessage={m.markerCategoriesCreateYourFirst?.() ?? 'Create your first marker category to get started'}
		rowActions={{
			header: m.rolesActions(),
			onEdit: (category) => {
				selectedCategory = category;
				editDialogOpen = true;
			},
			onDelete: (category) => {
				selectedCategory = category;
				deleteDialogOpen = true;
			},
			customActions: [
				{
					label: m.markerCategoriesEditRoles?.() ?? 'Edit Roles',
					icon: Users,
					onClick: openEditRoles
				},
				{
					label: 'Design Icon',
					icon: Palette,
					onClick: (category) => {
						// Use setTimeout to allow dropdown to close first
						setTimeout(() => {
							selectedCategory = category;
							iconDesignerOpen = true;
						}, 0);
					}
				},
				{
					label: m.markerCategoriesEditFields?.() ?? 'Edit Fields',
					icon: Settings,
					onClick: (category) => {
						window.location.href = `/projects/${$page.params.projectId}/marker-categories/${category.id}`;
					}
				}
			]
		}}
		inlineRowCreation={{
			enabled: true,
			createButtonLabel: m.markerCategoriesCreateCategory?.() ?? 'Create Category',
			requiredFields: ['name'],
			excludeFields: ['visible_to_roles', 'created', 'updated', 'icon_preview'],
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
					toast.success(m.markerCategoriesCreateSuccess?.() ?? 'Category created successfully');
				} else {
					toast.error(m.markerCategoriesCreateError?.() ?? 'Failed to create category');
					throw new Error('Failed to create category');
				}
			}
		}}
	/>
</div>

<!-- Create Category Dialog -->
<Dialog.Root bind:open={createDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{m.markerCategoriesCreateCategory?.() ?? 'Create Category'}</Dialog.Title>
		</Dialog.Header>
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				return async ({ result }) => {
					if (result.type === 'success') {
						handleSuccess(m.markerCategoriesCreateSuccess?.() ?? 'Category created successfully');
					} else if (result.type === 'failure') {
						handleError(m.markerCategoriesCreateError?.() ?? 'Failed to create category');
					}
				};
			}}
		>
			<div class="grid gap-4 py-4">
				<div class="grid gap-2">
					<Label for="name">{m.markerCategoriesName?.() ?? 'Name'}</Label>
					<Input
						id="name"
						name="name"
						placeholder={m.markerCategoriesNamePlaceholder?.() ?? 'Enter category name'}
						required
					/>
				</div>
				<div class="grid gap-2">
					<Label for="description">{m.rolesDescription_field()}</Label>
					<Textarea
						id="description"
						name="description"
						placeholder={m.markerCategoriesDescriptionPlaceholder?.() ?? 'Enter category description'}
						rows={3}
					/>
				</div>
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

<!-- Edit Category Dialog -->
<Dialog.Root bind:open={editDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{m.markerCategoriesEdit?.() ?? 'Edit Category'}</Dialog.Title>
		</Dialog.Header>
		{#if selectedCategory}
			<form
				method="POST"
				action="?/update"
				use:enhance={() => {
					return async ({ result }) => {
						if (result.type === 'success') {
							handleSuccess(m.markerCategoriesUpdateSuccess?.() ?? 'Category updated successfully');
						} else if (result.type === 'failure') {
							handleError(m.markerCategoriesUpdateError?.() ?? 'Failed to update category');
						}
					};
				}}
			>
				<input type="hidden" name="id" value={selectedCategory.id} />
				<div class="grid gap-4 py-4">
					<div class="grid gap-2">
						<Label for="edit-name">{m.markerCategoriesName?.() ?? 'Name'}</Label>
						<Input
							id="edit-name"
							name="name"
							value={selectedCategory.name}
							placeholder={m.markerCategoriesNamePlaceholder?.() ?? 'Enter category name'}
							required
						/>
					</div>
					<div class="grid gap-2">
						<Label for="edit-description">{m.rolesDescription_field()}</Label>
						<Textarea
							id="edit-description"
							name="description"
							value={selectedCategory.description || ''}
							placeholder={m.markerCategoriesDescriptionPlaceholder?.() ?? 'Enter category description'}
							rows={3}
						/>
					</div>
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

<!-- Delete Category Dialog -->
<AlertDialog.Root bind:open={deleteDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.markerCategoriesDelete?.() ?? 'Delete Category'}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.markerCategoriesDeleteConfirm?.() ?? 'Are you sure you want to delete this marker category? This action cannot be undone.'}
			</AlertDialog.Description>
		</AlertDialog.Header>
		{#if selectedCategory}
			<AlertDialog.Footer>
				<AlertDialog.Cancel>{m.commonCancel()}</AlertDialog.Cancel>
				<form
					method="POST"
					action="?/delete"
					use:enhance={() => {
						return async ({ result }) => {
							if (result.type === 'success') {
								handleSuccess(m.markerCategoriesDeleteSuccess?.() ?? 'Category deleted successfully');
							} else if (result.type === 'failure') {
								handleError(m.markerCategoriesDeleteError?.() ?? 'Failed to delete category');
							}
						};
					}}
				>
					<input type="hidden" name="id" value={selectedCategory.id} />
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

<!-- Edit Roles Dialog -->
<Dialog.Root bind:open={editRolesDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{m.markerCategoriesEditRoles?.() ?? 'Edit Roles'}</Dialog.Title>
		</Dialog.Header>
		{#if selectedCategory}
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
				<input type="hidden" name="categoryId" value={selectedCategory.id} />
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

<!-- Icon Designer Dialog -->
{#if iconDesignerOpen && selectedCategory}
	<div class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" onclick={() => {
		iconDesignerOpen = false;
		selectedCategory = null;
	}}></div>
	<div class="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]">
		<MarkerIconDesigner
			initialConfig={selectedCategory.icon_config as any}
			onSave={handleIconSave}
			onCancel={() => {
				iconDesignerOpen = false;
				selectedCategory = null;
			}}
		/>
	</div>
{/if}

{#snippet iconCellRenderer({ value }: { value: any })}
	{#if value && value.svgContent}
		{@const style = value.style || {}}
		{@const size = Math.min(style.size || 24, 24) * 3}
		{@const color = style.color || '#333'}
		<div
			class="inline-flex items-center justify-center"
			style="width: {size}px; height: {size}px;"
		>
			{@html value.svgContent.replace(/(<svg[^>]*)(>)/, `$1 style="width: ${size * 0.6}px; height: ${size * 0.6}px; fill: ${color};"$2`)}
		</div>
	{:else}
		<span class="text-muted-foreground text-xs">No icon</span>
	{/if}
{/snippet}
