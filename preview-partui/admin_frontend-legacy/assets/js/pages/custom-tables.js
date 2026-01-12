/**
 * Custom Tables Page Component
 * Simple CRUD table interface for managing custom tables
 */

import { supabaseClient } from '../core/supabase.js';
import { TableCRUD } from '../components/table-crud.js';
import Utils from '../core/utils.js';
import DebugLogger from '../core/debug-logger.js';
import { i18n, i18nDOM } from '../core/i18n.js';

const logger = new DebugLogger('CustomTablesPage');

let customTablesTable;
let projectId;
let projects = [];

export default async function CustomTablesPage(route, context = {}) {
    // Add logging to debug context reception
    logger.log('CustomTablesPage: Received context:', {
        routePath: route?.path,
        contextProjectId: context.projectId,
        supabaseCurrentProject: supabaseClient.getCurrentProjectId(),
        fullContext: context
    });

    projectId = context.projectId;
    
    // Ensure supabase client has the correct project context
    if (projectId && supabaseClient.getCurrentProjectId() !== projectId) {
        logger.log('CustomTablesPage: Setting project context in supabaseClient:', projectId);
        supabaseClient.setCurrentProject(projectId);
    }
    
    const data = await loadCustomTablesData(projectId);
    projects = data.projects;
    
    setTimeout(initializeCustomTablesTable, 50);
    
    return `
        <div class="custom-tables-page">
            <div class="page-header">
                <div>
                    <h1 class="page-title" data-i18n="custom_tables.title">Custom Tables</h1>
                    <p class="page-subtitle">${projectId ? `Manage custom tables for this project` : 'Manage custom tables across all projects'}</p>
                </div>
            </div>
            <div id="custom-tables-table-container"></div>
        </div>
        
        <style>
            .table-type {
                display: inline-block;
                padding: var(--spacing-xs) var(--spacing-sm);
                background: var(--color-bg-tertiary);
                border-radius: var(--border-radius-sm);
                font-size: var(--font-size-xs);
                color: var(--color-text-secondary);
            }
        </style>
    `;
}

async function loadCustomTablesData(projectId = null) {
    const data = { customTables: [], projects: [], currentProject: null };
    
    try {
        data.projects = await supabaseClient.getUserProjects();
        
        if (projectId) {
            data.customTables = await supabaseClient.getProjectScopedData('custom_tables', projectId);
            data.currentProject = await supabaseClient.getProjectById(projectId);
            data.customTables = data.customTables.map(t => ({ 
                ...t, 
                project_name: data.currentProject.name 
            }));
        } else {
            if (data.projects.length > 0) {
                const allTables = await Promise.all(
                    data.projects.map(async project => {
                        const tables = await supabaseClient.getProjectScopedData('custom_tables', project.id);
                        return tables.map(t => ({ ...t, project_name: project.name }));
                    })
                );
                data.customTables = allTables.flat();
            }
        }
    } catch (error) {
        logger.error('Failed to load custom tables:', error);
    }
    
    return data;
}

function initializeCustomTablesTable() {
    const columns = [
        { key: 'table_name', label: i18n.t('custom_tables.table_name'), type: 'text', required: true },
        { key: 'display_name', label: 'Display Name', type: 'text', required: true },
        { key: 'description', label: i18n.t('forms.description'), type: 'text' },
        { key: 'main_column', label: 'Main Column', type: 'text', required: true },
        { 
            key: 'project_name', 
            label: i18n.t('projects.title'), 
            readonly: true,
            render: (value) => value || 'Unknown'
        },
        { 
            key: 'created_at', 
            label: i18n.t('forms.created_at'), 
            readonly: true,
            render: (value) => Utils.DateUtils.relative(value)
        }
    ];

    customTablesTable = new TableCRUD({
        tableName: 'custom_tables',
        columns: columns,
        editMode: 'modal',
        onAdd: handleAddCustomTable,
        onEdit: handleEditCustomTable,
        onDelete: handleDeleteCustomTable,
        onUpdate: () => customTablesTable.refresh(),
        customActions: [
            {
                key: 'edit-structure',
                label: i18n.t('actions.edit') + ' Structure',
                color: '#007bff',
                handler: handleEditStructure
            }
        ],
        customLoadData: async () => {
            const data = await loadCustomTablesData(projectId);
            return data.customTables;
        }
    });

    customTablesTable.render('custom-tables-table-container');
    
    // Translate page elements
    setTimeout(() => i18nDOM.translateDataAttributes(), 50);
}

async function handleAddCustomTable(data) {
    const selectedProjectId = projectId || supabaseClient.getCurrentProjectId();
    
    logger.log('CustomTablesPage: Using projectId for create operation:', selectedProjectId);
    
    if (!selectedProjectId) {
        throw new Error('Project is required');
    }
    
    // Validate table name format
    if (!/^[a-z][a-z0-9_]*$/.test(data.table_name)) {
        throw new Error('Table name must start with a letter and contain only lowercase letters, numbers, and underscores.');
    }
    
    const tableData = {
        table_name: data.table_name,
        display_name: data.display_name,
        description: data.description || null,
        main_column: data.main_column
    };
    
    await supabaseClient.createCustomTable(selectedProjectId, tableData);
    logger.log('CustomTablesPage: Create operation completed successfully');
}

async function handleEditCustomTable(id, data) {
    const selectedProjectId = projectId || supabaseClient.getCurrentProjectId();
    
    logger.log('CustomTablesPage: Using projectId for update operation:', selectedProjectId);
    
    // Validate table name format
    if (!/^[a-z][a-z0-9_]*$/.test(data.table_name)) {
        throw new Error('Table name must start with a letter and contain only lowercase letters, numbers, and underscores.');
    }
    
    const tableData = {
        table_name: data.table_name,
        display_name: data.display_name,
        description: data.description || null,
        main_column: data.main_column
    };
    
    if (selectedProjectId) {
        await supabaseClient.updateWithProjectContext('custom_tables', selectedProjectId, id, tableData);
    } else {
        await supabaseClient.update('custom_tables', id, tableData);
    }
    
    logger.log('CustomTablesPage: Update operation completed successfully');
}

async function handleDeleteCustomTable(id, table) {
    const selectedProjectId = table.project_id || projectId || supabaseClient.getCurrentProjectId();
    
    logger.log('CustomTablesPage: Deleting table with projectId:', selectedProjectId);
    
    // Confirm deletion with user
    if (!confirm(i18n.t('messages.confirm_delete') + ` "${table.display_name || table.table_name}"? This will permanently delete all data in this table and cannot be undone.`)) {
        return; // User cancelled
    }
    
    if (selectedProjectId) {
        await supabaseClient.deleteWithProjectContext('custom_tables', selectedProjectId, id);
    } else {
        await supabaseClient.delete('custom_tables', id);
    }
    
    logger.log('CustomTablesPage: Delete operation completed successfully');
}

function handleEditStructure(id, table) {
    if (projectId) {
        window.location.hash = `project/${projectId}/tablesedit/${id}`;
    } else {
        alert('No project context available. Please refresh the page and try again.');
    }
}