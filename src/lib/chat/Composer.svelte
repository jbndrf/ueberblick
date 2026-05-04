<script lang="ts">
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';
	import { Send, Loader2 } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages';
	import { activeMentionTrigger, insertMention } from './mentions';
	import type { MentionableStore } from './mentionable.svelte';

	interface Props {
		mentionables: MentionableStore;
		disabled?: boolean;
		onSubmit: (body: string) => Promise<void> | void;
	}

	let { mentionables, disabled = false, onSubmit }: Props = $props();

	let value = $state('');
	let cursor = $state(0);
	let textareaEl: HTMLTextAreaElement | null = $state(null);
	// Tracks what the picker last emitted, so we can compute newly-added ids on
	// each onSelectedIdsChange call. Plain let (not $state) — only read inside
	// the callback, and we don't want it to participate in reactivity loops.
	let prevPickerIds: string[] = [];
	let activeTrigger = $state<{ start: number; query: string } | null>(null);
	let submitting = $state(false);

	function syncCursor(ta: HTMLTextAreaElement) {
		cursor = ta.selectionStart ?? ta.value.length;
	}

	function onInput(e: Event) {
		const ta = e.currentTarget as HTMLTextAreaElement;
		value = ta.value;
		syncCursor(ta);
		activeTrigger = activeMentionTrigger(value, cursor);
	}

	function insertMentionAtCursor(id: string) {
		// Append "@<id> " at the current cursor, prepending a space if needed so
		// mentions don't collide with the previous word.
		const before = value.slice(0, cursor);
		const after = value.slice(cursor);
		const needsSpace = before.length > 0 && !/\s$/.test(before);
		const prefix = needsSpace ? ' @' : '@';
		const newValue = before + prefix + after;
		const triggerStart = before.length + prefix.length - 1;
		value = newValue;
		cursor = triggerStart + 1;
		const result = insertMention(value, triggerStart, cursor, id);
		value = result.value;
		cursor = result.cursor;
	}

	function onPickerChange(ids: string[]) {
		const newlyAdded = ids.filter((id) => !prevPickerIds.includes(id));
		prevPickerIds = ids;
		if (newlyAdded.length === 0) return;
		for (const id of newlyAdded) {
			if (activeTrigger) {
				const r = insertMention(value, activeTrigger.start, cursor, id);
				value = r.value;
				cursor = r.cursor;
				activeTrigger = null;
			} else {
				insertMentionAtCursor(id);
			}
		}
		queueMicrotask(() => {
			textareaEl?.focus();
			textareaEl?.setSelectionRange(cursor, cursor);
		});
	}

	async function submit() {
		const body = value.trim();
		if (!body || submitting || disabled) return;
		submitting = true;
		try {
			await onSubmit(body);
			value = '';
			cursor = 0;
			prevPickerIds = [];
		} finally {
			submitting = false;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !activeTrigger) {
			e.preventDefault();
			submit();
		}
	}
</script>

<div class="border-t bg-background p-2">
	<div class="flex items-end gap-2">
		<div class="w-40 shrink-0">
			<MobileMultiSelect
				options={mentionables.participants}
				getOptionId={(p: { id: string; name: string }) => p.id}
				getOptionLabel={(p: { id: string; name: string }) => p.name}
				singleSelect={false}
				summarizeMultiple={true}
				disabled={disabled || mentionables.participants.length === 0}
				placeholder={m.chatMentionButtonTitle?.() ?? '@ Mention'}
				emptyLabel={m.chatMentionPickerEmpty?.() ?? 'No participants'}
				class="h-9 text-sm"
				disablePortal={true}
				onSelectedIdsChange={onPickerChange}
			/>
		</div>
		<textarea
			bind:this={textareaEl}
			class="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-md border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
			rows="1"
			placeholder={disabled ? (m.chatComposerReadOnly?.() ?? 'Read-only') : (m.chatComposerPlaceholder?.() ?? 'Message…')}
			bind:value
			{disabled}
			oninput={onInput}
			onkeyup={(e) => syncCursor(e.currentTarget as HTMLTextAreaElement)}
			onclick={(e) => syncCursor(e.currentTarget as HTMLTextAreaElement)}
			onkeydown={onKeydown}
		></textarea>
		<button
			type="button"
			class="flex h-9 shrink-0 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
			disabled={!value.trim() || submitting || disabled}
			onclick={submit}
		>
			{#if submitting}
				<Loader2 class="h-4 w-4 animate-spin" />
			{:else}
				<Send class="h-4 w-4" />
			{/if}
		</button>
	</div>
</div>
