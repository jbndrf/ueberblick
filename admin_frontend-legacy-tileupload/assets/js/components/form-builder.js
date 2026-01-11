/**
 * Form Builder Component
 * Handles form field creation, validation, and rendering with database integration
 * Simplified version without complex overlay system
 */

import { supabaseClient } from '../core/supabase.js';
import QuestionElement from './question-element.js';
import DebugLogger from '../core/debug-logger.js';

const logger = new DebugLogger('FormBuilder');

class FormBuilder {
    constructor(projectId) {
        this.projectId = projectId;
        this.fields = [];
        this.callbacks = {
            onFieldAdd: null,
            onFieldUpdate: null,
            onFieldRemove: null,
            onFieldsChange: null
        };
        
        // Ensure global access for form builder instance
        window.formBuilder = this;
        
        // Track questions for simple management
        this.questions = new Map();
        
        this.fieldTypes = {
            short: { 
                label: 'Short Text', 
                hasOptions: false, 
                icon: 'T',
                validation: ['required', 'minLength', 'maxLength', 'pattern']
            },
            long: { 
                label: 'Long Text', 
                hasOptions: false, 
                icon: 'T',
                validation: ['required', 'minLength', 'maxLength']
            },
            multiple: { 
                label: 'Multiple Choice', 
                hasOptions: true, 
                icon: '',
                validation: ['required', 'minSelections', 'maxSelections']
            },
            dropdown: { 
                label: 'Dropdown', 
                hasOptions: true, 
                icon: 'T',
                validation: ['required']
            },
            date: { 
                label: 'Date', 
                hasOptions: false, 
                icon: 'T',
                validation: ['required', 'minDate', 'maxDate']
            },
            file: { 
                label: 'File Upload', 
                hasOptions: false, 
                icon: 'T',
                validation: ['required', 'fileTypes', 'maxFileSize']
            },
            number: { 
                label: 'Number', 
                hasOptions: false, 
                icon: '#',
                validation: ['required', 'min', 'max', 'step']
            },
            email: { 
                label: 'Email', 
                hasOptions: false, 
                icon: 'T',
                validation: ['required', 'emailFormat']
            }
        };
    }

    // =====================================================
    // FIELD MANAGEMENT
    // =====================================================

    /**
     * Add a new field
     */
    addField(fieldType = 'short', insertIndex = null) {
        const field = this.createDefaultField(fieldType);
        
        if (insertIndex !== null && insertIndex >= 0 && insertIndex <= this.fields.length) {
            this.fields.splice(insertIndex, 0, field);
        } else {
            this.fields.push(field);
        }
        
        this.updateFieldOrders();
        this.triggerCallback('onFieldAdd', field);
        this.triggerCallback('onFieldsChange', this.fields);
        
        return field;
    }

    /**
     * Remove a field
     */
    removeField(fieldId) {
        const index = this.fields.findIndex(f => f.id === fieldId);
        if (index === -1) return false;
        
        const removedField = this.fields.splice(index, 1)[0];
        this.updateFieldOrders();
        
        this.triggerCallback('onFieldRemove', removedField);
        this.triggerCallback('onFieldsChange', this.fields);
        
        return true;
    }

    /**
     * Update a field
     */
    updateField(fieldId, updates) {
        const field = this.fields.find(f => f.id === fieldId);
        if (!field) return false;
        
        // Validate updates
        const validationErrors = this.validateFieldData(updates, field.field_type);
        if (validationErrors.length > 0) {
            throw new Error(`Field validation failed: ${validationErrors.join(', ')}`);
        }
        
        Object.assign(field, updates);
        
        this.triggerCallback('onFieldUpdate', field);
        this.triggerCallback('onFieldsChange', this.fields);
        
        return true;
    }

    /**
     * Copy a field
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
     * Move field to new position
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
    // FIELD OPERATIONS
    // =====================================================

    /**
     * Create default field structure
     */
    createDefaultField(fieldType) {
        const fieldConfig = this.fieldTypes[fieldType];
        if (!fieldConfig) {
            throw new Error(`Unknown field type: ${fieldType}`);
        }
        
        const field = {
            id: this.generateFieldId(),
            field_key: this.generateFieldKey(fieldType),
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
        
        // Add default options for fields that need them
        if (fieldConfig.hasOptions) {
            field.field_options = {
                options: ['Option 1', 'Option 2', 'Option 3']
            };
        }
        
        // Add default mappings for smart dropdowns
        if (fieldConfig.hasMappings) {
            field.field_options = {
                source_field: '',
                mappings: []
            };
        }
        
        return field;
    }

    /**
     * Create a copy of an existing field
     */
    createFieldCopy(originalField) {
        const copy = JSON.parse(JSON.stringify(originalField));
        copy.id = this.generateFieldId();
        copy.field_key = this.generateUniqueFieldKey(originalField.field_key);
        copy.field_label = originalField.field_label + ' (Copy)';
        copy.field_order = originalField.field_order + 1;
        
        return copy;
    }

    /**
     * Generate unique field ID
     */
    generateFieldId() {
        return 'field_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Generate field key
     */
    generateFieldKey(fieldType) {
        const base = fieldType.replace('_', '') + '_field';
        return this.generateUniqueFieldKey(base);
    }

    /**
     * Generate unique field key
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
     * Update field orders
     */
    updateFieldOrders() {
        this.fields.forEach((field, index) => {
            field.field_order = index + 1;
        });
    }

    // =====================================================
    // VALIDATION
    // =====================================================

    /**
     * Validate field data
     */
    validateFieldData(fieldData, fieldType) {
        const errors = [];
        
        // Check required properties
        if (!fieldData.field_label?.trim()) {
            errors.push('Field label is required');
        }
        
        if (!fieldData.field_key?.trim()) {
            errors.push('Field key is required');
        } else if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(fieldData.field_key)) {
            errors.push('Field key must start with a letter and contain only letters, numbers, and underscores');
        }
        
        // Check field type specific requirements
        const fieldConfig = this.fieldTypes[fieldType];
        if (fieldConfig?.hasOptions && (!fieldData.field_options?.options || fieldData.field_options.options.length === 0)) {
            errors.push('Options are required for this field type');
        }
        
        return errors;
    }

    /**
     * Validate all fields
     */
    validateAllFields() {
        const errors = [];
        
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
            errors.push(`Duplicate field keys: ${duplicateKeys.join(', ')}`);
        }
        
        return errors;
    }

