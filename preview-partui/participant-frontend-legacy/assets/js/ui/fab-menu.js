/**
 * Floating Action Button (FAB) Menu System
 * 
 * Displays available workflows as expandable menu options
 * Handles both incident (map-based) and survey (non-map) workflow types
 * Mobile-first responsive design with touch-friendly interactions
 * 
 * Integrates with:
 * - @workflow/workflow-engine.js for workflow management
 * - @core/event-manager.js for component lifecycle
 * - @map/map-core.js for incident location handling
 */

import { workflowEngine } from '../workflow/workflow-engine.js';
import eventManager from '../core/event-manager.js';
import { supabaseClient } from '../core/supabase.js';
import DebugLogger from '../core/debug-logger.js';

export class FABMenu {
    constructor() {
        this.logger = new DebugLogger('FABMenu');
        this.isOpen = false;
        this.workflows = [];
        this.fabElement = null;
        this.optionsElement = null;
        this.selectedWorkflow = null;
        this.mapClickMode = false;
        this.mapClickHandler = null;
        this.mapViewChangeHandler = null;
        this.connectionLineUpdateFrame = null;
        this.coordinateSelectionMode = false;
        this.tempMarker = null;
        this.connectionLine = null;
        this.currentCoordinates = null;
        this.reportButton = null;
        
        // Register for cleanup
        eventManager.registerComponent('fab-menu', { 
            destroy: () => this.destroy() 
        });
        
        this.logger.log('Initialized');
    }

    /**
     * Initialize the FAB menu
     */
    async initialize(container = document.body) {
        try {
            this.container = container;
            
            // Listen for workflow engine events
            this.setupEventListeners();
            
            // Create FAB UI
            this.createFABUI();
            
            // Load available workflows if engine is ready
            if (workflowEngine.currentParticipant) {
                await this.loadWorkflows();
            }
            
            this.logger.log('Initialized successfully');
            return true;
        } catch (error) {
            this.logger.error('Failed to initialize:', error);
            throw new Error(`FAB menu initialization failed: ${error.message}`);
        }
    }

