<script lang="ts">
	import { Layers, Filter, Navigation, Settings, Plus } from 'lucide-svelte';
	import type { Map as LeafletMap } from 'leaflet';
	import WorkflowSelector from './WorkflowSelector.svelte';

	interface Workflow {
		id: string;
		name: string;
		workflow_type: 'incident' | 'survey';
		description?: string;
	}

	interface Props {
		onLayersClick: () => void;
		onFiltersClick?: () => void;
		onToolsClick?: () => void;
		onLocationClick?: () => void;
		workflows?: Workflow[];
		map?: LeafletMap | null;
		onWorkflowSelect?: (workflow: Workflow, coordinates?: { lat: number; lng: number }) => void;
		/** Whether location editing is active (hides nav bar) */
		isEditingLocation?: boolean;
	}

	let {
		onLayersClick,
		onFiltersClick,
		onToolsClick,
		onLocationClick,
		workflows = [],
		map = null,
		onWorkflowSelect,
		isEditingLocation = false
	}: Props = $props();

	let workflowSelectorOpen = $state(false);
	let isSelectingCoordinates = $state(false);

	function handleCenterClick() {
		workflowSelectorOpen = !workflowSelectorOpen;
	}

	function handleWorkflowSelect(workflow: Workflow, coordinates?: { lat: number; lng: number }) {
		onWorkflowSelect?.(workflow, coordinates);
	}
</script>

<!-- Bottom bar with raised center button (mobile only) -->
{#if !isSelectingCoordinates && !isEditingLocation}
	<div
		class="fixed bottom-0 left-0 right-0 z-[1000] flex md:hidden items-end justify-around border-t bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:bg-background/80"
	>
		<!-- Left buttons -->
		<button
			onclick={onLayersClick}
			class="flex h-16 w-14 flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
			title="Layers"
		>
			<Layers class="h-5 w-5" />
			<span class="text-[0.625rem]">Layers</span>
		</button>

		<button
			onclick={onFiltersClick ?? (() => {})}
			class="flex h-16 w-14 flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
			title="Filters"
		>
			<Filter class="h-5 w-5" />
			<span class="text-[0.625rem]">Filters</span>
		</button>

		<!-- Center raised button - square that rotates -->
		<div class="relative flex items-center justify-center">
			<button
				onclick={handleCenterClick}
				class="center-button -mt-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg active:scale-95"
				class:is-open={workflowSelectorOpen}
				aria-label={workflowSelectorOpen ? 'Close menu' : 'New workflow'}
			>
				<Plus class="h-6 w-6" />
			</button>
		</div>

		<!-- Right buttons -->
		<button
			onclick={onLocationClick ?? (() => {})}
			class="flex h-16 w-14 flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
			title="My Location"
		>
			<Navigation class="h-5 w-5" />
			<span class="text-[0.625rem]">Location</span>
		</button>

		<button
			onclick={onToolsClick ?? (() => {})}
			class="flex h-16 w-14 flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
			title="Tools"
		>
			<Settings class="h-5 w-5" />
			<span class="text-[0.625rem]">Tools</span>
		</button>
	</div>
{/if}

<!-- Workflow Selector (popover + coordinate selection) -->
<WorkflowSelector
	{workflows}
	{map}
	bind:isOpen={workflowSelectorOpen}
	onWorkflowSelect={handleWorkflowSelect}
	bind:isSelectingCoordinates
/>

<style>
	.center-button {
		transition: transform 0.2s ease;
	}

	.center-button:hover {
		transform: scale(1.05);
	}

	.center-button.is-open {
		transform: rotate(45deg);
	}

	.center-button.is-open:hover {
		transform: rotate(45deg) scale(1.05);
	}
</style>
