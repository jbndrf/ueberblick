<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';
	import MediaGallery from './MediaGallery.svelte';
	import { getParticipantGateway } from '$lib/participant-state/context.svelte';
	import { POCKETBASE_URL } from '$lib/config/pocketbase';
	import type {
		FormMode,
		FormFieldWithValue,
		MediaFile,
		FieldContext,
		DateFieldOptions,
		FileFieldOptions,
		DropdownFieldOptions,
		SmartDropdownFieldOptions,
		CustomTableSelectorOptions
	} from './types';
	import { isImageFile } from './types';

	// ==========================================================================
	// Props
	// ==========================================================================

	interface Props {
		mode: FormMode;
		field: FormFieldWithValue;
		value?: unknown;
		error?: string;
		onValueChange?: (value: unknown) => void;
		onFileChange?: (files: File[]) => void;
		context?: FieldContext;
		fileCollection?: string;
		disabled?: boolean;
	}

	let {
		mode,
		field,
		value,
		error,
		onValueChange,
		onFileChange,
		context = { values: {}, fields: [] },
		fileCollection = 'workflow_instance_field_values',
		disabled = false
	}: Props = $props();

	const gateway = getParticipantGateway();
	const isViewMode = $derived(mode === 'view');

	// ==========================================================================
	// Field Type Options
	// ==========================================================================

	const dateOptions = $derived(field.field_options as DateFieldOptions | null);
	const fileOptions = $derived(field.field_options as FileFieldOptions | null);
	const dropdownOptions = $derived(field.field_options as DropdownFieldOptions | null);
	const smartDropdownOptions = $derived(field.field_options as SmartDropdownFieldOptions | null);
	const customTableOptions = $derived(field.field_options as CustomTableSelectorOptions | null);

	// Map column_position to MediaGallery sizing
	const mediaGalleryColumnPosition = $derived.by((): 'full' | 'half' | 'third' | 'quarter' => {
		switch (field.column_position) {
			case 'left':
			case 'right':
				return 'half';
			case 'full':
			default:
				return 'full';
		}
	});


	// ==========================================================================
	// Smart Dropdown Logic
	// ==========================================================================

	const smartDropdownCurrentOptions = $derived.by(() => {
		if (field.field_type !== 'smart_dropdown' || !smartDropdownOptions) return [];
		const sourceFieldId = smartDropdownOptions.source_field;
		const sourceValue = context.values[sourceFieldId];
		if (!sourceValue) return [];
		const mapping = smartDropdownOptions.mappings?.find((m) => m.when === sourceValue);
		return mapping?.options || [];
	});

	// ==========================================================================
	// Custom Table Selector Logic
	// ==========================================================================

	let customEntities = $state<Array<{ id: string; label: string; description?: string }>>([]);
	let loadingEntities = $state(false);

	// Track source config to avoid reloading entities on every value change
	let lastSourceConfig = $state<string | null>(null);

	// Build a config key from the source parameters that actually affect what entities to load
	const currentSourceConfig = $derived.by(() => {
		if (field.field_type !== 'custom_table_selector' || !customTableOptions) return null;
		return JSON.stringify({
			source_type: customTableOptions.source_type,
			marker_category_id: customTableOptions.marker_category_id,
			custom_table_id: customTableOptions.custom_table_id,
			display_field: customTableOptions.display_field
		});
	});

	// Only load entities when the source configuration actually changes
	$effect(() => {
		if (currentSourceConfig && currentSourceConfig !== lastSourceConfig) {
			lastSourceConfig = currentSourceConfig;
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
						customEntities = records.map((r) => ({
							id: r.id,
							label: r.title || r.name || r.id,
							description: r.description
						}));
					}
					break;
				case 'participants':
					records = await gateway.collection('participants').getFullList();
					customEntities = records.map((r) => ({
						id: r.id,
						label: r.name || r.email || r.id,
						description: r.email
					}));
					break;
				case 'roles':
					records = await gateway.collection('roles').getFullList();
					customEntities = records.map((r) => ({
						id: r.id,
						label: r.name || r.id,
						description: r.description
					}));
					break;
				case 'custom_table':
					if (customTableOptions.custom_table_id) {
						records = await gateway
							.collection(customTableOptions.custom_table_id)
							.getFullList();
						const displayField = customTableOptions.display_field || 'name';
						customEntities = records.map((r) => ({
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

	// ==========================================================================
	// File Handling
	// ==========================================================================

	let selectedFiles = $state<File[]>([]);
	let removedExistingIndices = $state<Set<number>>(new Set());

	// Get existing files, filtering out removed ones
	const existingFiles = $derived.by(() => {
		if (field.storedFiles && field.storedFiles.length > 0) {
			return field.storedFiles.filter((_, i) => !removedExistingIndices.has(i));
		} else if (field.fileValue && field.fileRecordId && !removedExistingIndices.has(0)) {
			return [{ recordId: field.fileRecordId, fileName: field.fileValue }];
		}
		return [];
	});

	// Count of existing files (after removals)
	const existingFilesCount = $derived(existingFiles.length);

	// Build media files array for MediaGallery
	const mediaFiles = $derived.by((): MediaFile[] => {
		const files: MediaFile[] = [];

		// Existing files from database (filtered)
		for (const storedFile of existingFiles) {
			const url = `${POCKETBASE_URL}/api/files/${fileCollection}/${storedFile.recordId}/${storedFile.fileName}`;
			files.push({
				url,
				name: storedFile.fileName,
				isImage: isImageFile(storedFile.fileName)
			});
		}

		// Newly selected files
		for (const file of selectedFiles) {
			files.push({
				url: URL.createObjectURL(file),
				name: file.name,
				isImage: isImageFile(file.name),
				file
			});
		}

		return files;
	});

	function handleFileAdd(newFiles: File[]) {
		const maxFiles = fileOptions?.max_files || 10;
		const remaining = maxFiles - selectedFiles.length - existingFilesCount;
		selectedFiles = [...selectedFiles, ...newFiles.slice(0, remaining)];
		onFileChange?.(selectedFiles);
	}

	function handleFileRemove(index: number) {
		if (index < existingFilesCount) {
			// Removing an existing file - track it as removed
			// Find the original index in field.storedFiles
			let originalIndex = 0;
			let visibleIndex = 0;
			const storedFiles = field.storedFiles ?? (field.fileValue ? [{ recordId: field.fileRecordId, fileName: field.fileValue }] : []);

			for (let i = 0; i < storedFiles.length; i++) {
				if (!removedExistingIndices.has(i)) {
					if (visibleIndex === index) {
						originalIndex = i;
						break;
					}
					visibleIndex++;
				}
			}

			removedExistingIndices = new Set([...removedExistingIndices, originalIndex]);
			onFileChange?.(selectedFiles); // Signal change to parent
		} else {
			// Removing a newly selected file
			selectedFiles = selectedFiles.filter((_, i) => i !== index - existingFilesCount);
			onFileChange?.(selectedFiles);
		}
	}

	// ==========================================================================
	// Dropdown Value Handling
	// ==========================================================================

	function handleDropdownChange(ids: string[]) {
		const isMultiple =
			field.field_type === 'multiple_choice' || customTableOptions?.allow_multiple;
		const newValue = isMultiple ? ids : ids[0] || null;

		const currentValue = value;
		let valuesEqual: boolean;

		if (isMultiple) {
			const currentArray = Array.isArray(currentValue) ? currentValue : [];
			valuesEqual =
				currentArray.length === ids.length && currentArray.every((v, i) => v === ids[i]);
		} else {
			const currentSingle = currentValue ?? null;
			valuesEqual = currentSingle === newValue;
		}

		if (!valuesEqual) {
			onValueChange?.(newValue);
		}
	}

	const selectedIds = $derived.by(() => {
		if (value === null || value === undefined) return [];
		if (Array.isArray(value)) return value as string[];
		return [value as string];
	});

	const dropdownSelectOptions = $derived.by(() => {
		const opts = dropdownOptions?.options || [];
		return opts.map((opt) => ({
			id: opt.label,
			label: opt.label,
			description: opt.description
		}));
	});

	const smartDropdownSelectOptions = $derived.by(() => {
		return smartDropdownCurrentOptions.map((opt) => ({
			id: opt.label,
			label: opt.label,
			description: opt.description
		}));
	});

	// ==========================================================================
	// View Mode: Helpers
	// ==========================================================================

	const hasValue = $derived.by(() => {
		if (value === null || value === undefined || value === '') return false;
		if (Array.isArray(value) && value.length === 0) return false;
		return true;
	});

	// Get display labels for selected options (for view mode badges)
	const selectedLabels = $derived.by((): string[] => {
		if (!hasValue) return [];

		// For dropdown/multiple_choice - options are already labels
		if (field.field_type === 'dropdown' || field.field_type === 'multiple_choice') {
			if (Array.isArray(value)) return value as string[];
			return [value as string];
		}

		// For smart_dropdown
		if (field.field_type === 'smart_dropdown') {
			if (Array.isArray(value)) return value as string[];
			return [value as string];
		}

		// For custom_table_selector - need to look up labels from customEntities
		if (field.field_type === 'custom_table_selector') {
			const ids = Array.isArray(value) ? value : [value];
			return ids.map(id => {
				const entity = customEntities.find(e => e.id === id);
				return entity?.label || String(id);
			});
		}

		return [];
	});

	// Format date for view mode display
	const formattedDateValue = $derived.by(() => {
		if (field.field_type !== 'date' || !hasValue) return null;
		const dateMode = dateOptions?.date_mode || 'date';
		try {
			const date = new Date(value as string);
			if (dateMode === 'time') {
				return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
			} else if (dateMode === 'datetime') {
				return date.toLocaleString('de-DE', {
					day: '2-digit',
					month: '2-digit',
					year: 'numeric',
					hour: '2-digit',
					minute: '2-digit'
				});
			} else {
				return date.toLocaleDateString('de-DE', {
					day: '2-digit',
					month: '2-digit',
					year: 'numeric'
				});
			}
		} catch {
			return String(value);
		}
	});
</script>

<div class="space-y-1.5">
	<!-- Label (shown in all modes) -->
	<Label for={field.id} class="flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
		{field.field_label}
		{#if field.is_required && !isViewMode}
			<span class="text-destructive">*</span>
		{/if}
	</Label>

	<!-- ============================================================== -->
	<!-- VIEW MODE - Read-only display -->
	<!-- ============================================================== -->
	{#if isViewMode}
		{#if field.field_type === 'file'}
			{#if mediaFiles.length > 0}
				<MediaGallery mode="view" files={mediaFiles} columnPosition={mediaGalleryColumnPosition} />
			{:else}
				<div class="rounded-md border border-input bg-muted/30 px-3 py-2 text-sm text-muted-foreground italic">
					No file
				</div>
			{/if}
		{:else if field.field_type === 'long_text'}
			<div class="rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px] whitespace-pre-wrap">
				{#if hasValue}
					{value}
				{:else}
					<span class="text-muted-foreground italic">No value</span>
				{/if}
			</div>
		{:else if field.field_type === 'dropdown' || field.field_type === 'multiple_choice' || field.field_type === 'smart_dropdown' || field.field_type === 'custom_table_selector'}
			<!-- Selection fields: show badges -->
			{#if loadingEntities && field.field_type === 'custom_table_selector'}
				<div class="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground">
					<div class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
					Loading...
				</div>
			{:else if selectedLabels.length > 0}
				<div class="flex flex-wrap gap-1.5 rounded-md border border-input bg-background px-3 py-2 min-h-10">
					{#each selectedLabels as label}
						<Badge variant="secondary">{label}</Badge>
					{/each}
				</div>
			{:else}
				<div class="rounded-md border border-input bg-muted/30 px-3 py-2 text-sm text-muted-foreground italic">
					No value
				</div>
			{/if}
		{:else if field.field_type === 'date'}
			<div class="rounded-md border border-input bg-background px-3 py-2 text-sm">
				{#if hasValue && formattedDateValue}
					{formattedDateValue}
				{:else}
					<span class="text-muted-foreground italic">No value</span>
				{/if}
			</div>
		{:else}
			<!-- Text/number/email fields -->
			<div class="rounded-md border border-input bg-background px-3 py-2 text-sm min-h-10 flex items-center">
				{#if hasValue}
					{value}
				{:else}
					<span class="text-muted-foreground italic">No value</span>
				{/if}
			</div>
		{/if}

	<!-- ============================================================== -->
	<!-- FILL/EDIT MODE - Interactive inputs -->
	<!-- ============================================================== -->
	{:else}
		{#if field.field_type === 'short_text'}
			<Input
				id={field.id}
				type="text"
				value={(value as string) || ''}
				placeholder={field.placeholder}
				{disabled}
				oninput={(e) => onValueChange?.(e.currentTarget.value)}
				class={error ? 'border-destructive' : ''}
			/>
		{:else if field.field_type === 'long_text'}
			<Textarea
				id={field.id}
				value={(value as string) || ''}
				placeholder={field.placeholder}
				{disabled}
				oninput={(e) => onValueChange?.(e.currentTarget.value)}
				rows={4}
				class={error ? 'border-destructive' : ''}
			/>
		{:else if field.field_type === 'number'}
			<Input
				id={field.id}
				type="number"
				value={(value as number) || ''}
				placeholder={field.placeholder}
				{disabled}
				oninput={(e) => onValueChange?.(e.currentTarget.valueAsNumber || null)}
				min={field.validation_rules?.min}
				max={field.validation_rules?.max}
				class={error ? 'border-destructive' : ''}
			/>
		{:else if field.field_type === 'email'}
			<Input
				id={field.id}
				type="email"
				value={(value as string) || ''}
				placeholder={field.placeholder || 'email@example.com'}
				{disabled}
				oninput={(e) => onValueChange?.(e.currentTarget.value)}
				class={error ? 'border-destructive' : ''}
			/>
		{:else if field.field_type === 'date'}
			{@const dateMode = dateOptions?.date_mode || 'date'}
			{@const inputType = dateMode === 'time' ? 'time' : dateMode === 'datetime' ? 'datetime-local' : 'date'}
			<Input
				id={field.id}
				type={inputType}
				value={(value as string) || ''}
				placeholder={field.placeholder}
				{disabled}
				oninput={(e) => onValueChange?.(e.currentTarget.value)}
				class={error ? 'border-destructive' : ''}
			/>
		{:else if field.field_type === 'file'}
			<MediaGallery
				{mode}
				files={mediaFiles}
				columnPosition={mediaGalleryColumnPosition}
				onAdd={handleFileAdd}
				onRemove={handleFileRemove}
				allowedTypes={fileOptions?.allowed_file_types}
				maxFiles={fileOptions?.max_files || 10}
			/>
		{:else if field.field_type === 'dropdown'}
			<MobileMultiSelect
				{selectedIds}
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
				{selectedIds}
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
					{selectedIds}
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
					{selectedIds}
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
	{/if}

	<!-- Help Text (fill/edit only) -->
	{#if field.help_text && !isViewMode}
		<p class="text-xs text-muted-foreground">{field.help_text}</p>
	{/if}

	<!-- Error Message -->
	{#if error}
		<p class="text-xs text-destructive">{error}</p>
	{/if}
</div>
