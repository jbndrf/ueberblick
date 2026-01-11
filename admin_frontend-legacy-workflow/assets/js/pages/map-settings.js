/**
 * Map Settings Page Component
 * Comprehensive map configuration with accordion-based element management
 */

import { supabaseClient } from '../core/supabase.js';
import Utils from '../core/utils.js';
import app from '../core/app.js';
import MapConfigImporter from '../components/map-config-importer.js';
import DebugLogger from '../core/debug-logger.js';
import { i18n, i18nDOM } from '../core/i18n.js';

const logger = new DebugLogger('MapSettingsPage');

let currentMapPreview = null;
let currentEditingId = null;
let mapElements = [];
let mapConfigImporter = null;

// Predefined presets for quick setup
const MAP_PRESETS = {
    baseLayers: {
        openstreetmap: {
            name: 'OpenStreetMap',
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            attribution: '© OpenStreetMap contributors'
        },
        openstreetmap_de: {
            name: 'OpenStreetMap Germany',
            url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
            attribution: '© OpenStreetMap contributors'
        },
        cartodb_light: {
            name: 'CartoDB Light',
            url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
            attribution: '© OpenStreetMap © CartoDB'
        },
        cartodb_dark: {
            name: 'CartoDB Dark',
            url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png',
            attribution: '© OpenStreetMap © CartoDB'
        },
        esri_satellite: {
            name: 'ESRI Satellite',
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            attribution: '© Esri'
        }
    },
    overlays: {
        osm_cycling: {
            name: 'Cycling Routes',
            url: 'https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png',
            attribution: '© waymarkedtrails.org'
        },
        osm_hiking: {
            name: 'Hiking Trails',
            url: 'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png',
            attribution: '© waymarkedtrails.org'
        }
    }
};

export default async function MapSettingsPage(route, context = {}) {
    // Add logging to debug context reception
    logger.log('MapSettingsPage: Received context:', {
        routePath: route?.path,
        contextProjectId: context.projectId,
        supabaseCurrentProject: supabaseClient.getCurrentProjectId(),
        fullContext: context
    });

    const projectId = context.projectId;

    // Ensure supabase client has the correct project context
    if (projectId && supabaseClient.getCurrentProjectId() !== projectId) {
        logger.log('MapSettingsPage: Setting project context in supabaseClient:', projectId);
        supabaseClient.setCurrentProject(projectId);
    }

    // Load map settings data
    const data = await loadMapSettingsData(projectId);
    
    // Initialize the page functionality after rendering
    setTimeout(initializeMapSettingsPage, 50);
    
    // Translate page elements
    setTimeout(() => i18nDOM.translateDataAttributes(), 100);
    
    return `
        <div class="map-settings-page">
            
            <!-- Page Header -->
            <div class="page-header">
                <div>
                    <h1 class="page-title" data-i18n="map_settings.title">Map Settings</h1>
                    <p class="page-subtitle">
                        Build comprehensive map configurations with multiple layers, overlays, and controls.
                    </p>
                </div>
                <div class="page-actions">
                    <button class="btn btn-secondary" onclick="location.reload()">
                        Refresh
                    </button>
                    <button class="btn btn-outline" id="export-all-btn">
                        <span data-i18n="actions.export">Export</span> All
                    </button>
                    <button class="btn btn-outline" id="import-config-btn">
                        <span data-i18n="actions.import">Import</span> Configuration
                    </button>
                    <button class="btn btn-primary" id="add-default-map-btn">
                        Add Default Map
                    </button>
                    <button class="btn btn-outline" id="add-map-config-btn">
                        <span data-i18n="map_settings.add_layer">Add</span> Map Configuration
                    </button>
                </div>
            </div>

            <!-- Project Context -->
            ${renderProjectContext(data.currentProject)}

            <!-- Existing Map Configurations -->
            ${renderExistingConfigurations(data.mapConfigurations)}

            <!-- Import Accordion -->
            <div class="card" id="import-accordion" style="display: none;">
                <div class="card-header">
                    <h3 class="card-title"><span data-i18n="actions.import">Import</span> Map Configuration</h3>
                    <div class="card-actions">
                        <button class="btn btn-primary" id="import-json-btn" data-i18n="actions.import">Import</button>
                        <button class="btn btn-text" id="cancel-import-btn" data-i18n="actions.cancel">Cancel</button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="import-section">
                        <div class="form-group">
                            <label class="form-label">Paste JSON Configuration</label>
                            <textarea 
                                class="form-textarea" 
                                id="json-import-textarea" 
                                rows="15" 
                                placeholder="Paste your map configuration JSON here...&#10;&#10;Example:&#10;{&#10;  &quot;name&quot;: &quot;My Map Config&quot;,&#10;  &quot;max_zoom&quot;: 18,&#10;  &quot;min_zoom&quot;: 1,&#10;  &quot;default_zoom&quot;: 10,&#10;  &quot;layer_config&quot;: {&#10;    &quot;elements&quot;: [...]&#10;  }&#10;}"></textarea>
                            <div class="form-help">
                                Paste a complete map configuration JSON or use one of the templates below.
                            </div>
                        </div>
                        
                        <div class="templates-section">
                            <label class="form-label">Quick Templates</label>
                            <div class="template-buttons">
                                <button type="button" class="btn btn-sm btn-outline" onclick="loadImportTemplate('basic-osm')">
                                    Germany OpenStreetMap
                                </button>
                                <button type="button" class="btn btn-sm btn-outline" onclick="loadImportTemplate('satellite-hybrid')">
                                    Satellite + Streets
                                </button>
                                <button type="button" class="btn btn-sm btn-outline" onclick="loadImportTemplate('multi-layer')">
                                    Multi-Layer
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Configuration Form -->
            <div class="card" id="map-config-form" style="display: none;">
                <div class="card-header">
                    <h3 class="card-title" id="config-form-title">Add Map Configuration</h3>
                    <div class="card-actions">
                        <button class="btn btn-primary" id="save-config-btn" data-i18n="actions.save">Save Configuration</button>
                        <button class="btn btn-text" id="cancel-config-btn" data-i18n="actions.cancel">Cancel</button>
                    </div>
                </div>
                <div class="card-body">
                    ${renderMapConfigurationForm()}
                </div>
            </div>

            <!-- Live Preview -->
            <div class="card" id="map-preview-card" style="display: none;">
                <div class="card-header">
                    <h3 class="card-title">Live Preview</h3>
                    <p class="card-subtitle">Preview your complete map configuration</p>
                    <div class="preview-controls">
                        <button class="btn btn-sm btn-outline" id="reset-preview-view">Reset View</button>
                        <button class="btn btn-sm btn-outline" id="toggle-layer-control">Layer Control</button>
                        <button class="btn btn-sm btn-outline" id="preview-fullscreen">Fullscreen</button>
                    </div>
                </div>
                <div class="card-body">
                    <div id="map-preview" style="height: 500px; border-radius: var(--border-radius-md);"></div>
                </div>
            </div>

        </div>

        <style>
            .map-config-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: var(--spacing-md);
                border: 1px solid var(--color-border-light);
                border-radius: var(--border-radius-md);
                margin-bottom: var(--spacing-sm);
                transition: all var(--transition-fast);
            }
            
            .map-config-item:hover {
                border-color: var(--color-primary);
                background: var(--color-bg-secondary);
            }
            
            .map-config-item.active {
                border-color: var(--color-primary);
                background: var(--color-primary-bg);
            }
            
            .map-config-info h4 {
                margin: 0 0 var(--spacing-xs) 0;
                color: var(--color-text-primary);
            }
            
            .map-config-details {
                font-size: var(--font-size-sm);
                color: var(--color-text-secondary);
                margin: 0;
            }
            
            .map-config-actions {
                display: flex;
                gap: var(--spacing-sm);
            }
            
            .config-badge {
                display: inline-block;
                padding: var(--spacing-xs) var(--spacing-sm);
                background: var(--color-success-bg);
                color: var(--color-success);
                border-radius: var(--border-radius-sm);
                font-size: var(--font-size-xs);
                font-weight: var(--font-weight-medium);
                margin-left: var(--spacing-sm);
            }
            
            .form-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: var(--spacing-lg);
            }
            
            .form-section {
                margin-bottom: var(--spacing-lg);
            }
            
            .form-section-title {
                font-size: var(--font-size-lg);
                font-weight: var(--font-weight-semibold);
                color: var(--color-text-primary);
                margin-bottom: var(--spacing-md);
                padding-bottom: var(--spacing-sm);
                border-bottom: 1px solid var(--color-border-light);
            }
            
            .coordinate-input-group {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: var(--spacing-md);
            }
            
            /* Accordion-based Element Management */
            .elements-container {
                border: 1px solid var(--color-border-light);
                border-radius: var(--border-radius-md);
                margin-top: var(--spacing-md);
                overflow: hidden;
            }
            
            .elements-header {
                background: var(--color-bg-secondary);
                padding: var(--spacing-md);
                border-bottom: 1px solid var(--color-border-light);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .add-element-dropdown {
                position: relative;
                display: inline-block;
            }
            
            .dropdown-content {
                display: none;
                position: fixed;
                background-color: white;
                min-width: 200px;
                max-width: 300px;
                max-height: 300px;
                overflow-y: auto;
                box-shadow: 0 8px 32px rgba(0,0,0,0.2);
                border: 1px solid var(--color-border-light);
                border-radius: var(--border-radius-md);
                z-index: 10000;
            }
            
            .dropdown-content.show {
                display: block;
            }
            
            .dropdown-item {
                padding: var(--spacing-sm) var(--spacing-md);
                cursor: pointer;
                border-bottom: 1px solid var(--color-border-light);
                transition: background-color var(--transition-fast);
            }
            
            .dropdown-item:last-child {
                border-bottom: none;
            }
            
            .dropdown-item:hover {
                background-color: var(--color-bg-secondary);
            }
            
            .dropdown-item-title {
                font-weight: var(--font-weight-medium);
                color: var(--color-text-primary);
                margin-bottom: var(--spacing-xs);
            }
            
            .dropdown-item-desc {
                font-size: var(--font-size-sm);
                color: var(--color-text-secondary);
            }
            
            .elements-list {
                max-height: 500px;
                overflow-y: auto;
            }
            
            .element-accordion {
                border-bottom: 1px solid var(--color-border-light);
            }
            
            .element-accordion:last-child {
                border-bottom: none;
            }
            
            .accordion-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: var(--spacing-md);
                cursor: pointer;
                background: white;
                transition: all var(--transition-fast);
            }
            
            .accordion-header:hover {
                background: var(--color-bg-secondary);
            }
            
            .accordion-header.expanded {
                background: var(--color-primary-bg);
                border-bottom: 1px solid var(--color-border-light);
            }
            
            .element-header-info {
                display: flex;
                align-items: center;
                gap: var(--spacing-md);
            }
            
            .element-type-badge {
                padding: var(--spacing-xs) var(--spacing-sm);
                border-radius: var(--border-radius-sm);
                font-size: var(--font-size-xs);
                font-weight: var(--font-weight-medium);
            }
            
            .element-type-base {
                background: var(--color-primary-bg);
                color: var(--color-primary);
            }
            
            .element-type-overlay {
                background: var(--color-warning-bg);
                color: var(--color-warning);
            }
            
            .element-type-wms {
                background: var(--color-info-bg);
                color: var(--color-info);
            }
            
            .element-type-geojson {
                background: var(--color-success-bg);
                color: var(--color-success);
            }
            
            .element-type-control {
                background: var(--color-secondary-bg);
                color: var(--color-secondary);
            }
            
            .element-name {
                font-weight: var(--font-weight-medium);
                color: var(--color-text-primary);
            }
            
            .element-summary {
                font-size: var(--font-size-sm);
                color: var(--color-text-secondary);
            }
            
            .accordion-controls {
                display: flex;
                gap: var(--spacing-sm);
                align-items: center;
            }
            
            .accordion-content {
                display: none;
                padding: var(--spacing-lg);
                background: var(--color-bg-secondary);
                border-top: 1px solid var(--color-border-light);
            }
            
            .accordion-content.expanded {
                display: block;
            }
            
            .drag-handle {
                cursor: grab;
                padding: var(--spacing-xs);
                color: var(--color-text-tertiary);
                margin-right: var(--spacing-sm);
            }
            
            .drag-handle:hover {
                color: var(--color-text-secondary);
            }
            
            .preset-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: var(--spacing-sm);
                margin-top: var(--spacing-md);
            }
            
            .preset-item {
                padding: var(--spacing-sm);
                border: 1px solid var(--color-border-light);
                border-radius: var(--border-radius-sm);
                cursor: pointer;
                transition: all var(--transition-fast);
                text-align: center;
            }
            
            .preset-item:hover {
                border-color: var(--color-primary);
                background: var(--color-primary-bg);
            }
            
            .preset-name {
                font-weight: var(--font-weight-medium);
                margin-bottom: var(--spacing-xs);
            }
            
            .preset-desc {
                font-size: var(--font-size-sm);
                color: var(--color-text-secondary);
            }
            
            .preview-controls {
                display: flex;
                gap: var(--spacing-sm);
            }
            
            .empty-elements {
                padding: var(--spacing-xl);
                text-align: center;
                color: var(--color-text-tertiary);
            }
            
            .empty-state {
                text-align: center;
                padding: var(--spacing-xl);
                color: var(--color-text-tertiary);
            }
            
            .project-context {
                background: var(--color-bg-secondary);
                padding: var(--spacing-md);
                border-radius: var(--border-radius-md);
                margin-bottom: var(--spacing-lg);
                border-left: 4px solid var(--color-primary);
            }
            
            .project-context-title {
                font-size: var(--font-size-sm);
                font-weight: var(--font-weight-semibold);
                color: var(--color-text-primary);
                margin-bottom: var(--spacing-xs);
            }
            
            .project-context-subtitle {
                font-size: var(--font-size-xs);
                color: var(--color-text-secondary);
                margin: 0;
            }

            .import-section {
                margin-bottom: var(--spacing-lg);
            }

            .form-textarea {
                width: 100%;
                min-height: 300px;
                padding: var(--spacing-md);
                border: 1px solid var(--color-border-light);
                border-radius: var(--border-radius-md);
                font-family: var(--font-family-mono);
                font-size: var(--font-size-sm);
                line-height: var(--line-height-normal);
                resize: vertical;
                background: var(--color-bg-primary);
                color: var(--color-text-primary);
            }

            .form-textarea:focus {
                outline: none;
                border-color: var(--color-primary);
                box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
            }

            .templates-section {
                margin-top: var(--spacing-lg);
                padding-top: var(--spacing-lg);
                border-top: 1px solid var(--color-border-light);
            }

            .template-buttons {
                display: flex;
                gap: var(--spacing-sm);
                flex-wrap: wrap;
                margin-top: var(--spacing-sm);
            }
            
            .element-config-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: var(--spacing-md);
            }
            
            .test-result {
                padding: var(--spacing-xs) var(--spacing-sm);
                border-radius: var(--border-radius-sm);
                font-size: var(--font-size-sm);
                font-weight: var(--font-weight-medium);
                margin-top: var(--spacing-sm);
            }
            
            .test-result.success {
                background: var(--color-success-bg);
                color: var(--color-success);
            }
            
            .test-result.error {
                background: var(--color-error-bg);
                color: var(--color-error);
            }
            
            .test-result.loading {
                background: var(--color-info-bg);
                color: var(--color-info);
            }
        </style>
    `;
}

