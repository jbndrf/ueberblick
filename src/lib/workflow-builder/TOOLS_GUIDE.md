# Workflow Builder Tools Guide

This document explains the mental model for tools in the workflow builder and provides guidance for creating new tool types.

## Core Concepts

### What is a Tool?

A **tool** is an action that can be attached to a workflow. Tools define what happens when a participant interacts with the workflow - collecting data, editing fields, sending notifications, etc.

### The Two Attachment Points

Tools can be attached to two different entities, and this fundamentally changes how they behave:

```
WORKFLOW
├── Stages (where participants "are")
│   └── Stage Tools (independent actions at this stage)
│
└── Connections (transitions between stages)
    └── Connection Tools (part of the transition action)
```

#### Connection-Attached Tools

When a tool is attached to a **connection**:
- It's part of a single transition action
- Multiple tools on one connection run together (sequentially or in parallel)
- The **connection** defines the button appearance and allowed roles
- Tool inherits `allowed_roles` and `visual_config` from the connection
- User sees ONE button for the entire connection (not per-tool)

**Example:** A "Submit Report" connection might have:
- Form Tool (collects data)
- Notification Tool (sends email to supervisor)
- Both triggered by clicking "Submit Report" button

#### Stage-Attached Tools

When a tool is attached to a **stage**:
- It's an independent action available at that stage
- Each tool has its OWN button, roles, and visual config
- User sees MULTIPLE buttons (one per tool)
- Stage's `visible_to_roles` controls who SEES the stage data
- Tool's `allowed_roles` controls who can USE that specific tool

**Example:** At a "Review" stage:
- Edit Tool: "Update Location" (only managers)
- Edit Tool: "Add Notes" (anyone)
- Each appears as a separate button

## The Inheritance Rule

One simple rule governs both button config AND role access:

| Tool attached to | Button Config Source | Allowed Roles Source |
|------------------|---------------------|---------------------|
| **Connection** | `connection.visual_config` | `connection.allowed_roles` |
| **Stage** | `tool.visual_config` | `tool.allowed_roles` |

### Runtime Helper

```typescript
function getToolConfig(tool: AnyTool) {
  if (tool.connection_id) {
    const connection = getConnection(tool.connection_id);
    return {
      allowed_roles: connection.allowed_roles,
      visual_config: connection.visual_config
    };
  } else {
    return {
      allowed_roles: tool.allowed_roles,
      visual_config: tool.visual_config
    };
  }
}
```

## Creating a New Tool Type

### Step 1: Define the Database Schema

Create a migration in `pb/pb_migrations/`:

```javascript
migrate((app) => {
  const workflowConnections = app.findCollectionByNameOrId("workflow_connections");
  const workflowStages = app.findCollectionByNameOrId("workflow_stages");
  const rolesId = app.findCollectionByNameOrId("roles").id;

  const toolsMyNewTool = new Collection({
    type: "base",
    name: "tools_my_new_tool",
    fields: [
      // Parent attachment (mutually exclusive)
      { name: "connection_id", type: "relation", collectionId: workflowConnections.id, maxSelect: 1 },
      { name: "stage_id", type: "relation", collectionId: workflowStages.id, maxSelect: 1 },

      // Tool-specific config
      { name: "name", type: "text", required: true, max: 255 },
      { name: "my_tool_config", type: "json" },

      // Stage-attached tools need their own config (ignored for connection tools)
      { name: "allowed_roles", type: "relation", collectionId: rolesId, maxSelect: 99 },
      { name: "visual_config", type: "json" },

      // Timestamps
      { name: "created", type: "autodate", onCreate: true },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  });
  app.save(toolsMyNewTool);
});
```

### Step 2: Define TypeScript Types

Add to `src/lib/workflow-builder/types.ts`:

```typescript
export interface ToolsMyNewTool {
  id: string;
  connection_id?: string;
  stage_id?: string;
  name: string;
  my_tool_config?: MyToolConfig;
  /**
   * Allowed roles for this tool.
   * - If connection_id is set: IGNORED (inherited from connection.allowed_roles)
   * - If stage_id is set: USED (defines who can use this tool)
   */
  allowed_roles?: string[];
  /**
   * Visual/button configuration for this tool.
   * - If connection_id is set: IGNORED (inherited from connection.visual_config)
   * - If stage_id is set: USED (defines the button appearance)
   */
  visual_config?: VisualConfig;
}
```

### Step 3: Add State Management

Update `src/lib/workflow-builder/state.svelte.ts`:

