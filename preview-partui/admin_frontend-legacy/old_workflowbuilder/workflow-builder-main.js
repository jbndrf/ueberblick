/**
 * Workflow Builder Main Orchestrator
 * Ties all components together and provides a clean public API
 * Manages component lifecycle and coordination
 */

import DebugLogger from '../core/debug-logger.js';
import WorkflowStateManager from './workflow-state-manager.js';
import WorkflowPersistence from './workflow-persistence.js';
import WorkflowCanvasManager from './workflow-canvas-manager.js';
import WorkflowUIController from './workflow-ui-controller.js';
import WorkflowHistoryManager from './workflow-history-manager.js';
import WorkflowValidator from './workflow-validator.js';

const logger = new DebugLogger('WorkflowBuilderMain');

class WorkflowBuilder {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.container = null;
        this.canvasElement = null;
        
        // Configuration
        this.options = {
            projectId: null,
            workflowId: null,
            autoSave: true,
            autoSaveInterval: 30000, // 30 seconds
            enableHistory: true,
            enableValidation: true,
            enableMinimap: true,
            maxHistorySize: 50,
            strictValidation: false,
            ...options
        };
        
        // Component instances
        this.stateManager = null;
        this.persistence = null;
        this.canvasManager = null;
        this.uiController = null;
        this.historyManager = null;
        this.validator = null;
        
        // Initialization state
        this.isInitialized = false;
        this.isDestroyed = false;
        
        // Event listeners
        this.eventListeners = new Map();
        
        // API exposure for global access
        this.exposeGlobalAPI();
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    /**
     * Initialize the workflow builder
     */
    async initialize() {
        if (this.isInitialized || this.isDestroyed) {
            throw new Error('WorkflowBuilder is already initialized or destroyed');
        }

        try {
            // Find container element
            this.container = document.getElementById(this.containerId);
            if (!this.container) {
                throw new Error(`Container element with ID '${this.containerId}' not found`);
            }

            // Find canvas element
            this.canvasElement = this.container.querySelector('#canvas') || 
                               this.container.querySelector('.workflow-canvas');
            if (!this.canvasElement) {
                throw new Error('Canvas element not found in container');
            }

            // Initialize components in order
            await this.initializeComponents();
            this.setupEventBindings();
            this.setupGlobalEventHandlers();

            this.isInitialized = true;

            // Emit initialization complete event
            this.emit('initialized', {
                projectId: this.options.projectId,
                workflowId: this.options.workflowId
            });

            logger.info('WorkflowBuilder initialized successfully');

        } catch (error) {
            logger.error('Failed to initialize WorkflowBuilder:', error);
            this.cleanup();
            throw error;
        }
    }

    /**
     * Initialize all components
     */
    async initializeComponents() {
        // 1. State Manager (core component)
        this.stateManager = new WorkflowStateManager();
        
        // Set initial project/workflow IDs
        if (this.options.projectId) {
            this.stateManager.updateWorkflowMetadata({ projectId: this.options.projectId });
        }
        if (this.options.workflowId) {
            this.stateManager.updateWorkflowMetadata({ workflowId: this.options.workflowId });
        }

        // 2. Persistence Manager
        this.persistence = new WorkflowPersistence(this.stateManager, this.options.projectId);
        
        // Enable auto-save if configured
        if (this.options.autoSave) {
            this.persistence.enableAutoSave(this.options.autoSaveInterval);
        }

        // 3. Validator (if enabled)
        if (this.options.enableValidation) {
            this.validator = new WorkflowValidator();
            
            if (this.options.strictValidation) {
                this.validator.updateSettings({ strictMode: true });
            }
        }

        // 4. History Manager (if enabled)
        if (this.options.enableHistory) {
            this.historyManager = new WorkflowHistoryManager(this.stateManager);
            
            if (this.options.maxHistorySize) {
                this.historyManager.setMaxHistorySize(this.options.maxHistorySize);
            }
        }

        // 5. Canvas Manager
        this.canvasManager = new WorkflowCanvasManager(this.canvasElement, this.stateManager);
        
        // Configure minimap
        if (!this.options.enableMinimap) {
            this.canvasManager.minimap.enabled = false;
        }

        // 6. UI Controller
        this.uiController = new WorkflowUIController(this.stateManager, this.canvasManager);
        
        // Initialize UI controller asynchronously
        try {
            await this.uiController.initialize();
        } catch (uiError) {
            logger.warn('UI Controller initialization failed, continuing with basic functionality:', uiError);
        }

        logger.info('All WorkflowBuilder components initialized');
    }

