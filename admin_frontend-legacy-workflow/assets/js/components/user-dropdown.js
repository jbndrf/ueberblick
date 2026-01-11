/**
 * User Dropdown Component
 * Combines user info, language switching, and logout functionality in a single dropdown
 */

import { i18n } from '../core/i18n.js';

class UserDropdown {
    constructor() {
        this.languages = [
            { code: 'en', name: 'English', flag: 'EN' },
            { code: 'de', name: 'Deutsch', flag: 'DE' }
        ];
        this.container = null;
        this.currentUser = null;
    }

    /**
     * Create and render the user dropdown
     * @param {Element} parentElement - Parent element to append the dropdown to
     * @param {string} position - Position class ('top-right', etc.)
     * @returns {Element} Created dropdown element
     */
    render(parentElement, position = 'top-right') {
        this.container = document.createElement('div');
        this.container.className = `user-dropdown ${position}`;
        
        // Create dropdown structure
        const dropdown = document.createElement('div');
        dropdown.className = 'user-dropdown-menu';
        
        const trigger = document.createElement('button');
        trigger.className = 'user-trigger';
        trigger.setAttribute('aria-haspopup', 'true');
        trigger.setAttribute('aria-expanded', 'false');
        
        // Initially show loading state
        this.updateTrigger(trigger, null);
        
        const menu = document.createElement('div');
        menu.className = 'user-menu';
        menu.setAttribute('role', 'menu');
        
        // Create menu structure
        this.buildMenuContent(menu);
        
        dropdown.appendChild(trigger);
        dropdown.appendChild(menu);
        this.container.appendChild(dropdown);
        
        // Add event listeners
        this.setupEventListeners(trigger, menu);
        
        // Subscribe to language changes
        i18n.subscribe((newLang) => this.updateLanguageState(newLang));
        
        if (parentElement) {
            parentElement.appendChild(this.container);
        }
        
        return this.container;
    }

