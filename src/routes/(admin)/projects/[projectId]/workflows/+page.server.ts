import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { z } from 'zod';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import {
	createUpdateFieldAction,
	createDeleteAction
} from '$lib/server/crud-actions';
import { normalizeRecords } from '$lib/server/pocketbase-helpers';

const workflowSchema = z.object({
	name: z.string().min(1, 'Name is required'),
	description: z.string().optional().or(z.literal('')),
	workflow_type: z.enum(['incident', 'survey']),
	is_active: z.boolean().default(true)
});

export const load: PageServerLoad = async ({ params, locals: { pb } }) => {
	const { projectId } = params;

	try {
		// Fetch workflows for this project
		const workflowsRaw = await pb.collection('workflows').getFullList({
			filter: `project_id = "${projectId}"`,
			sort: '-created'
		});

		// Normalize workflows to parse JSON array fields from TEXT columns
		const workflows = normalizeRecords(workflowsRaw, 'workflows');

		const form = await superValidate(zod(workflowSchema));

		return {
			workflows: workflows || [],
			form
		};
	} catch (err) {
		console.error('Error fetching workflows:', err);
		throw error(500, 'Failed to load workflows');
	}
};

export const actions: Actions = {
	create: async ({ request, params, locals: { pb } }) => {
		const { projectId } = params;
		const form = await superValidate(request, zod(workflowSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			await pb.collection('workflows').create({
				project_id: projectId,
				name: form.data.name,
				description: form.data.description || null,
				workflow_type: form.data.workflow_type,
				is_active: form.data.is_active,
				marker_color: form.data.workflow_type === 'incident' ? '#ff0000' : null,
				icon_config: {}
			});

			return { form, success: true };
		} catch (err) {
			console.error('Error creating workflow:', err);
			return fail(500, {
				form,
				message: 'Failed to create workflow'
			});
		}
	},

	update: async ({ request, params, locals: { pb } }) => {
		const formData = await request.formData();
		const workflowId = formData.get('id') as string;

		const form = await superValidate(formData, zod(workflowSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			await pb.collection('workflows').update(workflowId, {
				name: form.data.name,
				description: form.data.description || null,
				workflow_type: form.data.workflow_type,
				is_active: form.data.is_active,
				updated_at: new Date().toISOString()
			});

			return { form, success: true };
		} catch (err) {
			console.error('Error updating workflow:', err);
			return fail(500, {
				form,
				message: 'Failed to update workflow'
			});
		}
	},

	delete: async ({ request, params, locals: { pb } }) => {
		return await createDeleteAction(pb, params.projectId, {
			tableName: 'workflows'
		})(request);
	},

	updateField: async ({ request, params, locals: { pb } }) => {
		return await createUpdateFieldAction(pb, params.projectId, {
			tableName: 'workflows',
			allowedFields: ['name', 'description', 'workflow_type'],
			validators: {
				name: (value) => ({
					valid: value.trim().length >= 1,
					error: 'Name is required'
				}),
				workflow_type: (value) => ({
					valid: ['incident', 'survey'].includes(value),
					error: 'Invalid workflow type'
				})
			}
		})(request);
	},

	toggleStatus: async ({ request, params, locals: { pb } }) => {
		const formData = await request.formData();
		const workflowId = formData.get('id') as string;
		const isActive = formData.get('is_active') === 'true';

		if (!workflowId) {
			return fail(400, { message: 'Workflow ID is required' });
		}

		try {
			await pb.collection('workflows').update(workflowId, {
				is_active: isActive,
				updated_at: new Date().toISOString()
			});

			return { success: true };
		} catch (err) {
			console.error('Error toggling workflow status:', err);
			return fail(500, { message: 'Failed to update status' });
		}
	}
};
