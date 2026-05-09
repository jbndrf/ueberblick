<script lang="ts" module>
	// Module-scoped so the scroll position survives unmount/remount within the
	// same session. Cleared on full reload (intentional).
	let savedScrollTop = 0;
</script>

<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { Badge } from '$lib/components/ui/badge';
	import * as m from '$lib/paraglide/messages';
	import { instanceLabel } from '$lib/utils/instance-label';
	import { toolUsageLabel, type ToolUsageLabelStrings } from '$lib/utils/tool-usage-label';

	interface Instance {
		id: string;
		workflow_id: string;
		updated?: string;
		created?: string;
		current_stage_id?: string | null;
		centroid?: { lat: number; lon: number } | null;
	}

	interface IconConfig {
		type?: 'svg';
		svgContent?: string;
		style?: { size?: number; color?: string; shape?: 'none' | 'pin' };
	}

	interface Workflow {
		id: string;
		name: string;
		workflow_type: 'incident' | 'survey';
		marker_color?: string;
		icon_config?: IconConfig;
	}

	interface FieldValue {
		instance_id: string;
		field_key: string;
		value: string;
	}

	interface FormField {
		id: string;
		field_label?: string;
		field_type?: string;
		field_order?: number;
		page?: number;
		row_index?: number;
		column_position?: 'left' | 'full' | 'right';
	}

	interface LatestToolUsage {
		metadata: Record<string, unknown>;
		at: string;
	}

	interface Stage {
		id: string;
		stage_name?: string;
	}

	interface Props {
		open: boolean;
		instances: Instance[];
		workflows: Workflow[];
		fieldValues?: FieldValue[];
		/** Pre-resolved per-workflow form fields. */
		formFieldsByWorkflow?: Map<string, FormField[]>;
		/** Most recent tool_usage record per instance, keyed by instance id. */
		latestToolUsageByInstance?: Map<string, LatestToolUsage>;
		/** Per-instance icon (matches MapCanvas fallback: filter value -> stage -> workflow). */
		iconByInstance?: Map<string, IconConfig>;
		stages?: Stage[];
		/** If set, only show instances of this workflow. */
		workflowFilter?: string | null;
		onInstanceTap: (instance: Instance, workflow: Workflow) => void;
	}

	let {
		open = $bindable(),
		instances,
		workflows,
		fieldValues = [],
		formFieldsByWorkflow = new Map(),
		latestToolUsageByInstance = new Map(),
		iconByInstance = new Map(),
		stages = [],
		workflowFilter = null,
		onInstanceTap
	}: Props = $props();

	const labelStrings: ToolUsageLabelStrings = $derived({
		action: m.participantWorkflowInstanceDetailEntryAction?.() ?? 'Action',
		created: m.participantWorkflowInstanceDetailEntryCreated?.() ?? 'Created',
		dataRecorded: m.participantWorkflowInstanceDetailEntryDataRecorded?.() ?? 'Data recorded',
		fieldFallback: m.participantWorkflowInstanceDetailFieldFallback?.() ?? 'Field',
		updatedSuffix: m.participantWorkflowInstanceDetailUpdatedSuffix?.() ?? 'updated',
		adminUpdated: m.participantWorkflowInstanceDetailAdminUpdated?.() ?? 'Admin updated',
		fieldsNoun: m.participantWorkflowInstanceDetailFieldsNoun?.() ?? 'fields',
		fieldsUpdated: m.participantWorkflowInstanceDetailFieldsUpdated?.() ?? 'fields updated',
		locationUpdated: m.participantWorkflowInstanceDetailEntryLocationUpdated?.() ?? 'Location updated',
		inspectionRecorded: m.participantWorkflowInstanceDetailEntryInspectionRecorded?.() ?? 'Inspection recorded',
		conflictResolved: m.participantWorkflowInstanceDetailEntryConflictResolved?.() ?? 'Sync conflict resolved',
		stageTransition: m.participantWorkflowInstanceDetailEntryStageTransition?.() ?? 'Stage change'
	});

	const workflowsById = $derived(new Map(workflows.map((w) => [w.id, w])));
	const stageById = $derived(new Map(stages.map((s) => [s.id, s])));

	const fieldValuesByInstance = $derived.by(() => {
		const map = new Map<string, FieldValue[]>();
		for (const fv of fieldValues) {
			let arr = map.get(fv.instance_id);
			if (!arr) {
				arr = [];
				map.set(fv.instance_id, arr);
			}
			arr.push(fv);
		}
		return map;
	});

	const recentInstances = $derived.by(() => {
		const filtered = workflowFilter
			? instances.filter((i) => i.workflow_id === workflowFilter)
			: instances;
		const keyFor = (i: Instance) => {
			const latest = latestToolUsageByInstance.get(i.id)?.at;
			return new Date(latest || i.updated || i.created || 0).getTime();
		};
		return [...filtered]
			.sort((a, b) => keyFor(b) - keyFor(a))
			.slice(0, 50);
	});

	const filteredWorkflow = $derived(
		workflowFilter ? workflowsById.get(workflowFilter) ?? null : null
	);

	function renderIcon(config: IconConfig | null | undefined, size: number = 18): string | null {
		if (!config?.svgContent) return null;
		const color = config.style?.color || '#555';
		return config.svgContent.replace(
			/(<svg[^>]*)(>)/,
			`$1 style="width: ${size}px; height: ${size}px; fill: ${color};"$2`
		);
	}

	let scrollEl: HTMLDivElement | null = $state(null);

	$effect(() => {
		if (open && scrollEl) {
			// Restore on open, next frame so content has rendered.
			requestAnimationFrame(() => {
				if (scrollEl) scrollEl.scrollTop = savedScrollTop;
			});
		}
	});

	function handleScroll() {
		if (scrollEl) savedScrollTop = scrollEl.scrollTop;
	}
