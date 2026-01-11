/**
 * EntitySelector Usage Examples
 * Demonstrates different ways to use the generic EntitySelector component
 * Now includes examples of allowCreation and allowSelection mode combinations
 */

import EntitySelector from './entity-selector.js';
import DebugLogger from '../core/debug-logger.js';

const logger = new DebugLogger('EntitySelectorExample');

// Example 1: Role Selector (original use case)
export function createRoleSelector(containerId, projectId) {
    return new EntitySelector(containerId, {
        tableName: 'roles',
        projectId: projectId,
        projectIdField: 'project_id',
        entityName: 'role',
        entityNamePlural: 'roles',
        placeholder: 'Type role name or # for all roles...',
        label: 'Roles (type to add new or select existing):',
        onSelectionChange: (selectedRoles) => {
            logger.log('Selected roles:', selectedRoles);
        }
    });
}

// Example 2: Participant Selector
export function createParticipantSelector(containerId, projectId) {
    return new EntitySelector(containerId, {
        tableName: 'participants',
        projectId: projectId,
        projectIdField: 'project_id',
        idField: 'id',
        nameField: 'name', // assuming participants have a name field
        descriptionField: 'email', // use email as description
        entityName: 'participant',
        entityNamePlural: 'participants',
        placeholder: 'Type participant name or # for all participants...',
        label: 'Participants (type to add new or select existing):',
        allowCreation: true,
        allowSelection: true,
        createData: (name) => ({
            // Additional data when creating a new participant
            created_at: new Date().toISOString(),
            status: 'active'
        }),
        onSelectionChange: (selectedParticipants) => {
            logger.log('Selected participants:', selectedParticipants);
        }
    });
}

// Example 3: Custom Table Selector (for selecting from custom_tables)
export function createCustomTableSelector(containerId, projectId) {
    return new EntitySelector(containerId, {
        tableName: 'custom_tables',
        projectId: projectId,
        projectIdField: 'project_id',
        idField: 'id',
        nameField: 'table_name',
        descriptionField: 'description',
        entityName: 'table',
        entityNamePlural: 'tables',
        placeholder: 'Type table name or # for all tables...',
        label: 'Custom Tables:',
        allowCreation: false, // Don't allow creating tables on the fly
        allowSelection: true,
        maxSelections: 1, // Only allow one table selection
        onSelectionChange: (selectedTables) => {
            logger.log('Selected table:', selectedTables[0]);
        }
    });
}

// Example 4: Tag/Category Selector (generic tags without project filtering)
export function createTagSelector(containerId) {
    return new EntitySelector(containerId, {
        tableName: 'tags', // hypothetical tags table
        idField: 'id',
        nameField: 'name',
        descriptionField: 'description',
        entityName: 'tag',
        entityNamePlural: 'tags',
        placeholder: 'Type tag name or # for all tags...',
        label: 'Tags:',
        allowCreation: true,
        allowSelection: true,
        createData: {
            // Static additional data for all new tags
            created_at: new Date().toISOString(),
            color: '#007bff'
        },
        onSelectionChange: (selectedTags) => {
            logger.log('Selected tags:', selectedTags);
        }
    });
}

// Example 5: User Selector with Custom Filters
export function createUserSelector(containerId, role = null) {
    const filters = role ? { role: role } : {};
    
    return new EntitySelector(containerId, {
        tableName: 'users',
        idField: 'id',
        nameField: 'display_name',
        descriptionField: 'email',
        entityName: 'user',
        entityNamePlural: 'users',
        placeholder: 'Type user name or # for all users...',
        label: role ? `${role} Users:` : 'Users:',
        allowCreation: false, // Users typically shouldn't be created on the fly
        allowSelection: true,
        filters: filters,
        orderBy: 'display_name',
        onSelectionChange: (selectedUsers) => {
            logger.log('Selected users:', selectedUsers);
        }
    });
}

// Example 6: Location/Address Selector with Dynamic Create Data
export function createLocationSelector(containerId, projectId) {
    return new EntitySelector(containerId, {
        tableName: 'locations',
        projectId: projectId,
        projectIdField: 'project_id',
        idField: 'id',
        nameField: 'address',
        descriptionField: 'notes',
        entityName: 'location',
        entityNamePlural: 'locations',
        placeholder: 'Type address or # for all locations...',
        label: 'Locations:',
        allowCreation: true,
        allowSelection: true,
        createData: async (address) => {
            // Dynamic create data based on input
            return {
                address: address,
                latitude: null,
                longitude: null,
                created_at: new Date().toISOString(),
                geocoded: false
            };
        },
        onEntityCreate: (newLocation) => {
            // Trigger geocoding for the new location
            logger.log('New location created, should geocode:', newLocation);
        },
        onSelectionChange: (selectedLocations) => {
            logger.log('Selected locations:', selectedLocations);
        }
    });
}

