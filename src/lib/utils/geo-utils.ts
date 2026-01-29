/**
 * Geo utilities for tile calculations
 *
 * Uses turf.js for geometry operations (only imported on admin/server).
 * Provides functions for polygon-tile intersection math.
 */

import * as turf from '@turf/turf';
import type { Feature, Polygon, MultiPolygon, BBox } from 'geojson';

// =============================================================================
// Types
// =============================================================================

export interface TileCoord {
	z: number;
	x: number;
	y: number;
}

// =============================================================================
// Tile Coordinate Conversions (standard Web Mercator math)
// =============================================================================

/**
 * Convert longitude to tile X coordinate
 */
export function lon2tile(lon: number, zoom: number): number {
	return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

/**
 * Convert latitude to tile Y coordinate
 */
export function lat2tile(lat: number, zoom: number): number {
	return Math.floor(
		((1 -
			Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) /
			2) *
			Math.pow(2, zoom)
	);
}

/**
 * Convert tile X coordinate to longitude (west edge)
 */
export function tile2lon(x: number, zoom: number): number {
	return (x / Math.pow(2, zoom)) * 360 - 180;
}

/**
 * Convert tile Y coordinate to latitude (north edge)
 */
export function tile2lat(y: number, zoom: number): number {
	const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
	return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

// =============================================================================
// Tile Bounds
// =============================================================================

/**
 * Get tile bounds as a GeoJSON polygon
 */
export function tileToBounds(z: number, x: number, y: number): Feature<Polygon> {
	const west = tile2lon(x, z);
	const east = tile2lon(x + 1, z);
	const north = tile2lat(y, z);
	const south = tile2lat(y + 1, z);

	return turf.polygon([
		[
			[west, north],
			[east, north],
			[east, south],
			[west, south],
			[west, north]
		]
	]);
}

/**
 * Check if tile intersects a polygon region
 */
export function tileIntersectsPolygon(
	z: number,
	x: number,
	y: number,
	polygon: Feature<Polygon | MultiPolygon> | Polygon | MultiPolygon
): boolean {
	const tilePoly = tileToBounds(z, x, y);
	return turf.booleanIntersects(tilePoly, polygon);
}

// =============================================================================
// Tile Generation
// =============================================================================

/**
 * Get all tiles intersecting a polygon for given zoom levels
 *
 * This is the core function for determining which tiles need to be included
 * in an offline package.
 */
export function getTilesForPolygon(
	polygon: Feature<Polygon | MultiPolygon> | Polygon | MultiPolygon,
	zoomLevels: number[]
): TileCoord[] {
	const bbox = turf.bbox(polygon);
	const tiles: TileCoord[] = [];

	for (const z of zoomLevels) {
		const minX = lon2tile(bbox[0], z);
		const maxX = lon2tile(bbox[2], z);
		// Note: Y is inverted in tile coordinates (north = smaller Y)
		const minY = lat2tile(bbox[3], z);
		const maxY = lat2tile(bbox[1], z);

		for (let x = minX; x <= maxX; x++) {
			for (let y = minY; y <= maxY; y++) {
				if (tileIntersectsPolygon(z, x, y, polygon)) {
					tiles.push({ z, x, y });
				}
			}
		}
	}

	return tiles;
}

/**
 * Get tiles for a bounding box (simpler, no polygon intersection check)
 */
export function getTilesForBbox(bbox: BBox, zoomLevels: number[]): TileCoord[] {
	const tiles: TileCoord[] = [];

	for (const z of zoomLevels) {
		const minX = lon2tile(bbox[0], z);
		const maxX = lon2tile(bbox[2], z);
		const minY = lat2tile(bbox[3], z);
		const maxY = lat2tile(bbox[1], z);

		for (let x = minX; x <= maxX; x++) {
			for (let y = minY; y <= maxY; y++) {
				tiles.push({ z, x, y });
			}
		}
	}

	return tiles;
}

// =============================================================================
// Area Calculations
// =============================================================================

/**
 * Calculate polygon area in square kilometers
 */
export function calculatePolygonAreaKm2(
	polygon: Feature<Polygon | MultiPolygon> | Polygon | MultiPolygon
): number {
	return turf.area(polygon) / 1_000_000; // m2 to km2
}

/**
 * Estimate tile count for UI feedback (fast approximation)
 *
 * Uses bounding box instead of polygon intersection for speed.
 * Actual count may be lower due to polygon shape.
 */
export function estimateTileCount(
	polygon: Feature<Polygon | MultiPolygon> | Polygon | MultiPolygon,
	zoomLevels: number[]
): number {
	const bbox = turf.bbox(polygon);
	let count = 0;

	for (const z of zoomLevels) {
		const minX = lon2tile(bbox[0], z);
		const maxX = lon2tile(bbox[2], z);
		const minY = lat2tile(bbox[3], z);
		const maxY = lat2tile(bbox[1], z);

		count += (maxX - minX + 1) * (maxY - minY + 1);
	}

	return count;
}

/**
 * Estimate download size in MB
 * Average tile size is ~15KB for standard map tiles
 */
export function estimateDownloadSize(tileCount: number, sourceCount: number = 1): number {
	const avgTileSizeKB = 15;
	return (tileCount * sourceCount * avgTileSizeKB) / 1024; // MB
}

// =============================================================================
// Polygon Utilities
// =============================================================================

/**
 * Get the bounding box of a polygon
 */
export function getPolygonBbox(
	polygon: Feature<Polygon | MultiPolygon> | Polygon | MultiPolygon
): BBox {
	return turf.bbox(polygon);
}

/**
 * Get the center point of a polygon
 */
export function getPolygonCenter(
	polygon: Feature<Polygon | MultiPolygon> | Polygon | MultiPolygon
): { lat: number; lng: number } {
	const center = turf.center(polygon);
	return {
		lat: center.geometry.coordinates[1],
		lng: center.geometry.coordinates[0]
	};
}

/**
 * Simplify a polygon (reduce number of points)
 * Useful for large polygons to reduce storage size
 */
export function simplifyPolygon(
	polygon: Feature<Polygon | MultiPolygon> | Polygon | MultiPolygon,
	tolerance: number = 0.001
): Feature<Polygon | MultiPolygon> {
	return turf.simplify(polygon as Feature<Polygon | MultiPolygon>, { tolerance });
}

/**
 * Validate that a GeoJSON object is a valid polygon
 */
export function isValidPolygon(geojson: unknown): geojson is Feature<Polygon | MultiPolygon> {
	if (!geojson || typeof geojson !== 'object') return false;

	const obj = geojson as Record<string, unknown>;

	// Direct Polygon or MultiPolygon geometry
	if (obj.type === 'Polygon' || obj.type === 'MultiPolygon') {
		return Array.isArray(obj.coordinates);
	}

	// Feature with Polygon or MultiPolygon geometry
	if (obj.type === 'Feature' && obj.geometry) {
		const geom = obj.geometry as Record<string, unknown>;
		return (
			(geom.type === 'Polygon' || geom.type === 'MultiPolygon') && Array.isArray(geom.coordinates)
		);
	}

	return false;
}

// =============================================================================
// Bounds Conversion (for region selector)
// =============================================================================

/**
 * Convert a bounding box (Leaflet-style or array) to a GeoJSON Polygon
 * Accepts either [west, south, east, north] array or {_southWest, _northEast} object
 */
export function boundsToPolygon(
	bounds:
		| [number, number, number, number]
		| { _southWest: { lat: number; lng: number }; _northEast: { lat: number; lng: number } }
): Feature<Polygon> {
	let west: number, south: number, east: number, north: number;

	if (Array.isArray(bounds)) {
		[west, south, east, north] = bounds;
	} else {
		west = bounds._southWest.lng;
		south = bounds._southWest.lat;
		east = bounds._northEast.lng;
		north = bounds._northEast.lat;
	}

	return turf.bboxPolygon([west, south, east, north]);
}

/**
 * Format area in human-readable string
 */
export function formatArea(areaKm2: number): string {
	if (areaKm2 < 0.01) {
		return `${(areaKm2 * 1_000_000).toFixed(0)} m2`;
	}
	if (areaKm2 < 1) {
		return `${(areaKm2 * 100).toFixed(1)} ha`;
	}
	if (areaKm2 < 100) {
		return `${areaKm2.toFixed(2)} km2`;
	}
	return `${areaKm2.toFixed(0)} km2`;
}

/**
 * Format tile count with appropriate units
 */
export function formatTileCount(count: number): string {
	if (count < 1000) {
		return `~${count}`;
	}
	if (count < 10000) {
		return `~${(count / 1000).toFixed(1)}k`;
	}
	return `~${Math.round(count / 1000)}k`;
}
