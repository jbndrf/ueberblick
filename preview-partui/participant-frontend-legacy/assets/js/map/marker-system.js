/**
 * Dynamic Marker System - Participant Application
 * Adapted from legacy markers.js for Supabase integration
 */

import participantAuth from '../auth/participant-auth.js';
import stageIconRenderer from '../components/stage-icon-renderer.js';
import DebugLogger from '../core/debug-logger.js';

// Get supabase client dynamically to ensure we always get the latest instance
function getSupabaseClient() {
    return window.supabaseClient || (async () => {
        const { supabaseClient } = await import('../core/supabase.js');
        return supabaseClient;
    })();
}

// Marker storage and state
let allStaticMarkers = [];
let allWorkflowInstances = [];
let visibleMarkers = [];
let currentMarkerIndex = -1;
let markerLayer = null;

// Marker configurations cache
let markerCategories = {};
let workflowConfigs = {};

// Debug logger
const logger = new DebugLogger('MarkerSystem');

/**
 * Get participant roles for filtering
 */
async function getParticipantRoles() {
    try {
        const auth = participantAuth.getAuthStatus();
        logger.log('Auth status:', {
            isAuthenticated: auth.isAuthenticated,
            hasRoles: !!auth.roles,
            rolesLength: auth.roles?.length,
            roles: auth.roles
        });
        
        if (!auth.isAuthenticated || !auth.roles || auth.roles.length === 0) {
            logger.warn('No participant roles available', auth);
            return [];
        }
        
        const roleIds = auth.roles.map(role => role.id);
        logger.log('Participant role IDs:', roleIds);
        return roleIds;
    } catch (error) {
        logger.error('Failed to get participant roles:', error);
        return [];
    }
}

/**
 * Check if marker is visible to participant based on roles
 */
function isMarkerVisibleToParticipant(marker, participantRoleIds) {
    // If no participant roles, deny access
    if (!participantRoleIds || participantRoleIds.length === 0) {
        return false;
    }
    
    // Check marker-level visibility first
    if (marker.visible_to_roles && Array.isArray(marker.visible_to_roles) && marker.visible_to_roles.length > 0) {
        const hasMarkerAccess = marker.visible_to_roles.some(roleId => 
            participantRoleIds.includes(roleId)
        );
        if (!hasMarkerAccess) {
            return false;
        }
    }
    
    // Check category-level visibility
    if (marker.marker_categories?.visible_to_roles && 
        Array.isArray(marker.marker_categories.visible_to_roles) && 
        marker.marker_categories.visible_to_roles.length > 0) {
        
        const hasCategoryAccess = marker.marker_categories.visible_to_roles.some(roleId => 
            participantRoleIds.includes(roleId)
        );
        if (!hasCategoryAccess) {
            return false;
        }
    }
    
    // If no visibility restrictions or participant has access, show marker
    return true;
}

/**
 * Initialize marker system
 */
function initializeMarkerSystem(mapMarkerLayer) {
    markerLayer = mapMarkerLayer;
    logger.log('Marker system initialized');
}

/**
 * Load all markers (static markers + workflow instances)
 */
async function loadMarkers() {
    try {
        logger.log('Loading markers...');
        
        // Load static markers and workflow instances in parallel
        const [staticMarkers, workflowInstances] = await Promise.all([
            loadStaticMarkers(),
            loadWorkflowInstances()
        ]);
        
        allStaticMarkers = staticMarkers || [];
        allWorkflowInstances = workflowInstances || [];
        
        logger.log(`Loaded ${allStaticMarkers.length} static markers and ${allWorkflowInstances.length} workflow instances`);
        
        // Apply filters and display
        await applyFilters();
        
    } catch (error) {
        logger.error('Error loading markers:', error);
    }
}

/**
 * Load static markers from database with role-based filtering
 */
