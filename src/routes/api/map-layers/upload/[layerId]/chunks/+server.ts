import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CHUNK_SIZE, readSidecar } from '$lib/server/chunked-upload';

export const GET: RequestHandler = async ({ params, locals: { pb, user } }) => {
	if (!user) {
		throw error(401, 'Authentication required');
	}

	const { layerId } = params;
	const layer = await pb.collection('map_layers').getOne(layerId).catch(() => null);
	if (!layer) {
		throw error(404, 'Layer not found');
	}

	const cfg = (layer.config as { total_chunks?: number; chunk_size?: number }) || {};
	const received = await readSidecar(layerId);

	return json({
		status: layer.status,
		received: Array.from(received).sort((a, b) => a - b),
		total_chunks: cfg.total_chunks ?? 0,
		chunk_size: cfg.chunk_size ?? CHUNK_SIZE
	});
};
