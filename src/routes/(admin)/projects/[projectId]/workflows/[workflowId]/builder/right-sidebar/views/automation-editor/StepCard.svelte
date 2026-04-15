<script lang="ts">
	import { GripVertical } from 'lucide-svelte';
	import * as m from '$lib/paraglide/messages';
	import type { AutomationStep } from '$lib/workflow-builder';

	type Props = {
		step: AutomationStep;
		index: number;
		selected?: boolean;
		onSelect?: () => void;
		onDragStart?: (e: DragEvent) => void;
		onDragOver?: (e: DragEvent) => void;
		onDrop?: (e: DragEvent) => void;
		onDragEnd?: () => void;
	};

	let {
		step,
		index,
		selected = false,
		onSelect,
		onDragStart,
		onDragOver,
		onDrop,
		onDragEnd
	}: Props = $props();

	const conditionCount = $derived(step.conditions?.conditions?.length ?? 0);
	const actionCount = $derived(step.actions.length);

	function getSummary(): string {
		const parts: string[] = [];
		if (conditionCount > 0) {
			parts.push(`${conditionCount} condition${conditionCount !== 1 ? 's' : ''}`);
		}
		if (actionCount > 0) {
			parts.push(`${actionCount} action${actionCount !== 1 ? 's' : ''}`);
		}
		return parts.length > 0 ? parts.join(', ') : (m.automationStepCardNoConditionsOrActions?.() ?? 'No conditions or actions');
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="step-card"
	class:selected
	onclick={onSelect}
	draggable="true"
	ondragstart={onDragStart}
	ondragover={onDragOver}
	ondrop={onDrop}
	ondragend={onDragEnd}
	role="button"
	tabindex="0"
	onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(); } }}
>
	<div class="drag-handle" aria-hidden="true">
		<GripVertical class="h-3 w-3" />
	</div>
	<div class="step-info">
		<div class="step-name-row">
			<span class="step-number">{index + 1}</span>
			<span class="step-name">{step.name || `Step ${index + 1}`}</span>
		</div>
		<span class="step-summary">{getSummary()}</span>
	</div>
</div>

<style>
	.step-card {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.625rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		background: hsl(var(--background));
		cursor: pointer;
		transition: all 0.15s;
		user-select: none;
	}

	.step-card:hover {
		background: hsl(var(--accent) / 0.3);
		border-color: hsl(var(--primary) / 0.2);
	}

	.step-card.selected {
		background: hsl(var(--primary) / 0.05);
		border-color: hsl(var(--primary) / 0.4);
		box-shadow: 0 0 0 1px hsl(var(--primary) / 0.1);
	}

	.drag-handle {
		display: flex;
		align-items: center;
		cursor: grab;
		color: hsl(var(--muted-foreground) / 0.5);
		flex-shrink: 0;
		padding: 0.125rem;
	}

	.drag-handle:active {
		cursor: grabbing;
	}

	.step-card:hover .drag-handle {
		color: hsl(var(--muted-foreground));
	}

	.step-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.step-name-row {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.step-number {
		font-size: 0.625rem;
		font-weight: 700;
		color: hsl(var(--primary));
		background: hsl(var(--primary) / 0.1);
		width: 1.125rem;
		height: 1.125rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 0.25rem;
		flex-shrink: 0;
	}

	.step-name {
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.step-summary {
		font-size: 0.625rem;
		color: hsl(var(--muted-foreground));
		padding-left: 1.5rem;
	}
</style>
