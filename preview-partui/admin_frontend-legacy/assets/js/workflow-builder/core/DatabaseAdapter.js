/**
 * DatabaseAdapter - Handles all database operations for workflow builder
 * Provides atomic save/load operations and abstracts database complexity
 */

import { supabaseClient } from '../../core/supabase.js';
import FormService from '../../services/FormService.js';
import DebugLogger from '../../core/debug-logger.js';

class DatabaseAdapter {
    constructor() {
        this.client = supabaseClient.client;
        this.saveInProgress = false; // Simple lock to prevent concurrent saves
        this.formService = null; // Will be initialized with project ID
        this.logger = new DebugLogger('DatabaseAdapter');
        this.logger.log('DatabaseAdapter initialized');
    }
    
    /**
     * Initialize with project context
     */
    setProjectId(projectId) {
        this.formService = new FormService(projectId);
    }
    
    /**
     * Load complete workflow data using proper form relationships
     */
    async loadCompleteWorkflow(workflowId) {
        this.logger.log('Loading complete workflow with proper forms:', workflowId);
        
        try {
            // Get project ID first
            const { data: workflow, error: workflowError } = await this.client
                .from('workflows')
                .select('*')
                .eq('id', workflowId)
                .single();
                
            if (workflowError) throw workflowError;
            
            // Initialize form service with project ID
            this.setProjectId(workflow.project_id);
            
            // Load stages with form references
            const { data: stages, error: stagesError } = await this.client
                .from('workflow_stages')
                .select('*, forms(*)')  // Join with forms table
                .eq('workflow_id', workflowId)
                .order('stage_order');
                
            if (stagesError) throw stagesError;
            
            // Load actions with form references
            const { data: actions, error: actionsError } = await this.client
                .from('workflow_actions')
                .select('*, forms(*)')  // Join with forms table
                .eq('workflow_id', workflowId);
                
            if (actionsError) throw actionsError;
            
            // Load form fields for all forms
            const formIds = [
                ...stages.filter(s => s.initial_form_id).map(s => s.initial_form_id),
                ...actions.filter(a => a.form_id).map(a => a.form_id)
            ];
            
            let allFormFields = [];
            if (formIds.length > 0) {
                const { data: formFields, error: fieldsError } = await this.client
                    .from('form_fields')
                    .select('*')
                    .in('form_id', formIds)
                    .order('field_order');
                    
                if (fieldsError) throw fieldsError;
                allFormFields = formFields || [];
            }
            
            // Load editable fields for each action
            const { data: editableFields, error: editableFieldsError } = await this.client
                .from('action_editable_fields')
                .select('*')
                .in('action_id', (actions || []).map(action => action.id));
            
            if (editableFieldsError) throw editableFieldsError;
            
            // Transform to local state format
            const transformedData = {
                workflow: {
                    id: workflow.id,
                    name: workflow.name,
                    description: workflow.description || '',
                    workflow_type: workflow.workflow_type || 'incident',
                    marker_color: workflow.marker_color || '#2563eb',
                    icon_config: workflow.icon_config || {},
                    is_active: workflow.is_active || true,
                    project_id: workflow.project_id,
                    locationUpdateRoles: workflow.location_update_roles || [],
                    assignmentRoles: workflow.assignment_roles || [],
                    selfAssignmentRoles: workflow.self_assignment_roles || []
                },
                stages: (stages || []).map(stage => ({
                    id: stage.id,
                    key: stage.stage_key,
                    name: stage.stage_name,
                    type: stage.stage_type,
                    order: stage.stage_order,
                    maxHours: stage.max_duration_hours || 24,
                    allowedRoles: stage.visible_to_roles || [],
                    x: stage.position_x || 100 + (stage.stage_order - 1) * 250,
                    y: stage.position_y || 200,
                    formId: stage.initial_form_id,  // ✅ PROPER FORM REFERENCE
                    formFields: this.getFormFields(stage.initial_form_id, allFormFields) // ✅ LOAD FROM PROPER TABLES
                })),
                actions: (actions || []).map(action => {
                    // Get editable fields for this action
                    const actionEditableFields = (editableFields || [])
                        .filter(field => field.action_id === action.id)
                        .map(field => field.field_id || field.field_key);
                    
                    this.logger.log(`Loading editable fields for action ${action.action_name}:`, actionEditableFields);
                    
                    return {
                        id: action.id,
                        fromStageId: action.from_stage_id,
                        toStageId: action.to_stage_id,
                        name: action.action_name,
                        type: action.action_type || 'forward',
                        buttonLabel: action.button_label,
                        buttonColor: action.button_color || '#007bff',
                        allowedRoles: action.allowed_roles || [],
                        conditions: action.conditions || {},
                        requiresConfirmation: action.requires_confirmation || false,
                        confirmationMessage: action.confirmation_message || '',
                        formId: action.form_id,  // ✅ PROPER FORM REFERENCE
                        formFields: this.getFormFields(action.form_id, allFormFields), // ✅ LOAD FROM PROPER TABLES
                        editableFields: actionEditableFields
                    };
                }),
                version: 1 // Start with version 1 for loaded workflows
            };
            
            this.logger.log('Workflow loaded with proper form structure:', {
                workflow: transformedData.workflow.name,
                stages: transformedData.stages.length,
                actions: transformedData.actions.length,
                formsLoaded: formIds.length
            });
            
            // Debug: Log actions with editable fields
            const editActions = transformedData.actions.filter(action => action.type === 'edit');
            if (editActions.length > 0) {
                this.logger.log('Edit actions with editable fields:', editActions.map(action => ({
                    id: action.id,
                    name: action.name,
                    editableFields: action.editableFields
                })));
            }
            
            return transformedData;
            
        } catch (error) {
            this.logger.error('Failed to load workflow:', error);
            throw new Error(`Failed to load workflow: ${error.message}`);
        }
    }
    
