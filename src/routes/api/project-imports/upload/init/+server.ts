import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { writeFile } from 'fs/promises';
import {
	CHUNK_SIZE,
	ensureUploadsDir,
	getZipPath,
	writeSidecar,
	writeStatus
} from '$lib/server/chunked-upload';

interface InitBody {
	name?: string;
	filename?: string;
	total_size: number;
	total_chunks: number;
}

export const POST: RequestHandler = async ({ request, locals: { pb, user } }) => {
	if (!user || user.collectionName !== 'users') {
		throw error(401, 'Authentication required');
	}

	const body = (await request.json()) as Partial<InitBody>;
	const { name, filename, total_size, total_chunks } = body;
	if (
		typeof total_size !== 'number' ||
		typeof total_chunks !== 'number' ||
		total_size <= 0 ||
		total_chunks <= 0
	) {
		throw error(400, 'Missing or invalid fields: total_size, total_chunks');
	}

	const importId = crypto.randomUUID();

	await ensureUploadsDir();
	await writeFile(getZipPath(importId), Buffer.alloc(0));
	await writeSidecar(importId, new Set());
	await writeStatus(importId, {
		status: 'uploading',
		progress: 0,
		filename: filename?.slice(0, 255),
		nameOverride: name?.trim() || undefined,
		total_size,
		total_chunks,
		chunk_size: CHUNK_SIZE,
		owner_id: user.id
	});

	// Ignore unused pb binding
	void pb;

	return json({ importId, chunk_size: CHUNK_SIZE });
};
