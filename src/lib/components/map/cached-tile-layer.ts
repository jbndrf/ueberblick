/**
 * Custom Leaflet TileLayer that serves tiles from IndexedDB cache when available.
 *
 * Usage:
 *   const layer = createCachedTileLayer(layerId, urlTemplate, options);
 *   layer.addTo(map);
 *
 * When offline or when tiles are cached, serves from IndexedDB.
 * Falls back to network when online and tile not cached.
 */

import type L from 'leaflet';
import { getTile } from '$lib/participant-state/tile-cache.svelte';
type TileCoords = { x: number; y: number; z: number };
type DoneCallback = (error: Error | null, tile: HTMLImageElement) => void;

/**
 * Create a cached tile layer for a specific map layer.
 *
 * In local-first mode, always tries IndexedDB cache first.
 * Falls back to network when online and tile is not cached.
 * Uses navigator.onLine for network detection (no gateway dependency).
 *
 * @param layerId - The map_layers.id for this layer (used as cache key)
 * @param urlTemplate - The tile URL template (e.g., "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png")
 * @param options - Standard Leaflet TileLayer options
 * @param leaflet - Leaflet instance (pass L from your component)
 * @returns A Leaflet TileLayer that uses IndexedDB cache
 */
export function createCachedTileLayer(
	layerId: string,
	urlTemplate: string,
	options: L.TileLayerOptions | undefined,
	leaflet: typeof L
): L.TileLayer {
	// Create extended tile layer class
	const CachedTileLayer = leaflet.TileLayer.extend({
		// Override createTile to check cache first
		createTile: function (coords: TileCoords, done: DoneCallback): HTMLImageElement {
			const tile = document.createElement('img');
			const self = this as L.TileLayer & {
				getTileUrl: (coords: TileCoords) => string;
			};

			tile.alt = '';
			tile.setAttribute('role', 'presentation');

			// Try to load from cache first
			getTile(layerId, coords.z, coords.x, coords.y)
				.then((cachedBlob) => {
					if (cachedBlob) {
						// Serve from cache
						const url = URL.createObjectURL(cachedBlob);
						tile.onload = () => {
							URL.revokeObjectURL(url);
							done(null, tile);
						};
						tile.onerror = () => {
							URL.revokeObjectURL(url);
							// Cache corrupted - try network if online
							if (navigator.onLine) {
								loadFromNetwork(self, tile, coords, done);
							} else {
								done(new Error('Tile corrupted and offline'), tile);
							}
						};
						tile.src = url;
					} else {
						// Not in cache
						if (navigator.onLine) {
							// Online: load from network
							loadFromNetwork(self, tile, coords, done);
						} else {
							// Offline: fail gracefully
							console.log(
								'[CachedTileLayer] Tile not cached, offline:',
								`${layerId}/${coords.z}/${coords.x}/${coords.y}`
							);
							done(new Error('Tile not cached and offline'), tile);
						}
					}
				})
				.catch((error) => {
					// Log actual database errors for debugging
					console.error(
						'[CachedTileLayer] Database error for tile',
						`${layerId}/${coords.z}/${coords.x}/${coords.y}:`,
						error
					);
					if (navigator.onLine) {
						loadFromNetwork(self, tile, coords, done);
					} else {
						done(new Error('IndexedDB error and offline'), tile);
					}
				});

			return tile;
		}
	}) as new (urlTemplate: string, options?: L.TileLayerOptions) => L.TileLayer;

	return new CachedTileLayer(urlTemplate, options);
}

/**
 * Load tile from network (standard behavior)
 */
function loadFromNetwork(
	layer: L.TileLayer & { getTileUrl: (coords: TileCoords) => string },
	tile: HTMLImageElement,
	coords: TileCoords,
	done: DoneCallback
): void {
	const url = layer.getTileUrl(coords);
	console.log('[CachedTileLayer] Loading tile from network:', url);

	tile.onload = () => {
		console.log('[CachedTileLayer] Tile loaded successfully:', url);
		done(null, tile);
	};
	tile.onerror = (e) => {
		console.error('[CachedTileLayer] Failed to load tile:', url, e);
		done(new Error(`Failed to load tile: ${url}`), tile);
	};
	tile.crossOrigin = 'anonymous';
	tile.src = url;
}

/**
 * Create multiple cached tile layers from map layers
 *
 * @param layers - Array of map layers with id, url, and config
 * @param leaflet - Leaflet instance
 * @returns Map of layerId -> CachedTileLayer
 */
export function createCachedTileLayers(
	layers: Array<{
		id: string;
		url: string;
		config?: {
			subdomains?: string[];
			attribution?: string;
			maxZoom?: number;
			minZoom?: number;
		};
	}>,
	leaflet: typeof L
): Map<string, L.TileLayer> {
	const result = new Map<string, L.TileLayer>();

	for (const layer of layers) {
		const options: L.TileLayerOptions = {
			subdomains: layer.config?.subdomains,
			attribution: layer.config?.attribution,
			maxZoom: layer.config?.maxZoom ?? 19,
			minZoom: layer.config?.minZoom ?? 0,
			crossOrigin: 'anonymous'
		};

		try {
			const tileLayer = createCachedTileLayer(layer.id, layer.url, options, leaflet);
			result.set(layer.id, tileLayer);
		} catch (error) {
			console.warn(`Failed to create cached layer for ${layer.id}:`, error);
		}
	}

	return result;
}
