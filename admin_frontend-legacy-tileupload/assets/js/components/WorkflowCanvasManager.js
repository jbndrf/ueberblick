/**
 * Workflow Canvas Manager
 * Enhanced canvas management with drag-and-drop, zoom/pan, and visual rendering
 * Handles sophisticated node positioning, transitions, and user interactions
 */

import DebugLogger from '../core/debug-logger.js';

const logger = new DebugLogger('WorkflowCanvasManager');

export class WorkflowCanvasManager {
    constructor(canvasElement, workflowBuilder) {
        // Validate required parameters
        if (!canvasElement) {
            throw new Error('WorkflowCanvasManager: canvasElement is required');
        }
        if (!workflowBuilder) {
            throw new Error('WorkflowCanvasManager: workflowBuilder is required');
        }
        
        // Validate that canvasElement is a DOM element
        if (!(canvasElement instanceof Element)) {
            throw new Error('WorkflowCanvasManager: canvasElement must be a DOM element');
        }
        
        this.canvasElement = canvasElement;
        this.workflowBuilder = workflowBuilder;
        
        // Visual rendering state
        this.renderCache = new Map(); // nodeId -> rendered element
        this.connectionCache = new Map(); // connectionId -> rendered elements
        
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
            selectedConnection: null,
            selectionBox: null
        };
        
        // Grid configuration
        this.grid = {
            size: 20,
            enabled: true,
            snap: true
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
            
            this.initializeCanvas();
            this.setupDragAndDrop();
            this.setupEventListeners();
            this.setupViewport();
            this.createGrid();
            
            logger.log('WorkflowCanvasManager initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize WorkflowCanvasManager:', error);
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
        this.canvasElement.style.userSelect = 'none';
        
        // Add workflow canvas classes
        this.canvasElement.classList.add('workflow-canvas');
        
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
        
        // Global mouse events for dragging
        document.addEventListener('mousemove', (e) => this.handleGlobalMouseMove(e));
        document.addEventListener('mouseup', (e) => this.handleGlobalMouseUp(e));
    }

    /**
     * Setup viewport transformations
     */
    setupViewport() {
        this.viewport = {
            zoom: 1,
            panX: 0,
            panY: 0,
            minZoom: 0.25,
            maxZoom: 3
        };
        
        this.applyViewportTransform();
    }

    /**
     * Create background grid
     */
    createGrid() {
        if (!this.grid.enabled) return;
        
        const gridSize = this.grid.size;
        const canvasRect = this.canvasElement.getBoundingClientRect();
        
        // Create grid background using CSS
        this.canvasElement.style.backgroundImage = `
            radial-gradient(circle, var(--color-border-light) 1px, transparent 1px)
        `;
        this.canvasElement.style.backgroundSize = `${gridSize}px ${gridSize}px`;
        this.canvasElement.style.backgroundPosition = `${this.viewport.panX % gridSize}px ${this.viewport.panY % gridSize}px`;
    }

    // =====================================================
    // NODE RENDERING
    // =====================================================

    /**
     * Add a new node to the canvas
     */
    addNode(nodeData, position = null) {
        // Use provided position or calculate a good default
        const nodePosition = position || this.calculateDefaultNodePosition();
        
        // Create the node element
        const nodeElement = this.createNodeElement(nodeData, nodePosition);
        
        // Add to canvas and cache
        this.canvasElement.appendChild(nodeElement);
        this.renderCache.set(nodeData.id, nodeElement);
        
        // Make node interactive
        this.makeNodeInteractive(nodeElement, nodeData);
        
        return nodeElement;
    }