// Load map settings data
async function loadMapSettingsData(projectId = null) {
    const data = {
        mapConfigurations: [],
        currentProject: null,
        connectionStatus: { status: 'unknown' }
    };

    try {
        // Check connection
        data.connectionStatus = await supabaseClient.healthCheck();
        
        if (data.connectionStatus.status === 'ok') {
            // Get current project based on projectId or find one
            if (projectId) {
                data.currentProject = await supabaseClient.getProjectById(projectId);
            } else {
                data.currentProject = await getCurrentProject();
            }
            
            if (data.currentProject) {
                // Load map configurations for this project
                data.mapConfigurations = await loadMapConfigurations(data.currentProject.id);
            }
        }
        
    } catch (error) {
        logger.error('Map settings data loading error:', error);
        data.connectionStatus = { status: 'error', error: error.message };
    }

    return data;
}

async function getCurrentProject() {
    try {
        const currentProjectId = supabaseClient.getCurrentProjectId();
        if (currentProjectId) {
            return await supabaseClient.getProjectById(currentProjectId);
        }
        
        // Fallback to first available project
        const projects = await supabaseClient.getUserProjects();
        return projects?.[0] || null;
    } catch (error) {
        logger.warn('Failed to load current project:', error);
        return null;
    }
}

async function loadMapConfigurations(projectId) {
    try {
        // Get configs with coordinates as separate lat/lng values
        const { data: configs, error } = await supabaseClient._client
            .from('map_settings')
            .select('*, ST_X(default_center) as default_lng, ST_Y(default_center) as default_lat')
            .eq('project_id', projectId);
            
        if (error) throw error;
        
        return configs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } catch (error) {
        logger.warn('Failed to load map configurations:', error);
        return [];
    }
}

function renderProjectContext(project) {
    if (!project) {
        return `
            <div class="project-context">
                <div class="project-context-title">No Project Selected</div>
                <div class="project-context-subtitle">Select a project to manage map settings</div>
            </div>
        `;
    }

    return `
        <div class="project-context">
            <div class="project-context-title">Configuring maps for: ${project.name}</div>
            <div class="project-context-subtitle">Build comprehensive map configurations with multiple elements</div>
        </div>
    `;
}

