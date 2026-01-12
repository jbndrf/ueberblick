/**
 * Mobile Controls - Enhanced version from BDHI adapted for Dynamic App
 * Handles mobile control bar, FAB menu, and responsive interactions
 */

import eventManager from '../core/event-manager.js';
import DebugLogger from '../core/debug-logger.js';

// Debug logger
const logger = new DebugLogger('MobileControls');

// Mobile Controls State
let isInitialized = false;
let fabOptionsVisible = false;
let currentReportMode = null; // 'damage' or 'building'

/**
 * Initialize mobile controls functionality
 */
function initializeMobileControls() {
    if (isInitialized) {
        logger.log('Already initialized');
        return;
    }
    
    logger.log('Initializing enhanced mobile controls...');
    
    // Setup mobile control event handlers
    setupMobileEventHandlers();
    
    // Setup FAB menu handlers
    setupFABHandlers();
    
    // Adjust map size for mobile
    adjustMapSizeForMobile();
    
    // Handle window resize
    setupResizeHandler();
    
    // Initialize CSS variables for animations
    initializeCSSVariables();
    
    isInitialized = true;
    logger.log('Enhanced mobile controls initialized');
}

/**
 * Initialize CSS variables for GPU-accelerated animations
 */
function initializeCSSVariables() {
    const root = document.documentElement;
    root.style.setProperty('--z-index-mobile-bar', '1000');
    root.style.setProperty('--z-index-mobile-fab', '1001');
    root.style.setProperty('--z-index-mobile-fab-options', '1002');
    root.style.setProperty('--z-index-mobile-panels', '999');
    root.style.setProperty('--mobile-controls-offset-y', '0px');
    root.style.setProperty('--mobile-controls-opacity', '1');
    root.style.setProperty('--fab-offset-y', '0px');
    root.style.setProperty('--fab-opacity', '1');
}

/**
 * Setup mobile control event handlers
 */
function setupMobileEventHandlers() {
    // Clear existing mobile control handlers
    eventManager.removeByComponent('mobile-controls');
    
    // Mobile geolocation button
    const mobileGeoButton = document.getElementById('mobileGeoLocationButton');
    if (mobileGeoButton) {
        eventManager.add(mobileGeoButton, 'click', function() {
            if (typeof centerMapToUserLocation === 'function') {
                centerMapToUserLocation();
            } else {
                logger.warn('centerMapToUserLocation function not available');
            }
        }, {
            component: 'mobile-controls',
            description: 'Mobile geolocation button handler'
        });
    }
    
    // Other mobile control buttons will use onclick handlers as defined in HTML
}

/**
 * Setup FAB menu event handlers
 * Note: FAB menu is now handled by the dynamic fab-menu.js component
 */
function setupFABHandlers() {
    // FAB menu is now handled by the fab-menu.js component
    // This function is kept for compatibility but does nothing
    logger.log('FAB handlers setup (now handled by fab-menu.js component)');
}

/**
 * Legacy FAB functions - now handled by fab-menu.js component
 * These are kept for compatibility but delegate to the dynamic FAB menu
 */
function toggleFABOptions() {
    // Legacy function - FAB is now handled by fab-menu.js
    logger.log('Legacy toggleFABOptions called - now handled by fab-menu.js');
}

function showFABOptions() {
    // Legacy function - FAB is now handled by fab-menu.js
    logger.log('Legacy showFABOptions called - now handled by fab-menu.js');
}

function hideFABOptions() {
    // Legacy function - FAB is now handled by fab-menu.js
    logger.log('Legacy hideFABOptions called - now handled by fab-menu.js');
}

function showDamageReportMode() {
    // Legacy function - FAB is now handled by fab-menu.js
    logger.log('Legacy showDamageReportMode called - now handled by fab-menu.js');
}

function showBuildingMarkerMode() {
    // Legacy function - FAB is now handled by fab-menu.js
    logger.log('Legacy showBuildingMarkerMode called - now handled by fab-menu.js');
}

function exitReportMode() {
    // Legacy function - FAB is now handled by fab-menu.js
    logger.log('Legacy exitReportMode called - now handled by fab-menu.js');
}

/**
 * Adjust map size when mobile controls are visible
 */
