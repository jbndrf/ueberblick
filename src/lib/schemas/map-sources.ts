/**
 * Map sources schemas (user-scoped map data library)
 */

import { z } from 'zod';

/**
 * Config schema for tile sources (URL-based)
 */
export const tileSourceConfigSchema = z.object({
	attribution: z.string().max(500).optional(),
	tile_format: z.enum(['png', 'jpg', 'webp']).optional(),
	detected_min_zoom: z.number().int().min(0).max(22).optional(),
	detected_max_zoom: z.number().int().min(0).max(22).optional()
});

/**
 * Config schema for uploaded tile sources
 */
export const uploadedSourceConfigSchema = z.object({
	attribution: z.string().max(500).optional(),
	tile_format: z.enum(['png', 'jpg', 'webp']),
	detected_min_zoom: z.number().int().min(0).max(22).optional(),
	detected_max_zoom: z.number().int().min(0).max(22).optional()
});

/**
 * Config schema for WMS sources
 */
export const wmsSourceConfigSchema = z.object({
	attribution: z.string().max(500).optional(),
	layers: z.string().min(1, 'WMS layers parameter is required'),
	format: z.string().optional(),
	transparent: z.boolean().optional(),
	version: z.string().optional()
});

/**
 * Config schema for GeoJSON sources
 */
export const geojsonSourceConfigSchema = z.object({
	attribution: z.string().max(500).optional(),
	style: z.record(z.string(), z.unknown()).optional(),
	data: z.union([z.string(), z.record(z.string(), z.unknown())]).optional() // URL or inline GeoJSON
});

/**
 * Schema for creating a tile source (URL-based)
 */
export const createTileSourceSchema = z.object({
	name: z.string().min(1, 'Name is required').max(255),
	url: z.string().min(1, 'URL is required').max(2000),
	config: tileSourceConfigSchema.default({})
});

/**
 * Schema for uploading tiles (ZIP file)
 */
export const createUploadedSourceSchema = z.object({
	name: z.string().min(1, 'Name is required').max(255),
	tile_format: z.enum(['png', 'jpg', 'webp'])
});

/**
 * Schema for creating a WMS source
 */
export const createWmsSourceSchema = z.object({
	name: z.string().min(1, 'Name is required').max(255),
	url: z.string().min(1, 'URL is required').max(2000),
	config: wmsSourceConfigSchema
});

/**
 * Schema for creating a GeoJSON source
 */
export const createGeojsonSourceSchema = z.object({
	name: z.string().min(1, 'Name is required').max(255),
	url: z.string().max(2000).optional(), // URL to GeoJSON file
	config: geojsonSourceConfigSchema.default({})
});

/**
 * Schema for adding a preset source
 */
export const addPresetSourceSchema = z.object({
	preset_id: z.string().min(1, 'Preset ID is required')
});

/**
 * Schema for updating a source
 */
export const updateSourceSchema = z.object({
	name: z.string().min(1, 'Name is required').max(255),
	url: z.string().max(2000).optional(),
	config: z.record(z.string(), z.unknown()).optional()
});

export type CreateTileSourceSchema = typeof createTileSourceSchema;
export type CreateUploadedSourceSchema = typeof createUploadedSourceSchema;
export type CreateWmsSourceSchema = typeof createWmsSourceSchema;
export type CreateGeojsonSourceSchema = typeof createGeojsonSourceSchema;
export type AddPresetSourceSchema = typeof addPresetSourceSchema;
export type UpdateSourceSchema = typeof updateSourceSchema;
