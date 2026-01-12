/**
 * WorkflowBuilderLocalFirst - Local-first workflow builder implementation
 * Uses LocalStateManager for state and DatabaseAdapter for persistence
 */

import LocalStateManager from './core/LocalStateManager.js';
import DatabaseAdapter from './core/DatabaseAdapter.js';
import { supabaseClient } from '../core/supabase.js';
import app from '../core/app.js';
import EntitySelector from '../components/EntitySelector.js';
import FormBuilder from '../components/FormBuilder.js';
import DebugLogger from '../core/debug-logger.js';

class WorkflowBuilderLocalFirst {
    constructor(projectId, workflowId = null) {
        this.logger = new DebugLogger('WorkflowBuilderLocalFirst');
        this.logger.log('WorkflowBuilderLocalFirst constructor starting...', { projectId, workflowId });
        
        this.projectId = projectId;
        this.workflowId = workflowId;
        this.isNewWorkflow = !workflowId || workflowId === 'new';
        
        this.logger.log('Creating LocalStateManager...');
        // Initialize local-first architecture
        this.localState = new LocalStateManager();
        this.logger.log('LocalStateManager created');
        
        this.logger.log('Creating DatabaseAdapter...');
        this.databaseAdapter = new DatabaseAdapter();
        this.logger.log('DatabaseAdapter created');
        
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
        
        // Form management
        this.formBuilder = null;
        this.entitySelectors = new Map();
        this.sourceFieldSelectors = new Map();
        this.mappingSelectors = new Map();
        this.mappingWhenSelectors = new Map();
        
        // Auto-save
        this.autoSaveInterval = null;
        this.autoSaveDelay = 30000; // 30 seconds
        
        // Canvas reference
        this.canvas = null;
        
        // Field types (keep for compatibility)
        this.fieldTypes = {
            short: { 
                label: 'Short Text', 
                hasOptions: false, 
                icon: '📝',
                validation: ['required', 'minLength', 'maxLength', 'pattern']
            },
            long: { 
                label: 'Long Text', 
                hasOptions: false, 
                icon: '📄',
                validation: ['required', 'minLength', 'maxLength']
            },
            multiple: { 
                label: 'Multiple Choice', 
                hasOptions: true, 
                icon: '☑️',
                validation: ['required', 'minSelections', 'maxSelections']
            },
            dropdown: { 
                label: 'Dropdown', 
                hasOptions: true, 
                icon: '📋',
                validation: ['required']
            },
            smart_dropdown: { 
                label: 'Smart Dropdown', 
                hasOptions: false, 
                hasMappings: true, 
                icon: '🔗',
                validation: ['required']
            },
            date: { 
                label: 'Date', 
                hasOptions: false, 
                icon: '📅',
                validation: ['required', 'minDate', 'maxDate']
            },
            file: { 
                label: 'File Upload', 
                hasOptions: false, 
                icon: '📎',
                validation: ['required', 'fileTypes', 'maxFileSize']
            },
            number: { 
                label: 'Number', 
                hasOptions: false, 
                icon: '🔢',
                validation: ['required', 'min', 'max', 'step']
            },
            email: { 
                label: 'Email', 
                hasOptions: false, 
                icon: '📧',
                validation: ['required', 'emailFormat']
            }
        };
        
        // Setup state change listeners
        this.logger.log('Setting up state listeners...');
        this.setupStateListeners();
        this.logger.log('State listeners setup complete');
        
        // Setup auto-save
        this.logger.log('Setting up auto-save...');
        this.setupAutoSave();
        this.logger.log('Auto-save setup complete');
        
        // Setup unsaved changes warning
        this.logger.log('Setting up unsaved changes warning...');
        this.setupUnsavedChangesWarning();
        this.logger.log('Unsaved changes warning setup complete');
        
        this.logger.log('WorkflowBuilderLocalFirst constructor completed successfully');
    }
    
    // Legacy compatibility getters
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
    
    /**
     * Initialize the workflow builder
     */
    async init() {
        try {
            this.logger.log('Starting WorkflowBuilderLocalFirst initialization...');
            
            // Set project ID in workflow
            this.logger.log('Setting project ID in workflow state...');
            this.localState.setState('workflow.project_id', this.projectId);
            
            // Load existing workflow if not new
            if (!this.isNewWorkflow) {
                this.logger.log('Loading existing workflow...');
                await this.loadWorkflow();
                this.logger.log('Workflow loaded successfully');
            } else {
                this.logger.log('Creating new workflow...');
                // For new workflows, create a default start stage
                this.addStage('start');
                this.logger.log('Default start stage created');
            }
            
            // Load project roles
            this.logger.log('Loading project roles...');
            await this.loadProjectRoles();
            this.logger.log('Project roles loaded');
            
            this.logger.log('WorkflowBuilderLocalFirst initialization completed');
            
        } catch (error) {
            this.logger.error('Failed to initialize workflow builder:', error);
            this.logger.error('Error stack:', error.stack);
            app.showNotification('error', 'Initialization Error', `Failed to load workflow: ${error.message}`);
            throw error; // Re-throw to trigger fallback
        }
    }
    
