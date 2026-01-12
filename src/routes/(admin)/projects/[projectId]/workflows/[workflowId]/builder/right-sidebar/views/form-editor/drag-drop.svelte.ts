/**
 * Unified Drag-Drop State for Form Builder
 *
 * Consolidates the two parallel drag-drop systems (new field drops and field reordering)
 * into a single state management module.
 */

import type { ColumnPosition } from '$lib/workflow-builder';

export type DragMode = 'none' | 'new-field' | 'reorder';

export type DropTargetType = 'new-row' | 'between-row' | 'existing-row' | 'empty-side';

export type DropPosition = 'left' | 'middle' | 'right';

export type DropTarget = {
	type: DropTargetType;
	position: DropPosition;
	rowIndex: number;
	/** Field to squeeze when previewing beside full-width */
	squeezeFieldId?: string;
} | null;

export function createDragDropState() {
	let mode = $state<DragMode>('none');
	let draggedFieldType = $state<string | null>(null);
	let draggedFieldId = $state<string | null>(null);
	let target = $state<DropTarget>(null);

	// Derived state for template conditions
	const isDraggingNewField = $derived(mode === 'new-field');
	const isDraggingExisting = $derived(mode === 'reorder');
	const isDragging = $derived(mode !== 'none');

	function startNewFieldDrag() {
		mode = 'new-field';
	}

	function startReorderDrag(fieldId: string) {
		mode = 'reorder';
		draggedFieldId = fieldId;
	}

	function setTarget(newTarget: DropTarget) {
		target = newTarget;
	}

	function reset() {
		mode = 'none';
		draggedFieldType = null;
		draggedFieldId = null;
		target = null;
	}

	/**
	 * Convert drop position to column position for field placement
	 */
	function getColumnPosition(): ColumnPosition {
		if (!target) return 'full';
		if (target.position === 'middle') return 'full';
		return target.position as ColumnPosition;
	}

	return {
		// State getters
		get mode() {
			return mode;
		},
		get draggedFieldType() {
			return draggedFieldType;
		},
		get draggedFieldId() {
			return draggedFieldId;
		},
		get target() {
			return target;
		},
		get isDraggingNewField() {
			return isDraggingNewField;
		},
		get isDraggingExisting() {
			return isDraggingExisting;
		},
		get isDragging() {
			return isDragging;
		},
		// Methods
		startNewFieldDrag,
		startReorderDrag,
		setTarget,
		reset,
		getColumnPosition
	};
}

export type DragDropState = ReturnType<typeof createDragDropState>;
