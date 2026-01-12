<script lang="ts">
	import type { Node, Edge } from '@xyflow/svelte';

	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Tabs from '$lib/components/ui/tabs';
	import EntitySelector from '$lib/components/entity-selector.svelte';

	import { Play, Square, CircleStop, Trash2, ArrowRight, RotateCcw } from 'lucide-svelte';

	import PropertySection from '../shared/PropertySection.svelte';
	import FieldList from '../shared/FieldList.svelte';

	type Role = {
		id: string;
		name: string;
		description?: string;
	};

	type Props = {
		stage: Node;
		nodes: Node[];
		edges: Edge[];
		roles: Role[];
		outgoingActions: Edge[];
		editActions: Edge[];
		ancestors: string[];
		onRename?: (stageId: string, newName: string) => void;
		onDelete?: (stageId: string) => void;
		onRolesChange?: (stageId: string, roleIds: string[]) => void;
		onSelectAction?: (edge: Edge) => void;
	};

	let {
		stage,
		nodes,
		edges,
		roles,
		outgoingActions,
		editActions,
		ancestors,
		onRename,
		onDelete,
		onRolesChange,
		onSelectAction
	}: Props = $props();

	// Local state for editing
	let stageName = $state(stage.data.title);
	let selectedRoleIds = $state<string[]>(stage.data.visible_to_roles || []);
	let activeTab = $state('permissions');

	// Track current stage ID to detect stage switches
	let currentStageId = $state(stage.id);

	// Update local state when stage changes (user selected different stage)
	$effect(() => {
		if (stage.id !== currentStageId) {
			currentStageId = stage.id;
			stageName = stage.data.title;
			selectedRoleIds = stage.data.visible_to_roles || [];
		}
	});

	// Watch for role changes and notify parent
	$effect(() => {
		// Compare with prop value to avoid calling on initial sync
		const propRoles = stage.data.visible_to_roles || [];
		const rolesChanged =
			selectedRoleIds.length !== propRoles.length ||
			selectedRoleIds.some((id, i) => id !== propRoles[i]);

		if (rolesChanged && stage.id === currentStageId) {
			onRolesChange?.(stage.id, selectedRoleIds);
		}
	});

	// Get stage type icon
	function getStageIcon(type: string) {
		switch (type) {
			case 'start':
				return Play;
			case 'end':
				return CircleStop;
			default:
				return Square;
		}
	}

	// Get stage type color
	function getStageTypeColor(type: string) {
		switch (type) {
			case 'start':
				return 'text-green-500';
			case 'end':
				return 'text-pink-500';
			default:
				return 'text-blue-500';
		}
	}

	// Get stage type badge class
	function getStageTypeBadgeClass(type: string) {
		switch (type) {
			case 'start':
				return 'badge-start';
			case 'end':
				return 'badge-end';
			default:
				return 'badge-intermediate';
		}
	}

	// Handle name change
	function handleNameBlur() {
		if (stageName !== stage.data.title && stageName.trim()) {
			onRename?.(stage.id, stageName.trim());
		}
	}

	// Handle roles change
	function handleRolesChange() {
		onRolesChange?.(stage.id, selectedRoleIds);
	}

	// Handle delete
	function handleDelete() {
		onDelete?.(stage.id);
	}

	// Get node by ID
	function getNodeById(id: string): Node | undefined {
		return nodes.find((n) => n.id === id);
	}

	const StageIcon = $derived(getStageIcon(stage.data.stageType));
</script>

