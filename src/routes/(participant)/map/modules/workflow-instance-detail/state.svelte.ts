/**
 * WorkflowInstanceDetailState
 *
 * Reactive state management for the WorkflowInstanceDetailModule.
 * Loads workflow instance data, stages, connections, field values, and tools via gateway.
 */

import type { ParticipantGateway } from '$lib/participant-state/gateway.svelte';
import { onDataChange } from '$lib/participant-state/gateway.svelte';
import type { FieldValueCache } from '$lib/participant-state/field-value-cache.svelte';
import { getPocketBase } from '$lib/pocketbase';
import type { Snippet } from 'svelte';
import type { FieldDef, FieldValue as TFieldValue, ToolFormFieldRef, WriteMode } from '$lib/participant-state/types';
import { connectionIsAvailable } from '$lib/workflow-builder/sentry';

// =============================================================================
// Types
// =============================================================================

export interface WorkflowStage {
	id: string;
	workflow_id: string;
	stage_name: string;
	stage_type: 'start' | 'intermediate' | 'end';
	stage_order: number;
	visible_to_roles: string[];
	visual_config?: Record<string, unknown>;
}

export interface WorkflowConnection {
	id: string;
	workflow_id: string;
	from_stage_id: string;
	to_stage_id: string;
	action_name: string;
	allowed_roles: string[];
	/** Phase 3: AND-ed sentry clauses. null/[] = always available. */
	sentry: import('$lib/participant-state/types').SentryClause[] | null;
	visual_config?: {
		button_label?: string;
		button_color?: string;
		confirmation_message?: string;
		requires_confirmation?: boolean;
	};
}

/**
 * Field value — re-exported under module-local name. Backed by
 * `workflow_field_values`. `field_def_id` is the new join key (replaces the
 * old `field_key`); `recorded_at_stage` replaces `stage_id`; `recorded_by_action`
 * replaces `created_by_action`.
 */
export type FieldValue = TFieldValue;

export interface ToolForm {
	id: string;
	workflow_id: string;
	connection_id: string;
	stage_id: string;
	name: string;
	description: string;
	tool_order?: number;
	allowed_roles: string[];
	visual_config?: Record<string, unknown>;
	local_fields?: import('$lib/participant-state/types').ProtocolLocalField[] | null;
}

/**
 * Form field — now sourced by joining `tools_form_field_refs` with the
 * referenced `workflow_field_defs`. Definitional bits (label, type, options,
 * is_required, placeholder, help_text, validation_rules) come from the
 * field def; per-form layout & overrides come from the ref.
 *
 * Note: `id` here is the FIELD DEF id (not the ref id) — every existing
 * read/write path in the detail module keys field values by the def id.
 */
export interface FormField {
	id: string;            // field_def.id
	form_id: string;       // ref.form_id
	field_def_id: string;  // === id; explicit duplicate for clarity
	ref_id: string;        // ref.id
	field_label: string;
	field_type: string;
	field_order: number;
	is_required: boolean;
	placeholder?: string;
	help_text?: string;
	validation_rules?: Record<string, unknown> | null;
	field_options?: Record<string, unknown> | null;
	conditional_logic?: Record<string, unknown> | null;
	page?: number;
	page_title?: string;
	row_index?: number;
	column_position?: 'left' | 'right' | 'full';
	write_mode?: WriteMode;
	display_stage_id?: string;
}

/**
 * @deprecated tools_edit was dropped in the field-def redesign. This type
 * stays only so existing call-sites compile while we sweep the UI. New code
 * should use Form tools referencing already-written field defs instead.
 */
export interface ToolEdit {
	id: string;
	connection_id: string;
	stage_id: string[];
	name: string;
	editable_fields: string[];
	edit_mode: 'form_fields' | 'location';
	is_global: boolean;
	tool_order?: number;
	self_edit_roles: string[];
	any_edit_roles: string[];
	visual_config?: Record<string, unknown>;
}

/**
 * Past protocol-entry view. Built by hydrating workflow_protocol_entries with
 * their canonical snapshot shape (see ProtocolEntrySnapshot in participant-state).
 * Labels are read from the snapshot, never re-resolved from the live field defs.
 */
export interface ProtocolEntryView {
	id: string;
	tool_id: string;
	tool_name: string | null;
	stage_id: string;
	recorded_at: string;
	recorded_by: string;
	kind: 'manual' | 'global_autolog';
	case_fields: Array<{
		field_def_id: string;
		key: string;
		label: string;
		value: unknown;
		write_mode: string;
	}>;
	local_fields: Array<{ key: string; label: string; value: unknown }>;
	autolog: {
		from: string;
		to: string;
		entries: Array<Record<string, unknown>>;
	} | null;
}

