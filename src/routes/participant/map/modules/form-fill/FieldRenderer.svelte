<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';
	import { getParticipantGateway } from '$lib/participant-state/context.svelte';
	import { Calendar, Upload, X } from 'lucide-svelte';
	import type {
		FormField,
		FieldContext,
		DateFieldOptions,
		FileFieldOptions,
		DropdownFieldOptions,
		SmartDropdownFieldOptions,
		CustomTableSelectorOptions,
		FieldOption
	} from './types';

	interface Props {
		field: FormField;
		value: unknown;
		context: FieldContext;
		error?: string;
		disabled?: boolean;
		onValueChange: (value: unknown) => void;
	}

	let { field, value, context, error, disabled = false, onValueChange }: Props = $props();

	const gateway = getParticipantGateway();

	// ==========================================================================
	// Field Type Helpers
	// ==========================================================================

	const dateOptions = $derived(field.field_options as DateFieldOptions | null);
	const fileOptions = $derived(field.field_options as FileFieldOptions | null);
	const dropdownOptions = $derived(field.field_options as DropdownFieldOptions | null);
	const smartDropdownOptions = $derived(field.field_options as SmartDropdownFieldOptions | null);
	const customTableOptions = $derived(field.field_options as CustomTableSelectorOptions | null);

	// Smart dropdown: get options based on source field value
	const smartDropdownCurrentOptions = $derived.by(() => {
		if (field.field_type !== 'smart_dropdown' || !smartDropdownOptions) return [];

		const sourceFieldId = smartDropdownOptions.source_field;
		const sourceValue = context.values[sourceFieldId];

		if (!sourceValue) return [];

		const mapping = smartDropdownOptions.mappings?.find(m => m.when === sourceValue);
		return mapping?.options || [];
	});

	// Custom table selector: entity loading
	let customEntities = $state<Array<{ id: string; label: string; description?: string }>>([]);
	let loadingEntities = $state(false);

	$effect(() => {
		if (field.field_type === 'custom_table_selector' && customTableOptions) {
			loadCustomEntities();
		}
	});

	async function loadCustomEntities() {
		if (!customTableOptions || !gateway) return;

		loadingEntities = true;
		try {
			let records: any[] = [];

			switch (customTableOptions.source_type) {
				case 'marker_category':
					if (customTableOptions.marker_category_id) {
						records = await gateway.collection('markers').getFullList({
							filter: `category_id = "${customTableOptions.marker_category_id}"`
						});
						customEntities = records.map(r => ({
							id: r.id,
							label: r.title || r.name || r.id,
							description: r.description
						}));
					}
					break;
				case 'participants':
					records = await gateway.collection('participants').getFullList();
					customEntities = records.map(r => ({
						id: r.id,
						label: r.name || r.email || r.id,
						description: r.email
					}));
					break;
				case 'roles':
					records = await gateway.collection('roles').getFullList();
					customEntities = records.map(r => ({
						id: r.id,
						label: r.name || r.id,
						description: r.description
					}));
					break;
				case 'custom_table':
					if (customTableOptions.custom_table_id) {
						records = await gateway.collection(customTableOptions.custom_table_id).getFullList();
						const displayField = customTableOptions.display_field || 'name';
						customEntities = records.map(r => ({
							id: r.id,
							label: r[displayField] || r.id,
							description: undefined
						}));
					}
					break;
			}
		} catch (err) {
			console.error('Failed to load custom entities:', err);
			customEntities = [];
		} finally {
			loadingEntities = false;
		}
	}

	// File handling
	let fileInput: HTMLInputElement | undefined = $state();
	let selectedFiles = $state<File[]>([]);

	function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		if (!input.files) return;

		const maxFiles = fileOptions?.max_files || 10;
		const newFiles = Array.from(input.files).slice(0, maxFiles - selectedFiles.length);
		selectedFiles = [...selectedFiles, ...newFiles];
		onValueChange(selectedFiles);
	}

	function removeFile(index: number) {
		selectedFiles = selectedFiles.filter((_, i) => i !== index);
		onValueChange(selectedFiles);
	}

	// Dropdown/multi-select value handling
	// IMPORTANT: This is called by MobileMultiSelect's $effect on every selectedIds change,
	// including initial render. We must compare values to prevent infinite loops.
	function handleDropdownChange(ids: string[]) {
		const isMultiple = field.field_type === 'multiple_choice' || customTableOptions?.allow_multiple;
		const newValue = isMultiple ? ids : (ids[0] || null);

		// Compare with current value to prevent infinite loops
		const currentValue = value;
		let valuesEqual: boolean;

		if (isMultiple) {
			// For arrays: compare element by element
			const currentArray = Array.isArray(currentValue) ? currentValue : [];
			valuesEqual =
				currentArray.length === ids.length && currentArray.every((v, i) => v === ids[i]);
		} else {
			// For single values: direct comparison (handle null/undefined cases)
			const currentSingle = currentValue ?? null;
			valuesEqual = currentSingle === newValue;
		}

		if (!valuesEqual) {
			onValueChange(newValue);
		}
	}

	// Convert current value to selectedIds format for MobileMultiSelect
	const selectedIds = $derived.by(() => {
		if (value === null || value === undefined) return [];
		if (Array.isArray(value)) return value as string[];
		return [value as string];
	});

	// Build options for dropdown fields
	const dropdownSelectOptions = $derived.by(() => {
		const opts = dropdownOptions?.options || [];
		return opts.map((opt, i) => ({
			id: opt.label, // Use label as ID for simple dropdowns
			label: opt.label,
			description: opt.description
		}));
	});

	const smartDropdownSelectOptions = $derived.by(() => {
		return smartDropdownCurrentOptions.map((opt, i) => ({
			id: opt.label,
			label: opt.label,
			description: opt.description
		}));
	});
