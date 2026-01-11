/**
 * Custom Table Structure Editor Page
 * WYSIWYG editor for managing table schemas and previewing data
 */

import { supabaseClient } from '../core/supabase.js';
import Utils from '../core/utils.js';
import { i18n, i18nDOM } from '../core/i18n.js';

export default async function CustomTableEditPage(route, context = {}) {
    const projectId = context.projectId;
    // Extract table ID from route params (last segment of the path)
    const tableId = context.params && context.params.length > 0 ? context.params[0] : null;
    
    if (!tableId) {
        setTimeout(() => i18nDOM.translateDataAttributes(), 50);
        return `
            <div class="error-page">
                <h1 data-i18n="table_edit.table_not_found">Table Not Found</h1>
                <p>No table ID provided.</p>
                <a href="#project/${projectId}/custom-tables" class="btn btn-primary" data-i18n="table_edit.back_to_tables">Back to Tables</a>
            </div>
        `;
    }
    
    if (!projectId) {
        setTimeout(() => i18nDOM.translateDataAttributes(), 50);
        return `
            <div class="error-page">
                <h1 data-i18n="table_edit.no_project_context">No Project Context</h1>
                <p>This page requires a project context.</p>
                <a href="#custom-tables" class="btn btn-primary" data-i18n="table_edit.back_to_tables">Back to Tables</a>
            </div>
        `;
    }
    
    // Ensure project context is set in supabase client
    supabaseClient.setCurrentProject(projectId);
    
    // Load table data
    const data = await loadTableEditData(tableId);
    
    if (!data.table) {
        return `
            <div class="error-page">
                <h1>Table Not Found</h1>
                <p>The requested table could not be found or you don't have access to it.</p>
                <a href="#project/${projectId}/custom-tables" class="btn btn-primary">Back to Tables</a>
            </div>
        `;
    }
    
    // Initialize the page functionality after rendering
    setTimeout(() => initializeTableEditor(tableId), 50);
    
    return `
        <div class="table-edit-page">
            
            <!-- Page Header -->
            <div class="page-header">
                <div class="page-header-nav">
                    <a href="#project/${projectId}/custom-tables" class="btn btn-secondary">← Back to Tables</a>
                </div>
                <div>
                    <h1 class="page-title">Edit Table: ${Utils.escapeHtml(data.table.display_name)}</h1>
                    <p class="page-subtitle">
                        View and edit table data • Click column headers to edit structure
                    </p>
                </div>
                <div class="page-actions">
                    <button class="btn btn-secondary" onclick="location.reload()">
                        Refresh
                    </button>
                    <button class="btn btn-primary" id="add-column-btn">
                        + Add Column
                    </button>
                </div>
            </div>


            <!-- Main Content -->
            <div class="card table-data-card">
                <div class="card-header">
                    <h3 class="card-title">Table Data</h3>
                    <p class="card-subtitle">${data.tableData.length} records • Click column headers to edit structure</p>
                </div>
                <div class="card-body">
                    <div id="table-data">
                        ${renderFullDataTable(data.table.columns, data.tableData, data.table.main_column)}
                    </div>
                </div>
            </div>

        </div>

        <style>
            .table-edit-page {
                max-width: 1400px;
            }
            
            .page-header-nav {
                margin-bottom: var(--spacing-md);
            }
            
            .table-data-card {
                margin-bottom: var(--spacing-lg);
            }
            
            /* Data Table Styles */
            .data-table {
                width: 100%;
                border-collapse: collapse;
                border: 1px solid var(--color-border-light);
                border-radius: var(--border-radius-md);
                overflow: hidden;
                background: var(--color-bg-primary);
            }
            
            .column-header {
                background: var(--color-bg-secondary);
                border-bottom: 2px solid var(--color-border-medium);
                padding: var(--spacing-md);
                text-align: left;
                position: relative;
                vertical-align: top;
            }
            
            .column-header.main-column {
                background: rgba(34, 197, 94, 0.1);
                border-bottom-color: var(--color-success);
            }
            
            .column-header-content {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: var(--spacing-xs);
            }
            
            .column-name {
                font-weight: var(--font-weight-semibold);
                color: var(--color-text-primary);
                display: flex;
                align-items: center;
                gap: var(--spacing-xs);
            }
            
            .main-badge {
                background: var(--color-success);
                color: white;
                font-size: var(--font-size-xs);
                padding: 2px var(--spacing-xs);
                border-radius: var(--border-radius-sm);
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }
            
            .column-edit-btn {
                background: var(--color-bg-primary);
                border: 1px solid var(--color-border-light);
                border-radius: var(--border-radius-sm);
                padding: 4px 6px;
                cursor: pointer;
                font-size: var(--font-size-sm);
                color: var(--color-text-secondary);
                transition: all var(--transition-fast);
            }
            
            .column-edit-btn:hover {
                background: var(--color-primary);
                color: white;
                border-color: var(--color-primary);
            }
            
            .column-type-info {
                font-size: var(--font-size-xs);
                color: var(--color-text-tertiary);
                text-transform: uppercase;
                letter-spacing: 0.05em;
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
            
            .data-table td {
                padding: var(--spacing-sm) var(--spacing-md);
                border-bottom: 1px solid var(--color-border-light);
                font-size: var(--font-size-sm);
                color: var(--color-text-secondary);
                max-width: 250px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            
            .data-table tbody tr:hover {
                background: var(--color-bg-secondary);
            }
            
            .empty-data-cell {
                text-align: center;
                padding: var(--spacing-xl);
                color: var(--color-text-tertiary);
                font-style: italic;
            }
            
            .empty-data {
                text-align: center;
                padding: var(--spacing-xl);
                color: var(--color-text-tertiary);
                background: var(--color-bg-secondary);
                border-radius: var(--border-radius-md);
            }
            
            /* Column Edit Modal Styles */
            .column-edit-modal {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 1000;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .modal-backdrop {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                cursor: pointer;
            }
            
            .modal-content {
                background: var(--color-bg-primary);
                border-radius: var(--border-radius-lg);
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                width: 90%;
                max-width: 500px;
                max-height: 90vh;
                overflow: hidden;
                position: relative;
                z-index: 1001;
            }
            
            .modal-header {
                padding: var(--spacing-lg);
                border-bottom: 1px solid var(--color-border-light);
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            
            .modal-header h4 {
                margin: 0;
                font-size: var(--font-size-lg);
                font-weight: var(--font-weight-semibold);
                color: var(--color-text-primary);
            }
            
            .modal-close {
                background: none;
                border: none;
                font-size: 24px;
                color: var(--color-text-secondary);
                cursor: pointer;
                padding: 0;
                width: 30px;
                height: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: var(--border-radius-sm);
                transition: all var(--transition-fast);
            }
            
            .modal-close:hover {
                background: var(--color-bg-secondary);
                color: var(--color-text-primary);
            }
            
            .modal-body {
                padding: var(--spacing-lg);
                max-height: 60vh;
                overflow-y: auto;
            }
            
            .modal-footer {
                padding: var(--spacing-lg);
                border-top: 1px solid var(--color-border-light);
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            
            .modal-actions {
                display: flex;
                gap: var(--spacing-sm);
            }
            
            .column-form {
                background: var(--color-bg-primary);
                border: 1px dashed var(--color-border-medium);
                border-radius: var(--border-radius-md);
                padding: var(--spacing-md);
                margin-top: var(--spacing-sm);
            }
            
            .form-row {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: var(--spacing-md);
                margin-bottom: var(--spacing-md);
            }
            
            .form-row.full {
                grid-template-columns: 1fr;
            }
            
            /* Responsive adjustments */
            @media (max-width: 768px) {
                .table-edit-page {
                    max-width: 100%;
                    padding: 0 var(--spacing-sm);
                }
                
                .column-header-content {
                    flex-direction: column;
                    align-items: flex-start;
                    gap: var(--spacing-xs);
                }
                
                .column-edit-btn {
                    align-self: flex-end;
                }
                
                .data-table td {
                    max-width: 150px;
                }
                
                .modal-content {
                    width: 95%;
                    margin: var(--spacing-sm);
                }
            }
        </style>
    `;
}

