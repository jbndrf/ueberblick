/**
 * Language Switcher Component
 * Provides UI for switching between languages
 */

import { i18n, i18nDOM } from '../core/i18n.js';

class LanguageSwitcher {
    constructor() {
        this.languages = [
            { code: 'en', name: 'English', flag: '🇺🇸' },
            { code: 'de', name: 'Deutsch', flag: '🇩🇪' }
        ];
        this.container = null;
    }

    /**
     * Create and render the language switcher
     * @param {Element} parentElement - Parent element to append the switcher to
     * @param {string} position - Position class ('top-right', 'sidebar', etc.)
     * @returns {Element} Created switcher element
     */
    render(parentElement, position = 'top-right') {
        this.container = document.createElement('div');
        this.container.className = `language-switcher ${position}`;
        
        // Create dropdown structure
        const dropdown = document.createElement('div');
        dropdown.className = 'language-dropdown';
        
        const trigger = document.createElement('button');
        trigger.className = 'language-trigger';
        trigger.setAttribute('aria-haspopup', 'true');
        trigger.setAttribute('aria-expanded', 'false');
        
        const currentLang = this.languages.find(lang => lang.code === i18n.getCurrentLanguage());
        trigger.innerHTML = `
            <span class="flag">${currentLang?.flag || '🌐'}</span>
            <span class="lang-code">${currentLang?.code.toUpperCase() || 'EN'}</span>
            <span class="arrow">▼</span>
        `;
        
        const menu = document.createElement('div');
        menu.className = 'language-menu';
        menu.setAttribute('role', 'menu');
        
        // Create menu items
        this.languages.forEach(language => {
            const item = document.createElement('button');
            item.className = 'language-item';
            item.setAttribute('role', 'menuitem');
            item.setAttribute('data-lang', language.code);
            
            item.innerHTML = `
                <span class="flag">${language.flag}</span>
                <span class="name">${language.name}</span>
            `;
            
            if (language.code === i18n.getCurrentLanguage()) {
                item.classList.add('active');
            }
            
            item.addEventListener('click', () => this.switchLanguage(language.code));
            menu.appendChild(item);
        });
        
        dropdown.appendChild(trigger);
        dropdown.appendChild(menu);
        this.container.appendChild(dropdown);
        
        // Add event listeners
        this.setupEventListeners(trigger, menu);
        
        // Subscribe to language changes
        i18n.subscribe((newLang) => this.updateUI(newLang));
        
        if (parentElement) {
            parentElement.appendChild(this.container);
        }
        
        return this.container;
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
                menu.querySelector('.language-item').focus();
            }
        });
        
        menu.addEventListener('keydown', (e) => {
            const items = menu.querySelectorAll('.language-item');
            const currentIndex = Array.from(items).indexOf(document.activeElement);
            
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    const nextIndex = (currentIndex + 1) % items.length;
                    items[nextIndex].focus();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    const prevIndex = (currentIndex - 1 + items.length) % items.length;
                    items[prevIndex].focus();
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
        const trigger = this.container.querySelector('.language-trigger');
        const menu = this.container.querySelector('.language-menu');
        
        trigger.setAttribute('aria-expanded', show.toString());
        menu.style.display = show ? 'block' : 'none';
        
        if (show) {
            this.container.classList.add('open');
        } else {
            this.container.classList.remove('open');
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
            
            // Show success message
            this.showNotification(`Language switched to ${this.languages.find(l => l.code === langCode)?.name}`);
        } catch (error) {
            console.error('Failed to switch language:', error);
            this.showNotification('Failed to switch language', 'error');
        }
    }

    /**
     * Update UI when language changes
     * @param {string} newLang - New language code
     */
    updateUI(newLang) {
        const trigger = this.container.querySelector('.language-trigger');
        const items = this.container.querySelectorAll('.language-item');
        
        const currentLang = this.languages.find(lang => lang.code === newLang);
        if (currentLang && trigger) {
            trigger.innerHTML = `
                <span class="flag">${currentLang.flag}</span>
                <span class="lang-code">${currentLang.code.toUpperCase()}</span>
                <span class="arrow">▼</span>
            `;
        }
        
        // Update active state
        items.forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-lang') === newLang);
        });
    }

    /**
     * Show notification (integrate with existing notification system)
     * @param {string} message - Message to show
     * @param {string} type - Notification type ('success', 'error', etc.)
     */
    showNotification(message, type = 'success') {
        // Integrate with app's notification system
        if (window.app && window.app.showNotification) {
            window.app.showNotification(type, 'Language', message);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    /**
     * Destroy the language switcher
     */
    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}

export default LanguageSwitcher;