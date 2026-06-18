<script lang="ts">
	import { Plus, X } from '@lucide/svelte';
	import FormPreview from '../form-editor/FormPreview.svelte';
	import InlineEdit from '../../../components/InlineEdit.svelte';
	import type { TrackedFormField, ToolsFormField } from '$lib/workflow-builder';
	import { DEFAULT_DATA_TAB } from '$lib/workflow-builder';
	import {
		workflowBuilderDataTabsAddTab,
		workflowBuilderDataTabsDefaultName,
		workflowBuilderDataTabsDeleteTab,
		workflowBuilderDataTabsNewTabName,
		workflowBuilderDataTabsNoFields,
		workflowBuilderDataTabsRemoveField,
		builderClickToRename
	} from '$lib/paraglide/messages';
	import { getBuilderContext } from '../../../builder-context.svelte';

	const { state: builderState, ui } = getBuilderContext();

	/** Tabs created via "+" that have no fields yet — local, until a field lands. */
	let transientTabs = $state<string[]>([]);

	const tabs = $derived.by(() => {
		const real = builderState.getDataTabs();
		const names = new Set(real.map((t) => t.name));
		const extra = transientTabs
			.filter((t) => !names.has(t))
			.map((name) => ({ name, order: 9999, isDefault: false }));
		return [...real, ...extra];
	});

	// Keep the shared active tab pointing at a tab that still exists.
	$effect(() => {
		if (!tabs.some((t) => t.name === ui.activeDataTab)) {
			ui.activeDataTab = tabs[0]?.name ?? DEFAULT_DATA_TAB;
		}
	});

	const activeTab = $derived(ui.activeDataTab);
	const activeTabMeta = $derived(tabs.find((t) => t.name === activeTab));
	const activeDefs = $derived(builderState.getFieldDefsForTab(activeTab));
	const hasAnyFields = $derived(builderState.visibleFieldDefs.length > 0);

	function labelFor(name: string): string {
		return name === DEFAULT_DATA_TAB ? (workflowBuilderDataTabsDefaultName?.() ?? 'Data') : name;
	}

	/**
	 * Effective display row for every def in the active tab. Configured defs keep
	 * their row; unconfigured defs (default tab) each get their own row appended
	 * below — so FormPreview lays them out one per row.
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
		ui.activeDataTab = name;
	}

	function renameTab(oldName: string, newName: string) {
		const trimmed = newName.trim();
		if (!trimmed || trimmed === oldName || tabs.some((t) => t.name === trimmed)) return;
		builderState.renameDataTab(oldName, trimmed);
		transientTabs = transientTabs.map((t) => (t === oldName ? trimmed : t));
		if (ui.activeDataTab === oldName) ui.activeDataTab = trimmed;
	}

	function deleteTab(name: string) {
		// Returns its fields to the default tab.
		for (const d of builderState.getFieldDefsForTab(name)) {
			builderState.updateFieldDef(d.data.id, { display_config: null });
		}
		transientTabs = transientTabs.filter((t) => t !== name);
		if (ui.activeDataTab === name) ui.activeDataTab = DEFAULT_DATA_TAB;
	}

	// --- FormPreview adapter ------------------------------------------------

	/** Translate FormPreview layout/label edits back onto the field def. */
	function handlePreviewUpdate(id: string, updates: Partial<ToolsFormField>) {
		if (updates.field_label !== undefined) {
			builderState.updateFieldDef(id, { label: updates.field_label });
		}
		if (updates.row_index !== undefined || updates.column_position !== undefined) {
			const current = activeDefs.find((d) => d.data.id === id);
			const row =
				updates.row_index ?? current?.data.display_config?.row ?? effectiveRows.get(id) ?? 0;
			const column = updates.column_position ?? current?.data.display_config?.column ?? 'full';
			builderState.moveFieldDefToTab(id, activeTab, row, column);
		}
	}

	/** Remove a field from a custom tab — detaches it back to the default tab. */
	function removeFieldFromTab(id: string) {
		builderState.updateFieldDef(id, { display_config: null });
	}

	/** A library field dropped into a grid cell lands in the active tab. */
	function handleFieldRefDrop(
		defId: string,
		_page: number,
		rowIndex: number,
		columnPosition: ToolsFormField['column_position']
	) {
		builderState.moveFieldDefToTab(defId, activeTab, rowIndex, columnPosition);
	}

	/** A field card dragged onto a tab chip moves into that tab. */
	function onTabDrop(e: DragEvent, tabName: string) {
		const id = e.dataTransfer?.getData('fieldId') || e.dataTransfer?.getData('fieldDefId');
		if (!id) return;
		e.preventDefault();
		const row = builderState.getFieldDefsForTab(tabName).length;
		builderState.moveFieldDefToTab(id, tabName, row, 'full');
	}
