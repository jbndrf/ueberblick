<script lang="ts">
	import { ArrowLeft, ArrowRight, Wrench, Plus } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as m from '$lib/paraglide/messages';
	import type { WorkflowStage } from '$lib/workflow-builder';
	import { toolRegistry } from '$lib/workflow-builder/tools';

	interface Props {
		stageId: string;
		availableTargetStages: WorkflowStage[];
		onAddConnection?: (toStageId: string) => void;
		onAddStageTool?: (toolType: string) => void;
		onCreateStageAndConnect?: (fromStageId: string) => void;
		onClose?: () => void;
	}

	let { stageId, availableTargetStages, onAddConnection, onAddStageTool, onCreateStageAndConnect, onClose }: Props =
		$props();

	// Sub-view state
	let view = $state<'pick' | 'transition' | 'stage-tool'>('pick');

	// Get stage tools from registry
	const stageTools = $derived(toolRegistry.getStageTools());

	function handleSelectTarget(targetId: string) {
		onAddConnection?.(targetId);
	}

	function handleSelectTool(toolType: string) {
		onAddStageTool?.(toolType);
	}

	function handleCreateNewStage() {
		onCreateStageAndConnect?.(stageId);
	}
</script>

<div class="picker-panel">
	<!-- Back button -->
	<button
		class="back-btn"
		onclick={() => {
			if (view === 'pick') {
				onClose?.();
			} else {
				view = 'pick';
			}
		}}
	>
		<ArrowLeft class="w-3.5 h-3.5" />
		<span>{view === 'pick' ? (m.stagePreviewAddButtonPickerBack?.() ?? 'Back') : (m.stagePreviewAddButtonPickerChooseType?.() ?? 'Choose type')}</span>
	</button>

	<div class="picker-content">
		{#if view === 'pick'}
			<!-- Top-level picker: Transition or Stage Tool -->
			<h4 class="picker-title">{m.stagePreviewAddButtonPickerTitle?.() ?? 'Add a button'}</h4>

			<div class="picker-options">
				<button class="picker-option" onclick={() => (view = 'transition')}>
					<div class="picker-option-icon">
						<ArrowRight class="w-4 h-4" />
					</div>
					<div class="picker-option-text">
						<span class="picker-option-label">{m.stagePreviewAddButtonPickerTransitionLabel?.() ?? 'Transition'}</span>
						<span class="picker-option-desc">{m.stagePreviewAddButtonPickerTransitionDesc?.() ?? 'Move to another stage'}</span>
					</div>
				</button>

				<button class="picker-option" onclick={() => (view = 'stage-tool')}>
					<div class="picker-option-icon">
						<Wrench class="w-4 h-4" />
					</div>
					<div class="picker-option-text">
						<span class="picker-option-label">{m.stagePreviewAddButtonPickerStageToolLabel?.() ?? 'Stage Tool'}</span>
						<span class="picker-option-desc">{m.stagePreviewAddButtonPickerStageToolDesc?.() ?? 'Use a tool at this stage'}</span>
					</div>
				</button>
			</div>
		{:else if view === 'transition'}
			<!-- Target stage selection -->
			<h4 class="picker-title">{m.stagePreviewAddButtonPickerSelectTargetStage?.() ?? 'Select target stage'}</h4>

			<div class="target-list">
				<button class="target-item target-item-create" onclick={handleCreateNewStage}>
					<Plus class="w-3.5 h-3.5 text-muted-foreground" />
					<span class="target-name">{m.stagePreviewAddButtonPickerNewStage?.() ?? 'New Stage'}</span>
				</button>
				{#each availableTargetStages as target}
					<button class="target-item" onclick={() => handleSelectTarget(target.id)}>
						<ArrowRight class="w-3.5 h-3.5 text-muted-foreground" />
						<span class="target-name">{target.stage_name}</span>
						<span class="target-type">{target.stage_type}</span>
					</button>
				{/each}
			</div>
		{:else if view === 'stage-tool'}
			<!-- Stage tool selection (registry-driven) -->
			<h4 class="picker-title">{m.stagePreviewAddButtonPickerSelectToolType?.() ?? 'Select tool type'}</h4>

			{#if stageTools.length === 0}
				<p class="text-xs text-muted-foreground py-4 text-center">
					{m.stagePreviewAddButtonPickerNoTools?.() ?? 'No stage tools available.'}
				</p>
			{:else}
				<div class="picker-options">
					{#each stageTools as tool}
						<button class="picker-option" onclick={() => handleSelectTool(tool.toolType)}>
							<div class="picker-option-icon" style="color: {tool.defaultColor}">
								<svelte:component this={tool.icon} class="w-4 h-4" />
							</div>
							<div class="picker-option-text">
								<span class="picker-option-label">{tool.displayName}</span>
								<span class="picker-option-desc">{tool.description}</span>
							</div>
						</button>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.picker-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.back-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.625rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		border-bottom: 1px solid hsl(var(--border));
		cursor: pointer;
		transition: color 0.15s ease;
		background: none;
		border-left: none;
		border-right: none;
		border-top: none;
		width: 100%;
		text-align: left;
	}

	.back-btn:hover {
		color: hsl(var(--foreground));
	}

	.picker-content {
		flex: 1;
		overflow-y: auto;
		padding: 0.75rem;
	}

	.picker-title {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
		margin-bottom: 0.75rem;
	}

	.picker-options {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.picker-option {
		display: flex;
		align-items: flex-start;
		gap: 0.625rem;
		padding: 0.625rem;
		border-radius: 0.5rem;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--background));
		cursor: pointer;
		transition: all 0.15s ease;
		width: 100%;
		text-align: left;
	}

	.picker-option:hover {
		background: hsl(var(--accent));
		border-color: hsl(var(--accent));
	}

	.picker-option-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.375rem;
		background: hsl(var(--muted));
		flex-shrink: 0;
		color: hsl(var(--muted-foreground));
	}

	.picker-option-text {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.picker-option-label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.picker-option-desc {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
	}

	/* Target stage list */
	.target-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.target-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		border-radius: 0.375rem;
		border: 1px solid transparent;
		background: none;
		cursor: pointer;
		transition: all 0.15s ease;
		width: 100%;
		text-align: left;
	}

	.target-item:hover {
		background: hsl(var(--accent));
		border-color: hsl(var(--border));
	}

	.target-name {
		flex: 1;
		font-size: 0.8125rem;
		color: hsl(var(--foreground));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.target-type {
		font-size: 0.625rem;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.target-item-create {
		border-bottom: 1px solid hsl(var(--border));
		margin-bottom: 0.25rem;
		padding-bottom: 0.625rem;
	}
</style>
