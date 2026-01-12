<script lang="ts">
	import { X, ChevronLeft, ChevronRight } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	import FieldTypesPalette from './FieldTypesPalette.svelte';
	import FieldConfigPanel from './FieldConfigPanel.svelte';
	import FormPreview from './FormPreview.svelte';

	import type { ToolsForm, ToolsFormField, TrackedFormField, WorkflowStage, ColumnPosition } from '$lib/workflow-builder';

	type AncestorFieldGroup = {
		stage: WorkflowStage;
		form: ToolsForm;
		fields: ToolsFormField[];
	};

	type Props = {
		/** The form being edited */
		form: ToolsForm;
		/** Fields for this form */
		fields: TrackedFormField[];
		/** Ancestor fields for smart dropdown configuration */
		ancestorFields?: AncestorFieldGroup[];
		/** Callback when form name changes */
		onFormNameChange?: (name: string) => void;
		/** Callback when a field is added */
		onAddField?: (fieldType: string, page: number, rowIndex: number, columnPosition: ColumnPosition) => void;
		/** Callback when a field is updated */
		onFieldUpdate?: (fieldId: string, updates: Partial<ToolsFormField>) => void;
		/** Callback when a field is deleted */
		onFieldDelete?: (fieldId: string) => void;
		/** Callback when fields are reordered */
		onFieldsReorder?: (fieldIds: string[]) => void;
		/** Callback when a page is added */
		onAddPage?: () => void;
		/** Callback when a page is deleted */
		onDeletePage?: (page: number) => void;
		/** Callback when a page title changes */
		onPageTitleChange?: (page: number, title: string) => void;
		/** Callback to close the form editor */
		onClose?: () => void;
		/** Callback when palette expanded state changes */
		onPaletteExpandedChange?: (expanded: boolean) => void;
	};

	let {
		form,
		fields,
		ancestorFields = [],
		onFormNameChange,
		onAddField,
		onFieldUpdate,
		onFieldDelete,
		onFieldsReorder,
		onAddPage,
		onDeletePage,
		onPageTitleChange,
		onClose,
		onPaletteExpandedChange
	}: Props = $props();

	// Palette expanded state (for field types view)
	let paletteExpanded = $state(false);

	// Currently selected field for editing
	let selectedFieldId = $state<string | null>(null);

	// Get selected field data
	const selectedField = $derived(
		selectedFieldId ? fields.find((f) => f.data.id === selectedFieldId)?.data : null
	);

	// Compute available source fields for smart dropdown:
	// - All ancestor fields (from previous stages/connections)
	// - Fields from current form that come BEFORE the selected field
	const availableSourceFields = $derived.by((): AncestorFieldGroup[] => {
		if (!selectedField) return [];

		const result: AncestorFieldGroup[] = [...ancestorFields];

		// Add fields from current form that come before the selected field
		const currentFormFieldsBefore = fields
			.filter((f) => {
				const fieldOrder = f.data.field_order ?? 0;
				const selectedOrder = selectedField.field_order ?? 0;
				return f.data.id !== selectedField.id && fieldOrder < selectedOrder;
			})
			.map((f) => f.data);

		if (currentFormFieldsBefore.length > 0) {
			result.push({
				stage: { id: 'current', stage_name: 'Current Form', stage_type: 'intermediate', workflow_id: form.workflow_id, position_x: 0, position_y: 0 },
				form: form,
				fields: currentFormFieldsBefore
			});
		}

		return result;
	});

	// Left panel is "wide" when palette is expanded OR when config is shown
	const leftPanelWide = $derived(paletteExpanded || selectedField !== null);

	// Form name local state
	let formName = $state(form.name);

	// Sync form name when form changes
	$effect(() => {
		formName = form.name;
	});

	// Notify parent when left panel width changes
	$effect(() => {
		onPaletteExpandedChange?.(leftPanelWide);
	});

	function handleFormNameBlur() {
		if (formName !== form.name && formName.trim()) {
			onFormNameChange?.(formName.trim());
		}
	}

	function handleFieldDrop(fieldType: string, page: number, rowIndex: number, columnPosition: ColumnPosition) {
		onAddField?.(fieldType, page, rowIndex, columnPosition);
	}

	function handleFieldSelect(fieldId: string) {
		// Toggle selection, or select new field
		selectedFieldId = selectedFieldId === fieldId ? null : fieldId;
	}

	function handleFieldConfigClose() {
		selectedFieldId = null;
	}

	function handleFieldConfigUpdate(updates: Partial<ToolsFormField>) {
		if (selectedFieldId) {
			onFieldUpdate?.(selectedFieldId, updates);
		}
	}

	function handleFieldConfigDelete() {
		if (selectedFieldId) {
			onFieldDelete?.(selectedFieldId);
			selectedFieldId = null;
		}
	}

	function togglePalette() {
		paletteExpanded = !paletteExpanded;
	}