</script>

<Sheet.Root bind:open>
	<Sheet.ContentNoOverlay side="right" class="w-56 md:w-64 p-0">
		<Sheet.Header class="px-4 pt-4 pb-2">
			<Sheet.Title>
				{#if filteredWorkflow}
					{filteredWorkflow.name}
				{:else}
					{m.participantMapRecentTitle?.() ?? 'Zuletzt'}
				{/if}
			</Sheet.Title>
			{#if !filteredWorkflow}
				<Sheet.Description class="text-xs">
					{m.participantMapRecentDescription?.() ?? 'Zuletzt bearbeitete Eintraege'}
				</Sheet.Description>
			{/if}
		</Sheet.Header>

		<div
			bind:this={scrollEl}
			onscroll={handleScroll}
			class="flex-1 overflow-y-auto px-3 pb-4"
		>
			{#if recentInstances.length === 0}
				<div class="py-8 text-center text-xs text-muted-foreground">
					{m.participantMapRecentEmpty?.() ?? 'Noch keine Eintraege'}
				</div>
			{:else}
				<ul class="space-y-2">
					{#each recentInstances as instance (instance.id)}
						{@const workflow = workflowsById.get(instance.workflow_id)}
						{#if workflow}
							{@const stage = instance.current_stage_id
								? stageById.get(instance.current_stage_id)
								: undefined}
							{@const formFields = formFieldsByWorkflow.get(workflow.id) ?? []}
							{@const instanceIcon = iconByInstance.get(instance.id) ?? workflow.icon_config}
							{@const latestUsage = latestToolUsageByInstance.get(instance.id)}
							{@const activityText = latestUsage
								? toolUsageLabel(latestUsage.metadata as any, labelStrings, formFields)
								: null}
							{@const instanceFVs = fieldValuesByInstance.get(instance.id) ?? []}
							{@const fieldLabel = instanceLabel({
								instance: {
									id: instance.id,
									updated: latestUsage?.at ?? instance.updated,
									created: instance.created,
									current_stage_id: instance.current_stage_id
								},
								fieldValues: instanceFVs,
								formFields,
								stageName: stage?.stage_name,
								locale: 'de'
							})}
							<li>
								<button
									type="button"
									onclick={() => onInstanceTap(instance, workflow)}
									class="w-full rounded-lg border bg-background p-2.5 text-left transition-colors hover:bg-accent active:bg-accent/80"
								>
									<div class="flex items-start gap-2">
										{#if instanceIcon?.svgContent}
											<div class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
												{@html renderIcon(instanceIcon, 16)}
											</div>
										{:else}
											<div
												class="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
												style:background-color={workflow.marker_color || '#6b7280'}
											></div>
										{/if}
										<div class="min-w-0 flex-1">
											{#if !filteredWorkflow}
												<div class="truncate text-xs font-medium text-foreground">
													{workflow.name}
												</div>
											{/if}
											{#if activityText}
												<div class="truncate text-sm font-medium text-foreground" class:mt-0.5={!filteredWorkflow}>
													{activityText}
												</div>
											{/if}
											<div class="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-muted-foreground">
												{#if fieldLabel.timeAgo}
													<span>{fieldLabel.timeAgo}</span>
												{/if}
												{#if fieldLabel.stage}
													{#if fieldLabel.timeAgo}<span>·</span>{/if}
													<Badge variant="outline" class="h-4 px-1 py-0 text-[10px] leading-none">
														{fieldLabel.stage}
													</Badge>
												{/if}
												{#if workflow.workflow_type === 'incident' && !instance.centroid}
													{#if fieldLabel.timeAgo || fieldLabel.stage}<span>·</span>{/if}
													<span class="italic">{m.participantMapRecentNoLocation?.() ?? 'ohne Ort'}</span>
												{/if}
											</div>
										</div>
									</div>
								</button>
							</li>
						{/if}
					{/each}
				</ul>
			{/if}
		</div>
	</Sheet.ContentNoOverlay>
</Sheet.Root>
