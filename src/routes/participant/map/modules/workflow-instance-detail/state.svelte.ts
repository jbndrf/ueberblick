/**
 * WorkflowInstanceDetailState
 *
 * Reactive state management for the WorkflowInstanceDetailModule.
 * Loads workflow instance data, stages, connections, field values, and tools via gateway.
 */

import type { ParticipantGateway } from '$lib/participant-state/gateway.svelte';
import type { FieldValueCache } from '$lib/participant-state/field-value-cache.svelte';
import type { Snippet } from 'svelte';

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
	visual_config?: {
		button_label?: string;
		button_color?: string;
		confirmation_message?: string;
		requires_confirmation?: boolean;
	};
}

export interface FieldValue {
	id: string;
	instance_id: string;
	field_key: string;
	value: string;
	file_value: string;
	stage_id: string;
	created_by_action: string;
	created: string;
}

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
}

export interface FormField {
	id: string;
	form_id: string;
	field_label: string;
	field_type: string;
	field_order: number;
	is_required: boolean;
	placeholder?: string;
	help_text?: string;
	validation_rules?: Record<string, unknown> | null;
	field_options?: Record<string, unknown> | null;
	conditional_logic?: Record<string, unknown> | null;
	// Layout properties
	page?: number;
	page_title?: string;
	row_index?: number;
	column_position?: 'left' | 'right' | 'full';
}

export interface ToolEdit {
	id: string;
	connection_id: string;
	stage_id: string[];
	name: string;
	editable_fields: string[];
	edit_mode: 'form_fields' | 'location';
	is_global: boolean;
	tool_order?: number;
	allowed_roles: string[];
	visual_config?: Record<string, unknown>;
}

export interface ToolProtocol {
	id: string;
	connection_id?: string;
	stage_id: string[];
	is_global: boolean;
	name: string;
	editable_fields: string[];
	prefill_config?: Record<string, boolean>;
	protocol_form_id?: string;
	tool_order?: number;
	allowed_roles: string[];
	visual_config?: Record<string, unknown>;
}

export interface DisplayFieldValue {
	id: string;          // Record ID for file URLs
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
		location?: { lat: number; lon: number } | null;
		created_fields?: Array<{ field_key: string; field_name?: string; value: string }>;
		changes?: Array<{ field_key: string; field_name?: string; before: string | null; after: string }>;
		before?: { lat: number; lon: number } | null;
		after?: { lat: number; lon: number };
		// Stage transition specific
		from_stage_id?: string;
		from_stage_name?: string;
		to_stage_id?: string;
		to_stage_name?: string;
		connection_id?: string;
		// Protocol specific
		protocol_entry_id?: string;
	};
	created: string;
	// Expanded relations
	expand?: {
		executed_by?: { name?: string; email?: string };
	};
}

// =============================================================================
// State Class
// =============================================================================

export class WorkflowInstanceDetailState {
	// Core identifiers
	private gateway: ParticipantGateway;
	instanceId: string;

	// Loaded data (reactive)
	// Note: Backend PocketBase rules already filter by participant role
	instance = $state<Record<string, unknown> | null>(null);
	workflow = $state<Record<string, unknown> | null>(null);
	stages = $state<WorkflowStage[]>([]);
	connections = $state<WorkflowConnection[]>([]);
	fieldValues = $state<FieldValue[]>([]);
	forms = $state<ToolForm[]>([]);
	formFields = $state<FormField[]>([]);
	editTools = $state<ToolEdit[]>([]);
	protocolTools = $state<ToolProtocol[]>([]);
	toolUsageHistory = $state<ToolUsageRecord[]>([]);

	// UI state
	isLoading = $state(true);
	loadError = $state<string | null>(null);
	activeStageTab = $state<string>('');

	// ==========================================================================
	// Derived State
	// ==========================================================================

	/** Current stage object */
	currentStage = $derived.by((): WorkflowStage | null => {
		if (!this.instance) return null;
		const currentStageId = this.instance.current_stage_id as string;
		return this.stages.find(s => s.id === currentStageId) || null;
	});

	/** Connections available from current stage */
	availableConnections = $derived.by((): WorkflowConnection[] => {
		if (!this.instance) return [];
		const currentStageId = this.instance.current_stage_id as string;
		return this.connections.filter(c => c.from_stage_id === currentStageId);
	});

