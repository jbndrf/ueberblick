/**
 * Configuration Manager - Database-driven configuration loading for participants app
 * Handles project-scoped settings, offline caching, and dynamic configuration updates
 * Replaces legacy properties files with Supabase-based configuration
 */

import { supabaseClient } from './supabase.js';
import DebugLogger from './debug-logger.js';

class ConfigManager {
    constructor() {
        this.config = new Map();
        this.projectConfig = new Map();
        this.cacheKey = 'participant_config_cache';
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        this.configListeners = [];
        this.isInitialized = false;
        this.logger = new DebugLogger('ConfigManager');
        
        // Default configuration
        this.defaults = {
            app: {
                name: 'Participants App',
                version: '1.0.0',
                debug: false,
                offline_timeout: 30000,
                sync_interval: 60000,
                max_retry_attempts: 3
            },
            ui: {
                theme: 'default',
                mobile_breakpoint: 768,
                bottom_sheet_peek_height: 200,
                animation_duration: 300,
                touch_timeout: 300
            },
            map: {
                default_zoom: 10,
                min_zoom: 1,
                max_zoom: 20,
                cluster_distance: 50,
                marker_icon_size: 32
            },
            auth: {
                session_timeout: 24 * 60 * 60 * 1000, // 24 hours
                refresh_interval: 5 * 60 * 1000, // 5 minutes
                max_login_attempts: 5,
                lockout_duration: 15 * 60 * 1000 // 15 minutes
            }
        };
    }
    
    /**
     * Initialize the configuration manager
     * @param {string} projectId - Optional project ID for project-scoped config
     */
    async initialize(projectId = null) {
        try {
            this.logger.log('Initializing...');
            
            // Load default configuration
            this.loadDefaults();
            
            // Load cached configuration first for fast startup
            this.loadFromCache();
            
            // Load fresh configuration from database
            if (projectId) {
                await this.loadProjectConfiguration(projectId);
            }
            
            // Load global application settings
            await this.loadGlobalConfiguration();
            
            this.isInitialized = true;
            this.logger.log('Initialized successfully');
            
            // Notify listeners
            this.notifyConfigListeners('initialized', null);
            
            return true;
            
        } catch (error) {
            this.logger.error('Initialization failed:', error);
            
            // Fall back to cached/default config if database fails
            this.loadFromCache();
            this.isInitialized = true;
            
            return false;
        }
    }
    
    /**
     * Load default configuration values
     */
    loadDefaults() {
        for (const [section, values] of Object.entries(this.defaults)) {
            this.config.set(section, { ...values });
        }
        
        this.logger.log('Loaded default configuration');
    }
    
    /**
     * Load project-specific configuration
     * @param {string} projectId - Project ID
     */
    async loadProjectConfiguration(projectId) {
        try {
            if (!projectId) return;
            
            this.logger.log(`Loading project configuration for: ${projectId}`);
            
            // Load project settings
            const project = await supabaseClient.getProjectById(projectId);
            if (project && project.settings) {
                this.projectConfig.set('project', project.settings);
                this.logger.log('Loaded project settings');
            }
            
            // Load map settings for the project
            const mapSettings = await supabaseClient.getMapSettings(projectId);
            if (mapSettings && mapSettings.length > 0) {
                const activeMapSettings = mapSettings.find(m => m.is_active) || mapSettings[0];
                this.projectConfig.set('map', {
                    tile_url: activeMapSettings.tile_url,
                    attribution: activeMapSettings.attribution,
                    default_center: activeMapSettings.default_center,
                    default_zoom: activeMapSettings.default_zoom || this.get('map.default_zoom'),
                    min_zoom: activeMapSettings.min_zoom || this.get('map.min_zoom'),
                    max_zoom: activeMapSettings.max_zoom || this.get('map.max_zoom'),
                    layer_config: activeMapSettings.layer_config || {}
                });
                this.logger.log('Loaded map settings');
            }
            
            // Load UI configurations for the project
            await this.loadUIConfigurations(projectId);
            
            // Cache the loaded configuration
            this.saveToCache();
            
        } catch (error) {
            this.logger.error('Failed to load project configuration:', error);
            throw error;
        }
    }
    
