import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const isParticipantAuth =
		locals.pb.authStore.isValid &&
		locals.pb.authStore.record?.collectionName === 'participants';

	// If not logged in as participant and not on login page, redirect to login
	if (!isParticipantAuth && url.pathname !== '/participant/login') {
		redirect(303, '/participant/login');
	}

	// Return participant data from PocketBase auth
	const participant = isParticipantAuth ? locals.pb.authStore.record : null;

	return {
		participant
	};
};
