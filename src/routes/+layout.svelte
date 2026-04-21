<script lang="ts">
	import '../app.css';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { onMount } from 'svelte';

	let { children } = $props();

	// Initialize theme on mount
	onMount(() => {
		// Theme is already initialized in the store constructor
		// This just ensures the store is created on client-side
		themeStore.current;
	});
</script>

<svelte:head>
	<link rel="icon" href="/icons/icon.png" type="image/png" />
</svelte:head>

{@render children?.()}
