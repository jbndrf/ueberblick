<script lang="ts">
	import { ArrowRight } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages';
	import type { SelectionContext } from '../context';
	import { ToolPicker } from '$lib/workflow-builder/components';

	type Props = {
		context: Extract<SelectionContext, { type: 'action' }>;
		onChangeActionType: (type: string) => void;
		onEditAction: () => void;
		onDeleteAction: () => void;
		onAddProgressTool: (toolType: string) => void;
		/** Optional filter: only show these tool types */
		allowedToolTypes?: string[];
	};

	let { context, onAddProgressTool, allowedToolTypes }: Props = $props();

	const isEditAction = $derived(context.action.source === context.action.target);
	const actionLabel = $derived((context.action.label as string) || (m.workflowBuilderActionPanelUnnamedAction?.() ?? 'Unnamed Action'));
</script>

<div class="panel">
	<div class="panel-header bg-muted border-b border-border">
		<ArrowRight class="panel-header-icon text-muted-foreground" />
		<div class="panel-header-text">
			<span class="panel-header-title text-foreground">{actionLabel}</span>
			<span class="panel-header-subtitle text-muted-foreground">{isEditAction ? (m.workflowBuilderActionPanelEditAction?.() ?? 'Edit action') : (m.workflowBuilderActionPanelTransitionAction?.() ?? 'Transition action')}</span>
		</div>
	</div>

	<!-- Connection Tools -->
	<div class="panel-content">
		<ToolPicker attachmentTarget="connection" onSelectTool={onAddProgressTool} {allowedToolTypes} />
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
		color: hsl(var(--muted-foreground));
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

	.tool-grid {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
</style>
