<script lang="ts">
	import { Handle, Position, type NodeProps, type Node } from '@xyflow/svelte';
	import { Play, Square, CircleStop } from 'lucide-svelte';
	import { ToolBar } from '$lib/workflow-builder/components';
	import type { ToolInstance } from '$lib/workflow-builder/tools';

	type StageData = {
		title: string;
		key: string;
		stageType: 'start' | 'intermediate' | 'end';
		maxHours?: number | null;
		/** Stage actions attached to this stage */
		tools?: ToolInstance[];
		/** Currently selected tool ID */
		selectedToolId?: string;
		/** Callback when a tool is selected */
		onSelectTool?: (toolId: string) => void;
		/** Callback when add tool button is clicked */
		onAddTool?: () => void;
	};

	type StageNodeType = Node<StageData, 'stage'>;

	let { data, selected }: NodeProps<StageNodeType> = $props();

	const tools = $derived(data.tools ?? []);

	const typeConfig = {
		start: {
			icon: Play,
			borderColor: 'border-green-500'
		},
		intermediate: {
			icon: Square,
			borderColor: 'border-blue-500'
		},
		end: {
			icon: CircleStop,
			borderColor: 'border-pink-500'
		}
	};

	const config = $derived(typeConfig[data.stageType] || typeConfig.intermediate);
</script>

<div
	class="stage-node"
	class:selected
	class:node-start={data.stageType === 'start'}
	class:node-intermediate={data.stageType === 'intermediate'}
	class:node-end={data.stageType === 'end'}
