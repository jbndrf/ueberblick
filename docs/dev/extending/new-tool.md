# Adding a New Tool Type to the Workflow Builder

What you will build: A new workflow tool type that participants can interact with, including its database schema, TypeScript types, state management, editor UI, and registry entry.

## Files to Touch

| File | Purpose |
|------|---------|
| `pb/pb_migrations/17XXXXXXXX_add_tools_my_tool.js` | Database collection |
| `src/lib/workflow-builder/types.ts` | TypeScript interface + tracked type alias |
| `src/lib/workflow-builder/tools/types.ts` | Tool config interface + union update |
| `src/lib/workflow-builder/tools/schemas.ts` | Zod validation schema |
| `src/lib/workflow-builder/tools/registry.ts` | Register tool definition |
| `src/lib/workflow-builder/tools/index.ts` | Barrel export |
| `src/lib/workflow-builder/state.svelte.ts` | Tracked collection + CRUD methods |
| `src/lib/workflow-builder/save.ts` | Include in batch save payload |
| `builder/context-sidebar/context.ts` | Selection context type + factory |
| `builder/right-sidebar/views/my-tool-editor/` | Editor view component(s) |
| `builder/right-sidebar/RightSidebar.svelte` | Wire view into sidebar switcher |

## The Inheritance Rule

This table governs both button config and role access for all tools:

| Tool attached to | Button Config Source | Allowed Roles Source |
|------------------|---------------------|---------------------|
| **Connection** | `connection.visual_config` | `connection.allowed_roles` |
| **Stage** | `tool.visual_config` | `tool.allowed_roles` |

Connection-attached tools inherit everything from the connection and render as one button. Stage-attached tools each get their own button, roles, and visual config.

---

## Step 1: Database Migration

Create `pb/pb_migrations/17XXXXXXXX_add_tools_my_tool.js`:

```javascript
migrate((app) => {
  const workflowConnections = app.findCollectionByNameOrId("workflow_connections");
  const workflowStages = app.findCollectionByNameOrId("workflow_stages");
  const rolesId = app.findCollectionByNameOrId("roles").id;

  const toolsMyTool = new Collection({
    type: "base",
    name: "tools_my_tool",
    fields: [
      // Parent attachment (mutually exclusive -- set one or the other)
      new Field({ name: "connection_id", type: "relation", collectionId: workflowConnections.id, maxSelect: 1 }),
      new Field({ name: "stage_id", type: "relation", collectionId: workflowStages.id, maxSelect: 1 }),

      // Tool-specific config
      new Field({ name: "name", type: "text", required: true, max: 255 }),
      new Field({ name: "my_tool_config", type: "json" }),

      // Stage-attached tools need their own config (ignored when connection_id is set)
      new Field({ name: "allowed_roles", type: "relation", collectionId: rolesId, maxSelect: 99 }),
      new Field({ name: "visual_config", type: "json" }),

      // Timestamps
      new Field({ name: "created", type: "autodate", onCreate: true }),
      new Field({ name: "updated", type: "autodate", onCreate: true, onUpdate: true }),
    ],
  });
  app.save(toolsMyTool);
});
```

Field properties are top-level in PocketBase v0.35+. Do not nest them in `options`.

---

## Step 2: TypeScript Types

### 2a. Data interface in `src/lib/workflow-builder/types.ts`

Add the interface alongside `ToolsEdit`, `ToolsAutomation`, etc:

```typescript
export interface ToolsMyTool {
  id: string;
  connection_id?: string;
  stage_id?: string;
  name: string;
  my_tool_config?: {
    someSetting: string;
  };
  /**
   * Allowed roles for this tool.
   * - If connection_id is set: IGNORED (inherited from connection.allowed_roles)
   * - If stage_id is set: USED (defines who can use this tool)
   */
  allowed_roles?: string[];
  /**
   * Visual/button configuration.
   * - If connection_id is set: IGNORED (inherited from connection.visual_config)
   * - If stage_id is set: USED (defines button appearance)
   */
  visual_config?: VisualConfig;
}
```

Add the tracked type alias at the bottom with the others:

```typescript
export type TrackedMyTool = TrackedItem<ToolsMyTool>;
```

