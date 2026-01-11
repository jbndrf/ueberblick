/**
 * UI Designer Page
 * Visual interface for configuring bottom sheet layouts in the participants app
 */

import { supabaseClient } from '../core/supabase.js';
import app from '../core/app.js';
import Utils from '../core/utils.js';
import DebugLogger from '../core/debug-logger.js';
import { i18n, i18nDOM } from '../core/i18n.js';

const logger = new DebugLogger('UIDesignerPage');

export default async function UIDesigner(route, context) {
    const projectId = context?.projectId || supabaseClient.getCurrentProjectId();
    
    if (!projectId) {
        setTimeout(() => i18nDOM.translateDataAttributes(), 50);
        return `
            <div class="ui-designer-page">
                <div class="empty-state">
                    <h2 data-i18n="ui_designer.no_project">No Project Selected</h2>
                    <p data-i18n="ui_designer.select_project">Please select a project to configure UI settings.</p>
                    <a href="#projects" class="btn btn-primary" data-i18n="ui_designer.view_projects">View Projects</a>
                </div>
            </div>
        `;
    }

    try {
        // Load project data and configurations
        const [project, roles, existingConfigs] = await Promise.all([
            supabaseClient.getById('projects', projectId),
            supabaseClient.getAll('roles', { filters: { project_id: projectId } }),
            supabaseClient.getAll('ui_configurations', { filters: { project_id: projectId } })
        ]);

        return `
            <div class="ui-designer-page">
                <div class="page-header">
                    <div class="page-title">
                        <h1>UI Designer</h1>
                        <p class="page-description">Configure bottom sheet layouts and mobile interface elements for participants</p>
                    </div>
                    <div class="page-actions">
                        <button class="btn btn-primary" id="createNewConfig">
                            <span>New Configuration</span>
                        </button>
                    </div>
                </div>

                <div class="ui-designer-content">
                    <!-- Configuration List -->
                    <div class="config-list-section">
                        <div class="section-header">
                            <h3>Existing Configurations</h3>
                            <p>Manage UI configurations for different contexts and roles</p>
                        </div>
                        
                        <div class="config-cards-grid" id="configGrid">
                            ${renderConfigurationCards(existingConfigs, roles)}
                        </div>
                        
                        ${existingConfigs.length === 0 ? `
                            <div class="empty-state">
                                <div class="empty-state-icon">Design</div>
                                <h3>No UI Configurations Yet</h3>
                                <p>Create your first UI configuration to customize the participant experience.</p>
                                <button class="btn btn-primary" id="createFirstConfig">
                                    Create First Configuration
                                </button>
                            </div>
                        ` : ''}
                    </div>

                    <!-- Context Types Reference -->
                    <div class="context-reference-section">
                        <div class="section-header">
                            <h3>Available Context Types</h3>
                            <p>Different UI contexts you can customize</p>
                        </div>
                        
                        <div class="context-types-grid">
                            ${renderContextTypes()}
                        </div>
                    </div>
                </div>

                <!-- UI Designer Modal -->
                <div id="uiDesignerModal" class="modal" style="display: none;">
                    <div class="modal-content ui-designer-modal">
                        <div class="modal-header">
                            <h2 id="modalTitle">UI Designer</h2>
                            <button class="modal-close" id="closeUIDesigner">&times;</button>
                        </div>
                        <div class="modal-body" id="uiDesignerContent">
                            <!-- UI Designer interface will be loaded here -->
                        </div>
                    </div>
                </div>
            </div>

            <style>
                .ui-designer-page {
                    padding: var(--spacing-lg);
                    max-width: 1400px;
                    margin: 0 auto;
                }

                .page-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: var(--spacing-xl);
                    gap: var(--spacing-lg);
                }

                .page-title h1 {
                    margin: 0 0 var(--spacing-xs) 0;
                    color: var(--color-text-primary);
                }

                .page-description {
                    margin: 0;
                    color: var(--color-text-secondary);
                    font-size: var(--font-size-sm);
                }

                .ui-designer-content {
                    display: grid;
                    gap: var(--spacing-xl);
                }

                .section-header {
                    margin-bottom: var(--spacing-lg);
                }

                .section-header h3 {
                    margin: 0 0 var(--spacing-xs) 0;
                    color: var(--color-text-primary);
                }

                .section-header p {
                    margin: 0;
                    color: var(--color-text-secondary);
                    font-size: var(--font-size-sm);
                }

                .config-cards-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                    gap: var(--spacing-lg);
                }

                .config-card {
                    background: var(--color-surface);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-md);
                    padding: var(--spacing-lg);
                    transition: all 0.2s ease;
                    cursor: pointer;
                }

                .config-card:hover {
                    border-color: var(--color-primary);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }

                .config-card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: var(--spacing-md);
                }

                .config-card-title {
                    font-weight: 600;
                    color: var(--color-text-primary);
                    margin: 0;
                }

                .config-card-meta {
                    font-size: var(--font-size-xs);
                    color: var(--color-text-tertiary);
                }

                .config-card-context {
                    display: inline-block;
                    background: var(--color-primary-light);
                    color: var(--color-primary);
                    padding: 2px 8px;
                    border-radius: var(--radius-sm);
                    font-size: var(--font-size-xs);
                    font-weight: 500;
                    margin-bottom: var(--spacing-sm);
                }

                .config-card-description {
                    color: var(--color-text-secondary);
                    font-size: var(--font-size-sm);
                    margin: 0 0 var(--spacing-md) 0;
                    line-height: 1.4;
                }

                .config-card-actions {
                    display: flex;
                    gap: var(--spacing-sm);
                }

                .context-types-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                    gap: var(--spacing-md);
                }

                .context-type-card {
                    background: var(--color-surface);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-md);
                    padding: var(--spacing-md);
                }

                .context-type-header {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    margin-bottom: var(--spacing-sm);
                }

                .context-type-icon {
                    font-size: 1.5rem;
                }

                .context-type-name {
                    font-weight: 600;
                    color: var(--color-text-primary);
                    margin: 0;
                }

                .context-type-description {
                    color: var(--color-text-secondary);
                    font-size: var(--font-size-sm);
                    margin: 0;
                    line-height: 1.4;
                }

                .empty-state {
                    text-align: center;
                    padding: var(--spacing-xl);
                    background: var(--color-surface);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-md);
                }

                .empty-state-icon {
                    font-size: 3rem;
                    margin-bottom: var(--spacing-md);
                }

                .empty-state h3 {
                    margin: 0 0 var(--spacing-sm) 0;
                    color: var(--color-text-primary);
                }

                .empty-state p {
                    margin: 0 0 var(--spacing-lg) 0;
                    color: var(--color-text-secondary);
                }

                .ui-designer-modal {
                    max-width: 95vw;
                    max-height: 95vh;
                    width: 1200px;
                    height: 800px;
                }

                .ui-designer-modal .modal-body {
                    padding: 0;
                    height: calc(100% - 60px);
                    overflow: hidden;
                }

                @media (max-width: 768px) {
                    .ui-designer-page {
                        padding: var(--spacing-md);
                    }

                    .page-header {
                        flex-direction: column;
                        align-items: stretch;
                    }

                    .config-cards-grid {
                        grid-template-columns: 1fr;
                    }

                    .context-types-grid {
                        grid-template-columns: 1fr;
                    }

                    .ui-designer-modal {
                        width: 95vw;
                        height: 95vh;
                        max-width: none;
                        max-height: none;
                    }
                }
            </style>

            <script type="module">
                import UIDesignerManager from '../components/ui-designer.js';
                
                // Initialize UI Designer Manager
                window.uiDesigner = new UIDesignerManager('${projectId}', ${JSON.stringify(roles)});
                
                // Set up event listeners
                const createNewBtn = document.getElementById('createNewConfig');
                const createFirstBtn = document.getElementById('createFirstConfig');
                
                createNewBtn?.addEventListener('click', () => {
                    window.uiDesigner.createNewConfiguration();
                });
                
                createFirstBtn?.addEventListener('click', () => {
                    window.uiDesigner.createNewConfiguration();
                });

                document.getElementById('closeUIDesigner')?.addEventListener('click', () => {
                    window.uiDesigner.closeModal();
                });

                // Set up config card click handlers
                document.querySelectorAll('.config-card').forEach(card => {
                    card.addEventListener('click', (e) => {
                        if (e.target.closest('.config-card-actions')) return;
                        
                        const configId = card.dataset.configId;
                        window.uiDesigner.editConfiguration(configId);
                    });
                });

                // Set up individual action handlers
                document.querySelectorAll('[data-action="edit-config"]').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const configId = btn.dataset.configId;
                        window.uiDesigner.editConfiguration(configId);
                    });
                });

                document.querySelectorAll('[data-action="duplicate-config"]').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const configId = btn.dataset.configId;
                        window.uiDesigner.duplicateConfiguration(configId);
                    });
                });

                document.querySelectorAll('[data-action="delete-config"]').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const configId = btn.dataset.configId;
                        if (confirm('Are you sure you want to delete this configuration?')) {
                            window.uiDesigner.deleteConfiguration(configId);
                        }
                    });
                });
            </script>
        `;

    } catch (error) {
        logger.error('Error loading UI Designer page:', error);
        return `
            <div class="ui-designer-page">
                <div class="error-state">
                    <h2>Error Loading UI Designer</h2>
                    <p>Failed to load UI Designer: ${error.message}</p>
                    <button class="btn btn-primary" onclick="window.location.reload()">Retry</button>
                </div>
            </div>
        `;
    }
}

