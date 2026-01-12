/**
 * Workflow Module for Bottom Sheet
 * 
 * Displays workflow instances with forms and action buttons
 * Handles stage progression and data collection
 * 
 * Integrates with:
 * - @ui/bottom-sheet.js for container
 * - @forms/form-renderer.js for dynamic forms
 * - @workflow/workflow-engine.js for workflow logic
 */

import { BottomSheetModule } from '../ui/bottom-sheet.js';
import { formRenderer } from '../forms/form-renderer.js';
import { workflowEngine } from './workflow-engine.js';
import stageIconRenderer from '../components/stage-icon-renderer.js';
import eventManager from '../core/event-manager.js';
import DebugLogger from '../core/debug-logger.js';

export class WorkflowModule extends BottomSheetModule {
    constructor(options = {}) {
        super({
            ...options,
            id: 'workflow-module',
            title: options.workflowName || 'Workflow',
            peekHeight: 0.4,
            expandedHeight: 0.8
        });
        
        this.instanceId = options.instanceId;
        this.workflowId = options.workflowId;
        this.workflowName = options.workflowName;
        this.currentStage = null;
        this.availableActions = [];
        this.instanceSummary = null;
        this.currentFormId = null;
        this.logger = new DebugLogger('WorkflowModule');
        
        this.logger.log('Created for instance:', this.instanceId);
    }

    /**
     * Render workflow module content
     */
    async render(container, params = {}) {
        try {
            this.container = container;
            
            // Load workflow instance data
            await this.loadInstanceData();
            
            // Render the workflow interface
            this.renderWorkflowInterface();
            
            // Setup interactions
            this.setupInteractions();
            
            this.logger.log('Rendered workflow interface');
            
        } catch (error) {
            this.logger.error('Failed to render:', error);
            this.renderError(error.message);
        }
    }

    /**
     * Load instance data from workflow engine
     */
    async loadInstanceData() {
        if (!this.instanceId) {
            throw new Error('No instance ID provided');
        }
        
        // Get instance summary
        this.instanceSummary = await workflowEngine.getInstanceSummary(this.instanceId);
        
        if (!this.instanceSummary) {
            throw new Error('Failed to load instance data');
        }
        
        this.currentStage = this.instanceSummary.currentStage;
        this.availableActions = this.instanceSummary.availableActions;
        
        this.logger.log('Loaded instance data:', {
            stage: this.currentStage?.stage_name,
            actions: this.availableActions.length
        });
    }

    /**
     * Render main workflow interface
     */
    renderWorkflowInterface() {
        const workflowHTML = `
            <div class="workflow-module">
                ${this.renderWorkflowHeader()}
                ${this.renderCurrentStage()}
                ${this.renderProgressBar()}
                ${this.renderFormSection()}
                ${this.renderActionButtons()}
                ${this.renderInstanceSummary()}
            </div>
        `;
        
        this.container.innerHTML = workflowHTML;
    }

    /**
     * Render workflow header
     */
    renderWorkflowHeader() {
        return `
            <div class="workflow-header">
                <div class="workflow-info">
                    <h4 class="workflow-name">${this.workflowName}</h4>
                    <p class="workflow-stage">Stage: ${this.currentStage?.stage_name || 'Unknown'}</p>
                </div>
                <div class="workflow-status">
                    <span class="status-badge status-${this.instanceSummary?.status || 'active'}">
                        ${this.instanceSummary?.status || 'Active'}
                    </span>
                </div>
            </div>
        `;
    }

