<script lang="ts">
	import type { Node, Edge } from '@xyflow/svelte';
	import type { SelectionContext, StageData } from '../context-sidebar/context';

	import PreviewView from './views/preview/PreviewView.svelte';
	import PropertyView from './views/properties/PropertyView.svelte';
	import { FormEditorView } from './views/form-editor';

	import type { ToolsForm, ToolsFormField, TrackedFormField, WorkflowStage, ColumnPosition } from '$lib/workflow-builder';

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
		onStageRename,
		onStageDelete,
		onStageRolesChange,
		onEdgeRename,
		onEdgeDelete,
		onEdgeRolesChange,
		onEdgeSettingsChange,
		onSelectAction,
		onSelectStage,
		onFormNameChange,
		onAddFormField,
		onFormFieldUpdate,
		onFormFieldDelete,
		onFormFieldsReorder,
		onFormAddPage,
		onFormDeletePage,
		onFormPageTitleChange,
		onFormClose
	}: Props = $props();

	// Track palette expanded state for sidebar width
	let paletteExpanded = $state(false);

	// Form editor mode
	const isFormEditor = $derived(context.type === 'form');

	// Auto-switch logic: show PropertyView when something is selected (not form)
	const hasSelection = $derived(context.type !== 'none' && context.type !== 'form');
</script>

<aside class="right-sidebar" class:wide={isFormEditor} class:expanded={isFormEditor && paletteExpanded}>
	{#if isFormEditor && selectedForm}
		<FormEditorView
			form={selectedForm}
			fields={formFields}
			{ancestorFields}
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
		/>
	{:else if hasSelection}
		<PropertyView
			{context}
			{nodes}
			{edges}
			{roles}
			{onStageRename}
			{onStageDelete}
			{onStageRolesChange}
			{onEdgeRename}
			{onEdgeDelete}
			{onEdgeRolesChange}
			{onEdgeSettingsChange}
			{onSelectAction}
		/>
	{:else}
		<PreviewView {workflowName} {nodes} {edges} {onSelectStage} />
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
