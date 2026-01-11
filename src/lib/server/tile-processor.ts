/**
 * Tile processor for handling uploaded ZIP files containing map tiles
 * Extracts tiles in z/x/y format and updates the source record
 */

import { mkdir, rm, readdir, stat, rename } from 'fs/promises';
import path from 'path';
import type PocketBase from 'pocketbase';
import type { UploadedSourceConfig } from '$lib/types/map-sources';

// Use dynamic import for unzipper to handle ESM/CJS
let unzipper: typeof import('unzipper') | null = null;

async function getUnzipper() {
	if (!unzipper) {
		unzipper = await import('unzipper');
	}
	return unzipper;
}

interface TileStats {
	tileCount: number;
	minZoom: number;
	maxZoom: number;
}

/**
 * Process an uploaded tile ZIP file
 */
export async function processTileUpload(
	sourceId: string,
	zipPath: string,
	pb: PocketBase
): Promise<void> {
	const tilesDir = path.join(process.cwd(), 'static', 'tiles', sourceId);

	try {
		// Update status to processing
		await pb.collection('map_sources').update(sourceId, {
			status: 'processing',
			progress: 0
		});

		// Create tiles directory
		await mkdir(tilesDir, { recursive: true });

		// Extract ZIP file
		const uz = await getUnzipper();
		const directory = await uz.Open.file(zipPath);
		const totalFiles = directory.files.length;
		let processedFiles = 0;

		for (const file of directory.files) {
			if (file.type === 'File') {
				// Parse tile path: z/x/y.ext or {tilesetId}/z/x/y.ext
				const parts = file.path.split('/').filter(Boolean);
				let z: string, x: string, yWithExt: string;

				if (parts.length === 3) {
					// z/x/y.ext format
					[z, x, yWithExt] = parts;
				} else if (parts.length === 4) {
					// {tilesetId}/z/x/y.ext format - skip tileset folder
					[, z, x, yWithExt] = parts;
				} else {
					continue; // Skip unknown format
				}

				// Validate it looks like tile coordinates
				if (!/^\d+$/.test(z) || !/^\d+$/.test(x)) {
					continue;
				}

				const y = yWithExt.replace(/\.(png|jpg|jpeg|webp)$/i, '');
				if (!/^\d+$/.test(y)) {
					continue;
				}

				// Create directory structure
				const tileDir = path.join(tilesDir, z, x);
				await mkdir(tileDir, { recursive: true });

				// Extract file
				const tilePath = path.join(tileDir, yWithExt);
				const content = await file.buffer();
				const { writeFile } = await import('fs/promises');
				await writeFile(tilePath, content);
			}

			processedFiles++;
			const progress = Math.round((processedFiles / totalFiles) * 80); // 0-80% for extraction
			await pb.collection('map_sources').update(sourceId, { progress });
		}

		// Calculate tile statistics
		await pb.collection('map_sources').update(sourceId, { progress: 85 });
		const stats = await calculateTileStats(tilesDir);

		// Get current config and update with detected zoom
		const source = await pb.collection('map_sources').getOne(sourceId);
		const config = (source.config as UploadedSourceConfig) || {};

		// Generate tile URL pattern
		const tileUrl = `/tiles/${sourceId}/{z}/{x}/{y}.${config.tile_format || 'png'}`;

		// Update source with completed status
		await pb.collection('map_sources').update(sourceId, {
			status: 'completed',
			progress: 100,
			url: tileUrl,
			tile_count: stats.tileCount,
			config: {
				...config,
				detected_min_zoom: stats.minZoom,
				detected_max_zoom: stats.maxZoom
			}
		});

		// Clean up ZIP file
		await rm(zipPath, { force: true });
	} catch (err) {
		console.error('Tile processing error:', err);

		// Update status to failed
		await pb.collection('map_sources').update(sourceId, {
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
 * Calculate statistics about extracted tiles
 */
async function calculateTileStats(tilesDir: string): Promise<TileStats> {
	let tileCount = 0;
	let minZoom = Infinity;
	let maxZoom = -Infinity;

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
				const xPath = path.join(zPath, xDir);
				const xStat = await stat(xPath);
				if (!xStat.isDirectory()) continue;

				const tiles = await readdir(xPath);
				tileCount += tiles.filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f)).length;
			}
		}
	} catch (err) {
		console.error('Error calculating tile stats:', err);
	}

	return {
		tileCount,
		minZoom: minZoom === Infinity ? 0 : minZoom,
		maxZoom: maxZoom === -Infinity ? 0 : maxZoom
	};
}
