/**
 * Builder context — the shared wiring every builder surface reads.
 *
 * One source of truth: `WorkflowBuilderState` (entity data) + `BuilderUi`
 * (selection, active tab, transient highlights). Views get both via Svelte
 * context instead of prop threading, so adding a new inspector view never
 * touches the page shell.
 */

import { getContext, setContext } from 'svelte';
import type { WorkflowBuilderState } from '$lib/workflow-builder';

/**
 * What is selected. Intentionally id-only — everything else (attachment,
 * entity data) is derived from the builder state so selection can never go
 * stale or disagree with the entity.
 */
export type Selection =
	| { type: 'none' }
	| { type: 'stage'; id: string }
	| { type: 'connection'; id: string }
	| { type: 'form'; id: string }
	| { type: 'editTool'; id: string }
	| { type: 'protocolTool'; id: string }
	| { type: 'automation'; id: string }
	| { type: 'fieldDef'; id: string }
	| { type: 'fieldTags' };

export type BuilderView = 'canvas' | 'model' | 'code';

/**
 * Panel 2 (the shared config sidebar): which element's appearance/roles (for an
 * action button) or in-context settings (for a field) is open. One target, one
 * sidebar — every gear/field-click sets this, so the same config always opens in
 * the same place.
 */
export type ConfigTarget = {
	kind: 'connection' | 'form' | 'editTool' | 'protocolTool' | 'field';
	id: string;
};

/**
 * Panel 3 (the detail sidebar): the deeper drill-in behind a Panel-2 element —
 * the field underneath. Two shapes: a shared workflow field def (`fieldDef`), or
 * a protocol form's inline local field (`localField`, addressed by form + key
 * since it has no shared def). Reached by "go deeper" from Panel 2; the
 * breadcrumb steps back up.
 */
export type DetailTarget =
	| { kind: 'fieldDef'; id: string }
	| { kind: 'localField'; formId: string; key: string };

export class BuilderUi {
	selection = $state<Selection>({ type: 'none' });
	view = $state<BuilderView>('canvas');
	/** Edge highlighted from preview hover (lock icon/colors stay untouched). */
	hoverEdgeId = $state<string | null>(null);
	/** Stage-tool badge highlighted from preview hover. */
	hoverStageToolId = $state<string | null>(null);
	/** Pending right-click connect source on the canvas. */
	connectingFrom = $state<string | null>(null);
	/** Form editor field palette expanded (widens the inspector). */
	paletteExpanded = $state(false);
	/**
	 * Active data tab in the participant preview. Shared so the inspector's
	 * field palette knows which tab a picked field drops into. Empty string =
	 * the default "Data" tab (DEFAULT_DATA_TAB).
	 */
	activeDataTab = $state<string>('');
	/**
	 * The action whose appearance + roles is open in the shared expandable
	 * config sidebar (null = closed). Set by every "Button & role settings" gear.
	 */
	configTarget = $state<ConfigTarget | null>(null);
	/** Panel 3 (detail sidebar): the deeper drill-in (null = closed). */
	detailTarget = $state<DetailTarget | null>(null);

	select(s: Selection) {
		this.selection = s;
		this.closePanels();
	}

	deselect() {
		this.selection = { type: 'none' };
		this.closePanels();
	}

	/** Deep-link from the model tab: select + jump to the canvas. */
	reveal(s: Selection) {
		this.selection = s;
		this.view = 'canvas';
		this.closePanels();
	}

	/** Close both drill-down panels (Panel 2 + Panel 3). */
	closePanels() {
		this.configTarget = null;
		this.detailTarget = null;
	}

	/** Open this element's config sidebar (Panel 2), or close it if already open. */
	toggleConfig(kind: ConfigTarget['kind'], id: string) {
		// Changing Panel 2 always collapses the deeper Panel 3.
		this.detailTarget = null;
		if (this.configTarget?.kind === kind && this.configTarget.id === id) {
			this.configTarget = null;
		} else {
			this.configTarget = { kind, id };
		}
	}

