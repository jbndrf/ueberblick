<script lang="ts">
	import { Play, Square, CircleStop, GripVertical } from 'lucide-svelte';
	import ToolSection from '../shared/ToolSection.svelte';

	type Props = {
		hasStartStage: boolean;
	};

	let { hasStartStage }: Props = $props();

	function onDragStart(event: DragEvent, nodeType: 'start' | 'intermediate' | 'end') {
		if (!event.dataTransfer) return;
		event.dataTransfer.setData('application/xyflow', nodeType);
		event.dataTransfer.effectAllowed = 'move';
	}
</script>

<div class="panel">
	<ToolSection title="Stages">
		<div class="tool-grid">
			<div
				class="drag-item drag-item-start"
				class:disabled={hasStartStage}
				draggable={!hasStartStage}
				ondragstart={(e) => onDragStart(e, 'start')}
				role="button"
				tabindex="0"
			>
				<GripVertical class="drag-handle" />
				<Play class="drag-icon" />
				<span class="drag-label">Start</span>
			</div>
			<div
				class="drag-item drag-item-stage"
				draggable="true"
				ondragstart={(e) => onDragStart(e, 'intermediate')}
				role="button"
				tabindex="0"
			>
				<GripVertical class="drag-handle" />
				<Square class="drag-icon" />
				<span class="drag-label">Stage</span>
			</div>
			<div
				class="drag-item drag-item-end"
				draggable="true"
				ondragstart={(e) => onDragStart(e, 'end')}
				role="button"
				tabindex="0"
			>
				<GripVertical class="drag-handle" />
				<CircleStop class="drag-icon" />
				<span class="drag-label">End</span>
			</div>
		</div>
	</ToolSection>

	<div class="panel-hint">
		<p>Drag stages onto the canvas to add them.</p>
	</div>
</div>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.tool-grid {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.drag-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-radius: 0.375rem;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		cursor: grab;
		transition: all 0.15s;
	}

	.drag-item:hover:not(.disabled) {
		border-color: hsl(var(--primary));
		background: hsl(var(--accent));
	}

	.drag-item:active:not(.disabled) {
		cursor: grabbing;
	}

	.drag-item.disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.drag-item-start {
		border-left: 3px solid rgb(34 197 94);
	}

	.drag-item-stage {
		border-left: 3px solid rgb(59 130 246);
	}

	.drag-item-end {
		border-left: 3px solid rgb(236 72 153);
	}

	.drag-item :global(.drag-handle) {
		width: 0.875rem;
		height: 0.875rem;
		color: hsl(var(--muted-foreground));
	}

	.drag-item :global(.drag-icon) {
		width: 1rem;
		height: 1rem;
		color: hsl(var(--foreground));
	}

	.drag-label {
		font-size: 0.8125rem;
		font-weight: 500;
	}

	.panel-hint {
		margin-top: auto;
		padding: 1rem;
		border-top: 1px solid hsl(var(--border));
	}

	.panel-hint p {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		text-align: center;
		margin: 0;
	}
</style>
