/**
 * Map Core System - Participant Application
 * Adapted from legacy map-core.js for Supabase integration
 */

import eventManager from '../core/event-manager.js';
import { supabaseClient } from '../core/supabase.js';
import { workflowEngine } from '../workflow/workflow-engine.js';
import tileService from '../services/tile-service.js';
import participantAuth from '../auth/participant-auth.js';
import DebugLogger from '../core/debug-logger.js';

// Map instance and state
let map;
let currentClickLatLng = null;
let tempMarker = null;
let markerToSourceLine = null;
let longPressTimer = null;
let isDragging = false;
let workflowMode = false;
let selectedWorkflowId = null;

// Layer groups
let baseLayers = {};
let overlayLayers = {};
let markerLayer = null;
let layerControl = null;

// Configuration
let mapConfig = null;

// Debug logger
const logger = new DebugLogger('MapCore');

/**
 * Initialize map with database configuration
 */
async function initializeMap(containerId = 'map') {
    try {
        // Load map configuration from database
        mapConfig = await loadMapConfiguration();
        
        if (!mapConfig) {
            throw new Error('Failed to load map configuration');
        }
        
        // Create the map instance
        map = L.map(containerId).setView(
            [mapConfig.default_center.lat, mapConfig.default_center.lng], 
            mapConfig.default_zoom
        );
        
        // Initialize layer groups
        baseLayers = {};
        overlayLayers = {};
        
        // Add base tile layer
        baseLayers["Standard"] = L.tileLayer(mapConfig.tile_url, {
            maxZoom: mapConfig.max_zoom || 19,
            minZoom: mapConfig.min_zoom || 1,
            attribution: mapConfig.attribution || ''
        }).addTo(map);
        
        // Initialize marker layer group
        markerLayer = L.layerGroup().addTo(map);
        overlayLayers["Markers"] = markerLayer;
        
        // Add configured overlay layers
        await setupOverlayLayers();
        
        // Initialize and setup role-based tile layers
        await setupTileService();
        
        // Setup event handlers
        setupMapEventHandlers();
        setupUIEventHandlers();
        
        logger.log('Map initialized successfully');
        
        // Return cleanup function
        return function cleanup() {
            // Remove all event handlers
            eventManager.removeByComponent('map-core');
            eventManager.removeByComponent('map-events');
            eventManager.removeByComponent('map-ui');
            
            // Remove tile service event listeners
            window.removeEventListener('tileservice:refreshed', handleTileServiceRefresh);
            window.removeEventListener('authStateChanged', handleAuthStateChange);
            
            // Clean up map instance
            if (map) {
                map.remove();
                map = null;
            }
            
            // Reset layer references
            baseLayers = {};
            overlayLayers = {};
            markerLayer = null;
            layerControl = null;
        };
        
    } catch (error) {
        logger.error('Failed to initialize map:', error);
        throw error;
    }
}

/**
 * Load map configuration from Supabase
 */
async function loadMapConfiguration() {
    try {
        // Try regular client first, fall back to service client
        let data = null;
        let error = null;
        
        // Try to find active map settings, preferring default if available
        const { data: mapData1, error: error1 } = await supabaseClient.client
            .from('map_settings')
            .select('*')
            .eq('is_active', true)
            .order('is_default', { ascending: false })
            .limit(1);
        
        if (!error1 && mapData1 && mapData1.length > 0) {
            data = mapData1[0];
        } else if (supabaseClient.serviceClient) {
            const { data: mapData2, error: error2 } = await supabaseClient.serviceClient
                .from('map_settings')
                .select('*')
                .eq('is_active', true)
                .order('is_default', { ascending: false })
                .limit(1);
            
            if (!error2 && mapData2 && mapData2.length > 0) {
                data = mapData2[0];
            } else {
                error = error2 || error1;
            }
        } else {
            error = error1;
        }
            
        if (error || !data) {
            logger.warn('No map configuration found, using defaults:', error || 'No data returned');
            return getDefaultMapConfiguration();
        }
        
        // Parse geometry for default center
        if (data.default_center) {
            if (typeof data.default_center === 'string') {
                // Handle PostGIS point format: POINT(lng lat)
                const match = data.default_center.match(/POINT\(([^)]+)\)/);
                if (match) {
                    const [lng, lat] = match[1].split(' ').map(Number);
                    data.default_center = { lat, lng };
                }
            } else if (data.default_center.coordinates) {
                // Handle GeoJSON format
                const [lng, lat] = data.default_center.coordinates;
                data.default_center = { lat, lng };
            }
        }
        
        // Validate and provide defaults for required fields
        const config = {
            tile_url: data.tile_url || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            attribution: data.attribution || '© OpenStreetMap contributors',
            max_zoom: data.max_zoom || 19,
            min_zoom: data.min_zoom || 1,
            default_center: data.default_center || { lat: 52.5, lng: 13.4 }, // Berlin default
            default_zoom: data.default_zoom || 10,
            layer_config: data.layer_config || {}
        };
        
        return config;
        
    } catch (error) {
        logger.error('Failed to load map configuration:', error);
        return getDefaultMapConfiguration();
    }
}

