/**
 * Simple Hash-based Router for Single Page Application
 * Handles navigation between different admin pages
 */

import { supabaseClient } from './supabase.js';
import DebugLogger from './debug-logger.js';

const logger = new DebugLogger('Router');

class Router {
    constructor() {
        this.routes = new Map();
        this.currentRoute = null;
        this.beforeHooks = [];
        this.afterHooks = [];
        this.isNavigating = false;
        this.isReady = false;
        
        // Bind methods
        this.handleHashChange = this.handleHashChange.bind(this);
        
        // Set up event listeners
        window.addEventListener('hashchange', this.handleHashChange);
        window.addEventListener('load', this.handleHashChange);
    }

    /**
     * Register a route
     * @param {string} path - Route path (without #)
     * @param {Object} config - Route configuration
     */
    register(path, config) {
        const normalizedPath = this.normalizePath(path);
        
        logger.log(`Registering route: ${path} -> ${normalizedPath}`, config);
        
        this.routes.set(normalizedPath, {
            path: normalizedPath,
            component: config.component,
            title: config.title || 'PunktStudio',
            meta: config.meta || {},
            guards: config.guards || [],
            ...config
        });
        
        logger.log(`Route registered successfully. Total routes: ${this.routes.size}`);
        
        return this;
    }

    /**
     * Navigate to a route
     * @param {string} path - Target path
     * @param {Object} options - Navigation options
     */
    async navigate(path, options = {}) {
        if (this.isNavigating) {
            logger.warn('Navigation already in progress');
            return;
        }

        // Wait for router to be ready
        if (!this.isReady) {
            logger.log('Router not ready, deferring navigation to:', path);
            return;
        }

        const normalizedPath = this.normalizePath(path);
        const routeInfo = this.parseProjectRoute(normalizedPath);
        
        let route;
        let effectiveProjectId = null;
        
        if (routeInfo.isProjectRoute) {
            // For project routes, find the base page route
            logger.log('Looking for project route:', routeInfo.page);
            logger.log('Available routes:', Array.from(this.routes.keys()));
            route = this.routes.get(routeInfo.page);
            effectiveProjectId = routeInfo.projectId;
            
            if (!route) {
                logger.error(`Base route not found for project route: ${routeInfo.page}`);
                logger.error('Available routes:', Array.from(this.routes.keys()));
                return this.navigate('dashboard');
            }
            
            // Verify project access
            logger.log('Router: Processing project route', {
                isProjectRoute: routeInfo.isProjectRoute,
                projectId: effectiveProjectId,
                page: routeInfo.page,
                fullPath: routeInfo.fullPath
            });
            
            try {
                const hasAccess = await supabaseClient.hasProjectAccess(effectiveProjectId);
                if (!hasAccess) {
                    logger.error('Router: Access denied to project:', effectiveProjectId);
                    return this.navigate('projects');
                }
                // Set project context
                logger.log('Router: Setting project context:', effectiveProjectId);
                supabaseClient.setCurrentProject(effectiveProjectId);
                logger.log('Router: Project context set successfully. Current context:', supabaseClient.getCurrentProjectId());
            } catch (error) {
                logger.error('Project verification failed:', error);
                return this.navigate('projects');
            }
        } else {
            // Regular route
            logger.log('Looking for regular route:', normalizedPath);
            logger.log('Available routes:', Array.from(this.routes.keys()));
            route = this.routes.get(normalizedPath);
        }
        
        if (!route) {
            logger.error(`Route not found: ${path}`);
            // Prevent infinite recursion by checking if we're already trying to go to a fallback
            if (normalizedPath !== 'login' && this.routes.has('login')) {
                logger.log('Redirecting to login as fallback');
                return this.navigate('login');
            } else {
                // If login doesn't exist either, show error
                this.showError('Navigation Error', `Route "${path}" not found and no fallback available`);
                return;
            }
        }

        try {
            this.isNavigating = true;
            
            // Run before hooks
            for (const hook of this.beforeHooks) {
                const result = await hook(route, this.currentRoute);
                if (result === false) {
                    this.isNavigating = false;
                    return;
                }
            }

            // Run route guards
            for (const guard of route.guards) {
                const result = await guard(route);
                if (result === false) {
                    this.isNavigating = false;
                    return;
                }
            }

            // Update hash without triggering hashchange if we're already there
            if (window.location.hash !== '#' + normalizedPath && !options.silent) {
                window.location.hash = '#' + normalizedPath;
            }

            // Load the route
            logger.log('Router: Loading route with context:', {
                routePath: route.path,
                projectId: effectiveProjectId,
                fullPath: routeInfo.fullPath,
                params: routeInfo.params || [],
                currentProjectContext: supabaseClient.getCurrentProjectId()
            });
            
            await this.loadRoute(route, { 
                projectId: effectiveProjectId, 
                path: routeInfo.fullPath,
                params: routeInfo.params || []
            });
            
        } catch (error) {
            logger.error('Navigation error:', error);
            this.showError('Navigation failed', error.message);
        } finally {
            this.isNavigating = false;
        }
    }

