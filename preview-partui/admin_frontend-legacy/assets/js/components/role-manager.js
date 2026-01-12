/**
 * Role Manager Module
 * Handles dynamic role creation, permissions, and project-scoped role management
 */

import { supabaseClient } from '../core/supabase.js';
import DebugLogger from '../core/debug-logger.js';

const logger = new DebugLogger('RoleManager');

export class RoleManager {
    constructor(projectId) {
        this.projectId = projectId;
        this.roles = [];
        this.permissionTemplates = {
            participant: {
                label: 'Participant',
                description: 'Basic participant with limited access',
                permissions: {
                    workflow_view: true,
                    workflow_execute: true,
                    workflow_create: false,
                    workflow_edit: false,
                    workflow_delete: false,
                    data_view: true,
                    data_edit: false,
                    data_delete: false,
                    admin_access: false
                }
            },
            technician: {
                label: 'Technician',
                description: 'Field technician with data collection access',
                permissions: {
                    workflow_view: true,
                    workflow_execute: true,
                    workflow_create: false,
                    workflow_edit: false,
                    workflow_delete: false,
                    data_view: true,
                    data_edit: true,
                    data_delete: false,
                    admin_access: false
                }
            },
            supervisor: {
                label: 'Supervisor',
                description: 'Supervisor with review and approval capabilities',
                permissions: {
                    workflow_view: true,
                    workflow_execute: true,
                    workflow_create: true,
                    workflow_edit: true,
                    workflow_delete: false,
                    data_view: true,
                    data_edit: true,
                    data_delete: true,
                    admin_access: false
                }
            },
            manager: {
                label: 'Manager',
                description: 'Manager with full workflow management access',
                permissions: {
                    workflow_view: true,
                    workflow_execute: true,
                    workflow_create: true,
                    workflow_edit: true,
                    workflow_delete: true,
                    data_view: true,
                    data_edit: true,
                    data_delete: true,
                    admin_access: false
                }
            },
            admin: {
                label: 'Administrator',
                description: 'Full administrative access',
                permissions: {
                    workflow_view: true,
                    workflow_execute: true,
                    workflow_create: true,
                    workflow_edit: true,
                    workflow_delete: true,
                    data_view: true,
                    data_edit: true,
                    data_delete: true,
                    admin_access: true
                }
            }
        };
        this.callbacks = {
            onRoleCreate: null,
            onRoleUpdate: null,
            onRoleDelete: null,
            onRolesLoad: null
        };
    }

    // =====================================================
    // ROLE MANAGEMENT
    // =====================================================

    /**
     * Load roles from database
     */
    async loadRoles() {
        try {
            const { data: roles, error } = await supabaseClient.client
                .from('roles')
                .select('*')
                .eq('project_id', this.projectId)
                .order('name');

            if (error) throw error;

            this.roles = roles || [];
            this.triggerCallback('onRolesLoad', this.roles);
            
            return this.roles;
        } catch (error) {
            throw new Error(`Failed to load roles: ${error.message}`);
        }
    }

    /**
     * Create a new role
     */
    async createRole(roleData) {
        try {
            // Validate role data
            const validationResult = this.validateRoleData(roleData);
            if (!validationResult.isValid) {
                throw new Error(`Validation failed: ${validationResult.errors.join(', ')}`);
            }

            // Check for duplicate role names
            const exists = await this.roleExists(roleData.name);
            if (exists) {
                throw new Error(`Role "${roleData.name}" already exists`);
            }

            // Prepare role data for database
            const role = {
                project_id: this.projectId,
                name: roleData.name.toLowerCase().trim(),
                description: roleData.description || '',
                permissions: roleData.permissions || this.getDefaultPermissions(),
                created_at: new Date().toISOString()
            };

            // Insert into database
            const { data: newRole, error } = await supabaseClient.client
                .from('roles')
                .insert(role)
                .select()
                .single();

            if (error) throw error;

            // Add to local roles array
            this.roles.push(newRole);
            this.triggerCallback('onRoleCreate', newRole);
            
            return newRole;
        } catch (error) {
            throw new Error(`Failed to create role: ${error.message}`);
        }
    }

