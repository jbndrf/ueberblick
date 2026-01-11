/**
 * Type definitions for map sources (user-scoped map data library)
 */

// Source types
export type MapSourceType = 'tile' | 'wms' | 'uploaded' | 'preset' | 'geojson';

// Processing status for uploaded sources
export type MapSourceStatus = 'pending' | 'processing' | 'completed' | 'failed';

// Tile format types
export type TileFormat = 'png' | 'jpg' | 'webp';

// Config for tile sources (URL-based)
export interface TileSourceConfig {
	attribution?: string;
	tile_format?: TileFormat;
	detected_min_zoom?: number;
	detected_max_zoom?: number;
}

// Config for uploaded tile sources
export interface UploadedSourceConfig {
	attribution?: string;
	tile_format: TileFormat;
	detected_min_zoom?: number;
	detected_max_zoom?: number;
}

// Config for WMS sources
export interface WmsSourceConfig {
	attribution?: string;
	layers: string;
	format?: string;
	transparent?: boolean;
	version?: string;
}

// Config for GeoJSON sources
export interface GeoJsonSourceConfig {
	attribution?: string;
	style?: Record<string, unknown>;
	data?: GeoJSON.FeatureCollection | GeoJSON.Feature | string; // inline data or URL
}

// Union of all source configs
export type MapSourceConfig = TileSourceConfig | UploadedSourceConfig | WmsSourceConfig | GeoJsonSourceConfig;

// Database record for map_sources collection
export interface MapSource {
	id: string;
	owner_id: string;
	name: string;
	source_type: MapSourceType;
	url: string | null;
	config: MapSourceConfig | null;
	// Upload processing fields
	status: MapSourceStatus | null;
	progress: number;
	error_message: string | null;
	tile_count: number | null;
	created: string;
	updated: string;
}

// Preset tile sources that can be added with one click
export interface PresetSource {
	id: string;
	name: string;
	url: string;
	attribution: string;
	minZoom?: number;
	maxZoom?: number;
}

// Common preset sources
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
	}
];
