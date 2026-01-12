/**
 * Dashboard Page Component
 * Shows project overview, statistics, and quick actions
 */

import { supabaseClient } from '../core/supabase.js';
import { TableCRUD } from '../components/table-crud.js';
import Utils from '../core/utils.js';
import DebugLogger from '../core/debug-logger.js';
import { i18n, i18nDOM } from '../core/i18n.js';

const logger = new DebugLogger('DashboardPage');

let dashboardProjectsTable;

export default async function DashboardPage() {
    const data = await loadDashboardData();
    
    setTimeout(() => {
        initializeDashboard(data);
        // Translate all data-i18n attributes after content is rendered
        i18nDOM.translateDataAttributes();
    }, 50);
    
    return `
        <div class="dashboard-page">
            <div class="page-header">
                <h1 class="page-title" data-i18n="dashboard.welcome_back">Welcome back!</h1>
            </div>

            ${renderConnectionStatus(data.connectionStatus)}

            <div class="card">
                <div class="card-header">
                    <h3 class="card-title" data-i18n="dashboard.projects_title">Projects</h3>
                </div>
                <div class="card-body">
                    <div id="dashboard-projects-table-container"></div>
                    ${data.projects.length > 5 ? `<p style="text-align: center; margin-top: var(--spacing-md);"><a href="#projects" data-i18n="dashboard.projects.view_all_projects" data-i18n-params='{"count": ${data.projects.length}}'>View all ${data.projects.length} projects</a></p>` : ''}
                </div>
            </div>
        </div>
    `;
}

async function loadDashboardData() {
    const data = {
        projects: [],
        connectionStatus: { status: 'unknown' },
        currentUser: null
    };

    try {
        data.currentUser = supabaseClient.getCurrentUser();
        data.connectionStatus = await supabaseClient.healthCheck();
        
        if (data.connectionStatus.status === 'ok') {
            data.projects = await supabaseClient.getUserProjects();
        }
        
    } catch (error) {
        logger.error('Dashboard data loading error:', error);
        data.connectionStatus = { status: 'error', error: error.message };
    }

    return data;
}

function renderConnectionStatus(status) {
    if (status.status === 'ok') {
        return `

        `;
    } else {
        const errorMsg = status.error || i18n.t('dashboard.connection_status.unable_to_connect');
        return `
            <div class="alert alert-error">
                <strong data-i18n="dashboard.connection_status.database_connection_issue">Database Connection Issue</strong> - ${errorMsg}
                <br><small data-i18n="dashboard.connection_status.check_supabase_running">Check that Supabase is running on http://localhost:8000</small>
            </div>
        `;
    }
}

function initializeDashboard(data) {
    if (data.connectionStatus.status === 'ok' && data.projects.length > 0) {
        const columns = [
            { key: 'name', label: i18n.t('dashboard.projects.name'), readonly: true },
            { key: 'description', label: i18n.t('dashboard.projects.description'), readonly: true },
            { 
                key: 'created_at', 
                label: i18n.t('dashboard.projects.created'), 
                readonly: true,
                render: (value) => Utils.DateUtils.relative(value)
            }
        ];

        const customActions = [
            {
                key: 'manage',
                label: i18n.t('dashboard.projects.manage'),
                color: '#6c757d',
                handler: (id, project) => {
                    window.location.hash = 'projects';
                }
            }
        ];

        dashboardProjectsTable = new TableCRUD({
            tableName: 'projects',
            columns: columns,
            readonly: true,
            customActions: customActions,
            customLoadData: async () => {
                // Return only first 5 projects for dashboard
                return data.projects.slice(0, 5);
            }
        });

        dashboardProjectsTable.render('dashboard-projects-table-container');
    } else if (data.projects.length === 0) {
        // Show empty state
        document.getElementById('dashboard-projects-table-container').innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #6c757d;">
                <p>
                    <span data-i18n="dashboard.projects.no_projects_found">No projects found.</span> 
                    <a href="#projects" data-i18n="dashboard.projects.create_first_project">Create your first project</a> 
                    <span data-i18n="dashboard.projects.to_get_started">to get started.</span>
                </p>
            </div>
        `;
        // Translate the newly added content
        setTimeout(() => i18nDOM.translateDataAttributes(), 10);
    }
}