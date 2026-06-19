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
	import '@xyflow/svelte/dist/style.css';

	import { onMount } from 'svelte';
	import {
		workflowBuilderCanvasConnectingIndicator,
		workflowBuilderCanvasEnd,
		workflowBuilderCanvasNewStage,
		workflowBuilderCanvasStart
	} from '$lib/paraglide/messages';
	import type { StageData } from '$lib/workflow-builder';

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
		onToolDropped: (target: {
			toolType: string;
			scope: 'global' | 'stage' | 'connection';
			stageId?: string;
			connectionId?: string;
		}) => void;
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
		onConnect,
		onToolDropped
	}: Props = $props();

	// Access SvelteFlow context for coordinate transformations and viewport control
	const { screenToFlowPosition, fitView } = useSvelteFlow();

	// Fit view once on mount instead of using the reactive fitView prop
	onMount(() => {
		setTimeout(() => fitView(), 50);
	});

	// A tool was dragged from the catalog matrix: resolve whether it landed on a
	// stage node, a connection edge, or empty canvas, and hand off to the host.
	// Node/edge ids map directly to stage/connection ids (see flow-sync).
	function handleToolDrop(event: DragEvent, raw: string) {
		let payload: { toolType: string; scope: 'global' | 'stage' | 'connection' };
		try {
			payload = JSON.parse(raw);
		} catch {
			return;
		}

		const el = event.target as HTMLElement | null;
		const stageId = el?.closest('.svelte-flow__node')?.getAttribute('data-id') ?? undefined;
		// The edge SVG path is thin; the visible toolbar carries data-connection-id
		// so dropping on it resolves reliably too.
		const connectionId =
			el?.closest('[data-connection-id]')?.getAttribute('data-connection-id') ??
			el?.closest('.svelte-flow__edge')?.getAttribute('data-id') ??
			undefined;

		// A node hit wins over an edge hit (nodes sit above edges visually).
		onToolDropped({
			toolType: payload.toolType,
			scope: payload.scope,
			stageId,
			connectionId: stageId ? undefined : connectionId
		});
	}

	// Handle drop on canvas - now with correct coordinate transformation
	function onDrop(event: DragEvent) {
		event.preventDefault();
		if (!event.dataTransfer) return;

		const toolPayload = event.dataTransfer.getData('application/ueberblick-tool');
		if (toolPayload) {
			handleToolDrop(event, toolPayload);
			return;
		}

		const type = event.dataTransfer.getData('application/xyflow') as
			| 'start'
			| 'intermediate'
			| 'end';
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
				title:
					type === 'start'
						? (workflowBuilderCanvasStart?.() ?? 'Start')
						: type === 'end'
							? (workflowBuilderCanvasEnd?.() ?? 'End')
							: (workflowBuilderCanvasNewStage?.() ?? 'New Stage'),
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
			event.dataTransfer.dropEffect = event.dataTransfer.types.includes(
				'application/ueberblick-tool'
			)
				? 'copy'
				: 'move';
		}
	}
</script>

<div class="canvas-wrapper" role="application" ondrop={onDrop} ondragover={onDragOver}>
	{#if connectingFrom}
		<div class="connecting-indicator">
			{workflowBuilderCanvasConnectingIndicator?.() ??
				'Connecting from node... Right-click another node to connect, or click canvas to cancel.'}
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
