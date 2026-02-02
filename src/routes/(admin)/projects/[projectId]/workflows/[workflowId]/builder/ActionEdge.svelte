<script lang="ts">
	import { BaseEdge, EdgeLabel, getBezierPath, type EdgeProps } from '@xyflow/svelte';
	import { ToolBar } from '$lib/workflow-builder/components';
	import type { ToolInstance } from '$lib/workflow-builder/tools';

	type ActionEdgeData = {
		tools?: ToolInstance[];
		selectedToolId?: string;
		isSelfLoop?: boolean;
		onSelectTool?: (toolId: string) => void;
		onAddTool?: () => void;
	};

	let {
		id,
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
		data,
		markerEnd,
		selected
	}: EdgeProps<ActionEdgeData> = $props();

	const tools = $derived(data?.tools ?? []);
	const isSelfLoop = $derived(data?.isSelfLoop ?? false);

	// For self-loops, create a circular looping path above the node
	function getSelfLoopPath(sx: number, sy: number, tx: number, ty: number) {
		const loopExtent = 90;

		// Control points route the path through a loop above the node
		const cp1x = sx + loopExtent;
		const cp1y = sy - loopExtent;
		const cp2x = tx - loopExtent;
		const cp2y = ty - loopExtent;

		const path = `M ${sx},${sy} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${tx},${ty}`;
		const labelX = (sx + tx) / 2;
		const labelY = Math.min(sy, ty) - loopExtent + 15;

		return [path, labelX, labelY] as const;
	}

	// Calculate path and label position using $derived for synchronous updates
	const pathData = $derived.by(() => {
		if (isSelfLoop) {
			return getSelfLoopPath(sourceX, sourceY, targetX, targetY);
		} else {
			return getBezierPath({
				sourceX,
				sourceY,
				sourcePosition,
				targetX,
				targetY,
				targetPosition
			});
		}
	});

	const edgePath = $derived(pathData[0]);
	const labelX = $derived(pathData[1]);
	const labelY = $derived(pathData[2]);

	// Calculate line direction for tool bar orientation
	// Vertical/diagonal lines -> horizontal toolbar (tools beside +)
	// Horizontal lines -> vertical toolbar (tools above/below +)
	const toolbarDirection = $derived.by((): 'horizontal' | 'vertical' => {
		if (isSelfLoop) return 'horizontal'; // Self-loops always horizontal

		const dx = targetX - sourceX;
		const dy = targetY - sourceY;
		const angle = Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));

		// If angle is between 45-135 degrees (mostly vertical), use horizontal toolbar
		// Otherwise (mostly horizontal), use vertical toolbar
		return angle > 45 && angle < 135 ? 'horizontal' : 'vertical';
	});
</script>

<BaseEdge path={edgePath} {markerEnd} />

<!-- Tool bar positioned at edge midpoint, direction based on line angle -->
<EdgeLabel x={labelX} y={labelY}>
	<div class="edge-toolbar-container nodrag nopan">
		<ToolBar
			{tools}
			selectedToolId={data?.selectedToolId}
			onSelectTool={data?.onSelectTool}
			onAddTool={data?.onAddTool}
			direction={toolbarDirection}
		/>
	</div>
</EdgeLabel>

<style>
	.edge-toolbar-container {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	:global(.svelte-flow__edge-path) {
		stroke: #64748b;
		stroke-width: 2;
	}

	:global(.svelte-flow__edge.entry-edge .svelte-flow__edge-path) {
		stroke: rgb(34 197 94);
		stroke-dasharray: 5 5;
	}

	:global(.svelte-flow__edge.selected .svelte-flow__edge-path) {
		stroke: hsl(var(--primary));
		stroke-width: 2;
		stroke-dasharray: none;
	}

	:global(.svelte-flow__edge:not(.highlighted):not(.selected) .svelte-flow__edge-path) {
		transition: opacity 0.15s ease;
	}

	/* Dim non-highlighted edges when any edge has .highlighted */
	:global(.svelte-flow__edges:has(.highlighted) .svelte-flow__edge:not(.highlighted):not(.selected) .svelte-flow__edge-path) {
		opacity: 0.25;
	}
</style>
