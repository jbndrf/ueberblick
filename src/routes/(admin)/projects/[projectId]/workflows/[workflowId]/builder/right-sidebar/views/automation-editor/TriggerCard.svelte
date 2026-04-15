<script lang="ts">
	import { Route, Pencil, Clock, X, Settings } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { describeCron, validateCron } from '$lib/automation/cron-utils';
	import * as m from '$lib/paraglide/messages';

	import type {
		TriggerType,
		TriggerConfig,
		TransitionTriggerConfig,
		FieldChangeTriggerConfig,
		ScheduledTriggerConfig
	} from '$lib/workflow-builder';

	type StageOption = { id: string; name: string };
	type FieldOption = { key: string; label: string };

	type Props = {
		triggerType: TriggerType;
		triggerConfig: TriggerConfig;
		stages: StageOption[];
		fieldOptions: FieldOption[];
		/** Whether a trigger has been explicitly configured (not just default) */
		hasConfig: boolean;
		onTriggerTypeChange?: (type: TriggerType) => void;
		onTriggerConfigChange?: (config: TriggerConfig) => void;
		onClearTrigger?: () => void;
	};

	let {
		triggerType,
		triggerConfig,
		stages,
		fieldOptions,
		hasConfig,
		onTriggerTypeChange,
		onTriggerConfigChange,
		onClearTrigger
	}: Props = $props();

	const TRIGGER_TYPES: { value: TriggerType; label: string; description: string; icon: typeof Route }[] = [
		{ value: 'on_transition', label: (m.automationTriggerCardOnTransitionLabel?.() ?? 'On Transition'), description: (m.automationTriggerCardOnTransitionDesc?.() ?? 'When instance moves between stages'), icon: Route },
		{ value: 'on_field_change', label: (m.automationTriggerCardOnFieldChangeLabel?.() ?? 'On Field Change'), description: (m.automationTriggerCardOnFieldChangeDesc?.() ?? 'When a field value changes'), icon: Pencil },
		{ value: 'scheduled', label: (m.automationTriggerCardScheduledLabel?.() ?? 'Scheduled'), description: (m.automationTriggerCardScheduledDesc?.() ?? 'Run on a cron schedule'), icon: Clock }
	];

	let isEditing = $state(false);

	const DEFAULT_CONFIGS: Record<TriggerType, TriggerConfig> = {
		on_transition: { from_stage_id: null, to_stage_id: null },
		on_field_change: { stage_id: null, field_key: null },
		scheduled: { cron: '0 2 * * 1-5', target_stage_id: null }
	};

	function selectTriggerType(type: TriggerType) {
		onTriggerTypeChange?.(type);
		onTriggerConfigChange?.(DEFAULT_CONFIGS[type]);
		isEditing = true;
	}

	// Cast helpers
	const transitionConfig = $derived(
		triggerType === 'on_transition' ? triggerConfig as TransitionTriggerConfig : null
	);
	const fieldChangeConfig = $derived(
		triggerType === 'on_field_change' ? triggerConfig as FieldChangeTriggerConfig : null
	);
	const scheduledConfig = $derived(
		triggerType === 'scheduled' ? triggerConfig as ScheduledTriggerConfig : null
	);

	const cronValidation = $derived(
		scheduledConfig ? validateCron(scheduledConfig.cron) : { valid: true }
	);

	const stageOptionsWithAny: StageOption[] = $derived([
		{ id: '', name: (m.automationTriggerCardAnyStage?.() ?? 'Any Stage') },
		...stages
	]);

	const fieldOptionsWithAny: FieldOption[] = $derived([
		{ key: '', label: (m.automationTriggerCardAnyField?.() ?? 'Any Field') },
		...fieldOptions
	]);

	// Summary text for configured trigger
	function getSummary(): string {
		if (transitionConfig) {
			const from = stages.find(s => s.id === transitionConfig.from_stage_id)?.name ?? (m.automationTriggerCardAny?.() ?? 'Any');
			const to = stages.find(s => s.id === transitionConfig.to_stage_id)?.name ?? (m.automationTriggerCardAny?.() ?? 'Any');
			return `${from} -> ${to}`;
		}
		if (fieldChangeConfig) {
			const stage = stages.find(s => s.id === fieldChangeConfig.stage_id)?.name ?? (m.automationTriggerCardAnyStage?.() ?? 'Any Stage');
			const field = fieldOptions.find(f => f.key === fieldChangeConfig.field_key)?.label ?? (m.automationTriggerCardAnyField?.() ?? 'Any Field');
			return `${field} in ${stage}`;
		}
		if (scheduledConfig) {
			if (cronValidation.valid) {
				return describeCron(scheduledConfig.cron);
			}
			return scheduledConfig.cron;
		}
		return '';
	}

	const triggerInfo = $derived(TRIGGER_TYPES.find(t => t.value === triggerType));
