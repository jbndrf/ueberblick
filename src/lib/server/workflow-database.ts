/**
 * Workflow Database Adapter
 *
 * Handles all database operations for workflows with PocketBase.
 * Replaces the legacy Supabase DatabaseAdapter with customer data preservation.
 */

import type PocketBase from 'pocketbase';
import type {
  WorkflowExportData,
  DeletionResults,
  ActiveInstanceCheck,
  ValidationResult
} from '$lib/types/workflow';

export class WorkflowDatabaseAdapter {
  constructor(private pb: PocketBase) {}

  /**
   * Load complete workflow with all related data
   */
  async loadCompleteWorkflow(workflowId: string): Promise<WorkflowExportData> {
    try {
      // Load workflow
      const workflow = await this.pb.collection('workflows').getOne(workflowId, {
        expand: 'project_id'
      });

      // Parse JSON fields (handle both JSON strings and already-parsed objects)
      workflow.icon_config = this.parseJsonField(workflow.icon_config, {});

      // Load stages (may be empty for new workflows)
      let stages = [];
      try {
        stages = await this.pb.collection('workflow_stages').getFullList({
          filter: `workflow_id = "${workflowId}"`,
          sort: 'stage_order'
        });

        // Parse JSON for each stage
        stages.forEach(stage => {
          stage.visible_to_roles = this.parseJsonField(stage.visible_to_roles, []);
          stage.visual_config = this.parseJsonField(stage.visual_config, {});
        });
      } catch (err) {
        console.log('No stages found for workflow (this is normal for new workflows)');
      }

      // Load actions (may be empty for new workflows)
      let actions = [];
      try {
        actions = await this.pb.collection('workflow_actions').getFullList({
          filter: `workflow_id = "${workflowId}"`
        });

        // Parse JSON for each action
        actions.forEach(action => {
          action.allowed_roles = this.parseJsonField(action.allowed_roles, []);
          action.conditions = this.parseJsonField(action.conditions, {});
          action.visual_config = this.parseJsonField(action.visual_config, {});
        });
      } catch (err) {
        console.log('No actions found for workflow (this is normal for new workflows)');
      }

      // Load forms for each stage/action
      const formIds = new Set<string>();
      stages.forEach(s => s.form_id && formIds.add(s.form_id));
      actions.forEach(a => a.form_id && formIds.add(a.form_id));

      const formFields: any[] = [];
      for (const formId of formIds) {
        try {
          const fields = await this.pb.collection('form_fields').getFullList({
            filter: `form_id = "${formId}"`,
            sort: 'field_order'
          });

          // Parse JSON for each field
          fields.forEach(field => {
            field.validation_rules = this.parseJsonField(field.validation_rules, {});
            field.field_options = this.parseJsonField(field.field_options, {});
            field.conditional_logic = this.parseJsonField(field.conditional_logic, {});
          });

          formFields.push(...fields);
        } catch (err) {
          console.log(`No fields found for form ${formId}`);
        }
      }

      return {
        workflow,
        stages,
        actions,
        formFields,
        deletedStages: [],
        deletedActions: [],
        deletedQuestions: [],
        deletedMappings: []
      };
    } catch (err) {
      console.error('Error loading workflow:', err);
      throw err;
    }
  }

  /**
   * Helper to parse JSON field that might be a string or already parsed
   */
  private parseJsonField(field: any, defaultValue: any): any {
    if (!field) return defaultValue;
    if (typeof field === 'string') {
      try {
        return JSON.parse(field);
      } catch {
        return defaultValue;
      }
    }
    return field;
  }

  /**
   * Save complete workflow with smart mode selection
   */
  async saveCompleteWorkflow(data: WorkflowExportData): Promise<DeletionResults> {
    const workflowId = data.workflow.id;

    // Validate before saving
    const validation = await this.validateWorkflowData(data);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Check for active instances
    const activeInstances = await this.checkActiveInstances(workflowId);

    if (activeInstances.hasActive) {
      return await this.updateWorkflowPreservingCustomerData(data);
    } else {
      return await this.recreateWorkflowSafely(data);
    }
  }

  /**
   * Check for active workflow instances
   */
  async checkActiveInstances(workflowId: string): Promise<ActiveInstanceCheck> {
    const instances = await this.pb.collection('workflow_instances').getFullList({
      filter: `workflow_id = "${workflowId}" && status != "completed"`
    });

    return {
      hasActive: instances.length > 0,
      count: instances.length,
      stageIds: [...new Set(instances.map(i => i.current_stage_id))]
    };
  }

