<script lang="ts">
	import { ArrowLeft, Trash2 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	import ConditionBuilder from './ConditionBuilder.svelte';
	import ActionBuilder from './ActionBuilder.svelte';
	import ActionTypePalette from './ActionTypePalette.svelte';

	import type { AutomationStep, ConditionGroup, AutomationAction } from '$lib/workflow-builder';

	type FieldOption = { key: string; label: string };
	type StageOption = { id: string; name: string };

	type Props = {
		step: AutomationStep;
		stepIndex: number;
		fieldOptions: FieldOption[];
		stageOptions: StageOption[];
		onUpdate: (step: AutomationStep) => void;
		onDelete: () => void;
		onBack: () => void;
	};

	let { step, stepIndex, fieldOptions, stageOptions, onUpdate, onDelete, onBack }: Props = $props();

	function updateName(name: string) {
		onUpdate({ ...step, name });
	}

	function updateConditions(conditions: ConditionGroup | null) {
		onUpdate({ ...step, conditions });
	}

	function updateActions(actions: AutomationAction[]) {
		onUpdate({ ...step, actions });
	}

	function addAction(action: AutomationAction) {
		if (step.actions.length >= 5) return;
		onUpdate({ ...step, actions: [...step.actions, action] });
	}
</script>

<div class="step-config-panel">
	<!-- Header -->
	<div class="config-header">
		<button class="back-btn" onclick={onBack}>
			<ArrowLeft class="h-3.5 w-3.5" />
			<span>Steps</span>
		</button>
		<span class="step-label">Step {stepIndex + 1}</span>
	</div>

	<div class="config-content">
		<!-- Step name -->
		<div class="config-section">
			<Input
				value={step.name}
				oninput={(e) => updateName(e.currentTarget.value)}
				placeholder="Step name..."
				class="h-7 text-xs"
			/>
		</div>

		<!-- Conditions -->
		<div class="config-section">
			<span class="section-label">Conditions (guard)</span>
			<ConditionBuilder
				conditions={step.conditions}
				{fieldOptions}
				{stageOptions}
				onChange={updateConditions}
			/>
		</div>

		<!-- Actions -->
		<div class="config-section">
			<span class="section-label">Actions</span>
			<ActionBuilder
				actions={step.actions}
				{fieldOptions}
				{stageOptions}
				onChange={updateActions}
			/>
			{#if step.actions.length < 5}
				<ActionTypePalette
					{stageOptions}
					onAdd={addAction}
				/>
			{/if}
		</div>

		<!-- Delete -->
		<div class="config-footer">
			<Button variant="destructive" size="sm" class="h-7 text-xs" onclick={onDelete}>
				<Trash2 class="h-3 w-3 mr-1" />
				Delete Step
			</Button>
		</div>
	</div>
</div>

<style>
	.step-config-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.config-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid hsl(var(--border));
	}

	.back-btn {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		background: none;
		border: none;
		cursor: pointer;
		color: hsl(var(--primary));
		font-size: 0.6875rem;
		font-weight: 500;
		padding: 0.25rem 0.375rem;
		border-radius: 0.25rem;
		transition: background 0.15s;
	}

	.back-btn:hover {
		background: hsl(var(--accent) / 0.5);
	}

	.step-label {
		font-size: 0.625rem;
		color: hsl(var(--muted-foreground));
		margin-left: auto;
	}

	.config-content {
		flex: 1;
		overflow-y: auto;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.config-section {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.section-label {
		font-size: 0.6875rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.config-footer {
		padding: 0.75rem;
		border-top: 1px solid hsl(var(--border));
	}
</style>
