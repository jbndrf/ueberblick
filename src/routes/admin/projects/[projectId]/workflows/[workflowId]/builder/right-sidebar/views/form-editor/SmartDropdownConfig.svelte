<script lang="ts">
	import { X, Settings2, Search } from '@lucide/svelte';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as m from '$lib/paraglide/messages';

	import type {
		ToolsFormField,
		WorkflowStage,
		ToolsForm,
		FieldOption,
		SmartDropdownMapping,
		SmartDropdownFieldOptions
	} from '$lib/workflow-builder';

	import SmartDropdownMappingModal from './SmartDropdownMappingModal.svelte';

	type AncestorFieldGroup = {
		stage: WorkflowStage;
		form: ToolsForm;
		fields: ToolsFormField[];
	};

	type Props = {
		/** Current field options containing smart dropdown config */
		fieldOptions?: Record<string, unknown>;
		/** Available ancestor fields grouped by stage/form */
		ancestorFields: AncestorFieldGroup[];
		/** Callback when config changes */
		onUpdate?: (config: SmartDropdownFieldOptions) => void;
	};

	let { fieldOptions, ancestorFields, onUpdate }: Props = $props();

	// Local state
	let sourceFieldId = $state<string>('');
	let mappings = $state<SmartDropdownMapping[]>([]);
	let pickerOpen = $state(false);
	let modalOpen = $state(false);

	// Track if we've initialized from props
	let initialized = $state(false);

	// ==========================================================================
	// Helpers
	// ==========================================================================

	type EligibleSourceField = {
		field: ToolsFormField;
		stage: WorkflowStage;
		form: ToolsForm;
		options: FieldOption[];
	};

	type EligibleFieldsByStage = {
		stage: WorkflowStage;
		fields: EligibleSourceField[];
	};

	function getEligibleSourceFields(): EligibleSourceField[] {
		const result: EligibleSourceField[] = [];

		for (const group of ancestorFields) {
			for (const field of group.fields) {
				if (field.field_type === 'dropdown' || field.field_type === 'multiple_choice') {
					const rawOptions = field.field_options?.options;
					if (rawOptions && Array.isArray(rawOptions) && rawOptions.length > 0) {
						const options: FieldOption[] = rawOptions.map((opt: string | FieldOption) => {
							if (typeof opt === 'string') return { label: opt };
							return opt;
						});
						result.push({
							field,
							stage: group.stage,
							form: group.form,
							options
						});
					}
				}
			}
		}

		return result;
	}

	const eligibleFields = $derived(getEligibleSourceFields());

	const eligibleByStage = $derived.by((): EligibleFieldsByStage[] => {
		const stageMap = new Map<string, EligibleFieldsByStage>();
		for (const ef of eligibleFields) {
			const key = ef.stage.id;
			if (!stageMap.has(key)) {
				stageMap.set(key, { stage: ef.stage, fields: [] });
			}
			stageMap.get(key)!.fields.push(ef);
		}
		return Array.from(stageMap.values());
	});

	// Find the selected source field and its options
	const selectedSource = $derived.by(() => {
		if (!sourceFieldId) return null;
		return eligibleFields.find((f) => f.field.id === sourceFieldId) || null;
	});

	// Source field options become modal tabs
	const tabOptions = $derived(selectedSource?.options || []);

	// Count configured mappings for summary
	const configuredMappingsCount = $derived(mappings.filter((m) => m.options.length > 0).length);

	// ==========================================================================
	// Initialize from props (only once)
	// ==========================================================================
	$effect(() => {
		if (initialized) return;

		const config = fieldOptions as SmartDropdownFieldOptions | undefined;
		if (config?.source_field) {
			sourceFieldId = config.source_field;
			mappings = config.mappings || [];
		}

		initialized = true;
	});

	// ==========================================================================
	// Handlers
	// ==========================================================================

	function handleSourceFieldSelect(fieldId: string) {
		sourceFieldId = fieldId;
		pickerOpen = false;

		// Clear mappings when source changes
		mappings = [];

		emitUpdate();
	}

	function clearSourceField() {
		sourceFieldId = '';
		mappings = [];
		emitUpdate();
	}

	function handleMappingsUpdate(newMappings: SmartDropdownMapping[]) {
		mappings = newMappings;
		emitUpdate();
	}

	function emitUpdate() {
		onUpdate?.({
			source_field: sourceFieldId,
			mappings: mappings.filter((m) => m.options.length > 0)
		});
	}
</script>

