import { redirect } from '@sveltejs/kit';
import { getAdminPb } from '$lib/server/admin-auth';
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

	// Get all collection names using admin auth (for offline sync)
	let collectionNames: string[] = [];
	if (isParticipantAuth) {
		try {
			const adminPb = await getAdminPb();
			const collections = await adminPb.collections.getFullList();
			// Filter out system collections (start with _)
			collectionNames = collections
				.filter((c) => !c.name.startsWith('_'))
				.map((c) => c.name);
		} catch (e) {
			console.error('Failed to get collection names:', e);
		}
	}

	return {
		participant,
		collectionNames
	};
};