	/** Edit tools available for current stage (attached directly to stage, not connection) */
	availableStageEditTools = $derived.by((): ToolEdit[] => {
		if (!this.instance) return [];
		const currentStageId = this.instance.current_stage_id as string;
		return this.editTools.filter(e => {
			if (e.connection_id) return false;
			if (!e.stage_id || e.stage_id.length === 0) return false;
			return e.stage_id.includes(currentStageId);
		});
	});

	/** Progress percentage */
	progressPercentage = $derived.by((): number => {
		if (!this.stages.length || !this.instance) return 0;
		const currentStageId = this.instance.current_stage_id as string;
		const currentIndex = this.stages.findIndex(s => s.id === currentStageId);
		if (currentIndex < 0) return 0;
		return Math.round(((currentIndex + 1) / this.stages.length) * 100);
	});

	/** Current stage index (1-based for display) */
	currentStageIndex = $derived.by((): number => {
		if (!this.stages.length || !this.instance) return 0;
		const currentStageId = this.instance.current_stage_id as string;
		const index = this.stages.findIndex(s => s.id === currentStageId);
		return index >= 0 ? index + 1 : 0;
	});

	// ==========================================================================
	// Constructor
	// ==========================================================================

	private fieldValueCache: FieldValueCache | null;

	constructor(instanceId: string, gateway: ParticipantGateway, fieldValueCache?: FieldValueCache) {
		this.instanceId = instanceId;
		this.gateway = gateway;
		this.fieldValueCache = fieldValueCache ?? null;
	}

	// ==========================================================================
	// Data Loading
	// ==========================================================================

	async load(): Promise<void> {
		this.isLoading = true;
		this.loadError = null;
		const t0 = performance.now();

		try {
			// First load the instance to get workflow_id
			const instanceResult = await this.gateway.collection('workflow_instances').getOne(this.instanceId, {
				expand: 'workflow_id'
			});
			const tInstance = performance.now();
			console.log(`[DetailLoad] getOne instance: ${(tInstance - t0).toFixed(1)}ms`);

			this.instance = instanceResult;
			const expanded = instanceResult.expand as Record<string, unknown> | undefined;
			this.workflow = (expanded?.workflow_id as Record<string, unknown>) || null;

			const workflowId = instanceResult.workflow_id as string;

			// Phase 1: Load core data that depends only on workflowId/instanceId
			const p1Start = performance.now();
			const p1Labels = ['stages', 'connections', 'fieldValues', 'forms', 'toolUsage'];
			const p1Timings: number[] = [];
			const [stagesResult, connectionsResult, fieldValuesResult, formsResult, toolUsageResult] = await Promise.all([
				this.gateway.collection('workflow_stages').getFullList({
					filter: `workflow_id = "${workflowId}"`,
					sort: 'stage_order'
				}).then(r => { p1Timings[0] = performance.now() - p1Start; return r; }),
				this.gateway.collection('workflow_connections').getFullList({
					filter: `workflow_id = "${workflowId}"`
				}).then(r => { p1Timings[1] = performance.now() - p1Start; return r; }),
				(this.fieldValueCache
					? Promise.resolve(this.fieldValueCache.getForInstance(this.instanceId))
					: this.gateway.collection('workflow_instance_field_values').getFullList({
						filter: `instance_id = "${this.instanceId}"`
					})
				).then(r => { p1Timings[2] = performance.now() - p1Start; return r; }),
				this.gateway.collection('tools_forms').getFullList({
					filter: `workflow_id = "${workflowId}"`
				}).then(r => { p1Timings[3] = performance.now() - p1Start; return r; }),
				this.gateway.collection('workflow_instance_tool_usage').getFullList({
					filter: `instance_id = "${this.instanceId}"`,
					sort: '-executed_at',
					expand: 'executed_by'
				}).then(r => { p1Timings[4] = performance.now() - p1Start; return r; })
			]);
			const tP1 = performance.now();
			console.log(`[DetailLoad] Phase 1 total: ${(tP1 - p1Start).toFixed(1)}ms — ${p1Labels.map((l, i) => `${l}: ${p1Timings[i]?.toFixed(1)}ms`).join(', ')}`);

			this.stages = stagesResult as unknown as WorkflowStage[];
			this.connections = connectionsResult as unknown as WorkflowConnection[];
			this.fieldValues = fieldValuesResult as unknown as FieldValue[];
			this.forms = formsResult as unknown as ToolForm[];
			this.toolUsageHistory = toolUsageResult as unknown as ToolUsageRecord[];

			// Phase 2: Load tools scoped by phase 1 results (form IDs, connection/stage IDs)
			const formIds = this.forms.map(f => f.id);
			const connectionIds = this.connections.map(c => c.id);
			const stageIds = this.stages.map(s => s.id);

			// Build scoped filters using OR chains
			const formFieldsFilter = formIds.length > 0
				? formIds.map(id => `form_id = "${id}"`).join(' || ')
				: 'form_id = "__none__"';

			const toolScopeFilter = [
				...connectionIds.map(id => `connection_id = "${id}"`),
				...stageIds.map(id => `stage_id ~ "${id}"`)
			].join(' || ') || 'connection_id = "__none__"';

			const p2Start = performance.now();
			const p2Labels = ['formFields', 'editTools', 'protocolTools'];
			const p2Timings: number[] = [];
			const [formFieldsResult, editToolsResult, protocolToolsResult] = await Promise.all([
				this.gateway.collection('tools_form_fields').getFullList({
					filter: formFieldsFilter
				}).then(r => { p2Timings[0] = performance.now() - p2Start; return r; }),
				this.gateway.collection('tools_edit').getFullList({
					filter: toolScopeFilter
				}).then(r => { p2Timings[1] = performance.now() - p2Start; return r; }),
				this.gateway.collection('tools_protocol').getFullList({
					filter: toolScopeFilter
				}).then(r => { p2Timings[2] = performance.now() - p2Start; return r; })
			]);
			const tP2 = performance.now();
			console.log(`[DetailLoad] Phase 2 total: ${(tP2 - p2Start).toFixed(1)}ms — ${p2Labels.map((l, i) => `${l}: ${p2Timings[i]?.toFixed(1)}ms`).join(', ')}`);

			this.formFields = (formFieldsResult as unknown as FormField[])
				.map(f => ({
					...f,
					field_options: this.parseFieldOptions(f.field_options)
				}));

			this.editTools = editToolsResult as unknown as ToolEdit[];

			// Exclude global protocol tools (automation-only) -- simple boolean check on already-filtered set
			this.protocolTools = (protocolToolsResult as unknown as ToolProtocol[]).filter(p => !p.is_global);

			// Set initial active stage tab to first stage that has data, or first stage as fallback
			if (this.stages.length > 0 && !this.activeStageTab) {
				const firstWithData = this.stages.find(s => this.fieldValues.some(fv => fv.stage_id === s.id));
				this.activeStageTab = firstWithData?.id || this.stages[0].id;
			}

			console.log(`[DetailLoad] TOTAL: ${(performance.now() - t0).toFixed(1)}ms`);
			this.isLoading = false;
		} catch (error) {
			console.error('Failed to load workflow instance:', error);
			this.loadError = error instanceof Error ? error.message : 'Failed to load workflow instance';
			this.isLoading = false;
		}
	}

