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
// ZIP Extraction for Offline Packages
// =============================================================================

import { unzip } from 'fflate';

export interface ZipExtractionProgress {
	status: 'extracting' | 'completed' | 'failed';
	extracted: number;
	total: number;
	currentFile?: string;
	error?: string;
}

/**
 * Extract tiles from a ZIP archive and store in IndexedDB
 *
 * ZIP structure expected:
 * ```
 * metadata.json
 * {layerId}/{z}/{x}/{y}.{ext}
 * ```
 *
 * @param zipData - The ZIP file as Uint8Array
 * @param onProgress - Progress callback
 * @returns Number of tiles extracted
 */
export async function extractAndStoreTiles(
	zipData: Uint8Array,
	onProgress?: (progress: ZipExtractionProgress) => void
): Promise<number> {
	return new Promise((resolve, reject) => {
		onProgress?.({ status: 'extracting', extracted: 0, total: 0 });

		unzip(zipData, async (err, files) => {
			if (err) {
				onProgress?.({ status: 'failed', extracted: 0, total: 0, error: err.message });
				return reject(err);
			}

			try {
				const entries = Object.entries(files);
				const tileEntries = entries.filter(([path]) =>
					// Match pattern: {layerId}/{z}/{x}/{y}.{ext}
					/^[^/]+\/\d+\/\d+\/\d+\.(png|jpg|jpeg|webp)$/i.test(path)
				);

				let extracted = 0;
				const total = tileEntries.length;

				for (const [path, data] of tileEntries) {
					// Parse path: "{layerId}/{z}/{x}/{y}.{ext}"
					const match = path.match(/^([^/]+)\/(\d+)\/(\d+)\/(\d+)\.(png|jpg|jpeg|webp)$/i);
					if (!match) continue;

					const [, layerId, zStr, xStr, yStr] = match;
					const z = parseInt(zStr, 10);
					const x = parseInt(xStr, 10);
					const y = parseInt(yStr, 10);

					// Determine MIME type from extension
					const ext = match[5].toLowerCase();
					const mimeType =
						ext === 'png'
							? 'image/png'
							: ext === 'webp'
								? 'image/webp'
								: 'image/jpeg';

					// Create blob and store
					// Copy to a new ArrayBuffer to avoid SharedArrayBuffer type issues
					const copy = new Uint8Array(data);
					const blob = new Blob([copy], { type: mimeType });
					await storeTile(layerId, z, x, y, blob, '');

					extracted++;
					onProgress?.({
						status: 'extracting',
						extracted,
						total,
						currentFile: path
					});
				}

				onProgress?.({ status: 'completed', extracted, total });
				resolve(extracted);
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				onProgress?.({ status: 'failed', extracted: 0, total: 0, error: errorMessage });
				reject(error);
			}
		});
	});
}

/**
 * Get package metadata from ZIP file without extracting tiles
 */
export async function getPackageMetadata(
	zipData: Uint8Array
): Promise<Record<string, unknown> | null> {
	return new Promise((resolve, reject) => {
		unzip(zipData, (err, files) => {
			if (err) {
				return reject(err);
			}

			const metadataFile = files['metadata.json'];
			if (!metadataFile) {
				return resolve(null);
			}

			try {
				const text = new TextDecoder().decode(metadataFile);
				resolve(JSON.parse(text));
			} catch {
				resolve(null);
			}
		});
	});
}
