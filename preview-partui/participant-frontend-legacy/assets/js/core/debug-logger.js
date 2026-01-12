/**
 * Debug Logger - Centralized logging utility with component-level control
 * 
 * Usage:
 * import DebugLogger from '@core/debug-logger.js';
 * const logger = new DebugLogger('ComponentName');
 * logger.log('message', data);
 * logger.warn('warning message');
 * logger.error('error message');
 * 
 * Control logging via:
 * - Global: DebugLogger.setGlobalDebug(true/false)
 * - Component-specific: DebugLogger.setComponentDebug('ComponentName', true/false)
 * - localStorage: Set 'debug_mode' to 'true' for persistence
 * - URL parameter: Add ?debug=true to enable global debug
 */

class DebugLogger {
    static globalDebug = false;
    static componentDebug = new Map();
    static initialized = false;

    constructor(componentName) {
        this.componentName = componentName;
        
        // Initialize debug settings on first use
        if (!DebugLogger.initialized) {
            DebugLogger.initialize();
        }
    }

    static initialize() {
        // Check localStorage for persistent debug mode
        const storedDebug = localStorage.getItem('debug_mode');
        if (storedDebug === 'true') {
            DebugLogger.globalDebug = true;
        }

        // Check URL parameter for debug mode
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('debug') === 'true') {
            DebugLogger.globalDebug = true;
        }

        // Load component-specific debug settings from localStorage
        const storedComponentDebug = localStorage.getItem('debug_components');
        if (storedComponentDebug) {
            try {
                const componentSettings = JSON.parse(storedComponentDebug);
                Object.entries(componentSettings).forEach(([component, enabled]) => {
                    DebugLogger.componentDebug.set(component, enabled);
                });
            } catch (e) {
                console.warn('Failed to parse stored component debug settings');
            }
        }

        DebugLogger.initialized = true;
    }

    static setGlobalDebug(enabled) {
        DebugLogger.globalDebug = enabled;
        localStorage.setItem('debug_mode', enabled.toString());
        
        if (enabled) {
            console.log('[DEBUG] Global debug mode enabled');
        } else {
            console.log('[DEBUG] Global debug mode disabled');
        }
    }

    static setComponentDebug(componentName, enabled) {
        DebugLogger.componentDebug.set(componentName, enabled);
        
        // Save to localStorage
        const componentSettings = Object.fromEntries(DebugLogger.componentDebug);
        localStorage.setItem('debug_components', JSON.stringify(componentSettings));
        
        console.log(`[DEBUG] ${componentName} debug ${enabled ? 'enabled' : 'disabled'}`);
    }

    static getDebugStatus() {
        return {
            global: DebugLogger.globalDebug,
            components: Object.fromEntries(DebugLogger.componentDebug)
        };
    }

    static listComponents() {
        return Array.from(DebugLogger.componentDebug.keys());
    }

    static clearDebugSettings() {
        DebugLogger.globalDebug = false;
        DebugLogger.componentDebug.clear();
        localStorage.removeItem('debug_mode');
        localStorage.removeItem('debug_components');
        console.log('[DEBUG] All debug settings cleared');
    }

    isEnabled() {
        return DebugLogger.globalDebug || DebugLogger.componentDebug.get(this.componentName) === true;
    }

    log(message, ...args) {
        if (this.isEnabled()) {
            const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
            console.log(`[${timestamp}] [${this.componentName}]`, message, ...args);
        }
    }

    warn(message, ...args) {
        if (this.isEnabled()) {
            const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
            console.warn(`[${timestamp}] [${this.componentName}]`, message, ...args);
        }
    }

    error(message, ...args) {
        if (this.isEnabled()) {
            const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
            console.error(`[${timestamp}] [${this.componentName}]`, message, ...args);
        }
    }

    info(message, ...args) {
        if (this.isEnabled()) {
            const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
            console.info(`[${timestamp}] [${this.componentName}]`, message, ...args);
        }
    }

    debug(message, ...args) {
        if (this.isEnabled()) {
            const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
            console.debug(`[${timestamp}] [${this.componentName}]`, message, ...args);
        }
    }

    group(label) {
        if (this.isEnabled()) {
            console.group(`[${this.componentName}] ${label}`);
        }
    }

    groupEnd() {
        if (this.isEnabled()) {
            console.groupEnd();
        }
    }

    table(data) {
        if (this.isEnabled()) {
            console.log(`[${this.componentName}] Table data:`);
            console.table(data);
        }
    }
}

// Add global debug controls to window for easy access in browser console
window.DebugLogger = DebugLogger;
window.debugOn = (component) => {
    if (component) {
        DebugLogger.setComponentDebug(component, true);
    } else {
        DebugLogger.setGlobalDebug(true);
    }
};
window.debugOff = (component) => {
    if (component) {
        DebugLogger.setComponentDebug(component, false);
    } else {
        DebugLogger.setGlobalDebug(false);
    }
};
window.debugStatus = () => {
    console.log('Debug Status:', DebugLogger.getDebugStatus());
    console.log('Available components:', DebugLogger.listComponents());
};
window.debugClear = () => DebugLogger.clearDebugSettings();

export default DebugLogger;