/**
 * Field-def registry operations (workflow_field_defs) + emergent data tabs.
 */

import { generateId, deepEqual } from '../utils';
import type {
	WorkflowFieldDef,
	TrackedFieldDef,
	ToolsFormField,
	FieldType,
	FieldDisplayConfig,
	ColumnPosition
} from '../types';
import { DEFAULT_DATA_TAB } from '../types';
import type { WorkflowBuilderState } from '../state.svelte';

/**
 * Field defs as seen by cross-form consumers (library palette, protocol-tool
 * field picker, smart-dropdown source picker). Includes both:
 *  - real entries from `workflow_field_defs` (`state.fieldDefs`)
 *  - synthesized transient entries derived from new form fields whose
 *    `field_def_id` placeholder (e.g. `_temp_*`) is not yet in the registry.
 *
 * Synthesized entries let users reference freshly-added fields in other forms
 * before saving. They are NOT included in `getChanges()`; the save path
 * already materialises them via the `_temp_*` placeholder flow.
 */
export function computeEffectiveFieldDefs(state: WorkflowBuilderState): TrackedFieldDef[] {
	const real = state.fieldDefs.filter((d) => d.status !== 'deleted');
	const realIds = new Set(real.map((d) => d.data.id));
	const seenSynth = new Set<string>();
	const synthesized: TrackedFieldDef[] = [];
	for (const f of state.formFields) {
		if (f.status === 'deleted') continue;
		const defId = f.data.field_def_id;
		if (!defId || realIds.has(defId) || seenSynth.has(defId)) continue;
		seenSynth.add(defId);
		synthesized.push({
			data: {
				id: defId,
				workflow_id: state.workflowId,
				label: f.data.field_label ?? '',
				field_type: f.data.field_type,
				write_mode: f.data.write_mode ?? 'singleton',
				output_type: '',
				view_roles: [],
				validation_rules: f.data.validation_rules ?? null,
				field_options: f.data.field_options ?? null,
				compute_expression: f.data.compute_expression ?? '',
				compute_depends_on: []
			},
			status: 'new'
		});
	}
	return [...real, ...synthesized];
}

export function getFieldDefById(
	state: WorkflowBuilderState,
	id: string | undefined
): WorkflowFieldDef | undefined {
	if (!id) return undefined;
	const real = state.fieldDefs.find((d) => d.data.id === id && d.status !== 'deleted')?.data;
	if (real) return real;
	return state.effectiveFieldDefs.find((d) => d.data.id === id)?.data;
}

export function addFieldDef(
	state: WorkflowBuilderState,
	partial?: Partial<WorkflowFieldDef>
): WorkflowFieldDef {
	const def: WorkflowFieldDef = {
		id: generateId(),
		workflow_id: state.workflowId,
		label: partial?.label ?? '',
		field_type: (partial?.field_type ?? 'short_text') as FieldType,
		write_mode: partial?.write_mode ?? 'singleton',
		output_type: partial?.output_type ?? '',
		display_config: partial?.display_config ?? null,
		view_roles: partial?.view_roles ?? [],
		validation_rules: partial?.validation_rules ?? null,
		field_options: partial?.field_options ?? null,
		compute_expression: partial?.compute_expression ?? '',
		compute_depends_on: partial?.compute_depends_on ?? []
	};
	state.fieldDefs.push({ data: def, status: 'new' });
	return def;
}

export function updateFieldDef(
	state: WorkflowBuilderState,
	id: string,
	updates: Partial<WorkflowFieldDef>
): void {
	const def = state.fieldDefs.find((d) => d.data.id === id);
	if (!def) return;
	def.data = { ...def.data, ...updates };
	if (def.status === 'unchanged') def.status = 'modified';

	// Form-fields denormalize the def-level properties (label, type,
	// write_mode, options, validation, compute_expression) onto their ref
	// row. Mirror def edits onto every form-field pointing at this def so
	// the form builder and runtime see consistent values without a
	// save+refresh. Presentation (placeholder, help_text, required) is NOT
	// mirrored — it lives per-form on the ref's config.
	for (const f of state.formFields) {
		if (f.status === 'deleted') continue;
		if (f.data.field_def_id !== id) continue;
		const patch: Partial<ToolsFormField> = {};
		if (updates.label !== undefined) patch.field_label = updates.label ?? '';
		if (updates.field_type !== undefined) patch.field_type = updates.field_type;
		if (updates.write_mode !== undefined) (patch as any).write_mode = updates.write_mode;
		if (updates.field_options !== undefined) patch.field_options = updates.field_options ?? undefined;
		if (updates.validation_rules !== undefined)
			patch.validation_rules = updates.validation_rules ?? undefined;
		if (updates.compute_expression !== undefined)
			(patch as any).compute_expression = updates.compute_expression ?? '';
		if (Object.keys(patch).length === 0) continue;
		Object.assign(f.data, patch);
		if (f.status === 'unchanged' && !deepEqual(f.data, f.original)) {
			f.status = 'modified';
		}
	}
}

