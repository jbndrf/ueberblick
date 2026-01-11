/**
 * Workflow Storage Module
 * Handles all database CRUD operations for workflows, stages, actions, forms, and fields
 */

import { supabaseClient } from '../core/supabase.js';

class WorkflowStorage {
    constructor(projectId) {
        this.projectId = projectId;
    }

    // =====================================================
    // WORKFLOW OPERATIONS
    // =====================================================

    /**
     * Create a new workflow
     */
    async createWorkflow(workflowData) {
        const workflow = {
            project_id: this.projectId,
            name: workflowData.name,
            description: workflowData.description || null,
            workflow_type: workflowData.workflow_type,
            marker_color: workflowData.marker_color || '#2563eb',
            icon_config: workflowData.icon_config || {},
            is_active: workflowData.is_active !== undefined ? workflowData.is_active : true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        return await supabaseClient.create('workflows', workflow);
    }

    /**
     * Update existing workflow
     */
    async updateWorkflow(workflowId, workflowData) {
        const updateData = {
            name: workflowData.name,
            description: workflowData.description,
            workflow_type: workflowData.workflow_type,
            marker_color: workflowData.marker_color,
            icon_config: workflowData.icon_config,
            is_active: workflowData.is_active,
            updated_at: new Date().toISOString()
        };

        return await supabaseClient.update('workflows', workflowId, updateData);
    }

    /**
     * Load workflow with all related data
     */
    async loadWorkflow(workflowId) {
        // Get main workflow
        const workflow = await supabaseClient.getById('workflows', workflowId);
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }

        // Get stages
        const { data: stages, error: stagesError } = await supabaseClient.client
            .from('workflow_stages')
            .select('*')
            .eq('workflow_id', workflowId)
            .order('stage_order');

        if (stagesError) throw stagesError;

        // Get actions
        const { data: actions, error: actionsError } = await supabaseClient.client
            .from('workflow_actions')
            .select('*')
            .eq('workflow_id', workflowId);

        if (actionsError) throw actionsError;

        // Get forms for actions (including start stage forms)
        const formIds = [...new Set([
            ...actions.filter(a => a.form_id).map(a => a.form_id),
            ...stages.filter(s => s.stage_type === 'start').map(s => s.initial_form_id).filter(Boolean)
        ])];

        let forms = [];
        let formFields = [];

        if (formIds.length > 0) {
            const { data: formsData, error: formsError } = await supabaseClient.client
                .from('forms')
                .select('*')
                .in('id', formIds);

            if (formsError) throw formsError;
            forms = formsData || [];

            // Get all form fields for these forms
            const { data: fieldsData, error: fieldsError } = await supabaseClient.client
                .from('form_fields')
                .select('*')
                .in('form_id', formIds)
                .order('field_order');

            if (fieldsError) throw fieldsError;
            formFields = fieldsData || [];
        }

        // Get editable fields for edit actions
        const editActionIds = actions.filter(a => a.action_type === 'edit').map(a => a.id);
        let editableFields = [];

        if (editActionIds.length > 0) {
            const { data: editableData, error: editableError } = await supabaseClient.client
                .from('action_editable_fields')
                .select('*')
                .in('action_id', editActionIds);

            if (editableError) throw editableError;
            editableFields = editableData || [];
        }

        return {
            workflow,
            stages,
            actions,
            forms,
            formFields,
            editableFields
        };
    }

    /**
     * Delete workflow and all related data
     */
    async deleteWorkflow(workflowId) {
        // Delete in reverse dependency order
        await this.deleteWorkflowForms(workflowId);
        await this.deleteWorkflowActions(workflowId);
        await this.deleteWorkflowStages(workflowId);
        return await supabaseClient.delete('workflows', workflowId);
    }

    // =====================================================
    // WORKFLOW STAGES OPERATIONS
    // =====================================================

