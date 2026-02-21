<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Plus, Trash2 } from 'lucide-svelte';

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

	const ACTION_TYPES = [
		{ value: 'set_instance_status', label: 'Set Instance Status' },
		{ value: 'set_field_value', label: 'Set Field Value' },
		{ value: 'set_stage', label: 'Set Stage' }
	];

	const STATUS_OPTIONS = ['active', 'completed', 'archived', 'deleted'];

	function addAction() {
		if (actions.length >= 5) return;
		const newAction: AutomationAction = {
			type: 'set_instance_status',
			params: { status: 'archived' }
		};
		onChange([...actions, newAction]);
	}

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
					<select
						class="action-type-select"
						value={action.type}
						onchange={(e) => {
							const type = e.currentTarget.value;
							if (type === 'set_instance_status') {
								updateAction(index, { type: 'set_instance_status', params: { status: 'archived' } });
							} else if (type === 'set_field_value') {
								updateAction(index, { type: 'set_field_value', params: { field_key: '', value: '', stage_id: stageOptions[0]?.id ?? '' } });
							} else if (type === 'set_stage') {
								updateAction(index, { type: 'set_stage', params: { stage_id: stageOptions[0]?.id ?? '' } });
							}
						}}
					>
						{#each ACTION_TYPES as at}
							<option value={at.value}>{at.label}</option>
						{/each}
					</select>

					{#if action.type === 'set_instance_status'}
						<div class="action-param-row">
							<span class="param-label">Status:</span>
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
							<span class="param-label">Field:</span>
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
								<option value="">Select field...</option>
								{#each fieldOptions as opt}
									<option value={opt.key}>{opt.label}</option>
								{/each}
							</select>
						</div>
						<div class="action-param-row">
							<span class="param-label">Value:</span>
							<Input
								value={action.params.value}
								oninput={(e) => {
									updateAction(index, {
										...action,
										params: { ...action.params, value: e.currentTarget.value }
									});
								}}
								placeholder="Value or expression..."
								class="h-7 text-xs"
							/>
						</div>
						<span class="expression-help">
							Expressions: {'{field_key}'} + 1, {'{a}'} - {'{b}'}
						</span>
						<div class="action-param-row">
							<span class="param-label">Stage:</span>
							<select
								class="stage-select"
								value={action.params.stage_id}
								onchange={(e) => {
									updateAction(index, {
										...action,
										params: { ...action.params, stage_id: e.currentTarget.value }
									});
								}}
							>
								{#each stageOptions as stage}
									<option value={stage.id}>{stage.name}</option>
								{/each}
							</select>
						</div>
					{:else if action.type === 'set_stage'}
						<div class="action-param-row">
							<span class="param-label">Stage:</span>
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
								<option value="">Select stage...</option>
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

	{#if actions.length < 5}
		<Button variant="ghost" size="sm" class="add-action-btn" onclick={addAction}>
			<Plus class="h-3 w-3 mr-1" />
			Add Action
		</Button>
	{/if}
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

	.action-type-select,
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

	.expression-help {
		font-size: 0.5625rem;
		color: hsl(var(--muted-foreground));
		font-style: italic;
		padding: 0 0.25rem;
	}

	:global(.add-action-btn) {
		align-self: flex-start;
	}
</style>
