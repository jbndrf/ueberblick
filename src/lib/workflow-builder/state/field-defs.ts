/**
 * Field-def registry operations (workflow_field_defs) + emergent data tabs.
 *
 * Defs are the single source of truth for definitional field properties
 * (label, type, options, validation, write_mode, compute). Form refs only
 * carry presentation config — the resolved read-model derives from both.
 */

import { generateId, deepEqual } from '../utils';
import type {
	WorkflowFieldDef,
	TrackedFieldDef,
	FieldType,
	FieldDisplayConfig,
	ColumnPosition
} from '../types';
import { DEFAULT_DATA_TAB } from '../types';
import type { WorkflowBuilderState } from '../state.svelte';

export function getFieldDefById(
	state: WorkflowBuilderState,
	id: string | undefined
): WorkflowFieldDef | undefined {
	if (!id) return undefined;
	return state.fieldDefs.find((d) => d.data.id === id && d.status !== 'deleted')?.data;
}

/**
 * De-duplicate a label against the visible defs — `workflow_field_defs` has a
 * UNIQUE (workflow_id, label) index, and ids are now minted client-side, so
 * collisions must be resolved before save.
 */
export function uniqueDefLabel(state: WorkflowBuilderState, base: string): string {
	const root = (base || 'New Field').slice(0, 250);
	const taken = new Set(state.visibleFieldDefs.map((d) => d.data.label));
	let candidate = root;
	let n = 2;
	while (taken.has(candidate)) {
		candidate = `${root} (${n++})`;
	}
	return candidate;
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
	// No mirroring needed: the form read-model resolves ref ⊕ def on read, so
	// every surface sees def edits immediately.
}

/**
 * Delete a def from the registry. Cascades to everything referencing it:
 * form refs (the field disappears from those forms), edit-/protocol-tool
 * `editable_fields`, and field-tag mappings.
 */
export function deleteFieldDef(state: WorkflowBuilderState, id: string): void {
	const def = state.fieldDefs.find((d) => d.data.id === id);
	if (!def) return;

	// Refs pointing at this def
	for (const ref of [...state.fieldRefs]) {
		if (ref.data.field_def_id !== id || ref.status === 'deleted') continue;
		if (ref.status === 'new') {
			state.fieldRefs = state.fieldRefs.filter((f) => f.data.id !== ref.data.id);
		} else {
			ref.status = 'deleted';
		}
	}

	// Edit tools / protocol tools referencing the def in editable_fields
	for (const tool of state.editTools) {
		if (tool.status === 'deleted') continue;
		if (!tool.data.editable_fields?.includes(id)) continue;
		tool.data.editable_fields = tool.data.editable_fields.filter((f) => f !== id);
		if (tool.status === 'unchanged' && !deepEqual(tool.data, tool.original)) {
			tool.status = 'modified';
		}
	}
	for (const pt of state.protocolTools) {
		if (pt.status === 'deleted') continue;
		if (!pt.data.editable_fields?.includes(id)) continue;
		pt.data.editable_fields = pt.data.editable_fields.filter((f) => f !== id);
		if (pt.status === 'unchanged' && !deepEqual(pt.data, pt.original)) {
			pt.status = 'modified';
		}
	}

	// Field-tag mappings referencing the def
	for (const ft of state.fieldTags) {
		if (ft.status === 'deleted') continue;
		const before = ft.data.tag_mappings.length;
		ft.data.tag_mappings = ft.data.tag_mappings.filter((m) => m.fieldId !== id);
		if (ft.data.tag_mappings.length !== before && ft.status === 'unchanged') {
			if (!deepEqual(ft.data, ft.original)) {
				ft.status = 'modified';
			}
		}
	}

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
