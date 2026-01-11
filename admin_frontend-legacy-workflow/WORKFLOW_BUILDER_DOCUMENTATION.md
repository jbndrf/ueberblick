# Workflow Builder Complete Documentation

## Overview

The workflow builder is a sophisticated visual tool for creating multi-stage workflows with forms, role-based permissions, and conditional logic. It uses a **local-first architecture** with instant UI updates and atomic database operations.

## Architecture

### Two Implementations

The codebase contains evidence of two workflow builder implementations:

1. **Legacy Workflow Builder** (`old_workflowbuilder/`)
   - Older implementation
   - May have different data structures

2. **Current Local-First Workflow Builder** (Primary)
   - Location: `assets/js/pages/workflow-builder.js`
   - Core: `assets/js/workflow-builder/core/`
   - Components: `assets/js/workflow-builder/components/`

This documentation focuses on the **current local-first implementation**.

### Core Architecture Components

#### 1. LocalStateManager (`workflow-builder/core/LocalStateManager.js`)

**Purpose**: Manages all workflow state in memory with instant updates and history tracking.

**Key State Structure**:
```javascript
state = {
    workflow: {
        id: UUID,
        name: string,
        description: string,
        workflow_type: 'incident' | 'survey' | 'other',
        marker_color: string (hex color),
        icon_config: object,
        is_active: boolean,
        project_id: UUID,
        locationUpdateRoles: UUID[],
        assignmentRoles: UUID[],
        selfAssignmentRoles: UUID[]
    },
    stages: Map<UUID, Stage>,
    actions: Map<UUID, Action>,
    formFields: Map<UUID, FormField>,

    // Deletion tracking (critical for updates)
    deletedActions: Set<UUID>,
    deletedStages: Set<UUID>,
    deletedQuestions: Set<UUID>,
    deletedMappings: Set<UUID>,
    deletedSnapshots: Set<string>,

    // Metadata
    isDirty: boolean,
    lastSaved: timestamp,
    version: number,

    // UI state
    selection: {
        selectedNode: UUID | null,
        selectedAction: UUID | null
    },
    viewport: {
        zoom: number,
        panX: number,
        panY: number
    }
}
```

**Key Methods**:
- `addStage(stageData)` - Add stage with persistent UUID
- `updateStage(stageId, updates)` - Update existing stage
- `deleteStage(stageId)` - Delete and track for database removal
- `addAction(actionData)` - Add action/transition
- `updateAction(actionId, updates)` - Update action
- `deleteAction(actionId)` - Delete and track action
- `addFormField(stageId, fieldData)` - Add form field with persistent UUID
- `updateFormField(fieldId, updates)` - Update form field
- `deleteFormField(fieldId)` - Delete and track field
- `exportState()` - Export for database save
- `loadState(newState)` - Load from database
- `markClean(deletionResults)` - Clear deletion tracking after save
- `undo()` / `redo()` - History navigation
- `subscribe(listener)` - Listen to state changes

**Critical Feature**: Persistent UUIDs
- All entities (stages, actions, fields) get a permanent UUID on creation
- UUIDs remain stable throughout editing
- Prevents reference breaks during updates

#### 2. DatabaseAdapter (`workflow-builder/core/DatabaseAdapter.js`)

**Purpose**: Handles all database operations with customer data preservation.

**Key Features**:
- **Atomic saves** - All or nothing database operations
- **Customer data preservation** - Checks for active workflow instances before destructive operations
- **Two save strategies**:
  1. **Update approach** - When active customer instances exist (preserves data)
  2. **Recreate approach** - When no active instances (cleaner)

**Key Methods**:
- `loadCompleteWorkflow(workflowId)` - Load entire workflow with all relationships
- `saveCompleteWorkflow(workflowData, isNewWorkflow)` - Save with customer protection
- `checkActiveInstances(workflowId)` - Check for active customer data
- `createNewWorkflow(workflowData)` - Create new workflow
- `updateWorkflowPreservingCustomerData(workflowData)` - Update without losing data
- `recreateWorkflowSafely(workflowData)` - Delete and recreate (no active instances)

#### 3. WorkflowPreviewSidebar (`workflow-builder/components/WorkflowPreviewSidebar.js`)

**Purpose**: Real-time preview of workflow configuration.

**Features**:
- Live preview of stages, actions, forms
- Subscribes to LocalStateManager changes
- Updates instantly as user edits

