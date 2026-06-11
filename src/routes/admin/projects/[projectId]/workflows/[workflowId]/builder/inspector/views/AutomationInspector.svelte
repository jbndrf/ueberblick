<script lang="ts">
	import { AutomationEditorView } from '../../right-sidebar/views/automation-editor';
	import { getBuilderContext } from '../../builder-context.svelte';
	import EmptyInspector from './EmptyInspector.svelte';

	const { state, ui } = getBuilderContext();

	const automationId = $derived(ui.selection.type === 'automation' ? ui.selection.id : null);
	const automation = $derived(
		automationId ? (state.getAutomationById(automationId)?.data ?? null) : null
	);

	const stages = $derived(
		state.visibleStages.map((s) => ({ id: s.data.id, name: s.data.stage_name }))
	);

	// Field options keyed by field_def_id — that is what the automation runtime
	// matches against (workflow_field_values.field_def_id). Dedupe across forms.
	const fieldOptions = $derived.by(() => {
		const options: { key: string; label: string }[] = [];
		const seen = new Set<string>();
		for (const form of state.visibleForms) {
			for (const field of state.getFieldsForForm(form.data.id)) {
				const defId = field.data.field_def_id;
				if (!defId || seen.has(defId)) continue;
				seen.add(defId);
				options.push({ key: defId, label: field.data.field_label || defId });
			}
		}
		return options;
	});
</script>

{#if automation && automationId}
	<AutomationEditorView
		{automation}
		{stages}
		{fieldOptions}
		onNameChange={(name) => state.updateAutomation(automationId, { name })}
		onEnabledChange={(enabled) => state.updateAutomation(automationId, { is_enabled: enabled })}
		onTriggerTypeChange={(tt) => state.updateAutomation(automationId, { trigger_type: tt })}
		onTriggerConfigChange={(config) =>
			state.updateAutomation(automationId, { trigger_config: config })}
		onStepsChange={(steps) => state.updateAutomation(automationId, { steps })}
		onExecutionModeChange={(mode) => state.updateAutomation(automationId, { execution_mode: mode })}
		onDelete={() => {
			state.deleteAutomation(automationId);
			ui.deselect();
		}}
		onClose={() => ui.deselect()}
	/>
{:else}
	<EmptyInspector />
{/if}