</script>

<div class="space-y-1.5">
	<Label for={field.id} class="flex items-center gap-1">
		{field.field_label}
		{#if field.is_required}
			<span class="text-destructive">*</span>
		{/if}
	</Label>

	{#if field.field_type === 'short_text'}
		<Input
			id={field.id}
			type="text"
			value={value as string || ''}
			placeholder={field.placeholder}
			{disabled}
			oninput={(e) => onValueChange(e.currentTarget.value)}
			class={error ? 'border-destructive' : ''}
		/>

	{:else if field.field_type === 'long_text'}
		<Textarea
			id={field.id}
			value={value as string || ''}
			placeholder={field.placeholder}
			{disabled}
			oninput={(e) => onValueChange(e.currentTarget.value)}
			rows={4}
			class={error ? 'border-destructive' : ''}
		/>

	{:else if field.field_type === 'number'}
		<Input
			id={field.id}
			type="number"
			value={value as number || ''}
			placeholder={field.placeholder}
			{disabled}
			oninput={(e) => onValueChange(e.currentTarget.valueAsNumber || null)}
			min={field.validation_rules?.min}
			max={field.validation_rules?.max}
			class={error ? 'border-destructive' : ''}
		/>

	{:else if field.field_type === 'email'}
		<Input
			id={field.id}
			type="email"
			value={value as string || ''}
			placeholder={field.placeholder || 'email@example.com'}
			{disabled}
			oninput={(e) => onValueChange(e.currentTarget.value)}
			class={error ? 'border-destructive' : ''}
		/>

	{:else if field.field_type === 'date'}
		{@const mode = dateOptions?.date_mode || 'date'}
		{@const inputType = mode === 'time' ? 'time' : mode === 'datetime' ? 'datetime-local' : 'date'}
		<div class="relative">
			<Input
				id={field.id}
				type={inputType}
				value={value as string || ''}
				placeholder={field.placeholder}
				{disabled}
				oninput={(e) => onValueChange(e.currentTarget.value)}
				class={error ? 'border-destructive' : ''}
			/>
		</div>

	{:else if field.field_type === 'file'}
		<div class="space-y-2">
			<input
				bind:this={fileInput}
				type="file"
				id={field.id}
				accept={fileOptions?.allowed_file_types?.join(',')}
				multiple={!fileOptions?.max_files || fileOptions.max_files > 1}
				{disabled}
				onchange={handleFileSelect}
				class="hidden"
			/>
			<button
				type="button"
				onclick={() => fileInput?.click()}
				{disabled}
				class="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-input bg-background px-4 py-6 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
				class:border-destructive={error}
			>
				<Upload class="h-5 w-5" />
				<span>Click to upload</span>
			</button>

			{#if selectedFiles.length > 0}
				<div class="flex flex-wrap gap-2">
					{#each selectedFiles as file, i}
						<div class="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm">
							<span class="max-w-[150px] truncate">{file.name}</span>
							<button
								type="button"
								onclick={() => removeFile(i)}
								class="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
							>
								<X class="h-3 w-3" />
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</div>

	{:else if field.field_type === 'dropdown'}
		<MobileMultiSelect
			selectedIds={selectedIds}
			options={dropdownSelectOptions}
			getOptionId={(o) => o.id}
			getOptionLabel={(o) => o.label}
			getOptionDescription={(o) => o.description}
			placeholder={field.placeholder || 'Select...'}
			singleSelect={true}
			{disabled}
			onSelectedIdsChange={handleDropdownChange}
		/>

	{:else if field.field_type === 'multiple_choice'}
		<MobileMultiSelect
			selectedIds={selectedIds}
			options={dropdownSelectOptions}
			getOptionId={(o) => o.id}
			getOptionLabel={(o) => o.label}
			getOptionDescription={(o) => o.description}
			placeholder={field.placeholder || 'Select options...'}
			singleSelect={false}
			{disabled}
			onSelectedIdsChange={handleDropdownChange}
		/>

	{:else if field.field_type === 'smart_dropdown'}
		{@const hasSourceValue = smartDropdownOptions?.source_field && context.values[smartDropdownOptions.source_field]}
		{#if !hasSourceValue}
			<div class="rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
				Select a value in the dependent field first
			</div>
		{:else}
			<MobileMultiSelect
				selectedIds={selectedIds}
				options={smartDropdownSelectOptions}
				getOptionId={(o) => o.id}
				getOptionLabel={(o) => o.label}
				getOptionDescription={(o) => o.description}
				placeholder={field.placeholder || 'Select...'}
				singleSelect={true}
				{disabled}
				onSelectedIdsChange={handleDropdownChange}
			/>
		{/if}

	{:else if field.field_type === 'custom_table_selector'}
		{#if loadingEntities}
			<div class="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground">
				<div class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
				Loading...
			</div>
		{:else}
			<MobileMultiSelect
				selectedIds={selectedIds}
				options={customEntities}
				getOptionId={(o) => o.id}
				getOptionLabel={(o) => o.label}
				getOptionDescription={(o) => o.description}
				placeholder={field.placeholder || 'Select...'}
				singleSelect={!customTableOptions?.allow_multiple}
				{disabled}
				onSelectedIdsChange={handleDropdownChange}
			/>
		{/if}
	{/if}

	{#if field.help_text}
		<p class="text-xs text-muted-foreground">{field.help_text}</p>
	{/if}

	{#if error}
		<p class="text-xs text-destructive">{error}</p>
	{/if}
</div>
