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

	select(s: Selection) {
		this.selection = s;
	}

	deselect() {
		this.selection = { type: 'none' };
	}

	/** Deep-link from the model tab: select + jump to the canvas. */
	reveal(s: Selection) {
		this.selection = s;
		this.view = 'canvas';
	}
}

export type Role = { id: string; name: string; description?: string };

export interface BuilderContext {
	state: WorkflowBuilderState;
	ui: BuilderUi;
	roles: Role[];
	projectWorkflows: { id: string; name: string }[];
	createRole: (name: string) => Promise<Role>;
}

const KEY = Symbol('workflow-builder');

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
