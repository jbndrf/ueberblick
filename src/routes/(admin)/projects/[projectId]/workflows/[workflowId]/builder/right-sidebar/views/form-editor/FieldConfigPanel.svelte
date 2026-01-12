<script lang="ts">
	import { ArrowLeft, Trash2, Plus, X } from 'lucide-svelte';
	import { Type } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Textarea } from '$lib/components/ui/textarea';
	import SmartDropdownConfig from './SmartDropdownConfig.svelte';

	import {
		fieldTypeIcons,
		fieldTypeLabels,
		type ToolsFormField,
		type ToolsForm,
		type WorkflowStage
	} from '$lib/workflow-builder';

	type AncestorFieldGroup = {
		stage: WorkflowStage;
		form: ToolsForm;
		fields: ToolsFormField[];
	};

	type Props = {
		field: ToolsFormField;
		/** Ancestor fields for smart dropdown configuration */
		ancestorFields?: AncestorFieldGroup[];
		onUpdate?: (updates: Partial<ToolsFormField>) => void;
		onDelete?: () => void;
		onClose?: () => void;
	};

	let { field, ancestorFields = [], onUpdate, onDelete, onClose }: Props = $props();

	const Icon = $derived(fieldTypeIcons[field.field_type] || Type);

	// Local state for editing
	let label = $state(field.field_label);
	let placeholder = $state(field.placeholder || '');
	let helpText = $state(field.help_text || '');
	let isRequired = $state(field.is_required || false);

	// Dropdown options (stored in field_options)
	let options = $state<string[]>(
		(field.field_options?.options as string[]) || ['Option 1', 'Option 2']
	);

	// Sync from props when field changes
	$effect(() => {
		label = field.field_label;
		placeholder = field.placeholder || '';
		helpText = field.help_text || '';
		isRequired = field.is_required || false;
		options = (field.field_options?.options as string[]) || ['Option 1', 'Option 2'];
	});

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

	function handleOptionChange(index: number, value: string) {
		const newOptions = [...options];
		newOptions[index] = value;
		options = newOptions;
	}

	function handleOptionBlur() {
		onUpdate?.({
			field_options: {
				...field.field_options,
				options: options.filter((o) => o.trim())
			}
		});
	}

	function addOption() {
		options = [...options, `Option ${options.length + 1}`];
		handleOptionBlur();
	}

	function removeOption(index: number) {
		options = options.filter((_, i) => i !== index);
		handleOptionBlur();
	}

	const hasOptions = $derived(
		field.field_type === 'dropdown' || field.field_type === 'multiple_choice'
	);

	const isSmartDropdown = $derived(field.field_type === 'smart_dropdown');
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
			<Label for="field-label">Label</Label>
			<Input
				id="field-label"
				bind:value={label}
				onblur={handleLabelBlur}
				placeholder="Field label..."
			/>
		</div>

		<div class="config-section">
			<Label for="field-placeholder">Placeholder</Label>
			<Input
				id="field-placeholder"
				bind:value={placeholder}
				onblur={handlePlaceholderBlur}
				placeholder="Placeholder text..."
			/>
		</div>

		<div class="config-section">
			<Label for="field-help">Help Text</Label>
			<Textarea
				id="field-help"
				bind:value={helpText}
				onblur={handleHelpTextBlur}
				placeholder="Help text for users..."
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
				<Label for="field-required">Required</Label>
			</div>
		</div>

		<!-- Dropdown/Multiple Choice Options -->
		{#if hasOptions}
			<div class="config-section">
				<Label>Options</Label>
				<div class="options-list">
					{#each options as option, index (index)}
						<div class="option-row">
							<Input
								value={option}
								oninput={(e) => handleOptionChange(index, e.currentTarget.value)}
								onblur={handleOptionBlur}
								placeholder="Option..."
							/>
							<button
								class="remove-option"
								onclick={() => removeOption(index)}
								type="button"
								disabled={options.length <= 1}
							>
								<X class="h-4 w-4" />
							</button>
						</div>
					{/each}
					<Button variant="outline" size="sm" onclick={addOption} class="add-option-btn">
						<Plus class="h-4 w-4 mr-1" />
						Add Option
					</Button>
				</div>
			</div>
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
							smartDropdown: config
						}
					});
				}}
			/>
		{/if}
	</div>

	<!-- Footer with delete -->
	<div class="config-footer">
		<Button variant="destructive" size="sm" onclick={onDelete}>
			<Trash2 class="h-4 w-4 mr-1" />
			Delete Field
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

	.options-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.option-row {
		display: flex;
		gap: 0.5rem;
	}

	.option-row :global(input) {
		flex: 1;
	}

	.remove-option {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: transparent;
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		cursor: pointer;
		color: hsl(var(--muted-foreground));
		flex-shrink: 0;
		transition: all 0.15s ease;
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

	.config-section :global(.add-option-btn) {
		align-self: flex-start;
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
