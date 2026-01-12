/**
 * RoleSelector Usage Examples
 * Shows how to use the reusable RoleSelector component in different scenarios
 */

import RoleSelector from './role-selector.js';
import DebugLogger from '../core/debug-logger.js';

const logger = new DebugLogger('RoleSelectorExample');

// Example 1: Basic Role Selector
export function createBasicRoleSelector(containerId, projectId) {
    return new RoleSelector(containerId, {
        projectId: projectId,
        onSelectionChange: (roles) => {
            logger.log('Selected roles:', roles);
        }
    });
}

// Example 2: Role Selector with Custom Options
export function createCustomRoleSelector(containerId, projectId) {
    return new RoleSelector(containerId, {
        projectId: projectId,
        label: 'Select Team Members:',
        placeholder: 'Type member name or # to see all...',
        maxSelections: 5,
        allowCreation: true,
        allowSelection: true,
        showQuickSelect: true,
        onSelectionChange: (roles) => {
            logger.log('Team members selected:', roles);
        },
        onRoleCreate: (role) => {
            logger.log('New team member created:', role);
        },
        onError: (error) => {
            logger.error('Role selector error:', error);
        }
    });
}

// Example 3: Read-only Role Selector (for display purposes)
export function createReadOnlyRoleSelector(containerId, projectId, preSelectedRoles) {
    const selector = new RoleSelector(containerId, {
        projectId: projectId,
        label: 'Assigned Roles:',
        allowCreation: false,
        allowSelection: true,
        showQuickSelect: false,
        disabled: true
    });
    
    // Set pre-selected roles
    selector.setSelectedRoles(preSelectedRoles);
    
    return selector;
}

// Example 4: Role Selector for Form Integration
export function createFormRoleSelector(containerId, projectId, formData = {}) {
    const selector = new RoleSelector(containerId, {
        projectId: projectId,
        label: 'Required Roles:',
        placeholder: 'Add required roles...',
        onSelectionChange: (roles) => {
            // Update form data
            formData.requiredRoles = roles.map(r => r.id);
            
            // Trigger form validation
            if (window.validateForm) {
                window.validateForm();
            }
        }
    });
    
    // Load existing form data
    if (formData.requiredRoles) {
        selector.setSelectedRoles(formData.requiredRoles);
    }
    
    return selector;
}

// Example 5: Dynamic Role Selector (can be enabled/disabled)
export function createDynamicRoleSelector(containerId, projectId) {
    const selector = new RoleSelector(containerId, {
        projectId: projectId,
        label: 'Conditional Roles:',
        onSelectionChange: (roles) => {
            logger.log('Dynamic selection changed:', roles);
        }
    });
    
    // Example: Enable/disable based on other form fields
    const enableButton = document.createElement('button');
    enableButton.textContent = 'Toggle Enabled';
    enableButton.onclick = () => {
        const isDisabled = selector.options.disabled;
        selector.setDisabled(!isDisabled);
        logger.log(`Role selector ${isDisabled ? 'enabled' : 'disabled'}`);
    };
    
    document.getElementById(containerId).appendChild(enableButton);
    
    return selector;
}

// Example 6: Multiple Role Selectors with Coordination
export function createCoordinatedRoleSelectors(containerIds, projectId) {
    const selectors = [];
    
    containerIds.forEach((containerId, index) => {
        const selector = new RoleSelector(containerId, {
            projectId: projectId,
            label: `Role Group ${index + 1}:`,
            onSelectionChange: (roles) => {
                logger.log(`Group ${index + 1} roles:`, roles);
                
                // Example: Update other selectors based on this selection
                updateOtherSelectors(selectors, index, roles);
            }
        });
        
        selectors.push(selector);
    });
    
    return selectors;
}

function updateOtherSelectors(selectors, changedIndex, newRoles) {
    // Example coordination logic
    // You could implement rules like:
    // - Prevent role overlap between groups
    // - Auto-suggest complementary roles
    // - Validate role combinations
    
    selectors.forEach((selector, index) => {
        if (index !== changedIndex) {
            // Example: Refresh to update available roles
            selector.refresh();
        }
    });
}

// Usage in HTML:
/*
<!-- Basic HTML structure -->
<div id="roleSelector1"></div>
<div id="roleSelector2"></div>

<!-- Include CSS -->
<link rel="stylesheet" href="assets/css/components/role-selector.css">

<!-- JavaScript usage -->
<script type="module">
import { createBasicRoleSelector } from './assets/js/components/role-selector-example.js';

// Create role selector
const selector = createBasicRoleSelector('roleSelector1', 'your-project-id');

// Get selected roles
const selectedRoles = selector.getSelectedRoles();
logger.log('Current selection:', selectedRoles);

// Programmatically set roles
selector.setSelectedRoles(['role-id-1', 'role-id-2']);

// Clear selection
selector.clearSelection();

// Refresh data
selector.refresh();

// Cleanup
selector.destroy();
</script>
*/