<script lang="ts">
	import { Shield, Pencil, ArrowRight } from 'lucide-svelte';
	import type { AutomationAction } from '$lib/workflow-builder';

	type StageOption = { id: string; name: string };

	type Props = {
		stageOptions: StageOption[];
		onAdd: (action: AutomationAction) => void;
		disabled?: boolean;
	};

	let { stageOptions, onAdd, disabled = false }: Props = $props();

	const ACTION_TYPES = [
		{
			type: 'set_instance_status' as const,
			label: 'Set Status',
			icon: Shield,
			create: (): AutomationAction => ({
				type: 'set_instance_status',
				params: { status: 'archived' }
			})
		},
		{
			type: 'set_field_value' as const,
			label: 'Set Field',
			icon: Pencil,
			create: (): AutomationAction => ({
				type: 'set_field_value',
				params: { field_key: '', value: '' }
			})
		},
		{
			type: 'set_stage' as const,
			label: 'Set Stage',
			icon: ArrowRight,
			create: (): AutomationAction => ({
				type: 'set_stage',
				params: { stage_id: stageOptions[0]?.id ?? '' }
			})
		}
	];
</script>

<div class="action-palette">
	<span class="palette-label">Add action</span>
	<div class="palette-buttons">
		{#each ACTION_TYPES as at}
			{@const Icon = at.icon}
			<button
				class="palette-btn"
				{disabled}
				onclick={() => onAdd(at.create())}
				title={at.label}
			>
				<Icon class="h-3 w-3" />
				<span class="palette-btn-label">{at.label}</span>
			</button>
		{/each}
	</div>
</div>

<style>
	.action-palette {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.palette-label {
		font-size: 0.5625rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.palette-buttons {
		display: flex;
		gap: 0.25rem;
	}

	.palette-btn {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.125rem;
		padding: 0.375rem 0.25rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.25rem;
		background: hsl(var(--background));
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s;
	}

	.palette-btn:hover:not(:disabled) {
		background: hsl(var(--accent) / 0.5);
		border-color: hsl(var(--primary) / 0.3);
		color: hsl(var(--foreground));
	}

	.palette-btn:active:not(:disabled) {
		background: hsl(var(--primary) / 0.1);
	}

	.palette-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.palette-btn-label {
		font-size: 0.5625rem;
		white-space: nowrap;
	}
</style>
