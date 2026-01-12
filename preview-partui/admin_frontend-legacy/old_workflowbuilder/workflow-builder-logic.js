/**
 * Workflow Builder Logic Component
 * Business logic, data operations, and workflow interactions
 */

// Import shared state and functions from UI module
import { 
    nodes, transitions, nodeCounter, selectedNode, selectedTransition, 
    workflowId, projectId, workflowStorage, formBuilder, nodeRoleSelector, 
    transitionRoleSelector, workflowCanvas, workflowNodes, isDragging, 
    dragOffset, connectingFrom, history, historyIndex, maxHistorySize, 
    projectRoles, loadProjectRoles, getDefaultRolesForStage, getDefaultRolesForAction,
    updateNodes, updateTransitions, updateNodeCounter, updateSelectedNode, 
    updateSelectedTransition, updateWorkflowId, updateProjectId, updateHistory, updateHistoryIndex,
    updateIsDragging, updateDragOffset, updateConnectingFrom, updateNodeRoleSelector, 
    updateTransitionRoleSelector
} from './workflow-builder-ui.js';
import { supabaseClient } from '../core/supabase.js';
import app from '../core/app.js';
import router from '../core/router.js';
import RoleSelector from '../components/role-selector.js';

/**
 * Load existing workflow from database
 */
async function loadExistingWorkflow(workflowId) {
    try {
        const workflowData = await workflowStorage.loadWorkflow(workflowId);
        
        // Convert database format to builder format
        const newNodes = workflowData.stages.map((stage, index) => {
            // Clean and validate stage key
            let stageKey = stage.stage_key || `stage_${stage.id}`;
            stageKey = stageKey.toString().replace(/[\s\n\r]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
            if (stageKey && !/^[a-zA-Z]/.test(stageKey)) {
                stageKey = 'stage_' + stageKey;
            }
            
            return {
                id: `node_${stage.id}`,
                dbId: stage.id,
                type: stage.stage_type,
                title: stage.stage_name,
                key: stageKey,
                x: 50 + (index % 4) * 200,
                y: 50 + Math.floor(index / 4) * 150,
                maxHours: stage.max_duration_hours || 24,
                allowedRoles: stage.visible_to_roles || [],
                formId: stage.initial_form_id || null,
                formFields: stage.form_fields || []
            };
        });

        const newTransitions = workflowData.actions.map(action => ({
            id: `trans_${action.id}`,
            dbId: action.id,
            fromId: `node_${action.from_stage_id}`,
            toId: `node_${action.to_stage_id}`,
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

        updateNodes(newNodes);
        updateTransitions(newTransitions);
        updateNodeCounter(workflowData.stages.length);

        // Set workflow info in UI
        setTimeout(() => {
            setWorkflowInfo(workflowData.workflow);
            
            // Refresh canvas to show loaded workflow
            if (workflowCanvas) {
                workflowCanvas.refreshCanvas();
                updateTransitionsList(); // Also update sidebar transitions list
            } else {
                // If canvas not ready yet, try again after a short delay
                setTimeout(() => {
                    if (workflowCanvas) {
                        workflowCanvas.refreshCanvas();
                        updateTransitionsList(); // Also update sidebar transitions list
                    } else {
                        // Fallback to logic rendering system
                        refreshCanvas();
                    }
                }, 100);
            }
        }, 150);

    } catch (error) {
        throw new Error(`Failed to load workflow: ${error.message}`);
    }
}

/**
 * Set workflow information in the UI
 */
function setWorkflowInfo(workflow) {
    const nameInput = document.getElementById('workflowName');
    const descInput = document.getElementById('workflowDesc');
    const typeSelect = document.getElementById('workflowType');
    const colorInput = document.getElementById('workflowColor');
    
    if (nameInput) nameInput.value = workflow.name || '';
    if (descInput) descInput.value = workflow.description || '';
    if (typeSelect) typeSelect.value = workflow.workflow_type || 'incident';
    if (colorInput) colorInput.value = workflow.marker_color || '#2563eb';
    
    updateColorPreview();
    
    // Update workflow type display in toolbar
    updateWorkflowTypeDisplay(workflow.workflow_type || 'incident');
}

/**
 * Render error page
 */
function renderErrorPage(message) {
    return `
        <div class="workflow-builder-page">
            <div class="page-header">
                <h1 class="page-title">Workflow Builder</h1>
                <p class="page-subtitle" style="color: #e74c3c;">${message}</p>
            </div>
        </div>
    `;
}

/**
 * Initialize the workflow builder interface
 */
function initializeWorkflowBuilder() {
    const canvas = document.getElementById('canvas');
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }
    
    // Set up form builder callbacks
    setupFormBuilderCallbacks();
    
    // Make workflow builder functions globally accessible
    setupGlobalFunctions();

    // Initialize drag and drop
    initializeDragAndDrop(canvas);

    // Initialize event listeners
    initializeEventListeners();

    // Render existing workflow if loaded
    if (nodes.length > 0) {
        refreshCanvas();
    }

    // Initialize history and UI
    saveToHistory();
    updateColorPreview();
    updateUndoRedoButtons();
}

/**
 * Setup form builder event callbacks
 */
function setupFormBuilderCallbacks() {
    formBuilder.setCallbacks({
        onFieldAdd: (field) => {
            console.log('Field added:', field.field_label);
            // Update form fields display in modals
            updateFormFieldsDisplay();
        },
        onFieldUpdate: (field) => {
            console.log('Field updated:', field.field_label);
            // Update form fields display in modals
            updateFormFieldsDisplay();
        },
        onFieldRemove: (field) => {
            console.log('Field removed:', field.field_label);
            // Update form fields display in modals
            updateFormFieldsDisplay();
        },
        onFieldsChange: () => {
            // Update all UI elements that show form fields
            updateFormFieldsDisplay();
            updateTransitionsList();
        }
    });
}

/**
 * Update form fields display in modals
 */
function updateFormFieldsDisplay() {
    const formFieldsContainer = document.getElementById('formFields');
    const actionFieldsContainer = document.getElementById('actionFields');
    
    if (formFieldsContainer) {
        formFieldsContainer.innerHTML = renderFormBuilderFields();
    }
    
    if (actionFieldsContainer) {
        actionFieldsContainer.innerHTML = renderFormBuilderFields();
    }
    
    // Also refresh any simple overview displays
    formBuilder.refreshSimpleOverview();
}

/**
 * Setup global functions for UI callbacks
 */
function setupGlobalFunctions() {
    window.workflowBuilder = {
        // Core actions
        undo,
        redo,
        saveWorkflow,
        exportJSON,
        importFromText,
        processImport,
        clearCanvas,
        showDataFlow,
        
        // Node/Stage management
        saveNode,
        deleteNode,
        
        // Action/Transition management
        saveTransition,
        deleteTransition,
        toggleActionSections,
        
        // Form management - now uses modal system
        addFormField: () => formBuilder.showAddQuestionModal(),
        addActionField: () => formBuilder.showAddQuestionModal(),
        
        // Modal management
        closeModal,
        
        // Panel toggles
        toggleSettingsSection,
        toggleActionsSection,
        toggleActionOverview,
        
        // Workflow type selection
        selectWorkflowType,
        
        // Help system
        showHelp,
        hideHelp,
        
        // Zoom and pan controls
        zoomIn,
        zoomOut,
        resetZoom,
        fitToView,
        
        // Role management helpers
        updateNodeRoles: (value) => {
            if (selectedNode) {
                selectedNode.allowedRoles = parseRolesString(value);
            }
        },
        updateTransitionRoles,
        
        // Data access helpers
        get nodes() { return nodes; },
        get selectedNode() { return selectedNode; },
        
        // Node configuration helper
        openNodeSettings: (nodeId) => {
            const node = nodes.find(n => n.id === nodeId);
            if (node) {
                editNode(node);
            }
        },
        
    };
    
    // Make form builder globally accessible for UI callbacks
    window.formBuilder = formBuilder;
    
    // Expose nodes array and selected node for form builder access
    window.nodes = nodes;
    window.selectedNode = selectedNode;
    
    // Expose node settings function
    window.openNodeSettings = (nodeId) => {
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
            editNode(node);
        }
    };
    
}

/**
 * Initialize drag and drop functionality
 */
function initializeDragAndDrop(canvas) {
    document.querySelectorAll('.drag-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', e.target.dataset.type);
        });
    });

    canvas.addEventListener('dragover', (e) => e.preventDefault());
    canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        const nodeType = e.dataTransfer.getData('text/plain');
        const rect = canvas.getBoundingClientRect();
        createNode(nodeType, e.clientX - rect.left, e.clientY - rect.top);
    });
}

