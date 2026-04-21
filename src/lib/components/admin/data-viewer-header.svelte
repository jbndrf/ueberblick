<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';
	import { Pencil, Check, X } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages';

	type Role = { id: string; name: string };

	let {
		name,
		description = '',
		visibleToRoles = [],
		roles = [],
		icon,
		onNameChange,
		onDescriptionChange,
		onRolesChange,
		actions: actionsSnippet
	}: {
		name: string;
		description?: string;
		visibleToRoles?: string[];
		roles?: Role[];
		icon?: Snippet;
		onNameChange?: (value: string) => void;
		onDescriptionChange?: (value: string) => void;
		onRolesChange?: (value: string[]) => void;
		actions?: Snippet;
	} = $props();

	// Inline editing state
	let editingName = $state(false);
	let editingDescription = $state(false);
	let editNameValue = $state('');
	let editDescriptionValue = $state('');
	let selectedRoleIds = $state<string[]>([]);
	let editingRoles = $state(false);

	function startEditName() {
		editNameValue = name;
		editingName = true;
	}

	function saveName() {
		if (editNameValue.trim() && editNameValue !== name) {
			onNameChange?.(editNameValue.trim());
		}
		editingName = false;
	}

	function cancelEditName() {
		editingName = false;
	}

	function startEditDescription() {
		editDescriptionValue = description;
		editingDescription = true;
	}

	function saveDescription() {
		if (editDescriptionValue !== description) {
			onDescriptionChange?.(editDescriptionValue.trim());
		}
		editingDescription = false;
	}

	function cancelEditDescription() {
		editingDescription = false;
	}

	function handleNameKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') saveName();
		if (e.key === 'Escape') cancelEditName();
	}

	function handleDescriptionKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') saveDescription();
		if (e.key === 'Escape') cancelEditDescription();
	}

	function startEditRoles() {
		selectedRoleIds = [...visibleToRoles];
		editingRoles = true;
	}

	function saveRoles() {
		onRolesChange?.(selectedRoleIds);
		editingRoles = false;
	}

	function cancelEditRoles() {
		editingRoles = false;
	}

	const roleNames = $derived(
		visibleToRoles
			.map((id) => roles.find((r) => r.id === id)?.name)
			.filter(Boolean)
	);
</script>

<div class="flex flex-col gap-2">
	<!-- Top row: icon + name + actions -->
	<div class="flex items-center justify-between gap-4">
		<div class="flex items-center gap-3 min-w-0 flex-1">
			{#if icon}
				{@render icon()}
			{/if}

			{#if editingName}
				<div class="flex items-center gap-2">
					<Input
						bind:value={editNameValue}
						onkeydown={handleNameKeydown}
						class="h-9 text-2xl font-bold w-64"
						autofocus
					/>
					<Button variant="ghost" size="icon" class="h-8 w-8" onclick={saveName}>
						<Check class="h-4 w-4" />
					</Button>
					<Button variant="ghost" size="icon" class="h-8 w-8" onclick={cancelEditName}>
						<X class="h-4 w-4" />
					</Button>
				</div>
			{:else}
				<button
					class="group flex items-center gap-2 hover:text-foreground/80 transition-colors text-left"
					onclick={startEditName}
				>
					<h1 class="text-2xl font-bold tracking-tight">{name}</h1>
					<Pencil class="h-4 w-4 opacity-0 group-hover:opacity-50 transition-opacity" />
				</button>
			{/if}
		</div>

		{#if actionsSnippet}
			<div class="flex items-center gap-2 flex-shrink-0">
				{@render actionsSnippet()}
			</div>
		{/if}
	</div>

	<!-- Description row -->
	{#if editingDescription}
		<div class="flex items-center gap-2">
			<Input
				bind:value={editDescriptionValue}
				onkeydown={handleDescriptionKeydown}
				class="h-8 text-sm w-96"
				placeholder={m.adminDataViewerHeaderAddDescription()}
				autofocus
			/>
			<Button variant="ghost" size="icon" class="h-7 w-7" onclick={saveDescription}>
				<Check class="h-3 w-3" />
			</Button>
			<Button variant="ghost" size="icon" class="h-7 w-7" onclick={cancelEditDescription}>
				<X class="h-3 w-3" />
			</Button>
		</div>
	{:else}
		<button
			class="group flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground/70 transition-colors text-left w-fit"
			onclick={startEditDescription}
		>
			<span>{description || m.adminDataViewerHeaderAddDescription()}</span>
			<Pencil class="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
		</button>
	{/if}

	<!-- Roles row -->
	{#if roles.length > 0 && onRolesChange}
		<div class="flex items-center gap-2 flex-wrap">
			<span class="text-xs text-muted-foreground">{m.adminDataViewerHeaderVisibleTo()}:</span>
			{#if editingRoles}
				<div class="flex items-center gap-2">
					<MobileMultiSelect
						bind:selectedIds={selectedRoleIds}
						options={roles}
						getOptionId={(r) => r.id}
						getOptionLabel={(r) => r.name}
						placeholder={m.adminDataViewerHeaderSelectRoles()}
						class="min-w-[200px]"
					/>
					<Button variant="ghost" size="icon" class="h-7 w-7" onclick={saveRoles}>
						<Check class="h-3 w-3" />
					</Button>
					<Button variant="ghost" size="icon" class="h-7 w-7" onclick={cancelEditRoles}>
						<X class="h-3 w-3" />
					</Button>
				</div>
			{:else}
				<button
					class="group flex items-center gap-1 hover:text-foreground/70 transition-colors"
					onclick={startEditRoles}
				>
					{#if roleNames.length > 0}
						{#each roleNames as roleName}
							<Badge variant="secondary" class="text-xs">{roleName}</Badge>
						{/each}
					{:else}
						<span class="text-xs text-muted-foreground italic">{m.adminDataViewerHeaderAll()}</span>
					{/if}
					<Pencil class="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity ml-1" />
				</button>
			{/if}
		</div>
	{/if}
</div>
