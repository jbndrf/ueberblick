<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Tabs from '$lib/components/ui/tabs';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { X } from 'lucide-svelte';

	// ==========================================================================
	// Types
	// ==========================================================================

	interface Tab {
		id: string;
		label: string;
	}

	interface Action {
		id: string;
		label: string;
		icon: Snippet;
		color?: string;
		disabled?: boolean;
		onClick: () => void;
	}

	interface Props {
		/** Controls sidebar visibility */
		isOpen?: boolean;
		/** Title displayed in header */
		title?: string;
		/** Subtitle displayed below title */
		subtitle?: string;
		/** Badge text (e.g., stage indicator) */
		badge?: string;
		/** Tab definitions */
		tabs?: Tab[];
		/** Currently active tab id */
		activeTab?: string;
		/** Action buttons for the roll bar */
		actions?: Action[];
		/** Loading state */
		isLoading?: boolean;
		/** Error message */
		error?: string | null;
		/** Close handler */
		onClose?: () => void;
		/** Next item navigation */
		onNext?: () => void;
		/** Previous item navigation */
		onPrevious?: () => void;
		/** Tab change handler */
		onTabChange?: (tabId: string) => void;
		/** Tab content snippet - receives tab id */
		tabContent?: Snippet<[string]>;
		/** Header actions snippet (additional buttons in header) */
		headerActions?: Snippet;
	}

	let {
		isOpen = $bindable(false),
		title = 'Details',
		subtitle,
		badge,
		tabs = [],
		activeTab = $bindable(''),
		actions = [],
		isLoading = false,
		error = null,
		onClose,
		onNext,
		onPrevious,
		onTabChange,
		tabContent,
		headerActions
	}: Props = $props();

	// ==========================================================================
	// State
	// ==========================================================================

	let isMobile = $state(false);
	let isExpanded = $state(false);
	let isDragging = $state(false);
	let container: HTMLDivElement | undefined = $state();

	let dragState = $state({
		startY: 0,
		startX: 0,
		currentY: 0,
		currentX: 0,
		offset: 0,
		isHorizontal: false
	});

	// ==========================================================================
	// Device Detection
	// ==========================================================================

	function updateDeviceMode() {
		isMobile = window.innerWidth <= 768;
		if (!isMobile && isOpen) {
			isExpanded = true;
		}
	}

	// ==========================================================================
	// Drag Handlers
	// ==========================================================================

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

	// ==========================================================================
	// Actions
	// ==========================================================================

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

	function handleTabChange(tabId: string) {
		activeTab = tabId;
		onTabChange?.(tabId);
		if (!isExpanded && isMobile) {
			expand();
		}
	}

	// ==========================================================================
	// Lifecycle
	// ==========================================================================

	onMount(() => {
		updateDeviceMode();
		window.addEventListener('resize', updateDeviceMode);
		return () => window.removeEventListener('resize', updateDeviceMode);
	});

	// ==========================================================================
	// Derived Classes
	// ==========================================================================

	const containerClasses = $derived(
		[
			'fixed z-[1000] bg-background shadow-xl transition-transform duration-300 ease-out flex flex-col',
			!isMobile && 'top-14 right-0 h-[calc(100vh-56px)] w-[450px] border-l border-border',
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

<!-- Main Container -->
<div
	bind:this={container}
	class={containerClasses}
	style:transform={dragTransform}
	style:height={isMobile ? '85vh' : undefined}
>
	<!-- Header -->
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
		<!-- Drag Handle (mobile only) -->
		{#if isMobile}
			<div
				class="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 bg-primary-foreground/40 rounded-full"
			></div>
		{/if}

		<!-- Title & Subtitle -->
		<div class="flex-1 min-w-0 mt-2">
			<div class="flex items-center gap-2">
				<h3 class="text-lg font-semibold truncate">{title}</h3>
				{#if badge}
					<span
						class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-primary-foreground/20"
					>
						{badge}
					</span>
				{/if}
			</div>
			{#if subtitle}
				<p class="text-xs opacity-70 mt-0.5 truncate">{subtitle}</p>
			{/if}
		</div>

		<!-- Header Actions -->
		<div class="flex items-center gap-1 -mt-2 ml-2">
			{#if headerActions}
				{@render headerActions()}
			{/if}
			<button
				class="flex items-center justify-center p-2 rounded hover:bg-primary-foreground/10 transition-colors"
				onclick={(e) => {
					e.stopPropagation();
					close();
				}}
				aria-label="Close"
			>
				<X class="w-4 h-4" />
			</button>
		</div>
	</div>

	<!-- Action Roll Bar -->
	{#if actions.length > 0}
		<div class="border-b border-border bg-muted/30 px-4 py-3 flex-shrink-0">
			<div class="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
				{#each actions as action}
					<Button
						variant="outline"
						size="sm"
						class="flex flex-col items-center justify-center min-w-[70px] px-3 py-2 h-auto gap-1 flex-shrink-0 hover:-translate-y-0.5 transition-transform"
						disabled={action.disabled}
						onclick={action.onClick}
					>
						<span class="text-lg">
							{@render action.icon()}
						</span>
						<span class="text-[10px] font-semibold text-center leading-tight">
							{action.label}
						</span>
					</Button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Content Area -->
	{#if isLoading}
		<!-- Loading State -->
		<div class="flex-1 flex items-center justify-center">
			<div class="text-center">
				<div
					class="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"
				></div>
				<p class="text-sm text-muted-foreground">Loading...</p>
			</div>
		</div>
	{:else if error}
		<!-- Error State -->
		<div class="flex-1 flex items-center justify-center p-4">
			<div class="text-center">
				<div
					class="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-3"
				>
					<X class="w-6 h-6 text-destructive" />
				</div>
				<p class="text-sm text-destructive font-medium mb-1">Error</p>
				<p class="text-xs text-muted-foreground">{error}</p>
			</div>
		</div>
	{:else if tabs.length > 0 && tabContent}
		<!-- Tabs Layout -->
		<Tabs.Root
			value={activeTab}
			onValueChange={(v) => handleTabChange(v as string)}
			class="flex-1 flex flex-col min-h-0"
		>
			<Tabs.List
				class="grid w-full flex-shrink-0"
				style="grid-template-columns: repeat({tabs.length}, minmax(0, 1fr))"
			>
				{#each tabs as tab}
					<Tabs.Trigger value={tab.id} class="text-xs sm:text-sm">
						{tab.label}
					</Tabs.Trigger>
				{/each}
			</Tabs.List>

			{#each tabs as tab}
				<Tabs.Content value={tab.id} class="flex-1 min-h-0 overflow-hidden">
					<ScrollArea class="h-full">
						<div class="p-4">
							{@render tabContent(tab.id)}
						</div>
					</ScrollArea>
				</Tabs.Content>
			{/each}
		</Tabs.Root>
	{:else if tabContent}
		<!-- No Tabs - Single Content Area -->
		<ScrollArea class="flex-1 min-h-0">
			<div class="p-4">
				{@render tabContent('')}
			</div>
		</ScrollArea>
	{:else}
		<!-- Empty State -->
		<div class="flex-1 flex items-center justify-center">
			<p class="text-sm text-muted-foreground">No content</p>
		</div>
	{/if}
</div>
