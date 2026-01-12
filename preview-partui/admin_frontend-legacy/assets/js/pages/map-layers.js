/**
 * Map Layers Page Component
 * Table-based CRUD interface for managing map layers and tile sets
 */

import { supabaseClient } from '../core/supabase.js';
import { TableCRUD } from '../components/table-crud.js';
import Utils from '../core/utils.js';
import EntitySelector from '../components/entity-selector.js';
import DebugLogger from '../core/debug-logger.js';
import { i18n, i18nDOM } from '../core/i18n.js';

const logger = new DebugLogger('MapLayersPage');

let layersTable;
let projectId;
let projects = [];
let availableRoles = [];
let selectedLayerIds = new Set();
let bulkRoleSelector = null;
let generalMapSettings = {};

// Predefined layer presets
const LAYER_PRESETS = {
    baseLayers: {
        openstreetmap: {
            name: 'OpenStreetMap',
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            attribution: '© OpenStreetMap contributors',
            type: 'tile'
        },
        openstreetmap_de: {
            name: 'OpenStreetMap Germany', 
            url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
            attribution: '© OpenStreetMap contributors',
            type: 'tile'
        },
        cartodb_light: {
            name: 'CartoDB Light',
            url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
            attribution: '© OpenStreetMap © CartoDB',
            type: 'tile'
        },
        cartodb_dark: {
            name: 'CartoDB Dark',
            url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png',
            attribution: '© OpenStreetMap © CartoDB',
            type: 'tile'
        },
        esri_satellite: {
            name: 'ESRI Satellite',
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            attribution: '© Esri',
            type: 'tile'
        }
    },
    overlays: {
        osm_cycling: {
            name: 'Cycling Routes',
            url: 'https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png',
            attribution: '© waymarkedtrails.org',
            type: 'tile'
        },
        osm_hiking: {
            name: 'Hiking Trails', 
            url: 'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png',
            attribution: '© waymarkedtrails.org',
            type: 'tile'
        }
    }
};

