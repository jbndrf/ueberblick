<script lang="ts">
	import { toolRegistry, type ToolInstance } from '../tools';

	type Props = {
		/** The tool instance to display */
		tool: ToolInstance;
		/** Whether this tool is currently selected */
		selected?: boolean;
		/** Click handler */
		onclick?: () => void;
	};

	let { tool, selected = false, onclick }: Props = $props();

	const definition = $derived(toolRegistry.get(tool.toolType));
	const Icon = $derived(definition?.icon);
	const color = $derived(definition?.defaultColor ?? '#6B7280');
	const title = $derived(definition?.displayName ?? tool.toolType);
</script>

<button
	class="tool-icon"
	class:selected
	style="--tool-color: {color}"
	onclick={(e) => { e.stopPropagation(); onclick?.(); }}
	{title}
	type="button"
>
	{#if Icon}
		<Icon class="icon" />
	{:else}
		<span class="fallback">{tool.toolType.charAt(0).toUpperCase()}</span>
	{/if}
</button>

<style>
	.tool-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.tool-icon:hover {
		background: hsl(var(--accent));
		border-color: var(--tool-color);
		transform: scale(1.05);
	}

	.tool-icon.selected {
		background: color-mix(in srgb, var(--tool-color) 15%, transparent);
		border-color: var(--tool-color);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--tool-color) 25%, transparent);
	}

	.tool-icon :global(.icon) {
		width: 14px;
		height: 14px;
		color: var(--tool-color);
	}

	.fallback {
		font-size: 10px;
		font-weight: 600;
		color: var(--tool-color);
	}
</style>
