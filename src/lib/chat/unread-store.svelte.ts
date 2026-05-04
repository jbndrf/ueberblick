// Per-project unread badge state. Server stores high-water marks in
// chat_read_state (synced across devices via realtime). Counts are derived
// locally from chat_messages — every message is mirrored into IDB by the
// participant-state sync engine, so this is just a reactive filter.
//
// Two signal levels:
//   - soft: any unread message in the room (gray dot)
//   - hard: count of unread mentions of self (red badge)

import type { ParticipantGateway, LiveQuery } from '$lib/participant-state/gateway.svelte';

interface ChatMessage {
	id: string;
	project_id: string;
	author_id: string;
	body: string;
	mentions?: string[] | string | null;
	created: string;
}

interface ChatReadState {
	id: string;
	participant_id: string;
	project_id: string;
	last_read_at?: string;
	last_mention_seen_at?: string;
}

function asMentions(v: ChatMessage['mentions']): string[] {
	if (Array.isArray(v)) return v;
	if (!v) return [];
	if (typeof v === 'string') {
		try {
			const parsed = JSON.parse(v);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}
	return [];
}

export function createChatUnreadStore(
	gateway: ParticipantGateway,
	projectId: string
) {
	const messagesLive: LiveQuery<ChatMessage> = gateway
		.collection<ChatMessage>('chat_messages')
		.live({ filter: `project_id = "${projectId}"`, sort: '-created', priority: 'normal' });

	const readStateLive: LiveQuery<ChatReadState> = gateway
		.collection<ChatReadState>('chat_read_state')
		.live({
			filter: `participant_id = "${gateway.participantId}" && project_id = "${projectId}"`,
			priority: 'normal',
		});

	const myReadState = $derived(readStateLive.records[0] ?? null);
	const lastReadAt = $derived(myReadState?.last_read_at ?? '1970-01-01T00:00:00Z');
	const lastMentionSeenAt = $derived(
		myReadState?.last_mention_seen_at ?? '1970-01-01T00:00:00Z'
	);

	const selfId = gateway.participantId;

	const unreadCount = $derived.by(() => {
		let n = 0;
		for (const m of messagesLive.records) {
			if (m.author_id === selfId) continue;
			if (!m.created || m.created <= lastReadAt) continue;
			n++;
		}
		return n;
	});

	const mentionCount = $derived.by(() => {
		let n = 0;
		for (const m of messagesLive.records) {
			if (m.author_id === selfId) continue;
			if (!m.created || m.created <= lastMentionSeenAt) continue;
			if (!asMentions(m.mentions).includes(selfId)) continue;
			n++;
		}
		return n;
	});

	const latestMessageAt = $derived(
		messagesLive.records.length > 0 ? messagesLive.records[0].created : null
	);

	async function markAllRead(): Promise<void> {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const now = new Date().toISOString();
		const existing = myReadState;
		const data: Partial<ChatReadState> = {
			participant_id: selfId,
			project_id: projectId,
			last_read_at: now,
			last_mention_seen_at: now,
		};
		if (existing) {
			await gateway.collection<ChatReadState>('chat_read_state').update(existing.id, data);
		} else {
			await gateway.collection<ChatReadState>('chat_read_state').create(data);
		}
	}

	function destroy(): void {
		messagesLive.destroy();
		readStateLive.destroy();
	}

	return {
		get messages() { return messagesLive.records; },
		get unreadCount() { return unreadCount; },
		get mentionCount() { return mentionCount; },
		get hasUnread() { return unreadCount > 0; },
		get hasMentions() { return mentionCount > 0; },
		get latestMessageAt() { return latestMessageAt; },
		markAllRead,
		destroy,
	};
}

export type ChatUnreadStore = ReturnType<typeof createChatUnreadStore>;
