/**
 * Marker Categories Page Component
 * CRUD interface for managing marker categories and their field schemas
 */

import { supabaseClient } from '../core/supabase.js';
import { TableCRUD } from '../components/table-crud.js';
import Utils from '../core/utils.js';
import SimpleMarkerUIDesigner from '../components/SimpleMarkerUIDesigner.js';
import EntitySelector from '../components/entity-selector.js';
import SVGIconDesigner from '../components/svg-icon-designer.js';
import DebugLogger from '../core/debug-logger.js';
import { i18n } from '../core/i18n.js';

const logger = new DebugLogger('MarkerCategoriesPage');

let categoriesTable;
let projectId;
let projects = [];
let availableRoles = [];
let selectedCategoryIds = new Set();
let bulkRoleSelector = null;

export default async function MarkerCategoriesPage(route, context = {}) {
    logger.log('MarkerCategoriesPage: Received context:', {
        routePath: route?.path,
        contextProjectId: context.projectId,
        supabaseCurrentProject: supabaseClient.getCurrentProjectId(),
        fullContext: context
    });

    projectId = context.projectId;

    // Ensure supabase client has the correct project context
    if (projectId && supabaseClient.getCurrentProjectId() !== projectId) {
        logger.log('MarkerCategoriesPage: Setting project context in supabaseClient:', projectId);
        supabaseClient.setCurrentProject(projectId);
    }
    
    const data = await loadMarkerCategoriesData(projectId);
    projects = data.projects;
    
    setTimeout(initializeCategoriesTable, 50);
    
    return `
        <div class="marker-categories-page">
            <div class="page-header">
                <div>
                    <h1 class="page-title">${projectId ? `Marker Categories` : 'All Marker Categories'}</h1>
                    <p class="page-subtitle">${projectId ? `Define marker types and their field schemas for this project` : 'Manage marker categories across all projects'}</p>
                </div>
                <div class="page-actions">
                    <div id="bulk-role-assignment-container" class="card" style="display: none;">
                        <div class="card-body">
                            <div class="bulk-assignment-header">
                                <span id="selected-categories-count" class="badge badge-primary">0 categories selected</span>
                            </div>
                            <div id="bulk-category-role-selector" style="margin-top: var(--spacing-sm);"></div>
                        </div>
                    </div>
                    <button class="btn btn-secondary" id="import-csv-btn">
                        ${i18n.t('actions.import')} CSV
                    </button>
                </div>
            </div>
            <div id="categories-table-container" class="table-container"></div>
            
            <!-- CSV Import Modal -->
            <div id="csv-import-modal" class="modal-overlay" style="display: none;">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title">${i18n.t('actions.import')} CSV Data</h3>
                        <button class="modal-close" onclick="closeCsvModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label">CSV File</label>
                            <input type="file" id="csv-file-input" accept=".csv" class="form-input">
                            <div class="form-help">Upload a CSV file with columns: name, description. First row should contain column headers.</div>
                        </div>
                        <div class="form-group">
                            <label class="form-checkbox">
                                <input type="checkbox" id="replace-data-checkbox">
                                <span>Replace all existing categories (otherwise append)</span>
                            </label>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="closeCsvModal()">Cancel</button>
                        <button class="btn btn-primary" onclick="importCsvData()">Import Data</button>
                    </div>
                </div>
            </div>
        </div>
        
        <style>
            .page-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: var(--spacing-xl);
                gap: var(--spacing-lg);
            }
            
            .page-actions {
                display: flex;
                gap: var(--spacing-sm);
                align-items: flex-start;
                min-width: 300px;
            }
            
            #bulk-role-assignment-container {
                margin-right: var(--spacing-md);
                width: 100%;
                min-width: 250px;
            }
            
            .bulk-assignment-header {
                margin-bottom: var(--spacing-sm);
            }
            
            .category-type {
                display: inline-block;
                padding: var(--spacing-xs) var(--spacing-sm);
                background: var(--color-bg-tertiary);
                border-radius: var(--border-radius-sm);
                font-size: var(--font-size-xs);
                color: var(--color-text-secondary);
            }
            
            .role-badge {
                display: inline-flex;
                align-items: center;
                padding: var(--spacing-xs) var(--spacing-sm);
                font-size: var(--font-size-xs);
                font-weight: var(--font-weight-medium);
                border-radius: var(--border-radius-full);
                background-color: var(--color-info);
                color: var(--color-text-inverse);
                margin-right: var(--spacing-xs);
            }
            
            .no-roles {
                color: var(--color-text-tertiary);
                font-style: italic;
                font-size: var(--font-size-sm);
            }
            
            /* Icon Designer Modal - uses existing modal system */
            .icon-designer-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: var(--z-modal-backdrop);
                display: flex;
                align-items: center;
                justify-content: center;
                padding: var(--spacing-md);
            }
            
            .icon-designer-container {
                background: var(--color-bg-primary);
                border-radius: var(--border-radius-lg);
                max-width: 1200px;
                width: 100%;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: var(--shadow-xl);
            }
        </style>
        
        <link rel="stylesheet" href="assets/css/svg-icon-designer.css">
    `;
}

