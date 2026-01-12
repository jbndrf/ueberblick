/**
 * Dynamic Workflow Engine
 * 
 * Core workflow management system that handles:
 * - Loading workflows from database with role-based filtering
 * - Stage progression logic for workflow instances
 * - Incident vs survey workflow type handling
 * - Action execution and instance management
 * 
 * Integrates with:
 * - @core/supabase.js for database operations
 * - @core/event-manager.js for component lifecycle
 * - @auth/participant-auth.js for role context
 * - @map/map-core.js for incident location handling
 */

import { supabaseClient } from '../core/supabase.js';
import eventManager from '../core/event-manager.js';
import DebugLogger from '../core/debug-logger.js';

export class WorkflowEngine {
    constructor() {
        this.supabase = supabaseClient;
        this.eventManager = eventManager;
        this.currentParticipant = null;
        this.currentProject = null;
        this.availableWorkflows = new Map();
        this.activeInstances = new Map();
        this.logger = new DebugLogger('WorkflowEngine');
        
        // Register for cleanup
        this.eventManager.registerComponent('workflow-engine', { 
            destroy: () => this.destroy() 
        });
        
        this.logger.log('Initialized');
    }

    /**
     * Initialize the workflow engine with participant and project context
     */
    async initialize(participant, project) {
        try {
            this.currentParticipant = participant;
            this.currentProject = project;
            
            this.logger.log('Initializing with participant:', participant.id, 'project:', project.id);
            
            // Load available workflows for this participant's role
            await this.loadAvailableWorkflows();
            
            // Emit custom event using browser's native event system
            window.dispatchEvent(new CustomEvent('workflow-engine:initialized', {
                detail: {
                    participantId: participant.id,
                    projectId: project.id,
                    workflowCount: this.availableWorkflows.size
                }
            }));
            
            return true;
        } catch (error) {
            this.logger.error('Failed to initialize:', error);
            throw new Error(`Workflow engine initialization failed: ${error.message}`);
        }
    }

    /**
     * Load workflows visible to the current participant's role
     */
    async loadAvailableWorkflows() {
        try {
            const { data: workflows, error } = await this.supabase
                .from('workflows')
                .select(`
                    *,
                    workflow_stages (
                        id,
                        stage_key,
                        stage_name,
                        stage_type,
                        stage_order,
                        max_duration_hours,
                        visible_to_roles
                    )
                `)
                .eq('project_id', this.currentProject.id)
                .eq('is_active', true)
                .order('name');

            if (error) {
                throw error;
            }

            // Clear existing workflows
            this.availableWorkflows.clear();

            // Filter workflows by RLS policies (handled by Supabase)
            // and store them in our local map
            for (const workflow of workflows) {
                // Skip workflows without stages or with null stages
                if (!workflow.workflow_stages || 
                    workflow.workflow_stages.length === 0 || 
                    (workflow.workflow_stages.length === 1 && workflow.workflow_stages[0] === null)) {
                    this.logger.warn('Skipping workflow without stages:', workflow.name);
                    continue;
                }
                
                // Sort stages by order
                workflow.workflow_stages.sort((a, b) => a.stage_order - b.stage_order);
                
                // Check if workflow has a start stage
                const hasStartStage = workflow.workflow_stages.some(stage => stage.stage_type === 'start');
                if (!hasStartStage) {
                    this.logger.warn('Skipping workflow without start stage:', workflow.name);
                    continue;
                }
                
                this.availableWorkflows.set(workflow.id, workflow);
                
                this.logger.log('Loaded workflow:', workflow.name, 
                           'type:', workflow.workflow_type, 
                           'stages:', workflow.workflow_stages.length);
            }

            this.logger.log('Loaded', this.availableWorkflows.size, 'available workflows');
            
            // Emit custom event using browser's native event system
            window.dispatchEvent(new CustomEvent('workflow-engine:workflows-loaded', {
                detail: {
                    count: this.availableWorkflows.size,
                    workflows: Array.from(this.availableWorkflows.values())
                }
            }));

            return Array.from(this.availableWorkflows.values());
        } catch (error) {
            this.logger.error('Failed to load workflows:', error);
            throw new Error(`Failed to load workflows: ${error.message}`);
        }
    }

    /**
     * Get all available workflows for display in UI
     */
    getAvailableWorkflows() {
        return Array.from(this.availableWorkflows.values());
    }

    /**
     * Get a specific workflow definition by ID
     */
    async getWorkflowDefinition(workflowId) {
        try {
            // Check if we have it cached
            if (this.availableWorkflows.has(workflowId)) {
                return this.availableWorkflows.get(workflowId);
            }

            // Load from database if not cached
            const { data: workflow, error } = await this.supabase
                .from('workflows')
                .select(`
                    *,
                    workflow_stages (
                        id,
                        stage_key,
                        stage_name,
                        stage_type,
                        stage_order,
                        max_duration_hours,
                        visible_to_roles
                    )
                `)
                .eq('id', workflowId)
                .single();

            if (error) {
                throw error;
            }

            if (!workflow) {
                throw new Error(`Workflow ${workflowId} not found or not accessible`);
            }

            // Sort stages by order
            workflow.workflow_stages.sort((a, b) => a.stage_order - b.stage_order);

            return workflow;
        } catch (error) {
            this.logger.error('Failed to get workflow definition:', error);
            throw new Error(`Failed to get workflow definition: ${error.message}`);
        }
    }

