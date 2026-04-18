<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type {
		Map as LeafletMap,
		LayerGroup,
		Polyline as LPolyline,
		Polygon as LPolygon
	} from 'leaflet';
	import type { InstanceGeometry } from '$lib/participant-state/types';

	interface InstanceLike {
		id: string;
		workflow_id: string;
		geometry?: InstanceGeometry | null;
		bbox?: { minLon: number; minLat: number; maxLon: number; maxLat: number } | null;
	}
	interface WorkflowLike {
		id: string;
		marker_color?: string;
	}

	interface Props {
		map: LeafletMap;
		/** Full list of instances visible on the map. Point-type instances are
		 *  ignored here -- they render in the existing clustered layer.
		 *  Accepts a superset so callers can pass their heterogeneous records
		 *  without having to narrow them first. */
		instances: readonly InstanceLike[] | readonly Record<string, unknown>[];
		/** Workflow definitions, used to pick a stroke color per instance. */
		workflows: readonly WorkflowLike[] | readonly Record<string, unknown>[];
		/** Currently-visible workflow IDs (filter state). */
		visibleWorkflowIds?: string[];
		/** Hard-floor zoom below which no shapes are drawn. The per-shape
		 *  pixel check does the real filtering, so this only needs to keep
		 *  the renderer from churning on world-scale views. */
		minZoom?: number;
		/** Minimum on-screen bbox diagonal (pixels) for a shape to render.
		 *  Shapes smaller than this collapse into their centroid cluster
		 *  marker. Default is small (6 px) because most user-drawn polygons
		 *  are roughly 50-100 m and project to only 8-18 px at typical
		 *  working zoom levels -- anything higher and they never show up. */
		minShapePixels?: number;
		/** Instance ID of the currently-selected instance; its shape (all
		 *  sub-shapes of a Multi* geometry) gets a visible highlight so it's
		 *  clear they belong together. */
		selectedInstanceId?: string | null;
		/** When false, shapes are rendered but swallow no clicks -- taps pass
		 *  through to the map. Used during a drawing session so the user can
		 *  draw over existing instances without accidentally opening their
		 *  detail sheets. */
		interactive?: boolean;
		onInstanceClick?: (instanceId: string) => void;
	}

	let {
		map,
		instances,
		workflows,
		visibleWorkflowIds,
		minZoom = 3,
		minShapePixels = 6,
		selectedInstanceId = null,
		interactive = true,
		onInstanceClick
	}: Props = $props();

	let L: typeof import('leaflet') | null = $state(null);
	let layerGroup: LayerGroup | null = null;

	/** Rendered handle per instance id so diff updates avoid full teardown. */
	const rendered = new Map<string, LPolyline | LPolygon>();
	let zoom = $state(0);

	function handleZoom() {
		zoom = map.getZoom();
	}

	onMount(async () => {
		L = (await import('leaflet')).default ?? (await import('leaflet'));
		layerGroup = L.layerGroup().addTo(map);
		zoom = map.getZoom();
		map.on('zoomend', handleZoom);
	});

	onDestroy(() => {
		map.off('zoomend', handleZoom);
		clearAll();
		if (layerGroup) {
			map.removeLayer(layerGroup);
			layerGroup = null;
		}
	});

	function clearAll() {
		if (!layerGroup) return;
		for (const layer of rendered.values()) {
			layerGroup.removeLayer(layer);
		}
		rendered.clear();
	}

	function colorFor(workflowId: string): string {
		const wf = (workflows as WorkflowLike[]).find((w) => w.id === workflowId);
		return wf?.marker_color || '#3b82f6';
	}

	const visibleSet = $derived(
		visibleWorkflowIds ? new Set(visibleWorkflowIds) : null
	);

	// Project a bbox to on-screen pixels and return its diagonal length.
	// Used to decide per-shape whether it's big enough to draw at the current
	// zoom. Cheap: two latLng->containerPoint projections + sqrt.
	function bboxPixelSize(
		bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number }
	): number {
		if (!L || !map) return 0;
		const sw = map.latLngToContainerPoint(L.latLng(bbox.minLat, bbox.minLon));
		const ne = map.latLngToContainerPoint(L.latLng(bbox.maxLat, bbox.maxLon));
		const dx = ne.x - sw.x;
		const dy = ne.y - sw.y;
		return Math.sqrt(dx * dx + dy * dy);
	}

	// Render / update shape layers. Runs whenever the instance list, visibility
	// filter, or zoom level changes. Zoom changes are what drive the pixel-size
	// re-evaluation: a polygon that was 15 px wide at zoom 10 becomes 30 px at
	// zoom 11, so it flips from "cluster-only" to "rendered".
	$effect(() => {
		if (!L || !layerGroup) return;

		// Hard floor: world-scale views skip rendering entirely. The per-shape
		// pixel check below handles everything else.
		if (zoom < minZoom) {
			clearAll();
			return;
		}

		const seen = new Set<string>();
		const typedInstances = instances as InstanceLike[];

		for (const inst of typedInstances) {
			if (!inst.geometry) continue;
			if (inst.geometry.type === 'Point') continue;
			if (visibleSet && !visibleSet.has(inst.workflow_id)) continue;

			// Per-shape pixel threshold. Shape too small for the current zoom
			// -- let the centroid cluster marker represent it. bbox is server-
			// derived via the workflow_instance_geometry pb_hook so this works
			// for every instance that's ever synced.
			if (inst.bbox) {
				const px = bboxPixelSize(inst.bbox);
				if (px < minShapePixels) continue;
			}

			seen.add(inst.id);
			const color = colorFor(inst.workflow_id);
			const geom = inst.geometry;
			const isSelected = inst.id === selectedInstanceId;

			// Selected instance gets a heavier stroke + higher fill opacity so
			// all sub-shapes of a Multi* geometry read as one group. Kept as
			// cheap style-only tweaks -- no CSS filters or animation, those
			// repaint every frame and tank map performance.
			const lineWeight = isSelected ? 6 : 4;
			const lineOpacity = isSelected ? 1 : 0.9;
			const polyWeight = isSelected ? 4 : 2;
			const polyFillOpacity = isSelected ? 0.45 : 0.25;

			// Leaflet's L.polyline and L.polygon accept nested arrays out of the
			// box: a flat latlng[] renders a single stroke/ring, and a latlng[][]
			// renders multi-lines / multi-polygons as one layer. We convert each
			// supported GeoJSON type into the right shape below.
			if (geom.type === 'LineString' || geom.type === 'MultiLineString') {
				const latlngs: L.LatLng[] | L.LatLng[][] =
					geom.type === 'LineString'
						? (geom.coordinates as [number, number][]).map(
								([lon, lat]) => L!.latLng(lat, lon)
							)
						: (geom.coordinates as [number, number][][]).map((line) =>
								line.map(([lon, lat]) => L!.latLng(lat, lon))
							);
				let layer = rendered.get(inst.id) as LPolyline | undefined;
				if (!layer) {
					layer = L.polyline(latlngs as L.LatLngExpression[], {
						color,
						weight: lineWeight,
						opacity: lineOpacity,
						interactive: true
					});
					// Gate on the live `interactive` prop at click time so a
					// later-starting draw / placement session suppresses clicks
					// on already-rendered layers.
					if (onInstanceClick) {
						const id = inst.id;
						layer.on('click', () => {
							if (!interactive) return;
							onInstanceClick!(id);
						});
					}
					layerGroup.addLayer(layer);
					rendered.set(inst.id, layer);
				} else {
					layer.setLatLngs(latlngs as L.LatLngExpression[]);
					layer.setStyle({ color, weight: lineWeight, opacity: lineOpacity });
				}
				if (isSelected && layer.bringToFront) layer.bringToFront();
			} else if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
				// Polygon:       [[[lon,lat],...]]                -> outer ring
				// MultiPolygon:  [[[[lon,lat],...]], [[[...]]]]   -> list of polygons, each with rings
				// For Leaflet we flatten to an array of rings (single polygon)
				// or an array-of-array-of-rings (multi polygon). We use the outer
				// ring of each polygon only -- holes aren't surfaced in the draw
				// tool today so they can't appear here either.
				const latlngs =
					geom.type === 'Polygon'
						? (geom.coordinates[0] as [number, number][] | undefined ?? []).map(
								([lon, lat]) => L!.latLng(lat, lon)
							)
						: (geom.coordinates as [number, number][][][]).map((poly) =>
								(poly[0] ?? []).map(([lon, lat]) => L!.latLng(lat, lon))
							);
				let layer = rendered.get(inst.id) as LPolygon | undefined;
				if (!layer) {
					layer = L.polygon(latlngs as L.LatLngExpression[], {
						color,
						weight: polyWeight,
						fillColor: color,
						fillOpacity: polyFillOpacity,
						interactive: true
					});
					if (onInstanceClick) {
						const id = inst.id;
						layer.on('click', () => {
							if (!interactive) return;
							onInstanceClick!(id);
						});
					}
					layerGroup.addLayer(layer);
					rendered.set(inst.id, layer);
				} else {
					layer.setLatLngs(latlngs as L.LatLngExpression[]);
					layer.setStyle({
						color,
						weight: polyWeight,
						fillColor: color,
						fillOpacity: polyFillOpacity
					});
				}
				if (isSelected && layer.bringToFront) layer.bringToFront();
			}
		}

		// Drop layers for instances that are no longer present or visible.
		for (const [id, layer] of rendered) {
			if (!seen.has(id)) {
				layerGroup.removeLayer(layer);
				rendered.delete(id);
			}
		}
	});
</script>