function renderExistingConfigurations(configurations) {
    if (configurations.length === 0) {
        return `
            <div class="card">
                <div class="card-body">
                    <div class="empty-state">
                        <div style="font-size: 2rem; margin-bottom: var(--spacing-md);">🗺️</div>
                        <h4>No Map Configurations</h4>
                        <p>Create your first comprehensive map configuration with multiple elements.</p>
                    </div>
                </div>
            </div>
        `;
    }

    return `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Map Configurations</h3>
                <p class="card-subtitle">Manage your project's comprehensive map settings</p>
            </div>
            <div class="card-body">
                ${configurations.map(config => {
                    const elements = config.layer_config?.elements || [];
                    const elementTypes = [...new Set(elements.map(e => e.type))];
                    
                    return `
                        <div class="map-config-item ${config.is_active ? 'active' : ''}" data-config-id="${config.id}">
                            <div class="map-config-info">
                                <h4>
                                    ${config.name}
                                    ${config.is_default ? '<span class="config-badge">Default</span>' : ''}
                                    ${config.is_active ? '<span class="config-badge">Active</span>' : ''}
                                </h4>
                                <div class="map-config-details">
                                    ${elements.length} elements (${elementTypes.join(', ')}) | 
                                    Zoom: ${config.min_zoom || 1}-${config.max_zoom || 18} | 
                                    Center: ${formatCoordinatesFromLatLng(config.default_lat, config.default_lng)}
                                </div>
                            </div>
                            <div class="map-config-actions">
                                <button class="btn btn-sm btn-outline" onclick="exportMapConfig('${config.id}')" data-i18n="actions.export">Export</button>
                                <button class="btn btn-sm btn-outline" onclick="previewMapConfig('${config.id}')">Preview</button>
                                <button class="btn btn-sm btn-outline" onclick="editMapConfig('${config.id}')">Edit</button>
                                <button class="btn btn-sm btn-outline" onclick="duplicateMapConfig('${config.id}')">Duplicate</button>
                                <button class="btn btn-sm btn-outline" onclick="toggleMapConfigActive('${config.id}', ${!config.is_active})">${config.is_active ? 'Deactivate' : 'Activate'}</button>
                                <button class="btn btn-sm btn-danger" onclick="deleteMapConfig('${config.id}')" data-i18n="actions.delete">Delete</button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function renderMapConfigurationForm() {
    return `
        <form id="map-config-form-element">
            <div class="form-grid">
                <!-- Basic Settings -->
                <div class="form-section">
                    <div class="form-section-title">Basic Settings</div>
                    
                    <div class="form-group">
                        <label class="form-label">Configuration Name *</label>
                        <input type="text" class="form-input" id="config-name" placeholder="e.g., Street Map with Overlays" required>
                    </div>
                    
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: var(--spacing-sm); cursor: pointer;">
                            <input type="checkbox" class="form-checkbox" id="is-default">
                            <span>Set as default configuration</span>
                        </label>
                    </div>
                    
                    <div class="form-group">
                        <label style="display: flex; align-items: center; gap: var(--spacing-sm); cursor: pointer;">
                            <input type="checkbox" class="form-checkbox" id="is-active" checked>
                            <span>Activate this configuration</span>
                        </label>
                    </div>
                </div>

                <!-- Map View Settings -->
                <div class="form-section">
                    <div class="form-section-title">Default View</div>
                    
                    <div class="coordinate-input-group">
                        <div class="form-group">
                            <label class="form-label">Default Latitude</label>
                            <input type="number" class="form-input" id="default-lat" step="0.000001" value="51.1657">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Default Longitude</label>
                            <input type="number" class="form-input" id="default-lng" step="0.000001" value="10.4515">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Default Zoom Level</label>
                        <input type="range" class="form-range" id="default-zoom" min="1" max="20" value="10">
                        <div style="text-align: center; margin-top: var(--spacing-xs); font-size: var(--font-size-sm);">
                            Zoom: <span id="zoom-display">10</span>
                        </div>
                    </div>
                    
                    <div class="coordinate-input-group">
                        <div class="form-group">
                            <label class="form-label">Minimum Zoom</label>
                            <input type="number" class="form-input" id="min-zoom" min="1" max="20" value="1">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Maximum Zoom</label>
                            <input type="number" class="form-input" id="max-zoom" min="1" max="20" value="18">
                        </div>
                    </div>
                </div>
            </div>

            <!-- Map Elements Management -->
            <div class="form-section">
                <div class="form-section-title">Map Elements</div>
                <div class="elements-container">
                    <div class="elements-header">
                        <span>Configure map elements (layers, overlays, controls)</span>
                        <div class="add-element-dropdown">
                            <button type="button" class="btn btn-sm btn-primary" id="add-element-btn">Add Element ▼</button>
                            <div class="dropdown-content" id="element-dropdown">
                                <div class="dropdown-item" data-element-type="base-layer">
                                    <div class="dropdown-item-title">Base Layer</div>
                                    <div class="dropdown-item-desc">Main map tiles (OSM, satellite, etc.)</div>
                                </div>
                                <div class="dropdown-item" data-element-type="overlay-layer">
                                    <div class="dropdown-item-title">Overlay Layer</div>
                                    <div class="dropdown-item-desc">Additional tile overlay</div>
                                </div>
                                <div class="dropdown-item" data-element-type="wms-layer">
                                    <div class="dropdown-item-title">WMS Layer</div>
                                    <div class="dropdown-item-desc">Web Map Service layer</div>
                                </div>
                                <div class="dropdown-item" data-element-type="geojson-layer">
                                    <div class="dropdown-item-title">GeoJSON Layer</div>
                                    <div class="dropdown-item-desc">Vector data from GeoJSON</div>
                                </div>
                                <div class="dropdown-item" data-element-type="marker-cluster">
                                    <div class="dropdown-item-title">Marker Cluster</div>
                                    <div class="dropdown-item-desc">Clustered point markers</div>
                                </div>
                                <div class="dropdown-item" data-element-type="layer-control">
                                    <div class="dropdown-item-title">Layer Control</div>
                                    <div class="dropdown-item-desc">Layer toggle widget</div>
                                </div>
                                <div class="dropdown-item" data-element-type="scale-control">
                                    <div class="dropdown-item-title">Scale Control</div>
                                    <div class="dropdown-item-desc">Map scale indicator</div>
                                </div>
                                <div class="dropdown-item" data-element-type="zoom-control">
                                    <div class="dropdown-item-title">Zoom Control</div>
                                    <div class="dropdown-item-desc">Zoom in/out buttons</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="elements-list" id="elements-list">
                        <div class="empty-elements">
                            <div style="font-size: 1.5rem; margin-bottom: var(--spacing-sm);">🧩</div>
                            <p>No elements configured. Add your first map element to get started.</p>
                        </div>
                    </div>
                </div>
            </div>
        </form>
    `;
}

function formatCoordinates(geometry) {
    if (!geometry) return 'Not set';
    
    if (typeof geometry === 'string') {
        const coords = geometry.match(/POINT\(([^)]+)\)/);
        if (coords) {
            const [lng, lat] = coords[1].split(' ');
            return `${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}`;
        }
    }
    
    return 'Invalid coordinates';
}

function formatCoordinatesFromLatLng(lat, lng) {
    if (!lat || !lng) return 'Not set';
    return `${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}`;
}

// Initialize map settings page functionality
function initializeMapSettingsPage() {
    mapElements = [];
    setTimeout(() => {
        setupMapSettingsHandlers();
    }, 100);
}

function setupMapSettingsHandlers() {
    // Add configuration button
    const addConfigBtn = Utils.DOM.find('#add-map-config-btn');
    if (addConfigBtn) {
        Utils.DOM.on(addConfigBtn, 'click', showAddConfigForm);
    }

    // Add default map button
    const addDefaultMapBtn = Utils.DOM.find('#add-default-map-btn');
    if (addDefaultMapBtn) {
        Utils.DOM.on(addDefaultMapBtn, 'click', createDefaultMapConfiguration);
    }

    // Export all configurations button
    const exportAllBtn = Utils.DOM.find('#export-all-btn');
    if (exportAllBtn) {
        Utils.DOM.on(exportAllBtn, 'click', exportAllMapConfigs);
    }

    // Import configuration button
    const importConfigBtn = Utils.DOM.find('#import-config-btn');
    if (importConfigBtn) {
        Utils.DOM.on(importConfigBtn, 'click', showImportAccordion);
    }

    // Import JSON button
    const importJsonBtn = Utils.DOM.find('#import-json-btn');
    if (importJsonBtn) {
        Utils.DOM.on(importJsonBtn, 'click', handleJsonImport);
    }

    // Cancel import button
    const cancelImportBtn = Utils.DOM.find('#cancel-import-btn');
    if (cancelImportBtn) {
        Utils.DOM.on(cancelImportBtn, 'click', hideImportAccordion);
    }

    // Cancel configuration button
    const cancelBtn = Utils.DOM.find('#cancel-config-btn');
    if (cancelBtn) {
        Utils.DOM.on(cancelBtn, 'click', hideConfigForm);
    }

    // Save configuration button
    const saveBtn = Utils.DOM.find('#save-config-btn');
    if (saveBtn) {
        Utils.DOM.on(saveBtn, 'click', saveMapConfiguration);
    }

    // Add element dropdown
    const addElementBtn = Utils.DOM.find('#add-element-btn');
    const elementDropdown = Utils.DOM.find('#element-dropdown');
    
    if (addElementBtn && elementDropdown) {
        Utils.DOM.on(addElementBtn, 'click', (e) => {
            e.stopPropagation();
            
            if (elementDropdown.classList.contains('show')) {
                elementDropdown.classList.remove('show');
            } else {
                // Calculate position relative to the button
                const rect = addElementBtn.getBoundingClientRect();
                const dropdownWidth = 200;
                const dropdownHeight = 300; // max-height from CSS
                
                // Calculate optimal position
                let top = rect.bottom + 5;
                let left = rect.right - dropdownWidth;
                
                // Adjust if dropdown would go off screen
                if (left < 10) {
                    left = rect.left; // Align to left edge instead
                }
                if (left + dropdownWidth > window.innerWidth - 10) {
                    left = window.innerWidth - dropdownWidth - 10;
                }
                if (top + dropdownHeight > window.innerHeight - 10) {
                    top = rect.top - dropdownHeight - 5; // Show above button
                }
                
                elementDropdown.style.top = `${Math.max(10, top)}px`;
                elementDropdown.style.left = `${Math.max(10, left)}px`;
                elementDropdown.classList.add('show');
            }
        });

        // Close dropdown when clicking outside
        Utils.DOM.on(document, 'click', (e) => {
            if (!e.target.closest('.add-element-dropdown')) {
                elementDropdown.classList.remove('show');
            }
        });

        // Handle dropdown item clicks
        const dropdownItems = Utils.DOM.findAll('.dropdown-item');
        dropdownItems.forEach(item => {
            Utils.DOM.on(item, 'click', (e) => {
                const elementType = item.dataset.elementType;
                addMapElement(elementType);
                elementDropdown.classList.remove('show');
            });
        });
    }

    // Preview controls
    const resetViewBtn = Utils.DOM.find('#reset-preview-view');
    if (resetViewBtn) {
        Utils.DOM.on(resetViewBtn, 'click', resetPreviewView);
    }

    const toggleLayerControlBtn = Utils.DOM.find('#toggle-layer-control');
    if (toggleLayerControlBtn) {
        Utils.DOM.on(toggleLayerControlBtn, 'click', toggleLayerControl);
    }

    // Zoom slider
    const zoomSlider = Utils.DOM.find('#default-zoom');
    const zoomDisplay = Utils.DOM.find('#zoom-display');
    if (zoomSlider && zoomDisplay) {
        Utils.DOM.on(zoomSlider, 'input', (e) => {
            zoomDisplay.textContent = e.target.value;
            updateMapPreview();
        });
    }

    // Real-time preview updates
    const previewInputs = ['#default-lat', '#default-lng'];
    previewInputs.forEach(selector => {
        const input = Utils.DOM.find(selector);
        if (input) {
            Utils.DOM.on(input, 'input', debounce(updateMapPreview, 500));
        }
    });
}

