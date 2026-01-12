/**
 * Custom Marker Edit Page Component
 * Displays markers as rows and marker category fields as columns for tabular editing
 */

import { supabaseClient } from '../core/supabase.js';
import Utils from '../core/utils.js';
import { i18n, i18nDOM } from '../core/i18n.js';

let projectId;
let categoryId;
let currentCategory;
let fields = [];
let markers = [];
let searchTerm = '';

export default async function MarkerCategoryEditPage(route, context = {}) {
    projectId = context.projectId;
    
    // Extract categoryId from route parameters
    if (context.params && context.params.length > 0) {
        categoryId = context.params[0];
    } else {
        categoryId = context.categoryId;
    }
    
    console.log('MarkerCategoryEditPage context:', { projectId, categoryId, params: context.params, context });
    
    if (!projectId || !categoryId) {
        return `
            <div class="error-page">
                <h1>Invalid Category</h1>
                <p>Category ID or Project ID is missing.</p>
                <p>Debug info: projectId=${projectId}, categoryId=${categoryId}</p>
                <button class="btn btn-primary" onclick="history.back()">Go Back</button>
            </div>
        `;
    }
    
    try {
        currentCategory = await supabaseClient.getMarkerCategory(categoryId);
        fields = currentCategory.fields || [];
        markers = await supabaseClient.getMarkersByCategory(categoryId);
        
        if (!currentCategory || currentCategory.project_id !== projectId) {
            throw new Error('Category not found or access denied');
        }
    } catch (error) {
        console.error('Failed to load category:', error);
        return `
            <div class="error-page">
                <h1>Error Loading Category</h1>
                <p>${error.message}</p>
                <button class="btn btn-primary" onclick="history.back()">Go Back</button>
            </div>
        `;
    }
    
    setTimeout(initializeCategoryEditPage, 50);
    
    return `
        <div class="marker-category-edit-page">
            <div class="page-header">
                <div>
                    <h1 class="page-title">Edit ${currentCategory.name} Markers</h1>
                    <p class="page-subtitle">${markers.length} markers • ${fields.length} custom fields • Rows = Markers, Columns = Fields</p>
                </div>
                <div class="page-actions">
                    <button class="btn btn-secondary" onclick="history.back()">
                        ← Back to Categories
                    </button>
                    <button class="btn btn-secondary" id="import-csv-btn">
                        Import CSV
                    </button>
                    <button class="btn btn-secondary" id="add-field-btn">
                        + Add Field
                    </button>
                    <button class="btn btn-primary" id="add-marker-btn">
                        + Add Marker
                    </button>
                </div>
            </div>

            <!-- Marker Data Grid -->
            <div class="section-card">
                <div class="section-header">
                    <h3>Marker Data Grid</h3>
                    <div class="data-controls">
                        <input type="text" 
                               class="search-input" 
                               placeholder="Search markers..." 
                               id="search-input"
                               value="${searchTerm}">
                    </div>
                </div>
                <div class="marker-data-container">
                    ${renderMarkerDataGrid()}
                </div>
            </div>
        </div>

        <!-- CSV Import Modal -->
        <div id="csv-import-modal" class="modal-overlay">
            <div class="modal">
                <div class="modal-header">
                    <h3>Import Marker CSV</h3>
                    <button class="modal-close" onclick="closeCsvModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label">CSV File</label>
                        <input type="file" id="csv-file-input" accept=".csv" class="form-input">
                        <div class="form-help">Upload a CSV file. First row should contain column headers including 'latitude' and 'longitude' for location data.</div>
                    </div>
                    <div class="form-group">
                        <label class="form-checkbox">
                            <input type="checkbox" id="replace-data-checkbox">
                            Replace all existing markers (otherwise append)
                        </label>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeCsvModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="importCsvData()">Import Markers</button>
                </div>
            </div>
        </div>

        <!-- Field Edit Modal -->
        <div id="field-edit-modal" class="modal-overlay">
            <div class="modal">
                <div class="modal-header">
                    <h3>Edit Field</h3>
                    <button class="modal-close" onclick="closeFieldModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="field-edit-form">
                        <div class="form-group">
                            <label class="form-label">Field Name *</label>
                            <input type="text" id="edit-field-name" class="form-input" required>
                            <div class="form-help">Use lowercase letters, numbers, and underscores only</div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Display Label</label>
                            <input type="text" id="edit-field-label" class="form-input">
                            <div class="form-help">Human-readable label for column headers</div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Field Type *</label>
                            <select id="edit-field-type" class="form-select" required>
                                <option value="text">Text</option>
                                <option value="textarea">Textarea</option>
                                <option value="number">Number</option>
                                <option value="select">Select</option>
                                <option value="checkbox">Checkbox</option>
                                <option value="date">Date</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-checkbox">
                                <input type="checkbox" id="edit-field-required">
                                Required field
                            </label>
                        </div>
                        <div class="form-group" id="options-group" style="display: none;">
                            <label class="form-label">Options</label>
                            <input type="text" id="edit-field-options" class="form-input" placeholder="option1,option2,option3">
                            <div class="form-help">For select fields, separate options with commas</div>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-danger" id="delete-field-btn" onclick="deleteCurrentField()">Delete Field</button>
                    <div class="modal-actions">
                        <button class="btn btn-secondary" onclick="closeFieldModal()">Cancel</button>
                        <button class="btn btn-primary" onclick="saveFieldEdit()">Save Changes</button>
                    </div>
                </div>
            </div>
        </div>


        <style>
            .section-card {
                background: white;
                border-radius: var(--border-radius-md);
                box-shadow: var(--shadow-sm);
                margin-bottom: var(--spacing-lg);
                overflow: hidden;
            }
            
            .section-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: var(--spacing-md);
                border-bottom: 1px solid var(--color-border-light);
                background: var(--color-bg-light);
            }
            
            .section-header h3 {
                margin: 0;
                color: var(--color-text-primary);
            }
            
            .data-controls {
                display: flex;
                gap: var(--spacing-sm);
                align-items: center;
            }
            
            .search-input {
                padding: var(--spacing-xs) var(--spacing-sm);
                border: 1px solid var(--color-border);
                border-radius: var(--border-radius-sm);
                font-size: var(--font-size-sm);
                min-width: 200px;
            }
            
            .marker-data-container {
                overflow-x: auto;
                max-height: 400px;
                overflow-y: auto;
            }
            
            .data-grid-wrapper {
                overflow-x: auto;
                border: 1px solid var(--color-border-light);
                border-radius: var(--border-radius-sm);
            }
            
            .data-grid {
                width: 100%;
                border-collapse: collapse;
                font-size: var(--font-size-sm);
                min-width: 600px;
            }
            
            .data-grid th, .data-grid td {
                padding: var(--spacing-sm);
                border: 1px solid var(--color-border-light);
                text-align: left;
                vertical-align: top;
            }
            
            .data-grid th {
                background: var(--color-bg-secondary);
                font-weight: var(--font-weight-semibold);
                position: sticky;
                top: 0;
                z-index: 1;
            }
            
            .row-header {
                background: var(--color-bg-light);
                font-weight: var(--font-weight-semibold);
                color: var(--color-text-secondary);
                min-width: 100px;
            }
            
            .field-header {
                min-width: 150px;
                max-width: 200px;
            }
            
            .location-field {
                background: rgba(var(--color-primary-rgb), 0.1);
                border-left: 3px solid var(--color-primary);
            }
            
            .custom-field {
                background: var(--color-bg-secondary);
            }
            
            .field-header-content {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                gap: var(--spacing-sm);
            }
            
            .field-info {
                display: flex;
                flex-direction: column;
                gap: var(--spacing-xs);
                flex: 1;
            }
            
            .field-edit-btn {
                background: var(--color-bg-primary);
                border: 1px solid var(--color-border-light);
                border-radius: var(--border-radius-sm);
                padding: 4px 6px;
                cursor: pointer;
                font-size: var(--font-size-sm);
                color: var(--color-text-secondary);
                transition: all var(--transition-fast);
                flex-shrink: 0;
            }
            
            .field-edit-btn:hover {
                background: var(--color-primary);
                color: white;
                border-color: var(--color-primary);
            }
            
            .field-name {
                font-weight: var(--font-weight-semibold);
                color: var(--color-text-primary);
            }
            
            .field-type {
                font-size: var(--font-size-xs);
                color: var(--color-text-tertiary);
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }
            
            .required-indicator {
                color: var(--color-danger);
                font-weight: var(--font-weight-bold);
                margin-left: var(--spacing-xs);
            }
            
            .actions-header {
                min-width: 100px;
                background: var(--color-bg-light);
            }
            
            .marker-row:nth-child(even) {
                background: var(--color-bg-light);
            }
            
            .data-cell {
                min-width: 120px;
                padding: var(--spacing-xs);
            }
            
            .field-input {
                width: 100%;
                border: 1px solid transparent;
                background: transparent;
                padding: var(--spacing-xs);
                font-size: inherit;
                color: inherit;
                border-radius: var(--border-radius-sm);
                transition: all var(--transition-fast);
            }
            
            .field-input:focus {
                outline: none;
                border-color: var(--color-primary);
                background: white;
                box-shadow: 0 0 0 2px rgba(var(--color-primary-rgb), 0.2);
            }
            
            .field-input:hover {
                border-color: var(--color-border);
            }
            
            .field-input.saved {
                background: var(--color-success-light);
                border-color: var(--color-success);
            }
            
            .field-input[type="checkbox"] {
                width: auto;
                cursor: pointer;
            }
            
            .field-input textarea {
                min-height: 60px;
                resize: vertical;
            }
            
            .actions-cell {
                white-space: nowrap;
            }
            
            .grid-footer {
                padding: var(--spacing-sm) var(--spacing-md);
                background: var(--color-bg-light);
                border-top: 1px solid var(--color-border-light);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .grid-stats {
                font-size: var(--font-size-sm);
                color: var(--color-text-tertiary);
            }
            
            .empty-data-state {
                padding: var(--spacing-xl);
                text-align: center;
                color: var(--color-text-tertiary);
            }
            
            .empty-row {
                text-align: center;
                background: var(--color-bg-light);
            }
            
            .editable-header {
                cursor: pointer;
                border-radius: var(--border-radius-xs);
                padding: 2px 4px;
                transition: all var(--transition-fast);
            }
            
            .editable-header:hover {
                background: rgba(var(--color-primary-rgb), 0.1);
                color: var(--color-primary);
            }
            
            .header-edit-input {
                background: white;
                border: 2px solid var(--color-primary);
                border-radius: var(--border-radius-sm);
                padding: 4px 8px;
                font-size: inherit;
                font-weight: inherit;
                width: 100%;
                box-sizing: border-box;
            }
            
            
            
            .modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: none;
                align-items: center;
                justify-content: center;
                z-index: 1000;
            }
            
            .modal-overlay.show {
                display: flex;
            }
            
            .modal {
                background: white;
                border-radius: var(--border-radius-md);
                max-width: 500px;
                width: 90%;
                max-height: 90vh;
                overflow-y: auto;
            }
            
            .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: var(--spacing-md);
                border-bottom: 1px solid var(--color-border-light);
            }
            
            .modal-close {
                background: none;
                border: none;
                font-size: var(--font-size-xl);
                cursor: pointer;
                color: var(--color-text-tertiary);
            }
            
            .modal-body {
                padding: var(--spacing-md);
            }
            
            .modal-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: var(--spacing-sm);
                padding: var(--spacing-md);
                border-top: 1px solid var(--color-border-light);
            }
            
            .modal-actions {
                display: flex;
                gap: var(--spacing-sm);
            }
            
            .form-help {
                font-size: var(--font-size-xs);
                color: var(--color-text-tertiary);
                margin-top: var(--spacing-xs);
            }
            
            .error-page {
                text-align: center;
                padding: var(--spacing-3xl);
            }
            
            /* Responsive adjustments */
            @media (max-width: 768px) {
                .data-grid-wrapper {
                    font-size: var(--font-size-xs);
                }
                
                .field-header {
                    min-width: 120px;
                }
                
                .data-cell {
                    min-width: 100px;
                }
                
                .modal {
                    width: 95%;
                    margin: var(--spacing-sm);
                }
            }
        </style>
    `;
}

