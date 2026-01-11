/**
 * Table Structure Edit Page Component
 * Manages editing of custom table structure and columns
 */

import { supabaseClient } from '../core/supabase.js';
import Utils from '../core/utils.js';
import { i18n, i18nDOM } from '../core/i18n.js';

let projectId;
let tableId;
let currentTable;
let columns = [];
let tableData = [];
let isExpanded = false;
let searchTerm = '';

export default async function TablesEditPage(route, context = {}) {
    projectId = context.projectId;
    
    // Extract tableId from route parameters
    // URL format: project/{projectId}/tablesedit/{tableId}
    if (context.params && context.params.length > 0) {
        tableId = context.params[0];
    } else {
        // Fallback: try to extract from context
        tableId = context.tableId;
    }
    
    console.log('TablesEditPage context:', { projectId, tableId, params: context.params, context });
    
    if (!projectId || !tableId) {
        return `
            <div class="error-page">
                <h1>Invalid Table</h1>
                <p>Table ID or Project ID is missing.</p>
                <p>Debug info: projectId=${projectId}, tableId=${tableId}</p>
                <button class="btn btn-primary" onclick="history.back()">Go Back</button>
            </div>
        `;
    }
    
    try {
        currentTable = await supabaseClient.getCustomTable(tableId);
        columns = await supabaseClient.getCustomTableColumns(tableId);
        tableData = await supabaseClient.getCustomTableData(tableId);
        
        if (!currentTable || currentTable.project_id !== projectId) {
            throw new Error('Table not found or access denied');
        }
    } catch (error) {
        console.error('Failed to load table:', error);
        return `
            <div class="error-page">
                <h1>Error Loading Table</h1>
                <p>${error.message}</p>
                <button class="btn btn-primary" onclick="history.back()">Go Back</button>
            </div>
        `;
    }
    
    setTimeout(initializeTablesEditPage, 50);
    
    return `
        <div class="tables-edit-page">
            <div class="page-header">
                <div>
                    <h1 class="page-title">${currentTable.display_name || currentTable.table_name}</h1>
                    <p class="page-subtitle">${tableData.length} rows • ${columns.length} columns • Click column headers to edit structure</p>
                </div>
                <div class="page-actions">
                    <button class="btn btn-secondary" onclick="history.back()">
                        ← Back to Tables
                    </button>
                    <button class="btn btn-secondary" id="import-csv-btn">
                        Import CSV
                    </button>
                    <button class="btn btn-secondary" id="add-column-btn">
                        + Add Column
                    </button>
                    <button class="btn btn-primary" id="add-row-btn">
                        + Add Row
                    </button>
                </div>
            </div>


            <!-- Table Data Section -->
            <div class="section-card">
                <div class="section-header">
                    <h3>Table Data</h3>
                    <div class="data-controls">
                        <input type="text" 
                               class="search-input" 
                               placeholder="Search data..." 
                               id="search-input"
                               value="${searchTerm}">
                        <button class="btn btn-sm btn-secondary" id="expand-toggle-btn">
                            ${isExpanded ? 'Show Preview' : 'Show All'}
                        </button>
                    </div>
                </div>
                <div class="table-data-container">
                    ${renderTableData()}
                </div>
            </div>
        </div>

        <!-- CSV Import Modal -->
        <div id="csv-import-modal" class="modal-overlay" style="display: none;">
            <div class="modal">
                <div class="modal-header">
                    <h3>Import CSV Data</h3>
                    <button class="modal-close" onclick="closeCsvModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label">CSV File</label>
                        <input type="file" id="csv-file-input" accept=".csv" class="form-input">
                        <div class="form-help">Upload a CSV file. First row should contain column headers matching your table columns.</div>
                    </div>
                    <div class="form-group">
                        <label class="form-checkbox">
                            <input type="checkbox" id="replace-data-checkbox">
                            Replace all existing data (otherwise append)
                        </label>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeCsvModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="importCsvData()">Import Data</button>
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
            
            .table-structure-container, .table-data-container {
                overflow-x: auto;
                max-height: 400px;
                overflow-y: auto;
            }
            
            .structure-table, .data-table {
                width: 100%;
                border-collapse: collapse;
                font-size: var(--font-size-sm);
            }
            
            .structure-table th, .structure-table td,
            .data-table th, .data-table td {
                padding: var(--spacing-xs) var(--spacing-sm);
                border: 1px solid var(--color-border-light);
                text-align: left;
            }
            
            .structure-table th, .data-table th {
                background: var(--color-bg-secondary);
                font-weight: var(--font-weight-semibold);
                position: sticky;
                top: 0;
                z-index: 1;
            }
            
            .main-column {
                background: rgba(var(--color-primary-rgb), 0.1) !important;
                border-left: 3px solid var(--color-primary) !important;
                position: relative;
            }
            
            .column-actions {
                display: flex;
                gap: var(--spacing-xs);
                align-items: center;
            }
            
            .edit-cell {
                background: transparent;
                border: none;
                width: 100%;
                padding: var(--spacing-xs);
                font-size: inherit;
                color: inherit;
            }
            
            .edit-cell:focus {
                outline: 2px solid var(--color-primary);
                background: white;
            }
            
            .row-actions {
                display: flex;
                gap: var(--spacing-xs);
                white-space: nowrap;
            }
            
            .empty-data-state {
                padding: var(--spacing-xl);
                text-align: center;
                color: var(--color-text-tertiary);
            }
            
            .preview-note {
                padding: var(--spacing-sm);
                background: var(--color-bg-light);
                border-top: 1px solid var(--color-border-light);
                text-align: center;
                color: var(--color-text-secondary);
                font-size: var(--font-size-xs);
            }
            
            .modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
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
                justify-content: flex-end;
                gap: var(--spacing-sm);
                padding: var(--spacing-md);
                border-top: 1px solid var(--color-border-light);
            }
            
            .error-page {
                text-align: center;
                padding: var(--spacing-3xl);
            }
            
            /* Column Header Editing Styles */
            .column-header {
                background: var(--color-bg-secondary);
                border-bottom: 2px solid var(--color-border-medium);
                padding: var(--spacing-md);
                text-align: left;
                position: relative;
                vertical-align: top;
            }
            
            .column-header.main-column {
                background: #6b7485;
                border-left: 3px solid var(--color-primary);
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
            
            .modal-actions {
                display: flex;
                gap: var(--spacing-sm);
            }
            
            .form-help {
                font-size: var(--font-size-xs);
                color: var(--color-text-tertiary);
                margin-top: var(--spacing-xs);
            }
            
            /* Responsive adjustments */
            @media (max-width: 768px) {
                .column-header-content {
                    flex-direction: column;
                    align-items: flex-start;
                    gap: var(--spacing-xs);
                }
                
                .column-edit-btn {
                    align-self: flex-end;
                }
                
                .modal-content {
                    width: 95%;
                    margin: var(--spacing-sm);
                }
            }
        </style>
    `;
}