    /**
     * Create a new workflow instance
     * Handles both incident (map-based) and survey (non-map) workflows
     */
    async createWorkflowInstance(workflowId, options = {}) {
        try {
            const workflow = await this.getWorkflowDefinition(workflowId);
            
            if (!workflow) {
                throw new Error(`Workflow ${workflowId} not found`);
            }

            // TEMPORARY: Treat "incident" named workflow as incident type for testing
            const isIncidentWorkflow = workflow.workflow_type === 'incident' || workflow.name === 'incident';
            
            // Validate location requirement for incident workflows
            if (isIncidentWorkflow && !options.location) {
                throw new Error('Map location is required for incident workflows');
            }

            // Find the start stage
            const startStage = workflow.workflow_stages.find(stage => stage.stage_type === 'start');
            if (!startStage) {
                throw new Error(`No start stage found for workflow ${workflow.name}`);
            }

            // Prepare instance data
            const instanceData = {
                workflow_id: workflowId,
                current_stage_id: startStage.id,
                created_by: this.currentParticipant.id,
                status: 'active',
                progress_percentage: 0,
                title: options.title || `${workflow.name} - ${new Date().toLocaleDateString()}`,
                metadata: options.metadata || {}
            };

            // Add location for incident workflows
            if (isIncidentWorkflow && options.location) {
                instanceData.location = options.location;
            }

            // Create the instance
            const { data: instance, error } = await this.supabase
                .from('workflow_instances')
                .insert(instanceData)
                .select()
                .single();

            if (error) {
                throw error;
            }

            this.logger.log('Created workflow instance:', instance.id, 
                       'for workflow:', workflow.name, 
                       'type:', workflow.workflow_type,
                       'treated as incident:', isIncidentWorkflow);

            // Create fully loaded instance with proper stage information
            const fullInstance = {
                ...instance,
                workflow: workflow,
                current_stage: startStage
            };

            // Cache the instance with complete information
            this.activeInstances.set(instance.id, fullInstance);

            // Emit custom event using browser's native event system
            window.dispatchEvent(new CustomEvent('workflow-engine:instance-created', {
                detail: {
                    instanceId: instance.id,
                    workflowId: workflowId,
                    workflowType: workflow.workflow_type,
                    location: options.location
                }
            }));

            return fullInstance;
        } catch (error) {
            this.logger.error('Failed to create workflow instance:', error);
            throw new Error(`Failed to create workflow instance: ${error.message}`);
        }
    }

    /**
     * Load an existing workflow instance with its current state
     */
    async getWorkflowInstance(instanceId) {
        try {
            // Check cache first
            if (this.activeInstances.has(instanceId)) {
                return this.activeInstances.get(instanceId);
            }

            // Load from database
            const { data: instance, error } = await this.supabase
                .from('workflow_instances')
                .select(`
                    *,
                    workflow:workflows (
                        *,
                        workflow_stages (
                            id,
                            stage_key,
                            stage_name,
                            stage_type,
                            stage_order,
                            max_duration_hours,
                            visible_to_roles
                        )
                    )
                `)
                .eq('id', instanceId)
                .single();

            if (error) {
                throw error;
            }

            if (!instance) {
                throw new Error(`Workflow instance ${instanceId} not found or not accessible`);
            }

            // Load current stage separately if it exists
            if (instance.current_stage_id) {
                const { data: currentStage, error: stageError } = await this.supabase
                    .from('workflow_stages')
                    .select('*')
                    .eq('id', instance.current_stage_id)
                    .single();
                
                if (stageError || !currentStage) {
                    this.logger.warn('Current stage not accessible, finding last accessible stage:', stageError?.message);
                    
                    // Try to find the last accessible stage for this participant
                    const lastAccessibleStage = await this.findLastAccessibleStage(instance);
                    
                    if (lastAccessibleStage) {
                        instance.current_stage = lastAccessibleStage;
                        instance.fallback_to_accessible = true;
                        instance.original_current_stage_id = instance.current_stage_id;
                        this.logger.log('Using last accessible stage:', lastAccessibleStage.stage_name);
                    } else {
                        throw new Error(`No accessible stages found for this workflow instance`);
                    }
                } else {
                    instance.current_stage = currentStage;
                    instance.fallback_to_accessible = false;
                    this.logger.log('Loaded current stage:', currentStage.stage_name, 'order:', currentStage.stage_order);
                }
            } else {
                throw new Error('Instance has no current_stage_id');
            }

            // Sort workflow stages
            if (instance.workflow?.workflow_stages) {
                instance.workflow.workflow_stages.sort((a, b) => a.stage_order - b.stage_order);
            }

            // Cache the instance
            this.activeInstances.set(instanceId, instance);

            this.logger.log('Loaded workflow instance:', instanceId, 
                       'current stage:', instance.current_stage?.stage_name);

            return instance;
        } catch (error) {
            this.logger.error('Failed to get workflow instance:', error);
            throw new Error(`Failed to get workflow instance: ${error.message}`);
        }
    }

