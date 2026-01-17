/**
 * Map Module Types
 *
 * Selection context using discriminated unions for type-safe state management.
 */

import type {
	Marker,
	MarkerCategory,
	WorkflowInstance,
	Workflow
} from '$lib/participant-state/types';

// =============================================================================
// Selection Types (Discriminated Union)
// =============================================================================

export type SelectionType = 'none' | 'marker' | 'workflowInstance';

export interface NoSelection {
	type: 'none';
}

export interface MarkerSelection {
	type: 'marker';
	markerId: string;
}

export interface WorkflowInstanceSelection {
	type: 'workflowInstance';
	instanceId: string;
}

export type Selection = NoSelection | MarkerSelection | WorkflowInstanceSelection;

// =============================================================================
// Selection Helpers
// =============================================================================

export const createSelection = {
	none: (): NoSelection => ({ type: 'none' }),
	marker: (markerId: string): MarkerSelection => ({ type: 'marker', markerId }),
	workflowInstance: (instanceId: string): WorkflowInstanceSelection => ({ type: 'workflowInstance', instanceId })
};

// Type guards
export function isMarkerSelection(selection: Selection): selection is MarkerSelection {
	return selection.type === 'marker';
}

export function isWorkflowInstanceSelection(selection: Selection): selection is WorkflowInstanceSelection {
	return selection.type === 'workflowInstance';
}

// =============================================================================
// Navigation Types
// =============================================================================

export interface SelectionNavigation {
	currentIndex: number;
	total: number;
	canGoNext: boolean;
	canGoPrevious: boolean;
}

// =============================================================================
// UI State Types
// =============================================================================

export type TabId = 'overview' | 'details' | 'photos' | 'history';

// =============================================================================
// Action Types (for ActionRollBar)
// =============================================================================

export interface ActionButton {
	id: string;
	label: string;
	icon: string;
	color?: string;
	disabled?: boolean;
	onClick: () => void;
}

// =============================================================================
// Photo Types
// =============================================================================

export interface Photo {
	url: string;
	caption: string;
	stageName?: string;
	fieldKey: string;
}

// =============================================================================
// Audit Entry Types
// =============================================================================

export interface AuditEntry {
	id: string;
	executedAt: string;
	participantName: string;
	participantId: string;
	actionName: string;
	notes?: string;
	metadata?: Record<string, unknown>;
}

// =============================================================================
// Re-exports for convenience
// =============================================================================

export type {
	Marker,
	MarkerCategory,
	WorkflowInstance,
	Workflow
};
