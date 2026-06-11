<script lang="ts">
	import { EditToolEditorView } from '../../right-sidebar/views/edit-tool-editor';
	import { getBuilderContext } from '../../builder-context.svelte';
	import EmptyInspector from './EmptyInspector.svelte';

	const { state, ui } = getBuilderContext();

	const toolId = $derived(ui.selection.type === 'editTool' ? ui.selection.id : null);
	const editTool = $derived(toolId ? (state.getEditToolById(toolId)?.data ?? null) : null);
	// Edit tools may reference any field in the workflow regardless of stage position.
	const ancestorFields = $derived(toolId ? state.getAllFormFields() : []);
</script>

{#if editTool && toolId}
	<EditToolEditorView
		{editTool}
		{ancestorFields}
		onNameChange={(name) => state.updateEditTool(toolId, { name })}
		onFieldsChange={(fieldIds) => state.updateEditTool(toolId, { editable_fields: fieldIds })}
		onEditModeChange={(mode) => state.updateEditTool(toolId, { edit_mode: mode })}
		onDelete={() => {
			state.deleteEditTool(toolId);
			ui.deselect();
		}}
		onClose={() => ui.deselect()}
	/>
{:else}
	<EmptyInspector />
{/if}
