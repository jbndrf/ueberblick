/**
 * Roles Management Page
 * Clean interface for managing roles with participant and workflow tracking
 */

import { supabaseClient } from '../core/supabase.js';
import { TableCRUD } from '../components/table-crud.js';
import Utils from '../core/utils.js';
import DebugLogger from '../core/debug-logger.js';
import { i18n, i18nDOM } from '../core/i18n.js';

const logger = new DebugLogger('RolesPage');

let projectId;
let rolesTable;
let participantsData = [];

export default async function RolesPage(route, context = {}) {
    projectId = context.projectId;
    
    if (projectId && supabaseClient.getCurrentProjectId() !== projectId) {
        supabaseClient.setCurrentProject(projectId);
    }
    
    const data = await loadPageData();
    
    setTimeout(initializeRolesTable, 50);
    
    return `
        <div class="roles-page">
            

            
            <!-- Roles Table -->
            <div id="roles-table-container" class="table-container"></div>

        </div>

        <style>
            .roles-page {
                max-width: 1200px;
                margin: 0 auto;
                padding: var(--spacing-lg);
            }

            .page-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: var(--spacing-xl);
                gap: var(--spacing-lg);
            }

            .header-left {
                flex: 1;
            }

            .back-link {
                display: inline-block;
                color: var(--color-text-secondary);
                text-decoration: none;
                margin-bottom: var(--spacing-sm);
                font-size: var(--font-size-sm);
            }

            .back-link:hover {
                color: var(--color-primary);
            }

            .page-title {
                font-size: 2rem;
                font-weight: var(--font-weight-bold);
                color: var(--color-text-primary);
                margin: 0 0 var(--spacing-xs) 0;
            }

            .page-subtitle {
                color: var(--color-text-secondary);
                margin: 0;
            }

            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: var(--spacing-md);
                margin-bottom: var(--spacing-xl);
            }

            .stat-card {
                background: white;
                border: 1px solid var(--color-border-light);
                border-radius: var(--border-radius-md);
                padding: var(--spacing-lg);
                text-align: center;
            }

            .stat-number {
                font-size: 2.5rem;
                font-weight: var(--font-weight-bold);
                color: var(--color-primary);
                margin-bottom: var(--spacing-xs);
            }

            .stat-label {
                color: var(--color-text-secondary);
                font-size: var(--font-size-sm);
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .participant-badge {
                display: inline-flex;
                align-items: center;
                padding: var(--spacing-xs) var(--spacing-sm);
                font-size: var(--font-size-xs);
                font-weight: var(--font-weight-medium);
                border-radius: var(--border-radius-full);
                background-color: var(--color-info);
                color: var(--color-text-inverse);
                margin-right: var(--spacing-xs);
                margin-bottom: var(--spacing-xs);
            }

            .no-participants {
                color: var(--color-text-tertiary);
                font-style: italic;
                font-size: var(--font-size-sm);
            }

            .participants-summary {
                display: flex;
                align-items: center;
                gap: var(--spacing-sm);
            }

            .participant-count {
                font-weight: var(--font-weight-medium);
                color: var(--color-text-primary);
            }

            .btn-sm {
                padding: 0.25rem 0.5rem;
                font-size: 0.75rem;
            }

            .btn-outline {
                background: transparent;
                border: 1px solid var(--color-primary);
                color: var(--color-primary);
            }

            .btn-outline:hover {
                background: var(--color-primary);
                color: white;
            }

            .participants-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                display: none;
                z-index: 1000;
                align-items: center;
                justify-content: center;
            }

            .participants-modal-content {
                background: white;
                border-radius: 8px;
                padding: 1.5rem;
                max-width: 600px;
                width: 90%;
                max-height: 70vh;
                overflow-y: auto;
            }

            .participants-modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 1rem;
                border-bottom: 1px solid var(--color-border-light);
                padding-bottom: 1rem;
            }

            .participants-modal-title {
                margin: 0;
                font-size: 1.25rem;
                color: var(--color-text-primary);
            }

            .participants-modal-close {
                background: none;
                border: none;
                font-size: 1.5rem;
                cursor: pointer;
                color: var(--color-text-secondary);
                padding: 0.25rem;
                border-radius: 4px;
            }

            .participants-modal-close:hover {
                background: var(--color-bg-secondary);
            }

            .participant-item {
                display: flex;
                align-items: center;
                gap: var(--spacing-md);
                padding: var(--spacing-md);
                border: 1px solid var(--color-border-light);
                border-radius: var(--border-radius-sm);
                margin-bottom: var(--spacing-sm);
                background: var(--color-bg-primary);
            }

            .participant-item:last-child {
                margin-bottom: 0;
            }

            .participant-info {
                flex: 1;
            }

            .participant-name {
                font-weight: var(--font-weight-medium);
                color: var(--color-text-primary);
                margin-bottom: 0.25rem;
            }

            .participant-email {
                color: var(--color-text-secondary);
                font-size: var(--font-size-sm);
            }

            .participant-status {
                display: flex;
                align-items: center;
                gap: var(--spacing-xs);
            }

            .status-indicator {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: var(--color-success);
            }

            .status-indicator.inactive {
                background: var(--color-text-tertiary);
            }

            .empty-participants {
                text-align: center;
                padding: var(--spacing-xl);
                color: var(--color-text-tertiary);
            }

            @media (max-width: 768px) {
                .roles-page {
                    padding: var(--spacing-md);
                }

                .page-header {
                    flex-direction: column;
                    align-items: flex-start;
                }

                .stats-grid {
                    grid-template-columns: repeat(2, 1fr);
                }
            }
        </style>
    `;
}

