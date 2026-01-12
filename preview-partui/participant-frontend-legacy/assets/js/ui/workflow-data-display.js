/**
 * Workflow Data Display Component
 * 
 * Displays workflow instance data with proper role-based filtering
 * and stage progression limits. This component ensures that participants
 * only see data they are authorized to view based on their role.
 * 
 * Usage:
 * - Create instance: new WorkflowDataDisplay(container, participant)
 * - Load data: await display.loadInstanceData(instanceId)
 * - Update data: await display.updateDisplay()
 * 
 * Integrates with:
 * - @workflow/workflow-engine.js for data filtering
 * - @core/event-manager.js for cleanup
 * - Role-based visibility system (see ROLE_BASED_VISIBILITY.md)
 */

import { workflowEngine } from '../workflow/workflow-engine.js';
import eventManager from '../core/event-manager.js';
import DebugLogger from '../core/debug-logger.js';

export class WorkflowDataDisplay {
    constructor(container, participant) {
        this.logger = new DebugLogger('WorkflowDataDisplay');
        this.container = container;
        this.participant = participant;
        this.currentInstance = null;
        this.displayMode = 'summary'; // 'summary', 'detailed', 'progressive'
        
        // Register for cleanup
        eventManager.registerComponent('workflow-data-display', {
            destroy: () => this.destroy()
        });
        
        this.logger.log('Initialized for participant:', participant.id);
    }
    
    /**
     * Load and display workflow instance data
     */
    async loadInstanceData(instanceId, mode = 'summary') {
        try {
            this.displayMode = mode;
            
            // Load instance with full workflow definition
            const instance = await workflowEngine.getWorkflowInstance(instanceId);
            if (!instance) {
                throw new Error(`Instance ${instanceId} not found`);
            }
            
            // RLS policies handle instance visibility at database level
            // Load collected data - RLS filters data automatically
            const visibleData = await workflowEngine.getInstanceData(instanceId);
            
            this.currentInstance = instance;
            this.displayData(visibleData);
            
            this.logger.log('Loaded data:', visibleData.length, 'visible fields');
            
        } catch (error) {
            this.logger.error('Failed to load instance data:', error);
            this.displayError(error.message);
        }
    }
    
    /**
     * Display workflow data based on current mode
     */
    displayData(data) {
        if (!this.currentInstance) return;
        
        // Clear container
        this.container.innerHTML = '';
        
        // Create main container
        const dataContainer = document.createElement('div');
        dataContainer.className = 'workflow-data-display';
        
        // Add instance header
        this.addInstanceHeader(dataContainer);
        
        // Add visibility info for debugging
        if (this.displayMode === 'detailed') {
            this.addVisibilityInfo(dataContainer);
        }
        
        // Display data based on mode
        switch (this.displayMode) {
            case 'summary':
                this.displaySummaryMode(dataContainer, data);
                break;
            case 'detailed':
                this.displayDetailedMode(dataContainer, data);
                break;
            case 'progressive':
                this.displayProgressiveMode(dataContainer, data);
                break;
        }
        
        this.container.appendChild(dataContainer);
    }
    
    /**
     * Add instance header with basic info
     */
    addInstanceHeader(container) {
        const header = document.createElement('div');
        header.className = 'instance-header';
        
        const title = document.createElement('h3');
        title.textContent = this.currentInstance.title || 'Workflow Instance';
        title.className = 'instance-title';
        
        const workflow = document.createElement('div');
        workflow.textContent = this.currentInstance.workflow.name;
        workflow.className = 'workflow-name';
        
        const stage = document.createElement('div');
        stage.textContent = `Stage: ${this.currentInstance.current_stage?.stage_name || 'Unknown'}`;
        stage.className = 'current-stage';
        
        const progress = document.createElement('div');
        progress.textContent = `Progress: ${this.currentInstance.progress_percentage || 0}%`;
        progress.className = 'progress-info';
        
        // Add fallback warning if using accessible stage fallback
        if (this.currentInstance.fallback_to_accessible) {
            const fallbackWarning = document.createElement('div');
            fallbackWarning.className = 'fallback-warning';
            fallbackWarning.innerHTML = `
                <div class="warning-icon">⚠️</div>
                <div class="warning-text">
                    Showing data from last accessible stage. Current workflow has progressed beyond your permission level.
                </div>
            `;
            header.appendChild(fallbackWarning);
        }
        
        header.appendChild(title);
        header.appendChild(workflow);
        header.appendChild(stage);
        header.appendChild(progress);
        
        container.appendChild(header);
    }
    