async function loadMarkerCategoriesData(projectId = null) {
    const data = { categories: [], projects: [], currentProject: null, roles: [] };
    
    try {
        data.projects = await supabaseClient.getUserProjects();
        
        if (projectId) {
            data.categories = await supabaseClient.getProjectScopedData('marker_categories', projectId);
            data.currentProject = await supabaseClient.getProjectById(projectId);
            data.roles = await supabaseClient.getRoles(projectId);
            data.categories = data.categories.map(c => ({ 
                ...c, 
                project_name: data.currentProject.name 
            }));
        } else {
            if (data.projects.length > 0) {
                const allCategories = await Promise.all(
                    data.projects.map(async project => {
                        const categories = await supabaseClient.getProjectScopedData('marker_categories', project.id);
                        return categories.map(c => ({ ...c, project_name: project.name }));
                    })
                );
                data.categories = allCategories.flat();
                
                // Get all roles from all projects for display
                const allRoles = await Promise.all(
                    data.projects.map(project => supabaseClient.getRoles(project.id))
                );
                data.roles = allRoles.flat();
            }
        }
    } catch (error) {
        logger.error('Failed to load marker categories:', error);
    }
    
    return data;
}

function initializeCategoriesTable() {
    const columns = [
        {
            key: 'select',
            label: `<input type="checkbox" id="select-all-categories" title="Select All">`,
            readonly: true,
            render: (value, item) => `<input type="checkbox" class="category-checkbox" data-category-id="${item.id}">`
        },
        { 
            key: 'icon_preview', 
            label: 'Icon', 
            readonly: true,
            render: (value, item) => {
                if (item.icon_config && item.icon_config.svgContent) {
                    const style = item.icon_config.style || {};
                    const size = Math.min(style.size || 24, 24); // Max 24px for table
                    return `
                        <div style="width: ${size}px; height: ${size}px; display: inline-flex; align-items: center; justify-content: center;">
                            ${item.icon_config.svgContent.replace(/(<svg[^>]*)(>)/, `$1 style="width: ${size*0.6}px; height: ${size*0.6}px; fill: ${style.color || '#333'};"$2`)}
                        </div>
                    `;
                }
                return '<span style="color: #adb5bd; font-size: 0.8rem;">No icon</span>';
            }
        },
        { key: 'name', label: i18n.t('forms.name'), type: 'text', required: true },
        { key: 'description', label: i18n.t('forms.description'), type: 'text' },
        { 
            key: 'visible_to_roles', 
            label: 'Visible to Roles', 
            readonly: true,
            render: (value, item) => {
                if (!value || !Array.isArray(value) || value.length === 0) {
                    return '<span class="no-roles">All participants</span>';
                }
                // Show actual role names instead of IDs
                return value.map(roleId => {
                    const role = availableRoles.find(r => r.id === roleId);
                    const roleName = role ? role.name : `Role ${roleId.substring(0, 8)}...`;
                    return `<span class="role-badge" data-role-id="${roleId}">${roleName}</span>`;
                }).join(' ');
            }
        },
        { 
            key: 'project_name', 
            label: 'Project', 
            readonly: true,
            render: (value) => value || 'Unknown'
        },
        { 
            key: 'created_at', 
            label: 'Created', 
            readonly: true,
            render: (value) => Utils.DateUtils.relative(value)
        }
    ];

    categoriesTable = new TableCRUD({
        tableName: 'marker_categories',
        columns: columns,
        editMode: 'modal',
        onAdd: handleAddCategory,
        onEdit: handleEditCategory,
        onDelete: handleDeleteCategory,
        onUpdate: () => categoriesTable.refresh(),
        customActions: [
            {
                key: 'manage-roles',
                label: 'Manage Roles',
                color: '#17a2b8',
                handler: handleManageCategoryRoles
            },
            {
                key: 'design-icon',
                label: 'Design Icon',
                color: '#fd7e14',
                handler: handleDesignIcon
            },
            {
                key: 'edit-fields',
                label: i18n.t('marker_categories.edit_fields', {}, 'Edit Fields'),
                color: '#007bff',
                handler: handleEditFields
            }
        ],
        customLoadData: async () => {
            const data = await loadMarkerCategoriesData(projectId);
            availableRoles = data.roles;
            return data.categories;
        }
    });

    categoriesTable.render('categories-table-container');
    
    // Add bulk selection functionality after table is rendered
    setTimeout(() => initializeBulkSelection(), 100);
    
    // Set up CSV import button
    setTimeout(() => {
        const importBtn = Utils.DOM.find('#import-csv-btn');
        if (importBtn) {
            Utils.DOM.on(importBtn, 'click', showCsvModal);
        }
    }, 100);
}

