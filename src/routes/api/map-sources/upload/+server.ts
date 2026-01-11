import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { UploadedSourceConfig } from '$lib/types/map-sources';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

export const POST: RequestHandler = async ({ request, locals: { pb, user } }) => {
	if (!user) {
		throw error(401, 'Authentication required');
	}

	try {
		const formData = await request.formData();
		const name = formData.get('name') as string;
		const tileFormat = formData.get('tile_format') as 'png' | 'jpg' | 'webp';
		const file = formData.get('file') as File;

		if (!name || !tileFormat || !file) {
			throw error(400, 'Missing required fields: name, tile_format, file');
		}

		if (!file.name.endsWith('.zip')) {
			throw error(400, 'File must be a ZIP archive');
		}

		// Create source record with pending status
		const config: UploadedSourceConfig = {
			tile_format: tileFormat
		};

		const source = await pb.collection('map_sources').create({
			owner_id: user.id,
			name: name.trim(),
			source_type: 'uploaded',
			config,
			status: 'pending',
			progress: 0
		});

		// Save uploaded file to temp location
		const uploadsDir = path.join(process.cwd(), 'static', 'uploads');
		await mkdir(uploadsDir, { recursive: true });

		const zipPath = path.join(uploadsDir, `${source.id}.zip`);
		const buffer = Buffer.from(await file.arrayBuffer());
		await writeFile(zipPath, buffer);

		// Start processing in background
		// Import dynamically to avoid circular dependencies
		const { processTileUpload } = await import('$lib/server/tile-processor');
		processTileUpload(source.id, zipPath, pb).catch((err) => {
			console.error('Tile processing error:', err);
		});

		return json({ id: source.id, status: 'pending' });
	} catch (err) {
		console.error('Upload error:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Upload failed');
	}
};
