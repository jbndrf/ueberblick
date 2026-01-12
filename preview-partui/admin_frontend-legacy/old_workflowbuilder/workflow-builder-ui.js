/**
 * Workflow Builder UI Component
 * Visual workflow design interface with modular architecture
 * UI components, styles, and visual structure
 */

import DebugLogger from '../core/debug-logger.js';
import { supabaseClient } from '../core/supabase.js';
import Utils from '../core/utils.js';
import router from '../core/router.js';
import app from '../core/app.js';
import WorkflowStorage from '../components/workflow-storage.js';
import FormBuilder from '../components/form-builder.js';
import RoleSelector from '../components/role-selector.js';
import WorkflowCanvas from '../components/workflow-canvas.js';
import WorkflowNodes from '../components/workflow-nodes.js';

const logger = new DebugLogger('WorkflowBuilderUI');

// Core workflow data - these will be shared across modules
export let nodes = [];
export let transitions = [];
export let nodeCounter = 0;
export let selectedNode = null;
export let selectedTransition = null;
export let workflowId = null;
export let projectId = null;

// Module instances
export let workflowStorage = null;
export let formBuilder = null;
export let nodeRoleSelector = null;
export let transitionRoleSelector = null;
export let workflowCanvas = null;
export let workflowNodes = null;

// UI state
export let isDragging = false;
export let dragOffset = { x: 0, y: 0 };
export let connectingFrom = null;

// History management
export let history = [];
export let historyIndex = -1;
export const maxHistorySize = 50;

// Project roles (loaded from database)
export let projectRoles = [];

/**
 * Load project roles from database
 */
export async function loadProjectRoles() {
    try {
        const { data: roles, error } = await supabaseClient.client
            .from('roles')
            .select('id, name, description')
            .eq('project_id', projectId)
            .order('name');
        
        if (error) throw error;
        projectRoles = roles || [];
    } catch (error) {
        logger.error('Failed to load project roles:', error);
        projectRoles = [];
    }
}

/**
 * Get default roles for a new stage (inherit from previous stage)
 */
export function getDefaultRolesForStage(stageType) {
    // For start stage, return empty array (will be set manually)
    if (stageType === 'start') {
        return [];
    }
    
    // Find the most recent stage to inherit roles from
    const existingStages = nodes.filter(node => node.type !== 'start');
    if (existingStages.length > 0) {
        // Get the most recently created stage
        const lastStage = existingStages[existingStages.length - 1];
        return [...(lastStage.allowedRoles || [])];
    }
    
    // If no existing stages, check if start node has roles
    const startNode = nodes.find(node => node.type === 'start');
    if (startNode && startNode.allowedRoles) {
        return [...startNode.allowedRoles];
    }
    
    return [];
}

/**
 * Get default roles for a new action (inherit from stage)
 */
export function getDefaultRolesForAction(fromNodeId) {
    const fromNode = nodes.find(node => node.id === fromNodeId);
    if (fromNode && fromNode.allowedRoles) {
        return [...fromNode.allowedRoles];
    }
    return [];
}

// Functions to update shared state from logic module
export function updateNodes(newNodes) {
    nodes.length = 0;
    nodes.push(...newNodes);
    // Update window reference for form builder access
    if (typeof window !== 'undefined') {
        window.nodes = nodes;
    }
}

export function updateTransitions(newTransitions) {
    transitions.length = 0;
    transitions.push(...newTransitions);
}

export function updateNodeCounter(newCounter) {
    nodeCounter = newCounter;
}

export function updateSelectedNode(node) {
    selectedNode = node;
    // Update window reference for form builder access
    if (typeof window !== 'undefined') {
        window.selectedNode = node;
    }
}

export function updateSelectedTransition(transition) {
    selectedTransition = transition;
}

export function updateWorkflowId(id) {
    workflowId = id;
}

export function updateProjectId(id) {
    projectId = id;
}

export function updateWorkflowStorage(storage) {
    workflowStorage = storage;
}

export function updateFormBuilder(builder) {
    formBuilder = builder;
}

export function updateWorkflowCanvas(canvas) {
    workflowCanvas = canvas;
}

export function updateWorkflowNodes(wNodes) {
    workflowNodes = wNodes;
}

export function updateNodeRoleSelector(selector) {
    nodeRoleSelector = selector;
}

export function updateTransitionRoleSelector(selector) {
    transitionRoleSelector = selector;
}

export function updateHistory(newHistory) {
    history.length = 0;
    history.push(...newHistory);
}

export function updateHistoryIndex(newIndex) {
    historyIndex = newIndex;
}

export function updateIsDragging(value) {
    isDragging = value;
}

export function updateDragOffset(offset) {
    dragOffset.x = offset.x;
    dragOffset.y = offset.y;
}

