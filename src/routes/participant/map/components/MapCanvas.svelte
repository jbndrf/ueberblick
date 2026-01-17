<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { Map as LeafletMap, TileLayer, Marker as LeafletMarker } from 'leaflet';

	interface MapSource {
		id: string;
		url: string;
		source_type: string;
		config?: {
			attribution?: string;
			minZoom?: number;
			maxZoom?: number;
		};
	}

	interface MapLayer {
		id: string;
		name: string;
		is_base_layer: boolean;
		source_id: string;
		expand?: {
			source_id?: MapSource;
		};
	}

	interface MapSettings {
		center_lat?: number;
		center_lon?: number;
		default_zoom?: number;
		min_zoom?: number;
		max_zoom?: number;
	}

	interface IconStyle {
		size: number;
		color: string;
		borderWidth: number;
		borderColor: string;
		backgroundColor: string;
		shadow: boolean;
		shape: 'none' | 'pin';
	}

	interface IconConfig {
		type: 'svg';
		svgContent: string;
		style: IconStyle;
	}

	interface MarkerCategory {
		id: string;
		name: string;
		icon_config?: IconConfig;
	}

	interface MapMarker {
		id: string;
		title: string;
		description?: string;
		location?: { lat: number; lon: number };
		category_id: string;
		expand?: {
			category_id?: MarkerCategory;
		};
	}

	interface WorkflowDef {
		id: string;
		name: string;
		marker_color?: string;
		icon_config?: IconConfig;
	}

	interface WorkflowInstance {
		id: string;
		workflow_id: string;
		status: string;
		location?: { lat: number; lon: number };
		expand?: {
			workflow_id?: WorkflowDef;
		};
	}

	interface Props {
		layers: MapLayer[];
		activeBaseLayerId: string | null;
		activeOverlayIds: string[];
		mapSettings?: MapSettings | null;
		markers?: MapMarker[];
		visibleCategoryIds?: string[];
		workflowInstances?: WorkflowInstance[];
		visibleWorkflowIds?: string[];
		onMarkerClick?: (marker: MapMarker) => void;
		onWorkflowInstanceClick?: (instance: WorkflowInstance) => void;
		onMapReady?: (map: LeafletMap) => void;
		onMapClick?: () => void;
	}

	let {
		layers = [],
		activeBaseLayerId,
		activeOverlayIds = [],
		mapSettings,
		markers = [],
		visibleCategoryIds = [],
		workflowInstances = [],
		visibleWorkflowIds = [],
		onMarkerClick,
		onWorkflowInstanceClick,
		onMapReady,
		onMapClick
	}: Props = $props();

	// Click vs drag detection
	let mouseDownPos: { x: number; y: number } | null = null;
	const CLICK_THRESHOLD = 5;

	function handleMapMouseDown(e: MouseEvent | TouchEvent) {
		const pos = 'touches' in e ? e.touches[0] : e;
		mouseDownPos = { x: pos.clientX, y: pos.clientY };
	}

	function handleMapMouseUp(e: MouseEvent | TouchEvent) {
		if (!mouseDownPos) return;
		const pos = 'changedTouches' in e ? e.changedTouches[0] : e;
		const deltaX = Math.abs(pos.clientX - mouseDownPos.x);
		const deltaY = Math.abs(pos.clientY - mouseDownPos.y);

		if (deltaX < CLICK_THRESHOLD && deltaY < CLICK_THRESHOLD) {
			onMapClick?.();
		}
		mouseDownPos = null;
	}

	let mapContainer: HTMLDivElement;
	let map = $state<LeafletMap | null>(null);
	let leaflet = $state<typeof import('leaflet') | null>(null);
	let currentBaseTileLayer: TileLayer | null = null;
	let overlayTileLayers: Map<string, TileLayer> = new Map();
	let markerLayers: Map<string, LeafletMarker> = new Map();
	let workflowInstanceLayers: Map<string, LeafletMarker> = new Map();

	// Derived: compute which markers should be visible on the map
	const visibleMarkers = $derived.by(() => {
		return markers.filter(
			(m) => visibleCategoryIds.includes(m.category_id) && m.location?.lat && m.location?.lon
		);
	});

	// Derived: compute which workflow instances should be visible on the map
	const visibleWorkflowInstances = $derived.by(() => {
		return workflowInstances.filter(
			(i) => visibleWorkflowIds.includes(i.workflow_id) && i.location?.lat && i.location?.lon
		);
	});

	// Default settings
	const defaultCenter: [number, number] = [51.505, 7.45]; // Germany
	const defaultZoom = 13;
	const defaultTileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
	const defaultAttribution =
		'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

	// Get layer by ID
	function getLayerById(id: string): MapLayer | undefined {
		return layers.find((l) => l.id === id);
	}

	// Get source from layer (handles expand)
	function getSourceFromLayer(layer: MapLayer): MapSource | null {
		return layer.expand?.source_id ?? null;
	}

	// Create tile layer from source
	function createTileLayer(L: typeof import('leaflet'), source: MapSource): TileLayer {
		return L.tileLayer(source.url || defaultTileUrl, {
			attribution: source.config?.attribution || defaultAttribution,
			minZoom: source.config?.minZoom ?? mapSettings?.min_zoom ?? 1,
			maxZoom: source.config?.maxZoom ?? mapSettings?.max_zoom ?? 19
		});
	}

	// Update base layer
	function updateBaseLayer(L: typeof import('leaflet')) {
		if (!map) return;

		// Remove current base layer
		if (currentBaseTileLayer) {
			map.removeLayer(currentBaseTileLayer);
			currentBaseTileLayer = null;
		}

		// Add new base layer
		if (activeBaseLayerId) {
			const layer = getLayerById(activeBaseLayerId);
			if (layer) {
				const source = getSourceFromLayer(layer);
				if (source) {
					currentBaseTileLayer = createTileLayer(L, source);
					currentBaseTileLayer.addTo(map);
				}
			}
		}

		// Fallback: if no base layer, add default OSM
		if (!currentBaseTileLayer) {
			currentBaseTileLayer = L.tileLayer(defaultTileUrl, {
				attribution: defaultAttribution
			});
			currentBaseTileLayer.addTo(map);
		}
	}

	// Update overlay layers
	function updateOverlayLayers(L: typeof import('leaflet')) {
		if (!map) return;

		// Remove layers that are no longer active
		for (const [id, tileLayer] of overlayTileLayers) {
			if (!activeOverlayIds.includes(id)) {
				map.removeLayer(tileLayer);
				overlayTileLayers.delete(id);
			}
		}

		// Add new active layers
		for (const id of activeOverlayIds) {
			if (!overlayTileLayers.has(id)) {
				const layer = getLayerById(id);
				if (layer) {
					const source = getSourceFromLayer(layer);
					if (source) {
						const tileLayer = createTileLayer(L, source);
						tileLayer.addTo(map);
						overlayTileLayers.set(id, tileLayer);
					}
				}
			}
		}
	}

	// Generate pin marker SVG with embedded icon
	function generatePinMarkerSvg(iconConfig: IconConfig): string {
		const style = iconConfig.style;
		const size = style.size || 32;
		const height = size * 1.25;

		// Scale factors based on original 32x40 viewBox
		const scaleX = size / 32;
		const scaleY = height / 40;

		// Icon placement inside the pin's circle
		const iconSize = 16 * scaleX;
		const iconX = 16 * scaleX - iconSize / 2;
		const iconY = 14 * scaleY - iconSize / 2;

		// Create data URL for embedded SVG icon
		const iconDataUrl = `data:image/svg+xml;base64,${btoa(iconConfig.svgContent)}`;

		return `
			<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${height}" viewBox="0 0 ${size} ${height}">
				<!-- Marker shadow -->
				<ellipse cx="${16 * scaleX}" cy="${37 * scaleY}" rx="${8 * scaleX}" ry="${3 * scaleY}" fill="rgba(0,0,0,0.2)"/>

				<!-- Main marker shape -->
				<path d="M${16 * scaleX} ${2 * scaleY}
				         C${9.373 * scaleX} ${2 * scaleY} ${4 * scaleX} ${7.373 * scaleY} ${4 * scaleX} ${14 * scaleY}
				         C${4 * scaleX} ${22 * scaleY} ${16 * scaleX} ${36 * scaleY} ${16 * scaleX} ${36 * scaleY}
				         S${28 * scaleX} ${22 * scaleY} ${28 * scaleX} ${14 * scaleY}
				         C${28 * scaleX} ${7.373 * scaleY} ${22.627 * scaleX} ${2 * scaleY} ${16 * scaleX} ${2 * scaleY} Z"
				      fill="${style.color}"
				      stroke="${style.borderColor}"
				      stroke-width="${style.borderWidth}"/>

				<!-- Inner circle for icon background -->
				<circle cx="${16 * scaleX}" cy="${14 * scaleY}" r="${10 * scaleX}" fill="#ffffff" opacity="0.9"/>

				<!-- Embedded icon -->
				<image href="${iconDataUrl}" x="${iconX}" y="${iconY}" width="${iconSize}" height="${iconSize}"/>
			</svg>
		`;
	}

	// Create Leaflet icon from marker category
	function createMarkerIcon(L: typeof import('leaflet'), category: MarkerCategory | undefined) {
		const iconConfig = category?.icon_config;

		if (!iconConfig?.svgContent) {
			// Fallback to default marker
			return new L.Icon.Default();
		}

		const style = iconConfig.style || { size: 32, shape: 'none' };
		const size = style.size || 32;

		let iconHtml: string;
		let iconSize: [number, number];
		let iconAnchor: [number, number];

		if (style.shape === 'pin') {
			iconHtml = generatePinMarkerSvg(iconConfig);
			const height = size * 1.25;
			iconSize = [size, height];
			iconAnchor = [size / 2, height]; // Anchor at bottom center of pin
		} else {
			// Standalone SVG - wrap in container that forces the size
			// The SVG might have hardcoded width/height, so we use CSS to override
			iconHtml = `<div class="standalone-svg-icon" style="width:${size}px;height:${size}px;">${iconConfig.svgContent}</div>`;
			iconSize = [size, size];
			iconAnchor = [size / 2, size / 2]; // Anchor at center
		}

		return L.divIcon({
			html: iconHtml,
			className: 'custom-marker-icon',
			iconSize,
			iconAnchor,
			popupAnchor: [0, -iconAnchor[1]]
		});
	}

	// Update markers on map - accepts visible markers list for proper reactivity
	function syncMarkersToMap(L: typeof import('leaflet'), markersToShow: MapMarker[]) {
		if (!map) return;

		// Remove markers that are no longer visible
		const toRemove: string[] = [];
		for (const [id, leafletMarker] of markerLayers) {
			if (!markersToShow.some((m) => m.id === id)) {
				map.removeLayer(leafletMarker);
				toRemove.push(id);
			}
		}
		for (const id of toRemove) {
			markerLayers.delete(id);
		}

		// Add visible markers that aren't on the map yet
		for (const marker of markersToShow) {
			if (!marker.location) continue;

			const existingMarker = markerLayers.get(marker.id);

			if (!existingMarker) {
				// Create new marker
				const category = marker.expand?.category_id;
				const icon = createMarkerIcon(L, category);

				const leafletMarker = L.marker([marker.location.lat, marker.location.lon], { icon })
					.addTo(map);

				// Add click handler
				if (onMarkerClick) {
					leafletMarker.on('click', () => onMarkerClick(marker));
				}

				markerLayers.set(marker.id, leafletMarker);
			}
		}
	}

	// Create Leaflet icon for workflow instance using workflow's icon_config or marker_color
	function createWorkflowInstanceIcon(L: typeof import('leaflet'), workflow: WorkflowDef | undefined) {
		const iconConfig = workflow?.icon_config;
		const markerColor = workflow?.marker_color || '#6366f1'; // Default to indigo

		// If workflow has icon_config with SVG, use it
		if (iconConfig?.svgContent) {
			return createMarkerIcon(L, { icon_config: iconConfig } as MarkerCategory);
		}

		// Otherwise create a simple colored circle marker
		const size = 24;
		const svgContent = `
			<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
				<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${markerColor}" stroke="white" stroke-width="2"/>
				<circle cx="${size / 2}" cy="${size / 2}" r="${size / 4}" fill="white" opacity="0.8"/>
			</svg>
		`;

		return L.divIcon({
			html: `<div class="workflow-instance-icon">${svgContent}</div>`,
			className: 'custom-marker-icon',
			iconSize: [size, size],
			iconAnchor: [size / 2, size / 2],
			popupAnchor: [0, -size / 2]
		});
	}

	// Update workflow instances on map
	function syncWorkflowInstancesToMap(L: typeof import('leaflet'), instancesToShow: WorkflowInstance[]) {
		if (!map) return;

		// Remove instances that are no longer visible
		const toRemove: string[] = [];
		for (const [id, leafletMarker] of workflowInstanceLayers) {
			if (!instancesToShow.some((i) => i.id === id)) {
				map.removeLayer(leafletMarker);
				toRemove.push(id);
			}
		}
		for (const id of toRemove) {
			workflowInstanceLayers.delete(id);
		}

		// Add visible instances that aren't on the map yet
		for (const instance of instancesToShow) {
			if (!instance.location) continue;

			const existingMarker = workflowInstanceLayers.get(instance.id);

			if (!existingMarker) {
				// Create new marker
				const workflow = instance.expand?.workflow_id;
				const icon = createWorkflowInstanceIcon(L, workflow);

				const leafletMarker = L.marker([instance.location.lat, instance.location.lon], { icon })
					.addTo(map);

				// Add click handler
				if (onWorkflowInstanceClick) {
					leafletMarker.on('click', () => onWorkflowInstanceClick(instance));
				}

				workflowInstanceLayers.set(instance.id, leafletMarker);
			}
		}
	}

	onMount(async () => {
		// Dynamic import to avoid SSR issues
		const L = await import('leaflet');

		// Fix for default marker icons
		// @ts-ignore
		delete L.Icon.Default.prototype._getIconUrl;
		L.Icon.Default.mergeOptions({
			iconRetinaUrl: '/leaflet/marker-icon-2x.png',
			iconUrl: '/leaflet/marker-icon.png',
			shadowUrl: '/leaflet/marker-shadow.png'
		});

		// Get center from settings or default
		const center: [number, number] = [
			mapSettings?.center_lat ?? defaultCenter[0],
			mapSettings?.center_lon ?? defaultCenter[1]
		];
		const zoom = mapSettings?.default_zoom ?? defaultZoom;

		// Initialize map - assign to $state variables to trigger effects
		const mapInstance = L.map(mapContainer, {
			center,
			zoom,
			zoomControl: false,
			attributionControl: true
		});

		// Add zoom control to bottom right
		L.control
			.zoom({
				position: 'bottomright'
			})
			.addTo(mapInstance);

		// Set reactive state - this will trigger the effects
		leaflet = L;
		map = mapInstance;

		// Notify parent that map is ready
		onMapReady?.(mapInstance);

		// Add click vs drag detection event listeners
		mapContainer.addEventListener('mousedown', handleMapMouseDown);
		mapContainer.addEventListener('mouseup', handleMapMouseUp);
		mapContainer.addEventListener('touchstart', handleMapMouseDown);
		mapContainer.addEventListener('touchend', handleMapMouseUp);

		// Fix map size after mount
		setTimeout(() => {
			map?.invalidateSize();
		}, 100);
	});

	// React to layer selection changes
	$effect(() => {
		if (leaflet && map) {
			updateBaseLayer(leaflet);
		}
	});

	$effect(() => {
		if (leaflet && map) {
			updateOverlayLayers(leaflet);
		}
	});

	// React to marker visibility changes
	// IMPORTANT: Read visibleMarkers BEFORE the guard clause to ensure dependency tracking
	$effect(() => {
		const markersToSync = visibleMarkers; // Read first to track dependency
		if (leaflet && map) {
			syncMarkersToMap(leaflet, markersToSync);
		}
	});

	// React to workflow instance visibility changes
	$effect(() => {
		const instancesToSync = visibleWorkflowInstances; // Read first to track dependency
		if (leaflet && map) {
			syncWorkflowInstancesToMap(leaflet, instancesToSync);
		}
	});

	onDestroy(() => {
		// Remove click vs drag detection event listeners
		mapContainer?.removeEventListener('mousedown', handleMapMouseDown);
		mapContainer?.removeEventListener('mouseup', handleMapMouseUp);
		mapContainer?.removeEventListener('touchstart', handleMapMouseDown);
		mapContainer?.removeEventListener('touchend', handleMapMouseUp);

		if (map) {
			map.remove();
			map = null;
		}
	});
</script>

<div bind:this={mapContainer} class="pointer-events-auto h-full w-full"></div>

<style>
	:global(.custom-marker-icon) {
		background: none !important;
		border: none !important;
	}

	:global(.standalone-svg-icon) {
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	:global(.standalone-svg-icon svg) {
		width: 100% !important;
		height: 100% !important;
		max-width: 100%;
		max-height: 100%;
	}

	/* Ensure Leaflet markers are above map tiles on mobile */
	:global(.leaflet-marker-pane) {
		z-index: 600 !important;
	}

	:global(.leaflet-popup-pane) {
		z-index: 700 !important;
	}
</style>
