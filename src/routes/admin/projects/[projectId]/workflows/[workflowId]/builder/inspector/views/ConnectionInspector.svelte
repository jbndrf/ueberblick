<script lang="ts">
	import { ArrowRight, LogIn, RotateCcw, Trash2, Lock, Plus, Settings2 } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import PropertySection from '../../right-sidebar/views/properties/shared/PropertySection.svelte';
	import SentryEditor from '../../right-sidebar/views/properties/panels/SentryEditor.svelte';
	import RoleSelect from '../../components/RoleSelect.svelte';
	import InlineEdit from '../../components/InlineEdit.svelte';
	import { stagePreviewButtonRoleSettings, builderClickToRename } from '$lib/paraglide/messages';
	import { toolRegistry } from '$lib/workflow-builder/tools';
	import type { SentryClause } from '$lib/workflow-builder';
	import { getBuilderContext, selectTool, openProtocolTool } from '../../builder-context.svelte';
	import EmptyInspector from './EmptyInspector.svelte';
	import {
		propertiesEdgePropertyActionNamePlaceholder,
		propertiesEdgePropertyAllowedRoles,
		propertiesEdgePropertyConnectedTools,
		propertiesEdgePropertyDeleteAction,
		propertiesEdgePropertyDeleteTool,
		propertiesEdgePropertyEntryInfo,
		propertiesEdgePropertyNoTools,
		propertiesEdgePropertyRolesHelp,
		propertiesEdgePropertyRolesPlaceholder,
		propertiesEdgePropertySourceFallback,
		propertiesEdgePropertyTargetFallback,
		propertiesEdgePropertyTypeEdit,
		propertiesEdgePropertyTypeEntry,
		propertiesEdgePropertyTypeProgress,
		propertiesEdgePropertyWorkflowEntry,
		connectionInspectorSentryTitle,
		connectionInspectorSentryHint,
		connectionInspectorAddForm,
		connectionInspectorAddEdit,
		connectionInspectorAddProtocol
	} from '$lib/paraglide/messages';

	const ctx = getBuilderContext();
	const { state: builderState, ui, roles, createRole } = ctx;

	const connectionId = $derived(ui.selection.type === 'connection' ? ui.selection.id : null);
	const conn = $derived(
		connectionId ? (builderState.getConnectionById(connectionId)?.data ?? null) : null
	);

	const isEntry = $derived(!!conn && !conn.from_stage_id);
	const isSelfLoop = $derived(!!conn && conn.from_stage_id === conn.to_stage_id && !isEntry);

	const sourceName = $derived(
		conn?.from_stage_id
			? (builderState.getStageById(conn.from_stage_id)?.data.stage_name ?? '')
			: ''
	);
	const targetName = $derived(
		conn ? (builderState.getStageById(conn.to_stage_id)?.data.stage_name ?? '') : ''
	);

	// Connected tools, merged and ordered
	const sortedTools = $derived.by(() => {
		if (!connectionId) return [];
		const all = [
			...builderState.getFormsForConnection(connectionId).map((f) => ({
				type: 'form',
				id: f.data.id,
				name: f.data.name,
				order: f.data.tool_order ?? 0
			})),
			...builderState.getEditToolsForConnection(connectionId).map((e) => ({
				type: 'edit',
				id: e.data.id,
				name: e.data.name,
				order: e.data.tool_order ?? 0
			})),
			...builderState.getProtocolToolsForConnection(connectionId).map((p) => ({
				type: 'protocol',
				id: p.data.id,
				name: p.data.name,
				order: p.data.tool_order ?? 0
			}))
		];
		return all.sort((a, b) => a.order - b.order);
	});

	// Entry connections allow exactly one form, nothing else.
	const allowedToolTypes = $derived.by((): string[] => {
		if (!connectionId || !conn) return [];
		if (isEntry) {
			return builderState.getFormsForConnection(connectionId).length > 0 ? [] : ['form'];
		}
		return ['form', 'edit', 'protocol'];
	});

	function handleSentryChange(next: SentryClause[]) {
		if (!connectionId) return;
		builderState.updateConnection(connectionId, { sentry: next.length === 0 ? null : next });
	}

	function addTool(toolType: string) {
		if (!connectionId) return;
		if (toolType === 'form') {
			const form = builderState.addForm({ connectionId });
			ui.select({ type: 'form', id: form.id });
		} else if (toolType === 'edit') {
			const tool = builderState.addEditTool({ connectionId });
			ui.select({ type: 'editTool', id: tool.id });
		} else if (toolType === 'protocol') {
			const tool = builderState.addProtocolTool({ connectionId });
			openProtocolTool(ctx, tool.id);
		}
	}

	function deleteTool(toolType: string, toolId: string) {
		if (toolType === 'form') builderState.deleteForm(toolId);
		else if (toolType === 'edit') builderState.deleteEditTool(toolId);
		else if (toolType === 'protocol') builderState.deleteProtocolTool(toolId);
	}

	function handleDelete() {
		if (!connectionId) return;
		builderState.deleteConnection(connectionId);
		ui.deselect();
	}
