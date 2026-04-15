import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { open } from 'fs/promises';
import {
	CHUNK_SIZE,
	getZipPath,
	readSidecar,
	writeSidecar
} from '$lib/server/chunked-upload';

export const PUT: RequestHandler = async ({ params, request, locals: { pb, user } }) => {
	if (!user) {
		throw error(401, 'Authentication required');
	}

	const { layerId } = params;
	const index = Number(params.index);
	if (!Number.isInteger(index) || index < 0) {
		throw error(400, 'Invalid chunk index');
	}

	const layer = await pb.collection('map_layers').getOne(layerId).catch(() => null);
	if (!layer) {
		throw error(404, 'Layer not found');
	}
	if (layer.status !== 'uploading') {
		throw error(409, `Layer is not accepting uploads (status: ${layer.status})`);
	}

	const cfg = (layer.config as { total_chunks?: number; chunk_size?: number; total_size?: number }) || {};
	const totalChunks = cfg.total_chunks ?? 0;
	const chunkSize = cfg.chunk_size ?? CHUNK_SIZE;
	if (index >= totalChunks) {
		throw error(400, `Chunk index ${index} out of range (total ${totalChunks})`);
	}

	const buffer = Buffer.from(await request.arrayBuffer());
	if (buffer.length === 0) {
		throw error(400, 'Empty chunk');
	}
	const isLast = index === totalChunks - 1;
	if (!isLast && buffer.length !== chunkSize) {
		throw error(400, `Chunk ${index} has wrong size ${buffer.length}, expected ${chunkSize}`);
	}
	if (isLast && buffer.length > chunkSize) {
		throw error(400, `Final chunk ${index} oversized (${buffer.length} > ${chunkSize})`);
	}

	const offset = index * chunkSize;
	const fd = await open(getZipPath(layerId), 'r+');
	try {
		await fd.write(buffer, 0, buffer.length, offset);
	} finally {
		await fd.close();
	}

	const received = await readSidecar(layerId);
	received.add(index);
	await writeSidecar(layerId, received);

	return json({ received: received.size, total: totalChunks });
};
