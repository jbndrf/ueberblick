/**
 * Projects Page Component
 * Main project management with simple CRUD table interface
 */

import { supabaseClient } from '../core/supabase.js';
import { TableCRUD } from '../components/table-crud.js';
import Utils from '../core/utils.js';
import DebugLogger from '../core/debug-logger.js';
import { i18n, i18nDOM } from '../core/i18n.js';

const logger = new DebugLogger('ProjectsPage');

let projectsTable;

export default async function ProjectsPage() {
    setTimeout(initializeProjectsTable, 50);
    setTimeout(setupProjectsActions, 100);
    
    return `
        <div class="projects-page">
            <div class="page-header">
                <h1 class="page-title" data-i18n="projects.title">Projects</h1>
                <input type="file" id="import-file-input" accept=".json" style="display: none;">
            </div>
            <div id="projects-table-container"></div>
        </div>

        <style>
        .page-header {
            margin-bottom: 2rem;
        }

        /* TableCRUD add button dropdown customization */
        .table-crud-add-btn {
            position: relative;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            z-index: 10001;
        }

        .table-crud-add-btn::after {
            content: '▼';
            font-size: 0.75rem;
            opacity: 0.7;
        }

        .add-dropdown-menu {
            position: absolute;
            top: 100%;
            right: 0;
            background: white;
            border: 1px solid #dee2e6;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            min-width: 180px;
            z-index: 10002;
            opacity: 0;
            visibility: hidden;
            transform: translateY(-10px);
            transition: all 0.2s ease;
            margin-top: 4px;
        }

        .add-dropdown-menu.show {
            opacity: 1;
            visibility: visible;
            transform: translateY(0);
        }

        .dropdown-item {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            width: 100%;
            padding: 0.75rem 1rem;
            border: none;
            background: none;
            text-align: left;
            cursor: pointer;
            transition: background-color 0.2s ease;
            font-size: 0.875rem;
        }

        .dropdown-item:first-child {
            border-radius: 8px 8px 0 0;
        }

        .dropdown-item:last-child {
            border-radius: 0 0 8px 8px;
        }

        .dropdown-item:hover {
            background-color: #f8f9fa;
        }

        .dropdown-item svg {
            flex-shrink: 0;
        }

        .dropdown-item.loading {
            position: relative;
            color: transparent;
        }

        .dropdown-item.loading::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 1rem;
            height: 1rem;
            margin: -0.5rem 0 0 -0.5rem;
            border: 2px solid transparent;
            border-top: 2px solid currentColor;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            color: #666;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }


        </style>
    `;
}

function initializeProjectsTable() {
    const columns = [
        { key: 'name', label: i18n.t('projects.project_name'), type: 'text', required: true },
        { key: 'description', label: i18n.t('forms.description'), type: 'text' },
        { 
            key: 'created_at', 
            label: i18n.t('projects.created'), 
            readonly: true,
            render: (value) => Utils.DateUtils.relative(value)
        }
    ];

    projectsTable = new TableCRUD({
        tableName: 'projects',
        columns: columns,
        editMode: 'modal',
        onAdd: handleAddProject,
        onEdit: handleEditProject,
        onDelete: handleDeleteProject,
        onUpdate: () => projectsTable.refresh(),
        customLoadData: async () => {
            try {
                return await supabaseClient.getUserProjects();
            } catch (error) {
                logger.error('Failed to load projects:', error);
                return [];
            }
        }
    });

    projectsTable.render('projects-table-container');
    
    // Translate page elements
    setTimeout(() => i18nDOM.translateDataAttributes(), 50);
}

async function handleAddProject(data) {
    const currentUser = supabaseClient.getCurrentUser();
    if (!currentUser) {
        throw new Error('User not authenticated');
    }
    
    const projectData = {
        name: data.name,
        description: data.description || null,
        owner_id: currentUser.id,
        is_active: true
    };
    
    await supabaseClient.createProject(projectData);
    logger.log('ProjectsPage: Create operation completed successfully');
}

async function handleEditProject(id, data) {
    const projectData = {
        name: data.name,
        description: data.description || null
    };
    
    await supabaseClient.update('projects', id, projectData);
    logger.log('ProjectsPage: Update operation completed successfully');
}

async function handleDeleteProject(id, project) {
    // Confirm deletion with user
    if (!confirm(i18n.t('messages.confirm_delete') + ` "${project.name}"? This action cannot be undone.`)) {
        return; // User cancelled
    }
    
    try {
        // Check for existing data that would prevent deletion
        const dependencies = await checkProjectDependencies(id);
        
        if (dependencies.length > 0) {
            const dependencyList = dependencies.map(dep => `• ${dep.count} ${dep.type}`).join('\n');
            const message = `Cannot delete project "${project.name}" because it contains:\n\n${dependencyList}\n\nPlease remove all project data before deleting the project.`;
            alert(message);
            return;
        }
        
        // If no dependencies, proceed with deletion
        await supabaseClient.delete('projects', id);
        logger.log('ProjectsPage: Delete operation completed successfully');
        
    } catch (error) {
        logger.error('ProjectsPage: Delete operation failed:', error);
        
        // Check if it's a foreign key constraint error
        if (error.code === '23503' || error.message.includes('foreign key')) {
            alert(`Cannot delete project "${project.name}" because it contains data. Please remove all participants, workflows, markers, and other project data first.`);
        } else {
            alert(`${i18n.t('messages.error')}: ${error.message}`);
        }
    }
}