function renderTableStructure() {
    if (columns.length === 0) {
        return `
            <div class="empty-data-state">
                <h4>No columns defined</h4>
                <p>Add your first column to get started</p>
                <button class="btn btn-primary" onclick="addNewColumn()">+ Add Column</button>
            </div>
        `;
    }

    return `
        <table class="structure-table">
            <thead>
                <tr>
                    <th>Column Name</th>
                    <th>Type</th>
                    <th>Main Column</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${columns.map(column => `
                    <tr>
                        <td class="${column.column_name === currentTable.main_column ? 'main-column' : ''}">
                            <input type="text" 
                                   class="edit-cell" 
                                   value="${column.column_name}" 
                                   onblur="updateColumnName('${column.id}', this.value)"
                                   onkeydown="handleColumnNameKeydown(event, '${column.id}')">
                        </td>
                        <td>Text</td>
                        <td>${column.column_name === currentTable.main_column ? '★ Main' : ''}</td>
                        <td>
                            <div class="column-actions">
                                <button class="btn btn-xs btn-danger" onclick="deleteColumn('${column.id}', '${column.column_name}')" title="Delete column">×</button>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderTableData() {
    if (columns.length === 0) {
        return `
            <div class="empty-data-state">
                <h4>Add columns first</h4>
                <p>You need to add columns before you can add data</p>
            </div>
        `;
    }

    // Filter data based on search
    const filteredData = tableData.filter(row => {
        if (!searchTerm) return true;
        const searchLower = searchTerm.toLowerCase();
        return Object.values(row.row_data || {}).some(value => 
            String(value || '').toLowerCase().includes(searchLower)
        );
    });

    // Sort by created_at descending (newest first) and limit if not expanded
    const sortedData = [...filteredData].sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
    );
    
    const displayData = isExpanded ? sortedData : sortedData.slice(0, 3);

    if (displayData.length === 0) {
        return `
            <div class="empty-data-state">
                <h4>${searchTerm ? 'No matching data' : 'No data yet'}</h4>
                <p>${searchTerm ? 'Try a different search term' : 'Add your first row to get started'}</p>
                ${!searchTerm ? '<button class="btn btn-primary" onclick="addNewRow()">+ Add Row</button>' : ''}
            </div>
        `;
    }

    const result = `
        <table class="data-table">
            <thead>
                <tr>
                    ${columns.map(column => `
                        <th class="column-header ${column.column_name === currentTable.main_column ? 'main-column' : ''}">
                            <div class="column-header-content">
                                <span class="column-name">${column.column_name}</span>
                                ${column.column_name === currentTable.main_column ? '<span class="main-badge">Main</span>' : ''}
                                <button class="column-edit-btn" onclick="openColumnEditor('${column.id}')" title="Edit column">
                                    ⚙️
                                </button>
                            </div>
                            <div class="column-type-info">text${column.is_required ? ' • Required' : ''}</div>
                        </th>
                    `).join('')}
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${displayData.map(row => `
                    <tr>
                        ${columns.map(column => `
                            <td class="${column.column_name === currentTable.main_column ? 'main-column' : ''}">
                                <input type="text" 
                                       class="edit-cell" 
                                       value="${(row.row_data && row.row_data[column.column_name]) || ''}" 
                                       onblur="updateCellValue('${row.id}', '${column.column_name}', this.value)"
                                       onkeydown="handleCellKeydown(event, '${row.id}', '${column.column_name}')">
                            </td>
                        `).join('')}
                        <td>
                            <div class="row-actions">
                                <button class="btn btn-xs btn-danger" onclick="deleteRow('${row.id}')" title="Delete row">×</button>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    // Add preview note if not expanded and there's more data
    if (!isExpanded && filteredData.length > 3) {
        return result + `
            <div class="preview-note">
                Showing last 3 rows of ${filteredData.length} total rows. 
                <button class="btn btn-xs btn-secondary" onclick="toggleExpanded()">Show All</button>
            </div>
        `;
    }

    return result;
}

