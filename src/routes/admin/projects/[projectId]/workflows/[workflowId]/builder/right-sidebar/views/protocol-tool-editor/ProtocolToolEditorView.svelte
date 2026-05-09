<script lang="ts">
	import { X, ClipboardList, Trash2, FileText, MapPin } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as m from '$lib/paraglide/messages';

	import { AncestorFieldsPanel } from '../edit-tool-editor';
	import { FieldSelectionPreview } from '../edit-tool-editor';

	import type { ToolsProtocol, ToolsForm, ToolsFormField, WorkflowStage } from '$lib/workflow-builder';

	type AncestorFieldGroup = {
		stage: WorkflowStage;
		form: ToolsForm;
		fields: ToolsFormField[];
	};

	type Props = {
		protocolTool: ToolsProtocol;
		ancestorFields: AncestorFieldGroup[];
		formFieldCount: number;
		/** All available stages (for region mode) */
		allStages?: WorkflowStage[];
		onNameChange?: (name: string) => void;
		onFieldsChange?: (fieldIds: string[]) => void;
		onPrefillConfigChange?: (config: Record<string, boolean>) => void;
		onStageIdsChange?: (stageIds: string[]) => void;
		onEditForm?: () => void;
		onDelete?: () => void;
		onClose?: () => void;
	};

	let {
		protocolTool,
		ancestorFields,
		formFieldCount,
		allStages = [],
		onNameChange,
		onFieldsChange,
		onPrefillConfigChange,
		onStageIdsChange,
		onEditForm,
		onDelete,
		onClose
	}: Props = $props();

	const isRegion = $derived(protocolTool.is_global);

	// Local state
	let toolName = $state(protocolTool.name);
	let selectedFieldIds = $state<string[]>(protocolTool.editable_fields || []);
	let prefillConfig = $state<Record<string, boolean>>(protocolTool.prefill_config || {});
	let selectedStageIds = $state<string[]>(protocolTool.stage_id || []);

	// Track current tool ID to detect changes
	let currentToolId = $state(protocolTool.id);

	// Update local state when tool changes
	$effect(() => {
		if (protocolTool.id !== currentToolId) {
			currentToolId = protocolTool.id;
			toolName = protocolTool.name;
			selectedFieldIds = protocolTool.editable_fields || [];
			prefillConfig = protocolTool.prefill_config || {};
			selectedStageIds = protocolTool.stage_id || [];
		}
	});

	// Watch for field selection changes (non-region mode)
	$effect(() => {
		if (isRegion) return;
		const propFields = protocolTool.editable_fields || [];
		const fieldsChanged =
			selectedFieldIds.length !== propFields.length ||
			selectedFieldIds.some((id, i) => id !== propFields[i]);

		if (fieldsChanged && protocolTool.id === currentToolId) {
			onFieldsChange?.(selectedFieldIds);
		}
	});

	// Build selected fields with metadata for the preview
	const selectedFieldsWithMeta = $derived.by(() => {
		if (isRegion) return [];
		const result: Array<{
			field: ToolsFormField;
			stageName: string;
			formName: string;
		}> = [];

		for (const fieldId of selectedFieldIds) {
			for (const group of ancestorFields) {
				const field = group.fields.find((f) => f.id === fieldId);
				if (field) {
					result.push({
						field,
						stageName: group.stage.stage_name,
						formName: group.form.name
					});
					break;
				}
			}
		}

		return result;
	});

	function handleNameBlur() {
		if (toolName !== protocolTool.name && toolName.trim()) {
			onNameChange?.(toolName.trim());
		}
	}

	function handleToggleField(fieldId: string) {
		if (selectedFieldIds.includes(fieldId)) {
			selectedFieldIds = selectedFieldIds.filter((id) => id !== fieldId);
		} else {
			selectedFieldIds = [...selectedFieldIds, fieldId];
		}
	}

	function handleRemoveField(fieldId: string) {
		selectedFieldIds = selectedFieldIds.filter((id) => id !== fieldId);
	}

	function handleTogglePrefill(fieldId: string) {
		const current = prefillConfig[fieldId] !== false;
		prefillConfig = { ...prefillConfig, [fieldId]: !current };
		onPrefillConfigChange?.(prefillConfig);
	}

	function handleToggleStage(stageId: string) {
		if (selectedStageIds.includes(stageId)) {
			selectedStageIds = selectedStageIds.filter((id) => id !== stageId);
		} else {
			selectedStageIds = [...selectedStageIds, stageId];
		}
		onStageIdsChange?.(selectedStageIds);
	}
</script>