export interface ToolProtocol {
	id: string;
	connection_id?: string;
	stage_id: string[];
	is_global: boolean;
	name: string;
	prefill_config?: Record<string, boolean>;
	protocol_form_id?: string;
	tool_order?: number;
	allowed_roles: string[];
	visual_config?: Record<string, unknown>;
}

export interface DisplayFieldValue {
	id: string;
	label: string;
	value: string;
	fileValue?: string;
	type: string;
	fieldKey: string;
}

export interface ToolQueueItem {
	type: 'form' | 'edit' | 'protocol';
	tool: ToolForm | ToolEdit | ToolProtocol;
}

export interface ActionButton {
	id: string;
	label: string;
	icon: Snippet;
	color?: string;
	disabled?: boolean;
	onClick: () => void;
}

export interface EditableFieldsByStage {
	stageId: string;
	stageName: string;
	fields: FormField[];
}

export interface ToolUsageRecord {
	id: string;
	instance_id: string;
	stage_id?: string;
	executed_by: string;
	executed_at: string;
	metadata: {
		action: 'instance_created' | 'form_fill' | 'edit' | 'admin_edit' | 'location_edit' | 'stage_transition' | 'protocol' | 'conflict_resolution';
		stage_name?: string;
		centroid?: { lat: number; lon: number } | null;
		geometry_type?: 'Point' | 'LineString' | 'Polygon' | null;
		// INVARIANT: tool_usage.metadata must NEVER carry raw field values.
		// Values live exclusively in workflow_field_values (gated row-by-row by
		// workflow_field_defs.view_roles). Only identifiers go here, so the
		// audit UI cannot leak role-restricted values through this collection.
		created_fields?: Array<{ field_key: string; field_name?: string }>;
		changes?: Array<{ field_key: string; field_name?: string }>;
		before?: { lat: number; lon: number } | null;
		after?: { lat: number; lon: number };
		from_stage_id?: string;
		from_stage_name?: string;
		to_stage_id?: string;
		to_stage_name?: string;
		connection_id?: string;
		protocol_entry_id?: string;
	};
	created: string;
	expand?: {
		executed_by?: { name?: string; email?: string };
	};
}

// =============================================================================
// State Class
// =============================================================================

export class WorkflowInstanceDetailState {
	private gateway: ParticipantGateway;
	instanceId: string;

	instance = $state<Record<string, unknown> | null>(null);
	workflow = $state<Record<string, unknown> | null>(null);
	stages = $state<WorkflowStage[]>([]);
	connections = $state<WorkflowConnection[]>([]);
	/** Flat list of field-value rows for this instance (singletons + observations). */
	fieldValues = $state<FieldValue[]>([]);
	/** Grouped: field_def_id -> array of value rows (length 1 for singleton/computed, ≥0 for observation). */
	fieldValuesByDefId = $state<Map<string, FieldValue[]>>(new Map());
	forms = $state<ToolForm[]>([]);
	/** All field defs for this workflow, indexed by id. */
	fieldDefs = $state<FieldDef[]>([]);
	fieldDefsById = $state<Map<string, FieldDef>>(new Map());
	fieldDefsByKey = $state<Map<string, FieldDef>>(new Map());
	/** Form-field references (form_id, field_def_id, layout + overrides). */
	formFieldRefs = $state<ToolFormFieldRef[]>([]);
	/** Form-field view, joined from refs + defs. `id` is the field_def id. */
	formFields = $state<FormField[]>([]);
	/** @deprecated tools_edit collection is gone. Always empty. */
	editTools = $state<ToolEdit[]>([]);
	protocolTools = $state<ToolProtocol[]>([]);
	toolUsageHistory = $state<ToolUsageRecord[]>([]);
	/** Past protocol entries for this instance (manual + global_autolog). Loaded by load(). */
	protocolEntries = $state<ProtocolEntryView[]>([]);

	isLoading = $state(true);
	loadError = $state<string | null>(null);
	activeStageTab = $state<string>('');

	currentStage = $derived.by((): WorkflowStage | null => {
		if (!this.instance) return null;
		const currentStageId = this.instance.current_stage_id as string;
		return this.stages.find(s => s.id === currentStageId) || null;
	});

