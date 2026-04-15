<script lang="ts" generics="T extends Record<string, any>">
	import { onMount, tick } from 'svelte';
	import { X, ChevronDown, Search, Plus } from 'lucide-svelte';
	import * as m from '$lib/paraglide/messages';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';

	// Portal action to render element in document.body
	function portal(node: HTMLElement, enabled: boolean = true) {
		if (!enabled) return { destroy() {}, update() {} };
		const target = document.body;
		target.appendChild(node);
		return {
			destroy() {
				node.remove();
			},
			update() {}
		};
	}

	type Props = {
		/**
		 * Array of selected option IDs
		 */
		selectedIds?: string[];
		/**
		 * Array of available options to select from
		 */
		options?: T[];
		/**
		 * Function to get the ID from an option
		 */
		getOptionId: (option: T) => string;
		/**
		 * Function to get the display label from an option
		 */
		getOptionLabel: (option: T) => string;
		/**
		 * Optional function to get a description from an option
		 */
		getOptionDescription?: (option: T) => string | undefined;
		/**
		 * Placeholder text for the trigger
		 */
		placeholder?: string;
		/**
		 * Enable single selection mode
		 */
		singleSelect?: boolean;
		/**
		 * Disable the selector
		 */
		disabled?: boolean;
		/**
		 * Additional CSS classes for the trigger
		 */
		class?: string;
		/**
		 * Allow creating new options
		 */
		allowCreate?: boolean;
		/**
		 * Callback to create a new option. Should return the created option.
		 */
		onCreateOption?: (label: string) => Promise<T> | T;
		/**
		 * Label for the create option
		 */
		createLabel?: (query: string) => string;
		/**
		 * Hide selected options from the list (default: false)
		 * When false, selected options remain visible with filled radio dots
		 */
		hideSelected?: boolean;
		/**
		 * When true, automatically add created option to local options array.
		 * When false (default), parent is responsible for updating options after create.
		 * Set to false to avoid duplicates when parent refetches from database.
		 */
		autoAddCreated?: boolean;
		/**
		 * Message shown when no options match the search query
		 */
		emptyLabel?: string;
		/**
		 * Hint text shown on mobile when create is allowed
		 */
		createHintLabel?: string;
		/**
		 * When true (default), multiple selections show as "N selected".
		 * When false, shows all selected items as badges in the trigger.
		 */
		summarizeMultiple?: boolean;
		/**
		 * Callback when selectedIds changes (alternative to bind:selectedIds).
		 * Use this when you need to handle changes without two-way binding.
		 */
		onSelectedIdsChange?: (ids: string[]) => void;
		/**
		 * Disable portaling to document.body (useful inside dialogs that are already portaled)
		 */
		disablePortal?: boolean;
	};

	let {
		selectedIds = $bindable([]),
		options = $bindable([]),
		getOptionId,
		getOptionLabel,
		getOptionDescription,
		placeholder = (m.mobileMultiSelectPlaceholder?.() ?? 'Select options...'),
		singleSelect = false,
		disabled = false,
		class: className = '',
		allowCreate = false,
		onCreateOption,
		createLabel = (query: string) => (m.mobileMultiSelectCreateLabel?.({ query }) ?? `Create "${query}"`),
		hideSelected = false,
		autoAddCreated = false,
		emptyLabel = (m.mobileMultiSelectEmptyLabel?.() ?? 'No options found'),
		createHintLabel = (m.mobileMultiSelectCreateHint?.() ?? 'Press Enter to create'),
		summarizeMultiple = false,
		onSelectedIdsChange,
		disablePortal = false
	}: Props = $props();

	let isOpen = $state(false);
	let isMobile = $state(false);
	let searchQuery = $state('');
	let searchInput: HTMLInputElement | null = $state(null);
	let triggerElement: HTMLButtonElement | null = $state(null);
	let dropdownElement: HTMLDivElement | null = $state(null);
	let viewportHeight = $state(0); // For keyboard detection
	let dropdownPosition = $state({ top: 0, left: 0, width: 0 }); // For fixed positioning
	let highlightedIndex = $state(-1); // For keyboard navigation on desktop
	let openUpward = $state(false); // Whether dropdown opens upward (when near bottom of viewport)

	// Derived state
	const selectedOptions = $derived(
		(selectedIds || [])
			.map((id) => options?.find((opt) => getOptionId(opt) === id))
			.filter((opt): opt is T => opt !== undefined)
	);

	const filteredOptions = $derived(
		(options || []).filter((option) => {
			// Optionally hide already selected options from the list
			if (hideSelected && (selectedIds || []).includes(getOptionId(option))) return false;

			const label = getOptionLabel(option).toLowerCase();
			const description = getOptionDescription?.(option)?.toLowerCase() || '';
			const query = searchQuery.toLowerCase();
			return label.includes(query) || description.includes(query);
		})
	);

	// Check if we can create a new option
	const exactMatch = $derived(
		options.find((opt) => getOptionLabel(opt).toLowerCase() === searchQuery.trim().toLowerCase())
	);

	const canCreate = $derived(
		allowCreate && searchQuery.trim() !== '' && !exactMatch && onCreateOption
	);

	// Check if an option is selected
	function isSelected(option: T): boolean {
		return (selectedIds || []).includes(getOptionId(option));
	}

	// Toggle option selection
	function toggleOption(option: T) {
		const optionId = getOptionId(option);

		if (singleSelect) {
			selectedIds = [optionId];
			close();
		} else {
			if (isSelected(option)) {
				selectedIds = selectedIds.filter((id) => id !== optionId);
			} else {
				selectedIds = [...selectedIds, optionId];

				// Clear search if this was the last visible option matching the query
				if (searchQuery) {
					const remainingVisible = filteredOptions.filter(
						(opt) => getOptionId(opt) !== optionId
					);
					if (remainingVisible.length === 0) {
						searchQuery = '';
					}
				}
			}
		}
	}

	// Prevent buttons from stealing focus (keeps keyboard open)
	function preventFocusLoss(e: MouseEvent | TouchEvent) {
		e.preventDefault();
	}

	// Remove a selected option
	function removeOption(optionId: string, e?: Event) {
		e?.stopPropagation();
		selectedIds = selectedIds.filter((id) => id !== optionId);
	}

	// Create a new option
	async function createOption() {
		if (!canCreate || !onCreateOption) return;

		try {
			const newOption = await onCreateOption(searchQuery.trim());
			if (autoAddCreated) {
				options = [...options, newOption];
			}
			const newId = getOptionId(newOption);

			if (singleSelect) {
				selectedIds = [newId];
				close();
			} else {
				selectedIds = [...selectedIds, newId];
			}
			searchQuery = '';
		} catch (error) {
			console.error('Failed to create option:', error);
		}
	}

	// Handle keydown in search input
	function handleSearchKeydown(e: KeyboardEvent) {
		// Calculate total items: create button (if visible) + filtered options
		const hasCreateOption = canCreate ? 1 : 0;
		const totalItems = hasCreateOption + filteredOptions.length;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (totalItems > 0) {
				highlightedIndex = (highlightedIndex + 1) % totalItems;
			}
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (totalItems > 0) {
				highlightedIndex = highlightedIndex <= 0 ? totalItems - 1 : highlightedIndex - 1;
			}
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (highlightedIndex >= 0) {
				// If create option is visible and highlighted (index 0)
				if (canCreate && highlightedIndex === 0) {
					createOption();
				} else {
					// Select the highlighted option (adjust index if create is visible)
					const optionIndex = canCreate ? highlightedIndex - 1 : highlightedIndex;
					if (optionIndex >= 0 && optionIndex < filteredOptions.length) {
						toggleOption(filteredOptions[optionIndex]);
					}
				}
			} else if (canCreate) {
				// No highlight but can create - create the option
				createOption();
			}
		} else if (e.key === 'Backspace' && searchQuery === '' && selectedOptions.length > 0 && !singleSelect) {
			e.preventDefault();
			// Remove the last selected option
			const lastOption = selectedOptions[selectedOptions.length - 1];
			removeOption(getOptionId(lastOption));
		} else if (e.key === 'Escape') {
			close();
		}
	}

	// Open the selector
	function open() {
		if (disabled) return;
		isOpen = true;
		searchQuery = '';
		highlightedIndex = -1; // Reset keyboard navigation
		// Start listening to viewport changes for keyboard detection
		if (isMobile && window.visualViewport) {
			viewportHeight = window.visualViewport.height;
			window.visualViewport.addEventListener('resize', handleViewportResize);
			// Lock body scroll on mobile to prevent scroll bleed-through
			document.body.style.overflow = 'hidden';
		}
		// Calculate dropdown position for desktop (portaled to body, so getBoundingClientRect gives correct viewport coords)
		if (!isMobile && triggerElement) {
			const rect = triggerElement.getBoundingClientRect();
			const dropdownHeight = 280; // Approximate max height (max-h-60 = 240px + padding)
			const spaceBelow = window.innerHeight - rect.bottom;
			const spaceAbove = rect.top;

			// Open upward if not enough space below but enough above
			openUpward = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

			dropdownPosition = {
				top: openUpward ? rect.top - 4 : rect.bottom + 4,
				left: rect.left,
				width: rect.width
			};
		}
	}

	// Close the selector
	function close() {
		isOpen = false;
		searchQuery = '';
		// Stop listening to viewport changes
		if (window.visualViewport) {
			window.visualViewport.removeEventListener('resize', handleViewportResize);
		}
		// Restore body scroll
		document.body.style.overflow = '';
	}

	// Handle viewport resize (keyboard open/close)
	function handleViewportResize() {
		if (window.visualViewport) {
			viewportHeight = window.visualViewport.height;
		}
	}

	// Handle click outside for desktop dropdown
	function handleClickOutside(e: MouseEvent) {
		if (!isMobile && isOpen) {
			const target = e.target as Node;
			if (
				triggerElement &&
				!triggerElement.contains(target) &&
				dropdownElement &&
				!dropdownElement.contains(target)
			) {
				close();
			}
		}
	}

	// Handle escape key
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && isOpen) {
			close();
		}
	}

	// Check mobile on mount and resize
	onMount(() => {
		function checkMobile() {
			isMobile = window.innerWidth < 768;
		}

		function updateViewportHeight() {
			if (window.visualViewport) {
				viewportHeight = window.visualViewport.height;
			} else {
				viewportHeight = window.innerHeight;
			}
		}

		checkMobile();
		updateViewportHeight();
		window.addEventListener('resize', checkMobile);
		document.addEventListener('click', handleClickOutside);
		document.addEventListener('keydown', handleKeydown);

		return () => {
			window.removeEventListener('resize', checkMobile);
			document.removeEventListener('click', handleClickOutside);
			document.removeEventListener('keydown', handleKeydown);
			if (window.visualViewport) {
				window.visualViewport.removeEventListener('resize', handleViewportResize);
			}
		};
	});


	// Auto-focus search on desktop
	$effect(() => {
		if (isOpen && !isMobile && searchInput) {
			tick().then(() => searchInput?.focus());
		}
	});

	// Reset highlighted index when search query changes
	$effect(() => {
		searchQuery; // dependency
		highlightedIndex = -1;
	});

	// Scroll highlighted option into view
	$effect(() => {
		if (highlightedIndex >= 0 && dropdownElement && !isMobile) {
			const options = dropdownElement.querySelectorAll('[role="option"]');
			const highlighted = options[highlightedIndex];
			if (highlighted) {
				highlighted.scrollIntoView({ block: 'nearest' });
			}
		}
	});

	// Call onSelectedIdsChange callback when selectedIds changes
	$effect(() => {
		onSelectedIdsChange?.(selectedIds);
	});