  /**
   * UPDATE mode - Preserves customer data
   */
  private async updateWorkflowPreservingCustomerData(data: WorkflowExportData): Promise<DeletionResults> {
    const workflowId = data.workflow.id;

    // Update workflow metadata
    await this.pb.collection('workflows').update(workflowId, {
      name: data.workflow.name,
      description: data.workflow.description,
      workflow_type: data.workflow.workflow_type,
      marker_color: data.workflow.marker_color,
      icon_config: JSON.stringify(data.workflow.icon_config),
      is_active: data.workflow.is_active
    });

    // Handle deletions with protection
    const deletionResults = await this.handleExplicitDeletions(data);

    // UPSERT stages
    for (const stage of data.stages) {
      const stageData = {
        ...stage,
        visible_to_roles: JSON.stringify(stage.visible_to_roles),
        visual_config: JSON.stringify(stage.visual_config)
      };

      try {
        await this.pb.collection('workflow_stages').update(stage.id, stageData);
      } catch {
        // Create if doesn't exist
        await this.pb.collection('workflow_stages').create(stageData);
      }
    }

    // UPSERT actions
    for (const action of data.actions) {
      const actionData = {
        ...action,
        allowed_roles: JSON.stringify(action.allowed_roles),
        conditions: JSON.stringify(action.conditions),
        visual_config: JSON.stringify(action.visual_config)
      };

      try {
        await this.pb.collection('workflow_actions').update(action.id, actionData);
      } catch {
        await this.pb.collection('workflow_actions').create(actionData);
      }
    }

    // UPSERT form fields with persistent IDs
    for (const field of data.formFields) {
      const fieldData = {
        ...field,
        validation_rules: JSON.stringify(field.validation_rules),
        field_options: JSON.stringify(field.field_options),
        conditional_logic: JSON.stringify(field.conditional_logic)
      };

      try {
        await this.pb.collection('form_fields').update(field.id, fieldData);
      } catch {
        await this.pb.collection('form_fields').create({ ...fieldData, id: field.id });
      }
    }

    return deletionResults;
  }

  /**
   * SAFE DELETE/RECREATE mode - Faster but resets IDs
   */
  private async recreateWorkflowSafely(data: WorkflowExportData): Promise<DeletionResults> {
    const workflowId = data.workflow.id;

    // Delete all related data
    // 1. Action editable fields
    const editableFields = await this.pb.collection('action_editable_fields').getFullList({
      filter: `action_id.workflow_id = "${workflowId}"`
    });
    for (const record of editableFields) {
      await this.pb.collection('action_editable_fields').delete(record.id);
    }

    // 2. Actions
    const existingActions = await this.pb.collection('workflow_actions').getFullList({
      filter: `workflow_id = "${workflowId}"`
    });
    for (const record of existingActions) {
      await this.pb.collection('workflow_actions').delete(record.id);
    }

    // 3. Stages
    const existingStages = await this.pb.collection('workflow_stages').getFullList({
      filter: `workflow_id = "${workflowId}"`
    });
    for (const record of existingStages) {
      await this.pb.collection('workflow_stages').delete(record.id);
    }

    // Update workflow metadata
    await this.pb.collection('workflows').update(workflowId, {
      name: data.workflow.name,
      description: data.workflow.description,
      workflow_type: data.workflow.workflow_type,
      marker_color: data.workflow.marker_color,
      icon_config: JSON.stringify(data.workflow.icon_config),
      is_active: data.workflow.is_active
    });

    // Recreate stages
    for (const stage of data.stages) {
      await this.pb.collection('workflow_stages').create({
        ...stage,
        visible_to_roles: JSON.stringify(stage.visible_to_roles),
        visual_config: JSON.stringify(stage.visual_config)
      });
    }

    // Recreate actions
    for (const action of data.actions) {
      await this.pb.collection('workflow_actions').create({
        ...action,
        allowed_roles: JSON.stringify(action.allowed_roles),
        conditions: JSON.stringify(action.conditions),
        visual_config: JSON.stringify(action.visual_config)
      });
    }

    // Recreate form fields
    for (const field of data.formFields) {
      await this.pb.collection('form_fields').create({
        ...field,
        id: field.id, // Preserve UUID
        validation_rules: JSON.stringify(field.validation_rules),
        field_options: JSON.stringify(field.field_options),
        conditional_logic: JSON.stringify(field.conditional_logic)
      });
    }

    return {
      deletedStages: data.deletedStages,
      deletedActions: data.deletedActions,
      deletedQuestions: data.deletedQuestions,
      deletedMappings: data.deletedMappings
    };
  }

