<script lang="ts">
	/**
	 * FormFillTool
	 *
	 * Collects new data via form fields using FormRenderer in fill mode.
	 * Handles pagination, validation, and submission.
	 * Designed to be rendered within a ModuleShell.
	 */
	import { onMount } from 'svelte';
	import { FormRenderer } from '$lib/components/form-renderer';
	import { Button } from '$lib/components/ui/button';
	import * as Tabs from '$lib/components/ui/tabs';
	import { ChevronLeft, ChevronRight, Send, Loader2 } from '@lucide/svelte';
	import {
		commonCancel,
		participantFormFillToolBack,
		participantFormFillToolCreateEntry,
		participantFormFillToolError,
		participantFormFillToolGoToPage,
		participantFormFillToolLoading,
		participantFormFillToolNext,
		participantFormFillToolNoFields,
		participantFormFillToolSubmit,
		participantFormFillToolSubmitting,
		participantFormFillToolTabMissingCount
	} from '$lib/paraglide/messages';
	import { getParticipantGateway } from '$lib/participant-state/context.svelte';
	import {
		loadConnectionForm,
		loadEntryForm,
		loadStageForm,
		getTotalPages,
		canGoNext,
		canGoPrevious,
		validateAll,
		pruneHiddenValues,
		getPages,
		errorsByPage,
		type FormFillState
	} from './form-state';
	import type { FormFieldWithValue } from '$lib/components/form-renderer';
	import type { FieldValue } from '../state.svelte';

	// ==========================================================================
	// Props
	// ==========================================================================

	interface Props {
		/** Workflow ID */
		workflowId: string;
		/** Optional connection ID - if provided, loads form for this specific connection */
		connectionId?: string;
		/** Optional form ID — if provided, loads that single form directly (used for
		 *  stage-attached forms opened ad-hoc; save does NOT advance the workflow). */
		formId?: string;
		/** Existing field values from the current instance (used as read-only context
		 *  so dependent fields like smart_dropdown can resolve their source values). */
		existingFieldValues?: FieldValue[];
		/** Participant role ids — used to hide fields the role can't view. */
		participantRoleIds?: string[];
		/** Called when form is submitted successfully */
		onSubmit: (values: Record<string, unknown>, connectionId: string) => Promise<void>;
		/** Called when user cancels/closes the form */
		onCancel: () => void;
	}

	let { workflowId, connectionId, formId, existingFieldValues, participantRoleIds = [], onSubmit, onCancel }: Props = $props();

	const gateway = getParticipantGateway();

	// ==========================================================================
	// State
	// ==========================================================================

	let formState = $state<FormFillState | null>(null);
	let isSubmitting = $state(false);
	let fileChanges = $state<Record<string, File[]>>({});

	// ==========================================================================
	// Derived
	// ==========================================================================

	const totalPages = $derived(formState ? getTotalPages(formState) : 1);
	const canNext = $derived(formState ? canGoNext(formState) : false);
	const canPrev = $derived(formState ? canGoPrevious(formState) : false);
	const hasFields = $derived(formState ? formState.fields.length > 0 : false);

	const currentPage = $derived(formState?.currentPage ?? 1);

	// Tab model: one tab per distinct `page` value across the form. Single-page
	// forms get no tab strip — they fall through to the original linear UX.
	// NOTE: per-tab navigation assumes linear traversal isn't required. The
	// `conditional_logic` field-ref placeholder is not honoured yet; once it is,
	// jumping out of order could expose a field whose precondition isn't met.
	const pages = $derived(formState ? getPages(formState) : []);
	const showTabs = $derived(pages.length > 1);
	const pageErrorCounts = $derived(formState ? errorsByPage(formState) : new Map<number, number>());

	// Read-only context from prior instance values (e.g. earlier-stage form
	// answers), used so dependent fields like smart_dropdown can resolve their
	// source values. Keys are field ids; values are parsed where possible.
	//
	// workflow_field_values is append-only: a field (incl. singleton) can have
	// many rows per field_def_id. The current value is the newest by
	// `recorded_at` — `existingFieldValues` arrives unsorted (Map insertion
	// order from the field-value cache), so we must collapse by recency here,
	// not by array position, or a stale earlier row can win. Mirrors the
	// newest-wins semantics of WorkflowInstanceDetailState.indexFieldValues.
	const priorValues = $derived.by((): Record<string, unknown> => {
		const newestByKey: Record<string, FieldValue> = {};
		for (const fv of existingFieldValues ?? []) {
			if (!fv.value) continue;
			const key = (fv as { field_def_id?: string }).field_def_id;
			if (!key) continue;
			const prev = newestByKey[key];
			if (!prev || (fv.recorded_at ?? '') > (prev.recorded_at ?? '')) {
				newestByKey[key] = fv;
			}
		}
		const out: Record<string, unknown> = {};
		for (const [key, fv] of Object.entries(newestByKey)) {
			try {
				out[key] =
					fv.value.startsWith('[') || fv.value.startsWith('{')
						? JSON.parse(fv.value)
						: fv.value;
			} catch {
				out[key] = fv.value;
			}
		}
		return out;
	});

	// Values passed to FormRenderer: prior context overlaid with this form's
	// own collected values. formState.values keeps only the form's own data so
	// submit logic remains unchanged.
	const renderValues = $derived.by((): Record<string, unknown> => ({
		...priorValues,
		...(formState?.values ?? {})
	}));

	// Convert FormFillState fields to FormFieldWithValue format
	const formFields = $derived.by((): FormFieldWithValue[] => {
		const state = formState;
		if (!state) return [];
		return state.fields.map(field => ({
			...field,
			value: state.values[field.id]
		}));
	});

	// Errors as record for FormRenderer
	const errorRecord = $derived.by((): Record<string, string> => {
		if (!formState) return {};
		const record: Record<string, string> = {};
		for (const err of formState.errors) {
			record[err.fieldId] = err.message;
		}
		return record;
	});

	// ==========================================================================
	// Initialization
	// ==========================================================================

	onMount(() => {
		if (workflowId && gateway) {
			loadForm();
		}
	});

	async function loadForm() {
		if (!gateway) return;

		if (formId) {
			// Stage-attached form opened ad-hoc — no connection involved.
			formState = await loadStageForm(gateway, workflowId, formId, participantRoleIds);
		} else if (connectionId) {
			// Load form for specific connection (tool flow from existing instance)
			formState = await loadConnectionForm(gateway, workflowId, connectionId, participantRoleIds);
		} else {
			// Load entry form (new workflow creation)
			formState = await loadEntryForm(gateway, workflowId, participantRoleIds);
		}
	}

	// ==========================================================================
	// Handlers
	// ==========================================================================

	function handleValueChange(fieldId: string, value: unknown) {
		if (!formState) return;

		const updated = { ...formState.values, [fieldId]: value };
		const pruned = pruneHiddenValues(formState.fields, updated, priorValues);
		const newErrors = formState.errors.filter(
			e => e.fieldId !== fieldId && e.fieldId in pruned
		);
		formState = { ...formState, values: pruned, errors: newErrors };
	}

	function handleFileChange(fieldId: string, files: File[]) {
		if (!formState) return;

		// Store file in both places
		fileChanges = { ...fileChanges, [fieldId]: files };

		// Also update form state values to track which fields have files
		const newValues = { ...formState.values, [fieldId]: files };
		formState = { ...formState, values: newValues };
	}

	function handlePageChange(page: number) {
		if (!formState) return;
		formState = { ...formState, currentPage: page };
	}

	function handleNextPage() {
		if (!formState) return;
		// Tabs allow free jumps; Next must not be stricter. Validation runs on submit.
		if (canGoNext(formState)) {
			formState = { ...formState, currentPage: formState.currentPage + 1 };
		}
	}

	function handlePreviousPage() {
		if (!formState) return;

		if (canGoPrevious(formState)) {
			formState = { ...formState, currentPage: formState.currentPage - 1 };
		}
	}

	async function handleSubmit() {
		if (!formState || isSubmitting) return;

		// Validate all pages
		const errors = validateAll(formState, priorValues);
		formState = { ...formState, errors };

		if (errors.length > 0) {
			// Go to first page with errors
			for (let page = 1; page <= totalPages; page++) {
				const pageErrors = errors.filter(e => {
					const field = formState!.fields.find(f => f.id === e.fieldId);
					return field && (field.page || 1) === page;
				});
				if (pageErrors.length > 0) {
					formState = { ...formState, currentPage: page };
					break;
				}
			}
			return;
		}

		isSubmitting = true;

		try {
			// Merge file changes into values
			const finalValues = { ...formState.values, ...fileChanges };
			await onSubmit(finalValues, formState.connectionId);
		} catch (err) {
			console.error('Form submission failed:', err);
		} finally {
			isSubmitting = false;
		}
	}
