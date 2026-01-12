import DebugLogger from './debug-logger.js';

/**
 * Event Manager - Modern ES6+ event management system for participants app
 * Prevents event listener accumulation and memory leaks with component-based organization
 * Adapted from legacy EventManager.js for modern modular architecture
 */

class EventManager {
    constructor() {
        // Private storage for event listeners
        this._listeners = new Map();
        
        // Custom event emitter storage
        this._customEventListeners = new Map();
        
        // Counter for generating unique IDs
        this._idCounter = 0;
        
        // Stats tracking
        this._stats = {
            totalAdded: 0,
            totalRemoved: 0,
            activeCount: 0
        };
        
        // Debug logger
        this._logger = new DebugLogger('EventManager');
        
        // Component registry for lifecycle management
        this._components = new Map();
        
        // Setup automatic cleanup on page unload
        this._setupPageUnloadCleanup();
    }
    
    /**
     * Generate a unique ID for each listener
     * @param {string} prefix - Optional prefix for the ID
     * @returns {string} A unique identifier
     */
    _generateId(prefix = 'listener') {
        this._idCounter++;
        return `${prefix}-${Date.now()}-${this._idCounter}`;
    }
    
    /**
     * Log message when debug mode is enabled
     * @param {string} message - Message to log
     * @param {*} data - Optional data to log
     */
    _debug(message, data) {
        if (data) {
            this._logger.log(message, data);
        } else {
            this._logger.log(message);
        }
    }
    
    /**
     * Update statistics when adding or removing listeners
     * @param {string} action - Action being performed ('add' or 'remove')
     * @param {number} count - Number of items affected
     */
    _updateStats(action, count = 1) {
        if (action === 'add') {
            this._stats.totalAdded += count;
            this._stats.activeCount += count;
        } else if (action === 'remove') {
            this._stats.totalRemoved += count;
            this._stats.activeCount -= count;
        }
    }
    
    /**
     * Add an event listener with tracking
     * @param {Element|Window|Document} element - Target element
     * @param {string} eventType - Type of event (e.g., 'click', 'resize')
     * @param {Function} handler - Event handler function
     * @param {Object} options - Additional options
     * @param {string} options.id - Custom ID for the listener
     * @param {string} options.component - Component this listener belongs to
     * @param {string} options.description - Description for debugging
     * @param {boolean} options.capture - Use capture phase
     * @param {boolean} options.once - Remove after first trigger
     * @param {boolean} options.passive - Indicates listener won't call preventDefault
     * @returns {string} Listener ID for later removal
     */
    add(element, eventType, handler, options = {}) {
        // Validate required parameters
        if (!element) {
            this._logger.error('Cannot add listener: Element is null or undefined');
            return null;
        }
        
        if (!eventType) {
            this._logger.error('Cannot add listener: Event type is required');
            return null;
        }
        
        if (typeof handler !== 'function') {
            this._logger.error('Cannot add listener: Handler must be a function');
            return null;
        }
        
        // Generate or use provided ID
        const id = options.id || this._generateId(options.component ? `${options.component}-${eventType}` : eventType);
        
        // Create wrapper handler for potential cleanup with 'once' option
        let wrappedHandler;
        
        if (options.once) {
            wrappedHandler = (event) => {
                // Remove the listener before calling the handler
                this.remove(id);
                // Call the original handler
                handler.call(element, event);
            };
        } else {
            wrappedHandler = handler;
        }
        
        // Create event listener options object
        const eventOptions = {};
        if (options.capture) eventOptions.capture = true;
        if (options.passive) eventOptions.passive = true;
        if (options.once) eventOptions.once = true;
        
        // Add the event listener
        element.addEventListener(eventType, wrappedHandler, eventOptions);
        
        // Store the listener details
        this._listeners.set(id, {
            element,
            eventType,
            handler: wrappedHandler,
            originalHandler: handler,
            options: eventOptions,
            component: options.component || 'default',
            description: options.description || '',
            timestamp: Date.now()
        });
        
        // Update stats
        this._updateStats('add');
        
        this._debug(`Added listener: ${id}`, {
            eventType,
            component: options.component,
            description: options.description
        });
        
        return id;
    }
    
    /**
     * Remove a specific event listener by ID
     * @param {string} id - ID of the listener to remove
     * @returns {boolean} Whether removal was successful
     */
    remove(id) {
        if (!id) return false;
        
        const listener = this._listeners.get(id);
        if (!listener) {
            this._debug(`Attempted to remove non-existent listener: ${id}`);
            return false;
        }
        
        // Remove the actual event listener
        listener.element.removeEventListener(
            listener.eventType,
            listener.handler,
            listener.options
        );
        
        // Remove from our tracking
        this._listeners.delete(id);
        
        // Update stats
        this._updateStats('remove');
        
        this._debug(`Removed listener: ${id}`, {
            eventType: listener.eventType,
            component: listener.component
        });
        
        return true;
    }
    
