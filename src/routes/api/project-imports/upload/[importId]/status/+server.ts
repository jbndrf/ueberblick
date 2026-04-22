import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readStatus } from '$lib/server/chunked-upload';

export const GET: RequestHandler = async ({ params, locals: { user } }) => {
	if (!user || user.collectionName !== 'users') {
		throw error(401, 'Authentication required');
	}

	const { importId } = params;
	const status = await readStatus(importId);
	if (!status) throw error(404, 'Import not found');
	if (status.owner_id && status.owner_id !== user.id) throw error(403, 'Forbidden');

	return json({
		status: status.status,
		progress: status.progress,
		label: status.label,
		error: status.error,
		projectId: status.projectId,
		counts: status.counts
	});
};
