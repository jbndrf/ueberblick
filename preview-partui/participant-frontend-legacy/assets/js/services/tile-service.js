/**
 * Tile Service - Role-based tile serving for participant frontend
 * Manages loading and serving of map tiles based on participant roles and permissions
 */

import { supabaseClient } from '../core/supabase.js';
import participantAuth from '../auth/participant-auth.js';
import DebugLogger from '../core/debug-logger.js';

// Import config at module level
let config = null;
import('../core/config.js').then(configModule => {
    config = configModule.config;
}).catch(error => {
    console.warn('Failed to load config for tile service:', error);
});

class TileService {
    constructor() {
        this.logger = new DebugLogger('TileService');
        this.tileSets = new Map();
        this.tileCache = new Map();
        this.currentProject = null;
        this.participantRoles = [];
        this.initialized = false;
    }

    /**
     * Initialize the tile service
     */
    async initialize() {
        try {
            this.logger.log('Initializing tile service...');
            
            // Ensure config is loaded
            if (!config) {
                const configModule = await import('../core/config.js');
                config = configModule.config;
            }
            
            // Get current participant and project information
            this.currentProject = participantAuth.getCurrentProject();
            this.participantRoles = participantAuth.getParticipantRoles();
            
            if (!this.currentProject) {
                throw new Error('No current project available');
            }
            
            this.logger.log('Project ID:', this.currentProject.id);
            this.logger.log('Participant roles:', this.participantRoles.map(r => r.name));
            
            // Load available tile sets for the current project
            await this.loadTileSets();
            
            this.initialized = true;
            this.logger.log('Tile service initialized successfully');
            
            return true;
        } catch (error) {
            this.logger.error('Failed to initialize tile service:', error);
            throw error;
        }
    }

    /**
     * Load tile sets available to current participant based on roles
     */
    async loadTileSets() {
        try {
            this.logger.log('Loading tile sets for project:', this.currentProject.id);
            
            // Get participant role IDs
            const roleIds = this.participantRoles.map(role => role.id);
            this.logger.log('Checking access for role IDs:', roleIds);
            
            // Query tile sets that are visible to participant's roles
            const { data: tileSets, error } = await supabaseClient
                .from('tile_sets')
                .select('*')
                .eq('project_id', this.currentProject.id)
                .eq('status', 'completed')
                .order('name');
            
            if (error) {
                throw new Error(`Failed to load tile sets: ${error.message}`);
            }
            
            this.logger.log('Found tile sets:', tileSets?.length || 0);
            
            // Filter tile sets based on role visibility
            const accessibleTileSets = tileSets?.filter(tileSet => {
                // If visible_to_roles is empty or null, it's visible to all
                if (!tileSet.visible_to_roles || tileSet.visible_to_roles.length === 0) {
                    return true;
                }
                
                // Check if participant has any of the required roles
                const hasAccess = roleIds.some(roleId => 
                    tileSet.visible_to_roles.includes(roleId)
                );
                
                this.logger.log(`Tile set "${tileSet.name}" access:`, hasAccess);
                return hasAccess;
            }) || [];
            
            this.logger.log('Accessible tile sets:', accessibleTileSets.length);
            
            // Store tile sets in memory
            this.tileSets.clear();
            accessibleTileSets.forEach(tileSet => {
                this.tileSets.set(tileSet.id, tileSet);
                this.logger.log(`Added tile set: ${tileSet.name} (${tileSet.id})`);
            });
            
        } catch (error) {
            this.logger.error('Error loading tile sets:', error);
            throw error;
        }
    }

    /**
     * Get all accessible tile sets
     */
    getTileSets() {
        return Array.from(this.tileSets.values());
    }

    /**
     * Get tile set by ID
     */
    getTileSet(tileSetId) {
        return this.tileSets.get(tileSetId);
    }

    /**
     * Get tile URL for a specific tile set and coordinates
     */
    getTileUrl(tileSetId, z, x, y) {
        const tileSet = this.getTileSet(tileSetId);
        if (!tileSet) {
            this.logger.warn('Tile set not found or not accessible:', tileSetId);
            return null;
        }

        // Check zoom level bounds
        if (tileSet.min_zoom !== null && z < tileSet.min_zoom) {
            return null;
        }
        if (tileSet.max_zoom !== null && z > tileSet.max_zoom) {
            return null;
        }

        // Build tile URL using the correct processed tiles structure
        // Processed tiles are stored in map-tiles bucket under tiles/{tile_set_id}/
        const directPublicUrl = `http://192.168.1.91:8000/storage/v1/object/public/map-tiles/tiles/${tileSet.id}`;
        const tileUrl = `${directPublicUrl}/${z}/${x}/${y}.${tileSet.tile_format}`;
        
        this.logger.log(`Generated tile URL: ${tileUrl}`);
        return tileUrl;
    }

