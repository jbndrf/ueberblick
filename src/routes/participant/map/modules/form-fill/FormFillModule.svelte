<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { X, ChevronLeft, ChevronRight, Send, Loader2 } from 'lucide-svelte';
	import { getParticipantGateway } from '$lib/participant-state/context.svelte';
	import {
		loadEntryForm,
		loadConnectionForm,
		getTotalPages,
		getCurrentPageRows,
		getCurrentPageTitle,
		canGoNext,
		canGoPrevious,
		getFieldError,
		validatePage,
		validateAll,
		type FormFillState
	} from './state.svelte';
	import FieldRenderer from './FieldRenderer.svelte';
	import type { FormField } from './types';

	interface Props {
		/** Workflow ID to load entry form for */
		workflowId: string;
		/** Optional connection ID - if provided, loads form for this specific connection */
		connectionId?: string;
		/** Called when form is submitted successfully */
		onSubmit: (values: Record<string, unknown>, connectionId: string) => Promise<void>;
		/** Called when user closes the form */
		onClose: () => void;
		/** Whether the bottomsheet is open */
		isOpen?: boolean;
	}

	let { workflowId, connectionId, onSubmit, onClose, isOpen = $bindable(true) }: Props = $props();

	const gateway = getParticipantGateway();

	// Form state as a simple reactive variable
	let formState = $state<FormFillState | null>(null);
	let isSubmitting = $state(false);

	// UI state - detect mobile immediately (not just on mount)
	let isMobile = $state(typeof window !== 'undefined' && window.innerWidth < 768);
	let isExpanded = $state(false);
	let isDragging = $state(false);
	let container: HTMLDivElement | undefined = $state();

	let dragState = $state({
		startY: 0,
		currentY: 0,
		offset: 0
	});

	// ==========================================================================
	// Initialization
	// ==========================================================================

	onMount(() => {
		updateDeviceMode();
		window.addEventListener('resize', updateDeviceMode);

		// Load form on mount if open
		if (isOpen && workflowId && gateway) {
			loadForm();
		}

		return () => window.removeEventListener('resize', updateDeviceMode);
	});

	async function loadForm() {
		if (!gateway) return;
		if (connectionId) {
			// Load form for specific connection (tool flow from existing instance)
			formState = await loadConnectionForm(gateway, workflowId, connectionId);
		} else {
			// Load entry form (new workflow creation)
			formState = await loadEntryForm(gateway, workflowId);
		}
	}

	function updateDeviceMode() {
		isMobile = window.innerWidth < 768;

		if (!isMobile && isOpen) {
			isExpanded = true;
		}
	}

	// ==========================================================================
	// Drag Handlers (Mobile)
	// ==========================================================================

	function handleDragStart(e: TouchEvent | MouseEvent) {
		if (!isMobile || !isOpen) return;

		isDragging = true;
		const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
		dragState = { startY: clientY, currentY: clientY, offset: 0 };
	}

	function handleDragMove(e: TouchEvent | MouseEvent) {
		if (!isDragging) return;

		const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
		const deltaY = clientY - dragState.startY;
		dragState = { ...dragState, currentY: clientY, offset: deltaY };
	}

	function handleDragEnd() {
		if (!isDragging) return;

		const threshold = 80;
		const deltaY = dragState.offset;

		if (deltaY > threshold) {
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
		dragState = { startY: 0, currentY: 0, offset: 0 };
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
		formState = null;
		onClose();
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

	// ==========================================================================
	// Form Navigation & Submit
	// ==========================================================================

	function handleNextPage() {
		if (!formState) return;

		// Validate current page
		const errors = validatePage(formState, formState.currentPage);
		formState = { ...formState, errors };

		if (errors.length === 0 && canGoNext(formState)) {
			formState = { ...formState, currentPage: formState.currentPage + 1 };
		}
	}

	function handlePreviousPage() {
		if (!formState) return;

		if (canGoPrevious(formState)) {
			formState = { ...formState, currentPage: formState.currentPage - 1 };
		}
	}

	async function handleSubmit() {
		if (!formState || isSubmitting) return;

		// Validate all pages
		const errors = validateAll(formState);
		formState = { ...formState, errors };

		if (errors.length > 0) {
			// Go to first page with errors
			const totalPages = getTotalPages(formState);
			for (let page = 1; page <= totalPages; page++) {
				const pageErrors = errors.filter(e => {
					const field = formState!.fields.find(f => f.id === e.fieldId);
					return field && (field.page || 1) === page;
				});
				if (pageErrors.length > 0) {
					formState = { ...formState, currentPage: page };
					break;
				}
			}
			return;
		}

		isSubmitting = true;

		try {
			await onSubmit(formState.values, formState.connectionId);
			close();
		} catch (err) {
			console.error('Form submission failed:', err);
		} finally {
			isSubmitting = false;
		}
	}

	function handleFieldChange(fieldId: string, value: unknown) {
		if (!formState) return;

		// Update value and clear error for this field
		const newValues = { ...formState.values, [fieldId]: value };
		const newErrors = formState.errors.filter(e => e.fieldId !== fieldId);
		formState = { ...formState, values: newValues, errors: newErrors };
	}

	// ==========================================================================
	// Derived Values
	// ==========================================================================

	// NOTE: We avoid using translate-x-0/translate-y-0 when open because transforms
	// create a new containing block, breaking fixed-position dropdowns inside.
	const containerClasses = $derived(
		[
			'fixed z-[1000] bg-background shadow-xl flex flex-col',
			// Only apply transition when animating (not when fully open/closed)
			((!isMobile && !isOpen) || (isMobile && (!isOpen || !isExpanded))) &&
				'transition-transform duration-300 ease-out',
			!isMobile && 'top-14 right-0 h-[calc(100vh-56px)] w-[450px] border-l border-border',
			isMobile && 'bottom-0 left-0 right-0 w-full rounded-t-xl border-t border-border',
			// Desktop: only apply transform when closed (sliding out)
			!isMobile && !isOpen && 'translate-x-full',
			// Mobile: apply transforms for partial states
			isMobile && !isOpen && 'translate-y-full',
			isMobile && isOpen && !isExpanded && 'translate-y-[calc(100%-30vh)]',
			isDragging && 'transition-none'
		]
			.filter(Boolean)
			.join(' ')
	);

	const dragTransform = $derived(
		isDragging && dragState.offset !== 0 ? `translateY(${dragState.offset}px)` : ''
	);

	// Field context for smart dropdowns
	const fieldContext = $derived.by(() => ({
		values: formState?.values ?? {},
		fields: formState?.fields ?? []
	}));

	// Get column width class - no viewport breakpoints since container is constrained
	function getColumnClass(field: FormField): string {
		switch (field.column_position) {
			case 'left':
				return 'w-[calc(50%-0.5rem)]';
			case 'right':
				return 'w-[calc(50%-0.5rem)] ml-auto';
			case 'full':
			default:
				return 'w-full';
		}
	}

	// Computed values from state
	const totalPages = $derived(formState ? getTotalPages(formState) : 1);
	const pageRows = $derived(formState ? getCurrentPageRows(formState) : []);
	const pageTitle = $derived(formState ? getCurrentPageTitle(formState) : '');
	const canNext = $derived(formState ? canGoNext(formState) : false);
	const canPrev = $derived(formState ? canGoPrevious(formState) : false);
	const hasFields = $derived(formState ? formState.fields.length > 0 : false);
</script>

<svelte:window
	onkeydown={handleKeydown}
	ontouchmove={isMobile && isDragging ? handleDragMove : undefined}
	ontouchend={isMobile && isDragging ? handleDragEnd : undefined}
	onmousemove={isMobile && isDragging ? handleDragMove : undefined}
	onmouseup={isMobile && isDragging ? handleDragEnd : undefined}
/>

<!-- NO BACKDROP - allows map interaction while form is open -->

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

		<!-- Title -->
		<div class="flex-1 min-w-0 mt-2">
			<h3 class="text-lg font-semibold truncate">
				{formState?.form?.name || 'New Entry'}
			</h3>
			{#if formState?.form?.description}
				<p class="text-xs opacity-70 mt-0.5 truncate">{formState.form.description}</p>
			{/if}
		</div>

		<!-- Close Button -->
		<div class="flex items-center gap-1 -mt-2 ml-2">
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

	<!-- Content Area -->
	{#if formState?.isLoading}
		<!-- Loading State -->
		<div class="flex-1 flex items-center justify-center">
			<div class="text-center">
				<div
					class="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"
				></div>
				<p class="text-sm text-muted-foreground">Loading form...</p>
			</div>
		</div>
	{:else if formState?.loadError}
		<!-- Error State -->
		<div class="flex-1 flex items-center justify-center p-4">
			<div class="text-center">
				<div
					class="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-3"
				>
					<X class="w-6 h-6 text-destructive" />
				</div>
				<p class="text-sm text-destructive font-medium mb-1">Error</p>
				<p class="text-xs text-muted-foreground">{formState.loadError}</p>
			</div>
		</div>
	{:else if formState && hasFields}
		<!-- Form Content -->
		<ScrollArea class="flex-1 min-h-0">
			<div class="p-4 space-y-4">
				<!-- Page Title -->
				{#if totalPages > 1}
					<div class="text-center text-sm text-muted-foreground mb-2">
						{pageTitle}
					</div>
				{/if}

				<!-- Form Fields (grouped by row for two-column layout) -->
				{#each pageRows as row (row.rowIndex)}
					<div class="flex flex-wrap gap-2">
						{#each row.fields as field (field.id)}
							<div class={getColumnClass(field)}>
								<FieldRenderer
									{field}
									value={formState.values[field.id]}
									context={fieldContext}
									error={getFieldError(formState, field.id)}
									disabled={isSubmitting}
									onValueChange={(value) => handleFieldChange(field.id, value)}
								/>
							</div>
						{/each}
					</div>
				{/each}
			</div>
		</ScrollArea>

		<!-- Footer with Navigation & Submit -->
		<div class="flex-shrink-0 border-t border-border bg-muted/30 p-4">
			<!-- Page Indicator -->
			{#if totalPages > 1}
				<div class="flex justify-center gap-1.5 mb-3">
					{#each Array(totalPages) as _, i}
						<button
							class="w-2 h-2 rounded-full transition-colors {formState.currentPage === i + 1 ? 'bg-primary' : 'bg-muted-foreground/30'}"
							onclick={() => {
								if (formState) formState = { ...formState, currentPage: i + 1 };
							}}
							aria-label="Go to page {i + 1}"
						></button>
					{/each}
				</div>
			{/if}

			<!-- Navigation Buttons -->
			<div class="flex gap-2">
				{#if canPrev}
					<Button
						variant="outline"
						onclick={handlePreviousPage}
						disabled={isSubmitting}
						class="flex-1"
					>
						<ChevronLeft class="w-4 h-4 mr-1" />
						Back
					</Button>
				{/if}

				{#if canNext}
					<Button
						onclick={handleNextPage}
						disabled={isSubmitting}
						class="flex-1"
					>
						Next
						<ChevronRight class="w-4 h-4 ml-1" />
					</Button>
				{:else}
					<Button
						onclick={handleSubmit}
						disabled={isSubmitting}
						class="flex-1"
					>
						{#if isSubmitting}
							<Loader2 class="w-4 h-4 mr-2 animate-spin" />
							Submitting...
						{:else}
							<Send class="w-4 h-4 mr-2" />
							Submit
						{/if}
					</Button>
				{/if}
			</div>
		</div>
	{:else}
		<!-- No Fields - Direct Submit -->
		<div class="flex-1 flex flex-col items-center justify-center p-4">
			<p class="text-sm text-muted-foreground mb-4">No additional information required.</p>
			<Button onclick={handleSubmit} disabled={isSubmitting}>
				{#if isSubmitting}
					<Loader2 class="w-4 h-4 mr-2 animate-spin" />
					Creating...
				{:else}
					<Send class="w-4 h-4 mr-2" />
					Create Entry
				{/if}
			</Button>
		</div>
	{/if}
</div>