	/** Drill into the detail sidebar (Panel 3), or close it if already open. */
	toggleDetail(target: DetailTarget) {
		if (detailTargetsEqual(this.detailTarget, target)) {
			this.detailTarget = null;
		} else {
			this.detailTarget = target;
		}
	}
}

/** Structural equality for detail targets (toggle = same target closes it). */
function detailTargetsEqual(a: DetailTarget | null, b: DetailTarget | null): boolean {
	if (!a || !b || a.kind !== b.kind) return false;
	if (a.kind === 'fieldDef' && b.kind === 'fieldDef') return a.id === b.id;
	if (a.kind === 'localField' && b.kind === 'localField')
		return a.formId === b.formId && a.key === b.key;
	return false;
}

export type Role = { id: string; name: string; description?: string };

export interface BuilderContext {
	state: WorkflowBuilderState;
	ui: BuilderUi;
	roles: Role[];
	projectWorkflows: { id: string; name: string }[];
	createRole: (name: string) => Promise<Role>;
}

// Interned via the global registry (not a bare `Symbol(...)`) so the key stays
// identical across HMR re-evaluations / duplicate module instances in dev —
// otherwise setContext and getContext can end up with mismatched symbols and
// children throw "getBuilderContext() outside the builder tree".
const KEY = Symbol.for('workflow-builder');

export function setBuilderContext(ctx: BuilderContext): BuilderContext {
	return setContext(KEY, ctx);
}

export function getBuilderContext(): BuilderContext {
	const ctx = getContext<BuilderContext>(KEY);
	if (!ctx) throw new Error('getBuilderContext() outside the builder tree');
	return ctx;
}

// =============================================================================
// Selection helpers shared by canvas, catalog and inspectors
// =============================================================================

/**
 * Select a tool by id, resolving its type from state. Manual (non-global)
 * protocol tools open their backing form directly — the protocol IS a form;
 * a missing backing form is created and linked on the fly.
 */
export function selectTool(ctx: BuilderContext, toolId: string): void {
	const { state, ui } = ctx;
	if (toolId === '__field_tags__') {
		ui.select({ type: 'fieldTags' });
		return;
	}
	if (state.getFormById(toolId)) {
		ui.select({ type: 'form', id: toolId });
		return;
	}
	if (state.getAutomationById(toolId)) {
		ui.select({ type: 'automation', id: toolId });
		return;
	}
	if (state.getProtocolToolById(toolId)) {
		openProtocolTool(ctx, toolId);
		return;
	}
	if (state.getEditToolById(toolId)) {
		ui.select({ type: 'editTool', id: toolId });
	}
}

/**
 * Selecting a manual protocol tool opens its form editor directly — the
 * protocol IS a form, so the intermediate "edit form" shell would just be
 * a redundant click. Global/region protocols have no form and use the
 * dedicated region editor.
 */
export function openProtocolTool(ctx: BuilderContext, toolId: string): void {
	const { state, ui } = ctx;
	const tool = state.getProtocolToolById(toolId);
	if (!tool) return;
	if (tool.data.is_global) {
		ui.select({ type: 'protocolTool', id: toolId });
		return;
	}
	openProtocolForm(ctx, toolId);
}

/** Open (creating if needed) the form backing a protocol tool. */
export function openProtocolForm(ctx: BuilderContext, toolId: string): void {
	const { state, ui } = ctx;
	const tool = state.getProtocolToolById(toolId);
	if (!tool) return;

	if (tool.data.protocol_form_id) {
		ui.select({ type: 'form', id: tool.data.protocol_form_id });
		return;
	}
	const stageId = tool.data.stage_id?.[0];
	const newForm = state.addForm(stageId ? { stageId } : { isGlobal: true });
	state.updateForm(newForm.id, { name: `${tool.data.name} Form` });
	state.updateProtocolTool(toolId, { protocol_form_id: newForm.id });
	ui.select({ type: 'form', id: newForm.id });
}
