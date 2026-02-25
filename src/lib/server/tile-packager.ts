/**
 * Server-side tile packager
 *
 * Downloads tiles from providers and creates ZIP archives for offline packages.
 * This runs during package creation (admin action).
 */

import { zip } from 'fflate';
import { getTilesForPolygon, type TileCoord } from '$lib/utils/geo-utils';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';

// =============================================================================
// Types
// =============================================================================

export interface TileSource {
	id: string;
	name: string;
	urlTemplate: string;
	subdomains?: string[];
	/** For uploaded sources, read from filesystem instead of HTTP */
	isUploaded?: boolean;
	/** Layer ID for uploaded tiles (to find them in static/tiles/{layerId}) */
	layerId?: string;
	/** Tile format for uploaded sources */
	tileFormat?: string;
}

export interface PackageOptions {
	packageId: string;
	regionPolygon: Feature<Polygon | MultiPolygon> | Polygon | MultiPolygon;
	zoomMin: number;
	zoomMax: number;
	layers: TileSource[];
	onProgress?: (done: number, total: number, currentLayer?: string) => void;
	signal?: AbortSignal;
}

export interface PackageResult {
	tileCount: number;
	fileSizeBytes: number;
	zipBuffer: Uint8Array;
}

export interface TileDownloadError {
	layerId: string;
	z: number;
	x: number;
	y: number;
	error: string;
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

/**
 * Determine file extension from URL or content type
 */
function getFileExtension(url: string, contentType?: string): string {
	// Try to extract from URL
	const urlLower = url.toLowerCase();
	if (urlLower.includes('.png')) return 'png';
	if (urlLower.includes('.jpg') || urlLower.includes('.jpeg')) return 'jpg';
	if (urlLower.includes('.webp')) return 'webp';

	// Fallback to content type
	if (contentType) {
		if (contentType.includes('png')) return 'png';
		if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
		if (contentType.includes('webp')) return 'webp';
	}

	// Default to png
	return 'png';
}

// =============================================================================
// Tile Download / Read
// =============================================================================

/**
 * Download a single tile from HTTP
 */
async function downloadTile(
	url: string,
	signal?: AbortSignal
): Promise<{ data: Uint8Array; contentType?: string } | null> {
	try {
		const response = await fetch(url, {
			signal,
			headers: {
				// Some tile servers require a user agent
				'User-Agent': 'UeberblickOfflinePackager/1.0'
			}
		});

		if (!response.ok) {
			console.warn(`Failed to fetch tile ${url}: ${response.status}`);
			return null;
		}

		const arrayBuffer = await response.arrayBuffer();
		return {
			data: new Uint8Array(arrayBuffer),
			contentType: response.headers.get('content-type') || undefined
		};
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			throw error;
		}
		console.warn(`Error downloading tile ${url}:`, error);
		return null;
	}
}

/**
 * Read a tile from the local filesystem (for uploaded sources)
 */
async function readUploadedTile(
	layerId: string,
	z: number,
	x: number,
	y: number,
	format: string = 'png'
): Promise<{ data: Uint8Array; format: string } | null> {
	const tilePath = path.join(
		process.cwd(),
		'static',
		'tiles',
		layerId,
		String(z),
		String(x),
		`${y}.${format}`
	);

	if (!existsSync(tilePath)) {
		return null;
	}

	try {
		const data = await readFile(tilePath);
		return {
			data: new Uint8Array(data),
			format
		};
	} catch (err) {
		console.warn(`Error reading tile ${tilePath}:`, err);
		return null;
	}
}

// =============================================================================
// Main Packager Function
// =============================================================================

/**
 * Create a tile package as a ZIP archive
 *
 * Downloads tiles from all specified sources for the given polygon region
 * and zoom levels, then creates a ZIP archive.
 *
 * ZIP structure:
 * ```
 * metadata.json           # { layers, zoomRange, tileCount, ... }
 * {layerId}/
 *   {z}/
 *     {x}/
 *       {y}.png           # or .jpg, .webp
 * ```
 */
