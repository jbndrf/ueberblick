/**
 * Map layer and project map defaults schemas
 */

import { z } from 'zod';

/**
 * Schema for map_layers.config JSON field
 */
export const mapLayerConfigSchema = z.object({
	opacity: z.number().min(0).max(1).default(1),
	min_zoom: z.number().int().min(0).max(22).optional(),
	max_zoom: z.number().int().min(0).max(22).optional(),
	// Base layer only - view defaults
	default_zoom: z.number().int().min(0).max(22).optional(),
	default_center: z
		.object({
			lat: z.number().min(-90).max(90),
			lng: z.number().min(-180).max(180)
		})
		.optional()
});

/**
 * Map layer form schema (source fields merged in)
 */
export const mapLayerSchema = z.object({
	name: z.string().min(1, 'Layer name is required').max(255),
	source_type: z.enum(['tile', 'wms', 'uploaded', 'preset', 'geojson']).default('preset'),
	layer_type: z.enum(['base', 'overlay']).default('overlay'),
	url: z.string().max(2000).optional().nullable(),
	display_order: z.number().int().min(0).default(0),
	visible_to_roles: z.array(z.string()).default([]),
	is_active: z.boolean().default(true),
	config: mapLayerConfigSchema.default({ opacity: 1 })
});

/**
 * Project map defaults fallback schema (stored in projects.settings.map_defaults)
 */
export const projectMapDefaultsSchema = z.object({
	zoom: z.number().int().min(0).max(22).default(10),
	min_zoom: z.number().int().min(0).max(22).default(1),
	max_zoom: z.number().int().min(0).max(22).default(19),
	center: z
		.object({
			lat: z.number().min(-90).max(90).default(51.1657),
			lng: z.number().min(-180).max(180).default(10.4515)
		})
		.default({ lat: 51.1657, lng: 10.4515 })
});

export type MapLayerConfigSchema = typeof mapLayerConfigSchema;
export type MapLayerSchema = typeof mapLayerSchema;
export type ProjectMapDefaultsSchema = typeof projectMapDefaultsSchema;