    /**
     * Create role from template
     */
    async createRoleFromTemplate(roleName, templateKey) {
        const template = this.permissionTemplates[templateKey];
        if (!template) {
            throw new Error(`Template "${templateKey}" not found`);
        }

        const roleData = {
            name: roleName,
            description: template.description,
            permissions: template.permissions
        };

        return await this.createRole(roleData);
    }

    /**
     * Update existing role
     */
    async updateRole(roleId, updates) {
        try {
            const role = this.getRoleById(roleId);
            if (!role) {
                throw new Error(`Role with ID ${roleId} not found`);
            }

            // Validate updates
            if (updates.name && updates.name !== role.name) {
                const exists = await this.roleExists(updates.name);
                if (exists) {
                    throw new Error(`Role "${updates.name}" already exists`);
                }
            }

            // Prepare update data
            const updateData = {
                name: updates.name ? updates.name.toLowerCase().trim() : role.name,
                description: updates.description !== undefined ? updates.description : role.description,
                permissions: updates.permissions || role.permissions,
                updated_at: new Date().toISOString()
            };

            // Update in database
            const { data: updatedRole, error } = await supabaseClient.client
                .from('roles')
                .update(updateData)
                .eq('id', roleId)
                .select()
                .single();

            if (error) throw error;

            // Update local roles array
            const roleIndex = this.roles.findIndex(r => r.id === roleId);
            if (roleIndex !== -1) {
                this.roles[roleIndex] = updatedRole;
            }

            this.triggerCallback('onRoleUpdate', updatedRole);
            
            return updatedRole;
        } catch (error) {
            throw new Error(`Failed to update role: ${error.message}`);
        }
    }

    /**
     * Delete a role
     */
    async deleteRole(roleId) {
        try {
            const role = this.getRoleById(roleId);
            if (!role) {
                throw new Error(`Role with ID ${roleId} not found`);
            }

            // Check if role is in use
            const inUse = await this.isRoleInUse(roleId);
            if (inUse) {
                throw new Error(`Cannot delete role "${role.name}" - it is currently in use`);
            }

            // Delete from database
            const { error } = await supabaseClient.client
                .from('roles')
                .delete()
                .eq('id', roleId);

            if (error) throw error;

            // Remove from local roles array
            this.roles = this.roles.filter(r => r.id !== roleId);
            this.triggerCallback('onRoleDelete', role);
            
            return role;
        } catch (error) {
            throw new Error(`Failed to delete role: ${error.message}`);
        }
    }

    // =====================================================
    // DYNAMIC ROLE CREATION
    // =====================================================

    /**
     * Create role dynamically if it doesn't exist
     */
    async ensureRole(roleName, templateKey = 'participant') {
        try {
            // Check if role already exists
            const existingRole = this.getRoleByName(roleName);
            if (existingRole) {
                return existingRole;
            }

            // Create new role from template
            return await this.createRoleFromTemplate(roleName, templateKey);
        } catch (error) {
            throw new Error(`Failed to ensure role: ${error.message}`);
        }
    }

    /**
     * Ensure multiple roles exist
     */
    async ensureRoles(roleNames, templateKey = 'participant') {
        const results = [];
        
        for (const roleName of roleNames) {
            try {
                const role = await this.ensureRole(roleName, templateKey);
                results.push({ roleName, role, success: true });
            } catch (error) {
                results.push({ roleName, error: error.message, success: false });
            }
        }
        
        return results;
    }

    /**
     * Get or create role by name
     */
    async getOrCreateRole(roleName, permissions = null) {
        let role = this.getRoleByName(roleName);
        
        if (!role) {
            const roleData = {
                name: roleName,
                description: `Auto-created role: ${roleName}`,
                permissions: permissions || this.getDefaultPermissions()
            };
            
            role = await this.createRole(roleData);
        }
        
        return role;
    }

    // =====================================================
    // PERMISSION MANAGEMENT
    // =====================================================

