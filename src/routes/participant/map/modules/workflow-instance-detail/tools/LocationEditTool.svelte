<script lang="ts">
	/**
	 * LocationEditTool - Map location picker tool for workflow instances
	 *
	 * Displays a draggable marker on the map with a dashed line connecting
	 * to a confirm button. Used for both creating new workflow instances
	 * and editing existing instance locations.
	 */
	import { onMount, onDestroy } from 'svelte';
	import type { Map as LeafletMap, Marker, Polyline, LatLng } from 'leaflet';

	interface Props {
		/** The Leaflet map instance */
		map?: LeafletMap | null;
		/** Initial coordinates (for edit mode) */
		initialCoordinates?: { lat: number; lng: number } | null;
		/** Button label (e.g., "Confirm" or "Update Location") */
		confirmLabel?: string;
		/** Callback when location is confirmed */
		onConfirm?: (coordinates: { lat: number; lng: number }) => void;
		/** Callback when location picking is cancelled */
		onCancel?: () => void;
		/** Whether the picker is currently active */
		isActive?: boolean;
	}

	let {
		map = null,
		initialCoordinates = null,
		confirmLabel = 'Confirm Location',
		onConfirm,
		onCancel,
		isActive = $bindable(true)
	}: Props = $props();

	// Leaflet objects - plain variables (NOT $state) to avoid Svelte proxying them
	// Proxied Leaflet objects break .remove() calls
	let tempMarker: Marker | null = null;
	let connectionLine: Polyline | null = null;
	let currentCoordinates: LatLng | null = null;
	let animationFrameId: number | null = null;

	// DOM binding - needs $state for bind:this
	let confirmButtonEl: HTMLDivElement | null = $state(null);

	// Leaflet library - needs $state to trigger $effect when loaded
	let L: any = $state(null);

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
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
		}
	});

	// Track whether we've entered picker mode to ensure cleanup (must be non-reactive to avoid effect loop)
	let hasEnteredPickerMode = false;
	// Separate flag for RAF callback check (set synchronously)
	let isPickerModeActive = false;

	// React to isActive changes
	$effect(() => {
		if (isActive && map && L) {
			if (!hasEnteredPickerMode) {
				enterPickerMode();
				hasEnteredPickerMode = true;
			}
		} else if (hasEnteredPickerMode) {
			// isActive became false or dependencies changed - clean up
			exitPickerMode();
			hasEnteredPickerMode = false;
		}
	});

	function enterPickerMode() {
		if (!map || !L) return;

		isPickerModeActive = true;

		// Use initial coordinates if provided, otherwise use map center
		const startPos = initialCoordinates
			? L.latLng(initialCoordinates.lat, initialCoordinates.lng)
			: map.getCenter();

		addTemporaryMarker(startPos);

		map.on('click', handleMapClick);
		map.on('move', updateConnectionLine);
		map.on('zoom', updateConnectionLine);
	}

	function exitPickerMode() {
		// Mark as inactive first to prevent any pending callbacks from creating new elements
		isPickerModeActive = false;

		// Cancel any pending animation frame to prevent race condition
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}

		// Always clean up Leaflet objects (they use .remove() which doesn't need map)
		removeTemporaryMarker();
		removeConnectionLine();

		// Remove event listeners if map is still available
		if (map) {
			map.off('click', handleMapClick);
			map.off('move', updateConnectionLine);
			map.off('zoom', updateConnectionLine);
		}

		currentCoordinates = null;
	}

	function addTemporaryMarker(coordinates: LatLng) {
		if (!map || !L || tempMarker) return;

		const markerIcon = L.divIcon({
			className: 'location-picker-marker',
			html: '<div class="location-picker-marker-inner"></div>',
			iconSize: [20, 20],
			iconAnchor: [10, 10]
		});

		tempMarker = L.marker(coordinates, {
			icon: markerIcon,
			draggable: true
		}).addTo(map);

		if (tempMarker) {
			tempMarker.on('drag', (event: any) => {
				currentCoordinates = event.target.getLatLng();
				updateConnectionLine();
			});
		}

		currentCoordinates = coordinates;
		updateConnectionLine();
	}

	function removeTemporaryMarker() {
		if (tempMarker) {
			tempMarker.remove(); // Leaflet's remove() doesn't need map reference
			tempMarker = null;
		}
	}

	function handleMapClick(event: any) {
		if (tempMarker) {
			const latlng = event.latlng;
			tempMarker.setLatLng(latlng);
			currentCoordinates = latlng;
			updateConnectionLine();
		}
	}

	function updateConnectionLine() {
		if (!map || !L || !confirmButtonEl || !tempMarker || !isPickerModeActive) return;

		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
		}

		animationFrameId = requestAnimationFrame(() => {
			// Early exit if cleanup started
			if (!isPickerModeActive) return;
			if (!map || !L || !confirmButtonEl || !tempMarker) return;

			removeConnectionLine();

			const buttonRect = confirmButtonEl.getBoundingClientRect();
			const mapRect = map.getContainer().getBoundingClientRect();

			const buttonCenterX = buttonRect.left + buttonRect.width / 2 - mapRect.left;
			const buttonCenterY = buttonRect.top + buttonRect.height / 2 - mapRect.top;

			const buttonLatLng = map.containerPointToLatLng([buttonCenterX, buttonCenterY]);
			const markerLatLng = tempMarker.getLatLng();

			// Create line but don't add to map yet
			const newLine = L.polyline([buttonLatLng, markerLatLng], {
				color: '#dc3545',
				weight: 2,
				opacity: 0.7,
				dashArray: '5, 5',
				interactive: false
			});

			// Final check - don't add if cleanup happened during line creation
			if (!isPickerModeActive) {
				return;
			}

			newLine.addTo(map);
			connectionLine = newLine;
			animationFrameId = null;
		});
	}

	function removeConnectionLine() {
		if (connectionLine) {
			connectionLine.remove(); // Leaflet's remove() doesn't need map reference
			connectionLine = null;
		}
	}

	function handleConfirm() {
		if (!currentCoordinates) return;

		// Immediately disable picker mode to prevent any more line updates from RAF
		isPickerModeActive = false;

		onConfirm?.({
			lat: currentCoordinates.lat,
			lng: currentCoordinates.lng
		});

		isActive = false;
	}

	function handleCancel() {
		// Immediately disable picker mode to prevent any more line updates from RAF
		isPickerModeActive = false;

		onCancel?.();
		isActive = false;
	}
