<script lang="ts">
	import { Layers, Filter, Navigation, Settings, Plus, Wrench } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		onLayersClick: () => void;
		onFiltersClick?: () => void;
		onToolsClick?: () => void;
		onParticipantToolsClick?: () => void;
		participantToolsAvailable?: boolean;
		participantToolsSoft?: boolean;
		participantToolsHard?: number;
		onLocationClick?: () => void;
		/** Whether location editing is active (hides nav bar) */
		isEditingLocation?: boolean;
		/** True while the WorkflowSelector (owned by the parent) is in coordinate
		 *  selection mode -- bar hides so it doesn't overlap the confirm pill. */
		isSelectingCoordinates?: boolean;
		/** Bindable: popover open state (FAB click cycles it). */
		workflowSelectorOpen?: boolean;
		/** Bindable: recent sheet open state (2nd FAB click opens it alongside). */
		recentOpen?: boolean;
	}

	let {
		onLayersClick,
		onFiltersClick,
		onToolsClick,
		onParticipantToolsClick,
		participantToolsAvailable = false,
		participantToolsSoft = false,
		participantToolsHard = 0,
		onLocationClick,
		isEditingLocation = false,
		isSelectingCoordinates = false,
		workflowSelectorOpen = $bindable(false),
		recentOpen = $bindable(false)
	}: Props = $props();

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

		{#if participantToolsAvailable}
			<button
				onclick={onParticipantToolsClick ?? (() => {})}
				class="relative flex h-16 w-14 flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
				title={m.participantBottomControlBarTools?.() ?? 'Tools'}
			>
				<div class="relative">
					<Wrench class="h-5 w-5" />
					{#if participantToolsHard > 0}
						<span class="absolute -right-2 -top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.625rem] font-semibold leading-4 text-destructive-foreground">
							{participantToolsHard > 99 ? '99+' : participantToolsHard}
						</span>
					{:else if participantToolsSoft}
						<span class="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-muted-foreground"></span>
					{/if}
				</div>
				<span class="text-[0.625rem]">{m.participantBottomControlBarTools?.() ?? 'Tools'}</span>
			</button>
		{/if}

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

<style>
	.center-button {
		transition: transform 0.2s ease;
	}

	.center-button:hover {
		filter: brightness(1.05);
	}
</style>
