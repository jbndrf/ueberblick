import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { importProjectSchema } from '$lib/server/schema-transfer';
import type { ProjectSchemaExport } from '$lib/server/schema-transfer';
import * as m from '$lib/paraglide/messages';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const projects = await locals.pb.collection('projects').getFullList({
			sort: '-created'
		});

		return { projects };
	} catch (error) {
		console.error('Error fetching projects:', error);
		return { projects: [] };
	}
};

export const actions: Actions = {
	importSchema: async ({ request, locals: { pb, user } }) => {
		const formData = await request.formData();
		const file = formData.get('file') as File | null;
		const nameOverride = formData.get('name') as string | null;

		if (!file) {
			return fail(400, { message: m.projectsServerNoFileProvided?.() ?? 'No file provided' });
		}

		if (!user) {
			return fail(401, { message: m.projectsServerAuthenticationRequired?.() ?? 'Authentication required' });
		}

		let schema: ProjectSchemaExport;
		try {
			const text = await file.text();
			schema = JSON.parse(text);
		} catch {
			return fail(400, { message: m.projectsServerInvalidJsonFile?.() ?? 'Invalid JSON file' });
		}

		if (!schema.version || !schema.source_project || !schema.roles || !schema.workflows) {
			return fail(400, { message: m.projectsServerInvalidProjectSchemaFile?.() ?? 'Invalid project schema file' });
		}

		try {
			const newProjectId = await importProjectSchema(
				pb,
				schema,
				user.id,
				nameOverride || undefined
			);
			return { success: true, projectId: newProjectId };
		} catch (err) {
			console.error('Error importing project schema:', err);
			return fail(500, { message: m.projectsServerFailedToImportProjectSchema?.() ?? 'Failed to import project schema' });
		}
	}
};
