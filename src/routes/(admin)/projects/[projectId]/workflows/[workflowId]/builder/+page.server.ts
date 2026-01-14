import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

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

		// Load workflow builder data - these collections may not exist yet
		const [stages, connections, forms, formFields, editTools, roles] = await Promise.all([
			safeGetFullList(pb, 'workflow_stages', {
				filter: `workflow_id = "${workflowId}"`,
				sort: 'stage_order'
			}),
			safeGetFullList(pb, 'workflow_connections', {
				filter: `workflow_id = "${workflowId}"`
			}),
			safeGetFullList(pb, 'tools_forms', {
				filter: `workflow_id = "${workflowId}"`
			}),
			safeGetFullList(pb, 'tools_form_fields', {
				sort: 'field_order'
			}),
			safeGetFullList(pb, 'tools_edit', {}),
			safeGetFullList(pb, 'roles', {
				filter: `project_id = "${projectId}"`,
				sort: 'name'
			})
		]);

		// Filter form fields to only those belonging to this workflow's forms
		const formIds = forms.map((f: any) => f.id);
		const workflowFormFields = formFields.filter((f: any) => formIds.includes(f.form_id));

		// Filter edit tools to only those belonging to this workflow's connections or stages
		const connectionIds = connections.map((c: any) => c.id);
		const stageIds = stages.map((s: any) => s.id);
		const workflowEditTools = editTools.filter(
			(e: any) => connectionIds.includes(e.connection_id) || stageIds.includes(e.stage_id)
		);

		return {
			workflow,
			stages,
			connections,
			forms,
			formFields: workflowFormFields,
			editTools: workflowEditTools,
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

export const actions: Actions = {
	createRole: async ({ request, params, locals: { pb } }) => {
		const { projectId } = params;
		const formData = await request.formData();
		const name = formData.get('name') as string;

		if (!name) {
			return fail(400, { message: 'Role name is required' });
		}

		try {
			const newRole = await pb.collection('roles').create({
				project_id: projectId,
				name: name,
				description: ''
			});

			return { success: true, entity: newRole };
		} catch (err) {
			console.error('Error creating role:', err);
			return fail(500, { message: 'Failed to create role' });
		}
	},

	saveWorkflow: async ({ request, locals: { pb } }) => {
		const formData = await request.formData();
		const changesJson = formData.get('changes') as string;

		if (!changesJson) {
			return fail(400, { message: 'No changes provided' });
		}

		let changes: {
			stages: { new: any[]; modified: any[]; deleted: string[] };
			connections: { new: any[]; modified: any[]; deleted: string[] };
			forms: { new: any[]; modified: any[]; deleted: string[] };
			formFields: { new: any[]; modified: any[]; deleted: string[] };
			editTools: { new: any[]; modified: any[]; deleted: string[] };
		};

		try {
			changes = JSON.parse(changesJson);
		} catch {
			return fail(400, { message: 'Invalid changes format' });
		}

		try {
			const batch = pb.createBatch();

			// 1. Stages
			for (const stage of changes.stages.new) {
				batch.collection('workflow_stages').create(stage);
			}
			for (const stage of changes.stages.modified) {
				batch.collection('workflow_stages').update(stage.id, stage);
			}
			for (const stageId of changes.stages.deleted) {
				batch.collection('workflow_stages').delete(stageId);
			}

			// 2. Connections
			for (const conn of changes.connections.new) {
				batch.collection('workflow_connections').create(conn);
			}
			for (const conn of changes.connections.modified) {
				batch.collection('workflow_connections').update(conn.id, conn);
			}
			for (const connId of changes.connections.deleted) {
				batch.collection('workflow_connections').delete(connId);
			}

			// 3. Forms
			for (const form of changes.forms.new) {
				batch.collection('tools_forms').create(form);
			}
			for (const form of changes.forms.modified) {
				batch.collection('tools_forms').update(form.id, form);
			}
			for (const formId of changes.forms.deleted) {
				batch.collection('tools_forms').delete(formId);
			}

			// 4. Form Fields
			for (const field of changes.formFields.new) {
				batch.collection('tools_form_fields').create(field);
			}
			for (const field of changes.formFields.modified) {
				batch.collection('tools_form_fields').update(field.id, field);
			}
			for (const fieldId of changes.formFields.deleted) {
				batch.collection('tools_form_fields').delete(fieldId);
			}

			// 5. Edit Tools
			for (const tool of changes.editTools.new) {
				batch.collection('tools_edit').create(tool);
			}
			for (const tool of changes.editTools.modified) {
				batch.collection('tools_edit').update(tool.id, tool);
			}
			for (const toolId of changes.editTools.deleted) {
				batch.collection('tools_edit').delete(toolId);
			}

			// Execute batch
			await batch.send();

			return { success: true };
		} catch (err) {
			console.error('Failed to save workflow:', err);
			return fail(500, { message: 'Failed to save workflow' });
		}
	}
};
