/**
 * Simple Marker UI Designer
 * Entity selector-based layout designer for marker detail displays
 */

import { supabaseClient } from '../core/supabase.js';
import app from '../core/app.js';
import DebugLogger from '../core/debug-logger.js';

const logger = new DebugLogger('SimpleMarkerUIDesigner');

class SimpleMarkerUIDesigner {
    constructor() {
        this.isOpen = false;
        this.currentCategory = null;
        this.fields = [];
        this.layout = {
            header_left: null,
            header_right: null,
            peek1: null,
            peek2: null,
            peek3: null,
            peek4: null,
            expanded_fields: []
        };
        
        this.ensureModalExists();
    }

    // =====================================================
    // MAIN INTERFACE
    // =====================================================

    async designMarkerCategory(categoryId, categoryData) {
        this.currentCategory = { id: categoryId, ...categoryData };
        
        // Load marker category fields and existing layout
        await this.loadCategoryData();
        await this.loadExistingLayout();
        
        this.openModal();
    }

    async loadCategoryData() {
        try {
            // Get category details with fields
            const category = await supabaseClient.getById('marker_categories', this.currentCategory.id);
            
            // Extract available fields from the category
            this.fields = [
                // Basic marker fields
                { key: 'title', label: 'Title', type: 'text', builtin: true },
                { key: 'description', label: 'Description', type: 'text', builtin: true },
                { key: 'created_at', label: 'Created Date', type: 'date', builtin: true },
                { key: 'created_by', label: 'Created By', type: 'text', builtin: true }
            ];
            
            // Add custom fields from category.fields
            if (category.fields && Array.isArray(category.fields)) {
                category.fields.forEach(field => {
                    this.fields.push({
                        key: field.key || field.name,
                        label: field.label || field.name,
                        type: field.type || 'text',
                        builtin: false
                    });
                });
            }
            
            logger.log('Loaded fields for category:', this.fields);
            
        } catch (error) {
            logger.error('Failed to load category data:', error);
            this.fields = [
                { key: 'title', label: 'Title', type: 'text', builtin: true },
                { key: 'description', label: 'Description', type: 'text', builtin: true }
            ];
        }
    }

    async loadExistingLayout() {
        try {
            const contextKey = `marker_category_${this.currentCategory.id}`;
            const configs = await supabaseClient.getAll('ui_configurations', {
                filters: { 
                    project_id: supabaseClient.getCurrentProjectId(),
                    context_type: contextKey
                }
            });

            if (configs.length > 0) {
                const config = configs[0];
                this.layout = config.configuration?.layout || {
                    header_left: null,
                    header_right: null,
                    peek1: null,
                    peek2: null,
                    peek3: null,
                    peek4: null,
                    expanded_fields: []
                };
            } else {
                // Default empty layout
                this.layout = {
                    header_left: null,
                    header_right: null,
                    peek1: null,
                    peek2: null,
                    peek3: null,
                    peek4: null,
                    expanded_fields: []
                };
            }
        } catch (error) {
            logger.error('Failed to load existing layout:', error);
            this.layout = {
                header_left: null,
                header_right: null,
                peek1: null,
                peek2: null,
                peek3: null,
                peek4: null,
                expanded_fields: []
            };
        }
    }

    // =====================================================
    // MODAL MANAGEMENT
    // =====================================================