    /**
     * Create DOM element for a node
     */
    createNodeElement(nodeData, position) {
        const nodeElement = document.createElement('div');
        nodeElement.className = `workflow-node ${nodeData.type || 'stage'}`;
        nodeElement.id = `node_${nodeData.id}`;
        nodeElement.setAttribute('data-node-id', nodeData.id);
        
        // Position the node
        nodeElement.style.left = `${position.x}px`;
        nodeElement.style.top = `${position.y}px`;
        nodeElement.style.position = 'absolute';
        
        // Node content with enhanced structure
        nodeElement.innerHTML = `
            <div class="node-header">
                <h4 class="node-title">${nodeData.title || 'New Stage'}</h4>
                <span class="node-type-badge ${nodeData.type || 'intermediate'}">${(nodeData.type || 'stage').toUpperCase()}</span>
            </div>
            <div class="node-content">
                <div class="node-meta">
                    ${nodeData.description ? `<p class="node-description">${nodeData.description}</p>` : ''}
                    <div class="node-field-count">
                        <span>Form</span>
                        <span>${nodeData.fields ? nodeData.fields.length : 0} fields</span>
                    </div>
                </div>
            </div>
            <div class="node-connection-points">
                <div class="connection-point input" data-direction="input"></div>
                <div class="connection-point output" data-direction="output"></div>
            </div>
        `;
        
        return nodeElement;
    }

