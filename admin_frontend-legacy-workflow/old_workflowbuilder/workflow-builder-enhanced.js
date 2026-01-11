/**
 * Enhanced Workflow Builder Page Component
 * Uses new session-based architecture while maintaining backward compatibility
 * Integrates all new core components
 */

import { supabaseClient } from '../core/supabase.js';
import Utils from '../core/utils.js';
import router from '../core/router.js';
import app from '../core/app.js';
import WorkflowBuilder from '../core/workflow-builder-main.js';
import DebugLogger from '../core/debug-logger.js';

const logger = new DebugLogger('WorkflowBuilderEnhanced');

// Global instance for backward compatibility
let workflowBuilderInstance = null;

// Legacy state variables for backward compatibility
export let nodes = [];
export let transitions = [];
export let nodeCounter = 0;
export let selectedNode = null;
export let selectedTransition = null;
export let workflowId = null;
export let projectId = null;
export let projectRoles = [];

// Legacy update functions for backward compatibility
export function updateNodes(newNodes) {
    nodes.length = 0;
    nodes.push(...newNodes);
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

// Legacy helper functions
export async function loadProjectRoles() {
    try {
        const { data: roles, error } = await supabaseClient.client
            .from('roles')
            .select('id, name, description')
            .eq('project_id', projectId)
            .order('name');
        
        if (error) throw error;
        projectRoles = roles || [];
        
        // Update state manager if available
        if (workflowBuilderInstance) {
            const stateManager = workflowBuilderInstance.getStateManager();
            if (stateManager) {
                stateManager.logicalState.projectRoles = projectRoles;
                stateManager.emit('projectRolesLoaded', projectRoles);
            }
        }
        
        return projectRoles;
    } catch (error) {
        console.error('Failed to load project roles:', error);
        projectRoles = [];
        return [];
    }
}

export function getDefaultRolesForStage(stageType) {
    if (stageType === 'start') {
        return [];
    }
    
    const existingStages = nodes.filter(node => node.type !== 'start');
    if (existingStages.length > 0) {
        const lastStage = existingStages[existingStages.length - 1];
        return [...(lastStage.allowedRoles || [])];
    }
    
    const startNode = nodes.find(node => node.type === 'start');
    if (startNode && startNode.allowedRoles) {
        return [...startNode.allowedRoles];
    }
    
    return [];
}

export function getDefaultRolesForAction(fromNodeId) {
    const fromNode = nodes.find(node => node.id === fromNodeId);
    if (fromNode && fromNode.allowedRoles) {
        return [...fromNode.allowedRoles];
    }
    return [];
}

// Debounce timer for legacy state synchronization to prevent race conditions
let legacySyncTimeout = null;
const LEGACY_SYNC_DEBOUNCE_MS = 100;

/**
 * Setup legacy compatibility bridge
 */
function setupLegacyCompatibility() {
    try {
        if (!workflowBuilderInstance) {
            console.warn('setupLegacyCompatibility: workflowBuilderInstance not available');
            return;
        }
        
        const stateManager = workflowBuilderInstance.getStateManager();
        if (!stateManager) {
            console.warn('setupLegacyCompatibility: stateManager not available');
            return;
        }
        
        // Debounced sync function to prevent excessive updates
        const debouncedSync = () => {
            if (legacySyncTimeout) {
                clearTimeout(legacySyncTimeout);
            }
            legacySyncTimeout = setTimeout(() => {
                try {
                    syncLegacyState();
                } catch (syncError) {
                    console.error('Legacy state sync failed:', syncError);
                }
            }, LEGACY_SYNC_DEBOUNCE_MS);
        };
        
        // Sync legacy state with new state manager (debounced)
        stateManager.on('stageUpdated', debouncedSync);
        stateManager.on('stageRemoved', debouncedSync);
        stateManager.on('actionUpdated', debouncedSync);
        stateManager.on('actionRemoved', debouncedSync);
        
        // Handle selection updates immediately (no debounce needed)
        stateManager.on('selectionUpdated', (data) => {
            try {
                if (data && typeof data === 'object') {
                    selectedNode = data.selectedNode || null;
                    selectedTransition = data.selectedTransition || null;
                }
            } catch (selectionError) {
                console.error('Failed to update legacy selection:', selectionError);
            }
        });
        
        // Handle metadata updates immediately
        stateManager.on('workflowMetadataUpdated', (data) => {
            try {
                if (data && typeof data === 'object') {
                    if (data.workflowId !== undefined) workflowId = data.workflowId;
                    if (data.projectId !== undefined) projectId = data.projectId;
                }
            } catch (metadataError) {
                console.error('Failed to update legacy metadata:', metadataError);
            }
        });
        
        // Initial sync
        setTimeout(() => {
            try {
                syncLegacyState();
            } catch (initialSyncError) {
                console.error('Initial legacy state sync failed:', initialSyncError);
            }
        }, 50);
        
        console.log('Legacy compatibility bridge setup complete');
    } catch (error) {
        console.error('Failed to setup legacy compatibility:', error);
    }
}

/**
 * Sync legacy state arrays with new state manager
 */
function syncLegacyState() {
    try {
        if (!workflowBuilderInstance) {
            console.warn('syncLegacyState: workflowBuilderInstance not available');
            return;
        }
        
        const stateManager = workflowBuilderInstance.getStateManager();
        if (!stateManager) {
            console.warn('syncLegacyState: stateManager not available');
            return;
        }
        
        // Check if required functions are available
        if (typeof stateManager.getAllStages !== 'function' || typeof stateManager.getAllActions !== 'function') {
            console.warn('syncLegacyState: required state manager methods not available');
            return;
        }
        
        // Convert stages to legacy nodes format
        const stages = stateManager.getAllStages();
        const legacyNodes = stages.map(stage => {
            try {
                const position = stateManager.getNodePosition ? stateManager.getNodePosition(stage.id) : { x: 0, y: 0 };
                return {
                    id: stage.id || '',
                    dbId: stage.dbId || null,
                    type: stage.type || 'intermediate',
                    title: stage.title || 'Untitled Stage',
                    key: stage.key || stage.id || '',
                    x: position.x || 0,
                    y: position.y || 0,
                    maxHours: stage.maxHours || 24,
                    allowedRoles: Array.isArray(stage.allowedRoles) ? stage.allowedRoles : [],
                    formId: stage.formId || null,
                    formFields: Array.isArray(stage.formFields) ? stage.formFields : []
                };
            } catch (stageError) {
                console.error('Error converting stage to legacy format:', stageError, stage);
                return null;
            }
        }).filter(Boolean); // Remove null entries
        
        // Convert actions to legacy transitions format
        const actions = stateManager.getAllActions();
        const legacyTransitions = actions.map(action => {
            try {
                return {
                    id: action.id || '',
                    dbId: action.dbId || null,
                    fromId: action.fromStageId || '',
                    toId: action.toStageId || '',
                    name: action.name || 'Untitled Action',
                    buttonLabel: action.buttonLabel || action.name || 'Action',
                    buttonColor: action.buttonColor || '#007bff',
                    allowedRoles: Array.isArray(action.allowedRoles) ? action.allowedRoles : [],
                    conditions: action.conditions || {},
                    requiresConfirmation: action.requiresConfirmation || false,
                    confirmationMessage: action.confirmationMessage || '',
                    isEditAction: action.isEditAction || false,
                    formId: action.formId || null
                };
            } catch (actionError) {
                console.error('Error converting action to legacy format:', actionError, action);
                return null;
            }
        }).filter(Boolean); // Remove null entries
        
        // Update legacy arrays with error handling
        try {
            if (typeof updateNodes === 'function') {
                updateNodes(legacyNodes);
            }
            if (typeof updateTransitions === 'function') {
                updateTransitions(legacyTransitions);
            }
        } catch (updateError) {
            console.error('Error updating legacy arrays:', updateError);
        }
        
        // Update counter safely
        try {
            if (stages.length > 0) {
                const counters = stages.map(s => {
                    if (!s.id) return 0;
                    const match = s.id.match(/\d+/);
                    return match ? parseInt(match[0]) : 0;
                });
                nodeCounter = Math.max(...counters, 0);
            }
        } catch (counterError) {
            console.error('Error updating node counter:', counterError);
        }
        
        console.log(`Legacy state synchronized: ${legacyNodes.length} nodes, ${legacyTransitions.length} transitions`);
    } catch (error) {
        console.error('Critical error in syncLegacyState:', error);
    }
}

export default async function WorkflowBuilderPage(route, context = {}) {
    console.log('=== ENHANCED WORKFLOW BUILDER LOADING ===');
    
    // Extract context information
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
            return '<div class="error-page"><h3>Error: No project selected</h3><p>Please navigate to a project first.</p></div>';
        }
    }

    console.log('Enhanced WorkflowBuilder - Project ID:', projectId, 'Workflow ID:', workflowId);

    // Initialize workflow builder after DOM is ready
    // Use a more reliable way to wait for DOM elements
    const initializeWhenReady = () => {
        // Check if the container element exists
        const container = document.getElementById('workflow-builder-container');
        if (container) {
            // Container exists, proceed with initialization
            initializeEnhancedWorkflowBuilder().catch(error => {
                console.error('Failed to initialize enhanced workflow builder:', error);
                if (app && app.showNotification) {
                    app.showNotification('error', 'Initialization Failed', 'Failed to initialize workflow builder: ' + error.message);
                }
            });
        } else {
            // Container doesn't exist yet, wait and try again
            setTimeout(initializeWhenReady, 50);
        }
    };
    
    // Start the initialization check
    setTimeout(initializeWhenReady, 100);

    // Return the same HTML as the original for backward compatibility
    return `
        <div class="workflow-builder-page">
            <!-- Top Toolbar -->
            <div class="workflow-toolbar">
                <div class="toolbar-section">
                    <div class="toolbar-group">
                        <button onclick="window.workflowBuilder.saveWorkflow()" class="toolbar-btn primary" title="Save Workflow">
                            Save
                        </button>
                        <button onclick="window.workflowBuilder.createSnapshot()" class="toolbar-btn" title="Create Snapshot">
                            Snapshot
                        </button>
                        <button onclick="showSnapshotMenu()" class="toolbar-btn" title="Manage Snapshots">
                            Snapshots ▼
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
                            ⬚
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

            <div class="workflow-builder-container" id="workflow-builder-container">
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
                
                <div class="modal-actions-reusable">
                    <button onclick="window.workflowBuilder.saveTransition()" class="action-btn accept">Accept</button>
                    <button onclick="window.workflowBuilder.deleteTransition()" class="action-btn delete">Delete</button>
                    <button onclick="window.workflowBuilder.closeModal()" class="action-btn cancel">Cancel</button>
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
                        <div class="option-icon">📍</div>
                        <div class="option-content">
                            <h4>Incident Workflow</h4>
                            <p>Creates markers on the map for location-based incidents</p>
                        </div>
                    </div>
                    
                    <div class="workflow-type-option" data-type="survey">
                        <div class="option-icon">📋</div>
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

            <!-- Snapshot Management Modal -->
            <div class="modal" id="snapshotModal">
                <h3>Manage Snapshots</h3>
                <div class="snapshot-controls">
                    <input type="text" id="snapshotName" placeholder="Snapshot name (optional)">
                    <button onclick="createNamedSnapshot()" class="toolbar-btn primary">Create Snapshot</button>
                </div>
                <div class="snapshots-list" id="snapshotsList">
                    <!-- Snapshots will be populated here -->
                </div>
                <div class="modal-actions">
                    <button onclick="window.workflowBuilder.closeModal()">Close</button>
                </div>
            </div>

            <!-- Session Recovery Modal -->
            <div class="modal" id="sessionRecoveryModal">
                <h3>Unsaved Changes Detected</h3>
                <p>We found unsaved changes from your previous session. Would you like to recover them?</p>
                <div class="session-recovery-info" id="sessionRecoveryInfo">
                    <!-- Session info will be populated here -->
                </div>
                <div class="modal-actions">
                    <button onclick="recoverSession()" class="toolbar-btn primary">Recover Changes</button>
                    <button onclick="dismissRecovery()" class="toolbar-btn">Start Fresh</button>
                </div>
            </div>

            <!-- Snapshot Dropdown Menu -->
            <div class="dropdown-menu" id="snapshotDropdown" style="display: none;">
                <div class="dropdown-content">
                    <div class="dropdown-item" onclick="window.workflowBuilder.createSnapshot()">
                        Create Snapshot
                    </div>
                    <div class="dropdown-divider"></div>
                    <div class="dropdown-section" id="snapshotDropdownList">
                        <!-- Recent snapshots will be populated here -->
                    </div>
                    <div class="dropdown-divider"></div>
                    <div class="dropdown-item" onclick="showSnapshotModal()">
                        Manage All Snapshots
                    </div>
                </div>
            </div>

            <!-- Notification Container -->
            <div id="notification-container" class="notification-container"></div>
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

            /* Notification System */
            .notification-container {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                max-width: 400px;
            }

            .notification {
                background: white;
                border: 1px solid var(--color-border, #e5e7eb);
                border-radius: var(--border-radius, 4px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                margin-bottom: 0.5rem;
                padding: 1rem;
                animation: slideIn 0.3s ease-out;
            }

            .notification-success {
                border-left: 4px solid #10b981;
            }

            .notification-error {
                border-left: 4px solid #ef4444;
            }

            .notification-warning {
                border-left: 4px solid #f59e0b;
            }

            .notification-info {
                border-left: 4px solid #3b82f6;
            }

            .notification-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 0.5rem;
            }

            .notification-close {
                background: none;
                border: none;
                font-size: 1.2rem;
                cursor: pointer;
                color: var(--color-text-secondary);
            }

            .notification-message {
                font-size: 0.875rem;
                color: var(--color-text-secondary);
            }

            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }

            /* Rest of the styles from original file... */
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

            /* Drag items */
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

            /* Transitions list */
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
            .node.selected { 
                border-color: var(--color-primary, #2563eb);
                box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
            }
            
            /* Transition styles */
            .transition {
                position: absolute;
                height: 2px;
                background: #333;
                transform-origin: left center;
                z-index: 1;
            }
            
            .transition.has-action { 
                background: #4CAF50; 
                height: 3px; 
            }

            .transition.selected {
                background: var(--color-primary, #2563eb) !important;
                height: 4px !important;
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
                z-index: 10;
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

            .transition-label.selected {
                background: #f0f9ff !important;
                border-color: var(--color-primary, #2563eb) !important;
                box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
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

            .modal-actions-reusable {
                display: flex;
                gap: 0.5rem;
                margin-top: 1.5rem;
                padding-top: 1rem;
                border-top: 1px solid var(--color-border);
            }
            
            .action-btn {
                padding: 0.75rem 1rem;
                border: 1px solid var(--color-border);
                border-radius: var(--border-radius);
                cursor: pointer;
                font-size: 0.875rem;
                transition: all 0.2s;
            }

            .action-btn.accept {
                background: var(--color-primary, #2563eb);
                color: white;
                border-color: var(--color-primary, #2563eb);
            }

            .action-btn.accept:hover {
                background: #1d4ed8;
            }

            .action-btn.delete {
                background: #fee2e2;
                color: #dc2626;
                border-color: #fecaca;
            }

            .action-btn.delete:hover {
                background: #fecaca;
                border-color: #dc2626;
            }

            .action-btn.cancel {
                background: var(--color-bg-secondary);
                color: var(--color-text-secondary);
            }

            .action-btn.cancel:hover {
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

            /* Canvas minimap */
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

            /* Highlighted states */
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

            /* Error states */
            .error input,
            .error textarea,
            .error select {
                border-color: #ef4444;
                background-color: #fef2f2;
            }

            .error-message {
                color: #ef4444;
                font-size: 0.75rem;
                margin-top: 0.25rem;
            }

            .error-page {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                text-align: center;
            }

            .error-page h3 {
                color: #ef4444;
                margin-bottom: 0.5rem;
            }

            /* Snapshot Management Styles */
            .snapshot-controls {
                display: flex;
                gap: 0.5rem;
                margin-bottom: 1.5rem;
                align-items: center;
            }

            .snapshot-controls input {
                flex: 1;
                padding: 0.5rem;
                border: 1px solid var(--color-border);
                border-radius: var(--border-radius);
                font-size: 0.875rem;
            }

            .snapshots-list {
                max-height: 300px;
                overflow-y: auto;
                margin-bottom: 1rem;
            }

            .snapshot-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 0.75rem;
                border: 1px solid var(--color-border);
                border-radius: var(--border-radius);
                margin-bottom: 0.5rem;
                background: var(--color-bg-secondary);
                transition: background-color 0.2s;
            }

            .snapshot-item:hover {
                background: var(--color-bg-hover);
            }

            .snapshot-info {
                flex: 1;
            }

            .snapshot-name {
                font-weight: 500;
                margin-bottom: 0.25rem;
            }

            .snapshot-date {
                font-size: 0.75rem;
                color: var(--color-text-secondary);
            }

            .snapshot-actions {
                display: flex;
                gap: 0.25rem;
            }

            .snapshot-btn {
                padding: 0.25rem 0.5rem;
                border: 1px solid var(--color-border);
                border-radius: var(--border-radius);
                font-size: 0.75rem;
                cursor: pointer;
                background: white;
                transition: all 0.2s;
            }

            .snapshot-btn.restore {
                background: var(--color-primary);
                color: white;
                border-color: var(--color-primary);
            }

            .snapshot-btn.restore:hover {
                background: #1d4ed8;
            }

            .snapshot-btn.delete {
                background: #fee2e2;
                color: #dc2626;
                border-color: #fecaca;
            }

            .snapshot-btn.delete:hover {
                background: #fecaca;
                border-color: #dc2626;
            }

            /* Dropdown Menu Styles */
            .dropdown-menu {
                position: absolute;
                top: 100%;
                left: 0;
                background: white;
                border: 1px solid var(--color-border);
                border-radius: var(--border-radius);
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 1000;
                min-width: 200px;
                max-height: 300px;
                overflow-y: auto;
            }

            .dropdown-content {
                padding: 0.5rem 0;
            }

            .dropdown-item {
                padding: 0.5rem 1rem;
                cursor: pointer;
                font-size: 0.875rem;
                transition: background-color 0.2s;
            }

            .dropdown-item:hover {
                background: var(--color-bg-hover);
            }

            .dropdown-divider {
                height: 1px;
                background: var(--color-border);
                margin: 0.5rem 0;
            }

            .dropdown-section {
                padding: 0.25rem 0;
            }

            .snapshot-dropdown-item {
                padding: 0.5rem 1rem;
                cursor: pointer;
                font-size: 0.75rem;
                display: flex;
                justify-content: space-between;
                align-items: center;
                transition: background-color 0.2s;
            }

            .snapshot-dropdown-item:hover {
                background: var(--color-bg-hover);
            }

            .snapshot-dropdown-name {
                font-weight: 500;
            }

            .snapshot-dropdown-date {
                color: var(--color-text-secondary);
                font-size: 0.625rem;
            }

            /* Session Recovery Styles */
            .session-recovery-info {
                background: var(--color-bg-secondary);
                border: 1px solid var(--color-border);
                border-radius: var(--border-radius);
                padding: 1rem;
                margin: 1rem 0;
            }

            .session-recovery-item {
                margin-bottom: 0.5rem;
                font-size: 0.875rem;
            }

            .session-recovery-item strong {
                color: var(--color-text-primary);
            }

            /* Position dropdown relative to parent */
            .toolbar-group {
                position: relative;
            }

        </style>
    `;
}

