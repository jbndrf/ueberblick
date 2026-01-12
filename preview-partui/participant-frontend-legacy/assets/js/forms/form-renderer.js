/**
 * Dynamic Form Renderer
 * 
 * Generates forms dynamically from database form_fields configuration
 * Supports all field types with validation and prefill capabilities
 * 
 * Integrates with:
 * - @core/supabase.js for database operations
 * - @workflow/workflow-engine.js for instance data
 * - @core/event-manager.js for component lifecycle
 */

import { supabaseClient } from '../core/supabase.js';
import eventManager from '../core/event-manager.js';
import DebugLogger from '../core/debug-logger.js';

export class FormRenderer {
    constructor() {
        this.currentForm = null;
        this.currentFields = [];
        this.fieldValidators = new Map();
        this.fieldElements = new Map();
        this.validationErrors = new Map();
        this.formData = new Map();
        // Custom table selectors initialized on render
        this.logger = new DebugLogger('FormRenderer');
        
        // Multi-page form state
        this.currentPage = 1;
        this.totalPages = 1;
        this.pageData = new Map(); // Store data for each page
        this.allPages = new Map(); // Store field data for all pages
        this.isMultiPage = false;
        
        // Field type renderers
        this.fieldRenderers = {
            'short_text': this.renderShortText.bind(this),
            'long_text': this.renderLongText.bind(this),
            'multiple_choice': this.renderMultipleChoice.bind(this),
            'dropdown': this.renderDropdown.bind(this),
            'smart_dropdown': this.renderSmartDropdown.bind(this),
            'custom_table_selector': this.renderCustomTableSelector.bind(this),
            'date': this.renderDate.bind(this),
            'file': this.renderFile.bind(this),
            'number': this.renderNumber.bind(this),
            'email': this.renderEmail.bind(this),
            'signature': this.renderSignature.bind(this)
        };
        
        // Register for cleanup
        eventManager.registerComponent('form-renderer', { 
            destroy: () => this.destroy() 
        });
        
        this.logger.log('Initialized');
    }

    /**
     * Render a form from database configuration
     */
    async renderForm(formId, instanceId = null, container = null, actionId = null) {
        try {
            this.logger.log('Rendering form:', formId, 'for instance:', instanceId, 'action:', actionId);

            // Reset form state if this is a different instance than the current one
            if (instanceId && instanceId !== this.currentInstanceId) {
                this.logger.log('Different instance detected, resetting form state');
                this.resetForNewInstance(instanceId);
            } else if (instanceId) {
                this.currentInstanceId = instanceId;
            }
            
            // Fetch form configuration and check for multi-page
            const formConfig = await this.getFormConfiguration(formId);
            const allFields = await this.getFormFields(formId); // Get all fields first
            const pages = await this.getFormPages(formId);
            
            // Initialize multi-page state
            this.setupMultiPageForm(pages, allFields);
            
            // Get fields for current page
            let fields = await this.getFormFields(formId, this.currentPage);
            this.logger.log(`Loading fields for page ${this.currentPage}:`, fields.map(f => ({id: f.id, label: f.field_label, page: f.page})));
            
            if (!formConfig || !fields.length) {
                throw new Error('Form configuration not found or no fields defined');
            }
            
            this.currentForm = formConfig;
            this.currentInstanceId = instanceId;
            
            // Load prefill data with action context
            const prefillData = await this.loadPrefillData(instanceId, actionId);
            
            // Only filter for edit actions (move forward actions show all fields since they can only be executed once)
            if (prefillData.isEditAction && instanceId) {
                // For multi-page forms, don't filter during normal rendering - let the page navigation handle it
                if (!this.isMultiPage) {
                    fields = await this.filterNewFieldsOnly(fields, instanceId);
                    this.logger.log('Filtered to new fields only for edit action:', fields.length, 'remaining fields');
                    
                    // If no new fields remain, show appropriate message
                    if (fields.length === 0) {
                        if (container) {
                            container.innerHTML = `
                                <div class="no-new-fields-message">
                                    <div class="message-content">
                                        <i class="fas fa-check-circle"></i>
                                        <h4>No New Data Required</h4>
                                        <p>All required fields for this action have already been collected. You can proceed with this action without filling additional data.</p>
                                    </div>
                                </div>
                            `;
                        }
                        return '<div class="no-new-fields">No new fields to collect</div>';
                    }
                }
            }
            
            this.currentFields = fields;
            
            // Add context info for action-specific forms
            if (actionId) {
                // Determine if this is a move forward action
                const { data: action } = await supabaseClient.client
                    .from('workflow_actions')
                    .select('from_stage_id, to_stage_id')
                    .eq('id', actionId)
                    .single();
                
                if (action) {
                    const isMoveForwardAction = action.from_stage_id !== action.to_stage_id;
                    if (isMoveForwardAction) {
                        this.currentForm.contextNote = `Complete the ${fields.length} field${fields.length !== 1 ? 's' : ''} below to progress to the next stage`;
                    } else {
                        this.currentForm.contextNote = 'Edit the selected fields below';
                    }
                }
            }
            
            // Generate form HTML with multi-page support
            const formHTML = this.generateFormStructure(fields, prefillData);
            
            // If container provided, render directly
            if (container) {
                container.innerHTML = formHTML;
                this.setupFormInteractions(container);
                this.setupPageNavigation(container);
            }
            
            this.logger.log('Form rendered successfully with', fields.length, 'fields');
            return formHTML;
            
        } catch (error) {
            this.logger.error('Failed to render form:', error);
            throw new Error(`Form rendering failed: ${error.message}`);
        }
    }

    /**
     * Render edit form with specific editable fields
     */
    async renderEditForm(editableFields, instanceId = null, container = null, actionId = null) {
        try {
            this.logger.log('Rendering edit form with editable fields:', editableFields, 'for instance:', instanceId, 'action:', actionId);
            
            if (!editableFields || editableFields.length === 0) {
                throw new Error('No editable fields provided');
            }
            
            // Use the first field's form_id to get form configuration
            const formId = editableFields[0].form_id;
            const formConfig = await this.getFormConfiguration(formId);
            
            if (!formConfig) {
                throw new Error('Form configuration not found');
            }
            
            // Setup multi-page support for edit forms
            const allFields = await this.getFormFields(formId); // Get all fields first
            const pages = await this.getFormPages(formId);
            this.setupMultiPageForm(pages, allFields);
            
            this.currentForm = formConfig;
            this.currentFields = editableFields;
            this.currentInstanceId = instanceId;
            
            // Load prefill data with action context
            const prefillData = await this.loadPrefillData(instanceId, actionId);
            
            // Mark all fields as editable since these are specifically editable fields
            // Use 'id' property since that's what the field objects contain
            prefillData.editableFields = editableFields.map(field => field.id);
            
            // Generate form HTML with multi-page support
            const formHTML = this.generateFormStructure(editableFields, prefillData);
            
            // If container provided, render directly
            if (container) {
                container.innerHTML = formHTML;
                this.setupFormInteractions(container);
                this.setupPageNavigation(container);
            }
            
            this.logger.log('Edit form rendered successfully with', editableFields.length, 'editable fields');
            return formHTML;
            
        } catch (error) {
            this.logger.error('Failed to render edit form:', error);
            throw new Error(`Edit form rendering failed: ${error.message}`);
        }
    }

    /**
     * Get form configuration from database
     */
    async getFormConfiguration(formId) {
        try {
            const { data, error } = await supabaseClient.client
                .from('forms')
                .select('*')
                .eq('id', formId)
                .single();
            
            if (error) {
                throw error;
            }
            
            return data;
        } catch (error) {
            this.logger.error('Failed to get form configuration:', error);
            throw error;
        }
    }

    /**
     * Get form fields from database with multi-page support
     */
    async getFormFields(formId, page = null) {
        try {
            let query = supabaseClient.client
                .from('form_fields')
                .select('*')
                .eq('form_id', formId)
                .order('page')
                .order('field_order');
            
            // If specific page requested, filter by page
            if (page !== null) {
                query = query.eq('page', page);
            }
            
            const { data, error } = await query;
            
            if (error) {
                throw error;
            }
            
            return data || [];
        } catch (error) {
            this.logger.error('Failed to get form fields:', error);
            throw error;
        }
    }

    /**
     * Get all pages for a form
     */
    async getFormPages(formId) {
        try {
            const { data, error } = await supabaseClient.client
                .from('form_fields')
                .select('page, page_title')
                .eq('form_id', formId)
                .order('page');
            
            if (error) {
                throw error;
            }
            
            // Get distinct pages
            const pagesMap = new Map();
            if (data) {
                data.forEach(field => {
                    if (!pagesMap.has(field.page)) {
                        pagesMap.set(field.page, {
                            page: field.page,
                            title: field.page_title || `Page ${field.page}`
                        });
                    }
                });
            }
            
            return Array.from(pagesMap.values()).sort((a, b) => a.page - b.page);
        } catch (error) {
            this.logger.error('Failed to get form pages:', error);
            return [{ page: 1, title: 'Page 1' }]; // Fallback
        }
    }