    /**
     * Find the last accessible stage for the current participant
     * Used when current stage is not accessible due to RLS policies
     */
    async findLastAccessibleStage(instance) {
        try {
            if (!instance.workflow?.workflow_stages) {
                this.logger.error('No workflow stages available');
                return null;
            }
            
            // Sort stages by order (descending) to find the latest accessible one
            const sortedStages = [...instance.workflow.workflow_stages]
                .sort((a, b) => b.stage_order - a.stage_order);
            
            // Try each stage from latest to earliest
            for (const stage of sortedStages) {
                try {
                    // Check if this stage is accessible by trying to load it
                    const { data: accessibleStage, error } = await this.supabase
                        .from('workflow_stages')
                        .select('*')
                        .eq('id', stage.id)
                        .single();
                    
                    if (!error && accessibleStage) {
                        this.logger.log('Found accessible stage:', accessibleStage.stage_name, 'order:', accessibleStage.stage_order);
                        return accessibleStage;
                    }
                } catch (stageError) {
                    // This stage is not accessible, continue to the next one
                    this.logger.debug('Stage not accessible:', stage.stage_name, stageError.message);
                    continue;
                }
            }
            
            this.logger.warn('No accessible stages found');
            return null;
        } catch (error) {
            this.logger.error('Error finding last accessible stage:', error);
            return null;
        }
    }

    /**
     * Get available actions for the current stage of a workflow instance
     * Includes role-based filtering
     */
    async getAvailableActions(instanceId) {
        try {
            const instance = await this.getWorkflowInstance(instanceId);
            
            if (!instance.current_stage && !instance.current_stage_id) {
                throw new Error('Instance has no current stage information');
            }

            // Get current stage info if not already loaded
            let currentStage = instance.current_stage;
            if (!currentStage && instance.current_stage_id) {
                const { data: stageData, error: stageError } = await this.supabase.getParticipantClient()
                    .from('workflow_stages')
                    .select('*')
                    .eq('id', instance.current_stage_id)
                    .single();
                
                if (stageError) {
                    throw new Error(`Failed to load current stage: ${stageError.message}`);
                }
                
                currentStage = stageData;
                instance.current_stage = currentStage;
            }

            // Get actions from the current stage
            // RLS policies handle role-based filtering at database level
            this.logger.log('Current participant:', this.currentParticipant);
            this.logger.log('Current stage ID:', instance.current_stage_id);
            
            const { data: actions, error } = await this.supabase.getParticipantClient()
                .from('workflow_actions')
                .select(`
                    *,
                    form:forms (
                        id,
                        name,
                        description
                    )
                `)
                .eq('workflow_id', instance.workflow_id)
                .eq('from_stage_id', instance.current_stage_id);

            if (error) {
                throw error;
            }

            this.logger.log('Found', actions.length, 'available actions for stage:', 
                       currentStage?.stage_name);
            
            // Log details about each action for debugging
            actions.forEach(action => {
                const isEditAction = action.from_stage_id === action.to_stage_id;
                this.logger.log('Action:', action.action_name, {
                    isEditAction,
                    fromStageId: action.from_stage_id,
                    toStageId: action.to_stage_id,
                    currentStageId: instance.current_stage_id,
                    hasForm: !!action.form_id,
                    allowedRoles: action.allowed_roles
                });
            });

            return actions || [];
        } catch (error) {
            this.logger.error('Failed to get available actions:', error);
            throw new Error(`Failed to get available actions: ${error.message}`);
        }
    }
    
    /**
     * Get editable fields for an edit action
     */
    async getEditableFields(actionId) {
        try {
            const { data: editableFields, error } = await this.supabase.getParticipantClient()
                .from('action_editable_fields')
                .select(`
                    field_id,
                    form_id,
                    form_fields!action_editable_fields_field_id_fkey (
                        id,
                        field_label,
                        field_type,
                        field_order,
                        field_options,
                        validation_rules,
                        is_required,
                        placeholder,
                        help_text
                    )
                `)
                .eq('action_id', actionId);

            if (error) {
                throw error;
            }

            this.logger.log('Found', editableFields?.length || 0, 'editable fields for action:', actionId);
            
            // Sort by field order and preserve form_id
            const sortedFields = editableFields
                ?.map(ef => {
                    if (ef.form_fields) {
                        // Add form_id to the field definition
                        return {
                            ...ef.form_fields,
                            form_id: ef.form_id
                        };
                    }
                    return null;
                })
                .filter(field => field != null)
                .sort((a, b) => a.field_order - b.field_order) || [];
            
            this.logger.log('Sorted editable fields:', sortedFields);
            return sortedFields;
        } catch (error) {
            this.logger.error('Failed to get editable fields:', error);
            throw new Error(`Failed to get editable fields: ${error.message}`);
        }
    }

    /**
     * Load stage form from proper database tables
     */
    async loadStageForm(stageId) {
        try {
            // Get stage with form reference
            const { data: stage, error: stageError } = await this.supabase.getParticipantClient()
                .from('workflow_stages')
                .select('*, forms(*)')
                .eq('id', stageId)
                .single();
                
            if (stageError) throw stageError;
            
            if (!stage.initial_form_id) {
                return { form: null, fields: [] };
            }
            
            // Load form fields
            const { data: fields, error: fieldsError } = await this.supabase.getParticipantClient()
                .from('form_fields')
                .select('*')
                .eq('form_id', stage.initial_form_id)
                .order('field_order');
                
            if (fieldsError) throw fieldsError;
            
            return {
                form: stage.forms,
                fields: fields || []
            };
            
        } catch (error) {
            this.logger.error('Failed to load stage form:', error);
            return { form: null, fields: [] };
        }
    }
    
    /**
     * Load action form from proper database tables
     */
    async loadActionForm(actionId) {
        try {
            // Get action with form reference
            const { data: action, error: actionError } = await this.supabase.getParticipantClient()
                .from('workflow_actions')
                .select('*, forms(*)')
                .eq('id', actionId)
                .single();
                
            if (actionError) throw actionError;
            
            if (!action.form_id) {
                return { form: null, fields: [] };
            }
            
            // Load form fields
            const { data: fields, error: fieldsError } = await this.supabase.getParticipantClient()
                .from('form_fields')
                .select('*')
                .eq('form_id', action.form_id)
                .order('field_order');
                
            if (fieldsError) throw fieldsError;
            
            return {
                form: action.forms,
                fields: fields || []
            };
            
        } catch (error) {
            this.logger.error('Failed to load action form:', error);
            return { form: null, fields: [] };
        }
    }

