// ==========================================================================
// Base Form Types (formerly in form-fill/types.ts)
// ==========================================================================

export type FieldType =
	| 'short_text'
	| 'long_text'
	| 'number'
	| 'email'
	| 'date'
	| 'file'
	| 'dropdown'
	| 'multiple_choice'
	| 'smart_dropdown'
	| 'custom_table_selector';

export type ColumnPosition = 'left' | 'right' | 'full';

export interface FieldOption {
	label: string;
	description?: string;
}

export interface DateFieldOptions {
	date_mode?: 'date' | 'datetime' | 'time';
	prefill_now?: boolean;
}

export interface FileFieldOptions {
	allowed_file_types?: string[];
	max_files?: number;
}

export interface DropdownFieldOptions {
	options?: FieldOption[];
}

export interface SmartDropdownMapping {
	when: string;
	options: FieldOption[];
}

export interface SmartDropdownFieldOptions {
	source_field: string;
	source_stage_id?: string;
	mappings: SmartDropdownMapping[];
}

export interface CustomTableSelectorOptions {
	source_type: 'custom_table' | 'marker_category' | 'participants' | 'roles';
	allow_multiple?: boolean;
	custom_table_id?: string;
	marker_category_id?: string;
	display_field?: string;
	value_field?: string;
	self_select_roles?: string[];
	any_select_roles?: string[];
}

export interface ValidationRules {
	minLength?: number;
	maxLength?: number;
	pattern?: string;
	min?: number;
	max?: number;
	minSelections?: number;
	maxSelections?: number;
	fileTypes?: string[];
	maxFileSize?: number;
}

export interface FormField {
	id: string;
	form_id: string;
	field_label: string;
	field_type: FieldType;
	field_order?: number;
	page?: number;
	page_title?: string;
	row_index: number;
	column_position: ColumnPosition;
	is_required?: boolean;
	placeholder?: string;
	help_text?: string;
	validation_rules?: ValidationRules | null;
	field_options?: DateFieldOptions | FileFieldOptions | DropdownFieldOptions | SmartDropdownFieldOptions | CustomTableSelectorOptions | null;
	conditional_logic?: Record<string, unknown> | null;
}

export interface Form {
	id: string;
	workflow_id: string;
	connection_id?: string;
	stage_id?: string;
	name: string;
	description?: string;
	allowed_roles?: string[];
	visual_config?: {
		button_label?: string;
		button_color?: string;
		confirmation_message?: string;
		requires_confirmation?: boolean;
	} | null;
}

export interface FormValues {
	[fieldId: string]: unknown;
}

export interface FieldError {
	fieldId: string;
	message: string;
}

export interface FormState {
	form: Form | null;
	fields: FormField[];
	values: FormValues;
	errors: FieldError[];
	currentPage: number;
	totalPages: number;
	isSubmitting: boolean;
	isLoading: boolean;
}

// Context for smart dropdowns - values from other fields
export interface FieldContext {
	values: FormValues;
	fields: FormField[];
}

// ==========================================================================
// Form Renderer Types
// ==========================================================================

export type FormMode = 'fill' | 'edit' | 'view';

/**
 * Represents a single file stored in the database
 */
export interface StoredFile {
	recordId: string;
	fileName: string;
}

/**
 * Extended field with current value for rendering
 */
export interface FormFieldWithValue extends FormField {
	value?: unknown;
	fileValue?: string; // For file fields - the filename (single file, legacy)
	fileRecordId?: string; // Record ID for constructing file URLs (single file, legacy)
	storedFiles?: StoredFile[]; // For file fields - all stored files (multi-file support)
}

/**
 * Props for the main FormRenderer component
 */
export interface FormRendererProps {
	mode: FormMode;
	fields: FormFieldWithValue[];
	values?: FormValues;
	onValueChange?: (fieldId: string, value: unknown) => void;
	onFileChange?: (fieldId: string, files: File[]) => void;
	paginated?: boolean;
	currentPage?: number;
	onPageChange?: (page: number) => void;
	errors?: Record<string, string>;
	/** Collection name for file URL construction (default: 'workflow_instance_field_values') */
	fileCollection?: string;
}