async function loadStaticMarkers() {
    try {
        // Load marker categories first for configuration
        await loadMarkerCategories();
        
        const client = await getSupabaseClient();
        const { data, error } = await client.getParticipantClient()
            .from('markers')
            .select(`
                id,
                title,
                description,
                location,
                properties,
                category_id,
                visible_to_roles,
                created_at,
                marker_categories (
                    id,
                    name,
                    description,
                    icon_config,
                    fields,
                    visible_to_roles
                )
            `);
        
        if (error) {
            logger.error('Error loading static markers:', error);
            return [];
        }
        
        // RLS policies handle role-based filtering server-side
        logger.log(`Loaded ${data.length} markers (filtered by RLS)`);
        
        // Transform markers to standard format
        return data.map(marker => ({
            id: marker.id,
            title: marker.title,
            description: marker.description,
            lat: marker.location.coordinates[1], // PostGIS: [lng, lat]
            lng: marker.location.coordinates[0],
            type: 'static',
            category: marker.marker_categories?.name || 'default',
            categoryId: marker.category_id,
            categoryData: marker.marker_categories,
            properties: marker.properties || {},
            iconConfig: marker.marker_categories?.icon_config || {},
            customFields: marker.marker_categories?.fields || [],
            createdAt: marker.created_at
        }));
        
    } catch (error) {
        logger.error('Failed to load static markers:', error);
        return [];
    }
}

/**
 * Load workflow instances (dynamic markers)
 */
async function loadWorkflowInstances() {
    try {
        // Load workflow configurations first
        await loadWorkflowConfigs();
        
        const client = await getSupabaseClient();
        const { data, error } = await client.getParticipantClient()
            .from('workflow_instances')
            .select(`
                id,
                title,
                location,
                status,
                progress_percentage,
                current_stage_id,
                created_at,
                workflow_id,
                workflows (
                    id,
                    name,
                    workflow_type,
                    marker_color,
                    icon_config,
                    location_update_roles,
                    assignment_roles,
                    self_assignment_roles
                ),
                workflow_stages!current_stage_id (
                    id,
                    stage_name,
                    stage_type,
                    visible_to_roles,
                    visual_config
                )
            `)
            .not('location', 'is', null) // Only map-based workflows
            .eq('workflows.workflow_type', 'incident'); // Only incident workflows show on map
        
        if (error) {
            logger.error('Error loading workflow instances:', error);
            return [];
        }
        
        // Transform instances to markers (RLS handles stage visibility filtering)
        return data
            .map(instance => ({
                id: instance.id,
                title: instance.title,
                lat: instance.location.coordinates[1], // PostGIS: [lng, lat]
                lng: instance.location.coordinates[0],
                type: 'workflow_instance',
                workflowId: instance.workflow_id,
                workflowName: instance.workflows?.name || 'Unknown Workflow',
                workflowType: instance.workflows?.workflow_type || 'incident',
                status: instance.status,
                progress: instance.progress_percentage || 0,
                stageName: instance.workflow_stages?.stage_name || 'Unknown Stage',
                currentStage: instance.workflow_stages || null,
                workflow: instance.workflows || null,
                createdAt: instance.created_at,
                markerColor: instance.workflows?.marker_color || '#6c757d',
                iconConfig: instance.workflows?.icon_config || {}
            }));
        
    } catch (error) {
        logger.error('Failed to load workflow instances:', error);
        return [];
    }
}

/**
 * Load marker categories configuration
 */
async function loadMarkerCategories() {
    try {
        const client = await getSupabaseClient();
        const { data, error } = await client.getParticipantClient()
            .from('marker_categories')
            .select('*');
            
        if (error) {
            logger.error('Error loading marker categories:', error);
            return;
        }
        
        markerCategories = {};
        data.forEach(category => {
            markerCategories[category.id] = category;
        });
        
    } catch (error) {
        logger.error('Failed to load marker categories:', error);
    }
}

/**
 * Load workflow configurations
 */
async function loadWorkflowConfigs() {
    try {
        const client = await getSupabaseClient();
        const { data, error } = await client.getParticipantClient()
            .from('workflows')
            .select('*');
            
        if (error) {
            logger.error('Error loading workflow configs:', error);
            return;
        }
        
        workflowConfigs = {};
        data.forEach(workflow => {
            workflowConfigs[workflow.id] = workflow;
        });
        
    } catch (error) {
        logger.error('Failed to load workflow configs:', error);
    }
}

/**
 * Display markers on the map with clustering
 */
