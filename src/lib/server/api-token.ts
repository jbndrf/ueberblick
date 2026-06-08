/**
 * Admin-issued, read-only personal access tokens for external GIS clients
 * (QGIS) to pull a project's data as GeoJSON.
 *
 * Trust model (see pb_migrations/1780300000_create_api_tokens.js):
 *  - The raw token (`ubk_<base64url(32 bytes)>`) is shown to the admin once and
 *    never stored; only its sha256 hash lives in `api_tokens`.
 *  - A request presents the raw token as a Bearer header. We hash it, look the
 *    row up with a SUPERUSER client (bypasses access rules — but the row holds
 *    only a hash + owner ref, no project data), then IMPERSONATE the owning
 *    `users` admin. Every subsequent data read runs as that admin, so the normal
 *    `owner_id` access rules decide what is returned. The superuser never reads
 *    project data.
 */
import PocketBase from 'pocketbase';
import { createHash, randomBytes } from 'node:crypto';
import { error, type RequestEvent } from '@sveltejs/kit';
import { getAdminPb } from './admin-auth';

export type ApiTokenRecord = {
	id: string;
	user_id: string;
	project_id: string;
	label: string;
	token_hash: string;
	last_four: string;
	expires_at: string;
	last_used_at: string;
	revoked: boolean;
};

const TOKEN_PREFIX = 'ubk_';

/** sha256 hex of the raw token — what we store and look up by. */
export function hashToken(raw: string): string {
	return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/** Generate a fresh raw token. Returned once to the admin; only its hash persists. */
export function generateRawToken(): { raw: string; hash: string; lastFour: string } {
	const raw = TOKEN_PREFIX + randomBytes(32).toString('base64url');
	return { raw, hash: hashToken(raw), lastFour: raw.slice(-4) };
}

/**
 * Resolve a raw token to its (valid, non-revoked, non-expired) record using the
 * superuser client. Returns null if absent/revoked/expired. Best-effort, throttled
 * `last_used_at` bump (so we don't write on every tile request).
 */
export async function resolveApiToken(raw: string): Promise<ApiTokenRecord | null> {
	if (!raw || !raw.startsWith(TOKEN_PREFIX)) return null;
	const hash = hashToken(raw);

	let rec: ApiTokenRecord;
	try {
		const su = await getAdminPb();
		rec = await su
			.collection('api_tokens')
			.getFirstListItem<ApiTokenRecord>(`token_hash = "${hash}"`, { requestKey: null });
	} catch {
		return null;
	}

	if (rec.revoked) return null;
	if (rec.expires_at && new Date(rec.expires_at).getTime() <= Date.now()) return null;

	void bumpLastUsed(rec);
	return rec;
}

const LAST_USED_THROTTLE_MS = 60_000;
async function bumpLastUsed(rec: ApiTokenRecord): Promise<void> {
	const prev = rec.last_used_at ? new Date(rec.last_used_at).getTime() : 0;
	if (Date.now() - prev < LAST_USED_THROTTLE_MS) return;
	try {
		const su = await getAdminPb();
		await su
			.collection('api_tokens')
			.update(rec.id, { last_used_at: new Date().toISOString() }, { requestKey: null });
	} catch {
		/* best-effort */
	}
}

// Short-lived cache of impersonation clients keyed by token id. TTL is well under
// the minted token's duration; revocation is still caught upstream because
// resolveApiToken() re-checks the DB on every request before we reach here.
const IMPERSONATE_DURATION_S = 600;
const IMPERSONATE_CACHE_TTL_MS = 60_000;
const impersonateCache = new Map<string, { pb: PocketBase; expires: number }>();

/**
 * Mint (or reuse) a PocketBase client authenticated AS the token's owning admin.
 * Only a superuser may impersonate, which is why the caller chain starts from
 * getAdminPb().
 */
export async function impersonateOwner(rec: ApiTokenRecord): Promise<PocketBase> {
	const cached = impersonateCache.get(rec.id);
	if (cached && cached.expires > Date.now()) return cached.pb;

	const su = await getAdminPb();
	const pb = await su.collection('users').impersonate(rec.user_id, IMPERSONATE_DURATION_S);
	pb.autoCancellation(false);
	impersonateCache.set(rec.id, { pb, expires: Date.now() + IMPERSONATE_CACHE_TTL_MS });
	return pb;
}

function readToken(event: RequestEvent): string | null {
	const header = (event.request.headers.get('authorization') || '').trim();

	// 1) Bearer <token>
	const bearer = /^Bearer\s+(.+)$/i.exec(header);
	if (bearer) return bearer[1].trim();

	// 2) Basic auth. QGIS only reliably ships the "Basic authentication" method
	//    (the "HTTP header" method isn't compiled into every build), so we accept
	//    the token supplied as the username (password left blank) — or in either
	//    field, for convenience.
	const basic = /^Basic\s+(.+)$/i.exec(header);
	if (basic) {
		try {
			const decoded = Buffer.from(basic[1].trim(), 'base64').toString('utf8');
			const idx = decoded.indexOf(':');
			const user = idx >= 0 ? decoded.slice(0, idx) : decoded;
			const pass = idx >= 0 ? decoded.slice(idx + 1) : '';
			if (user.startsWith('ubk_')) return user;
			if (pass.startsWith('ubk_')) return pass;
			return user || pass || null;
		} catch {
			return null;
		}
	}

	// 3) Documented-but-discouraged fallback (token ends up in URLs/logs).
	return event.url.searchParams.get('token');
}

/**
 * Gate for the GeoJSON read endpoints. Resolves the Bearer token and returns a
 * client impersonating the owning admin, plus the token record (for project-scope
 * checks). Throws 401 on any failure.
 */
export async function requireApiTokenAdmin(
	event: RequestEvent
): Promise<{ pb: PocketBase; tokenRec: ApiTokenRecord }> {
	const raw = readToken(event);
	if (!raw) throw error(401, 'Missing API token');
	const tokenRec = await resolveApiToken(raw);
	if (!tokenRec) throw error(401, 'Invalid or expired API token');
	const pb = await impersonateOwner(tokenRec);
	return { pb, tokenRec };
}