    /**
     * Render current stage information
     */
    renderCurrentStage() {
        if (!this.currentStage) return '';
        
        return `
            <div class="current-stage">
                <div class="stage-info">
                    ${this.getStageIcon(this.currentStage, { size: 32, context: 'workflow' })}
                    <div class="stage-details">
                        <h5>${this.currentStage.stage_name}</h5>
                        <p class="stage-type">${this.formatStageType(this.currentStage.stage_type)}</p>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render progress bar
     */
    renderProgressBar() {
        const progress = this.instanceSummary?.progress_percentage || 0;
        
        return `
            <div class="progress-section">
                <div class="progress-info">
                    <span>Progress</span>
                    <span>${progress}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progress}%"></div>
                </div>
            </div>
        `;
    }

    /**
     * Render form section
     */
    renderFormSection() {
        // Check if current actions have forms or editable fields
        const hasFormActions = this.availableActions.some(action => 
            action.form_id || (action.from_stage_id === action.to_stage_id && !action.form_id)
        );
        
        if (!hasFormActions) {
            return `
                <div class="form-section">
                    <div class="no-form-message">
                        <i class="fas fa-info-circle"></i>
                        <p>No data collection required for this stage.</p>
                    </div>
                </div>
            `;
        }
        
        return `
            <div class="form-section">
                <div class="form-container" id="workflowFormContainer">
                    <div class="form-placeholder">
                        <div class="placeholder-content">
                            <i class="fas fa-mouse-pointer"></i>
                            <p>Click an action button below to load the corresponding form.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render action buttons
     */
    renderActionButtons() {
        if (!this.availableActions.length) {
            return `
                <div class="actions-section">
                    <div class="no-actions-message">
                        <i class="fas fa-check-circle"></i>
                        <p>No actions available at this stage.</p>
                    </div>
                </div>
            `;
        }
        
        const buttonsHTML = this.availableActions.map(action => {
            const buttonClass = this.getActionButtonClass(action);
            const isEditAction = action.from_stage_id === action.to_stage_id && !action.form_id;
            const hasForm = action.form_id;
            const iconClass = hasForm ? 'fas fa-edit' : isEditAction ? 'fas fa-pencil-alt' : 'fas fa-arrow-right';
            
            return `
                <button 
                    class="action-button ${buttonClass}"
                    data-action-id="${action.id}"
                    data-requires-confirmation="${action.requires_confirmation || false}"
                    data-confirmation-message="${action.confirmation_message || ''}"
                    ${hasForm || isEditAction ? 'data-has-form="true"' : ''}
                >
                    <span class="button-text">${action.button_label}</span>
                    <i class="${iconClass}"></i>
                </button>
            `;
        }).join('');
        
        return `
            <div class="actions-section">
                <h5>Available Actions</h5>
                <div class="action-buttons">
                    ${buttonsHTML}
                </div>
            </div>
        `;
    }

