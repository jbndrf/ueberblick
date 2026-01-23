<script lang="ts">
	/**
	 * EditFieldsTool
	 *
	 * Edits existing field values using FormRenderer in edit mode.
	 * Only shows fields that are marked as editable in the tool config.
	 * Supports tabbed UI when fields come from multiple stages.
	 * Designed to be rendered within a ModuleShell.
	 */
	import { onMount } from 'svelte';
	import { FormRenderer } from '$lib/components/form-renderer';
	import { Button } from '$lib/components/ui/button';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Save, X, Loader2 } from 'lucide-svelte';
	import { getParticipantGateway } from '$lib/participant-state/context.svelte';
	import type { FormFieldWithValue } from '$lib/components/form-renderer';
	import type { ToolEdit, FormField, FieldValue, EditableFieldsByStage } from '../state.svelte';

	// ==========================================================================
	// Props
	// ==========================================================================

	interface Props {
		/** The edit tool configuration */
		editTool: ToolEdit;
		/** The instance ID being edited */
		instanceId: string;
		/** Existing field values (from state) */
		existingFieldValues: FieldValue[];
		/** Available form fields (from state) */
		formFields: FormField[];
		/** Fields grouped by stage (for tabbed UI) */
		groupedFields?: EditableFieldsByStage[];
		/** Initial active stage tab (to preserve selection from view mode) */
		initialActiveStageId?: string;
		/** Called when edit is saved successfully */
		onSave: (values: Record<string, unknown>) => Promise<void>;
		/** Called when user cancels */
		onCancel: () => void;
	}

	let { editTool, instanceId, existingFieldValues, formFields, groupedFields, initialActiveStageId, onSave, onCancel }: Props = $props();

	const gateway = getParticipantGateway();

	// ==========================================================================
	// State
	// ==========================================================================

	let values = $state<Record<string, unknown>>({});
	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let isLoading = $state(true);
	let fileChanges = $state<Record<string, File[]>>({});
	let activeStageTab = $state<string>('');

	// ==========================================================================
	// Derived
	// ==========================================================================

	// Determine if we should use tabbed UI (multiple stages with editable fields)
	const useTabbed = $derived(groupedFields && groupedFields.length > 1);

	// Initialize active tab (run once when groupedFields changes)
	$effect(() => {
		if (groupedFields && groupedFields.length > 0 && !activeStageTab) {
			// Try to use initialActiveStageId if it has editable fields
			const initialHasFields = groupedFields.some(g => g.stageId === initialActiveStageId);
			activeStageTab = initialHasFields && initialActiveStageId
				? initialActiveStageId
				: groupedFields[0].stageId;
		}
	});

	// Helper to attach values to fields
	function attachValuesToFields(fields: FormField[]): FormFieldWithValue[] {
		return fields.map(field => {
			// Get ALL existing values for this field (supports multiple files)
			const fieldValuesForField = existingFieldValues.filter(fv => fv.field_key === field.id);

			// Aggregate all file records
			const storedFiles = fieldValuesForField
				.filter(fv => fv.file_value)
				.map(fv => ({
					recordId: fv.id,
					fileName: fv.file_value
				}));

			// For non-file fields, get the first value
			const firstValue = fieldValuesForField.find(fv => fv.value);

			return {
				...field,
				value: values[field.id] ?? firstValue?.value ?? undefined,
				// Legacy single file support
				fileValue: storedFiles[0]?.fileName || undefined,
				fileRecordId: storedFiles[0]?.recordId || undefined,
				// Multi-file support
				storedFiles: storedFiles.length > 0 ? storedFiles : undefined
			} as FormFieldWithValue;
		});
	}

	// All editable fields (flat list for validation and backward compatibility)
	const editableFields = $derived.by((): FormFieldWithValue[] => {
		const editableFieldIds = editTool.editable_fields || [];
		const filteredFields = formFields.filter(f => editableFieldIds.includes(f.id));
		return attachValuesToFields(filteredFields);
	});

	// Fields grouped by stage with values attached (for tabbed UI)
	const groupedFieldsWithValues = $derived.by(() => {
		if (!groupedFields) return [];
		return groupedFields.map(group => ({
			...group,
			fieldsWithValues: attachValuesToFields(group.fields)
		}));
	});

	const hasFields = $derived(editableFields.length > 0);

	// ==========================================================================
	// Initialization
	// ==========================================================================

	onMount(() => {
		initializeValues();
		isLoading = false;
	});

	function initializeValues() {
		const initialValues: Record<string, unknown> = {};

		// Pre-fill with existing values
		for (const fieldValue of existingFieldValues) {
			// Check if this field is editable
			if (editTool.editable_fields?.includes(fieldValue.field_key)) {
				// Try to parse JSON values (arrays, etc.)
				try {
					if (fieldValue.value.startsWith('[') || fieldValue.value.startsWith('{')) {
						initialValues[fieldValue.field_key] = JSON.parse(fieldValue.value);
					} else {
						initialValues[fieldValue.field_key] = fieldValue.value;
					}
				} catch {
					initialValues[fieldValue.field_key] = fieldValue.value;
				}
			}
		}

		values = initialValues;
	}

	// ==========================================================================
	// Handlers
	// ==========================================================================

	function handleValueChange(fieldId: string, value: unknown) {
		values = { ...values, [fieldId]: value };
		// Clear error on change
		if (errors[fieldId]) {
			const newErrors = { ...errors };
			delete newErrors[fieldId];
			errors = newErrors;
		}
	}

	function handleFileChange(fieldId: string, files: File[]) {
		fileChanges = { ...fileChanges, [fieldId]: files };
		// Also update values to track which fields have files
		values = { ...values, [fieldId]: files };
	}

	function validateFields(): boolean {
		const newErrors: Record<string, string> = {};

		for (const field of editableFields) {
			const value = values[field.id];

			// Required check
			if (field.is_required) {
				if (value === null || value === undefined || value === '') {
					newErrors[field.id] = 'This field is required';
					continue;
				}
				if (Array.isArray(value) && value.length === 0) {
					newErrors[field.id] = 'This field is required';
					continue;
				}
			}

			// Additional validation could be added here
		}

		errors = newErrors;
		return Object.keys(newErrors).length === 0;
	}

	async function handleSave() {
		if (isSubmitting) return;

		if (!validateFields()) {
			return;
		}

		isSubmitting = true;

		try {
			// Merge file changes into values
			const finalValues = { ...values, ...fileChanges };
			await onSave(finalValues);
		} catch (err) {
			console.error('Edit save failed:', err);
		} finally {
			isSubmitting = false;
		}
	}
