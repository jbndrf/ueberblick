<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { Component } from 'svelte';
	import type { IconProps } from '@lucide/svelte';

	interface Props {
		icon: Component<IconProps>;
		label?: string;
		onclick?: () => void;
		position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
		variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost';
		size?: 'default' | 'sm' | 'lg' | 'icon';
		class?: string;
	}

	let {
		icon,
		label,
		onclick,
		position = 'bottom-right',
		variant = 'default',
		size = 'default',
		class: className = ''
	}: Props = $props();

	const positionClasses = {
		'bottom-right': 'bottom-20 right-4 lg:bottom-4 lg:right-20',
		'bottom-left': 'bottom-20 left-4 lg:bottom-4',
		'top-right': 'top-4 right-4 lg:right-20',
		'top-left': 'top-4 left-4'
	};

	const Icon = icon;
</script>

<Button
	{onclick}
	{variant}
	{size}
	class="pointer-events-auto fixed z-[1000] shadow-lg {positionClasses[position]} {className}"
	aria-label={label}
>
	<Icon class="h-5 w-5" />
	{#if label && size !== 'icon'}
		<span class="ml-2">{label}</span>
	{/if}
</Button>
