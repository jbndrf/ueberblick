<script lang="ts">
	import { X, ChevronLeft, ChevronRight, Settings2 } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';

	import FieldTypesPalette from './FieldTypesPalette.svelte';
	import LibraryFieldsPalette from './LibraryFieldsPalette.svelte';
	import FieldConfigPanel from './FieldConfigPanel.svelte';
	import FormPreview from './FormPreview.svelte';

	import type { ToolsForm, ToolsFormField, TrackedFormField, WorkflowStage, ColumnPosition, VisualConfig, WorkflowFieldDef, ProtocolLocalFieldDef, FieldType } from '$lib/workflow-builder';
	import {
		formEditorViewAllowedRoles,
		formEditorViewButtonAppearance,
		formEditorViewButtonColor,
		formEditorViewButtonLabel,
		formEditorViewButtonLabelDefault,
		formEditorViewButtonLabelPlaceholder,
		formEditorViewButtonRoleSettings,
		formEditorViewConfirmationMessage,
		formEditorViewConfirmationMessageDefault,
		formEditorViewFormName,
		formEditorViewFormNamePlaceholder,
		formEditorViewNoRoles,
		formEditorViewRequiresConfirmation,
		formEditorViewRequiresConfirmationDesc,
		formEditorViewRolesHelp,
		formEditorScopeLifecycle,
		formEditorScopeLocal
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
		onAddField?: (fieldType: string, page: number, rowIndex: number, columnPosition: ColumnPosition) => void;
		/** Workflow-scoped field-def registry */
		fieldDefs?: WorkflowFieldDef[];
		/** Callback when an existing field def is dropped onto the form (creates a ref only) */
		onAddFieldRef?: (fieldDefId: string, page: number, rowIndex: number, columnPosition: ColumnPosition) => void;
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
		/** Callback when roles change (only for stage-attached forms) */
		onRolesChange?: (roleIds: string[]) => void;
		/** Callback when visual config changes (only for stage-attached forms) */
		onVisualConfigChange?: (config: VisualConfig) => void;
		/** Show the protocol-local fields panel (true when this form backs a protocol tool). */
		showLocalFields?: boolean;
		/** Current local fields (only when showLocalFields=true). */
		localFields?: ProtocolLocalFieldDef[];
		/** Persist changes to local fields. */
		onLocalFieldsChange?: (next: ProtocolLocalFieldDef[]) => void;
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
		onClose,
		onPaletteExpandedChange,
		onRolesChange,
		onVisualConfigChange,
		fieldDefs = [],
		onAddFieldRef,
		showLocalFields = false,
		localFields = [],
		onLocalFieldsChange
	}: Props = $props();

	function uniqueLocalKey(base: string): string {
		const taken = new Set((localFields ?? []).map((f) => f.key));
		if (!taken.has(base)) return base;
		let i = 2;
		while (taken.has(`${base}_${i}`)) i++;
		return `${base}_${i}`;
	}

	const usedDefIds = $derived(new Set(fields.filter((f) => f.status !== 'deleted' && f.data.field_def_id).map((f) => f.data.field_def_id as string)));

	// Determine if this is a stage-attached form (has its own config)
	const isStageAttached = $derived(!!form.stage_id && !form.connection_id);

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
				field_options: lf.field_options ?? undefined
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
					updates.placeholder !== undefined ? updates.placeholder ?? null : lf.placeholder,
				help_text: updates.help_text !== undefined ? updates.help_text ?? null : lf.help_text,
				field_options:
					updates.field_options !== undefined ? updates.field_options ?? null : lf.field_options,
				page: updates.page ?? lf.page,
				row_index: updates.row_index ?? lf.row_index,
				column_position:
					(updates.column_position as ProtocolLocalFieldDef['column_position'] | undefined) ??
					lf.column_position
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
			const next = localOrder
				.map((k, idx) => {
					const lf = byKey.get(k);
					return lf ? { ...lf, row_index: idx } : null;
				})
				.filter((x): x is ProtocolLocalFieldDef => x !== null);
			if (next.length > 0) onLocalFieldsChange?.(next);
		}
	}

	// Settings panel visibility (only for stage-attached forms)
	let showSettings = $state(false);

	// Palette expanded state (for field types view)
	let paletteExpanded = $state(false);

	// Currently selected field for editing
	let selectedFieldId = $state<string | null>(null);

	// Get selected field data (library + synthesized local fields)
	const selectedField = $derived(
		selectedFieldId ? mergedFields.find((f) => f.data.id === selectedFieldId)?.data : null
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
		// In protocol mode, the field-types palette doesn't create new
		// workflow_field_defs — it creates protocol-local fields stored on
		// tools_forms.local_fields. Anything else (library palette) stays
		// unchanged: those drops go through onAddFieldRef on the FormPreview.
		if (showLocalFields) {
			addLocalFieldAt(fieldType as Exclude<FieldType, 'instance_reference'>, page, rowIndex, columnPosition);
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
		// Toggle selection, or select new field
		selectedFieldId = selectedFieldId === fieldId ? null : fieldId;
	}

	function handleFieldConfigClose() {
		selectedFieldId = null;
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
				<Label for="form-name" class="sr-only">{formEditorViewFormName?.() ?? 'Form Name'}</Label>
				<Input
					id="form-name"
					bind:value={formName}
					onblur={handleFormNameBlur}
					class="form-name-input"
					placeholder={formEditorViewFormNamePlaceholder?.() ?? 'Form name...'}
				/>
			</div>
			{#if isStageAttached}
				<Button
					variant={showSettings ? 'secondary' : 'ghost'}
					size="icon"
					onclick={() => showSettings = !showSettings}
					class="settings-btn"
					title={formEditorViewButtonRoleSettings?.() ?? 'Button & Role Settings'}
				>
					<Settings2 class="h-4 w-4" />
				</Button>
			{/if}
			<Button variant="ghost" size="icon" onclick={onClose} class="close-btn">
				<X class="h-4 w-4" />
			</Button>
		</div>
	</div>

	<!-- Main content area -->
	<div class="form-editor-content">
		{#if showSettings && isStageAttached}
			<!-- Settings Panel (replaces form editor when open) -->
			<div class="settings-panel">
				<div class="settings-section">
					<div class="settings-header">
						<span class="settings-title">{formEditorViewButtonAppearance?.() ?? 'Button Appearance'}</span>
					</div>
					<div class="settings-content">
						<div class="form-field">
							<Label for="button-label">{formEditorViewButtonLabel?.() ?? 'Button Label'}</Label>
							<Input
								id="button-label"
								value={form.visual_config?.button_label || (formEditorViewButtonLabelDefault?.() ?? 'Submit')}
								oninput={(e) => onVisualConfigChange?.({
									...form.visual_config,
									button_label: e.currentTarget.value
								})}
								placeholder={formEditorViewButtonLabelPlaceholder?.() ?? 'e.g., Submit, Save, Continue'}
							/>
						</div>

						<div class="form-field">
							<Label for="button-color">{formEditorViewButtonColor?.() ?? 'Button Color'}</Label>
							<div class="color-picker">
								<input
									type="color"
									id="button-color"
									value={form.visual_config?.button_color || '#3b82f6'}
									oninput={(e) => onVisualConfigChange?.({
										...form.visual_config,
										button_color: e.currentTarget.value
									})}
									class="color-input"
								/>
								<Input
									value={form.visual_config?.button_color || '#3b82f6'}
									oninput={(e) => onVisualConfigChange?.({
										...form.visual_config,
										button_color: e.currentTarget.value
									})}
									placeholder="#3b82f6"
									class="color-text"
								/>
							</div>
						</div>

						<div class="form-field-switch">
							<div class="switch-info">
								<Label for="requires-confirmation">{formEditorViewRequiresConfirmation?.() ?? 'Requires Confirmation'}</Label>
								<p class="switch-description">
									{formEditorViewRequiresConfirmationDesc?.() ?? 'Show a confirmation dialog before submitting'}
								</p>
							</div>
							<Switch
								id="requires-confirmation"
								checked={form.visual_config?.requires_confirmation || false}
								onCheckedChange={(checked) => onVisualConfigChange?.({
									...form.visual_config,
									requires_confirmation: checked
								})}
							/>
						</div>

						{#if form.visual_config?.requires_confirmation}
							<div class="form-field">
								<Label for="confirmation-message">{formEditorViewConfirmationMessage?.() ?? 'Confirmation Message'}</Label>
								<Input
									id="confirmation-message"
									value={form.visual_config?.confirmation_message || (formEditorViewConfirmationMessageDefault?.() ?? 'Are you sure you want to submit?')}
									oninput={(e) => onVisualConfigChange?.({
										...form.visual_config,
										confirmation_message: e.currentTarget.value
									})}
									placeholder={formEditorViewConfirmationMessageDefault?.() ?? 'Are you sure you want to submit?'}
								/>
							</div>
						{/if}
					</div>
				</div>

				<div class="settings-section">
					<div class="settings-header">
						<span class="settings-title">{formEditorViewAllowedRoles?.() ?? 'Allowed Roles'}</span>
					</div>
					<div class="settings-content">
						<div class="roles-list">
							{#each roles as role}
								<label class="role-checkbox">
									<input
										type="checkbox"
										checked={(form.allowed_roles || []).includes(role.id)}
										onchange={(e) => {
											const currentRoles = form.allowed_roles || [];
											if (e.currentTarget.checked) {
												onRolesChange?.([...currentRoles, role.id]);
											} else {
												onRolesChange?.(currentRoles.filter(id => id !== role.id));
											}
										}}
									/>
									<span class="role-name">{role.name}</span>
									{#if role.description}
										<span class="role-desc">{role.description}</span>
									{/if}
								</label>
							{:else}
								<p class="no-roles">{formEditorViewNoRoles?.() ?? 'No roles defined for this project.'}</p>
							{/each}
						</div>
						<p class="help-text">
							{formEditorViewRolesHelp?.() ?? 'Only participants with selected roles can use this form. Leave empty to allow all.'}
						</p>
					</div>
				</div>
			</div>
		{:else}
			<!-- Left Panel: Field Types Palette OR Field Config -->
			<div class="left-panel" class:wide={leftPanelWide}>
				{#if selectedField}
					<!-- Field Configuration Mode -->
					<FieldConfigPanel
						field={selectedField}
						ancestorFields={availableSourceFields}
						{roles}
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
					<div class="palettes-stack">
						<LibraryFieldsPalette
							expanded={paletteExpanded}
							{fieldDefs}
							{usedDefIds}
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
					onFieldRefDrop={(defId, page, rowIndex, columnPosition) => onAddFieldRef?.(defId, page, rowIndex, columnPosition)}
					onFieldUpdate={handleFieldUpdateRouted}
					{onAddPage}
					{onDeletePage}
					{onPageTitleChange}
					scopeTinted={showLocalFields}
				/>
			</div>
		{/if}
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

	/* Settings panel */
	.settings-panel {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
		background: hsl(var(--background));
	}

	.settings-section {
		margin-bottom: 1.5rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		overflow: hidden;
	}

	.settings-section:last-child {
		margin-bottom: 0;
	}

	.settings-header {
		padding: 0.625rem 1rem;
		background: hsl(var(--muted));
		border-bottom: 1px solid hsl(var(--border));
	}

	.settings-title {
		font-size: 0.75rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		text-transform: uppercase;
		letter-spacing: 0.025em;
	}

	.settings-content {
		padding: 1rem;
	}

	.form-field {
		margin-bottom: 1rem;
	}

	.form-field:last-child {
		margin-bottom: 0;
	}

	.form-field :global(label) {
		display: block;
		font-size: 0.75rem;
		font-weight: 500;
		margin-bottom: 0.375rem;
	}

	.form-field-switch {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.switch-info {
		flex: 1;
	}

	.switch-info :global(label) {
		font-size: 0.8125rem;
		font-weight: 500;
	}

	.switch-description {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		margin-top: 0.125rem;
	}

	.color-picker {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.color-input {
		width: 2.5rem;
		height: 2.5rem;
		padding: 0.125rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		cursor: pointer;
	}

	.color-input::-webkit-color-swatch-wrapper {
		padding: 0;
	}

	.color-input::-webkit-color-swatch {
		border: none;
		border-radius: 0.25rem;
	}

	.color-text {
		flex: 1;
	}

	/* Roles list */
	.roles-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.role-checkbox {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		background: hsl(var(--muted));
		border-radius: 0.375rem;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.role-checkbox:hover {
		background: hsl(var(--accent));
	}

	.role-checkbox input[type="checkbox"] {
		width: 1rem;
		height: 1rem;
		accent-color: hsl(var(--primary));
	}

	.role-name {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.role-desc {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		margin-left: auto;
	}

	.no-roles {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		font-style: italic;
	}

	.help-text {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		margin-top: 0.75rem;
	}
</style>
