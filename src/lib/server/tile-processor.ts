/**
 * Tile processor for handling uploaded ZIP files containing map tiles
 * Extracts tiles in z/x/y format and updates the source record
 */

import { mkdir, rm, readdir, stat, rename } from 'fs/promises';
import path from 'path';
import type PocketBase from 'pocketbase';
import type { UploadedSourceConfig } from '$lib/types/map-layer';
import { getUnzipper } from './unzipper';

const MAX_ENTRY_COUNT = 50_000;
const MAX_TOTAL_UNCOMPRESSED = 500 * 1024 * 1024;
const MAX_PER_TILE_SIZE = 2 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 1000;
const MAX_MAGIC_MISMATCH_RATIO = 0.05;

type TileFormat = 'png' | 'jpeg' | 'webp';

function detectTileFormat(buf: Buffer): TileFormat | null {
	if (buf.length >= 8 &&
		buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
		buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) {
		return 'png';
	}
	if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
		return 'jpeg';
	}
	if (buf.length >= 12 &&
		buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
		buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
		return 'webp';
	}
	return null;
}

function extensionMatchesFormat(ext: string, format: TileFormat): boolean {
	const e = ext.toLowerCase();
	if (format === 'png') return e === 'png';
	if (format === 'jpeg') return e === 'jpg' || e === 'jpeg';
	if (format === 'webp') return e === 'webp';
	return false;
}

interface TileBounds {
	minLat: number;
	maxLat: number;
	minLon: number;
	maxLon: number;
}

interface TileStats {
	tileCount: number;
	minZoom: number;
	maxZoom: number;
	bounds: TileBounds | null;
}

// Tile coordinate to lat/lon conversion functions
function tile2lon(x: number, z: number): number {
	return (x / Math.pow(2, z)) * 360 - 180;
}

function tile2lat(y: number, z: number): number {
	const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
	return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * Process an uploaded tile ZIP file
 */
export async function processTileUpload(
	layerId: string,
	zipPath: string,
	pb: PocketBase
): Promise<void> {
	const tilesDir = path.join(process.cwd(), 'data', 'tiles', layerId);

	try {
		// Update status to processing
		await pb.collection('map_layers').update(layerId, {
			status: 'processing',
			progress: 0
		});

		// Create tiles directory
		await mkdir(tilesDir, { recursive: true });

		// Extract ZIP file
		const uz = await getUnzipper();
		const directory = await uz.Open.file(zipPath);
		const { writeFile } = await import('fs/promises');

		if (directory.files.length > MAX_ENTRY_COUNT) {
			throw new Error(
				`Zip entry count ${directory.files.length} exceeds limit ${MAX_ENTRY_COUNT}`
			);
		}

		const totalUncompressed = directory.files.reduce(
			(sum, f) => sum + (f.uncompressedSize || 0),
			0
		);
		if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED) {
			throw new Error(
				`Total decompressed size ${totalUncompressed} exceeds limit ${MAX_TOTAL_UNCOMPRESSED}`
			);
		}

		const totalFiles = directory.files.length;
		let processedFiles = 0;
		let validTileCount = 0;
		let magicMismatchCount = 0;

		for (const file of directory.files) {
			if (file.type === 'File') {
				// Parse tile path: z/x/y.ext or {tilesetId}/z/x/y.ext
				const parts = file.path.split('/').filter(Boolean);
				let z: string, x: string, yWithExt: string;

				if (parts.length === 3) {
					[z, x, yWithExt] = parts;
				} else if (parts.length === 4) {
					[, z, x, yWithExt] = parts;
				} else {
					processedFiles++;
					continue;
				}

				if (!/^\d+$/.test(z) || !/^\d+$/.test(x)) {
					processedFiles++;
					continue;
				}

				const extMatch = yWithExt.match(/^(\d+)\.(png|jpg|jpeg|webp)$/i);
				if (!extMatch) {
					processedFiles++;
					continue;
				}
				const [, y, ext] = extMatch;

				// Per-tile size cap (check central directory metadata before decompressing)
				if ((file.uncompressedSize || 0) > MAX_PER_TILE_SIZE) {
					throw new Error(
						`Tile ${file.path} size ${file.uncompressedSize} exceeds per-tile limit ${MAX_PER_TILE_SIZE}`
					);
				}

				// Compression ratio check (zip bomb defense)
				if (file.compressedSize && file.uncompressedSize) {
					const ratio = file.uncompressedSize / file.compressedSize;
					if (ratio > MAX_COMPRESSION_RATIO) {
						throw new Error(
							`Tile ${file.path} compression ratio ${ratio.toFixed(0)}:1 exceeds limit ${MAX_COMPRESSION_RATIO}:1`
						);
					}
				}

				validTileCount++;
				const content = await file.buffer();

				// Magic-byte validation
				const detected = detectTileFormat(content);
				if (!detected || !extensionMatchesFormat(ext, detected)) {
					magicMismatchCount++;
					processedFiles++;
					continue;
				}

				const tileDir = path.join(tilesDir, z, x);
				await mkdir(tileDir, { recursive: true });
				const tilePath = path.join(tileDir, yWithExt);
				await writeFile(tilePath, content);
			}

			processedFiles++;
			const progress = Math.round((processedFiles / totalFiles) * 80);
			await pb.collection('map_layers').update(layerId, { progress });
		}

		if (validTileCount > 0 && magicMismatchCount / validTileCount > MAX_MAGIC_MISMATCH_RATIO) {
			throw new Error(
				`Too many tiles failed magic-byte validation: ${magicMismatchCount}/${validTileCount}`
			);
		}

		// Calculate tile statistics
		await pb.collection('map_layers').update(layerId, { progress: 85 });
		const stats = await calculateTileStats(tilesDir);

		// Get current config and update with detected zoom
		const layer = await pb.collection('map_layers').getOne(layerId);
		const config = (layer.config as UploadedSourceConfig) || {};

		// Generate tile URL pattern (use authenticated API endpoint)
		const tileUrl = `/api/tiles/${layerId}/{z}/{x}/{y}.${config.tile_format || 'png'}`;

		// Update layer with completed status
		await pb.collection('map_layers').update(layerId, {
			status: 'completed',
			progress: 100,
			url: tileUrl,
			tile_count: stats.tileCount,
			config: {
				...config,
				detected_min_zoom: stats.minZoom,
				detected_max_zoom: stats.maxZoom,
				bounds: stats.bounds
			}
		});

		// Clean up ZIP file
		await rm(zipPath, { force: true });
	} catch (err) {
		console.error('Tile processing error:', err);

		// Update status to failed
		await pb.collection('map_layers').update(layerId, {
			status: 'failed',
			error_message: err instanceof Error ? err.message : 'Processing failed'
		});

		// Clean up on failure
		try {
			await rm(tilesDir, { recursive: true, force: true });
			await rm(zipPath, { force: true });
		} catch {
			// Ignore cleanup errors
		}

		throw err;
	}
}