    /**
     * Helper: Get form fields for a specific form ID
     */
    getFormFields(formId, allFormFields) {
        if (!formId) return [];
        return allFormFields
            .filter(field => field.form_id === formId)
            .sort((a, b) => a.field_order - b.field_order);
    }
    
    /**
     * Check for active customer instances that would be lost
     */
    async checkActiveInstances(workflowId) {
        try {
            const { data: instances, error } = await this.client
                .from('workflow_instances')
                .select('id, title, status, created_at, created_by')
                .eq('workflow_id', workflowId)
                .neq('status', 'completed')
                .neq('status', 'cancelled');
            
            if (error) throw error;
            
            const hasActive = instances && instances.length > 0;
            
            this.logger.log(`Active instance check: ${instances?.length || 0} active instances found`);
            
            return {
                hasActive,
                count: instances?.length || 0,
                instances: instances || []
            };
            
        } catch (error) {
            this.logger.error('Failed to check active instances:', error);
            // Assume instances exist to be safe
            return { hasActive: true, count: 1, instances: [] };
        }
    }
    
    /**
     * Save complete workflow using proper form relationships with customer data preservation
     */
    async saveCompleteWorkflow(workflowData, isNewWorkflow = false) {
        // Prevent concurrent saves
        if (this.saveInProgress) {
            this.logger.log('Save already in progress, skipping concurrent save attempt');
            return { id: workflowData.workflow.id, success: true, message: 'Save skipped - already in progress' };
        }
        
        this.saveInProgress = true;
        this.logger.log('Saving workflow with customer data preservation...');
        
        try {
            let workflowId;
            
            // Ensure form service is initialized
            if (!this.formService) {
                this.setProjectId(workflowData.workflow.project_id);
            }
            
            if (isNewWorkflow) {
                // Create new workflow - safe to use current approach
                return await this.createNewWorkflow(workflowData);
            } else {
                workflowId = workflowData.workflow.id;
                
                // CRITICAL: Check for active customer instances
                const customerInstances = await this.checkActiveInstances(workflowId);
                
                if (customerInstances.hasActive) {
                    // Customer data exists - use UPDATE approach
                    this.logger.log(`${customerInstances.count} active instances found - preserving customer data`);
                    return await this.updateWorkflowPreservingCustomerData(workflowData);
                } else {
                    // No active instances - safe to use current delete/recreate
                    this.logger.log('No active instances - using delete/recreate approach');
                    return await this.recreateWorkflowSafely(workflowData);
                }
            }
            
            // Step 3: Save stages with proper form handling
            for (const stage of workflowData.stages) {
                await this.saveStageWithForm(workflowId, stage);
            }
            
            // Step 4: Save actions with proper form handling  
            for (const action of workflowData.actions) {
                await this.saveActionWithForm(workflowId, action);
            }
            
            // Save editable fields for edit actions
            await this.saveActionEditableFields(workflowId, workflowData.actions, workflowData.workflow.project_id);
            
            this.logger.log('Workflow saved with proper form structure');
            return { id: workflowId, success: true };
            
        } catch (error) {
            this.logger.error('Failed to save workflow:', error);
            throw error;
        } finally {
            // Always release the lock
            this.saveInProgress = false;
        }
    }
    