function showAddConfigForm() {
    currentEditingId = null;
    mapElements = [];
    Utils.DOM.find('#config-form-title').textContent = 'Add Map Configuration';
    Utils.DOM.find('#map-config-form').style.display = 'block';
    Utils.DOM.find('#map-preview-card').style.display = 'block';
    
    // Reset form
    Utils.DOM.find('#map-config-form-element').reset();
    Utils.DOM.find('#zoom-display').textContent = '10';
    renderElementsList();
    
    // Initialize preview
    setTimeout(initializeMapPreview, 100);
}

function hideConfigForm() {
    Utils.DOM.find('#map-config-form').style.display = 'none';
    Utils.DOM.find('#map-preview-card').style.display = 'none';
    
    if (currentMapPreview) {
        currentMapPreview.remove();
        currentMapPreview = null;
    }
    
    currentEditingId = null;
    mapElements = [];
}

function showImportAccordion() {
    const accordion = Utils.DOM.find('#import-accordion');
    if (accordion) {
        accordion.style.display = 'block';
        
        // Hide other forms
        hideConfigForm();
        
        // Clear textarea
        const textarea = Utils.DOM.find('#json-import-textarea');
        if (textarea) {
            textarea.value = '';
        }
    }
}

function hideImportAccordion() {
    const accordion = Utils.DOM.find('#import-accordion');
    if (accordion) {
        accordion.style.display = 'none';
    }
}

async function handleJsonImport() {
    const textarea = Utils.DOM.find('#json-import-textarea');
    const jsonText = textarea?.value?.trim();
    
    if (!jsonText) {
        app.showNotification('error', 'Missing Data', 'Please paste a JSON configuration');
        return;
    }

    try {
        const config = JSON.parse(jsonText);
        
        // Validate basic structure
        if (!config.name && !config.layer_config) {
            throw new Error('Invalid configuration format');
        }
        
        await importMapConfiguration(config);
        
    } catch (error) {
        logger.error('JSON import error:', error);
        if (error instanceof SyntaxError) {
            app.showNotification('error', 'Invalid JSON', 'Please check your JSON syntax');
        } else {
            app.showNotification('error', i18n.t('messages.error'), error.message || 'Failed to import configuration');
        }
    }
}

function addMapElement(elementType) {
    const elementId = Date.now().toString();
    
    let elementData = {
        id: elementId,
        type: elementType,
        name: getDefaultElementName(elementType),
        visible: true,
        zIndex: mapElements.length + 1
    };

    // Add type-specific default properties
    switch (elementType) {
        case 'base-layer':
        case 'overlay-layer':
            elementData = {
                ...elementData,
                url: '',
                attribution: '',
                opacity: 1.0,
                maxZoom: 18,
                minZoom: 1
            };
            break;
        case 'wms-layer':
            elementData = {
                ...elementData,
                url: '',
                layers: '',
                format: 'image/png',
                transparent: true,
                attribution: '',
                opacity: 1.0
            };
            break;
        case 'geojson-layer':
            elementData = {
                ...elementData,
                url: '',
                style: {
                    color: '#3388ff',
                    weight: 3,
                    opacity: 1,
                    fillOpacity: 0.2
                }
            };
            break;
        case 'layer-control':
            elementData = {
                ...elementData,
                position: 'topright',
                collapsed: false
            };
            break;
        case 'scale-control':
            elementData = {
                ...elementData,
                position: 'bottomleft',
                imperial: false
            };
            break;
        case 'zoom-control':
            elementData = {
                ...elementData,
                position: 'topleft'
            };
            break;
        case 'marker-cluster':
            elementData = {
                ...elementData,
                maxClusterRadius: 80,
                disableClusteringAtZoom: 15
            };
            break;
    }

    mapElements.push(elementData);
    renderElementsList();
    
    // Automatically expand the new element
    setTimeout(() => {
        const newAccordion = Utils.DOM.find(`[data-element-id="${elementId}"] .accordion-header`);
        if (newAccordion) {
            newAccordion.click();
        }
    }, 100);

    app.showNotification('success', 'Element Added', `${elementData.name} has been added to the configuration`);
}

function getDefaultElementName(elementType) {
    const names = {
        'base-layer': 'Base Layer',
        'overlay-layer': 'Overlay Layer',
        'wms-layer': 'WMS Layer',
        'geojson-layer': 'GeoJSON Layer',
        'marker-cluster': 'Marker Cluster',
        'layer-control': 'Layer Control',
        'scale-control': 'Scale Control',
        'zoom-control': 'Zoom Control'
    };
    
    return names[elementType] || 'Map Element';
}

