<script lang="ts">
	import { ChevronLeft, ChevronRight } from 'lucide-svelte';
	import * as m from '$lib/paraglide/messages';
	import type { Edge } from '@xyflow/svelte';
	import type { WorkflowStage, ToolsForm, ToolsEdit, VisualConfig } from '$lib/workflow-builder';
	import type { StageAction, TimelineStage, Role, ConfigPanelMode, IncomingFormGroup } from './types';
	import ParticipantPreview from './ParticipantPreview.svelte';
	import ButtonConfigPanel from './ButtonConfigPanel.svelte';
	import AddButtonPicker from './AddButtonPicker.svelte';

	interface Props {
		stage: WorkflowStage;
		actions: StageAction[];
		globalTools: StageAction[];
		timeline: TimelineStage[];
		roles: Role[];
		// Available target stages for creating connections
		availableTargetStages: WorkflowStage[];
		// Incoming forms for Details tab
		incomingForms?: IncomingFormGroup[];
		// Handlers
		onStageRename?: (stageId: string, name: string) => void;
		onStageRolesChange?: (stageId: string, roleIds: string[]) => void;
		onStageDelete?: (stageId: string) => void;
		onClose?: () => void;
		// Button config handlers
		onButtonLabelChange?: (actionId: string, actionType: string, label: string) => void;
		onButtonColorChange?: (actionId: string, actionType: string, color: string) => void;
		onButtonRolesChange?: (actionId: string, actionType: string, roleIds: string[]) => void;
		onButtonDelete?: (actionId: string, actionType: string) => void;
		// Add button handlers
		onAddConnection?: (fromStageId: string, toStageId: string) => void;
		onAddStageTool?: (stageId: string, toolType: string) => void;
		// Create stage + connect
		onCreateStageAndConnect?: (fromStageId: string) => void;
		// Navigation
		onSelectTool?: (toolType: string, toolId: string) => void;
		onSelectConnection?: (connectionId: string) => void;
		// Visual config
		onConnectionVisualConfigChange?: (connectionId: string, config: VisualConfig) => void;
		onToolVisualConfigChange?: (toolId: string, config: VisualConfig) => void;
		// Role creation
		onCreateRole?: (name: string) => Promise<Role>;
		// Canvas highlight callbacks
		onHighlightEdge?: (edgeId: string | null) => void;
		onHighlightStageTool?: (toolId: string | null) => void;
	}

	let {
		stage,
		actions,
		globalTools,
		timeline,
		roles,
		availableTargetStages,
		incomingForms = [],
		onStageRename,
		onStageRolesChange,
		onStageDelete,
		onClose,
		onButtonLabelChange,
		onButtonColorChange,
		onButtonRolesChange,
		onButtonDelete,
		onAddConnection,
		onAddStageTool,
		onCreateStageAndConnect,
		onSelectTool,
		onSelectConnection,
		onConnectionVisualConfigChange,
		onToolVisualConfigChange,
		onCreateRole,
		onHighlightEdge,
		onHighlightStageTool
	}: Props = $props();

	// Panel state
	let configPanel = $state<ConfigPanelMode>({ type: 'collapsed' });
	let selectedButtonId = $state<string | null>(null);
	let roleFilter = $state<string>('all');

	const isPanelOpen = $derived(configPanel.type !== 'collapsed');

	// Get the currently selected action
	const selectedAction = $derived.by(() => {
		if (!selectedButtonId) return null;
		const allActions = [...actions, ...globalTools];
		return allActions.find((a) => a.id === selectedButtonId) ?? null;
	});

	function handleButtonSelect(actionId: string) {
		selectedButtonId = actionId;
		configPanel = { type: 'button-config', actionId };

		// Highlight the corresponding element on canvas
		const action = [...actions, ...globalTools].find(a => a.id === actionId);
		if (action?.type === 'connection') {
			onHighlightEdge?.(action.id);
			onHighlightStageTool?.(null);
		} else if (action?.type === 'stage_tool') {
			onHighlightStageTool?.(action.tool.id);
			onHighlightEdge?.(null);
		} else if (action?.type === 'stage_form') {
			onHighlightStageTool?.(action.form.id);
			onHighlightEdge?.(null);
		} else {
			onHighlightEdge?.(null);
			onHighlightStageTool?.(null);
		}
	}

	function handleButtonHover(actionId: string | null) {
		if (!actionId) {
			onHighlightEdge?.(null);
			onHighlightStageTool?.(null);
			return;
		}
		const action = [...actions, ...globalTools].find(a => a.id === actionId);
		if (action?.type === 'connection') {
			onHighlightEdge?.(action.id);
		} else if (action?.type === 'stage_tool') {
			onHighlightStageTool?.(action.tool.id);
		} else if (action?.type === 'stage_form') {
			onHighlightStageTool?.(action.form.id);
		}
	}

	function handleAddButtonClick() {
		selectedButtonId = null;
		configPanel = { type: 'add-picker' };
		onHighlightEdge?.(null);
		onHighlightStageTool?.(null);
	}

	function handleConfigClose() {
		selectedButtonId = null;
		configPanel = { type: 'collapsed' };
		onHighlightEdge?.(null);
		onHighlightStageTool?.(null);
	}

	function handleTogglePanel() {
		if (isPanelOpen) {
			handleConfigClose();
		}
		// Don't auto-open on toggle -- panel opens on button click
	}

	function handleConnectionCreated(toStageId: string) {
		onAddConnection?.(stage.id, toStageId);
		// Panel stays open -- the new button will appear and can be clicked to configure
		configPanel = { type: 'collapsed' };
		selectedButtonId = null;
	}

	function handleStageToolCreated(toolType: string) {
		onAddStageTool?.(stage.id, toolType);
		configPanel = { type: 'collapsed' };
		selectedButtonId = null;
	}
