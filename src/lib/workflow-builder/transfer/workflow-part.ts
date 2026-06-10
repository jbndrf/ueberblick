/**
 * Whole-workflow transfer part: serialize the entire builder model to YAML and
 * apply an edited YAML back onto the in-memory state (bidirectional). Covers
 * everything configurable in a workflow: stages, connections (roles + sentry),
 * the field-def registry, forms (roles + visual + fields), edit tools, protocol
 * tools (+ their backing form & local fields), automations, and field tags.
 *
 * Identity for reconciliation is by NATURAL KEY, never opaque id:
 *  - field def  → `label`              - stage → `key` (slug of name)
 *  - connection → (from, to, action)   - form/edit/protocol tool → (attach, name)
 *  - role       → `name` (project-scoped; referenced, never created/deleted)
 *  - automation → `name`               - field tags → singleton record
 *
 * Apply mutates only in-memory state (status new/modified/deleted); the user
 * still reviews the canvas and clicks Save, so a bad apply is undone by a
 * reload. Optional sections (edit_tools/protocol_tools/automations/field_tags)
 * are reconciled only when PRESENT in the YAML; absent = left untouched.
 *
 * Caveat (documented in the UI): renaming a stage/form/field in YAML is a
 * delete + create, because identity is the name/label.
 */
import type { WorkflowBuilderState } from '../state.svelte';
import type {
	WorkflowStage,
	WorkflowFieldDef,
	VisualConfig,
	SentryClause,
	ToolsEdit,
	ToolsProtocol,
	ToolsAutomation,
	ToolsForm,
	ColumnPosition,
	StageType,
	FieldDisplayConfig
} from '../types';
import type { ConditionalLogic } from '$lib/form-engine/conditional-logic';
import { deepEqual } from '../utils';
import { remapLogicLabels } from './import-part';
import type {
	WorkflowPart,
	WorkflowFieldDefPart,
	WorkflowConnectionPart,
	WorkflowFormPart,
	WorkflowEditToolPart,
	WorkflowProtocolToolPart,
	WorkflowAutomationPart,
	WorkflowFieldTagPart
} from './part-schema';
import { PART_VERSION } from './part-schema';

export type WorkflowApplyResult = { warnings: string[] };
export type Role = { id: string; name: string };
type Opts = { roles?: Role[] };

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function slugify(s: string): string {
	return (
		s
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'stage'
	);
}

/** Stable, unique key per stage derived from its name. */
function buildStageKeys(stages: WorkflowStage[]): Map<string, string> {
	const used = new Set<string>();
	const map = new Map<string, string>();
	for (const s of stages) {
		const base = slugify(s.stage_name);
		let key = base;
		let n = 2;
		while (used.has(key)) key = `${base}-${n++}`;
		used.add(key);
		map.set(s.id, key);
	}
	return map;
}

function connIdentity(fromKey: string | null, toKey: string, action: string): string {
	return `${fromKey ?? '∅'}|${toKey}|${action}`;
}

/** Role name ↔ id codec. Falls back to pass-through when no roles are supplied. */
function roleCodec(roles: Role[] = []) {
	const nameById = new Map(roles.map((r) => [r.id, r.name]));
	const idByName = new Map(roles.map((r) => [r.name, r.id]));
	return {
		toNames: (ids?: string[] | null): string[] => (ids ?? []).map((id) => nameById.get(id) ?? id),
		toIds: (names: string[] | undefined, warn?: (n: string) => void): string[] =>
			(names ?? []).flatMap((n) => {
				if (idByName.has(n)) return [idByName.get(n)!];
				if (roles.length) {
					warn?.(n);
					return [];
				}
				return [n]; // no role table → assume already an id
			})
	};
}

function visualOf(vc: VisualConfig | undefined): VisualConfig | undefined {
	if (!vc) return undefined;
	const out: VisualConfig = {};
	if (vc.button_label) out.button_label = vc.button_label;
	if (vc.button_color) out.button_color = vc.button_color;
	if (vc.button_icon) out.button_icon = vc.button_icon;
	if (vc.requires_confirmation) out.requires_confirmation = true;
	if (vc.confirmation_message) out.confirmation_message = vc.confirmation_message;
	return Object.keys(out).length ? out : undefined;
}

// ---------------------------------------------------------------------------
// Automation id ↔ name translation (symmetric; direction set by the map fns)
// ---------------------------------------------------------------------------

