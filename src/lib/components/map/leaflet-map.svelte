<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { Map as LeafletMap, TileLayer, Marker, LatLngExpression } from 'leaflet';

	interface Props {
		center?: [number, number];
		zoom?: number;
		tileUrl?: string;
		attribution?: string;
		minZoom?: number;
		maxZoom?: number;
		onMapReady?: (map: LeafletMap) => void;
		class?: string;
	}

	let {
		center = [51.505, -0.09],
		zoom = 13,
		tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
		attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
		minZoom = 1,
		maxZoom = 19,
		onMapReady,
		class: className = ''
	}: Props = $props();

	let mapContainer: HTMLDivElement;
	let map: LeafletMap | null = null;
	let tileLayer: TileLayer | null = null;

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

		// Initialize map
		map = L.map(mapContainer, {
			center: center as LatLngExpression,
			zoom: zoom,
			maxZoom: 22,
			zoomControl: false, // We'll add custom controls
			attributionControl: true
		});

		// Add zoom control to bottom right
		L.control
			.zoom({
				position: 'bottomright'
			})
			.addTo(map);

		// Add tile layer with overzooming support
		tileLayer = L.tileLayer(tileUrl, {
			attribution: attribution,
			minZoom: minZoom,
			maxZoom: 22,
			maxNativeZoom: maxZoom
		}).addTo(map);

		// Notify parent component
		if (onMapReady && map) {
			onMapReady(map);
		}

		// Fix map size after mount
		setTimeout(() => {
			map?.invalidateSize();
		}, 100);
	});

	onDestroy(() => {
		if (map) {
			map.remove();
			map = null;
		}
	});

	// Export map instance for external access
	export function getMap(): LeafletMap | null {
		return map;
	}
</script>

<div bind:this={mapContainer} class="pointer-events-auto h-full w-full {className}"></div>
