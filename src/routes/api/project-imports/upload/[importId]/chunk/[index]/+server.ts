import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { open } from 'fs/promises';
import {
	CHUNK_SIZE,
	getZipPath,
	readSidecar,
	readStatus,
	writeSidecar
} from '$lib/server/chunked-upload';

export const PUT: RequestHandler = async ({ params, request, locals: { user } }) => {
	if (!user || user.collectionName !== 'users') {
		throw error(401, 'Authentication required');
	}

	const { importId } = params;
	const index = Number(params.index);
	if (!Number.isInteger(index) || index < 0) {
		throw error(400, 'Invalid chunk index');
	}

	const status = await readStatus(importId);
	if (!status) throw error(404, 'Import not found');
	if (status.owner_id && status.owner_id !== user.id) throw error(403, 'Forbidden');
	if (status.status !== 'uploading') {
		throw error(409, `Import is not accepting uploads (status: ${status.status})`);
	}

	const totalChunks = status.total_chunks ?? 0;
	const chunkSize = status.chunk_size ?? CHUNK_SIZE;
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
	const fd = await open(getZipPath(importId), 'r+');
	try {
		await fd.write(buffer, 0, buffer.length, offset);
	} finally {
		await fd.close();
	}

	const received = await readSidecar(importId);
	received.add(index);
	await writeSidecar(importId, received);

	return json({ received: received.size, total: totalChunks });
};
