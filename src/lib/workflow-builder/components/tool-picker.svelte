<script lang="ts">
	import { toolRegistry, type AttachmentTarget } from '../tools';
	import { ChevronDown } from 'lucide-svelte';

	type Props = {
		/** Where tools will be attached: 'stage' or 'connection' */
		attachmentTarget: AttachmentTarget;
		/** Callback when tool is selected */
		onSelectTool: (toolType: string) => void;
		/** Currently selected tool type (for highlighting) */
		selectedToolType?: string;
	};

	let { attachmentTarget, onSelectTool, selectedToolType }: Props = $props();

	const tools = $derived(toolRegistry.getToolsFor(attachmentTarget));

	const sectionTitle = $derived(
		attachmentTarget === 'global' ? 'Global Tools' :
		attachmentTarget === 'stage' ? 'Stage Tools' : 'Connection Tools'
	);

	let isOpen = $state(true);
</script>

<div class="tool-section">
	<button class="tool-section-header" onclick={() => (isOpen = !isOpen)}>
		<span class="tool-section-title">{sectionTitle}</span>
		<ChevronDown class="tool-section-chevron {!isOpen ? 'rotated' : ''}" />
	</button>

	{#if isOpen}
		<div class="tool-section-content">
			<div class="tool-grid">
				{#each tools as tool}
					<button
						class="tool-button"
						class:selected={selectedToolType === tool.toolType}
						onclick={() => onSelectTool(tool.toolType)}
					>
						<tool.icon class="tool-button-icon" />
						<div class="tool-button-text">
							<span class="tool-button-label">{tool.displayName}</span>
							<span class="tool-button-description">{tool.description}</span>
						</div>
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.tool-section {
		border-bottom: 1px solid hsl(var(--border));
	}

	.tool-section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		padding: 0.75rem 1rem;
		background: hsl(var(--muted) / 0.5);
		border: none;
		border-bottom: 1px solid hsl(var(--border) / 0.5);
		cursor: pointer;
		text-align: left;
		transition: all 0.2s ease;
	}

	.tool-section-header:hover {
		background: hsl(var(--muted) / 0.8);
	}

	.tool-section-title {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
	}

	.tool-section-chevron {
		width: 0.875rem;
		height: 0.875rem;
		color: hsl(var(--muted-foreground));
		transition: transform 0.2s ease;
	}

	.tool-section-chevron.rotated {
		transform: rotate(-90deg);
	}

	.tool-section-content {
		padding: 0.75rem 1rem 1rem;
		background: hsl(var(--card));
	}

	.tool-grid {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.tool-button {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		width: 100%;
		padding: 0.625rem 0.875rem;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		cursor: pointer;
		text-align: left;
		transition: all 0.2s ease;
	}

	.tool-button:hover {
		background: hsl(var(--accent));
		border-color: hsl(var(--accent-foreground) / 0.2);
		box-shadow: 0 1px 3px hsl(var(--foreground) / 0.05);
	}

	.tool-button.selected {
		background: hsl(var(--primary) / 0.1);
		border-color: hsl(var(--primary) / 0.3);
	}

	.tool-button :global(.tool-button-icon) {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
		color: hsl(var(--muted-foreground));
	}

	.tool-button.selected :global(.tool-button-icon) {
		color: hsl(var(--primary));
	}

	.tool-button-text {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.tool-button-label {
		font-size: 0.8125rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tool-button-description {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
