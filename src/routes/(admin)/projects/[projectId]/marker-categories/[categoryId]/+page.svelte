<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { RefreshCw, Upload, Palette } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import type { PageData } from './$types';
	import { BaseTable, type BaseColumnConfig } from '$lib/components/admin/base-table';
	import CustomFieldManagerGeneric, {
		type FieldConfig
	} from '$lib/components/admin/custom-field-manager-generic.svelte';
	import DataViewerHeader from '$lib/components/admin/data-viewer-header.svelte';
	import MarkerIconDesigner from '$lib/components/admin/marker-icon-designer.svelte';
	import { CsvImportDialog, type MappedImportData, type TargetField, type SpecialColumn, type ImportProgressCallback } from '$lib/components/csv-import';

	type Role = { id: string; name: string };

	type MarkerRow = {
		id: string;
		project_id: string;
		category_id: string;
		title: string;
		description: string | null;
		location: any;
		properties: Record<string, any>;
		visible_to_roles: string[];
		created_by: string | null;
		created_at: string;
		updated_at: string;
	};

	let { data }: { data: PageData } = $props();

	let tableRef: BaseTable<MarkerRow>;
	let fieldManagerOpen = $state(false);
	let deleteMarkerOpen = $state(false);
	let selectedMarker = $state<MarkerRow | null>(null);
	let importDialogOpen = $state(false);
	let iconDesignerOpen = $state(false);

	const fieldConfig: FieldConfig = {
		tableName: 'marker_categories',
		fieldIdColumn: 'id',
		fieldNameColumn: 'field_name',
		fieldTypeColumn: 'field_type',
		isRequiredColumn: 'is_required',
		defaultValueColumn: 'default_value',
		foreignKeyColumn: 'id',
		foreignKeyValue: $page.params.categoryId,
		createAction: 'createField',
		updateAction: 'updateField',
		deleteAction: 'deleteField',
		labels: {
			title: m.markerCategoryDetailManageFieldsTitle?.() ?? 'Manage Custom Fields',
			description: m.markerCategoryDetailManageFieldsDescription?.() ?? 'Define custom fields for markers in this category',
			addButton: m.markerCategoryDetailAddField?.() ?? 'Add Field',
			fieldName: m.markerCategoryDetailFieldName?.() ?? 'Field Name',
			fieldType: m.markerCategoryDetailFieldType?.() ?? 'Field Type',
			defaultValue: m.markerCategoryDetailDefaultValue?.() ?? 'Default Value (Optional)',
			required: m.markerCategoryDetailRequiredField?.() ?? 'Required field',
			noFields: m.markerCategoryDetailNoFields?.() ?? 'No custom fields defined',
			createSuccess: m.markerCategoryDetailFieldCreateSuccess?.() ?? 'Field created successfully',
			createError: m.markerCategoryDetailFieldCreateError?.() ?? 'Failed to create field',
			updateSuccess: m.markerCategoryDetailFieldUpdateSuccess?.() ?? 'Field updated successfully',
			updateError: m.markerCategoryDetailFieldUpdateError?.() ?? 'Failed to update field',
			deleteSuccess: m.markerCategoryDetailFieldDeleteSuccess?.() ?? 'Field deleted successfully',
			deleteError: m.markerCategoryDetailFieldDeleteError?.() ?? 'Failed to delete field',
			deleteConfirm: (fieldName: string) =>
				(m.markerCategoryDetailFieldDeleteConfirm?.({ fieldName }) ?? `Are you sure you want to delete the field '${fieldName}'? This will permanently remove all data in this field.`)
		}
	};

	const globalFilterFn = (row: any, _columnId: string, filterValue: string) => {
		if (!filterValue) return true;
		const searchValue = String(filterValue).toLowerCase();
		const marker = row.original;
		const properties = marker.properties || {};
		return (
			marker.title?.toLowerCase().includes(searchValue) ||
			marker.description?.toLowerCase().includes(searchValue) ||
			Object.values(properties).some(
				(value) => String(value ?? '').toLowerCase().includes(searchValue)
			)
		);
	};

	const columns = $derived.by((): BaseColumnConfig<MarkerRow>[] => {
		// Add standard marker columns first
		const standardColumns: BaseColumnConfig<MarkerRow>[] = [
			{
				id: 'title',
				header: m.markerCategoryDetailColumnTitle?.() ?? 'Title',
				accessorKey: 'title',
				fieldType: 'text',
				capabilities: {
					editable: true,
					sortable: true,
					filterable: true
				},
				onUpdate: async (rowId: string, value: string) => {
					const formData = new FormData();
					formData.append('marker_id', rowId);
					formData.append('field', 'title');
					formData.append('value', value);

					const response = await fetch('?/updateMarkerField', {
						method: 'POST',
						body: formData
					});

					const result = await response.json();
					if (result.type === 'success') {
						await invalidateAll();
					} else {
						throw new Error(result.data?.message || (m.markerCategoryDetailFieldUpdateError?.() ?? 'Failed to update field'));
					}
				}
			},
			{
				id: 'description',
				header: m.markerCategoryDetailColumnDescription?.() ?? 'Description',
				accessorKey: 'description',
				fieldType: 'text',
				capabilities: {
					editable: true,
					sortable: true,
					filterable: true
				},
				onUpdate: async (rowId: string, value: string) => {
					const formData = new FormData();
					formData.append('marker_id', rowId);
					formData.append('field', 'description');
					formData.append('value', value);

					const response = await fetch('?/updateMarkerField', {
						method: 'POST',
						body: formData
					});

					const result = await response.json();
					if (result.type === 'success') {
						await invalidateAll();
					} else {
						throw new Error(result.data?.message || (m.markerCategoryDetailFieldUpdateError?.() ?? 'Failed to update field'));
					}
				}
			}
		];

		// Add custom property columns from category fields
		const propertyColumns = data.fields.map((field: any) => {
			const fieldType = field.field_type as 'text' | 'number' | 'date' | 'boolean';

			return {
				id: field.field_name,
				header: field.field_name,
				accessorFn: (row: any) => row.properties?.[field.field_name] ?? null,
				fieldType,
				capabilities: {
					editable: true,
					sortable: true,
					filterable: true
				},
				onUpdate: async (rowId: string, value: string) => {
					const formData = new FormData();
					formData.append('marker_id', rowId);
					formData.append('property_name', field.field_name);
					formData.append('value', value);

					const response = await fetch('?/updateMarkerProperty', {
						method: 'POST',
						body: formData
					});

					const result = await response.json();
					if (result.type === 'success') {
						await invalidateAll();
					} else {
						throw new Error(result.data?.message || (m.markerCategoryDetailPropertyUpdateError?.() ?? 'Failed to update property'));
					}
				}
			};
		});

		return [...standardColumns, ...propertyColumns];
	});

	function handleSuccess(message: string) {
		deleteMarkerOpen = false;
		selectedMarker = null;
		invalidateAll();
		toast.success(message);
	}

	function handleError(message: string) {
		toast.error(message);
	}

	async function updateMeta(field: string, value: any) {
		const formData = new FormData();
		formData.append('field', field);
		formData.append('value', typeof value === 'string' ? value : JSON.stringify(value));

		const response = await fetch('?/updateCategoryMeta', {
			method: 'POST',
			body: formData
		});

		const result = await response.json();
		if (result.type === 'success') {
			await invalidateAll();
		} else {
			toast.error(m.markerCategoryDetailMetaUpdateError?.() ?? 'Failed to update');
		}
	}

	async function handleIconSave(config: any) {
		try {
			const formData = new FormData();
			formData.append('iconConfig', JSON.stringify(config));

			const response = await fetch('?/updateIconConfig', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();
			if (result.type === 'success') {
				iconDesignerOpen = false;
				await invalidateAll();
				toast.success(m.markerCategoryDetailIconSaveSuccess?.() ?? 'Icon configuration saved');
			} else {
				toast.error(m.markerCategoryDetailIconSaveError?.() ?? 'Failed to save icon configuration');
			}
		} catch (error) {
			toast.error(m.markerCategoryDetailIconSaveException?.() ?? 'Error saving icon configuration');
		}
	}

	const csvImportTargetFields: TargetField[] = $derived([
		{ id: 'title', label: m.markerCategoryDetailColumnTitle?.() ?? 'Title', type: 'text', required: true },
		{ id: 'description', label: m.markerCategoryDetailColumnDescription?.() ?? 'Description', type: 'text', required: false },
		...data.fields.map((field) => ({
			id: field.field_name,
			label: field.field_name,
			type: field.field_type,
			required: field.is_required
		}))
	]);

	const csvImportSpecialColumns: SpecialColumn[] = [
		{ key: 'latitude', label: m.markerCategoryDetailLatitude?.() ?? 'Latitude', required: false },
		{ key: 'longitude', label: m.markerCategoryDetailLongitude?.() ?? 'Longitude', required: false }
	];

	async function handleCsvImport(importData: MappedImportData, onProgress: ImportProgressCallback): Promise<{ success: boolean; count: number; error?: string }> {
		const { rows, replaceData } = importData;
		const BATCH_SIZE = 25;
		let imported = 0;

		for (let i = 0; i < rows.length; i += BATCH_SIZE) {
			const batch = rows.slice(i, i + BATCH_SIZE);
			const formData = new FormData();
			formData.append('rows', JSON.stringify(batch));
			formData.append('replaceData', i === 0 ? String(replaceData) : 'false');

			const response = await fetch('?/importCSV', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();
			if (result.type !== 'success') {
				return { success: false, count: imported, error: result.data?.message || m.csvImportError() };
			}
			imported += batch.length;
			onProgress(imported, rows.length);
		}

		await invalidateAll();
		return { success: true, count: imported };
	}
</script>

<div class="flex flex-col gap-4 min-w-0 w-full">
	<!-- Entity Header -->
	<DataViewerHeader
		name={data.category.name}
		description={data.category.description || ''}
		visibleToRoles={data.category.visible_to_roles || []}
		roles={data.roles as unknown as Role[]}
		onNameChange={(value) => updateMeta('name', value)}
		onDescriptionChange={(value) => updateMeta('description', value)}
		onRolesChange={(value) => updateMeta('visible_to_roles', value)}
	>
		{#snippet actions()}
			<Button variant="outline" size="sm" onclick={() => (iconDesignerOpen = true)}>
				<Palette class="mr-2 h-4 w-4" />
				{m.markerCategoryDetailIconButton?.() ?? 'Icon'}
			</Button>
			<Button variant="outline" size="sm" onclick={() => (importDialogOpen = true)}>
				<Upload class="mr-2 h-4 w-4" />
				{m.csvImportButton()}
			</Button>
			<Button variant="outline" size="sm" onclick={() => invalidateAll()}>
				<RefreshCw class="mr-2 h-4 w-4" />
				{m.customTableEditRefresh()}
			</Button>
		{/snippet}
	</DataViewerHeader>

	<!-- Base Table -->
	<BaseTable
		bind:this={tableRef}
		data={data.markers as unknown as MarkerRow[]}
		{columns}
		{globalFilterFn}
		enableRowSelection={true}
		enableShiftSelect={true}
		showToolbar={true}
		showEditMode={true}
		editModeLabel={m.markerCategoryDetailEditMode?.() ?? 'Edit mode'}
		emptyMessage={m.markerCategoryDetailNoMarkers?.() ?? 'No markers in this category'}
		rowActions={{
			header: m.rolesActions(),
			onDelete: (marker) => {
				selectedMarker = marker;
				deleteMarkerOpen = true;
			}
		}}
		columnManagement={{
			fields: data.fields.map((field: any) => ({
				field_name: field.field_name,
				field_type: field.field_type,
				id: field.id,
				is_required: field.is_required,
				default_value: field.default_value,
				display_order: field.display_order
			})) as unknown as Array<{ id: string; field_name: string; field_type: 'number' | 'boolean' | 'text' | 'date'; is_required: boolean; default_value: string | null; display_order: number }>,
			onOpen: () => (fieldManagerOpen = true)
		}}
		inlineRowCreation={{
			enabled: true,
			createButtonLabel: m.markerCategoryDetailAddMarker?.() ?? 'Add Marker',
			requiredFields: ['title', ...data.fields
				.filter((field) => field.is_required)
				.map((field) => field.field_name)],
			onCreateRow: async (rowData) => {
				const formData = new FormData();
				formData.append('title', rowData.title || '');
				formData.append('description', rowData.description || '');

				// Extract custom properties (everything except title and description)
				const properties: Record<string, any> = {};
				Object.keys(rowData).forEach((key) => {
					if (key !== 'title' && key !== 'description') {
						properties[key] = rowData[key];
					}
				});
				formData.append('properties', JSON.stringify(properties));

				const response = await fetch('?/createMarker', {
					method: 'POST',
					body: formData
				});

				const result = await response.json();
				if (result.type === 'success') {
					await invalidateAll();
					toast.success(m.markerCategoryDetailMarkerCreateSuccess?.() ?? 'Marker created successfully');
				} else {
					toast.error(m.markerCategoryDetailMarkerCreateError?.() ?? 'Failed to create marker');
					throw new Error(result.data?.message || (m.markerCategoryDetailMarkerCreateError?.() ?? 'Failed to create marker'));
				}
			},
			getDefaultValues: () => {
				const defaults: Record<string, any> = {};
				data.fields.forEach((field) => {
					if (field.default_value) {
						defaults[field.field_name] = field.default_value;
					}
				});
				return defaults;
			}
		}}
	/>
</div>

<!-- Field Manager Dialog -->
<Dialog.Root bind:open={fieldManagerOpen}>
	<Dialog.Content class="max-w-2xl">
		<CustomFieldManagerGeneric fields={data.fields || []} config={fieldConfig} />
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (fieldManagerOpen = false)}>
				{m.commonClose?.() ?? 'Close'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Delete Marker Dialog -->
<AlertDialog.Root bind:open={deleteMarkerOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.markerCategoryDetailDeleteMarkerTitle?.() ?? 'Delete Marker'}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.markerCategoryDetailDeleteMarkerConfirm?.() ?? 'Are you sure you want to delete this marker? This action cannot be undone.'}
			</AlertDialog.Description>
		</AlertDialog.Header>
		{#if selectedMarker}
			<AlertDialog.Footer>
				<AlertDialog.Cancel>{m.commonCancel()}</AlertDialog.Cancel>
				<form
					method="POST"
					action="?/deleteMarker"
					use:enhance={() => {
						return async ({ result }) => {
							if (result.type === 'success') {
								handleSuccess(m.markerCategoryDetailMarkerDeleteSuccess?.() ?? 'Marker deleted successfully');
							} else if (result.type === 'failure') {
								handleError(m.markerCategoryDetailMarkerDeleteError?.() ?? 'Failed to delete marker');
							}
						};
					}}
				>
					<input type="hidden" name="marker_id" value={selectedMarker.id} />
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

<!-- Import CSV Dialog -->
<CsvImportDialog
	bind:open={importDialogOpen}
	targetFields={csvImportTargetFields}
	specialColumns={csvImportSpecialColumns}
	title={m.csvImportMarkerDialogTitle()}
	description={m.csvImportMarkerDialogDescription()}
	importLabel={m.csvImportImportMarkers()}
	replaceLabel={m.csvImportReplaceMarkers()}
	onimport={handleCsvImport}
/>

<!-- Icon Designer Modal -->
{#if iconDesignerOpen}
	<div class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" onclick={() => {
		iconDesignerOpen = false;
	}}></div>
	<div class="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]">
		<MarkerIconDesigner
			initialConfig={data.category.icon_config as any}
			onSave={handleIconSave}
			onCancel={() => {
				iconDesignerOpen = false;
			}}
		/>
	</div>
{/if}
