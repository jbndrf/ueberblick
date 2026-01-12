/**
 * Enhanced Marker Detail Module
 * 
 * Advanced marker details display with tabbed interface and swipe navigation
 * Adapted from bdhi_app implementation with modern enhancements
 * 
 * Features:
 * - Tabbed interface (Overview, Details, Audit Trail)
 * - Swipe navigation between markers
 * - Dynamic content organization
 * - Role-based visibility
 * - Premium UI/UX design
 */

import { BottomSheetModule } from './bottom-sheet.js';
import eventManager from '../core/event-manager.js';
import DebugLogger from '../core/debug-logger.js';

export class EnhancedMarkerDetailModule extends BottomSheetModule {
    constructor(options = {}) {
        super({
            id: 'enhanced-marker-detail',
            title: 'Marker Details',
            peekHeight: 0.4,
            expandedHeight: 0.8,
            ...options
        });
        
        this.markerData = null;
        this.activeTab = 'overview';
        this.activeDetailTab = 'stage-based';
        this.customCategories = false;
        this.allPhotos = [];
        this.auditTrail = [];
        
        this.logger = new DebugLogger('EnhancedMarkerDetail');
        
        // Register for cleanup
        eventManager.registerComponent('enhanced-marker-detail', { 
            destroy: () => this.destroy() 
        });
    }

    /**
     * Render enhanced marker details with tabbed interface
     */
    async render(container, params = {}) {
        this.container = container;
        this.markerData = params.marker;
        
        if (!this.markerData) {
            this.renderError('No marker data provided');
            return;
        }

        try {
            // Load additional data
            await this.loadAdditionalData();
            
            // Render the enhanced tabbed interface
            await this.renderTabbedInterface();
            
            this.logger.log('Enhanced marker detail rendered successfully');
        } catch (error) {
            this.logger.error('Render error:', error);
            this.renderError('Failed to load marker details');
        }
    }

    /**
     * Load additional data for enhanced display
     */
    async loadAdditionalData() {
        // In a real implementation, this would load:
        // - Audit trail data
        // - Photos from various stages
        // - Related workflow data
        // For now, we'll simulate this data
        
        this.auditTrail = this.generateMockAuditTrail();
        this.allPhotos = this.generateMockPhotos();
        
        this.logger.log('Additional data loaded');
    }

    /**
     * Generate mock audit trail for demo
     */
    generateMockAuditTrail() {
        return [
            {
                id: 1,
                executed_at: new Date(Date.now() - 86400000).toISOString(),
                participant_name: 'Max Mustermann',
                action_name: 'Incident Report Created',
                notes: 'Initial report created with photos'
            },
            {
                id: 2,
                executed_at: new Date(Date.now() - 43200000).toISOString(),
                participant_name: 'Anna Schmidt', 
                action_name: 'Assessment Completed',
                notes: 'Technical assessment finished'
            },
            {
                id: 3,
                executed_at: new Date(Date.now() - 7200000).toISOString(),
                participant_name: 'Tom Weber',
                action_name: 'Repair Assigned', 
                notes: 'Assigned to maintenance team'
            }
        ];
    }

    /**
     * Generate mock photos for demo
     */
    generateMockPhotos() {
        return [
            {
                url: 'https://picsum.photos/300/200?random=1',
                caption: 'Initial Damage Photo',
                stageName: 'Initial Assessment'
            },
            {
                url: 'https://picsum.photos/300/200?random=2', 
                caption: 'Damage Detail View',
                stageName: 'Initial Assessment'
            },
            {
                url: 'https://picsum.photos/300/200?random=3',
                caption: 'Repair Progress',
                stageName: 'Repair Phase'
            }
        ];
    }

