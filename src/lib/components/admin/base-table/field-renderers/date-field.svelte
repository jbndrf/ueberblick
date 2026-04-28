<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages';

	type DateMode = 'date' | 'datetime' | 'time';

	interface DateFieldProps {
		value: any;
		editMode: boolean;
		onUpdate?: (value: string) => Promise<void>;
		readonly?: boolean;
		mode?: DateMode;
	}

	let {
		value,
		editMode,
		onUpdate,
		readonly = false,
		mode = 'date'
	}: DateFieldProps = $props();

	let isEditing = $state(false);
	let editingValue = $state('');
	let isSaving = $state(false);

	const inputType = $derived(
		mode === 'time' ? 'time' : mode === 'datetime' ? 'datetime-local' : 'date'
	);

	const displayValue = $derived.by(() => {
		if (value == null || value === '' || value === '-') return '-';
		const str = String(value);

		if (mode === 'time') {
			const match = str.match(/^(\d{1,2}):(\d{2})/);
			return match ? `${match[1].padStart(2, '0')}:${match[2]}` : str;
		}

		const date = new Date(str);
		if (isNaN(date.getTime())) return str;

		if (mode === 'datetime') {
			return date.toLocaleString('de-DE', {
				day: '2-digit',
				month: '2-digit',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		}

		return date.toLocaleDateString('de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		});
	});

	function toEditingValue(raw: any): string {
		if (raw == null || raw === '' || raw === '-') return '';
		const str = String(raw);

		if (mode === 'time') {
			const match = str.match(/^(\d{1,2}):(\d{2})/);
			return match ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
		}

		const date = new Date(str);
		if (isNaN(date.getTime())) {
			// Already in the right shape (e.g. "YYYY-MM-DD")
			if (mode === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
			if (mode === 'datetime' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str)) return str.slice(0, 16);
			return '';
		}

		const pad = (n: number) => String(n).padStart(2, '0');
		const yyyy = date.getFullYear();
		const mm = pad(date.getMonth() + 1);
		const dd = pad(date.getDate());

		if (mode === 'datetime') {
			return `${yyyy}-${mm}-${dd}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
		}
		return `${yyyy}-${mm}-${dd}`;
	}

	function startEditing() {
		if (!editMode || readonly || !onUpdate) return;
		editingValue = toEditingValue(value);
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
		type={inputType}
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
		title={displayValue}
		disabled={!editMode || readonly || !onUpdate}
	>
		{displayValue}
	</button>
{/if}