</script>

{#if conn && connectionId}
	<div class="connection-inspector">
		<!-- Header: identity -->
		<div class="panel-header">
			<div class="header-content">
				<div class="header-icon" class:edit={isSelfLoop} class:entry={isEntry}>
					{#if isEntry}
						<LogIn class="h-4 w-4" />
					{:else if isSelfLoop}
						<RotateCcw class="h-4 w-4" />
					{:else}
						<ArrowRight class="h-4 w-4" />
					{/if}
				</div>
				<div class="header-info">
					<InlineEdit
						value={conn.action_name}
						onCommit={(v) => builderState.updateConnection(connectionId, { action_name: v })}
						class="w-full cursor-text truncate border-b border-transparent bg-transparent text-left text-[0.95rem] font-semibold text-foreground transition outline-none placeholder:text-muted-foreground hover:border-border focus:border-primary"
						placeholder={propertiesEdgePropertyActionNamePlaceholder?.() ?? 'Action name...'}
						ariaLabel={propertiesEdgePropertyActionNamePlaceholder?.() ?? 'Action name'}
						editTitle={builderClickToRename?.() ?? 'Click to rename'}
					/>
					<div class="edge-meta">
						<span class="edge-type-badge" class:edit={isSelfLoop} class:entry={isEntry}>
							{#if isEntry}
								{propertiesEdgePropertyTypeEntry?.() ?? 'Entry Action'}
							{:else if isSelfLoop}
								{propertiesEdgePropertyTypeEdit?.() ?? 'Edit Action'}
							{:else}
								{propertiesEdgePropertyTypeProgress?.() ?? 'Progress Action'}
							{/if}
						</span>
						<span class="edge-path">
							{#if isEntry}
								{propertiesEdgePropertyWorkflowEntry?.() ?? 'Workflow Entry'} → {targetName}
							{:else}
								{sourceName || (propertiesEdgePropertySourceFallback?.() ?? 'Source')} → {targetName ||
									(propertiesEdgePropertyTargetFallback?.() ?? 'Target')}
							{/if}
						</span>
					</div>
				</div>
				{#if !isEntry}
					<button
						class="config-gear"
						class:active={ui.configTarget?.kind === 'connection' &&
							ui.configTarget?.id === connectionId}
						onclick={() => ui.toggleConfig('connection', connectionId)}
						title={stagePreviewButtonRoleSettings?.() ?? 'Button & role settings'}
						aria-label={stagePreviewButtonRoleSettings?.() ?? 'Button & role settings'}
					>
						<Settings2 class="h-4 w-4" />
					</button>
				{/if}
			</div>
		</div>

		<div class="panel-content">
			<!-- Wächter — prominent, first section -->
			{#if !isEntry}
				<PropertySection
					title={`${connectionInspectorSentryTitle?.() ?? 'Sentry (availability)'}${(conn.sentry?.length ?? 0) > 0 ? ` · ${conn.sentry?.length}` : ''}`}
					defaultOpen={true}
				>
					<p class="help-text sentry-title">
						<Lock class="h-3.5 w-3.5" />
						{connectionInspectorSentryHint?.() ??
							'This transition is only offered when all conditions hold (evaluated on the device, offline-capable).'}
					</p>
					<SentryEditor
						sentry={conn.sentry ?? []}
						fieldDefs={builderState.visibleFieldDefs.map((d) => d.data)}
						onChange={handleSentryChange}
					/>
				</PropertySection>
			{/if}

			<!-- Roles: entry connections only. Normal action buttons configure their
			     appearance + roles via the gear → expandable sidebar. -->
			{#if isEntry}
				<PropertySection title={propertiesEdgePropertyAllowedRoles?.() ?? 'Allowed Roles'}>
					<RoleSelect
						selectedIds={conn.allowed_roles ?? []}
						{roles}
						onChange={(ids) => builderState.updateConnection(connectionId, { allowed_roles: ids })}
						onCreateRole={createRole}
						placeholder={propertiesEdgePropertyRolesPlaceholder?.() ?? 'Select or search roles...'}
						help={propertiesEdgePropertyRolesHelp?.() ??
							'Only participants with these roles can perform this action. Leave empty to allow all.'}
					/>
				</PropertySection>
				<p class="entry-info">
					{propertiesEdgePropertyEntryInfo?.() ??
						'Entry connections are configured from the workflow settings.'}
				</p>
			{/if}

			<!-- Tools -->
			<PropertySection
				title={propertiesEdgePropertyConnectedTools?.() ?? 'Connected Tools'}
				defaultOpen={true}
			>
				{#if sortedTools.length === 0}
					<p class="empty-text">
						{propertiesEdgePropertyNoTools?.() ?? 'No tools attached to this connection.'}
					</p>
				{:else}
					<div class="tools-list">
						{#each sortedTools as tool (tool.id)}
							{@const ToolIcon = toolRegistry.get(tool.type)?.icon}
							{@const iconColor = toolRegistry.get(tool.type)?.defaultColor ?? '#6B7280'}
							<div class="tool-item">
								<button class="tool-info" type="button" onclick={() => selectTool(ctx, tool.id)}>
									<div class="tool-icon" style="--icon-color: {iconColor}">
										{#if ToolIcon}<ToolIcon class="icon" />{/if}
									</div>
									<span class="tool-name">{tool.name}</span>
								</button>
								<button
									class="delete-btn"
									type="button"
									onclick={() => deleteTool(tool.type, tool.id)}
									title={propertiesEdgePropertyDeleteTool?.() ?? 'Delete tool'}
								>
									<Trash2 class="h-3.5 w-3.5" />
								</button>
							</div>
						{/each}
					</div>
				{/if}
				{#if allowedToolTypes.length > 0}
					<div class="add-tool-row">
						{#if allowedToolTypes.includes('form')}
							<Button variant="outline" size="sm" onclick={() => addTool('form')}>
								<Plus class="mr-1 h-3.5 w-3.5" />{connectionInspectorAddForm?.() ?? 'Form'}
							</Button>
						{/if}
						{#if allowedToolTypes.includes('edit')}
							<Button variant="outline" size="sm" onclick={() => addTool('edit')}>
								<Plus class="mr-1 h-3.5 w-3.5" />{connectionInspectorAddEdit?.() ?? 'Edit'}
							</Button>
						{/if}
						{#if allowedToolTypes.includes('protocol')}
							<Button variant="outline" size="sm" onclick={() => addTool('protocol')}>
								<Plus class="mr-1 h-3.5 w-3.5" />{connectionInspectorAddProtocol?.() ?? 'Protocol'}
							</Button>
						{/if}
					</div>
				{/if}
			</PropertySection>
		</div>

		<!-- Footer -->
		<div class="panel-footer">
			<Button variant="destructive" size="sm" onclick={handleDelete} class="w-full">
				<Trash2 class="mr-2 h-4 w-4" />
				{propertiesEdgePropertyDeleteAction?.() ?? 'Delete Action'}
			</Button>
		</div>
	</div>
{:else}
	<EmptyInspector />
{/if}

<style>
	.connection-inspector {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
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
		background: hsl(38 92% 50% / 0.12);
		color: hsl(32 95% 44%);
	}

	.header-icon.entry {
		background: hsl(142 71% 45% / 0.12);
		color: hsl(142 71% 35%);
	}

	.header-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.edge-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.edge-type-badge {
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary));
	}

	.edge-type-badge.edit {
		background: hsl(38 92% 50% / 0.12);
		color: hsl(32 95% 44%);
	}

	.edge-type-badge.entry {
		background: hsl(142 71% 45% / 0.12);
		color: hsl(142 71% 35%);
	}

	.edge-path {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
	}

	.config-gear {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 0.375rem;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--background));
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.config-gear:hover {
		background: hsl(var(--accent));
		color: hsl(var(--foreground));
	}

	.config-gear.active {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border-color: hsl(var(--primary));
	}

	.panel-content {
		flex: 1;
		overflow-y: auto;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.sentry-title {
		display: flex;
		align-items: flex-start;
		gap: 0.375rem;
	}

	.help-text {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		margin: 0.25rem 0 0.5rem;
	}

	.entry-info {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		text-align: center;
		padding: 0.75rem 0;
	}

	.empty-text {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		padding: 0.25rem 0;
	}

	.tools-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.tool-item {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.tool-info {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		cursor: pointer;
		text-align: left;
		transition: background 0.15s ease;
	}

	.tool-info:hover {
		background: hsl(var(--accent));
	}

	.tool-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 0.25rem;
		background: color-mix(in srgb, var(--icon-color) 15%, transparent);
		color: var(--icon-color);
	}

	.tool-icon :global(.icon) {
		width: 14px;
		height: 14px;
	}

	.tool-name {
		font-size: 0.8125rem;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.delete-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 0.375rem;
		color: hsl(var(--muted-foreground));
		background: transparent;
		border: none;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.delete-btn:hover {
		color: hsl(var(--destructive));
		background: hsl(var(--destructive) / 0.1);
	}

	.add-tool-row {
		display: flex;
		gap: 0.375rem;
		margin-top: 0.5rem;
		flex-wrap: wrap;
	}

	.panel-footer {
		flex-shrink: 0;
		padding: 0.75rem;
		border-top: 1px solid hsl(var(--border));
	}
</style>