/**
 * Initialize event listeners
 */
function initializeEventListeners() {
    // Color picker
    const colorInput = document.getElementById('workflowColor');
    if (colorInput) {
        colorInput.addEventListener('change', updateColorPreview);
    }
    
    // Modal overlay
    const overlay = document.getElementById('overlay');
    if (overlay) {
        overlay.addEventListener('click', closeModal);
    }
    
}

/**
 * Parse roles string into array
 */
function parseRolesString(value) {
    return value.split(',').map(r => r.trim()).filter(r => r);
}

function updateColorPreview() {
    const color = document.getElementById('workflowColor').value;
    const preview = document.getElementById('colorPreview');
    if (preview) {
        preview.style.background = color;
    }
}

function createNode(type, x, y) {
    // Enforce single start stage rule
    if (type === 'start') {
        const existingStartNodes = nodes.filter(n => n.type === 'start');
        if (existingStartNodes.length > 0) {
            app.showNotification('warning', 'Single Start Stage', 'A workflow can only have one start stage. Please remove the existing start stage first.');
            return;
        }
    }
    
    const newCounter = nodeCounter + 1;
    updateNodeCounter(newCounter);
    
    const id = `node_${newCounter}`;
    const node = {
        id,
        type,
        title: `${type.charAt(0).toUpperCase() + type.slice(1)} ${newCounter}`,
        key: `${type}_${newCounter}`,
        x, y,
        maxHours: type === 'start' ? 0 : 24,
        allowedRoles: getDefaultRolesForStage(type),
        formFields: []
    };
    
    updateNodes([...nodes, node]);
    renderNode(node);
    updateTransitionsList();
    saveToHistory();
    
    // Auto-open configuration modal
    setTimeout(() => editNode(node), 100);
}

function renderNode(node) {
    const canvas = document.getElementById('canvas');
    const nodeEl = document.createElement('div');
    nodeEl.className = `node ${node.type}`;
    nodeEl.id = node.id;
    nodeEl.style.left = node.x + 'px';
    nodeEl.style.top = node.y + 'px';
    
    let formInfo = '';
    if (node.type === 'start' && node.formFields && node.formFields.length > 0) {
        formInfo = `<br><small>${node.formFields.length} initial fields</small>`;
    }
    
    nodeEl.innerHTML = `
        <strong>${node.title}</strong><br>
        <small>${node.key}</small>${formInfo}
    `;

    nodeEl.addEventListener('dblclick', () => editNode(node));
    nodeEl.addEventListener('mousedown', (e) => startDrag(e, node));
    nodeEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (connectingFrom && connectingFrom !== node) {
            createDirectTransition(connectingFrom, node);
            updateConnectingFrom(null);
            document.querySelectorAll('.node').forEach(n => n.style.border = '2px solid #333');
        } else if (connectingFrom && connectingFrom === node) {
            createEditAction(node);
            updateConnectingFrom(null);
            document.querySelectorAll('.node').forEach(n => n.style.border = '2px solid #333');
        } else {
            updateConnectingFrom(node);
            document.querySelectorAll('.node').forEach(n => n.style.border = '2px solid #333');
            nodeEl.style.border = '3px solid red';
        }
    });

    canvas.appendChild(nodeEl);
}

function createDirectTransition(fromNode, toNode) {
    const id = `trans_${fromNode.id}_${toNode.id}`;
    
    const transition = {
        id,
        fromId: fromNode.id,
        toId: toNode.id,
        name: `${fromNode.title} → ${toNode.title}`,
        buttonLabel: 'Next',
        buttonColor: '#007bff',
        allowedRoles: getDefaultRolesForAction(fromNode.id),
        conditions: [],
        requiresConfirmation: false,
        confirmationMessage: '',
        isEditAction: false,
        actionFields: []
    };
    
    updateTransitions([...transitions, transition]);
    renderTransitions();
    updateTransitionsList();
    saveToHistory();
    
    // Auto-open configuration
    setTimeout(() => editTransition(transition), 100);
}

function createEditAction(node) {
    const id = `edit_${node.id}_${Date.now()}`;
    const editAction = {
        id,
        fromId: node.id,
        toId: node.id,
        name: `Edit ${node.title}`,
        buttonLabel: 'Edit',
        buttonColor: '#ff9800',
        allowedRoles: getDefaultRolesForAction(node.id),
        conditions: [],
        requiresConfirmation: false,
        confirmationMessage: '',
        isEditAction: true,
        editableFields: [],
        actionFields: []
    };
    
    updateTransitions([...transitions, editAction]);
    renderTransitions();
    updateTransitionsList();
    saveToHistory();
}

