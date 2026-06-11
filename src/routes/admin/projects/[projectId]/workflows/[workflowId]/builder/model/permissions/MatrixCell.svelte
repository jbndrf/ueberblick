<script lang="ts">
	import { Eye, EyeOff, FilePlus, FileMinus, Pencil, PencilOff } from '@lucide/svelte';
	import type { CellTone } from './matrix-model';

	let {
		allowed,
		isAll,
		tone,
		readOnly = false,
		disabled = false,
		title,
		onToggle
	}: {
		allowed: boolean;
		isAll: boolean;
		tone: CellTone;
		readOnly?: boolean;
		disabled?: boolean;
		title: string;
		onToggle?: () => void;
	} = $props();

	const cls = $derived(
		[
			'inline-flex h-7 w-7 items-center justify-center rounded border transition-transform',
			allowed ? 'text-green-600 dark:text-green-400' : 'text-destructive/40',
			allowed && isAll
				? 'border-dashed border-green-600/40 dark:border-green-400/40'
				: 'border-transparent',
			readOnly ? 'opacity-80' : 'cursor-pointer hover:bg-accent hover:scale-110',
			disabled ? 'cursor-wait opacity-50' : ''
		].join(' ')
	);
</script>

{#snippet icon()}
	{#if tone === 'view'}
		{#if allowed}<Eye class="h-4 w-4" />{:else}<EyeOff class="h-4 w-4" />{/if}
	{:else if tone === 'create'}
		{#if allowed}<FilePlus class="h-4 w-4" />{:else}<FileMinus class="h-4 w-4" />{/if}
	{:else if allowed}<Pencil class="h-4 w-4" />{:else}<PencilOff class="h-4 w-4" />{/if}
{/snippet}

{#if readOnly}
	<span class={cls} {title} aria-disabled="true">
		{@render icon()}
	</span>
{:else}
	<button type="button" class={cls} {title} {disabled} onclick={onToggle}>
		{@render icon()}
	</button>
{/if}