/**
 * Initialize the enhanced workflow builder
 */
async function initializeEnhancedWorkflowBuilder() {
    try {
        console.log('Initializing enhanced workflow builder...');
        
        // Validate required parameters
        if (!projectId) {
            throw new Error('Project ID is required for workflow builder initialization');
        }
        
        // Check if container exists
        const container = document.getElementById('workflow-builder-container');
        if (!container) {
            throw new Error('Workflow builder container not found in DOM');
        }
        
        // Create workflow builder instance
        // The WorkflowBuilder expects the container ID, not the canvas ID
        workflowBuilderInstance = new WorkflowBuilder('workflow-builder-container', {
            projectId: projectId,
            workflowId: workflowId,
            autoSave: true,
            autoSaveInterval: 30000,
            enableHistory: true,
            enableValidation: true,
            enableMinimap: true,
            maxHistorySize: 50,
            strictValidation: false
        });

        // Initialize the builder with error handling
        try {
            await workflowBuilderInstance.initialize();
        } catch (initError) {
            console.error('WorkflowBuilder initialization failed:', initError);
            throw new Error(`Failed to initialize workflow builder: ${initError.message}`);
        }

        // Setup legacy compatibility
        try {
            setupLegacyCompatibility();
        } catch (legacyError) {
            console.warn('Legacy compatibility setup failed:', legacyError);
            // Continue without legacy compatibility
        }

        // Load project roles with error handling
        try {
            await loadProjectRoles();
        } catch (roleError) {
            console.error('Failed to load project roles:', roleError);
            // Continue without roles - they can be loaded later
        }

        // Load existing workflow or show type selection
        if (workflowId) {
            try {
                await workflowBuilderInstance.loadExistingWorkflow(workflowId);
                console.log('Workflow loaded successfully:', workflowId);
            } catch (error) {
                console.error('Failed to load workflow:', error);
                app.showNotification('error', 'Load Failed', 'Failed to load workflow: ' + error.message);
            }
        } else {
            // Show workflow type selection for new workflows
            setTimeout(() => {
                const uiController = workflowBuilderInstance.getUIController();
                if (uiController) {
                    uiController.showWorkflowTypeModal();
                }
            }, 200);
        }

        // Setup drag and drop from sidebar
        try {
            setupSidebarDragAndDrop();
        } catch (dragError) {
            console.warn('Failed to setup sidebar drag and drop:', dragError);
            // Continue without drag and drop
        }

        // Setup form event handlers
        try {
            setupFormEventHandlers();
        } catch (formError) {
            console.warn('Failed to setup form event handlers:', formError);
            // Continue without form handlers
        }

        // Check for session recovery after short delay to ensure all components are ready
        setTimeout(() => {
            try {
                checkSessionRecovery();
            } catch (sessionError) {
                console.warn('Session recovery check failed:', sessionError);
                // Continue without session recovery
            }
        }, 1000);

        console.log('Enhanced workflow builder initialized successfully');
        
    } catch (error) {
        console.error('Failed to initialize enhanced workflow builder:', error);
        throw error;
    }
}

