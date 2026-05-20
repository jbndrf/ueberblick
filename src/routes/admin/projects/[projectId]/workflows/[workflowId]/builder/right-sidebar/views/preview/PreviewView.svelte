<script lang="ts">
	import type { Node, Edge } from '@xyflow/svelte';

	import * as Tabs from '$lib/components/ui/tabs';
	import { Play, Square, CircleStop } from '@lucide/svelte';
	import type { TrackedFieldDef, WorkflowFieldDef } from '$lib/workflow-builder';
	import {
		workflowBuilderPreviewViewDetails,
		workflowBuilderPreviewViewNoStages,
		workflowBuilderPreviewViewNoStagesHint,
		workflowBuilderPreviewViewOverview
	} from '$lib/paraglide/messages';
	import DataTabsEditor from './DataTabsEditor.svelte';

	type Role = {
		id: string;
		name: string;
		description?: string;
	};

	type Props = {
		workflowName: string;
		nodes: Node[];
		edges: Edge[];
		roles?: Role[];
		/** Workflow field defs — the data-tab editor partitions these into tabs. */
		fieldDefs?: TrackedFieldDef[];
		onFieldDefUpdate?: (id: string, updates: Partial<WorkflowFieldDef>) => void;
		onSelectStage?: (node: Node) => void;
	};

	let {
		workflowName,
		nodes,
		roles = [],
		fieldDefs = [],
		onFieldDefUpdate,
		onSelectStage
	}: Props = $props();

	let activeTab = $state<string>('overview');

	// Filter to only stage nodes (exclude entry markers)
	const stageNodes = $derived(nodes.filter((n) => n.type === 'stage'));
</script>

<!-- Participant Sidebar Lookalike (matches ParticipantPreview structure) -->
<div class="participant-preview">
	<!-- Header -->
	<div
		class="flex items-center justify-between p-4 bg-primary text-primary-foreground rounded-t-xl flex-shrink-0 border-b border-border"
	>
		<div class="flex-1 min-w-0 space-y-0.5">
			<div class="text-lg font-semibold truncate">{workflowName}</div>
		</div>
	</div>

	<!-- Content -->
	<div class="flex-1 min-h-0 overflow-y-auto">
		<div class="p-4">
			<Tabs.Root
				value={activeTab}
				onValueChange={(v) => (activeTab = v as string)}
				class="flex-1 flex flex-col min-h-0"
			>
				<Tabs.List
					class="grid w-full flex-shrink-0"
					style="grid-template-columns: repeat(2, minmax(0, 1fr))"
				>
					<Tabs.Trigger value="overview" class="text-xs sm:text-sm">
						{workflowBuilderPreviewViewOverview?.() ?? 'Overview'}
					</Tabs.Trigger>
					<Tabs.Trigger value="details" class="text-xs sm:text-sm">
						{workflowBuilderPreviewViewDetails?.() ?? 'Details'}
					</Tabs.Trigger>
				</Tabs.List>

				<!-- Overview Tab -->
				<Tabs.Content value="overview" class="pt-4">
					{#if stageNodes.length === 0}
						<p class="text-sm text-muted-foreground text-center py-6">
							{workflowBuilderPreviewViewNoStagesHint?.() ??
								'No stages yet. Add stages to the canvas to see a preview.'}
						</p>
					{:else}
						<div class="space-y-2">
							{#each stageNodes as node}
								{@const stageType = node.data.stageType as string}
								<button class="stage-card" onclick={() => onSelectStage?.(node)}>
									<div class="stage-card-left">
										{#if stageType === 'start'}
											<Play class="h-3.5 w-3.5 text-green-500 shrink-0" />
										{:else if stageType === 'end'}
											<CircleStop class="h-3.5 w-3.5 text-pink-500 shrink-0" />
										{:else}
											<Square class="h-3.5 w-3.5 text-blue-500 shrink-0" />
										{/if}
										<span class="stage-card-name">{node.data.title}</span>
									</div>
									<span class="stage-card-type">{stageType}</span>
								</button>
							{/each}
						</div>
					{/if}
				</Tabs.Content>

				<!-- Details Tab — configurable data tabs -->
				<Tabs.Content value="details" class="pt-4">
					{#if fieldDefs.length === 0 && stageNodes.length === 0}
						<p class="text-sm text-muted-foreground text-center py-6">
							{workflowBuilderPreviewViewNoStages?.() ?? 'No stages yet'}
						</p>
					{:else}
						<DataTabsEditor
							{fieldDefs}
							{roles}
							onFieldDefUpdate={(id, updates) => onFieldDefUpdate?.(id, updates)}
						/>
					{/if}
				</Tabs.Content>
			</Tabs.Root>
		</div>
	</div>
</div>

<style>
	.participant-preview {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
		background: hsl(var(--background));
		border-radius: 0.75rem 0.75rem 0 0;
	}

	.stage-card {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		padding: 0.625rem 0.75rem;
		border-radius: 0.5rem;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
	}

	.stage-card:hover {
		background: hsl(var(--accent));
		border-color: hsl(var(--accent));
	}

	.stage-card-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}

	.stage-card-name {
		font-size: 0.8125rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.stage-card-type {
		font-size: 0.625rem;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.03em;
		flex-shrink: 0;
	}
</style>
