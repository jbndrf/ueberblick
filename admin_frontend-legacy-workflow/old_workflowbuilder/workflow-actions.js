/**
 * Workflow Actions Module
 * Handles action/transition configuration, edit actions, and business logic
 */

export class WorkflowActions {
    constructor(projectId) {
        this.projectId = projectId;
        this.actions = [];
        this.actionTypes = {
            forward: {
                label: 'Forward Action',
                icon: '→',
                description: 'Move to next stage and collect new data',
                allowSameStage: false,
                hasDataCollection: true,
                hasEditableFields: false
            },
            edit: {
                label: 'Edit Action',
                icon: '✏️',
                description: 'Edit existing data in current stage',
                allowSameStage: true,
                hasDataCollection: false,
                hasEditableFields: true
            }
        };
        this.callbacks = {
            onActionValidation: null,
            onActionUpdate: null,
            onActionCreate: null,
            onActionDelete: null
        };
    }

    // =====================================================
    // ACTION MANAGEMENT
    // =====================================================

    /**
     * Create a new action
     */
    createAction(fromNodeId, toNodeId, actionType = 'forward') {
        const typeConfig = this.actionTypes[actionType];
        if (!typeConfig) {
            throw new Error(`Invalid action type: ${actionType}`);
        }

        // Validate stage relationship
        if (!typeConfig.allowSameStage && fromNodeId === toNodeId) {
            throw new Error(`${typeConfig.label} cannot target the same stage`);
        }

        const action = {
            id: this.generateActionId(),
            fromNodeId: fromNodeId,
            toNodeId: toNodeId,
            actionType: actionType,
            actionName: this.generateDefaultActionName(actionType, fromNodeId, toNodeId),
            buttonLabel: this.generateDefaultButtonLabel(actionType),
            buttonColor: this.getDefaultButtonColor(actionType),
            allowedRoles: this.getDefaultRoles(),
            conditions: [],
            requiresConfirmation: false,
            confirmationMessage: '',
            formId: null,
            editableFields: actionType === 'edit' ? [] : undefined,
            metadata: {
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            validation: {
                isValid: false,
                errors: []
            }
        };

        this.actions.push(action);
        this.validateAction(action);
        this.triggerCallback('onActionCreate', action);
        
        return action;
    }

    /**
     * Update action properties
     */
    updateAction(actionId, updates) {
        const action = this.actions.find(a => a.id === actionId);
        if (!action) {
            throw new Error(`Action ${actionId} not found`);
        }

        // Validate updates before applying
        const validationResult = this.validateActionUpdates(action, updates);
        if (!validationResult.isValid) {
            throw new Error(`Validation failed: ${validationResult.errors.join(', ')}`);
        }

        // Apply updates
        Object.assign(action, updates);
        action.metadata.updatedAt = new Date().toISOString();

        // Re-validate action
        this.validateAction(action);
        this.triggerCallback('onActionUpdate', action);
        
        return action;
    }

    /**
     * Remove an action
     */
    removeAction(actionId) {
        const actionIndex = this.actions.findIndex(a => a.id === actionId);
        if (actionIndex === -1) return false;

        const action = this.actions[actionIndex];
        this.actions.splice(actionIndex, 1);
        this.triggerCallback('onActionDelete', action);
        
        return action;
    }

    /**
     * Get action by ID
     */
    getAction(actionId) {
        return this.actions.find(a => a.id === actionId);
    }

    /**
     * Get all actions
     */
    getAllActions() {
        return [...this.actions];
    }

    /**
     * Get actions by type
     */
    getActionsByType(actionType) {
        return this.actions.filter(a => a.actionType === actionType);
    }

    /**
     * Get actions from a specific node
     */
    getActionsFromNode(nodeId) {
        return this.actions.filter(a => a.fromNodeId === nodeId);
    }

    /**
     * Get actions to a specific node
     */
    getActionsToNode(nodeId) {
        return this.actions.filter(a => a.toNodeId === nodeId);
    }

    // =====================================================
    // EDIT ACTIONS MANAGEMENT
    // =====================================================

    /**
     * Add editable field to edit action
     */
    addEditableField(actionId, fieldConfig) {
        const action = this.getAction(actionId);
        if (!action) {
            throw new Error(`Action ${actionId} not found`);
        }

        if (action.actionType !== 'edit') {
            throw new Error('Only edit actions can have editable fields');
        }

        if (!action.editableFields) {
            action.editableFields = [];
        }

        const editableField = {
            fieldId: fieldConfig.fieldId || this.generateFieldId(),
            fieldKey: fieldConfig.fieldKey,
            fieldLabel: fieldConfig.fieldLabel,
            fieldSource: fieldConfig.fieldSource,
            permissions: fieldConfig.permissions || ['view', 'edit'],
            conditions: fieldConfig.conditions || []
        };

        // Check for duplicates
        const exists = action.editableFields.some(f => f.fieldKey === editableField.fieldKey);
        if (exists) {
            throw new Error(`Field ${editableField.fieldKey} is already editable`);
        }

        action.editableFields.push(editableField);
        action.metadata.updatedAt = new Date().toISOString();
        
        this.validateAction(action);
        this.triggerCallback('onActionUpdate', action);
        
        return editableField;
    }

    /**
     * Remove editable field from edit action
     */
    removeEditableField(actionId, fieldKey) {
        const action = this.getAction(actionId);
        if (!action || action.actionType !== 'edit') return false;

        if (!action.editableFields) return false;

        const fieldIndex = action.editableFields.findIndex(f => f.fieldKey === fieldKey);
        if (fieldIndex === -1) return false;

        action.editableFields.splice(fieldIndex, 1);
        action.metadata.updatedAt = new Date().toISOString();
        
        this.validateAction(action);
        this.triggerCallback('onActionUpdate', action);
        
        return true;
    }

    /**
     * Set editable fields for edit action
     */
    setEditableFields(actionId, editableFields) {
        const action = this.getAction(actionId);
        if (!action) {
            throw new Error(`Action ${actionId} not found`);
        }

        if (action.actionType !== 'edit') {
            throw new Error('Only edit actions can have editable fields');
        }

        action.editableFields = [...editableFields];
        action.metadata.updatedAt = new Date().toISOString();
        
        this.validateAction(action);
        this.triggerCallback('onActionUpdate', action);
        
        return action;
    }

    // =====================================================
    // CONDITIONS AND VALIDATION
    // =====================================================

    /**
     * Add condition to action
     */
    addCondition(actionId, condition) {
        const action = this.getAction(actionId);
        if (!action) return false;

        if (!action.conditions) {
            action.conditions = [];
        }

        const conditionObj = {
            id: this.generateConditionId(),
            type: condition.type || 'field_value',
            field: condition.field,
            operator: condition.operator || 'equals',
            value: condition.value,
            message: condition.message || 'Condition not met'
        };

        action.conditions.push(conditionObj);
        action.metadata.updatedAt = new Date().toISOString();
        
        this.validateAction(action);
        this.triggerCallback('onActionUpdate', action);
        
        return conditionObj;
    }

    /**
     * Remove condition from action
     */
    removeCondition(actionId, conditionId) {
        const action = this.getAction(actionId);
        if (!action || !action.conditions) return false;

        const conditionIndex = action.conditions.findIndex(c => c.id === conditionId);
        if (conditionIndex === -1) return false;

        action.conditions.splice(conditionIndex, 1);
        action.metadata.updatedAt = new Date().toISOString();
        
        this.validateAction(action);
        this.triggerCallback('onActionUpdate', action);
        
        return true;
    }

    /**
     * Validate conditions for action execution
     */
    validateConditions(actionId, instanceData = {}) {
        const action = this.getAction(actionId);
        if (!action || !action.conditions || action.conditions.length === 0) {
            return { isValid: true, errors: [] };
        }

        const errors = [];

        action.conditions.forEach(condition => {
            const result = this.evaluateCondition(condition, instanceData);
            if (!result.isValid) {
                errors.push(result.message || condition.message);
            }
        });

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Evaluate a single condition
     */
    evaluateCondition(condition, instanceData) {
        const fieldValue = instanceData[condition.field];
        
        switch (condition.operator) {
            case 'equals':
                return {
                    isValid: fieldValue === condition.value,
                    message: `Field ${condition.field} must equal ${condition.value}`
                };
            case 'not_equals':
                return {
                    isValid: fieldValue !== condition.value,
                    message: `Field ${condition.field} must not equal ${condition.value}`
                };
            case 'contains':
                return {
                    isValid: String(fieldValue || '').includes(condition.value),
                    message: `Field ${condition.field} must contain ${condition.value}`
                };
            case 'not_empty':
                return {
                    isValid: fieldValue != null && String(fieldValue).trim() !== '',
                    message: `Field ${condition.field} must not be empty`
                };
            case 'greater_than':
                return {
                    isValid: Number(fieldValue) > Number(condition.value),
                    message: `Field ${condition.field} must be greater than ${condition.value}`
                };
            case 'less_than':
                return {
                    isValid: Number(fieldValue) < Number(condition.value),
                    message: `Field ${condition.field} must be less than ${condition.value}`
                };
            default:
                return {
                    isValid: true,
                    message: 'Unknown condition operator'
                };
        }
    }

    // =====================================================
    // VALIDATION
    // =====================================================

    /**
     * Validate a single action
     */
    validateAction(action) {
        const errors = [];
        const typeConfig = this.actionTypes[action.actionType];

        // Basic property validation
        if (!action.actionName?.trim()) {
            errors.push('Action name is required');
        }

        if (!action.buttonLabel?.trim()) {
            errors.push('Button label is required');
        }

        if (!action.buttonColor?.trim()) {
            errors.push('Button color is required');
        }

        if (!action.allowedRoles || action.allowedRoles.length === 0) {
            errors.push('At least one role must be assigned');
        }

        // Type-specific validation
        if (action.actionType === 'edit') {
            if (!action.editableFields || action.editableFields.length === 0) {
                errors.push('Edit actions must have at least one editable field');
            }
        }

        // Confirmation validation
        if (action.requiresConfirmation && !action.confirmationMessage?.trim()) {
            errors.push('Confirmation message is required when confirmation is enabled');
        }

        // Condition validation
        if (action.conditions && action.conditions.length > 0) {
            action.conditions.forEach((condition, index) => {
                if (!condition.field?.trim()) {
                    errors.push(`Condition ${index + 1}: Field is required`);
                }
                if (!condition.operator?.trim()) {
                    errors.push(`Condition ${index + 1}: Operator is required`);
                }
            });
        }

        // Update action validation state
        action.validation = {
            isValid: errors.length === 0,
            errors: errors
        };

        this.triggerCallback('onActionValidation', action);
        
        return action.validation;
    }

    /**
     * Validate action updates before applying
     */
    validateActionUpdates(action, updates) {
        const errors = [];

        // Check action name
        if (updates.actionName !== undefined && !updates.actionName?.trim()) {
            errors.push('Action name is required');
        }

        // Check button label
        if (updates.buttonLabel !== undefined && !updates.buttonLabel?.trim()) {
            errors.push('Button label is required');
        }

        // Check roles
        if (updates.allowedRoles !== undefined && (!updates.allowedRoles || updates.allowedRoles.length === 0)) {
            errors.push('At least one role must be assigned');
        }

        // Check confirmation
        if (updates.requiresConfirmation && updates.confirmationMessage !== undefined && !updates.confirmationMessage?.trim()) {
            errors.push('Confirmation message is required when confirmation is enabled');
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Validate all actions
     */
    validateAllActions() {
        const allErrors = [];
        const actionValidations = [];

        this.actions.forEach((action, index) => {
            const validation = this.validateAction(action);
            actionValidations.push({
                actionId: action.id,
                validation: validation
            });

            if (!validation.isValid) {
                validation.errors.forEach(error => {
                    allErrors.push(`Action ${index + 1} (${action.actionName}): ${error}`);
                });
            }
        });

        return {
            isValid: allErrors.length === 0,
            errors: allErrors,
            actionValidations: actionValidations
        };
    }

    // =====================================================
    // FORM INTEGRATION
    // =====================================================

    /**
     * Associate a form with an action
     */
    setActionForm(actionId, formId) {
        const action = this.getAction(actionId);
        if (!action) {
            throw new Error(`Action ${actionId} not found`);
        }

        if (action.actionType === 'edit') {
            throw new Error('Edit actions cannot have data collection forms');
        }

        action.formId = formId;
        action.metadata.updatedAt = new Date().toISOString();
        
        this.validateAction(action);
        this.triggerCallback('onActionUpdate', action);
        
        return action;
    }

    /**
     * Remove form from action
     */
    removeActionForm(actionId) {
        const action = this.getAction(actionId);
        if (!action) return false;

        action.formId = null;
        action.metadata.updatedAt = new Date().toISOString();
        
        this.validateAction(action);
        this.triggerCallback('onActionUpdate', action);
        
        return true;
    }

    // =====================================================
    // DATA IMPORT/EXPORT
    // =====================================================

    /**
     * Set actions data (for loading from storage)
     */
    setActions(actions) {
        this.actions = actions.map(action => ({
            ...action,
            validation: {
                isValid: false,
                errors: []
            }
        }));
        
        // Validate all actions
        this.actions.forEach(action => this.validateAction(action));
    }

    /**
     * Get actions data for export/storage
     */
    getActionsData() {
        return this.actions.map(action => ({
            ...action,
            // Remove validation data for storage
            validation: undefined
        })).filter(action => {
            delete action.validation;
            return true;
        });
    }

    /**
     * Clear all actions
     */
    clearActions() {
        this.actions = [];
    }

    // =====================================================
    // UTILITY METHODS
    // =====================================================

    /**
     * Generate unique action ID
     */
    generateActionId() {
        return 'action_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Generate unique field ID
     */
    generateFieldId() {
        return 'field_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Generate unique condition ID
     */
    generateConditionId() {
        return 'condition_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Generate default action name
     */
    generateDefaultActionName(actionType, fromNodeId, toNodeId) {
        if (actionType === 'edit') {
            return `Edit Stage ${fromNodeId}`;
        }
        return `Action from ${fromNodeId} to ${toNodeId}`;
    }

    /**
     * Generate default button label
     */
    generateDefaultButtonLabel(actionType) {
        const labels = {
            forward: 'Next',
            edit: 'Edit'
        };
        return labels[actionType] || 'Continue';
    }

    /**
     * Get default button color
     */
    getDefaultButtonColor(actionType) {
        const colors = {
            forward: '#007bff',
            edit: '#ff9800'
        };
        return colors[actionType] || '#007bff';
    }

    /**
     * Get default roles for new actions
     */
    getDefaultRoles() {
        return ['technician', 'supervisor'];
    }

    /**
     * Get action statistics
     */
    getActionStatistics() {
        const stats = {
            total: this.actions.length,
            byType: {},
            validActions: 0,
            invalidActions: 0,
            withForms: 0,
            withConditions: 0,
            requireConfirmation: 0
        };

        Object.keys(this.actionTypes).forEach(type => {
            stats.byType[type] = this.getActionsByType(type).length;
        });

        this.actions.forEach(action => {
            if (action.validation?.isValid) {
                stats.validActions++;
            } else {
                stats.invalidActions++;
            }

            if (action.formId) {
                stats.withForms++;
            }

            if (action.conditions && action.conditions.length > 0) {
                stats.withConditions++;
            }

            if (action.requiresConfirmation) {
                stats.requireConfirmation++;
            }
        });

        return stats;
    }

    /**
     * Get available condition operators
     */
    getConditionOperators() {
        return [
            { value: 'equals', label: 'Equals' },
            { value: 'not_equals', label: 'Not Equals' },
            { value: 'contains', label: 'Contains' },
            { value: 'not_empty', label: 'Not Empty' },
            { value: 'greater_than', label: 'Greater Than' },
            { value: 'less_than', label: 'Less Than' }
        ];
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
     * Get action type configuration
     */
    getActionTypeConfig(actionType) {
        return this.actionTypes[actionType];
    }

    /**
     * Get all action type configurations
     */
    getAllActionTypes() {
        return { ...this.actionTypes };
    }
}

export default WorkflowActions;