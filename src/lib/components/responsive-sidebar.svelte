<script lang="ts">
	import { onMount } from 'svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import * as Card from '$lib/components/ui/card';
	import * as Carousel from '$lib/components/ui/carousel';
	import * as Tabs from '$lib/components/ui/tabs';
	import { ScrollArea } from '$lib/components/ui/scroll-area';

	interface Photo {
		url: string;
		caption: string;
		stageName?: string;
	}

	interface AuditEntry {
		id: string | number;
		executed_at: string;
		participant_name: string;
		action_name: string;
		notes?: string;
	}

	interface Action {
		id: string;
		label: string;
		icon: string;
		color?: string;
		onClick: () => void;
	}

	interface MarkerData {
		id: string | number;
		title: string;
		description?: string;
		status?: string;
		createdAt?: string;
		location?: string;
		lat?: number;
		lng?: number;
		[key: string]: any;
	}

	interface Props {
		isOpen?: boolean;
		markerData?: MarkerData | null;
		photos?: Photo[];
		auditTrail?: AuditEntry[];
		actions?: Action[];
		onClose?: () => void;
		onNext?: () => void;
		onPrevious?: () => void;
	}

	let {
		isOpen = $bindable(false),
		markerData = null,
		photos = [],
		auditTrail = [],
		actions = [],
		onClose,
		onNext,
		onPrevious
	}: Props = $props();

	// State
	let isMobile = $state(true); // Mobile-first to prevent flash on open
	let isExpanded = $state(false);
	let isDragging = $state(false);
	let activeTab = $state<'overview' | 'details' | 'photos' | 'history'>('overview');
	let container: HTMLDivElement | undefined = $state();

	// Drag state
	let dragState = $state({
		startY: 0,
		startX: 0,
		currentY: 0,
		currentX: 0,
		offset: 0,
		isHorizontal: false
	});

	// Device mode detection
	function updateDeviceMode() {
		isMobile = window.innerWidth <= 768;
		if (!isMobile && isOpen) {
			isExpanded = true;
		}
	}

	// Drag handlers
	function handleDragStart(e: TouchEvent | MouseEvent) {
		if (!isMobile || !isOpen) return;

		isDragging = true;
		const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
		const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
		dragState = {
			startY: clientY,
			startX: clientX,
			currentY: clientY,
			currentX: clientX,
			offset: 0,
			isHorizontal: false
		};
	}

	function handleDragMove(e: TouchEvent | MouseEvent) {
		if (!isDragging) return;

		const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
		const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;

		const deltaY = clientY - dragState.startY;
		const deltaX = clientX - dragState.startX;

		// Determine if horizontal or vertical swipe
		if (!dragState.isHorizontal && Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
			dragState.isHorizontal = true;
		}

		dragState = { ...dragState, currentY: clientY, currentX: clientX, offset: deltaY };
	}

	function handleDragEnd() {
		if (!isDragging) return;

		const threshold = 80;
		const deltaY = dragState.offset;
		const deltaX = dragState.currentX - dragState.startX;

		// Handle horizontal swipe for navigation
		if (dragState.isHorizontal && Math.abs(deltaX) > threshold) {
			if (deltaX > 0 && onPrevious) {
				onPrevious();
			} else if (deltaX < 0 && onNext) {
				onNext();
			}
		}
		// Handle vertical swipe for expand/collapse
		else if (deltaY > threshold) {
			if (isExpanded) {
				collapse();
			} else {
				close();
			}
		} else if (deltaY < -threshold) {
			if (!isExpanded) {
				expand();
			}
		}

		isDragging = false;
		dragState = { startY: 0, startX: 0, currentY: 0, currentX: 0, offset: 0, isHorizontal: false };
	}

	function expand() {
		if (!isMobile) return;
		isExpanded = true;
	}

	function collapse() {
		if (!isMobile) return;
		isExpanded = false;
	}

	function close() {
		isOpen = false;
		isExpanded = false;
		activeTab = 'overview';
		onClose?.();
	}

	function toggleExpanded() {
		if (!isMobile || !isOpen) return;
		isExpanded = !isExpanded;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && isOpen) {
			close();
		}
	}

	function handleBackdropClick() {
		if (!isMobile && isOpen) {
			close();
		}
	}

	function switchTab(tab: typeof activeTab) {
		activeTab = tab;
		if (!isExpanded && isMobile) {
			expand();
		}
	}

	// Derived value for tabs
	const tabValue = $derived(activeTab);

	function formatTimeAgo(dateString?: string): string {
		if (!dateString) return 'Unknown';
		const date = new Date(dateString);
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const hours = Math.floor(diff / (1000 * 60 * 60));
		const days = Math.floor(hours / 24);

		if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
		if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
		return 'Just now';
	}

	onMount(() => {
		updateDeviceMode();
		window.addEventListener('resize', updateDeviceMode);
		return () => window.removeEventListener('resize', updateDeviceMode);
	});

	const containerClasses = $derived(
		[
			'fixed z-[1000] bg-background shadow-xl transition-transform duration-300 ease-out flex flex-col',
			!isMobile && 'top-0 right-0 h-screen w-[450px] border-l border-border',
			isMobile && 'bottom-0 left-0 right-0 w-full rounded-t-xl border-t border-border',
			!isMobile && !isOpen && 'translate-x-full',
			!isMobile && isOpen && 'translate-x-0',
			isMobile && !isOpen && 'translate-y-full',
			isMobile && isOpen && !isExpanded && 'translate-y-[calc(100%-30vh)]',
			isMobile && isOpen && isExpanded && 'translate-y-0',
			isDragging && 'transition-none'
		]
			.filter(Boolean)
			.join(' ')
	);

	const dragTransform = $derived(
		isDragging && dragState.offset !== 0 && !dragState.isHorizontal
			? `translateY(${dragState.offset}px)`
			: ''
	);