    /**
     * Execute a workflow action (progress to next stage or edit current stage)
     */
    async executeAction(instanceId, actionId, formData = null) {
        try {
            this.logger.log('executeAction called with:', {
                instanceId,
                actionId,
                formDataKeys: formData ? Object.keys(formData) : null,
                formDataType: typeof formData
            });
            
            const instance = await this.getWorkflowInstance(instanceId);
            
            // Get the action definition
            const { data: action, error: actionError } = await this.supabase.getParticipantClient()
                .from('workflow_actions')
                .select('*')
                .eq('id', actionId)
                .single();

            if (actionError) {
                throw actionError;
            }

            if (!action) {
                throw new Error(`Action ${actionId} not found`);
            }

            this.logger.log('Action loaded:', {
                actionName: action.action_name,
                formId: action.form_id,
                fromStageId: action.from_stage_id,
                toStageId: action.to_stage_id
            });

            // RLS policies handle action permission checks at database level
            // No client-side permission validation needed

            // Create action execution record
            const executionData = {
                instance_id: instanceId,
                action_id: actionId,
                executed_by: this.currentParticipant.id,
                from_stage_id: action.from_stage_id,
                to_stage_id: action.to_stage_id,
                form_data: formData
            };

            this.logger.log('Creating action execution with data:', executionData);

            const { data: execution, error: execError } = await this.supabase
                .from('action_executions')
                .insert(executionData)
                .select()
                .single();

            if (execError) {
                this.logger.error('Action execution creation failed:', execError);
                throw execError;
            }

            this.logger.log('Action execution created successfully:', execution.id);

            // Update instance data if form data provided
            if (formData && Object.keys(formData).length > 0) {
                // Check if this is an edit action (no form_id but has editable fields)
                const isEditAction = action.from_stage_id === action.to_stage_id && !action.form_id;
                
                if (action.form_id) {
                    // Regular form action
                    this.logger.log('Calling updateInstanceData with form_id:', {
                        instanceId,
                        executionId: execution.id,
                        formId: action.form_id,
                        formDataKeys: Object.keys(formData),
                        formDataValues: formData
                    });
                    await this.updateInstanceData(instanceId, execution.id, action.form_id, formData);
                } else if (isEditAction) {
                    // Edit action - get form_id from editable fields
                    const editableFields = await this.getEditableFields(actionId);
                    if (editableFields && editableFields.length > 0) {
                        const formId = editableFields[0].form_id;
                        this.logger.log('Calling updateInstanceData for edit action:', {
                            instanceId,
                            executionId: execution.id,
                            formId: formId,
                            formDataKeys: Object.keys(formData),
                            formDataValues: formData
                        });
                        await this.updateInstanceData(instanceId, execution.id, formId, formData);
                    } else {
                        this.logger.warn('Edit action has no editable fields');
                    }
                } else {
                    this.logger.warn('Action has form data but no form_id and is not an edit action');
                }
            } else {
                this.logger.log('Skipping updateInstanceData:', {
                    hasFormData: !!formData,
                    hasFormId: !!action.form_id,
                    formData: formData,
                    formId: action.form_id
                });
            }

            // Progress to next stage if this is a forward action
            const isForwardAction = action.from_stage_id !== action.to_stage_id;
            if (isForwardAction) {
                // Try to get target stage roles from workflow data if available
                let targetStageRoles = null;
                if (instance.workflow?.workflow_stages) {
                    const targetStage = instance.workflow.workflow_stages.find(s => s.id === action.to_stage_id);
                    if (targetStage) {
                        targetStageRoles = targetStage.visible_to_roles;
                    }
                }
                await this.progressToStage(instanceId, action.to_stage_id, targetStageRoles);
            }

            this.logger.log('Executed action:', action.action_name, 
                       'for instance:', instanceId,
                       'forward action:', isForwardAction);

            // Clear instance from cache to force reload with new state
            this.activeInstances.delete(instanceId);

            // Emit custom event using browser's native event system
            window.dispatchEvent(new CustomEvent('workflow-engine:action-executed', {
                detail: {
                    instanceId: instanceId,
                    actionId: actionId,
                    actionName: action.action_name,
                    isForwardAction: isForwardAction,
                    fromStageId: action.from_stage_id,
                    toStageId: action.to_stage_id
                }
            }));

            return execution;
        } catch (error) {
            this.logger.error('Failed to execute action:', error);
            throw new Error(`Failed to execute action: ${error.message}`);
        }
    }

