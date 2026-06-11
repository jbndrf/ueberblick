<script lang="ts">
	import {
		Play,
		Square,
		CircleStop,
		GripVertical,
		Plus,
		FileText,
		Pencil,
		ClipboardList,
		Zap,
		Tags,
		Library
	} from '@lucide/svelte';
	import { toolRegistry } from '$lib/workflow-builder/tools';
	import { getBuilderContext, selectTool, openProtocolTool } from '../builder-context.svelte';
	import {
		workflowBuilderDefaultPanelEnd,
		workflowBuilderDefaultPanelHint,
		workflowBuilderDefaultPanelStage,
		workflowBuilderDefaultPanelStages,
		workflowBuilderDefaultPanelStart,
		workflowBuilderGlobalTools,
		catalogAutomationsTitle,
		catalogFieldTagsLabel,
		catalogFieldTagsMapped,
		catalogFieldLibraryLabel,
		catalogEmptyGlobalTools,
		catalogEmptyAutomations,
		catalogAddFormTitle,
		catalogAddEditTitle,
		catalogAddProtocolTitle,
		catalogTriggerTransition,
		catalogTriggerFieldChange,
		catalogTriggerScheduled
	} from '$lib/paraglide/messages';

	const ctx = getBuilderContext();
	const { state, ui } = ctx;

	const hasStartStage = $derived(state.hasStartStage);

	function onDragStart(event: DragEvent, nodeType: 'start' | 'intermediate' | 'end') {
		if (!event.dataTransfer) return;
		event.dataTransfer.setData('application/xyflow', nodeType);
		event.dataTransfer.effectAllowed = 'move';
	}

	// --- Global tools ---------------------------------------------------------
	const globalTools = $derived.by(() => {
		const items: Array<{ id: string; type: string; name: string }> = [
			...state.getGlobalForms().map((f) => ({ id: f.data.id, type: 'form', name: f.data.name })),
			...state.getGlobalEditTools().map((t) => ({ id: t.data.id, type: 'edit', name: t.data.name })),
			...state
				.getGlobalProtocolTools()
				.map((t) => ({ id: t.data.id, type: 'protocol', name: t.data.name }))
		];
		return items;
	});

	function addGlobalTool(toolType: 'form' | 'edit' | 'protocol') {
		if (toolType === 'form') {
			const form = state.addForm({ isGlobal: true });
			ui.select({ type: 'form', id: form.id });
		} else if (toolType === 'edit') {
			const tool = state.addGlobalEditTool('form_fields');
			ui.select({ type: 'editTool', id: tool.id });
		} else {
			const tool = state.addProtocolTool({ isGlobal: true });
			openProtocolTool(ctx, tool.id);
		}
	}

	// --- Automations -----------------------------------------------------------
	const automations = $derived(state.visibleAutomations.map((a) => a.data));

	function triggerShortLabel(triggerType: string): string {
		if (triggerType === 'on_field_change')
			return catalogTriggerFieldChange?.() ?? 'on field change';
		if (triggerType === 'cron') return catalogTriggerScheduled?.() ?? 'scheduled';
		return catalogTriggerTransition?.() ?? 'on transition';
	}

	function addAutomation() {
		const automation = state.addAutomation('on_transition');
		ui.select({ type: 'automation', id: automation.id });
	}

	// --- Field tags ------------------------------------------------------------
	const tagMappingCount = $derived(
		state.getFieldTagForWorkflow()?.data.tag_mappings.length ?? 0
	);

	function openFieldTags() {
		state.getOrCreateFieldTag();
		ui.select({ type: 'fieldTags' });
	}

	const selectedId = $derived.by(() => {
		const s = ui.selection;
		return 'id' in s ? s.id : null;
	});

	function toolIcon(type: string) {
		return toolRegistry.get(type)?.icon ?? FileText;
	}
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
				ondragstart={(e) => onDragStart(e, 'start')}
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
				ondragstart={(e) => onDragStart(e, 'intermediate')}
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
				ondragstart={(e) => onDragStart(e, 'end')}
				role="button"
				tabindex="0"
			>
				<GripVertical class="drag-handle text-muted-foreground" />
				<CircleStop class="drag-icon text-foreground" />
				<span class="drag-label text-foreground"
					>{workflowBuilderDefaultPanelEnd?.() ?? 'End'}</span
				>
			</div>
		</div>
		<p class="section-hint">
			{workflowBuilderDefaultPanelHint?.() ?? 'Drag stages onto the canvas to add them.'}
		</p>
	</section>

	<!-- Globale Tools -->
	<section class="catalog-section">
		<div class="section-header">
			<h3 class="section-title">{workflowBuilderGlobalTools?.() ?? 'Global Tools'}</h3>
			<div class="add-buttons">
				<button
					class="add-btn"
					title={catalogAddFormTitle?.() ?? 'Add global form'}
					onclick={() => addGlobalTool('form')}
				>
					<FileText class="h-3 w-3" /><Plus class="h-2.5 w-2.5" />
				</button>
				<button
					class="add-btn"
					title={catalogAddEditTitle?.() ?? 'Add global edit tool'}
					onclick={() => addGlobalTool('edit')}
				>
					<Pencil class="h-3 w-3" /><Plus class="h-2.5 w-2.5" />
				</button>
				<button
					class="add-btn"
					title={catalogAddProtocolTitle?.() ?? 'Add protocol region'}
					onclick={() => addGlobalTool('protocol')}
				>
					<ClipboardList class="h-3 w-3" /><Plus class="h-2.5 w-2.5" />
				</button>
			</div>
		</div>
		{#if globalTools.length === 0}
			<p class="section-hint">{catalogEmptyGlobalTools?.() ?? 'No global tools yet.'}</p>
		{:else}
			<div class="item-list">
				{#each globalTools as tool (tool.id)}
					{@const ToolIcon = toolIcon(tool.type)}
					<button
						class="list-item"
						class:selected={selectedId === tool.id}
						onclick={() => selectTool(ctx, tool.id)}
					>
						<ToolIcon class="h-3.5 w-3.5 item-icon" />
						<span class="item-label">{tool.name}</span>
					</button>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Automatisierungen -->
	<section class="catalog-section">
		<div class="section-header">
			<h3 class="section-title">{catalogAutomationsTitle?.() ?? 'Automations'}</h3>
			<div class="add-buttons">
				<button class="add-btn" title={catalogAutomationsTitle?.() ?? 'Automations'} onclick={addAutomation}>
					<Zap class="h-3 w-3" /><Plus class="h-2.5 w-2.5" />
				</button>
			</div>
		</div>
		{#if automations.length === 0}
			<p class="section-hint">{catalogEmptyAutomations?.() ?? 'No automations yet.'}</p>
		{:else}
			<div class="item-list">
				{#each automations as automation (automation.id)}
					<button
						class="list-item"
						class:selected={selectedId === automation.id}
						onclick={() => ui.select({ type: 'automation', id: automation.id })}
					>
						<Zap class="h-3.5 w-3.5 item-icon" />
						<span class="item-label">{automation.name}</span>
						<span class="item-meta">{triggerShortLabel(automation.trigger_type)}</span>
						<input
							type="checkbox"
							class="enable-toggle"
							checked={automation.is_enabled}
							onclick={(e) => {
								e.stopPropagation();
								state.updateAutomation(automation.id, {
									is_enabled: (e.currentTarget as HTMLInputElement).checked
								});
							}}
						/>
					</button>
				{/each}
			</div>
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
				<Tags class="h-3.5 w-3.5 item-icon" />
				<span class="item-label">{catalogFieldTagsLabel?.() ?? 'Field tags'}</span>
				<span class="item-meta"
					>{catalogFieldTagsMapped?.({ count: tagMappingCount }) ?? `${tagMappingCount} mapped`}</span
				>
			</button>
			<button
				class="list-item"
				class:selected={ui.selection.type === 'fieldDef'}
				onclick={() => ui.select({ type: 'fieldDef', id: '' })}
			>
				<Library class="h-3.5 w-3.5 item-icon" />
				<span class="item-label">{catalogFieldLibraryLabel?.() ?? 'Field library'}</span>
				<span class="item-meta">{state.visibleFieldDefs.length}</span>
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

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.section-title {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	.section-hint {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	.add-buttons {
		display: flex;
		gap: 0.25rem;
	}

	.add-btn {
		display: inline-flex;
		align-items: center;
		gap: 1px;
		padding: 0.25rem 0.3rem;
		border-radius: 0.25rem;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.add-btn:hover {
		color: hsl(var(--foreground));
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

	.enable-toggle {
		flex-shrink: 0;
		accent-color: hsl(var(--primary));
		cursor: pointer;
	}
</style>