/**
 * Get default map configuration
 */
function getDefaultMapConfiguration() {
    return {
        tile_url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '© OpenStreetMap contributors',
        max_zoom: 19,
        min_zoom: 1,
        default_center: { lat: 52.5, lng: 13.4 }, // Berlin default
        default_zoom: 10,
        layer_config: {}
    };
}

/**
 * Setup overlay layers from configuration
 */
async function setupOverlayLayers() {
    if (!mapConfig.layer_config) return;
    
    const layerConfig = typeof mapConfig.layer_config === 'string' 
        ? JSON.parse(mapConfig.layer_config) 
        : mapConfig.layer_config;
    
    // Add WMS layers if configured
    if (layerConfig.wms_layers && Array.isArray(layerConfig.wms_layers)) {
        layerConfig.wms_layers.forEach((wmsLayer, index) => {
            const layerName = wmsLayer.name || `WMS Layer ${index + 1}`;
            const isVisible = wmsLayer.visible === true;
            
            const leafletWmsLayer = L.tileLayer.wms(wmsLayer.url, {
                layers: wmsLayer.layers,
                format: wmsLayer.format || 'image/png',
                transparent: true,
                version: wmsLayer.version || '1.1.1',
                attribution: wmsLayer.attribution || ''
            });
            
            overlayLayers[layerName] = leafletWmsLayer;
            
            if (isVisible) {
                leafletWmsLayer.addTo(map);
            }
        });
    }
    
    // Add tile overlay layers if configured
    if (layerConfig.tile_layers && Array.isArray(layerConfig.tile_layers)) {
        layerConfig.tile_layers.forEach((tileLayer, index) => {
            const layerName = tileLayer.name || `Tile Layer ${index + 1}`;
            const isVisible = tileLayer.visible === true;
            
            const leafletTileLayer = L.tileLayer(tileLayer.url, {
                maxZoom: tileLayer.max_zoom || 19,
                attribution: tileLayer.attribution || '',
                opacity: tileLayer.opacity ? parseFloat(tileLayer.opacity) : 1.0
            });
            
            overlayLayers[layerName] = leafletTileLayer;
            
            if (isVisible) {
                leafletTileLayer.addTo(map);
            }
        });
    }
}

/**
 * Setup role-based tile service
 */
async function setupTileService() {
    try {
        logger.log('Setting up tile service...');
        
        // Only initialize if user is authenticated
        if (!participantAuth.isAuthenticated()) {
            logger.log('User not authenticated, skipping tile service initialization');
            return;
        }
        
        // Initialize tile service
        await tileService.initialize();
        
        // Add tile layers to overlays
        const tileLayers = tileService.getTileLayersForControl();
        Object.assign(overlayLayers, tileLayers);
        
        logger.log('Added role-based tile layers:', Object.keys(tileLayers));
        
        // Setup layer control if we have layers
        setupLayerControl();
        
        // Listen for tile service refresh events
        window.addEventListener('tileservice:refreshed', handleTileServiceRefresh);
        
        // Listen for authentication state changes to refresh tiles
        window.addEventListener('authStateChanged', handleAuthStateChange);
        
        logger.log('Tile service setup completed');
        
    } catch (error) {
        logger.warn('Failed to setup tile service:', error);
        // Continue without tile service - this is not critical for basic map functionality
    }
}

/**
 * Setup layer control for base and overlay layers
 */