## Database Schema

### Core Tables

#### 1. `workflows`
Main workflow configuration.

```sql
CREATE TABLE workflows (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id),
    name VARCHAR NOT NULL,
    description TEXT,
    workflow_type VARCHAR DEFAULT 'incident',
    marker_color VARCHAR DEFAULT '#2563eb',
    icon_config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    location_update_roles UUID[],
    assignment_roles UUID[],
    self_assignment_roles UUID[],
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

#### 2. `workflow_stages`
Individual stages in a workflow.

```sql
CREATE TABLE workflow_stages (
    id UUID PRIMARY KEY,
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    stage_key VARCHAR NOT NULL,
    stage_name VARCHAR NOT NULL,
    stage_type VARCHAR NOT NULL, -- 'start', 'intermediate', 'end'
    stage_order INTEGER NOT NULL,
    max_duration_hours INTEGER DEFAULT 24,
    visible_to_roles UUID[],
    position_x INTEGER,
    position_y INTEGER,
    initial_form_id UUID REFERENCES forms(id),
    visual_config JSONB DEFAULT '{}'
);
```

**Stage Types**:
- `start` - Entry point of workflow
- `intermediate` - Processing stages
- `end` - Terminal stages (workflow completion)

#### 3. `workflow_actions`
Transitions between stages.

```sql
CREATE TABLE workflow_actions (
    id UUID PRIMARY KEY,
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    from_stage_id UUID NOT NULL REFERENCES workflow_stages(id),
    to_stage_id UUID NOT NULL REFERENCES workflow_stages(id),
    action_name VARCHAR NOT NULL,
    action_type VARCHAR NOT NULL, -- 'forward', 'backward', 'jump', 'edit'
    button_label VARCHAR NOT NULL,
    button_color VARCHAR DEFAULT '#007bff',
    allowed_roles UUID[],
    conditions JSONB DEFAULT '{}',
    requires_confirmation BOOLEAN DEFAULT false,
    confirmation_message TEXT,
    form_id UUID REFERENCES forms(id)
);
```

**Action Types**:
- `forward` - Move to next stage
- `backward` - Return to previous stage
- `jump` - Skip to specific stage
- `edit` - Edit existing data (stays in current stage)

#### 4. `forms`
Form definitions (shared between stages and actions).

```sql
CREATE TABLE forms (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id),
    name VARCHAR NOT NULL,
    description TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

#### 5. `form_fields`
Individual form fields.

```sql
CREATE TABLE form_fields (
    id UUID PRIMARY KEY,
    form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    field_key VARCHAR NOT NULL,
    field_label VARCHAR NOT NULL,
    field_type VARCHAR NOT NULL,
    field_order INTEGER NOT NULL,
    is_required BOOLEAN DEFAULT false,
    placeholder TEXT,
    help_text TEXT,
    validation_rules JSONB DEFAULT '{}',
    field_options JSONB DEFAULT '{}',
    conditional_logic JSONB DEFAULT '{}',
    page INTEGER DEFAULT 1,
    page_title VARCHAR
);
```

**Field Types**:
- `short` - Short text input
- `long` - Long text / textarea
- `multiple` - Multiple choice checkboxes
- `dropdown` - Single select dropdown
- `smart_dropdown` - Dynamic dropdown from previous data
- `date` - Date picker
- `file` - File upload
- `number` - Numeric input
- `email` - Email input
- `custom_table_selector` - Select from custom table entries

#### 6. `action_editable_fields`
Defines which fields can be edited in "edit" actions.

```sql
CREATE TABLE action_editable_fields (
    id UUID PRIMARY KEY,
    action_id UUID NOT NULL REFERENCES workflow_actions(id) ON DELETE CASCADE,
    field_id UUID REFERENCES form_fields(id),
    field_key VARCHAR
);
```

#### 7. `workflow_instances`
Customer data - active workflow executions.

