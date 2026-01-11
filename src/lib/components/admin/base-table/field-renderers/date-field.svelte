<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { toast } from 'svelte-sonner';
	import { format, parseISO } from 'date-fns';
	import * as m from '$lib/paraglide/messages';

	interface DateFieldProps {
		value: any;
		editMode: boolean;
		onUpdate?: (value: string) => Promise<void>;
		readonly?: boolean;
		formatString?: string;
	}

	let {
		value,
		editMode,
		onUpdate,
		readonly = false,
		formatString = 'yyyy-MM-dd'
	}: DateFieldProps = $props();

	let isEditing = $state(false);
	let editingValue = $state('');
	let isSaving = $state(false);

	const displayValue = $derived(() => {
		if (!value || value === '-') return '-';
		try {
			const date = typeof value === 'string' ? parseISO(value) : new Date(value);
			if (isNaN(date.getTime())) return '-';
			return format(date, formatString);
		} catch {
			return '-';
		}
	});

	function startEditing() {
		if (!editMode || readonly || !onUpdate) return;
		// Convert to ISO date string for input[type=date]
		if (value && value !== '-') {
			try {
				const date = typeof value === 'string' ? parseISO(value) : new Date(value);
				editingValue = format(date, 'yyyy-MM-dd');
			} catch {
				editingValue = '';
			}
		} else {
			editingValue = '';
		}
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
		if (event.key === 'Enter') {
			event.preventDefault();
			saveCell();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelEditing();
		}
	}
</script>

{#if isEditing}
	<Input
		type="date"
		bind:value={editingValue}
		onkeydown={handleKeydown}
		onblur={saveCell}
		class="h-8 px-2 py-1"
		autofocus
		disabled={isSaving}
	/>
{:else}
	<button
		type="button"
		onclick={startEditing}
		class="w-full text-left {editMode && !readonly && onUpdate
			? 'hover:bg-muted/50 cursor-text'
			: 'cursor-default'} px-2 py-1 -mx-2 -my-1 rounded transition-colors max-w-[300px] truncate block"
		title={displayValue()}
		disabled={!editMode || readonly || !onUpdate}
	>
		{displayValue()}
	</button>
{/if}