    ensureModalExists() {
        if (!document.getElementById('simpleMarkerUIDesignerModal')) {
            const modalHTML = `
                <div id="simpleMarkerUIDesignerModal" class="modal" style="display: none;">
                    <div class="modal-content simple-marker-ui-designer-modal">
                        <div class="modal-header">
                            <h2 id="simpleMarkerUIDesignerTitle">Marker UI Designer</h2>
                            <button class="modal-close" id="closeSimpleMarkerUIDesigner">&times;</button>
                        </div>
                        <div class="modal-body" id="simpleMarkerUIDesignerContent">
                            <!-- UI Designer interface will be loaded here -->
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        }
    }

    openModal() {
        const modal = document.getElementById('simpleMarkerUIDesignerModal');
        const title = document.getElementById('simpleMarkerUIDesignerTitle');
        const content = document.getElementById('simpleMarkerUIDesignerContent');
        
        if (!modal || !title || !content) {
            logger.error('Simple Marker UI Designer modal elements not found');
            return;
        }

        title.textContent = `Design UI for "${this.currentCategory.name}" Markers`;
        content.innerHTML = this.renderModalInterface();
        
        // Show modal with explicit sizing
        modal.style.display = 'block';
        modal.style.width = '1800px';
        modal.style.height = '1200px';
        modal.style.maxWidth = '98vw';
        modal.style.maxHeight = '98vh';
        modal.style.position = 'fixed';
        modal.style.top = '50%';
        modal.style.left = '50%';
        modal.style.transform = 'translate(-50%, -50%)';
        modal.style.zIndex = '9999';
        
        this.isOpen = true;
        
        // Set up event listeners
        this.setupEventListeners();
    }

    closeModal() {
        const modal = document.getElementById('simpleMarkerUIDesignerModal');
        if (modal) {
            modal.style.display = 'none';
            this.isOpen = false;
        }
    }

    // =====================================================
    // INTERFACE RENDERING
    // =====================================================

    renderModalInterface() {
        return `
            <div class="simple-marker-ui-designer">
                <!-- Toolbar -->
                <div class="designer-toolbar">
                    <div class="toolbar-info">
                        <strong>Category:</strong> ${this.currentCategory.name}
                        <br>
                        <small>Configure field placement using entity selectors</small>
                    </div>
                    <div class="toolbar-actions">
                        <button class="btn btn-success" id="saveMarkerLayout">Save Layout</button>
                        <button class="btn btn-secondary" id="resetMarkerLayout">Reset to Default</button>
                    </div>
                </div>

                <!-- Main Content -->
                <div class="designer-main">
                    <!-- Bottom Sheet Configuration -->
                    <div class="layout-sections">
                        <h3 style="margin-bottom: calc(var(--spacing-lg) * 1.5);">Bottom Sheet Layout Configuration</h3>
                        
                        <!-- Visual Bottom Sheet - Peek State -->
                        <div class="visual-bottom-sheet peek-state">
                            <div class="sheet-label">Peek View</div>
                            <div class="sheet-handle"></div>
                            
                            <!-- Header Section (2 fields) -->
                            <div class="sheet-header">
                                <div class="header-field-group">
                                    <label>Header Left:</label>
                                    ${this.renderEntitySelector('header_left', this.layout.header_left)}
                                </div>
                                <div class="header-field-group">
                                    <label>Header Right:</label>
                                    ${this.renderEntitySelector('header_right', this.layout.header_right)}
                                </div>
                            </div>
                            
                            <!-- Peek Section (4 fields) -->
                            <div class="peek-sections">
                                <div class="peek-field-group">
                                    <label>Peek Field 1:</label>
                                    ${this.renderEntitySelector('peek1', this.layout.peek1)}
                                </div>
                                <div class="peek-field-group">
                                    <label>Peek Field 2:</label>
                                    ${this.renderEntitySelector('peek2', this.layout.peek2)}
                                </div>
                                <div class="peek-field-group">
                                    <label>Peek Field 3:</label>
                                    ${this.renderEntitySelector('peek3', this.layout.peek3)}
                                </div>
                                <div class="peek-field-group">
                                    <label>Peek Field 4:</label>
                                    ${this.renderEntitySelector('peek4', this.layout.peek4)}
                                </div>
                            </div>
                        </div>
                        
                        <!-- Visual Bottom Sheet - Expanded State -->
                        <div class="visual-bottom-sheet expanded-state">
                            <div class="sheet-label">Expanded View</div>
                            <div class="sheet-handle"></div>
                            
                            <!-- Peek Fields (shown on top in expanded) -->
                            <div class="expanded-peek-display">
                                <strong>Peek fields (shown above):</strong>
                                <div class="peek-summary">
                                    ${this.renderPeekSummary()}
                                </div>
                            </div>
                            
                            <!-- Additional Fields Section -->
                            <div class="expanded-fields-section">
                                <div class="expanded-fields-header">
                                    <label>Additional Fields (displayed below peek):</label>
                                    <button class="btn btn-sm btn-secondary" id="addExpandedField">Add Field</button>
                                </div>
                                <div class="expanded-fields-list" id="expandedFieldsList">
                                    ${this.renderExpandedFieldsList()}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Live Preview -->
                    <div class="layout-preview">
                        <h3>Live Preview</h3>
                        <div class="preview-tabs">
                            <button class="preview-tab active" data-tab="peek">Peek View</button>
                            <button class="preview-tab" data-tab="expanded">Expanded View</button>
                        </div>
                        <div class="preview-container">
                            <div class="preview-content" id="previewContent">
                                ${this.renderPreview('peek')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                /* Override any existing modal styles with maximum specificity */
                #simpleMarkerUIDesignerModal,
                #simpleMarkerUIDesignerModal.modal,
                .modal#simpleMarkerUIDesignerModal,
                body .modal#simpleMarkerUIDesignerModal,
                html body .modal#simpleMarkerUIDesignerModal {
                    position: fixed !important;
                    top: 50% !important;
                    left: 50% !important;
                    transform: translate(-50%, -50%) !important;
                    max-width: 98vw !important;
                    max-height: 98vh !important;
                    width: 1800px !important;
                    height: 1200px !important;
                    min-width: 1400px !important;
                    min-height: 900px !important;
                    overflow-y: auto !important;
                    z-index: 9999 !important;
                    background-color: var(--color-bg-primary) !important;
                    border-radius: var(--border-radius-lg) !important;
                    box-shadow: var(--shadow-xl) !important;
                }
                
                .modal .simple-marker-ui-designer-modal,
                #simpleMarkerUIDesignerModal .modal-content.simple-marker-ui-designer-modal,
                .simple-marker-ui-designer-modal {
                    max-width: 98vw !important;
                    max-height: 98vh !important;
                    width: 1800px !important;
                    height: 1200px !important;
                    min-width: 1400px !important;
                    min-height: 900px !important;
                    transform: none !important;
                    margin: auto !important;
                    position: static !important;
                }

                .simple-marker-ui-designer-modal .modal-body,
                #simpleMarkerUIDesignerModal .modal-body {
                    padding: 0 !important;
                    height: calc(100% - 60px) !important;
                    overflow: hidden !important;
                }

                .simple-marker-ui-designer {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: var(--color-background);
                }

                .designer-toolbar {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: var(--spacing-md);
                    background: var(--color-surface);
                    border-bottom: 1px solid var(--color-border);
                    flex-shrink: 0;
                }

                .toolbar-info {
                    color: var(--color-text-secondary);
                    font-size: var(--font-size-sm);
                }

                .toolbar-actions {
                    display: flex;
                    gap: var(--spacing-sm);
                }

                .designer-main {
                    display: grid;
                    grid-template-columns: 1fr 500px;
                    flex: 1;
                    min-height: 0;
                    gap: 2px;
                    height: 100%;
                }

                .layout-sections, .layout-preview {
                    background: var(--color-surface);
                    padding: var(--spacing-lg);
                    overflow-y: auto;
                    min-height: 800px;
                }

                .layout-preview {
                    border-left: 2px solid var(--color-border);
                }

                /* Visual Bottom Sheets */
                .visual-bottom-sheet {
                    background: var(--color-surface);
                    border: 2px solid var(--color-border);
                    border-radius: 12px 12px 0 0;
                    padding: 0;
                    margin: calc(var(--spacing-lg) * 1.5) 0;
                    box-shadow: 0 -4px 12px rgba(0,0,0,0.1);
                    position: relative;
                    min-height: 320px;
                }

                .sheet-label {
                    position: absolute;
                    top: -30px;
                    left: 0;
                    font-weight: 600;
                    color: var(--color-text-primary);
                    background: var(--color-surface);
                    padding: 4px 12px;
                    border-radius: 4px;
                    font-size: var(--font-size-sm);
                    border: 1px solid var(--color-border);
                }

                .sheet-handle {
                    width: 36px;
                    height: 4px;
                    background: var(--color-border);
                    border-radius: 2px;
                    margin: 12px auto;
                }

                .sheet-header {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: var(--spacing-lg);
                    padding: var(--spacing-lg);
                    border-bottom: 1px solid var(--color-border);
                    background: var(--color-background);
                }

                .header-field-group, .peek-field-group {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-sm);
                }

