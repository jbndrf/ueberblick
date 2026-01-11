<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { X } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		onClose?: () => void;
		title?: string;
		subtitle?: string;
		stage?: string;
		children?: Snippet;
		class?: string;
	}

	let {
		open = $bindable(),
		onClose,
		title,
		subtitle,
		stage,
		children,
		class: className = ''
	}: Props = $props();

	let containerEl: HTMLDivElement;
	let contentEl: HTMLDivElement;
	let isDragging = false;
	let startY = 0;
	let currentY = 0;
	let isExpanded = $state(false);
	let isMobile = $state(true);

	// Watch for open state changes and dispatch events
	$effect(() => {
		if (typeof window !== 'undefined') {
			if (open) {
				window.dispatchEvent(new CustomEvent('bottom-sheet:opened'));
			} else {
				window.dispatchEvent(new CustomEvent('bottom-sheet:closed'));
			}
		}
	});

	onMount(() => {
		checkMobile();
		window.addEventListener('resize', checkMobile);
		return () => window.removeEventListener('resize', checkMobile);
	});

	function checkMobile() {
		isMobile = window.innerWidth < 1024;
	}

	function handleClose() {
		open = false;
		isExpanded = false;
		onClose?.();
	}

	// Mobile drag handlers
	function handleDragStart(e: TouchEvent | MouseEvent) {
		if (!isMobile) return;

		isDragging = true;
		const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
		startY = clientY;
		currentY = clientY;

		containerEl?.classList.add('dragging');
	}

	function handleDragMove(e: TouchEvent | MouseEvent) {
		if (!isDragging || !isMobile) return;

		const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
		const deltaY = clientY - startY;

		// Prevent default to avoid scrolling while dragging header
		if (Math.abs(deltaY) > 5) {
			e.preventDefault();
		}

		currentY = clientY;

		// Apply drag feedback
		if (containerEl) {
			containerEl.style.setProperty('--drag-offset', `${Math.max(0, deltaY)}px`);
			containerEl.classList.add('drag-feedback');
		}
	}

	function handleDragEnd() {
		if (!isDragging || !isMobile) return;

		isDragging = false;
		containerEl?.classList.remove('dragging', 'drag-feedback');

		const deltaY = currentY - startY;
		const threshold = 100;

		if (deltaY > threshold) {
			// Close if dragged down significantly
			if (isExpanded) {
				isExpanded = false;
			} else {
				handleClose();
			}
		} else if (deltaY < -threshold) {
			// Expand if dragged up
			isExpanded = true;
		}

		// Reset drag offset
		if (containerEl) {
			containerEl.style.removeProperty('--drag-offset');
		}
	}

	// Content scroll handling for mobile
	function handleContentTouchStart(e: TouchEvent) {
		if (!isMobile || !contentEl) return;

		const scrollTop = contentEl.scrollTop;
		const scrollHeight = contentEl.scrollHeight;
		const clientHeight = contentEl.clientHeight;
		const isAtTop = scrollTop === 0;
		const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;

		if (isAtTop) {
			containerEl?.classList.add('scroll-at-top');
		}
		if (isAtBottom) {
			containerEl?.classList.add('scroll-at-bottom');
		}
	}

	function handleContentTouchEnd() {
		if (!isMobile) return;
		containerEl?.classList.remove('scroll-at-top', 'scroll-at-bottom');
	}

	// Toggle expand on header click (mobile only)
	function toggleExpand() {
		if (!isMobile) return;
		isExpanded = !isExpanded;
	}
</script>

<div
	bind:this={containerEl}
	class="bottom-sheet-container {isMobile ? 'mobile' : 'desktop'} {className}"
	class:open
	class:expanded={isExpanded}
	role="dialog"
	aria-modal="true"
	aria-labelledby="bottom-sheet-title"