/**
 * Setup sidebar drag and drop functionality
 */
function setupSidebarDragAndDrop() {
    try {
        const dragItems = document.querySelectorAll('.drag-item');
        
        if (dragItems.length === 0) {
            console.warn('No drag items found for sidebar setup');
            return;
        }
        
        dragItems.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                try {
                    const nodeType = item.getAttribute('data-type');
                    if (!nodeType) {
                        console.warn('Drag item missing data-type attribute');
                        return;
                    }
                    e.dataTransfer.setData('text/plain', nodeType);
                } catch (dragError) {
                    console.error('Error in drag start handler:', dragError);
                }
            });
        });
        
        console.log(`Setup drag and drop for ${dragItems.length} items`);
    } catch (error) {
        console.error('Failed to setup sidebar drag and drop:', error);
        throw error;
    }
}

/**
 * Setup form event handlers
 */
function setupFormEventHandlers() {
    try {
        // Workflow name input
        const workflowNameInput = document.getElementById('workflowName');
        if (workflowNameInput) {
            workflowNameInput.addEventListener('change', (e) => {
                try {
                    if (workflowBuilderInstance) {
                        const stateManager = workflowBuilderInstance.getStateManager();
                        if (stateManager) {
                            stateManager.updateWorkflowMetadata({ workflowName: e.target.value });
                        }
                    }
                } catch (nameError) {
                    console.error('Error updating workflow name:', nameError);
                }
            });
        } else {
            console.warn('Workflow name input not found');
        }

        // Workflow description
        const workflowDescInput = document.getElementById('workflowDesc');
        if (workflowDescInput) {
            workflowDescInput.addEventListener('change', (e) => {
                try {
                    if (workflowBuilderInstance) {
                        const stateManager = workflowBuilderInstance.getStateManager();
                        if (stateManager) {
                            stateManager.updateWorkflowMetadata({ workflowDescription: e.target.value });
                        }
                    }
                } catch (descError) {
                    console.error('Error updating workflow description:', descError);
                }
            });
        }

        // Workflow type
        const workflowTypeSelect = document.getElementById('workflowType');
        if (workflowTypeSelect) {
            workflowTypeSelect.addEventListener('change', (e) => {
                try {
                    if (workflowBuilderInstance) {
                        const stateManager = workflowBuilderInstance.getStateManager();
                        if (stateManager) {
                            stateManager.updateWorkflowMetadata({ workflowType: e.target.value });
                        }
                    }
                } catch (typeError) {
                    console.error('Error updating workflow type:', typeError);
                }
            });
        }

        // Workflow color
        const workflowColorInput = document.getElementById('workflowColor');
        if (workflowColorInput) {
            workflowColorInput.addEventListener('change', (e) => {
                try {
                    if (workflowBuilderInstance) {
                        const stateManager = workflowBuilderInstance.getStateManager();
                        if (stateManager) {
                            stateManager.updateWorkflowMetadata({ markerColor: e.target.value });
                        }
                    }
                    
                    // Update color preview
                    const colorPreview = document.getElementById('colorPreview');
                    if (colorPreview) {
                        colorPreview.style.background = e.target.value;
                    }
                } catch (colorError) {
                    console.error('Error updating workflow color:', colorError);
                }
            });
        }
        
        console.log('Form event handlers setup completed');
    } catch (error) {
        console.error('Failed to setup form event handlers:', error);
        throw error;
    }

    // Setup workflow type modal click handlers
    setTimeout(() => {
        const typeOptions = document.querySelectorAll('.workflow-type-option');
        typeOptions.forEach(option => {
            option.addEventListener('click', () => {
                const workflowType = option.getAttribute('data-type');
                if (workflowBuilderInstance) {
                    const uiController = workflowBuilderInstance.getUIController();
                    if (uiController) {
                        uiController.selectWorkflowType(workflowType);
                    }
                }
            });
        });
    }, 300);
}

