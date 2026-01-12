/**
 * Survey Module - Shows database-driven survey forms before workflow instance creation
 */
import { formRenderer } from '../forms/form-renderer.js';
import { BottomSheetModule } from './bottom-sheet.js';
import DebugLogger from '../core/debug-logger.js';

export class SurveyModule extends BottomSheetModule {
    constructor(options = {}) {
        super(options);
        this.id = 'survey';
        this.title = 'Survey';
        this.config = null;
        this.onComplete = null;
        this.formRenderer = formRenderer;
        this.logger = new DebugLogger('SurveyModule');
    }

    /**
     * Render the survey interface using database-driven forms
     */
    async render(container, params = {}) {
        this.container = container;
        this.config = params;
        this.onComplete = params.onComplete;

        this.logger.log('Rendering with params:', params);
        
        if (!this.container) return;

        try {
            const { workflowId, workflowName, workflowType, options } = this.config;

            // Try to find a survey form for this workflow, fallback to generic survey
            const surveyFormId = await this.findSurveyForm(workflowId);
            
            if (surveyFormId) {
                this.logger.log('Using database form:', surveyFormId);
                await this.renderDatabaseForm(surveyFormId, workflowName, workflowType);
            } else {
                this.logger.log('Using fallback hardcoded form');
                await this.renderFallbackForm(workflowName, workflowType, options || {});
            }

            this.logger.log('Survey form rendered');
            
        } catch (error) {
            this.logger.error('Failed to render survey:', error);
            this.showError('Failed to load survey form');
        }
    }

    /**
     * Find survey form for workflow - gets the form from the workflow's initial stage
     */
    async findSurveyForm(workflowId) {
        try {
            // Import supabaseClient for database queries
            const { supabaseClient } = await import('../core/supabase.js');
            
            this.logger.log('Finding form for workflow:', workflowId);
            
            // Get the initial stage of the workflow (stage_order = 1)
            const { data: initialStage, error: stageError } = await supabaseClient.client
                .from('workflow_stages')
                .select('initial_form_id, stage_name')
                .eq('workflow_id', workflowId)
                .eq('stage_order', 1)
                .single();
            
            if (stageError) {
                this.logger.error('Database error finding initial stage:', stageError);
                return null;
            }
            
            if (!initialStage?.initial_form_id) {
                this.logger.log('No initial form found for workflow initial stage');
                return null;
            }
            
            this.logger.log('Found initial stage form:', initialStage.initial_form_id, 'for stage:', initialStage.stage_name);
            
            // Verify the form exists and get its details
            const { data: form, error: formError } = await supabaseClient.client
                .from('forms')
                .select('id, name, description')
                .eq('id', initialStage.initial_form_id)
                .single();
            
            if (formError) {
                this.logger.error('Database error finding form:', formError);
                return null;
            }
            
            if (form) {
                this.logger.log('Using workflow form:', form.name);
                return form.id;
            }
            
            return null;
        } catch (error) {
            this.logger.error('Failed to find survey form:', error);
            return null;
        }
    }


    /**
     * Render database-driven form
     */
    async renderDatabaseForm(formId, workflowName, workflowType) {
        try {
            this.logger.log('Rendering database form:', formId);
            
            // Create container for the form
            const surveyHTML = `
                <div class="survey-module">
                    
                    <div class="survey-form-container" id="survey-form-container">
                        <div class="loading-message">Loading form...</div>
                    </div>
                    
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" id="cancel-survey">
                            Cancel
                        </button>
                        <button type="button" class="btn btn-primary" id="submit-survey" disabled>
                            Start Workflow
                        </button>
                    </div>
                </div>
            `;

            this.container.innerHTML = surveyHTML;
            
            // Use FormRenderer to render the actual form
            const formContainer = this.container.querySelector('#survey-form-container');
            
            this.logger.log('Calling FormRenderer.renderForm with:', formId);
            const formHTML = await this.formRenderer.renderForm(formId, null, formContainer);
            
            if (formHTML) {
                this.logger.log('Form rendered successfully');
                
                // Enable submit button once form is loaded
                const submitBtn = this.container.querySelector('#submit-survey');
                if (submitBtn) {
                    submitBtn.disabled = false;
                }
                
                // Set up event handlers
                this.setupEventHandlers();
            } else {
                throw new Error('FormRenderer.renderForm returned empty HTML');
            }
            
        } catch (error) {
            this.logger.error('Failed to render database form:', error);
            // Fallback to hardcoded form
            await this.renderFallbackForm(workflowName, workflowType, {});
        }
    }

