<script lang="ts" generics="T extends Record<string, any>">
	import { onMount, tick } from 'svelte';
	import { X, ChevronDown, Search, Plus } from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';

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
	};

	let {
		selectedIds = $bindable([]),
		options = $bindable([]),
		getOptionId,
		getOptionLabel,
		getOptionDescription,
		placeholder = 'Select options...',
		singleSelect = false,
		disabled = false,
		class: className = '',
		allowCreate = false,
		onCreateOption,
		createLabel = (query: string) => `Create "${query}"`,
		hideSelected = false
	}: Props = $props();

	let isOpen = $state(false);
	let isMobile = $state(false);
	let searchQuery = $state('');
	let searchInput: HTMLInputElement | null = $state(null);
	let triggerElement: HTMLButtonElement | null = $state(null);
	let dropdownElement: HTMLDivElement | null = $state(null);
	let viewportHeight = $state(0); // For keyboard detection

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
			options = [...options, newOption];
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
		if (e.key === 'Backspace' && searchQuery === '' && selectedOptions.length > 0 && !singleSelect) {
			e.preventDefault();
			// Remove the last selected option
			const lastOption = selectedOptions[selectedOptions.length - 1];
			removeOption(getOptionId(lastOption));
		} else if (e.key === 'Enter' && canCreate) {
			e.preventDefault();
			createOption();
		} else if (e.key === 'Escape') {
			close();
		}
	}

	// Open the selector
	function open() {
		if (disabled) return;
		isOpen = true;
		searchQuery = '';
		// Start listening to viewport changes for keyboard detection
		if (isMobile && window.visualViewport) {
			viewportHeight = window.visualViewport.height;
			window.visualViewport.addEventListener('resize', handleViewportResize);
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
						aria-label="Remove {getOptionLabel(option)}"
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
			placeholder={selectedOptions.length === 0 ? 'Search...' : ''}
			class={cn(
				'flex-1 bg-transparent outline-none placeholder:text-muted-foreground',
				isLg ? 'text-base min-w-[80px]' : 'text-sm min-w-[60px]'
			)}
		/>
	</div>
{/snippet}

{#snippet createOptionBtn(size: 'sm' | 'lg')}
	{@const isLg = size === 'lg'}
	<button
		type="button"
		class={cn(
			'w-full flex items-center text-left transition-colors bg-primary/5',
			isLg
				? 'gap-4 px-4 min-h-[56px] border-b border-border/50 hover:bg-muted/50 active:bg-muted'
				: 'gap-2 px-3 py-2 hover:bg-accent focus:bg-accent focus:outline-none'
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
				<div class="text-sm text-muted-foreground">Press Enter to create</div>
			{/if}
		</div>
	</button>
{/snippet}

{#snippet optionItem(option: T, size: 'sm' | 'lg')}
	{@const isLg = size === 'lg'}
	{@const selected = isSelected(option)}
	<button
		type="button"
		class={cn(
			'w-full flex items-center text-left transition-colors',
			isLg
				? 'gap-4 px-4 min-h-[56px] border-b border-border/50 hover:bg-muted/50 active:bg-muted'
				: 'gap-2 px-3 py-2 hover:bg-accent focus:bg-accent focus:outline-none',
			selected && (isLg ? 'bg-primary/5' : 'bg-accent/50')
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
		No options found
	</div>
{/snippet}

<div class={cn('relative', className)}>
	<!-- Trigger Button -->
	<button
		bind:this={triggerElement}
		type="button"
		onclick={open}
		{disabled}
		class={cn(
			'flex min-h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors',
			'hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
			disabled && 'cursor-not-allowed opacity-50'
		)}
	>
		<span class="flex-1 text-left truncate">
			{#if selectedOptions.length === 0}
				<span class="text-muted-foreground">{placeholder}</span>
			{:else if selectedOptions.length === 1}
				{getOptionLabel(selectedOptions[0])}
			{:else}
				{selectedOptions.length} selected
			{/if}
		</span>
		<ChevronDown class={cn('ml-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
	</button>

	<!-- MOBILE: Full-screen Modal -->
	{#if isOpen && isMobile}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="fixed inset-0 z-50" onkeydown={handleKeydown}>
			<!-- Backdrop -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div
				class="absolute inset-0 bg-black/50"
				onclick={close}
				role="button"
				tabindex="-1"
				aria-label="Close"
			></div>

			<!-- Modal Content - uses visualViewport height for keyboard awareness -->
			<div
				class="absolute left-0 right-0 bg-background rounded-xl flex flex-col shadow-xl overflow-hidden transition-all duration-150"
				style="top: {viewportHeight * 0.1}px; height: {viewportHeight * 0.8}px;"
				role="dialog"
				aria-modal="true"
				aria-label="Select options"
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
						Done {#if selectedOptions.length > 0}({selectedOptions.length}){/if}
					</Button>
				</div>
			</div>
		</div>
	{/if}

	<!-- DESKTOP: Dropdown Popover -->
	{#if isOpen && !isMobile}
		<div
			bind:this={dropdownElement}
			class="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-lg overflow-hidden"
			role="listbox"
			aria-label="Options"
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
						{@render createOptionBtn('sm')}
					{/if}
					{#each filteredOptions as option (getOptionId(option))}
						{@render optionItem(option, 'sm')}
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>
