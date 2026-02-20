<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { Switch } from '$lib/components/ui/switch';
	import { Separator } from '$lib/components/ui/separator';
	import { Badge } from '$lib/components/ui/badge';
	import { ChevronDown, ChevronRight } from 'lucide-svelte';

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
		location?: { lat: number; lon: number };
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

	interface FieldTag {
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
		stage_name: string;
		visual_config?: {
			icon_config?: IconConfig;
			[key: string]: unknown;
		};
	}

	interface WorkflowDef {
		id: string;
		name: string;
		filter_value_icons?: Record<string, IconConfig>;
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
		onTagValueToggle
	}: Props = $props();

	// Track which workflow sub-sections are expanded
	let expandedWorkflows = $state<Set<string>>(new Set());

	function toggleExpanded(workflowId: string) {
		const updated = new Set(expandedWorkflows);
		if (updated.has(workflowId)) {
			updated.delete(workflowId);
		} else {
			updated.add(workflowId);
		}
		expandedWorkflows = updated;
	}

	// Group markers by category for display
	const markersByCategory = $derived.by(() => {
		const grouped = new Map<string, { categoryId: string; category: any; count: number }>();

		for (const marker of markers) {
			const catId = marker.category_id;
			if (!catId) continue;

			const category = marker.expand?.category_id;

			if (!grouped.has(catId)) {
				grouped.set(catId, {
					categoryId: catId,
					category: category || { name: 'Unknown' },
					count: 0
				});
			}
			grouped.get(catId)!.count++;
		}

		return Array.from(grouped.values());
	});

	// Group instances by workflow for display
	const instancesByWorkflow = $derived.by(() => {
		const grouped = new Map<string, { workflowId: string; workflow: any; count: number }>();

		for (const instance of workflowInstances) {
			const wfId = instance.workflow_id;
			if (!wfId) continue;

			const workflow = instance.expand?.workflow_id;

			if (!grouped.has(wfId)) {
				grouped.set(wfId, {
					workflowId: wfId,
					workflow: workflow || { name: 'Unknown' },
					count: 0
				});
			}
			grouped.get(wfId)!.count++;
		}

		return Array.from(grouped.values());
	});

	/**
	 * For each workflow, get the filterable data supporting both stage and field modes.
	 * Outputs a uniform shape: { value, count, label, icon? }[]
	 */
	const filterableData = $derived.by(() => {
		const result = new Map<string, {
			mode: 'stage' | 'field';
			valueCounts: { value: string; count: number; label: string; icon?: IconConfig }[];
		}>();

		for (const ft of fieldTags) {
			const mappings = (ft.tag_mappings || []) as TagMapping[];
			const filterable = mappings.find((m) => m.tagType === 'filterable');
			if (!filterable) continue;

			const wfId = ft.workflow_id;
			const filterBy = (filterable.config?.filterBy as string) || 'field';
			const wfDef = workflows.find((w) => w.id === wfId);

			if (filterBy === 'stage') {
				// Stage mode: count instances per stage, use stage name as label
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
						return {
							value: stageId,
							count,
							label: stage?.stage_name ?? stageId,
							icon: stage?.visual_config?.icon_config
						};
					}).sort((a, b) => a.label.localeCompare(b.label));

					result.set(wfId, { mode: 'stage', valueCounts });
				}
			} else if (filterable.fieldId) {
				// Field mode: count instances per field value
				const wfInstances = workflowInstances.filter((i) => i.workflow_id === wfId);
				const instanceIds = new Set(wfInstances.map((i) => i.id));
				const filterValueIcons = (wfDef?.filter_value_icons ?? {}) as Record<string, IconConfig>;

				const countMap = new Map<string, number>();
				for (const fv of fieldValues) {
					if (fv.field_key === filterable.fieldId && fv.value && instanceIds.has(fv.instance_id)) {
						countMap.set(fv.value, (countMap.get(fv.value) ?? 0) + 1);
					}
				}

				if (countMap.size > 0) {
					const valueCounts = Array.from(countMap.entries())
						.map(([value, count]) => ({
							value,
							count,
							label: value,
							icon: filterValueIcons[value]
						}))
						.sort((a, b) => a.label.localeCompare(b.label));

					result.set(wfId, { mode: 'field', valueCounts });
				}
			}
		}

		return result;
	});

	/**
	 * Handle master workflow toggle: when toggling off, hide all sub-values too.
	 * When toggling on, show all sub-values.
	 */
	function handleMasterWorkflowToggle(workflowId: string, visible: boolean) {
		onWorkflowToggle(workflowId, visible);

		// Also toggle all tag values
		const data = filterableData.get(workflowId);
		if (data && onTagValueToggle) {
			for (const { value } of data.valueCounts) {
				onTagValueToggle(workflowId, value, visible);
			}
		}
	}
</script>

<Sheet.Root bind:open>
	<Sheet.ContentNoOverlay side="left" class="w-80">
		<Sheet.Header>
			<Sheet.Title>Map Content</Sheet.Title>
			<Sheet.Description>Show or hide items on the map</Sheet.Description>
		</Sheet.Header>

		<div class="space-y-6 py-6 overflow-y-auto max-h-[calc(100vh-12rem)]">
			<!-- Workflow Instances grouped by Workflow -->
			{#if instancesByWorkflow.length > 0}
				<div>
					<h4 class="mb-3 text-sm font-medium">Workflow Instances</h4>
					<div class="space-y-2">
						{#each instancesByWorkflow as { workflowId, workflow, count }}
							{@const filterable = filterableData.get(workflowId)}
							{@const isExpanded = expandedWorkflows.has(workflowId)}
							<div class="rounded-lg border">
								<!-- Parent row -->
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
										onCheckedChange={(checked) => handleMasterWorkflowToggle(workflowId, checked)}
									/>
								</div>

								<!-- Sub-rows for filterable values (stage or field mode) -->
								{#if filterable && isExpanded}
									<div class="border-t">
										{#each filterable.valueCounts as { value, count: valueCount, label, icon }}
											{@const visibleSet = visibleTagValues.get(workflowId)}
											{@const isVisible = visibleSet ? visibleSet.has(value) : true}
											<div class="flex items-center justify-between px-3 py-2 pl-10">
												<div class="flex items-center gap-2">
													{#if icon?.svgContent}
														<div class="flex h-4 w-4 shrink-0 items-center justify-center">
															{@html renderIcon(icon, 14)}
														</div>
													{:else}
														<div class="h-2.5 w-2.5 rounded-full shrink-0 bg-muted-foreground/30"></div>
													{/if}
													<span class="text-xs">{label}</span>
													<Badge variant="outline" class="text-[10px] px-1 py-0">{valueCount}</Badge>
												</div>
												<Switch
													class="scale-75"
													checked={isVisible}
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

			<!-- Markers grouped by Category -->
			{#if markersByCategory.length > 0}
				<div>
					<h4 class="mb-3 text-sm font-medium">Markers</h4>
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
									onCheckedChange={(checked) => onCategoryToggle(categoryId, checked)}
								/>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			{#if instancesByWorkflow.length === 0 && markersByCategory.length === 0}
				<div class="py-8 text-center text-sm text-muted-foreground">
					No map content available
				</div>
			{/if}
		</div>
	</Sheet.ContentNoOverlay>
</Sheet.Root>