export default async function MapLayersPage(route, context = {}) {
    logger.log('MapLayersPage: Received context:', {
        routePath: route?.path,
        contextProjectId: context.projectId,
        supabaseCurrentProject: supabaseClient.getCurrentProjectId(),
        fullContext: context
    });

    projectId = context.projectId;

    // Ensure supabase client has the correct project context
    if (projectId && supabaseClient.getCurrentProjectId() !== projectId) {
        logger.log('MapLayersPage: Setting project context in supabaseClient:', projectId);
        supabaseClient.setCurrentProject(projectId);
    }
    
    const data = await loadMapLayersData(projectId);
    projects = data.projects;
    generalMapSettings = data.generalSettings;
    
    setTimeout(initializeLayersTable, 50);
    
    return `
        <div class="map-layers-page">
            <!-- Page Header -->
            <div class="page-header">
                <div>
                    <h1 class="page-title">${projectId ? `Map Settings` : 'All Map Settings'}</h1>
                    <p class="page-subtitle">${projectId ? `Manage map layers, custom tiles, and general map settings for this project` : 'Manage map settings across all projects'}</p>
                </div>
                <div class="page-actions">
                    <div id="bulk-role-assignment-container" class="card" style="display: none;">
                        <div class="card-body">
                            <div class="bulk-assignment-header">
                                <span id="selected-layers-count" class="badge badge-primary">0 layers selected</span>
                            </div>
                            <div id="bulk-layer-role-selector" style="margin-top: var(--spacing-sm);"></div>
                        </div>
                    </div>
                    <button class="btn btn-success" id="upload-tiles-btn">
                        Upload Custom Tiles
                    </button>
                    <button class="btn btn-secondary" id="add-preset-layer-btn">
                        Add Preset Layer
                    </button>
                </div>
            </div>

            <!-- General Map Settings -->
            ${projectId ? renderGeneralMapSettings(generalMapSettings) : ''}

            <!-- Map Layers Table -->
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Map Layers</h3>
                    <div class="card-actions">
                        <span class="badge badge-info" id="layer-count">Loading...</span>
                    </div>
                </div>
                <div class="card-body">
                    <div id="layers-table-container" class="table-container"></div>
                </div>
            </div>
            
            <!-- Tile Upload Modal -->
            <div id="tile-upload-modal" class="modal-overlay" style="display: none;">
                <div class="modal" style="max-width: 600px;">
                    <div class="modal-header">
                        <h3 class="modal-title">Upload Custom Tiles</h3>
                        <button class="modal-close" onclick="closeTileUploadModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label">Tile Set Name</label>
                            <input type="text" id="tile-set-name" class="form-input" placeholder="e.g., Custom Aerial Photos">
                            <div class="form-help">A descriptive name for this tile set</div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Description (Optional)</label>
                            <textarea id="tile-set-description" class="form-input" rows="3" placeholder="Description of the tile set..."></textarea>
                        </div>
                        <div class="form-group">
                            <label class="form-label">ZIP File with Tiles</label>
                            <input type="file" id="tiles-zip-input" accept=".zip" class="form-input">
                            <div class="form-help">Upload a ZIP file containing georeferenced tiles in z/x/y folder structure</div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Tile Format</label>
                            <select id="tile-format-select" class="form-input">
                                <option value="png">PNG</option>
                                <option value="jpg">JPEG</option>
                                <option value="webp">WebP</option>
                            </select>
                        </div>
                        <div class="form-group" style="display: none;" id="upload-progress-container">
                            <label class="form-label">Processing Status</label>
                            
                            <!-- Progress Bar -->
                            <div class="progress-bar-container">
                                <div class="progress-bar">
                                    <div class="progress-fill" id="upload-progress-fill" style="width: 0%;"></div>
                                </div>
                                <div class="progress-percentage" id="upload-progress-percentage">0%</div>
                            </div>
                            
                            <!-- Current Status -->
                            <div class="progress-status">
                                <div class="status-icon" id="upload-status-icon">⏳</div>
                                <div class="status-text" id="upload-progress-text">Preparing upload...</div>
                            </div>
                            
                            <!-- Processing Steps -->
                            <div class="processing-steps" id="processing-steps" style="display: none;">
                                <div class="step" data-step="upload">
                                    <span class="step-icon">📁</span>
                                    <span class="step-text">Upload ZIP file</span>
                                    <span class="step-status" id="step-upload-status">pending</span>
                                </div>
                                <div class="step" data-step="create">
                                    <span class="step-icon">📝</span>
                                    <span class="step-text">Create tile set record</span>
                                    <span class="step-status" id="step-create-status">pending</span>
                                </div>
                                <div class="step" data-step="process">
                                    <span class="step-icon">⚙️</span>
                                    <span class="step-text">Extract and validate tiles</span>
                                    <span class="step-status" id="step-process-status">pending</span>
                                </div>
                                <div class="step" data-step="organize">
                                    <span class="step-icon">📂</span>
                                    <span class="step-text">Organize tiles in storage</span>
                                    <span class="step-status" id="step-organize-status">pending</span>
                                </div>
                                <div class="step" data-step="layer">
                                    <span class="step-icon">🗺️</span>
                                    <span class="step-text">Create map layer</span>
                                    <span class="step-status" id="step-layer-status">pending</span>
                                </div>
                            </div>
                            
                            <!-- Processing Info -->
                            <div class="processing-info" id="processing-info" style="display: none;">
                                <div class="info-item">
                                    <strong>Tiles found:</strong> <span id="tiles-found-count">-</span>
                                </div>
                                <div class="info-item">
                                    <strong>Zoom levels:</strong> <span id="zoom-levels-range">-</span>
                                </div>
                                <div class="info-item">
                                    <strong>Processing time:</strong> <span id="processing-time">-</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="closeTileUploadModal()">Cancel</button>
                        <button class="btn btn-primary" onclick="uploadTileSet()" id="upload-tiles-button">Upload Tiles</button>
                    </div>
                </div>
            </div>

            <!-- Preset Layer Modal -->
            <div id="preset-layer-modal" class="modal-overlay" style="display: none;">
                <div class="modal" style="max-width: 800px;">
                    <div class="modal-header">
                        <h3 class="modal-title">Add Preset Layer</h3>
                        <button class="modal-close" onclick="closePresetModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div id="preset-layers-grid" class="preset-grid">
                            <!-- Populated by JavaScript -->
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="closePresetModal()">Close</button>
                    </div>
                </div>
            </div>
        </div>
        
        <style>
            .page-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: var(--spacing-xl);
                gap: var(--spacing-lg);
            }
            
            .page-actions {
                display: flex;
                gap: var(--spacing-sm);
                align-items: flex-start;
                min-width: 400px;
            }
            
            #bulk-role-assignment-container {
                margin-right: var(--spacing-md);
                width: 100%;
                min-width: 250px;
            }
            
            .bulk-assignment-header {
                margin-bottom: var(--spacing-sm);
            }
            
            .layer-type-badge {
                display: inline-block;
                padding: var(--spacing-xs) var(--spacing-sm);
                background: var(--color-bg-tertiary);
                border-radius: var(--border-radius-sm);
                font-size: var(--font-size-xs);
                color: var(--color-text-secondary);
                text-transform: uppercase;
            }
            
            .layer-type-badge.tile { background: #e3f2fd; color: #1976d2; }
            .layer-type-badge.custom { background: #fff3e0; color: #f57c00; }
            .layer-type-badge.wms { background: #f3e5f5; color: #7b1fa2; }
            
            .role-badge {
                display: inline-flex;
                align-items: center;
                padding: var(--spacing-xs) var(--spacing-sm);
                font-size: var(--font-size-xs);
                font-weight: var(--font-weight-medium);
                border-radius: var(--border-radius-full);
                background-color: var(--color-info);
                color: var(--color-text-inverse);
                margin-right: var(--spacing-xs);
            }
            
            .no-roles {
                color: var(--color-text-tertiary);
                font-style: italic;
                font-size: var(--font-size-sm);
            }
            
            .general-settings {
                margin-bottom: var(--spacing-xl);
            }
            
            .settings-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: var(--spacing-lg);
                margin-bottom: var(--spacing-lg);
            }
            
            .preset-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                gap: var(--spacing-md);
                max-height: 60vh;
                overflow-y: auto;
            }
            
            .preset-card {
                border: 1px solid var(--color-border-light);
                border-radius: var(--border-radius-md);
                padding: var(--spacing-md);
                cursor: pointer;
                transition: all var(--transition-fast);
            }
            
            .preset-card:hover {
                border-color: var(--color-primary);
                box-shadow: var(--shadow-sm);
            }
            
            .preset-category {
                font-size: var(--font-size-xs);
                color: var(--color-text-secondary);
                text-transform: uppercase;
                font-weight: var(--font-weight-medium);
                margin-bottom: var(--spacing-xs);
            }
            
            .preset-name {
                font-weight: var(--font-weight-medium);
                margin-bottom: var(--spacing-xs);
            }
            
            .preset-attribution {
                font-size: var(--font-size-sm);
                color: var(--color-text-secondary);
            }
            
            .progress-bar-container {
                display: flex;
                align-items: center;
                gap: var(--spacing-sm);
                margin-bottom: var(--spacing-md);
            }
            
            .progress-bar {
                flex: 1;
                height: 12px;
                background: var(--color-bg-tertiary);
                border-radius: var(--border-radius-full);
                overflow: hidden;
                position: relative;
            }
            
            .progress-fill {
                height: 100%;
                background: linear-gradient(90deg, var(--color-primary), var(--color-success));
                transition: width 0.3s ease;
                position: relative;
            }
            
            .progress-fill::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
                animation: shimmer 2s infinite;
            }
            
            @keyframes shimmer {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
            }
            
            .progress-percentage {
                min-width: 40px;
                text-align: right;
                font-weight: var(--font-weight-medium);
                color: var(--color-text-secondary);
                font-size: var(--font-size-sm);
            }
            
            .progress-status {
                display: flex;
                align-items: center;
                gap: var(--spacing-sm);
                margin-bottom: var(--spacing-md);
                padding: var(--spacing-sm);
                background: var(--color-bg-secondary);
                border-radius: var(--border-radius-md);
                border-left: 3px solid var(--color-primary);
            }
            
            .status-icon {
                font-size: var(--font-size-lg);
                animation: pulse 2s infinite;
            }
            
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
            
            .status-text {
                flex: 1;
                font-weight: var(--font-weight-medium);
                color: var(--color-text-primary);
            }
            
            .processing-steps {
                margin-bottom: var(--spacing-md);
            }
            
            .step {
                display: flex;
                align-items: center;
                gap: var(--spacing-sm);
                padding: var(--spacing-xs) var(--spacing-sm);
                margin-bottom: var(--spacing-xs);
                border-radius: var(--border-radius-sm);
                transition: all var(--transition-fast);
            }
            
            .step[data-status="active"] {
                background: var(--color-bg-tertiary);
                border-left: 3px solid var(--color-primary);
            }
            
            .step[data-status="completed"] {
                background: var(--color-success-light);
                border-left: 3px solid var(--color-success);
            }
            
            .step[data-status="error"] {
                background: var(--color-error-light);
                border-left: 3px solid var(--color-error);
            }
            
            .step-icon {
                width: 20px;
                text-align: center;
            }
            
            .step-text {
                flex: 1;
                font-size: var(--font-size-sm);
            }
            
            .step-status {
                font-size: var(--font-size-xs);
                padding: 2px 6px;
                border-radius: var(--border-radius-sm);
                text-transform: uppercase;
                font-weight: var(--font-weight-medium);
            }
            
            .step-status[data-status="pending"] {
                background: var(--color-bg-tertiary);
                color: var(--color-text-tertiary);
            }
            
            .step-status[data-status="active"] {
                background: var(--color-primary-light);
                color: var(--color-primary);
                animation: pulse 2s infinite;
            }
            
            .step-status[data-status="completed"] {
                background: var(--color-success-light);
                color: var(--color-success);
            }
            
            .step-status[data-status="error"] {
                background: var(--color-error-light);
                color: var(--color-error);
            }
            
            .processing-info {
                background: var(--color-bg-secondary);
                border-radius: var(--border-radius-md);
                padding: var(--spacing-md);
                border: 1px solid var(--color-border-light);
            }
            
            .info-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: var(--spacing-xs) 0;
                border-bottom: 1px solid var(--color-border-light);
                font-size: var(--font-size-sm);
            }
            
            .info-item:last-child {
                border-bottom: none;
            }
        </style>
    `;
}

