/**
 * Enhanced Rules Page Component
 * Advanced rules management with database actions, conditions, and execution
 */

import { supabaseClient } from '../core/supabase.js';
import { TableCRUD } from '../components/table-crud.js';
import Utils from '../core/utils.js';
import { i18n, i18nDOM } from '../core/i18n.js';

let rulesTable;
let projectId;
let availableTables = [];
let availableWorkflows = [];

export default async function RulesPage(route, context = {}) {
    console.log('🏠 RulesPage: Received context:', {
        routePath: route?.path,
        contextProjectId: context.projectId,
        supabaseCurrentProject: supabaseClient.getCurrentProjectId(),
        fullContext: context
    });

    projectId = context.projectId;

    if (projectId && supabaseClient.getCurrentProjectId() !== projectId) {
        console.log('🔧 RulesPage: Setting project context in supabaseClient:', projectId);
        supabaseClient.setCurrentProject(projectId);
    }
    
    // Load available tables and workflows for rule building
    await loadRuleBuilderData();
    
    setTimeout(() => {
        initializeRulesTable();
        i18nDOM.translateDataAttributes();
    }, 50);
    
    return `
        <div class="rules-page">
            <div class="page-header">
                <div>
                    <h1 class="page-title" data-i18n="rules.title">Rules Engine</h1>
                    <p class="page-subtitle" data-i18n="rules.subtitle">${projectId ? `Automated database actions and business logic for this project` : 'Global rules and automation'}</p>
                </div>
                <div class="page-actions">
                    <button class="btn btn-primary" onclick="window.rulesPageActions.createRule()">
                        <span>+ Create Rule</span>
                    </button>
                    <button class="btn btn-secondary" onclick="window.rulesPageActions.testRules()">
                        <span>Test Rules</span>
                    </button>
                </div>
            </div>
            
            <div class="rules-stats" id="rules-stats">
                <div class="stat-card">
                    <div class="stat-value" id="total-rules">0</div>
                    <div class="stat-label">Total Rules</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="active-rules">0</div>
                    <div class="stat-label">Active Rules</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="executions-today">0</div>
                    <div class="stat-label">Executions Today</div>
                </div>
            </div>

            <div id="rules-table-container"></div>
            
            <!-- Rule Builder Modal -->
            <div id="rule-builder-modal" class="modal" style="display: none;">
                <div class="modal-content large-modal">
                    <div class="modal-header">
                        <h2 id="rule-builder-title">Create Rule</h2>
                        <button class="modal-close" onclick="window.rulesPageActions.closeRuleBuilder()">&times;</button>
                    </div>
                    <div class="modal-body" id="rule-builder-body">
                        <!-- Rule builder content will be injected here -->
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="window.rulesPageActions.closeRuleBuilder()">Cancel</button>
                        <button class="btn btn-primary" onclick="window.rulesPageActions.saveRule()">Save Rule</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function loadRuleBuilderData() {
    try {
        // Get available tables for rule conditions and actions
        const { data: tables, error: tablesError } = await supabaseClient.from('information_schema.tables')
            .select('table_name')
            .eq('table_schema', 'public');
        
        if (!tablesError && tables) {
            availableTables = tables.map(t => t.table_name).filter(name => 
                !name.startsWith('_') && 
                !['geography_columns', 'geometry_columns', 'spatial_ref_sys'].includes(name)
            );
        }

        // Get available workflows if project scoped
        if (projectId) {
            availableWorkflows = await supabaseClient.getProjectScopedData('workflows', projectId);
        }
    } catch (error) {
        console.error('Failed to load rule builder data:', error);
    }
}

function initializeRulesTable() {
    const columns = [
        { key: 'name', label: 'Rule Name', type: 'text', required: true },
        { key: 'description', label: 'Description', type: 'text' },
        { 
            key: 'conditions', 
            label: 'Conditions', 
            type: 'json',
            render: (value) => {
                if (!value || Object.keys(value).length === 0) return 'No conditions';
                return `${Object.keys(value).length} condition(s)`;
            }
        },
        { 
            key: 'actions', 
            label: 'Actions', 
            type: 'json',
            render: (value) => {
                if (!value || !Array.isArray(value) || value.length === 0) return 'No actions';
                return `${value.length} action(s)`;
            }
        },
        { 
            key: 'is_active', 
            label: 'Status', 
            type: 'boolean',
            render: (value) => value ? 
                '<span class="badge badge-success">Active</span>' : 
                '<span class="badge badge-warning">Inactive</span>'
        },
        { 
            key: 'created_at', 
            label: 'Created', 
            readonly: true,
            render: (value) => Utils.DateUtils.relative(value)
        }
    ];

    const customActions = [
        {
            label: 'Edit Rule',
            icon: '✏️',
            action: (rule) => editRule(rule),
            condition: () => true
        },
        {
            label: 'Test Rule',
            icon: '🧪', 
            action: (rule) => testRule(rule),
            condition: (rule) => rule.is_active
        },
        {
            label: 'View Executions',
            icon: '📊',
            action: (rule) => viewRuleExecutions(rule),
            condition: () => true
        },
        {
            label: 'Duplicate',
            icon: '📋',
            action: (rule) => duplicateRule(rule),
            condition: () => true
        }
    ];

    rulesTable = new TableCRUD({
        tableName: 'rules',
        columns: columns,
        editMode: 'custom',
        customActions: customActions,
        projectScoped: !!projectId,
        projectId: projectId,
        onAdd: () => createRule(),
        onEdit: (rule) => editRule(rule),
        onDelete: async (rule) => await deleteRule(rule),
        customLoadData: async () => {
            try {
                let rules = [];
                if (projectId) {
                    rules = await supabaseClient.getProjectScopedData('rules', projectId);
                } else {
                    // If no projectId, return empty array since rules are project-scoped
                    console.warn('No project ID set for rules page');
                    rules = [];
                }
                
                // Update stats
                updateRulesStats(rules);
                return rules;
            } catch (error) {
                console.error('Failed to load rules:', error);
                return [];
            }
        }
    });

    rulesTable.render('rules-table-container');
}

async function updateRulesStats(rules) {
    const totalRules = rules.length;
    const activeRules = rules.filter(r => r.is_active).length;
    
    // Get today's execution count
    const today = new Date().toISOString().split('T')[0];
    try {
        const { data: executions } = await supabaseClient.from('rule_executions')
            .select('id')
            .gte('executed_at', today + 'T00:00:00.000Z')
            .lt('executed_at', today + 'T23:59:59.999Z');
        
        const executionsToday = executions ? executions.length : 0;
        
        document.getElementById('total-rules').textContent = totalRules;
        document.getElementById('active-rules').textContent = activeRules;
        document.getElementById('executions-today').textContent = executionsToday;
    } catch (error) {
        console.error('Failed to get execution stats:', error);
        document.getElementById('total-rules').textContent = totalRules;
        document.getElementById('active-rules').textContent = activeRules;
        document.getElementById('executions-today').textContent = '?';
    }
}

function createRule() {
    showRuleBuilder();
}

function editRule(rule) {
    showRuleBuilder(rule);
}

async function deleteRule(rule) {
    if (!confirm(`Are you sure you want to delete the rule "${rule.name}"? This action cannot be undone.`)) {
        return false;
    }
    
    try {
        const { error } = await supabaseClient.from('rules')
            .delete()
            .eq('id', rule.id);
            
        if (error) throw error;
        
        Utils.showToast('Rule deleted successfully', 'success');
        rulesTable.loadData();
        return true;
    } catch (error) {
        console.error('Failed to delete rule:', error);
        Utils.showToast('Failed to delete rule: ' + error.message, 'error');
        return false;
    }
}

function showRuleBuilder(existingRule = null) {
    const modal = document.getElementById('rule-builder-modal');
    const title = document.getElementById('rule-builder-title');
    const body = document.getElementById('rule-builder-body');
    
    title.textContent = existingRule ? 'Edit Rule' : 'Create Rule';
    
    body.innerHTML = generateRuleBuilderHTML(existingRule);
    modal.style.display = 'block';
    
    // Initialize rule builder components
    initializeConditionBuilder(existingRule?.conditions);
    initializeActionBuilder(existingRule?.actions);
}

function initializeConditionBuilder(existingConditions = {}) {
    const container = document.getElementById('conditions-builder');
    if (!container) return;
    
    container.innerHTML = `
        <div class="conditions-container">
            <div class="form-group">
                <label>Rule Type</label>
                <select id="rule-type" class="form-control" onchange="updateConditionBuilder()">
                    <option value="event_based">Event-Based (when data changes)</option>
                    <option value="time_based">Time-Based (scheduled checks)</option>
                    <option value="field_based">Field-Based (when values meet criteria)</option>
                </select>
            </div>
            
            <div id="conditions-content">
                <!-- Dynamic conditions content based on rule type -->
            </div>
        </div>
    `;
    
    // Set existing rule type if available
    if (existingConditions.rule_type) {
        document.getElementById('rule-type').value = existingConditions.rule_type;
    }
    
    updateConditionBuilder();
    
    // Apply existing conditions after UI is built
    setTimeout(() => {
        if (existingConditions.rule_type === 'time_based' && existingConditions.time_conditions) {
            applyTimeBasedConditions(existingConditions.time_conditions);
        } else if (existingConditions.rule_type === 'event_based' && existingConditions.event_conditions) {
            applyEventBasedConditions(existingConditions.event_conditions);
        }
    }, 100);
}

function updateConditionBuilder() {
    const ruleType = document.getElementById('rule-type')?.value;
    const container = document.getElementById('conditions-content');
    if (!container) return;
    
    switch (ruleType) {
        case 'time_based':
            buildTimeBasedConditions(container);
            break;
        case 'field_based':
            buildFieldBasedConditions(container);
            break;
        default:
            buildEventBasedConditions(container);
            break;
    }
}

function buildTimeBasedConditions(container) {
    const targetTables = [
        'workflow_instances', 'markers', 'custom_table_data', 
        'instance_data', 'action_executions'
    ];
    
    container.innerHTML = `
        <div class="time-based-conditions">
            <h4>Time-Based Rule Configuration</h4>
            <p class="form-help">Create rules that run on a schedule to check for time-based conditions</p>
            
            <div class="form-group">
                <label>Target Table</label>
                <select id="time-target-table" class="form-control" onchange="updateTimeFields()">
                    <option value="">Select table to check...</option>
                    ${targetTables.map(table => `<option value="${table}">${formatTableName(table)}</option>`).join('')}
                </select>
            </div>
            
            <div class="form-group">
                <label>Time Field to Check</label>
                <select id="time-field" class="form-control">
                    <option value="created_at">Created Date</option>
                    <option value="updated_at">Updated Date</option>
                </select>
            </div>
            
            <div class="form-row">
                <div class="col-md-4">
                    <div class="form-group">
                        <label>Age Condition</label>
                        <select id="age-operator" class="form-control">
                            <option value="older_than">Older than</option>
                            <option value="newer_than">Newer than</option>
                            <option value="exactly">Exactly</option>
                        </select>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="form-group">
                        <label>Age Value</label>
                        <input type="number" id="age-value" class="form-control" min="1" value="30">
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="form-group">
                        <label>Time Unit</label>
                        <select id="age-unit" class="form-control">
                            <option value="minutes">Minutes</option>
                            <option value="hours">Hours</option>
                            <option value="days" selected>Days</option>
                            <option value="weeks">Weeks</option>
                            <option value="months">Months</option>
                        </select>
                    </div>
                </div>
            </div>
            
            <div class="form-group">
                <label>Schedule</label>
                <select id="schedule-frequency" class="form-control">
                    <option value="hourly">Every Hour</option>
                    <option value="daily" selected>Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="manual">Manual Only</option>
                </select>
            </div>
            
            <div class="form-group">
                <label>Additional Filters (JSON)</label>
                <textarea id="additional-filters" class="form-control" rows="3" 
                          placeholder='{"status": "completed", "metadata->archived": false}'></textarea>
                <small class="form-text text-muted">
                    Optional JSON filters to narrow down which records to check. 
                    Example: {"status": "completed"} will only check completed workflow instances.
                </small>
            </div>
            
            <div id="time-field-options" style="display: none;">
                <!-- Dynamic field options based on selected table -->
            </div>
        </div>
    `;
}

function buildEventBasedConditions(container) {
    container.innerHTML = `
        <div class="event-based-conditions">
            <h4>Event-Based Rule Configuration</h4>
            <p class="form-help">Rules that trigger when data is created, updated, or deleted</p>
            
            <div class="form-group">
                <label>Trigger Table</label>
                <select id="trigger-table" class="form-control">
                    <option value="">Select table to monitor...</option>
                    ${availableTables.map(table => `<option value="${table}">${formatTableName(table)}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Trigger Event</label>
                <select id="trigger-event" class="form-control">
                    <option value="INSERT">Record Created</option>
                    <option value="UPDATE">Record Updated</option>
                    <option value="DELETE">Record Deleted</option>
                </select>
            </div>
        </div>
    `;
}

function buildFieldBasedConditions(container) {
    container.innerHTML = `
        <div class="field-based-conditions">
            <h4>Field-Based Rule Configuration</h4>
            <p class="form-help">Rules that check specific field values and conditions</p>
            
            <div class="form-group">
                <label>Target Table</label>
                <select id="field-target-table" class="form-control">
                    <option value="">Select table...</option>
                    ${availableTables.map(table => `<option value="${table}">${formatTableName(table)}</option>`).join('')}
                </select>
            </div>
            
            <div class="form-group">
                <label>Field to Check</label>
                <input type="text" id="field-name" class="form-control" 
                       placeholder="e.g., status, metadata->priority_level">
            </div>
            
            <div class="form-row">
                <div class="col-md-6">
                    <div class="form-group">
                        <label>Condition</label>
                        <select id="field-operator" class="form-control">
                            <option value="equals">Equals</option>
                            <option value="not_equals">Not Equals</option>
                            <option value="contains">Contains</option>
                            <option value="greater_than">Greater Than</option>
                            <option value="less_than">Less Than</option>
                            <option value="is_null">Is Null</option>
                            <option value="is_not_null">Is Not Null</option>
                        </select>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="form-group">
                        <label>Value</label>
                        <input type="text" id="field-value" class="form-control" 
                               placeholder="Expected value">
                    </div>
                </div>
            </div>
        </div>
    `;
}

function formatTableName(tableName) {
    return tableName
        .replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
}

function updateTimeFields() {
    const selectedTable = document.getElementById('time-target-table')?.value;
    const fieldSelect = document.getElementById('time-field');
    
    if (!selectedTable || !fieldSelect) return;
    
    // Base time fields available for all tables
    let timeFields = [
        { value: 'created_at', label: 'Created Date' },
        { value: 'updated_at', label: 'Updated Date' }
    ];
    
    // Add table-specific time fields
    switch (selectedTable) {
        case 'action_executions':
            timeFields.push({ value: 'executed_at', label: 'Execution Date' });
            break;
        case 'instance_data':
            timeFields.push({ value: 'last_modified_at', label: 'Last Modified Date' });
            break;
    }
    
    fieldSelect.innerHTML = timeFields
        .map(field => `<option value="${field.value}">${field.label}</option>`)
        .join('');
}

function applyTimeBasedConditions(conditions) {
    if (conditions.target_table) {
        document.getElementById('time-target-table').value = conditions.target_table;
        updateTimeFields();
    }
    if (conditions.time_field) {
        document.getElementById('time-field').value = conditions.time_field;
    }
    if (conditions.age_operator) {
        document.getElementById('age-operator').value = conditions.age_operator;
    }
    if (conditions.age_value) {
        document.getElementById('age-value').value = conditions.age_value;
    }
    if (conditions.age_unit) {
        document.getElementById('age-unit').value = conditions.age_unit;
    }
    if (conditions.schedule_frequency) {
        document.getElementById('schedule-frequency').value = conditions.schedule_frequency;
    }
    if (conditions.additional_filters) {
        document.getElementById('additional-filters').value = JSON.stringify(conditions.additional_filters, null, 2);
    }
}

function applyEventBasedConditions(conditions) {
    if (conditions.table) {
        document.getElementById('trigger-table').value = conditions.table;
    }
    if (conditions.event) {
        document.getElementById('trigger-event').value = conditions.event;
    }
}

function initializeActionBuilder(existingActions = []) {
    const container = document.getElementById('actions-builder');
    if (!container) return;
    
    container.innerHTML = `
        <div class="actions-container">
            <p class="text-muted">Define actions to perform when rule conditions are met</p>
            <div id="actions-list"></div>
            <button type="button" class="btn btn-secondary btn-sm" onclick="addRuleAction()">
                + Add Action
            </button>
        </div>
    `;
    
    // Add existing actions
    if (Array.isArray(existingActions)) {
        existingActions.forEach((action, index) => addRuleAction(action, index));
    }
}

function addRuleAction(existingAction = null, index = null) {
    const container = document.getElementById('actions-list');
    if (!container) return;
    
    const actionIndex = index !== null ? index : container.children.length;
    const actionId = `action-${actionIndex}`;
    
    const actionHtml = `
        <div class="rule-action-item" id="${actionId}">
            <div class="action-header">
                <h5>Action ${actionIndex + 1}</h5>
                <button type="button" class="btn btn-sm btn-danger" onclick="removeRuleAction('${actionId}')">Remove</button>
            </div>
            <div class="form-group">
                <label>Action Type</label>
                <select class="form-control action-type" data-action-id="${actionId}" onchange="updateActionFields('${actionId}')">
                    <option value="update_field">Update Field</option>
                    <option value="update_metadata">Update Metadata</option>
                    <option value="archive_record">Archive Record</option>
                    <option value="change_status">Change Status</option>
                    <option value="send_notification">Send Notification</option>
                    <option value="create_record">Create Record</option>
                    <option value="delete_record">Delete Record</option>
                    <option value="workflow_transition">Workflow Transition</option>
                </select>
            </div>
            
            <div class="action-fields" id="action-fields-${actionId}">
                <!-- Dynamic action fields based on action type -->
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', actionHtml);
    
    // Initialize action fields
    updateActionFields(actionId);
    
    if (existingAction) {
        setTimeout(() => {
            const actionElement = document.getElementById(actionId);
            if (actionElement) {
                actionElement.querySelector('.action-type').value = existingAction.type || 'update_field';
                updateActionFields(actionId);
                
                // Apply existing action data
                setTimeout(() => applyExistingActionData(actionId, existingAction), 100);
            }
        }, 50);
    }
}

function updateActionFields(actionId) {
    const actionElement = document.getElementById(actionId);
    if (!actionElement) return;
    
    const actionType = actionElement.querySelector('.action-type').value;
    const fieldsContainer = document.getElementById(`action-fields-${actionId}`);
    
    switch (actionType) {
        case 'update_field':
            fieldsContainer.innerHTML = `
                <div class="form-group">
                    <label>Target Field</label>
                    <input type="text" class="form-control action-target-field" 
                           placeholder="e.g., status, metadata->archived">
                    <small class="form-text text-muted">Use -> notation for JSON fields (e.g., metadata->archived)</small>
                </div>
                <div class="form-group">
                    <label>New Value</label>
                    <input type="text" class="form-control action-new-value" 
                           placeholder="New value to set">
                </div>
            `;
            break;
            
        case 'update_metadata':
            fieldsContainer.innerHTML = `
                <div class="form-group">
                    <label>Metadata Key</label>
                    <input type="text" class="form-control action-metadata-key" 
                           placeholder="e.g., archived, priority_level">
                </div>
                <div class="form-group">
                    <label>Metadata Value</label>
                    <input type="text" class="form-control action-metadata-value" 
                           placeholder="Value to set in metadata">
                </div>
            `;
            break;
            
        case 'archive_record':
            fieldsContainer.innerHTML = `
                <div class="form-group">
                    <label>Archive Method</label>
                    <select class="form-control action-archive-method">
                        <option value="metadata">Set metadata->archived = true</option>
                        <option value="status">Change status to 'archived'</option>
                        <option value="soft_delete">Soft delete (mark as deleted)</option>
                    </select>
                </div>
            `;
            break;
            
        case 'change_status':
            fieldsContainer.innerHTML = `
                <div class="form-group">
                    <label>New Status</label>
                    <input type="text" class="form-control action-new-status" 
                           placeholder="e.g., completed, archived, expired">
                </div>
            `;
            break;
            
        case 'send_notification':
            fieldsContainer.innerHTML = `
                <div class="form-group">
                    <label>Notification Type</label>
                    <select class="form-control action-notification-type">
                        <option value="email">Email</option>
                        <option value="system">System Notification</option>
                        <option value="webhook">Webhook</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Recipients (Role Names)</label>
                    <input type="text" class="form-control action-recipients" 
                           placeholder="admin,supervisor,manager">
                    <small class="form-text text-muted">Comma-separated role names</small>
                </div>
                <div class="form-group">
                    <label>Message Template</label>
                    <textarea class="form-control action-message" rows="3" 
                              placeholder="Rule '{{rule_name}}' found {{count}} records older than {{age}} {{unit}}"></textarea>
                </div>
            `;
            break;
            
        case 'workflow_transition':
            fieldsContainer.innerHTML = `
                <div class="form-group">
                    <label>Target Stage</label>
                    <input type="text" class="form-control action-target-stage" 
                           placeholder="Stage key or name">
                </div>
                <div class="form-group">
                    <label>Transition Reason</label>
                    <input type="text" class="form-control action-transition-reason" 
                           placeholder="Automated transition by rule">
                </div>
            `;
            break;
            
        case 'create_record':
            fieldsContainer.innerHTML = `
                <div class="form-group">
                    <label>Target Table</label>
                    <select class="form-control action-target-table">
                        <option value="">Select table...</option>
                        ${availableTables.map(table => `<option value="${table}">${formatTableName(table)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Record Data (JSON)</label>
                    <textarea class="form-control action-record-data" rows="3" 
                              placeholder='{"title": "Auto-generated", "status": "pending"}'></textarea>
                </div>
            `;
            break;
            
        case 'delete_record':
            fieldsContainer.innerHTML = `
                <div class="alert alert-warning">
                    <strong>Warning:</strong> This will permanently delete matching records. Use with caution.
                </div>
                <div class="form-group">
                    <label>Confirmation Required</label>
                    <div class="form-check">
                        <input type="checkbox" class="form-check-input action-confirm-delete" required>
                        <label class="form-check-label">
                            I understand this will permanently delete records
                        </label>
                    </div>
                </div>
            `;
            break;
            
        default:
            fieldsContainer.innerHTML = `
                <div class="form-group">
                    <label>Action Configuration (JSON)</label>
                    <textarea class="form-control action-config" rows="3" 
                              placeholder='{"key": "value"}'></textarea>
                </div>
            `;
    }
}

function applyExistingActionData(actionId, existingAction) {
    const actionElement = document.getElementById(actionId);
    if (!actionElement || !existingAction.data) return;
    
    const data = existingAction.data;
    
    // Apply data based on action type
    switch (existingAction.type) {
        case 'update_field':
            if (data.target_field) {
                actionElement.querySelector('.action-target-field').value = data.target_field;
            }
            if (data.new_value) {
                actionElement.querySelector('.action-new-value').value = data.new_value;
            }
            break;
            
        case 'update_metadata':
            if (data.metadata_key) {
                actionElement.querySelector('.action-metadata-key').value = data.metadata_key;
            }
            if (data.metadata_value) {
                actionElement.querySelector('.action-metadata-value').value = data.metadata_value;
            }
            break;
            
        case 'archive_record':
            if (data.archive_method) {
                actionElement.querySelector('.action-archive-method').value = data.archive_method;
            }
            break;
            
        case 'change_status':
            if (data.new_status) {
                actionElement.querySelector('.action-new-status').value = data.new_status;
            }
            break;
            
        case 'send_notification':
            if (data.notification_type) {
                actionElement.querySelector('.action-notification-type').value = data.notification_type;
            }
            if (data.recipients) {
                actionElement.querySelector('.action-recipients').value = data.recipients;
            }
            if (data.message) {
                actionElement.querySelector('.action-message').value = data.message;
            }
            break;
            
        case 'workflow_transition':
            if (data.target_stage) {
                actionElement.querySelector('.action-target-stage').value = data.target_stage;
            }
            if (data.transition_reason) {
                actionElement.querySelector('.action-transition-reason').value = data.transition_reason;
            }
            break;
            
        case 'create_record':
            if (data.target_table) {
                actionElement.querySelector('.action-target-table').value = data.target_table;
            }
            if (data.record_data) {
                actionElement.querySelector('.action-record-data').value = JSON.stringify(data.record_data, null, 2);
            }
            break;
    }
}

function removeRuleAction(actionId) {
    const element = document.getElementById(actionId);
    if (element) {
        element.remove();
    }
}

function testCurrentRule() {
    const testResults = document.getElementById('rule-test-results');
    testResults.style.display = 'block';
    testResults.innerHTML = '<div class="alert alert-info">Rule testing is not implemented yet. This would validate your rule logic.</div>';
}

function closeRuleBuilder() {
    const modal = document.getElementById('rule-builder-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function saveRule() {
    try {
        const name = document.getElementById('rule-name').value.trim();
        const description = document.getElementById('rule-description').value.trim();
        const isActive = document.getElementById('rule-active').checked;
        
        if (!name) {
            Utils.showToast('Rule name is required', 'error');
            return;
        }
        
        // Collect conditions based on rule type
        const ruleType = document.getElementById('rule-type')?.value || 'event_based';
        let conditions = { rule_type: ruleType };
        
        if (ruleType === 'time_based') {
            const timeConditions = collectTimeBasedConditions();
            if (!timeConditions.target_table) {
                Utils.showToast('Target table is required for time-based rules', 'error');
                return;
            }
            conditions.time_conditions = timeConditions;
        } else if (ruleType === 'field_based') {
            conditions.field_conditions = collectFieldBasedConditions();
        } else {
            conditions.event_conditions = collectEventBasedConditions();
        }
        
        // Collect actions
        const actions = collectRuleActions();
        if (actions.length === 0) {
            Utils.showToast('At least one action is required', 'error');
            return;
        }
        
        const ruleData = {
            name,
            description,
            conditions,
            actions,
            is_active: isActive
        };
        
        console.log('Saving rule with data:', ruleData);
        
        // Create or update rule
        let result;
        if (projectId) {
            result = await supabaseClient.createWithProjectContext('rules', projectId, ruleData);
        } else {
            result = await supabaseClient.create('rules', ruleData);
        }
        
        Utils.showToast('Rule saved successfully', 'success');
        closeRuleBuilder();
        rulesTable.loadData();
        
    } catch (error) {
        console.error('Failed to save rule:', error);
        Utils.showToast('Failed to save rule: ' + error.message, 'error');
    }
}

function collectTimeBasedConditions() {
    const additionalFiltersText = document.getElementById('additional-filters')?.value?.trim();
    let additionalFilters = {};
    
    if (additionalFiltersText) {
        try {
            additionalFilters = JSON.parse(additionalFiltersText);
        } catch (e) {
            console.warn('Invalid JSON in additional filters:', additionalFiltersText);
        }
    }
    
    return {
        target_table: document.getElementById('time-target-table')?.value,
        time_field: document.getElementById('time-field')?.value || 'created_at',
        age_operator: document.getElementById('age-operator')?.value || 'older_than',
        age_value: parseInt(document.getElementById('age-value')?.value) || 30,
        age_unit: document.getElementById('age-unit')?.value || 'days',
        schedule_frequency: document.getElementById('schedule-frequency')?.value || 'daily',
        additional_filters: additionalFilters
    };
}

function collectFieldBasedConditions() {
    return {
        target_table: document.getElementById('field-target-table')?.value,
        field_name: document.getElementById('field-name')?.value,
        operator: document.getElementById('field-operator')?.value || 'equals',
        value: document.getElementById('field-value')?.value
    };
}

function collectEventBasedConditions() {
    return {
        table: document.getElementById('trigger-table')?.value,
        event: document.getElementById('trigger-event')?.value || 'INSERT'
    };
}

function collectRuleActions() {
    const actions = [];
    const actionElements = document.querySelectorAll('.rule-action-item');
    
    actionElements.forEach(actionElement => {
        const type = actionElement.querySelector('.action-type').value;
        const data = collectActionData(actionElement, type);
        
        if (type && data) {
            actions.push({ type, data });
        }
    });
    
    return actions;
}

function collectActionData(actionElement, actionType) {
    switch (actionType) {
        case 'update_field':
            const targetField = actionElement.querySelector('.action-target-field')?.value;
            const newValue = actionElement.querySelector('.action-new-value')?.value;
            if (!targetField) return null;
            return { target_field: targetField, new_value: newValue };
            
        case 'update_metadata':
            const metadataKey = actionElement.querySelector('.action-metadata-key')?.value;
            const metadataValue = actionElement.querySelector('.action-metadata-value')?.value;
            if (!metadataKey) return null;
            return { metadata_key: metadataKey, metadata_value: metadataValue };
            
        case 'archive_record':
            const archiveMethod = actionElement.querySelector('.action-archive-method')?.value;
            return { archive_method: archiveMethod };
            
        case 'change_status':
            const newStatus = actionElement.querySelector('.action-new-status')?.value;
            if (!newStatus) return null;
            return { new_status: newStatus };
            
        case 'send_notification':
            const notificationType = actionElement.querySelector('.action-notification-type')?.value;
            const recipients = actionElement.querySelector('.action-recipients')?.value;
            const message = actionElement.querySelector('.action-message')?.value;
            return { 
                notification_type: notificationType, 
                recipients: recipients,
                message: message 
            };
            
        case 'workflow_transition':
            const targetStage = actionElement.querySelector('.action-target-stage')?.value;
            const transitionReason = actionElement.querySelector('.action-transition-reason')?.value;
            if (!targetStage) return null;
            return { 
                target_stage: targetStage, 
                transition_reason: transitionReason 
            };
            
        case 'create_record':
            const targetTable = actionElement.querySelector('.action-target-table')?.value;
            const recordDataText = actionElement.querySelector('.action-record-data')?.value?.trim();
            let recordData = {};
            if (recordDataText) {
                try {
                    recordData = JSON.parse(recordDataText);
                } catch (e) {
                    console.warn('Invalid JSON in record data:', recordDataText);
                    return null;
                }
            }
            if (!targetTable) return null;
            return { target_table: targetTable, record_data: recordData };
            
        case 'delete_record':
            const confirmDelete = actionElement.querySelector('.action-confirm-delete')?.checked;
            if (!confirmDelete) return null;
            return { confirmed: true };
            
        default:
            const configText = actionElement.querySelector('.action-config')?.value?.trim();
            if (configText) {
                try {
                    return JSON.parse(configText);
                } catch (e) {
                    console.warn('Invalid JSON in action config:', configText);
                    return null;
                }
            }
            return {};
    }
}

async function testRule(rule) {
    Utils.showToast('Rule testing functionality coming soon', 'info');
}

async function viewRuleExecutions(rule) {
    Utils.showToast('Rule execution history coming soon', 'info');
}

async function duplicateRule(rule) {
    try {
        const duplicateData = {
            name: `${rule.name} (Copy)`,
            description: rule.description,
            conditions: rule.conditions,
            actions: rule.actions,
            is_active: false // Start duplicates as inactive
        };
        
        let result;
        if (projectId) {
            result = await supabaseClient.createWithProjectContext('rules', projectId, duplicateData);
        } else {
            result = await supabaseClient.create('rules', duplicateData);
        }
        
        Utils.showToast('Rule duplicated successfully', 'success');
        rulesTable.loadData();
        
    } catch (error) {
        console.error('Failed to duplicate rule:', error);
        Utils.showToast('Failed to duplicate rule: ' + error.message, 'error');
    }
}

// Make functions globally accessible for onclick handlers
window.addRuleAction = addRuleAction;
window.removeRuleAction = removeRuleAction;
window.testCurrentRule = testCurrentRule;
window.updateConditionBuilder = updateConditionBuilder;
window.updateActionFields = updateActionFields;
window.updateTimeFields = updateTimeFields;

// Global actions object for window access
window.rulesPageActions = {
    createRule,
    testRules: () => Utils.showToast('Rules testing functionality coming soon', 'info'),
    closeRuleBuilder,
    saveRule
};

function generateRuleBuilderHTML(existingRule) {
    return `
        <div class="rule-builder">
            <div class="form-section">
                <h3>Rule Information</h3>
                <div class="form-group">
                    <label for="rule-name">Rule Name *</label>
                    <input type="text" id="rule-name" class="form-control" 
                           value="${existingRule?.name || ''}" required>
                </div>
                <div class="form-group">
                    <label for="rule-description">Description</label>
                    <textarea id="rule-description" class="form-control" rows="3"
                              placeholder="Describe what this rule does...">${existingRule?.description || ''}</textarea>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="rule-active" 
                               ${existingRule?.is_active !== false ? 'checked' : ''}>
                        Rule is active
                    </label>
                </div>
            </div>
            
            <div class="form-section">
                <h3>Conditions</h3>
                <p class="form-help">Define when this rule should be triggered</p>
                <div id="conditions-builder">
                    <!-- Conditions builder will be inserted here -->
                </div>
            </div>
            
            <div class="form-section">
                <h3>Actions</h3>
                <p class="form-help">Define what database actions to perform when conditions are met</p>
                <div id="actions-builder">
                    <!-- Actions builder will be inserted here -->
                </div>
            </div>
            
            <div class="form-section">
                <h3>Test Rule</h3>
                <p class="form-help">Test your rule logic before saving</p>
                <button type="button" class="btn btn-secondary" onclick="testCurrentRule()">
                    Test Rule Logic
                </button>
                <div id="rule-test-results" class="rule-test-results" style="display: none;">
                    <!-- Test results will appear here -->
                </div>
            </div>
        </div>
    `;
}