<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		defaultOpen?: boolean;
		children: Snippet;
	};

	let { title, defaultOpen = true, children }: Props = $props();

	let isOpen = $state(defaultOpen);
</script>

<div class="property-section">
	<button class="property-section-header" onclick={() => (isOpen = !isOpen)}>
		<span class="property-section-title">{title}</span>
		<ChevronDown class="property-section-chevron {!isOpen ? 'rotated' : ''}" />
	</button>

	{#if isOpen}
		<div class="property-section-content">
			{@render children()}
		</div>
	{/if}
</div>

<style>
	.property-section {
		border-bottom: 1px solid oklch(0.88 0.01 250);
	}

	:global(.dark) .property-section {
		border-bottom-color: oklch(1 0 0 / 20%);
	}

	.property-section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		padding: 0.625rem 1rem;
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
		transition: background 0.15s ease;
	}

	.property-section-header:hover {
		background: hsl(var(--accent) / 0.5);
	}

	.property-section-title {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
	}

	.property-section-chevron {
		width: 0.875rem;
		height: 0.875rem;
		color: hsl(var(--muted-foreground));
		transition: transform 0.2s ease;
	}

	.property-section-chevron.rotated {
		transform: rotate(-90deg);
	}

	.property-section-content {
		padding: 0.75rem 1rem 1rem;
	}
</style>
