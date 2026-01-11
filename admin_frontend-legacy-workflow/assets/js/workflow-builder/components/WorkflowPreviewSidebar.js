/**
 * Workflow Preview Sidebar
 * 
 * Desktop-only sidebar that previews how the workflow appears to participants
 * Adapted from participants frontend BottomSheetContainer for desktop use only
 * 
 * Features:
 * - Comprehensive state change detection (catches ALL relevant changes)
 * - Adaptive throttling (critical changes update faster)
 * - Automatic preview updates with state preservation
 * - Manual refresh and force update capabilities
 * - Error handling and recovery
 * 
 * Global API:
 * - window.workflowPreviewSidebar.refreshPreview() - Manual refresh
 * - window.workflowPreviewSidebar.forceUpdatePreview() - Immediate update
 */

import DebugLogger from '../../core/debug-logger.js';
import { i18n } from '../../core/i18n.js';

export class WorkflowPreviewSidebar {
    constructor() {
        this.logger = new DebugLogger('WorkflowPreviewSidebar');
        this.state = {
            isOpen: false,
            isVisible: true, // Always visible in desktop mode
            lastUpdateTime: 0,
            updateCount: 0
        };
        
        this.moduleRegistry = new Map();
        this.activeModule = null;
        this.activeModuleId = null;
        this.container = null;
        this.contentElement = null;
        this.headerElement = null;
        
        // Local state subscription
        this.localStateManager = null;
        this.stateUnsubscribe = null;
        
        // Language subscription
        this.languageUnsubscribe = null;
        
        this.logger.log('Initialized');
    }

    /**
     * Initialize the preview sidebar
     */
    initialize(parentContainer, localStateManager) {
        try {
            this.logger.log('Starting preview sidebar initialization...');
            this.localStateManager = localStateManager;
            
            // Create container
            this.createContainer(parentContainer);
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Subscribe to local state changes
            this.subscribeToLocalState();
            
            // Subscribe to language changes
            this.subscribeToLanguageChanges();
            
            this.logger.log('Preview sidebar initialized successfully');
            return true;
        } catch (error) {
            this.logger.error('Failed to initialize preview sidebar:', error);
            console.error('Preview sidebar initialization error:', error);
            return false;
        }
    }

    /**
     * Create the sidebar container elements
     */
    createContainer(parentContainer) {
        // Create main container - desktop sidebar only
        this.container = document.createElement('div');
        this.container.className = 'workflow-preview-sidebar';
        
        // Create header
        this.headerElement = document.createElement('div');
        this.headerElement.className = 'preview-sidebar-header';
        this.headerElement.innerHTML = `
            <div class="preview-sidebar-header-content">
                <div class="preview-sidebar-title-section">
                    <h3 class="preview-sidebar-title" id="previewSidebarTitle">${i18n.t('workflow_preview.title')}</h3>
                    <div class="preview-sidebar-subtitle" id="previewSidebarSubtitle">${i18n.t('workflow_preview.participant_view')}</div>
                </div>
                <div class="preview-sidebar-controls">
                    <button class="preview-sidebar-refresh" id="previewSidebarRefresh" type="button" title="${i18n.t('workflow_preview.refresh_preview')}">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                </div>
            </div>
        `;
        
        // Create content container
        this.contentElement = document.createElement('div');
        this.contentElement.className = 'preview-sidebar-content';
        
        // Assemble container
        this.container.appendChild(this.headerElement);
        this.container.appendChild(this.contentElement);
        
        // Add to parent
        parentContainer.appendChild(this.container);
        
        this.logger.log('Container created');
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Refresh button handler
        const refreshButton = document.getElementById('previewSidebarRefresh');
        if (refreshButton) {
            refreshButton.addEventListener('click', () => {
                this.refreshPreview();
            });
        }
    }