    // =====================================================
    // SMART DROPDOWN FEATURES
    // =====================================================

    /**
     * Add mapping rule to smart dropdown
     */
    addMappingRule(fieldId, whenValue = '', options = []) {
        const field = this.fields.find(f => f.id === fieldId);
        if (!field || field.field_type !== 'smart_dropdown') return false;
        
        if (!field.field_options.mappings) {
            field.field_options.mappings = [];
        }
        
        field.field_options.mappings.push({
            when: whenValue,
            options: options.length > 0 ? options : ['Option 1', 'Option 2']
        });
        
        this.triggerCallback('onFieldUpdate', field);
        return true;
    }

    /**
     * Remove mapping rule from smart dropdown
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
     */
    getAvailableSourceFields(currentFieldId) {
        return this.fields.filter(field => 
            field.id !== currentFieldId && 
            (field.field_type === 'dropdown' || field.field_type === 'multiple')
        );
    }

    // =====================================================
    // CUSTOM TABLE INTEGRATION
    // =====================================================

    /**
     * Transform dropdown to custom table
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
            // Create custom table
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
            
            // Update field to smart dropdown
            field.field_type = 'smart_dropdown';
            field.field_options = {
                source_table_id: customTable.id,
                source_table_name: tableName,
                display_column: 'name'
            };
            
            this.triggerCallback('onFieldUpdate', field);
            
            return customTable;
            
        } catch (error) {
            throw new Error(`Failed to transform field to custom table: ${error.message}`);
        }
    }

    // =====================================================
    // FORM PERSISTENCE
    // =====================================================

    /**
     * Save fields to database form
     */
    async saveToForm(formId) {
        if (!formId) {
            throw new Error('Form ID is required');
        }
        
        const validationErrors = this.validateAllFields();
        if (validationErrors.length > 0) {
            throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
        }
        
        // Delete existing fields
        await supabaseClient.client
            .from('form_fields')
            .delete()
            .eq('form_id', formId);
        
        if (this.fields.length === 0) return [];
        
        // Prepare fields for database
        const fieldsData = this.fields.map(field => ({
            form_id: formId,
            field_key: field.field_key,
            field_label: field.field_label,
            field_type: field.field_type,
            field_order: field.field_order,
            is_required: field.is_required,
            placeholder: field.placeholder || null,
            help_text: field.help_text || null,
            validation_rules: field.validation_rules,
            field_options: field.field_options,
            conditional_logic: field.conditional_logic,
            created_at: new Date().toISOString()
        }));
        
        // Insert new fields
        const { data: savedFields, error } = await supabaseClient.client
            .from('form_fields')
            .insert(fieldsData)
            .select();
        
        if (error) throw error;
        
        return savedFields;
    }

    /**
     * Load fields from database form
     */
    async loadFromForm(formId) {
        if (!formId) return;
        
        const { data: formFields, error } = await supabaseClient.client
            .from('form_fields')
            .select('*')
            .eq('form_id', formId)
            .order('field_order');
        
        if (error) throw error;
        
        this.fields = (formFields || []).map(dbField => ({
            id: this.generateFieldId(),
            field_key: dbField.field_key,
            field_label: dbField.field_label,
            field_type: dbField.field_type,
            field_order: dbField.field_order,
            is_required: dbField.is_required,
            placeholder: dbField.placeholder || '',
            help_text: dbField.help_text || '',
            validation_rules: dbField.validation_rules || {},
            field_options: dbField.field_options || {},
            conditional_logic: dbField.conditional_logic || {}
        }));
        
        this.triggerCallback('onFieldsChange', this.fields);
    }

    // =====================================================
    // RENDERING
    // =====================================================

