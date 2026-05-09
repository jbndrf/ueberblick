<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Separator } from '$lib/components/ui/separator';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Plus, Pencil, Trash2 } from '@lucide/svelte';
	import FilterBuilder from '../../../../../participant/map/components/view-builder/FilterBuilder.svelte';
	import type { BuilderContext } from '../../../../../participant/map/components/view-builder/types';
	import type { FilterClause, ViewDefinition } from '$lib/participant-state/types';
	import { FEATURE_REGISTRY } from '$lib/participant-state/enabled-features.svelte';
	import type { ProjectStartupDefaults, AdminPreset } from '$lib/schemas/map-settings';
	import SettingsSection from '../SettingsSection.svelte';

	const FEATURE_KEY = 'filter.field_filters';

	let { data } = $props();

	type WorkflowLite = { id: string; name: string };
	const workflows = $derived<WorkflowLite[]>(data.workflows ?? []);

	const featureDef = $derived(FEATURE_REGISTRY.find((f) => f.key === FEATURE_KEY));
	const available = $derived(featureDef?.available ?? false);

	let enabled = $state<boolean>(
		Array.isArray(data.startupDefaults?.enabled_features)
			? data.startupDefaults!.enabled_features.includes(FEATURE_KEY)
			: false
	);
	let savingToggle = $state(false);

	async function persistToggle(next: boolean) {
		savingToggle = true;
		const current = data.startupDefaults ?? {
			overlay_layer_ids: [],
			workflow_ids_visible: 'all',
			enabled_features: [],
			visible_tag_values: {}
		};
		const features = new Set<string>(current.enabled_features ?? []);
		if (next) features.add(FEATURE_KEY);
		else features.delete(FEATURE_KEY);

		const payload: ProjectStartupDefaults = {
			base_layer_id: current.base_layer_id,
			overlay_layer_ids: [...(current.overlay_layer_ids ?? [])],
			workflow_ids_visible: current.workflow_ids_visible ?? 'all',
			enabled_features: [...features],
			visible_tag_values: { ...(current.visible_tag_values ?? {}) }
		};

		try {
			const fd = new FormData();
			fd.append('payload', JSON.stringify(payload));
			const res = await fetch('?/saveStartupDefaults', { method: 'POST', body: fd });
			if (!res.ok) throw new Error(await res.text());
			toast.success(m.settingsAdvancedStartupSaved?.() ?? 'Saved');
			await invalidateAll();
		} catch (e) {
			console.error(e);
			toast.error(m.settingsAdvancedSaveFailed?.() ?? 'Save failed');
			enabled = !next;
		} finally {
			savingToggle = false;
		}
	}

	function onToggle(next: boolean) {
		enabled = next;
		void persistToggle(next);
	}

	// --- Filter presets ---
	let presets = $state<AdminPreset[]>([...(data.adminPresets ?? [])]);
	let savingPresets = $state(false);

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
				for (const mp of (opts?.mappings ?? []) as Array<{
					options?: Array<{ label: string }>;
				}>) {
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
			creators: []
		};
	});

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
			toast.error(m.settingsAdvancedNameMissing?.() ?? 'Name missing');
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
		if (!confirm(m.settingsAdvancedDeletePresetConfirm?.() ?? 'Delete preset?')) return;
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
			toast.success(m.settingsAdvancedPresetsSaved?.() ?? 'Presets saved');
			await invalidateAll();
		} catch (e) {
			console.error(e);
			toast.error(m.settingsAdvancedSaveFailed?.() ?? 'Save failed');
		} finally {
			savingPresets = false;
		}
	}
</script>

<div class="flex flex-col gap-10">
	<SettingsSection
		name={m.settingsFeatureFieldFiltersTitle?.() ?? 'Field filters'}
		description={m.settingsFeatureFieldFiltersDescription?.() ??
			'Lets participants filter the map by individual form-field values. Each participant can opt in from their preferences. Configure curated presets below.'}
	>
		<div class="flex items-center justify-between gap-4 rounded-md border p-4">
			<div class="flex flex-col">
				<span class="font-medium">
					{m.settingsFeatureFieldFiltersEnableLabel?.() ?? 'Enabled at startup'}
				</span>
				<span class="text-xs text-muted-foreground">
					{m.settingsFeatureFieldFiltersEnableHint?.() ??
						'Adds the field-filters tab to the participant filter sheet by default for new participants.'}
				</span>
			</div>
			<div class="flex items-center gap-2">
				{#if !available}
					<span
						class="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
						title={m.settingsFeatureUnavailable?.() ?? 'Coming soon'}
					>
						{m.settingsFeatureUnavailableBadge?.() ?? 'Soon'}
					</span>
				{/if}
				<Switch
					checked={enabled}
					disabled={!available || savingToggle}
					onCheckedChange={onToggle}
				/>
			</div>
		</div>
	</SettingsSection>

	<SettingsSection
		name={m.settingsAdvancedPresetsTitle?.() ?? 'Filter presets'}
		description={m.settingsAdvancedPresetsDescription?.() ??
			'Pre-built filter views that participants can load into their own views with a single click. Once loaded, the preset becomes a regular user view — changes to the admin preset do not affect copies that have already been loaded.'}
	>
		{#snippet actions()}
			<Button size="sm" onclick={openNewPreset}>
				<Plus class="mr-2 size-4" />
				{m.settingsAdvancedNew?.() ?? 'New'}
			</Button>
		{/snippet}

		{#if presets.length === 0}
			<div class="rounded-md border border-dashed p-6 text-center">
				<p class="text-sm text-muted-foreground">
					{m.settingsAdvancedNoPresets?.() ?? 'No presets yet.'}
				</p>
			</div>
		{:else}
			<ul class="flex flex-col divide-y rounded-md border">
				{#each presets as p (p.id)}
					<li class="flex items-center justify-between gap-2 px-3 py-2">
						<div class="flex flex-col">
							<span class="font-medium">{p.name}</span>
							<span class="text-xs text-muted-foreground">
								{m.settingsAdvancedClauseCount?.({
									count: (p.config as any)?.clauses?.length ?? 0
								}) ?? `${(p.config as any)?.clauses?.length ?? 0} condition(s)`}
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
	</SettingsSection>
</div>

<Dialog.Root bind:open={presetDialogOpen}>
	<Dialog.Content class="max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>
				{editingPresetId
					? (m.settingsAdvancedEditPreset?.() ?? 'Edit preset')
					: (m.settingsAdvancedNewPreset?.() ?? 'New preset')}
			</Dialog.Title>
		</Dialog.Header>
		<div class="flex flex-col gap-4">
			<div class="flex flex-col gap-1">
				<Label for="preset-name">{m.settingsAdvancedName?.() ?? 'Name'}</Label>
				<Input
					id="preset-name"
					bind:value={draftName}
					placeholder={m.settingsAdvancedNamePlaceholder?.() ?? 'e.g. New reports (7 days)'}
				/>
			</div>
			<Separator />
			<div class="flex flex-col gap-2">
				<Label>{m.settingsAdvancedFilterConditions?.() ?? 'Filter conditions'}</Label>
				<FilterBuilder
					clauses={draftClauses}
					ctx={builderCtx}
					onChange={(next) => (draftClauses = next)}
				/>
			</div>
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (presetDialogOpen = false)}>
				{m.settingsAdvancedCancel?.() ?? 'Cancel'}
			</Button>
			<Button onclick={commitPreset} disabled={savingPresets}>
				{savingPresets
					? (m.settingsAdvancedSavingEllipsis?.() ?? 'Saving…')
					: (m.settingsAdvancedSave?.() ?? 'Save')}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
