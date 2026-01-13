<script lang="ts">
	import { ChevronDown, X, Settings2 } from 'lucide-svelte';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';

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
	let sourceDropdownOpen = $state(false);
	let modalOpen = $state(false);

	// Track if we've initialized from props
	let initialized = $state(false);

	// ==========================================================================
	// Helpers
	// ==========================================================================

	// Get fields that can be used as source (dropdown or multiple_choice with options)
	function getEligibleSourceFields(): Array<{
		field: ToolsFormField;
		stage: WorkflowStage;
		form: ToolsForm;
		options: FieldOption[];
	}> {
		const result: Array<{
			field: ToolsFormField;
			stage: WorkflowStage;
			form: ToolsForm;
			options: FieldOption[];
		}> = [];

		for (const group of ancestorFields) {
			for (const field of group.fields) {
				if (field.field_type === 'dropdown' || field.field_type === 'multiple_choice') {
					const rawOptions = field.field_options?.options;
					if (rawOptions && Array.isArray(rawOptions) && rawOptions.length > 0) {
						// Normalize options to FieldOption[]
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
		sourceDropdownOpen = false;

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
		<Label>Source Field</Label>
		<p class="config-hint">
			Select a dropdown or multiple choice field. Options will change based on its value.
		</p>

		{#if eligibleFields.length === 0}
			<p class="no-fields-message">
				No dropdown or multiple choice fields with options found in earlier stages.
			</p>
		{:else}
			<div class="source-field-selector">
				{#if selectedSource}
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
					<button
						class="source-dropdown-trigger"
						onclick={() => (sourceDropdownOpen = !sourceDropdownOpen)}
						type="button"
					>
						<span class="placeholder">Select source field...</span>
						<ChevronDown class="h-4 w-4" />
					</button>
				{/if}

				{#if sourceDropdownOpen}
					<div class="source-dropdown">
						{#each eligibleFields as source (source.field.id)}
							<button
								class="field-option"
								class:selected={sourceFieldId === source.field.id}
								onclick={() => handleSourceFieldSelect(source.field.id)}
								type="button"
							>
								<div class="field-option-info">
									<span class="field-stage">{source.stage.stage_name}</span>
									<span class="field-name">{source.field.field_label}</span>
								</div>
								<span class="field-count">{source.options.length} options</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Configure Options Button -->
	{#if selectedSource && tabOptions.length > 0}
		<div class="config-section">
			<Label>Conditional Options</Label>
			<p class="config-hint">
				Define which options to show for each source value.
			</p>

			<Button
				variant="outline"
				class="configure-button"
				onclick={() => (modalOpen = true)}
			>
				<Settings2 class="h-4 w-4" />
				Configure Options
				{#if configuredMappingsCount > 0}
					<span class="mappings-badge">{configuredMappingsCount}</span>
				{/if}
			</Button>
		</div>
	{/if}
</div>

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

	.source-field-selector {
		position: relative;
	}

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

	.source-dropdown-trigger {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.5rem;
		background: hsl(var(--background));
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		cursor: pointer;
		font-size: 0.8125rem;
	}

	.source-dropdown-trigger:hover {
		border-color: hsl(var(--primary));
	}

	.placeholder {
		color: hsl(var(--muted-foreground));
	}

	.source-dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		max-height: 200px;
		overflow-y: auto;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		box-shadow: 0 4px 12px hsl(var(--foreground) / 0.1);
		z-index: 50;
		margin-top: 0.25rem;
	}

	.field-option {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.5rem;
		background: transparent;
		border: none;
		border-bottom: 1px solid hsl(var(--border));
		cursor: pointer;
		font-size: 0.75rem;
		text-align: left;
	}

	.field-option:last-child {
		border-bottom: none;
	}

	.field-option:hover {
		background: hsl(var(--accent));
	}

	.field-option.selected {
		background: hsl(var(--primary) / 0.1);
	}

	.field-option-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.field-stage {
		font-size: 0.625rem;
		color: hsl(var(--muted-foreground));
	}

	.field-name {
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.field-count {
		font-size: 0.625rem;
		color: hsl(var(--muted-foreground));
		padding: 0.125rem 0.375rem;
		background: hsl(var(--muted));
		border-radius: 0.25rem;
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
