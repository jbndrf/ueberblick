<script lang="ts">
	/**
	 * ProtocolTool
	 *
	 * A protocol is a form that also emits an immutable snapshot. The fields
	 * shown here come from two sources:
	 *   - **Case (library) fields**: referenced via `tools_form_field_refs`.
	 *     Submitted values flow through `writeFieldValue` and land in
	 *     `workflow_field_values` like any other form.
	 *   - **Protocol-local fields**: inline on `tools_forms.local_fields`.
	 *     Values land only in `workflow_protocol_entries.snapshot.local_fields`
	 *     — never in `workflow_field_values`.
	 *
	 * The single `onSave(caseValues, localValues)` callback hands both maps to
	 * the parent module so it can build the snapshot and persist case fields
	 * independently.
	 */
	import { onMount } from 'svelte';
	import { FormRenderer } from '$lib/components/form-renderer';
	import { Button } from '$lib/components/ui/button';
	import { Save, X, Loader2 } from '@lucide/svelte';
	import type { FormFieldWithValue } from '$lib/components/form-renderer';
	import type { ToolProtocol, FormField } from '../state.svelte';
	import type { ProtocolLocalField } from '$lib/participant-state/types';
	import {
		commonCancel,
		participantProtocolToolFieldRequired,
		participantProtocolToolLoading,
		participantProtocolToolNoFields,
		participantProtocolToolSave,
		participantProtocolToolSaving
	} from '$lib/paraglide/messages';

	interface Props {
		protocolTool: ToolProtocol;
		instanceId: string;
		/** Fields from `tools_form_field_refs` joined with their field defs. */
		protocolFormFields: FormField[];
		/** Inline local fields from `tools_forms.local_fields`. */
		localFields: ProtocolLocalField[];
		/**
		 * `caseValues` keyed by field_def_id; `localValues` keyed by the local
		 * field's `key`.
		 */
		onSave: (
			caseValues: Record<string, unknown>,
			localValues: Record<string, unknown>
		) => Promise<void>;
		onCancel: () => void;
	}

	let { protocolTool: _protocolTool, instanceId: _instanceId, protocolFormFields, localFields, onSave, onCancel }: Props = $props();

	let caseValues = $state<Record<string, unknown>>({});
	let localValues = $state<Record<string, unknown>>({});
	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let isLoading = $state(true);
	let caseFileChanges = $state<Record<string, File[]>>({});
	let localFileChanges = $state<Record<string, File[]>>({});

	const caseFieldsWithValues = $derived.by((): FormFieldWithValue[] => {
		return protocolFormFields.map((field) => ({
			...field,
			value: caseValues[field.id]
		})) as FormFieldWithValue[];
	});

	/** Render local fields by shimming them into the FormField shape. */
	const localFieldsAsFormFields = $derived.by((): FormFieldWithValue[] => {
		return (localFields ?? []).map((lf, idx) => ({
			id: `local:${lf.key}`,
			form_id: '',
			field_def_id: '',
			ref_id: '',
			field_label: lf.label,
			field_type: lf.field_type,
			field_order: 10_000 + idx,
			is_required: lf.required,
			placeholder: lf.placeholder ?? undefined,
			help_text: lf.help_text ?? undefined,
			field_options: lf.field_options,
			page: lf.page,
			row_index: lf.row_index,
			column_position: lf.column_position,
			value: localValues[lf.key]
		})) as unknown as FormFieldWithValue[];
	});

	const hasCaseFields = $derived(protocolFormFields.length > 0);
	const hasLocalFields = $derived((localFields?.length ?? 0) > 0);

	onMount(() => {
		isLoading = false;
	});

	function handleCaseValueChange(fieldId: string, value: unknown) {
		caseValues = { ...caseValues, [fieldId]: value };
		clearError(fieldId);
	}

	function handleCaseFileChange(fieldId: string, files: File[]) {
		caseFileChanges = { ...caseFileChanges, [fieldId]: files };
		caseValues = { ...caseValues, [fieldId]: files };
	}

	function handleLocalValueChange(syntheticId: string, value: unknown) {
		const key = syntheticId.startsWith('local:') ? syntheticId.slice(6) : syntheticId;
		localValues = { ...localValues, [key]: value };
		clearError(syntheticId);
	}

	function handleLocalFileChange(syntheticId: string, files: File[]) {
		const key = syntheticId.startsWith('local:') ? syntheticId.slice(6) : syntheticId;
		localFileChanges = { ...localFileChanges, [key]: files };
		localValues = { ...localValues, [key]: files };
	}

	function clearError(id: string) {
		if (!errors[id]) return;
		const next = { ...errors };
		delete next[id];
		errors = next;
	}

	function validate(): boolean {
		const next: Record<string, string> = {};
		const requiredMsg = participantProtocolToolFieldRequired?.() ?? 'This field is required';

		for (const field of protocolFormFields) {
			if (!field.is_required) continue;
			const v = caseValues[field.id];
			if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) {
				next[field.id] = requiredMsg;
			}
		}
		for (const lf of localFields ?? []) {
			if (!lf.required) continue;
			const v = localValues[lf.key];
			if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) {
				next[`local:${lf.key}`] = requiredMsg;
			}
		}

		errors = next;
		return Object.keys(next).length === 0;
	}

	async function handleSave() {
		if (isSubmitting) return;
		if (!validate()) return;

		isSubmitting = true;
		try {
			const finalCaseValues = { ...caseValues, ...caseFileChanges };
			const finalLocalValues = { ...localValues, ...localFileChanges };
			await onSave(finalCaseValues, finalLocalValues);
		} catch (err) {
			console.error('Protocol tool save failed:', err);
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="flex flex-col min-h-full">
	<div class="flex-1">
		{#if isLoading}
			<div class="flex-1 flex items-center justify-center py-12">
				<div class="text-center">
					<div class="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
					<p class="text-sm text-muted-foreground">{participantProtocolToolLoading?.() ?? 'Loading...'}</p>
				</div>
			</div>
		{:else if !hasCaseFields && !hasLocalFields}
			<div class="flex-1 flex items-center justify-center p-4 py-12">
				<p class="text-sm text-muted-foreground">{participantProtocolToolNoFields?.() ?? 'No fields configured for this protocol tool.'}</p>
			</div>
		{:else}
			{#if hasCaseFields}
				<div class="p-4">
					<FormRenderer
						mode="fill"
						fields={caseFieldsWithValues}
						values={caseValues}
						{errors}
						paginated={false}
						onValueChange={handleCaseValueChange}
						onFileChange={handleCaseFileChange}
					/>
				</div>
			{/if}

			{#if hasLocalFields}
				<div class="p-4">
					<FormRenderer
						mode="fill"
						fields={localFieldsAsFormFields}
						values={Object.fromEntries(Object.entries(localValues).map(([k, v]) => [`local:${k}`, v]))}
						{errors}
						paginated={false}
						onValueChange={handleLocalValueChange}
						onFileChange={handleLocalFileChange}
					/>
				</div>
			{/if}
		{/if}
	</div>

	<div class="sticky bottom-0 bg-background border-t border-border">
		<div class="p-4">
			<div class="flex gap-2">
				<Button variant="outline" onclick={onCancel} disabled={isSubmitting} class="flex-1">
					<X class="w-4 h-4 mr-1" />
					{commonCancel?.() ?? 'Cancel'}
				</Button>
				<Button onclick={handleSave} disabled={isSubmitting || (!hasCaseFields && !hasLocalFields)} class="flex-1">
					{#if isSubmitting}
						<Loader2 class="w-4 h-4 mr-2 animate-spin" />
						{participantProtocolToolSaving?.() ?? 'Saving...'}
					{:else}
						<Save class="w-4 h-4 mr-2" />
						{participantProtocolToolSave?.() ?? 'Save Protocol'}
					{/if}
				</Button>
			</div>
		</div>
	</div>
</div>
