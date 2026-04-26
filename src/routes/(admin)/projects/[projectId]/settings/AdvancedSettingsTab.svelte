<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Separator } from '$lib/components/ui/separator';
	import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from '@lucide/svelte';
	import FilterBuilder from '../../../../participant/map/components/view-builder/FilterBuilder.svelte';
	import type { BuilderContext } from '../../../../participant/map/components/view-builder/types';
	import type { FilterClause, ViewDefinition } from '$lib/participant-state/types';
	import { FEATURE_REGISTRY } from '$lib/participant-state/enabled-features.svelte';
	import type {
		ProjectStartupDefaults,
		AdminPreset
	} from '$lib/schemas/map-settings';

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

	// Local copies so the admin can edit before hitting save.
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
	// Per-workflow expand state for the nested value list (UI-only).
	let expandedWorkflows = $state<Set<string>>(new Set());
	function toggleExpanded(wfId: string) {
		const next = new Set(expandedWorkflows);
		if (next.has(wfId)) next.delete(wfId); else next.add(wfId);
		expandedWorkflows = next;
	}

	let presets = $state<AdminPreset[]>([...(data.adminPresets ?? [])]);
	let savingStartup = $state(false);
	let savingPresets = $state(false);

	// Builder context assembled from load() data -- mirrors participant map's builderCtx.
	const builderCtx = $derived.by<BuilderContext>(() => {
		const wfList = workflows.map((w) => ({ id: w.id, name: w.name }));
		const workflowNameById = new Map(wfList.map((w) => [w.id, w.name]));
		const accessibleWorkflowIds = new Set(wfList.map((w) => w.id));

		const stagesByWorkflow = new Map<string, { id: string; workflow_id: string; name: string }[]>();
		for (const s of (data.workflowStages ?? []) as any[]) {
			let arr = stagesByWorkflow.get(s.workflow_id);
			if (!arr) {
				arr = [];
				stagesByWorkflow.set(s.workflow_id, arr);
			}
			arr.push({ id: s.id, workflow_id: s.workflow_id, name: s.stage_name ?? s.id });
		}

		const workflowByFormId = new Map<string, string>();
		for (const f of (data.toolsForms ?? []) as any[]) {
			if (f?.id && f?.workflow_id) workflowByFormId.set(f.id, f.workflow_id);
		}

		const filterableFields: BuilderContext['filterableFields'] = [];
		for (const ff of (data.toolsFormFields ?? []) as any[]) {
			const type = ff.field_type as string | undefined;
			if (!type || type === 'file') continue;

			const workflowId = workflowByFormId.get(ff.form_id);
			if (!workflowId || !accessibleWorkflowIds.has(workflowId)) continue;

			const options: { id: string; label: string }[] = [];
			const opts = ff.field_options as any | null | undefined;
			if (type === 'dropdown' || type === 'multiple_choice') {
				for (const o of (opts?.options ?? []) as Array<{ label: string }>) {
					if (o?.label) options.push({ id: o.label, label: o.label });
				}
			} else if (type === 'smart_dropdown') {
				const seen = new Set<string>();
				for (const mp of (opts?.mappings ?? []) as Array<{ options?: Array<{ label: string }> }>) {
					for (const o of mp?.options ?? []) {
						if (o?.label && !seen.has(o.label)) {
							seen.add(o.label);
							options.push({ id: o.label, label: o.label });
						}
					}
				}
			}

			filterableFields.push({
				workflow_id: workflowId,
				workflow_name: workflowNameById.get(workflowId) ?? workflowId,
				field_key: ff.id,
				field_label: ff.field_label ?? ff.id,
				field_type: type as BuilderContext['filterableFields'][number]['field_type'],
				options
			});
		}

		filterableFields.sort((a, b) => {
			const byWf = a.workflow_name.localeCompare(b.workflow_name);
			if (byWf !== 0) return byWf;
			return a.field_label.localeCompare(b.field_label);
		});

		return {
			workflows: wfList,
			stagesByWorkflow,
			filterableFields,
			creators: [] // admins do not filter by creator in presets -- creators are dynamic
		};
	});

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
			if (!visibleWorkflowIds.includes(id))
				visibleWorkflowIds = [...visibleWorkflowIds, id];
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

	/**
	 * For each workflow that has a `filterable` tag mapping, list the
	 * pre-known values the admin can toggle as default-visible.
	 *   - filterBy=stage  -> all stages of that workflow
	 *   - filterBy=field  -> field_options for dropdown / multiple_choice /
	 *                        smart_dropdown fields. Free-text / numeric /
	 *                        date fields aren't enumerable up front so they
	 *                        get no admin-side toggles (participant still
	 *                        sees them via runtime values in their FilterSheet).
	 */
	const tagValuesByWorkflow = $derived.by<Map<string, WorkflowTagValues>>(() => {
		const result = new Map<string, WorkflowTagValues>();
		const fieldTags = (data.toolsFieldTags ?? []) as Array<{
			workflow_id: string;
			tag_mappings?: Array<{ tagType: string; fieldId?: string | null; config?: Record<string, unknown> }>;
		}>;
		const stagesByWorkflow = new Map<string, { id: string; name: string }[]>();
		for (const s of (data.workflowStages ?? []) as Array<{ id: string; workflow_id: string; stage_name?: string }>) {
			let arr = stagesByWorkflow.get(s.workflow_id);
			if (!arr) { arr = []; stagesByWorkflow.set(s.workflow_id, arr); }
			arr.push({ id: s.id, name: s.stage_name ?? s.id });
		}
		const fieldsById = new Map<string, { field_type?: string; field_options?: Record<string, unknown> | null; field_label?: string }>();
		for (const ff of (data.toolsFormFields ?? []) as Array<{ id: string; field_type?: string; field_options?: Record<string, unknown> | null; field_label?: string }>) {
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
				const opts = ff.field_options as { options?: Array<{ label: string }>; mappings?: Array<{ options?: Array<{ label: string }> }> } | null | undefined;
				const labels: string[] = [];
				if (ff.field_type === 'dropdown' || ff.field_type === 'multiple_choice') {
					for (const o of opts?.options ?? []) if (o?.label) labels.push(o.label);
				} else if (ff.field_type === 'smart_dropdown') {
					const seen = new Set<string>();
					for (const mp of opts?.mappings ?? []) {
						for (const o of mp?.options ?? []) {
							if (o?.label && !seen.has(o.label)) { seen.add(o.label); labels.push(o.label); }
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

	/**
	 * Whether a value is currently marked visible for a given workflow.
	 * Default (workflow not yet in `visible_tag_values`) is "all visible" --
	 * matches the participant's auto-init behavior so the admin's expand state
	 * doesn't appear hostile until they actually edit something.
	 */
	function isTagValueVisible(wfId: string, value: string): boolean {
		const list = startup.visible_tag_values?.[wfId];
		if (!Array.isArray(list)) return true;
		return list.includes(value);
	}

	function toggleTagValue(wfId: string, value: string, on: boolean) {
		const all = tagValuesByWorkflow.get(wfId)?.options.map((o) => o.value) ?? [];
		const current = startup.visible_tag_values?.[wfId];
		// Materialize current list: undefined defaults to "all on" so toggling
		// off the first value gives a deterministic remaining set.
		const base = Array.isArray(current) ? current : all;
		const set = new Set(base);
		if (on) set.add(value); else set.delete(value);
		const next = { ...(startup.visible_tag_values ?? {}) };
		// Preserve the explicit list even when it equals "all" -- the participant
		// applies it verbatim and the auto-add lock will keep it sticky.
		next[wfId] = [...set];
		startup = { ...startup, visible_tag_values: next };
	}

	function toggleFeature(key: string, on: boolean) {
		if (on) {
			if (!startup.enabled_features.includes(key))
				startup.enabled_features = [...startup.enabled_features, key];
		} else {
			startup.enabled_features = startup.enabled_features.filter((x) => x !== key);
		}
	}

	async function saveStartup() {
		savingStartup = true;
		// Strip empty entries so the saved object stays small.
		const tagValues: Record<string, string[]> = {};
		for (const [wfId, vals] of Object.entries(startup.visible_tag_values ?? {})) {
			if (Array.isArray(vals) && vals.length > 0) tagValues[wfId] = vals;
		}
		const payload: ProjectStartupDefaults = {
			base_layer_id: startup.base_layer_id || undefined,
			overlay_layer_ids: startup.overlay_layer_ids,
			workflow_ids_visible: allWorkflowsVisible ? 'all' : visibleWorkflowIds,
			enabled_features: startup.enabled_features,
			visible_tag_values: tagValues
		};
		try {
			const fd = new FormData();
			fd.append('payload', JSON.stringify(payload));
			const res = await fetch('?/saveStartupDefaults', { method: 'POST', body: fd });
			if (!res.ok) throw new Error(await res.text());
			toast.success('Startstellungen gespeichert');
			await invalidateAll();
		} catch (e) {
			console.error(e);
			toast.error('Speichern fehlgeschlagen');
		} finally {
			savingStartup = false;
		}
	}

	// --- Presets ---
	let presetDialogOpen = $state(false);
	let editingPresetId = $state<string | null>(null);
	let draftName = $state('');
	let draftClauses = $state<FilterClause[]>([]);
	let draftWorkflowIds = $state<string[]>([]);

	function openNewPreset() {
		editingPresetId = null;
		draftName = '';
		draftClauses = [];
		draftWorkflowIds = [];
		presetDialogOpen = true;
	}
	function openEditPreset(p: AdminPreset) {
		editingPresetId = p.id;
		draftName = p.name;
		const cfg = p.config as unknown as ViewDefinition;
		draftClauses = [...(cfg?.clauses ?? [])];
		draftWorkflowIds = [...(cfg?.workflow_ids ?? [])];
		presetDialogOpen = true;
	}

	async function commitPreset() {
		const trimmed = draftName.trim();
		if (!trimmed) {
			toast.error('Name fehlt');
			return;
		}
		const view: ViewDefinition = {
			version: 1,
			workflow_ids: draftWorkflowIds,
			category_ids: [],
			clauses: draftClauses
		};
		const next: AdminPreset[] = editingPresetId
			? presets.map((p) =>
					p.id === editingPresetId
						? { ...p, name: trimmed, config: view as unknown as Record<string, unknown> }
						: p
				)
			: [
					...presets,
					{
						id: crypto.randomUUID(),
						tool_key: 'filter.saved_views',
						name: trimmed,
						sort_order: presets.length,
						config: view as unknown as Record<string, unknown>
					}
				];
		await persistPresets(next);
		presetDialogOpen = false;
	}

	async function deletePreset(id: string) {
		if (!confirm('Preset löschen?')) return;
		await persistPresets(presets.filter((p) => p.id !== id));
	}

	async function persistPresets(next: AdminPreset[]) {
		savingPresets = true;
		try {
			const fd = new FormData();
			fd.append('payload', JSON.stringify(next));
			const res = await fetch('?/saveAdminPresets', { method: 'POST', body: fd });
			if (!res.ok) throw new Error(await res.text());
			presets = next;
			toast.success('Presets gespeichert');
			await invalidateAll();
		} catch (e) {
			console.error(e);
			toast.error('Speichern fehlgeschlagen');
		} finally {
			savingPresets = false;
		}
	}
</script>

<div class="flex flex-col gap-6">
	<!-- Startup defaults -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Startstellungen</Card.Title>
			<Card.Description>
				Zustand beim ersten Öffnen des Projekts: welche Ebenen und Workflows sichtbar sind und
				welche erweiterten Funktionen standardmäßig aktiv sind. Gilt nur beim ersten Besuch -- spätere
				Änderungen durch Nutzerinnen und Nutzer bleiben erhalten.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-6">
			<!-- Base layer -->
			<section class="flex flex-col gap-2">
				<Label>Basisebene</Label>
				<div class="flex flex-col gap-1">
					<label class="flex items-center gap-2 text-sm">
						<input
							type="radio"
							name="base_layer"
							checked={!startup.base_layer_id}
							onchange={() => (startup.base_layer_id = undefined)}
						/>
						<span class="text-muted-foreground">(erste aktive Basisebene)</span>
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
				<Label>Overlay-Ebenen (beim Start an)</Label>
				{#if overlayLayers.length === 0}
					<p class="text-sm text-muted-foreground">Keine Overlay-Ebenen vorhanden.</p>
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
					<Label>Sichtbare Workflows</Label>
					<label class="flex items-center gap-2 text-sm">
						<Switch bind:checked={allWorkflowsVisible} />
						Alle
					</label>
				</div>
				{#if workflows.length === 0}
					<p class="text-sm text-muted-foreground">Keine Workflows.</p>
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
												? 'Phasen, die beim Start sichtbar sind'
												: 'Werte, die beim Start sichtbar sind'}
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

			<!-- Enabled features -->
			<section class="flex flex-col gap-2">
				<Label>Erweiterte Funktionen (beim Start an)</Label>
				<div class="flex flex-col gap-1">
					{#each FEATURE_REGISTRY as f (f.key)}
						<label class="flex items-center gap-2 text-sm" class:opacity-60={!f.available}>
							<input
								type="checkbox"
								disabled={!f.available}
								checked={startup.enabled_features.includes(f.key)}
								onchange={(e) => toggleFeature(f.key, e.currentTarget.checked)}
							/>
							{f.key}
						</label>
					{/each}
				</div>
			</section>

			<div>
				<Button onclick={saveStartup} disabled={savingStartup}>
					{savingStartup ? 'Speichern...' : 'Startstellungen speichern'}
				</Button>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Admin presets -->
	<Card.Root>
		<Card.Header>
			<div class="flex items-center justify-between gap-2">
				<div>
					<Card.Title>Filter-Presets</Card.Title>
					<Card.Description>
						Vorgefertigte Filteransichten, die Teilnehmende mit einem Klick in ihre eigenen
						Ansichten laden können. Nach dem Laden ist das Preset eine normale Nutzer-Ansicht --
						Änderungen am Admin-Preset wirken sich nicht auf bereits geladene Kopien aus.
					</Card.Description>
				</div>
				<Button size="sm" onclick={openNewPreset}><Plus class="size-4" /> Neu</Button>
			</div>
		</Card.Header>
		<Card.Content>
			{#if presets.length === 0}
				<p class="text-sm text-muted-foreground">Noch keine Presets.</p>
			{:else}
				<ul class="flex flex-col divide-y">
					{#each presets as p (p.id)}
						<li class="flex items-center justify-between gap-2 py-2">
							<div class="flex flex-col">
								<span class="font-medium">{p.name}</span>
								<span class="text-xs text-muted-foreground">
									{(p.config as any)?.clauses?.length ?? 0} Bedingung(en)
								</span>
							</div>
							<div class="flex gap-1">
								<Button size="icon" variant="ghost" onclick={() => openEditPreset(p)}>
									<Pencil class="size-4" />
								</Button>
								<Button size="icon" variant="ghost" onclick={() => deletePreset(p.id)}>
									<Trash2 class="size-4" />
								</Button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>
</div>

<Dialog.Root bind:open={presetDialogOpen}>
	<Dialog.Content class="max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>{editingPresetId ? 'Preset bearbeiten' : 'Neues Preset'}</Dialog.Title>
		</Dialog.Header>
		<div class="flex flex-col gap-4">
			<div class="flex flex-col gap-1">
				<Label for="preset-name">Name</Label>
				<Input id="preset-name" bind:value={draftName} placeholder="z.B. Neue Meldungen (7 Tage)" />
			</div>
			<Separator />
			<div class="flex flex-col gap-2">
				<Label>Filterbedingungen</Label>
				<FilterBuilder
					clauses={draftClauses}
					ctx={builderCtx}
					onChange={(next) => (draftClauses = next)}
				/>
			</div>
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (presetDialogOpen = false)}>Abbrechen</Button>
			<Button onclick={commitPreset} disabled={savingPresets}>
				{savingPresets ? 'Speichern...' : 'Speichern'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
