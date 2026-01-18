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
	import { ChevronLeft, ChevronRight, Send, Loader2 } from 'lucide-svelte';
	import { getParticipantGateway } from '$lib/participant-state/context.svelte';
	import {
		loadConnectionForm,
		loadEntryForm,
		getTotalPages,
		canGoNext,
		canGoPrevious,
		validatePage,
		validateAll,
		type FormFillState
	} from './form-state';
	import type { FormFieldWithValue } from '$lib/components/form-renderer';

	// ==========================================================================
	// Props
	// ==========================================================================

	interface Props {
		/** Workflow ID */
		workflowId: string;
		/** Optional connection ID - if provided, loads form for this specific connection */
		connectionId?: string;
		/** Called when form is submitted successfully */
		onSubmit: (values: Record<string, unknown>, connectionId: string) => Promise<void>;
		/** Called when user cancels/closes the form */
		onCancel: () => void;
	}

	let { workflowId, connectionId, onSubmit, onCancel }: Props = $props();

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

		if (connectionId) {
			// Load form for specific connection (tool flow from existing instance)
			formState = await loadConnectionForm(gateway, workflowId, connectionId);
		} else {
			// Load entry form (new workflow creation)
			formState = await loadEntryForm(gateway, workflowId);
		}
	}

	// ==========================================================================
	// Handlers
	// ==========================================================================

	function handleValueChange(fieldId: string, value: unknown) {
		if (!formState) return;

		const newValues = { ...formState.values, [fieldId]: value };
		const newErrors = formState.errors.filter(e => e.fieldId !== fieldId);
		formState = { ...formState, values: newValues, errors: newErrors };
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

		// Validate current page
		const errors = validatePage(formState, formState.currentPage);
		formState = { ...formState, errors };

		if (errors.length === 0 && canGoNext(formState)) {
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
		const errors = validateAll(formState);
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
				<p class="text-sm text-muted-foreground">Loading form...</p>
			</div>
		</div>
	{:else if formState?.loadError}
		<div class="flex-1 flex items-center justify-center p-4 py-12">
			<div class="text-center">
				<p class="text-sm text-destructive font-medium mb-1">Error</p>
				<p class="text-xs text-muted-foreground">{formState.loadError}</p>
			</div>
		</div>
	{:else if formState && hasFields}
		<div class="p-4">
			<FormRenderer
				mode="fill"
				fields={formFields}
				values={formState.values}
				errors={errorRecord}
				paginated={totalPages > 1}
				currentPage={currentPage}
				onValueChange={handleValueChange}
				onFileChange={handleFileChange}
				onPageChange={handlePageChange}
			/>
		</div>
	{:else if formState}
		<div class="flex-1 flex flex-col items-center justify-center p-4 py-12">
			<p class="text-sm text-muted-foreground mb-4">No additional information required.</p>
		</div>
	{/if}
{/snippet}

{#snippet footerSnippet()}
	<div class="p-4">
		<!-- Page Indicator -->
		{#if totalPages > 1}
			<div class="flex justify-center gap-1.5 mb-3">
				{#each Array(totalPages) as _, i}
					<button
						class="w-2 h-2 rounded-full transition-colors {currentPage === i + 1 ? 'bg-primary' : 'bg-muted-foreground/30'}"
						onclick={() => handlePageChange(i + 1)}
						aria-label="Go to page {i + 1}"
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
					Back
				</Button>
			{:else}
				<Button
					variant="outline"
					onclick={onCancel}
					disabled={isSubmitting}
					class="flex-1"
				>
					Cancel
				</Button>
			{/if}

			{#if canNext}
				<Button
					onclick={handleNextPage}
					disabled={isSubmitting}
					class="flex-1"
				>
					Next
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
						Submitting...
					{:else}
						<Send class="w-4 h-4 mr-2" />
						{hasFields ? 'Submit' : 'Create Entry'}
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