async function displayMarkers(markers) {
    if (!markerLayer) {
        logger.warn('Marker layer not initialized');
        return;
    }
    
    // Clear existing markers
    markerLayer.clearLayers();
    
    // Track visible markers for navigation
    visibleMarkers = markers;
    
    // Process markers with async operations
    for (const marker of markers) {
        const markerIcon = createMarkerIcon(marker);
        // Markers are no longer draggable by default - location updates are handled through UI
        
        const mapMarker = L.marker([marker.lat, marker.lng], {
            icon: markerIcon,
            title: marker.title || 'Marker',
            draggable: false
        }).addTo(markerLayer);
        
        // Store marker data for click handling
        mapMarker.markerData = marker;
        
        // Add click handler
        mapMarker.on('click', function() {
            handleMarkerClick(marker);
        });
        
        // Drag functionality is now handled through the location update UI button
    }
    
    // Update navigation if needed
    updateNavigationButtons();
    
    // Trigger legend update event for dynamic legend component
    window.dispatchEvent(new CustomEvent('markers-updated', {
        detail: { markers: markers }
    }));
}

/**
 * Create workflow instance marker icon using stage configuration
 * Uses the same pattern as createSVGMarkerIcon for consistency
 */
function createWorkflowInstanceMarkerIcon(marker) {
    if (!marker.currentStage || !marker.currentStage.visual_config || !marker.currentStage.visual_config.icon) {
        return null; // Let the default logic handle this
    }

    // Use the existing createSVGMarkerIcon function with the stage's icon config
    const stageIconConfig = marker.currentStage.visual_config.icon;
    const iconHtml = createSVGMarkerIcon(stageIconConfig);

    // Create Leaflet divIcon using the same approach as static markers
    return L.divIcon({
        html: iconHtml,
        className: 'custom-marker-icon', // Same class as static markers
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
    });
}

/**
 * Create default workflow stage icon when no custom icon is configured
 * Uses workflow marker color if available, otherwise falls back to stage type colors
 */
function createDefaultWorkflowStageIcon(marker) {
    // Priority: 1) Workflow marker color, 2) Stage type default color
    let color = marker.markerColor;
    
    if (!color || color === '#6c757d') {
        // If no workflow color or it's the default gray, use stage type colors
        const stageType = marker.currentStage?.stage_type || 'intermediate';
        switch (stageType) {
            case 'start':
                color = '#10b981'; // green
                break;
            case 'end':
                color = '#ef4444'; // red
                break;
            case 'intermediate':
            default:
                color = '#3b82f6'; // blue
                break;
        }
    }
    
    // Just use the existing createCircleIcon function
    const iconHtml = createCircleIcon(color);
    
    return L.divIcon({
        html: iconHtml,
        className: 'default-workflow-stage-marker',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -11]
    });
}

/**
 * Create marker icon based on type and configuration
 */
function createMarkerIcon(marker) {
    // For workflow instances with custom stage icons, use the specialized renderer
    if (marker.type === 'workflow_instance' && marker.currentStage && 
        marker.currentStage.visual_config && marker.currentStage.visual_config.icon) {
        const customIcon = createWorkflowInstanceMarkerIcon(marker);
        if (customIcon) {
            return customIcon;
        }
    }
    
    let iconConfig = {};
    let color = '#6c757d'; // Default gray
    
    if (marker.type === 'static') {
        // Use category configuration
        iconConfig = marker.iconConfig || {};
        if (iconConfig.style) {
            color = iconConfig.style.color || color;
        }
    } else if (marker.type === 'workflow_instance') {
        // For workflow instances without custom stage icons, create a default stage-based icon
        if (!marker.currentStage || !marker.currentStage.visual_config || !marker.currentStage.visual_config.icon) {
            return createDefaultWorkflowStageIcon(marker);
        }
        
        // Use workflow configuration
        color = marker.markerColor || color;
        iconConfig = marker.iconConfig || {};
    }
    
    // Generate icon HTML
    let iconHtml = '';
    
    // Check if we have a custom SVG icon
    if (iconConfig.type === 'svg' && iconConfig.svgContent) {
        iconHtml = createSVGMarkerIcon(iconConfig);
    } else {
        // Fallback to legacy shape-based icons
        const shape = iconConfig.shape || iconConfig.style?.shape || 'circle';
        switch(shape) {
            case 'triangle':
                iconHtml = createTriangleIcon(color);
                break;
            case 'diamond':
                iconHtml = createDiamondIcon(color);
                break;
            case 'square':
                iconHtml = createSquareIcon(color);
                break;
            case 'circle':
            default:
                iconHtml = createCircleIcon(color);
                break;
        }
    }
    
    // Get size from configuration
    const size = iconConfig.style?.size || 32;
    const iconSize = [size, size];
    const iconAnchor = [size / 2, size / 2];
    
    return L.divIcon({
        className: 'custom-marker-icon',
        html: iconHtml,
        iconSize: iconSize,
        iconAnchor: iconAnchor
    });
}