    /**
     * Render field configuration UI
     */
    renderFieldConfig(field) {
        const fieldConfig = this.fieldTypes[field.field_type];
        
        return `
            <div class="form-field-config" data-field-id="${field.id}">
                <div class="field-header">
                    <span class="field-type">${fieldConfig.icon} ${fieldConfig.label}</span>
                    <div class="field-actions">
                        <button type="button" onclick="formBuilder.copyField('${field.id}')" 
                                class="btn-icon" title="Copy Field">=�</button>
                        <button type="button" onclick="formBuilder.removeField('${field.id}')" 
                                class="btn-icon btn-danger" title="Delete Field">�</button>
                    </div>
                </div>
                
                <div class="field-config-body">
                    <div class="form-group">
                        <label>Field Label *</label>
                        <input type="text" value="${field.field_label}" 
                               onchange="formBuilder.updateField('${field.id}', {field_label: this.value})"
                               placeholder="Enter field label">
                    </div>
                    
                    <div class="form-group">
                        <label>Field Key *</label>
                        <input type="text" value="${field.field_key}" 
                               onchange="formBuilder.updateField('${field.id}', {field_key: this.value})"
                               placeholder="field_key"
                               pattern="[a-zA-Z][a-zA-Z0-9_]*">
                    </div>
                    
                    <div class="form-group">
                        <label>Placeholder Text</label>
                        <input type="text" value="${field.placeholder}" 
                               onchange="formBuilder.updateField('${field.id}', {placeholder: this.value})"
                               placeholder="Enter placeholder text">
                    </div>
                    
                    <div class="form-group">
                        <label>Help Text</label>
                        <textarea onchange="formBuilder.updateField('${field.id}', {help_text: this.value})"
                                  placeholder="Additional help or instructions">${field.help_text}</textarea>
                    </div>
                    
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" ${field.is_required ? 'checked' : ''} 
                                   onchange="formBuilder.updateField('${field.id}', {is_required: this.checked})">
                            Required Field
                        </label>
                    </div>
                    
                    ${this.renderFieldTypeSpecificConfig(field)}
                </div>
            </div>
        `;
    }

    /**
     * Render field type specific configuration
     */
    renderFieldTypeSpecificConfig(field) {
        const fieldConfig = this.fieldTypes[field.field_type];
        
        if (fieldConfig.hasOptions) {
            return this.renderOptionsConfig(field);
        }
        
        if (fieldConfig.hasMappings) {
            return this.renderMappingsConfig(field);
        }
        
        return this.renderValidationConfig(field);
    }

    /**
     * Render options configuration for dropdown/multiple choice
     */
    renderOptionsConfig(field) {
        const options = field.field_options?.options || [];
        
        return `
            <div class="form-group">
                <label>Options (one per line) *</label>
                <textarea onchange="formBuilder.updateFieldOptions('${field.id}', this.value)"
                          placeholder="Option 1&#10;Option 2&#10;Option 3"
                          rows="5">${options.join('\n')}</textarea>
                <div class="field-actions-secondary">
                    <button type="button" onclick="formBuilder.transformToCustomTable('${field.id}')"
                            class="btn-secondary btn-sm">= Convert to Custom Table</button>
                </div>
            </div>
        `;
    }

    /**
     * Render mappings configuration for smart dropdown
     */
    renderMappingsConfig(field) {
        const sourceFields = this.getAvailableSourceFields(field.id);
        const sourceField = field.field_options?.source_field || '';
        const mappings = field.field_options?.mappings || [];
        
        return `
            <div class="form-group">
                <label>Source Field</label>
                <select onchange="formBuilder.updateFieldSourceField('${field.id}', this.value)">
                    <option value="">Select source field...</option>
                    ${sourceFields.map(f => `
                        <option value="${f.field_key}" ${f.field_key === sourceField ? 'selected' : ''}>
                            ${f.field_label}
                        </option>
                    `).join('')}
                </select>
            </div>
            
            ${sourceField ? `
                <div class="form-group">
                    <label>Dynamic Mappings</label>
                    <div class="mappings-container" id="mappings-${field.id}">
                        ${mappings.map((mapping, index) => this.renderMappingRule(field.id, mapping, index)).join('')}
                    </div>
                    <button type="button" onclick="formBuilder.addMappingRule('${field.id}')"
                            class="btn-secondary btn-sm">+ Add Mapping</button>
                </div>
            ` : ''}
        `;
    }

    /**
     * Render mapping rule
     */
    renderMappingRule(fieldId, mapping, index) {
        return `
            <div class="mapping-rule">
                <div class="mapping-condition">
                    <label>When source field equals:</label>
                    <input type="text" value="${mapping.when}" 
                           onchange="formBuilder.updateMappingRule('${fieldId}', ${index}, 'when', this.value)"
                           placeholder="Source value">
                </div>
                <div class="mapping-options">
                    <label>Show these options:</label>
                    <textarea onchange="formBuilder.updateMappingRule('${fieldId}', ${index}, 'options', this.value.split('\\n').filter(o => o.trim()))"
                              placeholder="Option 1&#10;Option 2"
                              rows="3">${mapping.options.join('\n')}</textarea>
                </div>
                <button type="button" onclick="formBuilder.removeMappingRule('${fieldId}', ${index})"
                        class="btn-icon btn-danger">�</button>
            </div>
        `;
    }

