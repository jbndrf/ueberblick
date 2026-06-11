<script lang="ts">
	import { getBuilderContext } from '../builder-context.svelte';
	import { inspectorRegistry } from './registry';

	const { ui } = getBuilderContext();

	const entry = $derived(inspectorRegistry[ui.selection.type]);
	const InspectorView = $derived(entry.component);
	const wide = $derived(entry.wide === true);
	const expanded = $derived(ui.selection.type === 'form' && ui.paletteExpanded);
</script>

<aside class="inspector" class:wide class:expanded>
	<InspectorView />
</aside>

<style>
	.inspector {
		width: 360px;
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		background: oklch(0.965 0.005 250);
		border-left: 1px solid oklch(0.88 0.01 250);
		box-shadow: -2px 0 12px oklch(0 0 0 / 0.06);
		overflow: hidden;
		transition: width 0.2s ease;
	}

	/* Wide mode (~375px mobile width + collapsed palette) */
	.inspector.wide {
		width: 520px;
	}

	/* Expanded mode when the form palette is expanded (+130px for labels) */
	.inspector.wide.expanded {
		width: 650px;
	}

	:global(.dark) .inspector {
		background: hsl(var(--muted));
		border-left-color: oklch(1 0 0 / 20%);
		box-shadow: -2px 0 8px oklch(0 0 0 / 0.3);
	}
</style>
