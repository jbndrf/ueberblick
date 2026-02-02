/**
 * Stage Preview Types
 *
 * Shared types for the stage preview components that render
 * a participant-like sidebar in the workflow builder.
 */

import type { Edge } from '@xyflow/svelte';
import type { WorkflowStage, ToolsForm, ToolsEdit, ToolsFormField } from '$lib/workflow-builder';

/** A button action displayed in the participant preview */
export type StageAction =
	| {
			type: 'connection';
			id: string;
			buttonLabel: string;
			buttonColor?: string;
			allowed_roles?: string[];
			isEntry?: boolean;
			edge?: Edge;
			targetStage?: WorkflowStage;
			forms: ToolsForm[];
			editTools: ToolsEdit[];
	  }
	| {
			type: 'stage_tool';
			id: string;
			buttonLabel: string;
			buttonColor?: string;
			allowed_roles?: string[];
			tool: ToolsEdit;
	  }
	| {
			type: 'stage_form';
			id: string;
			buttonLabel: string;
			buttonColor?: string;
			allowed_roles?: string[];
			form: ToolsForm;
	  }
	| {
			type: 'global_tool';
			id: string;
			buttonLabel: string;
			buttonColor?: string;
			allowed_roles?: string[];
			tool: ToolsEdit;
	  };

/** A stage in the progress timeline */
export interface TimelineStage {
	id: string;
	name: string;
	status: 'completed' | 'current' | 'future';
}

/** Role type for filtering */
export interface Role {
	id: string;
	name: string;
	description?: string;
}

/** What's shown in the left config panel */
export type ConfigPanelMode =
	| { type: 'collapsed' }
	| { type: 'button-config'; actionId: string }
	| { type: 'add-picker' };

/** Default button color by action type (single source of truth) */
export function getDefaultButtonColor(actionType: StageAction['type']): string {
	switch (actionType) {
		case 'connection': return '#64748b';   // slate-500 -- cool blue-grey
		case 'stage_tool': return '#57534e';   // stone-600 -- warm dark grey
		case 'stage_form': return '#57534e';   // stone-600 -- warm dark grey
		case 'global_tool': return '#6b7280';  // gray-500  -- neutral mid grey
		default: return '#64748b';
	}
}

/** Form fields collected via an incoming connection */
export interface IncomingFormGroup {
	connectionName: string;
	form: ToolsForm;
	fields: ToolsFormField[];
}
