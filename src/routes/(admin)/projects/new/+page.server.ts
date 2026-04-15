import { fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import * as m from '$lib/paraglide/messages';

const projectSchema = z.object({
	name: z.string().min(1, m.projectNewServerNameRequired?.() ?? 'Name is required').max(255),
	description: z.string().max(1000).optional()
});

export const load: PageServerLoad = async () => {
	const form = await superValidate(zod(projectSchema));
	return { form };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await superValidate(request, zod(projectSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		// Ensure user is authenticated
		if (!locals.user || !locals.user.id) {
			return fail(401, {
				form,
				message: m.projectNewServerNotAuthenticated?.() ?? 'You must be logged in to create a project'
			});
		}

		let projectId: string;
		try {
			console.log('Creating project with owner_id:', locals.user.id);

			const project = await locals.pb.collection('projects').create({
				name: form.data.name,
				description: form.data.description || '',
				owner_id: locals.user.id,
				is_active: true
			});
			projectId = project.id;
		} catch (error) {
			console.error('Error creating project:', error);
			console.error('Error details:', JSON.stringify(error, null, 2));
			return fail(500, {
				form,
				message: error?.message || (m.projectNewServerCreateError?.() ?? 'Failed to create project')
			});
		}

		throw redirect(303, `/projects/${projectId}/participants`);
	}
};
