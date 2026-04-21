<script lang="ts">
	import { onMount } from 'svelte';
	import type { Map as LeafletMap, Rectangle, Polygon as LPolygon, LatLng, LatLngBounds } from 'leaflet';
	import type { Feature, Polygon } from 'geojson';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Square, Pentagon, Trash2, Check, X } from '@lucide/svelte';
	import type { MapLayer } from '$lib/types/map-layer';
	import {
		boundsToPolygon,
		calculatePolygonAreaKm2,
		estimateTileCount,
		formatArea,
		formatTileCount
	} from '$lib/utils/geo-utils';
	import * as turf from '@turf/turf';

	type DrawMode = 'rectangle' | 'polygon';

	interface Props {
		open: boolean;
		mapLayers: MapLayer[];
		mapDefaults: { zoom: number; center: { lat: number; lng: number } };
		zoomMin: number;
		zoomMax: number;
		initialRegion?: Feature<Polygon> | null;
		onConfirm: (region: Feature<Polygon>) => void;
		onCancel: () => void;
	}

	let {
		open = $bindable(),
		mapLayers,
		mapDefaults,
		zoomMin,
		zoomMax,
		initialRegion = null,
		onConfirm,
		onCancel
	}: Props = $props();

	let mapContainer: HTMLDivElement | null = $state(null);
	let map: LeafletMap | null = $state(null);
	let L: typeof import('leaflet') | null = $state(null);

	// Drawing state
	let drawMode: DrawMode = $state('rectangle');
	let isDrawing = $state(false);
	let drawnRegion: Feature<Polygon> | null = $state(null);

	// Rectangle drawing
	let rectStartPoint: LatLng | null = $state(null);
	let rectPreview: Rectangle | null = $state(null);
	let drawnRect: Rectangle | null = $state(null);

	// Polygon drawing
	let polyPoints: LatLng[] = $state([]);
	let polyPreview: LPolygon | null = $state(null);
	let drawnPoly: LPolygon | null = $state(null);

	// Stats
	let areaKm2 = $derived(drawnRegion ? calculatePolygonAreaKm2(drawnRegion) : 0);
	let estimatedTiles = $derived(
		drawnRegion ? estimateTileCount(drawnRegion, range(zoomMin, zoomMax)) : 0
	);

	function range(start: number, end: number): number[] {
		return Array.from({ length: end - start + 1 }, (_, i) => start + i);
	}

	// Initialize map when dialog opens
	$effect(() => {
		if (open && mapContainer && !map) {
			initMap();
		}
	});

	// Cleanup when dialog closes
	$effect(() => {
		if (!open && map) {
			map.remove();
			map = null;
			clearDrawing();
		}
	});

	// Load initial region if provided
	$effect(() => {
		if (map && L && initialRegion && !drawnRegion) {
			drawnRegion = initialRegion;
			showRegionOnMap(initialRegion);
		}
	});

	// Update cursor based on drawing state
	$effect(() => {
		if (mapContainer) {
			if (drawnRegion) {
				mapContainer.classList.add('has-region');
			} else {
				mapContainer.classList.remove('has-region');
			}
		}
	});

	async function initMap() {
		L = await import('leaflet');

		if (!mapContainer) return;

		// Create map
		map = L.map(mapContainer, {
			center: [mapDefaults.center.lat, mapDefaults.center.lng],
			zoom: mapDefaults.zoom,
			zoomControl: true
		});

		// Add base layer from project layers or default OSM
		const baseLayer = mapLayers.find((l) => l.layer_type === 'base');

		if (baseLayer?.url) {
			const config = baseLayer.config as Record<string, unknown> | undefined;
			const attribution = (config?.attribution as string) || '';

			if (baseLayer.source_type === 'wms') {
				L.tileLayer.wms(baseLayer.url, {
					layers: (config?.layers as string) || '',
					format: (config?.format as string) || 'image/png',
					transparent: (config?.transparent as boolean) ?? true,
					version: (config?.version as string) || '1.1.1',
					attribution,
					maxZoom: 19
				}).addTo(map);
			} else {
				L.tileLayer(baseLayer.url, {
					attribution,
					maxZoom: 19
				}).addTo(map);
			}
		} else {
			// Fallback to OSM
			L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				attribution: '&copy; OpenStreetMap contributors',
				maxZoom: 19
			}).addTo(map);
		}

		// Set up drawing handlers
		setupDrawingHandlers();

		// Fix map size after render
		setTimeout(() => map?.invalidateSize(), 100);
	}

	function setupDrawingHandlers() {
		if (!map || !L) return;

		map.on('mousedown', handleMouseDown);
		map.on('mousemove', handleMouseMove);
		map.on('mouseup', handleMouseUp);
		map.on('click', handleClick);
		map.on('dblclick', handleDoubleClick);

		// Disable double-click zoom when drawing polygons
		map.doubleClickZoom.disable();
	}

	function handleMouseDown(e: L.LeafletMouseEvent) {
		if (drawMode !== 'rectangle' || drawnRegion) return;

		isDrawing = true;
		rectStartPoint = e.latlng;

		// Disable map drag while drawing
		map?.dragging.disable();
	}

	function handleMouseMove(e: L.LeafletMouseEvent) {
		if (!L || !map) return;

		if (drawMode === 'rectangle' && isDrawing && rectStartPoint) {
			// Update rectangle preview
			const bounds = L.latLngBounds(rectStartPoint, e.latlng);

			if (rectPreview) {
				rectPreview.setBounds(bounds);
			} else {
				rectPreview = L.rectangle(bounds, {
					color: '#3b82f6',
					weight: 2,
					fillOpacity: 0.2,
					dashArray: '5, 5'
				}).addTo(map);
			}
		}

		if (drawMode === 'polygon' && polyPoints.length > 0 && !drawnRegion) {
			// Update polygon preview with current mouse position
			const previewPoints = [...polyPoints, e.latlng];

			if (polyPreview) {
				polyPreview.setLatLngs(previewPoints);
			} else {
				polyPreview = L.polygon(previewPoints, {
					color: '#3b82f6',
					weight: 2,
					fillOpacity: 0.2,
					dashArray: '5, 5'
				}).addTo(map);
			}
		}
	}

	function handleMouseUp(e: L.LeafletMouseEvent) {
		if (!L || !map) return;

		if (drawMode === 'rectangle' && isDrawing && rectStartPoint) {
			isDrawing = false;
			map.dragging.enable();

			const bounds = L.latLngBounds(rectStartPoint, e.latlng);

			// Check if bounds are valid (not just a click)
			if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
				// Just a click, not a drag
				if (rectPreview) {
					rectPreview.remove();
					rectPreview = null;
				}
				rectStartPoint = null;
				return;
			}

			// Remove preview
			if (rectPreview) {
				rectPreview.remove();
				rectPreview = null;
			}

			// Create final rectangle
			drawnRect = L.rectangle(bounds, {
				color: '#3b82f6',
				weight: 2,
				fillOpacity: 0.3
			}).addTo(map);

			// Convert to GeoJSON
			drawnRegion = boundsToPolygon(bounds as unknown as { _southWest: { lat: number; lng: number }; _northEast: { lat: number; lng: number } });

			rectStartPoint = null;
		}
	}

	function handleClick(e: L.LeafletMouseEvent) {
		if (!L || !map || drawMode !== 'polygon' || drawnRegion) return;

		polyPoints = [...polyPoints, e.latlng];
	}

	function handleDoubleClick(e: L.LeafletMouseEvent) {
		if (!L || !map || drawMode !== 'polygon' || drawnRegion) return;
		if (polyPoints.length < 3) return;

		// Finalize polygon
		if (polyPreview) {
			polyPreview.remove();
			polyPreview = null;
		}

		// Create final polygon
		drawnPoly = L.polygon(polyPoints, {
			color: '#3b82f6',
			weight: 2,
			fillOpacity: 0.3
		}).addTo(map);

		// Convert to GeoJSON
		const coords = polyPoints.map((p) => [p.lng, p.lat]);
		coords.push(coords[0]); // Close the ring
		drawnRegion = turf.polygon([coords]);

		polyPoints = [];
	}

	function showRegionOnMap(region: Feature<Polygon>) {
		if (!L || !map) return;

		// Convert GeoJSON to Leaflet coordinates
		const coords = region.geometry.coordinates[0];
		const latLngs = coords.map((c) => L!.latLng(c[1], c[0]));

		drawnPoly = L.polygon(latLngs, {
			color: '#3b82f6',
			weight: 2,
			fillOpacity: 0.3
		}).addTo(map);

		// Fit map to region
		map.fitBounds(drawnPoly.getBounds(), { padding: [20, 20] });
	}

	function clearDrawing() {
		if (drawnRect) {
			drawnRect.remove();
			drawnRect = null;
		}
		if (drawnPoly) {
			drawnPoly.remove();
			drawnPoly = null;
		}
		if (rectPreview) {
			rectPreview.remove();
			rectPreview = null;
		}
		if (polyPreview) {
			polyPreview.remove();
			polyPreview = null;
		}
		drawnRegion = null;
		rectStartPoint = null;
		polyPoints = [];
		isDrawing = false;
	}

	function switchMode(mode: DrawMode) {
		if (drawnRegion) return; // Don't switch if already drawn
		drawMode = mode;
		// Clear any in-progress drawing
		polyPoints = [];
		if (polyPreview) {
			polyPreview.remove();
			polyPreview = null;
		}
	}

	function handleConfirm() {
		if (drawnRegion) {
			onConfirm(drawnRegion);
		}
	}

	function handleCancel() {
		clearDrawing();
		onCancel();
	}
