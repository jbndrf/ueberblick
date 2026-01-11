import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const projects = await locals.pb.collection('projects').getFullList({
			sort: '-created' // Sort by newest first once created field is added
		});

		return { projects };
	} catch (error) {
		console.error('Error fetching projects:', error);
		return { projects: [] };
	}
};
