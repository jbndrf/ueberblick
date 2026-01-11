/**
 * UI Designer Modal Component
 * Visual interface for designing bottom sheet layouts and mobile UI configurations
 */

import { supabaseClient } from '../core/supabase.js';
import Utils from '../core/utils.js';
import app from '../core/app.js';
import DebugLogger from '../core/debug-logger.js';

const logger = new DebugLogger('UIDesignerManager');

class UIDesignerManager {
    constructor(projectId, roles) {
        this.projectId = projectId;
        this.roles = roles;
        this.isOpen = false;
        this.currentConfig = null;
        this.selectedElement = null;
        
        // UI state
        this.currentView = 'peek'; // 'peek' or 'expanded'
        this.currentContext = 'form_peek_view';
        this.currentRole = null;
        
        // Component library
        this.componentLibrary = this.initializeComponentLibrary();
        
        // Canvas state
        this.canvasElements = [];
        this.elementIdCounter = 0;
    }

    // =====================================================
    // COMPONENT LIBRARY INITIALIZATION
    // =====================================================

    initializeComponentLibrary() {
        return {
            'action-button': {
                name: 'Action Button',
                icon: 'R',
                category: 'Actions',
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
            'text-display': {
                name: 'Text Display',
                icon: 'T',
                category: 'Content',
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
            'form-section': {
                name: 'Form Section',
                icon: 'DD',
                category: 'Forms',
                defaultConfig: {
                    title: 'Form Section',
                    fields: [],
                    layout: 'vertical',
                    showBorder: true
                },
                properties: [
                    { key: 'title', label: 'Section Title', type: 'text' },
                    { key: 'layout', label: 'Layout', type: 'select', options: ['vertical', 'horizontal', 'grid'] },
                    { key: 'showBorder', label: 'Show Border', type: 'checkbox' }
                ]
            },
            'data-table': {
                name: 'Data Table',
                icon: 'C',
                category: 'Data',
                defaultConfig: {
                    title: 'Data Summary',
                    columns: ['Field', 'Value'],
                    showHeader: true,
                    striped: true
                },
                properties: [
                    { key: 'title', label: 'Table Title', type: 'text' },
                    { key: 'showHeader', label: 'Show Header', type: 'checkbox' },
                    { key: 'striped', label: 'Striped Rows', type: 'checkbox' }
                ]
            },
            'spacer': {
                name: 'Spacer',
                icon: '⬜',
                category: 'Layout',
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
    }

    // =====================================================
    // MAIN INTERFACE METHODS
    // =====================================================

    async createNewConfiguration() {
        this.currentConfig = null;
        this.canvasElements = [];
        this.selectedElement = null;
        await this.openModal();
    }

    async editConfiguration(configId) {
        try {
            const config = await supabaseClient.getById('ui_configurations', configId);
            this.currentConfig = config;
            this.currentContext = config.context_type;
            this.currentRole = config.role_id;
            this.canvasElements = config.configuration?.elements || [];
            this.selectedElement = null;
            await this.openModal();
        } catch (error) {
            logger.error('Failed to load configuration:', error);
            app.showNotification('error', 'Error', 'Failed to load configuration');
        }
    }

    async duplicateConfiguration(configId) {
        try {
            const config = await supabaseClient.getById('ui_configurations', configId);
            this.currentConfig = null;
            this.currentContext = config.context_type;
            this.currentRole = config.role_id;
            this.canvasElements = config.configuration?.elements || [];
            this.selectedElement = null;
            await this.openModal();
        } catch (error) {
            logger.error('Failed to duplicate configuration:', error);
            app.showNotification('error', 'Error', 'Failed to duplicate configuration');
        }
    }

    async deleteConfiguration(configId) {
        try {
            await supabaseClient.delete('ui_configurations', configId);
            app.showNotification('success', 'Success', 'Configuration deleted');
            window.location.reload(); // Refresh the page to update the list
        } catch (error) {
            logger.error('Failed to delete configuration:', error);
            app.showNotification('error', 'Error', 'Failed to delete configuration');
        }
    }

    // =====================================================
    // MODAL MANAGEMENT
    // =====================================================

    async openModal() {
        const modal = document.getElementById('uiDesignerModal');
        const modalContent = document.getElementById('uiDesignerContent');
        
        if (!modal || !modalContent) {
            logger.error('UI Designer modal elements not found');
            return;
        }

        const modalHTML = await this.renderModalInterface();
        modalContent.innerHTML = modalHTML;
        
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
        const modal = document.getElementById('uiDesignerModal');
        if (modal) {
            modal.style.display = 'none';
            this.isOpen = false;
        }
    }

    // =====================================================
    // MODAL INTERFACE RENDERING
    // =====================================================

    async renderModalInterface() {
        const contextOptions = this.getContextTypeOptions();
        const roleOptions = this.getRoleOptions();

        return `
            <div class="ui-designer-interface">
                <!-- Top Toolbar -->
                <div class="ui-designer-toolbar">
                    <div class="toolbar-section">
                        <label>Context Type:</label>
                        <select id="contextTypeSelect" class="form-control">
                            ${contextOptions.map(option => `
                                <option value="${option.value}" ${option.value === this.currentContext ? 'selected' : ''}>
                                    ${option.label}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    
                    <div class="toolbar-section">
                        <label>Role:</label>
                        <select id="roleSelect" class="form-control">
                            <option value="">All Roles</option>
                            ${roleOptions.map(option => `
                                <option value="${option.value}" ${option.value === this.currentRole ? 'selected' : ''}>
                                    ${option.label}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                    
                    <div class="toolbar-section">
                        <label>Preview Mode:</label>
                        <div class="view-toggle-group">
                            <button class="btn btn-sm ${this.currentView === 'peek' ? 'btn-primary' : 'btn-secondary'}" 
                                    data-view="peek">Peek</button>
                            <button class="btn btn-sm ${this.currentView === 'expanded' ? 'btn-primary' : 'btn-secondary'}" 
                                    data-view="expanded">Expanded</button>
                        </div>
                    </div>
                    
                    <div class="toolbar-actions">
                        <button class="btn btn-success" id="saveConfiguration">Save Configuration</button>
                        <button class="btn btn-secondary" id="previewConfiguration">Preview</button>
                    </div>
                </div>

                <!-- Main Design Area -->
                <div class="ui-designer-main">
                    <!-- Component Palette -->
                    <div class="component-palette">
                        <div class="palette-header">
                            <h4>Components</h4>
                        </div>
                        <div class="palette-content" id="componentPalette">
                            ${this.renderComponentPalette()}
                        </div>
                    </div>

                    <!-- Canvas Area -->
                    <div class="canvas-area">
                        <div class="canvas-header">
                            <h4>Bottom Sheet Preview</h4>
                            <div class="canvas-info">
                                ${this.currentView === 'peek' ? 'Peek View (30% height)' : 'Expanded View (70% height)'}
                            </div>
                        </div>
                        <div class="canvas-container">
                            <div class="bottom-sheet-simulator ${this.currentView}" id="bottomSheetCanvas">
                                <div class="bottom-sheet-handle"></div>
                                <div class="bottom-sheet-content" id="canvasContent">
                                    <!-- Canvas elements will be rendered here -->
                                </div>
                            </div>
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
                .ui-designer-interface {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: var(--color-background);
                }

                .ui-designer-toolbar {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-lg);
                    padding: var(--spacing-md);
                    background: var(--color-surface);
                    border-bottom: 1px solid var(--color-border);
                    flex-wrap: wrap;
                }

                .toolbar-section {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                }

                .toolbar-section label {
                    font-weight: 500;
                    color: var(--color-text-secondary);
                    white-space: nowrap;
                }

                .toolbar-section .form-control {
                    min-width: 150px;
                }

                .view-toggle-group {
                    display: flex;
                    border-radius: var(--radius-sm);
                    overflow: hidden;
                }

                .view-toggle-group .btn {
                    border-radius: 0;
                    border-right: none;
                }

                .view-toggle-group .btn:last-child {
                    border-right: 1px solid var(--color-border);
                }

                .toolbar-actions {
                    margin-left: auto;
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

                .palette-header, .panel-header, .canvas-header {
                    padding: var(--spacing-md);
                    border-bottom: 1px solid var(--color-border);
                    background: var(--color-background);
                }

                .palette-header h4, .panel-header h4, .canvas-header h4 {
                    margin: 0;
                    color: var(--color-text-primary);
                    font-size: var(--font-size-sm);
                    font-weight: 600;
                }

                .palette-content {
                    flex: 1;
                    padding: var(--spacing-md);
                    overflow-y: auto;
                }

                .canvas-area {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                }

                .canvas-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .canvas-info {
                    font-size: var(--font-size-xs);
                    color: var(--color-text-tertiary);
                }

                .canvas-container {
                    flex: 1;
                    padding: var(--spacing-lg);
                    background: #f8f9fa;
                    display: flex;
                    justify-content: center;
                    align-items: flex-end;
                    position: relative;
                }

                .bottom-sheet-simulator {
                    width: 360px;
                    background: var(--color-surface);
                    border-radius: 12px 12px 0 0;
                    box-shadow: 0 -4px 20px rgba(0,0,0,0.15);
                    position: relative;
                    transition: height 0.3s ease;
                    border: 1px solid var(--color-border);
                    display: flex;
                    flex-direction: column;
                }

                .bottom-sheet-simulator.peek {
                    height: 180px;
                }

                .bottom-sheet-simulator.expanded {
                    height: 420px;
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

                .component-item:active {
                    cursor: grabbing;
                }

                .component-icon {
                    font-size: 1.2rem;
                }

                .component-name {
                    font-weight: 500;
                    color: var(--color-text-primary);
                    font-size: var(--font-size-sm);
                }

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

                @media (max-width: 1024px) {
                    .ui-designer-main {
                        flex-direction: column;
                    }

                    .component-palette, .property-panel {
                        width: 100%;
                        height: 200px;
                    }

                    .canvas-container {
                        padding: var(--spacing-md);
                    }

                    .bottom-sheet-simulator {
                        width: 100%;
                        max-width: 360px;
                    }
                }
            </style>
        `;
    }

    // =====================================================
    // COMPONENT PALETTE RENDERING
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

    // =====================================================
    // CANVAS RENDERING
    // =====================================================

    renderCanvas() {
        const canvasContent = document.getElementById('canvasContent');
        if (!canvasContent) return;

        if (this.canvasElements.length === 0) {
            canvasContent.innerHTML = `
                <div class="drop-zone" id="mainDropZone">
                    Drop components here to start designing
                </div>
            `;
        } else {
            canvasContent.innerHTML = this.canvasElements.map((element, index) => 
                this.renderCanvasElement(element, index)
            ).join('') + `
                <div class="drop-zone" data-insert-index="${this.canvasElements.length}">
                    Drop components here
                </div>
            `;
        }

        this.setupCanvasEventListeners();
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

            case 'form-section':
                return `
                    <div class="form-section ${config.showBorder ? 'bordered' : ''}">
                        <h4>${config.title}</h4>
                        <div class="form-fields ${config.layout}">
                            [Form fields will be rendered here]
                        </div>
                    </div>
                `;

            case 'data-table':
                return `
                    <div class="data-table">
                        <h4>${config.title}</h4>
                        <table class="table ${config.striped ? 'table-striped' : ''}">
                            ${config.showHeader ? `
                                <thead>
                                    <tr>${config.columns.map(col => `<th>${col}</th>`).join('')}</tr>
                                </thead>
                            ` : ''}
                            <tbody>
                                <tr><td colspan="${config.columns.length}">Sample data...</td></tr>
                            </tbody>
                        </table>
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
    // PROPERTY PANEL RENDERING
    // =====================================================

    renderPropertyPanel() {
        const panel = document.getElementById('propertyPanelContent');
        if (!panel) return;

        if (!this.selectedElement) {
            panel.innerHTML = `
                <div class="no-selection">
                    <p>Select an element to edit its properties</p>
                </div>
            `;
            return;
        }

        const component = this.componentLibrary[this.selectedElement.type];
        const config = { ...component.defaultConfig, ...this.selectedElement.config };

        panel.innerHTML = `
            <div class="property-form">
                <div class="property-group">
                    <h5>${component.name} Properties</h5>
                    ${component.properties.map(prop => this.renderPropertyField(prop, config[prop.key])).join('')}
                </div>
                
                <div class="property-actions">
                    <button class="btn btn-danger btn-sm" onclick="window.uiDesigner.removeSelectedElement()">
                        Remove Element
                    </button>
                </div>
            </div>
        `;

        this.setupPropertyEventListeners();
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
    // EVENT LISTENERS
    // =====================================================

    setupModalEventListeners() {
        // Toolbar controls
        document.getElementById('contextTypeSelect')?.addEventListener('change', (e) => {
            this.currentContext = e.target.value;
            this.updateCanvasForContext();
        });

        document.getElementById('roleSelect')?.addEventListener('change', (e) => {
            this.currentRole = e.target.value || null;
        });

        document.querySelectorAll('[data-view]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.currentView = e.target.dataset.view;
                this.updateViewMode();
            });
        });

        // Save and preview
        document.getElementById('saveConfiguration')?.addEventListener('click', () => {
            this.saveConfiguration();
        });

        document.getElementById('previewConfiguration')?.addEventListener('click', () => {
            this.previewConfiguration();
        });

        // Component palette drag
        this.setupDragAndDrop();
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
        document.getElementById('canvasContent')?.addEventListener('click', (e) => {
            if (e.target.id === 'canvasContent' || e.target.classList.contains('drop-zone')) {
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
                }
                
                this.updateElementProperty(property, value);
            });
        });
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

    // =====================================================
    // UTILITY METHODS
    // =====================================================

    getContextTypeOptions() {
        return [
            { value: 'form_peek_view', label: 'Form Peek View' },
            { value: 'form_full_view', label: 'Form Full View' },
            { value: 'marker_detail_peek_view', label: 'Marker Peek View' },
            { value: 'marker_detail_full_view', label: 'Marker Full View' },
            { value: 'workflow_action_layout', label: 'Action Layout' },
            { value: 'map_interface_layout', label: 'Map Interface' }
        ];
    }

    getRoleOptions() {
        return this.roles.map(role => ({
            value: role.id,
            label: role.name
        }));
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

    updateViewMode() {
        const simulator = document.getElementById('bottomSheetCanvas');
        if (simulator) {
            simulator.className = `bottom-sheet-simulator ${this.currentView}`;
        }

        // Update toggle buttons
        document.querySelectorAll('[data-view]').forEach(btn => {
            if (btn.dataset.view === this.currentView) {
                btn.className = 'btn btn-sm btn-primary';
            } else {
                btn.className = 'btn btn-sm btn-secondary';
            }
        });

        // Update canvas info
        const canvasInfo = document.querySelector('.canvas-info');
        if (canvasInfo) {
            canvasInfo.textContent = this.currentView === 'peek' ? 
                'Peek View (30% height)' : 'Expanded View (70% height)';
        }
    }

    updateCanvasForContext() {
        // Different contexts might have different default components
        // For now, just re-render
        this.renderCanvas();
    }

    async saveConfiguration() {
        try {
            const configData = {
                project_id: this.projectId,
                context_type: this.currentContext,
                role_id: this.currentRole,
                configuration: {
                    elements: this.canvasElements,
                    view_mode: this.currentView,
                    version: '1.0'
                }
            };

            if (this.currentConfig) {
                // Update existing
                await supabaseClient.update('ui_configurations', this.currentConfig.id, configData);
                app.showNotification('success', 'Success', 'Configuration updated successfully');
            } else {
                // Create new
                await supabaseClient.create('ui_configurations', configData);
                app.showNotification('success', 'Success', 'Configuration saved successfully');
            }

            this.closeModal();
            window.location.reload(); // Refresh to show updated list

        } catch (error) {
            logger.error('Failed to save configuration:', error);
            app.showNotification('error', 'Error', 'Failed to save configuration');
        }
    }

    previewConfiguration() {
        // Open a new window/tab with preview
        const previewData = {
            context: this.currentContext,
            elements: this.canvasElements,
            view: this.currentView
        };
        
        logger.log('Preview configuration:', previewData);
        app.showNotification('info', 'Preview', 'Preview functionality coming soon');
    }
}

export default UIDesignerManager;