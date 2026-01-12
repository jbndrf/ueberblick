/**
 * Workflow State Manager
 * Manages both logical and visual state for the workflow builder
 * Provides event-driven architecture and session persistence
 */

export class WorkflowStateManager {
    constructor() {
        this.initialize();
    }

    // =====================================================
    // STATE INITIALIZATION
    // =====================================================

    /**
     * Initialize the state manager
     */
    initialize() {
        this.initializeState();
        this.setupEventSystem();
    }

    /**
     * Initialize default state
     */
    initializeState() {
        // Logical state (database/business logic)
        this.logicalState = {
            workflowId: null,
            projectId: null,
            workflowName: 'New Workflow',
            workflowDescription: '',
            workflowType: 'incident',
            markerColor: '#2563eb',
            stages: new Map(), // id -> stage data
            actions: new Map(), // id -> action data
            projectRoles: []
        };

        // Visual state (canvas positions, zoom, etc.)
        this.visualState = {
            nodePositions: new Map(), // nodeId -> {x, y}
            viewport: {
                zoom: 1,
                panX: 0,
                panY: 0
            },
            canvasSize: {
                width: 0,
                height: 0
            },
            selection: {
                selectedNode: null,
                selectedTransition: null
            }
        };

        // UI state (temporary, not persisted)
        this.uiState = {
            isDragging: false,
            dragOffset: { x: 0, y: 0 },
            connectingFrom: null,
            isConnecting: false
        };

        // Counters for generating unique IDs
        this.counters = {
            nodeCounter: 0,
            actionCounter: 0
        };
    }

    /**
     * Reset state to initial values
     */
    resetState() {
        this.initializeState();
        this.emit('stateReset');
    }

    // =====================================================
    // LOGICAL STATE (Database/Business Logic)
    // =====================================================

    /**
     * Update or add a stage in logical state
     */
    updateStage(stageData) {
        // Validate stage data before updating
        const validation = this.validateStage(stageData);
        if (!validation.isValid) {
            console.warn('Stage validation failed:', validation.errors);
            this.emit('stageValidationFailed', { 
                stageData, 
                errors: validation.errors 
            });
            // Continue with update but emit warning
        }
        
        const stageId = stageData.id;
        if (!stageId) {
            throw new Error('Stage ID is required');
        }
        
        const existingStage = this.logicalState.stages.get(stageId);
        
        // Merge with existing data with safe defaults
        const updatedStage = {
            id: stageId,
            type: 'intermediate',
            title: 'Untitled Stage',
            key: stageId,
            maxHours: 24,
            allowedRoles: [],
            formFields: [],
            ...existingStage,
            ...stageData
        };
        
        // Ensure key uniqueness
        if (this.isStageKeyDuplicate(updatedStage.key, stageId)) {
            updatedStage.key = this.generateUniqueStageKey(updatedStage.key);
            console.warn(`Stage key was duplicate, changed to: ${updatedStage.key}`);
        }

        this.logicalState.stages.set(stageId, updatedStage);
        this.emit('stageUpdated', { stageId, stage: updatedStage, isNew: !existingStage });
        return updatedStage;
    }

    /**
     * Remove stage and cleanup related actions
     */
    removeStage(stageId) {
        const stage = this.logicalState.stages.get(stageId);
        if (!stage) return false;

        // Remove all actions connected to this stage
        const relatedActions = [];
        for (const [actionId, action] of this.logicalState.actions) {
            if (action.fromStageId === stageId || action.toStageId === stageId) {
                relatedActions.push(actionId);
            }
        }

        relatedActions.forEach(actionId => {
            this.logicalState.actions.delete(actionId);
        });

        // Remove the stage
        this.logicalState.stages.delete(stageId);
        
        // Remove visual state
        this.visualState.nodePositions.delete(stageId);
        
        // Clear selection if this stage was selected
        if (this.visualState.selection.selectedNode === stageId) {
            this.visualState.selection.selectedNode = null;
        }

        this.emit('stageRemoved', { stageId, stage, relatedActions });
        return true;
    }