    /**
     * Create new workflow using current approach (safe - no customer data exists)
     */
    async createNewWorkflow(workflowData) {
        const workflowInsertData = {
            project_id: workflowData.workflow.project_id,
            name: workflowData.workflow.name || 'New Workflow',
            description: workflowData.workflow.description || '',
            workflow_type: workflowData.workflow.workflow_type || 'incident',
            marker_color: workflowData.workflow.marker_color || '#2563eb',
            icon_config: workflowData.workflow.icon_config || {},
            is_active: workflowData.workflow.is_active !== undefined ? workflowData.workflow.is_active : true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        this.logger.log('Creating workflow with data:', workflowInsertData);
        
        const { data: savedWorkflow, error: workflowError } = await this.client
            .from('workflows')
            .insert(workflowInsertData)
            .select()
            .single();
        
        if (workflowError) {
            this.logger.error('Workflow creation error:', workflowError);
            throw workflowError;
        }
        const workflowId = savedWorkflow.id;
        
        this.logger.log('New workflow created with ID:', workflowId);
        
        // Continue with stages and actions using current logic
        return await this.continueWorkflowSave(workflowId, workflowData);
    }
    
    /**
     * Update workflow while preserving all customer data
     */
    async updateWorkflowPreservingCustomerData(workflowData) {
        const workflowId = workflowData.workflow.id;
        
        try {
            // Step 1: Update workflow metadata safely
            const { error: workflowError } = await this.client
                .from('workflows')
                .update({
                    name: workflowData.workflow.name,
                    description: workflowData.workflow.description,
                    workflow_type: workflowData.workflow.workflow_type,
                    marker_color: workflowData.workflow.marker_color,
                    icon_config: workflowData.workflow.icon_config,
                    is_active: workflowData.workflow.is_active,
                    location_update_roles: workflowData.workflow.locationUpdateRoles || [],
                    assignment_roles: workflowData.workflow.assignmentRoles || [],
                    self_assignment_roles: workflowData.workflow.selfAssignmentRoles || [],
                    updated_at: new Date().toISOString()
                })
                .eq('id', workflowId);
            
            if (workflowError) throw workflowError;
            this.logger.log('Workflow metadata updated safely');
            
            // Step 2: Handle explicit deletions first (before updating remaining items)
            const deletionResults = await this.handleExplicitDeletions(workflowId, workflowData);
            
            // Step 3: Update stages incrementally (preserve existing where possible)
            await this.updateStagesPreservingReferences(workflowId, workflowData.stages);
            
            // Step 4: Update actions incrementally (preserve existing where possible)
            await this.updateActionsPreservingReferences(workflowId, workflowData.actions, workflowData.deletedActions);
            
            // Step 4: Update forms through FormService (handles data preservation)
            await this.updateFormsPreservingData(workflowData);
            
            // Step 5: Update editable fields
            await this.saveActionEditableFields(workflowId, workflowData.actions, workflowData.workflow.project_id);
            
            this.logger.log('Workflow updated with customer data preserved - Final deletion results:', deletionResults);
            return { id: workflowId, success: true, approach: 'UPDATE_PRESERVING_DATA', deletionResults };
            
        } catch (error) {
            this.logger.error('Failed to update workflow preserving data:', error);
            throw new Error(`Customer data preservation update failed: ${error.message}`);
        }
    }
    
    /**
     * Recreate workflow safely (no active instances exist)
     */
    async recreateWorkflowSafely(workflowData) {
        const workflowId = workflowData.workflow.id;
        
        // Update workflow metadata
        const { error: workflowError } = await this.client
            .from('workflows')
            .update({
                name: workflowData.workflow.name,
                description: workflowData.workflow.description,
                workflow_type: workflowData.workflow.workflow_type,
                marker_color: workflowData.workflow.marker_color,
                icon_config: workflowData.workflow.icon_config,
                is_active: workflowData.workflow.is_active,
                location_update_roles: workflowData.workflow.locationUpdateRoles || [],
                assignment_roles: workflowData.workflow.assignmentRoles || [],
                self_assignment_roles: workflowData.workflow.selfAssignmentRoles || [],
                updated_at: new Date().toISOString()
            })
            .eq('id', workflowId);
        
        if (workflowError) throw workflowError;
        this.logger.log('Workflow metadata updated');
        
        // Safe delete/recreate approach (no active instances exist)
        this.logger.log('No active instances - using safe delete/recreate');
        
        // Delete actions first (they reference stages)
        const { error: actionsDeleteError } = await this.client
            .from('workflow_actions')
            .delete()
            .eq('workflow_id', workflowId);
        
        if (actionsDeleteError) {
            this.logger.error('Error deleting actions:', actionsDeleteError);
            throw new Error(`Failed to delete existing actions: ${actionsDeleteError.message}`);
        }
        
        // Delete stages (safe since no instances reference them)
        const { error: stagesDeleteError } = await this.client
            .from('workflow_stages')
            .delete()
            .eq('workflow_id', workflowId);
        
        if (stagesDeleteError) {
            this.logger.error('Error deleting stages:', stagesDeleteError);
            throw new Error(`Failed to delete existing stages: ${stagesDeleteError.message}`);
        }
        
        this.logger.log('Safe deletion completed - no customer data lost');
        
        // Continue with stages and actions using current logic
        const result = await this.continueWorkflowSave(workflowId, workflowData);
        return { ...result, approach: 'SAFE_DELETE_RECREATE' };
    }
    
    /**
     * Continue workflow save with stages and actions (shared logic)
     */
    async continueWorkflowSave(workflowId, workflowData) {
        // Save stages with proper form handling
        for (const stage of workflowData.stages) {
            await this.saveStageWithForm(workflowId, stage);
        }
        
        // Save actions with proper form handling
        for (const action of workflowData.actions) {
            await this.saveActionWithForm(workflowId, action);
        }
        
        // Save editable fields configuration
        await this.saveActionEditableFields(workflowId, workflowData.actions, workflowData.workflow.project_id);
        
        return { id: workflowId, success: true };
    }
    
    /**
     * Update stages incrementally, preserving existing stage references
     */
    async updateStagesPreservingReferences(workflowId, newStages) {
        try {
            // Get existing stages
            const { data: existingStages, error: fetchError } = await this.client
                .from('workflow_stages')
                .select('*')
                .eq('workflow_id', workflowId);
            
            if (fetchError) throw fetchError;
            
            const existingStageMap = new Map(existingStages.map(s => [s.id, s]));
            const updatedStageIds = new Set();
            
            // Process each new stage
            for (const newStage of newStages) {
                if (existingStageMap.has(newStage.id)) {
                    // Update existing stage
                    const { error: updateError } = await this.client
                        .from('workflow_stages')
                        .update({
                            stage_key: newStage.key,
                            stage_name: newStage.name,
                            stage_type: newStage.type,
                            stage_order: newStage.order || 1,
                            max_duration_hours: newStage.maxHours || 24,
                            visible_to_roles: newStage.allowedRoles || [],
                            position_x: newStage.x || 0,
                            position_y: newStage.y || 0,
                            visual_config: newStage.visual_config || {},
                            initial_form_id: newStage.formId
                        })
                        .eq('id', newStage.id);
                    
                    if (updateError) throw updateError;
                    updatedStageIds.add(newStage.id);
                    
                } else {
                    // Create new stage
                    const stageData = {
                        id: newStage.id,
                        workflow_id: workflowId,
                        stage_key: newStage.key,
                        stage_name: newStage.name,
                        stage_type: newStage.type,
                        stage_order: newStage.order || 1,
                        max_duration_hours: newStage.maxHours || 24,
                        visible_to_roles: newStage.allowedRoles || [],
                        created_at: new Date().toISOString(),
                        position_x: newStage.x || 0,
                        position_y: newStage.y || 0,
                        visual_config: newStage.visual_config || {},
                        initial_form_id: newStage.formId
                    };
                    
                    const { error: createError } = await this.client
                        .from('workflow_stages')
                        .insert(stageData);
                    
                    if (createError) throw createError;
                    updatedStageIds.add(newStage.id);
                }
            }
            
            // Note: We do NOT delete stages that are no longer in the new set
            // This preserves references from workflow_instances.current_stage_id
            
            this.logger.log(`Updated ${updatedStageIds.size} stages, preserving customer references`);
            
        } catch (error) {
            this.logger.error('Failed to update stages preserving references:', error);
            throw error;
        }
    }
    
    /**
     * Update actions incrementally, preserving existing action references
     */
    async updateActionsPreservingReferences(workflowId, newActions, deletedActions = []) {
        try {
            // Get existing actions
            const { data: existingActions, error: fetchError } = await this.client
                .from('workflow_actions')
                .select('*')
                .eq('workflow_id', workflowId);
            
            if (fetchError) throw fetchError;
            
            const existingActionMap = new Map(existingActions.map(a => [a.id, a]));
            const updatedActionIds = new Set();
            
            // Process each new action
            for (const newAction of newActions) {
                // Handle form creation/update for actions with form fields using persistent IDs
                let formId = newAction.formId;
                if (newAction.formFields && newAction.formFields.length > 0) {
                    if (!formId) {
                        // Create new form
                        const form = await this.formService.createFormWithFields({
                            name: `${newAction.name} Form`,
                            description: `Form for action: ${newAction.name}`
                        }, []);
                        formId = form.id;
                        this.logger.log(`Created new form ${formId} for action ${newAction.name}`);
                    }

                    // Use persistent ID UPSERT approach for form fields
                    const fieldsWithFormId = newAction.formFields.map(field => ({
                        ...field,
                        form_id: formId
                    }));

                    await this.upsertFormFieldsWithPersistentIds(fieldsWithFormId);
                    this.logger.log(`UPSERTed form fields for action ${newAction.name} (form ${formId})`);
                }
                
                if (existingActionMap.has(newAction.id)) {
                    // Update existing action
                    const { error: updateError } = await this.client
                        .from('workflow_actions')
                        .update({
                            from_stage_id: newAction.fromStageId,
                            to_stage_id: newAction.toStageId,
                            action_name: newAction.name,
                            action_type: newAction.type,
                            button_label: newAction.buttonLabel,
                            button_color: newAction.buttonColor,
                            form_id: formId, // Use the created/updated form ID
                            allowed_roles: newAction.allowedRoles || [],
                            conditions: newAction.conditions || {},
                            requires_confirmation: newAction.requiresConfirmation || false,
                            confirmation_message: newAction.confirmationMessage,
                            visual_config: newAction.visual_config || {}
                        })
                        .eq('id', newAction.id);
                    
                    if (updateError) throw updateError;
                    updatedActionIds.add(newAction.id);
                    
                } else {
                    // Create new action
                    const actionData = {
                        id: newAction.id,
                        workflow_id: workflowId,
                        from_stage_id: newAction.fromStageId,
                        to_stage_id: newAction.toStageId,
                        action_name: newAction.name,
                        action_type: newAction.type,
                        button_label: newAction.buttonLabel,
                        button_color: newAction.buttonColor,
                        form_id: formId, // Use the created/updated form ID
                        allowed_roles: newAction.allowedRoles || [],
                        conditions: newAction.conditions || {},
                        requires_confirmation: newAction.requiresConfirmation || false,
                        confirmation_message: newAction.confirmationMessage,
                        created_at: new Date().toISOString(),
                        visual_config: newAction.visual_config || {}
                    };
                    
                    const { error: createError } = await this.client
                        .from('workflow_actions')
                        .insert(actionData);
                    
                    if (createError) throw createError;
                    updatedActionIds.add(newAction.id);
                }
            }
            
            // Handle explicitly deleted actions even in customer data preservation mode
            if (deletedActions && deletedActions.length > 0) {
                this.logger.log(`Deleting ${deletedActions.length} explicitly removed actions:`, deletedActions);
                
                const { error: deleteError } = await this.client
                    .from('workflow_actions')
                    .delete()
                    .in('id', deletedActions);
                
                if (deleteError) {
                    this.logger.error('Error deleting explicitly removed actions:', deleteError);
                    throw new Error(`Failed to delete actions: ${deleteError.message}`);
                }
                
                this.logger.log(`Successfully deleted ${deletedActions.length} explicitly removed actions`);
            }
            
            // Note: We preserve actions that are no longer in the new set (but not explicitly deleted)
            // This preserves references from action_executions.action_id
            
            this.logger.log(`Updated ${updatedActionIds.size} actions, deleted ${deletedActions?.length || 0} actions, preserving customer references`);
            
        } catch (error) {
            this.logger.error('Failed to update actions preserving references:', error);
            throw error;
        }
    }
    
    /**
     * Handle all explicit deletions (stages, questions, mappings, snapshots)
     */
    async handleExplicitDeletions(workflowId, workflowData) {
        const deletionResults = {
            deletedStages: [],
            protectedStages: [],
            deletedQuestions: [],
            deletedMappings: [],
            deletedSnapshots: []
        };
        
        // DEBUG: Log received deletion data
        this.logger.log('DELETION DEBUG - Received deletion data:', {
            workflowId,
            deletedStages: workflowData.deletedStages,
            deletedActions: workflowData.deletedActions,
            deletedStagesLength: workflowData.deletedStages?.length || 0,
            deletedActionsLength: workflowData.deletedActions?.length || 0
        });
        
        try {
            // Handle deleted stages
            if (workflowData.deletedStages && workflowData.deletedStages.length > 0) {
                this.logger.log(`Deleting ${workflowData.deletedStages.length} explicitly removed stages:`, workflowData.deletedStages);
                
                // Check if any stages are referenced by active instances
                const { data: referencedStages, error: checkError } = await this.client
                    .from('workflow_instances')
                    .select('current_stage_id')
                    .in('current_stage_id', workflowData.deletedStages)
                    .eq('status', 'active');
                
                if (checkError) {
                    this.logger.error('Error checking stage references:', checkError);
                    throw new Error(`Failed to check stage references: ${checkError.message}`);
                }
                
                if (referencedStages && referencedStages.length > 0) {
                    const referencedStageIds = referencedStages.map(inst => inst.current_stage_id);
                    this.logger.warn(`Cannot delete stages referenced by active instances:`, referencedStageIds);
                    
                    // Only delete stages that are not referenced
                    const deletableStageIds = workflowData.deletedStages.filter(id => !referencedStageIds.includes(id));
                    
                    if (deletableStageIds.length > 0) {
                        const { error: deleteStagesError } = await this.client
                            .from('workflow_stages')
                            .delete()
                            .in('id', deletableStageIds);
                        
                        if (deleteStagesError) {
                            this.logger.error('Error deleting unreferenced stages:', deleteStagesError);
                            throw new Error(`Failed to delete stages: ${deleteStagesError.message}`);
                        }
                        
                        this.logger.log(`Successfully deleted ${deletableStageIds.length} unreferenced stages`);
                        deletionResults.deletedStages = deletableStageIds;
                    }
                    
                    if (referencedStageIds.length > 0) {
                        this.logger.warn(`Skipped deletion of ${referencedStageIds.length} stages referenced by active instances`);
                        deletionResults.protectedStages = referencedStageIds;
                    }
                } else {
                    // No references, safe to delete all
                    const { error: deleteStagesError } = await this.client
                        .from('workflow_stages')
                        .delete()
                        .in('id', workflowData.deletedStages);
                    
                    if (deleteStagesError) {
                        this.logger.error('Error deleting explicitly removed stages:', deleteStagesError);
                        throw new Error(`Failed to delete stages: ${deleteStagesError.message}`);
                    }
                    
                    this.logger.log(`Successfully deleted ${workflowData.deletedStages.length} stages`);
                    deletionResults.deletedStages = workflowData.deletedStages;
                }
            }
            
            // Handle deleted form fields (persistent ID approach)
            if (workflowData.deletedQuestions && workflowData.deletedQuestions.length > 0) {
                this.logger.log(`Deleting ${workflowData.deletedQuestions.length} explicitly removed form fields:`, workflowData.deletedQuestions);

                // Delete form fields by their persistent IDs
                const { error: deleteFieldsError } = await this.client
                    .from('form_fields')
                    .delete()
                    .in('id', workflowData.deletedQuestions);

                if (deleteFieldsError) {
                    this.logger.error('Error deleting form fields:', deleteFieldsError);
                    throw new Error(`Failed to delete form fields: ${deleteFieldsError.message}`);
                } else {
                    this.logger.log(`Successfully deleted ${workflowData.deletedQuestions.length} form fields`);
                    deletionResults.deletedQuestions = workflowData.deletedQuestions;
                }
            }
            
            // Handle deleted mappings
            if (workflowData.deletedMappings && workflowData.deletedMappings.length > 0) {
                this.logger.log(`Deleting ${workflowData.deletedMappings.length} explicitly removed mappings:`, workflowData.deletedMappings);
                
                const { error: deleteMappingsError } = await this.client
                    .from('field_mappings')
                    .delete()
                    .in('id', workflowData.deletedMappings);
                
                if (deleteMappingsError) {
                    this.logger.error('Error deleting mappings (table might not exist):', deleteMappingsError);
                    // Don't throw error if mappings table doesn't exist
                } else {
                    deletionResults.deletedMappings = workflowData.deletedMappings;
                }
            }
            
            // Handle deleted snapshots
            if (workflowData.deletedSnapshots && workflowData.deletedSnapshots.length > 0) {
                this.logger.log(`Deleting ${workflowData.deletedSnapshots.length} explicitly removed snapshots:`, workflowData.deletedSnapshots);
                
                const { error: deleteSnapshotsError } = await this.client
                    .from('workflow_snapshots')
                    .delete()
                    .in('name', workflowData.deletedSnapshots)
                    .eq('workflow_id', workflowId);
                
                if (deleteSnapshotsError) {
                    this.logger.error('Error deleting snapshots (table might not exist):', deleteSnapshotsError);
                    // Don't throw error if snapshots table doesn't exist
                } else {
                    deletionResults.deletedSnapshots = workflowData.deletedSnapshots;
                }
            }
            
            this.logger.log('Completed handling explicit deletions - RESULTS:', {
                deletedStages: deletionResults.deletedStages,
                protectedStages: deletionResults.protectedStages,
                deletedActionsProcessed: workflowData.deletedActions?.length || 0
            });
            return deletionResults;
            
        } catch (error) {
            this.logger.error('Failed to handle explicit deletions:', error);
            throw error;
        }
    }
    
    /**
     * Update forms preserving data using UPSERT with persistent IDs
     */
    async updateFormsPreservingData(workflowData) {
        this.logger.log('Updating forms with data preservation using persistent IDs...');

        try {
            // Collect all form fields from all sources
            const allFormFields = [];

            // Process stages with forms
            for (const stage of workflowData.stages || []) {
                if (stage.formFields && stage.formFields.length > 0) {
                    // Ensure each field has a form_id
                    stage.formFields.forEach(field => {
                        if (stage.formId) {
                            field.form_id = stage.formId;
                        }
                        allFormFields.push(field);
                    });
                }
            }

            // Process actions with forms
            for (const action of workflowData.actions || []) {
                if (action.formFields && action.formFields.length > 0) {
                    // Ensure each field has a form_id
                    action.formFields.forEach(field => {
                        if (action.formId) {
                            field.form_id = action.formId;
                        }
                        allFormFields.push(field);
                    });
                }
            }

            // Use UPSERT to handle all form fields with persistent IDs
            if (allFormFields.length > 0) {
                await this.upsertFormFieldsWithPersistentIds(allFormFields);
                this.logger.log(`UPSERT completed for ${allFormFields.length} form fields with persistent IDs`);
            }

            this.logger.log('Forms updated with data preservation complete using persistent IDs');
            return true;

        } catch (error) {
            this.logger.error('Failed to update forms preserving data:', error);
            throw error;
        }
    }

    /**
     * UPSERT form fields using persistent IDs - prevents reference breaks
     */
    async upsertFormFieldsWithPersistentIds(formFields) {
        this.logger.log('UPSERTing form fields with persistent IDs:', formFields.length);

        // Debug: Check for null IDs
        const fieldsWithNullIds = formFields.filter(field => !field.id);
        if (fieldsWithNullIds.length > 0) {
            this.logger.log('Warning: Found form fields with null IDs:', fieldsWithNullIds.length);
        }

        try {
            // Prepare data for UPSERT with persistent IDs
            const upsertData = formFields.map(field => ({
                id: field.id || crypto.randomUUID(), // Generate UUID if null to avoid database constraint violation
                form_id: field.form_id,
                field_key: field.field_key,
                field_label: field.field_label,
                field_type: field.field_type,
                field_order: field.field_order || 1,
                is_required: field.is_required || false,
                placeholder: field.placeholder || '',
                help_text: field.help_text || '',
                validation_rules: field.validation_rules || {},
                field_options: field.field_options || {},
                conditional_logic: field.conditional_logic || {},
                page: field.page || 1,
                page_title: field.page_title || '',
                created_at: field.created_at || new Date().toISOString()
            }));

            // Use UPSERT with persistent ID as conflict resolution
            const { error: upsertError } = await this.client
                .from('form_fields')
                .upsert(upsertData, {
                    onConflict: 'id', // Use persistent ID for conflict resolution
                    ignoreDuplicates: false // Update existing records
                });

            if (upsertError) {
                this.logger.error('Error in UPSERT form fields:', upsertError);
                throw new Error(`UPSERT form fields failed: ${upsertError.message}`);
            }

            this.logger.log(`Successfully UPSERTed ${upsertData.length} form fields with persistent IDs`);

        } catch (error) {
            this.logger.error('Failed to UPSERT form fields:', error);
            throw error;
        }
    }
    
    /**
     * Save stage with persistent ID form handling
     */
    async saveStageWithForm(workflowId, stageData) {
        let formId = stageData.formId;

        // Create or update form if stage has form fields
        if (stageData.formFields && stageData.formFields.length > 0) {
            try {
                if (!formId) {
                    // Create new form
                    const form = await this.formService.createFormWithFields({
                        name: `${stageData.name} Form`,
                        description: `Form for stage: ${stageData.name}`
                    }, []);
                    formId = form.id;
                }

                // Use persistent ID UPSERT approach for form fields
                const fieldsWithFormId = stageData.formFields.map(field => ({
                    ...field,
                    form_id: formId
                }));

                await this.upsertFormFieldsWithPersistentIds(fieldsWithFormId);

            } catch (formError) {
                this.logger.error('Form service error for stage:', stageData.name, formError);
                // Continue without form if form creation fails
                formId = null;
            }
        }
        
        // Save/update stage with form reference
        const stageDbData = {
            id: stageData.id, // Include stage ID for upsert
            workflow_id: workflowId,
            stage_key: stageData.key,
            stage_name: stageData.name,
            stage_type: stageData.type,
            stage_order: stageData.order,
            max_duration_hours: stageData.maxHours,
            visible_to_roles: stageData.allowedRoles,
            position_x: Math.round(stageData.x),
            position_y: Math.round(stageData.y),
            initial_form_id: formId,  // ✅ PROPER FORM REFERENCE
            visual_config: {}
        };
        
        const { error: stageError } = await this.client
            .from('workflow_stages')
            .upsert(stageDbData, { onConflict: 'id' });
            
        if (stageError) {
            this.logger.error('Failed to save stage:', stageError);
            throw stageError;
        }
    }
    
    /**
     * Save action with persistent ID form handling
     */
    async saveActionWithForm(workflowId, actionData) {
        let formId = actionData.formId;

        // Create or update form if action has form fields
        if (actionData.formFields && actionData.formFields.length > 0) {
            try {
                if (!formId) {
                    // Create new form
                    const form = await this.formService.createFormWithFields({
                        name: `${actionData.name} Form`,
                        description: `Form for action: ${actionData.name}`
                    }, []);
                    formId = form.id;
                }

                // Use persistent ID UPSERT approach for form fields
                const fieldsWithFormId = actionData.formFields.map(field => ({
                    ...field,
                    form_id: formId
                }));

                await this.upsertFormFieldsWithPersistentIds(fieldsWithFormId);

            } catch (formError) {
                this.logger.error('Form service error for action:', actionData.name, formError);
                // Continue without form if form creation fails
                formId = null;
            }
        }
        
        // Save/update action with form reference
        const actionDbData = {
            id: actionData.id, // Include action ID for upsert
            workflow_id: workflowId,
            from_stage_id: actionData.fromStageId,
            to_stage_id: actionData.toStageId,
            action_name: actionData.name,
            action_type: actionData.type,
            button_label: actionData.buttonLabel,
            button_color: actionData.buttonColor,
            form_id: formId,  // ✅ PROPER FORM REFERENCE
            allowed_roles: actionData.allowedRoles,
            conditions: actionData.conditions,
            requires_confirmation: actionData.requiresConfirmation,
            confirmation_message: actionData.confirmationMessage
        };
        
        const { error: actionError } = await this.client
            .from('workflow_actions')
            .upsert(actionDbData, { onConflict: 'id' });
            
        if (actionError) {
            this.logger.error('Failed to save action:', actionError);
            throw actionError;
        }
    }

    /**
     * Save editable fields for edit actions
     */
    async saveActionEditableFields(workflowId, actions, projectId) {
        try {
            this.logger.log('Saving action editable fields...');
            
            // First, clear existing editable fields for this workflow's actions
            const actionIds = actions.map(action => action.id);
            
            if (actionIds.length > 0) {
                const { error: deleteError } = await this.client
                    .from('action_editable_fields')
                    .delete()
                    .in('action_id', actionIds);
                
                if (deleteError) {
                    this.logger.error('Error clearing existing editable fields:', deleteError);
                    throw deleteError;
                }
                
                this.logger.log('Cleared existing editable fields');
            }
            
            // Get all forms in the workflow for cross-form field lookup
            const { data: workflowForms, error: formsError } = await this.client
                .from('forms')
                .select('id')
                .eq('project_id', projectId);
            
            if (formsError) {
                this.logger.error('Error loading workflow forms:', formsError);
                throw formsError;
            }
            
            const workflowFormIds = workflowForms.map(form => form.id);
            
            // Convert editable fields from field keys to field IDs
            const editableFieldsData = [];
            
            for (const action of actions) {
                if (action.type === 'edit' && action.editableFields && action.editableFields.length > 0) {
                    const formId = action.formId || action.id;
                    
                    this.logger.log(`Processing editable fields for action ${action.name}:`, action.editableFields);
                    
                    for (const fieldValue of action.editableFields) {
                        // Validate fieldValue
                        if (!fieldValue || typeof fieldValue !== 'string' || fieldValue.trim() === '') {
                            this.logger.error(`Invalid field value found in action ${action.name}:`, fieldValue);
                            continue;
                        }
                        
                        // Check if fieldValue is a UUID (field ID) or a field key
                        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fieldValue);
                        
                        let formField = null;
                        
                        if (isUUID) {
                            // Try to find the field by ID first - search across all workflow forms
                            const { data: fieldById, error: fieldByIdError } = await this.client
                                .from('form_fields')
                                .select('id, field_key, form_id')
                                .in('form_id', workflowFormIds)
                                .eq('id', fieldValue)
                                .maybeSingle();
                            
                            if (fieldById && !fieldByIdError) {
                                formField = fieldById;
                                this.logger.log(`Found field by ID ${fieldValue}: ${formField.field_key} (form: ${formField.form_id})`);
                            } else {
                                // Try to find by field_key (legacy) - search across all workflow forms
                                const { data: fieldByKey, error: fieldByKeyError } = await this.client
                                    .from('form_fields')
                                    .select('id, field_key, form_id')
                                    .in('form_id', workflowFormIds)
                                    .eq('field_key', fieldValue)
                                    .maybeSingle();
                                
                                if (fieldByKey && !fieldByKeyError) {
                                    formField = fieldByKey;
                                    this.logger.log(`Found field by key ${fieldValue}: ${formField.id} (form: ${formField.form_id})`);
                                }
                            }
                        } else {
                            // Not a UUID, treat as field key - search across all workflow forms
                            const { data: fieldByKey, error: fieldByKeyError } = await this.client
                                .from('form_fields')
                                .select('id, field_key, form_id')
                                .in('form_id', workflowFormIds)
                                .eq('field_key', fieldValue)
                                .maybeSingle();
                            
                            if (fieldByKey && !fieldByKeyError) {
                                formField = fieldByKey;
                                this.logger.log(`Found field by key ${fieldValue}: ${formField.id} (form: ${formField.form_id})`);
                            }
                        }
                        
                        if (!formField) {
                            this.logger.error(`Field '${fieldValue}' not found in any workflow forms`);
                            continue;
                        }
                        
                        // Add to editable fields data
                        editableFieldsData.push({
                            action_id: action.id,
                            field_id: formField.id,
                            form_id: formField.form_id
                        });
                    }
                }
            }
            
            this.logger.log('Editable fields to save:', editableFieldsData);
            
            // Save new editable fields
            if (editableFieldsData.length > 0) {
                const { error: insertError } = await this.client
                    .from('action_editable_fields')
                    .insert(editableFieldsData);
                
                if (insertError) {
                    this.logger.error('Error saving editable fields:', insertError);
                    
                    // Handle duplicate key errors
                    if (insertError.code === '23505') {
                        this.logger.log('Duplicate key error - trying to insert fields one by one...');
                        
                        let successCount = 0;
                        for (const fieldData of editableFieldsData) {
                            const { error: singleInsertError } = await this.client
                                .from('action_editable_fields')
                                .insert(fieldData);
                            
                            if (singleInsertError) {
                                if (singleInsertError.code === '23505') {
                                    this.logger.log(`Skipping duplicate field: action_id=${fieldData.action_id}, field_id=${fieldData.field_id}`);
                                } else {
                                    this.logger.error('Error inserting individual field:', singleInsertError);
                                }
                            } else {
                                successCount++;
                            }
                        }
                        
                        this.logger.log(`Successfully saved ${successCount} editable fields (skipped duplicates)`);
                    } else {
                        throw insertError;
                    }
                } else {
                    this.logger.log(`${editableFieldsData.length} editable fields saved successfully`);
                }
            } else {
                this.logger.log('No editable fields to save');
            }
            
        } catch (error) {
            this.logger.error('Error in saveActionEditableFields:', error);
            throw error;
        }
    }
    
