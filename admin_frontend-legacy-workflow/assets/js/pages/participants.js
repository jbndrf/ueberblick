/**
 * Participants Page Component  
 * Simple CRUD table interface for managing participants
 */

import { supabaseClient } from '../core/supabase.js';
import { TableCRUD } from '../components/table-crud.js';
import Utils from '../core/utils.js';
import EntitySelector from '../components/entity-selector.js';
import DebugLogger from '../core/debug-logger.js';
import { i18n, i18nDOM } from '../core/i18n.js';

const logger = new DebugLogger('ParticipantsPage');

let participantsTable;
let projectId;
let projects = [];

export default async function ParticipantsPage(route, context = {}) {
    logger.log('ParticipantsPage: Received context:', {
        routePath: route?.path,
        contextProjectId: context.projectId,
        supabaseCurrentProject: supabaseClient.getCurrentProjectId(),
        fullContext: context
    });
    
    projectId = context.projectId;
    
    logger.log('ParticipantsPage: Using projectId:', projectId);
    
    // Ensure supabase client has the correct project context
    if (projectId && supabaseClient.getCurrentProjectId() !== projectId) {
        logger.log('ParticipantsPage: Setting project context in supabaseClient:', projectId);
        supabaseClient.setCurrentProject(projectId);
    }
    
    const data = await loadParticipantsData(projectId);
    projects = data.projects;
    
    setTimeout(() => initializeParticipantsTable(), 200);
    
    setTimeout(() => i18nDOM.translateDataAttributes(), 100);
    
    return `
        <div class="participants-page">
            <div class="page-header">
                <div>
                    <h1 class="page-title" data-i18n="participants.title">Participants</h1>
                    <p class="page-subtitle">${projectId ? i18n.t('participants.manage_for_project') : i18n.t('participants.manage_all_projects')}</p>
                </div>
                <div class="page-header-actions">
                    <div id="bulk-role-assignment-container" style="display: none;">
                        <div class="bulk-assignment-header">
                            <span id="selected-participants-count">0 participants selected</span>
                        </div>
                        <div id="bulk-role-selector"></div>
                    </div>
                </div>
            </div>
            <div id="participants-table-container"></div>
        </div>
        
        <style>
            .page-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 2rem;
            }
            
            .page-header-actions {
                display: flex;
                gap: 0.5rem;
                min-width: 300px;
            }
            
            #bulk-role-assignment-container {
                background: #f8f9fa;
                border: 1px solid #dee2e6;
                border-radius: 8px;
                padding: 1rem;
                width: 100%;
            }
            
            .bulk-assignment-header {
                font-weight: 600;
                margin-bottom: 0.75rem;
                color: #495057;
                font-size: 0.9rem;
            }
            
            
            .form-group {
                margin-bottom: 1rem;
            }
            
            .form-group label {
                display: block;
                margin-bottom: 0.5rem;
                font-weight: 600;
            }
            
            .form-control {
                width: 100%;
                padding: 0.5rem;
                border: 1px solid #dee2e6;
                border-radius: 4px;
                font-size: 1rem;
            }
            
            .btn {
                padding: 0.5rem 1rem;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 500;
                text-decoration: none;
                display: inline-flex;
                align-items: center;
                gap: 0.25rem;
            }
            
            .btn-primary {
                background: #007bff;
                color: white;
            }
            
            .btn-outline-primary {
                background: transparent;
                color: #007bff;
                border: 1px solid #007bff;
            }
            
            .btn-secondary {
                background: #6c757d;
                color: white;
            }
            
            .btn:hover {
                opacity: 0.9;
            }
            
            .btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            .participant-checkbox {
                margin-right: 0.5rem;
            }
            
            .role-badge {
                background: #e3f2fd;
                color: #1976d2;
                padding: 0.25rem 0.5rem;
                border-radius: 12px;
                font-size: 0.875rem;
                font-weight: 500;
            }
            
            .no-role {
                color: #6c757d;
                font-style: italic;
                font-size: 0.875rem;
            }
            
            .status-active {
                color: #28a745;
                font-weight: 500;
            }
            
            .status-inactive {
                color: #dc3545;
                font-weight: 500;
            }
            
            
        </style>
    `;
}

