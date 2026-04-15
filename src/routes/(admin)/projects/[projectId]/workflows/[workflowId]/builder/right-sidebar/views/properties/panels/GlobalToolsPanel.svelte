<script lang="ts">
	import { untrack } from 'svelte';

	import { Button } from '$lib/components/ui/button';
	import * as Tabs from '$lib/components/ui/tabs';
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';

	import { Globe, Zap, Plus, ChevronRight } from 'lucide-svelte';
	import * as Switch from '$lib/components/ui/switch';

	import PropertySection from '../shared/PropertySection.svelte';
	import ConnectedToolItem from '../shared/ConnectedToolItem.svelte';

	import { toolRegistry } from '$lib/workflow-builder/tools';
	import type { ToolsEdit, ToolsAutomation, VisualConfig } from '$lib/workflow-builder';
	import * as m from '$lib/paraglide/messages';

	type Role = {
		id: string;
		name: string;
		description?: string;
	};

	type Props = {
		/** Global edit tools (is_global=true) */
		globalEditTools: ToolsEdit[];
		/** Automations for this workflow */
		automations?: ToolsAutomation[];
		/** Available roles */
		roles: Role[];
		/** Callback when a tool's allowed_roles change */
		onToolRolesChange?: (toolId: string, roleIds: string[]) => void;
		/** Callback when a tool's visual config changes */
		onToolVisualConfigChange?: (toolId: string, config: VisualConfig) => void;
		/** Callback when a tool is selected */
		onSelectTool?: (toolType: string, toolId: string) => void;
		/** Callback when a tool is deleted */
		onDeleteTool?: (toolType: string, toolId: string) => void;
		/** Callback to create a new role via server action */
		onCreateRole?: (name: string) => Promise<Role>;
		/** Callback when an automation is selected (opens editor) */
		onSelectAutomation?: (automationId: string) => void;
		/** Callback to add a new automation */
		onAddAutomation?: () => void;
		/** Callback to toggle automation enabled state */
		onToggleAutomation?: (automationId: string, enabled: boolean) => void;
		/** Callback to delete an automation */
		onDeleteAutomation?: (automationId: string) => void;
	};

	let {
		globalEditTools = [],
		automations = [],
		roles,
		onToolRolesChange,
		onToolVisualConfigChange,
		onSelectTool,
		onDeleteTool,
		onCreateRole,
		onSelectAutomation,
		onAddAutomation,
		onToggleAutomation,
		onDeleteAutomation
	}: Props = $props();

	const TRIGGER_LABELS: Record<string, string> = {
		on_transition: m.propertiesGlobalToolsTriggerTransition?.() ?? 'Transition',
		on_field_change: m.propertiesGlobalToolsTriggerFieldChange?.() ?? 'Field Change',
		scheduled: m.propertiesGlobalToolsTriggerScheduled?.() ?? 'Scheduled'
	};

	let activeTab = $state('permissions');

	// Local state for tool roles (keyed by tool ID)
	let toolRolesMap = $state<Record<string, string[]>>({});

	// Initialize tool roles map - only update when allowed_roles actually change
	$effect(() => {
		const newMap: Record<string, string[]> = {};
		for (const tool of globalEditTools) {
			newMap[tool.id] = tool.allowed_roles || [];
		}
		// Only reassign if the roles actually changed to avoid triggering loops
		const currentMap = untrack(() => toolRolesMap);
		const hasChanged = Object.keys(newMap).some(toolId => {
			const current = currentMap[toolId];
			const next = newMap[toolId];
			if (!current) return true;
			if (current.length !== next.length) return true;
			return current.some((id, i) => id !== next[i]);
		}) || Object.keys(currentMap).some(toolId => !(toolId in newMap));

		if (hasChanged) {
			toolRolesMap = newMap;
		}
	});

	// Handle tool roles change
	function handleToolRolesChange(toolId: string, newRoleIds: string[]) {
		const currentRoles = toolRolesMap[toolId];
		if (currentRoles === undefined) {
			return;
		}

		const changed = currentRoles.length !== newRoleIds.length ||
			currentRoles.some((id, i) => id !== newRoleIds[i]);

		if (changed) {
			toolRolesMap[toolId] = newRoleIds;
			onToolRolesChange?.(toolId, newRoleIds);
		}
	}

	// Get tool icon from registry
	function getToolIcon(toolType: string) {
		return toolRegistry.get(toolType)?.icon;
	}

	// Get tool color from registry
	function getToolColor(toolType: string) {
		return toolRegistry.get(toolType)?.defaultColor ?? '#6B7280';
	}
</script>

