<script lang="ts">
	import { Plus, Trash2 } from '@lucide/svelte';
	import MobileMultiSelect from '$lib/components/mobile-multi-select.svelte';
	import FormPreview from '../form-editor/FormPreview.svelte';
	import type {
		TrackedFieldDef,
		TrackedFormField,
		WorkflowFieldDef,
		ToolsFormField,
		FieldDisplayConfig
	} from '$lib/workflow-builder';
	import { DEFAULT_DATA_TAB } from '$lib/workflow-builder';
	import {
		workflowBuilderDataTabsAddTab,
		workflowBuilderDataTabsDefaultName,
		workflowBuilderDataTabsDeleteTab,
		workflowBuilderDataTabsNewTabName,
		workflowBuilderDataTabsNoFields,
		workflowBuilderDataTabsRolesHint,
		workflowBuilderDataTabsRolesLabel,
		workflowBuilderDataTabsRolesPlaceholder
	} from '$lib/paraglide/messages';

	type Role = { id: string; name: string; description?: string };

	type Props = {
		fieldDefs: TrackedFieldDef[];
		roles?: Role[];
		onFieldDefUpdate: (id: string, updates: Partial<WorkflowFieldDef>) => void;
	};

	let { fieldDefs, roles = [], onFieldDefUpdate }: Props = $props();

	const visibleDefs = $derived(fieldDefs.filter((d) => d.status !== 'deleted'));

	/** Tabs created via "+" that have no fields yet — local state only. */
	let transientTabs = $state<string[]>([]);
	let activeTab = $state<string>(DEFAULT_DATA_TAB);

	function tabOf(d: TrackedFieldDef): string {
		return d.data.display_config?.tab || DEFAULT_DATA_TAB;
	}

	const tabs = $derived.by(() => {
		const order = new Map<string, number>();
		order.set(DEFAULT_DATA_TAB, 0);
		for (const d of visibleDefs) {
			const cfg = d.data.display_config;
			const t = cfg?.tab || DEFAULT_DATA_TAB;
			const o = cfg?.tabOrder ?? 0;
			if (!order.has(t) || o < (order.get(t) as number)) order.set(t, o);
		}
		for (const t of transientTabs) if (!order.has(t)) order.set(t, 9999);
		return [...order.entries()]
			.map(([name, o]) => ({ name, order: o, isDefault: name === DEFAULT_DATA_TAB }))
			.sort((a, b) => {
				if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
				return a.order - b.order || a.name.localeCompare(b.name);
			});
	});

	$effect(() => {
		if (!tabs.some((t) => t.name === activeTab)) {
			activeTab = tabs[0]?.name ?? DEFAULT_DATA_TAB;
		}
	});

	function tabOrderOf(name: string): number {
		return tabs.find((t) => t.name === name)?.order ?? tabs.length;
	}

	function labelFor(name: string): string {
		return name === DEFAULT_DATA_TAB
			? (workflowBuilderDataTabsDefaultName?.() ?? 'Data')
			: name;
	}

	/** Field defs in a tab, sorted by display row. */
	function defsForTab(name: string): TrackedFieldDef[] {
		return visibleDefs
			.filter((d) => tabOf(d) === name)
			.sort((a, b) => (a.data.display_config?.row ?? 0) - (b.data.display_config?.row ?? 0));
	}

	const activeDefs = $derived(defsForTab(activeTab));
	const activeTabMeta = $derived(tabs.find((t) => t.name === activeTab));

	/** Roles applied to the active tab (the first member def is representative). */
	const activeTabRoles = $derived(activeDefs[0]?.data.view_roles ?? []);

	/**
	 * Effective display row for every def in the active tab. Configured defs keep
	 * their row; unconfigured defs (default tab) each get their own row appended
	 * below the configured ones — so FormPreview lays them out one per row.
	 */
	const effectiveRows = $derived.by(() => {
		const rows = new Map<string, number>();
		let maxConfigured = -1;
		for (const d of activeDefs) {
			const r = d.data.display_config?.row;
			if (r !== undefined) maxConfigured = Math.max(maxConfigured, r);
		}
		let next = maxConfigured + 1;
		for (const d of activeDefs) {
			const r = d.data.display_config?.row;
			rows.set(d.data.id, r !== undefined ? r : next++);
		}
		return rows;
	});

	/** Adapt active-tab field defs into the TrackedFormField shape FormPreview expects. */
	const previewFields = $derived<TrackedFormField[]>(
		activeDefs.map((d) => ({
			status: d.status,
			data: {
				id: d.data.id,
				form_id: '',
				field_def_id: d.data.id,
				field_order: effectiveRows.get(d.data.id) ?? 0,
				page: 1,
				row_index: effectiveRows.get(d.data.id) ?? 0,
				column_position: d.data.display_config?.column ?? 'full',
				field_label: d.data.label,
				field_type: d.data.field_type,
				field_options: d.data.field_options ?? undefined,
				validation_rules: d.data.validation_rules ?? undefined,
				conditional_logic: undefined,
				is_required: false,
				placeholder: '',
				help_text: ''
			} as ToolsFormField
		}))
	);

	// --- Tab operations -----------------------------------------------------

	function addTab() {
		const base = String(workflowBuilderDataTabsNewTabName?.() ?? 'New tab');
		let name = base;
		let n = 2;
		const taken = new Set(tabs.map((t) => t.name));
		while (taken.has(name)) name = `${base} ${n++}`;
		transientTabs = [...transientTabs, name];
		activeTab = name;
	}

	function renameTab(oldName: string, newName: string) {
		const trimmed = newName.trim();
		if (!trimmed || trimmed === oldName || tabs.some((t) => t.name === trimmed)) return;
		for (const d of defsForTab(oldName)) {
			const cfg = d.data.display_config;
			if (cfg) onFieldDefUpdate(d.data.id, { display_config: { ...cfg, tab: trimmed } });
		}
		transientTabs = transientTabs.map((t) => (t === oldName ? trimmed : t));
		if (activeTab === oldName) activeTab = trimmed;
	}

	function deleteTab(name: string) {
		for (const d of defsForTab(name)) {
			onFieldDefUpdate(d.data.id, { display_config: null });
		}
		transientTabs = transientTabs.filter((t) => t !== name);
		if (activeTab === name) activeTab = DEFAULT_DATA_TAB;
	}

	function setTabRoles(name: string, roleIds: string[]) {
		for (const d of defsForTab(name)) {
			onFieldDefUpdate(d.data.id, { view_roles: [...roleIds] });
		}
	}

	/** Move a def into a tab, appended at the end. */
	function moveDefToTab(defId: string, tabName: string) {
		const def = visibleDefs.find((d) => d.data.id === defId);
		if (!def || tabOf(def) === tabName) return;
		const cfg: FieldDisplayConfig = {
			tab: tabName,
			tabOrder: tabOrderOf(tabName),
			row: defsForTab(tabName).length,
			column: def.data.display_config?.column ?? 'full'
		};
		onFieldDefUpdate(defId, { display_config: cfg });
	}

	// --- FormPreview adapter ------------------------------------------------

	/** Translate FormPreview layout/label edits back onto the field def. */
	function handlePreviewUpdate(id: string, updates: Partial<ToolsFormField>) {
		if (updates.field_label !== undefined) {
			onFieldDefUpdate(id, { label: updates.field_label });
		}
		if (
			updates.row_index !== undefined ||
			updates.column_position !== undefined
		) {
			const def = visibleDefs.find((d) => d.data.id === id);
			if (!def) return;
			const next: FieldDisplayConfig = {
				tab: activeTab,
				tabOrder: tabOrderOf(activeTab),
				row: updates.row_index ?? def.data.display_config?.row ?? effectiveRows.get(id) ?? 0,
				column: updates.column_position ?? def.data.display_config?.column ?? 'full'
			};
			onFieldDefUpdate(id, { display_config: next });
		}
	}

	// --- Drag-and-drop: move a field card onto another tab chip -------------

	function onTabDrop(e: DragEvent, tabName: string) {
		const id = e.dataTransfer?.getData('fieldId');
		if (id) {
			e.preventDefault();
			moveDefToTab(id, tabName);
		}
	}