    /**
     * Load prefill data from multiple sources
     */
    async loadPrefillData(instanceId, actionId = null) {
        const sources = {
            instanceData: new Map(),
            participantData: new Map(),
            customTables: new Map(),
            editableFields: null,
            isEditAction: false,
            isMoveForwardAction: false
        };
        
        try {
            // Determine action type first
            if (actionId) {
                try {
                    const { data: action, error: actionError } = await supabaseClient.client
                        .from('workflow_actions')
                        .select('from_stage_id, to_stage_id, form_id, conditions')
                        .eq('id', actionId)
                        .single();
                    
                    if (!actionError && action) {
                        sources.isEditAction = action.from_stage_id === action.to_stage_id;
                        sources.isMoveForwardAction = action.from_stage_id !== action.to_stage_id;
                        
                        if (sources.isEditAction) {
                            // For edit actions, get specific editable fields
                            const { data: editableFields, error: editError } = await supabaseClient.client
                                .from('action_editable_fields')
                                .select('field_id')
                                .eq('action_id', actionId);
                            
                            if (!editError && editableFields) {
                                sources.editableFields = editableFields.map(field => field.field_id);
                                this.logger.log('Edit action - loaded editable field IDs:', sources.editableFields);
                            } else {
                                this.logger.warn('No editable fields found for edit action');
                                sources.editableFields = [];
                            }
                        } else if (sources.isMoveForwardAction) {
                            // For move forward actions, don't make any fields editable from previous data
                            sources.editableFields = [];
                            this.logger.log('Move forward action - no previous fields will be editable');
                        }
                    }
                } catch (error) {
                    this.logger.warn('Failed to load action context:', error);
                }
            }
            
            // Load previous stage data from instance (for prefill reference only)
            if (instanceId && !sources.isMoveForwardAction) {
                // Only load instance data for edit actions or when no action is specified
                const { data: instanceData, error } = await supabaseClient.client
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
                
                if (!error && instanceData) {
                    instanceData.forEach(item => {
                        let value = item.field_value;
                        
                        // Parse value based on field type
                        switch (item.field_type) {
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
                        
                        // Use field_id as the key for instance data
                        const fieldId = item.field_id;
                        
                        sources.instanceData.set(fieldId, {
                            value: value,
                            type: item.field_type,
                            created_at: item.created_at,
                            field_id: item.field_id
                        });
                    });
                }
            }
            
            // Load participant data for prefill
            const participantData = await this.getCurrentParticipantData();
            if (participantData) {
                // Map participant data to common field keys
                sources.participantData.set('participant_name', participantData.name);
                sources.participantData.set('participant_email', participantData.email);
                sources.participantData.set('participant_id', participantData.participant_id);
                sources.participantData.set('name', participantData.name); // Common field name
                sources.participantData.set('email', participantData.email); // Common field name
                sources.participantData.set('user_name', participantData.name); // Alternative field name
                sources.participantData.set('user_email', participantData.email); // Alternative field name
            }
            
            this.logger.log('Loaded prefill data:', {
                instanceFields: sources.instanceData.size,
                participantFields: sources.participantData.size,
                editableFields: sources.editableFields ? sources.editableFields.length : 'all'
            });
            
        } catch (error) {
            this.logger.error('Failed to load prefill data:', error);
        }
        
        return sources;
    }

    /**
     * Filter form fields to show only those that haven't been collected yet
     */
    async filterNewFieldsOnly(fields, instanceId) {
        try {
            // Get all field keys that already have data for this instance
            const { data: existingData, error } = await supabaseClient.client
                .from('instance_data')
                .select('field_id')
                .eq('instance_id', instanceId);

            if (error) {
                this.logger.error('Failed to get existing data for filtering:', error);
                return fields; // Return all fields if we can't determine existing ones
            }

            // Create set of field IDs that already have data
            const existingFieldIds = new Set();
            if (existingData) {
                existingData.forEach(item => {
                    existingFieldIds.add(item.field_id);
                });
            }

            // Filter out fields that already have data
            const newFields = fields.filter(field => {
                const hasExistingData = existingFieldIds.has(field.id);
                if (hasExistingData) {
                    this.logger.log('Filtering out field with existing data:', field.id);
                }
                return !hasExistingData;
            });

            this.logger.log('Field filtering results:', {
                totalFields: fields.length,
                existingFieldIds: Array.from(existingFieldIds),
                newFields: newFields.length,
                filteredFields: newFields.map(f => f.id)
            });

            return newFields;
        } catch (error) {
            this.logger.error('Failed to filter new fields:', error);
            return fields; // Return all fields if filtering fails
        }
    }

    /**
     * Get current participant data
     */
    async getCurrentParticipantData() {
        try {
            // Get participant data from auth system
            const participantAuthModule = await import('../auth/participant-auth.js');
            const participantAuth = participantAuthModule.default;
            
            if (participantAuth && typeof participantAuth.getAuthStatus === 'function') {
                const authStatus = participantAuth.getAuthStatus();
                
                if (authStatus.participant) {
                    return {
                        name: authStatus.participant.name || '',
                        email: authStatus.participant.email || '',
                        participant_id: authStatus.participant.id || ''
                    };
                }
            }
            
            return {
                name: '',
                email: '',
                participant_id: ''
            };
        } catch (error) {
            this.logger.error('Failed to get participant data:', error);
            return {
                name: '',
                email: '',
                participant_id: ''
            };
        }
    }

    /**
     * Generate complete form HTML structure
     */
    generateFormStructure(fields, prefillData) {
        const formParts = [];
        
        // Form header with page indicator
        formParts.push(`
            <div class="dynamic-form" data-form-id="${this.currentForm.id}" data-is-multipage="${this.isMultiPage}">
                <div class="form-header">
                    <h3 class="form-title">${this.currentForm.name}</h3>
                    ${this.currentForm.contextNote ? `<p class="form-context-note"><i class="fas fa-info-circle"></i> ${this.currentForm.contextNote}</p>` : ''}
                    ${this.isMultiPage ? this.generatePageIndicator() : ''}
                </div>
                <div class="form-body">
        `);
        
        // Render each field
        fields.forEach((field, index) => {
            const fieldHTML = this.renderField(field, prefillData, index);
            formParts.push(fieldHTML);
        });
        
        // Form footer with navigation
        formParts.push(`
                </div>
                <div class="form-validation-summary" id="validation-summary" style="display: none;">
                    <div class="validation-message">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>Please fix the following errors:</span>
                        <ul class="validation-errors" id="validation-errors"></ul>
                    </div>
                </div>
                ${this.isMultiPage ? this.generatePageNavigation() : ''}
            </div>
        `);
        
        return formParts.join('\n');
    }

    /**
     * Render individual field based on type
     */
    renderField(field, prefillData, index) {
        // Get prefill value
        const prefillValue = this.getPrefillValue(field.id, prefillData);
        
        // Check if field is editable (for edit actions)
        const isEditable = this.isFieldEditable(field.id, prefillData.editableFields);
        
        // Get field renderer
        const renderer = this.fieldRenderers[field.field_type];
        if (!renderer) {
            this.logger.warn('Unknown field type:', field.field_type);
            return this.renderUnsupportedField(field);
        }
        
        // Generate field container with field_id only
        const fieldHTML = `
            <div class="form-field ${!isEditable ? 'field-readonly' : ''}" data-field-id="${field.id}" data-field-type="${field.field_type}">
                <div class="field-label-container">
                    <label class="field-label" for="field-${field.id}">
                        ${field.field_label}
                        ${field.is_required && isEditable ? '<span class="required-indicator">*</span>' : ''}
                        ${!isEditable ? '<span class="readonly-indicator">(Read Only)</span>' : ''}
                    </label>
                    ${field.help_text ? `<div class="field-help-text">${field.help_text}</div>` : ''}
                </div>
                <div class="field-input-container">
                    ${renderer(field, prefillValue, isEditable)}
                </div>
                <div class="field-validation-message" id="validation-${field.id}" style="display: none;"></div>
            </div>
        `;
        
        return fieldHTML;
    }

    /**
     * Check if field is editable based on action context
     */
    isFieldEditable(fieldId, editableFields) {
        // If editableFields is explicitly an empty array, no fields are editable (move forward action)
        if (Array.isArray(editableFields) && editableFields.length === 0) {
            return true; // For move forward actions, all form fields are editable (they're new fields)
        }
        
        // If no editable fields specified, all fields are editable
        if (!editableFields || editableFields === null) {
            return true;
        }
        
        // Check if field is in editable fields array (edit action)
        return editableFields.includes(fieldId);
    }

    /**
     * Get prefill value for field
     */
    getPrefillValue(fieldId, prefillData) {
        // Check page data first (user input takes precedence)
        if (this.pageData && this.pageData.has(fieldId)) {
            const value = this.pageData.get(fieldId);
            this.logger.log(`Using saved page data for field ${fieldId}:`, value);
            return value;
        }
        
        // For move forward actions, don't prefill with instance data to avoid duplicates
        if (prefillData.isMoveForwardAction) {
            // Participant data is still mapped by field names, so we can't use fieldId directly
            // This will be null for move forward actions unless we have common field mappings
            return null;
        }
        
        // For edit actions and regular forms, check instance data first
        if (prefillData.instanceData.has(fieldId)) {
            return prefillData.instanceData.get(fieldId).value;
        }
        
        // For participant data, we'd need the field definition to map field names
        // This is simplified for now - participant data prefill will be handled separately
        return null;
    }

    /**
     * Render short text field
     */
    renderShortText(field, prefillValue, isEditable = true) {
        if (!isEditable) {
            return `
                <div class="form-display-value">
                    ${prefillValue || '<em>No value</em>'}
                </div>
                <input type="hidden" name="${field.id}" value="${prefillValue || ''}" />
            `;
        }
        
        return `
            <input 
                type="text" 
                id="field-${field.id}" 
                name="${field.id}"
                class="form-input text-input"
                placeholder="${field.placeholder || ''}"
                value="${prefillValue || ''}"
                ${field.is_required ? 'required' : ''}
                data-validation='${JSON.stringify(field.validation_rules || {})}'
            />
        `;
    }

    /**
     * Render long text field
     */
    renderLongText(field, prefillValue, isEditable = true) {
        if (!isEditable) {
            return `
                <div class="form-display-value textarea-display">
                    ${prefillValue ? prefillValue.replace(/\n/g, '<br>') : '<em>No value</em>'}
                </div>
                <input type="hidden" name="${field.id}" value="${prefillValue || ''}" />
            `;
        }
        
        return `
            <textarea 
                id="field-${field.id}" 
                name="${field.id}"
                class="form-input textarea-input"
                placeholder="${field.placeholder || ''}"
                rows="4"
                ${field.is_required ? 'required' : ''}
                data-validation='${JSON.stringify(field.validation_rules || {})}'
            >${prefillValue || ''}</textarea>
        `;
    }

    /**
     * Render multiple choice field
     */
    renderMultipleChoice(field, prefillValue, isEditable = true) {
        const options = field.field_options?.options || [];
        // For multiple_choice fields, default to allowing multiple selections (checkboxes)
        // unless explicitly set to false for single selection (radio buttons)
        const allowMultiple = field.field_options?.allow_multiple !== false;
        const inputType = allowMultiple ? 'checkbox' : 'radio';
        
        // Handle prefillValue properly - filter out null/undefined values
        let selectedValues = [];
        if (Array.isArray(prefillValue)) {
            selectedValues = prefillValue.filter(val => val != null && val !== '');
        } else if (prefillValue != null && prefillValue !== '') {
            selectedValues = [prefillValue];
        }
        
        this.logger.log(`Rendering ${inputType} field ${field.id} with prefill:`, prefillValue, 'selectedValues:', selectedValues);
        
        if (!isEditable) {
            const selectedOptions = options.filter(option => {
                const value = typeof option === 'string' ? option : option.value;
                return selectedValues.includes(value);
            });
            const displayValue = selectedOptions.length > 0 
                ? selectedOptions.map(option => typeof option === 'string' ? option : option.label).join(', ')
                : '<em>No selection</em>';
            
            return `
                <div class="form-display-value">
                    ${displayValue}
                </div>
                <input type="hidden" name="${field.id}" value="${JSON.stringify(selectedValues)}" />
            `;
        }
        
        const optionsHTML = options.map((option, index) => {
            // Handle both string options and object options
            let value, label;
            if (typeof option === 'string') {
                value = option;
                label = option;
            } else {
                value = option.value;
                label = option.label;
            }
            
            const isSelected = selectedValues.includes(value);
            return `
                <div class="choice-option">
                    <input 
                        type="${inputType}" 
                        id="field-${field.id}-${index}" 
                        name="${field.id}${allowMultiple ? '[]' : ''}"
                        class="form-input ${inputType}-input"
                        value="${value}"
                        ${isSelected ? 'checked' : ''}
                        ${field.is_required ? 'required' : ''}
                    />
                    <label for="field-${field.id}-${index}" class="choice-label">
                        ${label}
                    </label>
                </div>
            `;
        }).join('');
        
        return `
            <div class="multiple-choice-container" data-allow-multiple="${allowMultiple}">
                ${optionsHTML}
            </div>
        `;
    }

    /**
     * Render dropdown field
     */
    renderDropdown(field, prefillValue, isEditable = true) {
        const options = field.field_options?.options || [];
        
        if (options.length === 0) {
            this.logger.warn('No options found for dropdown:', field.id);
            return `
                <select 
                    id="field-${field.id}" 
                    name="${field.id}"
                    class="form-input select-input"
                    ${field.is_required ? 'required' : ''}
                >
                    <option value="">No options available</option>
                </select>
            `;
        }
        
        if (!isEditable) {
            const selectedOption = options.find(option => {
                const value = typeof option === 'string' ? option : option.value;
                return prefillValue === value;
            });
            const displayValue = selectedOption 
                ? (typeof selectedOption === 'string' ? selectedOption : selectedOption.label)
                : '<em>No selection</em>';
            
            return `
                <div class="form-display-value">
                    ${displayValue}
                </div>
                <input type="hidden" name="${field.id}" value="${prefillValue || ''}" />
            `;
        }
        
        const optionsHTML = options.map(option => {
            // Handle both string options and object options
            let value, label;
            if (typeof option === 'string') {
                value = option;
                label = option;
            } else {
                value = option.value;
                label = option.label;
            }
            
            const isSelected = prefillValue === value;
            return `<option value="${value}" ${isSelected ? 'selected' : ''}>${label}</option>`;
        }).join('');
        
        return `
            <select 
                id="field-${field.id}" 
                name="${field.id}"
                class="form-input select-input"
                ${field.is_required ? 'required' : ''}
            >
                <option value="">Select an option...</option>
                ${optionsHTML}
            </select>
        `;
    }

    /**
     * Render smart dropdown field (loads from custom tables)
     */
    renderSmartDropdown(field, prefillValue, isEditable = true) {
        if (!isEditable) {
            return `
                <div class="form-display-value">
                    ${prefillValue || '<em>No selection</em>'}
                </div>
                <input type="hidden" name="${field.id}" value="${prefillValue || ''}" />
            `;
        }
        
        // Support both custom_table_id and field-based source types
        const fieldOptions = field.field_options || {};
        const customTableId = fieldOptions.custom_table_id || '';
        const sourceType = fieldOptions.source_type || 'table';
        const sourceField = fieldOptions.source_field || '';
        const mappings = JSON.stringify(fieldOptions.mappings || []);
        
        return `
            <select 
                id="field-${field.id}" 
                name="${field.id}"
                class="form-input select-input smart-dropdown"
                ${field.is_required ? 'required' : ''}
                data-custom-table="${customTableId}"
                data-source-type="${sourceType}"
                data-source-field="${sourceField}"
                data-mappings='${mappings}'
            >
                <option value="">Loading options...</option>
            </select>
        `;
    }

    /**
     * Render custom table selector field (loads options from custom table main column)
     */
    renderCustomTableSelector(field, prefillValue, isEditable = true) {
        if (!isEditable) {
            return `
                <div class="form-display-value">
                    ${prefillValue || '<em>No selection</em>'}
                </div>
                <input type="hidden" name="${field.id}" value="${prefillValue || ''}" />
            `;
        }
        
        const fieldOptions = field.field_options || {};
        const tableId = fieldOptions.table_id || '';
        
        if (!tableId) {
            this.logger.warn('No table_id found for custom table selector:', field.id);
            return `
                <select 
                    id="field-${field.id}" 
                    name="${field.id}"
                    class="form-input select-input"
                    ${field.is_required ? 'required' : ''}
                >
                    <option value="">Configuration error - no table selected</option>
                </select>
            `;
        }
        
        return `
            <div class="custom-table-selector-container">
                <input type="text" 
                       id="field-${field.id}" 
                       name="${field.id}"
                       class="form-input custom-table-selector"
                       placeholder="Type to search options..."
                       value="${prefillValue || ''}"
                       ${field.is_required ? 'required' : ''}
                       data-table-id="${tableId}"
                       data-field-id="${field.id}"
                       autocomplete="off" />
                <div class="custom-table-dropdown" id="dropdown-${field.id}" style="display: none;">
                    <!-- Options will be populated here -->
                </div>
            </div>
        `;
    }

    /**
     * Render date field
     */
    renderDate(field, prefillValue, isEditable = true) {
        const options = field.field_options || {};
        const includeTime = options.includeTime === true;
        const defaultToNow = options.defaultToNow === true;
        
        // Determine the input type and format
        const inputType = includeTime ? 'datetime-local' : 'date';
        
        // Handle default value
        let defaultValue = prefillValue || '';
        if (!defaultValue && defaultToNow) {
            const now = new Date();
            if (includeTime) {
                // Format for datetime-local: YYYY-MM-DDTHH:MM
                defaultValue = now.toISOString().slice(0, 16);
            } else {
                // Format for date: YYYY-MM-DD
                defaultValue = now.toISOString().slice(0, 10);
            }
        }
        
        if (!isEditable) {
            let displayValue = '<em>No date</em>';
            if (defaultValue) {
                const date = new Date(defaultValue);
                if (includeTime) {
                    displayValue = date.toLocaleString();
                } else {
                    displayValue = date.toLocaleDateString();
                }
            }
            return `
                <div class="form-display-value">
                    ${displayValue}
                </div>
                <input type="hidden" name="${field.id}" value="${defaultValue}" />
            `;
        }
        
        // Handle min/max dates if specified
        let minMaxAttrs = '';
        if (options.min_date) {
            minMaxAttrs += ` min="${options.min_date}"`;
        }
        if (options.max_date) {
            minMaxAttrs += ` max="${options.max_date}"`;
        }
        
        return `
            <input 
                type="${inputType}" 
                id="field-${field.id}" 
                name="${field.id}"
                class="form-input date-input ${includeTime ? 'datetime-input' : ''}"
                value="${defaultValue}"
                ${field.is_required ? 'required' : ''}
                ${minMaxAttrs}
                data-validation='${JSON.stringify(field.validation_rules || {})}'
                data-include-time="${includeTime}"
                data-default-to-now="${defaultToNow}"
            />
        `;
    }

    /**
     * Render file upload field with image upload support
     */
    renderFile(field, prefillValue, isEditable = true) {
        if (!isEditable) {
            // Handle multiple image paths (array) or single image
            if (prefillValue) {
                // Check if it's an array of paths (multiple images)
                let imagePaths = [];
                if (Array.isArray(prefillValue)) {
                    imagePaths = prefillValue;
                } else if (typeof prefillValue === 'string') {
                    // Try to parse as JSON array first
                    try {
                        const parsed = JSON.parse(prefillValue);
                        if (Array.isArray(parsed)) {
                            imagePaths = parsed;
                        } else {
                            imagePaths = [prefillValue];
                        }
                    } catch (e) {
                        imagePaths = [prefillValue];
                    }
                }
                
                // Filter to only image paths
                const imageFiles = imagePaths.filter(path => 
                    this.isImageFile(path) || this.isStoragePath(path)
                );
                
                if (imageFiles.length > 0) {
                    // Display images in a gallery format
                    const imageElements = imageFiles.map((imagePath, index) => {
                        const uniqueId = `${field.id}_${index}`;
                        // Set initial src to a placeholder or the path itself
                        let initialSrc = imagePath;
                        
                        // If it's a storage path, we'll update the URL after render
                        if (this.isStoragePath(imagePath)) {
                            // Use a data attribute to store the path for later URL resolution
                            setTimeout(async () => {
                                try {
                                    const { imageUploadService } = await import('../services/image-upload-service.js');
                                    const properUrl = imageUploadService.getImageUrl(imagePath);
                                    const imgElement = document.getElementById(uniqueId);
                                    if (imgElement && properUrl) {
                                        imgElement.src = properUrl;
                                        imgElement.style.display = 'block';
                                        // Add error handling for broken images
                                        imgElement.onerror = function() {
                                            this.style.display = 'none';
                                            const errorDiv = document.createElement('div');
                                            errorDiv.className = 'image-error';
                                            errorDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Image not found';
                                            this.parentNode.appendChild(errorDiv);
                                        };
                                    } else if (imgElement && !properUrl) {
                                        // Invalid path - show error immediately
                                        imgElement.style.display = 'none';
                                        const errorDiv = document.createElement('div');
                                        errorDiv.className = 'image-error';
                                        errorDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Invalid image path';
                                        imgElement.parentNode.appendChild(errorDiv);
                                    }
                                } catch (error) {
                                    console.error('Failed to load image URL:', error);
                                    const imgElement = document.getElementById(uniqueId);
                                    if (imgElement) {
                                        imgElement.style.display = 'none';
                                        const errorDiv = document.createElement('div');
                                        errorDiv.className = 'image-error';
                                        errorDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Failed to load image';
                                        imgElement.parentNode.appendChild(errorDiv);
                                    }
                                }
                            }, 10);
                        }
                        
                        return `
                            <div class="readonly-image-item">
                                <img id="${uniqueId}" src="${this.isStoragePath(imagePath) ? '' : initialSrc}" alt="Uploaded image" 
                                     style="max-width: 150px; max-height: 150px; object-fit: cover; border-radius: 4px; margin-bottom: 4px; ${this.isStoragePath(imagePath) ? 'display: none;' : ''}" />
                                <div class="image-filename">${this.getFilenameFromPath(imagePath)}</div>
                            </div>
                        `;
                    }).join('');
                    
                    return `
                        <div class="form-display-value">
                            <div class="readonly-image-gallery">
                                ${imageElements}
                            </div>
                        </div>
                        <input type="hidden" name="${field.id}" value="${Array.isArray(prefillValue) ? JSON.stringify(prefillValue) : prefillValue}" />
                    `;
                } else {
                    // Not an image file, show as text
                    return `
                        <div class="form-display-value">
                            <i class="fas fa-file"></i> ${Array.isArray(prefillValue) ? prefillValue.join(', ') : prefillValue}
                        </div>
                        <input type="hidden" name="${field.id}" value="${Array.isArray(prefillValue) ? JSON.stringify(prefillValue) : prefillValue}" />
                    `;
                }
            } else {
                return `
                    <div class="form-display-value">
                        <em>No file</em>
                    </div>
                    <input type="hidden" name="${field.id}" value="" />
                `;
            }
        }
        
        const accept = field.field_options?.accept || 'image/*';
        const isImageField = accept.includes('image');
        const allowCamera = field.field_options?.allow_camera !== false; // Default to true for image fields
        
        return `
            <div class="file-upload-container" data-field-id="${field.id}">
                <input 
                    type="file" 
                    id="field-${field.id}" 
                    name="${field.id}"
                    class="form-input file-input"
                    ${field.is_required ? 'required' : ''}
                    accept="${accept}"
                    ${field.field_options?.multiple ? 'multiple' : ''}
                    ${isImageField && allowCamera ? 'capture="environment"' : ''}
                />
                ${isImageField && allowCamera ? this.renderMobileImageButtons(field.id) : this.renderDesktopFileButton(field.id, isImageField, field.field_options?.multiple)}
                
                <!-- Upload progress indicator -->
                <div class="upload-progress" style="display: none;">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: 0%;"></div>
                    </div>
                    <span class="progress-text">Uploading...</span>
                </div>
                
                <!-- File preview area -->
                <div class="file-preview-area">
                    ${this.renderExistingFilePreview(field.id, prefillValue)}
                </div>
                
                <!-- Image gallery (similar to BDHI) -->
                <div class="image-gallery" id="gallery-${field.id}"></div>
                
                ${prefillValue && !this.isStoragePath(prefillValue) && !this.isImageFile(prefillValue) ? `<div class="current-file">Current: ${prefillValue}</div>` : ''}
            </div>
        `;
    }

    /**
     * Check if file is an image
     */
    isImageFile(filename) {
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        const ext = filename.toLowerCase().substr(filename.lastIndexOf('.'));
        return imageExtensions.includes(ext);
    }

    /**
     * Check if value is a storage path (project-id/instance-id/filename pattern)
     */
    isStoragePath(value) {
        if (!value || typeof value !== 'string') return false;
        // Storage path pattern: project-id/instance-id/filename.ext or undefined/temp/filename.ext
        const pathParts = value.split('/');
        if (pathParts.length === 3) {
            const filename = pathParts[2];
            // Check if it looks like our generated filename pattern or is an image file
            return this.isImageFile(filename) || filename.includes('_') && this.isImageFile(filename.split('_').pop());
        }
        return false;
    }

    /**
     * Render mobile image capture buttons
     */
    renderMobileImageButtons(fieldId) {
        // Check if we're on a mobile device
        const isMobile = this.isMobileDevice();
        
        if (isMobile) {
            return `
                <div class="mobile-image-buttons">
                    <button type="button" class="image-button camera-btn" data-field-id="${fieldId}" data-capture="camera">
                        <i class="fas fa-camera"></i>
                        <span>Take Photo</span>
                    </button>
                    <button type="button" class="image-button gallery-btn" data-field-id="${fieldId}" data-capture="gallery">
                        <i class="fas fa-images"></i>
                        <span>From Gallery</span>
                    </button>
                </div>
            `;
        } else {
            // On desktop, show traditional file upload
            return `
                <label for="field-${fieldId}" class="file-upload-label">
                    <i class="fas fa-cloud-upload-alt"></i>
                    <span>Choose image...</span>
                </label>
            `;
        }
    }

    /**
     * Check if we're on a mobile device
     */
    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
    }

