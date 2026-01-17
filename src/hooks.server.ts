import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { paraglideMiddleware } from '$lib/paraglide/server';
import PocketBase from 'pocketbase';
import { POCKETBASE_URL } from '$lib/config/pocketbase';

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;

		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
		});
	});

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
		secure: false,
		sameSite: 'Lax',
		maxAge: 60 * 60 * 24 * 7 // 1 week
	});
	response.headers.append('set-cookie', exportedCookie);

	return response;
};

export const handle: Handle = sequence(handleAuth, handleParaglide);
