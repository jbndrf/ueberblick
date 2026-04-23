import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { UploadedSourceConfig } from '$lib/types/map-layer';
import { writeFile } from 'fs/promises';
import {
	CHUNK_SIZE,
	ensureUploadsDir,
	getZipPath,
	writeSidecar
} from '$lib/server/chunked-upload';

interface InitBody {
	name: string;
	tile_format: 'png' | 'jpg' | 'webp';
	project_id: string;
	layer_type?: 'base' | 'overlay';
	total_size: number;
	total_chunks: number;
}

const MAX_UPLOAD_ZIP_SIZE = 500 * 1024 * 1024;

export const POST: RequestHandler = async ({ request, locals: { pb, user } }) => {
	if (!user) {
		throw error(401, 'Authentication required');
	}

	const body = (await request.json()) as Partial<InitBody>;
	const { name, tile_format, project_id, total_size, total_chunks } = body;
	const layer_type = body.layer_type ?? 'overlay';

	if (
		!name ||
		!tile_format ||
		!project_id ||
		typeof total_size !== 'number' ||
		typeof total_chunks !== 'number' ||
		total_size <= 0 ||
		total_chunks <= 0
	) {
		throw error(400, 'Missing or invalid fields: name, tile_format, project_id, total_size, total_chunks');
	}

	if (total_size > MAX_UPLOAD_ZIP_SIZE) {
		throw error(413, `Upload size ${total_size} exceeds limit ${MAX_UPLOAD_ZIP_SIZE}`);
	}

	await pb.collection('projects').getOne(project_id);

	const config: UploadedSourceConfig & { total_size: number; total_chunks: number; chunk_size: number } = {
		tile_format,
		total_size,
		total_chunks,
		chunk_size: CHUNK_SIZE
	};

	const layer = await pb.collection('map_layers').create({
		project_id,
		name: name.trim(),
		source_type: 'uploaded',
		layer_type,
		config,
		status: 'uploading',
		progress: 0,
		is_active: true
	});

	await ensureUploadsDir();
	await writeFile(getZipPath(layer.id), Buffer.alloc(0));
	await writeSidecar(layer.id, new Set());

	return json({ layerId: layer.id, chunk_size: CHUNK_SIZE });
};
