<script lang="ts">
	import type { Snippet, Component } from 'svelte';

	type Props = {
		label: string;
		description?: string;
		icon?: Component<{ class?: string }>;
		variant?: 'default' | 'primary' | 'muted';
		disabled?: boolean;
		onclick?: () => void;
	};

	let {
		label,
		description,
		icon: Icon,
		variant = 'default',
		disabled = false,
		onclick
	}: Props = $props();
</script>

<button class="tool-button" class:primary={variant === 'primary'} class:muted={variant === 'muted'} {disabled} {onclick}>
	{#if Icon}
		<Icon class="tool-button-icon" />
	{/if}
	<div class="tool-button-text">
		<span class="tool-button-label">{label}</span>
		{#if description}
			<span class="tool-button-description">{description}</span>
		{/if}
	</div>
</button>

<style>
	.tool-button {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: hsl(var(--accent) / 0.3);
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		cursor: pointer;
		text-align: left;
		transition: all 0.15s;
	}

	.tool-button:hover:not(:disabled) {
		background: hsl(var(--accent));
		border-color: hsl(var(--accent-foreground) / 0.2);
	}

	.tool-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.tool-button.primary {
		background: hsl(var(--primary) / 0.1);
		border-color: hsl(var(--primary) / 0.3);
	}

	.tool-button.primary:hover:not(:disabled) {
		background: hsl(var(--primary) / 0.2);
		border-color: hsl(var(--primary) / 0.5);
	}

	.tool-button.muted {
		background: transparent;
		border-color: transparent;
	}

	.tool-button.muted:hover:not(:disabled) {
		background: hsl(var(--accent) / 0.5);
	}

	.tool-button :global(.tool-button-icon) {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
		color: hsl(var(--muted-foreground));
	}

	.tool-button.primary :global(.tool-button-icon) {
		color: hsl(var(--primary));
	}

	.tool-button-text {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.tool-button-label {
		font-size: 0.8125rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tool-button-description {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
