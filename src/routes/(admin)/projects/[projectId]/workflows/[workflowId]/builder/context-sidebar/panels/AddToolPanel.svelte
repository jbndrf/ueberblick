<script lang="ts">
	import { Globe } from 'lucide-svelte';
	import type { SelectionContext } from '../context';
	import { ToolPicker } from '$lib/workflow-builder/components';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		context: Extract<SelectionContext, { type: 'addTool' }>;
		onAddTool: (toolType: string) => void;
	};

	let { context, onAddTool }: Props = $props();

	// Global tools use 'global' attachment target to show edit tools + automations
	const attachmentTarget = $derived(
		context.attachedTo.type === 'global' ? 'global' : context.attachedTo.type
	);

	const title = $derived(
		context.attachedTo.type === 'global' ? (m.workflowBuilderAddToolPanelGlobalTools?.() ?? 'Global Tools') :
		context.attachedTo.type === 'stage' ? (m.workflowBuilderAddToolPanelStageTools?.() ?? 'Stage Tools') : (m.workflowBuilderAddToolPanelConnectionTools?.() ?? 'Connection Tools')
	);

	const subtitle = $derived(
		context.attachedTo.type === 'global' ? (m.workflowBuilderAddToolPanelAvailableAllStages?.() ?? 'Available on all stages') : (m.workflowBuilderAddToolPanelSelectToolToAdd?.() ?? 'Select a tool to add')
	);
</script>

<div class="panel">
	<div class="panel-header">
		<Globe class="panel-header-icon" />
		<div class="panel-header-text">
			<span class="panel-header-title">{title}</span>
			<span class="panel-header-subtitle">{subtitle}</span>
		</div>
	</div>

	<div class="panel-content">
		<ToolPicker attachmentTarget={attachmentTarget} onSelectTool={onAddTool} />
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
		color: hsl(var(--primary));
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
	}

	.panel-content {
		flex: 1;
		overflow-y: auto;
	}
</style>