    /**
     * Load UI configurations from database
     * @param {string} projectId - Project ID
     */
    async loadUIConfigurations(projectId) {
        try {
            const uiConfigs = await supabaseClient.getAll('ui_configurations', {
                filter: { project_id: projectId }
            });
            
            if (uiConfigs && uiConfigs.length > 0) {
                const uiConfigMap = {};
                
                uiConfigs.forEach(config => {
                    const key = `${config.context_type}_${config.role_id || 'default'}`;
                    uiConfigMap[key] = config.configuration;
                });
                
                this.projectConfig.set('ui_configurations', uiConfigMap);
                this.logger.log('Loaded UI configurations');
            }
            
        } catch (error) {
            this.logger.warn('Failed to load UI configurations:', error);
            // Don't throw - UI configs are optional
        }
    }
    
    /**
     * Load global application configuration
     */
    async loadGlobalConfiguration() {
        try {
            // For now, we don't have global app config in database
            // This could be extended to load from a global settings table
            this.logger.log('Global configuration loaded (using defaults)');
            
        } catch (error) {
            this.logger.warn('Failed to load global configuration:', error);
            // Don't throw - globals are optional
        }
    }
    
    /**
     * Get configuration value by key path
     * @param {string} keyPath - Dot notation key path (e.g., 'map.default_zoom')
     * @param {*} defaultValue - Default value if key not found
     * @returns {*} Configuration value
     */
    get(keyPath, defaultValue = null) {
        const [section, key] = keyPath.split('.');
        
        // Check project-specific config first
        if (this.projectConfig.has(section)) {
            const projectSection = this.projectConfig.get(section);
            if (key && projectSection && projectSection.hasOwnProperty(key)) {
                return projectSection[key];
            } else if (!key) {
                return projectSection;
            }
        }
        
        // Fall back to global config
        if (this.config.has(section)) {
            const globalSection = this.config.get(section);
            if (key && globalSection && globalSection.hasOwnProperty(key)) {
                return globalSection[key];
            } else if (!key) {
                return globalSection;
            }
        }
        
        this.logger.warn(`Configuration key not found: ${keyPath}`);
        return defaultValue;
    }
    
    /**
     * Set configuration value
     * @param {string} keyPath - Dot notation key path
     * @param {*} value - Value to set
     * @param {boolean} isProjectSpecific - Whether this is project-specific config
     */
    set(keyPath, value, isProjectSpecific = false) {
        const [section, key] = keyPath.split('.');
        const targetConfig = isProjectSpecific ? this.projectConfig : this.config;
        
        if (!targetConfig.has(section)) {
            targetConfig.set(section, {});
        }
        
        const sectionConfig = targetConfig.get(section);
        if (key) {
            sectionConfig[key] = value;
        } else {
            targetConfig.set(section, value);
        }
        
        // Cache updated configuration
        this.saveToCache();
        
        // Notify listeners
        this.notifyConfigListeners('updated', { keyPath, value });
        
        this.logger.log(`Set ${keyPath} = ${JSON.stringify(value)}`);
    }
    
    /**
     * Get UI configuration for specific context and role
     * @param {string} contextType - Context type (e.g., 'form_peek_view')
     * @param {string} roleId - Role ID (optional)
     * @returns {Object|null} UI configuration
     */
    getUIConfig(contextType, roleId = null) {
        const uiConfigs = this.projectConfig.get('ui_configurations');
        if (!uiConfigs) return null;
        
        // Try role-specific config first
        if (roleId) {
            const roleSpecificKey = `${contextType}_${roleId}`;
            if (uiConfigs[roleSpecificKey]) {
                return uiConfigs[roleSpecificKey];
            }
        }
        
        // Fall back to default config
        const defaultKey = `${contextType}_default`;
        return uiConfigs[defaultKey] || null;
    }
    
    /**
     * Get map configuration
     * @returns {Object} Map configuration object
     */
    getMapConfig() {
        return {
            tile_url: this.get('map.tile_url'),
            attribution: this.get('map.attribution'),
            default_center: this.get('map.default_center'),
            default_zoom: this.get('map.default_zoom'),
            min_zoom: this.get('map.min_zoom'),
            max_zoom: this.get('map.max_zoom'),
            layer_config: this.get('map.layer_config', {}),
            cluster_distance: this.get('map.cluster_distance'),
            marker_icon_size: this.get('map.marker_icon_size')
        };
    }
    
    /**
     * Get authentication configuration
     * @returns {Object} Auth configuration object
     */
    getAuthConfig() {
        return {
            session_timeout: this.get('auth.session_timeout'),
            refresh_interval: this.get('auth.refresh_interval'),
            max_login_attempts: this.get('auth.max_login_attempts'),
            lockout_duration: this.get('auth.lockout_duration')
        };
    }
    
