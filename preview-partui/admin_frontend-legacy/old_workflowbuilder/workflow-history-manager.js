/**
 * Workflow History Manager
 * Manages undo/redo functionality with optimized state management
 * Provides history compression and visual previews
 */

export class WorkflowHistoryManager {
    constructor(stateManager) {
        this.stateManager = stateManager;
        
        // History storage
        this.history = [];
        this.currentIndex = -1;
        this.maxHistorySize = 50;
        
        // Compression settings
        this.compressionThreshold = 10; // Compress every 10 operations
        this.compressionRatio = 0.5; // Keep 50% of operations when compressing
        
        // Batch operation tracking
        this.batchOperations = [];
        this.isBatching = false;
        this.batchTimeout = null;
        this.batchDelay = 500; // 500ms delay before auto-ending batch
        
        this.initialize();
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    /**
     * Initialize history manager
     */
    initialize() {
        this.setupEventListeners();
        this.saveInitialState();
    }

    /**
     * Setup event listeners for state changes
     */
    setupEventListeners() {
        // Listen for state changes
        this.stateManager.on('stageUpdated', (data) => this.handleStateChange('stageUpdated', data));
        this.stateManager.on('stageRemoved', (data) => this.handleStateChange('stageRemoved', data));
        this.stateManager.on('actionUpdated', (data) => this.handleStateChange('actionUpdated', data));
        this.stateManager.on('actionRemoved', (data) => this.handleStateChange('actionRemoved', data));
        this.stateManager.on('workflowMetadataUpdated', (data) => this.handleStateChange('workflowMetadataUpdated', data));
        this.stateManager.on('nodePositionUpdated', (data) => this.handleStateChange('nodePositionUpdated', data, true));
        
        // Listen for undo/redo requests
        this.stateManager.on('undoRequested', () => this.undo());
        this.stateManager.on('redoRequested', () => this.redo());
        
        // Listen for data loads to reset history
        this.stateManager.on('dataLoaded', () => this.clearHistory());
    }

    /**
     * Save initial state
     */
    saveInitialState() {
        const initialState = this.captureState();
        this.history = [{
            state: initialState,
            operation: 'initial',
            timestamp: Date.now(),
            description: 'Initial state'
        }];
        this.currentIndex = 0;
    }

    // =====================================================
    // HISTORY TRACKING
    // =====================================================

    /**
     * Handle state change events
     */
    handleStateChange(operation, data, isBatchable = false) {
        // Skip if we're in the middle of undo/redo
        if (this.isUndoRedoing) return;
        
        if (isBatchable) {
            this.addToBatch(operation, data);
        } else {
            this.endBatch(); // End any current batch
            this.saveToHistory(operation, data);
        }
    }

    /**
     * Save current state to history
     */
    saveToHistory(operation = null, data = null) {
        const currentState = this.captureState();
        
        // Remove any history after current index (when creating new branch)
        if (this.currentIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.currentIndex + 1);
        }
        
        // Create history entry
        const historyEntry = {
            state: currentState,
            operation,
            data,
            timestamp: Date.now(),
            description: this.generateDescription(operation, data)
        };
        
        // Add to history
        this.history.push(historyEntry);
        this.currentIndex = this.history.length - 1;
        
        // Maintain max history size
        if (this.history.length > this.maxHistorySize) {
            this.compressHistory();
        }
        
        // Emit event
        this.stateManager.emit('historyUpdated', {
            canUndo: this.canUndo(),
            canRedo: this.canRedo(),
            historySize: this.history.length,
            currentIndex: this.currentIndex
        });
    }

    /**
     * Capture current state for history
     */
    captureState() {
        return {
            logicalState: JSON.parse(JSON.stringify({
                workflowId: this.stateManager.logicalState.workflowId,
                projectId: this.stateManager.logicalState.projectId,
                workflowName: this.stateManager.logicalState.workflowName,
                workflowDescription: this.stateManager.logicalState.workflowDescription,
                workflowType: this.stateManager.logicalState.workflowType,
                markerColor: this.stateManager.logicalState.markerColor,
                stages: Object.fromEntries(this.stateManager.logicalState.stages),
                actions: Object.fromEntries(this.stateManager.logicalState.actions)
            })),
            visualState: this.stateManager.serializeVisualState()
        };
    }