/**
 * Calculate statistics about extracted tiles including geographic bounds
 */
async function calculateTileStats(tilesDir: string): Promise<TileStats> {
	let tileCount = 0;
	let minZoom = Infinity;
	let maxZoom = -Infinity;

	// Track tile coordinates at the maximum zoom level for bounds calculation
	let boundsZoom = -1;
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;

	try {
		const zoomDirs = await readdir(tilesDir);

		for (const zDir of zoomDirs) {
			const z = parseInt(zDir, 10);
			if (isNaN(z)) continue;

			minZoom = Math.min(minZoom, z);
			maxZoom = Math.max(maxZoom, z);

			const zPath = path.join(tilesDir, zDir);
			const zStat = await stat(zPath);
			if (!zStat.isDirectory()) continue;

			const xDirs = await readdir(zPath);
			for (const xDir of xDirs) {
				const x = parseInt(xDir, 10);
				const xPath = path.join(zPath, xDir);
				const xStat = await stat(xPath);
				if (!xStat.isDirectory()) continue;

				const tiles = await readdir(xPath);
				const tileFiles = tiles.filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f));
				tileCount += tileFiles.length;

				// Track bounds at the highest zoom level (most precise)
				if (z >= boundsZoom && tileFiles.length > 0) {
					if (z > boundsZoom) {
						// Reset bounds for higher zoom
						boundsZoom = z;
						minX = Infinity;
						maxX = -Infinity;
						minY = Infinity;
						maxY = -Infinity;
					}

					if (!isNaN(x)) {
						minX = Math.min(minX, x);
						maxX = Math.max(maxX, x);
					}

					for (const tileFile of tileFiles) {
						const y = parseInt(tileFile.replace(/\.(png|jpg|jpeg|webp)$/i, ''), 10);
						if (!isNaN(y)) {
							minY = Math.min(minY, y);
							maxY = Math.max(maxY, y);
						}
					}
				}
			}
		}
	} catch (err) {
		console.error('Error calculating tile stats:', err);
	}

	// Calculate geographic bounds from tile coordinates
	let bounds: TileBounds | null = null;
	if (boundsZoom >= 0 && minX !== Infinity && maxX !== -Infinity && minY !== Infinity && maxY !== -Infinity) {
		bounds = {
			// West edge of leftmost tile
			minLon: tile2lon(minX, boundsZoom),
			// East edge of rightmost tile (next tile's west edge)
			maxLon: tile2lon(maxX + 1, boundsZoom),
			// North edge of topmost tile (y increases southward in TMS)
			maxLat: tile2lat(minY, boundsZoom),
			// South edge of bottommost tile
			minLat: tile2lat(maxY + 1, boundsZoom)
		};
	}

	return {
		tileCount,
		minZoom: minZoom === Infinity ? 0 : minZoom,
		maxZoom: maxZoom === -Infinity ? 0 : maxZoom,
		bounds
	};
}
