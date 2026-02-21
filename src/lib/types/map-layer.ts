/**
 * Type definitions for map layers
 *
 * Since the merge, map_layers holds both display config AND source config.
 * No more map_sources collection or source_id relation.
 */

// =============================================================================
// Source types (formerly in map-sources.ts)
// =============================================================================

export type MapSourceType = 'tile' | 'wms' | 'uploaded' | 'preset' | 'geojson';
export type MapLayerType = 'base' | 'overlay';
export type MapSourceStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type TileFormat = 'png' | 'jpg' | 'webp';

// Source configs (stored in map_layers.config JSON field alongside display settings)
export interface TileSourceConfig {
	attribution?: string;
	tile_format?: TileFormat;
	detected_min_zoom?: number;
	detected_max_zoom?: number;
}

export interface UploadedSourceConfig {
	attribution?: string;
	tile_format: TileFormat;
	detected_min_zoom?: number;
	detected_max_zoom?: number;
}

export interface WmsSourceConfig {
	attribution?: string;
	layers: string;
	format?: string;
	transparent?: boolean;
	version?: string;
}

export interface GeoJsonSourceConfig {
	attribution?: string;
	style?: Record<string, unknown>;
	data?: GeoJSON.FeatureCollection | GeoJSON.Feature | string;
}

// =============================================================================
// Layer config (display settings, merged with source config in the JSON field)
// =============================================================================

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
	// Source-specific fields (inline)
	attribution?: string;
	tile_format?: TileFormat;
	detected_min_zoom?: number;
	detected_max_zoom?: number;
	// WMS
	layers?: string;
	format?: string;
	transparent?: boolean;
	version?: string;
	// GeoJSON
	style?: Record<string, unknown>;
	data?: GeoJSON.FeatureCollection | GeoJSON.Feature | string;
	// Bounds from uploaded tile processing
	bounds?: {
		minLat: number;
		maxLat: number;
		minLon: number;
		maxLon: number;
	};
}

// =============================================================================
// Database record
// =============================================================================

export interface MapLayer {
	id: string;
	project_id: string;
	name: string;
	// Source fields (formerly on map_sources)
	source_type: MapSourceType;
	layer_type: MapLayerType;
	url: string | null;
	status: MapSourceStatus | null;
	progress: number;
	error_message: string | null;
	tile_count: number | null;
	// Display fields
	display_order: number | null;
	visible_to_roles: string[];
	is_active: boolean;
	config: MapLayerConfig | null;
	bounds: string | null; // WKT POLYGON geometry (SpatiaLite)
	created: string;
	updated: string;
}

// =============================================================================
// Preset sources (formerly in map-sources.ts)
// =============================================================================

export interface PresetSource {
	id: string;
	name: string;
	url: string;
	attribution: string;
	minZoom?: number;
	maxZoom?: number;
	sourceType?: 'tile' | 'wms';
	// WMS-specific fields
	wmsLayers?: string;
	wmsFormat?: string;
	wmsTransparent?: boolean;
	wmsVersion?: string;
}

export const PRESET_SOURCES: PresetSource[] = [
	{
		id: 'osm',
		name: 'OpenStreetMap',
		url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
		attribution: 'OpenStreetMap contributors',
		minZoom: 0,
		maxZoom: 19
	},
	{
		id: 'osm-de',
		name: 'OpenStreetMap Germany',
		url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
		attribution: 'OpenStreetMap contributors',
		minZoom: 0,
		maxZoom: 18
	},
	{
		id: 'carto-light',
		name: 'CartoDB Positron (Light)',
		url: 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
		attribution: 'CartoDB',
		minZoom: 0,
		maxZoom: 20
	},
	{
		id: 'carto-dark',
		name: 'CartoDB Dark Matter',
		url: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
		attribution: 'CartoDB',
		minZoom: 0,
		maxZoom: 20
	},
	{
		id: 'esri-satellite',
		name: 'ESRI World Imagery',
		url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
		attribution: 'Esri, Maxar, Earthstar Geographics',
		minZoom: 0,
		maxZoom: 19
	},
	{
		id: 'nrw-dop',
		name: 'NRW Orthophoto (Satellite)',
		url: 'https://www.wms.nrw.de/geobasis/wms_nw_dop',
		attribution: 'Geobasis NRW',
		sourceType: 'wms',
		wmsLayers: 'nw_dop_rgb',
		wmsFormat: 'image/png',
		wmsTransparent: false,
		wmsVersion: '1.1.1',
		minZoom: 0,
		maxZoom: 20
	},
	{
		id: 'nrw-dtk',
		name: 'NRW Topographic Map',
		url: 'https://www.wms.nrw.de/geobasis/wms_nw_dtk',
		attribution: 'Geobasis NRW',
		sourceType: 'wms',
		wmsLayers: 'nw_dtk_col',
		wmsFormat: 'image/png',
		wmsTransparent: false,
		wmsVersion: '1.1.1',
		minZoom: 0,
		maxZoom: 20
	}
];

// =============================================================================
// Project map defaults
// =============================================================================

export interface ProjectMapDefaults {
	zoom?: number;
	center?: {
		lat: number;
		lng: number;
	};
}