function remapAutomationRefs(
	triggerConfig: Record<string, unknown>,
	steps: Record<string, unknown>[],
	mapStage: (v: string) => string,
	mapField: (v: string) => string
): { trigger_config: Record<string, unknown>; steps: Record<string, unknown>[] } {
	const tc = { ...triggerConfig };
	for (const k of ['from_stage_id', 'to_stage_id', 'stage_id', 'target_stage_id']) {
		if (typeof tc[k] === 'string' && tc[k]) tc[k] = mapStage(tc[k] as string);
	}
	if (typeof tc.field_key === 'string' && tc.field_key) tc.field_key = mapField(tc.field_key);

	const newSteps = steps.map((s) => {
		const step = { ...s } as Record<string, unknown>;
		const conds = step.conditions as
			| { operator?: string; conditions?: Record<string, unknown>[] }
			| null
			| undefined;
		if (conds?.conditions) {
			step.conditions = {
				...conds,
				conditions: conds.conditions.map((c) => {
					const leaf = c as { type?: string; params?: Record<string, unknown> };
					if (leaf.type === 'field_value' && leaf.params) {
						const p = { ...leaf.params };
						if (typeof p.field_key === 'string' && p.field_key) p.field_key = mapField(p.field_key);
						if (typeof p.compare_field_key === 'string' && p.compare_field_key)
							p.compare_field_key = mapField(p.compare_field_key);
						return { ...leaf, params: p };
					}
					if (leaf.type === 'current_stage' && typeof leaf.params?.stage_id === 'string') {
						return {
							...leaf,
							params: { ...leaf.params, stage_id: mapStage(leaf.params.stage_id) }
						};
					}
					return c;
				})
			};
		}
		const actions = step.actions as Record<string, unknown>[] | undefined;
		if (Array.isArray(actions)) {
			step.actions = actions.map((a) => {
				const act = a as { type?: string; params?: Record<string, unknown> };
				if (act.type === 'set_field_value' && typeof act.params?.field_key === 'string') {
					return { ...act, params: { ...act.params, field_key: mapField(act.params.field_key) } };
				}
				if (act.type === 'set_stage' && typeof act.params?.stage_id === 'string') {
					return { ...act, params: { ...act.params, stage_id: mapStage(act.params.stage_id) } };
				}
				return a;
			});
		}
		return step;
	});

	return { trigger_config: tc, steps: newSteps };
}

// ===========================================================================
// Serialize:  state -> WorkflowPart
// ===========================================================================

function defOptionsToLabels(
	def: WorkflowFieldDef,
	defLabelOf: (id: string) => string | undefined,
	stageKeyOf: (id: string) => string | undefined
): Record<string, unknown> | null {
	const opts = def.field_options;
	if (!opts) return null;
	if (def.field_type !== 'smart_dropdown') return opts;
	const next: Record<string, unknown> = { ...opts };
	const src = next.source_field;
	if (typeof src === 'string' && src) next.source_field_label = defLabelOf(src) ?? src;
	delete next.source_field;
	const stage = next.source_stage_id;
	if (typeof stage === 'string' && stage) next.source_stage = stageKeyOf(stage) ?? stage;
	delete next.source_stage_id;
	return next;
}

function logicToLabels(
	logic: ConditionalLogic | null | undefined,
	defLabelOf: (id: string) => string | undefined
): ConditionalLogic | null {
	return remapLogicLabels(
		logic,
		(id) => defLabelOf(id) ?? id,
		() => {}
	);
}

