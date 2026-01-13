<script lang="ts">
	import type { Node, Edge } from '@xyflow/svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { getPocketBase } from '$lib/pocketbase';

	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Tabs from '$lib/components/ui/tabs';
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';

	import { Play, Square, CircleStop, Trash2 } from 'lucide-svelte';

	import PropertySection from '../shared/PropertySection.svelte';
	import ConnectedToolItem from '../shared/ConnectedToolItem.svelte';
	import FieldList from '../shared/FieldList.svelte';

	import { toolRegistry } from '$lib/workflow-builder/tools';
	import type { ToolsEdit, VisualConfig } from '$lib/workflow-builder';

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
		ancestors: string[];
		/** Stage-attached edit tools */
		stageEditTools?: ToolsEdit[];
		onRename?: (stageId: string, newName: string) => void;
		onDelete?: (stageId: string) => void;
		onRolesChange?: (stageId: string, roleIds: string[]) => void;
		/** Callback when a tool's allowed_roles change */
		onToolRolesChange?: (toolId: string, roleIds: string[]) => void;
		/** Callback when a tool's visual config changes */
		onToolVisualConfigChange?: (toolId: string, config: VisualConfig) => void;
		/** Callback when a tool is selected */
		onSelectTool?: (toolType: string, toolId: string) => void;
	};

	let {
		stage,
		nodes,
		edges,
		roles,
		ancestors,
		stageEditTools = [],
		onRename,
		onDelete,
		onRolesChange,
		onToolRolesChange,
		onToolVisualConfigChange,
		onSelectTool
	}: Props = $props();

	// Local state for editing
	let stageName = $state(stage.data.title);
	let selectedRoleIds = $state<string[]>(stage.data.visible_to_roles || []);
	let activeTab = $state('permissions');

	// Track current stage ID to detect stage switches
	let currentStageId = $state(stage.id);

	// Local state for tool roles (keyed by tool ID)
	let toolRolesMap = $state<Record<string, string[]>>({});

	// Initialize tool roles map
	$effect(() => {
		const newMap: Record<string, string[]> = {};
		for (const tool of stageEditTools) {
			newMap[tool.id] = tool.allowed_roles || [];
		}
		toolRolesMap = newMap;
	});

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

	// Handle delete
	function handleDelete() {
		onDelete?.(stage.id);
	}

	// Create role callback for MobileMultiSelect
	async function createRole(name: string) {
		const pb = getPocketBase();
		const newRole = await pb.collection('roles').create({
			project_id: $page.params.projectId,
			name: name,
			description: ''
		});
		await invalidateAll();
		return newRole;
	}

	// Handle tool roles change
	function handleToolRolesChange(toolId: string, newRoleIds: string[]) {
		toolRolesMap[toolId] = newRoleIds;
		onToolRolesChange?.(toolId, newRoleIds);
	}

	// Get tool icon from registry
	function getToolIcon(toolType: string) {
		return toolRegistry.get(toolType)?.icon;
	}

	// Get tool color from registry
	function getToolColor(toolType: string) {
		return toolRegistry.get(toolType)?.defaultColor ?? '#6B7280';
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
			<Tabs.Trigger value="tools">Tools</Tabs.Trigger>
			<Tabs.Trigger value="fields">Fields</Tabs.Trigger>
		</Tabs.List>

		<div class="panel-content">
			<!-- Permissions Tab -->
			<Tabs.Content value="permissions" class="tab-content">
				<!-- Stage Visibility - Primary/Prominent Section -->
				<div class="primary-permission-section">
					<div class="primary-permission-header">
						<span class="primary-permission-title">Stage Visibility</span>
					</div>
					<div class="primary-permission-content">
						<MobileMultiSelect
							bind:selectedIds={selectedRoleIds}
							options={roles}
							getOptionId={(r) => r.id}
							getOptionLabel={(r) => r.name}
							getOptionDescription={(r) => r.description}
							allowCreate={true}
							onCreateOption={createRole}
							placeholder="Select or search roles..."
							class="w-full"
						/>
						<p class="help-text">
							Only participants with these roles can see this stage. Leave empty to make visible to all.
						</p>
					</div>
				</div>

				<!-- Tool Permissions Section -->
				{#if stageEditTools.length > 0}
					<PropertySection title="Tool Permissions" defaultOpen={true}>
						<div class="tool-permissions-list">
							{#each stageEditTools as tool (tool.id)}
								{@const ToolIcon = getToolIcon('edit')}
								{@const iconColor = getToolColor('edit')}
								<div class="tool-permission-item">
									<div class="tool-permission-header">
										<div class="tool-icon" style="--icon-color: {iconColor}">
											{#if ToolIcon}
												<ToolIcon class="icon" />
											{/if}
										</div>
										<span class="tool-name">{tool.name}</span>
									</div>
									<div class="tool-permission-roles">
										<MobileMultiSelect
											selectedIds={toolRolesMap[tool.id] || []}
											onSelectedIdsChange={(ids) => handleToolRolesChange(tool.id, ids)}
											options={roles}
											getOptionId={(r) => r.id}
											getOptionLabel={(r) => r.name}
											getOptionDescription={(r) => r.description}
											allowCreate={true}
											onCreateOption={createRole}
											placeholder="All roles..."
											class="w-full"
										/>
									</div>
								</div>
							{/each}
						</div>
					</PropertySection>
				{/if}
			</Tabs.Content>

			<!-- Tools Tab -->
			<Tabs.Content value="tools" class="tab-content">
				<PropertySection title="Connected Tools" defaultOpen={true}>
					{#if stageEditTools.length === 0}
						<p class="empty-text">No tools attached to this stage.</p>
					{:else}
						<div class="tools-list">
							{#each stageEditTools as tool (tool.id)}
								<ConnectedToolItem
									toolType="edit"
									name={tool.name}
									visualConfig={tool.visual_config || {}}
									onVisualConfigChange={(config) => onToolVisualConfigChange?.(tool.id, config)}
									onSelect={() => onSelectTool?.('edit', tool.id)}
									defaultButtonLabel="Edit"
									defaultButtonColor="#6366F1"
								/>
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

	/* Primary permission section - prominent styling */
	.primary-permission-section {
		margin: 0.75rem;
		border-radius: 0.5rem;
		border: 2px solid hsl(var(--primary) / 0.2);
		background: hsl(var(--primary) / 0.05);
	}

	.primary-permission-header {
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid hsl(var(--primary) / 0.1);
	}

	.primary-permission-title {
		font-size: 0.75rem;
		font-weight: 600;
		color: hsl(var(--primary));
		text-transform: uppercase;
		letter-spacing: 0.025em;
	}

	.primary-permission-content {
		padding: 0.75rem;
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

	/* Tool permissions styling */
	.tool-permissions-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.tool-permission-item {
		padding: 0.625rem;
		border-radius: 0.375rem;
		background: hsl(var(--accent) / 0.3);
		border: 1px solid hsl(var(--border));
	}

	.tool-permission-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.tool-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		background: color-mix(in srgb, var(--icon-color) 15%, transparent);
		border-radius: 0.25rem;
	}

	.tool-icon :global(.icon) {
		width: 12px;
		height: 12px;
		color: var(--icon-color);
	}

	.tool-name {
		font-size: 0.8125rem;
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.tool-permission-roles {
		/* Roles selector */
	}

	/* Tools list styling */
	.tools-list {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.panel-footer {
		padding: 1rem;
		border-top: 1px solid oklch(0.88 0.01 250);
	}

	:global(.dark) .panel-footer {
		border-top-color: oklch(1 0 0 / 20%);
	}
</style>