function initializeTablesEditPage() {
    setupTablesEditHandlers();
}

function setupTablesEditHandlers() {
    // Add column button
    const addColumnBtn = Utils.DOM.find('#add-column-btn');
    if (addColumnBtn) {
        Utils.DOM.on(addColumnBtn, 'click', addNewColumn);
    }
    
    // Add row button
    const addRowBtn = Utils.DOM.find('#add-row-btn');
    if (addRowBtn) {
        Utils.DOM.on(addRowBtn, 'click', addNewRow);
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
    
    // Expand toggle button
    const expandToggleBtn = Utils.DOM.find('#expand-toggle-btn');
    if (expandToggleBtn) {
        Utils.DOM.on(expandToggleBtn, 'click', toggleExpanded);
    }
    
    // Make functions globally available
    window.addNewColumn = addNewColumn;
    window.deleteColumn = deleteColumn;
    window.updateColumnName = updateColumnName;
    window.handleColumnNameKeydown = handleColumnNameKeydown;
    window.addNewRow = addNewRow;
    window.deleteRow = deleteRow;
    window.updateCellValue = updateCellValue;
    window.handleCellKeydown = handleCellKeydown;
    window.toggleExpanded = toggleExpanded;
    window.showCsvModal = showCsvModal;
    window.closeCsvModal = closeCsvModal;
    window.importCsvData = importCsvData;
    window.openColumnEditor = openColumnEditor;
    window.saveColumnEdit = saveColumnEdit;
    window.cancelColumnEditing = cancelColumnEditing;
    window.confirmDeleteColumn = confirmDeleteColumn;
}

// Simple add new column function
async function addNewColumn() {
    const columnName = prompt('Enter column name (e.g., team_name, score):');
    if (!columnName) return;
    
    // Clean up the column name
    const cleanName = columnName.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 50);
    
    if (!cleanName) {
        alert('Please enter a valid column name.');
        return;
    }
    
    // Check if column already exists
    if (columns.some(col => col.column_name === cleanName)) {
        alert('A column with that name already exists.');
        return;
    }
    
    try {
        await supabaseClient.createCustomTableColumn(tableId, {
            column_name: cleanName
        });
        
        // Reload and refresh
        await refreshTable();
        
    } catch (error) {
        console.error('Add column error:', error);
        alert(`Failed to add column: ${error.message}`);
    }
}

