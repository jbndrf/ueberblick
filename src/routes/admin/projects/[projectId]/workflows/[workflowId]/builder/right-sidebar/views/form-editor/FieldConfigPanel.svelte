<script lang="ts">
	import { ArrowLeft, Trash2 } from '@lucide/svelte';
	import { Type } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import SmartDropdownConfig from './SmartDropdownConfig.svelte';
	import EntitySelectorConfig from './EntitySelectorConfig.svelte';

	import {
		fieldTypeIcons,
		fieldTypeLabels,
		type ToolsFormField,
		type ToolsForm,
		type WorkflowStage,
		type FieldOption,
		type DateFieldOptions,
		type FileFieldOptions,
		type TextValidation,
		type NumberValidation,
		type MultipleChoiceValidation,
		type EntitySelectorOptions
	} from '$lib/workflow-builder';
	import * as m from '$lib/paraglide/messages';

	type AncestorFieldGroup = {
		stage: WorkflowStage;
		form: ToolsForm;
		fields: ToolsFormField[];
	};

	type Role = {
		id: string;
		name: string;
		description?: string;
	};

	type Props = {
		field: ToolsFormField;
		/** Ancestor fields for smart dropdown configuration */
		ancestorFields?: AncestorFieldGroup[];
		/** Available roles for entity selector */
		roles?: Role[];
		onUpdate?: (updates: Partial<ToolsFormField>) => void;
		onDelete?: () => void;
		onClose?: () => void;
	};

	let { field, ancestorFields = [], roles = [], onUpdate, onDelete, onClose }: Props = $props();

	const Icon = $derived(fieldTypeIcons[field.field_type] || Type);

	// ==========================================================================
	// Common settings state
	// ==========================================================================
	let label = $state(field.field_label);
	let placeholder = $state(field.placeholder || '');
	let helpText = $state(field.help_text || '');
	let isRequired = $state(field.is_required || false);

	// ==========================================================================
	// Options textarea state (for dropdown, multiple_choice)
	// Format: "label, description" per line
	// ==========================================================================
	let optionsText = $state('');

	// ==========================================================================
	// Text field validation state
	// ==========================================================================
	let textMinLength = $state<number | undefined>(undefined);
	let textMaxLength = $state<number | undefined>(undefined);
	let textPattern = $state('');

	// ==========================================================================
	// Number field validation state
	// ==========================================================================
	let numberMin = $state<number | undefined>(undefined);
	let numberMax = $state<number | undefined>(undefined);
	let numberStep = $state<number | undefined>(undefined);

	// ==========================================================================
	// Date field state
	// ==========================================================================
	let dateMode = $state<'date' | 'datetime' | 'time'>('date');
	let prefillNow = $state(false);

	// ==========================================================================
	// File field state
	// ==========================================================================
	let fileTypes = $state<string>('all');
	let maxFiles = $state<number>(1);

	// ==========================================================================
	// Multiple choice validation state
	// ==========================================================================
	let minSelections = $state<number | undefined>(undefined);
	let maxSelections = $state<number | undefined>(undefined);

	// ==========================================================================
	// Parse/format options helpers
	// ==========================================================================
	function parseOptionsFromField(): string {
		const opts = field.field_options?.options as FieldOption[] | string[] | undefined;
		if (!opts || opts.length === 0) return '';

		return opts.map(opt => {
			if (typeof opt === 'string') return opt;
			if (opt.description) return `${opt.label}, ${opt.description}`;
			return opt.label;
		}).join('\n');
	}

	function parseOptionsText(text: string): FieldOption[] {
		const seen = new Set<string>();
		return text
			.split('\n')
			.map(line => line.trim())
			.filter(line => line.length > 0)
			.map(line => {
				const commaIndex = line.indexOf(',');
				if (commaIndex === -1) {
					return { label: line };
				}
				const label = line.substring(0, commaIndex).trim();
				const description = line.substring(commaIndex + 1).trim();
				return { label, description: description || undefined };
			})
			.filter(opt => {
				if (seen.has(opt.label)) return false;
				seen.add(opt.label);
				return true;
			});
	}

	// ==========================================================================
	// Sync from props when field changes
	// ==========================================================================
	$effect(() => {
		label = field.field_label;
		placeholder = field.placeholder || '';
		helpText = field.help_text || '';
		isRequired = field.is_required || false;
		optionsText = parseOptionsFromField();

		// Text validation
		const textVal = field.validation_rules as TextValidation | undefined;
		textMinLength = textVal?.minLength;
		textMaxLength = textVal?.maxLength;
		textPattern = textVal?.pattern || '';

		// Number validation
		const numVal = field.validation_rules as NumberValidation | undefined;
		numberMin = numVal?.min;
		numberMax = numVal?.max;
		numberStep = numVal?.step;

		// Date options
		const dateOpts = field.field_options as DateFieldOptions | undefined;
		dateMode = dateOpts?.date_mode || 'date';
		prefillNow = dateOpts?.prefill_now || false;

		// File options
		const fileOpts = field.field_options as FileFieldOptions | undefined;
		if (fileOpts?.allowed_file_types?.length) {
			// Determine preset from types
			const types = fileOpts.allowed_file_types;
			if (types.includes('.jpg') || types.includes('.png')) {
				fileTypes = 'images';
			} else if (types.includes('.pdf') || types.includes('.doc')) {
				fileTypes = 'documents';
			} else {
				fileTypes = 'all';
			}
		} else {
			fileTypes = 'all';
		}
		maxFiles = fileOpts?.max_files || 1;

		// Multiple choice validation
		const mcVal = field.validation_rules as MultipleChoiceValidation | undefined;
		minSelections = mcVal?.minSelections;
		maxSelections = mcVal?.maxSelections;
	});

	// ==========================================================================
	// Handlers
	// ==========================================================================
	function handleLabelBlur() {
		if (label !== field.field_label && label.trim()) {
			onUpdate?.({ field_label: label.trim() });
		}
	}

	function handlePlaceholderBlur() {
		if (placeholder !== (field.placeholder || '')) {
			onUpdate?.({ placeholder: placeholder || undefined });
		}
	}

	function handleHelpTextBlur() {
		if (helpText !== (field.help_text || '')) {
			onUpdate?.({ help_text: helpText || undefined });
		}
	}

	function handleRequiredChange(checked: boolean) {
		isRequired = checked;
		onUpdate?.({ is_required: checked });
	}

	function handleOptionsTextBlur() {
		const options = parseOptionsText(optionsText);
		onUpdate?.({
			field_options: {
				...field.field_options,
				options
			}
		});
	}

	function handleTextValidationBlur() {
		const validation: TextValidation = {};
		if (textMinLength !== undefined) validation.minLength = textMinLength;
		if (textMaxLength !== undefined) validation.maxLength = textMaxLength;
		if (textPattern) validation.pattern = textPattern;

		onUpdate?.({ validation_rules: (Object.keys(validation).length > 0 ? validation : undefined) as Record<string, unknown> | undefined });
	}

	function handleNumberValidationBlur() {
		const validation: NumberValidation = {};
		if (numberMin !== undefined) validation.min = numberMin;
		if (numberMax !== undefined) validation.max = numberMax;
		if (numberStep !== undefined) validation.step = numberStep;

		onUpdate?.({ validation_rules: (Object.keys(validation).length > 0 ? validation : undefined) as Record<string, unknown> | undefined });
	}

	function handleDateModeChange(value: string | undefined) {
		if (!value) return;
		dateMode = value as 'date' | 'datetime' | 'time';
		emitDateOptions();
	}

	function emitDateOptions() {
		onUpdate?.({
			field_options: {
				...field.field_options,
				date_mode: dateMode,
				prefill_now: prefillNow
			}
		});
	}

	function handlePrefillNowChange(checked: boolean) {
		prefillNow = checked;
		emitDateOptions();
	}

	function handleFileTypesChange(value: string) {
		fileTypes = value;
		let allowed_file_types: string[] | undefined;

		if (value === 'images') {
			allowed_file_types = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
		} else if (value === 'documents') {
			allowed_file_types = ['.pdf', '.doc', '.docx', '.txt'];
		} else {
			allowed_file_types = undefined;
		}

		onUpdate?.({
			field_options: {
				...field.field_options,
				allowed_file_types,
				max_files: maxFiles
			}
		});
	}

	function handleMaxFilesBlur() {
		const fileOpts = field.field_options as FileFieldOptions | undefined;
		onUpdate?.({
			field_options: {
				...field.field_options,
				allowed_file_types: fileOpts?.allowed_file_types,
				max_files: maxFiles
			}
		});
	}

	function handleMultipleChoiceValidationBlur() {
		const validation: MultipleChoiceValidation = {};
		if (minSelections !== undefined) validation.minSelections = minSelections;
		if (maxSelections !== undefined) validation.maxSelections = maxSelections;

		onUpdate?.({ validation_rules: (Object.keys(validation).length > 0 ? validation : undefined) as Record<string, unknown> | undefined });
	}

	// ==========================================================================
	// Derived field type checks
	// ==========================================================================
	const hasOptions = $derived(
		field.field_type === 'dropdown' || field.field_type === 'multiple_choice'
	);

	const isSmartDropdown = $derived(field.field_type === 'smart_dropdown');
	const isEntitySelector = $derived(field.field_type === 'custom_table_selector');
	const isTextField = $derived(field.field_type === 'short_text' || field.field_type === 'long_text');
	const isNumberField = $derived(field.field_type === 'number');
	const isDateField = $derived(field.field_type === 'date');
	const isFileField = $derived(field.field_type === 'file');
	const isMultipleChoice = $derived(field.field_type === 'multiple_choice');
	const isShortText = $derived(field.field_type === 'short_text');

	// Handler for entity selector config updates
	function handleEntitySelectorUpdate(options: EntitySelectorOptions) {
		onUpdate?.({ field_options: options as unknown as Record<string, unknown> });
	}
