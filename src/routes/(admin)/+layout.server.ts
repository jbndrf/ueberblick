import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const user = locals.user;

	if (url.pathname === '/login') {
		return { user, currentProject: null };
	}

	if (!user) {
		const redirectTo = url.pathname + url.search;
		redirect(303, `/login?redirectTo=${encodeURIComponent(redirectTo)}`);
	}

	if (locals.pb.authStore.record?.collectionName !== 'users') {
		redirect(303, '/login');
	}

	// Fetch only the current project's name when inside a project URL.
	// The /projects page loads its own full list; other admin pages don't
	// render the project list at all, so there's nothing else to fetch here.
	const projectIdMatch = url.pathname.match(/^\/projects\/([^/]+)/);
	let currentProject: { id: string; name: string } | null = null;
	if (projectIdMatch) {
		try {
			const record = await locals.pb
				.collection('projects')
				.getOne(projectIdMatch[1], {
					fields: 'id,name',
					requestKey: null
				});
			currentProject = { id: record.id, name: record.name };
		} catch (err) {
			console.error('Error fetching current project:', err);
		}
	}

	return { user, currentProject };
};