    /**
     * Render desktop file button
     */
    renderDesktopFileButton(fieldId, isImageField, allowMultiple) {
        return `
            <label for="field-${fieldId}" class="file-upload-label">
                <i class="fas fa-cloud-upload-alt"></i>
                <span>Choose ${isImageField ? 'image' : 'file'}${allowMultiple ? 's' : ''}...</span>
            </label>
        `;
    }

    /**
     * Render existing file preview for edit mode
     */
    renderExistingFilePreview(fieldId, prefillValue) {
        if (!prefillValue) return '';
        
        if (this.isStoragePath(prefillValue) || this.isImageFile(prefillValue)) {
            // For existing images, show preview with remove button
            let imageUrl = prefillValue;
            let filename = prefillValue;
            
            if (this.isStoragePath(prefillValue)) {
                const pathParts = prefillValue.split('/');
                filename = pathParts[2]; // Extract filename from path
                // We'll update the src after component loads
                imageUrl = prefillValue; // Placeholder, will be updated by async call
            }
            
            const imgId = `preview-${fieldId}-${Date.now()}`;
            
            // If this is a storage path, update the URL after render
            if (this.isStoragePath(prefillValue)) {
                setTimeout(async () => {
                    try {
                        const { imageUploadService } = await import('../services/image-upload-service.js');
                        const properUrl = imageUploadService.getImageUrl(prefillValue);
                        const imgElement = document.getElementById(imgId);
                        if (imgElement && properUrl) {
                            imgElement.src = properUrl;
                            imgElement.style.display = 'block'; // Show image once proper URL is set
                            imgElement.onerror = function() {
                                this.style.display = 'none';
                                const errorDiv = document.createElement('div');
                                errorDiv.className = 'image-error';
                                errorDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Image not found';
                                this.parentNode.appendChild(errorDiv);
                            };
                        } else if (imgElement && !properUrl) {
                            // Invalid path - show error immediately
                            imgElement.style.display = 'none';
                            const errorDiv = document.createElement('div');
                            errorDiv.className = 'image-error';
                            errorDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Invalid image path';
                            imgElement.parentNode.appendChild(errorDiv);
                        }
                    } catch (error) {
                        console.error('Failed to load preview image URL:', error);
                    }
                }, 10);
            }
            
            return `
                <div class="file-preview-item existing-file" data-path="${prefillValue}">
                    <img id="${imgId}" src="${this.isStoragePath(prefillValue) ? '' : imageUrl}" alt="Existing image" style="max-width: 150px; max-height: 150px; object-fit: cover; ${this.isStoragePath(prefillValue) ? 'display: none;' : ''}" />
                    <div class="file-name">${filename}</div>
                    <button type="button" class="remove-file-btn" data-path="${prefillValue}">
                        <i class="fas fa-times"></i>
                    </button>
                    <input type="hidden" name="${fieldId}_path" value="${prefillValue}" />
                </div>
            `;
        }
        
        return '';
    }