<div class="stage-property-panel">
	<!-- Header -->
	<div class="panel-header">
		<div class="header-content">
			<div class="header-icon {getStageTypeColor(stage.data.stageType)}">
				<StageIcon class="h-4 w-4" />
			</div>
			<div class="header-info">
				<Input
					bind:value={stageName}
					onblur={handleNameBlur}
					class="header-input"
					placeholder="Stage name..."
				/>
				<span class="stage-type-badge {getStageTypeBadgeClass(stage.data.stageType)}">
					{stage.data.stageType}
				</span>
			</div>
		</div>
	</div>

	<!-- Tabs -->
	<Tabs.Root bind:value={activeTab} class="flex-1 flex flex-col">
		<Tabs.List class="panel-tabs">
			<Tabs.Trigger value="permissions">Permissions</Tabs.Trigger>
			<Tabs.Trigger value="actions">Actions</Tabs.Trigger>
			<Tabs.Trigger value="fields">Fields</Tabs.Trigger>
		</Tabs.List>

		<div class="panel-content">
			<!-- Permissions Tab -->
			<Tabs.Content value="permissions" class="tab-content">
				<PropertySection title="Visible to Roles">
					<EntitySelector
						bind:selectedEntityIds={selectedRoleIds}
						availableEntities={roles}
						getEntityId={(r) => r.id}
						getEntityName={(r) => r.name}
						getEntityDescription={(r) => r.description}
						allowCreate={true}
						createAction="?/createRole"
						placeholder="Type # to see all or search..."
						class="w-full"
					/>
					<p class="help-text">
						Only participants with these roles can see this stage. Leave empty to make visible to
						all.
					</p>
				</PropertySection>
			</Tabs.Content>

			<!-- Actions Tab -->
			<Tabs.Content value="actions" class="tab-content">
				<PropertySection title="Progress Actions" defaultOpen={true}>
					{#if outgoingActions.length === 0}
						<p class="empty-text">No progress actions. Connect to another stage to create one.</p>
					{:else}
						<div class="action-list">
							{#each outgoingActions as action}
								{@const targetNode = getNodeById(action.target)}
								<button class="action-item" onclick={() => onSelectAction?.(action)}>
									<div class="action-icon">
										<ArrowRight class="h-3.5 w-3.5" />
									</div>
									<div class="action-info">
										<span class="action-name">{action.label || 'Untitled'}</span>
										<span class="action-target">
											to {targetNode?.data.title || 'Unknown'}
										</span>
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</PropertySection>

				<PropertySection title="Edit Actions" defaultOpen={true}>
					{#if editActions.length === 0}
						<p class="empty-text">No edit actions. Right-click this stage twice to create one.</p>
					{:else}
						<div class="action-list">
							{#each editActions as action}
								<button class="action-item" onclick={() => onSelectAction?.(action)}>
									<div class="action-icon edit">
										<RotateCcw class="h-3.5 w-3.5" />
									</div>
									<div class="action-info">
										<span class="action-name">{action.label || 'Edit'}</span>
										<span class="action-target">stays on this stage</span>
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</PropertySection>
			</Tabs.Content>

			<!-- Fields Tab -->
			<Tabs.Content value="fields" class="tab-content">
				<FieldList stageId={stage.id} {nodes} {ancestors} />
			</Tabs.Content>
		</div>
	</Tabs.Root>

	<!-- Footer -->
	<div class="panel-footer">
		<Button variant="destructive" size="sm" onclick={handleDelete} class="w-full">
			<Trash2 class="h-4 w-4 mr-2" />
			Delete Stage
		</Button>
	</div>
</div>

<style>
	.stage-property-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.panel-header {
		padding: 1rem;
		border-bottom: 1px solid oklch(0.88 0.01 250);
	}

	:global(.dark) .panel-header {
		border-bottom-color: oklch(1 0 0 / 20%);
	}

	.header-content {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
	}

	.header-icon {
		flex-shrink: 0;
		padding: 0.5rem;
		border-radius: 0.375rem;
		background: hsl(var(--accent));
	}

	.header-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.header-info :global(.header-input) {
		height: 2rem;
		font-size: 0.875rem;
		font-weight: 500;
		padding: 0 0.5rem;
	}

	.stage-type-badge {
		display: inline-flex;
		align-self: flex-start;
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		background: hsl(var(--accent));
		color: hsl(var(--accent-foreground));
	}

	.badge-start {
		background: hsl(142 76% 36% / 0.15);
		color: hsl(142 76% 36%);
	}

	.badge-end {
		background: hsl(346 87% 60% / 0.15);
		color: hsl(346 87% 60%);
	}

	.badge-intermediate {
		background: hsl(217 91% 60% / 0.15);
		color: hsl(217 91% 60%);
	}

	.panel-tabs {
		width: 100%;
		justify-content: stretch;
		border-radius: 0;
		padding: 0 0.5rem;
		border-bottom: 1px solid oklch(0.88 0.01 250);
	}

	:global(.dark) .panel-tabs {
		border-bottom-color: oklch(1 0 0 / 20%);
	}

	.panel-content {
		flex: 1;
		overflow-y: auto;
	}

	.tab-content {
		padding: 0;
	}

	.help-text {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		margin-top: 0.5rem;
	}

	.empty-text {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		text-align: center;
		padding: 1rem 0;
	}

	.action-list {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.action-item {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.5rem 0.625rem;
		border-radius: 0.375rem;
		background: hsl(var(--accent) / 0.3);
		border: 1px solid hsl(var(--border));
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
		width: 100%;
	}

	.action-item:hover {
		background: hsl(var(--accent) / 0.5);
	}

	.action-icon {
		flex-shrink: 0;
		padding: 0.375rem;
		border-radius: 0.25rem;
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary));
	}

	.action-icon.edit {
		background: hsl(var(--muted));
		color: hsl(var(--muted-foreground));
	}

	.action-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.action-name {
		font-size: 0.8125rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.action-target {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
	}

	.panel-footer {
		padding: 1rem;
		border-top: 1px solid oklch(0.88 0.01 250);
	}

	:global(.dark) .panel-footer {
		border-top-color: oklch(1 0 0 / 20%);
	}
</style>
