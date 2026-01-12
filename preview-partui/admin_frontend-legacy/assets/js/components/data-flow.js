/**
 * Data Flow Module
 * Handles real-time data flow visualization and progressive data tracking in workflows
 */

export class DataFlow {
    constructor() {
        this.nodes = [];
        this.actions = [];
        this.forms = [];
        this.formFields = [];
        this.dataFlowCache = new Map();
        this.callbacks = {
            onDataFlowUpdate: null,
            onFieldConflict: null,
            onFieldInheritance: null
        };
    }

    // =====================================================
    // DATA FLOW CALCULATION
    // =====================================================

    /**
     * Calculate complete data flow for workflow
     */
    calculateDataFlow() {
        this.dataFlowCache.clear();
        const dataFlow = {};

        // Process nodes in stage order
        const orderedNodes = this.getOrderedNodes();
        
        orderedNodes.forEach(node => {
            const stageData = this.calculateStageDataFlow(node);
            dataFlow[node.id] = stageData;
            this.dataFlowCache.set(node.id, stageData);
        });

        this.triggerCallback('onDataFlowUpdate', dataFlow);
        return dataFlow;
    }

    /**
     * Calculate data flow for a specific stage
     */
    calculateStageDataFlow(node) {
        const stageData = {
            nodeId: node.id,
            stageName: node.title,
            stageKey: node.key,
            stageType: node.type,
            stageOrder: node.stageOrder || 0,
            availableFields: [],
            inheritedFields: [],
            newFields: [],
            totalFieldCount: 0,
            fieldSources: {},
            conflicts: [],
            dataQuality: {
                completeness: 0,
                consistency: 1,
                accuracy: 1
            }
        };

        // Get inherited fields from previous stages
        const inheritedFields = this.getInheritedFields(node);
        stageData.inheritedFields = inheritedFields;

        // Get new fields added at this stage
        const newFields = this.getNewFieldsAtStage(node);
        stageData.newFields = newFields;

        // Combine all available fields
        stageData.availableFields = [...inheritedFields, ...newFields];
        stageData.totalFieldCount = stageData.availableFields.length;

        // Track field sources
        stageData.fieldSources = this.mapFieldSources(stageData.availableFields);

        // Detect conflicts
        stageData.conflicts = this.detectFieldConflicts(stageData.availableFields);

        // Calculate data quality metrics
        stageData.dataQuality = this.calculateDataQuality(stageData);

        return stageData;
    }

    /**
     * Get fields inherited from previous stages
     */
    getInheritedFields(targetNode) {
        const inheritedFields = [];
        const visited = new Set();
        
        // Find path to this node through actions
        const pathData = this.tracePath(targetNode, visited);
        
        pathData.forEach(pathItem => {
            if (pathItem.type === 'initial_form') {
                const form = this.getFormById(pathItem.formId);
                if (form) {
                    const fields = this.getFormFields(form.id);
                    fields.forEach(field => {
                        inheritedFields.push({
                            ...field,
                            source: 'Initial Form',
                            sourceStage: pathItem.nodeId,
                            sourceType: 'initial_form',
                            inherited: true
                        });
                    });
                }
            } else if (pathItem.type === 'action_form') {
                const form = this.getFormById(pathItem.formId);
                if (form) {
                    const fields = this.getFormFields(form.id);
                    fields.forEach(field => {
                        inheritedFields.push({
                            ...field,
                            source: `Action: ${pathItem.actionName}`,
                            sourceStage: pathItem.fromNodeId,
                            sourceType: 'action_form',
                            actionId: pathItem.actionId,
                            inherited: true
                        });
                    });
                }
            }
        });

        return this.deduplicateFields(inheritedFields);
    }

    /**
     * Get new fields added at this specific stage
     */
    getNewFieldsAtStage(node) {
        const newFields = [];

        // For start stages, include initial form fields
        if (node.type === 'start' && node.formId) {
            const form = this.getFormById(node.formId);
            if (form) {
                const fields = this.getFormFields(form.id);
                fields.forEach(field => {
                    newFields.push({
                        ...field,
                        source: 'Initial Form',
                        sourceStage: node.id,
                        sourceType: 'initial_form',
                        inherited: false
                    });
                });
            }
        }

        // Include fields from actions originating at this stage
        const outgoingActions = this.getActionsFromNode(node.id);
        outgoingActions.forEach(action => {
            if (action.formId && !action.isEditAction) {
                const form = this.getFormById(action.formId);
                if (form) {
                    const fields = this.getFormFields(form.id);
                    fields.forEach(field => {
                        newFields.push({
                            ...field,
                            source: `Action: ${action.actionName}`,
                            sourceStage: node.id,
                            sourceType: 'action_form',
                            actionId: action.id,
                            inherited: false
                        });
                    });
                }
            }
        });

        return newFields;
    }