    /**
     * Setup event listeners for workflow engine events
     */
    setupEventListeners() {
        // Listen for workflow engine initialization
        window.addEventListener('workflow-engine:initialized', () => {
            this.loadWorkflows();
        });

        // Listen for workflow engine workflows loaded
        window.addEventListener('workflow-engine:workflows-loaded', (event) => {
            this.workflows = event.detail.workflows;
            this.updateFABVisibility();
        });

        // Listen for instance creation to close FAB
        window.addEventListener('workflow-engine:instance-created', () => {
            this.close();
            if (this.coordinateSelectionMode) {
                this.exitCoordinateSelectionMode();
            }
        });

        // Listen for bottom sheet opening to hide FAB completely
        window.addEventListener('bottom-sheet:opened', () => {
            this.hideFAB();
        });

        // Listen for bottom sheet closing to show FAB again
        window.addEventListener('bottom-sheet:closed', () => {
            this.showFAB();
        });

        // Listen for map clicks when in map click mode
        this.mapClickHandler = (event) => {
            if (this.mapClickMode && this.selectedWorkflow) {
                this.handleMapClick(event);
            }
        };

        // Close FAB when clicking outside
        document.addEventListener('click', (event) => {
            if (this.isOpen && !this.fabElement?.contains(event.target)) {
                this.close();
            }
        });

        // Handle escape key
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                if (this.mapClickMode) {
                    this.exitMapClickMode();
                } else if (this.isOpen) {
                    this.close();
                }
            }
        });
    }

    /**
     * Create the FAB UI elements
     */
    createFABUI() {
        // Create main FAB button
        this.fabElement = document.createElement('div');
        this.fabElement.className = 'fab';
        this.fabElement.innerHTML = `
            <i class="fas fa-plus" id="fab-icon"></i>
        `;
        
        // Create options container
        this.optionsElement = document.createElement('div');
        this.optionsElement.className = 'fab-options';
        this.optionsElement.style.display = 'none';
        
        // Add click handler for main FAB
        this.fabElement.addEventListener('click', (event) => {
            event.stopPropagation();
            this.toggle();
        });
        
        // Add to container
        this.container.appendChild(this.fabElement);
        this.container.appendChild(this.optionsElement);
        
        // Initially hide FAB until workflows are loaded
        this.fabElement.style.display = 'none';
    }

    /**
     * Load available workflows from workflow engine
     */
    async loadWorkflows() {
        try {
            this.workflows = workflowEngine.getAvailableWorkflows();
            this.updateFABVisibility();
            this.renderWorkflowOptions();
            
            this.logger.log('Loaded', this.workflows.length, 'workflows');
        } catch (error) {
            this.logger.error('Failed to load workflows:', error);
        }
    }

    /**
     * Update FAB visibility based on available workflows
     */
    updateFABVisibility() {
        if (this.workflows.length > 0) {
            this.fabElement.style.display = 'flex';
        } else {
            this.fabElement.style.display = 'none';
            this.close();
        }
    }

    /**
     * Render workflow options in the expandable menu
     */
    renderWorkflowOptions() {
        if (!this.optionsElement) return;
        
        this.optionsElement.innerHTML = '';
        
        this.workflows.forEach(workflow => {
            const option = document.createElement('div');
            option.className = 'fab-option';
            
            // Add workflow type indicator
            const typeIcon = workflow.workflow_type === 'incident' ? 'fa-map-marker-alt' : 'fa-clipboard-list';
            
            option.innerHTML = `
                <i class="fas ${typeIcon}"></i>
                <span>${workflow.name}</span>
            `;
            
            option.addEventListener('click', (event) => {
                event.stopPropagation();
                this.selectWorkflow(workflow);
            });
            
            this.optionsElement.appendChild(option);
        });
    }

    /**
     * Toggle FAB menu open/closed
     */
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * Open FAB menu
     */
    open() {
        if (this.workflows.length === 0) return;
        
        this.isOpen = true;
        this.optionsElement.style.display = 'flex';
        
        // Rotate FAB icon to indicate open state
        const icon = this.fabElement.querySelector('#fab-icon');
        if (icon) {
            icon.style.transform = 'rotate(45deg)';
        }
        
        // Add animation class
        this.fabElement.classList.add('fab-open');
        
        this.logger.log('Opened menu');
    }

    /**
     * Close FAB menu
     */
    close() {
        this.isOpen = false;
        this.optionsElement.style.display = 'none';
        
        // Reset FAB icon rotation
        const icon = this.fabElement.querySelector('#fab-icon');
        if (icon) {
            icon.style.transform = 'rotate(0deg)';
        }
        
        // Remove animation class
        this.fabElement.classList.remove('fab-open');
        
        this.logger.log('Closed menu');
    }

    /**
     * Hide FAB button completely (for bottom sheet integration)
     */
    hideFAB() {
        this.logger.log('hideFAB() called - bottom sheet opened');
        
        // Close menu if open
        if (this.isOpen) {
            this.close();
        }
        
        // Hide the FAB button with fade out animation
        if (this.fabElement) {
            this.fabElement.style.opacity = '0';
            setTimeout(() => {
                if (this.fabElement) {
                    this.fabElement.style.display = 'none';
                }
            }, 200);
        }
        
        // Also hide report button if in coordinate selection mode
        if (this.reportButton) {
            this.reportButton.style.opacity = '0';
            setTimeout(() => {
                if (this.reportButton) {
                    this.reportButton.style.display = 'none';
                }
            }, 200);
        }
        
        this.logger.log('FAB hidden for bottom sheet');
    }

    /**
     * Show FAB button again (when bottom sheet closes)
     */
    showFAB() {
        this.logger.log('showFAB() called - bottom sheet closed');
        
        // Only show if we have workflows available
        if (this.workflows.length > 0) {
            if (this.coordinateSelectionMode && this.reportButton) {
                // Show report button if in coordinate selection mode
                this.reportButton.style.display = 'flex';
                this.reportButton.style.opacity = '0';
                setTimeout(() => {
                    if (this.reportButton) {
                        this.reportButton.style.opacity = '1';
                    }
                }, 10);
            } else if (this.fabElement) {
                // Show normal FAB
                this.fabElement.style.display = 'flex';
                this.fabElement.style.opacity = '0';
                setTimeout(() => {
                    if (this.fabElement) {
                        this.fabElement.style.opacity = '1';
                    }
                }, 10);
            }
        }
        
        this.logger.log('FAB shown after bottom sheet closed');
    }

    /**
     * Handle workflow selection
     */
    async selectWorkflow(workflow) {
        try {
            this.logger.log('Selected workflow:', workflow.name, 'type:', workflow.workflow_type);
            
            this.selectedWorkflow = workflow;
            this.close();
            
            // TEMPORARY: Treat "incident" workflow as incident type for testing
            const isIncidentWorkflow = workflow.workflow_type === 'incident' || workflow.name === 'incident';
            
            if (isIncidentWorkflow) {
                // For incident workflows, enter coordinate selection mode
                this.enterCoordinateSelectionMode();
            } else {
                // For survey workflows, start immediately
                await this.startWorkflow(workflow);
            }
        } catch (error) {
            this.logger.error('Failed to select workflow:', error);
            this.showError('Failed to start workflow');
        }
    }

    /**
     * Enter coordinate selection mode for incident workflows
     */
    enterCoordinateSelectionMode() {
        this.coordinateSelectionMode = true;
        this.mapClickMode = true; // Keep for compatibility
        
        // Get map instance
        const mapInstance = window.mapCore?.getMap();
        if (!mapInstance) {
            this.logger.error('Map instance not available');
            return;
        }
        
        // Transform FAB to red report button
        this.transformToReportButton();
        
        // Add temporary marker at map center
        const center = mapInstance.getCenter();
        this.addTemporaryMarker(center);
        
        // Setup map click handler for coordinate selection
        this.mapClickHandler = (event) => {
            this.updateMarkerPosition(event.latlng);
        };
        mapInstance.on('click', this.mapClickHandler);
        
        // Setup map view change handlers to update connection line
        this.mapViewChangeHandler = () => {
            // Use requestAnimationFrame to throttle updates during map movement
            if (this.connectionLineUpdateFrame) {
                cancelAnimationFrame(this.connectionLineUpdateFrame);
            }
            this.connectionLineUpdateFrame = requestAnimationFrame(() => {
                this.updateConnectionLine();
                this.connectionLineUpdateFrame = null;
            });
        };
        
        mapInstance.on('move', this.mapViewChangeHandler);
        mapInstance.on('zoom', this.mapViewChangeHandler);
        mapInstance.on('zoomend', this.mapViewChangeHandler);
        mapInstance.on('moveend', this.mapViewChangeHandler);
        
        // The marker drag handler will be set up in addTemporaryMarker method
        
        // Add connection line
        this.updateConnectionLine();
        
        this.logger.log('Entered coordinate selection mode for workflow:', this.selectedWorkflow.name);
        
        // Emit custom event
        window.dispatchEvent(new CustomEvent('fab-menu:coordinate-selection-entered', {
            detail: {
                workflowId: this.selectedWorkflow.id,
                workflowName: this.selectedWorkflow.name
            }
        }));
    }

    /**
     * Exit coordinate selection mode
     */
    exitCoordinateSelectionMode() {
        this.coordinateSelectionMode = false;
        this.mapClickMode = false;
        
        const mapInstance = window.mapCore?.getMap();
        if (mapInstance) {
            // Remove event handlers
            mapInstance.off('click', this.mapClickHandler);
            mapInstance.off('move', this.mapViewChangeHandler);
            mapInstance.off('zoom', this.mapViewChangeHandler);
            mapInstance.off('zoomend', this.mapViewChangeHandler);
            mapInstance.off('moveend', this.mapViewChangeHandler);
            mapInstance.getContainer().style.cursor = '';
        }
        
        // Cancel any pending connection line updates
        if (this.connectionLineUpdateFrame) {
            cancelAnimationFrame(this.connectionLineUpdateFrame);
            this.connectionLineUpdateFrame = null;
        }
        
        // Clean up temporary marker
        this.removeTemporaryMarker();
        
        // Clean up connection line
        this.removeConnectionLine();
        
        // Restore normal FAB
        this.restoreNormalFAB();
        
        // Reset state
        this.selectedWorkflow = null;
        this.currentCoordinates = null;
        
        this.logger.log('Exited coordinate selection mode');
        
        // Emit custom event
        window.dispatchEvent(new CustomEvent('fab-menu:coordinate-selection-exited'));
    }

    /**
     * Transform FAB to red report button
     */
    transformToReportButton() {
        // Hide normal FAB
        this.fabElement.style.display = 'none';
        
        // Create red report button
        this.reportButton = document.createElement('div');
        this.reportButton.className = 'damage-report-button';
        this.reportButton.style.display = 'flex';
        this.reportButton.innerHTML = `
            <span class="report-text">${this.selectedWorkflow.name}</span>
            <button class="damage-report-close" type="button">×</button>
        `;
        
        // Add click handlers
        this.reportButton.querySelector('.report-text').addEventListener('click', () => {
            this.confirmCoordinateSelection();
        });
        
        this.reportButton.querySelector('.damage-report-close').addEventListener('click', () => {
            this.exitCoordinateSelectionMode();
        });
        
        // Add to container
        this.container.appendChild(this.reportButton);
        
        // Animate in
        setTimeout(() => {
            this.reportButton.style.opacity = '1';
        }, 10);
    }

    /**
     * Restore normal FAB appearance
     */
    restoreNormalFAB() {
        // Remove report button
        if (this.reportButton && this.reportButton.parentNode) {
            this.reportButton.parentNode.removeChild(this.reportButton);
            this.reportButton = null;
        }
        
        // Show normal FAB
        this.fabElement.style.display = 'flex';
    }

    /**
     * Add temporary marker for coordinate selection
     */
    addTemporaryMarker(coordinates) {
        const mapInstance = window.mapCore?.getMap();
        if (!mapInstance) return;
        
        // Create custom marker icon
        const markerIcon = L.divIcon({
            className: 'temp-marker',
            html: '<div class="temp-marker-inner"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });
        
        // Add marker
        this.tempMarker = L.marker(coordinates, {
            icon: markerIcon,
            draggable: true
        }).addTo(mapInstance);
        
        // Setup marker drag handler
        this.tempMarker.on('drag', (event) => {
            this.updateMarkerPosition(event.target.getLatLng());
        });
        
        // Store initial coordinates
        this.currentCoordinates = coordinates;
        
        this.logger.log('Added temporary marker at:', coordinates);
    }

    /**
     * Remove temporary marker
     */
    removeTemporaryMarker() {
        if (this.tempMarker) {
            const mapInstance = window.mapCore?.getMap();
            if (mapInstance) {
                mapInstance.removeLayer(this.tempMarker);
            }
            this.tempMarker = null;
        }
    }

    /**
     * Update marker position and refresh connection line
     */
    updateMarkerPosition(coordinates) {
        if (this.tempMarker) {
            this.tempMarker.setLatLng(coordinates);
            this.currentCoordinates = coordinates;
            this.updateConnectionLine();
            
            this.logger.log('Updated marker position to:', coordinates);
        }
    }

    /**
     * Update connection line between button and marker
     */
    updateConnectionLine() {
        if (!this.reportButton || !this.tempMarker) return;
        
        const mapInstance = window.mapCore?.getMap();
        if (!mapInstance) return;
        
        // Remove existing line
        this.removeConnectionLine();
        
        // Get button position in map coordinates
        const buttonRect = this.reportButton.getBoundingClientRect();
        const mapRect = mapInstance.getContainer().getBoundingClientRect();
        
        // Calculate button center relative to map
        const buttonCenterX = buttonRect.left + buttonRect.width / 2 - mapRect.left;
        const buttonCenterY = buttonRect.top + buttonRect.height / 2 - mapRect.top;
        
        // Convert pixel position to lat/lng
        const buttonLatLng = mapInstance.containerPointToLatLng([buttonCenterX, buttonCenterY]);
        const markerLatLng = this.tempMarker.getLatLng();
        
        // Create animated dashed line
        this.connectionLine = L.polyline([buttonLatLng, markerLatLng], {
            color: '#dc3545',
            weight: 2,
            opacity: 0.7,
            dashArray: '5, 5',
            className: 'connection-line'
        }).addTo(mapInstance);
        
        // Add CSS animation for the dashes
        setTimeout(() => {
            if (this.connectionLine) {
                const lineElement = this.connectionLine.getElement();
                if (lineElement) {
                    lineElement.style.animation = 'dash-animation 2s linear infinite';
                }
            }
        }, 100);
    }

    /**
     * Remove connection line
     */
    removeConnectionLine() {
        if (this.connectionLine) {
            const mapInstance = window.mapCore?.getMap();
            if (mapInstance) {
                mapInstance.removeLayer(this.connectionLine);
            }
            this.connectionLine = null;
        }
    }

    /**
     * Confirm coordinate selection and start workflow
     */
    async confirmCoordinateSelection() {
        try {
            if (!this.currentCoordinates || !this.selectedWorkflow) {
                throw new Error('No coordinates selected');
            }
            
            const location = `POINT(${this.currentCoordinates.lng} ${this.currentCoordinates.lat})`;
            
            this.logger.log('Confirming coordinate selection:', this.currentCoordinates);
            
            await this.startWorkflow(this.selectedWorkflow, {
                location: location,
                coordinates: this.currentCoordinates
            });
            
        } catch (error) {
            this.logger.error('Failed to confirm coordinate selection:', error);
            this.showError('Failed to start workflow at selected location');
        }
    }

    /**
     * Handle map click for incident workflows (legacy compatibility)
     */
    async handleMapClick(event) {
        // This is handled by the new coordinate selection system
        // Keep for backwards compatibility
        if (this.coordinateSelectionMode) {
            this.updateMarkerPosition(event.latlng);
        }
    }

    /**
     * Start a workflow - show survey form first, create instance after completion
     */
    async startWorkflow(workflow, options = {}) {
        try {
            this.logger.log('Starting workflow:', workflow.name, 'with options:', options);
            
            // Exit coordinate selection mode if active
            if (this.coordinateSelectionMode) {
                this.exitCoordinateSelectionMode();
            }
            
            // Emit custom event to show survey form first
            window.dispatchEvent(new CustomEvent('fab-menu:workflow-selected', {
                detail: {
                    workflowId: workflow.id,
                    workflowName: workflow.name,
                    workflowType: workflow.workflow_type,
                    options: options
                }
            }));
            
        } catch (error) {
            this.logger.error('Failed to start workflow:', error);
            this.showError('Failed to start workflow: ' + error.message);
        }
    }

    /**
     * Create workflow instance after survey completion
     */
    async createWorkflowInstance(workflow, surveyData, options = {}) {
        try {
            this.logger.log('Creating workflow instance after survey completion');
            this.logger.log('Survey data to save:', surveyData);
            
            const instance = await workflowEngine.createWorkflowInstance(workflow.id, options);
            
            this.logger.log('Created workflow instance:', instance.id);
            
            // Save survey data to database if provided
            if (surveyData && Object.keys(surveyData).length > 0) {
                this.logger.log('Saving survey data to database...');
                
                // Get the initial form ID from the workflow's first stage
                const initialFormId = await this.getInitialFormId(workflow.id);
                
                if (initialFormId) {
                    this.logger.log('Using initial form ID:', initialFormId);
                    
                    // Save survey data directly to instance_data table
                    await this.saveSurveyDataToInstance(instance.id, initialFormId, surveyData);
                    
                    this.logger.log('Survey data saved successfully');
                } else {
                    this.logger.warn('No initial form ID found, survey data not saved');
                }
            } else {
                this.logger.log('No survey data to save');
            }
            
            // Emit custom event for UI components to handle
            window.dispatchEvent(new CustomEvent('fab-menu:workflow-started', {
                detail: {
                    workflowId: workflow.id,
                    workflowName: workflow.name,
                    workflowType: workflow.workflow_type,
                    instanceId: instance.id,
                    location: options.coordinates,
                    surveyData: surveyData
                }
            }));
            
            this.showSuccess(`Started ${workflow.name}`);
            return instance;
            
        } catch (error) {
            this.logger.error('Failed to create workflow instance:', error);
            this.showError('Failed to create workflow instance: ' + error.message);
            throw error;
        }
    }

    /**
     * Get the initial form ID from the workflow's first stage
     */
    async getInitialFormId(workflowId) {
        try {
            const { data: initialStage, error } = await supabaseClient.client
                .from('workflow_stages')
                .select('initial_form_id')
                .eq('workflow_id', workflowId)
                .eq('stage_order', 1)
                .single();
            
            if (error) {
                this.logger.error('Error getting initial form ID:', error);
                return null;
            }
            
            return initialStage?.initial_form_id;
        } catch (error) {
            this.logger.error('Failed to get initial form ID:', error);
            return null;
        }
    }

    /**
     * Save survey data directly to instance_data table using field_id UUID references
     */
    async saveSurveyDataToInstance(instanceId, formId, surveyData) {
        try {
            this.logger.log('Saving survey data to instance_data:', {
                instanceId,
                formId,
                surveyData
            });

            // Get current participant ID
            const participantAuth = await import('../auth/participant-auth.js');
            const authStatus = participantAuth.default.getAuthStatus();
            const participantId = authStatus.participant?.id;

            if (!participantId) {
                throw new Error('No participant ID available');
            }

            // Get field mapping from form_fields if formId is provided
            const fieldMapping = new Map();
            if (formId) {
                const { data: fields, error: fieldsError } = await supabaseClient.client
                    .from('form_fields')
                    .select('id, field_type')
                    .eq('form_id', formId);
                
                if (fieldsError) {
                    this.logger.error('Failed to get field information:', fieldsError);
                } else if (fields) {
                    fields.forEach(field => {
                        fieldMapping.set(field.id, {
                            id: field.id,
                            type: field.field_type
                        });
                    });
                }
            }

            // Prepare records for instance_data table
            const records = [];
            for (const [fieldId, fieldValue] of Object.entries(surveyData)) {
                if (fieldValue !== null && fieldValue !== undefined && fieldValue !== '') {
                    // Get field info from mapping or default
                    const fieldInfo = fieldMapping.get(fieldId) || { id: fieldId, type: 'text' };
                    if (!fieldInfo) {
                        this.logger.warn(`Field ${fieldId} not found in form_fields, skipping`);
                        continue;
                    }
                    
                    records.push({
                        instance_id: instanceId,
                        field_id: fieldInfo.id,
                        field_value: String(fieldValue),
                        field_type: this.getFieldType(fieldValue),
                        form_id: formId,
                        action_execution_id: null, // Survey data doesn't have action execution
                        last_modified_by: participantId
                    });
                }
            }

            this.logger.log('Prepared records for insertion:', records);

            if (records.length > 0) {
                const data = await supabaseClient.upsertInstanceDataWithAudit(instanceId, records, {
                    activityType: 'quick_survey_submission',
                    activitySummary: `Quick survey data submitted: ${records.length} fields`,
                    activityDetails: {
                        surveyType: 'fab_menu_quick_entry',
                        fieldCount: records.length,
                        component: 'fab-menu'
                    },
                    metadata: {
                        userAgent: navigator.userAgent,
                        timestamp: new Date().toISOString(),
                        entryMethod: 'fab_quick_survey'
                    }
                });

                this.logger.log('Successfully inserted survey data with audit logging:', data);
            }

        } catch (error) {
            this.logger.error('Failed to save survey data:', error);
            throw error;
        }
    }

    /**
     * Determine field type from value (similar to WorkflowEngine.getFieldType)
     */
    getFieldType(value) {
        if (typeof value === 'number') return 'number';
        if (typeof value === 'boolean') return 'boolean';
        if (value instanceof Date) return 'date';
        if (typeof value === 'string' && value.length > 255) return 'long_text';
        return 'short_text';
    }

    /**
     * Show map click instruction message
     */
    showMapClickInstruction() {
        // Remove existing instruction if present
        this.hideMapClickInstruction();
        
        const instruction = document.createElement('div');
        instruction.id = 'map-click-instruction';
        instruction.className = 'map-click-instruction';
        instruction.innerHTML = `
            <div class="instruction-content">
                <i class="fas fa-map-marker-alt"></i>
                <span>Click on the map to select location for ${this.selectedWorkflow.name}</span>
                <button class="btn-cancel" onclick="fabMenu.exitMapClickMode()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        this.container.appendChild(instruction);
    }

    /**
     * Hide map click instruction message
     */
    hideMapClickInstruction() {
        const instruction = document.getElementById('map-click-instruction');
        if (instruction) {
            instruction.remove();
        }
    }

    /**
     * Show success message
     */
    showSuccess(message) {
        this.showMessage(message, 'success');
    }

    /**
     * Show error message
     */
    showError(message) {
        this.showMessage(message, 'error');
    }

    /**
     * Show temporary message
     */
    showMessage(message, type = 'info') {
        // Remove existing message if present
        const existing = document.getElementById('fab-message');
        if (existing) {
            existing.remove();
        }
        
        const messageElement = document.createElement('div');
        messageElement.id = 'fab-message';
        messageElement.className = `fab-message fab-message-${type}`;
        messageElement.innerHTML = `
            <i class="fas ${type === 'success' ? 'fa-check' : type === 'error' ? 'fa-exclamation-triangle' : 'fa-info'}"></i>
            <span>${message}</span>
        `;
        
        this.container.appendChild(messageElement);
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            if (messageElement.parentNode) {
                messageElement.remove();
            }
        }, 3000);
    }

    /**
     * Refresh workflows from engine
     */
    async refresh() {
        try {
            await this.loadWorkflows();
            this.logger.log('Refreshed workflows');
        } catch (error) {
            this.logger.error('Failed to refresh workflows:', error);
        }
    }

    /**
     * Check if FAB menu is in map click mode
     */
    isInMapClickMode() {
        return this.mapClickMode;
    }

    /**
     * Get currently selected workflow
     */
    getSelectedWorkflow() {
        return this.selectedWorkflow;
    }

    /**
     * Cleanup method for component lifecycle
     */
    destroy() {
        // Exit coordinate selection mode
        if (this.coordinateSelectionMode) {
            this.exitCoordinateSelectionMode();
        }
        
        // Remove UI elements
        if (this.fabElement?.parentNode) {
            this.fabElement.parentNode.removeChild(this.fabElement);
        }
        if (this.optionsElement?.parentNode) {
            this.optionsElement.parentNode.removeChild(this.optionsElement);
        }
        
        // Clean up temporary marker and connection line
        this.removeTemporaryMarker();
        this.removeConnectionLine();
        
        // Remove report button
        if (this.reportButton?.parentNode) {
            this.reportButton.parentNode.removeChild(this.reportButton);
        }
        
        // Hide instruction if visible
        this.hideMapClickInstruction();
        
        // Remove any messages
        const message = document.getElementById('fab-message');
        if (message?.parentNode) {
            message.parentNode.removeChild(message);
        }
        
        // Reset state
        this.isOpen = false;
        this.workflows = [];
        this.selectedWorkflow = null;
        this.mapClickMode = false;
        this.mapViewChangeHandler = null;
        this.connectionLineUpdateFrame = null;
        this.coordinateSelectionMode = false;
        this.tempMarker = null;
        this.connectionLine = null;
        this.currentCoordinates = null;
        this.reportButton = null;
        
        this.logger.log('Destroyed');
    }
}

// Create and export singleton instance
export const fabMenu = new FABMenu();

// Make it globally accessible for onclick handlers
window.fabMenu = fabMenu;