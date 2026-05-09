import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.participant) {
		redirect(303, '/map');
	}
	redirect(303, '/login');
};
