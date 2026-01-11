import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
	// Clear PocketBase auth
	locals.pb.authStore.clear();

	// Redirect to login page
	redirect(303, '/participant/login');
};
