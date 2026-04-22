import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CHUNK_SIZE, readSidecar, readStatus } from '$lib/server/chunked-upload';

export const GET: RequestHandler = async ({ params, locals: { user } }) => {
	if (!user || user.collectionName !== 'users') {
		throw error(401, 'Authentication required');
	}

	const { importId } = params;
	const status = await readStatus(importId);
	if (!status) throw error(404, 'Import not found');
	if (status.owner_id && status.owner_id !== user.id) throw error(403, 'Forbidden');

	const received = await readSidecar(importId);
	return json({
		status: status.status,
		received: Array.from(received).sort((a, b) => a - b),
		total_chunks: status.total_chunks ?? 0,
		chunk_size: status.chunk_size ?? CHUNK_SIZE
	});
};
