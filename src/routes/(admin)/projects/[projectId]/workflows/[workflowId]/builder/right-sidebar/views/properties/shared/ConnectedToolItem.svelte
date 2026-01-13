<script lang="ts">
	import { toolRegistry } from '$lib/workflow-builder/tools';
	import ButtonConfigPopover from './ButtonConfigPopover.svelte';

	import type { VisualConfig } from '$lib/workflow-builder';

	type Props = {
		/** Tool type (e.g., 'form', 'edit') */
		toolType: string;
		/** Tool name (configured name) */
		name: string;
		/** Visual config for button */
		visualConfig: VisualConfig;
		/** Callback when visual config changes */
		onVisualConfigChange?: (config: VisualConfig) => void;
		/** Callback when tool is clicked (to select/open it) */
		onSelect?: () => void;
		/** Default button label */
		defaultButtonLabel?: string;
		/** Default button color */
		defaultButtonColor?: string;
	};

	let {
		toolType,
		name,
		visualConfig,
		onVisualConfigChange,
		onSelect,
		defaultButtonLabel = 'Action',
		defaultButtonColor = '#3b82f6'
	}: Props = $props();

	// Get tool definition from registry
	const toolDefinition = $derived(toolRegistry.get(toolType));
	const Icon = $derived(toolDefinition?.icon);
	const iconColor = $derived(toolDefinition?.defaultColor ?? '#6B7280');
</script>

<div class="connected-tool-item">
	<button class="tool-info" type="button" onclick={onSelect}>
		<div class="tool-icon" style="--icon-color: {iconColor}">
			{#if Icon}
				<Icon class="icon" />
			{:else}
				<span class="icon-fallback">{toolType.charAt(0).toUpperCase()}</span>
			{/if}
		</div>
		<span class="tool-name">{name}</span>
	</button>

	<div class="tool-button" onclick={(e) => e.stopPropagation()}>
		<ButtonConfigPopover
			config={visualConfig}
			onConfigChange={onVisualConfigChange}
			defaultLabel={defaultButtonLabel}
			defaultColor={defaultButtonColor}
		/>
	</div>
</div>

<style>
	.connected-tool-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.625rem;
		border-radius: 0.375rem;
		background: hsl(var(--accent) / 0.3);
		border: 1px solid hsl(var(--border));
		transition: all 0.15s ease;
	}

	.connected-tool-item:hover {
		background: hsl(var(--accent) / 0.5);
	}

	.tool-info {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		text-align: left;
		min-width: 0;
	}

	.tool-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		background: color-mix(in srgb, var(--icon-color) 15%, transparent);
		border-radius: 0.25rem;
	}

	.tool-icon :global(.icon) {
		width: 14px;
		height: 14px;
		color: var(--icon-color);
	}

	.icon-fallback {
		font-size: 10px;
		font-weight: 600;
		color: var(--icon-color);
	}

	.tool-name {
		font-size: 0.8125rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tool-button {
		flex-shrink: 0;
	}
</style>
