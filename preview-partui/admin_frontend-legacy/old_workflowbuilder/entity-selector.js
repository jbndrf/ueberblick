/**
 * EntitySelector - Reusable entity selection component
 * Features: Tag-based interface, on-the-fly entity creation, keyboard navigation, # trigger
 * Can be used for any database table/entity type
 */

import { supabaseClient } from '../core/supabase.js';
import app from '../core/app.js';

class EntitySelector {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.options = {
            // Database configuration
            tableName: options.tableName || 'roles', // Table to query from
            projectId: options.projectId || null,
            projectIdField: options.projectIdField || 'project_id', // Field name for project filtering
            
            // Field mappings
            idField: options.idField || 'id',
            nameField: options.nameField || 'name',
            descriptionField: options.descriptionField || 'description',
            
            // UI configuration - dynamic based on capabilities
            placeholder: options.placeholder || this.generatePlaceholder(options),
            label: options.label || this.generateLabel(options),
            entityName: options.entityName || 'item', // Used in messages like "Create new {entityName}"
            entityNamePlural: options.entityNamePlural || 'items',
            
            // Features
            allowCreation: (options.allowCreation !== false) && (options.allowCreate !== false), // Default true, support both old and new names
            allowSelection: options.allowSelection !== false, // Default true
            showQuickSelect: options.showQuickSelect !== false, // Default true
            maxSelections: options.maxSelections || null,
            
            // Callbacks
            onEntityCreate: options.onEntityCreate || null,
            onSelectionChange: options.onSelectionChange || null,
            onError: options.onError || null,
            
            // State
            disabled: options.disabled || false,
            
            // Additional create data (function or object)
            createData: options.createData || null,
            
            // Custom query filters
            filters: options.filters || {},
            
            // Custom ordering
            orderBy: options.orderBy || options.nameField || 'name',
            
            ...options
        };
        
