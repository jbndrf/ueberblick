/**
 * Workflow Preview Module
 * 
 * Renders workflow content as it would appear to participants in the sidebar
 * Mimics the exact structure of the participants frontend MarkerDetailModule
 */

import { PreviewSidebarModule } from './WorkflowPreviewSidebar.js';
import DebugLogger from '../../core/debug-logger.js';
import EntitySelector from '../../components/entity-selector.js';

export class WorkflowPreviewModule extends PreviewSidebarModule {
    constructor(options = {}) {
        console.log('WorkflowPreviewModule constructor called with options:', options);
        super({
            id: 'workflow-preview',
            title: 'Workflow Preview',
            ...options
        });
        
        this.workflowData = null;
        this.stages = [];
        this.actions = [];
        this.formFields = [];
        this.activeTab = 'overview';
        this.activeDetailTab = null;
        this.mockInstanceData = null;
        
        // State persistence key
        this.stateStorageKey = 'workflow-preview-state';
        
        // Throttling for button clicks to prevent double calls
        this.lastActionTime = 0;
        this.actionThrottleDelay = 1000; // 1 second
    }

    /**
     * Save current preview state to localStorage
     */
    savePreviewState() {
        try {
            const state = {
                activeTab: this.activeTab,
                activeDetailTab: this.activeDetailTab,
                timestamp: new Date().getTime()
            };
            
            localStorage.setItem(this.stateStorageKey, JSON.stringify(state));
            this.logger.log('Preview state saved:', state);
        } catch (error) {
            this.logger.warn('Failed to save preview state:', error);
        }
    }

    /**
     * Load preview state from localStorage
     */
    loadPreviewState() {
        try {
            const savedState = localStorage.getItem(this.stateStorageKey);
            this.logger.log('Loading preview state from localStorage:', savedState);
            
            if (savedState) {
                const state = JSON.parse(savedState);
                
                // Check if state is recent (within last hour) to avoid stale states
                const stateAge = new Date().getTime() - (state.timestamp || 0);
                const maxAge = 60 * 60 * 1000; // 1 hour
                
                this.logger.log('State age check:', {
                    stateTimestamp: state.timestamp,
                    currentTime: new Date().getTime(),
                    stateAge: stateAge,
                    maxAge: maxAge,
                    isValid: stateAge < maxAge
                });
                
                if (stateAge < maxAge) {
                    const previousActiveTab = this.activeTab;
                    const previousActiveDetailTab = this.activeDetailTab;
                    
                    this.activeTab = state.activeTab || 'overview';
                    this.activeDetailTab = state.activeDetailTab;
                    
                    this.logger.log('Preview state loaded successfully:', {
                        previous: { activeTab: previousActiveTab, activeDetailTab: previousActiveDetailTab },
                        loaded: { activeTab: this.activeTab, activeDetailTab: this.activeDetailTab },
                        rawState: state
                    });
                } else {
                    this.logger.log('Preview state expired, using defaults');
                    this.clearPreviewState();
                }
            } else {
                this.logger.log('No saved preview state found, using defaults');
            }
        } catch (error) {
            this.logger.warn('Failed to load preview state:', error);
        }
    }

    /**
     * Clear saved preview state
     */
    clearPreviewState() {
        try {
            localStorage.removeItem(this.stateStorageKey);
            this.logger.log('Preview state cleared');
        } catch (error) {
            this.logger.warn('Failed to clear preview state:', error);
        }
    }

    /**
     * Render workflow preview content matching participants frontend structure
     */
    async render(container, params = {}) {
        this.container = container;
        
        // Store current state before updating data (in case of re-render)
        const currentActiveTab = this.activeTab;
        const currentActiveDetailTab = this.activeDetailTab;
        
        this.workflowData = params.workflow || {};
        this.stages = params.stages || [];
        this.actions = params.actions || [];
        this.formFields = params.formFields || [];
        
        // Load saved state after we have the workflow data, but preserve current state if this is a re-render
        const isRerender = currentActiveTab !== 'overview' || currentActiveDetailTab !== null;
        
        if (isRerender) {
            this.logger.log('Re-rendering - preserving current state:', {
                currentActiveTab,
                currentActiveDetailTab
            });
            // Keep current state for re-renders
            this.activeTab = currentActiveTab;
            this.activeDetailTab = currentActiveDetailTab;
        } else {
            // Only load saved state on initial render
            this.loadPreviewState();
        }
        
        this.logger.log('Rendering participants-style workflow preview with data:', {
            workflow: this.workflowData.name,
            stages: this.stages.length,
            actions: this.actions.length,
            formFields: this.formFields.length,
            isRerender: isRerender,
            preservedActiveTab: this.activeTab,
            preservedActiveDetailTab: this.activeDetailTab
        });
        
        // Sort stages by order
        this.stages.sort((a, b) => (a.order || 0) - (b.order || 0));
        
        // Validate and set active detail tab AFTER loading/preserving state
        this.validateAndSetActiveDetailTab();
        
        // Create mock instance data for realistic preview
        this.createMockInstanceData();
        
        if (this.stages.length === 0) {
            this.renderEmptyState();
            return;
        }
        
        this.renderParticipantsSidebar();
        
        // Restore the correct tab states after rendering
        this.restoreTabStates();
        
        // Save state after successful rendering and restoration
        this.savePreviewState();
    }

    /**
     * Validate and set active detail tab based on available stages
     */
    validateAndSetActiveDetailTab() {
        // Check if current activeDetailTab is still valid
        const isCurrentDetailTabValid = this.activeDetailTab && 
            this.stages.find(s => s.name === this.activeDetailTab);
        
        if (!isCurrentDetailTabValid && this.stages.length > 0) {
            // Fallback to first stage if current selection is invalid
            this.activeDetailTab = this.stages[0].name;
            this.logger.log('Active detail tab reset to first stage:', this.activeDetailTab);
        }
        
        // Validate main tab (should always be valid, but just in case)
        const validTabs = ['overview', 'details', 'audit-trail'];
        if (!validTabs.includes(this.activeTab)) {
            this.activeTab = 'overview';
            this.logger.log('Active tab reset to overview');
        }
        
        this.logger.log('Tab validation complete:', {
            activeTab: this.activeTab,
            activeDetailTab: this.activeDetailTab,
            availableStages: this.stages.map(s => s.name)
        });
    }

