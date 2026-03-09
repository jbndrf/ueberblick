<script lang="ts">
	import { X, Zap, Trash2, Plus } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import TriggerCard from './TriggerCard.svelte';
	import StepCard from './StepCard.svelte';
	import StepConfigPanel from './StepConfigPanel.svelte';

	import type {
		ToolsAutomation,
		AutomationStep,
		TriggerType,
		TriggerConfig
	} from '$lib/workflow-builder';

	type StageOption = { id: string; name: string };
	type FieldOption = { key: string; label: string };

	type Props = {
		automation: ToolsAutomation;
		stages: StageOption[];
		fieldOptions: FieldOption[];
		onNameChange?: (name: string) => void;
		onEnabledChange?: (enabled: boolean) => void;
		onTriggerTypeChange?: (triggerType: TriggerType) => void;
		onTriggerConfigChange?: (config: TriggerConfig) => void;
		onStepsChange?: (steps: AutomationStep[]) => void;
		onDelete?: () => void;
		onClose?: () => void;
	};

	let {
		automation,
		stages,
		fieldOptions,
		onNameChange,
		onEnabledChange,
		onTriggerTypeChange,
		onTriggerConfigChange,
		onStepsChange,
		onDelete,
		onClose
	}: Props = $props();

	// Local name state synced from prop
	let name = $state(automation.name);
	let currentId = $state(automation.id);

	$effect(() => {
		if (automation.id !== currentId) {
			currentId = automation.id;
			name = automation.name;
			selectedStepIndex = null;
		}
	});

	function handleNameBlur() {
		if (name !== automation.name) {
			onNameChange?.(name);
		}
	}

	// Step selection state
	let selectedStepIndex = $state<number | null>(null);

	const selectedStep = $derived(
		selectedStepIndex !== null && selectedStepIndex < automation.steps.length
			? automation.steps[selectedStepIndex]
			: null
	);

	// Check if trigger has been configured beyond defaults
	const hasTriggerConfig = $derived(
		automation.trigger_config != null
	);

	// --- Step management ---

	function addStep() {
		const newStep: AutomationStep = {
			name: `Step ${automation.steps.length + 1}`,
			conditions: null,
			actions: []
		};
		onStepsChange?.([...automation.steps, newStep]);
		selectedStepIndex = automation.steps.length;
	}

	function updateStep(index: number, step: AutomationStep) {
		const newSteps = [...automation.steps];
		newSteps[index] = step;
		onStepsChange?.(newSteps);
	}

	function deleteStep(index: number) {
		const newSteps = automation.steps.filter((_, i) => i !== index);
		onStepsChange?.(newSteps);
		selectedStepIndex = null;
	}

	// --- Drag reorder ---

	let dragIndex = $state<number | null>(null);

	function handleDragStart(index: number, e: DragEvent) {
		dragIndex = index;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', String(index));
		}
	}

	function handleDragOver(index: number, e: DragEvent) {
		if (dragIndex === null || dragIndex === index) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
	}

	function handleDrop(targetIndex: number, e: DragEvent) {
		e.preventDefault();
		if (dragIndex === null || dragIndex === targetIndex) return;

		const newSteps = [...automation.steps];
		const [moved] = newSteps.splice(dragIndex, 1);
		newSteps.splice(targetIndex, 0, moved);
		onStepsChange?.(newSteps);

		// Update selection to follow the moved step
		if (selectedStepIndex === dragIndex) {
			selectedStepIndex = targetIndex;
		} else if (selectedStepIndex !== null) {
			if (dragIndex < selectedStepIndex && targetIndex >= selectedStepIndex) {
				selectedStepIndex--;
			} else if (dragIndex > selectedStepIndex && targetIndex <= selectedStepIndex) {
				selectedStepIndex++;
			}
		}

		dragIndex = null;
	}

	function handleDragEnd() {
		dragIndex = null;
	}
</script>

