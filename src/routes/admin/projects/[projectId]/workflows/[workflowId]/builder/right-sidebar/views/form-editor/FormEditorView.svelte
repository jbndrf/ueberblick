<script lang="ts">
	import {
		X,
		ChevronLeft,
		ChevronRight,
		Settings2,
		Braces,
		LayoutGrid,
		Trash2
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import InlineEdit from '../../../components/InlineEdit.svelte';

	import FieldTypesPalette from './FieldTypesPalette.svelte';
	import LibraryFieldsPalette from './LibraryFieldsPalette.svelte';
	import FieldConfigPanel from './FieldConfigPanel.svelte';
	import FormPreview from './FormPreview.svelte';
	import FormJsonView from './FormJsonView.svelte';
	import { getBuilderContext } from '../../../builder-context.svelte';

	import type {
		ToolsForm,
		ToolsFormField,
		TrackedFormField,
		WorkflowStage,
		ColumnPosition,
		WorkflowFieldDef,
		ProtocolLocalFieldDef,
		FieldType
	} from '$lib/workflow-builder';
	import type { FormPart, FormImportResult } from '$lib/workflow-builder/transfer';
	import {
		formEditorViewButtonRoleSettings,
		formEditorViewFormNamePlaceholder,
		formEditorScopeLifecycle,
		formEditorScopeLocal,
		formEditorViewToggleBuilder,
		formEditorViewToggleJson,
		formEditorViewDeleteButton,
		builderClickToRename
	} from '$lib/paraglide/messages';

	type AncestorFieldGroup = {
		stage: WorkflowStage;
		form: ToolsForm;
		fields: ToolsFormField[];
	};

	type Role = {
		id: string;
		name: string;
		description?: string;
	};

	type Props = {
		/** The form being edited */
		form: ToolsForm;
		/** Fields for this form */
		fields: TrackedFormField[];
		/** Ancestor fields for smart dropdown configuration */
		ancestorFields?: AncestorFieldGroup[];
		/** Available roles for permissions (only used for stage-attached forms) */
		roles?: Role[];
		/** Callback when form name changes */
		onFormNameChange?: (name: string) => void;
		/** Callback when a field is added (legacy: creates a fresh def + ref) */
		onAddField?: (
			fieldType: string,
			page: number,
			rowIndex: number,
			columnPosition: ColumnPosition
		) => void;
		/** Workflow-scoped field-def registry */
		fieldDefs?: WorkflowFieldDef[];
		/** Callback when an existing field def is dropped onto the form (creates a ref only) */
		onAddFieldRef?: (
			fieldDefId: string,
			page: number,
			rowIndex: number,
			columnPosition: ColumnPosition
		) => void;
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
		/** Callback when a page description changes */
		onPageDescriptionChange?: (page: number, description: string) => void;
		/** Callback to close the form editor */
		onClose?: () => void;
		/** Delete this form. Omit to hide the delete affordance (e.g. protocol-backing forms). */
		onDelete?: () => void;
		/** Callback when palette expanded state changes */
		onPaletteExpandedChange?: (expanded: boolean) => void;
		/** Show the protocol-local fields panel (true when this form backs a protocol tool). */
		showLocalFields?: boolean;
		/** Current local fields (only when showLocalFields=true). */
		localFields?: ProtocolLocalFieldDef[];
		/** Persist changes to local fields. */
		onLocalFieldsChange?: (next: ProtocolLocalFieldDef[]) => void;
		/** Create a new form from a pasted/edited YAML definition (code view). */
		onImportForm?: (part: FormPart) => FormImportResult | undefined;
		/** Usage count of a field def across all forms (for the def-section hint). */
		getDefUsageCount?: (defId: string) => number;
	};

	let {
		form,
		fields,
		ancestorFields = [],
		roles = [],
		onFormNameChange,
		onAddField,
		onFieldUpdate,
		onFieldDelete,
		onFieldsReorder,
		onAddPage,
		onDeletePage,
		onPageTitleChange,
		onPageDescriptionChange,
		onClose,
		onDelete,
		onPaletteExpandedChange,
		fieldDefs = [],
		onAddFieldRef,
		showLocalFields = false,
		localFields = [],
		onLocalFieldsChange,
		onImportForm,
		getDefUsageCount
	}: Props = $props();

	function uniqueLocalKey(base: string): string {
		const taken = new Set((localFields ?? []).map((f) => f.key));
		if (!taken.has(base)) return base;
		let i = 2;
		while (taken.has(`${base}_${i}`)) i++;
		return `${base}_${i}`;
	}

	const usedDefIds = $derived(
		new Set(
			fields
				.filter((f) => f.status !== 'deleted' && f.data.field_def_id)
				.map((f) => f.data.field_def_id as string)
		)
	);

	// Stage-attached and global forms have their own button/role config;
	// connection-attached forms inherit it from the connection.
	const hasOwnButtonConfig = $derived(!form.connection_id);

	/**
	 * Local fields are rendered in the same FormPreview as library refs by
	 * synthesizing TrackedFormField rows with `id = "local:<key>"`. All edit
	 * paths (config panel, drag-reorder, delete) detect the prefix and route
	 * back into `onLocalFieldsChange` instead of mutating real refs.
	 */
	const LOCAL_ID_PREFIX = 'local:';
	const syntheticLocalFields = $derived.by((): TrackedFormField[] => {
		if (!showLocalFields) return [];
		return (localFields ?? []).map((lf) => ({
			data: {
				id: `${LOCAL_ID_PREFIX}${lf.key}`,
				form_id: form.id,
				field_def_id: undefined,
				field_order: 0,
				page: lf.page,
				row_index: lf.row_index,
				column_position: lf.column_position,
				field_label: lf.label,
				field_type: lf.field_type,
				is_required: lf.required,
				placeholder: lf.placeholder ?? undefined,
				help_text: lf.help_text ?? undefined,
				field_options: lf.field_options ?? undefined,
				conditional_logic: lf.conditional_logic ?? null
			} as ToolsFormField,
			original: null,
			status: 'unchanged'
		})) as unknown as TrackedFormField[];
	});

	const mergedFields = $derived.by((): TrackedFormField[] => {
		if (!showLocalFields) return fields;
		return [...fields, ...syntheticLocalFields];
	});

	function isLocalId(id: string): boolean {
		return id.startsWith(LOCAL_ID_PREFIX);
	}
	function localKeyFromId(id: string): string {
		return id.slice(LOCAL_ID_PREFIX.length);
	}

	function patchLocalField(key: string, updates: Partial<ToolsFormField>) {
		const list = localFields ?? [];
		const next = list.map((lf) => {
			if (lf.key !== key) return lf;
			return {
				...lf,
				label: updates.field_label ?? lf.label,
				field_type:
					(updates.field_type as Exclude<FieldType, 'instance_reference'> | undefined) ??
					lf.field_type,
				required: updates.is_required ?? lf.required,
				placeholder:
					updates.placeholder !== undefined ? (updates.placeholder ?? null) : lf.placeholder,
				help_text: updates.help_text !== undefined ? (updates.help_text ?? null) : lf.help_text,
				field_options:
					updates.field_options !== undefined ? (updates.field_options ?? null) : lf.field_options,
				page: updates.page ?? lf.page,
				row_index: updates.row_index ?? lf.row_index,
				column_position:
					(updates.column_position as ProtocolLocalFieldDef['column_position'] | undefined) ??
					lf.column_position,
				conditional_logic:
					updates.conditional_logic !== undefined
						? (updates.conditional_logic ?? null)
						: (lf.conditional_logic ?? null)
			};
		});
		onLocalFieldsChange?.(next);
	}

	function deleteLocalField(key: string) {
		onLocalFieldsChange?.((localFields ?? []).filter((lf) => lf.key !== key));
	}

	function handleFieldUpdateRouted(fieldId: string, updates: Partial<ToolsFormField>) {
		if (isLocalId(fieldId)) {
			patchLocalField(localKeyFromId(fieldId), updates);
			return;
		}
		onFieldUpdate?.(fieldId, updates);
	}

	function handleFieldDeleteRouted(fieldId: string) {
		if (isLocalId(fieldId)) {
			deleteLocalField(localKeyFromId(fieldId));
			return;
		}
		onFieldDelete?.(fieldId);
	}

	function handleFieldsReorderRouted(fieldIds: string[]) {
		// Library and local fields share the canvas. Reorder writes positional
		// hints to whichever store each id belongs to.
		const libraryOrder = fieldIds.filter((id) => !isLocalId(id));
		if (libraryOrder.length > 0) onFieldsReorder?.(libraryOrder);

		const localOrder = fieldIds.filter(isLocalId).map(localKeyFromId);
		if (localOrder.length > 0 && (localFields?.length ?? 0) > 0) {
			const byKey = new Map((localFields ?? []).map((lf) => [lf.key, lf]));
			// Reorder the array to match the new visual order but PRESERVE each
			// field's row_index/column_position — those are owned by the drop and
			// config handlers (patchLocalField). Rewriting row_index here forced
			// one local field per row, so two local fields could never share a
			// row (left/right). Library fields aren't affected because their
			// reorder only updates field_order, never row_index.
			const reordered = localOrder
				.map((k) => byKey.get(k))
				.filter((x): x is ProtocolLocalFieldDef => x != null);
			const seen = new Set(localOrder);
			const rest = (localFields ?? []).filter((lf) => !seen.has(lf.key));
			const next = [...reordered, ...rest];
			if (next.length > 0) onLocalFieldsChange?.(next);
		}
	}

	const { ui } = getBuilderContext();

	// Palette expanded state (for field types view)
	let paletteExpanded = $state(false);
	let viewMode = $state<'builder' | 'json'>('builder');

	// Currently selected field for editing
	let selectedFieldId = $state<string | null>(null);

	// Get selected field data (library + synthesized local fields)
	const selectedField = $derived(
		selectedFieldId ? mergedFields.find((f) => f.data.id === selectedFieldId)?.data : null
	);

	// Every field — library or protocol-local — shows form-presentation here and
	// drills to its definition in Panel 3. The drill target differs (shared def vs
	// the form's inline local field), resolved in `openFieldDefinition`.
	function openFieldDefinition() {
		if (!selectedField) return;
		if (isLocalId(selectedField.id)) {
			ui.toggleDetail({
				kind: 'localField',
				formId: form.id,
				key: localKeyFromId(selectedField.id)
			});
		} else if (selectedField.field_def_id) {
			ui.toggleDetail({ kind: 'fieldDef', id: selectedField.field_def_id });
		}
	}

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
				stage: {
					id: 'current',
					stage_name: 'Current Form',
					stage_type: 'intermediate',
					workflow_id: form.workflow_id,
					position_x: 0,
					position_y: 0
				},
				form: form,
				fields: currentFormFieldsBefore
			});
		}

		return result;
	});

	// Left panel is "wide" when palette is expanded OR when config is shown
	const leftPanelWide = $derived(paletteExpanded || selectedField !== null);

	// Notify parent when left panel width changes
	$effect(() => {
		onPaletteExpandedChange?.(leftPanelWide);
	});

	function handleFieldDrop(
		fieldType: string,
		page: number,
		rowIndex: number,
		columnPosition: ColumnPosition
	) {
		// In protocol mode, the field-types palette doesn't create new
		// workflow_field_defs — it creates protocol-local fields stored on
		// tools_forms.local_fields. Anything else (library palette) stays
		// unchanged: those drops go through onAddFieldRef on the FormPreview.
		if (showLocalFields) {
			addLocalFieldAt(
				fieldType as Exclude<FieldType, 'instance_reference'>,
				page,
				rowIndex,
				columnPosition
			);
			return;
		}
		onAddField?.(fieldType, page, rowIndex, columnPosition);
	}

	function addLocalFieldAt(
		fieldType: Exclude<FieldType, 'instance_reference'>,
		page: number,
		rowIndex: number,
		columnPosition: ColumnPosition
	) {
		const key = uniqueLocalKey('field');
		const next: ProtocolLocalFieldDef[] = [
			...(localFields ?? []),
			{
				key,
				label: 'New field',
				field_type: fieldType,
				field_options: null,
				required: false,
				placeholder: null,
				help_text: null,
				page,
				row_index: rowIndex,
				column_position: columnPosition
			}
		];
		onLocalFieldsChange?.(next);
	}

	function handleFieldSelect(fieldId: string) {
		// Toggle selection, or select new field. Changing field collapses the
		// deeper definition panel (Panel 3) so the breadcrumb never goes stale.
		selectedFieldId = selectedFieldId === fieldId ? null : fieldId;
		ui.detailTarget = null;
	}

	function handleFieldConfigClose() {
		selectedFieldId = null;
		ui.detailTarget = null;
	}

	function handleFieldConfigUpdate(updates: Partial<ToolsFormField>) {
		if (selectedFieldId) {
			handleFieldUpdateRouted(selectedFieldId, updates);
		}
	}

	function handleFieldConfigDelete() {
		if (selectedFieldId) {
			handleFieldDeleteRouted(selectedFieldId);
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
				<InlineEdit
					value={form.name}
					onCommit={(v) => onFormNameChange?.(v)}
					class="w-full cursor-text truncate border-b border-transparent bg-transparent text-left text-base font-semibold text-foreground transition outline-none placeholder:text-muted-foreground hover:border-border focus:border-primary"
					placeholder={formEditorViewFormNamePlaceholder?.() ?? 'Form name...'}
					ariaLabel={formEditorViewFormNamePlaceholder?.() ?? 'Form name'}
					editTitle={builderClickToRename?.() ?? 'Click to rename'}
				/>
			</div>
			{#if hasOwnButtonConfig}
				<Button
					variant={ui.configTarget?.kind === 'form' && ui.configTarget?.id === form.id
						? 'secondary'
						: 'ghost'}
					size="icon"
					onclick={() => ui.toggleConfig('form', form.id)}
					class="settings-btn"
					title={formEditorViewButtonRoleSettings?.() ?? 'Button & Role Settings'}
				>
					<Settings2 class="h-4 w-4" />
				</Button>
			{/if}
			<Button
				variant={viewMode === 'json' ? 'secondary' : 'ghost'}
				size="icon"
				onclick={() => (viewMode = viewMode === 'json' ? 'builder' : 'json')}
				class="settings-btn"
				title={viewMode === 'json'
					? (formEditorViewToggleBuilder?.() ?? 'Builder view')
					: (formEditorViewToggleJson?.() ?? 'JSON view')}
			>
				{#if viewMode === 'json'}
					<LayoutGrid class="h-4 w-4" />
				{:else}
					<Braces class="h-4 w-4" />
				{/if}
			</Button>
			<Button variant="ghost" size="icon" onclick={onClose} class="close-btn">
				<X class="h-4 w-4" />
			</Button>
		</div>
	</div>

	<!-- Main content area -->
	<div class="form-editor-content">
		{#if viewMode === 'json'}
			<FormJsonView {form} fields={mergedFields} {onImportForm} />
		{:else}
			<!-- Left Panel: Field Types Palette OR Field Config -->
			<div class="left-panel" class:wide={leftPanelWide}>
				{#if selectedField}
					<!-- Field Configuration Mode -->
					<FieldConfigPanel
						field={selectedField}
						scope="form"
						ancestorFields={availableSourceFields}
						{roles}
						usageCount={!isLocalId(selectedField.id) && selectedField.field_def_id
							? (getDefUsageCount?.(selectedField.field_def_id) ?? null)
							: null}
						onUpdate={handleFieldConfigUpdate}
						onDelete={handleFieldConfigDelete}
						onClose={handleFieldConfigClose}
						onEditDefinition={openFieldDefinition}
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
					<div class="palettes-stack">
						<LibraryFieldsPalette
							expanded={paletteExpanded}
							{fieldDefs}
							{usedDefIds}
							getUsageCount={getDefUsageCount}
							onPick={(defId) => {
								const pages = fields.map((f) => f.data.page ?? 1);
								const targetPage = pages.length ? Math.max(...pages) : 1;
								const pageRows = fields
									.filter((f) => (f.data.page ?? 1) === targetPage)
									.map((f) => f.data.row_index ?? 0);
								const nextRow = pageRows.length ? Math.max(...pageRows) + 1 : 0;
								onAddFieldRef?.(defId, targetPage, nextRow, 'full');
							}}
						/>
						<FieldTypesPalette
							expanded={paletteExpanded}
							onFieldDrag={(fieldType) => handleFieldDrop(fieldType, 0, 0, 'left')}
						/>
					</div>
				{/if}
			</div>

			<!-- Form Preview (main area) -->
			<div class="preview-container">
				{#if showLocalFields}
					<div class="scope-legend">
						<span class="scope-legend-item">
							<span class="scope-swatch scope-swatch-lifecycle"></span>
							{formEditorScopeLifecycle?.() ?? 'Lifecycle field (case data)'}
						</span>
						<span class="scope-legend-item">
							<span class="scope-swatch scope-swatch-local"></span>
							{formEditorScopeLocal?.() ?? 'Protocol-only field'}
						</span>
					</div>
				{/if}
				<FormPreview
					fields={mergedFields}
					{selectedFieldId}
					onFieldSelect={handleFieldSelect}
					onFieldsReorder={handleFieldsReorderRouted}
					onFieldDrop={handleFieldDrop}
					onFieldRefDrop={(defId, page, rowIndex, columnPosition) =>
						onAddFieldRef?.(defId, page, rowIndex, columnPosition)}
					onFieldUpdate={handleFieldUpdateRouted}
					pages={form.pages ?? []}
					{onAddPage}
					{onDeletePage}
					{onPageTitleChange}
					{onPageDescriptionChange}
					scopeTinted={showLocalFields}
				/>
			</div>
		{/if}
	</div>

	{#if onDelete}
		<div class="editor-footer">
			<Button variant="destructive" size="sm" onclick={onDelete} class="w-full">
				<Trash2 class="mr-2 h-4 w-4" />
				{formEditorViewDeleteButton?.() ?? 'Delete Form'}
			</Button>
		</div>
	{/if}
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

	.close-btn {
		flex-shrink: 0;
	}

	.form-editor-content {
		display: flex;
		flex: 1;
		overflow: hidden;
	}

	.editor-footer {
		flex-shrink: 0;
		padding: 1rem;
		border-top: 1px solid oklch(0.88 0.01 250);
		background: hsl(var(--background));
	}

	:global(.dark) .editor-footer {
		border-top-color: oklch(1 0 0 / 20%);
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

	.palettes-stack {
		display: flex;
		flex-direction: column;
		min-height: 0;
		flex: 1;
		overflow-y: auto;
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
		flex-direction: column;
		align-items: center;
		padding: 1rem;
		background: oklch(0.95 0.005 250);
	}

	:global(.dark) .preview-container {
		background: oklch(0.15 0.02 260);
	}

	.scope-legend {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		justify-content: center;
		margin-bottom: 0.75rem;
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
	}

	.scope-legend-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.scope-swatch {
		width: 0.75rem;
		height: 0.75rem;
		border-radius: 0.25rem;
		border: 1px solid;
	}

	.scope-swatch-lifecycle {
		background: oklch(0.97 0.025 240);
		border-color: oklch(0.85 0.05 240);
	}

	.scope-swatch-local {
		background: oklch(0.97 0.04 150);
		border-color: oklch(0.85 0.06 150);
	}

	:global(.dark) .scope-swatch-lifecycle {
		background: oklch(0.28 0.04 240);
		border-color: oklch(0.42 0.06 240);
	}

	:global(.dark) .scope-swatch-local {
		background: oklch(0.28 0.05 150);
		border-color: oklch(0.42 0.07 150);
	}

	/* Settings button */
	.settings-btn {
		flex-shrink: 0;
	}
</style>
