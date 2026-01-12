/**
 * Workflow Canvas Manager
 * Enhanced canvas management with state manager integration
 * Handles visual rendering, drag-and-drop, zoom/pan, and user interactions
 */

export class WorkflowCanvasManager {
    constructor(canvasElement, stateManager) {
        // Validate required parameters
        if (!canvasElement) {
            throw new Error('WorkflowCanvasManager: canvasElement is required');
        }
        if (!stateManager) {
            throw new Error('WorkflowCanvasManager: stateManager is required');
        }
        
        // Validate that canvasElement is a DOM element
        if (!(canvasElement instanceof Element)) {
            throw new Error('WorkflowCanvasManager: canvasElement must be a DOM element');
        }
        
        this.canvasElement = canvasElement;
        this.stateManager = stateManager;
        
        // Visual rendering state
        this.renderCache = new Map(); // nodeId -> rendered element
        this.transitionCache = new Map(); // actionId -> rendered elements
        
        // Interaction state
        this.dragState = {
            isDragging: false,
            dragType: null, // 'node', 'canvas', 'connect'
            dragNode: null,
            startX: 0,
            startY: 0,
            offsetX: 0,
            offsetY: 0
        };
        
        // Connection state
        this.connectionState = {
            isConnecting: false,
            fromNode: null,
            tempLine: null,
            connectingFrom: null
        };
        
        // Zoom and pan state
        this.viewport = {
            zoom: 1,
            panX: 0,
            panY: 0,
            minZoom: 0.25,
            maxZoom: 3
        };
        
        // Selection state
        this.selection = {
            selectedNode: null,
            selectedTransition: null,
            selectionBox: null
        };
        
        // Minimap
        this.minimap = {
            element: null,
            enabled: true,
            scale: 0.1
        };
        
        this.initialize();
    }

    // =====================================================
    // CANVAS INITIALIZATION
    // =====================================================

    /**
     * Initialize canvas functionality
     */
    initialize() {
        try {
            // Double-check canvas element availability
            if (!this.canvasElement || !this.canvasElement.parentNode) {
                throw new Error('Canvas element is not available or not attached to DOM');
            }
            
            // Check if state manager is properly initialized
            if (!this.stateManager || typeof this.stateManager.on !== 'function') {
                throw new Error('StateManager is not properly initialized');
            }
            
            this.initializeCanvas();
            this.setupDragAndDrop();
            this.setupEventListeners();
            this.setupStateListeners();
            this.initializeMinimap();
            
            // Load viewport state from state manager
            this.restoreVisualState();
            
            console.log('WorkflowCanvasManager initialized successfully');
        } catch (error) {
            console.error('Failed to initialize WorkflowCanvasManager:', error);
            // Don't re-throw to allow partial functionality
            this.handleInitializationFailure(error);
        }
    }

    /**
     * Initialize canvas properties and styling
     */
    initializeCanvas() {
        this.canvasElement.style.position = 'relative';
        this.canvasElement.style.overflow = 'hidden';
        this.canvasElement.style.cursor = 'grab';
        
        // Prevent default drag behavior
        this.canvasElement.addEventListener('dragstart', (e) => e.preventDefault());
        this.canvasElement.addEventListener('selectstart', (e) => e.preventDefault());
        
        // Set initial canvas size
        this.updateCanvasSize();
    }