function adjustMapSizeForMobile() {
    if (window.innerWidth <= 768) {
        const mapElement = document.getElementById('map');
        if (mapElement) {
            // Only adjust height if map is visible and has content
            if (mapElement.offsetHeight > 0) {
                // Give map a bottom margin to account for control bar (60px)
                mapElement.style.height = 'calc(100vh - 60px)';
            } else {
                // If map is not visible yet, set full height first
                mapElement.style.height = '100vh';
            }
        }
    }
}

/**
 * Setup window resize handler
 */
function setupResizeHandler() {
    eventManager.add(window, 'resize', function() {
        const mapElement = document.getElementById('map');
        if (mapElement) {
            if (window.innerWidth <= 768) {
                mapElement.style.height = 'calc(100vh - 60px)';
            } else {
                mapElement.style.height = '100vh';
            }
        }
        
        // Update mobile controls visibility
        updateMobileControlsVisibility();
    }, {
        component: 'mobile-controls',
        description: 'Window resize handler for mobile controls'
    });
}

/**
 * Global functions for onclick handlers (backward compatibility)
 */
window.toggleFilters = function() {
    logger.log('Toggle filters');
    const filtersMenu = document.getElementById('filtersMenu');
    
    if (!filtersMenu) {
        // Create filters menu if it doesn't exist
        createFiltersMenu();
        return;
    }
    
    // Toggle visibility
    if (filtersMenu.style.display === 'none' || !filtersMenu.style.display) {
        showFiltersMenu();
    } else {
        hideFiltersMenu();
    }
};

window.toggleLegend = function() {
    logger.log('Toggle legend');
    const legendMenu = document.getElementById('legendMenu');
    
    if (!legendMenu) {
        // Create legend menu if it doesn't exist
        createLegendMenu();
        return;
    }
    
    // Toggle visibility
    if (legendMenu.style.display === 'none' || !legendMenu.style.display) {
        showLegendMenu();
    } else {
        hideLegendMenu();
    }
};

window.toggleTools = function() {
    logger.log('Toggle tools');
    const toolsMenu = document.getElementById('toolsMenu');
    
    if (!toolsMenu) {
        // Create tools menu if it doesn't exist
        createToolsMenu();
        return;
    }
    
    // Toggle visibility
    if (toolsMenu.style.display === 'none' || !toolsMenu.style.display) {
        showToolsMenu();
    } else {
        hideToolsMenu();
    }
};

window.centerMapToUserLocation = function() {
    logger.log('Center map to user location');
    // This function should be implemented by the map core
    if (window.mapCore && typeof window.mapCore.centerToUserLocation === 'function') {
        window.mapCore.centerToUserLocation();
    } else {
        logger.warn('Map core centerToUserLocation not available');
    }
};

/**
 * Create tools menu
 */
