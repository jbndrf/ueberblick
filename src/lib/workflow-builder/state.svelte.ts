/**
 * Workflow Builder State Management
 *
 * Central reactive state (Svelte 5 runes) for the workflow builder. This class
 * is a facade: it owns the tracked collections and derived views, and delegates
 * entity logic to the focused modules in ./state/. The public API is the
 * single source of truth for every builder surface (canvas, inspector, model
 * tab, YAML transfer) — keep it stable.
 */

import type {
	WorkflowStage,
	WorkflowConnection,
	ToolsForm,
	ToolsFormField,
	FormFieldRef,
	FormFieldConfig,
	ToolsEdit,
	ToolsProtocol,
	ToolsAutomation,
	ToolsFieldTag,
	TagMapping,
	TrackedStage,
	TrackedConnection,
	TrackedForm,
	TrackedFieldRef,
	TrackedFormField,
	TrackedEditTool,
	TrackedProtocolTool,
	TrackedAutomation,
	TrackedFieldTag,
	StageType,
	TriggerType,
	WorkflowFieldDef,
	WorkflowPermissions,
	TrackedFieldDef,
	ColumnPosition
} from './types';
import { loadTracked } from './state/tracked';
import * as stagesOps from './state/stages';
import * as connectionsOps from './state/connections';
import * as formsOps from './state/forms';
import * as fieldDefsOps from './state/field-defs';
import * as editToolsOps from './state/edit-tools';
import * as protocolToolsOps from './state/protocol-tools';
import * as automationsOps from './state/automations';
import * as fieldTagsOps from './state/field-tags';
import * as graphQueries from './state/graph-queries';
import { buildChanges, markAsSaved } from './state/changes.svelte';
import { generateId } from './utils';
import { deepEqual } from './utils';

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
	workflowPermissionsOriginal: WorkflowPermissions = {
		id: '',
		visible_to_roles: [],
		private_instances: false
	};

	// Tracked collections
	stages = $state<TrackedStage[]>([]);
	connections = $state<TrackedConnection[]>([]);
	forms = $state<TrackedForm[]>([]);
	/** Raw form-field refs (tools_form_field_refs). Read via getFieldsForForm. */
	fieldRefs = $state<TrackedFieldRef[]>([]);
	editTools = $state<TrackedEditTool[]>([]);
	protocolTools = $state<TrackedProtocolTool[]>([]);
	automations = $state<TrackedAutomation[]>([]);
	fieldTags = $state<TrackedFieldTag[]>([]);

	// Workflow-scoped field-def registry (workflow_field_defs collection).
	fieldDefs = $state<TrackedFieldDef[]>([]);

	visibleFieldDefs = $derived(this.fieldDefs.filter((d) => d.status !== 'deleted'));
	/**
	 * All defs visible to cross-form consumers. Since defs are always real
	 * (ids minted client-side), this is simply the visible registry — kept as
	 * its own property because palette/picker consumers key off it.
	 */
	effectiveFieldDefs = $derived(this.visibleFieldDefs);

	// Derived: dirty state
	isDirty = $derived(
		this.stages.some((s) => s.status !== 'unchanged') ||
			this.connections.some((c) => c.status !== 'unchanged') ||
			this.forms.some((f) => f.status !== 'unchanged') ||
			this.fieldRefs.some((f) => f.status !== 'unchanged') ||
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
	visibleFieldRefs = $derived(this.fieldRefs.filter((f) => f.status !== 'deleted'));
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
		fieldRefs?: FormFieldRef[];
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

		this.stages = loadTracked(data.stages || []);

		// Build connections array with entry connections for start stages
		const loadedConnections: TrackedConnection[] = loadTracked(data.connections || []);

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

		this.forms = loadTracked(data.forms || []);
		this.fieldRefs = loadTracked(
			(data.fieldRefs || []).map((r) => ({ ...r, config: r.config ?? {} }))
		);
		this.editTools = loadTracked(data.editTools || []);
		this.protocolTools = loadTracked(data.protocolTools || []);
		this.automations = loadTracked(data.automations || []);
		this.fieldTags = loadTracked(data.fieldTags || []);
		this.fieldDefs = loadTracked(data.fieldDefs || []);
	}

	// =========================================================================
	// Field Defs + Data Tabs (state/field-defs.ts)
	// =========================================================================

	getFieldDefById(id: string | undefined): WorkflowFieldDef | undefined {
		return fieldDefsOps.getFieldDefById(this, id);
	}

	addFieldDef(partial?: Partial<WorkflowFieldDef>): WorkflowFieldDef {
		return fieldDefsOps.addFieldDef(this, partial);
	}

	updateFieldDef(id: string, updates: Partial<WorkflowFieldDef>): void {
		fieldDefsOps.updateFieldDef(this, id, updates);
	}

	deleteFieldDef(id: string): void {
		fieldDefsOps.deleteFieldDef(this, id);
	}

	getDataTabs(): Array<{ name: string; order: number; isDefault: boolean }> {
		return fieldDefsOps.getDataTabs(this);
	}

	getFieldDefsForTab(tabName: string): TrackedFieldDef[] {
		return fieldDefsOps.getFieldDefsForTab(this, tabName);
	}

	moveFieldDefToTab(defId: string, tabName: string, row: number, column: ColumnPosition): void {
		fieldDefsOps.moveFieldDefToTab(this, defId, tabName, row, column);
	}

	renameDataTab(oldName: string, newName: string): void {
		fieldDefsOps.renameDataTab(this, oldName, newName);
	}

	reorderDataTabs(orderedNames: string[]): void {
		fieldDefsOps.reorderDataTabs(this, orderedNames);
	}

	// =========================================================================
	// Workflow-Level Permissions
	// =========================================================================

	/** Patch the workflow-level permission fields (visibility, private instances). */
	updateWorkflowPermissions(updates: Partial<WorkflowPermissions>): void {
		this.workflowPermissions = { ...this.workflowPermissions, ...updates };
	}

	// =========================================================================
	// Stages (state/stages.ts)
	// =========================================================================

	addStage(type: StageType, position?: { x: number; y: number }): WorkflowStage {
		return stagesOps.addStage(this, type, position);
	}

	updateStage(id: string, updates: Partial<WorkflowStage>) {
		stagesOps.updateStage(this, id, updates);
	}

	getAffectedConnections(stageId: string): TrackedConnection[] {
		return stagesOps.getAffectedConnections(this, stageId);
	}

	deleteStage(id: string, cascadeConnections = false) {
		stagesOps.deleteStage(this, id, cascadeConnections);
	}

	getStageById(id: string): TrackedStage | undefined {
		return this.stages.find((s) => s.data.id === id);
	}

	// =========================================================================
	// Connections (state/connections.ts)
	// =========================================================================

	addEntryConnection(toStageId: string): WorkflowConnection {
		return connectionsOps.addEntryConnection(this, toStageId);
	}

	addConnection(fromStageId: string, toStageId: string): WorkflowConnection {
		return connectionsOps.addConnection(this, fromStageId, toStageId);
	}

	updateConnection(id: string, updates: Partial<WorkflowConnection>) {
		connectionsOps.updateConnection(this, id, updates);
	}

	deleteConnection(id: string) {
		connectionsOps.deleteConnection(this, id);
	}

	getConnectionById(id: string): TrackedConnection | undefined {
		return this.connections.find((c) => c.data.id === id);
	}

	// =========================================================================
	// Forms + Form Fields (state/forms.ts)
	// =========================================================================

	addForm(target: { connectionId: string } | { stageId: string } | { isGlobal: true }): ToolsForm {
		return formsOps.addForm(this, target);
	}

	updateForm(id: string, updates: Partial<ToolsForm>) {
		formsOps.updateForm(this, id, updates);
	}

	deleteForm(id: string) {
		formsOps.deleteForm(this, id);
	}

	getFormById(id: string): TrackedForm | undefined {
		return this.forms.find((f) => f.data.id === id);
	}

	getFormsForConnection(connectionId: string): TrackedForm[] {
		return formsOps.getFormsForConnection(this, connectionId);
	}

	getFormsForStage(stageId: string): TrackedForm[] {
		return formsOps.getFormsForStage(this, stageId);
	}

	getGlobalForms(): TrackedForm[] {
		return formsOps.getGlobalForms(this);
	}

	addFormField(
		formId: string,
		fieldType: ToolsFormField['field_type'],
		rowIndex: number,
		columnPosition: ToolsFormField['column_position'],
		page: number = 1,
		label?: string
	): ToolsFormField {
		return formsOps.addFormField(this, formId, fieldType, rowIndex, columnPosition, page, label);
	}

	/** Label de-duplicated against the unique (workflow_id,label) index. */
	uniqueDefLabel(base: string): string {
		return fieldDefsOps.uniqueDefLabel(this, base);
	}

	addFormFieldRef(
		formId: string,
		fieldDefId: string,
		rowIndex: number,
		columnPosition: ToolsFormField['column_position'],
		page: number = 1
	): ToolsFormField | null {
		return formsOps.addFormFieldRef(this, formId, fieldDefId, rowIndex, columnPosition, page);
	}

	/** Patch the per-form presentation config of a field ref. */
	updateFieldRefConfig(refId: string, patch: Partial<FormFieldConfig>) {
		formsOps.updateFieldRefConfig(this, refId, patch);
	}

	deleteFormField(refId: string) {
		formsOps.deleteFormField(this, refId);
	}

	/** Resolved (ref ⊕ def) read-model for a single ref id. */
	getFormFieldById(refId: string): TrackedFormField | undefined {
		return formsOps.getFormFieldById(this, refId);
	}

	/** Resolved (ref ⊕ def) read-models for a form, ordered. */
	getFieldsForForm(formId: string): TrackedFormField[] {
		return formsOps.getFieldsForForm(this, formId);
	}

	/** Visible refs pointing at a def — usage list for the library/def panel. */
	getRefsForDef(defId: string): TrackedFieldRef[] {
		return formsOps.getRefsForDef(this, defId);
	}

	// =========================================================================
	// Edit Tools (state/edit-tools.ts)
	// =========================================================================

	addEditTool(target: { connectionId: string } | { stageId: string }): ToolsEdit {
		return editToolsOps.addEditTool(this, target);
	}

	addGlobalEditTool(editMode: 'form_fields' | 'location' = 'form_fields'): ToolsEdit {
		return editToolsOps.addGlobalEditTool(this, editMode);
	}

	syncGlobalToolStages() {
		editToolsOps.syncGlobalToolStages(this);
	}

	updateEditTool(id: string, updates: Partial<ToolsEdit>) {
		editToolsOps.updateEditTool(this, id, updates);
	}

	deleteEditTool(id: string) {
		editToolsOps.deleteEditTool(this, id);
	}

	getEditToolById(id: string): TrackedEditTool | undefined {
		return this.editTools.find((e) => e.data.id === id);
	}

	getEditToolsForConnection(connectionId: string): TrackedEditTool[] {
		return editToolsOps.getEditToolsForConnection(this, connectionId);
	}

	getEditToolsForStage(stageId: string): TrackedEditTool[] {
		return editToolsOps.getEditToolsForStage(this, stageId);
	}

	getNonGlobalEditToolsForStage(stageId: string): TrackedEditTool[] {
		return editToolsOps.getNonGlobalEditToolsForStage(this, stageId);
	}

	getGlobalEditTools(): TrackedEditTool[] {
		return editToolsOps.getGlobalEditTools(this);
	}

	// =========================================================================
	// Protocol Tools (state/protocol-tools.ts)
	// =========================================================================

	addProtocolTool(opts: {
		stageId?: string;
		connectionId?: string;
		isGlobal?: boolean;
	}): ToolsProtocol {
		return protocolToolsOps.addProtocolTool(this, opts);
	}

	updateProtocolTool(id: string, updates: Partial<ToolsProtocol>) {
		protocolToolsOps.updateProtocolTool(this, id, updates);
	}

	deleteProtocolTool(id: string) {
		protocolToolsOps.deleteProtocolTool(this, id);
	}

	getProtocolToolById(id: string): TrackedProtocolTool | undefined {
		return this.protocolTools.find((p) => p.data.id === id);
	}

	getProtocolToolsForStage(stageId: string): TrackedProtocolTool[] {
		return protocolToolsOps.getProtocolToolsForStage(this, stageId);
	}

	getProtocolToolsForConnection(connectionId: string): TrackedProtocolTool[] {
		return protocolToolsOps.getProtocolToolsForConnection(this, connectionId);
	}

	getGlobalProtocolTools(): TrackedProtocolTool[] {
		return protocolToolsOps.getGlobalProtocolTools(this);
	}

	getProtocolFormIds(): Set<string> {
		return formsOps.getProtocolFormIds(this);
	}

	// =========================================================================
	// Automations (state/automations.ts)
	// =========================================================================

	addAutomation(triggerType: TriggerType = 'on_transition'): ToolsAutomation {
		return automationsOps.addAutomation(this, triggerType);
	}

	updateAutomation(id: string, updates: Partial<ToolsAutomation>) {
		automationsOps.updateAutomation(this, id, updates);
	}

	deleteAutomation(id: string) {
		automationsOps.deleteAutomation(this, id);
	}

	getAutomationById(id: string): TrackedAutomation | undefined {
		return this.automations.find((a) => a.data.id === id);
	}

	// =========================================================================
	// Field Tags (state/field-tags.ts)
	// =========================================================================

	getFieldTagForWorkflow(): TrackedFieldTag | undefined {
		return fieldTagsOps.getFieldTagForWorkflow(this);
	}

	getOrCreateFieldTag(): ToolsFieldTag {
		return fieldTagsOps.getOrCreateFieldTag(this);
	}

	updateFieldTag(id: string, updates: Partial<ToolsFieldTag>) {
		fieldTagsOps.updateFieldTag(this, id, updates);
	}

	setTagMapping(tagType: string, fieldId: string | null, config?: Record<string, unknown>) {
		fieldTagsOps.setTagMapping(this, tagType, fieldId, config);
	}

	getTagMapping(tagType: string): TagMapping | undefined {
		return fieldTagsOps.getTagMapping(this, tagType);
	}

	deleteFieldTag() {
		fieldTagsOps.deleteFieldTag(this);
	}

	updateTagMappingConfig(tagType: string, config: Record<string, unknown>) {
		fieldTagsOps.updateTagMappingConfig(this, tagType, config);
	}

	// =========================================================================
	// Graph Queries (state/graph-queries.ts)
	// =========================================================================

	getAncestorStages(stageId: string): TrackedStage[] {
		return graphQueries.getAncestorStages(this, stageId);
	}

	getAncestorStagesForConnection(connectionId: string): TrackedStage[] {
		return graphQueries.getAncestorStagesForConnection(this, connectionId);
	}

	getAncestorFormFields(connectionId: string): graphQueries.StageFormFields[] {
		return graphQueries.getAncestorFormFields(this, connectionId);
	}

	getAncestorFormFieldsForStage(stageId: string): graphQueries.StageFormFields[] {
		return graphQueries.getAncestorFormFieldsForStage(this, stageId);
	}

	getAllFormFields(): graphQueries.StageFormFields[] {
		return graphQueries.getAllFormFields(this);
	}

	// =========================================================================
	// Save Serialization (state/changes.svelte.ts)
	// =========================================================================

	markAsSaved() {
		markAsSaved(this);
	}

	getChanges() {
		return buildChanges(this);
	}
}

// =============================================================================
// Factory Function
// =============================================================================

export function createWorkflowBuilderState(workflowId: string): WorkflowBuilderState {
	return new WorkflowBuilderState(workflowId);
}
