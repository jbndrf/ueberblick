<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { RefreshCw, Upload } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import type { PageData } from './$types';
	import { BaseTable, type BaseColumnConfig } from '$lib/components/admin/base-table';
	import CustomFieldManagerGeneric, {
		type FieldConfig
	} from '$lib/components/admin/custom-field-manager-generic.svelte';
	import DataViewerHeader from '$lib/components/admin/data-viewer-header.svelte';
	import { CsvImportDialog, type MappedImportData, type TargetField, type ImportProgressCallback } from '$lib/components/csv-import';

	type CustomTableRow = {
		id: string;
		table_id: string;
		row_data: Record<string, any>;
		created_at: string;
	};

	let { data }: { data: PageData } = $props();

	let tableRef: BaseTable<CustomTableRow>;
	let columnManagerOpen = $state(false);
	let deleteRowOpen = $state(false);
	let selectedRow = $state<CustomTableRow | null>(null);
	let importDialogOpen = $state(false);

	const columnFieldConfig: FieldConfig = {
		tableName: 'custom_table_columns',
		fieldIdColumn: 'id',
		fieldNameColumn: 'column_name',
		fieldTypeColumn: 'column_type',
		isRequiredColumn: 'is_required',
		defaultValueColumn: 'default_value',
		foreignKeyColumn: 'table_id',
		foreignKeyValue: $page.params.tableId,
		createAction: 'createColumn',
		updateAction: 'updateColumn',
		deleteAction: 'deleteColumn',
		labels: {
			title: m.customTableEditManageColumns?.() ?? 'Manage Columns',
			description:
				m.customTableEditColumnsDescription?.() ?? 'Define the columns for your custom table',
			addButton: m.customTableEditAddColumn(),
			fieldName: m.customTableEditColumnName?.() ?? 'Column Name',
			fieldType: m.customTableEditColumnType?.() ?? 'Column Type',
			defaultValue: m.customTableEditDefaultValue?.() ?? 'Default Value (Optional)',
			required: m.customTableEditRequired?.() ?? 'Required field',
			noFields: m.customTableEditNoColumns(),
			createSuccess: m.customTableEditColumnCreated?.() ?? 'Column created successfully',
			createError: m.customTableEditColumnCreateError?.() ?? 'Failed to create column',
			updateSuccess: m.customTableEditColumnUpdated?.() ?? 'Column updated successfully',
			updateError: m.customTableEditColumnUpdateError?.() ?? 'Failed to update column',
			deleteSuccess: m.customTableEditColumnDeleted?.() ?? 'Column deleted successfully',
			deleteError: m.customTableEditColumnDeleteError?.() ?? 'Failed to delete column',
			deleteConfirm: (columnName: string) =>
				m.customTableEditDeleteColumnConfirm?.({ columnName }) ??
				`Are you sure you want to delete the column '${columnName}'? This will permanently remove all data in this column.`
		}
	};

	const globalFilterFn = (row: any, _columnId: string, filterValue: string) => {
		if (!filterValue) return true;
		const searchValue = String(filterValue).toLowerCase();
		const rowData = row.original.row_data || {};
		return Object.values(rowData).some(
			(value) => String(value ?? '').toLowerCase().includes(searchValue)
		);
	};

	const columns = $derived.by((): BaseColumnConfig<CustomTableRow>[] => {
		return data.columns.map((col) => {
			const fieldType = col.column_type as 'text' | 'number' | 'date' | 'boolean';

			return {
				id: col.column_name,
				header: col.column_name,
				accessorFn: (row) => row.row_data?.[col.column_name] ?? null,
				fieldType,
				capabilities: {
					editable: true,
					sortable: true,
					filterable: true
				},
				onUpdate: async (rowId: string, value: string) => {
					const formData = new FormData();
					formData.append('row_id', rowId);
					formData.append('column_name', col.column_name);
					formData.append('value', value);

					const response = await fetch('?/updateRowData', {
						method: 'POST',
						body: formData
					});

					const result = await response.json();
					if (result.type === 'success') {
						await invalidateAll();
					} else {
						throw new Error(result.data?.message || 'Failed to update cell');
					}
				}
			};
		});
	});

	function handleSuccess(message: string) {
		deleteRowOpen = false;
		selectedRow = null;
		invalidateAll();
		toast.success(message);
	}

	function handleError(message: string) {
		toast.error(message);
	}

	const csvImportTargetFields: TargetField[] = $derived(
		data.columns.map((col) => ({
			id: col.column_name,
			label: col.column_name,
			type: col.column_type,
			required: col.is_required
		}))
	);

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

	async function updateMeta(field: string, value: any) {
		const formData = new FormData();
		formData.append('field', field);
		formData.append('value', typeof value === 'string' ? value : JSON.stringify(value));

		const response = await fetch('?/updateTableMeta', {
			method: 'POST',
			body: formData
		});

		const result = await response.json();
		if (result.type === 'success') {
			await invalidateAll();
		} else {
			toast.error('Failed to update');
		}
	}