// =====================================================
// GLOBAL SESSION MANAGEMENT FUNCTIONS
// =====================================================

/**
 * Show snapshot dropdown menu
 */
window.showSnapshotMenu = function() {
    const dropdown = document.getElementById('snapshotDropdown');
    if (!dropdown) return;

    // Populate recent snapshots
    populateSnapshotDropdown();
    
    // Position and show dropdown
    dropdown.style.display = 'block';
    
    // Close dropdown when clicking outside
    const closeDropdown = (e) => {
        if (!dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
            document.removeEventListener('click', closeDropdown);
        }
    };
    
    setTimeout(() => {
        document.addEventListener('click', closeDropdown);
    }, 100);
};

/**
 * Show snapshot management modal
 */
window.showSnapshotModal = function() {
    // Hide dropdown first
    const dropdown = document.getElementById('snapshotDropdown');
    if (dropdown) dropdown.style.display = 'none';
    
    // Show modal
    const modal = document.getElementById('snapshotModal');
    const overlay = document.getElementById('overlay');
    
    if (modal && overlay) {
        populateSnapshotsList();
        modal.style.display = 'block';
        overlay.style.display = 'block';
    }
};

/**
 * Create a named snapshot
 */
window.createNamedSnapshot = function() {
    const nameInput = document.getElementById('snapshotName');
    const name = nameInput ? nameInput.value.trim() : null;
    
    if (window.workflowBuilder && typeof window.workflowBuilder.createSnapshot === 'function') {
        try {
            const snapshot = window.workflowBuilder.createSnapshot(name || undefined);
            
            // Clear input
            if (nameInput) nameInput.value = '';
            
            // Refresh snapshots list
            populateSnapshotsList();
            populateSnapshotDropdown();
            
            // Show success notification
            if (workflowBuilderInstance && workflowBuilderInstance.getUIController()) {
                workflowBuilderInstance.getUIController().showNotification('success', 'Snapshot Created', 
                    name ? `Snapshot "${name}" created successfully` : 'Snapshot created successfully');
            }
        } catch (error) {
            console.error('Failed to create snapshot:', error);
            if (workflowBuilderInstance && workflowBuilderInstance.getUIController()) {
                workflowBuilderInstance.getUIController().showNotification('error', 'Snapshot Failed', 
                    'Failed to create snapshot: ' + error.message);
            }
        }
    }
};

