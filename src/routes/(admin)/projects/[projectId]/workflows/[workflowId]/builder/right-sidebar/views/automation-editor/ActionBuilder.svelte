<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Trash2 } from 'lucide-svelte';
	import { ExpressionInput } from '$lib/components/expression-input';
	import * as m from '$lib/paraglide/messages';

	import type { AutomationAction } from '$lib/workflow-builder';

	type FieldOption = { key: string; label: string };
	type StageOption = { id: string; name: string };

	type Props = {
		actions: AutomationAction[];
		fieldOptions?: FieldOption[];
		stageOptions?: StageOption[];
		onChange: (actions: AutomationAction[]) => void;
	};

	let { actions, fieldOptions = [], stageOptions = [], onChange }: Props = $props();

	const STATUS_OPTIONS = ['active', 'completed', 'archived', 'deleted'];

	function removeAction(index: number) {
		onChange(actions.filter((_, i) => i !== index));
	}

	function updateAction(index: number, updated: AutomationAction) {
		const newActions = [...actions];
		newActions[index] = updated;
		onChange(newActions);
	}
</script>

<div class="action-builder">
	<div class="actions-list">
		{#each actions as action, index (index)}
			<div class="action-row">
				<div class="action-fields">
					<span class="action-type-label">
						{#if action.type === 'set_instance_status'}
							{m.automationActionBuilderSetStatus?.() ?? 'Set Status'}
						{:else if action.type === 'set_field_value'}
							{m.automationActionBuilderSetFieldValue?.() ?? 'Set Field Value'}
						{:else if action.type === 'set_stage'}
							{m.automationActionBuilderSetStage?.() ?? 'Set Stage'}
						{/if}
					</span>

					{#if action.type === 'set_instance_status'}
						<div class="action-param-row">
							<span class="param-label">{m.automationActionBuilderStatusLabel?.() ?? 'Status:'}</span>
							<select
								class="status-select"
								value={action.params.status}
								onchange={(e) => {
									updateAction(index, {
										type: 'set_instance_status',
										params: { status: e.currentTarget.value }
									});
								}}
							>
								{#each STATUS_OPTIONS as status}
									<option value={status}>{status}</option>
								{/each}
							</select>
						</div>
					{:else if action.type === 'set_field_value'}
						<div class="action-param-row">
							<span class="param-label">{m.automationActionBuilderFieldLabel?.() ?? 'Field:'}</span>
							<select
								class="field-select"
								value={action.params.field_key}
								onchange={(e) => {
									updateAction(index, {
										...action,
										params: { ...action.params, field_key: e.currentTarget.value }
									});
								}}
							>
								<option value="">{m.automationActionBuilderSelectField?.() ?? 'Select field...'}</option>
								{#each fieldOptions as opt}
									<option value={opt.key}>{opt.label}</option>
								{/each}
							</select>
						</div>
						<div class="action-param-row">
							<span class="param-label">{m.automationActionBuilderValueLabel?.() ?? 'Value:'}</span>
						</div>
						<ExpressionInput
							value={action.params.value}
							{fieldOptions}
							onchange={(v) => {
								updateAction(index, {
									...action,
									params: { ...action.params, value: v }
								});
							}}
							placeholder={m.automationActionBuilderValuePlaceholder?.() ?? 'Value or expression...'}
						/>
					{:else if action.type === 'set_stage'}
						<div class="action-param-row">
							<span class="param-label">{m.automationActionBuilderStageLabel?.() ?? 'Stage:'}</span>
							<select
								class="stage-select"
								value={action.params.stage_id}
								onchange={(e) => {
									updateAction(index, {
										type: 'set_stage',
										params: { stage_id: e.currentTarget.value }
									});
								}}
							>
								<option value="">{m.automationActionBuilderSelectStage?.() ?? 'Select stage...'}</option>
								{#each stageOptions as stage}
									<option value={stage.id}>{stage.name}</option>
								{/each}
							</select>
						</div>
					{/if}
				</div>

				<Button variant="ghost" size="icon" class="h-6 w-6 shrink-0" onclick={() => removeAction(index)}>
					<Trash2 class="h-3 w-3" />
				</Button>
			</div>
		{/each}
	</div>
</div>

<style>
	.action-builder {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.actions-list {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.action-row {
		display: flex;
		align-items: flex-start;
		gap: 0.375rem;
		padding: 0.5rem;
		border-radius: 0.25rem;
		background: hsl(var(--accent) / 0.3);
		border: 1px solid hsl(var(--border));
	}

	.action-fields {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		flex: 1;
		min-width: 0;
	}

	.action-type-label {
		font-size: 0.625rem;
		font-weight: 600;
		color: hsl(var(--primary));
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.status-select,
	.field-select,
	.stage-select {
		height: 1.75rem;
		font-size: 0.6875rem;
		padding: 0 0.5rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.25rem;
		background: hsl(var(--background));
		color: hsl(var(--foreground));
		width: 100%;
	}

	.action-param-row {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.param-label {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
		min-width: 3rem;
	}
</style>