### 2b. Tool config in `src/lib/workflow-builder/tools/types.ts`

Add a config interface and include it in the `ToolConfig` union:

```typescript
export interface MyToolConfig {
  toolType: 'my_tool';
  buttonLabel: string;
}

// Update the union:
export type ToolConfig =
  | FormToolConfig
  | EditToolConfig
  | AutomationToolConfig
  | FieldTagToolConfig
  | MyToolConfig;  // <-- add here
```

### 2c. Zod schema in `src/lib/workflow-builder/tools/schemas.ts`

```typescript
export const myToolConfigSchema = z.object({
  toolType: z.literal('my_tool'),
  buttonLabel: z.string().min(1).max(50)
});

// Add to the discriminated union:
export const toolConfigSchema = z.discriminatedUnion('toolType', [
  formToolConfigSchema,
  editToolConfigSchema,
  myToolConfigSchema   // <-- add here
]);

// Add to getToolConfigSchema():
const schemas: Record<string, z.ZodType> = {
  form: formToolConfigSchema,
  edit: editToolConfigSchema,
  my_tool: myToolConfigSchema   // <-- add here
};
```

### 2d. Barrel export in `src/lib/workflow-builder/tools/index.ts`

Add your new type and schema to the existing exports:

```typescript
export type { MyToolConfig } from './types';
export { myToolConfigSchema } from './schemas';
export { myTool } from './registry';
```

---

## Step 3: Register in the Tool Registry

Update `src/lib/workflow-builder/tools/registry.ts`. Follow the pattern of the existing tools:

```typescript
import { MyIcon } from 'lucide-svelte';

const myTool: ToolDefinition = {
  toolType: 'my_tool',
  displayName: 'My Tool',
  description: 'Does something useful for participants',
  icon: MyIcon,
  attachableTo: ['connection', 'stage'],  // or a subset like ['stage'] or ['global']
  defaultColor: '#10B981'
};

toolRegistry.register(myTool);

export { myTool };
```

The `attachableTo` array controls where the tool appears in the UI tool picker:

- `'connection'` -- shown when adding tools to a connection (transition)
- `'stage'` -- shown when adding tools to a stage (independent action)
- `'global'` -- shown in the global tools panel (applies to all stages)

---

## Step 4: State Management

Update `src/lib/workflow-builder/state.svelte.ts`. Follow the pattern used by `editTools`.

### 4a. Add tracked collection

```typescript
// In the WorkflowBuilderState class body, add:
myTools = $state<TrackedMyTool[]>([]);

// Add to the derived visible items:
visibleMyTools = $derived(this.myTools.filter((t) => t.status !== 'deleted'));

// Add to the isDirty derived (append to the existing || chain):
// ... || this.myTools.some((t) => t.status !== 'unchanged')
```

### 4b. Add CRUD methods

```typescript
addMyTool(target: { connectionId: string } | { stageId: string }): ToolsMyTool {
  const isStageAttached = 'stageId' in target;

  const newTool: ToolsMyTool = {
    id: generateId(),
    connection_id: 'connectionId' in target ? target.connectionId : undefined,
    stage_id: isStageAttached ? target.stageId : undefined,
    name: 'My Tool',
    my_tool_config: { someSetting: '' },
    ...(isStageAttached && {
      allowed_roles: [],
      visual_config: {
        button_label: 'My Action',
      }
    })
  };

  this.myTools.push({ data: newTool, status: 'new' });
  return newTool;
}

updateMyTool(id: string, updates: Partial<ToolsMyTool>) {
  const tool = this.myTools.find((t) => t.data.id === id);
  if (!tool) return;

  Object.assign(tool.data, updates);

  if (tool.status === 'unchanged') {
    if (!deepEqual(tool.data, tool.original)) {
      tool.status = 'modified';
    }
  }
}

deleteMyTool(id: string) {
  const tool = this.myTools.find((t) => t.data.id === id);
  if (!tool) return;

  if (tool.status === 'new') {
    this.myTools = this.myTools.filter((t) => t.data.id !== id);
  } else {
    tool.status = 'deleted';
  }
}

getMyToolById(id: string): TrackedMyTool | undefined {
  return this.myTools.find((t) => t.data.id === id);
}

getMyToolsForConnection(connectionId: string): TrackedMyTool[] {
  return this.visibleMyTools.filter((t) => t.data.connection_id === connectionId);
}

getMyToolsForStage(stageId: string): TrackedMyTool[] {
  return this.visibleMyTools.filter((t) => t.data.stage_id === stageId);
}
```

