import { supabaseClient } from '../core/supabase.js';
import DebugLogger from '../core/debug-logger.js';

const logger = new DebugLogger('TableCRUD');

export class TableCRUD {
    constructor(options) {
        this.tableName = options.tableName;
        this.columns = options.columns || [];
        this.editMode = options.editMode || 'modal'; // 'modal', 'inline', 'prompt'
        
        // Mandatory callbacks for business logic
        this.onAdd = options.onAdd;
        this.onEdit = options.onEdit;
        this.onDelete = options.onDelete;
        this.onUpdate = options.onUpdate;
        
        // Validate required callbacks for non-readonly tables
        if (!options.readonly && !this.onAdd) {
            throw new Error(`TableCRUD[${this.tableName}]: onAdd callback is required for non-readonly tables`);
        }
        if (!options.readonly && !this.onEdit) {
            throw new Error(`TableCRUD[${this.tableName}]: onEdit callback is required for non-readonly tables`);
        }
        if (!options.readonly && !this.onDelete) {
            throw new Error(`TableCRUD[${this.tableName}]: onDelete callback is required for non-readonly tables`);
        }
        
        this.customActions = options.customActions || [];
        this.customLoadData = options.customLoadData;
        this.readonly = options.readonly || false;
        
        this.data = [];
        this.isLoading = false;
        
        // Event handler references for proper cleanup
        this.tbodyClickHandler = null;
        this.documentClickHandler = null;
        this.documentClickHandlerAdded = false;
    }

    async render(containerId) {
        this.containerId = containerId;
        const container = document.getElementById(containerId);
        if (!container) {
            logger.error('TableCRUD: Container not found:', containerId);
            return;
        }

        try {
            // Apply full height class to container
            container.classList.add('table-container-full-height');
            
            container.innerHTML = this.getTableHTML();
            this.attachEventListeners();
            await this.loadData();
        } catch (error) {
            logger.error('TableCRUD: Error during render:', error);
            container.innerHTML = `<div class="error">Error loading table: ${error.message}</div>`;
        }
    }

