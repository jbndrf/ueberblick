<script lang="ts">
	import DropZone from './DropZone.svelte';
	import type { DropTargetType, DropPosition, DropTarget } from './drag-drop.svelte';
	import type { ColumnPosition } from '$lib/workflow-builder';

	type Props = {
		/** Current drop target (to check if this row is active) */
		target: DropTarget;
		/** Type of drop zone row (new-row or between-row) */
		rowType: DropTargetType;
		/** Row index for this drop zone */
		rowIndex: number;
		/** Preview text to show when hovering */
		previewText?: string;
		/** Use smaller styling for between-row indicators */
		small?: boolean;
		/** Callback when drop occurs */
		onDrop: (rowIndex: number, position: ColumnPosition) => void;
		/** Callback to update hover target */
		onTargetChange: (target: DropTarget) => void;
	};

	let {
		target,
		rowType,
		rowIndex,
		previewText = 'New field',
		small = false,
		onDrop,
		onTargetChange
	}: Props = $props();

	function isActive(pos: DropPosition): boolean {
		return target?.type === rowType && target?.rowIndex === rowIndex && target?.position === pos;
	}

	function handleDragOver(e: DragEvent, position: DropPosition) {
		e.preventDefault();
		e.stopPropagation();
		onTargetChange({ type: rowType, position, rowIndex });
	}

	function handleDrop(e: DragEvent, position: DropPosition) {
		e.preventDefault();
		e.stopPropagation();
		const colPos: ColumnPosition = position === 'middle' ? 'full' : position;
		onDrop(rowIndex, colPos);
	}

	function handleDragLeave() {
		// Let parent handle clearing target on form leave
	}

	const isExpanded = $derived(target?.rowIndex === rowIndex && target?.type === rowType);
</script>

<div
	class="drop-zone-row"
	class:expanded={isExpanded}
	class:small
>
	<DropZone
		position="left"
		active={isActive('left')}
		{previewText}
		{small}
		ondragover={(e) => handleDragOver(e, 'left')}
		ondrop={(e) => handleDrop(e, 'left')}
		ondragleave={handleDragLeave}
	/>
	<DropZone
		position="middle"
		active={isActive('middle')}
		{previewText}
		{small}
		ondragover={(e) => handleDragOver(e, 'middle')}
		ondrop={(e) => handleDrop(e, 'middle')}
		ondragleave={handleDragLeave}
	/>
	<DropZone
		position="right"
		active={isActive('right')}
		{previewText}
		{small}
		ondragover={(e) => handleDragOver(e, 'right')}
		ondrop={(e) => handleDrop(e, 'right')}
		ondragleave={handleDragLeave}
	/>
</div>

<style>
	.drop-zone-row {
		display: flex;
		border: 3px dashed #888;
		border-radius: 0.5rem;
		min-height: 60px;
		overflow: hidden;
		background: hsl(var(--muted) / 0.1);
		transition: all 0.2s ease;
	}

	.drop-zone-row.expanded {
		min-height: 80px;
		border-color: hsl(var(--primary));
	}

	/* Small variant for between-row indicators */
	.drop-zone-row.small {
		min-height: 12px;
		border-width: 2px;
		border-radius: 4px;
		margin: 0.25rem 0;
	}

	.drop-zone-row.small:hover,
	.drop-zone-row.small.expanded {
		min-height: 50px;
		border-color: hsl(var(--primary));
	}

	.drop-zone-row.small :global(.drop-zone-cell) {
		min-height: auto;
		height: 100%;
		border-right-width: 2px;
	}
</style>
