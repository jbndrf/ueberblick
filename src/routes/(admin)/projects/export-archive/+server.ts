import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exportProjectArchive } from '$lib/server/project-archive';

export const POST: RequestHandler = async ({ request, locals: { pb, user } }) => {
	if (!user || user.collectionName !== 'users') throw error(401, 'Unauthorized');

	const { projectId, includeParticipants, includeParticipantTokens, csvOnly } =
		await request.json();
	if (!projectId) throw error(400, 'Project ID is required');

	const project = await pb.collection('projects').getOne(projectId);
	if (project.owner_id !== user.id) throw error(403, 'Forbidden');

	try {
		const { filename, bytes } = await exportProjectArchive(pb, projectId, {
			includeParticipants,
			includeParticipantTokens,
			csvOnly
		});
		return new Response(bytes as BodyInit, {
			headers: {
				'Content-Type': 'application/zip',
				'Content-Disposition': `attachment; filename="${filename}"`,
				'Content-Length': String(bytes.byteLength)
			}
		});
	} catch (err) {
		console.error('Error exporting project archive:', err);
		throw error(500, 'Failed to export project archive');
	}
};
