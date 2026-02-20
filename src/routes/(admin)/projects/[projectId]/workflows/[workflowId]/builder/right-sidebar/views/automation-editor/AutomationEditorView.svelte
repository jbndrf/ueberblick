<script lang="ts">
	import { X, Zap, Trash2 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Switch from '$lib/components/ui/switch';

	import ConditionBuilder from './ConditionBuilder.svelte';
	import ActionBuilder from './ActionBuilder.svelte';

	import PropertySection from '../properties/shared/PropertySection.svelte';

	import type {
		ToolsAutomation,
		TriggerType,
		TriggerConfig,
		TransitionTriggerConfig,
		FieldChangeTriggerConfig,
		TimeBasedTriggerConfig,
		ConditionGroup,
		AutomationAction,
		WorkflowStage,
		ToolsFormField
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
		onConditionsChange?: (conditions: ConditionGroup | null) => void;
		onActionsChange?: (actions: AutomationAction[]) => void;
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
		onConditionsChange,
		onActionsChange,
		onDelete,
		onClose
	}: Props = $props();

	const TRIGGER_TYPES: { value: TriggerType; label: string }[] = [
		{ value: 'on_transition', label: 'On Transition' },
		{ value: 'on_field_change', label: 'On Field Change' },
		{ value: 'time_based', label: 'Time Based' }
	];

	// Local state synced from prop
	let name = $state(automation.name);
	let currentId = $state(automation.id);

	$effect(() => {
		if (automation.id !== currentId) {
			currentId = automation.id;
			name = automation.name;
		}
	});

	function handleNameBlur() {
		if (name !== automation.name) {
			onNameChange?.(name);
		}
	}

	function handleTriggerTypeChange(newType: TriggerType) {
		const defaultConfigs: Record<TriggerType, TriggerConfig> = {
			on_transition: { from_stage_id: null, to_stage_id: null },
			on_field_change: { stage_id: null, field_key: null },
			time_based: { stage_id: null, days: 30 }
		};
		onTriggerTypeChange?.(newType);
		onTriggerConfigChange?.(defaultConfigs[newType]);
	}

	// Cast helpers for trigger config
	const transitionConfig = $derived(
		automation.trigger_type === 'on_transition'
			? automation.trigger_config as TransitionTriggerConfig
			: null
	);
	const fieldChangeConfig = $derived(
		automation.trigger_type === 'on_field_change'
			? automation.trigger_config as FieldChangeTriggerConfig
			: null
	);
	const timeBasedConfig = $derived(
		automation.trigger_type === 'time_based'
			? automation.trigger_config as TimeBasedTriggerConfig
			: null
	);

	const stageOptionsWithAny: StageOption[] = $derived([
		{ id: '', name: 'Any Stage' },
		...stages
	]);

	const fieldOptionsWithAny: FieldOption[] = $derived([
		{ key: '', label: 'Any Field' },
		...fieldOptions
	]);
</script>

<div class="automation-editor">
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
			<Switch.Root
				checked={automation.is_enabled}
				onCheckedChange={(checked) => onEnabledChange?.(checked)}
			>
				<Switch.Thumb />
			</Switch.Root>
		</div>

		<!-- Trigger -->
		<PropertySection title="Trigger" defaultOpen={true}>
			<div class="field-group">
				<Label class="text-xs">Type</Label>
				<select
					class="trigger-select"
					value={automation.trigger_type}
					onchange={(e) => handleTriggerTypeChange(e.currentTarget.value as TriggerType)}
				>
					{#each TRIGGER_TYPES as tt}
						<option value={tt.value}>{tt.label}</option>
					{/each}
				</select>
			</div>

			<!-- on_transition config -->
			{#if transitionConfig}
				<div class="trigger-config">
					<div class="field-group">
						<Label class="text-xs">From Stage</Label>
						<select
							class="trigger-select"
							value={transitionConfig.from_stage_id ?? ''}
							onchange={(e) => {
								onTriggerConfigChange?.({
									...transitionConfig,
									from_stage_id: e.currentTarget.value || null
								});
							}}
						>
							{#each stageOptionsWithAny as s}
								<option value={s.id}>{s.name}</option>
							{/each}
						</select>
					</div>
					<div class="field-group">
						<Label class="text-xs">To Stage</Label>
						<select
							class="trigger-select"
							value={transitionConfig.to_stage_id ?? ''}
							onchange={(e) => {
								onTriggerConfigChange?.({
									...transitionConfig,
									to_stage_id: e.currentTarget.value || null
								});
							}}
						>
							{#each stageOptionsWithAny as s}
								<option value={s.id}>{s.name}</option>
							{/each}
						</select>
					</div>
				</div>
			{/if}

			<!-- on_field_change config -->
			{#if fieldChangeConfig}
				<div class="trigger-config">
					<div class="field-group">
						<Label class="text-xs">Stage</Label>
						<select
							class="trigger-select"
							value={fieldChangeConfig.stage_id ?? ''}
							onchange={(e) => {
								onTriggerConfigChange?.({
									...fieldChangeConfig,
									stage_id: e.currentTarget.value || null
								});
							}}
						>
							{#each stageOptionsWithAny as s}
								<option value={s.id}>{s.name}</option>
							{/each}
						</select>
					</div>
					<div class="field-group">
						<Label class="text-xs">Field</Label>
						<select
							class="trigger-select"
							value={fieldChangeConfig.field_key ?? ''}
							onchange={(e) => {
								onTriggerConfigChange?.({
									...fieldChangeConfig,
									field_key: e.currentTarget.value || null
								});
							}}
						>
							{#each fieldOptionsWithAny as f}
								<option value={f.key}>{f.label}</option>
							{/each}
						</select>
					</div>
				</div>
			{/if}

			<!-- time_based config -->
			{#if timeBasedConfig}
				<div class="trigger-config">
					<div class="field-group">
						<Label class="text-xs">Stage</Label>
						<select
							class="trigger-select"
							value={timeBasedConfig.stage_id ?? ''}
							onchange={(e) => {
								onTriggerConfigChange?.({
									...timeBasedConfig,
									stage_id: e.currentTarget.value || null
								});
							}}
						>
							{#each stageOptionsWithAny as s}
								<option value={s.id}>{s.name}</option>
							{/each}
						</select>
					</div>
					<div class="field-group">
						<Label class="text-xs">After (days of no activity)</Label>
						<Input
							type="number"
							min={1}
							value={String(timeBasedConfig.days)}
							oninput={(e) => {
								const days = parseInt(e.currentTarget.value, 10);
								if (!isNaN(days) && days >= 1) {
									onTriggerConfigChange?.({
										...timeBasedConfig,
										days
									});
								}
							}}
							class="h-8 text-sm"
						/>
						<span class="help-text">Checked daily at 2:00 AM</span>
					</div>
				</div>
			{/if}
		</PropertySection>

		<!-- Conditions -->
		<PropertySection title="Conditions (optional)" defaultOpen={automation.conditions !== null}>
			<ConditionBuilder
				conditions={automation.conditions}
				{fieldOptions}
				onChange={(c) => onConditionsChange?.(c)}
			/>
		</PropertySection>

		<!-- Actions -->
		<PropertySection title="Actions" defaultOpen={true}>
			<ActionBuilder
				actions={automation.actions}
				{fieldOptions}
				stageOptions={stages}
				onChange={(a) => onActionsChange?.(a)}
			/>
		</PropertySection>

		<!-- Delete -->
		<div class="delete-section">
			<Button variant="destructive" size="sm" onclick={onDelete}>
				<Trash2 class="h-3.5 w-3.5 mr-1.5" />
				Delete Automation
			</Button>
		</div>
	</div>
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

	.trigger-config {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.trigger-select {
		height: 2rem;
		font-size: 0.8125rem;
		padding: 0 0.5rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		background: hsl(var(--background));
		color: hsl(var(--foreground));
		width: 100%;
	}

	.help-text {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
	}

	.delete-section {
		padding: 1rem;
		border-top: 1px solid hsl(var(--border));
		margin-top: 0.5rem;
	}
</style>