    /**
     * Save workflow stages
     */
    async saveWorkflowStages(workflowId, stages) {
        // Delete existing actions first to avoid foreign key constraint violations
        await this.deleteWorkflowActions(workflowId);
        
        // Delete existing stages
        await this.deleteWorkflowStages(workflowId);

        // Create new stages
        const stagesData = stages.map((stage, index) => ({
            workflow_id: workflowId,
            stage_key: stage.stage_key,
            stage_name: stage.stage_name,
            stage_type: stage.stage_type,
            stage_order: stage.stage_order || index + 1,
            max_duration_hours: stage.max_duration_hours || null,
            visible_to_roles: stage.visible_to_roles || [],
            created_at: new Date().toISOString()
        }));

        if (stagesData.length === 0) return [];

        const { data: savedStages, error } = await supabaseClient.client
            .from('workflow_stages')
            .insert(stagesData)
            .select();

        if (error) throw error;
        return savedStages;
    }

    /**
     * Delete workflow stages
     */
    async deleteWorkflowStages(workflowId) {
        const { error } = await supabaseClient.client
            .from('workflow_stages')
            .delete()
            .eq('workflow_id', workflowId);

        if (error) throw error;
    }

    // =====================================================
    // WORKFLOW ACTIONS OPERATIONS
    // =====================================================

    /**
     * Save workflow actions
     */
    async saveWorkflowActions(workflowId, actions, stageIdMap) {
        // Note: Actions are already deleted in saveWorkflowStages to avoid foreign key issues
        
        if (actions.length === 0) return [];

        // Create new actions
        const actionsData = actions.map(action => ({
            workflow_id: workflowId,
            from_stage_id: stageIdMap[action.from_stage_key],
            to_stage_id: stageIdMap[action.to_stage_key],
            action_name: action.action_name,
            action_type: action.action_type || 'forward',
            button_label: action.button_label,
            button_color: action.button_color || '#007bff',
            form_id: action.form_id || null,
            allowed_roles: action.allowed_roles || [],
            conditions: action.conditions || {},
            requires_confirmation: action.requires_confirmation || false,
            confirmation_message: action.confirmation_message || null,
            created_at: new Date().toISOString()
        }));

        const { data: savedActions, error } = await supabaseClient.client
            .from('workflow_actions')
            .insert(actionsData)
            .select();

        if (error) throw error;

        // Save editable fields for edit actions
        await this.saveActionEditableFields(savedActions, actions);

        return savedActions;
    }

    /**
     * Delete workflow actions
     */
    async deleteWorkflowActions(workflowId) {
        // Get action IDs to delete editable fields
        const { data: actions } = await supabaseClient.client
            .from('workflow_actions')
            .select('id')
            .eq('workflow_id', workflowId);

        if (actions && actions.length > 0) {
            const actionIds = actions.map(a => a.id);
            
            // Delete editable fields first
            await supabaseClient.client
                .from('action_editable_fields')
                .delete()
                .in('action_id', actionIds);
        }

        // Delete actions
        const { error } = await supabaseClient.client
            .from('workflow_actions')
            .delete()
            .eq('workflow_id', workflowId);

        if (error) throw error;
    }

    /**
     * Save editable fields for edit actions
     */
    async saveActionEditableFields(savedActions, originalActions) {
        const editableFieldsData = [];

        savedActions.forEach((savedAction, index) => {
            const originalAction = originalActions[index];
            if (originalAction.action_type === 'edit' && originalAction.editable_fields) {
                originalAction.editable_fields.forEach(field => {
                    editableFieldsData.push({
                        action_id: savedAction.id,
                        field_key: field.field_key,
                        form_id: field.form_id,
                        created_at: new Date().toISOString()
                    });
                });
            }
        });

        if (editableFieldsData.length > 0) {
            const { error } = await supabaseClient.client
                .from('action_editable_fields')
                .insert(editableFieldsData);

            if (error) throw error;
        }
    }

    // =====================================================
    // FORMS OPERATIONS
    // =====================================================

    /**
     * Create form with fields
     */
    async createFormWithFields(formData, fields) {
        // Create form
        const form = await supabaseClient.create('forms', {
            project_id: this.projectId,
            name: formData.name,
            description: formData.description || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });

        // Create form fields
        if (fields && fields.length > 0) {
            await this.saveFormFields(form.id, fields);
        }

        return form;
    }

