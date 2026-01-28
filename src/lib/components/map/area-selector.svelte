<script lang="ts">
	/**
	 * AreaSelector - Select an area on the map for offline download
	 *
	 * Displays a draggable marker at the center with a circle showing the radius.
	 * User can adjust radius with a slider and see estimated tile count.
	 */
	import { onMount, onDestroy } from 'svelte';
	import type { Map as LeafletMap, Marker, Circle, LatLng } from 'leaflet';
	import { Button } from '$lib/components/ui/button';
	import { calculateTileCount, estimateTileSize } from '$lib/participant-state/tile-cache.svelte';
	import { X, Download, MapPin } from 'lucide-svelte';

	interface Props {
		/** The Leaflet map instance */
		map?: LeafletMap | null;
		/** Initial center coordinates */
		initialCenter?: { lat: number; lon: number } | null;
		/** Initial radius in km */
		initialRadius?: number;
		/** Number of tile sources that will be downloaded */
		sourceCount?: number;
		/** Available zoom level range */
		minAvailableZoom?: number;
		maxAvailableZoom?: number;
		/** Initial zoom level selection */
		initialMinZoom?: number;
		initialMaxZoom?: number;
		/** Callback when area is confirmed */
		onConfirm?: (center: { lat: number; lon: number }, radiusKm: number, zoomLevels: number[]) => void;
		/** Callback when selection is cancelled */
		onCancel?: () => void;
		/** Whether the selector is currently active */
		isActive?: boolean;
	}

	let {
		map = null,
		initialCenter = null,
		initialRadius = 5,
		sourceCount = 1,
		minAvailableZoom = 10,
		maxAvailableZoom = 22,
		initialMinZoom = 12,
		initialMaxZoom = 18,
		onConfirm,
		onCancel,
		isActive = $bindable(true)
	}: Props = $props();

	// Zoom level selection state
	let minZoom = $state(initialMinZoom);
	let maxZoom = $state(initialMaxZoom);

	// Compute zoom levels array from range
	const zoomLevels = $derived(
		Array.from({ length: maxZoom - minZoom + 1 }, (_, i) => minZoom + i)
	);

	// Leaflet objects - plain variables to avoid Svelte proxying
	let centerMarker: Marker | null = null;
	let radiusCircle: Circle | null = null;

	// Reactive state - use $state for center coordinates so derived values update
	let currentCenterLat = $state<number | null>(null);
	let currentCenterLng = $state<number | null>(null);
	let radiusKm = $state(initialRadius);
	let L: typeof import('leaflet') | null = $state(null);

	// Computed values
	let tileCount = $derived(
		currentCenterLat !== null && currentCenterLng !== null
			? calculateTileCount({ lat: currentCenterLat, lon: currentCenterLng }, radiusKm, zoomLevels)
			: 0
	);
	let totalTiles = $derived(tileCount * sourceCount);
	let estimatedSizeMB = $derived(estimateTileSize(tileCount, sourceCount));
	let hasCenter = $derived(currentCenterLat !== null && currentCenterLng !== null);

	// Track picker mode state
	let hasEnteredPickerMode = false;
	let isPickerModeActive = false;

	onMount(async () => {
		if (typeof window !== 'undefined') {
			L = await import('leaflet');
			if (isActive && map) {
				enterPickerMode();
			}
		}
	});

	onDestroy(() => {
		exitPickerMode();
	});

	// React to isActive changes
	$effect(() => {
		if (isActive && map && L) {
			if (!hasEnteredPickerMode) {
				enterPickerMode();
				hasEnteredPickerMode = true;
			}
		} else if (hasEnteredPickerMode) {
			exitPickerMode();
			hasEnteredPickerMode = false;
		}
	});

	// Update circle when radius changes
	$effect(() => {
		if (radiusCircle && radiusKm) {
			radiusCircle.setRadius(radiusKm * 1000); // Convert km to meters
		}
	});

	function setCurrentCenter(lat: number, lng: number) {
		currentCenterLat = lat;
		currentCenterLng = lng;
	}

	function clearCurrentCenter() {
		currentCenterLat = null;
		currentCenterLng = null;
	}

	function enterPickerMode() {
		if (!map || !L) return;

		isPickerModeActive = true;

		// Use initial center if provided, otherwise use map center
		const startPos = initialCenter
			? L.latLng(initialCenter.lat, initialCenter.lon)
			: map.getCenter();

		addCenterMarker(startPos);
		addRadiusCircle(startPos);

		map.on('click', handleMapClick);
	}

	function exitPickerMode() {
		isPickerModeActive = false;

		removeCenterMarker();
		removeRadiusCircle();

		if (map) {
			map.off('click', handleMapClick);
		}

		clearCurrentCenter();
	}

	function addCenterMarker(coordinates: LatLng) {
		if (!map || !L || centerMarker) return;

		const markerIcon = L.divIcon({
			className: 'area-selector-marker',
			html: '<div class="area-selector-marker-inner"><div class="area-selector-marker-dot"></div></div>',
			iconSize: [32, 32],
			iconAnchor: [16, 16]
		});

		centerMarker = L.marker(coordinates, {
			icon: markerIcon,
			draggable: true
		}).addTo(map);

		centerMarker.on('drag', (event: { target: { getLatLng: () => LatLng } }) => {
			const latlng = event.target.getLatLng();
			setCurrentCenter(latlng.lat, latlng.lng);
			updateRadiusCircle(latlng);
		});

		setCurrentCenter(coordinates.lat, coordinates.lng);
	}

	function removeCenterMarker() {
		if (centerMarker) {
			centerMarker.remove();
			centerMarker = null;
		}
	}

	function addRadiusCircle(coordinates: LatLng) {
		if (!map || !L || radiusCircle) return;

		radiusCircle = L.circle(coordinates, {
			radius: radiusKm * 1000, // km to meters
			color: '#3b82f6',
			fillColor: '#3b82f6',
			fillOpacity: 0.1,
			weight: 2,
			dashArray: '8, 4'
		}).addTo(map);
	}

	function removeRadiusCircle() {
		if (radiusCircle) {
			radiusCircle.remove();
			radiusCircle = null;
		}
	}

	function updateRadiusCircle(latlng?: LatLng) {
		if (radiusCircle && latlng) {
			radiusCircle.setLatLng(latlng);
		}
	}

	function handleMapClick(event: { latlng: LatLng }) {
		if (!centerMarker || !isPickerModeActive) return;

		const latlng = event.latlng;
		centerMarker.setLatLng(latlng);
		setCurrentCenter(latlng.lat, latlng.lng);
		updateRadiusCircle(latlng);
	}

	function handleConfirm() {
		if (currentCenterLat === null || currentCenterLng === null) return;

		isPickerModeActive = false;
		onConfirm?.(
			{ lat: currentCenterLat, lon: currentCenterLng },
			radiusKm,
			zoomLevels
		);
		isActive = false;
	}

	function handleMinZoomInput(event: Event) {
		const target = event.target as HTMLInputElement;
		const value = parseInt(target.value, 10);
		// Ensure min doesn't exceed max
		minZoom = Math.min(value, maxZoom);
	}

	function handleMaxZoomInput(event: Event) {
		const target = event.target as HTMLInputElement;
		const value = parseInt(target.value, 10);
		// Ensure max doesn't go below min
		maxZoom = Math.max(value, minZoom);
	}

	function handleCancel() {
		isPickerModeActive = false;
		onCancel?.();
		isActive = false;
	}

	function handleRadiusInput(event: Event) {
		const target = event.target as HTMLInputElement;
		radiusKm = parseInt(target.value, 10);
		// Directly update the circle (can't rely on $effect for non-reactive Leaflet object)
		if (radiusCircle) {
			radiusCircle.setRadius(radiusKm * 1000);
		}
	}

	function formatSize(mb: number): string {
		if (mb < 1) {
			return `${Math.round(mb * 1024)} KB`;
		}
		return `${mb.toFixed(1)} MB`;
	}