async function loadParticipantsData(projectId = null) {
    const data = { participants: [], projects: [], currentProject: null, roles: [] };
    
    try {
        data.projects = await supabaseClient.getUserProjects();
        
        if (projectId) {
            // Use the enhanced method that supports multiple roles
            data.participants = await supabaseClient.getParticipantsWithRoles(projectId);
            data.currentProject = await supabaseClient.getProjectById(projectId);
            data.roles = await supabaseClient.getRoles(projectId);
            
            // Add project name to participants
            data.participants = data.participants.map(p => ({
                ...p, 
                project_name: data.currentProject.name
            }));
        } else {
            if (data.projects.length > 0) {
                const allParticipants = await Promise.all(
                    data.projects.map(async project => {
                        const participants = await supabaseClient.getParticipantsWithRoles(project.id);
                        return participants.map(p => ({ 
                            ...p, 
                            project_name: project.name 
                        }));
                    })
                );
                data.participants = allParticipants.flat();
                
                // Get all roles from all projects for dropdown
                const allRoles = await Promise.all(
                    data.projects.map(project => supabaseClient.getRoles(project.id))
                );
                data.roles = allRoles.flat();
            }
        }
    } catch (error) {
        logger.error('Failed to load participants:', error);
    }
    
    return data;
}

function initializeParticipantsTable() {
    const columns = [
        {
            key: 'select',
            label: `<input type="checkbox" id="select-all-participants" title="Select All">`,
            readonly: true,
            render: (value, item) => `<input type="checkbox" class="participant-checkbox" data-participant-id="${item.id}">`
        },
        { key: 'name', label: i18n.t('forms.name'), type: 'text' },
        { key: 'email', label: i18n.t('forms.email'), type: 'email' },
        { 
            key: 'token', 
            label: 'Token', 
            readonly: true,
            render: (value) => value ? `<code style="font-size: 0.875rem; padding: 0.25rem 0.5rem; background: #f8f9fa; border-radius: 4px;">${value}</code>` : i18n.t('participants.no_token', {}, 'No token')
        },
        { 
            key: 'project_name', 
            label: 'Project', 
            readonly: true,
            render: (value) => value || i18n.t('common.unknown', {}, 'Unknown')
        },
        { 
            key: 'participant_roles', 
            label: i18n.t('participants.assigned_roles', {}, 'Assigned Roles'), 
            readonly: true,
            render: (value, item) => {
                // Check multiple possible sources for roles
                let roles = [];
                
                // 1. Check participant_roles array (from junction table or processed data)
                if (item.participant_roles && Array.isArray(item.participant_roles) && item.participant_roles.length > 0) {
                    roles = item.participant_roles;
                }
                // 2. Check direct role_id field (could be array or single value)
                else if (item.role_id) {
                    // Handle case where roles haven't been processed into participant_roles yet
                    if (Array.isArray(item.role_id)) {
                        // role_id is an array of IDs - need to look up names
                        if (availableRoles && availableRoles.length > 0) {
                            roles = item.role_id.map(roleId => {
                                if (!roleId) return { id: 'unknown', name: 'Unknown Role' };
                                const role = availableRoles.find(r => r.id === roleId);
                                return role || { id: roleId, name: `Role ${roleId.substring(0, 8)}...` };
                            });
                        } else {
                            // Fallback when role names aren't available
                            roles = item.role_id.map(roleId => {
                                if (!roleId) return { id: 'unknown', name: 'Unknown Role' };
                                return { id: roleId, name: `Role ${roleId.substring(0, 8)}...` };
                            });
                        }
                    } else {
                        // role_id is a single ID
                        if (availableRoles && availableRoles.length > 0) {
                            const role = availableRoles.find(r => r.id === item.role_id);
                            if (role) roles = [role];
                        }
                        if (roles.length === 0 && item.role_id) {
                            roles = [{ id: item.role_id, name: `Role ${item.role_id.substring(0, 8)}...` }];
                        }
                    }
                }
                
                if (roles.length > 0) {
                    return roles.map(role => 
                        `<span class="role-badge" data-role-id="${role.id}">${role.name}</span>`
                    ).join(' ');
                }
                
                return `<span class="no-role">${i18n.t('participants.no_role')}</span>`;
            }
        },
        { 
            key: 'is_active', 
            label: i18n.t('forms.status'), 
            readonly: true,
            render: (value) => `<span class="status-${value ? 'active' : 'inactive'}">${value ? i18n.t('participants.active') : i18n.t('participants.inactive')}</span>`
        },
        { 
            key: 'last_active', 
            label: i18n.t('participants.last_active', {}, 'Last Active'), 
            readonly: true,
            render: (value) => value ? Utils.DateUtils.relative(value) : i18n.t('common.never', {}, 'Never')
        }
    ];

    participantsTable = new TableCRUD({
        tableName: 'participants',
        columns: columns,
        editMode: 'modal',
        onAdd: handleAddParticipant,
        onEdit: handleEditParticipant,
        onDelete: handleDeleteParticipant,
        onUpdate: () => participantsTable.refresh(),
        customActions: [
            {
                key: 'manage-roles',
                label: i18n.t('participants.manage_roles', {}, 'Manage Roles'),
                color: '#17a2b8',
                handler: handleManageParticipantRoles
            }
        ],
        customLoadData: async () => {
            const data = await loadParticipantsData(projectId);
            return data.participants;
        }
    });

    participantsTable.render('participants-table-container');
    
    // Add bulk selection functionality after table is rendered
    setTimeout(() => initializeBulkSelection(), 100);
}