    /**
     * Setup state change listeners
     */
    setupStateListeners() {
        this.localState.subscribe((path, newValue, oldValue) => {
            // Update UI when state changes
            if (path === 'stages' || path === '*') {
                this.updateStagesUI();
            }
            if (path === 'actions' || path === '*') {
                this.updateActionsUI();
            }
            if (path === 'workflow.name') {
                this.updateWorkflowNameUI();
            }
            if (path === 'isDirty') {
                this.updateSaveButtonState();
            }
            
            // Update undo/redo buttons
            this.updateUndoRedoButtons();
        });
    }
    
    /**
     * Setup auto-save functionality
     */
    setupAutoSave() {
        this.autoSaveInterval = setInterval(() => {
            if (this.localState.getState('isDirty')) {
                this.autoSave();
            }
        }, this.autoSaveDelay);
    }
    
    /**
     * Setup unsaved changes warning
     */
    setupUnsavedChangesWarning() {
        window.addEventListener('beforeunload', (e) => {
            if (this.localState.getState('isDirty')) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                return e.returnValue;
            }
        });
    }
    
    /**
     * Load workflow from database
     */
    async loadWorkflow() {
        this.logger.log('Loading workflow:', this.workflowId);
        
        try {
            const workflowData = await this.databaseAdapter.loadCompleteWorkflow(this.workflowId);
            
            // Load into local state
            this.localState.loadState(workflowData);
            
            // Update workflow reference
            this.workflowId = workflowData.workflow.id;
            
            // Update counters
            this.stageCounter = Math.max(...workflowData.stages.map(s => s.order || 0), 0);
            this.actionCounter = workflowData.actions.length;
            
            this.logger.log('Workflow loaded into local state');
            
        } catch (error) {
            this.logger.error('Failed to load workflow:', error);
            throw error;
        }
    }
    
    /**
     * Load project roles
     */
    async loadProjectRoles() {
        try {
            const { data: roles, error } = await supabaseClient.client
                .from('roles')
                .select('*')
                .eq('project_id', this.projectId);
            
            if (error) throw error;
            
            this.projectRoles = roles || [];
            this.logger.log(`Loaded ${this.projectRoles.length} project roles`);
            
        } catch (error) {
            this.logger.error('Failed to load project roles:', error);
            this.projectRoles = [];
        }
    }
    
    /**
     * Save workflow to database
     */
    async saveWorkflow() {
        this.logger.log('Saving workflow...');
        
        const saveBtn = document.getElementById('save-workflow-btn');
        if (!saveBtn) {
            this.logger.error('Save button not found');
            app.showNotification('error', 'Error', 'Save button not found');
            return;
        }
        
        // Check for active instances before saving (if not new workflow)
        if (!this.isNewWorkflow) {
            try {
                const instanceCheck = await this.databaseAdapter.checkActiveInstances(this.workflowId);
                
                if (instanceCheck.hasActive) {
                    const confirmMessage = `This workflow has ${instanceCheck.count} active instances with customer data.

Saving will preserve all customer work using UPDATE mode.
                    
Continue with save?`;
                    
                    const confirmed = confirm(confirmMessage);
                    if (!confirmed) {
                        this.logger.log('Save cancelled by user - active instances detected');
                        return;
                    }
                    
                    app.showNotification('info', 'Customer Data Detected', 
                        `Saving ${instanceCheck.count} active instances using safe UPDATE mode`, 
                        { duration: 3000 });
                }
            } catch (error) {
                this.logger.error('Failed to check for active instances:', error);
                // Continue with save - let DatabaseAdapter handle the safety
            }
        }
        
        const originalText = saveBtn.textContent;
        saveBtn.textContent = 'Saving...';
        saveBtn.disabled = true;
        
        try {
            // Get current state for saving
            const workflowData = this.localState.exportState();
            
            // DEBUG: Log workflow data before saving
            this.logger.log('SAVE DEBUG - Workflow data before save:', {
                stagesCount: workflowData.stages?.length || 0,
                actionsCount: workflowData.actions?.length || 0,
                deletedStagesCount: workflowData.deletedStages?.length || 0,
                deletedActionsCount: workflowData.deletedActions?.length || 0,
                deletedStages: workflowData.deletedStages,
                deletedActions: workflowData.deletedActions
            });
            
            // Add project ID to workflow metadata
            workflowData.workflow.project_id = this.projectId;
            
            // Validate before saving
            const validationErrors = this.databaseAdapter.validateWorkflowData(workflowData);
            if (validationErrors.length > 0) {
                throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
            }
            
            // Save to database
            const result = await this.databaseAdapter.saveCompleteWorkflow(workflowData, this.isNewWorkflow);
            
            // Update local state
            if (this.isNewWorkflow) {
                this.workflowId = result.id;
                this.localState.setState('workflow.id', result.id);
                this.isNewWorkflow = false;
                
                // Update URL
                if (window.location.hash.includes('/new')) {
                    window.location.hash = `project/${this.projectId}/workflow-builder/${this.workflowId}`;
                }
            }
            
            // DEBUG: Log deletion results received from database adapter
            this.logger.log('SAVE DEBUG - Deletion results received:', result.deletionResults);
            
            // Only mark as clean if save was not skipped
            if (result.message !== 'Save skipped - already in progress') {
                this.localState.markClean(result.deletionResults);
            } else {
                this.logger.log('Save was skipped - preserving deletion queues for next save attempt');
            }
            
            app.showNotification('success', 'Success', 'Workflow saved successfully');
            this.logger.log('Workflow saved successfully');
            
        } catch (error) {
            this.logger.error('Failed to save workflow:', error);
            app.showNotification('error', 'Save Error', `Failed to save workflow: ${error.message}`);
        } finally {
            if (saveBtn) {
                saveBtn.textContent = originalText;
                saveBtn.disabled = false;
            }
        }
    }
    
    /**
     * Auto-save workflow
     */
    async autoSave() {
        if (!this.workflowId || this.isNewWorkflow) {
            this.logger.log('Skipping auto-save for new workflow');
            return;
        }
        
        // Skip auto-save if there are pending deletions (wait for manual save)
        const state = this.localState.exportState();
        const hasPendingDeletions = (state.deletedStages?.length > 0) || 
                                  (state.deletedActions?.length > 0) || 
                                  (state.deletedQuestions?.length > 0) ||
                                  (state.deletedMappings?.length > 0) ||
                                  (state.deletedSnapshots?.length > 0);
        
        if (hasPendingDeletions) {
            this.logger.log('Skipping auto-save - pending deletions detected (will wait for manual save)');
            return;
        }
        
        try {
            this.logger.log('Auto-saving workflow...');
            
            const workflowData = this.localState.exportState();
            workflowData.workflow.project_id = this.projectId;
            
            // Validate before saving
            const validationErrors = this.databaseAdapter.validateWorkflowData(workflowData);
            if (validationErrors.length > 0) {
                this.logger.warn('Auto-save skipped due to validation errors:', validationErrors);
                return;
            }
            
            const result = await this.databaseAdapter.saveCompleteWorkflow(workflowData, false);
            
            // Only mark as clean if save was not skipped
            if (result.message !== 'Save skipped - already in progress') {
                this.localState.markClean(result.deletionResults);
            }
            
            // Show subtle notification
            app.showNotification('info', 'Auto-saved', 'Workflow auto-saved successfully', { duration: 2000 });
            this.logger.log('Auto-save completed');
            
        } catch (error) {
            this.logger.error('Auto-save failed:', error);
            // Don't show error notification for auto-save failures to avoid annoying users
        }
    }
    
    /**
     * Add new stage
     */
    addStage(type = 'intermediate') {
        const stageData = {
            type: type,
            name: type === 'start' ? 'Start' : type === 'end' ? 'End' : `Stage ${this.stageCounter + 1}`,
            key: `stage_${this.stageCounter + 1}`,
            x: 100 + this.stageCounter * 250,
            y: 200
        };
        
        const stage = this.localState.addStage(stageData);
        this.stageCounter++;
        
        // Create visual node
        this.createStageNode(stage);
        
        this.logger.log('Stage added via local state');
        return stage;
    }
    
    /**
     * Delete stage
     */
    deleteStage(stageId, skipConfirm = false) {
        const stage = this.stages.get(stageId);
        if (!stage) return;
        
        // Check if this is the only start stage
        if (stage.type === 'start' && this.stages.size === 1) {
            app.showNotification('error', 'Error', 'Cannot delete the only start stage');
            return;
        }
        
        if (skipConfirm || confirm(`Are you sure you want to delete stage "${stage.name}"?`)) {
            // DEBUG: Log UI deletion attempt
            this.logger.log('UI DELETE STAGE DEBUG - Attempting to delete stage:', {
                stageId,
                stageName: stage.name,
                stageType: stage.type,
                skipConfirm
            });
            
            // Remove from local state (this will also remove associated actions)
            const deleteResult = this.localState.deleteStage(stageId);
            this.logger.log('UI DELETE STAGE DEBUG - LocalState deletion result:', deleteResult);
            
            // Remove visual elements
            const nodeElement = this.nodes.get(stageId);
            if (nodeElement) {
                nodeElement.remove();
                this.nodes.delete(stageId);
            }
            
            // Remove associated connections
            this.actions.forEach((action, actionId) => {
                if (action.fromStageId === stageId || action.toStageId === stageId) {
                    const connection = this.connections.get(actionId);
                    if (connection) {
                        connection.remove();
                        this.connections.delete(actionId);
                    }
                }
            });
            
            // Clear selection if this stage was selected
            if (this.selection.selectedNode === stageId) {
                this.localState.setState('selection.selectedNode', null);
            }
            
            app.showNotification('success', 'Success', 'Stage deleted successfully');
        }
    }
    
    /**
     * Update stage
     */
    updateStage(stageId, updates) {
        const stage = this.localState.updateStage(stageId, updates);
        if (stage) {
            this.updateStageVisual(stageId);
        }
        return stage;
    }
    
    /**
     * Add action between stages
     */
    addAction(fromStageId, toStageId, actionData = {}) {
        const actionDefaults = {
            fromStageId,
            toStageId,
            name: `Action ${this.actionCounter + 1}`,
            buttonLabel: 'Continue'
        };
        
        const action = this.localState.addAction({ ...actionDefaults, ...actionData });
        this.actionCounter++;
        
        // Create visual connection
        this.createConnection(action);
        
        this.logger.log('Action added via local state');
        return action;
    }
    
    /**
     * Delete action
     */
    deleteAction(actionId) {
        const success = this.localState.deleteAction(actionId);
        if (success) {
            // Remove visual connection
            const connection = this.connections.get(actionId);
            if (connection) {
                connection.remove();
                this.connections.delete(actionId);
            }
        }
        return success;
    }
    
    /**
     * Undo last operation
     */
    undo() {
        const success = this.localState.undo();
        if (success) {
            // Re-render everything
            this.renderWorkflow();
            app.showNotification('info', 'Undo', 'Last action undone', { duration: 1500 });
        }
        return success;
    }
    
    /**
     * Redo last undone operation  
     */
    redo() {
        const success = this.localState.redo();
        if (success) {
            // Re-render everything
            this.renderWorkflow();
            app.showNotification('info', 'Redo', 'Action redone', { duration: 1500 });
        }
        return success;
    }
    
    /**
     * Create workflow snapshot
     */
    async createSnapshot(name = null) {
        const snapshotName = name || `Snapshot ${new Date().toLocaleString()}`;
        
        try {
            const snapshotData = {
                name: snapshotName,
                description: `Snapshot created at ${new Date().toLocaleString()}`,
                state: this.localState.exportState()
            };
            
            if (this.workflowId && !this.isNewWorkflow) {
                await this.databaseAdapter.createWorkflowSnapshot(this.workflowId, snapshotData);
                app.showNotification('success', 'Snapshot Created', `Snapshot "${snapshotName}" created successfully`);
            } else {
                // For new workflows, store locally
                app.showNotification('info', 'Local Snapshot', 'Snapshot created locally. Save workflow to persist snapshots.');
            }
            
        } catch (error) {
            this.logger.error('Failed to create snapshot:', error);
            app.showNotification('error', 'Snapshot Error', `Failed to create snapshot: ${error.message}`);
        }
    }
    
    // UI Update Methods
    
    updateStagesUI() {
        // Update visual nodes
        this.stages.forEach(stage => {
            this.updateStageVisual(stage.id);
        });
    }
    
    updateActionsUI() {
        // Update visual connections
        this.actions.forEach(action => {
            this.updateConnectionVisual(action.id);
        });
    }
    
    updateWorkflowNameUI() {
        const nameInput = document.getElementById('workflow-name-input');
        if (nameInput) {
            nameInput.value = this.workflow.name;
        }
    }
    
    updateSaveButtonState() {
        const saveBtn = document.getElementById('save-workflow-btn');
        if (saveBtn) {
            const isDirty = this.localState.getState('isDirty');
            saveBtn.textContent = isDirty ? '💾 Save *' : '💾 Save';
            saveBtn.classList.toggle('has-changes', isDirty);
        }
    }
    
    updateUndoRedoButtons() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        
        if (undoBtn) {
            undoBtn.disabled = !this.localState.canUndo();
        }
        if (redoBtn) {
            redoBtn.disabled = !this.localState.canRedo();
        }
    }
    
    // Visual rendering methods
    
    createStageNode(stage) {
        this.logger.log('Creating visual node for stage:', stage.id);
        
        const nodesContainer = document.getElementById('workflow-nodes');
        if (!nodesContainer) return;
        
        const nodeElement = document.createElement('div');
        nodeElement.className = `workflow-node ${stage.type}-stage`;
        nodeElement.id = `stage-${stage.id}`;
        nodeElement.style.left = `${stage.x}px`;
        nodeElement.style.top = `${stage.y}px`;
        
        nodeElement.innerHTML = `
            <div class="node-header">
                <div class="node-title">${stage.name}</div>
                <div class="node-type-badge ${stage.type}">${stage.type}</div>
            </div>
            <div class="node-body">
                <div class="node-info">Key: ${stage.key}</div>
                <div class="node-field-count">${stage.formFields?.length || 0} fields</div>
            </div>
        `;
        
        // Add event listeners
        nodeElement.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectStage(stage.id);
        });
        
        nodeElement.addEventListener('contextmenu', (e) => {
            this.showNodeContextMenu(e, stage.id);
        });
        
        // Add drag functionality
        nodeElement.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left mouse button
                this.startDragging(stage.id, e);
            }
        });
        
        // Add double-click to edit
        nodeElement.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.editStage(stage.id);
        });
        
        nodesContainer.appendChild(nodeElement);
        this.nodes.set(stage.id, nodeElement);
        
        return nodeElement;
    }
    
    updateStageVisual(stageId) {
        this.logger.log('Updating visual for stage:', stageId);
        
        const stage = this.stages.get(stageId);
        const nodeElement = this.nodes.get(stageId);
        
        if (!stage || !nodeElement) return;
        
        // Update position
        nodeElement.style.left = `${stage.x}px`;
        nodeElement.style.top = `${stage.y}px`;
        
        // Update content
        const titleElement = nodeElement.querySelector('.node-title');
        if (titleElement) titleElement.textContent = stage.name;
        
        const keyElement = nodeElement.querySelector('.node-info');
        if (keyElement) keyElement.textContent = `Key: ${stage.key}`;
        
        const fieldCountElement = nodeElement.querySelector('.node-field-count');
        if (fieldCountElement) fieldCountElement.textContent = `${stage.formFields?.length || 0} fields`;
    }
    
    createConnection(action) {
        this.logger.log('Creating visual connection for action:', action.id);
        
        const svg = document.getElementById('workflow-connections');
        if (!svg) return;
        
        const fromNode = this.nodes.get(action.fromStageId);
        const toNode = this.nodes.get(action.toStageId);
        
        if (!fromNode || !toNode) return;
        
        // Calculate connection points
        const fromRect = fromNode.getBoundingClientRect();
        const toRect = toNode.getBoundingClientRect();
        const svgRect = svg.getBoundingClientRect();
        
        const fromX = fromRect.right - svgRect.left;
        const fromY = fromRect.top + fromRect.height / 2 - svgRect.top;
        const toX = toRect.left - svgRect.left;
        const toY = toRect.top + toRect.height / 2 - svgRect.top;
        
        // Create SVG path
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const controlPointOffset = Math.abs(toX - fromX) / 3;
        const pathData = `M ${fromX} ${fromY} C ${fromX + controlPointOffset} ${fromY} ${toX - controlPointOffset} ${toY} ${toX} ${toY}`;
        
        path.setAttribute('d', pathData);
        path.setAttribute('class', `connection-line ${action.type === 'edit' ? 'edit-action' : ''}`);
        path.setAttribute('data-action-id', action.id);
        
        // Add click handler
        path.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectAction(action.id);
        });
        
        svg.appendChild(path);
        
        // Add label
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', (fromX + toX) / 2);
        label.setAttribute('y', (fromY + toY) / 2 - 5);
        label.setAttribute('class', 'connection-label');
        label.textContent = action.buttonLabel;
        
        label.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openActionConfigModal(action);
        });
        
        svg.appendChild(label);
        
        this.connections.set(action.id, { path, label });
    }
    
    updateConnectionVisual(actionId) {
        this.logger.log('Updating visual for action:', actionId);
        
        const action = this.actions.get(actionId);
        const connection = this.connections.get(actionId);
        
        if (!action || !connection) return;
        
        const fromNode = this.nodes.get(action.fromStageId);
        const toNode = this.nodes.get(action.toStageId);
        const svg = document.getElementById('workflow-connections');
        
        if (!fromNode || !toNode || !svg) return;
        
        // Recalculate connection points
        const fromRect = fromNode.getBoundingClientRect();
        const toRect = toNode.getBoundingClientRect();
        const svgRect = svg.getBoundingClientRect();
        
        const fromX = fromRect.right - svgRect.left;
        const fromY = fromRect.top + fromRect.height / 2 - svgRect.top;
        const toX = toRect.left - svgRect.left;
        const toY = toRect.top + toRect.height / 2 - svgRect.top;
        
        // Update path
        if (connection.path) {
            const controlPointOffset = Math.abs(toX - fromX) / 3;
            const pathData = `M ${fromX} ${fromY} C ${fromX + controlPointOffset} ${fromY} ${toX - controlPointOffset} ${toY} ${toX} ${toY}`;
            connection.path.setAttribute('d', pathData);
            connection.path.setAttribute('class', `connection-line ${action.type === 'edit' ? 'edit-action' : ''}`);
        }
        
        // Update label position and text
        if (connection.label) {
            connection.label.setAttribute('x', (fromX + toX) / 2);
            connection.label.setAttribute('y', (fromY + toY) / 2 - 5);
            connection.label.textContent = action.buttonLabel;
        }
    }
    
    renderWorkflow() {
        this.logger.log('Rendering complete workflow');
        
        // Clear existing visuals
        const nodesContainer = document.getElementById('workflow-nodes');
        const connectionsContainer = document.getElementById('workflow-connections');
        
        if (nodesContainer) nodesContainer.innerHTML = '';
        if (connectionsContainer) connectionsContainer.innerHTML = '';
        
        this.nodes.clear();
        this.connections.clear();
        
        // Render all stages
        this.stages.forEach(stage => {
            this.createStageNode(stage);
        });
        
        // Render all connections
        this.actions.forEach(action => {
            this.createConnection(action);
        });
    }
    
    setupEventListeners() {
        this.logger.log('Setting up event listeners');
        
        // Canvas click for deselection
        const canvas = document.getElementById('workflow-canvas');
        if (canvas) {
            canvas.addEventListener('click', (e) => {
                if (e.target === canvas) {
                    this.clearSelection();
                }
            });
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'z':
                        e.preventDefault();
                        if (e.shiftKey) {
                            this.redo();
                        } else {
                            this.undo();
                        }
                        break;
                    case 's':
                        e.preventDefault();
                        this.saveWorkflow();
                        break;
                }
            }
        });
    }
    
    // Selection methods
    
    selectStage(stageId) {
        this.clearSelection();
        this.localState.setState('selection.selectedNode', stageId);
        
        const nodeElement = this.nodes.get(stageId);
        if (nodeElement) {
            nodeElement.classList.add('selected');
        }
    }
    
    selectAction(actionId) {
        this.clearSelection();
        this.localState.setState('selection.selectedAction', actionId);
        
        const connection = this.connections.get(actionId);
        if (connection) {
            if (connection.path) connection.path.classList.add('selected');
            if (connection.label) connection.label.classList.add('selected');
        }
    }
    
    clearSelection() {
        // Clear stage selection
        const selectedStage = this.localState.getState('selection.selectedNode');
        if (selectedStage) {
            const nodeElement = this.nodes.get(selectedStage);
            if (nodeElement) nodeElement.classList.remove('selected');
        }
        
        // Clear action selection  
        const selectedAction = this.localState.getState('selection.selectedAction');
        if (selectedAction) {
            const connection = this.connections.get(selectedAction);
            if (connection) {
                if (connection.path) connection.path.classList.remove('selected');
                if (connection.label) connection.label.classList.remove('selected');
            }
        }
        
        this.localState.setState('selection', { selectedNode: null, selectedAction: null });
    }
    
    // Modal and configuration methods
    
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
            { label: 'Edit Stage', action: () => this.editStage(stageId) },
            { label: 'Add Connection', action: () => this.startConnection(stageId) },
            { label: 'Duplicate Stage', action: () => this.duplicateStage(stageId) },
            { label: 'Delete Stage', action: () => this.deleteStageWithConfirm(stageId) }
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
            
            menuItem.addEventListener('click', (e) => {
                e.stopPropagation();
                item.action();
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
        this.logger.log('Starting connection from stage:', fromStageId);
        this.isConnecting = true;
        this.connectingFrom = fromStageId;
        
        // Visual feedback
        const fromNode = this.nodes.get(fromStageId);
        if (fromNode) {
            fromNode.style.border = '3px solid var(--color-primary)';
            fromNode.style.cursor = 'crosshair';
        }
        
        app.showNotification('info', 'Connection Mode', 'Click on another stage to create a connection, or press Escape to cancel');
        
        // Add click handler to other stages
        this.setupConnectionMode();
    }
    
    setupConnectionMode() {
        // Add event listener to detect connection target
        this.connectionClickHandler = (e) => {
            const stageElement = e.target.closest('.workflow-node');
            if (stageElement && this.isConnecting) {
                const targetStageId = stageElement.id.replace('stage-', '');
                if (targetStageId !== this.connectingFrom) {
                    this.createActionConnection(this.connectingFrom, targetStageId);
                }
                this.endConnectionMode();
            }
        };
        
        // Add escape key handler
        this.connectionKeyHandler = (e) => {
            if (e.key === 'Escape' && this.isConnecting) {
                this.endConnectionMode();
            }
        };
        
        document.addEventListener('click', this.connectionClickHandler);
        document.addEventListener('keydown', this.connectionKeyHandler);
    }
    
    endConnectionMode() {
        this.logger.log('Ending connection mode');
        this.isConnecting = false;
        
        // Reset visual feedback
        if (this.connectingFrom) {
            const fromNode = this.nodes.get(this.connectingFrom);
            if (fromNode) {
                fromNode.style.border = '';
                fromNode.style.cursor = '';
            }
        }
        
        this.connectingFrom = null;
        
        // Remove event listeners
        if (this.connectionClickHandler) {
            document.removeEventListener('click', this.connectionClickHandler);
            this.connectionClickHandler = null;
        }
        if (this.connectionKeyHandler) {
            document.removeEventListener('keydown', this.connectionKeyHandler);
            this.connectionKeyHandler = null;
        }
    }
    
    createActionConnection(fromStageId, toStageId) {
        this.logger.log('Creating connection:', fromStageId, '->', toStageId);
        
        const action = this.addAction(fromStageId, toStageId, {
            name: `Action to ${this.stages.get(toStageId)?.name || 'Unknown'}`,
            buttonLabel: 'Continue'
        });
        
        app.showNotification('success', 'Connection Created', 'Stage connection created successfully');
    }
    
    duplicateStage(stageId) {
        const stage = this.stages.get(stageId);
        if (!stage) return;
        
        const newStage = this.addStage(stage.type);
        this.updateStage(newStage.id, {
            name: `${stage.name} (Copy)`,
            key: `${stage.key}_copy_${Date.now()}`,
            x: stage.x + 50,
            y: stage.y + 50,
            maxHours: stage.maxHours,
            allowedRoles: [...stage.allowedRoles],
            formFields: [...stage.formFields]
        });
        
        app.showNotification('success', 'Stage Duplicated', 'Stage duplicated successfully');
    }
    
    deleteStageWithConfirm(stageId) {
        const stage = this.stages.get(stageId);
        if (!stage) return;
        
        if (confirm(`Are you sure you want to delete stage "${stage.name}"?`)) {
            this.deleteStage(stageId, true); // Skip confirmation since we already confirmed
        }
    }
    
    editStage(stageId) {
        const stage = this.stages.get(stageId);
        if (!stage) return;
        
        const newName = prompt('Stage name:', stage.name);
        if (newName && newName !== stage.name) {
            this.updateStage(stageId, { name: newName });
        }
    }
    
    openActionConfigModal(action) {
        const newLabel = prompt('Button label:', action.buttonLabel);
        if (newLabel && newLabel !== action.buttonLabel) {
            this.localState.updateAction(action.id, { buttonLabel: newLabel });
        }
    }
    
    // Placeholder for modal data saving
    saveModalData() {
        this.logger.log('Saving modal data (placeholder)');
        document.getElementById('config-modal').style.display = 'none';
    }
    
    // Drag and drop functionality
    
    startDragging(stageId, e) {
        this.logger.log('Starting drag for stage:', stageId);
        
        this.isDragging = true;
        this.draggedStage = stageId;
        
        const stage = this.stages.get(stageId);
        const nodeElement = this.nodes.get(stageId);
        
        if (!stage || !nodeElement) return;
        
        // Calculate offset from mouse to top-left of element
        const rect = nodeElement.getBoundingClientRect();
        this.dragOffset = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        
        // Add dragging class for visual feedback
        nodeElement.classList.add('dragging');
        
        // Add global mouse event listeners
        document.addEventListener('mousemove', this.handleDragMove);
        document.addEventListener('mouseup', this.handleDragEnd);
        
        // Prevent text selection
        e.preventDefault();
    }
    
    handleDragMove = (e) => {
        if (!this.isDragging || !this.draggedStage) return;
        
        const nodeElement = this.nodes.get(this.draggedStage);
        if (!nodeElement) return;
        
        // Calculate new position
        const canvas = document.getElementById('workflow-canvas');
        const canvasRect = canvas.getBoundingClientRect();
        
        const newX = e.clientX - canvasRect.left - this.dragOffset.x;
        const newY = e.clientY - canvasRect.top - this.dragOffset.y;
        
        // Update visual position immediately
        nodeElement.style.left = `${newX}px`;
        nodeElement.style.top = `${newY}px`;
        
        // Update connections if any exist
        this.updateStageConnections(this.draggedStage);
    }
    
    handleDragEnd = (e) => {
        if (!this.isDragging || !this.draggedStage) return;
        
        this.logger.log('Ending drag for stage:', this.draggedStage);
        
        const nodeElement = this.nodes.get(this.draggedStage);
        if (nodeElement) {
            // Remove dragging class
            nodeElement.classList.remove('dragging');
            
            // Get final position and update state
            const newX = parseInt(nodeElement.style.left);
            const newY = parseInt(nodeElement.style.top);
            
            // Update state with new position
            this.updateStage(this.draggedStage, { x: newX, y: newY });
        }
        
        // Clean up
        this.isDragging = false;
        this.draggedStage = null;
        this.dragOffset = { x: 0, y: 0 };
        
        // Remove global event listeners
        document.removeEventListener('mousemove', this.handleDragMove);
        document.removeEventListener('mouseup', this.handleDragEnd);
    }
    
    updateStageConnections(stageId) {
        // Update all connections that involve this stage
        this.actions.forEach((action, actionId) => {
            if (action.fromStageId === stageId || action.toStageId === stageId) {
                this.updateConnectionVisual(actionId);
            }
        });
    }
    
    // Enhanced stage editing
    
    editStage(stageId) {
        const stage = this.stages.get(stageId);
        if (!stage) return;
        
        this.logger.log('Editing stage:', stageId);
        
        // Create a simple modal for editing stage properties
        const modal = document.getElementById('config-modal');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');
        
        if (!modal || !title || !body) {
            // Fallback to prompt if modal not available
            const newName = prompt('Stage name:', stage.name);
            if (newName && newName !== stage.name) {
                this.updateStage(stageId, { name: newName });
            }
            return;
        }
        
        title.textContent = 'Edit Stage';
        
        body.innerHTML = `
            <div class="form-group">
                <label class="form-label">Stage Name *</label>
                <input type="text" id="stage-name" class="form-input" value="${stage.name}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Stage Key *</label>
                <input type="text" id="stage-key" class="form-input" value="${stage.key}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Stage Type</label>
                <select id="stage-type" class="form-input">
                    <option value="start" ${stage.type === 'start' ? 'selected' : ''}>Start</option>
                    <option value="intermediate" ${stage.type === 'intermediate' ? 'selected' : ''}>Intermediate</option>
                    <option value="end" ${stage.type === 'end' ? 'selected' : ''}>End</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Max Duration (Hours)</label>
                <input type="number" id="stage-max-hours" class="form-input" value="${stage.maxHours || 24}" min="1">
            </div>
        `;
        
        // Store stage ID for saving
        modal.dataset.editingStageId = stageId;
        modal.style.display = 'flex';
    }
    
    // Override saveModalData to handle stage editing
    saveModalData() {
        const modal = document.getElementById('config-modal');
        const editingStageId = modal?.dataset.editingStageId;
        
        if (editingStageId) {
            // Save stage data
            const name = document.getElementById('stage-name')?.value?.trim();
            const key = document.getElementById('stage-key')?.value?.trim();
            const type = document.getElementById('stage-type')?.value;
            const maxHours = parseInt(document.getElementById('stage-max-hours')?.value) || 24;
            
            if (!name || !key) {
                app.showNotification('error', 'Validation Error', 'Stage name and key are required');
                return;
            }
            
            // Check for duplicate keys
            const duplicateStage = Array.from(this.stages.values()).find(s => 
                s.key === key && s.id !== editingStageId
            );
            
            if (duplicateStage) {
                app.showNotification('error', 'Validation Error', 'Stage key must be unique');
                return;
            }
            
            // Update the stage
            this.updateStage(editingStageId, {
                name,
                key,
                type,
                maxHours
            });
            
            app.showNotification('success', 'Success', 'Stage updated successfully');
            
            // Clean up
            delete modal.dataset.editingStageId;
        }
        
        modal.style.display = 'none';
    }
    
    createUI() {
        // Return the same UI structure as original WorkflowBuilder
        return `
            <div class="workflow-builder">
                <div class="workflow-toolbar">
                    <div class="toolbar-section">
                        <div class="toolbar-group">
                            <button id="save-workflow-btn" onclick="workflowBuilder.saveWorkflow()" class="toolbar-btn primary" title="Save Workflow">
                                💾 Save
                            </button>
                            <button onclick="workflowBuilder.createSnapshot()" class="toolbar-btn" title="Create Snapshot">
                                📸 Snapshot
                            </button>
                            <button onclick="workflowBuilder.undo()" id="undoBtn" class="toolbar-btn" title="Undo" disabled>
                                ↶ Undo
                            </button>
                            <button onclick="workflowBuilder.redo()" id="redoBtn" class="toolbar-btn" title="Redo" disabled>
                                ↷ Redo
                            </button>
                        </div>
                        
                        <div class="toolbar-divider"></div>
                        
                        <div class="workflow-title-input">
                            <input type="text" id="workflow-name-input" class="workflow-name-input" 
                                   value="${this.workflow.name}" 
                                   onchange="workflowBuilder.localState.setState('workflow.name', this.value)"
                                   placeholder="Workflow Name">
                        </div>
                        
                        <div class="toolbar-divider"></div>
                        
                        <div class="toolbar-group">
                            <button onclick="workflowBuilder.addStage()" class="toolbar-btn primary" title="Add New Stage">
                                ➕ Add Stage
                            </button>
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
                    
                    <div class="workflow-sidebar">
                        <div class="workflow-sidebar-header">
                            <h3>Workflow Properties</h3>
                        </div>
                        <div class="workflow-sidebar-content" id="workflow-sidebar-content">
                            <!-- Sidebar content -->
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Modals -->
            <div id="config-modal" class="modal-overlay" style="display: none;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 id="modal-title">Configure</h2>
                        <button class="modal-close" onclick="document.getElementById('config-modal').style.display='none'">×</button>
                    </div>
                    <div class="modal-body" id="modal-body">
                        <!-- Modal content -->
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="document.getElementById('config-modal').style.display='none'">Cancel</button>
                        <button class="btn btn-primary" onclick="workflowBuilder.saveModalData()">Save</button>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Get inherited fields for a stage from previous stages (persistent ID approach)
     * This now uses persistent IDs to ensure stable field references for smart dropdowns
     */
    getInheritedFieldsForStage(stageId) {
        const inheritedFields = [];
        const stage = this.stages.get(stageId);

        if (!stage) return inheritedFields;

        // Get all previous stages in workflow order
        const orderedStages = Array.from(this.stages.values())
            .sort((a, b) => (a.order || 0) - (b.order || 0));

        const currentStageIndex = orderedStages.findIndex(s => s.id === stageId);
        if (currentStageIndex <= 0) return inheritedFields; // First stage has no predecessors

        // Collect fields from all previous stages
        for (let i = 0; i < currentStageIndex; i++) {
            const prevStage = orderedStages[i];
            if (prevStage.formFields && prevStage.formFields.length > 0) {
                prevStage.formFields.forEach(field => {
                    inheritedFields.push({
                        ...field,
                        source: `Stage: ${prevStage.name}`,
                        isInherited: true,
                        originalStageId: prevStage.id,
                        // Keep persistent ID for stable references
                        id: field.id,
                        field_key: field.field_key,
                        field_label: field.field_label,
                        field_type: field.field_type
                    });
                });
            }
        }

        this.logger.log(`Found ${inheritedFields.length} inherited fields for stage ${stage.name}`);
        return inheritedFields;
    }

    /**
     * Get field by persistent ID across all stages and actions
     */
    getFieldByPersistentId(fieldId) {
        // Check in LocalStateManager first
        const field = this.localState.getFormField(fieldId);
        if (field) {
            return field;
        }

        // Fallback: search through all stages
        for (const stage of this.stages.values()) {
            if (stage.formFields) {
                const field = stage.formFields.find(f => f.id === fieldId);
                if (field) return field;
            }
        }

        // Fallback: search through all actions
        for (const action of this.actions.values()) {
            if (action.formFields) {
                const field = action.formFields.find(f => f.id === fieldId);
                if (field) return field;
            }
        }

        return null;
    }

    /**
     * Update field references in smart dropdowns when fields are added/removed
     */
    updateSmartDropdownReferences() {
        // Get all fields across stages and actions
        const allFields = this.localState.getAllFormFields();

        for (const field of allFields) {
            if (field.field_type === 'smart_dropdown' && field.field_options?.source_field_id) {
                // Verify that the referenced field still exists
                const referencedField = this.getFieldByPersistentId(field.field_options.source_field_id);
                if (!referencedField) {
                    this.logger.warn(`Smart dropdown ${field.field_label} references non-existent field ${field.field_options.source_field_id}`);
                    // Clear the broken reference
                    field.field_options.source_field_id = '';
                    field.field_options.mappings = [];
                    this.localState.updateFormField(field.id, field);
                }
            }
        }
    }

    /**
     * Cleanup when component is destroyed
     */
    destroy() {
        // Clear auto-save interval
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }

        // Remove event listeners
        window.removeEventListener('beforeunload', this.handleBeforeUnload);

        // Cleanup entity selectors
        this.entitySelectors.forEach(selector => {
            if (selector.destroy) selector.destroy();
        });

        this.logger.log('WorkflowBuilderLocalFirst destroyed');
    }
}

export default WorkflowBuilderLocalFirst;