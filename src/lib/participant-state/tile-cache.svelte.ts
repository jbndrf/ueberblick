/**
 * Custom map tile caching for offline use
 *
 * Supports multiple tile sources (base layers + overlays).
 * Stores tiles in IndexedDB with keys: "{sourceId}/{z}/{x}/{y}"
 */

import { getDB, type CachedTile } from './db';

// =============================================================================
// Types
// =============================================================================

export interface TileSource {
	id: string;
	urlTemplate: string; // e.g., "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
	subdomains?: string[]; // e.g., ['a', 'b', 'c']
}

export interface TileDownloadProgress {
	status: 'idle' | 'downloading' | 'completed' | 'failed';
	totalTiles: number;
	downloadedTiles: number;
	currentSource?: string;
	error?: string;
}

export interface DownloadOptions {
	center: { lat: number; lon: number };
	radiusKm: number;
	zoomLevels: number[];
	sources: TileSource[];
	onProgress?: (progress: TileDownloadProgress) => void;
	signal?: AbortSignal;
}

// =============================================================================
// Progress State (Svelte 5 Runes)
// =============================================================================

let tileProgressState = $state<TileDownloadProgress>({
	status: 'idle',
	totalTiles: 0,
	downloadedTiles: 0
});

export function getTileProgress(): TileDownloadProgress {
	return tileProgressState;
}

export function resetTileProgress(): void {
	tileProgressState = {
		status: 'idle',
		totalTiles: 0,
		downloadedTiles: 0
	};
}

// =============================================================================
// Tile Coordinate Calculations
// =============================================================================

/**
 * Convert longitude to tile X coordinate
 */
function lon2tile(lon: number, zoom: number): number {
	return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

/**
 * Convert latitude to tile Y coordinate
 */
function lat2tile(lat: number, zoom: number): number {
	return Math.floor(
		((1 -
			Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) /
			2) *
			Math.pow(2, zoom)
	);
}

/**
 * Convert center + radius to bounding box
 */
function radiusToBbox(
	center: { lat: number; lon: number },
	radiusKm: number
): { north: number; south: number; east: number; west: number } {
	// Approximate degrees per km (varies by latitude, but good enough for this use)
	const latDegPerKm = 1 / 111.32;
	const lonDegPerKm = 1 / (111.32 * Math.cos((center.lat * Math.PI) / 180));

	return {
		north: center.lat + radiusKm * latDegPerKm,
		south: center.lat - radiusKm * latDegPerKm,
		east: center.lon + radiusKm * lonDegPerKm,
		west: center.lon - radiusKm * lonDegPerKm
	};
}

/**
 * Get all tile coordinates for a bounding box at given zoom levels
 */
export function getTileCoordinates(
	bbox: { north: number; south: number; east: number; west: number },
	zoomLevels: number[]
): Array<{ z: number; x: number; y: number }> {
	const tiles: Array<{ z: number; x: number; y: number }> = [];

	for (const zoom of zoomLevels) {
		const minX = lon2tile(bbox.west, zoom);
		const maxX = lon2tile(bbox.east, zoom);
		const minY = lat2tile(bbox.north, zoom);
		const maxY = lat2tile(bbox.south, zoom);

		for (let x = minX; x <= maxX; x++) {
			for (let y = minY; y <= maxY; y++) {
				tiles.push({ z: zoom, x, y });
			}
		}
	}

	return tiles;
}

/**
 * Calculate number of tiles for area (single source)
 */
export function calculateTileCount(
	center: { lat: number; lon: number },
	radiusKm: number,
	zoomLevels: number[]
): number {
	const bbox = radiusToBbox(center, radiusKm);
	return getTileCoordinates(bbox, zoomLevels).length;
}

/**
 * Estimate download size in MB
 * Average tile size is ~15KB for standard map tiles
 */
export function estimateTileSize(tileCount: number, sourceCount: number = 1): number {
	const avgTileSizeKB = 15;
	return (tileCount * sourceCount * avgTileSizeKB) / 1024; // MB
}

// =============================================================================
// Tile URL Generation
// =============================================================================

/**
 * Generate actual tile URL from template
 */
function getTileUrl(
	urlTemplate: string,
	z: number,
	x: number,
	y: number,
	subdomains?: string[]
): string {
	let url = urlTemplate
		.replace('{z}', z.toString())
		.replace('{x}', x.toString())
		.replace('{y}', y.toString());

	// Handle subdomains (e.g., {s} -> 'a', 'b', or 'c')
	if (subdomains && subdomains.length > 0 && url.includes('{s}')) {
		const subdomain = subdomains[(x + y) % subdomains.length];
		url = url.replace('{s}', subdomain);
	}

	return url;
}

// =============================================================================
// Tile Storage Functions
// =============================================================================

/**
 * Store a tile in IndexedDB
 */
export async function storeTile(
	sourceId: string,
	z: number,
	x: number,
	y: number,
	blob: Blob,
	urlTemplate: string
): Promise<void> {
	const db = await getDB();
	const tile: CachedTile = {
		key: `${sourceId}/${z}/${x}/${y}`,
		sourceId,
		z,
		x,
		y,
		blob,
		urlTemplate,
		cachedAt: new Date().toISOString()
	};
	await db.put('tiles', tile);
}

/**
 * Get a tile from IndexedDB
 */
export async function getTile(
	sourceId: string,
	z: number,
	x: number,
	y: number
): Promise<Blob | null> {
	const db = await getDB();
	const key = `${sourceId}/${z}/${x}/${y}`;
	const tile = await db.get('tiles', key);
	return tile?.blob ?? null;
}

/**
 * Check if a tile exists in cache
 */
export async function hasTile(sourceId: string, z: number, x: number, y: number): Promise<boolean> {
	const db = await getDB();
	const key = `${sourceId}/${z}/${x}/${y}`;
	const tile = await db.get('tiles', key);
	return tile !== undefined;
}

/**
 * Get all cached tiles for a source
 */
export async function getTilesForSource(sourceId: string): Promise<CachedTile[]> {
	const db = await getDB();
	return db.getAllFromIndex('tiles', 'by_source', sourceId);
}

/**
 * Delete all tiles for a source
 */
export async function deleteTilesForSource(sourceId: string): Promise<number> {
	const db = await getDB();
	const tiles = await db.getAllKeysFromIndex('tiles', 'by_source', sourceId);
	for (const key of tiles) {
		await db.delete('tiles', key);
	}
	return tiles.length;
}

/**
 * Delete ALL cached tiles
 */
export async function clearAllTiles(): Promise<number> {
	const db = await getDB();
	const count = await db.count('tiles');
	await db.clear('tiles');
	return count;
}

/**
 * Get tile cache statistics
 */
export async function getTileCacheStats(): Promise<{
	totalTiles: number;
	bySource: Record<string, number>;
}> {
	const db = await getDB();
	const allTiles = await db.getAll('tiles');

	const bySource: Record<string, number> = {};
	for (const tile of allTiles) {
		bySource[tile.sourceId] = (bySource[tile.sourceId] || 0) + 1;
	}

	return {
		totalTiles: allTiles.length,
		bySource
	};
}

// =============================================================================
// Tile Download Functions
// =============================================================================

/**
 * Download a single tile and store it
 */
async function downloadAndStoreTile(
	source: TileSource,
	z: number,
	x: number,
	y: number,
	signal?: AbortSignal
): Promise<boolean> {
	// Check if already cached
	if (await hasTile(source.id, z, x, y)) {
		return true; // Already cached, skip
	}

	const url = getTileUrl(source.urlTemplate, z, x, y, source.subdomains);

	try {
		const response = await fetch(url, { signal });
		if (!response.ok) {
			console.warn(`Failed to fetch tile ${url}: ${response.status}`);
			return false;
		}

		const blob = await response.blob();
		await storeTile(source.id, z, x, y, blob, source.urlTemplate);
		return true;
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			throw error; // Re-throw abort errors
		}
		console.warn(`Error downloading tile ${url}:`, error);
		return false;
	}
}

