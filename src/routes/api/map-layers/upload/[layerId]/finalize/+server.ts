import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getZipPath, readSidecar, removeSidecar } from '$lib/server/chunked-upload';

export const POST: RequestHandler = async ({ params, locals: { pb, user } }) => {
	if (!user) {
		throw error(401, 'Authentication required');
	}

	const { layerId } = params;
	const layer = await pb.collection('map_layers').getOne(layerId).catch(() => null);
	if (!layer) {
		throw error(404, 'Layer not found');
	}
	if (layer.status !== 'uploading') {
		throw error(409, `Layer is not in uploading state (status: ${layer.status})`);
	}

	const cfg = (layer.config as { total_chunks?: number }) || {};
	const totalChunks = cfg.total_chunks ?? 0;
	const received = await readSidecar(layerId);
	const missing: number[] = [];
	for (let i = 0; i < totalChunks; i++) {
		if (!received.has(i)) missing.push(i);
	}
	if (missing.length > 0) {
		return json({ ok: false, missing }, { status: 400 });
	}

	await removeSidecar(layerId);
	await pb.collection('map_layers').update(layerId, {
		status: 'pending',
		progress: 0
	});

	const zipPath = getZipPath(layerId);
	const { processTileUpload } = await import('$lib/server/tile-processor');
	processTileUpload(layerId, zipPath, pb).catch((err) => {
		console.error('Tile processing error:', err);
	});

	return json({ ok: true, layerId });
};