<div class="global-tools-panel">
	<!-- Header -->
	<div class="panel-header">
		<div class="header-content">
			<div class="header-icon">
				<Globe class="h-4 w-4" />
			</div>
			<div class="header-info">
				<span class="header-title">{m.propertiesGlobalToolsTitle?.() ?? 'Global Tools'}</span>
				<span class="header-subtitle">{m.propertiesGlobalToolsSubtitle?.() ?? 'Available on all stages'}</span>
			</div>
		</div>
	</div>

	<!-- Tabs -->
	<Tabs.Root bind:value={activeTab} class="flex-1 flex flex-col">
		<Tabs.List class="panel-tabs">
			<Tabs.Trigger value="permissions">{m.propertiesGlobalToolsTabPermissions?.() ?? 'Permissions'}</Tabs.Trigger>
			<Tabs.Trigger value="tools">{m.propertiesGlobalToolsTabTools?.() ?? 'Tools'}</Tabs.Trigger>
			<Tabs.Trigger value="automations">{m.propertiesGlobalToolsTabAutomations?.() ?? 'Automations'}</Tabs.Trigger>
		</Tabs.List>

		<div class="panel-content">
			<!-- Permissions Tab -->
			<Tabs.Content value="permissions" class="tab-content">
				{#if globalEditTools.length === 0}
					<p class="empty-text">{m.propertiesGlobalToolsNoTools?.() ?? 'No global tools configured.'}</p>
				{:else}
					<PropertySection title={m.propertiesGlobalToolsToolPermissions?.() ?? 'Tool Permissions'} defaultOpen={true}>
						<div class="tool-permissions-list">
							{#each globalEditTools as tool (tool.id)}
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
											allowCreate={!!onCreateRole}
											onCreateOption={onCreateRole}
											placeholder={m.propertiesGlobalToolsAllRoles?.() ?? 'All roles...'}
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
				<PropertySection title={m.propertiesGlobalToolsTitle?.() ?? 'Global Tools'} defaultOpen={true}>
					{#if globalEditTools.length === 0}
						<p class="empty-text">{m.propertiesGlobalToolsNoTools?.() ?? 'No global tools configured.'}</p>
					{:else}
						<div class="tools-list">
							{#each globalEditTools as tool (tool.id)}
								<ConnectedToolItem
									toolType="edit"
									name={tool.name}
									visualConfig={tool.visual_config || {}}
									onVisualConfigChange={(config) => onToolVisualConfigChange?.(tool.id, config)}
									onSelect={() => onSelectTool?.('edit', tool.id)}
									onDelete={() => onDeleteTool?.('edit', tool.id)}
									defaultButtonLabel={m.commonEdit?.() ?? 'Edit'}
									defaultButtonColor="#6366F1"
								/>
							{/each}
						</div>
					{/if}
				</PropertySection>
			</Tabs.Content>

			<!-- Automations Tab -->
			<Tabs.Content value="automations" class="tab-content">
				<div class="automations-header">
					<Button variant="outline" size="sm" onclick={() => onAddAutomation?.()}>
						<Plus class="h-3.5 w-3.5 mr-1.5" />
						{m.propertiesGlobalToolsAddAutomation?.() ?? 'Add Automation'}
					</Button>
				</div>

				{#if automations.length === 0}
					<p class="empty-text">{m.propertiesGlobalToolsNoAutomations?.() ?? 'No automations configured. Automations run automatically based on triggers like stage transitions, field changes, or time-based schedules.'}</p>
				{:else}
					<div class="automations-list">
						{#each automations as automation (automation.id)}
							<button
								class="automation-item"
								onclick={() => onSelectAutomation?.(automation.id)}
							>
								<div class="automation-item-left">
									<div class="automation-icon">
										<Zap class="h-3.5 w-3.5" />
									</div>
									<div class="automation-info">
										<span class="automation-name">{automation.name}</span>
										<span class="automation-trigger">{TRIGGER_LABELS[automation.trigger_type] || automation.trigger_type}</span>
									</div>
								</div>
								<div class="automation-item-right">
									<!-- svelte-ignore a11y_click_events_have_key_events -->
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<div
										class="automation-toggle"
										onclick={(e) => { e.stopPropagation(); onToggleAutomation?.(automation.id, !automation.is_enabled); }}
									>
										<Switch.Root checked={automation.is_enabled}>
											<Switch.Thumb />
										</Switch.Root>
									</div>
									<ChevronRight class="h-4 w-4 chevron-icon" />
								</div>
							</button>
						{/each}
					</div>
				{/if}
			</Tabs.Content>
		</div>
	</Tabs.Root>
</div>

<style>
	.global-tools-panel {
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
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary));
	}

	.header-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.header-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.header-subtitle {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
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

	.empty-text {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		text-align: center;
		padding: 1rem;
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

	/* Automations styling */
	.automations-header {
		display: flex;
		justify-content: flex-end;
		padding: 0.75rem 1rem 0;
	}

	.automations-list {
		display: flex;
		flex-direction: column;
		padding: 0.5rem;
		gap: 0.25rem;
	}

	.automation-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.625rem 0.75rem;
		border-radius: 0.375rem;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		cursor: pointer;
		transition: background 0.1s ease;
		text-align: left;
		width: 100%;
	}

	.automation-item:hover {
		background: hsl(var(--accent));
	}

	.automation-item-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		flex: 1;
	}

	.automation-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 0.25rem;
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary));
	}

	.automation-info {
		display: flex;
		flex-direction: column;
		gap: 0.0625rem;
		min-width: 0;
	}

	.automation-name {
		font-size: 0.8125rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.automation-trigger {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
	}

	.automation-item-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.automation-toggle {
		display: flex;
		align-items: center;
	}

	.chevron-icon {
		color: hsl(var(--muted-foreground));
	}
</style>