```typescript
// Add to tracked collections
myNewTools = $state<TrackedMyNewTool[]>([]);

// Add creation method
addMyNewTool(target: { connectionId: string } | { stageId: string }): ToolsMyNewTool {
  const isStageAttached = 'stageId' in target;

  const newTool: ToolsMyNewTool = {
    id: generateId(),
    connection_id: 'connectionId' in target ? target.connectionId : undefined,
    stage_id: isStageAttached ? target.stageId : undefined,
    name: 'My New Tool',
    // Stage-attached tools need their own config
    ...(isStageAttached && {
      allowed_roles: [],
      visual_config: {
        button_label: 'My Action',
        button_color: '#3b82f6'
      }
    })
  };

  this.myNewTools.push({
    data: newTool,
    status: 'new'
  });

  return newTool;
}
```

### Step 4: Create the Editor View

Create `src/routes/.../builder/right-sidebar/views/my-new-tool-editor/MyNewToolEditorView.svelte`:

```svelte
<script lang="ts">
  // Determine attachment type
  const isStageAttached = $derived(!!myTool.stage_id && !myTool.connection_id);
</script>

<div class="editor">
  <!-- Tool-specific configuration always shown -->
  <div class="config-section">
    <!-- Your tool's unique settings -->
  </div>

  {#if isStageAttached}
    <!-- Stage tools: Show button config + roles -->
    <div class="button-config">
      <!-- Button label, color, confirmation -->
    </div>
    <div class="roles-config">
      <!-- Role selector -->
    </div>
  {:else}
    <!-- Connection tools: Show inheritance notice -->
    <div class="inheritance-notice">
      <p>This tool inherits button appearance and roles from the connection.</p>
    </div>
  {/if}
</div>
```

### Step 5: Register the Tool

Update `src/lib/workflow-builder/tools/registry.ts`:

```typescript
export const TOOL_REGISTRY: ToolDefinition[] = [
  // ... existing tools
  {
    type: 'my_new_tool',
    label: 'My New Tool',
    description: 'Does something useful',
    icon: MyIcon,
    attachableTo: ['connection', 'stage'], // or just ['connection'] or ['stage']
    defaultConfig: {}
  }
];
```

## Checklist for New Tools

Before submitting a new tool, verify:

- [ ] Database migration includes both `connection_id` and `stage_id` (nullable, mutually exclusive)
- [ ] Database migration includes `allowed_roles` and `visual_config` fields
- [ ] TypeScript interface documents when `allowed_roles` and `visual_config` are used
- [ ] State management `add*` method initializes config only for stage-attached tools
- [ ] Editor view checks `isStageAttached` and shows appropriate UI
- [ ] Editor view shows inheritance notice for connection-attached tools
- [ ] Tool is registered in the registry with correct `attachableTo` values

## Visual Reference

### Connection Tool Flow
```
User clicks connection button
         │
         ▼
┌─────────────────┐
│   Connection    │
│ ─────────────── │
│ allowed_roles   │◄── Who can click
│ visual_config   │◄── Button appearance
└────────┬────────┘
         │
         ▼
┌─────────────────┐    ┌─────────────────┐
│   Form Tool     │ +  │ Notification    │  (all run together)
│ (inherits)      │    │ Tool (inherits) │
└─────────────────┘    └─────────────────┘
```

### Stage Tool Flow
```
User at Stage X sees multiple buttons:

┌─────────────────┐
│  Stage X        │
│ ─────────────── │
│ visible_to_roles│◄── Who SEES the stage
└─────────────────┘
         │
         ├─────────────────────────────────┐
         ▼                                 ▼
┌─────────────────┐              ┌─────────────────┐
│  Edit Tool A    │              │  Edit Tool B    │
│ ─────────────── │              │ ─────────────── │
│ allowed_roles   │◄── Own       │ allowed_roles   │◄── Own
│ visual_config   │◄── Own       │ visual_config   │◄── Own
│ [Edit Location] │              │ [Add Notes]     │
└─────────────────┘              └─────────────────┘
      Button 1                        Button 2
```

## Common Mistakes to Avoid

1. **Don't show role/button config for connection tools** - They inherit from the connection
2. **Don't forget to initialize config for stage tools** - They need default values
3. **Don't mix up stage visibility and tool access** - `visible_to_roles` on stage is for viewing data, `allowed_roles` on tool is for performing actions
4. **Don't create separate buttons for connection tools** - One connection = one button, regardless of how many tools are attached