    /**
     * Restore tab states after rendering - ensures the saved tab selections are visually active
     */
    restoreTabStates() {
        this.logger.log('Restoring tab states:', {
            activeTab: this.activeTab,
            activeDetailTab: this.activeDetailTab
        });
        
        // Update main tab button states
        const tabButtons = this.container.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            const tabName = btn.getAttribute('data-tab');
            btn.classList.toggle('active', tabName === this.activeTab);
        });
        
        // Update detail tab button states if they exist (excluding add stage button)
        const detailTabButtons = this.container.querySelectorAll('.detail-tab-btn:not(.add-stage-btn)');
        detailTabButtons.forEach(btn => {
            const detailTabName = btn.getAttribute('data-detail-tab');
            btn.classList.toggle('active', detailTabName === this.activeDetailTab);
        });
        
        // Render the correct tab content
        const tabContent = this.container.querySelector('#tabContent');
        if (tabContent) {
            tabContent.innerHTML = this.renderTabContent();
            
            // If we're on the details tab, make sure detail navigation is visible
            if (this.activeTab === 'details') {
                const tabContentArea = this.container.querySelector('.tab-content-area');
                const existingDetailNav = tabContentArea.querySelector('.detail-tab-navigation');
                
                if (!existingDetailNav) {
                    const detailNavHtml = this.renderDetailTabNavigation();
                    if (detailNavHtml) {
                        tabContent.insertAdjacentHTML('beforebegin', detailNavHtml);
                        // Update detail tab button states again after adding navigation
                        const newDetailTabButtons = this.container.querySelectorAll('.detail-tab-btn:not(.add-stage-btn)');
                        newDetailTabButtons.forEach(btn => {
                            const detailTabName = btn.getAttribute('data-detail-tab');
                            btn.classList.toggle('active', detailTabName === this.activeDetailTab);
                        });
                        
                        // Setup add stage button handler
                        const addStageBtn = this.container.querySelector('#addStageBtn');
                        if (addStageBtn) {
                            addStageBtn.addEventListener('click', (e) => {
                                e.stopPropagation();
                                this.handleAddStage();
                            });
                        }
                    }
                }
            }
        }
        
        this.logger.log('Tab states restored successfully');
    }

    /**
     * Create mock instance data to simulate a real workflow instance
     */
    createMockInstanceData() {
        const now = new Date();
        const createdDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)); // 7 days ago
        
        this.mockInstanceData = {
            id: 'preview-instance',
            workflow_id: this.workflowData.id,
            current_stage: this.stages[0]?.name || 'Start',
            status: 'in_progress',
            created_at: createdDate.toISOString(),
            updated_at: now.toISOString(),
            current_participant: 'Preview User',
            location: {
                lat: 51.505,
                lng: -0.09,
                address: 'Preview Location'
            }
        };
    }

    /**
     * Render empty state when no stages exist
     */
    renderEmptyState() {
        this.container.innerHTML = `
            <div class="preview-empty">
                <i class="fas fa-project-diagram"></i>
                <h4>No Workflow Stages</h4>
                <p>Add stages to your workflow to see the participant preview</p>
            </div>
        `;
    }

    /**
     * Render the main participants sidebar structure
     */
    renderParticipantsSidebar() {
        this.container.innerHTML = `
            <div class="marker-detail-container">
                <!-- Tab Navigation -->
                <div class="tab-navigation">
                    <div class="tab-buttons">
                        <button class="tab-btn ${this.activeTab === 'overview' ? 'active' : ''}" data-tab="overview">
                            Übersicht
                        </button>
                        <button class="tab-btn ${this.activeTab === 'details' ? 'active' : ''}" data-tab="details">
                            Details
                        </button>
                        <button class="tab-btn ${this.activeTab === 'audit-trail' ? 'active' : ''}" data-tab="audit-trail">
                            Audit Trail
                        </button>
                    </div>
                </div>
                
                <!-- Tab Content -->
                <div class="tab-content-area">
                    <!-- Detail Sub-Tab Navigation (shown when details tab is active) -->
                    ${this.activeTab === 'details' ? this.renderDetailTabNavigation() : ''}
                    
                    <div id="tabContent">
                        ${this.renderTabContent()}
                    </div>
                </div>
            </div>
        `;
        
        this.setupEventHandlers();
    }

    /**
     * Render detail sub-tab navigation
     */
    renderDetailTabNavigation() {
        if (this.stages.length === 0) {
            return '';
        }
        
        const stageButtons = this.stages.map(stage => `
            <button class="detail-tab-btn ${this.activeDetailTab === stage.name ? 'active' : ''}" 
                    data-detail-tab="${stage.name}">
                <i class="fas fa-plus"></i>
                ${stage.name}
            </button>
        `).join('');
        
        return `
            <div class="detail-tab-navigation">
                <div class="detail-tab-buttons connected-tabs">
                    ${stageButtons}
                    <button class="row-options-btn add-stage-btn" 
                            id="addStageBtn" 
                            title="Add New Stage">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Render tab content based on active tab
     */
    renderTabContent() {
        switch (this.activeTab) {
            case 'overview':
                return this.renderOverviewTab();
            case 'details':
                return this.renderDetailsTab();
            case 'audit-trail':
                return this.renderAuditTrailTab();
            default:
                return '<p>Invalid tab</p>';
        }
    }

    /**
     * Render overview tab content (Übersicht)
     */
    renderOverviewTab() {
        const createdDate = new Date(this.mockInstanceData.created_at).toLocaleDateString('de-DE');
        const updatedDate = new Date(this.mockInstanceData.updated_at).toLocaleDateString('de-DE');
        
        return `
            <div class="overview-content">
                <!-- Core Info Section -->
                <div class="core-info-section">
                    <div class="info-item">
                        <i class="fas fa-map-marker-alt info-icon"></i>
                        <div class="info-content">
                            <div class="info-value">${this.mockInstanceData.location?.address || 'Preview Location'}</div>
                            ${this.renderLocationUpdateButton()}
                        </div>
                    </div>
                    
                    <div class="info-item">
                        <i class="fas fa-clock info-icon"></i>
                        <div class="info-content">
                            <div class="info-label">Erstellt</div>
                            <div class="info-value">${createdDate}</div>
                        </div>
                    </div>
                    
                    <div class="info-item">
                        <i class="fas fa-user info-icon"></i>
                        <div class="info-content">
                            <div class="info-label">Aktueller Bearbeiter</div>
                            <button class="info-action assignment-permissions-btn btn-success" data-action="configure-assignment-permissions">
                                <i class="fas fa-check"></i> Zuweisungsberechtigungen (konfiguriert)
                            </button>
                        </div>
                    </div>
                    
                    <div class="info-item">
                        <i class="fas fa-tasks info-icon"></i>
                        <div class="info-content">
                            <div class="info-label">Aktueller Stage</div>
                            <div class="info-value">${this.mockInstanceData.current_stage}</div>
                        </div>
                    </div>
                    
                </div>
                
                
                <!-- Form Fields Overview -->
                ${this.formFields.length > 0 ? `
                    <div class="form-fields-overview-section">
                        <h4>Formular Überblick</h4>
                        <div class="fields-by-stage">
                            ${this.stages.map(stage => {
                                const stageFields = this.getStageFormFields(stage);
                                return `
                                    <div class="stage-field-overview">
                                        <div class="stage-overview-header">
                                            <span class="stage-overview-name">${stage.name}</span>
                                            <span class="stage-overview-count">${stageFields.length} Felder</span>
                                        </div>
                                        ${stageFields.length > 0 ? `
                                            <div class="stage-overview-fields">
                                                ${stageFields.slice(0, 3).map(field => `
                                                    <span class="field-preview-chip">
                                                        ${this.getFieldLabel(field)}
                                                        <small>(${this.getFieldTypeLabel(field.type || field.field_type || 'text')})</small>
                                                    </span>
                                                `).join('')}
                                                ${stageFields.length > 3 ? `<span class="more-fields">+${stageFields.length - 3} weitere</span>` : ''}
                                            </div>
                                        ` : '<div class="no-stage-fields">Keine Felder konfiguriert</div>'}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Render available actions for current stage
     */
    renderAvailableActions() {
        // Find actions from current stage
        const currentStage = this.stages.find(s => s.name === this.mockInstanceData.current_stage);
        if (!currentStage) {
            return '<p class="no-actions">Keine Aktionen verfügbar</p>';
        }
        
        const stageActions = this.actions.filter(action => action.fromStage === currentStage.id);
        
        if (stageActions.length === 0) {
            return '<p class="no-actions">Keine Aktionen konfiguriert</p>';
        }
        
        return stageActions.map(action => `
            <button class="action-btn" disabled>
                <i class="fas fa-arrow-right"></i>
                ${action.name || 'Unnamed Action'}
            </button>
        `).join('');
    }

    /**
     * Render details tab content
     */
    renderDetailsTab() {
        const currentStage = this.stages.find(s => s.name === this.activeDetailTab);
        
        if (!currentStage) {
            return '<div class="no-data">Stage nicht gefunden</div>';
        }
        
        return `
            <div class="details-content">
                <div class="detail-tab-content">
                    ${this.renderStageContent(currentStage)}
                </div>
            </div>
        `;
    }

    /**
     * Render content for a specific stage
     */
    renderStageContent(stage) {
        const stageFields = this.getStageFormFields(stage);
        
        return `
            <div class="stage-content">
                <div class="stage-header">
                    <h4>${stage.name}</h4>
                    <span class="stage-type-badge">${this.getStageTypeLabel(stage.type)}</span>
                </div>
                
                <div class="stage-form-pages">
                    ${this.renderFormPages(stageFields, stage)}
                </div>
            </div>
        `;
    }

    /**
     * Render form pages with fields grouped by page
     */
    renderFormPages(fields, stage) {
        // Group fields by page
        const fieldsByPage = this.groupFieldsByPage(fields);
        const pages = Object.keys(fieldsByPage).sort((a, b) => parseInt(a) - parseInt(b));
        
        let pagesHtml = '';
        
        // Render each page
        pages.forEach(pageNum => {
            const pageFields = fieldsByPage[pageNum];
            const pageTitle = pageFields[0]?.page_title || `Page ${pageNum}`;
            
            pagesHtml += `
                <div class="form-page-card" data-page="${pageNum}">
                    <div class="page-header">
                        <h5 class="page-title">${pageTitle}</h5>
                        <div class="page-meta">
                            <span class="field-count">${pageFields.length} fields</span>
                        </div>
                    </div>
                    <div class="page-fields" data-page="${pageNum}">
                        ${pageFields.map((field, index) => this.renderFormField(field, pageNum, index)).join('')}
                    </div>
                    <div class="page-add-field">
                        <div class="workflow-dropdown-wrapper">
                            <button class="workflow-dropdown-btn page-add-field-btn" 
                                    data-stage-id="${stage.id}" 
                                    data-stage-name="${stage.name}"
                                    data-page="${pageNum}"
                                    title="Add Field to ${pageTitle}">
                                <i class="fas fa-plus"></i>
                            </button>
                            <div class="workflow-field-dropdown page-add-field-dropdown">
                                <button class="workflow-field-dropdown-item" data-field-type="short" data-stage-id="${stage.id}" data-page="${pageNum}">
                                    <i class="fas fa-font"></i>
                                    <span>Short Text</span>
                                </button>
                                <button class="workflow-field-dropdown-item" data-field-type="long" data-stage-id="${stage.id}" data-page="${pageNum}">
                                    <i class="fas fa-align-left"></i>
                                    <span>Long Text</span>
                                </button>
                                <button class="workflow-field-dropdown-item" data-field-type="multiple" data-stage-id="${stage.id}" data-page="${pageNum}">
                                    <i class="fas fa-list-ul"></i>
                                    <span>Multiple Choice</span>
                                </button>
                                <button class="workflow-field-dropdown-item" data-field-type="dropdown" data-stage-id="${stage.id}" data-page="${pageNum}">
                                    <i class="fas fa-chevron-down"></i>
                                    <span>Dropdown</span>
                                </button>
                                <button class="workflow-field-dropdown-item" data-field-type="smart_dropdown" data-stage-id="${stage.id}" data-page="${pageNum}">
                                    <i class="fas fa-magic"></i>
                                    <span>Smart Dropdown</span>
                                </button>
                                <button class="workflow-field-dropdown-item" data-field-type="date" data-stage-id="${stage.id}" data-page="${pageNum}">
                                    <i class="fas fa-calendar"></i>
                                    <span>Date</span>
                                </button>
                                <button class="workflow-field-dropdown-item" data-field-type="number" data-stage-id="${stage.id}" data-page="${pageNum}">
                                    <i class="fas fa-hashtag"></i>
                                    <span>Number</span>
                                </button>
                                <button class="workflow-field-dropdown-item" data-field-type="email" data-stage-id="${stage.id}" data-page="${pageNum}">
                                    <i class="fas fa-envelope"></i>
                                    <span>Email</span>
                                </button>
                                <button class="workflow-field-dropdown-item" data-field-type="file" data-stage-id="${stage.id}" data-page="${pageNum}">
                                    <i class="fas fa-file"></i>
                                    <span>File Upload</span>
                                </button>
                                <button class="workflow-field-dropdown-item" data-field-type="signature" data-stage-id="${stage.id}" data-page="${pageNum}">
                                    <i class="fas fa-signature"></i>
                                    <span>Signature</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        // Add "Add Page" button
        pagesHtml += `
            <div class="add-page-card">
                <button class="row-options-btn add-page-btn" 
                        data-stage-id="${stage.id}" 
                        data-stage-name="${stage.name}"
                        title="Add New Page">
                    <i class="fas fa-plus"></i>
                    Add Page
                </button>
            </div>
        `;
        
        return pagesHtml;
    }

    /**
     * Group fields by page number
     */
    groupFieldsByPage(fields) {
        const fieldsByPage = {};
        
        fields.forEach(field => {
            const page = field.page || 1;
            if (!fieldsByPage[page]) {
                fieldsByPage[page] = [];
            }
            fieldsByPage[page].push(field);
        });
        
        // Sort fields within each page by field_order
        Object.keys(fieldsByPage).forEach(page => {
            fieldsByPage[page].sort((a, b) => (a.field_order || a.order || 0) - (b.field_order || b.order || 0));
        });
        
        // If no pages exist, create page 1
        if (Object.keys(fieldsByPage).length === 0) {
            fieldsByPage['1'] = [];
        }
        
        return fieldsByPage;
    }

    /**
     * Render individual form field as it would appear to participants
     */
    renderFormField(field, pageNum, fieldIndex) {
        // Skip rendering fields without proper identification
        if (!field || typeof field !== 'object') {
            this.logger.warn('Skipping invalid field object:', field);
            return '';
        }
        
        const isRequired = field.validation && field.validation.required;
        const fieldClass = 'form-field-preview';
        
        // Get field label with fallbacks
        const fieldLabel = field.label || field.field_label || field.name || field.field_name || field.key || field.field_key || 'Unnamed Field';
        
        // Debug: Log when we render an unnamed field
        if (fieldLabel === 'Unnamed Field') {
            this.logger.warn('Rendering Unnamed Field - field data:', {
                field: field,
                pageNum: pageNum,
                fieldIndex: fieldIndex,
                available_properties: Object.keys(field)
            });
            // Skip rendering fields that have no identifiable label
            return '';
        }
        const fieldPlaceholder = field.placeholder || field.field_placeholder || '';
        const fieldHelp = field.help || field.field_help || field.description || '';
        const fieldType = field.type || field.field_type || 'text';
        const fieldId = field.id || field.field_id || `field_${pageNum}_${fieldIndex}`;
        
        // Get field options with fallback
        const fieldOptions = field.options || field.field_options || [];
        
        const fieldHtml = this.renderFieldByType(fieldType, fieldLabel, isRequired, fieldHelp, fieldOptions, field);
        
        return `
            <div class="${fieldClass}" data-field-id="${fieldId}" data-page="${pageNum}" data-field-index="${fieldIndex}" draggable="true">
                <div class="field-drag-handle">
                    <i class="fas fa-grip-vertical"></i>
                </div>
                ${fieldHtml}
            </div>
        `;
    }

    /**
     * Render field HTML by type
     */
    renderFieldByType(fieldType, fieldLabel, isRequired, fieldHelp, fieldOptions, field) {
        switch (fieldType) {
            case 'short':
            case 'text':
                return `
                    <label class="field-label">
                        ${fieldLabel}
                        ${isRequired ? '<span class="required">*</span>' : ''}
                    </label>
                    <input type="text" class="field-input" disabled>
                    ${fieldHelp ? `<div class="field-help">${fieldHelp}</div>` : ''}
                `;
                
            case 'long':
            case 'textarea':
                return `
                    <label class="field-label">
                        ${fieldLabel}
                        ${isRequired ? '<span class="required">*</span>' : ''}
                    </label>
                    <textarea class="field-input" rows="3" disabled></textarea>
                    ${fieldHelp ? `<div class="field-help">${fieldHelp}</div>` : ''}
                `;
                
            case 'multiple':
            case 'checkbox':
                const checkboxOptions = Array.isArray(fieldOptions) ? fieldOptions : ['Option 1', 'Option 2', 'Option 3'];
                const checkboxes = checkboxOptions.map((option, index) => `
                    <label class="checkbox-option">
                        <input type="checkbox" disabled>
                        <span class="checkbox-text">${option}</span>
                    </label>
                `).join('');
                
                return `
                    <label class="field-label">
                        ${fieldLabel}
                        ${isRequired ? '<span class="required">*</span>' : ''}
                    </label>
                    <div class="checkbox-group">
                        ${checkboxes}
                    </div>
                    ${fieldHelp ? `<div class="field-help">${fieldHelp}</div>` : ''}
                `;
                
            case 'dropdown':
            case 'select':
                const dropdownOptions = Array.isArray(fieldOptions) ? fieldOptions : ['Option 1', 'Option 2', 'Option 3'];
                const optionElements = dropdownOptions.map(option => 
                    `<option value="${option}">${option}</option>`
                ).join('');
                
                return `
                    <label class="field-label">
                        ${fieldLabel}
                        ${isRequired ? '<span class="required">*</span>' : ''}
                    </label>
                    <select class="field-input" disabled>
                        <option value="">Bitte wählen...</option>
                        ${optionElements}
                    </select>
                    ${fieldHelp ? `<div class="field-help">${fieldHelp}</div>` : ''}
                `;
                
            case 'date':
                return `
                    <label class="field-label">
                        ${fieldLabel}
                        ${isRequired ? '<span class="required">*</span>' : ''}
                    </label>
                    <input type="date" class="field-input" disabled>
                    ${fieldHelp ? `<div class="field-help">${fieldHelp}</div>` : ''}
                `;
                
            case 'photo':
            case 'image':
                return `
                    <label class="field-label">
                        ${fieldLabel}
                        ${isRequired ? '<span class="required">*</span>' : ''}
                    </label>
                    <div class="photo-upload-preview">
                        <div class="photo-upload-area">
                            <i class="fas fa-camera"></i>
                            <span>Foto hinzufügen</span>
                        </div>
                    </div>
                    ${fieldHelp ? `<div class="field-help">${fieldHelp}</div>` : ''}
                `;
                
            case 'smart_dropdown':
                return `
                    <label class="field-label">
                        ${fieldLabel}
                        ${isRequired ? '<span class="required">*</span>' : ''}
                    </label>
                    <select class="field-input smart-dropdown" disabled>
                        <option value="">Daten laden...</option>
                    </select>
                    <small class="field-source">Datenquelle: ${field.sourceTable || field.source_table || 'Konfigurierte Tabelle'}</small>
                    ${fieldHelp ? `<div class="field-help">${fieldHelp}</div>` : ''}
                `;
                
            default:
                return `
                    <label class="field-label">
                        ${fieldLabel}
                        ${isRequired ? '<span class="required">*</span>' : ''}
                    </label>
                    <input type="text" class="field-input" disabled>
                    ${fieldHelp ? `<div class="field-help">${fieldHelp}</div>` : ''}
                `;
        }
    }

    /**
     * Render audit trail tab
     */
    renderAuditTrailTab() {
        // Generate mock audit trail data based on workflow configuration
        const auditEntries = this.generateMockAuditTrail();
        
        return `
            <div class="audit-trail-content">
                <div class="audit-trail-header">
                    <h4>Aktivitätsverlauf</h4>
                    <div class="audit-stats">
                        <span class="audit-stat">
                            <i class="fas fa-list"></i>
                            ${auditEntries.length} Einträge
                        </span>
                        <span class="audit-stat">
                            <i class="fas fa-wpforms"></i>
                            ${this.formFields.length} Felder konfiguriert
                        </span>
                    </div>
                </div>
                
                <div class="audit-trail-list">
                    ${auditEntries.map(entry => `
                        <div class="audit-entry">
                            <div class="audit-timestamp">
                                <i class="fas fa-clock"></i>
                                <span>
                                    ${new Date(entry.timestamp).toLocaleDateString('de-DE')}
                                    ${new Date(entry.timestamp).toLocaleTimeString('de-DE')}
                                </span>
                            </div>
                            <div class="audit-details">
                                <div class="audit-participant">
                                    <i class="fas fa-user"></i>
                                    ${entry.participant}
                                </div>
                                <div class="audit-action">${entry.action}</div>
                                ${entry.stage ? `<div class="audit-stage">Stage: ${entry.stage}</div>` : ''}
                                ${entry.fields ? `<div class="audit-fields">Felder: ${entry.fields.join(', ')}</div>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                <!-- Field Configuration Summary -->
                <div class="audit-field-summary">
                    <h5>Feld-Konfiguration</h5>
                    <div class="field-summary-grid">
                        ${this.stages.map(stage => {
                            const stageFields = this.getStageFormFields(stage);
                            return `
                                <div class="stage-field-summary">
                                    <div class="stage-name">${stage.name}</div>
                                    <div class="stage-field-count">${stageFields.length} Felder</div>
                                    ${stageFields.length > 0 ? `
                                        <div class="stage-field-types">
                                            ${this.getFieldTypeSummary(stageFields)}
                                        </div>
                                    ` : '<div class="no-fields">Keine Felder</div>'}
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                
                <div class="audit-preview-note">
                    <i class="fas fa-info-circle"></i>
                    <span>Preview Mode - In der echten Anwendung werden hier alle Änderungen und Bearbeitungen dokumentiert</span>
                </div>
            </div>
        `;
    }

    /**
     * Generate mock audit trail data based on workflow configuration
     */
    generateMockAuditTrail() {
        const entries = [];
        const now = new Date();
        
        // Workflow creation entry
        entries.push({
            timestamp: new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)).toISOString(),
            participant: 'System',
            action: 'Workflow erstellt',
            stage: null,
            fields: null
        });
        
        // Stage configuration entries
        this.stages.forEach((stage, index) => {
            const stageFields = this.getStageFormFields(stage);
            entries.push({
                timestamp: new Date(now.getTime() - ((6 - index) * 24 * 60 * 60 * 1000)).toISOString(),
                participant: 'Administrator',
                action: `Stage konfiguriert: ${stage.name}`,
                stage: stage.name,
                fields: stageFields.length > 0 ? stageFields.map(f => this.getFieldLabel(f)).slice(0, 3) : null
            });
        });
        
        // Field configuration entry
        if (this.formFields.length > 0) {
            entries.push({
                timestamp: new Date(now.getTime() - (1 * 24 * 60 * 60 * 1000)).toISOString(),
                participant: 'Administrator',
                action: `${this.formFields.length} Formularfelder konfiguriert`,
                stage: null,
                fields: this.formFields.map(f => this.getFieldLabel(f)).slice(0, 5)
            });
        }
        
        // Preview access entry
        entries.push({
            timestamp: now.toISOString(),
            participant: 'Preview User',
            action: 'Workflow-Vorschau angezeigt',
            stage: this.activeDetailTab,
            fields: null
        });
        
        return entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }
    
    /**
     * Get field label with fallback
     */
    getFieldLabel(field) {
        const label = field.label || field.field_label || field.name || field.field_name || field.key || field.field_key || 'Unnamed Field';
        
        // Debug: Log when we get an unnamed field to understand why
        if (label === 'Unnamed Field') {
            this.logger.warn('Unnamed Field detected - field data:', {
                field: field,
                available_properties: Object.keys(field),
                hasLabel: !!field.label,
                hasFieldLabel: !!field.field_label,
                hasName: !!field.name,
                hasFieldName: !!field.field_name,
                hasKey: !!field.key,
                hasFieldKey: !!field.field_key
            });
        }
        
        return label;
    }
    
    /**
     * Get field type summary for a stage
     */
    getFieldTypeSummary(fields) {
        const typeCounts = {};
        fields.forEach(field => {
            const type = field.type || field.field_type || 'text';
            typeCounts[type] = (typeCounts[type] || 0) + 1;
        });
        
        const typeLabels = {
            'short': 'Text',
            'text': 'Text',
            'long': 'Textarea',
            'textarea': 'Textarea',
            'multiple': 'Checkbox',
            'checkbox': 'Checkbox',
            'dropdown': 'Dropdown',
            'select': 'Dropdown',
            'date': 'Datum',
            'photo': 'Foto',
            'image': 'Foto',
            'smart_dropdown': 'Smart Dropdown'
        };
        
        return Object.entries(typeCounts)
            .map(([type, count]) => `${count}x ${typeLabels[type] || type}`)
            .join(', ');
    }

    /**
     * Get readable label for field type
     */
    getFieldTypeLabel(type) {
        const typeLabels = {
            'short': 'Text',
            'text': 'Text',
            'long': 'Textarea',
            'textarea': 'Textarea',
            'multiple': 'Checkbox',
            'checkbox': 'Checkbox',
            'dropdown': 'Dropdown',
            'select': 'Dropdown',
            'date': 'Datum',
            'photo': 'Foto',
            'image': 'Foto',
            'smart_dropdown': 'Smart Dropdown'
        };
        return typeLabels[type] || type;
    }

    /**
     * Setup event handlers for tab switching and add buttons using event delegation
     */
    setupEventHandlers() {
        console.log('Setting up event handlers, container:', this.container);
        // Remove any existing event listeners first
        this.cleanupEventListeners();
        
        // Use event delegation to avoid duplicate listeners
        this.containerClickHandler = (e) => {
            
            // Check for page-add-field-btn in target or parent elements
            let target = e.target;
            let attempts = 0;
            while (target && attempts < 3) {
                if (target.classList && target.classList.contains('page-add-field-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const button = target;
                    console.log('ENHANCED DEBUG: Button element analysis:');
                    console.log('  Button:', button);
                    console.log('  Button HTML:', button.outerHTML);
                    console.log('  Button parent:', button.parentElement);
                    console.log('  Button parent HTML:', button.parentElement ? button.parentElement.outerHTML : 'null');

                    let dropdown = button.nextElementSibling;
                    console.log('ENHANCED DEBUG: Dropdown analysis:');
                    console.log('  nextElementSibling:', dropdown);

                    if (!dropdown) {
                        console.log('ENHANCED DEBUG: nextElementSibling is null, searching for moved dropdown...');
                        
                        // Find dropdown that was moved to body based on button's stage-id and page
                        const stageId = button.dataset.stageId;
                        const page = button.dataset.page;
                        
                        dropdown = document.querySelector(`body > .workflow-field-dropdown[data-stage-id="${stageId}"][data-page="${page}"]`);
                        
                        if (!dropdown) {
                            // Try broader search for any dropdown with matching stage/page attributes
                            const dropdowns = document.querySelectorAll('body > .workflow-field-dropdown');
                            for (const d of dropdowns) {
                                const firstItem = d.querySelector('.workflow-field-dropdown-item');
                                if (firstItem && 
                                    firstItem.dataset.stageId === stageId && 
                                    firstItem.dataset.page === page) {
                                    dropdown = d;
                                    console.log('Found moved dropdown by matching first item attributes');
                                    break;
                                }
                            }
                        }
                        
                        if (!dropdown) {
                            console.log('Still not found, trying original parent location...');
                            dropdown = button.parentElement.querySelector('.workflow-field-dropdown');
                        }
                    }

                    if (!dropdown) {
                        console.error('ENHANCED DEBUG: All dropdown finding methods failed');
                        return;
                    }

                    console.log('ENHANCED DEBUG: Final dropdown element:');
                    console.log('  Dropdown:', dropdown);
                    console.log('  Dropdown classes:', dropdown.className);
                    console.log('  Has workflow-field-dropdown class:', dropdown.classList.contains('workflow-field-dropdown'));

                    // Close all other dropdowns and clean up their handlers
                    document.querySelectorAll('.row-actions-dropdown.show, .workflow-field-dropdown.show').forEach(d => {
                        if (d !== dropdown) {
                            d.classList.remove('show');
                        }
                    });
                    this.cleanupDropdownScrollHandler();
                    
                    // Position the dropdown dynamically to break out of card boundaries
                    const wasVisible = dropdown.classList.contains('show');
                    console.log('ENHANCED DEBUG: Before toggle:');
                    console.log('  wasVisible:', wasVisible);
                    console.log('  Current classes:', dropdown.className);
                    console.log('  Current computed display:', window.getComputedStyle(dropdown).display);

                    dropdown.classList.toggle('show');

                    console.log('ENHANCED DEBUG: After toggle:');
                    console.log('  Now has show class:', dropdown.classList.contains('show'));
                    console.log('  Current classes:', dropdown.className);
                    console.log('  Current computed display:', window.getComputedStyle(dropdown).display);
                    console.log('  Dropdown bounding rect:', dropdown.getBoundingClientRect());

                    if (dropdown.classList.contains('show')) {
                        console.log('ENHANCED DEBUG: Dropdown should now be visible, positioning...');
                        // Position dropdown when showing - use appropriate positioning function
                        if (dropdown.classList.contains('workflow-field-dropdown')) {
                            this.positionWorkflowDropdown(button, dropdown);
                            console.log('ENHANCED DEBUG: After positioning:', dropdown.getBoundingClientRect());
                        } else {
                            this.positionDropdown(button, dropdown);
                        }
                        
                        // Update position on scroll
                        this.setupDropdownScrollHandler(button, dropdown);
                    } else {
                        console.log('ENHANCED DEBUG: Dropdown hidden, cleaning up...');
                        // Clean up scroll handler when hiding
                        this.cleanupDropdownScrollHandler();
                    }

                    // Add a timeout to check final state
                    setTimeout(() => {
                        console.log('ENHANCED DEBUG: Final state after 100ms:');
                        console.log('  Final computed display:', window.getComputedStyle(dropdown).display);
                        console.log('  Final bounding rect:', dropdown.getBoundingClientRect());
                        console.log('  Final classes:', dropdown.className);
                    }, 100);
                    return;
                }
                target = target.parentElement;
                attempts++;
            }
            
            // Handle main tab clicks
            if (e.target.matches('.tab-btn')) {
                const tab = e.target.getAttribute('data-tab');
                if (tab) {
                    this.switchTab(tab);
                    return;
                }
            }
            
            // Handle detail tab clicks (excluding add stage button)
            if (e.target.matches('.detail-tab-btn:not(.add-stage-btn)')) {
                const detailTab = e.target.getAttribute('data-detail-tab');
                if (detailTab) {
                    this.switchDetailTab(detailTab);
                    return;
                }
            }
            
            // Handle add stage button
            if (e.target.matches('#addStageBtn') || e.target.closest('#addStageBtn')) {
                e.stopPropagation();
                this.handleAddStage();
                return;
            }
            
            // Handle add field buttons (legacy and page-based)
            if (e.target.matches('.add-field-btn') || e.target.closest('.add-field-btn')) {
                e.stopPropagation();
                const button = e.target.matches('.add-field-btn') ? e.target : e.target.closest('.add-field-btn');
                const stageId = button.getAttribute('data-stage-id');
                const stageName = button.getAttribute('data-stage-name');
                const page = button.getAttribute('data-page');
                if (page) {
                    this.handleAddFieldToPage(stageId, stageName, parseInt(page));
                } else {
                    this.handleAddField(stageId, stageName);
                }
                return;
            }
            
            
            // Check for dropdown field type selection (improved to handle clicks on child elements)
            const dropdownButton = e.target.closest('.workflow-field-dropdown-item[data-field-type]') || e.target.closest('.row-action-item[data-field-type]');
            
            if (dropdownButton) {
                e.preventDefault();
                e.stopPropagation();
                
                const fieldType = dropdownButton.getAttribute('data-field-type');
                const stageId = dropdownButton.getAttribute('data-stage-id');
                const page = parseInt(dropdownButton.getAttribute('data-page'));
                
                // Close dropdown and clean up handlers
                const dropdown = dropdownButton.closest('.row-actions-dropdown') || dropdownButton.closest('.workflow-field-dropdown');
                if (dropdown) {
                    dropdown.classList.remove('show');
                }
                this.cleanupDropdownScrollHandler();
                
                // Open field editor with the selected field type
                this.handleAddFieldToPageWithType(stageId, fieldType, page);
                return;
            }
            
            // Handle add page buttons
            if (e.target.matches('.add-page-btn') || e.target.closest('.add-page-btn')) {
                e.stopPropagation();
                const button = e.target.matches('.add-page-btn') ? e.target : e.target.closest('.add-page-btn');
                const stageId = button.getAttribute('data-stage-id');
                const stageName = button.getAttribute('data-stage-name');
                this.handleAddPage(stageId, stageName);
                return;
            }
            
            // Handle location update button
            if (e.target.matches('.location-update-btn') || e.target.closest('.location-update-btn')) {
                e.stopPropagation();
                const button = e.target.matches('.location-update-btn') ? e.target : e.target.closest('.location-update-btn');
                const action = button.getAttribute('data-action');
                if (action === 'configure-location-update') {
                    this.handleLocationUpdateConfiguration();
                }
                return;
            }
            
            // Handle assignment permissions button
            if (e.target.matches('.assignment-permissions-btn') || e.target.closest('.assignment-permissions-btn')) {
                e.stopPropagation();
                const button = e.target.matches('.assignment-permissions-btn') ? e.target : e.target.closest('.assignment-permissions-btn');
                const action = button.getAttribute('data-action');
                if (action === 'configure-assignment-permissions') {
                    this.handleAssignmentPermissionsConfiguration();
                }
                return;
            }
        };
        
        // Add single delegated event listener
        this.container.addEventListener('click', this.containerClickHandler);
        
        // Add document-level click handler for dropdowns moved to body
        this.documentClickHandler = (e) => {
            // Handle clicks on workflow-field-dropdown-item elements (moved to body)
            const dropdownButton = e.target.closest('.workflow-field-dropdown-item[data-field-type]');
            if (dropdownButton) {
                // Use the same logic as the container click handler
                this.containerClickHandler(e);
                return;
            }
            
            // Close dropdowns when clicking outside
            if (!e.target.closest('.row-actions-wrapper') && !e.target.closest('.workflow-dropdown-wrapper')) {
                document.querySelectorAll('.row-actions-dropdown.show, .workflow-field-dropdown.show').forEach(dropdown => {
                    dropdown.classList.remove('show');
                });
                this.cleanupDropdownScrollHandler();
            }
        };
        
        document.addEventListener('click', this.documentClickHandler);
        
        // Setup drag and drop for fields
        this.setupFieldDragAndDrop();
        
        this.logger.log('Event handlers setup with delegation');
    }

    /**
     * Clean up event listeners
     */
    cleanupEventListeners() {
        if (this.containerClickHandler && this.container) {
            this.container.removeEventListener('click', this.containerClickHandler);
            this.containerClickHandler = null;
        }
        
        if (this.documentClickHandler) {
            document.removeEventListener('click', this.documentClickHandler);
            this.documentClickHandler = null;
        }
        
        // Also clean up drag listeners
        this.cleanupDragListeners();
    }

    /**
     * Switch main tab
     */
    switchTab(tab) {
        this.activeTab = tab;
        
        // Save state immediately when tab changes
        this.savePreviewState();
        
        // Update button states
        const tabButtons = this.container.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
        });
        
        // Update only the tab content, not the whole sidebar
        const tabContent = this.container.querySelector('#tabContent');
        if (tabContent) {
            tabContent.innerHTML = this.renderTabContent();
            
            // Event delegation handles all interactions - no need to re-setup
        }
        
        // Update detail navigation visibility
        const tabContentArea = this.container.querySelector('.tab-content-area');
        const existingDetailNav = tabContentArea.querySelector('.detail-tab-navigation');
        
        if (tab === 'details') {
            // Add detail navigation if not present
            if (!existingDetailNav) {
                const detailNavHtml = this.renderDetailTabNavigation();
                if (detailNavHtml) {
                    tabContent.insertAdjacentHTML('beforebegin', detailNavHtml);
                    // Setup event handlers for new navigation
                    // Event delegation handles all interactions - no need to re-setup
                }
            }
        } else {
            // Remove detail navigation if switching away from details
            if (existingDetailNav) {
                existingDetailNav.remove();
            }
        }
        
        this.logger.log('Tab switched and state saved:', {
            activeTab: this.activeTab,
            activeDetailTab: this.activeDetailTab
        });
    }

    /**
     * Switch detail sub-tab
     */
    switchDetailTab(detailTab) {
        this.activeDetailTab = detailTab;
        
        // Save state immediately when detail tab changes
        this.savePreviewState();
        
        // Update detail content
        const detailContent = this.container.querySelector('.detail-tab-content');
        if (detailContent) {
            const stage = this.stages.find(s => s.name === detailTab);
            if (stage) {
                detailContent.innerHTML = this.renderStageContent(stage);
            }
        }
        
        // Update button states
        const detailTabButtons = this.container.querySelectorAll('.detail-tab-btn');
        detailTabButtons.forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-detail-tab') === detailTab);
        });
        
        this.logger.log('Detail tab switched and state saved:', {
            activeTab: this.activeTab,
            activeDetailTab: this.activeDetailTab
        });
    }

    /**
     * Get form fields for a specific stage
     * Gets fresh data directly from local state instead of using potentially stale stage object
     */
    getStageFormFields(stage) {
        this.logger.log('Getting form fields for stage:', {
            stageName: stage.name,
            stageId: stage.id,
            stageOrder: stage.order,
            stageType: stage.type
        });
        
        let matchingFields = [];
        
        // Get fresh stage data from local state if available
        let freshStageData = stage;
        if (window.workflowBuilder && window.workflowBuilder.localState) {
            const localState = window.workflowBuilder.localState.getState();
            const localStage = localState.stages.get(stage.id);
            if (localStage) {
                freshStageData = localStage;
                this.logger.log('Using fresh stage data from local state');
            }
        }
        
        // FIRST: Check if the stage itself has form fields in local storage
        if (freshStageData.formFields && Array.isArray(freshStageData.formFields) && freshStageData.formFields.length > 0) {
            this.logger.log('Found form fields directly on stage from local storage:', freshStageData.formFields.length);
            matchingFields = [...freshStageData.formFields];
        }
        
        // SECOND: Check actions associated with this stage (both incoming and outgoing)
        // Get fresh actions from local state if available
        let freshActions = this.actions;
        if (window.workflowBuilder && window.workflowBuilder.localState) {
            const localState = window.workflowBuilder.localState.getState();
            freshActions = Array.from(localState.actions.values());
        }
        
        // Only include actions that END at this stage (incoming actions)
        // Actions that START from this stage should not show their fields in the stage view
        const stageActions = freshActions.filter(action => 
            action.toStageId === stage.id ||
            action.toStage === stage.id
        );
        
        this.logger.log('Found actions associated with stage:', {
            stageName: stage.name,
            stageId: stage.id,
            actionsCount: stageActions.length,
            actions: stageActions.map(a => ({
                name: a.name,
                type: a.type,
                actionType: a.actionType,
                fromStageId: a.fromStageId,
                toStageId: a.toStageId,
                formFieldsCount: a.formFields ? a.formFields.length : 0,
                editableFieldsCount: a.editableFields ? a.editableFields.length : 0
            }))
        });
        
        // Add fields from all associated actions
        stageActions.forEach(action => {
            // Add regular form fields from actions
            if (action.formFields && Array.isArray(action.formFields)) {
                this.logger.log('Adding form fields from action:', {
                    actionName: action.name,
                    fieldsCount: action.formFields.length
                });
                matchingFields.push(...action.formFields);
            }
            
            // Add editable fields from edit actions
            if (action.editableFields && Array.isArray(action.editableFields)) {
                this.logger.log('Adding editable fields from action:', {
                    actionName: action.name,
                    actionType: action.actionType || action.type,
                    fieldsCount: action.editableFields.length
                });
                matchingFields.push(...action.editableFields);
            }
        });
        
        // THIRD: Check global formFields array for any fields associated with this stage
        // DISABLED: This was causing cross-stage contamination where page 1 fields from other stages
        // were appearing in the current stage. Fields should be properly stored in stages or actions.
        /*
        const globalMatchingFields = this.formFields.filter(field => {
            // Try various ways fields might be associated with a stage
            const matches = field.stageId === stage.id || 
                           field.stage_id === stage.id ||
                           field.formStageId === stage.id ||
                           field.form_stage_id === stage.id ||
                           // Also check by stage name/key if no ID match
                           field.stageName === stage.name ||
                           field.stage_name === stage.name ||
                           field.stageKey === stage.key ||
                           field.stage_key === stage.key;
            
            if (matches) {
                this.logger.log('Field matched for stage from global fields:', {
                    fieldLabel: this.getFieldLabel(field),
                    fieldId: field.id,
                    stageId: stage.id,
                    stageName: stage.name
                });
            }
            
            return matches;
        });
        
        if (globalMatchingFields.length > 0) {
            this.logger.log('Adding fields from global formFields array:', globalMatchingFields.length);
            matchingFields.push(...globalMatchingFields);
        }
        */
        
        // FOURTH: Remove duplicates based on field ID or name
        const uniqueFields = [];
        const seenIds = new Set();
        
        matchingFields.forEach(field => {
            const fieldId = field.id || field.field_id || field.key || field.field_key;
            const fieldName = this.getFieldLabel(field);
            const uniqueKey = fieldId || fieldName;
            
            if (!seenIds.has(uniqueKey)) {
                seenIds.add(uniqueKey);
                uniqueFields.push(field);
            }
        });
        
        this.logger.log('Final matching fields for stage:', {
            stageName: stage.name,
            fieldsCount: uniqueFields.length,
            fields: uniqueFields.map(f => ({
                label: this.getFieldLabel(f),
                type: f.type || f.field_type || 'text',
                source: f.stageId ? 'stage' : f.actionId ? 'action' : 'global',
                hasValidLabel: !!(f.label || f.field_label || f.name || f.field_name || f.key || f.field_key),
                allProperties: Object.keys(f).slice(0, 10) // Limit for readability
            }))
        });
        
        return uniqueFields;
    }

    /**
     * Get workflow type label
     */
    getWorkflowTypeLabel(type) {
        const labels = {
            'incident': 'Schadensmeldung',
            'survey': 'Umfrage'
        };
        return labels[type] || 'Unbekannter Typ';
    }

    /**
     * Get stage type label
     */
    getStageTypeLabel(type) {
        const labels = {
            'start': 'Start',
            'intermediate': 'Verarbeitung',
            'end': 'Ende',
            'decision': 'Entscheidung'
        };
        return labels[type] || 'Unbekannt';
    }

    /**
     * Handle adding a new stage
     * Creates a new stage and action from the last stage to the new stage
     */
    handleAddStage() {
        this.logger.log('Add stage button clicked from preview');
        
        try {
            // Check if we have access to the workflow builder instance
            if (window.workflowBuilder && typeof window.workflowBuilder.addStage === 'function') {
                // Get the last stage to create an action from it to the new stage
                const lastStage = this.stages[this.stages.length - 1];
                
                // Add a new intermediate stage
                const newStage = window.workflowBuilder.addStage('intermediate');
                
                // If there was a previous stage, create an action from it to the new stage
                if (lastStage && newStage) {
                    const actionData = {
                        name: `Go to ${newStage.name}`,
                        buttonLabel: 'Continue',
                        type: 'transition',
                        formFields: []
                    };
                    
                    // Add the action through the workflow builder
                    if (typeof window.workflowBuilder.addAction === 'function') {
                        window.workflowBuilder.addAction(lastStage.id, newStage.id, actionData);
                    }
                }
                
                // Switch to the new stage in the preview
                if (newStage) {
                    this.activeDetailTab = newStage.name;
                    this.savePreviewState();
                    
                    // Trigger a refresh of the preview to show the new stage
                    setTimeout(() => {
                        if (window.workflowPreviewSidebar && typeof window.workflowPreviewSidebar.refreshPreview === 'function') {
                            window.workflowPreviewSidebar.refreshPreview();
                        }
                    }, 100);
                }
                
                this.logger.log('Stage added successfully from preview', newStage);
            } else {
                this.logger.error('Workflow builder instance not available for adding stage');
                alert('Cannot add stage: Workflow builder not available');
            }
        } catch (error) {
            this.logger.error('Error adding stage from preview:', error);
            alert('Failed to add stage: ' + error.message);
        }
    }

    /**
     * Handle adding a new form field to a stage
     * Opens the Configure Stage modal with FormBuilder integration
     */
    handleAddField(stageId, stageName) {
        this.logger.log('Add field button clicked for stage:', { stageId, stageName });
        
        try {
            // Check if we have access to the workflow builder instance
            if (!window.workflowBuilder || !window.workflowBuilder.localState) {
                this.logger.error('Workflow builder instance not available for adding field');
                alert('Cannot add field: Workflow builder not available');
                return;
            }
            
            // Open the enhanced stage configuration modal with form builder
            this.openStageConfigurationModal(stageId, stageName);
            
        } catch (error) {
            this.logger.error('Error opening stage configuration for adding field:', error);
            alert('Failed to open stage configuration: ' + error.message);
        }
    }

    /**
     * Open the enhanced stage configuration modal with FormBuilder integration
     */
    openStageConfigurationModal(stageId, stageName) {
        const modal = document.getElementById('config-modal');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');
        
        if (!modal || !title || !body) {
            this.logger.error('Modal elements not found');
            alert('Configuration modal not available');
            return;
        }
        
        // Get the current stage data
        const currentStage = window.workflowBuilder.localState.getState().stages.get(stageId);
        if (!currentStage) {
            this.logger.error('Stage not found:', stageId);
            alert('Stage not found');
            return;
        }
        
        title.textContent = `Configure Stage: ${stageName}`;
        
        // Create the modal content with FormBuilder integration
        body.innerHTML = `
            <div class="stage-config-tabs">
                <button class="tab-btn active" data-tab="basic" onclick="this.parentNode.querySelector('.active').classList.remove('active'); this.classList.add('active'); document.querySelector('.tab-content.active').classList.remove('active'); document.querySelector('.tab-content[data-tab=\"basic\"]').classList.add('active');">Basic Settings</button>
                <button class="tab-btn" data-tab="fields" onclick="this.parentNode.querySelector('.active').classList.remove('active'); this.classList.add('active'); document.querySelector('.tab-content.active').classList.remove('active'); document.querySelector('.tab-content[data-tab=\"fields\"]').classList.add('active');">Form Fields</button>
            </div>
            
            <!-- Basic Settings Tab -->
            <div class="tab-content active" data-tab="basic">
                <div class="form-group">
                    <label class="form-label">Stage Name *</label>
                    <input type="text" id="stage-name" class="form-input" value="${currentStage.name}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Stage Key *</label>
                    <input type="text" id="stage-key" class="form-input" value="${currentStage.key}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Stage Type</label>
                    <select id="stage-type" class="form-input">
                        <option value="start" ${currentStage.type === 'start' ? 'selected' : ''}>Start</option>
                        <option value="intermediate" ${currentStage.type === 'intermediate' ? 'selected' : ''}>Intermediate</option>
                        <option value="end" ${currentStage.type === 'end' ? 'selected' : ''}>End</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Max Duration (Hours)</label>
                    <input type="number" id="stage-max-hours" class="form-input" value="${currentStage.maxHours || 24}" min="1">
                </div>
            </div>
            
            <!-- Form Fields Tab -->
            <div class="tab-content" data-tab="fields">
                <div class="form-fields-section">
                    <div class="section-header">
                        <h4>Form Fields for ${stageName}</h4>
                        <button class="btn btn-primary btn-sm" id="add-field-btn" onclick="workflowPreviewModule.addFieldToStageInModal('${stageId}')">
                            <i class="fas fa-plus"></i> Add Field
                        </button>
                    </div>
                    <div id="form-fields-list">
                        ${this.renderFormFieldsList(currentStage.formFields || [])}
                    </div>
                </div>
            </div>
        `;
        
        // Store stage ID for saving and expose module reference
        modal.dataset.editingStageId = stageId;
        window.workflowPreviewModule = this;
        
        // Show the modal
        modal.style.display = 'flex';
        
        // Switch to fields tab if we came from "Add Field" button
        setTimeout(() => {
            const fieldsTab = body.querySelector('.tab-btn[data-tab="fields"]');
            if (fieldsTab) {
                fieldsTab.click();
            }
        }, 100);
        
        this.logger.log('Stage configuration modal opened for stage:', stageId);
    }

    /**
     * Render the form fields list in the modal with page organization
     */
    renderFormFieldsList(fields) {
        // Group fields by page
        const fieldsByPage = this.groupFieldsByPage(fields);
        const pages = Object.keys(fieldsByPage).sort((a, b) => parseInt(a) - parseInt(b));
        
        let html = '';
        
        pages.forEach(pageNum => {
            const pageFields = fieldsByPage[pageNum];
            const pageTitle = pageFields[0]?.page_title || `Page ${pageNum}`;
            
            html += `
                <div class="modal-page-section" data-page="${pageNum}">
                    <div class="modal-page-header">
                        <h5>${pageTitle}</h5>
                        <div class="modal-page-actions">
                            <button class="btn btn-sm btn-secondary" onclick="workflowPreviewModule.editPageTitleInModal(${pageNum})">Rename</button>
                            <button class="btn btn-sm btn-primary" onclick="workflowPreviewModule.addFieldToPageInModal(${pageNum})">Add Field</button>
                        </div>
                    </div>
                    <div class="modal-page-fields">
                        ${pageFields.map((field, index) => `
                            <div class="field-item" data-field-index="${index}" data-page="${pageNum}">
                                <div class="field-header">
                                    <div class="field-info">
                                        <strong>${this.getFieldLabel(field)}</strong>
                                        <small class="field-type">${this.getFieldTypeLabel(field.type || field.field_type || 'text')}</small>
                                        <small class="page-indicator">Page ${pageNum}</small>
                                    </div>
                                    <div class="field-actions">
                                        <button class="btn btn-sm btn-secondary" onclick="workflowPreviewModule.editFieldInModal(${index})">Edit</button>
                                        <button class="btn btn-sm btn-danger" onclick="workflowPreviewModule.removeFieldFromModal(${index})">Remove</button>
                                    </div>
                                </div>
                                ${field.help || field.field_help ? `<div class="field-description">${field.help || field.field_help}</div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });
        
        // Add "Add Page" button
        html += `
            <div class="add-page-section">
                <button class="btn btn-outline-primary" onclick="workflowPreviewModule.addPageInModal()">
                    <i class="fas fa-plus"></i> Add Page
                </button>
            </div>
        `;
        
        return html;
    }

    /**
     * Add a new field to the stage in the modal (legacy)
     */
    addFieldToStageInModal(stageId) {
        // For backwards compatibility - redirect to page-based approach
        this.addFieldToPageInModal(1, stageId);
    }

    /**
     * Add a new field to a specific page in the modal
     */
    addFieldToPageInModal(pageNum, stageId = null) {
        const modal = document.getElementById('config-modal');
        const currentStageId = stageId || modal?.dataset.editingStageId;
        
        if (!currentStageId) {
            alert('Stage not found');
            return;
        }
        
        const fieldName = prompt('Field Label:');
        if (!fieldName) return;
        
        const fieldType = prompt('Field Type (short/long/dropdown/multiple/date/photo):', 'short');
        if (!fieldType) return;
        
        // Get current stage
        const currentStage = window.workflowBuilder.localState.getState().stages.get(currentStageId);
        if (!currentStage) {
            alert('Stage not found');
            return;
        }
        
        const currentFormFields = currentStage.formFields || [];
        
        // Find the highest field_order in this page
        const pageFields = currentFormFields.filter(field => (field.page || 1) === pageNum);
        const maxOrder = Math.max(0, ...pageFields.map(field => field.field_order || field.order || 0));
        
        const newField = {
            id: `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            key: `field_${Date.now()}`,
            label: fieldName,
            type: fieldType,
            page: pageNum,
            field_order: maxOrder + 1,
            validation: {
                required: false
            },
            created_at: new Date().toISOString()
        };
        
        const updatedFormFields = [...currentFormFields, newField];
        
        // Update the stage through the workflow builder's local state
        window.workflowBuilder.localState.updateStage(currentStageId, {
            formFields: updatedFormFields
        });
        
        // Refresh the fields list in the modal
        const fieldsListElement = document.getElementById('form-fields-list');
        if (fieldsListElement) {
            fieldsListElement.innerHTML = this.renderFormFieldsList(updatedFormFields);
        }
        
        this.logger.log('Field added to page in modal:', newField);
    }

    /**
     * Add a new page in the modal
     */
    addPageInModal() {
        const modal = document.getElementById('config-modal');
        const stageId = modal?.dataset.editingStageId;
        
        if (!stageId) {
            alert('Stage not found');
            return;
        }
        
        const pageTitle = prompt('Page Title:', 'New Page');
        if (!pageTitle) return;
        
        // Get current stage
        const currentStage = window.workflowBuilder.localState.getState().stages.get(stageId);
        if (!currentStage) {
            alert('Stage not found');
            return;
        }
        
        const currentFormFields = currentStage.formFields || [];
        
        // Find the next page number
        const existingPages = currentFormFields.map(field => field.page || 1);
        const nextPageNum = Math.max(1, ...existingPages) + 1;
        
        // Create a placeholder field for the new page
        const placeholderField = {
            id: this.generateId(),
            key: `page_${nextPageNum}_placeholder`,
            label: 'Click "Add Field" to add fields to this page',
            type: 'short',
            page: nextPageNum,
            page_title: pageTitle,
            field_order: 1,
            is_placeholder: true,
            validation: { required: false },
            created_at: new Date().toISOString()
        };
        
        const updatedFormFields = [...currentFormFields, placeholderField];
        
        // Update the stage
        window.workflowBuilder.localState.updateStage(stageId, {
            formFields: updatedFormFields
        });
        
        // Refresh the fields list in the modal
        const fieldsListElement = document.getElementById('form-fields-list');
        if (fieldsListElement) {
            fieldsListElement.innerHTML = this.renderFormFieldsList(updatedFormFields);
        }
        
        this.logger.log('New page added in modal:', { pageNum: nextPageNum, title: pageTitle });
    }

    /**
     * Edit page title in the modal
     */
    editPageTitleInModal(pageNum) {
        const modal = document.getElementById('config-modal');
        const stageId = modal?.dataset.editingStageId;
        
        if (!stageId) return;
        
        const currentStage = window.workflowBuilder.localState.getState().stages.get(stageId);
        if (!currentStage) return;
        
        const pageFields = currentStage.formFields.filter(field => (field.page || 1) === pageNum);
        const currentTitle = pageFields[0]?.page_title || `Page ${pageNum}`;
        
        const newTitle = prompt('Page Title:', currentTitle);
        if (!newTitle || newTitle === currentTitle) return;
        
        // Update all fields in this page with the new title
        const updatedFields = currentStage.formFields.map(field => {
            if ((field.page || 1) === pageNum) {
                return { ...field, page_title: newTitle };
            }
            return field;
        });
        
        // Update the stage
        window.workflowBuilder.localState.updateStage(stageId, {
            formFields: updatedFields
        });
        
        // Refresh the fields list in the modal
        const fieldsListElement = document.getElementById('form-fields-list');
        if (fieldsListElement) {
            fieldsListElement.innerHTML = this.renderFormFieldsList(updatedFields);
        }
        
        this.logger.log('Page title updated:', { pageNum, newTitle });
    }

    /**
     * Edit a field in the modal
     */
    editFieldInModal(fieldIndex) {
        const modal = document.getElementById('config-modal');
        const stageId = modal?.dataset.editingStageId;
        
        if (!stageId) return;
        
        const currentStage = window.workflowBuilder.localState.getState().stages.get(stageId);
        if (!currentStage || !currentStage.formFields || !currentStage.formFields[fieldIndex]) {
            alert('Field not found');
            return;
        }
        
        const field = currentStage.formFields[fieldIndex];
        const newLabel = prompt('Field Label:', this.getFieldLabel(field));
        
        if (newLabel && newLabel !== this.getFieldLabel(field)) {
            // Update the field
            const updatedFields = [...currentStage.formFields];
            updatedFields[fieldIndex] = { ...field, label: newLabel };
            
            // Update the stage
            window.workflowBuilder.localState.updateStage(stageId, {
                formFields: updatedFields
            });
            
            // Refresh the fields list in the modal
            const fieldsListElement = document.getElementById('form-fields-list');
            if (fieldsListElement) {
                fieldsListElement.innerHTML = this.renderFormFieldsList(updatedFields);
            }
            
            this.logger.log('Field updated in modal:', updatedFields[fieldIndex]);
        }
    }

    /**
     * Remove a field from the modal
     */
    removeFieldFromModal(fieldIndex) {
        const modal = document.getElementById('config-modal');
        const stageId = modal?.dataset.editingStageId;
        
        if (!stageId) return;
        
        const currentStage = window.workflowBuilder.localState.getState().stages.get(stageId);
        if (!currentStage || !currentStage.formFields || !currentStage.formFields[fieldIndex]) {
            alert('Field not found');
            return;
        }
        
        if (confirm('Are you sure you want to remove this field?')) {
            // Remove the field
            const updatedFields = currentStage.formFields.filter((_, index) => index !== fieldIndex);
            
            // Update the stage
            window.workflowBuilder.localState.updateStage(stageId, {
                formFields: updatedFields
            });
            
            // Refresh the fields list in the modal
            const fieldsListElement = document.getElementById('form-fields-list');
            if (fieldsListElement) {
                fieldsListElement.innerHTML = this.renderFormFieldsList(updatedFields);
            }
            
            this.logger.log('Field removed from modal');
        }
    }

    /**
     * Handle adding a field to a specific page with throttling
     */
    handleAddFieldToPage(stageId, stageName, pageNum) {
        // Throttle rapid clicks
        const now = Date.now();
        if (now - this.lastActionTime < this.actionThrottleDelay) {
            this.logger.log('Action throttled - too soon after last action');
            return;
        }
        this.lastActionTime = now;
        
        this.logger.log('Add field to page button clicked:', { stageId, stageName, pageNum });
        
        try {
            if (!window.workflowBuilder || !window.workflowBuilder.localState) {
                this.logger.error('Workflow builder instance not available');
                alert('Cannot add field: Workflow builder not available');
                return;
            }
            
            // Simple field creation for now
            const fieldLabel = prompt('Field Label:');
            if (!fieldLabel) return;
            
            const fieldType = prompt('Field Type (short/long/dropdown/multiple/date/photo):', 'short');
            if (!fieldType) return;
            
            // Get current stage
            const currentStage = window.workflowBuilder.localState.getState().stages.get(stageId);
            if (!currentStage) {
                alert('Stage not found');
                return;
            }
            
            const currentFormFields = currentStage.formFields || [];
            
            // Find the highest field_order in this page
            const pageFields = currentFormFields.filter(field => (field.page || 1) === pageNum);
            const maxOrder = Math.max(0, ...pageFields.map(field => field.field_order || field.order || 0));
            
            // Create new field
            const newField = {
                id: `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                key: `field_${Date.now()}`,
                label: fieldLabel,
                type: fieldType,
                page: pageNum,
                field_order: maxOrder + 1,
                validation: {
                    required: false
                },
                created_at: new Date().toISOString()
            };
            
            const updatedFormFields = [...currentFormFields, newField];
            
            // Update the stage
            window.workflowBuilder.localState.updateStage(stageId, {
                formFields: updatedFormFields
            });
            
            // Refresh the preview
            setTimeout(() => {
                if (window.workflowPreviewSidebar && typeof window.workflowPreviewSidebar.refreshPreview === 'function') {
                    window.workflowPreviewSidebar.refreshPreview();
                }
            }, 100);
            
            this.logger.log('Field added to page:', newField);
            
        } catch (error) {
            this.logger.error('Error adding field to page:', error);
            alert('Failed to add field: ' + error.message);
        }
    }

    /**
     * Position workflow field dropdown to open LEFT of button with fixed positioning
     */
    positionWorkflowDropdown(button, dropdown) {
        const buttonRect = button.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const dropdownWidth = 180;
        const dropdownMaxHeight = 300;
        
        console.log('POSITIONING DEBUG: Input values:');
        console.log('  buttonRect:', buttonRect);
        console.log('  viewportWidth:', viewportWidth);
        console.log('  viewportHeight:', viewportHeight);
        
        // CRITICAL FIX: Force dropdown to be positioned relative to viewport, not parent containers
        // Move dropdown to body to break out of any positioned/scrollable parents
        if (dropdown.parentElement && !dropdown.parentElement.matches('body')) {
            console.log('POSITIONING DEBUG: Moving dropdown to body to escape parent positioning context');
            
            // Add identifying attributes so we can find it later
            const stageId = button.dataset.stageId;
            const page = button.dataset.page;
            dropdown.setAttribute('data-stage-id', stageId);
            dropdown.setAttribute('data-page', page);
            
            document.body.appendChild(dropdown);
        }
        
        // Ensure fixed positioning
        dropdown.style.position = 'fixed';
        dropdown.style.zIndex = '999999999';
        
        // Calculate optimal position - always ensure it's visible within viewport
        let leftPos = buttonRect.left - dropdownWidth - 8; // Position to the left with small gap
        let topPos = buttonRect.top; // Align top with button
        
        console.log('POSITIONING DEBUG: Initial calculations:');
        console.log('  Initial leftPos (left of button):', leftPos);
        console.log('  Initial topPos:', topPos);
        
        // Ensure dropdown stays within viewport horizontally
        if (leftPos < 10) {
            console.log('POSITIONING DEBUG: LeftPos < 10, trying to right of button');
            // If can't fit to the left, try to the right
            leftPos = buttonRect.right + 8;
            console.log('  New leftPos (right of button):', leftPos);
            
            // If still doesn't fit to the right, constrain to viewport
            if (leftPos + dropdownWidth > viewportWidth - 10) {
                console.log('POSITIONING DEBUG: Still extends beyond viewport, constraining');
                leftPos = viewportWidth - dropdownWidth - 10;
                console.log('  Final constrained leftPos:', leftPos);
            }
        } else if (leftPos + dropdownWidth > viewportWidth - 10) {
            console.log('POSITIONING DEBUG: Left position extends beyond viewport, constraining');
            // If positioned to left but extends beyond viewport, constrain it
            leftPos = viewportWidth - dropdownWidth - 10;
            console.log('  Constrained leftPos:', leftPos);
        }
        
        // If dropdown would go below viewport, show it above the button
        if (topPos + dropdownMaxHeight > viewportHeight - 10) {
            console.log('POSITIONING DEBUG: Would extend below viewport, positioning above');
            topPos = buttonRect.top - dropdownMaxHeight;
            console.log('  New topPos (above button):', topPos);
            // If still too high, align with viewport top
            if (topPos < 10) {
                console.log('  Still too high, setting to 10');
                topPos = 10;
            }
        }
        
        // Ensure it doesn't go above viewport
        if (topPos < 10) {
            console.log('POSITIONING DEBUG: TopPos < 10, setting to 10');
            topPos = 10;
        }
        
        console.log('POSITIONING DEBUG: Final position:');
        console.log('  Final leftPos:', leftPos);
        console.log('  Final topPos:', topPos);
        
        dropdown.style.left = `${leftPos}px`;
        dropdown.style.top = `${topPos}px`;
        
        // Verify the fix worked
        setTimeout(() => {
            const verifyRect = dropdown.getBoundingClientRect();
            console.log('POSITIONING DEBUG: Verification after 50ms:');
            console.log('  Expected leftPos:', leftPos);
            console.log('  Actual x position:', verifyRect.x);
            console.log('  Position fix successful:', Math.abs(verifyRect.x - leftPos) < 5);
        }, 50);
    }

    /**
     * Position dropdown relative to button using fixed positioning
     */
    positionDropdown(button, dropdown) {
        const buttonRect = button.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const dropdownWidth = 180;
        const dropdownMaxHeight = 300;
        
        // Calculate optimal position - open to the LEFT of the button
        let leftPos = buttonRect.left - dropdownWidth - 8; // Position to the left with small gap
        let topPos = buttonRect.top; // Align top with button
        
        // If dropdown would go off the left edge of viewport, position to the right instead
        if (leftPos < 10) {
            leftPos = buttonRect.right + 8; // Position to the right with gap
        }
        
        // Ensure dropdown stays within viewport horizontally
        if (leftPos + dropdownWidth > viewportWidth - 10) {
            leftPos = viewportWidth - dropdownWidth - 10;
        }
        
        // If dropdown would go below viewport, show it above the button
        if (topPos + dropdownMaxHeight > viewportHeight - 10) {
            topPos = buttonRect.bottom - dropdownMaxHeight;
            // If still too high, align with viewport top
            if (topPos < 10) topPos = 10;
        }
        
        // Ensure it doesn't go above viewport
        if (topPos < 10) topPos = 10;
        
        dropdown.style.left = `${leftPos}px`;
        dropdown.style.top = `${topPos}px`;
    }
    
    /**
     * Setup scroll handler to keep dropdown positioned correctly
     */
    setupDropdownScrollHandler(button, dropdown) {
        this.activeDropdownButton = button;
        this.activeDropdown = dropdown;
        
        this.dropdownScrollHandler = () => {
            if (dropdown.classList.contains('show')) {
                if (dropdown.classList.contains('workflow-field-dropdown')) {
                    this.positionWorkflowDropdown(button, dropdown);
                } else {
                    this.positionDropdown(button, dropdown);
                }
            }
        };
        
        // Listen to scroll on multiple containers
        window.addEventListener('scroll', this.dropdownScrollHandler, { passive: true });
        document.addEventListener('scroll', this.dropdownScrollHandler, { passive: true });
        
        // Also listen to scroll on the sidebar container
        if (this.container) {
            this.container.addEventListener('scroll', this.dropdownScrollHandler, { passive: true });
        }
    }
    
    /**
     * Clean up dropdown scroll handlers
     */
    cleanupDropdownScrollHandler() {
        if (this.dropdownScrollHandler) {
            window.removeEventListener('scroll', this.dropdownScrollHandler);
            document.removeEventListener('scroll', this.dropdownScrollHandler);
            
            if (this.container) {
                this.container.removeEventListener('scroll', this.dropdownScrollHandler);
            }
            
            this.dropdownScrollHandler = null;
            this.activeDropdownButton = null;
            this.activeDropdown = null;
        }
    }

    /**
     * Handle adding a field to a page with a specific field type
     */
    handleAddFieldToPageWithType(stageId, fieldType, pageNum) {
        // Throttle rapid clicks
        const now = Date.now();
        if (now - this.lastActionTime < this.actionThrottleDelay) {
            this.logger.log('Action throttled - too soon after last action');
            return;
        }
        this.lastActionTime = now;
        
        this.logger.log('Add field to page with type:', { stageId, fieldType, pageNum });
        
        try {
            if (!window.workflowBuilder) {
                this.logger.error('Workflow builder instance not available');
                alert('Cannot add field: Workflow builder not available');
                return;
            }
            
            // Find the forward action that leads TO this stage (the move forward action)
            const targetActionId = this.findMoveForwardActionToStage(stageId);
            
            if (!targetActionId) {
                this.logger.warn('No move forward action found leading to stage:', stageId);
                // Fallback to adding to stage directly if no forward action is found
                window.workflowBuilder.openFormFieldModal(stageId, null, null, null, { 
                    fieldType: fieldType,
                    page: pageNum 
                });
            } else {
                this.logger.log('Adding field to forward action:', targetActionId);
                // Add the field to the forward action that leads to this stage
                window.workflowBuilder.openFormFieldModal(null, targetActionId, null, null, { 
                    fieldType: fieldType,
                    page: pageNum 
                });
            }
            
            this.logger.log('Field editor opened with type:', fieldType);
            
        } catch (error) {
            this.logger.error('Error opening field editor:', error);
            alert('Failed to open field editor: ' + error.message);
        }
    }

    /**
     * Find the forward action that leads TO the specified stage
     * This is the "move forward" action that should contain form fields
     */
    findMoveForwardActionToStage(targetStageId) {
        if (!window.workflowBuilder || !window.workflowBuilder.actions) {
            this.logger.warn('Workflow builder or actions not available');
            return null;
        }
        
        // Find the forward action where toStageId matches our target stage
        const actions = Array.from(window.workflowBuilder.actions.values());
        const forwardAction = actions.find(action => 
            action.type === 'forward' && action.toStageId === targetStageId
        );
        
        if (forwardAction) {
            this.logger.log('Found forward action leading to stage:', {
                actionId: forwardAction.id,
                actionName: forwardAction.name,
                fromStageId: forwardAction.fromStageId,
                toStageId: forwardAction.toStageId
            });
            return forwardAction.id;
        }
        
        this.logger.warn('No forward action found leading to stage:', targetStageId);
        return null;
    }

    /**
     * Handle adding a new page with throttling
     */
    handleAddPage(stageId, stageName) {
        // Throttle rapid clicks
        const now = Date.now();
        if (now - this.lastActionTime < this.actionThrottleDelay) {
            this.logger.log('Action throttled - too soon after last action');
            return;
        }
        this.lastActionTime = now;
        
        this.logger.log('Add page button clicked:', { stageId, stageName });
        
        try {
            if (!window.workflowBuilder || !window.workflowBuilder.localState) {
                this.logger.error('Workflow builder instance not available');
                alert('Cannot add page: Workflow builder not available');
                return;
            }
            
            const pageTitle = prompt('Page Title:', 'New Page');
            if (!pageTitle) return;
            
            // Get current stage
            const currentStage = window.workflowBuilder.localState.getState().stages.get(stageId);
            if (!currentStage) {
                alert('Stage not found');
                return;
            }
            
            const currentFormFields = currentStage.formFields || [];
            
            // Find the next page number
            const existingPages = currentFormFields.map(field => field.page || 1);
            const nextPageNum = Math.max(1, ...existingPages) + 1;
            
            // Create a placeholder field for the new page (will be removed when real fields are added)
            const placeholderField = {
                id: this.generateId(),
                key: `page_${nextPageNum}_placeholder`,
                label: 'Click + to add field',
                type: 'short',
                page: nextPageNum,
                page_title: pageTitle,
                field_order: 1,
                is_placeholder: true,
                validation: { required: false },
                created_at: new Date().toISOString()
            };
            
            const updatedFormFields = [...currentFormFields, placeholderField];
            
            // Update the stage
            window.workflowBuilder.localState.updateStage(stageId, {
                formFields: updatedFormFields
            });
            
            // Refresh the preview
            setTimeout(() => {
                if (window.workflowPreviewSidebar && typeof window.workflowPreviewSidebar.refreshPreview === 'function') {
                    window.workflowPreviewSidebar.refreshPreview();
                }
            }, 100);
            
            this.logger.log('New page added:', { pageNum: nextPageNum, title: pageTitle });
            
        } catch (error) {
            this.logger.error('Error adding page:', error);
            alert('Failed to add page: ' + error.message);
        }
    }

    /**
     * Setup drag and drop functionality for fields with proper reordering
     */
    setupFieldDragAndDrop() {
        // Clean up existing drag listeners
        this.cleanupDragListeners();
        
        let draggedElement = null;
        let draggedData = null;
        let dropIndicator = null;
        
        // Create drop indicator element
        const createDropIndicator = () => {
            if (!dropIndicator) {
                dropIndicator = document.createElement('div');
                dropIndicator.className = 'drop-indicator';
                dropIndicator.innerHTML = '<div class="drop-line"></div>';
            }
            return dropIndicator;
        };
        
        // Remove drop indicator
        const removeDropIndicator = () => {
            if (dropIndicator && dropIndicator.parentNode) {
                dropIndicator.parentNode.removeChild(dropIndicator);
            }
        };
        
        // Find the closest field element and insert position
        const findDropTarget = (pageContainer, clientY) => {
            const fieldElements = Array.from(pageContainer.querySelectorAll('.form-field-preview:not(.dragging)'));
            
            // If no fields, insert at beginning
            if (fieldElements.length === 0) {
                return {
                    targetElement: null,
                    insertPosition: 'first',
                    targetIndex: 0
                };
            }
            
            // Get page container boundaries for better first position detection
            const containerRect = pageContainer.getBoundingClientRect();
            const firstField = fieldElements[0];
            const firstFieldRect = firstField.getBoundingClientRect();
            
            // Enhanced first position detection: check if dropping in the top area of the container
            // or above the first field with more generous top margin
            const containerTopPadding = 24; // Account for page container padding (1.5rem = 24px)
            const topAreaThreshold = Math.max(
                Math.min(firstFieldRect.top - containerRect.top - containerTopPadding, 20),
                firstFieldRect.height * 0.25 // Or 25% of first field height, minimum 20px
            );
            
            if (clientY < firstFieldRect.top - topAreaThreshold) {
                console.log('DROP DEBUG: Detected first position drop', {
                    clientY,
                    firstFieldTop: firstFieldRect.top,
                    topAreaThreshold,
                    containerTop: containerRect.top,
                    triggerY: firstFieldRect.top - topAreaThreshold
                });
                return {
                    targetElement: firstField,
                    insertPosition: 'before',
                    targetIndex: 0
                };
            }
            
            // Check each field for drop position
            for (let i = 0; i < fieldElements.length; i++) {
                const field = fieldElements[i];
                const rect = field.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                
                if (clientY < midY) {
                    return {
                        targetElement: field,
                        insertPosition: 'before',
                        targetIndex: i
                    };
                }
            }
            
            // Insert at end
            return {
                targetElement: fieldElements[fieldElements.length - 1],
                insertPosition: 'after',
                targetIndex: fieldElements.length
            };
        };
        
        // Drag start handler
        this.dragStartHandler = (e) => {
            if (e.target.matches('.form-field-preview[draggable="true"]') || e.target.closest('.form-field-preview[draggable="true"]')) {
                const fieldElement = e.target.matches('.form-field-preview[draggable="true"]') ? e.target : e.target.closest('.form-field-preview[draggable="true"]');
                
                draggedElement = fieldElement;
                draggedData = {
                    fieldId: fieldElement.dataset.fieldId,
                    sourcePage: parseInt(fieldElement.dataset.page),
                    sourceIndex: parseInt(fieldElement.dataset.fieldIndex)
                };
                
                fieldElement.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', draggedData.fieldId);
                
                // Create ghost image
                const ghost = fieldElement.cloneNode(true);
                ghost.style.opacity = '0.8';
                ghost.style.transform = 'rotate(2deg)';
                document.body.appendChild(ghost);
                e.dataTransfer.setDragImage(ghost, 0, 0);
                setTimeout(() => document.body.removeChild(ghost), 0);
                
                this.logger.log('Drag started:', draggedData);
            }
        };
        
        // Drag over handler with drop indicator and cross-page highlighting
        this.dragOverHandler = (e) => {
            if (!draggedData) return;
            
            const pageContainer = e.target.closest('.page-fields');
            const pageCard = e.target.closest('.form-page-card');
            
            if (pageContainer) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                
                // Clear all previous highlights
                this.container.querySelectorAll('.form-page-card.drag-target').forEach(card => {
                    card.classList.remove('drag-target');
                });
                this.container.querySelectorAll('.page-fields.drag-over').forEach(fields => {
                    fields.classList.remove('drag-over');
                });
                
                // Highlight current page if it's different from source
                const currentPage = parseInt(pageContainer.dataset.page);
                if (currentPage !== draggedData.sourcePage && pageCard) {
                    pageCard.classList.add('drag-target');
                } else {
                    pageContainer.classList.add('drag-over');
                }
                
                const dropTarget = findDropTarget(pageContainer, e.clientY);
                const indicator = createDropIndicator();
                
                // Remove previous indicator
                removeDropIndicator();
                
                // Insert indicator at the correct position
                if (dropTarget.targetElement) {
                    if (dropTarget.insertPosition === 'before') {
                        pageContainer.insertBefore(indicator, dropTarget.targetElement);
                    } else {
                        if (dropTarget.targetElement.nextSibling) {
                            pageContainer.insertBefore(indicator, dropTarget.targetElement.nextSibling);
                        } else {
                            pageContainer.appendChild(indicator);
                        }
                    }
                } else if (dropTarget.insertPosition === 'first') {
                    // Insert at very beginning of page (empty page or first position)
                    if (pageContainer.children.length > 0) {
                        pageContainer.insertBefore(indicator, pageContainer.firstChild);
                    } else {
                        pageContainer.appendChild(indicator);
                    }
                } else {
                    // Default: append to end
                    pageContainer.appendChild(indicator);
                }
                
                // Store drop info on the page container
                pageContainer.dataset.dropPage = pageContainer.dataset.page;
                pageContainer.dataset.dropIndex = dropTarget.targetIndex;
            }
        };
        
        // Drag leave handler
        this.dragLeaveHandler = (e) => {
            const pageContainer = e.target.closest('.page-fields');
            const pageCard = e.target.closest('.form-page-card');
            
            if (pageContainer && !pageContainer.contains(e.relatedTarget)) {
                removeDropIndicator();
                pageContainer.classList.remove('drag-over');
            }
            
            if (pageCard && !pageCard.contains(e.relatedTarget)) {
                pageCard.classList.remove('drag-target');
            }
        };
        
        // Drop handler
        this.dropHandler = (e) => {
            if (!draggedData) return;
            
            const pageContainer = e.target.closest('.page-fields');
            if (pageContainer) {
                e.preventDefault();
                removeDropIndicator();
                
                const targetPage = parseInt(pageContainer.dataset.dropPage || pageContainer.dataset.page);
                const targetIndex = parseInt(pageContainer.dataset.dropIndex || 0);
                
                this.logger.log('Drop detected:', {
                    source: draggedData,
                    target: { page: targetPage, index: targetIndex }
                });
                
                console.log('DROP DEBUG: Drop handler executed', {
                    draggedData,
                    targetPage,
                    targetIndex,
                    dropPage: pageContainer.dataset.dropPage,
                    dropIndex: pageContainer.dataset.dropIndex
                });
                
                this.handleFieldReorder(draggedData, targetPage, targetIndex);
            }
        };
        
        // Drag end handler
        this.dragEndHandler = (e) => {
            if (draggedElement) {
                draggedElement.classList.remove('dragging');
                removeDropIndicator();
                
                // Clear all drag highlights
                this.container.querySelectorAll('.form-page-card.drag-target').forEach(card => {
                    card.classList.remove('drag-target');
                });
                this.container.querySelectorAll('.page-fields.drag-over').forEach(fields => {
                    fields.classList.remove('drag-over');
                });
                
                draggedElement = null;
                draggedData = null;
            }
        };
        
        // Add event listeners
        this.container.addEventListener('dragstart', this.dragStartHandler);
        this.container.addEventListener('dragover', this.dragOverHandler);
        this.container.addEventListener('dragleave', this.dragLeaveHandler);
        this.container.addEventListener('drop', this.dropHandler);
        this.container.addEventListener('dragend', this.dragEndHandler);
        
        this.logger.log('Enhanced drag and drop setup completed');
    }

    /**
     * Clean up drag and drop event listeners
     */
    cleanupDragListeners() {
        if (this.container) {
            if (this.dragStartHandler) {
                this.container.removeEventListener('dragstart', this.dragStartHandler);
                this.dragStartHandler = null;
            }
            if (this.dragEndHandler) {
                this.container.removeEventListener('dragend', this.dragEndHandler);
                this.dragEndHandler = null;
            }
            if (this.dragOverHandler) {
                this.container.removeEventListener('dragover', this.dragOverHandler);
                this.dragOverHandler = null;
            }
            if (this.dragLeaveHandler) {
                this.container.removeEventListener('dragleave', this.dragLeaveHandler);
                this.dragLeaveHandler = null;
            }
            if (this.dropHandler) {
                this.container.removeEventListener('drop', this.dropHandler);
                this.dropHandler = null;
            }
        }
    }

    /**
     * Handle field reordering with proper state updates
     */
    handleFieldReorder(draggedData, targetPage, targetIndex) {
        try {
            if (!window.workflowBuilder || !window.workflowBuilder.localState) {
                this.logger.error('Workflow builder not available for field reorder');
                return;
            }
            
            // Get current stage data - find the stage that contains the dragged field
            let currentStageId = null;
            let currentStage = null;
            
            // Look through all stages to find the one containing this field
            for (const stage of this.stages) {
                const stageFields = stage.formFields || [];
                const hasField = stageFields.some(field => 
                    (field.id || field.field_id) === draggedData.fieldId
                );
                if (hasField) {
                    currentStageId = stage.id;
                    break;
                }
            }
            
            if (!currentStageId) {
                this.logger.error('Could not find stage containing the dragged field');
                return;
            }
            
            currentStage = window.workflowBuilder.localState.getState().stages.get(currentStageId);
            if (!currentStage) {
                this.logger.error('Current stage not found:', currentStageId);
                return;
            }
            
            const allFields = [...(currentStage.formFields || [])];
            
            // Find the field being moved
            const movedField = allFields.find(field => 
                (field.id || field.field_id) === draggedData.fieldId
            );
            
            if (!movedField) {
                this.logger.error('Moved field not found:', draggedData.fieldId);
                return;
            }
            
            this.logger.log('Found moved field:', movedField);
            
            // Remove the field from its current position
            const filteredFields = allFields.filter(field => 
                (field.id || field.field_id) !== draggedData.fieldId
            );
            
            // Update the moved field's page and prepare for insertion
            const updatedMovedField = {
                ...movedField,
                page: targetPage,
                page_title: this.getPageTitle(targetPage, filteredFields)
            };
            
            // Group remaining fields by page for reordering
            const fieldsByPage = this.groupFieldsByPage(filteredFields);
            
            // Insert the moved field at the target position
            if (!fieldsByPage[targetPage]) {
                fieldsByPage[targetPage] = [];
            }
            
            // Insert at the correct index within the target page
            fieldsByPage[targetPage].splice(targetIndex, 0, updatedMovedField);
            
            // Rebuild the complete fields array with proper ordering
            const reorderedFields = [];
            Object.keys(fieldsByPage)
                .sort((a, b) => parseInt(a) - parseInt(b))
                .forEach(pageNum => {
                    fieldsByPage[pageNum].forEach((field, index) => {
                        reorderedFields.push({
                            ...field,
                            page: parseInt(pageNum),
                            field_order: index + 1
                        });
                    });
                });
            
            this.logger.log('Reordered fields:', {
                original: allFields.length,
                reordered: reorderedFields.length,
                moveDetails: {
                    fieldId: draggedData.fieldId,
                    from: { page: draggedData.sourcePage, index: draggedData.sourceIndex },
                    to: { page: targetPage, index: targetIndex }
                }
            });
            
            // Update the stage with reordered fields
            window.workflowBuilder.localState.updateStage(currentStageId, {
                formFields: reorderedFields
            });
            
            // Update internal stage data with fresh data from local state
            this.updateInternalStageData();
            
            // Re-render the current stage content without full refresh
            this.rerenderCurrentStageContent();
            
            this.logger.log('Field reorder completed - content re-rendered without full refresh');
            
            this.logger.log('Field reorder completed successfully');
            
        } catch (error) {
            this.logger.error('Error during field reorder:', error);
            alert('Failed to reorder field: ' + error.message);
        }
    }
    
    /**
     * Get page title from existing fields in the page
     */
    getPageTitle(pageNum, fields) {
        const pageFields = fields.filter(field => (field.page || 1) === pageNum);
        if (pageFields.length > 0 && pageFields[0].page_title) {
            return pageFields[0].page_title;
        }
        return `Page ${pageNum}`;
    }
    
    /**
     * Update internal stage data with fresh data from local state
     */
    updateInternalStageData() {
        if (window.workflowBuilder && window.workflowBuilder.localState) {
            const localState = window.workflowBuilder.localState.getState();
            
            // Update stages array with fresh data
            this.stages = Array.from(localState.stages.values());
            this.actions = Array.from(localState.actions.values());
            
            this.logger.log('Internal stage data updated from local state:', {
                stagesCount: this.stages.length,
                actionsCount: this.actions.length
            });
        }
    }
    
    /**
     * Re-render just the current stage content without full preview refresh
     */
    rerenderCurrentStageContent() {
        if (this.activeTab === 'details' && this.activeDetailTab) {
            const currentStage = this.stages.find(s => s.name === this.activeDetailTab);
            if (currentStage) {
                const detailContent = this.container.querySelector('.detail-tab-content');
                if (detailContent) {
                    detailContent.innerHTML = this.renderStageContent(currentStage);
                    
                    // Re-setup drag and drop for the new content
                    this.setupFieldDragAndDrop();
                    
                    this.logger.log('Stage content re-rendered:', currentStage.name);
                }
            }
        }
    }

    /**
     * Generate unique UUID
     */
    generateId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Render location update button with current state
     */
    renderLocationUpdateButton() {
        // Get current location update roles configuration from workflow level
        const workflow = window.workflowBuilder?.localState?.getState()?.workflow || {};
        const locationUpdateRoles = workflow.locationUpdateRoles || [];
        
        const hasPermissions = locationUpdateRoles.length > 0;
        const buttonClass = hasPermissions ? 'btn btn-sm btn-outline-success' : 'btn btn-sm btn-outline-secondary';
        const icon = hasPermissions ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
        const text = hasPermissions ? 'Ort aktualisieren (konfiguriert)' : 'Ort aktualisieren (nicht konfiguriert)';
        
        let roleNamesText = '';
        if (hasPermissions) {
            const projectRoles = window.workflowBuilder?.projectRoles || [];
            const roleNames = locationUpdateRoles
                .map(roleId => projectRoles.find(role => role.id === roleId)?.name || `Role ${roleId.substring(0, 8)}...`)
                .join(', ');
            roleNamesText = ``;
        }
        
        return `
            <button class="info-action location-update-btn ${buttonClass}" data-action="configure-location-update">
                <i class="${icon}"></i> ${text}
            </button>
            ${roleNamesText}
        `;
    }

    /**
     * Handle location update configuration
     */
    async handleLocationUpdateConfiguration() {
        try {
            this.logger.log('Opening location update configuration modal');
            
            // Get current workflow data to determine the stage we're configuring
            const currentWorkflow = window.workflowBuilder.localState.getState().workflow;
            if (!currentWorkflow) {
                throw new Error('No workflow data available');
            }

            // Get project roles for the role selector
            const projectRoles = window.workflowBuilder.projectRoles || [];
            if (projectRoles.length === 0) {
                app.showNotification('warning', 'Keine Rollen', 'Es wurden keine Rollen für dieses Projekt gefunden. Erstellen Sie zunächst Rollen im Rollenbereich.');
                return;
            }

            // Get current location update roles from workflow level
            const workflow = window.workflowBuilder.localState.getState().workflow || {};
            const currentLocationUpdateRoles = workflow.locationUpdateRoles || [];

            // Create and show the role selection modal
            this.showLocationUpdateRoleModal(projectRoles, currentLocationUpdateRoles);
            
        } catch (error) {
            this.logger.error('Failed to open location update configuration:', error);
            app.showNotification('error', 'Fehler', 'Fehler beim Öffnen der Standort-Update-Konfiguration: ' + error.message);
        }
    }

    /**
     * Show location update role selection modal
     */
    showLocationUpdateRoleModal(availableRoles, selectedRoles = []) {
        // Create modal HTML using your modal system
        const modalHtml = `
            <div class="modal" id="locationUpdateModal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">
                            <i class="fas fa-map-marker-alt"></i>
                            Standort-Update Berechtigungen
                        </h3>
                        <button type="button" class="modal-close" onclick="window.workflowPreview.closeLocationUpdateModal()">
                            <span>&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <div class="location-update-info">
                                <small class="text-muted">
                                    <i class="fas fa-info-circle"></i>
                                    Ausgewählte Rollen können Marker per Drag & Drop in der Teilnehmer-App verschieben.
                                    Ohne Auswahl ist keine Standort-Bearbeitung möglich.
                                </small>
                            </div>
                            <div id="locationUpdateRoleSelector" class="role-selection-container">
                                <!-- EntitySelector will be rendered here -->
                            </div>
                            ${availableRoles.length === 0 ? `
                                <div class="alert alert-warning">
                                    <i class="fas fa-exclamation-triangle"></i>
                                    Keine Rollen verfügbar. Erstellen Sie zunächst Rollen im Rollenbereich.
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="window.workflowPreview.closeLocationUpdateModal()">Abbrechen</button>
                        <button type="button" class="btn btn-primary" id="saveLocationUpdateRoles">
                            <i class="fas fa-save"></i>
                            Speichern
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if present
        const existingModal = document.getElementById('locationUpdateModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Show modal using your system
        const modalElement = document.getElementById('locationUpdateModal');
        const modalOverlay = document.getElementById('modal-overlay');
        
        if (modalElement && modalOverlay) {
            modalElement.classList.add('show');
            modalOverlay.style.display = 'block';
        }

        // Initialize EntitySelector for role selection
        if (availableRoles.length > 0) {
            // Get project ID from workflow builder
            const currentProject = window.workflowBuilder?.currentProject;
            
            this.locationUpdateRoleSelector = new EntitySelector('locationUpdateRoleSelector', {
                tableName: 'roles',
                projectId: currentProject?.id,
                projectIdField: 'project_id',
                idField: 'id',
                nameField: 'name',
                descriptionField: 'description',
                entityName: 'role',
                entityNamePlural: 'roles',
                label: 'Allowed Roles:',
                placeholder: 'Type role name or # for all roles...',
                allowCreation: false, // Don't allow creating new roles here
                allowSelection: true,
                showQuickSelect: true,
                onSelectionChange: (selectedEntities) => {
                    this.logger.log('Location update roles selection changed:', selectedEntities);
                }
            });

            // Set initially selected roles
            const currentWorkflow = window.workflowBuilder.localState.getState().workflow;
            if (currentWorkflow && selectedRoles.length > 0) {
                // Convert role IDs to entities format expected by EntitySelector
                const selectedEntities = selectedRoles.map(roleId => {
                    const role = availableRoles.find(r => r.id === roleId);
                    return role ? { id: role.id, name: role.name } : null;
                }).filter(Boolean);
                
                // Set selected entities after a small delay to ensure EntitySelector is fully initialized
                setTimeout(() => {
                    this.locationUpdateRoleSelector.setSelectedEntities(selectedEntities);
                }, 100);
            }
        }

        // Make this instance available globally for onclick handlers
        window.workflowPreview = this;

        // Handle save button
        document.getElementById('saveLocationUpdateRoles').addEventListener('click', () => {
            this.saveLocationUpdateRoles();
            this.closeLocationUpdateModal();
        });
    }

    /**
     * Close location update modal
     */
    closeLocationUpdateModal() {
        // Clean up EntitySelector if it exists
        if (this.locationUpdateRoleSelector) {
            this.locationUpdateRoleSelector.destroy();
            this.locationUpdateRoleSelector = null;
        }
        
        const modalElement = document.getElementById('locationUpdateModal');
        const modalOverlay = document.getElementById('modal-overlay');
        
        if (modalElement) {
            modalElement.classList.remove('show');
            modalElement.remove();
        }
        
        if (modalOverlay) {
            modalOverlay.style.display = 'none';
        }
        
        // Clean up global reference
        if (window.workflowPreview === this) {
            delete window.workflowPreview;
        }
    }

    /**
     * Save location update roles configuration
     */
    async saveLocationUpdateRoles() {
        try {
            // Get selected roles from EntitySelector
            const selectedRoles = this.locationUpdateRoleSelector 
                ? this.locationUpdateRoleSelector.getSelectedEntityIds()
                : [];

            this.logger.log('Saving location update roles:', selectedRoles);

            // Update workflow-level location update roles
            window.workflowBuilder.localState.setState('workflow.locationUpdateRoles', selectedRoles);

            // Show success notification
            const roleNames = selectedRoles.length > 0 
                ? window.workflowBuilder.projectRoles
                    .filter(role => selectedRoles.includes(role.id))
                    .map(role => role.name)
                    .join(', ')
                : 'keine';

            app.showNotification('success', 'Gespeichert', `Standort-Update Berechtigungen aktualisiert: ${roleNames}`);
            
            // Update the button state
            this.updateLocationUpdateButtonState(selectedRoles.length > 0);

        } catch (error) {
            this.logger.error('Failed to save location update roles:', error);
            app.showNotification('error', 'Fehler', 'Fehler beim Speichern: ' + error.message);
        }
    }

    /**
     * Update the location update button state based on configuration
     */
    updateLocationUpdateButtonState(hasPermissions) {
        // Find the location info item and re-render just that part
        const infoItem = this.container.querySelector('.info-item:has(.location-update-btn)');
        if (infoItem) {
            // Re-render the button and roles info
            const infoContent = infoItem.querySelector('.info-content');
            if (infoContent) {
                // Keep the location address, update just the button
                const locationValue = infoContent.querySelector('.info-value')?.textContent || 'Preview Location';
                infoContent.innerHTML = `
                    <div class="info-value">${locationValue}</div>
                    ${this.renderLocationUpdateButton()}
                `;
            }
        }
    }

    /**
     * Handle assignment permissions configuration
     */
    async handleAssignmentPermissionsConfiguration() {
        try {
            this.logger.log('Opening assignment permissions configuration modal');
            
            // Get current workflow data
            const currentWorkflow = window.workflowBuilder.localState.getState().workflow;
            if (!currentWorkflow) {
                throw new Error('No workflow data available');
            }

            // Get project roles for the role selectors
            const projectRoles = window.workflowBuilder.projectRoles || [];
            if (projectRoles.length === 0) {
                app.showNotification('warning', 'Keine Rollen', 'Es wurden keine Rollen für dieses Projekt gefunden. Erstellen Sie zunächst Rollen im Rollenbereich.');
                return;
            }

            // Get current assignment permissions from workflow instance
            const currentAssignmentRoles = currentWorkflow?.assignmentRoles || [];
            const currentSelfAssignmentRoles = currentWorkflow?.selfAssignmentRoles || [];

            // Create and show the assignment permissions modal
            this.showAssignmentPermissionsModal(projectRoles, currentAssignmentRoles, currentSelfAssignmentRoles);
            
        } catch (error) {
            this.logger.error('Failed to open assignment permissions configuration:', error);
            app.showNotification('error', 'Fehler', 'Fehler beim Öffnen der Zuweisungsberechtigungen: ' + error.message);
        }
    }

    /**
     * Show assignment permissions selection modal
     */
    showAssignmentPermissionsModal(availableRoles, assignmentRoles = [], selfAssignmentRoles = []) {
        // Create modal HTML
        const modalHtml = `
            <div class="modal" id="assignmentPermissionsModal">
                <div class="modal-content" style="max-width: 700px;">
                    <div class="modal-header">
                        <h3 class="modal-title">
                            <i class="fas fa-user-plus"></i>
                            Workflow-Zuweisungsberechtigungen
                        </h3>
                        <button type="button" class="modal-close" onclick="window.workflowPreview.closeAssignmentPermissionsModal()">
                            <span>&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="assignment-permissions-info">
                            <small class="text-muted">
                                <i class="fas fa-info-circle"></i>
                                Konfigurieren Sie, welche Rollen Workflow-Instanzen zuweisen können.
                            </small>
                        </div>
                        
                        <div class="form-group">
                            <h5><i class="fas fa-users-cog"></i> Vollzuweisungsberechtigung</h5>
                            <div class="permission-info">
                                <small class="text-muted">
                                    Diese Rollen können Workflow-Instanzen beliebigen Teilnehmern zuweisen.
                                </small>
                            </div>
                            <div id="assignmentRoleSelector" class="role-selection-container">
                                <!-- EntitySelector for full assignment roles -->
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <h5><i class="fas fa-user-check"></i> Selbstzuweisungsberechtigung</h5>
                            <div class="permission-info">
                                <small class="text-muted">
                                    Diese Rollen können Workflow-Instanzen nur sich selbst zuweisen.
                                </small>
                            </div>
                            <div id="selfAssignmentRoleSelector" class="role-selection-container">
                                <!-- EntitySelector for self-assignment roles -->
                            </div>
                        </div>
                        
                        ${availableRoles.length === 0 ? `
                            <div class="alert alert-warning">
                                <i class="fas fa-exclamation-triangle"></i>
                                Keine Rollen verfügbar. Erstellen Sie zunächst Rollen im Rollenbereich.
                            </div>
                        ` : ''}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="window.workflowPreview.closeAssignmentPermissionsModal()">Abbrechen</button>
                        <button type="button" class="btn btn-primary" id="saveAssignmentPermissions">
                            <i class="fas fa-save"></i>
                            Speichern
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if present
        const existingModal = document.getElementById('assignmentPermissionsModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Show modal
        const modalElement = document.getElementById('assignmentPermissionsModal');
        const modalOverlay = document.getElementById('modal-overlay');
        
        if (modalElement && modalOverlay) {
            modalElement.classList.add('show');
            modalOverlay.style.display = 'block';
        }

        // Initialize EntitySelectors for both permission types
        if (availableRoles.length > 0) {
            // Try multiple ways to get the project ID
            const currentProject = window.workflowBuilder?.currentProject;
            const builderProjectId = window.workflowBuilder?.projectId;
            const workflowProjectId = window.workflowBuilder?.localState?.getState()?.workflow?.project_id;
            
            // Use the first available project ID
            const projectId = currentProject?.id || builderProjectId || workflowProjectId;
            
            // Debug logging
            this.logger.log('EntitySelector Debug Info:', {
                availableRoles: availableRoles,
                currentProject: currentProject,
                builderProjectId: builderProjectId,
                workflowProjectId: workflowProjectId,
                finalProjectId: projectId,
                assignmentRoles: assignmentRoles,
                selfAssignmentRoles: selfAssignmentRoles
            });
            
            // Full assignment roles selector  
            this.logger.log('Creating assignment role selector with container ID:', 'assignmentRoleSelector');
            this.logger.log('Container element exists:', !!document.getElementById('assignmentRoleSelector'));
            
            this.assignmentRoleSelector = new EntitySelector('assignmentRoleSelector', {
                tableName: 'roles',
                projectId: projectId,
                projectIdField: 'project_id',
                idField: 'id',
                nameField: 'name',
                descriptionField: 'description',
                entityName: 'role',
                entityNamePlural: 'roles',
                label: 'Vollzuweisungsberechtigte Rollen:',
                placeholder: 'Type role name or # for all roles...',
                allowCreation: false,
                allowSelection: true,
                showQuickSelect: true,
                onSelectionChange: (selectedEntities) => {
                    this.logger.log('Assignment roles selection changed:', selectedEntities);
                }
            });
            
            this.logger.log('Assignment role selector created:', !!this.assignmentRoleSelector);

            // Self-assignment roles selector
            this.selfAssignmentRoleSelector = new EntitySelector('selfAssignmentRoleSelector', {
                tableName: 'roles',
                projectId: projectId,
                projectIdField: 'project_id',
                idField: 'id',
                nameField: 'name',
                descriptionField: 'description',
                entityName: 'role',
                entityNamePlural: 'roles',
                label: 'Selbstzuweisungsberechtigte Rollen:',
                placeholder: 'Type role name or # for all roles...',
                allowCreation: false,
                allowSelection: true,
                showQuickSelect: true,
                onSelectionChange: (selectedEntities) => {
                    this.logger.log('Self-assignment roles selection changed:', selectedEntities);
                }
            });

            // Set initially selected roles
            if (assignmentRoles.length > 0) {
                const assignmentEntities = assignmentRoles.map(roleId => {
                    const role = availableRoles.find(r => r.id === roleId);
                    return role ? { id: role.id, name: role.name } : null;
                }).filter(Boolean);
                
                setTimeout(() => {
                    this.assignmentRoleSelector.setSelectedEntities(assignmentEntities);
                }, 100);
            }

            if (selfAssignmentRoles.length > 0) {
                const selfAssignmentEntities = selfAssignmentRoles.map(roleId => {
                    const role = availableRoles.find(r => r.id === roleId);
                    return role ? { id: role.id, name: role.name } : null;
                }).filter(Boolean);
                
                setTimeout(() => {
                    this.selfAssignmentRoleSelector.setSelectedEntities(selfAssignmentEntities);
                }, 150);
            }
        }

        // Make this instance available globally for onclick handlers
        window.workflowPreview = this;

        // Handle save button
        document.getElementById('saveAssignmentPermissions').addEventListener('click', () => {
            this.saveAssignmentPermissions();
            this.closeAssignmentPermissionsModal();
        });
    }

    /**
     * Close assignment permissions modal
     */
    closeAssignmentPermissionsModal() {
        // Clean up EntitySelectors if they exist
        if (this.assignmentRoleSelector) {
            this.assignmentRoleSelector.destroy();
            this.assignmentRoleSelector = null;
        }
        
        if (this.selfAssignmentRoleSelector) {
            this.selfAssignmentRoleSelector.destroy();
            this.selfAssignmentRoleSelector = null;
        }
        
        const modalElement = document.getElementById('assignmentPermissionsModal');
        const modalOverlay = document.getElementById('modal-overlay');
        
        if (modalElement) {
            modalElement.classList.remove('show');
            modalElement.remove();
        }
        
        if (modalOverlay) {
            modalOverlay.style.display = 'none';
        }
        
        // Clean up global reference
        if (window.workflowPreview === this) {
            delete window.workflowPreview;
        }
    }

    /**
     * Save assignment permissions configuration
     */
    async saveAssignmentPermissions() {
        try {
            // Get selected roles from both EntitySelectors
            const assignmentRoles = this.assignmentRoleSelector 
                ? this.assignmentRoleSelector.getSelectedEntityIds()
                : [];
                
            const selfAssignmentRoles = this.selfAssignmentRoleSelector 
                ? this.selfAssignmentRoleSelector.getSelectedEntityIds()
                : [];

            this.logger.log('Saving assignment permissions:', {
                assignmentRoles,
                selfAssignmentRoles
            });

            // Update workflow instance with the assignment permissions
            window.workflowBuilder.localState.setState('workflow.assignmentRoles', assignmentRoles);
            window.workflowBuilder.localState.setState('workflow.selfAssignmentRoles', selfAssignmentRoles);

            // Show success notification
            const assignmentRoleNames = assignmentRoles.length > 0 
                ? window.workflowBuilder.projectRoles
                    .filter(role => assignmentRoles.includes(role.id))
                    .map(role => role.name)
                    .join(', ')
                : 'keine';

            const selfAssignmentRoleNames = selfAssignmentRoles.length > 0 
                ? window.workflowBuilder.projectRoles
                    .filter(role => selfAssignmentRoles.includes(role.id))
                    .map(role => role.name)
                    .join(', ')
                : 'keine';

            app.showNotification('success', 'Gespeichert', 
                `Zuweisungsberechtigungen aktualisiert:\nVollzuweisung: ${assignmentRoleNames}\nSelbstzuweisung: ${selfAssignmentRoleNames}`);
            
            // Update the button state
            this.updateAssignmentPermissionsButtonState(assignmentRoles.length > 0 || selfAssignmentRoles.length > 0);

        } catch (error) {
            this.logger.error('Failed to save assignment permissions:', error);
            app.showNotification('error', 'Fehler', 'Fehler beim Speichern: ' + error.message);
        }
    }

    /**
     * Update the assignment permissions button state based on configuration
     */
    updateAssignmentPermissionsButtonState(hasPermissions) {
        // Find the assignment permissions info item and re-render just that part
        const infoItem = this.container.querySelector('.info-item:has(.assignment-permissions-btn)');
        if (infoItem) {
            // Re-render the button and permissions info
            const infoContent = infoItem.querySelector('.info-content');
            if (infoContent) {
                infoContent.innerHTML = this.renderAssignmentPermissionsButton();
            }
        }
    }

    /**
     * Render assignment permissions button
     */
    renderAssignmentPermissionsButton() {
        // Get current assignment permissions from workflow instance
        const currentWorkflow = window.workflowBuilder.localState.getState().workflow;
        const assignmentRoles = currentWorkflow?.assignmentRoles || [];
        const selfAssignmentRoles = currentWorkflow?.selfAssignmentRoles || [];
        
        const hasAssignmentPermissions = assignmentRoles.length > 0;
        const hasSelfAssignmentPermissions = selfAssignmentRoles.length > 0;
        const hasAnyPermissions = hasAssignmentPermissions || hasSelfAssignmentPermissions;
        
        const buttonClass = hasAnyPermissions ? 'btn-success' : 'btn-outline-secondary';
        const icon = hasAnyPermissions ? 'fas fa-check' : 'fas fa-exclamation-circle';
        const text = hasAnyPermissions ? 'Zuweisungsberechtigungen (konfiguriert)' : 'Zuweisungsberechtigungen (nicht konfiguriert)';
        
        let roleNamesText = '';
        if (hasAnyPermissions) {
            const projectRoles = window.workflowBuilder.projectRoles || [];
            const assignmentRoleNames = assignmentRoles
                .map(roleId => projectRoles.find(role => role.id === roleId)?.name)
                .filter(Boolean)
                .join(', ');
            const selfAssignmentRoleNames = selfAssignmentRoles
                .map(roleId => projectRoles.find(role => role.id === roleId)?.name)
                .filter(Boolean)
                .join(', ');
                
            let parts = [];
            if (assignmentRoleNames) parts.push(`Vollzuweisung: ${assignmentRoleNames}`);
            if (selfAssignmentRoleNames) parts.push(`Selbstzuweisung: ${selfAssignmentRoleNames}`);
            
            roleNamesText = `
            <div class="assignment-permissions-details">
                <small class="text-muted">${parts.join(' | ')}</small>
            </div>`;
        }
        
        return `
            <button class="info-action assignment-permissions-btn ${buttonClass}" data-action="configure-assignment-permissions">
                <i class="${icon}"></i> ${text}
            </button>
        `;
    }

    /**
     * Cleanup method - clear saved state and call parent destroy
     */
    destroy() {
        // Clean up event listeners
        this.cleanupEventListeners();
        
        // Only clear state if this was an intentional destruction
        // (not just a refresh/reload)
        if (!window.beforeunload) {
            this.clearPreviewState();
        }
        
        super.destroy();
    }
}