</script>

<Dialog.Root bind:open onOpenChange={(o) => !o && handleCancel()}>
	<Dialog.Content class="max-w-4xl h-[80vh] flex flex-col p-0">
		<Dialog.Header class="px-6 pt-6 pb-4 border-b shrink-0">
			<div class="flex items-center justify-between">
				<div>
					<Dialog.Title>Select Package Region</Dialog.Title>
					<Dialog.Description>
						{#if drawnRegion}
							Region selected - click Confirm to use this region
						{:else if drawMode === 'rectangle'}
							Click and drag on the map to draw a rectangle
						{:else}
							Click to add vertices, double-click to finish
						{/if}
					</Dialog.Description>
				</div>

				<!-- Stats panel -->
				{#if drawnRegion}
					<div class="text-sm text-right">
						<div class="font-medium">{formatArea(areaKm2)}</div>
						<div class="text-muted-foreground">{formatTileCount(estimatedTiles)} tiles</div>
					</div>
				{/if}
			</div>

			<!-- Mode toggle -->
			<div class="flex items-center gap-2 mt-4">
				<Button
					variant={drawMode === 'rectangle' ? 'default' : 'outline'}
					size="sm"
					onclick={() => switchMode('rectangle')}
					disabled={!!drawnRegion}
				>
					<Square class="h-4 w-4 mr-1" />
					Rectangle
				</Button>
				<Button
					variant={drawMode === 'polygon' ? 'default' : 'outline'}
					size="sm"
					onclick={() => switchMode('polygon')}
					disabled={!!drawnRegion}
				>
					<Pentagon class="h-4 w-4 mr-1" />
					Polygon
				</Button>
				{#if drawnRegion}
					<Button variant="outline" size="sm" onclick={clearDrawing} class="ml-auto">
						<Trash2 class="h-4 w-4 mr-1" />
						Clear
					</Button>
				{/if}
			</div>
		</Dialog.Header>

		<!-- Map container -->
		<div class="flex-1 min-h-0 relative region-selector-map">
			<div bind:this={mapContainer} class="absolute inset-0" class:has-region={!!drawnRegion}></div>
		</div>

		<!-- Footer -->
		<div class="px-6 py-4 border-t flex items-center justify-end gap-2 shrink-0">
			<Button variant="outline" onclick={handleCancel}>
				<X class="h-4 w-4 mr-1" />
				Cancel
			</Button>
			<Button onclick={handleConfirm} disabled={!drawnRegion}>
				<Check class="h-4 w-4 mr-1" />
				Confirm
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>

<style>
	:global(.region-selector-map .leaflet-container) {
		cursor: crosshair;
	}
	:global(.region-selector-map .has-region.leaflet-container) {
		cursor: grab;
	}
</style>