</script>

<div class="data-tabs-section">
	<!-- Tab strip — participant-style, with inline add -->
	<div class="tab-strip">
		{#each tabs as tab (tab.name)}
			<button
				type="button"
				class="tab-chip"
				class:active={tab.name === activeTab}
				ondragover={(e) => e.preventDefault()}
				ondrop={(e) => onTabDrop(e, tab.name)}
				onclick={() => (ui.activeDataTab = tab.name)}
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

	<!-- Active custom tab: rename + delete -->
	{#if activeTabMeta && !activeTabMeta.isDefault}
		<div class="tab-header">
			<InlineEdit
				value={activeTab}
				onCommit={(v) => renameTab(activeTab, v)}
				class="min-w-0 flex-1 cursor-text truncate border-b border-transparent bg-transparent text-left text-sm font-semibold text-foreground transition outline-none hover:border-border focus:border-primary"
				ariaLabel={workflowBuilderDataTabsNewTabName?.() ?? 'Tab name'}
				editTitle={builderClickToRename?.() ?? 'Click to rename'}
			/>
			<button
				type="button"
				class="tab-delete"
				title={workflowBuilderDataTabsDeleteTab?.() ?? 'Remove tab'}
				onclick={() => deleteTab(activeTab)}
			>
				<X class="h-3.5 w-3.5" />
			</button>
		</div>
	{/if}

	<!-- The form-builder grid, reused for data-tab layout. Render it even when
	     the active tab is empty (as long as the workflow has fields) so it still
	     offers a drop target for the field palette — a brand-new tab included. -->
	{#if !hasAnyFields}
		<p class="empty-hint">
			{workflowBuilderDataTabsNoFields?.() ?? 'No fields defined yet.'}
		</p>
	{:else}
		{#key activeTab}
			<FormPreview
				fields={previewFields}
				showPages={false}
				selectedFieldId={ui.configTarget?.kind === 'field' ? ui.configTarget.id : null}
				onFieldSelect={(id) => ui.toggleConfig('field', id)}
				onFieldUpdate={handlePreviewUpdate}
				onFieldRefDrop={handleFieldRefDrop}
				onFieldRemove={activeTabMeta && !activeTabMeta.isDefault ? removeFieldFromTab : undefined}
				fieldRemoveLabel={workflowBuilderDataTabsRemoveField?.() ?? 'Remove from tab'}
			/>
		{/key}
	{/if}
</div>

<style>
	.data-tabs-section {
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
		padding: 0.3rem 0.7rem;
		border-radius: 0.5rem 0.5rem 0 0;
		border: 1px solid hsl(var(--border));
		border-bottom: none;
		background: hsl(var(--muted) / 0.4);
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.12s ease;
	}

	.tab-chip:hover {
		background: hsl(var(--accent));
		color: hsl(var(--foreground));
	}

	.tab-chip.active {
		background: hsl(var(--background));
		color: hsl(var(--foreground));
		font-weight: 600;
		border-color: hsl(var(--border));
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
		color: hsl(var(--muted-foreground));
		cursor: pointer;
	}

	.tab-add:hover {
		background: hsl(var(--accent));
		color: hsl(var(--foreground));
	}

	.tab-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
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

	.empty-hint {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		text-align: center;
		padding: 1rem 0.5rem;
	}
</style>