</script>

<div class="data-tabs-editor">
	<!-- Tab strip -->
	<div class="tab-strip">
		{#each tabs as tab (tab.name)}
			<button
				type="button"
				class="tab-chip"
				class:active={tab.name === activeTab}
				ondragover={(e) => e.preventDefault()}
				ondrop={(e) => onTabDrop(e, tab.name)}
				onclick={() => (activeTab = tab.name)}
			>
				{labelFor(tab.name)}
			</button>
		{/each}
		<button
			type="button"
			class="tab-add"
			onclick={addTab}
			title={workflowBuilderDataTabsAddTab?.() ?? 'Add tab'}
		>
			<Plus class="h-3.5 w-3.5" />
		</button>
	</div>

	{#if visibleDefs.length === 0}
		<p class="empty-hint">{workflowBuilderDataTabsNoFields?.() ?? 'No fields defined yet.'}</p>
	{:else}
		<!-- Active tab header: rename + delete -->
		<div class="tab-header">
			{#if activeTabMeta && !activeTabMeta.isDefault}
				<input
					class="tab-name-input"
					value={activeTab}
					onchange={(e) => renameTab(activeTab, (e.currentTarget as HTMLInputElement).value)}
				/>
				<button
					type="button"
					class="tab-delete"
					title={workflowBuilderDataTabsDeleteTab?.() ?? 'Delete tab'}
					onclick={() => deleteTab(activeTab)}
				>
					<Trash2 class="h-3.5 w-3.5" />
				</button>
			{:else}
				<span class="tab-name-static">{labelFor(activeTab)}</span>
			{/if}
		</div>

		<!-- Tab-level role permission -->
		<div class="tab-roles">
			<span class="tab-roles-label">{workflowBuilderDataTabsRolesLabel?.() ?? 'Visible to roles'}</span>
			<MobileMultiSelect
				selectedIds={activeTabRoles}
				options={roles}
				getOptionId={(r) => r.id}
				getOptionLabel={(r) => r.name}
				getOptionDescription={(r) => r.description}
				onSelectedIdsChange={(ids) => setTabRoles(activeTab, ids)}
				placeholder={workflowBuilderDataTabsRolesPlaceholder?.() ?? 'All roles'}
				class="w-full"
			/>
			<p class="tab-roles-hint">
				{workflowBuilderDataTabsRolesHint?.() ?? 'Applies to every field in this tab.'}
			</p>
		</div>

		<!-- The form-builder drag-and-drop grid, reused for data-tab layout -->
		{#key activeTab}
			<FormPreview
				fields={previewFields}
				showPages={false}
				onFieldUpdate={handlePreviewUpdate}
			/>
		{/key}
	{/if}
</div>

<style>
	.data-tabs-editor {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.tab-strip {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		align-items: center;
	}

	.tab-chip {
		font-size: 0.75rem;
		padding: 0.25rem 0.625rem;
		border-radius: 0.375rem;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		cursor: pointer;
		transition: all 0.12s ease;
	}

	.tab-chip:hover {
		background: hsl(var(--accent));
	}

	.tab-chip.active {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border-color: hsl(var(--primary));
	}

	.tab-add {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 0.375rem;
		border: 1px dashed hsl(var(--border));
		background: transparent;
		cursor: pointer;
	}

	.tab-add:hover {
		background: hsl(var(--accent));
	}

	.tab-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.tab-name-input {
		flex: 1;
		height: 1.75rem;
		font-size: 0.8125rem;
		padding: 0 0.5rem;
		border-radius: 0.375rem;
		border: 1px solid hsl(var(--input));
		background: hsl(var(--background));
	}

	.tab-name-static {
		font-size: 0.8125rem;
		font-weight: 500;
	}

	.tab-delete {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 0.375rem;
		border: 1px solid hsl(var(--border));
		background: transparent;
		color: hsl(var(--destructive));
		cursor: pointer;
	}

	.tab-roles {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.tab-roles-label {
		font-size: 0.75rem;
		font-weight: 500;
	}

	.tab-roles-hint {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
	}

	.empty-hint {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		text-align: center;
		padding: 1rem 0.5rem;
	}
</style>
