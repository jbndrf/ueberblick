<script lang="ts">
	/**
	 * ProtocolTool
	 *
	 * Combines Edit + Form in one tool:
	 * - Section 1: Lifecycle fields (pre-filled from current field_values, respecting prefill_config)
	 * - Section 2: Protocol fields (from protocol_form_id, mode="fill")
	 * - On save: calls onSave(editValues, protocolValues)
	 */
	import { onMount } from 'svelte';
	import { FormRenderer } from '$lib/components/form-renderer';
	import { Button } from '$lib/components/ui/button';
	import { Save, X, Loader2 } from '@lucide/svelte';
	import { Separator } from '$lib/components/ui/separator';
	import type { FormFieldWithValue } from '$lib/components/form-renderer';
	import type { ToolProtocol, FormField, FieldValue } from '../state.svelte';
	import * as m from '$lib/paraglide/messages';

	// ==========================================================================
	// Props
	// ==========================================================================

	interface Props {
		protocolTool: ToolProtocol;
		instanceId: string;
		existingFieldValues: FieldValue[];
		formFields: FormField[];
		protocolFormFields: FormField[];
		onSave: (editValues: Record<string, unknown>, protocolValues: Record<string, unknown>) => Promise<void>;
		onCancel: () => void;
	}

	let { protocolTool, instanceId, existingFieldValues, formFields, protocolFormFields, onSave, onCancel }: Props = $props();

	// ==========================================================================
	// State
	// ==========================================================================

	let editValues = $state<Record<string, unknown>>({});
	let protocolValues = $state<Record<string, unknown>>({});
	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let isLoading = $state(true);
	let editFileChanges = $state<Record<string, File[]>>({});
	let protocolFileChanges = $state<Record<string, File[]>>({});

	// ==========================================================================
	// Derived
	// ==========================================================================

	const editableFieldIds = $derived(protocolTool.editable_fields || []);
	const prefillConfig = $derived(protocolTool.prefill_config || {});

	const editableFields = $derived.by((): FormFieldWithValue[] => {
		const filtered = formFields.filter(f => editableFieldIds.includes(f.id));
		return filtered.map(field => {
			const fieldValuesForField = existingFieldValues.filter(fv => fv.field_key === field.id);
			const storedFiles = fieldValuesForField
				.filter(fv => fv.file_value)
				.map(fv => ({ recordId: fv.id, fileName: fv.file_value }));
			const firstValue = fieldValuesForField.find(fv => fv.value);

			return {
				...field,
				value: editValues[field.id] ?? firstValue?.value ?? undefined,
				fileValue: storedFiles[0]?.fileName || undefined,
				fileRecordId: storedFiles[0]?.recordId || undefined,
				storedFiles: storedFiles.length > 0 ? storedFiles : undefined
			} as FormFieldWithValue;
		});
	});

	const protocolFieldsWithValues = $derived.by((): FormFieldWithValue[] => {
		return protocolFormFields.map(field => ({
			...field,
			value: protocolValues[field.id]
		})) as FormFieldWithValue[];
	});

	const hasEditFields = $derived(editableFields.length > 0);
	const hasProtocolFields = $derived(protocolFormFields.length > 0);

	// ==========================================================================
	// Initialization
	// ==========================================================================

	onMount(() => {
		initializeValues();
		isLoading = false;
	});

	function initializeValues() {
		const initialEditValues: Record<string, unknown> = {};

		// Pre-fill edit fields from existing values, respecting prefill_config
		for (const fieldValue of existingFieldValues) {
			if (!editableFieldIds.includes(fieldValue.field_key)) continue;

			// Check if prefill is enabled for this field (default is true)
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

	function handleEditFileChange(fieldId: string, files: File[]) {
		editFileChanges = { ...editFileChanges, [fieldId]: files };
		editValues = { ...editValues, [fieldId]: files };
	}

	function handleProtocolValueChange(fieldId: string, value: unknown) {
		protocolValues = { ...protocolValues, [fieldId]: value };
		if (errors[fieldId]) {
			const newErrors = { ...errors };
			delete newErrors[fieldId];
			errors = newErrors;
		}
	}

	function handleProtocolFileChange(fieldId: string, files: File[]) {
		protocolFileChanges = { ...protocolFileChanges, [fieldId]: files };
		protocolValues = { ...protocolValues, [fieldId]: files };
	}

	function validateFields(): boolean {
		const newErrors: Record<string, string> = {};

		for (const field of editableFields) {
			const value = editValues[field.id];
			if (field.is_required) {
				if (value === null || value === undefined || value === '') {
					newErrors[field.id] = (m.participantProtocolToolFieldRequired?.() ?? 'This field is required');
					continue;
				}
				if (Array.isArray(value) && value.length === 0) {
					newErrors[field.id] = (m.participantProtocolToolFieldRequired?.() ?? 'This field is required');
					continue;
				}
			}
		}

		for (const field of protocolFormFields) {
			const value = protocolValues[field.id];
			if (field.is_required) {
				if (value === null || value === undefined || value === '') {
					newErrors[field.id] = (m.participantProtocolToolFieldRequired?.() ?? 'This field is required');
					continue;
				}
				if (Array.isArray(value) && value.length === 0) {
					newErrors[field.id] = (m.participantProtocolToolFieldRequired?.() ?? 'This field is required');
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
			const finalEditValues = { ...editValues, ...editFileChanges };
			const finalProtocolValues = { ...protocolValues, ...protocolFileChanges };
			await onSave(finalEditValues, finalProtocolValues);
		} catch (err) {
			console.error('Protocol tool save failed:', err);
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
				<p class="text-sm text-muted-foreground">{m.participantProtocolToolLoading?.() ?? 'Loading...'}</p>
			</div>
		</div>
	{:else}
		{#if hasEditFields}
			<div class="p-4">
				<h4 class="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">{m.participantProtocolToolLifecycleFields?.() ?? 'Lifecycle Fields'}</h4>
				<FormRenderer
					mode="edit"
					fields={editableFields}
					values={editValues}
					{errors}
					paginated={false}
					onValueChange={handleEditValueChange}
					onFileChange={handleEditFileChange}
				/>
			</div>
		{/if}

		{#if hasEditFields && hasProtocolFields}
			<Separator />
		{/if}

		{#if hasProtocolFields}
			<div class="p-4">
				<h4 class="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">{m.participantProtocolToolProtocolFields?.() ?? 'Protocol Fields'}</h4>
				<FormRenderer
					mode="fill"
					fields={protocolFieldsWithValues}
					values={protocolValues}
					{errors}
					paginated={false}
					onValueChange={handleProtocolValueChange}
					onFileChange={handleProtocolFileChange}
				/>
			</div>
		{/if}

		{#if !hasEditFields && !hasProtocolFields}
			<div class="flex-1 flex items-center justify-center p-4 py-12">
				<p class="text-sm text-muted-foreground">{m.participantProtocolToolNoFields?.() ?? 'No fields configured for this protocol tool.'}</p>
			</div>
		{/if}
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
				{m.commonCancel?.() ?? 'Cancel'}
			</Button>

			<Button
				onclick={handleSave}
				disabled={isSubmitting || (!hasEditFields && !hasProtocolFields)}
				class="flex-1"
			>
				{#if isSubmitting}
					<Loader2 class="w-4 h-4 mr-2 animate-spin" />
					{m.participantProtocolToolSaving?.() ?? 'Saving...'}
				{:else}
					<Save class="w-4 h-4 mr-2" />
					{m.participantProtocolToolSave?.() ?? 'Save Protocol'}
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