    /**
     * Render validation configuration
     */
    renderValidationConfig(field) {
        const fieldConfig = this.fieldTypes[field.field_type];
        if (!fieldConfig.validation) return '';
        
        return `
            <div class="form-group">
                <label>Validation Rules</label>
                <div class="validation-rules">
                    ${fieldConfig.validation.map(rule => this.renderValidationRule(field, rule)).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Render individual validation rule
     */
    renderValidationRule(field, ruleType) {
        const value = field.validation_rules[ruleType] || '';
        
        switch (ruleType) {
            case 'minLength':
            case 'maxLength':
            case 'min':
            case 'max':
                return `
                    <div class="validation-rule">
                        <label>${ruleType.replace(/([A-Z])/g, ' $1').toLowerCase()}:</label>
                        <input type="number" value="${value}" 
                               onchange="formBuilder.updateValidationRule('${field.id}', '${ruleType}', this.value)">
                    </div>
                `;
            case 'pattern':
                return `
                    <div class="validation-rule">
                        <label>Pattern (regex):</label>
                        <input type="text" value="${value}" 
                               onchange="formBuilder.updateValidationRule('${field.id}', '${ruleType}', this.value)"
                               placeholder="^[a-zA-Z]+$">
                    </div>
                `;
            default:
                return '';
        }
    }

    // =====================================================
    // QUESTION OVERLAY INTEGRATION
    // =====================================================

    /**
     * Show direct question settings instead of overlay
     */
    showQuestionOverlay() {
        // Legacy method - redirect to new modal system
        this.showAddQuestionModal();
    }

    // =====================================================
    // SIMPLE QUESTION MANAGEMENT
    // =====================================================

    /**
     * Add a new question (simplified)
     */
    addQuestion(fieldType = 'short') {
        const field = this.createDefaultField(fieldType);
        this.fields.push(field);
        this.updateFieldOrders();
        
        // Create question element for management
        const question = new QuestionElement(fieldType, field);
        this.questions.set(field.id, question);
        
        this.triggerCallback('onFieldAdd', field);
        this.triggerCallback('onFieldsChange', this.fields);
        
        return field;
    }

    /**
     * Edit a question (simplified modal approach)
     */
    editQuestion(questionId) {
        const field = this.fields.find(f => f.id === questionId);
        if (field) {
            this.showQuestionModal(field);
        }
    }

    /**
     * Copy a question
     */
    copyQuestion(questionId) {
        const field = this.fields.find(f => f.id === questionId);
        if (field) {
            const copy = { ...field, id: this.generateId(), field_key: field.field_key + '_copy' };
            this.fields.push(copy);
            this.updateFieldOrders();
            
            this.triggerCallback('onFieldAdd', copy);
            this.triggerCallback('onFieldsChange', this.fields);
        }
    }

    /**
     * Remove a question
     */
    removeQuestion(questionId) {
        const index = this.fields.findIndex(f => f.id === questionId);
        if (index !== -1) {
            const removed = this.fields.splice(index, 1)[0];
            this.questions.delete(questionId);
            this.updateFieldOrders();
            
            this.triggerCallback('onFieldRemove', removed);
            this.triggerCallback('onFieldsChange', this.fields);
        }
    }

    /**
     * Show simple add question modal
     */
    showAddQuestionModal() {
        this.showQuestionModal();
    }

    /**
     * Show question configuration modal
     */
    showQuestionModal(existingField = null) {
        logger.log('showQuestionModal called', existingField);
        
        // Close any existing workflow modals first
        const overlay = document.getElementById('overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
        document.querySelectorAll('.modal').forEach(modal => {
            if (modal.id !== 'questionModal') {
                modal.style.display = 'none';
            }
        });
        
        const isEdit = !!existingField;
        const modalTitle = isEdit ? 'Edit Question' : 'Add New Question';
        
        logger.log('About to render question form');
        
        let questionFormHTML;
        try {
            questionFormHTML = this.renderQuestionForm(existingField);
            logger.log('Question form rendered successfully');
        } catch (error) {
            logger.error('Error rendering question form:', error);
            questionFormHTML = '<p>Error loading form. Please try again.</p>';
        }
        
        const modalHTML = `
            <div id="questionModal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0, 0, 0, 0.5); z-index: 1100 !important; display: flex !important; align-items: center; justify-content: center;">
                <div style="z-index: 1101; background: white; padding: 20px; border-radius: 8px; max-width: 500px; width: 90%; position: relative; box-shadow: 0 10px 25px rgba(0,0,0,0.15);">
                    <div class="modal-header">
                        <h3>${modalTitle}</h3>
                        <button type="button" class="btn-close" onclick="formBuilder.closeQuestionModal()" style="position: absolute; top: 10px; right: 15px; background: none; border: none; font-size: 24px; cursor: pointer;">×</button>
                    </div>
                    <div class="modal-body">
                        ${questionFormHTML}
                    </div>
                    <div class="modal-footer" style="margin-top: 20px; text-align: right;">
                        <button type="button" class="btn btn-secondary" onclick="formBuilder.closeQuestionModal()" style="margin-right: 10px; padding: 8px 16px; background: #ccc; border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="formBuilder.saveQuestionFromModal()" style="padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            ${isEdit ? 'Update' : 'Add'} Question
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        const existingModal = document.getElementById('questionModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        logger.log('Modal added to DOM');
        const addedModal = document.getElementById('questionModal');
        logger.log('Modal element found:', addedModal);
        
        if (addedModal) {
            const computedStyle = window.getComputedStyle(addedModal);
            logger.log('Modal computed styles:');
            logger.log('display:', computedStyle.display);
            logger.log('z-index:', computedStyle.zIndex);
            logger.log('position:', computedStyle.position);
            logger.log('visibility:', computedStyle.visibility);
            logger.log('opacity:', computedStyle.opacity);
        }
        
        // Add escape key handler
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                this.closeQuestionModal();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
        
        // Add click-outside handler
        const modal = document.getElementById('questionModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeQuestionModal();
                }
            });
        }
        
        // Store current field if editing
        this._currentEditingField = existingField;
        
        // Initialize smart dropdown mappings if editing a smart dropdown
        if (existingField && existingField.field_type === 'smart_dropdown') {
            this._currentSmartDropdownMappings = existingField.field_options?.mappings || [];
        } else {
            this._currentSmartDropdownMappings = [];
        }
    }

    /**
     * Close question modal
     */
    closeQuestionModal() {
        const modal = document.getElementById('questionModal');
        if (modal) {
            modal.remove();
        }
        
        // Also clear any workflow builder overlays
        const overlay = document.getElementById('overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
        
        this._currentEditingField = null;
    }

    /**
     * Render enhanced form builder interface
     */
    renderEnhancedInterface(containerId = 'formBuilderContainer') {
        return `
            <div id="${containerId}" class="form-builder-enhanced">
                <div class="form-builder-header">
                    <h3>Form Questions</h3>
                    <button type="button" class="btn btn-primary" onclick="formBuilder.showAddQuestionModal()">
                        + Add Question
                    </button>
                </div>
                
                <div class="form-builder-content">
                    <div id="formFieldsList" class="form-fields-list">
                        ${this.renderFieldsList()}
                    </div>
                    
                    ${this.fields.length === 0 ? `
                        <div class="empty-state">
                            <div class="empty-state-icon">Form</div>
                            <h4>No questions yet</h4>
                            <p>Click "Add Question" to start building your form</p>
                            <button type="button" class="btn btn-primary" onclick="formBuilder.showAddQuestionModal()">
                                Add Your First Question
                            </button>
                        </div>
                    ` : ''}
                </div>
                
                <div class="form-builder-footer">
                    <div class="field-count">
                        ${this.fields.length} question${this.fields.length !== 1 ? 's' : ''} in this form
                    </div>
                </div>
            </div>
            
            <style>
                .form-builder-enhanced {
                    border: 1px solid var(--color-border-light);
                    border-radius: var(--border-radius-lg);
                    background-color: var(--color-bg-primary);
                    overflow: hidden;
                }
                
                .form-builder-header {
                    padding: var(--spacing-md) var(--spacing-lg);
                    background-color: var(--color-bg-secondary);
                    border-bottom: 1px solid var(--color-border-light);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                
                .form-builder-header h3 {
                    margin: 0;
                    font-size: var(--font-size-lg);
                    font-weight: var(--font-weight-semibold);
                    color: var(--color-text-primary);
                }
                
                .form-builder-content {
                    padding: var(--spacing-lg);
                    min-height: 200px;
                }
                
                .form-fields-list {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                }
                
                .empty-state {
                    text-align: center;
                    padding: var(--spacing-xl) var(--spacing-lg);
                    color: var(--color-text-secondary);
                }
                
                .empty-state-icon {
                    font-size: 48px;
                    margin-bottom: var(--spacing-md);
                }
                
                .empty-state h4 {
                    margin: 0 0 var(--spacing-sm) 0;
                    color: var(--color-text-primary);
                    font-weight: var(--font-weight-semibold);
                }
                
                .empty-state p {
                    margin: 0 0 var(--spacing-lg) 0;
                    font-size: var(--font-size-sm);
                }
                
                .form-builder-footer {
                    padding: var(--spacing-sm) var(--spacing-lg);
                    background-color: var(--color-bg-tertiary);
                    border-top: 1px solid var(--color-border-light);
                    font-size: var(--font-size-sm);
                    color: var(--color-text-secondary);
                    text-align: center;
                }
                
                .field-count {
                    font-weight: var(--font-weight-medium);
                }
            </style>
        `;
    }

    /**
     * Render simplified fields list for enhanced interface
     */
    renderFieldsList() {
        if (this.fields.length === 0) {
            return '';
        }
        
        return this.fields
            .sort((a, b) => a.field_order - b.field_order)
            .map(field => this.renderFieldSummary(field))
            .join('');
    }

    /**
     * Render field summary card
     */
    renderFieldSummary(field) {
        const fieldConfig = this.fieldTypes[field.field_type];
        const icon = fieldConfig?.icon || 'T';
        
        return `
            <div class="field-summary-card" data-field-id="${field.id}">
                <div class="field-summary-header">
                    <div class="field-summary-info">
                        <span class="field-summary-icon">${icon}</span>
                        <div class="field-summary-text">
                            <h4 class="field-summary-title">${field.field_label}</h4>
                            <p class="field-summary-meta">${fieldConfig?.label || field.field_type} ${field.is_required ? '• Required' : ''}</p>
                        </div>
                    </div>
                    <div class="field-summary-actions">
                        <button type="button" class="btn-icon btn-edit" onclick="formBuilder.editQuestion('${field.id}')" title="Edit Question">E</button>
                        <button type="button" class="btn-icon btn-copy" onclick="formBuilder.copyQuestion('${field.id}')" title="Copy Question">C</button>
                        <button type="button" class="btn-icon btn-remove" onclick="formBuilder.removeQuestion('${field.id}')" title="Remove Question">D</button>
                    </div>
                </div>
                
                ${field.help_text ? `<div class="field-summary-help">${field.help_text}</div>` : ''}
                
                <div class="field-summary-preview">
                    ${this.renderFieldPreview(field)}
                </div>
            </div>
        `;
    }

    /**
     * Render field preview for summary
     */
    renderFieldPreview(field) {
        switch (field.field_type) {
            case 'short':
                return `<input type="text" placeholder="${field.placeholder || 'Enter text...'}" disabled class="preview-input">`;
            
            case 'long':
                return `<textarea placeholder="${field.placeholder || 'Enter text...'}" rows="2" disabled class="preview-input"></textarea>`;
            
            case 'multiple':
                if (!field.field_options?.options) return '<p class="preview-note">No options configured</p>';
                const options = field.field_options.options.slice(0, 3); // Show first 3 options
                return `
                    <div class="preview-options">
                        ${options.map(option => `<label class="preview-option"><input type="radio" disabled> ${option}</label>`).join('')}
                        ${field.field_options.options.length > 3 ? `<p class="preview-more">... and ${field.field_options.options.length - 3} more</p>` : ''}
                    </div>
                `;
            
            case 'dropdown':
                if (!field.field_options?.options) return '<p class="preview-note">No options configured</p>';
                return `
                    <select disabled class="preview-input">
                        <option>${field.placeholder || 'Select an option...'}</option>
                    </select>
                `;
            
            case 'smart_dropdown':
                return `<select disabled class="preview-input"><option>Dynamic options (${field.field_options?.source_field || 'Not configured'})</option></select>`;
            
            case 'date':
                return `<input type="date" disabled class="preview-input">`;
            
            case 'file':
                return `<div class="preview-file"><input type="file" disabled class="preview-input"> <span class="file-note">File upload</span></div>`;
            
            case 'number':
                return `<input type="number" placeholder="${field.placeholder || '0'}" disabled class="preview-input">`;
            
            case 'email':
                return `<input type="email" placeholder="${field.placeholder || 'email@example.com'}" disabled class="preview-input">`;
            
            default:
                return `<input type="text" placeholder="Unknown field type" disabled class="preview-input">`;
        }
    }


    /**
     * Refresh the fields list display
     */
    refreshFieldsList() {
        const container = document.getElementById('formFieldsList');
        if (container) {
            container.innerHTML = this.renderFieldsList();
        }
        
        // Update footer count
        const footer = document.querySelector('.field-count');
        if (footer) {
            footer.textContent = `${this.fields.length} question${this.fields.length !== 1 ? 's' : ''} in this form`;
        }
        
        // Show/hide empty state
        const content = document.querySelector('.form-builder-content');
        const emptyState = content?.querySelector('.empty-state');
        
        if (this.fields.length === 0 && !emptyState) {
            const fieldsContainer = content.querySelector('.form-fields-list');
            if (fieldsContainer) {
                fieldsContainer.insertAdjacentHTML('afterend', `
                    <div class="empty-state">
                        <div class="empty-state-icon">📝</div>
                        <h4>No questions yet</h4>
                        <p>Click "Add Question" to start building your form</p>
                        <button type="button" class="btn btn-primary" onclick="formBuilder.showAddQuestionModal()">
                            Add Your First Question
                        </button>
                    </div>
                `);
            }
        } else if (this.fields.length > 0 && emptyState) {
            emptyState.remove();
        }
    }

    /**
     * Render simple overview of questions for workflow builder modals
     */
    renderSimpleOverview() {
        if (this.fields.length === 0) {
            return `
                <div class="simple-overview-empty">
                    <p class="empty-message">No questions configured yet</p>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="formBuilder.showAddQuestionModal()">
                        + Add Question
                    </button>
                </div>
            `;
        }

        return `
            <div class="simple-questions-overview">
                ${this.fields
                    .sort((a, b) => a.field_order - b.field_order)
                    .map(field => this.renderSimpleQuestionCard(field))
                    .join('')}
                <div class="add-question-row">
                    <button type="button" class="btn btn-secondary btn-sm" onclick="formBuilder.showAddQuestionModal()">
                        + Add Question
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Render simple question card for overview
     */
    renderSimpleQuestionCard(field) {
        const fieldConfig = this.fieldTypes[field.field_type];
        const icon = fieldConfig?.icon || 'T';
        
        return `
            <div class="simple-question-card" data-field-id="${field.id}">
                <div class="simple-question-info">
                    <span class="simple-question-icon">${icon}</span>
                    <div class="simple-question-details">
                        <h5 class="simple-question-title">${field.field_label}</h5>
                        <p class="simple-question-type">${fieldConfig?.label || field.field_type}${field.is_required ? ' • Required' : ''}</p>
                    </div>
                </div>
                <div class="simple-question-actions">
                    <button type="button" class="btn-simple-action btn-edit" onclick="formBuilder.editFieldInOverlay('${field.id}')" title="Edit Question">E</button>
                    <button type="button" class="btn-simple-action btn-copy" onclick="formBuilder.copyFieldSimple('${field.id}')" title="Copy Question">C</button>
                    <button type="button" class="btn-simple-action btn-remove" onclick="formBuilder.removeFieldSimple('${field.id}')" title="Remove Question">D</button>
                </div>
            </div>
        `;
    }

    /**
     * Edit field in the enhanced overlay
     */
    editFieldInOverlay(fieldId) {
        // Load the existing field into the overlay
        this.questionOverlay.loadFromFormBuilder(this);
        this.questionOverlay.showOverlay();
        
        // Open the specific field's configuration panel
        setTimeout(() => {
            this.questionOverlay.openConfigPanel(fieldId);
        }, 100);
    }

    /**
     * Copy field (simple version)
     */
    copyFieldSimple(fieldId) {
        const field = this.fields.find(f => f.id === fieldId);
        if (!field) return;

        const copiedField = this.createFieldCopy(field);
        this.fields.push(copiedField);
        this.updateFieldOrders();
        
        this.triggerCallback('onFieldAdd', copiedField);
        this.triggerCallback('onFieldsChange', this.fields);
        
        // Refresh the simple overview
        this.refreshSimpleOverview();
    }

    /**
     * Remove field (simple version)
     */
    removeFieldSimple(fieldId) {
        if (!confirm('Are you sure you want to remove this question?')) return;

        const index = this.fields.findIndex(f => f.id === fieldId);
        if (index === -1) return;

        const removedField = this.fields.splice(index, 1)[0];
        this.updateFieldOrders();
        
        this.triggerCallback('onFieldRemove', removedField);
        this.triggerCallback('onFieldsChange', this.fields);
        
        // Refresh the simple overview
        this.refreshSimpleOverview();
    }

    /**
     * Refresh simple overview display
     */
    refreshSimpleOverview() {
        const containers = document.querySelectorAll('.simple-questions-overview, .simple-overview-empty');
        containers.forEach(container => {
            const parent = container.parentElement;
            if (parent) {
                const newContent = this.renderSimpleOverview();
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = newContent;
                parent.replaceChild(tempDiv.firstElementChild, container);
            }
        });
    }

    /**
     * Create a copy of an existing field
     */
    createFieldCopy(originalField) {
        const copy = JSON.parse(JSON.stringify(originalField));
        copy.id = this.generateFieldId();
        copy.field_key = this.generateUniqueFieldKey(originalField.field_key);
        copy.field_label = originalField.field_label + ' (Copy)';
        copy.field_order = this.fields.length + 1;
        
        return copy;
    }

    /**
     * Generate unique field ID
     */
    generateFieldId() {
        return 'field_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // =====================================================
    // UTILITY METHODS
    // =====================================================

    /**
     * Set callback functions
     */
    setCallbacks(callbacks) {
        Object.assign(this.callbacks, callbacks);
    }

    /**
     * Trigger callback if exists
     */
    triggerCallback(name, ...args) {
        if (this.callbacks[name] && typeof this.callbacks[name] === 'function') {
            this.callbacks[name](...args);
        }
    }

    /**
     * Get field by ID
     */
    getField(fieldId) {
        return this.fields.find(f => f.id === fieldId);
    }

    /**
     * Get all fields
     */
    getAllFields() {
        return [...this.fields];
    }

    /**
     * Clear all fields
     */
    clearFields() {
        this.fields = [];
        this.triggerCallback('onFieldsChange', this.fields);
    }

    /**
     * Set fields
     */
    setFields(fields) {
        this.fields = [...fields];
        this.updateFieldOrders();
        this.triggerCallback('onFieldsChange', this.fields);
    }

    /**
     * Export fields as JSON
     */
    exportFields() {
        return JSON.stringify(this.fields, null, 2);
    }

    /**
     * Import fields from JSON
     */
    importFields(jsonString) {
        try {
            const fields = JSON.parse(jsonString);
            if (!Array.isArray(fields)) {
                throw new Error('Invalid format: expected array of fields');
            }
            
            this.setFields(fields);
            return true;
        } catch (error) {
            throw new Error(`Failed to import fields: ${error.message}`);
        }
    }

    /**
     * Render question form for modal
     */
    renderQuestionForm(existingField = null) {
        const field = existingField || {};
        const fieldType = field.field_type || 'short';
        
        return `
            <div class="question-form">
                <div class="form-group">
                    <label for="questionType">Question Type</label>
                    <select id="questionType" ${existingField ? 'disabled' : ''}>
                        ${Object.entries(this.fieldTypes).map(([type, config]) => `
                            <option value="${type}" ${type === fieldType ? 'selected' : ''}>
                                ${config.icon} ${config.label}
                            </option>
                        `).join('')}
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="questionLabel">Question Text *</label>
                    <input type="text" id="questionLabel" value="${field.field_label || ''}" 
                           placeholder="What would you like to ask?" required>
                </div>
                
                <div class="form-group">
                    <label for="questionPlaceholder">Placeholder Text</label>
                    <input type="text" id="questionPlaceholder" value="${field.placeholder || ''}" 
                           placeholder="Hint text for the user">
                </div>
                
                <div class="form-group">
                    <label for="questionHelp">Help Text</label>
                    <textarea id="questionHelp" rows="2" placeholder="Additional instructions">${field.help_text || ''}</textarea>
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
     * Render type-specific options
     */
    renderTypeSpecificOptions(fieldType, field = {}) {
        const fieldTypeConfig = this.fieldTypes[fieldType];
        
        if (fieldTypeConfig?.hasOptions) {
            const options = field.field_options?.options || ['Option 1', 'Option 2', 'Option 3'];
            return `
                <div class="form-group">
                    <label for="questionOptions">Answer Options (one per line) *</label>
                    <textarea id="questionOptions" rows="4" placeholder="Option 1&#10;Option 2&#10;Option 3" required>${options.join('\n')}</textarea>
                    <small class="help-text">Users will choose from these options</small>
                </div>
            `;
        }
        
        if (fieldTypeConfig?.hasMappings && fieldType === 'smart_dropdown') {
            const sourceType = field.field_options?.source_type || 'field';
            const sourceField = field.field_options?.source_field || '';
            const sourceTableId = field.field_options?.source_table_id || '';
            const mappings = field.field_options?.mappings || [];
            
            return `
                <div class="form-group">
                    <label for="smartDropdownSourceType">Source Type</label>
                    <select id="smartDropdownSourceType" onchange="formBuilder.updateSmartDropdownSourceType(this.value)">
                        <option value="field" ${sourceType === 'field' ? 'selected' : ''}>Other Form Field</option>
                        <option value="custom_table" ${sourceType === 'custom_table' ? 'selected' : ''}>Custom Table</option>
                    </select>
                    <small class="help-text">Where should the options come from?</small>
                </div>
                
                ${sourceType === 'field' ? `
                    <div class="form-group">
                        <label for="smartDropdownSourceField">Source Field</label>
                        <select id="smartDropdownSourceField">
                            <option value="">Select a field...</option>
                            <option value="${sourceField}" selected>${sourceField}</option>
                        </select>
                        <small class="help-text">Options will depend on the selected value in this field</small>
                    </div>
                    
                    <div id="smartDropdownMappings" class="form-group">
                        <label>Dynamic Mappings</label>
                        <div class="mappings-container">
                            ${mappings.map((mapping, index) => this.renderSmartDropdownMapping(mapping, index)).join('')}
                        </div>
                        <button type="button" class="btn btn-secondary btn-sm" onclick="formBuilder.addSmartDropdownMapping()">+ Add Mapping</button>
                        <small class="help-text">Define which options to show based on the source field value</small>
                    </div>
                ` : `
                    <div class="form-group">
                        <label for="smartDropdownSourceTable">Source Custom Table</label>
                        <select id="smartDropdownSourceTable">
                            <option value="">Select a custom table...</option>
                            <option value="${sourceTableId}" selected>Current Table (${sourceTableId})</option>
                        </select>
                        <small class="help-text">Options will be loaded from this custom table</small>
                    </div>
                `}
            `;
        }
        
        return '';
    }

    /**
     * Render smart dropdown mapping
     */
    renderSmartDropdownMapping(mapping, index) {
        return `
            <div class="mapping-rule" data-mapping-index="${index}">
                <div class="mapping-row">
                    <div class="mapping-condition">
                        <label>When source field equals:</label>
                        <input type="text" value="${mapping.when || ''}" 
                               placeholder="Source value"
                               onchange="formBuilder.updateSmartDropdownMapping(${index}, 'when', this.value)">
                    </div>
                    <div class="mapping-options">
                        <label>Show these options:</label>
                        <textarea rows="2" 
                                  placeholder="Option 1&#10;Option 2"
                                  onchange="formBuilder.updateSmartDropdownMapping(${index}, 'options', this.value.split('\\n').filter(o => o.trim()))">${(mapping.options || []).join('\n')}</textarea>
                    </div>
                    <button type="button" class="btn-icon btn-danger" 
                            onclick="formBuilder.removeSmartDropdownMapping(${index})" 
                            title="Remove Mapping">×</button>
                </div>
            </div>
        `;
    }

    /**
     * Update smart dropdown source type
     */
    updateSmartDropdownSourceType(sourceType) {
        const typeSpecificOptions = document.getElementById('typeSpecificOptions');
        if (typeSpecificOptions) {
            const currentField = this._currentEditingField || {};
            currentField.field_options = currentField.field_options || {};
            currentField.field_options.source_type = sourceType;
            
            const newOptions = this.renderTypeSpecificOptions('smart_dropdown', currentField);
            typeSpecificOptions.innerHTML = newOptions;
        }
    }

    /**
     * Add smart dropdown mapping
     */
    addSmartDropdownMapping() {
        if (!this._currentSmartDropdownMappings) {
            this._currentSmartDropdownMappings = [];
        }
        
        this._currentSmartDropdownMappings.push({
            when: '',
            options: ['Option 1', 'Option 2']
        });
        
        this.refreshSmartDropdownMappings();
    }

    /**
     * Update smart dropdown mapping
     */
    updateSmartDropdownMapping(index, field, value) {
        if (!this._currentSmartDropdownMappings) {
            this._currentSmartDropdownMappings = [];
        }
        
        if (this._currentSmartDropdownMappings[index]) {
            this._currentSmartDropdownMappings[index][field] = value;
        }
    }

    /**
     * Remove smart dropdown mapping
     */
    removeSmartDropdownMapping(index) {
        if (!this._currentSmartDropdownMappings) {
            return;
        }
        
        this._currentSmartDropdownMappings.splice(index, 1);
        this.refreshSmartDropdownMappings();
    }

    /**
     * Refresh smart dropdown mappings display
     */
    refreshSmartDropdownMappings() {
        const container = document.querySelector('.mappings-container');
        if (container && this._currentSmartDropdownMappings) {
            container.innerHTML = this._currentSmartDropdownMappings
                .map((mapping, index) => this.renderSmartDropdownMapping(mapping, index))
                .join('');
        }
    }

    /**
     * Save question from modal
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
            
            // Handle options for dropdown/multiple choice
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
            }
            
            // Handle smart dropdown configuration
            if (fieldType === 'smart_dropdown') {
                const sourceType = document.getElementById('smartDropdownSourceType')?.value || 'field';
                fieldOptions.source_type = sourceType;
                
                if (sourceType === 'field') {
                    const sourceField = document.getElementById('smartDropdownSourceField')?.value;
                    if (sourceField) {
                        fieldOptions.source_field = sourceField;
                    }
                    fieldOptions.mappings = this._currentSmartDropdownMappings || [];
                } else if (sourceType === 'custom_table') {
                    const sourceTableId = document.getElementById('smartDropdownSourceTable')?.value;
                    if (sourceTableId) {
                        fieldOptions.source_table_id = sourceTableId;
                    }
                }
            }
            
            if (this._currentEditingField) {
                // Update existing field
                this.updateField(this._currentEditingField.id, {
                    field_label: fieldLabel,
                    placeholder: placeholder,
                    help_text: helpText,
                    is_required: isRequired,
                    field_options: fieldOptions
                });
            } else {
                // Add new field
                const field = this.createDefaultField(fieldType);
                Object.assign(field, {
                    field_label: fieldLabel,
                    placeholder: placeholder,
                    help_text: helpText,
                    is_required: isRequired,
                    field_options: fieldOptions
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
}

export default FormBuilder;