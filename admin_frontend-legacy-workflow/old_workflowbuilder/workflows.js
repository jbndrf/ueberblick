/**
 * Workflows Page Component
 * CRUD interface for managing workflows (both incident and survey workflows)
 */

import { supabaseClient } from '../core/supabase.js';
import { TableCRUD } from '../components/table-crud.js';
import Utils from '../core/utils.js';
import router from '../core/router.js';

let workflowsTable;
let projectId;

export default async function WorkflowsPage(route, context = {}) {
    // Add logging to debug context reception
    console.log('🏠 WorkflowsPage: Received context:', {
        routePath: route?.path,
        contextProjectId: context.projectId,
        supabaseCurrentProject: supabaseClient.getCurrentProjectId(),
        fullContext: context
    });

    projectId = context.projectId;

    // Ensure supabase client has the correct project context
    if (projectId && supabaseClient.getCurrentProjectId() !== projectId) {
        console.log('🔧 WorkflowsPage: Setting project context in supabaseClient:', projectId);
        supabaseClient.setCurrentProject(projectId);
    }
    
    // Validate project context before initializing table
    if (!projectId) {
        projectId = supabaseClient.getCurrentProjectId();
        
        if (!projectId) {
            console.error('WorkflowsPage: No project context available');
            return `
                <div class="workflows-page">
                    <div class="page-header">
                        <div>
                            <h1 class="page-title">Workflows</h1>
                            <p class="page-subtitle" style="color: #e74c3c;">No project selected. Please navigate to a project first.</p>
                        </div>
                    </div>
                </div>
            `;
        }
    }
    
    setTimeout(() => initializeWorkflowsTable(), 50);
    
    return `
        <div class="workflows-page">
            <div class="page-header">
                <div>
                    <h1 class="page-title">Workflows</h1>
                    <p class="page-subtitle">Manage incident and survey workflows for your project</p>
                </div>
            </div>
            <div id="workflows-table-container"></div>
        </div>
        
        <style>
            .workflow-type-badge {
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 0.8em;
                font-weight: 500;
            }
            .workflow-type-incident {
                background-color: var(--color-error-light, #fee2e2);
                color: var(--color-error-dark, #991b1b);
            }
            .workflow-type-survey {
                background-color: var(--color-primary-light, #dbeafe);
                color: var(--color-primary-dark, #1e40af);
            }
            .workflow-active {
                color: var(--color-success, #059669);
            }
            .workflow-inactive {
                color: var(--color-secondary, #64748b);
            }
        </style>
    `;
}

function initializeWorkflowsTable() {
    const columns = [
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'description', label: 'Description', type: 'text' },
        { 
            key: 'workflow_type', 
            label: 'Type', 
            type: 'select',
            options: [
                { value: 'incident', label: 'Incident Workflow' },
                { value: 'survey', label: 'Survey Workflow' }
            ],
            required: true,
            render: (value) => {
                const badgeClass = value === 'incident' ? 'workflow-type-incident' : 'workflow-type-survey';
                const label = value === 'incident' ? 'Incident' : 'Survey';
                return `<span class="workflow-type-badge ${badgeClass}">${label}</span>`;
            }
        },
        { 
            key: 'is_active', 
            label: 'Active', 
            type: 'boolean',
            render: (value) => `<span class="${value ? 'workflow-active' : 'workflow-inactive'}">${value ? '✓ Active' : '✗ Inactive'}</span>`
        },
        { 
            key: 'created_at', 
            label: 'Created', 
            readonly: true,
            render: (value) => Utils.DateUtils.relative(value)
        }
    ];

    workflowsTable = new TableCRUD({
        tableName: 'workflows',
        columns: columns,
        editMode: 'modal',
        projectScoped: true,
        projectId: projectId,
        onAdd: async (data) => {
            const workflowData = { ...data, project_id: projectId };
            return await supabaseClient.create('workflows', workflowData);
        },
        onEdit: async (id, data) => {
            return await supabaseClient.update('workflows', id, data);
        },
        onDelete: async (id) => {
            return await supabaseClient.delete('workflows', id);
        },
        customActions: [
            {
                key: 'design',
                label: 'Design Workflow',
                handler: (id, item) => {
                    // Navigate to workflow builder
                    router.navigate(`project/${projectId}/workflow-builder/${id}`);
                }
            }
        ],
        customLoadData: async () => {
            try {
                return await supabaseClient.getProjectScopedData('workflows', projectId);
            } catch (error) {
                console.error('Failed to load workflows:', error);
                return [];
            }
        }
    });

    workflowsTable.render('workflows-table-container');
}