  /**
   * Handle explicit deletions with protection
   */
  private async handleExplicitDeletions(data: WorkflowExportData): Promise<DeletionResults> {
    const results: DeletionResults = {
      deletedStages: [],
      deletedActions: [],
      deletedQuestions: [],
      deletedMappings: [],
      protectedStages: []
    };

    // Check which stages are referenced by active instances
    const activeInstances = await this.checkActiveInstances(data.workflow.id);
    const protectedStageIds = new Set(activeInstances.stageIds);

    // Delete stages (except protected ones)
    for (const stageId of data.deletedStages) {
      if (protectedStageIds.has(stageId)) {
        results.protectedStages!.push(stageId);
      } else {
        try {
          await this.pb.collection('workflow_stages').delete(stageId);
          results.deletedStages.push(stageId);
        } catch (err) {
          console.error(`Failed to delete stage ${stageId}:`, err);
        }
      }
    }

    // Delete actions
    for (const actionId of data.deletedActions) {
      try {
        await this.pb.collection('workflow_actions').delete(actionId);
        results.deletedActions.push(actionId);
      } catch (err) {
        console.error(`Failed to delete action ${actionId}:`, err);
      }
    }

    // Delete form fields
    for (const fieldId of data.deletedQuestions) {
      try {
        await this.pb.collection('form_fields').delete(fieldId);
        results.deletedQuestions.push(fieldId);
      } catch (err) {
        console.error(`Failed to delete field ${fieldId}:`, err);
      }
    }

    // Delete field mappings
    for (const mappingId of data.deletedMappings) {
      try {
        await this.pb.collection('field_mappings').delete(mappingId);
        results.deletedMappings.push(mappingId);
      } catch (err) {
        console.error(`Failed to delete mapping ${mappingId}:`, err);
      }
    }

    return results;
  }

  /**
   * Create a workflow snapshot
   */
  async createWorkflowSnapshot(
    workflowId: string,
    name: string,
    description: string,
    snapshotData: any
  ) {
    return await this.pb.collection('workflow_snapshots').create({
      workflow_id: workflowId,
      name,
      description,
      snapshot_data: JSON.stringify(snapshotData)
    });
  }

  /**
   * Validate workflow data before saving
   */
  async validateWorkflowData(data: WorkflowExportData): Promise<ValidationResult> {
    const errors: string[] = [];

    // Unique stage keys
    const stageKeys = new Set<string>();
    for (const stage of data.stages) {
      if (stageKeys.has(stage.stage_key)) {
        errors.push(`Duplicate stage key: ${stage.stage_key}`);
      }
      stageKeys.add(stage.stage_key);
    }

    // Exactly one start stage
    const startStages = data.stages.filter(s => s.stage_type === 'start');
    if (startStages.length !== 1) {
      errors.push(`Workflow must have exactly one start stage (found ${startStages.length})`);
    }

    // Valid stage references in actions
    const stageIds = new Set(data.stages.map(s => s.id));
    for (const action of data.actions) {
      if (!stageIds.has(action.from_stage_id)) {
        errors.push(`Action ${action.id} references invalid from_stage_id: ${action.from_stage_id}`);
      }
      if (!stageIds.has(action.to_stage_id)) {
        errors.push(`Action ${action.id} references invalid to_stage_id: ${action.to_stage_id}`);
      }
    }

    // Unique field keys per form
    const fieldKeysByForm = new Map<string, Set<string>>();
    for (const field of data.formFields) {
      if (!fieldKeysByForm.has(field.form_id)) {
        fieldKeysByForm.set(field.form_id, new Set());
      }
      const formKeys = fieldKeysByForm.get(field.form_id)!;
      if (formKeys.has(field.field_key)) {
        errors.push(`Duplicate field key in form ${field.form_id}: ${field.field_key}`);
      }
      formKeys.add(field.field_key);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