    /**
     * Update role permissions
     */
    async updateRolePermissions(roleId, permissions) {
        return await this.updateRole(roleId, { permissions });
    }

    /**
     * Check if role has specific permission
     */
    hasPermission(roleName, permission) {
        const role = this.getRoleByName(roleName);
        if (!role || !role.permissions) return false;
        
        return role.permissions[permission] === true;
    }

    /**
     * Check if any of the roles has permission
     */
    hasAnyPermission(roleNames, permission) {
        return roleNames.some(roleName => this.hasPermission(roleName, permission));
    }

    /**
     * Get permissions for role
     */
    getRolePermissions(roleName) {
        const role = this.getRoleByName(roleName);
        return role?.permissions || {};
    }

    /**
     * Get combined permissions for multiple roles
     */
    getCombinedPermissions(roleNames) {
        const combined = {};
        
        // Get all possible permissions first
        Object.keys(this.getDefaultPermissions()).forEach(permission => {
            combined[permission] = false;
        });
        
        // Apply permissions from each role (OR logic)
        roleNames.forEach(roleName => {
            const rolePermissions = this.getRolePermissions(roleName);
            Object.keys(rolePermissions).forEach(permission => {
                if (rolePermissions[permission]) {
                    combined[permission] = true;
                }
            });
        });
        
        return combined;
    }

    // =====================================================
    // ROLE QUERIES
    // =====================================================

    /**
     * Get all roles
     */
    getAllRoles() {
        return [...this.roles];
    }

    /**
     * Get role by ID
     */
    getRoleById(roleId) {
        return this.roles.find(r => r.id === roleId);
    }

    /**
     * Get role by name
     */
    getRoleByName(roleName) {
        return this.roles.find(r => r.name === roleName.toLowerCase().trim());
    }

    /**
     * Get roles by names
     */
    getRolesByNames(roleNames) {
        return roleNames.map(name => this.getRoleByName(name)).filter(Boolean);
    }

    /**
     * Check if role exists
     */
    async roleExists(roleName) {
        const role = this.getRoleByName(roleName);
        return role !== undefined;
    }

    /**
     * Check if role is in use
     */
    async isRoleInUse(roleId) {
        try {
            // Check participants
            const { data: participants, error: participantsError } = await supabaseClient.client
                .from('participants')
                .select('id')
                .eq('role_id', roleId)
                .limit(1);

            if (participantsError) throw participantsError;
            if (participants && participants.length > 0) return true;

            // Check workflow stages
            const { data: stages, error: stagesError } = await supabaseClient.client
                .from('workflow_stages')
                .select('id')
                .contains('visible_to_roles', [roleId])
                .limit(1);

            if (stagesError) throw stagesError;
            if (stages && stages.length > 0) return true;

            // Check workflow actions
            const { data: actions, error: actionsError } = await supabaseClient.client
                .from('workflow_actions')
                .select('id')
                .contains('allowed_roles', [roleId])
                .limit(1);

            if (actionsError) throw actionsError;
            if (actions && actions.length > 0) return true;

            return false;
        } catch (error) {
            logger.error('Error checking role usage:', error);
            return true; // Err on the side of caution
        }
    }

    // =====================================================
    // ROLE VALIDATION
    // =====================================================

