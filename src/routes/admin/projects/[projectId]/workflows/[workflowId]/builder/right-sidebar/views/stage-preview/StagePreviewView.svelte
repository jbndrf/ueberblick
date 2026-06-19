<script lang="ts">
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import {
		stagePreviewViewCollapsePanel,
		stagePreviewViewFieldsHint
	} from '$lib/paraglide/messages';
	import type { WorkflowStage } from '$lib/workflow-builder';
	import type { WorkflowFieldDef } from '$lib/workflow-builder';
	import type { StageAction, Role } from './types';
	import ParticipantPreview from './ParticipantPreview.svelte';
	import AddButtonPicker from './AddButtonPicker.svelte';
	import LibraryFieldsPalette from '../form-editor/LibraryFieldsPalette.svelte';
	import { getBuilderContext } from '../../../builder-context.svelte';

	interface Props {
		/** Null = the participant default view (no stage selected). */
		stage: WorkflowStage | null;
		actions: StageAction[];
		globalTools: StageAction[];
		roles: Role[];
		// Available target stages for creating connections
		availableTargetStages: WorkflowStage[];
		// Handlers
		onStageRename?: (stageId: string, name: string) => void;
		onStageDelete?: (stageId: string) => void;
		onClose?: () => void;
		// Add button handlers
		onAddConnection?: (fromStageId: string, toStageId: string) => void;
		onAddStageTool?: (stageId: string, toolType: string) => void;
		// Create stage + connect
		onCreateStageAndConnect?: (fromStageId: string) => void;
		// Navigation — preview buttons select their object's inspector
		onSelectTool?: (toolType: string, toolId: string) => void;
		onSelectConnection?: (connectionId: string) => void;
		// Canvas highlight callbacks
		onHighlightEdge?: (edgeId: string | null) => void;
		onHighlightStageTool?: (toolId: string | null) => void;
	}

	let {
		stage,
		actions,
		globalTools,
		roles,
		availableTargetStages,
		onStageRename,
		onStageDelete,
		onClose,
		onAddConnection,
		onAddStageTool,
		onCreateStageAndConnect,
		onSelectTool,
		onSelectConnection,
		onHighlightEdge,
		onHighlightStageTool
	}: Props = $props();

	const { state: builderState, ui } = getBuilderContext();

	// Left panel mode: collapsed | fields palette | add-picker.
	type LeftMode = 'collapsed' | 'fields' | 'add-picker';
	let leftMode = $state<LeftMode>('collapsed');
	let selectedButtonId = $state<string | null>(null);
	let roleFilter = $state<string>('all');

	const isPanelOpen = $derived(leftMode !== 'collapsed');

	// Mirror the panel-open state to the shared flag so the inspector widens
	// outward (keeping the preview the same size) instead of squeezing it.
	// Reset on teardown so the flag never leaks to the next inspector.
	$effect(() => {
		ui.paletteExpanded = isPanelOpen;
		return () => {
			ui.paletteExpanded = false;
		};
	});

	// Keep the breadcrumb at most 3 panels deep: while a field config/detail
	// drill is open, this view's own field palette stays collapsed.
	$effect(() => {
		if (ui.configTarget || ui.detailTarget) leftMode = 'collapsed';
	});

	// Library palette: all defs; those already in the active tab are greyed out.
	const paletteDefs = $derived<WorkflowFieldDef[]>(
		builderState.visibleFieldDefs.map((d) => d.data)
	);
	const usedInActiveTab = $derived(
		new Set(builderState.getFieldDefsForTab(ui.activeDataTab).map((d) => d.data.id))
	);

	function addFieldToActiveTab(defId: string) {
		const row = builderState.getFieldDefsForTab(ui.activeDataTab).length;
		builderState.moveFieldDefToTab(defId, ui.activeDataTab, row, 'full');
	}

	// The gear on a roll-bar action opens the ONE shared config sidebar.
	function handleConfigButton(actionId: string) {
		const a = [...actions, ...globalTools].find((x) => x.id === actionId);
		if (!a) return;
		const kind =
			a.type === 'connection'
				? 'connection'
				: a.type === 'stage_form'
					? 'form'
					: a.type === 'stage_protocol'
						? 'protocolTool'
						: 'editTool';
		ui.toggleConfig(kind, actionId);
		selectedButtonId = actionId;
		onHighlightEdge?.(null);
		onHighlightStageTool?.(null);
	}

	/**
	 * Buttons in the preview SELECT their object — the connection, form or
	 * tool — so each thing has exactly one configuration home (its own
	 * inspector). The preview never edits inline.
	 */
	function handleButtonSelect(actionId: string) {
		const action = [...actions, ...globalTools].find((a) => a.id === actionId);
		if (!action) return;
		onHighlightEdge?.(null);
		onHighlightStageTool?.(null);
		if (action.type === 'connection') {
			onSelectConnection?.(action.id);
		} else if (action.type === 'stage_tool' || action.type === 'global_tool') {
			onSelectTool?.('edit', action.tool.id);
		} else if (action.type === 'stage_form') {
			onSelectTool?.('form', action.form.id);
		} else if (action.type === 'stage_protocol') {
			onSelectTool?.('protocol', action.tool.id);
		}
	}

	function handleButtonHover(actionId: string | null) {
		if (!actionId) {
			onHighlightEdge?.(null);
			onHighlightStageTool?.(null);
			return;
		}
		const action = [...actions, ...globalTools].find((a) => a.id === actionId);
		if (action?.type === 'connection') {
			onHighlightEdge?.(action.id);
		} else if (action?.type === 'stage_tool') {
			onHighlightStageTool?.(action.tool.id);
		} else if (action?.type === 'stage_form') {
			onHighlightStageTool?.(action.form.id);
		} else if (action?.type === 'stage_protocol') {
			onHighlightStageTool?.(action.tool.id);
		}
	}

	function handleAddButtonClick() {
		if (!stage) return;
		selectedButtonId = null;
		leftMode = 'add-picker';
		onHighlightEdge?.(null);
		onHighlightStageTool?.(null);
	}

	function handlePickerClose() {
		selectedButtonId = null;
		leftMode = 'fields';
		onHighlightEdge?.(null);
		onHighlightStageTool?.(null);
	}

	function handleTogglePanel() {
		leftMode = isPanelOpen ? 'collapsed' : 'fields';
	}

	function handleConnectionCreated(toStageId: string) {
		if (!stage) return;
		onAddConnection?.(stage.id, toStageId);
		leftMode = 'fields';
		selectedButtonId = null;
	}

	function handleStageToolCreated(toolType: string) {
		if (!stage) return;
		onAddStageTool?.(stage.id, toolType);
		leftMode = 'fields';
		selectedButtonId = null;
	}