export async function createTilePackage(options: PackageOptions): Promise<PackageResult> {
	const { packageId, regionPolygon, zoomMin, zoomMax, layers, onProgress, signal } = options;

	// Generate zoom levels array
	const zoomLevels: number[] = [];
	for (let z = zoomMin; z <= zoomMax; z++) {
		zoomLevels.push(z);
	}

	// Get tile coordinates grouped by zoom level
	const tilesByZoom = new Map<number, TileCoord[]>();
	for (const z of zoomLevels) {
		tilesByZoom.set(z, getTilesForPolygon(regionPolygon, [z]));
	}

	// Calculate total tiles across all layers
	let totalTileCoords = 0;
	for (const tiles of tilesByZoom.values()) {
		totalTileCoords += tiles.length;
	}
	const totalTiles = totalTileCoords * layers.length;

	console.log(`[tile-packager] Creating package ${packageId}:`, {
		zoomLevels,
		tileCount: totalTileCoords,
		layerCount: layers.length,
		totalTiles
	});

	// Prepare file structure for ZIP
	const files: Record<string, Uint8Array> = {};
	const errors: TileDownloadError[] = [];
	const skippedZoomLevels: Map<string, Set<number>> = new Map(); // layerId -> skipped zoom levels

	let downloadedCount = 0;
	let processedCount = 0;
	const concurrency = 6;
	const FAILURE_THRESHOLD = 5; // If first N tiles at a zoom level all fail, skip the rest

	// Download tiles for each layer
	for (const layer of layers) {
		if (signal?.aborted) {
			throw new Error('Package creation cancelled');
		}

		console.log(`[tile-packager] Processing layer: ${layer.name} (${layer.id})`);
		onProgress?.(processedCount, totalTiles, layer.name);

		const layerSkippedZooms = new Set<number>();
		skippedZoomLevels.set(layer.id, layerSkippedZooms);

		// Process each zoom level separately so we can skip if it's not supported
		for (const z of zoomLevels) {
			if (signal?.aborted) {
				throw new Error('Package creation cancelled');
			}

			const tilesAtZoom = tilesByZoom.get(z) || [];
			if (tilesAtZoom.length === 0) continue;

			let zoomFailures = 0;
			let zoomSuccesses = 0;
			let skipRemainingAtZoom = false;

			// Process tiles in batches
			for (let i = 0; i < tilesAtZoom.length; i += concurrency) {
				if (signal?.aborted) {
					throw new Error('Package creation cancelled');
				}

				// Check if we should skip this zoom level
				if (skipRemainingAtZoom) {
					// Count remaining tiles as processed (skipped)
					const remaining = tilesAtZoom.length - i;
					processedCount += remaining;
					onProgress?.(processedCount, totalTiles, layer.name);
					break;
				}

				const batch = tilesAtZoom.slice(i, i + concurrency);
				const results = await Promise.all(
					batch.map(async (coord) => {
						// For uploaded sources, read from filesystem
						if (layer.isUploaded && layer.layerId) {
							const result = await readUploadedTile(
								layer.layerId,
								coord.z,
								coord.x,
								coord.y,
								layer.tileFormat || 'png'
							);

							if (result) {
								const tilePath = `${layer.id}/${coord.z}/${coord.x}/${coord.y}.${result.format}`;
								return { path: tilePath, data: result.data, success: true };
							} else {
								return { coord, success: false };
							}
						}

						// For HTTP sources, download via fetch
						const url = getTileUrl(layer.urlTemplate, coord.z, coord.x, coord.y, layer.subdomains);
						const result = await downloadTile(url, signal);

						if (result) {
							const ext = getFileExtension(url, result.contentType);
							const tilePath = `${layer.id}/${coord.z}/${coord.x}/${coord.y}.${ext}`;
							return { path: tilePath, data: result.data, success: true };
						} else {
							return { coord, success: false };
						}
					})
				);

				// Process results
				for (const result of results) {
					processedCount++;
					if (result.success && 'path' in result) {
						files[result.path] = result.data;
						downloadedCount++;
						zoomSuccesses++;
					} else {
						zoomFailures++;
						if ('coord' in result) {
							errors.push({
								layerId: layer.id,
								z: result.coord.z,
								x: result.coord.x,
								y: result.coord.y,
								error: 'Download failed'
							});
						}
					}
				}

				// Check if this zoom level is not supported (all failures, no successes)
				// Only check after processing FAILURE_THRESHOLD tiles
				// Skip this check for uploaded sources - they may have sparse coverage
				const totalAttempted = zoomSuccesses + zoomFailures;
				if (!layer.isUploaded && totalAttempted >= FAILURE_THRESHOLD && zoomSuccesses === 0) {
					console.log(`[tile-packager] Zoom level ${z} not supported for ${layer.name} (${zoomFailures} failures), skipping remaining tiles`);
					layerSkippedZooms.add(z);
					skipRemainingAtZoom = true;
				}

				onProgress?.(processedCount, totalTiles, layer.name);
			}

			if (zoomSuccesses > 0) {
				console.log(`[tile-packager] Layer ${layer.name} zoom ${z}: ${zoomSuccesses} tiles downloaded`);
			}
		}

		console.log(`[tile-packager] Layer ${layer.name} complete: ${downloadedCount} downloaded, ${processedCount}/${totalTiles} processed`);
		if (layerSkippedZooms.size > 0) {
			console.log(`[tile-packager] Skipped zoom levels for ${layer.name}: ${[...layerSkippedZooms].join(', ')}`);
		}
	}

	// Create metadata
	const skippedInfo: Record<string, number[]> = {};
	for (const [layerId, zooms] of skippedZoomLevels) {
		if (zooms.size > 0) {
			skippedInfo[layerId] = [...zooms].sort((a, b) => a - b);
		}
	}

	const metadata = {
		packageId,
		createdAt: new Date().toISOString(),
		zoomMin,
		zoomMax,
		tileCount: downloadedCount,
		layers: layers.map((l) => ({ id: l.id, name: l.name })),
		skippedZoomLevels: Object.keys(skippedInfo).length > 0 ? skippedInfo : undefined,
		errors: errors.length > 0 ? errors.slice(0, 100) : undefined // Limit error count in metadata
	};

	files['metadata.json'] = new TextEncoder().encode(JSON.stringify(metadata, null, 2));

	console.log(
		`[tile-packager] Creating ZIP with ${Object.keys(files).length} files (${errors.length} errors)`
	);

	// Create ZIP archive
	const zipBuffer = await createZip(files);

	console.log(`[tile-packager] Package complete: ${zipBuffer.length} bytes`);

	return {
		tileCount: downloadedCount,
		fileSizeBytes: zipBuffer.length,
		zipBuffer
	};
}

