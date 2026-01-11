<script lang="ts">
	import { type MarkerShape, getShapeIcon, getShapeLabel } from '$lib/utils/marker-style-presets';

	interface Props {
		value: MarkerShape;
		onchange?: (shape: MarkerShape) => void;
	}

	let { value = $bindable(), onchange }: Props = $props();

	const shapes: MarkerShape[] = ['circle', 'square', 'rounded', 'hexagon', 'diamond', 'star', 'shield', 'none'];

	function handleSelect(shape: MarkerShape) {
		value = shape;
		onchange?.(shape);
	}
</script>

<div class="space-y-3">
	<div class="text-sm font-medium">Background Shape</div>
	<div class="grid grid-cols-4 gap-2">
		{#each shapes as shape}
			<button
				type="button"
				onclick={() => handleSelect(shape)}
				class="flex flex-col items-center justify-center gap-1 rounded-lg border-2 p-3 transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary {value ===
				shape
					? 'border-primary bg-primary text-primary-foreground'
					: 'border-border bg-background hover:border-primary/50'}"
				aria-label={getShapeLabel(shape)}
				aria-pressed={value === shape}
			>
				<span class="text-2xl" aria-hidden="true">{getShapeIcon(shape)}</span>
				<span class="text-xs font-medium">{getShapeLabel(shape)}</span>
			</button>
		{/each}
	</div>
</div>