    /**
     * Render the enhanced tabbed interface
     */
    async renderTabbedInterface() {
        const cleanTitle = this.cleanupTitle(this.markerData.title || this.markerData.name);
        const location = this.extractLocationFromMarker(this.markerData);
        const timeAgo = this.formatTimeAgo(this.markerData.createdAt || this.markerData.created_at);
        
        this.container.innerHTML = `
            <div class="enhanced-marker-detail">
                <!-- Enhanced Header Section -->
                <div class="marker-header-section">
                    <div class="header-content">
                        <div class="title-section">
                            <h1 class="marker-title">${cleanTitle}</h1>
                            <div class="meta-info">
                                <div class="status-indicator">
                                    <div class="status-badge active">Active</div>
                                    <span>Status: Open</span>
                                </div>
                                <div class="time-info">
                                    <i class="fas fa-clock"></i>
                                    <span>${timeAgo}</span>
                                </div>
                            </div>
                            <div class="location-info">
                                <i class="fas fa-map-marker-alt"></i>
                                <span>${location}</span>
                            </div>
                        </div>
                        <div class="header-actions">
                            <button class="header-action-btn" data-action="bookmark">
                                <i class="fas fa-bookmark"></i>
                            </button>
                            <button class="header-action-btn" data-action="share">
                                <i class="fas fa-share"></i>
                            </button>
                            <button class="header-action-btn" data-action="menu">
                                <i class="fas fa-ellipsis-v"></i>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Tab Navigation -->
                <div class="tab-navigation">
                    <div class="tab-buttons">
                        <button class="tab-btn ${this.activeTab === 'overview' ? 'active' : ''}" data-tab="overview">
                            <i class="fas fa-eye"></i>
                            Übersicht
                        </button>
                        <button class="tab-btn ${this.activeTab === 'details' ? 'active' : ''}" data-tab="details">
                            <i class="fas fa-list-ul"></i>
                            Details
                        </button>
                        <button class="tab-btn ${this.activeTab === 'photos' ? 'active' : ''}" data-tab="photos">
                            <i class="fas fa-camera"></i>
                            Fotos
                        </button>
                        <button class="tab-btn ${this.activeTab === 'history' ? 'active' : ''}" data-tab="history">
                            <i class="fas fa-history"></i>
                            Verlauf
                        </button>
                    </div>
                </div>

                <!-- Tab Content -->
                <div class="tab-content-area">
                    <div id="tabContent">
                        ${await this.renderTabContent()}
                    </div>
                </div>
            </div>
        `;
        
        // Setup event handlers
        this.setupTabbedInterfaceHandlers();
    }

    /**
     * Render tab content based on active tab
     */
    async renderTabContent() {
        switch (this.activeTab) {
            case 'overview':
                return this.renderOverviewTab();
            case 'details':
                return this.renderDetailsTab();
            case 'photos':
                return this.renderPhotosTab();
            case 'history':
                return this.renderHistoryTab();
            default:
                return '<p>Invalid tab</p>';
        }
    }