	availableConnections = $derived.by((): WorkflowConnection[] => {
		if (!this.instance) return [];
		const currentStageId = this.instance.current_stage_id as string;
		const fromStage = this.connections.filter(c => c.from_stage_id === currentStageId);
		// Phase 3: sentry-gate. Connections with no sentry stay always-available.
		const ctx = { fieldValuesByDefId: this.fieldValuesByDefId };
		return fromStage.filter(c => connectionIsAvailable(c, ctx));
	});

	availableStageEditTools = $derived.by((): ToolEdit[] => {
		// TODO(field-def-redesign): tools_edit removed; admin should convert to Form tool.
		return [];
	});

	progressPercentage = $derived.by((): number => {
		if (!this.stages.length || !this.instance) return 0;
		const currentStageId = this.instance.current_stage_id as string;
		const currentIndex = this.stages.findIndex(s => s.id === currentStageId);
		if (currentIndex < 0) return 0;
		return Math.round(((currentIndex + 1) / this.stages.length) * 100);
	});

	currentStageIndex = $derived.by((): number => {
		if (!this.stages.length || !this.instance) return 0;
		const currentStageId = this.instance.current_stage_id as string;
		const index = this.stages.findIndex(s => s.id === currentStageId);
		return index >= 0 ? index + 1 : 0;
	});

	private fieldValueCache: FieldValueCache | null;
	private unsubscribeFieldValues: (() => void) | null = null;
	private unsubscribeMetadata: (() => void) | null = null;
	private refreshTimer: ReturnType<typeof setTimeout> | null = null;
	private metadataRefreshTimer: ReturnType<typeof setTimeout> | null = null;

	/**
	 * Collections whose changes affect role/sentry gating, button visibility,
	 * form composition, or the instance's current stage. A change to any of
	 * these triggers a silent metadata reload so $derived (e.g.
	 * availableConnections) recomputes against fresh data.
	 */
	private static METADATA_COLLECTIONS: ReadonlySet<string> = new Set([
		'workflow_instances',
		'workflow_stages',
		'workflow_connections',
		'workflow_field_defs',
		'tools_forms',
		'tools_form_field_refs',
		'tools_protocol',
		'workflow_role_assignments'
	]);

	constructor(instanceId: string, gateway: ParticipantGateway, fieldValueCache?: FieldValueCache) {
		this.instanceId = instanceId;
		this.gateway = gateway;
		this.fieldValueCache = fieldValueCache ?? null;

		this.unsubscribeFieldValues = onDataChange((detail) => {
			if (detail.collection !== 'workflow_field_values') return;
			if (this.refreshTimer) clearTimeout(this.refreshTimer);
			this.refreshTimer = setTimeout(() => {
				this.refreshTimer = null;
				void this.reloadFieldValues();
			}, 100);
		});

		this.unsubscribeMetadata = onDataChange((detail) => {
			if (!WorkflowInstanceDetailState.METADATA_COLLECTIONS.has(detail.collection)) return;
			// For per-record events on workflow_instances, only react to our row.
			const detailId = (detail as { id?: string }).id;
			if (detail.collection === 'workflow_instances' && detailId && detailId !== this.instanceId) return;
			if (this.metadataRefreshTimer) clearTimeout(this.metadataRefreshTimer);
			this.metadataRefreshTimer = setTimeout(() => {
				this.metadataRefreshTimer = null;
				void this.load({ silent: true });
			}, 200);
		});
	}

	private indexFieldValues(values: FieldValue[]): Map<string, FieldValue[]> {
		const map = new Map<string, FieldValue[]>();
		for (const fv of values) {
			const key = (fv as any).field_def_id as string | undefined;
			if (!key) continue;
			let arr = map.get(key);
			if (!arr) { arr = []; map.set(key, arr); }
			arr.push(fv);
		}
		// Sort observation arrays newest-first by recorded_at.
		for (const arr of map.values()) {
			arr.sort((a, b) => (b.recorded_at ?? '').localeCompare(a.recorded_at ?? ''));
		}
		return map;
	}

	private async reloadFieldValues(): Promise<void> {
		try {
			const fresh = this.fieldValueCache
				? this.fieldValueCache.getForInstance(this.instanceId)
				: await this.gateway.collection('workflow_field_values').getFullList({
					filter: `instance_id = "${this.instanceId}"`
				});
			this.fieldValues = fresh as unknown as FieldValue[];
			this.fieldValuesByDefId = this.indexFieldValues(this.fieldValues);
		} catch (error) {
			console.error('[DetailState] reloadFieldValues failed:', error);
		}
	}