<div class="automation-editor">
	{#if selectedStep !== null && selectedStepIndex !== null}
		<!-- Step config panel (replaces main view when step selected) -->
		<StepConfigPanel
			step={selectedStep}
			stepIndex={selectedStepIndex}
			{fieldOptions}
			stageOptions={stages}
			onUpdate={(s) => updateStep(selectedStepIndex!, s)}
			onDelete={() => deleteStep(selectedStepIndex!)}
			onBack={() => selectedStepIndex = null}
		/>
	{:else}
		<!-- Main view: header, trigger, steps list -->

		<!-- Header -->
		<div class="editor-header">
			<div class="header-left">
				<div class="header-icon">
					<Zap class="h-4 w-4" />
				</div>
				<span class="header-title">Automation</span>
			</div>
			<Button variant="ghost" size="icon" class="h-7 w-7" onclick={onClose}>
				<X class="h-4 w-4" />
			</Button>
		</div>

		<div class="editor-content">
			<!-- Name + Enabled -->
			<div class="field-group">
				<Label class="text-xs">Name</Label>
				<Input
					bind:value={name}
					onblur={handleNameBlur}
					placeholder="Automation name..."
					class="h-8 text-sm"
				/>
			</div>

			<div class="field-row">
				<Label class="text-xs">Enabled</Label>
				<Switch
					checked={automation.is_enabled}
					onCheckedChange={(checked) => onEnabledChange?.(checked)}
				/>
			</div>

			<!-- Trigger -->
			<div class="section">
				<span class="section-title">Trigger</span>
				<div class="section-content">
					<TriggerCard
						triggerType={automation.trigger_type}
						triggerConfig={automation.trigger_config}
						{stages}
						{fieldOptions}
						hasConfig={hasTriggerConfig}
						onTriggerTypeChange={(type) => onTriggerTypeChange?.(type)}
						onTriggerConfigChange={(config) => onTriggerConfigChange?.(config)}
					/>
				</div>
			</div>

			<!-- Steps -->
			<div class="section">
				<span class="section-title">Steps</span>
				<div class="section-content">
					{#if automation.steps.length === 0}
						<div class="empty-steps">
							<span class="empty-text">No steps yet</span>
						</div>
					{:else}
						<div class="step-list">
							{#each automation.steps as step, index (index)}
								<StepCard
									{step}
									{index}
									selected={selectedStepIndex === index}
									onSelect={() => selectedStepIndex = index}
									onDragStart={(e) => handleDragStart(index, e)}
									onDragOver={(e) => handleDragOver(index, e)}
									onDrop={(e) => handleDrop(index, e)}
									onDragEnd={handleDragEnd}
								/>
							{/each}
						</div>
					{/if}

					<Button variant="ghost" size="sm" class="add-step-btn" onclick={addStep}>
						<Plus class="h-3 w-3 mr-1" />
						Add Step
					</Button>
				</div>
			</div>

			<!-- Delete -->
			<div class="delete-section">
				<Button variant="destructive" size="sm" onclick={onDelete}>
					<Trash2 class="h-3.5 w-3.5 mr-1.5" />
					Delete Automation
				</Button>
			</div>
		</div>
	{/if}
</div>

<style>
	.automation-editor {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.editor-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid oklch(0.88 0.01 250);
	}

	:global(.dark) .editor-header {
		border-bottom-color: oklch(1 0 0 / 20%);
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.header-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.375rem;
		border-radius: 0.375rem;
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary));
	}

	.header-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.editor-content {
		flex: 1;
		overflow-y: auto;
		padding: 0.75rem 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.field-group {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0 1rem;
	}

	.field-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.375rem 1rem;
	}

	.section {
		margin-top: 0.5rem;
	}

	.section-title {
		display: block;
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
		padding: 0.625rem 1rem 0.375rem;
	}

	.section-content {
		padding: 0 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.step-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.empty-steps {
		padding: 1rem;
		text-align: center;
		border: 1px dashed hsl(var(--border));
		border-radius: 0.375rem;
	}

	.empty-text {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	:global(.add-step-btn) {
		align-self: flex-start;
	}

	.delete-section {
		padding: 1rem;
		border-top: 1px solid hsl(var(--border));
		margin-top: 0.5rem;
	}
</style>
