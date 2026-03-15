# Workflow Builder

Developer documentation for the workflow builder system.

---

## Overview

The workflow builder is a visual editor for creating state-machine workflows. Users define:
- **Stages** - States in the workflow (start, intermediate, end)
- **Connections** - Transitions between stages with optional forms
- **Tools** - Forms and edit capabilities attached to stages/connections

```
+-------------------+     +-------------------+     +-------------------+
|      Start        | --> |     Review        | --> |      Done         |
|  (initial form)   |     |  (approve/reject) |     |   (end state)     |
+-------------------+     +-------------------+     +-------------------+
                                   |
                                   v
                          +-------------------+
                          |    Rejected       |
                          |   (end state)     |
                          +-------------------+
```

**Architecture layers:**
```
UI (Svelte + XYFlow)
         |
         v
State Management (WorkflowBuilderState)
         |
         v
Batch Save (PocketBase API)
         |
         v
Database (5 collections)
```

---

## Database Schema

Five PocketBase collections power the workflow builder:

```
workflows (existing)
  |
  +-- entry_allowed_roles --> roles (who can create new instances)
  |
  +-- workflow_stages
  |     +-- visible_to_roles --> roles
  |
  +-- workflow_connections
  |     +-- from_stage_id --> workflow_stages (null = entry connection)
  |     +-- to_stage_id --> workflow_stages
  |     +-- allowed_roles --> roles
  |
  +-- tools_forms
  |     +-- connection_id --> workflow_connections (optional)
  |     +-- stage_id --> workflow_stages (optional)
  |     +-- allowed_roles --> roles
  |     |
  |     +-- tools_form_fields
  |           +-- form_id --> tools_forms
  |
  +-- tools_edit
        +-- connection_id --> workflow_connections (optional)
        +-- stage_id --> workflow_stages (optional)
        +-- editable_fields --> tools_form_fields
        +-- allowed_roles --> roles
```

### workflow_stages

| Field | Type | Description |
|-------|------|-------------|
| id | auto | Primary key |
| workflow_id | relation | Parent workflow |
| stage_name | text | Display name |
| stage_type | select | `start`, `intermediate`, `end` |
| stage_order | number | Order for listing |
| position_x, position_y | number | Canvas coordinates |
| visible_to_roles | multi-relation | Who can see instances at this stage |
| visual_config | JSON | Future styling options |

### workflow_connections

| Field | Type | Description |
|-------|------|-------------|
| id | auto | Primary key |
| workflow_id | relation | Parent workflow |
| from_stage_id | relation (nullable) | Source stage. `null` = entry connection |
| to_stage_id | relation | Target stage |
| action_name | text | Internal identifier |
| allowed_roles | multi-relation | Who can trigger this connection |
| visual_config | JSON | `{ button_label, button_color, requires_confirmation, confirmation_message }` |

### tools_forms

| Field | Type | Description |
|-------|------|-------------|
| id | auto | Primary key |
| workflow_id | relation | Parent workflow |
| connection_id | relation (optional) | Attached to connection |
| stage_id | relation (optional) | Attached to stage |
| name | text | Form name |
| description | text | Form description |
| allowed_roles | multi-relation | Who can see/fill this form |

**Note:** A form belongs to either a connection OR a stage, not both.

### tools_form_fields

| Field | Type | Description |
|-------|------|-------------|
| id | auto | Primary key |
| form_id | relation | Parent form |
| field_label | text | Display label |
| field_type | select | See field types below |
| field_order | number | Order within page |
| page, page_title | number, text | Multi-page support |
| is_required | bool | Required field |
| placeholder, help_text | text | UI hints |
| validation_rules | JSON | Type-specific validation |
| field_options | JSON | Options for dropdowns |
| conditional_logic | JSON | Show/hide conditions |

**Field types:** `short_text`, `long_text`, `number`, `email`, `date`, `file`, `dropdown`, `multiple_choice`, `smart_dropdown`

### tools_edit

| Field | Type | Description |
|-------|------|-------------|
| id | auto | Primary key |
| connection_id | relation (optional) | Attached to connection |
| stage_id | relation (optional) | Attached to stage |
| editable_fields | multi-relation | Which fields can be edited |
| allowed_roles | multi-relation | Who can use this tool |