	/**
	 * Page older workflow_field_values from the server beyond the offline cache
	 * (which is bounded by OFFLINE_HISTORY_LIMIT). Merges into `fieldValues`
	 * by id (de-duped). Does NOT persist to IndexedDB — view-only.
	 * Returns the number of new rows added.
	 */
	hasMoreOlderValues = $state(true);
	loadingOlderValues = $state(false);
	async loadOlderFieldValues(perPage = 50): Promise<number> {
		if (this.loadingOlderValues) return 0;
		this.loadingOlderValues = true;
		try {
			let beforeIso: string | null = null;
			for (const fv of this.fieldValues) {
				const t = (fv as any).recorded_at as string | undefined;
				if (!t) continue;
				if (!beforeIso || t < beforeIso) beforeIso = t;
			}
			const filterParts = [`instance_id = "${this.instanceId}"`];
			if (beforeIso) filterParts.push(`recorded_at < "${beforeIso}"`);
			const page = await this.gateway.collection('workflow_field_values').getList(1, perPage, {
				filter: filterParts.join(' && '),
				sort: '-recorded_at'
			});
			const items = (page.items ?? []) as unknown as FieldValue[];
			if (items.length === 0) {
				this.hasMoreOlderValues = false;
				return 0;
			}
			const existing = new Set(this.fieldValues.map((fv) => fv.id));
			const additions = items.filter((fv) => !existing.has(fv.id));
			if (additions.length === 0) {
				this.hasMoreOlderValues = false;
				return 0;
			}
			this.fieldValues = [...this.fieldValues, ...additions];
			this.fieldValuesByDefId = this.indexFieldValues(this.fieldValues);
			if (items.length < perPage) this.hasMoreOlderValues = false;
			return additions.length;
		} catch (error) {
			console.error('[DetailState] loadOlderFieldValues failed:', error);
			return 0;
		} finally {
			this.loadingOlderValues = false;
		}
	}

	dispose(): void {
		if (this.refreshTimer) {
			clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}
		if (this.metadataRefreshTimer) {
			clearTimeout(this.metadataRefreshTimer);
			this.metadataRefreshTimer = null;
		}
		if (this.unsubscribeFieldValues) {
			this.unsubscribeFieldValues();
			this.unsubscribeFieldValues = null;
		}
		if (this.unsubscribeMetadata) {
			this.unsubscribeMetadata();
			this.unsubscribeMetadata = null;
		}
	}