</script>

{#snippet searchBox(size: 'sm' | 'lg')}
	{@const isLg = size === 'lg'}
	<div class={cn(
		'flex flex-wrap items-center gap-1.5 bg-muted rounded-lg',
		isLg ? 'px-3 py-2 min-h-[44px]' : 'px-2 py-1.5 min-h-[36px] rounded-md'
	)}>
		{#each selectedOptions as option (getOptionId(option))}
			<Badge variant="secondary" class={cn('gap-1 pr-1 shrink-0', !isLg && 'text-xs')}>
				{getOptionLabel(option)}
				{#if !singleSelect}
					<button
						type="button"
						onclick={(e) => removeOption(getOptionId(option), e)}
						class={cn(
							'rounded-full hover:bg-muted-foreground/20 focus:outline-none',
							isLg ? 'ml-1 focus:ring-1 focus:ring-ring' : 'ml-0.5'
						)}
						aria-label={m.mobileMultiSelectRemoveOption?.({ option: getOptionLabel(option) }) ?? `Remove ${getOptionLabel(option)}`}
					>
						<X class="h-3 w-3" />
					</button>
				{/if}
			</Badge>
		{/each}
		<input
			bind:this={searchInput}
			type="text"
			bind:value={searchQuery}
			onkeydown={handleSearchKeydown}
			placeholder={selectedOptions.length === 0 ? (m.mobileMultiSelectSearch?.() ?? 'Search...') : ''}
			class={cn(
				'flex-1 bg-transparent outline-none placeholder:text-muted-foreground',
				isLg ? 'text-base min-w-[80px]' : 'text-sm min-w-[60px]'
			)}
		/>
	</div>
{/snippet}

{#snippet createOptionBtn(size: 'sm' | 'lg', highlighted: boolean = false)}
	{@const isLg = size === 'lg'}
	<button
		type="button"
		class={cn(
			'w-full flex items-center text-left transition-colors bg-primary/5',
			isLg
				? 'gap-4 px-4 min-h-[56px] border-b border-border/50 hover:bg-muted/50 active:bg-muted'
				: 'gap-2 px-3 py-2 hover:bg-accent focus:bg-accent focus:outline-none',
			highlighted && !isLg && 'bg-accent'
		)}
		onclick={createOption}
		onmousedown={isLg ? preventFocusLoss : undefined}
		ontouchstart={isLg ? preventFocusLoss : undefined}
		role={isLg ? undefined : 'option'}
	>
		<div class={cn(
			'rounded-full border-2 border-primary bg-primary flex items-center justify-center shrink-0',
			isLg ? 'w-6 h-6' : 'w-4 h-4'
		)}>
			<Plus class={cn('text-primary-foreground', isLg ? 'w-4 h-4' : 'w-3 h-3')} />
		</div>
		<div class={cn('flex-1 min-w-0', isLg && 'py-2')}>
			<div class={cn('font-medium text-primary truncate', isLg ? 'text-base' : 'text-sm')}>
				{createLabel(searchQuery.trim())}
			</div>
			{#if isLg}
				<div class="text-sm text-muted-foreground">{createHintLabel}</div>
			{/if}
		</div>
	</button>
{/snippet}

{#snippet optionItem(option: T, size: 'sm' | 'lg', highlighted: boolean = false)}
	{@const isLg = size === 'lg'}
	{@const selected = isSelected(option)}
	<button
		type="button"
		class={cn(
			'w-full flex items-center text-left transition-colors',
			isLg
				? 'gap-4 px-4 min-h-[56px] border-b border-border/50 hover:bg-muted/50 active:bg-muted'
				: 'gap-2 px-3 py-2 hover:bg-accent focus:bg-accent focus:outline-none',
			selected && (isLg ? 'bg-primary/5' : 'bg-accent/50'),
			highlighted && !isLg && 'bg-accent'
		)}
		onclick={() => toggleOption(option)}
		onmousedown={isLg ? preventFocusLoss : undefined}
		ontouchstart={isLg ? preventFocusLoss : undefined}
		role={isLg ? undefined : 'option'}
		aria-selected={isLg ? undefined : selected}
	>
		<div class={cn(
			'rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
			isLg ? 'w-6 h-6' : 'w-4 h-4',
			selected ? 'border-primary bg-primary' : 'border-muted-foreground/50'
		)}>
			{#if selected}
				<div class={cn('rounded-full bg-primary-foreground', isLg ? 'w-2.5 h-2.5' : 'w-2 h-2')}></div>
			{/if}
		</div>
		<div class={cn('flex-1 min-w-0', isLg && 'py-2')}>
			<div class={cn('truncate', isLg ? 'text-base font-medium' : 'text-sm')}>
				{getOptionLabel(option)}
			</div>
			{#if getOptionDescription}
				{@const description = getOptionDescription(option)}
				{#if description}
					<div class={cn('text-muted-foreground truncate', isLg ? 'text-sm' : 'text-xs')}>
						{description}
					</div>
				{/if}
			{/if}
		</div>
	</button>
{/snippet}

{#snippet emptyState(size: 'sm' | 'lg')}
	{@const isLg = size === 'lg'}
	<div class={cn(
		'text-center text-muted-foreground',
		isLg ? 'px-4 py-8' : 'px-3 py-4 text-sm'
	)}>
		{emptyLabel}
	</div>
{/snippet}

<div class={cn('relative', className)}>
	<!-- Trigger Button -->
	<button
		bind:this={triggerElement}
		type="button"
		onclick={() => isOpen ? close() : open()}
		{disabled}
		class={cn(
			'flex min-h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors',
			'hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
			disabled && 'cursor-not-allowed opacity-50'
		)}
	>
		{#if selectedOptions.length === 0}
			<span class="flex-1 text-left truncate text-muted-foreground">{placeholder}</span>
		{:else if selectedOptions.length === 1}
			<span class="flex-1 text-left truncate">{getOptionLabel(selectedOptions[0])}</span>
		{:else if summarizeMultiple || isOpen}
			<span class="flex-1 text-left truncate">{m.mobileMultiSelectCountSelected?.({ count: selectedOptions.length }) ?? `${selectedOptions.length} selected`}</span>
		{:else}
			<div class="flex-1 flex flex-wrap gap-1 overflow-hidden pointer-events-none">
				{#each selectedOptions as option (getOptionId(option))}
					<Badge variant="secondary" class="text-xs shrink-0">
						{getOptionLabel(option)}
					</Badge>
				{/each}
			</div>
		{/if}
		<ChevronDown class={cn('ml-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
	</button>

	<!-- MOBILE: Full-screen Modal (portaled to body for full-screen blur) -->
	{#if isOpen && isMobile}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="fixed inset-0 z-[100]" onkeydown={handleKeydown} use:portal={!disablePortal}>
				<!-- Backdrop with blur -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div
					class="absolute inset-0 bg-black/50 backdrop-blur-md touch-none"
					onclick={close}
					role="button"
					tabindex="-1"
					aria-label={m.mobileMultiSelectClose?.() ?? 'Close'}
				></div>

				<!-- Modal Content - uses visualViewport height for keyboard awareness -->
				<div
					class="absolute left-0 right-0 bg-background rounded-xl flex flex-col shadow-xl overflow-hidden transition-all duration-150"
					style="top: {viewportHeight * 0.1}px; height: {viewportHeight * 0.8}px;"
					role="dialog"
					aria-modal="true"
					aria-label={m.mobileMultiSelectDialogLabel?.() ?? 'Select options'}
				>
					<!-- Header: Search box with inline badges -->
					<div class="p-4 border-b border-border shrink-0">
						{@render searchBox('lg')}
					</div>

					<!-- Options List (scrollable) -->
					<div class="flex-1 overflow-auto overscroll-contain">
						{#if filteredOptions.length === 0 && !canCreate}
							{@render emptyState('lg')}
						{:else}
							{#if canCreate}
								{@render createOptionBtn('lg')}
							{/if}
							{#each filteredOptions as option (getOptionId(option))}
								{@render optionItem(option, 'lg')}
							{/each}
						{/if}
					</div>

					<!-- Footer -->
					<div class="p-4 border-t border-border shrink-0">
						<Button class="w-full" onclick={close}>
							{#if selectedOptions.length > 0}
								{m.mobileMultiSelectDoneWithCount?.({ count: selectedOptions.length }) ?? `Done (${selectedOptions.length})`}
							{:else}
								{m.mobileMultiSelectDone?.() ?? 'Done'}
							{/if}
						</Button>
					</div>
				</div>
		</div>
	{/if}

	<!-- DESKTOP: Dropdown Popover -->
	{#if isOpen && !isMobile}
		<div
			bind:this={dropdownElement}
			class="fixed z-[9999] bg-popover border border-border rounded-md shadow-lg overflow-hidden"
			style="top: {dropdownPosition.top}px; left: {dropdownPosition.left}px; width: {dropdownPosition.width}px;{openUpward ? ' transform: translateY(-100%);' : ''}"
			role="listbox"
			aria-label={m.mobileMultiSelectOptionsLabel?.() ?? 'Options'}
			use:portal={!disablePortal}
		>
			<!-- Search input with inline badges -->
			<div class="p-2 border-b border-border sticky top-0 bg-popover">
				{@render searchBox('sm')}
			</div>

			<!-- Options -->
			<div class="max-h-60 overflow-auto">
				{#if filteredOptions.length === 0 && !canCreate}
					{@render emptyState('sm')}
				{:else}
					{#if canCreate}
						{@render createOptionBtn('sm', highlightedIndex === 0)}
					{/if}
					{#each filteredOptions as option, i (getOptionId(option))}
						{@render optionItem(option, 'sm', highlightedIndex === (canCreate ? i + 1 : i))}
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>