function renderGeneralMapSettings(settings) {
    return `
        <div class="card general-settings">
            <div class="card-header">
                <h3 class="card-title">General Map Settings</h3>
                <div class="card-actions">
                    <button class="btn btn-sm btn-primary" onclick="saveGeneralSettings()">
                        Save Changes
                    </button>
                </div>
            </div>
            <div class="card-body">
                <div class="settings-grid">
                    <div class="form-group">
                        <label class="form-label">Default Center Latitude</label>
                        <input type="number" id="default-lat" class="form-input" step="0.000001" 
                               value="${settings.center_lat || ''}" placeholder="Enter latitude">
                        <div class="form-help">Default map center latitude (decimal degrees)</div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Default Center Longitude</label>
                        <input type="number" id="default-lng" class="form-input" step="0.000001" 
                               value="${settings.center_lng || ''}" placeholder="Enter longitude">
                        <div class="form-help">Default map center longitude (decimal degrees)</div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Default Zoom Level</label>
                        <input type="number" id="default-zoom" class="form-input" min="1" max="22" 
                               value="${settings.default_zoom || 6}" placeholder="6">
                        <div class="form-help">Default map zoom level (1-22)</div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Maximum Zoom Level</label>
                        <input type="number" id="max-zoom" class="form-input" min="1" max="22" 
                               value="${settings.max_zoom || 18}" placeholder="18">
                        <div class="form-help">Maximum allowed zoom level (1-22)</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function loadMapLayersData(projectId = null) {
    const data = { layers: [], projects: [], currentProject: null, roles: [], generalSettings: {} };
    
    try {
        data.projects = await supabaseClient.getUserProjects();
        
        if (projectId) {
            // Load map layers for this project
            const { data: layers, error: layersError } = await supabaseClient.client
                .from('map_layers')
                .select('*, tile_sets(name, description)')
                .eq('project_id', projectId)
                .eq('is_active', true)
                .order('display_order', { ascending: true });

            if (layersError) {
                logger.error('Failed to load map layers:', layersError);
            } else {
                data.layers = layers || [];
            }

            data.currentProject = await supabaseClient.getProjectById(projectId);
            data.roles = await supabaseClient.getRoles(projectId);
            
            // Load general map settings (PostgREST returns coordinates as GeoJSON)
            const { data: settings, error: settingsError } = await supabaseClient.client
                .from('map_settings')
                .select('*')
                .eq('project_id', projectId)
                .single();

            if (settingsError && settingsError.code !== 'PGRST116') {
                logger.error('Failed to load map settings:', settingsError);
                data.generalSettings = {};
            } else if (settings) {
                // Extract coordinates from GeoJSON format
                const coords = parseGeometry(settings.default_center);
                data.generalSettings = {
                    ...settings,
                    center_lat: coords?.lat,
                    center_lng: coords?.lng
                };
            } else {
                data.generalSettings = {};
            }
        }
    } catch (error) {
        logger.error('Failed to load map layers data:', error);
    }
    
    return data;
}

// Parse PostGIS geometry - handles both string and GeoJSON formats
function parseGeometry(geometry) {
    // Handle GeoJSON format (from REST API)
    if (geometry && typeof geometry === 'object' && geometry.type === 'Point' && geometry.coordinates) {
        const [lng, lat] = geometry.coordinates;
        return { lat: parseFloat(lat), lng: parseFloat(lng) };
    }
    
    // Handle string format (legacy)
    if (typeof geometry === 'string') {
        const coords = geometry.match(/POINT\(([^)]+)\)/);
        if (coords) {
            const [lng, lat] = coords[1].split(' ');
            return { lat: parseFloat(lat), lng: parseFloat(lng) };
        }
    }
    return null;
}

// Parse PostGIS binary geometry - fallback to parseGeometry
function parseGeometryFromBinary(geometry) {
    // Try to parse using the main parseGeometry function
    // which handles both GeoJSON and string formats
    return parseGeometry(geometry);
}

function initializeLayersTable() {
    const columns = [
        {
            key: 'select',
            label: `<input type="checkbox" id="select-all-layers" title="Select All">`,
            readonly: true,
            render: (value, item) => `<input type="checkbox" class="layer-checkbox" data-layer-id="${item.id}">`
        },
        { 
            key: 'name', 
            label: 'Layer Name', 
            type: 'text', 
            required: true 
        },
        { 
            key: 'type', 
            label: 'Type', 
            readonly: true,
            render: (value) => `<span class="layer-type-badge ${value}">${value.toUpperCase()}</span>`
        },
        { 
            key: 'url', 
            label: 'URL', 
            type: 'text',
            render: (value) => value ? `<code style="font-size: 0.8rem;">${value.length > 50 ? value.substring(0, 47) + '...' : value}</code>` : ''
        },
        { 
            key: 'visible_to_roles', 
            label: 'Visible to Roles', 
            readonly: true,
            render: (value, item) => {
                if (!value || !Array.isArray(value) || value.length === 0) {
                    return '<span class="no-roles">All participants</span>';
                }
                return value.map(roleId => {
                    const role = availableRoles.find(r => r.id === roleId);
                    const roleName = role ? role.name : `Role ${roleId.substring(0, 8)}...`;
                    return `<span class="role-badge" data-role-id="${roleId}">${roleName}</span>`;
                }).join(' ');
            }
        },
        { 
            key: 'display_order', 
            label: 'Order', 
            type: 'number',
            render: (value) => value || 0
        },
        { 
            key: 'opacity', 
            label: 'Opacity', 
            readonly: true,
            render: (value) => `${Math.round((value || 1) * 100)}%`
        },
        { 
            key: 'created_at', 
            label: 'Created', 
            readonly: true,
            render: (value) => Utils.DateUtils.relative(value)
        }
    ];

    layersTable = new TableCRUD({
        tableName: 'map_layers',
        columns: columns,
        editMode: 'modal',
        onAdd: handleAddLayer,
        onEdit: handleEditLayer,
        onDelete: handleDeleteLayer,
        onUpdate: () => layersTable.refresh(),
        customActions: [
            {
                key: 'manage-roles',
                label: 'Manage Roles',
                color: '#17a2b8',
                handler: handleManageLayerRoles
            },
            {
                key: 'layer-config',
                label: 'Layer Config',
                color: '#28a745',
                handler: handleLayerConfig
            }
        ],
        customLoadData: async () => {
            const data = await loadMapLayersData(projectId);
            availableRoles = data.roles;
            updateLayerCount(data.layers.length);
            return data.layers;
        }
    });

    layersTable.render('layers-table-container');
    
    setTimeout(() => initializeBulkSelection(), 100);
    setTimeout(setupEventHandlers, 100);
}

function updateLayerCount(count) {
    const countBadge = document.getElementById('layer-count');
    if (countBadge) {
        countBadge.textContent = `${count} layer${count !== 1 ? 's' : ''}`;
    }
}

function setupEventHandlers() {
    const uploadBtn = Utils.DOM.find('#upload-tiles-btn');
    if (uploadBtn) {
        Utils.DOM.on(uploadBtn, 'click', showTileUploadModal);
    }

    const presetBtn = Utils.DOM.find('#add-preset-layer-btn');  
    if (presetBtn) {
        Utils.DOM.on(presetBtn, 'click', showPresetModal);
    }

    // Make global functions available
    window.closeTileUploadModal = closeTileUploadModal;
    window.uploadTileSet = uploadTileSet;
    window.closePresetModal = closePresetModal;
    window.saveGeneralSettings = saveGeneralSettings;
    window.addPresetLayer = addPresetLayer;
}

async function handleAddLayer(data) {
    const selectedProjectId = projectId || supabaseClient.getCurrentProjectId();
    
    if (!selectedProjectId) {
        throw new Error('Project is required');
    }
    
    const layerData = {
        project_id: selectedProjectId,
        name: data.name,
        type: data.type || 'tile',
        url: data.url,
        attribution: data.attribution,
        max_zoom: data.max_zoom ? parseInt(data.max_zoom) : null,
        min_zoom: data.min_zoom ? parseInt(data.min_zoom) : null,
        opacity: data.opacity ? parseFloat(data.opacity) : 1.0,
        display_order: data.display_order ? parseInt(data.display_order) : 0,
        layer_config: data.layer_config || {},
        visible_to_roles: [],
        is_active: true
    };
    
    const { error } = await supabaseClient.client
        .from('map_layers')
        .insert([layerData]);

    if (error) {
        throw new Error(error.message);
    }
}

async function handleEditLayer(id, data) {
    const layerData = {
        name: data.name,
        url: data.url,
        attribution: data.attribution,
        max_zoom: data.max_zoom ? parseInt(data.max_zoom) : null,
        min_zoom: data.min_zoom ? parseInt(data.min_zoom) : null,  
        opacity: data.opacity ? parseFloat(data.opacity) : 1.0,
        display_order: data.display_order ? parseInt(data.display_order) : 0
    };
    
    const { error } = await supabaseClient.client
        .from('map_layers')
        .update(layerData)
        .eq('id', id);

    if (error) {
        throw new Error(error.message);
    }
}

async function handleDeleteLayer(id, layer) {
    if (!confirm(`Are you sure you want to delete the layer "${layer.name}"?`)) {
        return;
    }
    
    const { error } = await supabaseClient.client
        .from('map_layers')
        .update({ is_active: false })
        .eq('id', id);

    if (error) {
        throw new Error(error.message);
    }
}

async function handleManageLayerRoles(layerId, layer) {
    if (!layer) return;
    createLayerRoleModal(layerId, layer);
}

function handleLayerConfig(layerId, layer) {
    createLayerConfigModal(layerId, layer);
}

// Bulk selection functionality (similar to marker categories)
async function initializeBulkSelection() {
    const currentProjectId = projectId || supabaseClient.getCurrentProjectId();
    if (currentProjectId) {
        try {
            if (availableRoles.length === 0) {
                availableRoles = await supabaseClient.getRoles(currentProjectId);
            }
            initializeBulkRoleSelector(currentProjectId);
        } catch (error) {
            logger.error('Failed to load roles:', error);
        }
    }
    
    setupLayerCheckboxListeners();
}

function initializeBulkRoleSelector(currentProjectId) {
    bulkRoleSelector = new EntitySelector('bulk-layer-role-selector', {
        tableName: 'roles',
        projectId: currentProjectId,
        entityName: 'role',
        entityNamePlural: 'roles',
        allowCreation: true,
        allowSelection: true,
        placeholder: 'Select roles to assign to selected layers...',
        label: 'Roles to assign:',
        onSelectionChange: (selectedRoles) => {
            if (selectedRoles.length > 0 && selectedLayerIds.size > 0) {
                handleBulkLayerRoleAssignment(selectedRoles);
            }
        }
    });
}

function setupLayerCheckboxListeners() {
    const selectAllCheckbox = document.getElementById('select-all-layers');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function() {
            const layerCheckboxes = document.querySelectorAll('.layer-checkbox');
            layerCheckboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
                const layerId = checkbox.getAttribute('data-layer-id');
                if (this.checked) {
                    selectedLayerIds.add(layerId);
                } else {
                    selectedLayerIds.delete(layerId);
                }
            });
            updateBulkAssignmentButton();
        });
    }
    
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('layer-checkbox')) {
            const layerId = e.target.getAttribute('data-layer-id');
            if (e.target.checked) {
                selectedLayerIds.add(layerId);
            } else {
                selectedLayerIds.delete(layerId);
                const selectAllCheckbox = document.getElementById('select-all-layers');
                if (selectAllCheckbox) {
                    selectAllCheckbox.checked = false;
                }
            }
            updateBulkAssignmentButton();
        }
    });
}

function updateBulkAssignmentButton() {
    const bulkContainer = document.getElementById('bulk-role-assignment-container');
    const layerCount = document.getElementById('selected-layers-count');
    
    if (bulkContainer && layerCount) {
        if (selectedLayerIds.size > 0) {
            bulkContainer.style.display = 'block';
            layerCount.textContent = `${selectedLayerIds.size} layer${selectedLayerIds.size !== 1 ? 's' : ''} selected`;
            
            if (bulkRoleSelector) {
                bulkRoleSelector.clearSelection();
            }
        } else {
            bulkContainer.style.display = 'none';
        }
    }
}

// Modal functions
function showTileUploadModal() {
    const modal = Utils.DOM.find('#tile-upload-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeTileUploadModal() {
    const modal = Utils.DOM.find('#tile-upload-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Reset form
    document.getElementById('tile-set-name').value = '';
    document.getElementById('tile-set-description').value = '';
    document.getElementById('tiles-zip-input').value = '';
    document.getElementById('tile-format-select').value = 'png';
    
    const progressContainer = document.getElementById('upload-progress-container');
    if (progressContainer) {
        progressContainer.style.display = 'none';
    }
}

function showPresetModal() {
    const modal = Utils.DOM.find('#preset-layer-modal');
    if (modal) {
        modal.style.display = 'flex';
        renderPresetGrid();
    }
}

function closePresetModal() {
    const modal = Utils.DOM.find('#preset-layer-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function renderPresetGrid() {
    const grid = document.getElementById('preset-layers-grid');
    if (!grid) return;

    const presetHTML = [];
    
    // Render base layers
    presetHTML.push('<h4 style="grid-column: 1 / -1; margin: 0; padding: var(--spacing-sm) 0; border-bottom: 1px solid var(--color-border-light);">Base Layers</h4>');
    Object.entries(LAYER_PRESETS.baseLayers).forEach(([key, preset]) => {
        presetHTML.push(`
            <div class="preset-card" onclick="addPresetLayer('baseLayers', '${key}')">
                <div class="preset-category">Base Layer</div>
                <div class="preset-name">${preset.name}</div>
                <div class="preset-attribution">${preset.attribution}</div>
            </div>
        `);
    });

    // Render overlay layers
    presetHTML.push('<h4 style="grid-column: 1 / -1; margin: var(--spacing-lg) 0 0; padding: var(--spacing-sm) 0; border-bottom: 1px solid var(--color-border-light);">Overlay Layers</h4>');
    Object.entries(LAYER_PRESETS.overlays).forEach(([key, preset]) => {
        presetHTML.push(`
            <div class="preset-card" onclick="addPresetLayer('overlays', '${key}')">
                <div class="preset-category">Overlay</div>
                <div class="preset-name">${preset.name}</div>
                <div class="preset-attribution">${preset.attribution}</div>
            </div>
        `);
    });

    grid.innerHTML = presetHTML.join('');
}

async function addPresetLayer(category, presetKey) {
    const preset = LAYER_PRESETS[category][presetKey];
    if (!preset) return;

    try {
        await handleAddLayer({
            name: preset.name,
            type: preset.type,
            url: preset.url,
            attribution: preset.attribution,
            display_order: 0,
            opacity: category === 'overlays' ? 0.7 : 1.0
        });

        closePresetModal();
        layersTable.refresh();

        if (window.app && window.app.showNotification) {
            window.app.showNotification('success', 'Layer Added', `${preset.name} has been added to your map layers`);
        }
    } catch (error) {
        logger.error('Failed to add preset layer:', error);
        if (window.app && window.app.showNotification) {
            window.app.showNotification('error', 'Failed to Add Layer', error.message);
        } else {
            alert('Failed to add layer: ' + error.message);
        }
    }
}

async function saveGeneralSettings() {
    const selectedProjectId = projectId || supabaseClient.getCurrentProjectId();
    if (!selectedProjectId) {
        alert('Project context is required');
        return;
    }

    const lat = parseFloat(document.getElementById('default-lat').value);
    const lng = parseFloat(document.getElementById('default-lng').value);
    const defaultZoom = parseInt(document.getElementById('default-zoom').value) || 6;
    const maxZoom = parseInt(document.getElementById('max-zoom').value) || 18;

    // Validate coordinates
    if (isNaN(lat) || isNaN(lng)) {
        alert('Please enter valid latitude and longitude coordinates');
        return;
    }

    if (lat < -90 || lat > 90) {
        alert('Latitude must be between -90 and 90 degrees');
        return;
    }

    if (lng < -180 || lng > 180) {
        alert('Longitude must be between -180 and 180 degrees');
        return;
    }

    try {
        // Check if settings already exist for this project
        const { data: existing } = await supabaseClient.client
            .from('map_settings')
            .select('id')
            .eq('project_id', selectedProjectId)
            .single();

        // Update data with validated coordinates
        const updateData = {
            default_zoom: defaultZoom,
            max_zoom: maxZoom,
            default_center: `POINT(${lng} ${lat})`
        };

        if (existing) {
            // Update existing settings
            const { error } = await supabaseClient.client
                .from('map_settings')
                .update(updateData)
                .eq('project_id', selectedProjectId);

            if (error) throw error;
        } else {
            // Create new settings
            const { error } = await supabaseClient.client
                .from('map_settings')
                .insert([{
                    project_id: selectedProjectId,
                    name: 'Default Map Settings',
                    tile_url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    attribution: '© OpenStreetMap contributors',
                    default_zoom: defaultZoom,
                    max_zoom: maxZoom,
                    min_zoom: 1,
                    default_center: `POINT(${lng} ${lat})`,
                    layer_config: {},
                    is_default: true,
                    is_active: true
                }]);

            if (error) throw error;
        }

        if (window.app && window.app.showNotification) {
            window.app.showNotification('success', 'Settings Saved', 'Map settings have been saved successfully.');
        } else {
            alert('Settings saved successfully');
        }
    } catch (error) {
        logger.error('Failed to save general settings:', error);
        if (window.app && window.app.showNotification) {
            window.app.showNotification('error', 'Save Failed', error.message);
        } else {
            alert('Failed to save settings: ' + error.message);
        }
    }
}

async function uploadTileSet() {
    const nameInput = document.getElementById('tile-set-name');
    const descInput = document.getElementById('tile-set-description'); 
    const zipInput = document.getElementById('tiles-zip-input');
    const formatSelect = document.getElementById('tile-format-select');
    
    if (!nameInput.value.trim()) {
        alert('Please enter a tile set name');
        return;
    }
    
    if (!zipInput.files || !zipInput.files[0]) {
        alert('Please select a ZIP file');
        return;
    }

    const selectedProjectId = projectId || supabaseClient.getCurrentProjectId();
    if (!selectedProjectId) {
        alert('Project context is required');
        return;
    }

    // Initialize progress tracking
    const startTime = Date.now();
    const file = zipInput.files[0];
    
    // Sanitize filename to remove special characters
    const sanitizedName = nameInput.value.trim()
        .replace(/[^a-zA-Z0-9_-]/g, '_')  // Replace special chars with underscore
        .replace(/_+/g, '_')              // Replace multiple underscores with single
        .replace(/^_|_$/g, '');           // Remove leading/trailing underscores
    
    const fileName = `${selectedProjectId}/${sanitizedName}_${Date.now()}.zip`;
    
    // Show enhanced progress
    initializeProgressTracking(file.size);
    
    try {
        // Step 1: Upload ZIP file
        updateProgress(10, 'upload', 'active', `Uploading ${formatFileSize(file.size)} ZIP file...`, '📁');
        updateStep('upload', 'active', 'uploading');
        
        // Try upload with explicit options for larger files
        const { data: storageData, error: storageError } = await supabaseClient.client.storage
            .from('tile-uploads')
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: true,
                contentType: 'application/zip'
            });

        if (storageError) throw storageError;
        
        // Step 2: Create tile set record
        updateProgress(30, 'create', 'active', 'Creating tile set record...', '📝');
        updateStep('upload', 'completed', 'uploaded');
        updateStep('create', 'active', 'creating');
        
        const tileSetData = {
            project_id: selectedProjectId,
            name: nameInput.value.trim(),
            description: descInput.value.trim() || null,
            storage_bucket: 'tile-uploads',
            storage_path: storageData.path,
            tile_format: formatSelect.value,
            visible_to_roles: [],
            bounds: null,
            min_zoom: null,
            max_zoom: null
        };

        const { data: tileSet, error: tileSetError } = await supabaseClient.client
            .from('tile_sets')
            .insert([tileSetData])
            .select()
            .single();

        if (tileSetError) throw tileSetError;
        
        // Step 3: Start backend processing
        updateProgress(50, 'process', 'active', 'Starting tile processing...', '⚙️');
        updateStep('create', 'completed', 'created');
        updateStep('process', 'active', 'starting');
        
        await triggerTileProcessing(tileSet.id, 'tile-uploads', storageData.path, startTime);
        
        // Processing is now handled by the backend, close modal with success
        setTimeout(() => {
            closeTileUploadModal();
            layersTable.refresh();
            
            if (window.app && window.app.showNotification) {
                window.app.showNotification('success', 'Processing Started', 
                    `Tile set "${tileSetData.name}" is being processed. You'll be notified when complete.`);
            }
        }, 1500);

    } catch (error) {
        logger.error('Failed to upload tile set:', error);
        updateProgress(0, 'error', 'error', `Upload failed: ${error.message}`, '❌');
        
        // Mark current step as error
        const activeStep = document.querySelector('.step[data-status="active"]');
        if (activeStep) {
            const stepName = activeStep.getAttribute('data-step');
            updateStep(stepName, 'error', 'failed');
        }
        
        setTimeout(() => {
            resetProgressTracking();
        }, 5000);

        if (window.app && window.app.showNotification) {
            window.app.showNotification('error', 'Upload Failed', error.message);
        }
    }
}

