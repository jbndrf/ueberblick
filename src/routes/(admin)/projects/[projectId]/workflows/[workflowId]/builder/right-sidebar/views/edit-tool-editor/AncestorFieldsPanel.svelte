<script lang="ts">
	import { FileWarning } from 'lucide-svelte';
	import AncestorFieldGroup from './AncestorFieldGroup.svelte';
	import type { ToolsForm, ToolsFormField, WorkflowStage } from '$lib/workflow-builder';

	type AncestorFieldGroupData = {
		stage: WorkflowStage;
		form: ToolsForm;
		fields: ToolsFormField[];
	};

	type Props = {
		/** All ancestor fields grouped by stage/form */
		ancestorFields: AncestorFieldGroupData[];
		/** Currently selected field IDs */
		selectedFieldIds: string[];
		/** Callback when field selection changes */
		onToggleField?: (fieldId: string) => void;
	};

	let { ancestorFields, selectedFieldIds, onToggleField }: Props = $props();

	// Group by stage for better organization
	const groupedByStage = $derived.by(() => {
		const map = new Map<string, { stage: WorkflowStage; forms: AncestorFieldGroupData[] }>();

		for (const group of ancestorFields) {
			const existing = map.get(group.stage.id);
			if (existing) {
				existing.forms.push(group);
			} else {
				map.set(group.stage.id, {
					stage: group.stage,
					forms: [group]
				});
			}
		}

		return Array.from(map.values());
	});

	const hasFields = $derived(ancestorFields.length > 0);
</script>

<div class="ancestor-fields-panel">
	<div class="panel-header">
		<span class="panel-title">Available Fields</span>
		<span class="field-count">{selectedFieldIds.length} selected</span>
	</div>

	<div class="panel-content">
		{#if hasFields}
			{#each groupedByStage as stageGroup (stageGroup.stage.id)}
				<div class="stage-section">
					{#each stageGroup.forms as formGroup (formGroup.form.id)}
						<AncestorFieldGroup
							stageName={stageGroup.stage.stage_name}
							formName={formGroup.form.name}
							fields={formGroup.fields}
							{selectedFieldIds}
							{onToggleField}
						/>
					{/each}
				</div>
			{/each}
		{:else}
			<div class="empty-state">
				<FileWarning class="h-8 w-8" />
				<p>No ancestor fields available</p>
				<span class="empty-hint">
					Add fields to forms in earlier stages to make them editable here.
				</span>
			</div>
		{/if}
	</div>
</div>

<style>
	.ancestor-fields-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.625rem 0.75rem;
		border-bottom: 1px solid hsl(var(--border));
		flex-shrink: 0;
	}

	.panel-title {
		font-size: 0.75rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		text-transform: uppercase;
		letter-spacing: 0.025em;
	}

	.field-count {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
	}

	.panel-content {
		flex: 1;
		overflow-y: auto;
		padding: 0.75rem;
	}

	.stage-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.stage-section:last-child {
		margin-bottom: 0;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem 1rem;
		text-align: center;
		color: hsl(var(--muted-foreground));
	}

	.empty-state :global(svg) {
		margin-bottom: 0.75rem;
		opacity: 0.5;
	}

	.empty-state p {
		font-size: 0.875rem;
		font-weight: 500;
		margin-bottom: 0.25rem;
	}

	.empty-hint {
		font-size: 0.75rem;
		opacity: 0.7;
		max-width: 180px;
	}
</style>
