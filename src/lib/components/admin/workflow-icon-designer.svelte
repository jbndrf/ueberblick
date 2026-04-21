<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { toast } from 'svelte-sonner';
	import { X, Pencil, Trash2, Play, Square, CircleStop, ArrowLeft, Image } from '@lucide/svelte';
	import MarkerIconDesigner from './marker-icon-designer.svelte';
	import * as m from '$lib/paraglide/messages';

	interface IconStyle {
		size: number;
		color: string;
		borderWidth: number;
		borderColor: string;
		backgroundColor: string;
		shadow: boolean;
		shape: 'none' | 'pin';
	}

	interface IconConfig {
		type: 'svg';
		svgContent: string;
		style: IconStyle;
		metadata?: {
			source: string;
			fileSize: number;
			filename: string;
			uploadDate: string;
		};
	}

	interface Stage {
		id: string;
		stage_name: string;
		stage_type: 'start' | 'intermediate' | 'end';
		stage_order?: number;
		visual_config?: Record<string, unknown>;
	}

	interface Props {
		workflowName: string;
		initialIconConfig?: IconConfig;
		stages: Stage[];
		filterMode?: 'none' | 'stage' | 'field';
		filterFieldOptions?: string[];
		filterValueIcons?: Record<string, IconConfig>;
		onSaveWorkflowIcon: (config: IconConfig | null) => Promise<void>;
		onSaveStageIcon: (stageId: string, iconConfig: IconConfig | null) => Promise<void>;
		onSaveFilterValueIcon?: (value: string, config: IconConfig | null) => Promise<void>;
		onCancel?: () => void;
	}

	let {
		workflowName,
		initialIconConfig,
		stages,
		filterMode = 'none',
		filterFieldOptions = [],
		filterValueIcons = {},
		onSaveWorkflowIcon,
		onSaveStageIcon,
		onSaveFilterValueIcon,
		onCancel
	}: Props = $props();

	// State machine: 'overview' | 'editing'
	let view = $state<'overview' | 'editing'>('overview');
	let editingTarget = $state<{ type: 'workflow' } | { type: 'stage'; stageId: string } | { type: 'filterValue'; value: string } | null>(null);
	let editingInitialConfig = $state<IconConfig | undefined>(undefined);

	// Local state for icon configs (so we can show previews before saving)
	let workflowIconConfig = $state<IconConfig | undefined>(initialIconConfig);
	let stageIconConfigs = $state<Map<string, IconConfig>>(new Map());
	let localFilterValueIcons = $state<Record<string, IconConfig>>(filterValueIcons as Record<string, IconConfig>);

	// Initialize stage icon configs from visual_config
	$effect(() => {
		const map = new Map<string, IconConfig>();
		for (const stage of stages) {
			const ic = stage.visual_config?.icon_config as IconConfig | undefined;
			if (ic?.svgContent) {
				map.set(stage.id, ic);
			}
		}
		stageIconConfigs = map;
	});

	const sortedStages = $derived(
		[...stages].sort((a, b) => (a.stage_order ?? 0) - (b.stage_order ?? 0))
	);

	const stageTypeConfig = {
		start: { icon: Play, label: m.adminWorkflowIconDesignerStageTypeStart(), color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
		intermediate: { icon: Square, label: m.adminWorkflowIconDesignerStageTypeStep(), color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
		end: { icon: CircleStop, label: m.adminWorkflowIconDesignerStageTypeEnd(), color: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400' }
	};

	function editWorkflowIcon() {
		editingTarget = { type: 'workflow' };
		editingInitialConfig = workflowIconConfig;
		view = 'editing';
	}

	function editStageIcon(stageId: string) {
		editingTarget = { type: 'stage', stageId };
		editingInitialConfig = stageIconConfigs.get(stageId);
		view = 'editing';
	}

	async function clearWorkflowIcon() {
		try {
			await onSaveWorkflowIcon(null);
			workflowIconConfig = undefined;
			toast.success(m.adminWorkflowIconDesignerWorkflowIconCleared());
		} catch {
			toast.error(m.adminWorkflowIconDesignerWorkflowIconClearError());
		}
	}

	async function clearStageIcon(stageId: string) {
		try {
			await onSaveStageIcon(stageId, null);
			stageIconConfigs.delete(stageId);
			stageIconConfigs = stageIconConfigs; // trigger reactivity
			toast.success(m.adminWorkflowIconDesignerStageIconCleared());
		} catch {
			toast.error(m.adminWorkflowIconDesignerStageIconClearError());
		}
	}

	function editFilterValueIcon(value: string) {
		editingTarget = { type: 'filterValue', value };
		editingInitialConfig = localFilterValueIcons[value];
		view = 'editing';
	}

	async function clearFilterValueIcon(value: string) {
		try {
			await onSaveFilterValueIcon?.(value, null);
			const updated = { ...localFilterValueIcons };
			delete updated[value];
			localFilterValueIcons = updated;
			toast.success(m.adminWorkflowIconDesignerFilterValueIconCleared());
		} catch {
			toast.error(m.adminWorkflowIconDesignerFilterValueIconClearError());
		}
	}

	async function handleDesignerSave(config: IconConfig) {
		if (!editingTarget) return;

		try {
			if (editingTarget.type === 'workflow') {
				await onSaveWorkflowIcon(config);
				workflowIconConfig = config;
			} else if (editingTarget.type === 'stage') {
				await onSaveStageIcon(editingTarget.stageId, config);
				stageIconConfigs.set(editingTarget.stageId, config);
				stageIconConfigs = stageIconConfigs; // trigger reactivity
			} else if (editingTarget.type === 'filterValue') {
				await onSaveFilterValueIcon?.(editingTarget.value, config);
				localFilterValueIcons = { ...localFilterValueIcons, [editingTarget.value]: config };
			}
			view = 'overview';
			editingTarget = null;
		} catch {
			toast.error(m.adminWorkflowIconDesignerSaveError());
		}
	}

	function handleDesignerCancel() {
		view = 'overview';
		editingTarget = null;
	}

	function renderIconPreview(config: IconConfig | undefined, size: number = 32): string | null {
		if (!config?.svgContent) return null;
		const color = config.style?.color || '#333';
		return config.svgContent.replace(
			/(<svg[^>]*)(>)/,
			`$1 style="width: ${size}px; height: ${size}px; fill: ${color};"$2`
		);
	}

	function getEditingLabel(): string {
		if (!editingTarget) return '';
		if (editingTarget.type === 'workflow') return m.adminWorkflowIconDesignerEditingLabelWorkflow({ workflowName });
		if (editingTarget.type === 'filterValue') return m.adminWorkflowIconDesignerEditingLabelFilterValue({ value: editingTarget.value });
		const target = editingTarget;
		const stage = stages.find(s => s.id === target.stageId);
		return m.adminWorkflowIconDesignerEditingLabelStage({ stageName: stage?.stage_name ?? m.adminWorkflowIconDesignerUnknown() });
	}
</script>

{#if view === 'editing'}
	<!-- Editing sub-view: show MarkerIconDesigner with a back button header -->
	<div class="flex h-full max-h-[85vh] w-full max-w-7xl flex-col rounded-lg border bg-background">
		<div class="flex items-center gap-3 border-b px-6 py-3">
			<Button variant="ghost" size="sm" onclick={handleDesignerCancel}>
				<ArrowLeft class="mr-1 h-4 w-4" />
				{m.adminWorkflowIconDesignerBack()}
			</Button>
			<Separator orientation="vertical" class="h-5" />
			<span class="text-sm font-medium text-muted-foreground">{getEditingLabel()}</span>
		</div>
		<div class="flex-1 overflow-auto">
			<MarkerIconDesigner
				initialConfig={editingInitialConfig}
				onSave={(config) => handleDesignerSave(config as IconConfig)}
				onCancel={handleDesignerCancel}
			/>
		</div>
	</div>
{:else}
	<!-- Overview: workflow icon + stage list -->
	<div class="flex h-full max-h-[85vh] w-full max-w-2xl flex-col gap-6 rounded-lg border bg-background p-6">
		<!-- Header -->
		<div class="flex items-center justify-between">
			<div>
				<h2 class="text-2xl font-semibold">{m.adminWorkflowIconDesignerTitle()}</h2>
				<p class="text-sm text-muted-foreground">
					{m.adminWorkflowIconDesignerSubtitle({ workflowName })}
				</p>
			</div>
			{#if onCancel}
				<Button variant="ghost" size="icon" onclick={onCancel}>
					<X class="h-5 w-5" />
				</Button>
			{/if}
		</div>

		<div class="flex-1 space-y-6 overflow-auto">
			<!-- Default Workflow Icon -->
			<div class="space-y-3">
				<h3 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{m.adminWorkflowIconDesignerDefaultIconHeading()}</h3>
				<div class="flex items-center gap-4 rounded-lg border p-4">
					<!-- Icon preview -->
					<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted/50">
						{#if workflowIconConfig?.svgContent}
							{@html renderIconPreview(workflowIconConfig, 32)}
						{:else}
							<Image class="h-5 w-5 text-muted-foreground" />
						{/if}
					</div>

					<!-- Info -->
					<div class="min-w-0 flex-1">
						<div class="text-sm font-medium">
							{workflowIconConfig?.svgContent ? (m.adminWorkflowIconDesignerCustomIconSet()) : (m.adminWorkflowIconDesignerNoIcon())}
						</div>
						<div class="text-xs text-muted-foreground">
							{m.adminWorkflowIconDesignerDefaultIconHint()}
						</div>
					</div>

					<!-- Actions -->
					<div class="flex gap-2">
						<Button variant="outline" size="sm" onclick={editWorkflowIcon}>
							<Pencil class="mr-1 h-3 w-3" />
							{workflowIconConfig?.svgContent ? (m.adminWorkflowIconDesignerEdit()) : (m.adminWorkflowIconDesignerSetIcon())}
						</Button>
						{#if workflowIconConfig?.svgContent}
							<Button variant="outline" size="sm" onclick={clearWorkflowIcon}>
								<Trash2 class="h-3 w-3" />
							</Button>
						{/if}
					</div>
				</div>
			</div>

			<Separator />

			<!-- Per-Stage Overrides -->
			<div class="space-y-3">
				<h3 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
					{m.adminWorkflowIconDesignerStageOverridesHeading()}
					<span class="ml-1 font-normal normal-case">({m.adminWorkflowIconDesignerStageCount({ count: sortedStages.length })})</span>
					{#if filterMode === 'stage'}
						<span class="ml-1 font-normal normal-case text-xs">({m.adminWorkflowIconDesignerUsedForMapFiltering()})</span>
					{/if}
				</h3>

				{#if sortedStages.length === 0}
					<p class="py-4 text-center text-sm text-muted-foreground">
						{m.adminWorkflowIconDesignerNoStages()}
					</p>
				{:else}
					<div class="space-y-2">
						{#each sortedStages as stage}
							{@const typeConf = stageTypeConfig[stage.stage_type] || stageTypeConfig.intermediate}
							{@const stageIcon = stageIconConfigs.get(stage.id)}
							<div class="flex items-center gap-3 rounded-lg border p-3">
								<!-- Icon preview -->
								<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted/50">
									{#if stageIcon?.svgContent}
										{@html renderIconPreview(stageIcon, 24)}
									{:else if workflowIconConfig?.svgContent}
										<div class="opacity-30">
											{@html renderIconPreview(workflowIconConfig, 20)}
										</div>
									{:else}
										<svelte:component this={typeConf.icon} class="h-4 w-4 text-muted-foreground" />
									{/if}
								</div>

								<!-- Stage info -->
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<span class="text-sm font-medium">{stage.stage_name}</span>
										<Badge variant="secondary" class="text-xs {typeConf.color}">
											{typeConf.label}
										</Badge>
									</div>
									<div class="text-xs text-muted-foreground">
										{#if stageIcon?.svgContent}
											{m.adminWorkflowIconDesignerCustomIcon()}
										{:else}
											{m.adminWorkflowIconDesignerUsesDefault()}
										{/if}
									</div>
								</div>

								<!-- Actions -->
								<div class="flex gap-2">
									<Button variant="ghost" size="sm" onclick={() => editStageIcon(stage.id)}>
										<Pencil class="mr-1 h-3 w-3" />
										{stageIcon?.svgContent ? (m.adminWorkflowIconDesignerEdit()) : (m.adminWorkflowIconDesignerSet())}
									</Button>
									{#if stageIcon?.svgContent}
										<Button variant="ghost" size="sm" onclick={() => clearStageIcon(stage.id)}>
											<Trash2 class="h-3 w-3" />
										</Button>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Filter Value Icons (only when filterMode='field') -->
			{#if filterMode === 'field' && filterFieldOptions.length > 0}
				<Separator />

				<div class="space-y-3">
					<h3 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
						{m.adminWorkflowIconDesignerFilterValueIconsHeading()}
						<span class="ml-1 font-normal normal-case">({m.adminWorkflowIconDesignerFilterValueCount({ count: filterFieldOptions.length })})</span>
					</h3>
					<p class="text-xs text-muted-foreground">
						{m.adminWorkflowIconDesignerFilterValueIconsHint()}
					</p>

					<div class="space-y-2">
						{#each filterFieldOptions as value}
							{@const valueIcon = localFilterValueIcons[value]}
							<div class="flex items-center gap-3 rounded-lg border p-3">
								<!-- Icon preview -->
								<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted/50">
									{#if valueIcon?.svgContent}
										{@html renderIconPreview(valueIcon, 24)}
									{:else if workflowIconConfig?.svgContent}
										<div class="opacity-30">
											{@html renderIconPreview(workflowIconConfig, 20)}
										</div>
									{:else}
										<div class="h-3 w-3 rounded-full bg-muted-foreground/30"></div>
									{/if}
								</div>

								<!-- Value info -->
								<div class="min-w-0 flex-1">
									<div class="text-sm font-medium">{value}</div>
									<div class="text-xs text-muted-foreground">
										{#if valueIcon?.svgContent}
											{m.adminWorkflowIconDesignerCustomIcon()}
										{:else}
											{m.adminWorkflowIconDesignerUsesDefault()}
										{/if}
									</div>
								</div>

								<!-- Actions -->
								<div class="flex gap-2">
									<Button variant="ghost" size="sm" onclick={() => editFilterValueIcon(value)}>
										<Pencil class="mr-1 h-3 w-3" />
										{valueIcon?.svgContent ? (m.adminWorkflowIconDesignerEdit()) : (m.adminWorkflowIconDesignerSet())}
									</Button>
									{#if valueIcon?.svgContent}
										<Button variant="ghost" size="sm" onclick={() => clearFilterValueIcon(value)}>
											<Trash2 class="h-3 w-3" />
										</Button>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<!-- Footer -->
		<div class="flex justify-end border-t pt-4">
			{#if onCancel}
				<Button variant="outline" onclick={onCancel}>{m.adminWorkflowIconDesignerDone()}</Button>
			{/if}
		</div>
	</div>
{/if}
