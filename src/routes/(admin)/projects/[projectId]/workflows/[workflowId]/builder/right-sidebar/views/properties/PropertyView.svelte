<script lang="ts">
	import type { Node, Edge } from '@xyflow/svelte';
	import type { SelectionContext } from '../../../context-sidebar/context';

	import StagePropertyPanel from './panels/StagePropertyPanel.svelte';
	import EdgePropertyPanel from './panels/EdgePropertyPanel.svelte';

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
		onStageRename?: (stageId: string, newName: string) => void;
		onStageDelete?: (stageId: string) => void;
		onStageRolesChange?: (stageId: string, roleIds: string[]) => void;
		onEdgeRename?: (edgeId: string, newName: string) => void;
		onEdgeDelete?: (edgeId: string) => void;
		onEdgeRolesChange?: (edgeId: string, roleIds: string[]) => void;
		onEdgeSettingsChange?: (edgeId: string, settings: Record<string, any>) => void;
		onSelectAction?: (edge: Edge) => void;
	};

	let {
		context,
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
		onSelectAction
	}: Props = $props();

	// Compute outgoing and edit actions for selected stage
	const stageOutgoingActions = $derived(
		context.type === 'stage'
			? edges.filter((e) => e.source === context.stageId && e.target !== context.stageId)
			: []
	);

	const stageEditActions = $derived(
		context.type === 'stage'
			? edges.filter((e) => e.source === context.stageId && e.target === context.stageId)
			: []
	);

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
			outgoingActions={stageOutgoingActions}
			editActions={stageEditActions}
			ancestors={stageAncestors}
			onRename={onStageRename}
			onDelete={onStageDelete}
			onRolesChange={onStageRolesChange}
			{onSelectAction}
		/>
	{:else if context.type === 'action'}
		<EdgePropertyPanel
			edge={context.action}
			{nodes}
			{roles}
			onRename={onEdgeRename}
			onDelete={onEdgeDelete}
			onRolesChange={onEdgeRolesChange}
			onSettingsChange={onEdgeSettingsChange}
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
