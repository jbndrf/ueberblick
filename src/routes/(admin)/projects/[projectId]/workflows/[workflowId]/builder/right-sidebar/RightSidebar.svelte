<script lang="ts">
	import type { Node, Edge } from '@xyflow/svelte';
	import type { SelectionContext, StageData } from '../context-sidebar/context';

	import PreviewView from './views/preview/PreviewView.svelte';
	import PropertyView from './views/properties/PropertyView.svelte';

	type Role = {
		id: string;
		name: string;
		description?: string;
	};

	type Props = {
		context: SelectionContext;
		workflowName: string;
		nodes: Node[];
		edges: Edge[];
		roles: Role[];
		// Handlers for property updates
		onStageRename?: (stageId: string, newName: string) => void;
		onStageDelete?: (stageId: string) => void;
		onStageRolesChange?: (stageId: string, roleIds: string[]) => void;
		onEdgeRename?: (edgeId: string, newName: string) => void;
		onEdgeDelete?: (edgeId: string) => void;
		onEdgeRolesChange?: (edgeId: string, roleIds: string[]) => void;
		onEdgeSettingsChange?: (edgeId: string, settings: Record<string, any>) => void;
		onSelectAction?: (edge: Edge) => void;
		onSelectStage?: (node: Node) => void;
	};

	let {
		context,
		workflowName,
		nodes,
		edges,
		roles,
		onStageRename,
		onStageDelete,
		onStageRolesChange,
		onEdgeRename,
		onEdgeDelete,
		onEdgeRolesChange,
		onEdgeSettingsChange,
		onSelectAction,
		onSelectStage
	}: Props = $props();

	// Auto-switch logic: show PropertyView when something is selected
	const hasSelection = $derived(context.type !== 'none');
</script>

<aside class="right-sidebar">
	{#if hasSelection}
		<PropertyView
			{context}
			{nodes}
			{edges}
			{roles}
			{onStageRename}
			{onStageDelete}
			{onStageRolesChange}
			{onEdgeRename}
			{onEdgeDelete}
			{onEdgeRolesChange}
			{onEdgeSettingsChange}
			{onSelectAction}
		/>
	{:else}
		<PreviewView {workflowName} {nodes} {edges} {onSelectStage} />
	{/if}
</aside>

<style>
	.right-sidebar {
		width: 360px;
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		/* Light mode: visible background and border */
		background: oklch(0.965 0.005 250);
		border-left: 1px solid oklch(0.88 0.01 250);
		box-shadow: -2px 0 12px oklch(0 0 0 / 0.06);
		overflow: hidden;
	}

	:global(.dark) .right-sidebar {
		background: hsl(var(--muted));
		border-left-color: oklch(1 0 0 / 20%);
		box-shadow: -2px 0 8px oklch(0 0 0 / 0.3);
	}
</style>
