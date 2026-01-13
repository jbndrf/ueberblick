/**
 * Workflow Builder Database Types
 *
 * These types match the database schema from the migration.
 */

// =============================================================================
// Stage Types
// =============================================================================

export type StageType = 'start' | 'intermediate' | 'end';

export interface WorkflowStage {
	id: string;
	workflow_id: string;
	stage_name: string;
	stage_type: StageType;
	stage_order?: number;
	position_x?: number;
	position_y?: number;
	visible_to_roles?: string[];
	visual_config?: Record<string, unknown>;
}

// =============================================================================
// Connection Types
// =============================================================================

/**
 * Visual configuration for action buttons.
 * Used by connections (always) and stage-attached tools (when stage_id is set).
 */
export interface VisualConfig {
	button_label?: string;
	button_color?: string;
	button_icon?: string;
	requires_confirmation?: boolean;
	confirmation_message?: string;
}

export interface WorkflowConnection {
	id: string;
	workflow_id: string;
	from_stage_id: string | null; // null = entry connection (workflow start point)
	to_stage_id: string;
	action_name: string;
	allowed_roles?: string[];
	visual_config?: VisualConfig;
}

// =============================================================================
// Form Types
// =============================================================================

export interface ToolsForm {
	id: string;
	workflow_id: string;
	connection_id?: string;
	stage_id?: string;
	name: string;
	description?: string;
	/**
	 * Allowed roles for this form.
	 * - If connection_id is set: IGNORED (inherited from connection.allowed_roles)
	 * - If stage_id is set: USED (defines who can use this form action)
	 */
	allowed_roles?: string[];
	/**
	 * Visual/button configuration for this form.
	 * - If connection_id is set: IGNORED (inherited from connection.visual_config)
	 * - If stage_id is set: USED (defines the button appearance)
	 */
	visual_config?: VisualConfig;
}

// =============================================================================
// Form Field Types
// =============================================================================

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

// =============================================================================
// Field Option Types
// =============================================================================

/**
 * Option with optional explanation/description.
 * Used for dropdown, multiple_choice, and smart_dropdown mappings.
 */
export interface FieldOption {
	label: string;
	description?: string;
}

/**
 * Text field validation rules (short_text, long_text)
 */
export interface TextValidation {
	minLength?: number;
	maxLength?: number;
	pattern?: string; // regex pattern (short_text only)
}

/**
 * Number field validation rules
 */
export interface NumberValidation {
	min?: number;
	max?: number;
	step?: number;
}

/**
 * Date field options
 */
export interface DateFieldOptions {
	date_mode: 'date' | 'datetime' | 'time';
	prefill_now?: boolean;
}

/**
 * File upload field options
 */
export interface FileFieldOptions {
	allowed_file_types?: string[];
	max_files?: number;
}

/**
 * Options-based field options (dropdown, multiple_choice)
 */
export interface OptionsFieldOptions {
	options: FieldOption[];
}

/**
 * Multiple choice validation
 */
export interface MultipleChoiceValidation {
	minSelections?: number;
	maxSelections?: number;
}

/**
 * Smart dropdown mapping (conditional options)
 */
export interface SmartDropdownMapping {
	when: string; // Value from source field
	options: FieldOption[];
}

/**
 * Smart dropdown field options
 */
export interface SmartDropdownFieldOptions {
	source_field: string; // Field ID to base conditions on
	source_stage_id?: string; // For cross-stage references
	mappings: SmartDropdownMapping[];
}

/**
 * Entity source types for custom_table_selector field
 */
export type EntitySourceType = 'custom_table' | 'marker_category' | 'participants' | 'roles';

/**
 * Entity selector field options (custom_table_selector)
 * Supports selecting from custom tables, marker categories, participants, or roles.
 */
export interface EntitySelectorOptions {
	source_type: EntitySourceType;
	allow_multiple?: boolean;

	// For custom_table source
	custom_table_id?: string;
	display_field?: string;
	value_field?: string;

	// For marker_category source
	marker_category_id?: string;

	// For participants/roles source (role-based selection permissions)
	/** Roles that can only select themselves */
	self_select_roles?: string[];
	/** Roles that can select anyone from the project */
	any_select_roles?: string[];
}

export type ColumnPosition = 'left' | 'right' | 'full';

export interface ToolsFormField {
	id: string;
	form_id: string;
	field_label: string;
	field_type: FieldType;
	field_order?: number;
	page?: number;
	page_title?: string;
	row_index: number; // Which visual row (0-based)
	column_position: ColumnPosition; // 'left'/'right' = half width, 'full' = full width
	is_required?: boolean;
	placeholder?: string;
	help_text?: string;
	validation_rules?: Record<string, unknown>;
	field_options?: Record<string, unknown>;
	conditional_logic?: Record<string, unknown>;
}

// =============================================================================
// Edit Tool Types
// =============================================================================

export interface ToolsEdit {
	id: string;
	connection_id?: string;
	stage_id?: string;
	name: string;
	editable_fields: string[];
	/**
	 * Allowed roles for this edit tool.
	 * - If connection_id is set: IGNORED (inherited from connection.allowed_roles)
	 * - If stage_id is set: USED (defines who can use this edit action)
	 */
	allowed_roles?: string[];
	/**
	 * Visual/button configuration for this edit tool.
	 * - If connection_id is set: IGNORED (inherited from connection.visual_config)
	 * - If stage_id is set: USED (defines the button appearance)
	 */
	visual_config?: VisualConfig;
}

// =============================================================================
// Status Tracking
// =============================================================================

export type ItemStatus = 'unchanged' | 'new' | 'modified' | 'deleted';

export interface TrackedItem<T> {
	data: T;
	status: ItemStatus;
	/** Original data for comparison (only set for items loaded from DB) */
	original?: T;
}

// =============================================================================
// Convenience Types
// =============================================================================

export type TrackedStage = TrackedItem<WorkflowStage>;
export type TrackedConnection = TrackedItem<WorkflowConnection>;
export type TrackedForm = TrackedItem<ToolsForm>;
export type TrackedFormField = TrackedItem<ToolsFormField>;
export type TrackedEditTool = TrackedItem<ToolsEdit>;
