/**
 * Workflow Nodes Module
 * Handles stage management, configuration, and business logic
 */

export class WorkflowNodes {
    constructor(projectId) {
        this.projectId = projectId;
        this.nodes = [];
        this.nodeTypes = {
            start: {
                label: 'Start Stage',
                icon: '📍',
                description: 'Entry point for the workflow',
                allowMultiple: false,
                requiresForm: true,
                defaultMaxHours: 0
            },
            intermediate: {
                label: 'Process Stage',
                icon: '⚙️',
                description: 'Processing step in the workflow',
                allowMultiple: true,
                requiresForm: false,
                defaultMaxHours: 24
            },
            end: {
                label: 'End Stage',
                icon: '✅',
                description: 'Final stage of the workflow',
                allowMultiple: true,
                requiresForm: false,
                defaultMaxHours: 0
            }
        };
        this.callbacks = {
            onNodeValidation: null,
            onNodeUpdate: null,
            onStageOrderChange: null
        };
    }

    // =====================================================
    // NODE MANAGEMENT
    // =====================================================

    /**
     * Create a new node with default properties
     */
    createNode(type, x = 100, y = 100) {
        const nodeConfig = this.nodeTypes[type];
        if (!nodeConfig) {
            throw new Error(`Invalid node type: ${type}`);
        }

        const node = {
            id: this.generateNodeId(),
            type: type,
            title: this.generateDefaultTitle(type),
            key: this.generateDefaultKey(type),
            x: x,
            y: y,
            maxHours: nodeConfig.defaultMaxHours,
            allowedRoles: this.getDefaultRoles(),
            formId: null,
            metadata: {
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            validation: {
                isValid: false,
                errors: []
            }
        };

        this.nodes.push(node);
        this.validateNode(node);
        this.updateStageOrder();
        
        return node;
    }

    /**
     * Update node properties
     */
    updateNode(nodeId, updates) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node) {
            throw new Error(`Node ${nodeId} not found`);
        }

        // Validate updates before applying
        const validationResult = this.validateNodeUpdates(node, updates);
        if (!validationResult.isValid) {
            throw new Error(`Validation failed: ${validationResult.errors.join(', ')}`);
        }

        // Apply updates
        Object.assign(node, updates);
        node.metadata.updatedAt = new Date().toISOString();

        // Re-validate node
        this.validateNode(node);
        
        // Update stage order if type changed
        if (updates.type) {
            this.updateStageOrder();
        }

        this.triggerCallback('onNodeUpdate', node);
        