async function handleAddParticipant(data) {
    const selectedProjectId = projectId || supabaseClient.getCurrentProjectId();
    
    logger.log('ParticipantsPage: Using projectId for create operation:', selectedProjectId);
    
    if (!selectedProjectId) {
        throw new Error('Project is required');
    }
    
    // Generate unique token for the participant
    const token = generateUniqueToken();
    
    const participantData = {
        project_id: selectedProjectId,
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        token: token,
        is_active: true
    };
    
    // Retry logic for token duplicates
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
        try {
            await supabaseClient.createWithProjectContext('participants', selectedProjectId, participantData);
            logger.log('ParticipantsPage: Create operation completed successfully');
            return;
        } catch (error) {
            if (error.message && error.message.includes('duplicate key value violates unique constraint "participants_token_key"')) {
                retryCount++;
                logger.log(`ParticipantsPage: Token duplicate, retrying... (${retryCount}/${maxRetries})`);
                
                if (retryCount < maxRetries) {
                    participantData.token = generateUniqueToken();
                    logger.log(`ParticipantsPage: Generated new token:`, participantData.token);
                    continue;
                } else {
                    throw new Error('Failed to generate unique token after multiple attempts. Please try again.');
                }
            } else {
                throw error;
            }
        }
    }
}

async function handleEditParticipant(id, data) {
    const selectedProjectId = projectId || supabaseClient.getCurrentProjectId();
    
    logger.log('ParticipantsPage: Using projectId for update operation:', selectedProjectId);
    
    const participantData = {
        name: data.name,
        email: data.email || null,
        phone: data.phone || null
        // Note: don't update token on edit
    };
    
    if (selectedProjectId) {
        await supabaseClient.updateWithProjectContext('participants', selectedProjectId, id, participantData);
    } else {
        await supabaseClient.update('participants', id, participantData);
    }
    
    logger.log('ParticipantsPage: Update operation completed successfully');
}

async function handleDeleteParticipant(id, participant) {
    const selectedProjectId = participant.project_id || projectId || supabaseClient.getCurrentProjectId();
    
    logger.log('ParticipantsPage: Deleting participant with projectId:', selectedProjectId);
    
    // Confirm deletion with user
    if (!confirm(i18n.t('messages.confirm_delete_participant', { name: participant.name }, `Are you sure you want to delete participant "${participant.name}"?`))) {
        return; // User cancelled
    }
    
    if (selectedProjectId) {
        await supabaseClient.deleteWithProjectContext('participants', selectedProjectId, id);
    } else {
        await supabaseClient.delete('participants', id);
    }
    
    logger.log('ParticipantsPage: Delete operation completed successfully');
}

async function handleManageParticipantRoles(participantId, participant) {
    if (!participant) return;
    
    // Create a modal for individual participant role management
    createIndividualRoleModal(participantId, participant);
}