function setupLayerControl() {
    try {
        // Remove existing layer control
        if (layerControl) {
            map.removeControl(layerControl);
        }
        
        // Layer control removed - using custom menu instead
        // const hasOverlays = Object.keys(overlayLayers).length > 1; // More than just markers
        // const hasMultipleBases = Object.keys(baseLayers).length > 1;
        // 
        // if (hasOverlays || hasMultipleBases) {
        //     layerControl = L.control.layers(baseLayers, overlayLayers, {
        //         position: 'topright',
        //         collapsed: true
        //     }).addTo(map);
        //     
        //     logger.log('Layer control added with', Object.keys(overlayLayers).length, 'overlays');
        // }
        
    } catch (error) {
        logger.warn('Failed to setup layer control:', error);
    }
}

/**
 * Handle tile service refresh event
 */
function handleTileServiceRefresh(event) {
    logger.log('Tile service refreshed, updating map layers');
    
    try {
        // Remove existing tile layers from overlay layers (keep markers and configured layers)
        const tileSetsToRemove = [];
        Object.keys(overlayLayers).forEach(layerName => {
            // Identify tile set layers (they're not "Markers" and not from config)
            if (layerName !== 'Markers' && !isConfiguredLayer(layerName)) {
                tileSetsToRemove.push(layerName);
            }
        });
        
        // Remove tile set layers
        tileSetsToRemove.forEach(layerName => {
            if (map.hasLayer(overlayLayers[layerName])) {
                map.removeLayer(overlayLayers[layerName]);
            }
            delete overlayLayers[layerName];
        });
        
        // Add new tile layers
        const tileLayers = tileService.getTileLayersForControl();
        Object.assign(overlayLayers, tileLayers);
        
        // Update layer control
        setupLayerControl();
        
        logger.log('Map layers updated with refreshed tile service');
        
    } catch (error) {
        logger.error('Error handling tile service refresh:', error);
    }
}

/**
 * Handle authentication state changes
 */
async function handleAuthStateChange(event) {
    if (event.detail.isAuthenticated) {
        logger.log('User authenticated, refreshing tile service');
        try {
            await setupTileService();
        } catch (error) {
            logger.warn('Failed to refresh tile service on auth change:', error);
        }
    } else {
        logger.log('User logged out, clearing tile layers');
        // Remove tile service layers but keep basic layers
        handleTileServiceRefresh({ detail: { tileSets: [] } });
    }
}

/**
 * Check if a layer is from configuration (not from tile service)
 */
function isConfiguredLayer(layerName) {
    if (!mapConfig.layer_config) return false;
    
    const layerConfig = typeof mapConfig.layer_config === 'string' 
        ? JSON.parse(mapConfig.layer_config) 
        : mapConfig.layer_config;
    
    // Check if it's a configured WMS layer
    if (layerConfig.wms_layers && Array.isArray(layerConfig.wms_layers)) {
        const hasWmsLayer = layerConfig.wms_layers.some(wmsLayer => 
            (wmsLayer.name || '').includes(layerName)
        );
        if (hasWmsLayer) return true;
    }
    
    // Check if it's a configured tile layer
    if (layerConfig.tile_layers && Array.isArray(layerConfig.tile_layers)) {
        const hasTileLayer = layerConfig.tile_layers.some(tileLayer => 
            (tileLayer.name || '').includes(layerName)
        );
        if (hasTileLayer) return true;
    }
    
    return false;
}

/**
 * Setup map event handlers using EventManager
 */