function renderElementsList() {
    const container = Utils.DOM.find('#elements-list');
    if (!container) return;

    if (mapElements.length === 0) {
        container.innerHTML = `
            <div class="empty-elements">
                <div style="font-size: 1.5rem; margin-bottom: var(--spacing-sm);">🧩</div>
                <p>No elements configured. Add your first map element to get started.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = mapElements.map(element => `
        <div class="element-accordion" data-element-id="${element.id}">
            <div class="accordion-header" onclick="toggleAccordion('${element.id}')">
                <div class="element-header-info">
                    <div class="drag-handle" title="Drag to reorder">⋮⋮</div>
                    <span class="element-type-badge element-type-${element.type.split('-')[0]}">${element.type.toUpperCase()}</span>
                    <div>
                        <div class="element-name">${element.name}</div>
                        <div class="element-summary">${getElementSummary(element)}</div>
                    </div>
                </div>
                <div class="accordion-controls">
                    <label onclick="event.stopPropagation();" style="display: flex; align-items: center; gap: var(--spacing-xs); margin-right: var(--spacing-sm);">
                        <input type="checkbox" ${element.visible ? 'checked' : ''} 
                               onchange="toggleElementVisibility('${element.id}', this.checked)">
                        <span style="font-size: var(--font-size-sm);">Visible</span>
                    </label>
                    <button type="button" class="btn btn-sm btn-danger" onclick="event.stopPropagation(); removeElement('${element.id}');">Remove</button>
                    <span class="accordion-toggle">▼</span>
                </div>
            </div>
            <div class="accordion-content" data-content-id="${element.id}">
                ${renderElementConfiguration(element)}
            </div>
        </div>
    `).join('');
}

function getElementSummary(element) {
    switch (element.type) {
        case 'base-layer':
        case 'overlay-layer':
            return element.url ? `URL: ${element.url.substring(0, 40)}...` : 'No URL configured';
        case 'wms-layer':
            return element.url ? `WMS: ${element.layers || 'No layers'}` : 'No URL configured';
        case 'geojson-layer':
            return element.url ? `GeoJSON from URL` : 'No URL configured';
        case 'layer-control':
            return `Position: ${element.position}${element.collapsed ? ' (collapsed)' : ''}`;
        case 'scale-control':
            return `Position: ${element.position}${element.imperial ? ' (imperial)' : ' (metric)'}`;
        case 'zoom-control':
            return `Position: ${element.position}`;
        case 'marker-cluster':
            return `Cluster radius: ${element.maxClusterRadius}px`;
        default:
            return 'Configure settings below';
    }
}

function renderElementConfiguration(element) {
    switch (element.type) {
        case 'base-layer':
        case 'overlay-layer':
            return renderTileLayerConfig(element);
        case 'wms-layer':
            return renderWMSLayerConfig(element);
        case 'geojson-layer':
            return renderGeoJSONLayerConfig(element);
        case 'layer-control':
            return renderLayerControlConfig(element);
        case 'scale-control':
            return renderScaleControlConfig(element);
        case 'zoom-control':
            return renderZoomControlConfig(element);
        case 'marker-cluster':
            return renderMarkerClusterConfig(element);
        default:
            return '<p>Configuration options not available for this element type.</p>';
    }
}

function renderTileLayerConfig(element) {
    const presets = element.type === 'base-layer' ? MAP_PRESETS.baseLayers : MAP_PRESETS.overlays;
    
    return `
        <div class="element-config-grid">
            <div class="form-group">
                <label class="form-label">Layer Name</label>
                <input type="text" class="form-input" value="${element.name}" 
                       onchange="updateElementProperty('${element.id}', 'name', this.value)">
            </div>
            <div class="form-group">
                <label class="form-label">Opacity</label>
                <input type="range" class="form-range" min="0" max="1" step="0.1" value="${element.opacity}"
                       onchange="updateElementProperty('${element.id}', 'opacity', parseFloat(this.value)); this.nextElementSibling.textContent = Math.round(this.value * 100) + '%'">
                <div style="text-align: center; margin-top: var(--spacing-xs); font-size: var(--font-size-sm);">
                    ${Math.round(element.opacity * 100)}%
                </div>
            </div>
        </div>
        
        <div class="form-group">
            <label class="form-label">Tile URL</label>
            <input type="url" class="form-input" value="${element.url}" placeholder="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                   onchange="updateElementProperty('${element.id}', 'url', this.value)">
            <div class="form-help">Use {x}, {y}, {z} placeholders for tile coordinates</div>
            <button type="button" class="btn btn-sm btn-outline" onclick="testElementUrl('${element.id}')">Test URL</button>
            <div id="test-result-${element.id}"></div>
        </div>
        
        <div class="form-group">
            <label class="form-label">Attribution</label>
            <input type="text" class="form-input" value="${element.attribution}" 
                   onchange="updateElementProperty('${element.id}', 'attribution', this.value)">
        </div>
        
        <div class="element-config-grid">
            <div class="form-group">
                <label class="form-label">Min Zoom</label>
                <input type="number" class="form-input" min="1" max="20" value="${element.minZoom}"
                       onchange="updateElementProperty('${element.id}', 'minZoom', parseInt(this.value))">
            </div>
            <div class="form-group">
                <label class="form-label">Max Zoom</label>
                <input type="number" class="form-input" min="1" max="20" value="${element.maxZoom}"
                       onchange="updateElementProperty('${element.id}', 'maxZoom', parseInt(this.value))">
            </div>
        </div>
        
        ${Object.keys(presets).length > 0 ? `
            <div class="form-group">
                <label class="form-label">Quick Presets</label>
                <div class="preset-grid">
                    ${Object.entries(presets).map(([key, preset]) => `
                        <div class="preset-item" onclick="applyPreset('${element.id}', ${JSON.stringify(preset).replace(/"/g, '&quot;')})">
                            <div class="preset-name">${preset.name}</div>
                            <div class="preset-desc">Click to apply</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
    `;
}

function renderWMSLayerConfig(element) {
    return `
        <div class="element-config-grid">
            <div class="form-group">
                <label class="form-label">Layer Name</label>
                <input type="text" class="form-input" value="${element.name}" 
                       onchange="updateElementProperty('${element.id}', 'name', this.value)">
            </div>
            <div class="form-group">
                <label class="form-label">Opacity</label>
                <input type="range" class="form-range" min="0" max="1" step="0.1" value="${element.opacity}"
                       onchange="updateElementProperty('${element.id}', 'opacity', parseFloat(this.value)); this.nextElementSibling.textContent = Math.round(this.value * 100) + '%'">
                <div style="text-align: center; margin-top: var(--spacing-xs); font-size: var(--font-size-sm);">
                    ${Math.round(element.opacity * 100)}%
                </div>
            </div>
        </div>
        
        <div class="form-group">
            <label class="form-label">WMS URL</label>
            <input type="url" class="form-input" value="${element.url}" 
                   onchange="updateElementProperty('${element.id}', 'url', this.value)">
        </div>
        
        <div class="element-config-grid">
            <div class="form-group">
                <label class="form-label">WMS Layers</label>
                <input type="text" class="form-input" value="${element.layers}" placeholder="layer1,layer2"
                       onchange="updateElementProperty('${element.id}', 'layers', this.value)">
            </div>
            <div class="form-group">
                <label class="form-label">Format</label>
                <select class="form-input" onchange="updateElementProperty('${element.id}', 'format', this.value)">
                    <option value="image/png" ${element.format === 'image/png' ? 'selected' : ''}>PNG</option>
                    <option value="image/jpeg" ${element.format === 'image/jpeg' ? 'selected' : ''}>JPEG</option>
                    <option value="image/gif" ${element.format === 'image/gif' ? 'selected' : ''}>GIF</option>
                </select>
            </div>
        </div>
        
        <div class="form-group">
            <label class="form-label">Attribution</label>
            <input type="text" class="form-input" value="${element.attribution}" 
                   onchange="updateElementProperty('${element.id}', 'attribution', this.value)">
        </div>
        
        <div class="form-group">
            <label style="display: flex; align-items: center; gap: var(--spacing-sm); cursor: pointer;">
                <input type="checkbox" class="form-checkbox" ${element.transparent ? 'checked' : ''}
                       onchange="updateElementProperty('${element.id}', 'transparent', this.checked)">
                <span>Transparent background</span>
            </label>
        </div>
    `;
}

function renderGeoJSONLayerConfig(element) {
    return `
        <div class="form-group">
            <label class="form-label">Layer Name</label>
            <input type="text" class="form-input" value="${element.name}" 
                   onchange="updateElementProperty('${element.id}', 'name', this.value)">
        </div>
        
        <div class="form-group">
            <label class="form-label">GeoJSON URL</label>
            <input type="url" class="form-input" value="${element.url}" 
                   onchange="updateElementProperty('${element.id}', 'url', this.value)">
            <div class="form-help">URL to GeoJSON file or API endpoint</div>
        </div>
        
        <div class="form-group">
            <label class="form-label">Style Configuration</label>
            <div class="element-config-grid">
                <div class="form-group">
                    <label class="form-label">Stroke Color</label>
                    <input type="color" class="form-input" value="${element.style.color}" 
                           onchange="updateElementStyleProperty('${element.id}', 'color', this.value)">
                </div>
                <div class="form-group">
                    <label class="form-label">Stroke Width</label>
                    <input type="number" class="form-input" min="1" max="10" value="${element.style.weight}"
                           onchange="updateElementStyleProperty('${element.id}', 'weight', parseInt(this.value))">
                </div>
                <div class="form-group">
                    <label class="form-label">Stroke Opacity</label>
                    <input type="range" class="form-range" min="0" max="1" step="0.1" value="${element.style.opacity}"
                           onchange="updateElementStyleProperty('${element.id}', 'opacity', parseFloat(this.value))">
                </div>
                <div class="form-group">
                    <label class="form-label">Fill Opacity</label>
                    <input type="range" class="form-range" min="0" max="1" step="0.1" value="${element.style.fillOpacity}"
                           onchange="updateElementStyleProperty('${element.id}', 'fillOpacity', parseFloat(this.value))">
                </div>
            </div>
        </div>
    `;
}

function renderLayerControlConfig(element) {
    return `
        <div class="form-group">
            <label class="form-label">Control Name</label>
            <input type="text" class="form-input" value="${element.name}" 
                   onchange="updateElementProperty('${element.id}', 'name', this.value)">
        </div>
        
        <div class="element-config-grid">
            <div class="form-group">
                <label class="form-label">Position</label>
                <select class="form-input" onchange="updateElementProperty('${element.id}', 'position', this.value)">
                    <option value="topleft" ${element.position === 'topleft' ? 'selected' : ''}>Top Left</option>
                    <option value="topright" ${element.position === 'topright' ? 'selected' : ''}>Top Right</option>
                    <option value="bottomleft" ${element.position === 'bottomleft' ? 'selected' : ''}>Bottom Left</option>
                    <option value="bottomright" ${element.position === 'bottomright' ? 'selected' : ''}>Bottom Right</option>
                </select>
            </div>
            <div class="form-group">
                <label style="display: flex; align-items: center; gap: var(--spacing-sm); cursor: pointer;">
                    <input type="checkbox" class="form-checkbox" ${element.collapsed ? 'checked' : ''}
                           onchange="updateElementProperty('${element.id}', 'collapsed', this.checked)">
                    <span>Start collapsed</span>
                </label>
            </div>
        </div>
    `;
}

function renderScaleControlConfig(element) {
    return `
        <div class="form-group">
            <label class="form-label">Control Name</label>
            <input type="text" class="form-input" value="${element.name}" 
                   onchange="updateElementProperty('${element.id}', 'name', this.value)">
        </div>
        
        <div class="element-config-grid">
            <div class="form-group">
                <label class="form-label">Position</label>
                <select class="form-input" onchange="updateElementProperty('${element.id}', 'position', this.value)">
                    <option value="topleft" ${element.position === 'topleft' ? 'selected' : ''}>Top Left</option>
                    <option value="topright" ${element.position === 'topright' ? 'selected' : ''}>Top Right</option>
                    <option value="bottomleft" ${element.position === 'bottomleft' ? 'selected' : ''}>Bottom Left</option>
                    <option value="bottomright" ${element.position === 'bottomright' ? 'selected' : ''}>Bottom Right</option>
                </select>
            </div>
            <div class="form-group">
                <label style="display: flex; align-items: center; gap: var(--spacing-sm); cursor: pointer;">
                    <input type="checkbox" class="form-checkbox" ${element.imperial ? 'checked' : ''}
                           onchange="updateElementProperty('${element.id}', 'imperial', this.checked)">
                    <span>Show imperial units</span>
                </label>
            </div>
        </div>
    `;
}

function renderZoomControlConfig(element) {
    return `
        <div class="form-group">
            <label class="form-label">Control Name</label>
            <input type="text" class="form-input" value="${element.name}" 
                   onchange="updateElementProperty('${element.id}', 'name', this.value)">
        </div>
        
        <div class="form-group">
            <label class="form-label">Position</label>
            <select class="form-input" onchange="updateElementProperty('${element.id}', 'position', this.value)">
                <option value="topleft" ${element.position === 'topleft' ? 'selected' : ''}>Top Left</option>
                <option value="topright" ${element.position === 'topright' ? 'selected' : ''}>Top Right</option>
                <option value="bottomleft" ${element.position === 'bottomleft' ? 'selected' : ''}>Bottom Left</option>
                <option value="bottomright" ${element.position === 'bottomright' ? 'selected' : ''}>Bottom Right</option>
            </select>
        </div>
    `;
}

function renderMarkerClusterConfig(element) {
    return `
        <div class="form-group">
            <label class="form-label">Cluster Name</label>
            <input type="text" class="form-input" value="${element.name}" 
                   onchange="updateElementProperty('${element.id}', 'name', this.value)">
        </div>
        
        <div class="element-config-grid">
            <div class="form-group">
                <label class="form-label">Max Cluster Radius</label>
                <input type="number" class="form-input" min="20" max="200" value="${element.maxClusterRadius}"
                       onchange="updateElementProperty('${element.id}', 'maxClusterRadius', parseInt(this.value))">
                <div class="form-help">Pixels</div>
            </div>
            <div class="form-group">
                <label class="form-label">Disable Clustering at Zoom</label>
                <input type="number" class="form-input" min="1" max="20" value="${element.disableClusteringAtZoom}"
                       onchange="updateElementProperty('${element.id}', 'disableClusteringAtZoom', parseInt(this.value))">
                <div class="form-help">Show individual markers at this zoom level</div>
            </div>
        </div>
    `;
}

// Global functions for element management
window.toggleAccordion = function(elementId) {
    const accordion = Utils.DOM.find(`[data-element-id="${elementId}"] .accordion-header`);
    const content = Utils.DOM.find(`[data-content-id="${elementId}"]`);
    const toggle = accordion.querySelector('.accordion-toggle');
    
    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        accordion.classList.remove('expanded');
        toggle.textContent = '▼';
    } else {
        content.classList.add('expanded');
        accordion.classList.add('expanded');
        toggle.textContent = '▲';
    }
};

window.toggleElementVisibility = function(elementId, visible) {
    const element = mapElements.find(e => e.id === elementId);
    if (element) {
        element.visible = visible;
        updateMapPreview();
    }
};

window.removeElement = function(elementId) {
    const elementIndex = mapElements.findIndex(e => e.id === elementId);
    if (elementIndex === -1) return;

    const element = mapElements[elementIndex];
    
    if (confirm(`Are you sure you want to remove "${element.name}"?`)) {
        mapElements.splice(elementIndex, 1);
        renderElementsList();
        updateMapPreview();
        app.showNotification('success', 'Element Removed', `${element.name} has been removed`);
    }
};

window.updateElementProperty = function(elementId, property, value) {
    const element = mapElements.find(e => e.id === elementId);
    if (element) {
        element[property] = value;
        
        // Update summary
        const summaryElement = Utils.DOM.find(`[data-element-id="${elementId}"] .element-summary`);
        if (summaryElement) {
            summaryElement.textContent = getElementSummary(element);
        }
        
        updateMapPreview();
    }
};

window.updateElementStyleProperty = function(elementId, property, value) {
    const element = mapElements.find(e => e.id === elementId);
    if (element && element.style) {
        element.style[property] = value;
        updateMapPreview();
    }
};

window.applyPreset = function(elementId, preset) {
    const element = mapElements.find(e => e.id === elementId);
    if (element) {
        element.name = preset.name;
        element.url = preset.url;
        element.attribution = preset.attribution;
        
        // Re-render the accordion content
        renderElementsList();
        
        // Keep accordion expanded
        setTimeout(() => {
            const accordion = Utils.DOM.find(`[data-element-id="${elementId}"] .accordion-header`);
            if (accordion && !accordion.classList.contains('expanded')) {
                accordion.click();
            }
        }, 100);
        
        updateMapPreview();
        app.showNotification('success', 'Preset Applied', `${preset.name} preset has been applied`);
    }
};

window.testElementUrl = function(elementId) {
    const element = mapElements.find(e => e.id === elementId);
    const resultDiv = Utils.DOM.find(`#test-result-${elementId}`);
    
    if (!element || !element.url) {
        resultDiv.innerHTML = '<div class="test-result error">Please enter a URL</div>';
        return;
    }

    resultDiv.innerHTML = '<div class="test-result loading">Testing...</div>';

    // Test URL based on element type
    let testUrl = element.url;
    if (element.type === 'base-layer' || element.type === 'overlay-layer') {
        testUrl = element.url.replace('{z}', '10').replace('{x}', '512').replace('{y}', '512');
    }

    fetch(testUrl, { method: 'HEAD' })
        .then(response => {
            if (response.ok) {
                resultDiv.innerHTML = '<div class="test-result success">URL is accessible</div>';
            } else {
                resultDiv.innerHTML = `<div class="test-result error">Error: ${response.status}</div>`;
            }
        })
        .catch(error => {
            resultDiv.innerHTML = `<div class="test-result error">Failed: ${error.message}</div>`;
        });
};

