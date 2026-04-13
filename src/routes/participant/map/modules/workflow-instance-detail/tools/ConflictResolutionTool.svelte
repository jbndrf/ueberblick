<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { AlertTriangle, Check, RotateCcw } from 'lucide-svelte';
	import type { SyncConflict } from '$lib/participant-state/db';
	import { getChangedFields } from '../conflict-diff';

	// ==========================================================================
	// Props
	// ==========================================================================

	interface ConflictResolution {
		conflictId: string;
		action: 'keep_server' | 'reapply_local';
		/** When action is 'reapply_local', only these field keys are re-applied */
		fieldsToReapply?: string[];
	}

	interface Props {
		/** Pending conflicts for this workflow instance */
		conflicts: SyncConflict[];
		/** Field definitions for rendering labels */
		formFields: Array<{ id: string; field_label: string }>;
		/** Called with resolutions when participant clicks Apply */
		onResolve: (resolutions: ConflictResolution[]) => Promise<void>;
		/** Called when participant cancels */
		onCancel: () => void;
	}

	let { conflicts, formFields, onResolve, onCancel }: Props = $props();

	// ==========================================================================
	// State
	// ==========================================================================

	let isSubmitting = $state(false);

	// Per-conflict, per-field resolution choices
	// Key: `${conflictId}:${fieldKey}`, Value: 'keep_server' | 'reapply_local'
	let choices = $state<Record<string, 'keep_server' | 'reapply_local'>>({});

	// Initialize all choices to 'keep_server' (default: accept server version)
	$effect(() => {
		const initial: Record<string, 'keep_server' | 'reapply_local'> = {};
		for (const conflict of conflicts) {
			const changedFields = getChangedFields(conflict);
			for (const field of changedFields) {
				initial[`${conflict.id}:${field.key}`] = 'keep_server';
			}
		}
		choices = initial;
	});

	// ==========================================================================
	// Helpers
	// ==========================================================================

	function getFieldLabel(conflict: SyncConflict, fieldKey: string): string {
		if (conflict.collection === 'workflow_instance_field_values') {
			// Look up the form field label using field_key from the record data
			const formFieldId = (conflict.localVersion.field_key || conflict.serverVersion.field_key) as string;
			if (formFieldId) {
				const field = formFields.find((f) => f.id === formFieldId);
				if (field) return field.field_label;
			}
		}
		// Generic fallback
		const field = formFields.find((f) => f.id === fieldKey);
		return field?.field_label || fieldKey;
	}

	function formatValue(value: unknown): string {
		if (value === null || value === undefined || value === '') return '(empty)';
		if (typeof value === 'object') return JSON.stringify(value);
		return String(value);
	}

	function toggleChoice(conflictId: string, fieldKey: string) {
		const choiceKey = `${conflictId}:${fieldKey}`;
		choices[choiceKey] = choices[choiceKey] === 'keep_server' ? 'reapply_local' : 'keep_server';
	}

	// ==========================================================================
	// Submit
	// ==========================================================================

	async function handleApply() {
		isSubmitting = true;

		try {
			const resolutions: ConflictResolution[] = conflicts.map((conflict) => {
				const changedFields = getChangedFields(conflict);
				const localFields = changedFields
					.filter((f) => choices[`${conflict.id}:${f.key}`] === 'reapply_local')
					.map((f) => f.key);

				return {
					conflictId: conflict.id,
					action: localFields.length > 0 ? 'reapply_local' : 'keep_server',
					fieldsToReapply: localFields.length > 0 ? localFields : undefined
				};
			});

			await onResolve(resolutions);
		} catch (error) {
			console.error('Failed to resolve conflicts:', error);
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="flex flex-col gap-4 p-4">
	<div class="flex items-center gap-2 text-amber-600 dark:text-amber-400">
		<AlertTriangle class="h-5 w-5 flex-shrink-0" />
		<p class="text-sm font-medium">
			{conflicts.length === 1
				? 'One of your changes was overridden by a newer server version.'
				: `${conflicts.length} of your changes were overridden by newer server versions.`}
		</p>
	</div>

	<p class="text-xs text-muted-foreground">
		For each field, choose whether to keep the current server value or re-apply your original value.
	</p>

	<!-- Conflict List -->
	<div class="space-y-4">
		{#each conflicts as conflict (conflict.id)}
			{@const changedFields = getChangedFields(conflict)}

			{#if changedFields.length > 0}
				<div class="rounded-lg border p-3 space-y-3">
					<div class="text-xs font-medium text-muted-foreground">
						{conflict.collection} / {conflict.recordId}
					</div>

					{#each changedFields as field (field.key)}
						{@const choiceKey = `${conflict.id}:${field.key}`}
						{@const isLocal = choices[choiceKey] === 'reapply_local'}

						<div class="space-y-1.5">
							<div class="text-sm font-medium">{getFieldLabel(conflict, field.key)}</div>

							<div class="grid grid-cols-2 gap-2">
								<!-- Server value (left) -->
								<button
									class="rounded-md border p-2 text-left transition-colors {!isLocal
										? 'border-green-500 bg-green-50 dark:bg-green-950'
										: 'border-muted hover:border-muted-foreground/30'}"
									onclick={() => {
										choices[choiceKey] = 'keep_server';
									}}
								>
									<div class="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
										{#if !isLocal}<Check class="h-3 w-3 text-green-600" />{/if}
										Current value
									</div>
									<div class="text-xs break-all">{formatValue(field.serverValue)}</div>
								</button>

								<!-- Local value (right) -->
								<button
									class="rounded-md border p-2 text-left transition-colors {isLocal
										? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
										: 'border-muted hover:border-muted-foreground/30'}"
									onclick={() => {
										choices[choiceKey] = 'reapply_local';
									}}
								>
									<div class="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
										{#if isLocal}<RotateCcw class="h-3 w-3 text-blue-600" />{/if}
										Your value
									</div>
									<div class="text-xs break-all">{formatValue(field.localValue)}</div>
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{/each}
	</div>

	<!-- Action Buttons -->
	<div class="sticky bottom-0 flex gap-2 bg-background pt-2">
		<Button variant="outline" class="flex-1" onclick={onCancel} disabled={isSubmitting}>
			Cancel
		</Button>
		<Button class="flex-1" onclick={handleApply} disabled={isSubmitting}>
			{#if isSubmitting}
				Applying...
			{:else}
				Apply
			{/if}
		</Button>
	</div>
</div>
