/**
 * Custom Leaflet TileLayer that serves tiles from IndexedDB cache when available.
 *
 * When a tile is missing at the requested (z, x, y) — both in cache and from
 * the network — falls back to the parent tile (z-1) and recursively further
 * up, drawing the matching quadrant scaled to a full tile. This restores the
 * "blurry but visible" overzoom behaviour for sparse tilesets where the
 * configured max zoom exceeds actual coverage.
 */

import type L from 'leaflet';
import { getTile } from '$lib/participant-state/tile-cache.svelte';
type TileCoords = { x: number; y: number; z: number };
type DoneCallback = (error: Error | null, tile: HTMLImageElement) => void;

const MAX_FALLBACK_LEVELS = 5;

type TileLayerWithUrl = L.TileLayer & {
	options: L.TileLayerOptions;
};

export function createCachedTileLayer(
	layerId: string,
	urlTemplate: string,
	options: L.TileLayerOptions | undefined,
	leaflet: typeof L
): L.TileLayer {
	const subdomains = options?.subdomains;
	const CachedTileLayer = leaflet.TileLayer.extend({
		createTile: function (coords: TileCoords, done: DoneCallback): HTMLImageElement {
			const tile = document.createElement('img');
			const self = this as TileLayerWithUrl;

			tile.alt = '';
			tile.setAttribute('role', 'presentation');

			loadTileWithFallback(self, urlTemplate, subdomains, layerId, coords, tile, done);

			return tile;
		}
	}) as new (urlTemplate: string, options?: L.TileLayerOptions) => L.TileLayer;

	return new CachedTileLayer(urlTemplate, options);
}

/**
 * Build a tile URL for arbitrary coords. We do NOT use Leaflet's
 * `getTileUrl(coords)` because it ignores `coords.z` and substitutes the
 * layer's current display zoom — which breaks parent-zoom fallback fetches.
 */
function buildTileUrl(
	urlTemplate: string,
	subdomains: string | string[] | undefined,
	coords: TileCoords
): string {
	const subs = Array.isArray(subdomains)
		? subdomains
		: typeof subdomains === 'string'
			? subdomains.split('')
			: ['a', 'b', 'c'];
	const s = subs[Math.abs(coords.x + coords.y) % subs.length];
	return urlTemplate
		.replace('{s}', s)
		.replace('{z}', String(coords.z))
		.replace('{x}', String(coords.x))
		.replace('{y}', String(coords.y))
		.replace('{r}', '');
}

/**
 * Try to load the requested tile; on miss, walk up parent zoom levels and
 * synthesize a tile by scaling the matching quadrant of the parent.
 */
async function loadTileWithFallback(
	layer: TileLayerWithUrl,
	urlTemplate: string,
	subdomains: string | string[] | undefined,
	layerId: string,
	coords: TileCoords,
	tile: HTMLImageElement,
	done: DoneCallback
): Promise<void> {
	const direct = await fetchTileBlob(urlTemplate, subdomains, layerId, coords);
	if (direct) {
		assignBlobToTile(tile, direct, done);
		return;
	}

	for (let i = 1; i <= MAX_FALLBACK_LEVELS; i++) {
		const parentZ = coords.z - i;
		if (parentZ < 0) break;
		const parentX = coords.x >> i;
		const parentY = coords.y >> i;
		const parentCoords = { x: parentX, y: parentY, z: parentZ };

		const parentBlob = await fetchTileBlob(urlTemplate, subdomains, layerId, parentCoords);
		if (!parentBlob) continue;

		try {
			const tileSize = (layer.options.tileSize as number) || 256;
			const synthesized = await synthesizeFromParent(parentBlob, coords, parentCoords, tileSize);
			assignBlobToTile(tile, synthesized, done);
			return;
		} catch (err) {
			console.warn('[CachedTileLayer] Failed to synthesize parent tile', err);
		}
	}

	console.error(
		'[CachedTileLayer] No tile available (cache, network, or parent fallback) for',
		`${layerId}/${coords.z}/${coords.x}/${coords.y}`
	);
	done(new Error('Tile unavailable'), tile);
}

/**
 * Returns a tile blob from cache or network. Returns null if neither has it.
 */
async function fetchTileBlob(
	urlTemplate: string,
	subdomains: string | string[] | undefined,
	layerId: string,
	coords: TileCoords
): Promise<Blob | null> {
	try {
		const cached = await getTile(layerId, coords.z, coords.x, coords.y);
		if (cached) return cached;
	} catch (err) {
		console.error('[CachedTileLayer] IndexedDB read failed for', coords, err);
	}

	if (!navigator.onLine) return null;

	const url = buildTileUrl(urlTemplate, subdomains, coords);
	try {
		const res = await fetch(url, { credentials: 'same-origin' });
		if (!res.ok) return null;
		return await res.blob();
	} catch {
		return null;
	}
}

/**
 * Draw the (childCoords) quadrant of parentCoords' tile onto a fresh canvas
 * sized to a single tile, then return that as a blob.
 */
async function synthesizeFromParent(
	parentBlob: Blob,
	childCoords: TileCoords,
	parentCoords: TileCoords,
	tileSize: number
): Promise<Blob> {
	const bitmap = await createImageBitmap(parentBlob);
	try {
		const levels = childCoords.z - parentCoords.z;
		const scale = 1 << levels;
		const subX = childCoords.x - (parentCoords.x << levels);
		const subY = childCoords.y - (parentCoords.y << levels);
		const sw = bitmap.width / scale;
		const sh = bitmap.height / scale;
		const sx = subX * sw;
		const sy = subY * sh;

		const canvas = document.createElement('canvas');
		canvas.width = tileSize;
		canvas.height = tileSize;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('2d context unavailable');
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, tileSize, tileSize);

		return await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(
				(blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
				'image/png'
			);
		});
	} finally {
		bitmap.close?.();
	}
}

function assignBlobToTile(tile: HTMLImageElement, blob: Blob, done: DoneCallback): void {
	const url = URL.createObjectURL(blob);
	tile.onload = () => {
		URL.revokeObjectURL(url);
		done(null, tile);
	};
	tile.onerror = () => {
		URL.revokeObjectURL(url);
		done(new Error('Tile decode failed'), tile);
	};
	tile.src = url;
}

/**
 * Create multiple cached tile layers from map layers
 */
export function createCachedTileLayers(
	layers: Array<{
		id: string;
		url: string;
		config?: {
			subdomains?: string[];
			attribution?: string;
			maxZoom?: number;
			minZoom?: number;
		};
	}>,
	leaflet: typeof L
): Map<string, L.TileLayer> {
	const result = new Map<string, L.TileLayer>();

	for (const layer of layers) {
		const options: L.TileLayerOptions = {
			subdomains: layer.config?.subdomains,
			attribution: layer.config?.attribution,
			maxZoom: layer.config?.maxZoom ?? 19,
			minZoom: layer.config?.minZoom ?? 0,
			crossOrigin: 'anonymous'
		};

		try {
			const tileLayer = createCachedTileLayer(layer.id, layer.url, options, leaflet);
			result.set(layer.id, tileLayer);
		} catch (error) {
			console.warn(`Failed to create cached layer for ${layer.id}:`, error);
		}
	}

	return result;
}
