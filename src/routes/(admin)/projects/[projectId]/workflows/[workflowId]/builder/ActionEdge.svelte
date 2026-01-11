<script lang="ts">
	import { BaseEdge, EdgeLabel, getBezierPath, type EdgeProps } from '@xyflow/svelte';
	import { ToolBar } from '$lib/workflow-builder/components';
	import type { ToolInstance } from '$lib/workflow-builder/tools';

	type ActionEdgeData = {
		tools?: ToolInstance[];
		selectedToolId?: string;
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

	// Calculate the bezier path and midpoint
	let [edgePath, labelX, labelY] = $derived(
		getBezierPath({
			sourceX,
			sourceY,
			sourcePosition,
			targetX,
			targetY,
			targetPosition
		})
	);
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