    getTableHTML() {
        return `
            <div class="table-crud-container">
                <div class="table-crud-header">
                    <h3 class="table-crud-title">${this.getTitle()}</h3>
                    ${!this.readonly ? `<button class="btn btn-primary table-crud-add-btn">Add ${this.getSingularName()}</button>` : ''}
                </div>
                <div class="table-crud-content">
                    <div class="table-crud-loading" style="display: none;">Loading...</div>
                    <div class="table-crud-empty" style="display: none;">
                        <p>No ${this.tableName} found.</p>
                    </div>
                    <div class="table-crud-table-container">
                        <table class="table-crud-table">
                            <thead>
                                <tr>
                                    ${this.columns.map(col => `<th>${col.label}</th>`).join('')}
                                    ${!this.readonly ? '<th class="table-crud-actions-header">Actions</th>' : ''}
                                </tr>
                            </thead>
                            <tbody class="table-crud-tbody">
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            ${this.getModalHTML()}
            <style>
                .table-crud-container {
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    overflow: hidden;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                }
                .table-crud-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1rem 1.5rem;
                    background: #f8f9fa;
                    border-bottom: 1px solid #dee2e6;
                }
                .table-crud-title {
                    margin: 0;
                    font-size: 1.25rem;
                    font-weight: 600;
                }
                .table-crud-content {
                    position: relative;
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                }
                .table-crud-loading, .table-crud-empty {
                    padding: 2rem;
                    text-align: center;
                    color: #6c757d;
                }
                .table-crud-table-container {
                    overflow-x: auto;
                    flex: 1;
                    overflow-y: auto;
                }
                .table-crud-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .table-crud-table th {
                    background: #f8f9fa;
                    padding: 0.75rem;
                    text-align: left;
                    font-weight: 600;
                    border-bottom: 2px solid #dee2e6;
                }
                .table-crud-table td {
                    padding: 0.75rem;
                    border-bottom: 1px solid #dee2e6;
                }
                .table-crud-table tbody tr:hover {
                    background: #f8f9fa;
                }
                .table-crud-actions-header {
                    width: 150px;
                    text-align: center;
                }
                .table-crud-actions {
                    display: flex;
                    gap: 0.5rem;
                    justify-content: center;
                }
                .table-crud-btn {
                    padding: 0.25rem 0.5rem;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 0.875rem;
                    text-decoration: none;
                    display: inline-flex;
                    align-items: center;
                    gap: 0.25rem;
                }
                .table-crud-btn:hover {
                    opacity: 0.8;
                }
                .table-crud-btn-edit {
                    background: #007bff;
                    color: white;
                }
                .table-crud-btn-delete {
                    background: #dc3545;
                    color: white;
                }
                .table-crud-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.5);
                    display: none;
                    z-index: 1000;
                    align-items: center;
                    justify-content: center;
                }
                .table-crud-modal-content {
                    background: white;
                    border-radius: 8px;
                    padding: 1.5rem;
                    max-width: 500px;
                    width: 90%;
                    max-height: 80vh;
                    overflow-y: auto;
                }
                .table-crud-modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1rem;
                }
                .table-crud-modal-title {
                    margin: 0;
                    font-size: 1.25rem;
                }
                .table-crud-modal-close {
                    background: none;
                    border: none;
                    font-size: 1.5rem;
                    cursor: pointer;
                    color: #6c757d;
                }
                .table-crud-form {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }
                .table-crud-form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 0.25rem;
                }
                .table-crud-form-label {
                    font-weight: 600;
                }
                .table-crud-form-label.required::after {
                    content: ' *';
                    color: #dc3545;
                }
                .table-crud-form-input.error {
                    border-color: #dc3545;
                    box-shadow: 0 0 0 0.2rem rgba(220, 53, 69, 0.25);
                }
                .table-crud-form-error {
                    color: #dc3545;
                    font-size: 0.875rem;
                    margin-top: 0.25rem;
                }
                .table-crud-checkbox-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    cursor: pointer;
                    padding: 0.5rem 0;
                }
                .table-crud-checkbox-label {
                    font-weight: normal;
                }
                .table-crud-label-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    margin-bottom: 0.25rem;
                }
                .table-crud-info-icon {
                    color: #6c757d;
                    cursor: help;
                    font-size: 0.9rem;
                    line-height: 1;
                    border-radius: 50%;
                    width: 18px;
                    height: 18px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    background: #f8f9fa;
                    border: 1px solid #dee2e6;
                    position: relative;
                }
                .table-crud-info-icon:hover {
                    background: #e9ecef;
                    border-color: #adb5bd;
                }
                .table-crud-tooltip {
                    position: absolute;
                    bottom: 100%;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #333;
                    color: white;
                    padding: 0.5rem 0.75rem;
                    border-radius: 4px;
                    font-size: 0.75rem;
                    white-space: nowrap;
                    max-width: 200px;
                    white-space: normal;
                    z-index: 1000;
                    opacity: 0;
                    visibility: hidden;
                    transition: opacity 0.2s, visibility 0.2s;
                    margin-bottom: 5px;
                }
                .table-crud-tooltip::after {
                    content: '';
                    position: absolute;
                    top: 100%;
                    left: 50%;
                    transform: translateX(-50%);
                    border: 5px solid transparent;
                    border-top-color: #333;
                }
                .table-crud-info-icon:hover .table-crud-tooltip {
                    opacity: 1;
                    visibility: visible;
                }
                .table-crud-form-input {
                    padding: 0.5rem;
                    border: 1px solid #dee2e6;
                    border-radius: 4px;
                }
                .table-crud-form-actions {
                    display: flex;
                    gap: 0.5rem;
                    justify-content: flex-end;
                    margin-top: 1rem;
                }
                .btn {
                    padding: 0.5rem 1rem;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: 500;
                }
                .btn-primary {
                    background: #007bff;
                    color: white;
                }
                .btn-secondary {
                    background: #6c757d;
                    color: white;
                }
                .btn:hover {
                    opacity: 0.9;
                }

                /* Row actions dropdown styling */
                .row-actions-wrapper {
                    position: relative;
                    display: inline-block;
                }

                .row-options-btn {
                    background: #f8f9fa;
                    border: 1px solid #dee2e6;
                    border-radius: 4px;
                    padding: 0.375rem 0.5rem;
                    cursor: pointer;
                    font-size: 1rem;
                    color: #6c757d;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 32px;
                    height: 32px;
                }

                .row-options-btn:hover {
                    background: #e9ecef;
                    border-color: #adb5bd;
                }

                .row-actions-dropdown {
                    position: absolute;
                    top: 100%;
                    right: 0;
                    background: white;
                    border: 1px solid #dee2e6;
                    border-radius: 6px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    min-width: 140px;
                    z-index: 9999;
                    opacity: 0;
                    visibility: hidden;
                    transform: translateY(-10px);
                    transition: all 0.2s ease;
                    margin-top: 4px;
                }

                .row-actions-dropdown.show {
                    opacity: 1;
                    visibility: visible;
                    transform: translateY(0);
                }

                .row-action-item {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    width: 100%;
                    padding: 0.5rem 0.75rem;
                    border: none;
                    background: none;
                    text-align: left;
                    cursor: pointer;
                    transition: background-color 0.2s ease;
                    font-size: 0.875rem;
                    color: #495057;
                }

                .row-action-item:first-child {
                    border-radius: 6px 6px 0 0;
                }

                .row-action-item:last-child {
                    border-radius: 0 0 6px 6px;
                }

                .row-action-item:hover {
                    background-color: #f8f9fa;
                }

                .row-action-item.delete:hover {
                    background-color: #f8d7da;
                    color: #721c24;
                }

                .row-action-item svg {
                    width: 14px;
                    height: 14px;
                    flex-shrink: 0;
                }

                /* Universal table container height styling */
                .table-container-full-height {
                    height: calc(100vh - 200px);
                    min-height: 400px;
                }
            </style>
        `;
    }