    /**
     * Handle hash change events
     */
    async handleHashChange() {
        if (this.isNavigating) return;
        
        // Wait for router to be ready (routes registered)
        if (!this.isReady) {
            logger.log('Router not ready, deferring navigation...');
            return;
        }
        
        const hash = window.location.hash.slice(1);
        const path = this.normalizePath(hash) || 'dashboard';
        
        await this.navigate(path, { silent: true });
    }

    /**
     * Load and render a route
     */
    async loadRoute(route, context = {}) {
        try {
            // Show loading state
            this.showLoading();
            
            // Update navigation state
            this.updateNavigation(route.path);
            
            // Update page title
            document.title = route.title;
            
            // Update breadcrumb
            this.updateBreadcrumb(route);
            
            // Load component if it's a module
            let component = route.component;
            if (typeof component === 'string') {
                // Dynamic import
                const module = await import(component);
                component = module.default || module;
            } else if (typeof component === 'function' && component.constructor.name === 'AsyncFunction') {
                // Handle async component functions (from route registration)
                component = await component(route, context);
            }
            
            // Get page container
            const container = document.getElementById('page-container');
            if (!container) {
                throw new Error('Page container not found');
            }
            
            // Clear existing content
            container.innerHTML = '';
            
            // Render component
            if (typeof component === 'function') {
                // Component is a function that returns HTML or DOM elements
                logger.log('Router: Rendering component with context:', {
                    routePath: route.path,
                    contextProjectId: context.projectId,
                    supabaseCurrentProject: supabaseClient.getCurrentProjectId()
                });
                
                const content = await component(route, context);
                
                if (typeof content === 'string') {
                    container.innerHTML = content;
                } else if (content instanceof Node) {
                    container.appendChild(content);
                } else if (Array.isArray(content)) {
                    content.forEach(node => {
                        if (typeof node === 'string') {
                            container.insertAdjacentHTML('beforeend', node);
                        } else if (node instanceof Node) {
                            container.appendChild(node);
                        }
                    });
                }
            } else {
                // Component is already HTML string or DOM element
                if (typeof component === 'string') {
                    container.innerHTML = component;
                } else if (component instanceof Node) {
                    container.appendChild(component);
                }
            }
            
            // Hide loading state
            this.hideLoading();
            
            // Update current route
            const previousRoute = this.currentRoute;
            this.currentRoute = route;
            
            // Run after hooks
            for (const hook of this.afterHooks) {
                try {
                    await hook(route, previousRoute);
                } catch (error) {
                    logger.error('After hook error:', error);
                }
            }
            
        } catch (error) {
            logger.error('Route loading error:', error);
            this.showError('Failed to load page', error.message);
        }
    }

    /**
     * Add navigation guard (before hook)
     */
    beforeEach(hook) {
        this.beforeHooks.push(hook);
        return this;
    }

    /**
     * Add after navigation hook
     */
    afterEach(hook) {
        this.afterHooks.push(hook);
        return this;
    }