    /**
     * Build the menu content structure
     * @param {Element} menu - Menu element to populate
     */
    buildMenuContent(menu) {
        menu.innerHTML = `
            <div class="menu-section user-info-section">
                <div class="user-email" id="user-dropdown-email">Loading...</div>
                <div class="user-role" id="user-dropdown-role">-</div>
            </div>
            
            <div class="menu-divider"></div>
            
            <div class="menu-section language-section">
                <div class="section-label">Language</div>
                <div class="language-options">
                    ${this.languages.map(language => `
                        <button class="language-option ${language.code === i18n.getCurrentLanguage() ? 'active' : ''}" 
                                data-lang="${language.code}" 
                                role="menuitem">
                            <span class="flag">${language.flag}</span>
                            <span class="name">${language.name}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
            
            <div class="menu-divider"></div>
            
            <div class="menu-section actions-section">
                <button class="user-action-btn logout-btn" role="menuitem">
                    <span class="icon">×</span>
                    <span data-i18n="actions.logout">Logout</span>
                </button>
            </div>
        `;

        // Set up language option listeners
        const languageOptions = menu.querySelectorAll('.language-option');
        languageOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const langCode = option.getAttribute('data-lang');
                this.switchLanguage(langCode);
            });
        });

        // Set up logout button listener
        const logoutBtn = menu.querySelector('.logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleLogout();
            });
        }
    }

    /**
     * Update the trigger button content
     * @param {Element} trigger - Trigger button element
     * @param {Object} user - User object
     */
    updateTrigger(trigger, user) {
        const currentLang = this.languages.find(lang => lang.code === i18n.getCurrentLanguage());
        
        if (user) {
            trigger.innerHTML = `
                <div class="user-avatar">
                    <span class="avatar-text">${this.getInitials(user.email)}</span>
                </div>
                <div class="user-details">
                    <div class="user-name">${this.getDisplayName(user)}</div>
                </div>
                <span class="arrow">▼</span>
            `;
        } else {
            trigger.innerHTML = `
                <div class="user-avatar loading">
                    <span class="avatar-text">?</span>
                </div>
                <div class="user-details">
                    <div class="user-name">Loading...</div>
                </div>
                <span class="arrow">▼</span>
            `;
        }
    }

    /**
     * Get user initials for avatar
     * @param {string} email - User email
     * @returns {string} Initials
     */
    getInitials(email) {
        if (!email) return '?';
        const localPart = email.split('@')[0];
        const parts = localPart.split('.');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        // For single words like "demo", take first letter + a generic second letter
        return localPart[0].toUpperCase() + (localPart[1] || 'U').toUpperCase();
    }

    /**
     * Get display name for user
     * @param {Object} user - User object
     * @returns {string} Display name
     */
    getDisplayName(user) {
        if (!user) return 'Unknown User';
        // Try to extract name from email
        const emailPart = user.email?.split('@')[0] || 'user';
        return emailPart.replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    /**
     * Set up event listeners for dropdown functionality
     * @param {Element} trigger - Dropdown trigger button
     * @param {Element} menu - Dropdown menu
     */
    setupEventListeners(trigger, menu) {
        // Toggle dropdown
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isExpanded = trigger.getAttribute('aria-expanded') === 'true';
            this.toggleDropdown(!isExpanded);
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target)) {
                this.toggleDropdown(false);
            }
        });
        
        // Keyboard navigation
        trigger.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.toggleDropdown(true);
                const firstFocusable = menu.querySelector('button, [tabindex="0"]');
                if (firstFocusable) firstFocusable.focus();
            }
        });
        
        // Menu keyboard navigation
        menu.addEventListener('keydown', (e) => {
            const focusableElements = menu.querySelectorAll('button, [tabindex="0"]');
            const currentIndex = Array.from(focusableElements).indexOf(document.activeElement);
            
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    const nextIndex = (currentIndex + 1) % focusableElements.length;
                    focusableElements[nextIndex]?.focus();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    const prevIndex = (currentIndex - 1 + focusableElements.length) % focusableElements.length;
                    focusableElements[prevIndex]?.focus();
                    break;
                case 'Escape':
                    this.toggleDropdown(false);
                    trigger.focus();
                    break;
            }
        });
    }

    /**
     * Toggle dropdown visibility
     * @param {boolean} show - Whether to show the dropdown
     */
    toggleDropdown(show) {
        const trigger = this.container.querySelector('.user-trigger');
        const menu = this.container.querySelector('.user-menu');
        
        trigger.setAttribute('aria-expanded', show.toString());
        menu.style.display = show ? 'block' : 'none';
        
        if (show) {
            this.container.classList.add('open');
        } else {
            this.container.classList.remove('open');
        }
    }

    /**
     * Update user information in the dropdown
     * @param {Object} user - User object
     */
    updateUser(user) {
        this.currentUser = user;
        
        // Update trigger
        const trigger = this.container.querySelector('.user-trigger');
        if (trigger) {
            this.updateTrigger(trigger, user);
        }
        
        // Update menu user info
        const emailElement = this.container.querySelector('#user-dropdown-email');
        const roleElement = this.container.querySelector('#user-dropdown-role');
        
        if (emailElement) {
            emailElement.textContent = user?.email || 'Unknown User';
        }
        
        if (roleElement) {
            // You can extend this to show actual user role if available
            roleElement.textContent = user?.role || 'User';
        }
    }

    /**
     * Switch to a different language
     * @param {string} langCode - Language code to switch to
     */
    async switchLanguage(langCode) {
        try {
            await i18n.switchLanguage(langCode);
            this.toggleDropdown(false);
            
            // Update trigger with new language
            const trigger = this.container.querySelector('.user-trigger');
            if (trigger) {
                this.updateTrigger(trigger, this.currentUser);
            }
            
            // Show success message
            this.showNotification(`Language switched to ${this.languages.find(l => l.code === langCode)?.name}`);
        } catch (error) {
            console.error('Failed to switch language:', error);
            this.showNotification('Failed to switch language', 'error');
        }
    }

    /**
     * Update language state in UI
     * @param {string} newLang - New language code
     */
    updateLanguageState(newLang) {
        // Update trigger
        const trigger = this.container.querySelector('.user-trigger');
        if (trigger) {
            this.updateTrigger(trigger, this.currentUser);
        }
        
        // Update language options
        const languageOptions = this.container.querySelectorAll('.language-option');
        languageOptions.forEach(option => {
            option.classList.toggle('active', option.getAttribute('data-lang') === newLang);
        });
    }

    /**
     * Handle logout action
     */
    async handleLogout() {
        this.toggleDropdown(false);
        
        // Call the global app logout handler
        if (window.app && typeof window.app.handleLogout === 'function') {
            await window.app.handleLogout();
        } else {
            console.error('App logout handler not available');
        }
    }

    /**
     * Show notification (integrate with existing notification system)
     * @param {string} message - Message to show
     * @param {string} type - Notification type ('success', 'error', etc.)
     */
    showNotification(message, type = 'success') {
        // Integrate with app's notification system
        if (window.app && window.app.showNotification) {
            window.app.showNotification(type, 'Settings', message);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    /**
     * Destroy the user dropdown
     */
    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}

export default UserDropdown;