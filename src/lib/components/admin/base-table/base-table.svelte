<script lang="ts" generics="TData">
	import {
		createSvelteTable,
		FlexRender,
		renderComponent,
		renderSnippet
	} from '$lib/components/ui/data-table';
	import * as Table from '$lib/components/ui/table';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { MoreHorizontal, Pencil, Trash2, Plus, Check, X } from 'lucide-svelte';
	import DataTableToolbar from '$lib/components/admin/data-table-toolbar.svelte';
	import DataTableColumnHeader from '$lib/components/admin/data-table-column-header.svelte';
	import {
		getCoreRowModel,
		getFilteredRowModel,
		getSortedRowModel,
		getFacetedUniqueValues,
		type ColumnDef,
		type RowSelectionState
	} from '@tanstack/table-core';
	import { createVirtualizer } from './virtual.svelte';
	import type { BaseTableConfig, BaseColumnConfig, InternalColumnDef } from './types';
	import { TextField, NumberField, DateField, BooleanField, ArrayField, DropdownField } from './field-renderers';
	import * as m from '$lib/paraglide/messages';

	type Props = BaseTableConfig<TData>;

	let {
		data,
		columns,
		getRowId,
		enableRowSelection = false,
		onRowSelectionChange,
		enableShiftSelect = true,
		globalFilterFn,
		rowActions,
		columnManagement,
		rowManagement,
		createAreaPrefix,
		inlineRowCreation,
		emptyMessage = (m.adminBaseTableEmptyDefault?.() ?? 'No data found'),
		emptySubMessage,
		showToolbar = true,
		showEditMode = false,
		editModeLabel = (m.adminBaseTableEditModeDefault?.() ?? 'Edit mode')
	}: Props = $props();

	let globalFilter = $state('');
	let columnFilters = $state<any[]>([]);
	let rowSelection = $state<RowSelectionState>({});
	let lastSelectedIndex = $state<number | null>(null);
	let editMode = $state(false);
	let isCreatingRow = $state(false);
	let newRowData = $state<Record<string, any>>({});
	let isSaving = $state(false);

	// Shift-click selection handler
	function handleCheckboxClick(event: MouseEvent, rowIndex: number) {
		if (!enableShiftSelect) return;

		const rows = table.getRowModel().rows;

		if (event.shiftKey && lastSelectedIndex !== null) {
			event.preventDefault();
			const start = Math.min(lastSelectedIndex, rowIndex);
			const end = Math.max(lastSelectedIndex, rowIndex);
			const newSelection: RowSelectionState = { ...rowSelection };

			for (let i = start; i <= end; i++) {
				if (rows[i]) {
					newSelection[rows[i].id] = true;
				}
			}
			rowSelection = newSelection;
			if (onRowSelectionChange) {
				onRowSelectionChange(rowSelection);
			}
		} else {
			lastSelectedIndex = rowIndex;
		}
	}

	// Build TanStack column definitions from BaseColumnConfig
	const tableColumns = $derived.by((): InternalColumnDef<TData>[] => {
		const cols: InternalColumnDef<TData>[] = [];

		// Add selection column if enabled
		if (enableRowSelection) {
			cols.push({
				id: 'select',
				header: ({ table }) => renderSnippet(selectAllSnippet, { table }),
				cell: ({ row }) => renderSnippet(selectSnippet, { row }),
				enableSorting: false,
				enableColumnFilter: false
			});
		}

		// Add data columns
		for (const col of columns) {
			const columnDef: InternalColumnDef<TData> = {
				id: col.id,
				accessorKey: col.accessorKey as any,
				accessorFn: col.accessorFn,
				header: col.headerRenderer
					? () => renderSnippet(col.headerRenderer!, { column: col })
					: ({ column: tableColumn }) =>
							renderComponent(DataTableColumnHeader, {
								column: tableColumn,
								title: col.header
							}),
				cell: (info) => {
					const row = info.row.original;
					const value = info.getValue();
					const rowId = getRowId ? getRowId(row) : (row as any).id;

					// Custom renderer takes precedence
					if (col.cellRenderer) {
						return renderSnippet(col.cellRenderer, { value, row, isEditing: editMode });
					}

					// Auto-select renderer based on fieldType
					const fieldType = col.fieldType || 'text';
					const capabilities = col.capabilities || {};

					switch (fieldType) {
						case 'boolean':
							return renderComponent(BooleanField, {
								value,
								rowId,
								onToggle: col.booleanConfig?.onToggle,
								displayAsText: !col.booleanConfig?.onToggle
							});

						case 'number':
							return renderComponent(NumberField, {
								value,
								editMode,
								onUpdate: col.onUpdate ? (v: string) => col.onUpdate!(rowId, v) : undefined,
								readonly: capabilities.readonly
							});

						case 'date':
							return renderComponent(DateField, {
								value,
								editMode,
								onUpdate: col.onUpdate ? (v: string) => col.onUpdate!(rowId, v) : undefined,
								readonly: capabilities.readonly
							});

						case 'array':
							return renderComponent(ArrayField, {
								value,
								rowId,
								editMode,
								onUpdate: col.onUpdate ? (v: any[]) => col.onUpdate!(rowId, v) : undefined,
								entityConfig: col.entityConfig
							});

						case 'dropdown':
							return renderComponent(DropdownField, {
								value,
								rowId,
								editMode,
								onUpdate: col.onUpdate ? (v: any) => col.onUpdate!(rowId, v) : undefined,
								options: col.dropdownConfig?.options || [],
								getDisplayLabel: col.dropdownConfig?.getDisplayLabel,
								renderTrigger: col.dropdownConfig?.renderTrigger,
								renderOption: col.dropdownConfig?.renderOption,
								readonly: capabilities.readonly
							});

						case 'text':
						default:
							return renderComponent(TextField, {
								value,
								editMode,
								onUpdate: col.onUpdate ? (v: string) => col.onUpdate!(rowId, v) : undefined,
								readonly: capabilities.readonly,
								copyable: capabilities.copyable
							});
					}
				},
				enableSorting: col.capabilities?.sortable !== false,
				enableColumnFilter: col.capabilities?.filterable !== false,
				filterFn: col.fieldType === 'array'
					? (row, id, filterValue) => {
							if (!filterValue || filterValue.length === 0) return true;
							const value = row.getValue(id) as any[];
							if (!value || value.length === 0) return filterValue.includes('__empty__');
							return value.some((item) => filterValue.includes(item));
						}
					: (row, id, value) => {
							if (!value || value.length === 0) return true;
							return value.includes(row.getValue(id));
						},
				meta: {
					fieldType: col.fieldType,
					capabilities: col.capabilities,
					config: col
				}
			};

			cols.push(columnDef);
		}

		// Add actions column if configured
		if (rowActions && (rowActions.onEdit || rowActions.onDelete || rowActions.customActions)) {
			cols.push({
				id: 'actions',
				header: () => rowActions.header || m.rolesActions(),
				cell: (info) => renderSnippet(actionsSnippet, { row: info.row }),
				enableSorting: false,
				enableColumnFilter: false
			});
		}

		return cols;
	});

	// Create TanStack table instance
	const table = createSvelteTable({
		get data() {
			return data || [];
		},
		get columns() {
			return tableColumns;
		},
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFacetedUniqueValues: (table, columnId) => () => {
			const column = table.getColumn(columnId);
			if (!column) return new Map();

			const facetedValues = new Map<any, number>();
			const rows = table.getPreFilteredRowModel().flatRows;

			// Check if this column is an array field
			const columnDef = tableColumns.find((col) => col.id === columnId);
			const isArrayField = columnDef?.meta?.fieldType === 'array';

			for (const row of rows) {
				const value = row.getValue(columnId);

				// Handle array values (like roles) - flatten them into individual entries
				if (isArrayField && Array.isArray(value)) {
					if (value.length === 0) {
						// Count empty arrays separately
						const emptyKey = '__empty__';
						facetedValues.set(emptyKey, (facetedValues.get(emptyKey) ?? 0) + 1);
					} else {
						// Count each array element individually
						for (const item of value) {
							facetedValues.set(item, (facetedValues.get(item) ?? 0) + 1);
						}
					}
				} else {
					// Handle scalar values normally
					facetedValues.set(value, (facetedValues.get(value) ?? 0) + 1);
				}
			}

			return facetedValues;
		},
		globalFilterFn: globalFilterFn,
		enableRowSelection: enableRowSelection,
		getRowId: getRowId as any,
		state: {
			get globalFilter() {
				return globalFilter;
			},
			get columnFilters() {
				return columnFilters;
			},
			get rowSelection() {
				return rowSelection;
			}
		},
		onGlobalFilterChange: (updater) => {
			if (typeof updater === 'function') {
				globalFilter = updater(globalFilter);
			} else {
				globalFilter = updater;
			}
		},
		onColumnFiltersChange: (updater) => {
			if (typeof updater === 'function') {
				columnFilters = updater(columnFilters);
			} else {
				columnFilters = updater;
			}
		},
		onRowSelectionChange: (updater) => {
			if (typeof updater === 'function') {
				rowSelection = updater(rowSelection);
			} else {
				rowSelection = updater;
			}
			if (onRowSelectionChange) {
				onRowSelectionChange(rowSelection);
			}
		}
	});

	// Virtual scrolling
	let scrollContainerRef = $state<HTMLDivElement | null>(null);
	const ROW_HEIGHT = 49;

	// Custom Svelte 5 wrapper — @tanstack/svelte-virtual doesn't support runes mode
	const virtualizer = createVirtualizer(() => ({
		count: table.getRowModel().rows.length,
		getScrollElement: () => scrollContainerRef,
		estimateSize: () => ROW_HEIGHT,
		overscan: 10
	}));

	function clearFilters() {
		globalFilter = '';
		table.resetColumnFilters();
	}

	const hasActiveFilters = $derived(
		globalFilter !== '' || table.getState().columnFilters.length > 0
	);

	// Inline row creation functions
	// The empty row is always visible when inlineRowCreation is configured.
	// isCreatingRow becomes true once the user starts typing into any field.
	function initNewRowDefaults() {
		if (!inlineRowCreation) return {};
		const defaultValues = inlineRowCreation.getDefaultValues?.() || {};
		for (const col of columns) {
			const opts = col.dropdownConfig?.options;
			if (col.fieldType === 'dropdown' && opts && opts.length > 0) {
				if (defaultValues[col.id] === undefined) {
					defaultValues[col.id] = opts[0].value;
				}
			}
		}
		return defaultValues;
	}

	// Track whether user has started entering data in the creation row
	const hasNewRowInput = $derived(isCreatingRow);

	function cancelCreatingRow() {
		isCreatingRow = false;
		newRowData = initNewRowDefaults();
	}

	async function saveNewRow() {
		if (!inlineRowCreation) return;

		const requiredFields = inlineRowCreation.requiredFields || [];
		const missingFields = requiredFields.filter(
			(fieldId) => !newRowData[fieldId] || newRowData[fieldId] === ''
		);

		if (missingFields.length > 0) return;

		isSaving = true;
		try {
			await inlineRowCreation.onCreateRow(newRowData);
			// Reset for next entry
			isCreatingRow = false;
			newRowData = initNewRowDefaults();
		} catch (error) {
			console.error('Failed to create row:', error);
		} finally {
			isSaving = false;
		}
	}

	function updateNewRowField(columnId: string, value: any) {
		newRowData[columnId] = value;
		// Activate creation mode on first real input
		if (!isCreatingRow && value !== '' && value !== null && value !== undefined) {
			isCreatingRow = true;
		}
	}

	// Initialize defaults when inlineRowCreation is available
	let newRowInitialized = false;
	$effect(() => {
		if (inlineRowCreation?.enabled && !newRowInitialized) {
			newRowInitialized = true;
			newRowData = initNewRowDefaults();
		}
	});

	// Exposed functions
	export function getSelectedRows() {
		return table.getFilteredSelectedRowModel().rows.map((row) => row.original);
	}

	export function getGlobalFilter() {
		return globalFilter;
	}

	export function setGlobalFilter(value: string) {
		globalFilter = value;
	}
