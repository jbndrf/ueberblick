/**
 * Reusable UI Designer Component
 * Context-aware UI design modal that can be triggered from marker categories, workflows, forms, etc.
 */

import { supabaseClient } from '../core/supabase.js';
import Utils from '../core/utils.js';
import app from '../core/app.js';
import DebugLogger from '../core/debug-logger.js';

const logger = new DebugLogger('ReusableUIDesigner');

class ReusableUIDesigner {
    constructor() {
        this.isOpen = false;
        this.currentContext = null;
        this.contextData = null;
        this.selectedElement = null;
        this.canvasElements = [];
        this.elementIdCounter = 0;
        
        // Initialize modal HTML if not exists
        this.ensureModalExists();
    }

    // =====================================================
    // CONTEXT-SPECIFIC INITIALIZATION
    // =====================================================

    /**
     * Open UI Designer for marker category
     */
    async designMarkerCategory(categoryId, categoryData) {
        this.currentContext = {
            type: 'marker_category',
            id: categoryId,
            data: categoryData,
            previewMode: 'bottom_sheet', // bottom_sheet preview
            title: `Design UI for "${categoryData.name}" Markers`
        };
        
        await this.loadExistingConfiguration();
        this.initializeComponentLibrary();
        this.openModal();
    }

    /**
     * Open UI Designer for workflow stage
     */
    async designWorkflowStage(stageId, stageData, workflowData) {
        this.currentContext = {
            type: 'workflow_stage',
            id: stageId,
            data: { ...stageData, workflow: workflowData },
            previewMode: 'bottom_sheet', // bottom_sheet preview
            title: `Design UI for "${stageData.stage_name}" Stage`
        };
        
        await this.loadExistingConfiguration();
        this.initializeComponentLibrary();
        this.openModal();
    }

    /**
     * Open UI Designer for form layout (page-based)
     */
    async designFormLayout(formId, formData) {
        this.currentContext = {
            type: 'form_layout',
            id: formId,
            data: formData,
            previewMode: 'pages', // page-based preview
            title: `Design Layout for "${formData.name}" Form`
        };
        
        await this.loadExistingConfiguration();
        this.initializeComponentLibrary();
        this.openModal();
    }

    // =====================================================
    // COMPONENT LIBRARY INITIALIZATION
    // =====================================================

