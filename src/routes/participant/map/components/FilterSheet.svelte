<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Switch } from '$lib/components/ui/switch';
	import { Separator } from '$lib/components/ui/separator';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import {
		ChevronDown,
		ChevronRight,
		Sparkles,
		Sliders,
		Plus,
		Bookmark,
		Pencil,
		Trash2,
		Check,
		X
	} from '@lucide/svelte';
	import { isFeatureEnabled } from '$lib/participant-state/enabled-features.svelte';
	import { createPersistedTab } from '$lib/participant-state/ui-state.svelte';
	import * as m from '$lib/paraglide/messages';
	import type { FilterClause, ToolConfigRecord, ViewDefinition } from '$lib/participant-state/types';
	import FilterBuilder from './view-builder/FilterBuilder.svelte';
	import type { BuilderContext } from './view-builder/types';

	interface Marker {
		id: string;
		title: string;
		category_id: string;
		location?: { lat: number; lon: number };
		expand?: {
			category_id?: {
				name: string;
				icon_config?: any;
			};
		};
	}

	interface IconConfig {
		type: 'svg';
		svgContent: string;
		style?: {
			size?: number;
			color?: string;
			shape?: 'none' | 'pin';
		};
	}

	interface WorkflowInstance {
		id: string;
		status: string;
		workflow_id: string;
		current_stage_id?: string;
		centroid?: { lat: number; lon: number } | null;
		expand?: {
			workflow_id?: {
				name: string;
				marker_color?: string;
				icon_config?: IconConfig;
			};
		};
	}

	interface TagMapping {
		tagType: string;
		fieldId: string | null;
		config: Record<string, unknown>;
	}

	export interface FieldTag {
		id: string;
		workflow_id: string;
		tag_mappings: TagMapping[];
	}

	interface FieldValue {
		id: string;
		instance_id: string;
		field_key: string;
		value: string;
	}

	interface WorkflowStageInfo {
		id: string;
		workflow_id: string;
		stage_name?: string;
		visual_config?: {
			icon_config?: IconConfig;
			[key: string]: unknown;
		};
	}

	interface WorkflowDef {
		id: string;
		name: string;
		workflow_type?: 'incident' | 'survey';
		filter_value_icons?: Record<string, IconConfig>;
	}

	function splitMultiValue(value: string): string[] {
		if (value.startsWith('[')) {
			try { return JSON.parse(value); } catch { /* fall through */ }
		}
		return [value];
	}

	function renderIcon(config: IconConfig | null | undefined, size: number = 16): string | null {
		if (!config?.svgContent) return null;
		const color = config.style?.color || '#333';
		return config.svgContent.replace(
			/(<svg[^>]*)(>)/,
			`$1 style="width: ${size}px; height: ${size}px; fill: ${color};"$2`
		);
	}

	interface Props {
		open: boolean;
		markers: Marker[];
		workflowInstances: WorkflowInstance[];
		visibleCategoryIds: string[];
		visibleWorkflowIds: string[];
		fieldTags?: FieldTag[];
		fieldValues?: FieldValue[];
		visibleTagValues?: Map<string, Set<string>>;
		workflowStages?: WorkflowStageInfo[];
		workflows?: WorkflowDef[];
		onCategoryToggle: (categoryId: string, visible: boolean) => void;
		onWorkflowToggle: (workflowId: string, visible: boolean) => void;
		onTagValueToggle?: (workflowId: string, tagValue: string, visible: boolean) => void;
		uncluster?: boolean;
		onUnclusterToggle?: (next: boolean) => void;
		unclusterCap?: number;
		onUnclusterCapChange?: (next: number) => void;
		unclusterStats?: { rendered: number; total: number };
		/** Clauses of the active view (empty = Default, no view). */
		advancedClauses?: FilterClause[];
		/** Context (workflows / stages / fields / creators) for the builder UI. */
		builderCtx?: BuilderContext;
		onAdvancedClausesChange?: (next: FilterClause[]) => void;
		/** Saved views (from participant_tool_configs, tool_key = filter.saved_views). */
		savedViews?: ToolConfigRecord<ViewDefinition>[];
		activeSavedViewId?: string | null;
		onSavedViewToggle?: (view: ToolConfigRecord<ViewDefinition>, on: boolean) => void;
		onSavedViewSave?: (name: string) => void | Promise<void>;
		onSavedViewRename?: (id: string, name: string) => void | Promise<void>;
		onSavedViewDelete?: (id: string) => void | Promise<void>;
		onClearActiveView?: () => void;
		/**
		 * Admin-curated filter presets surfaced for the participant to load.
		 * Loading one copies its config into a new user-owned saved view --
		 * the admin entry itself remains read-only in the UI.
		 */
		adminPresets?: { id: string; name: string; config: ViewDefinition }[];
		onAdminPresetLoad?: (preset: { name: string; config: ViewDefinition }) => void | Promise<void>;
		/** Called when the user taps the "Manage tabs" button in the header. */
		onManageTabs?: () => void;
	}

	let {
		open = $bindable(),
		markers = [],
		workflowInstances = [],
		visibleCategoryIds = [],
		visibleWorkflowIds = [],
		fieldTags = [],
		fieldValues = [],
		visibleTagValues = new Map(),
		workflowStages = [],
		workflows = [],
		onCategoryToggle,
		onWorkflowToggle,
		onTagValueToggle,
		uncluster = false,
		onUnclusterToggle,
		unclusterCap = 500,
		onUnclusterCapChange,
		unclusterStats,
		advancedClauses = [],
		builderCtx,
		onAdvancedClausesChange,
		savedViews = [],
		activeSavedViewId = null,
		onSavedViewToggle,
		onSavedViewSave,
		onSavedViewRename,
		onSavedViewDelete,
		onClearActiveView,
		adminPresets = [],
		onAdminPresetLoad,
		onManageTabs
	}: Props = $props();

	const workflowTypeById = $derived(
		new Map(workflows.map((w) => [w.id, w.workflow_type ?? 'incident']))
	);

	const showViews = $derived(isFeatureEnabled('filter.field_filters'));
	const showCluster = $derived(isFeatureEnabled('tools.cluster'));
	const hasAnyPowerTab = $derived(showViews || showCluster);

	const tab = createPersistedTab('filter', 'simple');
	$effect(() => {
		if (tab.value === 'views' && !showViews) tab.value = 'simple';
		if (tab.value === 'cluster' && !showCluster) tab.value = 'simple';
	});

	const activeView = $derived(
		showViews && activeSavedViewId
			? savedViews.find((v) => v.id === activeSavedViewId) ?? null
			: null
	);

	// New-view creation UI: "+ New view" reveals an inline name input.
	let creatingNew = $state(false);
	let newViewName = $state('');
	let editingId = $state<string | null>(null);
	let editingName = $state('');

	async function commitNew() {
		const trimmed = newViewName.trim();
		if (!trimmed) return;
		await onSavedViewSave?.(trimmed);
		newViewName = '';
		creatingNew = false;
	}
	function cancelNew() { newViewName = ''; creatingNew = false; }
	function startRename(view: ToolConfigRecord<ViewDefinition>) {
		editingId = view.id;
		editingName = view.name;
	}
	async function commitRename() {
		if (!editingId) return;
		const trimmed = editingName.trim();
		if (trimmed) await onSavedViewRename?.(editingId, trimmed);
		editingId = null;
		editingName = '';
	}
	function cancelRename() { editingId = null; editingName = ''; }

	function handleCapInput(event: Event) {
		const raw = (event.target as HTMLInputElement).value;
		const parsed = parseInt(raw, 10);
		if (!Number.isFinite(parsed) || parsed <= 0) return;
		onUnclusterCapChange?.(parsed);
	}

	let expandedWorkflows = $state<Set<string>>(new Set());
	function toggleExpanded(workflowId: string) {
		const updated = new Set(expandedWorkflows);
		if (updated.has(workflowId)) updated.delete(workflowId);
		else updated.add(workflowId);
		expandedWorkflows = updated;
	}

	const markersByCategory = $derived.by(() => {
		const grouped = new Map<string, { categoryId: string; category: any; count: number }>();
		for (const marker of markers) {
			const catId = marker.category_id;
			if (!catId) continue;
			const category = marker.expand?.category_id;
			if (!grouped.has(catId)) {
				grouped.set(catId, { categoryId: catId, category: category || { name: 'Unknown' }, count: 0 });
			}
			grouped.get(catId)!.count++;
		}
		return Array.from(grouped.values());
	});

	const instancesByWorkflow = $derived.by(() => {
		const grouped = new Map<string, { workflowId: string; workflow: any; count: number }>();
		for (const instance of workflowInstances) {
			const wfId = instance.workflow_id;
			if (!wfId) continue;
			const workflow = instance.expand?.workflow_id;
			if (!grouped.has(wfId)) {
				grouped.set(wfId, { workflowId: wfId, workflow: workflow || { name: 'Unknown' }, count: 0 });
			}
			grouped.get(wfId)!.count++;
		}
		const orderIndex = new Map(workflows.map((w, i) => [w.id, i]));
		return Array.from(grouped.values())
			.filter((g) => workflowTypeById.get(g.workflowId) !== 'survey')
			.sort((a, b) => {
				const ai = orderIndex.get(a.workflowId) ?? Number.MAX_SAFE_INTEGER;
				const bi = orderIndex.get(b.workflowId) ?? Number.MAX_SAFE_INTEGER;
				return ai - bi;
			});
	});

	const filterableData = $derived.by(() => {
		const result = new Map<string, {
			mode: 'stage' | 'field';
			valueCounts: { value: string; count: number; label: string; icon?: IconConfig }[];
		}>();
		for (const ft of fieldTags) {
			const mappings = (ft.tag_mappings || []) as TagMapping[];
			const filterable = mappings.find((mp) => mp.tagType === 'filterable');
			if (!filterable) continue;
			const wfId = ft.workflow_id;
			const filterBy = (filterable.config?.filterBy as string) || 'field';
			const wfDef = workflows.find((w) => w.id === wfId);

			if (filterBy === 'stage') {
				const wfInstances = workflowInstances.filter((i) => i.workflow_id === wfId);
				const countMap = new Map<string, number>();
				for (const inst of wfInstances) {
					if (inst.current_stage_id) {
						countMap.set(inst.current_stage_id, (countMap.get(inst.current_stage_id) ?? 0) + 1);
					}
				}
				if (countMap.size > 0) {
					const valueCounts = Array.from(countMap.entries()).map(([stageId, count]) => {
						const stage = workflowStages.find((s) => s.id === stageId);
						return { value: stageId, count, label: stage?.stage_name ?? stageId, icon: stage?.visual_config?.icon_config };
					}).sort((a, b) => a.label.localeCompare(b.label));
					result.set(wfId, { mode: 'stage', valueCounts });
				}
			} else if (filterable.fieldId) {
				const wfInstances = workflowInstances.filter((i) => i.workflow_id === wfId);
				const instanceIds = new Set(wfInstances.map((i) => i.id));
				const filterValueIcons = (wfDef?.filter_value_icons ?? {}) as Record<string, IconConfig>;
				const countMap = new Map<string, number>();
				for (const fv of fieldValues) {
					if (fv.field_key === filterable.fieldId && fv.value && instanceIds.has(fv.instance_id)) {
						for (const v of splitMultiValue(fv.value)) {
							countMap.set(v, (countMap.get(v) ?? 0) + 1);
						}
					}
				}
				if (countMap.size > 0) {
					const valueCounts = Array.from(countMap.entries())
						.map(([value, count]) => ({ value, count, label: value, icon: filterValueIcons[value] }))
						.sort((a, b) => a.label.localeCompare(b.label));
					result.set(wfId, { mode: 'field', valueCounts });
				}
			}
		}
		return result;
	});

	function handleMasterWorkflowToggle(workflowId: string, visible: boolean) {
		const data = filterableData.get(workflowId);
		if (data && onTagValueToggle) {
			for (const { value } of data.valueCounts) {
				onTagValueToggle(workflowId, value, visible);
			}
		} else {
			onWorkflowToggle(workflowId, visible);
		}
	}