    /**
     * Render fallback hardcoded form
     */
    async renderFallbackForm(workflowName, workflowType, options) {
        // Keep the original hardcoded form as fallback
        const surveyHTML = `
            <div class="survey-module">
                
                <form class="survey-form" id="survey-form">
                    <div class="form-group">
                        <label for="survey-name">Your Name:</label>
                        <input type="text" id="survey-name" name="name" required 
                               placeholder="Enter your name">
                    </div>
                    
                    <div class="form-group">
                        <label for="survey-purpose">Purpose of this workflow:</label>
                        <textarea id="survey-purpose" name="purpose" rows="3" 
                                 placeholder="Describe why you are starting this workflow"></textarea>
                    </div>
                    
                    <div class="form-group">
                        <label for="survey-priority">Priority Level:</label>
                        <select id="survey-priority" name="priority">
                            <option value="low">Low</option>
                            <option value="medium" selected>Medium</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                        </select>
                    </div>
                    
                    ${workflowType === 'incident' ? `
                    <div class="form-group">
                        <label for="survey-location-note">Location Notes:</label>
                        <input type="text" id="survey-location-note" name="locationNote" 
                               placeholder="Additional notes about the selected location">
                    </div>
                    ` : ''}
                    
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" id="cancel-survey">
                            Cancel
                        </button>
                        <button type="submit" class="btn btn-primary" id="submit-survey">
                            Start Workflow
                        </button>
                    </div>
                </form>
            </div>
        `;

        this.container.innerHTML = surveyHTML;
        this.setupEventHandlers();
    }

    /**
     * Set up event handlers for the survey form
     */
    setupEventHandlers() {
        const form = this.container.querySelector('#survey-form');
        const cancelBtn = this.container.querySelector('#cancel-survey');
        const submitBtn = this.container.querySelector('#submit-survey');

        // Handle form submission (for fallback form)
        if (form) {
            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                await this.handleFormSubmit();
            });
            