```sql
CREATE TABLE workflow_instances (
    id UUID PRIMARY KEY,
    workflow_id UUID NOT NULL REFERENCES workflows(id),
    title VARCHAR,
    status VARCHAR, -- 'active', 'completed', 'cancelled'
    created_by UUID,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

**CRITICAL**: This table determines save strategy. If active instances exist, update approach must be used to preserve customer data.

#### 8. `field_mappings` (optional)
For smart dropdown field mappings.

```sql
CREATE TABLE field_mappings (
    id UUID PRIMARY KEY,
    field_id UUID REFERENCES form_fields(id),
    source_field VARCHAR,
    target_field VARCHAR,
    mapping_config JSONB
);
```

## Field Types Deep Dive

### Simple Field Types

#### Short Text (`short`)
```javascript
{
    field_type: 'short',
    field_label: 'First Name',
    placeholder: 'Enter first name',
    validation_rules: {
        required: true,
        minLength: 2,
        maxLength: 50,
        pattern: '^[a-zA-Z ]+$'
    }
}
```

#### Long Text (`long`)
```javascript
{
    field_type: 'long',
    field_label: 'Description',
    placeholder: 'Enter detailed description',
    validation_rules: {
        required: true,
        minLength: 10,
        maxLength: 1000
    }
}
```

#### Number (`number`)
```javascript
{
    field_type: 'number',
    field_label: 'Age',
    validation_rules: {
        required: true,
        min: 0,
        max: 120,
        step: 1
    }
}
```

#### Email (`email`)
```javascript
{
    field_type: 'email',
    field_label: 'Email Address',
    validation_rules: {
        required: true,
        emailFormat: true
    }
}
```

#### Date (`date`)
```javascript
{
    field_type: 'date',
    field_label: 'Date of Birth',
    validation_rules: {
        required: true,
        minDate: '1900-01-01',
        maxDate: 'today'
    }
}
```

#### File Upload (`file`)
```javascript
{
    field_type: 'file',
    field_label: 'Upload Document',
    validation_rules: {
        required: false,
        fileTypes: ['.pdf', '.jpg', '.png'],
        maxFileSize: 5242880 // 5MB in bytes
    }
}
```

### Choice-Based Field Types

#### Dropdown (`dropdown`)
Single selection from predefined options.

```javascript
{
    field_type: 'dropdown',
    field_label: 'Priority',
    field_options: {
        options: [
            { value: 'low', label: 'Low Priority' },
            { value: 'medium', label: 'Medium Priority' },
            { value: 'high', label: 'High Priority' },
            { value: 'critical', label: 'Critical' }
        ]
    },
    validation_rules: {
        required: true
    }
}
```

#### Multiple Choice (`multiple`)
Multiple selections with checkboxes.

```javascript
{
    field_type: 'multiple',
    field_label: 'Issues Found',
    field_options: {
        options: [
            { value: 'broken', label: 'Broken equipment' },
            { value: 'dirty', label: 'Needs cleaning' },
            { value: 'missing', label: 'Missing parts' },
            { value: 'other', label: 'Other issues' }
        ]
    },
    validation_rules: {
        required: true,
        minSelections: 1,
        maxSelections: 3
    }
}
```

### Advanced Field Types

#### Smart Dropdown (`smart_dropdown`)
Dynamic dropdown populated from previous workflow stage data.

**Use Case**: Select a value from a field filled in an earlier stage.

**Example**:
- Stage 1: User enters "Equipment ID" in short text field
- Stage 2: Smart dropdown shows all Equipment IDs from Stage 1

```javascript
{
    field_type: 'smart_dropdown',
    field_label: 'Select Equipment',
    field_options: {
        source_field: 'stage_1_equipment_id', // Field key from previous stage
        source_stage_id: 'uuid-of-stage-1',
        mappings: [
            {
                when: 'value_condition',
                then: 'populate_these_fields',
                field_mappings: [
                    {
                        source_key: 'equipment_type',
                        target_key: 'equipment_category'
                    }
                ]
            }
        ]
    },
    validation_rules: {
        required: true
    }
}
```

**Smart Dropdown Features**:
1. **Source Field Selection**: Choose which previous field's values to show
2. **Conditional Mappings**: Auto-populate other fields based on selection
3. **Cross-Stage Data**: Access data from any previous stage

#### Custom Table Selector (`custom_table_selector`)
Select entries from project custom tables.

```javascript
{
    field_type: 'custom_table_selector',
    field_label: 'Select Location',
    field_options: {
        custom_table_id: 'uuid-of-custom-table',
        display_field: 'name', // Which field to show in dropdown
        value_field: 'id'      // Which field to store
    },
    validation_rules: {
        required: true
    }
}
```

## Form Structure

### Multi-Page Forms

Forms can have multiple pages for better UX:

```javascript
// Page 1 fields
{
    field_key: 'name',
    field_label: 'Name',
    page: 1,
    page_title: 'Personal Information',
    field_order: 1
}

