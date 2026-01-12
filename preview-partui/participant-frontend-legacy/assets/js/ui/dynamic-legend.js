/**
 * Dynamic Legend Component - Participants Frontend
 * Database-driven legend that shows marker categories and workflow types
 * Adapts based on visible markers and role-based access
 */

import DebugLogger from '../core/debug-logger.js';
import markerSystem from '../map/marker-system.js';
import { supabaseClient } from '../core/supabase.js';

// Legend state and configuration
let legendVisible = false;
let legendConfig = {
    markerCategories: {},
    workflowTypes: {},
    currentMarkers: []
};

// Debug logger
const logger = new DebugLogger('DynamicLegend');

/**
 * Initialize dynamic legend system
 */
async function initializeDynamicLegend() {
    try {
        logger.log('Initializing dynamic legend system...');
        
        // Setup legend container first
        setupLegendContainer();
        
        // Setup legend toggle functionality  
        setupLegendToggle();
        
        // Load legend configuration from database
        await loadLegendConfiguration();
        
        // Connect with marker system updates
        connectWithMarkerSystem();
        
        logger.log('Dynamic legend system initialized successfully');
        
    } catch (error) {
        logger.error('Failed to initialize dynamic legend:', error);
        // Show error state in legend
        showLegendError('Failed to initialize legend system');
    }
}

/**
 * Load legend configuration from database
 */
async function loadLegendConfiguration() {
    try {
        if (!supabaseClient || !supabaseClient.getParticipantClient) {
            throw new Error('Supabase client not available');
        }
        
        // Load marker categories with role-based filtering (RLS handles this)
        const { data: categories, error: categoriesError } = await supabaseClient.getParticipantClient()
            .from('marker_categories')
            .select('id, name, description, icon_config');
            
        if (categoriesError) {
            logger.error('Error loading marker categories:', categoriesError);
        } else {
            // Store categories by ID for quick lookup
            legendConfig.markerCategories = {};
            (categories || []).forEach(category => {
                legendConfig.markerCategories[category.id] = category;
            });
            logger.log(`Loaded ${categories?.length || 0} marker categories for legend`);
        }
        
        // Load workflow types with role-based filtering (RLS handles this)
        const { data: workflows, error: workflowsError } = await supabaseClient.getParticipantClient()
            .from('workflows')
            .select('id, name, description, workflow_type, marker_color, icon_config')
            .eq('workflow_type', 'incident') // Only incident workflows show on map
            .eq('is_active', true);
            
        if (workflowsError) {
            logger.error('Error loading workflows:', workflowsError);
        } else {
            // Store workflows by ID for quick lookup
            legendConfig.workflowTypes = {};
            (workflows || []).forEach(workflow => {
                legendConfig.workflowTypes[workflow.id] = workflow;
            });
            logger.log(`Loaded ${workflows?.length || 0} workflow types for legend`);
        }
        
    } catch (error) {
        logger.error('Failed to load legend configuration:', error);
        showLegendError('Failed to load configuration from database');
    }
}

/**
 * Show error state in legend
 */
function showLegendError(message) {
    const legend = document.getElementById('mapLegend');
    if (!legend) return;
    
    const legendContent = legend.querySelector('.legend-content');
    if (!legendContent) return;
    
    legendContent.innerHTML = `
        <div class="legend-error">
            <div class="legend-error-icon">⚠️</div>
            <div class="legend-error-message">${message}</div>
            <button class="legend-retry-btn" onclick="window.refreshLegendConfig()">
                Try Again
            </button>
        </div>
    `;
    
    // Add error styling
    if (!document.getElementById('legend-error-styles')) {
        const style = document.createElement('style');
        style.id = 'legend-error-styles';
        style.textContent = `
            .legend-error {
                text-align: center;
                padding: 20px;
                color: #dc3545;
            }
            
            .legend-error-icon {
                font-size: 24px;
                margin-bottom: 8px;
            }
            
            .legend-error-message {
                font-size: 14px;
                margin-bottom: 12px;
                line-height: 1.4;
            }
            
            .legend-retry-btn {
                background: #dc3545;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                transition: background-color 0.2s;
            }
            
            .legend-retry-btn:hover {
                background: #c82333;
            }
        `;
        document.head.appendChild(style);
    }
}

