<script lang="ts">
	import {
		SvelteFlow,
		Controls,
		Background,
		MiniMap,
		useSvelteFlow,
		type Node,
		type Edge,
		type NodeTypes,
		type EdgeTypes,
		type NodeEventWithPointer,
		type Connection
	} from '@xyflow/svelte';

	import { onMount } from 'svelte';
	import type { StageData } from './context-sidebar';

	interface Props {
		nodes: Node[];
		edges: Edge[];
		nodeTypes: NodeTypes;
		edgeTypes?: EdgeTypes;
		hasStartStage: boolean;
		connectingFrom: string | null;
		onPaneClick: () => void;
		onNodeClick: (params: { node: Node }) => void;
		onEdgeClick: (params: { edge: Edge }) => void;
		onNodeContextMenu: NodeEventWithPointer<MouseEvent>;
		onNodeAdded: (node: Node) => void;
		onConnect: (connection: Connection) => void;
	}

	let {
		nodes = $bindable(),
		edges = $bindable(),
		nodeTypes,
		edgeTypes,
		hasStartStage,
		connectingFrom,
		onPaneClick,
		onNodeClick,
		onEdgeClick,
		onNodeContextMenu,
		onNodeAdded,
		onConnect
	}: Props = $props();

	// Access SvelteFlow context for coordinate transformations and viewport control
	const { screenToFlowPosition, fitView } = useSvelteFlow();

	// Fit view once on mount instead of using the reactive fitView prop
	onMount(() => {
		setTimeout(() => fitView(), 50);
	});

	// Handle drop on canvas - now with correct coordinate transformation
	function onDrop(event: DragEvent) {
		event.preventDefault();
		if (!event.dataTransfer) return;

		const type = event.dataTransfer.getData('application/xyflow') as 'start' | 'intermediate' | 'end';
		if (!type) return;

		// Check if start node already exists
		if (type === 'start' && hasStartStage) {
			console.warn('Only one start node allowed');
			return;
		}

		// Convert screen coordinates to flow coordinates (accounts for zoom/pan)
		const position = screenToFlowPosition({
			x: event.clientX,
			y: event.clientY
		});

		const newNode: Node = {
			id: `temp_${Date.now()}`,
			type: 'stage',
			position,
			data: {
				title: type === 'start' ? 'Start' : type === 'end' ? 'End' : 'New Stage',
				key: `${type}_${Date.now()}`,
				stageType: type,
				maxHours: null
			} satisfies StageData
		};

		onNodeAdded(newNode);
	}

	function onDragOver(event: DragEvent) {
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
	}
</script>

<div class="canvas-wrapper" role="application" ondrop={onDrop} ondragover={onDragOver}>
	{#if connectingFrom}
		<div class="connecting-indicator">
			Connecting from node... Right-click another node to connect, or click canvas to cancel.
		</div>
	{/if}

	<SvelteFlow
		bind:nodes
		bind:edges
		{nodeTypes}
		{edgeTypes}
		onpaneclick={onPaneClick}
		onnodeclick={onNodeClick}
		onedgeclick={onEdgeClick}
		onnodecontextmenu={onNodeContextMenu}
		onconnect={onConnect}
	>
		<Controls />
		<Background />
		<MiniMap />
	</SvelteFlow>
</div>

<style>
	.canvas-wrapper {
		width: 100%;
		height: 100%;
		position: relative;
	}

	.connecting-indicator {
		position: absolute;
		top: 1rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 10;
		padding: 0.5rem 1rem;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border-radius: 0.375rem;
		font-size: 0.875rem;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}
</style>