function renderConfigurationCards(configs, roles) {
    if (configs.length === 0) return '';
    
    return configs.map(config => {
        const roleName = roles.find(r => r.id === config.role_id)?.name || 'All Roles';
        const contextDisplayName = getContextDisplayName(config.context_type);
        const lastUpdated = new Date(config.updated_at).toLocaleDateString();
        
        return `
            <div class="config-card" data-config-id="${config.id}">
                <div class="config-card-header">
                    <div>
                        <div class="config-card-context">${contextDisplayName}</div>
                        <h4 class="config-card-title">${roleName}</h4>
                    </div>
                    <div class="config-card-meta">
                        Updated ${lastUpdated}
                    </div>
                </div>
                
                <p class="config-card-description">
                    ${getContextDescription(config.context_type)} configured for ${roleName}.
                </p>
                
                <div class="config-card-actions">
                    <button class="btn btn-sm btn-secondary" data-action="edit-config" data-config-id="${config.id}">
                        Edit
                    </button>
                    <button class="btn btn-sm btn-secondary" data-action="duplicate-config" data-config-id="${config.id}">
                        Duplicate
                    </button>
                    <button class="btn btn-sm btn-danger" data-action="delete-config" data-config-id="${config.id}">
                        Delete
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderContextTypes() {
    const contextTypes = [
        {
            type: 'form_peek_view',
            icon: 'View',
            name: 'Form Peek View',
            description: 'Bottom sheet peek view for workflow forms - shows minimal form preview'
        },
        {
            type: 'form_full_view',
            icon: 'Form',
            name: 'Form Full View',
            description: 'Bottom sheet expanded view for workflow forms - shows complete form interface'
        },
        {
            type: 'marker_detail_peek_view',
            icon: 'Pin',
            name: 'Marker Peek View',
            description: 'Bottom sheet peek view for marker details - shows basic marker information'
        },
        {
            type: 'marker_detail_full_view',
            icon: 'Map',
            name: 'Marker Full View',
            description: 'Bottom sheet expanded view for marker details - shows complete marker data'
        },
        {
            type: 'workflow_action_layout',
            icon: 'Action',
            name: 'Action Layout',
            description: 'Layout configuration for workflow action buttons and controls'
        },
        {
            type: 'map_interface_layout',
            icon: 'Interface',
            name: 'Map Interface',
            description: 'Map control positioning and mobile interface layout configuration'
        }
    ];

    return contextTypes.map(context => `
        <div class="context-type-card">
            <div class="context-type-header">
                <span class="context-type-icon">${context.icon}</span>
                <h4 class="context-type-name">${context.name}</h4>
            </div>
            <p class="context-type-description">${context.description}</p>
        </div>
    `).join('');
}

function getContextDisplayName(contextType) {
    const displayNames = {
        'form_peek_view': 'Form Peek',
        'form_full_view': 'Form Full',
        'marker_detail_peek_view': 'Marker Peek',
        'marker_detail_full_view': 'Marker Full',
        'workflow_action_layout': 'Action Layout',
        'map_interface_layout': 'Map Interface'
    };
    return displayNames[contextType] || contextType;
}

function getContextDescription(contextType) {
    const descriptions = {
        'form_peek_view': 'Bottom sheet peek view for workflow forms',
        'form_full_view': 'Bottom sheet expanded view for workflow forms',
        'marker_detail_peek_view': 'Bottom sheet peek view for marker details',
        'marker_detail_full_view': 'Bottom sheet expanded view for marker details',
        'workflow_action_layout': 'Layout configuration for workflow action buttons',
        'map_interface_layout': 'Map control positioning and interface layout'
    };
    return descriptions[contextType] || 'UI configuration';
}