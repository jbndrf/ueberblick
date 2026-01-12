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
</script>

<BaseEdge path={edgePath} {markerEnd} />

<!-- Always show toolbar for debugging -->
<EdgeLabel x={labelX} y={labelY}>
	<div class="edge-toolbar-container nodrag nopan">
		<ToolBar
			{tools}
			selectedToolId={data?.selectedToolId}
			onSelectTool={data?.onSelectTool}
			onAddTool={data?.onAddTool}
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

	:global(.svelte-flow__edge.selected .svelte-flow__edge-path) {
		stroke: hsl(var(--primary));
		stroke-width: 2;
	}
</style>