    /**
     * Remove all listeners for a component
     * @param {string} component - Component name
     * @returns {number} Number of listeners removed
     */
    removeByComponent(component) {
        if (!component) return 0;
        
        let count = 0;
        
        // Collect DOM event listener IDs to remove
        const idsToRemove = [];
        
        for (const [id, listener] of this._listeners.entries()) {
            if (listener.component === component) {
                idsToRemove.push(id);
            }
        }
        
        // Remove the collected DOM event listeners
        for (const id of idsToRemove) {
            if (this.remove(id)) {
                count++;
            }
        }
        
        // Remove custom event listeners for this component
        const customIdsToRemove = [];
        for (const [eventName, listeners] of this._customEventListeners.entries()) {
            for (const listener of listeners) {
                if (listener.component === component) {
                    customIdsToRemove.push(listener.id);
                }
            }
        }
        
        for (const id of customIdsToRemove) {
            if (this.off(id)) {
                count++;
            }
        }
        
        this._debug(`Removed ${count} listeners for component: ${component}`);
        
        return count;
    }
    
    /**
     * Remove listeners by ID prefix
     * @param {string} prefix - Prefix to match against listener IDs
     * @returns {number} Number of listeners removed
     */
    removeByPrefix(prefix) {
        if (!prefix) return 0;
        
        let count = 0;
        
        // Collect IDs to remove (avoid modifying while iterating)
        const idsToRemove = [];
        
        for (const id of this._listeners.keys()) {
            if (id.startsWith(prefix)) {
                idsToRemove.push(id);
            }
        }
        
        // Remove the collected listeners
        for (const id of idsToRemove) {
            if (this.remove(id)) {
                count++;
            }
        }
        
        this._debug(`Removed ${count} listeners with prefix: ${prefix}`);
        
        return count;
    }
    
    /**
     * Remove all listeners for a specific element
     * @param {Element} element - DOM element to remove listeners from
     * @returns {number} Number of listeners removed
     */
    removeByElement(element) {
        if (!element) return 0;
        
        let count = 0;
        
        // Collect IDs to remove (avoid modifying while iterating)
        const idsToRemove = [];
        
        for (const [id, listener] of this._listeners.entries()) {
            if (listener.element === element) {
                idsToRemove.push(id);
            }
        }
        
        // Remove the collected listeners
        for (const id of idsToRemove) {
            if (this.remove(id)) {
                count++;
            }
        }
        
        this._debug(`Removed ${count} listeners for element:`, element);
        
        return count;
    }
    
    /**
     * Remove all listeners of a specific event type
     * @param {string} eventType - Event type to remove
     * @returns {number} Number of listeners removed
     */
    removeByEventType(eventType) {
        if (!eventType) return 0;
        
        let count = 0;
        
        // Collect IDs to remove (avoid modifying while iterating)
        const idsToRemove = [];
        
        for (const [id, listener] of this._listeners.entries()) {
            if (listener.eventType === eventType) {
                idsToRemove.push(id);
            }
        }
        
        // Remove the collected listeners
        for (const id of idsToRemove) {
            if (this.remove(id)) {
                count++;
            }
        }
        
        this._debug(`Removed ${count} listeners for event type: ${eventType}`);
        
        return count;
    }
    
    /**
     * Remove all tracked listeners
     * @returns {number} Number of listeners removed
     */
    removeAll() {
        let count = 0;
        
        // Remove DOM event listeners
        const idsToRemove = Array.from(this._listeners.keys());
        for (const id of idsToRemove) {
            if (this.remove(id)) {
                count++;
            }
        }
        
        // Remove custom event listeners
        const customEvents = Array.from(this._customEventListeners.keys());
        for (const eventName of customEvents) {
            count += this.removeAllCustomListeners(eventName);
        }
        
        this._debug(`Removed all listeners (${count} total)`);
        
        return count;
    }
    
    /**
     * Check if a listener with the given ID exists
     * @param {string} id - Listener ID
     * @returns {boolean} Whether the listener exists
     */
    exists(id) {
        return this._listeners.has(id);
    }
    