// Page 2 fields
{
    field_key: 'address',
    field_label: 'Address',
    page: 2,
    page_title: 'Contact Details',
    field_order: 1
}
```

### Conditional Logic

Fields can be shown/hidden based on other field values:

```javascript
{
    field_key: 'other_details',
    field_label: 'Please specify',
    conditional_logic: {
        show_if: {
            field_key: 'issue_type',
            operator: 'equals',
            value: 'other'
        }
    }
}
```

**Operators**:
- `equals` - Field value equals specific value
- `not_equals` - Field value does not equal
- `contains` - Field value contains string
- `greater_than` - Numeric comparison
- `less_than` - Numeric comparison

## Workflow Creation Flow

### 1. Create Workflow

```javascript
const workflow = {
    id: crypto.randomUUID(),
    project_id: 'project-uuid',
    name: 'Damage Report Workflow',
    description: 'Process for reporting and fixing damages',
    workflow_type: 'incident',
    marker_color: '#ff0000',
    icon_config: { icon: 'alert', color: '#ff0000' },
    is_active: true
};
```

### 2. Create Stages

```javascript
// Start stage
const startStage = {
    id: crypto.randomUUID(),
    key: 'stage_report',
    name: 'Report Damage',
    type: 'start',
    order: 1,
    maxHours: 24,
    allowedRoles: ['field_inspector'],
    x: 100,
    y: 200,
    formFields: [] // Will be populated with form fields
};

// Intermediate stage
const reviewStage = {
    id: crypto.randomUUID(),
    key: 'stage_review',
    name: 'Review Report',
    type: 'intermediate',
    order: 2,
    maxHours: 48,
    allowedRoles: ['site_manager'],
    x: 350,
    y: 200,
    formFields: []
};

// End stage
const completeStage = {
    id: crypto.randomUUID(),
    key: 'stage_complete',
    name: 'Completed',
    type: 'end',
    order: 3,
    maxHours: null,
    allowedRoles: [],
    x: 600,
    y: 200,
    formFields: []
};
```

### 3. Create Form Fields

```javascript
// Stage 1 form fields
const damageTypeField = {
    id: crypto.randomUUID(),
    field_key: 'damage_type',
    field_label: 'Type of Damage',
    field_type: 'dropdown',
    field_order: 1,
    is_required: true,
    field_options: {
        options: [
            { value: 'structural', label: 'Structural Damage' },
            { value: 'electrical', label: 'Electrical Issue' },
            { value: 'plumbing', label: 'Plumbing Problem' }
        ]
    },
    page: 1,
    page_title: 'Damage Information'
};

const descriptionField = {
    id: crypto.randomUUID(),
    field_key: 'description',
    field_label: 'Description',
    field_type: 'long',
    field_order: 2,
    is_required: true,
    placeholder: 'Describe the damage in detail',
    page: 1
};

const photoField = {
    id: crypto.randomUUID(),
    field_key: 'photos',
    field_label: 'Photos',
    field_type: 'file',
    field_order: 3,
    is_required: false,
    validation_rules: {
        fileTypes: ['.jpg', '.png'],
        maxFileSize: 10485760 // 10MB
    },
    page: 1
};

// Add to stage
startStage.formFields = [damageTypeField, descriptionField, photoField];
```

### 4. Create Actions

```javascript
// Forward action: Report -> Review
const submitAction = {
    id: crypto.randomUUID(),
    fromStageId: startStage.id,
    toStageId: reviewStage.id,
    name: 'Submit Report',
    type: 'forward',
    buttonLabel: 'Submit for Review',
    buttonColor: '#007bff',
    allowedRoles: ['field_inspector'],
    requiresConfirmation: true,
    confirmationMessage: 'Are you sure you want to submit this report?'
};

// Edit action: Modify existing report in Review stage
const editAction = {
    id: crypto.randomUUID(),
    fromStageId: reviewStage.id,
    toStageId: reviewStage.id, // Same stage
    name: 'Edit Report',
    type: 'edit',
    buttonLabel: 'Edit Details',
    buttonColor: '#ffc107',
    allowedRoles: ['site_manager'],
    editableFields: [damageTypeField.id, descriptionField.id] // Can edit these fields
};

