<script lang="ts">
	import type { Map as LeafletMapType } from 'leaflet';
	import LeafletMap from '$lib/components/map/leaflet-map.svelte';
	import BottomControlBar from '$lib/components/mobile/bottom-control-bar.svelte';
	import FabMenu from '$lib/components/mobile/fab-menu.svelte';
	import BottomSheet from '$lib/components/mobile/bottom-sheet.svelte';
	import ToolsMenu from '$lib/components/map/tools-menu.svelte';
	import FilterSheet from '$lib/components/map/filter-sheet.svelte';
	import LegendSheet from '$lib/components/map/legend-sheet.svelte';
	import MarkerDetail from '$lib/components/map/marker-detail.svelte';
	import WorkflowContent from '$lib/components/map/workflow-content.svelte';
	import * as Card from '$lib/components/ui/card';
	import {
		Navigation,
		Layers,
		Filter,
		AlertCircle,
		Settings,
		MapPin
	} from 'lucide-svelte';

	let { data } = $props();

	// Map state
	let map: LeafletMapType | null = $state(null);

	// UI state
	let toolsMenuOpen = $state(false);
	let filterSheetOpen = $state(false);
	let legendSheetOpen = $state(false);
	let bottomSheetOpen = $state(false);

	// Bottom sheet content state
	let bottomSheetContent: 'marker' | 'workflow' | null = $state(null);
	let selectedMarker: any = $state(null);
	let selectedWorkflow: any = $state(null);

	// Control bar buttons (mobile)
	const mobileControlButtons = [
		{
			icon: Filter,
			label: 'Filters',
			onclick: () => (filterSheetOpen = true)
		},
		{
			icon: Navigation,
			label: 'My Location',
			onclick: centerOnLocation
		},
		{
			icon: Layers,
			label: 'Legend',
			onclick: () => (legendSheetOpen = true)
		},
		{
			icon: Settings,
			label: 'Tools',
			onclick: () => (toolsMenuOpen = true)
		}
	];

	// Desktop control buttons
	const desktopControlButtons = $derived([
		{
			icon: Filter,
			label: 'Filters',
			onclick: () => (filterSheetOpen = !filterSheetOpen),
			active: filterSheetOpen
		},
		{
			icon: Layers,
			label: 'Legend',
			onclick: () => (legendSheetOpen = !legendSheetOpen),
			active: legendSheetOpen
		},
		{
			icon: Navigation,
			label: 'My Location',
			onclick: centerOnLocation
		},
		{
			icon: Settings,
			label: 'Tools',
			onclick: () => (toolsMenuOpen = true)
		}
	]);

	// Handlers
	function handleMapReady(leafletMap: LeafletMapType) {
		map = leafletMap;
		console.log('Map ready:', map);
	}

	function centerOnLocation() {
		if ('geolocation' in navigator && map) {
			navigator.geolocation.getCurrentPosition(
				(position) => {
					const { latitude, longitude } = position.coords;
					map?.setView([latitude, longitude], 16);
				},
				(error) => {
					console.error('Geolocation error:', error);
				}
			);
		}
	}

	function handleWorkflowSelect(workflow: any, coordinates?: { lat: number; lng: number }) {
		console.log('Workflow selected:', workflow, 'Coordinates:', coordinates);
		selectedWorkflow = {
			id: workflow.id,
			workflow_name: workflow.name,
			workflow_type: workflow.workflow_type,
			current_stage: null,
			progress_percentage: 0,
			status: 'in_progress',
			created_at: new Date().toISOString(),
			stages: [],
			coordinates: coordinates
				? {
						type: 'Point',
						coordinates: [coordinates.lng, coordinates.lat]
					}
				: undefined
		};
		bottomSheetContent = 'workflow';
		bottomSheetOpen = true;
	}

	function handleMarkerClick(marker: any) {
		console.log('Marker clicked:', marker);
		selectedMarker = marker;
		bottomSheetContent = 'marker';
		bottomSheetOpen = true;
	}

	function handleLogout() {
		window.location.href = '/participant/logout';
	}

	function handleCloseBottomSheet() {
		bottomSheetOpen = false;
		setTimeout(() => {
			bottomSheetContent = null;
			selectedMarker = null;
			selectedWorkflow = null;
		}, 300);
	}

	// Get map settings or use defaults
	const mapCenter = $derived<[number, number]>(
		data.mapSettings?.default_center
			? [
					data.mapSettings.default_center.coordinates[1],
					data.mapSettings.default_center.coordinates[0]
				]
			: [51.505, -0.09]
	);

	const mapZoom = $derived(data.mapSettings?.default_zoom || 13);
	const tileUrl = $derived(
		data.mapSettings?.tile_url || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
	);
	const attribution = $derived(
		data.mapSettings?.attribution ||
			'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
	);

	// Legend items from marker categories
	const legendItems = $derived(
		data.markerCategories?.map((cat) => ({
			id: cat.id,
			name: cat.name,
			color: cat.color || '#6c757d',
			count: 0
		})) || []
	);
