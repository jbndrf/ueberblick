<script lang="ts">
	import { FileWarning } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages';
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
		/** Whether to show prefill toggle on selected fields */
		showPrefillToggle?: boolean;
		/** Per-field prefill config (field_id -> enabled) */
		prefillConfig?: Record<string, boolean>;
		/** Callback when prefill toggle is clicked */
		onTogglePrefill?: (fieldId: string) => void;
	};

	let {
		ancestorFields,
		selectedFieldIds,
		onToggleField,
		showPrefillToggle = false,
		prefillConfig = {},
		onTogglePrefill
	}: Props = $props();

	// Group by stage for better organization, deduping at stage/form/field level so
	// overlapping entries from the state helpers don't crash the keyed each blocks.
	const groupedByStage = $derived.by(() => {
		const stageMap = new Map<
			string,
			{ stage: WorkflowStage; forms: Map<string, AncestorFieldGroupData> }
		>();

		for (const group of ancestorFields) {
			const stageId = group.stage?.id;
			const formId = group.form?.id;
			if (!stageId || !formId) continue;

			let stageEntry = stageMap.get(stageId);
			if (!stageEntry) {
				stageEntry = { stage: group.stage, forms: new Map() };
				stageMap.set(stageId, stageEntry);
			}

			const existingForm = stageEntry.forms.get(formId);
			if (!existingForm) {
				stageEntry.forms.set(formId, {
					stage: group.stage,
					form: group.form,
					fields: [...group.fields]
				});
			} else {
				const seen = new Set(existingForm.fields.map((f) => f.id));
				for (const field of group.fields) {
					if (!seen.has(field.id)) {
						existingForm.fields.push(field);
						seen.add(field.id);
					}
				}
			}
		}

		return Array.from(stageMap.values()).map((entry) => ({
			stage: entry.stage,
			forms: Array.from(entry.forms.values())
		}));
	});

	const hasFields = $derived(ancestorFields.length > 0);
</script>

<div class="ancestor-fields-panel">
	<div class="panel-header">
		<span class="panel-title">{m.editToolAncestorFieldsPanelAvailableFields?.() ?? 'Available Fields'}</span>
		<span class="field-count">{selectedFieldIds.length} {m.editToolAncestorFieldsPanelSelected?.() ?? 'selected'}</span>
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
							{showPrefillToggle}
							{prefillConfig}
							{onTogglePrefill}
						/>
					{/each}
				</div>
			{/each}
		{:else}
			<div class="empty-state">
				<FileWarning class="h-8 w-8" />
				<p>{m.editToolAncestorFieldsPanelNoFieldsAvailable?.() ?? 'No ancestor fields available'}</p>
				<span class="empty-hint">
					{m.editToolAncestorFieldsPanelNoFieldsHint?.() ?? 'Add fields to forms in earlier stages to make them editable here.'}
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
