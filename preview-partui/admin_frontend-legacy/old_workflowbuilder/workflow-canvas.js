/**
 * Workflow Canvas Module
 * Handles visual canvas operations, drag/drop, node rendering, and transitions
 */

export class WorkflowCanvas {
    constructor(canvasElementId) {
        this.canvasElement = document.getElementById(canvasElementId);
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.connectingFrom = null;
        
        // Zoom and pan properties
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.isPanning = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        
        this.callbacks = {
            onNodeCreate: null,
            onNodeEdit: null,
            onNodeDelete: null,
            onTransitionCreate: null,
            onTransitionEdit: null,
            onTransitionDelete: null,
            onCanvasChange: null
        };
        
        this.initialize();
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    /**
     * Initialize canvas functionality
     */
    initialize() {
        if (!this.canvasElement) {
            throw new Error('Canvas element not found');
        }
        
        this.setupEventListeners();
    }

    /**
     * Setup event listeners for canvas interactions
     */
    setupEventListeners() {
        // Canvas click handler (for deselecting)
        this.canvasElement.addEventListener('click', (e) => {
            if (e.target === this.canvasElement) {
                this.clearSelection();
            }
        });

        // Prevent context menu on canvas
        this.canvasElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        
        // Mouse wheel zoom
        this.canvasElement.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.handleZoom(e);
        });
        
        // Pan with middle mouse button or space+left mouse
        this.canvasElement.addEventListener('mousedown', (e) => {
            if (e.button === 1 || (e.button === 0 && e.ctrlKey)) { // Middle mouse or Ctrl+left mouse
                e.preventDefault();
                this.startPanning(e);
            }
        });
        
        this.canvasElement.addEventListener('mousemove', (e) => {
            if (this.isPanning) {
                this.handlePanning(e);
            }
        });
        
        this.canvasElement.addEventListener('mouseup', (e) => {
            if (e.button === 1 || (e.button === 0 && this.isPanning)) {
                this.stopPanning();
            }
        });
        