    /**
     * Get statistics about event listeners
     * @returns {Object} Listener statistics
     */
    getStats() {
        // Calculate component statistics
        const byComponent = {};
        for (const listener of this._listeners.values()) {
            const component = listener.component || 'default';
            if (!byComponent[component]) {
                byComponent[component] = 0;
            }
            byComponent[component]++;
        }
        
        // Calculate event type statistics
        const byEventType = {};
        for (const listener of this._listeners.values()) {
            if (!byEventType[listener.eventType]) {
                byEventType[listener.eventType] = 0;
            }
            byEventType[listener.eventType]++;
        }
        
        return {
            active: this._stats.activeCount,
            totalAdded: this._stats.totalAdded,
            totalRemoved: this._stats.totalRemoved,
            byComponent,
            byEventType
        };
    }
    
    /**
     * List all active listeners
     * @param {Object} options - Filter options
     * @param {string} options.component - Filter by component
     * @param {string} options.eventType - Filter by event type
     * @returns {Array} Array of listener information objects
     */
    listActive(options = {}) {
        const result = [];
        
        for (const [id, listener] of this._listeners.entries()) {
            // Apply filters
            if (options.component && listener.component !== options.component) continue;
            if (options.eventType && listener.eventType !== options.eventType) continue;
            
            // Add to results
            result.push({
                id,
                eventType: listener.eventType,
                component: listener.component,
                description: listener.description,
                timestamp: listener.timestamp,
                element: listener.element
            });
        }
        
        return result;
    }
    
