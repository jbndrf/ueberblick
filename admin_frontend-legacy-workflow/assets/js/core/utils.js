/**
 * Utility Functions for Map Survey Admin
 * Common helper functions used throughout the application
 */

import DebugLogger from './debug-logger.js';

const logger = new DebugLogger('Utils');

// DOM Utilities
export const DOM = {
    /**
     * Create element with attributes and content
     */
    create(tag, attributes = {}, content = '') {
        const element = document.createElement(tag);
        
        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'className') {
                element.className = value;
            } else if (key === 'innerHTML') {
                element.innerHTML = value;
            } else if (key === 'textContent') {
                element.textContent = value;
            } else if (key.startsWith('data-')) {
                element.setAttribute(key, value);
            } else {
                element[key] = value;
            }
        });
        
        if (content) {
            if (typeof content === 'string') {
                element.innerHTML = content;
            } else if (content instanceof Node) {
                element.appendChild(content);
            } else if (Array.isArray(content)) {
                content.forEach(child => {
                    if (typeof child === 'string') {
                        element.appendChild(document.createTextNode(child));
                    } else if (child instanceof Node) {
                        element.appendChild(child);
                    }
                });
            }
        }
        
        return element;
    },

    /**
     * Find element by selector
     */
    find(selector, parent = document) {
        return parent.querySelector(selector);
    },

    /**
     * Find all elements by selector
     */
    findAll(selector, parent = document) {
        return Array.from(parent.querySelectorAll(selector));
    },

    /**
     * Remove element from DOM
     */
    remove(element) {
        if (element && element.parentNode) {
            element.parentNode.removeChild(element);
        }
    },

    /**
     * Clear element content
     */
    clear(element) {
        if (element) {
            element.innerHTML = '';
        }
    },

    /**
     * Show element
     */
    show(element) {
        if (element) {
            element.style.display = '';
        }
    },

    /**
     * Hide element
     */
    hide(element) {
        if (element) {
            element.style.display = 'none';
        }
    },

    /**
     * Toggle element visibility
     */
    toggle(element, force = null) {
        if (!element) return;
        
        if (force !== null) {
            element.style.display = force ? '' : 'none';
        } else {
            element.style.display = element.style.display === 'none' ? '' : 'none';
        }
    },

    /**
     * Add event listener with cleanup
     */
    on(element, event, handler, options = {}) {
        if (!element) return () => {};
        
        element.addEventListener(event, handler, options);
        return () => element.removeEventListener(event, handler, options);
    }
};

// String Utilities
export const String = {
    /**
     * Capitalize first letter
     */
    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    },

    /**
     * Convert to camelCase
     */
    toCamelCase(str) {
        return str.replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : '');
    },

    /**
     * Convert to kebab-case
     */
    toKebabCase(str) {
        return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    },

    /**
     * Convert to snake_case
     */
    toSnakeCase(str) {
        return str.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    },

    /**
     * Truncate string with ellipsis
     */
    truncate(str, length = 50, suffix = '...') {
        if (str.length <= length) return str;
        return str.slice(0, length - suffix.length) + suffix;
    },

    /**
     * Generate slug from string
     */
    slugify(str) {
        return str
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, '')
            .replace(/[\s_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
    },

    /**
     * Generate random string
     */
    random(length = 8, chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    },

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        if (text == null) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Date Utilities
export const DateUtils = {
    /**
     * Format date for display
     */
    format(date, options = {}) {
        if (!date) return '';
        
        const d = date instanceof Date ? date : new Date(date);
        
        const defaults = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        
        return d.toLocaleString(undefined, { ...defaults, ...options });
    },

    /**
     * Format date as relative time (e.g., "2 hours ago")
     */
    relative(date) {
        if (!date) return '';
        
        const d = date instanceof Date ? date : new Date(date);
        const now = new Date();
        const diff = now - d;
        
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        const weeks = Math.floor(days / 7);
        const months = Math.floor(days / 30);
        const years = Math.floor(days / 365);
        
        if (years > 0) return `${years} year${years > 1 ? 's' : ''} ago`;
        if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
        if (weeks > 0) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
        if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        if (seconds > 0) return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
        
        return 'just now';
    },

    /**
     * Check if date is today
     */
    isToday(date) {
        if (!date) return false;
        
        const d = date instanceof Date ? date : new Date(date);
        const today = new Date();
        
        return d.toDateString() === today.toDateString();
    },

    /**
     * Get ISO date string for input
     */
    toInputValue(date) {
        if (!date) return '';
        
        const d = date instanceof Date ? date : new Date(date);
        return d.toISOString().slice(0, 16);
    }
};

// Validation Utilities
export const Validation = {
    /**
     * Check if email is valid
     */
    isEmail(email) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    },

    /**
     * Check if URL is valid
     */
    isUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    },

    /**
     * Check if string is not empty
     */
    isRequired(value) {
        return value !== null && value !== undefined && String(value).trim() !== '';
    },

    /**
     * Check minimum length
     */
    minLength(value, min) {
        return String(value).length >= min;
    },

    /**
     * Check maximum length
     */
    maxLength(value, max) {
        return String(value).length <= max;
    },

    /**
     * Check if number is within range
     */
    inRange(value, min, max) {
        const num = Number(value);
        return !isNaN(num) && num >= min && num <= max;
    },

    /**
     * Validate form data
     */
    validateForm(data, rules) {
        const errors = {};
        
        Object.entries(rules).forEach(([field, fieldRules]) => {
            const value = data[field];
            const fieldErrors = [];
            
            fieldRules.forEach(rule => {
                if (typeof rule === 'function') {
                    const result = rule(value);
                    if (result !== true) {
                        fieldErrors.push(result);
                    }
                } else if (typeof rule === 'object') {
                    const { validator, message } = rule;
                    if (!validator(value)) {
                        fieldErrors.push(message);
                    }
                }
            });
            
            if (fieldErrors.length > 0) {
                errors[field] = fieldErrors;
            }
        });
        
        return {
            isValid: Object.keys(errors).length === 0,
            errors
        };
    }
};