	async load(opts: { silent?: boolean } = {}): Promise<void> {
		if (!opts.silent) this.isLoading = true;
		this.loadError = null;
		const t0 = performance.now();

		try {
			const instanceResult = await this.gateway.collection('workflow_instances').getOne(this.instanceId, {
				expand: 'workflow_id'
			});
			const tInstance = performance.now();
			console.log(`[DetailLoad] getOne instance: ${(tInstance - t0).toFixed(1)}ms`);

			this.instance = instanceResult;
			const expanded = instanceResult.expand as Record<string, unknown> | undefined;
			this.workflow = (expanded?.workflow_id as Record<string, unknown>) || null;

			const workflowId = instanceResult.workflow_id as string;

			const p1Start = performance.now();
			const [stagesResult, connectionsResult, fieldValuesResult, formsResult, toolUsageResult, fieldDefsResult] = await Promise.all([
				this.gateway.collection('workflow_stages').getFullList({
					filter: `workflow_id = "${workflowId}"`,
					sort: 'stage_order'
				}),
				this.gateway.collection('workflow_connections').getFullList({
					filter: `workflow_id = "${workflowId}"`
				}),
				(this.fieldValueCache
					? Promise.resolve(this.fieldValueCache.getForInstance(this.instanceId))
					: this.gateway.collection('workflow_field_values').getFullList({
						filter: `instance_id = "${this.instanceId}"`
					})
				),
				this.gateway.collection('tools_forms').getFullList({
					filter: `workflow_id = "${workflowId}"`
				}),
				this.gateway.collection('workflow_instance_tool_usage').getFullList({
					filter: `instance_id = "${this.instanceId}"`,
					sort: '-executed_at',
					expand: 'executed_by'
				}),
				this.gateway.collection('workflow_field_defs').getFullList({
					filter: `workflow_id = "${workflowId}"`
				})
			]);
			console.log(`[DetailLoad] Phase 1 total: ${(performance.now() - p1Start).toFixed(1)}ms`);

			this.stages = stagesResult as unknown as WorkflowStage[];
			this.connections = connectionsResult as unknown as WorkflowConnection[];
			this.fieldValues = fieldValuesResult as unknown as FieldValue[];
			this.fieldValuesByDefId = this.indexFieldValues(this.fieldValues);
			this.forms = formsResult as unknown as ToolForm[];
			this.toolUsageHistory = toolUsageResult as unknown as ToolUsageRecord[];
			this.fieldDefs = (fieldDefsResult as unknown as FieldDef[]).map(d => ({
				...d,
				field_options: this.parseFieldOptions((d as any).field_options) as any
			}));
			const byId = new Map<string, FieldDef>();
			const byKey = new Map<string, FieldDef>();
			for (const d of this.fieldDefs) {
				byId.set(d.id, d);
				if (d.key) byKey.set(d.key, d);
			}
			this.fieldDefsById = byId;
			this.fieldDefsByKey = byKey;

			const connectionIds = new Set(this.connections.map(c => c.id));
			const stageIds = new Set(this.stages.map(s => s.id));

			const p2Start = performance.now();
			const [formFieldRefsResult, protocolToolsResult] = await Promise.all([
				this.gateway.collection('tools_form_field_refs').getFullList(),
				this.gateway.collection('tools_protocol').getFullList()
			]);
			console.log(`[DetailLoad] Phase 2 total: ${(performance.now() - p2Start).toFixed(1)}ms`);

			// tools_edit was dropped. Keep editTools as an empty list so any
			// remaining references don't crash.
			this.editTools = [];

			// Filter refs to those whose form belongs to this workflow.
			const formIds = new Set(this.forms.map(f => f.id));
			this.formFieldRefs = (formFieldRefsResult as unknown as ToolFormFieldRef[])
				.filter(r => formIds.has(r.form_id));

			// Join refs with field defs to produce the flat FormField view.
			this.formFields = this.formFieldRefs
				.map(ref => {
					const def = byId.get(ref.field_def_id);
					if (!def) return null;
					const ff: FormField = {
						id: def.id,
						field_def_id: def.id,
						ref_id: ref.id,
						form_id: ref.form_id,
						field_label: def.label,
						field_type: def.field_type,
						field_order: ref.field_order ?? 0,
						is_required: ref.is_required_override ?? def.is_required ?? false,
						placeholder: ref.placeholder_override || def.placeholder || undefined,
						help_text: ref.help_text_override || def.help_text || undefined,
						validation_rules: def.validation_rules ?? null,
						field_options: this.parseFieldOptions(def.field_options),
						conditional_logic: ref.conditional_logic ?? null,
						page: ref.page ?? 1,
						page_title: ref.page_title ?? '',
						row_index: ref.row_index ?? 0,
						column_position: this.normalizeColumnPosition(ref.column_position),
						write_mode: def.write_mode,
						display_stage_id: def.display_stage_id || undefined
					};
					return ff;
				})
				.filter((f): f is FormField => f !== null);

			this.protocolTools = (protocolToolsResult as unknown as ToolProtocol[]).filter(p => {
				if (p.is_global) return false;
				if (p.connection_id && connectionIds.has(p.connection_id)) return true;
				if (p.stage_id && p.stage_id.some(sid => stageIds.has(sid))) return true;
				return false;
			});

			// Load protocol-entry history for this instance (manual + global_autolog).
			try {
				const entriesResult = await this.gateway.collection('workflow_protocol_entries').getFullList({
					filter: `instance_id = "${this.instanceId}"`,
					sort: '-recorded_at'
				});
				this.protocolEntries = (entriesResult as unknown as Array<Record<string, unknown>>).map((row) => {
					let snapshot: any = {};
					const raw = row.snapshot;
					if (typeof raw === 'string') {
						try { snapshot = JSON.parse(raw); } catch { snapshot = {}; }
					} else if (raw && typeof raw === 'object') {
						snapshot = raw;
					}
					const toolId = row.tool_id as string;
					const tool = this.protocolTools.find((t) => t.id === toolId);
					return {
						id: row.id as string,
						tool_id: toolId,
						tool_name: tool?.name ?? null,
						stage_id: row.stage_id as string,
						recorded_at: row.recorded_at as string,
						recorded_by: row.recorded_by as string,
						kind: (snapshot.kind as 'manual' | 'global_autolog') ?? 'manual',
						case_fields: Array.isArray(snapshot.case_fields) ? snapshot.case_fields : [],
						local_fields: Array.isArray(snapshot.local_fields) ? snapshot.local_fields : [],
						autolog: snapshot.autolog ?? null
					};
				});
			} catch (error) {
				console.warn('[DetailState] failed to load protocol entries:', error);
				this.protocolEntries = [];
			}

			if (this.stages.length > 0 && !this.activeStageTab) {
				const firstWithData = this.stages.find(s => this.stageHasData(s.id));
				this.activeStageTab = firstWithData?.id || this.stages[0].id;
			}

			console.log(`[DetailLoad] TOTAL: ${(performance.now() - t0).toFixed(1)}ms`);
			if (!opts.silent) this.isLoading = false;
		} catch (error) {
			console.error('Failed to load workflow instance:', error);
			this.loadError = error instanceof Error ? error.message : 'Failed to load workflow instance';
			if (!opts.silent) this.isLoading = false;
		}
	}