</script>

<svelte:window
	onkeydown={handleKeydown}
	ontouchmove={isMobile && isDragging ? handleDragMove : undefined}
	ontouchend={isMobile && isDragging ? handleDragEnd : undefined}
	onmousemove={isMobile && isDragging ? handleDragMove : undefined}
	onmouseup={isMobile && isDragging ? handleDragEnd : undefined}
/>

{#if isOpen && !isMobile}
	<button
		class="fixed inset-0 z-[999] bg-black/20 cursor-default"
		onclick={handleBackdropClick}
		aria-label="Close sidebar"
	></button>
{/if}

<div
	bind:this={container}
	class={containerClasses}
	style:transform={dragTransform}
	style:height={isMobile ? '85vh' : '100vh'}
>
	<!-- Header with drag handle -->
	<div
		class="flex items-center justify-between p-4 bg-primary text-primary-foreground rounded-t-xl flex-shrink-0 cursor-grab select-none touch-none relative border-b border-border"
		class:cursor-grabbing={isDragging}
		role="button"
		tabindex="0"
		onmousedown={handleDragStart}
		ontouchstart={handleDragStart}
		onclick={toggleExpanded}
		onkeydown={(e) => e.key === 'Enter' && toggleExpanded()}
	>
		{#if isMobile}
			<div class="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 bg-primary-foreground/40 rounded-full"></div>
		{/if}

		<div class="flex-1 min-w-0 mt-2">
			<h3 class="text-lg font-semibold truncate">{markerData?.title ?? 'Details'}</h3>
			{#if markerData?.createdAt}
				<p class="text-xs opacity-70 mt-0.5">{formatTimeAgo(markerData.createdAt)}</p>
			{/if}
		</div>

		<button
			class="flex items-center justify-center p-2 rounded hover:bg-primary-foreground/10 transition-colors -mt-2 ml-2"
			onclick={(e) => {
				e.stopPropagation();
				close();
			}}
			aria-label="Close"
		>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
			</svg>
		</button>
	</div>

	<!-- Action Roll Bar (horizontal scrollable buttons) -->
	{#if actions.length > 0}
		<div class="border-b border-border bg-muted/30 px-4 py-3 flex-shrink-0">
			<div class="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
				{#each actions as action}
					<Button
						variant="outline"
						size="sm"
						class="flex flex-col items-center justify-center min-w-[70px] px-3 py-2 h-auto gap-1 flex-shrink-0 hover:-translate-y-0.5 transition-transform"
						onclick={action.onClick}
					>
						<span class="text-lg">{action.icon}</span>
						<span class="text-[10px] font-semibold text-center leading-tight">
							{action.label}
						</span>
					</Button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Tabs Component -->
	<Tabs.Root value={tabValue} onValueChange={(v) => switchTab(v as typeof activeTab)} class="flex-1 flex flex-col min-h-0">
		<Tabs.List class="grid w-full grid-cols-4 flex-shrink-0">
			<Tabs.Trigger value="overview" class="text-xs sm:text-sm">Overview</Tabs.Trigger>
			<Tabs.Trigger value="details" class="text-xs sm:text-sm">Details</Tabs.Trigger>
			<Tabs.Trigger value="photos" class="text-xs sm:text-sm">Photos</Tabs.Trigger>
			<Tabs.Trigger value="history" class="text-xs sm:text-sm">History</Tabs.Trigger>
		</Tabs.List>

		<!-- Overview Tab Content -->
		<Tabs.Content value="overview" class="flex-1 min-h-0 overflow-hidden">
			<ScrollArea class="h-full">
				<div class="p-4 space-y-4">
					{#if markerData?.status}
						<Badge class="bg-green-100 text-green-800 hover:bg-green-100">
							{markerData.status}
						</Badge>
					{/if}

					{#if markerData?.description}
						<div>
							<h4 class="text-sm font-semibold text-foreground mb-2">Description</h4>
							<p class="text-muted-foreground text-sm">{markerData.description}</p>
						</div>
					{/if}

					<!-- Info Cards -->
					<div class="grid grid-cols-2 gap-2">
						{#if markerData?.location}
							<Card.Root>
								<Card.Content class="p-3">
									<div class="text-xs text-muted-foreground mb-1">Location</div>
									<div class="text-sm font-medium text-foreground">{markerData.location}</div>
								</Card.Content>
							</Card.Root>
						{/if}
						{#if markerData?.lat && markerData?.lng}
							<Card.Root>
								<Card.Content class="p-3">
									<div class="text-xs text-muted-foreground mb-1">Coordinates</div>
									<div class="text-xs font-mono text-foreground">
										{markerData.lat.toFixed(5)}, {markerData.lng.toFixed(5)}
									</div>
								</Card.Content>
							</Card.Root>
						{/if}
					</div>

					<!-- Photo Preview -->
					{#if photos.length > 0}
						<div>
							<div class="flex items-center justify-between mb-2">
								<h4 class="text-sm font-semibold text-foreground">Photos</h4>
								<Button
									variant="ghost"
									size="sm"
									class="h-auto py-1 px-2 text-xs"
									onclick={() => switchTab('photos')}
								>
									View All ({photos.length})
								</Button>
							</div>
							<div class="grid grid-cols-3 gap-2">
								{#each photos.slice(0, 3) as photo}
									<div class="aspect-square rounded-md overflow-hidden bg-muted border border-border">
										<img src={photo.url} alt={photo.caption} class="w-full h-full object-cover" loading="lazy" />
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<Separator />

					<!-- Recent Activity -->
					{#if auditTrail.length > 0}
						<div>
							<div class="flex items-center justify-between mb-2">
								<h4 class="text-sm font-semibold text-foreground">Recent Activity</h4>
								<Button
									variant="ghost"
									size="sm"
									class="h-auto py-1 px-2 text-xs"
									onclick={() => switchTab('history')}
								>
									View All
								</Button>
							</div>
							<div class="space-y-2">
								{#each auditTrail.slice(0, 3) as entry}
									<div class="flex items-start gap-2 text-sm">
										<div class="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0"></div>
										<div class="flex-1 min-w-0">
											<div class="font-medium text-foreground text-sm">{entry.action_name}</div>
											<div class="text-xs text-muted-foreground">{entry.participant_name} • {formatTimeAgo(entry.executed_at)}</div>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</ScrollArea>
		</Tabs.Content>

		<!-- Details Tab Content -->
		<Tabs.Content value="details" class="flex-1 min-h-0 overflow-hidden">
			<ScrollArea class="h-full">
				<div class="p-4 space-y-3">
					<h3 class="font-semibold text-foreground">Detailed Information</h3>
					{#if markerData}
						{#each Object.entries(markerData).filter(([key]) => !['id', 'title', 'description'].includes(key)) as [key, value]}
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
						<p class="text-muted-foreground text-sm">No data available</p>
					{/if}
				</div>
			</ScrollArea>
		</Tabs.Content>

		<!-- Photos Tab Content -->
		<Tabs.Content value="photos" class="flex-1 min-h-0 overflow-hidden">
			<ScrollArea class="h-full">
				<div class="p-4 space-y-4">
					<h3 class="font-semibold text-foreground mb-3">Photo Gallery</h3>
					{#if photos.length > 0}
						<Carousel.Root class="w-full">
							<Carousel.Content>
								{#each photos as photo}
									<Carousel.Item class="basis-4/5 md:basis-1/2">
										<Card.Root>
											<Card.Content class="p-2">
												<div class="aspect-square rounded-md overflow-hidden bg-muted mb-2">
													<img src={photo.url} alt={photo.caption} class="w-full h-full object-cover" loading="lazy" />
												</div>
												<div class="text-xs font-medium text-foreground line-clamp-2">{photo.caption}</div>
												{#if photo.stageName}
													<div class="text-xs text-muted-foreground mt-0.5">{photo.stageName}</div>
												{/if}
											</Card.Content>
										</Card.Root>
									</Carousel.Item>
								{/each}
							</Carousel.Content>
							<Carousel.Previous class="left-2" />
							<Carousel.Next class="right-2" />
						</Carousel.Root>
					{:else}
						<div class="text-center py-12 text-muted-foreground">
							<svg class="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
							</svg>
							<p class="text-sm">No photos available</p>
						</div>
					{/if}
				</div>
			</ScrollArea>
		</Tabs.Content>

		<!-- History Tab Content -->
		<Tabs.Content value="history" class="flex-1 min-h-0 overflow-hidden">
			<ScrollArea class="h-full">
				<div class="p-4 space-y-4">
					<h3 class="font-semibold text-foreground mb-3">Activity History</h3>
					{#if auditTrail.length > 0}
						<div class="space-y-3">
							{#each auditTrail as entry}
								<div class="relative pl-5 pb-3 border-l-2 border-border last:border-0 last:pb-0">
									<div class="absolute left-[-5px] top-0 w-2.5 h-2.5 rounded-full bg-primary"></div>
									<div class="space-y-0.5">
										<div class="font-medium text-foreground text-sm">{entry.action_name}</div>
										<div class="text-xs text-muted-foreground">by {entry.participant_name}</div>
										<div class="text-xs text-muted-foreground">{formatTimeAgo(entry.executed_at)}</div>
										{#if entry.notes}
											<div class="text-xs text-muted-foreground mt-1.5 bg-muted rounded p-2 border border-border">{entry.notes}</div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="text-center py-12 text-muted-foreground">
							<svg class="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
							</svg>
							<p class="text-sm">No activity history</p>
						</div>
					{/if}
				</div>
			</ScrollArea>
		</Tabs.Content>
	</Tabs.Root>
</div>

