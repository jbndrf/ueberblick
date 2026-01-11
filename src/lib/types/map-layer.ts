/**
 * Type definitions for map layers and settings
 */

// Layer types supported by the system
export type LayerType = 'tile' | 'wms' | 'geojson' | 'custom';

// Config stored in map_layers.config JSON field
export interface MapLayerConfig {
	attribution?: string;
	opacity?: number;
	min_zoom?: number;
	max_zoom?: number;
	// WMS-specific
	wms_layers?: string;
	wms_format?: string;
	wms_transparent?: boolean;
	// GeoJSON-specific
	style?: Record<string, unknown>;
	// Additional properties
	[key: string]: unknown;
}

// Database record for map_layers collection
export interface MapLayer {
	id: string;
	project_id: string;
	name: string;
	layer_type: LayerType;
	url: string | null;
	config: MapLayerConfig | null;
	display_order: number | null;
	visible_to_roles: string[]; // Multi-relation to roles
	is_base_layer: boolean;
	is_active: boolean;
	bounds: string | null; // WKT POLYGON geometry
	created: string;
	updated: string;
}

// Config stored in map_settings.config JSON field (view settings only)
export interface MapSettingsConfig {
	default_zoom?: number;
	min_zoom?: number;
	max_zoom?: number;
	center_lat?: number;
	center_lng?: number;
}

// Database record for map_settings collection (one per project)
export interface MapSettings {
	id: string;
	project_id: string;
	config: MapSettingsConfig | null;
	default_center: string | null; // WKT POINT geometry (optional, for SpatiaLite queries)
	created: string;
	updated: string;
}