	async refresh(): Promise<void> {
		await this.load();
	}

	/**
	 * Map a field def id to the stage that should "own" it for read-side rendering.
	 *   1. Explicit display_stage_id wins.
	 *   2. Otherwise: if the def is referenced from exactly one form, fall back to
	 *      that form's stage (direct or via the form's connection's to_stage_id).
	 */
	private getDisplayStageIdForDef(defId: string): string | null {
		const def = this.fieldDefsById.get(defId);
		if (def?.display_stage_id) return def.display_stage_id;
		const refs = this.formFieldRefs.filter(r => r.field_def_id === defId);
		if (refs.length === 1) {
			const form = this.forms.find(f => f.id === refs[0].form_id);
			if (form) {
				if (form.stage_id) return form.stage_id;
				if (form.connection_id) {
					const conn = this.connections.find(c => c.id === form.connection_id);
					if (conn) return conn.to_stage_id;
				}
			}
		}
		// Fallback: stage where the value was actually recorded. Keeps data
		// visible for defs that have no display_stage_id and are referenced
		// by 0 or >1 forms (e.g. shared across connections).
		const stageIds = new Set(this.stages.map(s => s.id));
		const values = this.fieldValuesByDefId.get(defId) ?? [];
		for (const v of values) {
			const stageId = (v as any).recorded_at_stage as string | undefined;
			if (stageId && stageIds.has(stageId)) return stageId;
		}
		return null;
	}

	/** Return field-def ids displayed on a given stage, deduplicated. */
	private getFieldDefIdsForStage(stageId: string): string[] {
		const out = new Set<string>();
		for (const def of this.fieldDefs) {
			if (this.getDisplayStageIdForDef(def.id) === stageId) out.add(def.id);
		}
		return [...out];
	}

	/** Get field values for a specific stage (read view). */
	getFieldValuesForStage(stageId: string): DisplayFieldValue[] {
		const defIds = this.getFieldDefIdsForStage(stageId);
		const out: DisplayFieldValue[] = [];
		for (const defId of defIds) {
			const def = this.fieldDefsById.get(defId);
			if (!def) continue;
			const values = this.fieldValuesByDefId.get(defId) ?? [];
			// observation: take latest; singleton/computed: single row
			const latest = values[0];
			if (!latest) continue;
			out.push({
				id: latest.id,
				label: def.label,
				value: latest.value,
				fileValue: latest.file_value || undefined,
				type: def.field_type,
				fieldKey: def.id
			});
		}
		return out;
	}

	private parseFieldOptions(options: unknown): Record<string, unknown> | null {
		if (!options) return null;
		if (typeof options === 'object') return options as Record<string, unknown>;
		if (typeof options === 'string') {
			try { return JSON.parse(options); } catch { return null; }
		}
		return null;
	}

	private normalizeColumnPosition(v: unknown): 'left' | 'right' | 'full' {
		return v === 'left' || v === 'right' ? v : 'full';
	}

	private parseFieldValue(value: string | undefined): unknown {
		if (!value) return undefined;
		if (value.startsWith('[') || value.startsWith('{')) {
			try { return JSON.parse(value); } catch { return value; }
		}
		return value;
	}

