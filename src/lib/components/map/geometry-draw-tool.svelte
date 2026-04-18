<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type {
		Map as LeafletMap,
		Marker as LMarker,
		LeafletMouseEvent
	} from 'leaflet';
	import type {
		Feature,
		LineString,
		MultiLineString,
		Polygon,
		MultiPolygon
	} from 'geojson';

	/**
	 * Port of the legacy MeasureTool UX for drawing workflow-instance geometry.
	 * Source: legacy_dlapp/.../tools-panel/tools/MeasureTool.js (+ ToolsManager
	 * shared controls: Exit / Undo / Redo / Delete).
	 *
	 * Feature parity with legacy:
	 *   - Multiple entities per session (several lines or polygons in one
	 *     workflow instance); entities auto-number 1, 2, 3...
	 *   - Clicking a numbered tab activates that entity so the user can
	 *     continue adding vertices to it.
	 *   - Per-entity undo / redo history; shared toolbar buttons act on the
	 *     active entity.
	 *   - Plus button commits the current entity (if valid) and starts a
	 *     fresh one.
	 *   - Delete button removes the active entity and renumbers the rest.
	 *   - Active entity line is drawn in an accent color; committed entities
	 *     fall back to a neutral default.
	 *   - Polygon mode: clicking within a zoom-scaled threshold of the first
	 *     vertex closes the ring and commits the entity.
	 *   - First vertex is a draggable marker; dragging moves the whole vertex
	 *     and records a history snapshot on drop.
	 *   - OK button finalizes all entities into GeoJSON and hands off to the
	 *     form step.
	 *
	 * Controls are rendered as a vertical stack in the top-right corner
	 * (neutral grey surface, matching the legacy leaflet-bar look).
	 */

	type DrawMode = 'line' | 'polygon';

	interface Props {
		map: LeafletMap;
		mode: DrawMode;
		onConfirm: (
			feature: Feature<LineString | MultiLineString | Polygon | MultiPolygon>
		) => void;
		onCancel: () => void;
	}

	let { map, mode, onConfirm, onCancel }: Props = $props();

	let L: typeof import('leaflet') | null = $state(null);

	// --- Entity model --------------------------------------------------------
	interface EntitySnapshot {
		points: Array<{ lat: number; lng: number }>;
		isClosed: boolean;
	}

	interface Entity {
		id: string;
		points: Array<{ lat: number; lng: number }>;
		isClosed: boolean; // polygon closed via tap-near-first-point
		history: EntitySnapshot[];
		historyIndex: number;
	}

	let entities: Entity[] = $state([]);
	let activeIndex = $state(-1);

	// --- Derived UI state ----------------------------------------------------
	const minVertices = mode === 'line' ? 2 : 3;

	let activeEntity = $derived<Entity | null>(
		activeIndex >= 0 && activeIndex < entities.length ? entities[activeIndex] : null
	);
	let canUndo = $derived(
		activeEntity
			? activeEntity.history.length > 0 && activeEntity.historyIndex > 0
			: false
	);
	let canRedo = $derived(
		activeEntity
			? activeEntity.history.length > 0 &&
				activeEntity.historyIndex < activeEntity.history.length - 1
			: false
	);
	let canDelete = $derived(activeIndex !== -1);
	let hasCommittable = $derived(
		entities.some((e) => e.points.length >= minVertices)
	);

	// --- Leaflet layer bookkeeping (refs, not $state) ------------------------
	// Per-entity Leaflet handles so we can update styles / geometry on the fly
	// without tearing everything down on every state change.
	interface EntityLayers {
		shape: any; // L.Polyline or L.Polygon
		firstMarker: LMarker | null;
	}
	const entityLayers = new Map<string, EntityLayers>();

	const ACTIVE_COLOR = '#ef4444'; // red-500, legacy used #FF0000
	const IDLE_COLOR = '#3b82f6'; // blue-500, legacy used #3388ff

	// --- Lifecycle -----------------------------------------------------------
	onMount(async () => {
		L = (await import('leaflet')).default ?? (await import('leaflet'));

		// Start the session with an auto-created entity so the user can tap to
		// begin drawing right away. Matches MeasureTool._onActivate lines 131-145.
		startNewEntity();

		map.doubleClickZoom.disable();
		map.getContainer().classList.add('geometry-draw-active');
		map.on('click', handleMapClick);
	});

	onDestroy(() => {
		map.off('click', handleMapClick);
		map.doubleClickZoom.enable();
		map.getContainer().classList.remove('geometry-draw-active');
		clearAllLayers();
	});

	// --- Map interaction -----------------------------------------------------
	function handleMapClick(e: LeafletMouseEvent) {
		if (!activeEntity) {
			startNewEntity();
		}
		const ent = entities[activeIndex];
		if (!ent) return;

		// Every map click adds a vertex. Closing a polygon is done by tapping
		// the first-vertex marker directly (handled in the marker's click
		// handler below) or by pressing OK, which auto-commits. The legacy
		// zoom-scaled distance threshold was too loose at typical zoom levels
		// -- at zoom 14 its radius is ~80m, which swallows most interior taps
		// and made it impossible to extend a triangle into a quadrilateral.
		const next = {
			points: [...ent.points, { lat: e.latlng.lat, lng: e.latlng.lng }],
			isClosed: ent.isClosed
		};
		pushEntitySnapshot(activeIndex, next);
	}

	function closeActiveRing() {
		const idx = activeIndex;
		if (idx === -1) return;
		const ent = entities[idx];
		if (!ent || ent.points.length < minVertices) return;

		pushEntitySnapshot(idx, {
			points: ent.points.slice(),
			isClosed: true
		});

		// Closing also implicitly "commits" the entity and opens a fresh one
		// ready for the next shape, so the user can keep drawing more polygons
		// without first tapping +.
		startNewEntity();
	}

	// --- Entity management ---------------------------------------------------
	function startNewEntity() {
		// Auto-commit current entity if it's mid-draw with enough vertices. If
		// it's still below the min-vertex threshold, drop it silently to keep
		// the numbered tab list clean -- legacy behavior from
		// _completeMeasurement lines 577-589.
		if (activeEntity && activeEntity.points.length > 0 && activeEntity.points.length < minVertices) {
			// Remove the stub entity before creating a new one
			entities = entities.slice(0, -1);
		}

		const fresh: Entity = {
			id: `entity-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			points: [],
			isClosed: false,
			history: [{ points: [], isClosed: false }],
			historyIndex: 0
		};
		entities = [...entities, fresh];
		activeIndex = entities.length - 1;
	}

	function activateEntity(i: number) {
		if (i < 0 || i >= entities.length) return;
		activeIndex = i;
	}

	function deleteActiveEntity() {
		if (activeIndex === -1) return;
		const deletedId = entities[activeIndex].id;
		const layers = entityLayers.get(deletedId);
		if (layers) removeEntityLayers(layers);
		entityLayers.delete(deletedId);

		entities = entities.filter((_, i) => i !== activeIndex);
		if (entities.length > 0) {
			activeIndex = entities.length - 1;
		} else {
			activeIndex = -1;
			// Start a fresh entity so the user can immediately continue
			// drawing without having to tap +. Matches legacy ergonomics.
			startNewEntity();
		}
	}

	function undo() {
		if (!canUndo || activeIndex === -1) return;
		const ent = entities[activeIndex];
		const nextIndex = ent.historyIndex - 1;
		const snap = ent.history[nextIndex];
		entities = entities.map((e, i) =>
			i === activeIndex
				? {
						...e,
						points: snap.points.slice(),
						isClosed: snap.isClosed,
						historyIndex: nextIndex
					}
				: e
		);
	}

	function redo() {
		if (!canRedo || activeIndex === -1) return;
		const ent = entities[activeIndex];
		const nextIndex = ent.historyIndex + 1;
		const snap = ent.history[nextIndex];
		entities = entities.map((e, i) =>
			i === activeIndex
				? {
						...e,
						points: snap.points.slice(),
						isClosed: snap.isClosed,
						historyIndex: nextIndex
					}
				: e
		);
	}

	function pushEntitySnapshot(
		idx: number,
		next: { points: Array<{ lat: number; lng: number }>; isClosed: boolean }
	) {
		entities = entities.map((e, i) => {
			if (i !== idx) return e;
			// Truncate the forward redo-tail when branching history, matching
			// MeasureTool._addToMeasurementHistory lines 1210-1213.
			const trimmedHistory = e.history.slice(0, e.historyIndex + 1);
			const snapshot: EntitySnapshot = {
				points: next.points.slice(),
				isClosed: next.isClosed
			};
			return {
				...e,
				points: next.points.slice(),
				isClosed: next.isClosed,
				history: [...trimmedHistory, snapshot],
				historyIndex: trimmedHistory.length
			};
		});
	}

	// --- Leaflet render ------------------------------------------------------
	// One reactive pass per state change. Re-renders each entity by diffing
	// against the cached `entityLayers` map so Leaflet internals are updated
	// in place rather than torn down wholesale (keeps drag handlers alive).
	$effect(() => {
		if (!L) return;
		const seen = new Set<string>();

		for (let i = 0; i < entities.length; i++) {
			const ent = entities[i];
			seen.add(ent.id);

			const isActive = i === activeIndex;
			const color = isActive ? ACTIVE_COLOR : IDLE_COLOR;

			const latlngs = ent.points.map((p) => L!.latLng(p.lat, p.lng));

			let layers = entityLayers.get(ent.id);
			if (!layers) {
				// `interactive: false` is critical for polygons: otherwise on
				// mobile every tap inside the fill hits the polygon layer and
				// never reaches the map's click handler, so users can't add a
				// 4th vertex inside a triangle. Activation is done via the
				// numbered tabs in the top-right control stack.
				const shape =
					mode === 'line'
						? L.polyline(latlngs, {
								color,
								weight: isActive ? 4 : 3,
								opacity: 0.85,
								dashArray: ent.isClosed ? undefined : '5, 5',
								interactive: false
							})
						: L.polygon(latlngs, {
								color,
								weight: isActive ? 3 : 2,
								opacity: 0.85,
								fillColor: color,
								fillOpacity: ent.isClosed ? 0.25 : 0.1,
								dashArray: ent.isClosed ? undefined : '5, 5',
								interactive: false
							});
				shape.addTo(map);
				layers = { shape, firstMarker: null };
				entityLayers.set(ent.id, layers);
			} else {
				layers.shape.setLatLngs(latlngs);
				if (mode === 'polygon') {
					layers.shape.setStyle({
						color,
						weight: isActive ? 3 : 2,
						fillColor: color,
						fillOpacity: ent.isClosed ? 0.25 : 0.1,
						dashArray: ent.isClosed ? undefined : '5, 5'
					});
				} else {
					layers.shape.setStyle({
						color,
						weight: isActive ? 4 : 3,
						dashArray: ent.isClosed ? undefined : '5, 5'
					});
				}
			}

			// First-vertex marker: draggable anchor for the entity.
			// Matches MeasureTool lines 700-733: only the first point gets a
			// handle; moving it repositions the anchor and updates history.
			if (ent.points.length > 0) {
				const first = ent.points[0];
				if (!layers.firstMarker) {
					const marker = L.marker([first.lat, first.lng], {
						icon: L.divIcon({
							className: 'geometry-draw-vertex',
							html: `<span style="background:${color};"></span>`,
							iconSize: [14, 14],
							iconAnchor: [7, 7]
						}),
						draggable: true,
						keyboard: false
					}).addTo(map);
					marker.on('drag', (ev: any) => {
						const idx = entities.findIndex((x) => x.id === ent.id);
						if (idx === -1) return;
						const curr = entities[idx];
						const newPoints = curr.points.slice();
						newPoints[0] = { lat: ev.latlng.lat, lng: ev.latlng.lng };
						entities = entities.map((e, j) =>
							j === idx ? { ...e, points: newPoints } : e
						);
					});
					marker.on('dragend', () => {
						const idx = entities.findIndex((x) => x.id === ent.id);
						if (idx === -1) return;
						pushEntitySnapshot(idx, {
							points: entities[idx].points.slice(),
							isClosed: entities[idx].isClosed
						});
					});
					marker.on('click', (ev: LeafletMouseEvent) => {
						L!.DomEvent.stopPropagation(ev);
						const idx = entities.findIndex((x) => x.id === ent.id);
						if (idx === -1) return;
						activateEntity(idx);
						// Tap-first-vertex-to-close for polygons. Duplicates the
						// map-click threshold path for users who want to be
						// precise about it. Legacy behavior, MeasureTool:728.
						if (mode === 'polygon' && entities[idx].points.length >= minVertices) {
							closeActiveRing();
						}
					});
					layers.firstMarker = marker;
				} else {
					layers.firstMarker.setLatLng([first.lat, first.lng]);
					layers.firstMarker.setIcon(
						L.divIcon({
							className: 'geometry-draw-vertex',
							html: `<span style="background:${color};"></span>`,
							iconSize: [14, 14],
							iconAnchor: [7, 7]
						})
					);
				}
			} else if (layers.firstMarker) {
				map.removeLayer(layers.firstMarker);
				layers.firstMarker = null;
			}
		}

		// Drop layers for entities that no longer exist (deletes).
		for (const [id, layers] of entityLayers) {
			if (!seen.has(id)) {
				removeEntityLayers(layers);
				entityLayers.delete(id);
			}
		}
	});

	function removeEntityLayers(layers: EntityLayers) {
		if (layers.shape) map.removeLayer(layers.shape);
		if (layers.firstMarker) map.removeLayer(layers.firstMarker);
	}

	function clearAllLayers() {
		for (const layers of entityLayers.values()) {
			removeEntityLayers(layers);
		}
		entityLayers.clear();
	}

	// --- Confirm / Cancel ----------------------------------------------------
	function confirm() {
		// Keep only entities with enough vertices. Matches legacy auto-drop of
		// incomplete measurements.
		const valid = entities.filter((e) => e.points.length >= minVertices);
		if (valid.length === 0) return;

		if (mode === 'line') {
			if (valid.length === 1) {
				const coords = valid[0].points.map(
					(p) => [p.lng, p.lat] as [number, number]
				);
				onConfirm({
					type: 'Feature',
					properties: {},
					geometry: { type: 'LineString', coordinates: coords }
				});
			} else {
				const lines = valid.map((e) =>
					e.points.map((p) => [p.lng, p.lat] as [number, number])
				);
				onConfirm({
					type: 'Feature',
					properties: {},
					geometry: { type: 'MultiLineString', coordinates: lines }
				});
			}
			return;
		}

		// Polygon mode: build closed rings.
		const ringFor = (e: Entity): [number, number][] => {
			const ring = e.points.map((p) => [p.lng, p.lat] as [number, number]);
			ring.push([ring[0][0], ring[0][1]]);
			return ring;
		};

		if (valid.length === 1) {
			onConfirm({
				type: 'Feature',
				properties: {},
				geometry: { type: 'Polygon', coordinates: [ringFor(valid[0])] }
			});
		} else {
			onConfirm({
				type: 'Feature',
				properties: {},
				geometry: {
					type: 'MultiPolygon',
					coordinates: valid.map((e) => [ringFor(e)])
				}
			});
		}
	}
</script>

<!-- Grey control stack, top-right. Matches the legacy leaflet-bar look: white
     surface, small square buttons, divider rows. Each button is a Leaflet-
     style chip so the user can tap them without map clicks passing through. -->
<div
	class="geometry-draw-controls"
	role="toolbar"
	aria-label="Zeichenwerkzeug"
>
	<button type="button" class="dt-btn" title="Abbrechen" aria-label="Abbrechen" onclick={onCancel}>
		<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
	</button>

	<button
		type="button"
		class="dt-btn"
		title="Neues Element"
		aria-label="Neues Element"
		onclick={startNewEntity}
	>
		<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
	</button>

	<!-- Numbered entity tabs. Active one is outlined in the accent color. -->
	{#each entities as ent, i (ent.id)}
		<button
			type="button"
			class="dt-btn dt-tab"
			class:active={i === activeIndex}
			title={`Element ${i + 1}`}
			aria-label={`Element ${i + 1}`}
			onclick={() => activateEntity(i)}
		>
			{i + 1}
		</button>
	{/each}

	{#if canUndo}
		<button type="button" class="dt-btn" title="Rückgängig" aria-label="Rückgängig" onclick={undo}>
			<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.3 2.6L3 13"></path></svg>
		</button>
	{/if}

	{#if canRedo}
		<button type="button" class="dt-btn" title="Wiederherstellen" aria-label="Wiederherstellen" onclick={redo}>
			<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"></path><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.3 2.6L21 13"></path></svg>
		</button>
	{/if}

	{#if canDelete}
		<button
			type="button"
			class="dt-btn dt-danger"
			title="Element löschen"
			aria-label="Element löschen"
			onclick={deleteActiveEntity}
		>
			<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>
		</button>
	{/if}

	<button
		type="button"
		class="dt-btn dt-ok"
		class:enabled={hasCommittable}
		title="Fertig"
		aria-label="Fertig"
		disabled={!hasCommittable}
		onclick={confirm}
	>
		<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
	</button>
</div>

<style>
	/* Stack of grey leaflet-bar-style buttons, top-right. 5px gap between
	   buttons matches legacy .leaflet-control margin-bottom. Sits above the
	   map (z-index 1000) but below dialogs / sheets. */
	.geometry-draw-controls {
		position: absolute;
		top: 1rem;
		right: 1rem;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		gap: 5px;
		pointer-events: auto;
	}
	.dt-btn {
		width: 36px;
		height: 36px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: #fff;
		color: #333;
		border: 1px solid rgba(0, 0, 0, 0.2);
		border-radius: 4px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
		cursor: pointer;
		padding: 0;
		font-size: 14px;
		font-weight: 500;
		transition: background-color 0.15s;
	}
	.dt-btn:hover:not(:disabled) {
		background: #f4f4f4;
	}
	.dt-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.dt-tab {
		font-weight: 600;
		border-left: 3px solid transparent;
	}
	.dt-tab.active {
		color: #ef4444;
		border-left-color: #ef4444;
		font-weight: 700;
	}
	.dt-danger {
		color: #b91c1c;
	}
	.dt-ok {
		background: #e5e7eb;
		color: #6b7280;
	}
	.dt-ok.enabled {
		background: #10b981;
		color: #fff;
		border-color: #059669;
	}
	.dt-ok.enabled:hover {
		background: #059669;
	}

	:global(.geometry-draw-active.leaflet-container) {
		cursor: crosshair;
	}

	/* Vertex dot styling. Matches legacy measurement-point / drawing-point:
	   small colored circle with white border and soft shadow. */
	:global(.geometry-draw-vertex) {
		cursor: move;
	}
	:global(.geometry-draw-vertex span) {
		display: block;
		width: 10px;
		height: 10px;
		border-radius: 999px;
		border: 2px solid white;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
	}

	/* Touch target bump on small screens, mirrors legacy tools-panel.css:298. */
	@media (max-width: 768px) {
		.dt-btn {
			width: 40px;
			height: 40px;
			font-size: 16px;
		}
	}
</style>