export function buildWorkflowPart(state: WorkflowBuilderState, opts: Opts = {}): WorkflowPart {
	const roles = roleCodec(opts.roles);

	const stages = state.visibleStages.map((s) => s.data);
	const stageKeyById = buildStageKeys(stages);
	const stageKeyOf = (id: string | null | undefined) => (id ? stageKeyById.get(id) : undefined);

	const defs = state.visibleFieldDefs.map((d) => d.data);
	const defLabelById = new Map<string, string>();
	for (const d of defs) defLabelById.set(d.id, d.label);
	const defLabelOf = (id: string) => defLabelById.get(id);

	const fieldDefs: WorkflowFieldDefPart[] = defs.map((d) => ({
		label: d.label,
		field_type: d.field_type,
		...(d.write_mode && d.write_mode !== 'singleton' ? { write_mode: d.write_mode } : {}),
		...(d.output_type ? { output_type: d.output_type } : {}),
		field_options: defOptionsToLabels(d, defLabelOf, (id) => stageKeyOf(id)),
		validation_rules: d.validation_rules ?? null,
		...(d.compute_expression ? { compute_expression: d.compute_expression } : {}),
		...(d.view_roles?.length ? { view_roles: roles.toNames(d.view_roles) } : {}),
		...(d.display_config ? { display_config: d.display_config } : {})
	}));

	const stageParts = stages.map((s) => ({
		key: stageKeyById.get(s.id)!,
		name: s.stage_name,
		type: s.stage_type,
		x: Math.round(s.position_x ?? 0),
		y: Math.round(s.position_y ?? 0)
	}));

	const connections = state.visibleConnections.map((c) => c.data);
	const connectionParts: WorkflowConnectionPart[] = connections.map((c) => {
		const vc = visualOf(c.visual_config);
		return {
			from: stageKeyOf(c.from_stage_id) ?? null,
			to: stageKeyOf(c.to_stage_id) ?? '?',
			action: c.action_name,
			...(vc?.button_label ? { button_label: vc.button_label } : {}),
			...(vc?.button_color ? { button_color: vc.button_color } : {}),
			...(vc?.button_icon ? { button_icon: vc.button_icon } : {}),
			...(vc?.requires_confirmation ? { requires_confirmation: true } : {}),
			...(vc?.confirmation_message ? { confirmation_message: vc.confirmation_message } : {}),
			...(c.allowed_roles?.length ? { allowed_roles: roles.toNames(c.allowed_roles) } : {}),
			...(c.sentry?.length
				? {
						sentry: c.sentry.map((s) => ({
							field: defLabelOf(s.field_def_id) ?? s.field_def_id,
							op: s.op,
							...(s.value !== undefined ? { value: s.value } : {})
						}))
					}
				: {})
		};
	});

	// Forms (registry-backed; protocol-backing forms handled with their tool).
	const protocolFormIds = new Set(
		state.visibleProtocolTools.map((p) => p.data.protocol_form_id).filter(Boolean) as string[]
	);
	const connById = new Map(connections.map((c) => [c.id, c]));
	const formFieldsOf = (formId: string) =>
		state.getFieldsForForm(formId).map((tff) => {
			const d = tff.data;
			return {
				field: d.field_label,
				page: d.page ?? 1,
				row: d.row_index ?? 0,
				column: d.column_position ?? 'full',
				...(d.is_required ? { required: true } : {}),
				...(d.placeholder ? { placeholder: d.placeholder } : {}),
				...(d.help_text ? { help_text: d.help_text } : {}),
				conditional_logic: logicToLabels(d.conditional_logic, defLabelOf)
			};
		});
	const attachOfForm = (f: ToolsForm): WorkflowFormPart['attach'] => {
		if (f.stage_id) return { type: 'stage', stage: stageKeyOf(f.stage_id) ?? '?' };
		if (f.connection_id) {
			const c = connById.get(f.connection_id);
			return {
				type: 'connection',
				from: c ? (stageKeyOf(c.from_stage_id) ?? null) : null,
				to: c ? (stageKeyOf(c.to_stage_id) ?? '?') : '?',
				action: c?.action_name ?? 'transition'
			};
		}
		return { type: 'global' };
	};
	const forms: WorkflowFormPart[] = [];
	for (const tf of state.visibleForms) {
		const f = tf.data;
		if (protocolFormIds.has(f.id)) continue;
		const attach = attachOfForm(f);
		const vc = visualOf(f.visual_config);
		forms.push({
			attach,
			name: f.name,
			pages: f.pages ?? [],
			...(attach.type !== 'connection' && f.allowed_roles?.length
				? { allowed_roles: roles.toNames(f.allowed_roles) }
				: {}),
			...(attach.type !== 'connection' && vc ? { visual_config: vc } : {}),
			fields: formFieldsOf(f.id)
		});
	}

	// Edit tools
	const editTools: WorkflowEditToolPart[] = state.visibleEditTools.map((te) => {
		const e = te.data;
		return {
			attach: attachOfTool(e.is_global, e.connection_id, e.stage_id, stageKeyOf),
			name: e.name,
			edit_mode: e.edit_mode,
			editable_fields: (e.editable_fields ?? []).map((id) => defLabelOf(id) ?? id),
			...(e.self_edit_roles?.length ? { self_edit_roles: roles.toNames(e.self_edit_roles) } : {}),
			...(e.any_edit_roles?.length ? { any_edit_roles: roles.toNames(e.any_edit_roles) } : {}),
			...(visualOf(e.visual_config) ? { visual_config: visualOf(e.visual_config) } : {})
		};
	});

	// Protocol tools (+ backing form)
	const protocolTools: WorkflowProtocolToolPart[] = state.visibleProtocolTools.map((tp) => {
		const p = tp.data;
		const prefill: Record<string, boolean> = {};
		for (const [defId, v] of Object.entries(p.prefill_config ?? {})) {
			prefill[defLabelOf(defId) ?? defId] = v;
		}
		const part: WorkflowProtocolToolPart = {
			attach: p.connection_id
				? {
						type: 'connection',
						from: stageKeyOf(connById.get(p.connection_id)?.from_stage_id) ?? null,
						to: stageKeyOf(connById.get(p.connection_id)?.to_stage_id) ?? '?',
						action: connById.get(p.connection_id)?.action_name ?? 'transition'
					}
				: {
						type: 'stages',
						stages: (p.stage_id ?? []).map((id) => stageKeyOf(id) ?? id),
						...(p.is_global ? { is_global: true } : {})
					},
			name: p.name,
			editable_fields: (p.editable_fields ?? []).map((id) => defLabelOf(id) ?? id),
			...(Object.keys(prefill).length ? { prefill_config: prefill } : {}),
			...(p.allowed_roles?.length ? { allowed_roles: roles.toNames(p.allowed_roles) } : {}),
			...(visualOf(p.visual_config) ? { visual_config: visualOf(p.visual_config) } : {})
		};
		if (p.protocol_form_id) {
			const bf = state.getFormById(p.protocol_form_id)?.data;
			part.form = {
				...(bf?.name ? { name: bf.name } : {}),
				pages: bf?.pages ?? [],
				fields: formFieldsOf(p.protocol_form_id),
				local_fields: (bf?.local_fields ?? []) as NonNullable<
					WorkflowProtocolToolPart['form']
				>['local_fields']
			};
		}
		return part;
	});

	// Automations
	const automations: WorkflowAutomationPart[] = state.visibleAutomations.map((ta) => {
		const a = ta.data;
		const { trigger_config, steps } = remapAutomationRefs(
			(a.trigger_config ?? {}) as unknown as Record<string, unknown>,
			(a.steps ?? []) as unknown as Record<string, unknown>[],
			(id) => stageKeyOf(id) ?? id,
			(id) => defLabelOf(id) ?? id
		);
		return {
			name: a.name,
			trigger_type: a.trigger_type,
			trigger_config,
			execution_mode: a.execution_mode,
			steps,
			is_enabled: a.is_enabled
		};
	});

	// Field tags (single record)
	const ft = state.getFieldTagForWorkflow();
	const fieldTags: WorkflowFieldTagPart[] = (ft?.data.tag_mappings ?? []).map((m) => ({
		tagType: m.tagType,
		field: m.fieldId ? (defLabelOf(m.fieldId) ?? m.fieldId) : null,
		config: m.config ?? {}
	}));

	return {
		ueberblick_part: 'workflow',
		version: PART_VERSION,
		name: state.workflowName,
		private_instances: state.workflowPermissions.private_instances ?? false,
		...(state.workflowPermissions.visible_to_roles?.length
			? { visible_to_roles: roles.toNames(state.workflowPermissions.visible_to_roles) }
			: {}),
		field_defs: fieldDefs,
		stages: stageParts,
		connections: connectionParts,
		forms,
		edit_tools: editTools,
		protocol_tools: protocolTools,
		automations,
		field_tags: fieldTags
	};
}

