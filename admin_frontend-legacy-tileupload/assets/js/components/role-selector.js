/**
 * RoleSelector - Reusable role selection component
 * Features: Tag-based interface, on-the-fly role creation, keyboard navigation, # trigger
 * Now extends EntitySelector for better reusability
 */

import EntitySelector from './entity-selector.js';

class RoleSelector extends EntitySelector {
    constructor(containerId, options = {}) {
        // Convert role-specific options to generic entity options
        const entityOptions = {
            tableName: 'roles',
            projectIdField: 'project_id',
            idField: 'id',
            nameField: 'name',
            descriptionField: 'description',
            entityName: 'role',
            entityNamePlural: 'roles',
            placeholder: options.placeholder || 'Type role name or # for all roles...',
            label: options.label || 'Roles (type to add new or select existing):',
            
            // Map role-specific callbacks to entity callbacks
            onEntityCreate: options.onRoleCreate,
            
            ...options // Allow override of any options
        };
        
        super(containerId, entityOptions);
        
        // Maintain backward compatibility with role-specific property names
        this.projectRoles = this.entities;
        this.selectedRoles = this.selectedEntities;
    }
    
    // Backward compatibility methods
    get projectRoles() {
        return this.entities;
    }
    
    set projectRoles(value) {
        this.entities = value;
    }
    
    get selectedRoles() {
        return this.selectedEntities;
    }
    
    set selectedRoles(value) {
        this.selectedEntities = value;
    }
    
    async loadProjectRoles() {
        return await this.loadEntities();
    }
    
    selectRole(roleId, roleName) {
        return this.selectEntity(roleId, roleName);
    }
    
    removeRole(roleId) {
        return this.removeEntity(roleId);
    }
    
    createAndSelectRole(roleName) {
        return this.createAndSelectEntity(roleName);
    }
    
    renderSelectedRoles() {
        return this.renderSelectedEntities();
    }
    
    async setSelectedRoles(roles) {
        return await this.setSelectedEntities(roles);
    }
    
    getSelectedRoles() {
        return this.getSelectedEntities();
    }
    
    getSelectedRoleIds() {
        return this.getSelectedEntityIds();
    }
    
    updateRoles(roles) {
        this.entities = roles || [];
        this.projectRoles = roles || [];
        // Re-render the component if it's already rendered
        if (document.getElementById(this.containerId)) {
            this.render();
        }
    }
}

export default RoleSelector;