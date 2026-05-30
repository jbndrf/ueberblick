/**
 * Workflow Builder State Management
 *
 * Central state for the workflow builder with status tracking.
 * Uses Svelte 5 runes for reactivity.
 */

import { generateId, deepEqual } from './utils';
import type {
	WorkflowStage,
	WorkflowConnection,
	ToolsForm,
	ToolsFormField,
	ToolsEdit,
	ToolsProtocol,
	ToolsAutomation,
	ToolsFieldTag,
	TagMapping,
	TrackedStage,
	TrackedConnection,
	TrackedForm,
	TrackedFormField,
	TrackedEditTool,
	TrackedProtocolTool,
	TrackedAutomation,
	TrackedFieldTag,
	StageType,
	ItemStatus,
	TriggerType,
	TriggerConfig,
	TransitionTriggerConfig,
	ExecutionMode,
	WorkflowFieldDef,
	WorkflowPermissions,
	TrackedFieldDef,
	FieldType,
	FieldDisplayConfig,
	ColumnPosition
} from './types';
import { DEFAULT_DATA_TAB } from './types';

// =============================================================================
// State Class
// =============================================================================

export class WorkflowBuilderState {
	// Core data
	workflowId: string;
	workflowName = $state<string>('');
	private initialized = false;

	// Workflow-level permissions (the `workflows` record itself — not list-shaped,
	// so tracked as a single field with its own original snapshot). The original
	// starts deep-equal to the initial value so the builder is not flagged dirty
	// before initFromServer runs.
	workflowPermissions = $state<WorkflowPermissions>({
		id: '',
		visible_to_roles: [],
		private_instances: false
	});
	private workflowPermissionsOriginal: WorkflowPermissions = {
		id: '',
		visible_to_roles: [],
		private_instances: false
	};

	// Tracked collections
	stages = $state<TrackedStage[]>([]);
	connections = $state<TrackedConnection[]>([]);
	forms = $state<TrackedForm[]>([]);
	formFields = $state<TrackedFormField[]>([]);
	editTools = $state<TrackedEditTool[]>([]);
	protocolTools = $state<TrackedProtocolTool[]>([]);
	automations = $state<TrackedAutomation[]>([]);
	fieldTags = $state<TrackedFieldTag[]>([]);

	// Workflow-scoped field-def registry (workflow_field_defs collection).
	fieldDefs = $state<TrackedFieldDef[]>([]);

	visibleFieldDefs = $derived(this.fieldDefs.filter((d) => d.status !== 'deleted'));