async function handleAddCategory(data) {
    const selectedProjectId = projectId || supabaseClient.getCurrentProjectId();
    
    logger.log('MarkerCategoriesPage: Using projectId for create operation:', selectedProjectId);
    
    if (!selectedProjectId) {
        throw new Error('Project is required');
    }
    
    const categoryData = {
        name: data.name,
        description: data.description || null
    };
    
    await supabaseClient.createMarkerCategory(selectedProjectId, categoryData);
    logger.log('MarkerCategoriesPage: Create operation completed successfully');
}

async function handleEditCategory(id, data) {
    const selectedProjectId = projectId || supabaseClient.getCurrentProjectId();
    
    logger.log('MarkerCategoriesPage: Using projectId for update operation:', selectedProjectId);
    
    const categoryData = {
        name: data.name,
        description: data.description || null
    };
    
    if (selectedProjectId) {
        await supabaseClient.updateWithProjectContext('marker_categories', selectedProjectId, id, categoryData);
    } else {
        await supabaseClient.update('marker_categories', id, categoryData);
    }
    
    logger.log('MarkerCategoriesPage: Update operation completed successfully');
}

async function handleDeleteCategory(id, category) {
    const selectedProjectId = category.project_id || projectId || supabaseClient.getCurrentProjectId();
    
    logger.log('MarkerCategoriesPage: Deleting category with projectId:', selectedProjectId);
    
    // Confirm deletion with user
    if (!confirm(`Are you sure you want to delete the category "${category.name}"? This will permanently delete all field definitions and cannot be undone.`)) {
        return; // User cancelled
    }
    
    if (selectedProjectId) {
        await supabaseClient.deleteWithProjectContext('marker_categories', selectedProjectId, id);
    } else {
        await supabaseClient.delete('marker_categories', id);
    }
    
    logger.log('MarkerCategoriesPage: Delete operation completed successfully');
}

async function handleManageCategoryRoles(categoryId, category) {
    if (!category) return;
    
    // Create a modal for marker category role management
    createCategoryRoleModal(categoryId, category);
}