    /**
     * Restore state from history entry
     */
    restoreState(historyEntry) {
        this.isUndoRedoing = true;
        
        try {
            const { logicalState, visualState } = historyEntry.state;
            
            // Restore logical state
            this.stateManager.logicalState.workflowId = logicalState.workflowId;
            this.stateManager.logicalState.projectId = logicalState.projectId;
            this.stateManager.logicalState.workflowName = logicalState.workflowName;
            this.stateManager.logicalState.workflowDescription = logicalState.workflowDescription;
            this.stateManager.logicalState.workflowType = logicalState.workflowType;
            this.stateManager.logicalState.markerColor = logicalState.markerColor;
            
            // Restore stages and actions
            this.stateManager.logicalState.stages = new Map(Object.entries(logicalState.stages));
            this.stateManager.logicalState.actions = new Map(Object.entries(logicalState.actions));
            
            // Restore visual state
            this.stateManager.loadVisualState(visualState);
            
            // Emit restoration event
            this.stateManager.emit('stateRestored', {
                operation: historyEntry.operation,
                description: historyEntry.description
            });
            
        } finally {
            this.isUndoRedoing = false;
        }
    }

    /**
     * Generate description for history entry
     */
    generateDescription(operation, data) {
        switch (operation) {
            case 'stageUpdated':
                const stage = data.stage;
                return data.isNew ? `Added stage "${stage.title}"` : `Updated stage "${stage.title}"`;
            
            case 'stageRemoved':
                return `Removed stage "${data.stage.title}"`;
            
            case 'actionUpdated':
                const action = data.action;
                return data.isNew ? `Added action "${action.name || action.buttonLabel}"` : `Updated action "${action.name || action.buttonLabel}"`;
            
            case 'actionRemoved':
                return `Removed action "${data.action.name || data.action.buttonLabel}"`;
            
            case 'workflowMetadataUpdated':
                return 'Updated workflow settings';
            
            case 'nodePositionUpdated':
                return 'Moved node';
            
            case 'batchOperation':
                return `Batch operation (${data.operations.length} changes)`;
            
            default:
                return operation || 'Unknown operation';
        }
    }

    // =====================================================
    // UNDO/REDO OPERATIONS
    // =====================================================

    /**
     * Undo last action
     */
    undo() {
        if (!this.canUndo()) return false;
        
        this.endBatch(); // End any current batch
        
        this.currentIndex--;
        const historyEntry = this.history[this.currentIndex];
        
        this.restoreState(historyEntry);
        
        this.stateManager.emit('undoPerformed', {
            description: historyEntry.description,
            canUndo: this.canUndo(),
            canRedo: this.canRedo()
        });
        
        return true;
    }

    /**
     * Redo next action
     */
    redo() {
        if (!this.canRedo()) return false;
        
        this.endBatch(); // End any current batch
        
        this.currentIndex++;
        const historyEntry = this.history[this.currentIndex];
        
        this.restoreState(historyEntry);
        
        this.stateManager.emit('redoPerformed', {
            description: historyEntry.description,
            canUndo: this.canUndo(),
            canRedo: this.canRedo()
        });
        
        return true;
    }

    /**
     * Check if undo is possible
     */
    canUndo() {
        return this.currentIndex > 0;
    }

    /**
     * Check if redo is possible
     */
    canRedo() {
        return this.currentIndex < this.history.length - 1;
    }

    // =====================================================
    // BATCH OPERATIONS
    // =====================================================

    /**
     * Add operation to current batch
     */
    addToBatch(operation, data) {
        if (!this.isBatching) {
            this.startBatch();
        }
        
        this.batchOperations.push({ operation, data, timestamp: Date.now() });
        
        // Reset batch timeout
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
        }
        