---

## Mental Model

### Stage Types

- **Start stage** - Entry point. Each workflow has exactly one. Auto-creates an entry connection for the initial form.
- **Intermediate stage** - Middle states where work happens.
- **End stage** - Terminal states. A workflow can have multiple end stages.

### Connection Types

1. **Progress connection** (`from_stage_id -> to_stage_id`)
   - Moves instance from one stage to another
   - Can have forms attached for data collection

2. **Edit connection / self-loop** (`from_stage_id == to_stage_id`)
   - Stays on the same stage
   - Typically has an edit tool to modify existing fields
   - Rendered as a loop above the node

3. **Entry connection** (`from_stage_id = null`)
   - Invisible connection attached to start stage
   - Holds the initial form for workflow creation
   - Not rendered in the canvas (filtered out)

### Role-Based Access

```
Stage.visible_to_roles     = who sees instances at this stage
Connection.allowed_roles   = who can trigger this connection
Tool.allowed_roles         = who sees this specific tool
                             (null/empty = inherit from parent)
```

---

## Access Control Model

The workflow builder implements a 4-layer access control model for secure role-based access.

### Layer 1: Project Membership (Base Requirement)

All access requires project membership:
```
participant.project_id = resource.project_id
```

### Layer 2: Structure Transparency

**These collections are visible to ALL project participants:**

| Collection | What's Visible |
|------------|----------------|
| `workflow_stages` | Stage names, types, visual config, positions |
| `workflow_instances` | Current stage, status, timestamps |

**Purpose:** Users can track progress and see where an instance is in the workflow.

### Layer 3: Role-Based Protection

**These collections have role-based visibility:**

| Collection | Visibility Rule |
|------------|-----------------|
| `workflow_connections` | `connection.allowed_roles` - only see transitions you can use |
| `tools_forms` | Stage-attached: `form.allowed_roles`; Connection-attached: `connection.allowed_roles` |
| `tools_form_fields` | Inherits from parent form |
| `tools_edit` | Stage-attached: `tool.allowed_roles`; Connection-attached: `connection.allowed_roles` |
| `workflow_instance_field_values` | READ: `stage_id.visible_to_roles`; CREATE: `current_stage.visible_to_roles` |
| `workflow_instance_tool_usage` | `instance.current_stage_id.visible_to_roles` (audit trail) |