    /**
     * Update or add an action in logical state
     */
    updateAction(actionData) {
        // Validate action data before updating
        const validation = this.validateAction(actionData);
        if (!validation.isValid) {
            console.warn('Action validation failed:', validation.errors);
            this.emit('actionValidationFailed', { 
                actionData, 
                errors: validation.errors 
            });
            // Continue with update but emit warning
        }
        
        const actionId = actionData.id;
        if (!actionId) {
            throw new Error('Action ID is required');
        }
        
        const existingAction = this.logicalState.actions.get(actionId);
        
        // Merge with existing data with safe defaults
        const updatedAction = {
            id: actionId,
            name: 'Untitled Action',
            buttonLabel: 'Action',
            buttonColor: '#007bff',
            allowedRoles: [],
            conditions: {},
            requiresConfirmation: false,
            confirmationMessage: '',
            isEditAction: false,
            formFields: [],
            ...existingAction,
            ...actionData
        };
        
        // Validate stage references exist
        if (updatedAction.fromStageId && !this.logicalState.stages.has(updatedAction.fromStageId)) {
            console.warn(`Action ${actionId} references non-existent from stage: ${updatedAction.fromStageId}`);
        }
        if (updatedAction.toStageId && !this.logicalState.stages.has(updatedAction.toStageId)) {
            console.warn(`Action ${actionId} references non-existent to stage: ${updatedAction.toStageId}`);
        }

        this.logicalState.actions.set(actionId, updatedAction);
        this.emit('actionUpdated', { actionId, action: updatedAction, isNew: !existingAction });
        return updatedAction;
    }

    /**
     * Remove action from logical state
     */
    removeAction(actionId) {
        const action = this.logicalState.actions.get(actionId);
        if (!action) return false;

        this.logicalState.actions.delete(actionId);
        
        // Clear selection if this action was selected
        if (this.visualState.selection.selectedTransition === actionId) {
            this.visualState.selection.selectedTransition = null;
        }

        this.emit('actionRemoved', { actionId, action });
        return true;
    }

    /**
     * Get stage by ID
     */
    getStageById(stageId) {
        return this.logicalState.stages.get(stageId);
    }

    /**
     * Get action by ID
     */
    getActionById(actionId) {
        return this.logicalState.actions.get(actionId);
    }

    /**
     * Get all stages as array
     */
    getAllStages() {
        return Array.from(this.logicalState.stages.values());
    }

    /**
     * Get all actions as array
     */
    getAllActions() {
        return Array.from(this.logicalState.actions.values());
    }

    // =====================================================
    // VISUAL STATE (Canvas Positions, Zoom, etc.)
    // =====================================================

    /**
     * Update node position on canvas
     */
    updateNodePosition(nodeId, x, y) {
        this.visualState.nodePositions.set(nodeId, { x, y });
        this.emit('nodePositionUpdated', { nodeId, x, y });
    }

    /**
     * Get node position
     */
    getNodePosition(nodeId) {
        return this.visualState.nodePositions.get(nodeId) || { x: 0, y: 0 };
    }

    /**
     * Update viewport (zoom/pan)
     */
    updateViewport(zoom, panX, panY) {
        this.visualState.viewport = { zoom, panX, panY };
        this.emit('viewportUpdated', { zoom, panX, panY });
    }

    /**
     * Get current viewport state
     */
    getViewport() {
        return { ...this.visualState.viewport };
    }

    /**
     * Update canvas size
     */
    updateCanvasSize(width, height) {
        this.visualState.canvasSize = { width, height };
        this.emit('canvasSizeUpdated', { width, height });
    }

    /**
     * Update selection state
     */
    updateSelection(selectedNode = null, selectedTransition = null) {
        this.visualState.selection = { selectedNode, selectedTransition };
        this.emit('selectionUpdated', { selectedNode, selectedTransition });
    }

    /**
     * Get current selection
     */
    getSelection() {
        return { ...this.visualState.selection };
    }

    // =====================================================
    // WORKFLOW METADATA
    // =====================================================

    /**
     * Update workflow metadata
     */
    updateWorkflowMetadata(metadata) {
        Object.assign(this.logicalState, metadata);
        this.emit('workflowMetadataUpdated', metadata);
    }