export function deleteFieldDef(state: WorkflowBuilderState, id: string): void {
	const def = state.fieldDefs.find((d) => d.data.id === id);
	if (!def) return;

	if (def.status === 'new') {
		state.fieldDefs = state.fieldDefs.filter((d) => d.data.id !== id);
	} else {
		def.status = 'deleted';
	}
}

// =============================================================================
// Data tabs (participant detail "Data" view). Tabs are emergent — derived
// from the distinct `display_config.tab` values across the workflow's field
// defs. The default tab (empty key) collects every def with no config.
// =============================================================================

/** Tab key for a field def — empty string = default "Data" tab. */
function defTab(def: WorkflowFieldDef): string {
	return def.display_config?.tab || DEFAULT_DATA_TAB;
}

/**
 * Emergent ordered list of data tabs. The default tab is always present and
 * sorts first; custom tabs follow by `tabOrder` then name.
 */
export function getDataTabs(
	state: WorkflowBuilderState
): Array<{ name: string; order: number; isDefault: boolean }> {
	const byTab = new Map<string, number>();
	byTab.set(DEFAULT_DATA_TAB, 0);
	for (const d of state.visibleFieldDefs) {
		const tab = defTab(d.data);
		const order = d.data.display_config?.tabOrder ?? 0;
		if (!byTab.has(tab) || order < (byTab.get(tab) as number)) byTab.set(tab, order);
	}
	return [...byTab.entries()]
		.map(([name, order]) => ({ name, order, isDefault: name === DEFAULT_DATA_TAB }))
		.sort((a, b) => {
			if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
			return a.order - b.order || a.name.localeCompare(b.name);
		});
}

/** Field defs assigned to a tab, ordered by row then column. */
export function getFieldDefsForTab(state: WorkflowBuilderState, tabName: string): TrackedFieldDef[] {
	const colRank = { left: 0, full: 1, right: 2 };
	return state.visibleFieldDefs
		.filter((d) => defTab(d.data) === tabName)
		.sort((a, b) => {
			const ra = a.data.display_config?.row ?? 0;
			const rb = b.data.display_config?.row ?? 0;
			if (ra !== rb) return ra - rb;
			return (
				colRank[a.data.display_config?.column ?? 'full'] -
				colRank[b.data.display_config?.column ?? 'full']
			);
		});
}

/** Current order value for an existing tab (0 for the default tab). */
function tabOrderOf(state: WorkflowBuilderState, tabName: string): number {
	if (tabName === DEFAULT_DATA_TAB) return 0;
	const found = getDataTabs(state).find((t) => t.name === tabName);
	return found?.order ?? getDataTabs(state).length;
}

/** Move/place a field def into a tab at a given layout slot. */
export function moveFieldDefToTab(
	state: WorkflowBuilderState,
	defId: string,
	tabName: string,
	row: number,
	column: ColumnPosition
): void {
	const def = state.fieldDefs.find((d) => d.data.id === defId);
	if (!def) return;
	const tabOrder = def.data.display_config?.tabOrder ?? tabOrderOf(state, tabName);
	const config: FieldDisplayConfig = { tab: tabName, tabOrder, row, column };
	updateFieldDef(state, defId, { display_config: config });
}

/** Rename a tab — rewrites `display_config.tab` on every member def. */
export function renameDataTab(state: WorkflowBuilderState, oldName: string, newName: string): void {
	if (oldName === newName) return;
	for (const d of getFieldDefsForTab(state, oldName)) {
		const c = d.data.display_config;
		if (!c) continue;
		updateFieldDef(state, d.data.id, { display_config: { ...c, tab: newName } });
	}
}

/** Reorder tabs — rewrites `tabOrder` on every member def of each tab. */
export function reorderDataTabs(state: WorkflowBuilderState, orderedNames: string[]): void {
	orderedNames.forEach((name, idx) => {
		if (name === DEFAULT_DATA_TAB) return;
		for (const d of getFieldDefsForTab(state, name)) {
			const c = d.data.display_config;
			if (!c) continue;
			updateFieldDef(state, d.data.id, { display_config: { ...c, tabOrder: idx } });
		}
	});
}

/** Bulk-apply view_roles to every field def in a tab. */
export function setTabViewRoles(
	state: WorkflowBuilderState,
	tabName: string,
	roleIds: string[]
): void {
	for (const d of getFieldDefsForTab(state, tabName)) {
		updateFieldDef(state, d.data.id, { view_roles: [...roleIds] });
	}
}
