<script lang="ts">
	import { Plus, X, ChevronDown } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	import type { ToolsFormField, WorkflowStage, ToolsForm } from '$lib/workflow-builder';

	type AncestorFieldGroup = {
		stage: WorkflowStage;
		form: ToolsForm;
		fields: ToolsFormField[];
	};

	type SmartDropdownMapping = {
		sourceValue: string;
		options: string[];
	};

	type SmartDropdownConfig = {
		sourceFieldId?: string;
		mappings: SmartDropdownMapping[];
	};

	type Props = {
		/** Current field options containing smart dropdown config */
		fieldOptions?: Record<string, unknown>;
		/** Available ancestor fields grouped by stage/form */
		ancestorFields: AncestorFieldGroup[];
		/** Callback when config changes */
		onUpdate?: (config: SmartDropdownConfig) => void;
	};

	let { fieldOptions, ancestorFields, onUpdate }: Props = $props();

	// Parse existing config from field_options
	const existingConfig = $derived(
		(fieldOptions?.smartDropdown as SmartDropdownConfig) || {
			sourceFieldId: undefined,
			mappings: []
		}
	);

	// Local state
	let sourceFieldId = $state<string | undefined>(existingConfig.sourceFieldId);
	let mappings = $state<SmartDropdownMapping[]>(existingConfig.mappings || []);
	let sourceDropdownOpen = $state(false);

	// Sync from props when fieldOptions changes
	$effect(() => {
		const config = (fieldOptions?.smartDropdown as SmartDropdownConfig) || {
			sourceFieldId: undefined,
			mappings: []
		};
		sourceFieldId = config.sourceFieldId;
		mappings = config.mappings || [];
	});

	// Find the selected source field info
	const selectedSourceField = $derived.by(() => {
		if (!sourceFieldId) return null;
		for (const group of ancestorFields) {
			const field = group.fields.find((f) => f.id === sourceFieldId);
			if (field) {
				return { field, stage: group.stage, form: group.form };
			}
		}
		return null;
	});

	function handleSourceFieldSelect(fieldId: string) {
		sourceFieldId = fieldId;
		sourceDropdownOpen = false;
		emitUpdate();
	}

	function clearSourceField() {
		sourceFieldId = undefined;
		mappings = [];
		emitUpdate();
	}

	function addMapping() {
		mappings = [...mappings, { sourceValue: '', options: [''] }];
		emitUpdate();
	}

	function removeMapping(index: number) {
		mappings = mappings.filter((_, i) => i !== index);
		emitUpdate();
	}

	function updateMappingSourceValue(index: number, value: string) {
		mappings[index].sourceValue = value;
		mappings = [...mappings];
		emitUpdate();
	}

	function updateMappingOption(mappingIndex: number, optionIndex: number, value: string) {
		mappings[mappingIndex].options[optionIndex] = value;
		mappings = [...mappings];
		emitUpdate();
	}

	function addMappingOption(mappingIndex: number) {
		mappings[mappingIndex].options = [...mappings[mappingIndex].options, ''];
		mappings = [...mappings];
		emitUpdate();
	}

	function removeMappingOption(mappingIndex: number, optionIndex: number) {
		mappings[mappingIndex].options = mappings[mappingIndex].options.filter(
			(_, i) => i !== optionIndex
		);
		mappings = [...mappings];
		emitUpdate();
	}

	function emitUpdate() {
		onUpdate?.({
			sourceFieldId,
			mappings: mappings.filter((m) => m.sourceValue.trim())
		});
	}
</script>