    /**
     * Execute a workflow action with form data processing
     */
    async executeActionWithForm(instanceId, actionId, formDataMap) {
        try {
            this.logger.log('executeActionWithForm called with:', {
                instanceId,
                actionId,
                formDataMapType: typeof formDataMap,
                isMap: formDataMap instanceof Map,
                formDataMapSize: formDataMap instanceof Map ? formDataMap.size : 'N/A',
                formDataMapKeys: formDataMap instanceof Map ? Array.from(formDataMap.keys()) : Object.keys(formDataMap || {})
            });

            // Convert Map to Object for storage
            const formData = {};
            if (formDataMap instanceof Map) {
                this.logger.log('Converting Map to Object...');
                for (let [key, value] of formDataMap.entries()) {
                    this.logger.log('Map entry:', key, '=', value, typeof value);
                    formData[key] = value;
                }
            } else {
                this.logger.log('Copying object data...');
                Object.assign(formData, formDataMap);
            }

            this.logger.log('Final formData object:', {
                keys: Object.keys(formData),
                values: formData,
                length: Object.keys(formData).length
            });

            // Execute the action
            const execution = await this.executeAction(instanceId, actionId, formData);

            this.logger.log('Executed action with form data:', execution.id, 
                       'fields:', Object.keys(formData).length);

            return execution;
        } catch (error) {
            this.logger.error('Failed to execute action with form:', error);
            throw new Error(`Failed to execute action with form: ${error.message}`);
        }
    }

    /**
     * Update instance data from form submission using field_id UUID references
     */
    async updateInstanceData(instanceId, executionId, formId, formData) {
        try {
            this.logger.log('updateInstanceData called with:', {
                instanceId,
                executionId,
                formId,
                formDataType: typeof formData,
                formDataKeys: Object.keys(formData || {}),
                formDataValues: formData,
                currentParticipantId: this.currentParticipant?.id
            });

            const insertData = [];
            
            // Get field mapping from form_fields if formId is provided
            const fieldMapping = new Map();
            if (formId) {
                const { data: fields, error: fieldsError } = await this.supabase
                    .from('form_fields')
                    .select('id, field_type')
                    .eq('form_id', formId);
                
                if (fieldsError) {
                    this.logger.error('Failed to get field information:', fieldsError);
                } else if (fields) {
                    fields.forEach(field => {
                        fieldMapping.set(field.id, {
                            id: field.id,
                            type: field.field_type
                        });
                    });
                }
            }

            for (const [fieldId, fieldValue] of Object.entries(formData)) {
                // Get field info from mapping or default
                const fieldInfo = fieldMapping.get(fieldId) || { id: fieldId, type: 'text' };
                if (!fieldInfo) {
                    this.logger.warn(`Field ${fieldId} not found in form_fields, skipping`);
                    continue;
                }
                
                const fieldType = this.getFieldType(fieldValue);
                const record = {
                    instance_id: instanceId,
                    field_id: fieldInfo.id,
                    field_value: String(fieldValue),
                    field_type: fieldType,
                    form_id: formId,
                    action_execution_id: executionId,
                    last_modified_by: this.currentParticipant.id
                };
                
                this.logger.log('Preparing record for field:', fieldId, {
                    fieldValue,
                    fieldType,
                    fieldId: fieldInfo.id,
                    record
                });
                
                insertData.push(record);
            }

            this.logger.log('Prepared', insertData.length, 'records for insertion:', insertData);

            if (insertData.length > 0) {
                this.logger.log('Inserting data into instance_data table with audit trail...');
                
                // Use audit-enabled upsert to log field changes
                const insertResult = await this.supabase.upsertInstanceDataWithAudit(
                    instanceId, 
                    insertData, 
                    {
                        activityType: 'field_update',
                        activitySummary: `Updated ${insertData.length} form fields`,
                        activityDetails: {
                            actionExecutionId: executionId,
                            formId: formId,
                            fieldCount: insertData.length,
                            updatedFields: insertData.map(record => ({
                                fieldId: record.field_id,
                                value: record.field_value
                            }))
                        },
                        metadata: {
                            source: 'workflow-engine',
                            operation: 'form_submission'
                        }
                    }
                );

                this.logger.log('Successfully inserted', insertData.length, 'instance data fields with audit:', insertResult);
            } else {
                this.logger.log('No data to insert - formData was empty');
            }
        } catch (error) {
            this.logger.error('Failed to update instance data:', error);
            throw new Error(`Failed to update instance data: ${error.message}`);
        }
    }

    /**
     * Progress workflow instance to a new stage
     */
    async progressToStage(instanceId, stageId, targetStageRoles = null) {
        try {
            // Get stage information for audit context
            const { data: stage } = await this.supabase
                .from('workflow_stages')
                .select('stage_name, stage_type')
                .eq('id', stageId)
                .single();

            // Use audit-aware update for stage progression
            await this.supabase.updateWithAudit(
                'workflow_instances',
                instanceId,
                { 
                    current_stage_id: stageId,
                    updated_at: new Date().toISOString()
                },
                {
                    activityType: 'stage_progression',
                    activitySummary: `Progressed to stage: ${stage?.stage_name || stageId}`,
                    activityDetails: {
                        newStageId: stageId,
                        stageName: stage?.stage_name,
                        stageType: stage?.stage_type,
                        targetStageRoles: targetStageRoles
                    },
                    metadata: {
                        component: 'workflow-engine',
                        action: 'progress_to_stage'
                    }
                }
            );

            this.logger.log('Progressed instance', instanceId, 'to stage', stageId);

            // Emit custom event using browser's native event system
            window.dispatchEvent(new CustomEvent('workflow-engine:stage-progressed', {
                detail: {
                    instanceId: instanceId,
                    newStageId: stageId
                }
            }));
        } catch (error) {
            this.logger.error('Failed to progress to stage:', error);
            throw new Error(`Failed to progress to stage: ${error.message}`);
        }
    }

