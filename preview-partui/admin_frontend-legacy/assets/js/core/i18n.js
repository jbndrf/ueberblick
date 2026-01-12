/**
 * Internationalization Service
 * Provides translation functionality for the admin frontend
 */

class I18nService {
    constructor() {
        this.currentLanguage = localStorage.getItem('language') || 'en';
        this.translations = {};
        this.fallbackLanguage = 'en';
        this.observers = [];
    }

    /**
     * Load translation file for a specific language
     * @param {string} lang - Language code (e.g., 'en', 'de', 'fr')
     */
    async loadLanguage(lang) {
        try {
            if (this.translations[lang]) {
                this.currentLanguage = lang;
                this.notifyObservers();
                return;
            }

            const response = await fetch(`assets/locales/${lang}.json`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            this.translations[lang] = await response.json();
            this.currentLanguage = lang;
            localStorage.setItem('language', lang);
            this.notifyObservers();
            
            console.log(`Loaded language: ${lang}`);
        } catch (error) {
            console.warn(`Failed to load language ${lang}:`, error);
            if (lang !== this.fallbackLanguage) {
                await this.loadLanguage(this.fallbackLanguage);
            }
        }
    }

    /**
     * Initialize the translation service
     */
    async init() {
        await this.loadLanguage(this.currentLanguage);
    }

    /**
     * Get translated text
     * @param {string} key - Translation key (supports dot notation: 'nav.dashboard')
     * @param {object} params - Parameters for interpolation
     * @returns {string} Translated text
     */
    t(key, params = {}) {
        const translation = this.getTranslation(key);
        return this.interpolate(translation, params);
    }

    /**
     * Get translation without interpolation
     * @param {string} key - Translation key
     * @returns {string} Raw translation
     */
    getTranslation(key) {
        const keys = key.split('.');
        let translation = this.translations[this.currentLanguage];
        
        for (const k of keys) {
            translation = translation?.[k];
        }
        
        if (translation === undefined && this.currentLanguage !== this.fallbackLanguage) {
            return this.getFallbackTranslation(key);
        }
        
        return translation || key;
    }

    /**
     * Get fallback translation
     * @param {string} key - Translation key
     * @returns {string} Fallback translation
     */
    getFallbackTranslation(key) {
        const keys = key.split('.');
        let translation = this.translations[this.fallbackLanguage];
        
        for (const k of keys) {
            translation = translation?.[k];
        }
        
        return translation;
    }

    /**
     * Interpolate parameters into translation
     * @param {string} text - Text with placeholders
     * @param {object} params - Parameters to interpolate
     * @returns {string} Interpolated text
     */
    interpolate(text, params) {
        if (typeof text !== 'string' || !params) return text;
        
        return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return params.hasOwnProperty(key) ? params[key] : match;
        });
    }

    /**
     * Get current language
     * @returns {string} Current language code
     */
    getCurrentLanguage() {
        return this.currentLanguage;
    }

    /**
     * Get available languages
     * @returns {Array} Array of loaded language codes
     */
    getAvailableLanguages() {
        return Object.keys(this.translations);
    }

    /**
     * Switch to a different language
     * @param {string} lang - Language code to switch to
     */
    async switchLanguage(lang) {
        if (lang !== this.currentLanguage) {
            await this.loadLanguage(lang);
        }
    }

    /**
     * Subscribe to language changes
     * @param {Function} callback - Callback function to execute on language change
     */
    subscribe(callback) {
        this.observers.push(callback);
    }

    /**
     * Unsubscribe from language changes
     * @param {Function} callback - Callback function to remove
     */
    unsubscribe(callback) {
        const index = this.observers.indexOf(callback);
        if (index > -1) {
            this.observers.splice(index, 1);
        }
    }

    /**
     * Notify observers of language changes
     */
    notifyObservers() {
        this.observers.forEach(callback => {
            try {
                callback(this.currentLanguage);
            } catch (error) {
                console.error('Error in i18n observer:', error);
            }
        });
    }

    /**
     * Translate plural forms
     * @param {string} key - Base translation key
     * @param {number} count - Count for plural determination
     * @param {object} params - Additional parameters
     * @returns {string} Pluralized translation
     */
    tp(key, count, params = {}) {
        const pluralKey = count === 1 ? `${key}_one` : `${key}_other`;
        const translation = this.getTranslation(pluralKey) || this.getTranslation(key);
        return this.interpolate(translation, { count, ...params });
    }
}

// DOM helper functions for automatic translation updates
class I18nDOMHelper {
    constructor(i18nService) {
        this.i18n = i18nService;
        this.translatedElements = new Map();
    }

    /**
     * Translate element content and remember it for future updates
     * @param {Element} element - DOM element to translate
     * @param {string} key - Translation key
     * @param {object} params - Translation parameters
     * @param {string} attribute - Attribute to translate (default: textContent)
     */
    translateElement(element, key, params = {}, attribute = 'textContent') {
        if (!element) return;
        
        // Store translation info for later updates
        this.translatedElements.set(element, { key, params, attribute });
        
        // Apply translation
        this.updateElement(element, key, params, attribute);
    }

    /**
     * Update element with translation
     * @param {Element} element - DOM element
     * @param {string} key - Translation key
     * @param {object} params - Translation parameters
     * @param {string} attribute - Attribute to translate
     */
    updateElement(element, key, params, attribute) {
        const translation = this.i18n.t(key, params);
        
        if (attribute === 'textContent' || attribute === 'innerText') {
            element.textContent = translation;
        } else if (attribute === 'innerHTML') {
            element.innerHTML = translation;
        } else {
            element.setAttribute(attribute, translation);
        }
    }

    /**
     * Update all registered elements with new translations
     */
    updateAllElements() {
        // Clean up elements that are no longer in the DOM and update the rest
        const elementsToRemove = [];
        
        this.translatedElements.forEach((info, element) => {
            if (document.contains(element)) {
                this.updateElement(element, info.key, info.params, info.attribute);
            } else {
                elementsToRemove.push(element);
            }
        });
        
        // Remove elements that are no longer in the DOM
        elementsToRemove.forEach(element => {
            this.translatedElements.delete(element);
        });
    }

    /**
     * Translate elements with data-i18n attribute
     */
    translateDataAttributes() {
        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(element => {
            const key = element.getAttribute('data-i18n');
            const params = element.getAttribute('data-i18n-params');
            const parsedParams = params ? JSON.parse(params) : {};
            
            this.translateElement(element, key, parsedParams);
        });
    }
}

// Create singleton instances
export const i18n = new I18nService();
export const i18nDOM = new I18nDOMHelper(i18n);

// Set up automatic DOM updates when language changes
i18n.subscribe(() => {
    i18nDOM.updateAllElements();
    i18nDOM.translateDataAttributes();
});

export default i18n;