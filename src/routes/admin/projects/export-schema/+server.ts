import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exportProjectSchema } from '$lib/server/schema-transfer';

export const POST: RequestHandler = async ({ request, locals: { pb, user } }) => {
	if (!user || user.collectionName !== 'users') {
		throw error(401, 'Unauthorized');
	}

	const { projectId } = await request.json();

	if (!projectId) {
		throw error(400, 'Project ID is required');
	}

	await pb.collection('projects').getOne(projectId);

	try {
		const schema = await exportProjectSchema(pb, projectId);
		return json(schema);
	} catch (err) {
		console.error('Error exporting project schema:', err);
		throw error(500, 'Failed to export project schema');
	}
};