    /**
     * Get collected data for a workflow instance
     * Only returns data from stages accessible to the current participant
     */
    async getInstanceData(instanceId) {
        try {
            // Get the instance to check if we're using fallback stage
            const instance = await this.getWorkflowInstance(instanceId);
            
            const { data: instanceData, error } = await this.supabase
                .from('instance_data')
                .select(`
                    *,
                    form_fields!instance_data_field_id_fkey (
                        id,
                        field_label,
                        field_type,
                        page,
                        page_title
                    ),
                    action_execution:action_executions (
                        id,
                        executed_at,
                        action:workflow_actions (
                            action_name,
                            from_stage_id,
                            to_stage_id
                        )
                    )
                `)
                .eq('instance_id', instanceId)
                .order('created_at');

            if (error) {
                throw error;
            }

            let filteredData = instanceData || [];
            
            // If we're using fallback to accessible stage, filter data to only show
            // data from stages up to and including the last accessible stage
            if (instance.fallback_to_accessible && instance.current_stage) {
                const maxAccessibleStageOrder = instance.current_stage.stage_order;
                this.logger.log('Filtering data to accessible stages, max order:', maxAccessibleStageOrder);
                
                filteredData = (instanceData || []).filter(item => {
                    // If no action execution info, include the data (it's from initial stages)
                    if (!item.action_execution?.action) {
                        return true;
                    }
                    
                    // Find the stage order for this data item
                    const toStageId = item.action_execution.action.to_stage_id;
                    const fromStageId = item.action_execution.action.from_stage_id;
                    
                    // Check both to_stage and from_stage to determine if data should be visible
                    const toStage = instance.workflow.workflow_stages.find(s => s.id === toStageId);
                    const fromStage = instance.workflow.workflow_stages.find(s => s.id === fromStageId);
                    
                    const toStageOrder = toStage?.stage_order || 0;
                    const fromStageOrder = fromStage?.stage_order || 0;
                    
                    // Data is visible if it belongs to a stage within accessible range
                    const isVisible = Math.max(toStageOrder, fromStageOrder) <= maxAccessibleStageOrder;
                    
                    if (!isVisible) {
                        this.logger.debug('Filtering out data from inaccessible stage:', {
                            fieldId: item.field_id,
                            toStageOrder,
                            fromStageOrder,
                            maxAccessibleStageOrder
                        });
                    }
                    
                    return isVisible;
                });
                
                this.logger.log('Filtered data:', filteredData.length, 'items from', instanceData.length, 'total');
            }

            return filteredData;
        } catch (error) {
            this.logger.error('Failed to get instance data:', error);
            throw new Error(`Failed to get instance data: ${error.message}`);
        }
    }

    /**
     * Get progressive data for form prefill (all data collected so far) using field_id
     */
    async getProgressiveData(instanceId) {
        try {
            const { data: instanceData, error } = await this.supabase
                .from('instance_data')
                .select(`
                    field_value, 
                    field_type, 
                    created_at,
                    field_id,
                    form_fields!instance_data_field_id_fkey (
                        id,
                        field_label,
                        field_type
                    )
                `)
                .eq('instance_id', instanceId)
                .order('created_at');

            if (error) {
                throw error;
            }

            // Convert to Map for easy lookup, keeping latest values
            const progressiveData = new Map();
            
            if (instanceData) {
                instanceData.forEach(record => {
                    let value = record.field_value;
                    
                    // Parse value based on field type
                    switch (record.field_type) {
                        case 'array':
                            try {
                                value = JSON.parse(value);
                            } catch (e) {
                                this.logger.warn('Failed to parse array value:', value);
                            }
                            break;
                        case 'boolean':
                            value = value === 'true';
                            break;
                        case 'number':
                            value = parseFloat(value);
                            break;
                        // text, signature, file types stay as strings
                    }
                    
                    // Use field_id as the key
                    const fieldId = record.field_id;
                    
                    progressiveData.set(fieldId, {
                        value: value,
                        type: record.field_type,
                        created_at: record.created_at,
                        field_id: record.field_id
                    });
                });
            }

            this.logger.log('Loaded progressive data:', progressiveData.size, 'fields');
            return progressiveData;
        } catch (error) {
            this.logger.error('Failed to get progressive data:', error);
            throw new Error(`Failed to get progressive data: ${error.message}`);
        }
    }


    /**
     * Check if an action is an edit action (same from/to stage)
     */
    async isEditAction(actionId) {
        try {
            const { data: action, error } = await this.supabase.getParticipantClient()
                .from('workflow_actions')
                .select('from_stage_id, to_stage_id')
                .eq('id', actionId)
                .single();

            if (error) {
                throw error;
            }

            return action.from_stage_id === action.to_stage_id;
        } catch (error) {
            this.logger.error('Failed to check if edit action:', error);
            return false;
        }
    }

