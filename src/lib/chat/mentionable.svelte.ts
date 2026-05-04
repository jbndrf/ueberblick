// Source-of-truth for mentionable participants in the current project chat.
//
// Backed by GET /api/custom/chat/mentionable-participants. Endpoint is the
// only legitimate way for a participant to discover other participants by
// name (the participants collection's listRule limits each row to its owner).
//
// Stale-while-revalidate: the most recent successful response is persisted
// to localStorage, so the mention picker still works on a cold reload while
// offline. A background refresh fires whenever the store is opened online.

import { getPocketBase } from '$lib/pocketbase';
import type { MentionParticipant } from './mentions';

interface CacheEntry {
	fetchedAt: number;
	participants: MentionParticipant[];
}

function cacheKey(projectId: string): string {
	return `chat:mentionables:${projectId}`;
}

function readCache(projectId: string): CacheEntry | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(cacheKey(projectId));
		if (!raw) return null;
		const parsed = JSON.parse(raw) as CacheEntry;
		if (!Array.isArray(parsed.participants)) return null;
		return parsed;
	} catch {
		return null;
	}
}

function writeCache(projectId: string, participants: MentionParticipant[]): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(
			cacheKey(projectId),
			JSON.stringify({ fetchedAt: Date.now(), participants })
		);
	} catch {
		// quota or private mode -- non-fatal
	}
}

export function createMentionableStore(projectId: string) {
	const initial = readCache(projectId);
	let participants = $state<MentionParticipant[]>(initial?.participants ?? []);
	let loading = $state(false);
	let error = $state<string | null>(null);

	async function refresh(): Promise<void> {
		if (typeof navigator !== 'undefined' && !navigator.onLine) return;
		loading = true;
		error = null;
		try {
			const pb = getPocketBase();
			const res = await pb.send<{ entities: MentionParticipant[] }>(
				`/api/custom/chat/mentionable-participants?project_id=${encodeURIComponent(projectId)}`,
				{ method: 'GET' }
			);
			const list = Array.isArray(res?.entities) ? res.entities : [];
			participants = list;
			writeCache(projectId, list);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	// Fire and forget on creation so the picker has fresh data on first open.
	refresh();

	return {
		get participants() { return participants; },
		get loading() { return loading; },
		get error() { return error; },
		refresh,
		lookup(id: string): string | undefined {
			return participants.find((p) => p.id === id)?.name;
		},
	};
}

export type MentionableStore = ReturnType<typeof createMentionableStore>;