    /**
     * Add visibility debug information
     */
    addVisibilityInfo(container) {
        const visibilityInfo = workflowEngine.getVisibilitySummary(
            this.currentInstance,
            this.participant.role_id
        );
        
        const debugContainer = document.createElement('div');
        debugContainer.className = 'visibility-debug';
        debugContainer.innerHTML = `
            <details>
                <summary>Role Visibility Info</summary>
                <div class="debug-info">
                    <div>Max Stage for Role: ${visibilityInfo.maxStageForRole}</div>
                    <div>Current Stage Order: ${visibilityInfo.currentStageOrder}</div>
                    <div>Visible Stages: ${visibilityInfo.visibleStageCount}/${visibilityInfo.totalStageCount}</div>
                    <div>Instance Visible: ${visibilityInfo.instanceVisible}</div>
                    <div>Role ID: ${visibilityInfo.participantRoleId}</div>
                </div>
            </details>
        `;
        
        container.appendChild(debugContainer);
    }
    
    /**
     * Display data in summary mode (key fields only)
     */
    displaySummaryMode(container, data) {
        const summaryContainer = document.createElement('div');
        summaryContainer.className = 'data-summary';
        
        if (data.length === 0) {
            summaryContainer.innerHTML = '<div class="no-data">No data collected yet</div>';
            container.appendChild(summaryContainer);
            return;
        }
        
        // Group data by stage for summary
        const stageGroups = this.groupDataByStage(data);
        
        Object.entries(stageGroups).forEach(([stageName, stageData]) => {
            const stageSection = document.createElement('div');
            stageSection.className = 'stage-section';
            
            const stageHeader = document.createElement('h4');
            stageHeader.textContent = stageName;
            stageHeader.className = 'stage-header';
            stageSection.appendChild(stageHeader);
            
            // Show only first 3 fields per stage in summary
            const limitedData = stageData.slice(0, 3);
            limitedData.forEach(item => {
                const field = this.createDataField(item, 'summary');
                stageSection.appendChild(field);
            });
            
            if (stageData.length > 3) {
                const more = document.createElement('div');
                more.className = 'more-fields';
                more.textContent = `... and ${stageData.length - 3} more fields`;
                stageSection.appendChild(more);
            }
            
            summaryContainer.appendChild(stageSection);
        });
        
        container.appendChild(summaryContainer);
    }
    
    /**
     * Display data in detailed mode (all fields)
     */
    displayDetailedMode(container, data) {
        const detailedContainer = document.createElement('div');
        detailedContainer.className = 'data-detailed';
        
        if (data.length === 0) {
            detailedContainer.innerHTML = '<div class="no-data">No data collected yet</div>';
            container.appendChild(detailedContainer);
            return;
        }
        
        // Group data by stage
        const stageGroups = this.groupDataByStage(data);
        
        Object.entries(stageGroups).forEach(([stageName, stageData]) => {
            const stageSection = document.createElement('div');
            stageSection.className = 'stage-section expanded';
            
            const stageHeader = document.createElement('h4');
            stageHeader.textContent = `${stageName} (${stageData.length} fields)`;
            stageHeader.className = 'stage-header';
            stageSection.appendChild(stageHeader);
            
            // Show all fields in detailed mode
            stageData.forEach(item => {
                const field = this.createDataField(item, 'detailed');
                stageSection.appendChild(field);
            });
            
            detailedContainer.appendChild(stageSection);
        });
        
        container.appendChild(detailedContainer);
    }
    
