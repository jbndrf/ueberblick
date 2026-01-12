/**
 * Marker Detail Module
 * 
 * Displays marker details in the bottom sheet with role-based data visibility
 * Supports both static markers and workflow instances
 * Shows progressive data based on participant role and stage permissions
 */

import { BottomSheetModule } from './bottom-sheet.js';
import { workflowEngine } from '../workflow/workflow-engine.js';
import EntitySelector from '../components/entity-selector.js';
import { formRenderer } from '../forms/form-renderer.js';
import participantAuth from '../auth/participant-auth.js';
import eventManager from '../core/event-manager.js';
import DebugLogger from '../core/debug-logger.js';
import { supabaseClient } from '../core/supabase.js';

export class MarkerDetailModule extends BottomSheetModule {
    constructor(options = {}) {
        super({
            id: 'marker-detail',
            title: 'Marker Details',
            peekHeight: 0.4,
            expandedHeight: 0.8,
            ...options
        });
        
        this.markerData = null;
        this.instanceData = null;
        this.participantRole = null;
        this.maxVisibleStageOrder = null;
        this.availableActions = [];
        this.auditTrail = [];
        this.activeTab = 'overview';
        this.activeDetailTab = 'stage-based';
        this.isEditMode = false;
        this.editActionId = null;
        this.editableFields = [];
        this.editFormData = new Map();
        this.isLocationUpdateMode = false;
        this.locationUpdateMarker = null;
        this.locationUpdateLine = null;
        this.newMarkerPosition = null;
        this.logger = new DebugLogger('MarkerDetailModule');
        
        // Register for cleanup
        eventManager.registerComponent('marker-detail-module', { 
            destroy: () => this.destroy() 
        });
    }

    /**
     * Render marker details based on marker type
     */
    async render(container, params = {}) {
        this.container = container;
        this.markerData = params.marker;
        
        if (!this.markerData) {
            this.renderError('No marker data provided');
            return;
        }

        // Get participant roles for role-based visibility
        this.participantRoleIds = await this.getParticipantRoles();
        if (!this.participantRoleIds || this.participantRoleIds.length === 0) {
            this.renderError('Unable to determine participant roles');
            return;
        }

        try {
            if (this.markerData.type === 'static') {
                await this.renderStaticMarker();
            } else if (this.markerData.type === 'workflow_instance') {
                await this.renderWorkflowInstance();
            } else {
                this.renderError('Unknown marker type');
            }
        } catch (error) {
            this.logger.error('Render error:', error);
            this.renderError('Failed to load marker details');
        }
    }

    /**
     * Get participant role information
     */
    async getParticipantRoles() {
        try {
            const authStatus = participantAuth.getAuthStatus();
            
            if (!authStatus.isAuthenticated || !authStatus.participant) {
                this.logger.warn('Not authenticated or no participant');
                return [];
            }

            if (!authStatus.roles || authStatus.roles.length === 0) {
                this.logger.warn('No roles found for participant');
                return [];
            }

            // Return all roles as array of IDs (support multiple roles)
            return authStatus.roles.map(role => role.id);
        } catch (error) {
            this.logger.error('Failed to get participant roles:', error);
            return [];
        }
    }