/** Serialize a tool's attachment (shared by edit tools). */
function attachOfTool(
	isGlobal: boolean,
	connectionId: string | undefined,
	stageIds: string[] | undefined,
	stageKeyOf: (id: string) => string | undefined
): WorkflowFormPart['attach'] {
	if (isGlobal) return { type: 'global' };
	if (connectionId) return { type: 'connection', from: null, to: '?', action: 'transition' };
	const first = stageIds?.[0];
	return first ? { type: 'stage', stage: stageKeyOf(first) ?? first } : { type: 'global' };
}

// ===========================================================================
// Apply:  WorkflowPart -> state (reconcile)
// ===========================================================================

export function applyWorkflowPart(
	state: WorkflowBuilderState,
	part: WorkflowPart,
	opts: Opts = {}
): WorkflowApplyResult {
	const warnings: string[] = [];
	const roles = roleCodec(opts.roles);
	const rolesToIds = (names?: string[]) =>
		roles.toIds(names, (n) => warnings.push(`Unknown role "${n}" dropped.`));

	// --- 1. Field defs (by label) ------------------------------------------
	const defByLabel = new Map<string, { id: string }>();
	for (const d of state.fieldDefs) {
		if (d.status !== 'deleted') defByLabel.set(d.data.label, { id: d.data.id });
	}
	const labelToDefId = new Map<string, string>();
	const yamlDefLabels = new Set<string>();
	const smartDefs: Array<{ label: string; options: Record<string, unknown> }> = [];

	for (const pd of part.field_defs) {
		yamlDefLabels.add(pd.label);
		const opts2 = pd.field_options ? { ...pd.field_options } : null;
		if (pd.field_type === 'smart_dropdown' && opts2 && 'source_field_label' in opts2) {
			smartDefs.push({ label: pd.label, options: opts2 });
		}
		const patch: Partial<WorkflowFieldDef> = {
			label: pd.label,
			field_type: pd.field_type,
			write_mode: pd.write_mode ?? 'singleton',
			field_options: opts2,
			validation_rules: pd.validation_rules ?? null
		};
		if (pd.output_type !== undefined) patch.output_type = pd.output_type;
		if (pd.compute_expression !== undefined) patch.compute_expression = pd.compute_expression;
		if (pd.view_roles !== undefined) patch.view_roles = rolesToIds(pd.view_roles);
		if (pd.display_config !== undefined)
			patch.display_config = (pd.display_config as FieldDisplayConfig | null) ?? null;
		const existing = defByLabel.get(pd.label);
		if (existing) {
			if (defChanged(state.getFieldDefById(existing.id), patch))
				state.updateFieldDef(existing.id, patch);
			labelToDefId.set(pd.label, existing.id);
		} else {
			const created = state.addFieldDef(patch);
			labelToDefId.set(pd.label, created.id);
			defByLabel.set(pd.label, { id: created.id });
		}
	}
	for (const d of state.visibleFieldDefs) {
		if (d.data.id.startsWith('_temp_')) continue;
		if (!yamlDefLabels.has(d.data.label)) state.deleteFieldDef(d.data.id);
	}
	const fieldLabelToId = (label: string) => labelToDefId.get(label);

	// --- 2. Stages (by key) ------------------------------------------------
	const existingStageKey = buildStageKeys(state.visibleStages.map((s) => s.data));
	const stageIdByKey = new Map<string, string>();
	for (const s of state.visibleStages) {
		const k = existingStageKey.get(s.data.id);
		if (k) stageIdByKey.set(k, s.data.id);
	}
	const keyToStageId = new Map<string, string>();
	const yamlStageKeys = new Set<string>();
	for (const ps of part.stages) {
		yamlStageKeys.add(ps.key);
		const existingId = stageIdByKey.get(ps.key);
		if (existingId) {
			state.updateStage(existingId, {
				stage_name: ps.name,
				stage_type: ps.type as StageType,
				...(ps.x != null ? { position_x: ps.x } : {}),
				...(ps.y != null ? { position_y: ps.y } : {})
			});
			keyToStageId.set(ps.key, existingId);
		} else {
			const created = state.addStage(ps.type as StageType, { x: ps.x ?? 100, y: ps.y ?? 100 });
			state.updateStage(created.id, { stage_name: ps.name });
			keyToStageId.set(ps.key, created.id);
		}
	}
	for (const [key, id] of stageIdByKey) {
		if (!yamlStageKeys.has(key)) state.deleteStage(id, false);
	}
	const stageKeyToId = (key: string) => keyToStageId.get(key);

	// --- 3. Connections (by from|to|action) --------------------------------
	const stageKeyOfId = (id: string | null): string | null => {
		if (!id) return null;
		for (const [k, sid] of keyToStageId) if (sid === id) return k;
		return null;
	};
	const connByIdentity = new Map<string, string>();
	for (const c of state.visibleConnections) {
		connByIdentity.set(
			connIdentity(
				stageKeyOfId(c.data.from_stage_id),
				stageKeyOfId(c.data.to_stage_id) ?? '?',
				c.data.action_name
			),
			c.data.id
		);
	}
	const yamlConnIdentities = new Set<string>();
	for (const pc of part.connections) {
		const toId = pc.to ? keyToStageId.get(pc.to) : undefined;
		if (!toId) {
			warnings.push(`Connection → unknown stage "${pc.to}" skipped.`);
			continue;
		}
		const fromId = pc.from ? keyToStageId.get(pc.from) : null;
		if (pc.from && !fromId) {
			warnings.push(`Connection from unknown stage "${pc.from}" skipped.`);
			continue;
		}
		const ident = connIdentity(pc.from, pc.to, pc.action);
		yamlConnIdentities.add(ident);
		const updates = {
			action_name: pc.action,
			visual_config: connVisual(pc),
			...(pc.allowed_roles !== undefined ? { allowed_roles: rolesToIds(pc.allowed_roles) } : {}),
			...(pc.sentry !== undefined
				? {
						sentry: pc.sentry
							.map((s): SentryClause | null => {
								const fid = fieldLabelToId(s.field);
								if (!fid) {
									warnings.push(
										`Sentry on "${pc.action}" references unknown field "${s.field}" — dropped.`
									);
									return null;
								}
								return {
									field_def_id: fid,
									op: s.op,
									...(s.value !== undefined ? { value: s.value } : {})
								};
							})
							.filter((x): x is SentryClause => x !== null)
					}
				: {})
		};
		const existingId = connByIdentity.get(ident);
		if (existingId) {
			state.updateConnection(existingId, updates);
		} else {
			const created =
				fromId == null ? state.addEntryConnection(toId) : state.addConnection(fromId, toId);
			state.updateConnection(created.id, updates);
		}
	}
	for (const [ident, id] of connByIdentity) {
		if (!yamlConnIdentities.has(ident)) state.deleteConnection(id);
	}

	// Fresh connection identity map (incl. just-created connections) for form/tool attach.
	const connIdentToId = new Map<string, string>();
	for (const c of state.visibleConnections) {
		connIdentToId.set(
			connIdentity(
				stageKeyOfId(c.data.from_stage_id),
				stageKeyOfId(c.data.to_stage_id) ?? '?',
				c.data.action_name
			),
			c.data.id
		);
	}

	// --- 4. Forms (by attachment + name) -----------------------------------
	const protocolFormIds = new Set(
		state.visibleProtocolTools.map((p) => p.data.protocol_form_id).filter(Boolean) as string[]
	);
	const connById = new Map(state.visibleConnections.map((c) => [c.data.id, c.data]));
	const formKeyOf = (f: ToolsForm): string => {
		if (f.stage_id) return `stage:${stageKeyOfId(f.stage_id)}`;
		if (f.connection_id) {
			const c = connById.get(f.connection_id);
			return `conn:${connIdentity(
				c ? stageKeyOfId(c.from_stage_id) : null,
				c ? (stageKeyOfId(c.to_stage_id) ?? '?') : '?',
				c?.action_name ?? 'transition'
			)}`;
		}
		return 'global';
	};
	const existingFormByKey = new Map<string, string>();
	for (const tf of state.visibleForms) {
		if (protocolFormIds.has(tf.data.id)) continue;
		existingFormByKey.set(`${formKeyOf(tf.data)}|${tf.data.name}`, tf.data.id);
	}
	const yamlFormKeys = new Set<string>();
	for (const pf of part.forms) {
		const target = resolveFormTarget(pf.attach, keyToStageId, connIdentToId);
		if (!target) {
			warnings.push(`Form "${pf.name}" has an unresolved attachment and was skipped.`);
			continue;
		}
		const attachKey = formAttachKeyOf(pf.attach);
		const fullKey = `${attachKey}|${pf.name}`;
		yamlFormKeys.add(fullKey);
		let formId = existingFormByKey.get(fullKey);
		const isConnForm = pf.attach.type === 'connection';
		if (!formId) {
			const created = state.addForm(target);
			formId = created.id;
			const init: Partial<ToolsForm> = { name: pf.name, pages: pf.pages ?? [] };
			if (!isConnForm) {
				// addForm() stamps a default visual_config { button_label: 'Submit' }
				// and allowed_roles: [] on stage/global forms. Override them with the
				// YAML's values — and CLEAR the default button when the YAML omits it,
				// so a source form with no button doesn't gain a spurious "Submit".
				init.visual_config = pf.visual_config;
				init.allowed_roles = pf.allowed_roles ? rolesToIds(pf.allowed_roles) : [];
			}
			state.updateForm(formId, init);
		} else {
			const upd: Partial<ToolsForm> = { pages: pf.pages ?? [] };
			if (!isConnForm) {
				if (pf.allowed_roles !== undefined) upd.allowed_roles = rolesToIds(pf.allowed_roles);
				if (pf.visual_config !== undefined) upd.visual_config = pf.visual_config;
			}
			state.updateForm(formId, upd);
		}
		reconcileFormFields(state, formId, pf.fields, fieldLabelToId, pf.name, warnings);
	}
	for (const [key, id] of existingFormByKey) {
		if (!yamlFormKeys.has(key)) state.deleteForm(id);
	}

	// --- 5. Edit tools (optional, by attachment + name) --------------------
	if (part.edit_tools !== undefined) {
		const keyOfEdit = (e: ToolsEdit) =>
			`${editAttachKey(e.is_global, e.connection_id, e.stage_id, stageKeyOfId)}|${e.name}`;
		const existing = new Map<string, string>();
		for (const te of state.visibleEditTools) existing.set(keyOfEdit(te.data), te.data.id);
		const seen = new Set<string>();
		for (const pe of part.edit_tools) {
			const target = resolveEditTarget(pe.attach, keyToStageId, connIdentToId);
			if (!target) {
				warnings.push(`Edit tool "${pe.name}" has an unresolved attachment — skipped.`);
				continue;
			}
			const fullKey = `${editAttachKeyFromPart(pe.attach)}|${pe.name}`;
			seen.add(fullKey);
			let toolId = existing.get(fullKey);
			if (!toolId) {
				const created =
					target.kind === 'global'
						? state.addGlobalEditTool(pe.edit_mode)
						: state.addEditTool(target.target);
				toolId = created.id;
			}
			state.updateEditTool(toolId, {
				name: pe.name,
				edit_mode: pe.edit_mode,
				editable_fields: pe.editable_fields
					.map((l) => fieldLabelToId(l))
					.filter((x): x is string => !!x),
				...(pe.self_edit_roles !== undefined
					? { self_edit_roles: rolesToIds(pe.self_edit_roles) }
					: {}),
				...(pe.any_edit_roles !== undefined
					? { any_edit_roles: rolesToIds(pe.any_edit_roles) }
					: {}),
				...(pe.visual_config !== undefined ? { visual_config: pe.visual_config } : {})
			});
		}
		for (const [key, id] of existing) if (!seen.has(key)) state.deleteEditTool(id);
	}

	// --- 6. Protocol tools (optional, by attachment + name) ----------------
	if (part.protocol_tools !== undefined) {
		const keyOfProto = (p: ToolsProtocol) =>
			`${protoAttachKey(p.connection_id, p.stage_id, p.is_global, stageKeyOfId)}|${p.name}`;
		const existing = new Map<string, ToolsProtocol>();
		for (const tp of state.visibleProtocolTools) existing.set(keyOfProto(tp.data), tp.data);
		const seen = new Set<string>();
		for (const pp of part.protocol_tools) {
			const fullKey = `${protoAttachKeyFromPart(pp.attach)}|${pp.name}`;
			seen.add(fullKey);
			const existingTool = existing.get(fullKey);
			applyProtocolTool(state, pp, existingTool, {
				keyToStageId,
				connIdentToId,
				fieldLabelToId,
				rolesToIds,
				warnings
			});
		}
		for (const [key, p] of existing) if (!seen.has(key)) state.deleteProtocolTool(p.id);
	}

	// --- 7. Automations (optional, by name) --------------------------------
	if (part.automations !== undefined) {
		const existing = new Map<string, string>();
		for (const ta of state.visibleAutomations) existing.set(ta.data.name, ta.data.id);
		const seen = new Set<string>();
		for (const pa of part.automations) {
			seen.add(pa.name);
			const { trigger_config, steps } = remapAutomationRefs(
				pa.trigger_config,
				pa.steps,
				(key) => stageKeyToId(key) ?? key,
				(label) => fieldLabelToId(label) ?? label
			);
			const updates: Partial<ToolsAutomation> = {
				name: pa.name,
				trigger_type: pa.trigger_type,
				trigger_config: trigger_config as unknown as ToolsAutomation['trigger_config'],
				execution_mode: pa.execution_mode,
				steps: steps as unknown as ToolsAutomation['steps'],
				is_enabled: pa.is_enabled
			};
			let id = existing.get(pa.name);
			if (!id) id = state.addAutomation(pa.trigger_type).id;
			state.updateAutomation(id, updates);
		}
		for (const [name, id] of existing) if (!seen.has(name)) state.deleteAutomation(id);
	}

	// --- 8. Field tags (optional, singleton record) ------------------------
	if (part.field_tags !== undefined) {
		if (part.field_tags.length === 0) {
			state.deleteFieldTag();
		} else {
			const tag = state.getOrCreateFieldTag();
			const mappings = part.field_tags.map((m) => ({
				tagType: m.tagType,
				fieldId: m.field ? (fieldLabelToId(m.field) ?? null) : null,
				config: m.config ?? {}
			}));
			state.updateFieldTag(tag.id, { tag_mappings: mappings });
		}
	}

	// --- 9. Workflow-level fields ------------------------------------------
	state.workflowName = part.name;
	const wfPatch: { private_instances?: boolean; visible_to_roles?: string[] } = {};
	if (part.private_instances != null) wfPatch.private_instances = part.private_instances;
	if (part.visible_to_roles !== undefined)
		wfPatch.visible_to_roles = rolesToIds(part.visible_to_roles);
	if (Object.keys(wfPatch).length) state.updateWorkflowPermissions(wfPatch);

	// --- 10. Resolve deferred smart_dropdown sources -----------------------
	for (const sd of smartDefs) {
		const defId = labelToDefId.get(sd.label);
		if (!defId) continue;
		const o = { ...sd.options };
		const srcLabel = o.source_field_label;
		delete o.source_field_label;
		if (typeof srcLabel === 'string' && srcLabel) {
			const srcId = labelToDefId.get(srcLabel);
			if (srcId) o.source_field = srcId;
			else warnings.push(`Smart dropdown "${sd.label}" references unknown source "${srcLabel}".`);
		}
		const stageKey = o.source_stage;
		delete o.source_stage;
		if (typeof stageKey === 'string' && stageKey) {
			const sid = keyToStageId.get(stageKey);
			if (sid) o.source_stage_id = sid;
		}
		if (defChanged(state.getFieldDefById(defId), { field_options: o })) {
			state.updateFieldDef(defId, { field_options: o });
		}
	}

	return { warnings };
}