    /**
     * Render number field
     */
    renderNumber(field, prefillValue, isEditable = true) {
        const min = field.validation_rules?.min;
        const max = field.validation_rules?.max;
        const step = field.field_options?.step || 'any';
        
        if (!isEditable) {
            return `
                <div class="form-display-value">
                    ${prefillValue || '<em>No value</em>'}
                </div>
                <input type="hidden" name="${field.id}" value="${prefillValue || ''}" />
            `;
        }
        
        return `
            <input 
                type="number" 
                id="field-${field.id}" 
                name="${field.id}"
                class="form-input number-input"
                placeholder="${field.placeholder || ''}"
                value="${prefillValue || ''}"
                ${min !== undefined ? `min="${min}"` : ''}
                ${max !== undefined ? `max="${max}"` : ''}
                step="${step}"
                ${field.is_required ? 'required' : ''}
                data-validation='${JSON.stringify(field.validation_rules || {})}'
            />
        `;
    }

    /**
     * Render email field
     */
    renderEmail(field, prefillValue, isEditable = true) {
        if (!isEditable) {
            return `
                <div class="form-display-value">
                    ${prefillValue || '<em>No email</em>'}
                </div>
                <input type="hidden" name="${field.id}" value="${prefillValue || ''}" />
            `;
        }
        
        return `
            <input 
                type="email" 
                id="field-${field.id}" 
                name="${field.id}"
                class="form-input email-input"
                placeholder="${field.placeholder || 'Enter email address'}"
                value="${prefillValue || ''}"
                ${field.is_required ? 'required' : ''}
                data-validation='${JSON.stringify(field.validation_rules || {})}'
            />
        `;
    }

    /**
     * Render signature field
     */
    renderSignature(field, prefillValue, isEditable = true) {
        if (!isEditable) {
            return `
                <div class="form-display-value">
                    ${prefillValue ? '<i class="fas fa-signature"></i> Signature provided' : '<em>No signature</em>'}
                </div>
                <input type="hidden" name="${field.id}" value="${prefillValue || ''}" />
            `;
        }
        
        return `
            <div class="signature-container">
                <canvas 
                    id="field-${field.id}" 
                    class="signature-canvas"
                    width="400" 
                    height="200"
                    data-field-id="${field.id}"
                ></canvas>
                <div class="signature-controls">
                    <button type="button" class="btn-clear-signature" onclick="clearSignature('${field.id}')">
                        Clear
                    </button>
                </div>
                ${prefillValue ? `<div class="current-signature">Signature provided</div>` : ''}
            </div>
        `;
    }

    /**
     * Render unsupported field type
     */
    renderUnsupportedField(field) {
        return `
            <div class="unsupported-field">
                <div class="unsupported-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    Unsupported field type: ${field.field_type}
                </div>
            </div>
        `;
    }

    /**
     * Setup form interactions and validation
     */
    setupFormInteractions(container) {
        // Setup field validation
        this.setupFieldValidation(container);
        
        // Setup conditional logic
        this.setupConditionalLogic(container);
        
        // Setup smart dropdowns
        this.setupSmartDropdowns(container);
        
        // Setup custom table selectors
        this.setupCustomTableSelectors(container);
        
        // Setup signature fields
        this.setupSignatureFields(container);
        
        // Setup file upload handlers
        this.setupFileUploadHandlers(container);
        
        this.logger.log('Form interactions setup complete');
    }

    /**
     * Setup field validation
     */
    setupFieldValidation(container) {
        const fields = container.querySelectorAll('.form-input');
        
        fields.forEach(field => {
            // Real-time validation on input
            eventManager.add(field, 'input', () => {
                this.validateField(field);
            }, { component: 'form-renderer', description: 'Field validation' });
            
            // Validation on blur
            eventManager.add(field, 'blur', () => {
                this.validateField(field);
            }, { component: 'form-renderer', description: 'Field blur validation' });
        });
    }

    /**
     * Validate individual field
     */
    validateField(fieldElement) {
        const fieldId = fieldElement.name; // This should be UUID field_id
        const fieldContainer = fieldElement.closest('.form-field');
        const validationContainer = fieldContainer.querySelector('.field-validation-message');
        
        // Clear previous validation
        this.clearFieldValidation(fieldId);
        
        // Basic required validation
        if (fieldElement.hasAttribute('required') && !fieldElement.value.trim()) {
            this.showFieldValidation(fieldId, 'This field is required');
            return false;
        }
        
        // Type-specific validation
        const validationRules = fieldElement.dataset.validation ? 
            JSON.parse(fieldElement.dataset.validation) : {};
        
        const isValid = this.runValidationRules(fieldElement, validationRules);
        
        return isValid;
    }

    /**
     * Run validation rules on field
     */
    runValidationRules(fieldElement, rules) {
        const value = fieldElement.value;
        const fieldId = fieldElement.name; // UUID field_id
        
        // Min length validation
        if (rules.minLength && value.length < rules.minLength) {
            this.showFieldValidation(fieldId, `Minimum ${rules.minLength} characters required`);
            return false;
        }
        
        // Max length validation
        if (rules.maxLength && value.length > rules.maxLength) {
            this.showFieldValidation(fieldId, `Maximum ${rules.maxLength} characters allowed`);
            return false;
        }
        
        // Pattern validation
        if (rules.pattern && value && !new RegExp(rules.pattern).test(value)) {
            this.showFieldValidation(fieldId, rules.patternMessage || 'Invalid format');
            return false;
        }
        
        // Email validation (additional to HTML5)
        if (fieldElement.type === 'email' && value && !this.isValidEmail(value)) {
            this.showFieldValidation(fieldId, 'Please enter a valid email address');
            return false;
        }
        
        return true;
    }

    /**
     * Validate email format
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Show field validation error
     */
    showFieldValidation(fieldId, message) {
        const fieldContainer = document.querySelector(`[data-field-id="${fieldId}"]`);
        const validationContainer = fieldContainer?.querySelector('.field-validation-message');
        
        if (validationContainer) {
            validationContainer.innerHTML = `
                <i class="fas fa-exclamation-circle"></i>
                <span>${message}</span>
            `;
            validationContainer.style.display = 'block';
            fieldContainer.classList.add('field-error');
        }
        
        this.validationErrors.set(fieldId, message);
    }

    /**
     * Clear field validation
     */
    clearFieldValidation(fieldId) {
        const fieldContainer = document.querySelector(`[data-field-id="${fieldId}"]`);
        const validationContainer = fieldContainer?.querySelector('.field-validation-message');
        
        if (validationContainer) {
            validationContainer.style.display = 'none';
            fieldContainer.classList.remove('field-error');
        }
        
        this.validationErrors.delete(fieldId);
    }

    /**
     * Setup conditional logic for fields
     */
    setupConditionalLogic(container) {
        // Implementation would go here for field conditional logic
        // This would show/hide fields based on other field values
        this.logger.log('Conditional logic setup (placeholder)');
    }

    /**
     * Setup smart dropdowns
     */
    setupSmartDropdowns(container) {
        const smartDropdowns = container.querySelectorAll('.smart-dropdown');
        
        smartDropdowns.forEach(dropdown => {
            this.loadSmartDropdownOptions(dropdown);
            
            // Setup field dependency listeners for field-based smart dropdowns
            const sourceType = dropdown.dataset.sourceType;
            const sourceField = dropdown.dataset.sourceField;
            
            if (sourceType === 'field' && sourceField) {
                let sourceFieldElements = container.querySelectorAll(`[name="${sourceField}"]`);
                
                // Fallback: if source field not found by exact ID, find checkbox/radio fields
                if (!sourceFieldElements || sourceFieldElements.length === 0) {
                    // Find the first checkbox or radio group in the form
                    const allCheckboxRadio = container.querySelectorAll('input[type="checkbox"], input[type="radio"]');
                    if (allCheckboxRadio.length > 0) {
                        // Group by name to find the field group
                        const fieldGroups = new Map();
                        allCheckboxRadio.forEach(input => {
                            if (!fieldGroups.has(input.name)) {
                                fieldGroups.set(input.name, []);
                            }
                            fieldGroups.get(input.name).push(input);
                        });
                        
                        // Use the first group as fallback
                        const firstGroupName = fieldGroups.keys().next().value;
                        if (firstGroupName) {
                            sourceFieldElements = fieldGroups.get(firstGroupName);
                            this.logger.log('Using fallback field group for smart dropdown:', firstGroupName);
                        }
                    }
                }
                
                // Add change listeners to all elements in the source field group
                if (sourceFieldElements && sourceFieldElements.length > 0) {
                    sourceFieldElements.forEach(element => {
                        eventManager.add(element, 'change', () => {
                            this.logger.log('Source field changed, updating smart dropdown options');
                            this.loadSmartDropdownOptions(dropdown);
                        }, { 
                            component: 'form-renderer', 
                            description: `Smart dropdown dependency for ${dropdown.name || dropdown.id}` 
                        });
                    });
                }
            }
        });
    }

    /**
     * Load options for smart dropdown from custom tables or field mappings
     */
    async loadSmartDropdownOptions(dropdown) {
        const sourceType = dropdown.dataset.sourceType || 'table';
        const customTableId = dropdown.dataset.customTable;
        
        if (sourceType === 'field') {
            await this.loadFieldBasedSmartDropdownOptions(dropdown);
        } else if (customTableId) {
            await this.loadCustomTableSmartDropdownOptions(dropdown, customTableId);
        } else {
            dropdown.innerHTML = `<option value="">No table specified</option>`;
        }
    }
    
