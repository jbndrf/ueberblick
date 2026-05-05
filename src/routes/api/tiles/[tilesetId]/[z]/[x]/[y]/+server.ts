import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { MapLayer } from '$lib/types/map-layer';
import { getOrFetchTile } from '$lib/server/tile-cache';

/**
 * Built-in fallback tile sources used by the participant map when no base
 * layer is configured. Kept here (not in PocketBase) so the system has a
 * working default with no DB seeding required.
 */
const BUILT_IN_FALLBACKS: Record<string, { url: string; subdomains?: string[] }> = {
	'default-osm': {
		url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
		subdomains: ['a', 'b', 'c']
	}
};

const CONTENT_TYPES: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	webp: 'image/webp'
};

// Short-lived cache of (user, layer) -> access decision + layer fields needed
// to serve a tile. The PB viewRule on map_layers enforces role-based
// visibility; calling getOne() per tile is the bottleneck during map panning.
// 60s TTL means a revoked role is honored within a minute, which is
// acceptable for tile access.
interface PermEntry {
	expiresAt: number;
	format: string;
	status: string | null;
	sourceType: string;
	url: string | null;
	subdomains: string[] | undefined;
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
		const firstKey = permCache.keys().next().value;
		if (firstKey) permCache.delete(firstKey);
	}
	permCache.set(`${userId}:${layerId}`, { ...entry, expiresAt: Date.now() + PERM_TTL_MS });
}

export const GET: RequestHandler = async ({ params, locals, request, url }) => {
	const { tilesetId, z, x, y } = params;

	if (!locals.pb.authStore.isValid || !locals.user) {
		throw error(401, 'Authentication required');
	}

	const zNum = parseInt(z, 10);
	const xNum = parseInt(x, 10);
	const yParts = y.split('.');
	const yNum = parseInt(yParts[0], 10);

	if (isNaN(zNum) || isNaN(xNum) || isNaN(yNum)) {
		throw error(400, 'Invalid tile coordinates');
	}
	if (zNum < 0 || zNum > 24) {
		throw error(400, 'Invalid zoom level');
	}

	let perm: PermEntry | null;
	try {
		perm = getCachedPerm(locals.user.id, tilesetId);
		if (!perm) {
			// Built-in fallback layers don't live in PocketBase. They exist so
			// the participant map always has *something* to show even when no
			// base layer is configured for a project.
			const builtIn = BUILT_IN_FALLBACKS[tilesetId];
			if (builtIn) {
				perm = {
					expiresAt: 0,
					format: 'png',
					status: null,
					sourceType: 'tile',
					url: builtIn.url,
					subdomains: builtIn.subdomains
				};
				setCachedPerm(locals.user.id, tilesetId, perm);
			} else {
			const layer = await locals.pb.collection('map_layers').getOne<MapLayer>(tilesetId);
			const cfg = (layer.config as (MapLayer['config'] & { subdomains?: string[] }) | null) ?? null;
			perm = {
				expiresAt: 0,
				format: cfg?.tile_format || 'png',
				status: layer.status,
				sourceType: layer.source_type,
				url: layer.url,
				subdomains: cfg?.subdomains
			};
			setCachedPerm(locals.user.id, tilesetId, perm);
			}
		}
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			const pbError = err as { status: number };
			if (pbError.status === 404) throw error(404, 'Tileset not found');
			if (pbError.status === 403) throw error(403, 'Access denied');
		}
		throw err;
	}

	if (perm.sourceType === 'uploaded' && perm.status !== 'completed') {
		throw error(404, 'Layer not available');
	}
	if (perm.sourceType === 'wms' || perm.sourceType === 'geojson') {
		throw error(400, 'Layer is not a tile source');
	}

	// URL extension overrides cached format if the client requested a specific encoding.
	let format = perm.format;
	if (yParts.length > 1) {
		const ext = yParts[1].toLowerCase();
		if (CONTENT_TYPES[ext]) {
			format = ext === 'jpeg' ? 'jpg' : ext;
		}
	}

	// For 'tile' and 'preset', we proxy the configured upstream URL through
	// the fetch-through cache. For 'uploaded', urlTemplate is unused — the
	// cache helper finds the bytes under data/tiles/{layerId}/...
	const urlTemplate = perm.sourceType === 'uploaded' ? '' : perm.url || '';

	const tile = await getOrFetchTile({
		layerId: tilesetId,
		z: zNum,
		x: xNum,
		y: yNum,
		urlTemplate,
		subdomains: perm.subdomains,
		preferredFormat: format,
		signal: request.signal,
		origin: url.origin
	});

	if (!tile) {
		throw error(404, 'Tile not found');
	}

	// Copy into a fresh ArrayBuffer to satisfy TS' BodyInit (Node's
	// Uint8Array<ArrayBufferLike> isn't accepted directly).
	const ab = new ArrayBuffer(tile.data.byteLength);
	new Uint8Array(ab).set(tile.data);
	return new Response(ab, {
		headers: {
			'Content-Type': tile.contentType || CONTENT_TYPES[tile.format] || 'application/octet-stream',
			'Content-Length': String(tile.data.byteLength),
			'Cache-Control': 'public, max-age=31536000, immutable'
		}
	});
};
