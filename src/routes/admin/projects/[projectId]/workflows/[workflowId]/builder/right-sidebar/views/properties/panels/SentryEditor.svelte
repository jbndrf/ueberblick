<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Plus, X } from '@lucide/svelte';
	import type { SentryClause, WorkflowFieldDef } from '$lib/workflow-builder';

	type Props = {
		sentry: SentryClause[];
		fieldDefs: WorkflowFieldDef[];
		onChange: (next: SentryClause[]) => void;
	};

	let { sentry = $bindable<SentryClause[]>([]), fieldDefs, onChange }: Props = $props();

	const OPS: Array<{ value: SentryClause['op']; label: string }> = $derived([
		{ value: 'equals', label: 'equals' },
		{ value: 'not_equals', label: 'not equals' },
		{ value: 'contains', label: 'contains' },
		{ value: 'is_empty', label: 'is empty' },
		{ value: 'is_not_empty', label: 'is not empty' },
		{ value: 'gt', label: '>' },
		{ value: 'gte', label: '>=' },
		{ value: 'lt', label: '<' },
		{ value: 'lte', label: '<=' }
	]);

	const UNARY_OPS = new Set<SentryClause['op']>(['is_empty', 'is_not_empty']);

	function commit(next: SentryClause[]) {
		sentry = next;
		onChange(next);
	}

	function addClause() {
		const defaultDefId = fieldDefs[0]?.id ?? '';
		commit([...(sentry ?? []), { field_def_id: defaultDefId, op: 'equals', value: '' }]);
	}

	function removeClause(index: number) {
		const next = (sentry ?? []).slice();
		next.splice(index, 1);
		commit(next);
	}

	function updateClause(index: number, updates: Partial<SentryClause>) {
		const next = (sentry ?? []).slice();
		const merged = { ...next[index], ...updates };
		// Drop value field for unary ops to keep the shape clean.
		if (UNARY_OPS.has(merged.op)) {
			delete merged.value;
		} else if (merged.value === undefined) {
			merged.value = '';
		}
		next[index] = merged;
		commit(next);
	}
</script>

<div class="sentry-editor">
	<p class="hint">
		{'Show this connection only when…'}
	</p>

	{#if !sentry || sentry.length === 0}
		<p class="empty">
			{'Always available (no conditions)'}
		</p>
	{:else}
		<div class="clauses">
			{#each sentry as clause, i (i)}
				{#if i > 0}
					<div class="and-divider"><span>{'AND'}</span></div>
				{/if}
				<div class="clause-row">
					<div class="clause-controls">
						<select
							class="field-select"
							value={clause.field_def_id}
							onchange={(e) => updateClause(i, { field_def_id: e.currentTarget.value })}
						>
							{#if fieldDefs.length === 0}
								<option value="">
									{'No fields available'}
								</option>
							{:else}
								{#each fieldDefs as def (def.id)}
									<option value={def.id}>{def.label || def.key}</option>
								{/each}
							{/if}
						</select>

						<select
							class="op-select"
							value={clause.op}
							onchange={(e) =>
								updateClause(i, { op: e.currentTarget.value as SentryClause['op'] })}
						>
							{#each OPS as op (op.value)}
								<option value={op.value}>{op.label}</option>
							{/each}
						</select>

						{#if !UNARY_OPS.has(clause.op)}
							<Input
								class="value-input"
								value={clause.value ?? ''}
								oninput={(e) =>
									updateClause(i, { value: (e.currentTarget as HTMLInputElement).value })}
								placeholder={'value'}
							/>
						{/if}
					</div>

					<button
						type="button"
						class="remove-btn"
						onclick={() => removeClause(i)}
						title={'Remove clause'}
					>
						<X class="h-3.5 w-3.5" />
					</button>
				</div>
			{/each}
		</div>
	{/if}

	<Button
		variant="outline"
		size="sm"
		class="add-btn"
		onclick={addClause}
		disabled={fieldDefs.length === 0}
	>
		<Plus class="h-3.5 w-3.5 mr-1" />
		{'Add clause'}
	</Button>
</div>

<style>
	.sentry-editor {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.hint {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	.empty {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		font-style: italic;
		padding: 0.5rem 0;
		margin: 0;
	}

	.clauses {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.clause-row {
		display: flex;
		align-items: flex-start;
		gap: 0.375rem;
		padding: 0.5rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		background: hsl(var(--accent) / 0.2);
	}

	.clause-controls {
		flex: 1;
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		min-width: 0;
	}

	.field-select,
	.op-select {
		min-width: 0;
		flex: 1 1 6rem;
		height: 1.75rem;
		font-size: 0.75rem;
		padding: 0 0.375rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.25rem;
		background: hsl(var(--background));
		color: hsl(var(--foreground));
	}

	.clause-controls :global(.value-input) {
		flex: 1 1 6rem;
		height: 1.75rem;
		font-size: 0.75rem;
		padding: 0 0.375rem;
	}

	.remove-btn {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.75rem;
		border-radius: 0.25rem;
		border: none;
		background: transparent;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.remove-btn:hover {
		background: hsl(var(--destructive) / 0.1);
		color: hsl(var(--destructive));
	}

	.and-divider {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.625rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		padding: 0.125rem 0;
	}

	.and-divider span {
		padding: 0 0.25rem;
	}

	:global(.sentry-editor .add-btn) {
		align-self: flex-start;
		height: 1.75rem;
		font-size: 0.75rem;
	}
</style>
