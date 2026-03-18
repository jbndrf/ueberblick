<script lang="ts">
	import type { Node, Edge } from '@xyflow/svelte';
	import type { SelectionContext } from '../../../context-sidebar/context';

	import StagePropertyPanel from './panels/StagePropertyPanel.svelte';
	import EdgePropertyPanel from './panels/EdgePropertyPanel.svelte';

	import type { ToolsEdit, ToolsForm, ToolsProtocol, VisualConfig } from '$lib/workflow-builder';

	type Role = {
		id: string;
		name: string;
		description?: string;
	};

	type Props = {
		context: SelectionContext;
		nodes: Node[];
		edges: Edge[];
		roles: Role[];
		/** Stage-attached edit tools (for stage property panel) */
		stageEditTools?: ToolsEdit[];
		/** Connection-attached forms (for edge property panel) */
		connectionForms?: ToolsForm[];
		/** Connection-attached edit tools (for edge property panel) */
		connectionEditTools?: ToolsEdit[];
		/** Connection-attached protocol tools (for edge property panel) */
		connectionProtocolTools?: ToolsProtocol[];
		onStageRename?: (stageId: string, newName: string) => void;
		onStageDelete?: (stageId: string) => void;
		onStageRolesChange?: (stageId: string, roleIds: string[]) => void;
		onEdgeRename?: (edgeId: string, newName: string) => void;
		onEdgeDelete?: (edgeId: string) => void;
		onEdgeRolesChange?: (edgeId: string, roleIds: string[]) => void;
		onEdgeSettingsChange?: (edgeId: string, settings: Record<string, any>) => void;
		/** Callback when a tool's allowed_roles change (for stage-attached tools) */
		onToolRolesChange?: (toolId: string, roleIds: string[]) => void;
		/** Callback when a tool's visual config changes (for stage-attached tools) */
		onToolVisualConfigChange?: (toolId: string, config: VisualConfig) => void;
		/** Callback when a tool is selected */
		onSelectTool?: (toolType: string, toolId: string) => void;
		/** Callback when a tool is deleted */
		onDeleteTool?: (toolType: string, toolId: string) => void;
		/** Callback to create a new role via server action */
		onCreateRole?: (name: string) => Promise<Role>;
	};

	let {
		context,
		nodes,
		edges,
		roles,
		stageEditTools = [],
		connectionForms = [],
		connectionEditTools = [],
		connectionProtocolTools = [],
		onStageRename,
		onStageDelete,
		onStageRolesChange,
		onEdgeRename,
		onEdgeDelete,
		onEdgeRolesChange,
		onEdgeSettingsChange,
		onToolRolesChange,
		onToolVisualConfigChange,
		onSelectTool,
		onDeleteTool,
		onCreateRole
	}: Props = $props();

	// Compute ancestor chain for field inheritance
	function computeAncestors(stageId: string): string[] {
		const ancestors: string[] = [];
		const visited = new Set<string>();

		function traverse(id: string) {
			if (visited.has(id)) return;
			visited.add(id);

			// Find edges where target === id (incoming edges) and it's not a self-loop
			const incoming = edges.filter((e) => e.target === id && e.source !== id);
			for (const edge of incoming) {
				ancestors.push(edge.source);
				traverse(edge.source);
			}
		}

		traverse(stageId);
		return ancestors;
	}

	const stageAncestors = $derived(
		context.type === 'stage' ? computeAncestors(context.stageId) : []
	);
</script>

<div class="property-view">
	{#if context.type === 'stage'}
		<StagePropertyPanel
			stage={context.stage}
			{nodes}
			{edges}
			{roles}
			{stageEditTools}
			ancestors={stageAncestors}
			onRename={onStageRename}
			onDelete={onStageDelete}
			onRolesChange={onStageRolesChange}
			{onToolRolesChange}
			{onToolVisualConfigChange}
			{onSelectTool}
			{onDeleteTool}
			{onCreateRole}
		/>
	{:else if context.type === 'action'}
		<EdgePropertyPanel
			edge={context.action}
			{nodes}
			{roles}
			{connectionForms}
			{connectionEditTools}
			{connectionProtocolTools}
			onRename={onEdgeRename}
			onDelete={onEdgeDelete}
			onRolesChange={onEdgeRolesChange}
			onSettingsChange={onEdgeSettingsChange}
			{onSelectTool}
			{onDeleteTool}
			{onCreateRole}
		/>
	{/if}
</div>

<style>
	.property-view {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}
</style>