    /**
     * Check if action conditions are met
     */
    async checkActionConditions(instanceId, actionId) {
        try {
            const { data: action, error } = await this.supabase.getParticipantClient()
                .from('workflow_actions')
                .select('conditions')
                .eq('id', actionId)
                .single();

            if (error) {
                throw error;
            }

            // If no conditions, action is available
            if (!action.conditions || !action.conditions.length) {
                return { canExecute: true, message: null };
            }

            // Get current instance data for condition checking
            const instanceData = await this.getInstanceData(instanceId);
            
            // Check each condition
            for (const condition of action.conditions) {
                switch (condition.type) {
                    case 'all_fields_completed':
                        // Check if all required fields have been completed
                        if (condition.required_fields && condition.required_fields.length > 0) {
                            const completedFields = instanceData.map(item => {
                                // Use field_id as the identifier
                                return item.field_id;
                            });
                            const missingFields = condition.required_fields.filter(field => 
                                !completedFields.includes(field));
                            
                            if (missingFields.length > 0) {
                                return { 
                                    canExecute: false, 
                                    message: `Missing required fields: ${missingFields.join(', ')}` 
                                };
                            }
                        }
                        break;
                    
                    case 'field_value_equals':
                        // Check if specific field has specific value
                        const fieldData = instanceData.find(item => {
                            return item.field_id === condition.field_id;
                        });
                        if (!fieldData || fieldData.field_value !== condition.expected_value) {
                            return { 
                                canExecute: false, 
                                message: condition.message || `Field ${condition.field_id} must equal ${condition.expected_value}` 
                            };
                        }
                        break;
                    
                    case 'minimum_data_count':
                        // Check if minimum number of data entries exist
                        if (instanceData.length < condition.minimum_count) {
                            return { 
                                canExecute: false, 
                                message: condition.message || `At least ${condition.minimum_count} data entries required` 
                            };
                        }
                        break;
                    
                    default:
                        this.logger.warn('Unknown condition type:', condition.type);
                }
            }

            return { canExecute: true, message: null };
        } catch (error) {
            this.logger.error('Failed to check action conditions:', error);
            return { canExecute: false, message: 'Failed to check action conditions' };
        }
    }

    /**
     * Utility method to determine field type from value
     */
    getFieldType(value) {
        if (typeof value === 'number') return 'number';
        if (typeof value === 'boolean') return 'boolean';
        if (value instanceof Date) return 'date';
        if (typeof value === 'string' && value.length > 255) return 'long_text';
        return 'short_text';
    }

    /**
     * Check if a workflow type requires map interaction
     */
    isMapBasedWorkflow(workflowType) {
        return workflowType === 'incident';
    }

    /**
     * Get workflow instances visible to current participant
     */
    async getVisibleInstances() {
        try {
            const { data: instances, error } = await this.supabase
                .from('workflow_instances')
                .select(`
                    *,
                    workflow:workflows (
                        name,
                        workflow_type,
                        marker_color,
                        icon_config
                    ),
                    current_stage:workflow_stages (
                        stage_name,
                        stage_type,
                        visible_to_roles
                    )
                `)
                .in('workflow_id', `{${Array.from(this.availableWorkflows.keys()).join(',')}}`)
                .order('created_at', { ascending: false });

            if (error) {
                throw error;
            }

            // Filter by stage visibility (RLS handles workflow visibility)
            const visibleInstances = instances.filter(instance => {
                const stage = instance.current_stage;
                return !stage?.visible_to_roles || 
                       stage.visible_to_roles.includes(this.currentParticipant.role_id);
            });

            return visibleInstances;
        } catch (error) {
            this.logger.error('Failed to get visible instances:', error);
            throw new Error(`Failed to get visible instances: ${error.message}`);
        }
    }

    /**
     * Get active instances created by current participant
     */
    async getMyActiveInstances() {
        try {
            const { data: instances, error } = await this.supabase
                .from('workflow_instances')
                .select(`
                    *,
                    workflow:workflows (
                        name,
                        workflow_type,
                        marker_color,
                        icon_config
                    ),
                    current_stage:workflow_stages (
                        stage_name,
                        stage_type,
                        stage_order
                    )
                `)
                .eq('created_by', this.currentParticipant.id)
                .eq('status', 'active')
                .order('created_at', { ascending: false });

            if (error) {
                throw error;
            }

            this.logger.log('Found', instances.length, 'active instances for participant');
            return instances || [];
        } catch (error) {
            this.logger.error('Failed to get active instances:', error);
            throw new Error(`Failed to get active instances: ${error.message}`);
        }
    }

    /**
     * Update instance status
     */
    async updateInstanceStatus(instanceId, status, metadata = null) {
        try {
            const updateData = { 
                status: status,
                updated_at: new Date().toISOString()
            };
            
            if (metadata) {
                updateData.metadata = metadata;
            }

            // Use audit-aware update for status changes
            await this.supabase.updateWithAudit(
                'workflow_instances',
                instanceId,
                updateData,
                {
                    activityType: 'status_update',
                    activitySummary: `Changed status to: ${status}`,
                    activityDetails: {
                        newStatus: status,
                        statusMetadata: metadata
                    },
                    metadata: {
                        component: 'workflow-engine',
                        action: 'update_instance_status'
                    }
                }
            );

            // Remove from cache to force reload
            this.activeInstances.delete(instanceId);

            this.logger.log('Updated instance status:', instanceId, 'to', status);

            // Emit custom event using browser's native event system
            window.dispatchEvent(new CustomEvent('workflow-engine:instance-status-updated', {
                detail: {
                    instanceId: instanceId,
                    status: status,
                    metadata: metadata
                }
            }));

            return true;
        } catch (error) {
            this.logger.error('Failed to update instance status:', error);
            throw new Error(`Failed to update instance status: ${error.message}`);
        }
    }

    /**
     * Complete a workflow instance (move to completed status)
     */
    async completeInstance(instanceId) {
        try {
            const instance = await this.getWorkflowInstance(instanceId);
            
            // Check if instance is in an end stage
            if (instance.current_stage?.stage_type !== 'end') {
                throw new Error('Instance must be in an end stage to be completed');
            }

            await this.updateInstanceStatus(instanceId, 'completed', {
                completed_at: new Date().toISOString(),
                completed_by: this.currentParticipant.id
            });

            this.logger.log('Completed workflow instance:', instanceId);

            // Emit custom event using browser's native event system
            window.dispatchEvent(new CustomEvent('workflow-engine:instance-completed', {
                detail: {
                    instanceId: instanceId,
                    workflowId: instance.workflow_id
                }
            }));

            return true;
        } catch (error) {
            this.logger.error('Failed to complete instance:', error);
            throw new Error(`Failed to complete instance: ${error.message}`);
        }
    }