    /**
     * Subscribe to local state changes for real-time updates
     */
    subscribeToLocalState() {
        if (!this.localStateManager) return;
        
        // Throttle updates to reduce lag
        this.updateThrottle = null;
        
        this.stateUnsubscribe = this.localStateManager.subscribe((path, value, oldValue) => {
            // Comprehensive state change detection - catch ALL changes that affect preview
            const shouldUpdate = this.shouldUpdatePreview(path, value, oldValue);
            
            if (shouldUpdate) {
                this.state.updateCount++;
                
                // Clear any existing throttle
                if (this.updateThrottle) {
                    clearTimeout(this.updateThrottle);
                }
                
                // Adaptive throttling - shorter delay for critical changes
                const isCriticalChange = this.isCriticalChange(path);
                const throttleDelay = isCriticalChange ? 150 : 300;
                
                this.updateThrottle = setTimeout(() => {
                    try {
                        // Preserve state before update
                        if (this.activeModule && typeof this.activeModule.savePreviewState === 'function') {
                            this.activeModule.savePreviewState();
                        }
                        
                        this.state.lastUpdateTime = Date.now();
                        this.updatePreview();
                        this.updateThrottle = null;
                        
                        this.logger.log(`Preview updated successfully for path: ${path} (update #${this.state.updateCount})`);
                    } catch (error) {
                        this.logger.error('Error during throttled preview update:', error);
                        this.showError(i18n.t('workflow_preview.preview_error'));
                    }
                }, throttleDelay);
                
                this.logger.log(`Preview update scheduled for path: ${path} (${isCriticalChange ? 'critical' : 'normal'} priority)`);
            }
        });
        
        this.logger.log('Subscribed to comprehensive local state changes with optimized throttling');
    }

    /**
     * Subscribe to language changes to update translations
     */
    subscribeToLanguageChanges() {
        this.languageUnsubscribe = i18n.subscribe(() => {
            this.updateTranslations();
        });
        this.logger.log('Subscribed to language changes');
    }

    /**
     * Update all translations in the sidebar
     */
    updateTranslations() {
        try {
            // Update header translations
            const titleElement = document.getElementById('previewSidebarTitle');
            const subtitleElement = document.getElementById('previewSidebarSubtitle');
            const refreshButton = document.getElementById('previewSidebarRefresh');
            
            if (titleElement) {
                const workflowName = titleElement.textContent.split(' - ')[0];
                if (workflowName && workflowName !== i18n.t('workflow_preview.title')) {
                    titleElement.textContent = `${workflowName} - ${i18n.t('workflow_preview.title')}`;
                } else {
                    titleElement.textContent = i18n.t('workflow_preview.title');
                }
            }
            
            if (subtitleElement) {
                subtitleElement.textContent = i18n.t('workflow_preview.participant_view');
            }
            
            if (refreshButton) {
                refreshButton.setAttribute('title', i18n.t('workflow_preview.refresh_preview'));
            }
            
            // Update active module if it has translation update method
            if (this.activeModule && typeof this.activeModule.updateTranslations === 'function') {
                this.activeModule.updateTranslations();
            }
            
            this.logger.log('Translations updated successfully');
        } catch (error) {
            this.logger.error('Error updating translations:', error);
        }
    }

    /**
     * Determine if a state change should trigger a preview update
     * This catches all changes that could affect the participant experience
     */
    shouldUpdatePreview(path, value, oldValue) {
        // Always update on wildcard changes (bulk operations)
        if (path === '*') {
            this.logger.log('Wildcard state change detected - updating preview');
            return true;
        }
        
        // Core workflow data changes
        if (path.startsWith('workflow.')) {
            return true;
        }
        
        // Direct collections changes  
        if (path === 'stages' || path === 'actions' || path === 'formFields') {
            return true;
        }
        
        // Changes to any stage data (including nested properties)
        if (path.includes('stages.') || path.startsWith('stages.')) {
            return true;
        }
        
        // Changes to any action data (including nested properties)
        if (path.includes('actions.') || path.startsWith('actions.')) {
            return true;
        }
        
        // Changes to form fields (including nested properties)
        if (path.includes('formFields.') || path.startsWith('formFields.')) {
            return true;
        }
        
        // Changes to questions (could be stored separately)
        if (path.includes('questions') || path.startsWith('questions')) {
            return true;
        }
        
        // Changes to mappings that might contain field definitions
        if (path.includes('mappings') || path.startsWith('mappings')) {
            return true;
        }
        
        // Changes to deleted items (need to update preview when items are removed)
        if (path.startsWith('deleted')) {
            return true;
        }
        
        // Changes to workflow metadata that affects display
        if (path.includes('name') || path.includes('description') || 
            path.includes('type') || path.includes('color') || path.includes('icon')) {
            return true;
        }
        
        // Changes to isDirty state (might indicate saves/loads)
        if (path === 'isDirty') {
            return true;
        }
        
        // Skip pure UI state changes that don't affect participant preview
        if (path.startsWith('viewport.') || path.startsWith('selection.')) {
            return false;
        }
        
        // For any other paths, be conservative and update (better safe than sorry)
        this.logger.log(`Unknown state path detected: ${path} - updating preview to be safe`);
        return true;
    }

