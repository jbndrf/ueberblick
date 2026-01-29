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

	// Get all collection names and file field info using admin auth (for offline sync)
	let collectionNames: string[] = [];
	let fileFields: Record<string, string[]> = {};
	if (isParticipantAuth) {
		try {
			const adminPb = await getAdminPb();
			const collections = await adminPb.collections.getFullList();
			// Filter out system collections (start with _)
			const nonSystem = collections.filter((c) => !c.name.startsWith('_'));
			collectionNames = nonSystem.map((c) => c.name);

			// Extract which collections have file fields (auto-detected from schema)
			for (const c of nonSystem) {
				const fileFieldNames = (c.fields as Array<{ type: string; name: string }>)
					.filter((f) => f.type === 'file')
					.map((f) => f.name);
				if (fileFieldNames.length > 0) {
					fileFields[c.name] = fileFieldNames;
				}
			}
		} catch (e) {
			console.error('Failed to get collection names:', e);
		}
	}

	return {
		participant,
		collectionNames,
		fileFields
	};
};
