/**
 * Permissions matrix model.
 *
 * Flattens a WorkflowBuilderState into an ordered Section -> Band -> Row tree
 * for the permissions matrix. Rows expose live getters/setters that read and
 * mutate the builder state directly, so toggling a cell feeds the existing
 * staged-save flow (isDirty / getChanges).
 */

import type { WorkflowBuilderState } from '$lib/workflow-builder';
import {
	permMatrixBandEditTools,
	permMatrixBandForms,
	permMatrixBandProtocolTools,
	permMatrixBandStages,
	permMatrixBandStartInstance,
	permMatrixBandTransitions,
	permMatrixBandWorkflow,
	permMatrixDefaultTab,
	permMatrixEntryFallback,
	permMatrixRowEditOwn,
	permMatrixRowWorkflowVisible,
	permMatrixSectionCapabilities,
	permMatrixSectionVisibility
} from '$lib/paraglide/messages';

export type CellTone = 'view' | 'create' | 'use';

/** A field referenced by an expandable capability row. */
export interface MatrixFieldRef {
	id: string;
	label: string;
	/** The field's own view_roles (empty = all roles). */
	viewRoles: string[];
}

export interface MatrixRow {
	/** Stable id — survives model rebuilds, used as the expand-state key. */
	id: string;
	label: string;
	tone: CellTone;
	/** Only rendered when density = 'advanced'. */
	advanced: boolean;
	/** Read-only rows (e.g. connection-inherited forms) render dimmed, no toggle. */
	readOnly: boolean;
	/** Visual indent level (0 = top-level, 1 = nested). */
	indent: number;
	/** Live read of the current role list (empty = all roles). */
	roles: () => string[];
	/** Apply a new role list to builder state. Absent when readOnly. */
	setRoles?: (next: string[]) => void;
	/** When present, the row can expand to reveal the fields it references. */
	fieldRefs?: () => MatrixFieldRef[];
}

export interface MatrixBand {
	id: string;
	label: string;
	/** Whole band only rendered when density = 'advanced'. */
	advanced: boolean;
	/** When present, the band header carries its own per-role toggle cells. */
	header?: { roles: () => string[]; setRoles: (next: string[]) => void };
	rows: MatrixRow[];
}

export interface MatrixSection {
	id: string;
	label: string;
	bands: MatrixBand[];
}

function fieldRefsFromDefIds(
	state: WorkflowBuilderState,
	ids: Array<string | undefined>
): MatrixFieldRef[] {
	const out: MatrixFieldRef[] = [];
	const seen = new Set<string>();
	for (const id of ids) {
		if (!id || seen.has(id)) continue;
		seen.add(id);
		const def = state.getFieldDefById(id);
		if (!def) continue;
		out.push({ id, label: def.label || '—', viewRoles: def.view_roles ?? [] });
	}
	return out;
}