// Update column name inline
async function updateColumnName(columnId, newName) {
    const column = columns.find(c => c.id === columnId);
    if (!column || !newName || newName === column.column_name) return;
    
    // Clean up the column name
    const cleanName = newName.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 50);
    
    if (!cleanName) {
        alert('Please enter a valid column name.');
        await refreshTable();
        return;
    }
    
    // Check if column already exists
    if (columns.some(col => col.column_name === cleanName && col.id !== columnId)) {
        alert('A column with that name already exists.');
        await refreshTable();
        return;
    }
    
    try {
        await supabaseClient.updateCustomTableColumn(columnId, {
            column_name: cleanName
        });
        
        // Update local data
        column.column_name = cleanName;
        
    } catch (error) {
        console.error('Update column name error:', error);
        alert(`Failed to update column name: ${error.message}`);
        await refreshTable();
    }
}

// Handle keyboard events for column names
async function handleColumnNameKeydown(event, columnId) {
    if (event.key === 'Enter') {
        event.target.blur();
    }
    if (event.key === 'Escape') {
        await refreshTable();
    }
}

async function deleteColumn(columnId, columnName) {
    if (!confirm(`Delete column "${columnName}"? This will permanently delete all data in this column.`)) {
        return;
    }
    
    try {
        await supabaseClient.deleteCustomTableColumn(columnId);
        await refreshTable();
        
    } catch (error) {
        console.error('Delete column error:', error);
        alert(`Failed to delete column: ${error.message}`);
    }
}

// Helper function to refresh the table display
async function refreshTable() {
    try {
        columns = await supabaseClient.getCustomTableColumns(tableId);
        tableData = await supabaseClient.getCustomTableData(tableId);
        
        const structureContainer = Utils.DOM.find('.table-structure-container');
        if (structureContainer) {
            structureContainer.innerHTML = renderTableStructure();
        }
        
        const dataContainer = Utils.DOM.find('.table-data-container');
        if (dataContainer) {
            dataContainer.innerHTML = renderTableData();
        }
        
        // Update stats in header
        const subtitle = Utils.DOM.find('.page-subtitle');
        if (subtitle) {
            subtitle.textContent = `${tableData.length} rows • ${columns.length} columns`;
        }
    } catch (error) {
        console.error('Refresh table error:', error);
    }
}

// Row management functions
async function addNewRow() {
    if (columns.length === 0) {
        alert('Add columns first before adding data.');
        return;
    }
    
    try {
        // Create empty row data for all columns
        const rowData = {};
        columns.forEach(column => {
            rowData[column.column_name] = '';
        });
        
        await supabaseClient.create('custom_table_data', {
            table_id: tableId,
            row_data: rowData
        });
        
        await refreshTable();
        
    } catch (error) {
        console.error('Add row error:', error);
        alert(`Failed to add row: ${error.message}`);
    }
}

async function deleteRow(rowId) {
    if (!confirm('Delete this row? This cannot be undone.')) {
        return;
    }
    
    try {
        await supabaseClient.delete('custom_table_data', rowId);
        await refreshTable();
        
    } catch (error) {
        console.error('Delete row error:', error);
        alert(`Failed to delete row: ${error.message}`);
    }
}

async function updateCellValue(rowId, columnName, newValue) {
    const row = tableData.find(r => r.id === rowId);
    if (!row) return;
    
    const currentValue = (row.row_data && row.row_data[columnName]) || '';
    if (newValue === currentValue) return;
    
    try {
        const updatedRowData = {
            ...row.row_data,
            [columnName]: newValue
        };
        
        await supabaseClient.update('custom_table_data', rowId, {
            row_data: updatedRowData
        });
        
        // Update local data
        row.row_data = updatedRowData;
        
    } catch (error) {
        console.error('Update cell error:', error);
        alert(`Failed to update cell: ${error.message}`);
        await refreshTable();
    }
}

function handleCellKeydown(event, rowId, columnName) {
    if (event.key === 'Enter') {
        event.target.blur();
    }
    if (event.key === 'Escape') {
        // Reset to original value
        const row = tableData.find(r => r.id === rowId);
        const originalValue = (row && row.row_data && row.row_data[columnName]) || '';
        event.target.value = originalValue;
        event.target.blur();
    }
}

// Search and view functions
function handleSearch(event) {
    searchTerm = event.target.value;
    const dataContainer = Utils.DOM.find('.table-data-container');
    if (dataContainer) {
        dataContainer.innerHTML = renderTableData();
    }
}

