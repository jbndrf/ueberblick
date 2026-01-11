/**
 * Type definitions for map layers (project-scoped display configuration)
 */

// Layer config - display settings stored in map_layers.config JSON field
export interface MapLayerConfig {
	opacity?: number; // 0-1
	min_zoom?: number;
	max_zoom?: number;
	// Base layer only - view defaults
	default_zoom?: number;
	default_center?: {
		lat: number;
		lng: number;
	};
}

// Database record for map_layers collection
export interface MapLayer {
	id: string;
	project_id: string;
	source_id: string; // relation to map_sources
	name: string;
	display_order: number | null;
	visible_to_roles: string[]; // Multi-relation to roles
	is_base_layer: boolean;
	is_active: boolean;
	config: MapLayerConfig | null;
	bounds: string | null; // WKT POLYGON geometry
	created: string;
	updated: string;
}

// Expanded layer with source data included
export interface MapLayerWithSource extends MapLayer {
	expand?: {
		source_id?: import('./map-sources').MapSource;
	};
}

// Project map defaults fallback (stored in projects.settings)
export interface ProjectMapDefaults {
	zoom?: number;
	center?: {
		lat: number;
		lng: number;
	};
}
