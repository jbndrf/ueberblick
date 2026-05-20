<script lang="ts">
	import { Library } from '@lucide/svelte';
	import type { WorkflowFieldDef } from '$lib/workflow-builder';

	type Props = {
		expanded?: boolean;
		fieldDefs: WorkflowFieldDef[];
		/** Def ids already referenced by the current form (rendered greyed-out). */
		usedDefIds?: Set<string>;
		onPick?: (fieldDefId: string) => void;
	};

	let { expanded = false, fieldDefs, usedDefIds = new Set(), onPick }: Props = $props();

	let draggingId = $state<string | null>(null);

	function handleDragStart(e: DragEvent, defId: string, label: string) {
		draggingId = defId;
		e.dataTransfer?.setData('fieldDefId', defId);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
	}

	function handleDragEnd() {
		draggingId = null;
	}
</script>

<div class="palette" class:expanded>
	<div class="palette-header">
		<Library class="h-3.5 w-3.5 text-muted-foreground" />
		{#if expanded}<span class="palette-title">From library</span>{/if}
	</div>
	<div class="palette-content">
		{#if fieldDefs.length === 0}
			{#if expanded}
				<p class="empty">No workflow fields yet. Use the Fields panel to define some.</p>
			{/if}
		{:else}
			{#each fieldDefs as def (def.id)}
				{@const isUsed = usedDefIds.has(def.id)}
				<button
					class="item"
					class:dragging={draggingId === def.id}
					class:used={isUsed}
					draggable={!isUsed}
					ondragstart={(e) => handleDragStart(e, def.id, def.label)}
					ondragend={handleDragEnd}
					onclick={() => !isUsed && onPick?.(def.id)}
					disabled={isUsed}
					type="button"
					title={expanded ? undefined : `${def.label} (${def.field_type}, ${def.write_mode})${isUsed ? ' — already on this form' : ''}`}
				>
					<div class="dot" data-mode={def.write_mode}></div>
					{#if expanded}
						<div class="info">
							<span class="label">{def.label || '(unnamed)'}</span>
							<span class="meta">{def.field_type} · {def.write_mode}</span>
						</div>
					{/if}
				</button>
			{/each}
		{/if}
	</div>
</div>

<style>
	.palette {
		display: flex;
		flex-direction: column;
		background: hsl(var(--card));
		border-bottom: 1px solid hsl(var(--border));
		overflow-y: auto;
		max-height: 40vh;
		transition: width 0.2s ease;
		width: 48px;
	}

	.palette.expanded {
		width: 180px;
	}

	.palette-header {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem;
		border-bottom: 1px solid hsl(var(--border));
	}

	.palette-title {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: hsl(var(--muted-foreground));
	}

	.palette-content {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 0.5rem;
	}

	.empty {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		padding: 0.5rem;
		text-align: center;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 0.375rem;
		cursor: grab;
		text-align: left;
		width: 100%;
		transition: all 0.15s ease;
	}

	.item:hover:not(.used) {
		background: hsl(var(--accent));
		border-color: hsl(var(--border));
	}

	.item.used {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.item.dragging {
		opacity: 0.5;
		border-color: hsl(var(--primary));
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
		background: hsl(var(--muted-foreground));
	}

	.dot[data-mode='singleton'] {
		background: hsl(220 70% 55%);
	}

	.dot[data-mode='observation'] {
		background: hsl(160 65% 45%);
	}

	.dot[data-mode='computed'] {
		background: hsl(280 60% 60%);
	}

	.info {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}

	.label {
		font-size: 0.8125rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.meta {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