    /**
     * Display data in progressive mode (chronological order)
     */
    displayProgressiveMode(container, data) {
        const progressiveContainer = document.createElement('div');
        progressiveContainer.className = 'data-progressive';
        
        if (data.length === 0) {
            progressiveContainer.innerHTML = '<div class="no-data">No data collected yet</div>';
            container.appendChild(progressiveContainer);
            return;
        }
        
        // Sort data chronologically
        const sortedData = [...data].sort((a, b) => 
            new Date(a.created_at) - new Date(b.created_at)
        );
        
        // Create timeline
        const timeline = document.createElement('div');
        timeline.className = 'data-timeline';
        
        sortedData.forEach(item => {
            const timelineItem = document.createElement('div');
            timelineItem.className = 'timeline-item';
            
            const timestamp = document.createElement('div');
            timestamp.className = 'timestamp';
            timestamp.textContent = new Date(item.created_at).toLocaleString();
            
            const field = this.createDataField(item, 'progressive');
            
            timelineItem.appendChild(timestamp);
            timelineItem.appendChild(field);
            timeline.appendChild(timelineItem);
        });
        
        progressiveContainer.appendChild(timeline);
        container.appendChild(progressiveContainer);
    }
    
    /**
     * Create a single data field display
     */
    createDataField(dataItem, mode) {
        const field = document.createElement('div');
        field.className = `data-field ${mode}`;
        
        const label = document.createElement('div');
        label.className = 'field-label';
        // Use field_label from form_fields if available, fallback to truncated field ID
        label.textContent = dataItem.form_fields?.field_label || `Field ${dataItem.field_id.substring(0, 8)}...`;
        
        const value = document.createElement('div');
        value.className = 'field-value';
        
        const formattedValue = this.formatFieldValue(dataItem.field_value, dataItem.field_type);
        
        // For file fields, use innerHTML to support gallery HTML
        if (dataItem.field_type === 'file' && formattedValue.includes('<div class="workflow-image-gallery"')) {
            value.innerHTML = formattedValue;
        } else {
            value.textContent = formattedValue;
        }
        
        field.appendChild(label);
        field.appendChild(value);
        
        // Add metadata in detailed mode
        if (mode === 'detailed' && dataItem.action_execution) {
            const metadata = document.createElement('div');
            metadata.className = 'field-metadata';
            metadata.innerHTML = `
                <small>
                    Collected: ${new Date(dataItem.created_at).toLocaleString()}<br>
                    Action: ${dataItem.action_execution.action?.action_name || 'Unknown'}
                </small>
            `;
            field.appendChild(metadata);
        }
        
        return field;
    }
    
    /**
     * Format field value based on type
     */
    formatFieldValue(value, type) {
        if (!value) return '(empty)';
        
        switch (type) {
            case 'boolean':
                return value === 'true' ? 'Yes' : 'No';
            case 'date':
                return new Date(value).toLocaleDateString();
            case 'number':
                return parseFloat(value).toLocaleString();
            case 'array':
                try {
                    const parsed = JSON.parse(value);
                    return Array.isArray(parsed) ? parsed.join(', ') : value;
                } catch {
                    return value;
                }
            case 'file':
                return this.formatFileValue(value);
            case 'signature':
                return '[Signature] Signature captured';
            default:
                return value;
        }
    }
    
    /**
     * Format file field value with gallery support
     */
    formatFileValue(value) {
        if (!value) return '(empty)';
        
        // Handle multiple files (array)
        let files = [];
        try {
            if (Array.isArray(value)) {
                files = value;
            } else if (typeof value === 'string') {
                // Try to parse as JSON array first
                try {
                    const parsed = JSON.parse(value);
                    if (Array.isArray(parsed)) {
                        files = parsed;
                    } else {
                        files = [value];
                    }
                } catch {
                    files = [value];
                }
            } else {
                files = [value];
            }
        } catch {
            files = [value];
        }
        
        // Filter to only image files and valid paths
        const imageFiles = files.filter(path => 
            typeof path === 'string' && 
            path.length > 0 &&
            this.isImageFile(path)
        );
        
        if (imageFiles.length === 0) {
            return `[File] ${files[0] || value}`;
        }
        
        // Create gallery HTML for image files
        return this.createImageGallery(imageFiles);
    }
    