function setupMapEventHandlers() {
    // Clear any existing map event handlers
    eventManager.removeByComponent('map-events');

    // Handle map click for workflow initiation
    eventManager.add(map, 'click', function(e) {
        // Check if tools are blocking interactions
        if (window.ToolsManager && window.ToolsManager.isBlockingInteractions()) {
            return;
        }
        
        // Close FAB options menu if open
        const fabOptions = document.getElementById('fabOptions');
        if (fabOptions && fabOptions.style.display === 'flex') {
            fabOptions.style.display = 'none';
            return;
        }
        
        if (workflowMode && selectedWorkflowId) {
            // In workflow mode, move the marker to the clicked position
            if (tempMarker) {
                tempMarker.setLatLng(e.latlng);
                currentClickLatLng = e.latlng;
                updateConnectionLine();
            }
        }
    }, {
        component: 'map-events',
        description: 'Handle map click for workflow initiation'
    });

    // Long press detection for workflow initiation
    eventManager.add(map, 'mousedown', function(e) {
        if (!workflowMode) {
            longPressTimer = setTimeout(function() {
                if (!isDragging) {
                    // Close FAB options if open
                    const fabOptions = document.getElementById('fabOptions');
                    if (fabOptions) {
                        fabOptions.style.display = 'none';
                    }
                    
                    // Show workflow selection if available
                    showWorkflowSelection(e.latlng);
                }
            }, 2000); // 2 seconds for long press
        }
    }, {
        component: 'map-events',
        description: 'Start long press detection for workflow initiation'
    });

    // Cancel long press on mouseup
    eventManager.add(map, 'mouseup', function() {
        clearTimeout(longPressTimer);
    }, {
        component: 'map-events',
        description: 'Cancel long press on mouseup'
    });

    // Cancel long press on mousemove
    eventManager.add(map, 'mousemove', function() {
        isDragging = true;
        clearTimeout(longPressTimer);
    }, {
        component: 'map-events',
        description: 'Cancel long press on mousemove'
    });

    // Reset drag state
    eventManager.add(map, 'mouseout', function() {
        isDragging = false;
        clearTimeout(longPressTimer);
    }, {
        component: 'map-events',
        description: 'Reset drag state on mouseout'
    });

    // Handle location found event
    eventManager.add(map, 'locationfound', function(e) {
        // Create a marker for the user's location
        const userLocationMarker = L.marker(e.latlng, {
            icon: L.divIcon({
                className: 'user-location-marker',
                html: '<div style="background-color: #2196F3; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 0 2px #2196F3;"></div>',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            })
        }).addTo(map);
        
        // Add accuracy circle if available
        const accuracyCircle = L.circle(e.latlng, {
            radius: e.accuracy / 2,
            color: '#2196F3',
            fillColor: '#2196F380',
            weight: 1
        }).addTo(map);
        
        // Pan and zoom map to location
        map.setView(e.latlng, 16);
        
        // Remove after 30 seconds
        setTimeout(() => {
            map.removeLayer(userLocationMarker);
            map.removeLayer(accuracyCircle);
        }, 30000);
    }, {
        component: 'map-events',
        description: 'Handle successful geolocation'
    });
    
    // Handle location error
    eventManager.add(map, 'locationerror', function(e) {
        logger.error('Location error:', e.message);
        alert('Could not determine your location. Please check your location settings.');
    }, {
        component: 'map-events',
        description: 'Handle geolocation error'
    });
    
    // Add handlers for map movement to update dynamic elements
    eventManager.add(map, 'zoom', updateConnectionLine, {
        component: 'map-events',
        description: 'Update connection line on zoom'
    });
    
    eventManager.add(map, 'move', updateConnectionLine, {
        component: 'map-events',
        description: 'Update connection line on move'
    });
    
    eventManager.add(map, 'resize', updateConnectionLine, {
        component: 'map-events',
        description: 'Update connection line on resize'
    });
}

/**
 * Setup UI event handlers
 */
function setupUIEventHandlers() {
    // Clear existing UI handlers
    eventManager.removeByComponent('map-ui');
    
    // Setup geolocation button
    const geoLocationBtn = document.getElementById('geoLocationButton');
    if (geoLocationBtn) {
        eventManager.add(geoLocationBtn, 'click', function() {
            centerMapToUserLocation();
        }, {
            component: 'map-ui',
            description: 'Geolocation button handler'
        });
    }
}

/**
 * Show workflow selection menu (placeholder for FAB integration)
 */
function showWorkflowSelection(latlng) {
    // This will be integrated with the FAB menu system
    // For now, just log the position
    logger.log('Workflow selection at:', latlng);
    currentClickLatLng = latlng;
}

/**
 * Prepare workflow at location (called from FAB menu)
 */