    /**
     * Get workflow metadata
     */
    getWorkflowMetadata() {
        return {
            workflowId: this.logicalState.workflowId,
            projectId: this.logicalState.projectId,
            workflowName: this.logicalState.workflowName,
            workflowDescription: this.logicalState.workflowDescription,
            workflowType: this.logicalState.workflowType,
            markerColor: this.logicalState.markerColor
        };
    }

    // =====================================================
    // SERIALIZATION
    // =====================================================

    /**
     * Create database-ready JSON (logical state only)
     */
    serializeForDatabase() {
        return {
            workflow: this.getWorkflowMetadata(),
            stages: this.getAllStages(),
            actions: this.getAllActions()
        };
    }

    /**
     * Create export JSON with visual data
     */
    serializeForExport() {
        return {
            workflow: this.getWorkflowMetadata(),
            stages: this.getAllStages(),
            actions: this.getAllActions(),
            visualState: this.serializeVisualState(),
            version: '1.0.0',
            exportedAt: new Date().toISOString()
        };
    }

    /**
     * Serialize just visual state for session storage
     */
    serializeVisualState() {
        return {
            nodePositions: Object.fromEntries(this.visualState.nodePositions),
            viewport: this.visualState.viewport,
            canvasSize: this.visualState.canvasSize,
            selection: this.visualState.selection
        };
    }

    // =====================================================
    // DESERIALIZATION
    // =====================================================

    /**
     * Load from database format
     */
    loadFromDatabase(data) {
        this.resetState();

        // Load workflow metadata
        if (data.workflow) {
            this.updateWorkflowMetadata(data.workflow);
        }

        // Load stages
        if (data.stages && Array.isArray(data.stages)) {
            data.stages.forEach(stage => {
                this.logicalState.stages.set(stage.id, stage);
            });
        }

        // Load actions
        if (data.actions && Array.isArray(data.actions)) {
            data.actions.forEach(action => {
                this.logicalState.actions.set(action.id, action);
            });
        }

        this.emit('dataLoaded', { source: 'database', data });
    }

    /**
     * Load from export format
     */
    loadFromExport(data) {
        this.loadFromDatabase(data);

        // Load visual state if available
        if (data.visualState) {
            this.loadVisualState(data.visualState);
        }

        this.emit('dataLoaded', { source: 'export', data });
    }

    /**
     * Load visual state from session or export
     */
    loadVisualState(visualData) {
        if (visualData.nodePositions) {
            this.visualState.nodePositions = new Map(Object.entries(visualData.nodePositions));
        }

        if (visualData.viewport) {
            this.visualState.viewport = { ...visualData.viewport };
        }

        if (visualData.canvasSize) {
            this.visualState.canvasSize = { ...visualData.canvasSize };
        }

        if (visualData.selection) {
            this.visualState.selection = { ...visualData.selection };
        }

        this.emit('visualStateLoaded', visualData);
    }

    // =====================================================
    // VALIDATION
    // =====================================================

    /**
     * Validate workflow integrity
     */
    validateWorkflow(mode = 'strict') {
        // Use the modern validator if available
        if (this.validator) {
            const workflowData = this.serializeForDatabase();
            return this.validator.validateComplete(workflowData, mode);
        }
        
        // Fallback to legacy validation (for backward compatibility)
        const errors = [];
        const warnings = [];

        // Check for at least one start stage
        const startStages = this.getAllStages().filter(stage => stage.type === 'start');
        if (startStages.length === 0) {
            errors.push('Workflow must have at least one start stage');
        } else if (startStages.length > 1) {
            errors.push('Workflow can only have one start stage');
        }

        // Check for at least one end stage (lenient in draft mode)
        const endStages = this.getAllStages().filter(stage => stage.type === 'end');
        if (endStages.length === 0) {
            const message = 'Workflow must have at least one end stage';
            if (mode === 'lenient') {
                warnings.push(message);
            } else {
                errors.push(message);
            }
        }

        // Validate stage keys are unique
        const stageKeys = new Set();
        for (const stage of this.getAllStages()) {
            if (stageKeys.has(stage.key)) {
                errors.push(`Duplicate stage key: ${stage.key}`);
            }
            stageKeys.add(stage.key);
        }

        // Check for orphaned stages (lenient in draft mode)
        const connectedStages = new Set();
        for (const action of this.getAllActions()) {
            connectedStages.add(action.fromStageId);
            connectedStages.add(action.toStageId);
        }

        for (const stage of this.getAllStages()) {
            if (!connectedStages.has(stage.id) && stage.type !== 'start') {
                const message = `Orphaned stage: ${stage.title || stage.id}`;
                if (mode === 'lenient') {
                    warnings.push(message);
                } else {
                    errors.push(message);
                }
            }
        }

        return {
            isValid: errors.length === 0,
            hasWarnings: warnings.length > 0,
            errors,
            warnings,
            mode
        };
    }