    /**
     * Create a workflow snapshot
     */
    async createWorkflowSnapshot(workflowId, snapshotData) {
        this.logger.log('Creating workflow snapshot:', snapshotData.name);
        
        try {
            const { data: snapshot, error } = await this.client
                .from('workflow_snapshots')
                .insert({
                    workflow_id: workflowId,
                    name: snapshotData.name,
                    description: snapshotData.description || '',
                    snapshot_data: snapshotData.state,
                    created_at: new Date().toISOString()
                })
                .select()
                .single();
            
            if (error) throw error;
            
            this.logger.log('Snapshot created:', snapshot.id);
            return snapshot;
            
        } catch (error) {
            this.logger.error('Failed to create snapshot:', error);
            throw new Error(`Failed to create snapshot: ${error.message}`);
        }
    }
    
    /**
     * Load workflow snapshots
     */
    async loadWorkflowSnapshots(workflowId) {
        this.logger.log('Loading workflow snapshots for:', workflowId);
        
        try {
            const { data: snapshots, error } = await this.client
                .from('workflow_snapshots')
                .select('*')
                .eq('workflow_id', workflowId)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            this.logger.log(`Loaded ${snapshots?.length || 0} snapshots`);
            return snapshots || [];
            
        } catch (error) {
            this.logger.error('Failed to load snapshots:', error);
            throw new Error(`Failed to load snapshots: ${error.message}`);
        }
    }
    
