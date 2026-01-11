import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Helper to safely fetch from a collection (returns empty array if collection doesn't exist)
async function safeGetFullList(pb: any, collection: string, options: any) {
	try {
		return await pb.collection(collection).getFullList(options);
	} catch (err: any) {
		// Collection doesn't exist yet - return empty array
		if (err?.status === 404 || err?.message?.includes('Missing collection')) {
			return [];
		}
		throw err;
	}
}

export const load: PageServerLoad = async ({ params, locals: { pb } }) => {
	const { projectId, workflowId } = params;

	try {
		// Load the workflow
		const workflow = await pb.collection('workflows').getOne(workflowId);

		// Verify workflow belongs to this project
		if (workflow.project_id !== projectId) {
			throw error(404, 'Workflow not found');
		}

		// Load stages, actions, fields, roles - these collections may not exist yet
		const [stages, actions, formFields, roles] = await Promise.all([
			safeGetFullList(pb, 'workflow_stages', {
				filter: `workflow_id = "${workflowId}"`,
				sort: 'stage_order'
			}),
			safeGetFullList(pb, 'workflow_actions', {
				filter: `workflow_id = "${workflowId}"`,
				sort: 'action_order'
			}),
			safeGetFullList(pb, 'form_fields', {
				filter: `workflow_id = "${workflowId}"`,
				sort: 'field_order'
			}),
			safeGetFullList(pb, 'roles', {
				filter: `project_id = "${projectId}"`,
				sort: 'name'
			})
		]);

		return {
			workflow,
			stages,
			actions,
			formFields,
			roles
		};
	} catch (err: any) {
		if (err?.status === 404) {
			throw error(404, 'Workflow not found');
		}
		console.error('Error loading workflow:', err);
		throw error(500, 'Failed to load workflow');
	}
};