    /**
     * Determine if a change is critical and needs faster update
     * Critical changes get shorter throttle delays for better user experience
     */
    isCriticalChange(path) {
        // Form field changes are critical - users expect immediate feedback
        if (path.includes('formFields') || path.includes('questions')) {
            return true;
        }
        
        // Stage and action name changes are critical for UI consistency
        if (path.includes('name') && (path.includes('stages') || path.includes('actions'))) {
            return true;
        }
        
        // Workflow name/description changes are critical for header updates
        if (path.startsWith('workflow.name') || path.startsWith('workflow.description')) {
            return true;
        }
        
        // Wildcard changes (bulk operations) should be fast
        if (path === '*') {
            return true;
        }
        
        return false;
    }

    /**
     * Register a module class for dynamic loading
     */
    registerModule(moduleId, moduleClass) {
        this.moduleRegistry.set(moduleId, moduleClass);
        this.logger.log(`Module '${moduleId}' registered`);
    }

    /**
     * Load and display a module
     */
    async loadModule(moduleId, params = {}) {
        try {
            const ModuleClass = this.moduleRegistry.get(moduleId);
            if (!ModuleClass) {
                throw new Error(`Module '${moduleId}' not found in registry`);
            }
            
            this.logger.log(`Loading module: ${moduleId}`, params);
            
            // Check if we're reloading the same module
            const isReloadingSameModule = this.activeModuleId === moduleId && this.activeModule;
            
            if (isReloadingSameModule) {
                this.logger.log('Reloading same module - preserving state');
                // Save current state before reloading
                if (typeof this.activeModule.savePreviewState === 'function') {
                    this.activeModule.savePreviewState();
                    this.logger.log('State saved before module reload');
                }
            }
            
            // Unload current module if different or first load
            if (this.activeModule && !isReloadingSameModule) {
                this.unloadActiveModule();
            }
            
            // Create new module instance only if not reloading same module
            if (!isReloadingSameModule) {
                this.activeModule = new ModuleClass(params);
                this.activeModuleId = moduleId;
            }
            
            // Render module content (this will load saved state if it's the same module)
            await this.activeModule.render(this.contentElement, params);
            
            // Mark as open
            this.state.isOpen = true;
            this.container.classList.add('open');
            
            this.logger.log(`Module '${moduleId}' ${isReloadingSameModule ? 'reloaded' : 'loaded'} successfully`);
            return true;
            
        } catch (error) {
            this.logger.error(`Failed to load module '${moduleId}':`, error);
            throw error;
        }
    }

    /**
     * Unload active module
     */
    unloadActiveModule() {
        if (this.activeModule) {
            this.logger.log(`Unloading module: ${this.activeModuleId}`);
            
            // Call module destroy method
            if (typeof this.activeModule.destroy === 'function') {
                this.activeModule.destroy();
            }
            
            // Clear content
            this.contentElement.innerHTML = '';
            
            // Reset state
            this.activeModule = null;
            this.activeModuleId = null;
        }
    }

    /**
     * Update preview based on current workflow state
     */
    updatePreview() {
        if (!this.localStateManager) return;
        
        // Load workflow preview module with current state
        this.loadWorkflowPreview();
    }

    /**
     * Force immediate preview update (bypasses throttling)
     * Use for user-initiated actions where immediate feedback is expected
     */
    forceUpdatePreview() {
        if (!this.localStateManager) return;
        
        // Clear any pending throttled updates
        if (this.updateThrottle) {
            clearTimeout(this.updateThrottle);
            this.updateThrottle = null;
        }
        
        try {
            this.logger.log('Forcing immediate preview update...');
            
            // Preserve state before update
            if (this.activeModule && typeof this.activeModule.savePreviewState === 'function') {
                this.activeModule.savePreviewState();
            }
            
            this.state.lastUpdateTime = Date.now();
            this.state.updateCount++;
            
            this.updatePreview();
            
            this.logger.log(`Immediate preview update completed (update #${this.state.updateCount})`);
        } catch (error) {
            this.logger.error('Error during forced preview update:', error);
            this.showError(i18n.t('workflow_preview.preview_error'));
        }
    }

