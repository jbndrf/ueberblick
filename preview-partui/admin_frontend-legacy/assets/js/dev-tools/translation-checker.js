/**
 * Development tool to detect untranslated content
 * Run in browser console: TranslationChecker.findUntranslatedModals()
 */

export class TranslationChecker {
    /**
     * Find modal elements without translation attributes
     */
    static findUntranslatedModals() {
        const modals = document.querySelectorAll('.modal');
        const issues = [];

        modals.forEach((modal, index) => {
            const modalIssues = [];
            
            // Check modal title
            const title = modal.querySelector('.modal-title');
            if (title && !title.hasAttribute('data-i18n')) {
                modalIssues.push(`Title: "${title.textContent}"`);
            }

            // Check modal buttons
            const buttons = modal.querySelectorAll('.modal-footer button');
            buttons.forEach(button => {
                if (!button.hasAttribute('data-i18n') && button.textContent.trim()) {
                    modalIssues.push(`Button: "${button.textContent}"`);
                }
            });

            // Check modal body for hardcoded text
            const bodyText = modal.querySelector('.modal-body');
            if (bodyText) {
                const textNodes = this.getTextNodes(bodyText);
                textNodes.forEach(node => {
                    const text = node.textContent.trim();
                    if (text && text.length > 1 && !this.isTranslationKey(text)) {
                        modalIssues.push(`Text: "${text}"`);
                    }
                });
            }

            if (modalIssues.length > 0) {
                issues.push({
                    modalId: modal.id || `modal-${index}`,
                    issues: modalIssues
                });
            }
        });

        console.table(issues);
        return issues;
    }

    /**
     * Get all text nodes from an element
     */
    static getTextNodes(element) {
        const textNodes = [];
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            // Skip nodes that are inside elements with data-i18n
            if (!node.parentElement.closest('[data-i18n]')) {
                textNodes.push(node);
            }
        }

        return textNodes;
    }

    /**
     * Check if text looks like a translation key
     */
    static isTranslationKey(text) {
        return /^[a-z_]+\.[a-z_]+/.test(text) || text.includes('{{');
    }

    /**
     * Generate translation keys from untranslated text
     */
    static generateTranslationKeys(issues) {
        const keys = {};
        
        issues.forEach(modal => {
            modal.issues.forEach(issue => {
                const text = issue.split(': "')[1]?.slice(0, -1);
                if (text) {
                    const key = this.textToKey(text);
                    keys[key] = text;
                }
            });
        });

        console.log('Suggested translation keys:', keys);
        return keys;
    }

    /**
     * Convert text to translation key format
     */
    static textToKey(text) {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 30);
    }
}

// Make available globally for console use
window.TranslationChecker = TranslationChecker;