    /**
     * Create Leaflet tile layer for a tile set
     */
    createTileLayer(tileSetId, options = {}) {
        const tileSet = this.getTileSet(tileSetId);
        if (!tileSet) {
            this.logger.warn('Cannot create tile layer: tile set not found or not accessible:', tileSetId);
            return null;
        }

        this.logger.log('Creating tile layer for:', tileSet.name);

        // Get tile URL template using the correct processed tiles structure
        // Processed tiles are stored in map-tiles bucket under tiles/{tile_set_id}/
        const directPublicUrl = `http://192.168.1.91:8000/storage/v1/object/public/map-tiles/tiles/${tileSet.id}`;
        const tileUrlTemplate = `${directPublicUrl}/{z}/{x}/{y}.${tileSet.tile_format}`;

        // Merge options with tile set configuration
        const layerOptions = {
            minZoom: tileSet.min_zoom || 0,
            maxZoom: tileSet.max_zoom || 18,
            bounds: tileSet.bounds ? this.parseBounds(tileSet.bounds) : undefined,
            attribution: `Tile Set: ${tileSet.name}`,
            ...options
        };

        this.logger.log('Tile layer options:', layerOptions);

        // Create and return Leaflet tile layer
        return L.tileLayer(tileUrlTemplate, layerOptions);
    }

    /**
     * Parse bounds from database format to Leaflet bounds
     */
    parseBounds(boundsData) {
        try {
            if (typeof boundsData === 'string') {
                boundsData = JSON.parse(boundsData);
            }
            
            if (boundsData && boundsData.length === 4) {
                // Assuming format: [minLat, minLng, maxLat, maxLng]
                return [[boundsData[0], boundsData[1]], [boundsData[2], boundsData[3]]];
            }
        } catch (error) {
            this.logger.warn('Failed to parse tile set bounds:', error);
        }
        return undefined;
    }

    /**
     * Get tile layers suitable for a Leaflet layer control
     */
    getTileLayersForControl() {
        const layers = {};
        
        this.getTileSets().forEach(tileSet => {
            const layer = this.createTileLayer(tileSet.id);
            if (layer) {
                layers[tileSet.name] = layer;
            }
        });
        
        return layers;
    }

    /**
     * Check if participant has access to a specific tile set
     */
    hasAccessToTileSet(tileSetId) {
        return this.tileSets.has(tileSetId);
    }

    /**
     * Refresh tile sets (e.g., when roles change)
     */
    async refresh() {
        try {
            this.logger.log('Refreshing tile service...');
            
            // Update current project and roles
            this.currentProject = participantAuth.getCurrentProject();
            this.participantRoles = participantAuth.getParticipantRoles();
            
            // Reload tile sets
            await this.loadTileSets();
            
            // Clear cache
            this.tileCache.clear();
            
            this.logger.log('Tile service refreshed successfully');
            
            // Emit refresh event
            window.dispatchEvent(new CustomEvent('tileservice:refreshed', {
                detail: {
                    tileSets: this.getTileSets(),
                    project: this.currentProject,
                    roles: this.participantRoles
                }
            }));
            
        } catch (error) {
            this.logger.error('Error refreshing tile service:', error);
            throw error;
        }
    }

    /**
     * Get tile service status for debugging
     */
    getStatus() {
        return {
            initialized: this.initialized,
            projectId: this.currentProject?.id,
            projectName: this.currentProject?.name,
            roleCount: this.participantRoles.length,
            roleNames: this.participantRoles.map(r => r.name),
            tileSetCount: this.tileSets.size,
            tileSets: this.getTileSets().map(ts => ({
                id: ts.id,
                name: ts.name,
                format: ts.tile_format,
                minZoom: ts.min_zoom,
                maxZoom: ts.max_zoom
            }))
        };
    }
}

// Create singleton instance
const tileService = new TileService();

// Export as ES6 module
export default tileService;

// Make available globally for non-module usage
if (typeof window !== 'undefined') {
    window.TileService = tileService;
}