export function updateConnectingFrom(node) {
    connectingFrom = node;
}

export default async function WorkflowBuilderPage(route, context = {}) {
    // Debug: Verify all imports are successful
    logger.info('=== WORKFLOW BUILDER IMPORTS CHECK ===');
    logger.info('supabaseClient:', typeof supabaseClient);
    logger.info('Utils:', typeof Utils);
    logger.info('router:', typeof router);
    logger.info('app:', typeof app);
    logger.info('WorkflowStorage:', typeof WorkflowStorage);
    logger.info('FormBuilder:', typeof FormBuilder);
    logger.info('RoleSelector:', typeof RoleSelector);
    logger.info('=== END IMPORTS CHECK ===');
    
    projectId = context.projectId;
    
    // Parse workflow ID from context parameters
    if (context.params && context.params.length > 0) {
        const workflowParam = context.params[0];
        if (workflowParam && workflowParam !== 'new') {
            workflowId = workflowParam;
        }
    } else {
        // Fallback parsing for backward compatibility
        const routePath = context?.path || route?.path || '';
        const pathSegments = routePath.split('/');
        if (pathSegments.length >= 4 && pathSegments[2] === 'workflow-builder') {
            const workflowParam = pathSegments[3];
            if (workflowParam && workflowParam !== 'new') {
                workflowId = workflowParam;
            }
        }
    }
    
    // Validate project context
    if (!projectId) {
        projectId = supabaseClient.getCurrentProjectId();
        if (!projectId) {
            return window.workflowLogic?.renderErrorPage?.('No project selected. Please navigate to a project first.') || 
                   '<div>Error: No project selected</div>';
        }
    }

    // Initialize modules
    workflowStorage = new WorkflowStorage(projectId);
    formBuilder = new FormBuilder(projectId);
    workflowNodes = new WorkflowNodes(projectId);
    
    // Initialize canvas after DOM is ready - wait for full page render
    setTimeout(() => {
        const initCanvas = () => {
            const canvasElement = document.getElementById('canvas');
            if (!canvasElement) {
                logger.info('Canvas element not found, retrying...');
                return false;
            }
            
            try {
                workflowCanvas = new WorkflowCanvas('canvas');
                window.workflowLogic?.setupCanvasCallbacks?.();
                
                // Initialize minimap after canvas is ready
                setTimeout(() => {
                    if (workflowCanvas) {
                        workflowCanvas.initializeMinimap();
                    }
                }, 100);
                
                logger.info('Canvas initialized successfully');
                return true;
            } catch (error) {
                logger.error('Canvas initialization failed:', error);
                return false;
            }
        };

        // Try to initialize, with retries
        let attempts = 0;
        const maxAttempts = 10;
        const retryInterval = setInterval(() => {
            attempts++;
            
            if (initCanvas() || attempts >= maxAttempts) {
                clearInterval(retryInterval);
                if (attempts >= maxAttempts) {
                    logger.error('Failed to initialize canvas after', maxAttempts, 'attempts');
                }
            }
        }, 200);
    }, 50);
    
    // Load project roles
    await loadProjectRoles();

    // Load existing workflow if editing
    if (workflowId) {
        try {
            await window.workflowLogic?.loadExistingWorkflow?.(workflowId);
        } catch (error) {
            logger.error('Failed to load workflow:', error);
            app.showNotification('error', 'Load Failed', 'Failed to load workflow: ' + error.message);
        }
    }

    // Initialize after DOM is ready
    setTimeout(() => {
        window.workflowLogic?.initializeWorkflowBuilder?.();
        
        // Show workflow type selection for new workflows
        if (!workflowId) {
            window.workflowLogic?.showWorkflowTypeSelection?.();
        }
    }, 100);

    return `
        <div class="workflow-builder-page">
            <!-- Top Toolbar -->
            <div class="workflow-toolbar">
                <div class="toolbar-section">
                    <div class="toolbar-group">
                        <button onclick="window.workflowBuilder.saveWorkflow()" class="toolbar-btn primary" title="Save Workflow">
                            Save
                        </button>
                        <button onclick="window.workflowBuilder.exportJSON()" class="toolbar-btn" title="Export as JSON">
                            Export
                        </button>
                        <button onclick="window.workflowBuilder.importFromText()" class="toolbar-btn" title="Import from JSON">
                            Import
                        </button>
                    </div>
                    
                    <div class="toolbar-divider"></div>
                    
                    <div class="toolbar-group">
                        <button onclick="window.workflowBuilder.undo()" id="undoBtn" class="toolbar-btn" title="Undo" disabled>
                            ↶
                        </button>
                        <button onclick="window.workflowBuilder.redo()" id="redoBtn" class="toolbar-btn" title="Redo" disabled>
                            ↷
                        </button>
                    </div>
                    
                    <div class="toolbar-divider"></div>
                    
                    <div class="toolbar-group">
                        <button onclick="window.workflowBuilder.zoomIn()" class="toolbar-btn" title="Zoom In">
                            +
                        </button>
                        <button onclick="window.workflowBuilder.zoomOut()" class="toolbar-btn" title="Zoom Out">
                            −
                        </button>
                        <button onclick="window.workflowBuilder.resetZoom()" class="toolbar-btn" title="Reset Zoom">
                            ⌂
                        </button>
                        <button onclick="window.workflowBuilder.fitToView()" class="toolbar-btn" title="Fit to View">
                            ◐
                        </button>
                    </div>
                    
                    <div class="toolbar-divider"></div>
                    
                    <div class="toolbar-group">
                        <button onclick="window.workflowBuilder.toggleActionOverview()" class="toolbar-btn" title="Toggle Action Overview">
                            Actions Overview
                        </button>
                        <button onclick="window.workflowBuilder.showDataFlow()" class="toolbar-btn" title="Show Data Flow">
                            Data Flow
                        </button>
                        <button onclick="window.workflowBuilder.clearCanvas()" class="toolbar-btn danger" title="Clear Canvas">
                            Clear
                        </button>
                    </div>
                </div>
                
                <div class="toolbar-section">
                    <div class="workflow-title-input">
                        <input type="text" id="workflowName" placeholder="Workflow Name" value="New Workflow">
                    </div>
                    
                    <div class="help-box" onmouseenter="window.workflowBuilder.showHelp(this)" onmouseleave="window.workflowBuilder.hideHelp()">
                        <span class="help-icon">?</span>
                        <div class="help-tooltip" id="helpTooltip">
                            <h4>Instructions</h4>
                            <div class="help-item">
                                <strong>Add Nodes:</strong> Drag from left toolbox
                            </div>
                            <div class="help-item">
                                <strong>Edit Stage:</strong> Double-click node
                            </div>
                            <div class="help-item">
                                <strong>Connect Stages:</strong> Right-click first node, then click target
                            </div>
                            <div class="help-item">
                                <strong>Edit Action:</strong> Click transition label
                            </div>
                            <div class="help-item">
                                <strong>Move Nodes:</strong> Drag to reposition
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Expandable Action Overview Bar -->
            <div class="action-overview-bar" id="actionOverviewBar" style="display: none;">
                <div class="action-overview-content">
                    <div class="action-overview-title">
                        <h4>Action Overview</h4>
                        <span class="action-count" id="actionCount">0 actions</span>
                    </div>
                    <div class="action-overview-list" id="actionOverviewList">
                        <!-- Actions will be populated here -->
                    </div>
                </div>
            </div>

            <div class="workflow-builder-container">
                <!-- Left Sidebar -->
                <div class="workflow-left-sidebar">
                    <!-- Toolbox Section -->
                    <div class="sidebar-section">
                        <div class="section-header">
                            <h4>Add Nodes</h4>
                        </div>
                        <div class="section-content">
                            <div class="drag-item" draggable="true" data-type="start">
                                Start
                            </div>
                            <div class="drag-item" draggable="true" data-type="stage">
                                Stage
                            </div>
                            <div class="drag-item" draggable="true" data-type="end">
                                End
                            </div>
                        </div>
                    </div>

                    <!-- Actions Overview Section -->
                    <div class="sidebar-section">
                        <div class="section-header">
                            <h4>Actions</h4>
                            <button onclick="window.workflowBuilder.toggleActionsSection()" class="minimize-btn" id="actionsSectionBtn">−</button>
                        </div>
                        <div class="section-content" id="actionsSectionContent">
                            <div id="transitionsList">
                                <div id="transitionsContainer"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Settings Section -->
                    <div class="sidebar-section">
                        <div class="section-header">
                            <h4>Settings</h4>
                            <button onclick="window.workflowBuilder.toggleSettingsSection()" class="minimize-btn" id="settingsSectionBtn">−</button>
                        </div>
                        <div class="section-content" id="settingsSectionContent">
                            <div class="setting-row">
                                <label>Description:</label>
                                <textarea id="workflowDesc" placeholder="Workflow description"></textarea>
                            </div>
                            
                            <div class="setting-row">
                                <label>Type:</label>
                                <select id="workflowType">
                                    <option value="incident">Incident Workflow</option>
                                    <option value="survey">Survey Workflow</option>
                                </select>
                            </div>
                            
                            <div class="setting-row">
                                <label>Marker Color:</label>
                                <div class="color-picker-section">
                                    <input type="color" id="workflowColor" value="#2563eb">
                                    <div id="colorPreview" class="color-preview"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="workflow-canvas" id="canvas"></div>
            </div>

            <!-- Modals -->
            <div class="overlay" id="overlay"></div>

            <!-- Stage Configuration Modal -->
            <div class="modal" id="nodeModal">
                <h3>Configure Stage</h3>
                <input type="text" id="nodeTitle" placeholder="Stage Title">
                <input type="text" id="nodeKey" placeholder="Stage Key (e.g., 'reported')">
                <select id="nodeType">
                    <option value="start">Start Stage</option>
                    <option value="intermediate">Intermediate Stage</option>
                    <option value="end">End Stage</option>
                </select>
                <input type="number" id="maxHours" placeholder="Max Hours in Stage">
                <div id="allowedRoles"></div>
                
                <div class="section" id="startFormSection" style="display: none;">
                    <h4>Initial Form (Start Stage Only)</h4>
                    <p class="help-text">This form is shown when the workflow begins. Actions will add additional questions.</p>
                    <div id="formFields"></div>
                </div>
                
                <div class="modal-actions-reusable">
                    <button onclick="window.workflowBuilder.saveNode()" class="action-btn accept">Accept</button>
                    <button onclick="window.workflowBuilder.deleteNode()" class="action-btn delete">Delete</button>
                    <button onclick="window.workflowBuilder.closeModal()" class="action-btn cancel">Cancel</button>
                </div>
            </div>

            <!-- Action/Transition Configuration Modal -->
            <div class="modal" id="transitionModal">
                <h3>Configure Action</h3>
                <input type="text" id="transitionName" placeholder="Action Name">
                <input type="text" id="buttonLabel" placeholder="Button Label">
                <input type="color" id="buttonColor" value="#007bff">
                <div id="transitionRoles"></div>
                <textarea id="transitionConditions" placeholder="Prerequisites"></textarea>
                <label><input type="checkbox" id="requiresConfirmation"> Requires Confirmation</label>
                <label><input type="checkbox" id="isEditAction" onchange="window.workflowBuilder.toggleActionSections(this.checked)"> Edit Action (stays in same stage)</label>
                <textarea id="confirmationMessage" placeholder="Confirmation Message"></textarea>
                
                <div class="section" id="normalActionSection">
                    <h4>Data Collection During This Action</h4>
                    <p class="help-text">Questions added here will be filled when someone performs this action.</p>
                    <div id="actionFields"></div>
                </div>

                <div class="section" id="editActionSection" style="display: none;">
                    <h4>Editable Fields for This Role</h4>
                    <p class="help-text">Select which fields this role can edit.</p>
                    <div id="editableFields"></div>
                </div>
                
                <div class="data-flow-preview" id="actionDataPreview">
                    <strong>Data Available After This Action:</strong>
                    <div id="actionDataContent"></div>
                </div>
                
                <div class="modal-actions">
                    <button onclick="window.workflowBuilder.saveTransition()">Save Action</button>
                    <button onclick="window.workflowBuilder.deleteTransition()" class="btn-danger">Delete</button>
                    <button onclick="window.workflowBuilder.closeModal()">Cancel</button>
                </div>
            </div>

            <!-- Data Flow Preview Modal -->
            <div class="modal" id="dataFlowModal">
                <h3>Workflow Data Flow</h3>
                <div id="dataFlowContent"></div>
                <button onclick="window.workflowBuilder.closeModal()">Close</button>
            </div>

            <!-- Import Modal -->
            <div class="modal import-modal" id="importModal">
                <h3>Import Workflow</h3>
                <p>Paste your workflow JSON below:</p>
                <textarea id="importTextarea" class="import-textarea" placeholder="Paste workflow JSON here..."></textarea>
                <div class="modal-actions">
                    <button onclick="window.workflowBuilder.processImport()">Import</button>
                    <button onclick="window.workflowBuilder.closeModal()">Cancel</button>
                </div>
            </div>

            <!-- Workflow Type Selection Modal -->
            <div class="modal workflow-type-modal" id="workflowTypeModal">
                <h3>Select Workflow Type</h3>
                
                <div class="workflow-type-options">
                    <div class="workflow-type-option" data-type="incident">
                        <div class="option-icon">•</div>
                        <div class="option-content">
                            <h4>Incident Workflow</h4>
                            <p>Creates markers on the map for location-based incidents</p>
                        </div>
                    </div>
                    
                    <div class="workflow-type-option" data-type="survey">
                        <div class="option-icon">◊</div>
                        <div class="option-content">
                            <h4>Survey Workflow</h4>
                            <p>General data collection without map markers</p>
                        </div>
                    </div>
                </div>
                
                <div class="modal-actions">
                    <button onclick="window.workflowBuilder.closeModal()">Cancel</button>
                </div>
            </div>
        </div>
        
        <style>
            
            .workflow-builder-page {
                height: 100vh;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                margin: 0;
                padding: 0;
            }
            
            /* Override page container padding for workflow builder */
            .page-container:has(.workflow-builder-page) {
                padding: 0;
                max-width: none;
            }
            
            /* Top Toolbar Styles */
            .workflow-toolbar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: var(--color-bg-secondary, #f8f9fa);
                border-bottom: 1px solid var(--color-border, #e5e7eb);
                padding: 0.5rem 1rem;
                min-height: 50px;
                z-index: 100;
            }
            
            .toolbar-section {
                display: flex;
                align-items: center;
                gap: 1rem;
            }
            
            .toolbar-group {
                display: flex;
                align-items: center;
                gap: 0.25rem;
            }
            
            .toolbar-divider {
                width: 1px;
                height: 24px;
                background: var(--color-border, #e5e7eb);
                margin: 0 0.5rem;
            }
            
            .toolbar-btn {
                display: flex;
                align-items: center;
                gap: 0.375rem;
                padding: 0.5rem 0.75rem;
                background: white;
                border: 1px solid var(--color-border, #e5e7eb);
                border-radius: var(--border-radius, 4px);
                cursor: pointer;
                font-size: 0.875rem;
                transition: all 0.2s;
                white-space: nowrap;
            }
            
            .toolbar-btn:hover:not(:disabled) {
                background: var(--color-bg-hover, #f3f4f6);
                border-color: var(--color-primary, #2563eb);
            }
            
            .toolbar-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            .toolbar-btn.primary {
                background: var(--color-primary, #2563eb);
                color: white;
                border-color: var(--color-primary, #2563eb);
            }
            
            .toolbar-btn.primary:hover:not(:disabled) {
                background: #1d4ed8;
            }
            
            .toolbar-btn.danger {
                background: #fee2e2;
                color: #dc2626;
                border-color: #fecaca;
            }
            
            .toolbar-btn.danger:hover:not(:disabled) {
                background: #fecaca;
                border-color: #dc2626;
            }
            
            .help-box {
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 32px;
                height: 32px;
                background: white;
                border: 1px solid var(--color-border, #e5e7eb);
                border-radius: 50%;
                cursor: help;
                transition: all 0.2s;
            }
            
            .help-box:hover {
                background: var(--color-bg-hover, #f3f4f6);
                border-color: var(--color-primary, #2563eb);
            }
            
            .help-icon {
                font-size: 0.875rem;
                font-weight: bold;
                color: var(--color-text-secondary, #6b7280);
            }
            
            .help-tooltip {
                position: absolute;
                top: 100%;
                right: 0;
                margin-top: 8px;
                background: white;
                border: 1px solid var(--color-border, #e5e7eb);
                border-radius: var(--border-radius, 4px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                padding: 1rem;
                min-width: 280px;
                z-index: 1000;
                opacity: 0;
                visibility: hidden;
                transform: translateY(-8px);
                transition: all 0.2s;
            }
            
            .help-tooltip.show {
                opacity: 1;
                visibility: visible;
                transform: translateY(0);
            }
            
            .help-tooltip h4 {
                margin: 0 0 0.75rem 0;
                font-size: 0.875rem;
                color: var(--color-text-primary);
            }
            
            .help-item {
                margin-bottom: 0.5rem;
                font-size: 0.75rem;
                line-height: 1.4;
            }
            
            .help-item strong {
                color: var(--color-text-primary);
            }
            
            .workflow-title-input {
                margin-right: 1rem;
            }
            
            .workflow-title-input input {
                padding: 0.5rem 0.75rem;
                border: 1px solid var(--color-border, #e5e7eb);
                border-radius: var(--border-radius, 4px);
                background: white;
                min-width: 200px;
                font-weight: 500;
            }
            
            .workflow-type-indicator {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.5rem 0.75rem;
                background: var(--color-bg-secondary, #f8f9fa);
                border: 1px solid var(--color-border, #e5e7eb);
                border-radius: var(--border-radius, 4px);
                font-size: 0.875rem;
                color: var(--color-text-secondary, #6b7280);
            }
            
            .workflow-type-indicator .type-icon {
                font-size: 1rem;
            }
            
            .workflow-type-indicator .type-text {
                font-weight: 500;
            }
            
            /* Action Overview Bar */
            .action-overview-bar {
                background: white;
                border-bottom: 1px solid var(--color-border, #e5e7eb);
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                z-index: 90;
            }
            
            .action-overview-content {
                padding: 1rem;
                max-height: 200px;
                overflow-y: auto;
            }
            
            .action-overview-title {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 0.75rem;
                padding-bottom: 0.5rem;
                border-bottom: 1px solid var(--color-border, #e5e7eb);
            }
            
            .action-overview-title h4 {
                margin: 0;
                font-size: 0.875rem;
                font-weight: 600;
                color: var(--color-text-primary);
            }
            
            .action-count {
                font-size: 0.75rem;
                color: var(--color-text-secondary, #6b7280);
                background: var(--color-bg-secondary, #f8f9fa);
                padding: 0.25rem 0.5rem;
                border-radius: 1rem;
            }
            
            .action-overview-list {
                display: flex;
                flex-wrap: wrap;
                gap: 0.5rem;
            }
            
            .action-overview-item {
                background: var(--color-bg-secondary, #f8f9fa);
                border: 1px solid var(--color-border, #e5e7eb);
                border-radius: var(--border-radius, 4px);
                padding: 0.5rem 0.75rem;
                font-size: 0.75rem;
                cursor: pointer;
                transition: all 0.2s;
                white-space: nowrap;
            }
            
            .action-overview-item:hover {
                background: #f0f9ff;
                border-color: #2563eb;
                box-shadow: 0 2px 4px rgba(37, 99, 235, 0.15);
            }
            
            .action-overview-item.has-action {
                background: #e8f5e8;
                border-color: #4CAF50;
            }
            
            .action-overview-item.has-action:hover {
                background: #dcfce7;
                border-color: #16a34a;
            }
            
            .action-overview-item.highlighted {
                background: #fef3c7;
                border-color: #f59e0b;
                box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
            }
            
            .workflow-builder-container {
                display: flex;
                flex: 1;
                overflow: hidden;
            }
            
            /* Left Sidebar */
            .workflow-left-sidebar {
                width: 250px;
                background: white;
                border-right: 1px solid var(--color-border, #e5e7eb);
                display: flex;
                flex-direction: column;
                overflow-y: auto;
            }
            
            .sidebar-section {
                border-bottom: 1px solid var(--color-border, #e5e7eb);
            }
            
            .section-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 0.75rem 1rem;
                background: var(--color-bg-secondary, #f8f9fa);
                border-bottom: 1px solid var(--color-border, #e5e7eb);
            }
            
            .section-header h4 {
                margin: 0;
                font-size: 0.875rem;
                font-weight: 600;
                color: var(--color-text-primary);
            }
            
            .section-content {
                padding: 1rem;
            }
            
            .minimize-btn {
                background: none;
                border: none;
                font-size: 1.2rem;
                cursor: pointer;
                padding: 0.25rem;
                border-radius: 3px;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .minimize-btn:hover {
                background: var(--color-bg-hover, #f3f4f6);
            }
            
            .setting-row {
                margin-bottom: 1rem;
            }
            
            .setting-row label {
                display: block;
                margin-bottom: 0.5rem;
                font-weight: 500;
                font-size: 0.875rem;
                color: var(--color-text-secondary, #6b7280);
            }
            
            .setting-row input,
            .setting-row textarea,
            .setting-row select {
                width: 100%;
                padding: 0.5rem;
                border: 1px solid var(--color-border, #e5e7eb);
                border-radius: var(--border-radius, 4px);
                font-size: 0.875rem;
                background: white;
            }
            
            .setting-row textarea {
                min-height: 80px;
                resize: vertical;
            }
            
            .color-picker-section {
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            .color-picker-section input[type="color"] {
                width: 40px;
                height: 40px;
                padding: 0;
                border: 1px solid var(--color-border);
                border-radius: var(--border-radius);
                cursor: pointer;
            }
            
            .color-preview {
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: #2563eb;
                border: 2px solid var(--color-border);
            }
            
            .instructions {
                margin-bottom: 1rem;
            }
            
            
            .workflow-canvas {
                flex: 1;
                position: relative;
                background: #fff;
                overflow: hidden;
                min-height: 100%;
                cursor: grab;
            }
            
            .workflow-canvas:active {
                cursor: grabbing;
            }

            /* Minimap Styles */
            .canvas-minimap {
                position: absolute;
                bottom: 20px;
                right: 20px;
                width: 200px;
                height: 150px;
                background: rgba(255, 255, 255, 0.95);
                border: 2px solid var(--color-border, #e5e7eb);
                border-radius: var(--border-radius, 4px);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                z-index: 1000;
                cursor: pointer;
                overflow: hidden;
            }

            .minimap-viewport {
                position: absolute;
                border: 2px solid var(--color-primary, #2563eb);
                background: rgba(37, 99, 235, 0.2);
                pointer-events: none;
                min-width: 4px;
                min-height: 4px;
            }

            .minimap-node {
                position: absolute;
                width: 8px;
                height: 6px;
                border-radius: 2px;
                border: 1px solid #333;
                pointer-events: none;
            }
            
            .workflow-info {
                margin-bottom: 1.5rem;
                padding: 1rem;
                background: white;
                border-radius: var(--border-radius);
                border: 1px solid var(--color-border, #e5e7eb);
            }
            
            .workflow-info h3 {
                margin: 0 0 1rem 0;
                font-size: 1.1rem;
                color: var(--color-text-primary);
            }
            
            .workflow-info input,
            .workflow-info textarea,
            .workflow-info select {
                width: 100%;
                padding: 0.5rem;
                margin: 0.25rem 0;
                border: 1px solid var(--color-border, #e5e7eb);
                border-radius: var(--border-radius);
                font-size: 0.875rem;
            }
            
            .color-picker-section {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                margin: 0.5rem 0;
            }
            
            .color-label {
                font-size: 0.875rem;
                color: var(--color-text-secondary);
            }
            
            .color-preview {
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: #2563eb;
                border: 2px solid var(--color-border);
            }
            
            .drag-item {
                padding: 0.75rem;
                margin: 0.25rem 0;
                background: var(--color-bg-tertiary, #e5e7eb);
                cursor: grab;
                border-radius: var(--border-radius);
                font-size: 0.875rem;
                border: 1px solid var(--color-border);
                transition: background-color 0.2s;
                text-align: center;
            }
            
            .drag-item:hover {
                background: var(--color-bg-hover, #d1d5db);
            }
            
            .drag-item:active {
                cursor: grabbing;
            }
            
            #transitionsList h4 {
                margin: 0 0 0.75rem 0;
                font-size: 0.875rem;
                font-weight: 600;
                color: var(--color-text-primary);
                border-bottom: 1px solid var(--color-border);
                padding-bottom: 0.5rem;
            }
            
            /* Node styles */
            .node {
                position: absolute;
                border: 2px solid #333;
                padding: 0.75rem;
                background: white;
                cursor: move;
                min-width: 120px;
                border-radius: var(--border-radius);
                font-size: 0.875rem;
                box-shadow: var(--box-shadow);
            }
            
            .node.start { background: #90EE90; }
            .node.stage { background: #87CEEB; }
            .node.end { background: #FFB6C1; }
            
            /* Transition styles */
            .transition {
                position: absolute;
                height: 2px;
                background: #333;
                transform-origin: left center;
            }
            
            .transition.has-action { 
                background: #4CAF50; 
                height: 3px; 
            }
            
            .transition-label {
                position: absolute;
                background: #fff;
                padding: 0.25rem 0.5rem;
                font-size: 0.625rem;
                border: 1px solid #ccc;
                border-radius: 3px;
                transform: translate(-50%, -100%);
                margin-top: -5px;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .transition-label:hover {
                background: #f0f9ff;
                border-color: #2563eb;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                transform: translate(-50%, -100%) scale(1.05);
            }
            
            .transition-label.has-action {
                background: #e8f5e8;
                border-color: #4CAF50;
                font-weight: bold;
            }
            
            .transition-label.has-action:hover {
                background: #dcfce7;
                border-color: #16a34a;
            }
            
            /* Highlighted states for canvas elements */
            .transition.highlighted {
                background: #f59e0b !important;
                height: 4px !important;
                box-shadow: 0 0 8px rgba(245, 158, 11, 0.5);
            }
            
            .transition-label.highlighted {
                background: #fef3c7 !important;
                border-color: #f59e0b !important;
                box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
                transform: translate(-50%, -100%) scale(1.1) !important;
            }
            
            .edit-action.highlighted {
                background: #fef3c7 !important;
                border-color: #f59e0b !important;
                box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
                transform: scale(1.1);
            }
            
            .edit-action {
                position: absolute;
                width: 30px;
                height: 30px;
                border: 2px solid #ff9800;
                border-radius: 50%;
                background: #fff3e0;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-size: 14px;
                animation: rotate 2s linear infinite;
            }
            
            .edit-action:hover {
                background: #ffe0b2;
                border-color: #f57c00;
            }
            
            @keyframes rotate {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            
            /* Modal styles */
            .overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                display: none;
                z-index: 999;
            }
            
            .modal {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                border: 1px solid var(--color-border);
                padding: 1.5rem;
                display: none;
                z-index: 1000;
                max-width: 700px;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 10px 25px rgba(0,0,0,0.15);
                border-radius: var(--border-radius);
            }
            
            .modal h3 {
                margin: 0 0 1rem 0;
                color: var(--color-text-primary);
            }
            
            .modal input,
            .modal textarea,
            .modal select {
                width: 100%;
                padding: 0.5rem;
                margin: 0.25rem 0;
                border: 1px solid var(--color-border);
                border-radius: var(--border-radius);
                font-size: 0.875rem;
            }
            
            .modal label {
                display: block;
                margin: 0.5rem 0;
                font-size: 0.875rem;
                color: var(--color-text-secondary);
            }
            
            .modal label input[type="checkbox"] {
                width: auto;
                margin-right: 0.5rem;
            }
            
            .section {
                margin: 1rem 0;
                padding: 1rem;
                border: 1px solid var(--color-border);
                border-radius: var(--border-radius);
                background: var(--color-bg-secondary);
            }
            
            .section h4 {
                margin: 0 0 0.5rem 0;
                color: var(--color-text-primary);
            }
            
            .help-text {
                font-size: 0.75rem;
                color: var(--color-text-secondary);
                margin-bottom: 0.75rem;
            }
            
            .form-field {
                border: 1px solid var(--color-border);
                padding: 0.75rem;
                margin: 0.5rem 0;
                border-radius: var(--border-radius);
                background: #f9f9f9;
            }
            
            .field-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 0.5rem;
            }
            
            .field-type {
                font-weight: bold;
                color: var(--color-text-secondary);
                font-size: 0.875rem;
            }
            
            .remove-btn {
                background: #ff4444;
                color: white;
                border: none;
                padding: 0.25rem 0.5rem;
                border-radius: 3px;
                cursor: pointer;
                font-size: 0.75rem;
                margin-left: 0.25rem;
            }
            
            .add-field-btn {
                background: #4CAF50;
                color: white;
                padding: 0.75rem;
                width: 100%;
                border: none;
                border-radius: var(--border-radius);
                cursor: pointer;
                font-size: 0.875rem;
            }
            
            .modal-actions {
                display: flex;
                gap: 0.5rem;
                margin-top: 1.5rem;
                padding-top: 1rem;
                border-top: 1px solid var(--color-border);
            }
            
            .modal-actions button {
                padding: 0.75rem 1rem;
                border: 1px solid var(--color-border);
                border-radius: var(--border-radius);
                cursor: pointer;
                font-size: 0.875rem;
                background: var(--color-bg-secondary);
                transition: background-color 0.2s;
            }
            
            .modal-actions button:hover {
                background: var(--color-bg-hover);
            }
            
            .data-flow-preview {
                background: #f8f9fa;
                border: 1px solid #dee2e6;
                padding: 0.75rem;
                margin: 0.75rem 0;
                border-radius: var(--border-radius);
                font-size: 0.75rem;
                max-height: 200px;
                overflow-y: auto;
            }
            
            .inherited-field {
                color: #666;
                font-style: italic;
            }
            
            .new-field {
                color: #28a745;
                font-weight: bold;
            }
            
            .import-modal {
                max-width: 600px;
            }
            
            .import-textarea {
                width: 100%;
                height: 300px;
                font-family: monospace;
                font-size: 0.75rem;
            }
            
            /* Workflow Type Selection Modal */
            .workflow-type-modal {
                max-width: 800px;
                width: 90vw;
            }
            
            .workflow-type-options {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 1.5rem;
                margin: 1.5rem 0;
            }
            
            .workflow-type-option {
                border: 2px solid var(--color-border, #e5e7eb);
                border-radius: var(--border-radius, 4px);
                padding: 1.5rem;
                cursor: pointer;
                transition: all 0.2s;
                background: white;
            }
            
            .workflow-type-option:hover {
                border-color: var(--color-primary, #2563eb);
                box-shadow: 0 4px 12px rgba(37, 99, 235, 0.15);
                transform: translateY(-2px);
            }
            
            .workflow-type-option.selected {
                border-color: var(--color-primary, #2563eb);
                background: #f0f9ff;
            }
            
            .option-icon {
                font-size: 3rem;
                text-align: center;
                margin-bottom: 1rem;
            }
            
            .option-content h4 {
                margin: 0 0 0.5rem 0;
                font-size: 1.25rem;
                color: var(--color-text-primary);
                text-align: center;
            }
            
            .option-content p {
                font-size: 0.875rem;
                color: var(--color-text-secondary);
                line-height: 1.5;
                margin-bottom: 1rem;
                text-align: center;
            }
            
            
            .transition-item {
                background: #e8f4f8;
                border: 1px solid #4a90a4;
                margin: 0.5rem 0;
                padding: 0.75rem;
                border-radius: var(--border-radius);
                font-size: 0.75rem;
                cursor: pointer;
                transition: background-color 0.2s;
            }
            
            .transition-item:hover {
                background: #d4edda;
            }
            
            .transition-item.has-action {
                background: #e8f5e8;
                border-color: #4CAF50;
            }
            
        </style>
    `;
};