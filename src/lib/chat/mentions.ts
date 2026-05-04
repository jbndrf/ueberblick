// Mention helpers for project chat.
//
// Wire format: bodies contain plain text plus @<participantId> tokens, where
// <participantId> is the 15-char PocketBase id. Rendering replaces each token
// with a chip showing the participant's display name; the server hook
// re-extracts mentions on every save, so what the client puts in `mentions`
// is advisory.

const TOKEN = /@([a-z0-9]{15})/g;

export interface MentionParticipant {
	id: string;
	name: string;
}

export type Segment =
	| { kind: 'text'; text: string }
	| { kind: 'mention'; id: string; name: string };

export function extractMentionIds(body: string): string[] {
	const ids: string[] = [];
	const seen = new Set<string>();
	for (const match of body.matchAll(TOKEN)) {
		const id = match[1];
		if (seen.has(id)) continue;
		seen.add(id);
		ids.push(id);
	}
	return ids;
}

export function segments(body: string, lookup: Map<string, string>): Segment[] {
	const out: Segment[] = [];
	let cursor = 0;
	for (const match of body.matchAll(TOKEN)) {
		const start = match.index ?? 0;
		if (start > cursor) {
			out.push({ kind: 'text', text: body.slice(cursor, start) });
		}
		const id = match[1];
		out.push({ kind: 'mention', id, name: lookup.get(id) ?? id });
		cursor = start + match[0].length;
	}
	if (cursor < body.length) {
		out.push({ kind: 'text', text: body.slice(cursor) });
	}
	return out;
}

// Locate the @-trigger word the cursor is currently inside (or just after).
// Returns null when the cursor is not in a fresh `@…` token. Used by the
// composer to decide when to open the mention picker.
export function activeMentionTrigger(
	value: string,
	cursorPos: number
): { start: number; query: string } | null {
	if (cursorPos < 0 || cursorPos > value.length) return null;
	let i = cursorPos - 1;
	while (i >= 0) {
		const ch = value[i];
		if (ch === '@') {
			const before = i === 0 ? '' : value[i - 1];
			if (before && !/\s/.test(before)) return null;
			return { start: i, query: value.slice(i + 1, cursorPos) };
		}
		if (/\s/.test(ch)) return null;
		i--;
	}
	return null;
}

export function insertMention(
	value: string,
	triggerStart: number,
	cursorPos: number,
	id: string
): { value: string; cursor: number } {
	const before = value.slice(0, triggerStart);
	const after = value.slice(cursorPos);
	const inserted = `@${id} `;
	return {
		value: before + inserted + after,
		cursor: before.length + inserted.length,
	};
}