function toggleExpanded() {
    isExpanded = !isExpanded;
    const dataContainer = Utils.DOM.find('.table-data-container');
    if (dataContainer) {
        dataContainer.innerHTML = renderTableData();
    }
    
    const expandToggleBtn = Utils.DOM.find('#expand-toggle-btn');
    if (expandToggleBtn) {
        expandToggleBtn.textContent = isExpanded ? 'Show Preview' : 'Show All';
    }
}

// CSV Import functions
function showCsvModal() {
    const modal = Utils.DOM.find('#csv-import-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeCsvModal() {
    const modal = Utils.DOM.find('#csv-import-modal');
    if (modal) {
        modal.style.display = 'none';
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
        
        // Validate headers against existing columns
        const columnNames = columns.map(c => c.column_name);
        const invalidHeaders = headers.filter(h => !columnNames.includes(h));
        
        if (invalidHeaders.length > 0) {
            alert(`Invalid column headers: ${invalidHeaders.join(', ')}.\nValid columns are: ${columnNames.join(', ')}`);
            return;
        }
        
        // Parse data rows
        const rowsToImport = [];
        for (let i = 0; i < dataRows.length; i++) {
            const values = dataRows[i].split(',').map(v => v.trim().replace(/"/g, ''));
            if (values.length !== headers.length) {
                console.warn(`Row ${i + 2} has ${values.length} values but expected ${headers.length}. Skipping.`);
                continue;
            }
            
            const rowData = {};
            headers.forEach((header, index) => {
                rowData[header] = values[index] || '';
            });
            
            // Add empty values for missing columns
            columnNames.forEach(columnName => {
                if (!(columnName in rowData)) {
                    rowData[columnName] = '';
                }
            });
            
            rowsToImport.push({
                table_id: tableId,
                row_data: rowData
            });
        }
        
        if (rowsToImport.length === 0) {
            alert('No valid data rows to import.');
            return;
        }
        
        // Replace existing data if requested
        if (replaceData) {
            // Delete all existing data
            const existingRows = await supabaseClient.getCustomTableData(tableId);
            for (const row of existingRows) {
                await supabaseClient.delete('custom_table_data', row.id);
            }
        }
        
        // Import new data
        await supabaseClient.createBatch('custom_table_data', rowsToImport);
        
        closeCsvModal();
        await refreshTable();
        
        alert(`Successfully imported ${rowsToImport.length} rows.`);
        
    } catch (error) {
        console.error('CSV import error:', error);
        alert(`Failed to import CSV: ${error.message}`);
    }
}

// Column editing modal functions
function openColumnEditor(columnId) {
    // Close any existing editor
    cancelColumnEditing();
    
    // Find the column data
    const columnData = columns.find(col => col.id === columnId);
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
                    <h4>Edit Column: ${Utils.String.escapeHtml(columnData.column_name)}</h4>
                    <button class="modal-close" onclick="cancelColumnEditing()">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="column-edit-form">
                        <div class="form-group">
                            <label class="form-label" for="edit-column-name">Column Name *</label>
                            <input type="text" id="edit-column-name" name="column_name" class="form-input" 
                                   value="${Utils.String.escapeHtml(columnData.column_name)}" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="edit-column-type">Data Type</label>
                            <select id="edit-column-type" name="column_type" class="form-select">
                                <option value="text" selected>Text</option>
                            </select>
                            <div class="form-help">Currently only text type is supported</div>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    ${columnData.column_name !== currentTable.main_column ? `
                        <button type="button" class="btn btn-danger" onclick="confirmDeleteColumn('${columnId}', '${Utils.String.escapeHtml(columnData.column_name)}')">
                            Delete Column
                        </button>
                    ` : ''}
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
    
    const newName = formData.get('column_name').trim();
    
    // Validate
    if (!newName) {
        alert('Please enter a column name.');
        return;
    }
    
    // Clean up the column name
    const cleanName = newName.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 50);
    
    if (!cleanName) {
        alert('Please enter a valid column name.');
        return;
    }
    
    // Check if column already exists
    if (columns.some(col => col.column_name === cleanName && col.id !== columnId)) {
        alert('A column with that name already exists.');
        return;
    }
    
    try {
        await supabaseClient.updateCustomTableColumn(columnId, {
            column_name: cleanName
        });
        cancelColumnEditing();
        await refreshTable();
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
        deleteColumn(columnId, columnName);
    }
}