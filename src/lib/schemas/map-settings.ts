/**
 * Map settings form schemas
 */

import { z } from 'zod';

/**
 * Map view settings (center and zoom only)
 */
export const mapSettingsSchema = z.object({
	default_zoom: z.number().int().min(0).max(22).default(10),
	min_zoom: z.number().int().min(0).max(22).default(1),
	max_zoom: z.number().int().min(0).max(22).default(18),
	center_lat: z.number().min(-90).max(90).default(51.1657),
	center_lng: z.number().min(-180).max(180).default(10.4515)
});

/**
 * Schema for map_layers.config JSON field
 */
export const mapLayerConfigSchema = z.object({
	attribution: z.string().max(500).optional(),
	opacity: z.number().min(0).max(1).default(1),
	min_zoom: z.number().int().min(0).max(22).optional(),
	max_zoom: z.number().int().min(0).max(22).optional(),
	// WMS-specific
	wms_layers: z.string().optional(),
	wms_format: z.string().optional(),
	wms_transparent: z.boolean().optional(),
	// GeoJSON-specific
	style: z.record(z.unknown()).optional()
});

/**
 * Map layer form schema
 */
export const mapLayerSchema = z.object({
	name: z.string().min(1, 'Layer name is required').max(255),
	layer_type: z.enum(['tile', 'wms', 'geojson', 'custom']),
	url: z.string().max(2000).optional(),
	config: mapLayerConfigSchema.default({}),
	display_order: z.number().int().min(0).default(0),
	visible_to_roles: z.array(z.string()).default([]),
	is_base_layer: z.boolean().default(false),
	is_active: z.boolean().default(true)
});

export type MapSettingsSchema = typeof mapSettingsSchema;
export type MapLayerSchema = typeof mapLayerSchema;
