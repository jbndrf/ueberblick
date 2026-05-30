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
	 * Both kinds are merged into a single FormRenderer so the form's full visual
	 * config is honoured: page metadata (titles/descriptions), multi-page layout
	 * with a tab strip, column/row layout, conditional logic, and `prefill_config`
	 * (case fields seeded from the instance's current values). Case fields are
	 * keyed by their `field_def_id`; local fields by the synthetic `local:<key>` id.
	 *
	 * The single `onSave(caseValues, localValues)` callback hands both maps to
	 * the parent module so it can build the snapshot and persist case fields
	 * independently.
	 */
	import { onMount } from 'svelte';
	import { FormRenderer } from '$lib/components/form-renderer';
	import { Button } from '$lib/components/ui/button';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Save, X, Loader2 } from '@lucide/svelte';
	import type { FormFieldWithValue, FormPage } from '$lib/components/form-renderer';
	import { getTotalPages } from '$lib/components/form-renderer';
	import type { ToolProtocol, FormField } from '../state.svelte';
	import type { ProtocolLocalField } from '$lib/participant-state/types';
	import { evaluateShowIf } from '$lib/form-engine/conditional-logic';
	import {
		commonCancel,
		participantFormFillToolGoToPage,
		participantFormFillToolTabMissingCount,
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
		/** Per-page metadata (title + description) from the backing form. */
		pages?: FormPage[];
		/**
		 * Initial values for case fields, keyed by `field_def_id`, derived from
		 * the tool's `prefill_config` and the instance's current values.
		 */
		prefillValues?: Record<string, unknown>;
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

	let {
		protocolTool: _protocolTool,
		instanceId: _instanceId,
		protocolFormFields,
		localFields,
		pages = [],
		prefillValues = {},
		onSave,
		onCancel
	}: Props = $props();

	let caseValues = $state<Record<string, unknown>>({});
	let localValues = $state<Record<string, unknown>>({});
	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let isLoading = $state(true);
	let currentPage = $state(1);
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
			conditional_logic: lf.conditional_logic ?? null,
			value: localValues[lf.key]
		})) as unknown as FormFieldWithValue[];
	});

	/** Case + local fields rendered together so page layout spans both kinds. */
	const allFields = $derived<FormFieldWithValue[]>([
		...caseFieldsWithValues,
		...localFieldsAsFormFields
	]);

	/**
	 * Merged value bag for conditional_logic predicates: case fields by their
	 * field_def_id, local fields under `local:<key>` (matching the shim id).
	 * A predicate can reference either kind from either side.
	 */
	const mergedValues = $derived.by((): Record<string, unknown> => {
		const out: Record<string, unknown> = { ...caseValues };
		for (const [k, v] of Object.entries(localValues)) {
			out[`local:${k}`] = v;
		}
		return out;
	});

	const hasCaseFields = $derived(protocolFormFields.length > 0);
	const hasLocalFields = $derived((localFields?.length ?? 0) > 0);
	const hasFields = $derived(hasCaseFields || hasLocalFields);

	// Pagination: one tab per distinct `page` across all fields. Single-page
	// forms get no tab strip and render inline.
	const totalPages = $derived(getTotalPages(allFields));
	const tabPages = $derived.by((): Array<{ page: number; title: string }> => {
		const metaByPage = new Map<number, FormPage>();
		for (const p of pages) metaByPage.set(p.page, p);
		const nums = Array.from(new Set(allFields.map((f) => f.page ?? 1))).sort((a, b) => a - b);
		return nums.map((n) => ({ page: n, title: metaByPage.get(n)?.title || `Seite ${n}` }));
	});
	const showTabs = $derived(tabPages.length > 1);
	const pageErrorCounts = $derived.by((): Map<number, number> => {
		const pageOf = new Map<string, number>();
		for (const f of allFields) pageOf.set(f.id, f.page ?? 1);
		const counts = new Map<number, number>();
		for (const id of Object.keys(errors)) {
			const p = pageOf.get(id);
			if (p === undefined) continue;
			counts.set(p, (counts.get(p) ?? 0) + 1);
		}
		return counts;
	});

	onMount(() => {
		// Seed case fields from prefill_config + current instance values.
		if (prefillValues && Object.keys(prefillValues).length > 0) {
			caseValues = { ...prefillValues };
		}
		isLoading = false;
	});

	function pruneHidden(nextCase: Record<string, unknown>, nextLocal: Record<string, unknown>) {
		const merged: Record<string, unknown> = { ...nextCase };
		for (const [k, v] of Object.entries(nextLocal)) merged[`local:${k}`] = v;

		let caseChanged = false;
		const caseOut = { ...nextCase };
		for (const f of protocolFormFields) {
			const cl = (f as unknown as { conditional_logic?: unknown }).conditional_logic;
			if (!cl) continue;
			if (!evaluateShowIf(cl as Parameters<typeof evaluateShowIf>[0], merged)) {
				if (f.id in caseOut) {
					delete caseOut[f.id];
					caseChanged = true;
				}
			}
		}

		let localChanged = false;
		const localOut = { ...nextLocal };
		for (const lf of localFields ?? []) {
			if (!lf.conditional_logic) continue;
			if (!evaluateShowIf(lf.conditional_logic, merged)) {
				if (lf.key in localOut) {
					delete localOut[lf.key];
					localChanged = true;
				}
			}
		}

		return {
			caseValues: caseChanged ? caseOut : nextCase,
			localValues: localChanged ? localOut : nextLocal
		};
	}

	function handleValueChange(fieldId: string, value: unknown) {
		if (fieldId.startsWith('local:')) {
			handleLocalValueChange(fieldId, value);
		} else {
			handleCaseValueChange(fieldId, value);
		}
	}

	function handleFileChange(fieldId: string, files: File[]) {
		if (fieldId.startsWith('local:')) {
			handleLocalFileChange(fieldId, files);
		} else {
			handleCaseFileChange(fieldId, files);
		}
	}

	function handleCaseValueChange(fieldId: string, value: unknown) {
		const next = { ...caseValues, [fieldId]: value };
		const pruned = pruneHidden(next, localValues);
		caseValues = pruned.caseValues;
		localValues = pruned.localValues;
		clearError(fieldId);
	}

	function handleCaseFileChange(fieldId: string, files: File[]) {
		caseFileChanges = { ...caseFileChanges, [fieldId]: files };
		caseValues = { ...caseValues, [fieldId]: files };
	}

	function handleLocalValueChange(syntheticId: string, value: unknown) {
		const key = syntheticId.startsWith('local:') ? syntheticId.slice(6) : syntheticId;
		const next = { ...localValues, [key]: value };
		const pruned = pruneHidden(caseValues, next);
		caseValues = pruned.caseValues;
		localValues = pruned.localValues;
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
		const merged = mergedValues;

		for (const field of protocolFormFields) {
			if (!field.is_required) continue;
			const cl = (field as unknown as { conditional_logic?: unknown }).conditional_logic;
			if (!evaluateShowIf(cl as Parameters<typeof evaluateShowIf>[0], merged)) continue;
			const v = caseValues[field.id];
			if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) {
				next[field.id] = requiredMsg;
			}
		}
		for (const lf of localFields ?? []) {
			if (!lf.required) continue;
			if (!evaluateShowIf(lf.conditional_logic, merged)) continue;
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
		if (!validate()) {
			// Jump to the first page that has an error so it's visible.
			if (showTabs) {
				const pageOf = new Map<string, number>();
				for (const f of allFields) pageOf.set(f.id, f.page ?? 1);
				const errorPages = Object.keys(errors)
					.map((id) => pageOf.get(id))
					.filter((p): p is number => p !== undefined)
					.sort((a, b) => a - b);
				if (errorPages.length > 0) currentPage = errorPages[0];
			}
			return;
		}

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
		{:else if !hasFields}
			<div class="flex-1 flex items-center justify-center p-4 py-12">
				<p class="text-sm text-muted-foreground">{participantProtocolToolNoFields?.() ?? 'No fields configured for this protocol tool.'}</p>
			</div>
		{:else}
			<div class="p-4">
				{#if showTabs}
					<Tabs.Root
						value={String(currentPage)}
						onValueChange={(v) => (currentPage = Number(v))}
						class="mb-4"
					>
						<Tabs.List class="w-full overflow-x-auto flex-nowrap">
							{#each tabPages as p (p.page)}
								{@const missing = pageErrorCounts.get(p.page) ?? 0}
								<Tabs.Trigger value={String(p.page)} class="whitespace-nowrap text-xs">
									<span>{p.title}</span>
									{#if missing > 0}
										<span
											class="ml-1.5 inline-flex items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-medium text-destructive-foreground"
											aria-label={participantFormFillToolTabMissingCount?.({ count: missing }) ?? `${missing} missing`}
										>
											{missing}
										</span>
									{/if}
								</Tabs.Trigger>
							{/each}
						</Tabs.List>
					</Tabs.Root>
				{/if}

				<FormRenderer
					mode="fill"
					fields={allFields}
					values={mergedValues}
					{errors}
					{pages}
					paginated={totalPages > 1}
					{currentPage}
					onValueChange={handleValueChange}
					onFileChange={handleFileChange}
					onPageChange={(page) => (currentPage = page)}
				/>

				{#if totalPages > 1 && !showTabs}
					<div class="flex justify-center gap-1.5 mt-4">
						{#each Array(totalPages) as _, i}
							<button
								class="w-2 h-2 rounded-full transition-colors {currentPage === i + 1 ? 'bg-primary' : 'bg-muted-foreground/30'}"
								onclick={() => (currentPage = i + 1)}
								aria-label={participantFormFillToolGoToPage?.({ page: i + 1 }) ?? `Go to page ${i + 1}`}
							></button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<div class="sticky bottom-0 bg-background border-t border-border">
		<div class="p-4">
			<div class="flex gap-2">
				<Button variant="outline" onclick={onCancel} disabled={isSubmitting} class="flex-1">
					<X class="w-4 h-4 mr-1" />
					{commonCancel?.() ?? 'Cancel'}
				</Button>
				<Button onclick={handleSave} disabled={isSubmitting || !hasFields} class="flex-1">
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