### 4c. Hook into lifecycle methods

Add entries to these three existing methods:

**`initFromServer`** -- load from server data:
```typescript
this.myTools = (data.myTools || []).map((t) => ({
  data: t,
  status: 'unchanged' as ItemStatus,
  original: structuredClone(t)
}));
```

**`getChanges`** -- include in the change payload:
```typescript
myTools: {
  new: this.myTools.filter((t) => t.status === 'new').map((t) => $state.snapshot(t.data)),
  modified: this.myTools.filter((t) => t.status === 'modified').map((t) => $state.snapshot(t.data)),
  deleted: this.myTools.filter((t) => t.status === 'deleted').map((t) => t.data.id)
}
```

**`markAsSaved`** -- reset after save:
```typescript
this.myTools = this.myTools.filter((t) => t.status !== 'deleted');
for (const tool of this.myTools) {
  tool.status = 'unchanged';
  tool.original = $state.snapshot(tool.data);
}
```

### 4d. Handle cascade deletion

In `deleteStage` and `deleteConnection`, add cleanup logic for your tool, following the pattern used for forms and edit tools:

```typescript
// In deleteStage():
const relatedMyTools = this.myTools.filter((t) => t.data.stage_id === id);
for (const tool of relatedMyTools) {
  this.deleteMyTool(tool.data.id);
}

// In deleteConnection():
const relatedMyTools = this.myTools.filter((t) => t.data.connection_id === id);
for (const tool of relatedMyTools) {
  this.deleteMyTool(tool.data.id);
}
```

---

## Step 5: Save Logic

Update `src/lib/workflow-builder/save.ts` to include your tool in the batch. Add a new section after the existing tool saves:

```typescript
// 7. My Tools
for (const tool of changes.myTools.new) {
  batch.collection('tools_my_tool').create(tool);
}
for (const tool of changes.myTools.modified) {
  batch.collection('tools_my_tool').update(tool.id, tool);
}
for (const toolId of changes.myTools.deleted) {
  batch.collection('tools_my_tool').delete(toolId);
}
```

Also update the `hasChanges` check to include:

```typescript
changes.myTools.new.length > 0 ||
changes.myTools.modified.length > 0 ||
changes.myTools.deleted.length > 0
```

---

## Step 6: Selection Context

Update `builder/context-sidebar/context.ts` to add your tool's selection context:

```typescript
// Add to SelectionContext union:
| { type: 'myTool'; myToolId: string; attachedTo: EditToolContextData['attachedTo'] }

// Add factory method:
myTool: (myToolId: string, attachedTo: EditToolContextData['attachedTo']): SelectionContext => ({
  type: 'myTool',
  myToolId,
  attachedTo
}),

// Add type guard:
export function isMyToolContext(
  ctx: SelectionContext
): ctx is Extract<SelectionContext, { type: 'myTool' }> {
  return ctx.type === 'myTool';
}
```

---

## Step 7: Editor View

Create `builder/right-sidebar/views/my-tool-editor/MyToolEditorView.svelte`:

