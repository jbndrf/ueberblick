<script lang="ts">
	import { Layers, Filter, Navigation, Settings, Plus } from '@lucide/svelte';
	import type { Map as LeafletMap } from 'leaflet';
	import * as m from '$lib/paraglide/messages';
	import WorkflowSelector from './WorkflowSelector.svelte';

	interface Workflow {
		id: string;
		name: string;
		workflow_type: 'incident' | 'survey';
		geometry_type?: 'point' | 'line' | 'polygon';
		description?: string;
		entry_button_label?: string;
	}

	interface Props {
		onLayersClick: () => void;
		onFiltersClick?: () => void;
		onToolsClick?: () => void;
		onLocationClick?: () => void;
		workflows?: Workflow[];
		map?: LeafletMap | null;
		onWorkflowSelect?: (workflow: Workflow, coordinates?: { lat: number; lng: number }) => void;
		onDrawGeometry?: (workflow: Workflow, mode: 'line' | 'polygon') => void;
		/** Whether location editing is active (hides nav bar) */
		isEditingLocation?: boolean;
		/** Bindable: popover open state (FAB click cycles it). */
		workflowSelectorOpen?: boolean;
		/** Bindable: recent sheet open state (2nd FAB click opens it alongside). */
		recentOpen?: boolean;
	}

	let {
		onLayersClick,
		onFiltersClick,
		onToolsClick,
		onLocationClick,
		workflows = [],
		map = null,
		onWorkflowSelect,
		onDrawGeometry,
		isEditingLocation = false,
		workflowSelectorOpen = $bindable(false),
		recentOpen = $bindable(false)
	}: Props = $props();

	let isSelectingCoordinates = $state(false);

	// FAB cycles: 0 closed -> 1 popover (center) -> 2 popover (left) + recent sheet -> 0.
	const fabRotation = $derived(recentOpen ? 90 : workflowSelectorOpen ? 45 : 0);

	function handleCenterClick() {
		if (!workflowSelectorOpen && !recentOpen) {
			workflowSelectorOpen = true;
		} else if (workflowSelectorOpen && !recentOpen) {
			recentOpen = true;
		} else {
			workflowSelectorOpen = false;
			recentOpen = false;
		}
	}

	function handleWorkflowSelect(workflow: Workflow, coordinates?: { lat: number; lng: number }) {
		recentOpen = false;
		onWorkflowSelect?.(workflow, coordinates);
	}

	function handleDrawGeometry(workflow: Workflow, mode: 'line' | 'polygon') {
		recentOpen = false;
		onDrawGeometry?.(workflow, mode);
	}

	function handleBackdropClose() {
		// Explicit dismissal via backdrop -- collapse the sibling recent sheet too.
		recentOpen = false;
	}
</script>

<!-- Bottom bar with raised center button (mobile only) -->
{#if !isSelectingCoordinates && !isEditingLocation}
	<div
		class="fixed bottom-0 left-0 right-0 z-[1060] flex md:hidden items-end justify-around border-t bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:bg-background/80"
	>
		<button
			onclick={onLayersClick}
			class="flex h-16 w-14 flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
			title={m.participantBottomControlBarLayers?.() ?? 'Layers'}
		>
			<Layers class="h-5 w-5" />
			<span class="text-[0.625rem]">{m.participantBottomControlBarLayers?.() ?? 'Layers'}</span>
		</button>

		<button
			onclick={onFiltersClick ?? (() => {})}
			class="flex h-16 w-14 flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
			title={m.mapFilters?.() ?? 'Filters'}
		>
			<Filter class="h-5 w-5" />
			<span class="text-[0.625rem]">{m.mapFilters?.() ?? 'Filters'}</span>
		</button>

		<div class="relative flex items-center justify-center">
			<button
				onclick={handleCenterClick}
				class="center-button -mt-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg active:scale-95"
				style:transform="rotate({fabRotation}deg)"
				aria-label={workflowSelectorOpen ? (m.mapCloseMenu?.() ?? 'Close menu') : (m.participantBottomControlBarNewWorkflow?.() ?? 'New workflow')}
			>
				<Plus class="h-6 w-6" />
			</button>
		</div>

		<button
			onclick={onLocationClick ?? (() => {})}
			class="flex h-16 w-14 flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
			title={m.mapMyLocation?.() ?? 'My Location'}
		>
			<Navigation class="h-5 w-5" />
			<span class="text-[0.625rem]">{m.participantBottomControlBarLocation?.() ?? 'Location'}</span>
		</button>

		<button
			onclick={onToolsClick ?? (() => {})}
			class="flex h-16 w-14 flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
			title={m.mapTools?.() ?? 'Tools'}
		>
			<Settings class="h-5 w-5" />
			<span class="text-[0.625rem]">{m.participantBottomControlBarSettings?.() ?? 'Settings'}</span>
		</button>
	</div>
{/if}

<WorkflowSelector
	{workflows}
	{map}
	bind:isOpen={workflowSelectorOpen}
	onWorkflowSelect={handleWorkflowSelect}
	onDrawGeometry={handleDrawGeometry}
	bind:isSelectingCoordinates
	position={recentOpen ? 'left' : 'center'}
	onBackdropClose={handleBackdropClose}
/>

<style>
	.center-button {
		transition: transform 0.2s ease;
	}

	.center-button:hover {
		filter: brightness(1.05);
	}
</style>
