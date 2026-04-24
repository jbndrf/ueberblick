import type { FilterClause } from '$lib/participant-state/types';

export type ClauseKind = FilterClause['field'];

export interface WorkflowOption {
	id: string;
	name: string;
}

export interface StageOption {
	id: string;
	workflow_id: string;
	name: string;
}

/**
 * Form field the participant can filter by. One row per (workflow, field).
 *
 * `field_type` drives which value-editor the builder renders:
 *   - short_text / long_text / email  →  contains (text) editor
 *   - number                          →  number range editor
 *   - date                            →  date range editor
 *   - dropdown / multiple_choice /
 *     smart_dropdown /
 *     custom_table_selector           →  multi-select from `options`
 *
 * `options` is populated only for the multi-select family. For types whose
 * option list is dynamic or not yet resolvable (e.g. smart_dropdown with
 * mappings we haven't flattened), the builder falls back to a contains
 * editor so the field is still filterable.
 */
export type FilterableFieldType =
	| 'short_text'
	| 'long_text'
	| 'email'
	| 'number'
	| 'date'
	| 'dropdown'
	| 'multiple_choice'
	| 'smart_dropdown'
	| 'custom_table_selector';

export interface FilterableFieldOption {
	workflow_id: string;
	workflow_name: string;
	field_key: string;
	field_label: string;
	field_type: FilterableFieldType;
	/** Populated for select-family types. Empty otherwise. */
	options: { id: string; label: string }[];
}

export interface CreatorOption {
	id: string;
	label: string;
}

export interface BuilderContext {
	workflows: WorkflowOption[];
	stagesByWorkflow: Map<string, StageOption[]>;
	filterableFields: FilterableFieldOption[];
	creators: CreatorOption[];
}