	/**
	 * Get fields formatted for FormRenderer (with layout and values).
	 * Iterates field defs displayed on the stage, prefilling from the latest
	 * value (singleton row, or newest observation).
	 */
	getFieldsForFormRenderer(stageId: string): Array<FormField & { value?: unknown; fileValue?: string; fileRecordId?: string; storedFiles?: Array<{ recordId: string; fileName: string }>; valueHistory?: Array<{ id: string; value: unknown; recorded_at: string }> }> {
		const defIds = this.getFieldDefIdsForStage(stageId);
		const out: Array<FormField & { value?: unknown; fileValue?: string; fileRecordId?: string; storedFiles?: Array<{ recordId: string; fileName: string }>; valueHistory?: Array<{ id: string; value: unknown; recorded_at: string }> }> = [];
		for (const defId of defIds) {
			// Pick the first form-field row for this def (layout/labels). If no form
			// references this def we fabricate a minimal row from the def itself.
			const ff = this.formFields.find(f => f.id === defId);
			const def = this.fieldDefsById.get(defId);
			if (!def) continue;
			const values = this.fieldValuesByDefId.get(defId) ?? [];
			const storedFiles = values
				.filter(v => v.file_value)
				.map(v => ({ recordId: v.id, fileName: v.file_value }));
			const firstValue = values.find(v => v.value);

			const base: FormField = ff ?? {
				id: def.id,
				field_def_id: def.id,
				ref_id: '',
				form_id: '',
				field_label: def.label,
				field_type: def.field_type,
				field_order: 0,
				is_required: def.is_required ?? false,
				placeholder: def.placeholder || undefined,
				help_text: def.help_text || undefined,
				validation_rules: def.validation_rules ?? null,
				field_options: this.parseFieldOptions(def.field_options),
				conditional_logic: null,
				page: 1,
				row_index: 0,
				column_position: 'full',
				write_mode: def.write_mode,
				display_stage_id: def.display_stage_id || undefined
			};

			// History is available for every field now (workflow_field_values is
			// append-only). The renderer decides whether to surface the expander
			// based on row count, not write_mode.
			const valueHistory = values
				.filter((v) => v.value !== undefined && v.value !== null && v.value !== '')
				.map((v) => ({
					id: v.id,
					value: this.parseFieldValue(v.value),
					recorded_at: (v.recorded_at || (v as any).created || (v as any).updated || '') as string
				}));

			out.push({
				...base,
				field_options: this.parseFieldOptions(base.field_options),
				page: base.page ?? 1,
				row_index: base.row_index ?? 0,
				column_position: base.column_position ?? 'full',
				write_mode: def.write_mode,
				value: this.parseFieldValue(firstValue?.value),
				fileValue: storedFiles[0]?.fileName || undefined,
				fileRecordId: storedFiles[0]?.recordId || undefined,
				storedFiles: storedFiles.length > 0 ? storedFiles : undefined,
				valueHistory
			});
		}

		out.sort((a, b) => {
			if ((a.page ?? 1) !== (b.page ?? 1)) return (a.page ?? 1) - (b.page ?? 1);
			if ((a.row_index ?? 0) !== (b.row_index ?? 0)) return (a.row_index ?? 0) - (b.row_index ?? 0);
			const posOrder = { left: 0, right: 1, full: 2 };
			return (posOrder[a.column_position ?? 'full'] ?? 2) - (posOrder[b.column_position ?? 'full'] ?? 2);
		});

		return out;
	}

	/** Check if a stage has any data */
	stageHasData(stageId: string): boolean {
		const defIds = new Set(this.getFieldDefIdsForStage(stageId));
		if (defIds.size === 0) return false;
		for (const fv of this.fieldValues) {
			if (defIds.has((fv as any).field_def_id as string)) return true;
		}
		return false;
	}

	/**
	 * Form fields from stages already reached (current or earlier).
	 * Used by the edit/protocol UI to gate which fields participants may touch.
	 */
	getFormFieldsForReachedStages(): FormField[] {
		if (!this.instance) return [];

		const currentStageId = this.instance.current_stage_id as string;
		const currentStageIndex = this.stages.findIndex(s => s.id === currentStageId);
		if (currentStageIndex < 0) return [];

		const reachedStageIds = new Set(
			this.stages.filter((_, index) => index <= currentStageIndex).map(s => s.id)
		);

		const reachedFormIds = new Set<string>();
		for (const form of this.forms) {
			if (form.stage_id && reachedStageIds.has(form.stage_id)) {
				reachedFormIds.add(form.id);
				continue;
			}
			if (form.connection_id) {
				const connection = this.connections.find(c => c.id === form.connection_id);
				if (connection && reachedStageIds.has(connection.to_stage_id)) {
					reachedFormIds.add(form.id);
				}
			}
		}

		return this.formFields.filter(f => reachedFormIds.has(f.form_id));
	}