/**
 * Download tiles for an area from ALL specified sources
 *
 * @param options Download configuration
 * @returns Number of tiles successfully downloaded
 */
export async function downloadTilesForArea(options: DownloadOptions): Promise<number> {
	const { center, radiusKm, zoomLevels, sources, onProgress, signal } = options;

	const bbox = radiusToBbox(center, radiusKm);
	const tileCoords = getTileCoordinates(bbox, zoomLevels);
	const totalTiles = tileCoords.length * sources.length;

	console.log('[downloadTilesForArea] Starting download:', {
		center,
		radiusKm,
		zoomLevels,
		bbox,
		tileCoordCount: tileCoords.length,
		sourcesCount: sources.length,
		totalTiles
	});
	console.log('[downloadTilesForArea] Sources:', sources.map(s => ({ id: s.id, url: s.urlTemplate })));

	// Update progress state
	tileProgressState = {
		status: 'downloading',
		totalTiles,
		downloadedTiles: 0
	};
	onProgress?.(tileProgressState);

	let downloadedCount = 0;
	const concurrency = 6; // Download 6 tiles at a time

	try {
		for (const source of sources) {
			console.log(`[downloadTilesForArea] Processing source: ${source.id} with URL: ${source.urlTemplate}`);
			let sourceSuccessCount = 0;
			let sourceFailCount = 0;

			tileProgressState = {
				...tileProgressState,
				currentSource: source.id
			};
			onProgress?.(tileProgressState);

			// Process tiles in batches for this source
			for (let i = 0; i < tileCoords.length; i += concurrency) {
				if (signal?.aborted) {
					throw new Error('Download cancelled');
				}

				const batch = tileCoords.slice(i, i + concurrency);
				const results = await Promise.all(
					batch.map((coord) => downloadAndStoreTile(source, coord.z, coord.x, coord.y, signal))
				);

				const successCount = results.filter(Boolean).length;
				const failCount = results.filter((r) => !r).length;
				downloadedCount += successCount;
				sourceSuccessCount += successCount;
				sourceFailCount += failCount;

				tileProgressState = {
					...tileProgressState,
					downloadedTiles: downloadedCount
				};
				onProgress?.(tileProgressState);
			}

			console.log(`[downloadTilesForArea] Source ${source.id} completed: ${sourceSuccessCount} success, ${sourceFailCount} failed`);
		}

		tileProgressState = {
			status: 'completed',
			totalTiles,
			downloadedTiles: downloadedCount
		};
		onProgress?.(tileProgressState);

		return downloadedCount;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		tileProgressState = {
			status: 'failed',
			totalTiles,
			downloadedTiles: downloadedCount,
			error: errorMessage
		};
		onProgress?.(tileProgressState);
		throw error;
	}
}

// =============================================================================
// Exports for CachedTileLayer
// =============================================================================

export { radiusToBbox };
