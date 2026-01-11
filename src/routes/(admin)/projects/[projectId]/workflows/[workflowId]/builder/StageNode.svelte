<script lang="ts">
	import { Handle, Position, type NodeProps, type Node } from '@xyflow/svelte';
	import { Play, Square, CircleStop } from 'lucide-svelte';

	type StageData = {
		title: string;
		key: string;
		stageType: 'start' | 'intermediate' | 'end';
		maxHours?: number | null;
	};

	type StageNodeType = Node<StageData, 'stage'>;

	let { data, selected }: NodeProps<StageNodeType> = $props();

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
	class:border-green-500={data.stageType === 'start'}
	class:border-blue-500={data.stageType === 'intermediate'}
	class:border-pink-500={data.stageType === 'end'}
>
	<!-- Input handle (not for start) -->
	{#if data.stageType !== 'start'}
		<Handle type="target" position={Position.Left} />
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
	</div>

	<!-- Output handle (not for end) -->
	{#if data.stageType !== 'end'}
		<Handle type="source" position={Position.Right} />
	{/if}
</div>

<style>
	.stage-node {
		min-width: 160px;
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		border: 1px solid hsl(var(--border));
		border-left-width: 3px;
		background: hsl(var(--card));
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		cursor: pointer;
		transition: all 0.2s;
	}

	.stage-node:hover {
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}

	.stage-node.selected {
		outline: 2px solid hsl(var(--primary));
		outline-offset: 1px;
		box-shadow: 0 0 0 2px hsl(var(--primary) / 0.2);
	}

	.stage-content {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.stage-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.stage-title {
		font-weight: 500;
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
		font-family: monospace;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.stage-hours {
		padding: 0.125rem 0.375rem;
		background: hsl(var(--accent));
		border-radius: 0.25rem;
		flex-shrink: 0;
	}

	/* Tailwind border colors */
	.border-green-500 {
		border-left-color: rgb(34 197 94);
	}

	.border-blue-500 {
		border-left-color: rgb(59 130 246);
	}

	.border-pink-500 {
		border-left-color: rgb(236 72 153);
	}
</style>
