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
	ToolsAutomation,
	ToolsFieldTag,
	TagMapping,
	TrackedStage,
	TrackedConnection,
	TrackedForm,
	TrackedFormField,
	TrackedEditTool,
	TrackedAutomation,
	TrackedFieldTag,
	StageType,
	ItemStatus,
	TriggerType,
	TriggerConfig,
	TransitionTriggerConfig
} from './types';

// =============================================================================
// State Class
// =============================================================================

export class WorkflowBuilderState {
	// Core data
	workflowId: string;
	workflowName = $state<string>('');
	private initialized = false;

	// Tracked collections
	stages = $state<TrackedStage[]>([]);
	connections = $state<TrackedConnection[]>([]);
	forms = $state<TrackedForm[]>([]);
	formFields = $state<TrackedFormField[]>([]);
	editTools = $state<TrackedEditTool[]>([]);
	automations = $state<TrackedAutomation[]>([]);
	fieldTags = $state<TrackedFieldTag[]>([]);

	// Derived: dirty state
	isDirty = $derived(
		this.stages.some((s) => s.status !== 'unchanged') ||
			this.connections.some((c) => c.status !== 'unchanged') ||
			this.forms.some((f) => f.status !== 'unchanged') ||
			this.formFields.some((f) => f.status !== 'unchanged') ||
			this.editTools.some((e) => e.status !== 'unchanged') ||
			this.automations.some((a) => a.status !== 'unchanged') ||
			this.fieldTags.some((ft) => ft.status !== 'unchanged')
	);

	// Derived: visible items (exclude deleted)
	visibleStages = $derived(this.stages.filter((s) => s.status !== 'deleted'));
	visibleConnections = $derived(this.connections.filter((c) => c.status !== 'deleted'));
	visibleForms = $derived(this.forms.filter((f) => f.status !== 'deleted'));
	visibleFormFields = $derived(this.formFields.filter((f) => f.status !== 'deleted'));
	visibleEditTools = $derived(this.editTools.filter((e) => e.status !== 'deleted'));
	visibleAutomations = $derived(this.automations.filter((a) => a.status !== 'deleted'));

	// Derived: has start stage
	hasStartStage = $derived(
		this.visibleStages.some((s) => s.data.stage_type === 'start')
	);

	constructor(workflowId: string) {
		this.workflowId = workflowId;
	}

	// =========================================================================
	// Initialization (from server data)
	// =========================================================================

	initFromServer(data: {
		workflowName?: string;
		stages?: WorkflowStage[];
		connections?: WorkflowConnection[];
		forms?: ToolsForm[];
		formFields?: ToolsFormField[];
		editTools?: ToolsEdit[];
		automations?: ToolsAutomation[];
		fieldTags?: ToolsFieldTag[];
	}) {
		// Guard against re-initialization (prevents infinite effect loops)
		if (this.initialized) return;
		this.initialized = true;

		this.workflowName = data.workflowName || '';

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

	addForm(target: { connectionId: string } | { stageId: string }): ToolsForm {
		const isStageAttached = 'stageId' in target;

		const newForm: ToolsForm = {
			id: generateId(),
			workflow_id: this.workflowId,
			connection_id: 'connectionId' in target ? target.connectionId : undefined,
			stage_id: isStageAttached ? target.stageId : undefined,
			name: 'New Form',
			// Stage-attached forms need their own config; connection-attached forms inherit
			...(isStageAttached && {
				allowed_roles: [],
				visual_config: {
					button_label: 'Submit',
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
		return this.visibleForms.filter((f) => f.data.connection_id === connectionId);
	}

	getFormsForStage(stageId: string): TrackedForm[] {
		return this.visibleForms.filter((f) => f.data.stage_id === stageId);
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

		const newField: ToolsFormField = {
			id: generateId(),
			form_id: formId,
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

		const newEditTool: ToolsEdit = {
			id: generateId(),
			connection_id: 'connectionId' in target ? target.connectionId : undefined,
			stage_id: isStageAttached ? [target.stageId] : undefined,
			name: 'Edit Fields',
			editable_fields: [],
			edit_mode: 'form_fields',
			is_global: false,
			// Stage-attached edit tools need their own config; connection-attached tools inherit
			...(isStageAttached && {
				allowed_roles: [],
				visual_config: {
					button_label: 'Edit',
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
			connection_id: undefined,
			stage_id: allStageIds,
			name: editMode === 'location' ? 'Edit Location' : 'Edit Fields',
			editable_fields: [],
			edit_mode: editMode,
			is_global: true,
			allowed_roles: [],
			visual_config: {
				button_label: editMode === 'location' ? 'Location' : 'Edit',
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
	// Automation Operations
	// =========================================================================

	addAutomation(triggerType: TriggerType = 'on_transition'): ToolsAutomation {
		const defaultConfig: TriggerConfig = triggerType === 'on_transition'
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
		const sourceStage = this.visibleStages.find(
			(s) => s.data.id === connection.data.from_stage_id
		);
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
		for (const automation of this.automations) {
			automation.status = 'unchanged';
			automation.original = $state.snapshot(automation.data);
		}
		for (const ft of this.fieldTags) {
			ft.status = 'unchanged';
			ft.original = $state.snapshot(ft.data);
		}
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
				modified: this.stages.filter((s) => s.status === 'modified').map((s) => $state.snapshot(s.data)),
				deleted: this.stages.filter((s) => s.status === 'deleted').map((s) => s.data.id)
			},
			connections: {
				new: this.connections.filter((c) => c.status === 'new').map((c) => $state.snapshot(c.data)),
				modified: this.connections.filter((c) => c.status === 'modified').map((c) => $state.snapshot(c.data)),
				deleted: this.connections.filter((c) => c.status === 'deleted').map((c) => c.data.id)
			},
			forms: {
				new: this.forms.filter((f) => f.status === 'new').map((f) => $state.snapshot(f.data)),
				modified: this.forms.filter((f) => f.status === 'modified').map((f) => $state.snapshot(f.data)),
				deleted: this.forms.filter((f) => f.status === 'deleted').map((f) => f.data.id)
			},
			formFields: {
				new: this.formFields.filter((f) => f.status === 'new').map((f) => $state.snapshot(f.data)),
				modified: this.formFields.filter((f) => f.status === 'modified').map((f) => $state.snapshot(f.data)),
				deleted: this.formFields.filter((f) => f.status === 'deleted').map((f) => f.data.id)
			},
			editTools: {
				new: this.editTools.filter((e) => e.status === 'new').map((e) => $state.snapshot(e.data)),
				modified: this.editTools.filter((e) => e.status === 'modified').map((e) => $state.snapshot(e.data)),
				deleted: this.editTools.filter((e) => e.status === 'deleted').map((e) => e.data.id)
			},
			automations: {
				new: this.automations.filter((a) => a.status === 'new').map((a) => $state.snapshot(a.data)),
				modified: this.automations.filter((a) => a.status === 'modified').map((a) => $state.snapshot(a.data)),
				deleted: this.automations.filter((a) => a.status === 'deleted').map((a) => a.data.id)
			},
			fieldTags: {
				new: this.fieldTags.filter((ft) => ft.status === 'new').map((ft) => $state.snapshot(ft.data)),
				modified: this.fieldTags.filter((ft) => ft.status === 'modified').map((ft) => $state.snapshot(ft.data)),
				deleted: this.fieldTags.filter((ft) => ft.status === 'deleted').map((ft) => ft.data.id)
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