        this.entities = [];
        this.selectedEntities = [];
        this.instanceId = `entity_selector_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Generate dynamic UI text if not provided
        if (!options.placeholder) {
            this.options.placeholder = this.generatePlaceholder(this.options);
        }
        if (!options.label) {
            this.options.label = this.generateLabel(this.options);
        }
        
        this.init();
    }
    
    /**
     * Get CSS class based on selector mode
     */
    getModeClass() {
        const allowCreation = this.options.allowCreation;
        const allowSelection = this.options.allowSelection;
        
        if (allowSelection && allowCreation) {
            return 'mode-select-create';
        } else if (allowSelection && !allowCreation) {
            return 'mode-select-only';
        } else if (!allowSelection && allowCreation) {
            return 'mode-create-only';
        } else {
            return 'mode-view-only';
        }
    }
    
    /**
     * Generate dynamic placeholder text based on capabilities
     */
    generatePlaceholder(options) {
        const allowCreation = options.allowCreation !== false;
        const allowSelection = options.allowSelection !== false;
        
        if (allowSelection && allowCreation) {
            return `Type name or # for all ${options.entityNamePlural || 'items'}...`;
        } else if (allowSelection && !allowCreation) {
            return `Type to select ${options.entityNamePlural || 'items'} or # for all...`;
        } else if (!allowSelection && allowCreation) {
            return `Type to create new ${options.entityName || 'item'}...`;
        } else {
            return `View ${options.entityNamePlural || 'items'}...`;
        }
    }
    
    /**
     * Generate dynamic label text based on capabilities
     */
    generateLabel(options) {
        const allowCreation = options.allowCreation !== false;
        const allowSelection = options.allowSelection !== false;
        
        if (allowSelection && allowCreation) {
            return `${options.entityNamePlural || 'Items'} (type to add new or select existing):`;
        } else if (allowSelection && !allowCreation) {
            return `${options.entityNamePlural || 'Items'} (select existing):`;
        } else if (!allowSelection && allowCreation) {
            return `${options.entityNamePlural || 'Items'} (create new):`;
        } else {
            return `${options.entityNamePlural || 'Items'}:`;
        }
    }
    
    /**
     * Initialize the entity selector
     */
    async init() {
        await this.loadEntities();
        this.render();
        this.setupEventListeners();
    }
    
    /**
     * Load entities from database
     */
    async loadEntities() {
        try {
            let query = supabaseClient.client
                .from(this.options.tableName)
                .select(`${this.options.idField}, ${this.options.nameField}, ${this.options.descriptionField}`)
                .order(this.options.orderBy);
            
            // Apply project filtering if configured
            if (this.options.projectId && this.options.projectIdField) {
                query = query.eq(this.options.projectIdField, this.options.projectId);
            }
            
            // Apply additional filters
            Object.entries(this.options.filters).forEach(([field, value]) => {
                query = query.eq(field, value);
            });
            
            const { data: entities, error } = await query;
            
            if (error) throw error;
            this.entities = entities || [];
        } catch (error) {
            console.error(`EntitySelector: Failed to load ${this.options.entityNamePlural}:`, error);
            this.entities = [];
            if (this.options.onError) {
                this.options.onError(error);
            }
        }
    }
    
    /**
     * Render the entity selector HTML
     */
    render() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error(`EntitySelector: Container ${this.containerId} not found`);
            return;
        }
        
        const inputId = `${this.instanceId}_input`;
        const selectedListId = `${this.instanceId}_selected`;
        const suggestionsId = `${this.instanceId}_suggestions`;
        const quickSelectId = `${this.instanceId}_quickselect`;
        
        const modeClass = this.getModeClass();
        let html = `
            <div class="entity-selector role-selector ${this.options.disabled ? 'disabled' : ''} ${modeClass}">
                <label for="${inputId}">${this.options.label}</label>
                <div class="entity-input-container role-input-container">
                    <input type="text" 
                           id="${inputId}" 
                           placeholder="${this.options.placeholder}"
                           autocomplete="off"
                           ${this.options.disabled ? 'disabled' : ''}
                           ${!this.options.allowCreation && !this.options.allowSelection ? 'readonly' : ''} />`;
        
        if (this.options.showQuickSelect && this.options.allowSelection && !this.options.disabled) {
            html += `
                    <button type="button" 
                            class="entity-quick-select-btn role-quick-select-btn" 
                            title="Select from existing ${this.options.entityNamePlural}">
                        ▼
                    </button>`;
        }
        
        html += `
                    <div id="${suggestionsId}" class="entity-suggestions role-suggestions" style="display: none;"></div>
                    <div id="${quickSelectId}" class="entity-quick-select role-quick-select" style="display: none;"></div>
                </div>
                <div id="${selectedListId}" class="selected-entities selected-roles"></div>
            </div>`;
        
        container.innerHTML = html;
        this.renderSelectedEntities();
    }
    
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const input = this.getElement('input');
        const quickSelectBtn = this.getElement('quickselect_btn');
        
        if (input) {
            input.addEventListener('keydown', (e) => this.handleKeydown(e));
            input.addEventListener('input', (e) => this.handleInput(e));
        }
        
        if (quickSelectBtn) {
            quickSelectBtn.addEventListener('click', () => this.toggleQuickSelect());
        }
        
        // Global click handler to close dropdowns
        document.addEventListener('click', (e) => {
            if (!e.target.closest(`#${this.containerId}`)) {
                this.hideDropdowns();
            }
        });
    }
    
    /**
     * Handle keyboard input
     */
    handleKeydown(event) {
        if (this.options.disabled) return;
        
        const suggestionsDiv = this.getElement('suggestions');
        const quickSelectDiv = this.getElement('quickselect');
        
        // Hide quick select when starting to type
        if (quickSelectDiv && quickSelectDiv.style.display !== 'none') {
            quickSelectDiv.style.display = 'none';
        }
        
        if (event.key === 'Enter') {
            event.preventDefault();
            
            // Check if there's a highlighted suggestion
            const highlighted = suggestionsDiv?.querySelector('.entity-suggestion.highlighted');
            if (highlighted) {
                const entityId = highlighted.getAttribute('data-entity-id') || '';
                let entityName = highlighted.querySelector('.entity-name')?.textContent || '';
                
                // If it's a "new" suggestion, extract the actual name from "Create 'name'" text
                if (highlighted.classList.contains('new')) {
                    const match = entityName.match(/Create "(.+)"/);
                    if (match) {
                        entityName = match[1];
                    }
                }
                
                this.selectEntity(entityId, entityName);
                return;
            }
            
            const value = event.target.value.trim().replace(/^#/, '');
            if (value) {
                const existingEntity = this.entities.find(e => e[this.options.nameField].toLowerCase() === value.toLowerCase());
                if (existingEntity) {
                    this.selectEntity(existingEntity[this.options.idField], existingEntity[this.options.nameField]);
                } else if (this.options.allowCreation) {
                    this.createAndSelectEntity(value);
                }
            }
            this.hideSuggestions();
        } else if (event.key === 'Escape') {
            this.hideDropdowns();
            event.target.blur();
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            this.navigateSuggestions('down');
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            this.navigateSuggestions('up');
        } else if (event.key === 'Tab') {
            const highlighted = suggestionsDiv?.querySelector('.entity-suggestion.highlighted');
            if (highlighted) {
                event.preventDefault();
                const entityId = highlighted.getAttribute('data-entity-id') || '';
                let entityName = highlighted.querySelector('.entity-name')?.textContent || '';
                
                // If it's a "new" suggestion, extract the actual name from "Create 'name'" text
                if (highlighted.classList.contains('new')) {
                    const match = entityName.match(/Create "(.+)"/);
                    if (match) {
                        entityName = match[1];
                    }
                }
                
                this.selectEntity(entityId, entityName);
            }
        }
    }
    
    /**
     * Handle input changes
     */
    handleInput(event) {
        if (this.options.disabled) return;
        
        const value = event.target.value;
        const trimmedValue = value.trim();
        
        // Hide quick select when typing
        const quickSelectDiv = this.getElement('quickselect');
        if (quickSelectDiv && quickSelectDiv.style.display !== 'none') {
            quickSelectDiv.style.display = 'none';
        }
        
        if (trimmedValue.length === 0) {
            this.hideSuggestions();
            return;
        }
        
        // Check for # trigger (only if selection is allowed)
        if (this.options.allowSelection) {
            if (trimmedValue === '#') {
                this.showAllEntities();
                return;
            }
            
            if (trimmedValue.startsWith('#')) {
                const query = trimmedValue.substring(1);
                if (query.length === 0) {
                    this.showAllEntities();
                } else {
                    this.showSuggestions(query);
                }
                return;
            }
        }
        
        this.showSuggestions(trimmedValue);
    }
    
    /**
     * Show all available entities
     */
    showAllEntities() {
        const suggestionsDiv = this.getElement('suggestions');
        if (!suggestionsDiv) return;
        
        const availableEntities = this.entities.filter(entity => 
            !this.selectedEntities.some(selected => selected.id === entity[this.options.idField])
        );
        
        if (availableEntities.length === 0) {
            suggestionsDiv.innerHTML = `
                <div class="entity-suggestion role-suggestion disabled">
                    <span class="entity-name role-name">All ${this.options.entityNamePlural} already selected</span>
                    <span class="entity-type role-type"></span>
                </div>`;
        } else {
            let html = '';
            availableEntities.forEach(entity => {
                html += `
                    <div class="entity-suggestion role-suggestion existing" data-entity-id="${entity[this.options.idField]}">
                        <span class="entity-name role-name">${entity[this.options.nameField]}</span>
                        <span class="entity-type role-type">existing</span>
                    </div>`;
            });
            suggestionsDiv.innerHTML = html;
            this.attachSuggestionHandlers();
        }
        
        suggestionsDiv.style.display = 'block';
    }
    
    /**
     * Show entity suggestions based on query
     */
    showSuggestions(query) {
        const suggestionsDiv = this.getElement('suggestions');
        if (!suggestionsDiv) return;
        
        const lowerQuery = query.toLowerCase();
        const matchingEntities = this.entities.filter(entity => 
            entity[this.options.nameField].toLowerCase().includes(lowerQuery) && 
            !this.selectedEntities.some(selected => selected.id === entity[this.options.idField])
        );
        
        let html = '';
        
        // Show existing entity matches
        matchingEntities.forEach(entity => {
            html += `
                <div class="entity-suggestion role-suggestion existing" data-entity-id="${entity[this.options.idField]}">
                    <span class="entity-name role-name">${entity[this.options.nameField]}</span>
                    <span class="entity-type role-type">existing</span>
                </div>`;
        });
        
        // Show create new option if allowed and no exact match
        const exactMatch = matchingEntities.find(entity => entity[this.options.nameField].toLowerCase() === lowerQuery);
        if (this.options.allowCreation && !exactMatch && query.length > 0) {
            html += `
                <div class="entity-suggestion role-suggestion new" data-entity-id="">
                    <span class="entity-name role-name">Create "${query}"</span>
                    <span class="entity-type role-type">+ new</span>
                </div>`;
        }
        
        // If no suggestions and no creation allowed, show helpful message
        if (!html && !this.options.allowCreation && this.options.allowSelection) {
            html = `
                <div class="entity-suggestion role-suggestion disabled">
                    <span class="entity-name role-name">No matching ${this.options.entityNamePlural} found</span>
                    <span class="entity-type role-type"></span>
                </div>`;
        }
        
        if (html) {
            suggestionsDiv.innerHTML = html;
            this.attachSuggestionHandlers();
            suggestionsDiv.style.display = 'block';
        } else if (!this.options.allowSelection && !this.options.allowCreation) {
            // Show informational message for view-only mode
            suggestionsDiv.innerHTML = `
                <div class="entity-suggestion role-suggestion disabled">
                    <span class="entity-name role-name">View only - no actions available</span>
                    <span class="entity-type role-type"></span>
                </div>`;
            suggestionsDiv.style.display = 'block';
        } else {
            this.hideSuggestions();
        }
    }
    
    /**
     * Attach click handlers to suggestions
     */
    attachSuggestionHandlers() {
        const suggestionsDiv = this.getElement('suggestions');
        if (!suggestionsDiv) return;
        
        suggestionsDiv.querySelectorAll('.entity-suggestion:not(.disabled)').forEach(suggestion => {
            suggestion.addEventListener('click', () => {
                const entityId = suggestion.getAttribute('data-entity-id') || '';
                const entityName = suggestion.querySelector('.entity-name')?.textContent || '';
                
                if (suggestion.classList.contains('new')) {
                    // Extract entity name from "Create 'name'" text
                    const match = entityName.match(/Create "(.+)"/);
                    if (match) {
                        this.createAndSelectEntity(match[1]);
                    }
                } else {
                    this.selectEntity(entityId, entityName);
                }
            });
        });
    }
    
    /**
     * Navigate through suggestions with keyboard
     */
    navigateSuggestions(direction) {
        const suggestionsDiv = this.getElement('suggestions');
        if (!suggestionsDiv || suggestionsDiv.style.display === 'none') return;
        
        const suggestions = suggestionsDiv.querySelectorAll('.entity-suggestion:not(.disabled)');
        if (suggestions.length === 0) return;
        
        let currentIndex = -1;
        suggestions.forEach((suggestion, index) => {
            if (suggestion.classList.contains('highlighted')) {
                currentIndex = index;
                suggestion.classList.remove('highlighted');
            }
        });
        
        if (direction === 'down') {
            currentIndex = currentIndex < suggestions.length - 1 ? currentIndex + 1 : 0;
        } else {
            currentIndex = currentIndex > 0 ? currentIndex - 1 : suggestions.length - 1;
        }
        
        suggestions[currentIndex].classList.add('highlighted');
        suggestions[currentIndex].scrollIntoView({
            block: 'nearest',
            behavior: 'smooth'
        });
    }
    
    /**
     * Toggle quick select dropdown
     */
    toggleQuickSelect() {
        if (this.options.disabled || !this.options.allowSelection) return;
        
        const quickSelectDiv = this.getElement('quickselect');
        if (!quickSelectDiv) return;
        
        const isVisible = quickSelectDiv.style.display !== 'none';
        
        this.hideDropdowns();
        
        if (!isVisible) {
            this.populateQuickSelect();
            quickSelectDiv.style.display = 'block';
        }
    }
    
    /**
     * Populate quick select dropdown
     */
    populateQuickSelect() {
        const quickSelectDiv = this.getElement('quickselect');
        if (!quickSelectDiv) return;
        
        const availableEntities = this.entities.filter(entity => 
            !this.selectedEntities.some(selected => selected.id === entity[this.options.idField])
        );
        
        if (availableEntities.length === 0) {
            quickSelectDiv.innerHTML = `<div class="entity-quick-option role-quick-option disabled">All ${this.options.entityNamePlural} already selected</div>`;
        } else {
            let html = '';
            availableEntities.forEach(entity => {
                const description = entity[this.options.descriptionField] || '';
                html += `
                    <div class="entity-quick-option role-quick-option" title="${description}">
                        ${entity[this.options.nameField]}
                    </div>`;
            });
            quickSelectDiv.innerHTML = html;
            
            // Attach click handlers
            quickSelectDiv.querySelectorAll('.entity-quick-option:not(.disabled)').forEach(option => {
                option.addEventListener('click', () => {
                    if (!this.options.allowSelection) return;
                    const entityName = option.textContent.trim();
                    const entity = this.entities.find(e => e[this.options.nameField] === entityName);
                    if (entity) {
                        this.selectEntity(entity[this.options.idField], entity[this.options.nameField]);
                        this.hideDropdowns();
                    }
                });
            });
        }
    }
    
    /**
     * Create new entity and select it
     */
    async createAndSelectEntity(entityName) {
        if (!this.options.allowCreation) return;
        
        try {
            // Prepare create data
            let createData = {
                [this.options.nameField]: entityName.trim()
            };
            
            // Add project ID if configured
            if (this.options.projectId && this.options.projectIdField) {
                createData[this.options.projectIdField] = this.options.projectId;
            }
            
            // Add description if field exists
            if (this.options.descriptionField) {
                createData[this.options.descriptionField] = `${this.options.entityName} created via entity selector`;
            }
            
            // Merge additional create data
            if (this.options.createData) {
                if (typeof this.options.createData === 'function') {
                    const additionalData = await this.options.createData(entityName);
                    createData = { ...createData, ...additionalData };
                } else {
                    createData = { ...createData, ...this.options.createData };
                }
            }
            
            const newEntity = await supabaseClient.create(this.options.tableName, createData);
            
            // Add to entities list
            this.entities.push(newEntity);
            
            // Select the new entity
            this.selectEntity(newEntity[this.options.idField], newEntity[this.options.nameField]);
            
            if (this.options.onEntityCreate) {
                this.options.onEntityCreate(newEntity);
            }
            
            if (app && app.showNotification) {
                app.showNotification('success', `${this.options.entityName} Created`, `${this.options.entityName} "${newEntity[this.options.nameField]}" created successfully`);
            }
            
        } catch (error) {
            console.error(`EntitySelector: Failed to create ${this.options.entityName}:`, error);
            if (this.options.onError) {
                this.options.onError(error);
            }
            if (app && app.showNotification) {
                app.showNotification('error', `${this.options.entityName} Creation Failed`, error.message);
            }
        }
    }
    
    /**
     * Select an entity
     */
    selectEntity(entityId, entityName) {
        if (!entityId && !entityName) return;
        
        // Check if already selected
        if (this.selectedEntities.some(entity => entity.id === entityId)) {
            this.clearInput();
            return;
        }
        
        // Check max selections limit
        if (this.options.maxSelections && this.selectedEntities.length >= this.options.maxSelections) {
            if (app && app.showNotification) {
                app.showNotification('warning', 'Selection Limit', `Maximum ${this.options.maxSelections} ${this.options.entityNamePlural} allowed`);
            }
            return;
        }
        
        // If it's a new entity (no entityId), create it first
        if (!entityId && this.options.allowCreation) {
            this.createAndSelectEntity(entityName);
            return;
        }
        
        // Add to selected entities
        this.selectedEntities.push({ id: entityId, name: entityName });
        
        this.renderSelectedEntities();
        this.clearInput();
        this.hideDropdowns();
        
        if (this.options.onSelectionChange) {
            this.options.onSelectionChange(this.selectedEntities);
        }
    }
    
    /**
     * Remove an entity from selection
     */
    removeEntity(entityId) {
        this.selectedEntities = this.selectedEntities.filter(entity => entity.id !== entityId);
        this.renderSelectedEntities();
        
        if (this.options.onSelectionChange) {
            this.options.onSelectionChange(this.selectedEntities);
        }
    }
    
    /**
     * Render selected entities as tags
     */
    renderSelectedEntities() {
        const selectedDiv = this.getElement('selected');
        if (!selectedDiv) return;
        
        if (this.selectedEntities.length === 0) {
            selectedDiv.innerHTML = '';
            return;
        }
        
        let html = '';
        this.selectedEntities.forEach(entity => {
            html += `
                <span class="entity-tag role-tag" data-entity-id="${entity.id}">
                    ${entity.name}
                    <button type="button" class="remove-entity remove-role" ${this.options.disabled ? 'disabled' : ''}>×</button>
                </span>`;
        });
        
        selectedDiv.innerHTML = html;
        
        // Attach remove handlers
        if (!this.options.disabled) {
            selectedDiv.querySelectorAll('.remove-entity').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const entityId = e.target.closest('.entity-tag').getAttribute('data-entity-id');
                    this.removeEntity(entityId);
                });
            });
        }
    }
    
    /**
     * Utility methods
     */
    getElement(type) {
        const selectors = {
            input: `#${this.instanceId}_input`,
            selected: `#${this.instanceId}_selected`,
            suggestions: `#${this.instanceId}_suggestions`,
            quickselect: `#${this.instanceId}_quickselect`,
            quickselect_btn: '.entity-quick-select-btn'
        };
        
        const container = document.getElementById(this.containerId);
        return container?.querySelector(selectors[type]);
    }
    
    clearInput() {
        const input = this.getElement('input');
        if (input) input.value = '';
    }
    
    hideSuggestions() {
        const suggestionsDiv = this.getElement('suggestions');
        if (suggestionsDiv) suggestionsDiv.style.display = 'none';
    }
    
    hideQuickSelect() {
        const quickSelectDiv = this.getElement('quickselect');
        if (quickSelectDiv) quickSelectDiv.style.display = 'none';
    }
    
    hideDropdowns() {
        this.hideSuggestions();
        this.hideQuickSelect();
    }
    
    /**
     * Check if the selector can perform specific actions
     */
    canCreate() {
        return this.options.allowCreation && !this.options.disabled;
    }
    
    canSelect() {
        return this.options.allowSelection && !this.options.disabled;
    }
    
    isViewOnly() {
        return !this.options.allowCreation && !this.options.allowSelection;
    }
    
    /**
     * Set selector mode
     */
    setMode(allowSelection, allowCreation) {
        this.options.allowSelection = allowSelection;
        this.options.allowCreation = allowCreation;
        
        // Update dynamic text
        this.options.placeholder = this.generatePlaceholder(this.options);
        this.options.label = this.generateLabel(this.options);
        
        // Re-render
        this.render();
    }
    
    /**
     * Public API methods
     */
    
    /**
     * Set selected entities
     */
    async setSelectedEntities(entities) {
        // Ensure entities are loaded
        if (this.entities.length === 0) {
            await this.loadEntities();
        }
        
        this.selectedEntities = entities.map(entity => {
            // Handle both object and string/ID formats
            const entityId = entity.id || entity;
            const entityName = entity.name || this.entities.find(e => e[this.options.idField] === entityId)?.[this.options.nameField];
            
            return {
                id: entityId,
                name: entityName || `${this.options.entityName} ${entityId.substring(0, 8)}...` // Show partial ID if name not found
            };
        });
        this.renderSelectedEntities();
    }
    
    /**
     * Get selected entities
     */
    getSelectedEntities() {
        return [...this.selectedEntities];
    }
    
    /**
     * Get selected entity IDs
     */
    getSelectedEntityIds() {
        return this.selectedEntities.map(entity => entity.id);
    }
    
    /**
     * Clear all selections
     */
    clearSelection() {
        this.selectedEntities = [];
        this.renderSelectedEntities();
        
        if (this.options.onSelectionChange) {
            this.options.onSelectionChange(this.selectedEntities);
        }
    }
    
    /**
     * Disable/enable the selector
     */
    setDisabled(disabled) {
        this.options.disabled = disabled;
        const input = this.getElement('input');
        if (input) {
            input.disabled = disabled;
        }
        
        const container = document.getElementById(this.containerId);
        if (container) {
            if (disabled) {
                container.classList.add('disabled');
            } else {
                container.classList.remove('disabled');
            }
        }
        
        this.renderSelectedEntities();
    }
    
    /**
     * Refresh entities from database
     */
    async refresh() {
        await this.loadEntities();
        this.hideDropdowns();
    }
    
    /**
     * Destroy the selector
     */
    destroy() {
        this.hideDropdowns();
        const container = document.getElementById(this.containerId);
        if (container) {
            container.innerHTML = '';
        }
    }
}

export default EntitySelector;