</script>

{#snippet selectAllSnippet({ table }: { table: any })}
	<Checkbox
		checked={table.getIsAllRowsSelected()}
		indeterminate={table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()}
		onCheckedChange={(checked) => {
			table.toggleAllRowsSelected(!!checked);
		}}
		aria-label={m.adminBaseTableSelectAll?.() ?? 'Select all'}
	/>
{/snippet}

{#snippet selectSnippet({ row }: { row: any })}
	<Checkbox
		checked={row.getIsSelected()}
		onCheckedChange={(checked) => {
			row.toggleSelected(!!checked);
		}}
		onclick={(e) => {
			if (enableShiftSelect) {
				const rowIndex = table.getRowModel().rows.findIndex((r) => r.id === row.id);
				handleCheckboxClick(e, rowIndex);
			}
		}}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				if (enableShiftSelect) {
					const rowIndex = table.getRowModel().rows.findIndex((r) => r.id === row.id);
					const mouseEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
					handleCheckboxClick(mouseEvent, rowIndex);
				}
			}
		}}
		aria-label={m.adminBaseTableSelectRow?.() ?? 'Select row'}
	/>
{/snippet}

{#snippet actionsSnippet({ row }: { row: any })}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="ghost" size="icon" class="h-8 w-8">
					<MoreHorizontal class="h-4 w-4" />
					<span class="sr-only">{m.adminBaseTableOpenMenu?.() ?? 'Open menu'}</span>
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end">
			{#if rowActions?.onEdit}
				<DropdownMenu.Item onclick={() => rowActions.onEdit?.(row.original)}>
					<Pencil class="mr-2 h-4 w-4" />
					{m.commonEdit()}
				</DropdownMenu.Item>
			{/if}
			{#if rowActions?.customActions}
				{#each rowActions.customActions as action}
					<DropdownMenu.Item
						class={action.variant === 'destructive' ? 'text-destructive' : ''}
						onclick={() => action.onClick(row.original)}
					>
						{#if action.icon}
							{@const Icon = action.icon}
							<Icon class="mr-2 h-4 w-4" />
						{/if}
						{typeof action.label === 'function' ? action.label(row.original) : action.label}
					</DropdownMenu.Item>
				{/each}
			{/if}
			{#if rowActions?.onDelete}
				<DropdownMenu.Separator />
				<DropdownMenu.Item class="text-destructive" onclick={() => rowActions.onDelete?.(row.original)}>
					<Trash2 class="mr-2 h-4 w-4" />
					{m.commonDelete()}
				</DropdownMenu.Item>
			{/if}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/snippet}

{#snippet newRowActionsSnippet()}
	{#if hasNewRowInput}
		<div class="flex items-center gap-1">
			<Button
				variant="ghost"
				size="icon"
				onclick={saveNewRow}
				disabled={isSaving}
				class="h-7 w-7 text-muted-foreground hover:text-foreground"
			>
				<Check class="h-4 w-4" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				onclick={cancelCreatingRow}
				disabled={isSaving}
				class="h-7 w-7 text-muted-foreground hover:text-foreground"
			>
				<X class="h-4 w-4" />
			</Button>
		</div>
	{/if}
{/snippet}

{#snippet newRowTextField(columnId: string, isRequired: boolean)}
	<TextField
		value={newRowData[columnId] ?? ''}
		editMode={true}
		onUpdate={async (value) => {
			updateNewRowField(columnId, value);
		}}
		readonly={false}
	/>
{/snippet}

{#snippet newRowNumberField(columnId: string, isRequired: boolean)}
	<NumberField
		value={newRowData[columnId] ?? null}
		editMode={true}
		onUpdate={async (value) => {
			updateNewRowField(columnId, value);
		}}
		readonly={false}
	/>
{/snippet}

{#snippet newRowDateField(columnId: string, isRequired: boolean)}
	<DateField
		value={newRowData[columnId] ?? null}
		editMode={true}
		onUpdate={async (value) => {
			updateNewRowField(columnId, value);
		}}
		readonly={false}
	/>
{/snippet}

{#snippet newRowBooleanField(columnId: string)}
	<BooleanField
		value={newRowData[columnId] ?? false}
		rowId="new-row"
		onToggle={async (_, value) => {
			updateNewRowField(columnId, value);
		}}
		displayAsText={false}
	/>
{/snippet}

{#snippet newRowDropdownField(columnId: string, dropdownConfig: any)}
	<DropdownField
		value={newRowData[columnId] ?? dropdownConfig?.options?.[0]?.value}
		rowId="new-row"
		editMode={true}
		onUpdate={async (value) => {
			updateNewRowField(columnId, value);
		}}
		options={dropdownConfig?.options || []}
		getDisplayLabel={dropdownConfig?.getDisplayLabel}
		renderTrigger={dropdownConfig?.renderTrigger}
		renderOption={dropdownConfig?.renderOption}
		readonly={false}
	/>
{/snippet}

{#snippet newRowArrayField(columnId: string, entityConfig: any)}
	<ArrayField
		value={newRowData[columnId] ?? []}
		rowId="new-row"
		editMode={true}
		onUpdate={async (value) => {
			updateNewRowField(columnId, value);
		}}
		entityConfig={entityConfig}
	/>
{/snippet}

<div class="flex flex-col gap-4 min-w-0 w-full">
	{#if showToolbar}
		<DataTableToolbar
			searchValue={globalFilter}
			onSearchChange={(value) => (globalFilter = value)}
			onClearFilters={clearFilters}
			hasActiveFilters={hasActiveFilters}
			showEditMode={showEditMode}
			bind:editMode
			{editModeLabel}
		/>
	{/if}

	<div class="rounded-lg border border-border bg-card overflow-hidden w-full">
		<div bind:this={scrollContainerRef} class="overflow-x-auto overflow-y-auto h-[calc(100vh-16rem)] custom-scrollbar">
			<Table.Root class="w-max min-w-full">
				<Table.Header class="sticky top-0 z-20">
					{#each table.getHeaderGroups() as headerGroup}
						<Table.Row class="group hover:bg-muted/50">
							{#each headerGroup.headers as header, index}
								<Table.Head
									class="{header.column.id === 'select' ? 'pl-6 pr-2' : header.column.id === 'actions' ? 'pl-2 pr-6' : 'px-6'} py-3 text-sm font-medium text-muted-foreground whitespace-nowrap bg-muted/50 {header.column.id === 'select' ? 'sticky left-0 z-30 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] before:absolute before:inset-0 before:bg-card before:-z-10 after:absolute after:inset-0 after:bg-muted/50 after:-z-[9]' : ''} {header.column.id === 'actions' ? 'sticky right-0 z-30 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.1)] before:absolute before:inset-0 before:bg-card before:-z-10 after:absolute after:inset-0 after:bg-muted/50 after:-z-[9]' : ''}"
								>
									{#if !header.isPlaceholder}
										{#if columnManagement && index === headerGroup.headers.length - 1}
											<div class="flex items-center justify-between gap-2">
												<FlexRender
													content={header.column.columnDef.header}
													context={header.getContext()}
												/>
												<Button
													variant="outline"
													size="icon"
													onclick={columnManagement.onOpen}
													class="h-7 w-7 -mr-2 border-border hover:bg-accent hover:text-accent-foreground"
												>
													<Plus class="h-4 w-4" />
												</Button>
											</div>
										{:else}
											<FlexRender
												content={header.column.columnDef.header}
												context={header.getContext()}
											/>
										{/if}
									{/if}
								</Table.Head>
							{/each}
						</Table.Row>
					{/each}
				</Table.Header>
				<Table.Body>
					{#if table.getRowModel().rows.length === 0 && !inlineRowCreation?.enabled}
						<Table.Row>
							<Table.Cell colspan={tableColumns.length} class="px-6 py-12 text-center">
								<div class="flex flex-col items-center gap-2 text-muted-foreground">
									<p class="text-sm">{emptyMessage}</p>
									{#if emptySubMessage}
										<p class="text-xs">{emptySubMessage}</p>
									{/if}
								</div>
							</Table.Cell>
						</Table.Row>
					{/if}
					{#if table.getRowModel().rows.length > 0}
						{@const virtualItems = virtualizer.getVirtualItems()}
						{@const allRows = table.getRowModel().rows}
						<!-- Top spacer -->
						{#if virtualItems.length > 0}
							<tr style="height: {virtualItems[0].start}px"></tr>
						{/if}
						{#each virtualItems as virtualRow (allRows[virtualRow.index]?.id ?? virtualRow.index)}
							{@const row = allRows[virtualRow.index]}
							{#if row}
								<Table.Row class="group {row.getIsSelected() ? 'bg-muted/50' : ''}" style="height: {ROW_HEIGHT}px">
									{#each row.getVisibleCells() as cell}
										<Table.Cell
											class="{cell.column.id === 'select' ? 'pl-6 pr-2' : cell.column.id === 'actions' ? 'pl-2 pr-6' : 'px-6'} py-4 {cell.column.id === 'select' ? 'whitespace-nowrap sticky left-0 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] bg-card group-hover:!bg-muted/50' : 'max-w-[300px]'} {cell.column.id === 'actions' ? 'sticky right-0 z-10 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.1)] bg-card group-hover:!bg-muted/50' : ''} {(cell.column.id === 'select' || cell.column.id === 'actions') && row.getIsSelected() ? '!bg-muted/50' : ''}"
										>
											<FlexRender
												content={cell.column.columnDef.cell}
												context={cell.getContext()}
											/>
										</Table.Cell>
									{/each}
								</Table.Row>
							{/if}
						{/each}
						<!-- Bottom spacer -->
						{#if virtualItems.length > 0}
							<tr style="height: {virtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end ?? 0)}px"></tr>
						{/if}
					{/if}

					<!-- Always-visible creation row -->
					{#if inlineRowCreation?.enabled}
						<Table.Row class="group {hasNewRowInput ? 'bg-accent/10' : 'bg-muted/20'}">
							{#each tableColumns as column}
								{@const isRequired =
									inlineRowCreation.requiredFields?.includes(column.id || '') || false}
								{@const isExcluded =
									inlineRowCreation.excludeFields?.includes(column.id || '') || false}
								{@const isMissingRequired = isRequired && hasNewRowInput && (!newRowData[column.id || ''] || newRowData[column.id || ''] === '')}
								<Table.Cell
									class="{column.id === 'select' ? 'pl-6 pr-2' : column.id === 'actions' ? 'pl-2 pr-6' : 'px-6'} py-4 {column.id === 'select' ? 'whitespace-nowrap sticky left-0 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]' : 'max-w-[300px]'} {column.id === 'actions' ? 'sticky right-0 z-10 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.1)]' : ''} {isMissingRequired ? 'ring-1 ring-inset ring-destructive' : ''} {hasNewRowInput ? 'bg-accent/10' : 'bg-muted/20'}"
								>
									{#if column.id === 'select'}
										<Plus class="h-4 w-4 text-muted-foreground" />
									{:else if column.id === 'actions'}
										{@render newRowActionsSnippet()}
									{:else if isExcluded}
										<span class="text-muted-foreground text-xs">{m.adminBaseTableAutoGenerated?.() ?? 'auto'}</span>
									{:else}
										{@const col = columns.find((c) => c.id === column.id)}
										{@const fieldType = col?.fieldType || 'text'}
										{#if fieldType === 'text'}
											{@render newRowTextField(column.id || '', isRequired)}
										{:else if fieldType === 'number'}
											{@render newRowNumberField(column.id || '', isRequired)}
										{:else if fieldType === 'date'}
											{@render newRowDateField(column.id || '', isRequired)}
										{:else if fieldType === 'boolean'}
											{@render newRowBooleanField(column.id || '')}
										{:else if fieldType === 'dropdown'}
											{@render newRowDropdownField(column.id || '', col?.dropdownConfig)}
										{:else if fieldType === 'array'}
											{@render newRowArrayField(column.id || '', col?.entityConfig)}
										{/if}
									{/if}
								</Table.Cell>
							{/each}
						</Table.Row>
					{/if}
				</Table.Body>
			</Table.Root>
		</div>

	</div>
</div>