    /**
     * Render instance summary
     */
    renderInstanceSummary() {
        const createdDate = new Date(this.instanceSummary.created_at).toLocaleString();
        
        return `
            <div class="instance-summary">
                <h5>Instance Information</h5>
                <div class="summary-grid">
                    <div class="summary-item">
                        <label>Created:</label>
                        <span>${createdDate}</span>
                    </div>
                    <div class="summary-item">
                        <label>Instance ID:</label>
                        <span class="instance-id">${this.instanceId}</span>
                    </div>
                    ${this.instanceSummary.location ? `
                        <div class="summary-item">
                            <label>Location:</label>
                            <span>Map coordinates provided</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Setup interactions and event handlers
     */
    setupInteractions() {
        // Setup action button handlers
        this.setupActionButtons();
        
        // Setup multi-page form completion handler
        this.setupFormCompletionHandler();
        
        // Load form if available
        this.loadFormIfAvailable();
    }

    /**
     * Setup action button event handlers
     */
    setupActionButtons() {
        const actionButtons = this.container.querySelectorAll('.action-button');
        
        actionButtons.forEach(button => {
            eventManager.add(button, 'click', async () => {
                const actionId = button.dataset.actionId;
                const requiresConfirmation = button.dataset.requiresConfirmation === 'true';
                const confirmationMessage = button.dataset.confirmationMessage;
                const hasForm = button.dataset.hasForm === 'true';
                
                await this.handleActionClick(actionId, hasForm, requiresConfirmation, confirmationMessage);
            }, {
                component: 'workflow-module',
                description: `Action button: ${button.textContent}`
            });
        });
    }

    /**
     * Setup form completion event handler for multi-page forms
     */
    setupFormCompletionHandler() {
        // Listen for multi-page form completion events
        eventManager.on('form-complete', async (eventData) => {
            try {
                this.logger.log('Multi-page form completed:', eventData);
                
                // Find the action that corresponds to this form
                const formId = eventData.formId;
                const currentAction = this.availableActions.find(action => action.form_id === formId);
                
                if (currentAction) {
                    this.logger.log('Executing action for completed form:', currentAction.id);
                    
                    // Execute the action with the collected form data
                    await this.executeAction(currentAction.id, eventData.formData);
                } else {
                    this.logger.warn('No action found for completed form:', formId);
                }
            } catch (error) {
                this.logger.error('Failed to handle form completion:', error);
                alert('Failed to process form completion: ' + error.message);
            }
        }, { component: 'workflow-module', description: 'Multi-page form completion handler' });
    }

    /**
     * Handle action button click
     */
    async handleActionClick(actionId, hasForm, requiresConfirmation, confirmationMessage) {
        try {
            // Show confirmation if required
            if (requiresConfirmation) {
                const message = confirmationMessage || 'Are you sure you want to perform this action?';
                if (!confirm(message)) {
                    return;
                }
            }
            
            // If action has form, dynamically load the correct form for this specific action
            let formData = new Map();
            if (hasForm) {
                // Find the specific action to get its form_id
                const action = this.availableActions.find(a => a.id === actionId);
                if (action && action.form_id) {
                    // Load the specific form for this action
                    await this.loadForm(action.form_id);
                    
                    const formContainer = document.getElementById('workflowFormContainer');
                    
                    // Validate form with action context
                    const validationResult = await formRenderer.validateFormWithContext(
                        formContainer, 
                        this.instanceId, 
                        actionId
                    );
                    
                    if (!validationResult.isValid) {
                        alert('Please fix the form errors before proceeding:\n' + validationResult.errors.join('\n'));
                        return;
                    }
                    
                    // Get form data (multi-page aware)
                    formData = this.getFormDataMultiPageAware(formContainer);
                } else if (action && action.from_stage_id === action.to_stage_id) {
                    // This is an edit action - load editable fields
                    await this.loadEditForm(action.id);
                    
                    const formContainer = document.getElementById('workflowFormContainer');
                    
                    // Validate form with action context
                    const validationResult = await formRenderer.validateFormWithContext(
                        formContainer, 
                        this.instanceId, 
                        actionId
                    );
                    
                    if (!validationResult.isValid) {
                        alert('Please fix the form errors before proceeding:\n' + validationResult.errors.join('\n'));
                        return;
                    }
                    
                    // Get form data (multi-page aware)
                    formData = this.getFormDataMultiPageAware(formContainer);
                }
            }
            
            // Execute action
            await this.executeAction(actionId, formData);
            
        } catch (error) {
            this.logger.error('Action execution failed:', error);
            alert('Failed to execute action: ' + error.message);
        }
    }

    /**
     * Execute workflow action
     */
    async executeAction(actionId, formData) {
        this.logger.log('Executing action:', actionId);
        
        // Convert Map to object for API
        const formDataObject = {};
        formData.forEach((value, key) => {
            formDataObject[key] = value;
        });
        
        // Execute through workflow engine
        const result = await workflowEngine.executeAction(this.instanceId, actionId, formDataObject);
        
        if (result) {
            this.logger.log('Action executed successfully');
            
            // Reload instance data
            await this.loadInstanceData();
            
            // Re-render interface
            this.renderWorkflowInterface();
            this.setupInteractions();
            
            // Show success message
            this.showSuccessMessage('Action completed successfully');
        }
    }

    /**
     * Load form if any action has one
     */
    async loadFormIfAvailable() {
        // Don't automatically load any form - forms will be loaded dynamically when action buttons are clicked
        // This ensures that only the fields for the specific action are shown
        const formContainer = document.getElementById('workflowFormContainer');
        if (formContainer) {
            formContainer.innerHTML = `
                <div class="form-placeholder">
                    <div class="placeholder-content">
                        <i class="fas fa-mouse-pointer"></i>
                        <p>Click an action button below to load the corresponding form.</p>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Load and render form
     */
    async loadForm(formId) {
        try {
            const formContainer = document.getElementById('workflowFormContainer');
            if (!formContainer) return;
            
            this.currentFormId = formId;
            
            // Render form with instance prefill data
            await formRenderer.renderForm(formId, this.instanceId, formContainer);
            
            this.logger.log('Form loaded:', formId);
            
        } catch (error) {
            this.logger.error('Failed to load form:', error);
            const formContainer = document.getElementById('workflowFormContainer');
            if (formContainer) {
                formContainer.innerHTML = `
                    <div class="form-error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Failed to load form: ${error.message}</p>
                    </div>
                `;
            }
        }
    }

    /**
     * Get stage icon HTML based on stage configuration or type
     * @param {Object|string} stage - Stage object with visual_config or stage type string
     * @param {Object} options - Rendering options
     * @returns {string} HTML string for the stage icon
     */
    getStageIcon(stage, options = {}) {
        const defaultOptions = { 
            size: 24, 
            context: 'workflow',
            className: 'stage-icon'
        };
        const renderOptions = { ...defaultOptions, ...options };

        // Handle legacy string-based calls (backward compatibility)
        if (typeof stage === 'string') {
            return stageIconRenderer.generateDefaultIcon(stage, renderOptions.size, renderOptions.className);
        }

        // Use new stage icon renderer for full stage objects
        return stageIconRenderer.renderStageIcon(stage, renderOptions);
    }

    /**
     * Format stage type for display
     */
    formatStageType(stageType) {
        switch (stageType) {
            case 'start': return 'Initial Stage';
            case 'intermediate': return 'In Progress';
            case 'end': return 'Final Stage';
            default: return 'Unknown';
        }
    }

    /**
     * Load and render edit form for edit actions
     */
    async loadEditForm(actionId) {
        try {
            const formContainer = document.getElementById('workflowFormContainer');
            if (!formContainer) return;
            
            this.currentFormId = null; // Edit actions don't have forms
            this.currentActionId = actionId;
            
            // Get editable fields for this action
            const editableFields = await workflowEngine.getEditableFields(actionId);
            
            if (editableFields.length === 0) {
                formContainer.innerHTML = `
                    <div class="no-editable-fields">
                        <i class="fas fa-info-circle"></i>
                        <p>No editable fields configured for this action.</p>
                    </div>
                `;
                return;
            }
            
            // Create a dynamic form with all available instance data
            const dynamicFormHTML = await this.createEditFormHTML(editableFields);
            formContainer.innerHTML = dynamicFormHTML;
            
            // Setup form interactions
            formRenderer.setupFormInteractions(formContainer);
            
            this.logger.log('Edit form loaded for action:', actionId, 'with', editableFields.length, 'editable fields');
            
        } catch (error) {
            this.logger.error('Failed to load edit form:', error);
            const formContainer = document.getElementById('workflowFormContainer');
            if (formContainer) {
                formContainer.innerHTML = `
                    <div class="form-error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Failed to load edit form: ${error.message}</p>
                    </div>
                `;
            }
        }
    }

    /**
     * Create HTML for edit form
     */
    async createEditFormHTML(editableFields) {
        // Get all instance data for prefill
        const instanceData = await workflowEngine.getProgressiveData(this.instanceId);
        
        let fieldsHTML = '';
        
        for (const editableField of editableFields) {
            const fieldInfo = editableField.form_fields;
            const fieldId = fieldInfo.id;
            const prefillValue = instanceData.get(fieldId)?.value || '';
            
            fieldsHTML += `
                <div class="form-field" data-field-id="${fieldInfo.id}" data-field-type="${fieldInfo.field_type}">
                    <div class="field-label-container">
                        <label class="field-label" for="field-${fieldInfo.id}">
                            ${fieldInfo.field_label}
                            ${fieldInfo.is_required ? '<span class="required-indicator">*</span>' : ''}
                        </label>
                        ${fieldInfo.help_text ? `<div class="field-help-text">${fieldInfo.help_text}</div>` : ''}
                    </div>
                    <div class="field-input-container">
                        ${this.renderEditableField(fieldInfo, prefillValue)}
                    </div>
                    <div class="field-validation-message" id="validation-${fieldInfo.id}" style="display: none;"></div>
                </div>
            `;
        }
        
        return `
            <div class="dynamic-form edit-form" data-action-id="${this.currentActionId}">
                <div class="form-header">
                    <h3 class="form-title">Edit Stage Data</h3>
                    <p class="form-description">You can modify the selected fields below.</p>
                </div>
                <div class="form-body">
                    ${fieldsHTML}
                </div>
                <div class="form-validation-summary" id="validation-summary" style="display: none;">
                    <div class="validation-message">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>Please fix the following errors:</span>
                        <ul class="validation-errors" id="validation-errors"></ul>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render an editable field
     */
    renderEditableField(fieldInfo, prefillValue) {
        const fieldId = fieldInfo.id; // Use UUID field_id
        
        switch (fieldInfo.field_type) {
            case 'short_text':
                return `
                    <input 
                        type="text" 
                        id="field-${fieldId}" 
                        name="${fieldId}"
                        class="form-input text-input"
                        placeholder="${fieldInfo.placeholder || ''}"
                        value="${prefillValue || ''}"
                        ${fieldInfo.is_required ? 'required' : ''}
                        data-validation='${JSON.stringify(fieldInfo.validation_rules || {})}'
                    />
                `;
            case 'long_text':
                return `
                    <textarea 
                        id="field-${fieldId}" 
                        name="${fieldId}"
                        class="form-input textarea-input"
                        placeholder="${fieldInfo.placeholder || ''}"
                        rows="4"
                        ${fieldInfo.is_required ? 'required' : ''}
                        data-validation='${JSON.stringify(fieldInfo.validation_rules || {})}'
                    >${prefillValue || ''}</textarea>
                `;
            case 'number':
                return `
                    <input 
                        type="number" 
                        id="field-${fieldId}" 
                        name="${fieldId}"
                        class="form-input number-input"
                        placeholder="${fieldInfo.placeholder || ''}"
                        value="${prefillValue || ''}"
                        ${fieldInfo.is_required ? 'required' : ''}
                        data-validation='${JSON.stringify(fieldInfo.validation_rules || {})}'
                    />
                `;
            case 'date':
                return `
                    <input 
                        type="date" 
                        id="field-${fieldId}" 
                        name="${fieldId}"
                        class="form-input date-input"
                        value="${prefillValue || ''}"
                        ${fieldInfo.is_required ? 'required' : ''}
                        data-validation='${JSON.stringify(fieldInfo.validation_rules || {})}'
                    />
                `;
            case 'dropdown':
                const options = fieldInfo.field_options?.options || [];
                const optionsHTML = options.map(option => {
                    const value = typeof option === 'string' ? option : option.value;
                    const label = typeof option === 'string' ? option : option.label;
                    const isSelected = prefillValue === value;
                    return `<option value="${value}" ${isSelected ? 'selected' : ''}>${label}</option>`;
                }).join('');
                
                return `
                    <select 
                        id="field-${fieldId}" 
                        name="${fieldId}"
                        class="form-input select-input"
                        ${fieldInfo.is_required ? 'required' : ''}
                    >
                        <option value="">Select an option...</option>
                        ${optionsHTML}
                    </select>
                `;
            default:
                return `
                    <input 
                        type="text" 
                        id="field-${fieldId}" 
                        name="${fieldId}"
                        class="form-input text-input"
                        placeholder="${fieldInfo.placeholder || ''}"
                        value="${prefillValue || ''}"
                        ${fieldInfo.is_required ? 'required' : ''}
                        data-validation='${JSON.stringify(fieldInfo.validation_rules || {})}'
                    />
                `;
        }
    }

    /**
     * Get action button CSS class
     */
    getActionButtonClass(action) {
        const colorMap = {
            'primary': 'btn-primary',
            'secondary': 'btn-secondary',
            'success': 'btn-success',
            'warning': 'btn-warning',
            'danger': 'btn-danger',
            'info': 'btn-info'
        };
        
        return colorMap[action.button_color] || 'btn-primary';
    }

    /**
     * Show success message
     */
    showSuccessMessage(message) {
        // Simple success indication
        const successEl = document.createElement('div');
        successEl.className = 'workflow-success-message';
        successEl.innerHTML = `
            <i class="fas fa-check-circle"></i>
            <span>${message}</span>
        `;
        
        this.container.insertBefore(successEl, this.container.firstChild);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (successEl.parentNode) {
                successEl.parentNode.removeChild(successEl);
            }
        }, 3000);
    }

    /**
     * Render error state
     */
    renderError(message) {
        this.container.innerHTML = `
            <div class="workflow-error">
                <div class="error-content">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h4>Error Loading Workflow</h4>
                    <p>${message}</p>
                    <button class="retry-button" onclick="location.reload()">
                        Reload Page
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Module lifecycle hooks
     */
    onExpand() {
        this.logger.log('Bottom sheet expanded');
    }

    onCollapse() {
        this.logger.log('Bottom sheet collapsed');
    }

    onDeviceChange(isMobile) {
        this.logger.log('Device changed to:', isMobile ? 'mobile' : 'desktop');
    }

    /**
     * Get form data in a multi-page aware manner
     */
    getFormDataMultiPageAware(formContainer) {
        // Check if this is a multi-page form
        const formElement = formContainer.querySelector('.dynamic-form');
        const isMultiPage = formElement && formElement.dataset.isMultipage === 'true';
        
        if (isMultiPage) {
            // For multi-page forms, use the getAllPagesFormData method
            this.logger.log('Using multi-page form data collection');
            return formRenderer.getAllPagesFormData(formContainer);
        } else {
            // For single-page forms, use the regular getFormData method
            this.logger.log('Using single-page form data collection');
            return formRenderer.getFormData(formContainer);
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        this.currentFormId = null;
        this.instanceSummary = null;
        this.availableActions = [];
        
        super.destroy();
        
        this.logger.log('Destroyed');
    }
}

export default WorkflowModule;