    renderFormField(col) {
        const labelClass = col.required ? 'table-crud-form-label required' : 'table-crud-form-label';
        const infoIcon = col.infoTooltip ? `
            <span class="table-crud-info-icon" data-tooltip="${col.infoTooltip}">ⓘ
                <div class="table-crud-tooltip">${col.infoTooltip}</div>
            </span>
        ` : '';
        
        let input = '';
        
        if (col.type === 'select' && col.options) {
            input = `
                <select name="${col.key}" class="table-crud-form-input" ${col.required ? 'required' : ''}>
                    <option value="">Select ${col.label}</option>
                    ${col.options.map(option => 
                        `<option value="${option.value}">${option.label || option.value}</option>`
                    ).join('')}
                </select>
            `;
        } else if (col.type === 'boolean') {
            const defaultChecked = col.defaultValue !== undefined ? col.defaultValue : false;
            input = `
                <label class="table-crud-checkbox-wrapper">
                    <input type="checkbox" name="${col.key}" value="true" ${defaultChecked ? 'checked' : ''}>
                    <span class="table-crud-checkbox-label">${col.checkboxLabel || 'Enable'}</span>
                </label>
            `;
        } else if (col.type === 'textarea' || col.key === 'description') {
            input = `
                <textarea 
                    name="${col.key}" 
                    class="table-crud-form-input"
                    rows="3"
                    placeholder="${col.placeholder || ''}"
                    ${col.required ? 'required' : ''}
                ></textarea>
            `;
        } else {
            input = `
                <input 
                    type="${col.type || 'text'}" 
                    name="${col.key}" 
                    class="table-crud-form-input"
                    placeholder="${col.placeholder || ''}"
                    ${col.required ? 'required' : ''}
                >
            `;
        }
        
        return `
            <div class="table-crud-form-group">
                <div class="table-crud-label-wrapper">
                    <label class="${labelClass}">${col.label}</label>
                    ${infoIcon}
                </div>
                ${input}
                <div class="table-crud-form-error" style="display: none;"></div>
            </div>
        `;
    }

