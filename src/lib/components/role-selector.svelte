<script lang="ts">
	import { X } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { cn } from '$lib/utils';
	import { tick } from 'svelte';

	type Role = {
		id: string;
		name: string;
		description?: string;
	};

	let {
		selectedRoleIds = $bindable([]),
		availableRoles = [],
		allowCreate = true,
		placeholder = 'Type to search or add roles...',
		class: className = '',
		disabled = false,
		onCreateRole = null
	}: {
		selectedRoleIds?: string[];
		availableRoles: Role[];
		allowCreate?: boolean;
		placeholder?: string;
		class?: string;
		disabled?: boolean;
		onCreateRole?: ((name: string) => Promise<Role>) | null;
	} = $props();

	let inputValue = $state('');
	let inputElement: HTMLInputElement | null = $state(null);
	let showSuggestions = $state(false);
	let highlightedIndex = $state(-1);
	let cursorPosition = $state(0);
	let containerElement: HTMLDivElement | null = $state(null);

	const selectedRoles = $derived(
		selectedRoleIds
			.map((id) => availableRoles.find((r) => r.id === id))
			.filter((r): r is Role => r !== undefined)
	);

	// Check if user typed # to show all roles
	const showAllRoles = $derived(inputValue.trim() === '#' || inputValue.startsWith('#'));

	const searchQuery = $derived(
		showAllRoles ? inputValue.substring(1).trim() : inputValue.trim()
	);

	const filteredRoles = $derived(
		availableRoles.filter(
			(role) =>
				!selectedRoleIds.includes(role.id) &&
				(showAllRoles
					? (searchQuery === '' || role.name.toLowerCase().includes(searchQuery.toLowerCase()))
					: role.name.toLowerCase().includes(inputValue.toLowerCase()))
		)
	);

	const exactMatch = $derived(
		filteredRoles.find((role) => role.name.toLowerCase() === searchQuery.toLowerCase())
	);

	const canCreateNew = $derived(
		allowCreate && searchQuery !== '' && !exactMatch && !showAllRoles
	);

	const suggestions = $derived([
		...filteredRoles,
		...(canCreateNew ? [{ id: '__create__', name: `Create "${searchQuery}"`, isNew: true }] : [])
	]);

	function removeRole(roleId: string) {
		if (disabled) return;
		selectedRoleIds = selectedRoleIds.filter((id) => id !== roleId);
		tick().then(() => {
			if (inputElement) {
				inputElement.focus();
			}
		});
	}

	async function selectRole(role: Role | { id: string; name: string; isNew?: boolean }) {
		if ('isNew' in role && role.isNew) {
			await createAndSelectRole();
		} else {
			if (!selectedRoleIds.includes(role.id)) {
				selectedRoleIds = [...selectedRoleIds, role.id];
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

	async function createAndSelectRole() {
		if (!canCreateNew || !onCreateRole) return;

		const newRoleName = inputValue.trim();
		try {
			const newRole = await onCreateRole(newRoleName);
			availableRoles = [...availableRoles, newRole];
			selectedRoleIds = [...selectedRoleIds, newRole.id];
			inputValue = '';
			showSuggestions = false;
			highlightedIndex = -1;
			await tick();
			if (inputElement) {
				inputElement.focus();
			}
		} catch (error) {
			console.error('Failed to create role:', error);
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
				selectRole(suggestions[highlightedIndex]);
			} else if (canCreateNew) {
				createAndSelectRole();
			} else if (filteredRoles.length > 0) {
				selectRole(filteredRoles[0]);
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
		} else if (e.key === 'Backspace' && inputValue === '' && selectedRoles.length > 0) {
			e.preventDefault();
			// Remove last selected role when backspace on empty input
			removeRole(selectedRoles[selectedRoles.length - 1].id);
		} else if (e.key === 'ArrowLeft' && cursorPosition === 0 && selectedRoles.length > 0) {
			// Focus the last badge when left arrow at position 0
			e.preventDefault();
			const badges = containerElement?.querySelectorAll('[data-badge-button]');
			if (badges && badges.length > 0) {
				(badges[badges.length - 1] as HTMLElement).focus();
			}
		}
	}

	function handleBadgeKeydown(e: KeyboardEvent, roleId: string, index: number) {
		if (disabled) return;

		const badges = containerElement?.querySelectorAll('[data-badge-button]');

		if (e.key === 'ArrowLeft' && index > 0) {
			// Move to previous badge
			e.preventDefault();
			(badges?.[index - 1] as HTMLElement)?.focus();
		} else if (e.key === 'ArrowRight') {
			// Move to next badge or input
			e.preventDefault();
			if (index < selectedRoles.length - 1) {
				(badges?.[index + 1] as HTMLElement)?.focus();
			} else {
				inputElement?.focus();
			}
		} else if (e.key === 'Backspace' || e.key === 'Delete') {
			e.preventDefault();
			removeRole(roleId);
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
			removeRole(roleId);
		}
	}

	function handleFocus() {
		if (inputValue.length > 0) {
			showSuggestions = true;
		}
	}

	function handleBlur(e: FocusEvent) {
		// Delay to allow click on suggestion
		setTimeout(() => {
			if (!e.relatedTarget || !(e.relatedTarget as HTMLElement).closest('.suggestions-list')) {
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
</script>

<div class={cn('relative', className)}>
	<!-- Input Field with Inline Badges -->
	<div
		bind:this={containerElement}
		onclick={handleContainerClick}
		class={cn(
			'flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors',
			'focus-within:outline-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
			disabled && 'cursor-not-allowed opacity-50'
		)}
	>
		<!-- Selected Roles as Inline Badges -->
		{#each selectedRoles as role, index (role.id)}
			<Badge variant="secondary" class="gap-1 pr-1">
				{role.name}
				{#if !disabled}
					<button
						type="button"
						data-badge-button
						onclick={(e) => {
							e.stopPropagation();
							removeRole(role.id);
						}}
						onkeydown={(e) => handleBadgeKeydown(e, role.id, index)}
						class="ml-1 rounded-full hover:bg-muted focus:outline-hidden focus:ring-1 focus:ring-ring"
						tabindex="0"
						aria-label="Remove {role.name}"
					>
						<X class="h-3 w-3" />
					</button>
				{/if}
			</Badge>
		{/each}

		<!-- Input Element -->
		<input
			bind:this={inputElement}
			type="text"
			bind:value={inputValue}
			oninput={handleInput}
			onkeydown={handleKeydown}
			onfocus={handleFocus}
			onblur={handleBlur}
			placeholder={selectedRoles.length === 0 ? placeholder : ''}
			{disabled}
			class="min-w-[120px] flex-1 bg-transparent outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed"
		/>
	</div>

	<!-- Suggestions Dropdown -->
	{#if showSuggestions && suggestions.length > 0}
		<div
			class="suggestions-list absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
		>
			{#each suggestions as suggestion, index (suggestion.id)}
				{@const isHighlighted = index === highlightedIndex}
				{@const isNew = 'isNew' in suggestion && suggestion.isNew}
				<button
					type="button"
					onclick={() => selectRole(suggestion)}
					class={cn(
						'relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-hidden',
						isHighlighted && 'bg-accent text-accent-foreground',
						!isHighlighted && 'hover:bg-accent/50'
					)}
					tabindex="-1"
				>
					<div class="flex flex-1 flex-col items-start">
						<span class={isNew ? 'text-primary' : ''}>
							{isNew ? suggestion.name : suggestion.name}
						</span>
						{#if !isNew && 'description' in suggestion && suggestion.description}
							<span class="text-xs text-muted-foreground">{suggestion.description}</span>
						{/if}
						{#if isNew}
							<span class="text-xs text-muted-foreground">Press Enter to create</span>
						{/if}
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>
