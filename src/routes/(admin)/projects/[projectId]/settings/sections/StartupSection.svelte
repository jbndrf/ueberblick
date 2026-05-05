<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { ChevronDown, ChevronRight } from '@lucide/svelte';
	import type { ProjectStartupDefaults } from '$lib/schemas/map-settings';
	import SettingsSection from '../SettingsSection.svelte';

	let { data } = $props();

	type MapLayerLite = {
		id: string;
		name: string;
		layer_type: 'base' | 'overlay';
		display_order: number;
	};
	type WorkflowLite = { id: string; name: string };

	const mapLayers = $derived<MapLayerLite[]>(data.mapLayers ?? []);
	const baseLayers = $derived(mapLayers.filter((l) => l.layer_type === 'base'));
	const overlayLayers = $derived(mapLayers.filter((l) => l.layer_type === 'overlay'));
	const workflows = $derived<WorkflowLite[]>(data.workflows ?? []);

	let startup = $state<ProjectStartupDefaults>({
		base_layer_id: data.startupDefaults?.base_layer_id,
		overlay_layer_ids: [...(data.startupDefaults?.overlay_layer_ids ?? [])],
		workflow_ids_visible: data.startupDefaults?.workflow_ids_visible ?? 'all',
		enabled_features: [...(data.startupDefaults?.enabled_features ?? [])],
		visible_tag_values: { ...(data.startupDefaults?.visible_tag_values ?? {}) }
	});
	let allWorkflowsVisible = $state(startup.workflow_ids_visible === 'all');
	let visibleWorkflowIds = $state<string[]>(
		Array.isArray(startup.workflow_ids_visible) ? [...startup.workflow_ids_visible] : []
	);
	let expandedWorkflows = $state<Set<string>>(new Set());
	function toggleExpanded(wfId: string) {
		const next = new Set(expandedWorkflows);
		if (next.has(wfId)) next.delete(wfId);
		else next.add(wfId);
		expandedWorkflows = next;
	}

	let savingStartup = $state(false);

	function toggleOverlay(id: string, on: boolean) {
		if (on) {
			if (!startup.overlay_layer_ids.includes(id))
				startup.overlay_layer_ids = [...startup.overlay_layer_ids, id];
		} else {
			startup.overlay_layer_ids = startup.overlay_layer_ids.filter((x) => x !== id);
		}
	}

	function toggleWorkflow(id: string, on: boolean) {
		if (on) {
			if (!visibleWorkflowIds.includes(id)) visibleWorkflowIds = [...visibleWorkflowIds, id];
		} else {
			visibleWorkflowIds = visibleWorkflowIds.filter((x) => x !== id);
		}
	}

	type TagValueOption = { value: string; label: string };
	type WorkflowTagValues = {
		mode: 'stage' | 'field';
		fieldId?: string;
		options: TagValueOption[];
	};

	const tagValuesByWorkflow = $derived.by<Map<string, WorkflowTagValues>>(() => {
		const result = new Map<string, WorkflowTagValues>();
		const fieldTags = (data.toolsFieldTags ?? []) as Array<{
			workflow_id: string;
			tag_mappings?: Array<{
				tagType: string;
				fieldId?: string | null;
				config?: Record<string, unknown>;
			}>;
		}>;
		const stagesByWorkflow = new Map<string, { id: string; name: string }[]>();
		for (const s of (data.workflowStages ?? []) as Array<{
			id: string;
			workflow_id: string;
			stage_name?: string;
		}>) {
			let arr = stagesByWorkflow.get(s.workflow_id);
			if (!arr) {
				arr = [];
				stagesByWorkflow.set(s.workflow_id, arr);
			}
			arr.push({ id: s.id, name: s.stage_name ?? s.id });
		}
		const fieldsById = new Map<
			string,
			{
				field_type?: string;
				field_options?: Record<string, unknown> | null;
				field_label?: string;
			}
		>();
		for (const ff of (data.toolsFormFields ?? []) as Array<{
			id: string;
			field_type?: string;
			field_options?: Record<string, unknown> | null;
			field_label?: string;
		}>) {
			fieldsById.set(ff.id, ff);
		}

		for (const ft of fieldTags) {
			const mappings = ft.tag_mappings || [];
			const filterable = mappings.find((mp) => mp.tagType === 'filterable');
			if (!filterable) continue;
			const filterBy = (filterable.config?.filterBy as string) || 'field';
			const wfId = ft.workflow_id;

			if (filterBy === 'stage') {
				const stages = stagesByWorkflow.get(wfId) ?? [];
				if (stages.length > 0) {
					result.set(wfId, {
						mode: 'stage',
						options: stages.map((s) => ({ value: s.id, label: s.name }))
					});
				}
			} else if (filterable.fieldId) {
				const ff = fieldsById.get(filterable.fieldId);
				if (!ff) continue;
				const opts = ff.field_options as
					| {
							options?: Array<{ label: string }>;
							mappings?: Array<{ options?: Array<{ label: string }> }>;
					  }
					| null
					| undefined;
				const labels: string[] = [];
				if (ff.field_type === 'dropdown' || ff.field_type === 'multiple_choice') {
					for (const o of opts?.options ?? []) if (o?.label) labels.push(o.label);
				} else if (ff.field_type === 'smart_dropdown') {
					const seen = new Set<string>();
					for (const mp of opts?.mappings ?? []) {
						for (const o of mp?.options ?? []) {
							if (o?.label && !seen.has(o.label)) {
								seen.add(o.label);
								labels.push(o.label);
							}
						}
					}
				}
				if (labels.length > 0) {
					result.set(wfId, {
						mode: 'field',
						fieldId: filterable.fieldId,
						options: labels.map((l) => ({ value: l, label: l }))
					});
				}
			}
		}
		return result;
	});

	function isTagValueVisible(wfId: string, value: string): boolean {
		const list = startup.visible_tag_values?.[wfId];
		if (!Array.isArray(list)) return true;
		return list.includes(value);
	}

	function toggleTagValue(wfId: string, value: string, on: boolean) {
		const all = tagValuesByWorkflow.get(wfId)?.options.map((o) => o.value) ?? [];
		const current = startup.visible_tag_values?.[wfId];
		const base = Array.isArray(current) ? current : all;
		const set = new Set(base);
		if (on) set.add(value);
		else set.delete(value);
		const next = { ...(startup.visible_tag_values ?? {}) };
		next[wfId] = [...set];
		startup = { ...startup, visible_tag_values: next };
	}

	async function saveStartup() {
		savingStartup = true;
		const tagValues: Record<string, string[]> = {};
		for (const [wfId, vals] of Object.entries(startup.visible_tag_values ?? {})) {
			if (Array.isArray(vals) && vals.length > 0) tagValues[wfId] = vals;
		}
		// Preserve enabled_features (managed by feature sections) and only edit the
		// fields owned by Erststart.
		const payload: ProjectStartupDefaults = {
			base_layer_id: startup.base_layer_id || undefined,
			overlay_layer_ids: startup.overlay_layer_ids,
			workflow_ids_visible: allWorkflowsVisible ? 'all' : visibleWorkflowIds,
			enabled_features: [...(data.startupDefaults?.enabled_features ?? [])],
			visible_tag_values: tagValues
		};
		try {
			const fd = new FormData();
			fd.append('payload', JSON.stringify(payload));
			const res = await fetch('?/saveStartupDefaults', { method: 'POST', body: fd });
			if (!res.ok) throw new Error(await res.text());
			toast.success(m.settingsAdvancedStartupSaved?.() ?? 'Startup defaults saved');
			await invalidateAll();
		} catch (e) {
			console.error(e);
			toast.error(m.settingsAdvancedSaveFailed?.() ?? 'Save failed');
		} finally {
			savingStartup = false;
		}
	}