    /**
     * Trace path through workflow to target node
     */
    tracePath(targetNode, visited = new Set()) {
        const pathData = [];
        
        // If this is a start node, include its initial form
        if (targetNode.type === 'start' && targetNode.formId) {
            pathData.push({
                type: 'initial_form',
                nodeId: targetNode.id,
                formId: targetNode.formId
            });
            return pathData;
        }

        // Find incoming actions to this node
        const incomingActions = this.getActionsToNode(targetNode.id);
        
        incomingActions.forEach(action => {
            const fromNode = this.getNodeById(action.fromNodeId);
            if (fromNode && !visited.has(fromNode.id)) {
                visited.add(fromNode.id);
                
                // Get path to the source node
                const sourcePath = this.tracePath(fromNode, visited);
                pathData.push(...sourcePath);
                
                // Add this action's form if it has one
                if (action.formId && !action.isEditAction) {
                    pathData.push({
                        type: 'action_form',
                        fromNodeId: action.fromNodeId,
                        toNodeId: action.toNodeId,
                        actionId: action.id,
                        actionName: action.actionName,
                        formId: action.formId
                    });
                }
                
                visited.delete(fromNode.id);
            }
        });

        return pathData;
    }

    /**
     * Deduplicate fields based on field key
     */
    deduplicateFields(fields) {
        const fieldMap = new Map();
        const conflicts = [];

        fields.forEach(field => {
            const key = field.field_key;
            
            if (fieldMap.has(key)) {
                const existing = fieldMap.get(key);
                
                // Check for type conflicts
                if (existing.field_type !== field.field_type) {
                    conflicts.push({
                        fieldKey: key,
                        conflict: 'type_mismatch',
                        existing: existing,
                        new: field
                    });
                }
                
                // Keep the latest field (override)
                fieldMap.set(key, field);
            } else {
                fieldMap.set(key, field);
            }
        });

        // Report conflicts
        if (conflicts.length > 0) {
            this.triggerCallback('onFieldConflict', conflicts);
        }

        return Array.from(fieldMap.values());
    }

    /**
     * Map field sources for visualization
     */
    mapFieldSources(fields) {
        const sourceMap = {};
        
        fields.forEach(field => {
            const sourceType = field.sourceType || 'unknown';
            if (!sourceMap[sourceType]) {
                sourceMap[sourceType] = [];
            }
            sourceMap[sourceType].push({
                fieldKey: field.field_key,
                fieldLabel: field.field_label,
                fieldType: field.field_type,
                source: field.source
            });
        });

        return sourceMap;
    }

    /**
     * Detect field conflicts
     */
    detectFieldConflicts(fields) {
        const conflicts = [];
        const fieldGroups = {};

        // Group fields by key
        fields.forEach(field => {
            const key = field.field_key;
            if (!fieldGroups[key]) {
                fieldGroups[key] = [];
            }
            fieldGroups[key].push(field);
        });

        // Check for conflicts
        Object.entries(fieldGroups).forEach(([key, fieldGroup]) => {
            if (fieldGroup.length > 1) {
                const types = [...new Set(fieldGroup.map(f => f.field_type))];
                const labels = [...new Set(fieldGroup.map(f => f.field_label))];
                
                if (types.length > 1) {
                    conflicts.push({
                        type: 'type_conflict',
                        fieldKey: key,
                        conflictingTypes: types,
                        fields: fieldGroup
                    });
                }
                
                if (labels.length > 1) {
                    conflicts.push({
                        type: 'label_conflict',
                        fieldKey: key,
                        conflictingLabels: labels,
                        fields: fieldGroup
                    });
                }
            }
        });

        return conflicts;
    }

    /**
     * Calculate data quality metrics
     */
    calculateDataQuality(stageData) {
        const totalFields = stageData.totalFieldCount;
        const requiredFields = stageData.availableFields.filter(f => f.is_required).length;
        const conflicts = stageData.conflicts.length;

        // Completeness: ratio of available fields to expected fields
        const completeness = totalFields > 0 ? Math.min(1, totalFields / 10) : 0;

        // Consistency: inverse of conflict ratio
        const consistency = totalFields > 0 ? Math.max(0, 1 - (conflicts / totalFields)) : 1;

        // Accuracy: based on required fields and validation
        const accuracy = requiredFields > 0 ? Math.min(1, requiredFields / Math.max(1, totalFields * 0.3)) : 1;

        return {
            completeness: Math.round(completeness * 100) / 100,
            consistency: Math.round(consistency * 100) / 100,
            accuracy: Math.round(accuracy * 100) / 100,
            overall: Math.round(((completeness + consistency + accuracy) / 3) * 100) / 100
        };
    }