    /**
     * Load a specific snapshot
     */
    async loadWorkflowSnapshot(snapshotId) {
        this.logger.log('Loading snapshot:', snapshotId);
        
        try {
            const { data: snapshot, error } = await this.client
                .from('workflow_snapshots')
                .select('*')
                .eq('id', snapshotId)
                .single();
            
            if (error) throw error;
            
            this.logger.log('Snapshot loaded:', snapshot.name);
            return snapshot;
            
        } catch (error) {
            this.logger.error('Failed to load snapshot:', error);
            throw new Error(`Failed to load snapshot: ${error.message}`);
        }
    }
    
    /**
     * Delete a snapshot
     */
    async deleteWorkflowSnapshot(snapshotId) {
        this.logger.log('Deleting snapshot:', snapshotId);
        
        try {
            const { error } = await this.client
                .from('workflow_snapshots')
                .delete()
                .eq('id', snapshotId);
            
            if (error) throw error;
            
            this.logger.log('Snapshot deleted');
            return true;
            
        } catch (error) {
            this.logger.error('Failed to delete snapshot:', error);
            throw new Error(`Failed to delete snapshot: ${error.message}`);
        }
    }
    
    /**
     * Check if workflow exists
     */
    async workflowExists(workflowId) {
        try {
            const { data, error } = await this.client
                .from('workflows')
                .select('id')
                .eq('id', workflowId)
                .single();
            
            if (error && error.code !== 'PGRST116') { // PGRST116 = not found
                throw error;
            }
            
            return !!data;
            
        } catch (error) {
            this.logger.error('Failed to check workflow existence:', error);
            return false;
        }
    }
    