function renderTransitions() {
    // Use WorkflowCanvas if available, otherwise fallback to direct rendering
    if (workflowCanvas && workflowCanvas.renderTransitions) {
        workflowCanvas.renderTransitions();
        return;
    }
    
    // Fallback for when canvas isn't initialized yet
    const canvas = document.getElementById('canvas');
    if (!canvas) return;
    
    document.querySelectorAll('.transition, .transition-label, .edit-action').forEach(el => el.remove());
    
    transitions.forEach(transition => {
        const fromNode = nodes.find(n => n.id === transition.fromId);
        const toNode = nodes.find(n => n.id === transition.toId);
        if (!fromNode || !toNode) return;

        if (transition.isEditAction) {
            const editIcon = document.createElement('div');
            editIcon.className = 'edit-action';
            editIcon.innerHTML = 'Edit';
            editIcon.style.left = (fromNode.x + 130) + 'px';
            editIcon.style.top = (fromNode.y + 10) + 'px';
            editIcon.title = `${transition.buttonLabel} - ${transition.allowedRoles.join(', ')}`;
            editIcon.dataset.transitionId = transition.id;
            editIcon.addEventListener('click', () => editTransition(transition));
            canvas.appendChild(editIcon);
        } else {
            const fromX = fromNode.x + 60;
            const fromY = fromNode.y + 20;
            const toX = toNode.x + 60;
            const toY = toNode.y + 20;
            
            const length = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
            const angle = Math.atan2(toY - fromY, toX - fromX) * 180 / Math.PI;
            
            const line = document.createElement('div');
            const hasActionFields = transition.actionFields && transition.actionFields.length > 0;
            line.className = `transition ${hasActionFields ? 'has-action' : ''}`;
            line.style.left = fromX + 'px';
            line.style.top = fromY + 'px';
            line.style.width = length + 'px';
            line.style.transform = `rotate(${angle}deg)`;
            line.dataset.transitionId = transition.id;
            canvas.appendChild(line);

            const label = document.createElement('div');
            label.className = `transition-label ${hasActionFields ? 'has-action' : ''}`;
            const actionInfo = hasActionFields ? ` (+${transition.actionFields.length})` : '';
            label.textContent = transition.buttonLabel + actionInfo;
            label.style.left = (fromX + toX) / 2 + 'px';
            label.style.top = (fromY + toY) / 2 + 'px';
            label.style.cursor = 'pointer';
            label.dataset.transitionId = transition.id;
            label.addEventListener('click', () => editTransition(transition));
            canvas.appendChild(label);
        }
    });
}

function refreshCanvas() {
    // Use WorkflowCanvas if available, otherwise fallback to direct rendering
    if (workflowCanvas && workflowCanvas.refreshCanvas) {
        workflowCanvas.refreshCanvas();
        updateTransitionsList();
    } else {
        // Fallback for when canvas isn't initialized yet
        const canvas = document.getElementById('canvas');
        if (canvas) {
            canvas.innerHTML = '';
            nodes.forEach(node => renderNode(node));
            renderTransitions();
        }
        updateTransitionsList();
    }
}