    /**
     * Setup event bindings between components
     */
    setupEventBindings() {
        // Persistence event handlers
        this.stateManager.on('saveRequested', async () => {
            try {
                await this.saveWorkflow();
            } catch (error) {
                this.uiController.showError(`Save failed: ${error.message}`);
            }
        });

        this.stateManager.on('exportRequested', () => {
            try {
                this.exportWorkflow();
            } catch (error) {
                this.uiController.showError(`Export failed: ${error.message}`);
            }
        });

        this.stateManager.on('importRequested', (data) => {
            try {
                this.importWorkflow(data.jsonText);
            } catch (error) {
                this.uiController.showError(`Import failed: ${error.message}`);
            }
        });

        // Auto-save event handlers
        this.stateManager.on('autoSaved', (data) => {
            if (data.sessionOnly && data.validationWarning) {
                // Auto-save only saved to session due to validation issues
                logger.info('Auto-save: Session saved, database skipped due to validation');
                // Don't show notification for every auto-save warning to avoid spam
            } else {
                // Successful auto-save to both session and database
                logger.info('Auto-save: Successfully saved to session and database');
            }
        });

        this.stateManager.on('autoSaveFailed', (data) => {
            logger.error('Auto-save failed:', data.error);
            if (this.uiController) {
                this.uiController.showNotification('error', 'Auto-Save Failed', 
                    'Failed to auto-save your work. Please save manually.');
            }
        });

        // Validation event handlers
        if (this.validator) {
            this.stateManager.on('stageUpdated', () => this.validateIfEnabled());
            this.stateManager.on('actionUpdated', () => this.validateIfEnabled());
            this.stateManager.on('workflowMetadataUpdated', () => this.validateIfEnabled());
        }

        // History event handlers
        if (this.historyManager) {
            this.stateManager.on('undoRequested', () => {
                if (this.historyManager.undo()) {
                    this.uiController.showNotification('info', 'Undo', 'Last action undone');
                }
            });

            this.stateManager.on('redoRequested', () => {
                if (this.historyManager.redo()) {
                    this.uiController.showNotification('info', 'Redo', 'Action redone');
                }
            });

            // Update undo/redo button states
            this.stateManager.on('historyUpdated', (data) => {
                this.updateUndoRedoButtons(data.canUndo, data.canRedo);
            });
        }

        // Canvas refresh events
        this.stateManager.on('stateRestored', () => {
            this.canvasManager.refreshAllNodes();
            this.uiController.refreshUI();
        });

        // Node/action lifecycle events
        this.stateManager.on('nodeEditRequested', (data) => {
            this.uiController.showNodeEditModal(data.nodeId);
        });

        this.stateManager.on('actionEditRequested', (data) => {
            this.uiController.showTransitionEditModal(data.actionId);
        });
    }

    /**
     * Setup global event handlers
     */
    setupGlobalEventHandlers() {
        // Window beforeunload handler
        window.addEventListener('beforeunload', (e) => {
            if (this.persistence && this.persistence.isDirty) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardShortcuts(e);
        });
    }

    /**
     * Handle keyboard shortcuts
     */
    handleKeyboardShortcuts(event) {
        // Only handle shortcuts when workflow builder is active
        if (!this.isInitialized || this.isDestroyed) return;

        // Check if focus is in an input field
        const activeElement = document.activeElement;
        const isInputField = activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable
        );

        // Ctrl/Cmd + S: Save
        if ((event.ctrlKey || event.metaKey) && event.key === 's') {
            event.preventDefault();
            this.saveWorkflow();
        }

