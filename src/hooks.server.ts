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

const handleAuth: Handle = async ({ event, resolve }) => {
	// Create PocketBase instance
	event.locals.pb = new PocketBase(POCKETBASE_URL);

	// Load auth store from cookie
	const cookieHeader = event.request.headers.get('cookie') || '';
	event.locals.pb.authStore.loadFromCookie(cookieHeader);

	// Refresh auth if we have a token
	try {
		// Always attempt refresh if we have a token, not just if valid
		// PocketBase allows refreshing recently-expired tokens
		if (event.locals.pb.authStore.token) {
			const collectionName = event.locals.pb.authStore.record?.collectionName;

			if (collectionName === 'participants') {
				await event.locals.pb.collection('participants').authRefresh();
			} else if (collectionName === 'users') {
				await event.locals.pb.collection('users').authRefresh();
			}
		}
	} catch (err: any) {
		// Only clear auth on actual auth errors (401/403), not network issues
		if (err?.status === 401 || err?.status === 403) {
			event.locals.pb.authStore.clear();
		}
		console.error('[Auth] Refresh failed:', err?.message || err);
	}

	// Set user/participant in locals for easy access
	event.locals.user = event.locals.pb.authStore.record;

	const response = await resolve(event);

	// Send back the auth cookie to the client
	const exportedCookie = event.locals.pb.authStore.exportToCookie({
		httpOnly: false,
		secure: env.SECURE_COOKIES === 'true',
		sameSite: 'Lax',
		maxAge: 60 * 60 * 24 * 7 // 1 week
	});
	response.headers.append('set-cookie', exportedCookie);

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