<div class="protocol-tool-editor">
	<!-- Header -->
	<div class="editor-header">
		<div class="header-content">
			<div class="header-icon" class:region-icon={isRegion}>
				{#if isRegion}
					<MapPin class="h-4 w-4" />
				{:else}
					<ClipboardList class="h-4 w-4" />
				{/if}
			</div>
			<div class="header-title">
				<Label for="protocol-tool-name" class="sr-only">{m.protocolToolEditorName?.() ?? 'Protocol Tool Name'}</Label>
				<Input
					id="protocol-tool-name"
					bind:value={toolName}
					onblur={handleNameBlur}
					class="name-input"
					placeholder={isRegion ? (m.protocolToolEditorRegionNamePlaceholder?.() ?? 'Region name...') : (m.protocolToolEditorToolNamePlaceholder?.() ?? 'Protocol tool name...')}
				/>
			</div>
			<Button variant="ghost" size="icon" onclick={onClose}>
				<X class="h-4 w-4" />
			</Button>
		</div>
		{#if isRegion}
			<p class="header-description">
				{m.protocolToolEditorRegionDescription?.() ?? 'Automatically snapshots the audit trail when an instance exits this region.'}
			</p>
		{/if}
	</div>

	{#if isRegion}
		<!-- Region mode: stage picker -->
		<div class="region-content">
			<div class="panel-header">
				<span class="panel-label">{m.protocolToolEditorRegionStages?.() ?? 'Region Stages'}</span>
				<span class="stage-count">{selectedStageIds.length} / {allStages.length}</span>
			</div>
			<div class="stage-list">
				{#each allStages as stage (stage.id)}
					{@const isSelected = selectedStageIds.includes(stage.id)}
					<button
						type="button"
						class="stage-item"
						class:selected={isSelected}
						onclick={() => handleToggleStage(stage.id)}
					>
						<Checkbox checked={isSelected} />
						<span class="stage-name">{stage.stage_name}</span>
						<span class="stage-type-badge">{stage.stage_type}</span>
					</button>
				{/each}
				{#if allStages.length === 0}
					<p class="empty-message">{m.protocolToolEditorNoStages?.() ?? 'No stages available.'}</p>
				{/if}
			</div>

			<div class="editor-footer">
				<Button variant="destructive" size="sm" onclick={onDelete} class="w-full">
					<Trash2 class="h-4 w-4 mr-2" />
					{m.protocolToolEditorDeleteRegion?.() ?? 'Delete Protocol Region'}
				</Button>
			</div>
		</div>
	{:else}
		<!-- Tool mode: field selection + protocol form -->
		<div class="editor-content">
			<div class="left-panel">
				<div class="panel-header">
					<span class="panel-label">{m.protocolToolEditorEditableFields?.() ?? 'Editable Fields'}</span>
				</div>

				<AncestorFieldsPanel
					{ancestorFields}
					{selectedFieldIds}
					onToggleField={handleToggleField}
					showPrefillToggle={true}
					{prefillConfig}
					onTogglePrefill={handleTogglePrefill}
				/>
			</div>

			<div class="center-panel">
				<div class="preview-section">
					<FieldSelectionPreview
						selectedFields={selectedFieldsWithMeta}
						onRemoveField={handleRemoveField}
					/>
				</div>

				<div class="form-section">
					<Button variant="outline" size="sm" onclick={onEditForm} class="w-full">
						<FileText class="h-4 w-4 mr-2" />
						{protocolTool.protocol_form_id ? (m.protocolToolEditorEditForm?.({ count: formFieldCount }) ?? `Edit Protocol Form (${formFieldCount} fields)`) : (m.protocolToolEditorCreateForm?.() ?? 'Create Protocol Form')}
					</Button>
				</div>

				<div class="editor-footer">
					<Button variant="destructive" size="sm" onclick={onDelete} class="w-full">
						<Trash2 class="h-4 w-4 mr-2" />
						{m.protocolToolEditorDeleteTool?.() ?? 'Delete Protocol Tool'}
					</Button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.protocol-tool-editor {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: hsl(var(--background));
	}

	.editor-header {
		padding: 0.75rem 1rem;
		border-bottom: 1px solid oklch(0.88 0.01 250);
		flex-shrink: 0;
	}

	:global(.dark) .editor-header {
		border-bottom-color: oklch(1 0 0 / 20%);
	}

	.header-content {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.header-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: oklch(0.85 0.15 160 / 0.15);
		border-radius: 0.375rem;
		color: oklch(0.55 0.15 160);
	}

	.header-icon.region-icon {
		background: oklch(0.85 0.1 250 / 0.15);
		color: oklch(0.5 0.15 250);
	}

	.header-title {
		flex: 1;
	}

	.header-title :global(.name-input) {
		font-weight: 600;
		font-size: 1rem;
	}

	.header-description {
		margin-top: 0.5rem;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		line-height: 1.4;
	}

	.editor-content {
		display: flex;
		flex: 1;
		overflow: hidden;
	}

	.left-panel {
		width: 240px;
		flex-shrink: 0;
		border-right: 1px solid oklch(0.88 0.01 250);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	:global(.dark) .left-panel {
		border-right-color: oklch(1 0 0 / 20%);
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid hsl(var(--border));
		background: hsl(var(--muted) / 0.5);
	}

	.panel-label {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
	}

	.stage-count {
		font-size: 0.6875rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
	}

	.center-panel {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.preview-section {
		flex: 1;
		overflow: auto;
		padding: 1rem;
		background: oklch(0.95 0.005 250);
	}

	:global(.dark) .preview-section {
		background: oklch(0.15 0.02 260);
	}

	.form-section {
		flex-shrink: 0;
		padding: 1rem;
		border-top: 1px solid oklch(0.88 0.01 250);
		background: hsl(var(--background));
	}

	:global(.dark) .form-section {
		border-top-color: oklch(1 0 0 / 20%);
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

	/* Region mode */
	.region-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.stage-list {
		flex: 1;
		overflow: auto;
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.stage-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-radius: 0.375rem;
		cursor: pointer;
		border: 1px solid transparent;
		background: transparent;
		text-align: left;
		transition: all 0.1s ease;
		width: 100%;
	}

	.stage-item:hover {
		background: hsl(var(--muted) / 0.5);
	}

	.stage-item.selected {
		background: hsl(var(--primary) / 0.05);
		border-color: hsl(var(--primary) / 0.2);
	}

	.stage-name {
		flex: 1;
		font-size: 0.8125rem;
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.stage-type-badge {
		font-size: 0.625rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		background: hsl(var(--muted));
		color: hsl(var(--muted-foreground));
	}

	.empty-message {
		padding: 2rem;
		text-align: center;
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
	}
</style>
