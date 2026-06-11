<script lang="ts">
	import { ProtocolToolEditorView } from '../../right-sidebar/views/protocol-tool-editor';
	import { getBuilderContext, openProtocolForm } from '../../builder-context.svelte';
	import EmptyInspector from './EmptyInspector.svelte';

	const ctx = getBuilderContext();
	const { state, ui } = ctx;

	const toolId = $derived(ui.selection.type === 'protocolTool' ? ui.selection.id : null);
	const protocolTool = $derived(toolId ? (state.getProtocolToolById(toolId)?.data ?? null) : null);
	const formFieldCount = $derived.by(() => {
		if (!protocolTool?.protocol_form_id) return 0;
		return state.getFieldsForForm(protocolTool.protocol_form_id).length;
	});
</script>

{#if protocolTool && toolId}
	<ProtocolToolEditorView
		{protocolTool}
		{formFieldCount}
		allStages={state.visibleStages.map((s) => s.data)}
		onNameChange={(name) => state.updateProtocolTool(toolId, { name })}
		onStageIdsChange={(stageIds) => state.updateProtocolTool(toolId, { stage_id: stageIds })}
		onEditForm={() => openProtocolForm(ctx, toolId)}
		onDelete={() => {
			state.deleteProtocolTool(toolId);
			ui.deselect();
		}}
		onClose={() => ui.deselect()}
	/>
{:else}
	<EmptyInspector />
{/if}
