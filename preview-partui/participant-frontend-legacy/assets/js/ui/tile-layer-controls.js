/**
 * Tile Layer Controls - UI component for managing tile layers in filter panel
 * Provides user interface for toggling role-based tile layers
 */

import tileService from '../services/tile-service.js';
import mapCore from '../map/map-core.js';
import DebugLogger from '../core/debug-logger.js';

class TileLayerControls {
    constructor() {
        this.logger = new DebugLogger('TileLayerControls');
        this.controlsContainer = null;
        this.activeLayers = new Set();
        this.layerElements = new Map();
        this.initialized = false;
    }

    /**
     * Initialize the tile layer controls
     */
    async initialize() {
        try {
            this.logger.log('Initializing tile layer controls...');
            
            // Get the controls container
            this.controlsContainer = document.getElementById('tileLayerControls');
            if (!this.controlsContainer) {
                throw new Error('Tile layer controls container not found');
            }
            
            // Listen for tile service events
            window.addEventListener('tileservice:refreshed', this.handleTileServiceRefresh.bind(this));
            
            // Listen for authentication changes
            window.addEventListener('authStateChanged', this.handleAuthStateChange.bind(this));
            
            // Initial load of tile layers
            await this.loadTileLayers();
            
            this.initialized = true;
            this.logger.log('Tile layer controls initialized');
            
        } catch (error) {
            this.logger.error('Failed to initialize tile layer controls:', error);
            this.showError('Failed to load tile layer controls');
        }
    }

    /**
     * Load available tile layers
     */
    async loadTileLayers() {
        try {
            this.logger.log('Loading tile layers...');
            
            // Check if tile service is initialized
            if (!tileService.initialized) {
                this.showLoading();
                return;
            }
            
            // Get available tile sets
            const tileSets = tileService.getTileSets();
            this.logger.log('Found tile sets:', tileSets.length);
            
            if (tileSets.length === 0) {
                this.showNoTiles();
                return;
            }
            
            // Render tile layer controls
            this.renderTileControls(tileSets);
            
        } catch (error) {
            this.logger.error('Error loading tile layers:', error);
            this.showError('Failed to load tile layers');
        }
    }

    /**
     * Render tile layer controls
     */
    renderTileControls(tileSets) {
        // Clear existing content
        this.controlsContainer.innerHTML = '';
        this.layerElements.clear();
        
        // Create controls for each tile set
        tileSets.forEach(tileSet => {
            const controlElement = this.createTileControl(tileSet);
            this.controlsContainer.appendChild(controlElement);
            this.layerElements.set(tileSet.id, controlElement);
        });
    }

    /**
     * Create control element for a single tile set
     */
    createTileControl(tileSet) {
        const item = document.createElement('div');
        item.className = 'tile-layer-item';
        item.dataset.tileSetId = tileSet.id;
        
        // Create checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'tile-layer-checkbox';
        checkbox.id = `tile-layer-${tileSet.id}`;
        checkbox.checked = false; // Start with layers off
        
        // Create info section
        const info = document.createElement('div');
        info.className = 'tile-layer-info';
        
        const name = document.createElement('div');
        name.className = 'tile-layer-name';
        name.textContent = tileSet.name;
        
        const details = document.createElement('div');
        details.className = 'tile-layer-details';
        details.innerHTML = this.formatTileSetDetails(tileSet);
        
        info.appendChild(name);
        info.appendChild(details);
        
        // Role indicator removed
        
        // Add event listeners
        checkbox.addEventListener('change', (e) => {
            this.toggleTileLayer(tileSet.id, e.target.checked);
        });
        
        info.addEventListener('click', () => {
            checkbox.checked = !checkbox.checked;
            this.toggleTileLayer(tileSet.id, checkbox.checked);
        });
        
        item.appendChild(checkbox);
        item.appendChild(info);
        
        return item;
    }

    /**
     * Format tile set details for display
     */
    formatTileSetDetails(tileSet) {
        const details = [];
        
        if (tileSet.description) {
            details.push(tileSet.description);
        }
        
        return details.join(' • ');
    }