<div class="smart-dropdown-config">
	<!-- Source Field Selection -->
	<div class="config-section">
		<Label>{m.formEditorSmartDropdownConfigSourceFieldLabel?.() ?? 'Source Field'}</Label>
		<p class="config-hint">
			{m.formEditorSmartDropdownConfigSourceFieldHint?.() ?? 'Select a dropdown or multiple choice field. Options will change based on its value.'}
		</p>

		{#if eligibleFields.length === 0}
			<p class="no-fields-message">
				{m.formEditorSmartDropdownConfigNoFields?.() ?? 'No dropdown or multiple choice fields with options found in earlier stages.'}
			</p>
		{:else if selectedSource}
			<div class="selected-source">
				<div class="source-info">
					<span class="source-stage">{selectedSource.stage.stage_name}</span>
					<span class="source-separator">/</span>
					<span class="source-field">{selectedSource.field.field_label}</span>
				</div>
				<button class="clear-source" onclick={clearSourceField} type="button">
					<X class="h-3 w-3" />
				</button>
			</div>
		{:else}
			<Button variant="outline" class="picker-trigger" onclick={() => (pickerOpen = true)}>
				<Search class="h-4 w-4" />
				{m.formEditorSmartDropdownConfigBrowseFields?.() ?? 'Browse available fields'}
			</Button>
		{/if}
	</div>

	<!-- Configure Options Button -->
	{#if selectedSource && tabOptions.length > 0}
		<div class="config-section">
			<Label>{m.formEditorSmartDropdownConfigConditionalOptionsLabel?.() ?? 'Conditional Options'}</Label>
			<p class="config-hint">
				{m.formEditorSmartDropdownConfigConditionalOptionsHint?.() ?? 'Define which options to show for each source value.'}
			</p>

			<Button
				variant="outline"
				class="configure-button"
				onclick={() => (modalOpen = true)}
			>
				<Settings2 class="h-4 w-4" />
				{m.formEditorSmartDropdownConfigConfigureOptions?.() ?? 'Configure Options'}
				{#if configuredMappingsCount > 0}
					<span class="mappings-badge">{configuredMappingsCount}</span>
				{/if}
			</Button>
		</div>
	{/if}
</div>

<!-- Source Field Picker Modal -->
<Dialog.Root bind:open={pickerOpen}>
	<Dialog.Content class="source-picker-modal">
		<Dialog.Header>
			<Dialog.Title>{m.formEditorSmartDropdownConfigPickerTitle?.() ?? 'Choose a source field'}</Dialog.Title>
			<Dialog.Description>
				{m.formEditorSmartDropdownConfigPickerDescription?.() ?? 'Pick a field from an earlier stage. This dropdown\'s choices will change based on what the participant selects there.'}
			</Dialog.Description>
		</Dialog.Header>

		<div class="picker-body">
			{#each eligibleByStage as group (group.stage.id)}
				<div class="picker-stage-group">
					<div class="picker-stage-header">{group.stage.stage_name}</div>
					<div class="picker-fields">
						{#each group.fields as source (source.field.id)}
							<button
								class="picker-field-card"
								class:selected={sourceFieldId === source.field.id}
								onclick={() => handleSourceFieldSelect(source.field.id)}
								type="button"
							>
								<div class="card-header">
									<span class="card-field-name">{source.field.field_label}</span>
									<span class="card-field-type">{source.field.field_type === 'multiple_choice' ? (m.formEditorSmartDropdownConfigTypeMultipleChoice?.() ?? 'Multiple choice') : (m.formEditorSmartDropdownConfigTypeDropdown?.() ?? 'Dropdown')}</span>
								</div>
								<div class="card-options">
									{#each source.options as opt (opt.label)}
										<span class="card-option-tag">{opt.label}</span>
									{/each}
								</div>
							</button>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</Dialog.Content>
</Dialog.Root>

<!-- Mapping Modal -->
<SmartDropdownMappingModal
	bind:open={modalOpen}
	sourceFieldLabel={selectedSource?.field.field_label || ''}
	{tabOptions}
	{mappings}
	onClose={() => (modalOpen = false)}
	onUpdate={handleMappingsUpdate}
/>

<style>
	.smart-dropdown-config {
		display: flex;
		flex-direction: column;
		gap: 1rem;
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

	.config-hint {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	.no-fields-message {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		font-style: italic;
		padding: 0.5rem;
		background: hsl(var(--muted) / 0.5);
		border-radius: 0.25rem;
		margin: 0;
	}

	/* Selected source chip in the sidebar */
	.selected-source {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem;
		background: hsl(var(--primary) / 0.1);
		border: 1px solid hsl(var(--primary) / 0.3);
		border-radius: 0.375rem;
	}

	.source-info {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.8125rem;
		min-width: 0;
	}

	.source-stage {
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.source-separator {
		color: hsl(var(--muted-foreground));
	}

	.source-field {
		font-weight: 500;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.clear-source {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		background: transparent;
		border: none;
		border-radius: 0.25rem;
		cursor: pointer;
		color: hsl(var(--muted-foreground));
		flex-shrink: 0;
	}

	.clear-source:hover {
		background: hsl(var(--destructive) / 0.1);
		color: hsl(var(--destructive));
	}

	/* Picker trigger button */
	:global(.picker-trigger) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		justify-content: center;
	}

	/* Source picker modal */
	:global(.source-picker-modal) {
		max-width: 560px !important;
		width: 100% !important;
	}

	.picker-body {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-height: 400px;
		overflow-y: auto;
	}

	.picker-stage-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.picker-stage-header {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: hsl(var(--muted-foreground));
	}

	.picker-fields {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.picker-field-card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: 100%;
		padding: 0.75rem;
		background: hsl(var(--background));
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		cursor: pointer;
		text-align: left;
		transition: border-color 0.15s ease, background 0.15s ease;
	}

	.picker-field-card:hover {
		border-color: hsl(var(--primary) / 0.5);
		background: hsl(var(--accent) / 0.5);
	}

	.picker-field-card.selected {
		border-color: hsl(var(--primary));
		background: hsl(var(--primary) / 0.08);
	}

	.card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.card-field-name {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.card-field-type {
		font-size: 0.625rem;
		color: hsl(var(--muted-foreground));
		padding: 0.125rem 0.375rem;
		background: hsl(var(--muted));
		border-radius: 0.25rem;
		white-space: nowrap;
	}

	.card-options {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.card-option-tag {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		padding: 0.125rem 0.5rem;
		background: hsl(var(--muted) / 0.7);
		border-radius: 9999px;
	}

	/* Configure button */
	:global(.configure-button) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		justify-content: center;
	}

	.mappings-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.25rem;
		height: 1.25rem;
		padding: 0 0.375rem;
		font-size: 0.6875rem;
		font-weight: 600;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border-radius: 9999px;
	}
</style>