// Role management functions (similar to marker categories)
async function createLayerRoleModal(layerId, layer) {
    const modalId = `layer-role-modal-${layerId}`;
    const modalHTML = `
        <div id="${modalId}" class="modal-overlay" style="display: flex; z-index: var(--z-modal-backdrop);">
            <div class="modal" style="max-width: 500px; width: 90%;">
                <div class="modal-header">
                    <h3 class="modal-title">Manage Visibility for "${layer.name}"</h3>
                    <button class="modal-close layer-modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <p class="form-help" style="margin-bottom: var(--spacing-md);">
                        Control which participant roles can see this map layer. If no roles are selected, all participants will see this layer.
                    </p>
                    <div id="layer-role-selector-${layerId}"></div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary layer-modal-close">Close</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    const currentProjectId = projectId || supabaseClient.getCurrentProjectId();
    const layerRoleSelector = new EntitySelector(`layer-role-selector-${layerId}`, {
        tableName: 'roles',
        projectId: currentProjectId,
        entityName: 'role',
        entityNamePlural: 'roles',
        allowCreation: true,
        allowSelection: true,
        placeholder: 'Select roles that can see this map layer...',
        label: 'Visible to roles:',
        onSelectionChange: async (selectedRoles) => {
            await handleLayerRoleUpdate(layerId, layer, selectedRoles);
        }
    });
    
    // Set current roles as selected
    let currentRoles = [];
    if (layer.visible_to_roles && Array.isArray(layer.visible_to_roles) && layer.visible_to_roles.length > 0) {
        try {
            const roles = await supabaseClient.getRoles(currentProjectId);
            currentRoles = layer.visible_to_roles.map(roleId => {
                const role = roles.find(r => r.id === roleId);
                return role || { id: roleId, name: `Role ${roleId.substring(0, 8)}...` };
            });
        } catch (error) {
            logger.error('Failed to load role names:', error);
        }
    }
    
    if (currentRoles.length > 0) {
        setTimeout(() => {
            layerRoleSelector.setSelectedEntities(currentRoles);
        }, 100);
    }
    
    // Add close event listeners
    const modal = document.getElementById(modalId);
    const closeButtons = modal.querySelectorAll('.layer-modal-close');
    closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            modal.remove();
        });
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

async function handleLayerRoleUpdate(layerId, layer, selectedRoles) {
    try {
        const selectedRoleIds = selectedRoles.map(role => role.id);
        
        const { error } = await supabaseClient.client
            .from('map_layers')
            .update({ visible_to_roles: selectedRoleIds })
            .eq('id', layerId);

        if (error) throw error;
        
        if (layersTable) {
            await layersTable.refresh();
        }
        
        const roleNames = selectedRoles.map(role => role.name).join(', ');
        const message = selectedRoles.length > 0 
            ? `Visible to roles: ${roleNames}` 
            : 'Visible to all participants';
            
        if (window.app && window.app.showNotification) {
            window.app.showNotification('success', 'Visibility Updated', `${layer.name} - ${message}`);
        }
        
    } catch (error) {
        logger.error('Failed to update layer visibility:', error);
        if (window.app && window.app.showNotification) {
            window.app.showNotification('error', 'Update Failed', error.message);
        }
    }
}

async function handleBulkLayerRoleAssignment(selectedRoles) {
    if (!selectedRoles || selectedRoles.length === 0) return;
    
    const selectedRoleIds = selectedRoles.map(role => role.id);
    const selectedRoleNames = selectedRoles.map(role => role.name);
    
    try {
        const layerIds = Array.from(selectedLayerIds);
        
        for (const layerId of layerIds) {
            const { data: currentLayer, error: fetchError } = await supabaseClient.client
                .from('map_layers')
                .select('visible_to_roles')
                .eq('id', layerId)
                .single();
                
            if (fetchError) throw fetchError;
            
            const existingRoles = currentLayer?.visible_to_roles || [];
            const mergedRoles = [...new Set([...existingRoles, ...selectedRoleIds])];
            
            const { error: updateError } = await supabaseClient.client
                .from('map_layers')
                .update({ visible_to_roles: mergedRoles })
                .eq('id', layerId);
                
            if (updateError) throw updateError;
        }
        
        if (bulkRoleSelector) {
            bulkRoleSelector.clearSelection();
        }
        
        if (layersTable) {
            await layersTable.refresh();
            setTimeout(() => setupLayerCheckboxListeners(), 100);
        }
        
        const roleText = selectedRoleNames.length > 1 ? `roles: ${selectedRoleNames.join(', ')}` : `role: ${selectedRoleNames[0]}`;
        
        if (window.app && window.app.showNotification) {
            window.app.showNotification('success', 'Visibility Updated', `Successfully assigned ${roleText} to ${layerIds.length} layer${layerIds.length !== 1 ? 's' : ''}`);
        }
        
    } catch (error) {
        logger.error('Failed to assign roles to layers:', error);
        if (window.app && window.app.showNotification) {
            window.app.showNotification('error', 'Assignment Failed', error.message);
        }
    }
}

// Layer Configuration Modal
async function createLayerConfigModal(layerId, layer) {
    const modalId = `layer-config-modal-${layerId}`;
    const modalHTML = `
        <div id="${modalId}" class="modal-overlay" style="display: flex; z-index: var(--z-modal-backdrop);">
            <div class="modal" style="max-width: 700px; width: 90%;">
                <div class="modal-header">
                    <h3 class="modal-title">Layer Configuration: "${layer.name}"</h3>
                    <button class="modal-close layer-config-modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="layer-config-tabs">
                        <button class="tab-button active" data-tab="basic">Basic Settings</button>
                        <button class="tab-button" data-tab="styling">Styling</button>
                        <button class="tab-button" data-tab="advanced">Advanced</button>
                    </div>
                    
                    <!-- Basic Settings Tab -->
                    <div id="basic-tab" class="tab-content active">
                        <div class="form-group">
                            <label class="form-label">Layer Name</label>
                            <input type="text" id="config-layer-name" class="form-input" value="${layer.name || ''}" placeholder="Enter layer name">
                            <div class="form-help">Display name for this layer</div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Layer URL</label>
                            <input type="text" id="config-layer-url" class="form-input" value="${layer.url || ''}" placeholder="https://example.com/{z}/{x}/{y}.png">
                            <div class="form-help">Tile server URL template</div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Attribution</label>
                            <input type="text" id="config-layer-attribution" class="form-input" value="${layer.attribution || ''}" placeholder="© Map data provider">
                            <div class="form-help">Attribution text for this layer</div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Min Zoom</label>
                                <input type="number" id="config-min-zoom" class="form-input" value="${layer.min_zoom || 1}" min="1" max="22">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Max Zoom</label>
                                <input type="number" id="config-max-zoom" class="form-input" value="${layer.max_zoom || 18}" min="1" max="22">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Display Order</label>
                            <input type="number" id="config-display-order" class="form-input" value="${layer.display_order || 0}" min="0">
                            <div class="form-help">Lower numbers appear first in layer list</div>
                        </div>
                    </div>
                    
                    <!-- Styling Tab -->
                    <div id="styling-tab" class="tab-content">
                        <div class="form-group">
                            <label class="form-label">Opacity</label>
                            <div class="opacity-slider-container">
                                <input type="range" id="config-opacity-slider" class="opacity-slider" min="0" max="1" step="0.1" value="${layer.opacity || 1}">
                                <span id="config-opacity-value" class="opacity-value">${Math.round((layer.opacity || 1) * 100)}%</span>
                            </div>
                            <div class="form-help">Layer transparency (0% = fully transparent, 100% = fully opaque)</div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Blend Mode</label>
                            <select id="config-blend-mode" class="form-input">
                                <option value="normal">Normal</option>
                                <option value="multiply">Multiply</option>
                                <option value="screen">Screen</option>
                                <option value="overlay">Overlay</option>
                                <option value="soft-light">Soft Light</option>
                                <option value="hard-light">Hard Light</option>
                                <option value="color-dodge">Color Dodge</option>
                                <option value="color-burn">Color Burn</option>
                                <option value="darken">Darken</option>
                                <option value="lighten">Lighten</option>
                                <option value="difference">Difference</option>
                                <option value="exclusion">Exclusion</option>
                            </select>
                            <div class="form-help">How this layer blends with layers below</div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Saturation</label>
                            <div class="filter-slider-container">
                                <input type="range" id="config-saturation" class="filter-slider" min="0" max="200" step="10" value="100">
                                <span id="config-saturation-value" class="filter-value">100%</span>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Brightness</label>
                            <div class="filter-slider-container">
                                <input type="range" id="config-brightness" class="filter-slider" min="0" max="200" step="10" value="100">
                                <span id="config-brightness-value" class="filter-value">100%</span>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Contrast</label>
                            <div class="filter-slider-container">
                                <input type="range" id="config-contrast" class="filter-slider" min="0" max="200" step="10" value="100">
                                <span id="config-contrast-value" class="filter-value">100%</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Advanced Tab -->
                    <div id="advanced-tab" class="tab-content">
                        <div class="form-group">
                            <label class="form-label">Layer Type</label>
                            <select id="config-layer-type" class="form-input">
                                <option value="tile" ${layer.type === 'tile' ? 'selected' : ''}>Tile Layer</option>
                                <option value="wms" ${layer.type === 'wms' ? 'selected' : ''}>WMS Layer</option>
                                <option value="custom" ${layer.type === 'custom' ? 'selected' : ''}>Custom Tiles</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Subdomains</label>
                            <input type="text" id="config-subdomains" class="form-input" placeholder="a,b,c">
                            <div class="form-help">Comma-separated list of subdomains for load balancing</div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Cross-Origin</label>
                            <select id="config-crossorigin" class="form-input">
                                <option value="">Default</option>
                                <option value="anonymous">Anonymous</option>
                                <option value="use-credentials">Use Credentials</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Error Tile URL</label>
                            <input type="text" id="config-error-tile-url" class="form-input" placeholder="https://example.com/error.png">
                            <div class="form-help">URL to display when tiles fail to load</div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Custom Layer Configuration (JSON)</label>
                            <textarea id="config-layer-json" class="form-input" rows="6" placeholder='{"customProperty": "value"}'></textarea>
                            <div class="form-help">Advanced configuration in JSON format</div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary layer-config-modal-close">Cancel</button>
                    <button class="btn btn-primary" id="save-layer-config-btn">Save Configuration</button>
                </div>
            </div>
        </div>
        
        <style>
            .layer-config-tabs {
                display: flex;
                border-bottom: 1px solid var(--color-border-light);
                margin-bottom: var(--spacing-lg);
            }
            
            .tab-button {
                background: none;
                border: none;
                padding: var(--spacing-sm) var(--spacing-md);
                cursor: pointer;
                border-bottom: 2px solid transparent;
                transition: all var(--transition-fast);
                color: var(--color-text-secondary);
                font-weight: var(--font-weight-medium);
            }
            
            .tab-button:hover {
                color: var(--color-text-primary);
            }
            
            .tab-button.active {
                color: var(--color-primary);
                border-bottom-color: var(--color-primary);
            }
            
            .tab-content {
                display: none;
            }
            
            .tab-content.active {
                display: block;
            }
            
            .form-row {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: var(--spacing-md);
            }
            
            .opacity-slider-container,
            .filter-slider-container {
                display: flex;
                align-items: center;
                gap: var(--spacing-sm);
                margin-top: var(--spacing-xs);
            }
            
            .opacity-slider,
            .filter-slider {
                flex: 1;
                height: 6px;
                background: var(--color-bg-tertiary);
                border-radius: var(--border-radius-full);
                outline: none;
                appearance: none;
            }
            
            .opacity-slider::-webkit-slider-thumb,
            .filter-slider::-webkit-slider-thumb {
                appearance: none;
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background: var(--color-primary);
                cursor: pointer;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                transition: all var(--transition-fast);
            }
            
            .opacity-slider::-webkit-slider-thumb:hover,
            .filter-slider::-webkit-slider-thumb:hover {
                transform: scale(1.1);
                box-shadow: 0 4px 8px rgba(0,0,0,0.15);
            }
            
            .opacity-value,
            .filter-value {
                min-width: 50px;
                text-align: center;
                font-weight: var(--font-weight-medium);
                color: var(--color-text-secondary);
                font-size: var(--font-size-sm);
            }
        </style>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Initialize the modal
    initializeLayerConfigModal(modalId, layerId, layer);
}

