/**
 * WorkflowInstanceDetailState
 *
 * Reactive state management for the WorkflowInstanceDetailModule.
 * Loads workflow instance data, stages, connections, field values, and tools via gateway.
 */

import type { ParticipantGateway } from '$lib/participant-state/gateway.svelte';
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
	created: string;
}

export interface ToolForm {
	id: string;
	workflow_id: string;
	connection_id: string;
	stage_id: string;
	name: string;
	description: string;
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
	field_options?: Record<string, unknown>;
}

export interface ToolEdit {
	id: string;
	connection_id: string;
	stage_id: string;
	name: string;
	editable_fields: string[];
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
	type: 'form' | 'edit';
	tool: ToolForm | ToolEdit;
}

export interface ActionButton {
	id: string;
	label: string;
	icon: Snippet;
	color?: string;
	disabled?: boolean;
	onClick: () => void;
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
		return this.editTools.filter(e => e.stage_id === currentStageId && !e.connection_id);
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

	constructor(instanceId: string, gateway: ParticipantGateway) {
		this.instanceId = instanceId;
		this.gateway = gateway;
	}

	// ==========================================================================
	// Data Loading
	// ==========================================================================

	async load(): Promise<void> {
		this.isLoading = true;
		this.loadError = null;

		try {
			// First load the instance to get workflow_id
			const instanceResult = await this.gateway.collection('workflow_instances').getOne(this.instanceId, {
				expand: 'workflow_id'
			});

			this.instance = instanceResult;
			const expanded = instanceResult.expand as Record<string, unknown> | undefined;
			this.workflow = (expanded?.workflow_id as Record<string, unknown>) || null;

			const workflowId = instanceResult.workflow_id as string;

			// Now load all related data in parallel
			const [stagesResult, connectionsResult, fieldValuesResult, formsResult, formFieldsResult, editToolsResult] = await Promise.all([
				this.gateway.collection('workflow_stages').getFullList({
					filter: `workflow_id = "${workflowId}"`,
					sort: 'stage_order'
				}),
				this.gateway.collection('workflow_connections').getFullList({
					filter: `workflow_id = "${workflowId}"`
				}),
				this.gateway.collection('workflow_instance_field_values').getFullList({
					filter: `instance_id = "${this.instanceId}"`
				}),
				this.gateway.collection('tools_forms').getFullList({
					filter: `workflow_id = "${workflowId}"`
				}),
				this.gateway.collection('tools_form_fields').getFullList(),
				this.gateway.collection('tools_edit').getFullList()
			]);

			this.stages = stagesResult as unknown as WorkflowStage[];
			this.connections = connectionsResult as unknown as WorkflowConnection[];
			this.fieldValues = fieldValuesResult as unknown as FieldValue[];
			this.forms = formsResult as unknown as ToolForm[];

			// Filter form fields to only those belonging to this workflow's forms
			const formIds = this.forms.map(f => f.id);
			this.formFields = (formFieldsResult as unknown as FormField[]).filter(f => formIds.includes(f.form_id));

			// Filter edit tools to those for this workflow's connections/stages
			const connectionIds = this.connections.map(c => c.id);
			const stageIds = this.stages.map(s => s.id);
			this.editTools = (editToolsResult as unknown as ToolEdit[]).filter(
				e => connectionIds.includes(e.connection_id) || stageIds.includes(e.stage_id)
			);

			// Set initial active stage tab to first visible stage with data
			if (this.stages.length > 0 && !this.activeStageTab) {
				this.activeStageTab = this.stages[0].id;
			}

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

	/** Check if a stage has any data */
	stageHasData(stageId: string): boolean {
		return this.fieldValues.some(fv => fv.stage_id === stageId);
	}

	// ==========================================================================
	// Tool Helpers
	// ==========================================================================

	/** Get tools for a connection */
	getToolsForConnection(connectionId: string): ToolQueueItem[] {
		const connectionForms = this.forms.filter(f => f.connection_id === connectionId);
		const connectionEditTools = this.editTools.filter(e => e.connection_id === connectionId);

		return [
			...connectionForms.map(f => ({ type: 'form' as const, tool: f })),
			...connectionEditTools.map(e => ({ type: 'edit' as const, tool: e }))
		];
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
	gateway: ParticipantGateway
): WorkflowInstanceDetailState {
	return new WorkflowInstanceDetailState(instanceId, gateway);
}