// ---------------------------------------------------------------------------
// Apply sub-helpers
// ---------------------------------------------------------------------------

function connVisual(pc: WorkflowConnectionPart): VisualConfig {
	return {
		...(pc.button_label ? { button_label: pc.button_label } : {}),
		...(pc.button_color ? { button_color: pc.button_color } : {}),
		...(pc.button_icon ? { button_icon: pc.button_icon } : {}),
		...(pc.requires_confirmation ? { requires_confirmation: true } : {}),
		...(pc.confirmation_message ? { confirmation_message: pc.confirmation_message } : {})
	};
}

function formAttachKeyOf(attach: WorkflowFormPart['attach']): string {
	if (attach.type === 'stage') return `stage:${attach.stage}`;
	if (attach.type === 'connection')
		return `conn:${connIdentity(attach.from, attach.to, attach.action)}`;
	return 'global';
}

function resolveFormTarget(
	attach: WorkflowFormPart['attach'],
	keyToStageId: Map<string, string>,
	connIdentToId: Map<string, string>
): { connectionId: string } | { stageId: string } | { isGlobal: true } | null {
	if (attach.type === 'global') return { isGlobal: true };
	if (attach.type === 'stage') {
		const sid = keyToStageId.get(attach.stage);
		return sid ? { stageId: sid } : null;
	}
	const cid = connIdentToId.get(connIdentity(attach.from, attach.to, attach.action));
	return cid ? { connectionId: cid } : null;
}

