<script lang="ts">
	import { renderSnapshotValue } from '$lib/utils/value-formatter';
	import { field_history_empty } from '$lib/paraglide/messages';
	import type { FieldHistoryViewProps } from '../types';

	let { entries }: FieldHistoryViewProps = $props();

	function fmt(ts: string): string {
		if (!ts) return '';
		const d = new Date(ts);
		if (Number.isNaN(d.getTime())) return ts;
		return d.toLocaleString();
	}
</script>

{#if entries.length === 0}
	<div class="empty">{field_history_empty()}</div>
{:else}
	<ol class="history-list">
		{#each entries as row (row.id)}
			<li class="history-row">
				<span class="history-time">{fmt(row.recorded_at)}</span>
				<span class="history-value">{renderSnapshotValue(row.value)}</span>
			</li>
		{/each}
	</ol>
{/if}

<style>
	.empty {
		padding: 1rem;
		text-align: center;
		color: hsl(var(--muted-foreground));
		font-size: 0.875rem;
	}

	.history-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		max-height: 60vh;
		overflow-y: auto;
	}

	.history-row {
		display: flex;
		gap: 0.75rem;
		justify-content: space-between;
		align-items: baseline;
		padding: 0.5rem 0.625rem;
		border-radius: 0.25rem;
	}

	.history-row:nth-child(odd) {
		background: hsl(var(--muted) / 0.5);
	}

	.history-time {
		font-size: 0.75rem;
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
