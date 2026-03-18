<script lang="ts">
	import { ChevronDown, ChevronRight, CheckSquare, Square } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import AncestorFieldItem from './AncestorFieldItem.svelte';
	import type { ToolsFormField } from '$lib/workflow-builder';

	type Props = {
		stageName: string;
		formName: string;
		fields: ToolsFormField[];
		selectedFieldIds: string[];
		onToggleField?: (fieldId: string) => void;
		defaultOpen?: boolean;
		showPrefillToggle?: boolean;
		prefillConfig?: Record<string, boolean>;
		onTogglePrefill?: (fieldId: string) => void;
	};

	let {
		stageName,
		formName,
		fields,
		selectedFieldIds,
		onToggleField,
		defaultOpen = true,
		showPrefillToggle = false,
		prefillConfig = {},
		onTogglePrefill
	}: Props = $props();

	let isOpen = $state(defaultOpen);

	// Count how many fields are selected
	const selectedCount = $derived(
		fields.filter((f) => selectedFieldIds.includes(f.id)).length
	);

	const allSelected = $derived(selectedCount === fields.length && fields.length > 0);
	const someSelected = $derived(selectedCount > 0 && selectedCount < fields.length);

	function toggleOpen() {
		isOpen = !isOpen;
	}

	function handleSelectAll() {
		if (!onToggleField) return;

		if (allSelected) {
			// Deselect all
			for (const field of fields) {
				if (selectedFieldIds.includes(field.id)) {
					onToggleField(field.id);
				}
			}
		} else {
			// Select all
			for (const field of fields) {
				if (!selectedFieldIds.includes(field.id)) {
					onToggleField(field.id);
				}
			}
		}
	}
</script>

<div class="field-group">
	<button type="button" class="group-header" onclick={toggleOpen}>
		<span class="collapse-icon">
			{#if isOpen}
				<ChevronDown class="h-3.5 w-3.5" />
			{:else}
				<ChevronRight class="h-3.5 w-3.5" />
			{/if}
		</span>
		<div class="group-info">
			<span class="stage-name">{stageName}</span>
			<span class="form-name">{formName}</span>
		</div>
		<span class="selection-count" class:has-selection={selectedCount > 0}>
			{selectedCount}/{fields.length}
		</span>
	</button>

	{#if isOpen}
		<div class="group-content">
			<button
				type="button"
				class="select-all-btn"
				onclick={(e) => { e.stopPropagation(); handleSelectAll(); }}
			>
				{#if allSelected}
					<CheckSquare class="h-3.5 w-3.5" />
					<span>Deselect all</span>
				{:else}
					<Square class="h-3.5 w-3.5" />
					<span>Select all</span>
				{/if}
			</button>

			<div class="fields-list">
				{#each fields as field (field.id)}
					<AncestorFieldItem
						{field}
						isSelected={selectedFieldIds.includes(field.id)}
						onToggle={() => onToggleField?.(field.id)}
						{showPrefillToggle}
						prefillEnabled={prefillConfig[field.id] !== false}
						onTogglePrefill={() => onTogglePrefill?.(field.id)}
					/>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.field-group {
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		overflow: hidden;
	}

	.group-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 0.625rem;
		background: hsl(var(--muted) / 0.5);
		border: none;
		cursor: pointer;
		transition: background 0.15s ease;
		text-align: left;
	}

	.group-header:hover {
		background: hsl(var(--muted));
	}

	.collapse-icon {
		flex-shrink: 0;
		color: hsl(var(--muted-foreground));
	}

	.group-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.stage-name {
		font-size: 0.75rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.form-name {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.selection-count {
		flex-shrink: 0;
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		padding: 0.125rem 0.375rem;
		background: hsl(var(--background));
		border-radius: 0.25rem;
	}

	.selection-count.has-selection {
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary));
		font-weight: 500;
	}

	.group-content {
		padding: 0.5rem;
		background: hsl(var(--background));
	}

	.select-all-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		width: 100%;
		padding: 0.25rem 0.5rem;
		margin-bottom: 0.25rem;
		border: none;
		background: transparent;
		border-radius: 0.25rem;
		cursor: pointer;
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		transition: all 0.15s ease;
	}

	.select-all-btn:hover {
		background: hsl(var(--accent));
		color: hsl(var(--foreground));
	}

	.fields-list {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}
</style>
