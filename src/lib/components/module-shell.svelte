<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { Portal } from 'bits-ui';
	import type { Action as SvelteAction } from 'svelte/action';
	import { X } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages';

	// ==========================================================================
	// Types
	// ==========================================================================

	interface Props {
		/** Controls sidebar visibility */
		isOpen?: boolean;
		/** Controls expanded/peek state on mobile */
		isExpanded?: boolean;
		/** Title displayed in header */
		title?: string;
		/** Subtitle displayed below title */
		subtitle?: string;
		/** Badge text (e.g., stage indicator) */
		badge?: string;
		/** Loading state */
		isLoading?: boolean;
		/** Error message */
		error?: string | null;
		/** Close handler */
		onClose?: () => void;
		/** Next item navigation (horizontal swipe) */
		onNext?: () => void;
		/** Previous item navigation (horizontal swipe) */
		onPrevious?: () => void;
		/** Content snippet */
		content?: Snippet;
		/** Footer snippet (for buttons, pagination, etc.) */
		footer?: Snippet;
		/** Header actions snippet (additional buttons in header) */
		headerActions?: Snippet;
		/** Whether to show the header (default true) */
		showHeader?: boolean;
		/** Custom mobile height in vh (default 35 peek, 90 expanded) */
		mobileHeightPeek?: number;
		mobileHeightExpanded?: number;
	}

	let {
		isOpen = $bindable(false),
		isExpanded = $bindable(false),
		title = m.moduleShellDefaultTitle(),
		subtitle,
		badge,
		isLoading = false,
		error = null,
		onClose,
		onNext,
		onPrevious,
		content,
		footer,
		headerActions,
		showHeader = true,
		mobileHeightPeek = 35,
		mobileHeightExpanded = 90
	}: Props = $props();

	// ==========================================================================
	// Constants
	// ==========================================================================

	const SWIPE_THRESHOLD = 110; // px - threshold to trigger expand/collapse
	const BOUNDARY_TOLERANCE = 5; // px - tolerance for detecting scroll boundaries

	// ==========================================================================
	// State
	// ==========================================================================

	let isMobile = $state(true); // Mobile-first to prevent flash on open
	let isDragging = $state(false);
	let container: HTMLDivElement | undefined = $state();

	// Content scroll boundary tracking
	let isAtScrollTop = $state(true);
	let isAtScrollBottom = $state(false);
	let contentTouchState = $state({
		startX: 0,
		startY: 0,
		currentY: 0,
		isTracking: false,
		wasAtTop: false,
		wasAtBottom: false,
		initialScrollTop: 0,
		hasScrolledDuringTouch: false
	});

	// Header drag state
	let dragState = $state({
		startY: 0,
		startX: 0,
		currentY: 0,
		currentX: 0,
		offset: 0,
		isHorizontal: false
	});

	// ==========================================================================
	// Derived
	// ==========================================================================

	const mobileHeight = $derived(isExpanded ? mobileHeightExpanded : mobileHeightPeek);

	// Content swipe preview offset - moves the sheet slightly during boundary swipes
	const contentSwipeOffset = $derived.by(() => {
		if (!contentTouchState.isTracking) return 0;
		if (contentTouchState.hasScrolledDuringTouch) return 0;

		const deltaY = contentTouchState.currentY - contentTouchState.startY;
		const maxPreviewOffset = 66; // Max pixels to move as preview (ratio 0.6 of SWIPE_THRESHOLD)

		// At top + swiping down = show collapse preview (move down)
		if (contentTouchState.wasAtTop && isAtScrollTop && deltaY > 0) {
			return Math.min(maxPreviewOffset, deltaY * 0.4);
		}

		// At bottom + swiping up = show expand preview (move up)
		if (contentTouchState.wasAtBottom && isAtScrollBottom && deltaY < 0 && !isExpanded) {
			return Math.max(-maxPreviewOffset, deltaY * 0.4);
		}

		return 0;
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
	// Scroll Boundary Detection
	// ==========================================================================

	function updateScrollBoundaries(scrollContainer: HTMLElement) {
		const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
		isAtScrollTop = scrollTop <= BOUNDARY_TOLERANCE;
		isAtScrollBottom = scrollTop + clientHeight >= scrollHeight - BOUNDARY_TOLERANCE;
	}

	function handleContentScroll(e: Event) {
		const target = e.target as HTMLElement;
		updateScrollBoundaries(target);
	}

	// ==========================================================================
	// Svelte Action for Non-Passive Touch Events
	// Svelte 5 makes touch events passive by default, so preventDefault() won't work.
	// This action attaches non-passive listeners to allow preventDefault().
	// ==========================================================================

	export function scrollableContent(node: HTMLElement): ReturnType<SvelteAction> {
		function handleTouchStart(e: TouchEvent) {
			if (!isMobile || !isOpen) return;

			updateScrollBoundaries(node);

			contentTouchState = {
				startX: e.touches[0].clientX,
				startY: e.touches[0].clientY,
				currentY: e.touches[0].clientY,
				isTracking: true,
				wasAtTop: isAtScrollTop,
				wasAtBottom: isAtScrollBottom,
				initialScrollTop: node.scrollTop,
				hasScrolledDuringTouch: false
			};
		}

		function handleTouchMove(e: TouchEvent) {
			if (!contentTouchState.isTracking || !isMobile) return;

			const clientX = e.touches[0].clientX;
			const clientY = e.touches[0].clientY;
			const deltaX = clientX - contentTouchState.startX;
			const deltaY = clientY - contentTouchState.startY;

			// Horizontal swipe intent -- stop tracking so all remaining events
			// for this gesture pass through to child elements (e.g. carousel)
			if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
				contentTouchState.isTracking = false;
				return;
			}

			contentTouchState.currentY = clientY;

			// Check if actual scrolling has occurred
			if (node.scrollTop !== contentTouchState.initialScrollTop) {
				contentTouchState.hasScrolledDuringTouch = true;
			}

			// If user is scrolling content, don't interfere
			if (contentTouchState.hasScrolledDuringTouch) {
				return;
			}

			updateScrollBoundaries(node);

			// Only prevent default for swipe gestures after threshold
			// At top + swiping down
			if (contentTouchState.wasAtTop && isAtScrollTop && deltaY > 20) {
				e.preventDefault();
			}
			// At bottom + swiping up (to expand)
			if (contentTouchState.wasAtBottom && isAtScrollBottom && deltaY < -20 && !isExpanded) {
				e.preventDefault();
			}
		}

		function handleTouchEnd() {
			if (!contentTouchState.isTracking || !isMobile) return;

			const deltaY = contentTouchState.currentY - contentTouchState.startY;

			// Only trigger if no actual scrolling occurred
			if (!contentTouchState.hasScrolledDuringTouch) {
				// At top + swipe down -> collapse or close
				if (contentTouchState.wasAtTop && isAtScrollTop && deltaY > SWIPE_THRESHOLD) {
					if (isExpanded) {
						collapse();
					} else {
						close();
					}
				}
				// At bottom + swipe up -> expand
				else if (contentTouchState.wasAtBottom && isAtScrollBottom && deltaY < -SWIPE_THRESHOLD && !isExpanded) {
					expand();
				}
			}

			contentTouchState = {
				startX: 0,
				startY: 0,
				currentY: 0,
				isTracking: false,
				wasAtTop: false,
				wasAtBottom: false,
				initialScrollTop: 0,
				hasScrolledDuringTouch: false
			};
		}

		// Attach non-passive event listeners
		node.addEventListener('touchstart', handleTouchStart, { passive: true });
		node.addEventListener('touchmove', handleTouchMove, { passive: false }); // non-passive to allow preventDefault
		node.addEventListener('touchend', handleTouchEnd, { passive: true });
		node.addEventListener('scroll', handleContentScroll, { passive: true });

		return {
			destroy() {
				node.removeEventListener('touchstart', handleTouchStart);
				node.removeEventListener('touchmove', handleTouchMove);
				node.removeEventListener('touchend', handleTouchEnd);
				node.removeEventListener('scroll', handleContentScroll);
			}
		};
	}

	// ==========================================================================
	// Header Drag Handlers
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

	// Disable transitions during any active gesture
	const isGesturing = $derived(isDragging || (contentTouchState.isTracking && contentSwipeOffset !== 0));

	const containerClasses = $derived(
		[
			'fixed z-[1200] bg-background shadow-xl flex flex-col pointer-events-auto',
			!isMobile && 'top-14 right-0 h-[calc(100vh-56px)] w-[450px] border-l border-border transition-transform duration-300 ease-out',
			isMobile && 'bottom-0 left-0 right-0 w-full rounded-t-xl border-t border-border transition-[height,transform] duration-300 ease-out overflow-visible',
			!isMobile && !isOpen && 'translate-x-full',
			!isMobile && isOpen && 'translate-x-0',
			isMobile && !isOpen && 'translate-y-full',
			isMobile && isOpen && 'translate-y-0',
			isGesturing && 'transition-none'
		]
			.filter(Boolean)
			.join(' ')
	);

	// Combined transform for header drag AND content swipe preview
	const gestureTransform = $derived.by(() => {
		// Header drag takes priority
		if (isDragging && dragState.offset !== 0 && !dragState.isHorizontal) {
			return `translateY(${Math.max(0, dragState.offset)}px)`;
		}
		// Content swipe preview
		if (contentSwipeOffset !== 0) {
			return `translateY(${contentSwipeOffset}px)`;
		}
		return '';
	});
</script>

<svelte:window
	onkeydown={handleKeydown}
	ontouchmove={isMobile && isDragging ? handleDragMove : undefined}
	ontouchend={isMobile && isDragging ? handleDragEnd : undefined}
	onmousemove={isMobile && isDragging ? handleDragMove : undefined}
	onmouseup={isMobile && isDragging ? handleDragEnd : undefined}
/>

<!-- Portaled to <body> so its z-index competes with other body-portaled
     overlays (shadcn sheets) rather than being trapped inside a page-subtree
     stacking context. bits-ui Portal uses Svelte's mount() under the hood,
     keeping event delegation and bindings intact. -->
<Portal to="body">
<div
	bind:this={container}
	class={containerClasses}
	style:transform={gestureTransform}
	style:height={isMobile ? `${mobileHeight}vh` : undefined}
	data-testid="workflow-detail-sidebar"
>
	<!-- Background extension to fill gap when sheet moves up during expand preview -->
	{#if isMobile}
		<div
			class="absolute left-0 right-0 bg-background pointer-events-none"
			style:top="100%"
			style:height="80px"
		></div>
	{/if}

	<!-- Header -->
	{#if showHeader}
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
					aria-label={m.moduleShellClose()}
				>
					<X class="w-4 h-4" />
				</button>
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
				<p class="text-sm text-muted-foreground">{m.moduleShellLoading()}</p>
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
				<p class="text-sm text-destructive font-medium mb-1">{m.moduleShellError()}</p>
				<p class="text-xs text-muted-foreground">{error}</p>
			</div>
		</div>
	{:else if content}
		<!-- Content via snippet -->
		<div
			class="flex-1 min-h-0 overflow-y-auto overscroll-none"
			use:scrollableContent
		>
			{@render content()}
		</div>
	{:else}
		<!-- Empty State -->
		<div class="flex-1 flex items-center justify-center">
			<p class="text-sm text-muted-foreground">{m.moduleShellNoContent()}</p>
		</div>
	{/if}

	<!-- Footer -->
	{#if footer && !isLoading && !error}
		<div class="flex-shrink-0 border-t border-border bg-muted/30">
			{@render footer()}
		</div>
	{/if}
</div>
</Portal>