	async refresh(): Promise<void> {
		await this.load();
	}

	// ==========================================================================
	// Field Value Helpers
	// ==========================================================================

	/** Get field values for a specific stage */
	getFieldValuesForStage(stageId: string): DisplayFieldValue[] {
		const stageFieldValues = this.fieldValues.filter(fv => fv.stage_id === stageId);

		return stageFieldValues.map(fv => {
			const fieldDef = this.formFields.find(f => f.id === fv.field_key);
			return {
				id: fv.id,  // Record ID for file URLs
				label: fieldDef?.field_label || fv.field_key,
				value: fv.value,
				fileValue: fv.file_value || undefined,
				type: fieldDef?.field_type || 'text',
				fieldKey: fv.field_key
			};
		});
	}

	/** Helper to ensure field_options is an object (in case it's a string from DB) */
	private parseFieldOptions(options: unknown): Record<string, unknown> | null {
		if (!options) return null;
		if (typeof options === 'object') return options as Record<string, unknown>;
		if (typeof options === 'string') {
			try {
				return JSON.parse(options);
			} catch {
				return null;
			}
		}
		return null;
	}

	/** Helper to parse JSON string values (arrays like '["id1","id2"]' stored in DB) */
	private parseFieldValue(value: string | undefined): unknown {
		if (!value) return undefined;
		// Try to parse JSON arrays/objects
		if (value.startsWith('[') || value.startsWith('{')) {
			try {
				return JSON.parse(value);
			} catch {
				return value;
			}
		}
		return value;
	}