function editAttachKey(
	isGlobal: boolean,
	connectionId: string | undefined,
	stageIds: string[] | undefined,
	stageKeyOfId: (id: string | null) => string | null
): string {
	if (isGlobal) return 'global';
	if (connectionId) return 'conn';
	return `stage:${stageKeyOfId(stageIds?.[0] ?? null)}`;
}
function editAttachKeyFromPart(attach: WorkflowFormPart['attach']): string {
	if (attach.type === 'global') return 'global';
	if (attach.type === 'connection') return 'conn';
	return `stage:${attach.stage}`;
}
function resolveEditTarget(
	attach: WorkflowFormPart['attach'],
	keyToStageId: Map<string, string>,
	connIdentToId: Map<string, string>
):
	| { kind: 'global'; target?: undefined }
	| { kind: 'plain'; target: { stageId: string } | { connectionId: string } }
	| null {
	if (attach.type === 'global') return { kind: 'global' };
	if (attach.type === 'stage') {
		const sid = keyToStageId.get(attach.stage);
		return sid ? { kind: 'plain', target: { stageId: sid } } : null;
	}
	const cid = connIdentToId.get(connIdentity(attach.from, attach.to, attach.action));
	return cid ? { kind: 'plain', target: { connectionId: cid } } : null;
}