        this.batchTimeout = setTimeout(() => {
            this.endBatch();
        }, this.batchDelay);
    }

    /**
     * Start batch operation
     */
    startBatch() {
        this.isBatching = true;
        this.batchOperations = [];
    }

    /**
     * End batch operation and save to history
     */
    endBatch() {
        if (!this.isBatching || this.batchOperations.length === 0) return;
        
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
            this.batchTimeout = null;
        }
        
        // Save batch as single history entry
        this.saveToHistory('batchOperation', {
            operations: [...this.batchOperations],
            count: this.batchOperations.length
        });
        
        this.isBatching = false;
        this.batchOperations = [];
    }

    // =====================================================
    // HISTORY MANAGEMENT
    // =====================================================

    /**
     * Clear all history
     */
    clearHistory() {
        this.endBatch();
        this.history = [];
        this.currentIndex = -1;
        this.saveInitialState();
        
        this.stateManager.emit('historyCleared');
    }

    /**
     * Set maximum history size
     */
    setMaxHistorySize(size) {
        this.maxHistorySize = Math.max(1, size);
        
        if (this.history.length > this.maxHistorySize) {
            this.compressHistory();
        }
    }

    /**
     * Get current history size
     */
    getHistorySize() {
        return this.history.length;
    }

    /**
     * Compress history when it gets too large
     */
    compressHistory() {
        if (this.history.length <= this.maxHistorySize) return;
        
        const keepCount = Math.floor(this.maxHistorySize * this.compressionRatio);
        const removeCount = this.history.length - keepCount;
        
        // Always keep the first entry (initial state) and recent entries
        const keepRecent = Math.floor(keepCount * 0.7); // Keep 70% of recent entries
        const keepOld = keepCount - keepRecent;
        
        const newHistory = [
            ...this.history.slice(0, keepOld),
            ...this.history.slice(-keepRecent)
        ];
        
        // Adjust current index
        const removedFromBeginning = Math.max(0, removeCount - (this.history.length - keepRecent));
        this.currentIndex = Math.max(0, this.currentIndex - removedFromBeginning);
        
        this.history = newHistory;
        
        this.stateManager.emit('historyCompressed', {
            removedCount: removeCount,
            newSize: this.history.length
        });
    }

    // =====================================================
    // STATE RESTORATION
    // =====================================================

    /**
     * Restore from specific history state
     */
    restoreFromHistory(index) {
        if (index < 0 || index >= this.history.length) {
            return false;
        }
        
        this.endBatch();
        this.currentIndex = index;
        const historyEntry = this.history[index];
        
        this.restoreState(historyEntry);
        
        this.stateManager.emit('historyRestored', {
            index,
            description: historyEntry.description,
            canUndo: this.canUndo(),
            canRedo: this.canRedo()
        });
        
        return true;
    }

    /**
     * Get preview of history state
     */
    getHistoryPreview(index) {
        if (index < 0 || index >= this.history.length) {
            return null;
        }
        
        const historyEntry = this.history[index];
        const state = historyEntry.state;
        
        return {
            index,
            timestamp: historyEntry.timestamp,
            description: historyEntry.description,
            operation: historyEntry.operation,
            stageCount: Object.keys(state.logicalState.stages).length,
            actionCount: Object.keys(state.logicalState.actions).length,
            workflowName: state.logicalState.workflowName
        };
    }

    /**
     * Get all history previews
     */
    getAllHistoryPreviews() {
        return this.history.map((entry, index) => this.getHistoryPreview(index));
    }

    /**
     * Get recent history previews
     */
    getRecentHistoryPreviews(count = 10) {
        const startIndex = Math.max(0, this.history.length - count);
        return this.history.slice(startIndex).map((entry, relativeIndex) => 
            this.getHistoryPreview(startIndex + relativeIndex)
        );
    }

    // =====================================================
    // HISTORY ANALYSIS
    // =====================================================

    /**
     * Get history statistics
     */
    getHistoryStatistics() {
        const operations = {};
        let totalOperations = 0;
        
        this.history.forEach(entry => {
            if (entry.operation) {
                operations[entry.operation] = (operations[entry.operation] || 0) + 1;
                totalOperations++;
            }
        });
        
        return {
            totalEntries: this.history.length,
            totalOperations,
            currentIndex: this.currentIndex,
            operationBreakdown: operations,
            canUndo: this.canUndo(),
            canRedo: this.canRedo(),
            memoryUsage: this.estimateMemoryUsage()
        };
    }

    /**
     * Estimate memory usage of history
     */
    estimateMemoryUsage() {
        const sampleEntry = this.history[0];
        if (!sampleEntry) return 0;
        
        const entrySize = JSON.stringify(sampleEntry).length;
        return {
            estimatedBytes: entrySize * this.history.length,
            entriesCount: this.history.length,
            averageEntrySize: entrySize
        };
    }

    /**
     * Find history entries by operation type
     */
    findHistoryByOperation(operationType) {
        return this.history
            .map((entry, index) => ({ ...entry, index }))
            .filter(entry => entry.operation === operationType);
    }

    /**
     * Find history entries within time range
     */
    findHistoryByTimeRange(startTime, endTime) {
        return this.history
            .map((entry, index) => ({ ...entry, index }))
            .filter(entry => entry.timestamp >= startTime && entry.timestamp <= endTime);
    }

    // =====================================================
    // PERFORMANCE OPTIMIZATION
    // =====================================================

    /**
     * Enable aggressive compression for memory optimization
     */
    enableAggressiveCompression() {
        this.compressionThreshold = 5;
        this.compressionRatio = 0.3;
        this.maxHistorySize = 25;
        this.compressHistory();
    }

    /**
     * Disable aggressive compression for full history
     */
    disableAggressiveCompression() {
        this.compressionThreshold = 10;
        this.compressionRatio = 0.5;
        this.maxHistorySize = 50;
    }

    /**
     * Optimize history storage by removing redundant data
     */
    optimizeHistoryStorage() {
        const optimizedHistory = [];
        let previousState = null;
        
        this.history.forEach((entry, index) => {
            if (index === 0 || index === this.currentIndex || !previousState) {
                // Always keep first entry, current entry, and entries without previous state
                optimizedHistory.push(entry);
            } else {
                // Create delta from previous state
                const delta = this.createStateDelta(previousState, entry.state);
                if (Object.keys(delta).length > 0) {
                    optimizedHistory.push({
                        ...entry,
                        state: delta,
                        isDelta: true
                    });
                }
            }
            
            previousState = entry.state;
        });
        
        this.history = optimizedHistory;
        
        this.stateManager.emit('historyOptimized', {
            originalSize: this.history.length,
            optimizedSize: optimizedHistory.length
        });
    }

    /**
     * Create delta between two states
     */
    createStateDelta(previousState, currentState) {
        const delta = {};
        
        // Compare logical state
        const logicalDelta = this.compareObjects(previousState.logicalState, currentState.logicalState);
        if (Object.keys(logicalDelta).length > 0) {
            delta.logicalState = logicalDelta;
        }
        
        // Compare visual state
        const visualDelta = this.compareObjects(previousState.visualState, currentState.visualState);
        if (Object.keys(visualDelta).length > 0) {
            delta.visualState = visualDelta;
        }
        
        return delta;
    }

    /**
     * Compare two objects and return differences
     */
    compareObjects(obj1, obj2) {
        const differences = {};
        
        // Check for changes in obj2
        for (const key in obj2) {
            if (obj2[key] !== obj1[key]) {
                if (typeof obj2[key] === 'object' && typeof obj1[key] === 'object') {
                    const nestedDiff = this.compareObjects(obj1[key] || {}, obj2[key]);
                    if (Object.keys(nestedDiff).length > 0) {
                        differences[key] = nestedDiff;
                    }
                } else {
                    differences[key] = obj2[key];
                }
            }
        }
        
        // Check for deletions
        for (const key in obj1) {
            if (!(key in obj2)) {
                differences[key] = undefined; // Mark as deleted
            }
        }
        
        return differences;
    }

    // =====================================================
    // CLEANUP
    // =====================================================

    /**
     * Cleanup resources
     */
    destroy() {
        this.endBatch();
        
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
        }
        
        this.history = [];
        this.currentIndex = -1;
        
        this.stateManager.emit('historyManagerDestroyed');
    }
}

export default WorkflowHistoryManager;