/**
 * Setup legend container with proper structure
 */
function setupLegendContainer() {
    const legend = document.getElementById('mapLegend');
    if (!legend) {
        logger.warn('Map legend container not found');
        return;
    }
    
    // Add legend classes for styling
    legend.classList.add('dynamic-legend');
    
    // Initially hidden
    legend.style.display = 'none';
    legendVisible = false;
    
    // Clear existing content and setup with header
    legend.innerHTML = `
        <div class="legend-header">
            <h4>Map Legend</h4>
            <button class="legend-close-btn" onclick="window.toggleLegend()" title="Close Legend">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="legend-content">
            <div class="legend-loading">Loading legend...</div>
        </div>
    `;
    
    logger.log('Legend container setup complete');
}

/**
 * Connect with marker system to update legend when markers change
 */
function connectWithMarkerSystem() {
    // Listen for marker update events
    window.addEventListener('markers-updated', (event) => {
        const markers = event.detail.markers || [];
        updateLegendWithMarkers(markers);
    });
    
    // Try to get initial markers if available
    try {
        const currentMarkers = markerSystem.getVisibleMarkers();
        if (currentMarkers && currentMarkers.length > 0) {
            updateLegendWithMarkers(currentMarkers);
        } else {
            // Show empty state initially
            renderLegendContent({ staticMarkers: {}, workflowInstances: {} });
        }
    } catch (error) {
        logger.warn('Could not get initial markers:', error);
        // Show empty state
        renderLegendContent({ staticMarkers: {}, workflowInstances: {} });
    }
    
    logger.log('Connected with marker system for automatic legend updates');
}

/**
 * Update legend based on currently visible markers
 */
function updateLegendWithMarkers(markers) {
    try {
        logger.log(`Updating legend with ${markers.length} visible markers`);
        
        // Store current markers
        legendConfig.currentMarkers = markers;
        
        // Analyze markers to determine legend sections
        const legendSections = analyzeMarkersForLegend(markers);
        
        // Render legend content
        renderLegendContent(legendSections);
        
    } catch (error) {
        logger.error('Failed to update legend with markers:', error);
    }
}

/**
 * Analyze markers to determine what should appear in legend
 */
function analyzeMarkersForLegend(markers) {
    const sections = {
        staticMarkers: {},     // category_id -> { category, markers: [], count }
        workflowInstances: {}  // workflow_id -> { workflow, markers: [], count }
    };
    
    markers.forEach(marker => {
        if (marker.type === 'static' && marker.categoryId) {
            // Static marker with category
            if (!sections.staticMarkers[marker.categoryId]) {
                sections.staticMarkers[marker.categoryId] = {
                    category: legendConfig.markerCategories[marker.categoryId] || {
                        name: 'Unknown Category',
                        description: '',
                        icon_config: {}
                    },
                    markers: [],
                    count: 0
                };
            }
            sections.staticMarkers[marker.categoryId].markers.push(marker);
            sections.staticMarkers[marker.categoryId].count++;
            
        } else if (marker.type === 'workflow_instance' && marker.workflowId) {
            // Workflow instance marker
            if (!sections.workflowInstances[marker.workflowId]) {
                sections.workflowInstances[marker.workflowId] = {
                    workflow: legendConfig.workflowTypes[marker.workflowId] || {
                        name: marker.workflowName || 'Unknown Workflow',
                        description: '',
                        marker_color: marker.markerColor || '#6c757d',
                        icon_config: marker.iconConfig || {}
                    },
                    markers: [],
                    count: 0
                };
            }
            sections.workflowInstances[marker.workflowId].markers.push(marker);
            sections.workflowInstances[marker.workflowId].count++;
        }
    });
    
    return sections;
}