// Approve action: Review -> Complete
const approveAction = {
    id: crypto.randomUUID(),
    fromStageId: reviewStage.id,
    toStageId: completeStage.id,
    name: 'Approve',
    type: 'forward',
    buttonLabel: 'Approve & Complete',
    buttonColor: '#28a745',
    allowedRoles: ['site_manager'],
    requiresConfirmation: true,
    confirmationMessage: 'Approve this report and mark as complete?'
};

// Reject action: Review -> Report (back to start)
const rejectAction = {
    id: crypto.randomUUID(),
    fromStageId: reviewStage.id,
    toStageId: startStage.id,
    name: 'Reject',
    type: 'backward',
    buttonLabel: 'Send Back for Revision',
    buttonColor: '#dc3545',
    allowedRoles: ['site_manager'],
    formFields: [
        {
            id: crypto.randomUUID(),
            field_key: 'rejection_reason',
            field_label: 'Reason for Rejection',
            field_type: 'long',
            field_order: 1,
            is_required: true
        }
    ]
};
```

## Complete Export Format

### What to Export for 100% Replication

To fully replicate a workflow, export this structure:

```javascript
const completeWorkflowExport = {
    // 1. Workflow metadata
    workflow: {
        id: 'uuid',
        project_id: 'uuid',
        name: 'string',
        description: 'string',
        workflow_type: 'incident' | 'survey' | 'other',
        marker_color: '#hex',
        icon_config: {
            icon: 'string',
            color: '#hex',
            size: number
        },
        is_active: boolean,
        locationUpdateRoles: ['role-uuid-1', 'role-uuid-2'],
        assignmentRoles: ['role-uuid-1'],
        selfAssignmentRoles: ['role-uuid-1']
    },

    // 2. All stages with complete form data
    stages: [
        {
            id: 'uuid',
            key: 'stage_key',
            name: 'Stage Name',
            type: 'start' | 'intermediate' | 'end',
            order: number,
            maxHours: number,
            allowedRoles: ['role-uuid-1', 'role-uuid-2'],
            x: number, // Canvas position
            y: number, // Canvas position
            visual_config: {
                color: '#hex',
                icon: 'string'
            },

            // Form fields for this stage
            formFields: [
                {
                    id: 'uuid',
                    field_key: 'unique_key',
                    field_label: 'Display Label',
                    field_type: 'short' | 'long' | 'dropdown' | 'multiple' | 'smart_dropdown' | 'date' | 'file' | 'number' | 'email' | 'custom_table_selector',
                    field_order: number,
                    is_required: boolean,
                    placeholder: 'string',
                    help_text: 'string',
                    validation_rules: {
                        required: boolean,
                        minLength: number,
                        maxLength: number,
                        min: number,
                        max: number,
                        pattern: 'regex',
                        fileTypes: ['string'],
                        maxFileSize: number,
                        minSelections: number,
                        maxSelections: number
                    },
                    field_options: {
                        // For dropdown/multiple
                        options: [
                            { value: 'string', label: 'string' }
                        ],

                        // For smart_dropdown
                        source_field: 'field_key',
                        source_stage_id: 'uuid',
                        mappings: [
                            {
                                when: 'condition',
                                then: 'action',
                                field_mappings: [
                                    {
                                        source_key: 'string',
                                        target_key: 'string'
                                    }
                                ]
                            }
                        ],

                        // For custom_table_selector
                        custom_table_id: 'uuid',
                        display_field: 'string',
                        value_field: 'string'
                    },
                    conditional_logic: {
                        show_if: {
                            field_key: 'string',
                            operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than',
                            value: any
                        }
                    },
                    page: number,
                    page_title: 'string'
                }
            ]
        }
    ],

    // 3. All actions with form data
    actions: [
        {
            id: 'uuid',
            fromStageId: 'stage-uuid',
            toStageId: 'stage-uuid',
            name: 'Action Name',
            type: 'forward' | 'backward' | 'jump' | 'edit',
            buttonLabel: 'Button Text',
            buttonColor: '#hex',
            allowedRoles: ['role-uuid-1', 'role-uuid-2'],
            conditions: {
                // Conditional action logic
                field_key: 'string',
                operator: 'string',
                value: any
            },
            requiresConfirmation: boolean,
            confirmationMessage: 'string',

            // Form fields for this action
            formFields: [
                // Same structure as stage formFields
            ],

            // For edit actions: which fields can be edited
            editableFields: ['field-uuid-1', 'field-uuid-2']
        }
    ],

    // 4. Metadata
    version: number,
    exportedAt: 'ISO 8601 timestamp',
    exportedBy: 'user-uuid'
};
```

### Import Process

To import this workflow into a new system:

1. **Create Workflow Record**
   - Insert into `workflows` table
   - Generate new UUID or preserve if compatible

2. **Create Stages**
   - For each stage in export:
     - Insert into `workflow_stages` table
     - Preserve stage IDs for action references

3. **Create Forms and Fields**
   - For each stage with formFields:
     - Create `forms` record
     - Create `form_fields` records for each field
     - Link form to stage via `initial_form_id`

4. **Create Actions**
   - For each action in export:
     - Insert into `workflow_actions` table
     - Map `fromStageId` and `toStageId` to imported stages
     - If action has formFields:
       - Create `forms` record
       - Create `form_fields` records
       - Link form to action via `form_id`

5. **Create Editable Fields Mappings**
   - For edit actions with editableFields:
     - Insert into `action_editable_fields` table

6. **Create Smart Dropdown Mappings**
   - For smart_dropdown fields with mappings:
     - Insert into `field_mappings` table (if exists)

## Key Features to Replicate

### 1. Persistent UUIDs
All entities must have stable UUIDs throughout editing. The LocalStateManager uses `crypto.randomUUID()` to generate these.

### 2. Deletion Tracking
When updating existing workflows, track deletions:
- `deletedStages` - Stages removed from workflow
- `deletedActions` - Actions removed
- `deletedQuestions` - Form fields removed
- `deletedMappings` - Smart dropdown mappings removed

This ensures database cleanup on save.

### 3. Customer Data Preservation
Before destructive operations, check for active `workflow_instances`:
- If active instances exist: Use UPDATE approach
- If no active instances: Safe to delete and recreate

### 4. Form Relationships
Forms are separate entities shared between:
- Stages (initial form)
- Actions (transition form)

This allows form reuse and separate management.

### 5. Role-Based Access
Multiple role arrays control access:
- `workflow.locationUpdateRoles` - Who can update location
- `workflow.assignmentRoles` - Who can assign instances
- `workflow.selfAssignmentRoles` - Who can self-assign
- `stage.allowedRoles` - Who can view/access stage
- `action.allowedRoles` - Who can execute action

### 6. Visual State
Canvas positions (`x`, `y`) are stored for visual workflow builder but not critical for workflow logic.

### 7. Action Types
- **Forward**: Progress to next stage
- **Backward**: Return to previous stage
- **Jump**: Skip to specific stage
- **Edit**: Modify data without changing stage

Edit actions use `editableFields` to specify which fields can be modified.

## Critical Implementation Notes

1. **UUID Stability**: Never regenerate UUIDs during editing - they must remain stable
2. **Deletion Tracking**: Always track deletions in Sets for database cleanup
3. **Customer Protection**: Always check for active instances before deleting
4. **Form References**: Use form IDs, not inline form definitions
5. **Field Keys**: `field_key` must be unique within a workflow for data flow
6. **Order Preservation**: `stage_order` and `field_order` are critical for display
7. **Validation Rules**: Store as JSON objects for flexibility
8. **Multi-page Forms**: `page` and `page_title` enable form pagination

## Testing Workflow Export

To test if your export is complete:

1. Export workflow from source system
2. Import to new system
3. Verify:
   - All stages appear with correct names, types, and orders
   - All actions connect correct stages
   - All form fields display correctly
   - Role restrictions work correctly
   - Smart dropdowns populate from correct sources
   - Edit actions show correct editable fields
   - Conditional logic functions properly
   - File uploads accept correct file types
   - Validation rules enforce correctly

## Migration from Legacy Builder

If migrating from the old workflow builder:

1. Map old data structures to new format
2. Convert old field types to new field types
3. Migrate form data to separate `forms` table
4. Create `action_editable_fields` records for edit actions
5. Update role references to new role system
6. Test thoroughly before production deployment

## Conclusion

The workflow builder is a sophisticated system requiring careful handling of:
- Persistent identifiers
- Deletion tracking
- Customer data preservation
- Form relationships
- Role-based access control

Complete replication requires exporting all entities with their relationships intact, preserving UUIDs, and maintaining referential integrity across stages, actions, forms, and fields.