    /**
     * Load options for field-based smart dropdown using mappings
     */
    async loadFieldBasedSmartDropdownOptions(dropdown) {
        try {
            const sourceField = dropdown.dataset.sourceField;
            const mappings = JSON.parse(dropdown.dataset.mappings || '[]');
            
            if (!sourceField) {
                dropdown.innerHTML = `<option value="">No source field specified</option>`;
                return;
            }
            
            if (!mappings || mappings.length === 0) {
                dropdown.innerHTML = `<option value="">No mappings configured</option>`;
                return;
            }
            
            // Get source field value - check multi-page data first, then current form, then database
            let sourceFieldValue = null;
            
            // First check saved page data for multi-page forms
            if (this.pageData && this.pageData.has(sourceField)) {
                const savedValue = this.pageData.get(sourceField);
                this.logger.log(`Smart dropdown checking pageData for source field ${sourceField}:`, savedValue);
                if (Array.isArray(savedValue) && savedValue.length > 0) {
                    sourceFieldValue = savedValue[0]; // For checkboxes, use first selected value
                    this.logger.log('Found source field value from saved page data (array):', sourceField, '=', sourceFieldValue);
                } else if (savedValue && !Array.isArray(savedValue)) {
                    sourceFieldValue = savedValue;
                    this.logger.log('Found source field value from saved page data:', sourceField, '=', sourceFieldValue);
                }
            } else {
                this.logger.log(`Smart dropdown: source field ${sourceField} not found in pageData:`, this.pageData ? Array.from(this.pageData.keys()) : 'pageData is null');
                this.logger.error(`Smart dropdown configuration error: source_field '${sourceField}' does not exist. Please check the field_options.source_field configuration in the database.`);
            }
            
            // If not found in page data, try to get value from current form
            if (!sourceFieldValue && sourceField) {
                const formContainer = dropdown.closest('.dynamic-form') || dropdown.closest('form');
                
                // First try exact field ID match
                let sourceFieldElements = formContainer?.querySelectorAll(`[name="${sourceField}"]`);
                
                // Fallback: if source field not found by exact ID, find checkbox/radio groups
                if (!sourceFieldElements || sourceFieldElements.length === 0) {
                    const allInputs = formContainer?.querySelectorAll('input[type="checkbox"], input[type="radio"]');
                    if (allInputs && allInputs.length > 0) {
                        // Group by name and take the first group
                        const fieldGroups = new Map();
                        allInputs.forEach(input => {
                            if (!fieldGroups.has(input.name)) {
                                fieldGroups.set(input.name, []);
                            }
                            fieldGroups.get(input.name).push(input);
                        });
                        
                        const firstGroupName = fieldGroups.keys().next().value;
                        if (firstGroupName) {
                            sourceFieldElements = fieldGroups.get(firstGroupName);
                            this.logger.log('Using fallback field group for smart dropdown value reading:', firstGroupName);
                        }
                    }
                }
                
                // Get the current selected value from the source field group
                if (sourceFieldElements && sourceFieldElements.length > 0) {
                    const firstElement = sourceFieldElements[0];
                    
                    if (firstElement.type === 'checkbox') {
                        // For checkboxes, get the first checked value
                        const checkedBox = Array.from(sourceFieldElements).find(el => el.checked);
                        if (checkedBox) {
                            sourceFieldValue = checkedBox.value;
                            this.logger.log('Found source field value from checked checkbox:', sourceFieldValue);
                        }
                    } else if (firstElement.type === 'radio') {
                        // For radios, get the checked value
                        const checkedRadio = Array.from(sourceFieldElements).find(el => el.checked);
                        if (checkedRadio) {
                            sourceFieldValue = checkedRadio.value;
                            this.logger.log('Found source field value from checked radio:', sourceFieldValue);
                        }
                    } else {
                        // For other input types, use the value directly
                        if (firstElement.value) {
                            sourceFieldValue = firstElement.value;
                            this.logger.log('Found source field value from input:', sourceFieldValue);
                        }
                    }
                }
            }
            
            // If not found in current form and we have an instance, check database using UUID reference
            if (!sourceFieldValue && this.currentInstanceId && sourceField) {
                // Always fallback to database for source field values, even during move forward actions
                // This is needed for smart dropdowns to work properly with field dependencies
                const { data: instanceData } = await supabaseClient.client
                    .from('instance_data')
                    .select('field_value')
                    .eq('instance_id', this.currentInstanceId)
                    .eq('field_id', sourceField)
                    .order('created_at', { ascending: false })
                    .limit(1);
                    
                if (instanceData && instanceData.length > 0) {
                    sourceFieldValue = instanceData[0].field_value;
                    this.logger.log('Found source field value from database using field_id UUID:', sourceField, '=', sourceFieldValue);
                }
            }
            
            // Find matching mapping
            const matchingMapping = mappings.find(mapping => mapping.when === sourceFieldValue);
            
            let optionsHTML = '<option value="">Select an option...</option>';
            
            if (matchingMapping && matchingMapping.options) {
                // Add context information showing which source value triggered these options
                if (sourceFieldValue) {
                    optionsHTML = `<option value="" disabled>Because your answer was "${sourceFieldValue}":</option>`;
                    optionsHTML += '<option value="">Select an option...</option>';
                }
                
                matchingMapping.options.forEach(option => {
                    optionsHTML += `<option value="${option}">${option}</option>`;
                });
                this.logger.log('Smart dropdown options loaded from field mapping:', matchingMapping.options.length, 'options for value:', sourceFieldValue);
            } else {
                if (sourceFieldValue) {
                    optionsHTML += `<option value="" disabled>Because your answer was "${sourceFieldValue}", no options are available</option>`;
                } else {
                    optionsHTML += '<option value="">No options for current selection</option>';
                }
                this.logger.log('No matching mapping found for source field value:', sourceFieldValue, 'available mappings:', mappings);
            }
            
            dropdown.innerHTML = optionsHTML;
            
            // Restore previously selected value from pageData if it exists
            this.restoreSmartDropdownValue(dropdown);
            
        } catch (error) {
            this.logger.error('Failed to load field-based smart dropdown options:', error);
            dropdown.innerHTML = `<option value="">Error loading options</option>`;
        }
    }
    
    /**
     * Load options for custom table based smart dropdown
     */
    async loadCustomTableSmartDropdownOptions(dropdown, customTableId) {
        try {
            // Get custom table info
            const { data: customTable, error: tableError } = await supabaseClient.client
                .from('custom_tables')
                .select('table_name, main_column, display_name')
                .eq('id', customTableId)
                .single();
            
            if (tableError || !customTable) {
                throw new Error('Custom table not found');
            }
            
            // Load data from custom_table_data
            const { data: tableData, error: dataError } = await supabaseClient.client
                .from('custom_table_data')
                .select('data')
                .eq('table_id', customTableId);
            
            if (dataError) {
                throw new Error(`Failed to load table data: ${dataError.message}`);
            }
            
            // Generate options from table data
            let optionsHTML = '<option value="">Select an option...</option>';
            
            if (tableData && tableData.length > 0) {
                tableData.forEach(row => {
                    const data = row.data;
                    const value = data[customTable.main_column] || 'Unknown';
                    const label = data[customTable.main_column] || 'Unknown';
                    
                    optionsHTML += `<option value="${value}">${label}</option>`;
                });
            } else {
                optionsHTML += '<option value="">No data available</option>';
            }
            
            dropdown.innerHTML = optionsHTML;
            
            // Restore previously selected value from pageData if it exists
            this.restoreSmartDropdownValue(dropdown);
            
            this.logger.log('Smart dropdown options loaded:', tableData?.length || 0, 'items from', customTable.display_name);
            
        } catch (error) {
            this.logger.error('Failed to load custom table smart dropdown options:', error);
            dropdown.innerHTML = `<option value="">Error loading options</option>`;
        }
    }

    /**
     * Restore smart dropdown value from pageData
     */
    restoreSmartDropdownValue(dropdown) {
        if (!dropdown || !this.pageData) return;
        
        // Get the field ID from the dropdown name attribute
        const fieldId = dropdown.name;
        if (!fieldId) return;
        
        // Check if we have saved data for this field
        if (this.pageData.has(fieldId)) {
            const savedValue = this.pageData.get(fieldId);
            
            // Restore the value if it exists in the options
            if (savedValue) {
                dropdown.value = savedValue;
                this.logger.log(`Restored smart dropdown value for field ${fieldId}:`, savedValue);
                
                // If the value wasn't found in options, log a warning
                if (dropdown.value !== savedValue) {
                    this.logger.warn(`Saved value "${savedValue}" not found in dropdown options for field ${fieldId}`);
                }
            }
        }
    }

    /**
     * Setup custom table selectors
     */
    setupCustomTableSelectors(container) {
        const customTableSelectors = container.querySelectorAll('.custom-table-selector');
        
        customTableSelectors.forEach(input => {
            this.initializeCustomTableSelector(input);
        });
    }

    /**
     * Initialize custom table selector with search functionality
     */
    async initializeCustomTableSelector(input) {
        try {
            const tableId = input.dataset.tableId;
            const fieldId = input.dataset.fieldId;
            
            if (!tableId) {
                this.logger.warn('No table ID found for custom table selector:', input.id);
                return;
            }

            this.logger.log('Initializing custom table selector for table:', tableId);

            // Get table information and data
            const tableData = await supabaseClient.getCustomTableData(tableId);
            const tableInfo = await supabaseClient.getCustomTable(tableId);
            
            if (!tableInfo || !tableInfo.main_column) {
                this.logger.warn('Table info not found or missing main column:', tableId);
                input.placeholder = 'Table configuration error';
                input.disabled = true;
                return;
            }

            const mainColumn = tableInfo.main_column;
            
            // Extract options from custom table data
            const options = tableData
                .map(row => row.row_data && row.row_data[mainColumn])
                .filter(value => value != null && value !== '')
                .filter((value, index, arr) => arr.indexOf(value) === index) // Remove duplicates
                .sort();

            // Update placeholder
            input.placeholder = `Type to search ${tableInfo.display_name || 'options'}...`;
            
            // Get dropdown container
            const dropdown = document.getElementById(`dropdown-${fieldId}`);
            if (!dropdown) {
                this.logger.warn('Dropdown container not found for field:', fieldId);
                return;
            }

            // Store options for filtering
            input._customTableOptions = options;
            input._customTableDropdown = dropdown;
            
            // Setup event listeners
            this.setupCustomTableEvents(input, dropdown, options);
            
            this.logger.log(`Initialized custom table selector with ${options.length} options:`, options);

        } catch (error) {
            this.logger.error('Failed to initialize custom table selector:', error);
            input.placeholder = 'Error loading options';
            input.disabled = true;
        }
    }

