<script lang="ts">
	import { Plus, X, MapPin, FileText, AlertCircle } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as m from '$lib/paraglide/messages';
	import { onMount, onDestroy } from 'svelte';
	import type { Map as LeafletMap, Marker, Polyline, LatLng } from 'leaflet';

	interface Workflow {
		id: string;
		name: string;
		workflow_type: 'incident' | 'survey' | 'simple';
		description?: string;
	}

	interface Props {
		workflows: Workflow[];
		map?: LeafletMap | null;
		onWorkflowSelect?: (workflow: Workflow, coordinates?: { lat: number; lng: number }) => void;
		position?: 'bottom-right' | 'bottom-left';
	}

	let { workflows = [], map = null, onWorkflowSelect, position = 'bottom-right' }: Props = $props();

	// State
	let isOpen = $state(false);
	let coordinateSelectionMode = $state(false);
	let selectedWorkflow: Workflow | null = $state(null);
	let tempMarker: Marker | null = $state(null);
	let connectionLine: Polyline | null = $state(null);
	let currentCoordinates: LatLng | null = $state(null);
	let reportButtonEl: HTMLDivElement | null = $state(null);
	let fabVisible = $state(true);
	let animationFrameId: number | null = null;

	// Leaflet library (loaded dynamically)
	let L: any = null;

	onMount(async () => {
		// Load Leaflet dynamically
		if (typeof window !== 'undefined') {
			L = await import('leaflet');

			// Listen for bottom sheet events
			window.addEventListener('bottom-sheet:opened', handleBottomSheetOpened);
			window.addEventListener('bottom-sheet:closed', handleBottomSheetClosed);
		}
	});

	onDestroy(() => {
		// Clean up
		exitCoordinateSelectionMode();

		if (typeof window !== 'undefined') {
			window.removeEventListener('bottom-sheet:opened', handleBottomSheetOpened);
			window.removeEventListener('bottom-sheet:closed', handleBottomSheetClosed);
		}

		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
		}
	});

	function handleBottomSheetOpened() {
		fabVisible = false;
	}

	function handleBottomSheetClosed() {
		fabVisible = true;
	}

	function toggleMenu() {
		isOpen = !isOpen;
	}

	function selectWorkflow(workflow: Workflow) {
		selectedWorkflow = workflow;
		isOpen = false;

		// For incident workflows, enter coordinate selection mode
		if (workflow.workflow_type === 'incident') {
			enterCoordinateSelectionMode();
		} else {
			// For survey/simple workflows, start immediately
			onWorkflowSelect?.(workflow);
		}
	}

	function enterCoordinateSelectionMode() {
		if (!map || !L) return;

		coordinateSelectionMode = true;

		// Add temporary marker at map center
		const center = map.getCenter();
		addTemporaryMarker(center);

		// Setup map click handler
		map.on('click', handleMapClick);
		map.on('move', updateConnectionLine);
		map.on('zoom', updateConnectionLine);

		// Dispatch event
		if (typeof window !== 'undefined') {
			window.dispatchEvent(
				new CustomEvent('fab-menu:coordinate-selection-entered', {
					detail: { workflowId: selectedWorkflow?.id, workflowName: selectedWorkflow?.name }
				})
			);
		}
	}

	function exitCoordinateSelectionMode() {
		if (!map) return;

		coordinateSelectionMode = false;
		removeTemporaryMarker();
		removeConnectionLine();

		// Remove event listeners
		map.off('click', handleMapClick);
		map.off('move', updateConnectionLine);
		map.off('zoom', updateConnectionLine);

		selectedWorkflow = null;
		currentCoordinates = null;

		if (typeof window !== 'undefined') {
			window.dispatchEvent(new CustomEvent('fab-menu:coordinate-selection-exited'));
		}
	}

	function addTemporaryMarker(coordinates: LatLng) {
		if (!map || !L || tempMarker) return;

		// Create custom marker icon
		const markerIcon = L.divIcon({
			className: 'temp-marker',
			html: '<div class="temp-marker-inner"></div>',
			iconSize: [20, 20],
			iconAnchor: [10, 10]
		});

		// Add marker
		tempMarker = L.marker(coordinates, {
			icon: markerIcon,
			draggable: true
		}).addTo(map);

		// Setup drag handler
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
		if (!map || !L || !reportButtonEl || !tempMarker) return;

		// Use requestAnimationFrame to throttle updates
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
		}

		animationFrameId = requestAnimationFrame(() => {
			if (!map || !L || !reportButtonEl || !tempMarker) return;

			// Remove existing line
			removeConnectionLine();

			// Get button position
			const buttonRect = reportButtonEl.getBoundingClientRect();
			const mapRect = map.getContainer().getBoundingClientRect();

			// Calculate button center relative to map
			const buttonCenterX = buttonRect.left + buttonRect.width / 2 - mapRect.left;
			const buttonCenterY = buttonRect.top + buttonRect.height / 2 - mapRect.top;

			// Convert to lat/lng
			const buttonLatLng = map.containerPointToLatLng([buttonCenterX, buttonCenterY]);
			const markerLatLng = tempMarker.getLatLng();

			// Create connection line
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

		// Call the callback with coordinates
		onWorkflowSelect?.(selectedWorkflow, {
			lat: currentCoordinates.lat,
			lng: currentCoordinates.lng
		});

		// Exit coordinate selection mode
		exitCoordinateSelectionMode();
	}

	function getWorkflowIcon(type: string) {
		switch (type) {
			case 'incident':
				return AlertCircle;
			case 'survey':
				return FileText;
			default:
				return MapPin;
		}
	}

	function getWorkflowTypeLabel(type: string): string {
		switch (type) {
			case 'incident':
				return 'Incident';
			case 'survey':
				return 'Survey';
			case 'simple':
				return 'Simple';
			default:
				return type;
		}
	}

	const positionClasses = {
		'bottom-right': 'bottom-20 right-4 lg:bottom-4 lg:right-20',
		'bottom-left': 'bottom-20 left-4 lg:bottom-4'
	};
</script>

{#if fabVisible && (workflows.length > 0 || coordinateSelectionMode)}
	{#if coordinateSelectionMode && selectedWorkflow}
		<!-- Report Button for Coordinate Selection Mode -->
		<div
			bind:this={reportButtonEl}
			class="damage-report-button fixed bottom-20 left-1/2 z-[1100] flex -translate-x-1/2 items-center justify-between gap-3 rounded-full bg-destructive px-5 py-3 text-white shadow-lg transition-opacity lg:bottom-8"
		>
			<button
				onclick={confirmCoordinateSelection}
				class="report-text flex-1 text-center font-semibold"
			>
				{selectedWorkflow.name}
			</button>
			<button
				onclick={exitCoordinateSelectionMode}
				class="damage-report-close text-2xl font-bold leading-none"
				type="button"
			>
				×
			</button>
		</div>
	{:else}
		<!-- Normal FAB Menu -->
		<div class="fab-menu-container fixed z-[1100] {positionClasses[position]}">
			<!-- Menu items - shown when open -->
			{#if isOpen && workflows.length > 0}
				<div class="fab-menu-items mb-3 flex flex-col gap-2">
					{#each workflows as workflow}
						{@const Icon = getWorkflowIcon(workflow.workflow_type)}
						<button
							onclick={() => selectWorkflow(workflow)}
							class="fab-menu-item group flex w-full items-center justify-between gap-3 rounded-lg border bg-background px-4 py-3 shadow-lg transition-all hover:scale-105 hover:shadow-xl"
						>
							<div class="flex items-center gap-3">
								<div
									class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
								>
									<Icon class="h-5 w-5" />
								</div>
								<div class="min-w-0 text-left">
									<div class="font-medium leading-tight">{workflow.name}</div>
									{#if workflow.description}
										<div class="text-xs text-muted-foreground">{workflow.description}</div>
									{/if}
								</div>
							</div>
							<Badge variant="secondary" class="shrink-0 text-xs">
								{getWorkflowTypeLabel(workflow.workflow_type)}
							</Badge>
						</button>
					{/each}
				</div>
			{/if}

			<!-- Main FAB button -->
			<Button
				onclick={toggleMenu}
				size="icon"
				class="fab-button h-14 w-14 shadow-lg transition-transform {isOpen ? 'rotate-45' : ''}"
				aria-label={isOpen ? 'Close menu' : 'Open menu'}
			>
				{#if isOpen}
					<X class="h-6 w-6" />
				{:else}
					<Plus class="h-6 w-6" />
				{/if}
			</Button>
		</div>

		<!-- Backdrop when menu is open -->
		{#if isOpen}
			<button
				onclick={toggleMenu}
				class="fixed inset-0 z-[1050] bg-black/20 backdrop-blur-sm"
				aria-label="Close menu"
			></button>
		{/if}
	{/if}
{/if}

<style>
	.fab-menu-container {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}

	.fab-menu-items {
		animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		max-height: 60vh;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: thin;
		min-width: 280px;
		max-width: 90vw;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.fab-button {
		transition:
			transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
			box-shadow 0.2s ease;
	}

	.fab-button:hover {
		transform: scale(1.1);
	}

	.fab-button:active {
		transform: scale(0.95);
	}

	.fab-menu-item {
		animation: fadeIn 0.2s ease-out backwards;
	}

	.fab-menu-item:nth-child(1) {
		animation-delay: 0.05s;
	}
	.fab-menu-item:nth-child(2) {
		animation-delay: 0.1s;
	}
	.fab-menu-item:nth-child(3) {
		animation-delay: 0.15s;
	}
	.fab-menu-item:nth-child(4) {
		animation-delay: 0.2s;
	}
	.fab-menu-item:nth-child(5) {
		animation-delay: 0.25s;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateX(20px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	/* Damage Report Button */
	.damage-report-button {
		min-width: 135px;
		cursor: pointer;
	}

	.damage-report-button:hover {
		box-shadow: 0 3px 10px rgba(0, 0, 0, 0.4);
	}

	.damage-report-close {
		background: none;
		border: none;
		color: white;
		cursor: pointer;
		padding: 0;
		margin: 0;
		line-height: 1;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.damage-report-close:hover {
		opacity: 0.8;
	}

	/* Temporary Marker Styles (global) */
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

	@media (max-width: 479px) {
		.fab-menu-items {
			min-width: 240px;
		}

		.fab-button {
			height: 3.5rem;
			width: 3.5rem;
		}
	}
</style>