/**
 * Restore from snapshot
 */
window.restoreSnapshot = function(snapshotId) {
    if (window.workflowBuilder && typeof window.workflowBuilder.restoreSnapshot === 'function') {
        try {
            window.workflowBuilder.restoreSnapshot(snapshotId);
            
            // Close modal and dropdown
            window.workflowBuilder.closeModal();
            const dropdown = document.getElementById('snapshotDropdown');
            if (dropdown) dropdown.style.display = 'none';
        } catch (error) {
            console.error('Failed to restore snapshot:', error);
            if (workflowBuilderInstance && workflowBuilderInstance.getUIController()) {
                workflowBuilderInstance.getUIController().showNotification('error', 'Restore Failed', 
                    'Failed to restore snapshot: ' + error.message);
            }
        }
    }
};

/**
 * Delete snapshot
 */
window.deleteSnapshot = function(snapshotId) {
    if (confirm('Are you sure you want to delete this snapshot?')) {
        if (window.workflowBuilder && typeof window.workflowBuilder.deleteSnapshot === 'function') {
            try {
                window.workflowBuilder.deleteSnapshot(snapshotId);
                
                // Refresh lists
                populateSnapshotsList();
                populateSnapshotDropdown();
                
                if (workflowBuilderInstance && workflowBuilderInstance.getUIController()) {
                    workflowBuilderInstance.getUIController().showNotification('success', 'Snapshot Deleted', 
                        'Snapshot deleted successfully');
                }
            } catch (error) {
                console.error('Failed to delete snapshot:', error);
                if (workflowBuilderInstance && workflowBuilderInstance.getUIController()) {
                    workflowBuilderInstance.getUIController().showNotification('error', 'Delete Failed', 
                        'Failed to delete snapshot: ' + error.message);
                }
            }
        }
    }
};