function startDrag(e, node) {
    updateIsDragging(true);
    const nodeEl = document.getElementById(node.id);
    const rect = nodeEl.getBoundingClientRect();
    updateDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    });

    function onMouseMove(e) {
        if (!isDragging) return;
        const canvas = document.getElementById('canvas');
        const canvasRect = canvas.getBoundingClientRect();
        node.x = e.clientX - canvasRect.left - dragOffset.x;
        node.y = e.clientY - canvasRect.top - dragOffset.y;
        nodeEl.style.left = node.x + 'px';
        nodeEl.style.top = node.y + 'px';
        renderTransitions();
    }

    function onMouseUp() {
        updateIsDragging(false);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

async function editNode(node) {
    updateSelectedNode(node);
    
    // Populate basic node info
    const nodeTitle = document.getElementById('nodeTitle');
    const nodeKey = document.getElementById('nodeKey');
    const nodeType = document.getElementById('nodeType');
    const maxHours = document.getElementById('maxHours');
    
    if (nodeTitle) nodeTitle.value = node.title || '';
    if (nodeKey) nodeKey.value = node.key || '';
    if (nodeType) nodeType.value = node.type || 'intermediate';
    if (maxHours) maxHours.value = node.maxHours || 24;
    
    // Set up roles selector
    const allowedRolesDiv = document.getElementById('allowedRoles');
    if (allowedRolesDiv) {
        // Destroy existing role selector if it exists
        if (nodeRoleSelector) {
            nodeRoleSelector.destroy();
        }
        
        // Create new role selector
        updateNodeRoleSelector(new RoleSelector('allowedRoles', {
            projectId: projectId,
            label: 'Allowed Roles:',
            placeholder: 'Type role name or # for all roles...',
            onSelectionChange: (roles) => {
                if (selectedNode) {
                    selectedNode.allowedRoles = roles.map(r => r.id);
                }
            },
            onRoleCreate: (role) => {
                console.log('Node role created:', role.name);
            }
        }));
        
        // Set selected roles
        if (node.allowedRoles && node.allowedRoles.length > 0) {
            await nodeRoleSelector.setSelectedRoles(node.allowedRoles);
        }
    }
    
    // Handle start stage form fields
    const startFormSection = document.getElementById('startFormSection');
    if (startFormSection) {
        if (node.type === 'start') {
            startFormSection.style.display = 'block';
            
            // Load existing form fields from local node data
            if (node.formFields && node.formFields.length > 0) {
                formBuilder.setFields(node.formFields);
            } else {
                formBuilder.clearFields();
            }
            
            const formFieldsContainer = document.getElementById('formFields');
            if (formFieldsContainer) {
                renderFormFields(formFieldsContainer);
            }
        } else {
            startFormSection.style.display = 'none';
        }
    }
    
    showModal('nodeModal');
}

function editTransition(transition) {
    updateSelectedTransition(transition);
    
    // Populate basic transition info
    const transitionName = document.getElementById('transitionName');
    const buttonLabel = document.getElementById('buttonLabel');
    const buttonColor = document.getElementById('buttonColor');
    const transitionConditions = document.getElementById('transitionConditions');
    const requiresConfirmation = document.getElementById('requiresConfirmation');
    const isEditAction = document.getElementById('isEditAction');
    const confirmationMessage = document.getElementById('confirmationMessage');
    
    if (transitionName) transitionName.value = transition.name || '';
    if (buttonLabel) buttonLabel.value = transition.buttonLabel || '';
    if (buttonColor) buttonColor.value = transition.buttonColor || '#007bff';
    if (transitionConditions) transitionConditions.value = Array.isArray(transition.conditions) ? transition.conditions.join('\n') : '';
    if (requiresConfirmation) requiresConfirmation.checked = transition.requiresConfirmation || false;
    if (isEditAction) isEditAction.checked = transition.isEditAction || false;
    if (confirmationMessage) confirmationMessage.value = transition.confirmationMessage || '';
    
    // Set up roles selector
    const transitionRolesDiv = document.getElementById('transitionRoles');
    if (transitionRolesDiv) {
        // Destroy existing role selector if it exists
        if (transitionRoleSelector) {
            transitionRoleSelector.destroy();
        }
        
        // Create new role selector
        updateTransitionRoleSelector(new RoleSelector('transitionRoles', {
            projectId: projectId,
            label: 'Who can perform this action?',
            placeholder: 'Type role name or # for all roles...',
            onSelectionChange: (roles) => {
                if (selectedTransition) {
                    selectedTransition.allowedRoles = roles.map(r => r.id);
                }
            },
            onRoleCreate: (role) => {
                console.log('Transition role created:', role.name);
            }
        }));
        
        // Set selected roles
        if (transition.allowedRoles && transition.allowedRoles.length > 0) {
            transitionRoleSelector.setSelectedRoles(transition.allowedRoles);
        }
    }
    
    // Handle action sections
    toggleActionSections(transition.isEditAction || false);
    
    // Handle form fields for regular actions
    if (!transition.isEditAction) {
        if (transition.actionFields && transition.actionFields.length > 0) {
            formBuilder.setFields(transition.actionFields);
        } else {
            formBuilder.clearFields();
        }
        
        const actionFieldsContainer = document.getElementById('actionFields');
        if (actionFieldsContainer) {
            renderFormFields(actionFieldsContainer);
        }
    }
    
    showModal('transitionModal');
}

function toggleActionSections(isEditAction) {
    const normalSection = document.getElementById('normalActionSection');
    const editSection = document.getElementById('editActionSection');
    
    if (isEditAction) {
        normalSection.style.display = 'none';
        editSection.style.display = 'block';
    } else {
        normalSection.style.display = 'block';
        editSection.style.display = 'none';
    }
}

/**
 * Form field rendering and management - now handled by FormBuilder module
 * These functions are simplified wrappers for the FormBuilder functionality
 */

function renderFormFields(container) {
    container.innerHTML = renderFormBuilderFields();
}

function renderFormBuilderFields() {
    return formBuilder.renderSimpleOverview();
}

function addFormField() {
    const fieldType = document.getElementById('fieldType')?.value || 'short';
    formBuilder.addField(fieldType);
    
    if (selectedNode) {
        const container = document.getElementById('formFields');
        if (container) {
            container.innerHTML = renderFormBuilderFields();
        }
    }
}

function addActionField() {
    const fieldType = document.getElementById('actionFieldType')?.value || 'short';
    formBuilder.addField(fieldType);
    
    if (selectedTransition) {
        const container = document.getElementById('actionFields');
        if (container) {
            container.innerHTML = renderFormBuilderFields();
        }
    }
}

async function saveNode() {
    if (!selectedNode) return;
    
    try {
        // Update node properties
        selectedNode.title = document.getElementById('nodeTitle')?.value || selectedNode.title;
        let keyValue = document.getElementById('nodeKey')?.value || selectedNode.key;
        // Clean and validate key: remove newlines, spaces, and ensure it's a valid identifier
        keyValue = keyValue.toString().replace(/[\s\n\r]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
        if (keyValue && !/^[a-zA-Z]/.test(keyValue)) {
            keyValue = 'stage_' + keyValue;
        }
        selectedNode.key = keyValue;
        selectedNode.type = document.getElementById('nodeType')?.value || selectedNode.type;
        selectedNode.maxHours = parseInt(document.getElementById('maxHours')?.value) || 24;
        
        // Handle form fields for start stages - store locally, don't create in DB yet
        if (selectedNode.type === 'start') {
            const fields = formBuilder.getAllFields();
            selectedNode.formFields = fields.map(f => ({
                field_key: f.field_key,
                field_label: f.field_label,
                field_type: f.field_type,
                field_order: f.field_order,
                is_required: f.is_required,
                placeholder: f.placeholder,
                help_text: f.help_text,
                validation_rules: f.validation_rules,
                field_options: f.field_options,
                conditional_logic: f.conditional_logic
            }));
        }
        
        // Update node visual representation
        updateNodeVisual(selectedNode);
        
        renderTransitions();
        updateTransitionsList();
        closeModal();
        saveToHistory();
        
        app.showNotification('info', 'Stage Saved', 'Stage configuration saved locally. Use "Save Workflow" to persist to database.');
        
    } catch (error) {
        console.error('Failed to save node:', error);
        app.showNotification('error', 'Save Failed', 'Failed to save stage: ' + error.message);
    }
}

/**
 * Update node visual representation
 */
function updateNodeVisual(node) {
    const nodeEl = document.getElementById(node.id);
    if (!nodeEl) return;
    
    nodeEl.className = `node ${node.type}`;
    
    let formInfo = '';
    if (node.type === 'start') {
        const fieldCount = node.formFields ? node.formFields.length : 0;
        if (fieldCount > 0) {
            formInfo = `<br><small>${fieldCount} initial fields</small>`;
        }
    }
    
    nodeEl.innerHTML = `
        <strong>${node.title}</strong><br>
        <small>${node.key}</small>${formInfo}
    `;
}

async function saveTransition() {
    if (!selectedTransition) return;
    
    try {
        // Update transition properties
        selectedTransition.name = document.getElementById('transitionName')?.value || selectedTransition.name;
        selectedTransition.buttonLabel = document.getElementById('buttonLabel')?.value || selectedTransition.buttonLabel;
        selectedTransition.buttonColor = document.getElementById('buttonColor')?.value || selectedTransition.buttonColor;
        selectedTransition.requiresConfirmation = document.getElementById('requiresConfirmation')?.checked || false;
        selectedTransition.isEditAction = document.getElementById('isEditAction')?.checked || false;
        selectedTransition.confirmationMessage = document.getElementById('confirmationMessage')?.value || '';
        
        // Parse conditions
        const conditionsText = document.getElementById('transitionConditions')?.value || '';
        selectedTransition.conditions = conditionsText.split('\n').filter(c => c.trim());
        
        // Handle form fields for regular actions (not edit actions) - store locally
        if (!selectedTransition.isEditAction) {
            const fields = formBuilder.getAllFields();
            selectedTransition.actionFields = fields.map(f => ({
                field_key: f.field_key,
                field_label: f.field_label,
                field_type: f.field_type,
                field_order: f.field_order,
                is_required: f.is_required,
                placeholder: f.placeholder,
                help_text: f.help_text,
                validation_rules: f.validation_rules,
                field_options: f.field_options,
                conditional_logic: f.conditional_logic
            }));
        } else {
            // For edit actions, store editable fields configuration
            selectedTransition.editableFields = selectedTransition.editableFields || [];
        }
        
        renderTransitions();
        updateTransitionsList();
        closeModal();
        saveToHistory();
        
        app.showNotification('info', 'Action Saved', 'Action configuration saved locally. Use "Save Workflow" to persist to database.');
        
    } catch (error) {
        console.error('Failed to save transition:', error);
        app.showNotification('error', 'Save Failed', 'Failed to save action: ' + error.message);
    }
}

function deleteNode() {
    if (!selectedNode) return;
    
    updateNodes(nodes.filter(n => n.id !== selectedNode.id));
    updateTransitions(transitions.filter(t => t.fromId !== selectedNode.id && t.toId !== selectedNode.id));
    document.getElementById(selectedNode.id).remove();
    
    renderTransitions();
    updateTransitionsList();
    closeModal();
    saveToHistory();
}

function deleteTransition() {
    if (!selectedTransition) return;
    
    updateTransitions(transitions.filter(t => t.id !== selectedTransition.id));
    renderTransitions();
    updateTransitionsList();
    closeModal();
    saveToHistory();
}

function updateTransitionsList() {
    const container = document.getElementById('transitionsContainer');
    container.innerHTML = '';
    
    transitions.forEach(transition => {
        const fromNode = nodes.find(n => n.id === transition.fromId);
        const toNode = nodes.find(n => n.id === transition.toId);
        if (!fromNode || !toNode) return;
        
        const item = document.createElement('div');
        const isEdit = transition.isEditAction;
        item.className = `transition-item ${transition.actionFields && transition.actionFields.length > 0 ? 'has-action' : ''}`;
        
        let actionInfo = '';
        if (!isEdit && transition.actionFields && transition.actionFields.length > 0) {
            actionInfo = `<br><small>Collects ${transition.actionFields.length} fields</small>`;
        }
        
        const editIcon = isEdit ? '[Edit] ' : '';
        const actionType = isEdit ? 'Edit in place' : `${fromNode.title} → ${toNode.title}`;
        
        item.innerHTML = `
            <strong>${editIcon}${transition.buttonLabel}</strong><br>
            <small>${actionType}</small><br>
            <small>Roles: ${transition.allowedRoles.join(', ')}</small>${actionInfo}
        `;
        item.addEventListener('click', () => editTransition(transition));
        container.appendChild(item);
    });
    
    // Update action overview bar if it's visible
    const actionOverviewBar = document.getElementById('actionOverviewBar');
    if (actionOverviewBar && actionOverviewBar.style.display !== 'none') {
        updateActionOverview();
    }
}

/**
 * Create forms for start stages and actions
 */
async function createWorkflowForms(workflowId, stageIdMap) {
    // Create forms for start stages with form fields
    for (const node of nodes) {
        if (node.type === 'start' && node.formFields && node.formFields.length > 0) {
            const form = await workflowStorage.createFormWithFields({
                name: `${node.title} Initial Form`,
                description: `Initial form for ${node.title} stage`
            }, node.formFields);
            node.formId = form.id;
        }
    }
    
    // Create forms for actions with form fields
    for (const transition of transitions) {
        if (!transition.isEditAction && transition.actionFields && transition.actionFields.length > 0) {
            const form = await workflowStorage.createFormWithFields({
                name: `${transition.name} Action Form`,
                description: `Form for ${transition.name} action`
            }, transition.actionFields);
            transition.formId = form.id;
        }
    }
}

/**
 * Save workflow to database
 */
async function saveWorkflow() {
    // Show loading state
    const saveButton = document.querySelector('button[onclick="window.workflowBuilder.saveWorkflow()"]');
    const originalText = saveButton?.textContent;
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = 'Saving...';
    }
    
    try {
        // Debug logging
        console.log('saveWorkflow called with nodes:', nodes.length, 'transitions:', transitions.length);
        console.log('Current nodes:', nodes);
        
        // Basic validation first
        if (nodes.length === 0) {
            throw new Error('Workflow must have at least one stage');
        }
        
        const startNodes = nodes.filter(n => n.type === 'start');
        if (startNodes.length === 0) {
            throw new Error('Workflow must have exactly one start stage');
        }
        if (startNodes.length > 1) {
            throw new Error('Workflow can only have one start stage');
        }
        
        // Get workflow data from UI
        const workflowData = getWorkflowDataFromUI();
        
        if (!workflowData.name.trim()) {
            throw new Error('Workflow name is required');
        }
        
        // Validate that all nodes have valid keys
        for (const node of nodes) {
            if (!node.key || !node.key.trim()) {
                throw new Error(`Stage "${node.title}" must have a valid key`);
            }
            if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(node.key)) {
                throw new Error(`Stage key "${node.key}" must start with a letter and contain only letters, numbers, and underscores`);
            }
        }
        
        // Validate workflow data
        const validationErrors = workflowStorage.validateWorkflowData(
            workflowData, 
            convertNodesToStages(), 
            convertTransitionsToActions()
        );
        
        if (validationErrors.length > 0) {
            throw new Error('Validation failed: ' + validationErrors.join(', '));
        }

        let savedWorkflowId = workflowId;

        // Create or update workflow
        if (workflowId) {
            await workflowStorage.updateWorkflow(workflowId, workflowData);
        } else {
            const newWorkflow = await workflowStorage.createWorkflow(workflowData);
            savedWorkflowId = newWorkflow.id;
            workflowId = savedWorkflowId;
        }

        // Save stages and get stage ID mapping
        const stages = convertNodesToStages();
        const savedStages = await workflowStorage.saveWorkflowStages(savedWorkflowId, stages);
        
        // Create stage ID mapping for actions
        const stageIdMap = {};
        savedStages.forEach((savedStage, index) => {
            const originalStage = stages[index];
            stageIdMap[originalStage.stage_key] = savedStage.id;
            
            // Update node with database ID
            const node = nodes.find(n => n.key === originalStage.stage_key);
            if (node) node.dbId = savedStage.id;
        });

        // Create forms for start stages and actions
        await createWorkflowForms(savedWorkflowId, stageIdMap);

        // Save actions
        const actions = convertTransitionsToActions();
        await workflowStorage.saveWorkflowActions(savedWorkflowId, actions, stageIdMap);

        app.showNotification('success', 'Workflow Saved', 'Workflow saved successfully!');
        
        // Navigate back to workflows page
        setTimeout(() => {
            router.navigate(`project/${projectId}/workflows`);
        }, 1500);

    } catch (error) {
        console.error('Failed to save workflow:', error);
        
        // Handle specific database errors
        let errorMessage = error.message;
        if (error.code === '23505' && error.message.includes('workflows_project_id_name_key')) {
            errorMessage = 'A workflow with this name already exists. Please choose a different name.';
        }
        
        app.showNotification('error', 'Save Failed', 'Failed to save workflow: ' + errorMessage);
    } finally {
        // Restore button state
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = originalText || 'Save Workflow';
        }
    }
}

