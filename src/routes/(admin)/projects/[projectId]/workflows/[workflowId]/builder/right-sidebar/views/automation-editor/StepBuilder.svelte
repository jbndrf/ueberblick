<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Plus, Trash2, ChevronUp, ChevronDown, ChevronRight } from 'lucide-svelte';

	import ConditionBuilder from './ConditionBuilder.svelte';
	import ActionBuilder from './ActionBuilder.svelte';

	import type { AutomationStep, ConditionGroup, AutomationAction } from '$lib/workflow-builder';

	type FieldOption = { key: string; label: string };
	type StageOption = { id: string; name: string };

	type Props = {
		steps: AutomationStep[];
		fieldOptions?: FieldOption[];
		stageOptions?: StageOption[];
		onChange: (steps: AutomationStep[]) => void;
	};

	let { steps, fieldOptions = [], stageOptions = [], onChange }: Props = $props();

	let expandedSteps = $state<Set<number>>(new Set([0]));

	function toggleExpanded(index: number) {
		const next = new Set(expandedSteps);
		if (next.has(index)) {
			next.delete(index);
		} else {
			next.add(index);
		}
		expandedSteps = next;
	}

	function addStep() {
		const newStep: AutomationStep = {
			name: `Step ${steps.length + 1}`,
			conditions: null,
			actions: []
		};
		onChange([...steps, newStep]);
		expandedSteps = new Set([...expandedSteps, steps.length]);
	}

	function removeStep(index: number) {
		const newSteps = steps.filter((_, i) => i !== index);
		onChange(newSteps);
		const next = new Set<number>();
		for (const i of expandedSteps) {
			if (i < index) next.add(i);
			else if (i > index) next.add(i - 1);
		}
		expandedSteps = next;
	}

	function moveStep(index: number, direction: -1 | 1) {
		const target = index + direction;
		if (target < 0 || target >= steps.length) return;
		const newSteps = [...steps];
		[newSteps[index], newSteps[target]] = [newSteps[target], newSteps[index]];
		onChange(newSteps);
		const next = new Set<number>();
		for (const i of expandedSteps) {
			if (i === index) next.add(target);
			else if (i === target) next.add(index);
			else next.add(i);
		}
		expandedSteps = next;
	}

	function updateStepName(index: number, name: string) {
		const newSteps = [...steps];
		newSteps[index] = { ...newSteps[index], name };
		onChange(newSteps);
	}

	function updateStepConditions(index: number, conditions: ConditionGroup | null) {
		const newSteps = [...steps];
		newSteps[index] = { ...newSteps[index], conditions };
		onChange(newSteps);
	}

	function updateStepActions(index: number, actions: AutomationAction[]) {
		const newSteps = [...steps];
		newSteps[index] = { ...newSteps[index], actions };
		onChange(newSteps);
	}
</script>

<div class="step-builder">
	{#each steps as step, index (index)}
		<div class="step-card">
			<div class="step-header">
				<button class="step-toggle" onclick={() => toggleExpanded(index)}>
					<ChevronRight class="h-3 w-3 {expandedSteps.has(index) ? 'toggle-expanded' : 'toggle-collapsed'}" />
					<span class="step-number">{index + 1}</span>
				</button>
				<Input
					value={step.name}
					oninput={(e) => updateStepName(index, e.currentTarget.value)}
					placeholder="Step name..."
					class="h-6 text-xs flex-1"
				/>
				<div class="step-controls">
					{#if index > 0}
						<Button variant="ghost" size="icon" class="h-5 w-5" onclick={() => moveStep(index, -1)}>
							<ChevronUp class="h-3 w-3" />
						</Button>
					{/if}
					{#if index < steps.length - 1}
						<Button variant="ghost" size="icon" class="h-5 w-5" onclick={() => moveStep(index, 1)}>
							<ChevronDown class="h-3 w-3" />
						</Button>
					{/if}
					{#if steps.length > 1}
						<Button variant="ghost" size="icon" class="h-5 w-5" onclick={() => removeStep(index)}>
							<Trash2 class="h-3 w-3" />
						</Button>
					{/if}
				</div>
			</div>

			{#if expandedSteps.has(index)}
				<div class="step-content">
					<div class="step-section">
						<span class="section-label">Conditions (guard)</span>
						<ConditionBuilder
							conditions={step.conditions}
							{fieldOptions}
							onChange={(c) => updateStepConditions(index, c)}
						/>
					</div>
					<div class="step-section">
						<span class="section-label">Actions</span>
						<ActionBuilder
							actions={step.actions}
							{fieldOptions}
							{stageOptions}
							onChange={(a) => updateStepActions(index, a)}
						/>
					</div>
				</div>
			{/if}
		</div>
	{/each}

	<Button variant="ghost" size="sm" class="add-step-btn" onclick={addStep}>
		<Plus class="h-3 w-3 mr-1" />
		Add Step
	</Button>
</div>

<style>
	.step-builder {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.step-card {
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		background: hsl(var(--accent) / 0.15);
		overflow: hidden;
	}

	.step-header {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.5rem;
		background: hsl(var(--accent) / 0.3);
		border-bottom: 1px solid hsl(var(--border) / 0.5);
	}

	.step-toggle {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		background: none;
		border: none;
		cursor: pointer;
		color: hsl(var(--muted-foreground));
		padding: 0;
	}

	.step-number {
		font-size: 0.6875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	:global(.toggle-collapsed),
	:global(.toggle-expanded) {
		transition: transform 0.15s ease;
	}

	:global(.toggle-expanded) {
		transform: rotate(90deg);
	}

	.step-controls {
		display: flex;
		align-items: center;
		gap: 0.125rem;
		flex-shrink: 0;
	}

	.step-content {
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.step-section {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.section-label {
		font-size: 0.6875rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	:global(.add-step-btn) {
		align-self: flex-start;
	}
</style>
