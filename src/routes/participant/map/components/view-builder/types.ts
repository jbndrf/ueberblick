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

export interface FilterableFieldOption {
	workflow_id: string;
	field_key: string;
	field_label: string;
	values: string[];
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