/**
 * Render legend content based on analyzed sections
 */
function renderLegendContent(sections) {
    const legend = document.getElementById('mapLegend');
    if (!legend) return;
    
    const legendContent = legend.querySelector('.legend-content');
    if (!legendContent) return;
    
    let contentHTML = '';
    
    // Check if we have any content to display
    const hasStaticMarkers = Object.keys(sections.staticMarkers).length > 0;
    const hasWorkflowInstances = Object.keys(sections.workflowInstances).length > 0;
    
    if (!hasStaticMarkers && !hasWorkflowInstances) {
        contentHTML = `
            <div class="legend-empty">
                <p>No markers visible</p>
                <p>Adjust filters or zoom level</p>
            </div>
        `;
    } else {
        // Render static marker categories
        if (hasStaticMarkers) {
            contentHTML += '<div class="legend-section-group">';
            contentHTML += '<h5 class="legend-section-title">Static Markers</h5>';
            
            Object.values(sections.staticMarkers).forEach(section => {
                const iconHTML = createLegendIcon(section.category.icon_config, 'static');
                contentHTML += `
                    <div class="legend-section">
                        <div class="legend-section-header">
                            <span class="legend-section-name">${section.category.name}</span>
                            <span class="legend-section-count">(${section.count})</span>
                        </div>
                        <div class="legend-item">
                            <div class="legend-icon">${iconHTML}</div>
                            <span class="legend-description">${section.category.description || section.category.name}</span>
                        </div>
                    </div>
                `;
            });
            
            contentHTML += '</div>';
        }
        
        // Render workflow instance types
        if (hasWorkflowInstances) {
            contentHTML += '<div class="legend-section-group">';
            contentHTML += '<h5 class="legend-section-title">Active Workflows</h5>';
            
            Object.values(sections.workflowInstances).forEach(section => {
                const iconHTML = createLegendIcon(
                    section.workflow.icon_config, 
                    'workflow', 
                    section.workflow.marker_color
                );
                contentHTML += `
                    <div class="legend-section">
                        <div class="legend-section-header">
                            <span class="legend-section-name">${section.workflow.name}</span>
                            <span class="legend-section-count">(${section.count})</span>
                        </div>
                        <div class="legend-item">
                            <div class="legend-icon">${iconHTML}</div>
                            <span class="legend-description">${section.workflow.description || section.workflow.name}</span>
                        </div>
                    </div>
                `;
            });
            
            contentHTML += '</div>';
        }
    }
    
    // Update legend content
    legendContent.innerHTML = contentHTML;
    
    // Add CSS for legend styling if not already added
    addLegendStyles();
}

/**
 * Create legend icon HTML based on icon configuration
 */
function createLegendIcon(iconConfig, markerType, color = null) {
    iconConfig = iconConfig || {};
    
    // Use color from parameter or icon config
    const iconColor = color || iconConfig.color || iconConfig.style?.color || '#6c757d';
    
    // Check if we have SVG icon
    if (iconConfig.type === 'svg' && iconConfig.svgContent) {
        return createSVGLegendIcon(iconConfig, iconColor);
    }
    
    // Fallback to shape-based icons
    const shape = iconConfig.shape || iconConfig.style?.shape || 'circle';
    return createShapeLegendIcon(shape, iconColor);
}

/**
 * Create SVG-based legend icon
 */
function createSVGLegendIcon(iconConfig, color) {
    const size = 20; // Fixed size for legend
    let svgContent = iconConfig.svgContent;
    
    if (svgContent) {
        // Update SVG styling for legend size
        svgContent = svgContent.replace(
            /(<svg[^>]*)(>)/, 
            `$1 style="width: ${size}px; height: ${size}px; fill: ${color};"$2`
        );
    }
    
    return `
        <div class="legend-svg-container" style="width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center;">
            ${svgContent || `<div style="width: 12px; height: 12px; background: ${color}; border-radius: 50%;"></div>`}
        </div>
    `;
}

