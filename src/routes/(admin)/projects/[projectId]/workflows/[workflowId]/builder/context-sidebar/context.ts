/**
 * Context Sidebar - Selection Context Types
 *
 * Defines what can be selected in the workflow builder and
 * what data is available for each selection type.
 */

import type { Node, Edge } from '@xyflow/svelte';

// Stage data shape (from StageNode)
export type StageData = {
	title: string;
	key: string;
	stageType: 'start' | 'intermediate' | 'end';
	maxHours?: number | null;
};

// Form field shape (will be expanded later)
export type FormFieldData = {
	id: string;
	fieldKey: string;
	fieldLabel: string;
	fieldType: string;
	isRequired: boolean;
	stageId: string;
};

// Selection context union type
export type SelectionContext =
	| { type: 'none' }
	| { type: 'stage'; stageId: string; stage: Node<StageData> }
	| { type: 'action'; actionId: string; action: Edge }
	| { type: 'field'; fieldId: string; field: FormFieldData; stageId: string };

// Helper to create contexts
export const createContext = {
	none: (): SelectionContext => ({ type: 'none' }),

	stage: (stage: Node<StageData>): SelectionContext => ({
		type: 'stage',
		stageId: stage.id,
		stage
	}),

	action: (action: Edge): SelectionContext => ({
		type: 'action',
		actionId: action.id,
		action
	}),

	field: (field: FormFieldData, stageId: string): SelectionContext => ({
		type: 'field',
		fieldId: field.id,
		field,
		stageId
	})
};

// Type guards for narrowing
export function isStageContext(ctx: SelectionContext): ctx is Extract<SelectionContext, { type: 'stage' }> {
	return ctx.type === 'stage';
}

export function isActionContext(ctx: SelectionContext): ctx is Extract<SelectionContext, { type: 'action' }> {
	return ctx.type === 'action';
}

export function isFieldContext(ctx: SelectionContext): ctx is Extract<SelectionContext, { type: 'field' }> {
	return ctx.type === 'field';
}
