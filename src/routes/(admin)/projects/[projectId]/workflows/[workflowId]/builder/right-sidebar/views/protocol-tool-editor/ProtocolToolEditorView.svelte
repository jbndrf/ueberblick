<script lang="ts">
	import { X, ClipboardList, Trash2, FileText, Edit3 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	import { AncestorFieldsPanel } from '../edit-tool-editor';
	import { FieldSelectionPreview } from '../edit-tool-editor';

	import type { ToolsEdit, ToolsForm, ToolsFormField, WorkflowStage } from '$lib/workflow-builder';

	type AncestorFieldGroup = {
		stage: WorkflowStage;
		form: ToolsForm;
		fields: ToolsFormField[];
	};

	type Props = {
		/** The protocol tool being configured */
		protocolTool: ToolsEdit;
		/** All ancestor fields grouped by stage/form */
		ancestorFields: AncestorFieldGroup[];
		/** Number of fields in the protocol form */
		protocolFormFieldCount: number;
		/** Callback when tool name changes */
		onNameChange?: (name: string) => void;
		/** Callback when editable (lifecycle) fields change */
		onFieldsChange?: (fieldIds: string[]) => void;
		/** Callback when prefill_config changes */
		onPrefillConfigChange?: (config: Record<string, boolean>) => void;
		/** Callback to open the protocol form editor */
		onEditProtocolForm?: () => void;
		/** Callback to delete the protocol tool */
		onDelete?: () => void;
		/** Callback to close the editor */
		onClose?: () => void;
	};

	let {
		protocolTool,
		ancestorFields,
		protocolFormFieldCount,
		onNameChange,
		onFieldsChange,
		onPrefillConfigChange,
		onEditProtocolForm,
		onDelete,
		onClose
	}: Props = $props();

	// Local state
	let toolName = $state(protocolTool.name);
	let selectedFieldIds = $state<string[]>(protocolTool.editable_fields || []);
	let prefillConfig = $state<Record<string, boolean>>(protocolTool.prefill_config || {});

	// Track current tool ID to detect changes
	let currentToolId = $state(protocolTool.id);

	// Update local state when tool changes
	$effect(() => {
		if (protocolTool.id !== currentToolId) {
			currentToolId = protocolTool.id;
			toolName = protocolTool.name;
			selectedFieldIds = protocolTool.editable_fields || [];
			prefillConfig = protocolTool.prefill_config || {};
		}
	});

	// Watch for field selection changes
	$effect(() => {
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
		const current = prefillConfig[fieldId] ?? true;
		prefillConfig = { ...prefillConfig, [fieldId]: !current };
		onPrefillConfigChange?.(prefillConfig);
	}
</script>

<div class="protocol-tool-editor">
	<!-- Header -->
	<div class="editor-header">
		<div class="header-content">
			<div class="header-icon">
				<ClipboardList class="h-4 w-4" />
			</div>
			<div class="header-title">
				<Label for="protocol-tool-name" class="sr-only">Protocol Tool Name</Label>
				<Input
					id="protocol-tool-name"
					bind:value={toolName}
					onblur={handleNameBlur}
					class="name-input"
					placeholder="Protocol tool name..."
				/>
			</div>
			<Button variant="ghost" size="icon" onclick={onClose}>
				<X class="h-4 w-4" />
			</Button>
		</div>
	</div>

	<!-- Main content area -->
	<div class="editor-content">
		<!-- Left Panel: Lifecycle fields with prefill toggles -->
		<div class="left-panel">
			<div class="section-header">
				<Edit3 class="h-3 w-3" />
				<span>Lifecycle Fields</span>
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

		<!-- Right Panel: Preview + Protocol Form -->
		<div class="center-panel">
			<div class="preview-section">
				<!-- Lifecycle fields preview -->
				<FieldSelectionPreview
					selectedFields={selectedFieldsWithMeta}
					onRemoveField={handleRemoveField}
				/>

				<!-- Protocol Form section -->
				<div class="protocol-form-section">
					<div class="protocol-form-header">
						<FileText class="h-3.5 w-3.5" />
						<span>Protocol Form</span>
						{#if protocolFormFieldCount > 0}
							<span class="protocol-form-count">{protocolFormFieldCount} fields</span>
						{/if}
					</div>
					<div class="protocol-form-body">
						<Button
							variant="outline"
							size="sm"
							onclick={onEditProtocolForm}
							class="w-full"
						>
							<FileText class="h-3.5 w-3.5 mr-1.5" />
							{protocolTool.protocol_form_id ? 'Edit Protocol Form' : 'Create Protocol Form'}
						</Button>
						{#if !protocolTool.protocol_form_id}
							<p class="protocol-form-hint">
								Add protocol-specific fields like inspection date, conditions, etc.
							</p>
						{/if}
					</div>
				</div>
			</div>

			<div class="editor-footer">
				<Button variant="destructive" size="sm" onclick={onDelete} class="w-full">
					<Trash2 class="h-4 w-4 mr-2" />
					Delete Protocol Tool
				</Button>
			</div>
		</div>
	</div>
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

	.section-header {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid hsl(var(--border));
		background: hsl(var(--muted) / 0.5);
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
		flex-shrink: 0;
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
		display: flex;
		flex-direction: column;
		gap: 1rem;
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

	/* Protocol form section */
	.protocol-form-section {
		background: hsl(var(--background));
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		overflow: hidden;
	}

	.protocol-form-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: hsl(var(--muted) / 0.5);
		border-bottom: 1px solid hsl(var(--border));
		font-size: 0.75rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.protocol-form-count {
		margin-left: auto;
		font-size: 0.6875rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		background: hsl(var(--muted));
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
	}

	.protocol-form-body {
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.protocol-form-hint {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		line-height: 1.4;
		text-align: center;
	}
</style>