<div class="smart-dropdown-config">
	<!-- Source Field Selection -->
	<div class="config-section">
		<Label>Source Field</Label>
		<p class="config-hint">
			Select a field from an earlier stage. Options will change based on its value.
		</p>

		{#if ancestorFields.length === 0}
			<p class="no-fields-message">
				No ancestor fields available. Add forms to earlier stages first.
			</p>
		{:else}
			<div class="source-field-selector">
				{#if selectedSourceField}
					<div class="selected-source">
						<div class="source-info">
							<span class="source-stage">{selectedSourceField.stage.stage_name}</span>
							<span class="source-separator">/</span>
							<span class="source-field">{selectedSourceField.field.field_label}</span>
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
						{#each ancestorFields as group (group.form.id)}
							<div class="field-group">
								<div class="group-header">
									<span class="group-stage">{group.stage.stage_name}</span>
									<span class="group-form">{group.form.name}</span>
								</div>
								{#each group.fields as field (field.id)}
									<button
										class="field-option"
										class:selected={sourceFieldId === field.id}
										onclick={() => handleSourceFieldSelect(field.id)}
										type="button"
									>
										{field.field_label}
										<span class="field-type">{field.field_type}</span>
									</button>
								{/each}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Mappings -->
	{#if sourceFieldId}
		<div class="config-section">
			<Label>Value Mappings</Label>
			<p class="config-hint">
				Define which options to show based on the source field value.
			</p>

			<div class="mappings-list">
				{#each mappings as mapping, mappingIndex (mappingIndex)}
					<div class="mapping-item">
						<div class="mapping-header">
							<Label>When value is:</Label>
							<button
								class="remove-mapping"
								onclick={() => removeMapping(mappingIndex)}
								type="button"
							>
								<X class="h-3 w-3" />
							</button>
						</div>
						<Input
							value={mapping.sourceValue}
							oninput={(e) => updateMappingSourceValue(mappingIndex, e.currentTarget.value)}
							placeholder="Source value..."
						/>

						<Label class="options-label">Show these options:</Label>
						<div class="mapping-options">
							{#each mapping.options as option, optionIndex (optionIndex)}
								<div class="option-row">
									<Input
										value={option}
										oninput={(e) =>
											updateMappingOption(mappingIndex, optionIndex, e.currentTarget.value)}
										placeholder="Option..."
									/>
									<button
										class="remove-option"
										onclick={() => removeMappingOption(mappingIndex, optionIndex)}
										type="button"
										disabled={mapping.options.length <= 1}
									>
										<X class="h-3 w-3" />
									</button>
								</div>
							{/each}
							<Button
								variant="ghost"
								size="sm"
								onclick={() => addMappingOption(mappingIndex)}
								class="add-option-btn"
							>
								<Plus class="h-3 w-3 mr-1" />
								Add Option
							</Button>
						</div>
					</div>
				{/each}

				<Button variant="outline" size="sm" onclick={addMapping} class="add-mapping-btn">
					<Plus class="h-4 w-4 mr-1" />
					Add Mapping
				</Button>
			</div>
		</div>
	{/if}
</div>

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

	.field-group {
		border-bottom: 1px solid hsl(var(--border));
	}

	.field-group:last-child {
		border-bottom: none;
	}

	.group-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.5rem;
		background: hsl(var(--muted) / 0.5);
		font-size: 0.6875rem;
	}

	.group-stage {
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.group-form {
		color: hsl(var(--muted-foreground));
	}

	.field-option {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.375rem 0.5rem;
		background: transparent;
		border: none;
		cursor: pointer;
		font-size: 0.75rem;
		text-align: left;
	}

	.field-option:hover {
		background: hsl(var(--accent));
	}

	.field-option.selected {
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary));
	}

	.field-type {
		font-size: 0.625rem;
		color: hsl(var(--muted-foreground));
		padding: 0.125rem 0.25rem;
		background: hsl(var(--muted));
		border-radius: 0.25rem;
	}

	.mappings-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.mapping-item {
		padding: 0.5rem;
		background: hsl(var(--muted) / 0.3);
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
	}

	.mapping-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.25rem;
	}

	.mapping-header :global(label) {
		font-size: 0.6875rem;
	}

	.remove-mapping {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		background: transparent;
		border: none;
		border-radius: 0.25rem;
		cursor: pointer;
		color: hsl(var(--muted-foreground));
	}

	.remove-mapping:hover {
		background: hsl(var(--destructive) / 0.1);
		color: hsl(var(--destructive));
	}

	.options-label {
		margin-top: 0.5rem;
		margin-bottom: 0.25rem;
	}

	.mapping-options {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.option-row {
		display: flex;
		gap: 0.25rem;
	}

	.option-row :global(input) {
		flex: 1;
		height: 28px;
		font-size: 0.75rem;
	}

	.remove-option {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: transparent;
		border: 1px solid hsl(var(--border));
		border-radius: 0.25rem;
		cursor: pointer;
		color: hsl(var(--muted-foreground));
		flex-shrink: 0;
	}

	.remove-option:hover:not(:disabled) {
		background: hsl(var(--destructive) / 0.1);
		border-color: hsl(var(--destructive));
		color: hsl(var(--destructive));
	}

	.remove-option:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.mapping-options :global(.add-option-btn) {
		align-self: flex-start;
		height: 24px;
		font-size: 0.6875rem;
	}

	.mappings-list :global(.add-mapping-btn) {
		align-self: flex-start;
	}
</style>