    /**
     * Setup drag and drop from sidebar
     */
    setupDragAndDrop() {
        // Handle drops from sidebar onto canvas
        this.canvasElement.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });
        
        this.canvasElement.addEventListener('drop', (e) => {
            e.preventDefault();
            this.handleSidebarDrop(e);
        });
    }

    /**
     * Setup canvas event listeners
     */
    setupEventListeners() {
        // Mouse events
        this.canvasElement.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvasElement.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvasElement.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvasElement.addEventListener('click', (e) => this.handleClick(e));
        this.canvasElement.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
        this.canvasElement.addEventListener('contextmenu', (e) => this.handleContextMenu(e));
        
        // Wheel event for zoom
        this.canvasElement.addEventListener('wheel', (e) => this.handleZoom(e));
        
        // Keyboard events (when canvas is focused)
        this.canvasElement.addEventListener('keydown', (e) => this.handleKeyDown(e));
        
        // Window resize
        window.addEventListener('resize', () => this.updateCanvasSize());
        
        // Prevent context menu
        this.canvasElement.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    /**
     * Setup state manager event listeners
     */
    setupStateListeners() {
        try {
            if (!this.stateManager || typeof this.stateManager.on !== 'function') {
                console.warn('WorkflowCanvasManager: StateManager not available for event binding');
                return;
            }
            
            this.stateManager.on('stageUpdated', (data) => this.handleStageUpdated(data));
            this.stateManager.on('stageRemoved', (data) => this.handleStageRemoved(data));
            this.stateManager.on('actionUpdated', (data) => this.handleActionUpdated(data));
            this.stateManager.on('actionRemoved', (data) => this.handleActionRemoved(data));
            this.stateManager.on('selectionUpdated', (data) => this.handleSelectionUpdated(data));
            this.stateManager.on('nodePositionUpdated', (data) => this.handleNodePositionUpdated(data));
            this.stateManager.on('dataLoaded', () => this.refreshAllNodes());
        } catch (error) {
            console.error('WorkflowCanvasManager: Failed to setup state listeners:', error);
        }
    }
    
    /**
     * Handle initialization failure
     */
    handleInitializationFailure(error) {
        console.warn('WorkflowCanvasManager running in degraded mode due to initialization failure:', error.message);
        
        // Set a flag to indicate degraded mode
        this.degradedMode = true;
        
        // Try to set up minimal functionality
        try {
            if (this.canvasElement) {
                this.canvasElement.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">Canvas initialization failed. Please refresh the page.</div>';
            }
        } catch (fallbackError) {
            console.error('WorkflowCanvasManager: Even fallback initialization failed:', fallbackError);
        }
    }

    // =====================================================
    // NODE RENDERING
    // =====================================================

    /**
     * Render a single node on canvas
     */
    renderNode(nodeData) {
        const existingNode = this.renderCache.get(nodeData.id);
        if (existingNode) {
            this.updateNodeVisual(nodeData.id);
            return existingNode;
        }

        const nodeElement = this.createNodeElement(nodeData);
        this.canvasElement.appendChild(nodeElement);
        this.renderCache.set(nodeData.id, nodeElement);
        
        // Position the node
        const position = this.stateManager.getNodePosition(nodeData.id);
        this.positionNode(nodeElement, position.x, position.y);
        
        return nodeElement;
    }

    /**
     * Create DOM element for a node
     */
    createNodeElement(nodeData) {
        const nodeElement = document.createElement('div');
        nodeElement.className = `node ${nodeData.type}`;
        nodeElement.id = `node_${nodeData.id}`;
        nodeElement.setAttribute('data-node-id', nodeData.id);
        
        // Node content
        nodeElement.innerHTML = `
            <div class="node-header">
                <span class="node-title">${nodeData.title || 'Untitled Stage'}</span>
                <span class="node-type">${nodeData.type}</span>
            </div>
            <div class="node-details">
                <span class="node-key">${nodeData.key || ''}</span>
                ${nodeData.maxHours ? `<span class="node-max-hours">${nodeData.maxHours}h</span>` : ''}
            </div>
        `;
        
        // Make draggable
        nodeElement.draggable = false; // We handle dragging manually
        
        // Add event listeners
        this.addNodeEventListeners(nodeElement, nodeData);
        
        return nodeElement;
    }

    /**
     * Add event listeners to a node element
     */
    addNodeEventListeners(nodeElement, nodeData) {
        const nodeId = nodeData.id;
        
        // Mouse down for dragging
        nodeElement.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.startNodeDrag(e, nodeId);
        });
        
        // Double click for editing
        nodeElement.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.stateManager.emit('nodeEditRequested', { nodeId, nodeData });
        });
        
        // Right click for context menu
        nodeElement.addEventListener('contextmenu', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.handleNodeContextMenu(e, nodeId);
        });
        
        // Click for selection
        nodeElement.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectNode(nodeId);
        });
    }

    /**
     * Update node visual appearance
     */
    updateNodeVisual(nodeId) {
        const nodeElement = this.renderCache.get(nodeId);
        const nodeData = this.stateManager.getStageById(nodeId);
        
        if (!nodeElement || !nodeData) return;
        
        // Update content
        const titleElement = nodeElement.querySelector('.node-title');
        if (titleElement) {
            titleElement.textContent = nodeData.title || 'Untitled Stage';
        }
        
        const keyElement = nodeElement.querySelector('.node-key');
        if (keyElement) {
            keyElement.textContent = nodeData.key || '';
        }
        
        const maxHoursElement = nodeElement.querySelector('.node-max-hours');
        if (nodeData.maxHours) {
            if (maxHoursElement) {
                maxHoursElement.textContent = `${nodeData.maxHours}h`;
            } else {
                const detailsElement = nodeElement.querySelector('.node-details');
                const newMaxHours = document.createElement('span');
                newMaxHours.className = 'node-max-hours';
                newMaxHours.textContent = `${nodeData.maxHours}h`;
                detailsElement.appendChild(newMaxHours);
            }
        } else if (maxHoursElement) {
            maxHoursElement.remove();
        }
        
        // Update class
        nodeElement.className = `node ${nodeData.type}`;
        
        // Update selection state
        const isSelected = this.stateManager.getSelection().selectedNode === nodeId;
        nodeElement.classList.toggle('selected', isSelected);
    }

    /**
     * Remove node visual from canvas
     */
    removeNodeVisual(nodeId) {
        const nodeElement = this.renderCache.get(nodeId);
        if (nodeElement) {
            nodeElement.remove();
            this.renderCache.delete(nodeId);
        }
        
        // Remove any transitions connected to this node
        const actions = this.stateManager.getAllActions();
        actions.forEach(action => {
            if (action.fromStageId === nodeId || action.toStageId === nodeId) {
                this.removeTransitionVisual(action.id);
            }
        });
    }

    /**
     * Refresh all nodes on canvas
     */
    refreshAllNodes() {
        // Clear existing render cache
        this.renderCache.forEach(element => element.remove());
        this.renderCache.clear();
        this.transitionCache.forEach(elements => {
            elements.line?.remove();
            elements.label?.remove();
        });
        this.transitionCache.clear();
        
        // Render all stages
        const stages = this.stateManager.getAllStages();
        stages.forEach(stage => this.renderNode(stage));
        
        // Render all transitions
        const actions = this.stateManager.getAllActions();
        actions.forEach(action => this.renderTransition(action));
        
        // Update minimap
        this.updateMinimap();
        
        // Restore viewport
        this.restoreVisualState();
    }

    /**
     * Position a node element
     */
    positionNode(nodeElement, x, y) {
        nodeElement.style.left = `${x}px`;
        nodeElement.style.top = `${y}px`;
        nodeElement.style.transform = `scale(${this.viewport.zoom})`;
        nodeElement.style.transformOrigin = 'top left';
    }

    // =====================================================
    // TRANSITION RENDERING
    // =====================================================

    /**
     * Render a transition (action) between nodes
     */
    renderTransition(actionData) {
        const fromNode = this.renderCache.get(actionData.fromStageId);
        const toNode = this.renderCache.get(actionData.toStageId);
        
        if (!fromNode || !toNode) return null;
        
        const transitionElements = this.createTransitionElements(actionData, fromNode, toNode);
        this.transitionCache.set(actionData.id, transitionElements);
        
        return transitionElements;
    }

    /**
     * Create DOM elements for a transition
     */
    createTransitionElements(actionData, fromNode, toNode) {
        // Calculate positions
        const fromRect = fromNode.getBoundingClientRect();
        const toRect = toNode.getBoundingClientRect();
        const canvasRect = this.canvasElement.getBoundingClientRect();
        
        const fromX = fromRect.left - canvasRect.left + fromRect.width / 2;
        const fromY = fromRect.top - canvasRect.top + fromRect.height / 2;
        const toX = toRect.left - canvasRect.left + toRect.width / 2;
        const toY = toRect.top - canvasRect.top + toRect.height / 2;
        
        // Create transition line
        const line = this.createTransitionLine(fromX, fromY, toX, toY, actionData);
        
        // Create transition label
        const label = this.createTransitionLabel(fromX, fromY, toX, toY, actionData);
        
        this.canvasElement.appendChild(line);
        this.canvasElement.appendChild(label);
        
        return { line, label };
    }

    /**
     * Create transition line element
     */
    createTransitionLine(fromX, fromY, toX, toY, actionData) {
        const line = document.createElement('div');
        line.className = `transition ${actionData.isEditAction ? 'edit-action' : ''}`;
        line.id = `transition_${actionData.id}`;
        line.setAttribute('data-action-id', actionData.id);
        
        // Calculate line properties
        const deltaX = toX - fromX;
        const deltaY = toY - fromY;
        const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const angle = Math.atan2(deltaY, deltaX) * 180 / Math.PI;
        
        // Position and style the line
        line.style.position = 'absolute';
        line.style.left = `${fromX}px`;
        line.style.top = `${fromY}px`;
        line.style.width = `${length}px`;
        line.style.height = '2px';
        line.style.backgroundColor = actionData.buttonColor || '#333';
        line.style.transform = `rotate(${angle}deg)`;
        line.style.transformOrigin = '0 50%';
        line.style.zIndex = '1';
        
        if (actionData.name) {
            line.classList.add('has-action');
            line.style.height = '3px';
        }
        
        return line;
    }

    /**
     * Create transition label element
     */
    createTransitionLabel(fromX, fromY, toX, toY, actionData) {
        const label = document.createElement('div');
        label.className = 'transition-label';
        label.id = `transition_label_${actionData.id}`;
        label.setAttribute('data-action-id', actionData.id);
        
        // Position at midpoint
        const midX = (fromX + toX) / 2;
        const midY = (fromY + toY) / 2;
        
        label.style.position = 'absolute';
        label.style.left = `${midX}px`;
        label.style.top = `${midY}px`;
        label.style.transform = 'translate(-50%, -100%)';
        label.style.zIndex = '10';
        label.style.cursor = 'pointer';
        
        // Set content
        label.textContent = actionData.buttonLabel || actionData.name || 'Action';
        
        // Add styling based on action properties
        if (actionData.name) {
            label.classList.add('has-action');
        }
        
        // Add event listeners
        label.addEventListener('click', (e) => {
            e.stopPropagation();
            this.stateManager.emit('actionEditRequested', { actionId: actionData.id, actionData });
        });
        
        label.addEventListener('mouseenter', () => {
            label.style.transform = 'translate(-50%, -100%) scale(1.05)';
        });
        
        label.addEventListener('mouseleave', () => {
            label.style.transform = 'translate(-50%, -100%) scale(1)';
        });
        
        return label;
    }

    /**
     * Update transition visual appearance
     */
    updateTransitionVisual(actionId) {
        const actionData = this.stateManager.getActionById(actionId);
        if (!actionData) return;
        
        const transitionElements = this.transitionCache.get(actionId);
        if (transitionElements) {
            // Remove old elements
            transitionElements.line?.remove();
            transitionElements.label?.remove();
        }
        
        // Re-render
        this.renderTransition(actionData);
    }

    /**
     * Remove transition visual from canvas
     */
    removeTransitionVisual(actionId) {
        const transitionElements = this.transitionCache.get(actionId);
        if (transitionElements) {
            transitionElements.line?.remove();
            transitionElements.label?.remove();
            this.transitionCache.delete(actionId);
        }
    }

    /**
     * Refresh all transitions
     */
    refreshAllTransitions() {
        // Clear existing transitions
        this.transitionCache.forEach(elements => {
            elements.line?.remove();
            elements.label?.remove();
        });
        this.transitionCache.clear();
        
        // Re-render all transitions
        const actions = this.stateManager.getAllActions();
        actions.forEach(action => this.renderTransition(action));
    }

    // =====================================================
    // DRAG AND DROP
    // =====================================================

    /**
     * Handle drop from sidebar to canvas
     */
    handleSidebarDrop(event) {
        const nodeType = event.dataTransfer.getData('text/plain');
        if (!nodeType) return;
        
        // Calculate drop position relative to canvas
        const rect = this.canvasElement.getBoundingClientRect();
        const x = (event.clientX - rect.left - this.viewport.panX) / this.viewport.zoom;
        const y = (event.clientY - rect.top - this.viewport.panY) / this.viewport.zoom;
        
        // Create new stage
        const stageId = this.stateManager.generateStageId();
        const newStage = {
            id: stageId,
            type: nodeType,
            title: `New ${nodeType.charAt(0).toUpperCase() + nodeType.slice(1)}`,
            key: `${nodeType}_${stageId.split('_')[1]}`,
            maxHours: 24,
            allowedRoles: [],
            formFields: []
        };
        
        // Update state
        this.stateManager.updateStage(newStage);
        this.stateManager.updateNodePosition(stageId, x, y);
        
        // Render the new node
        this.renderNode(newStage);
        
        // Select the new node
        this.selectNode(stageId);
        
        // Emit event for UI to handle (e.g., show edit modal)
        this.stateManager.emit('nodeCreated', { stageId, stage: newStage, position: { x, y } });
    }

    /**
     * Start node drag operation
     */
    startNodeDrag(event, nodeId) {
        event.preventDefault();
        
        const nodeElement = this.renderCache.get(nodeId);
        if (!nodeElement) return;
        
        this.dragState = {
            isDragging: true,
            dragType: 'node',
            dragNode: nodeId,
            startX: event.clientX,
            startY: event.clientY,
            offsetX: 0,
            offsetY: 0
        };
        
        // Add drag cursor
        this.canvasElement.style.cursor = 'grabbing';
        nodeElement.style.cursor = 'grabbing';
        
        // Select the node being dragged
        this.selectNode(nodeId);
    }

    /**
     * Handle node drag
     */
    handleNodeDrag(event, nodeId) {
        if (!this.dragState.isDragging || this.dragState.dragNode !== nodeId) return;
        
        const deltaX = (event.clientX - this.dragState.startX) / this.viewport.zoom;
        const deltaY = (event.clientY - this.dragState.startY) / this.viewport.zoom;
        
        const currentPosition = this.stateManager.getNodePosition(nodeId);
        const newX = currentPosition.x + deltaX;
        const newY = currentPosition.y + deltaY;
        
        // Update position in state manager (this will trigger handleNodePositionUpdated)
        this.stateManager.updateNodePosition(nodeId, newX, newY);
        
        // Update drag state
        this.dragState.startX = event.clientX;
        this.dragState.startY = event.clientY;
    }

    /**
     * End node drag operation
     */
    handleNodeDragEnd() {
        if (this.dragState.isDragging && this.dragState.dragType === 'node') {
            const nodeElement = this.renderCache.get(this.dragState.dragNode);
            if (nodeElement) {
                nodeElement.style.cursor = 'move';
            }
        }
        
        this.dragState = {
            isDragging: false,
            dragType: null,
            dragNode: null,
            startX: 0,
            startY: 0,
            offsetX: 0,
            offsetY: 0
        };
        
        this.canvasElement.style.cursor = 'grab';
        this.updateMinimap();
    }

    /**
     * Update transitions connected to a node
     */
    updateNodeTransitions(nodeId) {
        const actions = this.stateManager.getAllActions();
        actions.forEach(action => {
            if (action.fromStageId === nodeId || action.toStageId === nodeId) {
                this.updateTransitionVisual(action.id);
            }
        });
    }

    // =====================================================
    // ZOOM AND PAN
    // =====================================================

    /**
     * Handle zoom via mouse wheel
     */
    handleZoom(event) {
        event.preventDefault();
        
        const rect = this.canvasElement.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        
        const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(this.viewport.minZoom, 
                        Math.min(this.viewport.maxZoom, this.viewport.zoom * zoomFactor));
        
        if (newZoom !== this.viewport.zoom) {
            // Zoom towards mouse position
            const zoomChange = newZoom / this.viewport.zoom;
            this.viewport.panX = mouseX - (mouseX - this.viewport.panX) * zoomChange;
            this.viewport.panY = mouseY - (mouseY - this.viewport.panY) * zoomChange;
            this.viewport.zoom = newZoom;
            
            this.updateViewport();
        }
    }

    /**
     * Set zoom level
     */
    setZoom(zoomLevel) {
        this.viewport.zoom = Math.max(this.viewport.minZoom, 
                           Math.min(this.viewport.maxZoom, zoomLevel));
        this.updateViewport();
    }

    /**
     * Get current zoom level
     */
    getZoom() {
        return this.viewport.zoom;
    }

    /**
     * Set pan position
     */
    setPan(x, y) {
        this.viewport.panX = x;
        this.viewport.panY = y;
        this.updateViewport();
    }

    /**
     * Get current pan position
     */
    getPan() {
        return { x: this.viewport.panX, y: this.viewport.panY };
    }

    /**
     * Reset zoom and pan to defaults
     */
    resetView() {
        this.viewport.zoom = 1;
        this.viewport.panX = 0;
        this.viewport.panY = 0;
        this.updateViewport();
    }

    /**
     * Fit all nodes in view
     */
    fitToView() {
        const nodes = this.renderCache.values();
        if (this.renderCache.size === 0) return;
        
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        // Calculate bounding box of all nodes
        for (const [nodeId] of this.renderCache) {
            const position = this.stateManager.getNodePosition(nodeId);
            minX = Math.min(minX, position.x);
            minY = Math.min(minY, position.y);
            maxX = Math.max(maxX, position.x + 150); // Approximate node width
            maxY = Math.max(maxY, position.y + 100); // Approximate node height
        }
        
        if (minX === Infinity) return;
        
        // Calculate required zoom and pan
        const canvasRect = this.canvasElement.getBoundingClientRect();
        const padding = 50;
        
        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;
        const availableWidth = canvasRect.width - padding * 2;
        const availableHeight = canvasRect.height - padding * 2;
        
        const zoomX = availableWidth / contentWidth;
        const zoomY = availableHeight / contentHeight;
        const newZoom = Math.min(zoomX, zoomY, this.viewport.maxZoom);
        
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        
        this.viewport.zoom = Math.max(newZoom, this.viewport.minZoom);
        this.viewport.panX = canvasRect.width / 2 - centerX * this.viewport.zoom;
        this.viewport.panY = canvasRect.height / 2 - centerY * this.viewport.zoom;
        
        this.updateViewport();
    }

    /**
     * Update viewport (apply zoom and pan transformations)
     */
    updateViewport() {
        // Update all rendered nodes
        this.renderCache.forEach((nodeElement, nodeId) => {
            const position = this.stateManager.getNodePosition(nodeId);
            this.positionNode(nodeElement, position.x, position.y);
        });
        
        // Update all transitions
        this.refreshAllTransitions();
        
        // Update state manager
        this.stateManager.updateViewport(this.viewport.zoom, this.viewport.panX, this.viewport.panY);
        
        // Update minimap
        this.updateMinimap();
    }

    // =====================================================
    // SELECTION
    // =====================================================

    /**
     * Select node
     */
    selectNode(nodeId) {
        this.clearSelection();
        this.selection.selectedNode = nodeId;
        this.stateManager.updateSelection(nodeId, null);
        
        const nodeElement = this.renderCache.get(nodeId);
        if (nodeElement) {
            nodeElement.classList.add('selected');
        }
    }

    /**
     * Select transition
     */
    selectTransition(actionId) {
        this.clearSelection();
        this.selection.selectedTransition = actionId;
        this.stateManager.updateSelection(null, actionId);
        
        const transitionElements = this.transitionCache.get(actionId);
        if (transitionElements) {
            transitionElements.line?.classList.add('selected');
            transitionElements.label?.classList.add('selected');
        }
    }

    /**
     * Clear all selections
     */
    clearSelection() {
        // Clear node selection
        if (this.selection.selectedNode) {
            const nodeElement = this.renderCache.get(this.selection.selectedNode);
            if (nodeElement) {
                nodeElement.classList.remove('selected');
            }
        }
        
        // Clear transition selection
        if (this.selection.selectedTransition) {
            const transitionElements = this.transitionCache.get(this.selection.selectedTransition);
            if (transitionElements) {
                transitionElements.line?.classList.remove('selected');
                transitionElements.label?.classList.remove('selected');
            }
        }
        
        this.selection.selectedNode = null;
        this.selection.selectedTransition = null;
        this.stateManager.updateSelection(null, null);
    }

    /**
     * Clear selection visuals without updating state (to prevent recursion)
     */
    clearSelectionVisuals() {
        // Clear node selection visuals
        if (this.selection.selectedNode) {
            const nodeElement = this.renderCache.get(this.selection.selectedNode);
            if (nodeElement) {
                nodeElement.classList.remove('selected');
            }
        }
        
        // Clear transition selection visuals
        if (this.selection.selectedTransition) {
            const transitionElements = this.transitionCache.get(this.selection.selectedTransition);
            if (transitionElements) {
                transitionElements.line?.classList.remove('selected');
                transitionElements.label?.classList.remove('selected');
            }
        }
    }

    /**
     * Get current selection
     */
    getSelection() {
        return { ...this.selection };
    }

    // =====================================================
    // COORDINATES
    // =====================================================

    /**
     * Convert screen coordinates to canvas coordinates
     */
    screenToCanvas(screenX, screenY) {
        const rect = this.canvasElement.getBoundingClientRect();
        const canvasX = (screenX - rect.left - this.viewport.panX) / this.viewport.zoom;
        const canvasY = (screenY - rect.top - this.viewport.panY) / this.viewport.zoom;
        return { x: canvasX, y: canvasY };
    }

    /**
     * Convert canvas coordinates to screen coordinates
     */
    canvasToScreen(canvasX, canvasY) {
        const rect = this.canvasElement.getBoundingClientRect();
        const screenX = canvasX * this.viewport.zoom + this.viewport.panX + rect.left;
        const screenY = canvasY * this.viewport.zoom + this.viewport.panY + rect.top;
        return { x: screenX, y: screenY };
    }

    // =====================================================
    // STATE RESTORATION
    // =====================================================

    /**
     * Restore visual state from state manager
     */
    restoreVisualState() {
        const viewport = this.stateManager.getViewport();
        this.viewport.zoom = viewport.zoom;
        this.viewport.panX = viewport.panX;
        this.viewport.panY = viewport.panY;
        
        this.updateViewport();
    }

    /**
     * Capture current visual state
     */
    captureVisualState() {
        return {
            viewport: { ...this.viewport },
            selection: { ...this.selection }
        };
    }

    // =====================================================
    // MINIMAP
    // =====================================================

    /**
     * Initialize minimap
     */
    initializeMinimap() {
        if (!this.minimap.enabled) return;
        
        this.minimap.element = document.createElement('div');
        this.minimap.element.className = 'canvas-minimap';
        this.minimap.element.innerHTML = '<canvas width="200" height="150"></canvas>';
        
        this.canvasElement.appendChild(this.minimap.element);
        
        // Add click handler for minimap navigation
        this.minimap.element.addEventListener('click', (e) => this.handleMinimapClick(e));
        
        this.updateMinimap();
    }

    /**
     * Update minimap view
     */
    updateMinimap() {
        if (!this.minimap.enabled || !this.minimap.element) return;
        
        const canvas = this.minimap.element.querySelector('canvas');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw nodes as small rectangles
        this.renderCache.forEach((nodeElement, nodeId) => {
            const position = this.stateManager.getNodePosition(nodeId);
            const stage = this.stateManager.getStageById(nodeId);
            
            const x = position.x * this.minimap.scale;
            const y = position.y * this.minimap.scale;
            
            ctx.fillStyle = this.getNodeColor(stage.type);
            ctx.fillRect(x, y, 8, 6);
        });
        
        // Draw viewport indicator
        const viewportRect = this.calculateMinimapViewport();
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2;
        ctx.strokeRect(viewportRect.x, viewportRect.y, viewportRect.width, viewportRect.height);
    }

    /**
     * Calculate minimap viewport rectangle
     */
    calculateMinimapViewport() {
        const canvasRect = this.canvasElement.getBoundingClientRect();
        
        const x = -this.viewport.panX * this.minimap.scale / this.viewport.zoom;
        const y = -this.viewport.panY * this.minimap.scale / this.viewport.zoom;
        const width = canvasRect.width * this.minimap.scale / this.viewport.zoom;
        const height = canvasRect.height * this.minimap.scale / this.viewport.zoom;
        
        return { x, y, width, height };
    }

    /**
     * Handle minimap click for navigation
     */
    handleMinimapClick(event) {
        const rect = this.minimap.element.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;
        
        // Convert to canvas coordinates
        const canvasX = clickX / this.minimap.scale;
        const canvasY = clickY / this.minimap.scale;
        
        // Calculate new pan position to center on clicked point
        const canvasRect = this.canvasElement.getBoundingClientRect();
        this.viewport.panX = canvasRect.width / 2 - canvasX * this.viewport.zoom;
        this.viewport.panY = canvasRect.height / 2 - canvasY * this.viewport.zoom;
        
        this.updateViewport();
    }

    /**
     * Get node color by type
     */
    getNodeColor(nodeType) {
        const colors = {
            start: '#90EE90',
            stage: '#87CEEB',
            intermediate: '#87CEEB',
            end: '#FFB6C1'
        };
        return colors[nodeType] || '#87CEEB';
    }

    // =====================================================
    // EVENT HANDLERS
    // =====================================================

    /**
     * Handle mouse down events
     */
    handleMouseDown(event) {
        if (event.target === this.canvasElement) {
            // Start canvas pan
            this.startCanvasPan(event);
        }
    }

    /**
     * Handle mouse move events
     */
    handleMouseMove(event) {
        if (this.dragState.isDragging) {
            if (this.dragState.dragType === 'node') {
                this.handleNodeDrag(event, this.dragState.dragNode);
            } else if (this.dragState.dragType === 'canvas') {
                this.handleCanvasPan(event);
            }
        }
        
        if (this.connectionState.isConnecting) {
            this.updateConnectionPreview(event);
        }
    }

    /**
     * Handle mouse up events
     */
    handleMouseUp(event) {
        if (this.dragState.isDragging) {
            this.handleNodeDragEnd();
        }
        
        if (this.connectionState.isConnecting) {
            this.endConnection(event);
        }
    }

    /**
     * Handle click events
     */
    handleClick(event) {
        if (event.target === this.canvasElement) {
            this.clearSelection();
        }
    }

    /**
     * Handle double click events
     */
    handleDoubleClick(event) {
        if (event.target === this.canvasElement) {
            // Double click on empty canvas - could create new node
            this.stateManager.emit('canvasDoubleClick', {
                position: this.screenToCanvas(event.clientX, event.clientY)
            });
        }
    }

    /**
     * Handle context menu events
     */
    handleContextMenu(event) {
        event.preventDefault();
        
        if (event.target === this.canvasElement) {
            this.stateManager.emit('canvasContextMenu', {
                position: this.screenToCanvas(event.clientX, event.clientY),
                screenPosition: { x: event.clientX, y: event.clientY }
            });
        }
    }

    /**
     * Handle node context menu
     */
    handleNodeContextMenu(event, nodeId) {
        event.preventDefault();
        
        const node = this.stateManager.getStageById(nodeId);
        if (!node) return;
        
        // Handle connection logic (same as legacy workflow builder)
        if (this.connectionState.connectingFrom && this.connectionState.connectingFrom !== nodeId) {
            // Create transition between connecting node and this node
            this.createDirectTransition(this.connectionState.connectingFrom, nodeId);
            this.clearConnectionState();
        } else if (this.connectionState.connectingFrom && this.connectionState.connectingFrom === nodeId) {
            // Create edit action (self-connecting)
            this.createEditAction(nodeId);
            this.clearConnectionState();
        } else {
            // Start connection from this node
            this.startConnection(nodeId);
        }
        
        // Also emit event for other handlers
        this.stateManager.emit('nodeContextMenu', {
            nodeId,
            position: this.screenToCanvas(event.clientX, event.clientY),
            screenPosition: { x: event.clientX, y: event.clientY }
        });
    }

    /**
     * Handle keyboard events
     */
    handleKeyDown(event) {
        // Delete key - delete selected items
        if (event.key === 'Delete' || event.key === 'Backspace') {
            this.deleteSelected();
        }
        
        // Escape key - cancel current operation
        if (event.key === 'Escape') {
            this.cancelCurrentOperation();
        }
    }

    /**
     * Start canvas pan operation
     */
    startCanvasPan(event) {
        if (event.button === 1 || (event.button === 0 && event.ctrlKey)) {
            event.preventDefault();
            
            this.dragState = {
                isDragging: true,
                dragType: 'canvas',
                startX: event.clientX,
                startY: event.clientY,
                offsetX: this.viewport.panX,
                offsetY: this.viewport.panY
            };
            
            this.canvasElement.style.cursor = 'grabbing';
        }
    }

    /**
     * Handle canvas pan
     */
    handleCanvasPan(event) {
        const deltaX = event.clientX - this.dragState.startX;
        const deltaY = event.clientY - this.dragState.startY;
        
        this.viewport.panX = this.dragState.offsetX + deltaX;
        this.viewport.panY = this.dragState.offsetY + deltaY;
        
        this.updateViewport();
    }

    /**
     * Delete selected items
     */
    deleteSelected() {
        const selection = this.getSelection();
        
        if (selection.selectedNode) {
            this.stateManager.emit('nodeDeleteRequested', { nodeId: selection.selectedNode });
        } else if (selection.selectedTransition) {
            this.stateManager.emit('actionDeleteRequested', { actionId: selection.selectedTransition });
        }
    }

    /**
     * Cancel current operation
     */
    cancelCurrentOperation() {
        if (this.connectionState.isConnecting) {
            this.cancelConnection();
        }
        
        this.clearSelection();
    }

    /**
     * Start connection from a node
     */
    startConnection(nodeId) {
        this.connectionState.connectingFrom = nodeId;
        
        // Update visual feedback - highlight connecting node
        this.clearConnectionHighlights();
        const nodeElement = this.renderCache.get(nodeId);
        if (nodeElement) {
            nodeElement.style.border = '3px solid red';
        }
    }
    
    /**
     * Clear connection state and visual feedback
     */
    clearConnectionState() {
        this.connectionState.connectingFrom = null;
        this.clearConnectionHighlights();
    }
    
    /**
     * Clear connection highlights from all nodes
     */
    clearConnectionHighlights() {
        this.renderCache.forEach(nodeElement => {
            // Reset to default border
            const nodeId = nodeElement.getAttribute('data-node-id');
            const stage = this.stateManager.getStageById(nodeId);
            if (stage) {
                nodeElement.style.border = '2px solid #333';
                if (nodeElement.classList.contains('selected')) {
                    // Keep selection styling
                    nodeElement.style.borderColor = 'var(--color-primary, #2563eb)';
                }
            }
        });
    }
    
    /**
     * Create direct transition between two nodes
     */
    createDirectTransition(fromNodeId, toNodeId) {
        const fromNode = this.stateManager.getStageById(fromNodeId);
        const toNode = this.stateManager.getStageById(toNodeId);
        
        if (!fromNode || !toNode) {
            console.error('Cannot create transition: source or target node not found');
            return;
        }
        
        // Generate unique action ID
        const actionId = this.stateManager.generateActionId();
        
        // Create action data
        const action = {
            id: actionId,
            fromStageId: fromNodeId,
            toStageId: toNodeId,
            name: `${fromNode.title} → ${toNode.title}`,
            buttonLabel: 'Next',
            buttonColor: '#007bff',
            allowedRoles: this.getDefaultRolesForAction(fromNodeId),
            conditions: {},
            requiresConfirmation: false,
            confirmationMessage: '',
            isEditAction: false,
            formFields: []
        };
        
        // Add to state manager
        this.stateManager.updateAction(action);
        
        // Render the transition
        this.renderTransition(action);
        
        // Auto-open configuration modal after short delay
        setTimeout(() => {
            this.stateManager.emit('actionEditRequested', { actionId, isNewAction: true });
        }, 100);
    }
    
    /**
     * Create edit action (self-connecting action)
     */
    createEditAction(nodeId) {
        const node = this.stateManager.getStageById(nodeId);
        if (!node) {
            console.error('Cannot create edit action: node not found');
            return;
        }
        
        // Generate unique action ID
        const actionId = this.stateManager.generateActionId();
        
        // Create edit action data
        const action = {
            id: actionId,
            fromStageId: nodeId,
            toStageId: nodeId,
            name: `Edit ${node.title}`,
            buttonLabel: 'Edit',
            buttonColor: '#ff9800',
            allowedRoles: this.getDefaultRolesForAction(nodeId),
            conditions: {},
            requiresConfirmation: false,
            confirmationMessage: '',
            isEditAction: true,
            editableFields: [],
            formFields: []
        };
        
        // Add to state manager
        this.stateManager.updateAction(action);
        
        // Render the transition
        this.renderTransition(action);
        
        // Auto-open configuration modal after short delay
        setTimeout(() => {
            this.stateManager.emit('actionEditRequested', { actionId, isNewAction: true });
        }, 100);
    }
    
    /**
     * Get default roles for an action (inherit from source stage)
     */
    getDefaultRolesForAction(fromNodeId) {
        const fromNode = this.stateManager.getStageById(fromNodeId);
        if (fromNode && fromNode.allowedRoles) {
            return [...fromNode.allowedRoles];
        }
        return [];
    }

    /**
     * Update connection preview line
     */
    updateConnectionPreview(event) {
        // Implementation for connection preview
        // This would show a temporary line while connecting nodes
    }

    /**
     * End connection operation
     */
    endConnection(event) {
        // Implementation for ending connection
        // This would create a new action between nodes
    }

    /**
     * Cancel connection operation
     */
    cancelConnection() {
        this.connectionState.isConnecting = false;
        this.connectionState.fromNode = null;
        this.connectionState.connectingFrom = null;
        
        if (this.connectionState.tempLine) {
            this.connectionState.tempLine.remove();
            this.connectionState.tempLine = null;
        }
        
        // Clear visual highlights
        this.clearConnectionHighlights();
    }

    // =====================================================
    // STATE EVENT HANDLERS
    // =====================================================

    /**
     * Handle stage updated event
     */
    handleStageUpdated(data) {
        if (data.isNew) {
            this.renderNode(data.stage);
        } else {
            this.updateNodeVisual(data.stageId);
        }
    }

    /**
     * Handle stage removed event
     */
    handleStageRemoved(data) {
        this.removeNodeVisual(data.stageId);
    }

    /**
     * Handle node position updated event
     */
    handleNodePositionUpdated(data) {
        const nodeElement = this.renderCache.get(data.nodeId);
        if (nodeElement) {
            nodeElement.style.left = `${data.x}px`;
            nodeElement.style.top = `${data.y}px`;
        }
        
        // Update any transitions connected to this node
        this.refreshAllTransitions();
    }

    /**
     * Handle action updated event
     */
    handleActionUpdated(data) {
        if (data.isNew) {
            this.renderTransition(data.action);
        } else {
            this.updateTransitionVisual(data.actionId);
        }
    }

    /**
     * Handle action removed event
     */
    handleActionRemoved(data) {
        this.removeTransitionVisual(data.actionId);
    }

    /**
     * Handle selection updated event
     */
    handleSelectionUpdated(data) {
        // Clear visual selection without triggering state update to prevent recursion
        this.clearSelectionVisuals();
        this.selection.selectedNode = null;
        this.selection.selectedTransition = null;
        
        if (data.selectedNode) {
            this.selection.selectedNode = data.selectedNode;
            const nodeElement = this.renderCache.get(data.selectedNode);
            if (nodeElement) {
                nodeElement.classList.add('selected');
            }
        }
        
        if (data.selectedTransition) {
            this.selection.selectedTransition = data.selectedTransition;
            const transitionElements = this.transitionCache.get(data.selectedTransition);
            if (transitionElements) {
                transitionElements.line?.classList.add('selected');
                transitionElements.label?.classList.add('selected');
            }
        }
    }

    // =====================================================
    // UTILITY METHODS
    // =====================================================

    /**
     * Update canvas size based on container
     */
    updateCanvasSize() {
        const rect = this.canvasElement.getBoundingClientRect();
        this.stateManager.updateCanvasSize(rect.width, rect.height);
    }

    /**
     * Get canvas bounds
     */
    getCanvasBounds() {
        return this.canvasElement.getBoundingClientRect();
    }

    /**
     * Cleanup resources and prevent memory leaks
     */
    destroy() {
        try {
            console.log('Destroying WorkflowCanvasManager...');
            
            // Remove all event listeners
            if (this.canvasElement) {
                this.canvasElement.removeEventListener('mousedown', this.handleMouseDown);
                this.canvasElement.removeEventListener('mousemove', this.handleMouseMove);
                this.canvasElement.removeEventListener('mouseup', this.handleMouseUp);
                this.canvasElement.removeEventListener('click', this.handleClick);
                this.canvasElement.removeEventListener('dblclick', this.handleDoubleClick);
                this.canvasElement.removeEventListener('contextmenu', this.handleContextMenu);
                this.canvasElement.removeEventListener('wheel', this.handleZoom);
                this.canvasElement.removeEventListener('keydown', this.handleKeyDown);
                this.canvasElement.removeEventListener('dragover', this.handleDragOver);
                this.canvasElement.removeEventListener('drop', this.handleSidebarDrop);
                this.canvasElement.removeEventListener('dragstart', this.preventDefaultDrag);
                this.canvasElement.removeEventListener('selectstart', this.preventDefaultSelect);
            }
            
            // Remove window event listeners
            window.removeEventListener('resize', this.updateCanvasSize);
            
            // Remove state manager event listeners
            if (this.stateManager && typeof this.stateManager.off === 'function') {
                this.stateManager.off('stageUpdated', this.handleStageUpdated);
                this.stateManager.off('stageRemoved', this.handleStageRemoved);
                this.stateManager.off('actionUpdated', this.handleActionUpdated);
                this.stateManager.off('actionRemoved', this.handleActionRemoved);
                this.stateManager.off('selectionUpdated', this.handleSelectionUpdated);
                this.stateManager.off('nodePositionUpdated', this.handleNodePositionUpdated);
                this.stateManager.off('dataLoaded', this.refreshAllNodes);
            }
            
            // Clear render cache
            if (this.renderCache) {
                this.renderCache.forEach(element => {
                    try {
                        if (element && element.remove) element.remove();
                    } catch (removeError) {
                        console.warn('Error removing cached element:', removeError);
                    }
                });
                this.renderCache.clear();
            }
            
            // Clear transition cache
            if (this.transitionCache) {
                this.transitionCache.forEach(elements => {
                    try {
                        if (elements.line && elements.line.remove) elements.line.remove();
                        if (elements.label && elements.label.remove) elements.label.remove();
                    } catch (removeError) {
                        console.warn('Error removing transition elements:', removeError);
                    }
                });
                this.transitionCache.clear();
            }
            
            // Remove minimap
            if (this.minimap && this.minimap.element) {
                try {
                    this.minimap.element.remove();
                } catch (minimapError) {
                    console.warn('Error removing minimap:', minimapError);
                }
                this.minimap.element = null;
            }
            
            // Clear all state references
            this.dragState = null;
            this.connectionState = null;
            this.selection = null;
            this.viewport = null;
            
            // Clear canvas element reference
            this.canvasElement = null;
            this.stateManager = null;
            
            console.log('WorkflowCanvasManager destroyed successfully');
        } catch (error) {
            console.error('Error during WorkflowCanvasManager destruction:', error);
        }
    }
}

export default WorkflowCanvasManager;