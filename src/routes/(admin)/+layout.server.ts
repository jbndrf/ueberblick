import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const user = locals.user;

	// Allow access to login page without authentication
	if (url.pathname === '/login') {
		return { user, projects: [] };
	}

	// Redirect to login if not authenticated
	if (!user) {
		const redirectTo = url.pathname + url.search;
		redirect(303, `/login?redirectTo=${encodeURIComponent(redirectTo)}`);
	}

	// Fetch user's projects for sidebar
	let projects: Array<{ id: string; name: string }> = [];
	try {
		const data = await locals.pb.collection('projects').getFullList({
			fields: 'id,name',
			sort: 'name',
			requestKey: null // Disable auto-cancellation for layout data
		});

		projects = data;
	} catch (err) {
		console.error('Error fetching projects:', err);
	}

	return { user, projects };
};
