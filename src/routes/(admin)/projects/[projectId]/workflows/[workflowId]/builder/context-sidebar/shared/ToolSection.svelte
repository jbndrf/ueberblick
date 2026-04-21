<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		title: string;
		defaultOpen?: boolean;
		children: Snippet;
	};

	let { title, defaultOpen = true, children }: Props = $props();

	let isOpen = $state(defaultOpen);
</script>

<div class="tool-section border-b border-border">
	<button class="tool-section-header bg-muted hover:bg-accent border-b border-border" onclick={() => (isOpen = !isOpen)}>
		<span class="tool-section-title text-muted-foreground">{m.workflowBuilderToolSectionTitle?.() ?? title}</span>
		<ChevronDown class="tool-section-chevron text-muted-foreground {!isOpen ? 'rotated' : ''}" />
	</button>

	{#if isOpen}
		<div class="tool-section-content bg-card">
			{@render children()}
		</div>
	{/if}
</div>

<style>
	.tool-section {
		border-bottom: 1px solid hsl(var(--border));
	}

	.tool-section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		padding: 0.75rem 1rem;
		background: hsl(var(--muted));
		border: none;
		border-bottom: 1px solid hsl(var(--border));
		cursor: pointer;
		text-align: left;
		transition: all 0.2s ease;
	}

	.tool-section-header:hover {
		background: hsl(var(--accent));
	}

	.tool-section-title {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
	}

	.tool-section-chevron {
		width: 0.875rem;
		height: 0.875rem;
		color: hsl(var(--muted-foreground));
		transition: transform 0.2s ease;
	}

	.tool-section-chevron.rotated {
		transform: rotate(-90deg);
	}

	.tool-section-content {
		padding: 0.75rem 1rem 1rem;
		background: hsl(var(--card));
	}
</style>
