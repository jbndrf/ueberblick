<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Plus, Trash2 } from 'lucide-svelte';

	import type { ConditionGroup, ConditionLeaf, ConditionOperator } from '$lib/workflow-builder';

	type FieldOption = { key: string; label: string };

	type Props = {
		conditions: ConditionGroup | null;
		/** Available form field keys for field_value conditions */
		fieldOptions?: FieldOption[];
		onChange: (conditions: ConditionGroup | null) => void;
	};

	let { conditions, fieldOptions = [], onChange }: Props = $props();

	const OPERATORS: { value: ConditionOperator; label: string }[] = [
		{ value: 'equals', label: 'equals' },
		{ value: 'not_equals', label: 'not equals' },
		{ value: 'is_empty', label: 'is empty' },
		{ value: 'is_not_empty', label: 'is not empty' },
		{ value: 'contains', label: 'contains' }
	];

	const CONDITION_TYPES = [
		{ value: 'field_value', label: 'Field Value' },
		{ value: 'instance_status', label: 'Instance Status' }
	];

	const STATUS_OPTIONS = ['active', 'completed', 'archived', 'deleted'];

	function getGroup(): ConditionGroup {
		return conditions ?? { operator: 'AND', conditions: [] };
	}

	function addCondition() {
		const group = getGroup();
		const newCondition: ConditionLeaf = {
			type: 'field_value',
			params: { field_key: '', operator: 'equals', value: '' }
		};
		onChange({
			...group,
			conditions: [...group.conditions, newCondition]
		});
	}

	function removeCondition(index: number) {
		const group = getGroup();
		const newConditions = group.conditions.filter((_, i) => i !== index);
		if (newConditions.length === 0) {
			onChange(null);
		} else {
			onChange({ ...group, conditions: newConditions });
		}
	}

	function updateCondition(index: number, updated: ConditionLeaf) {
		const group = getGroup();
		const newConditions = [...group.conditions];
		newConditions[index] = updated;
		onChange({ ...group, conditions: newConditions });
	}

	function updateGroupOperator(op: 'AND' | 'OR') {
		const group = getGroup();
		onChange({ ...group, operator: op });
	}

	const group = $derived(getGroup());
	const hasConditions = $derived(group.conditions.length > 0);
</script>

<div class="condition-builder">
	{#if hasConditions}
		<div class="group-operator">
			<span class="group-label">Only run if</span>
			<select
				class="operator-select"
				value={group.operator}
				onchange={(e) => updateGroupOperator(e.currentTarget.value as 'AND' | 'OR')}
			>
				<option value="AND">All</option>
				<option value="OR">Any</option>
			</select>
			<span class="group-label">are true:</span>
		</div>
	{/if}

	<div class="conditions-list">
		{#each group.conditions as condition, index (index)}
			<div class="condition-row">
				<div class="condition-fields">
					<select
						class="condition-type-select"
						value={condition.type}
						onchange={(e) => {
							const type = e.currentTarget.value;
							if (type === 'field_value') {
								updateCondition(index, { type: 'field_value', params: { field_key: '', operator: 'equals', value: '' } });
							} else {
								updateCondition(index, { type: 'instance_status', params: { status: 'active' } });
							}
						}}
					>
						{#each CONDITION_TYPES as ct}
							<option value={ct.value}>{ct.label}</option>
						{/each}
					</select>

					{#if condition.type === 'field_value'}
						<select
							class="field-select"
							value={condition.params.field_key}
							onchange={(e) => {
								updateCondition(index, {
									...condition,
									params: { ...condition.params, field_key: e.currentTarget.value }
								});
							}}
						>
							<option value="">Select field...</option>
							{#each fieldOptions as opt}
								<option value={opt.key}>{opt.label}</option>
							{/each}
						</select>

						<select
							class="operator-field-select"
							value={condition.params.operator}
							onchange={(e) => {
								updateCondition(index, {
									...condition,
									params: { ...condition.params, operator: e.currentTarget.value as ConditionOperator }
								});
							}}
						>
							{#each OPERATORS as op}
								<option value={op.value}>{op.label}</option>
							{/each}
						</select>

						{#if condition.params.operator !== 'is_empty' && condition.params.operator !== 'is_not_empty'}
							<Input
								value={condition.params.value ?? ''}
								oninput={(e) => {
									updateCondition(index, {
										...condition,
										params: { ...condition.params, value: e.currentTarget.value }
									});
								}}
								placeholder="Value..."
								class="h-7 text-xs"
							/>
						{/if}
					{:else if condition.type === 'instance_status'}
						<select
							class="status-select"
							value={condition.params.status}
							onchange={(e) => {
								updateCondition(index, {
									type: 'instance_status',
									params: { status: e.currentTarget.value }
								});
							}}
						>
							{#each STATUS_OPTIONS as status}
								<option value={status}>{status}</option>
							{/each}
						</select>
					{/if}
				</div>

				<Button variant="ghost" size="icon" class="h-6 w-6 shrink-0" onclick={() => removeCondition(index)}>
					<Trash2 class="h-3 w-3" />
				</Button>
			</div>
		{/each}
	</div>

	<Button variant="ghost" size="sm" class="add-condition-btn" onclick={addCondition}>
		<Plus class="h-3 w-3 mr-1" />
		Add Condition
	</Button>
</div>

<style>
	.condition-builder {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.group-operator {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.group-label {
		white-space: nowrap;
	}

	.operator-select,
	.condition-type-select,
	.field-select,
	.operator-field-select,
	.status-select {
		height: 1.75rem;
		font-size: 0.6875rem;
		padding: 0 0.5rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.25rem;
		background: hsl(var(--background));
		color: hsl(var(--foreground));
	}

	.conditions-list {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.condition-row {
		display: flex;
		align-items: flex-start;
		gap: 0.375rem;
		padding: 0.5rem;
		border-radius: 0.25rem;
		background: hsl(var(--accent) / 0.3);
		border: 1px solid hsl(var(--border));
	}

	.condition-fields {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1;
		min-width: 0;
	}

	.condition-fields select {
		width: 100%;
	}

	:global(.add-condition-btn) {
		align-self: flex-start;
	}
</style>
