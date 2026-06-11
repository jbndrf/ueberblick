<script lang="ts">
	import { FieldLibraryView } from '../../right-sidebar/views/field-library';
	import { getBuilderContext } from '../../builder-context.svelte';

	const { state, ui, roles, projectWorkflows } = getBuilderContext();
</script>

<!--
	Def-level editing home. Currently renders the library list+detail view;
	a dedicated single-def editor (shared FieldDefSection) replaces this when
	the model tab takes over library management.
-->
<FieldLibraryView
	fieldDefs={state.fieldDefs}
	{roles}
	{projectWorkflows}
	onAdd={() => state.addFieldDef({ label: state.uniqueDefLabel('New Field') }).id}
	onUpdate={(id, updates) => state.updateFieldDef(id, updates)}
	onDelete={(id) => state.deleteFieldDef(id)}
	onClose={() => ui.deselect()}
/>