/**
 * Create shape-based legend icon
 */
function createShapeLegendIcon(shape, color) {
    switch(shape) {
        case 'triangle':
            return `<div class="legend-shape-triangle" style="border-bottom-color: ${color};"></div>`;
        case 'diamond':
            return `<div class="legend-shape-diamond" style="background-color: ${color};"></div>`;
        case 'square':
            return `<div class="legend-shape-square" style="background-color: ${color};"></div>`;
        case 'circle':
        default:
            return `<div class="legend-shape-circle" style="background-color: ${color};"></div>`;
    }
}

/**
 * Add CSS styles for legend
 */
function addLegendStyles() {
    // Check if styles already added
    if (document.getElementById('dynamic-legend-styles')) {
        return;
    }
    
    const style = document.createElement('style');
    style.id = 'dynamic-legend-styles';
    style.textContent = `
        .dynamic-legend {
            background: white;
            border-radius: 8px;
            padding: 0;
            box-shadow: 0 2px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            max-width: 280px;
            transition: opacity 0.3s, transform 0.3s;
        }
        
        .legend-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            border-bottom: 1px solid #e9ecef;
            background: #f8f9fa;
            border-radius: 8px 8px 0 0;
        }
        
        .legend-header h4 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: #495057;
        }
        
        .legend-close-btn {
            background: none;
            border: none;
            cursor: pointer;
            color: #6c757d;
            font-size: 14px;
            padding: 4px;
            border-radius: 4px;
            transition: background-color 0.2s, color 0.2s;
        }
        
        .legend-close-btn:hover {
            background-color: #e9ecef;
            color: #dc3545;
        }
        
        .legend-content {
            padding: 16px;
            max-height: 400px;
            overflow-y: auto;
        }
        
        .legend-section-group {
            margin-bottom: 20px;
        }
        
        .legend-section-group:last-child {
            margin-bottom: 0;
        }
        
        .legend-section-title {
            margin: 0 0 12px 0;
            font-size: 14px;
            font-weight: 600;
            color: #343a40;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .legend-section {
            margin-bottom: 16px;
        }
        
        .legend-section:last-child {
            margin-bottom: 0;
        }
        
        .legend-section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        
        .legend-section-name {
            font-weight: 500;
            color: #495057;
            font-size: 13px;
        }
        
        .legend-section-count {
            font-size: 12px;
            color: #6c757d;
            background: #f8f9fa;
            padding: 2px 8px;
            border-radius: 12px;
        }
        
        .legend-item {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        .legend-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            flex-shrink: 0;
        }
        
        .legend-description {
            font-size: 12px;
            color: #6c757d;
            line-height: 1.4;
        }
        
        .legend-empty {
            text-align: center;
            color: #6c757d;
            font-style: italic;
            padding: 20px;
        }
        
        .legend-empty p {
            margin: 0 0 8px 0;
            font-size: 14px;
        }
        
        .legend-empty p:last-child {
            margin-bottom: 0;
        }
        
        .legend-loading {
            text-align: center;
            color: #6c757d;
            padding: 20px;
            font-style: italic;
        }
        
        /* Shape styles for legend icons */
        .legend-shape-circle {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            border: 2px solid rgba(255,255,255,0.8);
        }
        
        .legend-shape-square {
            width: 14px;
            height: 14px;
            border: 2px solid rgba(255,255,255,0.8);
        }
        
        .legend-shape-diamond {
            width: 12px;
            height: 16px;
            clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
        }
        
        .legend-shape-triangle {
            width: 0;
            height: 0;
            border-left: 8px solid transparent;
            border-right: 8px solid transparent;
            border-bottom: 14px solid #6c757d;
        }
        
        /* Responsive adjustments */
        @media (max-width: 768px) {
            .dynamic-legend {
                max-width: 260px;
                font-size: 14px;
            }
            
            .legend-content {
                max-height: 300px;
            }
        }
        
        /* Show/hide animations */
        .dynamic-legend.legend-show {
            opacity: 1;
            transform: translateY(0);
        }
        
        .dynamic-legend.legend-hide {
            opacity: 0;
            transform: translateY(10px);
        }
    `;
    
    document.head.appendChild(style);
}