    initializeComponentLibrary() {
        const baseComponents = {
            'text-display': {
                name: 'Text Display',
                icon: 'T',
                category: 'Content',
                supportedContexts: ['marker_category', 'workflow_stage', 'form_layout'],
                defaultConfig: {
                    text: 'Sample Text',
                    size: 'medium',
                    weight: 'normal',
                    color: '#333333',
                    alignment: 'left'
                },
                properties: [
                    { key: 'text', label: 'Text Content', type: 'textarea' },
                    { key: 'size', label: 'Font Size', type: 'select', options: ['small', 'medium', 'large', 'xlarge'] },
                    { key: 'weight', label: 'Font Weight', type: 'select', options: ['normal', 'bold'] },
                    { key: 'color', label: 'Text Color', type: 'color' },
                    { key: 'alignment', label: 'Alignment', type: 'select', options: ['left', 'center', 'right'] }
                ]
            },
            'action-button': {
                name: 'Action Button',
                icon: 'R',
                category: 'Actions',
                supportedContexts: ['marker_category', 'workflow_stage'],
                defaultConfig: {
                    text: 'Action',
                    color: '#007bff',
                    size: 'medium',
                    width: 'full',
                    style: 'primary'
                },
                properties: [
                    { key: 'text', label: 'Button Text', type: 'text' },
                    { key: 'color', label: 'Button Color', type: 'color' },
                    { key: 'size', label: 'Size', type: 'select', options: ['small', 'medium', 'large'] },
                    { key: 'width', label: 'Width', type: 'select', options: ['auto', 'full'] },
                    { key: 'style', label: 'Style', type: 'select', options: ['primary', 'secondary', 'danger'] }
                ]
            },
            'data-field': {
                name: 'Data Field',
                icon: 'C',
                category: 'Data',
                supportedContexts: ['marker_category', 'workflow_stage'],
                defaultConfig: {
                    label: 'Field Label',
                    fieldKey: '',
                    displayType: 'text',
                    showLabel: true
                },
                properties: [
                    { key: 'label', label: 'Display Label', type: 'text' },
                    { key: 'fieldKey', label: 'Data Field Key', type: 'text' },
                    { key: 'displayType', label: 'Display Type', type: 'select', options: ['text', 'badge', 'chip', 'highlight'] },
                    { key: 'showLabel', label: 'Show Label', type: 'checkbox' }
                ]
            },
            'form-field-group': {
                name: 'Form Field Group',
                icon: 'DD',
                category: 'Forms',
                supportedContexts: ['form_layout'],
                defaultConfig: {
                    title: 'Field Group',
                    fieldIds: [],
                    layout: 'vertical',
                    page: 1
                },
                properties: [
                    { key: 'title', label: 'Group Title', type: 'text' },
                    { key: 'layout', label: 'Layout', type: 'select', options: ['vertical', 'horizontal', 'grid'] },
                    { key: 'page', label: 'Page Number', type: 'number', min: 1 }
                ]
            },
            'page-break': {
                name: 'Page Break',
                icon: 'D',
                category: 'Layout',
                supportedContexts: ['form_layout'],
                defaultConfig: {
                    title: 'Page 2'
                },
                properties: [
                    { key: 'title', label: 'Page Title', type: 'text' }
                ]
            },
            'spacer': {
                name: 'Spacer',
                icon: '⬜',
                category: 'Layout',
                supportedContexts: ['marker_category', 'workflow_stage', 'form_layout'],
                defaultConfig: {
                    height: 'medium'
                },
                properties: [
                    { key: 'height', label: 'Height', type: 'select', options: ['small', 'medium', 'large'] }
                ]
            },
            'divider': {
                name: 'Divider',
                icon: 'S',
                category: 'Layout',
                supportedContexts: ['marker_category', 'workflow_stage', 'form_layout'],
                defaultConfig: {
                    style: 'solid',
                    color: '#e0e0e0',
                    thickness: 'thin'
                },
                properties: [
                    { key: 'style', label: 'Style', type: 'select', options: ['solid', 'dashed', 'dotted'] },
                    { key: 'color', label: 'Color', type: 'color' },
                    { key: 'thickness', label: 'Thickness', type: 'select', options: ['thin', 'medium', 'thick'] }
                ]
            }
        };

        // Filter components based on current context
        this.componentLibrary = {};
        Object.entries(baseComponents).forEach(([key, component]) => {
            if (component.supportedContexts.includes(this.currentContext.type)) {
                this.componentLibrary[key] = component;
            }
        });
    }

    // =====================================================
    // MODAL MANAGEMENT
    // =====================================================