</script>

{#if isActive}
	<!-- Control panel at bottom of screen -->
	<div
		class="fixed bottom-0 left-0 right-0 z-[1100] rounded-t-2xl bg-background/95 px-4 pb-6 pt-4 shadow-lg backdrop-blur-sm lg:bottom-4 lg:left-1/2 lg:right-auto lg:w-96 lg:-translate-x-1/2 lg:rounded-2xl"
	>
		<!-- Header -->
		<div class="mb-4 flex items-center justify-between">
			<div class="flex items-center gap-2">
				<MapPin class="h-5 w-5 text-primary" />
				<span class="font-semibold">Select Offline Area</span>
			</div>
			<button
				onclick={handleCancel}
				class="rounded-full p-1 hover:bg-muted"
				type="button"
				aria-label="Cancel"
			>
				<X class="h-5 w-5" />
			</button>
		</div>

		<!-- Instructions -->
		<p class="mb-4 text-sm text-muted-foreground">
			Tap the map or drag the marker to set the center point.
		</p>

		<!-- Radius Slider -->
		<div class="mb-4">
			<div class="mb-2 flex items-center justify-between">
				<span class="text-sm font-medium">Radius</span>
				<span class="text-sm font-semibold text-primary">{radiusKm} km</span>
			</div>
			<input
				type="range"
				min="1"
				max="25"
				step="1"
				value={radiusKm}
				oninput={handleRadiusInput}
				class="range-slider w-full"
			/>
		</div>

		<!-- Zoom Level Range -->
		<div class="mb-4">
			<div class="mb-2 flex items-center justify-between">
				<span class="text-sm font-medium">Zoom Levels</span>
				<span class="text-sm font-semibold text-primary">{minZoom} - {maxZoom}</span>
			</div>
			<div class="zoom-range-container">
				<input
					type="range"
					min={minAvailableZoom}
					max={maxAvailableZoom}
					step="1"
					value={minZoom}
					oninput={handleMinZoomInput}
					class="range-slider range-slider-min"
				/>
				<input
					type="range"
					min={minAvailableZoom}
					max={maxAvailableZoom}
					step="1"
					value={maxZoom}
					oninput={handleMaxZoomInput}
					class="range-slider range-slider-max"
				/>
				<div
					class="zoom-range-track"
					style="left: {((minZoom - minAvailableZoom) / (maxAvailableZoom - minAvailableZoom)) * 100}%; right: {100 - ((maxZoom - minAvailableZoom) / (maxAvailableZoom - minAvailableZoom)) * 100}%"
				></div>
			</div>
			<div class="mt-1 flex justify-between text-xs text-muted-foreground">
				<span>{minAvailableZoom}</span>
				<span>{maxAvailableZoom}</span>
			</div>
		</div>

		<!-- Estimate -->
		<div class="mb-4 rounded-lg bg-muted/50 p-3">
			<div class="flex items-center justify-between text-sm">
				<span class="text-muted-foreground">Estimated download</span>
				<span class="font-medium">{formatSize(estimatedSizeMB)}</span>
			</div>
			<div class="mt-1 flex items-center justify-between text-sm">
				<span class="text-muted-foreground">Tiles ({sourceCount} layer{sourceCount !== 1 ? 's' : ''})</span>
				<span class="font-medium">{totalTiles.toLocaleString()}</span>
			</div>
		</div>

		<!-- Buttons -->
		<div class="flex gap-3">
			<Button variant="outline" class="flex-1" onclick={handleCancel}>
				Cancel
			</Button>
			<Button class="flex-1" onclick={handleConfirm} disabled={!hasCenter}>
				<Download class="mr-2 h-4 w-4" />
				Download Area
			</Button>
		</div>
	</div>
{/if}

<style>
	/* Area Selector Marker Styles */
	:global(.area-selector-marker) {
		cursor: move;
		background: transparent !important;
		border: none !important;
	}

	:global(.area-selector-marker-inner) {
		width: 32px;
		height: 32px;
		background-color: #3b82f6;
		border: 3px solid white;
		border-radius: 50%;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
	}

	:global(.area-selector-marker-dot) {
		width: 8px;
		height: 8px;
		background-color: white;
		border-radius: 50%;
	}

	:global(.area-selector-marker-inner::after) {
		content: '';
		position: absolute;
		top: -8px;
		left: -8px;
		right: -8px;
		bottom: -8px;
		border: 2px dashed rgba(59, 130, 246, 0.5);
		border-radius: 50%;
		animation: areaSelectorPulse 2s infinite;
	}

	@keyframes areaSelectorPulse {
		0% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.4;
			transform: scale(1.15);
		}
		100% {
			opacity: 1;
			transform: scale(1);
		}
	}

	/* Range slider styling */
	.range-slider {
		-webkit-appearance: none;
		appearance: none;
		height: 8px;
		background: hsl(var(--muted));
		border-radius: 4px;
		outline: none;
	}

	.range-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 20px;
		height: 20px;
		background: hsl(var(--primary));
		border-radius: 50%;
		cursor: pointer;
		border: 2px solid white;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}

	.range-slider::-moz-range-thumb {
		width: 20px;
		height: 20px;
		background: hsl(var(--primary));
		border-radius: 50%;
		cursor: pointer;
		border: 2px solid white;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}

	/* Dual range slider for zoom levels */
	.zoom-range-container {
		position: relative;
		height: 8px;
	}

	.zoom-range-container .range-slider {
		position: absolute;
		width: 100%;
		height: 8px;
		background: transparent;
		pointer-events: none;
	}

	.zoom-range-container .range-slider::-webkit-slider-thumb {
		pointer-events: auto;
		position: relative;
		z-index: 2;
	}

	.zoom-range-container .range-slider::-moz-range-thumb {
		pointer-events: auto;
		position: relative;
		z-index: 2;
	}

	.range-slider-min {
		z-index: 1;
	}

	.range-slider-max {
		z-index: 2;
	}

	.zoom-range-track {
		position: absolute;
		top: 0;
		height: 8px;
		background: hsl(var(--primary));
		border-radius: 4px;
		pointer-events: none;
	}

	/* Background track for zoom range */
	.zoom-range-container::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 8px;
		background: hsl(var(--muted));
		border-radius: 4px;
	}
</style>