    /**
     * Get workflow instance summary with current data
     */
    async getInstanceSummary(instanceId) {
        try {
            const instance = await this.getWorkflowInstance(instanceId);
            const instanceData = await this.getInstanceData(instanceId);
            const availableActions = await this.getAvailableActions(instanceId);

            // Calculate progress percentage
            const workflow = instance.workflow;
            const allStages = workflow.workflow_stages || [];
            const currentStageOrder = instance.current_stage?.stage_order || 0;
            const maxStageOrder = Math.max(...allStages.map(s => s.stage_order));
            const progressPercentage = maxStageOrder > 0 ? Math.round((currentStageOrder / maxStageOrder) * 100) : 0;

            // Update progress in database if different
            if (progressPercentage !== instance.progress_percentage) {
                await this.supabase.updateWithAudit(
                    'workflow_instances',
                    instanceId,
                    { progress_percentage: progressPercentage },
                    {
                        activityType: 'progress_update',
                        activitySummary: `Updated progress to ${progressPercentage}%`,
                        activityDetails: {
                            previousProgress: instance.progress_percentage,
                            newProgress: progressPercentage
                        },
                        metadata: {
                            component: 'workflow-engine',
                            action: 'calculate_progress'
                        }
                    }
                );
            }

            return {
                instance: {
                    ...instance,
                    progress_percentage: progressPercentage
                },
                collectedData: instanceData,
                availableActions: availableActions,
                isCompleted: instance.current_stage?.stage_type === 'end',
                canProgress: availableActions.length > 0
            };
        } catch (error) {
            this.logger.error('Failed to get instance summary:', error);
            throw new Error(`Failed to get instance summary: ${error.message}`);
        }
    }

    /**
     * Check if instance can be progressed (has available actions)
     */
    async canProgressInstance(instanceId) {
        try {
            const actions = await this.getAvailableActions(instanceId);
            return actions.length > 0;
        } catch (error) {
            this.logger.error('Failed to check instance progression:', error);
            return false;
        }
    }

    /**
     * Get instance history (action executions)
     */
    async getInstanceHistory(instanceId) {
        try {
            const { data: history, error } = await this.supabase
                .from('action_executions')
                .select(`
                    *,
                    action:workflow_actions (
                        action_name,
                        button_label
                    ),
                    from_stage:workflow_stages!from_stage_id (
                        stage_name
                    ),
                    to_stage:workflow_stages!to_stage_id (
                        stage_name
                    )
                `)
                .eq('instance_id', instanceId)
                .order('executed_at');

            if (error) {
                throw error;
            }

            return history || [];
        } catch (error) {
            this.logger.error('Failed to get instance history:', error);
            throw new Error(`Failed to get instance history: ${error.message}`);
        }
    }

    // REMOVED: getMaxStageForRole - client-side filtering replaced by RLS
    
    // REMOVED: isFieldVisibleToRole - client-side filtering replaced by RLS
    
    // REMOVED: getFieldStageOrder - client-side filtering replaced by RLS
    
    // REMOVED: filterInstanceDataByRole - client-side filtering replaced by RLS
    
    // REMOVED: getDataStageOrder - client-side filtering replaced by RLS
    
    // REMOVED: getVisibleStages - client-side filtering replaced by RLS
    
    // REMOVED: isInstanceVisibleToRole - client-side filtering replaced by RLS
    
    /**
     * Get visibility summary for debugging purposes only
     * @param {Object} instance - Workflow instance  
     * @param {Array|string} participantRoleIds - Array of role IDs or single role ID
     * @returns {Object} - Visibility summary for debugging
     */
    getVisibilitySummary(instance, participantRoleIds) {
        // Keep for debugging - all filtering now handled by RLS policies
        const roleIds = Array.isArray(participantRoleIds) ? participantRoleIds : [participantRoleIds];
        
        return {
            message: 'Client-side filtering removed - RLS handles all access control',
            instanceId: instance?.id,
            workflowId: instance?.workflow_id,
            currentStageId: instance?.current_stage_id,
            participantRoles: roleIds,
            totalStages: instance?.workflow?.workflow_stages?.length || 0
        };
    }
    
    // REMOVED: hasRoleOverlap - client-side filtering replaced by RLS
    
    // REMOVED: getCombinedPermissions - client-side filtering replaced by RLS
    
    /**
     * Check if error is network-related
     */
    isNetworkError(error) {
        return error.message && (
            error.message.includes('fetch') ||
            error.message.includes('network') ||
            error.message.includes('offline') ||
            error.message.includes('connection')
        );
    }

    /**
     * Handle workflow errors with user-friendly messages
     */
    getErrorMessage(error, context = 'workflow operation') {
        if (this.isNetworkError(error)) {
            return `Network error during ${context}. Please check your connection and try again.`;
        }
        
        if (error.message) {
            return error.message;
        }
        
        return `An error occurred during ${context}. Please try again.`;
    }

    /**
     * Cleanup method for component lifecycle
     */
    destroy() {
        this.availableWorkflows.clear();
        this.activeInstances.clear();
        this.currentParticipant = null;
        this.currentProject = null;
        
        this.logger.log('Destroyed');
    }
}

// Create and export singleton instance
export const workflowEngine = new WorkflowEngine();