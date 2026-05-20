<script lang="ts">
	import { History, Calculator, ChevronDown } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import type { Snippet } from 'svelte';

	type Props = {
		writeMode?: 'singleton' | 'observation' | 'computed';
		valueHistory?: Array<{ id: string; value: unknown; recorded_at: string }>;
		children: Snippet;
	};

	let { writeMode, valueHistory, children }: Props = $props();

	let historyOpen = $state(false);
	// History expander is available whenever there's more than one prior value,
	// regardless of write_mode (workflow_field_values is append-only). The label
	// differs ("readings" reads naturally for observation fields, "changes" for
	// singletons), but the affordance is the same.
	const showHistoryToggle = $derived((valueHistory?.length ?? 0) > 1);
	const historyLabel = $derived(writeMode === 'observation' ? 'readings' : 'changes');

	function fmt(ts: string): string {
		if (!ts) return '';
		const d = new Date(ts);
		if (Number.isNaN(d.getTime())) return ts;
		return d.toLocaleString();
	}

	function fmtValue(v: unknown): string {
		if (v == null) return '—';
		if (typeof v === 'string') return v;
		if (typeof v === 'number' || typeof v === 'boolean') return String(v);
		try { return JSON.stringify(v); } catch { return String(v); }
	}
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
	{:else if showHistoryToggle}
		<button
			type="button"
			class="history-toggle"
			onclick={() => (historyOpen = !historyOpen)}
			aria-expanded={historyOpen}
		>
			<History class="h-3 w-3" />
			<span>{valueHistory!.length} {historyLabel}</span>
			<span class="chevron-wrap" class:open={historyOpen}><ChevronDown class="h-3 w-3" /></span>
		</button>

		{#if historyOpen}
			<ol class="history-list">
				{#each valueHistory! as row (row.id)}
					<li class="history-row">
						<span class="history-time">{fmt(row.recorded_at)}</span>
						<span class="history-value">{fmtValue(row.value)}</span>
					</li>
				{/each}
			</ol>
		{/if}
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

	.chevron-wrap {
		display: inline-flex;
		transition: transform 0.15s ease;
	}

	.chevron-wrap.open {
		transform: rotate(180deg);
	}

	.history-list {
		margin: 0.25rem 0 0;
		padding: 0.375rem;
		list-style: none;
		background: hsl(var(--muted) / 0.5);
		border: 1px solid hsl(var(--border));
		border-radius: 0.25rem;
		font-size: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		max-height: 240px;
		overflow-y: auto;
	}

	.history-row {
		display: flex;
		gap: 0.5rem;
		justify-content: space-between;
		align-items: baseline;
		padding: 0.25rem 0.375rem;
		border-radius: 0.1875rem;
	}

	.history-row:nth-child(odd) {
		background: hsl(var(--background) / 0.5);
	}

	.history-time {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	.history-value {
		font-weight: 500;
		color: hsl(var(--foreground));
		text-align: right;
		word-break: break-word;
	}
</style>