</script>

<div class="flex flex-col gap-4 min-w-0 w-full">
	<!-- Entity Header -->
	<DataViewerHeader
		name={data.customTable.display_name}
		description={data.customTable.description || ''}
		visibleToRoles={data.customTable.visible_to_roles || []}
		roles={data.roles}
		onNameChange={(value) => updateMeta('display_name', value)}
		onDescriptionChange={(value) => updateMeta('description', value)}
		onRolesChange={(value) => updateMeta('visible_to_roles', value)}
	>
		{#snippet actions()}
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
		data={data.tableData}
		{columns}
		{globalFilterFn}
		enableRowSelection={true}
		enableShiftSelect={true}
		showToolbar={true}
		showEditMode={true}
		editModeLabel="Edit mode"
		emptyMessage={m.customTableEditNoData()}
		rowActions={{
			header: m.rolesActions(),
			onDelete: (row) => {
				selectedRow = row;
				deleteRowOpen = true;
			}
		}}
		columnManagement={{
			fields: data.columns.map((col) => ({
				field_name: col.column_name,
				field_type: col.column_type
			})),
			onOpen: () => (columnManagerOpen = true)
		}}
		inlineRowCreation={{
			enabled: true,
			createButtonLabel: m.customTableEditAddRow?.() ?? 'Add Row',
			requiredFields: data.columns
				.filter((col) => col.is_required)
				.map((col) => col.column_name),
			onCreateRow: async (rowData) => {
				const formData = new FormData();
				formData.append('row_data', JSON.stringify(rowData));

				const response = await fetch('?/createRow', {
					method: 'POST',
					body: formData
				});

				const result = await response.json();
				if (result.type === 'success') {
					await invalidateAll();
					toast.success(m.customTableEditRowCreated?.() ?? 'Row created successfully');
				} else {
					toast.error(m.customTableEditRowCreateError?.() ?? 'Failed to create row');
					throw new Error(result.data?.message || 'Failed to create row');
				}
			},
			getDefaultValues: () => {
				const defaults: Record<string, any> = {};
				data.columns.forEach((col) => {
					if (col.default_value) {
						defaults[col.column_name] = col.default_value;
					}
				});
				return defaults;
			}
		}}
	/>
</div>

<!-- Column Manager Dialog -->
<Dialog.Root bind:open={columnManagerOpen}>
	<Dialog.Content class="max-w-2xl">
		<CustomFieldManagerGeneric fields={data.columns} config={columnFieldConfig} />
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (columnManagerOpen = false)}>
				{m.commonClose?.() ?? 'Close'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Delete Row Dialog -->
<AlertDialog.Root bind:open={deleteRowOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.customTableEditDeleteRow?.() ?? 'Delete Row'}</AlertDialog.Title>
			<AlertDialog.Description>
				{m.customTableEditDeleteRowConfirm?.() ?? 'Are you sure you want to delete this row? This action cannot be undone.'}
			</AlertDialog.Description>
		</AlertDialog.Header>
		{#if selectedRow}
			<AlertDialog.Footer>
				<AlertDialog.Cancel>{m.commonCancel()}</AlertDialog.Cancel>
				<form
					method="POST"
					action="?/deleteRow"
					use:enhance={() => {
						return async ({ result }) => {
							if (result.type === 'success') {
								handleSuccess(m.customTableEditDeleteSuccess?.() ?? 'Row deleted successfully');
							} else if (result.type === 'failure') {
								handleError(m.customTableEditDeleteError?.() ?? 'Failed to delete row');
							}
						};
					}}
				>
					<input type="hidden" name="row_id" value={selectedRow.id} />
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
	onimport={handleCsvImport}
/>