    ensureModalExists() {
        if (!document.getElementById('reusableUIDesignerModal')) {
            const modalHTML = `
                <div id="reusableUIDesignerModal" class="modal" style="display: none;">
                    <div class="modal-content reusable-ui-designer-modal">
                        <div class="modal-header">
                            <h2 id="reusableUIDesignerTitle">UI Designer</h2>
                            <button class="modal-close" id="closeReusableUIDesigner">&times;</button>
                        </div>
                        <div class="modal-body" id="reusableUIDesignerContent">
                            <!-- UI Designer interface will be loaded here -->
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        }
    }

    openModal() {
        const modal = document.getElementById('reusableUIDesignerModal');
        const title = document.getElementById('reusableUIDesignerTitle');
        const content = document.getElementById('reusableUIDesignerContent');
        
        if (!modal || !title || !content) {
            logger.error('Reusable UI Designer modal elements not found');
            return;
        }

        title.textContent = this.currentContext.title;
        content.innerHTML = this.renderModalInterface();
        
        // Show modal
        modal.style.display = 'flex';
        this.isOpen = true;
        
        // Set up event listeners
        this.setupModalEventListeners();
        
        // Initial render
        this.renderCanvas();
        this.renderPropertyPanel();
    }

    closeModal() {
        const modal = document.getElementById('reusableUIDesignerModal');
        if (modal) {
            modal.style.display = 'none';
            this.isOpen = false;
        }
    }

    // =====================================================
    // INTERFACE RENDERING
    // =====================================================

    renderModalInterface() {
        const previewSection = this.currentContext.previewMode === 'pages' ? 
            this.renderPagePreview() : this.renderBottomSheetPreview();

        return `
            <div class="reusable-ui-designer-interface">
                <!-- Toolbar -->
                <div class="ui-designer-toolbar">
                    <div class="toolbar-section">
                        <label>Context:</label>
                        <span class="context-badge">${this.getContextDisplayName()}</span>
                    </div>
                    
                    <div class="toolbar-actions">
                        <button class="btn btn-success" id="saveUIConfiguration">Save Configuration</button>
                        <button class="btn btn-secondary" id="previewUIConfiguration">Preview</button>
                    </div>
                </div>

                <!-- Main Design Area -->
                <div class="ui-designer-main">
                    <!-- Component Palette -->
                    <div class="component-palette">
                        <div class="palette-header">
                            <h4>Components</h4>
                            <small>Drag components to design area</small>
                        </div>
                        <div class="palette-content" id="componentPalette">
                            ${this.renderComponentPalette()}
                        </div>
                    </div>

                    <!-- Preview Area -->
                    <div class="preview-area">
                        <div class="preview-header">
                            <h4>${this.currentContext.previewMode === 'pages' ? 'Form Pages' : 'Bottom Sheet Preview'}</h4>
                        </div>
                        <div class="preview-container">
                            ${previewSection}
                        </div>
                    </div>

                    <!-- Property Panel -->
                    <div class="property-panel">
                        <div class="panel-header">
                            <h4>Properties</h4>
                        </div>
                        <div class="panel-content" id="propertyPanelContent">
                            ${this.renderPropertyPanel()}
                        </div>
                    </div>
                </div>
            </div>

            <style>
                .reusable-ui-designer-modal {
                    max-width: 95vw;
                    max-height: 95vh;
                    width: 1400px;
                    height: 900px;
                }

                .reusable-ui-designer-modal .modal-body {
                    padding: 0;
                    height: calc(100% - 60px);
                    overflow: hidden;
                }

                .reusable-ui-designer-interface {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: var(--color-background);
                }

                .ui-designer-toolbar {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: var(--spacing-md);
                    background: var(--color-surface);
                    border-bottom: 1px solid var(--color-border);
                }

                .toolbar-section {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                }

                .context-badge {
                    background: var(--color-primary-light);
                    color: var(--color-primary);
                    padding: 4px 8px;
                    border-radius: var(--radius-sm);
                    font-size: var(--font-size-xs);
                    font-weight: 500;
                }

                .toolbar-actions {
                    display: flex;
                    gap: var(--spacing-sm);
                }

                .ui-designer-main {
                    display: flex;
                    flex: 1;
                    min-height: 0;
                }

                .component-palette {
                    width: 250px;
                    background: var(--color-surface);
                    border-right: 1px solid var(--color-border);
                    display: flex;
                    flex-direction: column;
                }

                .palette-header, .panel-header, .preview-header {
                    padding: var(--spacing-md);
                    border-bottom: 1px solid var(--color-border);
                    background: var(--color-background);
                }

                .palette-header h4, .panel-header h4, .preview-header h4 {
                    margin: 0 0 4px 0;
                    color: var(--color-text-primary);
                    font-size: var(--font-size-sm);
                    font-weight: 600;
                }

                .palette-header small {
                    color: var(--color-text-tertiary);
                    font-size: var(--font-size-xs);
                }

                .palette-content {
                    flex: 1;
                    padding: var(--spacing-md);
                    overflow-y: auto;
                }

                .preview-area {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                }

                .preview-container {
                    flex: 1;
                    padding: var(--spacing-lg);
                    background: #f8f9fa;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    position: relative;
                    overflow: auto;
                }

                .property-panel {
                    width: 280px;
                    background: var(--color-surface);
                    border-left: 1px solid var(--color-border);
                    display: flex;
                    flex-direction: column;
                }

                .panel-content {
                    flex: 1;
                    padding: var(--spacing-md);
                    overflow-y: auto;
                }

                /* Bottom Sheet Simulator */
                .bottom-sheet-simulator {
                    width: 360px;
                    height: 600px;
                    background: var(--color-surface);
                    border-radius: 12px 12px 0 0;
                    box-shadow: 0 -4px 20px rgba(0,0,0,0.15);
                    position: relative;
                    border: 1px solid var(--color-border);
                    display: flex;
                    flex-direction: column;
                }

                .bottom-sheet-handle {
                    width: 36px;
                    height: 4px;
                    background: var(--color-border);
                    border-radius: 2px;
                    margin: 8px auto;
                    flex-shrink: 0;
                }

                .bottom-sheet-content {
                    flex: 1;
                    padding: var(--spacing-md);
                    overflow-y: auto;
                    min-height: 0;
                }

                /* Page Preview */
                .page-preview {
                    width: 400px;
                    height: 600px;
                    background: var(--color-surface);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-md);
                    position: relative;
                    overflow: hidden;
                }

                .page-tabs {
                    display: flex;
                    background: var(--color-background);
                    border-bottom: 1px solid var(--color-border);
                }

                .page-tab {
                    padding: var(--spacing-sm) var(--spacing-md);
                    cursor: pointer;
                    border-right: 1px solid var(--color-border);
                    background: var(--color-surface);
                    color: var(--color-text-secondary);
                    font-size: var(--font-size-sm);
                }

                .page-tab.active {
                    background: var(--color-surface);
                    color: var(--color-text-primary);
                    font-weight: 500;
                }

                .page-content {
                    flex: 1;
                    padding: var(--spacing-md);
                    overflow-y: auto;
                }

                /* Component Items */
                .component-item {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-sm);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-sm);
                    margin-bottom: var(--spacing-sm);
                    cursor: grab;
                    transition: all 0.2s ease;
                    background: var(--color-background);
                }

                .component-item:hover {
                    border-color: var(--color-primary);
                    background: var(--color-primary-light);
                }

                .component-icon {
                    font-size: 1.2rem;
                }

                .component-name {
                    font-weight: 500;
                    color: var(--color-text-primary);
                    font-size: var(--font-size-sm);
                }

                /* Canvas Elements */
                .canvas-element {
                    margin-bottom: var(--spacing-sm);
                    padding: var(--spacing-sm);
                    border: 2px dashed transparent;
                    border-radius: var(--radius-sm);
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .canvas-element:hover {
                    border-color: var(--color-primary-light);
                    background: var(--color-primary-light);
                }

                .canvas-element.selected {
                    border-color: var(--color-primary);
                    background: var(--color-primary-light);
                }

                .drop-zone {
                    min-height: 40px;
                    border: 2px dashed var(--color-border);
                    border-radius: var(--radius-sm);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--color-text-tertiary);
                    font-size: var(--font-size-sm);
                    margin: var(--spacing-sm) 0;
                }

                .drop-zone.drag-over {
                    border-color: var(--color-primary);
                    background: var(--color-primary-light);
                    color: var(--color-primary);
                }

                @media (max-width: 1200px) {
                    .reusable-ui-designer-modal {
                        width: 95vw;
                        height: 95vh;
                    }

                    .ui-designer-main {
                        flex-direction: column;
                    }

                    .component-palette, .property-panel {
                        width: 100%;
                        height: 200px;
                    }
                }
            </style>
        `;
    }

    renderBottomSheetPreview() {
        return `
            <div class="bottom-sheet-simulator" id="bottomSheetCanvas">
                <div class="bottom-sheet-handle"></div>
                <div class="bottom-sheet-content" id="canvasContent">
                    ${this.renderCanvasContent()}
                </div>
            </div>
        `;
    }

    renderPagePreview() {
        const pages = this.groupElementsByPage();
        return `
            <div class="page-preview">
                <div class="page-tabs">
                    ${Object.keys(pages).map((pageNum, index) => `
                        <div class="page-tab ${index === 0 ? 'active' : ''}" data-page="${pageNum}">
                            Page ${pageNum}
                        </div>
                    `).join('')}
                    <div class="page-tab" data-page="new">+ Add Page</div>
                </div>
                <div class="page-content" id="pageContent">
                    ${this.renderCanvasContent()}
                </div>
            </div>
        `;
    }

    renderCanvasContent() {
        if (this.canvasElements.length === 0) {
            return `
                <div class="drop-zone" id="mainDropZone">
                    Drop components here to start designing
                </div>
            `;
        }

        return this.canvasElements.map((element, index) => 
            this.renderCanvasElement(element, index)
        ).join('') + `
            <div class="drop-zone" data-insert-index="${this.canvasElements.length}">
                Drop components here
            </div>
        `;
    }

    renderCanvasElement(element, index) {
        const component = this.componentLibrary[element.type];
        if (!component) return '';

        return `
            <div class="canvas-element ${this.selectedElement?.id === element.id ? 'selected' : ''}" 
                 data-element-id="${element.id}" data-element-index="${index}">
                ${this.renderElementPreview(element, component)}
            </div>
            <div class="drop-zone" data-insert-index="${index + 1}">Drop here</div>
        `;
    }

    renderElementPreview(element, component) {
        const config = { ...component.defaultConfig, ...element.config };

        switch (element.type) {
            case 'action-button':
                return `
                    <button class="btn btn-${config.style}" 
                            style="background-color: ${config.color}; width: ${config.width === 'full' ? '100%' : 'auto'};">
                        ${config.text}
                    </button>
                `;

            case 'text-display':
                return `
                    <div style="color: ${config.color}; font-size: ${this.getFontSize(config.size)}; 
                                font-weight: ${config.weight}; text-align: ${config.alignment};">
                        ${config.text}
                    </div>
                `;

            case 'data-field':
                return `
                    <div class="data-field">
                        ${config.showLabel ? `<label>${config.label}:</label>` : ''}
                        <span class="field-value ${config.displayType}">
                            ${config.fieldKey ? `{${config.fieldKey}}` : 'Sample Data'}
                        </span>
                    </div>
                `;

            case 'form-field-group':
                return `
                    <div class="form-field-group">
                        <h4>${config.title}</h4>
                        <div class="field-group ${config.layout}">
                            <p class="field-placeholder">Form fields will appear here</p>
                        </div>
                    </div>
                `;

            case 'page-break':
                return `
                    <div class="page-break">
                        <hr>
                        <div class="page-title">${config.title}</div>
                        <hr>
                    </div>
                `;

            case 'spacer':
                return `<div style="height: ${this.getSpacerHeight(config.height)};"></div>`;

            case 'divider':
                return `
                    <hr style="border-style: ${config.style}; border-color: ${config.color}; 
                              border-width: ${this.getDividerThickness(config.thickness)};">
                `;

            default:
                return `<div>Unknown component: ${element.type}</div>`;
        }
    }

    // =====================================================
    // COMPONENT PALETTE
    // =====================================================

    renderComponentPalette() {
        const categories = this.groupComponentsByCategory();
        
        return Object.entries(categories).map(([category, components]) => `
            <div class="component-category">
                <div class="category-header">
                    <h5>${category}</h5>
                </div>
                <div class="category-components">
                    ${components.map(([key, component]) => `
                        <div class="component-item" draggable="true" data-component-type="${key}">
                            <span class="component-icon">${component.icon}</span>
                            <span class="component-name">${component.name}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    }

    groupComponentsByCategory() {
        const categories = {};
        
        Object.entries(this.componentLibrary).forEach(([key, component]) => {
            const category = component.category || 'Other';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push([key, component]);
        });
        
        return categories;
    }

    groupElementsByPage() {
        const pages = { 1: [] };
        
        this.canvasElements.forEach(element => {
            const page = element.config?.page || 1;
            if (!pages[page]) {
                pages[page] = [];
            }
            pages[page].push(element);
        });
        
        return pages;
    }

    // =====================================================
    // PROPERTY PANEL
    // =====================================================

    renderPropertyPanel() {
        if (!this.selectedElement) {
            return `
                <div class="no-selection">
                    <p>Select an element to edit its properties</p>
                </div>
            `;
        }

        const component = this.componentLibrary[this.selectedElement.type];
        const config = { ...component.defaultConfig, ...this.selectedElement.config };

        return `
            <div class="property-form">
                <div class="property-group">
                    <h5>${component.name} Properties</h5>
                    ${component.properties.map(prop => this.renderPropertyField(prop, config[prop.key])).join('')}
                </div>
                
                <div class="property-actions">
                    <button class="btn btn-danger btn-sm" onclick="window.reusableUIDesigner.removeSelectedElement()">
                        Remove Element
                    </button>
                </div>
            </div>
        `;
    }

    renderPropertyField(property, value) {
        const fieldId = `prop_${property.key}`;
        
        switch (property.type) {
            case 'text':
                return `
                    <div class="form-group">
                        <label for="${fieldId}">${property.label}</label>
                        <input type="text" id="${fieldId}" class="form-control" 
                               data-property="${property.key}" value="${value || ''}">
                    </div>
                `;

            case 'textarea':
                return `
                    <div class="form-group">
                        <label for="${fieldId}">${property.label}</label>
                        <textarea id="${fieldId}" class="form-control" rows="3"
                                  data-property="${property.key}">${value || ''}</textarea>
                    </div>
                `;

            case 'select':
                return `
                    <div class="form-group">
                        <label for="${fieldId}">${property.label}</label>
                        <select id="${fieldId}" class="form-control" data-property="${property.key}">
                            ${property.options.map(option => `
                                <option value="${option}" ${option === value ? 'selected' : ''}>${option}</option>
                            `).join('')}
                        </select>
                    </div>
                `;

            case 'number':
                return `
                    <div class="form-group">
                        <label for="${fieldId}">${property.label}</label>
                        <input type="number" id="${fieldId}" class="form-control" 
                               data-property="${property.key}" value="${value || ''}"
                               ${property.min ? `min="${property.min}"` : ''}>
                    </div>
                `;

            case 'color':
                return `
                    <div class="form-group">
                        <label for="${fieldId}">${property.label}</label>
                        <input type="color" id="${fieldId}" class="form-control" 
                               data-property="${property.key}" value="${value || '#000000'}">
                    </div>
                `;

            case 'checkbox':
                return `
                    <div class="form-group">
                        <div class="form-check">
                            <input type="checkbox" id="${fieldId}" class="form-check-input" 
                                   data-property="${property.key}" ${value ? 'checked' : ''}>
                            <label for="${fieldId}" class="form-check-label">${property.label}</label>
                        </div>
                    </div>
                `;

            default:
                return `<div>Unknown property type: ${property.type}</div>`;
        }
    }

    // =====================================================
    // EVENT HANDLERS
    // =====================================================

    setupModalEventListeners() {
        // Close modal
        document.getElementById('closeReusableUIDesigner')?.addEventListener('click', () => {
            this.closeModal();
        });

        // Save configuration
        document.getElementById('saveUIConfiguration')?.addEventListener('click', () => {
            this.saveConfiguration();
        });

        // Preview configuration
        document.getElementById('previewUIConfiguration')?.addEventListener('click', () => {
            this.previewConfiguration();
        });

        // Set up drag and drop
        this.setupDragAndDrop();
        
        // Set up canvas event listeners
        this.setupCanvasEventListeners();
        
        // Set up property panel listeners
        this.setupPropertyEventListeners();
    }

    setupDragAndDrop() {
        // Component palette drag start
        document.querySelectorAll('.component-item').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('component-type', item.dataset.componentType);
            });
        });

        // Canvas drop zones
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        document.addEventListener('drop', (e) => {
            e.preventDefault();
            
            const dropZone = e.target.closest('.drop-zone');
            if (!dropZone) return;

            const componentType = e.dataTransfer.getData('component-type');
            if (!componentType) return;

            const insertIndex = parseInt(dropZone.dataset.insertIndex) || 0;
            this.addElementToCanvas(componentType, insertIndex);
        });

        // Visual feedback for drag over
        document.querySelectorAll('.drop-zone').forEach(zone => {
            zone.addEventListener('dragover', (e) => {
                e.preventDefault();
                zone.classList.add('drag-over');
            });

            zone.addEventListener('dragleave', () => {
                zone.classList.remove('drag-over');
            });

            zone.addEventListener('drop', () => {
                zone.classList.remove('drag-over');
            });
        });
    }

    setupCanvasEventListeners() {
        document.querySelectorAll('.canvas-element').forEach(element => {
            element.addEventListener('click', (e) => {
                e.stopPropagation();
                const elementId = element.dataset.elementId;
                this.selectElement(elementId);
            });
        });

        // Click on canvas background to deselect
        const canvasContent = document.getElementById('canvasContent') || document.getElementById('pageContent');
        canvasContent?.addEventListener('click', (e) => {
            if (e.target === canvasContent || e.target.classList.contains('drop-zone')) {
                this.selectedElement = null;
                this.renderCanvas();
                this.renderPropertyPanel();
            }
        });
    }

    setupPropertyEventListeners() {
        document.querySelectorAll('[data-property]').forEach(input => {
            input.addEventListener('input', (e) => {
                const property = e.target.dataset.property;
                let value = e.target.value;
                
                if (e.target.type === 'checkbox') {
                    value = e.target.checked;
                } else if (e.target.type === 'number') {
                    value = parseInt(value) || 1;
                }
                
                this.updateElementProperty(property, value);
            });
        });
    }

    // =====================================================
    // CANVAS MANAGEMENT
    // =====================================================

    addElementToCanvas(componentType, insertIndex = -1) {
        const component = this.componentLibrary[componentType];
        if (!component) return;

        const newElement = {
            id: `element_${++this.elementIdCounter}`,
            type: componentType,
            config: { ...component.defaultConfig }
        };

        if (insertIndex >= 0 && insertIndex < this.canvasElements.length) {
            this.canvasElements.splice(insertIndex, 0, newElement);
        } else {
            this.canvasElements.push(newElement);
        }

        this.renderCanvas();
    }

    selectElement(elementId) {
        this.selectedElement = this.canvasElements.find(el => el.id === elementId);
        this.renderCanvas();
        this.renderPropertyPanel();
    }

    updateElementProperty(property, value) {
        if (!this.selectedElement) return;

        this.selectedElement.config[property] = value;
        this.renderCanvas();
    }

    removeSelectedElement() {
        if (!this.selectedElement) return;

        const index = this.canvasElements.findIndex(el => el.id === this.selectedElement.id);
        if (index >= 0) {
            this.canvasElements.splice(index, 1);
            this.selectedElement = null;
            this.renderCanvas();
            this.renderPropertyPanel();
        }
    }

    renderCanvas() {
        const canvasContent = document.getElementById('canvasContent') || document.getElementById('pageContent');
        if (canvasContent) {
            canvasContent.innerHTML = this.renderCanvasContent();
            this.setupCanvasEventListeners();
        }
    }

    renderPropertyPanel() {
        const panel = document.getElementById('propertyPanelContent');
        if (panel) {
            panel.innerHTML = this.renderPropertyPanel();
            this.setupPropertyEventListeners();
        }
    }

    // =====================================================
    // DATA PERSISTENCE
    // =====================================================

    async loadExistingConfiguration() {
        try {
            const contextKey = `${this.currentContext.type}_${this.currentContext.id}`;
            const configs = await supabaseClient.getAll('ui_configurations', {
                filters: { 
                    project_id: supabaseClient.getCurrentProjectId(),
                    context_type: contextKey
                }
            });

            if (configs.length > 0) {
                const config = configs[0];
                this.canvasElements = config.configuration?.elements || [];
            } else {
                this.canvasElements = [];
            }
        } catch (error) {
            logger.error('Failed to load existing configuration:', error);
            this.canvasElements = [];
        }
    }

    async saveConfiguration() {
        try {
            const contextKey = `${this.currentContext.type}_${this.currentContext.id}`;
            const configData = {
                project_id: supabaseClient.getCurrentProjectId(),
                context_type: contextKey,
                role_id: null, // Context-specific configs are not role-specific
                configuration: {
                    elements: this.canvasElements,
                    context: this.currentContext,
                    version: '1.0'
                }
            };

            // Check if config already exists
            const existing = await supabaseClient.getAll('ui_configurations', {
                filters: { 
                    project_id: supabaseClient.getCurrentProjectId(),
                    context_type: contextKey
                }
            });

            if (existing.length > 0) {
                await supabaseClient.update('ui_configurations', existing[0].id, configData);
                app.showNotification('success', 'Success', 'UI configuration updated successfully');
            } else {
                await supabaseClient.create('ui_configurations', configData);
                app.showNotification('success', 'Success', 'UI configuration saved successfully');
            }

            this.closeModal();

        } catch (error) {
            logger.error('Failed to save configuration:', error);
            app.showNotification('error', 'Error', 'Failed to save configuration');
        }
    }

    previewConfiguration() {
        logger.log('Preview configuration:', {
            context: this.currentContext,
            elements: this.canvasElements
        });
        app.showNotification('info', 'Preview', 'Preview functionality coming soon');
    }

    // =====================================================
    // UTILITY METHODS
    // =====================================================

    getContextDisplayName() {
        const names = {
            'marker_category': `Marker Category: ${this.currentContext.data.name}`,
            'workflow_stage': `Workflow Stage: ${this.currentContext.data.stage_name}`,
            'form_layout': `Form Layout: ${this.currentContext.data.name}`
        };
        return names[this.currentContext.type] || this.currentContext.type;
    }

    getFontSize(size) {
        const sizes = {
            small: '0.875rem',
            medium: '1rem',
            large: '1.25rem',
            xlarge: '1.5rem'
        };
        return sizes[size] || sizes.medium;
    }

    getSpacerHeight(height) {
        const heights = {
            small: '0.5rem',
            medium: '1rem',
            large: '2rem'
        };
        return heights[height] || heights.medium;
    }

    getDividerThickness(thickness) {
        const thicknesses = {
            thin: '1px',
            medium: '2px',
            thick: '3px'
        };
        return thicknesses[thickness] || thicknesses.thin;
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.reusableUIDesigner = new ReusableUIDesigner();
}

export default ReusableUIDesigner;