/**
 * Map tile caching for offline use
 *
 * Integrates with leaflet.offline for tile downloads and caching.
 * Updated to use Svelte 5 runes for progress tracking.
 */

import { getDB } from './db';
import type { BoundingBox } from './types';

// =============================================================================
// Types
// =============================================================================

export interface TileDownloadProgress {
	packId: string;
	totalTiles: number;
	downloadedTiles: number;
	status: 'idle' | 'downloading' | 'paused' | 'completed' | 'failed';
	error?: string;
}

// =============================================================================
// Progress State (Svelte 5 Runes)
// =============================================================================

let tileProgressState = $state<TileDownloadProgress | null>(null);

/**
 * Get current tile download progress (reactive)
 */
export function getTileProgress(): TileDownloadProgress | null {
	return tileProgressState;
}

/**
 * Reset tile progress
 */
export function resetTileProgress(): void {
	tileProgressState = null;
}

/**
 * Update tile download progress
 * This should be called from tile download event handlers
 */
export function updateTileProgress(downloadedTiles: number): void {
	if (tileProgressState) {
		tileProgressState = {
			...tileProgressState,
			downloadedTiles
		};
	}
}

// =============================================================================
// Tile Calculation Functions
// =============================================================================

/**
 * Calculate number of tiles needed for a bounding box at given zoom levels
 * Based on Web Mercator projection tile calculation
 */
export function calculateTileCount(bbox: BoundingBox, zoomLevels: number[]): number {
	let totalTiles = 0;

	for (const zoom of zoomLevels) {
		const bounds = {
			minX: lon2tile(bbox.west, zoom),
			maxX: lon2tile(bbox.east, zoom),
			minY: lat2tile(bbox.north, zoom),
			maxY: lat2tile(bbox.south, zoom)
		};

		const tilesX = Math.abs(bounds.maxX - bounds.minX) + 1;
		const tilesY = Math.abs(bounds.maxY - bounds.minY) + 1;
		totalTiles += tilesX * tilesY;
	}

	return totalTiles;
}

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
 * Estimate download size for tiles
 * Average tile size is ~15KB for standard map tiles
 */
export function estimateTileSize(tileCount: number): number {
	const avgTileSizeKB = 15;
	return (tileCount * avgTileSizeKB * 1024) / (1024 * 1024); // Convert to MB
}

/**
 * Get all tile coordinates for a bounding box and zoom levels
 */
export function getTileCoordinates(
	bbox: BoundingBox,
	zoomLevels: number[]
): Array<{ z: number; x: number; y: number }> {
	const tiles: Array<{ z: number; x: number; y: number }> = [];

	for (const zoom of zoomLevels) {
		const bounds = {
			minX: lon2tile(bbox.west, zoom),
			maxX: lon2tile(bbox.east, zoom),
			minY: lat2tile(bbox.north, zoom),
			maxY: lat2tile(bbox.south, zoom)
		};

		for (let x = bounds.minX; x <= bounds.maxX; x++) {
			for (let y = bounds.minY; y <= bounds.maxY; y++) {
				tiles.push({ z: zoom, x, y });
			}
		}
	}

	return tiles;
}

// =============================================================================
// Tile Download Functions
// =============================================================================

/**
 * Download tiles for a pack using leaflet.offline
 *
 * This function is meant to be called from a Leaflet map component
 * that has leaflet.offline initialized
 *
 * Note: The actual tile downloading is handled by leaflet.offline library
 * This function provides the coordination logic
 */
export async function downloadTilesForPack(
	packId: string,
	bbox: BoundingBox,
	zoomLevels: number[],
	tileLayer: {
		saveTiles?: (
			bbox: {
				_southWest: { lat: number; lng: number };
				_northEast: { lat: number; lng: number };
			},
			minZoom: number,
			maxZoom: number,
			confirm?: (status: { nTilesToSave: number }) => Promise<boolean>
		) => Promise<void>;
	}
): Promise<void> {
	// Ensure leaflet.offline is available
	if (!tileLayer.saveTiles) {
		throw new Error('leaflet.offline not initialized on tile layer');
	}

	const totalTiles = calculateTileCount(bbox, zoomLevels);

	// Initialize progress
	tileProgressState = {
		packId,
		totalTiles,
		downloadedTiles: 0,
		status: 'downloading'
	};

	try {
		// Create Leaflet-compatible bounds object
		const bounds = {
			_southWest: { lat: bbox.south, lng: bbox.west },
			_northEast: { lat: bbox.north, lng: bbox.east }
		};

		const minZoom = Math.min(...zoomLevels);
		const maxZoom = Math.max(...zoomLevels);

		// Download tiles using leaflet.offline
		// The library will handle caching in IndexedDB automatically
		await tileLayer.saveTiles(bounds, minZoom, maxZoom, async (status) => {
			// Confirm download
			console.log(`Ready to download ${status.nTilesToSave} tiles`);
			return true;
		});

		// Update pack metadata with tile info
		const db = await getDB();
		const pack = await db.get('pack_metadata', packId);
		if (pack) {
			await db.put('pack_metadata', {
				...pack,
				tile_count: totalTiles,
				estimated_size_mb: estimateTileSize(totalTiles),
				updated_at: new Date().toISOString()
			});
		}

		// Mark as completed
		tileProgressState = {
			packId,
			totalTiles,
			downloadedTiles: totalTiles,
			status: 'completed'
		};
	} catch (error) {
		console.error('Error downloading tiles:', error);
		tileProgressState = {
			packId,
			totalTiles,
			downloadedTiles: 0,
			status: 'failed',
			error: error instanceof Error ? error.message : 'Unknown error'
		};
		throw error;
	}
}

// =============================================================================
// Tile Cache Management
// =============================================================================

/**
 * Check if tiles are available for a pack
 * This requires integration with leaflet.offline's storage
 */
export async function areTilesAvailable(packId: string): Promise<boolean> {
	const db = await getDB();
	const pack = await db.get('pack_metadata', packId);
	return pack !== undefined && pack.tile_count > 0;
}

/**
 * Clear cached tiles for a pack
 * This should be called when deleting a pack
 *
 * Note: Requires leaflet.offline control instance to delete tiles
 */
export async function clearPackTiles(
	packId: string,
	tileLayer: {
		clearTiles?: () => Promise<void>;
	}
): Promise<void> {
	if (tileLayer.clearTiles) {
		await tileLayer.clearTiles();
	}

	// Update pack metadata
	const db = await getDB();
	const pack = await db.get('pack_metadata', packId);
	if (pack) {
		await db.put('pack_metadata', {
			...pack,
			tile_count: 0,
			estimated_size_mb: 0,
			updated_at: new Date().toISOString()
		});
	}
}

/**
 * Get tile cache statistics
 * Requires leaflet.offline to be initialized
 */
export async function getTileCacheStats(): Promise<{
	tileCount: number;
	cacheSize: number;
}> {
	// This would need to query the IndexedDB store used by leaflet.offline
	// The library stores tiles in a store called 'tileStore'
	// For now, return placeholder values
	try {
		// Note: This is a placeholder - actual implementation would query
		// the leaflet.offline IndexedDB store directly
		return {
			tileCount: 0,
			cacheSize: 0
		};
	} catch {
		return {
			tileCount: 0,
			cacheSize: 0
		};
	}
}