    getModalHTML() {
        if (this.editMode !== 'modal' || this.readonly) return '';
        
        return `
            <div class="table-crud-modal" id="${this.containerId}-modal">
                <div class="table-crud-modal-content">
                    <div class="table-crud-modal-header">
                        <h4 class="table-crud-modal-title">Add ${this.getSingularName()}</h4>
                        <button class="table-crud-modal-close">&times;</button>
                    </div>
                    <form class="table-crud-form" id="${this.containerId}-form">
                        ${this.columns.filter(col => !col.readonly).map(col => this.renderFormField(col)).join('')}
                        <div class="table-crud-form-actions">
                            <button type="button" class="btn btn-secondary table-crud-cancel">Cancel</button>
                            <button type="submit" class="btn btn-primary">Save</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        const container = document.getElementById(this.containerId);
        
        // Add button
        const addBtn = container.querySelector('.table-crud-add-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.handleAdd());
        }

        // Modal events
        if (this.editMode === 'modal') {
            const modal = document.getElementById(`${this.containerId}-modal`);
            const closeBtn = modal?.querySelector('.table-crud-modal-close');
            const cancelBtn = modal?.querySelector('.table-crud-cancel');
            const form = modal?.querySelector('.table-crud-form');

            if (closeBtn) closeBtn.addEventListener('click', () => this.hideModal());
            if (cancelBtn) cancelBtn.addEventListener('click', () => this.hideModal());
            if (form) form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }

        // Table events will be attached when data is loaded
    }

    async loadData() {
        this.showLoading(true);
        try {
            if (this.customLoadData) {
                this.data = await this.customLoadData();
            } else {
                this.data = await supabaseClient.getAll(this.tableName);
            }
            this.renderTable();
        } catch (error) {
            logger.error(`Error loading ${this.tableName}:`, error);
            this.showError('Error Loading Data', error.message || 'Failed to load data');
        } finally {
            this.showLoading(false);
        }
    }

    renderTable() {
        const tbody = document.querySelector(`#${this.containerId} .table-crud-tbody`);
        const emptyState = document.querySelector(`#${this.containerId} .table-crud-empty`);
        
        if (this.data.length === 0) {
            tbody.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        tbody.innerHTML = this.data.map((item, index) => this.renderRow(item, index)).join('');
        
        // Re-attach row event listeners after DOM update
        // Use setTimeout to ensure DOM has been fully updated
        setTimeout(() => {
            this.attachRowEventListeners();
        }, 0);
    }

    renderRow(item, index) {
        return `
            <tr data-id="${item.id}" data-index="${index}">
                ${this.columns.map(col => `<td>${this.renderCell(item, col)}</td>`).join('')}
                ${!this.readonly ? `<td class="table-crud-actions">
                    <div class="row-actions-wrapper">
                        <button class="row-options-btn" data-row-id="${item.id}" title="Actions">
                            ⋯
                        </button>
                        <div class="row-actions-dropdown">
                            <button class="row-action-item edit" data-action="edit" data-id="${item.id}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                                Edit
                            </button>
                            <button class="row-action-item delete" data-action="delete" data-id="${item.id}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3,6 5,6 21,6"></polyline>
                                    <path d="M19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2"></path>
                                </svg>
                                Delete
                            </button>
                            ${this.customActions.map(action => `
                                <button class="row-action-item custom" data-action="${action.key}" data-id="${item.id}">
                                    ${action.icon || ''}
                                    ${action.label}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                </td>` : ''}
            </tr>
        `;
    }

    renderCell(item, column) {
        let value = item[column.key];
        
        if (column.render) {
            return column.render(value, item);
        }
        
        if (column.type === 'boolean') {
            return value ? 'Yes' : 'No';
        }
        
        if (column.type === 'date' && value) {
            return new Date(value).toLocaleDateString();
        }
        
        return value || '';
    }

    attachRowEventListeners() {
        const tbody = document.querySelector(`#${this.containerId} .table-crud-tbody`);
        
        // Remove existing event listeners by cloning the element
        if (this.tbodyClickHandler) {
            tbody.removeEventListener('click', this.tbodyClickHandler);
        }
        
        // Store the handler so we can remove it later
        this.tbodyClickHandler = (e) => {
            // Handle dropdown toggle
            if (e.target.classList.contains('row-options-btn')) {
                e.preventDefault();
                e.stopPropagation();
                
                const dropdown = e.target.nextElementSibling;
                
                // Close other dropdowns
                document.querySelectorAll('.row-actions-dropdown.show').forEach(d => {
                    if (d !== dropdown) d.classList.remove('show');
                });
                
                dropdown.classList.toggle('show');
                return;
            }
            
            // Handle action clicks
            const action = e.target.dataset.action;
            const id = e.target.dataset.id;
            
            if (action === 'edit') {
                e.preventDefault();
                e.stopPropagation();
                // Close dropdown
                e.target.closest('.row-actions-dropdown').classList.remove('show');
                this.handleEdit(id);
            } else if (action === 'delete') {
                e.preventDefault();
                e.stopPropagation();
                // Close dropdown
                e.target.closest('.row-actions-dropdown').classList.remove('show');
                this.handleDelete(id);
            } else if (this.customActions.find(a => a.key === action)) {
                e.preventDefault();
                e.stopPropagation();
                // Close dropdown
                e.target.closest('.row-actions-dropdown').classList.remove('show');
                const customAction = this.customActions.find(a => a.key === action);
                customAction.handler(id, this.getItemById(id));
            }
        };
        
        tbody.addEventListener('click', this.tbodyClickHandler);

        // Only add document listener once
        if (!this.documentClickHandlerAdded) {
            this.documentClickHandler = (e) => {
                if (!e.target.closest('.row-actions-wrapper')) {
                    document.querySelectorAll('.row-actions-dropdown.show').forEach(dropdown => {
                        dropdown.classList.remove('show');
                    });
                }
            };
            
            document.addEventListener('click', this.documentClickHandler);
            this.documentClickHandlerAdded = true;
        }
    }

    async handleAdd() {
        if (this.editMode === 'modal') {
            this.showModal('Add');
        }
    }

    async handleEdit(id) {
        if (this.editMode === 'modal') {
            const item = this.getItemById(id);
            this.showModal('Edit', item);
        }
    }

    async handleDelete(id) {
        const item = this.getItemById(id);
        if (confirm(`Are you sure you want to delete this ${this.getSingularName()}?`)) {
            try {
                await this.onDelete(id, item);
                await this.refresh();
            } catch (error) {
                logger.error('Error deleting item:', error);
                alert('Error deleting item: ' + (error.message || 'Unknown error'));
            }
        }
    }

    async handleFormSubmit(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        
        // Process boolean fields - checkboxes only appear in FormData if checked
        this.columns.forEach(col => {
            if (col.type === 'boolean') {
                data[col.key] = data[col.key] === 'true';
            }
        });
        
        // Convert empty strings to null for optional fields
        Object.keys(data).forEach(key => {
            if (data[key] === '') data[key] = null;
        });
        
        try {
            const isEdit = e.target.dataset.editId;
            
            if (isEdit) {
                await this.onEdit(isEdit, data);
            } else {
                await this.onAdd(data);
            }
            
            this.hideModal();
            await this.refresh();
        } catch (error) {
            logger.error('Error saving item:', error);
            alert('Error saving item: ' + (error.message || 'Unknown error'));
        }
    }

    showModal(mode, item = null) {
        const modal = document.getElementById(`${this.containerId}-modal`);
        const title = modal.querySelector('.table-crud-modal-title');
        const form = modal.querySelector('.table-crud-form');
        
        title.textContent = `${mode} ${this.getSingularName()}`;
        
        if (item) {
            form.dataset.editId = item.id;
            this.columns.forEach(col => {
                const input = form.querySelector(`[name="${col.key}"]`);
                if (input) {
                    if (col.type === 'boolean') {
                        input.checked = Boolean(item[col.key]);
                    } else {
                        input.value = item[col.key] || '';
                    }
                }
            });
        } else {
            delete form.dataset.editId;
            form.reset();
            
            // Set defaults for new items
            this.columns.forEach(col => {
                if (col.defaultValue !== undefined) {
                    const input = form.querySelector(`[name="${col.key}"]`);
                    if (input) {
                        if (col.type === 'boolean') {
                            input.checked = Boolean(col.defaultValue);
                        } else {
                            input.value = col.defaultValue;
                        }
                    }
                }
            });
            
        }
        
        modal.style.display = 'flex';
    }

    hideModal() {
        const modal = document.getElementById(`${this.containerId}-modal`);
        modal.style.display = 'none';
    }

    showLoading(show) {
        const loading = document.querySelector(`#${this.containerId} .table-crud-loading`);
        const content = document.querySelector(`#${this.containerId} .table-crud-table-container`);
        
        if (!loading) {
            logger.error('TableCRUD: Loading element not found for container:', this.containerId);
            return;
        }
        if (!content) {
            logger.error('TableCRUD: Content element not found for container:', this.containerId);
            return;
        }
        
        loading.style.display = show ? 'block' : 'none';
        content.style.display = show ? 'none' : 'block';
    }

    showError(title, message) {
        const container = document.getElementById(this.containerId);
        if (container) {
            const content = container.querySelector('.table-crud-content');
            if (content) {
                content.innerHTML = `
                    <div class="table-crud-error" style="padding: 2rem; text-align: center; color: #dc3545;">
                        <h4>${title}</h4>
                        <p>${message}</p>
                        <button class="btn btn-primary" onclick="this.closest('.table-crud-container').querySelector('.table-crud-content').innerHTML = ''; window.location.reload();">
                            Reload Page
                        </button>
                    </div>
                `;
            }
        }
    }

    getItemById(id) {
        return this.data.find(item => item.id == id);
    }

    getTitle() {
        return this.tableName.charAt(0).toUpperCase() + this.tableName.slice(1);
    }

    getSingularName() {
        // Simple singularization
        if (this.tableName.endsWith('s')) {
            return this.tableName.slice(0, -1);
        }
        return this.tableName;
    }

    async refresh() {
        await this.loadData();
    }


    // Cleanup method to remove event listeners
    destroy() {
        if (this.tbodyClickHandler) {
            const tbody = document.querySelector(`#${this.containerId} .table-crud-tbody`);
            if (tbody) {
                tbody.removeEventListener('click', this.tbodyClickHandler);
            }
            this.tbodyClickHandler = null;
        }
        
        if (this.documentClickHandler && this.documentClickHandlerAdded) {
            document.removeEventListener('click', this.documentClickHandler);
            this.documentClickHandler = null;
            this.documentClickHandlerAdded = false;
        }
    }

}