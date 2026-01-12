/**
 * Role Selector Component
 * Allows users to view and switch between available roles
 */

import eventManager from '../core/event-manager.js';
import participantAuth from '../auth/participant-auth.js';
import DebugLogger from '../core/debug-logger.js';

class RoleSelector {
    constructor() {
        this.logger = new DebugLogger('RoleSelector');
        this.currentRoleId = null;
        this.availableRoles = [];
        this.container = null;
        this.isVisible = false;
    }

    /**
     * Initialize the role selector
     */
    async initialize() {
        try {
            // Ensure participant is authenticated first
            if (!participantAuth.isAuthenticated()) {
                throw new Error('Participant must be authenticated before initializing role selector');
            }
            
            // Load available roles (get fresh roles from auth system)
            this.availableRoles = participantAuth.getParticipantRoles() || [];
            
            this.logger.log('Available participant roles:', this.availableRoles);
            
            // Set initial role (first available role)
            if (this.availableRoles.length > 0) {
                this.currentRoleId = this.availableRoles[0].id;
                this.logger.log('Set initial role:', this.availableRoles[0]);
            } else {
                this.logger.warn('No roles available for participant');
            }
            
            // Create the UI
            this.createUI();
            
            // Setup event handlers
            this.setupEventHandlers();
            
            this.logger.log('Role selector initialized with roles:', this.availableRoles);
            
        } catch (error) {
            this.logger.error('Failed to initialize role selector:', error);
            throw error;
        }
    }

    /**
     * Create the role selector UI
     */
    createUI() {
        // Create container
        this.container = document.createElement('div');
        this.container.className = 'role-selector';
        this.container.id = 'roleSelector';

        // Create button to show current role
        const roleButton = document.createElement('button');
        roleButton.className = 'role-selector-button';
        roleButton.id = 'roleSelectorButton';
        
        this.updateButtonText(roleButton);
        
        // Create dropdown menu
        const dropdown = document.createElement('div');
        dropdown.className = 'role-selector-dropdown';
        dropdown.id = 'roleSelectorDropdown';
        
        this.populateDropdown(dropdown);
        
        // Assemble the component
        this.container.appendChild(roleButton);
        this.container.appendChild(dropdown);
        
        // Add to page
        document.body.appendChild(this.container);
    }

    /**
     * Update the main button text with current role
     */
    updateButtonText(button) {
        const currentRole = this.getCurrentRole();
        const roleName = currentRole ? currentRole.name : 'No Role';
        button.innerHTML = `
            <span class="role-icon">User</span>
            <span class="role-name">${roleName}</span>
            <span class="dropdown-arrow">v</span>
        `;
        button.title = `Current role: ${roleName}`;
    }

