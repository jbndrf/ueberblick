<script lang="ts">
	import type { Node, Edge } from '@xyflow/svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { getPocketBase } from '$lib/pocketbase';

	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import * as Tabs from '$lib/components/ui/tabs';
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';

	import { ArrowRight, LogIn, RotateCcw, Trash2 } from 'lucide-svelte';

	import PropertySection from '../shared/PropertySection.svelte';
	import ConnectedToolItem from '../shared/ConnectedToolItem.svelte';

	import type { ToolsForm, ToolsEdit, VisualConfig } from '$lib/workflow-builder';

	type Role = {
		id: string;
		name: string;
		description?: string;
	};

	type Props = {
		edge: Edge;
		nodes: Node[];
		roles: Role[];
		/** Connection-attached forms */
		connectionForms?: ToolsForm[];
		/** Connection-attached edit tools */
		connectionEditTools?: ToolsEdit[];
		onRename?: (edgeId: string, newName: string) => void;
		onDelete?: (edgeId: string) => void;
		onRolesChange?: (edgeId: string, roleIds: string[]) => void;
		onSettingsChange?: (edgeId: string, settings: Record<string, any>) => void;
		/** Callback when a tool is selected */
		onSelectTool?: (toolType: string, toolId: string) => void;
	};

	let {
		edge,
		nodes,
		roles,
		connectionForms = [],
		connectionEditTools = [],
		onRename,
		onDelete,
		onRolesChange,
		onSettingsChange,
		onSelectTool
	}: Props = $props();

	// Determine edge type
	const isEntryConnection = $derived(edge.data?.isEntry === true);
	const isEditAction = $derived(!isEntryConnection && edge.source === edge.target);

	// All connected tools
	const hasConnectedTools = $derived(connectionForms.length > 0 || connectionEditTools.length > 0);

	// Local state for editing
	let actionName = $state(typeof edge.label === 'string' ? edge.label : 'Action');
	let selectedRoleIds = $state<string[]>(edge.data.allowed_roles || []);
	let buttonLabel = $state(edge.data.visual_config?.button_label || '');
	let buttonColor = $state(edge.data.visual_config?.button_color || '#3b82f6');
	let requiresConfirmation = $state(edge.data.visual_config?.requires_confirmation || false);
	let confirmationMessage = $state(
		edge.data.visual_config?.confirmation_message || 'Are you sure you want to proceed?'
	);
	let activeTab = $state('permissions');

	// Track current edge ID to detect edge switches
	let currentEdgeId = $state(edge.id);

	// Update local state when edge changes (user selected different edge)
	$effect(() => {
		if (edge.id !== currentEdgeId) {
			currentEdgeId = edge.id;
			actionName = typeof edge.label === 'string' ? edge.label : 'Action';
			selectedRoleIds = edge.data.allowed_roles || [];
			buttonLabel = edge.data.visual_config?.button_label || '';
			buttonColor = edge.data.visual_config?.button_color || '#3b82f6';
			requiresConfirmation = edge.data.visual_config?.requires_confirmation || false;
			confirmationMessage =
				edge.data.visual_config?.confirmation_message || 'Are you sure you want to proceed?';
		}
	});

	// Watch for role changes and notify parent
	$effect(() => {
		const propRoles = edge.data.allowed_roles || [];
		const rolesChanged =
			selectedRoleIds.length !== propRoles.length ||
			selectedRoleIds.some((id, i) => id !== propRoles[i]);

		if (rolesChanged && edge.id === currentEdgeId) {
			onRolesChange?.(edge.id, selectedRoleIds);
		}
	});

	// Watch for settings changes and notify parent
	$effect(() => {
		const propConfig = edge.data.visual_config || {};
		const settingsChanged =
			buttonLabel !== (propConfig.button_label || '') ||
			buttonColor !== (propConfig.button_color || '#3b82f6') ||
			requiresConfirmation !== (propConfig.requires_confirmation || false) ||
			confirmationMessage !==
				(propConfig.confirmation_message || 'Are you sure you want to proceed?');

		if (settingsChanged && edge.id === currentEdgeId) {
			onSettingsChange?.(edge.id, {
				buttonLabel,
				buttonColor,
				requiresConfirmation,
				confirmationMessage
			});
		}
	});

	// Get source and target nodes (sourceNode is undefined for entry connections)
	const sourceNode = $derived(isEntryConnection ? null : nodes.find((n) => n.id === edge.source));
	const targetNode = $derived(nodes.find((n) => n.id === edge.target));

	// Current visual config for button preview
	const currentVisualConfig = $derived<VisualConfig>({
		button_label: buttonLabel || undefined,
		button_color: buttonColor || undefined,
		requires_confirmation: requiresConfirmation || undefined,
		confirmation_message: requiresConfirmation ? confirmationMessage : undefined
	});

	// Handle name change
	function handleNameBlur() {
		if (actionName !== edge.label && actionName.trim()) {
			onRename?.(edge.id, actionName.trim());
		}
	}

	// Handle delete
	function handleDelete() {
		onDelete?.(edge.id);
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

	// Handle button config change from tool item
	function handleButtonConfigChange(config: VisualConfig) {
		buttonLabel = config.button_label || '';
		buttonColor = config.button_color || '#3b82f6';
		requiresConfirmation = config.requires_confirmation || false;
		confirmationMessage = config.confirmation_message || 'Are you sure you want to proceed?';
	}
</script>

<div class="edge-property-panel">
	<!-- Header -->
	<div class="panel-header">
		<div class="header-content">
			<div class="header-icon" class:edit={isEditAction} class:entry={isEntryConnection}>
				{#if isEntryConnection}
					<LogIn class="h-4 w-4" />
				{:else if isEditAction}
					<RotateCcw class="h-4 w-4" />
				{:else}
					<ArrowRight class="h-4 w-4" />
				{/if}
			</div>
			<div class="header-info">
				<Input
					bind:value={actionName}
					onblur={handleNameBlur}
					class="header-input"
					placeholder="Action name..."
				/>
				<div class="edge-meta">
					<span class="edge-type-badge" class:edit={isEditAction} class:entry={isEntryConnection}>
						{#if isEntryConnection}
							Entry Action
						{:else if isEditAction}
							Edit Action
						{:else}
							Progress Action
						{/if}
					</span>
					{#if isEntryConnection}
						<span class="edge-path">
							Workflow Entry -> {targetNode?.data.title || 'Start'}
						</span>
					{:else if !isEditAction}
						<span class="edge-path">
							{sourceNode?.data.title || 'Source'} -> {targetNode?.data.title || 'Target'}
						</span>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<!-- Tabs -->
	<Tabs.Root bind:value={activeTab} class="flex-1 flex flex-col">
		<Tabs.List class="panel-tabs">
			<Tabs.Trigger value="permissions">Permissions</Tabs.Trigger>
			<Tabs.Trigger value="tools">Tools</Tabs.Trigger>
			<Tabs.Trigger value="settings">Settings</Tabs.Trigger>
		</Tabs.List>

		<div class="panel-content">
			<!-- Permissions Tab -->
			<Tabs.Content value="permissions" class="tab-content">
				<PropertySection title="Allowed Roles">
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
						Only participants with these roles can perform this action. Leave empty to allow all.
					</p>
				</PropertySection>
			</Tabs.Content>

			<!-- Tools Tab -->
			<Tabs.Content value="tools" class="tab-content">
				<PropertySection title="Connected Tools" defaultOpen={true}>
					{#if !hasConnectedTools}
						<p class="empty-text">No tools attached to this connection.</p>
					{:else}
						<div class="tools-list">
							{#each connectionForms as form (form.id)}
								<ConnectedToolItem
									toolType="form"
									name={form.name}
									visualConfig={currentVisualConfig}
									onVisualConfigChange={handleButtonConfigChange}
									onSelect={() => onSelectTool?.('form', form.id)}
									defaultButtonLabel="Submit"
									defaultButtonColor="#3B82F6"
								/>
							{/each}
							{#each connectionEditTools as tool (tool.id)}
								<ConnectedToolItem
									toolType="edit"
									name={tool.name}
									visualConfig={currentVisualConfig}
									onVisualConfigChange={handleButtonConfigChange}
									onSelect={() => onSelectTool?.('edit', tool.id)}
									defaultButtonLabel="Edit"
									defaultButtonColor="#6366F1"
								/>
							{/each}
						</div>
					{/if}
				</PropertySection>
			</Tabs.Content>

			<!-- Settings Tab -->
			<Tabs.Content value="settings" class="tab-content">
				<PropertySection title="Button Appearance">
					<div class="form-field">
						<Label for="button-label">Button Label</Label>
						<Input
							id="button-label"
							bind:value={buttonLabel}
							placeholder="e.g., Submit, Approve, Continue"
						/>
					</div>

					<div class="form-field">
						<Label for="button-color">Button Color</Label>
						<div class="color-picker">
							<input
								type="color"
								id="button-color"
								bind:value={buttonColor}
								class="color-input"
							/>
							<Input
								bind:value={buttonColor}
								placeholder="#3b82f6"
								class="color-text"
							/>
						</div>
					</div>
				</PropertySection>

				<PropertySection title="Behavior">
					<div class="form-field-switch">
						<div class="switch-info">
							<Label for="requires-confirmation">Requires Confirmation</Label>
							<p class="switch-description">
								Show a confirmation dialog before performing this action
							</p>
						</div>
						<Switch
							id="requires-confirmation"
							bind:checked={requiresConfirmation}
						/>
					</div>

					{#if requiresConfirmation}
						<div class="form-field">
							<Label for="confirmation-message">Confirmation Message</Label>
							<Input
								id="confirmation-message"
								bind:value={confirmationMessage}
								placeholder="Are you sure you want to proceed?"
							/>
						</div>
					{/if}
				</PropertySection>
			</Tabs.Content>
		</div>
	</Tabs.Root>

	<!-- Footer -->
	<div class="panel-footer">
		<Button variant="destructive" size="sm" onclick={handleDelete} class="w-full">
			<Trash2 class="h-4 w-4 mr-2" />
			Delete Action
		</Button>
	</div>
</div>

<style>
	.edge-property-panel {
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

	.header-icon.edit {
		background: hsl(var(--muted));
		color: hsl(var(--muted-foreground));
	}

	.header-icon.entry {
		background: hsl(142 60% 90%);
		color: rgb(22 163 74);
	}

	:global(.dark) .header-icon.entry {
		background: hsl(142 30% 20%);
		color: rgb(34 197 94);
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

	.edge-meta {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.edge-type-badge {
		display: inline-flex;
		align-self: flex-start;
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		background: hsl(var(--primary) / 0.15);
		color: hsl(var(--primary));
	}

	.edge-type-badge.edit {
		background: hsl(var(--muted));
		color: hsl(var(--muted-foreground));
	}

	.edge-type-badge.entry {
		background: hsl(142 60% 90%);
		color: rgb(22 163 74);
	}

	:global(.dark) .edge-type-badge.entry {
		background: hsl(142 30% 20%);
		color: rgb(34 197 94);
	}

	.edge-path {
		font-size: 0.6875rem;
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

	.tools-list {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.form-field {
		margin-bottom: 1rem;
	}

	.form-field:last-child {
		margin-bottom: 0;
	}

	.form-field :global(label) {
		display: block;
		font-size: 0.75rem;
		font-weight: 500;
		margin-bottom: 0.375rem;
	}

	.form-field-switch {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.switch-info {
		flex: 1;
	}

	.switch-info :global(label) {
		font-size: 0.8125rem;
		font-weight: 500;
	}

	.switch-description {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		margin-top: 0.125rem;
	}

	.color-picker {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.color-input {
		width: 2.5rem;
		height: 2.5rem;
		padding: 0.125rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		cursor: pointer;
	}

	.color-input::-webkit-color-swatch-wrapper {
		padding: 0;
	}

	.color-input::-webkit-color-swatch {
		border: none;
		border-radius: 0.25rem;
	}

	.color-text {
		flex: 1;
	}

	.panel-footer {
		padding: 1rem;
		border-top: 1px solid oklch(0.88 0.01 250);
	}

	:global(.dark) .panel-footer {
		border-top-color: oklch(1 0 0 / 20%);
	}
</style>