        return node;
    }

    /**
     * Remove a node
     */
    removeNode(nodeId) {
        const nodeIndex = this.nodes.findIndex(n => n.id === nodeId);
        if (nodeIndex === -1) return false;

        const node = this.nodes[nodeIndex];
        this.nodes.splice(nodeIndex, 1);
        this.updateStageOrder();
        
        return node;
    }

    /**
     * Get node by ID
     */
    getNode(nodeId) {
        return this.nodes.find(n => n.id === nodeId);
    }

    /**
     * Get all nodes
     */
    getAllNodes() {
        return [...this.nodes];
    }

    /**
     * Get nodes by type
     */
    getNodesByType(type) {
        return this.nodes.filter(n => n.type === type);
    }

    // =====================================================
    // STAGE ORDERING AND RELATIONSHIPS
    // =====================================================

    /**
     * Update stage order based on workflow logic
     */
    updateStageOrder() {
        // Sort nodes: start -> intermediate -> end
        const startNodes = this.nodes.filter(n => n.type === 'start');
        const intermediateNodes = this.nodes.filter(n => n.type === 'intermediate');
        const endNodes = this.nodes.filter(n => n.type === 'end');

        // Assign stage orders
        let order = 1;
        
        startNodes.forEach(node => {
            node.stageOrder = order++;
        });
        
        intermediateNodes.forEach(node => {
            node.stageOrder = order++;
        });
        
        endNodes.forEach(node => {
            node.stageOrder = order++;
        });

        this.triggerCallback('onStageOrderChange', this.nodes);
    }

    /**
     * Get stage progression path
     */
    getStageProgression() {
        const orderedStages = [...this.nodes].sort((a, b) => (a.stageOrder || 0) - (b.stageOrder || 0));
        return orderedStages.map(stage => ({
            id: stage.id,
            key: stage.key,
            title: stage.title,
            type: stage.type,
            order: stage.stageOrder || 0
        }));
    }

    /**
     * Check if stage can be reached from start
     */
    isStageReachable(nodeId, transitions = []) {
        const startNodes = this.getNodesByType('start');
        if (startNodes.length === 0) return false;

        // For now, simple reachability - can be enhanced with transition analysis
        const node = this.getNode(nodeId);
        return node && node.type === 'start' || this.hasPathToNode(startNodes, nodeId, transitions);
    }

    /**
     * Check if there's a path to a node through transitions
     */
    hasPathToNode(startNodes, targetNodeId, transitions) {
        const visited = new Set();
        const queue = startNodes.map(n => n.id);

        while (queue.length > 0) {
            const currentNodeId = queue.shift();
            if (visited.has(currentNodeId)) continue;
            visited.add(currentNodeId);

            if (currentNodeId === targetNodeId) return true;

            // Find transitions from current node
            const outgoingTransitions = transitions.filter(t => t.fromId === currentNodeId);
            outgoingTransitions.forEach(transition => {
                if (!visited.has(transition.toId)) {
                    queue.push(transition.toId);
                }
            });
        }

        return false;
    }

    // =====================================================
    // VALIDATION
    // =====================================================

    /**
     * Validate a single node
     */
    validateNode(node) {
        const errors = [];
        const nodeConfig = this.nodeTypes[node.type];

        // Basic property validation
        if (!node.title?.trim()) {
            errors.push('Stage title is required');
        }

        if (!node.key?.trim()) {
            errors.push('Stage key is required');
        } else if (!this.isValidStageKey(node.key)) {
            errors.push('Stage key must contain only letters, numbers, and underscores');
        } else if (this.isDuplicateKey(node.key, node.id)) {
            errors.push('Stage key must be unique');
        }

        if (!node.allowedRoles || node.allowedRoles.length === 0) {
            errors.push('At least one role must be assigned');
        }

        if (node.maxHours < 0) {
            errors.push('Max hours cannot be negative');
        }

        // Type-specific validation
        if (node.type === 'start' && nodeConfig.requiresForm && !node.formId) {
            // Note: This is lenient for now, as forms might be created during save
            // errors.push('Start stage requires an initial form');
        }

        // Update node validation state
        node.validation = {
            isValid: errors.length === 0,
            errors: errors
        };

        this.triggerCallback('onNodeValidation', node);
        
        return node.validation;
    }

    /**
     * Validate node updates before applying
     */
    validateNodeUpdates(node, updates) {
        const errors = [];

        // Check if key will be unique (if being updated)
        if (updates.key && updates.key !== node.key) {
            if (!this.isValidStageKey(updates.key)) {
                errors.push('Stage key must contain only letters, numbers, and underscores');
            } else if (this.isDuplicateKey(updates.key, node.id)) {
                errors.push('Stage key must be unique');
            }
        }

        // Check title
        if (updates.title !== undefined && !updates.title?.trim()) {
            errors.push('Stage title is required');
        }

        // Check roles
        if (updates.allowedRoles !== undefined && (!updates.allowedRoles || updates.allowedRoles.length === 0)) {
            errors.push('At least one role must be assigned');
        }

        // Check max hours
        if (updates.maxHours !== undefined && updates.maxHours < 0) {
            errors.push('Max hours cannot be negative');
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Validate all nodes
     */
    validateAllNodes() {
        const allErrors = [];
        const nodeValidations = [];

        this.nodes.forEach((node, index) => {
            const validation = this.validateNode(node);
            nodeValidations.push({
                nodeId: node.id,
                validation: validation
            });

            if (!validation.isValid) {
                validation.errors.forEach(error => {
                    allErrors.push(`Stage ${index + 1} (${node.title}): ${error}`);
                });
            }
        });

        // Workflow-level validation
        const workflowErrors = this.validateWorkflowStructure();
        allErrors.push(...workflowErrors);

        return {
            isValid: allErrors.length === 0,
            errors: allErrors,
            nodeValidations: nodeValidations
        };
    }

    /**
     * Validate workflow structure
     */
    validateWorkflowStructure() {
        const errors = [];

        if (this.nodes.length === 0) {
            errors.push('Workflow must have at least one stage');
            return errors;
        }

        const startNodes = this.getNodesByType('start');
        if (startNodes.length === 0) {
            errors.push('Workflow must have exactly one start stage');
        } else if (startNodes.length > 1) {
            errors.push('Workflow can only have one start stage');
        }

        // Check for isolated nodes (no incoming or outgoing transitions)
        // This would require transition data, so it's optional here
        
        return errors;
    }

    // =====================================================
    // FORM INTEGRATION
    // =====================================================

    /**
     * Associate a form with a start stage
     */
    async setStartStageForm(nodeId, formId) {
        const node = this.getNode(nodeId);
        if (!node) {
            throw new Error(`Node ${nodeId} not found`);
        }

        if (node.type !== 'start') {
            throw new Error('Only start stages can have initial forms');
        }

        node.formId = formId;
        node.metadata.updatedAt = new Date().toISOString();
        
        this.validateNode(node);
        this.triggerCallback('onNodeUpdate', node);
        
        return node;
    }

    /**
     * Remove form from start stage
     */
    removeStartStageForm(nodeId) {
        const node = this.getNode(nodeId);
        if (!node) return false;

        node.formId = null;
        node.metadata.updatedAt = new Date().toISOString();
        
        this.validateNode(node);
        this.triggerCallback('onNodeUpdate', node);
        
        return true;
    }

    // =====================================================
    // ROLE MANAGEMENT
    // =====================================================

    /**
     * Add role to node
     */
    addRoleToNode(nodeId, roleName) {
        const node = this.getNode(nodeId);
        if (!node) return false;

        if (!node.allowedRoles.includes(roleName)) {
            node.allowedRoles.push(roleName);
            node.metadata.updatedAt = new Date().toISOString();
            
            this.validateNode(node);
            this.triggerCallback('onNodeUpdate', node);
        }
        
        return true;
    }

    /**
     * Remove role from node
     */
    removeRoleFromNode(nodeId, roleName) {
        const node = this.getNode(nodeId);
        if (!node) return false;

        const index = node.allowedRoles.indexOf(roleName);
        if (index > -1) {
            node.allowedRoles.splice(index, 1);
            node.metadata.updatedAt = new Date().toISOString();
            
            this.validateNode(node);
            this.triggerCallback('onNodeUpdate', node);
        }
        
        return true;
    }

    /**
     * Set roles for node
     */
    setNodeRoles(nodeId, roles) {
        const node = this.getNode(nodeId);
        if (!node) return false;

        node.allowedRoles = [...roles];
        node.metadata.updatedAt = new Date().toISOString();
        
        this.validateNode(node);
        this.triggerCallback('onNodeUpdate', node);
        
        return true;
    }

    // =====================================================
    // DATA IMPORT/EXPORT
    // =====================================================

    /**
     * Set nodes data (for loading from storage)
     */
    setNodes(nodes) {
        this.nodes = nodes.map(node => ({
            ...node,
            validation: {
                isValid: false,
                errors: []
            }
        }));
        
        // Validate all nodes
        this.nodes.forEach(node => this.validateNode(node));
        this.updateStageOrder();
    }

    /**
     * Get nodes data for export/storage
     */
    getNodesData() {
        return this.nodes.map(node => ({
            ...node,
            // Remove validation data for storage
            validation: undefined
        })).filter(node => {
            delete node.validation;
            return true;
        });
    }

    /**
     * Clear all nodes
     */
    clearNodes() {
        this.nodes = [];
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
     * Generate default title for node type
     */
    generateDefaultTitle(type) {
        const config = this.nodeTypes[type];
        const existingCount = this.getNodesByType(type).length;
        return `${config.label} ${existingCount + 1}`;
    }

    /**
     * Generate default key for node type
     */
    generateDefaultKey(type) {
        const existingCount = this.getNodesByType(type).length;
        const baseKey = type === 'intermediate' ? 'stage' : type;
        return `${baseKey}_${existingCount + 1}`;
    }

    /**
     * Get default roles for new nodes
     */
    getDefaultRoles() {
        return ['technician', 'supervisor'];
    }

    /**
     * Check if stage key is valid
     */
    isValidStageKey(key) {
        return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(key);
    }

    /**
     * Check if stage key is duplicate
     */
    isDuplicateKey(key, excludeNodeId = null) {
        return this.nodes.some(node => 
            node.key === key && node.id !== excludeNodeId
        );
    }

    /**
     * Get node statistics
     */
    getNodeStatistics() {
        const stats = {
            total: this.nodes.length,
            byType: {},
            validNodes: 0,
            invalidNodes: 0,
            withForms: 0
        };

        Object.keys(this.nodeTypes).forEach(type => {
            stats.byType[type] = this.getNodesByType(type).length;
        });

        this.nodes.forEach(node => {
            if (node.validation?.isValid) {
                stats.validNodes++;
            } else {
                stats.invalidNodes++;
            }

            if (node.formId) {
                stats.withForms++;
            }
        });

        return stats;
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
     * Get node type configuration
     */
    getNodeTypeConfig(type) {
        return this.nodeTypes[type];
    }

    /**
     * Get all node type configurations
     */
    getAllNodeTypes() {
        return { ...this.nodeTypes };
    }
}

export default WorkflowNodes;