    /**
     * Render static marker details with custom fields
     */
    async renderStaticMarker() {
        const marker = this.markerData;
        
        this.container.innerHTML = `
            <div class="marker-detail-content">
                <div class="marker-header">
                    <div class="marker-type-badge static">${marker.category}</div>
                    <h3 class="marker-title">${marker.title}</h3>
                    ${marker.description ? `<div class="marker-description">${marker.description}</div>` : ''}
                    <div class="marker-meta">
                        <span class="marker-category">${marker.category}</span>
                        ${marker.createdAt ? `<span class="marker-date">${new Date(marker.createdAt).toLocaleDateString('de-DE')}</span>` : ''}
                    </div>
                </div>
                
                <div class="marker-info">
                    ${this.renderCustomFields(marker)}
                    
                    <div class="info-section">
                        <h4>Location</h4>
                        <p>Latitude: ${marker.lat.toFixed(6)}</p>
                        <p>Longitude: ${marker.lng.toFixed(6)}</p>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render custom fields from marker category definition
     */
    renderCustomFields(marker) {
        if (!marker.properties || Object.keys(marker.properties).length === 0) {
            return '';
        }

        // Fields already displayed in the main marker view that should be excluded
        const excludedFields = ['title', 'description'];
        
        const customFieldsHtml = Object.entries(marker.properties)
            .filter(([key, value]) => !excludedFields.includes(key.toLowerCase()) && value !== null && value !== '')
            .map(([key, value]) => `
                <div class="custom-field-row">
                    <span class="field-label">${key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</span>
                    <span class="field-value">${value}</span>
                </div>
            `).join('');

        if (customFieldsHtml === '') {
            return '';
        }

        return `
            <div class="info-section">
                <h4>Details</h4>
                <div class="custom-fields">
                    ${customFieldsHtml}
                </div>
            </div>
        `;
    }

    /**
     * Format custom field value based on field type
     */
    formatCustomFieldValue(value, fieldType) {
        if (!value || value === '') {
            return '<em>Not specified</em>';
        }
        
        switch (fieldType) {
            case 'boolean':
                return value === 'true' || value === true ? 'Yes' : 'No';
            case 'date':
                try {
                    return new Date(value).toLocaleDateString('de-DE');
                } catch (e) {
                    return value;
                }
            case 'url':
                return `<a href="${value}" target="_blank" rel="noopener noreferrer">${value}</a>`;
            case 'email':
                return `<a href="mailto:${value}">${value}</a>`;
            case 'phone':
                return `<a href="tel:${value}">${value}</a>`;
            case 'textarea':
                return `<div class="textarea-content">${value.replace(/\n/g, '<br>')}</div>`;
            default:
                return value;
        }
    }

    /**
     * Render workflow instance details with role-based data visibility
     */
    async renderWorkflowInstance() {
        const marker = this.markerData;
        
        // Load workflow instance data
        await this.loadWorkflowInstanceData(marker.id);
        
        if (!this.instanceData) {
            this.renderError('Failed to load workflow instance data');
            return;
        }

        // RLS policies handle instance visibility at database level
        // No client-side permission check needed
        
        // Debug visibility information
        const visibilitySummary = workflowEngine.getVisibilitySummary(this.instanceData, this.participantRoleIds);
        this.logger.log('Visibility summary:', visibilitySummary);
        
        // Load available actions
        await this.loadAvailableActions();
        
        // Load audit trail data
        await this.loadAuditTrail();
        
        // Get all photos from all stages
        const allPhotos = await this.getAllPhotos();
        
        // Clean up title to remove duplicate date information
        const cleanTitle = this.cleanupTitle(marker.title, marker.createdAt);
        
        // Initialize active tab state
        this.activeTab = 'overview';
        
        // Set initial detail tab to first stage name (ordered by stage order)
        try {
            const collectedData = await workflowEngine.getInstanceData(this.instanceData.id);
            const visibleData = await this.filterDataByStageVisibility(collectedData);
            const groupedData = this.groupDataByStage(visibleData);
            const stageNames = Object.keys(groupedData);
            
            // Sort stage names by stage order to get the first one
            const sortedStageNames = stageNames.sort((a, b) => {
                const stageA = this.instanceData.workflow?.workflow_stages?.find(s => s.stage_name === a);
                const stageB = this.instanceData.workflow?.workflow_stages?.find(s => s.stage_name === b);
                const orderA = stageA?.stage_order || 999;
                const orderB = stageB?.stage_order || 999;
                return orderA - orderB;
            });
            
            this.activeDetailTab = sortedStageNames.length > 0 ? sortedStageNames[0] : 'Initial Data';
        } catch (error) {
            this.logger.error('Failed to set initial detail tab:', error);
            this.activeDetailTab = 'Initial Data';
        }
        
        // Render the new tabbed interface
        await this.renderTabbedInterface(cleanTitle, marker, allPhotos);
    }

    /**
     * Load workflow instance data from database
     */
    async loadWorkflowInstanceData(instanceId) {
        try {
            this.instanceData = await workflowEngine.getWorkflowInstance(instanceId);
            this.logger.log('Loaded instance data:', this.instanceData);
        } catch (error) {
            this.logger.error('Failed to load workflow instance data:', error);
            this.instanceData = null;
        }
    }

    /**
     * Calculate maximum visible stage order for participant role
     */
    async calculateMaxVisibleStage() {
        try {
            if (!this.instanceData?.workflow?.workflow_stages) {
                this.logger.warn('No workflow stages found');
                this.maxVisibleStageOrder = 0;
                return;
            }

            if (!this.participantRoleIds || this.participantRoleIds.length === 0) {
                this.logger.warn('No participant roles found');
                this.maxVisibleStageOrder = 0;
                return;
            }

            // RLS policies handle stage visibility - no client-side calculation needed
            this.maxVisibleStageOrder = 999; // Allow all stages - RLS filters at database level
            
            this.logger.log('Max visible stage order:', this.maxVisibleStageOrder);
            this.logger.log('Participant role IDs:', this.participantRoleIds);
            this.logger.log('Workflow stages:', this.instanceData.workflow.workflow_stages.map(s => ({
                name: s.stage_name,
                order: s.stage_order,
                visible_to_roles: s.visible_to_roles
            })));
        } catch (error) {
            this.logger.error('Failed to calculate max visible stage:', error);
            this.maxVisibleStageOrder = 0;
        }
    }

    /**
     * Load available actions for current participant
     */
    async loadAvailableActions() {
        try {
            this.availableActions = await workflowEngine.getAvailableActions(this.instanceData.id);
            this.logger.log('Available actions:', this.availableActions.length);
            
            if (this.availableActions.length > 0) {
                this.logger.log('Action details:', this.availableActions.map(action => ({
                    id: action.id,
                    name: action.action_name,
                    button_label: action.button_label,
                    from_stage: action.from_stage_id,
                    to_stage: action.to_stage_id,
                    allowed_roles: action.allowed_roles
                })));
            }
        } catch (error) {
            this.logger.error('Failed to load available actions:', error);
            this.availableActions = [];
        }
    }

    /**
     * Render workflow data with stage-based visibility
     */
    async renderWorkflowData() {
        try {
            const collectedData = await workflowEngine.getInstanceData(this.instanceData.id);
            this.logger.log('Collected data:', collectedData);
            
            if (!collectedData || collectedData.length === 0) {
                return '<p class="no-data">No data collected yet</p>';
            }

            // Ensure we have participant roles before filtering
            if (!this.participantRoleIds || this.participantRoleIds.length === 0) {
                this.logger.warn('No participant roles available for data filtering');
                return '<p class="error">Unable to determine data visibility permissions</p>';
            }

            // Filter data based on stage visibility using role-based utilities
            const visibleData = await this.filterDataByStageVisibility(collectedData);
            this.logger.log('Visible data after filtering:', visibleData);
            
            if (visibleData.length === 0) {
                return '<p class="no-data">No data visible for your role</p>';
            }

            // Group data by stage
            const groupedData = this.groupDataByStage(visibleData);
            this.logger.log('Grouped data:', groupedData);
            
            return this.renderGroupedData(groupedData);
        } catch (error) {
            this.logger.error('Failed to render workflow data:', error);
            return '<p class="error">Failed to load workflow data</p>';
        }
    }

    /**
     * Filter data based on stage visibility and participant roles
     */
    async filterDataByStageVisibility(collectedData) {
        // RLS policies handle data filtering at database level - return all data
        return collectedData;
    }

    /**
     * Get stage order for a data item
     */
    async getStageOrderForData(dataItem) {
        try {
            // Get stage information from action execution
            if (dataItem.action_execution?.action?.from_stage_id) {
                const stageId = dataItem.action_execution.action.from_stage_id;
                const stage = this.instanceData.workflow.workflow_stages.find(s => s.id === stageId);
                return stage?.stage_order || 0;
            }
            
            // Fallback to stage 1 if no stage information
            return 1;
        } catch (error) {
            this.logger.error('Failed to get stage order for data:', error);
            return 0;
        }
    }

    /**
     * Group data by stage for sub-tabs (revert to original logic)
     */
    groupDataByStage(data) {
        // First, deduplicate by field_id to show only the most recent value
        const deduplicatedData = this.deduplicateByFieldId(data);
        
        const grouped = {};
        
        for (const item of deduplicatedData) {
            let stageName;
            
            // Determine stage based on field semantics and context
            if (item.action_execution?.action) {
                const action = item.action_execution.action;
                const fieldLabel = this.formatFieldLabel(item).toLowerCase();
                
                // Analyze field semantics to determine logical stage placement
                // Fields like "Matschpfütze?" and "Wann war das?" are initial report data
                if (fieldLabel.includes('matschpfütze') || fieldLabel.includes('wann war das')) {
                    // These belong to the initial reporting stage (Meldung)
                    const startStage = this.instanceData.workflow?.workflow_stages?.find(
                        s => s.stage_type === 'start' || s.stage_order === 1
                    );
                    if (startStage) {
                        stageName = startStage.stage_name;
                    }
                }
                // Fields like "Erledigen bis" are repair/follow-up stage data
                else if (fieldLabel.includes('erledigen') || fieldLabel.includes('reparatur')) {
                    // These belong to the repair stage
                    const repairStage = this.instanceData.workflow?.workflow_stages?.find(
                        s => s.stage_name.toLowerCase().includes('reparatur') || s.stage_order > 1
                    );
                    if (repairStage) {
                        stageName = repairStage.stage_name;
                    }
                }
                
                // If no semantic match found, fall back to action-based logic
                if (!stageName) {
                    // For edit actions (same from/to stage), use that stage
                    if (action.from_stage_id === action.to_stage_id) {
                        stageName = this.getStageNameById(action.from_stage_id);
                    }
                    // For progression actions, use TO stage
                    else if (action.from_stage_id && action.to_stage_id) {
                        stageName = this.getStageNameById(action.to_stage_id);
                    }
                    // Single stage reference
                    else if (action.from_stage_id) {
                        stageName = this.getStageNameById(action.from_stage_id);
                    } else if (action.to_stage_id) {
                        stageName = this.getStageNameById(action.to_stage_id);
                    }
                }
            }
            
            // Fallback for data without action execution
            if (!stageName) {
                const startStage = this.instanceData.workflow?.workflow_stages?.find(
                    s => s.stage_type === 'start'
                );
                stageName = startStage?.stage_name || 'Initial Data';
            }
            
            if (!grouped[stageName]) {
                grouped[stageName] = [];
            }
            grouped[stageName].push(item);
        }
        
        return grouped;
    }

    /**
     * Group data by page within a stage
     */
    groupDataByPage(data) {
        const grouped = {};
        
        for (const item of data) {
            // Use page_title from form_fields if available
            let pageTitle = item.form_fields?.page_title;
            
            // Fallback for data without page information
            if (!pageTitle) {
                pageTitle = 'Uncategorized Fields';
            }
            
            if (!grouped[pageTitle]) {
                grouped[pageTitle] = [];
            }
            grouped[pageTitle].push(item);
        }
        
        return grouped;
    }

    /**
     * Deduplicate data by field_id, keeping only the most recent value
     */
    deduplicateByFieldId(data) {
        const fieldIdMap = new Map();
        
        // Sort data by created_at to ensure we process newest first
        const sortedData = [...data].sort((a, b) => 
            new Date(b.created_at) - new Date(a.created_at)
        );
        
        for (const item of sortedData) {
            const fieldId = item.field_id;
            
            // Only keep the first occurrence (which is the newest due to sorting)
            if (!fieldIdMap.has(fieldId)) {
                fieldIdMap.set(fieldId, item);
            }
        }
        
        // Convert back to array, sorted by original order
        return Array.from(fieldIdMap.values()).sort((a, b) => 
            new Date(a.created_at) - new Date(b.created_at)
        );
    }

    /**
     * Get stage name by stage ID
     */
    getStageNameById(stageId) {
        if (!this.instanceData?.workflow?.workflow_stages) {
            return 'Unknown Stage';
        }
        
        const stage = this.instanceData.workflow.workflow_stages.find(s => s.id === stageId);
        return stage?.stage_name || 'Unknown Stage';
    }

    /**
     * Render grouped data by stage with card-based organization
     */
    renderGroupedData(groupedData) {
        const sections = [];
        
        for (const [stageName, stageData] of Object.entries(groupedData)) {
            // Get field count for the page
            const fieldCount = stageData.length;
            
            const dataRows = stageData.map(item => `
                <div class="data-row">
                    <span class="data-label">${this.formatFieldLabel(item)}:</span>
                    <span class="data-value">${this.formatFieldValue(item.field_value, item.field_type)}</span>
                </div>
            `).join('');
            
            // Always show as a card with page origin header
            sections.push(`
                <div class="page-data-card">
                    <div class="page-card-header">
                        <h5 class="page-title">${stageName}</h5>
                        <div class="page-field-count">${fieldCount} ${fieldCount === 1 ? 'field' : 'fields'}</div>
                    </div>
                    <div class="page-card-content">
                        ${dataRows}
                    </div>
                </div>
            `);
        }
        
        return sections.join('');
    }

    /**
     * Format field label for display using form_fields data if available
     */
    formatFieldLabel(dataItem) {
        // Use field_label from form_fields if available, fallback to field ID
        if (dataItem.form_fields?.field_label) {
            return dataItem.form_fields.field_label;
        }
        
        // Fallback to truncated field ID for display
        const fieldId = dataItem.field_id;
        return `Field ${fieldId.substring(0, 8)}...`;
    }

    /**
     * Format field value for display
     */
    formatFieldValue(value, type) {
        if (!value || value === '') {
            return '<em>Empty</em>';
        }
        
        switch (type) {
            case 'boolean':
                return value === 'true' ? 'Yes' : 'No';
            case 'array':
                try {
                    const parsed = JSON.parse(value);
                    return Array.isArray(parsed) ? parsed.join(', ') : value;
                } catch (e) {
                    return value;
                }
            case 'date':
                return new Date(value).toLocaleDateString();
            case 'signature':
                return '<i class="fas fa-signature"></i> Signature provided';
            case 'file':
                console.log('[MarkerDetailModule] Processing file field:', { value, type });
                // Check if this is an image file
                if (this.isImageFile(value)) {
                    console.log('[MarkerDetailModule] Detected as image file');
                    // If it looks like a storage path, generate proper URL
                    if (this.isStoragePath(value)) {
                        const imageUrl = this.getImageUrl(value);
                        return `<div class="image-display">
                            <img src="${imageUrl}" alt="Uploaded image" 
                                 style="max-width: 200px; max-height: 150px; object-fit: cover; border-radius: 4px; margin: 4px 0;" 
                                 onerror="this.style.display='none'; this.nextSibling.style.display='block';" />
                            <div style="display: none; color: #666; font-style: italic;">
                                <i class="fas fa-exclamation-triangle"></i> Image failed to load
                            </div>
                        </div>`;
                    } else {
                        // Direct URL or filename
                        return `<div class="image-display">
                            <img src="${value}" alt="Uploaded image" 
                                 style="max-width: 200px; max-height: 150px; object-fit: cover; border-radius: 4px; margin: 4px 0;" 
                                 onerror="this.style.display='none'; this.nextSibling.style.display='block';" />
                            <div style="display: none; color: #666; font-style: italic;">
                                <i class="fas fa-exclamation-triangle"></i> Image failed to load: ${value}
                            </div>
                        </div>`;
                    }
                } else {
                    // Not an image, show as file
                    return `<i class="fas fa-file"></i> ${value}`;
                }
            default:
                return value;
        }
    }

    /**
     * Render action buttons
     */
    renderActionButtons() {
        this.logger.log('Rendering action buttons for:', this.availableActions);
        
        return this.availableActions.map(action => {
            const buttonHtml = `
                <button 
                    class="action-button" 
                    data-action-id="${action.id}"
                    style="background-color: ${action.button_color || '#007bff'}"
                >
                    ${action.button_label || action.action_name}
                </button>
            `;
            this.logger.log('Generated button HTML:', buttonHtml);
            return buttonHtml;
        }).join('');
    }

    /**
     * Setup action button handlers
     */
    setupActionHandlers() {
        const actionButtons = this.container.querySelectorAll('.action-roll-btn, .modern-action-btn');
        
        actionButtons.forEach(button => {
            const actionId = button.getAttribute('data-action-id');
            const editAction = button.getAttribute('data-edit-action');
            
            if (editAction) {
                // Handle edit mode buttons (confirm/discard/location-update)
                eventManager.add(button, 'click', async () => {
                    if (editAction === 'confirm') {
                        await this.handleEditConfirm();
                    } else if (editAction === 'discard') {
                        await this.handleEditDiscard();
                    } else if (editAction === 'location-update') {
                        await this.handleLocationUpdate();
                    }
                }, {
                    component: 'marker-detail-module',
                    description: `Edit mode ${editAction} handler`
                });
            } else if (actionId) {
                // Handle regular action buttons
                eventManager.add(button, 'click', async () => {
                    await this.handleActionClick(actionId);
                }, {
                    component: 'marker-detail-module',
                    description: `Action button handler for ${actionId}`
                });
            }
        });
    }

    /**
     * Setup clickable field handlers for inline editing
     */
    setupClickableFieldHandlers() {
        const clickableFields = this.container.querySelectorAll('.clickable-field');
        
        clickableFields.forEach(field => {
            const actionId = field.getAttribute('data-action-id');
            const fieldId = field.getAttribute('data-field-id');
            
            if (actionId && fieldId) {
                eventManager.add(field, 'click', async () => {
                    // Activate edit mode for this specific action
                    await this.activateEditMode(actionId);
                }, {
                    component: 'marker-detail-module',
                    description: `Clickable field handler for ${fieldId}`
                });
            }
        });
    }

    /**
     * Setup edit mode specific handlers
     */
    setupEditModeHandlers() {
        // No additional handlers needed - form renderer handles all form interactions
        this.logger.log('Edit mode handlers setup - delegating to form renderer');
    }

    /**
     * Check if current user has location update permission for this marker
     */
    async hasLocationUpdatePermission() {
        try {
            console.log('DEBUG: Checking location update permission for marker:', this.markerData);
            
            // Only workflow instances can have location updates
            if (!this.markerData || this.markerData.type !== 'workflow_instance') {
                console.log('DEBUG: Not a workflow instance, no location update permission');
                return false;
            }
            
            // Check if the workflow has location update permissions
            if (!this.markerData.workflow) {
                console.log('DEBUG: No workflow data found, no location update permission');
                return false;
            }
            
            const locationUpdateRoles = this.markerData.workflow.location_update_roles;
            console.log('DEBUG: Workflow location_update_roles:', locationUpdateRoles);
            
            if (!locationUpdateRoles || !Array.isArray(locationUpdateRoles) || locationUpdateRoles.length === 0) {
                console.log('DEBUG: No location update roles configured');
                return false;
            }
            
            // Get participant roles
            const auth = participantAuth.getAuthStatus();
            console.log('DEBUG: Auth status:', auth);
            
            if (!auth.isAuthenticated || !auth.roles || auth.roles.length === 0) {
                console.log('DEBUG: Not authenticated or no roles');
                return false;
            }
            
            const participantRoleIds = auth.roles.map(role => role.id);
            console.log('DEBUG: Participant role IDs:', participantRoleIds);
            console.log('DEBUG: Required location update roles:', locationUpdateRoles);
            
            // Check if participant has any of the required roles
            const hasPermission = locationUpdateRoles.some(roleId => 
                participantRoleIds.includes(roleId)
            );
            
            console.log('DEBUG: Has location update permission:', hasPermission);
            
            this.logger.log('Location update permission check:', {
                markerId: this.markerData.id,
                markerTitle: this.markerData.title,
                locationUpdateRoles: locationUpdateRoles,
                participantRoles: participantRoleIds,
                hasPermission: hasPermission
            });
            
            return hasPermission;
        } catch (error) {
            this.logger.error('Error checking location update permission:', error);
            return false;
        }
    }

    /**
     * Check if current user has assignment permissions for this marker
     * Returns: 'none', 'self', or 'any'
     */
    async getAssignmentPermissionLevel() {
        try {
            console.log('DEBUG: Checking assignment permission level for marker:', this.markerData);
            
            // Only workflow instances can be assigned
            if (!this.markerData || this.markerData.type !== 'workflow_instance') {
                console.log('DEBUG: Not a workflow instance, no assignment permission');
                return 'none';
            }
            
            // Check if the workflow has assignment permissions
            if (!this.markerData.workflow) {
                console.log('DEBUG: No workflow data found, no assignment permission');
                return 'none';
            }
            
            const assignmentRoles = this.markerData.workflow.assignment_roles || [];
            const selfAssignmentRoles = this.markerData.workflow.self_assignment_roles || [];
            
            console.log('DEBUG: Workflow assignment_roles:', assignmentRoles);
            console.log('DEBUG: Workflow self_assignment_roles:', selfAssignmentRoles);
            
            // Get participant roles
            const auth = participantAuth.getAuthStatus();
            console.log('DEBUG: Auth status:', auth);
            
            if (!auth.isAuthenticated || !auth.roles || auth.roles.length === 0) {
                console.log('DEBUG: Not authenticated or no roles');
                return 'none';
            }
            
            const participantRoleIds = auth.roles.map(role => role.id);
            console.log('DEBUG: Participant role IDs:', participantRoleIds);
            
            // Check if participant has full assignment permission
            const hasFullAssignment = assignmentRoles.some(roleId => 
                participantRoleIds.includes(roleId)
            );
            
            if (hasFullAssignment) {
                console.log('DEBUG: Has full assignment permission');
                return 'any';
            }
            
            // Check if participant has self-assignment permission
            const hasSelfAssignment = selfAssignmentRoles.some(roleId => 
                participantRoleIds.includes(roleId)
            );
            
            if (hasSelfAssignment) {
                console.log('DEBUG: Has self-assignment permission');
                return 'self';
            }
            
            console.log('DEBUG: No assignment permission');
            return 'none';
            
        } catch (error) {
            this.logger.error('Error checking assignment permission:', error);
            return 'none';
        }
    }

    /**
     * Handle edit confirm action
     */
    async handleEditConfirm() {
        try {
            // Check if we're in location update mode
            if (this.isLocationUpdateMode) {
                return await this.confirmLocationUpdate();
            }
            
            this.logger.log('Confirming edit - validating and submitting inline form');
            
            // Check if we have assignment changes to save
            await this.handleAssignmentSaveIfNeeded();
            
            // Find the inline editing container
            const editContainer = this.container.querySelector('.field-group.editing-inline');
            if (!editContainer) {
                // If no edit container but we handled assignment, that's okay
                this.logger.log('No edit form container found, but assignment handling completed');
                await this.deactivateEditMode(true);
                return;
            }
            
            // Validate and get form data from inline inputs
            const formData = this.getInlineFormData(editContainer);
            this.logger.log('Inline form data retrieved:', formData);
            
            // Execute the edit action with form data
            await this.executeAction(this.editActionId, formData);
            
            // Exit edit mode and refresh
            await this.deactivateEditMode(true);
            
        } catch (error) {
            this.logger.error('Failed to confirm edit:', error);
            alert('Failed to save changes: ' + error.message);
        }
    }

    /**
     * Confirm location update with user confirmation
     */
    async confirmLocationUpdate() {
        try {
            // Show confirmation dialog
            const confirmed = confirm('Der Standort wurde aktualisiert. Möchten Sie die Änderung bestätigen?');
            if (!confirmed) {
                return;
            }
            
            // Update the marker location in the database using PostGIS geometry
            const supabaseClient = await import('../core/supabase.js').then(m => m.supabaseClient);
            
            // Create PostGIS point geometry (same format as map-core.js)
            const locationWKT = `POINT(${this.newMarkerPosition.lng} ${this.newMarkerPosition.lat})`;
            
            // Use audit-aware update for location changes
            await supabaseClient.updateWithAudit(
                'workflow_instances',
                this.markerData.id,
                {
                    location: locationWKT,
                    updated_at: new Date().toISOString()
                },
                {
                    activityType: 'location_update',
                    activitySummary: `Updated location`,
                    activityDetails: {
                        previousLocation: {
                            lat: this.markerData.lat,
                            lng: this.markerData.lng
                        },
                        newLocation: {
                            lat: this.newMarkerPosition.lat,
                            lng: this.newMarkerPosition.lng
                        },
                        updateMethod: 'drag_and_drop'
                    },
                    metadata: {
                        component: 'marker-detail-module',
                        action: 'location_update'
                    }
                }
            );
            
            // Update local marker data
            this.markerData.lat = this.newMarkerPosition.lat;
            this.markerData.lng = this.newMarkerPosition.lng;
            
            // Clean up temporary markers and lines
            const map = window.mapCore?.getMap();
            if (map && this.locationUpdateMarker) {
                map.removeLayer(this.locationUpdateMarker);
            }
            if (map && this.locationUpdateLine) {
                map.removeLayer(this.locationUpdateLine);
            }
            
            // Remove map click handler
            this.removeLocationUpdateMapClick();
            
            // Reset location update mode
            this.isLocationUpdateMode = false;
            this.locationUpdateMarker = null;
            this.locationUpdateLine = null;
            this.newMarkerPosition = null;
            
            // Re-enable bottom sheet closing
            if (window.bottomSheet) {
                window.bottomSheet.preventClose = false;
            }
            
            // Refresh the markers on the map
            if (window.loadMarkers) {
                await window.loadMarkers();
            }
            
            // Show success notification
            if (window.app && window.app.showNotification) {
                window.app.showNotification('success', 'Standort aktualisiert', 'Der Standort wurde erfolgreich aktualisiert.');
            }
            
            // Exit edit mode and refresh
            await this.deactivateEditMode(true);
            
        } catch (error) {
            this.logger.error('Failed to confirm location update:', error);
            alert('Fehler beim Aktualisieren des Standorts: ' + error.message);
        }
    }
    
    /**
     * Get form data from inline editing inputs
     */
    getInlineFormData(container) {
        const formData = new Map();
        
        // Find all inline edit input elements
        const inputs = container.querySelectorAll('.inline-edit-input');
        
        for (const input of inputs) {
            const fieldId = input.name || input.id;
            let value;
            
            if (!fieldId) {
                this.logger.warn('Found input without field ID:', input);
                continue;
            }
            
            if (input.type === 'checkbox') {
                value = input.checked ? 'true' : 'false';
            } else {
                value = input.value?.trim() || '';
            }
            
            // Only include non-empty values or explicitly set checkboxes
            // This helps avoid UUID issues with undefined/empty values
            if (value !== '' || input.type === 'checkbox') {
                formData.set(fieldId, value);
                this.logger.log(`Field ${fieldId}: ${value}`);
            } else {
                this.logger.log(`Skipping empty field ${fieldId}`);
            }
        }
        
        return formData;
    }

    /**
     * Handle edit discard action
     */
    async handleEditDiscard() {
        // Check if we're in location update mode
        if (this.isLocationUpdateMode) {
            return await this.cancelLocationUpdate();
        }
        
        const confirmed = confirm('Sie haben möglicherweise ungespeicherte Änderungen. Möchten Sie diese wirklich verwerfen?');
        if (!confirmed) {
            return;
        }
        
        // Exit edit mode without saving
        await this.deactivateEditMode(true);
    }

    /**
     * Cancel location update and clean up
     */
    async cancelLocationUpdate() {
        try {
            // Clean up temporary markers and lines
            const map = window.mapCore?.getMap();
            if (map && this.locationUpdateMarker) {
                map.removeLayer(this.locationUpdateMarker);
            }
            if (map && this.locationUpdateLine) {
                map.removeLayer(this.locationUpdateLine);
            }
            
            // Remove map click handler
            this.removeLocationUpdateMapClick();
            
            // Reset location update mode
            this.isLocationUpdateMode = false;
            this.locationUpdateMarker = null;
            this.locationUpdateLine = null;
            this.newMarkerPosition = null;
            
            // Re-enable bottom sheet closing
            if (window.bottomSheet) {
                window.bottomSheet.preventClose = false;
            }
            
            // Show cancellation notification
            if (window.app && window.app.showNotification) {
                window.app.showNotification('info', 'Abgebrochen', 'Die Standortaktualisierung wurde abgebrochen.');
            }
            
        } catch (error) {
            this.logger.error('Error cancelling location update:', error);
        }
    }

    /**
     * Activate edit mode for a specific action
     */
    async activateEditMode(actionId) {
        try {
            this.logger.log('Activating edit mode for action:', actionId);
            
            // Load editable fields for this action
            this.editableFields = await workflowEngine.getEditableFields(actionId);
            this.logger.log('Editable fields:', this.editableFields);
            
            if (!this.editableFields || this.editableFields.length === 0) {
                throw new Error('No editable fields found for this action');
            }
            
            this.isEditMode = true;
            this.editActionId = actionId;
            
            // Switch to details tab and re-render
            this.activeTab = 'details';
            await this.renderTabbedInterface(
                this.cleanupTitle(this.markerData.title, this.markerData.createdAt), 
                this.markerData, 
                await this.getAllPhotos()
            );
            
            // Setup assignment selector for edit mode with delay to ensure DOM is ready
            setTimeout(async () => {
                await this.setupAssignmentSelector();
            }, 100);
            
        } catch (error) {
            this.logger.error('Failed to activate edit mode:', error);
            alert('Failed to activate edit mode: ' + error.message);
        }
    }


    /**
     * Deactivate edit mode
     */
    async deactivateEditMode(refresh = true) {
        this.isEditMode = false;
        this.editActionId = null;
        this.editableFields = [];
        this.editFormData.clear();
        
        if (refresh) {
            // Re-render without edit mode
            await this.renderTabbedInterface(
                this.cleanupTitle(this.markerData.title, this.markerData.createdAt), 
                this.markerData, 
                await this.getAllPhotos()
            );
            
            // Make sure clickable field handlers are set up after refresh
            if (this.activeTab === 'details') {
                this.setupClickableFieldHandlers();
            }
        }
    }

    /**
     * Handle location update action
     */
    async handleLocationUpdate() {
        try {
            this.logger.log('Starting location update process');
            
            // Check permissions again
            if (!(await this.hasLocationUpdatePermission())) {
                alert('Sie haben keine Berechtigung, den Standort zu aktualisieren.');
                return;
            }
            
            // Get map instance
            const map = window.mapCore?.getMap();
            if (!map) {
                throw new Error('Map instance not available');
            }
            
            // Zoom to marker location at level 16
            map.setView([this.markerData.lat, this.markerData.lng], 16);
            
            // Create temporary draggable marker for location update
            const tempMarker = L.marker([this.markerData.lat, this.markerData.lng], {
                icon: L.divIcon({
                    className: 'temp-location-marker',
                    html: '<div style="background-color: rgba(0, 122, 255, 0.9); width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>',
                    iconSize: [26, 26],
                    iconAnchor: [13, 13]
                }),
                draggable: true
            }).addTo(map);
            
            // Add connection line from original position
            let connectionLine = L.polyline([
                [this.markerData.lat, this.markerData.lng],
                [this.markerData.lat, this.markerData.lng]
            ], {
                color: '#007AFF',
                weight: 2,
                opacity: 0.8,
                dashArray: '5, 10'
            }).addTo(map);
            
            let newPosition = { lat: this.markerData.lat, lng: this.markerData.lng };
            
            // Update connection line when marker is dragged
            tempMarker.on('drag', (e) => {
                newPosition = e.target.getLatLng();
                connectionLine.setLatLngs([
                    [this.markerData.lat, this.markerData.lng],
                    [newPosition.lat, newPosition.lng]
                ]);
            });
            
            // Show notification
            if (window.app && window.app.showNotification) {
                window.app.showNotification('info', 'Standort aktualisieren', 'Ziehen Sie den Marker an die neue Position und bestätigen Sie.');
            }
            
            // Store references for cleanup
            this.locationUpdateMarker = tempMarker;
            this.locationUpdateLine = connectionLine;
            this.newMarkerPosition = newPosition;
            
            // Set up map click handler for location updates
            this.setupLocationUpdateMapClick();
            
            // Update the confirm button to show location update confirmation
            this.isLocationUpdateMode = true;
            
            // Prevent bottom sheet from closing during location update
            if (window.bottomSheet) {
                window.bottomSheet.preventClose = true;
            }
            
        } catch (error) {
            this.logger.error('Failed to start location update:', error);
            alert('Fehler beim Starten der Standortaktualisierung: ' + error.message);
        }
    }

    /**
     * Setup map click handler for location updates
     */
    setupLocationUpdateMapClick() {
        const map = window.mapCore?.getMap();
        if (!map) return;
        
        this.locationUpdateMapClickHandler = (e) => {
            if (this.isLocationUpdateMode && this.locationUpdateMarker) {
                // Update marker position
                this.locationUpdateMarker.setLatLng(e.latlng);
                this.newMarkerPosition = e.latlng;
                
                // Update connection line
                if (this.locationUpdateLine) {
                    this.locationUpdateLine.setLatLngs([
                        [this.markerData.lat, this.markerData.lng],
                        [e.latlng.lat, e.latlng.lng]
                    ]);
                }
                
                this.logger.log('Location updated via map click:', e.latlng);
            }
        };
        
        // Add the map click handler with high priority
        map.on('click', this.locationUpdateMapClickHandler);
        this.logger.log('Location update map click handler added');
    }

    /**
     * Remove map click handler for location updates
     */
    removeLocationUpdateMapClick() {
        const map = window.mapCore?.getMap();
        if (map && this.locationUpdateMapClickHandler) {
            map.off('click', this.locationUpdateMapClickHandler);
            this.locationUpdateMapClickHandler = null;
            this.logger.log('Location update map click handler removed');
        }
    }

    /**
     * Handle action button click
     */
    async handleActionClick(actionId) {
        try {
            const action = this.availableActions.find(a => a.id === actionId);
            if (!action) {
                throw new Error(`Action ${actionId} not found`);
            }

            // Check if this is an edit action - activate inline edit mode
            if (action.action_type === 'edit') {
                await this.activateEditMode(actionId);
                return;
            }

            // Check if action requires confirmation
            if (action.requires_confirmation) {
                const confirmed = confirm(action.confirmation_message || 'Are you sure you want to perform this action?');
                if (!confirmed) {
                    return;
                }
            }

            // Check if action has editable fields (for non-edit actions with forms)
            const editableFields = await workflowEngine.getEditableFields(actionId);
            
            // If action has a form, render it in a new context
            if (action.form_id) {
                await this.renderActionForm(action);
            } else if (editableFields && editableFields.length > 0 && action.action_type !== 'edit') {
                // Handle non-edit action with editable fields (legacy fallback)
                await this.renderEditForm(action, editableFields);
            } else {
                // Execute action without form
                await this.executeAction(actionId, {});
            }
        } catch (error) {
            this.logger.error('Action execution failed:', error);
            alert('Failed to execute action: ' + error.message);
        }
    }

    /**
     * Render action form
     */
    async renderActionForm(action) {
        try {
            // For edit actions, don't show separate form - stay in current tabbed interface
            if (action.action_type === 'edit') {
                await this.activateEditMode(action.id);
                return;
            }

            // For non-edit actions with forms, show the form inline in the details tab
            this.activeTab = 'details';
            await this.renderTabbedInterface(
                this.cleanupTitle(this.markerData.title, this.markerData.createdAt), 
                this.markerData, 
                await this.getAllPhotos()
            );

            // Replace the detail tab content with the action form
            const detailContent = this.container.querySelector('.detail-tab-content');
            if (detailContent) {
                detailContent.innerHTML = `
                    <div class="inline-action-form">
                        <div class="form-title">
                            <h4>${action.button_label || action.action_name}</h4>
                        </div>
                        <div class="form-content" id="actionFormContent">
                            Loading form...
                        </div>
                        <div class="form-actions-inline">
                            <button class="btn-submit-inline" id="submitAction">Submit</button>
                            <button class="btn-cancel-inline" id="cancelAction">Cancel</button>
                        </div>
                    </div>
                `;

                // Render form
                const formContainer = document.getElementById('actionFormContent');
                await formRenderer.renderForm(action.form_id, this.instanceData.id, formContainer, action.id);

                // Setup form handlers
                this.setupInlineFormHandlers(action);
            }
        } catch (error) {
            this.logger.error('Failed to render action form:', error);
            alert('Failed to load form: ' + error.message);
        }
    }

    /**
     * Render edit form with editable fields (legacy method - now uses inline editing)
     */
    async renderEditForm(action, editableFields) {
        try {
            this.logger.log('Rendering edit form with editable fields (inline mode):', editableFields);
            
            // Use inline editing instead of separate form view
            await this.activateEditMode(action.id);
        } catch (error) {
            this.logger.error('Failed to render edit form:', error);
            alert('Failed to load edit form: ' + error.message);
        }
    }

    /**
     * Setup inline form handlers (for non-edit actions with forms)
     */
    setupInlineFormHandlers(action) {
        const submitButton = document.getElementById('submitAction');
        const cancelButton = document.getElementById('cancelAction');

        if (submitButton) {
            eventManager.add(submitButton, 'click', async () => {
                await this.handleFormSubmit(action);
            }, {
                component: 'marker-detail-module',
                description: 'Inline form submit handler'
            });
        }

        if (cancelButton) {
            eventManager.add(cancelButton, 'click', async () => {
                // Return to normal detail view
                await this.switchDetailTab(this.activeDetailTab);
            }, {
                component: 'marker-detail-module',
                description: 'Inline form cancel handler'
            });
        }
    }

    /**
     * Handle form submission
     */
    async handleFormSubmit(action) {
        try {
            this.logger.log('handleFormSubmit called with action:', action);
            const formContainer = document.getElementById('actionFormContent');
            
            if (!formContainer) {
                this.logger.error('Form container not found');
                return;
            }
            
            this.logger.log('Form container found:', formContainer);
            
            // Validate form
            const validation = await formRenderer.validateFormWithContext(
                formContainer, 
                this.instanceData.id, 
                action.id
            );

            this.logger.log('Form validation result:', validation);

            if (!validation.isValid) {
                alert('Form validation failed:\n' + validation.errors.join('\n'));
                return;
            }

            // Get form data
            this.logger.log('Getting form data...');
            const formData = formRenderer.getFormData(formContainer);
            
            this.logger.log('Form data retrieved:', {
                type: typeof formData,
                isMap: formData instanceof Map,
                size: formData.size,
                keys: Array.from(formData.keys())
            });
            
            // Execute action with form data
            this.logger.log('Executing action with form data...');
            await this.executeAction(action.id, formData);
            
            // Return to details view without losing current tab
            await this.renderTabbedInterface(
                this.cleanupTitle(this.markerData.title, this.markerData.createdAt), 
                this.markerData, 
                await this.getAllPhotos()
            );
        } catch (error) {
            this.logger.error('Form submission failed:', error);
            alert('Failed to submit form: ' + error.message);
        }
    }

    /**
     * Execute workflow action
     */
    async executeAction(actionId, formData) {
        try {
            await workflowEngine.executeActionWithForm(this.instanceData.id, actionId, formData);
            this.logger.log('Action executed successfully');
            
            // Refresh instance data
            await this.loadWorkflowInstanceData(this.instanceData.id);
        } catch (error) {
            this.logger.error('Action execution failed:', error);
            throw error;
        }
    }

    /**
     * Render properties object
     */
    renderProperties(properties) {
        // Fields already displayed in the main marker view that should be excluded
        const excludedFields = ['title', 'description', 'notes'];
        
        return Object.entries(properties)
            .filter(([key, value]) => !excludedFields.includes(key.toLowerCase()) && value !== null && value !== '')
            .map(([key, value]) => `
                <div class="property-row">
                    <span class="property-label">${key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</span>
                    <span class="property-value">${value}</span>
                </div>
            `).join('');
    }

    /**
     * Render error message
     */
    renderError(message) {
        this.container.innerHTML = `
            <div class="error-container">
                <div class="error-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <div class="error-message">${message}</div>
            </div>
        `;
    }

    /**
     * Clean up title to remove duplicate date information
     */
    cleanupTitle(title, createdAt) {
        if (!title || !createdAt) return title;
        
        // Extract date patterns from title to avoid duplication
        const createdDate = new Date(createdAt);
        const dateStr = createdDate.toLocaleDateString('de-DE'); // German date format
        
        // Remove date patterns from title if they match the created date
        const cleanedTitle = title.replace(new RegExp(`\\s*-\\s*${dateStr.replace(/\./g, '\\.')}\\s*$`), '');
        
        return cleanedTitle.trim();
    }

    /**
     * Load audit trail data
     */
    async loadAuditTrail() {
        try {
            // Get instance activity log for audit trail
            const response = await supabaseClient.getParticipantClient()
                .from('instance_activity_log')
                .select(`
                    id,
                    performed_at,
                    performed_by,
                    activity_type,
                    activity_summary,
                    activity_details,
                    field_changes,
                    stage_change
                `)
                .eq('instance_id', this.instanceData.id)
                .order('performed_at', { ascending: false });
                
            if (response.error) {
                this.logger.warn('Instance activity log query failed, skipping audit trail:', response.error);
                this.auditTrail = [];
                return;
            }

            const auditEntries = response.data || [];
            
            if (auditEntries.length === 0) {
                this.auditTrail = [];
                return;
            }

            // Get unique participant IDs from audit entries
            const participantIds = [...new Set(auditEntries.map(entry => entry.performed_by))];
            
            // Fetch participant information
            const participantsMap = new Map();
            if (participantIds.length > 0) {
                const { data: participants, error: participantsError } = await supabaseClient.getParticipantClient()
                    .from('participants')
                    .select('id, name, email')
                    .in('id', participantIds);
                    
                if (!participantsError && participants) {
                    participants.forEach(participant => {
                        participantsMap.set(participant.id, participant);
                    });
                }
            }
                
            // Transform the data to match the expected format
            this.auditTrail = auditEntries.map(entry => {
                const participant = participantsMap.get(entry.performed_by);
                const displayName = participant?.name || participant?.email || entry.performed_by || 'Unknown';
                
                return {
                    id: entry.id,
                    executed_at: entry.performed_at,
                    executed_by: displayName,
                    workflow_actions: {
                        button_label: entry.activity_summary,
                        action_name: entry.activity_type
                    },
                    notes: entry.activity_details?.notes || null,
                    activity_type: entry.activity_type,
                    field_changes: entry.field_changes,
                    stage_change: entry.stage_change
                };
            });
            
            this.logger.log('Loaded audit trail:', this.auditTrail);
        } catch (error) {
            this.logger.error('Failed to load audit trail:', error);
            this.auditTrail = [];
        }
    }

    /**
     * Get all photos from all stages
     */
    async getAllPhotos() {
        try {
            const collectedData = await workflowEngine.getInstanceData(this.instanceData.id);
            const photos = [];
            
            for (const item of collectedData) {
                // Check if this is a file field by looking at the form field definition or if the value looks like file paths
                const isFileField = item.field_type === 'file' || 
                    (item.form_fields?.field_type === 'file') ||
                    this.looksLikeFilePaths(item.field_value);
                
                if (isFileField && item.field_value) {
                    // Handle multiple files (comma-separated or JSON array)
                    const filePaths = this.extractFilePaths(item.field_value);
                    
                    for (const filePath of filePaths) {
                        if (this.isImageFile(filePath) && this.isStoragePath(filePath)) {
                            try {
                                // Convert storage path to proper URL
                                const { imageUploadService } = await import('../services/image-upload-service.js');
                                const imageUrl = imageUploadService.getImageUrl(filePath);
                                
                                if (imageUrl) {
                                    photos.push({
                                        url: imageUrl,
                                        caption: this.formatFieldLabel(item),
                                        stageName: this.getStageNameFromData(item),
                                        storagePath: filePath // Keep original path for reference
                                    });
                                }
                            } catch (error) {
                                this.logger.warn('Failed to convert storage path to URL:', filePath, error);
                            }
                        }
                    }
                }
            }
            
            this.logger.log('Found photos:', photos.length, 'photos from', collectedData.length, 'data items');
            return photos;
        } catch (error) {
            this.logger.error('Failed to get all photos:', error);
            return [];
        }
    }
    
    /**
     * Check if a value looks like file paths (storage paths pattern)
     */
    looksLikeFilePaths(value) {
        if (!value || typeof value !== 'string') return false;
        
        // Check for storage path patterns like "project-id/temp/filename.jpg" or comma-separated paths
        return value.includes('/temp/') || 
               value.includes('.jpg') || 
               value.includes('.jpeg') || 
               value.includes('.png') || 
               value.includes('.gif') || 
               value.includes('.webp');
    }
    
    /**
     * Extract file paths from a value (handle single path, comma-separated, or JSON array)
     */
    extractFilePaths(value) {
        if (!value || typeof value !== 'string') return [];
        
        // Skip invalid Windows file paths
        if (value.includes('C:\\fakepath\\')) return [];
        
        try {
            // Try to parse as JSON array first
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
                return parsed.filter(path => typeof path === 'string' && path.length > 0);
            }
        } catch {
            // Not JSON, continue with other methods
        }
        
        // Handle comma-separated paths
        if (value.includes(',')) {
            return value.split(',')
                .map(path => path.trim())
                .filter(path => path.length > 0);
        }
        
        // Single path
        return [value.trim()].filter(path => path.length > 0);
    }
    
    /**
     * Check if value is a storage path (project-id/instance-id/filename pattern)
     */
    isStoragePath(value) {
        if (!value || typeof value !== 'string') return false;
        // Storage path pattern: project-id/instance-id/filename.ext or project-id/temp/filename.ext
        const pathParts = value.split('/');
        if (pathParts.length === 3) {
            const filename = pathParts[2];
            // Check if it looks like our generated filename pattern or is an image file
            return this.isImageFile(filename) || (filename.includes('_') && this.isImageFile(filename.split('_').pop()));
        }
        return false;
    }

    /**
     * Check if a file value is an image
     */
    isImageFile(value) {
        if (!value || typeof value !== 'string') return false;
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
        return imageExtensions.some(ext => value.toLowerCase().includes(ext));
    }

    /**
     * Check if value is a storage path (project-id/instance-id/filename pattern)
     */
    isStoragePath(value) {
        if (!value || typeof value !== 'string') return false;
        const pathParts = value.split('/');
        if (pathParts.length === 3) {
            const filename = pathParts[2];
            return this.isImageFile(filename) || (filename.includes('_') && this.isImageFile(filename.split('_').pop()));
        }
        return false;
    }

    /**
     * Generate public URL for storage path
     */
    getImageUrl(storagePath) {
        if (!storagePath) {
            this.logger.warn('Empty storage path provided');
            return null;
        }

        // Clean up common malformed paths
        let cleanPath = storagePath;
        
        // Handle Windows file paths (C:\fakepath\...)
        if (cleanPath.includes('C:\\fakepath\\')) {
            this.logger.warn('Invalid Windows fakepath detected:', cleanPath);
            return null;
        }
        
        // Handle undefined project paths
        if (cleanPath.startsWith('undefined/')) {
            this.logger.warn('Invalid undefined project path detected:', cleanPath);
            return null;
        }

        // For public buckets, construct the URL directly to avoid RLS authentication issues
        const directPublicUrl = `http://192.168.1.91:8000/storage/v1/object/public/participant-images/${cleanPath}`;
        
        this.logger.debug('Using direct public URL approach:', {
            storagePath: cleanPath,
            directUrl: directPublicUrl
        });
        
        return directPublicUrl;
    }

    /**
     * Get stage name from data item
     */
    getStageNameFromData(dataItem) {
        if (dataItem.action_execution?.action?.to_stage_id) {
            return this.getStageNameById(dataItem.action_execution.action.to_stage_id);
        } else if (dataItem.action_execution?.action?.from_stage_id) {
            return this.getStageNameById(dataItem.action_execution.action.from_stage_id);
        }
        return 'Initial Data';
    }

    /**
     * Render the new tabbed interface
     */
    async renderTabbedInterface(cleanTitle, marker, allPhotos) {
        const currentStage = this.instanceData.workflow?.workflow_stages?.find(
            s => s.id === this.instanceData.current_stage_id
        );
        const totalStages = this.instanceData.workflow?.workflow_stages?.length || 1;
        const currentStageOrder = currentStage?.stage_order || 1;
        
        // Get creator info from database query
        const creatorName = await this.getCreatorName(this.instanceData.created_by);
        
        // Update the bottom sheet header with dynamic data
        const bottomSheet = window.bottomSheet || (await import('./bottom-sheet.js')).bottomSheet;
        if (bottomSheet && bottomSheet.updateHeaderData) {
            bottomSheet.updateHeaderData({
                title: cleanTitle,
                createdAt: this.instanceData.created_at,
                createdBy: creatorName,
                currentStage: currentStageOrder,
                totalStages: totalStages
            });
        }
        
        // Render action buttons
        const actionButtonsHtml = this.availableActions.length > 0 ? 
            `<div class="action-roll-bar">
                <div class="action-buttons-container">
                    ${await this.renderHorizontalActionButtons()}
                </div>
            </div>` : '';
        
        this.container.innerHTML = `
            <div class="dynamic-bottom-sheet">
                <!-- Action Buttons Roll Bar -->
                ${actionButtonsHtml}

                <!-- Tab Navigation -->
                <div class="tab-navigation">
                    <div class="tab-buttons">
                        <button class="tab-btn ${this.activeTab === 'overview' ? 'active' : ''}" data-tab="overview">
                            Übersicht
                        </button>
                        <button class="tab-btn ${this.activeTab === 'details' ? 'active' : ''}" data-tab="details">
                            Details
                        </button>
                        <button class="tab-btn ${this.activeTab === 'audit-trail' ? 'active' : ''}" data-tab="audit-trail">
                            Audit Trail
                        </button>
                    </div>
                </div>

                <!-- Tab Content -->
                <div class="tab-content-area">
                    <!-- Detail Sub-Tab Navigation (always visible) -->
                    ${this.activeTab === 'details' ? await this.renderDetailTabNavigation() : ''}
                    
                    <div id="tabContent">
                        ${await this.renderTabContent(allPhotos, marker)}
                    </div>
                </div>
            </div>
        `;
        
        // Setup event handlers
        this.setupTabbedInterfaceHandlers();
    }

    /**
     * Get creator name from participant ID
     */
    async getCreatorName(participantId) {
        try {
            if (!participantId) return 'Unknown';
            
            const response = await supabaseClient.getParticipantClient()
                .from('participants')
                .select('name')
                .eq('id', participantId)
                .single();
                
            if (response.error) {
                this.logger.warn('Failed to get creator name:', response.error);
                return 'Unknown';
            }
            
            return response.data?.name || 'Unknown';
        } catch (error) {
            this.logger.error('Error getting creator name:', error);
            return 'Unknown';
        }
    }

    /**
     * Render horizontal action buttons in Google Maps style
     */
    async renderHorizontalActionButtons() {
        let buttonsHtml = '';
        
        // Always show regular action buttons first
        buttonsHtml += this.availableActions.map(action => {
            const isEdit = action.action_type === 'edit';
            const iconClass = this.getActionIcon(action);
            const buttonColor = action.button_color || (isEdit ? '#FF9500' : '#007AFF');
            
            return `
                <button class="action-roll-btn" data-action-id="${action.id}" style="--button-color: ${buttonColor}">
                    <div class="action-icon">
                        <i class="${iconClass}"></i>
                    </div>
                    <span class="action-label">${action.button_label || action.action_name}</span>
                </button>
            `;
        }).join('');
        
        // If in edit mode, also add confirm/discard buttons alongside the regular ones
        if (this.isEditMode) {
            buttonsHtml += `
                <button class="action-roll-btn edit-confirm" data-edit-action="confirm" style="--button-color: #34C759">
                    <div class="action-icon">
                        <i class="fas fa-check"></i>
                    </div>
                    <span class="action-label">Bestätigen</span>
                </button>
                <button class="action-roll-btn edit-discard" data-edit-action="discard" style="--button-color: #FF3B30">
                    <div class="action-icon">
                        <i class="fas fa-times"></i>
                    </div>
                    <span class="action-label">Verwerfen</span>
                </button>
            `;
            
            // Add location update button if user has permission
            if (await this.hasLocationUpdatePermission()) {
                buttonsHtml += `
                    <button class="action-roll-btn location-update" data-edit-action="location-update" style="--button-color: #007AFF">
                        <div class="action-icon">
                            <i class="fas fa-map-marker-alt"></i>
                        </div>
                        <span class="action-label">Standort aktualisieren</span>
                    </button>
                `;
            }
        }
        
        return buttonsHtml;
    }

    /**
     * Get appropriate icon for action type
     */
    getActionIcon(action) {
        if (action.action_type === 'edit') return 'fas fa-edit';
        if (action.action_name?.toLowerCase().includes('complete')) return 'fas fa-check';
        if (action.action_name?.toLowerCase().includes('submit')) return 'fas fa-paper-plane';
        if (action.action_name?.toLowerCase().includes('approve')) return 'fas fa-thumbs-up';
        if (action.action_name?.toLowerCase().includes('reject')) return 'fas fa-times';
        return 'fas fa-arrow-right';
    }

    /**
     * Render modern action buttons (legacy method for compatibility)
     */
    renderModernActionButtons() {
        return this.renderHorizontalActionButtons();
    }

    /**
     * Render tab content based on active tab
     */
    async renderTabContent(allPhotos, marker) {
        switch (this.activeTab) {
            case 'overview':
                return await this.renderOverviewTab(allPhotos, marker);
            case 'details':
                return await this.renderDetailsTab();
            case 'audit-trail':
                return this.renderAuditTrailTab();
            default:
                return '<p>Invalid tab</p>';
        }
    }

    /**
     * Render assignment section based on permission level
     */
    async renderAssignmentSection(assignmentLevel) {
        // Only show editable assignment field if in edit mode AND have permissions
        if (this.isEditMode && assignmentLevel !== 'none') {
            // Show editable assignment field
            const currentAssignee = await this.getCurrentAssignee();
            const uniqueId = `assignment-selector-${this.markerData.id}`;
            
            return `
                <div class="info-item assignment-item">
                    <i class="fas fa-user-tag info-icon"></i>
                    <div class="info-content">
                        <div class="assignment-field-container">
                            <div id="${uniqueId}" class="assignment-selector"></div>
                        </div>
                        <div class="info-subtext">Zugewiesen an ${assignmentLevel === 'self' ? '(nur an Sie selbst)' : '(an alle Teilnehmer)'}</div>
                    </div>
                </div>
            `;
        } else {
            // Show read-only assignment info
            const currentAssignee = await this.getCurrentAssignee();
            return `
                <div class="info-item">
                    <i class="fas fa-user-tag info-icon"></i>
                    <div class="info-content">
                        <div class="info-value">${currentAssignee || 'Nicht zugewiesen'}</div>
                        <div class="info-subtext">Zugewiesen an</div>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Get current assignee name
     */
    async getCurrentAssignee() {
        try {
            const assignedParticipants = this.instanceData?.assigned_participants || this.markerData?.assigned_participants || [];
            if (!assignedParticipants || assignedParticipants.length === 0) {
                return null;
            }
            
            // Get the first assigned participant's name
            const participantId = assignedParticipants[0];
            const { data: participant, error } = await supabaseClient.getParticipantClient()
                .from('participants')
                .select('name')
                .eq('id', participantId)
                .single();
                
            if (error || !participant) {
                console.error('Error fetching participant:', error);
                return 'Unknown Participant';
            }
            
            return participant.name;
        } catch (error) {
            console.error('Error getting current assignee:', error);
            return 'Unknown';
        }
    }

    /**
     * Setup assignment selector for editable assignment fields
     */
    async setupAssignmentSelector() {
        try {
            console.log('DEBUG: Setting up assignment selector...');
            const assignmentLevel = await this.getAssignmentPermissionLevel();
            console.log('DEBUG: Assignment level:', assignmentLevel);
            
            if (assignmentLevel === 'none') {
                console.log('DEBUG: No assignment permissions, skipping selector setup');
                return; // No assignment permissions, no selector needed
            }
            
            const uniqueId = `assignment-selector-${this.markerData.id}`;
            console.log('DEBUG: Looking for container with ID:', uniqueId);
            const selectorContainer = document.getElementById(uniqueId);
            
            if (!selectorContainer) {
                console.error('DEBUG: Container not found! Available elements:', document.querySelectorAll('[id*="assignment"]'));
                return; // Container not found
            }
            
            console.log('DEBUG: Container found:', selectorContainer);
            
            // Get current participant info for self-assignment filtering
            const auth = participantAuth.getAuthStatus();
            const currentParticipantId = auth.participant?.id;
            
            // Configure EntitySelector options
            const selectorOptions = {
                tableName: 'participants',
                projectId: this.markerData.workflow?.project_id || null,
                projectIdField: 'project_id',
                idField: 'id',
                nameField: 'name',
                descriptionField: 'email',
                placeholder: assignmentLevel === 'self' ? 'An Sie zuweisen...' : 'Teilnehmer auswählen...',
                label: 'Zuweisen an',
                entityName: 'participant',
                allowCreation: false,
                allowSelection: true,
                showQuickSelect: false,
                maxSelections: 1,
                onSelectionChange: (selectedEntities) => {
                    console.log('DEBUG: Selection changed:', selectedEntities);
                }
            };
            
            // Add filters for self-assignment
            if (assignmentLevel === 'self' && currentParticipantId) {
                selectorOptions.filters = {
                    id: currentParticipantId
                };
                console.log('DEBUG: Added self-assignment filter for participant:', currentParticipantId);
            } else {
                console.log('DEBUG: No filtering - showing all participants for assignment level:', assignmentLevel);
            }
            
            // Initialize EntitySelector
            this.assignmentSelector = new EntitySelector(uniqueId, selectorOptions);
            
            // Set current assignee if any
            const currentAssignee = await this.getCurrentAssigneeEntity();
            if (currentAssignee) {
                setTimeout(() => {
                    this.assignmentSelector.setSelectedEntities([currentAssignee]);
                }, 100);
            }
            
            
            console.log('DEBUG: EntitySelector initialized successfully');
            
        } catch (error) {
            this.logger.error('Error setting up assignment selector:', error);
        }
    }

    /**
     * Get current assignee as entity object
     */
    async getCurrentAssigneeEntity() {
        try {
            const assignedParticipants = this.instanceData?.assigned_participants || this.markerData?.assigned_participants || [];
            if (!assignedParticipants || assignedParticipants.length === 0) {
                return null;
            }
            
            const participantId = assignedParticipants[0];
            const { data: participant, error } = await supabaseClient.getParticipantClient()
                .from('participants')
                .select('id, name, email')
                .eq('id', participantId)
                .single();
                
            if (error || !participant) {
                console.error('Error fetching participant entity:', error);
                return null;
            }
            
            return {
                id: participant.id,
                name: participant.name,
                description: participant.email
            };
        } catch (error) {
            console.error('Error getting current assignee entity:', error);
            return null;
        }
    }

    /**
     * Handle assignment save if there are changes
     */
    async handleAssignmentSaveIfNeeded() {
        if (!this.assignmentSelector) {
            return;
        }

        const selectedEntities = this.assignmentSelector.getSelectedEntities();
        const currentAssignment = this.instanceData?.assigned_participants || this.markerData?.assigned_participants || [];
        
        // Check if assignment has changed
        const hasChanged = selectedEntities.length !== currentAssignment.length || 
                          (selectedEntities.length > 0 && selectedEntities[0].id !== currentAssignment[0]?.id);
        
        if (hasChanged) {
            await this.handleAssignmentSave();
        }
    }

    /**
     * Handle assignment save
     */
    async handleAssignmentSave() {
        try {
            if (!this.assignmentSelector) {
                console.error('Assignment selector not initialized');
                return;
            }
            
            const selectedParticipants = this.assignmentSelector.getSelectedEntityIds();
            
            // Update assignment in database with audit trail
            try {
                await supabaseClient.updateWithAudit(
                    'workflow_instances',
                    this.markerData.id,
                    {
                        assigned_participants: selectedParticipants
                    },
                    {
                        activityType: 'participant_assignment',
                        activitySummary: 'Updated assigned participants'
                    }
                );
            } catch (error) {
                console.error('Error saving assignment:', error);
                if (window.app && window.app.showNotification) {
                    window.app.showNotification('error', 'Fehler', 'Zuweisung konnte nicht gespeichert werden: ' + error.message);
                }
                return;
            }
            
            // Update local data
            if (this.instanceData) {
                this.instanceData.assigned_participants = selectedParticipants;
            }
            if (this.markerData) {
                this.markerData.assigned_participants = selectedParticipants;
            }
            
            
            // Show success notification
            if (window.app && window.app.showNotification) {
                const participantName = selectedParticipants.length > 0 
                    ? this.assignmentSelector.getSelectedEntities()[0]?.name 
                    : 'niemand';
                window.app.showNotification('success', 'Gespeichert', `Workflow-Instanz wurde an ${participantName} zugewiesen`);
            }
            
            this.logger.log('Assignment saved successfully:', selectedParticipants);
            
        } catch (error) {
            this.logger.error('Error handling assignment save:', error);
            if (window.app && window.app.showNotification) {
                window.app.showNotification('error', 'Fehler', 'Unbekannter Fehler beim Speichern der Zuweisung');
            }
        }
    }

    /**
     * Render overview tab content
     */
    async renderOverviewTab(allPhotos, marker) {
        const latestExecution = this.auditTrail[0]; // First item since we're now ordering newest first
        const latestParticipant = latestExecution?.executed_by || 'Unknown';
        const location = this.extractLocationFromMarker(marker);
        
        // Check assignment permissions and render appropriate field
        const assignmentLevel = await this.getAssignmentPermissionLevel();
        const assignmentSection = await this.renderAssignmentSection(assignmentLevel);
        
        return `
            <div class="overview-content">
                <!-- Core Info -->
                <div class="core-info-section">
                    <div class="info-item">
                        <i class="fas fa-map-marker-alt info-icon"></i>
                        <div class="info-content">
                            <div class="info-value">${location}</div>
                        </div>
                    </div>
                    
                    <div class="info-item">
                        <i class="fas fa-clock info-icon"></i>
                        <div class="info-content">
                            <div class="info-value">Geöffnet • Bearbeitung läuft</div>
                            <div class="info-subtext">Status aktiv</div>
                        </div>
                    </div>
                    
                    ${assignmentSection}
                </div>

                <!-- Photo Gallery -->
                ${allPhotos.length > 0 ? `
                    <div class="photo-gallery-section">
                        <h3 class="section-title">
                            <i class="fas fa-camera"></i>
                            Fotos (${allPhotos.length})
                        </h3>
                        <div class="photo-grid">
                            ${allPhotos.slice(0, 4).map((photo, idx) => `
                                <div class="photo-thumbnail">
                                    <img src="${photo.url}" 
                                         alt="${photo.caption}" 
                                         class="photo-image"
                                         data-fullsize="${photo.url}"
                                         onerror="this.style.display='none'; this.closest('.photo-thumbnail').style.display='none';" />
                                </div>
                            `).join('')}
                        </div>
                        ${allPhotos.length > 4 ? `
                            <button class="show-all-photos-btn">
                                Alle ${allPhotos.length} Fotos ansehen
                            </button>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Render detail tab navigation separately
     */
    async renderDetailTabNavigation() {
        const collectedData = await workflowEngine.getInstanceData(this.instanceData.id);
        const visibleData = await this.filterDataByStageVisibility(collectedData);
        
        if (visibleData.length === 0) {
            return '';
        }
        
        return `
            <div class="detail-tab-navigation">
                <div class="detail-tab-buttons connected-tabs">
                    ${this.renderDetailTabButtons(visibleData)}
                </div>
            </div>
        `;
    }

    /**
     * Render details tab content (without navigation)
     */
    async renderDetailsTab() {
        const collectedData = await workflowEngine.getInstanceData(this.instanceData.id);
        const visibleData = await this.filterDataByStageVisibility(collectedData);
        
        if (visibleData.length === 0) {
            return '<div class="no-data">No data visible for your role</div>';
        }
        
        return `
            <div class="details-content">
                <!-- Detail Content -->
                <div class="detail-tab-content">
                    ${await this.renderDetailTabContent(visibleData)}
                </div>
            </div>
        `;
    }

    /**
     * Render detail tab buttons - only stage-based tabs
     */
    renderDetailTabButtons(visibleData) {
        // Use stage-based tabs 
        const groupedData = this.groupDataByStage(visibleData);
        
        // Get stage names and sort them by stage order
        const stageNames = Object.keys(groupedData);
        const sortedStageNames = stageNames.sort((a, b) => {
            const stageA = this.instanceData.workflow?.workflow_stages?.find(s => s.stage_name === a);
            const stageB = this.instanceData.workflow?.workflow_stages?.find(s => s.stage_name === b);
            const orderA = stageA?.stage_order || 999;
            const orderB = stageB?.stage_order || 999;
            return orderA - orderB;
        });
        
        return sortedStageNames.map((stageName, index) => `
            <button class="detail-tab-btn ${this.activeDetailTab === stageName ? 'active' : ''}" data-detail-tab="${stageName}">
                ${stageName}
            </button>
        `).join('');
    }

    /**
     * Render detail tab content - only stage-based content
     */
    async renderDetailTabContent(visibleData) {
        return await this.renderStageBasedContent(visibleData);
    }

    /**
     * Render custom category content
     */
    renderCustomCategoryContent(visibleData) {
        const categoryData = this.organizeDataByCustomCategories(visibleData);
        
        switch (this.activeDetailTab) {
            case 'reparatur':
                return this.renderFieldGroup(categoryData.reparatur || []);
            case 'verantwortlichkeiten':
                return this.renderFieldGroup(categoryData.verantwortlichkeiten || []);
            case 'dokumentation':
                return this.renderFieldGroup(categoryData.dokumentation || []);
            default:
                return '<div class="no-data">No data for this category</div>';
        }
    }

    /**
     * Render stage-based content
     */
    async renderStageBasedContent(visibleData) {
        const groupedData = this.groupDataByStage(visibleData);
        const stageData = groupedData[this.activeDetailTab] || [];
        
        if (stageData.length === 0 && !this.isEditMode) {
            return '<div class="no-data">No data for this stage</div>';
        }
        
        // In edit mode, we need to pass ALL data for field prepopulation
        // but filter the editable fields to only those relevant to the current stage
        if (this.isEditMode) {
            return await this.renderFieldGroup(visibleData); // Pass all data for prepopulation
        }
        
        return await this.renderFieldGroup(stageData);
    }

    /**
     * Render field group with page origin card
     */
    async renderFieldGroup(data) {
        // In edit mode, show all available fields including empty editable ones
        if (this.isEditMode) {
            return await this.renderEditableFieldGroup(data);
        }
        
        // Normal mode - only show fields with data, but make them clickable if editable
        if (!data || data.length === 0) {
            return '<div class="no-data">No data available</div>';
        }
        
        // Check if any of these fields are editable to show click hints
        const editActionsWithFields = [];
        for (const action of this.availableActions.filter(a => a.action_type === 'edit')) {
            try {
                const editableFields = await workflowEngine.getEditableFields(action.id);
                if (editableFields && editableFields.length > 0) {
                    editActionsWithFields.push({
                        action: action,
                        editableFields: editableFields
                    });
                }
            } catch (error) {
                this.logger.warn(`Failed to get editable fields for action ${action.id}:`, error);
            }
        }
        
        const editableFieldIds = new Set(
            editActionsWithFields
                .flatMap(item => item.editableFields)
                .map(field => field.id)
        );
        
        const fieldItems = data.map(item => {
            const isEditable = editableFieldIds.has(item.field_id);
            const editActionWithField = editActionsWithFields.find(actionItem =>
                actionItem.editableFields.some(field => field.id === item.field_id)
            );
            
            return `
                <div class="field-item ${isEditable ? 'clickable-field' : ''}" 
                     ${isEditable ? `data-field-id="${item.field_id}" data-action-id="${editActionWithField?.action.id || ''}"` : ''}>
                    <label class="field-label">${this.formatFieldLabel(item)}</label>
                    <div class="field-value">
                        ${this.formatFieldValue(item.field_value, item.field_type)}
                        ${isEditable ? '<i class="fas fa-edit field-edit-icon"></i>' : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        // Group the stage data by pages and create cards
        const pageGroupedData = this.groupDataByPage(data);
        const pageCards = [];
        
        for (const [pageTitle, pageData] of Object.entries(pageGroupedData)) {
            const pageFieldItems = pageData.map(item => {
                const isEditable = editableFieldIds.has(item.field_id);
                const editActionWithField = editActionsWithFields.find(actionItem =>
                    actionItem.editableFields.some(field => field.id === item.field_id)
                );
                
                return `
                    <div class="field-item ${isEditable ? 'clickable-field' : ''}" 
                         ${isEditable ? `data-field-id="${item.field_id}" data-action-id="${editActionWithField?.action.id || ''}"` : ''}>
                        <label class="field-label">${this.formatFieldLabel(item)}</label>
                        <div class="field-value">
                            ${this.formatFieldValue(item.field_value, item.field_type)}
                            ${isEditable ? '<i class="fas fa-edit field-edit-icon"></i>' : ''}
                        </div>
                    </div>
                `;
            }).join('');
            
            const fieldCount = pageData.length;
            pageCards.push(`
                <div class="page-data-card">
                    <div class="page-card-header">
                        <h5 class="page-title">${pageTitle}</h5>
                        <div class="page-field-count">${fieldCount} ${fieldCount === 1 ? 'field' : 'fields'}</div>
                    </div>
                    <div class="page-card-content">
                        ${pageFieldItems}
                    </div>
                </div>
            `);
        }
        
        return pageCards.join('');
    }

    /**
     * Render inline edit field group - maintains same visual appearance as details but with inline inputs
     */
    async renderEditableFieldGroup(allData) {
        try {
            this.logger.log('Rendering inline edit fields for current stage:', this.activeDetailTab);

            // Filter data to current stage just like in normal view
            const groupedData = this.groupDataByStage(allData);
            const currentStageData = groupedData[this.activeDetailTab] || [];

            this.logger.log(`Current stage data for ${this.activeDetailTab}:`, currentStageData);
            
            // Get editable field info with full field definitions
            const editableFieldsMap = new Map();
            if (this.editableFields && this.editableFields.length > 0) {
                this.logger.log('=== ALL EDITABLE FIELDS ===');
                for (const field of this.editableFields) {
                    // Use field.id for lookup (editable fields come from form_fields table which has 'id')
                    const fieldId = field.id;
                    editableFieldsMap.set(fieldId, field);
                    this.logger.log(`Editable field ${fieldId}:`, JSON.stringify(field, null, 2));
                }
                this.logger.log('=== END EDITABLE FIELDS ===');
            }
            
            // If no data in this stage but we have editable fields, show empty editable fields
            if (currentStageData.length === 0) {
                // Get stage-relevant editable fields to show empty inputs
                const stageRelevantFields = await this.getPageRelevantEditableFields();

                if (stageRelevantFields.length === 0) {
                    return '<div class="no-data">No fields available for editing in this stage</div>';
                }
                
                return `
                    <div class="field-group editing-inline">
                        ${stageRelevantFields.map(field => {
                            const fieldId = field.id;
                            const fieldLabel = field.field_label || fieldId;
                            
                            return `
                                <div class="field-item inline-editable">
                                    <label class="field-label">${fieldLabel}</label>
                                    <div class="field-value">
                                        ${this.renderInlineEditableValue(field, '', field.field_type)}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }
            
            // Show existing data with editable fields as inputs while maintaining visual appearance
            return `
                <div class="field-group editing-inline">
                    ${currentStageData.map(item => {
                        const editableField = editableFieldsMap.get(item.field_id);
                        const isEditable = !!editableField;
                        const fieldLabel = this.formatFieldLabel(item);
                        const currentValue = item.field_value || '';
                        
                        this.logger.log(`Rendering field ${item.field_id}: editable=${isEditable}`, editableField);
                        
                        return `
                            <div class="field-item ${isEditable ? 'inline-editable' : 'readonly'}">
                                <label class="field-label">${fieldLabel}</label>
                                <div class="field-value">
                                    ${isEditable ? 
                                        this.renderInlineEditableValue(editableField, currentValue, item.field_type) : 
                                        this.formatFieldValue(currentValue, item.field_type)
                                    }
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
            
        } catch (error) {
            this.logger.error('Failed to render inline edit field group:', error);
            return '<div class="error">Failed to load editable fields</div>';
        }
    }
    
    /**
     * Get editable fields that are relevant to the current active page
     */
    async getPageRelevantEditableFields() {
        if (!this.editableFields || !this.activeDetailTab) {
            return [];
        }
        
        try {
            // Get all current data to understand field-to-stage mapping
            const collectedData = await workflowEngine.getInstanceData(this.instanceData.id);
            const visibleData = await this.filterDataByStageVisibility(collectedData);
            const groupedData = this.groupDataByStage(visibleData);
            
            // Debug logging
            this.logger.log(`Current stage: ${this.activeDetailTab}`);
            this.logger.log(`Available stages in grouped data:`, Object.keys(groupedData));
            this.logger.log(`All editable fields:`, this.editableFields.map(f => ({ id: f.field_id, label: f.field_label })));
            
            // Get existing data for the current stage
            const stageData = groupedData[this.activeDetailTab] || [];
            const stageFieldIds = new Set(stageData.map(item => item.field_id));
            
            this.logger.log(`Fields in current stage ${this.activeDetailTab}:`, Array.from(stageFieldIds));
            this.logger.log(`Stage data items:`, stageData.map(item => ({ 
                field_id: item.field_id, 
                field_label: this.formatFieldLabel(item),
                field_value: item.field_value 
            })));
            
            // If no fields in current stage, let's be more permissive
            // Maybe the user wants to add new data to this stage
            if (stageFieldIds.size === 0) {
                this.logger.log(`No existing data in stage ${this.activeDetailTab}, showing all editable fields`);
                return this.editableFields;
            }
            
            // Apply the same semantic stage assignment logic to editable fields
            // This matches the logic in groupDataByStage() method
            const stageRelevantFields = this.editableFields.filter(field => {
                const fieldLabel = (field.field_label || field.id || '').toLowerCase();
                let assignedStageName = null;
                
                // Apply semantic matching (same as groupDataByStage method)
                if (fieldLabel.includes('matschpfütze') || fieldLabel.includes('wann war das')) {
                    // These belong to the initial reporting stage (Meldung)
                    const startStage = this.instanceData.workflow?.workflow_stages?.find(
                        s => s.stage_type === 'start' || s.stage_order === 1
                    );
                    if (startStage) {
                        assignedStageName = startStage.stage_name;
                    }
                }
                else if (fieldLabel.includes('erledigen') || fieldLabel.includes('reparatur')) {
                    // These belong to the repair stage
                    const repairStage = this.instanceData.workflow?.workflow_stages?.find(
                        s => s.stage_name.toLowerCase().includes('reparatur') || s.stage_order > 1
                    );
                    if (repairStage) {
                        assignedStageName = repairStage.stage_name;
                    }
                }
                
                // If no semantic match, try to match by existing data
                if (!assignedStageName) {
                    const hasDataInStage = stageFieldIds.has(field.id);
                    if (hasDataInStage) {
                        assignedStageName = this.activeDetailTab;
                    }
                }
                
                const isRelevant = assignedStageName === this.activeDetailTab;
                
                this.logger.log(`Field "${field.field_label}" (${field.id}): assigned to "${assignedStageName}", current stage "${this.activeDetailTab}", relevant: ${isRelevant}`);
                
                return isRelevant;
            });
            
            this.logger.log(`Stage ${this.activeDetailTab}: showing ${stageRelevantFields.length} of ${this.editableFields.length} editable fields`);
            
            // Temporary: if no stage-relevant fields found, show all editable fields
            // This allows testing while we debug the stage filtering
            if (stageRelevantFields.length === 0) {
                this.logger.warn(`No stage-relevant fields found for ${this.activeDetailTab}, showing all editable fields as fallback`);
                return this.editableFields;
            }
            
            return stageRelevantFields;
            
        } catch (error) {
            this.logger.error('Failed to get stage relevant fields:', error);
            // Fallback to all editable fields
            return this.editableFields;
        }
    }
    
    /**
     * Render inline editable value that looks like normal text but can be edited
     */
    renderInlineEditableValue(field, currentValue, displayType) {
        const fieldId = field.id;
        const fieldType = field.field_type || field.type || 'text';
        const isRequired = field.required || false;
        const placeholder = field.placeholder || 'Click to edit';
        
        // Debug logging to see what we're working with
        this.logger.log(`=== FIELD DEBUG ${fieldId} ===`);
        this.logger.log('Full field object:', JSON.stringify(field, null, 2));
        this.logger.log('Field type detected:', fieldType);
        this.logger.log('Field.options:', field.options);
        this.logger.log('Field.field_options:', field.field_options);
        this.logger.log('Field.field_config:', field.field_config);
        this.logger.log('Current value:', currentValue);
        this.logger.log('=== END FIELD DEBUG ===');
        
        // Auto-detect dropdown fields based on field type and presence of options
        let actualFieldType = fieldType;
        const hasOptions = !!(field.options || 
                            (field.field_options && field.field_options.options) || 
                            (field.field_config && field.field_config.options));
        
        // Convert 'dropdown' field type to 'select' for rendering
        if (fieldType === 'dropdown' || (hasOptions && (fieldType === 'text' || fieldType === 'string' || !fieldType))) {
            actualFieldType = 'select';
            this.logger.log(`Detected field ${fieldId} as dropdown - fieldType: ${fieldType}, hasOptions: ${hasOptions}`);
        }
        
        // Create input that looks like the formatted text value but is editable
        switch (actualFieldType) {
            case 'textarea':
                return `
                    <textarea 
                        class="inline-edit-input" 
                        id="${fieldId}" 
                        name="${fieldId}"
                        placeholder="${placeholder}"
                        ${isRequired ? 'required' : ''}
                        rows="2"
                        style="width: 100%; border: none; background: transparent; resize: vertical; font-family: inherit; font-size: inherit; color: inherit; padding: 2px; margin: 0; outline: none;"
                    >${currentValue}</textarea>
                `;
                
            case 'select':
                // Handle different option structures based on your debug output
                let options = [];
                if (field.options && Array.isArray(field.options)) {
                    options = field.options;
                } else if (field.field_options && field.field_options.options && Array.isArray(field.field_options.options)) {
                    options = field.field_options.options;
                } else if (field.field_options && Array.isArray(field.field_options)) {
                    options = field.field_options;
                } else if (field.field_config && field.field_config.options) {
                    options = field.field_config.options;
                }
                
                this.logger.log(`Dropdown field ${fieldId}: found ${options.length} options`, options);
                
                const optionHtml = options.map(option => {
                    // Handle different option formats
                    const value = option.value || option.id || option;
                    const label = option.label || option.name || option.text || option.value || option;
                    return `<option value="${value}" ${value === currentValue ? 'selected' : ''}>${label}</option>`;
                }).join('');
                
                return `
                    <select 
                        class="inline-edit-input" 
                        id="${fieldId}" 
                        name="${fieldId}"
                        ${isRequired ? 'required' : ''}
                        style="width: 100%; border: none; background: transparent; font-family: inherit; font-size: inherit; color: inherit; padding: 0; outline: none;"
                    >
                        <option value="">-- Select --</option>
                        ${optionHtml}
                    </select>
                `;
                
            case 'checkbox':
                return `
                    <label class="checkbox-container" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                        <input 
                            type="checkbox" 
                            class="inline-edit-input"
                            id="${fieldId}" 
                            name="${fieldId}"
                            value="true"
                            ${currentValue === 'true' || currentValue === true ? 'checked' : ''}
                            style="width: 16px; height: 16px;"
                        />
                        <span style="font-size: inherit; color: inherit;">${currentValue === 'true' ? 'Yes' : 'No'}</span>
                    </label>
                `;
                
            case 'date':
                return `
                    <input 
                        type="date" 
                        class="inline-edit-input" 
                        id="${fieldId}" 
                        name="${fieldId}"
                        value="${currentValue}"
                        ${isRequired ? 'required' : ''}
                        style="width: 100%; border: none; background: transparent; font-family: inherit; font-size: inherit; color: inherit; padding: 2px; margin: 0; outline: none;"
                    />
                `;
                
            case 'number':
                return `
                    <input 
                        type="number" 
                        class="inline-edit-input" 
                        id="${fieldId}" 
                        name="${fieldId}"
                        value="${currentValue}"
                        placeholder="${placeholder}"
                        ${isRequired ? 'required' : ''}
                        style="width: 100%; border: none; background: transparent; font-family: inherit; font-size: inherit; color: inherit; padding: 2px; margin: 0; outline: none;"
                    />
                `;
                
            default: // text, email, etc.
                return `
                    <input 
                        type="${fieldType}" 
                        class="inline-edit-input" 
                        id="${fieldId}" 
                        name="${fieldId}"
                        value="${currentValue}"
                        placeholder="${placeholder}"
                        ${isRequired ? 'required' : ''}
                        style="width: 100%; border: none; background: transparent; font-family: inherit; font-size: inherit; color: inherit; padding: 2px; margin: 0; outline: none;"
                    />
                `;
        }
    }

    /**
     * Render an editable input control for a specific field
     */
    renderEditableInput(field, currentValue) {
        const fieldId = field.id;
        const fieldType = field.field_type || 'text';
        const isRequired = field.required || false;
        const placeholder = field.placeholder || '';
        
        switch (fieldType) {
            case 'textarea':
                return `
                    <textarea 
                        class="field-input" 
                        id="${fieldId}" 
                        name="${fieldId}"
                        placeholder="${placeholder}"
                        ${isRequired ? 'required' : ''}
                        rows="3"
                    >${currentValue}</textarea>
                `;
                
            case 'select':
                const options = field.options || [];
                const optionHtml = options.map(option => 
                    `<option value="${option.value}" ${option.value === currentValue ? 'selected' : ''}>${option.label}</option>`
                ).join('');
                
                return `
                    <select 
                        class="field-input" 
                        id="${fieldId}" 
                        name="${fieldId}"
                        ${isRequired ? 'required' : ''}
                    >
                        <option value="">-- Select --</option>
                        ${optionHtml}
                    </select>
                `;
                
            case 'checkbox':
                return `
                    <label class="checkbox-container">
                        <input 
                            type="checkbox" 
                            id="${fieldId}" 
                            name="${fieldId}"
                            value="true"
                            ${currentValue === 'true' || currentValue === true ? 'checked' : ''}
                        />
                        <span class="checkmark"></span>
                        Enable
                    </label>
                `;
                
            case 'date':
                return `
                    <input 
                        type="date" 
                        class="field-input" 
                        id="${fieldId}" 
                        name="${fieldId}"
                        value="${currentValue}"
                        placeholder="${placeholder}"
                        ${isRequired ? 'required' : ''}
                    />
                `;
                
            case 'number':
                return `
                    <input 
                        type="number" 
                        class="field-input" 
                        id="${fieldId}" 
                        name="${fieldId}"
                        value="${currentValue}"
                        placeholder="${placeholder}"
                        ${isRequired ? 'required' : ''}
                    />
                `;
                
            default: // text, email, etc.
                return `
                    <input 
                        type="${fieldType}" 
                        class="field-input" 
                        id="${fieldId}" 
                        name="${fieldId}"
                        value="${currentValue}"
                        placeholder="${placeholder}"
                        ${isRequired ? 'required' : ''}
                    />
                `;
        }
    }


    /**
     * Organize data by custom categories
     */
    organizeDataByCustomCategories(data) {
        const categories = {
            reparatur: [],
            verantwortlichkeiten: [],
            dokumentation: []
        };
        
        for (const item of data) {
            const fieldLabel = this.formatFieldLabel(item).toLowerCase();
            
            // Categorize based on field content (using field_label from form_fields)
            if (fieldLabel.includes('material') || fieldLabel.includes('cost') || fieldLabel.includes('reparatur')) {
                categories.reparatur.push(item);
            } else if (fieldLabel.includes('responsible') || fieldLabel.includes('contact') || fieldLabel.includes('verantwort') || fieldLabel.includes('ansprech')) {
                categories.verantwortlichkeiten.push(item);
            } else {
                categories.dokumentation.push(item);
            }
        }
        
        return categories;
    }

    /**
     * Render audit trail tab content
     */
    renderAuditTrailTab() {
        if (this.auditTrail.length === 0) {
            return '<div class="no-data">No audit trail data available</div>';
        }
        
        return `
            <div class="audit-trail-content">
                <h3 class="audit-title">Verlauf</h3>
                <div class="audit-timeline">
                    ${this.auditTrail.map((entry, idx) => `
                        <div class="audit-entry">
                            <div class="audit-avatar">
                                <i class="fas fa-user"></i>
                            </div>
                            <div class="audit-content">
                                <div class="audit-header">
                                    <span class="audit-participant">${entry.executed_by || 'Unknown'}</span>
                                    <span class="audit-time">${this.formatDateTime(entry.executed_at)}</span>
                                </div>
                                <div class="audit-action">${entry.workflow_actions?.button_label || entry.workflow_actions?.action_name || 'Action performed'}</div>
                                ${entry.notes ? `<div class="audit-notes">${entry.notes}</div>` : ''}
                            </div>
                            ${idx < this.auditTrail.length - 1 ? '<div class="audit-connector"></div>' : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Setup event handlers for tabbed interface
     */
    setupTabbedInterfaceHandlers() {
        // Tab navigation handlers
        const tabButtons = this.container.querySelectorAll('.tab-btn');
        tabButtons.forEach(button => {
            eventManager.add(button, 'click', async () => {
                const tab = button.getAttribute('data-tab');
                await this.switchTab(tab);
            }, {
                component: 'marker-detail-module',
                description: `Tab button handler for ${button.getAttribute('data-tab')}`
            });
        });
        
        // Detail tab handlers
        const detailTabButtons = this.container.querySelectorAll('.detail-tab-btn');
        detailTabButtons.forEach(button => {
            eventManager.add(button, 'click', async () => {
                const detailTab = button.getAttribute('data-detail-tab');
                await this.switchDetailTab(detailTab);
            }, {
                component: 'marker-detail-module',
                description: `Detail tab button handler for ${button.getAttribute('data-detail-tab')}`
            });
        });
        
        
        // Action button handlers
        this.setupActionHandlers();
        
        // Clickable field handlers
        this.setupClickableFieldHandlers();
        
        // Photo gallery handlers
        this.setupPhotoGalleryHandlers();
        
        // Edit mode handlers
        if (this.isEditMode) {
            this.setupEditModeHandlers();
        }
    }

    /**
     * Switch to a different main tab
     */
    async switchTab(tab) {
        this.activeTab = tab;
        
        // Expand the bottom sheet when a tab is clicked (mobile only)
        const bottomSheet = window.bottomSheet || (await import('./bottom-sheet.js')).bottomSheet;
        if (bottomSheet && bottomSheet.state && bottomSheet.state.isMobile && bottomSheet.state.isOpen && !bottomSheet.state.isExpanded) {
            bottomSheet.expand();
        }
        
        // Update tab button states
        const tabButtons = this.container.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
        });
        
        // Update detail navigation visibility
        const detailNavContainer = this.container.querySelector('.detail-tab-navigation');
        if (tab === 'details') {
            if (!detailNavContainer) {
                // Add detail navigation if switching to details tab
                const tabContentArea = this.container.querySelector('.tab-content-area');
                const detailNavHtml = await this.renderDetailTabNavigation();
                if (detailNavHtml) {
                    tabContentArea.insertAdjacentHTML('afterbegin', detailNavHtml);
                    this.setupDetailTabHandlers();
                }
            }
        } else {
            // Remove detail navigation if switching away from details tab
            if (detailNavContainer) {
                detailNavContainer.remove();
            }
        }
        
        // Update tab content
        const tabContentElement = this.container.querySelector('#tabContent');
        if (tabContentElement) {
            const allPhotos = await this.getAllPhotos();
            tabContentElement.innerHTML = await this.renderTabContent(allPhotos, this.markerData);
            
            // Re-setup tab-specific handlers
            if (tab === 'details') {
                this.setupDetailTabHandlers();
                this.setupClickableFieldHandlers();
            } else if (tab === 'overview') {
                // Setup photo gallery handlers for overview tab
                this.setupPhotoGalleryHandlers();
                // If in edit mode, setup assignment selector for overview tab
                if (this.isEditMode) {
                    setTimeout(async () => {
                        await this.setupAssignmentSelector();
                    }, 100);
                }
            }
            
            // Always setup photo gallery handlers since photos might be in any tab
            this.setupPhotoGalleryHandlers();
        }
    }

    /**
     * Switch to a different detail sub-tab
     */
    async switchDetailTab(detailTab) {
        this.activeDetailTab = detailTab;
        
        // Expand the bottom sheet when a detail tab is clicked (mobile only)
        const bottomSheet = window.bottomSheet || (await import('./bottom-sheet.js')).bottomSheet;
        if (bottomSheet && bottomSheet.state && bottomSheet.state.isMobile && bottomSheet.state.isOpen && !bottomSheet.state.isExpanded) {
            bottomSheet.expand();
        }
        
        // Update detail tab content
        const collectedData = await workflowEngine.getInstanceData(this.instanceData.id);
        const visibleData = await this.filterDataByStageVisibility(collectedData);
        
        const detailContent = this.container.querySelector('.detail-tab-content');
        if (detailContent) {
            detailContent.innerHTML = await this.renderDetailTabContent(visibleData);
        }
        
        // Update button states
        const detailTabButtons = this.container.querySelectorAll('.detail-tab-btn');
        detailTabButtons.forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-detail-tab') === detailTab);
        });
        
        // Re-setup clickable field handlers for new content
        this.setupClickableFieldHandlers();
    }


    /**
     * Setup detail tab handlers
     */
    setupDetailTabHandlers() {
        const detailTabButtons = this.container.querySelectorAll('.detail-tab-btn');
        detailTabButtons.forEach(button => {
            eventManager.add(button, 'click', async () => {
                const detailTab = button.getAttribute('data-detail-tab');
                await this.switchDetailTab(detailTab);
            }, {
                component: 'marker-detail-module',
                description: `Detail tab button handler for ${button.getAttribute('data-detail-tab')}`
            });
        });
        
        // Setup clickable field handlers for the current detail content
        this.setupClickableFieldHandlers();
    }

    /**
     * Setup photo gallery click handlers for image modals (BDHI-style)
     */
    setupPhotoGalleryHandlers() {
        const photoThumbnails = this.container.querySelectorAll('.photo-thumbnail img');
        
        photoThumbnails.forEach(img => {
            const fullsizeUrl = img.getAttribute('data-fullsize');
            if (fullsizeUrl) {
                eventManager.add(img, 'click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.showFullSizeImage(fullsizeUrl);
                }, {
                    component: 'marker-detail-module',
                    description: 'Photo thumbnail click handler'
                });
            }
        });
    }

    /**
     * Display full-size image in a modal (BDHI-style implementation)
     * @param {string} imageSrc - Image URL
     */
    showFullSizeImage(imageSrc) {
        // Remove existing modal if any
        const existingModal = document.querySelector('.image-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Create a modal for the full-size image
        const modal = document.createElement('div');
        modal.className = 'image-modal';
        modal.innerHTML = `
            <div class="image-modal-content">
                <div class="close-modal">&times;</div>
                <img src="${imageSrc}" alt="Photo (Full View)">
            </div>
        `;
        document.body.appendChild(modal);
        
        // Trigger reflow and add show class for animation (BDHI timing)
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
        
        // Add close functionality
        const closeBtn = modal.querySelector('.close-modal');
        const closeModal = () => {
            modal.classList.remove('show');
            setTimeout(() => {
                if (modal.parentNode) {
                    document.body.removeChild(modal);
                }
            }, 300); // Wait for transition to complete
        };
        
        // Add event listeners using standard DOM (like BDHI does)
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeModal();
        });
        modal.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.target === modal) closeModal();
        });
        
        // Close on escape key
        const handleKeydown = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleKeydown);
            }
        };
        document.addEventListener('keydown', handleKeydown);
    }

    /**
     * Extract location from marker data
     */
    extractLocationFromMarker(marker) {
        if (marker.address) return marker.address;
        if (marker.location && marker.location.address) return marker.location.address;
        if (marker.lat && marker.lng) return `${marker.lat.toFixed(4)}, ${marker.lng.toFixed(4)}`;
        return 'Location not specified';
    }

    /**
     * Format time ago
     */
    formatTimeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffHours < 1) return 'vor weniger als 1h';
        if (diffHours < 24) return `vor ${diffHours}h`;
        if (diffDays === 1) return 'vor 1 Tag';
        return `vor ${diffDays} Tagen`;
    }

    /**
     * Format date time for display
     */
    formatDateTime(dateString) {
        if (!dateString) return 'Unknown time';
        return new Date(dateString).toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * Cleanup method
     */
    destroy() {
        // Clean up location update elements if active
        if (this.locationUpdateMarker || this.locationUpdateLine || this.isLocationUpdateMode) {
            // Synchronous cleanup since destroy can't be async
            try {
                // Remove map click handler
                this.removeLocationUpdateMapClick();
                
                const map = window.mapCore?.getMap();
                if (map) {
                    if (this.locationUpdateMarker) {
                        map.removeLayer(this.locationUpdateMarker);
                    }
                    if (this.locationUpdateLine) {
                        map.removeLayer(this.locationUpdateLine);
                    }
                }
                
                // Re-enable bottom sheet closing
                if (window.bottomSheet) {
                    window.bottomSheet.preventClose = false;
                }
            } catch (error) {
                console.warn('Error cleaning up location update elements:', error);
            }
        }
        
        this.markerData = null;
        this.instanceData = null;
        this.participantRole = null;
        this.maxVisibleStageOrder = null;
        this.availableActions = [];
        this.auditTrail = [];
        this.activeTab = null;
        this.activeDetailTab = null;
        this.isEditMode = false;
        this.editActionId = null;
        this.editableFields = [];
        this.editFormData = null;
        this.isLocationUpdateMode = false;
        this.locationUpdateMarker = null;
        this.locationUpdateLine = null;
        this.newMarkerPosition = null;
        
        super.destroy();
    }
}