</script>

{#snippet simpleBody()}
	<div class="space-y-6 py-6 overflow-y-auto max-h-[calc(100vh-14rem)]">
			{#if activeView}
				<!-- While a view is active it masters the whole app; these Simple
				     toggles are ignored. Surface that so the UI isn't lying. -->
				<div class="rounded-md border border-primary/40 bg-primary/5 p-3 text-xs">
					<div class="mb-2 font-medium">
						{(m.participantFilterSheetViewOverrideTitle?.({ name: activeView.name }) ?? `"${activeView.name}" is active`)}
					</div>
					<div class="mb-2 text-muted-foreground">
						{m.participantFilterSheetViewOverrideDescription?.() ?? 'This view replaces the toggles below — they do nothing while it is on.'}
					</div>
					<Button variant="outline" size="sm" class="h-7 w-full" onclick={() => onClearActiveView?.()}>
						{m.participantFilterSheetDeactivateView?.() ?? 'Turn view off'}
					</Button>
				</div>
			{/if}

			{#if instancesByWorkflow.length > 0}
				<div>
					<h4 class="mb-3 text-sm font-medium">{m.participantFilterSheetWorkflowInstances?.() ?? 'Workflow Instances'}</h4>
					<div class="space-y-2">
						{#each instancesByWorkflow as { workflowId, workflow, count }}
							{@const filterable = filterableData.get(workflowId)}
							{@const isExpanded = expandedWorkflows.has(workflowId)}
							<div class="rounded-lg border">
								<div class="flex items-center justify-between p-3">
									<div class="flex items-center gap-2">
										{#if filterable}
											<button
												class="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-accent"
												onclick={() => toggleExpanded(workflowId)}
											>
												{#if isExpanded}
													<ChevronDown class="h-3.5 w-3.5" />
												{:else}
													<ChevronRight class="h-3.5 w-3.5" />
												{/if}
											</button>
										{/if}
										{#if workflow.icon_config?.svgContent}
											<div class="flex h-5 w-5 shrink-0 items-center justify-center">
												{@html renderIcon(workflow.icon_config, 16)}
											</div>
										{:else}
											<div
												class="h-3 w-3 rounded-full"
												style:background-color={workflow.marker_color || '#6b7280'}
											></div>
										{/if}
										<span class="text-sm font-medium">{workflow.name}</span>
										<Badge variant="secondary" class="text-xs">{count}</Badge>
									</div>
									<Switch
										checked={visibleWorkflowIds.includes(workflowId)}
										disabled={!!activeView}
										onCheckedChange={(checked) => handleMasterWorkflowToggle(workflowId, checked)}
									/>
								</div>

								{#if filterable && isExpanded}
									<div class="border-t">
										{#each filterable.valueCounts as { value, count: valueCount, label, icon }}
											{@const visibleSet = visibleTagValues.get(workflowId)}
											{@const isVisible = visibleSet ? visibleSet.has(value) : true}
											<div class="flex items-center justify-between p-3 pl-10" style="zoom: 0.8;">
												<div class="flex items-center gap-2">
													{#if icon?.svgContent}
														<div class="flex h-5 w-5 shrink-0 items-center justify-center">
															{@html renderIcon(icon, 16)}
														</div>
													{:else}
														<div class="h-3 w-3 rounded-full shrink-0 bg-muted-foreground/30"></div>
													{/if}
													<span class="text-sm font-medium">{label}</span>
													<Badge variant="secondary" class="text-xs">{valueCount}</Badge>
												</div>
												<Switch
													checked={isVisible}
													disabled={!!activeView}
													onCheckedChange={(checked) => onTagValueToggle?.(workflowId, value, checked)}
												/>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}

			{#if instancesByWorkflow.length > 0 && markersByCategory.length > 0}
				<Separator />
			{/if}

			{#if markersByCategory.length > 0}
				<div>
					<h4 class="mb-3 text-sm font-medium">{m.participantFilterSheetMarkers?.() ?? 'Markers'}</h4>
					<div class="space-y-2">
						{#each markersByCategory as { categoryId, category, count }}
							<div class="flex items-center justify-between rounded-lg border p-3">
								<div class="flex items-center gap-2">
									{#if category.icon_config?.svgContent}
										<div class="flex h-5 w-5 shrink-0 items-center justify-center">
											{@html renderIcon(category.icon_config, 16)}
										</div>
									{:else}
										<div class="h-3 w-3 rounded-full bg-primary"></div>
									{/if}
									<span class="text-sm font-medium">{category.name}</span>
									<Badge variant="secondary" class="text-xs">{count}</Badge>
								</div>
								<Switch
									checked={visibleCategoryIds.includes(categoryId)}
									disabled={!!activeView}
									onCheckedChange={(checked) => onCategoryToggle(categoryId, checked)}
								/>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			{#if instancesByWorkflow.length === 0 && markersByCategory.length === 0}
				<div class="py-8 text-center text-sm text-muted-foreground">
					{m.participantFilterSheetNoContent?.() ?? 'No map content available'}
				</div>
			{/if}
	</div>
{/snippet}

{#snippet viewsBody()}
	<div class="space-y-5 px-1 py-6">
		<!-- Views switcher: Default + each saved view. Exactly one active. -->
		<div class="space-y-2">
			<h4 class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				{m.participantFilterSheetViewsHeader?.() ?? 'View'}
			</h4>

			<button
				class="flex w-full items-center gap-2 rounded-md border p-3 text-left transition-colors hover:bg-accent/50 {activeSavedViewId === null ? 'border-primary bg-primary/5' : ''}"
				onclick={() => { if (activeSavedViewId !== null) onClearActiveView?.(); }}
			>
				<div class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 {activeSavedViewId === null ? 'border-primary bg-primary' : 'border-muted-foreground/50'}">
					{#if activeSavedViewId === null}
						<div class="h-1.5 w-1.5 rounded-full bg-primary-foreground"></div>
					{/if}
				</div>
				<span class="flex-1 truncate text-sm font-medium">
					{m.participantFilterSheetDefaultView?.() ?? 'Default (Simple filter)'}
				</span>
			</button>

			{#each savedViews as view (view.id)}
				{@const isActive = activeSavedViewId === view.id}
				<div class="flex items-center gap-2 rounded-md border p-2 {isActive ? 'border-primary bg-primary/5' : ''}">
					{#if editingId === view.id}
						<Input
							type="text"
							class="h-7 flex-1"
							bind:value={editingName}
							onkeydown={(e) => {
								if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
								else if (e.key === 'Escape') cancelRename();
							}}
						/>
						<Button size="icon" variant="ghost" class="h-7 w-7" onclick={commitRename}>
							<Check class="h-3.5 w-3.5" />
						</Button>
						<Button size="icon" variant="ghost" class="h-7 w-7" onclick={cancelRename}>
							<X class="h-3.5 w-3.5" />
						</Button>
					{:else}
						<button
							class="flex min-w-0 flex-1 items-center gap-2 text-left"
							onclick={() => onSavedViewToggle?.(view, !isActive)}
						>
							<div class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 {isActive ? 'border-primary bg-primary' : 'border-muted-foreground/50'}">
								{#if isActive}
									<div class="h-1.5 w-1.5 rounded-full bg-primary-foreground"></div>
								{/if}
							</div>
							<Bookmark class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							<span class="truncate text-sm font-medium">{view.name}</span>
						</button>
						<Button size="icon" variant="ghost" class="h-7 w-7 shrink-0" onclick={() => startRename(view)}
							title={m.participantSavedViewsRename?.() ?? 'Rename'}>
							<Pencil class="h-3.5 w-3.5" />
						</Button>
						<Button size="icon" variant="ghost" class="h-7 w-7 shrink-0" onclick={() => onSavedViewDelete?.(view.id)}
							title={m.participantSavedViewsDelete?.() ?? 'Delete'}>
							<Trash2 class="h-3.5 w-3.5" />
						</Button>
					{/if}
				</div>
			{/each}

			{#if creatingNew}
				<div class="flex items-center gap-2">
					<Input
						type="text"
						class="h-8 flex-1"
						placeholder={m.participantSavedViewsNamePlaceholder?.() ?? 'Name this view…'}
						bind:value={newViewName}
						autofocus
						onkeydown={(e) => {
							if (e.key === 'Enter') { e.preventDefault(); commitNew(); }
							else if (e.key === 'Escape') cancelNew();
						}}
					/>
					<Button size="sm" onclick={commitNew} disabled={!newViewName.trim()}>
						{m.participantSavedViewsSave?.() ?? 'Save'}
					</Button>
					<Button size="icon" variant="ghost" class="h-8 w-8" onclick={cancelNew}>
						<X class="h-4 w-4" />
					</Button>
				</div>
			{:else}
				<Button variant="outline" size="sm" class="w-full justify-start"
					onclick={() => { creatingNew = true; newViewName = ''; }}>
					<Plus class="mr-2 h-4 w-4" />
					{m.participantFilterSheetNewView?.() ?? 'New view'}
				</Button>
			{/if}

			{#if adminPresets.length > 0}
				<Separator class="my-2" />
				<div class="flex flex-col gap-1">
					<div class="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{m.participantFilterSheetAdminPresetsHeader?.() ?? 'From the project'}
					</div>
					{#each adminPresets as preset (preset.id)}
						<div class="flex items-center gap-2 rounded-md border border-dashed p-2">
							<Bookmark class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							<span class="min-w-0 flex-1 truncate text-sm">{preset.name}</span>
							<Button
								size="sm"
								variant="outline"
								class="h-7 shrink-0"
								onclick={() => onAdminPresetLoad?.({ name: preset.name, config: preset.config })}
							>
								{m.participantFilterSheetAdminPresetsLoad?.() ?? 'Load'}
							</Button>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		{#if activeView && builderCtx}
			<Separator />
			<FilterBuilder
				clauses={advancedClauses}
				ctx={builderCtx}
				onChange={(next) => onAdvancedClausesChange?.(next)}
			/>
		{/if}
	</div>
{/snippet}

{#snippet clusterBody()}
	<div class="space-y-3 px-1 py-6">
		<div class="space-y-3 rounded-lg border p-3">
			<div class="flex items-center justify-between">
				<div class="min-w-0 flex-1 pr-3">
					<div class="text-sm font-medium">{m.participantFilterSheetUncluster?.() ?? 'Uncluster'}</div>
					<div class="text-xs text-muted-foreground">
						{m.participantFilterSheetUnclusterDescription?.() ?? 'Show individual markers in the current view'}
					</div>
				</div>
				<Switch checked={uncluster} onCheckedChange={(checked) => onUnclusterToggle?.(checked)} />
			</div>

			{#if uncluster}
				<div class="flex items-center justify-between gap-3">
					<label for="uncluster-cap" class="text-xs font-medium">{m.participantFilterSheetUpTo?.() ?? 'Up to'}</label>
					<Input id="uncluster-cap" type="number" min="1" step="50"
						class="h-8 w-24 text-right" value={unclusterCap} onchange={handleCapInput} />
				</div>
				{#if unclusterStats && unclusterStats.total > 0}
					<div class="text-xs text-muted-foreground">
						{#if unclusterStats.rendered > 0}
							{(m.participantFilterSheetShowingIndividually?.({ count: unclusterStats.total }) ?? `Showing ${unclusterStats.total} individually`)}
						{:else}
							{(m.participantFilterSheetTooManyClustered?.({ count: unclusterStats.total }) ?? `${unclusterStats.total} in view — too many, still clustered`)}
						{/if}
					</div>
				{/if}
			{/if}
		</div>
	</div>
{/snippet}

<Sheet.Root bind:open>
	<Sheet.ContentNoOverlay side="left" class="w-80">
		<Sheet.Header class="relative pr-10">
			<Sheet.Title>{m.participantFilterSheetTitle?.() ?? 'Map Content'}</Sheet.Title>
			<Sheet.Description>{m.participantFilterSheetDescription?.() ?? 'Show or hide items on the map'}</Sheet.Description>
			{#if onManageTabs}
				<Button variant="ghost" size="icon" class="absolute right-1 top-1 h-7 w-7"
					title="Manage tabs" onclick={onManageTabs}>
					<Sparkles class="h-4 w-4" />
				</Button>
			{/if}
		</Sheet.Header>

		{#if hasAnyPowerTab}
			<Tabs.Root bind:value={tab.value} class="mt-2 flex flex-1 flex-col overflow-hidden">
				<Tabs.List class="w-full shrink-0">
					<Tabs.Trigger value="simple">
						<Sliders class="h-4 w-4" />
						<span>{m.participantFilterSheetTabSimple?.() ?? 'Simple'}</span>
					</Tabs.Trigger>
					{#if showViews}
						<Tabs.Trigger value="views">
							<Sparkles class="h-4 w-4" />
							<span>{m.participantFilterSheetTabViews?.() ?? 'Views'}</span>
						</Tabs.Trigger>
					{/if}
					{#if showCluster}
						<Tabs.Trigger value="cluster">
							<Sparkles class="h-4 w-4" />
							<span>{m.participantFilterSheetTabCluster?.() ?? 'Cluster'}</span>
						</Tabs.Trigger>
					{/if}
				</Tabs.List>
				<Tabs.Content value="simple" class="overflow-y-auto">
					{@render simpleBody()}
				</Tabs.Content>
				{#if showViews}
					<Tabs.Content value="views" class="overflow-y-auto">
						{@render viewsBody()}
					</Tabs.Content>
				{/if}
				{#if showCluster}
					<Tabs.Content value="cluster" class="overflow-y-auto">
						{@render clusterBody()}
					</Tabs.Content>
				{/if}
			</Tabs.Root>
		{:else}
			{@render simpleBody()}
		{/if}
	</Sheet.ContentNoOverlay>
</Sheet.Root>