</script>

<SettingsSection
	name={m.settingsAdvancedStartupTitle?.() ?? 'Startup defaults'}
	description={m.settingsAdvancedStartupDescription?.() ??
		'State the first time the project is opened: which layers and workflows are visible. Only applies on the first visit — later changes by users are preserved.'}
>
	<div class="flex flex-col gap-6">
		<!-- Base layer -->
		<section class="flex flex-col gap-2">
			<Label>{m.settingsAdvancedBaseLayer?.() ?? 'Base layer'}</Label>
			<div class="flex flex-col gap-1">
				<label class="flex items-center gap-2 text-sm">
					<input
						type="radio"
						name="base_layer"
						checked={!startup.base_layer_id}
						onchange={() => (startup.base_layer_id = undefined)}
					/>
					<span class="text-muted-foreground">
						{m.settingsAdvancedFirstActiveBaseLayer?.() ?? '(first active base layer)'}
					</span>
				</label>
				{#each baseLayers as l (l.id)}
					<label class="flex items-center gap-2 text-sm">
						<input
							type="radio"
							name="base_layer"
							checked={startup.base_layer_id === l.id}
							onchange={() => (startup.base_layer_id = l.id)}
						/>
						{l.name}
					</label>
				{/each}
			</div>
		</section>

		<!-- Overlays -->
		<section class="flex flex-col gap-2">
			<Label>{m.settingsAdvancedOverlaysOnAtStart?.() ?? 'Overlay layers (on at start)'}</Label>
			{#if overlayLayers.length === 0}
				<p class="text-sm text-muted-foreground">
					{m.settingsAdvancedNoOverlays?.() ?? 'No overlay layers available.'}
				</p>
			{:else}
				<div class="flex flex-col gap-1">
					{#each overlayLayers as l (l.id)}
						<label class="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={startup.overlay_layer_ids.includes(l.id)}
								onchange={(e) => toggleOverlay(l.id, e.currentTarget.checked)}
							/>
							{l.name}
						</label>
					{/each}
				</div>
			{/if}
		</section>

		<!-- Workflows -->
		<section class="flex flex-col gap-2">
			<div class="flex items-center justify-between">
				<Label>{m.settingsAdvancedVisibleWorkflows?.() ?? 'Visible workflows'}</Label>
				<label class="flex items-center gap-2 text-sm">
					<Switch bind:checked={allWorkflowsVisible} />
					{m.settingsAdvancedAll?.() ?? 'All'}
				</label>
			</div>
			{#if workflows.length === 0}
				<p class="text-sm text-muted-foreground">
					{m.settingsAdvancedNoWorkflows?.() ?? 'No workflows.'}
				</p>
			{:else}
				<div class="flex flex-col gap-1">
					{#each workflows as w (w.id)}
						{@const tagInfo = tagValuesByWorkflow.get(w.id)}
						{@const isExpanded = expandedWorkflows.has(w.id)}
						<div class="rounded-md border">
							<div class="flex items-center gap-2 p-2">
								{#if tagInfo}
									<button
										type="button"
										class="flex h-5 w-5 items-center justify-center rounded hover:bg-accent"
										onclick={() => toggleExpanded(w.id)}
									>
										{#if isExpanded}
											<ChevronDown class="h-3.5 w-3.5" />
										{:else}
											<ChevronRight class="h-3.5 w-3.5" />
										{/if}
									</button>
								{:else}
									<span class="inline-block h-5 w-5"></span>
								{/if}
								<input
									type="checkbox"
									disabled={allWorkflowsVisible}
									checked={allWorkflowsVisible || visibleWorkflowIds.includes(w.id)}
									onchange={(e) => toggleWorkflow(w.id, e.currentTarget.checked)}
								/>
								<span class="text-sm">{w.name}</span>
							</div>
							{#if tagInfo && isExpanded}
								<div class="flex flex-col gap-1 border-t px-2 py-2 pl-10">
									<p class="text-xs text-muted-foreground">
										{tagInfo.mode === 'stage'
											? (m.settingsAdvancedStagesVisibleAtStart?.() ?? 'Stages visible at start')
											: (m.settingsAdvancedValuesVisibleAtStart?.() ?? 'Values visible at start')}
									</p>
									{#each tagInfo.options as opt (opt.value)}
										<label class="flex items-center gap-2 text-xs">
											<input
												type="checkbox"
												checked={isTagValueVisible(w.id, opt.value)}
												onchange={(e) => toggleTagValue(w.id, opt.value, e.currentTarget.checked)}
											/>
											{opt.label}
										</label>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<div>
			<Button onclick={saveStartup} disabled={savingStartup}>
				{savingStartup
					? (m.settingsAdvancedSavingEllipsis?.() ?? 'Saving…')
					: (m.settingsAdvancedSaveStartupDefaults?.() ?? 'Save startup defaults')}
			</Button>
		</div>
	</div>
</SettingsSection>