/**
 * Get workflow data from UI elements
 */
function getWorkflowDataFromUI() {
    return {
        name: document.getElementById('workflowName')?.value.trim() || '',
        description: document.getElementById('workflowDesc')?.value.trim() || '',
        workflow_type: document.getElementById('workflowType')?.value || 'incident',
        marker_color: document.getElementById('workflowColor')?.value || '#2563eb',
        is_active: true
    };
}

/**
 * Convert nodes to database stage format
 */
function convertNodesToStages() {
    return nodes.map((node, index) => ({
        stage_key: node.key,
        stage_name: node.title,
        stage_type: node.type,
        stage_order: index + 1,
        max_duration_hours: node.maxHours,
        visible_to_roles: node.allowedRoles || []
    }));
}

/**
 * Convert transitions to database action format
 */
function convertTransitionsToActions() {
    return transitions.map(transition => {
        const fromNode = nodes.find(n => n.id === transition.fromId);
        const toNode = nodes.find(n => n.id === transition.toId);
        
        return {
            from_stage_key: fromNode?.key,
            to_stage_key: toNode?.key,
            action_name: transition.name,
            action_type: transition.isEditAction ? 'edit' : 'forward',
            button_label: transition.buttonLabel,
            button_color: transition.buttonColor,
            form_id: transition.formId || null,
            allowed_roles: transition.allowedRoles || [],
            conditions: transition.conditions || {},
            requires_confirmation: transition.requiresConfirmation || false,
            confirmation_message: transition.confirmationMessage || null,
            editable_fields: transition.isEditAction ? (transition.editableFields || []) : []
        };
    });
}

