import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { paraglideMiddleware } from '$lib/paraglide/server';
import PocketBase from 'pocketbase';
import { POCKETBASE_URL } from '$lib/config/pocketbase';
import { env } from '$env/dynamic/private';

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;

		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
		});
	});

const CSP_REPORT_ONLY = [
	"default-src 'self'",
	"script-src 'self'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob: https:",
	"font-src 'self' data:",
	"connect-src 'self' https: wss:",
	"worker-src 'self' blob:",
	"frame-ancestors 'none'",
	"base-uri 'self'",
	"form-action 'self'"
].join('; ');

const ADMIN_COOKIE = 'pb_auth_admin';
const PARTICIPANT_COOKIE = 'pb_auth_participant';

function parseCookies(header: string): Record<string, string> {
	const out: Record<string, string> = {};
	if (!header) return out;
	for (const part of header.split(';')) {
		const eq = part.indexOf('=');
		if (eq < 0) continue;
		const k = part.slice(0, eq).trim();
		const v = part.slice(eq + 1).trim();
		if (k) out[k] = v;
	}
	return out;
}

// PocketBase's authStore.loadFromCookie looks for "pb_auth=" by default. We
// store under custom names, so we feed it a synthetic cookie with the value
// from our named cookie. exportToCookie always emits "pb_auth=...", so the
// outgoing header name is rewritten in exportAuthToNamedCookie.
function loadAuthFromNamedCookie(
	pb: PocketBase,
	cookies: Record<string, string>,
	name: string
) {
	const value = cookies[name];
	if (!value) return;
	pb.authStore.loadFromCookie(`pb_auth=${value}`);
}

function exportAuthToNamedCookie(pb: PocketBase, name: string): string {
	const cookieStr = pb.authStore.exportToCookie({
		httpOnly: false,
		secure: env.SECURE_COOKIES === 'true',
		sameSite: 'Lax',
		// Match the participants auth-token duration (90 days, see
		// pb_migrations/1780200000_participants_token_duration.js) so the cookie
		// never outlives -- or dies before -- the token it carries.
		maxAge: 60 * 60 * 24 * 90
	});
	return cookieStr.replace(/^pb_auth=/, `${name}=`);
}

async function refreshSession(
	pb: PocketBase,
	collection: 'users' | 'participants'
): Promise<void> {
	if (!pb.authStore.token) return;
	try {
		await pb.collection(collection).authRefresh();
	} catch (err: any) {
		if (err?.status === 401 || err?.status === 403) {
			pb.authStore.clear();
		}
		console.error(`[Auth ${collection}] Refresh failed:`, err?.message || err);
	}
}

const handleAuth: Handle = async ({ event, resolve }) => {
	const cookies = parseCookies(event.request.headers.get('cookie') || '');

	const pbAdmin = new PocketBase(POCKETBASE_URL);
	const pbParticipant = new PocketBase(POCKETBASE_URL);

	loadAuthFromNamedCookie(pbAdmin, cookies, ADMIN_COOKIE);
	loadAuthFromNamedCookie(pbParticipant, cookies, PARTICIPANT_COOKIE);

	if (pbAdmin.authStore.record && pbAdmin.authStore.record.collectionName !== 'users') {
		pbAdmin.authStore.clear();
	}
	if (
		pbParticipant.authStore.record &&
		pbParticipant.authStore.record.collectionName !== 'participants'
	) {
		pbParticipant.authStore.clear();
	}

	await Promise.all([
		refreshSession(pbAdmin, 'users'),
		refreshSession(pbParticipant, 'participants')
	]);

	event.locals.pbAdmin = pbAdmin;
	event.locals.pbParticipant = pbParticipant;
	event.locals.user =
		pbAdmin.authStore.isValid && pbAdmin.authStore.record?.collectionName === 'users'
			? pbAdmin.authStore.record
			: null;
	event.locals.participant =
		pbParticipant.authStore.isValid &&
		pbParticipant.authStore.record?.collectionName === 'participants'
			? pbParticipant.authStore.record
			: null;

	const response = await resolve(event);

	response.headers.append('set-cookie', exportAuthToNamedCookie(pbAdmin, ADMIN_COOKIE));
	response.headers.append(
		'set-cookie',
		exportAuthToNamedCookie(pbParticipant, PARTICIPANT_COOKIE)
	);

	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'geolocation=(self), camera=(self), microphone=()');
	if (env.SECURE_COOKIES === 'true') {
		response.headers.set(
			'Strict-Transport-Security',
			'max-age=31536000; includeSubDomains'
		);
	}
	response.headers.set('Content-Security-Policy-Report-Only', CSP_REPORT_ONLY);

	return response;
};

export const handle: Handle = sequence(handleAuth, handleParaglide);
