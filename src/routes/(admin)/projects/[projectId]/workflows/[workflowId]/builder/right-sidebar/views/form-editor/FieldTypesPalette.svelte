<script lang="ts">
	import { FIELD_TYPES, type FieldType } from '$lib/workflow-builder';

	type Props = {
		expanded?: boolean;
		onFieldDrag?: (fieldType: FieldType) => void;
	};

	let { expanded = false, onFieldDrag }: Props = $props();

	// Drag state
	let draggingType = $state<FieldType | null>(null);

	// Custom drag preview element
	let dragPreviewRef = $state<HTMLDivElement | null>(null);

	function handleDragStart(e: DragEvent, fieldType: FieldType, label: string) {
		draggingType = fieldType;
		e.dataTransfer?.setData('fieldType', fieldType);
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'copy';

			// Create custom drag preview
			if (dragPreviewRef) {
				dragPreviewRef.textContent = label;
				dragPreviewRef.style.display = 'flex';
				e.dataTransfer.setDragImage(dragPreviewRef, 60, 20);
				// Hide after a tick
				requestAnimationFrame(() => {
					if (dragPreviewRef) dragPreviewRef.style.display = 'none';
				});
			}
		}
	}

	function handleDragEnd() {
		draggingType = null;
	}

	function handleClick(fieldType: FieldType) {
		// Click to add (alternative to drag)
		onFieldDrag?.(fieldType);
	}
</script>

<!-- Custom drag preview (hidden, used by setDragImage) -->
<div bind:this={dragPreviewRef} class="drag-preview" aria-hidden="true">
	Field
</div>

<div class="field-types-palette" class:expanded>
	<div class="palette-content">
		{#each FIELD_TYPES as fieldDef (fieldDef.type)}
			{@const Icon = fieldDef.icon}
			<button
				class="field-type-item"
				class:dragging={draggingType === fieldDef.type}
				draggable="true"
				ondragstart={(e) => handleDragStart(e, fieldDef.type, fieldDef.label)}
				ondragend={handleDragEnd}
				onclick={() => handleClick(fieldDef.type)}
				type="button"
				title={expanded ? undefined : `${fieldDef.label}: ${fieldDef.description}`}
			>
				<div class="field-type-icon">
					<Icon class="h-4 w-4" />
				</div>
				{#if expanded}
					<div class="field-type-info">
						<span class="field-type-label">{fieldDef.label}</span>
						<span class="field-type-desc">{fieldDef.description}</span>
					</div>
				{/if}
			</button>
		{/each}
	</div>
</div>

<style>
	/* Custom drag preview - styled card shown while dragging */
	.drag-preview {
		position: fixed;
		top: -100px;
		left: -100px;
		display: none;
		align-items: center;
		justify-content: center;
		padding: 0.5rem 1rem;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		font-size: 0.8125rem;
		font-weight: 600;
		border-radius: 0.375rem;
		box-shadow: 0 4px 12px hsl(var(--primary) / 0.3);
		white-space: nowrap;
		pointer-events: none;
		z-index: 9999;
	}

	.field-types-palette {
		display: flex;
		flex-direction: column;
		background: hsl(var(--card));
		overflow-y: auto;
		overflow-x: hidden;
		transition: width 0.2s ease;
		width: 48px;
	}

	.field-types-palette.expanded {
		width: 180px;
	}

	.palette-content {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 0.5rem;
	}

	.field-type-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 0.375rem;
		cursor: grab;
		transition: all 0.15s ease;
		text-align: left;
		width: 100%;
	}

	.field-type-item:hover {
		background: hsl(var(--accent));
		border-color: hsl(var(--border));
	}

	.field-type-item:active {
		cursor: grabbing;
	}

	.field-type-item.dragging {
		opacity: 0.5;
		border-color: hsl(var(--primary));
		background: hsl(var(--primary) / 0.1);
	}

	.field-type-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		flex-shrink: 0;
		background: hsl(var(--muted));
		border-radius: 0.25rem;
		color: hsl(var(--muted-foreground));
	}

	.field-type-item:hover .field-type-icon {
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary));
	}

	.field-type-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
		flex: 1;
	}

	.field-type-label {
		font-size: 0.8125rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.field-type-desc {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
