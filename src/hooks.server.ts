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

	// Refresh auth if valid
	try {
		if (event.locals.pb.authStore.isValid) {
			// Determine which collection to refresh based on the stored model
			const collectionName = event.locals.pb.authStore.record?.collectionName;

			if (collectionName === 'participants') {
				await event.locals.pb.collection('participants').authRefresh();
			} else if (collectionName === 'users') {
				await event.locals.pb.collection('users').authRefresh();
			}
		}
	} catch (err) {
		// Clear auth store on failed refresh
		event.locals.pb.authStore.clear();
	}

	// Set user/participant in locals for easy access
	event.locals.user = event.locals.pb.authStore.record;

	const response = await resolve(event);

	// Send back the auth cookie to the client
	const exportedCookie = event.locals.pb.authStore.exportToCookie({
		httpOnly: false,
		secure: false,
		sameSite: 'Lax'
	});
	response.headers.append('set-cookie', exportedCookie);

	return response;
};

export const handle: Handle = sequence(handleAuth, handleParaglide);
