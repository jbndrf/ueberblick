<script lang="ts">
	import { FieldTagEditorView } from '../../right-sidebar/views/field-tag-editor';
	import { getBuilderContext } from '../../builder-context.svelte';

	const { state, ui } = getBuilderContext();

	const tagMappings = $derived(state.getFieldTagForWorkflow()?.data.tag_mappings ?? []);
	const allFormFields = $derived(state.getAllFormFields());
</script>

<FieldTagEditorView
	{tagMappings}
	{allFormFields}
	onMappingChange={(tagType, fieldId, config) => state.setTagMapping(tagType, fieldId, config)}
	onConfigChange={(tagType, config) => state.updateTagMappingConfig(tagType, config)}
	onDelete={() => {
		state.deleteFieldTag();
		ui.deselect();
	}}
	onClose={() => ui.deselect()}
/>
