<script lang="ts">
	import { ChevronDown } from 'lucide-svelte';
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		defaultOpen?: boolean;
		children: Snippet;
	};

	let { title, defaultOpen = true, children }: Props = $props();

	let isOpen = $state(defaultOpen);
</script>

<div class="tool-section">
	<button class="tool-section-header" onclick={() => (isOpen = !isOpen)}>
		<span class="tool-section-title">{title}</span>
		<ChevronDown class="tool-section-chevron {!isOpen ? 'rotated' : ''}" />
	</button>

	{#if isOpen}
		<div class="tool-section-content">
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
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
		transition: background 0.15s;
	}

	.tool-section-header:hover {
		background: hsl(var(--accent) / 0.5);
	}

	.tool-section-title {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.025em;
		color: hsl(var(--muted-foreground));
	}

	.tool-section-chevron {
		width: 1rem;
		height: 1rem;
		color: hsl(var(--muted-foreground));
		transition: transform 0.2s;
	}

	.tool-section-chevron.rotated {
		transform: rotate(-90deg);
	}

	.tool-section-content {
		padding: 0 1rem 1rem;
	}
</style>