/**
 * Handle marker click events
 */
function handleMarkerClick(marker) {
    // Find the index of this marker in visibleMarkers
    currentMarkerIndex = visibleMarkers.findIndex(m => 
        m.id === marker.id && m.type === marker.type);
    
    if (marker.type === 'static') {
        showStaticMarkerDetails(marker);
    } else if (marker.type === 'workflow_instance') {
        showWorkflowInstanceDetails(marker);
    }
}

/**
 * Show static marker details in bottom sheet
 */
async function showStaticMarkerDetails(marker) {
    logger.log('Show static marker details:', marker);
    
    try {
        // Import bottom sheet and marker detail module
        const { bottomSheet } = await import('../ui/bottom-sheet.js');
        const { MarkerDetailModule } = await import('../ui/marker-detail-module.js');
        
        // Register module if not already registered
        if (!bottomSheet.moduleRegistry.has('marker-detail')) {
            bottomSheet.registerModule('marker-detail', MarkerDetailModule);
        }
        
        // Load marker detail module
        await bottomSheet.loadModule('marker-detail', {
            title: marker.title || 'Marker Details',
            marker: marker
        });
        
    } catch (error) {
        logger.error('Failed to show static marker details:', error);
    }
}

/**
 * Show workflow instance details in bottom sheet
 */
async function showWorkflowInstanceDetails(marker) {
    logger.log('Show workflow instance details:', marker);
    
    try {
        // Import bottom sheet and marker detail module
        const { bottomSheet } = await import('../ui/bottom-sheet.js');
        const { MarkerDetailModule } = await import('../ui/marker-detail-module.js');
        
        // Register module if not already registered
        if (!bottomSheet.moduleRegistry.has('marker-detail')) {
            bottomSheet.registerModule('marker-detail', MarkerDetailModule);
        }
        
        // Load marker detail module
        await bottomSheet.loadModule('marker-detail', {
            title: marker.title || 'Workflow Instance',
            marker: marker
        });
        
    } catch (error) {
        logger.error('Failed to show workflow instance details:', error);
    }
}

/**
 * Apply filters to markers (basic implementation)
 */
async function applyFilters() {
    // Combine all markers
    const allMarkers = [...allStaticMarkers, ...allWorkflowInstances];
    
    // For now, show all markers - filtering will be enhanced in later phases
    const filteredMarkers = allMarkers;
    
    // Reset current marker index
    currentMarkerIndex = filteredMarkers.length > 0 ? 0 : -1;
    
    // Display the filtered markers
    await displayMarkers(filteredMarkers);
}

/**
 * Navigation between markers
 */
function navigateToPreviousMarker() {
    if (visibleMarkers.length === 0) return;
    
    currentMarkerIndex--;
    if (currentMarkerIndex < 0) {
        currentMarkerIndex = visibleMarkers.length - 1;
    }
    
    navigateToMarker(currentMarkerIndex);
}

function navigateToNextMarker() {
    if (visibleMarkers.length === 0) return;
    
    currentMarkerIndex++;
    if (currentMarkerIndex >= visibleMarkers.length) {
        currentMarkerIndex = 0;
    }
    
    navigateToMarker(currentMarkerIndex);
}

function navigateToMarker(index) {
    if (index < 0 || index >= visibleMarkers.length) return;
    
    const marker = visibleMarkers[index];
    
    // Center map on marker (using mapCore)
    if (window.mapCore && window.mapCore.getMap) {
        const mapInstance = window.mapCore.getMap();
        if (mapInstance) {
            mapInstance.setView([marker.lat, marker.lng], mapInstance.getZoom());
        }
    }
    
    // Show marker details
    handleMarkerClick(marker);
    
    // Update navigation buttons
    updateNavigationButtons();
}

/**
 * Update navigation button states (placeholder)
 */
function updateNavigationButtons() {
    // This will be implemented when integrating with UI controls
    logger.log(`Marker navigation: ${currentMarkerIndex + 1} / ${visibleMarkers.length}`);
}

/**
 * Focus on a specific marker by ID and type
 */
