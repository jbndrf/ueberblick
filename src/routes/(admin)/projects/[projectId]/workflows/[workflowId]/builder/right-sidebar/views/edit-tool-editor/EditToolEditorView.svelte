<script lang="ts">
	import { X, Edit3, Trash2, Link } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	import AncestorFieldsPanel from './AncestorFieldsPanel.svelte';
	import FieldSelectionPreview from './FieldSelectionPreview.svelte';

	import type { ToolsEdit, ToolsForm, ToolsFormField, WorkflowStage } from '$lib/workflow-builder';

	type AncestorFieldGroup = {
		stage: WorkflowStage;
		form: ToolsForm;
		fields: ToolsFormField[];
	};

	type Props = {
		/** The edit tool being configured */
		editTool: ToolsEdit;
		/** All ancestor fields grouped by stage/form */
		ancestorFields: AncestorFieldGroup[];
		/** Callback when edit tool name changes */
		onNameChange?: (name: string) => void;
		/** Callback when editable fields change */
		onFieldsChange?: (fieldIds: string[]) => void;
		/** Callback to delete the edit tool */
		onDelete?: () => void;
		/** Callback to close the editor */
		onClose?: () => void;
	};

	let {
		editTool,
		ancestorFields,
		onNameChange,
		onFieldsChange,
		onDelete,
		onClose
	}: Props = $props();

	// Determine if this is a stage-attached tool (has its own config)
	// vs connection-attached tool (inherits from connection)
	const isStageAttached = $derived(!!editTool.stage_id && !editTool.connection_id);

	// Local state
	let editToolName = $state(editTool.name);
	let selectedFieldIds = $state<string[]>(editTool.editable_fields || []);

	// Track current edit tool ID to detect changes
	let currentEditToolId = $state(editTool.id);

	// Update local state when edit tool changes
	$effect(() => {
		if (editTool.id !== currentEditToolId) {
			currentEditToolId = editTool.id;
			editToolName = editTool.name;
			selectedFieldIds = editTool.editable_fields || [];
		}
	});

	// Watch for field selection changes
	$effect(() => {
		const propFields = editTool.editable_fields || [];
		const fieldsChanged =
			selectedFieldIds.length !== propFields.length ||
			selectedFieldIds.some((id, i) => id !== propFields[i]);

		if (fieldsChanged && editTool.id === currentEditToolId) {
			onFieldsChange?.(selectedFieldIds);
		}
	});

	// Build selected fields with metadata for the preview
	const selectedFieldsWithMeta = $derived.by(() => {
		const result: Array<{
			field: ToolsFormField;
			stageName: string;
			formName: string;
		}> = [];

		for (const fieldId of selectedFieldIds) {
			// Find the field in ancestor fields
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
		if (editToolName !== editTool.name && editToolName.trim()) {
			onNameChange?.(editToolName.trim());
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
</script>

<div class="edit-tool-editor">
	<!-- Header -->
	<div class="editor-header">
		<div class="header-content">
			<div class="header-icon">
				<Edit3 class="h-4 w-4" />
			</div>
			<div class="header-title">
				<Label for="edit-tool-name" class="sr-only">Edit Tool Name</Label>
				<Input
					id="edit-tool-name"
					bind:value={editToolName}
					onblur={handleNameBlur}
					class="name-input"
					placeholder="Edit tool name..."
				/>
			</div>
			<Button variant="ghost" size="icon" onclick={onClose} class="close-btn">
				<X class="h-4 w-4" />
			</Button>
		</div>
	</div>

	<!-- Main content area -->
	<div class="editor-content">
		<!-- Left Panel: Available fields -->
		<div class="left-panel">
			<AncestorFieldsPanel
				{ancestorFields}
				{selectedFieldIds}
				onToggleField={handleToggleField}
			/>
		</div>

		<!-- Center Panel: Selected fields preview -->
		<div class="center-panel">
			<div class="preview-section">
				<FieldSelectionPreview
					selectedFields={selectedFieldsWithMeta}
					onRemoveField={handleRemoveField}
				/>
			</div>

			{#if !isStageAttached}
				<!-- Connection-attached tool: show inheritance notice -->
				<div class="inheritance-notice">
					<div class="notice-icon">
						<Link class="h-4 w-4" />
					</div>
					<div class="notice-content">
						<span class="notice-title">Inherits from Connection</span>
						<p class="notice-text">
							This edit tool is attached to a connection. Button appearance and allowed roles are configured on the connection's Tools tab.
						</p>
					</div>
				</div>
			{/if}

			<!-- Footer with delete button -->
			<div class="editor-footer">
				<Button variant="destructive" size="sm" onclick={onDelete} class="w-full">
					<Trash2 class="h-4 w-4 mr-2" />
					Delete Edit Tool
				</Button>
			</div>
		</div>
	</div>
</div>

<style>
	.edit-tool-editor {
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
		background: hsl(var(--primary) / 0.1);
		border-radius: 0.375rem;
		color: hsl(var(--primary));
	}

	.header-title {
		flex: 1;
	}

	.header-title :global(.name-input) {
		font-weight: 600;
		font-size: 1rem;
	}

	.close-btn {
		flex-shrink: 0;
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
	}

	:global(.dark) .left-panel {
		border-right-color: oklch(1 0 0 / 20%);
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

	.editor-footer {
		flex-shrink: 0;
		padding: 1rem;
		border-top: 1px solid oklch(0.88 0.01 250);
		background: hsl(var(--background));
	}

	:global(.dark) .editor-footer {
		border-top-color: oklch(1 0 0 / 20%);
	}

	/* Notice styles */
	.inheritance-notice,
	.config-notice {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 1rem;
		margin: 1rem;
		background: hsl(var(--muted));
		border-radius: 0.5rem;
		border: 1px solid hsl(var(--border));
	}

	.notice-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: hsl(var(--background));
		border-radius: 0.375rem;
		color: hsl(var(--muted-foreground));
	}

	.notice-content {
		flex: 1;
	}

	.notice-title {
		display: block;
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin-bottom: 0.25rem;
	}

	.notice-text {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		line-height: 1.4;
	}
</style>
