<script lang="ts">
	import type { SelectionContext, FormFieldData } from './context';
	import DefaultPanel from './panels/DefaultPanel.svelte';
	import StagePanel from './panels/StagePanel.svelte';
	import ActionPanel from './panels/ActionPanel.svelte';
	import FieldPanel from './panels/FieldPanel.svelte';

	type Props = {
		context: SelectionContext;
		hasStartStage: boolean;
		// Callbacks for StagePanel
		onAddField: (fieldType: string) => void;
		onEditStage: () => void;
		onDeleteStage: () => void;
		// Callbacks for ActionPanel
		onChangeActionType: (type: string) => void;
		onEditAction: () => void;
		onDeleteAction: () => void;
		// Callbacks for FieldPanel
		onToggleRequired: () => void;
		onMoveFieldUp: () => void;
		onMoveFieldDown: () => void;
		onDuplicateField: () => void;
		onEditField: () => void;
		onDeleteField: () => void;
	};

	let {
		context,
		hasStartStage,
		onAddField,
		onEditStage,
		onDeleteStage,
		onChangeActionType,
		onEditAction,
		onDeleteAction,
		onToggleRequired,
		onMoveFieldUp,
		onMoveFieldDown,
		onDuplicateField,
		onEditField,
		onDeleteField
	}: Props = $props();
</script>

<aside class="context-sidebar">
	{#if context.type === 'stage'}
		<StagePanel
			{context}
			{onAddField}
			{onEditStage}
			{onDeleteStage}
		/>
	{:else if context.type === 'action'}
		<ActionPanel
			{context}
			{onChangeActionType}
			{onEditAction}
			{onDeleteAction}
		/>
	{:else if context.type === 'field'}
		<FieldPanel
			{context}
			{onToggleRequired}
			onMoveUp={onMoveFieldUp}
			onMoveDown={onMoveFieldDown}
			onDuplicate={onDuplicateField}
			{onEditField}
			{onDeleteField}
		/>
	{:else}
		<DefaultPanel {hasStartStage} />
	{/if}
</aside>

<style>
	.context-sidebar {
		width: 260px;
		border-right: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		overflow-y: auto;
	}
</style>