    /**
     * Setup events for custom table selector
     */
    setupCustomTableEvents(input, dropdown, options) {
        // Show dropdown on focus and expand bottom sheet
        eventManager.add(input, 'focus', async () => {
            this.showCustomTableDropdown(input, dropdown, options);
            
            // Expand bottom sheet on mobile when custom table selector is focused
            const bottomSheet = window.bottomSheet || (await import('../ui/bottom-sheet.js')).bottomSheet;
            if (bottomSheet && bottomSheet.state && bottomSheet.state.isMobile && bottomSheet.state.isOpen && !bottomSheet.state.isExpanded) {
                bottomSheet.expand();
                this.logger.log('Expanded bottom sheet for custom table selector focus');
            }
        }, { component: 'form-renderer', description: 'Custom table focus' });

        // Filter options on input
        eventManager.add(input, 'input', () => {
            this.filterCustomTableOptions(input, dropdown, options);
        }, { component: 'form-renderer', description: 'Custom table input' });

        // Hide dropdown when clicking outside
        eventManager.add(document, 'click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        }, { component: 'form-renderer', description: 'Custom table outside click' });
    }

    /**
     * Show custom table dropdown with all options
     */
    showCustomTableDropdown(input, dropdown, options) {
        const filteredOptions = options.filter(option => 
            option.toLowerCase().includes(input.value.toLowerCase())
        );
        
        this.renderCustomTableOptions(dropdown, filteredOptions, input);
        dropdown.style.display = 'block';
    }

    /**
     * Filter custom table options based on input
     */
    filterCustomTableOptions(input, dropdown, options) {
        const query = input.value.toLowerCase();
        const filteredOptions = options.filter(option => 
            option.toLowerCase().includes(query)
        );
        
        this.renderCustomTableOptions(dropdown, filteredOptions, input);
        dropdown.style.display = filteredOptions.length > 0 ? 'block' : 'none';
    }

    /**
     * Render custom table options in dropdown
     */
    renderCustomTableOptions(dropdown, options, input) {
        if (options.length === 0) {
            dropdown.innerHTML = '<div class="dropdown-item no-options">No matching options</div>';
            return;
        }

        const optionsHTML = options.map(option => 
            `<div class="dropdown-item" data-value="${option}">${option}</div>`
        ).join('');
        
        dropdown.innerHTML = optionsHTML;
        
        // Add click listeners to options
        dropdown.querySelectorAll('.dropdown-item').forEach(item => {
            if (!item.classList.contains('no-options')) {
                item.addEventListener('click', () => {
                    input.value = item.dataset.value;
                    dropdown.style.display = 'none';
                    
                    // Trigger change event
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                });
            }
        });
    }

    /**
     * Setup signature fields
     */
    setupSignatureFields(container) {
        const signatureCanvases = container.querySelectorAll('.signature-canvas');
        
        signatureCanvases.forEach(canvas => {
            this.initializeSignatureCanvas(canvas);
        });
    }

    /**
     * Initialize signature canvas
     */
    initializeSignatureCanvas(canvas) {
        // Basic signature canvas setup
        const ctx = canvas.getContext('2d');
        let isDrawing = false;
        
        canvas.addEventListener('mousedown', () => isDrawing = true);
        canvas.addEventListener('mouseup', () => isDrawing = false);
        canvas.addEventListener('mousemove', (e) => {
            if (!isDrawing) return;
            
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            ctx.lineTo(x, y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x, y);
        });
        
        // Clear signature function
        window.clearSignature = (fieldKey) => {
            const canvas = document.getElementById(`field-${fieldKey}`);
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        };
    }

    /**
     * Setup file upload interactions
     */
    setupFileUploadHandlers(container) {
        const fileInputs = container.querySelectorAll('.file-input');
        
        // First, handle existing files and update image URLs for storage paths
        this.setupExistingFileHandlers(container);
        
        // Setup mobile image capture buttons
        this.setupMobileImageButtons(container);
        
        fileInputs.forEach(input => {
            eventManager.add(input, 'change', async (event) => {
                const files = event.target.files;
                if (!files || files.length === 0) return;
                
                const fieldId = input.name;
                const uploadContainer = input.closest('.file-upload-container');
                
                // Handle multiple files for gallery preview (similar to BDHI)
                await this.handleFileSelection(files, fieldId, uploadContainer);
            }, { component: 'form-renderer', description: 'File upload handler' });
        });
    }

    /**
     * Handle file selection (similar to BDHI implementation)
     */
    async handleFileSelection(files, fieldId, uploadContainer) {
        const galleryContainer = uploadContainer.querySelector(`#gallery-${fieldId}`);
        const progressEl = uploadContainer.querySelector('.upload-progress');
        
        // Initialize gallery data if not exists
        if (!this.galleryData) {
            this.galleryData = new Map();
        }
        
        if (!this.galleryData.has(fieldId)) {
            this.galleryData.set(fieldId, []);
        }
        
        const currentFiles = this.galleryData.get(fieldId);
        
        // Check file limit (max 5 files, similar to BDHI)
        if (currentFiles.length + files.length > 5) {
            alert('You can upload maximum 5 images');
            return;
        }
        
        try {
            progressEl.style.display = 'block';
            
            // Import upload service (with cache busting)
            const { imageUploadService } = await import(`../services/image-upload-service.js?v=${Date.now()}`);
            
            // Process each file
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                
                // Validate file
                if (!imageUploadService.validateFile(file)) {
                    console.warn(`Invalid file skipped: ${file.name}`);
                    continue;
                }
                
                // Create unique ID for this file
                const fileId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                
                // Add to gallery data immediately for preview
                const fileData = {
                    id: fileId,
                    file: file,
                    name: file.name,
                    size: file.size,
                    uploaded: false,
                    uploading: true,
                    uploadResult: null
                };
                
                currentFiles.push(fileData);
                
                // Re-render gallery to show preview
                this.renderImageGallery(fieldId, uploadContainer);
                
                try {
                    // Upload in background
                    const instanceId = this.currentInstanceId; // Can be null for initial forms
                    const uploadResult = await imageUploadService.uploadImage(file, instanceId, fieldId);
                    
                    // Update file data with upload result
                    fileData.uploaded = true;
                    fileData.uploading = false;
                    fileData.uploadResult = uploadResult;
                    
                    // Re-render gallery to update status
                    this.renderImageGallery(fieldId, uploadContainer);
                    
                } catch (error) {
                    console.error(`Upload failed for ${file.name}:`, error);
                    // Remove failed upload from gallery
                    const index = currentFiles.findIndex(f => f.id === fileId);
                    if (index > -1) {
                        currentFiles.splice(index, 1);
                        this.renderImageGallery(fieldId, uploadContainer);
                    }
                }
            }
            
        } catch (error) {
            console.error('File selection handling failed:', error);
        } finally {
            progressEl.style.display = 'none';
        }
    }

    /**
     * Render image gallery (similar to BDHI photo-grid)
     */
    renderImageGallery(fieldId, uploadContainer) {
        const galleryContainer = uploadContainer.querySelector(`#gallery-${fieldId}`);
        if (!galleryContainer || !this.galleryData.has(fieldId)) return;
        
        const files = this.galleryData.get(fieldId);
        galleryContainer.innerHTML = '';
        
        // Update hidden input with uploaded file paths
        this.updateFileHiddenInput(fieldId, uploadContainer, files);
        
        files.forEach(fileData => {
            const fileDiv = document.createElement('div');
            fileDiv.className = 'image-thumbnail';
            fileDiv.dataset.fileId = fileData.id;
            
            // Create file reader for preview
            const reader = new FileReader();
            reader.onload = (e) => {
                fileDiv.innerHTML = `
                    <div class="thumbnail-container">
                        <img src="${e.target.result}" alt="${fileData.name}" />
                        ${fileData.uploading ? '<div class="upload-indicator"><i class="fas fa-spinner fa-spin"></i></div>' : ''}
                        ${fileData.uploaded ? '<div class="upload-success"><i class="fas fa-check"></i></div>' : ''}
                        <div class="remove-thumbnail" data-file-id="${fileData.id}">
                            <i class="fas fa-times"></i>
                        </div>
                    </div>
                    <div class="file-info">
                        <div class="file-name">${fileData.name}</div>
                        <div class="file-size">${this.formatFileSize(fileData.size)}</div>
                    </div>
                `;
                
                // Add remove handler
                const removeBtn = fileDiv.querySelector('.remove-thumbnail');
                eventManager.add(removeBtn, 'click', () => this.removeImageFromGallery(fieldId, fileData.id, uploadContainer), 
                    { component: 'form-renderer', description: 'Remove gallery image' });
            };
            
            reader.readAsDataURL(fileData.file);
            galleryContainer.appendChild(fileDiv);
        });
    }

    /**
     * Remove image from gallery
     */
    async removeImageFromGallery(fieldId, fileId, uploadContainer) {
        if (!this.galleryData.has(fieldId)) return;
        
        const files = this.galleryData.get(fieldId);
        const fileIndex = files.findIndex(f => f.id === fileId);
        
        if (fileIndex === -1) return;
        
        const fileData = files[fileIndex];
        
        try {
            // If file was uploaded, delete from storage
            if (fileData.uploaded && fileData.uploadResult) {
                const { imageUploadService } = await import('../services/image-upload-service.js');
                await imageUploadService.deleteImage(fileData.uploadResult.path);
            }
        } catch (error) {
            console.error('Failed to delete uploaded file:', error);
        }
        
        // Remove from gallery data
        files.splice(fileIndex, 1);
        
        // Re-render gallery
        this.renderImageGallery(fieldId, uploadContainer);
    }

    /**
     * Update hidden input with file paths
     */
    updateFileHiddenInput(fieldId, uploadContainer, files) {
        const uploadedFiles = files.filter(f => f.uploaded && f.uploadResult);
        
        // Store paths in a hidden input for form submission
        let hiddenInput = uploadContainer.querySelector('input[name="' + fieldId + '_paths"]');
        if (!hiddenInput) {
            hiddenInput = document.createElement('input');
            hiddenInput.type = 'hidden';
            hiddenInput.name = fieldId + '_paths';
            uploadContainer.appendChild(hiddenInput);
        }
        
        const paths = uploadedFiles.map(f => f.uploadResult.path);
        hiddenInput.value = JSON.stringify(paths);
    }

    /**
     * Format file size for display
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Extract filename from storage path
     */
    getFilenameFromPath(path) {
        if (!path) return 'Unknown file';
        
        // Handle storage paths like "project-id/instance-id/filename.ext"
        const pathParts = path.split('/');
        if (pathParts.length >= 3) {
            let filename = pathParts[pathParts.length - 1]; // Get last part
            
            // Clean up generated filenames (remove UUID prefix if present)
            if (filename.includes('_')) {
                const parts = filename.split('_');
                if (parts.length >= 2) {
                    // If it looks like "fieldId_timestamp.ext", try to clean it up
                    const lastPart = parts[parts.length - 1];
                    const secondLastPart = parts[parts.length - 2];
                    
                    // If second-to-last part is a timestamp (all digits)
                    if (/^\d+$/.test(secondLastPart)) {
                        // Just return the extension part with a generic name
                        return `image.${lastPart.split('.').pop()}`;
                    }
                }
            }
            
            return filename;
        }
        
        return path; // Fallback to full path
    }

    /**
     * Setup mobile image capture buttons
     */
    setupMobileImageButtons(container) {
        const imageButtons = container.querySelectorAll('.image-button');
        
        imageButtons.forEach(button => {
            eventManager.add(button, 'click', (event) => {
                event.preventDefault();
                
                const fieldId = button.dataset.fieldId;
                const captureType = button.dataset.capture;
                const fileInput = container.querySelector(`#field-${fieldId}`);
                
                if (!fileInput) return;
                
                // Set the appropriate capture attribute based on button clicked
                if (captureType === 'camera') {
                    // For camera capture, use environment camera (rear camera)
                    fileInput.setAttribute('capture', 'environment');
                    fileInput.setAttribute('accept', 'image/*');
                } else if (captureType === 'gallery') {
                    // For gallery, remove capture attribute to allow gallery selection
                    fileInput.removeAttribute('capture');
                    fileInput.setAttribute('accept', 'image/*');
                }
                
                // Trigger the file input
                fileInput.click();
            }, { component: 'form-renderer', description: 'Mobile image capture button' });
        });
    }

    /**
     * Setup handlers for existing files
     */
    setupExistingFileHandlers(container) {
        // Update image URLs for storage paths
        const existingImages = container.querySelectorAll('.existing-file img');
        existingImages.forEach(async (img) => {
            const src = img.getAttribute('src');
            if (this.isStoragePath(src)) {
                try {
                    const { imageUploadService } = await import('../services/image-upload-service.js');
                    const properUrl = imageUploadService.getImageUrl(src);
                    if (properUrl) {
                        img.src = properUrl;
                    } else {
                        // Invalid path - hide image and show error
                        img.style.display = 'none';
                        const errorDiv = document.createElement('div');
                        errorDiv.className = 'image-error';
                        errorDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Invalid image path';
                        img.parentNode.appendChild(errorDiv);
                    }
                } catch (error) {
                    console.error('Failed to load image URL:', error);
                }
            }
        });

        // Handle remove buttons for existing files
        const removeButtons = container.querySelectorAll('.existing-file .remove-file-btn');
        removeButtons.forEach(button => {
            eventManager.add(button, 'click', async () => {
                const storagePath = button.dataset.path;
                const previewItem = button.closest('.file-preview-item');
                const hiddenInput = previewItem.querySelector('input[type="hidden"]');
                
                try {
                    if (this.isStoragePath(storagePath)) {
                        const { imageUploadService } = await import('../services/image-upload-service.js');
                        await imageUploadService.deleteImage(storagePath);
                    }
                    
                    // Remove the preview and clear hidden input
                    previewItem.remove();
                    if (hiddenInput) {
                        hiddenInput.value = '';
                    }
                } catch (error) {
                    console.error('Failed to remove existing file:', error);
                }
            }, { component: 'form-renderer', description: 'Remove existing file' });
        });
    }

    /**
     * Validate entire form
     */
    validateForm(container) {
        const fields = container.querySelectorAll('.form-input');
        let isValid = true;
        
        // Clear all previous validations
        this.validationErrors.clear();
        
        // Validate each field
        fields.forEach(field => {
            if (!this.validateField(field)) {
                isValid = false;
            }
        });
        
        // Show validation summary if errors exist
        this.updateValidationSummary(container);
        
        return isValid;
    }

