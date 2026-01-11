<script lang="ts">
	import { ArrowRight } from 'lucide-svelte';
	import type { SelectionContext } from '../context';

	type Props = {
		context: Extract<SelectionContext, { type: 'action' }>;
		onChangeActionType: (type: string) => void;
		onEditAction: () => void;
		onDeleteAction: () => void;
	};

	let { context }: Props = $props();

	const isEditAction = $derived(context.action.source === context.action.target);
	const actionLabel = $derived((context.action.label as string) || 'Unnamed Action');
</script>

<div class="panel">
	<div class="panel-header">
		<ArrowRight class="panel-header-icon" />
		<div class="panel-header-text">
			<span class="panel-header-title">{actionLabel}</span>
			<span class="panel-header-subtitle">{isEditAction ? 'Edit action' : 'Transition action'}</span>
		</div>
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
		padding: 1rem;
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