    /**
     * Save form fields
     */
    async saveFormFields(formId, fields) {
        // Delete existing fields
        await supabaseClient.client
            .from('form_fields')
            .delete()
            .eq('form_id', formId);

        if (fields.length === 0) return [];

        // Create new fields
        const fieldsData = fields.map((field, index) => ({
            form_id: formId,
            field_key: field.field_key,
            field_label: field.field_label,
            field_type: field.field_type,
            field_order: field.field_order || index + 1,
            is_required: field.is_required || false,
            placeholder: field.placeholder || null,
            help_text: field.help_text || null,
            validation_rules: field.validation_rules || {},
            field_options: field.field_options || {},
            conditional_logic: field.conditional_logic || {},
            created_at: new Date().toISOString()
        }));

        const { data: savedFields, error } = await supabaseClient.client
            .from('form_fields')
            .insert(fieldsData)
            .select();

        if (error) throw error;
        return savedFields;
    }

    /**
     * Delete workflow forms
     */
    async deleteWorkflowForms(workflowId) {
        // Get forms associated with this workflow's actions
        const { data: actions } = await supabaseClient.client
            .from('workflow_actions')
            .select('form_id')
            .eq('workflow_id', workflowId)
            .not('form_id', 'is', null);

        if (actions && actions.length > 0) {
            const formIds = actions.map(a => a.form_id);
            
            // Delete form fields first
            await supabaseClient.client
                .from('form_fields')
                .delete()
                .in('form_id', formIds);

            // Delete forms
            await supabaseClient.client
                .from('forms')
                .delete()
                .in('id', formIds);
        }
    }

    // =====================================================
    // PROJECT WORKFLOWS OPERATIONS
    // =====================================================

    /**
     * Get all workflows for project
     */
    async getProjectWorkflows() {
        const { data, error } = await supabaseClient.client
            .from('workflows')
            .select('*')
            .eq('project_id', this.projectId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    }

    /**
     * Get workflow summary (stages and actions count)
     */
    async getWorkflowSummary(workflowId) {
        const [stagesResult, actionsResult] = await Promise.all([
            supabaseClient.client
                .from('workflow_stages')
                .select('id', { count: 'exact' })
                .eq('workflow_id', workflowId),
            supabaseClient.client
                .from('workflow_actions')
                .select('id', { count: 'exact' })
                .eq('workflow_id', workflowId)
        ]);

        return {
            stagesCount: stagesResult.count || 0,
            actionsCount: actionsResult.count || 0
        };
    }

    // =====================================================
    // VALIDATION METHODS
    // =====================================================

    /**
     * Validate workflow data before saving
     */
    validateWorkflowData(workflowData, stages, actions) {
        const errors = [];

        // Validate workflow
        if (!workflowData.name?.trim()) {
            errors.push('Workflow name is required');
        }

        if (!['incident', 'survey'].includes(workflowData.workflow_type)) {
            errors.push('Invalid workflow type');
        }

        // Validate stages
        if (!stages || stages.length === 0) {
            errors.push('At least one stage is required');
        } else {
            const startStages = stages.filter(s => s.stage_type === 'start');
            if (startStages.length !== 1) {
                errors.push('Exactly one start stage is required');
            }

            const stageKeys = stages.map(s => s.stage_key);
            const duplicateKeys = stageKeys.filter((key, index) => stageKeys.indexOf(key) !== index);
            if (duplicateKeys.length > 0) {
                errors.push(`Duplicate stage keys: ${duplicateKeys.join(', ')}`);
            }
        }

        // Validate actions
        if (actions && actions.length > 0) {
            actions.forEach((action, index) => {
                if (!action.action_name?.trim()) {
                    errors.push(`Action ${index + 1}: Name is required`);
                }
                if (!action.button_label?.trim()) {
                    errors.push(`Action ${index + 1}: Button label is required`);
                }
                if (!stages.some(s => s.stage_key === action.from_stage_key)) {
                    errors.push(`Action ${index + 1}: Invalid from_stage_key`);
                }
                if (!stages.some(s => s.stage_key === action.to_stage_key)) {
                    errors.push(`Action ${index + 1}: Invalid to_stage_key`);
                }
            });
        }

        return errors;
    }
}

export default WorkflowStorage;