function prepareWorkflow(workflowId, workflowType) {
    // Close FAB options if open
    const fabOptions = document.getElementById('fabOptions');
    if (fabOptions) {
        fabOptions.style.display = 'none';
    }
    
    selectedWorkflowId = workflowId;
    
    if (workflowType === 'incident') {
        // Enter workflow mode for incident (map-based) workflows
        workflowMode = true;
        
        // Remove previous temporary marker and connection line
        if (tempMarker) {
            map.removeLayer(tempMarker);
        }
        if (markerToSourceLine) {
            map.removeLayer(markerToSourceLine);
        }
        
        // Get the map center
        const mapCenter = map.getCenter();
        currentClickLatLng = mapCenter;
        
        // Add temporary marker at map center
        tempMarker = L.marker(mapCenter, {
            icon: L.divIcon({
                className: 'temp-marker',
                html: '<div style="background-color: rgba(220, 53, 69, 0.9); width: 15px; height: 15px; border-radius: 50%; border: 2px solid white;"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            }),
            draggable: true
        }).addTo(map);

        // Add event to update marker position when dragged
        tempMarker.on('dragend', function(e) {
            currentClickLatLng = tempMarker.getLatLng();
            updateConnectionLine();
        });
        
        // Show workflow action button
        showWorkflowActionButton();
        
        // Hide the FAB while showing workflow button
        const fab = document.querySelector('.fab');
        if (fab) {
            fab.style.display = 'none';
        }
        
        // Draw connection line
        updateConnectionLine();
    } else {
        // For survey workflows, start immediately without map interaction
        startWorkflowInstance(workflowId, null);
    }
}

/**
 * Show workflow action button
 */
function showWorkflowActionButton() {
    // Get or create the workflow action button
    let actionBtn = document.getElementById('workflowActionButton');
    
    if (!actionBtn) {
        // Create the workflow action button
        actionBtn = document.createElement('div');
        actionBtn.id = 'workflowActionButton';
        actionBtn.className = 'workflow-action-button';
        actionBtn.innerHTML = `
            <div class="workflow-action-content">
                <i class="fas fa-check"></i>
                <span>Start Here</span>
            </div>
        `;
        
        // Add to map container
        const mapContainer = document.getElementById('map');
        if (mapContainer) {
            mapContainer.appendChild(actionBtn);
        }
        
        // Add click handler
        eventManager.add(actionBtn, 'click', async function() {
            if (selectedWorkflowId && currentClickLatLng) {
                try {
                    await startWorkflowInstance(selectedWorkflowId, currentClickLatLng);
                } catch (error) {
                    logger.error('Failed to start workflow from button:', error);
                }
            }
        }, {
            component: 'map-ui',
            description: 'Workflow action button click handler'
        });
        
        // Add cancel button
        const cancelBtn = document.createElement('div');
        cancelBtn.id = 'workflowCancelButton';
        cancelBtn.className = 'workflow-cancel-button';
        cancelBtn.innerHTML = '<i class="fas fa-times"></i>';
        mapContainer.appendChild(cancelBtn);
        
        // Add cancel handler
        eventManager.add(cancelBtn, 'click', function() {
            closeWorkflowElements();
        }, {
            component: 'map-ui',
            description: 'Workflow cancel button click handler'
        });
    }
    
    // Show the button
    actionBtn.style.display = 'flex';
    
    // Show cancel button too
    const cancelBtn = document.getElementById('workflowCancelButton');
    if (cancelBtn) {
        cancelBtn.style.display = 'flex';
    }
    
    logger.log('Workflow action button shown');
}

/**
 * Start workflow instance
 */
async function startWorkflowInstance(workflowId, location) {
    try {
        logger.log('Starting workflow instance:', workflowId, location);
        
        // Prepare options for workflow creation
        const options = {};
        
        // Add location for incident workflows
        if (location) {
            // Convert Leaflet LatLng to PostGIS format
            options.location = `POINT(${location.lng} ${location.lat})`;
        }
        
        // Create the workflow instance using the workflow engine
        const instance = await workflowEngine.createWorkflowInstance(workflowId, options);
        
        logger.log('Created workflow instance:', instance.id);
        
        // Emit event for other components to react
        window.dispatchEvent(new CustomEvent('workflow-instance:created', {
            detail: {
                instanceId: instance.id,
                workflowId: workflowId,
                location: location,
                instance: instance
            }
        }));
        
        // Reset workflow mode
        closeWorkflowElements();
        
        return instance;
        
    } catch (error) {
        logger.error('Failed to start workflow instance:', error);
        alert(`Failed to start workflow: ${error.message}`);
        
        // Reset workflow mode even on error
        closeWorkflowElements();
        
        throw error;
    }
}

/**
 * Update connection line between marker and action button
 */
function updateConnectionLine() {
    if (tempMarker && document.getElementById('workflowActionButton')?.style.display === 'flex') {
        // Get the marker position
        const markerLatLng = tempMarker.getLatLng();
        
        // Get the button position in pixels
        const actionBtn = document.getElementById('workflowActionButton');
        const buttonRect = actionBtn.getBoundingClientRect();
        
        // Calculate center point of the button
        const buttonCenterX = buttonRect.left + (buttonRect.width / 2);
        const buttonCenterY = buttonRect.top + (buttonRect.height / 2);
        
        // Convert button center to container point
        const buttonPoint = L.point(
            buttonCenterX + window.scrollX - map.getContainer().getBoundingClientRect().left,
            buttonCenterY + window.scrollY - map.getContainer().getBoundingClientRect().top
        );
        
        // Convert to lat/lng
        const buttonLatLng = map.containerPointToLatLng(buttonPoint);
        
        // Remove existing line
        if (markerToSourceLine) {
            map.removeLayer(markerToSourceLine);
        }
        
        // Create new line
        markerToSourceLine = L.polyline([
            buttonLatLng,
            markerLatLng
        ], {
            color: '#dc3545',
            weight: 2,
            opacity: 0.7,
            dashArray: '5, 5'
        }).addTo(map);
    }
}

/**
 * Close workflow interaction elements
 */
function closeWorkflowElements() {
    // Reset workflow mode
    workflowMode = false;
    selectedWorkflowId = null;
    
    // Hide workflow action button
    const actionBtn = document.getElementById('workflowActionButton');
    if (actionBtn) {
        actionBtn.style.display = 'none';
    }
    
    // Hide workflow cancel button
    const cancelBtn = document.getElementById('workflowCancelButton');
    if (cancelBtn) {
        cancelBtn.style.display = 'none';
    }
    
    // Show the FAB again
    const fab = document.querySelector('.fab');
    if (fab) {
        fab.style.display = 'flex';
    }
    
    // Remove temporary marker
    if (tempMarker) {
        map.removeLayer(tempMarker);
        tempMarker = null;
    }
    
    // Remove the connector line
    if (markerToSourceLine) {
        map.removeLayer(markerToSourceLine);
        markerToSourceLine = null;
    }
    
    currentClickLatLng = null;
}

/**
 * Center map to user's location
 */
function centerMapToUserLocation() {
    if (!map) return;
    
    map.locate({
        setView: false,
        maxZoom: 18,
        enableHighAccuracy: true
    });
}

/**
 * Toggle layer visibility
 */
function toggleLayer(layerName, visible) {
    if (!map || !overlayLayers || !layerName) return;
    
    const layer = overlayLayers[layerName];
    if (!layer) return;
    
    if (visible) {
        if (!map.hasLayer(layer)) {
            layer.addTo(map);
        }
    } else {
        if (map.hasLayer(layer)) {
            map.removeLayer(layer);
        }
    }
}

/**
 * Get map instance
 */
function getMap() {
    return map;
}

/**
 * Get marker layer
 */
function getMarkerLayer() {
    return markerLayer;
}

/**
 * Get current workflow position (for workflow initiation)
 */
function getCurrentWorkflowPosition() {
    return currentClickLatLng;
}

/**
 * Refresh tile service (public API)
 */
async function refreshTileService() {
    try {
        if (tileService.initialized) {
            await tileService.refresh();
        } else {
            await setupTileService();
        }
    } catch (error) {
        logger.error('Failed to refresh tile service:', error);
        throw error;
    }
}

/**
 * Get tile service status
 */
function getTileServiceStatus() {
    return tileService.getStatus();
}

/**
 * Get available tile sets for current user
 */
function getAvailableTileSets() {
    return tileService.getTileSets();
}

// Export functions
export default {
    initializeMap,
    centerMapToUserLocation,
    toggleLayer,
    prepareWorkflow,
    closeWorkflowElements,
    startWorkflowInstance,
    getMap,
    getMarkerLayer,
    getCurrentWorkflowPosition,
    refreshTileService,
    getTileServiceStatus,
    getAvailableTileSets
};

// Also make some functions globally available for UI integration
window.centerMapToUserLocation = centerMapToUserLocation;
window.toggleLayer = toggleLayer;
window.prepareWorkflow = prepareWorkflow;
window.closeWorkflowElements = closeWorkflowElements;
window.startWorkflowInstance = startWorkflowInstance;
window.refreshTileService = refreshTileService;
window.getTileServiceStatus = getTileServiceStatus;