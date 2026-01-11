import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user;

	// If not logged in, redirect to login page
	if (!user) {
		redirect(303, '/login');
	}

	// Redirect to projects page
	redirect(303, '/projects');
};