>
	<!-- Input handle (not for start) - fixed position near top -->
	{#if data.stageType !== 'start'}
		<Handle
			type="target"
			position={Position.Left}
			class="handle handle-target"
			style="top: 24px;"
		/>
	{/if}

	<div class="stage-content">
		<div class="stage-header">
			{#if data.stageType === 'start'}
				<Play class="h-4 w-4 shrink-0" />
			{:else if data.stageType === 'end'}
				<CircleStop class="h-4 w-4 shrink-0" />
			{:else}
				<Square class="h-4 w-4 shrink-0" />
			{/if}
			<span class="stage-title">{data.title}</span>
		</div>
		<div class="stage-meta">
			<span class="stage-key">{data.key}</span>
			{#if data.maxHours}
				<span class="stage-hours">{data.maxHours}h</span>
			{/if}
		</div>

		<!-- Stage Actions ToolBar -->
		{#if selected || tools.length > 0}
			<div class="stage-tools">
				<ToolBar
					{tools}
					selectedToolId={data.selectedToolId}
					onSelectTool={data.onSelectTool}
					onAddTool={data.onAddTool}
				/>
			</div>
		{/if}
	</div>

	<!-- Output handle (not for end) - fixed position near top -->
	{#if data.stageType !== 'end'}
		<Handle
			type="source"
			position={Position.Right}
			class="handle handle-source"
			style="top: 24px;"
		/>
	{/if}
</div>

<style>
	.stage-node {
		min-width: 180px;
		max-width: 240px;
		padding: 0.875rem 1rem;
		border-radius: 0.625rem;
		border: 1px solid oklch(0.85 0.01 250);
		border-left-width: 4px;
		background: linear-gradient(135deg, hsl(var(--card)) 0%, oklch(0.98 0.005 250) 100%);
		box-shadow:
			0 1px 2px oklch(0 0 0 / 0.04),
			0 4px 8px oklch(0 0 0 / 0.06);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	:global(.dark) .stage-node {
		border-color: oklch(1 0 0 / 15%);
		background: linear-gradient(135deg, hsl(var(--card)) 0%, oklch(0.22 0.04 260) 100%);
		box-shadow:
			0 1px 2px oklch(0 0 0 / 0.2),
			0 4px 12px oklch(0 0 0 / 0.3);
	}

	.stage-node:hover {
		transform: translateY(-2px);
		box-shadow:
			0 4px 8px oklch(0 0 0 / 0.08),
			0 8px 24px oklch(0 0 0 / 0.12);
	}

	:global(.dark) .stage-node:hover {
		box-shadow:
			0 4px 8px oklch(0 0 0 / 0.3),
			0 8px 24px oklch(0 0 0 / 0.4);
	}

	.stage-node.selected {
		border-color: hsl(var(--primary));
		box-shadow:
			0 0 0 3px hsl(var(--primary) / 0.15),
			0 4px 12px oklch(0 0 0 / 0.1);
	}

	:global(.dark) .stage-node.selected {
		box-shadow:
			0 0 0 3px hsl(var(--primary) / 0.25),
			0 4px 12px oklch(0 0 0 / 0.4);
	}

	/* Node type styles - Start (green) */
	.node-start {
		border-left-color: rgb(34 197 94);
		background: linear-gradient(135deg, hsl(142 76% 98%) 0%, hsl(142 60% 95%) 100%);
	}

	:global(.dark) .node-start {
		background: linear-gradient(135deg, hsl(142 40% 14%) 0%, hsl(142 35% 10%) 100%);
	}

	.node-start :global(.stage-header svg) {
		color: rgb(34 197 94);
	}

	/* Node type styles - Intermediate (blue) */
	.node-intermediate {
		border-left-color: rgb(59 130 246);
		background: linear-gradient(135deg, hsl(217 91% 98%) 0%, hsl(217 80% 95%) 100%);
	}

	:global(.dark) .node-intermediate {
		background: linear-gradient(135deg, hsl(217 40% 14%) 0%, hsl(217 35% 10%) 100%);
	}

	.node-intermediate :global(.stage-header svg) {
		color: rgb(59 130 246);
	}

	/* Node type styles - End (pink) */
	.node-end {
		border-left-color: rgb(236 72 153);
		background: linear-gradient(135deg, hsl(330 81% 98%) 0%, hsl(330 70% 95%) 100%);
	}

	:global(.dark) .node-end {
		background: linear-gradient(135deg, hsl(330 40% 14%) 0%, hsl(330 35% 10%) 100%);
	}

	.node-end :global(.stage-header svg) {
		color: rgb(236 72 153);
	}

	/* Content styles */
	.stage-content {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.stage-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.stage-title {
		font-weight: 600;
		font-size: 0.875rem;
		color: hsl(var(--foreground));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.stage-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.stage-key {
		font-family: ui-monospace, monospace;
		font-size: 0.6875rem;
		padding: 0.125rem 0.375rem;
		background: oklch(0 0 0 / 0.05);
		border-radius: 0.25rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.dark) .stage-key {
		background: oklch(1 0 0 / 0.08);
	}

	.stage-hours {
		padding: 0.125rem 0.5rem;
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary));
		border-radius: 1rem;
		font-weight: 500;
		flex-shrink: 0;
	}

	.stage-tools {
		margin-top: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid oklch(0 0 0 / 0.08);
	}

	:global(.dark) .stage-tools {
		border-top-color: oklch(1 0 0 / 0.1);
	}

	/* Handle styles */
	:global(.stage-node .handle) {
		width: 12px;
		height: 12px;
		border: 2px solid white;
		box-shadow: 0 1px 4px oklch(0 0 0 / 0.2);
		transition: transform 0.15s ease, box-shadow 0.15s ease;
	}

	:global(.dark .stage-node .handle) {
		border-color: oklch(0.2 0.04 260);
	}

	:global(.stage-node .handle:hover) {
		transform: scale(1.3);
		box-shadow: 0 2px 8px oklch(0 0 0 / 0.3);
	}

	:global(.stage-node .handle-target) {
		background: rgb(99 102 241);
	}

	:global(.stage-node .handle-source) {
		background: rgb(34 197 94);
	}

	:global(.stage-node.node-start .handle-source) {
		background: rgb(34 197 94);
	}

	:global(.stage-node.node-intermediate .handle-source) {
		background: rgb(59 130 246);
	}

	:global(.stage-node.node-end .handle-target) {
		background: rgb(236 72 153);
	}

	/* Connecting states */
	:global(.stage-node .handle.connecting) {
		animation: pulse 1s infinite;
	}

	:global(.stage-node .handle.valid) {
		background: rgb(34 197 94);
		box-shadow: 0 0 8px rgb(34 197 94 / 0.5);
	}

	@keyframes pulse {
		0%, 100% { transform: scale(1); }
		50% { transform: scale(1.2); }
	}
</style>