export function buildMatrixModel(state: WorkflowBuilderState): MatrixSection[] {
	// ---- Section: Visibility -------------------------------------------------
	const visibilityBands: MatrixBand[] = [];

	visibilityBands.push({
		id: 'workflow',
		label: permMatrixBandWorkflow(),
		advanced: false,
		rows: [
			{
				id: 'wf-visible',
				label: permMatrixRowWorkflowVisible(),
				tone: 'view',
				advanced: false,
				readOnly: false,
				indent: 0,
				roles: () => state.workflowPermissions.visible_to_roles ?? [],
				setRoles: (next) => state.updateWorkflowPermissions({ visible_to_roles: next })
			}
		]
	});

	const stageRows: MatrixRow[] = state.visibleStages.map((stage) => {
		const stageId = stage.data.id;
		return {
			id: `stage:${stageId}`,
			label: stage.data.stage_name,
			tone: 'view' as CellTone,
			advanced: false,
			readOnly: false,
			indent: 0,
			roles: () => state.getStageById(stageId)?.data.visible_to_roles ?? [],
			setRoles: (next) => state.updateStage(stageId, { visible_to_roles: next })
		};
	});
	if (stageRows.length > 0) {
		visibilityBands.push({
			id: 'stages',
			label: permMatrixBandStages(),
			advanced: false,
			rows: stageRows
		});
	}

	for (const tab of state.getDataTabs()) {
		const defs = state.getFieldDefsForTab(tab.name);
		if (defs.length === 0) continue;
		const tabName = tab.name;
		visibilityBands.push({
			id: `tab:${tabName}`,
			label: tab.isDefault ? permMatrixDefaultTab() : tabName,
			advanced: false,
			header: {
				roles: () => state.getFieldDefsForTab(tabName)[0]?.data.view_roles ?? [],
				setRoles: (next) => state.setTabViewRoles(tabName, next)
			},
			rows: defs.map((def) => {
				const defId = def.data.id;
				return {
					id: `field:${defId}`,
					label: def.data.label || '—',
					tone: 'view' as CellTone,
					advanced: true,
					readOnly: false,
					indent: 1,
					roles: () => state.getFieldDefById(defId)?.view_roles ?? [],
					setRoles: (next) => state.updateFieldDef(defId, { view_roles: next })
				};
			})
		});
	}

	// ---- Section: Capabilities ----------------------------------------------
	const capabilityBands: MatrixBand[] = [];

	const connectionRow = (connId: string, label: string, tone: CellTone): MatrixRow => ({
		id: `conn:${connId}`,
		label,
		tone,
		advanced: false,
		readOnly: false,
		indent: 0,
		roles: () => state.getConnectionById(connId)?.data.allowed_roles ?? [],
		setRoles: (next) => state.updateConnection(connId, { allowed_roles: next })
	});

	const entryRows: MatrixRow[] = [];
	const transitionRows: MatrixRow[] = [];
	for (const conn of state.visibleConnections) {
		const label =
			conn.data.visual_config?.button_label?.trim() ||
			conn.data.action_name ||
			permMatrixEntryFallback();
		if (!conn.data.from_stage_id) {
			entryRows.push(connectionRow(conn.data.id, label, 'create'));
		} else {
			transitionRows.push(connectionRow(conn.data.id, label, 'use'));
		}
	}
	if (entryRows.length > 0) {
		capabilityBands.push({
			id: 'entry',
			label: permMatrixBandStartInstance(),
			advanced: false,
			rows: entryRows
		});
	}
	if (transitionRows.length > 0) {
		capabilityBands.push({
			id: 'transitions',
			label: permMatrixBandTransitions(),
			advanced: false,
			rows: transitionRows
		});
	}

	const protocolFormIds = state.getProtocolFormIds();
	const formRows: MatrixRow[] = [];
	for (const form of state.visibleForms) {
		const formId = form.data.id;
		if (protocolFormIds.has(formId)) continue;
		const fieldRefs = () =>
			fieldRefsFromDefIds(
				state,
				state.getFieldsForForm(formId).map((f) => f.data.field_def_id)
			);
		const connId = form.data.connection_id;
		if (connId) {
			// Connection-attached form inherits the connection's allowed_roles —
			// shown read-only; the connection's row is where it's edited.
			formRows.push({
				id: `form:${formId}`,
				label: form.data.name,
				tone: 'use',
				advanced: false,
				readOnly: true,
				indent: 0,
				roles: () => state.getConnectionById(connId)?.data.allowed_roles ?? [],
				fieldRefs
			});
		} else {
			formRows.push({
				id: `form:${formId}`,
				label: form.data.name,
				tone: 'use',
				advanced: false,
				readOnly: false,
				indent: 0,
				roles: () => state.getFormById(formId)?.data.allowed_roles ?? [],
				setRoles: (next) => state.updateForm(formId, { allowed_roles: next }),
				fieldRefs
			});
		}
	}
	if (formRows.length > 0) {
		capabilityBands.push({
			id: 'forms',
			label: permMatrixBandForms(),
			advanced: false,
			rows: formRows
		});
	}

	const editRows: MatrixRow[] = [];
	for (const tool of state.visibleEditTools) {
		const toolId = tool.data.id;
		editRows.push({
			id: `edit-any:${toolId}`,
			label: tool.data.name,
			tone: 'use',
			advanced: false,
			readOnly: false,
			indent: 0,
			roles: () => state.getEditToolById(toolId)?.data.any_edit_roles ?? [],
			setRoles: (next) => state.updateEditTool(toolId, { any_edit_roles: next }),
			fieldRefs: () =>
				fieldRefsFromDefIds(state, state.getEditToolById(toolId)?.data.editable_fields ?? [])
		});
		editRows.push({
			id: `edit-self:${toolId}`,
			label: permMatrixRowEditOwn(),
			tone: 'use',
			advanced: true,
			readOnly: false,
			indent: 1,
			roles: () => state.getEditToolById(toolId)?.data.self_edit_roles ?? [],
			setRoles: (next) => state.updateEditTool(toolId, { self_edit_roles: next })
		});
	}
	if (editRows.length > 0) {
		capabilityBands.push({
			id: 'edit',
			label: permMatrixBandEditTools(),
			advanced: false,
			rows: editRows
		});
	}

	const protocolRows: MatrixRow[] = state.visibleProtocolTools.map((tool) => {
		const toolId = tool.data.id;
		return {
			id: `protocol:${toolId}`,
			label: tool.data.name,
			tone: 'use' as CellTone,
			advanced: true,
			readOnly: false,
			indent: 0,
			roles: () => state.getProtocolToolById(toolId)?.data.allowed_roles ?? [],
			setRoles: (next) => state.updateProtocolTool(toolId, { allowed_roles: next }),
			fieldRefs: () =>
				fieldRefsFromDefIds(state, state.getProtocolToolById(toolId)?.data.editable_fields ?? [])
		};
	});
	if (protocolRows.length > 0) {
		capabilityBands.push({
			id: 'protocol',
			label: permMatrixBandProtocolTools(),
			advanced: true,
			rows: protocolRows
		});
	}

	const sections: MatrixSection[] = [];
	if (visibilityBands.length > 0) {
		sections.push({
			id: 'visibility',
			label: permMatrixSectionVisibility(),
			bands: visibilityBands
		});
	}
	if (capabilityBands.length > 0) {
		sections.push({
			id: 'capabilities',
			label: permMatrixSectionCapabilities(),
			bands: capabilityBands
		});
	}
	return sections;
}
