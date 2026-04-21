<script lang="ts">
	import { Play, Square, CircleStop } from '@lucide/svelte';
	import type { SelectionContext } from '../context';
	import { ToolPicker } from '$lib/workflow-builder/components';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		context: Extract<SelectionContext, { type: 'stage' }>;
		onAddField: (fieldType: string) => void;
		onEditStage: () => void;
		onDeleteStage: () => void;
		onAddStageTool: (toolType: string) => void;
	};

	let { context, onAddStageTool }: Props = $props();
</script>

<div class="panel">
	<div class="panel-header bg-muted border-b border-border">
		{#if context.stage.data.stageType === 'start'}
			<Play class="panel-header-icon text-green-500" />
		{:else if context.stage.data.stageType === 'end'}
			<CircleStop class="panel-header-icon text-pink-500" />
		{:else}
			<Square class="panel-header-icon text-blue-500" />
		{/if}
		<div class="panel-header-text">
			<span class="panel-header-title text-foreground">{context.stage.data.title}</span>
			<span class="panel-header-subtitle text-muted-foreground">{context.stage.data.stageType} {(m.workflowBuilderStagePanelStage?.() ?? 'stage')}</span>
		</div>
	</div>

	<!-- Stage Tools -->
	<div class="panel-content">
		<ToolPicker attachmentTarget="stage" onSelectTool={onAddStageTool} />
	</div>
</div>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.panel-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 1.125rem;
		background: hsl(var(--muted));
		border-bottom: 1px solid hsl(var(--border));
	}

	.panel-header :global(.panel-header-icon) {
		width: 1.25rem;
		height: 1.25rem;
	}

	.panel-header-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.panel-header-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.panel-header-subtitle {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		text-transform: capitalize;
	}

	.tool-grid {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
</style>