async function saveMapConfiguration() {
    const form = Utils.DOM.find('#map-config-form-element');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    if (mapElements.length === 0) {
        app.showNotification('error', 'Validation Error', 'Please add at least one map element');
        return;
    }

    const saveBtn = Utils.DOM.find('#save-config-btn');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;

    try {
        const configData = {
            name: Utils.DOM.find('#config-name').value,
            tile_url: getFirstTileLayerUrl(),
            attribution: getAllAttributions(),
            max_zoom: parseInt(Utils.DOM.find('#max-zoom').value),
            min_zoom: parseInt(Utils.DOM.find('#min-zoom').value),
            default_zoom: parseInt(Utils.DOM.find('#default-zoom').value),
            is_default: Utils.DOM.find('#is-default').checked,
            is_active: Utils.DOM.find('#is-active').checked,
            layer_config: {
                elements: mapElements,
                version: "2.0",
                created: new Date().toISOString()
            }
        };

        const lat = parseFloat(Utils.DOM.find('#default-lat').value);
        const lng = parseFloat(Utils.DOM.find('#default-lng').value);
        
        const selectedProjectId = supabaseClient.getCurrentProjectId();
        if (!selectedProjectId) {
            throw new Error('No project selected');
        }

        logger.log('MapSettingsPage: Using projectId for operation:', selectedProjectId);

        configData.project_id = selectedProjectId;
        
        // Add geometry to configData if coordinates are valid
        if (!isNaN(lat) && !isNaN(lng)) {
            configData.default_center = `POINT(${lng} ${lat})`;
        }

        if (currentEditingId) {
            if (selectedProjectId) {
                await supabaseClient.updateWithProjectContext('map_settings', selectedProjectId, currentEditingId, configData);
            } else {
                await supabaseClient.update('map_settings', currentEditingId, configData);
            }
            
            logger.log('MapSettingsPage: Update operation completed successfully');
            app.showNotification('success', 'Success', 'Map configuration updated successfully');
        } else {
            if (selectedProjectId) {
                await supabaseClient.createWithProjectContext('map_settings', selectedProjectId, configData);
            } else {
                await supabaseClient.create('map_settings', { ...configData, project_id: selectedProjectId });
            }
            
            logger.log('MapSettingsPage: Create operation completed successfully');
            app.showNotification('success', 'Success', 'Map configuration created successfully');
        }

        hideConfigForm();
        location.reload();
        
    } catch (error) {
        logger.error('Failed to save map configuration:', error);
        app.showNotification('error', 'Error', error.message || 'Failed to save configuration');
    } finally {
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
    }
}

function getFirstTileLayerUrl() {
    const tileLayer = mapElements.find(e => e.type === 'base-layer' || e.type === 'overlay-layer');
    return tileLayer?.url || '';
}

function getAllAttributions() {
    return mapElements
        .filter(e => e.attribution)
        .map(e => e.attribution)
        .join('; ') || null;
}