function protoAttachKey(
	connectionId: string | undefined,
	stageIds: string[] | undefined,
	isGlobal: boolean,
	stageKeyOfId: (id: string | null) => string | null
): string {
	if (connectionId) return 'conn';
	const keys = (stageIds ?? []).map((id) => stageKeyOfId(id)).sort();
	return `stages:${isGlobal ? 'g:' : ''}${keys.join(',')}`;
}
function protoAttachKeyFromPart(attach: WorkflowProtocolToolPart['attach']): string {
	if (attach.type === 'connection') return 'conn';
	const keys = [...attach.stages].sort();
	return `stages:${attach.is_global ? 'g:' : ''}${keys.join(',')}`;
}

function applyProtocolTool(
	state: WorkflowBuilderState,
	pp: WorkflowProtocolToolPart,
	existing: ToolsProtocol | undefined,
	ctx: {
		keyToStageId: Map<string, string>;
		connIdentToId: Map<string, string>;
		fieldLabelToId: (l: string) => string | undefined;
		rolesToIds: (names?: string[]) => string[];
		warnings: string[];
	}
) {
	const { keyToStageId, connIdentToId, fieldLabelToId, rolesToIds, warnings } = ctx;

	// Resolve attachment.
	let connectionId: string | undefined;
	let stageIds: string[] = [];
	let isGlobal = false;
	let firstStageId: string | undefined;
	if (pp.attach.type === 'connection') {
		connectionId = connIdentToId.get(connIdentity(pp.attach.from, pp.attach.to, pp.attach.action));
		if (!connectionId) {
			warnings.push(`Protocol "${pp.name}" has an unresolved connection — skipped.`);
			return;
		}
	} else {
		isGlobal = !!pp.attach.is_global;
		stageIds = pp.attach.stages.map((k) => keyToStageId.get(k)).filter((x): x is string => !!x);
		firstStageId = stageIds[0];
	}

	let toolId = existing?.id;
	if (!toolId) {
		const created = state.addProtocolTool(
			connectionId ? { connectionId } : isGlobal ? { isGlobal: true } : { stageId: firstStageId }
		);
		toolId = created.id;
	}

	const editableIds = pp.editable_fields
		.map((l) => fieldLabelToId(l))
		.filter((x): x is string => !!x);
	const prefill: Record<string, boolean> = {};
	for (const [label, v] of Object.entries(pp.prefill_config ?? {})) {
		const id = fieldLabelToId(label);
		if (id) prefill[id] = v;
	}

	state.updateProtocolTool(toolId, {
		name: pp.name,
		editable_fields: editableIds,
		prefill_config: prefill,
		...(pp.attach.type === 'stages' ? { stage_id: stageIds, is_global: isGlobal } : {}),
		...(pp.allowed_roles !== undefined ? { allowed_roles: rolesToIds(pp.allowed_roles) } : {}),
		...(pp.visual_config !== undefined ? { visual_config: pp.visual_config } : {})
	});

	// Backing form. The builder creates it detached from any connection:
	// `addForm({ stageId })` where stageId is the protocol's first stage, or
	// undefined → fully detached (the source's connection-attached protocol has a
	// DETACHED backing form). Attaching it to the connection would diverge from
	// the source and cascade-delete with the connection. It's hidden from the
	// regular form lists via protocol_form_id, so it never renders as a button.
	if (pp.form) {
		const tool = state.getProtocolToolById(toolId)!;
		let formId = tool.data.protocol_form_id;
		if (!formId) {
			// stageId may be undefined → a fully detached form (same call the builder
			// makes in handleEditProtocolForm); cast to satisfy addForm's signature.
			const form = state.addForm({ stageId: firstStageId } as { stageId: string });
			formId = form.id;
			state.updateProtocolTool(toolId, { protocol_form_id: formId });
			// Strip addForm's default Submit button — backing forms carry none.
			state.updateForm(formId, { visual_config: undefined, allowed_roles: [] });
		}
		state.updateForm(formId, {
			name: pp.form.name ?? `${pp.name} Form`,
			pages: pp.form.pages ?? [],
			local_fields: (pp.form.local_fields ?? []) as ToolsForm['local_fields']
		});
		reconcileFormFields(state, formId, pp.form.fields ?? [], fieldLabelToId, pp.name, warnings);
	}
}

