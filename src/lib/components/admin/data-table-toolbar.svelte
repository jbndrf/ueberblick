<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import { Label } from '$lib/components/ui/label';
	import { X } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		searchValue?: string;
		onSearchChange: (value: string) => void;
		onClearFilters: () => void;
		hasActiveFilters: boolean;
		searchPlaceholder?: string;
		showEditMode?: boolean;
		editMode?: boolean;
		onEditModeChange?: (enabled: boolean) => void;
		editModeLabel?: string;
	};

	let {
		searchValue = '',
		onSearchChange,
		onClearFilters,
		hasActiveFilters,
		searchPlaceholder = m.commonSearch(),
		showEditMode = false,
		editMode = $bindable(false),
		onEditModeChange,
		editModeLabel = 'Edit mode'
	}: Props = $props();

	let internalSearchValue = $state(searchValue);
</script>

<div class="flex items-center gap-3 justify-between">
	<div class="flex items-center gap-3 flex-1">
		<Input
			type="search"
			placeholder={searchPlaceholder}
			value={internalSearchValue}
			oninput={(e) => {
				internalSearchValue = e.currentTarget.value;
				onSearchChange(e.currentTarget.value);
			}}
			class="max-w-sm"
		/>
		{#if hasActiveFilters}
			<Button variant="ghost" size="sm" onclick={onClearFilters} class="h-8 px-2 lg:px-3">
				Clear filters
				<X class="ml-2 h-4 w-4" />
			</Button>
		{/if}
	</div>

	{#if showEditMode}
		<div class="flex items-center gap-2">
			<Switch
				id="edit-mode"
				checked={editMode}
				onCheckedChange={(checked) => {
					editMode = !!checked;
					if (onEditModeChange) {
						onEditModeChange(!!checked);
					}
				}}
			/>
			<Label for="edit-mode" class="cursor-pointer">{editModeLabel}</Label>
		</div>
	{/if}
</div>