    /**
     * Populate the dropdown with available roles
     */
    populateDropdown(dropdown) {
        dropdown.innerHTML = '';
        
        if (this.availableRoles.length === 0) {
            const noRoleItem = document.createElement('div');
            noRoleItem.className = 'role-dropdown-item disabled';
            noRoleItem.textContent = 'No roles available';
            dropdown.appendChild(noRoleItem);
            return;
        }

        this.availableRoles.forEach(role => {
            const roleItem = document.createElement('div');
            roleItem.className = 'role-dropdown-item';
            roleItem.dataset.roleId = role.id;
            
            if (role.id === this.currentRoleId) {
                roleItem.classList.add('active');
            }
            
            roleItem.innerHTML = `
                <span class="role-item-name">${role.name}</span>
                ${role.description ? `<span class="role-item-description">${role.description}</span>` : ''}
            `;
            
            dropdown.appendChild(roleItem);
        });
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        // Clear existing handlers
        eventManager.removeByComponent('role-selector');

        // Button click to toggle dropdown
        const button = document.getElementById('roleSelectorButton');
        if (button) {
            eventManager.add(button, 'click', (e) => {
                e.stopPropagation();
                this.toggleDropdown();
            }, {
                component: 'role-selector',
                description: 'Role selector button click'
            });
        }

        // Dropdown item clicks
        const dropdown = document.getElementById('roleSelectorDropdown');
        if (dropdown) {
            eventManager.add(dropdown, 'click', (e) => {
                e.stopPropagation();
                const roleItem = e.target.closest('.role-dropdown-item');
                if (roleItem && !roleItem.classList.contains('disabled')) {
                    const roleId = roleItem.dataset.roleId;
                    this.selectRole(roleId);
                }
            }, {
                component: 'role-selector',
                description: 'Role dropdown item click'
            });
        }

        // Click outside to close dropdown
        eventManager.add(document, 'click', (e) => {
            if (this.isVisible && !this.container.contains(e.target)) {
                this.hideDropdown();
            }
        }, {
            component: 'role-selector',
            description: 'Click outside to close role dropdown'
        });

        // Escape key to close dropdown
        eventManager.add(document, 'keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.hideDropdown();
            }
        }, {
            component: 'role-selector',
            description: 'Escape key to close role dropdown'
        });
    }

    /**
     * Toggle dropdown visibility
     */
    toggleDropdown() {
        if (this.isVisible) {
            this.hideDropdown();
        } else {
            this.showDropdown();
        }
    }

    /**
     * Show dropdown
     */
    showDropdown() {
        const dropdown = document.getElementById('roleSelectorDropdown');
        if (dropdown) {
            dropdown.classList.add('visible');
            this.isVisible = true;
        }
    }

    /**
     * Hide dropdown
     */
    hideDropdown() {
        const dropdown = document.getElementById('roleSelectorDropdown');
        if (dropdown) {
            dropdown.classList.remove('visible');
            this.isVisible = false;
        }
    }

    /**
     * Select a role
     */
    selectRole(roleId) {
        if (roleId === this.currentRoleId) {
            this.hideDropdown();
            return;
        }

        const oldRoleId = this.currentRoleId;
        this.currentRoleId = roleId;

        // Update UI
        this.updateButtonText(document.getElementById('roleSelectorButton'));
        this.populateDropdown(document.getElementById('roleSelectorDropdown'));
        
        // Hide dropdown
        this.hideDropdown();

        // Dispatch role change event
        this.dispatchRoleChangeEvent(oldRoleId, roleId);
        
        this.logger.log('Role selected:', this.getCurrentRole());
    }

    /**
     * Dispatch role change event
     */
    dispatchRoleChangeEvent(oldRoleId, newRoleId) {
        const event = new CustomEvent('roleChanged', {
            detail: {
                oldRoleId,
                newRoleId,
                oldRole: this.availableRoles.find(r => r.id === oldRoleId),
                newRole: this.getCurrentRole()
            }
        });
        
        window.dispatchEvent(event);
    }

    /**
     * Get current selected role
     */
    getCurrentRole() {
        return this.availableRoles.find(role => role.id === this.currentRoleId) || null;
    }

    /**
     * Get current role ID
     */
    getCurrentRoleId() {
        return this.currentRoleId;
    }

    /**
     * Update available roles (for future multi-role support)
     */
    updateRoles(roles) {
        this.availableRoles = roles || [];
        
        // Reset current role if it's no longer available
        if (!this.availableRoles.find(r => r.id === this.currentRoleId)) {
            this.currentRoleId = this.availableRoles.length > 0 ? this.availableRoles[0].id : null;
        }
        
        // Update UI
        if (this.container) {
            this.updateButtonText(document.getElementById('roleSelectorButton'));
            this.populateDropdown(document.getElementById('roleSelectorDropdown'));
        }
    }

    /**
     * Show/hide the role selector
     */
    setVisibility(visible) {
        if (this.container) {
            this.container.style.display = visible ? 'block' : 'none';
        }
    }

    /**
     * Cleanup
     */
    cleanup() {
        eventManager.removeByComponent('role-selector');
        
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        
        this.container = null;
        this.isVisible = false;
    }
}

// Create singleton instance
const roleSelector = new RoleSelector();

export default roleSelector;