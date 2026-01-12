/**
 * Map Configuration Importer Component
 * Handles importing of map configurations from various formats
 */

import { supabaseClient } from '../core/supabase.js';
import Utils from '../core/utils.js';
import app from '../core/app.js';
import DebugLogger from '../core/debug-logger.js';

const logger = new DebugLogger('MapConfigImporter');

export class MapConfigImporter {
    constructor() {
        this.supportedFormats = {
            'json': {
                name: 'Map Configuration JSON',
                description: 'Native map configuration format',
                accept: '.json',
                validator: this.validateMapConfigJson.bind(this)
            },
            'geojson': {
                name: 'GeoJSON with Map Config',
                description: 'GeoJSON file with embedded map configuration',
                accept: '.geojson,.json',
                validator: this.validateGeoJsonConfig.bind(this)
            },
            'leaflet': {
                name: 'Leaflet Layer Configuration',
                description: 'Leaflet-compatible layer definitions',
                accept: '.json',
                validator: this.validateLeafletConfig.bind(this)
            }
        };
    }

    render() {
        return `
            <div class="map-config-importer">
                <div class="importer-header">
                    <h4>Import Map Configuration</h4>
                    <p>Import map configurations from various sources and formats</p>
                </div>

                <div class="import-methods">
                    <!-- File Upload -->
                    <div class="import-method">
                        <h5>Upload File</h5>
                        <div class="file-upload-area" id="file-upload-area">
                            <div class="upload-prompt">
                                <div class="upload-icon">📁</div>
                                <p>Drop a configuration file here or click to browse</p>
                                <div class="supported-formats">
                                    Supported: JSON, GeoJSON, Leaflet Config
                                </div>
                            </div>
                            <input type="file" id="config-file-input" accept=".json,.geojson" style="display: none;">
                        </div>
                    </div>

                    <!-- URL Import -->
                    <div class="import-method">
                        <h5>Import from URL</h5>
                        <div class="form-group">
                            <label class="form-label">Configuration URL</label>
                            <input type="url" class="form-input" id="config-url-input" 
                                   placeholder="https://example.com/map-config.json">
                            <div class="form-help">URL to a JSON or GeoJSON configuration file</div>
                        </div>
                        <button type="button" class="btn btn-outline" id="import-from-url-btn">
                            Import from URL
                        </button>
                    </div>

                    <!-- Preset Templates -->
                    <div class="import-method">
                        <h5>Quick Templates</h5>
                        <div class="template-grid">
                            <div class="template-item" data-template="basic-osm">
                                <div class="template-name">Basic OSM</div>
                                <div class="template-desc">Simple OpenStreetMap setup</div>
                            </div>
                            <div class="template-item" data-template="satellite-hybrid">
                                <div class="template-name">Satellite + Streets</div>
                                <div class="template-desc">ESRI satellite with street overlay</div>
                            </div>
                            <div class="template-item" data-template="multi-layer">
                                <div class="template-name">Multi-Layer</div>
                                <div class="template-desc">Multiple base layers with controls</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Import Preview -->
                <div class="import-preview" id="import-preview" style="display: none;">
                    <h5>Import Preview</h5>
                    <div class="preview-content">
                        <div class="preview-details" id="preview-details"></div>
                        <div class="preview-actions">
                            <button type="button" class="btn btn-primary" id="confirm-import-btn">
                                Import Configuration
                            </button>
                            <button type="button" class="btn btn-text" id="cancel-import-btn">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                .map-config-importer {
                    padding: var(--spacing-lg);
                    max-width: 100%;
                    box-sizing: border-box;
                }

                .importer-header {
                    margin-bottom: var(--spacing-lg);
                    text-align: center;
                }

                .importer-header h4 {
                    margin: 0 0 var(--spacing-sm) 0;
                    color: var(--color-text-primary);
                }

                .importer-header p {
                    margin: 0;
                    color: var(--color-text-secondary);
                    font-size: var(--font-size-sm);
                }

                .import-methods {
                    display: grid;
                    gap: var(--spacing-lg);
                }

                .import-method {
                    border: 1px solid var(--color-border-light);
                    border-radius: var(--border-radius-md);
                    padding: var(--spacing-lg);
                }

                .import-method h5 {
                    margin: 0 0 var(--spacing-md) 0;
                    color: var(--color-text-primary);
                    font-weight: var(--font-weight-semibold);
                }

                .file-upload-area {
                    border: 2px dashed var(--color-border-light);
                    border-radius: var(--border-radius-md);
                    padding: var(--spacing-lg);
                    text-align: center;
                    cursor: pointer;
                    transition: all var(--transition-fast);
                    min-height: 120px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                }

                .file-upload-area:hover,
                .file-upload-area.dragover {
                    border-color: var(--color-primary);
                    background: var(--color-primary-bg);
                }

                .upload-icon {
                    font-size: 2rem;
                    margin-bottom: var(--spacing-sm);
                }

                .upload-prompt p {
                    margin: 0 0 var(--spacing-sm) 0;
                    color: var(--color-text-primary);
                }

                .supported-formats {
                    font-size: var(--font-size-xs);
                    color: var(--color-text-tertiary);
                }

                .template-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                    gap: var(--spacing-sm);
                }

                @media (max-width: 768px) {
                    .template-grid {
                        grid-template-columns: 1fr;
                    }
                    
                    .map-config-importer {
                        padding: var(--spacing-md);
                    }
                    
                    .file-upload-area {
                        min-height: 100px;
                        padding: var(--spacing-md);
                    }
                    
                    .import-method {
                        padding: var(--spacing-md);
                    }
                }

                .template-item {
                    padding: var(--spacing-md);
                    border: 1px solid var(--color-border-light);
                    border-radius: var(--border-radius-sm);
                    cursor: pointer;
                    transition: all var(--transition-fast);
                    text-align: center;
                }

                .template-item:hover {
                    border-color: var(--color-primary);
                    background: var(--color-primary-bg);
                }

                .template-name {
                    font-weight: var(--font-weight-medium);
                    margin-bottom: var(--spacing-xs);
                    color: var(--color-text-primary);
                }

                .template-desc {
                    font-size: var(--font-size-sm);
                    color: var(--color-text-secondary);
                }

                .import-preview {
                    border: 1px solid var(--color-border-light);
                    border-radius: var(--border-radius-md);
                    padding: var(--spacing-md);
                    margin-top: var(--spacing-lg);
                    background: var(--color-bg-secondary);
                }

                .import-preview h5 {
                    margin: 0 0 var(--spacing-md) 0;
                    color: var(--color-text-primary);
                }

                .preview-details {
                    margin-bottom: var(--spacing-lg);
                }

                .preview-actions {
                    display: flex;
                    gap: var(--spacing-sm);
                    justify-content: flex-end;
                }

                .config-summary {
                    background: white;
                    border: 1px solid var(--color-border-light);
                    border-radius: var(--border-radius-sm);
                    padding: var(--spacing-md);
                    margin-bottom: var(--spacing-md);
                }

                .config-summary h6 {
                    margin: 0 0 var(--spacing-sm) 0;
                    color: var(--color-text-primary);
                }

                .config-summary-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                    gap: var(--spacing-sm);
                    font-size: var(--font-size-sm);
                }

                .config-summary-item {
                    padding: var(--spacing-xs);
                }

                .config-summary-label {
                    font-weight: var(--font-weight-medium);
                    color: var(--color-text-secondary);
                }

                .config-summary-value {
                    color: var(--color-text-primary);
                }
            </style>
        `;
    }