/** Reconcile a form's registry field refs against the part (add/update/delete by def label). */
function reconcileFormFields(
	state: WorkflowBuilderState,
	formId: string,
	fields: Array<{
		field: string;
		page?: number;
		row?: number;
		column?: ColumnPosition;
		required?: boolean;
		placeholder?: string | null;
		help_text?: string | null;
		conditional_logic?: ConditionalLogic | null;
	}>,
	fieldLabelToId: (l: string) => string | undefined,
	formName: string,
	warnings: string[]
) {
	const existing = state.getFieldsForForm(formId);
	const existingByLabel = new Map(existing.map((f) => [f.data.field_label, f.data]));
	const yamlLabels = new Set<string>();

	fields.forEach((field, index) => {
		const defId = fieldLabelToId(field.field);
		if (!defId) {
			warnings.push(
				`Form "${formName}" references field "${field.field}" with no matching def — skipped.`
			);
			return;
		}
		yamlLabels.add(field.field);
		const page = field.page ?? 1;
		const row = field.row ?? index;
		const column: ColumnPosition = field.column ?? 'full';
		const logic = remapLogicLabels(
			field.conditional_logic,
			(label) => fieldLabelToId(label),
			(missing) =>
				warnings.push(
					`Conditional logic on "${field.field}" references unknown field "${missing}" — rule dropped.`
				)
		);
		const presentation = {
			page,
			row_index: row,
			column_position: column,
			is_required: field.required ?? false,
			placeholder: field.placeholder ?? '',
			help_text: field.help_text ?? '',
			conditional_logic: logic
		};
		const existingRef = existingByLabel.get(field.field);
		if (existingRef) {
			state.updateFormField(existingRef.id, presentation);
		} else {
			const ref = state.addFormFieldRef(formId, defId, row, column, page);
			if (ref) state.updateFormField(ref.id, presentation);
		}
	});

	for (const f of existing) {
		if (!yamlLabels.has(f.data.field_label)) state.deleteFormField(f.data.id);
	}
}

function defChanged(cur: WorkflowFieldDef | undefined, patch: Partial<WorkflowFieldDef>): boolean {
	if (!cur) return true;
	for (const k of Object.keys(patch) as (keyof WorkflowFieldDef)[]) {
		if (!deepEqual(cur[k], patch[k])) return true;
	}
	return false;
}
