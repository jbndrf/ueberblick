/**
 * Enhanced Form Builder Component
 * Sophisticated form field creation, validation, and smart dropdown support
 */

import { supabaseClient } from '../core/supabase.js';
import FormService from '../services/FormService.js';
import app from '../core/app.js';
import DebugLogger from '../core/debug-logger.js';

const logger = new DebugLogger('FormBuilder');

class FormBuilder {
    constructor(projectId, workflowBuilder = null) {
        logger.log('FormBuilder constructor called with projectId:', projectId, 'workflowBuilder:', !!workflowBuilder);
        this.projectId = projectId;
        this.workflowBuilder = workflowBuilder;  // Reference to workflow builder for field inheritance
        this.formService = new FormService(projectId);  // Use proper form service
        this.currentStageId = null;  // Current stage context for field inheritance
        this.currentActionId = null;  // Current action context for field inheritance
        this.currentContext = null;  // 'stage' or 'action'
        this.currentFormId = null;  // Track current form ID
        this.fields = [];
        this.callbacks = {
            onFieldAdd: null,
            onFieldUpdate: null,
            onFieldRemove: null,
            onFieldsChange: null
        };
        
        // Ensure global access for form builder instance
        window.formBuilder = this;
        logger.log('FormBuilder constructor completed, instance created');

        // Initialize persistent ID generation
        this.initializePersistentIdGeneration();
        
        // Track questions for sophisticated management
        this.questions = new Map();
        
        // Enhanced field types with 9 sophisticated options
        this.fieldTypes = {
            short: { 
                label: 'Short Text', 
                hasOptions: false, 
                icon: 'T',
                description: 'Single line text input',
                validation: ['required', 'minLength', 'maxLength', 'pattern']
            },
            long: { 
                label: 'Long Text', 
                hasOptions: false, 
                icon: 'T+',
                description: 'Multi-line text area',
                validation: ['required', 'minLength', 'maxLength']
            },
            multiple: { 
                label: 'Multiple Choice', 
                hasOptions: true, 
                icon: 'MC',
                description: 'Radio buttons or checkboxes',
                validation: ['required', 'minSelections', 'maxSelections']
            },
            dropdown: { 
                label: 'Dropdown', 
                hasOptions: true, 
                icon: 'DD',
                description: 'Select dropdown list',
                validation: ['required']
            },
            smart_dropdown: { 
                label: 'Smart Dropdown', 
                hasOptions: false, 
                hasMappings: true, 
                icon: 'SD',
                description: 'Dynamic options based on other fields or custom tables',
                validation: ['required']
            },
            date: { 
                label: 'Date', 
                hasOptions: false, 
                icon: 'DT',
                description: 'Date picker input',
                validation: ['required', 'minDate', 'maxDate']
            },
            file: { 
                label: 'File Upload', 
                hasOptions: false, 
                icon: 'F',
                description: 'File attachment input',
                validation: ['required', 'fileTypes', 'maxFileSize']
            },
            number: { 
                label: 'Number', 
                hasOptions: false, 
                icon: 'N',
                description: 'Numeric input with validation',
                validation: ['required', 'min', 'max', 'step']
            },
            email: { 
                label: 'Email', 
                hasOptions: false, 
                icon: 'E',
                description: 'Email address validation',
                validation: ['required', 'emailFormat']
            },
            custom_table_selector: {
                label: 'Custom Table Selector',
                hasOptions: false,
                hasCustomTable: true,
                icon: 'TB',
                description: 'Select from custom table entries',
                validation: ['required']
            }
        };

        // Load custom tables for smart dropdowns
        this.customTables = [];
        this.loadCustomTables();
    }

    /**
     * Initialize persistent ID generation system
     */
    initializePersistentIdGeneration() {
        // Use LocalStateManager's persistent ID if available, otherwise crypto.randomUUID
        this.generatePersistentFieldId = () => {
            if (this.workflowBuilder?.localState?.generatePersistentId) {
                return this.workflowBuilder.localState.generatePersistentId();
            }
            return crypto.randomUUID();
        };
    }

    // =====================================================
    // WORKFLOW INTEGRATION
    // =====================================================

    /**
     * Set stage context and load form properly - prioritize local state over database
     */
    async setStageContext(stageId) {
        logger.log('FormBuilder.setStageContext ENTRY with stageId:', stageId);
        this.currentStageId = stageId;
        this.currentActionId = null;
        this.currentContext = 'stage';
        
        // Load stage form if exists
        const stage = this.workflowBuilder?.stages?.get(stageId);
        logger.log('FormBuilder.setStageContext found stage:', stage?.id, 'formId:', stage?.formId, 'formFields:', stage?.formFields?.length);
        
        // PRIORITY 1: Use local stage formFields if they exist (unsaved changes)
        if (stage?.formFields && stage.formFields.length > 0) {
            logger.log('FormBuilder.setStageContext using local stage formFields:', stage.formFields.length, 'fields');
            this.setFields(stage.formFields);
            logger.log('FormBuilder: Loaded form fields from local stage state:', stage.formFields.length, 'fields');
        } 
        // PRIORITY 2: Load from database only if no local changes exist
        else if (stage?.formId) {
            logger.log('FormBuilder.setStageContext loading form from database with formId:', stage.formId);
            await this.loadFormForEditing(stage.formId);
        } 
        // PRIORITY 3: Clear fields if nothing exists
        else {
            logger.log('FormBuilder.setStageContext clearing fields (no form found)');
            this.clearFields();
        }
        
        logger.log('FormBuilder.setStageContext EXIT - Stage context set to', stageId, 'formId:', stage?.formId, 'formFields:', stage?.formFields?.length);
    }

    /**
     * Load form for editing from proper tables
     */
    async loadFormForEditing(formId) {
        try {
            logger.log('FormBuilder: Loading form for editing:', formId);
            const { form, fields } = await this.formService.loadFormWithFields(formId);
            this.currentFormId = formId;
            this.setFields(fields);
            logger.log(`FormBuilder: Loaded form for editing: ${form.name} with ${fields.length} fields`, fields);
        } catch (error) {
            logger.error('FormBuilder: Failed to load form for editing:', error);
            this.clearFields();
        }
    }
    
    /**
     * Save form to proper tables
     */
    async saveFormFields() {
        try {
            if (this.currentFormId) {
                // Update existing form
                await this.formService.updateFormFields(this.currentFormId, this.fields);
                logger.log('FormBuilder: Form fields updated');
            } else {
                // Create new form
                const form = await this.formService.createFormWithFields({
                    name: `Stage ${this.currentStageId} Form`,
                    description: 'Auto-generated form'
                }, this.fields);
                this.currentFormId = form.id;
                
                // Update stage with form reference
                if (this.workflowBuilder && this.currentStageId) {
                    this.workflowBuilder.updateStage(this.currentStageId, { formId: form.id });
                }
                
                logger.log('FormBuilder: New form created:', form.id);
            }
        } catch (error) {
            logger.error('FormBuilder: Failed to save form fields:', error);
            throw error;
        }
    }
    