</script>

<svelte:head>
	<title>Map - {data.project?.name || 'Karte'}</title>
</svelte:head>

<!-- Full screen map container -->
<div class="absolute inset-0">
	{#if data.error}
		<!-- Error State -->
		<div class="flex h-full items-center justify-center p-4">
			<Card.Root class="max-w-md">
				<Card.Header>
					<Card.Title class="flex items-center gap-2 text-destructive">
						<AlertCircle class="h-5 w-5" />
						Error
					</Card.Title>
				</Card.Header>
				<Card.Content>
					<p class="text-muted-foreground">{data.error}</p>
				</Card.Content>
			</Card.Root>
		</div>
	{:else}
		<!-- Map -->
		<div class="h-full w-full">
			<LeafletMap
				center={mapCenter}
				zoom={mapZoom}
				{tileUrl}
				{attribution}
				minZoom={data.mapSettings?.min_zoom || 1}
				maxZoom={data.mapSettings?.max_zoom || 19}
				onMapReady={handleMapReady}
			/>
		</div>

		<!-- Desktop Controls (hidden on mobile) -->
		<div class="absolute right-4 top-20 z-[1000] hidden lg:block">
			<div class="flex flex-col gap-2">
				{#each desktopControlButtons as button}
					{@const Icon = button.icon}
					<button
						onclick={button.onclick}
						class="flex h-10 w-10 items-center justify-center rounded-lg border bg-background shadow-md transition-colors hover:bg-muted {button.active
							? 'border-primary bg-primary/10'
							: ''}"
						title={button.label}
					>
						<Icon class="h-4 w-4 {button.active ? 'text-primary' : ''}" />
					</button>
				{/each}
			</div>
		</div>

		<!-- Mobile Bottom Control Bar -->
		<BottomControlBar buttons={mobileControlButtons} />

		<!-- Debug: Show workflow count -->
		{#if import.meta.env.DEV}
			<div class="fixed bottom-32 left-4 z-[2000] rounded bg-black/75 p-2 text-xs text-white lg:bottom-4">
				Workflows: {data.workflows?.length || 0}
			</div>
		{/if}

		<!-- FAB Menu for Workflows -->
		<FabMenu
			workflows={(data.workflows || []).map((w: any) => ({
				id: w.id,
				name: w.name,
				workflow_type: w.workflow_type,
				description: w.description
			}))}
			{map}
			onWorkflowSelect={handleWorkflowSelect}
		/>
	{/if}
</div>

<!-- Tools Menu Dialog -->
<ToolsMenu
	bind:open={toolsMenuOpen}
	participant={data.participant}
	roles={data.participant?.roles || []}
	onLogout={handleLogout}
/>

<!-- Filter Sheet -->
<FilterSheet
	bind:open={filterSheetOpen}
	tileLayers={[]}
	markerCategories={data.markerCategories?.map((cat) => ({
		id: cat.id,
		name: cat.name,
		visible: true
	}))}
/>

<!-- Legend Sheet -->
<LegendSheet bind:open={legendSheetOpen} items={legendItems} />

<!-- Bottom Sheet for Marker/Workflow Content -->
<BottomSheet
	bind:open={bottomSheetOpen}
	onClose={handleCloseBottomSheet}
	title={bottomSheetContent === 'marker'
		? selectedMarker?.title
		: bottomSheetContent === 'workflow'
			? selectedWorkflow?.workflow_name
			: 'Details'}
>
	{#if bottomSheetContent === 'marker' && selectedMarker}
		<MarkerDetail marker={selectedMarker} />
	{:else if bottomSheetContent === 'workflow' && selectedWorkflow}
		<WorkflowContent instance={selectedWorkflow} />
	{:else}
		<div class="p-4 text-center text-muted-foreground">
			<MapPin class="mx-auto mb-2 h-12 w-12 opacity-50" />
			<p>No content available</p>
		</div>
	{/if}
</BottomSheet>