// Storage Utilities
export const Storage = {
    /**
     * Get item from localStorage with JSON parsing
     */
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            logger.warn(`Failed to get ${key} from storage:`, error);
            return defaultValue;
        }
    },

    /**
     * Set item in localStorage with JSON stringification
     */
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            logger.error(`Failed to set ${key} in storage:`, error);
            return false;
        }
    },

    /**
     * Remove item from localStorage
     */
    remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            logger.error(`Failed to remove ${key} from storage:`, error);
            return false;
        }
    },

    /**
     * Clear all localStorage
     */
    clear() {
        try {
            localStorage.clear();
            return true;
        } catch (error) {
            logger.error('Failed to clear storage:', error);
            return false;
        }
    }
};

// Async Utilities
export const Async = {
    /**
     * Delay execution
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Retry function with exponential backoff
     */
    async retry(fn, options = {}) {
        const {
            maxAttempts = 3,
            delay = 1000,
            backoff = 2,
            onRetry = null
        } = options;
        
        let attempt = 1;
        
        while (attempt <= maxAttempts) {
            try {
                return await fn();
            } catch (error) {
                if (attempt === maxAttempts) {
                    throw error;
                }
                
                if (onRetry) {
                    onRetry(error, attempt);
                }
                
                await this.delay(delay * Math.pow(backoff, attempt - 1));
                attempt++;
            }
        }
    },

    /**
     * Debounce function
     */
    debounce(fn, delay) {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    /**
     * Throttle function
     */
    throttle(fn, delay) {
        let lastCall = 0;
        return (...args) => {
            const now = Date.now();
            if (now - lastCall >= delay) {
                lastCall = now;
                return fn.apply(this, args);
            }
        };
    }
};

// Array Utilities
export const Arrays = {
    /**
     * Remove duplicates from array
     */
    unique(array, keyFn = null) {
        if (!keyFn) {
            return [...new Set(array)];
        }
        
        const seen = new Set();
        return array.filter(item => {
            const key = keyFn(item);
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    },

    /**
     * Group array by key
     */
    groupBy(array, keyFn) {
        return array.reduce((groups, item) => {
            const key = keyFn(item);
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(item);
            return groups;
        }, {});
    },

    /**
     * Sort array by multiple criteria
     */
    sortBy(array, ...criteria) {
        return array.sort((a, b) => {
            for (const criterion of criteria) {
                let aVal, bVal, order;
                
                if (typeof criterion === 'string') {
                    aVal = a[criterion];
                    bVal = b[criterion];
                    order = 1;
                } else if (typeof criterion === 'function') {
                    aVal = criterion(a);
                    bVal = criterion(b);
                    order = 1;
                } else {
                    const { key, desc = false } = criterion;
                    aVal = typeof key === 'function' ? key(a) : a[key];
                    bVal = typeof key === 'function' ? key(b) : b[key];
                    order = desc ? -1 : 1;
                }
                
                if (aVal < bVal) return -1 * order;
                if (aVal > bVal) return 1 * order;
            }
            return 0;
        });
    },

    /**
     * Chunk array into smaller arrays
     */
    chunk(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
};

// Notification Utilities
export const Notifications = {
    /**
     * Show notification message
     */
    show(message, type = 'info', duration = 5000) {
        // Remove existing notifications
        const existing = document.querySelectorAll('.notification');
        existing.forEach(el => el.remove());
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Add styles
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '12px 16px',
            borderRadius: '4px',
            color: 'white',
            fontWeight: '500',
            zIndex: '10000',
            maxWidth: '400px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            transition: 'all 0.3s ease'
        });
        
        // Set background color based on type
        const colors = {
            success: '#28a745',
            error: '#dc3545',
            warning: '#ffc107',
            info: '#17a2b8'
        };
        notification.style.backgroundColor = colors[type] || colors.info;
        
        // Add to document
        document.body.appendChild(notification);
        
        // Auto remove after duration
        if (duration > 0) {
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.style.opacity = '0';
                    notification.style.transform = 'translateX(100%)';
                    setTimeout(() => notification.remove(), 300);
                }
            }, duration);
        }
        
        return notification;
    },
    
    /**
     * Show success notification
     */
    success(message, duration = 5000) {
        return this.show(message, 'success', duration);
    },
    
    /**
     * Show error notification
     */
    error(message, duration = 7000) {
        return this.show(message, 'error', duration);
    },
    
    /**
     * Show warning notification
     */
    warning(message, duration = 6000) {
        return this.show(message, 'warning', duration);
    },
    
    /**
     * Show info notification
     */
    info(message, duration = 5000) {
        return this.show(message, 'info', duration);
    }
};

// File Utilities
export const Files = {
    /**
     * Read file as text
     */
    readAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = e => reject(e);
            reader.readAsText(file);
        });
    },

    /**
     * Read file as data URL
     */
    readAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = e => reject(e);
            reader.readAsDataURL(file);
        });
    },

    /**
     * Format file size
     */
    formatSize(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * Check file type
     */
    isImage(file) {
        return file.type.startsWith('image/');
    },

    /**
     * Check if file is CSV
     */
    isCSV(file) {
        return file.type === 'text/csv' || file.name.endsWith('.csv');
    }
};

// Export all utilities as default object
export default {
    DOM,
    String,
    DateUtils,
    Validation,
    Storage,
    Async,
    Arrays,
    Notifications,
    Files,
    showNotification: Notifications.show
};