    /**
     * Validate form with action context (for edit/forward actions)
     */
    async validateFormWithContext(container, instanceId, actionId = null) {
        // First do basic form validation
        const isValid = this.validateForm(container);
        
        if (!isValid) {
            return { isValid: false, errors: Array.from(this.validationErrors.values()) };
        }

        // If action ID provided, check additional action-specific validation
        if (actionId) {
            try {
                // Import workflow engine to check action conditions
                const workflowModule = await import('../workflow/workflow-engine.js');
                const workflowEngine = workflowModule.workflowEngine;
                
                const conditionResult = await workflowEngine.checkActionConditions(instanceId, actionId);
                
                if (!conditionResult.canExecute) {
                    return { 
                        isValid: false, 
                        errors: [conditionResult.message],
                        conditionFailed: true
                    };
                }
            } catch (error) {
                this.logger.error('Failed to check action conditions:', error);
                return { 
                    isValid: false, 
                    errors: ['Failed to validate action conditions'],
                    conditionFailed: true
                };
            }
        }

        return { isValid: true, errors: [] };
    }

    /**
     * Update validation summary
     */
    updateValidationSummary(container) {
        const summaryContainer = container.querySelector('#validation-summary');
        const errorsContainer = container.querySelector('#validation-errors');
        
        if (this.validationErrors.size > 0) {
            const errorItems = Array.from(this.validationErrors.entries())
                .map(([, message]) => `<li>${message}</li>`)
                .join('');
            
            errorsContainer.innerHTML = errorItems;
            summaryContainer.style.display = 'block';
        } else {
            summaryContainer.style.display = 'none';
        }
    }

    /**
     * Get form data
     */
    getFormData(container) {
        this.logger.log('getFormData called for container:', container);
        const formData = new Map();
        const fields = container.querySelectorAll('.form-input');
        
        this.logger.log('Found', fields.length, 'form input fields');
        
        // First pass: identify all field groups for checkboxes/radios
        const fieldGroups = new Map();
        fields.forEach((field) => {
            const fieldId = field.name; // This should be the UUID field_id
            if (field.type === 'checkbox' || field.type === 'radio') {
                const groupName = fieldId.replace('[]', ''); // Remove array notation if present
                if (!fieldGroups.has(groupName)) {
                    fieldGroups.set(groupName, {
                        type: field.type,
                        fields: [],
                        hasChecked: false
                    });
                }
                fieldGroups.get(groupName).fields.push(field);
                if (field.checked) {
                    fieldGroups.get(groupName).hasChecked = true;
                }
            }
        });
        
        // Second pass: process all fields with proper UUID handling
        fields.forEach((field, index) => {
            const fieldId = field.name; // UUID field_id
            let value = field.value;
            
            this.logger.log('Processing field', index + 1, ':', {
                fieldId,
                fieldType: field.type,
                fieldValue: value,
                fieldChecked: field.checked,
                fieldClassName: field.className,
                fieldName: field.name
            });
            
            // Handle different field types
            if (field.type === 'checkbox') {
                const groupName = fieldId.replace('[]', ''); // Remove array notation
                
                // Initialize array for this field group if not exists
                if (!formData.has(groupName)) {
                    formData.set(groupName, []);
                }
                
                // Add checked values to array
                if (field.checked) {
                    formData.get(groupName).push(value);
                    this.logger.log('Added checkbox value:', groupName, '=', value, 'checked:', field.checked);
                } else {
                    this.logger.log('Checkbox not checked:', groupName, '=', value, 'checked:', field.checked);
                }
                
                // Ensure field exists even if no checkboxes are checked
                // This prevents validation errors for unchecked required checkbox groups
                
            } else if (field.type === 'radio') {
                this.logger.log('Radio field found:', {
                    fieldId,
                    value,
                    checked: field.checked,
                    name: field.name
                });
                
                if (field.checked) {
                    formData.set(fieldId, value);
                    this.logger.log('Added radio value:', fieldId, '=', value);
                }
                // Note: For radio buttons, we don't set empty values as multiple radios
                // in a group share the same field_id, only the checked one should be set
                
            } else if (field.type === 'file') {
                // Handle file uploads - check for multiple files (gallery) first
                const uploadContainer = field.closest('.file-upload-container');
                const hiddenPathsInput = uploadContainer?.querySelector('input[name="' + fieldId + '_paths"]');
                
                if (hiddenPathsInput && hiddenPathsInput.value) {
                    // Multiple files from gallery
                    try {
                        const paths = JSON.parse(hiddenPathsInput.value);
                        if (paths && paths.length > 0) {
                            formData.set(fieldId, paths.length === 1 ? paths[0] : paths);
                            this.logger.log('Added multiple file storage paths:', fieldId, '=', paths);
                        } else {
                            formData.set(fieldId, null);
                            this.logger.log('Empty paths array for field:', fieldId);
                        }
                    } catch (e) {
                        this.logger.warn('Failed to parse paths JSON:', hiddenPathsInput.value);
                        formData.set(fieldId, null);
                    }
                } else {
                    // Fallback for single file (legacy support)
                    const hiddenPathInput = uploadContainer?.querySelector('input[name="' + fieldId + '_path"]');
                    if (hiddenPathInput && hiddenPathInput.value) {
                        formData.set(fieldId, hiddenPathInput.value);
                        this.logger.log('Added single file storage path:', fieldId, '=', hiddenPathInput.value);
                    } else if (field.files && field.files.length > 0) {
                        // Direct file for non-image uploads
                        formData.set(fieldId, field.files[0]);
                        this.logger.log('Added file value:', fieldId, '=', field.files[0].name);
                    } else {
                        // Set empty file field to null
                        formData.set(fieldId, null);
                        this.logger.log('No file uploaded for field:', fieldId);
                    }
                }
            } else if (field.classList.contains('signature-canvas')) {
                // Handle signature fields
                const canvas = field;
                const dataURL = canvas.toDataURL();
                
                if (this.isCanvasBlank(canvas)) {
                    formData.set(fieldId, null);
                    this.logger.log('Signature canvas is blank:', fieldId);
                } else {
                    formData.set(fieldId, dataURL);
                    this.logger.log('Added signature value:', fieldId, '=', 'data:image/png...');
                }
            } else {
                // Standard input fields (text, number, email, date, select, etc.)
                // Always set the field, even if empty, to ensure consistent form data
                formData.set(fieldId, value || '');
                this.logger.log('Added standard field value:', fieldId, '=', value || '(empty)');
            }
        });
        
        // Handle standalone signature canvases (not caught in form inputs)
        const signatureCanvases = container.querySelectorAll('.signature-canvas');
        this.logger.log('Found', signatureCanvases.length, 'signature canvases');
        
        signatureCanvases.forEach(canvas => {
            const fieldId = canvas.dataset.fieldKey || canvas.dataset.fieldId; // Support both for migration
            if (fieldId && !formData.has(fieldId)) { // Only add if not already processed
                const dataURL = canvas.toDataURL();
                
                if (this.isCanvasBlank(canvas)) {
                    formData.set(fieldId, null);
                    this.logger.log('Signature canvas is blank:', fieldId);
                } else {
                    formData.set(fieldId, dataURL);
                    this.logger.log('Added signature canvas value:', fieldId);
                }
            }
        });
        
        this.logger.log('Final form data Map:', {
            size: formData.size,
            keys: Array.from(formData.keys()),
            values: Array.from(formData.entries())
        });
        
        return formData;
    }
    
    /**
     * Check if canvas is blank (no signature)
     */
    isCanvasBlank(canvas) {
        const blank = document.createElement('canvas');
        blank.width = canvas.width;
        blank.height = canvas.height;
        return canvas.toDataURL() === blank.toDataURL();
    }

