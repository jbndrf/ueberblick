<script lang="ts">
	import type { Map as LeafletMapType } from 'leaflet';
	import LeafletMap from '$lib/components/map/leaflet-map.svelte';
	import BottomControlBar from '$lib/components/mobile/bottom-control-bar.svelte';
	import FabMenu from '$lib/components/mobile/fab-menu.svelte';
	import BottomSheet from '$lib/components/mobile/bottom-sheet.svelte';
	import ToolsMenu from '$lib/components/map/tools-menu.svelte';
	import FilterSheet from '$lib/components/map/filter-sheet.svelte';
	import MarkerDetail from '$lib/components/map/marker-detail.svelte';
	import WorkflowContent from '$lib/components/map/workflow-content.svelte';
	import * as Card from '$lib/components/ui/card';
	import { Navigation, Layers, AlertCircle, Settings, MapPin } from 'lucide-svelte';
	import {
		getParticipantGateway,
		setReferenceData,
		getReferenceData
	} from '$lib/participant-state/context.svelte';
	import { saveReferenceData } from '$lib/participant-state/persistence.svelte';
	import type {
		Marker,
		WorkflowInstance,
		Workflow,
		WorkflowStage,
		WorkflowConnection,
		MarkerCategory,
		Role
	} from '$lib/participant-state/types';

	let { data } = $props();

	// Get gateway from context (set by layout)
	const gateway = getParticipantGateway();

	// Map state
	let map: LeafletMapType | null = $state(null);

	// UI state
	let toolsMenuOpen = $state(false);
	let filterSheetOpen = $state(false);
	let bottomSheetOpen = $state(false);

	// Bottom sheet content state
	let bottomSheetContent: 'marker' | 'workflow' | null = $state(null);
	let selectedMarker: Marker | null = $state(null);
	let selectedWorkflowInstance: WorkflowInstance | null = $state(null);

	// Initialize reference data and markers from server
	$effect(() => {
		if (data.workflows || data.workflowStages || data.markerCategories || data.markers) {
			initServerData();
		}
	});

	async function initServerData() {
		// Cast server data to our types (PocketBase returns RecordModel which has the same shape)
		const workflows = (data.workflows || []) as unknown as Workflow[];
		const workflowStages = (data.workflowStages || []) as unknown as WorkflowStage[];
		const workflowConnections = (data.workflowConnections || []) as unknown as WorkflowConnection[];
		const markerCategories = (data.markerCategories || []) as unknown as MarkerCategory[];
		const roles = (data.roles || []) as unknown as Role[];

		// Save reference data to IndexedDB for offline use
		await saveReferenceData({
			workflows,
			workflowStages,
			workflowConnections,
			markerCategories,
			roles
		});

		// Update reactive reference data
		setReferenceData({
			workflows,
			workflowStages,
			workflowConnections,
			markerCategories,
			roles
		});

		// Seed markers into gateway (for offline support)
		if (gateway && data.markers?.length) {
			const serverMarkers = data.markers.map((m: any) => ({
				id: m.id,
				category_id: m.category_id,
				project_id: m.project_id,
				created_by: m.created_by || '',
				location: m.location,
				title: m.title,
				description: m.description || '',
				properties: m.properties || null,
				visible_to_roles: m.visible_to_roles || [],
				created: m.created,
				updated: m.updated
			})) as Marker[];
			await gateway.seed('markers', serverMarkers);
			console.log('Seeded', serverMarkers.length, 'markers into gateway');
		}

		console.log('Server data initialized');
	}

	// Get reference data for UI
	const refData = getReferenceData();

	// Use server data directly when online, gateway only for offline/local changes
	// This ensures we always have fresh data from the server
	const markers = $derived.by(() => {
		// If we have server markers, use them (online mode)
		if (data.markers?.length) {
			return data.markers.map((m: any) => ({
				id: m.id,
				category_id: m.category_id,
				project_id: m.project_id,
				created_by: m.created_by || '',
				location: m.location,
				title: m.title,
				description: m.description || '',
				properties: m.properties || null,
				visible_to_roles: m.visible_to_roles || [],
				created: m.created,
				updated: m.updated
			}));
		}
		// Fallback to gateway (offline mode)
		return gateway?.visibleMarkers ?? [];
	});

	const workflowInstances = $derived(gateway?.visibleInstances ?? []);

	// Debug: log server data on load
	$effect(() => {
		console.log('Server data loaded:', {
			workflows: data.workflows?.length || 0,
			workflowStages: data.workflowStages?.length || 0,
			workflowConnections: data.workflowConnections?.length || 0,
			markers: data.markers?.length || 0,
			markerCategories: data.markerCategories?.length || 0,
			roles: data.roles?.length || 0
		});
	});

	// Helper to get workflow name from ID
	function getWorkflowName(workflowId: string | undefined): string {
		if (!workflowId) return 'Workflow';
		const workflow = data.workflows?.find((w: any) => w.id === workflowId);
		return workflow?.name || 'Workflow';
	}

	// Control bar buttons (mobile)
	const mobileControlButtons = [
		{
			icon: Layers,
			label: 'Categories',
			onclick: () => (filterSheetOpen = true)
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
	];

	// Desktop control buttons
	const desktopControlButtons = $derived([
		{
			icon: Layers,
			label: 'Categories',
			onclick: () => (filterSheetOpen = !filterSheetOpen),
			active: filterSheetOpen
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

	// Track marker layers for cleanup
	let markerLayers: any[] = [];

	// Helper to create marker icon HTML - exact match of marker-icon-designer.svelte logic
	function createMarkerIconHtml(iconConfig: any): { html: string; width: number; height: number } {
		// Default style matching designer's DEFAULT_STYLE
		const style = {
			size: iconConfig?.style?.size ?? 64,
			color: iconConfig?.style?.color ?? '#2563eb',
			borderWidth: iconConfig?.style?.borderWidth ?? 2,
			borderColor: iconConfig?.style?.borderColor ?? '#ffffff',
			backgroundColor: iconConfig?.style?.backgroundColor ?? '#ffffff',
			shadow: iconConfig?.style?.shadow ?? false,
			shape: iconConfig?.style?.shape ?? 'none'
		};

		const svgContent = iconConfig?.svgContent || '';

		if (style.shape === 'pin') {
			// Pin marker - exact copy of getMarkerShapeSVG from designer
			const size = style.size;
			const height = size * 1.25;
			const scaleX = size / 32;
			const scaleY = height / 40;

			// Shadow (only if enabled)
			const shadowSvg = style.shadow
				? `<ellipse cx="${16 * scaleX}" cy="${37 * scaleY}" rx="${8 * scaleX}" ry="${3 * scaleY}" fill="rgba(0,0,0,0.2)"/>`
				: '';

			// Icon placement - exact copy of getIconPlacement from designer
			const iconSize = 16 * scaleX;
			const iconX = (16 * scaleX) - (iconSize / 2);
			const iconY = (14 * scaleY) - (iconSize / 2);

			// Embed SVG icon as base64 image
			let iconImage = '';
			if (svgContent) {
				const encodedSvg = btoa(unescape(encodeURIComponent(svgContent)));
				iconImage = `<image href="data:image/svg+xml;base64,${encodedSvg}" x="${iconX}" y="${iconY}" width="${iconSize}" height="${iconSize}" />`;
			}

			const html = `
				<svg width="${size}" height="${height}" viewBox="0 0 ${size} ${height}">
					${shadowSvg}
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
					<circle cx="${16 * scaleX}" cy="${14 * scaleY}" r="${10 * scaleX}" fill="${style.backgroundColor}" opacity="0.9"/>
					${iconImage}
				</svg>`;

			return { html, width: size, height };
		} else {
			// Standalone SVG (shape === 'none')
			const size = style.size;

			if (svgContent) {
				// Render SVG at specified size
				const encodedSvg = btoa(unescape(encodeURIComponent(svgContent)));
				const html = `
					<div style="width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center;">
						<img src="data:image/svg+xml;base64,${encodedSvg}" width="${size}" height="${size}" style="object-fit: contain;" />
					</div>`;
				return { html, width: size, height: size };
			}

			// Fallback: simple colored circle
			const html = `
				<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
					<circle cx="${size/2}" cy="${size/2}" r="${size/2 - style.borderWidth}"
					        fill="${style.color}" stroke="${style.borderColor}" stroke-width="${style.borderWidth}"/>
				</svg>`;
			return { html, width: size, height: size };
		}
	}

	// Render markers on map when map and markers are available
	$effect(() => {
		if (!map || !markers.length) return;

		// Dynamic import Leaflet
		import('leaflet').then((L) => {
			// Clear existing markers
			markerLayers.forEach((layer) => map?.removeLayer(layer));
			markerLayers = [];

			// Add markers to map
			for (const marker of markers) {
				if (!marker.location?.lat || !marker.location?.lon) continue;

				// Find category for styling
				const category = data.markerCategories?.find((c: any) => c.id === marker.category_id);
				// Handle icon_config - might be string or object depending on PocketBase response
				let iconConfig = category?.icon_config;
				if (typeof iconConfig === 'string') {
					try {
						iconConfig = JSON.parse(iconConfig);
					} catch (e) {
						console.error('Failed to parse icon_config:', e);
					}
				}
				console.log('Marker:', marker.title, 'Category:', category?.name, 'iconConfig:', iconConfig, 'size:', iconConfig?.style?.size);
				const { html, width, height } = createMarkerIconHtml(iconConfig);

				// Create custom icon using category's icon_config
				const icon = L.divIcon({
					className: 'custom-marker',
					html,
					iconSize: [width, height],
					iconAnchor: [width / 2, height] // Anchor at bottom center for pin shape
				});

				const leafletMarker = L.marker([marker.location.lat, marker.location.lon], { icon })
					.addTo(map!)
					.on('click', () => handleMarkerClick(marker));

				markerLayers.push(leafletMarker);
			}

			console.log('Rendered', markerLayers.length, 'markers on map');
		});
	});

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

	async function handleWorkflowSelect(workflow: any, coordinates?: { lat: number; lng: number }) {
		console.log('Workflow selected:', $state.snapshot(workflow), 'Coordinates:', coordinates);
		console.log('All workflowStages from server:', data.workflowStages);

		if (!gateway) {
			console.error('Gateway not initialized');
			return;
		}

		// Find the start stage for this workflow
		const stages = data.workflowStages?.filter((s: any) => s.workflow_id === workflow.id) || [];
		console.log('Stages for this workflow:', stages);
		const startStage = stages.find((s: any) => s.stage_type === 'start') || stages[0];

		if (!startStage) {
			console.error('No start stage found for workflow:', workflow.id);
			console.error('Available workflows:', data.workflows?.map((w: any) => ({ id: w.id, name: w.name })));
			return;
		}

		// Create workflow instance through gateway
		// Note: No tool context here since this is the initial instance creation (no tool involved)
		const result = await gateway.create('workflow_instances', {
			workflow_id: workflow.id,
			current_stage_id: startStage.id,
			status: 'active' as const,
			location: coordinates ? { lat: coordinates.lat, lon: coordinates.lng } : null,
			files: []
		});

		if (result.success && result.data) {
			selectedWorkflowInstance = result.data;
			bottomSheetContent = 'workflow';
			bottomSheetOpen = true;
			console.log('Workflow instance created:', result.data.id, 'Operation:', result.operationId);
		} else {
			console.error('Failed to create workflow instance:', result.error);
		}
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
			selectedWorkflowInstance = null;
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

		<!-- Debug: Show data counts -->
		{#if import.meta.env.DEV}
			<div class="fixed bottom-32 left-4 z-[2000] space-y-1 rounded bg-black/75 p-2 text-xs text-white lg:bottom-4">
				<div>Workflows: {data.workflows?.length || 0}</div>
				<div>Markers (gateway): {markers.length}</div>
				<div>Instances (gateway): {workflowInstances.length}</div>
				<div>Gateway: {gateway ? 'Ready' : 'Not initialized'}</div>
				{#if gateway?.pendingCount}
					<div>Pending ops: {gateway.pendingCount}</div>
				{/if}
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
	markerCategories={data.markerCategories?.map((cat: any) => ({
		id: cat.id,
		name: cat.name,
		visible: true,
		icon_config: cat.icon_config
	}))}
/>

<!-- Bottom Sheet for Marker/Workflow Content -->
<BottomSheet
	bind:open={bottomSheetOpen}
	onClose={handleCloseBottomSheet}
	title={bottomSheetContent === 'marker'
		? selectedMarker?.title
		: bottomSheetContent === 'workflow'
			? getWorkflowName(selectedWorkflowInstance?.workflow_id)
			: 'Details'}
>
	{#if bottomSheetContent === 'marker' && selectedMarker}
		<MarkerDetail
			marker={selectedMarker}
			category={data.markerCategories?.find((c: any) => c.id === selectedMarker?.category_id)}
		/>
	{:else if bottomSheetContent === 'workflow' && selectedWorkflowInstance}
		<WorkflowContent
			instance={selectedWorkflowInstance}
			workflow={data.workflows?.find((w: any) => w.id === selectedWorkflowInstance?.workflow_id)}
			stages={data.workflowStages?.filter((s: any) => s.workflow_id === selectedWorkflowInstance?.workflow_id) || []}
		/>
	{:else}
		<div class="p-4 text-center text-muted-foreground">
			<MapPin class="mx-auto mb-2 h-12 w-12 opacity-50" />
			<p>No content available</p>
		</div>
	{/if}
</BottomSheet>
