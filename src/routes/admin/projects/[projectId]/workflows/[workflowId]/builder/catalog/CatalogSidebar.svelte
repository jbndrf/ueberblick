<script lang="ts">
	import {
		Play,
		Square,
		CircleStop,
		GripVertical,
		Plus,
		FileText,
		Zap,
		Tags,
		Library,
		ChevronDown,
		ChevronRight,
		Globe,
		Spline
	} from '@lucide/svelte';
	import type { Component } from 'svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Popover from '$lib/components/ui/popover';
	import { toolRegistry } from '$lib/workflow-builder/tools';
	import type { TriggerType } from '$lib/workflow-builder';
	import { getBuilderContext, selectTool, openProtocolTool } from '../builder-context.svelte';
	import {
		workflowBuilderDefaultPanelEnd,
		workflowBuilderDefaultPanelHint,
		workflowBuilderDefaultPanelStage,
		workflowBuilderDefaultPanelStages,
		workflowBuilderDefaultPanelStart,
		catalogAddToolTitle,
		catalogExistingToolsTitle,
		catalogScopeGlobal,
		catalogScopeStage,
		catalogScopeConnection,
		catalogHintGlobal,
		catalogHintStage,
		catalogHintConnection,
		catalogAutomationsTitle,
		catalogFieldTagsLabel,
		catalogFieldTagsMapped,
		catalogFieldLibraryLabel,
		catalogEmptyTools,
		catalogEmptyAutomations,
		catalogAddAutomationTitle,
		catalogToolForm,
		catalogToolEdit,
		catalogToolProtocol,
		catalogTriggerTransition,
		catalogTriggerFieldChange,
		catalogTriggerScheduled
	} from '$lib/paraglide/messages';

	type Scope = 'global' | 'stage' | 'connection';

	const ctx = getBuilderContext();
	const { state: builderState, ui } = ctx;

	const hasStartStage = $derived(builderState.hasStartStage);

	// Collapsible groups below the "Add tool" control.
	let open = $state({ existing: true, automations: true });

	// Which scope's "add tool" popover is open.
	let openScope = $state<Record<Scope, boolean>>({
		global: false,
		stage: false,
		connection: false
	});

	function onStageDragStart(event: DragEvent, nodeType: 'start' | 'intermediate' | 'end') {
		if (!event.dataTransfer) return;
		event.dataTransfer.setData('application/xyflow', nodeType);
		event.dataTransfer.effectAllowed = 'move';
	}

	// --- Add tool (scope buttons → popover of draggable tools) ----------------
	// Tool labels + the order they appear in each scope's popover. A tool only
	// appears for a scope the registry says it is attachable to.
	const TOOL_LABELS: Record<string, () => string> = {
		form: () => catalogToolForm?.() ?? 'Form',
		protocol: () => catalogToolProtocol?.() ?? 'Protocol',
		edit: () => catalogToolEdit?.() ?? 'Edit'
	};
	const TOOL_ORDER = ['form', 'protocol', 'edit'];

	const SCOPES: Array<{ key: Scope; icon: Component; label: () => string; hint: () => string }> = [
		{
			key: 'global',
			icon: Globe,
			label: () => catalogScopeGlobal?.() ?? 'Global',
			hint: () => catalogHintGlobal?.() ?? 'Click or drag onto the canvas'
		},
		{
			key: 'stage',
			icon: Square,
			label: () => catalogScopeStage?.() ?? 'Stage',
			hint: () => catalogHintStage?.() ?? 'Drag onto a stage'
		},
		{
			key: 'connection',
			icon: Spline,
			label: () => catalogScopeConnection?.() ?? 'Connection',
			hint: () => catalogHintConnection?.() ?? 'Drag onto a connection'
		}
	];

	// Placeable tool definitions for a given scope (registry-driven).
	function toolsForScope(scope: Scope) {
		return TOOL_ORDER.map((t) => toolRegistry.get(t)).filter(
			(d): d is NonNullable<typeof d> => !!d && d.attachableTo.includes(scope)
		);
	}

	function toolIcon(type: string) {
		return toolRegistry.get(type)?.icon ?? FileText;
	}

	function toolColor(type: string) {
		return toolRegistry.get(type)?.defaultColor ?? '#64748b';
	}

	function onToolDragStart(event: DragEvent, toolType: string, scope: Scope) {
		if (!event.dataTransfer) return;
		event.dataTransfer.setData('application/ueberblick-tool', JSON.stringify({ toolType, scope }));
		event.dataTransfer.effectAllowed = 'copy';
	}

	// Global tools have no canvas target, so clicking a Global cell adds one directly.
	function addGlobalTool(toolType: string) {
		if (toolType === 'form') {
			const form = builderState.addForm({ isGlobal: true });
			ui.select({ type: 'form', id: form.id });
		} else if (toolType === 'edit') {
			const tool = builderState.addGlobalEditTool('form_fields');
			ui.select({ type: 'editTool', id: tool.id });
		} else {
			const tool = builderState.addProtocolTool({ isGlobal: true });
			openProtocolTool(ctx, tool.id);
		}
	}

	// --- Existing tools (all scopes merged) -----------------------------------
	const stageNames = $derived(
		new Map(builderState.visibleStages.map((s) => [s.data.id, s.data.stage_name]))
	);
	const connectionNames = $derived(
		new Map(builderState.visibleConnections.map((c) => [c.data.id, c.data.action_name]))
	);

	type ExistingTool = {
		id: string;
		type: string;
		name: string;
		scope: Scope;
		badge: string;
		connectionId?: string;
	};

	const existingTools = $derived.by(() => {
		const items: ExistingTool[] = [];
		const globalLabel = catalogScopeGlobal?.() ?? 'Global';

		// Forms
		for (const f of builderState.visibleForms) {
			if (f.data.connection_id) {
				items.push({
					id: f.data.id,
					type: 'form',
					name: f.data.name,
					scope: 'connection',
					badge: connectionNames.get(f.data.connection_id) ?? '',
					connectionId: f.data.connection_id
				});
			} else if (f.data.stage_id) {
				items.push({
					id: f.data.id,
					type: 'form',
					name: f.data.name,
					scope: 'stage',
					badge: stageNames.get(f.data.stage_id) ?? ''
				});
			} else {
				items.push({
					id: f.data.id,
					type: 'form',
					name: f.data.name,
					scope: 'global',
					badge: globalLabel
				});
			}
		}
		// Edit tools
		for (const t of builderState.visibleEditTools) {
			if (t.data.connection_id) {
				items.push({
					id: t.data.id,
					type: 'edit',
					name: t.data.name,
					scope: 'connection',
					badge: connectionNames.get(t.data.connection_id) ?? '',
					connectionId: t.data.connection_id
				});
			} else if (t.data.is_global) {
				items.push({
					id: t.data.id,
					type: 'edit',
					name: t.data.name,
					scope: 'global',
					badge: globalLabel
				});
			} else if (t.data.stage_id?.length) {
				items.push({
					id: t.data.id,
					type: 'edit',
					name: t.data.name,
					scope: 'stage',
					badge: stageNames.get(t.data.stage_id[0]) ?? ''
				});
			}
		}
		// Protocol tools
		for (const p of builderState.visibleProtocolTools) {
			if (p.data.connection_id) {
				items.push({
					id: p.data.id,
					type: 'protocol',
					name: p.data.name,
					scope: 'connection',
					badge: connectionNames.get(p.data.connection_id) ?? '',
					connectionId: p.data.connection_id
				});
			} else if (p.data.is_global) {
				items.push({
					id: p.data.id,
					type: 'protocol',
					name: p.data.name,
					scope: 'global',
					badge: globalLabel
				});
			} else if (p.data.stage_id?.length) {
				items.push({
					id: p.data.id,
					type: 'protocol',
					name: p.data.name,
					scope: 'stage',
					badge: stageNames.get(p.data.stage_id[0]) ?? ''
				});
			}
		}
		return items;
	});

	// Hovering an existing tool highlights the matching entity on the canvas.
	function hoverEnter(tool: ExistingTool) {
		if (tool.scope === 'connection' && tool.connectionId) {
			ui.hoverEdgeId = tool.connectionId;
		} else {
			ui.hoverStageToolId = tool.id;
		}
	}
	function hoverLeave() {
		ui.hoverEdgeId = null;
		ui.hoverStageToolId = null;
	}

	// --- Automations -----------------------------------------------------------
	const automations = $derived(builderState.visibleAutomations.map((a) => a.data));

	const triggerOptions: Array<{ type: TriggerType; label: () => string }> = [
		{ type: 'on_transition', label: () => catalogTriggerTransition?.() ?? 'on transition' },
		{ type: 'on_field_change', label: () => catalogTriggerFieldChange?.() ?? 'on field change' },
		{ type: 'scheduled', label: () => catalogTriggerScheduled?.() ?? 'scheduled' }
	];

	function triggerShortLabel(triggerType: string): string {
		if (triggerType === 'on_field_change')
			return catalogTriggerFieldChange?.() ?? 'on field change';
		if (triggerType === 'scheduled') return catalogTriggerScheduled?.() ?? 'scheduled';
		return catalogTriggerTransition?.() ?? 'on transition';
	}

	function addAutomationOfType(triggerType: TriggerType) {
		const automation = builderState.addAutomation(triggerType);
		ui.select({ type: 'automation', id: automation.id });
	}

	// --- Field tags ------------------------------------------------------------
	const tagMappingCount = $derived(
		builderState.getFieldTagForWorkflow()?.data.tag_mappings.length ?? 0
	);

	function openFieldTags() {
		builderState.getOrCreateFieldTag();
		ui.select({ type: 'fieldTags' });
	}

	const selectedId = $derived.by(() => {
		const s = ui.selection;
		return 'id' in s ? s.id : null;
	});
