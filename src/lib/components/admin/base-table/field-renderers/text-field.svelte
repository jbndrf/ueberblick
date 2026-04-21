<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Button } from '$lib/components/ui/button';
	import { Copy, Check } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages';

	interface TextFieldProps {
		value: any;
		editMode: boolean;
		onUpdate?: (value: string) => Promise<void>;
		multiline?: boolean;
		readonly?: boolean;
		copyable?: boolean;
	}

	let {
		value,
		editMode,
		onUpdate,
		multiline = false,
		readonly = false,
		copyable = false
	}: TextFieldProps = $props();

	let isEditing = $state(false);
	let editingValue = $state('');
	let isSaving = $state(false);
	let copied = $state(false);

	const displayValue = $derived(value === null || value === undefined || value === '' ? '-' : String(value));

	function startEditing() {
		if (!editMode || readonly || !onUpdate) return;
		editingValue = value === '-' ? '' : String(value ?? '');
		isEditing = true;
	}

	function cancelEditing() {
		isEditing = false;
		editingValue = '';
		isSaving = false;
	}

	async function saveCell() {
		if (isSaving || !onUpdate) return;

		isSaving = true;

		try {
			await onUpdate(editingValue);
			toast.success(m.commonSave());
			isEditing = false;
		} catch (error) {
			console.error('Error updating cell:', error);
			toast.error('Failed to update');
		} finally {
			isSaving = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !multiline) {
			event.preventDefault();
			saveCell();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelEditing();
		}
	}

	async function copyToClipboard() {
		try {
			await navigator.clipboard.writeText(String(value));
			copied = true;
			toast.success('Copied to clipboard');
			setTimeout(() => (copied = false), 2000);
		} catch (err) {
			toast.error('Failed to copy');
		}
	}
</script>

{#if isEditing}
	{#if multiline}
		<Textarea
			bind:value={editingValue}
			onkeydown={handleKeydown}
			onblur={saveCell}
			class="min-h-[80px] px-2 py-1"
			autofocus
			disabled={isSaving}
		/>
	{:else}
		<Input
			type="text"
			bind:value={editingValue}
			onkeydown={handleKeydown}
			onblur={saveCell}
			class="h-8 px-2 py-1"
			autofocus
			disabled={isSaving}
		/>
	{/if}
{:else}
	<div class="flex items-center gap-2">
		{#if editMode && !readonly && onUpdate}
			<button
				type="button"
				onclick={startEditing}
				class="flex-1 text-left hover:bg-muted/50 cursor-text px-2 py-1 -mx-2 -my-1 rounded transition-colors max-w-[300px] truncate block"
				title={displayValue}
			>
				{displayValue}
			</button>
		{:else}
			<span
				class="flex-1 text-left cursor-default px-2 py-1 -mx-2 -my-1 rounded max-w-[300px] truncate block select-text"
				title={displayValue}
			>
				{displayValue}
			</span>
		{/if}
		{#if copyable && value}
			<Button variant="ghost" size="sm" onclick={copyToClipboard} class="h-7 w-7 p-0 flex-shrink-0 relative z-10">
				{#if copied}
					<Check class="h-3 w-3 text-green-600" />
				{:else}
					<Copy class="h-3 w-3" />
				{/if}
				<span class="sr-only">Copy</span>
			</Button>
		{/if}
	</div>
{/if}