                .header-field-group label, .peek-field-group label {
                    font-size: var(--font-size-sm);
                    font-weight: 500;
                    color: var(--color-text-secondary);
                    margin-bottom: 4px;
                }

                .peek-sections {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: var(--spacing-lg);
                    padding: var(--spacing-lg);
                    background: var(--color-background);
                }

                .expanded-peek-display {
                    padding: var(--spacing-lg);
                    background: var(--color-background-light, #f8f9fa);
                    border-bottom: 1px solid var(--color-border);
                }

                .peek-summary {
                    margin-top: var(--spacing-sm);
                    font-size: var(--font-size-sm);
                    color: var(--color-text-secondary);
                }

                .expanded-fields-section {
                    padding: var(--spacing-lg);
                    background: var(--color-background);
                    min-height: 180px;
                }

                .expanded-fields-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: var(--spacing-lg);
                }

                .expanded-fields-header label {
                    font-weight: 500;
                    color: var(--color-text-secondary);
                }

                .expanded-fields-list {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                }

                .expanded-field-item {
                    display: grid;
                    grid-template-columns: 1fr auto;
                    gap: var(--spacing-md);
                    align-items: center;
                    padding: var(--spacing-md);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-sm);
                    background: var(--color-surface);
                }

                .no-expanded-fields {
                    text-align: center;
                    padding: var(--spacing-lg);
                    color: var(--color-text-secondary);
                    font-style: italic;
                }

                .entity-selector {
                    position: relative;
                }

                .entity-selector input {
                    width: 100%;
                    padding: 10px 12px;
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-sm);
                    font-size: var(--font-size-sm);
                    background: var(--color-background);
                    min-height: 40px;
                }

                .entity-selector input:focus {
                    outline: none;
                    border-color: var(--color-primary);
                    box-shadow: 0 0 0 2px var(--color-primary-light, rgba(59, 130, 246, 0.1));
                }

                .entity-options {
                    position: absolute;
                    top: 100%;
                    left: 0;
                    right: 0;
                    background: var(--color-surface);
                    border: 1px solid var(--color-border);
                    border-top: none;
                    max-height: 250px;
                    overflow-y: auto;
                    z-index: 1000;
                    display: none;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }

                .entity-option {
                    padding: 10px 12px;
                    cursor: pointer;
                    border-bottom: 1px solid var(--color-border-light, #f1f5f9);
                    font-size: var(--font-size-sm);
                }

                .entity-option:hover {
                    background: var(--color-background);
                }

                .entity-option.selected {
                    background: var(--color-primary-light, #dbeafe);
                    color: var(--color-primary-dark, #1e40af);
                }

                /* Preview Section */
                .preview-tabs {
                    display: flex;
                    gap: 0;
                    margin-bottom: var(--spacing-lg);
                    border-bottom: 1px solid var(--color-border);
                }

                .preview-tab {
                    padding: 12px 20px;
                    border: none;
                    background: none;
                    cursor: pointer;
                    border-bottom: 2px solid transparent;
                    font-size: var(--font-size-sm);
                    font-weight: 500;
                }

                .preview-tab.active {
                    border-bottom-color: var(--color-primary);
                    color: var(--color-primary);
                    font-weight: 600;
                }

                .preview-container {
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-sm);
                    overflow: hidden;
                    background: var(--color-background);
                }

                .preview-content {
                    padding: var(--spacing-lg);
                    min-height: 400px;
                    background: var(--color-background);
                }

                .preview-bottomsheet {
                    background: var(--color-surface);
                    border-radius: 8px 8px 0 0;
                    border: 1px solid var(--color-border);
                    overflow: hidden;
                }

                .preview-handle {
                    width: 24px;
                    height: 3px;
                    background: var(--color-border);
                    border-radius: 2px;
                    margin: 6px auto;
                }

                .preview-header {
                    display: flex;
                    justify-content: space-between;
                    padding: var(--spacing-md);
                    background: var(--color-background);
                    border-bottom: 1px solid var(--color-border);
                    font-weight: 500;
                }

                .preview-fields {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-md);
                }

                .preview-field {
                    padding: var(--spacing-sm);
                    background: var(--color-background);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-sm);
                    font-size: var(--font-size-sm);
                }

                .preview-field-label {
                    font-weight: 500;
                    color: var(--color-text-secondary);
                    margin-bottom: 2px;
                }

                .preview-field-value {
                    color: var(--color-text-primary);
                }

                .preview-expanded-fields {
                    padding: var(--spacing-md);
                    border-top: 1px solid var(--color-border);
                }

                .preview-expanded-field {
                    display: flex;
                    justify-content: space-between;
                    padding: var(--spacing-sm) 0;
                    border-bottom: 1px solid var(--color-border-light);
                    font-size: var(--font-size-sm);
                }

                .btn-remove {
                    background: var(--color-error);
                    color: white;
                    border: none;
                    padding: 4px 8px;
                    border-radius: var(--radius-sm);
                    cursor: pointer;
                    font-size: var(--font-size-xs);
                }
            </style>
        `;
    }

    renderEntitySelector(fieldKey, selectedValue) {
        const fieldOptions = this.fields.map(field => 
            `<div class="entity-option" data-value="${field.key}">${field.label}</div>`
        ).join('');

        const selectedField = this.fields.find(f => f.key === selectedValue);
        const displayValue = selectedField ? selectedField.label : '';

        return `
            <div class="entity-selector" data-field="${fieldKey}">
                <input type="text" 
                       value="${displayValue}" 
                       placeholder="Type to search fields..."
                       data-field="${fieldKey}"
                       autocomplete="off">
                <div class="entity-options">
                    <div class="entity-option" data-value="">-- None --</div>
                    ${fieldOptions}
                </div>
            </div>
        `;
    }

    renderPeekSummary() {
        const peekFields = [
            this.layout.peek1,
            this.layout.peek2,
            this.layout.peek3,
            this.layout.peek4
        ].filter(Boolean);

        if (peekFields.length === 0) {
            return '<em>No peek fields configured</em>';
        }

        return peekFields.map(fieldKey => {
            const field = this.fields.find(f => f.key === fieldKey);
            return field ? field.label : fieldKey;
        }).join(', ');
    }

    renderExpandedFieldsList() {
        if (!this.layout.expanded_fields || this.layout.expanded_fields.length === 0) {
            return '<div class="no-expanded-fields"><em>No additional fields configured</em></div>';
        }

        return this.layout.expanded_fields.map((fieldKey, index) => {
            const field = this.fields.find(f => f.key === fieldKey);
            const fieldLabel = field ? field.label : fieldKey;

            return `
                <div class="expanded-field-item" data-index="${index}">
                    ${this.renderEntitySelector(`expanded_${index}`, fieldKey)}
                    <button class="btn-remove" data-index="${index}">Remove</button>
                </div>
            `;
        }).join('');
    }

    renderPreview(view = 'peek') {
        if (view === 'peek') {
            return `
                <div class="preview-bottomsheet">
                    <div class="preview-handle"></div>
                    <div class="preview-header">
                        <span>${this.getFieldPreviewValue('header_left')}</span>
                        <span>${this.getFieldPreviewValue('header_right')}</span>
                    </div>
                    <div class="preview-fields">
                        <div class="preview-field">
                            <div class="preview-field-label">Field 1</div>
                            <div class="preview-field-value">${this.getFieldPreviewValue('peek1')}</div>
                        </div>
                        <div class="preview-field">
                            <div class="preview-field-label">Field 2</div>
                            <div class="preview-field-value">${this.getFieldPreviewValue('peek2')}</div>
                        </div>
                        <div class="preview-field">
                            <div class="preview-field-label">Field 3</div>
                            <div class="preview-field-value">${this.getFieldPreviewValue('peek3')}</div>
                        </div>
                        <div class="preview-field">
                            <div class="preview-field-label">Field 4</div>
                            <div class="preview-field-value">${this.getFieldPreviewValue('peek4')}</div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            const expandedFieldsHtml = this.layout.expanded_fields?.map(fieldKey => {
                const field = this.fields.find(f => f.key === fieldKey);
                const label = field ? field.label : fieldKey;
                return `
                    <div class="preview-expanded-field">
                        <span>${label}</span>
                        <span>Sample value</span>
                    </div>
                `;
            }).join('') || '<em>No additional fields</em>';

            return `
                <div class="preview-bottomsheet">
                    <div class="preview-handle"></div>
                    <div class="preview-header">
                        <span>${this.getFieldPreviewValue('header_left')}</span>
                        <span>${this.getFieldPreviewValue('header_right')}</span>
                    </div>
                    <div class="preview-fields">
                        <div class="preview-field">
                            <div class="preview-field-label">Field 1</div>
                            <div class="preview-field-value">${this.getFieldPreviewValue('peek1')}</div>
                        </div>
                        <div class="preview-field">
                            <div class="preview-field-label">Field 2</div>
                            <div class="preview-field-value">${this.getFieldPreviewValue('peek2')}</div>
                        </div>
                        <div class="preview-field">
                            <div class="preview-field-label">Field 3</div>
                            <div class="preview-field-value">${this.getFieldPreviewValue('peek3')}</div>
                        </div>
                        <div class="preview-field">
                            <div class="preview-field-label">Field 4</div>
                            <div class="preview-field-value">${this.getFieldPreviewValue('peek4')}</div>
                        </div>
                    </div>
                    <div class="preview-expanded-fields">
                        ${expandedFieldsHtml}
                    </div>
                </div>
            `;
        }
    }

    getFieldPreviewValue(layoutKey) {
        const fieldKey = this.layout[layoutKey];
        if (!fieldKey) return '(empty)';
        
        const field = this.fields.find(f => f.key === fieldKey);
        return field ? field.label : fieldKey;
    }

    // =====================================================
    // EVENT HANDLING
    // =====================================================

    setupEventListeners() {
        // Close modal
        const closeBtn = document.getElementById('closeSimpleMarkerUIDesigner');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeModal());
        }

        // Save layout
        const saveBtn = document.getElementById('saveMarkerLayout');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveLayout());
        }

        // Reset layout
        const resetBtn = document.getElementById('resetMarkerLayout');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetLayout());
        }

        // Entity selectors
        this.setupEntitySelectors();

        // Preview tabs
        this.setupPreviewTabs();

        // Add expanded field button
        const addBtn = document.getElementById('addExpandedField');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.addExpandedField());
        }

        // Remove expanded field buttons
        this.setupRemoveButtons();
    }

    setupEntitySelectors() {
        const selectors = document.querySelectorAll('.entity-selector input');
        
        selectors.forEach(input => {
            const fieldKey = input.getAttribute('data-field');
            const optionsContainer = input.parentElement.querySelector('.entity-options');
            
            // Show options on focus
            input.addEventListener('focus', () => {
                optionsContainer.style.display = 'block';
                this.filterOptions(input.value, optionsContainer);
            });

            // Hide options on blur (with delay for clicks)
            input.addEventListener('blur', () => {
                setTimeout(() => {
                    optionsContainer.style.display = 'none';
                }, 200);
            });

            // Filter on input
            input.addEventListener('input', () => {
                this.filterOptions(input.value, optionsContainer);
            });

            // Handle option clicks
            const options = optionsContainer.querySelectorAll('.entity-option');
            options.forEach(option => {
                option.addEventListener('click', () => {
                    const value = option.getAttribute('data-value');
                    const label = option.textContent;
                    
                    input.value = value ? label : '';
                    optionsContainer.style.display = 'none';
                    
                    this.updateLayoutField(fieldKey, value);
                });
            });
        });
    }

    filterOptions(searchTerm, optionsContainer) {
        const options = optionsContainer.querySelectorAll('.entity-option');
        const term = searchTerm.toLowerCase();
        
        options.forEach(option => {
            const text = option.textContent.toLowerCase();
            option.style.display = text.includes(term) ? 'block' : 'none';
        });
    }

    updateLayoutField(fieldKey, value) {
        if (fieldKey.startsWith('expanded_')) {
            const index = parseInt(fieldKey.replace('expanded_', ''));
            if (this.layout.expanded_fields) {
                this.layout.expanded_fields[index] = value;
            }
        } else {
            this.layout[fieldKey] = value || null;
        }
        
        this.updatePreview();
    }

    setupPreviewTabs() {
        const tabs = document.querySelectorAll('.preview-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Update active tab
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Update preview
                const view = tab.getAttribute('data-tab');
                const previewContent = document.getElementById('previewContent');
                if (previewContent) {
                    previewContent.innerHTML = this.renderPreview(view);
                }
            });
        });
    }

    addExpandedField() {
        if (!this.layout.expanded_fields) {
            this.layout.expanded_fields = [];
        }
        
        this.layout.expanded_fields.push('');
        
        // Re-render expanded fields list
        const container = document.getElementById('expandedFieldsList');
        if (container) {
            container.innerHTML = this.renderExpandedFieldsList();
            this.setupEntitySelectors();
            this.setupRemoveButtons();
        }
    }

    setupRemoveButtons() {
        const removeButtons = document.querySelectorAll('.btn-remove');
        removeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.getAttribute('data-index'));
                this.removeExpandedField(index);
            });
        });
    }

    removeExpandedField(index) {
        if (this.layout.expanded_fields && index >= 0 && index < this.layout.expanded_fields.length) {
            this.layout.expanded_fields.splice(index, 1);
            
            // Re-render expanded fields list
            const container = document.getElementById('expandedFieldsList');
            if (container) {
                container.innerHTML = this.renderExpandedFieldsList();
                this.setupEntitySelectors();
                this.setupRemoveButtons();
            }
            
            this.updatePreview();
        }
    }

    updatePreview() {
        const activeTab = document.querySelector('.preview-tab.active');
        const view = activeTab ? activeTab.getAttribute('data-tab') : 'peek';
        
        const previewContent = document.getElementById('previewContent');
        if (previewContent) {
            previewContent.innerHTML = this.renderPreview(view);
        }
    }

    // =====================================================
    // SAVE/RESET OPERATIONS
    // =====================================================

    async saveLayout() {
        try {
            const contextKey = `marker_category_${this.currentCategory.id}`;
            const projectId = supabaseClient.getCurrentProjectId();
            
            if (!projectId) {
                throw new Error('No project context available');
            }

            // Check if configuration already exists
            const existingConfigs = await supabaseClient.getAll('ui_configurations', {
                filters: { 
                    project_id: projectId,
                    context_type: contextKey
                }
            });

            const configData = {
                project_id: projectId,
                context_type: contextKey,
                role_id: null, // Apply to all roles
                configuration: {
                    layout: this.layout,
                    created_at: new Date().toISOString(),
                    category_name: this.currentCategory.name
                }
            };

            if (existingConfigs.length > 0) {
                // Update existing configuration
                await supabaseClient.update('ui_configurations', existingConfigs[0].id, configData);
                app.showNotification('Layout updated successfully', 'success');
            } else {
                // Create new configuration
                await supabaseClient.create('ui_configurations', configData);
                app.showNotification('Layout saved successfully', 'success');
            }

        } catch (error) {
            logger.error('Failed to save layout:', error);
            app.showNotification('Failed to save layout: ' + error.message, 'error');
        }
    }

    resetLayout() {
        this.layout = {
            header_left: null,
            header_right: null,
            peek1: null,
            peek2: null,
            peek3: null,
            peek4: null,
            expanded_fields: []
        };

        // Re-render interface
        const content = document.getElementById('simpleMarkerUIDesignerContent');
        if (content) {
            content.innerHTML = this.renderModalInterface();
            this.setupEventListeners();
        }
    }
}

// Create global instance
const simpleMarkerUIDesigner = new SimpleMarkerUIDesigner();
window.simpleMarkerUIDesigner = simpleMarkerUIDesigner;

export default simpleMarkerUIDesigner;