</script>

{#snippet contentSnippet()}
	{#if isLoading}
		<div class="flex-1 flex items-center justify-center py-12">
			<div class="text-center">
				<div
					class="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"
				></div>
				<p class="text-sm text-muted-foreground">Loading...</p>
			</div>
		</div>
	{:else if hasFields}
		{#if useTabbed}
			<!-- Tabbed UI for multiple stages -->
			<div class="p-4">
				<Tabs.Root bind:value={activeStageTab}>
					<Tabs.List class="w-full overflow-x-auto flex-nowrap mb-4">
						{#each groupedFieldsWithValues as group}
							<Tabs.Trigger value={group.stageId} class="text-xs whitespace-nowrap">
								{group.stageName}
							</Tabs.Trigger>
						{/each}
					</Tabs.List>

					{#each groupedFieldsWithValues as group}
						<Tabs.Content value={group.stageId}>
							<FormRenderer
								mode="edit"
								fields={group.fieldsWithValues}
								{values}
								{errors}
								paginated={false}
								onValueChange={handleValueChange}
								onFileChange={handleFileChange}
							/>
						</Tabs.Content>
					{/each}
				</Tabs.Root>
			</div>
		{:else}
			<!-- Single stage or no grouping - flat list -->
			<div class="p-4">
				<FormRenderer
					mode="edit"
					fields={editableFields}
					{values}
					{errors}
					paginated={false}
					onValueChange={handleValueChange}
					onFileChange={handleFileChange}
				/>
			</div>
		{/if}
	{:else}
		<div class="flex-1 flex items-center justify-center p-4 py-12">
			<p class="text-sm text-muted-foreground">No editable fields configured.</p>
		</div>
	{/if}
{/snippet}

{#snippet footerSnippet()}
	<div class="p-4">
		<div class="flex gap-2">
			<Button
				variant="outline"
				onclick={onCancel}
				disabled={isSubmitting}
				class="flex-1"
			>
				<X class="w-4 h-4 mr-1" />
				Cancel
			</Button>

			<Button
				onclick={handleSave}
				disabled={isSubmitting || !hasFields}
				class="flex-1"
			>
				{#if isSubmitting}
					<Loader2 class="w-4 h-4 mr-2 animate-spin" />
					Saving...
				{:else}
					<Save class="w-4 h-4 mr-2" />
					Save
				{/if}
			</Button>
		</div>
	</div>
{/snippet}

<!-- Render content - parent (ModuleShell) handles scrolling -->
<div class="flex flex-col min-h-full">
	<div class="flex-1">
		{@render contentSnippet()}
	</div>
	<div class="sticky bottom-0 bg-background border-t border-border">
		{@render footerSnippet()}
	</div>
</div>
