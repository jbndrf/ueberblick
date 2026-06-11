<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Plus } from '@lucide/svelte';

	type Props = {
		title: string;
		count?: number;
		onAdd?: () => void;
		addLabel?: string;
		children: Snippet;
	};

	let { title, count, onAdd, addLabel, children }: Props = $props();
</script>

<section class="model-section">
	<div class="section-head">
		<h3 class="section-title">
			{title}
			{#if count !== undefined}<span class="count">{count}</span>{/if}
		</h3>
		{#if onAdd}
			<button class="add-btn" onclick={onAdd} title={addLabel}>
				<Plus class="h-3.5 w-3.5" />
				{#if addLabel}<span>{addLabel}</span>{/if}
			</button>
		{/if}
	</div>
	{@render children()}
</section>

<style>
	.model-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		background: hsl(var(--card));
	}

	.section-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	.count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.25rem;
		height: 1.25rem;
		padding: 0 0.3rem;
		border-radius: 9999px;
		background: hsl(var(--muted));
		color: hsl(var(--muted-foreground));
		font-size: 0.6875rem;
		font-weight: 600;
	}

	.add-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.75rem;
		padding: 0.25rem 0.5rem;
		border-radius: 0.375rem;
		border: 1px solid hsl(var(--border));
		background: transparent;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.add-btn:hover {
		color: hsl(var(--foreground));
		background: hsl(var(--accent));
	}
</style>
