<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { Map as LeafletMap, TileLayer, Marker as LeafletMarker, LayerGroup } from 'leaflet';
	import { createCachedTileLayer } from '$lib/components/map/cached-tile-layer';
	import {
		markersToFeatures,
		workflowInstancesToFeatures,
		getMapBBox,
		isCluster,
		getFeatureKey,
		type MarkerProperties,
		type WorkflowInstanceProperties,
		type ClusterFeature,
		type ClusterDetail,
		type EnhancedClusterDetail,
		type ClusterLeaf
	} from '$lib/components/map/supercluster-manager';
	import { displayAnchor } from '$lib/utils/instance-geometry';
	import {
		generateDonutSvg,
		donutSize,
		donutCacheKey,
		type VisualKeyRegistry
	} from '$lib/components/map/donut-cluster-icon';
	import { ClusterClient } from '$lib/workers/cluster-client';
	import type Supercluster from 'supercluster';

	interface MapLayer {
		id: string;
		name: string;
		layer_type: 'base' | 'overlay';
		source_type: string;
		url: string | null;
		config?: {
			attribution?: string;
			minZoom?: number;
			maxZoom?: number;
			detected_min_zoom?: number;
			detected_max_zoom?: number;
			// WMS-specific
			layers?: string;
			format?: string;
			transparent?: boolean;
			version?: string;
		} | null;
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
		filter_value_icons?: Record<string, IconConfig>;
	}

	interface WorkflowInstance {
		id: string;
		workflow_id: string;
		current_stage_id?: string;
		status: string;
		geometry?: {
			type: 'Point' | 'LineString' | 'Polygon';
			coordinates: unknown;
		} | null;
		centroid?: { lat: number; lon: number } | null;
		bbox?: { minLon: number; minLat: number; maxLon: number; maxLat: number } | null;
		expand?: {
			workflow_id?: WorkflowDef;
		};
	}

	interface WorkflowStageInfo {
		id: string;
		workflow_id: string;
		visual_config?: {
			icon_config?: IconConfig;
			[key: string]: unknown;
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
		workflowStages?: WorkflowStageInfo[];
		visibleWorkflowIds?: string[];
		/** Map of instanceId -> dropdown value for the tagged filterable field */
		filterableValues?: Map<string, string>;
		/** Map of workflowId -> Set of visible tag values */
		visibleTagValues?: Map<string, Set<string>>;
		/** All workflow definitions (for filter_value_icons) */
		workflows?: Array<{ id: string; filter_value_icons?: Record<string, IconConfig> }>;
		/** Pre-computed visual key registry for donut cluster colors */
		visualKeyRegistry?: VisualKeyRegistry;
		onMarkerClick?: (marker: MapMarker) => void;
		onWorkflowInstanceClick?: (instance: WorkflowInstance) => void;
		onClusterClick?: (detail: EnhancedClusterDetail) => void;
		onMapReady?: (map: LeafletMap) => void;
		onMapClick?: () => void;
		/** When set, bypass clustering and show only these instances as individual markers */
		drillDownInstanceIds?: Set<string> | null;
		/** When true, render individual markers/instances for the current viewport (no clustering) */
		uncluster?: boolean;
		/** Max number of individual points to render when unclustered (even-sampled) */
		unclusterCap?: number;
		/** Reports how many points were rendered vs. total available in the viewport (uncluster mode) */
		onUnclusterStats?: (rendered: number, total: number) => void;
	}

	let {
		layers = [],
		activeBaseLayerId,
		activeOverlayIds = [],
		mapSettings,
		markers = [],
		visibleCategoryIds = [],
		workflowInstances = [],
		workflowStages = [],
		visibleWorkflowIds = [],
		filterableValues = new Map(),
		visibleTagValues = new Map(),
		workflows = [],
		visualKeyRegistry = new Map(),
		onMarkerClick,
		onWorkflowInstanceClick,
		onClusterClick,
		onMapReady,
		onMapClick,
		drillDownInstanceIds = null,
		uncluster = false,
		unclusterCap = 500,
		onUnclusterStats
	}: Props = $props();

	/** Sum of underlying points in a clustered feature list (point_count for clusters, 1 per singleton). */
	function totalPointsIn(features: any[] | null | undefined): number {
		if (!features) return 0;
		let sum = 0;
		for (const f of features) {
			sum += isCluster(f) ? f.properties.point_count : 1;
		}
		return sum;
	}

	/** Parse a field value that might be a JSON array into individual values */
	function splitMultiValue(value: string): string[] {
		if (value.startsWith('[')) {
			try { return JSON.parse(value); } catch { /* fall through */ }
		}
		return [value];
	}

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
			// Ignore clicks in the bottom bar area (h-16 = 64px) on mobile
			if (pos.clientY <= window.innerHeight - 64 || window.innerWidth >= 768) {
				onMapClick?.();
			}
		}
		mouseDownPos = null;
	}

	let mapContainer: HTMLDivElement;
	let map = $state<LeafletMap | null>(null);
	let leaflet = $state<typeof import('leaflet') | null>(null);
	let currentBaseTileLayer: TileLayer | null = null;
	let overlayTileLayers: Map<string, TileLayer> = new Map();

	// Supercluster web worker client
	let clusterClient: ClusterClient | null = null;
	let markerIndexReady = false;
	let workflowInstanceIndexReady = false;

	// Layer groups for rendered markers (replace cluster groups)
	let markerLayerGroup: LayerGroup | null = null;
	let workflowInstanceLayerGroup: LayerGroup | null = null;

	// Currently rendered features on the map, keyed by feature key
	// signature tracks cluster composition so we can detect stale icons
	interface RenderedEntry { marker: LeafletMarker; signature?: string }
	let renderedMarkers: Map<string, RenderedEntry> = new Map();
	let renderedWorkflowInstances: Map<string, RenderedEntry> = new Map();

	// Lookup maps for click handlers (point ID -> original data)
	let markerDataMap: Map<string, MapMarker> = new Map();
	let workflowInstanceDataMap: Map<string, WorkflowInstance> = new Map();

	// Icon cache to avoid regenerating identical icons
	let iconCache: Map<string, any> = new Map();

	// O(1) lookup sets for filter checks (instead of Array.includes which is O(n))
	const visibleCategoryIdSet = $derived(new Set(visibleCategoryIds));
	const visibleWorkflowIdSet = $derived(new Set(visibleWorkflowIds));

	// Pre-parse splitMultiValue results so JSON.parse runs once per data change, not per filter check
	const parsedFilterValues = $derived.by(() => {
		const map = new Map<string, string[]>();
		for (const [id, value] of filterableValues) {
			map.set(id, splitMultiValue(value));
		}
		return map;
	});

	// Derived: compute which markers should be visible on the map
	const visibleMarkers = $derived.by(() => {
		return markers.filter(
			(m) => visibleCategoryIdSet.has(m.category_id) && m.location?.lat && m.location?.lon
		);
	});

	// Derived: compute which workflow instances should be visible on the map.
	// Uses centroid as the anchor point for all shapes (point/line/polygon);
	// the centroid is server-derived on write and client-computed optimistically.
	const visibleWorkflowInstances = $derived.by(() => {
		return workflowInstances.filter((i) => {
			if (!visibleWorkflowIdSet.has(i.workflow_id)) return false;
			if (!i.centroid?.lat || !i.centroid?.lon) return false;
			const allowedValues = visibleTagValues.get(i.workflow_id);
			if (allowedValues) {
				const values = parsedFilterValues.get(i.id);
				if (values) {
					if (!values.some(v => allowedValues.has(v))) return false;
				}
			}
			return true;
		});
	});

	// visualKeyRegistry is now received as a prop from the parent (computed once in +page.svelte)

	// O(1) lookup maps for icon creation (instead of Array.find which is O(n) per call)
	const workflowById = $derived(new Map(workflows.map(w => [w.id, w])));
	const stageById = $derived(new Map(workflowStages.map(s => [s.id, s])));

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

	// Compute the global max zoom from all layers
	function getGlobalMaxZoom(): number {
		let max = mapSettings?.max_zoom ?? 19;
		for (const layer of layers) {
			const layerMax = layer.config?.detected_max_zoom ?? layer.config?.maxZoom;
			if (layerMax !== undefined && layerMax > max) max = layerMax;
		}
		return max;
	}

	// Create tile layer from a map layer (source fields are inline)
	function createTileLayerFromLayer(L: typeof import('leaflet'), layer: MapLayer): TileLayer {
		const config = layer.config;
		const attribution = config?.attribution || defaultAttribution;
		const minZoom = config?.detected_min_zoom ?? config?.minZoom ?? mapSettings?.min_zoom ?? 1;
		const maxNativeZoom = config?.detected_max_zoom ?? config?.maxZoom ?? undefined;
		const maxZoom = getGlobalMaxZoom();

		const opts = { attribution, minZoom, maxZoom, ...(maxNativeZoom !== undefined && { maxNativeZoom }) };

		// WMS layers use L.tileLayer.wms()
		if (layer.source_type === 'wms') {
			return L.tileLayer.wms(layer.url || '', {
				layers: config?.layers || '',
				format: config?.format || 'image/png',
				transparent: config?.transparent ?? true,
				version: config?.version || '1.1.1',
				...opts
			});
		}

		// Standard tile layers use cached tile layer (IndexedDB first)
		return createCachedTileLayer(
			layer.id,
			layer.url || defaultTileUrl,
			opts,
			L
		);
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
				currentBaseTileLayer = createTileLayerFromLayer(L, layer);
				currentBaseTileLayer.addTo(map);
			}
		}

		// Fallback: if no base layer, add default OSM (also cached)
		if (!currentBaseTileLayer) {
			currentBaseTileLayer = createCachedTileLayer(
				'default-osm',
				defaultTileUrl,
				{ attribution: defaultAttribution, maxNativeZoom: 19, maxZoom: getGlobalMaxZoom() },
				L
			);
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
					const tileLayer = createTileLayerFromLayer(L, layer);
					tileLayer.addTo(map);
					overlayTileLayers.set(id, tileLayer);
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

	// Create Leaflet icon from marker category (with caching)
	function createMarkerIcon(L: typeof import('leaflet'), category: MarkerCategory | undefined) {
		const iconConfig = category?.icon_config;

		if (!iconConfig?.svgContent) {
			return new L.Icon.Default();
		}

		// Cache by category ID
		const cacheKey = category?.id ? `marker_${category.id}` : undefined;
		if (cacheKey) {
			const cached = iconCache.get(cacheKey);
			if (cached) return cached;
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
			iconHtml = `<div class="standalone-svg-icon" style="width:${size}px;height:${size}px;">${iconConfig.svgContent}</div>`;
			iconSize = [size, size];
			iconAnchor = [size / 2, size / 2]; // Anchor at center
		}

		const icon = L.divIcon({
			html: iconHtml,
			className: 'custom-marker-icon',
			iconSize,
			iconAnchor,
			popupAnchor: [0, -iconAnchor[1]]
		});

		if (cacheKey) iconCache.set(cacheKey, icon);
		return icon;
	}

	// Create Leaflet icon for workflow instance using workflow's icon_config or marker_color
	function createWorkflowInstanceIcon(L: typeof import('leaflet'), workflow: WorkflowDef | undefined, instance: WorkflowInstance) {
		const markerColor = workflow?.marker_color || '#6366f1'; // Default to indigo

		// Fallback chain: filter value icon -> stage icon -> workflow icon -> colored circle
		let effectiveIconConfig: IconConfig | undefined;

		// 1. Check filter value icon (from workflow.filter_value_icons)
		const filterValue = filterableValues.get(instance.id);
		if (filterValue) {
			const wfFilterIcons = workflow?.filter_value_icons
				?? workflowById.get(instance.workflow_id)?.filter_value_icons;
			const filterIcon = wfFilterIcons?.[filterValue];
			if (filterIcon?.svgContent) {
				effectiveIconConfig = filterIcon;
			}
		}

		// 2. Check current stage icon
		if (!effectiveIconConfig && instance.current_stage_id) {
			const stage = stageById.get(instance.current_stage_id);
			const stageIconConfig = stage?.visual_config?.icon_config;
			if (stageIconConfig?.svgContent) {
				effectiveIconConfig = stageIconConfig;
			}
		}

		// 3. Fall back to workflow icon
		if (!effectiveIconConfig && workflow?.icon_config?.svgContent) {
			effectiveIconConfig = workflow.icon_config;
		}

		// If we have an icon config, render it
		if (effectiveIconConfig?.svgContent) {
			const baseIcon = createMarkerIcon(L, { icon_config: effectiveIconConfig } as MarkerCategory);
			return L.divIcon({
				html: `<div data-instance-id="${instance.id}">${baseIcon.options.html || ''}</div>`,
				className: baseIcon.options.className || 'custom-marker-icon',
				iconSize: baseIcon.options.iconSize,
				iconAnchor: baseIcon.options.iconAnchor,
				popupAnchor: baseIcon.options.popupAnchor
			});
		}

		// Default: colored circle
		const size = 24;
		const svgContent = `
			<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
				<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${markerColor}" stroke="white" stroke-width="2"/>
				<circle cx="${size / 2}" cy="${size / 2}" r="${size / 4}" fill="white" opacity="0.8"/>
			</svg>
		`;

		return L.divIcon({
			html: `<div class="workflow-instance-icon" data-instance-id="${instance.id}">${svgContent}</div>`,
			className: 'custom-marker-icon',
			iconSize: [size, size],
			iconAnchor: [size / 2, size / 2],
			popupAnchor: [0, -size / 2]
		});
	}

	// Signature for detecting cluster composition changes (includes keys + values)
	function clusterSignature(counts: Record<string, number>, totalCount: number): string {
		return Object.keys(counts).sort().map(k => `${k}:${counts[k]}`).join('|') + `#${totalCount}`;
	}

	// Create a donut cluster icon from aggregated composition data
	function createDonutClusterIcon(L: typeof import('leaflet'), counts: Record<string, number>, totalCount: number) {
		const cacheKey = donutCacheKey(counts, totalCount);
		const cached = iconCache.get(cacheKey);
		if (cached) return cached;

		const size = donutSize(totalCount);
		const svg = generateDonutSvg(counts, totalCount, visualKeyRegistry, size);

		const icon = L.divIcon({
			html: `<div class="supercluster-donut" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));">${svg}</div>`,
			className: 'custom-marker-icon',
			iconSize: [size, size],
			iconAnchor: [size / 2, size / 2]
		});

		iconCache.set(cacheKey, icon);
		return icon;
	}

	// Double-tap detection timer for cluster interactions
	let clusterTapTimer: ReturnType<typeof setTimeout> | null = null;
	let lastTappedClusterId: number | null = null;

	/**
	 * Render the visible clusters/points onto a Leaflet LayerGroup from a pre-fetched features array.
	 * Diffs against currently rendered features to minimize DOM changes.
	 * Single tap on cluster -> detail sheet; double tap -> zoom to resolve.
	 */
	function renderFeatures<P extends MarkerProperties | WorkflowInstanceProperties>(
		L: typeof import('leaflet'),
		features: Array<Supercluster.ClusterFeature<Supercluster.AnyProps> | Supercluster.PointFeature<P>>,
		layerGroup: LayerGroup,
		rendered: Map<string, RenderedEntry>,
		createIcon: (feature: Supercluster.PointFeature<P>) => any,
		onClick: ((feature: Supercluster.PointFeature<P>) => void) | undefined,
		clusterType: 'marker' | 'workflowInstance',
		getPointIconSignature?: (feature: Supercluster.PointFeature<P>) => string
	) {
		if (!map) return;

		// Build set of feature keys that should be visible
		const visibleKeys = new Set<string>();
		for (const feature of features) {
			visibleKeys.add(getFeatureKey(feature));
		}

		// Remove rendered features that are no longer visible
		for (const [key, entry] of rendered) {
			if (!visibleKeys.has(key)) {
				layerGroup.removeLayer(entry.marker);
				rendered.delete(key);
			}
		}

		// Add or update features
		for (const feature of features) {
			const key = getFeatureKey(feature);
			const existing = rendered.get(key);

			if (existing) {
				// For clusters, check if composition changed and update icon in-place
				if (isCluster(feature)) {
					const counts: Record<string, number> = feature.properties._counts || {};
					const count = feature.properties.point_count;
					const sig = clusterSignature(counts, count);
					if (sig !== existing.signature) {
						existing.marker.setIcon(createDonutClusterIcon(L, counts, count));
						existing.signature = sig;
					}
				} else {
					const pointFeature = feature as Supercluster.PointFeature<P>;
					const [lng, lat] = pointFeature.geometry.coordinates;
					const current = existing.marker.getLatLng();
					if (current.lat !== lat || current.lng !== lng) {
						existing.marker.setLatLng([lat, lng]);
					}
					if (getPointIconSignature) {
						const nextSig = getPointIconSignature(pointFeature);
						if (nextSig !== existing.signature) {
							existing.marker.setIcon(createIcon(pointFeature));
							existing.signature = nextSig;
						}
					}
				}
				continue;
			}

			const [lng, lat] = feature.geometry.coordinates;
			let icon: any;
			let sig: string | undefined;
			let clickHandler: (() => void) | undefined;

			if (isCluster(feature)) {
				const count = feature.properties.point_count;
				const counts: Record<string, number> = feature.properties._counts || {};
				icon = createDonutClusterIcon(L, counts, count);
				sig = clusterSignature(counts, count);

				// Double-tap: zoom in; Single-tap: show detail sheet
				const clusterId = feature.properties.cluster_id;
				clickHandler = () => {
					if (clusterTapTimer !== null && lastTappedClusterId === clusterId) {
						// Double tap -- zoom to fully resolve the cluster
						clearTimeout(clusterTapTimer);
						clusterTapTimer = null;
						lastTappedClusterId = null;
						// Get all leaf points and fit bounds to show them individually (async via worker)
						clusterClient?.getLeaves(clusterType, clusterId).then(leaves => {
							if (leaves.length > 0 && map) {
								const bounds = L.latLngBounds(
									leaves.map((l: any) => L.latLng(l.geometry.coordinates[1], l.geometry.coordinates[0]))
								);
								map.flyToBounds(bounds, { padding: [40, 40], maxZoom: getGlobalMaxZoom() });
							} else {
								// Fallback: just zoom to expansion level
								clusterClient?.getClusterExpansionZoom(clusterType, clusterId).then(expansionZoom => {
									map?.flyTo([lat, lng], expansionZoom);
								});
							}
						});
					} else {
						// First tap -- wait to see if double tap follows
						if (clusterTapTimer !== null) clearTimeout(clusterTapTimer);
						lastTappedClusterId = clusterId;
						clusterTapTimer = setTimeout(() => {
							clusterTapTimer = null;
							lastTappedClusterId = null;
							// Single tap: emit cluster detail with leaves (async via worker)
							clusterClient?.getLeaves(clusterType, clusterId).then(rawLeaves => {
								const leaves: ClusterLeaf[] = rawLeaves
									.filter((l: any) => l.properties.type === 'workflowInstance')
									.map((l: any) => {
										const p = l.properties as unknown as WorkflowInstanceProperties;
										return {
											id: p.id,
											workflowId: p.workflowId,
											currentStageId: p.currentStageId,
											filterValue: p.filterValue,
											coordinates: l.geometry.coordinates as [number, number]
										};
									});
								onClusterClick?.({
									center: [lat, lng],
									totalCount: count,
									counts,
									clusterType,
									clusterId,
									leaves
								});
							});
						}, 300);
					}
				};
			} else {
				const pointFeature = feature as Supercluster.PointFeature<P>;
				icon = createIcon(pointFeature);
				if (getPointIconSignature) {
					sig = getPointIconSignature(pointFeature);
				}
				if (onClick) {
					clickHandler = () => onClick(pointFeature);
				}
			}

			const leafletMarker = L.marker([lat, lng], { icon });
			if (clickHandler) {
				leafletMarker.on('click', (e: any) => {
					// Guard: ignore clicks that originate from the bottom bar area on mobile.
					// On some mobile browsers, touch events can bleed through fixed overlays
					// to Leaflet markers underneath.
					const origEvent = e.originalEvent;
					if (origEvent) {
						const y = origEvent.clientY ?? origEvent.pageY;
						const bottomBarHeight = 64; // h-16 = 4rem = 64px
						if (y > window.innerHeight - bottomBarHeight) {
							return;
						}
					}
					clickHandler();
				});
			}
			layerGroup.addLayer(leafletMarker);
			rendered.set(key, { marker: leafletMarker, signature: sig });
		}
	}

	// Pending RAF ID for viewport updates
	let pendingViewportUpdate: number | null = null;

	/** Schedule a viewport update on next animation frame */
	function scheduleViewportUpdate() {
		if (pendingViewportUpdate !== null) return;
		pendingViewportUpdate = requestAnimationFrame(() => {
			pendingViewportUpdate = null;
			updateViewport();
		});
	}

	// Re-query the viewport whenever the uncluster toggle or cap changes.
	$effect(() => {
		uncluster;
		unclusterCap;
		scheduleViewportUpdate();
	});

	/** Re-render markers and workflow instances for the current viewport */
	async function updateViewport() {
		if (!leaflet || !map || !markerLayerGroup || !workflowInstanceLayerGroup || !clusterClient) return;

		const bbox = getMapBBox(map) as [number, number, number, number];
		const baseZoom = Math.floor(map.getZoom());
		const highZoom = getGlobalMaxZoom() + 1;

		const wfDrillDownActive = !!(drillDownInstanceIds && drillDownInstanceIds.size > 0);

		// Phase 1: fetch clustered view at the current zoom. Always needed to
		// count how many underlying points are in the viewport so we can decide
		// whether to auto-uncluster below the cap.
		let markerFeatures = markerIndexReady
			? await clusterClient.getClusters('marker', bbox, baseZoom)
			: null;
		let wfFeatures = !wfDrillDownActive && workflowInstanceIndexReady
			? await clusterClient.getClusters('workflowInstance', bbox, baseZoom)
			: null;

		const markerTotal = totalPointsIn(markerFeatures);
		const wfTotal = totalPointsIn(wfFeatures);
		const combinedTotal = markerTotal + wfTotal;

		const shouldExpand =
			uncluster && combinedTotal > 0 && combinedTotal <= unclusterCap;

		// Phase 2: if we're under the cap, re-query at a zoom above the index's
		// built maxZoom so supercluster returns the raw points in the bbox.
		if (shouldExpand) {
			if (markerIndexReady) {
				markerFeatures = await clusterClient.getClusters('marker', bbox, highZoom);
			}
			if (!wfDrillDownActive && workflowInstanceIndexReady) {
				wfFeatures = await clusterClient.getClusters('workflowInstance', bbox, highZoom);
			}
		}

		if (markerFeatures) {
			renderFeatures(
				leaflet,
				markerFeatures,
				markerLayerGroup,
				renderedMarkers,
				(feature) => {
					const marker = markerDataMap.get(feature.properties.id);
					const category = marker?.expand?.category_id;
					return createMarkerIcon(leaflet!, category);
				},
				onMarkerClick
					? (feature) => {
						const marker = markerDataMap.get(feature.properties.id);
						if (marker) onMarkerClick!(marker);
					}
					: undefined,
				'marker',
				(feature) => markerDataMap.get(feature.properties.id)?.category_id ?? ''
			);
		}

		if (wfDrillDownActive) {
			renderDrillDownFeatures(leaflet, drillDownInstanceIds!);
		} else if (wfFeatures) {
			renderFeatures(
				leaflet,
				wfFeatures,
				workflowInstanceLayerGroup,
				renderedWorkflowInstances,
				(feature) => {
					const instance = workflowInstanceDataMap.get(feature.properties.id);
					const workflow = instance?.expand?.workflow_id;
					return createWorkflowInstanceIcon(leaflet!, workflow, instance!);
				},
				onWorkflowInstanceClick
					? (feature) => {
						const instance = workflowInstanceDataMap.get(feature.properties.id);
						if (instance) onWorkflowInstanceClick!(instance);
					}
					: undefined,
				'workflowInstance',
				(feature) => {
					const i = workflowInstanceDataMap.get(feature.properties.id);
					if (!i) return '';
					const fv = filterableValues.get(i.id) ?? '';
					return `${i.workflow_id}|${i.current_stage_id ?? ''}|${fv}`;
				}
			);
		}

		if (uncluster) {
			onUnclusterStats?.(shouldExpand ? combinedTotal : 0, combinedTotal);
		}
	}

	/** Render only specific instances as individual unclustered markers (drill-down mode) */
	function renderDrillDownFeatures(L: typeof import('leaflet'), instanceIds: Set<string>) {
		if (!map || !workflowInstanceLayerGroup) return;

		const instanceIconSignature = (i: WorkflowInstance) => {
			const fv = filterableValues.get(i.id) ?? '';
			return `${i.workflow_id}|${i.current_stage_id ?? ''}|${fv}`;
		};

		// Build set of keys that should be visible
		const targetKeys = new Set<string>();
		for (const id of instanceIds) {
			targetKeys.add(`point_${id}`);
		}

		// Remove markers not in the drill-down set
		for (const [key, entry] of renderedWorkflowInstances) {
			if (!targetKeys.has(key)) {
				workflowInstanceLayerGroup.removeLayer(entry.marker);
				renderedWorkflowInstances.delete(key);
			}
		}

		// Add or update drill-down markers. Anchor is displayAnchor:
		//   - Point: the point itself
		//   - LineString: along-path midpoint
		//   - Polygon: pointOnFeature (always inside, even for concave shapes)
		// This keeps the icon on the stroke / inside the fill rather than at
		// the raw centroid, which can land outside concave polygons.
		for (const instanceId of instanceIds) {
			const key = `point_${instanceId}`;
			const instance = workflowInstanceDataMap.get(instanceId);
			if (!instance) continue;
			const anchor = displayAnchor(instance as { geometry?: any; centroid?: any });
			if (!anchor?.lat || !anchor?.lon) continue;

			const workflow = instance.expand?.workflow_id;
			const existing = renderedWorkflowInstances.get(key);

			if (existing) {
				const current = existing.marker.getLatLng();
				if (current.lat !== anchor.lat || current.lng !== anchor.lon) {
					existing.marker.setLatLng([anchor.lat, anchor.lon]);
				}
				const nextSig = instanceIconSignature(instance);
				if (nextSig !== existing.signature) {
					existing.marker.setIcon(createWorkflowInstanceIcon(L, workflow, instance));
					existing.signature = nextSig;
				}
				continue;
			}

			const icon = createWorkflowInstanceIcon(L, workflow, instance);
			const leafletMarker = L.marker([anchor.lat, anchor.lon], { icon });
			if (onWorkflowInstanceClick) {
				leafletMarker.on('click', () => onWorkflowInstanceClick!(instance));
			}

			workflowInstanceLayerGroup.addLayer(leafletMarker);
			renderedWorkflowInstances.set(key, { marker: leafletMarker, signature: instanceIconSignature(instance) });
		}
	}

	onMount(async () => {
		// Initialize Supercluster web worker (off main thread clustering)
		clusterClient = new ClusterClient();

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

		// Initialize map
		const mapInstance = L.map(mapContainer, {
			center,
			zoom,
			maxZoom: getGlobalMaxZoom(),
			zoomControl: false,
			attributionControl: true
		});

		// Initialize layer groups (replacing marker cluster groups)
		markerLayerGroup = L.layerGroup().addTo(mapInstance);
		workflowInstanceLayerGroup = L.layerGroup().addTo(mapInstance);

		// Set reactive state - this will trigger the effects
		leaflet = L;
		map = mapInstance;

		// Listen for viewport changes to re-render clusters
		mapInstance.on('moveend', scheduleViewportUpdate);

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

	// React to mapSettings changes (e.g. max_zoom loaded after map init)
	$effect(() => {
		const maxZoom = getGlobalMaxZoom();
		if (map) {
			map.setMaxZoom(maxZoom);
		}
	});

	// Apply default center/zoom when mapSettings arrives after mount.
	// On first login, mapSettings is undefined at mount (data not yet fetched from server),
	// so the map starts at the hardcoded default. This one-shot effect applies the real
	// settings once they load, then never overrides user-controlled position again.
	let initialSettingsApplied = false;
	$effect(() => {
		if (map && mapSettings && !initialSettingsApplied) {
			const lat = mapSettings.center_lat;
			const lon = mapSettings.center_lon;
			const zoom = mapSettings.default_zoom;
			if (lat != null && lon != null) {
				map.setView([lat, lon], zoom ?? map.getZoom());
				initialSettingsApplied = true;
			}
			if (mapSettings.min_zoom != null) {
				map.setMinZoom(mapSettings.min_zoom);
			}
		}
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

	// Fingerprint helpers to skip unnecessary Supercluster rebuilds
	function fingerprint(items: Array<{ id: string; updated?: string }>): string {
		if (items.length === 0) return '';
		let hash = 0;
		for (const item of items) {
			const s = item.id + (item.updated || '');
			for (let i = 0; i < s.length; i++) {
				hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
			}
		}
		return `${items.length}:${hash}`;
	}
	let lastMarkerFingerprint = '';
	let lastInstanceFingerprint = '';

	// React to marker data changes: rebuild Supercluster index in worker and re-render (debounced)
	let markerRebuildTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		const markersToIndex = visibleMarkers;
		if (!leaflet || !map || !clusterClient) return;

		if (markerRebuildTimer) clearTimeout(markerRebuildTimer);
		markerRebuildTimer = setTimeout(async () => {
			// Skip rebuild if visible markers haven't actually changed
			const fp = fingerprint(markersToIndex);
			if (fp === lastMarkerFingerprint && markerIndexReady) {
				return;
			}
			lastMarkerFingerprint = fp;

			// Update the lookup map for click handlers
			markerDataMap.clear();
			for (const m of markers) {
				markerDataMap.set(m.id, m);
			}

			// Build fresh index in worker (off main thread)
			const features = markersToFeatures(markersToIndex);
			await clusterClient!.load('marker', features, 80, getGlobalMaxZoom());
			markerIndexReady = true;
			iconCache.clear();

			// Re-render via diff (renderFeatures removes stale, adds new)
			updateViewport();
		}, 200);
	});

	// React to workflow instance data changes: rebuild index in worker and re-render (debounced)
	let instanceRebuildTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		const instancesToIndex = visibleWorkflowInstances;
		if (!leaflet || !map || !clusterClient) return;

		if (instanceRebuildTimer) clearTimeout(instanceRebuildTimer);
		instanceRebuildTimer = setTimeout(async () => {
			// Skip rebuild if visible instances haven't actually changed
			const fp = fingerprint(instancesToIndex);
			if (fp === lastInstanceFingerprint && workflowInstanceIndexReady) {
				return;
			}
			lastInstanceFingerprint = fp;

			// Update the lookup map for click handlers
			workflowInstanceDataMap.clear();
			for (const i of workflowInstances) {
				workflowInstanceDataMap.set(i.id, i);
			}

			// Build fresh index in worker (off main thread)
			const features = workflowInstancesToFeatures(instancesToIndex, filterableValues);
			await clusterClient!.load('workflowInstance', features, 80, getGlobalMaxZoom());
			workflowInstanceIndexReady = true;
			iconCache.clear();

			// Re-render via diff (renderFeatures removes stale, adds new)
			updateViewport();
		}, 200);
	});

	// React to drill-down state changes: re-render immediately
	$effect(() => {
		const _ids = drillDownInstanceIds;
		if (leaflet && map) {
			updateViewport();
		}
	});

	onDestroy(() => {
		// Cancel pending debounce timers
		if (markerRebuildTimer) clearTimeout(markerRebuildTimer);
		if (instanceRebuildTimer) clearTimeout(instanceRebuildTimer);
		if (clusterTapTimer) clearTimeout(clusterTapTimer);

		// Cancel pending RAF
		if (pendingViewportUpdate !== null) {
			cancelAnimationFrame(pendingViewportUpdate);
		}

		// Remove click vs drag detection event listeners
		mapContainer?.removeEventListener('mousedown', handleMapMouseDown);
		mapContainer?.removeEventListener('mouseup', handleMapMouseUp);
		mapContainer?.removeEventListener('touchstart', handleMapMouseDown);
		mapContainer?.removeEventListener('touchend', handleMapMouseUp);

		if (map) {
			map.off('moveend', scheduleViewportUpdate);
			map.remove();
			map = null;
		}

		// Terminate web worker
		clusterClient?.destroy();
		clusterClient = null;

		// Clear caches
		iconCache.clear();
		renderedMarkers.clear();
		renderedWorkflowInstances.clear();
		markerDataMap.clear();
		workflowInstanceDataMap.clear();
	});
</script>

<div bind:this={mapContainer} class="pointer-events-auto h-full w-full" data-testid="map-canvas"></div>

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
