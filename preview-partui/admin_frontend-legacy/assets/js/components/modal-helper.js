/**
 * Centralized Modal Helper with i18n support
 * Provides reusable modal templates that automatically handle translations
 */

import { i18n, i18nDOM } from '../core/i18n.js';

export class ModalHelper {
    /**
     * Create a standard modal with i18n support
     * @param {Object} config - Modal configuration
     * @param {string} config.id - Modal ID
     * @param {string} config.titleKey - Translation key for title
     * @param {string} config.content - Modal body content (can contain data-i18n attributes)
     * @param {Array} config.buttons - Array of button configs
     */
    static createModal({ id, titleKey, content = '', buttons = [] }) {
        const defaultButtons = [
            { 
                textKey: 'actions.cancel', 
                className: 'btn btn-secondary', 
                onclick: `closeModal('${id}')` 
            },
            { 
                textKey: 'actions.save', 
                className: 'btn btn-primary', 
                onclick: `saveModal('${id}')` 
            }
        ];

        const modalButtons = buttons.length ? buttons : defaultButtons;
        const buttonHtml = modalButtons.map(btn => 
            `<button class="${btn.className}" onclick="${btn.onclick}" data-i18n="${btn.textKey}">${i18n.t(btn.textKey)}</button>`
        ).join('');

        const modalHtml = `
            <div id="${id}" class="modal" style="display: none;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title" data-i18n="${titleKey}">${i18n.t(titleKey)}</h3>
                        <button class="modal-close" onclick="closeModal('${id}')">&times;</button>
                    </div>
                    <div class="modal-body">
                        ${content}
                    </div>
                    <div class="modal-footer">
                        ${buttonHtml}
                    </div>
                </div>
            </div>
        `;

        return modalHtml;
    }

    /**
     * Show modal and translate content
     */
    static showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
            // Translate any new content in the modal
            setTimeout(() => i18nDOM.translateDataAttributes(), 10);
        }
    }

    /**
     * Close modal
     */
    static closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
        }
    }

    /**
     * Update modal content and re-translate
     */
    static updateModalContent(modalId, content) {
        const modal = document.getElementById(modalId);
        if (modal) {
            const body = modal.querySelector('.modal-body');
            if (body) {
                body.innerHTML = content;
                i18nDOM.translateDataAttributes();
            }
        }
    }

    /**
     * Create common confirmation modal
     */
    static createConfirmModal(messageKey, onConfirm, onCancel = null) {
        const modalId = 'confirm-modal';
        const content = `<p data-i18n="${messageKey}">${i18n.t(messageKey)}</p>`;
        
        const buttons = [
            { textKey: 'actions.cancel', className: 'btn btn-secondary', onclick: onCancel || `ModalHelper.closeModal('${modalId}')` },
            { textKey: 'actions.confirm', className: 'btn btn-danger', onclick: onConfirm }
        ];

        return this.createModal({
            id: modalId,
            titleKey: 'actions.confirm',
            content,
            buttons
        });
    }
}

// Make it globally available for onclick handlers
window.ModalHelper = ModalHelper;
window.closeModal = ModalHelper.closeModal;
window.showModal = ModalHelper.showModal;

export default ModalHelper;