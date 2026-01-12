<script lang="ts">
	import { GripVertical, Upload, ChevronDown, Pencil, Shield, GitBranch } from 'lucide-svelte';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Type } from 'lucide-svelte';

	import { fieldTypeIcons, type ToolsFormField } from '$lib/workflow-builder';

	type Props = {
		field: ToolsFormField;
		selected?: boolean;
		dragging?: boolean;
		halfWidth?: boolean;
		onSelect?: () => void;
		onUpdate?: (updates: Partial<ToolsFormField>) => void;
		onDragStart?: () => void;
		onDragEnd?: () => void;
	};

	let {
		field,
		selected = false,
		dragging = false,
		halfWidth = false,
		onSelect,
		onUpdate,
		onDragStart,
		onDragEnd
	}: Props = $props();

	// Inline label editing state
	let isEditingLabel = $state(false);
	let editingLabel = $state(field.field_label);
	let labelInputRef = $state<HTMLInputElement | null>(null);

	// Drag state - only allow drag when initiated from handle
	let canDrag = $state(false);

	// Sync label when field changes externally
	$effect(() => {
		if (!isEditingLabel) {
			editingLabel = field.field_label;
		}
	});

	function startEditingLabel(e: Event) {
		e.stopPropagation();
		isEditingLabel = true;
		editingLabel = field.field_label;
		// Focus and select input after it renders
		setTimeout(() => {
			labelInputRef?.focus();
			labelInputRef?.select();
		}, 0);
	}

	function handleLabelKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			finishEditingLabel();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancelEditingLabel();
		}
	}

	function finishEditingLabel() {
		isEditingLabel = false;
		const trimmed = editingLabel.trim();
		if (trimmed && trimmed !== field.field_label) {
			onUpdate?.({ field_label: trimmed });
		} else {
			editingLabel = field.field_label;
		}
	}

	function cancelEditingLabel() {
		isEditingLabel = false;
		editingLabel = field.field_label;
	}

	const Icon = $derived(fieldTypeIcons[field.field_type] || Type);

	// Check if field has validation rules configured
	const hasValidation = $derived(
		field.validation_rules && Object.keys(field.validation_rules).length > 0
	);

	// Check if field has conditional logic
	const hasConditionalLogic = $derived(
		field.conditional_logic && Object.keys(field.conditional_logic).length > 0
	);

	// Handle drag start on the card (only if initiated from handle)
	function handleCardDragStart(e: DragEvent) {
		if (!canDrag) {
			e.preventDefault();
			return;
		}
		e.dataTransfer?.setData('fieldId', field.id);
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
		}
		onDragStart?.();
	}

	function handleCardDragEnd() {
		canDrag = false;
		onDragEnd?.();
	}

	// Handle mousedown on drag handle - enable dragging
	function handleHandleMouseDown(e: MouseEvent) {
		e.stopPropagation();
		canDrag = true;
	}

	// Reset drag state on mouseup anywhere
	function handleMouseUp() {
		// Small delay to allow drag to complete
		setTimeout(() => {
			canDrag = false;
		}, 100);
	}
</script>

<svelte:window onmouseup={handleMouseUp} />

<!-- WYSIWYG Field Preview - looks like actual form field on mobile -->
<div
	class="field-card"
	class:selected
	class:dragging
	class:half-width={halfWidth}
	class:can-drag={canDrag}
	draggable={canDrag}
	ondragstart={handleCardDragStart}
	ondragend={handleCardDragEnd}
	role="button"
	tabindex="0"
	onclick={onSelect}
	onkeydown={(e) => e.key === 'Enter' && onSelect?.()}