async function loadPageData() {
    const data = {
        roles: [],
        participants: [],
        workflows: [],
        assignedParticipants: 0
    };

    try {
        if (projectId) {
            data.roles = await supabaseClient.getProjectScopedData('roles', projectId);
            data.participants = await supabaseClient.getProjectScopedData('participants', projectId);
            data.workflows = await supabaseClient.getProjectScopedData('workflows', projectId) || [];
        } else {
            data.roles = await supabaseClient.read('roles');
            data.participants = await supabaseClient.read('participants');
            data.workflows = await supabaseClient.read('workflows') || [];
        }

        // Count assigned participants
        data.assignedParticipants = data.participants.filter(p => p.role_id).length;

    } catch (error) {
        logger.error('Failed to load page data:', error);
    }

    return data;
}

function initializeRolesTable() {
    const columns = [
        { key: 'name', label: i18n.t('roles.role_name'), type: 'text', required: true, placeholder: 'e.g., Field Surveyor, Team Lead' },
        { key: 'description', label: i18n.t('forms.description'), type: 'textarea', placeholder: 'Brief description of this role' },
        {
            key: 'participants',
            label: i18n.t('participants.title'),
            readonly: true,
            render: (value, item) => {
                // Access participants data from the global variable
                if (!participantsData || participantsData.length === 0) {
                    return `<span class="no-participants">${i18n.t('tables.no_items')}</span>`;
                }
                
                // role_id is an array, so check if the current role ID is in the array
                const roleParticipants = participantsData.filter(p => {
                    return p.role_id && Array.isArray(p.role_id) && p.role_id.includes(item.id);
                });
                
                if (roleParticipants.length === 0) {
                    return `<span class="no-participants">${i18n.t('participants.no_role')}</span>`;
                }
                
                // Show count and button to open modal
                return `
                    <div class="participants-summary">
                        <span class="participant-count">${i18n.tp('participants.participants_selected', roleParticipants.length)}</span>
                        <button class="btn btn-sm btn-outline view-participants-btn" data-role-id="${item.id}" data-role-name="${Utils.String.escapeHtml(item.name)}">
                            ${i18n.t('actions.edit')}
                        </button>
                    </div>
                `;
            }
        },
        {
            key: 'created_at',
            label: i18n.t('forms.created_at'),
            readonly: true,
            render: (value) => Utils.DateUtils.relative(value)
        }
    ];

    rolesTable = new TableCRUD({
        tableName: 'roles',
        columns: columns,
        editMode: 'modal',
        onAdd: handleAddRole,
        onEdit: handleEditRole,
        onDelete: handleDeleteRole,
        onUpdate: () => rolesTable.refresh(),
        customLoadData: async () => {
            const data = await loadPageData();
            // Store participants data globally for render functions to access
            participantsData = data.participants;
            
            return data.roles;
        }
    });

    rolesTable.render('roles-table-container');
    
    // Translate page elements
    setTimeout(() => i18nDOM.translateDataAttributes(), 50);
    
    // Add event listeners for the view participants buttons
    setTimeout(() => {
        setupParticipantModalHandlers();
    }, 100);
}

function setupParticipantModalHandlers() {
    // Event delegation for view participants buttons
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('view-participants-btn')) {
            const roleId = e.target.getAttribute('data-role-id');
            const roleName = e.target.getAttribute('data-role-name');
            showParticipantsModal(roleId, roleName);
        }
    });
}