</script>

<div class="form-editor">
	<!-- Header -->
	<div class="form-editor-header">
		<div class="header-content">
			<div class="header-title">
				<Label for="form-name" class="sr-only">Form Name</Label>
				<Input
					id="form-name"
					bind:value={formName}
					onblur={handleFormNameBlur}
					class="form-name-input"
					placeholder="Form name..."
				/>
			</div>
			<Button variant="ghost" size="icon" onclick={onClose} class="close-btn">
				<X class="h-4 w-4" />
			</Button>
		</div>
	</div>

	<!-- Main content area -->
	<div class="form-editor-content">
		<!-- Left Panel: Field Types Palette OR Field Config -->
		<div class="left-panel" class:wide={leftPanelWide}>
			{#if selectedField}
				<!-- Field Configuration Mode -->
				<FieldConfigPanel
					field={selectedField}
					ancestorFields={availableSourceFields}
					onUpdate={handleFieldConfigUpdate}
					onDelete={handleFieldConfigDelete}
					onClose={handleFieldConfigClose}
				/>
			{:else}
				<!-- Field Types Palette Mode -->
				<button class="palette-toggle" onclick={togglePalette} type="button">
					{#if paletteExpanded}
						<ChevronRight class="h-4 w-4" />
					{:else}
						<ChevronLeft class="h-4 w-4" />
					{/if}
				</button>
				<FieldTypesPalette
					expanded={paletteExpanded}
					onFieldDrag={handleFieldDrop}
				/>
			{/if}
		</div>

		<!-- Form Preview (main area) -->
		<div class="preview-container">
			<FormPreview
				{fields}
				{selectedFieldId}
				onFieldSelect={handleFieldSelect}
				onFieldsReorder={onFieldsReorder}
				onFieldDrop={handleFieldDrop}
				{onFieldUpdate}
				{onAddPage}
				{onDeletePage}
				{onPageTitleChange}
			/>
		</div>
	</div>
</div>

<style>
	.form-editor {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: hsl(var(--background));
	}

	.form-editor-header {
		padding: 0.75rem 1rem;
		border-bottom: 1px solid oklch(0.88 0.01 250);
		flex-shrink: 0;
	}

	:global(.dark) .form-editor-header {
		border-bottom-color: oklch(1 0 0 / 20%);
	}

	.header-content {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.header-title {
		flex: 1;
	}

	.header-title :global(.form-name-input) {
		font-weight: 600;
		font-size: 1rem;
	}

	.close-btn {
		flex-shrink: 0;
	}

	.form-editor-content {
		display: flex;
		flex: 1;
		overflow: hidden;
	}

	.left-panel {
		display: flex;
		flex-shrink: 0;
		border-right: 1px solid oklch(0.88 0.01 250);
		width: 68px; /* toggle (20px) + palette collapsed (48px) */
		transition: width 0.2s ease;
		overflow: hidden;
	}

	.left-panel.wide {
		width: 200px; /* expanded palette or config panel */
	}

	:global(.dark) .left-panel {
		border-right-color: oklch(1 0 0 / 20%);
	}

	.palette-toggle {
		width: 20px;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(var(--muted));
		border: none;
		border-right: 1px solid hsl(var(--border));
		cursor: pointer;
		transition: all 0.15s ease;
		flex-shrink: 0;
		color: hsl(var(--muted-foreground));
	}

	.palette-toggle:hover {
		background: hsl(var(--accent));
		color: hsl(var(--primary));
	}

	.preview-container {
		flex: 1;
		overflow: auto;
		display: flex;
		justify-content: center;
		padding: 1rem;
		background: oklch(0.95 0.005 250);
	}

	:global(.dark) .preview-container {
		background: oklch(0.15 0.02 260);
	}
</style>
