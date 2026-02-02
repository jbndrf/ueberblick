<script lang="ts">
	import type { Node, Edge } from '@xyflow/svelte';
	import type { SelectionContext, StageData } from '../context-sidebar/context';

	import PreviewView from './views/preview/PreviewView.svelte';
	import PropertyView from './views/properties/PropertyView.svelte';
	import GlobalToolsPanel from './views/properties/panels/GlobalToolsPanel.svelte';
	import { FormEditorView } from './views/form-editor';
	import { EditToolEditorView } from './views/edit-tool-editor';
	import { StagePreviewView, type StageAction, type TimelineStage, type IncomingFormGroup } from './views/stage-preview';

	import type { ToolsForm, ToolsFormField, TrackedFormField, WorkflowStage, ColumnPosition, ToolsEdit, VisualConfig } from '$lib/workflow-builder';
	import type { FormFieldWithValue } from '$lib/components/form-renderer';

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
		context: SelectionContext;
		workflowName: string;
		nodes: Node[];
		edges: Edge[];
		roles: Role[];
		// Form editor props
		selectedForm?: ToolsForm | null;
		formFields?: TrackedFormField[];
		ancestorFields?: AncestorFieldGroup[];
		// Edit tool editor props
		selectedEditTool?: ToolsEdit | null;
		editToolAncestorFields?: AncestorFieldGroup[];
		// Stage/Connection/Global tools for property views
		stageEditTools?: ToolsEdit[];
		connectionForms?: ToolsForm[];
		connectionEditTools?: ToolsEdit[];
		globalEditTools?: ToolsEdit[];
		// Stage preview props
		stagePreviewData?: {
			stage: WorkflowStage;
			actions: StageAction[];
			globalTools: StageAction[];
			timeline: TimelineStage[];
			availableTargetStages: WorkflowStage[];
			incomingForms: IncomingFormGroup[];
		} | null;
		// Handlers for property updates
		onStageRename?: (stageId: string, newName: string) => void;
		onStageDelete?: (stageId: string) => void;
		onStageRolesChange?: (stageId: string, roleIds: string[]) => void;
		onEdgeRename?: (edgeId: string, newName: string) => void;
		onEdgeDelete?: (edgeId: string) => void;
		onEdgeRolesChange?: (edgeId: string, roleIds: string[]) => void;
		onEdgeSettingsChange?: (edgeId: string, settings: Record<string, any>) => void;
		onSelectAction?: (edge: Edge) => void;
		onSelectStage?: (node: Node) => void;
		// Tool handlers (for stage property panel)
		onToolRolesChange?: (toolId: string, roleIds: string[]) => void;
		onToolVisualConfigChange?: (toolId: string, config: VisualConfig) => void;
		onSelectTool?: (toolType: string, toolId: string) => void;
		onDeleteTool?: (toolType: string, toolId: string) => void;
		// Callback to create a new role via server action
		onCreateRole?: (name: string) => Promise<Role>;
		// Form editor handlers
		onFormNameChange?: (formId: string, name: string) => void;
		onAddFormField?: (formId: string, fieldType: string, page: number, rowIndex: number, columnPosition: ColumnPosition) => void;
		onFormFieldUpdate?: (fieldId: string, updates: Partial<ToolsFormField>) => void;
		onFormFieldDelete?: (fieldId: string) => void;
		onFormFieldsReorder?: (formId: string, fieldIds: string[]) => void;
		onFormAddPage?: (formId: string) => void;
		onFormDeletePage?: (formId: string, page: number) => void;
		onFormPageTitleChange?: (formId: string, page: number, title: string) => void;
		onFormClose?: () => void;
		onFormRolesChange?: (formId: string, roleIds: string[]) => void;
		onFormVisualConfigChange?: (formId: string, config: VisualConfig) => void;
		// Edit tool editor handlers
		onEditToolNameChange?: (editToolId: string, name: string) => void;
		onEditToolFieldsChange?: (editToolId: string, fieldIds: string[]) => void;
		onEditToolEditModeChange?: (editToolId: string, editMode: 'form_fields' | 'location') => void;
		onEditToolDelete?: (editToolId: string) => void;
		onEditToolClose?: () => void;
		// Global tools handlers (for GlobalToolsPanel - reuses onToolRolesChange/onToolVisualConfigChange)
		onGlobalToolDelete?: (toolType: string, toolId: string) => void;
		// Stage preview handlers
		onAddConnection?: (fromStageId: string, toStageId: string) => void;
		onAddStageTool?: (stageId: string, toolType: string) => void;
		onButtonLabelChange?: (actionId: string, actionType: string, label: string) => void;
		onButtonColorChange?: (actionId: string, actionType: string, color: string) => void;
		onButtonRolesChange?: (actionId: string, actionType: string, roleIds: string[]) => void;
		onButtonDelete?: (actionId: string, actionType: string) => void;
		onConnectionVisualConfigChange?: (connectionId: string, config: VisualConfig) => void;
		onCreateStageAndConnect?: (fromStageId: string) => void;
		onHighlightEdge?: (edgeId: string | null) => void;
		onHighlightStageTool?: (toolId: string | null) => void;
		// PreviewView stage fields (grouped by form with role info)
		stageFields?: Map<string, { formName: string; allowedRoles: string[]; fields: FormFieldWithValue[] }[]>;
		onDeselect?: () => void;
	};

	let {
		context,
		workflowName,
		nodes,
		edges,
		roles,
		selectedForm = null,
		formFields = [],
		ancestorFields = [],
		selectedEditTool = null,
		editToolAncestorFields = [],
		stageEditTools = [],
		connectionForms = [],
		connectionEditTools = [],
		globalEditTools = [],
		stagePreviewData = null,
		onStageRename,
		onStageDelete,
		onStageRolesChange,
		onEdgeRename,
		onEdgeDelete,
		onEdgeRolesChange,
		onEdgeSettingsChange,
		onSelectAction,
		onSelectStage,
		onToolRolesChange,
		onToolVisualConfigChange,
		onSelectTool,
		onDeleteTool,
		onCreateRole,
		onFormNameChange,
		onAddFormField,
		onFormFieldUpdate,
		onFormFieldDelete,
		onFormFieldsReorder,
		onFormAddPage,
		onFormDeletePage,
		onFormPageTitleChange,
		onFormClose,
		onFormRolesChange,
		onFormVisualConfigChange,
		onEditToolNameChange,
		onEditToolFieldsChange,
		onEditToolEditModeChange,
		onEditToolDelete,
		onEditToolClose,
		onGlobalToolDelete,
		onAddConnection,
		onAddStageTool,
		onButtonLabelChange,
		onButtonColorChange,
		onButtonRolesChange,
		onButtonDelete,
		onConnectionVisualConfigChange,
		onCreateStageAndConnect,
		onHighlightEdge,
		onHighlightStageTool,
		stageFields,
		onDeselect
	}: Props = $props();

	// Track palette expanded state for sidebar width
	let paletteExpanded = $state(false);

	// Form editor mode
	const isFormEditor = $derived(context.type === 'form');

	// Edit tool editor mode
	const isEditToolEditor = $derived(context.type === 'editTool');

	// Global tools panel mode
	const isGlobalToolsPanel = $derived(context.type === 'globalTools');

	// Stage preview mode (replaces old StagePropertyPanel)
	const isStagePreview = $derived(context.type === 'stage' && stagePreviewData != null);

	// Action/edge selection (still uses PropertyView for now)
	const isActionSelection = $derived(context.type === 'action');

	// Any other selection that isn't handled by dedicated views
	const hasSelection = $derived(
		context.type !== 'none' && context.type !== 'form' && context.type !== 'editTool' && context.type !== 'globalTools' && !isStagePreview
	);