    /**
     * Toggle a tile layer on/off
     */
    toggleTileLayer(tileSetId, isVisible) {
        try {
            this.logger.log('Toggling tile layer:', tileSetId, isVisible);
            
            const tileSet = tileService.getTileSet(tileSetId);
            if (!tileSet) {
                this.logger.warn('Tile set not found:', tileSetId);
                return;
            }
            
            const map = mapCore.getMap();
            if (!map) {
                this.logger.warn('Map not available');
                return;
            }
            
            // Get or create the tile layer
            let layer = this.getOrCreateTileLayer(tileSet);
            
            if (isVisible) {
                if (!map.hasLayer(layer)) {
                    layer.addTo(map);
                    this.activeLayers.add(tileSetId);
                    this.logger.log('Added tile layer to map:', tileSet.name);
                }
            } else {
                if (map.hasLayer(layer)) {
                    map.removeLayer(layer);
                    this.activeLayers.delete(tileSetId);
                    this.logger.log('Removed tile layer from map:', tileSet.name);
                }
            }
            
        } catch (error) {
            this.logger.error('Error toggling tile layer:', error);
        }
    }

    /**
     * Get or create Leaflet tile layer for a tile set
     */
    getOrCreateTileLayer(tileSet) {
        // Check if we already have this layer
        const layerKey = `tile-layer-${tileSet.id}`;
        
        // Try to get existing layer from window storage
        if (!window.tileLayers) {
            window.tileLayers = new Map();
        }
        
        let layer = window.tileLayers.get(layerKey);
        
        if (!layer) {
            // Create new layer using tile service
            layer = tileService.createTileLayer(tileSet.id);
            if (layer) {
                window.tileLayers.set(layerKey, layer);
            }
        }
        
        return layer;
    }

    /**
     * Show loading state
     */
    showLoading() {
        this.controlsContainer.innerHTML = '<p class="loading-message">Loading available tile layers...</p>';
    }

    /**
     * Show no tiles message
     */
    showNoTiles() {
        this.controlsContainer.innerHTML = '<p class="no-tiles-message">No tile layers available for your role.</p>';
    }

    /**
     * Show error message
     */
    showError(message) {
        this.controlsContainer.innerHTML = `<p class="no-tiles-message">${message}</p>`;
    }

    /**
     * Handle tile service refresh
     */
    async handleTileServiceRefresh(event) {
        this.logger.log('Tile service refreshed, updating controls');
        
        try {
            // Clear active layers
            const map = mapCore.getMap();
            if (map) {
                this.activeLayers.forEach(tileSetId => {
                    const layerKey = `tile-layer-${tileSetId}`;
                    const layer = window.tileLayers?.get(layerKey);
                    if (layer && map.hasLayer(layer)) {
                        map.removeLayer(layer);
                    }
                });
            }
            
            this.activeLayers.clear();
            
            // Reload tile layers
            await this.loadTileLayers();
            
        } catch (error) {
            this.logger.error('Error handling tile service refresh:', error);
        }
    }

    /**
     * Handle authentication state changes
     */
    async handleAuthStateChange(event) {
        if (event.detail.isAuthenticated) {
            this.logger.log('User authenticated, loading tile layers');
            // Wait a bit for tile service to initialize
            setTimeout(() => {
                this.loadTileLayers();
            }, 1000);
        } else {
            this.logger.log('User logged out, clearing tile controls');
            this.showNoTiles();
            this.activeLayers.clear();
        }
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        // Remove event listeners
        window.removeEventListener('tileservice:refreshed', this.handleTileServiceRefresh.bind(this));
        window.removeEventListener('authStateChanged', this.handleAuthStateChange.bind(this));
        
        // Clear active layers
        const map = mapCore.getMap();
        if (map) {
            this.activeLayers.forEach(tileSetId => {
                const layerKey = `tile-layer-${tileSetId}`;
                const layer = window.tileLayers?.get(layerKey);
                if (layer && map.hasLayer(layer)) {
                    map.removeLayer(layer);
                }
            });
        }
        
        this.activeLayers.clear();
        this.layerElements.clear();
        this.initialized = false;
    }

    /**
     * Get status for debugging
     */
    getStatus() {
        return {
            initialized: this.initialized,
            activeLayersCount: this.activeLayers.size,
            activeLayers: Array.from(this.activeLayers),
            controlElementsCount: this.layerElements.size,
            hasContainer: !!this.controlsContainer
        };
    }
}

// Create singleton instance
const tileLayerControls = new TileLayerControls();

// Export as ES6 module
export default tileLayerControls;

// Make available globally for debugging
if (typeof window !== 'undefined') {
    window.TileLayerControls = tileLayerControls;
}