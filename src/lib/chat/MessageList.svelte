<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { segments, type MentionParticipant } from './mentions';
	import type { MentionableStore } from './mentionable.svelte';

	interface ChatMessage {
		id: string;
		author_id: string;
		body: string;
		mentions?: string[] | string | null;
		created: string;
	}

	interface Props {
		// Newest-first as delivered by the live query; we render oldest-first.
		messages: ChatMessage[];
		mentionables: MentionableStore;
		selfId: string;
	}

	let { messages, mentionables, selfId }: Props = $props();

	// Sort oldest-first by created timestamp so newest always sits at the bottom,
	// regardless of how the live query / IDB delivers them.
	const ordered = $derived(
		[...messages].sort((a, b) => (a.created < b.created ? -1 : a.created > b.created ? 1 : 0))
	);

	const lookup = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const map = new Map<string, string>();
		for (const p of mentionables.participants as MentionParticipant[]) {
			map.set(p.id, p.name);
		}
		return map;
	});

	function authorName(id: string): string {
		if (id === selfId) return m.chatYou?.() ?? 'You';
		return lookup.get(id) ?? (m.chatUnknownUser?.() ?? 'Unknown');
	}

	function timeLabel(iso: string): string {
		try {
			return new Date(iso).toLocaleString();
		} catch {
			return iso;
		}
	}

	// Group consecutive messages from the same author within 5 min.
	const groups = $derived.by(() => {
		const out: { authorId: string; items: ChatMessage[] }[] = [];
		const FIVE_MIN = 5 * 60 * 1000;
		for (const msg of ordered) {
			const last = out[out.length - 1];
			const prevTs = last ? new Date(last.items[last.items.length - 1].created).getTime() : 0;
			const thisTs = new Date(msg.created).getTime();
			if (last && last.authorId === msg.author_id && thisTs - prevTs < FIVE_MIN) {
				last.items.push(msg);
			} else {
				out.push({ authorId: msg.author_id, items: [msg] });
			}
		}
		return out;
	});
</script>

<div class="flex flex-col gap-4 p-3">
	{#if ordered.length === 0}
		<div class="flex flex-col items-center justify-center py-16 text-center text-sm text-muted-foreground">
			<p>{m.chatEmptyState?.() ?? 'No messages yet. Be the first to say hi.'}</p>
		</div>
	{/if}

	{#each groups as group, gi (gi)}
		{@const isSelf = group.authorId === selfId}
		<div class="flex flex-col gap-1 {isSelf ? 'items-end' : 'items-start'}">
			<div class="text-xs text-muted-foreground">
				{authorName(group.authorId)} · {timeLabel(group.items[0].created)}
			</div>
			{#each group.items as msg (msg.id)}
				<div
					class="max-w-[85%] rounded-2xl px-3 py-2 text-[1.09375rem] leading-snug shadow-sm {isSelf
						? 'rounded-br-sm bg-primary text-primary-foreground'
						: 'rounded-bl-sm bg-muted text-foreground'}"
				>
					{#each segments(msg.body, lookup) as seg, si (si)}
						{#if seg.kind === 'text'}<span class="whitespace-pre-wrap break-words">{seg.text}</span>{:else}<span
								class="mx-0.5 rounded px-1 py-0.5 font-medium {seg.id === selfId
									? 'bg-yellow-300/40 text-foreground'
									: isSelf
										? 'bg-primary-foreground/20'
										: 'bg-primary/15 text-primary'}"
							>@{seg.name}</span
							>{/if}
					{/each}
				</div>
			{/each}
		</div>
	{/each}
</div>