</script>

<aside class="catalog">
	<!-- Stufen-Palette -->
	<section class="catalog-section">
		<h3 class="section-title">{workflowBuilderDefaultPanelStages?.() ?? 'Stages'}</h3>
		<div class="tool-grid">
			<div
				class="drag-item drag-item-start border border-border"
				class:disabled={hasStartStage}
				draggable={!hasStartStage}
				ondragstart={(e) => onStageDragStart(e, 'start')}
				role="button"
				tabindex="0"
			>
				<GripVertical class="drag-handle text-muted-foreground" />
				<Play class="drag-icon text-foreground" />
				<span class="drag-label text-foreground"
					>{workflowBuilderDefaultPanelStart?.() ?? 'Start'}</span
				>
			</div>
			<div
				class="drag-item drag-item-stage border border-border"
				draggable="true"
				ondragstart={(e) => onStageDragStart(e, 'intermediate')}
				role="button"
				tabindex="0"
			>
				<GripVertical class="drag-handle text-muted-foreground" />
				<Square class="drag-icon text-foreground" />
				<span class="drag-label text-foreground"
					>{workflowBuilderDefaultPanelStage?.() ?? 'Stage'}</span
				>
			</div>
			<div
				class="drag-item drag-item-end border border-border"
				draggable="true"
				ondragstart={(e) => onStageDragStart(e, 'end')}
				role="button"
				tabindex="0"
			>
				<GripVertical class="drag-handle text-muted-foreground" />
				<CircleStop class="drag-icon text-foreground" />
				<span class="drag-label text-foreground">{workflowBuilderDefaultPanelEnd?.() ?? 'End'}</span
				>
			</div>
		</div>
		<p class="section-hint">
			{workflowBuilderDefaultPanelHint?.() ?? 'Drag stages onto the canvas to add them.'}
		</p>
	</section>

	<!-- Add tool: one button per scope. Clicking opens a popover of the tools you
	     can drag onto the canvas (Global tools can also just be clicked). -->
	<section class="catalog-section">
		<h3 class="section-title">{catalogAddToolTitle?.() ?? 'Add tool'}</h3>
		<div class="scope-buttons">
			{#each SCOPES as scope (scope.key)}
				{@const ScopeIcon = scope.icon}
				<Popover.Root bind:open={openScope[scope.key]}>
					<Popover.Trigger>
						{#snippet child({ props })}
							<button
								{...props}
								type="button"
								class="scope-btn"
								class:active={openScope[scope.key]}
							>
								<ScopeIcon class="scope-btn-icon" />
								<span>{scope.label()}</span>
							</button>
						{/snippet}
					</Popover.Trigger>
					<Popover.Content side="right" align="start" class="w-52 p-2">
						<div class="tool-popover">
							<span class="popover-hint">
								<ScopeIcon class="hint-icon" />
								{scope.hint()}
							</span>
							{#each toolsForScope(scope.key) as def (def.toolType)}
								{@const Icon = def.icon}
								{#if scope.key === 'global'}
									<button
										type="button"
										class="tool-chip"
										style="--tool: {toolColor(def.toolType)}"
										draggable="true"
										ondragstart={(e) => onToolDragStart(e, def.toolType, scope.key)}
										onclick={() => {
											addGlobalTool(def.toolType);
											openScope.global = false;
										}}
									>
										<Plus class="chip-affordance" />
										<Icon class="chip-icon" />
										<span class="chip-label">{TOOL_LABELS[def.toolType]()}</span>
									</button>
								{:else}
									<div
										class="tool-chip draggable"
										style="--tool: {toolColor(def.toolType)}"
										draggable="true"
										ondragstart={(e) => onToolDragStart(e, def.toolType, scope.key)}
										role="button"
										tabindex="0"
									>
										<GripVertical class="chip-affordance" />
										<Icon class="chip-icon" />
										<span class="chip-label">{TOOL_LABELS[def.toolType]()}</span>
									</div>
								{/if}
							{/each}
						</div>
					</Popover.Content>
				</Popover.Root>
			{/each}
		</div>
	</section>

	<!-- Vorhandene Tools -->
	<section class="catalog-section">
		<button type="button" class="section-toggle" onclick={() => (open.existing = !open.existing)}>
			{#if open.existing}
				<ChevronDown class="section-chevron" />
			{:else}
				<ChevronRight class="section-chevron" />
			{/if}
			<h3 class="section-title">{catalogExistingToolsTitle?.() ?? 'Existing tools'}</h3>
			<span class="section-count">{existingTools.length}</span>
		</button>
		{#if open.existing}
			{#if existingTools.length === 0}
				<p class="section-hint empty">{catalogEmptyTools?.() ?? 'No tools created yet.'}</p>
			{:else}
				<div class="item-list">
					{#each existingTools as tool (tool.id)}
						{@const Icon = toolIcon(tool.type)}
						<button
							class="list-item"
							class:selected={selectedId === tool.id}
							onclick={() => selectTool(ctx, tool.id)}
							onmouseenter={() => hoverEnter(tool)}
							onmouseleave={hoverLeave}
							onfocus={() => hoverEnter(tool)}
							onblur={hoverLeave}
						>
							<Icon class="item-icon h-3.5 w-3.5" color={toolColor(tool.type)} />
							<span class="item-label">{tool.name}</span>
							<span class="scope-badge">{tool.badge}</span>
						</button>
					{/each}
				</div>
			{/if}
		{/if}
	</section>

	<!-- Automatisierungen -->
	<section class="catalog-section">
		<button
			type="button"
			class="section-toggle"
			onclick={() => (open.automations = !open.automations)}
		>
			{#if open.automations}
				<ChevronDown class="section-chevron" />
			{:else}
				<ChevronRight class="section-chevron" />
			{/if}
			<h3 class="section-title">{catalogAutomationsTitle?.() ?? 'Automations'}</h3>
			<span class="section-count">{automations.length}</span>
		</button>
		{#if open.automations}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<button {...props} type="button" class="add-automation-btn">
							<Plus class="h-3.5 w-3.5" />
							<span>{catalogAddAutomationTitle?.() ?? 'Add automation'}</span>
						</button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="start" class="w-56">
					{#each triggerOptions as opt (opt.type)}
						<DropdownMenu.Item onclick={() => addAutomationOfType(opt.type)}>
							<Zap class="mr-2 h-4 w-4" />
							{opt.label()}
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
			{#if automations.length === 0}
				<p class="section-hint empty">{catalogEmptyAutomations?.() ?? 'No automations yet.'}</p>
			{:else}
				<div class="item-list">
					{#each automations as automation (automation.id)}
						<button
							class="list-item"
							class:selected={selectedId === automation.id}
							onclick={() => ui.select({ type: 'automation', id: automation.id })}
						>
							<Zap class="item-icon h-3.5 w-3.5" />
							<span class="item-label">{automation.name}</span>
							<span class="item-meta">{triggerShortLabel(automation.trigger_type)}</span>
							<input
								type="checkbox"
								class="enable-toggle"
								checked={automation.is_enabled}
								onclick={(e) => {
									e.stopPropagation();
									builderState.updateAutomation(automation.id, {
										is_enabled: (e.currentTarget as HTMLInputElement).checked
									});
								}}
							/>
						</button>
					{/each}
				</div>
			{/if}
		{/if}
	</section>

	<!-- Feld-Tags + Feldbibliothek -->
	<section class="catalog-section">
		<div class="item-list">
			<button
				class="list-item"
				class:selected={ui.selection.type === 'fieldTags'}
				onclick={openFieldTags}
			>
				<Tags class="item-icon h-3.5 w-3.5" />
				<span class="item-label">{catalogFieldTagsLabel?.() ?? 'Field tags'}</span>
				<span class="item-meta"
					>{catalogFieldTagsMapped?.({ count: tagMappingCount }) ??
						`${tagMappingCount} mapped`}</span
				>
			</button>
			<button
				class="list-item"
				class:selected={ui.selection.type === 'fieldDef'}
				onclick={() => ui.select({ type: 'fieldDef', id: '' })}
			>
				<Library class="item-icon h-3.5 w-3.5" />
				<span class="item-label">{catalogFieldLibraryLabel?.() ?? 'Field library'}</span>
				<span class="item-meta">{builderState.visibleFieldDefs.length}</span>
			</button>
		</div>
	</section>
</aside>

<style>
	.catalog {
		width: 220px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		background: oklch(0.965 0.005 250);
		border-right: 1px solid oklch(0.88 0.01 250);
	}

	:global(.dark) .catalog {
		background: hsl(var(--muted));
		border-right-color: oklch(1 0 0 / 20%);
	}

	.catalog-section {
		padding: 0.75rem;
		border-bottom: 1px solid hsl(var(--border));
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.section-toggle {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		background: transparent;
		border: none;
		padding: 0;
		margin: 0;
		cursor: pointer;
		text-align: left;
		width: 100%;
	}

	.section-toggle :global(.section-chevron) {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
		color: hsl(var(--muted-foreground));
	}

	.section-title {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	.section-count {
		margin-left: auto;
		font-size: 0.625rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		background: hsl(var(--foreground) / 0.08);
		border-radius: 9999px;
		padding: 0.05rem 0.4rem;
	}

	.section-hint {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	.section-hint.empty {
		font-style: italic;
		opacity: 0.75;
		padding-left: 0.15rem;
	}

	/* --- Add tool: scope buttons --- */
	.scope-buttons {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.3rem;
	}

	.scope-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
		padding: 0.45rem 0.25rem;
		border-radius: 0.45rem;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		color: hsl(var(--foreground));
		font-size: 0.625rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.scope-btn:hover {
		background: hsl(var(--accent));
		transform: translateY(-1px);
		box-shadow: 0 2px 5px hsl(var(--foreground) / 0.1);
	}

	.scope-btn.active {
		border-color: hsl(var(--primary) / 0.6);
		background: hsl(var(--accent));
	}

	.scope-btn :global(.scope-btn-icon) {
		width: 16px;
		height: 16px;
		color: hsl(var(--muted-foreground));
	}

	/* --- Add tool: popover of draggable tool chips --- */
	.tool-popover {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.popover-hint {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.625rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: hsl(var(--muted-foreground));
		margin-bottom: 0.1rem;
	}

	.popover-hint :global(.hint-icon) {
		width: 12px;
		height: 12px;
		flex-shrink: 0;
	}

	.tool-chip {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: 100%;
		padding: 0.4rem 0.5rem 0.4rem 0.35rem;
		border-radius: 0.4rem;
		border: 1px solid hsl(var(--border));
		border-left: 3px solid var(--tool);
		background: hsl(var(--card));
		color: hsl(var(--foreground));
		cursor: pointer;
		text-align: left;
		transition: all 0.15s ease;
	}

	.tool-chip.draggable {
		cursor: grab;
	}

	.tool-chip:hover {
		background: hsl(var(--accent));
		transform: translateY(-1px);
		box-shadow: 0 2px 5px hsl(var(--foreground) / 0.1);
	}

	.tool-chip.draggable:active {
		cursor: grabbing;
		transform: translateY(0);
	}

	.tool-chip :global(.chip-affordance) {
		width: 13px;
		height: 13px;
		flex-shrink: 0;
		color: hsl(var(--muted-foreground));
	}

	.tool-chip :global(.chip-icon) {
		width: 15px;
		height: 15px;
		flex-shrink: 0;
		color: var(--tool);
	}

	.chip-label {
		font-size: 0.8125rem;
		font-weight: 500;
	}

	.add-automation-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		width: 100%;
		padding: 0.4rem 0.5rem;
		border-radius: 0.375rem;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		color: hsl(var(--foreground));
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.add-automation-btn:hover {
		background: hsl(var(--accent));
	}

	.tool-grid {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.drag-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 0.875rem;
		border-radius: 0.375rem;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		cursor: grab;
		transition: all 0.2s ease;
	}

	.drag-item:hover:not(.disabled) {
		transform: translateY(-1px);
		box-shadow: 0 2px 4px hsl(var(--foreground) / 0.08);
	}

	.drag-item:active:not(.disabled) {
		cursor: grabbing;
		transform: translateY(0);
	}

	.drag-item.disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.drag-item-start {
		border-left: 3px solid rgb(34 197 94);
		background: hsl(142 76% 95%);
	}

	:global(:root.dark) .drag-item-start {
		background: hsl(142 40% 12%);
	}

	.drag-item-end {
		border-left: 3px solid rgb(239 68 68);
		background: hsl(0 86% 97%);
	}

	:global(:root.dark) .drag-item-end {
		background: hsl(0 40% 12%);
	}

	.drag-item :global(.drag-handle) {
		width: 14px;
		height: 14px;
	}

	.drag-item :global(.drag-icon) {
		width: 14px;
		height: 14px;
	}

	.drag-label {
		font-size: 0.8125rem;
		font-weight: 500;
	}

	.item-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.list-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.5rem;
		border-radius: 0.375rem;
		border: 1px solid transparent;
		background: transparent;
		cursor: pointer;
		text-align: left;
		width: 100%;
		transition: all 0.15s ease;
	}

	.list-item:hover {
		background: hsl(var(--accent));
		border-color: hsl(var(--border));
	}

	.list-item.selected {
		background: hsl(var(--accent));
		border-color: hsl(var(--primary) / 0.4);
	}

	.list-item :global(.item-icon) {
		flex-shrink: 0;
		color: hsl(var(--muted-foreground));
	}

	.item-label {
		flex: 1;
		font-size: 0.8125rem;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.item-meta {
		font-size: 0.625rem;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
	}

	.scope-badge {
		flex-shrink: 0;
		max-width: 5.5rem;
		padding: 0.05rem 0.35rem;
		border-radius: 9999px;
		background: hsl(var(--foreground) / 0.08);
		color: hsl(var(--muted-foreground));
		font-size: 0.5625rem;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.enable-toggle {
		flex-shrink: 0;
		accent-color: hsl(var(--primary));
		cursor: pointer;
	}
</style>
