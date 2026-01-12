<script lang="ts">
	import { AlignLeft, AlignRight, Maximize2 } from 'lucide-svelte';
	import type { DropPosition } from './drag-drop.svelte';

	type Props = {
		position: DropPosition;
		active?: boolean;
		previewText?: string;
		small?: boolean;
		ondragover: (e: DragEvent) => void;
		ondrop: (e: DragEvent) => void;
		ondragleave?: () => void;
	};

	let {
		position,
		active = false,
		previewText,
		small = false,
		ondragover,
		ondrop,
		ondragleave
	}: Props = $props();

	const icons = {
		left: AlignLeft,
		right: AlignRight,
		middle: Maximize2
	};

	const Icon = $derived(icons[position]);
	const showPreview = $derived(active && previewText);
</script>

<div
	class="drop-zone-cell"
	class:active
	role="button"
	tabindex="-1"
	{ondragover}
	{ondrop}
	ondragleave={ondragleave}
>
	{#if showPreview}
		<div class="preview-placeholder" class:small class:full-width={position === 'middle'}>
			{previewText}
		</div>
	{:else}
		<Icon class="zone-icon" />
	{/if}
</div>

<style>
	.drop-zone-cell {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		border-right: 3px dashed #888;
		transition: all 0.15s ease;
		cursor: pointer;
		background: hsl(var(--muted) / 0.2);
		padding: 0.5rem;
	}

	.drop-zone-cell:last-child {
		border-right: none;
	}

	.drop-zone-cell:hover,
	.drop-zone-cell.active {
		background: hsl(var(--primary) / 0.15);
		border-color: hsl(var(--primary));
	}

	.drop-zone-cell.active {
		background: hsl(var(--primary) / 0.2);
	}

	.drop-zone-cell :global(.zone-icon) {
		width: 20px;
		height: 20px;
		color: #666;
		transition: color 0.15s ease, transform 0.15s ease;
	}

	.drop-zone-cell:hover :global(.zone-icon),
	.drop-zone-cell.active :global(.zone-icon) {
		color: hsl(var(--primary));
		transform: scale(1.15);
	}

	.preview-placeholder {
		background: hsl(var(--muted));
		border: 2px dashed hsl(var(--primary));
		border-radius: 0.375rem;
		padding: 1rem;
		color: hsl(var(--muted-foreground));
		font-size: 0.75rem;
		text-align: center;
		width: 100%;
		min-height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.preview-placeholder.small {
		padding: 0.5rem;
		min-height: 32px;
		font-size: 0.65rem;
	}

	.preview-placeholder.full-width {
		flex: 1;
	}
</style>
