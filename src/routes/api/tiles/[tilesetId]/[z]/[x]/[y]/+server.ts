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

// Short-lived cache of (user, layer) -> access decision + format. The PB
// viewRule on map_layers enforces role-based visibility; calling getOne()
// per tile is the bottleneck during map panning. 60s TTL means a revoked
// role is honored within a minute, which is acceptable for tile access.
interface PermEntry {
	expiresAt: number;
	format: string;
	status: string;
	sourceType: string;
}
const permCache = new Map<string, PermEntry>();
const PERM_TTL_MS = 60_000;
const PERM_CACHE_MAX = 10_000;

function getCachedPerm(userId: string, layerId: string): PermEntry | null {
	const entry = permCache.get(`${userId}:${layerId}`);
	if (!entry) return null;
	if (entry.expiresAt <= Date.now()) {
		permCache.delete(`${userId}:${layerId}`);
		return null;
	}
	return entry;
}

function setCachedPerm(userId: string, layerId: string, entry: Omit<PermEntry, 'expiresAt'>): void {
	if (permCache.size >= PERM_CACHE_MAX) {
		// Cheap eviction: drop oldest insertion order entry.
		const firstKey = permCache.keys().next().value;
		if (firstKey) permCache.delete(firstKey);
	}
	permCache.set(`${userId}:${layerId}`, { ...entry, expiresAt: Date.now() + PERM_TTL_MS });
}

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
	if (zNum < 0 || zNum > 24) {
		throw error(400, 'Invalid zoom level');
	}

	try {
		// Resolve the layer's access + format either from our short-lived
		// per-user cache or by hitting PB (which enforces the viewRule). A
		// getOne() failure = access denied or not found, handled below.
		let format: string;
		let status: string;
		let sourceType: string;
		const cached = getCachedPerm(locals.user.id, tilesetId);
		if (cached) {
			format = cached.format;
			status = cached.status;
			sourceType = cached.sourceType;
		} else {
			const layer = await locals.pb.collection('map_layers').getOne<MapLayer>(tilesetId);
			const layerConfig = layer.config as { tile_format?: string } | null;
			format = layerConfig?.tile_format || 'png';
			status = layer.status;
			sourceType = layer.source_type;
			setCachedPerm(locals.user.id, tilesetId, { format, status, sourceType });
		}

		// Verify layer is completed (for uploaded layers)
		if (sourceType === 'uploaded' && status !== 'completed') {
			throw error(404, 'Layer not available');
		}

		// URL extension overrides cached format if the client requested a
		// specific encoding.
		if (yParts.length > 1) {
			const ext = yParts[1].toLowerCase();
			if (CONTENT_TYPES[ext]) {
				format = ext === 'jpeg' ? 'jpg' : ext;
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
