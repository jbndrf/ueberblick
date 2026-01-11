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
		onAddStageTool: (toolType: string) => void;
		// Callbacks for ActionPanel
		onChangeActionType: (type: string) => void;
		onEditAction: () => void;
		onDeleteAction: () => void;
		onAddProgressTool: (toolType: string) => void;
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
		onAddStageTool,
		onChangeActionType,
		onEditAction,
		onDeleteAction,
		onAddProgressTool,
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
			{onAddStageTool}
		/>
	{:else if context.type === 'action'}
		<ActionPanel
			{context}
			{onChangeActionType}
			{onEditAction}
			{onDeleteAction}
			{onAddProgressTool}
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
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		overflow-y: auto;
		/* Light mode: visible gray background and border */
		background: oklch(0.965 0.005 250);
		border-right: 1px solid oklch(0.88 0.01 250);
		box-shadow: 2px 0 12px oklch(0 0 0 / 0.06);
	}

	:global(.dark) .context-sidebar {
		background: hsl(var(--muted));
		border-right-color: oklch(1 0 0 / 20%);
		box-shadow: 2px 0 8px oklch(0 0 0 / 0.3);
	}
</style>