</script>

{#snippet contentSnippet()}
	{#if formState?.isLoading}
		<div class="flex-1 flex items-center justify-center py-12">
			<div class="text-center">
				<div
					class="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"
				></div>
				<p class="text-sm text-muted-foreground">{participantFormFillToolLoading?.() ?? 'Loading form...'}</p>
			</div>
		</div>
	{:else if formState?.loadError}
		<div class="flex-1 flex items-center justify-center p-4 py-12">
			<div class="text-center">
				<p class="text-sm text-destructive font-medium mb-1">{participantFormFillToolError?.() ?? 'Error'}</p>
				<p class="text-xs text-muted-foreground">{formState.loadError}</p>
			</div>
		</div>
	{:else if formState && hasFields}
		<div class="p-4">
			{#if showTabs}
				<Tabs.Root
					value={String(currentPage)}
					onValueChange={(v) => handlePageChange(Number(v))}
					class="mb-4"
				>
					<Tabs.List class="w-full overflow-x-auto flex-nowrap">
						{#each pages as p (p.page)}
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
				fields={formFields}
				values={renderValues}
				errors={errorRecord}
				pages={formState?.form?.pages ?? []}
				paginated={totalPages > 1}
				currentPage={currentPage}
				onValueChange={handleValueChange}
				onFileChange={handleFileChange}
				onPageChange={handlePageChange}
			/>
		</div>
	{:else if formState}
		<div class="flex-1 flex flex-col items-center justify-center p-4 py-12">
			<p class="text-sm text-muted-foreground mb-4">{participantFormFillToolNoFields?.() ?? 'No additional information required.'}</p>
		</div>
	{/if}
{/snippet}

{#snippet footerSnippet()}
	<div class="p-4">
		<!-- Page Indicator: suppressed when tab strip is rendered to avoid two indicators competing. -->
		{#if totalPages > 1 && !showTabs}
			<div class="flex justify-center gap-1.5 mb-3">
				{#each Array(totalPages) as _, i}
					<button
						class="w-2 h-2 rounded-full transition-colors {currentPage === i + 1 ? 'bg-primary' : 'bg-muted-foreground/30'}"
						onclick={() => handlePageChange(i + 1)}
						aria-label={(participantFormFillToolGoToPage?.({ page: i + 1 }) ?? `Go to page ${i + 1}`)}
					></button>
				{/each}
			</div>
		{/if}

		<!-- Navigation Buttons -->
		<div class="flex gap-2">
			{#if canPrev}
				<Button
					variant="outline"
					onclick={handlePreviousPage}
					disabled={isSubmitting}
					class="flex-1"
				>
					<ChevronLeft class="w-4 h-4 mr-1" />
					{participantFormFillToolBack?.() ?? 'Back'}
				</Button>
			{:else}
				<Button
					variant="outline"
					onclick={onCancel}
					disabled={isSubmitting}
					class="flex-1"
				>
					{commonCancel?.() ?? 'Cancel'}
				</Button>
			{/if}

			{#if canNext}
				<Button
					onclick={handleNextPage}
					disabled={isSubmitting}
					class="flex-1"
				>
					{participantFormFillToolNext?.() ?? 'Next'}
					<ChevronRight class="w-4 h-4 ml-1" />
				</Button>
			{:else}
				<Button
					onclick={handleSubmit}
					disabled={isSubmitting}
					class="flex-1"
				>
					{#if isSubmitting}
						<Loader2 class="w-4 h-4 mr-2 animate-spin" />
						{participantFormFillToolSubmitting?.() ?? 'Submitting...'}
					{:else}
						<Send class="w-4 h-4 mr-2" />
						{hasFields ? (participantFormFillToolSubmit?.() ?? 'Submit') : (participantFormFillToolCreateEntry?.() ?? 'Create Entry')}
					{/if}
				</Button>
			{/if}
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