/**
 * Create ZIP archive from files
 */
function createZip(files: Record<string, Uint8Array>): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		zip(files, { level: 6 }, (err, data) => {
			if (err) {
				reject(err);
			} else {
				resolve(data);
			}
		});
	});
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Estimate package size before creating
 *
 * Provides a rough estimate based on average tile sizes.
 */
export function estimatePackageSize(
	regionPolygon: Feature<Polygon | MultiPolygon> | Polygon | MultiPolygon,
	zoomMin: number,
	zoomMax: number,
	layerCount: number
): { tileCount: number; estimatedSizeMB: number } {
	const zoomLevels: number[] = [];
	for (let z = zoomMin; z <= zoomMax; z++) {
		zoomLevels.push(z);
	}

	const tileCoords = getTilesForPolygon(regionPolygon, zoomLevels);
	const totalTiles = tileCoords.length * layerCount;

	// Average tile size is ~15KB, but ZIP compression typically reduces by 10-20%
	const avgTileSizeKB = 12; // After compression estimate
	const estimatedSizeMB = (totalTiles * avgTileSizeKB) / 1024;

	return {
		tileCount: totalTiles,
		estimatedSizeMB
	};
}

/**
 * Validate package options
 */
export function validatePackageOptions(options: Partial<PackageOptions>): string[] {
	const errors: string[] = [];

	if (!options.regionPolygon) {
		errors.push('Region polygon is required');
	}

	if (options.zoomMin !== undefined && options.zoomMax !== undefined) {
		if (options.zoomMin > options.zoomMax) {
			errors.push('Minimum zoom must be less than or equal to maximum zoom');
		}
		if (options.zoomMin < 0 || options.zoomMax > 22) {
			errors.push('Zoom levels must be between 0 and 22');
		}
	}

	if (!options.layers || options.layers.length === 0) {
		errors.push('At least one layer is required');
	}

	return errors;
}
