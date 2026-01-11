/**
 * Workflow Builder Types
 *
 * Type definitions for the workflow builder system including workflows,
 * stages, actions, form fields, and related entities.
 */

export interface Workflow {
  id: string;
  project_id: string;
  name: string;
  description: string;
  workflow_type: 'incident' | 'survey';
  marker_color: string;
  icon_config: Record<string, unknown>;
  is_active: boolean;
  created: string;
  updated: string;
}

export interface Stage {
  id: string;
  workflow_id: string;
  stage_key: string;
  stage_name: string;
  stage_type: 'start' | 'intermediate' | 'end';
  stage_order: number;
  max_duration_hours: number;
  visible_to_roles: string[];
  position_x: number;
  position_y: number;
  visual_config: Record<string, any>;
  form_id?: string;
  created: string;
}

export interface Action {
  id: string;
  workflow_id: string;
  from_stage_id: string;
  to_stage_id: string;
  action_name: string;
  action_type: 'forward' | 'edit';
  button_label: string;
  button_color: string;
  form_id?: string;
  allowed_roles: string[];
  conditions: Record<string, any>;
  requires_confirmation: boolean;
  confirmation_message: string;
  visual_config: Record<string, any>;
  created: string;
}

export type FieldType =
  | 'short'
  | 'long'
  | 'multiple'
  | 'dropdown'
  | 'smart_dropdown'
  | 'date'
  | 'file'
  | 'number'
  | 'email';

export interface FormField {
  id: string;
  form_id: string;
  field_key: string;
  field_label: string;
  field_type: FieldType;
  field_order: number;
  is_required: boolean;
  placeholder: string;
  help_text: string;
  validation_rules: Record<string, any>;
  field_options: Record<string, any>;
  conditional_logic: Record<string, any>;
  page: number;
  page_title: string;
  source_field_id?: string; // For smart dropdowns
  created: string;
}

export interface FieldMapping {
  id: string;
  field_id: string;
  source_value: string;
  target_options: Record<string, any>;
}

export interface WorkflowInstance {
  id: string;
  workflow_id: string;
  current_stage_id: string;
  status: string;
  title: string;
  created_by: string;
  created: string;
  updated: string;
}

export interface WorkflowSnapshot {
  id: string;
  workflow_id: string;
  name: string;
  description: string;
  snapshot_data: WorkflowSnapshotData;
  created: string;
}

export interface WorkflowSnapshotData {
  workflow: Workflow | null;
  stages: Map<string, Stage>;
  actions: Map<string, Action>;
  formFields: Map<string, FormField>;
}

export interface WorkflowExportData {
  workflow: Workflow;
  stages: Stage[];
  actions: Action[];
  formFields: FormField[];
  deletedStages: string[];
  deletedActions: string[];
  deletedQuestions: string[];
  deletedMappings: string[];
}

export interface DeletionResults {
  deletedStages: string[];
  deletedActions: string[];
  deletedQuestions: string[];
  deletedMappings: string[];
  protectedStages?: string[];
}

export interface ActiveInstanceCheck {
  hasActive: boolean;
  count: number;
  stageIds: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// UI-specific types
export interface CanvasViewport {
  zoom: number;
  panX: number;
  panY: number;
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface ConnectionPath {
  from: NodePosition;
  to: NodePosition;
  controlPoints: NodePosition[];
}
