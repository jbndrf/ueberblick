/**
 * Client-side PocketBase clients.
 *
 * Two independent sessions live in the browser at once: an admin session
 * (cookie pb_auth_admin) and a participant session (cookie pb_auth_participant).
 * They never overwrite each other, so a single browser can be signed in to
 * both surfaces simultaneously.
 */

import PocketBase from 'pocketbase';
import { POCKETBASE_URL } from '$lib/config/pocketbase';
import type { RecordModel } from 'pocketbase';

const ADMIN_COOKIE = 'pb_auth_admin';
const PARTICIPANT_COOKIE = 'pb_auth_participant';

let adminClient: PocketBase | null = null;
let participantClient: PocketBase | null = null;

function readCookie(name: string): string | null {
	if (typeof document === 'undefined') return null;
	for (const part of document.cookie.split(';')) {
		const trimmed = part.trim();
		const eq = trimmed.indexOf('=');
		if (eq < 0) continue;
		if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1);
	}
	return null;
}

function makeClient(cookieName: string): PocketBase {
	const pb = new PocketBase(POCKETBASE_URL);
	const v = readCookie(cookieName);
	if (v) pb.authStore.loadFromCookie(`pb_auth=${v}`);
	return pb;
}

export function getAdminPocketBase(): PocketBase {
	if (!adminClient) adminClient = makeClient(ADMIN_COOKIE);
	return adminClient;
}

export function getParticipantPocketBase(): PocketBase {
	if (!participantClient) participantClient = makeClient(PARTICIPANT_COOKIE);
	return participantClient;
}

/**
 * Persist the participant client's current auth token to the pb_auth_participant
 * cookie. The server hook normally re-writes this on every server-reached
 * request, but a client-side authRefresh() (e.g. on PWA startup served from the
 * SW cache, where no server request runs) must write it back itself. Mirrors the
 * server's exportAuthToNamedCookie: same name, 90-day maxAge, httpOnly:false.
 */
export function persistParticipantAuthCookie(): void {
	if (typeof document === 'undefined') return;
	const pb = getParticipantPocketBase();
	const cookieStr = pb.authStore.exportToCookie({
		httpOnly: false,
		secure: typeof location !== 'undefined' && location.protocol === 'https:',
		sameSite: 'Lax',
		maxAge: 60 * 60 * 24 * 90 // keep in sync with hooks.server.ts
	});
	document.cookie = cookieStr.replace(/^pb_auth=/, `${PARTICIPANT_COOKIE}=`);
}

/**
 * Surface-aware client. Picks based on URL: /admin/* → admin, else → participant.
 * Prefer the explicit getters in code that knows which surface it serves.
 */
export function getPocketBase(): PocketBase {
	if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
		return getAdminPocketBase();
	}
	return getParticipantPocketBase();
}

export async function signIn(email: string, password: string) {
	const pb = getAdminPocketBase();
	const authData = await pb.collection('users').authWithPassword(email, password);
	return { user: authData.record };
}

export function signOut() {
	getAdminPocketBase().authStore.clear();
	getParticipantPocketBase().authStore.clear();
}

/**
 * Drop cached singletons so the next getter call rebuilds from current cookies.
 * Useful after a logout/login round-trip.
 */
export function resetPocketBase(): void {
	adminClient?.authStore.clear();
	participantClient?.authStore.clear();
	adminClient = null;
	participantClient = null;
}

export function getCurrentUser(): RecordModel | null {
	return getPocketBase().authStore.model;
}

export function isAuthenticated(): boolean {
	return getPocketBase().authStore.isValid;
}

export function onAuthStateChange(callback: (user: RecordModel | null) => void) {
	const pb = getPocketBase();
	callback(pb.authStore.model);
	return pb.authStore.onChange((_token, model) => callback(model));
}

// =============================================================================
// Participant session expiry
// =============================================================================
//
// A participant token can be rejected by the server (401) while the client still
// believes it is authenticated -- e.g. the token expired, was rotated, or the
// participant was deleted. The data layer (sync/gateway) detects this and calls
// notifyParticipantSessionExpired(); the participant layout registers a handler
// that sends the user to /login. Fires at most once until reset on next login.

let sessionExpiredHandler: (() => void) | null = null;
let sessionExpiredFired = false;

/**
 * True only for a token-level auth failure (401). A 403 is a per-record/
 * collection rule denial and must NOT invalidate the whole session.
 */
export function isParticipantAuthError(e: unknown): boolean {
	return !!e && typeof e === 'object' && (e as { status?: number }).status === 401;
}

/** Register the handler that reacts to participant session expiry (e.g. redirect to /login). */
export function onParticipantSessionExpired(cb: () => void): () => void {
	sessionExpiredHandler = cb;
	return () => {
		if (sessionExpiredHandler === cb) sessionExpiredHandler = null;
	};
}

/** Called by the data layer on a 401. Clears auth and notifies the handler once. */
export function notifyParticipantSessionExpired(): void {
	if (sessionExpiredFired) return;
	sessionExpiredFired = true;
	getParticipantPocketBase().authStore.clear();
	sessionExpiredHandler?.();
}

/** Reset the one-shot guard after a successful (re-)login. */
export function resetParticipantSessionExpiry(): void {
	sessionExpiredFired = false;
}
