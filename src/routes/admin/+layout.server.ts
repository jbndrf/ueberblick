import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { isInstanceOwner } from '$lib/server/is-owner';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const user = locals.user;
	const isOwner = isInstanceOwner(user);

	if (url.pathname === '/admin/login') {
		return { user, currentProject: null, isOwner };
	}

	if (!user) {
		const redirectTo = url.pathname + url.search;
		redirect(303, `/admin/login?redirectTo=${encodeURIComponent(redirectTo)}`);
	}

	const projectIdMatch = url.pathname.match(/^\/admin\/projects\/([^/]+)/);
	let currentProject: { id: string; name: string } | null = null;
	if (projectIdMatch) {
		try {
			const record = await locals.pbAdmin
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

	return { user, currentProject, isOwner };
};