>
	<!-- Header with drag functionality -->
	<div
		class="bottom-sheet-header"
		class:has-dynamic-header={subtitle || stage}
		ontouchstart={handleDragStart}
		ontouchmove={handleDragMove}
		ontouchend={handleDragEnd}
		onmousedown={handleDragStart}
		onmousemove={handleDragMove}
		onmouseup={handleDragEnd}
		onclick={toggleExpand}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				toggleExpand();
			}
		}}
		role="button"
		tabindex="0"
	>
		<div class="bottom-sheet-header-content">
			<div class="bottom-sheet-title-section">
				{#if title}
					<h2 id="bottom-sheet-title" class="bottom-sheet-title">{title}</h2>
				{/if}
				{#if subtitle}
					<p class="bottom-sheet-subtitle">{subtitle}</p>
				{/if}
			</div>
			{#if stage}
				<div class="bottom-sheet-stage-info">
					<span class="bottom-sheet-stage">{stage}</span>
				</div>
			{/if}
		</div>
		<Button
			variant="ghost"
			size="icon"
			class="bottom-sheet-close"
			onclick={(e) => {
				e.stopPropagation();
				handleClose();
			}}
			aria-label="Close"
		>
			<X class="h-4 w-4" />
		</Button>
	</div>

	<!-- Content -->
	<div
		bind:this={contentEl}
		class="bottom-sheet-content"
		ontouchstart={handleContentTouchStart}
		ontouchend={handleContentTouchEnd}
	>
		{#if children}
			{@render children()}
		{/if}
	</div>
</div>

<style>
	/* Base container styles */
	.bottom-sheet-container {
		position: fixed;
		z-index: 1000;
		background: white;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
		transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
		transform: translateX(100%);
		opacity: 0;
		visibility: hidden;
	}

	.bottom-sheet-container.open {
		opacity: 1;
		visibility: visible;
		transform: translateX(0);
	}

	/* Desktop sidebar mode */
	.bottom-sheet-container.desktop {
		top: 0;
		right: 0;
		width: 400px;
		height: 100vh;
		border-left: 1px solid hsl(var(--border));
		display: flex;
		flex-direction: column;
		overflow: hidden;
		transform: translateX(100%);
	}

	.bottom-sheet-container.desktop.open {
		transform: translateX(0);
	}

	.bottom-sheet-container.desktop .bottom-sheet-header {
		cursor: default;
	}

	.bottom-sheet-container.desktop .bottom-sheet-header::before {
		display: none;
	}

	/* Mobile bottom sheet mode */
	.bottom-sheet-container.mobile {
		bottom: 0;
		left: 0;
		right: 0;
		width: 100%;
		height: 70vh;
		max-height: 90vh;
		border-radius: 12px 12px 0 0;
		border-top: 1px solid hsl(var(--border));
		transform: translate3d(0, 100%, 0);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		z-index: 1500;
		will-change: transform;
		contain: layout style paint;
	}

	.bottom-sheet-container.mobile.open:not(.expanded) {
		transform: translate3d(0, calc(100% - 30vh), 0);
	}

	.bottom-sheet-container.mobile.open.expanded {
		transform: translate3d(0, 0, 0);
	}

	/* Header styles */
	.bottom-sheet-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: 15px 20px 10px 20px;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		flex-shrink: 0;
		z-index: 10;
		border-radius: 12px 12px 0 0;
		position: relative;
		user-select: none;
		min-height: 60px;
	}

	.bottom-sheet-container.mobile .bottom-sheet-header {
		cursor: grab;
		touch-action: none;
	}

	.bottom-sheet-container.mobile .bottom-sheet-header:active {
		cursor: grabbing;
	}

	/* Drag indicator */
	.bottom-sheet-container.mobile .bottom-sheet-header::before {
		content: '';
		position: absolute;
		top: 8px;
		left: 50%;
		transform: translateX(-50%);
		width: 40px;
		height: 4px;
		background-color: rgba(255, 255, 255, 0.4);
		border-radius: 2px;
		transition: all 0.15s cubic-bezier(0.2, 0, 0.2, 1);
	}

	.bottom-sheet-container.mobile.dragging .bottom-sheet-header::before {
		background-color: rgba(255, 255, 255, 0.95);
		transform: translateX(-50%) scaleX(1.3);
	}

	/* Header content */
	.bottom-sheet-header-content {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		width: 100%;
		gap: 15px;
		margin-right: 15px;
	}

	.bottom-sheet-title-section {
		flex: 1;
		min-width: 0;
	}

	.bottom-sheet-title {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
		line-height: 1.2;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.bottom-sheet-subtitle {
		margin: 4px 0 0 0;
		font-size: 13px;
		font-weight: 400;
		opacity: 0.8;
		line-height: 1.2;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.bottom-sheet-stage-info {
		flex-shrink: 0;
		display: flex;
		align-items: flex-start;
	}

	.bottom-sheet-stage {
		font-size: 13px;
		font-weight: 500;
		background: rgba(255, 255, 255, 0.15);
		padding: 4px 10px;
		border-radius: 12px;
		white-space: nowrap;
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	/* Content area */
	.bottom-sheet-content {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 0;
		background: white;
		min-height: 0;
		-webkit-overflow-scrolling: touch;
		scroll-behavior: smooth;
	}

	/* Drag feedback */
	.bottom-sheet-container.mobile.drag-feedback {
		transform: translate3d(0, var(--drag-offset, 0), 0) !important;
		transition: none;
	}

	/* Reduced motion support */
	@media (prefers-reduced-motion: reduce) {
		.bottom-sheet-container,
		.bottom-sheet-header {
			transition: none;
		}
	}

	/* Small mobile adjustments */
	@media (max-width: 479px) {
		.bottom-sheet-container.mobile {
			height: 80vh;
			border-radius: 8px 8px 0 0;
		}

		.bottom-sheet-header {
			padding: 12px 16px;
		}

		.bottom-sheet-title {
			font-size: 16px;
		}
	}

	/* Close button */
	:global(.bottom-sheet-close) {
		flex-shrink: 0;
		align-self: flex-start;
		margin-top: -2px;
		color: inherit;
	}

	:global(.bottom-sheet-close:hover) {
		background: rgba(255, 255, 255, 0.1);
	}
</style>
