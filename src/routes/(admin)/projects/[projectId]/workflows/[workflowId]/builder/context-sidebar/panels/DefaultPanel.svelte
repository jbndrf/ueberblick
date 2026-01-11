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
				class="drag-item drag-item-start border border-border"
				class:disabled={hasStartStage}
				draggable={!hasStartStage}
				ondragstart={(e) => onDragStart(e, 'start')}
				role="button"
				tabindex="0"
			>
				<GripVertical class="drag-handle text-muted-foreground" />
				<Play class="drag-icon text-foreground" />
				<span class="drag-label text-foreground">Start</span>
			</div>
			<div
				class="drag-item drag-item-stage border border-border"
				draggable="true"
				ondragstart={(e) => onDragStart(e, 'intermediate')}
				role="button"
				tabindex="0"
			>
				<GripVertical class="drag-handle text-muted-foreground" />
				<Square class="drag-icon text-foreground" />
				<span class="drag-label text-foreground">Stage</span>
			</div>
			<div
				class="drag-item drag-item-end border border-border"
				draggable="true"
				ondragstart={(e) => onDragStart(e, 'end')}
				role="button"
				tabindex="0"
			>
				<GripVertical class="drag-handle text-muted-foreground" />
				<CircleStop class="drag-icon text-foreground" />
				<span class="drag-label text-foreground">End</span>
			</div>
		</div>
	</ToolSection>

	<div class="panel-hint border-t border-border">
		<p class="text-muted-foreground">Drag stages onto the canvas to add them.</p>
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
		padding: 0.625rem 0.875rem;
		border-radius: 0.375rem;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		cursor: grab;
		transition: all 0.2s ease;
	}

	.drag-item:hover:not(.disabled) {
		transform: translateY(-1px);
		box-shadow: 0 2px 4px hsl(var(--foreground) / 0.08);
	}

	.drag-item:active:not(.disabled) {
		cursor: grabbing;
		transform: translateY(0);
	}

	.drag-item.disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.drag-item-start {
		border-left: 3px solid rgb(34 197 94);
		background: hsl(142 76% 95%);
	}

	:global(:root.dark) .drag-item-start {
		background: hsl(142 40% 12%);
	}

	.drag-item-start:hover:not(.disabled) {
		border-color: rgb(34 197 94);
		background: hsl(142 76% 90%);
	}

	:global(:root.dark) .drag-item-start:hover:not(.disabled) {
		background: hsl(142 40% 18%);
	}

	.drag-item-stage {
		border-left: 3px solid rgb(59 130 246);
		background: hsl(217 91% 95%);
	}

	:global(:root.dark) .drag-item-stage {
		background: hsl(217 40% 12%);
	}

	.drag-item-stage:hover:not(.disabled) {
		border-color: rgb(59 130 246);
		background: hsl(217 91% 90%);
	}

	:global(:root.dark) .drag-item-stage:hover:not(.disabled) {
		background: hsl(217 40% 18%);
	}

	.drag-item-end {
		border-left: 3px solid rgb(236 72 153);
		background: hsl(330 81% 95%);
	}

	:global(:root.dark) .drag-item-end {
		background: hsl(330 40% 12%);
	}

	.drag-item-end:hover:not(.disabled) {
		border-color: rgb(236 72 153);
		background: hsl(330 81% 90%);
	}

	:global(:root.dark) .drag-item-end:hover:not(.disabled) {
		background: hsl(330 40% 18%);
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