    /**
     * Check if file is an image based on path/extension
     */
    isImageFile(filePath) {
        if (!filePath || typeof filePath !== 'string') return false;
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        const ext = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
        return imageExtensions.includes(ext);
    }
    
    /**
     * Create image gallery HTML (similar to BDHI implementation)
     */
    createImageGallery(imageFiles) {
        const isMobile = window.innerWidth <= 768;
        const galleryId = `gallery-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Create gallery container
        const galleryHTML = `
            <div class="workflow-image-gallery ${isMobile ? 'mobile-gallery' : 'desktop-gallery'}" id="${galleryId}">
                <div class="gallery-header">
                    <span class="image-count">${imageFiles.length} image${imageFiles.length > 1 ? 's' : ''}</span>
                </div>
                <div class="${isMobile ? 'photo-scroll' : 'photo-grid'}">
                    ${isMobile ? '<div class="photo-gallery">' : ''}
                    ${imageFiles.map((imagePath, index) => {
                        const thumbnailId = `thumb-${galleryId}-${index}`;
                        return `
                            <div class="photo-thumbnail" data-index="${index}">
                                <img id="${thumbnailId}" 
                                     src="" 
                                     alt="Uploaded image ${index + 1}" 
                                     data-storage-path="${imagePath}"
                                     data-gallery-id="${galleryId}"
                                     style="display: none; cursor: pointer; width: 100%; height: 100%; object-fit: cover;"
                                     onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
                                <div class="image-error" style="display: none; padding: 20px; text-align: center; color: #666;">
                                    <i class="fas fa-exclamation-triangle"></i><br>
                                    Failed to load image
                                </div>
                            </div>
                        `;
                    }).join('')}
                    ${isMobile ? '</div>' : ''}
                </div>
            </div>
        `;
        
        // Schedule image URL resolution after DOM insertion
        setTimeout(() => this.resolveImageUrls(galleryId, imageFiles), 10);
        
        return galleryHTML;
    }
    
    /**
     * Resolve storage paths to actual image URLs
     */
    async resolveImageUrls(galleryId, imageFiles) {
        try {
            const { imageUploadService } = await import('../services/image-upload-service.js');
            
            imageFiles.forEach(async (imagePath, index) => {
                const thumbnailId = `thumb-${galleryId}-${index}`;
                const imgElement = document.getElementById(thumbnailId);
                
                if (imgElement) {
                    try {
                        const imageUrl = imageUploadService.getImageUrl(imagePath);
                        if (imageUrl) {
                            imgElement.src = imageUrl;
                            imgElement.style.display = 'block';
                            
                            // Add click handler for modal
                            imgElement.addEventListener('click', () => {
                                this.openImageModal(imageUrl, `Image ${index + 1}`);
                            });
                        } else {
                            // Show error state
                            imgElement.style.display = 'none';
                            const errorDiv = imgElement.nextElementSibling;
                            if (errorDiv) errorDiv.style.display = 'block';
                        }
                    } catch (error) {
                        console.warn('Failed to load image:', imagePath, error);
                        imgElement.style.display = 'none';
                        const errorDiv = imgElement.nextElementSibling;
                        if (errorDiv) errorDiv.style.display = 'block';
                    }
                }
            });
        } catch (error) {
            console.error('Failed to resolve image URLs:', error);
        }
    }
    
    /**
     * Open image in modal (BDHI-style)
     */
    openImageModal(imageUrl, altText) {
        // Remove existing modal if any
        const existingModal = document.querySelector('.image-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'image-modal';
        modal.innerHTML = `
            <div class="image-modal-content">
                <div class="close-modal">&times;</div>
                <img src="${imageUrl}" alt="${altText}" />
            </div>
        `;
        
        // Add to body
        document.body.appendChild(modal);
        
        // Show modal with animation
        requestAnimationFrame(() => {
            modal.classList.add('show');
        });
        
        // Add close handlers
        const closeBtn = modal.querySelector('.close-modal');
        const closeModal = () => {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        };
        
        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
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
     * Group data by stage for organized display
     */
    groupDataByStage(data) {
        const groups = {};
        
        data.forEach(item => {
            let stageName = 'Unknown Stage';
            
            // Try to get stage from action execution first
            if (item.action_execution?.action?.to_stage_id) {
                // Use to_stage_id because that's where the data belongs after the action
                const stage = this.currentInstance.workflow.workflow_stages?.find(
                    s => s.id === item.action_execution.action.to_stage_id
                );
                stageName = stage?.stage_name || 'Unknown Stage';
            } else if (item.action_execution?.action?.from_stage_id) {
                // Fallback to from_stage_id if no to_stage_id
                const stage = this.currentInstance.workflow.workflow_stages?.find(
                    s => s.id === item.action_execution.action.from_stage_id
                );
                stageName = stage?.stage_name || 'Unknown Stage';
            } else {
                // Data without action execution - belongs to the first stage where it was collected
                // Find the first (start) stage, or use any available stage as fallback
                if (this.currentInstance.workflow?.workflow_stages) {
                    const startStage = this.currentInstance.workflow.workflow_stages.find(
                        s => s.stage_type === 'start'
                    );
                    if (startStage) {
                        stageName = startStage.stage_name;
                    } else {
                        // If no start stage found, use the first stage by order
                        const firstStage = this.currentInstance.workflow.workflow_stages
                            .sort((a, b) => a.stage_order - b.stage_order)[0];
                        stageName = firstStage?.stage_name || 'Initial Data';
                    }
                } else {
                    stageName = 'Initial Data';
                }
                
                this.logger.log('Data without action execution assigned to stage:', stageName, 'for field:', item.field_id);
            }
            
            if (!groups[stageName]) {
                groups[stageName] = [];
            }
            
            groups[stageName].push(item);
        });
        
        this.logger.log('Grouped data by stages:', Object.keys(groups), 'total items:', data.length);
        return groups;
    }
    
    /**
     * Display when participant has no access
     */
    displayNoAccess() {
        this.container.innerHTML = `
            <div class="no-access">
                <div class="no-access-icon">[LOCKED]</div>
                <div class="no-access-message">
                    You don't have permission to view this workflow instance.
                </div>
            </div>
        `;
    }
    
    /**
     * Display error message
     */
    displayError(message) {
        this.container.innerHTML = `
            <div class="error-display">
                <div class="error-icon">[ERROR]</div>
                <div class="error-message">
                    Error loading workflow data: ${message}
                </div>
            </div>
        `;
    }
    
    /**
     * Change display mode and refresh
     */
    async setDisplayMode(mode) {
        if (this.displayMode === mode) return;
        
        this.displayMode = mode;
        
        if (this.currentInstance) {
            await this.loadInstanceData(this.currentInstance.id, mode);
        }
    }
    
    /**
     * Refresh display with current data
     */
    async refresh() {
        if (this.currentInstance) {
            await this.loadInstanceData(this.currentInstance.id, this.displayMode);
        }
    }
    
    /**
     * Get current instance info
     */
    getCurrentInstance() {
        return this.currentInstance;
    }
    
    /**
     * Get visibility summary for current instance
     */
    getVisibilitySummary() {
        if (!this.currentInstance) return null;
        
        return workflowEngine.getVisibilitySummary(
            this.currentInstance,
            this.participant.role_id
        );
    }
    
    /**
     * Cleanup component
     */
    destroy() {
        this.container.innerHTML = '';
        this.currentInstance = null;
        this.participant = null;
        
        this.logger.log('Destroyed');
    }
}

// Export singleton factory for common usage
export function createWorkflowDataDisplay(container, participant) {
    return new WorkflowDataDisplay(container, participant);
}