// Workflow saving functionality is now handled by WorkflowStorage module

function showDataFlow() {
    const content = document.getElementById('dataFlowContent');
    let html = '<h4>Complete Workflow Data Flow</h4>';
    
    nodes.forEach(node => {
        html += `<div style="margin: 15px 0; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">`;
        html += `<strong>${node.title} (${node.key})</strong><br>`;
        
        if (node.formFields && node.formFields.length > 0) {
            html += `<small>Initial Fields (${node.formFields.length}):</small><br>`;
            node.formFields.forEach(field => {
                html += `<span style="color: #007bff; font-size: 11px;">• ${field.label}</span><br>`;
            });
        }
        
        const outgoingActions = transitions.filter(t => t.fromId === node.id);
        if (outgoingActions.length > 0) {
            html += `<div style="margin-top: 8px; font-size: 11px; color: #666;">`;
            html += `<strong>Available Actions:</strong><br>`;
            outgoingActions.forEach(action => {
                const addedFields = action.actionFields ? action.actionFields.length : 0;
                html += `• ${action.buttonLabel}${addedFields > 0 ? ` (+${addedFields} fields)` : ''}<br>`;
            });
            html += `</div>`;
        }
        
        html += '</div>';
    });
    
    content.innerHTML = html;
    showModal('dataFlowModal');
}