            // Handle submit button state for fallback form
            form.addEventListener('input', () => {
                this.updateSubmitButtonState();
            });
        }

        // Handle cancel button
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.handleCancel();
            });
        }

        // Handle submit button for both form types
        if (submitBtn) {
            submitBtn.addEventListener('click', async (event) => {
                event.preventDefault();
                await this.handleFormSubmit();
            });
        }

        // Initial button state check
        this.updateSubmitButtonState();
    }

    /**
     * Handle form submission
     */
    async handleFormSubmit() {
        try {
            let surveyData = {};
            
            // Check if we're using database form or fallback form
            const databaseFormContainer = this.container.querySelector('#survey-form-container .dynamic-form');
            const fallbackForm = this.container.querySelector('#survey-form');
            
            if (databaseFormContainer) {
                // Database form - use FormRenderer to get data
                this.logger.log('Collecting data from database form');
                
                // Validate the form first
                const isValid = this.formRenderer.validateForm(databaseFormContainer);
                if (!isValid) {
                    this.showError('Please fix the form errors before submitting');
                    return;
                }
                
                // Get form data from FormRenderer (multi-page aware)
                const formDataMap = this.getFormDataMultiPageAware(databaseFormContainer);
                
                this.logger.log('Form data collected for submission:', formDataMap);
                this.logger.log('Form data keys:', Array.from(formDataMap.keys()));
                
                // Convert Map to object
                for (let [key, value] of formDataMap.entries()) {
                    surveyData[key] = value;
                }
                
            } else if (fallbackForm) {
                // Fallback form - use FormData
                this.logger.log('Collecting data from fallback form');
                
                const formData = new FormData(fallbackForm);
                
                // Convert form data to object
                for (let [key, value] of formData.entries()) {
                    surveyData[key] = value;
                }
                
                // Validate required fields for fallback form
                if (!surveyData.name) {
                    this.showError('Name is required');
                    return;
                }
            } else {
                throw new Error('No valid form found');
            }

            this.logger.log('Survey data collected:', surveyData);

            // Disable submit button during processing
            const submitBtn = this.container.querySelector('#submit-survey');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating...';

            // Call the completion callback
            if (this.onComplete) {
                await this.onComplete(surveyData);
            }

        } catch (error) {
            this.logger.error('Failed to submit survey:', error);
            this.showError('Failed to submit survey: ' + error.message);
            
            // Re-enable submit button
            const submitBtn = this.container.querySelector('#submit-survey');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Start Workflow';
            }
        }
    }

    /**
     * Handle cancel action
     */
    handleCancel() {
        this.logger.log('Survey cancelled');
        
        // Close the bottom sheet
        if (window.bottomSheet) {
            window.bottomSheet.close();
        }
    }

    /**
     * Get form data in a multi-page aware manner
     */
    getFormDataMultiPageAware(formContainer) {
        // Check if this is a multi-page form
        // First, try to find .dynamic-form within the container
        let formElement = formContainer.querySelector('.dynamic-form');
        
        // If not found, check if the container itself is the .dynamic-form element
        if (!formElement && formContainer.classList && formContainer.classList.contains('dynamic-form')) {
            formElement = formContainer;
        }
        
        // Debug the dataset attributes
        this.logger.log('Form container class list:', formContainer.classList ? Array.from(formContainer.classList) : 'no classList');
        this.logger.log('Form element found:', !!formElement);
        if (formElement) {
            this.logger.log('Dataset attributes:', formElement.dataset);
            this.logger.log('isMultipage value:', formElement.dataset.isMultipage);
            this.logger.log('isMultipage type:', typeof formElement.dataset.isMultipage);
        }
        
        // Try multiple ways to detect multi-page forms
        let isMultiPage = false;
        
        if (formElement) {
            // Method 1: Check dataset.isMultipage
            isMultiPage = formElement.dataset.isMultipage === 'true' || formElement.dataset.isMultipage === true;
            
            // Method 2: Check dataset.isMultiPage (different casing)
            if (!isMultiPage) {
                isMultiPage = formElement.dataset.isMultiPage === 'true' || formElement.dataset.isMultiPage === true;
            }
            
            // Method 3: Check getAttribute directly
            if (!isMultiPage) {
                const attrValue = formElement.getAttribute('data-is-multipage');
                isMultiPage = attrValue === 'true';
                this.logger.log('Direct attribute check - data-is-multipage:', attrValue);
            }
        }
        
        this.logger.log('Multi-page detection result:', isMultiPage);
        
        if (isMultiPage) {
            // For multi-page forms, use the getAllPagesFormData method
            this.logger.log('Using multi-page form data collection');
            return this.formRenderer.getAllPagesFormData(formContainer);
        } else {
            // For single-page forms, use the regular getFormData method
            this.logger.log('Using single-page form data collection');
            return this.formRenderer.getFormData(formContainer);
        }
    }

    /**
     * Update submit button state based on form validation
     */
    updateSubmitButtonState() {
        const submitBtn = this.container.querySelector('#submit-survey');
        if (!submitBtn) return;
        
        // Check if we have a database form or fallback form
        const databaseFormContainer = this.container.querySelector('#survey-form-container .dynamic-form');
        const fallbackForm = this.container.querySelector('#survey-form');
        
        if (databaseFormContainer) {
            // Database form - always enable button, let FormRenderer handle validation
            submitBtn.disabled = false;
        } else if (fallbackForm) {
            // Fallback form - check required fields
            const nameInput = this.container.querySelector('#survey-name');
            if (nameInput && nameInput.value.trim()) {
                submitBtn.disabled = false;
            } else {
                submitBtn.disabled = true;
            }
        } else {
            // No form found - disable button
            submitBtn.disabled = true;
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        this.logger.error('Error:', message);
        
        // Remove existing error messages
        const existingError = this.container.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }

        // Create error message element
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.style.cssText = `
            background: #fee;
            border: 1px solid #fcc;
            color: #c66;
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
        `;
        errorDiv.textContent = message;

        // Insert at top of form
        const form = this.container.querySelector('.survey-form');
        if (form) {
            form.insertBefore(errorDiv, form.firstChild);
        } else {
            // If form doesn't exist, insert at top of container
            this.container.insertBefore(errorDiv, this.container.firstChild);
        }

        // Remove error after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 5000);
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.logger.log('Cleaning up');
        
        if (this.container) {
            this.container.innerHTML = '';
        }
        
        this.config = null;
        this.onComplete = null;
        
        // Call parent destroy method
        super.destroy();
    }
}

// Make it available as bottom sheet module
window.SurveyModule = SurveyModule;