    /**
     * Save form data to instance_data table using field_id UUID references
     */
    async saveFormData(instanceId, formData, actionExecutionId = null, formId = null) {
        try {
            const records = [];
            const tempFilesToMove = [];
            
            // Get field information if formId is provided
            const fieldMapping = new Map();
            if (formId) {
                const { data: fields, error: fieldsError } = await supabaseClient.client
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
            
            // Convert formData Map to instance_data records (formData now uses field IDs as keys)
            for (let [fieldId, fieldValue] of formData.entries()) {
                // Skip empty values, but handle arrays properly
                if (fieldValue === null || fieldValue === undefined) {
                    continue;
                }
                
                // For arrays (checkboxes), skip if empty array, otherwise serialize
                if (Array.isArray(fieldValue)) {
                    if (fieldValue.length === 0) {
                        // Skip empty checkbox arrays unless they are explicitly required fields
                        continue;
                    }
                } else if (fieldValue === '') {
                    // Skip empty strings for non-array fields
                    continue;
                }
                
                // Get field info from mapping or default
                const fieldInfo = fieldMapping.get(fieldId) || { id: fieldId, type: 'text' };
                if (!fieldInfo) {
                    this.logger.warn(`Field ${fieldId} not found in form_fields, skipping`);
                    continue;
                }
                
                // Determine field type based on value or use form field type
                let fieldType = fieldInfo.type || 'text';
                if (Array.isArray(fieldValue)) {
                    fieldType = 'array';
                    fieldValue = JSON.stringify(fieldValue);
                } else if (typeof fieldValue === 'boolean') {
                    fieldType = 'boolean';
                    fieldValue = fieldValue.toString();
                } else if (typeof fieldValue === 'number') {
                    fieldType = 'number';
                    fieldValue = fieldValue.toString();
                } else if (fieldId.includes('signature') && fieldValue.startsWith('data:image')) {
                    fieldType = 'signature';
                } else if (fieldValue instanceof File) {
                    fieldType = 'file';
                    // For files, we'd need to handle upload separately
                    fieldValue = fieldValue.name;
                } else if (typeof fieldValue === 'string' && fieldValue.includes('/') && (fieldValue.endsWith('.jpg') || fieldValue.endsWith('.png') || fieldValue.endsWith('.gif') || fieldValue.endsWith('.webp') || fieldValue.endsWith('.jpeg'))) {
                    // This is likely a storage path for an uploaded image
                    fieldType = 'file';
                    
                    // Check if this is a temp file that needs to be moved
                    if (fieldValue.includes('/temp/')) {
                        tempFilesToMove.push(fieldValue);
                    }
                } else if (Array.isArray(fieldValue)) {
                    // Handle array of file paths
                    const filePaths = fieldValue.filter(path => 
                        typeof path === 'string' && path.includes('/') && 
                        (path.endsWith('.jpg') || path.endsWith('.png') || path.endsWith('.gif') || path.endsWith('.webp') || path.endsWith('.jpeg'))
                    );
                    if (filePaths.length > 0) {
                        fieldType = 'file';
                        // Check for temp files in the array
                        filePaths.forEach(path => {
                            if (path.includes('/temp/')) {
                                tempFilesToMove.push(path);
                            }
                        });
                    }
                }
                
                records.push({
                    instance_id: instanceId,
                    field_id: fieldInfo.id,
                    field_value: fieldValue.toString(),
                    field_type: fieldType,
                    form_id: formId,
                    action_execution_id: actionExecutionId,
                    created_at: new Date().toISOString()
                });
            }
            
            if (records.length === 0) {
                this.logger.log('No data to save');
                return { success: true, records: [] };
            }
            
            // Insert records into instance_data with audit trail logging
            const data = await supabaseClient.upsertInstanceDataWithAudit(instanceId, records, {
                activityType: 'form_data_submission',
                activitySummary: `Form data submitted: ${records.length} fields`,
                activityDetails: {
                    formId: this.currentForm?.id,
                    formName: this.currentForm?.name,
                    fieldCount: records.length,
                    component: 'form-renderer'
                },
                metadata: {
                    userAgent: navigator.userAgent,
                    timestamp: new Date().toISOString()
                }
            });
            
            // Move temporary files to final instance location
            if (tempFilesToMove.length > 0) {
                try {
                    const { imageUploadService } = await import('../services/image-upload-service.js');
                    const movedFiles = await imageUploadService.moveTemporaryFiles(tempFilesToMove, instanceId);
                    
                    if (movedFiles.length > 0) {
                        // Update the database records with new file paths using audit-aware method
                        for (const movedFile of movedFiles) {
                            const oldPath = movedFile.oldPath;
                            const newPath = movedFile.newPath;
                            
                            // Log file operation audit
                            await supabaseClient.logFileOperationAudit(instanceId, 'file_move', {
                                fileName: movedFile.fileName || 'unknown',
                                oldPath: oldPath,
                                newPath: newPath,
                                fileSize: movedFile.fileSize
                            }, {
                                activityType: 'file_operation',
                                activitySummary: `Moved file from temp to final location`,
                                activityDetails: {
                                    operation: 'file_move',
                                    component: 'form-renderer'
                                }
                            });
                            
                            // Update any records that contain the old temp path
                            await supabaseClient.from('instance_data')
                                .update({ field_value: newPath })
                                .eq('instance_id', instanceId)
                                .eq('field_value', oldPath);
                        }
                        
                        this.logger.log(`Moved ${movedFiles.length} temporary files to final location`);
                    }
                } catch (moveError) {
                    this.logger.warn('Failed to move temporary files:', moveError);
                    // Don't fail the entire operation if file movement fails
                }
            }
            
            this.logger.log('Saved form data:', records.length, 'fields');
            return { success: true, records: data };
            
        } catch (error) {
            this.logger.error('Failed to save form data:', error);
            throw new Error(`Failed to save form data: ${error.message}`);
        }
    }

    /**
     * Load form data for editing (retrieve from instance_data using field_id)
     */
    async loadFormDataForEditing(instanceId, fieldKeys = null) {
        try {
            let query = supabaseClient.client
                .from('instance_data')
                .select(`
                    field_value, 
                    field_type, 
                    field_id,
                    form_fields!instance_data_field_id_fkey (
                        id,
                        field_label,
                        field_type
                    )
                `)
                .eq('instance_id', instanceId);
            
            // Optionally filter by specific field IDs
            if (fieldKeys && fieldKeys.length > 0) {
                query = query.in('field_id', fieldKeys);
            }
            
            const { data, error } = await query.order('created_at');
            
            if (error) {
                throw error;
            }
            
            // Convert to Map for easy access
            const formData = new Map();
            
            if (data) {
                data.forEach(record => {
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
                    formData.set(fieldId, value);
                });
            }
            
            this.logger.log('Loaded form data for editing:', formData.size, 'fields');
            return formData;
            
        } catch (error) {
            this.logger.error('Failed to load form data for editing:', error);
            throw new Error(`Failed to load form data: ${error.message}`);
        }
    }

    /**
     * Setup multi-page form state
     */
    setupMultiPageForm(pages, allFields) {
        this.totalPages = pages.length;
        this.isMultiPage = this.totalPages > 1;
        this.currentPage = 1;
        
        this.logger.log(`Multi-page form setup - Pages found:`, pages);
        this.logger.log(`Multi-page form setup - All fields:`, allFields);
        this.logger.log(`Multi-page form setup - Total pages: ${this.totalPages}, Is multi-page: ${this.isMultiPage}`);
        
        // Group fields by page
        this.allPages.clear();
        for (const page of pages) {
            const pageFields = allFields.filter(field => (field.page || 1) === page.page);
            this.allPages.set(page.page, {
                fields: pageFields,
                title: page.title
            });
            this.logger.log(`Page ${page.page} (${page.title}): ${pageFields.length} fields`);
        }
        
        this.logger.log(`Multi-page form setup complete: ${this.totalPages} pages, current page: ${this.currentPage}`);
    }

    /**
     * Generate page indicator
     */
    generatePageIndicator() {
        return `
            <div class="page-indicator">
                <span class="page-info">Page ${this.currentPage} of ${this.totalPages}</span>
                <div class="page-dots">
                    ${Array.from({ length: this.totalPages }, (_, i) => 
                        `<span class="page-dot ${i + 1 === this.currentPage ? 'active' : ''}" data-page="${i + 1}"></span>`
                    ).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Generate page navigation controls
     */
    generatePageNavigation() {
        const prevDisabled = this.currentPage === 1;
        const nextDisabled = this.currentPage === this.totalPages;
        
        return `
            <div class="page-navigation">
                <button type="button" class="btn btn-secondary page-nav-btn" id="prev-page-btn" ${prevDisabled ? 'disabled' : ''}>
                    <i class="fas fa-arrow-left"></i>
                    Previous
                </button>
                <div class="page-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${(this.currentPage / this.totalPages) * 100}%"></div>
                    </div>
                </div>
                <button type="button" class="btn btn-primary page-nav-btn" id="next-page-btn" ${nextDisabled ? 'disabled' : ''}>
                    ${this.currentPage === this.totalPages ? 'Complete' : 'Next'}
                    <i class="fas fa-arrow-right"></i>
                </button>
            </div>
        `;
    }

    /**
     * Setup page navigation handlers
     */
    setupPageNavigation(container) {
        this.logger.log(`Setting up page navigation - isMultiPage: ${this.isMultiPage}, totalPages: ${this.totalPages}`);
        
        if (!this.isMultiPage) {
            this.logger.log('Skipping page navigation setup - not a multi-page form');
            return;
        }
        
        this.logger.log('Setting up page navigation for multi-page form');
        const prevBtn = container.querySelector('#prev-page-btn');
        const nextBtn = container.querySelector('#next-page-btn');
        
        this.logger.log(`Navigation buttons found - prev: ${!!prevBtn}, next: ${!!nextBtn}`);
        
        if (prevBtn) {
            eventManager.add(prevBtn, 'click', () => this.goToPreviousPage(container), 
                { component: 'form-renderer', description: 'Previous page navigation' });
        }
        
        if (nextBtn) {
            eventManager.add(nextBtn, 'click', () => this.goToNextPage(container), 
                { component: 'form-renderer', description: 'Next page navigation' });
        }
        
        // Page dot navigation
        const pageDots = container.querySelectorAll('.page-dot');
        pageDots.forEach(dot => {
            eventManager.add(dot, 'click', () => {
                const targetPage = parseInt(dot.dataset.page);
                this.goToPage(targetPage, container);
            }, { component: 'form-renderer', description: 'Page dot navigation' });
        });
    }

    /**
     * Go to previous page
     */
    async goToPreviousPage(container) {
        if (this.currentPage <= 1) return;
        
        // Save current page data
        this.saveCurrentPageData(container);
        
        // Go to previous page
        this.currentPage--;
        await this.renderCurrentPage(container);
    }

    /**
     * Go to next page
     */
    async goToNextPage(container) {
        // Validate current page first
        if (!this.validateForm(container)) {
            this.logger.log('Page validation failed, cannot proceed to next page');
            return;
        }
        
        // Save current page data
        this.saveCurrentPageData(container);
        
        if (this.currentPage >= this.totalPages) {
            // Last page - trigger form completion
            this.logger.log('Form completed, triggering submission');
            this.onFormComplete(container);
            return;
        }
        
        // Go to next page
        this.currentPage++;
        await this.renderCurrentPage(container);
    }

    /**
     * Go to specific page
     */
    async goToPage(pageNumber, container) {
        if (pageNumber < 1 || pageNumber > this.totalPages || pageNumber === this.currentPage) {
            return;
        }
        
        // Save current page data first
        this.saveCurrentPageData(container);
        
        this.currentPage = pageNumber;
        await this.renderCurrentPage(container);
    }

    /**
     * Save current page data to preserve state
     */
    saveCurrentPageData(container) {
        const currentFormData = this.getFormData(container);
        
        this.logger.log(`Saving data for page ${this.currentPage}:`, currentFormData);
        
        // Store data for this page
        currentFormData.forEach((value, key) => {
            this.pageData.set(key, value);
            this.logger.log(`Saved field ${key}:`, value);
        });
        
        this.logger.log(`Page ${this.currentPage} data saved. Total saved fields:`, this.pageData.size);
        
        // Trigger smart dropdown updates on all pages after saving data
        this.refreshSmartDropdownsOnAllPages();
    }

    /**
     * Render current page
     */
    async renderCurrentPage(container) {
        try {
            // Get fields for current page
            const fields = await this.getFormFields(this.currentForm.id, this.currentPage);
            
            // Load prefill data including saved page data
            const prefillData = await this.loadPrefillData(this.currentInstanceId);
            
            // Merge saved page data with prefill data
            const enhancedPrefillData = this.enhancePrefillWithPageData(prefillData);
            
            // Re-render form
            const formHTML = this.generateFormStructure(fields, enhancedPrefillData);
            container.innerHTML = formHTML;
            
            // Re-setup interactions
            this.setupFormInteractions(container);
            this.setupPageNavigation(container);
            
            this.logger.log(`Rendered page ${this.currentPage} of ${this.totalPages}`);
            
        } catch (error) {
            this.logger.error('Failed to render current page:', error);
        }
    }

    /**
     * Enhance prefill data with saved page data
     */
    enhancePrefillWithPageData(prefillData) {
        // Create a copy of prefill data
        const enhanced = {
            instanceData: new Map(prefillData.instanceData),
            participantData: new Map(prefillData.participantData),
            customTables: new Map(prefillData.customTables),
            editableFields: prefillData.editableFields,
            isEditAction: prefillData.isEditAction,
            isMoveForwardAction: prefillData.isMoveForwardAction
        };
        
        // Merge saved page data
        this.pageData.forEach((value, key) => {
            enhanced.instanceData.set(key, {
                value: value,
                type: typeof value === 'string' && value.includes(',') ? 'array' : 'text',
                created_at: new Date().toISOString(),
                field_id: key
            });
        });
        
        return enhanced;
    }

    /**
     * Get all form data across all pages
     */
    getAllPagesFormData(container) {
        // Save current page data first
        this.saveCurrentPageData(container);
        
        // Return all collected page data
        return this.pageData;
    }
    /**
     * Refresh smart dropdowns on all pages to reflect updated data
     */
    refreshSmartDropdownsOnAllPages() {
        // Find all smart dropdowns in the current container
        const container = document.querySelector('.dynamic-form, .workflow-form');
        if (!container) return;
        
        const smartDropdowns = container.querySelectorAll('select[data-smart-source]');
        smartDropdowns.forEach(dropdown => {
            const sourceField = dropdown.dataset.smartSource;
            const targetTable = dropdown.dataset.smartTarget;
            const targetValueField = dropdown.dataset.smartValueField;
            const targetLabelField = dropdown.dataset.smartLabelField;
            
            if (sourceField && targetTable && targetValueField && targetLabelField) {
                this.logger.log('Refreshing smart dropdown:', dropdown.name, 'source:', sourceField);
                this.setupSmartDropdown(dropdown, sourceField, targetTable, targetValueField, targetLabelField);
            }
        });
    }
    
    /**
     * Clear all form data and reset state for new workflow instance
     */
    resetForNewInstance(instanceId = null) {
        this.logger.log('Resetting form renderer for new instance:', instanceId);
        
        // Clear all form data
        this.formData.clear();
        this.pageData.clear();
        this.allPages.clear();
        this.fieldValidators.clear();
        this.fieldElements.clear();
        this.validationErrors.clear();
        
        // Reset pagination state
        this.currentPage = 1;
        this.totalPages = 1;
        
        // Update instance ID if provided
        if (instanceId) {
            this.currentInstanceId = instanceId;
        }
        
        this.logger.log('Form renderer reset complete');
    }

    /**
     * Handle form completion (all pages done)
     */
    onFormComplete(container) {
        // Emit event for form completion
        eventManager.emit('form-complete', {
            formId: this.currentForm.id,
            instanceId: this.currentInstanceId,
            formData: this.getAllPagesFormData(container)
        });
    }

    /**
     * Cleanup method
     */
    destroy() {
        // Custom table selectors are cleaned up by event manager
        
        this.fieldValidators.clear();
        this.fieldElements.clear();
        this.validationErrors.clear();
        this.formData.clear();
        this.pageData.clear();
        this.allPages.clear();
        
        this.logger.log('Destroyed');
    }
}

// Create and export singleton instance
export const formRenderer = new FormRenderer();