// Example 7: Workflow Step Selector (for workflow builder)
export function createWorkflowStepSelector(containerId, workflowId) {
    return new EntitySelector(containerId, {
        tableName: 'workflow_steps',
        projectId: workflowId,
        projectIdField: 'workflow_id',
        idField: 'id',
        nameField: 'step_name',
        descriptionField: 'description',
        entityName: 'step',
        entityNamePlural: 'steps',
        placeholder: 'Type step name or # for all steps...',
        label: 'Workflow Steps:',
        allowCreation: true,
        allowSelection: true,
        createData: {
            step_type: 'action',
            position: 0,
            settings: {}
        },
        onSelectionChange: (selectedSteps) => {
            logger.log('Selected workflow steps:', selectedSteps);
        }
    });
}

// Example 8: Selection-Only Mode (no creation)
export function createSelectionOnlySelector(containerId, projectId) {
    return new EntitySelector(containerId, {
        tableName: 'roles',
        projectId: projectId,
        projectIdField: 'project_id',
        entityName: 'role',
        entityNamePlural: 'roles',
        allowCreation: false,
        allowSelection: true,
        label: 'Select Existing Roles:',
        placeholder: 'Type to search existing roles or # for all...',
        onSelectionChange: (selectedRoles) => {
            logger.log('Selected existing roles:', selectedRoles);
        }
    });
}

// Example 9: Creation-Only Mode (no selection)
export function createCreationOnlySelector(containerId, projectId) {
    return new EntitySelector(containerId, {
        tableName: 'roles',
        projectId: projectId,
        projectIdField: 'project_id',
        entityName: 'role',
        entityNamePlural: 'roles',
        allowCreation: true,
        allowSelection: false,
        label: 'Create New Roles:',
        placeholder: 'Type to create new roles...',
        onSelectionChange: (selectedRoles) => {
            logger.log('Created new roles:', selectedRoles);
        }
    });
}

// Example 10: View-Only Mode (no creation or selection)
export function createViewOnlySelector(containerId, projectId) {
    return new EntitySelector(containerId, {
        tableName: 'roles',
        projectId: projectId,
        projectIdField: 'project_id',
        entityName: 'role',
        entityNamePlural: 'roles',
        allowCreation: false,
        allowSelection: false,
        label: 'View Available Roles:',
        placeholder: 'View only - no actions available...',
        onSelectionChange: (selectedRoles) => {
            logger.log('View mode - no changes allowed');
        }
    });
}

// Example 11: Survey Answer Mode (for answering surveys)
export function createSurveyAnswerSelector(containerId, questionId, mode = 'both') {
    const config = {
        tableName: 'survey_answers',
        projectId: questionId,
        projectIdField: 'question_id',
        idField: 'id',
        nameField: 'answer_text',
        descriptionField: 'notes',
        entityName: 'answer',
        entityNamePlural: 'answers',
        maxSelections: 1, // Usually only one answer per question
    };

    switch (mode) {
        case 'select-only':
            config.allowCreation = false;
            config.allowSelection = true;
            config.label = 'Select your answer:';
            config.placeholder = 'Choose from available answers...';
            break;
        case 'create-only':
            config.allowCreation = true;
            config.allowSelection = false;
            config.label = 'Provide your answer:';
            config.placeholder = 'Type your answer...';
            break;
        case 'both':
        default:
            config.allowCreation = true;
            config.allowSelection = true;
            config.label = 'Select or provide your answer:';
            config.placeholder = 'Choose existing or type new answer...';
            break;
    }

    config.onSelectionChange = (selectedAnswers) => {
        logger.log('Survey answer selected:', selectedAnswers[0]);
    };

    return new EntitySelector(containerId, config);
}

// Example 12: Dynamic Mode Switching
export function createDynamicModeSelector(containerId, projectId) {
    const selector = new EntitySelector(containerId, {
        tableName: 'roles',
        projectId: projectId,
        projectIdField: 'project_id',
        entityName: 'role',
        entityNamePlural: 'roles',
        allowCreation: true,
        allowSelection: true,
        onSelectionChange: (selectedRoles) => {
            logger.log('Selected roles:', selectedRoles);
        }
    });

    // Add helper methods to switch modes dynamically
    selector.switchToSelectionOnly = () => {
        selector.setMode(true, false);
    };

    selector.switchToCreationOnly = () => {
        selector.setMode(false, true);
    };

    selector.switchToViewOnly = () => {
        selector.setMode(false, false);
    };

    selector.switchToFull = () => {
        selector.setMode(true, true);
    };

    return selector;
}

// Usage in a page component:
/*
export default async function SomePage() {
    return `
        <div class="page">
            <h1>Example Page</h1>
            
            <div class="form-group">
                <div id="role-selector-container"></div>
            </div>
            
            <div class="form-group">
                <div id="participant-selector-container"></div>
            </div>
            
            <button onclick="handleSubmit()">Submit</button>
        </div>
        
        <script>
            import { createRoleSelector, createParticipantSelector } from '../components/entity-selector-example.js';
            
            // Initialize selectors
            const roleSelector = createRoleSelector('role-selector-container', 'project-123');
            const participantSelector = createParticipantSelector('participant-selector-container', 'project-123');
            
            function handleSubmit() {
                const selectedRoles = roleSelector.getSelectedEntityIds();
                const selectedParticipants = participantSelector.getSelectedEntityIds();
                
                logger.log('Form data:', {
                    roles: selectedRoles,
                    participants: selectedParticipants
                });
            }
        </script>
    `;
}
*/