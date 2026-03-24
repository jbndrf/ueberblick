import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createDeleteAction } from '$lib/server/crud-actions';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { projectId } = params;
	const pb = locals.pb;

	const infoPages = await pb.collection('info_pages').getFullList({
		filter: `project_id = "${projectId}"`,
		sort: 'sort_order,created'
	});

	return { infoPages };
};

export const actions: Actions = {
	create: async ({ request, params, locals }) => {
		const { projectId } = params;
		const pb = locals.pb;
		const formData = await request.formData();

		const title = formData.get('title') as string;
		const content = formData.get('content') as string;
		const sort_order = parseInt(formData.get('sort_order') as string) || 0;

		if (!title?.trim()) {
			return fail(400, { message: 'Title is required' });
		}
		if (!content?.trim()) {
			return fail(400, { message: 'Content is required' });
		}

		try {
			await pb.collection('info_pages').create({
				project_id: projectId,
				title: title.trim(),
				content: content.trim(),
				sort_order
			});
		} catch (error) {
			console.error('Failed to create info page:', error);
			return fail(500, { message: 'Failed to create info page' });
		}

		return { success: true };
	},

	update: async ({ request, params, locals }) => {
		const { projectId } = params;
		const pb = locals.pb;
		const formData = await request.formData();

		const id = formData.get('id') as string;
		const title = formData.get('title') as string;
		const content = formData.get('content') as string;
		const sort_order = parseInt(formData.get('sort_order') as string) || 0;

		if (!id) return fail(400, { message: 'ID is required' });
		if (!title?.trim()) return fail(400, { message: 'Title is required' });
		if (!content?.trim()) return fail(400, { message: 'Content is required' });

		try {
			const record = await pb.collection('info_pages').getOne(id);
			if (record.project_id !== projectId) {
				return fail(403, { message: 'Unauthorized' });
			}

			await pb.collection('info_pages').update(id, {
				title: title.trim(),
				content: content.trim(),
				sort_order
			});
		} catch (error) {
			console.error('Failed to update info page:', error);
			return fail(500, { message: 'Failed to update info page' });
		}

		return { success: true };
	},

	delete: async ({ request, params, locals }) => {
		const { projectId } = params;
		const pb = locals.pb;
		return createDeleteAction(pb, projectId, {
			tableName: 'info_pages'
		})(request);
	}
};
