<script lang="ts">
	/**
	 * ProtocolTool
	 *
	 * Combines Edit + Form in one tool for recurring data collection.
	 * Section 1: Lifecycle fields (pre-filled from current field_values, mode="edit")
	 * Section 2: Protocol fields (from protocol_form_id, mode="fill")
	 *
	 * On save: creates a JSON snapshot in workflow_protocol_entries,
	 * then updates field_values for lifecycle fields that changed.
	 */
	import { onMount } from 'svelte';
	import { FormRenderer } from '$lib/components/form-renderer';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { ClipboardList, X, Loader2 } from 'lucide-svelte';
	import type { FormFieldWithValue } from '$lib/components/form-renderer';
	import type { ToolEdit, FormField, FieldValue } from '../state.svelte';

	// ==========================================================================
	// Props
	// ==========================================================================

	interface Props {
		/** The protocol tool configuration */
		protocolTool: ToolEdit;
		/** The instance ID */
		instanceId: string;
		/** Existing field values (from state) */
		existingFieldValues: FieldValue[];
		/** All available form fields (for lifecycle field lookup) */
		formFields: FormField[];
		/** Protocol-specific form fields (from protocol_form_id) */
		protocolFormFields: FormField[];
		/** Called when protocol is saved */
		onSave: (editValues: Record<string, unknown>, protocolValues: Record<string, unknown>) => Promise<void>;
		/** Called when user cancels */
		onCancel: () => void;
	}

	let {
		protocolTool,
		instanceId,
		existingFieldValues,
		formFields,
		protocolFormFields,
		onSave,
		onCancel
	}: Props = $props();

	// ==========================================================================
	// State
	// ==========================================================================

	let editValues = $state<Record<string, unknown>>({});
	let protocolValues = $state<Record<string, unknown>>({});
	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let isLoading = $state(true);
	let fileChanges = $state<Record<string, File[]>>({});

	// ==========================================================================
	// Derived
	// ==========================================================================

	const prefillConfig = $derived(protocolTool.prefill_config || {});

	// Lifecycle fields with pre-filled values
	const editFieldsWithValues = $derived.by((): FormFieldWithValue[] => {
		const editableFieldIds = protocolTool.editable_fields || [];
		const filteredFields = formFields.filter(f => editableFieldIds.includes(f.id));

		return filteredFields.map(field => {
			const fieldValuesForField = existingFieldValues.filter(fv => fv.field_key === field.id);

			const storedFiles = fieldValuesForField
				.filter(fv => fv.file_value)
				.map(fv => ({ recordId: fv.id, fileName: fv.file_value }));

			const firstValue = fieldValuesForField.find(fv => fv.value);

			// Respect prefill_config: if false, don't pre-fill
			const shouldPrefill = prefillConfig[field.id] !== false;
			const prefillValue = shouldPrefill
				? (editValues[field.id] ?? firstValue?.value ?? undefined)
				: (editValues[field.id] ?? undefined);

			return {
				...field,
				value: prefillValue,
				fileValue: storedFiles[0]?.fileName || undefined,
				fileRecordId: storedFiles[0]?.recordId || undefined,
				storedFiles: storedFiles.length > 0 ? storedFiles : undefined
			} as FormFieldWithValue;
		});
	});

	// Protocol form fields with values
	const protocolFieldsWithValues = $derived.by((): FormFieldWithValue[] => {
		return protocolFormFields.map(field => {
			return {
				...field,
				value: protocolValues[field.id] ?? undefined
			} as FormFieldWithValue;
		});
	});

	const hasEditFields = $derived(editFieldsWithValues.length > 0);
	const hasProtocolFields = $derived(protocolFieldsWithValues.length > 0);
	const hasAnyFields = $derived(hasEditFields || hasProtocolFields);

	// ==========================================================================
	// Initialization
	// ==========================================================================

	onMount(() => {
		initializeValues();
		isLoading = false;
	});

	function initializeValues() {
		const initialEditValues: Record<string, unknown> = {};

		// Pre-fill lifecycle fields from existing values (respecting prefill_config)
		for (const fieldValue of existingFieldValues) {
			if (!protocolTool.editable_fields?.includes(fieldValue.field_key)) continue;
			if (prefillConfig[fieldValue.field_key] === false) continue;

			try {
				if (fieldValue.value.startsWith('[') || fieldValue.value.startsWith('{')) {
					initialEditValues[fieldValue.field_key] = JSON.parse(fieldValue.value);
				} else {
					initialEditValues[fieldValue.field_key] = fieldValue.value;
				}
			} catch {
				initialEditValues[fieldValue.field_key] = fieldValue.value;
			}
		}

		editValues = initialEditValues;
		protocolValues = {};
	}

	// ==========================================================================
	// Handlers
	// ==========================================================================

	function handleEditValueChange(fieldId: string, value: unknown) {
		editValues = { ...editValues, [fieldId]: value };
		if (errors[fieldId]) {
			const newErrors = { ...errors };
			delete newErrors[fieldId];
			errors = newErrors;
		}
	}

	function handleProtocolValueChange(fieldId: string, value: unknown) {
		protocolValues = { ...protocolValues, [fieldId]: value };
		if (errors[fieldId]) {
			const newErrors = { ...errors };
			delete newErrors[fieldId];
			errors = newErrors;
		}
	}

	function handleFileChange(fieldId: string, files: File[]) {
		fileChanges = { ...fileChanges, [fieldId]: files };
		// Determine if it's an edit field or protocol field
		if (protocolTool.editable_fields?.includes(fieldId)) {
			editValues = { ...editValues, [fieldId]: files };
		} else {
			protocolValues = { ...protocolValues, [fieldId]: files };
		}
	}

	function validateFields(): boolean {
		const newErrors: Record<string, string> = {};

		const allFields = [...editFieldsWithValues, ...protocolFieldsWithValues];
		const allValues = { ...editValues, ...protocolValues };

		for (const field of allFields) {
			const value = allValues[field.id];
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
		}

		errors = newErrors;
		return Object.keys(newErrors).length === 0;
	}

	async function handleSave() {
		if (isSubmitting) return;
		if (!validateFields()) return;

		isSubmitting = true;

		try {
			const finalEditValues = { ...editValues };
			const finalProtocolValues = { ...protocolValues };

			// Merge file changes into the appropriate values
			for (const [fieldId, files] of Object.entries(fileChanges)) {
				if (protocolTool.editable_fields?.includes(fieldId)) {
					finalEditValues[fieldId] = files;
				} else {
					finalProtocolValues[fieldId] = files;
				}
			}

			await onSave(finalEditValues, finalProtocolValues);
		} catch (err) {
			console.error('Protocol save failed:', err);
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
	{:else if hasAnyFields}
		<div class="p-4 flex flex-col gap-4">
			{#if hasEditFields}
				<div>
					<h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
						Current Values
					</h3>
					<FormRenderer
						mode="edit"
						fields={editFieldsWithValues}
						values={editValues}
						{errors}
						paginated={false}
						onValueChange={handleEditValueChange}
						onFileChange={handleFileChange}
					/>
				</div>
			{/if}

			{#if hasEditFields && hasProtocolFields}
				<Separator />
			{/if}

			{#if hasProtocolFields}
				<div>
					<h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
						Protocol
					</h3>
					<FormRenderer
						mode="fill"
						fields={protocolFieldsWithValues}
						values={protocolValues}
						{errors}
						paginated={false}
						onValueChange={handleProtocolValueChange}
						onFileChange={handleFileChange}
					/>
				</div>
			{/if}
		</div>
	{:else}
		<div class="flex-1 flex items-center justify-center p-4 py-12">
			<p class="text-sm text-muted-foreground">No fields configured for this protocol.</p>
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
				disabled={isSubmitting || !hasAnyFields}
				class="flex-1"
			>
				{#if isSubmitting}
					<Loader2 class="w-4 h-4 mr-2 animate-spin" />
					Saving...
				{:else}
					<ClipboardList class="w-4 h-4 mr-2" />
					Save Protocol
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
