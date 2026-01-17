<script lang="ts">
	import ModuleSidebar from '$lib/components/module-sidebar.svelte';
	import { getParticipantGateway } from '$lib/participant-state/context.svelte';
	import { createMarkerDetailState, type MarkerDetailState } from './state.svelte';
	import type { MarkerSelection, TabId } from '../types';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import * as Card from '$lib/components/ui/card';
	import { MapPin, Clock, ImageIcon } from 'lucide-svelte';

	// ==========================================================================
	// Props
	// ==========================================================================

	interface Props {
		selection: MarkerSelection;
		participantRoleId: string;
		onClose: () => void;
		onNext?: () => void;
		onPrevious?: () => void;
		canGoNext?: boolean;
		canGoPrevious?: boolean;
	}

	let {
		selection,
		participantRoleId,
		onClose,
		onNext,
		onPrevious,
		canGoNext = false,
		canGoPrevious = false
	}: Props = $props();

	// ==========================================================================
	// State
	// ==========================================================================

	const gateway = getParticipantGateway();
	let detailState = $state<MarkerDetailState | null>(null);
	let isOpen = $state(true);
	let activeTab = $state<TabId>('overview');

	// ==========================================================================
	// Effects
	// ==========================================================================

	// Create and load state when selection changes
	$effect(() => {
		const markerId = selection.markerId;
		if (!gateway) return;
		const newState = createMarkerDetailState(markerId, gateway, participantRoleId);
		detailState = newState;
		activeTab = 'overview';
		newState.load();
	});

	// ==========================================================================
	// Tab Configuration
	// ==========================================================================

	const tabs = [
		{ id: 'overview', label: 'Overview' },
		{ id: 'details', label: 'Details' },
		{ id: 'photos', label: 'Photos' },
		{ id: 'history', label: 'History' }
	];

	// ==========================================================================
	// Computed Values
	// ==========================================================================

	const title = $derived(detailState?.marker?.title || 'Loading...');

	const subtitle = $derived.by(() => {
		if (!detailState?.marker) return undefined;
		const created = new Date(detailState.marker.created);
		return `Created ${formatDate(created)}`;
	});

	// ==========================================================================
	// Helpers
	// ==========================================================================

	function formatDate(date: Date): string {
		return date.toLocaleDateString('de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		});
	}

	function formatTimeAgo(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const hours = Math.floor(diff / (1000 * 60 * 60));
		const days = Math.floor(hours / 24);

		if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
		if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
		return 'Just now';
	}

	// ==========================================================================
	// Handlers
	// ==========================================================================

	function handleClose() {
		isOpen = false;
		onClose();
	}

	function handleNext() {
		if (onNext && canGoNext) {
			onNext();
		}
	}

	function handlePrevious() {
		if (onPrevious && canGoPrevious) {
			onPrevious();
		}
	}

	function handleTabChange(tabId: string) {
		activeTab = tabId as TabId;
	}
</script>

<!-- Main Component -->
<ModuleSidebar
	bind:isOpen
	{title}
	{subtitle}
	{tabs}
	bind:activeTab
	actions={[]}
	isLoading={detailState?.isLoading ?? true}
	error={detailState?.loadError}
	onClose={handleClose}
	onNext={canGoNext ? handleNext : undefined}
	onPrevious={canGoPrevious ? handlePrevious : undefined}
	onTabChange={handleTabChange}
>
	{#snippet tabContent(tabId)}
		{#if tabId === 'overview'}
			<!-- OVERVIEW TAB -->
			<div class="space-y-4">
				<!-- Category Badge -->
				{#if detailState?.category}
					<Badge variant="outline">
						{detailState.category.name}
					</Badge>
				{/if}

				<!-- Description -->
				{#if detailState?.marker?.description}
					<div>
						<h4 class="text-sm font-semibold text-foreground mb-2">Description</h4>
						<p class="text-muted-foreground text-sm">{detailState.marker.description}</p>
					</div>
				{/if}

				<!-- Info Cards -->
				<div class="grid grid-cols-2 gap-2">
					{#if detailState?.marker?.location}
						<Card.Root>
							<Card.Content class="p-3">
								<div class="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
									<MapPin class="w-3 h-3" />
									Location
								</div>
								<div class="text-xs font-mono text-foreground">
									{detailState.marker.location.lat.toFixed(5)}, {detailState.marker.location.lon.toFixed(5)}
								</div>
							</Card.Content>
						</Card.Root>
					{/if}
					{#if detailState?.marker?.created}
						<Card.Root>
							<Card.Content class="p-3">
								<div class="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
									<Clock class="w-3 h-3" />
									Created
								</div>
								<div class="text-sm font-medium text-foreground">
									{formatTimeAgo(detailState.marker.created)}
								</div>
							</Card.Content>
						</Card.Root>
					{/if}
				</div>

				<Separator />

				<!-- No photos or activity yet -->
				<div class="text-center py-4 text-muted-foreground">
					<p class="text-sm">No additional data available</p>
				</div>
			</div>
		{:else if tabId === 'details'}
			<!-- DETAILS TAB -->
			<div class="space-y-4">
				<h3 class="font-semibold text-foreground">Marker Properties</h3>
				{#if detailState?.marker?.properties && Object.keys(detailState.marker.properties).length > 0}
					{#each Object.entries(detailState.marker.properties) as [key, value]}
						<div class="border-b border-border pb-2 last:border-0">
							<div class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
								{key.replace(/([A-Z])/g, ' $1').trim()}
							</div>
							<div class="text-sm text-foreground">
								{value ?? 'N/A'}
							</div>
						</div>
					{/each}
				{:else}
					<p class="text-muted-foreground text-sm">No additional properties</p>
				{/if}
			</div>
		{:else if tabId === 'photos'}
			<!-- PHOTOS TAB -->
			<div class="space-y-4">
				<h3 class="font-semibold text-foreground">Photo Gallery</h3>
				<div class="text-center py-12 text-muted-foreground">
					<ImageIcon class="w-12 h-12 mx-auto mb-2 opacity-50" />
					<p class="text-sm">No photos available</p>
				</div>
			</div>
		{:else if tabId === 'history'}
			<!-- HISTORY TAB -->
			<div class="space-y-4">
				<h3 class="font-semibold text-foreground">Activity History</h3>
				<div class="text-center py-12 text-muted-foreground">
					<Clock class="w-12 h-12 mx-auto mb-2 opacity-50" />
					<p class="text-sm">No activity history</p>
				</div>
			</div>
		{/if}
	{/snippet}
</ModuleSidebar>
