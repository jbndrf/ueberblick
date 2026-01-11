<script lang="ts" generics="T extends Record<string, any>">
	import { X, ChevronDown } from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { cn } from '$lib/utils';
	import { tick } from 'svelte';

	type Props = {
		/**
		 * Array of selected entity IDs
		 */
		selectedEntityIds?: string[];
		/**
		 * Array of available entities to select from
		 */
		availableEntities?: T[];
		/**
		 * Function to get the ID from an entity
		 */
		getEntityId: (entity: T) => string;
		/**
		 * Function to get the display name from an entity
		 */
		getEntityName: (entity: T) => string;
		/**
		 * Optional function to get a description from an entity
		 */
		getEntityDescription?: (entity: T) => string | undefined;
		/**
		 * Allow creating new entities
		 */
		allowCreate?: boolean;
		/**
		 * Placeholder text for the input
		 */
		placeholder?: string;
		/**
		 * Additional CSS classes
		 */
		class?: string;
		/**
		 * Disable the selector
		 */
		disabled?: boolean;
		/**
		 * Callback function to create a new entity (client-side)
		 * Should return the newly created entity
		 */
		onCreateEntity?: ((name: string) => Promise<T>) | null;
		/**
		 * Server-side form action for creating entities (e.g., '?/createRole')
		 * When provided, this is used instead of onCreateEntity
		 */
		createAction?: string;
		/**
		 * Custom label for the "Create new" option
		 * @default "Create \"{query}\""
		 */
		createLabel?: (query: string) => string;
		/**
		 * Show selected entities as inline badges
		 * @default true
		 */
		showSelection?: boolean;
		/**
		 * Enable single selection mode (only one entity can be selected at a time)
		 * @default false
		 */
		singleSelect?: boolean;
	};

	let {
		selectedEntityIds = $bindable([]),
		availableEntities = $bindable([]),
		getEntityId,
		getEntityName,
		getEntityDescription,
		allowCreate = false,
		placeholder = 'Type to search or add...',
		class: className = '',
		disabled = false,
		onCreateEntity = null,
		createAction,
		createLabel = (query: string) => `Create "${query}"`,
		showSelection = true,
		singleSelect = false
	}: Props = $props();

	let inputValue = $state('');
	let inputElement: HTMLInputElement | null = $state(null);
	let showSuggestions = $state(false);
	let highlightedIndex = $state(-1);
	let cursorPosition = $state(0);
	let containerElement: HTMLDivElement | null = $state(null);

	const selectedEntities = $derived(
		(selectedEntityIds || [])
			.map((id) => availableEntities?.find((e) => getEntityId(e) === id))
			.filter((e): e is T => e !== undefined)
	);

	// Check if user typed # to show all entities
	const showAllEntities = $derived(inputValue.trim() === '#' || inputValue.startsWith('#'));

	const searchQuery = $derived(
		showAllEntities ? inputValue.substring(1).trim() : inputValue.trim()
	);

	const filteredEntities = $derived(
		(availableEntities || []).filter(
			(entity) =>
				!(selectedEntityIds || []).includes(getEntityId(entity)) &&
				(showAllEntities
					? searchQuery === '' ||
						getEntityName(entity).toLowerCase().includes(searchQuery.toLowerCase())
					: getEntityName(entity).toLowerCase().includes(inputValue.toLowerCase()))
		)
	);

	const exactMatch = $derived(
		filteredEntities.find(
			(entity) => getEntityName(entity).toLowerCase() === searchQuery.toLowerCase()
		)
	);

	const canCreateNew = $derived(
		allowCreate &&
			searchQuery !== '' &&
			!exactMatch &&
			!showAllEntities &&
			(onCreateEntity !== null || createAction !== undefined)
	);

	const suggestions = $derived([
		...filteredEntities,
		...(canCreateNew
			? [{ __isNew: true, __name: createLabel(searchQuery), __query: searchQuery } as const]
			: [])
	]);

	function removeEntity(entityId: string) {
		if (disabled) return;
		selectedEntityIds = selectedEntityIds.filter((id) => id !== entityId);
		tick().then(() => {
			if (inputElement) {
				inputElement.focus();
			}
		});
	}

	async function selectEntity(item: T | { __isNew: true; __name: string; __query: string }) {
		if ('__isNew' in item && item.__isNew) {
			await createAndSelectEntity(item.__query);
		} else {
			const entityId = getEntityId(item as T);
			if (singleSelect) {
				// In single select mode, replace the current selection
				selectedEntityIds = [entityId];
			} else {
				// In multi select mode, add to selection if not already selected
				if (!selectedEntityIds.includes(entityId)) {
					selectedEntityIds = [...selectedEntityIds, entityId];
				}
			}
			inputValue = '';
			showSuggestions = false;
			highlightedIndex = -1;
			await tick();
			if (inputElement) {
				inputElement.focus();
			}
		}
	}

	async function createAndSelectEntity(name: string) {
		if (!canCreateNew) return;

		try {
			// Use server-side action if provided
			if (createAction) {
				const formData = new FormData();
				formData.append('name', name);

				console.log('[EntitySelector] Creating entity via action:', createAction);
				const response = await fetch(createAction, {
					method: 'POST',
					body: formData
				});

				console.log('[EntitySelector] Response status:', response.status);
				const result = await response.json();
				console.log('[EntitySelector] Response result:', result);

				// Parse devalue-serialized data if it's a string
				let data = result.data;
				if (typeof data === 'string') {
					console.log('[EntitySelector] Data is string, parsing...');
					try {
						const { parse } = await import('devalue');
						data = parse(data);
						console.log('[EntitySelector] Parsed data:', data);
					} catch (e) {
						console.error('[EntitySelector] Failed to parse data:', e);
					}
				}

				if (result.type === 'success' && data?.entity) {
					console.log('[EntitySelector] Entity created successfully:', data.entity);
					const newEntity = data.entity as T;
					availableEntities = [...availableEntities, newEntity];
					const newEntityId = getEntityId(newEntity);
					if (singleSelect) {
						selectedEntityIds = [newEntityId];
					} else {
						selectedEntityIds = [...selectedEntityIds, newEntityId];
					}
					inputValue = '';
					showSuggestions = false;
					highlightedIndex = -1;
					await tick();
					if (inputElement) {
						inputElement.focus();
					}
				} else {
					console.error('[EntitySelector] Failed to create entity:', { result, data });
					throw new Error(data?.message || 'Failed to create entity');
				}
			}
			// Use client-side callback
			else if (onCreateEntity) {
				const newEntity = await onCreateEntity(name);
				availableEntities = [...availableEntities, newEntity];
				const newEntityId = getEntityId(newEntity);
				if (singleSelect) {
					selectedEntityIds = [newEntityId];
				} else {
					selectedEntityIds = [...selectedEntityIds, newEntityId];
				}
				inputValue = '';
				showSuggestions = false;
				highlightedIndex = -1;
				await tick();
				if (inputElement) {
					inputElement.focus();
				}
			}
		} catch (error) {
			console.error('Failed to create entity:', error);
		}
	}

	function handleInput(e: Event) {
		inputValue = (e.target as HTMLInputElement).value;
		showSuggestions = inputValue.length > 0;
		highlightedIndex = -1;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (disabled) return;

		const target = e.target as HTMLInputElement;
		cursorPosition = target.selectionStart || 0;

		if (e.key === 'Enter') {
			e.preventDefault();
			if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
				selectEntity(suggestions[highlightedIndex]);
			} else if (canCreateNew) {
				createAndSelectEntity(searchQuery);
			} else if (filteredEntities.length > 0) {
				selectEntity(filteredEntities[0]);
			}
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (!showSuggestions && inputValue.length > 0) {
				showSuggestions = true;
			}
			highlightedIndex = Math.min(highlightedIndex + 1, suggestions.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlightedIndex = Math.max(highlightedIndex - 1, 0);
		} else if (e.key === 'Escape') {
			showSuggestions = false;
			highlightedIndex = -1;
		} else if (e.key === 'Backspace' && inputValue === '' && selectedEntities.length > 0 && !singleSelect) {
			e.preventDefault();
			// Remove last selected entity when backspace on empty input (multi-select only)
			removeEntity(getEntityId(selectedEntities[selectedEntities.length - 1]));
		} else if (e.key === 'ArrowLeft' && cursorPosition === 0 && selectedEntities.length > 0 && showSelection) {
			// Focus the last badge when left arrow at position 0
			e.preventDefault();
			const badges = containerElement?.querySelectorAll('[data-badge-button]');
			if (badges && badges.length > 0) {
				(badges[badges.length - 1] as HTMLElement).focus();
			}
		}
	}

	function handleBadgeKeydown(e: KeyboardEvent, entityId: string, index: number) {
		if (disabled) return;

		const badges = containerElement?.querySelectorAll('[data-badge-button]');

		if (e.key === 'ArrowLeft' && index > 0) {
			// Move to previous badge
			e.preventDefault();
			(badges?.[index - 1] as HTMLElement)?.focus();
		} else if (e.key === 'ArrowRight') {
			// Move to next badge or input
			e.preventDefault();
			if (index < selectedEntities.length - 1) {
				(badges?.[index + 1] as HTMLElement)?.focus();
			} else {
				inputElement?.focus();
			}
		} else if (e.key === 'Backspace' || e.key === 'Delete') {
			e.preventDefault();
			removeEntity(entityId);
			// Focus previous badge or input
			if (index > 0) {
				tick().then(() => {
					const newBadges = containerElement?.querySelectorAll('[data-badge-button]');
					(newBadges?.[index - 1] as HTMLElement)?.focus();
				});
			} else {
				tick().then(() => {
					inputElement?.focus();
				});
			}
		} else if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			removeEntity(entityId);
		}
	}

	function handleFocus() {
		if (inputValue.length > 0) {
			showSuggestions = true;
		}
	}

	function handleBlur(e: FocusEvent) {
		// Delay to allow click on suggestion or dropdown button
		setTimeout(() => {
			const target = e.relatedTarget as HTMLElement;
			if (!target || (!target.closest('.suggestions-list') && !target.closest('[aria-label="Toggle dropdown"]'))) {
				showSuggestions = false;
				highlightedIndex = -1;
			}
		}, 200);
	}

	function handleContainerClick() {
		if (inputElement && !disabled) {
			inputElement.focus();
		}
	}

	function toggleDropdown(e: Event) {
		e.stopPropagation();
		if (disabled) return;

		if (showSuggestions) {
			showSuggestions = false;
			highlightedIndex = -1;
		} else {
			// Show all available entities
			inputValue = '';
			showSuggestions = true;
			highlightedIndex = -1;
			if (inputElement) {
				inputElement.focus();
			}
		}
	}