        this.canvasElement.addEventListener('mouseleave', () => {
            this.stopPanning();
        });
    }

    // =====================================================
    // NODE MANAGEMENT
    // =====================================================


    /**
     * Update node position
     */
    updateNodePosition(nodeId, x, y) {
        const node = window.nodes?.find(n => n.id === nodeId);
        if (!node) return false;

        node.x = Math.max(0, x);
        node.y = Math.max(0, y);

        const nodeElement = document.getElementById(nodeId);
        if (nodeElement) {
            nodeElement.style.left = node.x + 'px';
            nodeElement.style.top = node.y + 'px';
        }

        // Re-render transitions to update connection lines
        this.renderTransitions();
        this.triggerCallback('onCanvasChange');
        
        return true;
    }

    /**
     * Update node properties
     */
    updateNode(nodeId, updates) {
        const node = window.nodes?.find(n => n.id === nodeId);
        if (!node) return false;

        Object.assign(node, updates);
        this.renderNode(node);
        this.triggerCallback('onCanvasChange');
        
        return true;
    }

    // =====================================================
    // NODE RENDERING
    // =====================================================

    /**
     * Render a single node
     */
    renderNode(node) {
        // Remove existing node element if it exists
        const existingElement = document.getElementById(node.id);
        if (existingElement) {
            existingElement.remove();
        }

        const nodeElement = document.createElement('div');
        nodeElement.className = `node ${node.type}`;
        nodeElement.id = node.id;
        nodeElement.style.left = node.x + 'px';
        nodeElement.style.top = node.y + 'px';

        // Add node content
        nodeElement.innerHTML = this.getNodeContent(node);

        // Add event listeners
        this.addNodeEventListeners(nodeElement, node);

        // Add to canvas
        this.canvasElement.appendChild(nodeElement);
    }

    /**
     * Get node content HTML
     */
    getNodeContent(node) {
        let formInfo = '';
        let progressIndicator = '';

        if (node.type === 'start' && node.formId) {
            formInfo = '<br><small>📝 Has initial form</small>';
            progressIndicator = '<div style="background: #4CAF50; height: 3px; border-radius: 2px; margin-top: 4px;"></div>';
        }

        // Add visual indicators for node state
        const title = node.title || 'Untitled';
        const key = node.key || 'no_key';
        
        return `
            <strong>${title}</strong><br>
            <small>${key}</small>${formInfo}
            ${progressIndicator}
        `;
    }

    /**
     * Add event listeners to node element
     */
    addNodeEventListeners(nodeElement, node) {
        // Double-click to edit
        nodeElement.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.triggerCallback('onNodeEdit', node);
        });

        // Mouse down for dragging
        nodeElement.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.startNodeDrag(e, node, nodeElement);
        });

        // Right-click for connections
        nodeElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handleNodeConnection(node, nodeElement);
        });

        // Selection
        nodeElement.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectNode(node);
        });
    }

    /**
     * Start node dragging
     */
    startNodeDrag(e, node, nodeElement) {
        this.isDragging = true;
        window.selectedNode = node;
        
        const rect = nodeElement.getBoundingClientRect();
        this.dragOffset.x = e.clientX - rect.left;
        this.dragOffset.y = e.clientY - rect.top;

        const onMouseMove = (e) => {
            if (!this.isDragging) return;
            
            const canvasRect = this.canvasElement.getBoundingClientRect();
            const newX = e.clientX - canvasRect.left - this.dragOffset.x;
            const newY = e.clientY - canvasRect.top - this.dragOffset.y;
            
            this.updateNodePosition(node.id, newX, newY);
        };

        const onMouseUp = () => {
            this.isDragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    /**
     * Handle node connection (right-click)
     */
    handleNodeConnection(node, nodeElement) {
        if (this.connectingFrom && this.connectingFrom !== node) {
            // Create connection between different nodes
            this.createTransition(this.connectingFrom, node);
            this.clearConnectionState();
        } else if (this.connectingFrom && this.connectingFrom === node) {
            // Create edit action on same node
            this.createEditAction(node);
            this.clearConnectionState();
        } else {
            // Start connection from this node
            this.connectingFrom = node;
            this.visualizeConnectionStart(nodeElement);
        }
    }

    /**
     * Visualize connection start
     */
    visualizeConnectionStart(nodeElement) {
        // Reset all node borders
        document.querySelectorAll('.node').forEach(n => {
            n.style.border = '2px solid #333';
        });
        
        // Highlight source node
        nodeElement.style.border = '3px solid red';
    }

    /**
     * Clear connection state
     */
    clearConnectionState() {
        this.connectingFrom = null;
        document.querySelectorAll('.node').forEach(n => {
            n.style.border = '2px solid #333';
        });
    }

    /**
     * Select a node
     */
    selectNode(node) {
        window.selectedNode = node;
        
        // Visual feedback for selection
        document.querySelectorAll('.node').forEach(n => {
            n.classList.remove('selected');
        });
        
        const nodeElement = document.getElementById(node.id);
        if (nodeElement) {
            nodeElement.classList.add('selected');
        }
    }

    /**
     * Clear all selections
     */
    clearSelection() {
        window.selectedNode = null;
        this.clearConnectionState();
        
        document.querySelectorAll('.node').forEach(n => {
            n.classList.remove('selected');
        });
    }

    // =====================================================
    // TRANSITION MANAGEMENT
    // =====================================================

    /**
     * Create a transition between nodes
     */
    createTransition(fromNode, toNode) {
        const transitionId = this.generateTransitionId(fromNode.id, toNode.id);
        
        const transition = {
            id: transitionId,
            fromId: fromNode.id,
            toId: toNode.id,
            name: `${fromNode.title} → ${toNode.title}`,
            buttonLabel: 'Next',
            buttonColor: '#007bff',
            allowedRoles: ['technician', 'supervisor'],
            conditions: [],
            requiresConfirmation: false,
            confirmationMessage: '',
            isEditAction: false,
            formId: null,
            metadata: {}
        };

        window.transitions?.push(transition);
        this.renderTransitions();
        this.triggerCallback('onTransitionCreate', transition);
        this.triggerCallback('onCanvasChange');
        
        return transition;
    }

    /**
     * Create an edit action (same node)
     */
    createEditAction(node) {
        const transitionId = this.generateEditActionId(node.id);
        
        const editAction = {
            id: transitionId,
            fromId: node.id,
            toId: node.id,
            name: `Edit ${node.title}`,
            buttonLabel: 'Edit',
            buttonColor: '#ff9800',
            allowedRoles: ['technician', 'supervisor'],
            conditions: [],
            requiresConfirmation: false,
            confirmationMessage: '',
            isEditAction: true,
            editableFields: [],
            metadata: {}
        };

        window.transitions?.push(editAction);
        this.renderTransitions();
        this.triggerCallback('onTransitionCreate', editAction);
        this.triggerCallback('onCanvasChange');
        
        return editAction;
    }

    /**
     * Remove a transition
     */
    removeTransition(transitionId) {
        const transitionIndex = window.transitions?.findIndex(t => t.id === transitionId) ?? -1;
        if (transitionIndex === -1) return false;

        const transition = window.transitions[transitionIndex];
        window.transitions.splice(transitionIndex, 1);
        
        this.renderTransitions();
        this.triggerCallback('onTransitionDelete', transition);
        this.triggerCallback('onCanvasChange');
        
        return true;
    }

    // =====================================================
    // TRANSITION RENDERING
    // =====================================================

    /**
     * Render all transitions
     */
    renderTransitions() {
        // Remove existing transition elements
        this.canvasElement.querySelectorAll('.transition, .transition-label, .edit-action').forEach(el => {
            el.remove();
        });

        // Render each transition
        window.transitions?.forEach(transition => {
            this.renderTransition(transition);
        });
    }

    /**
     * Render a single transition
     */
    renderTransition(transition) {
        const nodes = window.nodes || [];
        const fromNode = nodes.find(n => n.id === transition.fromId);
        const toNode = nodes.find(n => n.id === transition.toId);
        
        if (!fromNode || !toNode) return;

        if (transition.isEditAction) {
            this.renderEditAction(transition, fromNode);
        } else {
            this.renderConnectionLine(transition, fromNode, toNode);
        }
    }

    /**
     * Render edit action as rotating icon
     */
    renderEditAction(transition, node) {
        const editIcon = document.createElement('div');
        editIcon.className = 'edit-action';
        editIcon.innerHTML = '↻';
        editIcon.style.left = (node.x + 130) + 'px';
        editIcon.style.top = (node.y + 10) + 'px';
        editIcon.title = `${transition.buttonLabel} - ${transition.allowedRoles.join(', ')}`;
        
        editIcon.addEventListener('click', () => {
            this.triggerCallback('onTransitionEdit', transition);
        });

        this.canvasElement.appendChild(editIcon);
    }

    /**
     * Render connection line between nodes
     */
    renderConnectionLine(transition, fromNode, toNode) {
        const fromX = fromNode.x + 60; // Center of node
        const fromY = fromNode.y + 20;
        const toX = toNode.x + 60;
        const toY = toNode.y + 20;

        const length = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
        const angle = Math.atan2(toY - fromY, toX - fromX) * 180 / Math.PI;

        // Create line element
        const line = document.createElement('div');
        line.className = `transition ${transition.formId ? 'has-action' : ''}`;
        line.style.left = fromX + 'px';
        line.style.top = fromY + 'px';
        line.style.width = length + 'px';
        line.style.transform = `rotate(${angle}deg)`;
        
        line.addEventListener('click', () => {
            this.triggerCallback('onTransitionEdit', transition);
        });

        this.canvasElement.appendChild(line);

        // Create label
        this.renderTransitionLabel(transition, fromX, fromY, toX, toY);
    }

    /**
     * Render transition label
     */
    renderTransitionLabel(transition, fromX, fromY, toX, toY) {
        const label = document.createElement('div');
        label.className = `transition-label ${transition.formId ? 'has-action' : ''}`;
        
        const actionInfo = transition.formId ? ' (+form)' : '';
        label.textContent = transition.buttonLabel + actionInfo;
        
        label.style.left = (fromX + toX) / 2 + 'px';
        label.style.top = (fromY + toY) / 2 + 'px';
        
        this.canvasElement.appendChild(label);
    }

    // =====================================================
    // CANVAS OPERATIONS
    // =====================================================

    /**
     * Clear the entire canvas
     */
    clearCanvas() {
        if (window.nodes) window.nodes.length = 0;
        if (window.transitions) window.transitions.length = 0;
        this.canvasElement.innerHTML = '';
        this.clearSelection();
        this.triggerCallback('onCanvasChange');
    }

    /**
     * Refresh the entire canvas
     */
    refreshCanvas() {
        this.canvasElement.innerHTML = '';
        
        // Re-render all nodes
        const nodes = window.nodes || [];
        nodes.forEach(node => {
            this.renderNode(node);
        });
        
        // Re-render all transitions after nodes are rendered
        setTimeout(() => {
            this.renderTransitions();
        }, 50);
        
        // Update minimap if it exists
        this.updateMinimap();
    }

    /**
     * Set canvas data (nodes and transitions)
     */
    setData(nodes, transitions) {
        if (window.nodes) {
            window.nodes.length = 0;
            window.nodes.push(...nodes);
        }
        if (window.transitions) {
            window.transitions.length = 0;
            window.transitions.push(...transitions);
        }
        this.refreshCanvas();
        this.triggerCallback('onCanvasChange');
    }

    /**
     * Get canvas data
     */
    getData() {
        return {
            nodes: [...this.nodes],
            transitions: [...this.transitions]
        };
    }

    // =====================================================
    // UTILITY METHODS
    // =====================================================

    /**
     * Generate unique node ID
     */
    generateNodeId() {
        return 'node_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Generate unique transition ID
     */
    generateTransitionId(fromId, toId) {
        return `trans_${fromId}_${toId}_${Date.now()}`;
    }

    /**
     * Generate unique edit action ID
     */
    generateEditActionId(nodeId) {
        return `edit_${nodeId}_${Date.now()}`;
    }

    /**
     * Get default node title
     */
    getDefaultNodeTitle(type) {
        const titles = {
            start: 'Start',
            stage: 'Stage',
            intermediate: 'Process',
            end: 'End'
        };
        return titles[type] || 'Node';
    }

    /**
     * Generate node key
     */
    generateNodeKey(type) {
        const timestamp = Date.now().toString().slice(-4);
        return `${type}_${timestamp}`;
    }

    /**
     * Set callback functions
     */
    setCallbacks(callbacks) {
        Object.assign(this.callbacks, callbacks);
    }

    /**
     * Trigger callback if exists
     */
    triggerCallback(name, ...args) {
        if (this.callbacks[name] && typeof this.callbacks[name] === 'function') {
            this.callbacks[name](...args);
        }
    }

    /**
     * Get node by ID
     */
    getNode(nodeId) {
        return this.nodes.find(n => n.id === nodeId);
    }

    /**
     * Get transition by ID
     */
    getTransition(transitionId) {
        return window.transitions?.find(t => t.id === transitionId);
    }

    /**
     * Get all nodes
     */
    getAllNodes() {
        return [...this.nodes];
    }

    /**
     * Get all transitions
     */
    getAllTransitions() {
        return [...this.transitions];
    }

    /**
     * Get selected node
     */
    getSelectedNode() {
        return window.selectedNode;
    }

    /**
     * Check if canvas is empty
     */
    isEmpty() {
        return (window.nodes?.length === 0 || !window.nodes) && (window.transitions?.length === 0 || !window.transitions);
    }

    /**
     * Get canvas bounds
     */
    getCanvasBounds() {
        const nodes = window.nodes || [];
        if (nodes.length === 0) {
            return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
        }

        let minX = Math.min(...nodes.map(n => n.x));
        let minY = Math.min(...nodes.map(n => n.y));
        let maxX = Math.max(...nodes.map(n => n.x + 120)); // Node width
        let maxY = Math.max(...nodes.map(n => n.y + 60));  // Node height

        return { minX, minY, maxX, maxY };
    }

    // =====================================================
    // ZOOM AND PAN FUNCTIONALITY
    // =====================================================

    /**
     * Handle mouse wheel zoom
     */
    handleZoom(e) {
        const zoomSpeed = 0.1;
        const rect = this.canvasElement.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        const oldZoom = this.zoom;
        
        if (e.deltaY < 0) {
            this.zoom = Math.min(this.zoom + zoomSpeed, 3); // Max zoom 3x
        } else {
            this.zoom = Math.max(this.zoom - zoomSpeed, 0.2); // Min zoom 0.2x
        }
        
        // Adjust pan to zoom towards mouse cursor
        const zoomRatio = this.zoom / oldZoom;
        this.panX = centerX - (centerX - this.panX) * zoomRatio;
        this.panY = centerY - (centerY - this.panY) * zoomRatio;
        
        this.applyTransform();
        this.updateMinimap();
    }

    /**
     * Start panning
     */
    startPanning(e) {
        this.isPanning = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.canvasElement.style.cursor = 'grabbing';
    }

    /**
     * Handle panning movement
     */
    handlePanning(e) {
        if (!this.isPanning) return;
        
        const deltaX = e.clientX - this.lastMouseX;
        const deltaY = e.clientY - this.lastMouseY;
        
        this.panX += deltaX;
        this.panY += deltaY;
        
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        
        this.applyTransform();
        this.updateMinimap();
    }

    /**
     * Stop panning
     */
    stopPanning() {
        this.isPanning = false;
        this.canvasElement.style.cursor = '';
    }

    /**
     * Apply zoom and pan transform to canvas
     */
    applyTransform() {
        this.canvasElement.style.transform = `scale(${this.zoom}) translate(${this.panX / this.zoom}px, ${this.panY / this.zoom}px)`;
        this.canvasElement.style.transformOrigin = '0 0';
        
        // Re-render transitions after a small delay to ensure nodes are positioned correctly
        setTimeout(() => {
            this.renderTransitions();
        }, 10);
    }

    /**
     * Reset zoom and pan
     */
    resetView() {
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.applyTransform();
        this.updateMinimap();
    }

    /**
     * Fit all nodes in view
     */
    fitToView() {
        const bounds = this.getCanvasBounds();
        const rect = this.canvasElement.getBoundingClientRect();
        
        if (bounds.maxX === bounds.minX && bounds.maxY === bounds.minY) {
            this.resetView();
            return;
        }
        
        const contentWidth = bounds.maxX - bounds.minX + 100; // Add padding
        const contentHeight = bounds.maxY - bounds.minY + 100;
        
        const scaleX = rect.width / contentWidth;
        const scaleY = rect.height / contentHeight;
        
        this.zoom = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 1x
        this.panX = (rect.width - contentWidth * this.zoom) / 2 - bounds.minX * this.zoom;
        this.panY = (rect.height - contentHeight * this.zoom) / 2 - bounds.minY * this.zoom;
        
        this.applyTransform();
        this.updateMinimap();
    }

    // =====================================================
    // MINIMAP FUNCTIONALITY
    // =====================================================

    /**
     * Initialize minimap
     */
    initializeMinimap() {
        // Create minimap container
        const minimap = document.createElement('div');
        minimap.id = 'canvas-minimap';
        minimap.className = 'canvas-minimap';
        
        // Create viewport indicator
        const viewport = document.createElement('div');
        viewport.className = 'minimap-viewport';
        minimap.appendChild(viewport);
        
        // Add to canvas container
        this.canvasElement.parentElement.appendChild(minimap);
        
        // Add minimap event listeners
        this.setupMinimapEvents(minimap, viewport);
        
        this.updateMinimap();
    }

    /**
     * Setup minimap event listeners
     */
    setupMinimapEvents(minimap, viewport) {
        let dragging = false;
        
        minimap.addEventListener('mousedown', (e) => {
            dragging = true;
            this.handleMinimapClick(e, minimap);
        });
        
        document.addEventListener('mousemove', (e) => {
            if (dragging) {
                this.handleMinimapClick(e, minimap);
            }
        });
        
        document.addEventListener('mouseup', () => {
            dragging = false;
        });
    }

    /**
     * Handle minimap click/drag
     */
    handleMinimapClick(e, minimap) {
        const rect = minimap.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        
        const bounds = this.getCanvasBounds();
        const canvasRect = this.canvasElement.getBoundingClientRect();
        
        // Convert minimap coordinates to canvas coordinates
        const scaleX = (bounds.maxX - bounds.minX) / rect.width;
        const scaleY = (bounds.maxY - bounds.minY) / rect.height;
        
        const targetX = bounds.minX + clickX * scaleX;
        const targetY = bounds.minY + clickY * scaleY;
        
        // Center view on clicked point
        this.panX = canvasRect.width / 2 - targetX * this.zoom;
        this.panY = canvasRect.height / 2 - targetY * this.zoom;
        
        this.applyTransform();
        this.updateMinimap();
    }

    /**
     * Update minimap display
     */
    updateMinimap() {
        const minimap = document.getElementById('canvas-minimap');
        if (!minimap) return;
        
        const viewport = minimap.querySelector('.minimap-viewport');
        if (!viewport) return;
        
        const bounds = this.getCanvasBounds();
        const canvasRect = this.canvasElement.getBoundingClientRect();
        
        // Update viewport position and size
        const minimapRect = minimap.getBoundingClientRect();
        const scaleX = minimapRect.width / (bounds.maxX - bounds.minX);
        const scaleY = minimapRect.height / (bounds.maxY - bounds.minY);
        
        const viewportWidth = canvasRect.width / this.zoom * scaleX;
        const viewportHeight = canvasRect.height / this.zoom * scaleY;
        const viewportX = (-this.panX / this.zoom - bounds.minX) * scaleX;
        const viewportY = (-this.panY / this.zoom - bounds.minY) * scaleY;
        
        viewport.style.width = Math.min(viewportWidth, minimapRect.width) + 'px';
        viewport.style.height = Math.min(viewportHeight, minimapRect.height) + 'px';
        viewport.style.left = Math.max(0, Math.min(viewportX, minimapRect.width - viewportWidth)) + 'px';
        viewport.style.top = Math.max(0, Math.min(viewportY, minimapRect.height - viewportHeight)) + 'px';
        
        // Update minimap nodes
        this.updateMinimapNodes(minimap, bounds, scaleX, scaleY);
    }

    /**
     * Update minimap nodes
     */
    updateMinimapNodes(minimap, bounds, scaleX, scaleY) {
        // Remove existing minimap nodes
        minimap.querySelectorAll('.minimap-node').forEach(n => n.remove());
        
        // Add nodes to minimap
        const nodes = window.nodes || [];
        nodes.forEach(node => {
            const minimapNode = document.createElement('div');
            minimapNode.className = 'minimap-node';
            minimapNode.style.left = (node.x - bounds.minX) * scaleX + 'px';
            minimapNode.style.top = (node.y - bounds.minY) * scaleY + 'px';
            minimapNode.style.backgroundColor = this.getNodeColor(node.type);
            minimap.appendChild(minimapNode);
        });
    }

    /**
     * Get node color based on type
     */
    getNodeColor(type) {
        switch (type) {
            case 'start': return '#90EE90';
            case 'stage': return '#87CEEB';
            case 'end': return '#FFB6C1';
            default: return '#ccc';
        }
    }
}

export default WorkflowCanvas;