    /**
     * Validate workflow data before saving
     */
    validateWorkflowData(workflowData) {
        const errors = [];
        
        // Check workflow metadata
        if (!workflowData.workflow) {
            errors.push('Workflow metadata is required');
        } else {
            if (!workflowData.workflow.name?.trim()) {
                errors.push('Workflow name is required');
            }
            if (!workflowData.workflow.project_id) {
                errors.push('Project ID is required');
            }
        }
        
        // Check stages
        if (!workflowData.stages || workflowData.stages.length === 0) {
            errors.push('At least one stage is required');
        } else {
            // Check for unique stage keys
            const stageKeys = workflowData.stages.map(s => s.key);
            const duplicateKeys = stageKeys.filter((key, index) => stageKeys.indexOf(key) !== index);
            if (duplicateKeys.length > 0) {
                errors.push(`Duplicate stage keys: ${duplicateKeys.join(', ')}`);
            }
            
            // Check for exactly one start stage
            const startStages = workflowData.stages.filter(s => s.type === 'start');
            if (startStages.length === 0) {
                errors.push('Exactly one start stage is required');
            } else if (startStages.length > 1) {
                errors.push('Only one start stage is allowed');
            }
            
            // Check stage properties
            workflowData.stages.forEach((stage, index) => {
                if (!stage.name?.trim()) {
                    errors.push(`Stage ${index + 1}: Name is required`);
                }
                if (!stage.key?.trim()) {
                    errors.push(`Stage ${index + 1}: Key is required`);
                }
                if (!stage.id) {
                    errors.push(`Stage ${index + 1}: ID is required`);
                }
            });
        }
        
        // Check actions
        if (workflowData.actions) {
            const stageIds = new Set(workflowData.stages.map(s => s.id));
            
            workflowData.actions.forEach((action, index) => {
                if (!action.name?.trim()) {
                    errors.push(`Action ${index + 1}: Name is required`);
                }
                if (!action.buttonLabel?.trim()) {
                    errors.push(`Action ${index + 1}: Button label is required`);
                }
                if (!action.fromStageId || !stageIds.has(action.fromStageId)) {
                    errors.push(`Action ${index + 1}: Invalid source stage`);
                }
                if (!action.toStageId || !stageIds.has(action.toStageId)) {
                    errors.push(`Action ${index + 1}: Invalid target stage`);
                }
                if (!action.id) {
                    errors.push(`Action ${index + 1}: ID is required`);
                }
            });
        }
        
        return errors;
    }
}

export default DatabaseAdapter;