</script>

<div class={cn('relative', className)}>
	<!-- Input Field with Inline Badges and Dropdown Button -->
	<div class="relative flex items-center">
		<div
			bind:this={containerElement}
			onclick={handleContainerClick}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					handleContainerClick();
				}
			}}
			role="button"
			tabindex="-1"
			class={cn(
				'flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background pl-3 pr-10 py-2 text-sm ring-offset-background transition-colors',
				'focus-within:outline-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
				disabled && 'cursor-not-allowed opacity-50'
			)}
		>
			<!-- Selected Entities as Inline Badges -->
			{#if showSelection}
				{#each selectedEntities as entity, index (getEntityId(entity))}
					<Badge variant="secondary" class="gap-1 pr-1">
						{getEntityName(entity)}
						{#if !disabled && !singleSelect}
							<button
								type="button"
								data-badge-button
								onclick={(e) => {
									e.stopPropagation();
									removeEntity(getEntityId(entity));
								}}
								onkeydown={(e) => handleBadgeKeydown(e, getEntityId(entity), index)}
								class="ml-1 rounded-full hover:bg-muted focus:outline-hidden focus:ring-1 focus:ring-ring"
								tabindex="0"
								aria-label="Remove {getEntityName(entity)}"
							>
								<X class="h-3 w-3" />
							</button>
						{/if}
					</Badge>
				{/each}
			{/if}

			<!-- Input Element -->
			<input
				bind:this={inputElement}
				type="text"
				bind:value={inputValue}
				oninput={handleInput}
				onkeydown={handleKeydown}
				onfocus={handleFocus}
				onblur={handleBlur}
				placeholder={selectedEntities.length === 0 || !showSelection ? placeholder : ''}
				{disabled}
				class="min-w-[120px] flex-1 bg-transparent outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed"
			/>
		</div>

		<!-- Dropdown Arrow Button -->
		<button
			type="button"
			onclick={toggleDropdown}
			{disabled}
			class={cn(
				'absolute right-0 top-0 h-full px-3 flex items-center justify-center border-l border-input bg-background rounded-r-md hover:bg-muted transition-colors',
				disabled && 'cursor-not-allowed opacity-50'
			)}
			aria-label="Toggle dropdown"
		>
			<ChevronDown class={cn('h-4 w-4 text-muted-foreground transition-transform', showSuggestions && 'rotate-180')} />
		</button>
	</div>

	<!-- Suggestions Dropdown -->
	{#if showSuggestions}
		<div
			class="suggestions-list absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
		>
			{#if suggestions.length > 0}
				{#each suggestions as suggestion, index (('__isNew' in suggestion && suggestion.__isNew) ? '__create__' : getEntityId(suggestion as T))}
					{@const isHighlighted = index === highlightedIndex}
					{@const isNew = '__isNew' in suggestion && suggestion.__isNew}
					<button
						type="button"
						onclick={() => selectEntity(suggestion)}
						class={cn(
							'relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-hidden',
							isHighlighted && 'bg-accent text-accent-foreground',
							!isHighlighted && 'hover:bg-accent/50'
						)}
						tabindex="-1"
					>
						<div class="flex flex-1 flex-col items-start">
							<span class={isNew ? 'text-primary' : ''}>
								{isNew ? suggestion.__name : getEntityName(suggestion as T)}
							</span>
							{#if !isNew && getEntityDescription}
								{@const description = getEntityDescription(suggestion as T)}
								{#if description}
									<span class="text-xs text-muted-foreground">{description}</span>
								{/if}
							{/if}
							{#if isNew}
								<span class="text-xs text-muted-foreground">Press Enter to create</span>
							{/if}
						</div>
					</button>
				{/each}
			{:else}
				<div class="px-2 py-6 text-center text-sm text-muted-foreground">
					No options available
				</div>
			{/if}
		</div>
	{/if}
</div>