    // =====================================================
    // REAL-TIME UPDATES
    // =====================================================

    /**
     * Update data flow when nodes change
     */
    updateNodesData(nodes) {
        this.nodes = [...nodes];
        this.dataFlowCache.clear();
        return this.calculateDataFlow();
    }

    /**
     * Update data flow when actions change
     */
    updateActionsData(actions) {
        this.actions = [...actions];
        this.dataFlowCache.clear();
        return this.calculateDataFlow();
    }

    /**
     * Update data flow when forms change
     */
    updateFormsData(forms, formFields) {
        this.forms = [...forms];
        this.formFields = [...formFields];
        this.dataFlowCache.clear();
        return this.calculateDataFlow();
    }

    /**
     * Get real-time data flow for specific stage
     */
    getStageDataFlow(nodeId) {
        if (this.dataFlowCache.has(nodeId)) {
            return this.dataFlowCache.get(nodeId);
        }
        
        const node = this.getNodeById(nodeId);
        if (node) {
            const stageData = this.calculateStageDataFlow(node);
            this.dataFlowCache.set(nodeId, stageData);
            return stageData;
        }
        
        return null;
    }

    /**
     * Invalidate cache for specific node
     */
    invalidateStageCache(nodeId) {
        this.dataFlowCache.delete(nodeId);
        
        // Also invalidate dependent stages
        const dependentNodes = this.getDependentNodes(nodeId);
        dependentNodes.forEach(depNodeId => {
            this.dataFlowCache.delete(depNodeId);
        });
    }

    /**
     * Get nodes that depend on the given node
     */
    getDependentNodes(nodeId) {
        const dependentNodes = [];
        const visited = new Set();
        const queue = [nodeId];

        while (queue.length > 0) {
            const currentNodeId = queue.shift();
            if (visited.has(currentNodeId)) continue;
            visited.add(currentNodeId);

            // Find outgoing actions from current node
            const outgoingActions = this.getActionsFromNode(currentNodeId);
            outgoingActions.forEach(action => {
                if (!visited.has(action.toNodeId)) {
                    dependentNodes.push(action.toNodeId);
                    queue.push(action.toNodeId);
                }
            });
        }

        return dependentNodes;
    }

    // =====================================================
    // VISUALIZATION METHODS
    // =====================================================

    /**
     * Generate data flow visualization data
     */
    generateVisualizationData() {
        const dataFlow = this.calculateDataFlow();
        const visualization = {
            stages: [],
            flows: [],
            summary: this.getDataFlowSummary(dataFlow)
        };

        // Generate stage visualization data
        Object.values(dataFlow).forEach(stageData => {
            visualization.stages.push({
                nodeId: stageData.nodeId,
                stageName: stageData.stageName,
                stageType: stageData.stageType,
                fieldCount: stageData.totalFieldCount,
                inheritedCount: stageData.inheritedFields.length,
                newCount: stageData.newFields.length,
                qualityScore: stageData.dataQuality.overall,
                conflicts: stageData.conflicts.length
            });
        });

        // Generate flow visualization data
        this.actions.forEach(action => {
            const fromStage = dataFlow[action.fromNodeId];
            const toStage = dataFlow[action.toNodeId];
            
            if (fromStage && toStage && action.formId) {
                const form = this.getFormById(action.formId);
                const fieldCount = form ? this.getFormFields(form.id).length : 0;
                
                visualization.flows.push({
                    from: action.fromNodeId,
                    to: action.toNodeId,
                    actionName: action.actionName,
                    fieldCount: fieldCount,
                    isEditAction: action.isEditAction || false
                });
            }
        });

        return visualization;
    }

    /**
     * Get data flow summary
     */
    getDataFlowSummary(dataFlow) {
        const stages = Object.values(dataFlow);
        
        const summary = {
            totalStages: stages.length,
            totalFields: 0,
            totalConflicts: 0,
            averageQuality: 0,
            fieldDistribution: {},
            sourceDistribution: {}
        };

        stages.forEach(stage => {
            summary.totalFields += stage.totalFieldCount;
            summary.totalConflicts += stage.conflicts.length;
            summary.averageQuality += stage.dataQuality.overall;

            // Field distribution by stage type
            if (!summary.fieldDistribution[stage.stageType]) {
                summary.fieldDistribution[stage.stageType] = 0;
            }
            summary.fieldDistribution[stage.stageType] += stage.totalFieldCount;

            // Source distribution
            Object.entries(stage.fieldSources).forEach(([sourceType, fields]) => {
                if (!summary.sourceDistribution[sourceType]) {
                    summary.sourceDistribution[sourceType] = 0;
                }
                summary.sourceDistribution[sourceType] += fields.length;
            });
        });

        summary.averageQuality = stages.length > 0 ? 
            Math.round((summary.averageQuality / stages.length) * 100) / 100 : 0;

        return summary;
    }