>
	<!-- Drag handle (visible on hover/select) -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="drag-handle"
		onmousedown={handleHandleMouseDown}
		onclick={(e) => e.stopPropagation()}
		role="button"
		tabindex="0"
		aria-label="Drag to reorder"
	>
		<GripVertical class="h-4 w-4" />
	</div>

	<!-- Field label (inline editable) -->
	{#if isEditingLabel}
		<input
			bind:this={labelInputRef}
			type="text"
			class="field-label-input"
			bind:value={editingLabel}
			onblur={finishEditingLabel}
			onkeydown={handleLabelKeydown}
		/>
	{:else}
		<button type="button" class="field-label-wrapper" onclick={startEditingLabel}>
			<span class="field-label-text">
				{field.field_label}
				{#if field.is_required}
					<span class="required">*</span>
				{/if}
			</span>
			<span class="edit-hint">
				<Pencil class="h-3 w-3" />
			</span>
		</button>
	{/if}

	<!-- WYSIWYG input preview based on field type -->
	<div class="field-input-preview">
		{#if field.field_type === 'short_text' || field.field_type === 'email'}
			<Input
				disabled
				placeholder={field.placeholder || 'Enter text...'}
				class="preview-input"
			/>
		{:else if field.field_type === 'long_text'}
			<Textarea
				disabled
				placeholder={field.placeholder || 'Enter text...'}
				rows={3}
				class="preview-textarea"
			/>
		{:else if field.field_type === 'number'}
			<Input
				type="number"
				disabled
				placeholder={field.placeholder || '0'}
				class="preview-input"
			/>
		{:else if field.field_type === 'date'}
			<Input
				type="date"
				disabled
				class="preview-input"
			/>
		{:else if field.field_type === 'file'}
			<div class="file-upload-preview">
				<Upload class="h-4 w-4" />
				<span>Choose file...</span>
			</div>
		{:else if field.field_type === 'dropdown' || field.field_type === 'smart_dropdown'}
			<div class="select-preview">
				<span class="select-placeholder">{field.placeholder || 'Select...'}</span>
				<ChevronDown class="h-4 w-4" />
			</div>
		{:else if field.field_type === 'multiple_choice'}
			<div class="multiple-choice-preview">
				<div class="choice-option">
					<div class="checkbox-preview"></div>
					<span>Option 1</span>
				</div>
				<div class="choice-option">
					<div class="checkbox-preview"></div>
					<span>Option 2</span>
				</div>
			</div>
		{/if}
	</div>

	<!-- Help text -->
	{#if field.help_text}
		<p class="field-help">{field.help_text}</p>
	{/if}

	<!-- Field type and status indicators -->
	<div class="field-badges">
		{#if hasValidation}
			<div class="indicator-badge validation" title="Has validation rules">
				<Shield class="h-2.5 w-2.5" />
			</div>
		{/if}
		{#if hasConditionalLogic}
			<div class="indicator-badge conditional" title="Has conditional logic">
				<GitBranch class="h-2.5 w-2.5" />
			</div>
		{/if}
		<div class="field-type-badge">
			<Icon class="h-3 w-3" />
		</div>
	</div>
</div>

<style>
	.field-card {
		position: relative;
		background: hsl(var(--background));
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		padding: 0.875rem;
		padding-left: 2rem;
		transition: all 0.15s ease;
		cursor: pointer;
	}

	.field-card:hover {
		border-color: hsl(var(--primary) / 0.5);
		box-shadow: 0 2px 8px hsl(var(--foreground) / 0.06);
	}

	.field-card.selected {
		border-color: hsl(var(--primary));
		box-shadow: 0 0 0 2px hsl(var(--primary) / 0.15), 0 2px 8px hsl(var(--foreground) / 0.08);
	}

	.field-card.dragging {
		opacity: 0.5;
		transform: scale(0.98);
		box-shadow: 0 4px 12px hsl(var(--foreground) / 0.15);
	}

	.field-card.half-width {
		padding: 0.625rem;
		padding-left: 1.75rem;
	}

	.field-card.half-width .field-label {
		font-size: 0.8125rem;
	}

	/* When card is ready to be dragged */
	.field-card.can-drag {
		cursor: grabbing;
	}

	.drag-handle {
		position: absolute;
		left: 0.25rem;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem;
		cursor: grab;
		color: hsl(var(--muted-foreground));
		border-radius: 0.25rem;
		opacity: 0.5;
		transition: opacity 0.15s ease, background 0.15s ease;
		z-index: 20;
		pointer-events: auto;
		user-select: none;
		-webkit-user-select: none;
	}

	.field-card:hover .drag-handle,
	.field-card.selected .drag-handle {
		opacity: 1;
	}

	.drag-handle:hover {
		background: hsl(var(--muted));
		color: hsl(var(--foreground));
		opacity: 1;
	}

	.drag-handle:active {
		cursor: grabbing;
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary));
	}

	.drag-handle :global(svg) {
		pointer-events: none;
	}

	.field-label-wrapper {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		margin-bottom: 0.375rem;
		cursor: text;
		border-radius: 0.25rem;
		padding: 0.125rem 0.375rem;
		margin-left: -0.375rem;
		background: transparent;
		border: 1px dashed transparent;
		transition: all 0.15s ease;
		text-align: left;
	}

	.field-label-wrapper:hover {
		background: hsl(var(--muted) / 0.6);
		border-color: hsl(var(--border));
	}

	.field-label-text {
		flex: 1;
	}

	.edit-hint {
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		color: hsl(var(--muted-foreground));
		transition: opacity 0.15s ease;
	}

	.field-label-wrapper:hover .edit-hint {
		opacity: 1;
	}

	.field-label-input {
		display: block;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		margin-bottom: 0.375rem;
		background: hsl(var(--background));
		border: 1px solid hsl(var(--primary));
		border-radius: 0.25rem;
		padding: 0.125rem 0.375rem;
		margin-left: -0.375rem;
		outline: none;
		width: calc(100% + 0.75rem);
		box-shadow: 0 0 0 2px hsl(var(--primary) / 0.2);
	}

	.required {
		color: hsl(var(--destructive));
		margin-left: 0.125rem;
	}

	.field-input-preview {
		pointer-events: none;
	}

	.field-input-preview :global(.preview-input),
	.field-input-preview :global(.preview-textarea) {
		background: hsl(var(--muted) / 0.5);
		cursor: default;
	}

	.file-upload-preview {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: hsl(var(--muted) / 0.5);
		border: 1px dashed hsl(var(--border));
		border-radius: 0.375rem;
		color: hsl(var(--muted-foreground));
		font-size: 0.875rem;
	}

	.select-preview {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		background: hsl(var(--muted) / 0.5);
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		font-size: 0.875rem;
	}

	.select-placeholder {
		color: hsl(var(--muted-foreground));
	}

	.multiple-choice-preview {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.choice-option {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
	}

	.checkbox-preview {
		width: 16px;
		height: 16px;
		border: 1px solid hsl(var(--border));
		border-radius: 0.25rem;
		background: hsl(var(--background));
	}

	.field-help {
		margin-top: 0.375rem;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.field-badges {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.indicator-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		border-radius: 0.25rem;
		opacity: 0;
		transition: opacity 0.15s ease, transform 0.15s ease;
	}

	.field-card:hover .indicator-badge,
	.field-card.selected .indicator-badge {
		opacity: 1;
	}

	.indicator-badge.validation {
		background: hsl(var(--warning, 38 92% 50%) / 0.15);
		color: hsl(var(--warning, 38 92% 50%));
	}

	.indicator-badge.conditional {
		background: hsl(var(--info, 221 83% 53%) / 0.15);
		color: hsl(var(--info, 221 83% 53%));
	}

	.field-type-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		background: hsl(var(--muted));
		border-radius: 0.25rem;
		color: hsl(var(--muted-foreground));
		opacity: 0.6;
		transition: all 0.15s ease;
	}

	.field-card:hover .field-type-badge {
		opacity: 0.8;
	}

	.field-card.selected .field-type-badge {
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary));
		opacity: 1;
	}
</style>
