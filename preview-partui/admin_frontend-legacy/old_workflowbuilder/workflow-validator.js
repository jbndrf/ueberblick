/**
 * Workflow Validator
 * Comprehensive validation logic for workflow integrity
 * Provides real-time validation feedback and business rule enforcement
 */

export class WorkflowValidator {
    constructor() {
        // Validation rules registry
        this.validationRules = new Map();
        this.businessRules = new Map();
        
        // Error tracking
        this.validationErrors = new Map();
        this.warnings = new Map();
        
        // Validation settings
        this.settings = {
            strictMode: false,
            realTimeValidation: true,
            validateOnSave: true,
            maxStageKeyLength: 50,
            maxStageNameLength: 100,
            maxActionNameLength: 100,
            maxWorkflowNameLength: 200
        };
        
        this.initialize();
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    /**
     * Initialize validator with default rules
     */
    initialize() {
        this.registerDefaultValidationRules();
        this.registerDefaultBusinessRules();
    }

    /**
     * Register default validation rules
     */
    registerDefaultValidationRules() {
        // Stage validation rules
        this.registerValidationRule('stage.title.required', {
            validate: (stage) => stage.title && stage.title.trim().length > 0,
            message: 'Stage title is required',
            severity: 'error'
        });
        
        this.registerValidationRule('stage.title.length', {
            validate: (stage) => !stage.title || stage.title.length <= this.settings.maxStageNameLength,
            message: `Stage title must be ${this.settings.maxStageNameLength} characters or less`,
            severity: 'error'
        });
        
        this.registerValidationRule('stage.key.required', {
            validate: (stage) => stage.key && stage.key.trim().length > 0,
            message: 'Stage key is required',
            severity: 'error'
        });
        
        this.registerValidationRule('stage.key.format', {
            validate: (stage) => !stage.key || /^[a-zA-Z][a-zA-Z0-9_]*$/.test(stage.key),
            message: 'Stage key must start with a letter and contain only letters, numbers, and underscores',
            severity: 'error'
        });
        
        this.registerValidationRule('stage.key.length', {
            validate: (stage) => !stage.key || stage.key.length <= this.settings.maxStageKeyLength,
            message: `Stage key must be ${this.settings.maxStageKeyLength} characters or less`,
            severity: 'error'
        });
        
        this.registerValidationRule('stage.type.valid', {
            validate: (stage) => stage.type && ['start', 'intermediate', 'end'].includes(stage.type),
            message: 'Stage type must be start, intermediate, or end',
            severity: 'error'
        });
        
        this.registerValidationRule('stage.maxHours.valid', {
            validate: (stage) => !stage.maxHours || (stage.maxHours >= 1 && stage.maxHours <= 8760),
            message: 'Max hours must be between 1 and 8760 (1 year)',
            severity: 'error'
        });
        
        // Action validation rules
        this.registerValidationRule('action.name.required', {
            validate: (action) => action.name && action.name.trim().length > 0,
            message: 'Action name is required',
            severity: 'error'
        });
        
        this.registerValidationRule('action.name.length', {
            validate: (action) => !action.name || action.name.length <= this.settings.maxActionNameLength,
            message: `Action name must be ${this.settings.maxActionNameLength} characters or less`,
            severity: 'error'
        });
        
        this.registerValidationRule('action.buttonLabel.required', {
            validate: (action) => action.buttonLabel && action.buttonLabel.trim().length > 0,
            message: 'Button label is required',
            severity: 'error'
        });
        
        this.registerValidationRule('action.stages.required', {
            validate: (action) => action.fromStageId && action.toStageId,
            message: 'Action must have source and target stages',
            severity: 'error'
        });
        
        this.registerValidationRule('action.stages.different', {
            validate: (action) => action.isEditAction || action.fromStageId !== action.toStageId,
            message: 'Action cannot connect a stage to itself unless it is an edit action',
            severity: 'error'
        });
        
        this.registerValidationRule('action.confirmation.message', {
            validate: (action) => !action.requiresConfirmation || (action.confirmationMessage && action.confirmationMessage.trim().length > 0),
            message: 'Confirmation message is required when confirmation is enabled',
            severity: 'error'
        });
        
        // Workflow validation rules
        this.registerValidationRule('workflow.name.required', {
            validate: (workflow) => workflow.workflowName && workflow.workflowName.trim().length > 0,
            message: 'Workflow name is required',
            severity: 'error'
        });
        
        this.registerValidationRule('workflow.name.length', {
            validate: (workflow) => !workflow.workflowName || workflow.workflowName.length <= this.settings.maxWorkflowNameLength,
            message: `Workflow name must be ${this.settings.maxWorkflowNameLength} characters or less`,
            severity: 'error'
        });
        
        this.registerValidationRule('workflow.type.valid', {
            validate: (workflow) => workflow.workflowType && ['incident', 'survey'].includes(workflow.workflowType),
            message: 'Workflow type must be incident or survey',
            severity: 'error'
        });
    }

    /**
     * Register default business rules
     */
    registerDefaultBusinessRules() {
        // Single start stage rule
        this.registerBusinessRule('workflow.single.start', {
            validate: (stages) => {
                const startStages = stages.filter(stage => stage.type === 'start');
                return startStages.length === 1;
            },
            message: 'Workflow must have exactly one start stage',
            severity: 'error',
            category: 'structure'
        });
        
        // At least one end stage rule
        this.registerBusinessRule('workflow.end.required', {
            validate: (stages) => {
                const endStages = stages.filter(stage => stage.type === 'end');
                return endStages.length >= 1;
            },
            message: 'Workflow must have at least one end stage',
            severity: 'error',
            category: 'structure'
        });
        
        // Unique stage keys rule
        this.registerBusinessRule('workflow.unique.keys', {
            validate: (stages) => {
                const keys = stages.map(stage => stage.key).filter(key => key);
                return keys.length === new Set(keys).size;
            },
            message: 'All stage keys must be unique',
            severity: 'error',
            category: 'uniqueness'
        });
        
        // Connected stages rule
        this.registerBusinessRule('workflow.connected.stages', {
            validate: (stages, actions) => {
                if (stages.length <= 1) return true;
                
                const stageIds = new Set(stages.map(stage => stage.id));
                const connectedStages = new Set();
                
                // Add start stages as connected
                stages.filter(stage => stage.type === 'start').forEach(stage => {
                    connectedStages.add(stage.id);
                });
                
                // Add stages connected by actions
                actions.forEach(action => {
                    if (connectedStages.has(action.fromStageId)) {
                        connectedStages.add(action.toStageId);
                    }
                });
                
                // Check if all stages are reachable from start
                return stageIds.size === connectedStages.size;
            },
            message: 'All stages must be reachable from the start stage',
            severity: 'error',
            category: 'connectivity'
        });
        
        // No orphaned stages rule
        this.registerBusinessRule('workflow.no.orphans', {
            validate: (stages, actions) => {
                const connectedStages = new Set();
                
                // Start stages are never orphaned
                stages.filter(stage => stage.type === 'start').forEach(stage => {
                    connectedStages.add(stage.id);
                });
                
                // Add stages with connections
                actions.forEach(action => {
                    connectedStages.add(action.fromStageId);
                    connectedStages.add(action.toStageId);
                });
                
                // Check for orphaned stages
                const orphanedStages = stages.filter(stage => !connectedStages.has(stage.id));
                return orphanedStages.length === 0;
            },
            message: 'No stages should be orphaned (disconnected from the workflow)',
            severity: 'warning',
            category: 'connectivity'
        });
        
        // No circular references rule
        this.registerBusinessRule('workflow.no.cycles', {
            validate: (stages, actions) => {
                return !this.hasCycles(stages, actions);
            },
            message: 'Workflow cannot have circular references',
            severity: 'error',
            category: 'structure'
        });
        
        // Reasonable stage count rule
        this.registerBusinessRule('workflow.reasonable.stages', {
            validate: (stages) => stages.length <= 50,
            message: 'Workflow has too many stages (>50). Consider breaking it into smaller workflows.',
            severity: 'warning',
            category: 'performance'
        });
        
        // Reasonable action count rule
        this.registerBusinessRule('workflow.reasonable.actions', {
            validate: (stages, actions) => actions.length <= 100,
            message: 'Workflow has too many actions (>100). Consider simplifying the workflow.',
            severity: 'warning',
            category: 'performance'
        });
    }

    // =====================================================
    // VALIDATION RULE MANAGEMENT
    // =====================================================

    /**
     * Register a validation rule
     */
    registerValidationRule(ruleId, rule) {
        this.validationRules.set(ruleId, {
            id: ruleId,
            validate: rule.validate,
            message: rule.message,
            severity: rule.severity || 'error',
            enabled: rule.enabled !== false
        });
    }

    /**
     * Register a business rule
     */
    registerBusinessRule(ruleId, rule) {
        this.businessRules.set(ruleId, {
            id: ruleId,
            validate: rule.validate,
            message: rule.message,
            severity: rule.severity || 'error',
            category: rule.category || 'general',
            enabled: rule.enabled !== false
        });
    }

    /**
     * Enable/disable a rule
     */
    setRuleEnabled(ruleId, enabled) {
        if (this.validationRules.has(ruleId)) {
            this.validationRules.get(ruleId).enabled = enabled;
        }
        if (this.businessRules.has(ruleId)) {
            this.businessRules.get(ruleId).enabled = enabled;
        }
    }

    // =====================================================
    // WORKFLOW VALIDATION
    // =====================================================

    /**
     * Validate complete workflow
     * @param {Object} workflowData - The workflow data to validate
     * @param {String} mode - Validation mode: 'strict' or 'lenient' (default: 'strict')
     */
    validateComplete(workflowData, mode = 'strict') {
        const errors = [];
        const warnings = [];
        
        const { workflow, stages, actions } = workflowData;
        
        // Validate workflow metadata
        const workflowValidation = this.validateWorkflowMetadata(workflow);
        errors.push(...workflowValidation.errors);
        warnings.push(...workflowValidation.warnings);
        
        // Validate individual stages
        stages.forEach(stage => {
            const stageValidation = this.validateStage(stage);
            errors.push(...stageValidation.errors);
            warnings.push(...stageValidation.warnings);
        });
        
        // Validate individual actions
        actions.forEach(action => {
            const actionValidation = this.validateAction(action);
            errors.push(...actionValidation.errors);
            warnings.push(...actionValidation.warnings);
        });
        
        // Validate workflow structure and business rules
        const structureValidation = this.validateStructure(stages, actions, mode);
        errors.push(...structureValidation.errors);
        warnings.push(...structureValidation.warnings);
        
        // Check connectivity
        const connectivityValidation = this.validateConnectivity(stages, actions, mode);
        errors.push(...connectivityValidation.errors);
        warnings.push(...connectivityValidation.warnings);
        
        return {
            isValid: errors.length === 0,
            hasWarnings: warnings.length > 0,
            errors,
            warnings,
            summary: this.generateValidationSummary(errors, warnings),
            mode
        };
    }

    /**
     * Validate workflow metadata
     */
    validateWorkflowMetadata(workflow) {
        const errors = [];
        const warnings = [];
        
        for (const [ruleId, rule] of this.validationRules) {
            if (!rule.enabled || !ruleId.startsWith('workflow.')) continue;
            
            try {
                if (!rule.validate(workflow)) {
                    const error = {
                        ruleId,
                        message: rule.message,
                        severity: rule.severity,
                        context: 'workflow'
                    };
                    
                    if (rule.severity === 'error') {
                        errors.push(error);
                    } else {
                        warnings.push(error);
                    }
                }
            } catch (err) {
                console.error(`Validation rule ${ruleId} failed:`, err);
            }
        }
        
        return { errors, warnings };
    }

    /**
     * Validate workflow structure and business rules
     * @param {Array} stages - The workflow stages
     * @param {Array} actions - The workflow actions
     * @param {String} mode - Validation mode: 'strict' or 'lenient'
     */
    validateStructure(stages, actions, mode = 'strict') {
        const errors = [];
        const warnings = [];
        
        // Define rules that should be lenient (warnings) in draft mode
        const lenientRules = new Set(['workflow.end.required', 'workflow.no.orphans']);
        
        for (const [ruleId, rule] of this.businessRules) {
            if (!rule.enabled) continue;
            
            try {
                if (!rule.validate(stages, actions)) {
                    // In lenient mode, convert certain errors to warnings
                    let severity = rule.severity;
                    if (mode === 'lenient' && lenientRules.has(ruleId) && severity === 'error') {
                        severity = 'warning';
                    }
                    
                    const error = {
                        ruleId,
                        message: rule.message,
                        severity,
                        category: rule.category,
                        context: 'structure',
                        originalSeverity: rule.severity
                    };
                    
                    if (severity === 'error') {
                        errors.push(error);
                    } else {
                        warnings.push(error);
                    }
                }
            } catch (err) {
                console.error(`Business rule ${ruleId} failed:`, err);
            }
        }
        
        return { errors, warnings };
    }

    /**
     * Validate connectivity of workflow
     */
    validateConnectivity(stages, actions, mode = 'strict') {
        const errors = [];
        const warnings = [];
        
        // Check for unreachable stages
        const reachableStages = this.findReachableStages(stages, actions);
        const unreachableStages = stages.filter(stage => !reachableStages.has(stage.id));
        
        unreachableStages.forEach(stage => {
            if (stage.type !== 'start') {
                warnings.push({
                    ruleId: 'connectivity.unreachable',
                    message: `Stage "${stage.title}" is not reachable from the start stage`,
                    severity: 'warning',
                    context: 'connectivity',
                    stageId: stage.id
                });
            }
        });
        
        // Check for stages with no outgoing actions (except end stages)
        const stagesWithOutgoing = new Set(actions.map(action => action.fromStageId));
        const deadEndStages = stages.filter(stage => 
            stage.type !== 'end' && !stagesWithOutgoing.has(stage.id)
        );
        
        deadEndStages.forEach(stage => {
            warnings.push({
                ruleId: 'connectivity.dead_end',
                message: `Stage "${stage.title}" has no outgoing actions`,
                severity: 'warning',
                context: 'connectivity',
                stageId: stage.id
            });
        });
        
        return { errors, warnings };
    }

    // =====================================================
    // STAGE VALIDATION
    // =====================================================

    /**
     * Validate single stage
     */
    validateStage(stageData) {
        const errors = [];
        const warnings = [];
        
        for (const [ruleId, rule] of this.validationRules) {
            if (!rule.enabled || !ruleId.startsWith('stage.')) continue;
            
            try {
                if (!rule.validate(stageData)) {
                    const error = {
                        ruleId,
                        message: rule.message,
                        severity: rule.severity,
                        context: 'stage',
                        stageId: stageData.id
                    };
                    
                    if (rule.severity === 'error') {
                        errors.push(error);
                    } else {
                        warnings.push(error);
                    }
                }
            } catch (err) {
                console.error(`Stage validation rule ${ruleId} failed:`, err);
            }
        }
        
        // Validate form fields if present
        if (stageData.formFields && Array.isArray(stageData.formFields)) {
            const formValidation = this.validateFormFields(stageData.formFields);
            errors.push(...formValidation.errors.map(error => ({
                ...error,
                context: 'stage.form',
                stageId: stageData.id
            })));
            warnings.push(...formValidation.warnings.map(warning => ({
                ...warning,
                context: 'stage.form',
                stageId: stageData.id
            })));
        }
        
        return { errors, warnings };
    }

    /**
     * Validate stage key format and uniqueness
     */
    validateStageKey(key, existingKeys = []) {
        const errors = [];
        
        if (!key || key.trim().length === 0) {
            errors.push({
                ruleId: 'stage.key.required',
                message: 'Stage key is required',
                severity: 'error'
            });
            return { isValid: false, errors };
        }
        
        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
            errors.push({
                ruleId: 'stage.key.format',
                message: 'Stage key must start with a letter and contain only letters, numbers, and underscores',
                severity: 'error'
            });
        }
        
        if (key.length > this.settings.maxStageKeyLength) {
            errors.push({
                ruleId: 'stage.key.length',
                message: `Stage key must be ${this.settings.maxStageKeyLength} characters or less`,
                severity: 'error'
            });
        }
        
        if (existingKeys.includes(key)) {
            errors.push({
                ruleId: 'stage.key.unique',
                message: 'Stage key must be unique',
                severity: 'error'
            });
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate stage roles
     */
    validateStageRoles(roles, availableRoles = []) {
        const errors = [];
        const warnings = [];
        
        if (!Array.isArray(roles)) {
            errors.push({
                ruleId: 'stage.roles.format',
                message: 'Stage roles must be an array',
                severity: 'error'
            });
            return { errors, warnings };
        }
        
        // Check if roles exist in available roles
        const availableRoleIds = availableRoles.map(role => role.id);
        const invalidRoles = roles.filter(roleId => !availableRoleIds.includes(roleId));
        
        invalidRoles.forEach(roleId => {
            warnings.push({
                ruleId: 'stage.roles.unknown',
                message: `Unknown role ID: ${roleId}`,
                severity: 'warning'
            });
        });
        
        return { errors, warnings };
    }

    // =====================================================
    // ACTION VALIDATION
    // =====================================================

    /**
     * Validate single action
     */
    validateAction(actionData) {
        const errors = [];
        const warnings = [];
        
        for (const [ruleId, rule] of this.validationRules) {
            if (!rule.enabled || !ruleId.startsWith('action.')) continue;
            
            try {
                if (!rule.validate(actionData)) {
                    const error = {
                        ruleId,
                        message: rule.message,
                        severity: rule.severity,
                        context: 'action',
                        actionId: actionData.id
                    };
                    
                    if (rule.severity === 'error') {
                        errors.push(error);
                    } else {
                        warnings.push(error);
                    }
                }
            } catch (err) {
                console.error(`Action validation rule ${ruleId} failed:`, err);
            }
        }
        
        // Validate form fields if present
        if (actionData.formFields && Array.isArray(actionData.formFields)) {
            const formValidation = this.validateFormFields(actionData.formFields);
            errors.push(...formValidation.errors.map(error => ({
                ...error,
                context: 'action.form',
                actionId: actionData.id
            })));
            warnings.push(...formValidation.warnings.map(warning => ({
                ...warning,
                context: 'action.form',
                actionId: actionData.id
            })));
        }
        
        return { errors, warnings };
    }

    /**
     * Validate action flow logic
     */
    validateActionFlow(fromStageId, toStageId, stages) {
        const errors = [];
        const warnings = [];
        
        const fromStage = stages.find(stage => stage.id === fromStageId);
        const toStage = stages.find(stage => stage.id === toStageId);
        
        if (!fromStage) {
            errors.push({
                ruleId: 'action.flow.source_missing',
                message: 'Source stage not found',
                severity: 'error'
            });
        }
        
        if (!toStage) {
            errors.push({
                ruleId: 'action.flow.target_missing',
                message: 'Target stage not found',
                severity: 'error'
            });
        }
        
        if (fromStage && toStage) {
            // Validate flow logic
            if (fromStage.type === 'end') {
                warnings.push({
                    ruleId: 'action.flow.from_end',
                    message: 'Actions from end stages are unusual',
                    severity: 'warning'
                });
            }
            
            if (toStage.type === 'start') {
                warnings.push({
                    ruleId: 'action.flow.to_start',
                    message: 'Actions to start stages may create loops',
                    severity: 'warning'
                });
            }
        }
        
        return { errors, warnings };
    }

    /**
     * Validate action roles
     */
    validateActionRoles(roles, availableRoles = []) {
        const errors = [];
        const warnings = [];
        
        if (!Array.isArray(roles)) {
            errors.push({
                ruleId: 'action.roles.format',
                message: 'Action roles must be an array',
                severity: 'error'
            });
            return { errors, warnings };
        }
        
        // Check if roles exist in available roles
        const availableRoleIds = availableRoles.map(role => role.id);
        const invalidRoles = roles.filter(roleId => !availableRoleIds.includes(roleId));
        
        invalidRoles.forEach(roleId => {
            warnings.push({
                ruleId: 'action.roles.unknown',
                message: `Unknown role ID: ${roleId}`,
                severity: 'warning'
            });
        });
        
        return { errors, warnings };
    }

    // =====================================================
    // FORM VALIDATION
    // =====================================================

    /**
     * Validate form fields
     */
    validateFormFields(fields) {
        const errors = [];
        const warnings = [];
        
        if (!Array.isArray(fields)) {
            errors.push({
                ruleId: 'form.fields.format',
                message: 'Form fields must be an array',
                severity: 'error'
            });
            return { errors, warnings };
        }
        
        const fieldKeys = [];
        
        fields.forEach((field, index) => {
            const fieldValidation = this.validateFormField(field, index);
            errors.push(...fieldValidation.errors);
            warnings.push(...fieldValidation.warnings);
            
            if (field.key) {
                fieldKeys.push(field.key);
            }
        });
        
        // Check for duplicate field keys
        const duplicateKeys = fieldKeys.filter((key, index) => fieldKeys.indexOf(key) !== index);
        const uniqueDuplicates = [...new Set(duplicateKeys)];
        
        uniqueDuplicates.forEach(key => {
            errors.push({
                ruleId: 'form.fields.duplicate_key',
                message: `Duplicate field key: ${key}`,
                severity: 'error'
            });
        });
        
        return { errors, warnings };
    }

    /**
     * Validate single form field
     */
    validateFormField(field, index) {
        const errors = [];
        const warnings = [];
        
        // Required field validation
        if (!field.key || field.key.trim().length === 0) {
            errors.push({
                ruleId: 'form.field.key.required',
                message: `Field ${index + 1}: Key is required`,
                severity: 'error'
            });
        }
        
        if (!field.label || field.label.trim().length === 0) {
            errors.push({
                ruleId: 'form.field.label.required',
                message: `Field ${index + 1}: Label is required`,
                severity: 'error'
            });
        }
        
        if (!field.type || field.type.trim().length === 0) {
            errors.push({
                ruleId: 'form.field.type.required',
                message: `Field ${index + 1}: Type is required`,
                severity: 'error'
            });
        }
        
        // Field key format validation
        if (field.key && !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(field.key)) {
            errors.push({
                ruleId: 'form.field.key.format',
                message: `Field ${index + 1}: Key must start with a letter and contain only letters, numbers, and underscores`,
                severity: 'error'
            });
        }
        
        // Field type validation
        const validTypes = ['text', 'textarea', 'number', 'date', 'time', 'datetime', 'select', 'checkbox', 'radio', 'file'];
        if (field.type && !validTypes.includes(field.type)) {
            errors.push({
                ruleId: 'form.field.type.invalid',
                message: `Field ${index + 1}: Invalid field type "${field.type}"`,
                severity: 'error'
            });
        }
        
        // Options validation for select/radio fields
        if (['select', 'radio'].includes(field.type)) {
            if (!field.options || !Array.isArray(field.options) || field.options.length === 0) {
                errors.push({
                    ruleId: 'form.field.options.required',
                    message: `Field ${index + 1}: Options are required for ${field.type} fields`,
                    severity: 'error'
                });
            }
        }
        
        return { errors, warnings };
    }

    /**
     * Validate field key format and uniqueness
     */
    validateFieldKey(key, existingKeys = []) {
        const errors = [];
        
        if (!key || key.trim().length === 0) {
            errors.push({
                ruleId: 'field.key.required',
                message: 'Field key is required',
                severity: 'error'
            });
            return { isValid: false, errors };
        }
        
        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
            errors.push({
                ruleId: 'field.key.format',
                message: 'Field key must start with a letter and contain only letters, numbers, and underscores',
                severity: 'error'
            });
        }
        
        if (existingKeys.includes(key)) {
            errors.push({
                ruleId: 'field.key.unique',
                message: 'Field key must be unique',
                severity: 'error'
            });
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // =====================================================
    // BUSINESS RULES
    // =====================================================

    /**
     * Check for single start stage
     */
    checkSingleStartStage(stages) {
        const startStages = stages.filter(stage => stage.type === 'start');
        
        if (startStages.length === 0) {
            return {
                isValid: false,
                error: 'Workflow must have a start stage'
            };
        }
        
        if (startStages.length > 1) {
            return {
                isValid: false,
                error: 'Workflow can only have one start stage'
            };
        }
        
        return { isValid: true };
    }

    /**
     * Check for orphaned stages
     */
    checkOrphanedStages(stages, actions) {
        const connectedStages = new Set();
        
        // Start stages are never orphaned
        stages.filter(stage => stage.type === 'start').forEach(stage => {
            connectedStages.add(stage.id);
        });
        
        // Add stages with connections
        actions.forEach(action => {
            connectedStages.add(action.fromStageId);
            connectedStages.add(action.toStageId);
        });
        
        const orphanedStages = stages.filter(stage => !connectedStages.has(stage.id));
        
        return {
            isValid: orphanedStages.length === 0,
            orphanedStages,
            error: orphanedStages.length > 0 ? 'Some stages are disconnected from the workflow' : null
        };
    }

    /**
     * Check for circular references
     */
    checkCircularReferences(actions) {
        return {
            isValid: !this.hasCycles([], actions),
            error: this.hasCycles([], actions) ? 'Workflow contains circular references' : null
        };
    }

    /**
     * Check for duplicate stage keys
     */
    checkDuplicateKeys(stages) {
        const keys = stages.map(stage => stage.key).filter(key => key);
        const duplicateKeys = keys.filter((key, index) => keys.indexOf(key) !== index);
        const uniqueDuplicates = [...new Set(duplicateKeys)];
        
        return {
            isValid: uniqueDuplicates.length === 0,
            duplicateKeys: uniqueDuplicates,
            error: uniqueDuplicates.length > 0 ? `Duplicate stage keys: ${uniqueDuplicates.join(', ')}` : null
        };
    }

    // =====================================================
    // UTILITY METHODS
    // =====================================================

    /**
     * Find all reachable stages from start stages
     */
    findReachableStages(stages, actions) {
        const reachable = new Set();
        const toVisit = [];
        
        // Add start stages
        stages.filter(stage => stage.type === 'start').forEach(stage => {
            reachable.add(stage.id);
            toVisit.push(stage.id);
        });
        
        // BFS to find all reachable stages
        while (toVisit.length > 0) {
            const currentStageId = toVisit.shift();
            
            // Find actions from this stage
            const outgoingActions = actions.filter(action => action.fromStageId === currentStageId);
            
            outgoingActions.forEach(action => {
                if (!reachable.has(action.toStageId)) {
                    reachable.add(action.toStageId);
                    toVisit.push(action.toStageId);
                }
            });
        }
        
        return reachable;
    }

    /**
     * Check if workflow has cycles
     */
    hasCycles(stages, actions) {
        const visited = new Set();
        const recursionStack = new Set();
        
        const stageIds = stages.length > 0 ? stages.map(stage => stage.id) : 
                        [...new Set(actions.flatMap(action => [action.fromStageId, action.toStageId]))];
        
        for (const stageId of stageIds) {
            if (this.hasCyclesDFS(stageId, actions, visited, recursionStack)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * DFS helper for cycle detection
     */
    hasCyclesDFS(stageId, actions, visited, recursionStack) {
        if (recursionStack.has(stageId)) {
            return true; // Cycle found
        }
        
        if (visited.has(stageId)) {
            return false; // Already processed
        }
        
        visited.add(stageId);
        recursionStack.add(stageId);
        
        // Visit all adjacent stages
        const outgoingActions = actions.filter(action => action.fromStageId === stageId);
        
        for (const action of outgoingActions) {
            if (this.hasCyclesDFS(action.toStageId, actions, visited, recursionStack)) {
                return true;
            }
        }
        
        recursionStack.delete(stageId);
        return false;
    }

    /**
     * Generate validation summary
     */
    generateValidationSummary(errors, warnings) {
        const errorsByCategory = {};
        const warningsByCategory = {};
        
        errors.forEach(error => {
            const category = error.category || error.context || 'general';
            errorsByCategory[category] = (errorsByCategory[category] || 0) + 1;
        });
        
        warnings.forEach(warning => {
            const category = warning.category || warning.context || 'general';
            warningsByCategory[category] = (warningsByCategory[category] || 0) + 1;
        });
        
        return {
            totalErrors: errors.length,
            totalWarnings: warnings.length,
            errorsByCategory,
            warningsByCategory,
            status: errors.length === 0 ? (warnings.length === 0 ? 'valid' : 'valid_with_warnings') : 'invalid'
        };
    }

    // =====================================================
    // ERROR REPORTING
    // =====================================================

    /**
     * Get all validation errors
     */
    getValidationErrors() {
        return Array.from(this.validationErrors.values());
    }

    /**
     * Format error message for display
     */
    formatErrorMessage(error) {
        let message = error.message;
        
        if (error.stageId) {
            message += ` (Stage: ${error.stageId})`;
        }
        
        if (error.actionId) {
            message += ` (Action: ${error.actionId})`;
        }
        
        return {
            ...error,
            formattedMessage: message,
            timestamp: Date.now()
        };
    }

    /**
     * Get validation report
     */
    getValidationReport(workflowData) {
        const validation = this.validateComplete(workflowData);
        
        return {
            ...validation,
            timestamp: Date.now(),
            ruleCount: {
                validation: this.validationRules.size,
                business: this.businessRules.size
            },
            settings: { ...this.settings }
        };
    }

    // =====================================================
    // CONFIGURATION
    // =====================================================

    /**
     * Update validation settings
     */
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }

    /**
     * Get current settings
     */
    getSettings() {
        return { ...this.settings };
    }

    /**
     * Reset to default settings
     */
    resetSettings() {
        this.settings = {
            strictMode: false,
            realTimeValidation: true,
            validateOnSave: true,
            maxStageKeyLength: 50,
            maxStageNameLength: 100,
            maxActionNameLength: 100,
            maxWorkflowNameLength: 200
        };
    }
}

export default WorkflowValidator;