</script>

<div class="stage-preview-view">
	<!-- Left Panel (field palette / add-picker, expandable) -->
	<div class="left-panel" class:wide={isPanelOpen}>
		<!-- Toggle button -->
		<button
			class="palette-toggle"
			onclick={handleTogglePanel}
			title={isPanelOpen
				? (stagePreviewViewCollapsePanel?.() ?? 'Collapse panel')
				: (stagePreviewViewFieldsHint?.() ?? 'Add fields to the active tab')}
		>
			{#if isPanelOpen}
				<ChevronRight class="h-[30px] w-[30px]" />
			{:else}
				<ChevronLeft class="h-[30px] w-[30px]" />
			{/if}
		</button>

		<!-- Panel content -->
		{#if isPanelOpen}
			<div class="panel-content">
				{#if leftMode === 'add-picker' && stage}
					<AddButtonPicker
						stageId={stage.id}
						{availableTargetStages}
						onAddConnection={handleConnectionCreated}
						onAddStageTool={handleStageToolCreated}
						{onCreateStageAndConnect}
						onClose={handlePickerClose}
					/>
				{:else}
					<LibraryFieldsPalette
						expanded={true}
						fieldDefs={paletteDefs}
						usedDefIds={usedInActiveTab}
						onPick={addFieldToActiveTab}
					/>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Main panel (preview) -->
	<div class="preview-container">
		<ParticipantPreview
			{stage}
			{actions}
			{globalTools}
			{roles}
			{selectedButtonId}
			{roleFilter}
			onButtonSelect={handleButtonSelect}
			onButtonHover={handleButtonHover}
			onConfigButton={handleConfigButton}
			onAddButtonClick={handleAddButtonClick}
			onStageRename={(name) => stage && onStageRename?.(stage.id, name)}
			onStageDelete={() => stage && onStageDelete?.(stage.id)}
			{onClose}
			onRoleFilterChange={(role) => (roleFilter = role)}
		/>
	</div>
</div>

<style>
	.stage-preview-view {
		display: flex;
		flex: 1;
		overflow: hidden;
		height: 100%;
	}

	/* Left panel - mirrors FormEditorView */
	.left-panel {
		display: flex;
		flex-shrink: 0;
		border-right: 1px solid oklch(0.88 0.01 250);
		width: 38px; /* just the toggle */
		transition: width 0.2s ease;
		overflow: hidden;
	}

	.left-panel.wide {
		width: 238px; /* toggle (38px) + panel (200px) */
	}

	:global(.dark) .left-panel {
		border-right-color: oklch(1 0 0 / 20%);
	}

	.palette-toggle {
		width: 38px;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(var(--muted));
		border: none;
		border-right: 1px solid hsl(var(--border));
		cursor: pointer;
		transition:
			background 0.15s ease,
			color 0.15s ease;
		flex-shrink: 0;
		color: hsl(var(--muted-foreground));
	}

	.palette-toggle :global(svg) {
		transition: transform 0.15s ease;
	}

	.palette-toggle:hover {
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary));
	}

	.palette-toggle:hover :global(svg) {
		transform: scale(1.2);
	}

	.panel-content {
		flex: 1;
		overflow-y: auto;
		min-width: 0;
	}

	/* Main preview area */
	.preview-container {
		flex: 1;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
</style>
