<script lang="ts">
	import type { Node } from '@xyflow/svelte';

	import { Button } from '$lib/components/ui/button';
	import { Plus, FileText, Lock } from 'lucide-svelte';
	import * as m from '$lib/paraglide/messages';

	import PropertySection from './PropertySection.svelte';

	type Props = {
		stageId: string;
		nodes: Node[];
		ancestors: string[];
		// TODO: Add fields prop when form_fields are connected to stages
		// fields?: FormField[];
	};

	let { stageId, nodes, ancestors }: Props = $props();

	// Get node by ID
	function getNodeById(id: string): Node | undefined {
		return nodes.find((n) => n.id === id);
	}

	// Get current stage
	const currentStage = $derived(getNodeById(stageId));

	// Build stage groups for display
	// Order: current stage first, then ancestors in traversal order
	const stageGroups = $derived(() => {
		const groups: Array<{
			stageId: string;
			stageName: string;
			isCurrentStage: boolean;
			fields: any[]; // TODO: Replace with FormField[]
		}> = [];

		// Add current stage first
		if (currentStage) {
			groups.push({
				stageId: stageId,
				stageName: currentStage.data.title,
				isCurrentStage: true,
				fields: [] // TODO: Get fields for this stage
			});
		}

		// Add ancestor stages
		for (const ancestorId of ancestors) {
			const ancestorNode = getNodeById(ancestorId);
			if (ancestorNode) {
				groups.push({
					stageId: ancestorId,
					stageName: ancestorNode.data.title,
					isCurrentStage: false,
					fields: [] // TODO: Get fields for this stage
				});
			}
		}

		return groups;
	});
</script>

<div class="field-list">
	{#if stageGroups().length === 0}
		<div class="empty-state">
			<FileText class="h-8 w-8 text-muted-foreground/50" />
			<p class="empty-text">{m.propertiesFieldListNoStages?.() ?? 'No stages available'}</p>
		</div>
	{:else}
		{#each stageGroups() as group}
			<PropertySection
				title={group.isCurrentStage ? (m.propertiesFieldListThisStage?.() ?? 'This Stage') : group.stageName}
				defaultOpen={group.isCurrentStage}
			>
				{#if group.fields.length === 0}
					<div class="no-fields">
						{#if group.isCurrentStage}
							<p class="no-fields-text">{m.propertiesFieldListNoFieldsYet?.() ?? 'No fields yet. Add fields to capture data at this stage.'}</p>
							<Button variant="outline" size="sm" class="add-field-btn">
								<Plus class="h-3.5 w-3.5 mr-1.5" />
								{m.propertiesFieldListAddField?.() ?? 'Add Field'}
							</Button>
						{:else}
							<div class="ancestor-empty">
								<Lock class="h-3.5 w-3.5 text-muted-foreground" />
								<p class="no-fields-text">{m.propertiesFieldListNoFieldsAncestor?.() ?? 'No fields from this stage'}</p>
							</div>
						{/if}
					</div>
				{:else}
					<div class="field-items">
						{#each group.fields as field}
							<div class="field-item" class:readonly={!group.isCurrentStage}>
								<div class="field-icon">
									<FileText class="h-3.5 w-3.5" />
								</div>
								<div class="field-info">
									<span class="field-name">{field.label || field.key}</span>
									<span class="field-type">{field.type}</span>
								</div>
								{#if !group.isCurrentStage}
									<Lock class="h-3 w-3 text-muted-foreground" />
								{/if}
							</div>
						{/each}
						{#if group.isCurrentStage}
							<Button variant="ghost" size="sm" class="add-field-btn-inline">
								<Plus class="h-3.5 w-3.5 mr-1.5" />
								{m.propertiesFieldListAddField?.() ?? 'Add Field'}
							</Button>
						{/if}
					</div>
				{/if}
			</PropertySection>
		{/each}
	{/if}

	<!-- Summary footer -->
	{#if ancestors.length > 0}
		<div class="fields-summary">
			<p class="summary-text">
				{m.propertiesFieldListInheritsFields?.({ count: ancestors.length }) ?? `This stage inherits fields from ${ancestors.length} ancestor ${ancestors.length === 1 ? 'stage' : 'stages'}`}
			</p>
		</div>
	{/if}
</div>

<style>
	.field-list {
		display: flex;
		flex-direction: column;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem 1rem;
		gap: 0.75rem;
		text-align: center;
	}

	.empty-text {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
	}

	.no-fields {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 0;
	}

	.no-fields-text {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		text-align: center;
	}

	.ancestor-empty {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.add-field-btn {
		margin-top: 0.25rem;
	}

	.field-items {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.field-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.625rem;
		border-radius: 0.375rem;
		background: hsl(var(--accent) / 0.3);
		border: 1px solid hsl(var(--border));
	}

	.field-item.readonly {
		opacity: 0.7;
		background: hsl(var(--muted) / 0.5);
	}

	.field-icon {
		flex-shrink: 0;
		color: hsl(var(--muted-foreground));
	}

	.field-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.field-name {
		font-size: 0.8125rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.field-type {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
	}

	.add-field-btn-inline {
		margin-top: 0.5rem;
		align-self: flex-start;
	}

	.fields-summary {
		padding: 0.75rem 1rem;
		background: hsl(var(--muted) / 0.3);
		border-top: 1px solid oklch(0.88 0.01 250);
	}

	:global(.dark) .fields-summary {
		border-top-color: oklch(1 0 0 / 20%);
	}

	.summary-text {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		text-align: center;
	}
</style>
