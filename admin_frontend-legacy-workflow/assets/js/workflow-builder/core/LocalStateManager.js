/**
 * LocalStateManager - Local-first state management for workflow builder
 * Handles all state mutations, change notifications, and history tracking
 */

import DebugLogger from '../../core/debug-logger.js';

class LocalStateManager {
    constructor() {
        // Main application state
        this.state = {
            workflow: {
                id: null,
                name: `New Workflow ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
                description: '',
                workflow_type: 'incident',
                marker_color: '#2563eb',
                icon_config: {},
                is_active: true
            },
            stages: new Map(),
            actions: new Map(),
            formFields: new Map(),
            deletedActions: new Set(), // Track explicitly deleted actions
            deletedStages: new Set(), // Track explicitly deleted stages
            deletedQuestions: new Set(), // Track explicitly deleted questions
            deletedMappings: new Set(), // Track explicitly deleted mappings
            deletedSnapshots: new Set(), // Track explicitly deleted snapshots
            
            // Metadata
            isDirty: false,
            lastSaved: null,
            version: 1,
            
            // UI state
            selection: {
                selectedNode: null,
                selectedAction: null
            },
            viewport: {
                zoom: 1,
                panX: 0,
                panY: 0
            }
        };
        
        // Change listeners
        this.listeners = new Set();
        
        // History for undo/redo
        this.history = [];
        this.historyIndex = -1;
        this.maxHistorySize = 50;
        
        // Debounced operations
        this.debouncedNotify = this.debounce(this._notifyListeners.bind(this), 10);
        
        // Initialize logger
        this.logger = new DebugLogger('LocalStateManager');
        this.logger.log('LocalStateManager initialized');
    }
    
    /**
     * Get state value by path (e.g., 'workflow.name' or 'stages')
     */
    getState(path = null) {
        if (!path) return this.state;
        
        const parts = path.split('.');
        let current = this.state;
        
        for (const part of parts) {
            if (current === null || current === undefined) {
                return undefined;
            }
            current = current[part];
        }
        
        return current;
    }
    
    /**
     * Set state value by path with change tracking
     */
    setState(path, value, { silent = false, skipHistory = false } = {}) {
        const oldValue = this.getState(path);
        
        // Don't update if value is the same
        if (oldValue === value) return;
        
        // Save to history before making changes
        if (!skipHistory && !this.state.isDirty) {
            this.pushHistory();
        }
        
        // Update the state
        this._setNestedValue(this.state, path, value);
        
        // Mark as dirty if this is a data change (not UI state)
        if (!path.startsWith('viewport') && !path.startsWith('selection')) {
            this.state.isDirty = true;
        }
        
        // Notify listeners
        if (!silent) {
            this.debouncedNotify(path, value, oldValue);
        }
        
        this.logger.log(`State updated: ${path} =`, value);
    }
    
    /**
     * Subscribe to state changes
     */
    subscribe(listener) {
        this.listeners.add(listener);
        
        // Return unsubscribe function
        return () => {
            this.listeners.delete(listener);
        };
    }
    
    /**
     * Add a stage to the workflow
     */
    addStage(stageData) {
        const stage = {
            id: stageData.id || this.generatePersistentId(),
            key: stageData.key || `stage_${Date.now()}`,
            name: stageData.name || 'New Stage',
            type: stageData.type || 'intermediate',
            order: stageData.order || this.state.stages.size + 1,
            maxHours: stageData.maxHours || 24,
            allowedRoles: stageData.allowedRoles || [],
            x: stageData.x || 100,
            y: stageData.y || 200,
            formFields: stageData.formFields || [],
            visual_config: stageData.visual_config || {}
        };
        
        this.pushHistory();
        this.state.stages.set(stage.id, stage);
        this.state.isDirty = true;
        this.debouncedNotify('stages', this.state.stages);
        
        this.logger.log('Stage added:', stage);
        return stage;
    }
    
    /**
     * Update an existing stage
     */
    updateStage(stageId, updates) {
        const stage = this.state.stages.get(stageId);
        if (!stage) {
            this.logger.warn('Stage not found for update:', stageId);
            return null;
        }
        
        this.pushHistory();
        Object.assign(stage, updates);
        this.state.isDirty = true;
        this.debouncedNotify('stages', this.state.stages);
        
        this.logger.log('Stage updated:', stageId, updates);
        return stage;
    }
    
    /**
     * Delete a stage
     */
    deleteStage(stageId) {
        const stage = this.state.stages.get(stageId);
        if (!stage) {
            this.logger.warn('Stage not found for deletion:', stageId);
            return false;
        }
        
        this.pushHistory();
        
        // Remove associated actions
        const actionsToDelete = [];
        for (const [actionId, action] of this.state.actions) {
            if (action.fromStageId === stageId || action.toStageId === stageId) {
                actionsToDelete.push(actionId);
            }
        }
        
        actionsToDelete.forEach(actionId => {
            this.state.actions.delete(actionId);
            this.state.deletedActions.add(actionId); // Track deleted actions
        });
        
        // Remove the stage
        this.state.stages.delete(stageId);
        this.state.deletedStages.add(stageId); // Track deleted stage
        this.state.isDirty = true;
        
        this.debouncedNotify('stages', this.state.stages);
        this.debouncedNotify('actions', this.state.actions);
        
        // DEBUG: Log deletion tracking
        this.logger.log('DELETE STAGE DEBUG - Stage deleted and added to deletion tracking:', {
            stageId,
            deletedStagesSize: this.state.deletedStages.size,
            deletedStagesArray: Array.from(this.state.deletedStages),
            remainingStagesCount: this.state.stages.size
        });
        
        return true;
    }
    
    /**
     * Add an action to the workflow
     */
    addAction(actionData) {
        const action = {
            id: actionData.id || this.generatePersistentId(),
            fromStageId: actionData.fromStageId,
            toStageId: actionData.toStageId,
            name: actionData.name || 'New Action',
            type: actionData.type || 'forward',
            buttonLabel: actionData.buttonLabel || 'Continue',
            buttonColor: actionData.buttonColor || '#007bff',
            allowedRoles: actionData.allowedRoles || [],
            conditions: actionData.conditions || {},
            requiresConfirmation: actionData.requiresConfirmation || false,
            confirmationMessage: actionData.confirmationMessage || '',
            formFields: actionData.formFields || []
        };
        
        this.pushHistory();
        this.state.actions.set(action.id, action);
        this.state.isDirty = true;
        this.debouncedNotify('actions', this.state.actions);
        
        this.logger.log('Action added:', action);
        return action;
    }
    
    /**
     * Update an existing action
     */
    updateAction(actionId, updates) {
        const action = this.state.actions.get(actionId);
        if (!action) {
            this.logger.warn('Action not found for update:', actionId);
            return null;
        }
        
        this.pushHistory();
        Object.assign(action, updates);
        this.state.isDirty = true;
        this.debouncedNotify('actions', this.state.actions);
        
        this.logger.log('Action updated:', actionId, updates);
        return action;
    }
    
    /**
     * Delete an action
     */
    deleteAction(actionId) {
        const action = this.state.actions.get(actionId);
        if (!action) {
            this.logger.warn('Action not found for deletion:', actionId);
            return false;
        }
        
        this.pushHistory();
        this.state.actions.delete(actionId);
        this.state.deletedActions.add(actionId); // Track explicit deletion
        this.state.isDirty = true;
        this.debouncedNotify('actions', this.state.actions);
        
        this.logger.log('Action deleted and tracked for removal:', actionId);
        return true;
    }
    
    /**
     * Get and clear explicitly deleted actions
     */
    getAndClearDeletedActions() {
        const deleted = Array.from(this.state.deletedActions);
        this.state.deletedActions.clear();
        return deleted;
    }
    
    /**
     * Track explicitly deleted stage
     */
    trackDeletedStage(stageId) {
        this.state.deletedStages.add(stageId);
    }
    
    /**
     * Track explicitly deleted question/field
     */
    trackDeletedQuestion(questionId) {
        this.state.deletedQuestions.add(questionId);
    }

    /**
     * Add a form field to a stage with persistent ID
     */
    addFormField(stageId, fieldData) {
        const field = {
            id: fieldData.id || this.generatePersistentId(),
            field_key: fieldData.field_key,
            field_label: fieldData.field_label,
            field_type: fieldData.field_type,
            field_order: fieldData.field_order || 1,
            is_required: fieldData.is_required || false,
            placeholder: fieldData.placeholder || '',
            help_text: fieldData.help_text || '',
            validation_rules: fieldData.validation_rules || {},
            field_options: fieldData.field_options || {},
            conditional_logic: fieldData.conditional_logic || {},
            page: fieldData.page || 1,
            page_title: fieldData.page_title || ''
        };

        this.pushHistory();

        // Add to global form fields map
        this.state.formFields.set(field.id, field);

        // Add to stage's form fields array
        const stage = this.state.stages.get(stageId);
        if (stage) {
            if (!stage.formFields) stage.formFields = [];
            stage.formFields.push(field);
        }

        this.state.isDirty = true;
        this.debouncedNotify('formFields', this.state.formFields);
        this.debouncedNotify('stages', this.state.stages);

        this.logger.log('Form field added with persistent ID:', field.id, field);
        return field;
    }

    /**
     * Update a form field while preserving persistent ID
     */
    updateFormField(fieldId, updates) {
        const field = this.state.formFields.get(fieldId);
        if (!field) {
            this.logger.warn('Form field not found for update:', fieldId);
            return null;
        }

        this.pushHistory();

        // Update in global map
        Object.assign(field, updates);

        // Update in all stages that contain this field
        for (const stage of this.state.stages.values()) {
            if (stage.formFields) {
                const stageFieldIndex = stage.formFields.findIndex(f => f.id === fieldId);
                if (stageFieldIndex !== -1) {
                    stage.formFields[stageFieldIndex] = { ...field };
                }
            }
        }

        // Update in all actions that contain this field
        for (const action of this.state.actions.values()) {
            if (action.formFields) {
                const actionFieldIndex = action.formFields.findIndex(f => f.id === fieldId);
                if (actionFieldIndex !== -1) {
                    action.formFields[actionFieldIndex] = { ...field };
                }
            }
        }

        this.state.isDirty = true;
        this.debouncedNotify('formFields', this.state.formFields);
        this.debouncedNotify('stages', this.state.stages);
        this.debouncedNotify('actions', this.state.actions);

        this.logger.log('Form field updated with persistent ID:', fieldId, updates);
        return field;
    }

    /**
     * Delete a form field and track for database deletion
     */
    deleteFormField(fieldId) {
        const field = this.state.formFields.get(fieldId);
        if (!field) {
            this.logger.warn('Form field not found for deletion:', fieldId);
            return false;
        }

        this.pushHistory();

        // Remove from global map
        this.state.formFields.delete(fieldId);

        // Track for database deletion
        this.state.deletedQuestions.add(fieldId);

        // Remove from all stages
        for (const stage of this.state.stages.values()) {
            if (stage.formFields) {
                stage.formFields = stage.formFields.filter(f => f.id !== fieldId);
            }
        }

        // Remove from all actions
        for (const action of this.state.actions.values()) {
            if (action.formFields) {
                action.formFields = action.formFields.filter(f => f.id !== fieldId);
            }
        }

        this.state.isDirty = true;
        this.debouncedNotify('formFields', this.state.formFields);
        this.debouncedNotify('stages', this.state.stages);
        this.debouncedNotify('actions', this.state.actions);

        this.logger.log('Form field deleted and tracked for removal:', fieldId);
        return true;
    }

    /**
     * Get form field by persistent ID
     */
    getFormField(fieldId) {
        return this.state.formFields.get(fieldId);
    }

    /**
     * Get all form fields with persistent IDs
     */
    getAllFormFields() {
        return Array.from(this.state.formFields.values());
    }
    
    /**
     * Track explicitly deleted mapping
     */
    trackDeletedMapping(mappingId) {
        this.state.deletedMappings.add(mappingId);
    }
    
    /**
     * Track explicitly deleted snapshot
     */
    trackDeletedSnapshot(snapshotName) {
        this.state.deletedSnapshots.add(snapshotName);
    }
    
    /**
     * Load complete state from external source
     */
    loadState(newState, { resetHistory = true } = {}) {
        this.logger.log('Loading state:', newState);
        
        // Store old state for comparison
        const oldState = this.state;
        
        // IMPORTANT: Preserve deletion tracking when loading state from database
        // This ensures that deletion queues are not accidentally cleared on load
        const preservedDeletions = {
            deletedActions: new Set(this.state.deletedActions),
            deletedStages: new Set(this.state.deletedStages),
            deletedQuestions: new Set(this.state.deletedQuestions),
            deletedMappings: new Set(this.state.deletedMappings),
            deletedSnapshots: new Set(this.state.deletedSnapshots)
        };
        
        // Update state
        this.state = {
            ...this.state,
            ...newState,
            isDirty: false,
            lastSaved: Date.now(),
            version: (newState.version || 0) + 1,
            // Restore preserved deletion sets (don't overwrite with empty sets from database load)
            deletedActions: preservedDeletions.deletedActions,
            deletedStages: preservedDeletions.deletedStages,
            deletedQuestions: preservedDeletions.deletedQuestions,
            deletedMappings: preservedDeletions.deletedMappings,
            deletedSnapshots: preservedDeletions.deletedSnapshots
        };
        
        // Convert arrays to Maps if needed
        if (newState.stages && Array.isArray(newState.stages)) {
            this.state.stages = new Map(newState.stages.map(s => [s.id, s]));
        }
        if (newState.actions && Array.isArray(newState.actions)) {
            this.state.actions = new Map(newState.actions.map(a => [a.id, a]));
        }
        if (newState.formFields && Array.isArray(newState.formFields)) {
            this.state.formFields = new Map(newState.formFields.map(f => [f.id, f]));
        }
        
        // Reset history if requested
        if (resetHistory) {
            this.history = [];
            this.historyIndex = -1;
        }
        
        // DEBUG: Log preserved deletions
        if (preservedDeletions.deletedStages.size > 0 || preservedDeletions.deletedActions.size > 0) {
            this.logger.log('LOAD STATE DEBUG - Preserved deletion queues:', {
                deletedStages: Array.from(preservedDeletions.deletedStages),
                deletedActions: Array.from(preservedDeletions.deletedActions)
            });
        }
        
        // Notify all listeners of complete state change
        this._notifyListeners('*', this.state, oldState);
        
        this.logger.log('State loaded successfully');
    }
    
    /**
     * Export current state for saving
     */
    exportState() {
        const exportedData = {
            workflow: { ...this.state.workflow },
            stages: Array.from(this.state.stages.values()),
            actions: Array.from(this.state.actions.values()),
            formFields: Array.from(this.state.formFields.values()),
            deletedActions: Array.from(this.state.deletedActions),
            deletedStages: Array.from(this.state.deletedStages),
            deletedQuestions: Array.from(this.state.deletedQuestions),
            deletedMappings: Array.from(this.state.deletedMappings),
            deletedSnapshots: Array.from(this.state.deletedSnapshots),
            version: this.state.version
        };
        
        // DEBUG: Log deletion queue sizes for debugging
        if (exportedData.deletedStages.length > 0 || exportedData.deletedActions.length > 0) {
            this.logger.log('EXPORT STATE DEBUG - Deleted items in export:', {
                deletedStages: exportedData.deletedStages,
                deletedActions: exportedData.deletedActions,
                stagesSetSize: this.state.deletedStages.size,
                actionsSetSize: this.state.deletedActions.size
            });
        }
        
        return exportedData;
    }
    
    /**
     * Mark state as clean (after successful save)
     * @param {Object} deletionResults - Results from deletion operations indicating what was actually deleted
     */
    markClean(deletionResults = null) {
        this.state.isDirty = false;
        this.state.lastSaved = Date.now();
        
        if (deletionResults) {
            // Only clear items that were actually deleted
            if (deletionResults.deletedStages && deletionResults.deletedStages.length > 0) {
                deletionResults.deletedStages.forEach(stageId => {
                    this.state.deletedStages.delete(stageId);
                });
                this.logger.log(`Cleared ${deletionResults.deletedStages.length} successfully deleted stages from local tracking`);
            }
            
            if (deletionResults.deletedQuestions && deletionResults.deletedQuestions.length > 0) {
                deletionResults.deletedQuestions.forEach(questionId => {
                    this.state.deletedQuestions.delete(questionId);
                });
            }
            
            if (deletionResults.deletedMappings && deletionResults.deletedMappings.length > 0) {
                deletionResults.deletedMappings.forEach(mappingId => {
                    this.state.deletedMappings.delete(mappingId);
                });
            }
            
            if (deletionResults.deletedSnapshots && deletionResults.deletedSnapshots.length > 0) {
                deletionResults.deletedSnapshots.forEach(snapshotName => {
                    this.state.deletedSnapshots.delete(snapshotName);
                });
            }
            
            // Always clear deleted actions (they don't have protection logic)
            this.state.deletedActions.clear();
            
            // Log protected stages that remain in deletion queue
            if (deletionResults.protectedStages && deletionResults.protectedStages.length > 0) {
                this.logger.warn(`${deletionResults.protectedStages.length} stages remain in deletion queue (protected by active instances):`, deletionResults.protectedStages);
            }
        } else {
            // Fallback: clear all deleted items (backwards compatibility)
            this.state.deletedActions.clear();
            this.state.deletedStages.clear();
            this.state.deletedQuestions.clear();
            this.state.deletedMappings.clear();
            this.state.deletedSnapshots.clear();
            this.logger.log('State marked as clean, all deleted items cleared (legacy mode)');
        }
        
        this.debouncedNotify('isDirty', false);
    }
    
    /**
     * Push current state to history for undo/redo
     */
    pushHistory() {
        // Don't save if already at max history
        if (this.history.length >= this.maxHistorySize) {
            this.history.shift();
            this.historyIndex = Math.max(0, this.historyIndex - 1);
        }
        
        // Remove any history after current index (when undoing then making new changes)
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        
        // Create deep copy of current state
        const snapshot = {
            workflow: { ...this.state.workflow },
            stages: new Map(this.state.stages),
            actions: new Map(this.state.actions),
            formFields: new Map(this.state.formFields),
            timestamp: Date.now()
        };
        
        this.history.push(snapshot);
        this.historyIndex = this.history.length - 1;
        
        this.logger.log(`History snapshot created (${this.history.length} total)`);
    }
    
    /**
     * Undo last operation
     */
    undo() {
        if (this.historyIndex <= 0) {
            this.logger.log('Cannot undo: at beginning of history');
            return false;
        }
        
        this.historyIndex--;
        const snapshot = this.history[this.historyIndex];
        
        // Restore state without adding to history
        this.state.workflow = { ...snapshot.workflow };
        this.state.stages = new Map(snapshot.stages);
        this.state.actions = new Map(snapshot.actions);
        this.state.formFields = new Map(snapshot.formFields);
        this.state.isDirty = true;
        
        this._notifyListeners('*', this.state);
        this.logger.log(`Undo performed (${this.historyIndex + 1}/${this.history.length})`);
        return true;
    }
    
    /**
     * Redo last undone operation
     */
    redo() {
        if (this.historyIndex >= this.history.length - 1) {
            this.logger.log('Cannot redo: at end of history');
            return false;
        }
        
        this.historyIndex++;
        const snapshot = this.history[this.historyIndex];
        
        // Restore state without adding to history
        this.state.workflow = { ...snapshot.workflow };
        this.state.stages = new Map(snapshot.stages);
        this.state.actions = new Map(snapshot.actions);
        this.state.formFields = new Map(snapshot.formFields);
        this.state.isDirty = true;
        
        this._notifyListeners('*', this.state);
        this.logger.log(`Redo performed (${this.historyIndex + 1}/${this.history.length})`);
        return true;
    }
    
    /**
     * Check if undo is available
     */
    canUndo() {
        return this.historyIndex > 0;
    }
    
    /**
     * Check if redo is available
     */
    canRedo() {
        return this.historyIndex < this.history.length - 1;
    }
    
    // Private methods
    
    /**
     * Set nested value in object by path
     */
    _setNestedValue(obj, path, value) {
        const parts = path.split('.');
        const lastPart = parts.pop();
        
        let current = obj;
        for (const part of parts) {
            if (!(part in current)) {
                current[part] = {};
            }
            current = current[part];
        }
        
        current[lastPart] = value;
    }
    
    /**
     * Notify all listeners of state changes
     */
    _notifyListeners(path, newValue, oldValue = null) {
        this.listeners.forEach(listener => {
            try {
                listener(path, newValue, oldValue);
            } catch (error) {
                this.logger.error('Error in state change listener:', error);
            }
        });
    }
    
    /**
     * Generate persistent UUID that remains stable throughout workflow editing
     * This UUID will be used consistently in the database, preventing reference breaks
     */
    generatePersistentId() {
        return crypto.randomUUID();
    }

    /**
     * Generate unique ID (legacy method - delegates to persistent ID)
     */
    generateId() {
        return this.generatePersistentId();
    }
    
    /**
     * Debounce function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

export default LocalStateManager;