function focusOnMarker(markerId, markerType) {
    const allMarkers = [...allStaticMarkers, ...allWorkflowInstances];
    const marker = allMarkers.find(m => 
        String(m.id) === String(markerId) && 
        String(m.type) === String(markerType)
    );
    
    if (!marker) {
        logger.warn(`Marker not found: ${markerType} #${markerId}`);
        return false;
    }
    
    // Center map on marker
    if (marker.lat && marker.lng && window.mapCore && window.mapCore.getMap) {
        const mapInstance = window.mapCore.getMap();
        if (mapInstance) {
            mapInstance.setView([marker.lat, marker.lng], 14);
            
            // Find this marker's index in visibleMarkers
            currentMarkerIndex = visibleMarkers.findIndex(m => 
                String(m.id) === String(markerId) && 
                String(m.type) === String(markerType)
            );
            
            // Update navigation and highlight
            updateNavigationButtons();
            highlightMarkerOnMap(marker);
            
            return true;
        }
    }
    
    return false;
}

/**
 * Highlight a marker on the map with pulsing effect
 */
function highlightMarkerOnMap(marker) {
    if (!markerLayer) return;
    
    const mapMarkers = markerLayer.getLayers();
    
    for (let i = 0; i < mapMarkers.length; i++) {
        const mapMarker = mapMarkers[i];
        
        if (mapMarker.markerData && 
            String(mapMarker.markerData.id) === String(marker.id) && 
            String(mapMarker.markerData.type) === String(marker.type)) {
            
            // Add pulsing effect
            mapMarker.setOpacity(0.5);
            
            let pulseCount = 0;
            const pulseInterval = setInterval(() => {
                if (pulseCount % 2 === 0) {
                    mapMarker.setOpacity(1);
                } else {
                    mapMarker.setOpacity(0.5);
                }
                
                pulseCount++;
                
                if (pulseCount > 5) {
                    clearInterval(pulseInterval);
                    mapMarker.setOpacity(1);
                }
            }, 300);
            
            break;
        }
    }
}

/**
 * Create SVG marker icon with custom styling
 */
function createSVGMarkerIcon(iconConfig) {
    const style = iconConfig.style || {};
    const size = style.size || 32;
    const color = style.color || '#333333';
    const backgroundColor = style.backgroundColor || '#ffffff';
    const borderColor = style.borderColor || '#dddddd';
    const borderWidth = style.borderWidth || 2;
    const shape = style.shape || 'circle';
    const shadow = style.shadow || false;
    
    // Apply styles to SVG
    let svgContent = iconConfig.svgContent;
    if (svgContent) {
        // Update SVG styling
        const svgSize = Math.round(size * 0.6);
        svgContent = svgContent.replace(/(<svg[^>]*)(>)/, `$1 style="width: ${svgSize}px; height: ${svgSize}px; fill: ${color};"$2`);
    }
    
    // Create container with background
    let containerStyle = `
        width: ${size}px;
        height: ${size}px;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
    `;
    
    // Add background and shape
    if (shape !== 'none') {
        containerStyle += `
            background-color: ${backgroundColor};
            border: ${borderWidth}px solid ${borderColor};
        `;
        
        switch (shape) {
            case 'circle':
                containerStyle += 'border-radius: 50%;';
                break;
            case 'rounded':
                containerStyle += 'border-radius: 8px;';
                break;
            case 'square':
                containerStyle += 'border-radius: 0;';
                break;
        }
    }
    
    // Add shadow
    if (shadow) {
        containerStyle += 'box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);';
    }
    
    return `
        <div style="${containerStyle}">
            ${svgContent || '<div style="width: 12px; height: 12px; background: ' + color + '; border-radius: 50%;"></div>'}
        </div>
    `;
}

/**
 * Icon creation helper functions (legacy fallbacks)
 */
function createCircleIcon(color) {
    return `<div style="background-color: ${color}; width: 18px; height: 18px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>`;
}

function createSquareIcon(color) {
    return `<div style="background-color: ${color}; width: 16px; height: 16px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>`;
}

function createDiamondIcon(color) {
    return `<div style="width: 16px; height: 16px; 
            background-color: ${color};
            border: 2px solid white;
            transform: rotate(45deg);
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>`;
}

function createTriangleIcon(color) {
    return `<div style="width: 0; height: 0; 
            border-left: 10px solid transparent; 
            border-right: 10px solid transparent; 
            border-bottom: 18px solid ${color}; 
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));"></div>`;
}