async function createDefaultMapConfiguration() {
    const btn = Utils.DOM.find('#add-default-map-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Creating...';
    btn.disabled = true;

    try {
        const selectedProjectId = supabaseClient.getCurrentProjectId();
        if (!selectedProjectId) {
            throw new Error('No project selected');
        }

        logger.log('Creating default map configuration for project:', selectedProjectId);

        // Check if a default map already exists
        const existingConfigs = await supabaseClient.getProjectScopedData('map_settings', selectedProjectId);
        const hasDefault = existingConfigs.some(config => config.name && config.name.toLowerCase().includes('default'));

        const configName = hasDefault ? 'Default Germany Map (New)' : 'Default Germany Map';

        const defaultConfig = {
            name: configName,
            tile_url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            attribution: '© OpenStreetMap contributors',
            max_zoom: 19,
            min_zoom: 1,
            default_zoom: 6,
            default_center: 'POINT(10.4515 51.1657)',
            is_default: !hasDefault,
            is_active: true,
            project_id: selectedProjectId,
            layer_config: {
                elements: [
                    {
                        id: 'osm-base-' + Date.now(),
                        type: 'base-layer',
                        name: 'OpenStreetMap',
                        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        attribution: '© OpenStreetMap contributors',
                        opacity: 1.0,
                        visible: true,
                        zIndex: 1,
                        maxZoom: 19,
                        minZoom: 1
                    },
                    {
                        id: 'zoom-control-' + Date.now(),
                        type: 'zoom-control',
                        name: 'Zoom Control',
                        position: 'topleft',
                        visible: true,
                        zIndex: 100
                    },
                    {
                        id: 'scale-control-' + Date.now(),
                        type: 'scale-control',
                        name: 'Scale Control',
                        position: 'bottomleft',
                        imperial: false,
                        visible: true,
                        zIndex: 101
                    }
                ],
                version: '2.0',
                created: new Date().toISOString()
            }
        };

        await supabaseClient.createWithProjectContext('map_settings', selectedProjectId, defaultConfig);
        
        logger.log('Default map configuration created successfully');
        app.showNotification('success', 'Success', 'Default Germany map configuration created successfully');
        
        // Reload the page to show the new configuration
        location.reload();
        
    } catch (error) {
        logger.error('Failed to create default map configuration:', error);
        app.showNotification('error', 'Error', error.message || 'Failed to create default map configuration');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

function initializeMapPreview() {
    if (currentMapPreview) {
        currentMapPreview.remove();
    }

    const previewDiv = Utils.DOM.find('#map-preview');
    if (!previewDiv) return;

    // Ensure the container is visible and has dimensions
    if (previewDiv.offsetWidth === 0 || previewDiv.offsetHeight === 0) {
        logger.warn('Map preview container not visible, deferring initialization');
        setTimeout(initializeMapPreview, 100);
        return;
    }

    try {
        currentMapPreview = L.map('map-preview').setView([51.1657, 10.4515], 6);
        currentMapPreview._controlsToRemove = [];
        updateMapPreview();
    } catch (error) {
        logger.error('Failed to initialize map preview:', error);
        previewDiv.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-text-tertiary);">Map preview unavailable</div>';
    }
}

function updateMapPreview() {
    if (!currentMapPreview || !currentMapPreview._container) return;

    const lat = parseFloat(Utils.DOM.find('#default-lat')?.value || 51.1657);
    const lng = parseFloat(Utils.DOM.find('#default-lng')?.value || 10.4515);
    const zoom = parseInt(Utils.DOM.find('#default-zoom')?.value || 6);

    // Remove existing layers and controls
    currentMapPreview.eachLayer(function(layer) {
        if (layer instanceof L.TileLayer || layer instanceof L.GeoJSON) {
            currentMapPreview.removeLayer(layer);
        }
    });
    
    // Remove existing controls (store references to remove them properly)
    if (currentMapPreview._controlsToRemove) {
        currentMapPreview._controlsToRemove.forEach(control => {
            try {
                currentMapPreview.removeControl(control);
            } catch (e) {
                // Control might already be removed
            }
        });
    }
    currentMapPreview._controlsToRemove = [];

    // Add elements in order
    mapElements
        .filter(element => element.visible)
        .sort((a, b) => a.zIndex - b.zIndex)
        .forEach(element => {
            try {
                addElementToMap(currentMapPreview, element);
            } catch (error) {
                logger.warn('Failed to add element to preview:', element.name, error);
            }
        });

    // Update view
    if (!isNaN(lat) && !isNaN(lng) && !isNaN(zoom)) {
        currentMapPreview.setView([lat, lng], zoom);
    }
}

function addElementToMap(map, element) {
    switch (element.type) {
        case 'base-layer':
        case 'overlay-layer':
            if (element.url) {
                const layer = L.tileLayer(element.url, {
                    attribution: element.attribution,
                    opacity: element.opacity,
                    maxZoom: element.maxZoom,
                    minZoom: element.minZoom
                });
                layer.addTo(map);
            }
            break;
            
        case 'wms-layer':
            if (element.url && element.layers) {
                const layer = L.tileLayer.wms(element.url, {
                    layers: element.layers,
                    format: element.format,
                    transparent: element.transparent,
                    attribution: element.attribution,
                    opacity: element.opacity
                });
                layer.addTo(map);
            }
            break;
            
        case 'geojson-layer':
            if (element.url) {
                fetch(element.url)
                    .then(response => response.json())
                    .then(data => {
                        const layer = L.geoJSON(data, {
                            style: element.style
                        });
                        layer.addTo(map);
                    })
                    .catch(error => logger.warn('Failed to load GeoJSON:', error));
            }
            break;
            
        case 'layer-control':
            const layerControl = L.control.layers({}, {}, {
                position: element.position,
                collapsed: element.collapsed
            });
            layerControl.addTo(map);
            // Track control for removal
            if (!map._controlsToRemove) map._controlsToRemove = [];
            map._controlsToRemove.push(layerControl);
            break;
            
        case 'scale-control':
            const scaleControl = L.control.scale({
                position: element.position,
                imperial: element.imperial
            });
            scaleControl.addTo(map);
            // Track control for removal
            if (!map._controlsToRemove) map._controlsToRemove = [];
            map._controlsToRemove.push(scaleControl);
            break;
            
        case 'zoom-control':
            // Zoom control is added by default, just update position if needed
            if (element.position !== 'topleft') {
                map.zoomControl.setPosition(element.position);
            }
            break;
    }
}

function resetPreviewView() {
    if (!currentMapPreview) return;
    
    const lat = parseFloat(Utils.DOM.find('#default-lat')?.value || 51.1657);
    const lng = parseFloat(Utils.DOM.find('#default-lng')?.value || 10.4515);
    const zoom = parseInt(Utils.DOM.find('#default-zoom')?.value || 6);
    
    currentMapPreview.setView([lat, lng], zoom);
}

function toggleLayerControl() {
    // Toggle layer control visibility in preview
    if (currentMapPreview) {
        const hasLayerControl = mapElements.some(e => e.type === 'layer-control' && e.visible);
        if (!hasLayerControl) {
            app.showNotification('info', 'Layer Control', 'Add a Layer Control element to enable this feature');
        }
    }
}

// Global functions for configuration management
window.previewMapConfig = async function(configId) {
    try {
        // Get config with coordinates as separate lat/lng values
        const { data: config, error } = await supabaseClient._client
            .from('map_settings')
            .select('*, ST_X(default_center) as default_lng, ST_Y(default_center) as default_lat')
            .eq('id', configId)
            .single();
            
        if (error) throw error;

        Utils.DOM.find('#map-preview-card').style.display = 'block';
        
        if (config.layer_config?.elements) {
            mapElements = config.layer_config.elements;
        }
        
        setTimeout(() => {
            initializeMapPreview();
            if (config.default_lat && config.default_lng) {
                currentMapPreview.setView([config.default_lat, config.default_lng], config.default_zoom || 10);
            }
        }, 100);
        
    } catch (error) {
        logger.error('Failed to preview configuration:', error);
        app.showNotification('error', 'Error', 'Failed to load configuration preview');
    }
};

window.editMapConfig = async function(configId) {
    try {
        // Get config with coordinates as separate lat/lng values
        const { data: config, error } = await supabaseClient._client
            .from('map_settings')
            .select('*, ST_X(default_center) as default_lng, ST_Y(default_center) as default_lat')
            .eq('id', configId)
            .single();
            
        if (error) throw error;

        currentEditingId = configId;
        mapElements = config.layer_config?.elements || [];
        
        Utils.DOM.find('#config-form-title').textContent = 'Edit Map Configuration';
        
        // Populate form
        Utils.DOM.find('#config-name').value = config.name || '';
        Utils.DOM.find('#max-zoom').value = config.max_zoom || 18;
        Utils.DOM.find('#min-zoom').value = config.min_zoom || 1;
        Utils.DOM.find('#default-zoom').value = config.default_zoom || 10;
        Utils.DOM.find('#zoom-display').textContent = config.default_zoom || 10;
        Utils.DOM.find('#is-default').checked = config.is_default || false;
        Utils.DOM.find('#is-active').checked = config.is_active || false;

        // Handle coordinates
        if (config.default_lat && config.default_lng) {
            Utils.DOM.find('#default-lat').value = config.default_lat;
            Utils.DOM.find('#default-lng').value = config.default_lng;
        }

        Utils.DOM.find('#map-config-form').style.display = 'block';
        Utils.DOM.find('#map-preview-card').style.display = 'block';
        
        renderElementsList();
        setTimeout(initializeMapPreview, 100);
        
    } catch (error) {
        logger.error('Failed to load configuration for editing:', error);
        app.showNotification('error', 'Error', 'Failed to load configuration');
    }
};

window.duplicateMapConfig = async function(configId) {
    try {
        const config = await supabaseClient.getById('map_settings', configId);

        const duplicatedConfig = {
            ...config,
            name: config.name + ' (Copy)',
            is_default: false,
            is_active: false
        };
        
        delete duplicatedConfig.id;
        delete duplicatedConfig.created_at;

        const selectedProjectId = duplicatedConfig.project_id || supabaseClient.getCurrentProjectId();
        
        if (selectedProjectId) {
            await supabaseClient.createWithProjectContext('map_settings', selectedProjectId, duplicatedConfig);
        } else {
            await supabaseClient.create('map_settings', { ...duplicatedConfig, project_id: selectedProjectId });
        }

        app.showNotification('success', 'Success', 'Configuration duplicated successfully');
        location.reload();
        
    } catch (error) {
        logger.error('Failed to duplicate configuration:', error);
        app.showNotification('error', 'Error', 'Failed to duplicate configuration');
    }
};

window.toggleMapConfigActive = async function(configId, activate) {
    try {
        const selectedProjectId = supabaseClient.getCurrentProjectId();
        
        if (selectedProjectId) {
            await supabaseClient.updateWithProjectContext('map_settings', selectedProjectId, configId, { is_active: activate });
        } else {
            await supabaseClient.update('map_settings', configId, { is_active: activate });
        }

        app.showNotification('success', 'Success', `Configuration ${activate ? 'activated' : 'deactivated'}`);
        location.reload();
        
    } catch (error) {
        logger.error('Failed to toggle configuration:', error);
        app.showNotification('error', 'Error', 'Failed to update configuration');
    }
};

window.deleteMapConfig = async function(configId) {
    if (!confirm('Are you sure you want to delete this map configuration?')) {
        return;
    }

    try {
        const selectedProjectId = supabaseClient.getCurrentProjectId();
        
        if (selectedProjectId) {
            await supabaseClient.deleteWithProjectContext('map_settings', selectedProjectId, configId);
        } else {
            await supabaseClient.delete('map_settings', configId);
        }

        app.showNotification('success', 'Success', 'Configuration deleted successfully');
        location.reload();
        
    } catch (error) {
        logger.error('Failed to delete configuration:', error);
        app.showNotification('error', 'Error', 'Failed to delete configuration');
    }
};

function parseGeometry(geometry) {
    if (typeof geometry === 'string') {
        const coords = geometry.match(/POINT\(([^)]+)\)/);
        if (coords) {
            const [lng, lat] = coords[1].split(' ');
            return { lat: parseFloat(lat), lng: parseFloat(lng) };
        }
    }
    return null;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Global function for template loading
window.loadImportTemplate = function(templateId) {
    const templates = {
        'basic-osm': {
            name: 'Basic OpenStreetMap (Germany)',
            tile_url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            attribution: '© OpenStreetMap contributors',
            max_zoom: 19,
            min_zoom: 1,
            default_zoom: 6,
            default_center: 'POINT(10.4515 51.1657)',
            layer_config: {
                elements: [
                    {
                        id: 'osm-base',
                        type: 'base-layer',
                        name: 'OpenStreetMap',
                        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        attribution: '© OpenStreetMap contributors',
                        opacity: 1.0,
                        visible: true,
                        zIndex: 1,
                        maxZoom: 19,
                        minZoom: 1
                    },
                    {
                        id: 'zoom-control',
                        type: 'zoom-control',
                        name: 'Zoom Control',
                        position: 'topleft',
                        visible: true,
                        zIndex: 100
                    }
                ],
                version: '2.0',
                created: new Date().toISOString()
            }
        },
        'satellite-hybrid': {
            name: 'Satellite with Streets (Germany)',
            tile_url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            attribution: '© Esri',
            max_zoom: 18,
            min_zoom: 1,
            default_zoom: 7,
            default_center: 'POINT(10.4515 51.1657)',
            layer_config: {
                elements: [
                    {
                        id: 'satellite-base',
                        type: 'base-layer',
                        name: 'ESRI Satellite',
                        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                        attribution: '© Esri',
                        opacity: 1.0,
                        visible: true,
                        zIndex: 1,
                        maxZoom: 18,
                        minZoom: 1
                    },
                    {
                        id: 'streets-overlay',
                        type: 'overlay-layer',
                        name: 'Street Labels',
                        url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_only_labels/{z}/{x}/{y}.png',
                        attribution: '© CartoDB',
                        opacity: 0.8,
                        visible: true,
                        zIndex: 2,
                        maxZoom: 18,
                        minZoom: 1
                    },
                    {
                        id: 'layer-control',
                        type: 'layer-control',
                        name: 'Layer Control',
                        position: 'topright',
                        collapsed: false,
                        visible: true,
                        zIndex: 100
                    }
                ],
                version: '2.0',
                created: new Date().toISOString()
            }
        },
        'multi-layer': {
            name: 'Multi-Layer Configuration (Germany)',
            tile_url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            attribution: '© OpenStreetMap contributors',
            max_zoom: 18,
            min_zoom: 1,
            default_zoom: 6,
            default_center: 'POINT(10.4515 51.1657)',
            layer_config: {
                elements: [
                    {
                        id: 'osm-base',
                        type: 'base-layer',
                        name: 'OpenStreetMap',
                        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        attribution: '© OpenStreetMap contributors',
                        opacity: 1.0,
                        visible: true,
                        zIndex: 1,
                        maxZoom: 18,
                        minZoom: 1
                    },
                    {
                        id: 'cycling-overlay',
                        type: 'overlay-layer',
                        name: 'Cycling Routes',
                        url: 'https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png',
                        attribution: '© waymarkedtrails.org',
                        opacity: 0.7,
                        visible: false,
                        zIndex: 2,
                        maxZoom: 18,
                        minZoom: 1
                    },
                    {
                        id: 'layer-control',
                        type: 'layer-control',
                        name: 'Layer Control',
                        position: 'topright',
                        collapsed: false,
                        visible: true,
                        zIndex: 100
                    },
                    {
                        id: 'scale-control',
                        type: 'scale-control',
                        name: 'Scale Control',
                        position: 'bottomleft',
                        imperial: false,
                        visible: true,
                        zIndex: 101
                    }
                ],
                version: '2.0',
                created: new Date().toISOString()
            }
        }
    };

    const template = templates[templateId];
    if (template) {
        const textarea = Utils.DOM.find('#json-import-textarea');
        if (textarea) {
            textarea.value = JSON.stringify(template, null, 2);
        }
    }
};

// Global function for importing map configurations
async function importMapConfiguration(configData) {
    try {
        const selectedProjectId = supabaseClient.getCurrentProjectId();
        if (!selectedProjectId) {
            throw new Error('No project selected');
        }

        logger.log('Importing map configuration for project:', selectedProjectId);

        // Ensure the configuration has required fields
        const importConfig = {
            ...configData,
            project_id: selectedProjectId,
            name: configData.name || 'Imported Configuration',
            is_default: configData.is_default || false,
            is_active: configData.is_active || false
        };

        // Create the configuration
        await supabaseClient.createWithProjectContext('map_settings', selectedProjectId, importConfig);
        
        logger.log('Map configuration imported successfully');
        
        // Close import accordion and reload page
        hideImportAccordion();
        app.showNotification('success', i18n.t('messages.success'), 'Map configuration imported successfully');
        location.reload();
        
    } catch (error) {
        logger.error('Failed to import map configuration:', error);
        throw error; // Re-throw for the handler to manage
    }
}

// Export functions
window.exportMapConfig = async function(configId) {
    try {
        const config = await supabaseClient.getById('map_settings', configId);
        
        // Clean up the config for export
        const exportConfig = {
            name: config.name,
            tile_url: config.tile_url,
            attribution: config.attribution,
            max_zoom: config.max_zoom,
            min_zoom: config.min_zoom,
            default_zoom: config.default_zoom,
            default_center: config.default_center,
            is_default: config.is_default,
            is_active: config.is_active,
            layer_config: config.layer_config
        };

        downloadJsonFile(exportConfig, `${config.name || 'map-config'}.json`);
        app.showNotification('success', i18n.t('messages.success'), `Configuration "${config.name}" exported successfully`);
        
    } catch (error) {
        logger.error('Failed to export configuration:', error);
        app.showNotification('error', i18n.t('messages.error'), 'Failed to export configuration');
    }
};

async function exportAllMapConfigs() {
    try {
        const selectedProjectId = supabaseClient.getCurrentProjectId();
        if (!selectedProjectId) {
            app.showNotification('error', 'No Project', 'Please select a project first');
            return;
        }

        const configs = await supabaseClient.getProjectScopedData('map_settings', selectedProjectId);
        
        if (configs.length === 0) {
            app.showNotification('info', 'No Configurations', 'No map configurations found to export');
            return;
        }

        // Clean up configs for export
        const exportConfigs = configs.map(config => ({
            name: config.name,
            tile_url: config.tile_url,
            attribution: config.attribution,
            max_zoom: config.max_zoom,
            min_zoom: config.min_zoom,
            default_zoom: config.default_zoom,
            default_center: config.default_center,
            is_default: config.is_default,
            is_active: config.is_active,
            layer_config: config.layer_config
        }));

        const exportData = {
            project_name: `Project ${selectedProjectId}`,
            export_date: new Date().toISOString(),
            configurations: exportConfigs
        };

        downloadJsonFile(exportData, `map-configurations-${new Date().toISOString().split('T')[0]}.json`);
        app.showNotification('success', i18n.t('messages.success'), `${configs.length} configurations exported successfully`);
        
    } catch (error) {
        logger.error('Failed to export all configurations:', error);
        app.showNotification('error', i18n.t('messages.error'), 'Failed to export configurations');
    }
}

function downloadJsonFile(data, filename) {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up the URL object
    URL.revokeObjectURL(url);
}