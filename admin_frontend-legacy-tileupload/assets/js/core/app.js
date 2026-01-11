/**
 * Main Application Controller
 * Initializes the application, handles authentication, and sets up routing
 */

import { supabaseClient, storeConfig } from './supabase.js';
import router from './router.js';
import Utils from './utils.js';
import DebugLogger from './debug-logger.js';
import { i18n, i18nDOM } from './i18n.js';
import UserDropdown from '../components/user-dropdown.js';

const logger = new DebugLogger('App');

class App {
    constructor() {
        this.isInitialized = false;
        this.currentUser = null;
        this.notifications = [];
        this.userDropdown = null;
        
        // Configuration
        this.config = {
            supabaseUrl: 'http://192.168.1.91:8000',
            supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE'
        };
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            logger.log('Initializing PunktStudio...');
            
            // Show loading
            this.showLoadingOverlay();
            
            // Initialize Supabase
            await this.initializeSupabase();
            
            // Set up authentication
            this.setupAuthentication();
            
            // Set up routing
            this.setupRouting();
            
            // Set up UI event listeners
            this.setupEventListeners();
            
            // Initialize i18n service
            await i18n.init();
            
            // Subscribe to language changes for sidebar updates
            this.subscribeToLanguageChanges();
            
            // Create user dropdown in header
            this.userDropdown = new UserDropdown();
            const headerActions = document.getElementById('header-user-dropdown');
            this.userDropdown.render(headerActions, 'header-inline');
            
            // Update user dropdown with current user if already authenticated
            if (supabaseClient.isAuthenticated()) {
                this.currentUser = supabaseClient.getCurrentUser();
                this.userDropdown.updateUser(this.currentUser);
            }
            
            
            // Set initial sidebar visibility and load projects if authenticated
            if (supabaseClient.isAuthenticated()) {
                this.showSidebar();
                await this.loadAndUpdateSidebar();
            } else {
                this.hideSidebar();
            }
            
            // Set up project change listeners
            this.setupProjectChangeListeners();
            
            // Router is now ready, it will handle initial navigation automatically
            
            // Hide loading and ensure modals are closed
            this.hideLoadingOverlay();
            this.closeAllModals();
            
            this.isInitialized = true;
            logger.log('Application initialized successfully');
            
        } catch (error) {
            logger.error('Application initialization failed:', error);
            this.showError('Initialization Failed', error.message);
            this.hideLoadingOverlay();
        }
    }

    /**
     * Initialize Supabase client
     */
    async initializeSupabase() {
        try {
            await supabaseClient.initialize(this.config.supabaseUrl, this.config.supabaseAnonKey);
            
            // Store config for future use
            storeConfig(this.config);
            
            // Test connection
            const health = await supabaseClient.healthCheck();
            if (health.status !== 'ok') {
                throw new Error(`Supabase health check failed: ${health.error}`);
            }
            
            logger.log('Supabase client initialized');
        } catch (error) {
            logger.error('Supabase initialization failed:', error);
            throw new Error(`Failed to connect to Supabase: ${error.message}`);
        }
    }

    /**
     * Set up authentication handlers
     */
    setupAuthentication() {
        // Listen for auth state changes
        supabaseClient.onAuthStateChange(async (event, session) => {
            logger.log('Auth state change:', event, session?.user?.email);
            
            this.currentUser = session?.user || null;
            this.updateUserInfo();
            
            // Handle auth events
            switch (event) {
                case 'SIGNED_IN':
                    this.showNotification('success', 'Welcome!', 'Successfully signed in');
                    this.showSidebar();
                    await this.loadAndUpdateSidebar();
                    if (window.location.hash === '#login' || !window.location.hash) {
                        router.navigate('dashboard');
                    }
                    break;
                    
                case 'SIGNED_OUT':
                    this.showNotification('info', 'Signed Out', 'You have been signed out');
                    this.hideSidebar();
                    router.navigate('login');
                    break;
                    
                case 'TOKEN_REFRESHED':
                    logger.log('Token refreshed successfully');
                    break;
            }
        });
    }

    /**
     * Load user projects and update sidebar
     */
    async loadAndUpdateSidebar() {
        try {
            const projects = await supabaseClient.getUserProjects();
            this.updateSidebarWithProjects(projects);
        } catch (error) {
            logger.error('Failed to load projects for sidebar:', error);
            // Keep default sidebar if projects can't be loaded
        }
    }

    /**
     * Update sidebar with project-based navigation
     */
    updateSidebarWithProjects(projects) {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;

        const sidebarMenu = sidebar.querySelector('.sidebar-menu');
        if (!sidebarMenu) return;

        // Generate new menu HTML
        const menuHTML = this.generateSidebarMenuHTML(projects);
        sidebarMenu.innerHTML = menuHTML;

        // Process data-i18n attributes in the new content
        i18nDOM.translateDataAttributes();

        // Re-attach event listeners for new menu items
        this.setupMenuEventListeners();
    }

    /**
     * Generate sidebar menu HTML with projects
     */
    generateSidebarMenuHTML(projects) {
        const currentProjectId = supabaseClient.getCurrentProjectId();
        
        return `
            <a href="#dashboard" class="menu-item" data-page="dashboard">
                <span data-i18n="nav.dashboard">${i18n.t('nav.dashboard')}</span>
            </a>
            <a href="#projects" class="menu-item" data-page="projects">
                <span data-i18n="nav.projects">${i18n.t('nav.projects')}</span>
            </a>
            
            ${projects.length > 0 ? `
                <div class="menu-divider"></div>
                <div class="menu-group-label" data-i18n="nav.your_projects">${i18n.t('nav.your_projects')}</div>
                ${projects.map(project => `
                    <div class="menu-item-parent ${currentProjectId === project.id ? 'expanded' : ''}" data-project-id="${project.id}">
                        <span class="project-name">${project.name}</span>
                    </div>
                    <div class="submenu ${currentProjectId === project.id ? 'expanded' : ''}">
                        <a href="#project/${project.id}/participants" class="menu-item menu-sub" data-page="participants" data-project-id="${project.id}">
                            <span data-i18n="nav.participants">${i18n.t('nav.participants')}</span>
                        </a>
                        <a href="#project/${project.id}/roles" class="menu-item menu-sub" data-page="roles" data-project-id="${project.id}">
                            <span data-i18n="nav.roles">${i18n.t('nav.roles')}</span>
                        </a>
                        <a href="#project/${project.id}/custom-tables" class="menu-item menu-sub" data-page="custom-tables" data-project-id="${project.id}">
                            <span data-i18n="nav.custom_tables">${i18n.t('nav.custom_tables')}</span>
                        </a>
                        <a href="#project/${project.id}/map-settings" class="menu-item menu-sub" data-page="map-settings" data-project-id="${project.id}">
                            <span data-i18n="nav.map_settings">${i18n.t('nav.map_settings')}</span>
                        </a>
                        <a href="#project/${project.id}/workflows" class="menu-item menu-sub" data-page="workflows" data-project-id="${project.id}">
                            <span data-i18n="nav.workflows">${i18n.t('nav.workflows')}</span>
                        </a>
                        <a href="#project/${project.id}/marker-categories" class="menu-item menu-sub" data-page="marker-categories" data-project-id="${project.id}">
                            <span data-i18n="nav.marker_categories">${i18n.t('nav.marker_categories')}</span>
                        </a>
                    </div>
                `).join('')}
            ` : `
                <div class="empty-state" style="padding: var(--spacing-md); text-align: center; color: var(--color-text-tertiary);">
                    <p><span data-i18n="nav.no_projects_yet">${i18n.t('nav.no_projects_yet')}</span><br><a href="#projects" style="color: var(--color-primary);" data-i18n="nav.create_first_project">${i18n.t('nav.create_first_project')}</a></p>
                </div>
            `}
            
            <div class="menu-divider"></div>
            <a href="#rules" class="menu-item" data-page="rules">
                <span data-i18n="nav.global_rules">${i18n.t('nav.global_rules')}</span>
            </a>
        `;
    }

    /**
     * Set up menu event listeners for dynamic content
     */
    setupMenuEventListeners() {
        // Project expansion toggle
        const projectParents = Utils.DOM.findAll('.menu-item-parent');
        projectParents.forEach(item => {
            Utils.DOM.on(item, 'click', (e) => {
                e.preventDefault();
                const projectId = item.dataset.projectId;
                const submenu = item.nextElementSibling;
                
                // Toggle expansion
                item.classList.toggle('expanded');
                submenu.classList.toggle('expanded');
                
                // Set current project
                if (item.classList.contains('expanded')) {
                    supabaseClient.setCurrentProject(projectId);
                }
            });
        });

        // Menu item navigation with project context
        const menuItems = Utils.DOM.findAll('.menu-item');
        menuItems.forEach(item => {
            Utils.DOM.on(item, 'click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                const projectId = item.dataset.projectId;
                
                if (page && !item.classList.contains('menu-item-future')) {
                    // Set project context if this is a project-scoped page
                    if (projectId) {
                        supabaseClient.setCurrentProject(projectId);
                        router.navigate(`project/${projectId}/${page}`);
                    } else {
                        router.navigate(page);
                    }
                }
            });
        });
    }

    /**
     * Subscribe to language changes to update sidebar translations
     */
    subscribeToLanguageChanges() {
        i18n.subscribe(async () => {
            logger.log('Language changed, updating sidebar translations...');
            
            // Update static menu items with data-i18n attributes
            i18nDOM.translateDataAttributes();
            
            // Update dynamic sidebar if user is authenticated
            if (supabaseClient.isAuthenticated()) {
                await this.loadAndUpdateSidebar();
            }
            
            // Update breadcrumb if needed
            const currentProjectId = supabaseClient.getCurrentProjectId();
            if (currentProjectId) {
                await this.updateBreadcrumbWithProject(currentProjectId);
            }
        });
    }
    
    /**
     * Set up project change listeners
     */
    setupProjectChangeListeners() {
        // Listen for project changes to refresh sidebar
        window.addEventListener('projectChanged', async (event) => {
            const { projectId } = event.detail;
            logger.log('Project changed to:', projectId);
            
            // Update breadcrumb with project context
            await this.updateBreadcrumbWithProject(projectId);
            
            // Update sidebar highlighting
            this.updateSidebarProjectHighlighting(projectId);
        });
    }

    /**
     * Update breadcrumb with project context
     */
    async updateBreadcrumbWithProject(projectId) {
        const breadcrumb = document.getElementById('breadcrumb');
        if (!breadcrumb || !projectId) return;

        try {
            const project = await supabaseClient.getProjectById(projectId);
            const currentRoute = router.getCurrentRoute();
            
            if (currentRoute && currentRoute.path.startsWith('project/')) {
                const pageName = currentRoute.path.split('/').pop();
                breadcrumb.innerHTML = `
                    <span class="breadcrumb-item">
                        <a href="#projects">${project.name}</a>
                    </span>
                    <span class="breadcrumb-item active">${this.getPageDisplayName(pageName)}</span>
                `;
            }
        } catch (error) {
            logger.error('Failed to update breadcrumb:', error);
        }
    }

    /**
     * Get display name for page
     */
    getPageDisplayName(pageName) {
        const translationKeys = {
            'participants': 'nav.participants',
            'roles': 'nav.roles',
            'custom-tables': 'nav.custom_tables',
            'map-settings': 'nav.map_settings',
            'workflows': 'nav.workflows',
            'marker-categories': 'nav.marker_categories',
            'rules': 'nav.rules'
        };
        const key = translationKeys[pageName];
        return key ? i18n.t(key) : pageName;
    }

    /**
     * Update sidebar project highlighting
     */
    updateSidebarProjectHighlighting(projectId) {
        // Remove active class from all project parents
        const allProjectParents = Utils.DOM.findAll('.menu-item-parent');
        allProjectParents.forEach(item => {
            item.classList.remove('active-project');
            const submenu = item.nextElementSibling;
            if (submenu) submenu.classList.remove('expanded');
        });

        // Add active class to current project
        if (projectId) {
            const currentProjectParent = Utils.DOM.find(`[data-project-id="${projectId}"]`);
            if (currentProjectParent) {
                currentProjectParent.classList.add('active-project');
                const submenu = currentProjectParent.nextElementSibling;
                if (submenu) submenu.classList.add('expanded');
            }
        }
    }

    /**
     * Set up application routing
     */
    setupRouting() {
        // Authentication guard
        router.beforeEach(async (to, from) => {
            // Wait for Supabase to be properly initialized
            let waitAttempts = 0;
            while (!supabaseClient.isInitialized && waitAttempts < 25) {
                logger.log('Auth guard waiting for Supabase initialization...');
                await Utils.Async.delay(100);
                waitAttempts++;
            }
            
            if (!supabaseClient.isInitialized) {
                logger.error('Auth guard: Supabase not initialized, allowing navigation to login only');
                if (to.path !== 'login') {
                    setTimeout(() => router.navigate('login'), 0);
                    return false;
                }
                return true;
            }
            
            const isAuthenticated = supabaseClient.isAuthenticated();
            const currentUser = supabaseClient.getCurrentUser();
            const isLoginPage = to.path === 'login';
            const requiresAuth = to.meta?.requiresAuth !== false;
            
            logger.log('Navigation guard:', { 
                from: from?.path || 'initial',
                to: to.path, 
                isAuthenticated, 
                hasUser: !!currentUser, 
                isLoginPage,
                requiresAuth,
                userEmail: currentUser?.email
            });
            
            // If route requires auth and user is not authenticated, redirect to login
            if (requiresAuth && !isAuthenticated && !isLoginPage) {
                logger.log('Redirecting to login - route requires auth but user not authenticated');
                setTimeout(() => router.navigate('login'), 0);
                return false;
            }
            
            // If authenticated and going to login, redirect to dashboard
            if (isAuthenticated && currentUser && isLoginPage) {
                logger.log('Redirecting to dashboard - user already authenticated');
                setTimeout(() => router.navigate('dashboard'), 0);
                return false;
            }
            
            return true;
        });

        // Register routes
        router
            .register('login', {
                title: 'Login - PunktStudio',
                component: async () => {
                    const module = await import('../pages/login.js');
                    return module.default();
                },
                meta: { requiresAuth: false }
            })
            .register('dashboard', {
                title: 'Dashboard - PunktStudio',
                component: async () => {
                    const module = await import('../pages/dashboard.js');
                    return await module.default();
                },
                meta: { requiresAuth: true }
            })
            .register('projects', {
                title: 'Projects - PunktStudio',
                component: async () => {
                    const module = await import('../pages/projects.js');
                    return await module.default();
                },
                meta: { requiresAuth: true }
            })
            .register('participants', {
                title: 'Participants - PunktStudio',
                component: async (route, context) => {
                    const module = await import('../pages/participants.js');
                    return await module.default(route, context);
                },
                meta: { requiresAuth: true }
            })
            .register('roles', {
                title: 'Roles - PunktStudio',
                component: async (route, context) => {
                    const module = await import('../pages/roles.js');
                    return await module.default(route, context);
                },
                meta: { requiresAuth: true }
            })
            .register('custom-tables', {
                title: 'Custom Tables - PunktStudio',
                component: async (route, context) => {
                    const module = await import('../pages/custom-tables.js');
                    return await module.default(route, context);
                },
                meta: { requiresAuth: true }
            })
            .register('map-settings', {
                title: 'Map Settings - PunktStudio',
                component: async (route, context) => {
                    const module = await import('../pages/map-layers.js');
                    return await module.default(route, context);
                },
                meta: { requiresAuth: true }
            })
            .register('rules', {
                title: 'Rules - PunktStudio',
                component: async (route, context) => {
                    const module = await import('../pages/rules.js');
                    return await module.default(route, context);
                },
                meta: { requiresAuth: true }
            })
            .register('workflows', {
                title: 'Workflows - PunktStudio',
                component: async (route, context) => {
                    const module = await import('../pages/workflows.js');
                    return await module.default(route, context);
                },
                meta: { requiresAuth: true }
            })
            .register('workflow-builder', {
                title: 'Workflow Builder - PunktStudio',
                component: async (route, context) => {
                    const module = await import('../pages/workflow-builder.js');
                    return await module.default(route, context);
                },
                meta: { requiresAuth: true }
            })
            .register('marker-categories', {
                title: 'Marker Categories - PunktStudio',
                component: async (route, context) => {
                    const module = await import('../pages/marker-categories.js');
                    return await module.default(route, context);
                },
                meta: { requiresAuth: true }
            })
            .register('custom-tables/edit', {
                title: 'Edit Table - PunktStudio',
                component: async (route, context) => {
                    const module = await import('../pages/custom-table-edit.js');
                    return await module.default(route, context);
                },
                meta: { requiresAuth: true }
            })
            .register('tablesedit', {
                title: 'Edit Table Structure - PunktStudio',
                component: async (route, context) => {
                    const module = await import('../pages/tablesedit.js');
                    return await module.default(route, context);
                },
                meta: { requiresAuth: true }
            })
            .register('marker-category-edit', {
                title: 'Edit Marker Category Fields - PunktStudio',
                component: async (route, context) => {
                    const module = await import('../pages/marker-category-edit.js');
                    return await module.default(route, context);
                },
                meta: { requiresAuth: true }
            });

        // Mark router as ready after all routes are registered
        router.ready();
    }

    /**
     * Set up UI event listeners
     */
    setupEventListeners() {
        // Logout functionality is now handled by the UserDropdown component

        // Menu navigation is now handled in setupMenuEventListeners()

        // Close notifications on click
        Utils.DOM.on(document, 'click', (e) => {
            if (e.target.classList.contains('notification-close')) {
                const notification = e.target.closest('.notification');
                if (notification) {
                    this.removeNotification(notification);
                }
            }
        });

        // Handle modal overlay clicks
        const modalOverlay = document.getElementById('modal-overlay');
        if (modalOverlay) {
            Utils.DOM.on(modalOverlay, 'click', (e) => {
                if (e.target === modalOverlay) {
                    this.closeAllModals();
                }
            });
        }

        // Handle escape key for modals
        Utils.DOM.on(document, 'keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });
    }

    /**
     * Handle initial routing based on auth state
     */
    async handleInitialRoute() {
        // Wait for Supabase to initialize and check session
        let attempts = 0;
        const maxAttempts = 10;
        
        while (!supabaseClient.isInitialized && attempts < maxAttempts) {
            logger.log(`Waiting for Supabase initialization (attempt ${attempts + 1}/${maxAttempts})`);
            await Utils.Async.delay(200);
            attempts++;
        }
        
        if (!supabaseClient.isInitialized) {
            logger.error('Supabase failed to initialize, proceeding with login route');
            router.navigate('login');
            return;
        }
        
        const isAuthenticated = supabaseClient.isAuthenticated();
        const currentUser = supabaseClient.getCurrentUser();
        const currentHash = window.location.hash.slice(1) || 'dashboard';
        
        logger.log('Initial route check:', { 
            isAuthenticated, 
            hasUser: !!currentUser, 
            currentHash, 
            userEmail: currentUser?.email,
            totalRoutes: router.getRoutes().length
        });
        
        if (isAuthenticated && currentUser) {
            // User is authenticated, go to requested page or dashboard
            if (currentHash === 'login') {
                logger.log('User authenticated but on login page, redirecting to dashboard');
                router.navigate('dashboard');
            } else {
                logger.log(`User authenticated, navigating to requested page: ${currentHash}`);
                router.navigate(currentHash);
            }
        } else {
            // User not authenticated, go to login
            logger.log('No authenticated user found, redirecting to login');
            router.navigate('login');
        }
    }

    /**
     * Handle user logout
     */
    async handleLogout() {
        try {
            await supabaseClient.signOut();
        } catch (error) {
            logger.error('Logout error:', error);
            this.showNotification('error', 'Logout Failed', error.message);
        }
    }

    /**
     * Update user info in UI
     */
    updateUserInfo() {
        const userInfoElement = document.getElementById('current-user');
        if (userInfoElement) {
            if (this.currentUser) {
                userInfoElement.textContent = this.currentUser.email || 'Unknown User';
            } else {
                userInfoElement.textContent = 'Not logged in';
            }
        }
        
        // Update user dropdown with current user info
        if (this.userDropdown) {
            this.userDropdown.updateUser(this.currentUser);
        }
    }

    /**
     * Show loading overlay
     */
    showLoadingOverlay() {
        const overlay = document.getElementById('loading-overlay');
        const app = document.getElementById('app');
        
        if (overlay) Utils.DOM.show(overlay);
        if (app) Utils.DOM.hide(app);
    }

    /**
     * Hide loading overlay
     */
    hideLoadingOverlay() {
        const overlay = document.getElementById('loading-overlay');
        const app = document.getElementById('app');
        
        if (overlay) Utils.DOM.hide(overlay);
        if (app) Utils.DOM.show(app);
    }

    /**
     * Show notification
     */
    showNotification(type, title, message, duration = 5000) {
        const container = document.getElementById('notifications');
        if (!container) return;

        const notification = Utils.DOM.create('div', {
            className: `notification ${type}`,
            innerHTML: `
                <div class="notification-content">
                    <div class="notification-title">${title}</div>
                    <p class="notification-message">${message}</p>
                </div>
                <button class="notification-close" type="button">&times;</button>
            `
        });

        container.appendChild(notification);

        // Auto-remove notification
        if (duration > 0) {
            setTimeout(() => {
                this.removeNotification(notification);
            }, duration);
        }

        return notification;
    }

    /**
     * Remove notification
     */
    removeNotification(notification) {
        if (notification && notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease-in';
            setTimeout(() => {
                Utils.DOM.remove(notification);
            }, 300);
        }
    }

    /**
     * Show error state
     */
    showError(title, message) {
        this.showNotification('error', title, message, 0);
    }

    /**
     * Close all modals
     */
    closeAllModals() {
        const modalOverlay = document.getElementById('modal-overlay');
        const modals = Utils.DOM.findAll('.modal');
        
        if (modalOverlay) Utils.DOM.hide(modalOverlay);
        modals.forEach(modal => Utils.DOM.hide(modal));
    }

    /**
     * Get current user
     */
    getCurrentUser() {
        return this.currentUser;
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return supabaseClient.isAuthenticated();
    }

    /**
     * Show sidebar for authenticated users
     */
    showSidebar() {
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.querySelector('.main-content');
        if (sidebar) {
            sidebar.style.display = 'flex';
        }
        if (mainContent) {
            mainContent.style.marginLeft = 'var(--sidebar-width)';
        }
    }

    /**
     * Hide sidebar for unauthenticated users (login page)
     */
    hideSidebar() {
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.querySelector('.main-content');
        if (sidebar) {
            sidebar.style.display = 'none';
        }
        if (mainContent) {
            mainContent.style.marginLeft = '0';
        }
    }
}

// Create global app instance
const app = new App();

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
} else {
    app.init();
}

// Make app available globally for debugging
window.app = app;

export default app;
