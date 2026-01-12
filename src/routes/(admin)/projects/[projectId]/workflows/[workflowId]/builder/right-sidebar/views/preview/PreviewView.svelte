<script lang="ts">
	import type { Node, Edge } from '@xyflow/svelte';

	import { Button } from '$lib/components/ui/button';
	import * as Tabs from '$lib/components/ui/tabs';
	import {
		RefreshCw,
		Play,
		Square,
		CircleStop,
		MapPin,
		Clock,
		User,
		FileText,
		History
	} from 'lucide-svelte';

	type Props = {
		workflowName: string;
		nodes: Node[];
		edges: Edge[];
		onSelectStage?: (node: Node) => void;
	};

	let { workflowName, nodes, edges, onSelectStage }: Props = $props();

	let previewTab = $state('overview');
</script>

<div class="preview-view">
	<div class="preview-header">
		<div class="preview-title">
			<span class="text-sm font-medium">{workflowName}</span>
			<span class="text-xs text-muted-foreground">Participant View</span>
		</div>
		<Button variant="ghost" size="icon" class="h-7 w-7" title="Refresh Preview">
			<RefreshCw class="h-3.5 w-3.5" />
		</Button>
	</div>

	<Tabs.Root bind:value={previewTab} class="flex-1 flex flex-col">
		<Tabs.List class="preview-tabs">
			<Tabs.Trigger value="overview">Overview</Tabs.Trigger>
			<Tabs.Trigger value="details">Details</Tabs.Trigger>
			<Tabs.Trigger value="audit">Audit</Tabs.Trigger>
		</Tabs.List>

		<div class="preview-content bg-card">
			<Tabs.Content value="overview" class="preview-tab-content">
				<!-- Mock location info -->
				<div class="preview-section">
					<div class="preview-section-header">
						<MapPin class="h-4 w-4 text-muted-foreground" />
						<span class="text-muted-foreground">Location</span>
					</div>
					<div class="preview-mock-field bg-muted/50 border border-dashed border-border">
						<span class="text-sm text-muted-foreground">Sample Location</span>
					</div>
				</div>

				<!-- Timestamps -->
				<div class="preview-section">
					<div class="preview-section-header">
						<Clock class="h-4 w-4 text-muted-foreground" />
						<span class="text-muted-foreground">Timeline</span>
					</div>
					<div class="preview-info-row">
						<span class="text-xs text-muted-foreground">Created</span>
						<span class="text-xs text-foreground">--</span>
					</div>
					<div class="preview-info-row">
						<span class="text-xs text-muted-foreground">Updated</span>
						<span class="text-xs text-foreground">--</span>
					</div>
				</div>

				<!-- Current stage -->
				<div class="preview-section">
					<div class="preview-section-header">
						<User class="h-4 w-4 text-muted-foreground" />
						<span class="text-muted-foreground">Status</span>
					</div>
					<div class="preview-info-row">
						<span class="text-xs text-muted-foreground">Current Stage</span>
						<span class="text-xs text-foreground">None selected</span>
					</div>
				</div>

				<!-- Form fields overview -->
				<div class="preview-section">
					<div class="preview-section-header">
						<FileText class="h-4 w-4 text-muted-foreground" />
						<span class="text-muted-foreground">Form Fields</span>
					</div>
					{#if nodes.length === 0}
						<p class="text-xs text-muted-foreground py-2">No stages yet</p>
					{:else}
						{#each nodes as node}
							<button
								class="preview-stage-summary bg-accent/30 border border-border"
								onclick={() => onSelectStage?.(node)}
							>
								<div class="preview-stage-name">
									{#if node.data.stageType === 'start'}
										<Play class="h-3 w-3 text-green-500" />
									{:else if node.data.stageType === 'end'}
										<CircleStop class="h-3 w-3 text-pink-500" />
									{:else}
										<Square class="h-3 w-3 text-blue-500" />
									{/if}
									<span class="text-xs font-medium text-foreground">{node.data.title}</span>
								</div>
								<span class="text-xs text-muted-foreground">0 fields</span>
							</button>
						{/each}
					{/if}
				</div>
			</Tabs.Content>

			<Tabs.Content value="details" class="preview-tab-content">
				<div class="preview-empty">
					<FileText class="h-8 w-8 text-muted-foreground/50" />
					<p class="text-sm text-muted-foreground">Select a stage to preview its form</p>
				</div>
			</Tabs.Content>

			<Tabs.Content value="audit" class="preview-tab-content">
				<div class="preview-section">
					<div class="preview-section-header">
						<History class="h-4 w-4 text-muted-foreground" />
						<span class="text-muted-foreground">Activity Log</span>
					</div>
					<div class="preview-audit-list">
						<p class="text-xs text-muted-foreground text-center py-4">
							Preview mode - no activity yet
						</p>
					</div>
				</div>
			</Tabs.Content>
		</div>
	</Tabs.Root>
</div>

<style>
	.preview-view {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.preview-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid oklch(0.88 0.01 250);
	}

	:global(.dark) .preview-header {
		border-bottom-color: oklch(1 0 0 / 20%);
	}

	.preview-title {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.preview-tabs {
		width: 100%;
		justify-content: stretch;
		border-radius: 0;
		padding: 0 0.5rem;
		border-bottom: 1px solid oklch(0.88 0.01 250);
	}

	:global(.dark) .preview-tabs {
		border-bottom-color: oklch(1 0 0 / 20%);
	}

	.preview-content {
		flex: 1;
		overflow-y: auto;
	}

	.preview-tab-content {
		padding: 0;
	}

	.preview-section {
		padding: 1rem;
		border-bottom: 1px solid oklch(0.88 0.01 250);
	}

	:global(.dark) .preview-section {
		border-bottom-color: oklch(1 0 0 / 20%);
	}

	.preview-section-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		font-weight: 500;
		text-transform: uppercase;
		margin-bottom: 0.75rem;
	}

	.preview-mock-field {
		padding: 0.5rem 0.75rem;
		border-radius: 0.375rem;
	}

	.preview-info-row {
		display: flex;
		justify-content: space-between;
		padding: 0.25rem 0;
	}

	.preview-stage-summary {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		padding: 0.5rem 0.75rem;
		border-radius: 0.375rem;
		margin-bottom: 0.375rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.preview-stage-summary:hover {
		background: hsl(var(--accent) / 0.5);
	}

	.preview-stage-name {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.preview-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1rem;
		gap: 0.75rem;
		text-align: center;
	}

	.preview-audit-list {
		min-height: 100px;
	}
</style>