	/** Get fields formatted for FormRenderer (with layout and values) */
	getFieldsForFormRenderer(stageId: string): Array<FormField & { value?: unknown; fileValue?: string; fileRecordId?: string; storedFiles?: Array<{ recordId: string; fileName: string }> }> {
		const stageFieldValues = this.fieldValues.filter(fv => fv.stage_id === stageId);

		// Get unique field keys from values and find their field definitions
		const fieldKeysWithData = new Set(stageFieldValues.map(fv => fv.field_key));

		// Get form fields that have values for this stage
		return this.formFields
			.filter(f => fieldKeysWithData.has(f.id))
			.map(fieldDef => {
				// Get ALL field values for this field (supports multiple files)
				const fieldValuesForField = stageFieldValues.filter(fv => fv.field_key === fieldDef.id);

				// For file fields, aggregate all file records
				const storedFiles = fieldValuesForField
					.filter(fv => fv.file_value)
					.map(fv => ({
						recordId: fv.id,
						fileName: fv.file_value
					}));

				// For non-file fields, get the first value (there should only be one)
				const firstValue = fieldValuesForField.find(fv => fv.value);

				return {
					...fieldDef,
					// Ensure field_options is properly parsed
					field_options: this.parseFieldOptions(fieldDef.field_options),
					// Ensure layout defaults
					page: fieldDef.page ?? 1,
					row_index: fieldDef.row_index ?? 0,
					column_position: fieldDef.column_position ?? 'full',
					// Add value data (parse JSON strings like '["id1","id2"]')
					value: this.parseFieldValue(firstValue?.value),
					// Legacy single file support (first file)
					fileValue: storedFiles[0]?.fileName || undefined,
					fileRecordId: storedFiles[0]?.recordId || undefined,
					// Multi-file support
					storedFiles: storedFiles.length > 0 ? storedFiles : undefined
				};
			})
			.sort((a, b) => {
				// Sort by page, then row_index, then column position
				if ((a.page ?? 1) !== (b.page ?? 1)) return (a.page ?? 1) - (b.page ?? 1);
				if ((a.row_index ?? 0) !== (b.row_index ?? 0)) return (a.row_index ?? 0) - (b.row_index ?? 0);
				const posOrder = { left: 0, right: 1, full: 2 };
				return (posOrder[a.column_position ?? 'full'] ?? 2) - (posOrder[b.column_position ?? 'full'] ?? 2);
			});
	}

	/** Check if a stage has any data */
	stageHasData(stageId: string): boolean {
		return this.fieldValues.some(fv => fv.stage_id === stageId);
	}

	/**
	 * Get form fields only from stages that have been reached (current or earlier).
	 * This prevents editing fields from future stages when using global edit tools.
	 */
	getFormFieldsForReachedStages(): FormField[] {
		if (!this.instance) return [];

		const currentStageId = this.instance.current_stage_id as string;
		const currentStageIndex = this.stages.findIndex(s => s.id === currentStageId);
		if (currentStageIndex < 0) return [];

		// Get IDs of all reached stages (current and earlier, based on stage_order)
		const reachedStageIds = new Set(
			this.stages
				.filter((_, index) => index <= currentStageIndex)
				.map(s => s.id)
		);

		// Get forms that belong to reached stages
		const reachedFormIds = new Set<string>();

		for (const form of this.forms) {
			// Form directly attached to a reached stage
			if (form.stage_id && reachedStageIds.has(form.stage_id)) {
				reachedFormIds.add(form.id);
				continue;
			}

			// Form attached to a connection - check if connection's target is a reached stage
			if (form.connection_id) {
				const connection = this.connections.find(c => c.id === form.connection_id);
				if (connection && reachedStageIds.has(connection.to_stage_id)) {
					reachedFormIds.add(form.id);
				}
			}
		}

		// Return only form fields from reached forms
		return this.formFields.filter(f => reachedFormIds.has(f.form_id));
	}

	/**
	 * Get editable fields grouped by their source stage.
	 * Used by EditFieldsTool to render tabbed UI when fields come from multiple stages.
	 */
	getEditableFieldsGroupedByStage(editableFieldIds: string[]): EditableFieldsByStage[] {
		if (!this.instance || editableFieldIds.length === 0) return [];

		// Filter to only editable fields from reached stages
		const reachedFields = this.getFormFieldsForReachedStages();
		const editableFields = reachedFields.filter(f => editableFieldIds.includes(f.id));

		// Build a map of form_id -> stage_id
		const formToStage = new Map<string, string>();
		for (const form of this.forms) {
			if (form.stage_id) {
				formToStage.set(form.id, form.stage_id);
			} else if (form.connection_id) {
				const connection = this.connections.find(c => c.id === form.connection_id);
				if (connection) {
					formToStage.set(form.id, connection.to_stage_id);
				}
			}
		}

		// Group fields by stage
		const stageFieldsMap = new Map<string, FormField[]>();
		for (const field of editableFields) {
			const stageId = formToStage.get(field.form_id);
			if (stageId) {
				if (!stageFieldsMap.has(stageId)) {
					stageFieldsMap.set(stageId, []);
				}
				stageFieldsMap.get(stageId)!.push(field);
			}
		}

		// Build result array sorted by stage order
		const result: EditableFieldsByStage[] = [];
		for (const stage of this.stages) {
			const fields = stageFieldsMap.get(stage.id);
			if (fields && fields.length > 0) {
				result.push({
					stageId: stage.id,
					stageName: stage.stage_name,
					fields
				});
			}
		}

		return result;
	}