    /**
     * Render overview tab content
     */
    renderOverviewTab() {
        const location = this.extractLocationFromMarker(this.markerData);
        
        return `
            <div class="overview-content">
                <!-- Quick Info Cards -->
                <div class="info-cards">
                    <div class="info-card">
                        <div class="card-icon location">
                            <i class="fas fa-map-marker-alt"></i>
                        </div>
                        <div class="card-content">
                            <div class="card-title">Location</div>
                            <div class="card-value">${location}</div>
                        </div>
                    </div>
                    
                    <div class="info-card">
                        <div class="card-icon status">
                            <i class="fas fa-info-circle"></i>
                        </div>
                        <div class="card-content">
                            <div class="card-title">Status</div>
                            <div class="card-value">Open - In Progress</div>
                            <div class="card-subtext">Active processing</div>
                        </div>
                    </div>
                    
                    <div class="info-card">
                        <div class="card-icon contact">
                            <i class="fas fa-user"></i>
                        </div>
                        <div class="card-content">
                            <div class="card-title">Last Updated</div>
                            <div class="card-value">${this.auditTrail[this.auditTrail.length - 1]?.participant_name || 'Unknown'}</div>
                            <div class="card-subtext">Latest activity</div>
                        </div>
                    </div>
                </div>

                <!-- Photo Preview -->
                ${this.allPhotos.length > 0 ? `
                    <div class="photo-preview-section">
                        <div class="section-header">
                            <h3>
                                <i class="fas fa-camera"></i>
                                Photos (${this.allPhotos.length})
                            </h3>
                            <button class="view-all-btn" data-tab="photos">View All</button>
                        </div>
                        <div class="photo-preview-grid">
                            ${this.allPhotos.slice(0, 3).map(photo => `
                                <div class="photo-preview-item">
                                    <img src="${photo.url}" alt="${photo.caption}" loading="lazy" />
                                    <div class="photo-caption">${photo.caption}</div>
                                </div>
                            `).join('')}
                            ${this.allPhotos.length > 3 ? `
                                <div class="photo-preview-item more">
                                    <div class="more-count">+${this.allPhotos.length - 3}</div>
                                    <div class="more-text">more photos</div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                ` : ''}
                
                <!-- Key Properties -->
                ${this.markerData.properties ? `
                    <div class="properties-section">
                        <div class="section-header">
                            <h3>
                                <i class="fas fa-tags"></i>
                                Key Information
                            </h3>
                        </div>
                        <div class="properties-list">
                            ${Object.entries(this.markerData.properties).slice(0, 5).map(([key, value]) => `
                                <div class="property-item">
                                    <span class="property-label">${this.formatPropertyLabel(key)}</span>
                                    <span class="property-value">${this.formatPropertyValue(value)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Render details tab content
     */
    renderDetailsTab() {
        return `
            <div class="details-content">
                <div class="details-section">
                    <h3>Technical Details</h3>
                    ${this.markerData.properties ? `
                        <div class="details-grid">
                            ${Object.entries(this.markerData.properties).map(([key, value]) => `
                                <div class="detail-row">
                                    <span class="detail-label">${this.formatPropertyLabel(key)}</span>
                                    <span class="detail-value">${this.formatPropertyValue(value)}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : '<p>No detailed information available</p>'}
                </div>
                
                <div class="coordinates-section">
                    <h3>Geographic Information</h3>
                    <div class="coordinates-grid">
                        <div class="coordinate-item">
                            <span class="coord-label">Latitude</span>
                            <span class="coord-value">${this.markerData.lat?.toFixed(6) || 'N/A'}</span>
                        </div>
                        <div class="coordinate-item">
                            <span class="coord-label">Longitude</span>
                            <span class="coord-value">${this.markerData.lng?.toFixed(6) || 'N/A'}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render photos tab content
     */
    renderPhotosTab() {
        if (this.allPhotos.length === 0) {
            return `
                <div class="no-photos">
                    <div class="no-photos-icon">
                        <i class="fas fa-camera"></i>
                    </div>
                    <div class="no-photos-text">No photos available</div>
                </div>
            `;
        }

        return `
            <div class="photos-content">
                <div class="photos-header">
                    <h3>All Photos (${this.allPhotos.length})</h3>
                </div>
                <div class="photos-gallery">
                    ${this.allPhotos.map((photo, index) => `
                        <div class="gallery-item" data-photo-index="${index}">
                            <img src="${photo.url}" alt="${photo.caption}" loading="lazy" />
                            <div class="gallery-info">
                                <div class="gallery-caption">${photo.caption}</div>
                                <div class="gallery-stage">${photo.stageName}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Render history tab content
     */
    renderHistoryTab() {
        if (this.auditTrail.length === 0) {
            return `
                <div class="no-history">
                    <div class="no-history-icon">
                        <i class="fas fa-history"></i>
                    </div>
                    <div class="no-history-text">No history available</div>
                </div>
            `;
        }

        return `
            <div class="history-content">
                <div class="history-header">
                    <h3>Activity History</h3>
                </div>
                <div class="history-timeline">
                    ${this.auditTrail.map((entry, index) => `
                        <div class="timeline-item">
                            <div class="timeline-marker"></div>
                            <div class="timeline-content">
                                <div class="timeline-header">
                                    <span class="timeline-participant">${entry.participant_name}</span>
                                    <span class="timeline-time">${this.formatDateTime(entry.executed_at)}</span>
                                </div>
                                <div class="timeline-action">${entry.action_name}</div>
                                ${entry.notes ? `<div class="timeline-notes">${entry.notes}</div>` : ''}
                            </div>
                            ${index < this.auditTrail.length - 1 ? '<div class="timeline-connector"></div>' : ''}
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
                component: 'enhanced-marker-detail',
                description: `Tab button handler for ${button.getAttribute('data-tab')}`
            });
        });
        
        // View all photos button
        const viewAllBtn = this.container.querySelector('.view-all-btn');
        if (viewAllBtn) {
            eventManager.add(viewAllBtn, 'click', async () => {
                const tab = viewAllBtn.getAttribute('data-tab');
                await this.switchTab(tab);
            }, {
                component: 'enhanced-marker-detail',
                description: 'View all photos handler'
            });
        }
        
        // Photo gallery click handlers
        const galleryItems = this.container.querySelectorAll('.gallery-item');
        galleryItems.forEach(item => {
            eventManager.add(item, 'click', () => {
                const photoIndex = parseInt(item.getAttribute('data-photo-index'));
                this.openPhotoModal(photoIndex);
            }, {
                component: 'enhanced-marker-detail',
                description: 'Photo gallery click handler'
            });
        });
    }

    /**
     * Switch to a different tab
     */
    async switchTab(tab) {
        this.activeTab = tab;
        
        // Update tab button states
        const tabButtons = this.container.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
        });
        
        // Update tab content
        const tabContentElement = this.container.querySelector('#tabContent');
        if (tabContentElement) {
            tabContentElement.innerHTML = await this.renderTabContent();
            
            // Re-setup content handlers
            this.setupContentHandlers();
        }
    }

    /**
     * Setup content-specific handlers after tab switch
     */
    setupContentHandlers() {
        // Re-setup photo gallery handlers if in photos tab
        if (this.activeTab === 'photos') {
            const galleryItems = this.container.querySelectorAll('.gallery-item');
            galleryItems.forEach(item => {
                eventManager.add(item, 'click', () => {
                    const photoIndex = parseInt(item.getAttribute('data-photo-index'));
                    this.openPhotoModal(photoIndex);
                }, {
                    component: 'enhanced-marker-detail',
                    description: 'Photo gallery click handler'
                });
            });
        }
    }

    /**
     * Open photo modal
     */
    openPhotoModal(photoIndex) {
        const photo = this.allPhotos[photoIndex];
        if (!photo) return;
        
        // Create simple modal
        const modal = document.createElement('div');
        modal.className = 'photo-modal';
        modal.innerHTML = `
            <div class="photo-modal-content">
                <img src="${photo.url}" alt="${photo.caption}" />
                <div class="photo-modal-caption">${photo.caption}</div>
                <button class="photo-modal-close">&times;</button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Close handler
        const closeBtn = modal.querySelector('.photo-modal-close');
        const closeModal = () => modal.remove();
        
        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    /**
     * Handle swipe navigation between markers
     */
    handleSwipeNavigation(direction) {
        this.logger.log(`Swipe navigation: ${direction}`);
        
        // Emit event for other components to handle marker navigation
        window.dispatchEvent(new CustomEvent('marker-detail:navigate', {
            detail: { 
                direction: direction === 'left' ? 'next' : 'previous',
                currentMarker: this.markerData
            }
        }));
    }

    /**
     * Utility methods
     */
    cleanupTitle(title) {
        if (!title) return 'Unnamed Marker';
        return title.replace(/\s*-\s*\d{1,2}\.\d{1,2}\.\d{4}\s*$/, '').trim();
    }

    extractLocationFromMarker(marker) {
        if (marker.address) return marker.address;
        if (marker.location?.address) return marker.location.address;
        if (marker.lat && marker.lng) return `${marker.lat.toFixed(4)}, ${marker.lng.toFixed(4)}`;
        return 'Location not specified';
    }

    formatTimeAgo(dateString) {
        if (!dateString) return 'Unknown time';
        
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

    formatDateTime(dateString) {
        if (!dateString) return 'Unknown time';
        return new Date(dateString).toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    formatPropertyLabel(key) {
        return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    formatPropertyValue(value) {
        if (!value || value === '') return 'Not specified';
        if (typeof value === 'boolean') return value ? 'Yes' : 'No';
        return String(value);
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
     * Cleanup method
     */
    destroy() {
        this.markerData = null;
        this.activeTab = null;
        this.allPhotos = [];
        this.auditTrail = [];
        
        super.destroy();
    }
}

export default EnhancedMarkerDetailModule;