function createToolsMenu() {
    const toolsMenu = document.createElement('div');
    toolsMenu.id = 'toolsMenu';
    toolsMenu.className = 'tools-menu';
    toolsMenu.style.display = 'none';
    
    // Get current role information
    const authStatus = window.participantAuth?.getAuthStatus();
    const currentRole = authStatus?.roles?.[0]?.name || 'No Role';
    
    toolsMenu.innerHTML = `
        <div class="tools-menu-header">
            <h3>Tools & Settings</h3>
            <button class="tools-close-btn" onclick="hideToolsMenu()">×</button>
        </div>
        <div class="tools-menu-content">
            <div class="tools-section">
                <div class="role-indicator">
                    <i class="fas fa-user-tag"></i>
                    <span>Role: ${currentRole}</span>
                </div>
            </div>
            <div class="tools-section">
                <button class="tools-menu-item" onclick="handleLogout()">
                    <i class="fas fa-sign-out-alt"></i>
                    Logout
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(toolsMenu);
    
    // Add event listeners
    setupToolsMenuEventHandlers(toolsMenu);
    
    // Show the menu
    showToolsMenu();
}

/**
 * Show tools menu
 */
function showToolsMenu() {
    const toolsMenu = document.getElementById('toolsMenu');
    if (toolsMenu) {
        toolsMenu.style.display = 'block';
        // Add active class to tools button if it exists
        const toolsButton = document.querySelector('.map-control-button[onclick*="toggleTools"]');
        if (toolsButton) {
            toolsButton.classList.add('active');
        }
    }
}

/**
 * Hide tools menu
 */
function hideToolsMenu() {
    const toolsMenu = document.getElementById('toolsMenu');
    if (toolsMenu) {
        toolsMenu.style.display = 'none';
        // Remove active class from tools button
        const toolsButton = document.querySelector('.map-control-button[onclick*="toggleTools"]');
        if (toolsButton) {
            toolsButton.classList.remove('active');
        }
    }
}

/**
 * Setup tools menu event handlers
 */
function setupToolsMenuEventHandlers(toolsMenu) {
    // Close menu when clicking outside
    eventManager.add(document, 'click', function(event) {
        if (!toolsMenu.contains(event.target) && !event.target.closest('.map-control-button[onclick*="toggleTools"]')) {
            hideToolsMenu();
        }
    }, {
        component: 'mobile-controls',
        description: 'Tools menu outside click handler'
    });
}

/**
 * Update role indicator in tools menu
 */
function updateRoleIndicator() {
    const roleIndicator = document.querySelector('.tools-menu .role-indicator span');
    if (roleIndicator) {
        const authStatus = window.participantAuth?.getAuthStatus();
        const currentRole = authStatus?.roles?.[0]?.name || 'No Role';
        roleIndicator.textContent = `Role: ${currentRole}`;
    }
}

// Make functions available globally
window.hideToolsMenu = hideToolsMenu;
window.handleLogout = function() {
    // Call the main app's logout handler
    if (window.app && typeof window.app.handleLogout === 'function') {
        window.app.handleLogout();
    } else {
        // Fallback - redirect to logout
        window.location.href = 'login.html';
    }
};
window.updateRoleIndicator = updateRoleIndicator;

/**
 * Create filters menu using the same pattern as tools menu
 */
function createFiltersMenu() {
    const filtersMenu = document.createElement('div');
    filtersMenu.id = 'filtersMenu';
    filtersMenu.className = 'filters-menu';
    filtersMenu.style.display = 'none';
    
    filtersMenu.innerHTML = `
        <div class="filters-menu-header">
            <h3>Map Filters</h3>
            <button class="filters-close-btn" onclick="hideFiltersMenu()">×</button>
        </div>
        <div class="filters-menu-content">
            <div class="filters-section">
                <h4>Map Layers</h4>
                <p>Tile layer controls will be loaded dynamically</p>
            </div>
            <div class="filters-section">
                <h4>Marker Categories</h4>
                <p>Marker filters will be loaded dynamically</p>
            </div>
        </div>
    `;
    
    document.body.appendChild(filtersMenu);
    
    // Add event listeners
    setupFiltersMenuEventHandlers(filtersMenu);
    
    // Show the menu
    showFiltersMenu();
}

/**
 * Show filters menu
 */
function showFiltersMenu() {
    const filtersMenu = document.getElementById('filtersMenu');
    if (filtersMenu) {
        filtersMenu.style.display = 'block';
        // Add active class to filters button if it exists
        const filtersButton = document.querySelector('.map-control-button[onclick*="toggleFilters"]');
        if (filtersButton) {
            filtersButton.classList.add('active');
        }
    }
}

/**
 * Hide filters menu
 */
function hideFiltersMenu() {
    const filtersMenu = document.getElementById('filtersMenu');
    if (filtersMenu) {
        filtersMenu.style.display = 'none';
        // Remove active class from filters button
        const filtersButton = document.querySelector('.map-control-button[onclick*="toggleFilters"]');
        if (filtersButton) {
            filtersButton.classList.remove('active');
        }
    }
}

/**
 * Setup filters menu event handlers
 */
function setupFiltersMenuEventHandlers(filtersMenu) {
    // Close menu when clicking outside
    eventManager.add(document, 'click', function(event) {
        if (!filtersMenu.contains(event.target) && !event.target.closest('.map-control-button[onclick*="toggleFilters"]')) {
            hideFiltersMenu();
        }
    }, {
        component: 'mobile-controls',
        description: 'Filters menu outside click handler'
    });
}


/**
 * Create legend menu using the same pattern as tools menu
 */
function createLegendMenu() {
    const legendMenu = document.createElement('div');
    legendMenu.id = 'legendMenu';
    legendMenu.className = 'legend-menu';
    legendMenu.style.display = 'none';
    
    legendMenu.innerHTML = `
        <div class="legend-menu-header">
            <h3>Map Legend</h3>
            <button class="legend-close-btn" onclick="hideLegendMenu()">×</button>
        </div>
        <div class="legend-menu-content">
            <div class="legend-content">
                <p>Legend will be loaded dynamically</p>
            </div>
        </div>
    `;
    
    document.body.appendChild(legendMenu);
    
    // Add event listeners
    setupLegendMenuEventHandlers(legendMenu);
    
    // Show the menu
    showLegendMenu();
}

/**
 * Show legend menu
 */
function showLegendMenu() {
    const legendMenu = document.getElementById('legendMenu');
    if (legendMenu) {
        legendMenu.style.display = 'block';
        // Add active class to legend button if it exists
        const legendButton = document.querySelector('.map-control-button[onclick*="toggleLegend"]');
        if (legendButton) {
            legendButton.classList.add('active');
        }
    }
}

/**
 * Hide legend menu
 */
function hideLegendMenu() {
    const legendMenu = document.getElementById('legendMenu');
    if (legendMenu) {
        legendMenu.style.display = 'none';
        // Remove active class from legend button
        const legendButton = document.querySelector('.map-control-button[onclick*="toggleLegend"]');
        if (legendButton) {
            legendButton.classList.remove('active');
        }
    }
}

/**
 * Setup legend menu event handlers
 */
function setupLegendMenuEventHandlers(legendMenu) {
    // Close menu when clicking outside
    eventManager.add(document, 'click', function(event) {
        if (!legendMenu.contains(event.target) && !event.target.closest('.map-control-button[onclick*="toggleLegend"]')) {
            hideLegendMenu();
        }
    }, {
        component: 'mobile-controls',
        description: 'Legend menu outside click handler'
    });
}


// Make functions available globally
window.hideFiltersMenu = hideFiltersMenu;
window.hideLegendMenu = hideLegendMenu;

/**
 * Check if device is in mobile mode
 */
function isMobileMode() {
    return window.innerWidth <= 768;
}

/**
 * Show/hide mobile controls based on viewport
 */
function updateMobileControlsVisibility() {
    const mobileControls = document.querySelector('.mobile-controls');
    const mapControls = document.querySelector('.map-controls');
    
    if (isMobileMode()) {
        if (mobileControls) mobileControls.style.display = 'flex';
        if (mapControls) mapControls.style.display = 'none';
    } else {
        if (mobileControls) mobileControls.style.display = 'none';
        if (mapControls) mapControls.style.display = 'flex';
    }
}

/**
 * Update mobile control button states
 */
function updateMobileControlStates(states) {
    // Update button states based on application state
    // states can include: { filtersActive: boolean, legendActive: boolean, toolsActive: boolean }
    
    const filterButton = document.querySelector('.mobile-controls button[title="Filter"]');
    const legendButton = document.querySelector('.mobile-controls .legend-toggle-button');
    
    if (filterButton) {
        if (states.filtersActive) {
            filterButton.classList.add('active');
        } else {
            filterButton.classList.remove('active');
        }
    }
    
    if (legendButton) {
        if (states.legendActive) {
            legendButton.classList.add('active');
        } else {
            legendButton.classList.remove('active');
        }
    }
}

/**
 * Get current report mode (legacy - FAB now handled by fab-menu.js)
 */
function getCurrentReportMode() {
    // Check if fab-menu is in coordinate selection mode
    if (window.fabMenu && window.fabMenu.coordinateSelectionMode) {
        return 'coordinate-selection';
    }
    return null;
}

/**
 * Check if FAB options are visible (legacy - FAB now handled by fab-menu.js)
 */
function areFABOptionsVisible() {
    // Check if fab-menu is open
    if (window.fabMenu) {
        return window.fabMenu.isOpen;
    }
    return false;
}

/**
 * Cleanup mobile controls
 */
function cleanup() {
    eventManager.removeByComponent('mobile-controls');
    isInitialized = false;
    fabOptionsVisible = false;
    currentReportMode = null;
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Wait for map to be fully loaded before initializing mobile controls
    const waitForMap = () => {
        const mapElement = document.getElementById('map');
        if (mapElement && (mapElement.offsetHeight > 0 || window.mapCore)) {
            setTimeout(initializeMobileControls, 100);
        } else {
            setTimeout(waitForMap, 200);
        }
    };
    waitForMap();
});

// Export functions
export default {
    initializeMobileControls,
    updateMobileControlStates,
    updateMobileControlsVisibility,
    getCurrentReportMode,
    areFABOptionsVisible,
    isMobileMode,
    showToolsMenu,
    hideToolsMenu,
    updateRoleIndicator,
    cleanup
};

// Also make available globally for compatibility
window.MobileControls = {
    init: initializeMobileControls,
    updateStates: updateMobileControlStates,
    getCurrentReportMode,
    cleanup
};