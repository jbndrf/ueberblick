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

/**
 * Project startup defaults: the initial state a new participant sees the first
 * time they open this project's map. Persisted inside `projects.settings`
 * alongside `map_defaults` and `display_name`.
 *
 * Application is gated client-side by a `localStorage` marker keyed by
 * project id, so subsequent visits never re-apply these values -- the
 * participant's own toggles win from that point on.
 */
export const projectStartupDefaultsSchema = z.object({
	base_layer_id: z.string().optional(),
	overlay_layer_ids: z.array(z.string()).default([]),
	workflow_ids_visible: z.union([z.array(z.string()), z.literal('all')]).default('all'),
	enabled_features: z.array(z.string()).default([]),
	// Per-workflow default visibility for filterable-tag values (stage ids or
	// field option values). Map: workflowId -> array of values that should be
	// ON at first visit. Workflows not present here fall back to "all on".
	visible_tag_values: z.record(z.string(), z.array(z.string())).default({})
});

/**
 * A single admin-curated preset. Participants load one via the "Preset laden"
 * action, which copies the `config` into a new user-owned
 * `participant_tool_configs` row -- edits, renames and deletes then follow the
 * normal saved-view flow.
 */
export const adminPresetSchema = z.object({
	id: z.string().min(1),
	tool_key: z.literal('filter.saved_views'),
	name: z.string().min(1).max(200),
	sort_order: z.number().int().default(0),
	config: z.record(z.string(), z.unknown())
});

export type ProjectStartupDefaults = z.infer<typeof projectStartupDefaultsSchema>;
export type AdminPreset = z.infer<typeof adminPresetSchema>;

export type MapLayerConfigSchema = typeof mapLayerConfigSchema;
export type MapLayerSchema = typeof mapLayerSchema;
export type ProjectMapDefaultsSchema = typeof projectMapDefaultsSchema;