function showParticipantsModal(roleId, roleName) {
    // Filter participants for this role
    const roleParticipants = participantsData.filter(p => {
        return p.role_id && Array.isArray(p.role_id) && p.role_id.includes(roleId);
    });
    
    // Create modal HTML
    const modalId = 'participants-modal';
    const existingModal = document.getElementById(modalId);
    if (existingModal) {
        existingModal.remove();
    }
    
    const modalHTML = `
        <div id="${modalId}" class="participants-modal" style="display: flex;">
            <div class="participants-modal-content">
                <div class="participants-modal-header">
                    <h3 class="participants-modal-title">${i18n.t('participants.title')} with Role: ${Utils.String.escapeHtml(roleName)}</h3>
                    <button class="participants-modal-close">&times;</button>
                </div>
                <div class="participants-modal-body">
                    ${roleParticipants.length === 0 ? 
                        `<div class="empty-participants">${i18n.t('participants.no_role')}</div>` :
                        roleParticipants.map(participant => `
                            <div class="participant-item">
                                <div class="participant-info">
                                    <div class="participant-name">${Utils.String.escapeHtml(participant.name || 'Unnamed Participant')}</div>
                                    <div class="participant-email">${Utils.String.escapeHtml(participant.email || 'No email provided')}</div>
                                    ${participant.phone ? `<div class="participant-email">Phone: ${Utils.String.escapeHtml(participant.phone)}</div>` : ''}
                                </div>
                                <div class="participant-status">
                                    <span class="status-indicator ${participant.is_active !== false ? '' : 'inactive'}"></span>
                                    <span class="status-text">${participant.is_active !== false ? i18n.t('participants.active') : i18n.t('participants.inactive')}</span>
                                </div>
                            </div>
                        `).join('')
                    }
                </div>
            </div>
        </div>
    `;
    
    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add event listeners
    const modal = document.getElementById(modalId);
    const closeBtn = modal.querySelector('.participants-modal-close');
    
    closeBtn.addEventListener('click', () => {
        modal.remove();
    });
    
    // Close on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    // Close on escape key
    const escapeHandler = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);
}

async function handleAddRole(data) {
    const selectedProjectId = projectId || supabaseClient.getCurrentProjectId();
    
    logger.log('RolesPage: Using projectId for create operation:', selectedProjectId);
    
    if (!selectedProjectId) {
        throw new Error('Project context is required');
    }
    
    const roleData = {
        name: data.name.trim(),
        description: data.description ? data.description.trim() : null
    };
    
    await supabaseClient.createWithProjectContext('roles', selectedProjectId, roleData);
    logger.log('RolesPage: Create operation completed successfully');
}

async function handleEditRole(id, data) {
    const selectedProjectId = projectId || supabaseClient.getCurrentProjectId();
    
    logger.log('RolesPage: Using projectId for update operation:', selectedProjectId);
    
    const roleData = {
        name: data.name.trim(),
        description: data.description ? data.description.trim() : null
    };
    
    if (selectedProjectId) {
        await supabaseClient.updateWithProjectContext('roles', selectedProjectId, id, roleData);
    } else {
        await supabaseClient.update('roles', id, roleData);
    }
    
    logger.log('RolesPage: Update operation completed successfully');
}

async function handleDeleteRole(id, role) {
    const selectedProjectId = role.project_id || projectId || supabaseClient.getCurrentProjectId();
    
    logger.log('RolesPage: Deleting role with projectId:', selectedProjectId);
    
    // Check if role has assigned participants (role_id is an array)
    const assignedParticipants = participantsData.filter(p => {
        return p.role_id && Array.isArray(p.role_id) && p.role_id.includes(id);
    });
    
    let confirmMessage = i18n.t('messages.confirm_delete') + ` "${role.name}"?`;
    if (assignedParticipants.length > 0) {
        confirmMessage += `\n\nThis will unassign ${assignedParticipants.length} participant${assignedParticipants.length !== 1 ? 's' : ''} from this role.`;
    }
    
    if (!confirm(confirmMessage)) {
        return; // User cancelled
    }
    
    try {
        // First, remove this role from all assigned participants
        if (assignedParticipants.length > 0) {
            logger.log(`RolesPage: Removing role from ${assignedParticipants.length} participant(s)`);
            
            for (const participant of assignedParticipants) {
                await supabaseClient.removeParticipantRole(participant.id, id);
                logger.log(`RolesPage: Removed role from participant ${participant.name} (${participant.id})`);
            }
        }
        
        // Then delete the role itself
        if (selectedProjectId) {
            await supabaseClient.deleteWithProjectContext('roles', selectedProjectId, id);
        } else {
            await supabaseClient.delete('roles', id);
        }
        
        logger.log('RolesPage: Delete operation completed successfully');
        
    } catch (error) {
        logger.error('RolesPage: Error during role deletion:', error);
        throw error; // Re-throw to be caught by TableCRUD error handling
    }
}