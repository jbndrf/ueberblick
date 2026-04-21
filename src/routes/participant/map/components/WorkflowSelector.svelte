<script lang="ts">
	import { Plus } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { onMount, onDestroy } from 'svelte';
	import * as m from '$lib/paraglide/messages';
	import type { Map as LeafletMap, Marker, Polyline, LatLng } from 'leaflet';

	interface Workflow {
		id: string;
		name: string;
		workflow_type: 'incident' | 'survey';
		geometry_type?: 'point' | 'line' | 'polygon';
		description?: string;
		entry_button_label?: string;
	}

	interface Props {
		workflows: Workflow[];
		map?: LeafletMap | null;
		onWorkflowSelect?: (workflow: Workflow, coordinates?: { lat: number; lng: number }) => void;
		/** Called for incident workflows whose geometry_type is line or polygon.
		 *  Parent mounts the draw tool and runs onWorkflowSelect with the feature
		 *  once drawn. */
		onDrawGeometry?: (workflow: Workflow, mode: 'line' | 'polygon') => void;
		isOpen?: boolean;
		onOpenChange?: (open: boolean) => void;
		isSelectingCoordinates?: boolean;
	}

	let {
		workflows = [],
		map = null,
		onWorkflowSelect,
		onDrawGeometry,
		isOpen = $bindable(false),
		onOpenChange,
		isSelectingCoordinates = $bindable(false)
	}: Props = $props();

	// State
	let coordinateSelectionMode = $state(false);

	// Sync coordinate selection state
	$effect(() => {
		isSelectingCoordinates = coordinateSelectionMode;
	});
	let selectedWorkflow: Workflow | null = $state(null);
	let tempMarker: Marker | null = $state(null);
	let connectionLine: Polyline | null = $state(null);
	let currentCoordinates: LatLng | null = $state(null);
	let confirmButtonEl: HTMLDivElement | null = $state(null);
	let animationFrameId: number | null = null;

	// Leaflet library (loaded dynamically)
	let L: any = null;

	onMount(async () => {
		if (typeof window !== 'undefined') {
			L = await import('leaflet');
		}
	});

	onDestroy(() => {
		exitCoordinateSelectionMode();
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
		}
	});

	function toggleMenu() {
		isOpen = !isOpen;
		onOpenChange?.(isOpen);
	}

	function closeMenu() {
		isOpen = false;
		onOpenChange?.(false);
	}

	function selectWorkflow(workflow: Workflow) {
		selectedWorkflow = workflow;
		closeMenu();

		if (workflow.workflow_type === 'incident') {
			// Geometry shape decides the input UX. Legacy point flow for 'point'
			// (or missing geometry_type, which the migration back-fills to 'point');
			// the draw tool handles 'line' and 'polygon'.
			const geom = workflow.geometry_type ?? 'point';
			if (geom === 'line' || geom === 'polygon') {
				// We are not owning a coordinate-selection session for draw mode;
				// parent mounts the geometry-draw-tool. Clear any transient state
				// we may have accumulated from a prior incident selection.
				selectedWorkflow = null;
				onDrawGeometry?.(workflow, geom);
				return;
			}
			enterCoordinateSelectionMode();
		} else {
			onWorkflowSelect?.(workflow);
		}
	}

	function enterCoordinateSelectionMode() {
		if (!map || !L) return;

		coordinateSelectionMode = true;

		const center = map.getCenter();
		addTemporaryMarker(center);

		map.on('click', handleMapClick);
		map.on('move', updateConnectionLine);
		map.on('zoom', updateConnectionLine);
	}

	function exitCoordinateSelectionMode() {
		if (!map) return;

		coordinateSelectionMode = false;
		removeTemporaryMarker();
		removeConnectionLine();

		map.off('click', handleMapClick);
		map.off('move', updateConnectionLine);
		map.off('zoom', updateConnectionLine);

		selectedWorkflow = null;
		currentCoordinates = null;
	}

	function addTemporaryMarker(coordinates: LatLng) {
		if (!map || !L || tempMarker) return;

		const markerIcon = L.divIcon({
			className: 'temp-marker',
			html: '<div class="temp-marker-inner"></div>',
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
		if (tempMarker && map) {
			map.removeLayer(tempMarker);
			tempMarker = null;
		}
	}

	function handleMapClick(event: any) {
		if (coordinateSelectionMode && tempMarker) {
			const latlng = event.latlng;
			tempMarker.setLatLng(latlng);
			currentCoordinates = latlng;
			updateConnectionLine();
		}
	}

	function updateConnectionLine() {
		if (!map || !L || !confirmButtonEl || !tempMarker) return;

		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
		}

		animationFrameId = requestAnimationFrame(() => {
			if (!map || !L || !confirmButtonEl || !tempMarker) return;

			removeConnectionLine();

			const buttonRect = confirmButtonEl.getBoundingClientRect();
			const mapRect = map.getContainer().getBoundingClientRect();

			const buttonCenterX = buttonRect.left + buttonRect.width / 2 - mapRect.left;
			const buttonCenterY = buttonRect.top + buttonRect.height / 2 - mapRect.top;

			const buttonLatLng = map.containerPointToLatLng([buttonCenterX, buttonCenterY]);
			const markerLatLng = tempMarker.getLatLng();

			connectionLine = L.polyline([buttonLatLng, markerLatLng], {
				color: '#dc3545',
				weight: 2,
				opacity: 0.7,
				dashArray: '5, 5',
				interactive: false
			}).addTo(map);

			animationFrameId = null;
		});
	}

	function removeConnectionLine() {
		if (connectionLine && map) {
			map.removeLayer(connectionLine);
			connectionLine = null;
		}
	}

	function confirmCoordinateSelection() {
		if (!selectedWorkflow || !currentCoordinates) return;

		onWorkflowSelect?.(selectedWorkflow, {
			lat: currentCoordinates.lat,
			lng: currentCoordinates.lng
		});

		exitCoordinateSelectionMode();
	}
</script>

{#if coordinateSelectionMode && selectedWorkflow}
	<!-- Coordinate Selection Mode UI -->
	<div
		bind:this={confirmButtonEl}
		class="fixed bottom-20 left-1/2 z-[1100] flex -translate-x-1/2 items-center justify-between gap-3 rounded-full bg-destructive px-5 py-3 text-white shadow-lg lg:bottom-8"
	>
		<button
			onclick={confirmCoordinateSelection}
			class="flex-1 text-center font-semibold"
		>
			{selectedWorkflow.entry_button_label || selectedWorkflow.name}
		</button>
		<button
			onclick={exitCoordinateSelectionMode}
			class="text-2xl font-bold leading-none"
			type="button"
		>
			&times;
		</button>
	</div>
{:else}
	<!-- Popover Menu -->
	{#if isOpen && workflows.length > 0}
		<!-- Backdrop -->
		<button
			onclick={closeMenu}
			class="fixed inset-0 z-[1050]"
			aria-label={m.mapCloseMenu?.() ?? 'Close menu'}
		></button>

		<!-- Popover - Mobile: bottom, Desktop: top below header -->
		<div class="fixed z-[1100] flex flex-col items-center gap-2.5 bottom-20 left-1/2 -translate-x-1/2 md:bottom-auto md:top-16 md:left-1/2 md:-translate-x-1/2">
			{#each workflows as workflow, i}
				<button
					onclick={() => selectWorkflow(workflow)}
					class="workflow-item min-w-[100px] max-w-[200px] rounded-xl
						bg-background/95 dark:bg-muted/90
						border border-border/50 dark:border-border/30
						px-4 py-2.5 text-sm font-medium text-foreground
						shadow-lg shadow-black/5 dark:shadow-black/20
						backdrop-blur-md
						transition-all duration-200 ease-out
						hover:bg-accent hover:border-accent-foreground/20 hover:scale-[1.02]
						active:scale-[0.98]"
					style="animation-delay: {i * 0.03}s"
				>
					<span class="line-clamp-2 text-center leading-snug">{workflow.entry_button_label || workflow.name}</span>
				</button>
			{/each}
		</div>
	{/if}
{/if}

<style>
	.workflow-item {
		animation: slideIn 0.2s ease-out backwards;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Line clamp for button text */
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* Temporary Marker Styles */
	:global(.temp-marker) {
		cursor: move;
		background: transparent !important;
		border: none !important;
	}

	:global(.temp-marker-inner) {
		width: 20px;
		height: 20px;
		background-color: rgba(220, 53, 69, 0.9);
		border: 2px solid white;
		border-radius: 50%;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
		position: relative;
	}

	:global(.temp-marker-inner::after) {
		content: '';
		position: absolute;
		top: -6px;
		left: -6px;
		right: -6px;
		bottom: -6px;
		border: 2px dashed rgba(220, 53, 69, 0.6);
		border-radius: 50%;
		animation: markerPulse 2s infinite;
	}

	@keyframes markerPulse {
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