    /**
     * Validate single stage
     */
    validateStage(stageData) {
        const errors = [];

        if (!stageData.title || stageData.title.trim().length === 0) {
            errors.push('Stage must have a title');
        }

        if (!stageData.key || stageData.key.trim().length === 0) {
            errors.push('Stage must have a key');
        } else if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(stageData.key)) {
            errors.push('Stage key must start with a letter and contain only letters, numbers, and underscores');
        }

        if (!stageData.type || !['start', 'intermediate', 'end'].includes(stageData.type)) {
            errors.push('Stage must have a valid type (start, intermediate, or end)');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate single action
     */
    validateAction(actionData) {
        const errors = [];

        if (!actionData.name || actionData.name.trim().length === 0) {
            errors.push('Action must have a name');
        }

        if (!actionData.fromStageId) {
            errors.push('Action must have a source stage');
        }

        if (!actionData.toStageId) {
            errors.push('Action must have a target stage');
        }

        if (actionData.fromStageId === actionData.toStageId && !actionData.isEditAction) {
            errors.push('Action cannot connect a stage to itself unless it is an edit action');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // =====================================================
    // EVENT SYSTEM
    // =====================================================

    /**
     * Setup event system
     */
    setupEventSystem() {
        this.eventListeners = new Map();
    }

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
                console.error(`Error in event listener for ${eventName}:`, error);
            }
        });
    }

    // =====================================================
    // LEGACY COMPATIBILITY
    // =====================================================

    /**
     * Convert to legacy format (nodes/transitions arrays)
     */
    toLegacyFormat() {
        const nodes = this.getAllStages().map(stage => {
            const position = this.getNodePosition(stage.id);
            return {
                id: stage.id,
                dbId: stage.dbId,
                type: stage.type,
                title: stage.title,
                key: stage.key,
                x: position.x,
                y: position.y,
                maxHours: stage.maxHours,
                allowedRoles: stage.allowedRoles || [],
                formId: stage.formId,
                formFields: stage.formFields || []
            };
        });

        const transitions = this.getAllActions().map(action => ({
            id: action.id,
            dbId: action.dbId,
            fromId: action.fromStageId,
            toId: action.toStageId,
            name: action.name,
            buttonLabel: action.buttonLabel,
            buttonColor: action.buttonColor,
            allowedRoles: action.allowedRoles || [],
            conditions: action.conditions || {},
            requiresConfirmation: action.requiresConfirmation || false,
            confirmationMessage: action.confirmationMessage || '',
            isEditAction: action.isEditAction || false,
            formId: action.formId
        }));

        return { nodes, transitions };
    }

    /**
     * Load from legacy format (nodes/transitions arrays)
     */
    fromLegacyFormat(nodes, transitions) {
        this.resetState();

        // Convert nodes to stages
        nodes.forEach(node => {
            const stage = {
                id: node.id,
                dbId: node.dbId,
                type: node.type,
                title: node.title,
                key: node.key,
                maxHours: node.maxHours,
                allowedRoles: node.allowedRoles || [],
                formId: node.formId,
                formFields: node.formFields || []
            };

            this.logicalState.stages.set(node.id, stage);
            this.visualState.nodePositions.set(node.id, { x: node.x, y: node.y });
        });

        // Convert transitions to actions
        transitions.forEach(transition => {
            const action = {
                id: transition.id,
                dbId: transition.dbId,
                fromStageId: transition.fromId,
                toStageId: transition.toId,
                name: transition.name,
                buttonLabel: transition.buttonLabel,
                buttonColor: transition.buttonColor,
                allowedRoles: transition.allowedRoles || [],
                conditions: transition.conditions || {},
                requiresConfirmation: transition.requiresConfirmation || false,
                confirmationMessage: transition.confirmationMessage || '',
                isEditAction: transition.isEditAction || false,
                formId: transition.formId
            };

            this.logicalState.actions.set(transition.id, action);
        });

        this.emit('legacyDataLoaded', { nodes, transitions });
    }

    // =====================================================
    // VALIDATION HELPERS
    // =====================================================
    
    /**
     * Check if stage key is duplicate (excluding current stage)
     */
    isStageKeyDuplicate(key, currentStageId) {
        for (const [stageId, stage] of this.logicalState.stages) {
            if (stageId !== currentStageId && stage.key === key) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * Generate unique stage key
     */
    generateUniqueStageKey(baseKey) {
        let counter = 1;
        let uniqueKey = `${baseKey}_${counter}`;
        
        while (this.isStageKeyDuplicate(uniqueKey, null)) {
            counter++;
            uniqueKey = `${baseKey}_${counter}`;
        }
        
        return uniqueKey;
    }
    
    /**
     * Validate workflow metadata
     */
    validateWorkflowMetadata(metadata) {
        const errors = [];
        
        if (metadata.workflowName && metadata.workflowName.trim().length === 0) {
            errors.push('Workflow name cannot be empty');
        }
        
        if (metadata.workflowType && !['incident', 'survey'].includes(metadata.workflowType)) {
            errors.push('Workflow type must be either "incident" or "survey"');
        }
        
        if (metadata.markerColor && !/^#[0-9A-Fa-f]{6}$/.test(metadata.markerColor)) {
            errors.push('Marker color must be a valid hex color code');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    
    /**
     * Validate before state operations
     */
    validateOperation(operation, data) {
        const errors = [];
        
        try {
            switch (operation) {
                case 'updateStage':
                    if (!data || !data.id) {
                        errors.push('Stage ID is required');
                    }
                    break;
                    
                case 'updateAction':
                    if (!data || !data.id) {
                        errors.push('Action ID is required');
                    }
                    if (!data.fromStageId || !data.toStageId) {
                        errors.push('Action must have both from and to stages');
                    }
                    break;
                    
                case 'removeStage':
                    if (!data) {
                        errors.push('Stage ID is required for removal');
                    }
                    // Check if this would leave workflow invalid
                    const stage = this.logicalState.stages.get(data);
                    if (stage && stage.type === 'start') {
                        const startStages = this.getAllStages().filter(s => s.type === 'start');
                        if (startStages.length === 1) {
                            errors.push('Cannot remove the only start stage');
                        }
                    }
                    break;
                    
                default:
                    // Operation validation passed
                    break;
            }
        } catch (error) {
            errors.push(`Validation error: ${error.message}`);
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // =====================================================
    // UTILITY METHODS
    // =====================================================

    /**
     * Generate unique stage ID
     */
    generateStageId() {
        return `stage_${++this.counters.nodeCounter}`;
    }

    /**
     * Generate unique action ID
     */
    generateActionId() {
        return `action_${++this.counters.actionCounter}`;
    }

    /**
     * Get workflow statistics
     */
    getWorkflowStats() {
        return {
            stageCount: this.logicalState.stages.size,
            actionCount: this.logicalState.actions.size,
            startStages: this.getAllStages().filter(s => s.type === 'start').length,
            endStages: this.getAllStages().filter(s => s.type === 'end').length,
            intermediateStages: this.getAllStages().filter(s => s.type === 'intermediate').length
        };
    }

    /**
     * Cleanup resources
     */
    destroy() {
        this.eventListeners.clear();
        this.resetState();
        this.emit('destroyed');
    }
}

export default WorkflowStateManager;