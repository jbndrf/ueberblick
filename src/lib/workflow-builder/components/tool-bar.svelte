<script lang="ts">
	import { Plus } from 'lucide-svelte';
	import type { ToolInstance } from '../tools';
	import ToolIcon from './tool-icon.svelte';

	type Props = {
		/** List of tools attached to this element */
		tools: ToolInstance[];
		/** Currently selected tool ID */
		selectedToolId?: string;
		/** Callback when a tool icon is clicked */
		onSelectTool?: (toolId: string) => void;
		/** Callback when the add button is clicked */
		onAddTool?: () => void;
	};

	let { tools, selectedToolId, onSelectTool, onAddTool }: Props = $props();

	const sortedTools = $derived([...tools].sort((a, b) => a.order - b.order));
</script>

<div class="tool-bar">
	{#each sortedTools as tool (tool.id)}
		<ToolIcon
			{tool}
			selected={selectedToolId === tool.id}
			onclick={() => onSelectTool?.(tool.id)}
		/>
	{/each}
	<button class="add-tool" onclick={onAddTool} title="Add tool" type="button">
		<Plus class="add-icon" />
	</button>
</div>

<style>
	.tool-bar {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px;
		background: oklch(from var(--card) l c h / 0.9);
		border-radius: 6px;
		backdrop-filter: blur(4px);
	}

	.add-tool {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		background: transparent;
		border: 1px dashed var(--border);
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s ease;
		flex-shrink: 0;
		color: var(--muted-foreground);
	}

	.add-tool:hover {
		background: var(--accent);
		border-style: solid;
		border-color: var(--primary);
		color: var(--primary);
	}

	.add-tool :global(.add-icon) {
		width: 14px;
		height: 14px;
	}
</style>