/**
 * Props for individual field rendering
 */
export interface FieldRendererProps {
	mode: FormMode;
	field: FormFieldWithValue;
	value?: unknown;
	error?: string;
	onValueChange?: (value: unknown) => void;
	onFileChange?: (files: File[]) => void;
	/** Context for smart dropdowns - values from other fields */
	context?: FieldContext;
	fileCollection?: string;
}

/**
 * Props for media gallery component
 */
export interface MediaGalleryProps {
	mode: FormMode;
	files: MediaFile[];
	onAdd?: (files: File[]) => void;
	onRemove?: (index: number) => void;
	allowedTypes?: string[];
	maxFiles?: number;
	columnPosition?: 'full' | 'half' | 'third' | 'quarter';
}

export interface MediaFile {
	url: string;
	name: string;
	isImage: boolean;
	/** For existing files - the File object for new uploads */
	file?: File;
}

// ==========================================================================
// Layout Types
// ==========================================================================

/**
 * Fields grouped by page for rendering
 */
export interface PageGroup {
	page: number;
	pageTitle: string;
	rows: RowGroup[];
}

/**
 * Fields grouped by row within a page
 */
export interface RowGroup {
	rowIndex: number;
	fields: FormFieldWithValue[];
}

// ==========================================================================
// Layout Utilities
// ==========================================================================

/**
 * Check if fields have layout metadata
 */
export function hasLayoutMetadata(fields: FormField[]): boolean {
	return fields.some(
		(f) => f.row_index !== undefined && f.row_index !== null && f.row_index !== 0
	);
}

/**
 * Get CSS class for column position
 */
export function getColumnClass(position: ColumnPosition): string {
	switch (position) {
		case 'left':
			return 'w-[calc(50%-0.5rem)]';
		case 'right':
			return 'w-[calc(50%-0.5rem)] ml-auto';
		case 'full':
		default:
			return 'w-full';
	}
}

/**
 * Group fields by page and row
 */
export function groupFieldsByLayout(fields: FormFieldWithValue[]): PageGroup[] {
	if (!hasLayoutMetadata(fields)) {
		// Fallback: single page, one field per row
		return [
			{
				page: 1,
				pageTitle: '',
				rows: fields.map((field, index) => ({
					rowIndex: index,
					fields: [{ ...field, column_position: 'full' as ColumnPosition }]
				}))
			}
		];
	}

	// Group by page
	const pageMap = new Map<number, FormFieldWithValue[]>();
	for (const field of fields) {
		const page = field.page || 1;
		if (!pageMap.has(page)) pageMap.set(page, []);
		pageMap.get(page)!.push(field);
	}

	// Build page groups with rows
	return Array.from(pageMap.entries())
		.sort(([a], [b]) => a - b)
		.map(([page, pageFields]) => {
			// Get page title from first field that has one
			const pageTitle = pageFields.find((f) => f.page_title)?.page_title || '';

			// Group by row
			const rowMap = new Map<number, FormFieldWithValue[]>();
			for (const field of pageFields) {
				const row = field.row_index ?? 0;
				if (!rowMap.has(row)) rowMap.set(row, []);
				rowMap.get(row)!.push(field);
			}

			return {
				page,
				pageTitle,
				rows: Array.from(rowMap.entries())
					.sort(([a], [b]) => a - b)
					.map(([rowIndex, rowFields]) => ({
						rowIndex,
						// Sort fields within row: left, right, full
						fields: rowFields.sort((a, b) => {
							const posOrder = { left: 0, right: 1, full: 2 };
							return (
								(posOrder[a.column_position] ?? 2) - (posOrder[b.column_position] ?? 2)
							);
						})
					}))
			};
		});
}

/**
 * Get total pages from fields
 */
export function getTotalPages(fields: FormField[]): number {
	if (fields.length === 0) return 1;
	return Math.max(...fields.map((f) => f.page || 1));
}

/**
 * Check if a file is an image based on extension
 */
export function isImageFile(filename: string): boolean {
	return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(filename);
}