/**
 * Setup legend toggle functionality
 */
function setupLegendToggle() {
    // Make toggle function globally available
    window.toggleLegend = toggleLegend;
    
    // Update existing toggle buttons to use our function
    updateToggleButtons();
}

/**
 * Toggle legend visibility
 */
function toggleLegend() {
    const legend = document.getElementById('mapLegend');
    if (!legend) {
        logger.warn('Legend container not found for toggle');
        return;
    }
    
    legendVisible = !legendVisible;
    
    if (legendVisible) {
        legend.style.display = 'block';
        legend.classList.add('legend-show');
        legend.classList.remove('legend-hide');
        
        // If no content yet, update with current markers
        if (legendConfig.currentMarkers.length > 0) {
            updateLegendWithMarkers(legendConfig.currentMarkers);
        }
        
        logger.log('Legend shown');
    } else {
        legend.classList.add('legend-hide');
        legend.classList.remove('legend-show');
        
        // Hide after animation
        setTimeout(() => {
            if (!legendVisible) {
                legend.style.display = 'none';
            }
        }, 300);
        
        logger.log('Legend hidden');
    }
}

/**
 * Update toggle buttons to use our toggle function
 */
function updateToggleButtons() {
    // Update button titles and ensure onclick is properly set
    const toggleButtons = document.querySelectorAll('.legend-toggle-button, [onclick="toggleLegend()"]');
    toggleButtons.forEach(button => {
        button.setAttribute('title', 'Toggle Map Legend');
        if (!button.onclick) {
            button.addEventListener('click', toggleLegend);
        }
    });
}

/**
 * Get legend visibility state
 */
function isLegendVisible() {
    return legendVisible;
}

/**
 * Refresh legend configuration from database
 */
async function refreshLegendConfiguration() {
    logger.log('Refreshing legend configuration...');
    
    await loadLegendConfiguration();
    
    // Update legend if currently visible
    if (legendVisible && legendConfig.currentMarkers.length > 0) {
        updateLegendWithMarkers(legendConfig.currentMarkers);
    }
    
    logger.log('Legend configuration refreshed');
}

/**
 * Manual update of legend with specific markers (for external calls)
 */
function updateLegend(markers = null) {
    const markersToUse = markers || markerSystem.getVisibleMarkers();
    updateLegendWithMarkers(markersToUse);
}

/**
 * Debug function to check legend status
 */
function debugLegendStatus() {
    const status = {
        legendVisible,
        configLoaded: {
            markerCategories: Object.keys(legendConfig.markerCategories).length,
            workflowTypes: Object.keys(legendConfig.workflowTypes).length
        },
        currentMarkers: legendConfig.currentMarkers.length,
        supabaseClient: !!supabaseClient,
        markerSystem: !!markerSystem
    };
    
    logger.log('Legend Debug Status:', status);
    console.table(status);
    return status;
}

// Export legend functions
export default {
    initializeDynamicLegend,
    toggleLegend,
    isLegendVisible,
    refreshLegendConfiguration,
    updateLegend,
    debugLegendStatus
};

// Make functions globally available for compatibility
window.toggleLegend = toggleLegend;
window.updateDynamicLegend = updateLegend;
window.refreshLegendConfig = refreshLegendConfiguration;
window.debugLegendStatus = debugLegendStatus;