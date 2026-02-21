/**
 * Base Table Types
 * Unified table system supporting both static and dynamic columns
 */

import type { ColumnDef, RowSelectionState, FilterFn } from '@tanstack/table-core';
import type { Snippet } from 'svelte';

// Column field types
export type FieldType = 'text' | 'number' | 'date' | 'boolean' | 'array' | 'dropdown' | 'custom';

// Column capabilities
export interface ColumnCapabilities {
	editable?: boolean;
	sortable?: boolean;
	filterable?: boolean;
	copyable?: boolean;
	readonly?: boolean;
}

// Base column configuration
export interface BaseColumnConfig<TData = any> {
	id: string;
	header: string;
	accessorKey?: keyof TData;
	accessorFn?: (row: TData) => any;
	fieldType?: FieldType;
	capabilities?: ColumnCapabilities;
	// For custom rendering
	cellRenderer?: Snippet<[{ value: any; row: TData; isEditing?: boolean }]>;
	headerRenderer?: Snippet<[{ column: any }]>;
	// For editable fields
	onUpdate?: (rowId: string, value: any) => Promise<void>;
	// For array/entity fields
	entityConfig?: {
		getEntityId: (entity: any) => string;
		getEntityName: (entity: any) => string;
		getEntityDescription?: (entity: any) => string;
		availableEntities?: any[];
		allowCreate?: boolean;
		onCreateEntity?: (name: string) => Promise<any>;
	};
	// For boolean toggles
	booleanConfig?: {
		onToggle: (rowId: string, value: boolean) => Promise<void>;
	};
	// For dropdown fields
	dropdownConfig?: {
		options: Array<{
			value: any;
			label: string;
			description?: string;
		}>;
		getDisplayLabel?: (value: any) => string;
		renderTrigger?: Snippet<[{ value: any; label: string }]>;
		renderOption?: Snippet<[{ option: { value: any; label: string; description?: string } }]>;
	};
}

// Table configuration
export interface BaseTableConfig<TData = any> {
	// Data
	data: TData[];
	columns: BaseColumnConfig<TData>[];

	// Row identification
	getRowId?: (row: TData) => string;

	// Selection
	enableRowSelection?: boolean;
	onRowSelectionChange?: (selection: RowSelectionState) => void;
	enableShiftSelect?: boolean;

	// Filtering
	globalFilterFn?: FilterFn<TData>;

	// Actions
	rowActions?: {
		header?: string;
		onEdit?: (row: TData) => void;
		onDelete?: (row: TData) => void;
		customActions?: Array<{
			label: string;
			icon?: any;
			onClick: (row: TData) => void;
			variant?: 'default' | 'destructive';
		}>;
	};

	// Column management (for custom fields in any table)
	columnManagement?: {
		fields: Array<{
			id: string;
			field_name: string;
			field_type: 'text' | 'number' | 'date' | 'boolean';
			is_required: boolean;
			default_value: string | null;
			display_order: number;
		}>;
		onOpen?: () => void; // Custom handler to open management dialog
	};

	// Row management (for dynamic tables)
	rowManagement?: {
		onUpdateRow?: (rowId: string, rowData: Record<string, any>) => Promise<void>;
		onDeleteRow?: (rowId: string) => Promise<void>;
	};

	// Snippet rendered before the create button in the add-row area
	createAreaPrefix?: Snippet;

	// Inline row creation
	inlineRowCreation?: {
		enabled: boolean;
		createButtonLabel?: string;
		requiredFields?: string[]; // Column IDs that are required
		excludeFields?: string[]; // Column IDs to exclude from inline creation
		onCreateRow: (rowData: Record<string, any>) => Promise<void>;
		getDefaultValues?: () => Record<string, any>;
	};

	// UI
	emptyMessage?: string;
	emptySubMessage?: string;
	showToolbar?: boolean;
	showEditMode?: boolean;
	editModeLabel?: string;
}

// Internal column definition (combines BaseColumnConfig with TanStack ColumnDef)
export type InternalColumnDef<TData = any> = ColumnDef<TData> & {
	meta?: {
		fieldType?: FieldType;
		capabilities?: ColumnCapabilities;
		config?: BaseColumnConfig<TData>;
	};
};
