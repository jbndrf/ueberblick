<script lang="ts">
	import type { Node, Edge } from '@xyflow/svelte';

	import * as Tabs from '$lib/components/ui/tabs';
	import { FormRenderer } from '$lib/components/form-renderer';
	import type { FormFieldWithValue } from '$lib/components/form-renderer';
	import {
		Play,
		Square,
		CircleStop,
		FileText
	} from 'lucide-svelte';

	type FormGroup = { formName: string; allowedRoles: string[]; fields: FormFieldWithValue[] };

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
		stageFields?: Map<string, FormGroup[]>;
		onSelectStage?: (node: Node) => void;
	};

	let { workflowName, nodes, edges, roles = [], stageFields, onSelectStage }: Props = $props();

	let activeTab = $state<string>('overview');
	let roleFilter = $state('all');

	// Filter to only stage nodes (exclude entry markers)
	const stageNodes = $derived(nodes.filter(n => n.type === 'stage'));

	// Track active stage tab in Details
	let activeStageTab = $state<string>('');

	// Set default stage tab when stages change
	$effect(() => {
		if (stageNodes.length > 0 && !stageNodes.find(n => n.id === activeStageTab)) {
			activeStageTab = stageNodes[0].id;
		}
	});

	function getFormGroups(nodeId: string): FormGroup[] {
		return stageFields?.get(nodeId) ?? [];
	}

	// Get field count respecting role filter
	function getFieldCount(nodeId: string): number {
		const groups = getFormGroups(nodeId);
		if (roleFilter === 'all') {
			return groups.reduce((sum, g) => sum + g.fields.length, 0);
		}
		return groups
			.filter(g => g.allowedRoles.length === 0 || g.allowedRoles.includes(roleFilter))
			.reduce((sum, g) => sum + g.fields.length, 0);
	}

	// Get visible form groups for a stage (filtered by role)
	function getVisibleGroups(nodeId: string): FormGroup[] {
		const groups = getFormGroups(nodeId);
		if (roleFilter === 'all') return groups;
		return groups.filter(g => g.allowedRoles.length === 0 || g.allowedRoles.includes(roleFilter));
	}
</script>

<!-- Participant Sidebar Lookalike (matches ParticipantPreview structure) -->
<div class="participant-preview">
	<!-- ================================================================== -->
	<!-- Header (exact ModuleShell styling) -->
	<!-- ================================================================== -->
	<div
		class="flex items-center justify-between p-4 bg-primary text-primary-foreground rounded-t-xl flex-shrink-0 border-b border-border"
	>
		<div class="flex-1 min-w-0 space-y-0.5">
			<div class="text-lg font-semibold truncate">{workflowName}</div>
		</div>

		<div class="flex items-center gap-1 ml-2">
			<!-- Role filter -->
			<select
				class="text-xs bg-primary-foreground/10 rounded px-2 py-1 border-0 outline-none cursor-pointer text-primary-foreground"
				bind:value={roleFilter}
			>
				<option value="all">All roles</option>
				{#each roles as role}
					<option value={role.id}>{role.name}</option>
				{/each}
			</select>
		</div>
	</div>

	<!-- ================================================================== -->
	<!-- Content -->
	<!-- ================================================================== -->
	<div class="flex-1 min-h-0 overflow-y-auto">
		<div class="p-4">
			<!-- Tabs -->
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
						Overview
					</Tabs.Trigger>
					<Tabs.Trigger value="details" class="text-xs sm:text-sm">
						Details
					</Tabs.Trigger>
				</Tabs.List>

				<!-- ====================================================== -->
				<!-- Overview Tab -->
				<!-- ====================================================== -->
				<Tabs.Content value="overview" class="pt-4">
					{#if stageNodes.length === 0}
						<p class="text-sm text-muted-foreground text-center py-6">
							No stages yet. Add stages to the canvas to see a preview.
						</p>
					{:else}
						<div class="space-y-2">
							{#each stageNodes as node}
								{@const fieldCount = getFieldCount(node.id)}
								{@const stageType = node.data.stageType as string}
								<button
									class="stage-card"
									onclick={() => onSelectStage?.(node)}
								>
									<div class="stage-card-left">
										{#if stageType === 'start'}
											<Play class="h-3.5 w-3.5 text-green-500 shrink-0" />
										{:else if stageType === 'end'}
											<CircleStop class="h-3.5 w-3.5 text-pink-500 shrink-0" />
										{:else}
											<Square class="h-3.5 w-3.5 text-blue-500 shrink-0" />
										{/if}
										<div class="stage-card-info">
											<span class="stage-card-name">{node.data.title}</span>
											<span class="stage-card-meta">{fieldCount} {fieldCount === 1 ? 'field' : 'fields'}</span>
										</div>
									</div>
									<span class="stage-card-type">{stageType}</span>
								</button>
							{/each}
						</div>
					{/if}
				</Tabs.Content>

				<!-- ====================================================== -->
				<!-- Details Tab (stage sub-tabs with FormRenderer) -->
				<!-- ====================================================== -->
				<Tabs.Content value="details" class="pt-4">
					{#if stageNodes.length === 0}
						<p class="text-sm text-muted-foreground text-center py-6">
							No stages yet
						</p>
					{:else}
						<Tabs.Root bind:value={activeStageTab}>
							<Tabs.List class="w-full overflow-x-auto flex-nowrap">
								{#each stageNodes as node}
									<Tabs.Trigger value={node.id} class="text-xs whitespace-nowrap">
										{node.data.title}
									</Tabs.Trigger>
								{/each}
							</Tabs.List>
							{#each stageNodes as node}
								<Tabs.Content value={node.id} class="pt-3">
									{@const groups = getVisibleGroups(node.id)}
									{#if groups.length === 0 || groups.every(g => g.fields.length === 0)}
										<p class="text-xs text-muted-foreground text-center py-4">No form fields for this stage{roleFilter !== 'all' ? ' (for selected role)' : ''}</p>
									{:else}
										<div class="space-y-3">
											{#each groups as group}
												{#if group.fields.length > 0}
													<div class="form-group">
														<div class="form-group-header">
															<FileText class="w-3 h-3 text-muted-foreground" />
															<span class="text-xs font-medium">{group.formName}</span>
														</div>
														<div class="p-3">
															<FormRenderer mode="view" fields={group.fields} />
														</div>
													</div>
												{/if}
											{/each}
										</div>
									{/if}
								</Tabs.Content>
							{/each}
						</Tabs.Root>
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

	/* Stage cards */
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

	.stage-card-info {
		display: flex;
		flex-direction: column;
		gap: 0.0625rem;
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

	.stage-card-meta {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
	}

	.stage-card-type {
		font-size: 0.625rem;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.03em;
		flex-shrink: 0;
	}

	/* Form groups */
	.form-group {
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		overflow: hidden;
	}

	.form-group-header {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.75rem;
		background: hsl(var(--muted) / 0.5);
		border-bottom: 1px solid hsl(var(--border));
	}
</style>