    /**
     * Update navigation menu state
     */
    updateNavigation(currentPath) {
        const menuItems = document.querySelectorAll('.menu-item');
        menuItems.forEach(item => {
            const page = item.dataset.page;
            if (page === currentPath) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    /**
     * Update breadcrumb navigation
     */
    updateBreadcrumb(route) {
        const breadcrumb = document.getElementById('breadcrumb');
        if (breadcrumb) {
            breadcrumb.innerHTML = `<span class="breadcrumb-item active">${route.title}</span>`;
        }
    }

    /**
     * Show loading state
     */
    showLoading() {
        const container = document.getElementById('page-container');
        if (container) {
            container.innerHTML = `
                <div style="display: flex; justify-content: center; align-items: center; min-height: 200px;">
                    <div class="loading-spinner"></div>
                    <span style="margin-left: 1rem;">Loading...</span>
                </div>
            `;
        }
    }

    /**
     * Hide loading state
     */
    hideLoading() {
        // Loading state is replaced by actual content
    }

    /**
     * Show error state
     */
    showError(title, message) {
        const container = document.getElementById('page-container');
        if (container) {
            container.innerHTML = `
                <div class="error-state">
                    <div class="error-state-title">${title}</div>
                    <div class="error-state-message">${message}</div>
                    <button class="btn btn-primary" onclick="window.location.reload()">
                        Reload Page
                    </button>
                </div>
            `;
        }
    }

    /**
     * Normalize path (remove leading/trailing slashes, etc.)
     */
    normalizePath(path) {
        if (!path || path === '/' || path === '#') {
            return 'dashboard';
        }
        
        // Ensure we don't get stuck in recursion
        if (typeof path !== 'string') {
            logger.warn('Invalid path type:', typeof path, path);
            return 'dashboard';
        }
        
        // Simple normalization - remove leading # and / and trailing /
        const normalized = path.replace(/^[#\/]+/, '').replace(/\/+$/, '');
        
        // Return dashboard if empty after normalization
        return normalized || 'dashboard';
    }

    /**
     * Parse project-aware route path
     */
    parseProjectRoute(path) {
        const segments = path.split('/');
        
        // Check if this is a project route: project/{projectId}/{page} or project/{projectId}/{page}/{param}
        if (segments.length >= 3 && segments[0] === 'project') {
            const page = segments[2];
            const additionalParams = segments.slice(3);
            
            return {
                isProjectRoute: true,
                projectId: segments[1],
                page: page,
                params: additionalParams,
                fullPath: path
            };
        }
        
        return {
            isProjectRoute: false,
            page: path,
            fullPath: path
        };
    }

    /**
     * Get current route
     */
    getCurrentRoute() {
        return this.currentRoute;
    }

    /**
     * Get all registered routes
     */
    getRoutes() {
        return Array.from(this.routes.values());
    }

    /**
     * Check if route exists
     */
    hasRoute(path) {
        const normalizedPath = this.normalizePath(path);
        return this.routes.has(normalizedPath);
    }

    /**
     * Mark router as ready and handle any deferred navigation
     */
    ready() {
        this.isReady = true;
        logger.log('Router ready with', this.routes.size, 'routes');
        
        // Handle initial navigation
        this.handleInitialNavigation();
    }

    /**
     * Handle initial navigation with authentication check
     */
    async handleInitialNavigation() {
        const isAuthenticated = supabaseClient.isAuthenticated();
        const currentUser = supabaseClient.getCurrentUser();
        const currentHash = window.location.hash.slice(1) || 'dashboard';
        
        logger.log('Initial route check:', { 
            isAuthenticated, 
            hasUser: !!currentUser, 
            currentHash, 
            userEmail: currentUser?.email,
            totalRoutes: this.routes.size
        });
        
        if (isAuthenticated && currentUser) {
            // User is authenticated, go to requested page or dashboard
            if (currentHash === 'login') {
                logger.log('User authenticated but on login page, redirecting to dashboard');
                this.navigate('dashboard');
            } else {
                logger.log(`User authenticated, navigating to requested page: ${currentHash}`);
                this.navigate(currentHash);
            }
        } else {
            // User not authenticated, go to login
            logger.log('No authenticated user found, redirecting to login');
            this.navigate('login');
        }
    }
}

// Create singleton router instance
const router = new Router();

export default router;