/**
 * Get all visible markers
 */
function getVisibleMarkers() {
    return visibleMarkers;
}

/**
 * Get marker by ID and type
 */
function getMarker(markerId, markerType) {
    const allMarkers = [...allStaticMarkers, ...allWorkflowInstances];
    return allMarkers.find(m => 
        String(m.id) === String(markerId) && 
        String(m.type) === String(markerType)
    );
}

/**
 * Check if a marker should be draggable based on user permissions
 * NOTE: Currently disabled - location updates are handled through UI button
 */
/* async function shouldMarkerBeDraggable(marker) {
    // Only workflow instances can be draggable
    if (marker.type !== 'workflow_instance') {
        return false;
    }
    
    // Check if the workflow has location update permissions
    if (!marker.workflow) {
        return false;
    }
    
    const locationUpdateRoles = marker.workflow.location_update_roles;
    if (!locationUpdateRoles || !Array.isArray(locationUpdateRoles) || locationUpdateRoles.length === 0) {
        return false;
    }
    
    // Get participant roles
    const participantRoleIds = await getParticipantRoles();
    if (!participantRoleIds || participantRoleIds.length === 0) {
        return false;
    }
    
    // Check if participant has any of the required roles
    const hasPermission = locationUpdateRoles.some(roleId => 
        participantRoleIds.includes(roleId)
    );
    
    logger.log('Location update permission check:', {
        markerId: marker.id,
        markerTitle: marker.title,
        locationUpdateRoles: locationUpdateRoles,
        participantRoles: participantRoleIds,
        hasPermission: hasPermission
    });
    
    return hasPermission;
} */

/**
 * Handle marker drag end event
 * NOTE: Currently disabled - location updates are handled through UI button
 */
/* async function handleMarkerDragEnd(marker, newLatLng) {
    try {
        logger.log('Marker drag ended:', {
            markerId: marker.id,
            markerTitle: marker.title,
            oldPosition: { lat: marker.lat, lng: marker.lng },
            newPosition: { lat: newLatLng.lat, lng: newLatLng.lng }
        });
        
        // Update the location in the database with audit trail
        const client = await getSupabaseClient();
        try {
            await client.updateWithAudit(
                'workflow_instances',
                marker.id,
                {
                    location: `POINT(${newLatLng.lng} ${newLatLng.lat})`
                },
                {
                    activityType: 'location_update',
                    activitySummary: 'Updated location'
                }
            );
        } catch (error) {
            logger.error('Failed to update marker location:', error);
            // Show error notification if available
            if (window.app && window.app.showNotification) {
                window.app.showNotification('error', 'Fehler', 'Standort konnte nicht aktualisiert werden: ' + error.message);
            }
            return;
        }
        
        // Update the marker data locally
        marker.lat = newLatLng.lat;
        marker.lng = newLatLng.lng;
        
        // Update in the workflow instances array
        const instanceIndex = allWorkflowInstances.findIndex(instance => instance.id === marker.id);
        if (instanceIndex !== -1) {
            allWorkflowInstances[instanceIndex].lat = newLatLng.lat;
            allWorkflowInstances[instanceIndex].lng = newLatLng.lng;
        }
        
        logger.log('Marker location updated successfully');
        
        // Show success notification if available
        if (window.app && window.app.showNotification) {
            window.app.showNotification('success', 'Standort aktualisiert', `Standort für "${marker.title}" wurde erfolgreich aktualisiert.`);
        }
        
    } catch (error) {
        logger.error('Error updating marker location:', error);
        if (window.app && window.app.showNotification) {
            window.app.showNotification('error', 'Fehler', 'Unerwarteter Fehler beim Aktualisieren des Standorts.');
        }
    }
} */

// Export functions
export default {
    initializeMarkerSystem,
    loadMarkers,
    displayMarkers,
    applyFilters,
    navigateToPreviousMarker,
    navigateToNextMarker,
    focusOnMarker,
    highlightMarkerOnMap,
    getVisibleMarkers,
    getMarker
};

// Make some functions globally available for UI integration
window.loadMarkers = loadMarkers;
window.focusOnMarker = focusOnMarker;
window.navigateToPreviousMarker = navigateToPreviousMarker;
window.navigateToNextMarker = navigateToNextMarker;