**Key points:**
- **Connections** are protected - you only see action buttons for transitions you can trigger
- **Tools** use their OWN `allowed_roles` field (not the stage's `visible_to_roles`)
- **Field values CREATE** uses current stage visibility (allows transition form submission)
- **Field values READ** uses destination stage visibility (protects data afterward)
- **No creator bypass** - instance creators are treated like any other participant

### Layer 4: Action Permissions

| Permission | Field | Description |
|------------|-------|-------------|
| Create instances | `workflow.entry_allowed_roles` | Who can start new workflow instances |
| Trigger transitions | `connection.allowed_roles` | Who can move instances between stages |
| Update instances | `stage.visible_to_roles` | Who can update instance at current stage |

### Empty Array Convention

Empty arrays mean "ALL roles can access":
- `visible_to_roles = []` - All roles can see
- `allowed_roles = []` - All roles can execute
- `entry_allowed_roles = []` - All participants can create instances

### Entry Connection Role Sync

The `entry_allowed_roles` field on workflows is automatically synced from the entry connection's `allowed_roles` when saving in the workflow builder. This enables efficient PocketBase rule enforcement for instance creation.

### Visual Example

```
REPORTER VIEW (instance at Stage 3 - "Internal Review"):
+----------------------------------------------------------+
| Instance #123                                             |
| Current Stage: Internal Review (Stage 3 of 4)             |  <-- VISIBLE (structure)
| Status: Active                                            |
|                                                           |
| WORKFLOW PROGRESS:                                        |
| [x] Stage 1: Submit Report                                |  <-- VISIBLE (structure)
| [x] Stage 2: Initial Assessment                           |  <-- VISIBLE (structure)
| [>] Stage 3: Internal Review                              |  <-- VISIBLE (structure)
| [ ] Stage 4: Resolution                                   |  <-- VISIBLE (structure)
|                                                           |
| STAGE 1 - Submit Report:                                  |
|   Data: [hidden - role not in visible_to_roles]           |  <-- PROTECTED
|                                                           |
| STAGE 2 - Initial Assessment:                             |
|   Data: [hidden - role not in visible_to_roles]           |  <-- PROTECTED
|                                                           |
| STAGE 3 - Internal Review:                                |
|   Data: [hidden - role not in visible_to_roles]           |  <-- PROTECTED
|                                                           |
| Available Actions: (none)                                 |  <-- No connections visible
| "Waiting for authorized role to proceed"                  |
+----------------------------------------------------------+
```

The Reporter sees the workflow progress (stage names, current position) but:
- Cannot see any action buttons (connections filtered by `allowed_roles`)
- Cannot see field values from any stage (unless role is in `stage.visible_to_roles`)
- Cannot see tools (filtered by `tool.allowed_roles`)

### Access Control Summary Table

| Collection | Admin | Participant |
|------------|-------|-------------|
| `workflow_stages` | Full CRUD | Read all (transparent) |
| `workflow_connections` | Full CRUD | Read if role in `allowed_roles` |
| `workflow_instances` | Full CRUD | Read all; Create if role in `entry_allowed_roles`; Update if role in `current_stage.visible_to_roles` |
| `tools_forms` | Full CRUD | Read if role in `form.allowed_roles` or `connection.allowed_roles` |
| `tools_form_fields` | Full CRUD | Read (inherits from parent form) |
| `tools_edit` | Full CRUD | Read if role in `tool.allowed_roles` or `connection.allowed_roles` |
| `workflow_instance_field_values` | Full CRUD | Read/Update if role in `stage.visible_to_roles`; Create if role in `current_stage.visible_to_roles` |
| `workflow_instance_tool_usage` | Full CRUD | Read if role in `current_stage.visible_to_roles` |

---

## Tool Attachment System

Tools declare where they can be attached using `attachableTo`:

```typescript
interface ToolTypeDefinition {
  id: string;
  name: string;
  attachableTo: ('stage' | 'connection')[];
  // ...
}
```

### Current Tools

| Tool | attachableTo | Description |
|------|--------------|-------------|
| Form | `['connection']` | Data collection form |
| Edit | `['stage', 'connection']` | Edit existing fields |

### Helper Functions

```typescript
// Check if tool can attach to target
canAttachToStage(toolId: string): boolean
canAttachToConnection(toolId: string): boolean

// Get tools for target type
getStageTools(): ToolTypeDefinition[]
getConnectionTools(): ToolTypeDefinition[]
getToolsFor(target: 'stage' | 'connection'): ToolTypeDefinition[]
```

### Adding a New Tool

1. Define the tool in `src/lib/workflow-builder/tools/registry.ts`:
```typescript
{
  id: 'notification',
  name: 'Notification',
  icon: Bell,
  attachableTo: ['connection'],
  description: 'Send notification when triggered'
}
```

2. Add database collection if needed (migration file)

3. Add state management methods in `state.svelte.ts`

4. Update save logic in `save.ts`

---

## State Management

### Local-First Editing

Changes exist only in browser memory until the user clicks Save. This enables:
- Fast, responsive editing
- Multiple changes before save
- No partial/inconsistent database state

### Pre-Generated IDs

New items get IDs immediately (before database save):

```typescript
function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 15 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}
```

PocketBase accepts custom IDs in this format. This allows:
- Immediate use in relations (no temp ID mapping)
- Bidirectional references work immediately

### Status Tracking

Every item tracks its status:

```typescript
type ItemStatus = 'unchanged' | 'new' | 'modified' | 'deleted';

interface TrackedItem<T> {
  data: T;           // Current data
  status: ItemStatus;
  original?: T;      // For change detection
}
```

- `unchanged` - Loaded from DB, no changes
- `new` - Created locally, not in DB yet
- `modified` - Loaded from DB, then changed
- `deleted` - Marked for deletion (kept until save)

### WorkflowBuilderState Class

```typescript
class WorkflowBuilderState {
  // Tracked collections
  stages: TrackedStage[]
  connections: TrackedConnection[]
  forms: TrackedForm[]
  formFields: TrackedFormField[]
  editTools: TrackedEditTool[]

  // Derived
  isDirty: boolean              // Any changes?
  visibleStages: TrackedStage[] // Excludes deleted
  hasStartStage: boolean

  // Methods
  addStage(type, position)      // Auto-creates entry connection for start
  updateStage(id, updates)
  deleteStage(id, cascade)      // Cascade deletes connections + tools

  addConnection(from, to)
  addEntryConnection(stageId)   // from_stage_id = null
  updateConnection(id, updates)
  deleteConnection(id)          // Cascade deletes forms + tools

  addForm(target)               // { connectionId } or { stageId }
  addFormField(formId, type)
  addEditTool(target)           // { connectionId } or { stageId }

  getChanges()                  // Grouped by new/modified/deleted
  markAsSaved()                 // Reset after successful save
}
```

### Auto-Created Entry Connection

When a start stage is added, an entry connection is automatically created:

```typescript
addStage(type: StageType, position?: { x: number; y: number }) {
  // ... create stage ...

  // Auto-create entry connection for start stage
  if (type === 'start') {
    this.addEntryConnection(newStage.id);
  }

  return newStage;
}
```

---

## Data Flow

### 1. Load from Server

```
+page.server.ts
  |
  | Load workflow + stages + connections + forms + fields + editTools
  v
+page.svelte
  |
  | $effect: builderState.initFromServer(data)
  v
WorkflowBuilderState
  |
  | All items marked as 'unchanged'
  v
XYFlow nodes/edges created via stagesToNodes(), connectionsToEdges()
```

### 2. User Interactions

```
User drags node
  |
  v
XYFlow updates node position
  |
  v
onNodeDragStop: builderState.updateStage(id, { position_x, position_y })
  |
  v
Status changes: 'unchanged' -> 'modified'
  |
  v
isDirty becomes true
  |
  v
Save button activates
```

### 3. Canvas Integration

- Entry connections (`from_stage_id = null`) are filtered out - not rendered
- Self-loops render as curves above the node
- Nodes sync to state via `$effect`

```typescript
// Filter entry connections from visualization
function connectionsToEdges(connections: WorkflowConnection[]): Edge[] {
  return connections
    .filter((conn) => conn.from_stage_id !== null)
    .map((conn) => { /* ... */ });
}
```

### 4. Batch Save

```
User clicks Save
  |
  v
Sync node positions to state
  |
  v
state.getChanges() -> { stages: { new, modified, deleted }, ... }
  |
  v
Create PocketBase batch request (ordered by dependencies)
  1. Stages (no dependencies)
  2. Connections (depend on stages)
  3. Forms (depend on connections/stages)
  4. Form fields (depend on forms)
  5. Edit tools (depend on connections/stages/fields)
  |
  v
batch.send() -> atomic transaction
  |
  v
On success: state.markAsSaved()
  |
  v
All items reset to 'unchanged', deleted items removed
```

---

## Key Files Reference

### State Management
- `src/lib/workflow-builder/state.svelte.ts` - Main state class
- `src/lib/workflow-builder/types.ts` - TypeScript interfaces
- `src/lib/workflow-builder/utils.ts` - `generateId()`, `deepEqual()`
- `src/lib/workflow-builder/save.ts` - Batch save logic

### Tool System
- `src/lib/workflow-builder/tools/types.ts` - Tool type definitions
- `src/lib/workflow-builder/tools/registry.ts` - Tool registry

### UI Components
- `src/routes/.../builder/+page.svelte` - Main builder page
- `src/routes/.../builder/+page.server.ts` - Data loading
- `.../builder/StageNode.svelte` - Custom node component
- `.../builder/ActionEdge.svelte` - Custom edge component (handles self-loops)
- `.../builder/right-sidebar/` - Property panels

### Database
- `pb/pb_migrations/1768200000_create_workflow_builder_tables.js` - Schema migration
- `pb/pb_migrations/1768800000_add_workflow_entry_roles.js` - Add entry_allowed_roles field
- `pb/pb_migrations/1768800001_workflow_access_rules.js` - 4-layer access control rules
- `docs/db/workflow-related-tables.md` - Table documentation