async function checkProjectDependencies(projectId) {
    const dependencies = [];
    
    try {
        // Check for participants
        const { data: participants } = await supabaseClient.client
            .from('participants')
            .select('id')
            .eq('project_id', projectId);
        if (participants && participants.length > 0) {
            dependencies.push({ type: 'participants', count: participants.length });
        }
        
        // Check for workflows
        const { data: workflows } = await supabaseClient.client
            .from('workflows')
            .select('id')
            .eq('project_id', projectId);
        if (workflows && workflows.length > 0) {
            dependencies.push({ type: 'workflows', count: workflows.length });
        }
        
        // Check for markers
        const { data: markers } = await supabaseClient.client
            .from('markers')
            .select('id')
            .eq('project_id', projectId);
        if (markers && markers.length > 0) {
            dependencies.push({ type: 'markers', count: markers.length });
        }
        
        // Check for roles
        const { data: roles } = await supabaseClient.client
            .from('roles')
            .select('id')
            .eq('project_id', projectId);
        if (roles && roles.length > 0) {
            dependencies.push({ type: 'roles', count: roles.length });
        }
        
        // Check for forms
        const { data: forms } = await supabaseClient.client
            .from('forms')
            .select('id')
            .eq('project_id', projectId);
        if (forms && forms.length > 0) {
            dependencies.push({ type: 'forms', count: forms.length });
        }
        
    } catch (error) {
        logger.warn('Error checking project dependencies:', error);
    }
    
    return dependencies;
}

function setupProjectsActions() {
    const fileInput = document.getElementById('import-file-input');
    if (!fileInput) return;

    // Wait for TableCRUD to render, then customize the add button
    setTimeout(() => {
        setupTableAddButton();
    }, 200);

    // Handle file selection
    fileInput.addEventListener('change', handleFileImport);
}

function setupTableAddButton() {
    const addBtn = document.querySelector('.table-crud-add-btn');
    if (!addBtn) return;

    // Create dropdown menu
    const dropdownMenu = document.createElement('div');
    dropdownMenu.className = 'add-dropdown-menu';
    dropdownMenu.innerHTML = `
        <button class="dropdown-item" id="create-project-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span data-i18n="projects.add_project">Create Project</span>
        </button>
        <button class="dropdown-item" id="import-project-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7,10 12,15 17,10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span data-i18n="actions.import">Import Project</span>
        </button>
    `;

    // Append dropdown to add button
    addBtn.appendChild(dropdownMenu);

    // Store references for event handling
    const createBtn = dropdownMenu.querySelector('#create-project-btn');
    const importBtn = dropdownMenu.querySelector('#import-project-btn');
    const fileInput = document.getElementById('import-file-input');

    // Remove existing event listeners by cloning the button
    const newAddBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newAddBtn, addBtn);
    
    // Get the cloned dropdown and its elements
    const newDropdownMenu = newAddBtn.querySelector('.add-dropdown-menu');
    const newCreateBtn = newDropdownMenu.querySelector('#create-project-btn');
    const newImportBtn = newDropdownMenu.querySelector('#import-project-btn');
    
    // Add event listener to prevent default TableCRUD behavior and show dropdown
    newAddBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Close other dropdowns first
        document.querySelectorAll('.add-dropdown-menu.show').forEach(menu => {
            if (menu !== newDropdownMenu) {
                menu.classList.remove('show');
            }
        });
        
        newDropdownMenu.classList.toggle('show');
    });

    // Create project button
    newCreateBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        newDropdownMenu.classList.remove('show');
        if (projectsTable) {
            projectsTable.handleAdd();
        }
    });

    // Import project button
    newImportBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        newDropdownMenu.classList.remove('show');
        fileInput.click();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!newAddBtn.contains(e.target)) {
            newDropdownMenu.classList.remove('show');
        }
    });
}


async function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const importBtn = document.getElementById('import-project-btn');
    if (!importBtn) return;

    try {
        // Disable button and show loading state
        importBtn.disabled = true;
        importBtn.classList.add('loading');

        // Read file content
        const fileContent = await readFileAsText(file);
        
        // Parse configuration file
        const configData = supabaseClient.parseProjectConfigFile(fileContent, file.type);
        
        // Import project from configuration
        const result = await supabaseClient.importProjectFromFile(configData);
        
        // Success feedback
        const projectName = result.project.name;
        const itemCount = (result.roles.length + result.categories.length + 
                         result.participants.length + result.markers.length + 
                         result.workflows.length + result.tables.length);
        
        Utils.showNotification(`Project "${projectName}" imported successfully with ${itemCount} items!`, 'success');
        logger.log('Project imported:', result);

        // Refresh the projects table
        if (projectsTable) {
            projectsTable.refresh();
        }

        // Set the new project as current
        if (result.project && result.project.id) {
            supabaseClient.setCurrentProject(result.project.id);
        }

    } catch (error) {
        logger.error('Failed to import project:', error);
        Utils.showNotification(`${i18n.t('messages.error')}: ${error.message}`, 'error');
    } finally {
        // Reset button state
        importBtn.disabled = false;
        importBtn.classList.remove('loading');
        
        // Clear file input
        const fileInput = document.getElementById('import-file-input');
        if (fileInput) {
            fileInput.value = '';
        }
    }
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}