    initialize() {
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        // File upload handlers
        const fileInput = Utils.DOM.find('#config-file-input');
        const uploadArea = Utils.DOM.find('#file-upload-area');

        if (fileInput && uploadArea) {
            Utils.DOM.on(uploadArea, 'click', () => fileInput.click());
            Utils.DOM.on(fileInput, 'change', (e) => this.handleFileSelect(e.target.files[0]));

            // Drag and drop
            Utils.DOM.on(uploadArea, 'dragover', (e) => {
                e.preventDefault();
                uploadArea.classList.add('dragover');
            });

            Utils.DOM.on(uploadArea, 'dragleave', () => {
                uploadArea.classList.remove('dragover');
            });

            Utils.DOM.on(uploadArea, 'drop', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('dragover');
                const file = e.dataTransfer.files[0];
                if (file) this.handleFileSelect(file);
            });
        }

        // URL import
        const urlBtn = Utils.DOM.find('#import-from-url-btn');
        if (urlBtn) {
            Utils.DOM.on(urlBtn, 'click', () => this.handleUrlImport());
        }

        // Template selection
        const templateItems = Utils.DOM.findAll('.template-item');
        templateItems.forEach(item => {
            Utils.DOM.on(item, 'click', () => {
                const template = item.dataset.template;
                this.loadTemplate(template);
            });
        });

