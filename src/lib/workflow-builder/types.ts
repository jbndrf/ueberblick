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

export interface WorkflowConnection {
	id: string;
	workflow_id: string;
	from_stage_id: string | null; // null = entry connection (workflow start point)
	to_stage_id: string;
	action_name: string;
	allowed_roles?: string[];
	visual_config?: {
		button_label?: string;
		button_color?: string;
		requires_confirmation?: boolean;
		confirmation_message?: string;
	};
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
	allowed_roles?: string[];
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
	| 'smart_dropdown';

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
	editable_fields: string[];
	allowed_roles?: string[];
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