</script>

{#if isActive}
	<!-- Red pill button matching WorkflowSelector style -->
	<div
		bind:this={confirmButtonEl}
		class="fixed bottom-20 left-1/2 z-[1100] flex -translate-x-1/2 items-center justify-between gap-3 rounded-full bg-destructive px-5 py-3 text-white shadow-lg lg:bottom-8"
	>
		<button
			onclick={handleConfirm}
			class="flex-1 text-center font-semibold"
		>
			{confirmLabel}
		</button>
		<button
			onclick={handleCancel}
			class="text-2xl font-bold leading-none"
			type="button"
		>
			&times;
		</button>
	</div>
{/if}

<style>
	/* Location Picker Marker Styles - Red to match WorkflowSelector */
	:global(.location-picker-marker) {
		cursor: move;
		background: transparent !important;
		border: none !important;
	}

	:global(.location-picker-marker-inner) {
		width: 20px;
		height: 20px;
		background-color: #dc3545;
		border: 2px solid white;
		border-radius: 50%;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
		position: relative;
	}

	:global(.location-picker-marker-inner::after) {
		content: '';
		position: absolute;
		top: -6px;
		left: -6px;
		right: -6px;
		bottom: -6px;
		border: 2px dashed rgba(220, 53, 69, 0.6);
		border-radius: 50%;
		animation: locationPickerPulse 2s infinite;
	}

	@keyframes locationPickerPulse {
		0% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.5;
			transform: scale(1.2);
		}
		100% {
			opacity: 1;
			transform: scale(1);
		}
	}
</style>