function createIndividualRoleModal(participantId, participant) {
    // Create modal HTML
    const modalId = `role-modal-${participantId}`;
    const modalHTML = `
        <div id="${modalId}" class="individual-role-modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center;">
            <div style="background: white; border-radius: 8px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.5rem; border-bottom: 1px solid #dee2e6;">
                    <h3 style="margin: 0; font-size: 1.25rem;">${i18n.t('participants.manage_roles_for', { name: participant.name })}</h3>
                    <button class="individual-modal-close" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #6c757d;">&times;</button>
                </div>
                <div style="padding: 1.5rem;">
                    <div id="individual-role-selector-${participantId}"></div>
                </div>
                <div style="display: flex; gap: 0.5rem; justify-content: flex-end; padding: 1rem 1.5rem; border-top: 1px solid #dee2e6;">
                    <button class="btn btn-secondary individual-modal-close">Close</button>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Initialize EntitySelector for individual participant roles
    const currentProjectId = projectId || supabaseClient.getCurrentProjectId();
    const individualRoleSelector = new EntitySelector(`individual-role-selector-${participantId}`, {
        tableName: 'roles',
        projectId: currentProjectId,
        entityName: 'role',
        entityNamePlural: 'roles',
        allowCreation: true,
        allowSelection: true,
        placeholder: 'Add or remove roles for this participant...',
        label: 'Participant Roles:',
        onSelectionChange: async (selectedRoles) => {
            await handleIndividualRoleUpdate(participantId, participant, selectedRoles);
        }
    });
    
    // Set current roles as selected - handle multiple data formats
    let currentRoles = [];
    
    // 1. Check participant_roles array (processed data)
    if (participant.participant_roles && Array.isArray(participant.participant_roles)) {
        currentRoles = participant.participant_roles;
    }
    // 2. Check direct role_id field
    else if (participant.role_id) {
        if (Array.isArray(participant.role_id)) {
            // role_id is an array - look up role names
            if (availableRoles && availableRoles.length > 0) {
                currentRoles = participant.role_id.map(roleId => {
                    if (!roleId) return { id: 'unknown', name: 'Unknown Role' };
                    const role = availableRoles.find(r => r.id === roleId);
                    return role || { id: roleId, name: `Role ${roleId.substring(0, 8)}...` };
                });
            }
        } else {
            // role_id is single value
            if (availableRoles && availableRoles.length > 0) {
                const role = availableRoles.find(r => r.id === participant.role_id);
                if (role) currentRoles = [role];
            }
        }
    }
    
    if (currentRoles.length > 0) {
        setTimeout(() => {
            const roleEntities = currentRoles.map(role => ({ id: role.id, name: role.name }));
            individualRoleSelector.setSelectedEntities(roleEntities);
        }, 100);
    }
    
    // Add close event listeners
    const modal = document.getElementById(modalId);
    const closeButtons = modal.querySelectorAll('.individual-modal-close');
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

async function handleIndividualRoleUpdate(participantId, participant, selectedRoles) {
    try {
        const selectedRoleIds = selectedRoles.map(role => role.id);
        
        // Set participant roles to the selected ones (replace mode)
        await supabaseClient.setParticipantRoles(participantId, selectedRoleIds);
        
        // Refresh table to show updated roles
        if (participantsTable) {
            await participantsTable.refresh();
        }
        
        // Show success notification
        if (window.app && window.app.showNotification) {
            window.app.showNotification('success', 'Roles Updated', `Successfully updated roles for ${participant.name}`);
        }
        
    } catch (error) {
        logger.error('Failed to update participant roles:', error);
        
        if (window.app && window.app.showNotification) {
            window.app.showNotification('error', 'Update Failed', error.message || 'Failed to update roles. Please try again.');
        } else {
            alert('Failed to update roles. Please try again.');
        }
    }
}

function generateUniqueToken() {
    // Generate a more unique token using timestamp + random string + crypto random
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 15);
    const additionalRandom = Math.random().toString(36).substring(2, 8);
    
    // Add additional entropy using crypto if available
    let cryptoRandom = '';
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const array = new Uint8Array(4);
        crypto.getRandomValues(array);
        cryptoRandom = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }
    
    return `${timestamp}-${randomPart}-${additionalRandom}${cryptoRandom ? '-' + cryptoRandom : ''}`;
}

// Debug function - can be called from browser console
window.debugParticipantContext = function() {
    logger.log('DEBUG: Current participant context:', {
        pageProjectId: projectId,
        supabaseCurrentProject: supabaseClient.getCurrentProjectId(),
        windowLocationHash: window.location.hash,
        participantsTableExists: !!participantsTable,
        participantsTableProjectId: participantsTable?.projectId,
        participantsTableProjectScoped: participantsTable?.projectScoped
    });
};

// Test function for creating a participant
window.testParticipantCreation = async function() {
    logger.log('Testing participant creation...');
    
    const testData = {
        token: 'test-' + Date.now(),
        name: 'Test Participant',
        email: 'test@example.com',
        is_active: true
    };
    
    const currentProjectId = projectId || supabaseClient.getCurrentProjectId();
    
    logger.log('Using project ID:', currentProjectId);
    
    if (!currentProjectId) {
        logger.error('No project ID available for test');
        return;
    }
    
    try {
        logger.log('Creating test participant...');
        const result = await supabaseClient.createWithProjectContext('participants', currentProjectId, testData);
        logger.log('Test participant created:', result);
    } catch (error) {
        logger.error('Test participant creation failed:', error);
    }
};

// Bulk selection and role assignment functionality
let selectedParticipantIds = new Set();
let availableRoles = [];
let roleSelector = null;

async function initializeBulkSelection() {
    // Load available roles for the current project
    const currentProjectId = projectId || supabaseClient.getCurrentProjectId();
    if (currentProjectId) {
        try {
            availableRoles = await supabaseClient.getRoles(currentProjectId);
            initializeRoleSelector(currentProjectId);
        } catch (error) {
            logger.error('Failed to load roles:', error);
        }
    }
    
    // Add event listeners for checkboxes
    setupCheckboxListeners();
    
    // Add event listeners for bulk assignment modal
    setupBulkAssignmentListeners();
}

function initializeRoleSelector(currentProjectId) {
    // Initialize EntitySelector for role selection
    roleSelector = new EntitySelector('bulk-role-selector', {
        tableName: 'roles',
        projectId: currentProjectId,
        entityName: 'role',
        entityNamePlural: 'roles',
        allowCreation: true,
        allowSelection: true,
        placeholder: 'Select roles to add to selected participants...',
        label: 'Roles to assign:',
        onSelectionChange: (selectedRoles) => {
            if (selectedRoles.length > 0 && selectedParticipantIds.size > 0) {
                handleBulkRoleAssignment(selectedRoles);
            }
        }
    });
}

function setupCheckboxListeners() {
    // Select all checkbox
    const selectAllCheckbox = document.getElementById('select-all-participants');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function() {
            const participantCheckboxes = document.querySelectorAll('.participant-checkbox');
            participantCheckboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
                const participantId = checkbox.getAttribute('data-participant-id');
                if (this.checked) {
                    selectedParticipantIds.add(participantId);
                } else {
                    selectedParticipantIds.delete(participantId);
                }
            });
            updateBulkAssignmentButton();
        });
    }
    
    // Individual participant checkboxes
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('participant-checkbox')) {
            const participantId = e.target.getAttribute('data-participant-id');
            if (e.target.checked) {
                selectedParticipantIds.add(participantId);
            } else {
                selectedParticipantIds.delete(participantId);
                // Uncheck select all if any individual checkbox is unchecked
                const selectAllCheckbox = document.getElementById('select-all-participants');
                if (selectAllCheckbox) {
                    selectAllCheckbox.checked = false;
                }
            }
            updateBulkAssignmentButton();
        }
    });
}

function setupBulkAssignmentListeners() {
    // No longer need modal listeners since we're using direct assignment
}

function updateBulkAssignmentButton() {
    const bulkContainer = document.getElementById('bulk-role-assignment-container');
    const participantCount = document.getElementById('selected-participants-count');
    
    if (bulkContainer && participantCount) {
        if (selectedParticipantIds.size > 0) {
            bulkContainer.style.display = 'block';
            participantCount.textContent = `${selectedParticipantIds.size} participant${selectedParticipantIds.size !== 1 ? 's' : ''} selected`;
            
            // Clear any existing role selections when participants change
            if (roleSelector) {
                roleSelector.clearSelection();
            }
        } else {
            bulkContainer.style.display = 'none';
        }
    }
}


async function handleBulkRoleAssignment(selectedRoles) {
    if (!selectedRoles || selectedRoles.length === 0) return;
    
    const selectedRoleIds = selectedRoles.map(role => role.id);
    const selectedRoleNames = selectedRoles.map(role => role.name);
    
    try {
        const participantIds = Array.from(selectedParticipantIds);
        
        // Use 'add' mode to ignore duplicates and add roles to selected participants
        await supabaseClient.bulkAssignRoles(participantIds, selectedRoleIds, 'add');
        
        // Clear role selector immediately after assignment
        if (roleSelector) {
            roleSelector.clearSelection();
        }
        
        // Refresh table to show updated roles
        if (participantsTable) {
            await participantsTable.refresh();
            // Reinitialize checkboxes after refresh
            setTimeout(() => setupCheckboxListeners(), 100);
        }
        
        const roleText = selectedRoleNames.length > 1 ? `roles: ${selectedRoleNames.join(', ')}` : `role: ${selectedRoleNames[0]}`;
        
        // Show success notification if available, otherwise use alert
        if (window.app && window.app.showNotification) {
            window.app.showNotification('success', 'Roles Added', `Successfully added ${roleText} to ${participantIds.length} participant${participantIds.length !== 1 ? 's' : ''}`);
        } else {
            alert(`Successfully added ${roleText} to ${participantIds.length} participant${participantIds.length !== 1 ? 's' : ''}`);
        }
        
    } catch (error) {
        logger.error('Failed to assign roles:', error);
        
        if (window.app && window.app.showNotification) {
            window.app.showNotification('error', 'Assignment Failed', error.message || 'Failed to assign roles. Please try again.');
        } else {
            alert('Failed to assign roles. Please try again.');
        }
    }
}