</script>

<div class="stage-preview-view">
	<!-- Left Panel (config, expandable) -->
	<div class="left-panel" class:wide={isPanelOpen}>
		<!-- Toggle button -->
		<button class="palette-toggle" onclick={handleTogglePanel} title={isPanelOpen ? (m.stagePreviewViewCollapsePanel?.() ?? 'Collapse panel') : (m.stagePreviewViewSelectButton?.() ?? 'Select a button to configure')}>
			{#if isPanelOpen}
				<ChevronLeft class="w-3 h-3" />
			{:else}
				<ChevronRight class="w-3 h-3" />
			{/if}
		</button>

		<!-- Panel content -->
		{#if isPanelOpen}
			<div class="panel-content">
				{#if configPanel.type === 'button-config' && selectedAction}
					<ButtonConfigPanel
						action={selectedAction}
						{roles}
						{onCreateRole}
						onLabelChange={(label) => {
							if (!selectedAction) return;
							onButtonLabelChange?.(selectedAction.id, selectedAction.type, label);
						}}
						onColorChange={(color) => {
							if (!selectedAction) return;
							onButtonColorChange?.(selectedAction.id, selectedAction.type, color);
						}}
						onRolesChange={(roleIds) => {
							if (!selectedAction) return;
							onButtonRolesChange?.(selectedAction.id, selectedAction.type, roleIds);
						}}
						onDelete={() => {
							if (!selectedAction) return;
							onButtonDelete?.(selectedAction.id, selectedAction.type);
							handleConfigClose();
						}}
						onOpenTool={(toolType, toolId) => onSelectTool?.(toolType, toolId)}
						onClose={handleConfigClose}
					/>
				{:else if configPanel.type === 'add-picker'}
					<AddButtonPicker
						stageId={stage.id}
						{availableTargetStages}
						onAddConnection={handleConnectionCreated}
						onAddStageTool={handleStageToolCreated}
						{onCreateStageAndConnect}
						onClose={handleConfigClose}
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
			{timeline}
			{roles}
			{incomingForms}
			{selectedButtonId}
			{roleFilter}
			{onCreateRole}
			onButtonSelect={handleButtonSelect}
			onButtonHover={handleButtonHover}
			onAddButtonClick={handleAddButtonClick}
			onStageRename={(name) => onStageRename?.(stage.id, name)}
			onStageRolesChange={(roleIds) => onStageRolesChange?.(stage.id, roleIds)}
			onStageDelete={() => onStageDelete?.(stage.id)}
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
		width: 20px; /* just the toggle */
		transition: width 0.2s ease;
		overflow: hidden;
	}

	.left-panel.wide {
		width: 220px; /* toggle (20px) + config panel (200px) */
	}

	:global(.dark) .left-panel {
		border-right-color: oklch(1 0 0 / 20%);
	}

	.palette-toggle {
		width: 20px;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(var(--muted));
		border: none;
		border-right: 1px solid hsl(var(--border));
		cursor: pointer;
		transition: all 0.15s ease;
		flex-shrink: 0;
		color: hsl(var(--muted-foreground));
	}

	.palette-toggle:hover {
		background: hsl(var(--accent));
		color: hsl(var(--primary));
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