    /**
     * Render data flow table
     */
    renderDataFlowTable() {
        const dataFlow = this.calculateDataFlow();
        const orderedStages = Object.values(dataFlow).sort((a, b) => a.stageOrder - b.stageOrder);

        let html = `
            <div class="data-flow-table">
                <h4>Workflow Data Flow</h4>
                <table class="data-flow-grid">
                    <thead>
                        <tr>
                            <th>Stage</th>
                            <th>Inherited</th>
                            <th>New</th>
                            <th>Total</th>
                            <th>Quality</th>
                            <th>Conflicts</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        orderedStages.forEach(stage => {
            const qualityColor = stage.dataQuality.overall >= 0.8 ? 'green' : 
                                stage.dataQuality.overall >= 0.6 ? 'orange' : 'red';
            
            html += `
                <tr>
                    <td>
                        <strong>${stage.stageName}</strong><br>
                        <small>${stage.stageKey}</small>
                    </td>
                    <td class="inherited-count">${stage.inheritedFields.length}</td>
                    <td class="new-count">${stage.newFields.length}</td>
                    <td class="total-count">${stage.totalFieldCount}</td>
                    <td style="color: ${qualityColor}">
                        ${Math.round(stage.dataQuality.overall * 100)}%
                    </td>
                    <td class="conflicts-count ${stage.conflicts.length > 0 ? 'has-conflicts' : ''}">
                        ${stage.conflicts.length}
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        return html;
    }

    /**
     * Render detailed field list for stage
     */
    renderStageFieldDetails(nodeId) {
        const stageData = this.getStageDataFlow(nodeId);
        if (!stageData) return '';

        let html = `
            <div class="stage-field-details">
                <h5>${stageData.stageName} - Field Details</h5>
        `;

        if (stageData.inheritedFields.length > 0) {
            html += `
                <div class="field-group inherited-fields">
                    <h6>Inherited Fields (${stageData.inheritedFields.length})</h6>
                    <ul>
            `;
            stageData.inheritedFields.forEach(field => {
                html += `
                    <li class="inherited-field">
                        <strong>${field.field_label}</strong> (${field.field_type})
                        <small> - from ${field.source}</small>
                    </li>
                `;
            });
            html += `</ul></div>`;
        }

        if (stageData.newFields.length > 0) {
            html += `
                <div class="field-group new-fields">
                    <h6>New Fields (${stageData.newFields.length})</h6>
                    <ul>
            `;
            stageData.newFields.forEach(field => {
                html += `
                    <li class="new-field">
                        <strong>${field.field_label}</strong> (${field.field_type})
                        <small> - from ${field.source}</small>
                    </li>
                `;
            });
            html += `</ul></div>`;
        }

        if (stageData.conflicts.length > 0) {
            html += `
                <div class="field-group conflicts">
                    <h6>Conflicts (${stageData.conflicts.length})</h6>
                    <ul>
            `;
            stageData.conflicts.forEach(conflict => {
                html += `
                    <li class="conflict-item">
                        <strong>${conflict.fieldKey}</strong> - ${conflict.type}
                    </li>
                `;
            });
            html += `</ul></div>`;
        }

        html += '</div>';
        return html;
    }

    // =====================================================
    // HELPER METHODS
    // =====================================================

    /**
     * Get ordered nodes by stage order
     */
    getOrderedNodes() {
        return [...this.nodes].sort((a, b) => (a.stageOrder || 0) - (b.stageOrder || 0));
    }

    /**
     * Get node by ID
     */
    getNodeById(nodeId) {
        return this.nodes.find(n => n.id === nodeId);
    }

    /**
     * Get actions from a node
     */
    getActionsFromNode(nodeId) {
        return this.actions.filter(a => a.fromNodeId === nodeId);
    }

    /**
     * Get actions to a node
     */
    getActionsToNode(nodeId) {
        return this.actions.filter(a => a.toNodeId === nodeId);
    }

    /**
     * Get form by ID
     */
    getFormById(formId) {
        return this.forms.find(f => f.id === formId);
    }

    /**
     * Get form fields by form ID
     */
    getFormFields(formId) {
        return this.formFields.filter(f => f.form_id === formId)
            .sort((a, b) => (a.field_order || 0) - (b.field_order || 0));
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
     * Clear all data
     */
    clearData() {
        this.nodes = [];
        this.actions = [];
        this.forms = [];
        this.formFields = [];
        this.dataFlowCache.clear();
    }
}

export default DataFlow;