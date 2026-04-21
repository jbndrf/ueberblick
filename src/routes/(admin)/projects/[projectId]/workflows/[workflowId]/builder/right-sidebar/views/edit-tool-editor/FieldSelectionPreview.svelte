<script lang="ts">
	import { X, Edit3, Type } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { fieldTypeIcons, type ToolsFormField, type WorkflowStage } from '$lib/workflow-builder';
	import * as m from '$lib/paraglide/messages';

	type SelectedFieldInfo = {
		field: ToolsFormField;
		stageName: string;
		formName: string;
	};

	type Props = {
		/** Selected fields with their metadata */
		selectedFields: SelectedFieldInfo[];
		/** Callback to remove a field from selection */
		onRemoveField?: (fieldId: string) => void;
	};

	let { selectedFields, onRemoveField }: Props = $props();

	const hasFields = $derived(selectedFields.length > 0);
</script>

<div class="field-selection-preview">
	<div class="preview-header">
		<Edit3 class="h-4 w-4" />
		<span class="preview-title">{m.editToolFieldSelectionPreviewTitle?.() ?? 'Editable Fields'}</span>
		<span class="field-count">{selectedFields.length}</span>
	</div>

	<div class="preview-content">
		{#if hasFields}
			<div class="selected-fields-list">
				{#each selectedFields as item (item.field.id)}
					{@const Icon = fieldTypeIcons[item.field.field_type] || Type}
					<div class="selected-field-card">
						<div class="field-icon">
							<Icon class="h-4 w-4" />
						</div>
						<div class="field-details">
							<span class="field-label">
								{item.field.field_label}
								{#if item.field.is_required}
									<span class="required">*</span>
								{/if}
							</span>
							<span class="field-source">
								{item.stageName} / {item.formName}
							</span>
						</div>
						<Button
							variant="ghost"
							size="icon"
							class="remove-btn"
							onclick={() => onRemoveField?.(item.field.id)}
						>
							<X class="h-3.5 w-3.5" />
						</Button>
					</div>
				{/each}
			</div>
		{:else}
			<div class="empty-state">
				<div class="empty-icon">
					<Edit3 class="h-10 w-10" />
				</div>
				<p class="empty-title">{m.editToolFieldSelectionPreviewEmptyTitle?.() ?? 'No fields selected'}</p>
				<p class="empty-description">
					{m.editToolFieldSelectionPreviewEmptyDescription?.() ?? 'Select fields from the left panel to make them editable with this tool.'}
				</p>
			</div>
		{/if}
	</div>
</div>

<style>
	.field-selection-preview {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: hsl(var(--background));
		border-radius: 0.5rem;
		border: 1px solid hsl(var(--border));
		overflow: hidden;
	}

	.preview-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: hsl(var(--muted) / 0.3);
		border-bottom: 1px solid hsl(var(--border));
		flex-shrink: 0;
	}

	.preview-header :global(svg) {
		color: hsl(var(--primary));
	}

	.preview-title {
		flex: 1;
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.field-count {
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--primary));
		background: hsl(var(--primary) / 0.1);
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
	}

	.preview-content {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
	}

	.selected-fields-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.selected-field-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 0.75rem;
		background: hsl(var(--muted) / 0.3);
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		transition: all 0.15s ease;
	}

	.selected-field-card:hover {
		border-color: hsl(var(--primary) / 0.3);
		background: hsl(var(--muted) / 0.5);
	}

	.field-icon {
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

	.field-details {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.field-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.required {
		color: hsl(var(--destructive));
		margin-left: 0.125rem;
	}

	.field-source {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.selected-field-card :global(.remove-btn) {
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		opacity: 0.5;
		transition: opacity 0.15s ease;
	}

	.selected-field-card:hover :global(.remove-btn) {
		opacity: 1;
	}

	.selected-field-card :global(.remove-btn:hover) {
		color: hsl(var(--destructive));
		background: hsl(var(--destructive) / 0.1);
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 2rem 1rem;
		height: 100%;
	}

	.empty-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 64px;
		height: 64px;
		background: hsl(var(--muted) / 0.5);
		border-radius: 50%;
		margin-bottom: 1rem;
		color: hsl(var(--muted-foreground));
	}

	.empty-title {
		font-size: 0.9375rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin-bottom: 0.375rem;
	}

	.empty-description {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		max-width: 220px;
		line-height: 1.4;
	}
</style>