function initializeLayerConfigModal(modalId, layerId, layer) {
    const modal = document.getElementById(modalId);
    
    // Tab switching functionality
    const tabButtons = modal.querySelectorAll('.tab-button');
    const tabContents = modal.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            
            // Update active tab button
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Update active tab content
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `${targetTab}-tab`) {
                    content.classList.add('active');
                }
            });
        });
    });
    
    // Initialize current layer configuration values
    initializeLayerConfigValues(modal, layer);
    
    // Slider event listeners
    setupSliderEventListeners(modal);
    
    // Save button event listener
    const saveBtn = modal.querySelector('#save-layer-config-btn');
    saveBtn.addEventListener('click', () => saveLayerConfiguration(layerId, layer, modal));
    
    // Close event listeners
    const closeButtons = modal.querySelectorAll('.layer-config-modal-close');
    closeButtons.forEach(btn => {
        btn.addEventListener('click', () => modal.remove());
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

function initializeLayerConfigValues(modal, layer) {
    // Parse existing layer_config if it exists
    let layerConfig = {};
    try {
        layerConfig = layer.layer_config ? JSON.parse(JSON.stringify(layer.layer_config)) : {};
    } catch (error) {
        logger.warn('Failed to parse layer config:', error);
        layerConfig = {};
    }
    
    // Set styling values
    if (layerConfig.blendMode) {
        const blendModeSelect = modal.querySelector('#config-blend-mode');
        blendModeSelect.value = layerConfig.blendMode;
    }
    
    // Set filter values
    const saturation = layerConfig.saturation || 100;
    const brightness = layerConfig.brightness || 100;
    const contrast = layerConfig.contrast || 100;
    
    modal.querySelector('#config-saturation').value = saturation;
    modal.querySelector('#config-saturation-value').textContent = saturation + '%';
    modal.querySelector('#config-brightness').value = brightness;
    modal.querySelector('#config-brightness-value').textContent = brightness + '%';
    modal.querySelector('#config-contrast').value = contrast;
    modal.querySelector('#config-contrast-value').textContent = contrast + '%';
    
    // Set advanced values
    if (layerConfig.subdomains) {
        modal.querySelector('#config-subdomains').value = layerConfig.subdomains.join(',');
    }
    
    if (layerConfig.crossOrigin) {
        modal.querySelector('#config-crossorigin').value = layerConfig.crossOrigin;
    }
    
    if (layerConfig.errorTileUrl) {
        modal.querySelector('#config-error-tile-url').value = layerConfig.errorTileUrl;
    }
    
    // Set custom JSON
    modal.querySelector('#config-layer-json').value = JSON.stringify(layerConfig, null, 2);
}

function setupSliderEventListeners(modal) {
    // Opacity slider
    const opacitySlider = modal.querySelector('#config-opacity-slider');
    const opacityValue = modal.querySelector('#config-opacity-value');
    
    opacitySlider.addEventListener('input', (e) => {
        const value = Math.round(parseFloat(e.target.value) * 100);
        opacityValue.textContent = value + '%';
    });
    
    // Filter sliders
    const filterSliders = modal.querySelectorAll('.filter-slider');
    filterSliders.forEach(slider => {
        slider.addEventListener('input', (e) => {
            const valueElement = modal.querySelector(`#${slider.id}-value`);
            if (valueElement) {
                valueElement.textContent = e.target.value + '%';
            }
        });
    });
}

async function saveLayerConfiguration(layerId, layer, modal) {
    try {
        // Collect basic settings
        const basicData = {
            name: modal.querySelector('#config-layer-name').value,
            url: modal.querySelector('#config-layer-url').value,
            attribution: modal.querySelector('#config-layer-attribution').value,
            min_zoom: parseInt(modal.querySelector('#config-min-zoom').value) || null,
            max_zoom: parseInt(modal.querySelector('#config-max-zoom').value) || null,
            display_order: parseInt(modal.querySelector('#config-display-order').value) || 0,
            opacity: parseFloat(modal.querySelector('#config-opacity-slider').value),
            type: modal.querySelector('#config-layer-type').value
        };
        
        // Collect styling settings
        const layerConfig = {
            blendMode: modal.querySelector('#config-blend-mode').value,
            saturation: parseInt(modal.querySelector('#config-saturation').value),
            brightness: parseInt(modal.querySelector('#config-brightness').value),
            contrast: parseInt(modal.querySelector('#config-contrast').value)
        };
        
        // Collect advanced settings
        const subdomainsValue = modal.querySelector('#config-subdomains').value.trim();
        if (subdomainsValue) {
            layerConfig.subdomains = subdomainsValue.split(',').map(s => s.trim()).filter(s => s);
        }
        
        const crossOriginValue = modal.querySelector('#config-crossorigin').value;
        if (crossOriginValue) {
            layerConfig.crossOrigin = crossOriginValue;
        }
        
        const errorTileUrl = modal.querySelector('#config-error-tile-url').value.trim();
        if (errorTileUrl) {
            layerConfig.errorTileUrl = errorTileUrl;
        }
        
        // Try to parse custom JSON and merge
        const customJsonValue = modal.querySelector('#config-layer-json').value.trim();
        if (customJsonValue) {
            try {
                const customConfig = JSON.parse(customJsonValue);
                Object.assign(layerConfig, customConfig);
            } catch (jsonError) {
                throw new Error('Invalid JSON in custom configuration: ' + jsonError.message);
            }
        }
        
        // Validate required fields
        if (!basicData.name.trim()) {
            throw new Error('Layer name is required');
        }
        
        if (!basicData.url.trim()) {
            throw new Error('Layer URL is required');
        }
        
        // Update the layer in the database
        const updateData = {
            ...basicData,
            layer_config: layerConfig
        };
        
        const { error } = await supabaseClient.client
            .from('map_layers')
            .update(updateData)
            .eq('id', layerId);

        if (error) throw error;
        
        // Close modal and refresh table
        modal.remove();
        
        if (layersTable) {
            await layersTable.refresh();
        }
        
        if (window.app && window.app.showNotification) {
            window.app.showNotification('success', 'Configuration Saved', `Layer "${basicData.name}" configuration has been updated successfully.`);
        } else {
            alert('Layer configuration saved successfully');
        }
        
    } catch (error) {
        logger.error('Failed to save layer configuration:', error);
        if (window.app && window.app.showNotification) {
            window.app.showNotification('error', 'Save Failed', error.message);
        } else {
            alert('Failed to save configuration: ' + error.message);
        }
    }
}

// Tile Processing Edge Function Integration
const SUPABASE_URL = 'http://192.168.1.91:8000';
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/tile-processor`;

/**
 * Trigger tile processing via Supabase Edge Function
 */
async function triggerTileProcessing(tileSetId, sourceBucket, sourceFilePath, startTime) {
    try {
        logger.log('Triggering tile processing via Edge Function for:', { tileSetId, sourceBucket, sourceFilePath });
        
        // Get current user's API key for authentication
        const apiKey = supabaseClient.supabaseKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
        
        const response = await fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'apikey': apiKey
            },
            body: JSON.stringify({
                tileSetId: tileSetId,
                sourceBucket: sourceBucket,
                sourceFilePath: sourceFilePath
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Edge Function processing failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Edge Function processing failed');
        }
        
        // Update progress to show Edge Function processing started
        updateProgress(70, 'process', 'active', 'Edge Function processing started successfully!', '⚙️');
        updateStep('process', 'completed', 'started');
        updateStep('organize', 'active', 'processing');
        
        // Update processing time
        updateProcessingTime(startTime);
        
        logger.log('Tile processing started successfully via Edge Function:', result);
        
        // Start polling for status updates using Supabase directly
        pollTileProcessingStatusFromDatabase(tileSetId, startTime, 10);
        
    } catch (error) {
        logger.error('Failed to trigger tile processing via Edge Function:', error);
        throw error;
    }
}

/**
 * Poll tile processing status directly from database
 */
async function pollTileProcessingStatusFromDatabase(tileSetId, startTime, maxMinutes = 10) {
    const maxAttempts = maxMinutes * 4; // Poll every 15 seconds
    let attempts = 0;
    let lastStatus = '';
    
    const pollInterval = setInterval(async () => {
        attempts++;
        updateProcessingTime(startTime);
        
        try {
            // Query tile set status directly from database
            const { data: tileSetData, error } = await supabaseClient.client
                .from('tile_sets')
                .select('status, tile_count, bounds, min_zoom, max_zoom, error_message')
                .eq('id', tileSetId)
                .single();
            
            if (error) {
                logger.warn('Failed to get processing status from database:', error);
                return;
            }
            
            logger.debug('Processing status from database:', tileSetData);
            
            // Update progress based on status
            if (tileSetData.status !== lastStatus) {
                lastStatus = tileSetData.status;
                
                switch (tileSetData.status) {
                    case 'processing':
                        updateProgress(85, 'organize', 'active', 'Processing tiles via Edge Function...', '⚙️');
                        updateStep('organize', 'active', 'processing');
                        break;
                        
                    case 'completed':
                        clearInterval(pollInterval);
                        updateProgress(100, 'layer', 'completed', 'Tile processing completed successfully!', '✅');
                        updateStep('organize', 'completed', 'organized');
                        updateStep('layer', 'completed', 'created');
                        
                        // Update processing info
                        if (tileSetData.tile_count) {
                            updateProcessingInfo(tileSetData.tile_count, tileSetData.min_zoom, tileSetData.max_zoom);
                        }
                        
                        // Refresh the layers table
                        if (layersTable) {
                            layersTable.refresh();
                        }
                        
                        if (window.app && window.app.showNotification) {
                            window.app.showNotification('success', 'Tiles Processed Successfully', 
                                `${tileSetData.tile_count || 0} tiles processed and map layer created via Edge Function.`);
                        }
                        break;
                        
                    case 'failed':
                        clearInterval(pollInterval);
                        updateProgress(0, 'error', 'error', `Tile processing failed: ${tileSetData.error_message || 'Unknown error'}`, '❌');
                        
                        // Mark current active step as error
                        const activeStep = document.querySelector('.step[data-status="active"]');
                        if (activeStep) {
                            const stepName = activeStep.getAttribute('data-step');
                            updateStep(stepName, 'error', 'failed');
                        }
                        
                        if (window.app && window.app.showNotification) {
                            window.app.showNotification('error', 'Tile Processing Failed', 
                                tileSetData.error_message || 'There was an error processing your tiles. Please check the file format and try again.');
                        }
                        break;
                }
            }
            
            // Timeout check
            if (attempts >= maxAttempts) {
                clearInterval(pollInterval);
                
                updateProgress(75, 'organize', 'active', 'Processing is taking longer than expected...', '⏳');
                
                logger.warn('Tile processing status polling timed out after', maxMinutes, 'minutes');
                
                if (window.app && window.app.showNotification) {
                    window.app.showNotification('warning', 'Processing Taking Longer', 
                        'Tile processing is taking longer than expected. Please check back later.');
                }
            }
            
        } catch (error) {
            logger.error('Error polling tile processing status from database:', error);
            
            if (attempts >= maxAttempts) {
                clearInterval(pollInterval);
                updateProgress(0, 'error', 'error', 'Failed to check processing status', '❌');
            }
        }
    }, 15000); // Poll every 15 seconds
}

/**
 * Get tile processing service info from Edge Function
 */
async function getTileProcessingInfo() {
    try {
        // Get current user's API key for authentication
        const apiKey = supabaseClient.supabaseKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
        
        const response = await fetch(EDGE_FUNCTION_URL, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'apikey': apiKey
            }
        });
        
        if (response.ok) {
            const healthData = await response.json();
            logger.log('Edge Function health check:', healthData);
            
            // Return processing info based on Edge Function capabilities
            return {
                service: healthData.service || 'tile-processor',
                status: healthData.status || 'unknown',
                maxFileSize: '500MB',
                maxTilesPerZip: 50000,
                supportedFormats: ['png', 'jpg', 'jpeg', 'webp'],
                expectedStructure: 'z/x/y.format (e.g., 12/2048/1024.png)',
                features: healthData.features || ['zip-extraction', 'background-tasks', 'tile-upload']
            };
        }
    } catch (error) {
        logger.warn('Failed to get tile processing info from Edge Function:', error);
    }
    
    // Return default info if Edge Function is not available
    return {
        service: 'tile-processor-edge-function',
        status: 'unknown',
        maxFileSize: '500MB',
        maxTilesPerZip: 50000,
        supportedFormats: ['png', 'jpg', 'jpeg', 'webp'],
        expectedStructure: 'z/x/y.format (e.g., 12/2048/1024.png)',
        features: ['zip-extraction', 'background-tasks', 'tile-upload']
    };
}

// Enhanced Progress Tracking Functions

/**
 * Initialize progress tracking UI
 */
function initializeProgressTracking(fileSize) {
    const progressContainer = document.getElementById('upload-progress-container');
    const processingSteps = document.getElementById('processing-steps');
    const processingInfo = document.getElementById('processing-info');
    const uploadButton = document.getElementById('upload-tiles-button');
    
    // Show progress container
    progressContainer.style.display = 'block';
    processingSteps.style.display = 'block';
    processingInfo.style.display = 'block';
    
    // Disable upload button
    uploadButton.disabled = true;
    uploadButton.textContent = 'Processing...';
    
    // Reset all steps to pending
    resetAllSteps();
    
    // Initialize progress info
    document.getElementById('processing-time').textContent = '0s';
    
    logger.log('Progress tracking initialized for file size:', formatFileSize(fileSize));
}

/**
 * Update progress bar and status
 */
function updateProgress(percentage, currentStep, status, message, icon) {
    const progressFill = document.getElementById('upload-progress-fill');
    const progressPercentage = document.getElementById('upload-progress-percentage');
    const statusIcon = document.getElementById('upload-status-icon');
    const progressText = document.getElementById('upload-progress-text');
    
    if (progressFill) progressFill.style.width = `${percentage}%`;
    if (progressPercentage) progressPercentage.textContent = `${percentage}%`;
    if (statusIcon) statusIcon.textContent = icon;
    if (progressText) progressText.textContent = message;
    
    logger.debug(`Progress updated: ${percentage}% - ${message}`);
}

/**
 * Update individual step status
 */
function updateStep(stepName, status, statusText) {
    const step = document.querySelector(`[data-step="${stepName}"]`);
    const stepStatusElement = document.getElementById(`step-${stepName}-status`);
    
    if (step) {
        // Remove old status classes
        step.removeAttribute('data-status');
        step.setAttribute('data-status', status);
        
        // Update step status text and styling
        if (stepStatusElement) {
            stepStatusElement.setAttribute('data-status', status);
            stepStatusElement.textContent = statusText;
        }
        
        // Update step icon based on status
        const stepIcon = step.querySelector('.step-icon');
        if (stepIcon && status === 'completed') {
            stepIcon.textContent = '✅';
        } else if (stepIcon && status === 'error') {
            stepIcon.textContent = '❌';
        } else if (stepIcon && status === 'active') {
            stepIcon.textContent = '⏳';
        }
    }
    
    logger.debug(`Step ${stepName} updated to ${status}: ${statusText}`);
}

/**
 * Reset all steps to pending state
 */
function resetAllSteps() {
    const steps = ['upload', 'create', 'process', 'organize', 'layer'];
    steps.forEach(stepName => {
        updateStep(stepName, 'pending', 'pending');
        
        // Reset step icons
        const step = document.querySelector(`[data-step="${stepName}"]`);
        const stepIcon = step?.querySelector('.step-icon');
        if (stepIcon) {
            const originalIcons = {
                'upload': '📁',
                'create': '📝', 
                'process': '⚙️',
                'organize': '📂',
                'layer': '🗺️'
            };
            stepIcon.textContent = originalIcons[stepName];
        }
    });
}

/**
 * Update processing time
 */
function updateProcessingTime(startTime) {
    const processingTimeElement = document.getElementById('processing-time');
    if (processingTimeElement) {
        const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
        processingTimeElement.textContent = `${elapsedTime}s`;
    }
}

/**
 * Update processing info with tile data
 */
function updateProcessingInfo(tilesCount, minZoom, maxZoom) {
    const tilesFoundElement = document.getElementById('tiles-found-count');
    const zoomLevelsElement = document.getElementById('zoom-levels-range');
    
    if (tilesFoundElement && tilesCount !== undefined) {
        tilesFoundElement.textContent = tilesCount.toLocaleString();
    }
    
    if (zoomLevelsElement && minZoom !== undefined && maxZoom !== undefined) {
        zoomLevelsElement.textContent = `${minZoom} - ${maxZoom}`;
    }
}


/**
 * Reset progress tracking to initial state
 */
function resetProgressTracking() {
    const uploadButton = document.getElementById('upload-tiles-button');
    const progressContainer = document.getElementById('upload-progress-container');
    
    uploadButton.disabled = false;
    uploadButton.textContent = 'Upload Tiles';
    progressContainer.style.display = 'none';
    
    // Reset progress bar
    updateProgress(0, '', 'pending', 'Preparing upload...', '⏳');
    resetAllSteps();
}

/**
 * Format file size for display
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}