    /**
     * Make a node interactive with drag, click, and context menu
     */
    makeNodeInteractive(nodeElement, nodeData) {
        const nodeId = nodeData.id;
        
        // Mouse down for dragging
        nodeElement.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.startNodeDrag(e, nodeId);
        });
        
        // Double click for editing
        nodeElement.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.editNode(nodeId);
        });
        
        // Right click for context menu
        nodeElement.addEventListener('contextmenu', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.showNodeContextMenu(e, nodeId);
        });
        
        // Click for selection
        nodeElement.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectNode(nodeId);
        });
        
        // Connection point interactions
        const connectionPoints = nodeElement.querySelectorAll('.connection-point');
        connectionPoints.forEach(point => {
            point.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                this.startConnection(e, nodeId, point.dataset.direction);
            });
        });
    }

    /**
     * Update node visual appearance
     */
    updateNode(nodeId, nodeData) {
        const nodeElement = this.renderCache.get(nodeId);
        if (!nodeElement) return;
        
        // Update title
        const titleElement = nodeElement.querySelector('.node-title');
        if (titleElement) {
            titleElement.textContent = nodeData.title || 'New Stage';
        }
        
        // Update description
        const existingDescription = nodeElement.querySelector('.node-description');
        if (nodeData.description) {
            if (existingDescription) {
                existingDescription.textContent = nodeData.description;
            } else {
                const metaElement = nodeElement.querySelector('.node-meta');
                const description = document.createElement('p');
                description.className = 'node-description';
                description.textContent = nodeData.description;
                metaElement.insertBefore(description, metaElement.firstChild);
            }
        } else if (existingDescription) {
            existingDescription.remove();
        }
        
        // Update field count
        const fieldCountElement = nodeElement.querySelector('.node-field-count span:last-child');
        if (fieldCountElement) {
            fieldCountElement.textContent = `${nodeData.fields ? nodeData.fields.length : 0} fields`;
        }
        
        // Update node type
        nodeElement.className = `workflow-node ${nodeData.type || 'stage'}`;
        const typeBadge = nodeElement.querySelector('.node-type-badge');
        if (typeBadge) {
            typeBadge.textContent = (nodeData.type || 'stage').toUpperCase();
            typeBadge.className = `node-type-badge ${nodeData.type || 'intermediate'}`;
        }
    }

    /**
     * Remove node from canvas
     */
    removeNode(nodeId) {
        const nodeElement = this.renderCache.get(nodeId);
        if (nodeElement) {
            // Remove any connections
            this.removeNodeConnections(nodeId);
            
            // Remove from DOM and cache
            nodeElement.remove();
            this.renderCache.delete(nodeId);
            
            // Clear selection if this node was selected
            if (this.selection.selectedNode === nodeId) {
                this.selection.selectedNode = null;
            }
        }
    }

    /**
     * Calculate default position for new nodes
     */
    calculateDefaultNodePosition() {
        const canvasRect = this.canvasElement.getBoundingClientRect();
        const nodes = Array.from(this.renderCache.values());
        
        // If no nodes exist, place in center
        if (nodes.length === 0) {
            return {
                x: canvasRect.width / 2 - 80, // Half node width
                y: canvasRect.height / 2 - 40  // Half node height
            };
        }
        
        // Find a free spot by checking existing positions
        let x = 100;
        let y = 100;
        let spacing = 200;
        
        while (this.isPositionOccupied(x, y, 160, 80)) {
            x += spacing;
            if (x > canvasRect.width - 200) {
                x = 100;
                y += spacing;
            }
        }
        
        return { x, y };
    }

    /**
     * Check if a position is occupied by another node
     */
    isPositionOccupied(x, y, width, height) {
        for (const nodeElement of this.renderCache.values()) {
            const nodeRect = nodeElement.getBoundingClientRect();
            const canvasRect = this.canvasElement.getBoundingClientRect();
            
            const nodeX = nodeRect.left - canvasRect.left;
            const nodeY = nodeRect.top - canvasRect.top;
            
            if (x < nodeX + nodeRect.width && 
                x + width > nodeX && 
                y < nodeY + nodeRect.height && 
                y + height > nodeY) {
                return true;
            }
        }
        return false;
    }

    // =====================================================
    // NODE INTERACTION METHODS
    // =====================================================

    /**
     * Start dragging a node
     */
    startNodeDrag(event, nodeId) {
        const nodeElement = this.renderCache.get(nodeId);
        if (!nodeElement) return;
        
        this.dragState = {
            isDragging: true,
            dragType: 'node',
            dragNode: nodeId,
            startX: event.clientX,
            startY: event.clientY,
            offsetX: event.clientX - nodeElement.offsetLeft,
            offsetY: event.clientY - nodeElement.offsetTop
        };
        
        nodeElement.classList.add('dragging');
        this.canvasElement.style.cursor = 'grabbing';
        
        // Select the node being dragged
        this.selectNode(nodeId);
    }

    /**
     * Select a node
     */
    selectNode(nodeId) {
        // Clear previous selection
        if (this.selection.selectedNode) {
            const prevElement = this.renderCache.get(this.selection.selectedNode);
            if (prevElement) {
                prevElement.classList.remove('selected');
            }
        }
        
        // Select new node
        this.selection.selectedNode = nodeId;
        const nodeElement = this.renderCache.get(nodeId);
        if (nodeElement) {
            nodeElement.classList.add('selected');
        }
        
        // Notify workflow builder
        if (this.workflowBuilder.onNodeSelected) {
            this.workflowBuilder.onNodeSelected(nodeId);
        }
    }

    /**
     * Edit a node (double-click)
     */
    editNode(nodeId) {
        if (this.workflowBuilder.editStage) {
            this.workflowBuilder.editStage(nodeId);
        }
    }

    /**
     * Show context menu for node
     */
    showNodeContextMenu(event, nodeId) {
        // Create context menu
        const contextMenu = document.createElement('div');
        contextMenu.className = 'context-menu';
        contextMenu.style.left = `${event.clientX}px`;
        contextMenu.style.top = `${event.clientY}px`;
        
        contextMenu.innerHTML = `
            <button class="context-menu-item" data-action="edit">Edit Stage</button>
            <button class="context-menu-item" data-action="duplicate">Duplicate</button>
            <div class="context-menu-divider"></div>
            <button class="context-menu-item danger" data-action="delete">Delete</button>
        `;
        
        // Add event listeners
        contextMenu.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            if (action) {
                this.handleNodeContextAction(nodeId, action);
            }
            contextMenu.remove();
        });
        
        // Add to document and auto-remove on outside click
        document.body.appendChild(contextMenu);
        
        setTimeout(() => {
            const removeMenu = (e) => {
                if (!contextMenu.contains(e.target)) {
                    contextMenu.remove();
                    document.removeEventListener('click', removeMenu);
                }
            };
            document.addEventListener('click', removeMenu);
        }, 10);
    }

    /**
     * Handle context menu actions
     */
    handleNodeContextAction(nodeId, action) {
        switch (action) {
            case 'edit':
                this.editNode(nodeId);
                break;
            case 'duplicate':
                if (this.workflowBuilder.duplicateStage) {
                    this.workflowBuilder.duplicateStage(nodeId);
                }
                break;
            case 'delete':
                if (this.workflowBuilder.deleteStage) {
                    this.workflowBuilder.deleteStage(nodeId);
                }
                break;
        }
    }

    // =====================================================
    // CANVAS INTERACTION METHODS
    // =====================================================

    /**
     * Handle mouse down on canvas
     */
    handleMouseDown(event) {
        if (event.target === this.canvasElement) {
            // Start canvas panning
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
     * Handle global mouse move for dragging
     */
    handleGlobalMouseMove(event) {
        if (!this.dragState.isDragging) return;
        
        if (this.dragState.dragType === 'node') {
            this.updateNodeDrag(event);
        } else if (this.dragState.dragType === 'canvas') {
            this.updateCanvasPan(event);
        }
    }

    /**
     * Update node position during drag
     */
    updateNodeDrag(event) {
        const nodeElement = this.renderCache.get(this.dragState.dragNode);
        if (!nodeElement) return;
        
        let x = event.clientX - this.dragState.offsetX;
        let y = event.clientY - this.dragState.offsetY;
        
        // Snap to grid if enabled
        if (this.grid.snap) {
            x = Math.round(x / this.grid.size) * this.grid.size;
            y = Math.round(y / this.grid.size) * this.grid.size;
        }
        
        nodeElement.style.left = `${x}px`;
        nodeElement.style.top = `${y}px`;
        
        // Update connections
        this.updateNodeConnections(this.dragState.dragNode);
    }

    /**
     * Update canvas pan during drag
     */
    updateCanvasPan(event) {
        const deltaX = event.clientX - this.dragState.startX;
        const deltaY = event.clientY - this.dragState.startY;
        
        this.viewport.panX = this.dragState.offsetX + deltaX;
        this.viewport.panY = this.dragState.offsetY + deltaY;
        
        this.applyViewportTransform();
    }

    /**
     * Handle global mouse up
     */
    handleGlobalMouseUp(event) {
        if (this.dragState.isDragging) {
            // Clean up drag state
            if (this.dragState.dragType === 'node') {
                const nodeElement = this.renderCache.get(this.dragState.dragNode);
                if (nodeElement) {
                    nodeElement.classList.remove('dragging');
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
        }
    }

    /**
     * Handle zoom
     */
    handleZoom(event) {
        event.preventDefault();
        
        const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(this.viewport.minZoom, 
                        Math.min(this.viewport.maxZoom, this.viewport.zoom * zoomFactor));
        
        if (newZoom !== this.viewport.zoom) {
            this.viewport.zoom = newZoom;
            this.applyViewportTransform();
        }
    }

    /**
     * Apply viewport transformation
     */
    applyViewportTransform() {
        // Update all node transforms
        this.renderCache.forEach(nodeElement => {
            nodeElement.style.transform = `scale(${this.viewport.zoom})`;
        });
        
        // Update grid position
        if (this.grid.enabled) {
            const gridSize = this.grid.size;
            this.canvasElement.style.backgroundPosition = 
                `${this.viewport.panX % gridSize}px ${this.viewport.panY % gridSize}px`;
        }
    }

    /**
     * Handle sidebar drop
     */
    handleSidebarDrop(event) {
        try {
            const data = JSON.parse(event.dataTransfer.getData('text/plain'));
            
            if (data.type === 'stage') {
                const dropPosition = {
                    x: event.offsetX,
                    y: event.offsetY
                };
                
                // Create new stage via workflow builder
                if (this.workflowBuilder.addStage) {
                    this.workflowBuilder.addStage(data.stageType || 'intermediate', dropPosition);
                }
            }
        } catch (error) {
            logger.error('Error handling sidebar drop:', error);
        }
    }

    /**
     * Handle context menu (right-click on canvas)
     */
    handleContextMenu(event) {
        if (event.target === this.canvasElement) {
            event.preventDefault();
            
            const contextMenu = document.createElement('div');
            contextMenu.className = 'context-menu';
            contextMenu.style.left = `${event.clientX}px`;
            contextMenu.style.top = `${event.clientY}px`;
            
            contextMenu.innerHTML = `
                <button class="context-menu-item" data-action="add-stage">Add Stage</button>
                <div class="context-menu-divider"></div>
                <button class="context-menu-item" data-action="reset-zoom">Reset Zoom</button>
                <button class="context-menu-item" data-action="fit-all">Fit All Nodes</button>
            `;
            
            contextMenu.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                if (action) {
                    this.handleCanvasContextAction(action, { x: event.offsetX, y: event.offsetY });
                }
                contextMenu.remove();
            });
            
            document.body.appendChild(contextMenu);
            
            setTimeout(() => {
                const removeMenu = (e) => {
                    if (!contextMenu.contains(e.target)) {
                        contextMenu.remove();
                        document.removeEventListener('click', removeMenu);
                    }
                };
                document.addEventListener('click', removeMenu);
            }, 10);
        }
    }

    /**
     * Handle canvas context actions
     */
    handleCanvasContextAction(action, position) {
        switch (action) {
            case 'add-stage':
                if (this.workflowBuilder.addStage) {
                    this.workflowBuilder.addStage('intermediate', position);
                }
                break;
            case 'reset-zoom':
                this.viewport.zoom = 1;
                this.viewport.panX = 0;
                this.viewport.panY = 0;
                this.applyViewportTransform();
                break;
            case 'fit-all':
                this.fitAllNodes();
                break;
        }
    }

    /**
     * Fit all nodes in viewport
     */
    fitAllNodes() {
        if (this.renderCache.size === 0) return;
        
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        this.renderCache.forEach(nodeElement => {
            const rect = nodeElement.getBoundingClientRect();
            const canvasRect = this.canvasElement.getBoundingClientRect();
            
            const x = rect.left - canvasRect.left;
            const y = rect.top - canvasRect.top;
            
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + rect.width);
            maxY = Math.max(maxY, y + rect.height);
        });
        
        const padding = 50;
        const contentWidth = maxX - minX + padding * 2;
        const contentHeight = maxY - minY + padding * 2;
        
        const canvasRect = this.canvasElement.getBoundingClientRect();
        const scaleX = canvasRect.width / contentWidth;
        const scaleY = canvasRect.height / contentHeight;
        
        this.viewport.zoom = Math.min(scaleX, scaleY, 1);
        this.viewport.panX = -(minX - padding);
        this.viewport.panY = -(minY - padding);
        
        this.applyViewportTransform();
    }

    /**
     * Update canvas size
     */
    updateCanvasSize() {
        // Update background grid if needed
        if (this.grid.enabled) {
            this.createGrid();
        }
    }

    // =====================================================
    // CONNECTION METHODS (Placeholder)
    // =====================================================

    /**
     * Start creating a connection
     */
    startConnection(event, nodeId, direction) {
        // TODO: Implement connection creation
        logger.log('Starting connection from', nodeId, direction);
    }

    /**
     * Update connections for a node
     */
    updateNodeConnections(nodeId) {
        // TODO: Implement connection updates
    }

    /**
     * Remove all connections for a node
     */
    removeNodeConnections(nodeId) {
        // TODO: Implement connection removal
    }

    // =====================================================
    // UTILITY METHODS
    // =====================================================

    /**
     * Handle initialization failure
     */
    handleInitializationFailure(error) {
        logger.warn('WorkflowCanvasManager running in degraded mode:', error.message);
        
        this.degradedMode = true;
        
        try {
            if (this.canvasElement) {
                this.canvasElement.innerHTML = `
                    <div style="padding: 20px; text-align: center; color: #666;">
                        Canvas initialization failed. Please refresh the page.
                    </div>
                `;
            }
        } catch (fallbackError) {
            logger.error('Even fallback initialization failed:', fallbackError);
        }
    }

    /**
     * Cleanup canvas manager
     */
    destroy() {
        // Remove all event listeners
        this.renderCache.forEach(element => element.remove());
        this.renderCache.clear();
        this.connectionCache.clear();
        
        // Reset viewport
        this.viewport = { zoom: 1, panX: 0, panY: 0, minZoom: 0.25, maxZoom: 3 };
    }

    // Placeholder methods for compatibility
    handleClick(event) {}
    handleDoubleClick(event) {}
    handleMouseMove(event) {}
    handleMouseUp(event) {}
    handleKeyDown(event) {}
}