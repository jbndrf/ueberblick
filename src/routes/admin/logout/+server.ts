import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
	// Clear the PocketBase auth store
	locals.pb.authStore.clear();

	// Redirect to login page
	redirect(303, '/login');
};