	/**
	 * @deprecated tools_edit was removed; this helper still exists so the
	 * stale EditFieldsTool wrapper compiles. Groups the given field-def ids
	 * by the stage that displays them.
	 */
	getEditableFieldsGroupedByStage(editableFieldIds: string[]): EditableFieldsByStage[] {
		if (!this.instance || editableFieldIds.length === 0) return [];
		const reached = this.getFormFieldsForReachedStages();
		const editable = reached.filter(f => editableFieldIds.includes(f.id));

		const stageFieldsMap = new Map<string, FormField[]>();
		for (const field of editable) {
			const stageId = this.getDisplayStageIdForDef(field.id);
			if (!stageId) continue;
			if (!stageFieldsMap.has(stageId)) stageFieldsMap.set(stageId, []);
			stageFieldsMap.get(stageId)!.push(field);
		}

		const result: EditableFieldsByStage[] = [];
		for (const stage of this.stages) {
			const fields = stageFieldsMap.get(stage.id);
			if (fields && fields.length > 0) {
				result.push({ stageId: stage.id, stageName: stage.stage_name, fields });
			}
		}
		return result;
	}

	getProtocolToolsForStage(stageId: string): ToolProtocol[] {
		return this.protocolTools.filter(p => {
			if (p.connection_id) return false;
			if (!p.stage_id || p.stage_id.length === 0) return false;
			return p.stage_id.includes(stageId);
		});
	}

	getProtocolToolsForConnection(connectionId: string): ToolProtocol[] {
		return this.protocolTools.filter(p => p.connection_id === connectionId);
	}

	getProtocolFormFields(protocolFormId: string): FormField[] {
		const fields = this.formFields
			.filter(f => f.form_id === protocolFormId)
			.sort((a, b) => {
				if ((a.page ?? 1) !== (b.page ?? 1)) return (a.page ?? 1) - (b.page ?? 1);
				if ((a.row_index ?? 0) !== (b.row_index ?? 0)) return (a.row_index ?? 0) - (b.row_index ?? 0);
				const posOrder = { left: 0, right: 1, full: 2 };
				return (posOrder[a.column_position ?? 'full'] ?? 2) - (posOrder[b.column_position ?? 'full'] ?? 2);
			});

		if (fields.length === 0) {
			console.warn(`[detailState] No form fields found for protocol_form_id=${protocolFormId}`);
		}
		return fields;
	}

	/** Inline `local_fields` from the protocol's backing form. Empty if the form has none. */
	getProtocolLocalFields(protocolFormId: string | undefined): import('$lib/participant-state/types').ProtocolLocalField[] {
		if (!protocolFormId) return [];
		const form = this.forms.find((f) => f.id === protocolFormId);
		const list = (form?.local_fields ?? []) as import('$lib/participant-state/types').ProtocolLocalField[];
		return list
			.slice()
			.sort((a, b) => {
				if ((a.page ?? 0) !== (b.page ?? 0)) return (a.page ?? 0) - (b.page ?? 0);
				return (a.row_index ?? 0) - (b.row_index ?? 0);
			});
	}

	getToolsForConnection(connectionId: string): ToolQueueItem[] {
		const connectionForms = this.forms.filter(f => f.connection_id === connectionId);
		const connectionProtocolTools = this.protocolTools.filter(p => p.connection_id === connectionId);

		const allTools: ToolQueueItem[] = [
			...connectionForms.map(f => ({ type: 'form' as const, tool: f })),
			...connectionProtocolTools.map(p => ({ type: 'protocol' as const, tool: p }))
		];

		return allTools.sort((a, b) => (a.tool.tool_order ?? 0) - (b.tool.tool_order ?? 0));
	}

	isStageCompleted(stageId: string): boolean {
		if (!this.instance) return false;
		const currentStageId = this.instance.current_stage_id as string;
		const currentIndex = this.stages.findIndex(s => s.id === currentStageId);
		const stageIndex = this.stages.findIndex(s => s.id === stageId);
		return stageIndex < currentIndex;
	}

	isCurrentStage(stageId: string): boolean {
		if (!this.instance) return false;
		return this.instance.current_stage_id === stageId;
	}

	async executeTransition(connection: WorkflowConnection): Promise<void> {
		await this.gateway.collection('workflow_instances').update(this.instanceId, {
			current_stage_id: connection.to_stage_id
		});
		await this.refresh();
	}

	setActiveStageTab(stageId: string): void {
		this.activeStageTab = stageId;
	}
}

export function createWorkflowInstanceDetailState(
	instanceId: string,
	gateway: ParticipantGateway,
	fieldValueCache?: FieldValueCache
): WorkflowInstanceDetailState {
	return new WorkflowInstanceDetailState(instanceId, gateway, fieldValueCache);
}