/**
 * Recover session
 */
window.recoverSession = function() {
    if (window.workflowBuilder && typeof window.workflowBuilder.recoverFromSession === 'function') {
        try {
            window.workflowBuilder.recoverFromSession();
            
            // Close session recovery modal
            const modal = document.getElementById('sessionRecoveryModal');
            const overlay = document.getElementById('overlay');
            if (modal) modal.style.display = 'none';
            if (overlay) overlay.style.display = 'none';
        } catch (error) {
            console.error('Failed to recover session:', error);
            if (workflowBuilderInstance && workflowBuilderInstance.getUIController()) {
                workflowBuilderInstance.getUIController().showNotification('error', 'Recovery Failed', 
                    'Failed to recover session: ' + error.message);
            }
        }
    }
};

/**
 * Dismiss session recovery
 */
window.dismissRecovery = function() {
    // Close session recovery modal
    const modal = document.getElementById('sessionRecoveryModal');
    const overlay = document.getElementById('overlay');
    if (modal) modal.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
    
    if (workflowBuilderInstance && workflowBuilderInstance.getUIController()) {
        workflowBuilderInstance.getUIController().showNotification('info', 'Session Dismissed', 
            'Starting with fresh workflow');
    }
};

/**
 * Populate snapshots list in modal
 */