    /**
     * Refresh preview manually
     */
    refreshPreview() {
        this.logger.log('Manual refresh requested - forcing immediate update...');
        
        // Use force update for manual refresh to provide immediate feedback
        this.forceUpdatePreview();
    }

    /**
     * Load workflow preview with current local state
     * Enhanced to better extract form fields from all sources in local storage
     */
    async loadWorkflowPreview() {
        if (!this.localStateManager) return;
        
        const workflowState = this.localStateManager.getState();
        const workflowData = workflowState.workflow;
        const stages = Array.from(workflowState.stages.values());
        const actions = Array.from(workflowState.actions.values());
        
        // Extract form fields comprehensively from all sources in local state
        let allFormFields = [];
        const fieldSources = {
            fromStageFormFields: 0,
            fromActionFormFields: 0, 
            fromActionEditableFields: 0,
            fromTopLevelFormFields: 0,
            fromQuestions: 0,
            fromMappings: 0
        };
        
        // Get fields from stages - check all possible field arrays
        stages.forEach(stage => {
            if (stage.formFields && Array.isArray(stage.formFields)) {
                this.logger.log(`Stage ${stage.name} has ${stage.formFields.length} formFields`);
                allFormFields = allFormFields.concat(stage.formFields);
                fieldSources.fromStageFormFields += stage.formFields.length;
            }
            // Also check for questions array (might be stored differently)
            if (stage.questions && Array.isArray(stage.questions)) {
                this.logger.log(`Stage ${stage.name} has ${stage.questions.length} questions`);
                allFormFields = allFormFields.concat(stage.questions);
                fieldSources.fromQuestions += stage.questions.length;
            }
        });
        
        // Get fields from actions - check all field arrays
        actions.forEach(action => {
            // Regular form fields from actions
            if (action.formFields && Array.isArray(action.formFields)) {
                this.logger.log(`Action ${action.name} has ${action.formFields.length} formFields`);
                allFormFields = allFormFields.concat(action.formFields);
                fieldSources.fromActionFormFields += action.formFields.length;
            }
            
            // Editable fields (used in edit actions)
            if (action.editableFields && Array.isArray(action.editableFields)) {
                this.logger.log(`Action ${action.name} has ${action.editableFields.length} editableFields`);
                allFormFields = allFormFields.concat(action.editableFields);
                fieldSources.fromActionEditableFields += action.editableFields.length;
            }
            
            // Questions from actions
            if (action.questions && Array.isArray(action.questions)) {
                this.logger.log(`Action ${action.name} has ${action.questions.length} questions`);
                allFormFields = allFormFields.concat(action.questions);
                fieldSources.fromQuestions += action.questions.length;
            }
        });
        
        // Check top-level state for form fields
        if (workflowState.formFields) {
            if (workflowState.formFields instanceof Map) {
                const topLevelFields = Array.from(workflowState.formFields.values());
                this.logger.log(`Found ${topLevelFields.length} fields in top-level formFields Map`);
                allFormFields = allFormFields.concat(topLevelFields);
                fieldSources.fromTopLevelFormFields += topLevelFields.length;
            } else if (Array.isArray(workflowState.formFields)) {
                this.logger.log(`Found ${workflowState.formFields.length} fields in top-level formFields Array`);
                allFormFields = allFormFields.concat(workflowState.formFields);
                fieldSources.fromTopLevelFormFields += workflowState.formFields.length;
            }
        }
        
        // Check for questions in top-level state
        if (workflowState.questions) {
            if (workflowState.questions instanceof Map) {
                const topLevelQuestions = Array.from(workflowState.questions.values());
                this.logger.log(`Found ${topLevelQuestions.length} questions in top-level questions Map`);
                allFormFields = allFormFields.concat(topLevelQuestions);
                fieldSources.fromQuestions += topLevelQuestions.length;
            } else if (Array.isArray(workflowState.questions)) {
                this.logger.log(`Found ${workflowState.questions.length} questions in top-level questions Array`);
                allFormFields = allFormFields.concat(workflowState.questions);
                fieldSources.fromQuestions += workflowState.questions.length;
            }
        }
        
        // Check for mappings that might contain field definitions
        if (workflowState.mappings) {
            if (workflowState.mappings instanceof Map) {
                const mappings = Array.from(workflowState.mappings.values());
                mappings.forEach(mapping => {
                    if (mapping.fields && Array.isArray(mapping.fields)) {
                        allFormFields = allFormFields.concat(mapping.fields);
                        fieldSources.fromMappings += mapping.fields.length;
                    }
                });
            }
        }
        
        // Remove duplicates based on ID
        const uniqueFields = [];
        const seenIds = new Set();
        allFormFields.forEach(field => {
            const fieldId = field.id || field.field_id || field.key || field.field_key || field.name;
            if (fieldId && !seenIds.has(fieldId)) {
                seenIds.add(fieldId);
                uniqueFields.push(field);
            } else if (!fieldId) {
                // Include fields without IDs (they might be valid)
                uniqueFields.push(field);
            }
        });
        
        this.logger.log('Comprehensive form fields extraction for preview:', {
            totalUniqueFields: uniqueFields.length,
            totalRawFields: allFormFields.length,
            fieldSources: fieldSources,
            stageDetails: stages.map(stage => ({
                name: stage.name,
                id: stage.id,
                formFieldsCount: stage.formFields ? stage.formFields.length : 0,
                questionsCount: stage.questions ? stage.questions.length : 0
            })),
            actionDetails: actions.map(action => ({
                name: action.name,
                id: action.id,
                type: action.type,
                actionType: action.actionType,
                formFieldsCount: action.formFields ? action.formFields.length : 0,
                editableFieldsCount: action.editableFields ? action.editableFields.length : 0,
                questionsCount: action.questions ? action.questions.length : 0
            })),
            sampleFields: uniqueFields.slice(0, 3).map(field => ({
                label: field.label || field.field_label || field.name,
                type: field.type || field.field_type,
                id: field.id || field.field_id
            }))
        });
        
        // Update header with workflow name
        const titleElement = document.getElementById('previewSidebarTitle');
        if (titleElement && workflowData.name) {
            titleElement.textContent = `${workflowData.name} - ${i18n.t('workflow_preview.title')}`;
        }
        
        try {
            await this.loadModule('workflow-preview', {
                workflow: workflowData,
                stages: stages,
                actions: actions,
                formFields: uniqueFields
            });
        } catch (error) {
            this.logger.error('Failed to load workflow preview:', error);
            this.showError(i18n.t('workflow_preview.preview_error'));
        }
    }