async function createCategoryRoleModal(categoryId, category) {
    // Create modal HTML
    const modalId = `category-role-modal-${categoryId}`;
    const modalHTML = `
        <div id="${modalId}" class="modal-overlay" style="display: flex; z-index: var(--z-modal-backdrop);">
            <div class="modal" style="max-width: 500px; width: 90%;">
                <div class="modal-header">
                    <h3 class="modal-title">Manage Visibility for "${category.name}"</h3>
                    <button class="modal-close category-modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <p class="form-help" style="margin-bottom: var(--spacing-md);">
                        Control which participant roles can see this marker category. If no roles are selected, all participants will see this category.
                    </p>
                    <div id="category-role-selector-${categoryId}"></div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary category-modal-close">Close</button>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Initialize EntitySelector for category roles
    const currentProjectId = projectId || supabaseClient.getCurrentProjectId();
    const categoryRoleSelector = new EntitySelector(`category-role-selector-${categoryId}`, {
        tableName: 'roles',
        projectId: currentProjectId,
        entityName: 'role',
        entityNamePlural: 'roles',
        allowCreation: true,
        allowSelection: true,
        placeholder: 'Select roles that can see this marker category...',
        label: 'Visible to roles:',
        onSelectionChange: async (selectedRoles) => {
            await handleCategoryRoleUpdate(categoryId, category, selectedRoles);
        }
    });
    
    // Set current roles as selected
    let currentRoles = [];
    if (category.visible_to_roles && Array.isArray(category.visible_to_roles) && category.visible_to_roles.length > 0) {
        // Load role names from database for proper display
        const currentProjectId = projectId || supabaseClient.getCurrentProjectId();
        if (currentProjectId) {
            try {
                const roles = await supabaseClient.getRoles(currentProjectId);
                currentRoles = category.visible_to_roles.map(roleId => {
                    const role = roles.find(r => r.id === roleId);
                    return role || { id: roleId, name: `Role ${roleId.substring(0, 8)}...` };
                });
            } catch (error) {
                logger.error('Failed to load role names:', error);
                currentRoles = category.visible_to_roles.map(roleId => ({
                    id: roleId,
                    name: `Role ${roleId.substring(0, 8)}...`
                }));
            }
        }
    }
    
    if (currentRoles.length > 0) {
        setTimeout(() => {
            const roleEntities = currentRoles.map(role => ({ id: role.id, name: role.name }));
            categoryRoleSelector.setSelectedEntities(roleEntities);
        }, 100);
    }
    
    // Add close event listeners
    const modal = document.getElementById(modalId);
    const closeButtons = modal.querySelectorAll('.category-modal-close');
    closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            modal.remove();
        });
    });
    
    // Close on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

async function handleCategoryRoleUpdate(categoryId, category, selectedRoles) {
    try {
        const selectedProjectId = category.project_id || projectId || supabaseClient.getCurrentProjectId();
        const selectedRoleIds = selectedRoles.map(role => role.id);
        
        // Update the marker category's visible_to_roles field
        const updateData = {
            visible_to_roles: selectedRoleIds
        };
        
        if (selectedProjectId) {
            await supabaseClient.updateWithProjectContext('marker_categories', selectedProjectId, categoryId, updateData);
        } else {
            await supabaseClient.update('marker_categories', categoryId, updateData);
        }
        
        // Refresh table to show updated roles
        if (categoriesTable) {
            await categoriesTable.refresh();
        }
        
        // Show success notification
        if (window.app && window.app.showNotification) {
            const roleNames = selectedRoles.map(role => role.name).join(', ');
            const message = selectedRoles.length > 0 
                ? `Visible to roles: ${roleNames}` 
                : 'Visible to all participants';
            window.app.showNotification('success', 'Visibility Updated', `${category.name} - ${message}`);
        }
        
    } catch (error) {
        logger.error('Failed to update category visibility:', error);
        
        if (window.app && window.app.showNotification) {
            window.app.showNotification('error', 'Update Failed', error.message || 'Failed to update visibility. Please try again.');
        } else {
            alert('Failed to update visibility. Please try again.');
        }
    }
}

function handleDesignIcon(id, category) {
    if (!category) return;
    
    // Create a modal for SVG icon design
    createIconDesignModal(id, category);
}

function createIconDesignModal(categoryId, category) {
    // Create modal HTML
    const modalId = `icon-design-modal-${categoryId}`;
    const modalHTML = `
        <div id="${modalId}" class="icon-designer-modal">
            <div class="icon-designer-container">
                <div id="svg-icon-designer-${categoryId}"></div>
            </div>
        </div>
    `;
    
    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Initialize SVG Icon Designer
    const currentProjectId = projectId || supabaseClient.getCurrentProjectId();
    const svgDesigner = new SVGIconDesigner(`svg-icon-designer-${categoryId}`, {
        categoryId: categoryId,
        projectId: currentProjectId,
        onSave: (iconConfig) => {
            // Close modal and refresh table
            document.getElementById(modalId).remove();
            if (categoriesTable) {
                categoriesTable.refresh();
            }
        },
        onCancel: () => {
            // Close modal
            document.getElementById(modalId).remove();
        }
    });
    
    // Render the designer
    svgDesigner.render();
    
    // Load existing configuration if available
    if (category.icon_config && Object.keys(category.icon_config).length > 0) {
        svgDesigner.loadConfiguration(categoryId);
    }
    
    // Add close event listener for clicking outside
    const modal = document.getElementById(modalId);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

function handleEditFields(id, category) {
    if (projectId) {
        window.location.hash = `project/${projectId}/marker-category-edit/${id}`;
    } else {
        alert('No project context available. Please refresh the page and try again.');
    }
}


// Bulk selection and role assignment functionality
async function initializeBulkSelection() {
    // Load available roles for the current project
    const currentProjectId = projectId || supabaseClient.getCurrentProjectId();
    if (currentProjectId) {
        try {
            if (availableRoles.length === 0) {
                availableRoles = await supabaseClient.getRoles(currentProjectId);
            }
            initializeBulkRoleSelector(currentProjectId);
        } catch (error) {
            logger.error('Failed to load roles:', error);
        }
    }
    
    // Add event listeners for checkboxes
    setupCategoryCheckboxListeners();
}

function initializeBulkRoleSelector(currentProjectId) {
    // Initialize EntitySelector for role selection
    bulkRoleSelector = new EntitySelector('bulk-category-role-selector', {
        tableName: 'roles',
        projectId: currentProjectId,
        entityName: 'role',
        entityNamePlural: 'roles',
        allowCreation: true,
        allowSelection: true,
        placeholder: 'Select roles to assign to selected categories...',
        label: 'Roles to assign:',
        onSelectionChange: (selectedRoles) => {
            if (selectedRoles.length > 0 && selectedCategoryIds.size > 0) {
                handleBulkCategoryRoleAssignment(selectedRoles);
            }
        }
    });
}

function setupCategoryCheckboxListeners() {
    // Select all checkbox
    const selectAllCheckbox = document.getElementById('select-all-categories');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function() {
            const categoryCheckboxes = document.querySelectorAll('.category-checkbox');
            categoryCheckboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
                const categoryId = checkbox.getAttribute('data-category-id');
                if (this.checked) {
                    selectedCategoryIds.add(categoryId);
                } else {
                    selectedCategoryIds.delete(categoryId);
                }
            });
            updateBulkAssignmentButton();
        });
    }
    
    // Individual category checkboxes
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('category-checkbox')) {
            const categoryId = e.target.getAttribute('data-category-id');
            if (e.target.checked) {
                selectedCategoryIds.add(categoryId);
            } else {
                selectedCategoryIds.delete(categoryId);
                // Uncheck select all if any individual checkbox is unchecked
                const selectAllCheckbox = document.getElementById('select-all-categories');
                if (selectAllCheckbox) {
                    selectAllCheckbox.checked = false;
                }
            }
            updateBulkAssignmentButton();
        }
    });
}

function updateBulkAssignmentButton() {
    const bulkContainer = document.getElementById('bulk-role-assignment-container');
    const categoryCount = document.getElementById('selected-categories-count');
    
    if (bulkContainer && categoryCount) {
        if (selectedCategoryIds.size > 0) {
            bulkContainer.style.display = 'block';
            categoryCount.textContent = `${selectedCategoryIds.size} categor${selectedCategoryIds.size !== 1 ? 'ies' : 'y'} selected`;
            
            // Clear any existing role selections when categories change
            if (bulkRoleSelector) {
                bulkRoleSelector.clearSelection();
            }
        } else {
            bulkContainer.style.display = 'none';
        }
    }
}

async function handleBulkCategoryRoleAssignment(selectedRoles) {
    if (!selectedRoles || selectedRoles.length === 0) return;
    
    const selectedRoleIds = selectedRoles.map(role => role.id);
    const selectedRoleNames = selectedRoles.map(role => role.name);
    
    try {
        const categoryIds = Array.from(selectedCategoryIds);
        
        // Update each selected category's visible_to_roles by adding new roles
        for (const categoryId of categoryIds) {
            const selectedProjectId = projectId || supabaseClient.getCurrentProjectId();
            
            // Get current category data to merge with existing roles
            let currentCategory;
            if (selectedProjectId) {
                const { data } = await supabaseClient.client
                    .from('marker_categories')
                    .select('visible_to_roles')
                    .eq('id', categoryId)
                    .eq('project_id', selectedProjectId)
                    .single();
                currentCategory = data;
            } else {
                const { data } = await supabaseClient.client
                    .from('marker_categories')
                    .select('visible_to_roles')
                    .eq('id', categoryId)
                    .single();
                currentCategory = data;
            }
            
            // Merge existing roles with new roles (avoid duplicates)
            const existingRoles = currentCategory?.visible_to_roles || [];
            const mergedRoles = [...new Set([...existingRoles, ...selectedRoleIds])];
            
            const updateData = {
                visible_to_roles: mergedRoles
            };
            
            if (selectedProjectId) {
                await supabaseClient.updateWithProjectContext('marker_categories', selectedProjectId, categoryId, updateData);
            } else {
                await supabaseClient.update('marker_categories', categoryId, updateData);
            }
        }
        
        // Clear role selector immediately after assignment
        if (bulkRoleSelector) {
            bulkRoleSelector.clearSelection();
        }
        
        // Refresh table to show updated roles
        if (categoriesTable) {
            await categoriesTable.refresh();
            // Reinitialize checkboxes after refresh
            setTimeout(() => setupCategoryCheckboxListeners(), 100);
        }
        
        const roleText = selectedRoleNames.length > 1 ? `roles: ${selectedRoleNames.join(', ')}` : `role: ${selectedRoleNames[0]}`;
        
        // Show success notification if available, otherwise use alert
        if (window.app && window.app.showNotification) {
            window.app.showNotification('success', 'Visibility Updated', `Successfully assigned ${roleText} to ${categoryIds.length} categor${categoryIds.length !== 1 ? 'ies' : 'y'}`);
        } else {
            alert(`Successfully assigned ${roleText} to ${categoryIds.length} categor${categoryIds.length !== 1 ? 'ies' : 'y'}`);
        }
        
    } catch (error) {
        logger.error('Failed to assign roles to categories:', error);
        
        if (window.app && window.app.showNotification) {
            window.app.showNotification('error', 'Assignment Failed', error.message || 'Failed to assign roles. Please try again.');
        } else {
            alert('Failed to assign roles. Please try again.');
        }
    }
}

// CSV Import functions
function showCsvModal() {
    const modal = Utils.DOM.find('#csv-import-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
    
    // Make functions globally available
    window.closeCsvModal = closeCsvModal;
    window.importCsvData = importCsvData;
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
    
    if (!Utils.Files.isCSV(file)) {
        alert('Please select a valid CSV file.');
        return;
    }
    
    const selectedProjectId = projectId || supabaseClient.getCurrentProjectId();
    if (!selectedProjectId) {
        alert('Project context is required for importing categories.');
        return;
    }
    
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
        
        // Validate headers
        const requiredHeaders = ['name'];
        const optionalHeaders = ['description'];
        const validHeaders = [...requiredHeaders, ...optionalHeaders];
        
        const invalidHeaders = headers.filter(h => !validHeaders.includes(h));
        if (invalidHeaders.length > 0) {
            alert(`Invalid column headers: ${invalidHeaders.join(', ')}.\nValid columns are: ${validHeaders.join(', ')}`);
            return;
        }
        
        const missingRequired = requiredHeaders.filter(h => !headers.includes(h));
        if (missingRequired.length > 0) {
            alert(`Missing required columns: ${missingRequired.join(', ')}`);
            return;
        }
        
        // Parse data rows
        const categoriesToImport = [];
        for (let i = 0; i < dataRows.length; i++) {
            const values = dataRows[i].split(',').map(v => v.trim().replace(/"/g, ''));
            if (values.length !== headers.length) {
                logger.warn(`Row ${i + 2} has ${values.length} values but expected ${headers.length}. Skipping.`);
                continue;
            }
            
            const categoryData = {};
            headers.forEach((header, index) => {
                categoryData[header] = values[index] || '';
            });
            
            // Ensure required fields
            if (!categoryData.name) {
                logger.warn(`Row ${i + 2} missing required 'name' field. Skipping.`);
                continue;
            }
            
            categoriesToImport.push({
                name: categoryData.name,
                description: categoryData.description || null
            });
        }
        
        if (categoriesToImport.length === 0) {
            alert('No valid data rows to import.');
            return;
        }
        
        // Replace existing data if requested
        if (replaceData) {
            const existingCategories = await supabaseClient.getProjectScopedData('marker_categories', selectedProjectId);
            for (const category of existingCategories) {
                await supabaseClient.deleteWithProjectContext('marker_categories', selectedProjectId, category.id);
            }
        }
        
        // Import new data
        for (const categoryData of categoriesToImport) {
            await supabaseClient.createMarkerCategory(selectedProjectId, categoryData);
        }
        
        closeCsvModal();
        categoriesTable.refresh();
        
        alert(`Successfully imported ${categoriesToImport.length} marker categories.`);
        
    } catch (error) {
        logger.error('CSV import error:', error);
        alert(`Failed to import CSV: ${error.message}`);
    }
}