</script>

{#if !hasConfig && !isEditing}
	<!-- No trigger configured: show type palette -->
	<div class="trigger-palette">
		<span class="palette-label">{m.automationTriggerCardChooseTrigger?.() ?? 'Choose a trigger'}</span>
		<div class="palette-options">
			{#each TRIGGER_TYPES as tt}
				{@const Icon = tt.icon}
				<button class="palette-option" onclick={() => selectTriggerType(tt.value)}>
					<div class="palette-icon">
						<Icon class="h-4 w-4" />
					</div>
					<div class="palette-text">
						<span class="palette-option-label">{tt.label}</span>
						<span class="palette-option-desc">{tt.description}</span>
					</div>
				</button>
			{/each}
		</div>
	</div>
{:else if !isEditing}
	<!-- Configured trigger: show summary card -->
	<div class="trigger-summary">
		<div class="trigger-summary-header">
			{#if triggerInfo}
				{@const Icon = triggerInfo.icon}
				<div class="trigger-summary-icon">
					<Icon class="h-3.5 w-3.5" />
				</div>
			{/if}
			<div class="trigger-summary-text">
				<span class="trigger-type-label">{triggerInfo?.label ?? triggerType}</span>
				<span class="trigger-summary-detail">{getSummary()}</span>
			</div>
			<div class="trigger-summary-actions">
				<Button variant="ghost" size="icon" class="h-6 w-6" onclick={() => isEditing = true}>
					<Settings class="h-3 w-3" />
				</Button>
			</div>
		</div>
	</div>
{:else}
	<!-- Editing trigger config -->
	<div class="trigger-edit">
		<div class="trigger-edit-header">
			<span class="trigger-edit-title">{m.automationTriggerCardConfigureTitle?.() ?? 'Configure Trigger'}</span>
			<Button variant="ghost" size="icon" class="h-6 w-6" onclick={() => isEditing = false}>
				<X class="h-3 w-3" />
			</Button>
		</div>

		<!-- Type selector -->
		<div class="trigger-type-selector">
			{#each TRIGGER_TYPES as tt}
				{@const Icon = tt.icon}
				<button
					class="type-chip"
					class:active={triggerType === tt.value}
					onclick={() => selectTriggerType(tt.value)}
				>
					<Icon class="h-3 w-3" />
					{tt.label}
				</button>
			{/each}
		</div>

		<!-- Type-specific config -->
		<div class="trigger-config-fields">
			{#if transitionConfig}
				<div class="config-field">
					<Label class="text-xs">{m.automationTriggerCardFromStage?.() ?? 'From Stage'}</Label>
					<select
						class="config-select"
						value={transitionConfig.from_stage_id ?? ''}
						onchange={(e) => onTriggerConfigChange?.({ ...transitionConfig, from_stage_id: e.currentTarget.value || null })}
					>
						{#each stageOptionsWithAny as s}
							<option value={s.id}>{s.name}</option>
						{/each}
					</select>
				</div>
				<div class="config-field">
					<Label class="text-xs">{m.automationTriggerCardToStage?.() ?? 'To Stage'}</Label>
					<select
						class="config-select"
						value={transitionConfig.to_stage_id ?? ''}
						onchange={(e) => onTriggerConfigChange?.({ ...transitionConfig, to_stage_id: e.currentTarget.value || null })}
					>
						{#each stageOptionsWithAny as s}
							<option value={s.id}>{s.name}</option>
						{/each}
					</select>
				</div>
			{:else if fieldChangeConfig}
				<div class="config-field">
					<Label class="text-xs">{m.automationTriggerCardStage?.() ?? 'Stage'}</Label>
					<select
						class="config-select"
						value={fieldChangeConfig.stage_id ?? ''}
						onchange={(e) => onTriggerConfigChange?.({ ...fieldChangeConfig, stage_id: e.currentTarget.value || null })}
					>
						{#each stageOptionsWithAny as s}
							<option value={s.id}>{s.name}</option>
						{/each}
					</select>
				</div>
				<div class="config-field">
					<Label class="text-xs">{m.automationTriggerCardField?.() ?? 'Field'}</Label>
					<select
						class="config-select"
						value={fieldChangeConfig.field_key ?? ''}
						onchange={(e) => onTriggerConfigChange?.({ ...fieldChangeConfig, field_key: e.currentTarget.value || null })}
					>
						{#each fieldOptionsWithAny as f}
							<option value={f.key}>{f.label}</option>
						{/each}
					</select>
				</div>
			{:else if scheduledConfig}
				<div class="config-field">
					<Label class="text-xs">{m.automationTriggerCardTargetStage?.() ?? 'Target Stage'}</Label>
					<select
						class="config-select"
						value={scheduledConfig.target_stage_id ?? ''}
						onchange={(e) => onTriggerConfigChange?.({ ...scheduledConfig, target_stage_id: e.currentTarget.value || null })}
					>
						{#each stageOptionsWithAny as s}
							<option value={s.id}>{s.name}</option>
						{/each}
					</select>
					<span class="config-help">{m.automationTriggerCardTargetStageHelp?.() ?? 'Only run for instances at this stage'}</span>
				</div>
				<div class="config-field">
					<Label class="text-xs">{m.automationTriggerCardCronExpression?.() ?? 'Cron Expression'}</Label>
					<Input
						value={scheduledConfig.cron}
						oninput={(e) => onTriggerConfigChange?.({ ...scheduledConfig, cron: e.currentTarget.value })}
						placeholder="0 2 * * 1-5"
						class="h-7 text-xs font-mono"
					/>
					{#if cronValidation.valid}
						<span class="config-help">{describeCron(scheduledConfig.cron)}</span>
					{:else}
						<span class="config-help config-error">{cronValidation.error}</span>
					{/if}
				</div>
				<div class="config-field">
					<Label class="text-xs">{m.automationTriggerCardInactiveDays?.() ?? 'Inactive for (days)'}</Label>
					<Input
						type="number"
						min={0}
						value={String(scheduledConfig.inactive_days ?? 0)}
						oninput={(e) => {
							const days = parseInt(e.currentTarget.value, 10);
							onTriggerConfigChange?.({ ...scheduledConfig, inactive_days: isNaN(days) || days <= 0 ? null : days });
						}}
						placeholder="0"
						class="h-7 text-xs"
					/>
					<span class="config-help">{m.automationTriggerCardInactiveDaysHelp?.() ?? 'Only target instances with no activity for this many days (0 = no filter)'}</span>
				</div>
			{/if}
		</div>

		<div class="trigger-edit-footer">
			<Button variant="ghost" size="sm" class="h-6 text-xs" onclick={() => isEditing = false}>
				{m.automationTriggerCardDone?.() ?? 'Done'}
			</Button>
		</div>
	</div>
{/if}

<style>
	/* Palette (unconfigured) */
	.trigger-palette {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.palette-label {
		font-size: 0.6875rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.palette-options {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.palette-option {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.5rem 0.625rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		background: hsl(var(--background));
		cursor: pointer;
		transition: all 0.15s;
		text-align: left;
	}

	.palette-option:hover {
		background: hsl(var(--accent) / 0.5);
		border-color: hsl(var(--primary) / 0.3);
	}

	.palette-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.25rem;
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary));
		flex-shrink: 0;
	}

	.palette-text {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.palette-option-label {
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.palette-option-desc {
		font-size: 0.625rem;
		color: hsl(var(--muted-foreground));
	}

	/* Summary card (configured) */
	.trigger-summary {
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		background: hsl(var(--accent) / 0.15);
		overflow: hidden;
	}

	.trigger-summary-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.625rem;
	}

	.trigger-summary-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 0.25rem;
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary));
		flex-shrink: 0;
	}

	.trigger-summary-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.trigger-type-label {
		font-size: 0.6875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.trigger-summary-detail {
		font-size: 0.625rem;
		color: hsl(var(--muted-foreground));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.trigger-summary-actions {
		display: flex;
		gap: 0.125rem;
		flex-shrink: 0;
	}

	/* Edit mode */
	.trigger-edit {
		border: 1px solid hsl(var(--primary) / 0.3);
		border-radius: 0.375rem;
		background: hsl(var(--accent) / 0.1);
		overflow: hidden;
	}

	.trigger-edit-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.375rem 0.5rem;
		border-bottom: 1px solid hsl(var(--border) / 0.5);
	}

	.trigger-edit-title {
		font-size: 0.6875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.trigger-type-selector {
		display: flex;
		gap: 0.25rem;
		padding: 0.5rem;
	}

	.type-chip {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		font-size: 0.625rem;
		border: 1px solid hsl(var(--border));
		border-radius: 1rem;
		background: hsl(var(--background));
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s;
		white-space: nowrap;
	}

	.type-chip:hover {
		border-color: hsl(var(--primary) / 0.5);
	}

	.type-chip.active {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border-color: hsl(var(--primary));
	}

	.trigger-config-fields {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0 0.5rem 0.5rem;
	}

	.config-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.config-select {
		height: 1.75rem;
		font-size: 0.6875rem;
		padding: 0 0.5rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.25rem;
		background: hsl(var(--background));
		color: hsl(var(--foreground));
		width: 100%;
	}

	.config-help {
		font-size: 0.5625rem;
		color: hsl(var(--muted-foreground));
	}

	.config-error {
		color: hsl(var(--destructive));
	}

	.trigger-edit-footer {
		display: flex;
		justify-content: flex-end;
		padding: 0.25rem 0.5rem;
		border-top: 1px solid hsl(var(--border) / 0.5);
	}
</style>