        // Preview actions
        const confirmBtn = Utils.DOM.find('#confirm-import-btn');
        const cancelBtn = Utils.DOM.find('#cancel-import-btn');
        
        if (confirmBtn) {
            Utils.DOM.on(confirmBtn, 'click', () => this.confirmImport());
        }
        
        if (cancelBtn) {
            Utils.DOM.on(cancelBtn, 'click', () => this.hidePreview());
        }
    }

    async handleFileSelect(file) {
        if (!file) return;

        try {
            const text = await this.readFileAsText(file);
            const config = JSON.parse(text);
            
            // Determine format and validate
            const format = this.detectFormat(config, file.name);
            const isValid = await this.validateConfig(config, format);
            
            if (isValid) {
                this.showPreview(config, format, `File: ${file.name}`);
            } else {
                app.showNotification('error', 'Invalid Format', 'The selected file is not a valid map configuration');
            }
        } catch (error) {
            logger.error('File import error:', error);
            app.showNotification('error', 'Import Error', 'Failed to read or parse the selected file');
        }
    }

    async handleUrlImport() {
        const urlInput = Utils.DOM.find('#config-url-input');
        const url = urlInput?.value?.trim();
        
        if (!url) {
            app.showNotification('error', 'Missing URL', 'Please enter a valid URL');
            return;
        }

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const config = await response.json();
            const format = this.detectFormat(config, url);
            const isValid = await this.validateConfig(config, format);
            
            if (isValid) {
                this.showPreview(config, format, `URL: ${url}`);
            } else {
                app.showNotification('error', 'Invalid Format', 'The URL does not contain a valid map configuration');
            }
        } catch (error) {
            logger.error('URL import error:', error);
            app.showNotification('error', 'Import Error', `Failed to load configuration from URL: ${error.message}`);
        }
    }

    loadTemplate(templateId) {
        const templates = {
            'basic-osm': {
                name: 'Basic OpenStreetMap',
                tile_url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                attribution: '© OpenStreetMap contributors',
                max_zoom: 19,
                min_zoom: 1,
                default_zoom: 10,
                default_center: 'POINT(-74.0060 40.7128)',
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
                name: 'Satellite with Streets',
                tile_url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                attribution: '© Esri',
                max_zoom: 18,
                min_zoom: 1,
                default_zoom: 12,
                default_center: 'POINT(-74.0060 40.7128)',
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
                name: 'Multi-Layer Configuration',
                tile_url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                attribution: '© OpenStreetMap contributors',
                max_zoom: 18,
                min_zoom: 1,
                default_zoom: 10,
                default_center: 'POINT(-74.0060 40.7128)',
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
            this.showPreview(template, 'template', `Template: ${template.name}`);
        }
    }

    detectFormat(config, filename) {
        // Check for GeoJSON
        if (config.type && config.features) {
            return 'geojson';
        }
        
        // Check for native map config format
        if (config.layer_config && config.layer_config.elements) {
            return 'json';
        }
        
        // Check for Leaflet-style config
        if (config.layers || config.baseLayers) {
            return 'leaflet';
        }
        
        // Default based on filename
        if (filename.endsWith('.geojson')) {
            return 'geojson';
        }
        
        return 'json';
    }

    async validateConfig(config, format) {
        if (!this.supportedFormats[format]) {
            return false;
        }
        
        return await this.supportedFormats[format].validator(config);
    }

    validateMapConfigJson(config) {
        // Validate native map configuration format
        return !!(config.name || config.layer_config);
    }

    validateGeoJsonConfig(config) {
        // Validate GeoJSON format
        return !!(config.type && config.features);
    }

    validateLeafletConfig(config) {
        // Validate Leaflet layer configuration
        return !!(config.layers || config.baseLayers);
    }

    showPreview(config, format, source) {
        this.currentConfig = config;
        this.currentFormat = format;
        
        const preview = Utils.DOM.find('#import-preview');
        const details = Utils.DOM.find('#preview-details');
        
        if (preview && details) {
            details.innerHTML = this.renderPreviewDetails(config, format, source);
            preview.style.display = 'block';
        }
    }

    renderPreviewDetails(config, format, source) {
        const summary = this.generateConfigSummary(config, format);
        
        return `
            <div class="config-summary">
                <h6>Configuration Summary</h6>
                <div class="config-summary-grid">
                    <div class="config-summary-item">
                        <div class="config-summary-label">Source</div>
                        <div class="config-summary-value">${source}</div>
                    </div>
                    <div class="config-summary-item">
                        <div class="config-summary-label">Format</div>
                        <div class="config-summary-value">${format.toUpperCase()}</div>
                    </div>
                    <div class="config-summary-item">
                        <div class="config-summary-label">Name</div>
                        <div class="config-summary-value">${summary.name}</div>
                    </div>
                    <div class="config-summary-item">
                        <div class="config-summary-label">Elements</div>
                        <div class="config-summary-value">${summary.elementCount}</div>
                    </div>
                    <div class="config-summary-item">
                        <div class="config-summary-label">Zoom Range</div>
                        <div class="config-summary-value">${summary.zoomRange}</div>
                    </div>
                    <div class="config-summary-item">
                        <div class="config-summary-label">Center</div>
                        <div class="config-summary-value">${summary.center}</div>
                    </div>
                </div>
            </div>
        `;
    }

    generateConfigSummary(config, format) {
        let summary = {
            name: 'Untitled Configuration',
            elementCount: 0,
            zoomRange: '1-18',
            center: 'Not set'
        };

        switch (format) {
            case 'json':
            case 'template':
                summary.name = config.name || 'Imported Configuration';
                summary.elementCount = config.layer_config?.elements?.length || 0;
                summary.zoomRange = `${config.min_zoom || 1}-${config.max_zoom || 18}`;
                if (config.default_center) {
                    const coords = this.parseGeometry(config.default_center);
                    if (coords) {
                        summary.center = `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
                    }
                }
                break;
                
            case 'geojson':
                summary.name = config.name || 'GeoJSON Configuration';
                summary.elementCount = config.features?.length || 0;
                // Calculate bounds from features if available
                break;
                
            case 'leaflet':
                summary.name = config.name || 'Leaflet Configuration';
                summary.elementCount = Object.keys(config.layers || {}).length + Object.keys(config.baseLayers || {}).length;
                break;
        }

        return summary;
    }

    hidePreview() {
        const preview = Utils.DOM.find('#import-preview');
        if (preview) {
            preview.style.display = 'none';
        }
        this.currentConfig = null;
        this.currentFormat = null;
    }

    async confirmImport() {
        if (!this.currentConfig || !this.currentFormat) {
            app.showNotification('error', 'Import Error', 'No configuration to import');
            return;
        }

        try {
            const convertedConfig = await this.convertToNativeFormat(this.currentConfig, this.currentFormat);
            
            // Trigger import in parent component
            if (window.importMapConfiguration) {
                await window.importMapConfiguration(convertedConfig);
                this.hidePreview();
                app.showNotification('success', 'Import Successful', 'Map configuration imported successfully');
            } else {
                throw new Error('Import handler not available');
            }
        } catch (error) {
            logger.error('Import confirmation error:', error);
            app.showNotification('error', 'Import Error', error.message || 'Failed to import configuration');
        }
    }

    async convertToNativeFormat(config, format) {
        const projectId = supabaseClient.getCurrentProjectId();
        if (!projectId) {
            throw new Error('No project selected');
        }

        switch (format) {
            case 'json':
            case 'template':
                // Already in native format, just ensure project context
                return {
                    ...config,
                    project_id: projectId,
                    is_default: false,
                    is_active: false
                };
                
            case 'geojson':
                return this.convertGeoJsonToNative(config, projectId);
                
            case 'leaflet':
                return this.convertLeafletToNative(config, projectId);
                
            default:
                throw new Error(`Unsupported format: ${format}`);
        }
    }

    convertGeoJsonToNative(geojson, projectId) {
        // Convert GeoJSON to native map configuration
        const elements = [{
            id: 'geojson-layer',
            type: 'geojson-layer',
            name: 'Imported GeoJSON',
            url: '', // Would need to be uploaded or provided separately
            style: {
                color: '#3388ff',
                weight: 3,
                opacity: 1,
                fillOpacity: 0.2
            },
            visible: true,
            zIndex: 2
        }];

        // Add base layer
        elements.unshift({
            id: 'base-layer',
            type: 'base-layer',
            name: 'OpenStreetMap',
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            attribution: '© OpenStreetMap contributors',
            opacity: 1.0,
            visible: true,
            zIndex: 1,
            maxZoom: 18,
            minZoom: 1
        });

        return {
            name: geojson.name || 'Imported GeoJSON Configuration',
            project_id: projectId,
            tile_url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            attribution: '© OpenStreetMap contributors',
            max_zoom: 18,
            min_zoom: 1,
            default_zoom: 10,
            default_center: 'POINT(-74.0060 40.7128)', // Default to NYC
            is_default: false,
            is_active: false,
            layer_config: {
                elements: elements,
                version: '2.0',
                created: new Date().toISOString()
            }
        };
    }

    convertLeafletToNative(leafletConfig, projectId) {
        const elements = [];
        let zIndex = 1;

        // Convert base layers
        if (leafletConfig.baseLayers) {
            Object.entries(leafletConfig.baseLayers).forEach(([key, layer]) => {
                elements.push({
                    id: `base-${key}`,
                    type: 'base-layer',
                    name: layer.name || key,
                    url: layer.url,
                    attribution: layer.attribution || '',
                    opacity: layer.opacity || 1.0,
                    visible: true,
                    zIndex: zIndex++,
                    maxZoom: layer.maxZoom || 18,
                    minZoom: layer.minZoom || 1
                });
            });
        }

        // Convert overlay layers
        if (leafletConfig.overlays) {
            Object.entries(leafletConfig.overlays).forEach(([key, layer]) => {
                elements.push({
                    id: `overlay-${key}`,
                    type: 'overlay-layer',
                    name: layer.name || key,
                    url: layer.url,
                    attribution: layer.attribution || '',
                    opacity: layer.opacity || 0.7,
                    visible: false,
                    zIndex: zIndex++,
                    maxZoom: layer.maxZoom || 18,
                    minZoom: layer.minZoom || 1
                });
            });
        }

        return {
            name: leafletConfig.name || 'Imported Leaflet Configuration',
            project_id: projectId,
            tile_url: elements[0]?.url || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            attribution: elements.map(e => e.attribution).filter(Boolean).join('; '),
            max_zoom: 18,
            min_zoom: 1,
            default_zoom: leafletConfig.zoom || 10,
            default_center: leafletConfig.center ? `POINT(${leafletConfig.center[1]} ${leafletConfig.center[0]})` : 'POINT(-74.0060 40.7128)',
            is_default: false,
            is_active: false,
            layer_config: {
                elements: elements,
                version: '2.0',
                created: new Date().toISOString()
            }
        };
    }

    parseGeometry(geometry) {
        if (typeof geometry === 'string') {
            const coords = geometry.match(/POINT\(([^)]+)\)/);
            if (coords) {
                const [lng, lat] = coords[1].split(' ');
                return { lat: parseFloat(lat), lng: parseFloat(lng) };
            }
        }
        return null;
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }
}

export default MapConfigImporter;