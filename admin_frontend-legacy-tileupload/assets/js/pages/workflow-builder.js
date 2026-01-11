/**
 * Workflow Builder - Local-First Implementation
 * Uses LocalStateManager for instant interactions and DatabaseAdapter for atomic saves
 * Backward compatible with existing CSS and UI patterns
 */

// Local-first architecture imports  
import LocalStateManager from '../workflow-builder/core/LocalStateManager.js';
import DatabaseAdapter from '../workflow-builder/core/DatabaseAdapter.js';

// Preview sidebar imports
import { WorkflowPreviewSidebar } from '../workflow-builder/components/WorkflowPreviewSidebar.js';
import { WorkflowPreviewModule } from '../workflow-builder/components/WorkflowPreviewModule.js';

// Legacy imports for compatibility
import { supabaseClient } from '../core/supabase.js';
import app from '../core/app.js';
import { i18n, i18nDOM } from '../core/i18n.js';
import EntitySelector from '../components/EntitySelector.js';
import FormBuilder from '../components/FormBuilder.js';
import DataFlow from '../components/DataFlow.js';
import WorkflowStageIconDesigner from '../components/workflow-stage-icon-designer.js';
import { WorkflowCanvasManager } from '../components/WorkflowCanvasManager.js';
import DebugLogger from '../core/debug-logger.js';

const logger = new DebugLogger('WorkflowBuilder');

class WorkflowBuilder {
    constructor(projectId, workflowId = null) {
        this.projectId = projectId;
        this.workflowId = workflowId;
        this.isNewWorkflow = !workflowId || workflowId === 'new';
        
        // Initialize local-first architecture
        this.localState = new LocalStateManager();
        this.databaseAdapter = new DatabaseAdapter();
        
        // Initialize preview sidebar
        this.previewSidebar = new WorkflowPreviewSidebar();
        
        // Legacy compatibility - expose state through getters
        this.projectRoles = [];
        
        // Visual state (not managed by LocalStateManager)
        this.nodes = new Map(); // stageId -> DOM node
        this.connections = new Map(); // actionId -> SVG connection
        
        // UI state
        this.isDragging = false;
        this.isConnecting = false;
        this.connectingFrom = null;
        this.dragOffset = { x: 0, y: 0 };
        
        // Counters
        this.stageCounter = 0;
        this.actionCounter = 0;
        
        // Enhanced sophisticated form management
        this.formBuilder = null;
        this.dataFlow = null;
        this.snapshots = new Map();
        this.sessionData = null;
        
        // Canvas manager for sophisticated visual interactions
        this.canvasManager = null;
        
        // Sophisticated role selectors
        this.nodeRoleSelector = null;
        this.transitionRoleSelector = null;
        
        // Entity selectors for various uses
        this.entitySelectors = new Map();
        
        // Question element management
        this.questions = new Map();
        this.customTables = [];
        this.availableFields = [];
        
        // Data flow analysis
        this.forms = [];
        this.formFields = [];
        this.dataFlowCache = new Map();
        
        // Advanced features
        this.undoStack = [];
        this.redoStack = [];
        this.currentSnapshot = null;
        this.autoSaveInterval = null;
        
        // Field types with smart dropdown support
        this.fieldTypes = {
            short: { 
                label: 'Short Text', 
                hasOptions: false, 
                icon: 'Text',
                validation: ['required', 'minLength', 'maxLength', 'pattern']
            },
            long: { 
                label: 'Long Text', 
                hasOptions: false, 
                icon: 'Document',
                validation: ['required', 'minLength', 'maxLength']
            },
            multiple: { 
                label: 'Multiple Choice', 
                hasOptions: true, 
                icon: 'Checkbox',
                validation: ['required', 'minSelections', 'maxSelections']
            },
            dropdown: { 
                label: 'Dropdown', 
                hasOptions: true, 
                icon: 'List',
                validation: ['required']
            },
            smart_dropdown: { 
                label: 'Smart Dropdown', 
                hasOptions: false, 
                hasMappings: true, 
                icon: 'Link',
                validation: ['required']
            },
            date: { 
                label: 'Date', 
                hasOptions: false, 
                icon: 'Calendar',
                validation: ['required', 'minDate', 'maxDate']
            },
            file: { 
                label: 'File Upload', 
                hasOptions: false, 
                icon: 'Attach',
                validation: ['required', 'fileTypes', 'maxFileSize']
            },
            number: { 
                label: 'Number', 
                hasOptions: false, 
                icon: 'Number',
                validation: ['required', 'min', 'max', 'step']
            },
            email: { 
                label: 'Email', 
                hasOptions: false, 
                icon: 'Email',
                validation: ['required', 'emailFormat']
            },
            custom_table_selector: {
                label: 'Custom Table Selector',
                hasOptions: false,
                hasCustomTable: true,
                icon: 'Table',
                validation: ['required'],
                description: 'Select from custom table entries'
            }
        };
        
        // Element references
        this.container = null;
        this.canvas = null;
        this.toolbar = null;
        
        // Initialize sophisticated data flow analysis
        this.initializeDataFlow();
        
        // Setup sophisticated form builder
        this.initializeFormBuilder();
        
        // Initialize sophisticated role selectors
        this.initializeRoleSelectors();
        
        // Load project roles for sophisticated selection
        this.loadProjectRoles();
    }

    // Local-first state getters for backward compatibility
    get workflow() {
        return this.localState.getState('workflow');
    }
    
    get stages() {
        return this.localState.getState('stages');
    }
    
    get actions() {
        return this.localState.getState('actions');
    }
    
    get selection() {
        return this.localState.getState('selection');
    }
    
    get viewport() {
        return this.localState.getState('viewport');
    }

    // =====================================================
    // WORKFLOW VALIDATION AND STATE MANAGEMENT
    // =====================================================
    
    /**
     * Validate workflow structure and rules
     */
    validateWorkflow(strict = false) {
        const errors = [];
        const warnings = [];
        
        // Check for start stage
        const startStages = Array.from(this.stages.values()).filter(s => s.type === 'start');
        if (startStages.length === 0) {
            errors.push('Workflow must have at least one start stage');
        } else if (startStages.length > 1) {
            warnings.push('Workflow has multiple start stages');
        }
        
        // Check for end stage
        const endStages = Array.from(this.stages.values()).filter(s => s.type === 'end');
        if (endStages.length === 0 && strict) {
            errors.push('Workflow must have at least one end stage');
        }
        
        // Check stage connectivity
        const disconnectedStages = this.findDisconnectedStages();
        if (disconnectedStages.length > 0 && strict) {
            errors.push(`Disconnected stages: ${disconnectedStages.map(s => s.name).join(', ')}`);
        }
        
        // Check for unique stage keys
        const stageKeys = Array.from(this.stages.values()).map(s => s.key);
        const duplicateKeys = stageKeys.filter((key, index) => stageKeys.indexOf(key) !== index);
        if (duplicateKeys.length > 0) {
            errors.push(`Duplicate stage keys: ${duplicateKeys.join(', ')}`);
        }
        
        return { errors, warnings, isValid: errors.length === 0 };
    }
    
    /**
     * Find stages that are not connected to the workflow
     */
    findDisconnectedStages() {
        const connected = new Set();
        const startStages = Array.from(this.stages.values()).filter(s => s.type === 'start');
        
        // BFS from start stages to find all reachable stages
        const queue = [...startStages.map(s => s.id)];
        
        while (queue.length > 0) {
            const stageId = queue.shift();
            if (connected.has(stageId)) continue;
            connected.add(stageId);
            
            // Find outgoing actions
            const outgoingActions = Array.from(this.actions.values())
                .filter(action => action.fromStageId === stageId);
            
            outgoingActions.forEach(action => {
                if (!connected.has(action.toStageId)) {
                    queue.push(action.toStageId);
                }
            });
        }
        
        // Return stages not reachable from start
        return Array.from(this.stages.values()).filter(stage => !connected.has(stage.id));
    }
    
    /**
     * Emit state change events for reactive updates
     */
    emitStateChange(eventType, data = {}) {
        const event = new CustomEvent(`workflow:${eventType}`, { 
            detail: { ...data, workflowId: this.workflowId } 
        });
        document.dispatchEvent(event);
    }
    
    // =====================================================
    // ENHANCED INITIALIZATION
    // =====================================================
    
    /**
     * Initialize sophisticated data flow analysis
     */
    initializeDataFlow() {
        this.dataFlow = new DataFlow();
        
        // Set up sophisticated callbacks
        this.dataFlow.setCallbacks({
            onDataFlowUpdate: (dataFlow) => {
                this.updateDataFlowVisualization(dataFlow);
            },
            onFieldConflict: (conflicts) => {
                this.handleFieldConflicts(conflicts);
            },
            onFieldInheritance: (inheritanceData) => {
                this.updateFieldInheritance(inheritanceData);
            }
        });
    }
    
    /**
     * Initialize sophisticated form builder
     */
    initializeFormBuilder() {
        logger.log('Initializing FormBuilder with projectId:', this.projectId);
        this.formBuilder = new FormBuilder(this.projectId, this);
        logger.log('FormBuilder initialized:', !!this.formBuilder);
        
        // Set up sophisticated callbacks
        this.formBuilder.setCallbacks({
            onFieldAdd: (field) => {
                this.handleFormFieldAdd(field);
            },
            onFieldUpdate: (field) => {
                this.handleFormFieldUpdate(field);
            },
            onFieldRemove: (field) => {
                this.handleFormFieldRemove(field);
            },
            onFieldsChange: (fields) => {
                this.handleFormFieldsChange(fields);
                this.updateDataFlow();
            }
        });
    }
    
    /**
     * Initialize sophisticated role selectors
     */
    initializeRoleSelectors() {
        // These will be created on demand when modals are shown
        this.nodeRoleSelector = null;
        this.transitionRoleSelector = null;
    }
    
    /**
     * Load project roles for sophisticated selection
     */
    async loadProjectRoles() {
        try {
            const { data: roles, error } = await supabaseClient.client
                .from('roles')
                .select('*')
                .eq('project_id', this.projectId)
                .order('name');
            
            if (error) throw error;
            this.projectRoles = roles || [];
        } catch (error) {
            logger.error('WorkflowBuilder: Failed to load project roles:', error);
            this.projectRoles = [];
        }
    }
    
    /**
     * Create sophisticated role selector for stage
     */
    createStageRoleSelector(containerId, selectedRoles = []) {
        const roleSelector = new EntitySelector(containerId, {
            tableName: 'roles',
            projectId: this.projectId,
            projectIdField: 'project_id',
            entityName: 'role',
            entityNamePlural: 'roles',
            allowCreation: true,
            allowSelection: true,
            showQuickSelect: true,
            placeholder: 'Type role name or # for all roles...',
            label: 'Allowed Roles (type to add new or select existing):',
            localData: this.projectRoles, // Use local data instead of database queries
            onSelectionChange: (roles) => {
                this.handleStageRoleChange(roles);
            },
            onEntityCreate: (role) => {
                this.handleRoleCreate(role);
            }
        });
        
        // Set initial selection
        if (selectedRoles.length > 0) {
            roleSelector.setSelectedEntities(selectedRoles);
        }
        
        return roleSelector;
    }
    
    /**
     * Create sophisticated role selector for action/transition
     */
    async createActionRoleSelector(containerId, selectedRoles = []) {
        // Ensure roles are loaded before creating EntitySelector
        if (this.projectRoles.length === 0) {
            logger.log('Loading project roles before creating action role selector...');
            await this.loadProjectRoles();
        }
        
        logger.log('Creating action role selector with roles:', selectedRoles);
        logger.log('Available project roles:', this.projectRoles);
        
        const roleSelector = new EntitySelector(containerId, {
            tableName: 'roles',
            projectId: this.projectId,
            projectIdField: 'project_id',
            entityName: 'role',
            entityNamePlural: 'roles',
            allowCreation: true,
            allowSelection: true,
            showQuickSelect: true,
            placeholder: 'Type role name or # for all roles...',
            label: 'Required Roles (type to add new or select existing):',
            localData: this.projectRoles, // Use local data instead of database queries
            initialSelection: selectedRoles, // Set initial selection during construction
            onSelectionChange: (roles) => {
                this.handleActionRoleChange(roles);
            },
            onEntityCreate: (role) => {
                this.handleRoleCreate(role);
            }
        });
        
        return roleSelector;
    }
    
    // =====================================================
    // SOPHISTICATED ROLE SELECTOR EVENT HANDLERS
    // =====================================================
    
    /**
     * Handle sophisticated stage role change
     */
    handleStageRoleChange(roles) {
        const selectedNode = this.selection.selectedNode;
        if (selectedNode && this.stages.has(selectedNode)) {
            const stage = this.stages.get(selectedNode);
            stage.allowedRoles = roles.map(r => r.id);
            this.takeSnapshot('Update stage roles');
        }
    }
    
    /**
     * Handle sophisticated action role change
     */
    handleActionRoleChange(roles) {
        logger.log('handleActionRoleChange called with roles:', roles);
        // Use the modal's configId instead of selectedAction to ensure we update the correct action
        const modal = document.getElementById('config-modal');
        const actionId = modal?.dataset?.configId || this.selection.selectedAction;
        
        logger.log('Modal configId:', modal?.dataset?.configId, 'selectedAction:', this.selection.selectedAction);
        
        if (actionId && this.actions.has(actionId)) {
            const roleIds = roles.map(r => r.id || r.name);
            logger.log('Updating action roles via LocalStateManager:', actionId, roleIds);
            
            // Update via LocalStateManager for consistency
            this.localState.updateAction(actionId, {
                allowedRoles: roleIds
            });
            
            // Also update legacy state for compatibility
            const action = this.actions.get(actionId);
            action.allowedRoles = roleIds;
            
            logger.log('Action roles updated in both local and legacy state');
        } else {
            logger.error('Could not update roles - actionId:', actionId, 'actionExists:', this.actions.has(actionId));
        }
    }
    
    /**
     * Handle sophisticated role creation
     */
    handleRoleCreate(role) {
        // Add to project roles list for future use
        this.projectRoles.push(role);
        
        if (app && app.showNotification) {
            app.showNotification('success', 'Role Created', `Role "${role.name}" created successfully`);
        }
    }
    
    // =====================================================
    // SOPHISTICATED FORM BUILDER EVENT HANDLERS
    // =====================================================
    
    /**
     * Handle sophisticated form field addition
     */
    handleFormFieldAdd(field) {
        logger.log('Form field added:', field);
        this.updateDataFlow();
    }
    
    /**
     * Handle sophisticated form field update
     */
    handleFormFieldUpdate(field) {
        logger.log('Form field updated:', field);
        this.updateDataFlow();
    }
    
    /**
     * Handle sophisticated form field removal
     */
    handleFormFieldRemove(field) {
        logger.log('Form field removed:', field);
        this.updateDataFlow();
    }
    
    /**
     * Handle sophisticated form fields change
     */
    handleFormFieldsChange(fields) {
        logger.log('Form fields changed:', fields.length, 'fields');
        
        // Sync FormBuilder fields back to current stage
        if (this.formBuilder && this.formBuilder.currentStageId) {
            const stage = this.stages.get(this.formBuilder.currentStageId);
            if (stage) {
                stage.formFields = [...fields];
                this.localState.updateStage(this.formBuilder.currentStageId, stage);
                logger.log('Synced FormBuilder fields back to stage:', stage.name, fields.length, 'fields');
            }
        }
        
        this.updateDataFlow();
    }
    
    /**
     * Update sophisticated data flow
     */
    updateDataFlow() {
        if (this.dataFlow) {
            const nodes = Array.from(this.stages.values());
            const actions = Array.from(this.actions.values());
            const forms = this.forms || [];
            const formFields = this.formFields || [];
            
            this.dataFlow.updateNodesData(nodes);
            this.dataFlow.updateActionsData(actions);
            this.dataFlow.updateFormsData(forms, formFields);
        }
    }
    
    /**
     * Update sophisticated data flow visualization
     */
    updateDataFlowVisualization(dataFlow) {
        // Update any data flow visualization in the UI
        logger.log('Data flow updated:', Object.keys(dataFlow).length, 'stages');
    }
    
    /**
     * Handle sophisticated field conflicts
     */
    handleFieldConflicts(conflicts) {
        logger.log('Field conflicts detected:', conflicts);
        if (app && app.showNotification) {
            app.showNotification('warning', 'Field Conflicts', `${conflicts.length} field conflicts detected`);
        }
    }
    
    /**
     * Update sophisticated field inheritance
     */
    updateFieldInheritance(inheritanceData) {
        logger.log('Field inheritance updated:', inheritanceData);
    }

    // =====================================================
    // SOPHISTICATED STAGE MODAL INTEGRATION
    // =====================================================

    /**
     * Show stage configuration modal with role selector
     */
    async showStageConfigModal(stage) {
        const modal = document.getElementById('config-modal');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');
        
        title.textContent = `Configure ${stage.name}`;
        
        // Set stage context in FormBuilder for sophisticated field inheritance
        logger.log('FormBuilder exists:', !!this.formBuilder, 'Setting stage context:', stage.id);
        if (this.formBuilder) {
            await this.formBuilder.setStageContext(stage.id);
        } else {
            logger.warn('FormBuilder is not initialized!');
        }
        
        body.innerHTML = `
            <div class="form-group">
                <label class="form-label" data-i18n="forms.name">Stage Name</label>
                <input type="text" class="form-input" id="modal-stage-name" value="${stage.name}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Stage Type</label>
                <select class="form-input" id="modal-stage-type">
                    <option value="start" ${stage.type === 'start' ? 'selected' : ''}>Start</option>
                    <option value="intermediate" ${stage.type === 'intermediate' ? 'selected' : ''}>Intermediate</option>
                    <option value="end" ${stage.type === 'end' ? 'selected' : ''}>End</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Max Hours (optional)</label>
                <input type="number" class="form-input" id="modal-stage-max-hours" value="0" min="0">
            </div>
            <div class="form-group">
                <div id="stage-role-selector-container"></div>
            </div>
        `;
        
        modal.style.display = 'flex';
        modal.dataset.configType = 'stage';
        modal.dataset.configId = stage.id;
        
        // Initialize sophisticated role selector
        setTimeout(() => {
            const allowedRoles = stage.allowedRoles || [];
            const selectedRoles = allowedRoles.map(roleId => ({
                id: roleId,
                name: this.projectRoles.find(r => r.id === roleId)?.name || `Role ${roleId}`
            }));
            
            this.nodeRoleSelector = this.createStageRoleSelector('stage-role-selector-container', selectedRoles);
        }, 100);
    }

    /**
     * Show action configuration modal with role selector
     */
    showActionConfigModal(action) {
        const modal = document.getElementById('config-modal');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');
        
        title.textContent = `Configure ${action.type === 'edit' ? i18n.t('actions.edit') : 'Forward'} ${i18n.t('workflows.action')}`;
        
        body.innerHTML = `
            <div class="form-group">
                <label class="form-label" data-i18n="forms.name">Action Name</label>
                <input type="text" class="form-input" id="modal-action-name" value="${action.name || ''}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Button Label</label>
                <input type="text" class="form-input" id="modal-action-button-label" value="${action.buttonLabel || ''}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Button Color</label>
                <input type="color" class="form-input" id="modal-action-button-color" value="${action.buttonColor || '#007bff'}">
            </div>
            <div class="form-group">
                <div id="action-role-selector-container"></div>
            </div>
            <div class="form-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="modal-action-confirmation" ${action.requiresConfirmation ? 'checked' : ''}>
                    Require Confirmation
                </label>
            </div>
            <div class="form-group" id="confirmation-message-group" style="display: ${action.requiresConfirmation ? 'block' : 'none'}">
                <div class="form-label-wrapper">
                    <label class="form-label">Confirmation Message</label>
                </div>
                <textarea class="form-input" id="modal-action-confirmation-message" rows="2" placeholder="Are you sure you want to perform this action?">${action.confirmationMessage || ''}</textarea>
            </div>
        `;
        
        modal.style.display = 'flex';
        modal.dataset.configType = 'action';
        modal.dataset.configId = action.id;
        
        // Initialize sophisticated role selector
        setTimeout(async () => {
            const requiredRoles = action.requiredRoles || action.allowedRoles || [];
            const selectedRoles = requiredRoles.map(roleId => ({
                id: roleId,
                name: this.projectRoles.find(r => r.id === roleId)?.name || `Role ${roleId}`
            }));
            
            this.transitionRoleSelector = await this.createActionRoleSelector('action-role-selector-container', selectedRoles);
        }, 100);
        
        // Setup confirmation checkbox listener
        document.getElementById('modal-action-confirmation')?.addEventListener('change', (e) => {
            const messageGroup = document.getElementById('confirmation-message-group');
            messageGroup.style.display = e.target.checked ? 'block' : 'none';
        });
    }
    
    // =====================================================
    // INITIALIZATION
    // =====================================================

    async initialize() {
        logger.log('Initializing Workflow Builder with local-first architecture');
        
        try {
            // Set project ID in workflow state
            this.localState.setState('workflow.project_id', this.projectId);
            
            // Load project roles
            await this.loadProjectRoles();
            
            // Load existing workflow if editing (but don't render yet - DOM not ready)
            if (!this.isNewWorkflow) {
                await this.loadWorkflow();
            }
            
            logger.log('Workflow Builder with local-first architecture initialized successfully');
            
        } catch (error) {
            logger.error('Failed to initialize workflow builder:', error);
            app.showNotification('error', i18n.t('messages.error'), 'Failed to initialize workflow builder');
            throw error;
        }
    }

    /**
     * Initialize parts that depend on DOM being ready
     */
    async initializeAfterDOMReady() {
        logger.log('Initializing Workflow Builder after DOM ready');
        
        try {
            // Get element references
            this.container = document.querySelector('.workflow-builder');
            this.canvas = this.container?.querySelector('.workflow-canvas');
            this.toolbar = this.container?.querySelector('.workflow-toolbar');
            
            if (!this.container || !this.canvas || !this.toolbar) {
                throw new Error('Required DOM elements not found');
            }
            
            // Initialize preview sidebar (with safety check)
            if (!window.disableWorkflowPreview) {
                await this.initializePreviewSidebar();
            } else {
                logger.log('Preview sidebar disabled via window.disableWorkflowPreview flag');
            }
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Initialize canvas
            this.initializeCanvas();
            
            // Initialize enhanced features
            this.initializeEnhancedFeatures();
            
            // If new workflow, create default start stage
            if (this.isNewWorkflow) {
                this.createDefaultStartStage();
            } else {
                // For existing workflows, render after DOM is ready
                logger.log('About to render existing workflow...');
                this.renderWorkflow();
                logger.log('Finished rendering existing workflow');
            }
            
            logger.log('Workflow Builder initialized successfully after DOM ready');
            
        } catch (error) {
            logger.error('Failed to initialize workflow builder after DOM ready:', error);
            app.showNotification('error', i18n.t('messages.error'), 'Failed to initialize workflow builder');
            throw error;
        }
    }

    async loadProjectRoles() {
        try {
            const { data: roles, error } = await supabaseClient.client
                .from('roles')
                .select('id, name, description')
                .eq('project_id', this.projectId)
                .order('name');
            
            if (error) throw error;
            this.projectRoles = roles || [];
            
        } catch (error) {
            logger.error('Failed to load project roles:', error);
            this.projectRoles = [];
        }
    }
    
    /**
     * Initialize preview sidebar with workflow preview module
     */
    async initializePreviewSidebar() {
        try {
            logger.log('Initializing preview sidebar...');
            
            // Find the workflow content container where the sidebar should be inserted
            const workflowContent = this.container.querySelector('.workflow-content');
            if (!workflowContent) {
                logger.warn('Workflow content container not found, skipping preview sidebar');
                return; // Don't throw error, just skip
            }
            
            // Initialize the preview sidebar with error handling
            try {
                const initialized = this.previewSidebar.initialize(workflowContent, this.localState);
                if (!initialized) {
                    logger.warn('Preview sidebar initialization returned false, continuing without sidebar');
                    return;
                }
            } catch (sidebarError) {
                logger.error('Preview sidebar initialization failed:', sidebarError);
                logger.log('Continuing workflow builder initialization without preview sidebar');
                return; // Don't let sidebar errors break the main workflow builder
            }
            
            // Register the workflow preview module
            try {
                this.previewSidebar.registerModule('workflow-preview', WorkflowPreviewModule);
                
                // Load initial preview if we have workflow data
                await this.previewSidebar.loadWorkflowPreview();
                
                // Make preview sidebar globally accessible for debugging/manual control
                window.workflowPreviewSidebar = this.previewSidebar;
                
                logger.log('Preview sidebar initialized successfully');
            } catch (moduleError) {
                logger.error('Failed to setup preview sidebar module:', moduleError);
                logger.log('Preview sidebar container created but module setup failed');
            }
            
        } catch (error) {
            logger.error('Critical error in preview sidebar initialization:', error);
            logger.log('Continuing workflow builder initialization without preview sidebar');
            // Don't re-throw - let workflow builder continue
        }
    }

    /**
     * Initialize enhanced features after DOM is ready
     */
    initializeEnhancedFeatures() {
        // Setup auto-save
        this.setupAutoSave();
        
        // Initialize snapshot system
        this.takeSnapshot('initial');
        
        // Setup data flow monitoring
        this.setupDataFlowMonitoring();
        
        // Load custom tables
        this.loadCustomTables();
    }
    
