<script lang="ts">
	import { History, Calculator } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import FieldHistoryDialog from '$lib/components/field-history/FieldHistoryDialog.svelte';
	import { field_history_readings, field_history_changes } from '$lib/paraglide/messages';
	import type { FormField } from './types';
	import type { Snippet } from 'svelte';

	type Props = {
		writeMode?: 'singleton' | 'observation' | 'computed';
		field?: FormField;
		valueHistory?: Array<{ id: string; value: unknown; recorded_at: string }>;
		children: Snippet;
	};

	let { writeMode, field, valueHistory, children }: Props = $props();

	let historyOpen = $state(false);
	// History expander is available whenever there's more than one prior value,
	// regardless of write_mode (workflow_field_values is append-only). The label
	// differs ("readings" reads naturally for observation fields, "changes" for
	// singletons), but the affordance is the same.
	const showHistoryToggle = $derived((valueHistory?.length ?? 0) > 1);
	const historyLabel = $derived(
		writeMode === 'observation'
			? field_history_readings({ count: valueHistory?.length ?? 0 })
			: field_history_changes({ count: valueHistory?.length ?? 0 })
	);
</script>

<div class="cmmn-field">
	<div class="cmmn-content">
		{@render children()}
	</div>

	{#if writeMode === 'computed'}
		<Badge variant="secondary" class="mt-1.5 text-[10px] gap-1">
			<Calculator class="h-3 w-3" />
			Computed
		</Badge>
	{:else if showHistoryToggle && field}
		<button
			type="button"
			class="history-toggle"
			onclick={() => (historyOpen = true)}
		>
			<History class="h-3 w-3" />
			<span>{historyLabel}</span>
		</button>

		<FieldHistoryDialog bind:open={historyOpen} {field} entries={valueHistory ?? []} />
	{/if}
</div>

<style>
	.cmmn-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.history-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		margin-top: 0.375rem;
		padding: 0.25rem 0.5rem;
		font-size: 0.6875rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		background: hsl(var(--muted));
		border: 1px solid hsl(var(--border));
		border-radius: 0.25rem;
		cursor: pointer;
		transition: background 0.1s ease;
		align-self: flex-start;
	}

	.history-toggle:hover {
		background: hsl(var(--accent));
		color: hsl(var(--foreground));
	}
</style>
