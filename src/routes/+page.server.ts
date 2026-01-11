import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		// Authenticated users go to the dashboard
		redirect(303, '/projects');
	} else {
		// Unauthenticated users go to login
		redirect(303, '/login');
	}
};