</script>

<div class="field-config-panel">
	<!-- Header -->
	<div class="config-header">
		<button class="back-button" onclick={onClose} type="button">
			<ArrowLeft class="h-4 w-4" />
		</button>
		<div class="header-info">
			<div class="field-type-badge">
				<Icon class="h-4 w-4" />
			</div>
			<span class="field-type-label">{fieldTypeLabels[field.field_type]}</span>
		</div>
	</div>

	<!-- Config sections -->
	<div class="config-content">
		<!-- Basic settings -->
		<div class="config-section">
			<Label for="field-label">{m.formEditorFieldConfigLabel?.() ?? 'Label'}</Label>
			<Input
				id="field-label"
				bind:value={label}
				onblur={handleLabelBlur}
				placeholder={m.formEditorFieldConfigLabelPlaceholder?.() ?? 'Field label...'}
			/>
		</div>

		<div class="config-section">
			<Label for="field-placeholder">{m.formEditorFieldConfigPlaceholder?.() ?? 'Placeholder'}</Label>
			<Input
				id="field-placeholder"
				bind:value={placeholder}
				onblur={handlePlaceholderBlur}
				placeholder={m.formEditorFieldConfigPlaceholderText?.() ?? 'Placeholder text...'}
			/>
		</div>

		<div class="config-section">
			<Label for="field-help">{m.formEditorFieldConfigHelpText?.() ?? 'Help Text'}</Label>
			<Textarea
				id="field-help"
				bind:value={helpText}
				onblur={handleHelpTextBlur}
				placeholder={m.formEditorFieldConfigHelpTextPlaceholder?.() ?? 'Help text for users...'}
				rows={2}
			/>
		</div>

		<div class="config-row">
			<div class="switch-field">
				<Switch
					id="field-required"
					checked={isRequired}
					onCheckedChange={handleRequiredChange}
				/>
				<Label for="field-required">{m.formEditorFieldConfigRequired?.() ?? 'Required'}</Label>
			</div>
		</div>

		<!-- Text Field Validation -->
		{#if isTextField}
			<div class="config-section">
				<Label>{m.formEditorFieldConfigValidation?.() ?? 'Validation'}</Label>
				<div class="validation-grid">
					<div class="validation-field">
						<Label for="min-length">{m.formEditorFieldConfigMinLength?.() ?? 'Min Length'}</Label>
						<Input
							id="min-length"
							type="number"
							min={0}
							bind:value={textMinLength}
							onblur={handleTextValidationBlur}
							placeholder="0"
						/>
					</div>
					<div class="validation-field">
						<Label for="max-length">{m.formEditorFieldConfigMaxLength?.() ?? 'Max Length'}</Label>
						<Input
							id="max-length"
							type="number"
							min={0}
							bind:value={textMaxLength}
							onblur={handleTextValidationBlur}
							placeholder={m.formEditorFieldConfigNoLimit?.() ?? 'No limit'}
						/>
					</div>
				</div>
				{#if isShortText}
					<div class="config-section-inner">
						<Label for="pattern">{m.formEditorFieldConfigRegexPattern?.() ?? 'Regex Pattern'}</Label>
						<Input
							id="pattern"
							bind:value={textPattern}
							onblur={handleTextValidationBlur}
							placeholder="e.g. ^[a-zA-Z]+$"
						/>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Number Field Validation -->
		{#if isNumberField}
			<div class="config-section">
				<Label>{m.formEditorFieldConfigValidation?.() ?? 'Validation'}</Label>
				<div class="validation-grid">
					<div class="validation-field">
						<Label for="num-min">{m.formEditorFieldConfigMin?.() ?? 'Min'}</Label>
						<Input
							id="num-min"
							type="number"
							bind:value={numberMin}
							onblur={handleNumberValidationBlur}
							placeholder={m.formEditorFieldConfigNoMin?.() ?? 'No min'}
						/>
					</div>
					<div class="validation-field">
						<Label for="num-max">{m.formEditorFieldConfigMax?.() ?? 'Max'}</Label>
						<Input
							id="num-max"
							type="number"
							bind:value={numberMax}
							onblur={handleNumberValidationBlur}
							placeholder={m.formEditorFieldConfigNoMax?.() ?? 'No max'}
						/>
					</div>
					<div class="validation-field">
						<Label for="num-step">{m.formEditorFieldConfigStep?.() ?? 'Step'}</Label>
						<Input
							id="num-step"
							type="number"
							min={0}
							step="any"
							bind:value={numberStep}
							onblur={handleNumberValidationBlur}
							placeholder="1"
						/>
					</div>
				</div>
			</div>
		{/if}

		<!-- Date Field Options -->
		{#if isDateField}
			<div class="config-section">
				<Label>{m.formEditorFieldConfigDateMode?.() ?? 'Date Mode'}</Label>
				<RadioGroup.Root bind:value={dateMode} onValueChange={handleDateModeChange} class="radio-group">
					<div class="radio-option">
						<RadioGroup.Item value="date" id="date-only" />
						<Label for="date-only">{m.formEditorFieldConfigDateOnly?.() ?? 'Date only'}</Label>
					</div>
					<div class="radio-option">
						<RadioGroup.Item value="datetime" id="datetime" />
						<Label for="datetime">{m.formEditorFieldConfigDateAndTime?.() ?? 'Date and Time'}</Label>
					</div>
					<div class="radio-option">
						<RadioGroup.Item value="time" id="time-only" />
						<Label for="time-only">{m.formEditorFieldConfigTimeOnly?.() ?? 'Time only'}</Label>
					</div>
				</RadioGroup.Root>
			</div>
			<div class="config-row">
				<div class="switch-field">
					<Switch
						id="prefill-now"
						checked={prefillNow}
						onCheckedChange={handlePrefillNowChange}
					/>
					<Label for="prefill-now">{m.formEditorFieldConfigPrefillNow?.() ?? 'Prefill with current date/time'}</Label>
				</div>
			</div>
		{/if}

		<!-- File Field Options -->
		{#if isFileField}
			<div class="config-section">
				<Label for="file-types">{m.formEditorFieldConfigAllowedFileTypes?.() ?? 'Allowed File Types'}</Label>
				<select
					id="file-types"
					class="native-select"
					value={fileTypes}
					onchange={(e) => handleFileTypesChange(e.currentTarget.value)}
				>
					<option value="all">{m.formEditorFieldConfigAllFiles?.() ?? 'All files'}</option>
					<option value="images">{m.formEditorFieldConfigImagesOnly?.() ?? 'Images only (.jpg, .png, .gif, .webp)'}</option>
					<option value="documents">{m.formEditorFieldConfigDocumentsOnly?.() ?? 'Documents only (.pdf, .doc, .txt)'}</option>
				</select>
			</div>
			<div class="config-section">
				<Label for="max-files">{m.formEditorFieldConfigMaxFiles?.() ?? 'Max Files'}</Label>
				<Input
					id="max-files"
					type="number"
					min={1}
					bind:value={maxFiles}
					onblur={handleMaxFilesBlur}
				/>
			</div>
		{/if}

		<!-- Dropdown/Multiple Choice Options (textarea) -->
		{#if hasOptions}
			<div class="config-section">
				<Label for="options-textarea">{m.formEditorFieldConfigOptionsLabel?.() ?? 'Options (one per line)'}</Label>
				<Textarea
					id="options-textarea"
					bind:value={optionsText}
					onblur={handleOptionsTextBlur}
					placeholder={m.formEditorFieldConfigOptionsPlaceholder?.() ?? `Option 1\nOption 2\nOption 3, with explanation\nOption 4, to help users select`}
					rows={5}
				/>
				<p class="config-hint">{m.formEditorFieldConfigOptionsHint?.() ?? 'One option per line. Use comma to add explanation: "Answer, explanation text"'}</p>
			</div>

			{#if isMultipleChoice}
				<div class="config-section">
					<Label>{m.formEditorFieldConfigSelectionLimits?.() ?? 'Selection Limits'}</Label>
					<div class="validation-grid">
						<div class="validation-field">
							<Label for="min-sel">{m.formEditorFieldConfigMinSelections?.() ?? 'Min Selections'}</Label>
							<Input
								id="min-sel"
								type="number"
								min={0}
								bind:value={minSelections}
								onblur={handleMultipleChoiceValidationBlur}
								placeholder="0"
							/>
						</div>
						<div class="validation-field">
							<Label for="max-sel">{m.formEditorFieldConfigMaxSelections?.() ?? 'Max Selections'}</Label>
							<Input
								id="max-sel"
								type="number"
								min={1}
								bind:value={maxSelections}
								onblur={handleMultipleChoiceValidationBlur}
								placeholder={m.formEditorFieldConfigNoLimit?.() ?? 'No limit'}
							/>
						</div>
					</div>
				</div>
			{/if}
		{/if}

		<!-- Smart Dropdown Config -->
		{#if isSmartDropdown}
			<SmartDropdownConfig
				fieldOptions={field.field_options}
				{ancestorFields}
				onUpdate={(config) => {
					onUpdate?.({
						field_options: {
							...field.field_options,
							...config
						}
					});
				}}
			/>
		{/if}

		<!-- Entity Selector Config (Custom Table Selector) -->
		{#if isEntitySelector}
			<EntitySelectorConfig
				fieldOptions={field.field_options}
				{roles}
				onUpdate={handleEntitySelectorUpdate}
			/>
		{/if}
	</div>

	<!-- Footer with delete -->
	<div class="config-footer">
		<Button variant="destructive" size="sm" onclick={onDelete}>
			<Trash2 class="h-4 w-4 mr-1" />
			{m.formEditorFieldConfigDeleteField?.() ?? 'Delete Field'}
		</Button>
	</div>
</div>

<style>
	.field-config-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: hsl(var(--card));
		overflow: hidden;
	}

	.config-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		border-bottom: 1px solid hsl(var(--border));
		flex-shrink: 0;
	}

	.back-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: transparent;
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		cursor: pointer;
		color: hsl(var(--muted-foreground));
		transition: all 0.15s ease;
	}

	.back-button:hover {
		background: hsl(var(--accent));
		color: hsl(var(--foreground));
		border-color: hsl(var(--primary));
	}

	.header-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
		min-width: 0;
	}

	.field-type-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: hsl(var(--primary) / 0.1);
		border-radius: 0.375rem;
		color: hsl(var(--primary));
		flex-shrink: 0;
	}

	.field-type-label {
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.config-content {
		flex: 1;
		overflow-y: auto;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	.config-section {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.config-section :global(label) {
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
	}

	.config-row {
		display: flex;
		gap: 1rem;
	}

	.switch-field {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.switch-field :global(label) {
		font-size: 0.8125rem;
		color: hsl(var(--foreground));
	}

	.validation-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
	}

	.validation-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.validation-field :global(label) {
		font-size: 0.6875rem;
	}

	.validation-field :global(input) {
		height: 32px;
	}

	.config-section-inner {
		margin-top: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.config-hint {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		margin: 0.25rem 0 0 0;
	}

	:global(.radio-group) {
		display: flex;
		flex-direction: column;
		gap: 0.375rem !important;
	}

	.radio-option {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.radio-option :global(label) {
		font-size: 0.8125rem !important;
		color: hsl(var(--foreground)) !important;
		cursor: pointer;
		margin: 0;
	}

	.native-select {
		width: 100%;
		height: 36px;
		padding: 0 0.75rem;
		background: hsl(var(--background));
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		font-size: 0.8125rem;
		color: hsl(var(--foreground));
		cursor: pointer;
		/* Ensure options are also styled */
		color-scheme: light dark;
	}

	.native-select option {
		background: hsl(var(--background));
		color: hsl(var(--foreground));
	}

	.native-select:hover {
		border-color: hsl(var(--primary));
	}

	.native-select:focus {
		outline: none;
		border-color: hsl(var(--primary));
		box-shadow: 0 0 0 2px hsl(var(--primary) / 0.2);
	}

	:global(.dark) .native-select {
		background: hsl(var(--background));
		color: hsl(var(--foreground));
	}

	.config-footer {
		padding: 0.75rem;
		border-top: 1px solid hsl(var(--border));
		flex-shrink: 0;
	}

	.config-footer :global(button) {
		width: 100%;
	}
</style>