function getMainColumnHeader() {
    // Get the main column header from category description or use default
    // We'll store it in the description field with a special prefix
    if (currentCategory.description && currentCategory.description.startsWith('ROW_HEADER:')) {
        return currentCategory.description.replace('ROW_HEADER:', '');
    }
    return 'Marker';
}

function getMarkerRowLabel(marker, index) {
    // Check if marker has a custom name in properties
    if (marker.properties && marker.properties.custom_name) {
        return marker.properties.custom_name;
    }
    
    // Fall back to numbered format
    const headerLabel = getMainColumnHeader();
    return `${headerLabel} ${index + 1}`;
}

function renderMarkerDataGrid() {
    // Get fields from category's fields JSONB (excluding latitude/longitude which are always present)
    const categoryFields = fields || [];
    
    // Core location fields (always present) - these come from the PostGIS location field
    const coreFields = [
        { field_name: 'lat', field_type: 'number', label: 'Latitude', required: true },
        { field_name: 'lng', field_type: 'number', label: 'Longitude', required: true }
    ];
    
    // All fields for display
    const allFields = [...coreFields, ...categoryFields];

    // Filter markers based on search
    const filteredMarkers = markers.filter(marker => {
        if (!searchTerm) return true;
        const searchLower = searchTerm.toLowerCase();
        
        // Search in marker properties
        if (marker.properties) {
            for (const value of Object.values(marker.properties)) {
                if (String(value || '').toLowerCase().includes(searchLower)) {
                    return true;
                }
            }
        }
        
        // Search in coordinates
        if (marker.location && marker.location.coordinates) {
            const [lng, lat] = marker.location.coordinates;
            return String(lat || '').includes(searchLower) || 
                   String(lng || '').includes(searchLower);
        }
        
        // Search in title and description
        return String(marker.title || '').toLowerCase().includes(searchLower) ||
               String(marker.description || '').toLowerCase().includes(searchLower);
    });

    // Sort by created_at descending (newest first)
    const sortedMarkers = [...filteredMarkers].sort((a, b) => 
        new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );

    // Always show the grid with headers, even if no markers
    return `
        <div class="data-grid-wrapper">
            <table class="data-grid">
                <thead>
                    <tr>
                        <th class="row-header">
                            <div class="field-header-content">
                                <div class="field-info">
                                    <span class="field-name editable-header" 
                                          onclick="editColumnHeader(this, 'main', null)" 
                                          title="Click to edit header">${getMainColumnHeader()}</span>
                                    <span class="field-type">row header</span>
                                </div>
                            </div>
                        </th>
                        ${allFields.map((field, index) => {
                            // For custom fields, find the index in the fields array
                            const customFieldIndex = field.field_name !== 'lat' && field.field_name !== 'lng' 
                                ? fields.findIndex(f => f.field_name === field.field_name)
                                : -1;
                            
                            return `
                            <th class="field-header ${field.field_name === 'lat' || field.field_name === 'lng' ? 'location-field' : 'custom-field'}">
                                <div class="field-header-content">
                                    <div class="field-info">
                                        <span class="field-name ${customFieldIndex >= 0 ? 'editable-header' : ''}" 
                                              ${customFieldIndex >= 0 ? `onclick="editColumnHeader(this, 'field', ${customFieldIndex})" title="Click to edit label"` : ''}>${field.label || field.field_name}</span>
                                        <span class="field-type">${field.field_type}</span>
                                        ${field.required ? '<span class="required-indicator">*</span>' : ''}
                                    </div>
                                    ${customFieldIndex >= 0 ? `
                                        <button class="field-edit-btn" onclick="openFieldEditor(${customFieldIndex})" title="Edit field settings">
                                            ⚙️
                                        </button>
                                    ` : ''}
                                </div>
                            </th>
                        `;
                        }).join('')}
                        <th class="actions-header">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${sortedMarkers.length === 0 ? `
                        <tr>
                            <td colspan="${allFields.length + 2}" class="empty-row">
                                <div class="empty-data-state">
                                    <h4>${searchTerm ? 'No matching markers found' : 'No markers in this category'}</h4>
                                    <p>${searchTerm ? 'Try a different search term' : 'Add markers to this category to start editing data'}</p>
                                    ${!searchTerm ? '<button class="btn btn-primary" onclick="addNewMarker()">+ Add First Marker</button>' : ''}
                                </div>
                            </td>
                        </tr>
                    ` : sortedMarkers.map((marker, index) => `
                        <tr class="marker-row" data-marker-id="${marker.id}">
                            <td class="row-header editable-header" 
                                onclick="editMarkerRowName(this, '${marker.id}', ${index})" 
                                title="Click to edit marker name">${getMarkerRowLabel(marker, index)}</td>
                            ${allFields.map(field => {
                                let value = '';
                                if (field.field_name === 'lat') {
                                    // Extract latitude from PostGIS location coordinates [lng, lat]
                                    value = marker.location && marker.location.coordinates ? marker.location.coordinates[1] : '';
                                } else if (field.field_name === 'lng') {
                                    // Extract longitude from PostGIS location coordinates [lng, lat]
                                    value = marker.location && marker.location.coordinates ? marker.location.coordinates[0] : '';
                                } else {
                                    value = (marker.properties && marker.properties[field.field_name]) || '';
                                }
                                
                                return `
                                    <td class="data-cell">
                                        ${renderFieldInput(field, value, marker.id)}
                                    </td>
                                `;
                            }).join('')}
                            <td class="actions-cell">
                                <button class="btn btn-xs btn-danger" onclick="deleteMarker('${marker.id}')" title="Delete this marker">
                                    Delete
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <div class="grid-footer">
            <div class="grid-stats">
                ${searchTerm ? `Showing ${sortedMarkers.length} of ${markers.length} markers` : `${sortedMarkers.length} markers total`}
            </div>
        </div>
    `;
}

function renderFieldInput(field, value, markerId) {
    const commonAttributes = `
        data-marker-id="${markerId}" 
        data-field="${field.field_name}"
        onblur="updateFieldValue(this)"
        onkeydown="handleFieldKeydown(event, this)"
        class="field-input"
    `;
    
    switch (field.field_type) {
        case 'number':
            return `<input type="number" value="${value}" step="any" ${commonAttributes}>`;
        case 'textarea':
            return `<textarea ${commonAttributes}>${value}</textarea>`;
        case 'select':
            const options = field.options && typeof field.options === 'string' ? field.options.split(',').map(opt => opt.trim()) : [];
            return `
                <select ${commonAttributes}>
                    <option value="">Select...</option>
                    ${options.map(option => `
                        <option value="${option}" ${value === option ? 'selected' : ''}>${option}</option>
                    `).join('')}
                </select>
            `;
        case 'checkbox':
            return `<input type="checkbox" ${value === 'true' || value === true ? 'checked' : ''} ${commonAttributes}>`;
        case 'date':
            return `<input type="date" value="${value}" ${commonAttributes}>`;
        default:
            return `<input type="text" value="${value}" ${commonAttributes}>`;
    }
}

function initializeCategoryEditPage() {
    setupCategoryEditHandlers();
}

function setupCategoryEditHandlers() {
    // Add field button
    const addFieldBtn = Utils.DOM.find('#add-field-btn');
    if (addFieldBtn) {
        Utils.DOM.on(addFieldBtn, 'click', addNewField);
    }
    
    // Add marker button
    const addMarkerBtn = Utils.DOM.find('#add-marker-btn');
    if (addMarkerBtn) {
        Utils.DOM.on(addMarkerBtn, 'click', addNewMarker);
    }
    
    // Import CSV button
    const importCsvBtn = Utils.DOM.find('#import-csv-btn');
    if (importCsvBtn) {
        Utils.DOM.on(importCsvBtn, 'click', showCsvModal);
    }
    
    // Search input
    const searchInput = Utils.DOM.find('#search-input');
    if (searchInput) {
        Utils.DOM.on(searchInput, 'input', handleSearch);
    }
    
    
    // Make functions globally available
    window.addNewMarker = addNewMarker;
    window.deleteMarker = deleteMarker;
    window.updateFieldValue = updateFieldValue;
    window.handleFieldKeydown = handleFieldKeydown;
    window.handleSearch = handleSearch;
    window.showCsvModal = showCsvModal;
    window.closeCsvModal = closeCsvModal;
    window.importCsvData = importCsvData;
    window.addNewField = addNewField;
    window.openFieldEditor = openFieldEditor;
    window.closeFieldModal = closeFieldModal;
    window.saveFieldEdit = saveFieldEdit;
    window.deleteCurrentField = deleteCurrentField;
    window.editColumnHeader = editColumnHeader;
    window.editMarkerRowName = editMarkerRowName;
}



// Column header editing functions
function editColumnHeader(spanElement, type, fieldIndex = null) {
    const currentText = spanElement.textContent;
    
    // Create input element
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentText;
    input.className = 'header-edit-input';
    input.style.cssText = `
        background: white;
        border: 2px solid var(--color-primary);
        border-radius: var(--border-radius-sm);
        padding: 4px 8px;
        font-size: inherit;
        font-weight: inherit;
        width: 100%;
        box-sizing: border-box;
    `;
    
    // Replace span with input
    spanElement.style.display = 'none';
    spanElement.parentNode.insertBefore(input, spanElement);
    input.focus();
    input.select();
    
    // Save function
    const saveEdit = async () => {
        const newValue = input.value.trim();
        if (!newValue) {
            input.remove();
            spanElement.style.display = '';
            return;
        }
        
        if (newValue === currentText) {
            input.remove();
            spanElement.style.display = '';
            return;
        }
        
        try {
            if (type === 'main') {
                // Update main column header - store in description with special prefix
                await supabaseClient.update('marker_categories', categoryId, {
                    description: `ROW_HEADER:${newValue}`
                });
                currentCategory.description = `ROW_HEADER:${newValue}`;
            } else if (type === 'field' && fieldIndex !== null) {
                // Update field label
                fields[fieldIndex].label = newValue;
                await supabaseClient.update('marker_categories', categoryId, {
                    fields: fields
                });
                currentCategory.fields = fields;
            }
            
            spanElement.textContent = newValue;
            input.remove();
            spanElement.style.display = '';
            
            // Refresh the display to show updated header in row labels too
            if (type === 'main') {
                refreshDataDisplay();
            }
            
        } catch (error) {
            console.error('Save header error:', error);
            alert(`Failed to save header: ${error.message}`);
            input.remove();
            spanElement.style.display = '';
        }
    };
    
    // Cancel function
    const cancelEdit = () => {
        input.remove();
        spanElement.style.display = '';
    };
    
    // Event listeners
    input.addEventListener('blur', saveEdit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveEdit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
        }
    });
}

// Marker row name editing function
function editMarkerRowName(cellElement, markerId, index) {
    const marker = markers.find(m => m.id === markerId);
    if (!marker) return;
    
    const currentText = cellElement.textContent;
    
    // Create input element
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentText;
    input.className = 'header-edit-input';
    input.style.cssText = `
        background: white;
        border: 2px solid var(--color-primary);
        border-radius: var(--border-radius-sm);
        padding: 4px 8px;
        font-size: inherit;
        font-weight: inherit;
        width: 100%;
        box-sizing: border-box;
    `;
    
    // Replace cell content with input
    cellElement.innerHTML = '';
    cellElement.appendChild(input);
    input.focus();
    input.select();
    
    // Save function
    const saveEdit = async () => {
        const newValue = input.value.trim();
        
        // If empty, remove custom name and fall back to default
        if (!newValue) {
            try {
                const updatedProperties = { ...marker.properties };
                delete updatedProperties.custom_name;
                
                await supabaseClient.update('markers', markerId, {
                    properties: updatedProperties
                });
                
                marker.properties = updatedProperties;
                cellElement.textContent = getMarkerRowLabel(marker, index);
                
            } catch (error) {
                console.error('Save marker name error:', error);
                alert(`Failed to save marker name: ${error.message}`);
                cellElement.textContent = currentText;
            }
            return;
        }
        
        // If same as current, no need to save
        if (newValue === currentText) {
            cellElement.textContent = currentText;
            return;
        }
        
        try {
            // Update marker properties with custom name
            const updatedProperties = {
                ...marker.properties,
                custom_name: newValue
            };
            
            await supabaseClient.update('markers', markerId, {
                properties: updatedProperties
            });
            
            marker.properties = updatedProperties;
            cellElement.textContent = newValue;
            
        } catch (error) {
            console.error('Save marker name error:', error);
            alert(`Failed to save marker name: ${error.message}`);
            cellElement.textContent = currentText;
        }
    };
    
    // Cancel function
    const cancelEdit = () => {
        cellElement.textContent = currentText;
    };
    
    // Event listeners
    input.addEventListener('blur', saveEdit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveEdit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
        }
    });
}

// Marker management functions
async function addNewMarker() {
    try {
        // Initialize properties object with empty values for all custom fields
        const properties = {};
        fields.forEach(field => {
            properties[field.field_name] = '';
        });
        
        // Create marker with PostGIS location and required fields
        const markerData = {
            project_id: projectId,
            category_id: categoryId,
            title: 'New Marker',
            description: null,
            location: {
                type: 'Point',
                coordinates: [0, 0] // [longitude, latitude]
            },
            properties: properties
        };
        
        const newMarker = await supabaseClient.create('markers', markerData);
        markers.unshift(newMarker); // Add to beginning for easier finding
        refreshDataDisplay();
        
        // Focus on the first input of the new marker
        setTimeout(() => {
            const firstInput = document.querySelector(`[data-marker-id="${newMarker.id}"] .field-input`);
            if (firstInput) {
                firstInput.focus();
            }
        }, 100);
        
    } catch (error) {
        console.error('Add marker error:', error);
        alert(`Failed to add marker: ${error.message}`);
    }
}

async function deleteMarker(markerId) {
    if (!confirm('Delete this marker? This cannot be undone.')) {
        return;
    }
    
    try {
        await supabaseClient.delete('markers', markerId);
        markers = markers.filter(m => m.id !== markerId);
        refreshDataDisplay();
        
    } catch (error) {
        console.error('Delete marker error:', error);
        alert(`Failed to delete marker: ${error.message}`);
    }
}

async function updateFieldValue(inputElement) {
    const markerId = inputElement.dataset.markerId;
    const fieldName = inputElement.dataset.field;
    let newValue;
    
    // Get value based on input type
    if (inputElement.type === 'checkbox') {
        newValue = inputElement.checked;
    } else {
        newValue = inputElement.value;
    }
    
    const marker = markers.find(m => m.id === markerId);
    if (!marker) return;
    
    // Check if value actually changed
    let currentValue;
    if (fieldName === 'lat') {
        currentValue = marker.location && marker.location.coordinates ? marker.location.coordinates[1] : '';
        if (String(newValue) === String(currentValue)) return;
    } else if (fieldName === 'lng') {
        currentValue = marker.location && marker.location.coordinates ? marker.location.coordinates[0] : '';
        if (String(newValue) === String(currentValue)) return;
    } else {
        currentValue = (marker.properties && marker.properties[fieldName]) || '';
        if (newValue === currentValue) return;
    }
    
    try {
        // Update coordinate fields by updating the PostGIS location
        if (fieldName === 'lat' || fieldName === 'lng') {
            const numValue = newValue === '' ? 0 : parseFloat(newValue);
            if (isNaN(numValue)) {
                throw new Error('Invalid coordinate value');
            }
            
            // Get current coordinates or default to [0, 0]
            const currentCoords = marker.location && marker.location.coordinates ? marker.location.coordinates : [0, 0];
            const newCoords = fieldName === 'lng' ? [numValue, currentCoords[1]] : [currentCoords[0], numValue];
            
            const newLocation = {
                type: 'Point',
                coordinates: newCoords
            };
            
            await supabaseClient.update('markers', markerId, {
                location: newLocation
            });
            
            // Update local data
            marker.location = newLocation;
        } else {
            // Update custom fields in properties JSONB
            const updatedProperties = {
                ...marker.properties,
                [fieldName]: newValue
            };
            
            await supabaseClient.update('markers', markerId, {
                properties: updatedProperties
            });
            marker.properties = updatedProperties;
        }
        
        // Visual feedback
        inputElement.classList.add('saved');
        setTimeout(() => inputElement.classList.remove('saved'), 1000);
        
    } catch (error) {
        console.error('Update field value error:', error);
        alert(`Failed to update ${fieldName}: ${error.message}`);
        
        // Reset to original value
        if (fieldName === 'lat' || fieldName === 'lng') {
            inputElement.value = currentValue || '';
        } else {
            if (inputElement.type === 'checkbox') {
                inputElement.checked = currentValue === 'true' || currentValue === true;
            } else {
                inputElement.value = currentValue;
            }
        }
    }
}

function handleFieldKeydown(event, inputElement) {
    if (event.key === 'Enter') {
        event.target.blur();
    }
    if (event.key === 'Escape') {
        const markerId = inputElement.dataset.markerId;
        const fieldName = inputElement.dataset.field;
        const marker = markers.find(m => m.id === markerId);
        
        if (marker) {
            // Reset to original value
            if (fieldName === 'lat') {
                const originalValue = marker.location && marker.location.coordinates ? marker.location.coordinates[1] : '';
                inputElement.value = originalValue;
            } else if (fieldName === 'lng') {
                const originalValue = marker.location && marker.location.coordinates ? marker.location.coordinates[0] : '';
                inputElement.value = originalValue;
            } else {
                const originalValue = (marker.properties && marker.properties[fieldName]) || '';
                if (inputElement.type === 'checkbox') {
                    inputElement.checked = originalValue === 'true' || originalValue === true;
                } else {
                    inputElement.value = originalValue;
                }
            }
        }
        event.target.blur();
    }
}

// Search and view functions
function handleSearch(event) {
    searchTerm = event.target.value;
    refreshDataDisplay();
}


// CSV Import functions
function showCsvModal() {
    const modal = Utils.DOM.find('#csv-import-modal');
    if (modal) {
        modal.classList.add('show');
    }
}

function closeCsvModal() {
    const modal = Utils.DOM.find('#csv-import-modal');
    if (modal) {
        modal.classList.remove('show');
    }
    
    // Reset form
    const fileInput = Utils.DOM.find('#csv-file-input');
    const replaceCheckbox = Utils.DOM.find('#replace-data-checkbox');
    if (fileInput) fileInput.value = '';
    if (replaceCheckbox) replaceCheckbox.checked = false;
}

async function importCsvData() {
    const fileInput = Utils.DOM.find('#csv-file-input');
    const replaceData = Utils.DOM.find('#replace-data-checkbox')?.checked || false;
    
    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
        alert('Please select a CSV file.');
        return;
    }
    
    // Validate project context
    if (!projectId) {
        alert('Project context is required for importing markers.');
        return;
    }
    
    const file = fileInput.files[0];
    
    try {
        const csvText = await file.text();
        const lines = csvText.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
            alert('CSV file is empty.');
            return;
        }
        
        // Parse CSV (simple implementation)
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const dataRows = lines.slice(1);
        
        if (dataRows.length === 0) {
            alert('No data rows found in CSV.');
            return;
        }
        
        // Validate headers - require latitude and longitude
        if (!headers.includes('latitude') || !headers.includes('longitude')) {
            alert('CSV must include "latitude" and "longitude" columns for marker location data.');
            return;
        }
        
        // Parse data rows
        const markersToImport = [];
        for (let i = 0; i < dataRows.length; i++) {
            const values = dataRows[i].split(',').map(v => v.trim().replace(/"/g, ''));
            if (values.length !== headers.length) {
                console.warn(`Row ${i + 2} has ${values.length} values but expected ${headers.length}. Skipping.`);
                continue;
            }
            
            const markerData = { properties: {} };
            headers.forEach((header, index) => {
                if (header === 'latitude' || header === 'longitude') {
                    markerData[header] = parseFloat(values[index]) || 0;
                } else {
                    markerData.properties[header] = values[index] || '';
                }
            });
            
            markersToImport.push({
                project_id: projectId,                // Required field from global context
                category_id: categoryId,              // Already correct
                title: markerData.properties.title || markerData.properties.name || `Imported Marker ${i+1}`, // Required title
                description: markerData.properties.description || null, // Optional description
                location: {                           // PostGIS geometry format
                    type: 'Point',
                    coordinates: [markerData.longitude, markerData.latitude] // [lng, lat] order!
                },
                properties: markerData.properties,    // Custom fields stored in JSONB
                visible_to_roles: []                  // Empty = visible to all participants
            });
        }
        
        if (markersToImport.length === 0) {
            alert('No valid marker data to import.');
            return;
        }
        
        // Update marker category fields based on CSV headers
        const customHeaders = headers.filter(h => h !== 'latitude' && h !== 'longitude');
        if (customHeaders.length > 0) {
            const newFields = customHeaders.map(header => ({
                field_name: header,
                field_type: 'text', // Always text - user can change type manually later
                label: header.charAt(0).toUpperCase() + header.slice(1).replace(/_/g, ' '), // Pretty label
                required: false,
                placeholder: `Enter ${header.replace(/_/g, ' ')}...`
            }));
            
            // Update the marker category with new field definitions
            await supabaseClient.update('marker_categories', categoryId, {
                fields: newFields
            });
            
            // Update local fields variable for immediate UI refresh
            fields = newFields;
            console.log(`Updated marker category fields with ${newFields.length} definitions from CSV headers`);
        }
        
        // Replace existing data if requested
        if (replaceData) {
            // Delete all existing markers
            for (const marker of markers) {
                await supabaseClient.delete('markers', marker.id);
            }
            markers = [];
        }
        
        // Import new data
        for (const markerData of markersToImport) {
            const newMarker = await supabaseClient.create('markers', markerData);
            markers.push(newMarker);
        }
        
        closeCsvModal();
        refreshDataDisplay();
        
        alert(`Successfully imported ${markersToImport.length} markers.`);
        
    } catch (error) {
        console.error('CSV import error:', error);
        alert(`Failed to import CSV: ${error.message}`);
    }
}

// Helper functions

function refreshDataDisplay() {
    const dataContainer = Utils.DOM.find('.marker-data-container');
    if (dataContainer) {
        dataContainer.innerHTML = renderMarkerDataGrid();
    }
    
    // Update counts in header
    const subtitle = Utils.DOM.find('.page-subtitle');
    if (subtitle) {
        subtitle.textContent = `${markers.length} markers • ${fields.length} custom fields • Rows = Markers, Columns = Fields`;
    }
}

// Field management functions
async function addNewField() {
    const fieldName = prompt('Enter field name (e.g., team_name, rating):');
    if (!fieldName) return;
    
    // Clean up the field name
    const cleanName = fieldName.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 50);
    
    if (!cleanName) {
        alert('Please enter a valid field name.');
        return;
    }
    
    // Check if field already exists
    if (fields.some(field => field.field_name === cleanName)) {
        alert('A field with that name already exists.');
        return;
    }
    
    try {
        // Add field to local array
        const newField = {
            field_name: cleanName,
            field_type: 'text',
            label: cleanName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            required: false,
            options: null
        };
        
        fields.push(newField);
        
        // Save to database - this will update the marker_categories.fields JSONB column
        const updatedCategory = await supabaseClient.update('marker_categories', categoryId, {
            fields: fields
        });
        
        // Update local category state
        currentCategory.fields = fields;
        
        // Refresh display
        refreshDataDisplay();
        
    } catch (error) {
        console.error('Add field error:', error);
        alert(`Failed to add field: ${error.message}`);
        // Remove the field we just added since it failed
        fields.pop();
    }
}

// Field editor modal functions
let currentEditingFieldIndex = -1;

function openFieldEditor(index) {
    console.log('openFieldEditor called with index:', index, 'fields:', fields);
    
    if (index < 0 || index >= fields.length) {
        console.error('Invalid field index:', index);
        alert('Invalid field index. Please refresh the page and try again.');
        return;
    }
    
    currentEditingFieldIndex = index;
    const field = fields[index];
    
    console.log('Opening editor for field:', field);
    
    // Populate modal form
    document.getElementById('edit-field-name').value = field.field_name;
    document.getElementById('edit-field-label').value = field.label || '';
    document.getElementById('edit-field-type').value = field.field_type;
    document.getElementById('edit-field-required').checked = field.required || false;
    document.getElementById('edit-field-options').value = field.options || '';
    
    // Show/hide options field based on type
    toggleOptionsField(field.field_type);
    
    // Set up type change listener
    document.getElementById('edit-field-type').onchange = function() {
        toggleOptionsField(this.value);
    };
    
    // Show modal
    const modal = document.getElementById('field-edit-modal');
    if (modal) {
        modal.classList.add('show');
        console.log('Modal should be visible now');
    } else {
        console.error('Modal element not found!');
    }
    
    // Focus on field name
    setTimeout(() => {
        const nameInput = document.getElementById('edit-field-name');
        if (nameInput) {
            nameInput.focus();
        }
    }, 100);
}

function toggleOptionsField(fieldType) {
    const optionsGroup = document.getElementById('options-group');
    if (fieldType === 'select') {
        optionsGroup.style.display = 'block';
    } else {
        optionsGroup.style.display = 'none';
    }
}

function closeFieldModal() {
    const modal = document.getElementById('field-edit-modal');
    if (modal) {
        modal.classList.remove('show');
    }
    currentEditingFieldIndex = -1;
}

async function saveFieldEdit() {
    if (currentEditingFieldIndex === -1) return;
    
    const field = fields[currentEditingFieldIndex];
    const newName = document.getElementById('edit-field-name').value.trim();
    const newLabel = document.getElementById('edit-field-label').value.trim();
    const newType = document.getElementById('edit-field-type').value;
    const newRequired = document.getElementById('edit-field-required').checked;
    const newOptions = document.getElementById('edit-field-options').value.trim();
    
    if (!newName) {
        alert('Please enter a field name.');
        return;
    }
    
    // Clean up the field name
    const cleanName = newName.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 50);
    
    if (!cleanName) {
        alert('Please enter a valid field name.');
        return;
    }
    
    // Check if field already exists
    if (fields.some((f, i) => f.field_name === cleanName && i !== currentEditingFieldIndex)) {
        alert('A field with that name already exists.');
        return;
    }
    
    // Store original field state in case we need to restore
    const originalField = {
        field_name: field.field_name,
        label: field.label,
        field_type: field.field_type,
        required: field.required,
        options: field.options
    };
    
    try {
        // Check if field name is changing (need to migrate data)
        const isFieldNameChanging = originalField.field_name !== cleanName;
        
        // Update field properties
        field.field_name = cleanName;
        field.label = newLabel || null;
        field.field_type = newType;
        field.required = newRequired;
        field.options = newOptions || null;
        
        // If field name changed, we need to migrate all marker data
        if (isFieldNameChanging) {
            console.log(`Migrating field data from "${originalField.field_name}" to "${cleanName}"`);
            
            // Update all markers to use the new field name
            for (const marker of markers) {
                if (marker.properties && marker.properties.hasOwnProperty(originalField.field_name)) {
                    // Get the value from the old field name
                    const value = marker.properties[originalField.field_name];
                    
                    // Create updated properties with new field name
                    const updatedProperties = { ...marker.properties };
                    updatedProperties[cleanName] = value; // Add new field name
                    delete updatedProperties[originalField.field_name]; // Remove old field name
                    
                    // Update marker in database
                    await supabaseClient.update('markers', marker.id, {
                        properties: updatedProperties
                    });
                    
                    // Update local marker data
                    marker.properties = updatedProperties;
                }
            }
        }
        
        // Save to database - this will update the marker_categories.fields JSONB column
        const updatedCategory = await supabaseClient.update('marker_categories', categoryId, {
            fields: fields
        });
        
        // Update local category state
        currentCategory.fields = fields;
        
        refreshDataDisplay();
        closeFieldModal();
        
    } catch (error) {
        console.error('Save field error:', error);
        
        // Restore original field state on error
        field.field_name = originalField.field_name;
        field.label = originalField.label;
        field.field_type = originalField.field_type;
        field.required = originalField.required;
        field.options = originalField.options;
        
        // If we were migrating data and it failed, we should refresh from database
        // to ensure local state matches database state
        if (originalField.field_name !== cleanName) {
            console.warn('Field migration failed, refreshing marker data from database');
            try {
                markers = await supabaseClient.getMarkersByCategory(categoryId);
            } catch (refreshError) {
                console.error('Failed to refresh marker data:', refreshError);
            }
        }
        
        alert(`Failed to save field: ${error.message}`);
    }
}

async function deleteCurrentField() {
    if (currentEditingFieldIndex === -1) return;
    
    const field = fields[currentEditingFieldIndex];
    if (!confirm(`Delete field "${field.field_name}"? This will permanently delete this field definition and all marker data for this field.`)) {
        return;
    }
    
    // Store field in case we need to restore it
    const deletedField = { ...field };
    
    try {
        fields.splice(currentEditingFieldIndex, 1);
        
        // Save to database - this will update the marker_categories.fields JSONB column
        const updatedCategory = await supabaseClient.update('marker_categories', categoryId, {
            fields: fields
        });
        
        // Update local category state
        currentCategory.fields = fields;
        
        refreshDataDisplay();
        closeFieldModal();
        
    } catch (error) {
        console.error('Delete field error:', error);
        
        // Restore the deleted field on error
        fields.splice(currentEditingFieldIndex, 0, deletedField);
        
        alert(`Failed to delete field: ${error.message}`);
    }
}

