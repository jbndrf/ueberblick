/**
 * Custom Leaflet TileLayer that serves tiles from IndexedDB cache when available.
 *
 * Usage:
 *   const layer = createCachedTileLayer(sourceId, urlTemplate, options);
 *   layer.addTo(map);
 *
 * When offline or when tiles are cached, serves from IndexedDB.
 * Falls back to network when online and tile not cached.
 */

import type L from 'leaflet';
import { getTile } from '$lib/participant-state/tile-cache.svelte';
import type { ParticipantGateway } from '$lib/participant-state/gateway.svelte';

type TileCoords = { x: number; y: number; z: number };
type DoneCallback = (error: Error | null, tile: HTMLImageElement) => void;

/**
 * Create a cached tile layer for a specific source
 *
 * @param sourceId - The map_sources.id for this layer (used as cache key)
 * @param urlTemplate - The tile URL template (e.g., "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png")
 * @param options - Standard Leaflet TileLayer options
 * @param leaflet - Leaflet instance (pass L from your component)
 * @param gateway - Optional gateway to check online/offline state
 * @returns A Leaflet TileLayer that uses IndexedDB cache
 */
export function createCachedTileLayer(
	sourceId: string,
	urlTemplate: string,
	options: L.TileLayerOptions | undefined,
	leaflet: typeof L,
	gateway?: ParticipantGateway | null
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
			getTile(sourceId, coords.z, coords.x, coords.y)
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
							// Cache corrupted - only try network if online
							if (!gateway || gateway.isOnline) {
								loadFromNetwork(self, tile, coords, done);
							} else {
								done(new Error('Tile corrupted and offline'), tile);
							}
						};
						tile.src = url;
					} else {
						// Not in cache
						if (!gateway || gateway.isOnline) {
							// Online: load from network
							loadFromNetwork(self, tile, coords, done);
						} else {
							// Offline: fail gracefully
							console.log(
								'[CachedTileLayer] Tile not cached, offline mode:',
								`${sourceId}/${coords.z}/${coords.x}/${coords.y}`
							);
							done(new Error('Tile not cached and offline'), tile);
						}
					}
				})
				.catch(() => {
					// IndexedDB error - only fall back to network if online
					if (!gateway || gateway.isOnline) {
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
 * Create multiple cached tile layers from map sources
 *
 * @param sources - Array of map sources with id, url, and config
 * @param leaflet - Leaflet instance
 * @param gateway - Optional gateway to check online/offline state
 * @returns Map of sourceId -> CachedTileLayer
 */
export function createCachedTileLayers(
	sources: Array<{
		id: string;
		url: string;
		config?: {
			subdomains?: string[];
			attribution?: string;
			maxZoom?: number;
			minZoom?: number;
		};
	}>,
	leaflet: typeof L,
	gateway?: ParticipantGateway | null
): Map<string, L.TileLayer> {
	const layers = new Map<string, L.TileLayer>();

	for (const source of sources) {
		const options: L.TileLayerOptions = {
			subdomains: source.config?.subdomains,
			attribution: source.config?.attribution,
			maxZoom: source.config?.maxZoom ?? 19,
			minZoom: source.config?.minZoom ?? 0,
			crossOrigin: 'anonymous'
		};

		try {
			const layer = createCachedTileLayer(source.id, source.url, options, leaflet, gateway);
			layers.set(source.id, layer);
		} catch (error) {
			console.warn(`Failed to create cached layer for source ${source.id}:`, error);
		}
	}

	return layers;
}
