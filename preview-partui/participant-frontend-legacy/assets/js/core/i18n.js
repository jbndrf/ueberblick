/**
 * Simplified Internationalization Service for Participants App
 * Provides translation functionality with automatic DOM updates
 */

class SimpleI18nService {
    constructor() {
        this.currentLanguage = localStorage.getItem('language') || 'en';
        this.translations = {};
        this.fallbackLanguage = 'en';
        this.observers = [];
        this.isInitialized = false;
    }

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

    async init() {
        if (!this.isInitialized) {
            await this.loadLanguage(this.currentLanguage);
            this.isInitialized = true;
        }
    }

    t(key, params = {}) {
        const translation = this.getTranslation(key);
        return this.interpolate(translation, params);
    }

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

    getFallbackTranslation(key) {
        const keys = key.split('.');
        let translation = this.translations[this.fallbackLanguage];
        
        for (const k of keys) {
            translation = translation?.[k];
        }
        
        return translation;
    }

    interpolate(text, params) {
        if (typeof text !== 'string' || !params) return text;
        
        return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return params.hasOwnProperty(key) ? params[key] : match;
        });
    }

    getCurrentLanguage() {
        return this.currentLanguage;
    }

    async switchLanguage(lang) {
        if (lang !== this.currentLanguage) {
            await this.loadLanguage(lang);
        }
    }

    subscribe(callback) {
        this.observers.push(callback);
    }

    notifyObservers() {
        this.observers.forEach(callback => {
            try {
                callback(this.currentLanguage);
            } catch (error) {
                console.error('Error in i18n observer:', error);
            }
        });
    }

    // Auto-translate elements with data-i18n attribute
    translatePage() {
        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(element => {
            const key = element.getAttribute('data-i18n');
            const params = element.getAttribute('data-i18n-params');
            const parsedParams = params ? JSON.parse(params) : {};
            
            const translation = this.t(key, parsedParams);
            
            if (element.hasAttribute('data-i18n-attr')) {
                const attr = element.getAttribute('data-i18n-attr');
                element.setAttribute(attr, translation);
            } else {
                element.textContent = translation;
            }
        });
    }
}

// Create singleton instance
const i18n = new SimpleI18nService();

// Auto-translate on language change
i18n.subscribe(() => {
    i18n.translatePage();
});

// Auto-translate when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    i18n.init().then(() => {
        i18n.translatePage();
    });
});

// Export for use in modules
window.i18n = i18n;

export default i18n;