	/**
	 * Field defs as seen by cross-form consumers (library palette, protocol-tool
	 * field picker, smart-dropdown source picker). Includes both:
	 *  - real entries from `workflow_field_defs` (`this.fieldDefs`)
	 *  - synthesized transient entries derived from new form fields whose
	 *    `field_def_id` placeholder (e.g. `_temp_*`) is not yet in the registry.
	 *
	 * Synthesized entries let users reference freshly-added fields in other forms
	 * before saving. They are NOT included in `getChanges()`; the save path
	 * already materialises them via the `_temp_*` placeholder flow.
	 */
	effectiveFieldDefs = $derived.by((): TrackedFieldDef[] => {
		const real = this.fieldDefs.filter((d) => d.status !== 'deleted');
		const realIds = new Set(real.map((d) => d.data.id));
		const seenSynth = new Set<string>();
		const synthesized: TrackedFieldDef[] = [];
		for (const f of this.formFields) {
			if (f.status === 'deleted') continue;
			const defId = f.data.field_def_id;
			if (!defId || realIds.has(defId) || seenSynth.has(defId)) continue;
			seenSynth.add(defId);
			synthesized.push({
				data: {
					id: defId,
					workflow_id: this.workflowId,
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
	});

	getFieldDefById(id: string | undefined): WorkflowFieldDef | undefined {
		if (!id) return undefined;
		const real = this.fieldDefs.find((d) => d.data.id === id && d.status !== 'deleted')?.data;
		if (real) return real;
		return this.effectiveFieldDefs.find((d) => d.data.id === id)?.data;
	}

	addFieldDef(partial?: Partial<WorkflowFieldDef>): WorkflowFieldDef {
		const def: WorkflowFieldDef = {
			id: generateId(),
			workflow_id: this.workflowId,
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
		this.fieldDefs.push({ data: def, status: 'new' });
		return def;
	}

	updateFieldDef(id: string, updates: Partial<WorkflowFieldDef>): void {
		const def = this.fieldDefs.find((d) => d.data.id === id);
		if (!def) return;
		def.data = { ...def.data, ...updates };
		if (def.status === 'unchanged') def.status = 'modified';

		// Form-fields denormalize the def-level properties (label, type,
		// write_mode, options, validation, compute_expression) onto their ref
		// row. Mirror def edits onto every form-field pointing at this def so
		// the form builder and runtime see consistent values without a
		// save+refresh. Presentation (placeholder, help_text, required) is NOT
		// mirrored — it lives per-form on the ref's config.
		for (const f of this.formFields) {
			if (f.status === 'deleted') continue;
			if (f.data.field_def_id !== id) continue;
			const patch: Partial<ToolsFormField> = {};
			if (updates.label !== undefined) patch.field_label = updates.label ?? '';
			if (updates.field_type !== undefined) patch.field_type = updates.field_type;
			if (updates.write_mode !== undefined) (patch as any).write_mode = updates.write_mode;
			if (updates.field_options !== undefined)
				patch.field_options = updates.field_options ?? undefined;
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

	deleteFieldDef(id: string): void {
		const def = this.fieldDefs.find((d) => d.data.id === id);
		if (!def) return;

		if (def.status === 'new') {
			this.fieldDefs = this.fieldDefs.filter((d) => d.data.id !== id);
		} else {
			def.status = 'deleted';
		}
	}

	// =========================================================================
	// Data tabs (participant detail "Data" view). Tabs are emergent — derived
	// from the distinct `display_config.tab` values across the workflow's field
	// defs. The default tab (empty key) collects every def with no config.
	// =========================================================================

	/** Tab key for a field def — empty string = default "Data" tab. */
	private defTab(def: WorkflowFieldDef): string {
		return def.display_config?.tab || DEFAULT_DATA_TAB;
	}

	/**
	 * Emergent ordered list of data tabs. The default tab is always present and
	 * sorts first; custom tabs follow by `tabOrder` then name.
	 */
	getDataTabs(): Array<{ name: string; order: number; isDefault: boolean }> {
		const byTab = new Map<string, number>();
		byTab.set(DEFAULT_DATA_TAB, 0);
		for (const d of this.visibleFieldDefs) {
			const tab = this.defTab(d.data);
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
	getFieldDefsForTab(tabName: string): TrackedFieldDef[] {
		const colRank = { left: 0, full: 1, right: 2 };
		return this.visibleFieldDefs
			.filter((d) => this.defTab(d.data) === tabName)
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

	/** Move/place a field def into a tab at a given layout slot. */
	moveFieldDefToTab(defId: string, tabName: string, row: number, column: ColumnPosition): void {
		const def = this.fieldDefs.find((d) => d.data.id === defId);
		if (!def) return;
		const tabOrder = def.data.display_config?.tabOrder ?? this.tabOrderOf(tabName);
		const config: FieldDisplayConfig = { tab: tabName, tabOrder, row, column };
		this.updateFieldDef(defId, { display_config: config });
	}

	/** Current order value for an existing tab (0 for the default tab). */
	private tabOrderOf(tabName: string): number {
		if (tabName === DEFAULT_DATA_TAB) return 0;
		const found = this.getDataTabs().find((t) => t.name === tabName);
		return found?.order ?? this.getDataTabs().length;
	}

	/** Rename a tab — rewrites `display_config.tab` on every member def. */
	renameDataTab(oldName: string, newName: string): void {
		if (oldName === newName) return;
		for (const d of this.getFieldDefsForTab(oldName)) {
			const c = d.data.display_config;
			if (!c) continue;
			this.updateFieldDef(d.data.id, { display_config: { ...c, tab: newName } });
		}
	}

	/** Reorder tabs — rewrites `tabOrder` on every member def of each tab. */
	reorderDataTabs(orderedNames: string[]): void {
		orderedNames.forEach((name, idx) => {
			if (name === DEFAULT_DATA_TAB) return;
			for (const d of this.getFieldDefsForTab(name)) {
				const c = d.data.display_config;
				if (!c) continue;
				this.updateFieldDef(d.data.id, { display_config: { ...c, tabOrder: idx } });
			}
		});
	}

	/** Bulk-apply view_roles to every field def in a tab. */
	setTabViewRoles(tabName: string, roleIds: string[]): void {
		for (const d of this.getFieldDefsForTab(tabName)) {
			this.updateFieldDef(d.data.id, { view_roles: [...roleIds] });
		}
	}

	// =========================================================================
	// Workflow-Level Permissions
	// =========================================================================

	/** Patch the workflow-level permission fields (visibility, private instances). */
	updateWorkflowPermissions(updates: Partial<WorkflowPermissions>): void {
		this.workflowPermissions = { ...this.workflowPermissions, ...updates };
	}

	// Derived: dirty state
	isDirty = $derived(
		this.stages.some((s) => s.status !== 'unchanged') ||
			this.connections.some((c) => c.status !== 'unchanged') ||
			this.forms.some((f) => f.status !== 'unchanged') ||
			this.formFields.some((f) => f.status !== 'unchanged') ||
			this.editTools.some((e) => e.status !== 'unchanged') ||
			this.protocolTools.some((p) => p.status !== 'unchanged') ||
			this.automations.some((a) => a.status !== 'unchanged') ||
			this.fieldTags.some((ft) => ft.status !== 'unchanged') ||
			this.fieldDefs.some((d) => d.status !== 'unchanged') ||
			!deepEqual(this.workflowPermissions, this.workflowPermissionsOriginal)
	);

	// Derived: visible items (exclude deleted)
	visibleStages = $derived(this.stages.filter((s) => s.status !== 'deleted'));
	visibleConnections = $derived(this.connections.filter((c) => c.status !== 'deleted'));
	visibleForms = $derived(this.forms.filter((f) => f.status !== 'deleted'));
	visibleFormFields = $derived(this.formFields.filter((f) => f.status !== 'deleted'));
	visibleEditTools = $derived(this.editTools.filter((e) => e.status !== 'deleted'));
	visibleProtocolTools = $derived(this.protocolTools.filter((p) => p.status !== 'deleted'));
	visibleAutomations = $derived(this.automations.filter((a) => a.status !== 'deleted'));

	// Derived: has start stage
	hasStartStage = $derived(this.visibleStages.some((s) => s.data.stage_type === 'start'));

	constructor(workflowId: string) {
		this.workflowId = workflowId;
	}

	// =========================================================================
	// Initialization (from server data)
	// =========================================================================

	initFromServer(data: {
		workflowName?: string;
		workflow?: { id: string; visible_to_roles?: string[]; private_instances?: boolean };
		stages?: WorkflowStage[];
		connections?: WorkflowConnection[];
		forms?: ToolsForm[];
		formFields?: ToolsFormField[];
		editTools?: ToolsEdit[];
		protocolTools?: ToolsProtocol[];
		automations?: ToolsAutomation[];
		fieldTags?: ToolsFieldTag[];
		fieldDefs?: WorkflowFieldDef[];
	}) {
		// Guard against re-initialization (prevents infinite effect loops)
		if (this.initialized) return;
		this.initialized = true;

		this.workflowName = data.workflowName || '';

		this.workflowPermissions = {
			id: data.workflow?.id ?? this.workflowId,
			visible_to_roles: data.workflow?.visible_to_roles ?? [],
			private_instances: data.workflow?.private_instances ?? false
		};
		// $state.snapshot (not structuredClone) — workflowPermissions is now a
		// reactive proxy, which structuredClone cannot clone.
		this.workflowPermissionsOriginal = $state.snapshot(this.workflowPermissions);

		this.stages = (data.stages || []).map((s) => ({
			data: s,
			status: 'unchanged' as ItemStatus,
			original: structuredClone(s)
		}));

		// Build connections array with entry connections for start stages
		const loadedConnections: TrackedConnection[] = (data.connections || []).map((c) => ({
			data: c,
			status: 'unchanged' as ItemStatus,
			original: structuredClone(c)
		}));

		// Ensure entry connections exist for all start stages
		const startStages = this.stages.filter((s) => s.data.stage_type === 'start');
		for (const stage of startStages) {
			const hasEntryConnection = loadedConnections.some(
				(c) => !c.data.from_stage_id && c.data.to_stage_id === stage.data.id
			);
			if (!hasEntryConnection) {
				// Create entry connection inline (don't use addEntryConnection to avoid reactive push)
				const entryConnection: WorkflowConnection = {
					id: generateId(),
					workflow_id: this.workflowId,
					from_stage_id: null,
					to_stage_id: stage.data.id,
					action_name: 'entry',
					visual_config: { button_label: this.workflowName || 'Start' }
				};
				loadedConnections.push({
					data: entryConnection,
					status: 'new'
				});
			}
		}

		this.connections = loadedConnections;

		this.forms = (data.forms || []).map((f) => ({
			data: f,
			status: 'unchanged' as ItemStatus,
			original: structuredClone(f)
		}));

		this.formFields = (data.formFields || []).map((f) => ({
			data: f,
			status: 'unchanged' as ItemStatus,
			original: structuredClone(f)
		}));

		this.editTools = (data.editTools || []).map((e) => ({
			data: e,
			status: 'unchanged' as ItemStatus,
			original: structuredClone(e)
		}));

		this.protocolTools = (data.protocolTools || []).map((p) => ({
			data: p,
			status: 'unchanged' as ItemStatus,
			original: structuredClone(p)
		}));

		this.automations = (data.automations || []).map((a) => ({
			data: a,
			status: 'unchanged' as ItemStatus,
			original: structuredClone(a)
		}));

		this.fieldTags = (data.fieldTags || []).map((ft) => ({
			data: ft,
			status: 'unchanged' as ItemStatus,
			original: structuredClone(ft)
		}));

		this.fieldDefs = (data.fieldDefs || []).map((d) => ({
			data: d,
			status: 'unchanged' as ItemStatus,
			original: structuredClone(d)
		}));
	}

	// =========================================================================
	// Stage Operations
	// =========================================================================

	addStage(type: StageType, position?: { x: number; y: number }): WorkflowStage {
		const newStage: WorkflowStage = {
			id: generateId(),
			workflow_id: this.workflowId,
			stage_name: type === 'start' ? 'Start' : type === 'end' ? 'End' : 'New Stage',
			stage_type: type,
			stage_order: this.visibleStages.length,
			position_x: position?.x ?? 100,
			position_y: position?.y ?? 100
		};

		this.stages.push({
			data: newStage,
			status: 'new'
		});

		// Auto-create entry connection for start stages
		if (type === 'start') {
			this.addEntryConnection(newStage.id);
		}

		// Add new stage to all global tools
		for (const tool of this.editTools) {
			if (tool.data.is_global && tool.status !== 'deleted') {
				if (!tool.data.stage_id) {
					tool.data.stage_id = [];
				}
				tool.data.stage_id.push(newStage.id);
				if (tool.status === 'unchanged') {
					tool.status = 'modified';
				}
			}
		}
		// Note: global protocol tools are NOT auto-synced -- their stage_ids
		// define a region boundary, manually configured by the admin.

		return newStage;
	}

	/**
	 * Create an entry connection (workflow start point).
	 * Entry connections have from_stage_id = null.
	 */
	addEntryConnection(toStageId: string): WorkflowConnection {
		const entryConnection: WorkflowConnection = {
			id: generateId(),
			workflow_id: this.workflowId,
			from_stage_id: null,
			to_stage_id: toStageId,
			action_name: 'entry',
			visual_config: {
				button_label: this.workflowName || 'Start'
			}
		};

		this.connections.push({
			data: entryConnection,
			status: 'new'
		});

		return entryConnection;
	}

	updateStage(id: string, updates: Partial<WorkflowStage>) {
		const stage = this.stages.find((s) => s.data.id === id);
		if (!stage) return;

		Object.assign(stage.data, updates);

		if (stage.status === 'unchanged') {
			// Check if actually changed from original
			if (!deepEqual(stage.data, stage.original)) {
				stage.status = 'modified';
			}
		}
	}

	/**
	 * Delete a stage. Returns affected connections for warning display.
	 */
	getAffectedConnections(stageId: string): TrackedConnection[] {
		return this.visibleConnections.filter(
			(c) => c.data.from_stage_id === stageId || c.data.to_stage_id === stageId
		);
	}

	deleteStage(id: string, cascadeConnections = false) {
		const stage = this.stages.find((s) => s.data.id === id);
		if (!stage) return;

		if (cascadeConnections) {
			// Delete related connections
			const affectedConns = this.getAffectedConnections(id);
			for (const conn of affectedConns) {
				this.deleteConnection(conn.data.id);
			}
		}

		// Delete forms attached directly to this stage
		const relatedForms = this.forms.filter((f) => f.data.stage_id === id);
		for (const form of relatedForms) {
			this.deleteForm(form.data.id);
		}

		// Handle edit tools with array-based stage_id
		for (const tool of this.editTools) {
			if (tool.status === 'deleted') continue;
			const stageIds = tool.data.stage_id;
			if (!stageIds || !stageIds.includes(id)) continue;

			if (tool.data.is_global) {
				// Global tools: just remove this stage from the array
				tool.data.stage_id = stageIds.filter((sid) => sid !== id);
				if (tool.status === 'unchanged') {
					tool.status = 'modified';
				}
			} else if (stageIds.length === 1) {
				// Non-global with only this stage: delete the tool
				this.deleteEditTool(tool.data.id);
			} else {
				// Non-global with multiple stages: remove this stage
				tool.data.stage_id = stageIds.filter((sid) => sid !== id);
				if (tool.status === 'unchanged') {
					tool.status = 'modified';
				}
			}
		}

		// Handle protocol tools with array-based stage_id
		for (const tool of this.protocolTools) {
			if (tool.status === 'deleted') continue;
			const stageIds = tool.data.stage_id;
			if (!stageIds || !stageIds.includes(id)) continue;

			if (tool.data.is_global) {
				tool.data.stage_id = stageIds.filter((sid) => sid !== id);
				if (tool.status === 'unchanged') {
					tool.status = 'modified';
				}
			} else if (stageIds.length === 1) {
				this.deleteProtocolTool(tool.data.id);
			} else {
				tool.data.stage_id = stageIds.filter((sid) => sid !== id);
				if (tool.status === 'unchanged') {
					tool.status = 'modified';
				}
			}
		}

		if (stage.status === 'new') {
			// Never saved, remove from array
			this.stages = this.stages.filter((s) => s.data.id !== id);
		} else {
			// Mark for deletion
			stage.status = 'deleted';
		}
	}

	getStageById(id: string): TrackedStage | undefined {
		return this.stages.find((s) => s.data.id === id);
	}

	// =========================================================================
	// Connection Operations
	// =========================================================================

	addConnection(fromStageId: string, toStageId: string): WorkflowConnection {
		const isEditAction = fromStageId === toStageId;

		const newConnection: WorkflowConnection = {
			id: generateId(),
			workflow_id: this.workflowId,
			from_stage_id: fromStageId,
			to_stage_id: toStageId,
			action_name: isEditAction ? 'edit' : 'transition',
			visual_config: {
				button_label: isEditAction ? 'Edit' : 'Continue'
			}
		};

		this.connections.push({
			data: newConnection,
			status: 'new'
		});

		return newConnection;
	}

	updateConnection(id: string, updates: Partial<WorkflowConnection>) {
		const conn = this.connections.find((c) => c.data.id === id);
		if (!conn) return;

		Object.assign(conn.data, updates);

		if (conn.status === 'unchanged') {
			if (!deepEqual(conn.data, conn.original)) {
				conn.status = 'modified';
			}
		}
	}

	deleteConnection(id: string) {
		const conn = this.connections.find((c) => c.data.id === id);
		if (!conn) return;

		// Also delete related forms and edit tools
		const relatedForms = this.forms.filter((f) => f.data.connection_id === id);
		for (const form of relatedForms) {
			this.deleteForm(form.data.id);
		}

		const relatedEditTools = this.editTools.filter((e) => e.data.connection_id === id);
		for (const tool of relatedEditTools) {
			this.deleteEditTool(tool.data.id);
		}

		const relatedProtocolTools = this.protocolTools.filter((p) => p.data.connection_id === id);
		for (const tool of relatedProtocolTools) {
			this.deleteProtocolTool(tool.data.id);
		}

		if (conn.status === 'new') {
			this.connections = this.connections.filter((c) => c.data.id !== id);
		} else {
			conn.status = 'deleted';
		}
	}

	getConnectionById(id: string): TrackedConnection | undefined {
		return this.connections.find((c) => c.data.id === id);
	}

	// =========================================================================
	// Form Operations
	// =========================================================================

	/** Get the next tool_order value for a connection's tools */
	private getNextToolOrder(connectionId: string): number {
		const existing = [
			...this.getFormsForConnection(connectionId),
			...this.getEditToolsForConnection(connectionId),
			...this.getProtocolToolsForConnection(connectionId)
		];
		return Math.max(-1, ...existing.map((t) => t.data.tool_order ?? 0)) + 1;
	}

	addForm(target: { connectionId: string } | { stageId: string } | { isGlobal: true }): ToolsForm {
		const isStageAttached = 'stageId' in target;
		const isGlobal = 'isGlobal' in target;
		const connectionId = 'connectionId' in target ? target.connectionId : undefined;

		const newForm: ToolsForm = {
			id: generateId(),
			workflow_id: this.workflowId,
			connection_id: connectionId,
			stage_id: isStageAttached ? target.stageId : undefined,
			name: 'New Form',
			...(connectionId && { tool_order: this.getNextToolOrder(connectionId) }),
			// Stage-attached and global forms need their own button/role config;
			// connection-attached forms inherit from the connection.
			...((isStageAttached || isGlobal) && {
				allowed_roles: [],
				visual_config: {
					button_label: 'Submit'
				}
			})
		};

		this.forms.push({
			data: newForm,
			status: 'new'
		});

		return newForm;
	}

	updateForm(id: string, updates: Partial<ToolsForm>) {
		const form = this.forms.find((f) => f.data.id === id);
		if (!form) return;

		Object.assign(form.data, updates);

		if (form.status === 'unchanged') {
			if (!deepEqual(form.data, form.original)) {
				form.status = 'modified';
			}
		}
	}

	deleteForm(id: string) {
		const form = this.forms.find((f) => f.data.id === id);
		if (!form) return;

		// Delete related fields
		const relatedFields = this.formFields.filter((f) => f.data.form_id === id);
		for (const field of relatedFields) {
			this.deleteFormField(field.data.id);
		}

		if (form.status === 'new') {
			this.forms = this.forms.filter((f) => f.data.id !== id);
		} else {
			form.status = 'deleted';
		}
	}

	getFormById(id: string): TrackedForm | undefined {
		return this.forms.find((f) => f.data.id === id);
	}

	getFormsForConnection(connectionId: string): TrackedForm[] {
		const protocolFormIds = this.getProtocolFormIds();
		return this.visibleForms.filter(
			(f) => f.data.connection_id === connectionId && !protocolFormIds.has(f.data.id)
		);
	}

	getFormsForStage(stageId: string): TrackedForm[] {
		const protocolFormIds = this.getProtocolFormIds();
		return this.visibleForms.filter(
			(f) => f.data.stage_id === stageId && !protocolFormIds.has(f.data.id)
		);
	}

	getGlobalForms(): TrackedForm[] {
		const protocolFormIds = this.getProtocolFormIds();
		return this.visibleForms.filter(
			(f) => !f.data.stage_id && !f.data.connection_id && !protocolFormIds.has(f.data.id)
		);
	}

	// =========================================================================
	// Form Field Operations
	// =========================================================================

	addFormField(
		formId: string,
		fieldType: ToolsFormField['field_type'],
		rowIndex: number,
		columnPosition: ToolsFormField['column_position'],
		page: number = 1
	): ToolsFormField {
		const existingFields = this.visibleFormFields.filter((f) => f.data.form_id === formId);

		// A new ref must point at a `workflow_field_defs` row. We synthesize a
		// placeholder `_temp_`-prefixed field_def_id here; the save path in
		// `builder/+page.server.ts saveWorkflow` recognises the prefix and replaces
		// it with the id of a freshly-created field def. Definitional fields are
		// kept on the ref shape for the legacy UI; the save action splits them out.
		const tempDefId = `_temp_${generateId()}`;
		const newField: ToolsFormField = {
			id: generateId(),
			form_id: formId,
			field_def_id: tempDefId,
			field_label: 'New Field',
			field_type: fieldType,
			field_order: existingFields.length,
			page,
			row_index: rowIndex,
			column_position: columnPosition,
			is_required: false
		};

		this.formFields.push({
			data: newField,
			status: 'new'
		});

		// Mirror this form-field as a workflow_field_def in client state so
		// the field library (and other def-consumers) see it immediately,
		// without waiting for a save+refresh round-trip. The `_temp_` id is
		// excluded from getChanges().fieldDefs — the server materialises the
		// real def via the formFields.new save path.
		this.fieldDefs.push({
			data: {
				id: tempDefId,
				workflow_id: this.workflowId,
				label: 'New Field',
				field_type: fieldType,
				write_mode: 'singleton',
				output_type: '',
				view_roles: [],
				validation_rules: null,
				field_options: null,
				compute_expression: '',
				compute_depends_on: []
			},
			status: 'new'
		});

		return newField;
	}

	/**
	 * Add a form-field reference pointing at an EXISTING workflow_field_defs row.
	 * Unlike `addFormField`, this does not synthesize a new def — the ref carries
	 * a real `field_def_id`. Legacy denormalized fields (label/type/etc.) are
	 * populated from the def so the existing UI continues to render.
	 */
	addFormFieldRef(
		formId: string,
		fieldDefId: string,
		rowIndex: number,
		columnPosition: ToolsFormField['column_position'],
		page: number = 1
	): ToolsFormField | null {
		const def = this.getFieldDefById(fieldDefId);
		if (!def) return null;
		const existingFields = this.visibleFormFields.filter((f) => f.data.form_id === formId);
		const newField: ToolsFormField = {
			id: generateId(),
			form_id: formId,
			field_def_id: fieldDefId,
			field_label: def.label ?? '',
			field_type: def.field_type,
			field_order: existingFields.length,
			page,
			row_index: rowIndex,
			column_position: columnPosition,
			is_required: false,
			placeholder: '',
			help_text: '',
			validation_rules: def.validation_rules ?? undefined,
			field_options: def.field_options ?? undefined,
			write_mode: def.write_mode,
			compute_expression: def.compute_expression
		};
		this.formFields.push({ data: newField, status: 'new' });
		return newField;
	}

	updateFormField(id: string, updates: Partial<ToolsFormField>) {
		const field = this.formFields.find((f) => f.data.id === id);
		if (!field) return;

		Object.assign(field.data, updates);

		if (field.status === 'unchanged') {
			if (!deepEqual(field.data, field.original)) {
				field.status = 'modified';
			}
		}

		// Mirror definitional changes to the matching tracked field def
		// (only for shadow `_temp_*` defs created by addFormField — real defs
		// are owned by FieldLibraryView and shouldn't be mutated implicitly).
		const defId = field.data.field_def_id;
		if (typeof defId === 'string' && defId.startsWith('_temp_')) {
			const def = this.fieldDefs.find((d) => d.data.id === defId);
			if (def) {
				if (updates.field_label !== undefined) def.data.label = updates.field_label ?? '';
				if (updates.field_type !== undefined) def.data.field_type = updates.field_type;
				if (updates.field_options !== undefined)
					def.data.field_options = updates.field_options ?? null;
				if (updates.validation_rules !== undefined)
					def.data.validation_rules = updates.validation_rules ?? null;
				if ((updates as any).write_mode !== undefined)
					def.data.write_mode = (updates as any).write_mode;
				if ((updates as any).compute_expression !== undefined)
					def.data.compute_expression = (updates as any).compute_expression ?? '';
			}
		}
	}

	deleteFormField(id: string) {
		const field = this.formFields.find((f) => f.data.id === id);
		if (!field) return;

		// Update edit tools that reference this field
		for (const editTool of this.editTools) {
			if (editTool.data.editable_fields.includes(id)) {
				const newFields = editTool.data.editable_fields.filter((f) => f !== id);
				this.updateEditTool(editTool.data.id, { editable_fields: newFields });
			}
		}

		// Protocol tools denormalize the same `editable_fields` shape as
		// edit tools — keep them in sync too.
		for (const pt of this.protocolTools) {
			if (pt.status === 'deleted') continue;
			if (!pt.data.editable_fields?.includes(id)) continue;
			pt.data.editable_fields = pt.data.editable_fields.filter((f) => f !== id);
			if (pt.status === 'unchanged' && !deepEqual(pt.data, pt.original)) {
				pt.status = 'modified';
			}
		}

		// Remove any field tag mappings that reference this field
		for (const ft of this.fieldTags) {
			if (ft.status === 'deleted') continue;
			const before = ft.data.tag_mappings.length;
			ft.data.tag_mappings = ft.data.tag_mappings.filter((m) => m.fieldId !== id);
			if (ft.data.tag_mappings.length !== before && ft.status === 'unchanged') {
				if (!deepEqual(ft.data, ft.original)) {
					ft.status = 'modified';
				}
			}
		}

		// Drop the shadow def created by addFormField when the form-field
		// itself goes away. Real (`workflow_field_defs`-backed) refs leave
		// the def alone — it may still be referenced elsewhere or edited
		// independently via the field library.
		const defId = field.data.field_def_id;
		if (typeof defId === 'string' && defId.startsWith('_temp_')) {
			this.fieldDefs = this.fieldDefs.filter((d) => d.data.id !== defId);
		}

		if (field.status === 'new') {
			this.formFields = this.formFields.filter((f) => f.data.id !== id);
		} else {
			field.status = 'deleted';
		}
	}

	getFormFieldById(id: string): TrackedFormField | undefined {
		return this.formFields.find((f) => f.data.id === id);
	}

	getFieldsForForm(formId: string): TrackedFormField[] {
		return this.visibleFormFields
			.filter((f) => f.data.form_id === formId)
			.sort((a, b) => (a.data.field_order ?? 0) - (b.data.field_order ?? 0));
	}

	// =========================================================================
	// Edit Tool Operations
	// =========================================================================

	addEditTool(target: { connectionId: string } | { stageId: string }): ToolsEdit {
		const isStageAttached = 'stageId' in target;
		const connectionId = 'connectionId' in target ? target.connectionId : undefined;

		const newEditTool: ToolsEdit = {
			id: generateId(),
			workflow_id: this.workflowId,
			connection_id: connectionId,
			stage_id: isStageAttached ? [target.stageId] : undefined,
			name: 'Edit Fields',
			editable_fields: [],
			edit_mode: 'form_fields',
			is_global: false,
			...(connectionId && { tool_order: this.getNextToolOrder(connectionId) }),
			// Stage-attached edit tools need their own config; connection-attached tools inherit
			...(isStageAttached && {
				self_edit_roles: [],
				any_edit_roles: [],
				visual_config: {
					button_label: 'Edit'
				}
			})
		};

		this.editTools.push({
			data: newEditTool,
			status: 'new'
		});

		return newEditTool;
	}

	/**
	 * Add a global edit tool (available on all stages).
	 * The stage_id array will be synced with all stages on save.
	 */
	addGlobalEditTool(editMode: 'form_fields' | 'location' = 'form_fields'): ToolsEdit {
		const allStageIds = this.visibleStages.map((s) => s.data.id);

		const newEditTool: ToolsEdit = {
			id: generateId(),
			workflow_id: this.workflowId,
			connection_id: undefined,
			stage_id: allStageIds,
			name: editMode === 'location' ? 'Edit Location' : 'Edit Fields',
			editable_fields: [],
			edit_mode: editMode,
			is_global: true,
			self_edit_roles: [],
			any_edit_roles: [],
			visual_config: {
				button_label: editMode === 'location' ? 'Location' : 'Edit'
			}
		};

		this.editTools.push({
			data: newEditTool,
			status: 'new'
		});

		return newEditTool;
	}

	/**
	 * Sync global tools to include all current stages.
	 * Call this before saving the workflow.
	 */
	syncGlobalToolStages() {
		const allStageIds = this.visibleStages.map((s) => s.data.id);
		for (const tool of this.editTools) {
			if (tool.data.is_global && tool.status !== 'deleted') {
				tool.data.stage_id = allStageIds;
				if (tool.status === 'unchanged') {
					tool.status = 'modified';
				}
			}
		}
		// Note: global protocol tools are NOT auto-synced -- their stage_ids
		// define a region boundary, manually configured by the admin.
	}

	updateEditTool(id: string, updates: Partial<ToolsEdit>) {
		const tool = this.editTools.find((e) => e.data.id === id);
		if (!tool) return;

		Object.assign(tool.data, updates);

		if (tool.status === 'unchanged') {
			if (!deepEqual(tool.data, tool.original)) {
				tool.status = 'modified';
			}
		}
	}

	deleteEditTool(id: string) {
		const tool = this.editTools.find((e) => e.data.id === id);
		if (!tool) return;

		if (tool.status === 'new') {
			this.editTools = this.editTools.filter((e) => e.data.id !== id);
		} else {
			tool.status = 'deleted';
		}
	}

	getEditToolById(id: string): TrackedEditTool | undefined {
		return this.editTools.find((e) => e.data.id === id);
	}

	getEditToolsForConnection(connectionId: string): TrackedEditTool[] {
		return this.visibleEditTools.filter((e) => e.data.connection_id === connectionId);
	}

	/**
	 * Get edit tools for a specific stage (includes global tools).
	 * Filters by checking if stageId is in the stage_id array.
	 */
	getEditToolsForStage(stageId: string): TrackedEditTool[] {
		return this.visibleEditTools.filter((e) => {
			const stageIds = e.data.stage_id;
			if (!stageIds || stageIds.length === 0) return false;
			return stageIds.includes(stageId);
		});
	}

	/**
	 * Get only non-global edit tools for a specific stage.
	 * Used by property panels to show stage-specific tools.
	 */
	getNonGlobalEditToolsForStage(stageId: string): TrackedEditTool[] {
		return this.visibleEditTools.filter((e) => {
			if (e.data.is_global) return false;
			const stageIds = e.data.stage_id;
			if (!stageIds || stageIds.length === 0) return false;
			return stageIds.includes(stageId);
		});
	}

	/**
	 * Get all global edit tools.
	 */
	getGlobalEditTools(): TrackedEditTool[] {
		return this.visibleEditTools.filter((e) => e.data.is_global);
	}

	// =========================================================================
	// Protocol Tool Operations
	// =========================================================================

	addProtocolTool(opts: {
		stageId?: string;
		connectionId?: string;
		isGlobal?: boolean;
	}): ToolsProtocol {
		// Global protocol tools = region definitions, start with empty stage_ids
		// (admin picks which stages form the region)
		const stageId = opts.isGlobal ? [] : opts.stageId ? [opts.stageId] : [];

		const isStageAttached = !opts.connectionId && !opts.isGlobal;

		const newProtocolTool: ToolsProtocol = {
			id: generateId(),
			workflow_id: this.workflowId,
			connection_id: opts.connectionId,
			stage_id: stageId,
			is_global: opts.isGlobal ?? false,
			name: opts.isGlobal ? 'Protocol Region' : 'Protocol',
			editable_fields: [],
			prefill_config: {},
			allowed_roles: [],
			...(opts.connectionId && { tool_order: this.getNextToolOrder(opts.connectionId) }),
			...(isStageAttached && {
				visual_config: {
					button_label: 'Protocol'
				}
			})
		};

		this.protocolTools.push({
			data: newProtocolTool,
			status: 'new'
		});

		return newProtocolTool;
	}

	updateProtocolTool(id: string, updates: Partial<ToolsProtocol>) {
		const tool = this.protocolTools.find((p) => p.data.id === id);
		if (!tool) return;

		Object.assign(tool.data, updates);

		if (tool.status === 'unchanged') {
			if (!deepEqual(tool.data, tool.original)) {
				tool.status = 'modified';
			}
		}
	}

	deleteProtocolTool(id: string) {
		const tool = this.protocolTools.find((p) => p.data.id === id);
		if (!tool) return;

		// The protocol form is owned 1:1 by its protocol tool (see
		// `getProtocolFormIds`). Cascade its deletion so the now-orphaned
		// form doesn't reappear in the regular forms list.
		if (tool.data.protocol_form_id) {
			this.deleteForm(tool.data.protocol_form_id);
		}

		if (tool.status === 'new') {
			this.protocolTools = this.protocolTools.filter((p) => p.data.id !== id);
		} else {
			tool.status = 'deleted';
		}
	}

	getProtocolToolById(id: string): TrackedProtocolTool | undefined {
		return this.protocolTools.find((p) => p.data.id === id);
	}

	/**
	 * Get non-global protocol tools for a stage (for stage toolbars).
	 * Global protocol tools (regions) are shown in the global toolbar only.
	 */
	getProtocolToolsForStage(stageId: string): TrackedProtocolTool[] {
		return this.visibleProtocolTools.filter((p) => {
			if (p.data.is_global) return false;
			if (p.data.connection_id) return false;
			const stageIds = p.data.stage_id;
			if (!stageIds || stageIds.length === 0) return false;
			return stageIds.includes(stageId);
		});
	}

	getProtocolToolsForConnection(connectionId: string): TrackedProtocolTool[] {
		return this.visibleProtocolTools.filter((p) => p.data.connection_id === connectionId);
	}

	getGlobalProtocolTools(): TrackedProtocolTool[] {
		return this.visibleProtocolTools.filter((p) => p.data.is_global);
	}

	getProtocolFormIds(): Set<string> {
		const ids = new Set<string>();
		for (const tool of this.visibleProtocolTools) {
			if (tool.data.protocol_form_id) {
				ids.add(tool.data.protocol_form_id);
			}
		}
		return ids;
	}

	// =========================================================================
	// Automation Operations
	// =========================================================================

	addAutomation(triggerType: TriggerType = 'on_transition'): ToolsAutomation {
		const defaultConfig: TriggerConfig =
			triggerType === 'on_transition'
				? { from_stage_id: null, to_stage_id: null }
				: triggerType === 'on_field_change'
					? { stage_id: null, field_key: null }
					: { cron: '0 2 * * 1-5', target_stage_id: null };

		const newAutomation: ToolsAutomation = {
			id: generateId(),
			workflow_id: this.workflowId,
			name: 'New Automation',
			trigger_type: triggerType,
			trigger_config: defaultConfig,
			execution_mode: 'run_all',
			steps: [{ name: 'Step 1', conditions: null, actions: [] }],
			is_enabled: true
		};

		this.automations.push({
			data: newAutomation,
			status: 'new'
		});

		return newAutomation;
	}

	updateAutomation(id: string, updates: Partial<ToolsAutomation>) {
		const automation = this.automations.find((a) => a.data.id === id);
		if (!automation) return;

		Object.assign(automation.data, updates);

		if (automation.status === 'unchanged') {
			if (!deepEqual(automation.data, automation.original)) {
				automation.status = 'modified';
			}
		}
	}

	deleteAutomation(id: string) {
		const automation = this.automations.find((a) => a.data.id === id);
		if (!automation) return;

		if (automation.status === 'new') {
			this.automations = this.automations.filter((a) => a.data.id !== id);
		} else {
			automation.status = 'deleted';
		}
	}

	getAutomationById(id: string): TrackedAutomation | undefined {
		return this.automations.find((a) => a.data.id === id);
	}

	// =========================================================================
	// Field Tag Operations
	// =========================================================================

	/**
	 * Get the field tag record for this workflow (there is at most one).
	 */
	getFieldTagForWorkflow(): TrackedFieldTag | undefined {
		return this.fieldTags.find(
			(ft) => ft.status !== 'deleted' && ft.data.workflow_id === this.workflowId
		);
	}

	/**
	 * Get or create the field tag record for this workflow.
	 * Ensures exactly one record exists.
	 */
	getOrCreateFieldTag(): ToolsFieldTag {
		const existing = this.getFieldTagForWorkflow();
		if (existing) return existing.data;

		const newFieldTag: ToolsFieldTag = {
			id: generateId(),
			workflow_id: this.workflowId,
			tag_mappings: []
		};

		this.fieldTags.push({
			data: newFieldTag,
			status: 'new'
		});

		return newFieldTag;
	}

	/**
	 * Update the entire field tag record.
	 */
	updateFieldTag(id: string, updates: Partial<ToolsFieldTag>) {
		const ft = this.fieldTags.find((t) => t.data.id === id);
		if (!ft) return;

		Object.assign(ft.data, updates);

		if (ft.status === 'unchanged') {
			if (!deepEqual(ft.data, ft.original)) {
				ft.status = 'modified';
			}
		}
	}

	/**
	 * Set (or clear) a tag mapping for a given tag type.
	 * If fieldId is null, removes the mapping for that tag type.
	 */
	setTagMapping(tagType: string, fieldId: string | null, config?: Record<string, unknown>) {
		const fieldTag = this.getOrCreateFieldTag();
		const ft = this.fieldTags.find((t) => t.data.id === fieldTag.id)!;

		// Remove existing mapping for this tag type
		ft.data.tag_mappings = ft.data.tag_mappings.filter((m) => m.tagType !== tagType);

		// Add new mapping if fieldId or config provided (config alone = stage mode)
		if (fieldId || config) {
			ft.data.tag_mappings.push({
				tagType,
				fieldId,
				config: config ?? {}
			});
		}

		if (ft.status === 'unchanged') {
			if (!deepEqual(ft.data, ft.original)) {
				ft.status = 'modified';
			}
		}
	}

	/**
	 * Get the current mapping for a tag type, if any.
	 */
	getTagMapping(tagType: string): TagMapping | undefined {
		const ft = this.getFieldTagForWorkflow();
		if (!ft) return undefined;
		return ft.data.tag_mappings.find((m) => m.tagType === tagType);
	}

	/**
	 * Delete the field tag record for this workflow.
	 * If it was never saved (status 'new'), removes it from the array.
	 * Otherwise marks it as 'deleted' for the save to pick up.
	 */
	deleteFieldTag() {
		const ft = this.getFieldTagForWorkflow();
		if (!ft) return;

		if (ft.status === 'new') {
			this.fieldTags = this.fieldTags.filter((t) => t.data.id !== ft.data.id);
		} else {
			ft.status = 'deleted';
		}
	}

	/**
	 * Update the config for an existing tag mapping.
	 */
	updateTagMappingConfig(tagType: string, config: Record<string, unknown>) {
		const ft = this.getFieldTagForWorkflow();
		if (!ft) return;

		const mapping = ft.data.tag_mappings.find((m) => m.tagType === tagType);
		if (!mapping) return;

		mapping.config = config;

		if (ft.status === 'unchanged') {
			if (!deepEqual(ft.data, ft.original)) {
				ft.status = 'modified';
			}
		}
	}

	// =========================================================================
	// Ancestor Form Fields (for Smart Dropdowns)
	// =========================================================================

	/**
	 * Get all ancestor stages for a given stage (stages that can reach this stage)
	 * Traverses backwards through connections
	 */
	getAncestorStages(stageId: string): TrackedStage[] {
		const visited = new Set<string>();
		const ancestors: TrackedStage[] = [];

		const traverse = (currentStageId: string) => {
			// Find all connections leading TO this stage
			const incomingConnections = this.visibleConnections.filter(
				(c) => c.data.to_stage_id === currentStageId && c.data.from_stage_id
			);

			for (const conn of incomingConnections) {
				const fromStageId = conn.data.from_stage_id!;
				if (!visited.has(fromStageId)) {
					visited.add(fromStageId);
					const stage = this.visibleStages.find((s) => s.data.id === fromStageId);
					if (stage) {
						ancestors.push(stage);
						traverse(fromStageId);
					}
				}
			}
		};

		traverse(stageId);
		return ancestors;
	}

	/**
	 * Get all ancestor stages for a connection (based on its source stage)
	 */
	getAncestorStagesForConnection(connectionId: string): TrackedStage[] {
		const connection = this.visibleConnections.find((c) => c.data.id === connectionId);
		if (!connection || !connection.data.from_stage_id) return [];

		// Include the source stage itself plus its ancestors
		const sourceStage = this.visibleStages.find((s) => s.data.id === connection.data.from_stage_id);
		const ancestors = this.getAncestorStages(connection.data.from_stage_id);

		if (sourceStage) {
			return [sourceStage, ...ancestors];
		}
		return ancestors;
	}

	/**
	 * Get all form fields from ancestor stages, grouped by stage and form
	 * Used for smart dropdown source field selection
	 */
	getAncestorFormFields(connectionId: string): Array<{
		stage: WorkflowStage;
		form: ToolsForm;
		fields: ToolsFormField[];
	}> {
		const ancestorStages = this.getAncestorStagesForConnection(connectionId);
		const result: Array<{
			stage: WorkflowStage;
			form: ToolsForm;
			fields: ToolsFormField[];
		}> = [];

		for (const trackedStage of ancestorStages) {
			// Get forms for this stage
			const stageForms = this.getFormsForStage(trackedStage.data.id);
			for (const trackedForm of stageForms) {
				const fields = this.getFieldsForForm(trackedForm.data.id);
				if (fields.length > 0) {
					result.push({
						stage: trackedStage.data,
						form: trackedForm.data,
						fields: fields.map((f) => f.data)
					});
				}
			}

			// Also get forms from connections leading TO this stage
			const incomingConnections = this.visibleConnections.filter(
				(c) => c.data.to_stage_id === trackedStage.data.id
			);
			for (const conn of incomingConnections) {
				const connForms = this.getFormsForConnection(conn.data.id);
				for (const trackedForm of connForms) {
					const fields = this.getFieldsForForm(trackedForm.data.id);
					if (fields.length > 0) {
						result.push({
							stage: trackedStage.data,
							form: trackedForm.data,
							fields: fields.map((f) => f.data)
						});
					}
				}
			}
		}

		return result;
	}

	/**
	 * Get all form fields from ancestor stages for a stage-attached tool.
	 * Similar to getAncestorFormFields but starts from a stage instead of a connection.
	 */
	getAncestorFormFieldsForStage(stageId: string): Array<{
		stage: WorkflowStage;
		form: ToolsForm;
		fields: ToolsFormField[];
	}> {
		const result: Array<{
			stage: WorkflowStage;
			form: ToolsForm;
			fields: ToolsFormField[];
		}> = [];

		// Get forms from connections leading INTO this stage
		const incomingConnections = this.visibleConnections.filter(
			(c) => c.data.to_stage_id === stageId
		);

		for (const conn of incomingConnections) {
			const connForms = this.getFormsForConnection(conn.data.id);
			for (const trackedForm of connForms) {
				const fields = this.getFieldsForForm(trackedForm.data.id);
				if (fields.length > 0) {
					// Use the source stage if available, otherwise create a placeholder
					const sourceStage = conn.data.from_stage_id
						? this.visibleStages.find((s) => s.data.id === conn.data.from_stage_id)
						: null;
					result.push({
						stage: sourceStage?.data ?? {
							id: 'entry',
							workflow_id: this.workflowId,
							stage_name: 'Entry',
							stage_type: 'start'
						},
						form: trackedForm.data,
						fields: fields.map((f) => f.data)
					});
				}
			}
		}

		// Get all ancestor stages and their forms
		const ancestorStages = this.getAncestorStages(stageId);
		for (const trackedStage of ancestorStages) {
			// Get forms attached directly to this stage
			const stageForms = this.getFormsForStage(trackedStage.data.id);
			for (const trackedForm of stageForms) {
				const fields = this.getFieldsForForm(trackedForm.data.id);
				if (fields.length > 0) {
					result.push({
						stage: trackedStage.data,
						form: trackedForm.data,
						fields: fields.map((f) => f.data)
					});
				}
			}

			// Get forms from connections leading INTO this ancestor stage
			const ancestorIncoming = this.visibleConnections.filter(
				(c) => c.data.to_stage_id === trackedStage.data.id
			);
			for (const conn of ancestorIncoming) {
				const connForms = this.getFormsForConnection(conn.data.id);
				for (const trackedForm of connForms) {
					const fields = this.getFieldsForForm(trackedForm.data.id);
					if (fields.length > 0) {
						result.push({
							stage: trackedStage.data,
							form: trackedForm.data,
							fields: fields.map((f) => f.data)
						});
					}
				}
			}
		}

		return result;
	}

	/**
	 * Get all form fields from all forms across all stages and connections.
	 * Used for global edit tools to show all available fields.
	 */
	getAllFormFields(): Array<{
		stage: WorkflowStage;
		form: ToolsForm;
		fields: ToolsFormField[];
	}> {
		const result: Array<{
			stage: WorkflowStage;
			form: ToolsForm;
			fields: ToolsFormField[];
		}> = [];

		// Get all stages in order
		for (const trackedStage of this.visibleStages) {
			// Get forms attached directly to this stage
			const stageForms = this.getFormsForStage(trackedStage.data.id);
			for (const trackedForm of stageForms) {
				const fields = this.getFieldsForForm(trackedForm.data.id);
				if (fields.length > 0) {
					result.push({
						stage: trackedStage.data,
						form: trackedForm.data,
						fields: fields.map((f) => f.data)
					});
				}
			}

			// Get forms from connections leading INTO this stage
			const incomingConnections = this.visibleConnections.filter(
				(c) => c.data.to_stage_id === trackedStage.data.id
			);
			for (const conn of incomingConnections) {
				const connForms = this.getFormsForConnection(conn.data.id);
				for (const trackedForm of connForms) {
					const fields = this.getFieldsForForm(trackedForm.data.id);
					if (fields.length > 0) {
						// Use the source stage if available, otherwise create a placeholder
						const sourceStage = conn.data.from_stage_id
							? this.visibleStages.find((s) => s.data.id === conn.data.from_stage_id)
							: null;
						result.push({
							stage: sourceStage?.data ?? {
								id: 'entry',
								workflow_id: this.workflowId,
								stage_name: 'Entry',
								stage_type: 'start'
							},
							form: trackedForm.data,
							fields: fields.map((f) => f.data)
						});
					}
				}
			}
		}

		return result;
	}

	// =========================================================================
	// Post-Save Cleanup
	// =========================================================================

	/**
	 * Call after successful save to clean up state
	 */
	markAsSaved() {
		// Remove deleted items
		this.stages = this.stages.filter((s) => s.status !== 'deleted');
		this.connections = this.connections.filter((c) => c.status !== 'deleted');
		this.forms = this.forms.filter((f) => f.status !== 'deleted');
		this.formFields = this.formFields.filter((f) => f.status !== 'deleted');
		this.editTools = this.editTools.filter((e) => e.status !== 'deleted');
		this.protocolTools = this.protocolTools.filter((p) => p.status !== 'deleted');
		this.automations = this.automations.filter((a) => a.status !== 'deleted');
		this.fieldTags = this.fieldTags.filter((ft) => ft.status !== 'deleted');

		// Mark all as unchanged and update originals
		// Use $state.snapshot() to convert reactive proxies to plain objects
		for (const stage of this.stages) {
			stage.status = 'unchanged';
			stage.original = $state.snapshot(stage.data);
		}
		for (const conn of this.connections) {
			conn.status = 'unchanged';
			conn.original = $state.snapshot(conn.data);
		}
		for (const form of this.forms) {
			form.status = 'unchanged';
			form.original = $state.snapshot(form.data);
		}
		for (const field of this.formFields) {
			field.status = 'unchanged';
			field.original = $state.snapshot(field.data);
		}
		for (const tool of this.editTools) {
			tool.status = 'unchanged';
			tool.original = $state.snapshot(tool.data);
		}
		for (const tool of this.protocolTools) {
			tool.status = 'unchanged';
			tool.original = $state.snapshot(tool.data);
		}
		for (const automation of this.automations) {
			automation.status = 'unchanged';
			automation.original = $state.snapshot(automation.data);
		}
		for (const ft of this.fieldTags) {
			ft.status = 'unchanged';
			ft.original = $state.snapshot(ft.data);
		}
		this.fieldDefs = this.fieldDefs.filter((d) => d.status !== 'deleted');
		for (const d of this.fieldDefs) {
			d.status = 'unchanged';
			d.original = $state.snapshot(d.data);
		}
		this.workflowPermissionsOriginal = $state.snapshot(this.workflowPermissions);
	}

	// =========================================================================
	// Utility Methods
	// =========================================================================

	/**
	 * Get all changes grouped by operation type.
	 * Uses $state.snapshot() to convert reactive proxies to plain objects for API calls.
	 */
	getChanges() {
		return {
			stages: {
				new: this.stages.filter((s) => s.status === 'new').map((s) => $state.snapshot(s.data)),
				modified: this.stages
					.filter((s) => s.status === 'modified')
					.map((s) => $state.snapshot(s.data)),
				deleted: this.stages.filter((s) => s.status === 'deleted').map((s) => s.data.id)
			},
			connections: {
				new: this.connections.filter((c) => c.status === 'new').map((c) => $state.snapshot(c.data)),
				modified: this.connections
					.filter((c) => c.status === 'modified')
					.map((c) => $state.snapshot(c.data)),
				deleted: this.connections.filter((c) => c.status === 'deleted').map((c) => c.data.id)
			},
			forms: {
				new: this.forms.filter((f) => f.status === 'new').map((f) => $state.snapshot(f.data)),
				modified: this.forms
					.filter((f) => f.status === 'modified')
					.map((f) => $state.snapshot(f.data)),
				deleted: this.forms.filter((f) => f.status === 'deleted').map((f) => f.data.id)
			},
			formFields: {
				new: this.formFields.filter((f) => f.status === 'new').map((f) => $state.snapshot(f.data)),
				modified: this.formFields
					.filter((f) => f.status === 'modified')
					.map((f) => $state.snapshot(f.data)),
				deleted: this.formFields.filter((f) => f.status === 'deleted').map((f) => f.data.id)
			},
			editTools: {
				new: this.editTools.filter((e) => e.status === 'new').map((e) => $state.snapshot(e.data)),
				modified: this.editTools
					.filter((e) => e.status === 'modified')
					.map((e) => $state.snapshot(e.data)),
				deleted: this.editTools.filter((e) => e.status === 'deleted').map((e) => e.data.id)
			},
			protocolTools: {
				new: this.protocolTools
					.filter((p) => p.status === 'new')
					.map((p) => $state.snapshot(p.data)),
				modified: this.protocolTools
					.filter((p) => p.status === 'modified')
					.map((p) => $state.snapshot(p.data)),
				deleted: this.protocolTools.filter((p) => p.status === 'deleted').map((p) => p.data.id)
			},
			automations: {
				new: this.automations.filter((a) => a.status === 'new').map((a) => $state.snapshot(a.data)),
				modified: this.automations
					.filter((a) => a.status === 'modified')
					.map((a) => $state.snapshot(a.data)),
				deleted: this.automations.filter((a) => a.status === 'deleted').map((a) => a.data.id)
			},
			fieldTags: {
				new: this.fieldTags
					.filter((ft) => ft.status === 'new')
					.map((ft) => $state.snapshot(ft.data)),
				modified: this.fieldTags
					.filter((ft) => ft.status === 'modified')
					.map((ft) => $state.snapshot(ft.data)),
				deleted: this.fieldTags.filter((ft) => ft.status === 'deleted').map((ft) => ft.data.id)
			},
			fieldDefs: {
				// Shadow defs (id starts with `_temp_`) are mirrors of new form
				// fields; the server creates them via the formFields.new save
				// path, so don't double-send them here.
				new: this.fieldDefs
					.filter((d) => d.status === 'new' && !d.data.id.startsWith('_temp_'))
					.map((d) => $state.snapshot(d.data)),
				modified: this.fieldDefs
					.filter((d) => d.status === 'modified' && !d.data.id.startsWith('_temp_'))
					.map((d) => $state.snapshot(d.data)),
				deleted: this.fieldDefs
					.filter((d) => d.status === 'deleted' && !d.data.id.startsWith('_temp_'))
					.map((d) => d.data.id)
			},
			// Workflow-level permission fields. `dirty` lets the save action skip
			// the `workflows` update when nothing here changed. `entry_allowed_roles`
			// is NOT sent — the save action derives it from the entry connection.
			workflow: {
				id: this.workflowPermissions.id,
				visible_to_roles: $state.snapshot(this.workflowPermissions.visible_to_roles) ?? [],
				private_instances: this.workflowPermissions.private_instances ?? false,
				dirty: !deepEqual(this.workflowPermissions, this.workflowPermissionsOriginal)
			}
		};
	}
}

// =============================================================================
// Factory Function
// =============================================================================

export function createWorkflowBuilderState(workflowId: string): WorkflowBuilderState {
	return new WorkflowBuilderState(workflowId);
}
