/**
 * Workflow UI Controller
 * Controls UI interactions and modal management
 * Handles forms, notifications, and user interface coordination
 */

// Use dynamic imports to avoid circular dependencies and improve error handling
let FormBuilder = null;
let RoleSelector = null;

// Load components asynchronously
const loadComponents = async () => {
    try {
        if (!FormBuilder) {
            const formBuilderModule = await import('../components/form-builder.js');
            FormBuilder = formBuilderModule.default;
        }
        if (!RoleSelector) {
            const roleSelectorModule = await import('../components/role-selector.js');
            RoleSelector = roleSelectorModule.default;
        }
    } catch (error) {
        console.error('Failed to load UI components:', error);
        throw error;
    }
};

export class WorkflowUIController {
    constructor(stateManager, canvasManager) {
        this.stateManager = stateManager;
        this.canvasManager = canvasManager;
        
        // UI components
        this.formBuilder = null;
        this.nodeRoleSelector = null;
        this.transitionRoleSelector = null;
        
        // Modal state
        this.currentModal = null;
        this.modalHistory = [];
        
        // Form validation state
        this.validationErrors = new Map();
        
        // Notification system
        this.notifications = [];
        this.notificationTimeout = null;
        
        this.initialize();
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    /**
     * Initialize UI controller
     */
    async initialize() {
        try {
            this.setupEventListeners();
            await this.initializeComponents();
            this.setupModalSystem();
            this.setupNotificationSystem();
        } catch (error) {
            console.error('Failed to initialize WorkflowUIController:', error);
            // Continue with basic functionality
        }
    }

    /**
     * Setup event listeners for state and canvas events
     */
    setupEventListeners() {
        // Add null check for state manager
        if (!this.stateManager) {
            console.error('WorkflowUIController: Cannot setup event listeners - StateManager is null');
            return;
        }
        
        // State manager events
        this.stateManager.on('nodeCreated', (data) => this.handleNodeCreated(data));
        this.stateManager.on('nodeEditRequested', (data) => this.showNodeEditModal(data.nodeId));
        this.stateManager.on('nodeDeleteRequested', (data) => this.handleNodeDeleteRequest(data));
        this.stateManager.on('actionEditRequested', (data) => this.showTransitionEditModal(data.actionId, data.isNewAction));
        this.stateManager.on('actionDeleteRequested', (data) => this.handleActionDeleteRequest(data));
        this.stateManager.on('workflowMetadataUpdated', () => this.updateWorkflowInfo());
        this.stateManager.on('dataLoaded', () => this.refreshUI());
        
        // Canvas events
        this.stateManager.on('canvasContextMenu', (data) => this.handleCanvasContextMenu(data));
        this.stateManager.on('nodeContextMenu', (data) => this.handleNodeContextMenu(data));
        
        // Persistence events
        this.stateManager.on('autoSaved', () => this.showNotification('success', 'Auto-saved', 'Workflow automatically saved'));
        this.stateManager.on('autoSaveFailed', (data) => this.showError(`Auto-save failed: ${data.error.message}`));
        this.stateManager.on('databaseSaved', () => this.showSuccess('Workflow saved successfully'));
        this.stateManager.on('databaseSaveFailed', (data) => this.showError(`Save failed: ${data.error.message}`));
    }

    /**
     * Initialize UI components
     */
    async initializeComponents() {
        // Add null/undefined checks for state manager and its properties
        if (!this.stateManager || !this.stateManager.logicalState) {
            console.warn('WorkflowUIController: StateManager not properly initialized');
            return;
        }
        
        const projectId = this.stateManager.logicalState.projectId;
        
        if (projectId) {
            try {
                // Load components asynchronously
                await loadComponents();
                
                if (!FormBuilder || !RoleSelector) {
                    console.error('Failed to load required components');
                    return;
                }
                
                this.formBuilder = new FormBuilder(projectId);
            this.nodeRoleSelector = new RoleSelector('allowedRoles', { 
                projectId,
                onSelectionChange: (roles) => {
                    // Update currently selected node's allowed roles
                    if (!this.stateManager || !this.stateManager.visualState || !this.stateManager.visualState.selection) {
                        console.warn('WorkflowUIController: VisualState not properly initialized');
                        return;
                    }
                    const selectedNodeId = this.stateManager.visualState.selection.selectedNode;
                    if (selectedNodeId) {
                        this.stateManager.updateStage({ 
                            id: selectedNodeId,
                            allowedRoles: roles.map(r => r.id) 
                        });
                    }
                }
            });
            this.transitionRoleSelector = new RoleSelector('transitionRoles', { 
                projectId,
                onSelectionChange: (roles) => {
                    // Update currently selected transition's allowed roles
                    if (!this.stateManager || !this.stateManager.visualState || !this.stateManager.visualState.selection) {
                        console.warn('WorkflowUIController: VisualState not properly initialized');
                        return;
                    }
                    const selectedTransitionId = this.stateManager.visualState.selection.selectedTransition;
                    if (selectedTransitionId) {
                        this.stateManager.updateAction({ 
                            id: selectedTransitionId,
                            allowedRoles: roles.map(r => r.id) 
                        });
                    }
                }
            });
            } catch (componentError) {
                console.error('Failed to initialize UI components:', componentError);
                // Continue without form builder and role selectors
            }
        }
        
        this.initializeRoleSelectors();
    }

    /**
     * Setup modal system
     */
    setupModalSystem() {
        // Create overlay if it doesn't exist
        if (!document.getElementById('overlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'overlay';
            overlay.className = 'overlay';
            overlay.addEventListener('click', () => this.closeModal());
            document.body.appendChild(overlay);
        }
        
        // Escape key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.currentModal) {
                this.closeModal();
            }
        });
    }

    /**
     * Setup notification system
     */
    setupNotificationSystem() {
        // Create notification container if it doesn't exist
        if (!document.getElementById('notification-container')) {
            const container = document.createElement('div');
            container.id = 'notification-container';
            container.className = 'notification-container';
            document.body.appendChild(container);
        }
    }

    // =====================================================
    // MODAL MANAGEMENT
    // =====================================================

    /**
     * Show node edit modal
     */
    showNodeEditModal(nodeId) {
        const nodeData = this.stateManager.getStageById(nodeId);
        if (!nodeData) return;
        
        const modal = document.getElementById('nodeModal');
        if (!modal) return;
        
        this.currentModal = 'nodeModal';
        
        // Set the node ID on the modal for save/delete operations
        modal.setAttribute('data-node-id', nodeId);
        
        // Populate form fields
        this.populateNodeForm(nodeData);
        
        // Setup role selector
        this.setupNodeRoleSelector(nodeData);
        
        // Show the modal
        this.showModal(modal);
        
        // Focus on title input
        const titleInput = modal.querySelector('#nodeTitle');
        if (titleInput) {
            titleInput.focus();
            titleInput.select();
        }
    }

    /**
     * Show transition edit modal
     */
    showTransitionEditModal(actionId, isNewAction = false) {
        const actionData = this.stateManager.getActionById(actionId);
        if (!actionData) return;
        
        const modal = document.getElementById('transitionModal');
        if (!modal) return;
        
        this.currentModal = 'transitionModal';
        
        // Set the action ID on the modal for save/delete operations
        modal.setAttribute('data-action-id', actionId);
        
        // Mark if this is a new action (can be cancelled)
        modal.setAttribute('data-is-new-action', isNewAction.toString());
        
        // Populate form fields
        this.populateTransitionForm(actionData);
        
        // Setup role selector
        this.setupTransitionRoleSelector(actionData);
        
        // Show the modal
        this.showModal(modal);
        
        // Focus on name input
        const nameInput = modal.querySelector('#transitionName');
        if (nameInput) {
            nameInput.focus();
            nameInput.select();
        }
    }

    /**
     * Show import modal
     */
    showImportModal() {
        const modal = document.getElementById('importModal');
        if (!modal) return;
        
        this.currentModal = 'importModal';
        
        // Clear the textarea
        const textarea = modal.querySelector('#importTextarea');
        if (textarea) {
            textarea.value = '';
            textarea.focus();
        }
        
        this.showModal(modal);
    }

    /**
     * Show export modal (create if doesn't exist)
     */
    showExportModal() {
        // For now, just trigger direct export
        this.handleExportClick();
    }

    /**
     * Show workflow type selection modal
     */
    showWorkflowTypeModal() {
        const modal = document.getElementById('workflowTypeModal');
        if (!modal) return;
        
        this.currentModal = 'workflowTypeModal';
        
        // Setup click handlers for workflow type options
        const options = modal.querySelectorAll('.workflow-type-option');
        options.forEach(option => {
            option.addEventListener('click', () => {
                const workflowType = option.getAttribute('data-type');
                this.selectWorkflowType(workflowType);
            });
        });
        
        this.showModal(modal);
    }

    /**
     * Show a modal
     */
    showModal(modal) {
        if (!modal) return;
        
        const overlay = document.getElementById('overlay');
        if (overlay) {
            overlay.style.display = 'block';
        }
        
        modal.style.display = 'block';
        
        // Add to modal history
        this.modalHistory.push(modal.id);
        
        // Emit event
        this.stateManager.emit('modalOpened', { modalId: modal.id });
    }

    /**
     * Close current modal
     */
    closeModal() {
        if (!this.currentModal) return;
        
        const modal = document.getElementById(this.currentModal);
        if (modal) {
            modal.style.display = 'none';
        }
        
        const overlay = document.getElementById('overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
        
        // Handle action cancellation - remove newly created action if cancelling
        if (this.currentModal === 'transitionModal') {
            const actionId = modal?.getAttribute('data-action-id');
            const isNewAction = modal?.getAttribute('data-is-new-action') === 'true';
            
            if (actionId && isNewAction) {
                // Remove the action that was created but not confirmed
                this.stateManager.removeAction(actionId);
                console.log('Cancelled new action creation, removed action:', actionId);
            }
        }
        
        // Clear validation errors
        this.clearValidationErrors();
        
        // Cancel any active connections when closing modals
        if (this.canvasManager && typeof this.canvasManager.cancelConnection === 'function') {
            this.canvasManager.cancelConnection();
        }
        
        // Emit event
        this.stateManager.emit('modalClosed', { modalId: this.currentModal });
        
        this.currentModal = null;
        this.modalHistory.pop();
    }

    // =====================================================
    // FORM HANDLING
    // =====================================================

    /**
     * Populate node form with data
     */
    populateNodeForm(nodeData) {
        const modal = document.getElementById('nodeModal');
        if (!modal) return;
        
        // Set form values
        this.setInputValue(modal, '#nodeTitle', nodeData.title || '');
        this.setInputValue(modal, '#nodeKey', nodeData.key || '');
        this.setInputValue(modal, '#nodeType', nodeData.type || 'intermediate');
        this.setInputValue(modal, '#maxHours', nodeData.maxHours || 24);
        
        // Store node ID for saving
        modal.setAttribute('data-node-id', nodeData.id);
        
        // Show/hide start form section
        const startFormSection = modal.querySelector('#startFormSection');
        const isStartStage = nodeData.type === 'start';
        if (startFormSection) {
            startFormSection.style.display = isStartStage ? 'block' : 'none';
        }
        
        // Initialize form fields if start stage
        if (isStartStage && this.formBuilder) {
            this.initializeFormFields(modal, '#formFields', nodeData.formFields || []);
        }
    }

    /**
     * Populate transition form with data
     */
    populateTransitionForm(actionData) {
        const modal = document.getElementById('transitionModal');
        if (!modal) return;
        
        // Set form values
        this.setInputValue(modal, '#transitionName', actionData.name || '');
        this.setInputValue(modal, '#buttonLabel', actionData.buttonLabel || '');
        this.setInputValue(modal, '#buttonColor', actionData.buttonColor || '#007bff');
        this.setInputValue(modal, '#transitionConditions', actionData.conditions || '');
        this.setInputValue(modal, '#confirmationMessage', actionData.confirmationMessage || '');
        
        // Set checkboxes
        this.setCheckboxValue(modal, '#requiresConfirmation', actionData.requiresConfirmation || false);
        this.setCheckboxValue(modal, '#isEditAction', actionData.isEditAction || false);
        
        // Store action ID for saving
        modal.setAttribute('data-action-id', actionData.id);
        
        // Toggle action sections based on edit action checkbox
        this.toggleActionSections(actionData.isEditAction || false);
        
        // Initialize form fields for normal actions
        if (!actionData.isEditAction && this.formBuilder) {
            this.initializeFormFields(modal, '#actionFields', actionData.formFields || []);
        }
        
        // Update data preview
        this.updateActionDataPreview(actionData);
    }

    /**
     * Handle node form submission
     */
    handleNodeFormSubmit() {
        const modal = document.getElementById('nodeModal');
        if (!modal) return;
        
        const nodeId = modal.getAttribute('data-node-id');
        if (!nodeId) return;
        
        // Get form data
        const formData = this.getNodeFormData(modal);
        
        // Validate form
        const validation = this.validateNodeForm(formData);
        if (!validation.isValid) {
            this.showValidationErrors(validation.errors);
            return;
        }
        
        // Update stage in state manager
        this.stateManager.updateStage({
            id: nodeId,
            ...formData
        });
        
        // Close modal
        this.closeModal();
        
        // Show success notification
        this.showSuccess('Stage updated successfully');
    }

    /**
     * Handle transition form submission
     */
    handleTransitionFormSubmit() {
        const modal = document.getElementById('transitionModal');
        if (!modal) return;
        
        const actionId = modal.getAttribute('data-action-id');
        if (!actionId) return;
        
        // Get form data
        const formData = this.getTransitionFormData(modal);
        
        // Validate form
        const validation = this.validateTransitionForm(formData);
        if (!validation.isValid) {
            this.showValidationErrors(validation.errors);
            return;
        }
        
        // Update action in state manager
        this.stateManager.updateAction({
            id: actionId,
            ...formData
        });
        
        // Clear new action flag since it's now been saved/confirmed
        modal.setAttribute('data-is-new-action', 'false');
        
        // Close modal
        this.closeModal();
        
        // Show success notification
        this.showSuccess('Action updated successfully');
    }

    /**
     * Get node form data
     */
    getNodeFormData(modal) {
        return {
            title: this.getInputValue(modal, '#nodeTitle'),
            key: this.getInputValue(modal, '#nodeKey'),
            type: this.getInputValue(modal, '#nodeType'),
            maxHours: parseInt(this.getInputValue(modal, '#maxHours')) || 24,
            allowedRoles: this.nodeRoleSelector ? this.nodeRoleSelector.getSelectedRoles() : [],
            formFields: this.getFormFields(modal, '#formFields')
        };
    }

    /**
     * Get transition form data
     */
    getTransitionFormData(modal) {
        return {
            name: this.getInputValue(modal, '#transitionName'),
            buttonLabel: this.getInputValue(modal, '#buttonLabel'),
            buttonColor: this.getInputValue(modal, '#buttonColor'),
            conditions: this.getInputValue(modal, '#transitionConditions'),
            confirmationMessage: this.getInputValue(modal, '#confirmationMessage'),
            requiresConfirmation: this.getCheckboxValue(modal, '#requiresConfirmation'),
            isEditAction: this.getCheckboxValue(modal, '#isEditAction'),
            allowedRoles: this.transitionRoleSelector ? this.transitionRoleSelector.getSelectedRoles() : [],
            formFields: this.getFormFields(modal, '#actionFields')
        };
    }

    /**
     * Validate node form data
     */
    validateNodeForm(formData) {
        const errors = [];
        
        if (!formData.title || formData.title.trim().length === 0) {
            errors.push({ field: 'nodeTitle', message: 'Stage title is required' });
        }
        
        if (!formData.key || formData.key.trim().length === 0) {
            errors.push({ field: 'nodeKey', message: 'Stage key is required' });
        } else if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(formData.key)) {
            errors.push({ field: 'nodeKey', message: 'Stage key must start with a letter and contain only letters, numbers, and underscores' });
        }
        
        if (!formData.type || !['start', 'intermediate', 'end'].includes(formData.type)) {
            errors.push({ field: 'nodeType', message: 'Valid stage type is required' });
        }
        
        if (formData.maxHours && (formData.maxHours < 1 || formData.maxHours > 8760)) {
            errors.push({ field: 'maxHours', message: 'Max hours must be between 1 and 8760' });
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate transition form data
     */
    validateTransitionForm(formData) {
        const errors = [];
        
        if (!formData.name || formData.name.trim().length === 0) {
            errors.push({ field: 'transitionName', message: 'Action name is required' });
        }
        
        if (!formData.buttonLabel || formData.buttonLabel.trim().length === 0) {
            errors.push({ field: 'buttonLabel', message: 'Button label is required' });
        }
        
        if (formData.requiresConfirmation && (!formData.confirmationMessage || formData.confirmationMessage.trim().length === 0)) {
            errors.push({ field: 'confirmationMessage', message: 'Confirmation message is required when confirmation is enabled' });
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // =====================================================
    // SIDEBAR MANAGEMENT
    // =====================================================

    /**
     * Update transitions list in sidebar
     */
    updateTransitionsList() {
        const container = document.getElementById('transitionsContainer');
        if (!container) return;
        
        const actions = this.stateManager.getAllActions();
        
        // Clear existing content
        container.innerHTML = '';
        
        if (actions.length === 0) {
            container.innerHTML = '<div class="no-transitions">No actions yet</div>';
            return;
        }
        
        // Create transition items
        actions.forEach(action => {
            const item = this.createTransitionListItem(action);
            container.appendChild(item);
        });
        
        // Update action count
        this.updateActionCount(actions.length);
    }

    /**
     * Create transition list item
     */
    createTransitionListItem(action) {
        const item = document.createElement('div');
        item.className = 'transition-item';
        item.setAttribute('data-action-id', action.id);
        
        if (action.name) {
            item.classList.add('has-action');
        }
        
        // Get stage names for display
        const fromStage = this.stateManager.getStageById(action.fromStageId);
        const toStage = this.stateManager.getStageById(action.toStageId);
        
        const fromName = fromStage ? fromStage.title : 'Unknown';
        const toName = toStage ? toStage.title : 'Unknown';
        
        item.innerHTML = `
            <div class="transition-header">
                <strong>${action.buttonLabel || action.name || 'Unnamed Action'}</strong>
            </div>
            <div class="transition-flow">
                ${fromName} → ${toName}
            </div>
            ${action.isEditAction ? '<div class="edit-action-indicator">Edit Action</div>' : ''}
        `;
        
        // Add click handler
        item.addEventListener('click', () => {
            this.showTransitionEditModal(action.id);
            this.highlightActionOnCanvas(action.id);
        });
        
        return item;
    }

    /**
     * Update action overview bar
     */
    updateActionOverview() {
        const actions = this.stateManager.getAllActions();
        const overviewList = document.getElementById('actionOverviewList');
        const actionCount = document.getElementById('actionCount');
        
        if (actionCount) {
            actionCount.textContent = `${actions.length} action${actions.length !== 1 ? 's' : ''}`;
        }
        
        if (overviewList) {
            overviewList.innerHTML = '';
            
            actions.forEach(action => {
                const item = document.createElement('div');
                item.className = 'action-overview-item';
                item.textContent = action.buttonLabel || action.name || 'Unnamed';
                
                if (action.name) {
                    item.classList.add('has-action');
                }
                
                item.addEventListener('click', () => {
                    this.showTransitionEditModal(action.id);
                    this.highlightActionOnCanvas(action.id);
                });
                
                overviewList.appendChild(item);
            });
        }
    }

    /**
     * Toggle sidebar section
     */
    toggleSection(sectionId) {
        const content = document.getElementById(`${sectionId}Content`);
        const btn = document.getElementById(`${sectionId}Btn`);
        
        if (content && btn) {
            const isVisible = content.style.display !== 'none';
            content.style.display = isVisible ? 'none' : 'block';
            btn.textContent = isVisible ? '+' : '−';
        }
    }

    // =====================================================
    // TOOLBAR ACTIONS
    // =====================================================

    /**
     * Handle save button click
     */
    handleSaveClick() {
        // Trigger save through persistence manager
        this.stateManager.emit('saveRequested');
    }

    /**
     * Handle export button click
     */
    handleExportClick() {
        try {
            // Trigger export through persistence manager
            this.stateManager.emit('exportRequested');
            this.showSuccess('Workflow exported successfully');
        } catch (error) {
            this.showError(`Export failed: ${error.message}`);
        }
    }

    /**
     * Handle import button click
     */
    handleImportClick() {
        this.showImportModal();
    }

    /**
     * Handle undo button click
     */
    handleUndoClick() {
        this.stateManager.emit('undoRequested');
    }

    /**
     * Handle redo button click
     */
    handleRedoClick() {
        this.stateManager.emit('redoRequested');
    }

    /**
     * Handle clear canvas click
     */
    handleClearClick() {
        if (confirm('Are you sure you want to clear the entire workflow? This action cannot be undone.')) {
            this.stateManager.resetState();
            this.showNotification('info', 'Canvas Cleared', 'Workflow has been reset');
        }
    }

    /**
     * Process import from textarea
     */
    processImport() {
        const modal = document.getElementById('importModal');
        const textarea = modal.querySelector('#importTextarea');
        
        if (!textarea) return;
        
        const jsonText = textarea.value.trim();
        if (!jsonText) {
            this.showError('Please paste workflow JSON data');
            return;
        }
        
        try {
            this.stateManager.emit('importRequested', { jsonText });
            this.closeModal();
            this.showSuccess('Workflow imported successfully');
        } catch (error) {
            this.showError(`Import failed: ${error.message}`);
        }
    }

    // =====================================================
    // WORKFLOW TYPE
    // =====================================================

    /**
     * Select workflow type
     */
    selectWorkflowType(type) {
        // Update state manager
        this.stateManager.updateWorkflowMetadata({ workflowType: type });
        
        // If this is a new workflow (no existing stages), create basic structure
        const existingStages = this.stateManager.getAllStages();
        if (existingStages.length === 0) {
            this.createBasicWorkflowStructure(type);
        }
        
        // Update UI display
        this.updateWorkflowTypeDisplay(type);
        
        // Close modal
        this.closeModal();
        
        // Show success message
        this.showSuccess(`Workflow type set to ${type}`);
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

            // Refresh UI to show the new structure
            if (this.canvasManager) {
                this.canvasManager.refreshAllNodes();
            }
            this.refreshUI();

            console.log('Basic workflow structure created in UI controller:', { startStageId, endStageId, actionId });

        } catch (error) {
            console.error('Failed to create basic workflow structure in UI controller:', error);
            // Don't throw error here - show user-friendly message instead
            this.showError('Failed to create basic workflow structure. You can manually add stages.');
        }
    }

    /**
     * Update workflow type display
     */
    updateWorkflowTypeDisplay(type) {
        const typeSelect = document.getElementById('workflowType');
        if (typeSelect) {
            typeSelect.value = type;
        }
        
        // Update any type indicators in the UI
        const indicators = document.querySelectorAll('.workflow-type-indicator');
        indicators.forEach(indicator => {
            const iconElement = indicator.querySelector('.type-icon');
            const textElement = indicator.querySelector('.type-text');
            
            if (iconElement && textElement) {
                if (type === 'incident') {
                    iconElement.textContent = '📍';
                    textElement.textContent = 'Incident Workflow';
                } else if (type === 'survey') {
                    iconElement.textContent = '📋';
                    textElement.textContent = 'Survey Workflow';
                }
            }
        });
    }

    // =====================================================
    // NOTIFICATIONS
    // =====================================================

    /**
     * Show user notification
     */
    showNotification(type, title, message, duration = 4000) {
        const container = document.getElementById('notification-container');
        if (!container) return;
        
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        
        notification.innerHTML = `
            <div class="notification-header">
                <strong>${title}</strong>
                <button class="notification-close">&times;</button>
            </div>
            <div class="notification-message">${message}</div>
        `;
        
        // Add close handler
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            this.removeNotification(notification);
        });
        
        // Add to container
        container.appendChild(notification);
        
        // Auto-remove after duration
        if (duration > 0) {
            setTimeout(() => {
                this.removeNotification(notification);
            }, duration);
        }
        
        // Track notification
        this.notifications.push(notification);
        
        return notification;
    }

    /**
     * Show error message
     */
    showError(message) {
        return this.showNotification('error', 'Error', message, 6000);
    }

    /**
     * Show success message
     */
    showSuccess(message) {
        return this.showNotification('success', 'Success', message, 3000);
    }

    /**
     * Remove notification
     */
    removeNotification(notification) {
        if (notification && notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
        
        const index = this.notifications.indexOf(notification);
        if (index > -1) {
            this.notifications.splice(index, 1);
        }
    }

    // =====================================================
    // HELP SYSTEM
    // =====================================================

    /**
     * Show help tooltip
     */
    showHelp(element) {
        const tooltip = element.querySelector('.help-tooltip');
        if (tooltip) {
            tooltip.classList.add('show');
        }
    }

    /**
     * Hide help tooltip
     */
    hideHelp() {
        const tooltips = document.querySelectorAll('.help-tooltip');
        tooltips.forEach(tooltip => {
            tooltip.classList.remove('show');
        });
    }

    // =====================================================
    // ROLE MANAGEMENT
    // =====================================================

    /**
     * Initialize role selectors
     */
    initializeRoleSelectors() {
        // Initialize role selectors when project roles are available
        this.stateManager.on('projectRolesLoaded', (roles) => {
            if (this.nodeRoleSelector) {
                this.nodeRoleSelector.refresh();
            }
            if (this.transitionRoleSelector) {
                this.transitionRoleSelector.refresh();
            }
        });
    }

    /**
     * Setup node role selector
     */
    setupNodeRoleSelector(nodeData) {
        if (!this.nodeRoleSelector) return;
        
        // Set selected roles based on node data
        const selectedRoles = (nodeData.allowedRoles || []).map(roleId => {
            const role = this.stateManager.logicalState.projectRoles?.find(r => r.id === roleId);
            return role ? { id: role.id, name: role.name } : { id: roleId, name: `Role ${roleId}` };
        });
        
        this.nodeRoleSelector.setSelectedEntities(selectedRoles);
    }

    /**
     * Setup transition role selector
     */
    setupTransitionRoleSelector(actionData) {
        if (!this.transitionRoleSelector) return;
        
        // Set selected roles based on action data
        const selectedRoles = (actionData.allowedRoles || []).map(roleId => {
            const role = this.stateManager.logicalState.projectRoles?.find(r => r.id === roleId);
            return role ? { id: role.id, name: role.name } : { id: roleId, name: `Role ${roleId}` };
        });
        
        this.transitionRoleSelector.setSelectedEntities(selectedRoles);
    }

    // =====================================================
    // EVENT HANDLERS
    // =====================================================

    /**
     * Handle node created event
     */
    handleNodeCreated(data) {
        // Automatically show edit modal for new nodes
        setTimeout(() => {
            this.showNodeEditModal(data.stageId);
        }, 100);
    }

    /**
     * Handle node delete request
     */
    handleNodeDeleteRequest(data) {
        const nodeData = this.stateManager.getStageById(data.nodeId);
        const nodeName = nodeData ? nodeData.title : 'Unknown';
        
        if (confirm(`Are you sure you want to delete the stage "${nodeName}"? This will also remove all connected actions.`)) {
            this.stateManager.removeStage(data.nodeId);
            this.showSuccess('Stage deleted successfully');
        }
    }

    /**
     * Handle action delete request
     */
    handleActionDeleteRequest(data) {
        const actionData = this.stateManager.getActionById(data.actionId);
        const actionName = actionData ? (actionData.buttonLabel || actionData.name) : 'Unknown';
        
        if (confirm(`Are you sure you want to delete the action "${actionName}"?`)) {
            this.stateManager.removeAction(data.actionId);
            this.showSuccess('Action deleted successfully');
        }
    }

    /**
     * Handle canvas context menu
     */
    handleCanvasContextMenu(data) {
        // Show context menu for canvas (could add options like "Add Stage")
        console.log('Canvas context menu at:', data.position);
    }

    /**
     * Handle node context menu
     */
    handleNodeContextMenu(data) {
        // Show context menu for node (could add options like "Delete", "Duplicate")
        console.log('Node context menu for:', data.nodeId, 'at:', data.position);
    }

    // =====================================================
    // UTILITY METHODS
    // =====================================================

    /**
     * Set input value safely
     */
    setInputValue(container, selector, value) {
        const input = container.querySelector(selector);
        if (input) {
            input.value = value;
        }
    }

    /**
     * Get input value safely
     */
    getInputValue(container, selector) {
        const input = container.querySelector(selector);
        return input ? input.value : '';
    }

    /**
     * Set checkbox value safely
     */
    setCheckboxValue(container, selector, checked) {
        const checkbox = container.querySelector(selector);
        if (checkbox) {
            checkbox.checked = checked;
        }
    }

    /**
     * Get checkbox value safely
     */
    getCheckboxValue(container, selector) {
        const checkbox = container.querySelector(selector);
        return checkbox ? checkbox.checked : false;
    }

    /**
     * Initialize form fields with form builder
     */
    initializeFormFields(container, selector, fields) {
        const fieldsContainer = container.querySelector(selector);
        if (!fieldsContainer || !this.formBuilder) return;
        
        fieldsContainer.innerHTML = '';
        // Set the fields and render them
        if (fields && Array.isArray(fields)) {
            this.formBuilder.fields = fields;
        }
        fieldsContainer.innerHTML = this.formBuilder.renderFieldsList();
    }

    /**
     * Get form fields from form builder
     */
    getFormFields(container, selector) {
        const fieldsContainer = container.querySelector(selector);
        if (!fieldsContainer || !this.formBuilder) return [];
        
        return this.formBuilder.getAllFields();
    }

    /**
     * Toggle action sections based on edit action checkbox
     */
    toggleActionSections(isEditAction) {
        const normalSection = document.getElementById('normalActionSection');
        const editSection = document.getElementById('editActionSection');
        
        if (normalSection) {
            normalSection.style.display = isEditAction ? 'none' : 'block';
        }
        
        if (editSection) {
            editSection.style.display = isEditAction ? 'block' : 'none';
        }
    }

    /**
     * Update action data preview
     */
    updateActionDataPreview(actionData) {
        const previewContainer = document.getElementById('actionDataContent');
        if (!previewContainer) return;
        
        // Show what data will be available after this action
        const fromStage = this.stateManager.getStageById(actionData.fromStageId);
        const toStage = this.stateManager.getStageById(actionData.toStageId);
        
        let preview = '<div class="data-preview-section">';
        
        if (fromStage && fromStage.formFields) {
            preview += '<h5>From Previous Stages:</h5>';
            fromStage.formFields.forEach(field => {
                preview += `<div class="inherited-field">${field.label} (${field.type})</div>`;
            });
        }
        
        if (actionData.formFields && actionData.formFields.length > 0) {
            preview += '<h5>New Data from This Action:</h5>';
            actionData.formFields.forEach(field => {
                preview += `<div class="new-field">${field.label} (${field.type})</div>`;
            });
        }
        
        preview += '</div>';
        previewContainer.innerHTML = preview;
    }

    /**
     * Highlight action on canvas
     */
    highlightActionOnCanvas(actionId) {
        // Remove existing highlights
        const highlighted = document.querySelectorAll('.highlighted');
        highlighted.forEach(el => el.classList.remove('highlighted'));
        
        // Highlight the action
        const transitionElement = document.getElementById(`transition_${actionId}`);
        const labelElement = document.getElementById(`transition_label_${actionId}`);
        
        if (transitionElement) {
            transitionElement.classList.add('highlighted');
        }
        
        if (labelElement) {
            labelElement.classList.add('highlighted');
        }
        
        // Remove highlight after 3 seconds
        setTimeout(() => {
            if (transitionElement) {
                transitionElement.classList.remove('highlighted');
            }
            if (labelElement) {
                labelElement.classList.remove('highlighted');
            }
        }, 3000);
    }

    /**
     * Update action count display
     */
    updateActionCount(count) {
        const actionCountElement = document.getElementById('actionCount');
        if (actionCountElement) {
            actionCountElement.textContent = `${count} action${count !== 1 ? 's' : ''}`;
        }
    }

    /**
     * Show validation errors
     */
    showValidationErrors(errors) {
        // Clear previous errors
        this.clearValidationErrors();
        
        errors.forEach(error => {
            const field = document.getElementById(error.field);
            if (field) {
                field.classList.add('error');
                
                // Add error message
                const errorMsg = document.createElement('div');
                errorMsg.className = 'error-message';
                errorMsg.textContent = error.message;
                field.parentNode.appendChild(errorMsg);
                
                this.validationErrors.set(error.field, errorMsg);
            }
        });
        
        // Show first error
        if (errors.length > 0) {
            this.showError(errors[0].message);
        }
    }

    /**
     * Clear validation errors
     */
    clearValidationErrors() {
        this.validationErrors.forEach((errorMsg, fieldId) => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.classList.remove('error');
            }
            if (errorMsg.parentNode) {
                errorMsg.parentNode.removeChild(errorMsg);
            }
        });
        
        this.validationErrors.clear();
    }

    /**
     * Update workflow info display
     */
    updateWorkflowInfo() {
        const metadata = this.stateManager.getWorkflowMetadata();
        
        // Update workflow name input
        const nameInput = document.getElementById('workflowName');
        if (nameInput) {
            nameInput.value = metadata.workflowName || '';
        }
        
        // Update workflow description
        const descInput = document.getElementById('workflowDesc');
        if (descInput) {
            descInput.value = metadata.workflowDescription || '';
        }
        
        // Update workflow type
        this.updateWorkflowTypeDisplay(metadata.workflowType);
        
        // Update color picker
        const colorInput = document.getElementById('workflowColor');
        if (colorInput) {
            colorInput.value = metadata.markerColor || '#2563eb';
        }
    }

    /**
     * Handle node form submission
     */
    handleNodeFormSubmit() {
        const nodeModal = document.getElementById('nodeModal');
        if (!nodeModal || nodeModal.style.display === 'none') return;
        
        const selection = this.stateManager.getSelection();
        if (!selection.selectedNode) return;
        
        try {
            // Get form values
            const title = document.getElementById('nodeTitle')?.value || '';
            let key = document.getElementById('nodeKey')?.value || '';
            const type = document.getElementById('nodeType')?.value || 'intermediate';
            const maxHours = parseInt(document.getElementById('maxHours')?.value) || 24;
            
            // Clean and validate key
            key = key.toString().replace(/[\s\n\r]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
            if (key && !/^[a-zA-Z]/.test(key)) {
                key = 'stage_' + key;
            }
            
            // Update stage in state manager
            const updatedStage = {
                id: selection.selectedNode,
                title,
                key,
                type,
                maxHours
            };
            
            // Handle form fields for start stages
            if (type === 'start' && this.formBuilder) {
                const fields = this.formBuilder.getAllFields();
                updatedStage.formFields = fields.map(f => ({
                    field_key: f.field_key,
                    field_label: f.field_label,
                    field_type: f.field_type,
                    field_order: f.field_order,
                    is_required: f.is_required,
                    placeholder: f.placeholder,
                    help_text: f.help_text,
                    validation_rules: f.validation_rules,
                    field_options: f.field_options,
                    conditional_logic: f.conditional_logic
                }));
            }
            
            this.stateManager.updateStage(updatedStage);
            this.closeModal();
            this.showNotification('info', 'Stage Saved', 'Stage configuration saved locally. Use "Save Workflow" to persist to database.');
            
        } catch (error) {
            console.error('Failed to save node:', error);
            this.showError('Failed to save stage: ' + error.message);
        }
    }

    /**
     * Handle transition form submission
     */
    handleTransitionFormSubmit() {
        const transitionModal = document.getElementById('transitionModal');
        if (!transitionModal || transitionModal.style.display === 'none') return;
        
        const selection = this.stateManager.getSelection();
        if (!selection.selectedTransition) return;
        
        try {
            // Get form values
            const name = document.getElementById('transitionName')?.value || '';
            const buttonLabel = document.getElementById('buttonLabel')?.value || '';
            const buttonColor = document.getElementById('buttonColor')?.value || '#007bff';
            const requiresConfirmation = document.getElementById('requiresConfirmation')?.checked || false;
            const isEditAction = document.getElementById('isEditAction')?.checked || false;
            const confirmationMessage = document.getElementById('confirmationMessage')?.value || '';
            
            // Parse conditions
            const conditionsText = document.getElementById('transitionConditions')?.value || '';
            const conditions = conditionsText.split('\n').filter(c => c.trim());
            
            // Update action in state manager
            const updatedAction = {
                id: selection.selectedTransition,
                name,
                buttonLabel,
                buttonColor,
                requiresConfirmation,
                isEditAction,
                confirmationMessage,
                conditions
            };
            
            // Handle form fields for regular actions (not edit actions)
            if (!isEditAction && this.formBuilder) {
                const fields = this.formBuilder.getAllFields();
                updatedAction.actionFields = fields.map(f => ({
                    field_key: f.field_key,
                    field_label: f.field_label,
                    field_type: f.field_type,
                    field_order: f.field_order,
                    is_required: f.is_required,
                    placeholder: f.placeholder,
                    help_text: f.help_text,
                    validation_rules: f.validation_rules,
                    field_options: f.field_options,
                    conditional_logic: f.conditional_logic
                }));
            }
            
            this.stateManager.updateAction(updatedAction);
            this.closeModal();
            this.showNotification('info', 'Action Saved', 'Action configuration saved locally. Use "Save Workflow" to persist to database.');
            
        } catch (error) {
            console.error('Failed to save transition:', error);
            this.showError('Failed to save action: ' + error.message);
        }
    }

    /**
     * Refresh entire UI after data load
     */
    refreshUI() {
        this.updateWorkflowInfo();
        this.updateTransitionsList();
        this.updateActionOverview();
    }

    /**
     * Cleanup resources and prevent memory leaks
     */
    destroy() {
        try {
            console.log('Destroying WorkflowUIController...');
            
            // Close any open modals
            this.closeModal();
            
            // Clear notifications
            if (this.notifications) {
                this.notifications.forEach(notification => {
                    this.removeNotification(notification);
                });
                this.notifications = [];
            }
            
            // Clear notification timeout
            if (this.notificationTimeout) {
                clearTimeout(this.notificationTimeout);
                this.notificationTimeout = null;
            }
            
            // Clear validation errors
            this.clearValidationErrors();
            
            // Remove event listeners from state manager if available
            if (this.stateManager && typeof this.stateManager.off === 'function') {
                // Remove all event listeners we added
                this.stateManager.off('nodeCreated', this.handleNodeCreated);
                this.stateManager.off('nodeEditRequested', this.showNodeEditModal);
                this.stateManager.off('nodeDeleteRequested', this.handleNodeDeleteRequest);
                this.stateManager.off('actionEditRequested', this.showTransitionEditModal);
                this.stateManager.off('actionDeleteRequested', this.handleActionDeleteRequest);
                this.stateManager.off('workflowMetadataUpdated', this.updateWorkflowInfo);
                this.stateManager.off('dataLoaded', this.refreshUI);
                this.stateManager.off('canvasContextMenu', this.handleCanvasContextMenu);
                this.stateManager.off('nodeContextMenu', this.handleNodeContextMenu);
                this.stateManager.off('autoSaved', this.showNotification);
                this.stateManager.off('autoSaveFailed', this.showError);
                this.stateManager.off('databaseSaved', this.showSuccess);
                this.stateManager.off('databaseSaveFailed', this.showError);
            }
            
            // Destroy UI components
            if (this.formBuilder && typeof this.formBuilder.destroy === 'function') {
                this.formBuilder.destroy();
            }
            if (this.nodeRoleSelector && typeof this.nodeRoleSelector.destroy === 'function') {
                this.nodeRoleSelector.destroy();
            }
            if (this.transitionRoleSelector && typeof this.transitionRoleSelector.destroy === 'function') {
                this.transitionRoleSelector.destroy();
            }
            
            // Clear references
            this.formBuilder = null;
            this.nodeRoleSelector = null;
            this.transitionRoleSelector = null;
            this.currentModal = null;
            this.modalHistory = [];
            this.validationErrors.clear();
            
            // Remove DOM event listeners
            document.removeEventListener('keydown', this.handleEscapeKey);
            
            // Emit destruction event
            if (this.stateManager && typeof this.stateManager.emit === 'function') {
                this.stateManager.emit('uiControllerDestroyed');
            }
            
            console.log('WorkflowUIController destroyed successfully');
        } catch (error) {
            console.error('Error during WorkflowUIController destruction:', error);
        }
    }
}

export default WorkflowUIController;