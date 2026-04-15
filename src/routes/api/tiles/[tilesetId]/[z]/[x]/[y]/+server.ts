import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { existsSync, createReadStream } from 'fs';
import { stat } from 'fs/promises';
import path from 'path';
import type { MapLayer } from '$lib/types/map-layer';

// Content type mapping for tile formats
const CONTENT_TYPES: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	webp: 'image/webp'
};

export const GET: RequestHandler = async ({ params, locals }) => {
	const { tilesetId, z, x, y } = params;

	// Check authentication
	if (!locals.pb.authStore.isValid || !locals.user) {
		throw error(401, 'Authentication required');
	}

	// Validate tile coordinates are numbers
	const zNum = parseInt(z, 10);
	const xNum = parseInt(x, 10);
	// y might include file extension like "1234.png"
	const yParts = y.split('.');
	const yNum = parseInt(yParts[0], 10);

	if (isNaN(zNum) || isNaN(xNum) || isNaN(yNum)) {
		throw error(400, 'Invalid tile coordinates');
	}

	// Validate zoom level
	if (zNum < 0 || zNum > 22) {
		throw error(400, 'Invalid zoom level');
	}

	try {
		// Fetch layer record to verify access and get format
		const layer = await locals.pb.collection('map_layers').getOne<MapLayer>(tilesetId);

		// Verify layer is completed (for uploaded layers)
		if (layer.source_type === 'uploaded' && layer.status !== 'completed') {
			throw error(404, 'Layer not available');
		}

		// Get tile format (use extension from URL if provided, otherwise from layer config)
		const layerConfig = layer.config as { tile_format?: string } | null;
		let format = layerConfig?.tile_format || 'png';
		if (yParts.length > 1) {
			const ext = yParts[1].toLowerCase();
			if (CONTENT_TYPES[ext]) {
				format = ext === 'jpeg' ? 'jpg' : (ext as 'png' | 'jpg' | 'webp');
			}
		}

		// Build file path
		const tilePath = path.join(
			process.cwd(),
			'data',
			'tiles',
			tilesetId,
			String(zNum),
			String(xNum),
			`${yNum}.${format}`
		);

		// Security: Ensure path is within expected directory
		const tilesDir = path.join(process.cwd(), 'data', 'tiles');
		const resolvedPath = path.resolve(tilePath);
		if (!resolvedPath.startsWith(tilesDir)) {
			throw error(400, 'Invalid tile path');
		}

		// Check if tile exists
		if (!existsSync(tilePath)) {
			throw error(404, 'Tile not found');
		}

		// Get file stats for content-length
		const stats = await stat(tilePath);

		// Create readable stream
		const stream = createReadStream(tilePath);
		const webStream = new ReadableStream({
			start(controller) {
				stream.on('data', (chunk) => controller.enqueue(chunk));
				stream.on('end', () => controller.close());
				stream.on('error', (err) => controller.error(err));
			}
		});

		// Return tile with appropriate headers
		return new Response(webStream, {
			headers: {
				'Content-Type': CONTENT_TYPES[format] || 'application/octet-stream',
				'Content-Length': String(stats.size),
				'Cache-Control': 'public, max-age=31536000, immutable'
			}
		});
	} catch (err) {
		// If PocketBase error (not found or unauthorized)
		if (err && typeof err === 'object' && 'status' in err) {
			const pbError = err as { status: number; message?: string };
			if (pbError.status === 404) {
				throw error(404, 'Tileset not found');
			}
			if (pbError.status === 403) {
				throw error(403, 'Access denied');
			}
		}
		throw err;
	}
};
