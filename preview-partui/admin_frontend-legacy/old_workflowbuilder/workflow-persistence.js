/**
 * Workflow Persistence Manager
 * Handles saving/loading to various storage systems
 * Supports session storage, auto-save, database operations, and import/export
 */

import WorkflowStorage from '../components/workflow-storage.js';

export class WorkflowPersistence {
    constructor(stateManager, projectId) {
        this.stateManager = stateManager;
        this.projectId = projectId;
        this.workflowStorage = new WorkflowStorage(projectId);
        
        // Auto-save configuration
        this.autoSaveEnabled = false;
        this.autoSaveInterval = null;
        this.autoSaveIntervalMs = 30000; // 30 seconds default
        this.lastSaveTime = null;
        this.isDirty = false;
        
        // Save points for manual snapshots
        this.savePoints = [];
        this.maxSavePoints = 10;
        
        this.initialize();
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    /**
     * Initialize persistence manager
     */
    initialize() {
        this.setupEventListeners();
        this.setupBeforeUnloadHandler();
    }

    /**
     * Setup event listeners to track state changes
     */
    setupEventListeners() {
        // Listen for state changes to mark as dirty
        this.stateManager.on('stageUpdated', () => this.markDirty());
        this.stateManager.on('stageRemoved', () => this.markDirty());
        this.stateManager.on('actionUpdated', () => this.markDirty());
        this.stateManager.on('actionRemoved', () => this.markDirty());
        this.stateManager.on('workflowMetadataUpdated', () => this.markDirty());
    }

    /**
     * Setup beforeunload handler to save session data
     */
    setupBeforeUnloadHandler() {
        window.addEventListener('beforeunload', () => {
            this.saveToSession();
        });
    }

    /**
     * Mark state as dirty (needs saving)
     */
    markDirty() {
        this.isDirty = true;
        
        // Schedule auto-save if enabled
        if (this.autoSaveEnabled) {
            this.scheduleAutoSave();
        }
    }

    // =====================================================
    // SESSION PERSISTENCE (Browser Storage)
    // =====================================================

    /**
     * Save current state to sessionStorage for page refresh recovery
     */
    saveToSession() {
        const workflowId = this.stateManager.logicalState.workflowId;
        if (!workflowId) return false;

        try {
            const sessionData = {
                timestamp: Date.now(),
                logicalState: this.stateManager.serializeForDatabase(),
                visualState: this.stateManager.serializeVisualState()
            };

            const sessionKey = `workflow_session_${workflowId}`;
            sessionStorage.setItem(sessionKey, JSON.stringify(sessionData));
            
            return true;
        } catch (error) {
            console.error('Failed to save to session storage:', error);
            return false;
        }
    }

    /**
     * Load workflow from sessionStorage
     */
    loadFromSession(workflowId) {
        try {
            const sessionKey = `workflow_session_${workflowId}`;
            const sessionData = sessionStorage.getItem(sessionKey);
            
            if (!sessionData) return null;

            const data = JSON.parse(sessionData);
            
            // Check if session data is too old (older than 24 hours)
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours
            if (Date.now() - data.timestamp > maxAge) {
                this.clearSession(workflowId);
                return null;
            }

            return data;
        } catch (error) {
            console.error('Failed to load from session storage:', error);
            return null;
        }
    }

    /**
     * Clear session data for a workflow
     */
    clearSession(workflowId) {
        try {
            const sessionKey = `workflow_session_${workflowId}`;
            sessionStorage.removeItem(sessionKey);
            return true;
        } catch (error) {
            console.error('Failed to clear session storage:', error);
            return false;
        }
    }

    /**
     * Check if session data exists for a workflow
     */
    hasSessionData(workflowId) {
        try {
            const sessionKey = `workflow_session_${workflowId}`;
            return sessionStorage.getItem(sessionKey) !== null;
        } catch (error) {
            return false;
        }
    }

    // =====================================================
    // AUTO-SAVE SYSTEM
    // =====================================================

    /**
     * Enable auto-save with specified interval
     */
    enableAutoSave(intervalMs = null) {
        if (intervalMs) {
            this.autoSaveIntervalMs = intervalMs;
        }
        
        this.autoSaveEnabled = true;
        
        // Start auto-save timer if dirty
        if (this.isDirty) {
            this.scheduleAutoSave();
        }
    }

    /**
     * Disable auto-save
     */
    disableAutoSave() {
        this.autoSaveEnabled = false;
        
        if (this.autoSaveInterval) {
            clearTimeout(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }
    }

    /**
     * Schedule next auto-save
     */
    scheduleAutoSave() {
        if (!this.autoSaveEnabled || this.autoSaveInterval) return;

        this.autoSaveInterval = setTimeout(() => {
            this.autoSaveInterval = null;
            this.performAutoSave();
        }, this.autoSaveIntervalMs);
    }

    /**
     * Perform auto-save operation
     * More lenient than manual save - always saves to session, attempts database save with graceful failure
     */
    async performAutoSave() {
        if (!this.isDirty) return;

        try {
            // Save to session storage (always - no validation)
            this.saveToSession();
            
            // Attempt to save to database if workflow exists, but handle validation failures gracefully
            const workflowId = this.stateManager.logicalState.workflowId;
            if (workflowId) {
                try {
                    await this.updateDatabaseLenient();
                } catch (validationError) {
                    // Log validation errors but don't fail the auto-save
                    console.warn('Auto-save skipped database update due to validation:', validationError.message);
                    
                    // Still emit auto-save event indicating session save succeeded
                    this.stateManager.emit('autoSaved', {
                        timestamp: Date.now(),
                        workflowId,
                        sessionOnly: true,
                        validationWarning: validationError.message
                    });
                    
                    this.isDirty = false;
                    this.lastSaveTime = Date.now();
                    return;
                }
            }

            this.isDirty = false;
            this.lastSaveTime = Date.now();
            
            this.stateManager.emit('autoSaved', {
                timestamp: this.lastSaveTime,
                workflowId,
                sessionOnly: false
            });

        } catch (error) {
            console.error('Auto-save failed:', error);
            this.stateManager.emit('autoSaveFailed', { error });
        }
    }

    /**
     * Force immediate save
     */
    async forceSave() {
        // Cancel scheduled auto-save
        if (this.autoSaveInterval) {
            clearTimeout(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }

        // Perform save
        await this.performAutoSave();
    }

    // =====================================================
    // DATABASE PERSISTENCE
    // =====================================================

    /**
     * Save logical state to database (create new workflow)
     */
    async saveToDatabase() {
        const data = this.stateManager.serializeForDatabase();
        
        try {
            // Validate data before saving (strict mode for final save)
            const validation = this.stateManager.validateWorkflow('strict');
            if (!validation.isValid) {
                throw new Error(`Workflow validation failed: ${validation.errors.join(', ')}`);
            }

            // Create workflow
            const workflowResult = await this.workflowStorage.createWorkflow(data.workflow);
            const workflowId = workflowResult.id;

            // Update state manager with new workflow ID
            this.stateManager.updateWorkflowMetadata({ workflowId });

            // Save stages
            const stageResults = await this.workflowStorage.saveWorkflowStages(workflowId, data.stages);
            
            // Create stage ID mapping
            const stageIdMap = {};
            stageResults.forEach(stage => {
                stageIdMap[stage.stage_key] = stage.id;
            });
            
            // Save actions
            const actionResults = await this.workflowStorage.saveWorkflowActions(workflowId, data.actions, stageIdMap);

            this.isDirty = false;
            this.lastSaveTime = Date.now();

            this.stateManager.emit('databaseSaved', {
                workflowId,
                stageCount: stageResults.length,
                actionCount: actionResults.length
            });

            return {
                workflowId,
                workflow: workflowResult,
                stages: stageResults,
                actions: actionResults
            };

        } catch (error) {
            this.stateManager.emit('databaseSaveFailed', { error });
            throw error;
        }
    }

    /**
     * Load workflow from database
     */
    async loadFromDatabase(workflowId) {
        try {
            const workflowData = await this.workflowStorage.loadWorkflow(workflowId);
            
            // Convert database format to state manager format
            const convertedData = this.convertFromDatabaseFormat(workflowData);
            
            // Load into state manager
            this.stateManager.loadFromDatabase(convertedData);

            this.isDirty = false;
            this.lastSaveTime = Date.now();

            this.stateManager.emit('databaseLoaded', {
                workflowId,
                data: convertedData
            });

            return convertedData;

        } catch (error) {
            this.stateManager.emit('databaseLoadFailed', { error, workflowId });
            throw error;
        }
    }

    /**
     * Update existing workflow in database
     */
    async updateDatabase() {
        const workflowId = this.stateManager.logicalState.workflowId;
        if (!workflowId) {
            throw new Error('Cannot update database: no workflow ID');
        }

        const data = this.stateManager.serializeForDatabase();
        
        try {
            // Validate data before updating (strict mode for final save)
            const validation = this.stateManager.validateWorkflow('strict');
            if (!validation.isValid) {
                throw new Error(`Workflow validation failed: ${validation.errors.join(', ')}`);
            }

            // Update workflow metadata
            await this.workflowStorage.updateWorkflow(workflowId, data.workflow);

            // Update stages and actions
            const stageResults = await this.workflowStorage.saveWorkflowStages(workflowId, data.stages);
            
            // Create stage ID mapping
            const stageIdMap = {};
            stageResults.forEach(stage => {
                stageIdMap[stage.stage_key] = stage.id;
            });
            
            await this.workflowStorage.saveWorkflowActions(workflowId, data.actions, stageIdMap);

            this.isDirty = false;
            this.lastSaveTime = Date.now();

            this.stateManager.emit('databaseUpdated', {
                workflowId,
                timestamp: this.lastSaveTime
            });

            return true;

        } catch (error) {
            this.stateManager.emit('databaseUpdateFailed', { error, workflowId });
            throw error;
        }
    }

    /**
     * Update existing workflow in database with lenient validation (for auto-save)
     * Performs validation but only saves if validation passes - throws error if validation fails
     */
    async updateDatabaseLenient() {
        const workflowId = this.stateManager.logicalState.workflowId;
        if (!workflowId) {
            throw new Error('Cannot update database: no workflow ID');
        }

        const data = this.stateManager.serializeForDatabase();
        
        // Validate data with lenient mode for auto-save - throw error if validation fails (caller will handle gracefully)
        const validation = this.stateManager.validateWorkflow('lenient');
        if (!validation.isValid) {
            throw new Error(`Workflow validation failed: ${validation.errors.join(', ')}`);
        }

        try {
            // Only proceed with database update if validation passed
            await this.workflowStorage.updateWorkflow(workflowId, data.workflow);
            const stageResults = await this.workflowStorage.saveWorkflowStages(workflowId, data.stages);
            
            // Create stage ID mapping
            const stageIdMap = {};
            stageResults.forEach(stage => {
                stageIdMap[stage.stage_key] = stage.id;
            });
            
            await this.workflowStorage.saveWorkflowActions(workflowId, data.actions, stageIdMap);

            this.lastSaveTime = Date.now();

            this.stateManager.emit('databaseUpdated', {
                workflowId,
                timestamp: this.lastSaveTime,
                autoSave: true
            });

            return true;

        } catch (error) {
            this.stateManager.emit('databaseUpdateFailed', { error, workflowId, autoSave: true });
            throw error;
        }
    }

    // =====================================================
    // EXPORT/IMPORT
    // =====================================================

    /**
     * Export workflow as downloadable JSON file
     */
    exportToFile(filename = null) {
        const data = this.stateManager.serializeForExport();
        
        if (!filename) {
            const workflowName = this.stateManager.logicalState.workflowName || 'workflow';
            const timestamp = new Date().toISOString().split('T')[0];
            filename = `${workflowName}_${timestamp}.json`;
        }

        try {
            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            
            // Create download link
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            
            // Trigger download
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Clean up
            URL.revokeObjectURL(url);

            this.stateManager.emit('exported', { filename, data });
            return true;

        } catch (error) {
            this.stateManager.emit('exportFailed', { error });
            throw error;
        }
    }

    /**
     * Import workflow from uploaded file
     */
    async importFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    this.importFromData(data);
                    
                    this.stateManager.emit('imported', { filename: file.name, data });
                    resolve(data);
                    
                } catch (error) {
                    this.stateManager.emit('importFailed', { error, filename: file.name });
                    reject(error);
                }
            };
            
            reader.onerror = () => {
                const error = new Error('Failed to read file');
                this.stateManager.emit('importFailed', { error, filename: file.name });
                reject(error);
            };
            
            reader.readAsText(file);
        });
    }

    /**
     * Import workflow from JSON string
     */
    importFromText(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            return this.importFromData(data);
        } catch (error) {
            this.stateManager.emit('importFailed', { error, source: 'text' });
            throw error;
        }
    }

    /**
     * Import workflow from data object
     */
    importFromData(data) {
        // Validate import data
        if (!data.workflow || !data.stages || !data.actions) {
            throw new Error('Invalid workflow data: missing required fields');
        }

        // Load data into state manager
        this.stateManager.loadFromExport(data);
        
        // Mark as dirty since this is new/imported data
        this.isDirty = true;
        
        return data;
    }

    /**
     * Export just visual state (canvas layout)
     */
    exportVisualState() {
        const visualState = this.stateManager.serializeVisualState();
        
        try {
            const jsonString = JSON.stringify(visualState, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            
            const workflowName = this.stateManager.logicalState.workflowName || 'workflow';
            const filename = `${workflowName}_layout.json`;
            
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            URL.revokeObjectURL(url);
            
            return visualState;
            
        } catch (error) {
            console.error('Failed to export visual state:', error);
            throw error;
        }
    }

    /**
     * Import visual state (canvas layout)
     */
    importVisualState(data) {
        this.stateManager.loadVisualState(data);
        this.markDirty();
    }

    // =====================================================
    // SAVE POINTS (Manual Snapshots)
    // =====================================================

    /**
     * Create named save point
     */
    createSavePoint(name = null) {
        if (!name) {
            const timestamp = new Date().toLocaleTimeString();
            name = `Save Point ${timestamp}`;
        }

        const savePoint = {
            id: Date.now(),
            name,
            timestamp: new Date().toISOString(),
            data: this.stateManager.serializeForExport()
        };

        this.savePoints.unshift(savePoint);
        
        // Limit number of save points
        if (this.savePoints.length > this.maxSavePoints) {
            this.savePoints = this.savePoints.slice(0, this.maxSavePoints);
        }

        this.stateManager.emit('savePointCreated', { savePoint });
        return savePoint;
    }

    /**
     * Get all save points
     */
    getSavePoints() {
        return [...this.savePoints];
    }

    /**
     * Restore from save point
     */
    restoreFromSavePoint(savePointId) {
        const savePoint = this.savePoints.find(sp => sp.id === savePointId);
        if (!savePoint) {
            throw new Error('Save point not found');
        }

        this.stateManager.loadFromExport(savePoint.data);
        this.markDirty();

        this.stateManager.emit('savePointRestored', { savePoint });
        return savePoint;
    }

    /**
     * Delete save point
     */
    deleteSavePoint(savePointId) {
        const index = this.savePoints.findIndex(sp => sp.id === savePointId);
        if (index === -1) {
            return false;
        }

        const deletedSavePoint = this.savePoints.splice(index, 1)[0];
        this.stateManager.emit('savePointDeleted', { savePoint: deletedSavePoint });
        
        return true;
    }

    // =====================================================
    // FORMAT CONVERSION
    // =====================================================

    /**
     * Convert database format to state manager format
     */
    convertFromDatabaseFormat(workflowData) {
        const stages = workflowData.stages.map(stage => ({
            id: stage.id ? `stage_${stage.id}` : this.stateManager.generateStageId(),
            dbId: stage.id,
            type: stage.stage_type,
            title: stage.stage_name,
            key: this.cleanStageKey(stage.stage_key || `stage_${stage.id}`),
            maxHours: stage.max_duration_hours || 24,
            allowedRoles: stage.visible_to_roles || [],
            formId: stage.initial_form_id || null,
            formFields: stage.form_fields || []
        }));

        const actions = workflowData.actions.map(action => ({
            id: action.id ? `action_${action.id}` : this.stateManager.generateActionId(),
            dbId: action.id,
            fromStageId: `stage_${action.from_stage_id}`,
            toStageId: `stage_${action.to_stage_id}`,
            name: action.action_name,
            buttonLabel: action.button_label,
            buttonColor: action.button_color || '#007bff',
            allowedRoles: action.allowed_roles || [],
            conditions: action.conditions || {},
            requiresConfirmation: action.requires_confirmation || false,
            confirmationMessage: action.confirmation_message || '',
            isEditAction: action.action_type === 'edit',
            formId: action.form_id || null
        }));

        return {
            workflow: workflowData.workflow,
            stages,
            actions
        };
    }

    /**
     * Clean and validate stage key
     */
    cleanStageKey(key) {
        let cleanKey = key.toString()
            .replace(/[\s\n\r]+/g, '_')
            .replace(/[^a-zA-Z0-9_]/g, '');
            
        if (cleanKey && !/^[a-zA-Z]/.test(cleanKey)) {
            cleanKey = 'stage_' + cleanKey;
        }
        
        return cleanKey || 'stage_default';
    }

    // =====================================================
    // CLEANUP
    // =====================================================

    /**
     * Clean up timers and listeners
     */
    cleanup() {
        this.disableAutoSave();
        this.savePoints = [];
        
        // Remove event listeners
        window.removeEventListener('beforeunload', this.saveToSession);
        
        this.stateManager.emit('persistenceCleanup');
    }

    /**
     * Get persistence status
     */
    getStatus() {
        return {
            isDirty: this.isDirty,
            autoSaveEnabled: this.autoSaveEnabled,
            lastSaveTime: this.lastSaveTime,
            savePointCount: this.savePoints.length,
            hasSessionData: this.hasSessionData(this.stateManager.logicalState.workflowId)
        };
    }
}

export default WorkflowPersistence;