        // Ctrl/Cmd + Z: Undo
        if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey && !isInputField) {
            event.preventDefault();
            if (this.historyManager) {
                this.historyManager.undo();
            }
        }

        // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y: Redo
        if (((event.ctrlKey || event.metaKey) && event.key === 'z' && event.shiftKey) ||
            ((event.ctrlKey || event.metaKey) && event.key === 'y')) {
            event.preventDefault();
            if (this.historyManager && !isInputField) {
                this.historyManager.redo();
            }
        }

        // Escape: Close modals
        if (event.key === 'Escape') {
            this.uiController.closeModal();
        }

        // Ctrl/Cmd + E: Export
        if ((event.ctrlKey || event.metaKey) && event.key === 'e') {
            event.preventDefault();
            this.exportWorkflow();
        }

        // Ctrl/Cmd + I: Import
        if ((event.ctrlKey || event.metaKey) && event.key === 'i') {
            event.preventDefault();
            this.uiController.showImportModal();
        }
    }

    // =====================================================
    // COMPONENT MANAGEMENT
    // =====================================================

    /**
     * Get state manager instance
     */
    getStateManager() {
        return this.stateManager;
    }

    /**
     * Get canvas manager instance
     */
    getCanvasManager() {
        return this.canvasManager;
    }

    /**
     * Get UI controller instance
     */
    getUIController() {
        return this.uiController;
    }

    /**
     * Get persistence manager instance
     */
    getPersistence() {
        return this.persistence;
    }

    /**
     * Get history manager instance
     */
    getHistoryManager() {
        return this.historyManager;
    }

    /**
     * Get validator instance
     */
    getValidator() {
        return this.validator;
    }

    // =====================================================
    // WORKFLOW LIFECYCLE
    // =====================================================

    /**
     * Create new workflow
     */
    async createNewWorkflow(workflowType = 'incident') {
        if (!this.isInitialized) {
            throw new Error('WorkflowBuilder is not initialized');
        }

        try {
            // Reset state
            this.stateManager.resetState();
            
            // Set workflow type and other initial metadata
            this.stateManager.updateWorkflowMetadata({
                workflowType,
                workflowName: 'New Workflow',
                workflowDescription: '',
                markerColor: '#2563eb'
            });

            // Create basic workflow structure to prevent validation errors
            this.createBasicWorkflowStructure(workflowType);

            // Clear history
            if (this.historyManager) {
                this.historyManager.clearHistory();
            }

            // Refresh UI
            this.canvasManager.refreshAllNodes();
            this.uiController.refreshUI();

            this.emit('workflowCreated', { workflowType });

            return true;

        } catch (error) {
            this.emit('workflowCreateFailed', { error });
            throw error;
        }
    }

    /**
     * Create basic workflow structure with start and end stages
     */
    createBasicWorkflowStructure(workflowType) {
        try {
            // Create start stage
            const startStageId = this.stateManager.generateStageId();
            const startStage = {
                id: startStageId,
                type: 'start',
                title: 'Start',
                key: 'start',
                maxHours: 24,
                allowedRoles: [],
                formFields: []
            };

            // Create end stage
            const endStageId = this.stateManager.generateStageId();
            const endStage = {
                id: endStageId,
                type: 'end',
                title: 'Complete',
                key: 'complete',
                maxHours: 24,
                allowedRoles: [],
                formFields: []
            };

            // Add stages to state manager
            this.stateManager.updateStage(startStage);
            this.stateManager.updateStage(endStage);

            // Position stages on canvas (start on left, end on right)
            this.stateManager.updateNodePosition(startStageId, 100, 150);
            this.stateManager.updateNodePosition(endStageId, 400, 150);

            // Create a basic transition from start to end
            const actionId = this.stateManager.generateActionId();
            const action = {
                id: actionId,
                fromStageId: startStageId,
                toStageId: endStageId,
                name: workflowType === 'incident' ? 'Submit Report' : 'Submit Survey',
                buttonLabel: workflowType === 'incident' ? 'Submit Report' : 'Submit',
                buttonColor: '#28a745',
                allowedRoles: [],
                conditions: {},
                requiresConfirmation: false,
                confirmationMessage: '',
                isEditAction: false,
                formFields: []
            };

            this.stateManager.updateAction(action);

            logger.info('Basic workflow structure created:', { startStageId, endStageId, actionId });

        } catch (error) {
            logger.error('Failed to create basic workflow structure:', error);
            // Don't throw error here - let the workflow be created even if structure creation fails
        }
    }

    /**
     * Load existing workflow
     */
    async loadExistingWorkflow(workflowId) {
        if (!this.isInitialized) {
            throw new Error('WorkflowBuilder is not initialized');
        }

        try {
            // Check for session data first
            const sessionData = this.persistence.loadFromSession(workflowId);
            
            if (sessionData) {
                // Ask user if they want to restore from session
                const useSession = confirm(
                    'Found unsaved changes for this workflow. Would you like to restore them?'
                );
                
                if (useSession) {
                    this.stateManager.loadFromDatabase(sessionData.logicalState);
                    this.stateManager.loadVisualState(sessionData.visualState);
                    
                    this.emit('workflowLoaded', { workflowId, source: 'session' });
                    return true;
                }
            }

            // Load from database
            const workflowData = await this.persistence.loadFromDatabase(workflowId);
            
            // Clear session data since we're loading fresh from database
            this.persistence.clearSession(workflowId);

            // Clear history and start fresh
            if (this.historyManager) {
                this.historyManager.clearHistory();
            }

            // Refresh UI
            this.canvasManager.refreshAllNodes();
            this.uiController.refreshUI();

            this.emit('workflowLoaded', { workflowId, source: 'database', data: workflowData });

            return workflowData;

        } catch (error) {
            this.emit('workflowLoadFailed', { workflowId, error });
            throw error;
        }
    }

    /**
     * Save current workflow
     */
    async saveWorkflow() {
        if (!this.isInitialized) {
            throw new Error('WorkflowBuilder is not initialized');
        }

        try {
            // Validate before saving if validation is enabled
            if (this.validator && this.options.enableValidation) {
                const validation = this.validateWorkflow();
                if (!validation.isValid) {
                    const proceed = confirm(
                        `Workflow has validation errors:\n${validation.errors.slice(0, 3).map(e => e.message).join('\n')}\n\nSave anyway?`
                    );
                    if (!proceed) {
                        return false;
                    }
                }
            }

            let result;
            const workflowId = this.stateManager.logicalState.workflowId;

            if (workflowId) {
                // Update existing workflow
                await this.persistence.updateDatabase();
                result = { workflowId, operation: 'update' };
            } else {
                // Create new workflow
                result = await this.persistence.saveToDatabase();
            }

            // Clear session data since we've saved to database
            if (result.workflowId) {
                this.persistence.clearSession(result.workflowId);
            }

            this.emit('workflowSaved', result);

            return result;

        } catch (error) {
            this.emit('workflowSaveFailed', { error });
            
            // Enhanced error recovery and user feedback
            if (this.uiController) {
                this.handleSaveError(error);
            }
            
            throw error;
        }
    }

    /**
     * Close and cleanup workflow
     */
    closeWorkflow() {
        if (!this.isInitialized) return;

        try {
            // Save session data if there are changes
            if (this.persistence.isDirty) {
                this.persistence.saveToSession();
            }

            // Reset state
            this.stateManager.resetState();

            // Clear history
            if (this.historyManager) {
                this.historyManager.clearHistory();
            }

            // Refresh UI
            this.canvasManager.refreshAllNodes();
            this.uiController.refreshUI();

            this.emit('workflowClosed');

        } catch (error) {
            this.emit('workflowCloseFailed', { error });
            logger.error('Failed to close workflow:', error);
        }
    }

    // =====================================================
    // PUBLIC API
    // =====================================================

    /**
     * Programmatically add a node
     */
    addNode(type, position = null) {
        if (!this.isInitialized) {
            throw new Error('WorkflowBuilder is not initialized');
        }

        const stageId = this.stateManager.generateStageId();
        const stage = {
            id: stageId,
            type,
            title: `New ${type.charAt(0).toUpperCase() + type.slice(1)}`,
            key: `${type}_${stageId.split('_')[1]}`,
            maxHours: 24,
            allowedRoles: [],
            formFields: []
        };

        this.stateManager.updateStage(stage);

        if (position) {
            this.stateManager.updateNodePosition(stageId, position.x, position.y);
        }

        this.canvasManager.renderNode(stage);

        this.emit('nodeAdded', { stageId, stage, position });

        return stageId;
    }

    /**
     * Programmatically remove a node
     */
    removeNode(nodeId) {
        if (!this.isInitialized) {
            throw new Error('WorkflowBuilder is not initialized');
        }

        const stage = this.stateManager.getStageById(nodeId);
        if (!stage) {
            throw new Error(`Node ${nodeId} not found`);
        }

        this.stateManager.removeStage(nodeId);

        this.emit('nodeRemoved', { nodeId, stage });

        return true;
    }

    /**
     * Programmatically add a transition
     */
    addTransition(fromId, toId, config = {}) {
        if (!this.isInitialized) {
            throw new Error('WorkflowBuilder is not initialized');
        }

        const fromStage = this.stateManager.getStageById(fromId);
        const toStage = this.stateManager.getStageById(toId);

        if (!fromStage) {
            throw new Error(`Source stage ${fromId} not found`);
        }
        if (!toStage) {
            throw new Error(`Target stage ${toId} not found`);
        }

        const actionId = this.stateManager.generateActionId();
        const action = {
            id: actionId,
            fromStageId: fromId,
            toStageId: toId,
            name: config.name || 'New Action',
            buttonLabel: config.buttonLabel || config.name || 'Action',
            buttonColor: config.buttonColor || '#007bff',
            allowedRoles: config.allowedRoles || [],
            conditions: config.conditions || {},
            requiresConfirmation: config.requiresConfirmation || false,
            confirmationMessage: config.confirmationMessage || '',
            isEditAction: config.isEditAction || false,
            formFields: config.formFields || []
        };

        this.stateManager.updateAction(action);

        this.canvasManager.renderTransition(action);

        this.emit('transitionAdded', { actionId, action, fromId, toId });

        return actionId;
    }

    /**
     * Programmatically remove a transition
     */
    removeTransition(transitionId) {
        if (!this.isInitialized) {
            throw new Error('WorkflowBuilder is not initialized');
        }

        const action = this.stateManager.getActionById(transitionId);
        if (!action) {
            throw new Error(`Transition ${transitionId} not found`);
        }

        this.stateManager.removeAction(transitionId);

        this.emit('transitionRemoved', { transitionId, action });

        return true;
    }

    /**
     * Export workflow to file
     */
    exportWorkflow(filename = null) {
        if (!this.isInitialized) {
            throw new Error('WorkflowBuilder is not initialized');
        }

        return this.persistence.exportToFile(filename);
    }

    /**
     * Import workflow from JSON string
     */
    importWorkflow(jsonString) {
        if (!this.isInitialized) {
            throw new Error('WorkflowBuilder is not initialized');
        }

        const data = this.persistence.importFromText(jsonString);
        
        // Refresh UI
        this.canvasManager.refreshAllNodes();
        this.uiController.refreshUI();

        this.emit('workflowImported', { data });

        return data;
    }

    /**
     * Validate workflow
     */
    validateWorkflow() {
        if (!this.validator) {
            throw new Error('Validation is not enabled');
        }

        const workflowData = this.stateManager.serializeForDatabase();
        return this.validator.validateComplete(workflowData);
    }

    /**
     * Get workflow statistics
     */
    getWorkflowStats() {
        if (!this.isInitialized) {
            throw new Error('WorkflowBuilder is not initialized');
        }

        return this.stateManager.getWorkflowStats();
    }

    /**
     * Zoom controls
     */
    zoomIn() {
        if (this.canvasManager) {
            const currentZoom = this.canvasManager.getZoom();
            this.canvasManager.setZoom(currentZoom * 1.2);
        }
    }

    zoomOut() {
        if (this.canvasManager) {
            const currentZoom = this.canvasManager.getZoom();
            this.canvasManager.setZoom(currentZoom / 1.2);
        }
    }

    resetZoom() {
        if (this.canvasManager) {
            this.canvasManager.resetView();
        }
    }

    fitToView() {
        if (this.canvasManager) {
            this.canvasManager.fitToView();
        }
    }

    // =====================================================
    // CONFIGURATION
    // =====================================================

    /**
     * Set configuration options
     */
    setOptions(options) {
        this.options = { ...this.options, ...options };

        // Apply options to components
        if (this.persistence && 'autoSave' in options) {
            if (options.autoSave) {
                this.persistence.enableAutoSave(options.autoSaveInterval || this.options.autoSaveInterval);
            } else {
                this.persistence.disableAutoSave();
            }
        }

        if (this.historyManager && 'maxHistorySize' in options) {
            this.historyManager.setMaxHistorySize(options.maxHistorySize);
        }

        if (this.validator && 'strictValidation' in options) {
            this.validator.updateSettings({ strictMode: options.strictValidation });
        }

        this.emit('optionsUpdated', options);
    }

    /**
     * Get current configuration
     */
    getConfiguration() {
        return {
            ...this.options,
            isInitialized: this.isInitialized,
            isDestroyed: this.isDestroyed,
            components: {
                stateManager: !!this.stateManager,
                persistence: !!this.persistence,
                canvasManager: !!this.canvasManager,
                uiController: !!this.uiController,
                historyManager: !!this.historyManager,
                validator: !!this.validator
            }
        };
    }

    // =====================================================
    // ERROR HANDLING AND RECOVERY
    // =====================================================
    
    /**
     * Handle save errors with user-friendly feedback
     */
    handleSaveError(error) {
        try {
            if (error.message && error.message.includes('Workflow validation failed')) {
                this.handleValidationError(error);
            } else if (error.message && error.message.includes('network')) {
                this.handleNetworkError(error);
            } else if (error.message && error.message.includes('Database')) {
                this.handleDatabaseError(error);
            } else {
                this.handleGenericError(error);
            }
        } catch (handlerError) {
            console.error('Error in error handler:', handlerError);
            this.uiController.showNotification('error', 'Save Failed', 'An unexpected error occurred while saving.');
        }
    }
    
    /**
     * Handle validation errors with actionable guidance
     */
    handleValidationError(error) {
        const errorMessage = error.message.replace('Workflow validation failed: ', '');
        const errors = errorMessage.split(', ');
        
        let helpMessage = 'Please fix the following issues before saving:\n\n';
        let hasActionableAdvice = false;
        
        errors.forEach(err => {
            if (err.includes('end stage')) {
                helpMessage += '• Add at least one End stage to complete your workflow\n';
                helpMessage += '  → Drag an "End" node from the sidebar onto the canvas\n';
                hasActionableAdvice = true;
            } else if (err.includes('start stage')) {
                helpMessage += '• Workflow must have exactly one Start stage\n';
                helpMessage += '  → Ensure you have one "Start" node on the canvas\n';
                hasActionableAdvice = true;
            } else if (err.includes('Orphaned stage')) {
                const stageName = err.replace('Orphaned stage: ', '');
                helpMessage += `• Connect "${stageName}" to other stages or remove it\n`;
                helpMessage += '  → Right-click a stage and connect it to another, or delete unused stages\n';
                hasActionableAdvice = true;
            } else if (err.includes('stage key')) {
                helpMessage += '• Fix duplicate or invalid stage keys\n';
                helpMessage += '  → Double-click stages to edit their keys (must be unique)\n';
                hasActionableAdvice = true;
            } else {
                helpMessage += `• ${err}\n`;
            }
        });
        
        if (hasActionableAdvice) {
            helpMessage += '\nNote: Your work is automatically saved to session storage and will be recovered if you refresh the page.';
        }
        
        this.uiController.showNotification('warning', 'Workflow Incomplete', helpMessage);
    }
    
    /**
     * Handle network errors with retry options
     */
    handleNetworkError(error) {
        const message = 'Network error occurred while saving. Your changes are preserved locally.\n\n' +
                       'Would you like to:\n' +
                       '• Wait for connection and try again\n' +
                       '• Continue working (auto-save will retry)\n' +
                       '• Export workflow as backup';
                       
        this.uiController.showNotification('error', 'Network Error', message);
        
        // Enable auto-retry for network errors
        setTimeout(() => {
            if (this.persistence && this.persistence.isDirty) {
                logger.info('Retrying save after network error...');
                this.saveWorkflow().catch(retryError => {
                    logger.warn('Retry failed, will try again later:', retryError.message);
                });
            }
        }, 30000); // Retry after 30 seconds
    }
    
    /**
     * Handle database errors with recovery suggestions
     */
    handleDatabaseError(error) {
        const message = 'Database error occurred. Your changes are safely stored locally.\n\n' +
                       'Recovery options:\n' +
                       '• Try saving again in a few moments\n' +
                       '• Export workflow as JSON backup\n' +
                       '• Contact support if the issue persists';
                       
        this.uiController.showNotification('error', 'Database Error', message);
    }
    
    /**
     * Handle generic errors with basic recovery
     */
    handleGenericError(error) {
        let message = 'An unexpected error occurred while saving.\n\n';
        message += 'Your changes are preserved in session storage.\n';
        message += 'Try refreshing the page to recover your work.';
        
        if (error.message) {
            message += `\n\nError details: ${error.message}`;
        }
        
        this.uiController.showNotification('error', 'Save Failed', message);
    }
    
    /**
     * Attempt automatic error recovery
     */
    attemptRecovery() {
        try {
            logger.info('Attempting automatic error recovery...');
            
            // Check if we have session data to recover
            if (this.persistence && this.options.workflowId) {
                const hasSession = this.persistence.hasSessionData(this.options.workflowId);
                if (hasSession) {
                    logger.info('Session data found, attempting recovery...');
                    this.persistence.loadFromSession(this.options.workflowId);
                    this.uiController.showNotification('success', 'Recovered', 'Your previous work has been recovered from session storage.');
                    return true;
                }
            }
            
            // Check component health
            const healthCheck = this.performHealthCheck();
            if (!healthCheck.healthy) {
                logger.info('Health check failed, attempting component restart...');
                return this.restartComponents(healthCheck.issues);
            }
            
            return false;
        } catch (recoveryError) {
            logger.error('Error during recovery attempt:', recoveryError);
            return false;
        }
    }
    
    /**
     * Perform health check on components
     */
    performHealthCheck() {
        const issues = [];
        
        try {
            if (!this.stateManager) {
                issues.push('StateManager not available');
            } else if (typeof this.stateManager.getAllStages !== 'function') {
                issues.push('StateManager methods not working');
            }
            
            if (!this.canvasManager) {
                issues.push('CanvasManager not available');
            } else if (!this.canvasManager.canvasElement) {
                issues.push('Canvas element not available');
            }
            
            if (!this.uiController) {
                issues.push('UIController not available');
            }
            
            if (!this.persistence) {
                issues.push('Persistence not available');
            }
            
            return {
                healthy: issues.length === 0,
                issues
            };
        } catch (error) {
            return {
                healthy: false,
                issues: [`Health check failed: ${error.message}`]
            };
        }
    }
    
    /**
     * Attempt to restart failed components
     */
    async restartComponents(issues) {
        try {
            logger.info('Attempting to restart components:', issues);
            
            let restarted = false;
            
            // Try to reinitialize components that failed
            for (const issue of issues) {
                if (issue.includes('StateManager') && !this.stateManager) {
                    logger.info('Attempting to restart StateManager...');
                    // Could implement component restart logic here
                }
                
                if (issue.includes('Canvas') && this.canvasManager && !this.canvasManager.canvasElement) {
                    logger.info('Attempting to restart CanvasManager...');
                    const canvasElement = document.getElementById('canvas');
                    if (canvasElement) {
                        this.canvasManager.canvasElement = canvasElement;
                        this.canvasManager.initialize();
                        restarted = true;
                    }
                }
            }
            
            if (restarted) {
                this.uiController.showNotification('info', 'Recovery', 'Some components have been restarted. Please try your operation again.');
            }
            
            return restarted;
        } catch (error) {
            logger.error('Error during component restart:', error);
            return false;
        }
    }

    // =====================================================
    // UTILITY METHODS
    // =====================================================

    /**
     * Validate if validation is enabled
     */
    validateIfEnabled() {
        if (this.validator && this.options.enableValidation) {
            // Perform background validation
            const workflowData = this.stateManager.serializeForDatabase();
            const validation = this.validator.validateComplete(workflowData);
            
            this.emit('validationPerformed', validation);
        }
    }

    /**
     * Update undo/redo button states
     */
    updateUndoRedoButtons(canUndo, canRedo) {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');

        if (undoBtn) {
            undoBtn.disabled = !canUndo;
        }

        if (redoBtn) {
            redoBtn.disabled = !canRedo;
        }
    }

    // =====================================================
    // SESSION MANAGEMENT METHODS
    // =====================================================

    /**
     * Create a manual snapshot/save point
     */
    createSnapshot(name = null) {
        if (!this.isInitialized || !this.persistence) {
            throw new Error('WorkflowBuilder is not initialized or persistence is not available');
        }

        return this.persistence.createSavePoint(name);
    }

    /**
     * Restore from a snapshot/save point
     */
    restoreSnapshot(snapshotId) {
        if (!this.isInitialized || !this.persistence) {
            throw new Error('WorkflowBuilder is not initialized or persistence is not available');
        }

        const result = this.persistence.restoreFromSavePoint(snapshotId);
        
        // Refresh UI after restoration
        if (result && this.canvasManager && this.uiController) {
            this.canvasManager.refreshAllNodes();
            this.uiController.refreshUI();
            this.uiController.showNotification('success', 'Snapshot Restored', 'Workflow restored from snapshot');
        }

        return result;
    }

    /**
     * Get all available snapshots
     */
    getSnapshots() {
        if (!this.isInitialized || !this.persistence) {
            return [];
        }

        return this.persistence.getSavePoints();
    }

    /**
     * Delete a snapshot
     */
    deleteSnapshot(snapshotId) {
        if (!this.isInitialized || !this.persistence) {
            throw new Error('WorkflowBuilder is not initialized or persistence is not available');
        }

        return this.persistence.deleteSavePoint(snapshotId);
    }

    /**
     * Enable auto-save with optional interval
     */
    enableAutoSave(interval = null) {
        if (!this.isInitialized || !this.persistence) {
            throw new Error('WorkflowBuilder is not initialized or persistence is not available');
        }

        this.options.autoSave = true;
        if (interval) {
            this.options.autoSaveInterval = interval;
        }

        this.persistence.enableAutoSave(this.options.autoSaveInterval);
        
        if (this.uiController) {
            this.uiController.showNotification('info', 'Auto-Save Enabled', `Auto-save enabled with ${this.options.autoSaveInterval / 1000}s interval`);
        }
    }

    /**
     * Disable auto-save
     */
    disableAutoSave() {
        if (!this.isInitialized || !this.persistence) {
            throw new Error('WorkflowBuilder is not initialized or persistence is not available');
        }

        this.options.autoSave = false;
        this.persistence.disableAutoSave();
        
        if (this.uiController) {
            this.uiController.showNotification('info', 'Auto-Save Disabled', 'Auto-save has been disabled');
        }
    }

    /**
     * Force immediate save
     */
    async forceSave() {
        if (!this.isInitialized || !this.persistence) {
            throw new Error('WorkflowBuilder is not initialized or persistence is not available');
        }

        try {
            await this.persistence.forceSave();
            
            if (this.uiController) {
                this.uiController.showNotification('success', 'Save Completed', 'Workflow saved successfully');
            }
        } catch (error) {
            if (this.uiController) {
                this.uiController.showNotification('error', 'Save Failed', `Failed to save: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Get session status
     */
    getSessionStatus() {
        if (!this.isInitialized || !this.persistence) {
            return {
                available: false,
                error: 'WorkflowBuilder is not initialized or persistence is not available'
            };
        }

        return this.persistence.getStatus();
    }

    /**
     * Recover from session storage
     */
    async recoverFromSession() {
        if (!this.isInitialized || !this.persistence || !this.options.workflowId) {
            throw new Error('WorkflowBuilder is not initialized, persistence is not available, or no workflow ID');
        }

        try {
            const hasSession = this.persistence.hasSessionData(this.options.workflowId);
            
            if (hasSession) {
                const recovered = await this.persistence.loadFromSession(this.options.workflowId);
                
                if (recovered && this.canvasManager && this.uiController) {
                    this.canvasManager.refreshAllNodes();
                    this.uiController.refreshUI();
                    this.uiController.showNotification('success', 'Session Recovered', 'Unsaved changes recovered from previous session');
                }
                
                return recovered;
            } else {
                if (this.uiController) {
                    this.uiController.showNotification('info', 'No Session Data', 'No unsaved changes found to recover');
                }
                return false;
            }
        } catch (error) {
            if (this.uiController) {
                this.uiController.showNotification('error', 'Recovery Failed', `Failed to recover session: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Expose global API for backward compatibility
     */
    exposeGlobalAPI() {
        // Create global window.workflowBuilder object
        if (typeof window !== 'undefined') {
            window.workflowBuilder = {
                // Main methods
                saveWorkflow: () => this.saveWorkflow(),
                exportJSON: () => this.exportWorkflow(),
                importFromText: () => this.uiController?.showImportModal(),
                
                // Node operations
                saveNode: () => this.uiController?.handleNodeFormSubmit(),
                deleteNode: () => this.uiController?.handleNodeDeleteRequest({ nodeId: this.stateManager?.getSelection()?.selectedNode }),
                closeModal: () => this.uiController?.closeModal(),
                
                // Transition operations
                saveTransition: () => this.uiController?.handleTransitionFormSubmit(),
                deleteTransition: () => {
                    const modal = document.getElementById('transitionModal');
                    const actionId = modal?.getAttribute('data-action-id');
                    if (actionId) {
                        this.uiController?.handleActionDeleteRequest({ actionId });
                    }
                },
                
                // Canvas operations
                undo: () => this.historyManager?.undo(),
                redo: () => this.historyManager?.redo(),
                zoomIn: () => this.zoomIn(),
                zoomOut: () => this.zoomOut(),
                resetZoom: () => this.resetZoom(),
                fitToView: () => this.fitToView(),
                clearCanvas: () => this.uiController?.handleClearClick(),
                
                // UI operations
                toggleActionOverview: () => this.toggleActionOverview(),
                showDataFlow: () => this.showDataFlow(),
                showHelp: (element) => this.uiController?.showHelp(element),
                hideHelp: () => this.uiController?.hideHelp(),
                toggleActionsSection: () => this.uiController?.toggleSection('actionsSection'),
                toggleSettingsSection: () => this.uiController?.toggleSection('settingsSection'),
                toggleActionSections: (isEditAction) => this.uiController?.toggleActionSections(isEditAction),
                processImport: () => this.uiController?.processImport(),
                showWorkflowTypeSelection: () => this.uiController?.showWorkflowTypeModal(),
                
                // Session management operations
                createSnapshot: (name) => this.createSnapshot(name),
                restoreSnapshot: (snapshotId) => this.restoreSnapshot(snapshotId),
                getSnapshots: () => this.getSnapshots(),
                deleteSnapshot: (snapshotId) => this.deleteSnapshot(snapshotId),
                enableAutoSave: (interval) => this.enableAutoSave(interval),
                disableAutoSave: () => this.disableAutoSave(),
                forceSave: () => this.forceSave(),
                getSessionStatus: () => this.getSessionStatus(),
                recoverFromSession: () => this.recoverFromSession(),
                
                // Get instance for advanced usage
                getInstance: () => this
            };

            // Also expose as window.workflowLogic for legacy compatibility
            window.workflowLogic = window.workflowBuilder;
        }
    }

    /**
     * Toggle action overview bar
     */
    toggleActionOverview() {
        const overviewBar = document.getElementById('actionOverviewBar');
        if (overviewBar) {
            const isVisible = overviewBar.style.display !== 'none';
            overviewBar.style.display = isVisible ? 'none' : 'block';
            
            if (!isVisible) {
                this.uiController.updateActionOverview();
            }
        }
    }

    /**
     * Show data flow visualization
     */
    showDataFlow() {
        // This could be implemented to show a data flow diagram
        this.uiController.showNotification('info', 'Data Flow', 'Data flow visualization coming soon');
    }

    // =====================================================
    // EVENT SYSTEM
    // =====================================================

    /**
     * Add event listener
     */
    on(eventName, callback) {
        if (!this.eventListeners.has(eventName)) {
            this.eventListeners.set(eventName, []);
        }
        this.eventListeners.get(eventName).push(callback);
    }

    /**
     * Remove event listener
     */
    off(eventName, callback) {
        if (!this.eventListeners.has(eventName)) return;
        
        const listeners = this.eventListeners.get(eventName);
        const index = listeners.indexOf(callback);
        if (index > -1) {
            listeners.splice(index, 1);
        }
    }

    /**
     * Emit event
     */
    emit(eventName, data = null) {
        if (!this.eventListeners.has(eventName)) return;
        
        const listeners = this.eventListeners.get(eventName);
        listeners.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                logger.error(`Error in WorkflowBuilder event listener for ${eventName}:`, error);
            }
        });
    }

    // =====================================================
    // CLEANUP
    // =====================================================

    /**
     * Clean up and destroy all components
     */
    destroy() {
        if (this.isDestroyed) return;

        try {
            // Save session data if there are unsaved changes
            if (this.persistence?.isDirty) {
                this.persistence.saveToSession();
            }

            // Cleanup components in reverse order
            if (this.uiController) {
                this.uiController.destroy();
                this.uiController = null;
            }

            if (this.canvasManager) {
                this.canvasManager.destroy();
                this.canvasManager = null;
            }

            if (this.historyManager) {
                this.historyManager.destroy();
                this.historyManager = null;
            }

            if (this.persistence) {
                this.persistence.cleanup();
                this.persistence = null;
            }

            if (this.stateManager) {
                this.stateManager.destroy();
                this.stateManager = null;
            }

            this.validator = null;

            // Clear event listeners
            this.eventListeners.clear();

            // Remove global API
            if (typeof window !== 'undefined') {
                delete window.workflowBuilder;
                delete window.workflowLogic;
            }

            this.isDestroyed = true;
            this.isInitialized = false;

            logger.info('WorkflowBuilder destroyed successfully');

        } catch (error) {
            logger.error('Error during WorkflowBuilder destruction:', error);
        }
    }

    /**
     * Cleanup without full destruction (for reinitialization)
     */
    cleanup() {
        this.isInitialized = false;
        
        // Clear component references without destroying them
        this.stateManager = null;
        this.persistence = null;
        this.canvasManager = null;
        this.uiController = null;
        this.historyManager = null;
        this.validator = null;
    }
}

export default WorkflowBuilder;