</script>

<aside class="right-sidebar" class:wide={isFormEditor || isEditToolEditor || isStagePreview} class:expanded={isFormEditor && paletteExpanded}>
	{#if isFormEditor && selectedForm}
		<FormEditorView
			form={selectedForm}
			fields={formFields}
			{ancestorFields}
			{roles}
			onFormNameChange={(name) => onFormNameChange?.(selectedForm.id, name)}
			onAddField={(fieldType, page, rowIndex, columnPosition) => onAddFormField?.(selectedForm.id, fieldType, page, rowIndex, columnPosition)}
			onFieldUpdate={onFormFieldUpdate}
			onFieldDelete={onFormFieldDelete}
			onFieldsReorder={(fieldIds) => onFormFieldsReorder?.(selectedForm.id, fieldIds)}
			onAddPage={() => onFormAddPage?.(selectedForm.id)}
			onDeletePage={(page) => onFormDeletePage?.(selectedForm.id, page)}
			onPageTitleChange={(page, title) => onFormPageTitleChange?.(selectedForm.id, page, title)}
			onClose={onFormClose}
			onPaletteExpandedChange={(expanded) => paletteExpanded = expanded}
			onRolesChange={(roleIds) => onFormRolesChange?.(selectedForm.id, roleIds)}
			onVisualConfigChange={(config) => onFormVisualConfigChange?.(selectedForm.id, config)}
		/>
	{:else if isEditToolEditor && selectedEditTool}
		<EditToolEditorView
			editTool={selectedEditTool}
			ancestorFields={editToolAncestorFields}
			onNameChange={(name) => onEditToolNameChange?.(selectedEditTool.id, name)}
			onFieldsChange={(fieldIds) => onEditToolFieldsChange?.(selectedEditTool.id, fieldIds)}
			onEditModeChange={(editMode) => onEditToolEditModeChange?.(selectedEditTool.id, editMode)}
			onDelete={() => onEditToolDelete?.(selectedEditTool.id)}
			onClose={onEditToolClose}
		/>
	{:else if isGlobalToolsPanel}
		<GlobalToolsPanel
			{globalEditTools}
			{roles}
			onToolRolesChange={onToolRolesChange}
			onToolVisualConfigChange={onToolVisualConfigChange}
			onSelectTool={onSelectTool}
			onDeleteTool={onGlobalToolDelete}
			{onCreateRole}
		/>
	{:else if isStagePreview && stagePreviewData}
		<StagePreviewView
			stage={stagePreviewData.stage}
			actions={stagePreviewData.actions}
			globalTools={stagePreviewData.globalTools}
			timeline={stagePreviewData.timeline}
			{roles}
			availableTargetStages={stagePreviewData.availableTargetStages}
			incomingForms={stagePreviewData.incomingForms}
			{onStageRename}
			{onStageRolesChange}
			{onStageDelete}
			onClose={onDeselect}
			{onButtonLabelChange}
			{onButtonColorChange}
			{onButtonRolesChange}
			{onButtonDelete}
			{onAddConnection}
			{onAddStageTool}
			{onSelectTool}
			{onCreateRole}
			onConnectionVisualConfigChange={onConnectionVisualConfigChange}
			onToolVisualConfigChange={onToolVisualConfigChange}
			{onCreateStageAndConnect}
			{onHighlightEdge}
			{onHighlightStageTool}
		/>
	{:else if hasSelection}
		<PropertyView
			{context}
			{nodes}
			{edges}
			{roles}
			{stageEditTools}
			{connectionForms}
			{connectionEditTools}
			{onStageRename}
			{onStageDelete}
			{onStageRolesChange}
			{onEdgeRename}
			{onEdgeDelete}
			{onEdgeRolesChange}
			{onEdgeSettingsChange}
			{onToolRolesChange}
			{onToolVisualConfigChange}
			{onSelectTool}
			{onDeleteTool}
			{onCreateRole}
		/>
	{:else}
		<PreviewView {workflowName} {nodes} {edges} {roles} {stageFields} {onSelectStage} />
	{/if}
</aside>

<style>
	.right-sidebar {
		width: 360px;
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		/* Light mode: visible background and border */
		background: oklch(0.965 0.005 250);
		border-left: 1px solid oklch(0.88 0.01 250);
		box-shadow: -2px 0 12px oklch(0 0 0 / 0.06);
		overflow: hidden;
		transition: width 0.2s ease;
	}

	/* Wide mode for form editor (~375px mobile width + collapsed palette) */
	.right-sidebar.wide {
		width: 520px;
	}

	/* Expanded mode when palette is expanded (+130px for labels) */
	.right-sidebar.wide.expanded {
		width: 650px;
	}

	:global(.dark) .right-sidebar {
		background: hsl(var(--muted));
		border-left-color: oklch(1 0 0 / 20%);
		box-shadow: -2px 0 8px oklch(0 0 0 / 0.3);
	}
</style>