// Load table edit data
async function loadTableEditData(tableId) {
    const data = {
        table: null,
        tableData: [],
        connectionStatus: { status: 'unknown' }
    };

    try {
        // Check connection
        data.connectionStatus = await supabaseClient.healthCheck();
        
        if (data.connectionStatus.status === 'ok') {
            // Load table with columns
            data.table = await supabaseClient.getCustomTableWithColumns(tableId);
            
            // Load full table data
            data.tableData = await supabaseClient.getCustomTableData(tableId);
        }
        
    } catch (error) {
        console.error('Table edit data loading error:', error);
        data.connectionStatus = { status: 'error', error: error.message };
    }

    return data;
}


function renderFullDataTable(columns, tableData, mainColumn) {
    if (columns.length === 0) {
        return `
            <div class="empty-data">
                <p>No columns defined yet. Use the "+ Add Column" button to create your first column.</p>
            </div>
        `;
    }

    return `
        <table class="data-table">
            <thead>
                <tr>
                    ${columns.map(column => `
                        <th class="column-header ${column.column_name === mainColumn ? 'main-column' : ''}">
                            <div class="column-header-content">
                                <span class="column-name editable-header" 
                                      onclick="editColumnName(this, '${column.id}')" 
                                      title="Click to edit column name">${Utils.escapeHtml(column.column_name)}</span>
                                ${column.column_name === mainColumn ? '<span class="main-badge">Main</span>' : ''}
                                <button class="column-edit-btn" onclick="openColumnEditor('${column.id}')" title="Edit column settings">
                                    ⚙️
                                </button>
                            </div>
                            <div class="column-type-info">${column.column_type}${column.is_required ? ' • Required' : ''}</div>
                        </th>
                    `).join('')}
                </tr>
            </thead>
            <tbody>
                ${tableData.length === 0 ? `
                    <tr>
                        <td colspan="${columns.length}" class="empty-data-cell">
                            No data records found. Start adding data to see it here.
                        </td>
                    </tr>
                ` : tableData.map(row => `
                    <tr>
                        ${columns.map(column => {
                            const value = row.row_data?.[column.column_name] || '';
                            return `<td title="${Utils.escapeHtml(String(value))}">${Utils.escapeHtml(String(value))}</td>`;
                        }).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Initialize table editor functionality
function initializeTableEditor(tableId) {
    setTimeout(() => {
        setupTableEditorHandlers(tableId);
    }, 100);
}

function setupTableEditorHandlers(tableId) {
    // Add column button
    const addColumnBtn = Utils.DOM.find('#add-column-btn');
    if (addColumnBtn) {
        Utils.DOM.on(addColumnBtn, 'click', (e) => {
            e.preventDefault();
            showAddColumnForm();
        });
    }
    
    // Make action functions globally available
    window.editColumn = editColumn;
    window.deleteColumn = deleteColumn;
    window.saveColumn = saveColumn;
    window.cancelColumnEdit = cancelColumnEdit;
    window.openColumnEditor = openColumnEditor;
    window.saveColumnEdit = saveColumnEdit;
    window.cancelColumnEditing = cancelColumnEditing;
    window.editColumnName = editColumnName;
    
    // Store table ID and columns globally for access in functions
    window.currentTableId = tableId;
    
    // Store column data globally
    setTimeout(async () => {
        try {
            const tableWithColumns = await supabaseClient.getCustomTableWithColumns(tableId);
            window.currentTableColumns = tableWithColumns.columns;
        } catch (error) {
            console.error('Failed to load column data:', error);
        }
    }, 200);
}

function showAddColumnForm() {
    const tableDataDiv = Utils.DOM.find('#table-data');
    
    const formHtml = `
        <div class="column-form" id="add-column-form">
            <h4>Add New Column</h4>
            <form id="column-form">
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label" for="column-name">Column Name *</label>
                        <input type="text" id="column-name" name="column_name" class="form-input" 
                               placeholder="e.g., email, phone, status" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="column-type">Data Type *</label>
                        <select id="column-type" name="column_type" class="form-select" required>
                            <option value="text">Text</option>
                            <option value="number">Number</option>
                            <option value="date">Date</option>
                            <option value="boolean">Yes/No</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label" for="default-value">Default Value</label>
                        <input type="text" id="default-value" name="default_value" class="form-input" 
                               placeholder="Optional default value">
                    </div>
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="is-required" name="is_required">
                            Required field
                        </label>
                    </div>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="cancelColumnEdit()">Cancel</button>
                    <button type="button" class="btn btn-primary" onclick="saveColumn()">Add Column</button>
                </div>
            </form>
        </div>
    `;
    
    tableDataDiv.insertAdjacentHTML('beforeend', formHtml);
    
    // Focus on the column name input
    const nameInput = Utils.DOM.find('#column-name');
    if (nameInput) {
        nameInput.focus();
    }
}

// Column name inline editing function
function editColumnName(spanElement, columnId) {
    const column = window.currentTableColumns?.find(col => col.id === columnId);
    if (!column) return;
    
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
        
        // If empty, revert
        if (!newValue) {
            input.remove();
            spanElement.style.display = '';
            return;
        }
        
        // If same as current, no need to save
        if (newValue === currentText) {
            input.remove();
            spanElement.style.display = '';
            return;
        }
        
        // Validate column name format
        if (!/^[a-z][a-z0-9_]*$/.test(newValue)) {
            alert('Column name must start with a letter and contain only lowercase letters, numbers, and underscores.');
            input.remove();
            spanElement.style.display = '';
            return;
        }
        
        // Check if column name already exists
        if (window.currentTableColumns?.some(col => col.column_name === newValue && col.id !== columnId)) {
            alert('A column with that name already exists.');
            input.remove();
            spanElement.style.display = '';
            return;
        }
        
        try {
            const originalName = column.column_name;
            
            // Update column definition
            await supabaseClient.updateCustomTableColumn(columnId, {
                column_name: newValue,
                column_type: column.column_type,
                is_required: column.is_required,
                default_value: column.default_value
            });
            
            // If column name changed, migrate all existing data
            if (originalName !== newValue) {
                console.log(`Migrating custom table data from "${originalName}" to "${newValue}"`);
                
                // Get all table data
                const tableData = await supabaseClient.getCustomTableData(window.currentTableId);
                
                // Update each row that has data under the old column name
                for (const row of tableData) {
                    if (row.row_data && row.row_data.hasOwnProperty(originalName)) {
                        const value = row.row_data[originalName];
                        
                        // Create updated row data with new column name
                        const updatedRowData = { ...row.row_data };
                        updatedRowData[newValue] = value; // Add new column name
                        delete updatedRowData[originalName]; // Remove old column name
                        
                        // Update row in database
                        await supabaseClient.update('custom_table_data', row.id, {
                            row_data: updatedRowData
                        });
                    }
                }
            }
            
            spanElement.textContent = newValue;
            input.remove();
            spanElement.style.display = '';
            
            // Update local column data
            column.column_name = newValue;
            
        } catch (error) {
            console.error('Save column name error:', error);
            alert(`Failed to save column name: ${error.message}`);
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

function editColumn(columnId) {
    openColumnEditor(columnId);
}

function openColumnEditor(columnId) {
    // Close any existing editor
    cancelColumnEditing();
    
    // Find the column data
    const currentTableId = window.currentTableId;
    
    // Find column in current data
    const columnData = window.currentTableColumns?.find(col => col.id === columnId);
    if (!columnData) {
        console.error('Column not found:', columnId);
        return;
    }
    
    // Create modal overlay
    const modalHtml = `
        <div class="column-edit-modal" id="column-edit-modal">
            <div class="modal-backdrop" onclick="cancelColumnEditing()"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h4>Edit Column: ${Utils.escapeHtml(columnData.column_name)}</h4>
                    <button class="modal-close" onclick="cancelColumnEditing()">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="column-edit-form">
                        <div class="form-group">
                            <label class="form-label" for="edit-column-name">Column Name *</label>
                            <input type="text" id="edit-column-name" name="column_name" class="form-input" 
                                   value="${Utils.escapeHtml(columnData.column_name)}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="edit-column-type">Data Type *</label>
                            <select id="edit-column-type" name="column_type" class="form-select" required>
                                <option value="text" ${columnData.column_type === 'text' ? 'selected' : ''}>Text</option>
                                <option value="number" ${columnData.column_type === 'number' ? 'selected' : ''}>Number</option>
                                <option value="date" ${columnData.column_type === 'date' ? 'selected' : ''}>Date</option>
                                <option value="boolean" ${columnData.column_type === 'boolean' ? 'selected' : ''}>Yes/No</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="edit-default-value">Default Value</label>
                            <input type="text" id="edit-default-value" name="default_value" class="form-input" 
                                   value="${Utils.escapeHtml(columnData.default_value || '')}" 
                                   placeholder="Optional default value">
                        </div>
                        <div class="form-group">
                            <label class="checkbox-label">
                                <input type="checkbox" id="edit-is-required" name="is_required" 
                                       ${columnData.is_required ? 'checked' : ''}>
                                Required field
                            </label>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-danger" onclick="confirmDeleteColumn('${columnId}', '${Utils.escapeHtml(columnData.column_name)}')">
                        Delete Column
                    </button>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" onclick="cancelColumnEditing()">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="saveColumnEdit('${columnId}')">Save Changes</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Focus on the column name input
    const nameInput = Utils.DOM.find('#edit-column-name');
    if (nameInput) {
        nameInput.focus();
        nameInput.select();
    }
}

async function saveColumnEdit(columnId) {
    const form = Utils.DOM.find('#column-edit-form');
    const formData = new FormData(form);
    
    const columnData = {
        column_name: formData.get('column_name').trim(),
        column_type: formData.get('column_type'),
        default_value: formData.get('default_value').trim() || null,
        is_required: formData.has('is_required')
    };
    
    // Validate
    if (!columnData.column_name || !columnData.column_type) {
        alert('Please fill in all required fields.');
        return;
    }
    
    // Validate column name format
    if (!/^[a-z][a-z0-9_]*$/.test(columnData.column_name)) {
        alert('Column name must start with a letter and contain only lowercase letters, numbers, and underscores.');
        return;
    }
    
    // Check if column name already exists
    if (window.currentTableColumns?.some(col => col.column_name === columnData.column_name && col.id !== columnId)) {
        alert('A column with that name already exists.');
        return;
    }
    
    try {
        // Get original column data for migration check
        const originalColumn = window.currentTableColumns?.find(col => col.id === columnId);
        const originalName = originalColumn?.column_name;
        const isNameChanging = originalName && originalName !== columnData.column_name;
        
        // Update column definition
        await supabaseClient.updateCustomTableColumn(columnId, columnData);
        
        // If column name changed, migrate all existing data
        if (isNameChanging) {
            console.log(`Migrating custom table data from "${originalName}" to "${columnData.column_name}"`);
            
            // Get all table data
            const tableData = await supabaseClient.getCustomTableData(window.currentTableId);
            
            // Update each row that has data under the old column name
            for (const row of tableData) {
                if (row.row_data && row.row_data.hasOwnProperty(originalName)) {
                    const value = row.row_data[originalName];
                    
                    // Create updated row data with new column name
                    const updatedRowData = { ...row.row_data };
                    updatedRowData[columnData.column_name] = value; // Add new column name
                    delete updatedRowData[originalName]; // Remove old column name
                    
                    // Update row in database
                    await supabaseClient.update('custom_table_data', row.id, {
                        row_data: updatedRowData
                    });
                }
            }
        }
        
        cancelColumnEditing();
        location.reload();
    } catch (error) {
        console.error('Save column edit error:', error);
        alert(`Failed to update column: ${error.message}`);
    }
}

function cancelColumnEditing() {
    const modal = Utils.DOM.find('#column-edit-modal');
    if (modal) {
        modal.remove();
    }
}

function confirmDeleteColumn(columnId, columnName) {
    if (confirm(`Are you sure you want to delete the column "${columnName}"? This will permanently remove all data in this column.`)) {
        deleteColumnFromEditor(columnId);
    }
}

async function deleteColumnFromEditor(columnId) {
    try {
        await supabaseClient.deleteCustomTableColumn(columnId);
        cancelColumnEditing();
        location.reload();
    } catch (error) {
        console.error('Delete column error:', error);
        alert(`Failed to delete column: ${error.message}`);
    }
}

async function deleteColumn(columnId, columnName) {
    if (!confirm(`Are you sure you want to delete the column "${columnName}"? This will permanently remove all data in this column.`)) {
        return;
    }
    
    try {
        await supabaseClient.deleteTableColumn(columnId);
        location.reload();
    } catch (error) {
        console.error('Delete column error:', error);
        alert(`Failed to delete column: ${error.message}`);
    }
}

async function saveColumn() {
    const form = Utils.DOM.find('#column-form');
    const formData = new FormData(form);
    
    const columnData = {
        column_name: formData.get('column_name').trim(),
        column_type: formData.get('column_type'),
        default_value: formData.get('default_value').trim() || null,
        is_required: formData.has('is_required')
    };
    
    // Validate
    if (!columnData.column_name || !columnData.column_type) {
        alert('Please fill in all required fields.');
        return;
    }
    
    // Validate column name format
    if (!/^[a-z][a-z0-9_]*$/.test(columnData.column_name)) {
        alert('Column name must start with a letter and contain only lowercase letters, numbers, and underscores.');
        return;
    }
    
    try {
        const tableId = window.currentTableId;
        await supabaseClient.createCustomTableColumn(tableId, columnData);
        location.reload();
    } catch (error) {
        console.error('Save column error:', error);
        alert(`Failed to add column: ${error.message}`);
    }
}

function cancelColumnEdit() {
    const form = Utils.DOM.find('#add-column-form');
    if (form) {
        form.remove();
    }
}