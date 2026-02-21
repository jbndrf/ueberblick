import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { UploadedSourceConfig } from '$lib/types/map-layer';
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
		const projectId = formData.get('project_id') as string;
		const layerType = (formData.get('layer_type') as string) || 'overlay';

		if (!name || !tileFormat || !file || !projectId) {
			throw error(400, 'Missing required fields: name, tile_format, file, project_id');
		}

		if (!file.name.endsWith('.zip')) {
			throw error(400, 'File must be a ZIP archive');
		}

		// Create layer record with pending status
		const config: UploadedSourceConfig = {
			tile_format: tileFormat
		};

		const layer = await pb.collection('map_layers').create({
			project_id: projectId,
			name: name.trim(),
			source_type: 'uploaded',
			layer_type: layerType,
			config,
			status: 'pending',
			progress: 0,
			is_active: true
		});

		// Save uploaded file to temp location
		const uploadsDir = path.join(process.cwd(), 'static', 'uploads');
		await mkdir(uploadsDir, { recursive: true });

		const zipPath = path.join(uploadsDir, `${layer.id}.zip`);
		const buffer = Buffer.from(await file.arrayBuffer());
		await writeFile(zipPath, buffer);

		// Start processing in background
		const { processTileUpload } = await import('$lib/server/tile-processor');
		processTileUpload(layer.id, zipPath, pb).catch((err) => {
			console.error('Tile processing error:', err);
		});

		return json({ id: layer.id, status: 'pending' });
	} catch (err) {
		console.error('Upload error:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Upload failed');
	}
};