    /**
     * Show error message in sidebar
     */
    showError(message) {
        this.contentElement.innerHTML = `
            <div class="preview-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${message}</p>
                <button onclick="workflowPreviewSidebar.forceUpdatePreview()" class="btn btn-primary btn-sm">
                    ${i18n.t('workflow_preview.retry')}
                </button>
            </div>
        `;
    }

    /**
     * Show empty state
     */
    showEmptyState() {
        this.contentElement.innerHTML = `
            <div class="preview-empty">
                <i class="fas fa-project-diagram"></i>
                <p>${i18n.t('workflow_preview.empty_state.title')}</p>
                <small>${i18n.t('workflow_preview.empty_state.subtitle')}</small>
            </div>
        `;
    }

    /**
     * Destroy the sidebar and cleanup
     */
    destroy() {
        // Unsubscribe from local state
        if (this.stateUnsubscribe) {
            this.stateUnsubscribe();
            this.stateUnsubscribe = null;
        }
        
        // Unsubscribe from language changes
        if (this.languageUnsubscribe) {
            this.languageUnsubscribe();
            this.languageUnsubscribe = null;
        }
        
        // Unload active module
        this.unloadActiveModule();
        
        // Remove container from DOM
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        
        // Clear references
        this.container = null;
        this.contentElement = null;
        this.headerElement = null;
        this.moduleRegistry.clear();
        this.localStateManager = null;
        
        this.logger.log('Destroyed');
    }
}

/**
 * Base class for preview sidebar modules
 */
export class PreviewSidebarModule {
    constructor(options = {}) {
        this.id = options.id || 'unknown-preview-module';
        this.title = options.title || 'Preview Module';
        this.container = null;
        
        this.logger = new DebugLogger(`PreviewSidebarModule-${this.id}`);
        this.logger.log(`${this.id} created`);
    }

    /**
     * Render module content - override in subclasses
     */
    async render(container, params = {}) {
        this.container = container;
        container.innerHTML = `
            <div class="preview-module-content">
                <p>Module: ${this.id}</p>
                <p>Override render() method in subclass</p>
            </div>
        `;
    }

    /**
     * Cleanup method - override and extend in subclasses
     */
    destroy() {
        this.container = null;
        this.logger.log(`${this.id} destroyed`);
    }
}