    /**
     * Enable or disable debug mode
     * @param {boolean} enabled - Whether debug mode should be enabled
     */
    setDebugMode(enabled) {
        this._logger.log(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    /**
     * Helper method to attach multiple listeners at once
     * @param {Element} element - Target element
     * @param {Object} events - Map of event types to handlers
     * @param {Object} options - Options for all listeners
     * @returns {Array} Array of listener IDs
     */
    addMultiple(element, events, options = {}) {
        if (!element || !events) return [];
        
        const ids = [];
        
        for (const [eventType, handler] of Object.entries(events)) {
            const id = this.add(element, eventType, handler, options);
            if (id) {
                ids.push(id);
            }
        }
        
        return ids;
    }
    
    /**
     * Custom Event System
     */
    
    /**
     * Add custom event listener (for component-to-component communication)
     * @param {string} eventName - Name of the custom event
     * @param {Function} handler - Event handler function
     * @param {Object} options - Additional options
     * @returns {string} Listener ID for later removal
     */
    on(eventName, handler, options = {}) {
        if (!eventName || typeof handler !== 'function') {
            this._logger.error('Custom event registration failed: eventName and handler are required');
            return null;
        }
        
        // Generate unique ID for this custom event listener
        const id = this._generateId(`custom-${eventName}`);
        
        // Initialize array for this event if it doesn't exist
        if (!this._customEventListeners.has(eventName)) {
            this._customEventListeners.set(eventName, []);
        }
        
        // Store listener info
        const listenerInfo = {
            id,
            handler,
            component: options.component || 'default',
            description: options.description || '',
            once: options.once || false,
            timestamp: Date.now()
        };
        
        this._customEventListeners.get(eventName).push(listenerInfo);
        
        this._debug(`Added custom event listener: ${eventName}`, {
            id,
            component: options.component,
            description: options.description
        });
        
        return id;
    }
    
    /**
     * Remove custom event listener by ID
     * @param {string} id - ID of the listener to remove
     * @returns {boolean} Whether removal was successful
     */
    off(id) {
        if (!id) return false;
        
        // Find and remove the listener
        for (const [eventName, listeners] of this._customEventListeners.entries()) {
            const listenerIndex = listeners.findIndex(l => l.id === id);
            if (listenerIndex !== -1) {
                listeners.splice(listenerIndex, 1);
                
                // Clean up empty arrays
                if (listeners.length === 0) {
                    this._customEventListeners.delete(eventName);
                }
                
                this._debug(`Removed custom event listener: ${id} for event: ${eventName}`);
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Emit a custom event to all registered listeners
     * @param {string} eventName - Name of the event to emit
     * @param {*} data - Data to pass to event handlers
     * @returns {number} Number of handlers that were called
     */
    emit(eventName, data) {
        if (!eventName) {
            this._logger.error('Cannot emit event: eventName is required');
            return 0;
        }
        
        const listeners = this._customEventListeners.get(eventName);
        if (!listeners || listeners.length === 0) {
            this._debug(`No listeners for custom event: ${eventName}`);
            return 0;
        }
        
        let handlersCalled = 0;
        const listenersToRemove = [];
        
        // Call all handlers for this event
        for (const listener of listeners) {
            try {
                listener.handler(data);
                handlersCalled++;
                
                // If this is a 'once' listener, mark it for removal
                if (listener.once) {
                    listenersToRemove.push(listener.id);
                }
                
                this._debug(`Called custom event handler for: ${eventName}`, {
                    listenerId: listener.id,
                    component: listener.component
                });
                
            } catch (error) {
                this._logger.error(`Error in custom event handler for ${eventName}:`, error);
            }
        }
        
        // Remove 'once' listeners
        for (const id of listenersToRemove) {
            this.off(id);
        }
        
        this._debug(`Emitted custom event: ${eventName}`, {
            handlersCount: handlersCalled,
            data: typeof data === 'object' ? Object.keys(data) : data
        });
        
        return handlersCalled;
    }
    
    /**
     * Remove all custom event listeners for a specific event
     * @param {string} eventName - Event name to clear
     * @returns {number} Number of listeners removed
     */
    removeAllCustomListeners(eventName) {
        if (!eventName) return 0;
        
        const listeners = this._customEventListeners.get(eventName);
        if (!listeners) return 0;
        
        const count = listeners.length;
        this._customEventListeners.delete(eventName);
        
        this._debug(`Removed all listeners for custom event: ${eventName}`, { count });
        return count;
    }
    
    /**
     * Get list of custom event listeners
     * @returns {Object} Object with event names as keys and listener counts as values
     */
    getCustomEventStats() {
        const stats = {};
        let totalListeners = 0;
        
        for (const [eventName, listeners] of this._customEventListeners.entries()) {
            stats[eventName] = listeners.length;
            totalListeners += listeners.length;
        }
        
        return {
            events: stats,
            totalListeners
        };
    }
    
    /**
     * Component Lifecycle Management
     */
    
    /**
     * Register a component with the event manager
     * @param {string} componentName - Name of the component
     * @param {Object} options - Component options
     * @param {Function} options.destroy - Cleanup function for the component
     * @param {Array} options.listeners - Array of listener IDs managed by this component
     */
    registerComponent(componentName, options = {}) {
        if (!componentName) {
            throw new Error('Component name is required');
        }
        
        this._components.set(componentName, {
            name: componentName,
            destroy: options.destroy || null,
            listeners: options.listeners || [],
            createdAt: Date.now()
        });
        
        this._debug(`Registered component: ${componentName}`);
    }
    
    /**
     * Unregister a component and clean up its listeners
     * @param {string} componentName - Name of the component to unregister
     * @returns {boolean} Whether the component was successfully unregistered
     */
    unregisterComponent(componentName) {
        if (!componentName) return false;
        
        const component = this._components.get(componentName);
        if (!component) {
            this._debug(`Attempted to unregister non-existent component: ${componentName}`);
            return false;
        }
        
        // Call component's destroy method if it exists
        if (typeof component.destroy === 'function') {
            try {
                component.destroy();
                this._debug(`Called destroy method for component: ${componentName}`);
            } catch (error) {
                this._logger.error(`Error calling destroy method for component ${componentName}:`, error);
            }
        }
        
        // Remove all listeners for this component
        const removedCount = this.removeByComponent(componentName);
        
        // Remove component from registry
        this._components.delete(componentName);
        
        this._debug(`Unregistered component: ${componentName}, removed ${removedCount} listeners`);
        
        return true;
    }
    
    /**
     * Get list of registered components
     * @returns {Array} Array of component information
     */
    getComponents() {
        const result = [];
        
        for (const [name, component] of this._components.entries()) {
            // Count active listeners for this component
            const listenerCount = Array.from(this._listeners.values())
                .filter(listener => listener.component === name).length;
            
            result.push({
                name: component.name,
                listenerCount,
                hasDestroyMethod: typeof component.destroy === 'function',
                createdAt: component.createdAt
            });
        }
        
        return result;
    }
    
    /**
     * Cleanup all components and listeners
     */
    cleanup() {
        // Unregister all components (this will call their destroy methods)
        const componentNames = Array.from(this._components.keys());
        for (const componentName of componentNames) {
            this.unregisterComponent(componentName);
        }
        
        // Remove any remaining listeners
        this.removeAll();
        
        this._debug('EventManager cleanup completed');
    }
    
    /**
     * Setup page unload cleanup
     * This attaches an event to the window unload event to clean up all listeners
     */
    _setupPageUnloadCleanup() {
        // Store the current listeners to clean up
        const cleanupFn = () => {
            this._debug('Page unloading, cleaning up listeners');
            this.cleanup();
        };
        
        // Use the native addEventListener directly to avoid circular reference
        window.addEventListener('beforeunload', cleanupFn);
        
        this._debug('Page unload cleanup registered');
    }
}

// Create singleton instance
const eventManager = new EventManager();

// Export as ES6 module
export default eventManager;

// Also make available globally for non-module usage
if (typeof window !== 'undefined') {
    window.EventManager = eventManager;
}