	// ==========================================================================
	// Tool Helpers
	// ==========================================================================

	/** Get protocol tools available for a specific stage (attached directly to stage, not connection) */
	getProtocolToolsForStage(stageId: string): ToolProtocol[] {
		return this.protocolTools.filter(p => {
			if (p.connection_id) return false;
			if (!p.stage_id || p.stage_id.length === 0) return false;
			return p.stage_id.includes(stageId);
		});
	}

	/** Get protocol tools for a specific connection */
	getProtocolToolsForConnection(connectionId: string): ToolProtocol[] {
		return this.protocolTools.filter(p => p.connection_id === connectionId);
	}

	/** Get form fields for a protocol form, sorted by page/row/order */
	getProtocolFormFields(protocolFormId: string): FormField[] {
		const form = this.forms.find(f => f.id === protocolFormId);
		if (!form) return [];

		return this.formFields
			.filter(f => f.form_id === protocolFormId)
			.sort((a, b) => {
				if ((a.page ?? 1) !== (b.page ?? 1)) return (a.page ?? 1) - (b.page ?? 1);
				if ((a.row_index ?? 0) !== (b.row_index ?? 0)) return (a.row_index ?? 0) - (b.row_index ?? 0);
				const posOrder = { left: 0, right: 1, full: 2 };
				return (posOrder[a.column_position ?? 'full'] ?? 2) - (posOrder[b.column_position ?? 'full'] ?? 2);
			});
	}

	/** Get tools for a connection, sorted by tool_order */
	getToolsForConnection(connectionId: string): ToolQueueItem[] {
		const connectionForms = this.forms.filter(f => f.connection_id === connectionId);
		const connectionEditTools = this.editTools.filter(e => e.connection_id === connectionId);
		const connectionProtocolTools = this.protocolTools.filter(p => p.connection_id === connectionId);

		const allTools: ToolQueueItem[] = [
			...connectionForms.map(f => ({ type: 'form' as const, tool: f })),
			...connectionEditTools.map(e => ({ type: 'edit' as const, tool: e })),
			...connectionProtocolTools.map(p => ({ type: 'protocol' as const, tool: p }))
		];

		return allTools.sort((a, b) => (a.tool.tool_order ?? 0) - (b.tool.tool_order ?? 0));
	}

	// ==========================================================================
	// Stage Helpers
	// ==========================================================================

	/** Check if a stage is completed (before current stage) */
	isStageCompleted(stageId: string): boolean {
		if (!this.instance) return false;
		const currentStageId = this.instance.current_stage_id as string;
		const currentIndex = this.stages.findIndex(s => s.id === currentStageId);
		const stageIndex = this.stages.findIndex(s => s.id === stageId);
		return stageIndex < currentIndex;
	}

	/** Check if a stage is the current stage */
	isCurrentStage(stageId: string): boolean {
		if (!this.instance) return false;
		return this.instance.current_stage_id === stageId;
	}

	// ==========================================================================
	// Actions
	// ==========================================================================

	/** Execute a stage transition (no tools) */
	async executeTransition(connection: WorkflowConnection): Promise<void> {
		await this.gateway.collection('workflow_instances').update(this.instanceId, {
			current_stage_id: connection.to_stage_id
		});
		await this.refresh();
	}

	// ==========================================================================
	// UI Actions
	// ==========================================================================

	setActiveStageTab(stageId: string): void {
		this.activeStageTab = stageId;
	}
}

// =============================================================================
// Factory Function
// =============================================================================

export function createWorkflowInstanceDetailState(
	instanceId: string,
	gateway: ParticipantGateway,
	fieldValueCache?: FieldValueCache
): WorkflowInstanceDetailState {
	return new WorkflowInstanceDetailState(instanceId, gateway, fieldValueCache);
}