    /**
     * Clear stage context
     */
    clearStageContext() {
        this.currentStageId = null;
        this.currentActionId = null;
        this.currentContext = null;
        this.currentFormId = null;
        logger.log('FormBuilder: Stage context cleared');
    }

    /**
     * Set action context for editing action fields
     */
    setActionContext(actionId) {
        logger.log('FormBuilder: setActionContext called with actionId:', actionId);
        this.currentStageId = null;
        this.currentActionId = actionId;
        this.currentContext = 'action';
        
        // Load action form fields if they exist
        if (this.workflowBuilder?.localState) {
            const action = this.workflowBuilder.localState.getState('actions').get(actionId);
            if (action && action.formFields && action.formFields.length > 0) {
                logger.log('FormBuilder: Loading form fields from action:', action.formFields.length, 'fields');
                this.setFields(action.formFields);
            } else {
                logger.log('FormBuilder: Clearing fields (no action form fields found)');
                this.clearFields();
            }
        }
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    /**
     * Load custom tables for smart dropdown integration
     */
    async loadCustomTables() {
        try {
            const { data: tables, error } = await supabaseClient.client
                .from('custom_tables')
                .select('*')
                .eq('project_id', this.projectId)
                .order('display_name');
            
            if (error) throw error;
            this.customTables = tables || [];
        } catch (error) {
            logger.error('FormBuilder: Failed to load custom tables:', error);
            this.customTables = [];
        }
    }

    // =====================================================
    // ENHANCED FIELD MANAGEMENT
    // =====================================================

    /**
     * Add a new field with sophisticated defaults
     */
    addField(fieldType = 'short', insertIndex = null) {
        const field = this.createDefaultField(fieldType);

        // Use LocalStateManager if available for persistent ID management
        if (this.workflowBuilder?.localState && this.currentStageId) {
            const persistentField = this.workflowBuilder.localState.addFormField(this.currentStageId, field);
            // Update local fields array to match LocalStateManager
            if (insertIndex !== null && insertIndex >= 0 && insertIndex <= this.fields.length) {
                this.fields.splice(insertIndex, 0, persistentField);
            } else {
                this.fields.push(persistentField);
            }
        } else {
            // Fallback for non-workflow contexts
            if (insertIndex !== null && insertIndex >= 0 && insertIndex <= this.fields.length) {
                this.fields.splice(insertIndex, 0, field);
            } else {
                this.fields.push(field);
            }
        }

        this.updateFieldOrders();
        this.triggerCallback('onFieldAdd', field);
        this.triggerCallback('onFieldsChange', this.fields);

        return field;
    }

    /**
     * Create sophisticated default field structure
     */
    createDefaultField(fieldType) {
        const fieldConfig = this.fieldTypes[fieldType];
        if (!fieldConfig) {
            throw new Error(`Unknown field type: ${fieldType}`);
        }

        const field = {
            id: this.generatePersistentFieldId(), // Use persistent ID that will remain stable
            field_label: `${fieldConfig.label} Field`,
            field_type: fieldType,
            field_order: this.fields.length + 1,
            is_required: false,
            placeholder: '',
            help_text: '',
            validation_rules: {},
            field_options: {},
            conditional_logic: {}
        };
        
        // Add sophisticated defaults for different field types
        if (fieldConfig.hasOptions) {
            field.field_options = {
                options: ['Option 1', 'Option 2', 'Option 3'],
                allow_other: false,
                randomize_order: false
            };
        }
        
        // Add sophisticated mappings for smart dropdowns
        if (fieldConfig.hasMappings) {
            field.field_options = {
                source_type: 'field', // 'field' or 'custom_table'
                source_field: '',
                source_table_id: null,
                display_column: 'name',
                mappings: [],
                allow_create: false
            };
        }
        
        return field;
    }

    /**
     * Update field with sophisticated validation
     */
    updateField(fieldId, updates) {
        const field = this.fields.find(f => f.id === fieldId);
        if (!field) return false;

        // Sophisticated validation
        const validationErrors = this.validateFieldData(updates, field.field_type);
        if (validationErrors.length > 0) {
            throw new Error(`Field validation failed: ${validationErrors.join(', ')}`);
        }

        // Update local field
        Object.assign(field, updates);

        // Update in LocalStateManager if available (maintains persistent ID)
        if (this.workflowBuilder?.localState) {
            this.workflowBuilder.localState.updateFormField(fieldId, updates);
        }

        // Sync back to the appropriate data source based on context
        this.syncFieldToDataSource(field);

        this.triggerCallback('onFieldUpdate', field);
        this.triggerCallback('onFieldsChange', this.fields);

        return true;
    }

    /**
     * Sync field back to the appropriate data source (stage or action)
     */
    syncFieldToDataSource(field) {
        if (!this.workflowBuilder) return;
        
        if (this.currentContext === 'stage' && this.currentStageId) {
            // Update stage formFields
            const stage = this.workflowBuilder.stages.get(this.currentStageId);
            if (stage) {
                const fieldIndex = stage.formFields.findIndex(f => f.id === field.id);
                if (fieldIndex !== -1) {
                    stage.formFields[fieldIndex] = { ...field };
                    logger.log('FormBuilder: Synced field to stage:', this.currentStageId, field.id);
                }
            }
        } else if (this.currentContext === 'action' && this.currentActionId) {
            // Update action formFields in LocalStateManager
            const action = this.workflowBuilder.localState.getState('actions').get(this.currentActionId);
            if (action) {
                const fieldIndex = action.formFields.findIndex(f => f.id === field.id);
                if (fieldIndex !== -1) {
                    const updatedFormFields = [...action.formFields];
                    updatedFormFields[fieldIndex] = { ...field };
                    this.workflowBuilder.localState.updateAction(this.currentActionId, { 
                        formFields: updatedFormFields 
                    });
                    logger.log('FormBuilder: Synced field to action:', this.currentActionId, field.id);
                }
            }
        }
    }

    /**
     * Remove field with cleanup
     */
    removeField(fieldId) {
        const index = this.fields.findIndex(f => f.id === fieldId);
        if (index === -1) return false;

        const removedField = this.fields.splice(index, 1)[0];
        this.updateFieldOrders();

        // Remove from LocalStateManager if available (tracks for database deletion)
        if (this.workflowBuilder?.localState) {
            this.workflowBuilder.localState.deleteFormField(fieldId);
        }

        // Clean up smart dropdown dependencies
        this.cleanupSmartDropdownDependencies(removedField);

        this.triggerCallback('onFieldRemove', removedField);
        this.triggerCallback('onFieldsChange', this.fields);

        return true;
    }

    /**
     * Create sophisticated field copy
     */
    copyField(fieldId) {
        const originalField = this.fields.find(f => f.id === fieldId);
        if (!originalField) return null;
        
        const copiedField = this.createFieldCopy(originalField);
        const originalIndex = this.fields.findIndex(f => f.id === fieldId);
        
        this.fields.splice(originalIndex + 1, 0, copiedField);
        this.updateFieldOrders();
        
        this.triggerCallback('onFieldAdd', copiedField);
        this.triggerCallback('onFieldsChange', this.fields);
        
        return copiedField;
    }

    /**
     * Move field to new position with reordering
     */
    moveField(fieldId, newIndex) {
        const currentIndex = this.fields.findIndex(f => f.id === fieldId);
        if (currentIndex === -1 || newIndex < 0 || newIndex >= this.fields.length) {
            return false;
        }
        
        const field = this.fields.splice(currentIndex, 1)[0];
        this.fields.splice(newIndex, 0, field);
        this.updateFieldOrders();
        
        this.triggerCallback('onFieldsChange', this.fields);
        return true;
    }

    // =====================================================
    // SMART DROPDOWN SOPHISTICATED FEATURES
    // =====================================================

    /**
     * Add sophisticated mapping rule to smart dropdown
     */
    addMappingRule(fieldId, whenValue = '', options = []) {
        const field = this.fields.find(f => f.id === fieldId);
        if (!field || field.field_type !== 'smart_dropdown') return false;
        
        if (!field.field_options.mappings) {
            field.field_options.mappings = [];
        }
        
        field.field_options.mappings.push({
            when: whenValue,
            options: options.length > 0 ? options : ['Option 1', 'Option 2'],
            conditions: [],
            advanced_logic: null
        });
        
        this.triggerCallback('onFieldUpdate', field);
        return true;
    }

    /**
     * Update mapping rule with advanced options
     */
    updateMappingRule(fieldId, ruleIndex, property, value) {
        const field = this.fields.find(f => f.id === fieldId);
        if (!field || field.field_type !== 'smart_dropdown' || !field.field_options.mappings) return false;
        
        if (ruleIndex >= 0 && ruleIndex < field.field_options.mappings.length) {
            field.field_options.mappings[ruleIndex][property] = value;
            this.triggerCallback('onFieldUpdate', field);
            return true;
        }
        
        return false;
    }

    /**
     * Remove sophisticated mapping rule
     */
    removeMappingRule(fieldId, ruleIndex) {
        const field = this.fields.find(f => f.id === fieldId);
        if (!field || field.field_type !== 'smart_dropdown') return false;
        
        if (field.field_options.mappings && ruleIndex >= 0 && ruleIndex < field.field_options.mappings.length) {
            field.field_options.mappings.splice(ruleIndex, 1);
            this.triggerCallback('onFieldUpdate', field);
            return true;
        }
        
        return false;
    }

    /**
     * Get available source fields for smart dropdown
     * Includes fields from current stage AND inherited fields from workflow stages
     * Now works with persistent IDs for stable references
     */
    getAvailableSourceFields(currentFieldId) {
        let availableFields = [];

        // Get local fields from current form (same stage) - exclude only the current field being edited
        const localFields = this.fields.filter(field =>
            field.id !== currentFieldId &&
            (field.field_type === 'dropdown' || field.field_type === 'multiple' || field.field_type === 'smart_dropdown')
        );
        
        // Standardize local field properties to support both naming conventions
        availableFields = localFields.map(field => ({
            ...field,
            key: field.key || field.field_key,
            label: field.label || field.field_label || 'Unnamed Field',
            type: field.type || field.field_type,
            field_key: field.key || field.field_key,
            field_label: field.label || field.field_label || 'Unnamed Field',
            field_type: field.type || field.field_type,
            isInherited: false
        }));
        
        // If we're in workflow context, add inherited fields
        if (this.workflowBuilder && this.currentStageId) {
            const inheritedFields = this.workflowBuilder.getInheritedFieldsForStage(this.currentStageId);
            
            const validInheritedFields = inheritedFields.filter(field => {
                const fieldType = field.field_type || field.type;
                return fieldType === 'dropdown' || fieldType === 'multiple' || fieldType === 'smart_dropdown';
            });
            
            // Add inherited fields with proper labeling
            validInheritedFields.forEach(field => {
                const fieldKey = field.field_key || field.key;
                const fieldLabel = field.field_label || field.label || 'Unnamed Field';
                const fieldType = field.field_type || field.type;
                
                availableFields.push({
                    ...field,
                    key: fieldKey,
                    label: `${fieldLabel} (${field.source})`,
                    type: fieldType,
                    field_key: fieldKey,
                    field_label: `${fieldLabel} (${field.source})`,
                    field_type: fieldType,
                    isInherited: true
                });
            });
        }
        
        return availableFields;
    }

    /**
     * Update smart dropdown source field with persistent ID reference
     */
    updateFieldSourceField(fieldId, sourceFieldId) {
        const field = this.fields.find(f => f.id === fieldId);
        if (!field || field.field_type !== 'smart_dropdown') return false;

        // Use persistent field ID instead of field key for stable references
        field.field_options.source_field_id = sourceFieldId;
        field.field_options.source_type = 'field';

        // Clear custom table settings when switching to field source
        field.field_options.source_table_id = null;
        field.field_options.display_column = 'name';

        // Update in LocalStateManager if available
        if (this.workflowBuilder?.localState) {
            this.workflowBuilder.localState.updateFormField(fieldId, {
                field_options: field.field_options
            });
        }

        this.triggerCallback('onFieldUpdate', field);
        return true;
    }

    /**
     * Update smart dropdown source custom table
     */
    updateFieldSourceTable(fieldId, tableId) {
        const field = this.fields.find(f => f.id === fieldId);
        if (!field || field.field_type !== 'smart_dropdown') return false;
        
        field.field_options.source_table_id = tableId;
        field.field_options.source_type = 'custom_table';
        
        // Clear field source when switching to custom table
        field.field_options.source_field = '';
        
        this.triggerCallback('onFieldUpdate', field);
        return true;
    }

    /**
     * Transform dropdown to sophisticated custom table
     */
    async transformToCustomTable(fieldId, tableName, displayName) {
        const field = this.fields.find(f => f.id === fieldId);
        if (!field || (field.field_type !== 'dropdown' && field.field_type !== 'multiple')) {
            throw new Error('Field must be dropdown or multiple choice to transform');
        }
        
        if (!field.field_options?.options || field.field_options.options.length === 0) {
            throw new Error('Field must have options to transform');
        }
        
        try {
            // Create sophisticated custom table
            const customTable = await supabaseClient.create('custom_tables', {
                project_id: this.projectId,
                table_name: tableName.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                display_name: displayName,
                description: `Generated from ${field.field_label} field`,
                main_column: 'name',
                created_at: new Date().toISOString()
            });
            
            // Create main column definition
            await supabaseClient.create('custom_table_columns', {
                table_id: customTable.id,
                column_name: 'name',
                column_type: 'text',
                is_required: true,
                created_at: new Date().toISOString()
            });
            
            // Populate table with existing options
            const tableData = field.field_options.options.map(option => ({
                table_id: customTable.id,
                row_data: { name: option },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }));
            
            await supabaseClient.client
                .from('custom_table_data')
                .insert(tableData);
            
            // Transform field to sophisticated smart dropdown
            field.field_type = 'smart_dropdown';
            field.field_options = {
                source_type: 'custom_table',
                source_table_id: customTable.id,
                display_column: 'name',
                allow_create: true,
                mappings: []
            };
            
            // Reload custom tables
            await this.loadCustomTables();
            
            this.triggerCallback('onFieldUpdate', field);
            
            return customTable;
            
        } catch (error) {
            throw new Error(`Failed to transform field to custom table: ${error.message}`);
        }
    }

    // =====================================================
    // SOPHISTICATED VALIDATION
    // =====================================================

    /**
     * Validate field data with sophisticated rules
     */
    validateFieldData(fieldData, fieldType) {
        const errors = [];
        
        // Basic validation
        if (!fieldData.field_label?.trim()) {
            errors.push('Field label is required');
        }
        
        if (fieldData.field_key && !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(fieldData.field_key)) {
            errors.push('Field key must start with a letter and contain only letters, numbers, and underscores');
        }
        
        // Field type specific validation
        const fieldConfig = this.fieldTypes[fieldType];
        if (fieldConfig?.hasOptions && (!fieldData.field_options?.options || fieldData.field_options.options.length === 0)) {
            errors.push('Options are required for this field type');
        }
        
        // Smart dropdown validation
        if (fieldType === 'smart_dropdown' && fieldData.field_options) {
            const options = fieldData.field_options;
            if (options.source_type === 'field' && !options.source_field) {
                errors.push('Source field is required for field-based smart dropdown');
            } else if (options.source_type === 'custom_table' && !options.source_table_id) {
                errors.push('Source table is required for table-based smart dropdown');
            }
        }
        
        return errors;
    }

    /**
     * Validate all fields with sophisticated checking
     */
    validateAllFields() {
        const errors = [];
        const duplicateKeyErrors = [];
        
        this.fields.forEach((field, index) => {
            const fieldErrors = this.validateFieldData(field, field.field_type);
            fieldErrors.forEach(error => {
                errors.push(`Field ${index + 1}: ${error}`);
            });
        });
        
        // Check for duplicate keys
        const keys = this.fields.map(f => f.field_key);
        const duplicateKeys = keys.filter((key, index) => keys.indexOf(key) !== index);
        if (duplicateKeys.length > 0) {
            duplicateKeyErrors.push(`Duplicate field keys: ${[...new Set(duplicateKeys)].join(', ')}`);
        }
        
        return [...errors, ...duplicateKeyErrors];
    }

    // =====================================================
    // SOPHISTICATED RENDERING
    // =====================================================

    /**
     * Render sophisticated question modal
     */
    showQuestionModal(existingField = null) {
        const isEdit = !!existingField;
        const modalTitle = isEdit ? 'Edit Question' : 'Add New Question';
        
        // Close any existing modals
        const overlay = document.getElementById('overlay');
        if (overlay) overlay.style.display = 'none';
        document.querySelectorAll('.modal').forEach(modal => {
            if (modal.id !== 'questionModal') modal.style.display = 'none';
        });
        
        const questionFormHTML = this.renderQuestionForm(existingField);
        
        const modalHTML = `
            <div id="questionModal" class="modal-overlay" style="display: flex;">
                <div class="modal-content question-modal">
                    <div class="modal-header">
                        <h3 class="modal-title">${modalTitle}</h3>
                        <button type="button" class="modal-close" onclick="formBuilder.closeQuestionModal()">×</button>
                    </div>
                    <div class="modal-body">
                        ${questionFormHTML}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="formBuilder.closeQuestionModal()">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="formBuilder.saveQuestionFromModal()">
                            ${isEdit ? 'Update' : 'Add'} Question
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal
        const existingModal = document.getElementById('questionModal');
        if (existingModal) existingModal.remove();
        
        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Setup event handlers
        this.setupModalEventHandlers();
        
        // Store current field if editing
        this._currentEditingField = existingField;
        
        // Initialize existing selections for smart dropdowns after a brief delay to ensure DOM is ready
        setTimeout(() => {
            if (existingField && existingField.field_type === 'smart_dropdown') {
                this.initializeExistingSmartDropdownSelections();
            }
        }, 100);
    }

    /**
     * Render sophisticated question form
     */
    renderQuestionForm(existingField = null) {
        const field = existingField || {};
        const fieldType = field.field_type || 'short';
        
        return `
            <div class="question-form">
                <div class="form-group">
                    <label class="form-label" for="questionType">Question Type</label>
                    <select class="form-select" id="questionType" ${existingField ? 'disabled' : ''} onchange="formBuilder.handleTypeChange(this.value)">
                        ${Object.entries(this.fieldTypes).map(([type, config]) => `
                            <option value="${type}" ${type === fieldType ? 'selected' : ''}>
                                ${config.icon} ${config.label}
                            </option>
                        `).join('')}
                    </select>
                    <small class="help-text">${this.fieldTypes[fieldType]?.description || ''}</small>
                </div>
                
                <div class="form-group">
                    <label class="form-label" for="questionLabel">Question Text *</label>
                    <input type="text" class="form-input" id="questionLabel" value="${field.field_label || ''}" 
                           placeholder="What would you like to ask?" required>
                </div>
                
                
                <div class="form-group">
                    <label class="form-label" for="questionPlaceholder">Placeholder Text</label>
                    <input type="text" class="form-input" id="questionPlaceholder" value="${field.placeholder || ''}" 
                           placeholder="Hint text for the user">
                </div>
                
                <div class="form-group">
                    <label class="form-label" for="questionHelp">Help Text</label>
                    <textarea class="form-textarea" id="questionHelp" rows="2" placeholder="Additional instructions or guidance">${field.help_text || ''}</textarea>
                </div>
                
                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="questionRequired" ${field.is_required ? 'checked' : ''}>
                        This question is required
                    </label>
                </div>
                
                <div id="typeSpecificOptions" class="type-specific-options">
                    ${this.renderTypeSpecificOptions(fieldType, field)}
                </div>
            </div>
        `;
    }

    /**
     * Render sophisticated type-specific options
     */
    renderTypeSpecificOptions(fieldType, field = {}) {
        const fieldTypeConfig = this.fieldTypes[fieldType];
        
        if (fieldTypeConfig?.hasOptions) {
            return this.renderOptionsConfig(field);
        }
        
        if (fieldTypeConfig?.hasMappings) {
            return this.renderSmartDropdownConfig(field);
        }
        
        return this.renderValidationConfig(fieldType, field);
    }

    /**
     * Render sophisticated options configuration
     */
    renderOptionsConfig(field) {
        const options = field.field_options?.options || ['Option 1', 'Option 2', 'Option 3'];
        const allowOther = field.field_options?.allow_other || false;
        const randomizeOrder = field.field_options?.randomize_order || false;
        
        return `
            <div class="form-group">
                <label class="form-label" for="questionOptions">Answer Options (one per line) *</label>
                <textarea class="form-textarea" id="questionOptions" rows="5" placeholder="Option 1&#10;Option 2&#10;Option 3" required>${options.join('\n')}</textarea>
                <small class="form-help">Users will choose from these options</small>
            </div>
            
            <div class="form-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="allowOther" ${allowOther ? 'checked' : ''}>
                    Allow "Other" option with text input
                </label>
            </div>
            
            <div class="form-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="randomizeOrder" ${randomizeOrder ? 'checked' : ''}>
                    Randomize option order for each user
                </label>
            </div>
            
            <div class="field-actions-secondary">
                <button type="button" onclick="formBuilder.showTransformToTableModal('temp_field')" class="btn btn-secondary btn-sm">
                    Convert to Custom Table
                </button>
            </div>
        `;
    }

    /**
     * Render sophisticated smart dropdown configuration
     */
    renderSmartDropdownConfig(field) {
        const sourceFields = this.getAvailableSourceFields(field.id);
        const sourceType = field.field_options?.source_type || 'field';
        const sourceField = field.field_options?.source_field || '';
        const sourceTableId = field.field_options?.source_table_id || null;
        const allowCreate = field.field_options?.allow_create || false;
        const mappings = field.field_options?.mappings || [];
        
        return `
            <div class="form-group">
                <label class="form-label" for="sourceType">Data Source Type</label>
                <select class="form-select" id="sourceType" onchange="formBuilder.handleSourceTypeChange(this.value)">
                    <option value="field" ${sourceType === 'field' ? 'selected' : ''}>Other Form Field</option>
                    <option value="custom_table" ${sourceType === 'custom_table' ? 'selected' : ''}>Custom Table</option>
                </select>
            </div>
            
            <div id="fieldSourceConfig" style="display: ${sourceType === 'field' ? 'block' : 'none'}">
                <div class="form-group">
                    <label class="form-label" for="sourceField">Source Field</label>
                    <select class="form-select" id="sourceField" onchange="formBuilder.handleSourceFieldChange(this.value)">
                        <option value="">Select source field...</option>
                        ${sourceFields.map(f => `
                            <option value="${f.id}" ${f.id === sourceField ? 'selected' : ''}>
                                ${f.field_label || f.label || 'Unnamed Field'} (${f.field_type || f.type})${f.isInherited ? ' - Inherited' : ''}
                            </option>
                        `).join('')}
                    </select>
                    <small class="form-help">Options will depend on the value of this field</small>
                </div>
                
                <div class="form-group" id="sourceValueSelection" style="display: ${sourceField ? 'block' : 'none'}">
                    <label class="form-label">Source Field Values</label>
                    <div class="source-values-container">
                        <select class="form-select" id="sourceValues" multiple size="4" onchange="formBuilder.handleSourceValuesSelection(this)" onclick="console.log('FormBuilder: sourceValues clicked')" onselect="console.log('FormBuilder: sourceValues onselect')"
                            ${sourceField ? this.getSourceFieldOptionsHTML(sourceField, mappings) : '<!-- Options will be loaded dynamically based on source field -->'}
                        </select>
                        <small class="form-help">Select one or more values to create tabs for</small>
                    </div>
                </div>
            </div>
            
            <div id="tableSourceConfig" style="display: ${sourceType === 'custom_table' ? 'block' : 'none'}">
                <div class="form-group">
                    <label class="form-label" for="sourceTable">Source Table</label>
                    <select class="form-select" id="sourceTable">
                        <option value="">Select custom table...</option>
                        ${this.customTables.map(table => `
                            <option value="${table.id}" ${table.id === sourceTableId ? 'selected' : ''}>
                                ${table.display_name}
                            </option>
                        `).join('')}
                    </select>
                    <small class="form-help">Load options from this custom table</small>
                </div>
                
                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="allowCreate" ${allowCreate ? 'checked' : ''}>
                        Allow users to create new entries
                    </label>
                </div>
            </div>
            
            ${(sourceField || sourceTableId) && sourceType === 'field' ? `
                <div class="form-group">
                    <label class="form-label">Dynamic Mappings</label>
                    <div class="tabbed-mappings-container" id="tabbedMappingsContainer">
                        ${this.renderTabbedMappings(mappings)}
                    </div>
                </div>
            ` : ''}
        `;
    }

    /**
     * Render sophisticated mapping rule
     */
    renderMappingRule(mapping, index) {
        return `
            <div class="mapping-rule" data-index="${index}">
                <div class="mapping-condition">
                    <label>When source field equals:</label>
                    <input type="text" value="${mapping.when}" 
                           onchange="formBuilder.updateMappingRuleInModal(${index}, 'when', this.value)"
                           placeholder="Source value">
                </div>
                <div class="mapping-options">
                    <label>Show these options:</label>
                    <textarea onchange="formBuilder.updateMappingRuleInModal(${index}, 'options', this.value.split('\\n').filter(o => o.trim()))"
                              placeholder="Option 1&#10;Option 2"
                              rows="3">${mapping.options.join('\n')}</textarea>
                </div>
                <button type="button" onclick="formBuilder.removeMappingRuleFromModal(${index})" class="btn btn-danger btn-sm">
                    Delete
                </button>
            </div>
        `;
    }

    /**
     * Render tabbed mappings interface
     */
    renderTabbedMappings(mappings) {
        if (!mappings || mappings.length === 0) {
            return `
                <div class="no-mappings-message">
                    <p>Select source field values above to create mapping tabs</p>
                </div>
            `;
        }

        const tabs = mappings.map((mapping, index) => `
            <div class="mapping-tab ${index === 0 ? 'active' : ''}" 
                 data-tab="${mapping.when}" 
                 onclick="formBuilder.switchMappingTab('${mapping.when}')">
                ${mapping.when}
            </div>
        `).join('');

        const tabContents = mappings.map((mapping, index) => `
            <div class="mapping-tab-content ${index === 0 ? 'active' : ''}" 
                 data-tab-content="${mapping.when}">
                <div class="mapping-options">
                    <label>Options for "${mapping.when}":</label>
                    <textarea onchange="formBuilder.updateTabbedMappingOptions('${mapping.when}', this.value)"
                              placeholder="Option 1&#10;Option 2&#10;Option 3"
                              rows="5">${(mapping.options || []).join('\n')}</textarea>
                    <small class="form-help">Enter one option per line</small>
                </div>
            </div>
        `).join('');

        return `
            <div class="tabbed-mappings">
                <div class="mapping-tabs">
                    ${tabs}
                </div>
                <div class="mapping-tab-contents">
                    ${tabContents}
                </div>
            </div>
        `;
    }

    /**
     * Render sophisticated validation configuration
     */
    renderValidationConfig(fieldType, field) {
        const fieldConfig = this.fieldTypes[fieldType];
        let html = '';
        
        // Date field specific options
        if (fieldType === 'date') {
            const fieldOptions = field.field_options || {};
            const includeTime = fieldOptions.includeTime || false;
            const defaultToNow = fieldOptions.defaultToNow || false;
            
            html += `
                <div class="form-group">
                    <label>Date Field Options</label>
                    <div class="date-field-options">
                        <div class="form-group">
                            <label class="checkbox-label">
                                <input type="checkbox" id="includeTime" ${includeTime ? 'checked' : ''}>
                                Add time
                            </label>
                            <small class="help-text">Include time picker with date selection</small>
                        </div>
                        
                        <div class="form-group">
                            <label class="checkbox-label">
                                <input type="checkbox" id="defaultToNow" ${defaultToNow ? 'checked' : ''}>
                                Default to now
                            </label>
                            <small class="help-text">Pre-fill with current date/time when form loads</small>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // Regular validation rules
        if (fieldConfig?.validation) {
            const validationRules = field.validation_rules || {};
            
            html += `
                <div class="form-group">
                    <label>Validation Rules</label>
                    <div class="validation-rules">
                        ${fieldConfig.validation.map(rule => this.renderValidationRule(rule, validationRules[rule] || '')).join('')}
                    </div>
                </div>
            `;
        }
        
        return html;
    }

    /**
     * Render sophisticated validation rule
     */
    renderValidationRule(ruleType, value) {
        const ruleConfigs = {
            minLength: { label: 'Minimum Length', type: 'number', placeholder: '0' },
            maxLength: { label: 'Maximum Length', type: 'number', placeholder: '255' },
            min: { label: 'Minimum Value', type: 'number', placeholder: '0' },
            max: { label: 'Maximum Value', type: 'number', placeholder: '100' },
            pattern: { label: 'Pattern (Regex)', type: 'text', placeholder: '^[a-zA-Z]+$' },
            step: { label: 'Step Value', type: 'number', placeholder: '1' }
        };
        
        const config = ruleConfigs[ruleType];
        if (!config) return '';
        
        return `
            <div class="validation-rule">
                <label>${config.label}:</label>
                <input type="${config.type}" value="${value}" 
                       data-rule="${ruleType}"
                       onchange="formBuilder.updateValidationRuleInModal('${ruleType}', this.value)"
                       placeholder="${config.placeholder}">
            </div>
        `;
    }

    // =====================================================
    // SOPHISTICATED MODAL EVENT HANDLERS
    // =====================================================

    /**
     * Initialize existing smart dropdown selections when editing
     */
    initializeExistingSmartDropdownSelections() {
        const sourceField = document.getElementById('sourceField');
        const sourceValues = document.getElementById('sourceValues');
        
        if (sourceField && sourceField.value && sourceValues && this._currentEditingField) {
            const field = this._currentEditingField;
            const mappings = field.field_options?.mappings || [];
            
            if (mappings.length > 0) {
                // Select the existing values in the multi-select
                const existingValues = mappings.map(m => m.when);
                Array.from(sourceValues.options).forEach(option => {
                    option.selected = existingValues.includes(option.value);
                });
                
                // Update the tabbed mappings display
                this.updateTabbedMappingsDisplay(mappings);
                this._tempTabbedMappings = [...mappings];
            }
        }
    }
    
    /**
     * Setup sophisticated modal event handlers
     */
    setupModalEventHandlers() {
        // Escape key handler
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                this.closeQuestionModal();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
        
        // Click-outside handler
        const modal = document.getElementById('questionModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeQuestionModal();
                }
            });
        }
    }

    /**
     * Handle sophisticated type change
     */
    handleTypeChange(newType) {
        const typeSpecificOptions = document.getElementById('typeSpecificOptions');
        if (typeSpecificOptions) {
            typeSpecificOptions.innerHTML = this.renderTypeSpecificOptions(newType, {});
        }
        
        // Update description
        const helpText = document.querySelector('#questionType + .help-text');
        if (helpText) {
            helpText.textContent = this.fieldTypes[newType]?.description || '';
        }
    }

    /**
     * Handle sophisticated source type change
     */
    handleSourceTypeChange(sourceType) {
        const fieldConfig = document.getElementById('fieldSourceConfig');
        const tableConfig = document.getElementById('tableSourceConfig');
        
        if (fieldConfig && tableConfig) {
            fieldConfig.style.display = sourceType === 'field' ? 'block' : 'none';
            tableConfig.style.display = sourceType === 'custom_table' ? 'block' : 'none';
        }
    }

    /**
     * Get source field options HTML with existing selections
     */
    getSourceFieldOptionsHTML(sourceFieldId, existingMappings = []) {
        const sourceField = this.getAvailableSourceFields().find(f => f.id === sourceFieldId);
        if (!sourceField || !sourceField.field_options || !sourceField.field_options.options) {
            return '<option disabled>No options available in source field</option>';
        }
        
        const existingValues = existingMappings.map(m => m.when);
        
        return sourceField.field_options.options.map(option => {
            const isSelected = existingValues.includes(option) ? 'selected' : '';
            return `<option value="${option}" ${isSelected}>${option}</option>`;
        }).join('');
    }
    
    /**
     * Handle source field selection change
     */
    async handleSourceFieldChange(sourceFieldId) {
        const sourceValueSelection = document.getElementById('sourceValueSelection');
        const sourceValuesSelect = document.getElementById('sourceValues');
        
        if (!sourceValueSelection || !sourceValuesSelect) return;
        
        if (sourceFieldId) {
            sourceValueSelection.style.display = 'block';
            
            // Load available options from the selected source field
            const sourceField = this.getAvailableSourceFields().find(f => f.id === sourceFieldId);
            if (sourceField && sourceField.field_options && sourceField.field_options.options) {
                sourceValuesSelect.innerHTML = sourceField.field_options.options.map(option => `
                    <option value="${option}">${option}</option>
                `).join('');
            } else {
                sourceValuesSelect.innerHTML = '<option disabled>No options available in source field</option>';
            }
        } else {
            sourceValueSelection.style.display = 'none';
            sourceValuesSelect.innerHTML = '';
        }
        
        // Clear existing tabbed mappings
        this.updateTabbedMappingsDisplay([]);
    }

    /**
     * Handle source values selection
     */
    handleSourceValuesSelection(selectElement) {
        try {
            console.log('FormBuilder: handleSourceValuesSelection called', selectElement);
            
            // Temporarily suppress any selection limit notifications
            this.suppressSelectionLimitNotifications(true);
            
            const selectedValues = Array.from(selectElement.selectedOptions).map(option => option.value);
            console.log('FormBuilder: Selected values:', selectedValues);
            
            if (selectedValues.length === 0) {
                this.updateTabbedMappingsDisplay([]);
                this._tempTabbedMappings = [];
                return;
            }
            
            // Create mappings for selected values
            const newMappings = selectedValues.map(value => ({
                when: value,
                options: ['Option 1', 'Option 2', 'Option 3']
            }));
            
            console.log('FormBuilder: New mappings created:', newMappings);
            
            // Update the tabbed mappings display
            this.updateTabbedMappingsDisplay(newMappings);
            
            // Store in temporary mappings for later saving
            this._tempTabbedMappings = newMappings;
            
            console.log('FormBuilder: Tabbed mappings updated successfully');
            
            // Re-enable selection limit notifications
            setTimeout(() => {
                this.suppressSelectionLimitNotifications(false);
            }, 500);
            
        } catch (error) {
            console.error('FormBuilder: Error in handleSourceValuesSelection:', error);
            this.suppressSelectionLimitNotifications(false);
        }
    }
    
    /**
     * Temporarily suppress selection limit notifications from other components
     */
    suppressSelectionLimitNotifications(suppress) {
        if (suppress) {
            // Store original showNotification method if it exists
            if (window.app && window.app.showNotification) {
                this._originalShowNotification = window.app.showNotification;
                window.app.showNotification = (type, title, message) => {
                    if (title === 'Selection Limit') {
                        console.log('FormBuilder: Suppressed selection limit notification:', message);
                        return;
                    }
                    this._originalShowNotification(type, title, message);
                };
            }
        } else {
            // Restore original showNotification method
            if (this._originalShowNotification && window.app) {
                window.app.showNotification = this._originalShowNotification;
                delete this._originalShowNotification;
            }
        }
    }

    /**
     * Update tabbed mappings display
     */
    updateTabbedMappingsDisplay(mappings) {
        const container = document.getElementById('tabbedMappingsContainer');
        if (container) {
            container.innerHTML = this.renderTabbedMappings(mappings);
        }
    }

    /**
     * Switch between mapping tabs
     */
    switchMappingTab(tabKey) {
        // Remove active class from all tabs and contents
        document.querySelectorAll('.mapping-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.mapping-tab-content').forEach(content => content.classList.remove('active'));
        
        // Add active class to selected tab and content
        const selectedTab = document.querySelector(`[data-tab="${tabKey}"]`);
        const selectedContent = document.querySelector(`[data-tab-content="${tabKey}"]`);
        
        if (selectedTab) selectedTab.classList.add('active');
        if (selectedContent) selectedContent.classList.add('active');
    }

    /**
     * Update options for a specific tabbed mapping
     */
    updateTabbedMappingOptions(tabKey, optionsText) {
        if (!this._tempTabbedMappings) this._tempTabbedMappings = [];
        
        const mappingIndex = this._tempTabbedMappings.findIndex(m => m.when === tabKey);
        if (mappingIndex !== -1) {
            this._tempTabbedMappings[mappingIndex].options = 
                optionsText.split('\n').map(o => o.trim()).filter(o => o.length > 0);
        }
    }

    /**
     * Add sophisticated mapping rule to modal
     */
    addMappingRuleToModal() {
        const container = document.getElementById('mappingsContainer');
        if (!container) return;
        
        const index = container.children.length;
        const newMapping = { when: '', options: ['Option 1', 'Option 2'] };
        
        container.insertAdjacentHTML('beforeend', this.renderMappingRule(newMapping, index));
    }

    /**
     * Update sophisticated mapping rule in modal
     */
    updateMappingRuleInModal(index, property, value) {
        // Store changes for later saving
        if (!this._tempMappings) this._tempMappings = [];
        if (!this._tempMappings[index]) this._tempMappings[index] = {};
        this._tempMappings[index][property] = value;
    }

    /**
     * Remove sophisticated mapping rule from modal
     */
    removeMappingRuleFromModal(index) {
        const rule = document.querySelector(`.mapping-rule[data-index="${index}"]`);
        if (rule) rule.remove();
    }

    /**
     * Update sophisticated validation rule in modal
     */
    updateValidationRuleInModal(ruleType, value) {
        // Store changes for later saving
        if (!this._tempValidationRules) this._tempValidationRules = {};
        this._tempValidationRules[ruleType] = value;
    }

    /**
     * Save sophisticated question from modal
     */
    saveQuestionFromModal() {
        try {
            const fieldType = document.getElementById('questionType').value;
            const fieldLabel = document.getElementById('questionLabel').value.trim();
            const placeholder = document.getElementById('questionPlaceholder').value.trim();
            const helpText = document.getElementById('questionHelp').value.trim();
            const isRequired = document.getElementById('questionRequired').checked;
            
            if (!fieldLabel) {
                alert('Question text is required');
                return;
            }
            
            let fieldOptions = {};
            
            // Handle sophisticated options for dropdown/multiple choice
            if (this.fieldTypes[fieldType]?.hasOptions) {
                const optionsText = document.getElementById('questionOptions').value.trim();
                if (!optionsText) {
                    alert('Options are required for this question type');
                    return;
                }
                
                fieldOptions.options = optionsText.split('\n').map(o => o.trim()).filter(o => o.length > 0);
                if (fieldOptions.options.length === 0) {
                    alert('At least one option is required');
                    return;
                }
                
                // Sophisticated options
                const allowOtherEl = document.getElementById('allowOther');
                const randomizeOrderEl = document.getElementById('randomizeOrder');
                if (allowOtherEl) fieldOptions.allow_other = allowOtherEl.checked;
                if (randomizeOrderEl) fieldOptions.randomize_order = randomizeOrderEl.checked;
            }
            
            // Handle sophisticated smart dropdown options
            if (this.fieldTypes[fieldType]?.hasMappings) {
                const sourceTypeEl = document.getElementById('sourceType');
                const sourceType = sourceTypeEl ? sourceTypeEl.value : 'field';
                
                fieldOptions.source_type = sourceType;
                
                if (sourceType === 'field') {
                    const sourceFieldEl = document.getElementById('sourceField');
                    fieldOptions.source_field = sourceFieldEl ? sourceFieldEl.value : '';
                    // Use tabbed mappings if available, otherwise fall back to regular mappings
                    fieldOptions.mappings = this._tempTabbedMappings || this._tempMappings || [];
                } else if (sourceType === 'custom_table') {
                    const sourceTableEl = document.getElementById('sourceTable');
                    const allowCreateEl = document.getElementById('allowCreate');
                    fieldOptions.source_table_id = sourceTableEl ? sourceTableEl.value : null;
                    fieldOptions.allow_create = allowCreateEl ? allowCreateEl.checked : false;
                }
            }
            
            // Handle date field specific options
            if (fieldType === 'date') {
                const includeTimeEl = document.getElementById('includeTime');
                const defaultToNowEl = document.getElementById('defaultToNow');
                
                if (includeTimeEl) fieldOptions.includeTime = includeTimeEl.checked;
                if (defaultToNowEl) fieldOptions.defaultToNow = defaultToNowEl.checked;
            }
            
            // Handle sophisticated validation rules
            const validationRules = this._tempValidationRules || {};
            
            if (this._currentEditingField) {
                // Update existing field
                this.updateField(this._currentEditingField.id, {
                    field_label: fieldLabel,
                    placeholder: placeholder,
                    help_text: helpText,
                    is_required: isRequired,
                    field_options: fieldOptions,
                    validation_rules: validationRules
                });
            } else {
                // Add new field
                const field = this.createDefaultField(fieldType);
                Object.assign(field, {
                    field_label: fieldLabel,
                    placeholder: placeholder,
                    help_text: helpText,
                    is_required: isRequired,
                    field_options: fieldOptions,
                    validation_rules: validationRules
                });
                
                this.fields.push(field);
                this.updateFieldOrders();
                this.triggerCallback('onFieldAdd', field);
                this.triggerCallback('onFieldsChange', this.fields);
            }
            
            this.closeQuestionModal();
            
        } catch (error) {
            alert('Error saving question: ' + error.message);
        }
    }

    /**
     * Close sophisticated question modal
     */
    closeQuestionModal() {
        const modal = document.getElementById('questionModal');
        if (modal) modal.remove();
        
        // Clear overlay and other modals
        const overlay = document.getElementById('overlay');
        if (overlay) overlay.style.display = 'none';
        
        // Clear temporary data
        this._currentEditingField = null;
        this._tempMappings = null;
        this._tempTabbedMappings = null;
        this._tempValidationRules = null;
        
        // Remove event listeners
        document.removeEventListener('keydown', this.handleEscape);
    }

    // =====================================================
    // SOPHISTICATED UTILITY METHODS
    // =====================================================


    /**
     * Generate sophisticated unique field key
     */
    generateUniqueFieldKey(baseKey) {
        let key = baseKey;
        let counter = 1;
        
        while (this.fields.some(f => f.field_key === key)) {
            key = `${baseKey}_${counter}`;
            counter++;
        }
        
        return key;
    }

    /**
     * Update sophisticated field orders
     */
    updateFieldOrders() {
        this.fields.forEach((field, index) => {
            field.field_order = index + 1;
        });
    }

    /**
     * Create sophisticated field copy
     */
    createFieldCopy(originalField) {
        const copy = JSON.parse(JSON.stringify(originalField));
        copy.id = this.generatePersistentFieldId(); // Use persistent ID that will remain stable
        copy.field_key = this.generateUniqueFieldKey(originalField.field_key);
        copy.field_label = originalField.field_label + ' (Copy)';
        copy.field_order = originalField.field_order + 1;
        
        return copy;
    }

    /**
     * Clean up sophisticated smart dropdown dependencies
     */
    cleanupSmartDropdownDependencies(removedField) {
        // Remove references to deleted field in smart dropdowns
        this.fields.forEach(field => {
            if (field.field_type === 'smart_dropdown' && 
                field.field_options?.source_field === removedField.field_key) {
                field.field_options.source_field = '';
                field.field_options.mappings = [];
                this.triggerCallback('onFieldUpdate', field);
            }
        });
    }

    /**
     * Set sophisticated callbacks
     */
    setCallbacks(callbacks) {
        Object.assign(this.callbacks, callbacks);
    }

    /**
     * Trigger sophisticated callback
     */
    triggerCallback(name, ...args) {
        if (this.callbacks[name] && typeof this.callbacks[name] === 'function') {
            this.callbacks[name](...args);
        }
    }

    /**
     * Show sophisticated add question modal
     */
    showAddQuestionModal() {
        this.showQuestionModal();
    }

    /**
     * Get sophisticated field by ID
     */
    getField(fieldId) {
        return this.fields.find(f => f.id === fieldId);
    }

    /**
     * Get all sophisticated fields
     */
    getAllFields() {
        return [...this.fields];
    }

    /**
     * Clear all sophisticated fields
     */
    clearFields() {
        this.fields = [];
        this.triggerCallback('onFieldsChange', this.fields);
    }

    /**
     * Set sophisticated fields
     */
    setFields(fields) {
        this.clearFields(); // Clear existing fields to prevent contamination
        this.fields = [...fields];
        this.updateFieldOrders();
        logger.log('FormBuilder: setFields called with', fields.length, 'fields. Internal fields now:', this.fields.length);
        this.triggerCallback('onFieldsChange', this.fields);
    }


    /**
     * Get all available fields (local + inherited) for current stage
     */
    getAllAvailableFields() {
        let allFields = [...this.fields];
        
        // Add inherited fields if in workflow context
        if (this.workflowBuilder && this.currentStageId) {
            const inheritedFields = this.workflowBuilder.getInheritedFieldsForStage(this.currentStageId);
            allFields = [...allFields, ...inheritedFields];
        }
        
        return allFields;
    }

    // =====================================================
    // SMART DROPDOWN DATA LOADING
    // =====================================================

    /**
     * Load options for smart dropdown based on field configuration
     */
    async loadSmartDropdownOptions(fieldConfig, sourceValues = {}) {
        try {
            const options = fieldConfig.field_options || {};
            
            if (options.source_type === 'custom_table') {
                return await this.getOptionsFromCustomTable(
                    options.source_table_id,
                    options.display_column || 'name',
                    sourceValues
                );
            } else if (options.source_type === 'field') {
                return await this.getOptionsFromSourceField(
                    options.source_field,
                    sourceValues,
                    options.mappings || []
                );
            }
            
            return [];
        } catch (error) {
            logger.error('Failed to load smart dropdown options:', error);
            return [];
        }
    }

    /**
     * Get dropdown options from custom table
     */
    async getOptionsFromCustomTable(tableId, displayColumn = 'name', filterCriteria = {}) {
        try {
            const tableData = await supabaseClient.getCustomTableData(tableId, {
                limit: 100,
                orderBy: displayColumn
            });
            
            return tableData.map(row => ({
                value: row.row_data[displayColumn],
                label: row.row_data[displayColumn],
                id: row.id
            }));
        } catch (error) {
            logger.error('Failed to load options from custom table:', error);
            return [];
        }
    }

    /**
     * Get options from source field based on mapping rules
     */
    async getOptionsFromSourceField(sourceFieldKey, sourceValues, mappingRules = []) {
        try {
            // Get the source field value
            const sourceValue = sourceValues[sourceFieldKey];
            
            if (!sourceValue) {
                return [];
            }
            
            // Find matching mapping rule
            const matchingRule = mappingRules.find(rule => 
                rule.when_value === sourceValue || 
                rule.when_value === '*' // wildcard match
            );
            
            if (matchingRule && matchingRule.options) {
                return matchingRule.options.map(option => ({
                    value: option,
                    label: option
                }));
            }
            
            return [];
        } catch (error) {
            logger.error('Failed to load options from source field:', error);
            return [];
        }
    }

    /**
     * Populate smart dropdown with loaded options
     */
    populateSmartDropdown(fieldId, options) {
        const field = this.fields.find(f => f.id === fieldId);
        if (!field) return;
        
        // Update field with loaded options
        field.dynamicOptions = options;
        
        // Trigger UI update
        this.triggerCallback('onFieldUpdate', field);
    }

    /**
     * Watch source field changes and update smart dropdowns
     */
    watchSourceFieldChanges(fieldId, sourceFieldKey, callback) {
        // Store the watch relationship
        if (!this.sourceFieldWatchers) {
            this.sourceFieldWatchers = new Map();
        }
        
        if (!this.sourceFieldWatchers.has(sourceFieldKey)) {
            this.sourceFieldWatchers.set(sourceFieldKey, []);
        }
        
        this.sourceFieldWatchers.get(sourceFieldKey).push({
            fieldId,
            callback
        });
    }

    /**
     * Update smart dropdown options when source field changes
     */
    async updateSmartDropdownOptions(sourceFieldKey, sourceValue, allFormValues = {}) {
        if (!this.sourceFieldWatchers || !this.sourceFieldWatchers.has(sourceFieldKey)) {
            return;
        }
        
        const watchers = this.sourceFieldWatchers.get(sourceFieldKey);
        
        for (const watcher of watchers) {
            const field = this.fields.find(f => f.id === watcher.fieldId);
            if (!field) continue;
            
            const options = await this.loadSmartDropdownOptions(field, allFormValues);
            this.populateSmartDropdown(watcher.fieldId, options);
            
            if (watcher.callback) {
                watcher.callback(options);
            }
        }
    }
}

export default FormBuilder;