    /**
     * Setup auto-save functionality
     */
    setupAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }
        
        // Auto-save temporarily disabled for debugging
        // this.autoSaveInterval = setInterval(() => {
        //     if (!this.isNewWorkflow) {
        //         this.saveWorkflow(true); // Silent save
        //     }
        // }, 30000); // Auto-save every 30 seconds
        
        logger.log('Auto-save temporarily disabled for debugging');
    }
    
    /**
     * Setup data flow monitoring
     */
    setupDataFlowMonitoring() {
        // Monitor changes to stages and actions by wrapping existing methods
        const originalAddStage = this.addStage.bind(this);
        const originalAddAction = this.addAction.bind(this);
        const originalCompleteConnection = this.completeConnection.bind(this);
        
        this.addStage = (...args) => {
            this.saveToUndoStack();
            const result = originalAddStage(...args);
            this.updateDataFlow();
            return result;
        };
        
        this.addAction = (...args) => {
            this.saveToUndoStack();
            const result = originalAddAction(...args);
            this.updateDataFlow();
            return result;
        };
        
        this.completeConnection = (...args) => {
            this.saveToUndoStack();
            const result = originalCompleteConnection(...args);
            this.updateDataFlow();
            return result;
        };
    }
    
    /**
     * Load custom tables for smart dropdowns
     */
    async loadCustomTables() {
        try {
            const { data: tables, error } = await supabaseClient.client
                .from('custom_tables')
                .select('id, table_name, display_name, main_column')
                .eq('project_id', this.projectId);
                
            if (error) throw error;
            this.customTables = tables || [];
            
        } catch (error) {
            logger.error('Failed to load custom tables:', error);
            this.customTables = [];
        }
    }

    async loadWorkflow() {
        try {
            // Use local-first database adapter to load complete workflow
            const workflowData = await this.databaseAdapter.loadCompleteWorkflow(this.workflowId);
            
            // Load into local state
            this.localState.loadState(workflowData);
            
            // Update workflow reference
            this.workflowId = workflowData.workflow.id;
            
            // Local state automatically converts arrays to Maps via loadState()
            
            // Update counters
            this.stageCounter = Math.max(...workflowData.stages.map(s => s.order || 0), 0);
            this.actionCounter = workflowData.actions.length;
            
            logger.log('Workflow loaded with', workflowData.stages.length, 'stages and', workflowData.actions.length, 'actions');
            
        } catch (error) {
            logger.error('Failed to load workflow:', error);
            app.showNotification('error', 'Error', 'Failed to load workflow');
            throw error;
        }
    }
    

    // =====================================================
    // UI CREATION
    // =====================================================

    createUI() {
        return `
            <div class="workflow-builder">
                <div class="workflow-toolbar">
                    <div class="toolbar-section">
                        <div class="toolbar-group">
                            <button id="save-workflow-btn" onclick="workflowBuilder.saveWorkflow()" class="toolbar-btn primary" data-i18n="actions.save">
                                Save
                            </button>
                            <button onclick="workflowBuilder.createSnapshot()" class="toolbar-btn" title="Create Snapshot">
                                📸 Snapshot
                            </button>
                            <button onclick="workflowBuilder.showSnapshotMenu()" class="toolbar-btn" title="Manage Snapshots">
                                📋 Snapshots ▼
                            </button>
                            <button onclick="workflowBuilder.exportJSON()" class="toolbar-btn" data-i18n="actions.export">
                                Export
                            </button>
                            <button onclick="workflowBuilder.importFromText()" class="toolbar-btn" data-i18n="actions.import">
                                Import
                            </button>
                        </div>
                        
                        <div class="toolbar-divider"></div>
                        
                        <div class="toolbar-group">
                            <button onclick="workflowBuilder.addStage()" class="toolbar-btn primary" data-i18n="workflows.add_workflow">
                                Add Stage
                            </button>
                        </div>
                        
                        <div class="toolbar-divider"></div>
                        
                        <div class="toolbar-group">
                            <button onclick="workflowBuilder.undo()" id="undoBtn" class="toolbar-btn" title="Undo" disabled>
                                ↶ Undo
                            </button>
                            <button onclick="workflowBuilder.redo()" id="redoBtn" class="toolbar-btn" title="Redo" disabled>
                                ↷ Redo
                            </button>
                        </div>
                        
                        <div class="toolbar-divider"></div>
                        
                        <div class="toolbar-group">
                            <button onclick="workflowBuilder.zoomIn()" class="toolbar-btn" title="Zoom In">
                                🔍 + 
                            </button>
                            <button onclick="workflowBuilder.zoomOut()" class="toolbar-btn" title="Zoom Out">
                                🔍 −
                            </button>
                            <button onclick="workflowBuilder.resetZoom()" class="toolbar-btn" title="Reset Zoom">
                                🏠 Reset
                            </button>
                            <button onclick="workflowBuilder.fitToView()" class="toolbar-btn" title="Fit to View">
                                ⬚ Fit
                            </button>
                        </div>
                        
                        <div class="toolbar-divider"></div>
                        
                        <div class="toolbar-group">
                            <button onclick="workflowBuilder.toggleActionOverview()" class="toolbar-btn" title="Toggle Action Overview">
                                📊 Actions
                            </button>
                            <button onclick="workflowBuilder.showDataFlow()" class="toolbar-btn" title="Show Data Flow">
                                🔄 Data Flow
                            </button>
                            <button onclick="workflowBuilder.validateWorkflow()" class="toolbar-btn" title="Validate Workflow">
                                ✓ Validate
                            </button>
                        </div>
                    </div>
                    
                    <div class="toolbar-section">
                        <div class="workflow-title-input">
                            <input type="text" class="form-input workflow-name-input" 
                                   value="${this.workflow.name || ''}" placeholder="Workflow Name" data-i18n="workflows.title">
                        </div>
                        
                        <div class="help-box" onmouseenter="workflowBuilder.showHelp(this)" onmouseleave="workflowBuilder.hideHelp()">
                            <span class="help-icon">?</span>
                            <div class="help-tooltip" id="helpTooltip">
                                <h4>Quick Help</h4>
                                <div class="help-item">
                                    <strong>Add Stages:</strong> Click + Add Stage or drag from toolbox
                                </div>
                                <div class="help-item">
                                    <strong>Edit Stage:</strong> Double-click stage
                                </div>
                                <div class="help-item">
                                    <strong>Connect Stages:</strong> Right-click first stage, then click target
                                </div>
                                <div class="help-item">
                                    <strong>Edit Action:</strong> Click connection line
                                </div>
                                <div class="help-item">
                                    <strong>Smart Features:</strong> Use smart dropdowns for dynamic options
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Expandable Action Overview Bar -->
                <div class="action-overview-bar" id="actionOverviewBar" style="display: none;">
                    <div class="action-overview-content">
                        <div class="action-overview-title">
                            <h4>Action Overview</h4>
                            <span class="action-count" id="actionCount">0 actions</span>
                        </div>
                        <div class="action-overview-list" id="actionOverviewList">
                            <!-- Actions will be populated here -->
                        </div>
                    </div>
                </div>
                
                <div class="workflow-content">
                    <div class="workflow-canvas-container">
                        <div class="workflow-canvas" id="workflow-canvas">
                            <svg class="workflow-connections" id="workflow-connections"></svg>
                            <div class="workflow-nodes" id="workflow-nodes"></div>
                        </div>
                    </div>
                    
                    <!-- Preview sidebar will be inserted here by WorkflowPreviewSidebar -->
                </div>
                
                <!-- Modal for stage/action configuration -->
                <div class="modal-overlay" id="config-modal" style="display: none;">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3 id="modal-title">Configure</h3>
                            <button class="btn btn-secondary" id="modal-close">×</button>
                        </div>
                        <div class="modal-body" id="modal-body"></div>
                        <div class="modal-footer">
                            <button class="btn btn-secondary" id="modal-cancel" data-i18n="actions.cancel">Cancel</button>
                            <button class="btn btn-primary" id="modal-save" data-i18n="actions.save">Save</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Inline styles removed - now using external workflow-builder.css -->
        `;
    }

    setupEventListeners() {
        // Elements should already be set by initializeAfterDOMReady
        if (!this.container || !this.canvas || !this.toolbar) {
            logger.error('setupEventListeners: Required elements not found');
            return;
        }
        
        // Toolbar events
        const nameInput = this.toolbar.querySelector('.workflow-name-input');
        const typeSelect = this.toolbar.querySelector('.workflow-type-select');
        const colorInput = this.toolbar.querySelector('.workflow-color-input');
        
        nameInput?.addEventListener('input', (e) => {
            this.workflow.name = e.target.value;
            this.updateSidebarWorkflowProperties();
        });
        
        typeSelect?.addEventListener('change', (e) => {
            this.workflow.workflow_type = e.target.value;
            this.updateSidebarWorkflowProperties();
        });
        
        colorInput?.addEventListener('change', (e) => {
            this.workflow.marker_color = e.target.value;
            this.updateSidebarWorkflowProperties();
        });
        
        // Toolbar buttons
        document.getElementById('add-stage-btn')?.addEventListener('click', () => this.addStage());
        document.getElementById('zoom-fit-btn')?.addEventListener('click', () => this.fitToView());
        document.getElementById('validate-btn')?.addEventListener('click', () => this.validateWorkflow());
        document.getElementById('save-workflow-btn')?.addEventListener('click', () => this.saveWorkflow());
        
        // Canvas events
        this.setupCanvasEvents();
        
        // Sidebar events
        this.setupSidebarEvents();
        
        // Modal events
        this.setupModalEvents();
        
        // Window events for connection updates
        this.setupWindowEvents();
    }
    
    setupWindowEvents() {
        // Handle window resize to update connection positions
        this.windowResizeHandler = () => this.handleWindowResize();
        window.addEventListener('resize', this.windowResizeHandler);
        
        logger.log('Window event listeners set up for connection updates');
    }

    setupCanvasEvents() {
        if (!this.canvas) return;
        
        // Pan and zoom
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
        this.canvas.addEventListener('mousedown', (e) => this.handleCanvasMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleCanvasMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleCanvasMouseUp(e));
        this.canvas.addEventListener('contextmenu', (e) => this.handleCanvasRightClick(e));
        
        // Keyboard events
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        
        // Add observer for DOM mutations that might affect connection positioning
        this.setupMutationObserver();
    }
    
    setupMutationObserver() {
        // Observe changes to stage positions for automatic connection updates
        if (this.canvas && 'MutationObserver' in window) {
            this.mutationObserver = new MutationObserver((mutations) => {
                let shouldUpdate = false;
                
                mutations.forEach(mutation => {
                    if (mutation.type === 'attributes' && 
                        (mutation.attributeName === 'style') && 
                        mutation.target.classList.contains('workflow-node')) {
                        shouldUpdate = true;
                    }
                });
                
                if (shouldUpdate) {
                    this.throttledUpdateConnections(() => {
                        this.updateAllConnections();
                    });
                }
            });
            
            // Start observing
            this.mutationObserver.observe(this.canvas, {
                attributes: true,
                attributeFilter: ['style'],
                subtree: true
            });
            
            logger.log('Mutation observer set up for connection updates');
        }
    }

    setupSidebarEvents() {
        // Sidebar workflow property inputs
        const sidebarInputs = {
            name: document.getElementById('sidebar-name'),
            description: document.getElementById('sidebar-description'),
            type: document.getElementById('sidebar-type'),
            color: document.getElementById('sidebar-color')
        };
        
        Object.entries(sidebarInputs).forEach(([key, input]) => {
            if (!input) return;
            
            const eventType = input.type === 'color' || input.tagName === 'SELECT' ? 'change' : 'input';
            input.addEventListener(eventType, (e) => {
                switch (key) {
                    case 'name':
                        this.workflow.name = e.target.value;
                        this.toolbar.querySelector('.workflow-name-input').value = e.target.value;
                        break;
                    case 'description':
                        this.workflow.description = e.target.value;
                        break;
                    case 'type':
                        this.workflow.workflow_type = e.target.value;
                        this.toolbar.querySelector('.workflow-type-select').value = e.target.value;
                        break;
                    case 'color':
                        this.workflow.marker_color = e.target.value;
                        this.toolbar.querySelector('.workflow-color-input').value = e.target.value;
                        break;
                }
            });
        });
    }

    setupModalEvents() {
        document.getElementById('modal-close')?.addEventListener('click', () => this.closeModal());
        document.getElementById('modal-cancel')?.addEventListener('click', () => this.closeModal());
        document.getElementById('modal-save')?.addEventListener('click', () => this.saveModalData());
        
        // Close modal on overlay click
        document.getElementById('config-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'config-modal') {
                this.closeModal();
            }
        });
    }

    initializeCanvas() {
        // Initialize SVG element properly
        const svg = this.canvas?.querySelector('.workflow-connections');
        if (svg) {
            // Set SVG attributes for proper rendering - FIXED coordinate system
            svg.setAttribute('width', '100%');
            svg.setAttribute('height', '100%');
            // Remove viewBox to use the same coordinate system as DOM elements
            svg.removeAttribute('viewBox');
            svg.setAttribute('preserveAspectRatio', 'none');
            
            // Add coordinate system elements
            this.addCoordinateSystem(svg);
            
            logger.log('SVG initialized with proper attributes');
        } else {
            logger.error('SVG element not found');
        }
        
        // Initialize the sophisticated canvas manager
        try {
            this.canvasManager = new WorkflowCanvasManager(this.canvas, this);
            logger.log('WorkflowCanvasManager initialized successfully');
            
            // Render existing stages and actions using canvas manager
            this.renderAllStages();
            this.renderAllActions();
            
        } catch (error) {
            logger.error('Failed to initialize WorkflowCanvasManager:', error);
            // Fall back to basic canvas functionality
            this.setupBasicCanvas();
        }
    }

    addCoordinateSystem(svg) {
        // Create coordinate system group
        const coordGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        coordGroup.setAttribute('id', 'coordinate-system');
        coordGroup.setAttribute('class', 'coordinate-system');
        
        // Add coordinate boundary rectangle
        const boundary = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        boundary.setAttribute('x', '-2000');
        boundary.setAttribute('y', '-2000');
        boundary.setAttribute('width', '12000');
        boundary.setAttribute('height', '12000');
        boundary.setAttribute('fill', 'none');
        boundary.setAttribute('stroke', '#e74c3c');
        boundary.setAttribute('stroke-width', '3');
        boundary.setAttribute('stroke-dasharray', '20,10');
        boundary.setAttribute('opacity', '0.5');
        coordGroup.appendChild(boundary);
        
        // Add origin axes
        const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        xAxis.setAttribute('x1', '-2000');
        xAxis.setAttribute('y1', '0');
        xAxis.setAttribute('x2', '10000');
        xAxis.setAttribute('y2', '0');
        xAxis.setAttribute('stroke', '#3498db');
        xAxis.setAttribute('stroke-width', '2');
        xAxis.setAttribute('opacity', '0.7');
        coordGroup.appendChild(xAxis);
        
        const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        yAxis.setAttribute('x1', '0');
        yAxis.setAttribute('y1', '-2000');
        yAxis.setAttribute('x2', '0');
        yAxis.setAttribute('y2', '10000');
        yAxis.setAttribute('stroke', '#3498db');
        yAxis.setAttribute('stroke-width', '2');
        yAxis.setAttribute('opacity', '0.7');
        coordGroup.appendChild(yAxis);
        
        // Add origin marker
        const origin = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        origin.setAttribute('cx', '0');
        origin.setAttribute('cy', '0');
        origin.setAttribute('r', '8');
        origin.setAttribute('fill', '#e74c3c');
        origin.setAttribute('stroke', '#ffffff');
        origin.setAttribute('stroke-width', '2');
        coordGroup.appendChild(origin);
        
        // Add coordinate labels at key points
        const labels = [
            { x: 0, y: -30, text: '(0,0)' },
            { x: 1000, y: -30, text: '1000' },
            { x: 2000, y: -30, text: '2000' },
            { x: -1000, y: -30, text: '-1000' },
            { x: -30, y: 1000, text: '1000' },
            { x: -30, y: 2000, text: '2000' },
            { x: -30, y: -1000, text: '-1000' }
        ];
        
        labels.forEach(label => {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', label.x);
            text.setAttribute('y', label.y);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('fill', '#2c3e50');
            text.setAttribute('font-size', '24');
            text.setAttribute('font-family', 'monospace');
            text.setAttribute('font-weight', 'bold');
            text.textContent = label.text;
            coordGroup.appendChild(text);
        });
        
        // Insert coordinate system as first element so it appears behind everything
        svg.insertBefore(coordGroup, svg.firstChild);
    }
    
    /**
     * Fallback basic canvas functionality if WorkflowCanvasManager fails
     */
    setupBasicCanvas() {
        logger.warn('Using basic canvas functionality due to WorkflowCanvasManager failure');
        
        // Set initial viewport
        this.updateCanvasTransform();
        
        // Render existing stages and actions
        this.renderAllStages();
        this.renderAllActions();
    }

    // =====================================================
    // STAGE MANAGEMENT
    // =====================================================

    createDefaultStartStage() {
        const stage = {
            id: this.generateStageId(),
            key: 'start_1',
            name: 'Start Stage',
            type: 'start',
            order: 1,
            maxHours: 0,
            allowedRoles: [],
            x: 300,
            y: 200,
            formFields: []
        };
        
        this.stages.set(stage.id, stage);
        this.stageCounter = 1;
        this.renderStage(stage);
    }

    /**
     * Add stage with proper type selection dialog for toolbar button
     */
    addStage() {
        // Show stage type selection modal for toolbar button
        this.showStageTypeSelectionModal();
    }

    /**
     * Add stage at specific position (used by canvas manager and right-click)
     */
    async addStageAtPosition(x, y, stageType = null) {
        if (!stageType) {
            // Show type selection dialog
            this.showStageTypeSelectionModal({ x, y });
            return;
        }

        this.stageCounter++;
        const stageData = {
            type: stageType,
            name: `Stage ${this.stageCounter}`,
            key: `stage_${this.stageCounter}`,
            order: this.stageCounter,
            maxHours: 24,
            allowedRoles: [],
            x: x || (300 + (this.stageCounter - 1) * 250),
            y: y || 200,
            formFields: stageType === 'start' ? [] : null // Only start stages have initial fields
        };
        
        // Use local-first state management
        const stage = this.localState.addStage(stageData);
        
        // Always use direct rendering for consistent node structure
        this.renderStage(stage);
        
        // Emit state change event
        this.emitStateChange('stageAdded', { stageId: stage.id, stage });
        
        // Trigger validation
        const validation = this.validateWorkflow();
        if (!validation.isValid) {
            logger.warn('Workflow validation warnings:', validation.errors);
        }
        
        // Open configuration modal
        await this.openStageConfigModal(stage);
        
        return stage;
    }

    /**
     * Show stage type selection modal
     */
    showStageTypeSelectionModal(position = null) {
        const modal = document.getElementById('config-modal');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');
        
        title.textContent = 'Select Stage Type';
        
        body.innerHTML = `
            <div class="stage-type-selection">
                <p>Choose the type of stage to create:</p>
                
                <div class="stage-type-options">
                    <div class="stage-type-card" data-type="start">
                        <div class="stage-type-icon">🟢</div>
                        <h4>Start Stage</h4>
                        <p>Beginning of the workflow. Define initial form fields here.</p>
                    </div>
                    
                    <div class="stage-type-card" data-type="intermediate">
                        <div class="stage-type-icon">🔵</div>
                        <h4>Intermediate Stage</h4>
                        <p>Middle step in the workflow. Inherits fields from previous stages and actions.</p>
                    </div>
                    
                    <div class="stage-type-card" data-type="end">
                        <div class="stage-type-icon">🔴</div>
                        <h4>End Stage</h4>
                        <p>Final stage of the workflow. Completes the process.</p>
                    </div>
                </div>
            </div>
            
            <style>
                .stage-type-selection p {
                    margin-bottom: var(--spacing-md);
                    color: var(--color-text-secondary);
                }
                
                .stage-type-options {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: var(--spacing-md);
                }
                
                .stage-type-card {
                    padding: var(--spacing-md);
                    border: 2px solid var(--color-border-light);
                    border-radius: var(--border-radius-lg);
                    text-align: center;
                    cursor: pointer;
                    transition: all var(--transition-fast);
                }
                
                .stage-type-card:hover {
                    border-color: var(--color-primary);
                    background-color: var(--color-bg-secondary);
                    transform: translateY(-2px);
                    box-shadow: var(--shadow-md);
                }
                
                .stage-type-icon {
                    font-size: 2rem;
                    margin-bottom: var(--spacing-sm);
                }
                
                .stage-type-card h4 {
                    margin: 0 0 var(--spacing-sm) 0;
                    color: var(--color-text-primary);
                }
                
                .stage-type-card p {
                    margin: 0;
                    font-size: var(--font-size-sm);
                    color: var(--color-text-secondary);
                }
            </style>
        `;
        
        // Add click handlers for stage type cards
        body.querySelectorAll('.stage-type-card').forEach(card => {
            card.addEventListener('click', async () => {
                const stageType = card.dataset.type;
                modal.style.display = 'none';
                
                try {
                    if (position) {
                        await this.addStageAtPosition(position.x, position.y, stageType);
                    } else {
                        await this.addStageAtPosition(null, null, stageType);
                    }
                } catch (error) {
                    logger.error('Error adding stage:', error);
                    // Show error notification if app is available
                    if (window.app) {
                        window.app.showNotification('error', 'Error', 'Failed to add stage');
                    }
                }
            });
        });
        
        modal.style.display = 'flex';
        modal.dataset.configType = 'stage-type-selection';
    }

    /**
     * Edit stage (called by canvas manager)
     */
    async editStage(stageId) {
        await this.openStageConfigModal(this.stages.get(stageId));
    }

    /**
     * Delete stage (called by canvas manager)
     */
    deleteStage(stageId) {
        if (confirm('Are you sure you want to delete this stage?')) {
            // Use local-first state management for stage deletion
            const success = this.localState.deleteStage(stageId);
            
            if (success) {
                // Remove from canvas manager
                if (this.canvasManager) {
                    this.canvasManager.removeNode(stageId);
                }
                
                // Re-render if not using canvas manager
                if (!this.canvasManager) {
                    this.renderAllStages();
                    this.renderAllConnections();
                }
                
                app.showNotification('success', 'Stage Deleted', 'Stage deleted successfully');
            }
        }
    }

    /**
     * Duplicate stage (called by canvas manager)
     */
    duplicateStage(stageId) {
        const originalStage = this.stages.get(stageId);
        if (!originalStage) return;
        
        this.stageCounter++;
        const newStage = {
            id: this.generateStageId(),
            key: `${originalStage.key}_copy`,
            title: `${originalStage.title || originalStage.name} (Copy)`,
            name: `${originalStage.name} (Copy)`,
            type: originalStage.type === 'start' ? 'intermediate' : originalStage.type,
            order: this.stageCounter,
            maxHours: originalStage.maxHours,
            allowedRoles: [...originalStage.allowedRoles],
            x: originalStage.x + 50,
            y: originalStage.y + 50,
            formFields: [...originalStage.formFields],
            fields: originalStage.fields ? [...originalStage.fields] : []
        };
        
        this.stages.set(newStage.id, newStage);
        
        // Use canvas manager if available
        if (this.canvasManager) {
            this.canvasManager.addNode(newStage, { x: newStage.x, y: newStage.y });
        } else {
            this.renderStage(newStage);
        }
        
        app.showNotification('success', 'Stage Duplicated', 'Stage duplicated successfully');
        return newStage;
    }

    /**
     * Handle node selection from canvas manager
     */
    onNodeSelected(nodeId) {
        this.selectNode(nodeId);
        this.showStageProperties(nodeId);
    }

    /**
     * Add an action between two stages
     */
    addAction(fromStageId, toStageId, actionConfig = {}) {
        // Check if connection already exists
        const existingAction = Array.from(this.actions.values()).find(action => 
            action.fromStageId === fromStageId && action.toStageId === toStageId
        );
        
        if (existingAction) {
            logger.warn('Action already exists between these stages');
            return existingAction;
        }
        
        // Determine action type
        const actionType = fromStageId === toStageId ? 'edit' : 'forward';
        const fromStage = this.stages.get(fromStageId);
        const toStage = this.stages.get(toStageId);
        
        // Create action with default config
        const action = {
            id: this.generateActionId(),
            fromStageId: fromStageId,
            toStageId: toStageId,
            name: actionConfig.name || (actionType === 'edit' ? `Edit ${fromStage?.name}` : `Action to ${toStage?.name}`),
            type: actionType,
            buttonLabel: actionConfig.buttonLabel || (actionType === 'edit' ? 'Edit' : 'Next'),
            buttonColor: actionConfig.buttonColor || (actionType === 'edit' ? '#ff9800' : '#007bff'),
            allowedRoles: actionConfig.allowedRoles || [],
            conditions: actionConfig.conditions || {},
            requiresConfirmation: actionConfig.requiresConfirmation || false,
            confirmationMessage: actionConfig.confirmationMessage || '',
            formFields: actionConfig.formFields || [],
            editableFields: actionType === 'edit' ? (actionConfig.editableFields || []) : undefined,
            ...actionConfig
        };
        
        this.actions.set(action.id, action);
        
        // Render action if DOM is ready
        if (this.canvas) {
            this.renderAction(action);
        }
        
        return action;
    }

    /**
     * Create a question element
     */
    createQuestion(fieldType, fieldData = null) {
        const question = {
            id: fieldData?.id || this.generateQuestionId(),
            fieldType: fieldType,
            data: fieldData || this.createDefaultQuestionData(fieldType)
        };
        
        this.questions.set(question.id, question);
        return question;
    }
    
    /**
     * Generate question ID
     */
    generateQuestionId() {
        return 'qe_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    /**
     * Create default question data
     */
    createDefaultQuestionData(fieldType) {
        const fieldConfig = this.fieldTypes[fieldType];
        return {
            field_key: this.generateFieldKey(fieldType),
            field_label: `${fieldConfig.label} Field`,
            field_type: fieldType,
            field_order: 1,
            is_required: false,
            placeholder: '',
            help_text: '',
            validation_rules: {},
            field_options: fieldConfig.hasOptions ? { options: ['Option 1', 'Option 2', 'Option 3'] } : {},
            conditional_logic: {}
        };
    }
    
    /**
     * Generate field key
     */
    generateFieldKey(fieldType) {
        const base = fieldType.replace('_', '') + '_field';
        return base + '_' + Math.random().toString(36).substr(2, 5);
    }
    
    /**
     * Edit question
     */
    editQuestion(questionId) {
        const question = this.questions.get(questionId);
        if (question) {
            // Use the enhanced openFormFieldModal for editing questions
            // Pass null for stageId/actionId since questions are standalone
            this.openFormFieldModal(null, null, question.data, questionId);
        }
    }
    
    /**
     * Copy question
     */
    copyQuestion(questionId) {
        const question = this.questions.get(questionId);
        if (question) {
            const copiedQuestion = this.createQuestion(question.fieldType, {
                ...question.data,
                field_key: this.generateFieldKey(question.fieldType),
                field_label: question.data.field_label + ' (Copy)'
            });
            return copiedQuestion;
        }
    }
    
    /**
     * Remove question
     */
    removeQuestion(questionId) {
        if (confirm('Are you sure you want to remove this question?')) {
            this.questions.delete(questionId);
            this.localState.trackDeletedQuestion(questionId); // Track for database deletion
            // Update UI if needed
            app.showNotification('success', 'Question Removed', 'Question removed successfully');
        }
    }

    renderStage(stage) {
        const nodeElement = document.createElement('div');
        nodeElement.className = `workflow-node ${stage.type}-stage`;
        nodeElement.dataset.stageId = stage.id;
        nodeElement.style.left = `${stage.x}px`;
        nodeElement.style.top = `${stage.y}px`;
        
        // Generate stage icon HTML if configured
        let stageIconHtml = '';
        if (stage.visual_config && stage.visual_config.icon) {
            const tempDesigner = new WorkflowStageIconDesigner('temp-container', {});
            tempDesigner.currentConfig = stage.visual_config.icon;
            stageIconHtml = tempDesigner.getRenderedIcon({ size: 24 });
        }

        nodeElement.innerHTML = `
            <div class="node-header">
                <div>
                    <div class="node-title">${stage.name}</div>
                    <div class="node-type">${stage.type} stage</div>
                </div>
                ${stageIconHtml ? `<div class="stage-icon-container">${stageIconHtml}</div>` : ''}
            </div>
            <div class="node-body">
                <div class="node-info">Key: ${stage.key}</div>
                <div class="node-info">Roles: ${stage.allowedRoles.length} assigned</div>
                <div class="node-info">Fields: ${stage.formFields.length}</div>
                <div class="node-actions">
                    <button class="btn btn-secondary btn-sm" onclick="workflowBuilder.editStage('${stage.id}')" data-i18n="actions.edit">Edit</button>
                    <button class="btn btn-secondary btn-sm" onclick="workflowBuilder.deleteStage('${stage.id}')" data-i18n="actions.delete">Delete</button>
                </div>
            </div>
        `;
        
        // Add event listeners
        this.setupNodeEvents(nodeElement, stage);
        
        // Add to canvas
        const nodesContainer = this.canvas?.querySelector('.workflow-nodes');
        if (nodesContainer) {
            nodesContainer.appendChild(nodeElement);
        }
        this.nodes.set(stage.id, nodeElement);
    }

    renderAllStages() {
        // Clear existing nodes
        const nodesContainer = this.canvas?.querySelector('.workflow-nodes');
        if (nodesContainer) {
            nodesContainer.innerHTML = '';
            this.nodes.clear();
            
            // Render all stages
            this.stages.forEach(stage => this.renderStage(stage));
        }
    }

    setupNodeEvents(nodeElement, stage) {
        let isDragging = false;
        let dragStart = { x: 0, y: 0 };
        
        nodeElement.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            
            e.preventDefault();
            e.stopPropagation();
            
            // Check if in connection mode
            if (this.isConnecting) {
                this.completeConnection(stage.id);
                return;
            }
            
            isDragging = true;
            // Calculate drag offset in screen space, we'll handle transform in move handler
            dragStart = { x: e.clientX, y: e.clientY, startX: stage.x, startY: stage.y };
            
            // Select this node
            this.selectNode(stage.id);
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
        
        const handleMouseMove = (e) => {
            if (!isDragging) return;
            
            // Calculate mouse delta in screen space
            const deltaX = e.clientX - dragStart.x;
            const deltaY = e.clientY - dragStart.y;
            
            // Convert delta to canvas space by dividing by zoom
            const canvasDeltaX = deltaX / this.viewport.zoom;
            const canvasDeltaY = deltaY / this.viewport.zoom;
            
            // Calculate new position from starting position plus delta
            const newX = dragStart.startX + canvasDeltaX;
            const newY = dragStart.startY + canvasDeltaY;
            
            // Allow large working area with reasonable bounds
            const minCoord = -2000;  // Allow nodes to go off-screen to the left/top
            const maxCoord = 10000;  // Large maximum for extensive workflows
            
            stage.x = Math.max(minCoord, Math.min(maxCoord, Math.round(newX)));
            stage.y = Math.max(minCoord, Math.min(maxCoord, Math.round(newY)));
            
            nodeElement.style.left = `${stage.x}px`;
            nodeElement.style.top = `${stage.y}px`;
            
            // Immediate visual update for better responsiveness
            requestAnimationFrame(() => {
                this.updateActionsForStage(stage.id);
            });
        };
        
        const handleMouseUp = () => {
            isDragging = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
        
        // Double-click to edit
        nodeElement.addEventListener('dblclick', async (e) => {
            e.preventDefault();
            try {
                await this.editStage(stage.id);
            } catch (error) {
                logger.error('Error editing stage:', error);
                if (window.app) {
                    window.app.showNotification('error', 'Error', 'Failed to edit stage');
                }
            }
        });
        
        // Right-click context menu
        nodeElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showNodeContextMenu(e, stage.id);
        });
    }

    // =====================================================
    // ACTION VISUALIZATION - REWRITTEN
    // =====================================================

    /**
     * Render all workflow actions (connections and edit indicators)
     */
    renderAllActions() {
        logger.log('Rendering all actions...');
        
        // Clear existing action visuals
        this.clearActionVisuals();
        
        // Render each action
        this.actions.forEach(action => {
            this.renderAction(action);
        });
        
        logger.log('All actions rendered');
    }
    
    /**
     * Clear all action visualizations
     */
    clearActionVisuals() {
        // Clear SVG connections
        const svg = this.canvas?.querySelector('.workflow-connections');
        if (svg) {
            // Keep coordinate system but remove connections
            const coordSystem = svg.querySelector('#coordinate-system');
            svg.innerHTML = '';
            if (coordSystem) {
                svg.appendChild(coordSystem);
            }
        }
        
        // Clear edit indicators from stages - more specific targeting
        this.canvas?.querySelectorAll('.node-edit-indicator').forEach(indicator => {
            indicator.remove();
        });
        
        // Clear connections map
        this.connections.clear();
        
        logger.log('Action visuals cleared');
    }
    
    /**
     * Clear action visuals for a specific stage
     */
    clearActionVisualsForStage(stageId) {
        // Clear edit indicators for this stage
        const stageElement = this.nodes.get(stageId);
        if (stageElement) {
            stageElement.querySelectorAll('.node-edit-indicator').forEach(indicator => {
                indicator.remove();
            });
        }
        
        // Clear connection lines involving this stage
        const connectionsToRemove = [];
        this.connections.forEach((connection, actionId) => {
            const action = this.actions.get(actionId);
            if (action && (action.fromStageId === stageId || action.toStageId === stageId)) {
                connection.remove();
                connectionsToRemove.push(actionId);
            }
        });
        
        // Remove from connections map
        connectionsToRemove.forEach(actionId => {
            this.connections.delete(actionId);
        });
        
        logger.log('Action visuals cleared for stage:', stageId);
    }
    
    /**
     * Update all connections - useful when stages move or window resizes
     */
    updateAllConnections() {
        logger.log('Updating all physical connections');
        
        // Re-render all forward actions (connections)
        this.actions.forEach(action => {
            if (action.type === 'forward') {
                // Remove existing connection
                const existingConnection = this.connections.get(action.id);
                if (existingConnection) {
                    existingConnection.remove();
                    this.connections.delete(action.id);
                }
                
                // Re-render with current DOM positions
                this.renderConnectionLine(action);
            }
        });
    }
    
    /**
     * Render a single action (connection line or edit indicator)
     */
    renderAction(action) {
        if (!action) {
            logger.warn('renderAction: Action is null');
            return;
        }
        
        logger.log('Rendering action:', action.name, 'type:', action.type);
        
        if (action.type === 'edit') {
            this.renderEditIndicator(action);
        } else if (action.type === 'forward') {
            this.renderConnectionLine(action);
        }
    }
    
    /**
     * Render edit indicator on stage
     */
    renderEditIndicator(action) {
        const stage = this.stages.get(action.fromStageId);
        if (!stage) {
            logger.warn('Edit indicator: Stage not found', action.fromStageId);
            return;
        }
        
        const stageElement = this.nodes.get(action.fromStageId);
        if (!stageElement) {
            logger.warn('Edit indicator: Stage element not found', action.fromStageId);
            return;
        }
        
        // Check if indicator already exists for this specific action
        const existingIndicator = stageElement.querySelector(`[data-action-id="${action.id}"]`);
        if (existingIndicator) {
            logger.log('Edit indicator already exists for action:', action.id);
            return;
        }
        
        // Find the node header to add indicator to (prevents stage enlargement)
        const nodeHeader = stageElement.querySelector('.node-header');
        if (!nodeHeader) {
            logger.warn('Edit indicator: Node header not found');
            return;
        }
        
        // Create edit indicator positioned at top-right of header
        const indicator = document.createElement('div');
        indicator.className = 'node-edit-indicator';
        indicator.setAttribute('data-action-id', action.id); // Track which action this belongs to
        indicator.title = `Edit action: ${action.buttonLabel}`;
        indicator.innerHTML = '✏️';
        indicator.style.position = 'absolute';
        indicator.style.top = '-8px';
        indicator.style.right = '-8px';
        indicator.style.zIndex = '10';
        indicator.style.background = '#fff';
        indicator.style.borderRadius = '50%';
        indicator.style.padding = '2px 4px'; // Smaller padding to reduce size
        indicator.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
        indicator.style.cursor = 'pointer';
        indicator.style.fontSize = '12px'; // Smaller font size
        indicator.style.width = '20px';
        indicator.style.height = '20px';
        indicator.style.display = 'flex';
        indicator.style.alignItems = 'center';
        indicator.style.justifyContent = 'center';
        
        // Add click handler
        indicator.addEventListener('click', (e) => {
            e.stopPropagation();
            this.editAction(action.id);
        });
        
        // Add to node header instead of stage element to prevent expansion
        nodeHeader.style.position = 'relative'; // Ensure relative positioning for absolute child
        nodeHeader.appendChild(indicator);
        
        logger.log('Edit indicator added to stage header:', stage.name, 'for action:', action.id);
    }
    
    /**
     * Render connection line between stages - REWRITTEN to use physical DOM positioning
     */
    renderConnectionLine(action) {
        const fromStage = this.stages.get(action.fromStageId);
        const toStage = this.stages.get(action.toStageId);
        
        if (!fromStage || !toStage) {
            logger.warn('Connection: Stages not found', {
                fromStageId: action.fromStageId,
                toStageId: action.toStageId
            });
            return;
        }
        
        // Get actual DOM elements for the stages
        const fromElement = this.nodes.get(action.fromStageId);
        const toElement = this.nodes.get(action.toStageId);
        
        if (!fromElement || !toElement) {
            logger.warn('Connection: Stage DOM elements not found');
            return;
        }
        
        const svg = this.canvas?.querySelector('.workflow-connections');
        if (!svg) {
            logger.warn('Connection: SVG not found');
            return;
        }
        
        // Check if connection already exists
        const existingConnection = this.connections.get(action.id);
        if (existingConnection) {
            logger.log('Connection already exists for action:', action.id);
            return;
        }
        
        // Get actual DOM bounding rectangles
        const canvasRect = this.canvas.getBoundingClientRect();
        const svgRect = svg.getBoundingClientRect();
        const fromRect = fromElement.getBoundingClientRect();
        const toRect = toElement.getBoundingClientRect();
        
        // Calculate connection points relative to SVG container
        // FROM: Top-right corner of source stage
        const fromX = fromRect.right - svgRect.left;
        const fromY = fromRect.top - svgRect.top;
        
        // TO: Top-left corner of target stage
        const toX = toRect.left - svgRect.left;
        const toY = toRect.top - svgRect.top;
        
        logger.log('Physical connection points:', {
            from: `${fromStage.name} DOM(${fromRect.right}, ${fromRect.top}) -> SVG(${fromX}, ${fromY})`,
            to: `${toStage.name} DOM(${toRect.left}, ${toRect.top}) -> SVG(${toX}, ${toY})`,
            canvasRect: { left: canvasRect.left, top: canvasRect.top },
            svgRect: { left: svgRect.left, top: svgRect.top }
        });
        
        // Create connection group
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'workflow-connection');
        g.setAttribute('data-action-id', action.id);
        
        // Create arrow marker definition - scaled with zoom like other elements
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        const zoom = this.viewport?.zoom || 1;
        const markerSize = Math.max(4, 8 * zoom); // More responsive arrow scaling
        
        marker.setAttribute('id', `arrow-${action.id}`);
        marker.setAttribute('markerWidth', markerSize.toString());
        marker.setAttribute('markerHeight', markerSize.toString());
        marker.setAttribute('refX', (markerSize * 0.9).toString());
        marker.setAttribute('refY', (markerSize * 0.3).toString());
        marker.setAttribute('orient', 'auto');
        marker.setAttribute('markerUnits', 'userSpaceOnUse'); // Use user space for zoom scaling
        
        const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const arrowD = `M0,0 L0,${markerSize * 0.6} L${markerSize * 0.9},${markerSize * 0.3} z`;
        arrowPath.setAttribute('d', arrowD);
        arrowPath.setAttribute('fill', '#007bff');
        
        marker.appendChild(arrowPath);
        defs.appendChild(marker);
        g.appendChild(defs);
        
        // Create curved path with enhanced zoom scaling
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const controlX = (fromX + toX) / 2;
        const controlY = Math.min(fromY, toY) - (80 * zoom); // Increased curve height for better visibility
        const pathData = `M ${fromX} ${fromY} Q ${controlX} ${controlY} ${toX} ${toY}`;
        
        logger.log('Creating physical SVG path:', { 
            pathData, 
            fromX, fromY, toX, toY, 
            controlX, controlY,
            fromStage: fromStage.name,
            toStage: toStage.name,
            zoom: zoom
        });
        
        path.setAttribute('d', pathData);
        path.setAttribute('stroke', '#007bff');
        path.setAttribute('stroke-width', Math.max(1, 2.5 * zoom)); // More responsive to zoom
        path.setAttribute('fill', 'none');
        path.setAttribute('marker-end', `url(#arrow-${action.id})`);
        path.setAttribute('class', 'connection-path');
        path.setAttribute('opacity', '1');
        
        // Add interactivity
        path.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectAction(action.id);
        });
        
        // Create label background box
        const labelBackground = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        const labelText = action.buttonLabel || action.name;
        const fontSize = Math.max(8, 10 * zoom); // More responsive font scaling
        const padding = Math.max(4, 6 * zoom); // Scale padding with zoom
        
        // Calculate text dimensions (approximate)
        const textWidth = labelText.length * fontSize * 0.6; // Approximate character width
        const textHeight = fontSize;
        
        // Position label box
        const labelX = controlX - (textWidth / 2) - padding;
        const labelY = controlY - (15 * zoom) - textHeight - padding; // More space above curve
        const boxWidth = textWidth + (padding * 2);
        const boxHeight = textHeight + (padding * 2);
        
        labelBackground.setAttribute('x', labelX);
        labelBackground.setAttribute('y', labelY);
        labelBackground.setAttribute('width', boxWidth);
        labelBackground.setAttribute('height', boxHeight);
        labelBackground.setAttribute('rx', Math.max(2, 3 * zoom)); // Rounded corners scaled with zoom
        labelBackground.setAttribute('ry', Math.max(2, 3 * zoom));
        labelBackground.setAttribute('fill', '#ffffff');
        labelBackground.setAttribute('stroke', '#007bff');
        labelBackground.setAttribute('stroke-width', Math.max(0.5, 1 * zoom));
        labelBackground.setAttribute('opacity', '0.95');
        labelBackground.setAttribute('class', 'connection-label-box');
        
        // Add label text
        const labelTextElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        labelTextElement.setAttribute('x', controlX);
        labelTextElement.setAttribute('y', controlY - (15 * zoom) - (padding / 2)); // Center in box
        labelTextElement.setAttribute('text-anchor', 'middle');
        labelTextElement.setAttribute('font-size', fontSize);
        labelTextElement.setAttribute('fill', '#007bff');
        labelTextElement.setAttribute('font-weight', '500');
        labelTextElement.setAttribute('class', 'connection-label');
        labelTextElement.textContent = labelText;
        
        // Create a single hover group to prevent flickering
        const hoverGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        hoverGroup.setAttribute('class', 'connection-hover-group');
        hoverGroup.setAttribute('data-action-id', action.id);
        
        // Add all elements to hover group
        hoverGroup.appendChild(path);
        hoverGroup.appendChild(labelBackground);
        hoverGroup.appendChild(labelTextElement);
        
        // Single click handler for the entire group
        hoverGroup.addEventListener('click', (e) => {
            e.stopPropagation();
            this.editAction(action.id);
        });
        
        // Stable hover effects without position changes
        const baseStrokeWidth = Math.max(1, 2.5 * zoom);
        const hoverStrokeWidth = Math.max(1.5, 3 * zoom);
        
        // Single hover listener for the entire group
        hoverGroup.addEventListener('mouseenter', () => {
            // Subtle line thickness increase
            path.setAttribute('stroke-width', hoverStrokeWidth.toString());
            
            // Subtle label box highlight
            labelBackground.setAttribute('fill', '#f8f9ff');
            labelBackground.setAttribute('stroke-width', Math.max(1, 1.5 * zoom));
            
            // Subtle text highlight - NO position changes
            labelTextElement.setAttribute('fill', '#0056b3');
        });
        
        hoverGroup.addEventListener('mouseleave', () => {
            // Restore original styles - NO position changes
            path.setAttribute('stroke-width', baseStrokeWidth.toString());
            labelBackground.setAttribute('fill', '#ffffff');
            labelBackground.setAttribute('stroke-width', Math.max(0.5, 1 * zoom));
            labelTextElement.setAttribute('fill', '#007bff');
        });
        
        // Add the hover group which contains all elements
        g.appendChild(hoverGroup);
        
        // Add to SVG and store reference
        svg.appendChild(g);
        this.connections.set(action.id, g);
        
        logger.log('Physical connection line rendered:', action.name);
    }
    
    /**
     * Update action visuals for a specific stage with optimized performance
     */
    updateActionsForStage(stageId) {
        logger.log('Updating actions for stage:', stageId);
        
        // Find actions related to this stage and batch updates
        const actionsToUpdate = [];
        this.actions.forEach(action => {
            if (action.fromStageId === stageId || action.toStageId === stageId) {
                actionsToUpdate.push(action);
            }
        });
        
        // Batch DOM updates for better performance
        if (actionsToUpdate.length > 0) {
            // Remove old visuals first
            actionsToUpdate.forEach(action => {
                const oldConnection = this.connections.get(action.id);
                if (oldConnection) {
                    oldConnection.remove();
                    this.connections.delete(action.id);
                }
            });
            
            // Re-render all actions
            actionsToUpdate.forEach(action => {
                this.renderAction(action);
            });
        }
    }

    // =====================================================
    // EVENT HANDLERS
    // =====================================================

    handleWheel(e) {
        e.preventDefault();
        
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(0.1, Math.min(3, this.viewport.zoom * delta));
        
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Zoom towards mouse position
        const factor = newZoom / this.viewport.zoom;
        this.viewport.panX = mouseX - (mouseX - this.viewport.panX) * factor;
        this.viewport.panY = mouseY - (mouseY - this.viewport.panY) * factor;
        this.viewport.zoom = newZoom;
        
        this.updateCanvasTransform();
    }

    handleCanvasMouseDown(e) {
        if (e.target === this.canvas || e.target.closest('.workflow-nodes')) {
            this.isDragging = true;
            this.dragOffset = { x: e.clientX - this.viewport.panX, y: e.clientY - this.viewport.panY };
            this.canvas.classList.add('dragging');
            
            // Clear selection
            this.clearSelection();
        }
    }

    handleCanvasMouseMove(e) {
        if (this.isDragging) {
            this.viewport.panX = e.clientX - this.dragOffset.x;
            this.viewport.panY = e.clientY - this.dragOffset.y;
            this.updateCanvasTransform();
        }
    }

    handleCanvasMouseUp(e) {
        this.isDragging = false;
        this.canvas.classList.remove('dragging');
    }

    handleCanvasRightClick(e) {
        e.preventDefault();
        
        const nodeElement = e.target.closest('.workflow-node');
        if (nodeElement) {
            const stageId = nodeElement.dataset.stageId;
            this.showNodeContextMenu(e, stageId);
        } else {
            // Right-clicked on empty canvas - show canvas context menu
            this.showCanvasContextMenu(e);
        }
    }

    showCanvasContextMenu(e) {
        // Remove any existing context menu
        this.removeContextMenu();
        
        // Calculate canvas position for new stage
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / this.viewport.zoom - this.viewport.panX;
        const y = (e.clientY - rect.top) / this.viewport.zoom - this.viewport.panY;
        
        // Create context menu
        const contextMenu = document.createElement('div');
        contextMenu.className = 'context-menu';
        contextMenu.innerHTML = `
            <div class="context-menu-item" data-action="add-stage" data-i18n="workflows.add_workflow">
                Add Stage Here
            </div>
            <div class="context-menu-item" data-action="show-data-flow">
                🔄 Show Data Flow
            </div>
            <div class="context-menu-item" data-action="fit-to-view">
                ⬚ Fit to View
            </div>
        `;
        
        // Add event listeners for context menu items
        contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                const action = item.dataset.action;
                this.removeContextMenu();
                
                try {
                    if (action === 'add-stage') {
                        await this.addStageAtPosition(x, y);
                    } else if (action === 'show-data-flow') {
                        this.showDataFlow();
                    } else if (action === 'fit-to-view') {
                        this.fitToView();
                    }
                } catch (error) {
                    logger.error('Error executing context menu action:', error);
                    if (window.app) {
                        window.app.showNotification('error', 'Error', 'Failed to execute action');
                    }
                }
            });
        });
        
        // Position the menu
        contextMenu.style.position = 'fixed';
        contextMenu.style.left = `${e.clientX}px`;
        contextMenu.style.top = `${e.clientY}px`;
        contextMenu.style.zIndex = '1000';
        
        document.body.appendChild(contextMenu);
        
        // Translate any data-i18n attributes in the context menu
        setTimeout(() => i18nDOM.translateDataAttributes(), 50);
        
        // Close menu when clicking elsewhere
        setTimeout(() => {
            document.addEventListener('click', () => this.removeContextMenu(), { once: true });
        }, 10);
    }
    
    removeContextMenu() {
        const existingMenu = document.querySelector('.context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }
    }
    

    handleKeyDown(e) {
        if (e.key === 'Delete' && this.selection.selectedNode) {
            this.deleteStage(this.selection.selectedNode);
        } else if (e.key === 'Escape') {
            if (this.isConnecting) {
                this.cancelConnection();
            } else {
                this.clearSelection();
                this.closeModal();
            }
        }
    }

    // =====================================================
    // SELECTION MANAGEMENT
    // =====================================================

    selectNode(stageId) {
        // Clear previous selection
        this.clearSelection();
        
        this.selection.selectedNode = stageId;
        const nodeElement = this.nodes.get(stageId);
        if (nodeElement) {
            nodeElement.classList.add('selected');
        }
        
        // Update sidebar
        this.showStageProperties(stageId);
    }

    selectAction(actionId) {
        // Clear previous selection
        this.clearSelection();
        
        this.selection.selectedAction = actionId;
        const connectionElement = this.connections.get(actionId);
        if (connectionElement) {
            const line = connectionElement.querySelector('.connection-line');
            const label = connectionElement.querySelector('.connection-label');
            
            if (line) {
                line.style.stroke = 'var(--color-primary)';
                line.style.strokeWidth = '3';
                line.classList.add('selected');
            }
            
            if (label) {
                label.style.fill = 'var(--color-primary)';
                label.style.fontWeight = 'var(--font-weight-bold)';
                label.classList.add('selected');
            }
        }
        
        // Update sidebar
        this.showActionProperties(actionId);
    }

    clearSelection() {
        // Clear node selection
        if (this.selection.selectedNode) {
            const nodeElement = this.nodes.get(this.selection.selectedNode);
            if (nodeElement) {
                nodeElement.classList.remove('selected');
            }
        }
        
        // Clear action selection
        if (this.selection.selectedAction) {
            const connectionElement = this.connections.get(this.selection.selectedAction);
            if (connectionElement) {
                const line = connectionElement.querySelector('.connection-line');
                const label = connectionElement.querySelector('.connection-label');
                
                if (line) {
                    line.style.stroke = 'var(--color-border-dark)';
                    line.style.strokeWidth = '2';
                    line.classList.remove('selected');
                }
                
                if (label) {
                    label.style.fill = 'var(--color-text-primary)';
                    label.style.fontWeight = 'var(--font-weight-medium)';
                    label.classList.remove('selected');
                }
            }
        }
        
        this.selection.selectedNode = null;
        this.selection.selectedAction = null;
        
        // Hide selection properties (if they exist)
        const selectionProperties = document.getElementById('selection-properties');
        if (selectionProperties) {
            selectionProperties.style.display = 'none';
        }
    }

    // =====================================================
    // SIDEBAR MANAGEMENT
    // =====================================================

    updateSidebarWorkflowProperties() {
        // Instead of updating the old sidebar, update the local state
        // which will trigger the preview sidebar to update via subscription
        this.localState.setState('workflow.name', this.workflow.name);
        this.localState.setState('workflow.description', this.workflow.description || '');
        this.localState.setState('workflow.workflow_type', this.workflow.workflow_type);
        this.localState.setState('workflow.marker_color', this.workflow.marker_color);
        
        logger.log('Workflow properties updated in local state');
    }

    showStageProperties(stageId) {
        const stage = this.stages.get(stageId);
        if (!stage) return;
        
        const section = document.getElementById('selection-properties');
        const content = document.getElementById('selection-content');
        
        // Defensive check - if elements don't exist, just log selection
        if (!section || !content) {
            logger.log('Stage selected (properties panel not available):', stage.name, 'ID:', stageId);
            return;
        }
        
        content.innerHTML = `
            <h4>Stage: ${stage.name}</h4>
            <div class="form-group">
                <label class="form-label">Name</label>
                <input type="text" class="form-input" id="stage-name" value="${stage.name}">
            </div>
            <div class="form-group">
                <label class="form-label">Type</label>
                <select class="form-input" id="stage-type">
                    <option value="start" ${stage.type === 'start' ? 'selected' : ''}>Start</option>
                    <option value="intermediate" ${stage.type === 'intermediate' ? 'selected' : ''}>Intermediate</option>
                    <option value="end" ${stage.type === 'end' ? 'selected' : ''}>End</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Max Hours</label>
                <input type="number" class="form-input" id="stage-max-hours" value="0" min="0">
            </div>
            <div class="form-group">
                <label class="form-label">Allowed Roles</label>
                <div id="stage-roles-selector"></div>
            </div>
            <div class="form-group">
                <button class="btn btn-secondary" onclick="workflowBuilder.editStage('${stageId}')" data-i18n="actions.edit">Edit Details</button>
                <button class="btn btn-secondary" onclick="workflowBuilder.deleteStage('${stageId}')" data-i18n="actions.delete">Delete Stage</button>
            </div>
        `;
        
        section.style.display = 'block';
        
        // Translate any new data-i18n attributes
        setTimeout(() => i18nDOM.translateDataAttributes(), 50);
        
        // Initialize EntitySelector for stage roles
        this.createStageRoleSelector('stage-roles-selector', stage.allowedRoles);
        
        // Add event listeners for inline editing
        this.setupStagePropertyListeners(stageId);
    }

    // Role checkboxes replaced with EntitySelector for consistent interface

    setupStagePropertyListeners(stageId) {
        const stage = this.stages.get(stageId);
        if (!stage) return;
        
        // Name input
        document.getElementById('stage-name')?.addEventListener('input', (e) => {
            stage.name = e.target.value;
            this.updateStageVisual(stageId);
        });
        
        
        // Type select
        document.getElementById('stage-type')?.addEventListener('change', (e) => {
            const oldType = stage.type;
            stage.type = e.target.value;
            
            // Update visual class
            const nodeElement = this.nodes.get(stageId);
            if (nodeElement) {
                nodeElement.className = `workflow-node ${stage.type}-stage`;
                if (this.selection.selectedNode === stageId) {
                    nodeElement.classList.add('selected');
                }
            }
            
            this.updateStageVisual(stageId);
        });
        
        // Max hours input
        document.getElementById('stage-max-hours')?.addEventListener('input', (e) => {
            stage.maxHours = parseInt(e.target.value) || 0;
        });
        
        // Role checkboxes
        document.getElementById('stage-roles')?.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                const roleId = e.target.value;
                if (e.target.checked) {
                    if (!stage.allowedRoles.includes(roleId)) {
                        stage.allowedRoles.push(roleId);
                    }
                } else {
                    stage.allowedRoles = stage.allowedRoles.filter(id => id !== roleId);
                }
                this.updateStageVisual(stageId);
            }
        });
    }

    updateStageVisual(stageId) {
        const stage = this.stages.get(stageId);
        const nodeElement = this.nodes.get(stageId);
        if (!stage || !nodeElement) return;
        
        // Update node content
        const header = nodeElement.querySelector('.node-header');
        const body = nodeElement.querySelector('.node-body');
        
        header.querySelector('.node-title').textContent = stage.name;
        header.querySelector('.node-type').textContent = `${stage.type} stage`;
        
        // Update or add edit indicator
        const hasEditAction = Array.from(this.actions.values()).some(
            action => action.fromStageId === stageId && action.type === 'edit'
        );
        
        let editIndicator = header.querySelector('.node-edit-indicator');
        if (hasEditAction && !editIndicator) {
            // Add edit indicator
            const titleDiv = header.querySelector('div');
            titleDiv.insertAdjacentHTML('afterend', '<div class="node-edit-indicator" title="This stage has edit actions">✏️</div>');
        } else if (!hasEditAction && editIndicator) {
            // Remove edit indicator
            editIndicator.remove();
        }
        
        const infos = body.querySelectorAll('.node-info');
        infos[0].textContent = `Key: ${stage.key}`;
        infos[1].textContent = `Roles: ${stage.allowedRoles.length} assigned`;
        infos[2].textContent = `Fields: ${stage.formFields.length}`;
    }

    // =====================================================
    // MODAL MANAGEMENT
    // =====================================================

    async openStageConfigModal(stage) {
        const modal = document.getElementById('config-modal');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');
        
        title.textContent = `Configure Stage: ${stage.name}`;
        
        // Set stage context in FormBuilder for sophisticated field inheritance
        logger.log('FormBuilder exists:', !!this.formBuilder, 'Setting stage context:', stage.id);
        if (this.formBuilder) {
            logger.log('Calling FormBuilder.setStageContext with stage:', stage.id);
            await this.formBuilder.setStageContext(stage.id);
            logger.log('FormBuilder.setStageContext completed');
        } else {
            logger.warn('FormBuilder is not initialized!');
        }
        
        // Calculate inherited fields for non-start stages
        const inheritedFields = this.getInheritedFieldsForStage(stage.id);
        const availableFields = stage.type === 'start' ? stage.formFields || [] : inheritedFields;
        
        body.innerHTML = `
            <div class="form-group">
                <div class="form-label-wrapper">
                    <label class="form-label required">Stage Name</label>
                </div>
                <input type="text" class="form-input" id="modal-stage-name" value="${stage.name}" placeholder="Enter stage name" required>
            </div>
            <div class="form-group">
                <div class="form-label-wrapper">
                    <label class="form-label required">Stage Type</label>
                    <span class="form-info-icon" data-tooltip="Start: begins workflow, Intermediate: processes data, End: completes workflow">ⓘ
                        <div class="form-tooltip">Start: begins workflow, Intermediate: processes data, End: completes workflow</div>
                    </span>
                </div>
                <select class="form-input" id="modal-stage-type" required>
                    <option value="">Select Stage Type</option>
                    <option value="start" ${stage.type === 'start' ? 'selected' : ''}>Start Stage</option>
                    <option value="intermediate" ${stage.type === 'intermediate' ? 'selected' : ''}>Intermediate Stage</option>
                    <option value="end" ${stage.type === 'end' ? 'selected' : ''}>End Stage</option>
                </select>
            </div>
            <div class="form-group">
                <div class="form-label-wrapper">
                    <label class="form-label">Maximum Duration</label>
                    <span class="form-info-icon" data-tooltip="Time limit in hours (0 = no limit)">ⓘ
                        <div class="form-tooltip">Time limit in hours (0 = no limit)</div>
                    </span>
                </div>
                <input type="number" class="form-input" id="modal-stage-max-hours" value="0" min="0">
            </div>
            <div class="form-group">
                <div class="form-label-wrapper">
                    <label class="form-label">Visible To Roles</label>
                    <span class="form-info-icon" data-tooltip="Use # to select all roles">ⓘ
                        <div class="form-tooltip">Use # to select all roles</div>
                    </span>
                </div>
                <div id="modal-stage-roles-container">
                    <!-- EntitySelector will be inserted here -->
                </div>
            </div>
            
            <div class="form-group">
                <div class="form-label-wrapper">
                    <label class="form-label">Stage Icon</label>
                    <span class="form-info-icon" data-tooltip="Custom SVG icon for this stage">ⓘ
                        <div class="form-tooltip">Custom SVG icon for this stage</div>
                    </span>
                </div>
                <div class="stage-icon-section">
                    <button type="button" class="btn btn-secondary" id="configure-stage-icon-btn" onclick="workflowBuilder.openStageIconDesigner('${stage.id}')">
                        Configure Stage Icon
                    </button>
                    <div class="current-stage-icon-preview" id="current-stage-icon-preview-${stage.id}">
                        <!-- Current icon preview will be shown here -->
                    </div>
                </div>
            </div>
            
            ${stage.type === 'start' ? `
            <div class="form-group">
                <h4>Initial Form Fields</h4>
                <div id="modal-stage-fields">
                    ${this.renderFormFields(stage.formFields)}
                </div>
                <button type="button" class="btn btn-secondary" onclick="workflowBuilder.addFormField('${stage.id}')">+ Add Field</button>
            </div>
            ` : `
            <div class="form-group">
                <h4>Available Fields</h4>
                <div id="modal-stage-inherited-fields">
                    ${this.renderInheritedFields(inheritedFields)}
                </div>
            </div>
            `}
            
            <div class="form-group">
                <h4>Stage Actions</h4>
                <div id="modal-stage-actions">
                    ${this.renderStageActions(stage.id)}
                </div>
                <div class="action-buttons">
                    <button type="button" class="btn btn-secondary" onclick="workflowBuilder.addEditAction('${stage.id}')">+ Add Edit Action</button>
                    <button type="button" class="btn btn-secondary" onclick="workflowBuilder.addForwardAction('${stage.id}')">+ Add Forward Action</button>
                </div>
            </div>
        `;
        
        // Initialize EntitySelector for roles
        await this.initializeStageRoleSelector(stage);
        
        // Initialize stage icon preview
        await this.initializeStageIconPreview(stage);
        
        modal.style.display = 'flex';
        modal.dataset.configType = 'stage';
        modal.dataset.configId = stage.id;
    }

    /**
     * Initialize EntitySelector for stage role management
     */
    async initializeStageRoleSelector(stage) {
        // Ensure roles are loaded before creating EntitySelector
        if (this.projectRoles.length === 0) {
            logger.log('Loading project roles before initializing EntitySelector...');
            await this.loadProjectRoles();
        }
        
        setTimeout(() => {
            const container = document.getElementById('modal-stage-roles-container');
            if (container && EntitySelector) {
                logger.log('Initializing stage role selector for stage:', stage.id);
                logger.log('Available project roles:', this.projectRoles);
                logger.log('Stage allowed roles:', stage.allowedRoles);
                
                // Convert role IDs to role objects for initial selection
                let initialSelection = [];
                if (stage.allowedRoles && stage.allowedRoles.length > 0) {
                    initialSelection = stage.allowedRoles.map(roleId => {
                        const role = this.projectRoles.find(r => r.id === roleId || r.name === roleId);
                        if (role) {
                            return { id: role.id, name: role.name };
                        }
                        // If role not found in project roles, keep as ID for EntitySelector to handle
                        return roleId;
                    });
                }
                
                logger.log('Converted initial selection:', initialSelection);
                
                this.currentStageRoleSelector = new EntitySelector('modal-stage-roles-container', {
                    tableName: 'roles',
                    projectId: this.projectId,
                    projectIdField: 'project_id',
                    entityName: 'role',
                    entityNamePlural: 'roles',
                    allowCreation: true,
                    allowSelection: true,
                    showQuickSelect: true,
                    placeholder: 'Type role name or # for all roles...',
                    label: 'Allowed Roles:',
                    localData: this.projectRoles, // Use local data instead of database queries
                    initialSelection: initialSelection,
                    onSelectionChange: (roles) => {
                        // Update stage roles in real-time
                        stage.allowedRoles = roles.map(role => role.id || role.name);
                        logger.log('Stage roles updated:', stage.allowedRoles);
                    }
                });
            }
        }, 100);
    }

    /**
     * Open stage icon designer modal
     */
    async openStageIconDesigner(stageId) {
        const stage = this.stages.get(stageId);
        if (!stage) {
            logger.error('Stage not found for icon designer:', stageId);
            return;
        }

        // Create a new modal for the icon designer
        const existingModal = document.getElementById('stage-icon-designer-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modalHtml = `
            <div id="stage-icon-designer-modal" class="modal" style="display: flex; z-index: 1001;">
                <div class="modal-content" style="max-width: 800px; width: 90%;">
                    <div class="modal-header">
                        <h3>Configure Stage Icon: ${stage.name}</h3>
                        <span class="modal-close" onclick="workflowBuilder.closeStageIconDesigner()">&times;</span>
                    </div>
                    <div class="modal-body">
                        <div id="stage-icon-designer-container"></div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Initialize the stage icon designer
        this.currentStageIconDesigner = new WorkflowStageIconDesigner('stage-icon-designer-container', {
            stageId: stageId,
            workflowId: this.workflowId,
            onSave: (iconConfig) => {
                this.onStageIconSaved(stageId, iconConfig);
            },
            onCancel: () => {
                this.closeStageIconDesigner();
            }
        });

        this.currentStageIconDesigner.render();
        
        // Load existing configuration if available
        await this.currentStageIconDesigner.loadConfiguration(stageId);
    }

    /**
     * Close stage icon designer modal
     */
    closeStageIconDesigner() {
        const modal = document.getElementById('stage-icon-designer-modal');
        if (modal) {
            modal.remove();
        }
        this.currentStageIconDesigner = null;
    }

    /**
     * Handle stage icon save
     */
    async onStageIconSaved(stageId, iconConfig) {
        logger.log('Stage icon saved for stage:', stageId, iconConfig);
        
        // Update the stage's visual config in local state
        const stage = this.stages.get(stageId);
        if (stage) {
            if (!stage.visual_config) {
                stage.visual_config = {};
            }
            stage.visual_config.icon = iconConfig;
            
            // Update the visual representation of the stage
            this.updateStageIcon(stageId, iconConfig);
            
            // Update the preview in the stage config modal if it's open
            this.updateStageIconPreview(stageId, iconConfig);
        }
        
        this.closeStageIconDesigner();
        
        // Show success notification
        app.showNotification('success', i18n.t('messages.success'), 'Stage icon saved successfully!');
    }

    /**
     * Update stage icon in the workflow canvas
     */
    updateStageIcon(stageId, iconConfig) {
        const stageElement = this.nodes.get(stageId);
        if (!stageElement) return;

        // Find or create icon container in stage header
        const header = stageElement.querySelector('.node-header');
        if (!header) return;

        let iconContainer = header.querySelector('.stage-icon-container');
        if (!iconContainer) {
            iconContainer = document.createElement('div');
            iconContainer.className = 'stage-icon-container';
            header.appendChild(iconContainer);
        }

        // Generate and set the icon HTML
        if (this.currentStageIconDesigner) {
            const iconHtml = this.currentStageIconDesigner.getRenderedIcon();
            iconContainer.innerHTML = iconHtml;
        }
    }

    /**
     * Update stage icon preview in the configuration modal
     */
    updateStageIconPreview(stageId, iconConfig) {
        const previewContainer = document.getElementById(`current-stage-icon-preview-${stageId}`);
        if (!previewContainer) return;

        if (this.currentStageIconDesigner) {
            const iconHtml = this.currentStageIconDesigner.getRenderedIcon({ size: 32 });
            previewContainer.innerHTML = `
                <div class="icon-preview-label">Current Icon:</div>
                ${iconHtml}
            `;
        }
    }

    /**
     * Initialize stage icon preview when opening stage config modal
     */
    async initializeStageIconPreview(stage) {
        if (!stage.visual_config || !stage.visual_config.icon) {
            return; // No icon configured
        }

        const previewContainer = document.getElementById(`current-stage-icon-preview-${stage.id}`);
        if (!previewContainer) return;

        // Create a temporary designer to generate the preview
        const tempDesigner = new WorkflowStageIconDesigner('temp-container', {});
        tempDesigner.currentConfig = stage.visual_config.icon;
        
        const iconHtml = tempDesigner.getRenderedIcon({ size: 32 });
        previewContainer.innerHTML = `
            <div class="icon-preview-label">Current Icon:</div>
            ${iconHtml}
        `;
    }

    /**
     * Get inherited fields for a stage (from start stage + all previous actions)
     */
    getInheritedFieldsForStage(stageId) {
        logger.log('getInheritedFieldsForStage called with stageId:', stageId);
        
        const targetStage = this.stages.get(stageId);
        if (!targetStage) {
            logger.warn('getInheritedFieldsForStage: Stage not found:', stageId);
            logger.log('Available stages:', Array.from(this.stages.keys()));
            return [];
        }
        
        logger.log('Found target stage:', { id: targetStage.id, name: targetStage.name, type: targetStage.type, formFields: targetStage.formFields?.length || 0 });
        
        // Use the correct inheritance method that follows actual connections
        const inheritedFields = this.getInheritedFields(targetStage);
        logger.log('getInheritedFields returned:', inheritedFields.length, 'fields:', inheritedFields);
        return inheritedFields;
    }

    getInheritedFieldsForAction(action) {
        logger.log('getInheritedFieldsForAction called with action:', action.id);
        
        // Get the source stage of this action
        const fromStage = this.stages.get(action.fromStageId);
        if (!fromStage) {
            logger.warn('getInheritedFieldsForAction: From stage not found:', action.fromStageId);
            return [];
        }
        
        // Get all fields available at the source stage (including inherited + own fields)
        const inheritedFields = this.getInheritedFields(fromStage);
        
        logger.log('getInheritedFieldsForAction returning:', inheritedFields.length, 'fields');
        return inheritedFields;
    }

    /**
     * Render inherited fields display
     */
    renderInheritedFields(fields) {
        if (!fields || fields.length === 0) {
            return '<p class="text-muted">No inherited fields available</p>';
        }
        
        return fields.map(field => `
            <div class="field-item inherited-field">
                <div class="field-summary">
                    <strong>${field.field_label || field.label}</strong> 
                    <span class="field-type">(${field.field_type || field.type})</span>
                    <span class="field-source">${field.source}</span>
                </div>
            </div>
        `).join('');
    }

    /**
     * Render stage actions
     */
    renderStageActions(stageId) {
        const stageActions = Array.from(this.actions.values()).filter(
            action => action.fromStageId === stageId
        );
        
        if (stageActions.length === 0) {
            return '<p class="text-muted">No actions defined for this stage</p>';
        }
        
        return stageActions.map(action => `
            <div class="action-item" data-action-id="${action.id}">
                <div class="action-summary">
                    <strong>${action.name}</strong>
                    <span class="action-type ${action.type}">${action.type.toUpperCase()}</span>
                    <div class="action-actions">
                        <button type="button" class="btn btn-sm" onclick="workflowBuilder.editAction('${action.id}')">Edit</button>
                        <button type="button" class="btn btn-sm btn-danger" onclick="workflowBuilder.removeAction('${action.id}')">Remove</button>
                    </div>
                </div>
                ${action.formFields && action.formFields.length > 0 ? 
                    `<div class="action-fields">
                        <small>Fields: ${action.formFields.map(f => f.field_label || f.label).join(', ')}</small>
                    </div>` : ''
                }
            </div>
        `).join('');
    }

    /**
     * Add edit action to a stage
     */
    async addEditAction(stageId) {
        const stage = this.stages.get(stageId);
        if (!stage) return;

        // Check if edit action already exists for this stage
        const existingEditAction = Array.from(this.actions.values()).find(
            action => action.fromStageId === stageId && action.type === 'edit'
        );

        if (existingEditAction) {
            app.showNotification('warning', 'Warning', 'This stage already has an edit action');
            return;
        }

        // Create new edit action
        const action = {
            id: this.generateActionId(),
            fromStageId: stageId,
            toStageId: stageId, // Edit actions loop back to same stage
            name: `Edit ${stage.name}`,
            type: 'edit',
            buttonLabel: 'Edit',
            buttonColor: '#ff9800',
            allowedRoles: [],
            editableFields: [],
            requiresConfirmation: false,
            formFields: []
        };

        this.actions.set(action.id, action);
        this.renderAction(action);
        this.updateStageVisual(stageId); // Update stage to show edit indicator
        await this.openActionConfigModal(action);
        
        // Re-render stage actions in modal
        const actionsContainer = document.getElementById('modal-stage-actions');
        if (actionsContainer) {
            actionsContainer.innerHTML = this.renderStageActions(stageId);
        }
    }

    /**
     * Add forward action to a stage
     */
    addForwardAction(stageId) {
        this.showTargetStageSelectionModal(stageId);
    }

    /**
     * Show target stage selection modal for forward actions
     */
    showTargetStageSelectionModal(fromStageId) {
        const modal = document.getElementById('config-modal');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');
        
        title.textContent = 'Select Target Stage';
        
        const availableStages = Array.from(this.stages.values()).filter(s => s.id !== fromStageId);
        
        body.innerHTML = `
            <div class="target-stage-selection">
                <p>Choose the target stage for this forward action:</p>
                
                <div class="target-stage-options">
                    ${availableStages.map(stage => `
                        <div class="target-stage-card" data-stage-id="${stage.id}">
                            <div class="stage-type-icon">${stage.type === 'start' ? '🟢' : stage.type === 'end' ? '🔴' : '🔵'}</div>
                            <h4>${stage.name}</h4>
                            <p>${stage.type.charAt(0).toUpperCase() + stage.type.slice(1)} Stage</p>
                        </div>
                    `).join('')}
                    
                    <div class="target-stage-card create-new" data-action="create-new">
                        <div class="stage-type-icon">➕</div>
                        <h4>Create New Stage</h4>
                        <p>Create a new target stage</p>
                    </div>
                </div>
            </div>
            
            <style>
                .target-stage-selection p {
                    margin-bottom: var(--spacing-md);
                    color: var(--color-text-secondary);
                }
                
                .target-stage-options {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: var(--spacing-md);
                }
                
                .target-stage-card {
                    padding: var(--spacing-md);
                    border: 2px solid var(--color-border-light);
                    border-radius: var(--border-radius-lg);
                    text-align: center;
                    cursor: pointer;
                    transition: all var(--transition-fast);
                }
                
                .target-stage-card:hover {
                    border-color: var(--color-primary);
                    background-color: var(--color-bg-secondary);
                    transform: translateY(-2px);
                    box-shadow: var(--shadow-md);
                }
                
                .target-stage-card.create-new {
                    border-style: dashed;
                    border-color: var(--color-success);
                }
                
                .target-stage-card.create-new:hover {
                    border-color: var(--color-success-dark);
                    background-color: #f0fdf4;
                }
            </style>
        `;
        
        // Add click handlers
        body.querySelectorAll('.target-stage-card').forEach(card => {
            card.addEventListener('click', async () => {
                if (card.dataset.action === 'create-new') {
                    modal.style.display = 'none';
                    this.showStageTypeSelectionModal();
                } else {
                    const toStageId = card.dataset.stageId;
                    modal.style.display = 'none';
                    
                    // Create forward action
                    const fromStage = this.stages.get(fromStageId);
                    const toStage = this.stages.get(toStageId);
                    
                    const action = {
                        id: this.generateActionId(),
                        fromStageId: fromStageId,
                        toStageId: toStageId,
                        name: `${fromStage.name} → ${toStage.name}`,
                        type: 'forward',
                        buttonLabel: `Continue to ${toStage.name}`,
                        buttonColor: '#007bff',
                        allowedRoles: [],
                        formFields: [],
                        requiresConfirmation: false
                    };

                    this.actions.set(action.id, action);
                    this.renderAction(action);
                    await this.openActionConfigModal(action);
                }
            });
        });
        
        modal.style.display = 'flex';
        modal.dataset.configType = 'target-stage-selection';
    }

    renderFormFields(fields, allowEdit = true) {
        if (!fields || fields.length === 0) {
            return '<p class="text-muted">No form fields defined</p>';
        }
        
        return fields.map((field) => `
            <div class="field-item" data-field-id="${field.id}">
                <div class="field-summary">
                    <strong>${field.field_label}</strong> 
                    <span class="field-type">(${field.field_type})</span>
                    ${allowEdit ? `
                    <div class="field-actions">
                        <button type="button" class="btn btn-sm" onclick="workflowBuilder.editFormField('${field.id}')">Edit</button>
                        <button type="button" class="btn btn-sm" onclick="workflowBuilder.removeFormField('${field.id}')">Remove</button>
                    </div>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }

    closeModal() {
        document.getElementById('config-modal').style.display = 'none';
        
        // Don't clear FormBuilder stage context when closing modal
        // The context should persist for smart dropdown field inheritance
        // Context will be updated when opening a new modal for a different stage/action
    }

    saveModalData() {
        const modal = document.getElementById('config-modal');
        const configType = modal.dataset.configType;
        const configId = modal.dataset.configId;
        
        logger.log('saveModalData called with:', { configType, configId });
        
        if (configType === 'stage') {
            this.saveStageModalData(configId);
        } else if (configType === 'action') {
            logger.log('Calling saveActionModalData with:', configId);
            this.saveActionModalData(configId);
        } else if (configType === 'form-field') {
            this.saveFormFieldModalData();
        }
        
        this.closeModal();
    }

    saveStageModalData(stageId) {
        const stage = this.stages.get(stageId);
        if (!stage) return;
        
        // Get form values
        const name = document.getElementById('modal-stage-name')?.value;
        const type = document.getElementById('modal-stage-type')?.value;
        const maxHours = parseInt(document.getElementById('modal-stage-max-hours')?.value) || 0;
        
        // Get selected roles from EntitySelector
        let allowedRoles = [];
        if (this.currentStageRoleSelector) {
            const selectedRoles = this.currentStageRoleSelector.getSelectedEntities();
            allowedRoles = selectedRoles.map(role => role.id || role.name);
        } else {
            // Keep existing roles if EntitySelector not available
            allowedRoles = stage.allowedRoles || [];
        }
        
        // Validate
        if (!name) {
            app.showNotification('error', 'Validation Error', 'Name is required');
            return;
        }
        
        // Update stage
        stage.name = name;
        stage.type = type;
        stage.maxHours = maxHours;
        stage.allowedRoles = allowedRoles;
        
        // Get form fields from FormBuilder (CRITICAL FIX)
        if (this.formBuilder) {
            stage.formFields = this.formBuilder.getAllFields();
            logger.log('Saved stage form fields from FormBuilder:', stage.formFields.length, 'fields');
        }
        
        // Update local state to persist changes
        this.localState.updateStage(stageId, stage);
        
        // Update visual
        this.updateStageVisual(stageId);
        
        // Update node class if type changed
        const nodeElement = this.nodes.get(stageId);
        if (nodeElement) {
            nodeElement.className = `workflow-node ${stage.type}-stage`;
            if (this.selection.selectedNode === stageId) {
                nodeElement.classList.add('selected');
            }
        }
        
        // Update sidebar if this stage is selected
        if (this.selection.selectedNode === stageId) {
            this.showStageProperties(stageId);
        }
        
        app.showNotification('success', 'Success', 'Stage updated successfully');
    }

    // =====================================================
    // UTILITY METHODS
    // =====================================================

    generateStageId() {
        // Generate a proper UUID v4
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    generateActionId() {
        // Generate a proper UUID v4
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    updateCanvasTransform() {
        if (this.canvas) {
            const transform = `scale(${this.viewport.zoom}) translate(${this.viewport.panX}px, ${this.viewport.panY}px)`;
            
            // Apply transform to the nodes container only
            const nodesContainer = this.canvas.querySelector('.workflow-nodes');
            if (nodesContainer) {
                nodesContainer.style.transform = transform;
            }
            
            // SVG connections use absolute positioning relative to canvas - no transform needed
            const svg = this.canvas.querySelector('.workflow-connections');
            if (svg) {
                svg.style.transform = '';
            }
            
            // Throttled update for better performance during rapid changes
            this.throttledUpdateConnections(() => {
                this.updateConnectionsAfterTransform();
            });
        }
    }
    
    /**
     * Update connection coordinates after canvas transform changes
     */
    updateConnectionsAfterTransform() {
        // Only re-render if we have actions
        if (this.actions.size > 0) {
            logger.log('Updating physical connections after transform change, zoom:', this.viewport.zoom);
            
            // Re-render all forward actions (connections) with new DOM positions
            this.actions.forEach(action => {
                if (action.type === 'forward') {
                    // Remove existing connection
                    const existingConnection = this.connections.get(action.id);
                    if (existingConnection) {
                        existingConnection.remove();
                        this.connections.delete(action.id);
                    }
                    
                    // Re-render with current DOM positions
                    this.renderConnectionLine(action);
                }
            });
        }
    }

    fitToView() {
        if (this.stages.size === 0) return;
        
        // Calculate bounds of all stages
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        this.stages.forEach(stage => {
            minX = Math.min(minX, stage.x);
            minY = Math.min(minY, stage.y);
            maxX = Math.max(maxX, stage.x + 180);
            maxY = Math.max(maxY, stage.y + 100);
        });
        
        const width = maxX - minX;
        const height = maxY - minY;
        const padding = 50;
        
        const canvasRect = this.canvas.getBoundingClientRect();
        const scaleX = (canvasRect.width - padding * 2) / width;
        const scaleY = (canvasRect.height - padding * 2) / height;
        const scale = Math.min(scaleX, scaleY, 1);
        
        this.viewport.zoom = scale;
        this.viewport.panX = padding - minX * scale + (canvasRect.width - width * scale) / 2;
        this.viewport.panY = padding - minY * scale + (canvasRect.height - height * scale) / 2;
        
        this.updateCanvasTransform();
    }

    // =====================================================
    // ACTIONS API (called from HTML)
    // =====================================================

    async editStage(stageId) {
        const stage = this.stages.get(stageId);
        if (stage) {
            await this.openStageConfigModal(stage);
        }
    }

    deleteStage(stageId) {
        // DEBUG: Log deletion attempt
        logger.log('DELETE STAGE ATTEMPT DEBUG - Entry point reached:', {
            stageId,
            stagesSize: this.stages.size,
            allStageIds: Array.from(this.stages.keys()),
            hasLocalState: !!this.localState
        });
        
        const stage = this.stages.get(stageId);
        if (!stage) {
            logger.warn('DELETE STAGE DEBUG - Stage not found in direct Maps:', stageId);
            return;
        }
        
        if (stage.type === 'start' && this.stages.size === 1) {
            app.showNotification('error', 'Error', 'Cannot delete the only start stage');
            return;
        }
        
        logger.log('DELETE STAGE DEBUG - About to show confirmation for:', {
            stageId,
            stageName: stage.name,
            stageType: stage.type
        });
        
        if (confirm(`Are you sure you want to delete stage "${stage.name}"?`)) {
            // Remove associated actions
            const actionsToRemove = [];
            this.actions.forEach((action, actionId) => {
                if (action.fromStageId === stageId || action.toStageId === stageId) {
                    actionsToRemove.push(actionId);
                }
            });
            
            actionsToRemove.forEach(actionId => {
                const connection = this.connections.get(actionId);
                if (connection) connection.remove();
                this.actions.delete(actionId);
                this.connections.delete(actionId);
            });
            
            // Remove stage
            const nodeElement = this.nodes.get(stageId);
            if (nodeElement) nodeElement.remove();
            
            this.stages.delete(stageId);
            this.nodes.delete(stageId);
            
            // Track deletion in LocalState for database persistence
            if (this.localState && this.localState.state) {
                // DEBUG: Check state synchronization
                logger.log('DEBUG - State sync check before LocalState deletion tracking:', {
                    stageId,
                    existsInDirectMaps: this.stages.has(stageId),
                    directMapsSize: this.stages.size,
                    directMapsStages: Array.from(this.stages.keys()),
                    localStateStages: this.localState.state ? Array.from(this.localState.state.stages?.keys() || []) : 'LocalState not initialized'
                });
                
                // Since LocalState and direct Maps are out of sync, directly track the deletion
                // instead of using localState.deleteStage() which requires the stage to exist
                if (!this.localState.state.deletedStages) {
                    this.localState.state.deletedStages = new Set();
                }
                this.localState.state.deletedStages.add(stageId);
                this.localState.state.isDirty = true;
                
                logger.log('DEBUG - Directly added stage to LocalState deletion tracking:', {
                    stageId,
                    deletedStagesSize: this.localState.state.deletedStages.size,
                    deletedStagesArray: Array.from(this.localState.state.deletedStages)
                });
            }
            
            // Track deletion for database persistence (fallback)
            if (!this.deletedStages) this.deletedStages = new Set();
            this.deletedStages.add(stageId);
            
            // Clear selection if this stage was selected
            if (this.selection.selectedNode === stageId) {
                this.clearSelection();
            }
            
            app.showNotification('success', 'Success', 'Stage deleted successfully');
        }
    }

    validateWorkflowForSave() {
        const errors = [];
        
        // Check workflow name
        if (!this.workflow.name.trim()) {
            errors.push('Workflow name is required');
        }
        
        // Check for at least one stage
        if (this.stages.size === 0) {
            errors.push('Workflow must have at least one stage');
        }
        
        // Check for exactly one start stage
        const startStages = Array.from(this.stages.values()).filter(s => s.type === 'start');
        if (startStages.length === 0) {
            errors.push('Workflow must have exactly one start stage');
        } else if (startStages.length > 1) {
            errors.push('Workflow can only have one start stage');
        }
        
        // Check for unique stage keys
        const keys = Array.from(this.stages.values()).map(s => s.key);
        const duplicateKeys = keys.filter((key, index) => keys.indexOf(key) !== index);
        if (duplicateKeys.length > 0) {
            errors.push(`Duplicate stage keys: ${duplicateKeys.join(', ')}`);
        }
        
        // Check stages have required properties
        this.stages.forEach(stage => {
            if (!stage.name.trim()) {
                errors.push(`Stage ${stage.key}: Name is required`);
            }
            if (!stage.key.trim()) {
                errors.push(`Stage ${stage.name}: Key is required`);
            }
        });
        
        // Check actions
        this.actions.forEach(action => {
            if (!action.name.trim()) {
                errors.push(`Action ${action.id}: Name is required`);
            }
            if (!action.buttonLabel.trim()) {
                errors.push(`Action ${action.id}: Button label is required`);
            }
        });
        
        if (errors.length === 0) {
            app.showNotification('success', 'Validation Success', 'Workflow is valid and ready to save');
        } else {
            app.showNotification('error', 'Validation Errors', errors.join('<br>'));
        }
        
        return errors.length === 0;
    }

    async saveWorkflow() {
        logger.log('Saving workflow with local-first architecture...');
        
        // Validate first
        if (!this.validateWorkflowForSave()) {
            return;
        }
        
        const saveBtn = document.getElementById('save-workflow-btn');
        if (!saveBtn) {
            logger.error('Save button not found');
            app.showNotification('error', 'Error', 'Save button not found');
            return;
        }
        const originalText = saveBtn.textContent;
        saveBtn.textContent = 'Saving...';
        saveBtn.disabled = true;
        
        try {
            // Export state from local-first architecture
            const exportedState = this.localState.exportState();
            
            // Ensure project ID is set
            exportedState.workflow.project_id = this.projectId;
            
            logger.log('Saving workflow data:', exportedState);
            
            // Debug: Check action form fields
            exportedState.actions.forEach(action => {
                logger.log(`Action ${action.name} (${action.id}):`, {
                    type: action.type,
                    formFields: action.formFields,
                    formFieldsCount: action.formFields ? action.formFields.length : 0
                });
            });
            
            // Validate required fields
            if (!exportedState.workflow.project_id || !exportedState.workflow.name) {
                throw new Error('Project ID and workflow name are required');
            }
            
            // Use DatabaseAdapter for atomic save
            const result = await this.databaseAdapter.saveCompleteWorkflow(exportedState, this.isNewWorkflow);
            
            if (result.success) {
                // Update local state
                this.workflowId = result.id;
                this.localState.setState('workflow.id', result.id);
                this.localState.markClean(result.deletionResults);
                this.isNewWorkflow = false;
                
                logger.log('Workflow saved successfully with local-first architecture!');
                app.showNotification('success', i18n.t('messages.success'), i18n.t('messages.saved'));
            }
            
            // Update URL if this was a new workflow
            if (window.location.hash.includes('/new')) {
                window.location.hash = `project/${this.projectId}/workflow-builder/${this.workflowId}`;
            }
            
        } catch (error) {
            logger.error('Failed to save workflow:', error);
            
            // Better error handling for database errors
            let errorMessage = error.message;
            if (error.code === '23505') {
                if (error.message?.includes('workflow_stages_workflow_id_stage_key_key')) {
                    errorMessage = 'Duplicate stage key detected. Please use unique stage names.';
                } else {
                    errorMessage = 'A workflow with this name already exists in this project';
                }
            } else if (error.code === '23503') {
                if (error.message?.includes('workflow_actions_to_stage_id_fkey')) {
                    errorMessage = 'Invalid target stage reference in workflow actions. Please check stage connections.';
                } else if (error.message?.includes('workflow_actions_from_stage_id_fkey')) {
                    errorMessage = 'Invalid source stage reference in workflow actions. Please check stage connections.';
                } else {
                    errorMessage = 'Database constraint violation: ' + (error.details || error.message);
                }
            } else if (error.code === '23502') {
                errorMessage = 'Missing required field: ' + (error.details || 'unknown field');
            } else if (error.code === '22P02') {
                errorMessage = 'Invalid data format. Please check stage and action IDs.';
            } else if (error.message?.includes('duplicate key')) {
                errorMessage = 'A workflow with this name already exists';
            } else if (error.message?.includes('violates check constraint')) {
                errorMessage = 'Invalid data provided for workflow';
            }
            
            app.showNotification('error', i18n.t('messages.error'), 'Failed to save workflow: ' + errorMessage);
        } finally {
            if (saveBtn) {
                saveBtn.textContent = originalText;
                saveBtn.disabled = false;
            }
        }
    }

    async saveStages() {
        // Delete existing stages first
        const { error: deleteError } = await supabaseClient.client
            .from('workflow_stages')
            .delete()
            .eq('workflow_id', this.workflowId);
        
        if (deleteError) {
            logger.error('Error deleting existing stages:', deleteError);
            throw deleteError;
        }
        
        if (this.stages.size === 0) return;
        
        logger.log('Saving stages:', Array.from(this.stages.values()));
        
        // Ensure unique stage keys and create mapping
        const stageKeys = new Set();
        const stageKeyMapping = new Map(); // oldId -> finalStageKey
        const stagesData = Array.from(this.stages.values()).map((stage, index) => {
            let stageKey = stage.key;
            let counter = 1;
            while (stageKeys.has(stageKey)) {
                stageKey = `${stage.key}_${counter}`;
                counter++;
            }
            stageKeys.add(stageKey);
            
            // Store mapping from old ID to final stage key
            stageKeyMapping.set(stage.id, stageKey);
            
            return {
                workflow_id: this.workflowId,
                stage_key: stageKey,
                stage_name: stage.name,
                stage_type: stage.type,
                stage_order: stage.order || index + 1,
                max_duration_hours: stage.maxHours || null,
                visible_to_roles: stage.allowedRoles || []
            };
        });
        
        const { data: savedStages, error } = await supabaseClient.client
            .from('workflow_stages')
            .insert(stagesData)
            .select();
        
        if (error) throw error;
        
        // Update stage IDs with database IDs using stage key mapping
        logger.log('Updating stage IDs with database IDs:', savedStages);
        logger.log('Stage key mapping:', stageKeyMapping);
        
        // Create reverse mapping: stageKey -> dbStage
        const dbStagesByKey = new Map();
        savedStages.forEach(dbStage => {
            dbStagesByKey.set(dbStage.stage_key, dbStage);
        });
        
        // Update each stage using the key mapping
        Array.from(this.stages.values()).forEach(stage => {
            const oldId = stage.id;
            const finalStageKey = stageKeyMapping.get(oldId);
            const dbStage = dbStagesByKey.get(finalStageKey);
            
            if (!dbStage) {
                logger.error('No database stage found for key:', finalStageKey, 'oldId:', oldId);
                return;
            }
            
            logger.log(`🔄 Updating stage ${oldId} -> ${dbStage.id} (key: ${finalStageKey})`);
            
            stage.id = dbStage.id;
            
            // Update maps
            this.stages.delete(oldId);
            this.stages.set(dbStage.id, stage);
            
            // Update node element
            const nodeElement = this.nodes.get(oldId);
            if (nodeElement) {
                nodeElement.dataset.stageId = dbStage.id;
                this.nodes.delete(oldId);
                this.nodes.set(dbStage.id, nodeElement);
            }
            
            // Update actions that reference this stage
            let updatedActions = 0;
            this.actions.forEach(action => {
                if (action.fromStageId === oldId) {
                    action.fromStageId = dbStage.id;
                    updatedActions++;
                    logger.log(`🔄 Updated action ${action.id} fromStageId: ${oldId} -> ${dbStage.id}`);
                }
                if (action.toStageId === oldId) {
                    action.toStageId = dbStage.id;
                    updatedActions++;
                    logger.log(`🔄 Updated action ${action.id} toStageId: ${oldId} -> ${dbStage.id}`);
                }
            });
            logger.log(`✅ Updated ${updatedActions} action references for stage ${dbStage.id}`);
        });
    }

    async saveActions() {
        // Actions are already deleted in main saveWorkflow method
        if (this.actions.size === 0) {
            logger.log('No actions to save');
            return;
        }
        
        logger.log('Saving actions:', Array.from(this.actions.values()));
        
        // Create new actions
        const actionsData = Array.from(this.actions.values()).map(action => {
            const actionData = {
                workflow_id: this.workflowId,
                from_stage_id: action.fromStageId,
                to_stage_id: action.toStageId,
                action_name: action.name,
                action_type: action.type || 'forward',
                button_label: action.buttonLabel,
                button_color: action.buttonColor || '#007bff',
                allowed_roles: action.allowedRoles || [],
                conditions: action.conditions || {},
                requires_confirmation: action.requiresConfirmation || false,
                confirmation_message: action.confirmationMessage || null
            };
            
            logger.log(`💾 Preparing action ${action.id}:`, actionData);
            
            // Validate stage IDs
            if (!actionData.from_stage_id || !actionData.to_stage_id) {
                logger.error('Invalid stage IDs for action:', action.id, actionData);
                throw new Error(`Invalid stage IDs for action ${action.name}: from=${actionData.from_stage_id}, to=${actionData.to_stage_id}`);
            }
            
            // Verify stage IDs exist in the stages map
            if (!this.stages.has(actionData.from_stage_id)) {
                logger.error('From stage ID not found in stages map:', actionData.from_stage_id);
                logger.log('Available stage IDs:', Array.from(this.stages.keys()));
                throw new Error(`From stage not found for action ${action.name}: ${actionData.from_stage_id}`);
            }
            
            if (!this.stages.has(actionData.to_stage_id)) {
                logger.error('To stage ID not found in stages map:', actionData.to_stage_id);
                logger.log('Available stage IDs:', Array.from(this.stages.keys()));
                throw new Error(`To stage not found for action ${action.name}: ${actionData.to_stage_id}`);
            }
            
            return actionData;
        });
        
        const { data: savedActions, error } = await supabaseClient.client
            .from('workflow_actions')
            .insert(actionsData)
            .select();
        
        if (error) throw error;
        
        // Update action IDs with database IDs
        savedActions.forEach((dbAction, index) => {
            const action = Array.from(this.actions.values())[index];
            const oldId = action.id;
            action.id = dbAction.id;
            
            // Update maps
            this.actions.delete(oldId);
            this.actions.set(dbAction.id, action);
            
            // Update connections
            const connectionElement = this.connections.get(oldId);
            if (connectionElement) {
                this.connections.delete(oldId);
                this.connections.set(dbAction.id, connectionElement);
            }
        });
    }

    // =====================================================
    // CONNECTION SYSTEM
    // =====================================================

    showNodeContextMenu(e, stageId) {
        e.preventDefault();
        e.stopPropagation();
        
        // Remove existing context menu
        const existingMenu = document.querySelector('.context-menu');
        if (existingMenu) existingMenu.remove();
        
        const stage = this.stages.get(stageId);
        if (!stage) return;
        
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.position = 'fixed';
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        menu.style.background = 'var(--color-bg-primary)';
        menu.style.border = '1px solid var(--color-border-medium)';
        menu.style.borderRadius = 'var(--border-radius-md)';
        menu.style.boxShadow = 'var(--shadow-lg)';
        menu.style.padding = 'var(--spacing-xs)';
        menu.style.zIndex = '1000';
        menu.style.minWidth = '160px';
        
        const menuItems = [
            { label: 'Connect to Stage', action: () => this.startConnection(stageId) },
            { label: 'Edit Stage', action: () => this.editStage(stageId) },
            { label: 'Add Edit Action', action: () => this.addEditAction(stageId) },
            { label: 'Duplicate Stage', action: () => this.duplicateStage(stageId) },
            { label: 'Delete Stage', action: () => this.deleteStage(stageId) }
        ];
        
        menuItems.forEach(item => {
            const menuItem = document.createElement('div');
            menuItem.className = 'context-menu-item';
            menuItem.style.padding = 'var(--spacing-xs) var(--spacing-sm)';
            menuItem.style.cursor = 'pointer';
            menuItem.style.borderRadius = 'var(--border-radius-sm)';
            menuItem.style.fontSize = 'var(--font-size-sm)';
            menuItem.textContent = item.label;
            
            menuItem.addEventListener('mouseenter', () => {
                menuItem.style.background = 'var(--color-bg-secondary)';
            });
            
            menuItem.addEventListener('mouseleave', () => {
                menuItem.style.background = 'transparent';
            });
            
            menuItem.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    await item.action();
                } catch (error) {
                    logger.error('Error executing context menu action:', error);
                    if (window.app) {
                        window.app.showNotification('error', 'Error', 'Failed to execute action');
                    }
                }
                menu.remove();
            });
            
            menu.appendChild(menuItem);
        });
        
        document.body.appendChild(menu);
        
        // Remove menu on outside click
        const removeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', removeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', removeMenu), 0);
    }

    startConnection(fromStageId) {
        this.isConnecting = true;
        this.connectingFrom = fromStageId;
        
        // Visual feedback
        const fromNode = this.nodes.get(fromStageId);
        if (fromNode) {
            fromNode.style.border = '3px solid var(--color-primary)';
            fromNode.style.cursor = 'crosshair';
        }
        
        // Add connecting class to canvas
        this.canvas.classList.add('connecting');
        
        // Show connection preview line
        this.showConnectionPreview();
        
        app.showNotification('info', 'Connection Mode', 'Click on another stage to create a connection, or press Escape to cancel');
    }

    showConnectionPreview() {
        if (!this.isConnecting || !this.connectingFrom) return;
        
        const svg = this.canvas?.querySelector('.workflow-connections');
        if (!svg) return;
        
        // Remove existing preview
        const existingPreview = svg.querySelector('.connection-preview');
        if (existingPreview) existingPreview.remove();
        
        // Create preview line that follows mouse
        const previewLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        previewLine.setAttribute('class', 'connection-preview');
        previewLine.setAttribute('stroke', 'var(--color-primary)');
        previewLine.setAttribute('stroke-width', '2');
        previewLine.setAttribute('stroke-dasharray', '5,5');
        previewLine.setAttribute('opacity', '0.7');
        
        svg.appendChild(previewLine);
        
        // Update preview line on mouse move
        const updatePreview = (e) => {
            if (!this.isConnecting) return;
            
            const fromStage = this.stages.get(this.connectingFrom);
            if (!fromStage) return;
            
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left - this.viewport.panX) / this.viewport.zoom;
            const mouseY = (e.clientY - rect.top - this.viewport.panY) / this.viewport.zoom;
            
            const fromX = fromStage.x + 90;
            const fromY = fromStage.y + 40;
            
            previewLine.setAttribute('x1', fromX);
            previewLine.setAttribute('y1', fromY);
            previewLine.setAttribute('x2', mouseX);
            previewLine.setAttribute('y2', mouseY);
        };
        
        document.addEventListener('mousemove', updatePreview);
        
        // Store reference for cleanup
        this.connectionPreviewCleanup = () => {
            previewLine.remove();
            document.removeEventListener('mousemove', updatePreview);
        };
    }

    async completeConnection(toStageId) {
        if (!this.isConnecting || !this.connectingFrom) return;
        
        const fromStageId = this.connectingFrom;
        
        // Check if connection already exists
        const existingAction = Array.from(this.actions.values()).find(action => 
            action.fromStageId === fromStageId && action.toStageId === toStageId
        );
        
        if (existingAction) {
            app.showNotification('warning', 'Connection Exists', 'A connection between these stages already exists');
            this.cancelConnection();
            return;
        }
        
        // Determine action type
        const actionType = fromStageId === toStageId ? 'edit' : 'forward';
        
        // Create action
        const action = {
            id: this.generateActionId(),
            fromStageId: fromStageId,
            toStageId: toStageId,
            name: actionType === 'edit' ? `Edit ${this.stages.get(fromStageId).name}` : `Action to ${this.stages.get(toStageId).name}`,
            type: actionType,
            buttonLabel: actionType === 'edit' ? 'Edit' : 'Next',
            buttonColor: actionType === 'edit' ? '#ff9800' : '#007bff',
            allowedRoles: [],
            conditions: {},
            requiresConfirmation: false,
            confirmationMessage: '',
            formFields: [],
            editableFields: actionType === 'edit' ? [] : undefined
        };
        
        this.actions.set(action.id, action);
        this.renderAction(action);
        
        this.cancelConnection();
        
        // Open action configuration modal
        await this.openActionConfigModal(action);
        
        app.showNotification('success', 'Connection Created', `${actionType === 'edit' ? 'Edit action' : 'Forward action'} created successfully`);
    }

    cancelConnection() {
        this.isConnecting = false;
        
        // Reset visual feedback
        if (this.connectingFrom) {
            const fromNode = this.nodes.get(this.connectingFrom);
            if (fromNode) {
                fromNode.style.border = '';
                fromNode.style.cursor = '';
            }
            this.connectingFrom = null;
        }
        
        // Remove connecting class
        this.canvas.classList.remove('connecting');
        
        // Clean up preview
        if (this.connectionPreviewCleanup) {
            this.connectionPreviewCleanup();
            this.connectionPreviewCleanup = null;
        }
    }

    addEditActionSimple(stageId) {
        // Simplified method to create self-referencing edit action
        this.isConnecting = true;
        this.connectingFrom = stageId;
        this.completeConnection(stageId);
        this.cancelConnection();
    }

    duplicateStage(stageId) {
        const originalStage = this.stages.get(stageId);
        if (!originalStage) return;
        
        this.stageCounter++;
        const newStage = {
            id: this.generateStageId(),
            key: `${originalStage.key}_copy`,
            name: `${originalStage.name} (Copy)`,
            type: originalStage.type === 'start' ? 'intermediate' : originalStage.type,
            order: this.stageCounter,
            maxHours: originalStage.maxHours,
            allowedRoles: [...originalStage.allowedRoles],
            x: originalStage.x + 50,
            y: originalStage.y + 50,
            formFields: [...originalStage.formFields]
        };
        
        this.stages.set(newStage.id, newStage);
        this.renderStage(newStage);
        
        app.showNotification('success', 'Stage Duplicated', 'Stage duplicated successfully');
    }

    // =====================================================
    // ACTION CONFIGURATION
    // =====================================================

    async openActionConfigModal(action) {
        const modal = document.getElementById('config-modal');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');
        
        title.textContent = `Configure ${action.type === 'edit' ? i18n.t('actions.edit') : 'Forward'} ${i18n.t('workflows.action')}`;
        
        // Set action context in FormBuilder for action-specific fields
        if (this.formBuilder) {
            await this.formBuilder.setActionContext(action.id);
        }
        
        body.innerHTML = `
            <div class="form-group">
                <div class="form-label-wrapper">
                    <label class="form-label required">Action Name</label>
                </div>
                <input type="text" class="form-input" id="modal-action-name" value="${action.name || ''}" placeholder="Enter action name" required>
            </div>
            <div class="form-group">
                <div class="form-label-wrapper">
                    <label class="form-label required">Button Label</label>
                </div>
                <input type="text" class="form-input" id="modal-action-button-label" value="${action.buttonLabel || ''}" placeholder="Text on button (e.g. Submit, Approve)" required>
            </div>
            <div class="form-group">
                <div class="form-label-wrapper">
                    <label class="form-label">Button Color</label>
                </div>
                <input type="color" class="form-input" id="modal-action-button-color" value="${action.buttonColor || '#007bff'}">
            </div>
            <div class="form-group">
                <div class="form-label-wrapper">
                    <label class="form-label">Allowed Roles</label>
                </div>
                <div id="modal-action-roles-selector"></div>
            </div>
            <div class="form-group">
                <div class="form-label-wrapper">
                    <label class="checkbox-label">
                        <input type="checkbox" id="modal-action-confirmation" ${action.requiresConfirmation ? 'checked' : ''}>
                        Require Confirmation
                    </label>
                </div>
            </div>
            <div class="form-group" id="confirmation-message-group" style="display: ${action.requiresConfirmation ? 'block' : 'none'}">
                <div class="form-label-wrapper">
                    <label class="form-label">Confirmation Message</label>
                </div>
                <textarea class="form-input" id="modal-action-confirmation-message" rows="2" placeholder="Are you sure you want to perform this action?">${action.confirmationMessage || ''}</textarea>
            </div>
            ${action.type === 'edit' ? this.renderEditActionFields(action) : this.renderForwardActionFields(action)}
        `;
        
        modal.style.display = 'flex';
        modal.dataset.configType = 'action';
        modal.dataset.configId = action.id;
        
        // Initialize EntitySelector for action roles
        logger.log('Initializing action role selector...');
        logger.log('Action allowedRoles:', action.allowedRoles);
        logger.log('Available projectRoles:', this.projectRoles);
        
        const selectedRoles = (action.allowedRoles || []).map(roleId => {
            const role = this.projectRoles.find(r => r.id === roleId || r.name === roleId);
            logger.log(`🔍 Mapping roleId "${roleId}" to role:`, role);
            return role ? { id: role.id, name: role.name } : roleId;
        });
        
        logger.log('Final selectedRoles for EntitySelector:', selectedRoles);
        await this.createActionRoleSelector('modal-action-roles-selector', selectedRoles);
        
        // Setup confirmation checkbox listener
        document.getElementById('modal-action-confirmation')?.addEventListener('change', (e) => {
            const messageGroup = document.getElementById('confirmation-message-group');
            messageGroup.style.display = e.target.checked ? 'block' : 'none';
        });
    }

    renderEditActionFields(action) {
        // Get all available fields from current stage and previous stages/actions
        const availableFields = this.getAvailableFieldsForEdit(action.fromStageId);
        logger.log('Edit Action Fields for stage', action.fromStageId, ':', availableFields);
        
        // Debug the fields being rendered
        logger.log('EDITABLE FIELDS HTML DEBUG:', {
            totalFields: availableFields.length,
            fieldDetails: availableFields.map(f => ({
                key: f.key,
                label: f.label,
                source: f.source,
                inherited: f.inherited,
                type: f.type
            }))
        });
        
        const htmlOutput = `
            <div class="form-group">
                <label class="form-label">Editable Fields</label>
                <div class="field-checkboxes" id="modal-edit-fields">
                    ${availableFields.map(field => `
                        <label class="checkbox-label" title="${field.inherited ? 'Inherited' : 'Local'} field from ${field.source}">
                            <input type="checkbox" value="${field.id}" 
                                   ${action.editableFields?.includes(field.id) ? 'checked' : ''}>
                            <span class="field-name">${field.label}</span>
                            <span class="field-source" style="color: ${field.inherited ? '#3b82f6' : '#22c55e'}; font-size: 0.85em;">
                                (${field.source})
                            </span>
                        </label>
                    `).join('')}
                </div>
                ${availableFields.length === 0 ? '<p class="text-muted">No fields available for editing</p>' : ''}
                <small class="form-help" style="margin-top: 8px; display: block;">
                    Total fields available: ${availableFields.length} 
                    (${availableFields.filter(f => f.inherited).length} inherited, ${availableFields.filter(f => !f.inherited).length} local)
                </small>
            </div>
        `;
        
        logger.log('EDITABLE FIELDS FINAL HTML:', htmlOutput);
        return htmlOutput;
    }

    renderForwardActionFields(action) {
        // Get all inherited fields from earlier stages
        const inheritedFields = this.getInheritedFieldsForAction(action);
        
        // Get action's own fields (fields specifically added to this action)
        const actionFields = action.formFields || [];
        
        // Create a set of inherited field IDs for proper deduplication
        const inheritedFieldIds = new Set(inheritedFields.map(f => f.id));
        
        // Only show fields in "Action Fields" that are NOT inherited
        const newActionFields = actionFields.filter(f => !inheritedFieldIds.has(f.id));
        
        return `
            <div class="form-group">
                <label class="form-label">Data Collection Fields</label>
                <div id="modal-action-fields">
                    ${inheritedFields.length > 0 ? `
                        <div class="field-section">
                            <h4>Inherited Fields (from earlier stages)</h4>
                            ${this.renderFormFields(inheritedFields, false)}
                        </div>
                    ` : ''}
                    ${newActionFields.length > 0 ? `
                        <div class="field-section">
                            <h4>Action Fields (editable)</h4>
                            ${this.renderFormFields(newActionFields, true)}
                        </div>
                    ` : ''}
                    ${inheritedFields.length === 0 && newActionFields.length === 0 ? '<p class="text-muted">No form fields defined</p>' : ''}
                </div>
                <button type="button" class="btn btn-secondary" onclick="workflowBuilder.addActionFormField('${action.id}')">+ Add Field</button>
            </div>
        `;
    }

    getAvailableFieldsForEdit(stageId) {
        const fields = [];
        const stage = this.stages.get(stageId);
        if (!stage) {
            logger.warn('getAvailableFieldsForEdit: Stage not found:', stageId);
            return fields;
        }
        
        logger.log('Analyzing fields for edit action on stage:', stage.name, stage.id);
        
        // Use sophisticated field inheritance to get ALL available fields
        // from the entire workflow path leading to this stage
        const inheritedFields = this.getInheritedFieldsForStage(stageId);
        logger.log('Inherited fields found:', inheritedFields.length, inheritedFields);
        
        // Add all inherited fields (from previous stages and actions)  
        inheritedFields.forEach(field => {
            fields.push({
                id: field.id, // Use the database UUID
                key: field.field_key || field.key || 'unknown_key',
                label: field.field_label || field.label || field.field_name || 'Unnamed Field',
                source: field.source || 'Unknown Source',
                type: field.field_type || field.type || 'unknown',
                inherited: true
            });
        });
        
        // Add fields from the current stage's form
        if (stage.formFields) {
            logger.log('Current stage form fields:', stage.formFields.length, stage.formFields);
            stage.formFields.forEach(field => {
                // Check for duplicates by UUID
                const existingField = fields.find(f => f.id === field.id);
                if (!existingField) {
                    fields.push({
                        id: field.id, // Use the database UUID
                        key: field.field_key || field.key || 'unknown_key',
                        label: field.field_label || field.label || field.field_name || 'Unnamed Field',
                        source: 'Current Stage',
                        type: field.field_type || field.type || 'unknown',
                        inherited: false
                    });
                }
            });
        }
        
        // Add fields from outgoing actions from this stage (for comprehensive editing)
        this.actions.forEach(action => {
            if (action.fromStageId === stageId && action.type === 'forward' && action.formFields) {
                logger.log('Outgoing action fields from', action.name, ':', action.formFields.length, action.formFields);
                action.formFields.forEach(field => {
                    // Check for duplicates by UUID
                    const existingField = fields.find(f => f.id === field.id);
                    if (!existingField) {
                        fields.push({
                            id: field.id, // Use the database UUID
                            key: field.field_key || field.key || 'unknown_key',
                            label: field.field_label || field.label || field.field_name || 'Unnamed Field',
                            source: `Outgoing Action: ${action.name}`,
                            type: field.field_type || field.type || 'unknown',
                            inherited: false
                        });
                    }
                });
            }
        });
        
        logger.log('Total available fields for editing:', fields.length, fields);
        return fields;
    }

    saveActionModalData(actionId) {
        logger.log('saveActionModalData called with actionId:', actionId);
        const action = this.actions.get(actionId);
        if (!action) {
            logger.error('Action not found for ID:', actionId);
            return;
        }
        logger.log('Action found:', action);
        
        // Get form values
        const name = document.getElementById('modal-action-name')?.value;
        const buttonLabel = document.getElementById('modal-action-button-label')?.value;
        const buttonColor = document.getElementById('modal-action-button-color')?.value;
        const requiresConfirmation = document.getElementById('modal-action-confirmation')?.checked;
        const confirmationMessage = document.getElementById('modal-action-confirmation-message')?.value;
        
        logger.log('Form values collected:', { name, buttonLabel, buttonColor, requiresConfirmation, confirmationMessage });
        
        // Get selected roles from EntitySelector
        // Note: roles should have been updated via handleActionRoleChange callback, but let's verify
        logger.log('Current action.allowedRoles before save:', action.allowedRoles);
        
        // Validate
        if (!name || !buttonLabel) {
            app.showNotification('error', 'Validation Error', 'Name and button label are required');
            return;
        }
        
        // Update action
        action.name = name;
        action.buttonLabel = buttonLabel;
        action.buttonColor = buttonColor;
        action.requiresConfirmation = requiresConfirmation;
        action.confirmationMessage = confirmationMessage;
        
        // Get form fields from FormBuilder (CRITICAL FIX)
        if (this.formBuilder) {
            action.formFields = this.formBuilder.getAllFields();
            logger.log('Saved form fields from FormBuilder:', action.formFields.length, 'fields');
        }
        
        // Handle edit action editable fields
        if (action.type === 'edit') {
            const editFieldCheckboxes = document.querySelectorAll('#modal-edit-fields input[type="checkbox"]:checked');
            const editableFields = Array.from(editFieldCheckboxes).map(cb => cb.value);
            logger.log('Found checked field checkboxes:', editFieldCheckboxes.length);
            logger.log('Editable fields to save:', editableFields);
            action.editableFields = editableFields;
        }
        
        // Update visual connection
        const connectionElement = this.connections.get(actionId);
        if (connectionElement) {
            const label = connectionElement.querySelector('.connection-label');
            if (label) {
                label.textContent = action.buttonLabel;
            }
            
            const line = connectionElement.querySelector('.connection-line');
            if (line) {
                line.style.stroke = action.buttonColor;
            }
        }
        
        // Emit state change event
        this.emitStateChange('actionUpdated', { actionId, action });
        
        // Trigger validation
        const validation = this.validateWorkflow();
        if (!validation.isValid) {
            logger.warn('Workflow validation warnings:', validation.errors);
        }
        
        app.showNotification('success', 'Success', 'Action updated successfully');
    }

    async showActionProperties(actionId) {
        const action = this.actions.get(actionId);
        if (!action) return;
        
        const section = document.getElementById('selection-properties');
        const content = document.getElementById('selection-content');
        
        // Defensive check - if elements don't exist, just log selection
        if (!section || !content) {
            logger.log('Action selected (properties panel not available):', action.name, 'ID:', actionId);
            return;
        }
        
        const fromStage = this.stages.get(action.fromStageId);
        const toStage = this.stages.get(action.toStageId);
        
        content.innerHTML = `
            <h4>Action: ${action.name}</h4>
            <div class="form-group">
                <label class="form-label">Type</label>
                <input type="text" class="form-input" value="${action.type}" readonly>
            </div>
            <div class="form-group">
                <label class="form-label">From</label>
                <input type="text" class="form-input" value="${fromStage?.name || 'Unknown'}" readonly>
            </div>
            <div class="form-group">
                <label class="form-label">To</label>
                <input type="text" class="form-input" value="${toStage?.name || 'Unknown'}" readonly>
            </div>
            <div class="form-group">
                <label class="form-label">Button Label</label>
                <input type="text" class="form-input" id="action-button-label" value="${action.buttonLabel || ''}">
            </div>
            <div class="form-group">
                <label class="form-label">Button Color</label>
                <input type="color" class="form-input" id="action-button-color" value="${action.buttonColor || '#007bff'}">
            </div>
            <div class="form-group">
                <label class="form-label">Allowed Roles</label>
                <div id="action-roles-selector"></div>
            </div>
            <div class="form-group">
                <button class="btn btn-secondary" onclick="workflowBuilder.editAction('${actionId}')">Edit Details</button>
                <button class="btn btn-secondary" onclick="workflowBuilder.deleteAction('${actionId}')">Delete Action</button>
            </div>
        `;
        
        section.style.display = 'block';
        
        // Translate any new data-i18n attributes
        setTimeout(() => i18nDOM.translateDataAttributes(), 50);
        
        // Initialize EntitySelector for action roles
        const selectedRoles = (action.allowedRoles || []).map(roleId => {
            const role = this.projectRoles.find(r => r.id === roleId || r.name === roleId);
            return role ? { id: role.id, name: role.name } : roleId;
        });
        await this.createActionRoleSelector('action-roles-selector', selectedRoles);
        
        // Add event listeners for inline editing
        this.setupActionPropertyListeners(actionId);
    }

    setupActionPropertyListeners(actionId) {
        const action = this.actions.get(actionId);
        if (!action) return;
        
        // Button label input
        document.getElementById('action-button-label')?.addEventListener('input', (e) => {
            action.buttonLabel = e.target.value;
            this.updateActionVisual(actionId);
        });
        
        // Button color input
        document.getElementById('action-button-color')?.addEventListener('change', (e) => {
            action.buttonColor = e.target.value;
            this.updateActionVisual(actionId);
        });
        
        // Role checkboxes
        document.getElementById('action-roles')?.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                const roleId = e.target.value;
                if (e.target.checked) {
                    if (!action.allowedRoles.includes(roleId)) {
                        action.allowedRoles.push(roleId);
                    }
                } else {
                    action.allowedRoles = action.allowedRoles.filter(id => id !== roleId);
                }
            }
        });
    }

    updateActionVisual(actionId) {
        const action = this.actions.get(actionId);
        const connectionElement = this.connections.get(actionId);
        if (!action || !connectionElement) return;
        
        // Update label
        const label = connectionElement.querySelector('.connection-label');
        if (label) {
            label.textContent = action.buttonLabel;
        }
        
        // Update line color
        const line = connectionElement.querySelector('.connection-line');
        if (line) {
            line.style.stroke = action.buttonColor;
        }
    }

    async editAction(actionId) {
        const action = this.actions.get(actionId);
        if (action) {
            logger.log('Opening action config modal for action:', actionId);
            logger.log('Action data with roles:', action);
            logger.log('Action allowedRoles:', action.allowedRoles);
            await this.openActionConfigModal(action);
        }
    }

    removeAction(actionId) {
        // Alias for deleteAction to match HTML onclick calls
        this.deleteAction(actionId);
    }

    deleteAction(actionId) {
        const action = this.actions.get(actionId);
        if (!action) return;
        
        if (confirm(`Are you sure you want to delete action "${action.name}"?`)) {
            // Store stage ID for visual update
            const fromStageId = action.fromStageId;
            
            // Remove connection visual
            const connectionElement = this.connections.get(actionId);
            if (connectionElement) connectionElement.remove();
            
            // Use localState.deleteAction to properly manage state and persistence
            const success = this.localState.deleteAction(actionId);
            if (success) {
                // Remove from visual maps
                this.actions.delete(actionId);
                this.connections.delete(actionId);
                
                // Update stage visual to remove edit indicator if needed
                if (action.type === 'edit') {
                    this.updateStageVisual(fromStageId);
                }
                
                // Clear selection if this action was selected
                if (this.selection.selectedAction === actionId) {
                    this.clearSelection();
                }
                
                // Refresh the stage properties panel to remove the deleted action from UI
                if (this.selection.selectedNode === fromStageId) {
                    this.showStageProperties(fromStageId);
                }
                
                app.showNotification('success', 'Success', 'Action deleted successfully');
                
                // Auto-save the workflow to persist deletion to database
                this.saveWorkflow();
            } else {
                app.showNotification('error', 'Error', 'Failed to delete action');
            }
        }
    }

    // =====================================================
    // FORM FIELD MANAGEMENT
    // =====================================================

    addFormField(stageId) {
        const stage = this.stages.get(stageId);
        if (!stage) return;
        
        // Use the same field selector interface as actions
        this.openFormFieldModal(stageId, null);
    }

    addActionFormField(actionId) {
        const action = this.localState.getState('actions').get(actionId);
        if (!action) return;
        
        this.openFormFieldModal(null, actionId);
    }

    openFormFieldModal(stageId = null, actionId = null, existingField = null, fieldIndex = null, initialConfig = null) {
        const modal = document.getElementById('config-modal');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');
        
        // Set title based on whether we're adding or editing
        const isEditing = !!existingField;
        if (isEditing) {
            if (stageId) {
                title.textContent = 'Edit Form Field in Stage';
            } else if (actionId) {
                title.textContent = 'Edit Form Field in Action';
            } else {
                title.textContent = 'Edit Question';
            }
        } else {
            if (stageId) {
                title.textContent = 'Add Form Field to Stage';
            } else if (actionId) {
                title.textContent = 'Add Form Field to Action';
            } else {
                title.textContent = 'Add Question';
            }
        }
        
        body.innerHTML = `
            <div class="enhanced-form-field-editor">
                <div class="field-type-grid">
                    ${Object.entries(this.fieldTypes).map(([type, config]) => `
                        <div class="field-type-card" data-type="${type}">
                            <div class="field-type-icon">${config.icon}</div>
                            <div class="field-type-label">${config.label}</div>
                            <div class="field-type-description">${config.description || ''}</div>
                        </div>
                    `).join('')}
                </div>
                
                <div class="field-configuration" id="field-configuration" style="display: none;">
                    <div class="form-group">
                        <label class="form-label">Selected Field Type</label>
                        <div class="selected-field-type" id="selected-field-type">
                            <span class="selected-icon"></span>
                            <span class="selected-label"></span>
                            <button type="button" class="btn-change-type" onclick="workflowBuilder.showFieldTypeSelection()">Change</button>
                        </div>
                        <input type="hidden" id="field-type" required>
                    </div>
                    
                    <div class="form-group">
                        <div class="form-label-wrapper">
                            <label class="form-label required">Question Text</label>
                        </div>
                        <input type="text" class="form-input" id="field-label" placeholder="What would you like to ask?" required>
                    </div>
                    
                    <div class="form-group">
                        <div class="form-label-wrapper">
                            <label class="form-label">Placeholder Text</label>
                        </div>
                        <input type="text" class="form-input" id="field-placeholder" placeholder="Hint text shown inside the input">
                    </div>
                    
                    <div class="form-group">
                        <div class="form-label-wrapper">
                            <label class="form-label">Help Text</label>
                        </div>
                        <textarea class="form-input" id="field-help" rows="2" placeholder="Additional instructions for users"></textarea>
                    </div>
                    
                    <div class="form-group">
                        <div class="form-label-wrapper">
                            <label class="checkbox-label">
                                <input type="checkbox" id="field-required">
                                This question is required
                            </label>
                        </div>
                    </div>
                    
                    <!-- Options for dropdown/multiple choice -->
                    <div class="form-group" id="field-options-group" style="display: none;">
                        <div class="form-label-wrapper">
                            <label class="form-label required">Answer Options</label>
                        </div>
                        <textarea class="form-input" id="field-options" rows="4" placeholder="Option 1&#10;Option 2&#10;Option 3"></textarea>
                        <div class="field-actions">
                            <button type="button" class="btn btn-secondary btn-sm" onclick="workflowBuilder.transformToCustomTable()">
                                Convert to Custom Table
                            </button>
                        </div>
                    </div>
                    
                    <!-- Smart dropdown configuration -->
                    <div class="form-group" id="smart-dropdown-group" style="display: none;">
                        <div class="form-label-wrapper">
                            <label class="form-label">Source Field</label>
                        </div>
                        <div id="source-field-selector">
                            <!-- EntitySelector for source field selection will be initialized here -->
                        </div>
                        
                        <div id="mappings-container" style="display: none;">
                            <div class="form-label-wrapper">
                                <label class="form-label">Dynamic Mappings</label>
                            </div>
                            <div id="mappings-list">
                                <!-- Mappings will be added here -->
                            </div>
                            <button type="button" class="btn btn-secondary btn-sm" onclick="workflowBuilder.addMapping()">
                                + Add Mapping Rule
                            </button>
                        </div>
                    </div>
                    
                    <!-- Date field specific options -->
                    <div class="form-group" id="date-options-group" style="display: none;">
                        <div class="form-label-wrapper">
                            <label class="form-label">Date Field Options</label>
                        </div>
                        <div class="date-field-options">
                            <div class="form-group">
                                <label class="checkbox-label">
                                    <input type="checkbox" id="include-time">
                                    Add time
                                </label>
                                <small class="help-text">Include time picker with date selection</small>
                            </div>
                            
                            <div class="form-group">
                                <label class="checkbox-label">
                                    <input type="checkbox" id="default-to-now">
                                    Default to now
                                </label>
                                <small class="help-text">Pre-fill with current date/time when form loads</small>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Custom table selector configuration -->
                    <div class="form-group" id="custom-table-group" style="display: none;">
                        <div class="form-label-wrapper">
                            <label class="form-label">Custom Table Configuration</label>
                        </div>
                        <div class="custom-table-info">
                            <p>Connected to custom table: <strong id="custom-table-display">No table selected</strong></p>
                            <input type="hidden" id="custom-table-id" value="">
                            <div class="table-actions">
                                <button type="button" class="btn btn-secondary btn-sm" onclick="workflowBuilder.selectCustomTable()">
                                    Select Different Table
                                </button>
                                <button type="button" class="btn btn-primary btn-sm" onclick="workflowBuilder.editCustomTable()">
                                    Edit Table
                                </button>
                            </div>
                            <small class="help-text">Users will select from the main column entries of this custom table</small>
                        </div>
                    </div>
                    
                    <!-- Validation rules -->
                    <div class="form-group" id="validation-group" style="display: none;">
                        <div class="form-label-wrapper">
                            <label class="form-label">Validation Rules</label>
                        </div>
                        <div id="validation-rules">
                            <!-- Validation rules will be populated based on field type -->
                        </div>
                    </div>
                    
                    <!-- Field preview -->
                    <div class="form-group">
                        <div class="form-label-wrapper">
                            <label class="form-label">Preview</label>
                        </div>
                        <div class="field-preview" id="field-preview">
                            <!-- Preview will be rendered here -->
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        modal.style.display = 'flex';
        modal.dataset.configType = 'form-field';
        modal.dataset.stageId = stageId || '';
        modal.dataset.actionId = actionId || '';

        // Store initial configuration (includes page info from workflow preview)
        if (initialConfig) {
            modal.dataset.initialConfig = JSON.stringify(initialConfig);
        }

        if (isEditing) {
            modal.dataset.fieldIndex = fieldIndex;
            // Store the existing field data for pre-population
            this._editingField = existingField;
        }
        
        // Setup field type selection
        this.setupFieldTypeSelection();
        
        // If editing, automatically select the field type and pre-populate
        if (isEditing && existingField) {
            setTimeout(() => {
                const dbFieldType = existingField.field_type || existingField.type;
                const frontendFieldType = this.dbFieldTypeToFieldTypes(dbFieldType);
                this.selectFieldType(frontendFieldType);
                
                // Wait a bit longer for field configuration to render
                setTimeout(() => {
                    this.populateFieldData(existingField);
                }, 200);
            }, 100);
        } else if (!isEditing && initialConfig && initialConfig.fieldType) {
            // Pre-select field type when adding new field with specific type
            setTimeout(() => {
                this.selectFieldType(initialConfig.fieldType);
            }, 100);
        }
        
        // Update preview on label change
        document.getElementById('field-label')?.addEventListener('input', (e) => {
            this.updateFieldPreview();
        });
        
        // Update preview on any change
        ['field-placeholder', 'field-help', 'field-required', 'field-options'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', () => this.updateFieldPreview());
            document.getElementById(id)?.addEventListener('change', () => this.updateFieldPreview());
        });
    }

    /**
     * Populate form fields with existing field data for editing
     */
    populateFieldData(field) {
        // Fill basic field information
        const labelInput = document.getElementById('field-label');
        const placeholderInput = document.getElementById('field-placeholder');
        const helpInput = document.getElementById('field-help');
        const requiredInput = document.getElementById('field-required');
        
        if (labelInput) labelInput.value = field.field_label || field.label || '';
        if (placeholderInput) placeholderInput.value = field.placeholder || '';
        if (helpInput) helpInput.value = field.help_text || field.help || '';
        if (requiredInput) requiredInput.checked = field.is_required || field.required || false;
        
        // Handle field type specific data
        const fieldType = field.field_type || field.type;
        
        if (['dropdown', 'select', 'multiple', 'multiple_choice', 'radio', 'checkbox'].includes(fieldType)) {
            const optionsTextarea = document.getElementById('field-options');
            if (optionsTextarea && field.field_options?.options) {
                optionsTextarea.value = field.field_options.options.join('\n');
            }
        }
        
        if (fieldType === 'smart_dropdown') {
            // For smart dropdowns, we need to populate the EntitySelector and mappings
            // This will be handled after the smart dropdown section is initialized
            logger.log('populateFormFieldModal: Smart dropdown field data:', {
                fieldId: field.id,
                fieldLabel: field.field_label,
                sourceField: field.field_options?.source_field,
                mappings: field.field_options?.mappings || [],
                fullFieldOptions: field.field_options
            });
            
            this._editingSmartDropdownData = {
                sourceField: field.field_options?.source_field,
                mappings: field.field_options?.mappings || []
            };
            
            // Trigger population after the smart dropdown UI is set up
            setTimeout(() => {
                this.populateSmartDropdownEditData();
            }, 500);
        }
        
        if (fieldType === 'date') {
            // Populate date field specific options
            const includeTimeInput = document.getElementById('include-time');
            const defaultToNowInput = document.getElementById('default-to-now');
            
            if (includeTimeInput) includeTimeInput.checked = field.field_options?.includeTime || false;
            if (defaultToNowInput) defaultToNowInput.checked = field.field_options?.defaultToNow || false;
        }
    }

    /**
     * Populate smart dropdown EntitySelector and mappings with editing data
     */
    populateSmartDropdownEditData() {
        if (!this._editingSmartDropdownData) return;
        
        const { sourceField, mappings } = this._editingSmartDropdownData;
        logger.log('populateSmartDropdownEditData: Retrieved data:', { sourceField, mappings });
        
        // Set the source field in the EntitySelector
        if (sourceField) {
            logger.log('populateSmartDropdownEditData: Setting source field:', sourceField);
            const sourceFieldSelector = this.sourceFieldSelectors?.get('current');
            logger.log('populateSmartDropdownEditData: sourceFieldSelector found:', !!sourceFieldSelector);
            
            if (sourceFieldSelector) {
                // Find the matching field entity
                const availableFields = this.getAvailableSourceFields();
                logger.log('populateSmartDropdownEditData: Available fields:', availableFields);
                const matchingField = availableFields.find(f => f.id === sourceField);
                logger.log('populateSmartDropdownEditData: Matching field found:', matchingField);
                
                if (matchingField) {
                    const entityData = {
                        id: matchingField.id,
                        name: `${matchingField.label} (${matchingField.type})`,
                        description: `Field type: ${matchingField.type}`,
                        key: matchingField.id
                    };
                    logger.log('populateSmartDropdownEditData: Setting selection with entityData:', entityData);
                    
                    // Try to select entity and catch any errors
                    // Add a small delay to ensure EntitySelector is fully rendered
                    setTimeout(() => {
                        try {
                            sourceFieldSelector.selectEntity(entityData.id, entityData.name);
                            logger.log('populateSmartDropdownEditData: selectEntity called successfully for:', entityData.name);
                        } catch (error) {
                            logger.error('populateSmartDropdownEditData: selectEntity failed (delayed):', error);
                        }
                    }, 100);
                    
                    // Show mappings container
                    const mappingsContainer = document.getElementById('mappings-container');
                    logger.log('populateSmartDropdownEditData: mappingsContainer element found:', !!mappingsContainer);
                    if (mappingsContainer) {
                        mappingsContainer.style.display = 'block';
                        logger.log('populateSmartDropdownEditData: Mappings container shown');
                    } else {
                        logger.warn('populateSmartDropdownEditData: mappings-container element not found in DOM');
                    }
                } else {
                    logger.warn('populateSmartDropdownEditData: No matching field found for sourceField:', sourceField);
                }
            }
        }
        
        // Populate mappings
        if (mappings && mappings.length > 0) {
            // Set flag to prevent automatic mapping refresh during edit mode
            this._editingExistingMappings = true;
            
            // Clear existing mappings and add the stored ones
            this.currentMappings = mappings;
            this.refreshMappingsList(sourceField); // Pass sourceField directly
        }
        
        // Clear the temporary data
        this._editingSmartDropdownData = null;
    }

    /**
     * Refresh mappings list display for regular form field modal
     */
    refreshMappingsList(sourceFieldId = null) {
        const container = document.getElementById('mappings-list');
        if (!container) return;
        
        if (!this.currentMappings || this.currentMappings.length === 0) {
            container.innerHTML = '<p class="text-muted">No mappings configured. Click "Add Mapping Rule" to create dynamic options.</p>';
            return;
        }
        
        // Clear existing content and rebuild
        container.innerHTML = '';
        
        this.currentMappings.forEach((mapping, index) => {
            const mappingId = `mapping-${index}-${Date.now()}`;

            // Debug: Log the mapping data
            logger.log(`refreshMappingsList: Processing mapping ${index}:`, mapping);
            logger.log(`refreshMappingsList: Mapping options:`, mapping.options);
            logger.log(`refreshMappingsList: Options join result:`, (mapping.options || []).join('\n'));

            const mappingHTML = `
                <div class="mapping-rule" data-index="${index}" data-mapping-id="${mappingId}">
                    <div class="mapping-condition">
                        <label class="form-label">When source field equals:</label>
                        <div id="mapping-when-${index}" class="mapping-when-selector">
                            <!-- EntitySelector for when condition values will be initialized here -->
                        </div>
                        <small class="form-help">Select the value from the source field options</small>
                    </div>
                    <div class="mapping-options-textarea">
                        <label class="form-label">Show these options:</label>
                        <textarea id="mapping-options-${index}" class="form-input" rows="3" placeholder="Option 1&#10;Option 2&#10;Option 3">${(mapping.options || []).join('\n')}</textarea>
                    </div>
                    <div class="mapping-actions">
                        <button type="button" class="btn btn-danger btn-sm" onclick="workflowBuilder.removeMappingByIndex(${index})">
                            🗑️ Remove Mapping
                        </button>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', mappingHTML);

            // Debug: Check if the textarea actually got the content
            setTimeout(() => {
                const textarea = document.getElementById(`mapping-options-${index}`);
                if (textarea) {
                    logger.log(`refreshMappingsList: Textarea ${index} value after insert:`, textarea.value);
                    logger.log(`refreshMappingsList: Textarea ${index} innerHTML:`, textarea.innerHTML);
                } else {
                    logger.warn(`refreshMappingsList: Textarea mapping-options-${index} not found in DOM`);
                }
            }, 10);
        });
        
        // Initialize EntitySelectors for all mapping when conditions
        this.initializeExistingMappingSelectors(sourceFieldId);
    }

    /**
     * Initialize EntitySelectors for existing mappings when editing
     */
    initializeExistingMappingSelectors(sourceFieldId = null) {
        if (!this.currentMappings || this.currentMappings.length === 0) return;
        
        // Use passed sourceFieldId or try to get it from the hidden input
        if (!sourceFieldId) {
            sourceFieldId = document.getElementById('source-field-hidden')?.value;
        }
        
        if (!sourceFieldId) {
            logger.warn('initializeExistingMappingSelectors: No source field provided');
            return;
        }
        
        logger.log('initializeExistingMappingSelectors: Using sourceFieldId:', sourceFieldId);
        
        this.currentMappings.forEach((mapping, index) => {
            const containerId = `mapping-when-${index}`;
            const container = document.getElementById(containerId);
            
            if (!container) {
                logger.warn(`initializeExistingMappingSelectors: Container not found: ${containerId}`);
                return;
            }
            
            // Initialize EntitySelector for this mapping's when condition
            this.initializeMappingWhenSelector(index, sourceFieldId);
            
            // Pre-populate with existing value if it exists
            if (mapping.when) {
                logger.log(`initializeExistingMappingSelectors: Will pre-populate mapping ${index} with value:`, mapping.when);
                setTimeout(() => {
                    const whenSelector = this.mappingWhenSelectors?.get(index);
                    logger.log(`initializeExistingMappingSelectors: EntitySelector found for mapping ${index}:`, !!whenSelector);
                    
                    if (whenSelector) {
                        try {
                            // Create entity data for the existing when value
                            const entityData = {
                                id: `existing_${mapping.when}`,
                                name: mapping.when,
                                description: `Existing value: ${mapping.when}`
                            };
                            
                            logger.log(`initializeExistingMappingSelectors: Calling selectEntity for mapping ${index}:`, entityData);
                            whenSelector.selectEntity(entityData.id, entityData.name);
                            logger.log(`initializeExistingMappingSelectors: Pre-populated mapping ${index} with when value:`, mapping.when);
                        } catch (error) {
                            logger.error(`initializeExistingMappingSelectors: Failed to pre-populate mapping ${index}:`, error);
                        }
                    } else {
                        logger.warn(`initializeExistingMappingSelectors: No EntitySelector found for mapping ${index}`);
                    }
                }, 250); // Increase delay to 250ms
            }
        });
    }

    /**
     * Remove mapping at specified index for regular form field modal
     */
    removeMappingByIndex(index) {
        if (this.currentMappings && index >= 0 && index < this.currentMappings.length) {
            const mapping = this.currentMappings[index];
            if (mapping && mapping.id) {
                this.localState.trackDeletedMapping(mapping.id); // Track for database deletion
            }
            this.currentMappings.splice(index, 1);
            this.refreshMappingsList();
        }
    }

    saveFormFieldModalData() {
        const modal = document.getElementById('config-modal');
        const stageId = modal.dataset.stageId;
        const actionId = modal.dataset.actionId;

        // Get initial configuration (includes page info from workflow preview)
        let initialConfig = null;
        try {
            if (modal.dataset.initialConfig) {
                initialConfig = JSON.parse(modal.dataset.initialConfig);
            }
        } catch (e) {
            logger.warn('Failed to parse initialConfig from modal dataset:', e);
        }

        // Get form values
        const type = document.getElementById('field-type')?.value;
        const label = document.getElementById('field-label')?.value;
        const placeholder = document.getElementById('field-placeholder')?.value;
        const required = document.getElementById('field-required')?.checked;
        const help = document.getElementById('field-help')?.value;
        const optionsText = document.getElementById('field-options')?.value;
        
        
        // Validate
        if (!type || !label) {
            app.showNotification('error', 'Validation Error', 'Field type and label are required');
            return;
        }
        
        // Parse options for dropdown/multiple choice fields
        let options = [];
        let fieldOptions = {};
        
        if (['select', 'radio', 'checkbox', 'dropdown', 'multiple'].includes(type) && optionsText) {
            options = optionsText.split('\n').filter(o => o.trim()).map(o => o.trim());
            // Structure options for FormBuilder compatibility
            fieldOptions = {
                options: options,
                allow_other: false,
                randomize_order: false
            };
        }
        
        // Handle smart dropdown specific data
        if (type === 'smart_dropdown') {
            // Get source field configuration from EntitySelector
            const sourceFieldHidden = document.getElementById('source-field-hidden')?.value;
            
            if (!sourceFieldHidden) {
                app.showNotification('error', 'Validation Error', 'Source field is required for smart dropdown');
                return;
            }
            
            let mappings = [];
            let sourceFields = [];
            
            // Parse source field data (could be single field or JSON array for tabbed interface)
            try {
                sourceFields = JSON.parse(sourceFieldHidden);
                if (!Array.isArray(sourceFields)) {
                    sourceFields = [sourceFieldHidden]; // Single field (backward compatibility)
                }
            } catch (e) {
                sourceFields = [sourceFieldHidden]; // Single field (backward compatibility)
            }
            
            // Check if we're using the new tabbed interface
            if (this._tabbedMappings && Object.keys(this._tabbedMappings).length > 0) {
                // Use tabbed mappings data
                mappings = this.getTabbedMappingsData();
                logger.log('📋 Using tabbed mappings data:', mappings);
            } else {
                // Fallback to old mapping rules system
                const mappingRules = document.querySelectorAll('.mapping-rule');
                
                mappingRules.forEach((rule, index) => {
                    const whenValue = rule.dataset.whenValue; // Get from EntitySelector data
                    const mappingIndex = rule.dataset.index;
                    const optionsTextarea = document.getElementById(`mapping-options-${mappingIndex}`);
                    
                    if (whenValue && optionsTextarea && optionsTextarea.value.trim()) {
                        // Parse options from textarea (one per line)
                        const optionNames = optionsTextarea.value
                            .split('\n')
                            .map(option => option.trim())
                            .filter(option => option.length > 0);
                        
                        if (optionNames.length > 0) {
                            mappings.push({
                                when: whenValue,
                                options: optionNames
                            });
                            
                            logger.log(`📋 Collected mapping ${index}: "${whenValue}" -> [${optionNames.join(', ')}]`);
                        }
                    }
                });
            }
            
            fieldOptions = {
                source_type: 'field',
                source_field: sourceFields[0], // Use first source field for now
                mappings: mappings,
                allow_create: false
            };
            
            logger.log('Smart dropdown field options collected:', fieldOptions);
        }
        
        // Handle date field specific options
        if (type === 'date') {
            const includeTime = document.getElementById('include-time')?.checked || false;
            const defaultToNow = document.getElementById('default-to-now')?.checked || false;
            
            fieldOptions = {
                includeTime: includeTime,
                defaultToNow: defaultToNow
            };
            
            logger.log('Date field options collected:', fieldOptions);
        }
        
        // Handle custom table selector specific options
        if (type === 'custom_table_selector') {
            const customTableId = document.getElementById('custom-table-id')?.value;
            
            if (!customTableId) {
                app.showNotification('error', 'Validation Error', 'Custom table is required for custom table selector');
                return;
            }
            
            fieldOptions = {
                source_type: 'custom_table',
                table_id: customTableId,
                allow_create: false
            };
            
            logger.log('Custom table selector field options collected:', fieldOptions);
        }
        
        // Check if we're editing an existing field
        const fieldIndex = modal.dataset.fieldIndex ? parseInt(modal.dataset.fieldIndex) : null;
        const isEditing = fieldIndex !== null;
        
        // Get existing fields for proper handling
        let existingFields = [];
        if (stageId) {
            existingFields = this.stages.get(stageId)?.formFields || [];
        } else if (actionId) {
            existingFields = this.localState.getState('actions').get(actionId)?.formFields || [];
        } else {
            // For questions, we don't have a collection of existing fields in the same way
            existingFields = [];
        }
            
        // Create or update field object
        let field;
        if (isEditing) {
            // Handle different editing scenarios
            if (stageId || actionId) {
                // Update existing field in stage/action, preserving original ID and order
                const existingField = existingFields[fieldIndex];
                if (!existingField) {
                    logger.error('Cannot find existing field at index:', fieldIndex, 'in fields:', existingFields);
                    app.showNotification('error', 'Error', 'Cannot find existing field to update');
                    return;
                }
                field = {
                    id: existingField.id, // Keep existing ID
                    field_label: label,
                    field_type: type,
                    placeholder: placeholder || '',
                    is_required: required || false,
                    help_text: help || '',
                    field_options: fieldOptions,
                    field_order: existingField.field_order // Keep existing order
                };
            } else {
                // Update existing question - fieldIndex is actually questionId in this case
                const questionId = fieldIndex;
                const existingQuestion = this.questions.get(questionId);
                if (!existingQuestion) {
                    logger.error('Cannot find existing question with ID:', questionId);
                    app.showNotification('error', 'Error', 'Cannot find existing question to update');
                    return;
                }
                field = {
                    id: existingQuestion.data.id, // Keep existing ID
                    field_label: label,
                    field_type: type,
                    placeholder: placeholder || '',
                    is_required: required || false,
                    help_text: help || '',
                    field_options: fieldOptions,
                    field_order: existingQuestion.data.field_order // Keep existing order
                };
            }
        } else {
            // Create field object with proper FormBuilder-compatible structure
            field = {
                // Don't set ID - let Supabase generate it with uuid_generate_v4()
                field_label: label,
                field_type: type,
                placeholder: placeholder || '',
                is_required: required || false,
                help_text: help || '',
                field_options: fieldOptions,
                field_order: existingFields.length + 1,
                // Add page information from initialConfig (workflow preview sidebar)
                page: initialConfig?.page || 1
            };
        }
        
        // Add or update field in appropriate container
        if (stageId) {
            const stage = this.stages.get(stageId);
            if (stage) {
                if (isEditing) {
                    // Replace existing field
                    stage.formFields[fieldIndex] = field;
                    logger.log('Updated existing stage field:', field);
                } else {
                    // Add new field
                    if (!stage.formFields) stage.formFields = [];
                    stage.formFields.push(field);
                    logger.log('Added new stage field:', field);
                }
                
                // CRITICAL FIX: Update LocalStateManager to trigger state change notifications
                // This ensures the preview sidebar and other components are notified of the change
                this.localState.updateStage(stageId, stage);
                
                // Force immediate preview update for better user experience
                if (window.workflowPreviewSidebar && typeof window.workflowPreviewSidebar.forceUpdatePreview === 'function') {
                    window.workflowPreviewSidebar.forceUpdatePreview();
                }
                
                this.updateStageVisual(stageId);
            }
        } else if (actionId) {
            // Get action from LocalStateManager instead of legacy Map
            const action = this.localState.getState('actions').get(actionId);
            if (action) {
                if (isEditing) {
                    // Replace existing field
                    action.formFields[fieldIndex] = field;
                    logger.log('Updated existing action field:', field);
                    this.localState.updateAction(actionId, action);
                } else {
                    // Add new field
                    const updatedFormFields = [...action.formFields, field];
                    logger.log('Added new action field:', field);
                    // Update action using proper LocalStateManager method
                    this.localState.updateAction(actionId, { formFields: updatedFormFields });
                }
                
                // Force immediate preview update for action field changes
                if (window.workflowPreviewSidebar && typeof window.workflowPreviewSidebar.forceUpdatePreview === 'function') {
                    window.workflowPreviewSidebar.forceUpdatePreview();
                }
            }
        } else {
            // Handle standalone questions (no stageId or actionId)
            if (isEditing) {
                // Update existing question
                const questionId = fieldIndex; // For questions, fieldIndex is actually the questionId
                const question = this.questions.get(questionId);
                if (question) {
                    question.data = field;
                    question.fieldType = field.field_type;
                    this.questions.set(questionId, question);
                    logger.log('Updated existing question:', question);
                }
            } else {
                // Add new question
                const newQuestion = this.createQuestion(field.field_type, field);
                logger.log('Added new question:', newQuestion);
            }
        }
        
        // Clear dataset
        delete modal.dataset.fieldIndex;
        delete modal.dataset.initialConfig;

        // Clear source fields cache since workflow structure changed
        this.clearSourceFieldsCache();

        app.showNotification('success', 'Success', isEditing ? 'Field updated successfully' : 'Field added successfully');
    }

    // =====================================================
    // ENHANCED FORM FIELD FUNCTIONALITY
    // =====================================================

    setupFieldTypeSelection() {
        const cards = document.querySelectorAll('.field-type-card');
        cards.forEach(card => {
            card.addEventListener('click', () => {
                const fieldType = card.dataset.type;
                this.selectFieldType(fieldType);
            });
        });
    }

    selectFieldType(fieldType) {
        const config = this.fieldTypes[fieldType];
        if (!config) return;

        // Hide field type grid and show configuration
        document.querySelector('.field-type-grid').style.display = 'none';
        document.getElementById('field-configuration').style.display = 'block';

        // Update selected field type display
        const selectedType = document.getElementById('selected-field-type');
        selectedType.querySelector('.selected-icon').textContent = config.icon;
        selectedType.querySelector('.selected-label').textContent = config.label;
        document.getElementById('field-type').value = fieldType;

        // Show/hide relevant sections
        this.updateFieldConfigurationSections(fieldType, config);

        // Update preview
        this.updateFieldPreview();
    }

    updateFieldConfigurationSections(fieldType, config) {
        // Ensure config is available
        if (!config && fieldType) {
            config = this.fieldTypes[fieldType] || {};
        }
        if (!config) {
            console.warn('No config provided for field type:', fieldType);
            return;
        }

        // Handle options for dropdown/multiple choice
        const optionsGroup = document.getElementById('field-options-group');
        optionsGroup.style.display = config.hasOptions ? 'block' : 'none';

        // Handle smart dropdown mappings
        const smartDropdownGroup = document.getElementById('smart-dropdown-group');
        smartDropdownGroup.style.display = config.hasMappings ? 'block' : 'none';

        // Handle date field specific options
        const dateOptionsGroup = document.getElementById('date-options-group');
        dateOptionsGroup.style.display = fieldType === 'date' ? 'block' : 'none';

        // Handle custom table selector configuration
        const customTableGroup = document.getElementById('custom-table-group');
        customTableGroup.style.display = config.hasCustomTable ? 'block' : 'none';

        // Handle validation rules
        const validationGroup = document.getElementById('validation-group');
        if (config.validation && config.validation.length > 0) {
            validationGroup.style.display = 'block';
            this.renderValidationRules(fieldType, config.validation);
        } else {
            validationGroup.style.display = 'none';
        }

        // Setup smart dropdown source field listener
        if (config.hasMappings) {
            // Populate the source field dropdown after a short delay to ensure DOM is ready
            setTimeout(() => {
                logger.log('Populating source field dropdown for smart dropdown');
                this.populateSourceFieldDropdown();
            }, 100);
            
            document.getElementById('source-field')?.addEventListener('change', (e) => {
                const mappingsContainer = document.getElementById('mappings-container');
                mappingsContainer.style.display = e.target.value ? 'block' : 'none';
            });
        }
    }

    renderValidationRules(fieldType, validationTypes) {
        const container = document.getElementById('validation-rules');
        container.innerHTML = validationTypes.map(rule => {
            switch (rule) {
                case 'required':
                    return ''; // Already handled by checkbox
                case 'minLength':
                case 'maxLength':
                    return `
                        <div class="validation-rule">
                            <label>${rule === 'minLength' ? 'Minimum' : 'Maximum'} Length:</label>
                            <input type="number" class="form-input" id="validation-${rule}" min="0">
                        </div>
                    `;
                case 'min':
                case 'max':
                    return `
                        <div class="validation-rule">
                            <label>${rule === 'min' ? 'Minimum' : 'Maximum'} Value:</label>
                            <input type="number" class="form-input" id="validation-${rule}">
                        </div>
                    `;
                case 'pattern':
                    return `
                        <div class="validation-rule">
                            <label>Pattern (Regex):</label>
                            <input type="text" class="form-input" id="validation-${rule}" placeholder="^[a-zA-Z]+$">
                        </div>
                    `;
                case 'fileTypes':
                    return `
                        <div class="validation-rule">
                            <label>Allowed File Types:</label>
                            <input type="text" class="form-input" id="validation-${rule}" placeholder=".jpg,.png,.pdf">
                        </div>
                    `;
                case 'maxFileSize':
                    return `
                        <div class="validation-rule">
                            <label>Max File Size (MB):</label>
                            <input type="number" class="form-input" id="validation-${rule}" min="1" max="100">
                        </div>
                    `;
                default:
                    return '';
            }
        }).join('');
    }

    updateFieldPreview() {
        const preview = document.getElementById('field-preview');
        if (!preview) return;

        const fieldType = document.getElementById('field-type')?.value;
        const label = document.getElementById('field-label')?.value || 'Question Text';
        const placeholder = document.getElementById('field-placeholder')?.value || '';
        const help = document.getElementById('field-help')?.value || '';
        const required = document.getElementById('field-required')?.checked || false;

        if (!fieldType) {
            preview.innerHTML = '<p class="preview-placeholder">Select a field type to see preview</p>';
            return;
        }

        const config = this.fieldTypes[fieldType];
        let previewHTML = `
            <div class="field-preview-container">
                <label class="preview-label">
                    ${label} ${required ? '<span class="required">*</span>' : ''}
                </label>
                ${help ? `<div class="preview-help">${help}</div>` : ''}
                <div class="preview-input-container">
                    ${this.renderFieldPreviewInput(fieldType, placeholder)}
                </div>
            </div>
        `;

        preview.innerHTML = previewHTML;
    }

    renderFieldPreviewInput(fieldType, placeholder) {
        switch (fieldType) {
            case 'short':
                return `<input type="text" placeholder="${placeholder || 'Enter text...'}" disabled>`;
            case 'long':
                return `<textarea placeholder="${placeholder || 'Enter text...'}" rows="3" disabled></textarea>`;
            case 'multiple':
                const options = document.getElementById('field-options')?.value.split('\n').filter(o => o.trim()) || ['Option 1', 'Option 2'];
                return options.map((option, index) => 
                    `<label class="preview-option"><input type="radio" name="preview" disabled> ${option}</label>`
                ).join('');
            case 'dropdown':
                const dropdownOptions = document.getElementById('field-options')?.value.split('\n').filter(o => o.trim()) || ['Option 1', 'Option 2'];
                return `
                    <select disabled>
                        <option>${placeholder || 'Select an option...'}</option>
                        ${dropdownOptions.map(option => `<option>${option}</option>`).join('')}
                    </select>
                `;
            case 'smart_dropdown':
                const sourceFieldId = document.getElementById('source-field-hidden')?.value || 'Not configured';
                const availableSourceFields = this.getAvailableSourceFields();
                const sourceFieldInfo = availableSourceFields.find(f => f.id === sourceFieldId);
                const displayText = sourceFieldInfo ? `${sourceFieldInfo.label}` : 'Not configured';
                return `
                    <select disabled>
                        <option>Dynamic options from: ${displayText}</option>
                    </select>
                `;
            case 'date':
                return `<input type="date" disabled>`;
            case 'file':
                return `<input type="file" disabled> <span class="file-note">File upload</span>`;
            case 'number':
                return `<input type="number" placeholder="${placeholder || '0'}" disabled>`;
            case 'email':
                return `<input type="email" placeholder="${placeholder || 'email@example.com'}" disabled>`;
            case 'custom_table_selector':
                const customTableDisplay = document.getElementById('custom-table-display')?.textContent || 'No table selected';
                return `
                    <select disabled>
                        <option>Options from: ${customTableDisplay}</option>
                    </select>
                `;
            default:
                return `<input type="text" placeholder="Unknown field type" disabled>`;
        }
    }

    showFieldTypeSelection() {
        document.querySelector('.field-type-grid').style.display = 'grid';
        document.getElementById('field-configuration').style.display = 'none';
    }

    populateSourceFieldDropdown() {
        logger.log('populateSourceFieldDropdown: Initializing EntitySelector for source fields');
        
        const container = document.getElementById('source-field-selector');
        if (!container) {
            logger.warn('populateSourceFieldDropdown: source-field-selector container not found');
            return;
        }
        
        // Clear the container
        container.innerHTML = '';
        
        // Get available source fields
        const availableFields = this.getAvailableSourceFields();
        logger.log('populateSourceFieldDropdown: Available fields:', availableFields);
        
        // Prepare local data for EntitySelector
        const staticEntities = availableFields.map(field => ({
            id: field.id,  // Use the UUID, not the field_key
            name: `${field.label} (${field.type})`,
            description: `Field type: ${field.type}`,
            key: field.id  // Use UUID for consistency
        }));
        
        // Create a static EntitySelector that works with the available fields
        const sourceFieldSelector = new EntitySelector('source-field-selector', {
            tableName: 'dummy', // Not used - we use local data
            localData: staticEntities, // Use local data instead of database queries
            
            // UI configuration
            placeholder: "Select field that controls this dropdown...",
            label: "Source Field Selection",
            entityName: "field",
            entityNamePlural: "fields",
            
            // Features - only allow selection, no creation
            allowCreation: false,
            allowSelection: true,
            showQuickSelect: true,
            maxSelections: 1, // Only one source field can be selected
            allowDeselection: true, // Allow removing the selected field
            
            // Callbacks
            onSelectionChange: (selectedFields) => {
                logger.log('Source field selection changed:', selectedFields);
                const mappingsContainer = document.getElementById('mappings-container');
                if (mappingsContainer) {
                    mappingsContainer.style.display = selectedFields.length > 0 ? 'block' : 'none';
                }
                
                // Handle single source field selection
                if (selectedFields.length > 0) {
                    const selectedField = selectedFields[0];
                    
                    // Store the selected source field
                    let hiddenInput = document.getElementById('source-field-hidden');
                    if (!hiddenInput) {
                        hiddenInput = document.createElement('input');
                        hiddenInput.type = 'hidden';
                        hiddenInput.id = 'source-field-hidden';
                        container.appendChild(hiddenInput);
                    }
                    hiddenInput.value = selectedField.id;
                    
                    // Create source field values selector
                    this.createSourceValuesSelector(selectedField);
                    
                    // Skip automatic refresh if we're editing existing mappings
                    if (!this._editingExistingMappings) {
                        // Refresh all existing mapping selectors with new source field options
                        this.refreshAllMappingSelectors();
                    } else {
                        logger.log('Source field selection: Skipping automatic refresh (editing existing mappings)');
                        // Clear the flag after the first selection
                        this._editingExistingMappings = false;
                    }
                } else {
                    // Clear the interface when no field selected
                    this.clearSourceValuesSelector();
                }
            }
        });
        
        // Store reference for cleanup
        if (!this.sourceFieldSelectors) {
            this.sourceFieldSelectors = new Map();
        }
        this.sourceFieldSelectors.set('current', sourceFieldSelector);
        
        logger.log('WorkflowBuilder: EntitySelector initialized for source fields with', availableFields.length, 'fields');
    }

    getAvailableSourceFields(currentStageId = null) {
        // Initialize cache if not exists
        if (!this._sourceFieldsCache) {
            this._sourceFieldsCache = new Map();
        }
        
        // Get current modal context or use provided stage ID
        const modal = document.getElementById('config-modal');
        let stageId = currentStageId;
        let configType = 'stage';
        
        logger.log('getAvailableSourceFields: Starting with currentStageId:', currentStageId);
        logger.log('getAvailableSourceFields: Modal found:', !!modal);
        
        if (!stageId && modal) {
            configType = modal.dataset.configType;
            logger.log('getAvailableSourceFields: Modal configType:', configType);
            logger.log('getAvailableSourceFields: Modal dataset:', modal.dataset);
            
            // Handle different modal types
            if (configType === 'form-field') {
                stageId = modal.dataset.stageId;
                logger.log('getAvailableSourceFields: Form field modal, stageId from dataset:', stageId);
                if (!stageId) {
                    // If no stageId but has actionId, get the stage from the action
                    const actionId = modal.dataset.actionId;
                    logger.log('getAvailableSourceFields: No stageId, trying actionId:', actionId);
                    if (actionId) {
                        const action = this.actions.get(actionId);
                        if (action) {
                            stageId = action.fromStageId;
                            logger.log('getAvailableSourceFields: Got stageId from action:', stageId);
                        }
                    }
                }
            } else {
                stageId = modal.dataset.configId;
                logger.log('getAvailableSourceFields: Other modal type, stageId from configId:', stageId);
            }
        }
        
        logger.log('getAvailableSourceFields: Final stageId:', stageId);
        
        // Handle standalone questions (no stageId) - gather fields from all stages
        if (!stageId) {
            logger.log('getAvailableSourceFields: No stageId found, gathering fields from all stages for standalone question');
            return this.getAllAvailableFields();
        }
        
        // Check cache first
        const cacheKey = `${stageId}-${configType}`;
        if (this._sourceFieldsCache.has(cacheKey)) {
            logger.log('getAvailableSourceFields: Returning cached result for:', cacheKey);
            return this._sourceFieldsCache.get(cacheKey);
        }
        
        const availableFields = [];
        
        if (configType === 'stage' || configType === 'form-field') {
            // Get inherited fields from previous stages/actions
            const inheritedFields = this.getInheritedFieldsForStage(stageId);
            logger.log('getAvailableSourceFields: Inherited fields found:', inheritedFields.length, inheritedFields);
            
            // Get current stage fields (if this is for a stage)
            const currentStage = this.stages.get(stageId);
            let currentStageFields = [];
            if (currentStage && currentStage.formFields) {
                currentStageFields = currentStage.formFields.map(field => ({
                    ...field,
                    id: field.id, // Ensure we use the database UUID
                    key: field.field_key || field.key,
                    label: field.field_label || field.label,
                    type: field.field_type || field.type,
                    source: `Current Stage: ${currentStage.name}`
                }));
                logger.log('getAvailableSourceFields: Current stage fields found:', currentStageFields.length, currentStageFields);
            }
            
            // Get current action fields (if this is for an action)
            let currentActionFields = [];
            if (configType === 'form-field' && modal.dataset.actionId) {
                const currentAction = this.actions.get(modal.dataset.actionId);
                if (currentAction && currentAction.formFields) {
                    currentActionFields = currentAction.formFields.map(field => ({
                        ...field,
                        id: field.id,
                        field_key: field.key || field.field_key,
                        field_label: field.label || field.field_label,
                        field_type: field.type || field.field_type,
                        source: `Current Action: ${currentAction.name}`
                    }));
                    logger.log('getAvailableSourceFields: Current action fields found:', currentActionFields.length, currentActionFields);
                }
            }
            
            // Combine all fields and deduplicate by key
            const allFields = [...inheritedFields, ...currentStageFields, ...currentActionFields];
            logger.log('getAvailableSourceFields: Total fields before deduplication:', allFields.length);
            
            // Deduplicate by field UUID, keeping the first occurrence
            const fieldMap = new Map();
            allFields.forEach(field => {
                const id = field.id;
                if (id && !fieldMap.has(id)) {
                    fieldMap.set(id, field);
                }
            });
            
            const deduplicatedFields = Array.from(fieldMap.values());
            logger.log('getAvailableSourceFields: Fields after deduplication:', deduplicatedFields.length);
            
            // Filter for valid source field types (fields that can have options)
            const validFields = deduplicatedFields.filter(field => {
                const fieldType = field.field_type || field.type;
                return ['dropdown', 'select', 'multiple', 'radio', 'checkbox'].includes(fieldType);
            });
            logger.log('getAvailableSourceFields: Valid source fields after filtering:', validFields.length);
            
            validFields.forEach(field => {
                availableFields.push({
                    id: field.id,
                    key: field.field_key || field.key,
                    label: field.field_label || field.label || 'Unnamed Field',
                    type: field.field_type || field.type
                });
            });
        } else if (configType === 'action') {
            // For actions, get fields from all available stages in the workflow path
            const action = this.actions.get(stageId);
            if (action) {
                const fromStage = this.stages.get(action.fromStageId);
                if (fromStage) {
                    const inheritedFields = this.getInheritedFieldsForStage(fromStage.id);
                    inheritedFields
                        .filter(field => field.field_type === 'dropdown' || field.field_type === 'multiple' || field.field_type === 'smart_dropdown')
                        .forEach(field => {
                            availableFields.push({
                                id: field.id,
                                key: field.field_key,
                                label: `${field.field_label} (${field.source})`,
                                type: field.field_type
                            });
                        });
                }
            }
        }
        
        // Cache the result before returning
        this._sourceFieldsCache.set(cacheKey, availableFields);
        logger.log('getAvailableSourceFields: Cached result for:', cacheKey, 'with', availableFields.length, 'fields');
        
        return availableFields;
    }

    /**
     * Get all available fields from all stages for standalone questions
     */
    getAllAvailableFields() {
        logger.log('getAllAvailableFields: Gathering fields from all stages for standalone question');
        const fieldMap = new Map(); // For deduplication
        
        // Collect fields from all stages
        this.stages.forEach((stage, stageId) => {
            logger.log(`getAllAvailableFields: Processing stage ${stageId}:`, stage.name);
            
            if (stage.formFields && stage.formFields.length > 0) {
                stage.formFields.forEach(field => {
                    const id = field.id;
                    if (id && !fieldMap.has(id)) {
                        fieldMap.set(id, {
                            id: field.id,
                            key: field.field_key || field.key || 'unknown_key',
                            label: field.field_label || field.label || field.field_name || 'Unnamed Field',
                            field_type: field.field_type || field.type,
                            source: `Stage: ${stage.name}`,
                            field_options: field.field_options || {}
                        });
                        logger.log(`getAllAvailableFields: Added field from stage ${stage.name}:`, field.field_label);
                    }
                });
            }
        });

        // Collect fields from all actions  
        const actions = this.localState.getState('actions');
        actions.forEach((action, actionId) => {
            logger.log(`getAllAvailableFields: Processing action ${actionId}:`, action.name);
            
            if (action.formFields && action.formFields.length > 0) {
                action.formFields.forEach(field => {
                    const id = field.id;
                    if (id && !fieldMap.has(id)) {
                        fieldMap.set(id, {
                            id: field.id,
                            key: field.field_key || field.key || 'unknown_key',
                            label: field.field_label || field.label || field.field_name || 'Unnamed Field',
                            field_type: field.field_type || field.type,
                            source: `Action: ${action.name}`,
                            field_options: field.field_options || {}
                        });
                        logger.log(`getAllAvailableFields: Added field from action ${action.name}:`, field.field_label);
                    }
                });
            }
        });
        
        const deduplicatedFields = Array.from(fieldMap.values());
        logger.log('getAllAvailableFields: Total deduplicated fields:', deduplicatedFields.length);
        
        // Filter for valid source field types (fields that can have options)
        const validFields = deduplicatedFields.filter(field => {
            const fieldType = field.field_type || field.type;
            const isValid = ['dropdown', 'select', 'multiple', 'multiple_choice', 'radio', 'checkbox'].includes(fieldType);
            if (isValid) {
                logger.log(`getAllAvailableFields: Valid source field: ${field.label} (${fieldType})`);
            }
            return isValid;
        });
        
        logger.log('getAllAvailableFields: Valid source fields after filtering:', validFields.length);
        
        const availableFields = validFields.map(field => ({
            id: field.id,
            key: field.key,
            label: field.label,
            type: field.field_type,
            source: field.source,
            field_options: field.field_options
        }));
        
        logger.log('getAllAvailableFields: Final available fields:', availableFields);
        return availableFields;
    }

    /**
     * Clear source fields cache when workflow structure changes
     */
    clearSourceFieldsCache() {
        if (this._sourceFieldsCache) {
            this._sourceFieldsCache.clear();
            logger.log('getAvailableSourceFields: Cache cleared');
        }
    }

    /**
     * Find the actual field definition by key in local workflow data
     */
    findFieldDefinition(fieldKey) {
        if (!fieldKey) return null;
        
        // Search in all stages
        for (const [stageId, stage] of this.stages) {
            if (stage.formFields) {
                const field = stage.formFields.find(f => (f.key || f.field_key) === fieldKey);
                if (field) {
                    logger.log(`🔍 Found field "${fieldKey}" in stage "${stage.name}":`, field);
                    return field;
                }
            }
        }
        
        // Search in all actions
        for (const [actionId, action] of this.actions) {
            if (action.formFields) {
                const field = action.formFields.find(f => (f.key || f.field_key) === fieldKey);
                if (field) {
                    logger.log(`🔍 Found field "${fieldKey}" in action "${action.name}":`, field);
                    return field;
                }
            }
        }
        
        logger.warn(`⚠️ Field "${fieldKey}" not found in local workflow data`);
        return null;
    }

    /**
     * Find the actual field definition by UUID in local workflow data
     */
    findFieldDefinitionById(fieldId) {
        if (!fieldId) return null;
        
        // Search in all stages
        for (const [stageId, stage] of this.stages) {
            if (stage.formFields) {
                const field = stage.formFields.find(f => f.id === fieldId);
                if (field) {
                    logger.log(`🔍 Found field with UUID "${fieldId}" in stage "${stage.name}":`, field);
                    return field;
                }
            }
        }
        
        // Search in all actions
        for (const [actionId, action] of this.actions) {
            if (action.formFields) {
                const field = action.formFields.find(f => f.id === fieldId);
                if (field) {
                    logger.log(`🔍 Found field with UUID "${fieldId}" in action "${action.name}":`, field);
                    return field;
                }
            }
        }
        
        logger.warn(`⚠️ Field with UUID "${fieldId}" not found in local workflow data`);
        return null;
    }

    addMapping() {
        const mappingsList = document.getElementById('mappings-list');
        const mappingIndex = mappingsList.children.length;
        const mappingId = `mapping-${mappingIndex}-${Date.now()}`;
        
        const mappingHTML = `
            <div class="mapping-rule" data-index="${mappingIndex}" data-mapping-id="${mappingId}">
                <div class="mapping-condition">
                    <label class="form-label">When source field equals:</label>
                    <div id="mapping-when-${mappingIndex}" class="mapping-when-selector">
                        <!-- EntitySelector for when condition values will be initialized here -->
                    </div>
                    <small class="form-help">Select the value from the source field options</small>
                </div>
                <div class="mapping-options-textarea">
                    <label class="form-label">Show these options:</label>
                    <textarea id="mapping-options-${mappingIndex}" class="form-input" rows="3" placeholder="Option 1&#10;Option 2&#10;Option 3"></textarea>
                </div>
                <div class="mapping-actions">
                    <button type="button" class="btn btn-danger btn-sm" onclick="workflowBuilder.removeMapping('${mappingId}')">
                        🗑️ Remove Mapping
                    </button>
                </div>
            </div>
        `;
        
        mappingsList.insertAdjacentHTML('beforeend', mappingHTML);
        
        // Initialize EntitySelector for when condition only
        setTimeout(() => {
            this.initializeMappingWhenSelector(mappingIndex);
        }, 100);
    }


    initializeMappingWhenSelector(mappingIndex, sourceFieldId = null) {
        const containerId = `mapping-when-${mappingIndex}`;
        const container = document.getElementById(containerId);
        
        if (!container) {
            logger.warn('Mapping when condition container not found:', containerId);
            return;
        }

        // Get the selected source field to determine its options
        if (!sourceFieldId) {
            sourceFieldId = document.getElementById('source-field-hidden')?.value;
        }
        
        const availableSourceFields = this.getAvailableSourceFields();
        const sourceField = availableSourceFields.find(f => f.id === sourceFieldId);
        
        if (!sourceField) {
            logger.warn('No source field selected for mapping condition');
            container.innerHTML = '<p class="text-muted">Please select a source field first</p>';
            return;
        }

        // Get source field options from actual field definition
        let sourceFieldOptions = [];
        const actualFieldDefinition = this.findFieldDefinitionById(sourceFieldId);
        
        if (actualFieldDefinition && (sourceField.type === 'dropdown' || sourceField.type === 'multiple' || sourceField.type === 'select' || sourceField.type === 'radio' || sourceField.type === 'checkbox')) {
            
            if (actualFieldDefinition.options) {
                if (Array.isArray(actualFieldDefinition.options)) {
                    // If options is an array of strings
                    sourceFieldOptions = actualFieldDefinition.options.map((option, index) => ({
                        id: `option_${index}`,
                        name: option,
                        description: `Option from ${sourceField.label}`
                    }));
                } else if (actualFieldDefinition.options.options) {
                    // If options is an object with options array
                    sourceFieldOptions = actualFieldDefinition.options.options.map((option, index) => ({
                        id: `option_${index}`,
                        name: option,
                        description: `Option from ${sourceField.label}`
                    }));
                }
            } else if (actualFieldDefinition.field_options && actualFieldDefinition.field_options.options) {
                // Check field_options.options (database structure)
                sourceFieldOptions = actualFieldDefinition.field_options.options.map((option, index) => ({
                    id: `option_${index}`,
                    name: option,
                    description: `Option from ${sourceField.label}`
                }));
            }
        }
        
        logger.log(`📋 Source field UUID "${sourceFieldId}" has ${sourceFieldOptions.length} options:`, sourceFieldOptions);

        // Create EntitySelector for when condition values
        const whenSelector = new EntitySelector(containerId, {
            tableName: 'dummy', // Not used - we use local data
            localData: sourceFieldOptions, // Use pre-computed local options
            
            // UI configuration
            placeholder: "Select value from source field...",
            label: "When Value Selection",
            entityName: "value",
            entityNamePlural: "values",
            
            // Features - allow both selection and creation for flexibility
            allowCreation: true,
            allowSelection: true,
            showQuickSelect: sourceFieldOptions.length > 0,
            maxSelections: 1, // Only one condition value can be selected
            
            // Custom create data function
            createData: (name) => ({
                id: `value_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: name,
                description: `Custom value: ${name}`
            }),
            
            // Callbacks
            onSelectionChange: (selectedValues) => {
                logger.log(`📋 When condition ${mappingIndex} value changed:`, selectedValues);
                // Store the selected when value in the mapping rule element
                const mappingRule = container.closest('.mapping-rule');
                if (mappingRule && selectedValues.length > 0) {
                    mappingRule.dataset.whenValue = selectedValues[0].name;
                }
            },
            
            onEntityCreate: (newEntity) => {
                logger.log(`➕ New when condition value created for mapping ${mappingIndex}:`, newEntity);
                return newEntity;
            }
        });
        
        // Override the entities with source field options
        whenSelector.entities = sourceFieldOptions;
        whenSelector.selectedEntities = [];
        
        // Render directly without database load
        whenSelector.render();
        whenSelector.setupEventListeners();
        
        // Store reference for later cleanup
        if (!this.mappingWhenSelectors) {
            this.mappingWhenSelectors = new Map();
        }
        this.mappingWhenSelectors.set(mappingIndex, whenSelector);
        
        logger.log(`✅ EntitySelector initialized for when condition ${mappingIndex} with ${sourceFieldOptions.length} options`);
    }

    /**
     * Refresh all existing mapping selectors when source field changes
     */
    refreshAllMappingSelectors() {
        const mappingsList = document.getElementById('mappings-list');
        if (!mappingsList) return;

        // Find all existing mapping when selectors
        const mappingElements = mappingsList.querySelectorAll('.mapping-rule');
        
        if (mappingElements.length === 0) {
            // If no mappings exist yet, automatically add one
            logger.log('🔄 No existing mappings found, creating first mapping automatically');
            this.addMapping();
            return;
        }
        
        mappingElements.forEach((mappingElement, index) => {
            const whenContainer = mappingElement.querySelector('.mapping-when-selector');
            if (whenContainer) {
                // Re-initialize the when selector with the new source field options
                const mappingIndex = whenContainer.id.replace('mapping-when-', '');
                this.initializeMappingWhenSelector(mappingIndex);
            }
        });
        
        logger.log(`🔄 Refreshed ${mappingElements.length} mapping selectors with updated source field options`);
    }

    /**
     * Create source values selector for a single source field
     */
    createSourceValuesSelector(sourceField) {
        const mappingsContainer = document.getElementById('mappings-container');
        if (!mappingsContainer) return;

        // Get the field definition to extract its options
        const fieldDefinition = this.findFieldDefinitionById(sourceField.id);
        let sourceOptions = [];

        if (fieldDefinition && fieldDefinition.field_options && fieldDefinition.field_options.options) {
            sourceOptions = fieldDefinition.field_options.options;
        } else if (fieldDefinition && fieldDefinition.options) {
            sourceOptions = fieldDefinition.options;
        }

        logger.log('🎯 Source field options found:', sourceOptions);

        // Create the values selector HTML
        const selectorHTML = this.renderSourceValuesSelectorHTML(sourceField, sourceOptions);
        mappingsContainer.innerHTML = selectorHTML;

        // Store reference for later use
        this._selectedSourceField = sourceField;
        this._sourceFieldOptions = sourceOptions;

        // Initialize empty mappings for all options (empty = no condition)
        this._tabbedMappings = {};
        sourceOptions.forEach(option => {
            this._tabbedMappings[option] = {
                when: option,
                options: [] // Empty by default - no condition
            };
        });

        // Populate existing mappings into the tabbed interface if available
        if (this.currentMappings && this.currentMappings.length > 0) {
            this.populateExistingMappingsInTabs();
        }

        logger.log('🎯 Created source values selector for field:', sourceField.name);
    }

    /**
     * Populate existing mappings into the tabbed interface
     */
    populateExistingMappingsInTabs() {
        logger.log('populateExistingMappingsInTabs: Populating existing mappings:', this.currentMappings);

        // Wait a bit for the DOM to be ready
        setTimeout(() => {
            this.currentMappings.forEach(mapping => {
                const { when, options } = mapping;
                logger.log(`populateExistingMappingsInTabs: Processing mapping for "${when}":`, options);

                // Find the textarea for this tab
                const tabContent = document.querySelector(`[data-tab-content="${when}"]`);
                if (tabContent) {
                    const textarea = tabContent.querySelector('textarea');
                    if (textarea) {
                        textarea.value = (options || []).join('\n');
                        // Update the tabbed mappings state
                        this._tabbedMappings[when] = { when, options: options || [] };
                        logger.log(`populateExistingMappingsInTabs: Populated textarea for "${when}" with:`, textarea.value);
                    } else {
                        logger.warn(`populateExistingMappingsInTabs: Textarea not found for tab "${when}"`);
                    }
                } else {
                    logger.warn(`populateExistingMappingsInTabs: Tab content not found for "${when}"`);
                }
            });
        }, 100);
    }

    /**
     * Render source values selector HTML with auto-populated tabs
     */
    renderSourceValuesSelectorHTML(sourceField, sourceOptions) {
        if (!sourceOptions || sourceOptions.length === 0) {
            return '<p class="no-mappings-message">Selected source field has no options available</p>';
        }

        // Create tabs for all available options
        const tabs = sourceOptions.map((option, index) => `
            <div class="mapping-tab ${index === 0 ? 'active' : ''}" 
                 data-tab="${option}" 
                 onclick="workflowBuilder.switchMappingTab('${option}')">
                ${option}
            </div>
        `).join('');

        const tabContents = sourceOptions.map((option, index) => `
            <div class="mapping-tab-content ${index === 0 ? 'active' : ''}" 
                 data-tab-content="${option}">
                <div class="mapping-options">
                    <label>Options for "${option}":</label>
                    <textarea onchange="workflowBuilder.updateTabbedMappingOptions('${option}', this.value)"
                              placeholder="Leave empty for no condition&#10;Or enter options, one per line"
                              rows="5"></textarea>
                    <small class="form-help">Leave empty to skip this condition, or enter options (one per line)</small>
                </div>
            </div>
        `).join('');

        return `
            <div class="source-values-selector">
                <h4>Configure options for "${sourceField.name}" values:</h4>
                <div class="tabbed-mappings-container">
                    <div class="tabbed-mappings">
                        <div class="mapping-tabs">
                            ${tabs}
                        </div>
                        <div class="mapping-tab-contents">
                            ${tabContents}
                        </div>
                    </div>
                </div>
            </div>
        `;
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

        logger.log('🔄 Switched to mapping tab:', tabKey);
    }


    /**
     * Update options for a specific tabbed mapping
     */
    updateTabbedMappingOptions(tabKey, optionsText) {
        if (!this._tabbedMappings) this._tabbedMappings = {};
        
        // Parse options from textarea - empty means no condition
        const options = optionsText.trim() ? 
            optionsText.split('\n').map(o => o.trim()).filter(o => o.length > 0) : [];
        
        if (!this._tabbedMappings[tabKey]) {
            this._tabbedMappings[tabKey] = { when: tabKey, options: [] };
        }
        
        this._tabbedMappings[tabKey].options = options;
        
        if (options.length > 0) {
            logger.log('📝 Updated tabbed mapping options for', tabKey, ':', options);
        } else {
            logger.log('📝 Cleared mapping options for', tabKey, '(no condition)');
        }
    }

    /**
     * Clear the source values selector interface
     */
    clearSourceValuesSelector() {
        const mappingsContainer = document.getElementById('mappings-container');
        if (mappingsContainer) {
            mappingsContainer.innerHTML = '<p class="no-mappings-message">Select a source field to configure mappings</p>';
        }
        
        this._selectedSourceField = null;
        this._sourceFieldOptions = null;
        this._tabbedMappings = null;
        
        logger.log('🧹 Cleared source values selector interface');
    }

    /**
     * Get tabbed mappings data for form saving (only non-empty conditions)
     */
    getTabbedMappingsData() {
        if (!this._tabbedMappings) return [];
        
        // Only return mappings that have options (non-empty conditions)
        return Object.values(this._tabbedMappings).filter(mapping => 
            mapping.options && mapping.options.length > 0
        );
    }

    removeMapping(mappingId) {
        const mappingRule = document.querySelector(`[data-mapping-id="${mappingId}"]`);
        if (mappingRule) {
            const mappingIndex = parseInt(mappingRule.dataset.index);
            
            // Track for database deletion
            this.localState.trackDeletedMapping(mappingId);
            
            // Clean up EntitySelectors (options selector no longer used, but keep for safety)
            
            if (this.mappingWhenSelectors && this.mappingWhenSelectors.has(mappingIndex)) {
                const whenSelector = this.mappingWhenSelectors.get(mappingIndex);
                if (whenSelector && whenSelector.destroy) {
                    whenSelector.destroy();
                }
                this.mappingWhenSelectors.delete(mappingIndex);
            }
            
            mappingRule.remove();
            logger.log(`🗑️ Mapping ${mappingId} removed`);
        }
    }

    transformToCustomTable() {
        const options = document.getElementById('field-options')?.value;
        if (!options?.trim()) {
            app.showNotification('warning', 'Warning', 'Add some options first before converting to custom table');
            return;
        }

        const optionsList = options.split('\n').filter(o => o.trim());
        if (optionsList.length === 0) {
            app.showNotification('warning', 'Warning', 'Add some options first before converting to custom table');
            return;
        }

        // Create custom table automatically
        const fieldLabel = document.getElementById('field-label')?.value || 'Untitled Field';
        const tableName = fieldLabel.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() + '_table';
        const displayName = fieldLabel + ' Options';
        const mainColumn = fieldLabel.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

        this.createCustomTableFromOptions(optionsList, tableName, displayName, mainColumn, fieldLabel);
    }

    async createCustomTableFromOptions(optionsList, tableName, displayName, mainColumn, fieldLabel) {
        try {
            app.showNotification('info', 'Converting...', 'Creating custom table and converting field...');

            // 1. Create custom table
            const { data: tableData, error: tableError } = await supabaseClient.client
                .from('custom_tables')
                .insert([{
                    project_id: this.projectId,
                    table_name: tableName,
                    display_name: displayName,
                    main_column: mainColumn,
                    description: `Auto-generated from dropdown field: ${fieldLabel}`
                }])
                .select('id')
                .single();

            if (tableError) throw tableError;

            // 2. Create initial data rows from dropdown options
            const rowsData = optionsList.map(option => {
                const rowData = {};
                rowData[mainColumn] = option;
                return {
                    table_id: tableData.id,
                    row_data: rowData
                };
            });

            const { error: dataError } = await supabaseClient.client
                .from('custom_table_data')
                .insert(rowsData);

            if (dataError) throw dataError;

            // 2.5. Create main column definition (CRITICAL: Required for table display)
            const { error: columnError } = await supabaseClient.client
                .from('custom_table_columns')
                .insert([{
                    table_id: tableData.id,
                    column_name: mainColumn,
                    column_type: 'text',
                    is_required: false,
                    default_value: null
                }]);

            if (columnError) throw columnError;

            // 3. Convert field type to custom_table_selector
            document.getElementById('field-type').value = 'custom_table_selector';
            
            // Hide options textarea and show custom table configuration
            document.getElementById('field-options-group').style.display = 'none';
            
            // Create and show custom table configuration
            if (!document.getElementById('custom-table-group')) {
                this.addCustomTableConfigurationSection();
            }
            document.getElementById('custom-table-group').style.display = 'block';
            
            // Store table reference
            document.getElementById('custom-table-id').value = tableData.id;
            document.getElementById('custom-table-display').textContent = displayName;

            // Update field type selection UI
            this.updateFieldConfigurationSections('custom_table_selector', this.fieldTypes['custom_table_selector']);

            app.showNotification('success', 'Conversion Complete', `Successfully converted to custom table: ${displayName}`);

        } catch (error) {
            console.error('Custom table conversion failed:', error);
            app.showNotification('error', 'Conversion Failed', 'Failed to create custom table: ' + error.message);
        }
    }

    selectCustomTable() {
        // TODO: Implement custom table selector modal
        app.showNotification('info', 'Coming Soon', 'Custom table selection modal will be implemented');
    }

    editCustomTable() {
        const tableId = document.getElementById('custom-table-id')?.value;
        if (!tableId) {
            app.showNotification('warning', 'No Table', 'No custom table selected');
            return;
        }
        
        // TODO: Open custom table editor
        app.showNotification('info', 'Coming Soon', 'Custom table editor will be implemented');
    }

    // =====================================================
    // ENHANCED TOOLBAR FUNCTIONALITY
    // =====================================================

    createSnapshot(name = null) {
        const snapshotName = name || `Snapshot ${new Date().toLocaleString()}`;
        const snapshotData = {
            id: 'snapshot_' + Date.now(),
            name: snapshotName,
            timestamp: Date.now(),
            workflow: { ...this.workflow },
            stages: Array.from(this.stages.values()),
            actions: Array.from(this.actions.values())
        };

        this.snapshots.set(snapshotData.id, snapshotData);
        app.showNotification('success', 'Snapshot Created', `Snapshot "${snapshotName}" created successfully`);
        return snapshotData;
    }

    showSnapshotMenu() {
        const sidebar = document.querySelector('.workflow-preview-sidebar .preview-sidebar-content');
        if (!sidebar) {
            logger.warn('No sidebar available for snapshot menu');
            return;
        }
        
        const snapshotList = Array.from(this.snapshots.values()).map(snapshot => `
            <div class="snapshot-item">
                <div class="snapshot-name">${snapshot.name}</div>
                <div class="snapshot-date">${new Date(snapshot.timestamp).toLocaleString()}</div>
                <div class="snapshot-actions">
                    <button type="button" class="btn btn-sm btn-secondary" onclick="workflowBuilder.restoreSnapshot('${snapshot.name}')">Restore</button>
                    <button type="button" class="btn btn-sm btn-danger" onclick="workflowBuilder.deleteSnapshot('${snapshot.name}')">Delete</button>
                </div>
            </div>
        `).join('');
        
        const snapshotPanel = document.createElement('div');
        snapshotPanel.className = 'snapshot-panel';
        snapshotPanel.innerHTML = `
            <div class="snapshot-header">
                <h3>Snapshots (${this.snapshots.size})</h3>
                <div class="snapshot-header-actions">
                    <button type="button" class="btn btn-sm btn-primary" onclick="workflowBuilder.takeSnapshot()">New Snapshot</button>
                    <button type="button" class="btn btn-sm btn-secondary" onclick="this.parentElement.parentElement.parentElement.remove()">Close</button>
                </div>
            </div>
            <div class="snapshot-content">
                ${this.snapshots.size > 0 ? snapshotList : '<p class="text-muted">No snapshots available</p>'}
            </div>
        `;
        
        sidebar.appendChild(snapshotPanel);
        snapshotPanel.scrollIntoView({ behavior: 'smooth' });
    }
    
    /**
     * Delete a snapshot
     */
    deleteSnapshot(snapshotName) {
        if (confirm(`Are you sure you want to delete snapshot "${snapshotName}"?`)) {
            this.snapshots.delete(snapshotName);
            this.localState.trackDeletedSnapshot(snapshotName); // Track for database deletion
            app.showNotification('success', 'Snapshot Deleted', 'Snapshot deleted successfully');
            
            // Refresh snapshot menu if open
            const existingPanel = document.querySelector('.snapshot-panel');
            if (existingPanel) {
                existingPanel.remove();
                this.showSnapshotMenu();
            }
        }
    }
    
    /**
     * Restore from snapshot
     */
    restoreSnapshot(snapshotName) {
        const snapshot = this.snapshots.get(snapshotName);
        if (!snapshot) {
            app.showNotification('error', 'Snapshot Not Found', 'The requested snapshot could not be found');
            return false;
        }
        
        if (confirm(`Are you sure you want to restore snapshot "${snapshotName}"? This will overwrite your current work.`)) {
            // Save current state to undo stack first
            this.saveToUndoStack();
            
            // Restore state from snapshot
            this.workflow = JSON.parse(JSON.stringify(snapshot.workflow));
            this.stages = new Map(snapshot.stages.map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
            this.actions = new Map(snapshot.actions.map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
            this.viewport = { ...snapshot.viewport };
            this.stageCounter = snapshot.stageCounter;
            this.actionCounter = snapshot.actionCounter;
            
            // Re-render workflow
            this.renderWorkflow();
            this.updateDataFlow();
            
            app.showNotification('success', 'Snapshot Restored', `Snapshot "${snapshotName}" has been restored`);
            return true;
        }
        
        return false;
    }

    exportJSON() {
        const exportData = this.getEnhancedExportData();

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `workflow_${this.workflow.name.replace(/[^a-z0-9]/gi, '_')}_v2.json`;
        a.click();
        URL.revokeObjectURL(url);

        app.showNotification('success', 'Export Complete', 'Enhanced workflow exported successfully');
    }

    importFromText() {
        app.showNotification('info', 'Feature Coming Soon', 'Import functionality will be implemented in the next phase');
    }

    undo() {
        if (this.undoStack.length === 0) {
            app.showNotification('info', 'Nothing to Undo', 'No actions to undo');
            return false;
        }
        
        // Save current state to redo stack
        const currentState = {
            workflow: JSON.parse(JSON.stringify(this.workflow)),
            stages: Array.from(this.stages.entries()),
            actions: Array.from(this.actions.entries()),
            viewport: { ...this.viewport },
            stageCounter: this.stageCounter,
            actionCounter: this.actionCounter
        };
        this.redoStack.push(currentState);
        
        // Restore previous state
        const previousState = this.undoStack.pop();
        this.restoreState(previousState);
        
        app.showNotification('success', 'Undone', 'Last action has been undone');
        return true;
    }

    redo() {
        if (this.redoStack.length === 0) {
            app.showNotification('info', 'Nothing to Redo', 'No actions to redo');
            return false;
        }
        
        // Save current state to undo stack
        this.saveToUndoStack();
        
        // Restore next state
        const nextState = this.redoStack.pop();
        this.restoreState(nextState);
        
        app.showNotification('success', 'Redone', 'Action has been redone');
        return true;
    }
    
    /**
     * Render complete workflow
     */
    renderWorkflow() {
        logger.log('renderWorkflow called - canvas available:', !!this.canvas);
        
        if (!this.canvas) {
            logger.warn('renderWorkflow: Canvas not found');
            return;
        }
        
        // Clear existing nodes and connections, but preserve canvas structure
        const nodesContainer = this.canvas.querySelector('.workflow-nodes');
        const connectionsContainer = this.canvas.querySelector('.workflow-connections');
        
        if (nodesContainer) {
            nodesContainer.innerHTML = '';
        }
        if (connectionsContainer) {
            // Clear connections but preserve coordinate system
            const coordSystem = connectionsContainer.querySelector('#coordinate-system');
            connectionsContainer.innerHTML = '';
            if (coordSystem) {
                connectionsContainer.appendChild(coordSystem);
            }
        }
        
        this.nodes.clear();
        this.connections.clear();
        
        logger.log('Rendering workflow with', this.stages.size, 'stages and', this.actions.size, 'actions');
        logger.log('Stages available:', Array.from(this.stages.entries()).map(([id, stage]) => ({ id, name: stage.name })));
        logger.log('Actions available:', Array.from(this.actions.entries()).map(([id, action]) => ({ 
            id, 
            name: action.name, 
            type: action.type,
            fromStageId: action.fromStageId, 
            toStageId: action.toStageId 
        })));
        
        // Render all stages
        this.stages.forEach(stage => {
            logger.log('Rendering stage:', stage.name, 'at', stage.x, stage.y);
            this.renderStage(stage);
        });
        
        // Render all actions (connections and edit indicators)
        this.renderAllActions();
        
        // Update canvas transform
        this.updateCanvasTransform();
        
        // Force a final connection update after everything is rendered
        requestAnimationFrame(() => {
            this.updateAllConnections();
        });
        
        logger.log('renderWorkflow completed');
    }
    
    /**
     * Restore workflow state
     */
    restoreState(state) {
        this.workflow = JSON.parse(JSON.stringify(state.workflow));
        this.stages = new Map(state.stages.map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
        this.actions = new Map(state.actions.map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
        this.viewport = { ...state.viewport };
        this.stageCounter = state.stageCounter;
        this.actionCounter = state.actionCounter;
        
        // Re-render workflow
        this.renderWorkflow();
        this.updateDataFlow();
    }
    
    /**
     * Save current state to undo stack
     */
    saveToUndoStack() {
        const state = {
            workflow: JSON.parse(JSON.stringify(this.workflow)),
            stages: Array.from(this.stages.entries()),
            actions: Array.from(this.actions.entries()),
            viewport: { ...this.viewport },
            stageCounter: this.stageCounter,
            actionCounter: this.actionCounter
        };
        
        this.undoStack.push(state);
        this.redoStack = []; // Clear redo stack
        
        // Keep only last 20 undo states
        if (this.undoStack.length > 20) {
            this.undoStack.shift();
        }
    }

    zoomIn() {
        this.viewport.zoom = Math.min(this.viewport.zoom * 1.2, 3);
        this.updateCanvasTransform();
    }

    zoomOut() {
        this.viewport.zoom = Math.max(this.viewport.zoom / 1.2, 0.3);
        this.updateCanvasTransform();
    }

    resetZoom() {
        this.viewport.zoom = 1;
        this.viewport.panX = 0;
        this.viewport.panY = 0;
        this.updateCanvasTransform();
    }
    
    /**
     * Handle window resize to update connection positions
     */
    handleWindowResize() {
        // Update connections when window is resized
        // Use debounced approach to avoid excessive re-rendering
        if (this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
        }
        
        this.resizeTimeout = setTimeout(() => {
            this.updateAllConnections();
        }, 50); // Reduced debounce time for more responsive updates
    }
    
    /**
     * Throttled update for real-time performance during interactions
     */
    throttledUpdateConnections(callback) {
        if (this.updateThrottleTimeout) {
            return; // Skip if already pending
        }
        
        this.updateThrottleTimeout = requestAnimationFrame(() => {
            callback();
            this.updateThrottleTimeout = null;
        });
    }
    
    /**
     * Cleanup event listeners when destroying the workflow builder
     */
    cleanup() {
        // Cleanup preview sidebar
        if (this.previewSidebar) {
            this.previewSidebar.destroy();
            this.previewSidebar = null;
        }
        
        // Remove window event listeners
        if (this.windowResizeHandler) {
            window.removeEventListener('resize', this.windowResizeHandler);
        }
        
        // Clear timeouts
        if (this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
        }
        
        if (this.updateThrottleTimeout) {
            cancelAnimationFrame(this.updateThrottleTimeout);
        }
        
        // Clean up mutation observer
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }
        
        logger.log('Workflow builder cleaned up');
    }

    toggleActionOverview() {
        const bar = document.getElementById('actionOverviewBar');
        if (bar) {
            bar.style.display = bar.style.display === 'none' ? 'block' : 'none';
            this.updateActionOverview();
        }
    }

    updateActionOverview() {
        const list = document.getElementById('actionOverviewList');
        const count = document.getElementById('actionCount');
        
        if (!list || !count) return;

        const actions = Array.from(this.actions.values());
        count.textContent = `${actions.length} action${actions.length !== 1 ? 's' : ''}`;

        list.innerHTML = actions.map(action => `
            <div class="action-overview-item" onclick="workflowBuilder.focusOnAction('${action.id}')">
                ${action.name} (${action.fromStageId} → ${action.toStageId})
            </div>
        `).join('');
    }

    focusOnAction(actionId) {
        const action = this.actions.get(actionId);
        if (action) {
            // Focus on the action connection
            const connection = this.connections.get(actionId);
            if (connection) {
                connection.classList.add('highlighted');
                setTimeout(() => connection.classList.remove('highlighted'), 2000);
            }
        }
    }

    showDataFlow() {
        const sidebar = document.querySelector('.workflow-preview-sidebar .preview-sidebar-content');
        if (!sidebar) {
            logger.warn('No sidebar available for data flow display');
            return;
        }
        
        const dataFlowHTML = this.renderDataFlowTable();
        
        // Create data flow panel
        const dataFlowPanel = document.createElement('div');
        dataFlowPanel.className = 'data-flow-panel';
        dataFlowPanel.innerHTML = `
            <div class="data-flow-header">
                <h3>Data Flow Analysis</h3>
                <button type="button" class="btn btn-secondary btn-sm" onclick="this.parentElement.parentElement.remove()">Close</button>
            </div>
            <div class="data-flow-content">
                ${dataFlowHTML}
            </div>
        `;
        
        // Add to sidebar
        sidebar.appendChild(dataFlowPanel);
        
        // Auto-scroll to show the panel
        dataFlowPanel.scrollIntoView({ behavior: 'smooth' });
    }

    showHelp(element) {
        const tooltip = element.querySelector('.help-tooltip');
        if (tooltip) {
            tooltip.classList.add('show');
        }
    }

    hideHelp() {
        const tooltips = document.querySelectorAll('.help-tooltip');
        tooltips.forEach(tooltip => tooltip.classList.remove('show'));
    }

    editFormField(fieldId) {
        // Get current modal context
        const modal = document.getElementById('config-modal');
        const configId = modal.dataset.configId;
        const configType = modal.dataset.configType;
        
        if (configType === 'stage') {
            const stage = this.stages.get(configId);
            if (stage && stage.formFields) {
                const fieldIndex = stage.formFields.findIndex(f => f.id === fieldId);
                const field = stage.formFields[fieldIndex];
                if (field) {
                    // Use the exact same interface as Add Form Field but pre-populate with existing data
                    this.openFormFieldModal(configId, null, field, fieldIndex);
                }
            }
        } else if (configType === 'action') {
            const action = this.localState.getState('actions').get(configId);
            if (action && action.formFields) {
                const fieldIndex = action.formFields.findIndex(f => f.id === fieldId);
                const field = action.formFields[fieldIndex];
                if (field) {
                    // Use the exact same interface as Add Form Field but pre-populate with existing data
                    this.openFormFieldModal(null, configId, field, fieldIndex);
                }
            }
        }
    }

    /**
     * Normalize field data to FormBuilder-compatible format
     */
    normalizeFieldForFormBuilder(field) {
        const normalizedField = { ...field };
        
        // Ensure proper property names
        normalizedField.field_key = field.field_key || field.key;
        normalizedField.field_label = field.field_label || field.label;
        normalizedField.field_type = field.field_type || field.type;
        normalizedField.is_required = field.is_required !== undefined ? field.is_required : field.required;
        normalizedField.help_text = field.help_text || field.help;
        normalizedField.field_order = field.field_order || field.order;
        
        // Normalize field_options structure
        if (!normalizedField.field_options) {
            normalizedField.field_options = {};
        }
        
        // Handle options for dropdown/multiple choice fields
        if (['dropdown', 'multiple', 'select', 'radio', 'checkbox'].includes(normalizedField.field_type)) {
            if (field.options && Array.isArray(field.options)) {
                // Legacy format: field.options is an array
                normalizedField.field_options.options = field.options;
                normalizedField.field_options.allow_other = field.allow_other || false;
                normalizedField.field_options.randomize_order = field.randomize_order || false;
            } else if (field.field_options && field.field_options.options) {
                // Already in correct format, ensure all properties exist
                normalizedField.field_options.allow_other = normalizedField.field_options.allow_other || false;
                normalizedField.field_options.randomize_order = normalizedField.field_options.randomize_order || false;
            }
        }
        
        // Handle smart dropdown mappings
        if (normalizedField.field_type === 'smart_dropdown') {
            if (!normalizedField.field_options.source_type) {
                normalizedField.field_options.source_type = 'field';
            }
            if (!normalizedField.field_options.mappings) {
                normalizedField.field_options.mappings = [];
            }
            if (!normalizedField.field_options.allow_create) {
                normalizedField.field_options.allow_create = false;
            }
        }
        
        // Don't set ID for new fields - let Supabase generate it
        // Only keep existing IDs for updates
        
        return normalizedField;
    }

    /**
     * Generate UUID compatible across all browsers
     */
    generateUUID() {
        if (crypto.randomUUID) {
            return crypto.randomUUID();
        }
        // Fallback for older browsers
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Convert database field type to frontend field type for openFormFieldModal (uses this.fieldTypes)
     */
    dbFieldTypeToFieldTypes(dbFieldType) {
        const mapping = {
            'short_text': 'short',
            'long_text': 'long',
            'multiple_choice': 'multiple',
            'dropdown': 'dropdown',
            'date': 'date',
            'file': 'file',
            'number': 'number',
            'email': 'email',
            'smart_dropdown': 'smart_dropdown',
            'signature': 'signature'
        };
        return mapping[dbFieldType] || dbFieldType || 'short';
    }




    async removeFormField(fieldId) {
        const modal = document.getElementById('config-modal');
        const configId = modal.dataset.configId;
        const configType = modal.dataset.configType;
        
        if (configType === 'stage') {
            const stage = this.stages.get(configId);
            if (stage && stage.formFields) {
                const field = stage.formFields.find(f => f.id === fieldId);
                if (field && confirm(`Are you sure you want to remove the field "${field.field_label}"?`)) {
                    try {
                        // First, delete from database if the field exists in database
                        if (this.databaseAdapter && this.databaseAdapter.formService) {
                            await this.databaseAdapter.formService.deleteField(fieldId);
                            logger.log('Field deleted from database:', fieldId);
                        }
                        
                        // Then remove from FormBuilder to maintain proper synchronization
                        if (this.formBuilder && this.formBuilder.removeField(fieldId)) {
                            // FormBuilder handles the removal and triggers callbacks
                            // The handleFormFieldsChange callback will sync back to stage.formFields
                            this.updateStageVisual(configId);
                            // Clear cache since workflow structure changed
                            this.clearSourceFieldsCache();
                            await this.openStageConfigModal(stage);
                            app.showNotification('success', 'Success', 'Form field removed successfully');
                        } else {
                            // Fallback: direct removal if FormBuilder is not available
                            stage.formFields = stage.formFields.filter(f => f.id !== fieldId);
                            this.updateStageVisual(configId);
                            // Clear cache since workflow structure changed
                            this.clearSourceFieldsCache();
                            await this.openStageConfigModal(stage);
                            app.showNotification('success', 'Success', 'Form field removed successfully');
                        }
                    } catch (error) {
                        logger.error('Error removing field:', error);
                        if (error.message.includes('existing customer data')) {
                            app.showNotification('error', 'Cannot Delete Field', 'This field has existing customer data and cannot be deleted. Please remove the data references first.');
                        } else {
                            app.showNotification('error', 'Delete Failed', 'Failed to delete field: ' + error.message);
                        }
                    }
                }
            }
        } else if (configType === 'action') {
            const action = this.localState.getState('actions').get(configId);
            if (action && action.formFields) {
                const field = action.formFields.find(f => f.id === fieldId);
                if (field && confirm(`Are you sure you want to remove the field "${field.field_label}"?`)) {
                    try {
                        // First, delete from database if the field exists in database
                        if (this.databaseAdapter && this.databaseAdapter.formService) {
                            await this.databaseAdapter.formService.deleteField(fieldId);
                            logger.log('Field deleted from database:', fieldId);
                        }
                        
                        // Then use FormBuilder's removeField method for actions too
                        if (this.formBuilder && this.formBuilder.removeField(fieldId)) {
                            // FormBuilder handles the removal and triggers callbacks
                            // Clear cache since workflow structure changed
                            this.clearSourceFieldsCache();
                            await this.openActionConfigModal(action);
                            app.showNotification('success', 'Success', 'Form field removed successfully');
                        } else {
                            // Fallback: direct removal if FormBuilder is not available
                            const updatedFormFields = action.formFields.filter(f => f.id !== fieldId);
                            this.localState.updateAction(configId, { formFields: updatedFormFields });
                            // Clear cache since workflow structure changed
                            this.clearSourceFieldsCache();
                            await this.openActionConfigModal(action);
                            app.showNotification('success', 'Success', 'Form field removed successfully');
                        }
                    } catch (error) {
                        logger.error('Error removing field:', error);
                        if (error.message.includes('existing customer data')) {
                            app.showNotification('error', 'Cannot Delete Field', 'This field has existing customer data and cannot be deleted. Please remove the data references first.');
                        } else {
                            app.showNotification('error', 'Delete Failed', 'Failed to delete field: ' + error.message);
                        }
                    }
                }
            }
        }
    }
    
    // =====================================================
    // DATA FLOW ANALYSIS - ADVANCED METHODS
    // =====================================================
    
    /**
     * Calculate data flow for a specific stage
     */
    calculateStageDataFlow(stage) {
        const stageData = {
            nodeId: stage.id,
            stageName: stage.name,
            stageKey: stage.key,
            stageType: stage.type,
            stageOrder: stage.stageOrder || 0,
            availableFields: [],
            inheritedFields: [],
            newFields: [],
            totalFieldCount: 0,
            fieldSources: {},
            conflicts: [],
            dataQuality: {
                completeness: 0,
                consistency: 1,
                accuracy: 1,
                overall: 0
            }
        };
        
        // Get inherited fields from previous stages
        const inheritedFields = this.getInheritedFields(stage);
        stageData.inheritedFields = inheritedFields;
        
        // Get new fields added at this stage
        const newFields = this.getNewFieldsAtStage(stage);
        stageData.newFields = newFields;
        
        // Combine all available fields
        stageData.availableFields = [...inheritedFields, ...newFields];
        stageData.totalFieldCount = stageData.availableFields.length;
        
        // Calculate data quality metrics
        stageData.dataQuality = this.calculateDataQualityMetrics(stageData);
        
        return stageData;
    }
    
    /**
     * Get fields inherited from previous stages
     */
    getInheritedFields(targetStage) {
        logger.log('getInheritedFields called for stage:', targetStage);
        const inheritedFields = [];
        const visited = new Set();
        
        // Recursive function to get all fields available to a stage
        const collectFieldsRecursively = (stage) => {
            logger.log(`🔍 collectFieldsRecursively processing stage: ${stage.name} (${stage.id})`);
            if (visited.has(stage.id)) {
                logger.log('Stage already visited, skipping:', stage.id);
                return;
            }
            visited.add(stage.id);
            
            // If this is a start stage, add its initial fields
            if (stage.type === 'start' && stage.formFields) {
                logger.log(`🔍 Start stage found with ${stage.formFields.length} form fields:`, stage.formFields);
                stage.formFields.forEach(field => {
                    inheritedFields.push({
                        ...field,
                        source: `Start Stage: ${stage.name}`,
                        sourceStage: stage.id,
                        sourceType: 'initial_form',
                        inherited: true
                    });
                });
            } else {
                logger.log(`🔍 Stage type: ${stage.type}, formFields: ${stage.formFields ? stage.formFields.length : 'none'}`);
            }
            
            // Find incoming actions to this stage
            const incomingActions = Array.from(this.actions.values())
                .filter(action => action.toStageId === stage.id);
            
            incomingActions.forEach(action => {
                const fromStage = this.stages.get(action.fromStageId);
                if (fromStage) {
                    // Recursively collect fields from the source stage
                    collectFieldsRecursively(fromStage);
                    
                    // Add fields from the action itself (if any)
                    if (action.formFields && action.formFields.length > 0) {
                        action.formFields.forEach(field => {
                            inheritedFields.push({
                                ...field,
                                source: `Action: ${action.name}`,
                                sourceStage: fromStage.id,
                                sourceType: 'action_form',
                                actionId: action.id,
                                inherited: true
                            });
                        });
                    }
                }
            });
        };
        
        // Start collection from the target stage (but don't include its own fields)
        const incomingActions = Array.from(this.actions.values())
            .filter(action => action.toStageId === targetStage.id);
        
        logger.log(`🔍 Target stage ${targetStage.name} has ${incomingActions.length} incoming actions:`, incomingActions);
        logger.log('All actions in workflow:', Array.from(this.actions.values()));
        
        // First, collect fields from all incoming actions and their source stages
        incomingActions.forEach(action => {
            const fromStage = this.stages.get(action.fromStageId);
            if (fromStage) {
                // Recursively collect all fields available to the source stage
                collectFieldsRecursively(fromStage);
                
                // Add fields from this action
                if (action.formFields && action.formFields.length > 0) {
                    action.formFields.forEach(field => {
                        inheritedFields.push({
                            ...field,
                            source: `Action: ${action.name}`,
                            sourceStage: fromStage.id,
                            sourceType: 'action_form',
                            actionId: action.id,
                            inherited: true
                        });
                    });
                }
            }
        });
        
        // IMPORTANT: Always ensure start stages are included, even if not connected via actions
        // This fixes the issue where initial stage fields are not inherited
        const startStages = Array.from(this.stages.values()).filter(stage => stage.type === 'start');
        startStages.forEach(startStage => {
            if (!visited.has(startStage.id)) {
                logger.log(`🔍 Including unvisited start stage: ${startStage.name}`);
                collectFieldsRecursively(startStage);
            }
        });
        
        return this.deduplicateFormFields(inheritedFields);
    }
    
    /**
     * Get new fields added at this specific stage
     */
    getNewFieldsAtStage(stage) {
        const newFields = [];
        
        // For start stages, include initial form fields
        if (stage.type === 'start' && stage.formFields) {
            stage.formFields.forEach(field => {
                newFields.push({
                    ...field,
                    source: 'Initial Form',
                    sourceStage: stage.id,
                    sourceType: 'initial_form',
                    inherited: false
                });
            });
        }
        
        // Include fields from actions originating at this stage
        const outgoingActions = Array.from(this.actions.values())
            .filter(action => action.fromStageId === stage.id);
            
        outgoingActions.forEach(action => {
            if (action.formFields && action.formFields.length > 0) {
                action.formFields.forEach(field => {
                    newFields.push({
                        ...field,
                        source: `Action: ${action.name}`,
                        sourceStage: stage.id,
                        sourceType: 'action_form',
                        actionId: action.id,
                        inherited: false
                    });
                });
            }
        });
        
        return newFields;
    }
    
    /**
     * Get form fields from a stage
     */
    getStageFormFields(stage) {
        return stage.formFields || [];
    }
    
    /**
     * Deduplicate fields based on field UUID
     */
    deduplicateFormFields(fields) {
        const fieldMap = new Map();
        
        fields.forEach(field => {
            const id = field.id;
            
            if (fieldMap.has(id)) {
                // Keep the latest field (override)
                fieldMap.set(id, field);
            } else {
                fieldMap.set(id, field);
            }
        });
        
        return Array.from(fieldMap.values());
    }
    
    /**
     * Calculate data quality metrics
     */
    calculateDataQualityMetrics(stageData) {
        const totalFields = stageData.totalFieldCount;
        const requiredFields = stageData.availableFields.filter(f => f.required || f.is_required).length;
        const conflicts = stageData.conflicts.length;
        
        // Completeness: ratio of available fields to expected fields
        const completeness = totalFields > 0 ? Math.min(1, totalFields / 10) : 0;
        
        // Consistency: inverse of conflict ratio
        const consistency = totalFields > 0 ? Math.max(0, 1 - (conflicts / totalFields)) : 1;
        
        // Accuracy: based on required fields and validation
        const accuracy = requiredFields > 0 ? Math.min(1, requiredFields / Math.max(1, totalFields * 0.3)) : 1;
        
        const overall = (completeness + consistency + accuracy) / 3;
        
        return {
            completeness: Math.round(completeness * 100) / 100,
            consistency: Math.round(consistency * 100) / 100,
            accuracy: Math.round(accuracy * 100) / 100,
            overall: Math.round(overall * 100) / 100
        };
    }
    
    /**
     * Render data flow visualization
     */
    renderDataFlowTable() {
        const dataFlow = this.dataFlow ? this.dataFlow.calculateDataFlow() : {};
        const orderedStages = Object.values(dataFlow).sort((a, b) => a.stageOrder - b.stageOrder);
        
        if (orderedStages.length === 0) {
            return '<div class="data-flow-empty">No stages available for data flow analysis</div>';
        }
        
        let html = `
            <div class="data-flow-table">
                <h4>Workflow Data Flow Analysis</h4>
                <table class="data-flow-grid">
                    <thead>
                        <tr>
                            <th>Stage</th>
                            <th>Inherited</th>
                            <th>New</th>
                            <th>Total</th>
                            <th>Quality</th>
                            <th>Conflicts</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        orderedStages.forEach(stage => {
            const qualityColor = stage.dataQuality.overall >= 0.8 ? 'green' : 
                                stage.dataQuality.overall >= 0.6 ? 'orange' : 'red';
            
            html += `
                <tr>
                    <td>
                        <strong>${stage.stageName}</strong><br>
                        <small>${stage.stageKey}</small>
                    </td>
                    <td class="inherited-count">${stage.inheritedFields.length}</td>
                    <td class="new-count">${stage.newFields.length}</td>
                    <td class="total-count">${stage.totalFieldCount}</td>
                    <td style="color: ${qualityColor}">
                        ${Math.round(stage.dataQuality.overall * 100)}%
                    </td>
                    <td class="conflicts-count ${stage.conflicts.length > 0 ? 'has-conflicts' : ''}">
                        ${stage.conflicts.length}
                    </td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        return html;
    }
    
    /**
     * Take snapshot with enhanced data
     */
    takeSnapshot(name = null) {
        const snapshotName = name || `Snapshot ${new Date().toLocaleString()}`;
        const snapshot = {
            timestamp: Date.now(),
            name: snapshotName,
            workflow: JSON.parse(JSON.stringify(this.workflow)),
            stages: Array.from(this.stages.entries()),
            actions: Array.from(this.actions.entries()),
            viewport: { ...this.viewport },
            stageCounter: this.stageCounter,
            actionCounter: this.actionCounter,
            dataFlow: this.dataFlow ? this.dataFlow.calculateDataFlow() : null
        };
        
        this.snapshots.set(snapshotName, snapshot);
        this.currentSnapshot = snapshotName;
        
        // Keep only last 10 snapshots
        if (this.snapshots.size > 10) {
            const oldestKey = this.snapshots.keys().next().value;
            this.snapshots.delete(oldestKey);
        }
        
        return snapshotName;
    }
    
    /**
     * Get enhanced workflow export data
     */
    getEnhancedExportData() {
        return {
            workflow: this.workflow,
            stages: Array.from(this.stages.values()),
            actions: Array.from(this.actions.values()),
            dataFlow: this.dataFlow ? this.dataFlow.calculateDataFlow() : null,
            snapshots: Array.from(this.snapshots.values()),
            customTables: this.customTables,
            projectRoles: this.projectRoles,
            exported_at: new Date().toISOString(),
            version: '2.0'
        };
    }
    
    /**
     * Enhanced workflow validation
     */
    validateWorkflowIntegrity() {
        const errors = [];
        const warnings = [];
        
        // Check for orphaned stages
        const connectedStageIds = new Set();
        this.actions.forEach(action => {
            connectedStageIds.add(action.fromStageId);
            connectedStageIds.add(action.toStageId);
        });
        
        this.stages.forEach((stage, stageId) => {
            if (stage.type !== 'start' && !connectedStageIds.has(stageId)) {
                warnings.push(`Stage "${stage.name}" is not connected to any actions`);
            }
        });
        
        // Check for duplicate field keys within stages
        this.stages.forEach((stage, stageId) => {
            if (stage.formFields) {
                const fieldKeys = stage.formFields.map(f => f.key);
                const duplicateKeys = fieldKeys.filter((key, index) => fieldKeys.indexOf(key) !== index);
                if (duplicateKeys.length > 0) {
                    errors.push(`Stage "${stage.name}" has duplicate field keys: ${duplicateKeys.join(', ')}`);
                }
            }
        });
        
        // Check for missing required action data
        this.actions.forEach((action, actionId) => {
            if (!action.name || !action.buttonLabel) {
                errors.push(`Action ${actionId} is missing required name or button label`);
            }
            if (action.allowedRoles.length === 0) {
                warnings.push(`Action "${action.name}" has no allowed roles assigned`);
            }
        });
        
        return { errors, warnings };
    }
}

// Global instance for HTML onclick handlers
let workflowBuilder = null;

/**
 * Main entry point - called by router
 */
export default async function WorkflowBuilderPage(route, context = {}) {
    logger.log('Loading Workflow Builder', { route, context });
    
    try {
        // Extract project ID and workflow ID from context  
        const projectId = context.projectId;
        const workflowId = context.params?.[0] || 'new';
        
        if (!projectId) {
            throw new Error('Project ID is required');
        }
        
        logger.log('Initializing WorkflowBuilder:', { projectId, workflowId });
        
        // Create workflow builder instance
        const workflowBuilder = new WorkflowBuilder(projectId, workflowId);
        
        // Make it globally accessible for onclick handlers
        window.workflowBuilder = workflowBuilder;
        
        // Initialize data layer
        await workflowBuilder.initialize();
        
        // Get the UI HTML
        const html = workflowBuilder.createUI();
        
        // Schedule DOM-dependent initialization after render
        setTimeout(async () => {
            try {
                logger.log('Initializing workflow builder after DOM ready...');
                await workflowBuilder.initializeAfterDOMReady();
                
                // Translate data attributes after DOM is ready
                setTimeout(() => i18nDOM.translateDataAttributes(), 50);
                
                logger.log('Workflow Builder fully initialized');
            } catch (error) {
                logger.error('Failed to initialize workflow builder after DOM:', error);
                app.showNotification('error', 'Initialization Error', `Failed to initialize: ${error.message}`);
            }
        }, 100);
        
        return html;
        
    } catch (error) {
        logger.error('Failed to load workflow builder:', error);
        return `
            <div class="error-container">
                <h2>Error Loading Workflow Builder</h2>
                <p>Failed to initialize the workflow builder.</p>
                <details style="margin-top: 10px;">
                    <summary>Error Details</summary>
                    <pre style="background: #f5f5f5; padding: 10px; margin-top: 5px; border-radius: 4px; font-size: 12px;">${error.stack || error.message}</pre>
                </details>
                <button class="btn btn-primary" onclick="window.location.reload()">Retry</button>
            </div>
        `;
    }
}