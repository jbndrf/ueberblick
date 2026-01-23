<script lang="ts">
	import { X, Edit3, Trash2, Link, MapPin, ChevronDown } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	import AncestorFieldsPanel from './AncestorFieldsPanel.svelte';
	import FieldSelectionPreview from './FieldSelectionPreview.svelte';

	import type { ToolsEdit, ToolsForm, ToolsFormField, WorkflowStage, EditMode } from '$lib/workflow-builder';

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
		/** Callback when edit_mode changes */
		onEditModeChange?: (editMode: EditMode) => void;
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
		onEditModeChange,
		onDelete,
		onClose
	}: Props = $props();

	// Connection-attached tools inherit config from the connection
	const isConnectionAttached = $derived(!!editTool.connection_id);

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
			<Button variant="ghost" size="icon" onclick={onClose}>
				<X class="h-4 w-4" />
			</Button>
		</div>
	</div>

	<!-- Main content area -->
	<div class="editor-content">
		<!-- Left Panel: Mode selection + content -->
		<div class="left-panel">
			<div class="mode-header">
				<span class="mode-label">Edit Mode</span>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger class="mode-dropdown-trigger">
						{#if editTool.edit_mode === 'form_fields'}
							<span>Form Fields</span>
						{:else}
							<span>Location</span>
						{/if}
						<ChevronDown class="h-3.5 w-3.5" />
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						<DropdownMenu.Item
							onclick={() => onEditModeChange?.('form_fields')}
							class={editTool.edit_mode === 'form_fields' ? 'bg-accent' : ''}
						>
							Form Fields
						</DropdownMenu.Item>
						<DropdownMenu.Item
							onclick={() => onEditModeChange?.('location')}
							class={editTool.edit_mode === 'location' ? 'bg-accent' : ''}
						>
							Location
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>

			{#if editTool.edit_mode === 'form_fields'}
				<AncestorFieldsPanel
					{ancestorFields}
					{selectedFieldIds}
					onToggleField={handleToggleField}
				/>
			{:else}
				<div class="location-panel">
					<MapPin class="h-6 w-6 location-icon" />
					<p class="location-text">
						Participants can update the instance location on the map.
					</p>
				</div>
			{/if}
		</div>

		<!-- Right Panel: Preview + actions -->
		<div class="center-panel">
			{#if editTool.edit_mode === 'form_fields'}
				<div class="preview-section">
					<FieldSelectionPreview
						selectedFields={selectedFieldsWithMeta}
						onRemoveField={handleRemoveField}
					/>
				</div>
			{:else}
				<div class="preview-section location-preview">
					<div class="location-notice">
						<MapPin class="h-8 w-8 location-icon" />
						<div class="location-notice-content">
							<span class="location-notice-title">Location Edit</span>
							<p class="location-notice-text">
								Participants will see a map picker to update the workflow instance location.
							</p>
						</div>
					</div>
				</div>
			{/if}

			{#if isConnectionAttached}
				<div class="inheritance-notice">
					<div class="notice-icon">
						<Link class="h-4 w-4" />
					</div>
					<div class="notice-content">
						<span class="notice-title">Inherits from Connection</span>
						<p class="notice-text">
							Button appearance and allowed roles are configured on the connection's Tools tab.
						</p>
					</div>
				</div>
			{/if}

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

	/* Mode header with dropdown */
	.mode-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid hsl(var(--border));
		background: hsl(var(--muted) / 0.5);
	}

	.mode-label {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
	}

	.mode-header :global(.mode-dropdown-trigger) {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		background: hsl(var(--background));
		border: 1px solid hsl(var(--border));
		border-radius: 0.25rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.mode-header :global(.mode-dropdown-trigger:hover) {
		background: hsl(var(--accent));
		border-color: hsl(var(--primary) / 0.3);
	}

	/* Location panel in left sidebar */
	.location-panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 2rem 1rem;
		text-align: center;
		flex: 1;
	}

	.location-panel :global(.location-icon) {
		color: hsl(142 76% 36%);
	}

	.location-text {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		max-width: 180px;
		line-height: 1.4;
	}

	/* Location preview in right panel */
	.location-preview {
		display: flex;
		align-items: center;
		justify-content: center;
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
	.inheritance-notice {
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

	.location-notice {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		padding: 2rem;
		background: oklch(0.95 0.005 250);
		text-align: center;
	}

	:global(.dark) .location-notice {
		background: oklch(0.15 0.02 260);
	}

	.location-notice :global(.location-icon) {
		color: hsl(142 76% 36%);
	}

	.location-notice-content {
		max-width: 280px;
	}

	.location-notice-title {
		display: block;
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin-bottom: 0.5rem;
	}

	.location-notice-text {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		line-height: 1.5;
	}

</style>
