import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readSidecar, readStatus, writeStatus } from '$lib/server/chunked-upload';
import { processProjectImport } from '$lib/server/project-import-processor';

export const POST: RequestHandler = async ({ params, locals: { pb, user } }) => {
	if (!user || user.collectionName !== 'users') {
		throw error(401, 'Authentication required');
	}

	const { importId } = params;
	const status = await readStatus(importId);
	if (!status) throw error(404, 'Import not found');
	if (status.owner_id && status.owner_id !== user.id) throw error(403, 'Forbidden');
	if (status.status !== 'uploading') {
		throw error(409, `Import is not in uploading state (status: ${status.status})`);
	}

	const totalChunks = status.total_chunks ?? 0;
	const received = await readSidecar(importId);
	const missing: number[] = [];
	for (let i = 0; i < totalChunks; i++) {
		if (!received.has(i)) missing.push(i);
	}
	if (missing.length > 0) {
		return json({ ok: false, missing }, { status: 400 });
	}

	await writeStatus(importId, { status: 'pending', progress: 0, label: 'Queued' });

	processProjectImport(importId, pb, user.id, status.nameOverride).catch((err) => {
		console.error('Project import processing error:', err);
	});

	return json({ ok: true, importId });
};
