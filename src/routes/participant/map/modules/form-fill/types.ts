// Form field types from the workflow builder
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