    /**
     * Get application configuration
     * @returns {Object} App configuration object
     */
    getAppConfig() {
        return {
            name: this.get('app.name'),
            version: this.get('app.version'),
            debug: this.get('app.debug'),
            offline_timeout: this.get('app.offline_timeout'),
            sync_interval: this.get('app.sync_interval'),
            max_retry_attempts: this.get('app.max_retry_attempts')
        };
    }
    
    /**
     * Cache Management
     */
    
    /**
     * Save configuration to cache
     */
    saveToCache() {
        try {
            const cacheData = {
                config: Object.fromEntries(this.config),
                projectConfig: Object.fromEntries(this.projectConfig),
                timestamp: Date.now()
            };
            
            localStorage.setItem(this.cacheKey, JSON.stringify(cacheData));
            this.logger.log('Configuration cached');
            
        } catch (error) {
            this.logger.error('Failed to cache configuration:', error);
        }
    }
    
    /**
     * Load configuration from cache
     */
    loadFromCache() {
        try {
            const cachedData = localStorage.getItem(this.cacheKey);
            if (!cachedData) return false;
            
            const cacheData = JSON.parse(cachedData);
            
            // Check if cache is still valid
            if (Date.now() - cacheData.timestamp > this.cacheTimeout) {
                this.logger.log('Cache expired, will refresh from database');
                return false;
            }
            
            // Restore configuration from cache
            this.config = new Map(Object.entries(cacheData.config || {}));
            this.projectConfig = new Map(Object.entries(cacheData.projectConfig || {}));
            
            this.logger.log('Configuration loaded from cache');
            return true;
            
        } catch (error) {
            this.logger.error('Failed to load from cache:', error);
            return false;
        }
    }
    
    /**
     * Clear configuration cache
     */
    clearCache() {
        try {
            localStorage.removeItem(this.cacheKey);
            this.logger.log('Cache cleared');
        } catch (error) {
            this.logger.error('Failed to clear cache:', error);
        }
    }
    
    /**
     * Configuration Listeners
     */
    
    /**
     * Add configuration change listener
     * @param {Function} callback - Callback function
     * @returns {Function} Unsubscribe function
     */
    onConfigChange(callback) {
        this.configListeners.push(callback);
        
        return () => {
            const index = this.configListeners.indexOf(callback);
            if (index > -1) {
                this.configListeners.splice(index, 1);
            }
        };
    }
    
    /**
     * Notify configuration listeners
     * @param {string} event - Event type
     * @param {*} data - Event data
     */
    notifyConfigListeners(event, data) {
        this.configListeners.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                this.logger.error('Listener error:', error);
            }
        });
    }
    
    /**
     * Reload configuration from database
     * @param {string} projectId - Project ID
     */
    async reload(projectId = null) {
        try {
            this.logger.log('Reloading configuration...');
            
            // Clear current config (keep defaults)
            this.projectConfig.clear();
            this.loadDefaults();
            
            // Reload from database
            if (projectId) {
                await this.loadProjectConfiguration(projectId);
            }
            await this.loadGlobalConfiguration();
            
            // Notify listeners
            this.notifyConfigListeners('reloaded', null);
            
            this.logger.log('Configuration reloaded');
            return true;
            
        } catch (error) {
            this.logger.error('Failed to reload configuration:', error);
            return false;
        }
    }
    
    /**
     * Debug and monitoring
     */
    
    /**
     * Get all configuration for debugging
     * @returns {Object} All configuration data
     */
    getAllConfig() {
        return {
            global: Object.fromEntries(this.config),
            project: Object.fromEntries(this.projectConfig),
            defaults: this.defaults,
            isInitialized: this.isInitialized
        };
    }
    
    /**
     * Get configuration statistics
     * @returns {Object} Configuration stats
     */
    getStats() {
        return {
            globalSections: this.config.size,
            projectSections: this.projectConfig.size,
            totalListeners: this.configListeners.length,
            cacheAge: this.getCacheAge(),
            isInitialized: this.isInitialized
        };
    }
    
    /**
     * Get cache age in milliseconds
     * @returns {number|null} Cache age or null if no cache
     */
    getCacheAge() {
        try {
            const cachedData = localStorage.getItem(this.cacheKey);
            if (!cachedData) return null;
            
            const cacheData = JSON.parse(cachedData);
            return Date.now() - cacheData.timestamp;
            
        } catch (error) {
            return null;
        }
    }
}

// Create singleton instance
const configManager = new ConfigManager();

// Export as ES6 module
export default configManager;

// Also make available globally for non-module usage
if (typeof window !== 'undefined') {
    window.ConfigManager = configManager;
}