```svelte
<script lang="ts">
  import { X } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import type { ToolsMyTool } from '$lib/workflow-builder';

  type Props = {
    tool: ToolsMyTool;
    onNameChange?: (name: string) => void;
    onUpdate?: (updates: Partial<ToolsMyTool>) => void;
    onDelete?: () => void;
    onClose?: () => void;
  };

  let { tool, onNameChange, onUpdate, onDelete, onClose }: Props = $props();

  const isStageAttached = $derived(!!tool.stage_id && !tool.connection_id);

  let name = $state(tool.name);
  let currentId = $state(tool.id);

  $effect(() => {
    if (tool.id !== currentId) {
      currentId = tool.id;
      name = tool.name;
    }
  });

  function handleNameBlur() {
    if (name !== tool.name) {
      onNameChange?.(name);
    }
  }
</script>

<div class="flex h-full flex-col">
  <!-- Header -->
  <div class="flex items-center justify-between border-b px-4 py-3">
    <h3 class="text-sm font-semibold">My Tool</h3>
    <Button variant="ghost" size="icon" onclick={onClose}>
      <X class="h-4 w-4" />
    </Button>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto p-4 space-y-4">
    <div class="space-y-2">
      <Label>Name</Label>
      <Input bind:value={name} onblur={handleNameBlur} />
    </div>

    <!-- Tool-specific config -->
    <div class="space-y-2">
      <Label>Some Setting</Label>
      <Input
        value={tool.my_tool_config?.someSetting || ''}
        oninput={(e) => onUpdate?.({
          my_tool_config: { ...tool.my_tool_config, someSetting: e.currentTarget.value }
        })}
      />
    </div>

    {#if isStageAttached}
      <div class="space-y-2">
        <Label>Button Label</Label>
        <Input
          value={tool.visual_config?.button_label || ''}
          oninput={(e) => onUpdate?.({
            visual_config: { ...tool.visual_config, button_label: e.currentTarget.value }
          })}
        />
      </div>
      <!-- Add role selector here as needed -->
    {:else}
      <div class="rounded-md bg-muted p-3 text-xs text-muted-foreground">
        Button appearance and roles are inherited from the parent connection.
      </div>
    {/if}
  </div>
</div>
```

Create the barrel export `builder/right-sidebar/views/my-tool-editor/index.ts`:

```typescript
export { default as MyToolEditorView } from './MyToolEditorView.svelte';
```

---

## Step 8: Wire Into the Sidebar Switcher

Update `builder/right-sidebar/RightSidebar.svelte`:

1. Import your view:
```typescript
import { MyToolEditorView } from './views/my-tool-editor';
```

2. Add a prop for the selected tool data:
```typescript
selectedMyTool?: ToolsMyTool | null;
```

3. Add a derived check:
```typescript
const isMyToolEditor = $derived(context.type === 'myTool');
```

4. Add the conditional render block (before the `{:else if hasSelection}` fallback):
```svelte
{:else if isMyToolEditor && selectedMyTool}
  <MyToolEditorView
    tool={selectedMyTool}
    onNameChange={(name) => onMyToolNameChange?.(selectedMyTool.id, name)}
    onUpdate={(updates) => onMyToolUpdate?.(selectedMyTool.id, updates)}
    onDelete={() => onMyToolDelete?.(selectedMyTool.id)}
    onClose={onMyToolClose}
  />
```

5. Update the `hasSelection` guard to exclude your context type:
```typescript
const hasSelection = $derived(
  context.type !== 'none' && context.type !== 'form' && context.type !== 'editTool'
  && context.type !== 'globalTools' && context.type !== 'automation'
  && context.type !== 'fieldTags' && context.type !== 'myTool'  // <-- add
  && !isStagePreview
);
```

---

## Checklist

Before submitting a new tool, verify:

- [ ] Database migration includes both `connection_id` and `stage_id` fields (nullable, mutually exclusive)
- [ ] Database migration includes `allowed_roles` and `visual_config` fields
- [ ] TypeScript interface documents when `allowed_roles` and `visual_config` are used vs inherited
- [ ] Tool config interface added to `tools/types.ts` and `ToolConfig` union updated
- [ ] Zod schema added to `tools/schemas.ts` and `toolConfigSchema` union updated
- [ ] Tool registered in `tools/registry.ts` with correct `attachableTo` values
- [ ] Barrel exports updated in `tools/index.ts`
- [ ] State management `add*` method initializes config only for stage-attached tools
- [ ] State management includes `initFromServer`, `getChanges`, and `markAsSaved` entries
- [ ] Cascade deletion handled in `deleteStage` and `deleteConnection`
- [ ] Save logic updated in `save.ts` with batch operations + `hasChanges` check
- [ ] Selection context type added to `context.ts` with factory + type guard
- [ ] Editor view checks `isStageAttached` and shows appropriate UI
- [ ] Editor view shows inheritance notice for connection-attached tools
- [ ] Right sidebar switcher wired up with correct conditional rendering
- [ ] `hasSelection` guard updated to exclude your context type
