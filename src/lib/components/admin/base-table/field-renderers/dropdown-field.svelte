<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { ChevronDown } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages';
	import type { Snippet } from 'svelte';

	interface DropdownOption {
		value: any;
		label: string;
		description?: string;
	}

	interface DropdownFieldProps {
		value: any;
		rowId: string;
		editMode: boolean;
		onUpdate?: (value: any) => Promise<void>;
		options: DropdownOption[];
		getDisplayLabel?: (value: any) => string;
		renderTrigger?: Snippet<[{ value: any; label: string }]>;
		renderOption?: Snippet<[{ option: DropdownOption }]>;
		readonly?: boolean;
	}

	let {
		value,
		rowId,
		editMode,
		onUpdate,
		options,
		getDisplayLabel,
		renderTrigger,
		renderOption,
		readonly = false
	}: DropdownFieldProps = $props();

	let isSaving = $state(false);

	const currentOption = $derived(
		options.find((opt) => opt.value === value) || { value, label: String(value) }
	);

	const displayLabel = $derived(
		getDisplayLabel ? getDisplayLabel(value) : currentOption.label
	);

	async function handleSelect(selectedValue: any) {
		if (isSaving || !onUpdate || readonly) return;

		isSaving = true;
		try {
			await onUpdate(selectedValue);
			toast.success(m.commonSave());
		} catch (error) {
			console.error('Error updating dropdown field:', error);
			toast.error('Failed to update');
		} finally {
			isSaving = false;
		}
	}
</script>

{#if editMode && !readonly && onUpdate}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				{#if renderTrigger}
					{@render renderTrigger({ value, label: displayLabel })}
				{:else}
					<Button
						{...props}
						variant="outline"
						size="sm"
						class="h-8 w-full justify-between"
						disabled={isSaving}
					>
						{displayLabel}
						<ChevronDown class="ml-2 h-3 w-3" />
					</Button>
				{/if}
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content>
			{#each options as option}
				<DropdownMenu.Item
					onclick={async () => {
						await handleSelect(option.value);
					}}
					disabled={isSaving}
				>
					{#if renderOption}
						{@render renderOption({ option })}
					{:else}
						<div class="flex flex-col">
							<span>{option.label}</span>
							{#if option.description}
								<span class="text-xs text-muted-foreground">{option.description}</span>
							{/if}
						</div>
					{/if}
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{:else}
	<div class="text-sm">
		{displayLabel}
	</div>
{/if}
