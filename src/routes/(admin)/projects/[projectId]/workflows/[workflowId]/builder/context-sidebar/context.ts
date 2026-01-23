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

// Form context data
export type FormContextData = {
	formId: string;
	/** Connection or stage this form is attached to */
	attachedTo: { type: 'connection'; connectionId: string } | { type: 'stage'; stageId: string };
};

// Edit tool context data
export type EditToolContextData = {
	editToolId: string;
	/** Connection, stage, or global (all stages) this edit tool is attached to */
	attachedTo: { type: 'connection'; connectionId: string } | { type: 'stage'; stageId: string } | { type: 'global' };
};

// Add tool picker context (shows tool picker in context sidebar)
export type AddToolContextData = {
	/** Where to attach the new tool */
	attachedTo: { type: 'connection'; connectionId: string } | { type: 'stage'; stageId: string } | { type: 'global' };
};

// Selection context union type
export type SelectionContext =
	| { type: 'none' }
	| { type: 'stage'; stageId: string; stage: Node<StageData> }
	| { type: 'action'; actionId: string; action: Edge }
	| { type: 'field'; fieldId: string; field: FormFieldData; stageId: string }
	| { type: 'form'; formId: string; attachedTo: FormContextData['attachedTo'] }
	| { type: 'editTool'; editToolId: string; attachedTo: EditToolContextData['attachedTo'] }
	| { type: 'addTool'; attachedTo: AddToolContextData['attachedTo'] }
	| { type: 'globalTools' };

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
	}),

	form: (formId: string, attachedTo: FormContextData['attachedTo']): SelectionContext => ({
		type: 'form',
		formId,
		attachedTo
	}),

	editTool: (
		editToolId: string,
		attachedTo: EditToolContextData['attachedTo']
	): SelectionContext => ({
		type: 'editTool',
		editToolId,
		attachedTo
	}),

	addTool: (attachedTo: AddToolContextData['attachedTo']): SelectionContext => ({
		type: 'addTool',
		attachedTo
	}),

	globalTools: (): SelectionContext => ({ type: 'globalTools' })
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

export function isFormContext(ctx: SelectionContext): ctx is Extract<SelectionContext, { type: 'form' }> {
	return ctx.type === 'form';
}

export function isEditToolContext(
	ctx: SelectionContext
): ctx is Extract<SelectionContext, { type: 'editTool' }> {
	return ctx.type === 'editTool';
}

export function isAddToolContext(
	ctx: SelectionContext
): ctx is Extract<SelectionContext, { type: 'addTool' }> {
	return ctx.type === 'addTool';
}

export function isGlobalToolsContext(
	ctx: SelectionContext
): ctx is Extract<SelectionContext, { type: 'globalTools' }> {
	return ctx.type === 'globalTools';
}