function populateSnapshotsList() {
    const container = document.getElementById('snapshotsList');
    if (!container) return;
    
    if (window.workflowBuilder && typeof window.workflowBuilder.getSnapshots === 'function') {
        try {
            const snapshots = window.workflowBuilder.getSnapshots();
            
            if (snapshots.length === 0) {
                container.innerHTML = '<div class="help-text">No snapshots available</div>';
                return;
            }
            
            container.innerHTML = snapshots.map(snapshot => `
                <div class="snapshot-item">
                    <div class="snapshot-info">
                        <div class="snapshot-name">${snapshot.name || 'Unnamed Snapshot'}</div>
                        <div class="snapshot-date">${new Date(snapshot.timestamp).toLocaleString()}</div>
                    </div>
                    <div class="snapshot-actions">
                        <button class="snapshot-btn restore" onclick="restoreSnapshot('${snapshot.id}')">
                            Restore
                        </button>
                        <button class="snapshot-btn delete" onclick="deleteSnapshot('${snapshot.id}')">
                            Delete
                        </button>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Failed to load snapshots:', error);
            container.innerHTML = '<div class="help-text error">Failed to load snapshots</div>';
        }
    }
}

/**
 * Populate snapshot dropdown
 */
function populateSnapshotDropdown() {
    const container = document.getElementById('snapshotDropdownList');
    if (!container) return;
    
    if (window.workflowBuilder && typeof window.workflowBuilder.getSnapshots === 'function') {
        try {
            const snapshots = window.workflowBuilder.getSnapshots();
            const recentSnapshots = snapshots.slice(-5); // Show last 5 snapshots
            
            if (recentSnapshots.length === 0) {
                container.innerHTML = '<div class="dropdown-item" style="color: #999;">No snapshots available</div>';
                return;
            }
            
            container.innerHTML = recentSnapshots.map(snapshot => `
                <div class="snapshot-dropdown-item" onclick="restoreSnapshot('${snapshot.id}')">
                    <div class="snapshot-dropdown-name">${snapshot.name || 'Unnamed'}</div>
                    <div class="snapshot-dropdown-date">${new Date(snapshot.timestamp).toLocaleDateString()}</div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Failed to load snapshots for dropdown:', error);
            container.innerHTML = '<div class="dropdown-item" style="color: #999;">Failed to load snapshots</div>';
        }
    }
}

/**
 * Check for session recovery on page load
 */
function checkSessionRecovery() {
    if (window.workflowBuilder && typeof window.workflowBuilder.getSessionStatus === 'function') {
        try {
            const status = window.workflowBuilder.getSessionStatus();
            
            if (status.available && status.hasSessionData && projectId && workflowId) {
                // Show session recovery modal
                const modal = document.getElementById('sessionRecoveryModal');
                const overlay = document.getElementById('overlay');
                const infoContainer = document.getElementById('sessionRecoveryInfo');
                
                if (modal && overlay && infoContainer) {
                    // Populate session info
                    infoContainer.innerHTML = `
                        <div class="session-recovery-item">
                            <strong>Workflow ID:</strong> ${workflowId}
                        </div>
                        <div class="session-recovery-item">
                            <strong>Last Modified:</strong> ${status.lastModified ? new Date(status.lastModified).toLocaleString() : 'Unknown'}
                        </div>
                        <div class="session-recovery-item">
                            <strong>Auto-save Status:</strong> ${status.autoSaveEnabled ? 'Enabled' : 'Disabled'}
                        </div>
                    `;
                    
                    modal.style.display = 'block';
                    overlay.style.display = 'block';
                }
            }
        } catch (error) {
            console.error('Failed to check session recovery:', error);
        }
    }
}

/**
 * Cleanup function to prevent memory leaks
 */
export function cleanupWorkflowBuilder() {
    try {
        console.log('Cleaning up workflow builder...');
        
        // Clear legacy sync timeout
        if (legacySyncTimeout) {
            clearTimeout(legacySyncTimeout);
            legacySyncTimeout = null;
        }
        
        // Destroy workflow builder instance
        if (workflowBuilderInstance) {
            if (typeof workflowBuilderInstance.destroy === 'function') {
                workflowBuilderInstance.destroy();
            }
            workflowBuilderInstance = null;
        }
        
        // Clear global window references
        if (typeof window !== 'undefined') {
            delete window.workflowBuilder;
            delete window.workflowLogic;
            delete window.nodes;
            delete window.selectedNode;
            
            // Remove global session management functions
            delete window.showSnapshotMenu;
            delete window.showSnapshotModal;
            delete window.createNamedSnapshot;
            delete window.restoreSnapshot;
            delete window.deleteSnapshot;
            delete window.recoverSession;
            delete window.dismissRecovery;
        }
        
        // Clear module-level variables
        nodes.length = 0;
        transitions.length = 0;
        nodeCounter = 0;
        selectedNode = null;
        selectedTransition = null;
        workflowId = null;
        projectId = null;
        projectRoles.length = 0;
        
        console.log('Workflow builder cleanup completed');
    } catch (error) {
        console.error('Error during workflow builder cleanup:', error);
    }
}

// Export the enhanced page function
export { workflowBuilderInstance };