    /**
     * Validate role data
     */
    validateRoleData(roleData) {
        const errors = [];

        // Check name
        if (!roleData.name?.trim()) {
            errors.push('Role name is required');
        } else if (roleData.name.trim().length < 2) {
            errors.push('Role name must be at least 2 characters');
        } else if (!/^[a-zA-Z][a-zA-Z0-9_\s]*$/.test(roleData.name.trim())) {
            errors.push('Role name must start with a letter and contain only letters, numbers, underscores, and spaces');
        }

        // Check permissions
        if (roleData.permissions && typeof roleData.permissions !== 'object') {
            errors.push('Permissions must be an object');
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Validate role names
     */
    validateRoleNames(roleNames) {
        const errors = [];
        
        if (!Array.isArray(roleNames)) {
            return { isValid: false, errors: ['Role names must be an array'] };
        }

        roleNames.forEach((roleName, index) => {
            if (!roleName?.trim()) {
                errors.push(`Role ${index + 1}: Name is required`);
            } else if (!/^[a-zA-Z][a-zA-Z0-9_\s]*$/.test(roleName.trim())) {
                errors.push(`Role ${index + 1}: Invalid name format`);
            }
        });

        // Check for duplicates
        const uniqueNames = new Set(roleNames.map(name => name?.toLowerCase()?.trim()));
        if (uniqueNames.size !== roleNames.length) {
            errors.push('Duplicate role names are not allowed');
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    // =====================================================
    // UTILITY METHODS
    // =====================================================

    /**
     * Get default permissions
     */
    getDefaultPermissions() {
        return {
            workflow_view: true,
            workflow_execute: true,
            workflow_create: false,
            workflow_edit: false,
            workflow_delete: false,
            data_view: true,
            data_edit: false,
            data_delete: false,
            admin_access: false
        };
    }

    /**
     * Get permission templates
     */
    getPermissionTemplates() {
        return { ...this.permissionTemplates };
    }

    /**
     * Get role statistics
     */
    getRoleStatistics() {
        const stats = {
            total: this.roles.length,
            byTemplate: {},
            withCustomPermissions: 0,
            adminRoles: 0
        };

        Object.keys(this.permissionTemplates).forEach(template => {
            stats.byTemplate[template] = 0;
        });

        this.roles.forEach(role => {
            // Check if matches a template
            let matchesTemplate = false;
            Object.entries(this.permissionTemplates).forEach(([templateKey, template]) => {
                if (this.permissionsMatch(role.permissions, template.permissions)) {
                    stats.byTemplate[templateKey]++;
                    matchesTemplate = true;
                }
            });

            if (!matchesTemplate) {
                stats.withCustomPermissions++;
            }

            if (role.permissions?.admin_access) {
                stats.adminRoles++;
            }
        });

        return stats;
    }

    /**
     * Check if permissions match
     */
    permissionsMatch(permissions1, permissions2) {
        if (!permissions1 || !permissions2) return false;
        
        const keys1 = Object.keys(permissions1);
        const keys2 = Object.keys(permissions2);
        
        if (keys1.length !== keys2.length) return false;
        
        return keys1.every(key => permissions1[key] === permissions2[key]);
    }

    /**
     * Export roles for backup/transfer
     */
    exportRoles() {
        return {
            projectId: this.projectId,
            roles: this.roles.map(role => ({
                name: role.name,
                description: role.description,
                permissions: role.permissions
            })),
            exportedAt: new Date().toISOString()
        };
    }

    /**
     * Import roles from backup
     */
    async importRoles(rolesData, options = { overwrite: false }) {
        const results = [];
        
        for (const roleData of rolesData.roles) {
            try {
                const exists = await this.roleExists(roleData.name);
                
                if (exists && !options.overwrite) {
                    results.push({
                        roleName: roleData.name,
                        status: 'skipped',
                        message: 'Role already exists'
                    });
                    continue;
                }

                let role;
                if (exists && options.overwrite) {
                    const existingRole = this.getRoleByName(roleData.name);
                    role = await this.updateRole(existingRole.id, roleData);
                    results.push({
                        roleName: roleData.name,
                        status: 'updated',
                        role: role
                    });
                } else {
                    role = await this.createRole(roleData);
                    results.push({
                        roleName: roleData.name,
                        status: 'created',
                        role: role
                    });
                }
            } catch (error) {
                results.push({
                    roleName: roleData.name,
                    status: 'error',
                    error: error.message
                });
            }
        }
        
        return results;
    }

    /**
     * Set callback functions
     */
    setCallbacks(callbacks) {
        Object.assign(this.callbacks, callbacks);
    }

    /**
     * Trigger callback if exists
     */
    triggerCallback(name, ...args) {
        if (this.callbacks[name] && typeof this.callbacks[name] === 'function') {
            this.callbacks[name](...args);
        }
    }
}

export default RoleManager;