function exportJSON() {
    const workflow = {
        name: document.getElementById('workflowName').value,
        description: document.getElementById('workflowDesc').value,
        workflow_type: document.getElementById('workflowType').value,
        marker_color: document.getElementById('workflowColor').value,
        stages: nodes.map(node => ({
            stage_key: node.key,
            stage_name: node.title,
            stage_type: node.type,
            max_duration_hours: node.maxHours,
            allowed_roles: node.allowedRoles,
            initial_form_fields: node.type === 'start' ? node.formFields : [],
            position: { x: node.x, y: node.y }
        })),
        actions: transitions.map(t => {
            const fromNode = nodes.find(n => n.id === t.fromId);
            const toNode = nodes.find(n => n.id === t.toId);
            return {
                from_stage: fromNode.key,
                to_stage: toNode.key,
                action_name: t.name,
                button_label: t.buttonLabel,
                button_color: t.buttonColor,
                allowed_roles: t.allowedRoles,
                conditions: t.conditions,
                requires_confirmation: t.requiresConfirmation,
                confirmation_message: t.confirmationMessage,
                is_edit_action: t.isEditAction || false,
                data_collection_fields: t.actionFields || []
            };
        })
    };
    
    const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflow.name || 'workflow'}.json`;
    a.click();
}

function importFromText() {
    showModal('importModal');
    document.getElementById('importTextarea').value = '';
}

function processImport() {
    try {
        const jsonText = document.getElementById('importTextarea').value.trim();
        if (!jsonText) {
            app.showNotification('error', 'Import Error', 'Please paste workflow JSON first');
            return;
        }
        
        const workflow = JSON.parse(jsonText);
        importWorkflow(workflow);
        closeModal();
        app.showNotification('success', 'Import Success', 'Workflow imported successfully!');
    } catch (error) {
        app.showNotification('error', 'Import Error', 'Invalid JSON format');
        console.error('Import error:', error);
    }
}

function importWorkflow(workflow) {
    // Clear existing workflow
    updateNodes([]);
    updateTransitions([]);
    updateNodeCounter(0);
    
    // Set workflow info
    if (workflow.name) document.getElementById('workflowName').value = workflow.name;
    if (workflow.description) document.getElementById('workflowDesc').value = workflow.description;
    if (workflow.workflow_type) document.getElementById('workflowType').value = workflow.workflow_type;
    if (workflow.marker_color) {
        document.getElementById('workflowColor').value = workflow.marker_color;
        updateColorPreview();
    }
    
    // Import stages
    if (workflow.stages) {
        workflow.stages.forEach((stage, index) => {
            const id = `node_${++nodeCounter}`;
            // Clean and validate stage key
            let stageKey = stage.stage_key || `stage_${nodeCounter}`;
            stageKey = stageKey.toString().replace(/[\s\n\r]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
            if (stageKey && !/^[a-zA-Z]/.test(stageKey)) {
                stageKey = 'stage_' + stageKey;
            }
            
            const node = {
                id,
                type: stage.stage_type || 'stage',
                title: stage.stage_name || `Stage ${nodeCounter}`,
                key: stageKey,
                x: stage.position?.x || 100 + (index * 200),
                y: stage.position?.y || 100 + Math.floor(index / 3) * 150,
                maxHours: stage.max_duration_hours || 24,
                allowedRoles: stage.allowed_roles || ['technician'],
                formFields: stage.initial_form_fields || []
            };
            nodes.push(node);
        });
    }
    
    // Import actions
    if (workflow.actions) {
        workflow.actions.forEach(action => {
            const fromNode = nodes.find(n => n.key === action.from_stage);
            const toNode = nodes.find(n => n.key === action.to_stage);
            
            if (fromNode && toNode) {
                const id = `trans_${fromNode.id}_${toNode.id}`;
                const transition = {
                    id,
                    fromId: fromNode.id,
                    toId: toNode.id,
                    name: action.action_name || `${fromNode.title} → ${toNode.title}`,
                    buttonLabel: action.button_label || 'Next',
                    buttonColor: action.button_color || '#007bff',
                    allowedRoles: action.allowed_roles || ['technician'],
                    conditions: action.conditions || [],
                    requiresConfirmation: action.requires_confirmation || false,
                    confirmationMessage: action.confirmation_message || '',
                    isEditAction: action.is_edit_action || false,
                    actionFields: action.data_collection_fields || []
                };
                transitions.push(transition);
            }
        });
    }
    
    refreshCanvas();
    updateTransitionsList();
    saveToHistory();
}

function clearCanvas() {
    if (confirm('Clear entire workflow?')) {
        updateNodes([]);
        updateTransitions([]);
        updateNodeCounter(0);
        refreshCanvas();
        saveToHistory();
    }
}

function showModal(modalId) {
    document.getElementById('overlay').style.display = 'block';
    document.getElementById(modalId).style.display = 'block';
}

function closeModal() {
    document.getElementById('overlay').style.display = 'none';
    document.querySelectorAll('.modal').forEach(modal => modal.style.display = 'none');
    updateSelectedNode(null);
    updateSelectedTransition(null);
}

// History management
function saveToHistory() {
    const currentState = {
        nodes: JSON.parse(JSON.stringify(nodes)),
        transitions: JSON.parse(JSON.stringify(transitions)),
        nodeCounter: nodeCounter
    };
    
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(currentState);
    
    if (newHistory.length > maxHistorySize) {
        newHistory.shift();
        updateHistory(newHistory);
    } else {
        updateHistory(newHistory);
        updateHistoryIndex(historyIndex + 1);
    }
    
    updateUndoRedoButtons();
}

function undo() {
    if (historyIndex > 0) {
        updateHistoryIndex(historyIndex - 1);
        restoreFromHistory();
    }
}

function redo() {
    if (historyIndex < history.length - 1) {
        updateHistoryIndex(historyIndex + 1);
        restoreFromHistory();
    }
}

function restoreFromHistory() {
    if (historyIndex >= 0 && historyIndex < history.length) {
        const state = history[historyIndex];
        updateNodes(JSON.parse(JSON.stringify(state.nodes)));
        updateTransitions(JSON.parse(JSON.stringify(state.transitions)));
        updateNodeCounter(state.nodeCounter);
        
        refreshCanvas();
        updateUndoRedoButtons();
    }
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    if (undoBtn) undoBtn.disabled = historyIndex <= 0;
    if (redoBtn) redoBtn.disabled = historyIndex >= history.length - 1;
}


/**
 * Update transition roles (legacy function for backward compatibility)
 */
function updateTransitionRoles(rolesString) {
    if (!selectedTransition) return;
    
    const roleNames = rolesString.split(',').map(r => r.trim()).filter(r => r);
    selectedTransition.allowedRoles = roleNames;
}

/**
 * Toggle settings section visibility
 */
function toggleSettingsSection() {
    const content = document.getElementById('settingsSectionContent');
    const btn = document.getElementById('settingsSectionBtn');
    
    if (!content || !btn) return;
    
    const isMinimized = content.style.display === 'none';
    
    if (isMinimized) {
        content.style.display = 'block';
        btn.textContent = '−';
        btn.title = 'Minimize';
    } else {
        content.style.display = 'none';
        btn.textContent = '+';
        btn.title = 'Expand';
    }
}

/**
 * Toggle actions section visibility
 */
function toggleActionsSection() {
    const content = document.getElementById('actionsSectionContent');
    const btn = document.getElementById('actionsSectionBtn');
    
    if (!content || !btn) return;
    
    const isMinimized = content.style.display === 'none';
    
    if (isMinimized) {
        content.style.display = 'block';
        btn.textContent = '−';
        btn.title = 'Minimize';
    } else {
        content.style.display = 'none';
        btn.textContent = '+';
        btn.title = 'Expand';
    }
}

/**
 * Toggle action overview bar visibility
 */
function toggleActionOverview() {
    const bar = document.getElementById('actionOverviewBar');
    if (!bar) return;
    
    const isVisible = bar.style.display !== 'none';
    
    if (isVisible) {
        bar.style.display = 'none';
    } else {
        bar.style.display = 'block';
        updateActionOverview();
    }
}

/**
 * Update action overview with current transitions
 */
function updateActionOverview() {
    const actionCount = document.getElementById('actionCount');
    const actionList = document.getElementById('actionOverviewList');
    
    if (!actionCount || !actionList) return;
    
    // Update action count
    actionCount.textContent = `${transitions.length} actions`;
    
    // Clear existing items
    actionList.innerHTML = '';
    
    // Add action items
    transitions.forEach((transition) => {
        const fromNode = nodes.find(n => n.id === transition.fromId);
        const toNode = nodes.find(n => n.id === transition.toId);
        if (!fromNode || !toNode) return;
        
        const item = document.createElement('div');
        const hasActionFields = transition.actionFields && transition.actionFields.length > 0;
        item.className = `action-overview-item ${hasActionFields ? 'has-action' : ''}`;
        item.dataset.transitionId = transition.id;
        
        let actionInfo = '';
        if (hasActionFields) {
            actionInfo = ` (+${transition.actionFields.length})`;
        }
        
        const editIcon = transition.isEditAction ? '[Edit] ' : '';
        item.textContent = `${editIcon}${transition.buttonLabel}${actionInfo}`;
        
        // Add click handler to edit transition
        item.addEventListener('click', () => editTransition(transition));
        
        // Add hover handlers for highlighting
        item.addEventListener('mouseenter', () => highlightTransitionOnCanvas(transition.id));
        item.addEventListener('mouseleave', () => clearTransitionHighlight());
        
        actionList.appendChild(item);
    });
}

/**
 * Highlight a specific transition on the canvas
 */
function highlightTransitionOnCanvas(transitionId) {
    // Clear any existing highlights
    clearTransitionHighlight();
    
    // Find the transition elements on canvas
    const canvas = document.getElementById('canvas');
    const transitionElements = canvas.querySelectorAll('.transition, .transition-label, .edit-action');
    
    transitionElements.forEach(element => {
        // Check if this element belongs to the highlighted transition
        // We'll use a data attribute or class to identify transitions
        if (element.dataset && element.dataset.transitionId === transitionId) {
            element.classList.add('highlighted');
        }
    });
}

/**
 * Clear all transition highlights
 */
function clearTransitionHighlight() {
    const canvas = document.getElementById('canvas');
    const highlightedElements = canvas.querySelectorAll('.highlighted');
    highlightedElements.forEach(element => {
        element.classList.remove('highlighted');
    });
}

/**
 * Show workflow type selection modal
 */
function showWorkflowTypeSelection() {
    // Set up event listeners for workflow type options
    const options = document.querySelectorAll('.workflow-type-option');
    options.forEach(option => {
        option.addEventListener('click', () => {
            // Remove previous selections
            options.forEach(opt => opt.classList.remove('selected'));
            // Select this option
            option.classList.add('selected');
            
            const workflowType = option.dataset.type;
            
            // Auto-proceed after selection
            setTimeout(() => {
                selectWorkflowType(workflowType);
            }, 500);
        });
    });
    
    showModal('workflowTypeModal');
}

/**
 * Select workflow type and set up initial workflow
 */
function selectWorkflowType(type) {
    // Set workflow type in the UI
    const workflowTypeSelect = document.getElementById('workflowType');
    if (workflowTypeSelect) {
        workflowTypeSelect.value = type;
    }
    
    // Set workflow name based on type
    const workflowNameInput = document.getElementById('workflowName');
    if (workflowNameInput) {
        workflowNameInput.value = type === 'incident' ? 'New Incident Workflow' : 'New Survey Workflow';
    }
    
    // Close the modal
    closeModal();
    
    // Show notification with next steps
    app.showNotification('info', 'Workflow Type Selected', 'Drag a "Start" node from the toolbox to begin.');
    
    // Update the toolbar to show the workflow type
    updateWorkflowTypeDisplay(type);
}

/**
 * Update workflow type display in toolbar
 */
function updateWorkflowTypeDisplay(type) {
    // Remove existing type indicator
    const existingIndicator = document.querySelector('.workflow-type-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    // Add new type indicator
    const typeIndicator = document.createElement('div');
    typeIndicator.className = 'workflow-type-indicator';
    typeIndicator.innerHTML = `
        <span class="type-icon">${type === 'incident' ? '📍' : '📋'}</span>
        <span class="type-text">${type === 'incident' ? 'Incident' : 'Survey'}</span>
    `;
    
    // Find the title input and its parent section
    const titleInput = document.querySelector('.workflow-title-input');
    if (titleInput && titleInput.parentElement) {
        // Insert before the title input in the correct parent section
        titleInput.parentElement.insertBefore(typeIndicator, titleInput);
    }
}

/**
 * Show help tooltip
 */
function showHelp(element) {
    const tooltip = element.querySelector('.help-tooltip');
    if (tooltip) {
        tooltip.classList.add('show');
    }
}

/**
 * Hide help tooltip
 */
function hideHelp() {
    const tooltip = document.querySelector('.help-tooltip');
    if (tooltip) {
        tooltip.classList.remove('show');
    }
}

// Setup canvas callbacks
function setupCanvasCallbacks() {
    if (workflowCanvas) {
        workflowCanvas.setCallbacks({
            onNodeMove: (nodeId, x, y) => {
                const node = nodes.find(n => n.id === nodeId);
                if (node) {
                    node.x = x;
                    node.y = y;
                    renderTransitions();
                }
            },
            onNodeSelect: (nodeId) => {
                const node = nodes.find(n => n.id === nodeId);
                if (node) {
                    editNode(node);
                }
            }
        });
    }
}

// =====================================================
// ZOOM AND PAN CONTROLS
// =====================================================

/**
 * Zoom in
 */
function zoomIn() {
    if (workflowCanvas) {
        workflowCanvas.zoom = Math.min(workflowCanvas.zoom + 0.2, 3);
        workflowCanvas.applyTransform();
        workflowCanvas.updateMinimap();
    }
}

/**
 * Zoom out
 */
function zoomOut() {
    if (workflowCanvas) {
        workflowCanvas.zoom = Math.max(workflowCanvas.zoom - 0.2, 0.2);
        workflowCanvas.applyTransform();
        workflowCanvas.updateMinimap();
    }
}

/**
 * Reset zoom and pan
 */
function resetZoom() {
    if (workflowCanvas) {
        workflowCanvas.resetView();
    }
}

/**
 * Fit all nodes to view
 */
function fitToView() {
    if (workflowCanvas) {
        workflowCanvas.fitToView();
    }
}

// Make logic functions globally accessible
window.workflowLogic = {
    loadExistingWorkflow,
    renderErrorPage,
    initializeWorkflowBuilder,
    setupCanvasCallbacks,
    showWorkflowTypeSelection
};

// Export all necessary functions to make them available globally
export {
    loadExistingWorkflow,
    renderErrorPage,
    initializeWorkflowBuilder,
    setupCanvasCallbacks,
    undo,
    redo,
    saveWorkflow,
    exportJSON,
    importFromText,
    processImport,
    clearCanvas,
    showDataFlow,
    saveNode,
    deleteNode,
    saveTransition,
    deleteTransition,
    toggleActionSections,
    closeModal,
    toggleSettingsSection,
    toggleActionsSection,
    toggleActionOverview,
    selectWorkflowType,
    showHelp,
    hideHelp,
    updateTransitionRoles,
    showWorkflowTypeSelection,
    zoomIn,
    zoomOut,
    resetZoom,
    fitToView
};