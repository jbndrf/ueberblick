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
	TrackedStage,
	TrackedConnection,
	TrackedForm,
	TrackedFormField,
	TrackedEditTool,
	StageType,
	ItemStatus
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

	// Derived: dirty state
	isDirty = $derived(
		this.stages.some((s) => s.status !== 'unchanged') ||
			this.connections.some((c) => c.status !== 'unchanged') ||
			this.forms.some((f) => f.status !== 'unchanged') ||
			this.formFields.some((f) => f.status !== 'unchanged') ||
			this.editTools.some((e) => e.status !== 'unchanged')
	);

	// Derived: visible items (exclude deleted)
	visibleStages = $derived(this.stages.filter((s) => s.status !== 'deleted'));
	visibleConnections = $derived(this.connections.filter((c) => c.status !== 'deleted'));
	visibleForms = $derived(this.forms.filter((f) => f.status !== 'deleted'));
	visibleFormFields = $derived(this.formFields.filter((f) => f.status !== 'deleted'));
	visibleEditTools = $derived(this.editTools.filter((e) => e.status !== 'deleted'));

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
					visual_config: { button_label: 'Start' }
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
				button_label: 'Start'
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

		// Delete edit tools attached directly to this stage
		const relatedEditTools = this.editTools.filter((e) => e.data.stage_id === id);
		for (const tool of relatedEditTools) {
			this.deleteEditTool(tool.data.id);
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
					button_color: '#3b82f6'
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
			stage_id: isStageAttached ? target.stageId : undefined,
			name: 'Edit Fields',
			editable_fields: [],
			// Stage-attached edit tools need their own config; connection-attached tools inherit
			...(isStageAttached && {
				allowed_roles: [],
				visual_config: {
					button_label: 'Edit',
					button_color: '#f97316' // orange for edit actions
				}
			})
		};

		this.editTools.push({
			data: newEditTool,
			status: 'new'
		});

		return newEditTool;
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

	getEditToolsForStage(stageId: string): TrackedEditTool[] {
		return this.visibleEditTools.filter((e) => e.data.stage_id === stageId);
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
