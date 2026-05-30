<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { field_history_dialog_title } from '$lib/paraglide/messages';
	import type { FormField } from '$lib/components/form-renderer/types';
	import { getHistoryView } from './registry';
	import type { HistoryEntry } from './types';

	type Props = {
		open: boolean;
		field: FormField;
		entries: HistoryEntry[];
	};

	let { open = $bindable(), field, entries }: Props = $props();

	const View = $derived(getHistoryView(field.field_type));
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>{field_history_dialog_title()} — {field.field_label}</Dialog.Title>
		</Dialog.Header>
		<View {field} {entries} />
	</Dialog.Content>
</Dialog.Root>
