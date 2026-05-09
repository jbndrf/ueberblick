import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const logout: RequestHandler = async ({ locals }) => {
	// Clear PocketBase auth
	locals.pbParticipant.authStore.clear();

	// Redirect to login page
	redirect(303, '/login');
};

export const GET = logout;
export const POST = logout;
