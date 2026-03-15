# Adding Panels/Editors to the Workflow Builder UI

What you will build: A new panel or editor view in the workflow builder's right sidebar, responding to selection context and interacting with the `WorkflowBuilderState` class.

## Layout Overview

The workflow builder has a three-column layout:

```
+-------------------+------------------+--------------------+
| Context Sidebar   | Canvas           | Right Sidebar      |
| (item lists)      | (node graph)     | (editor views)     |
+-------------------+------------------+--------------------+
```

- **Context sidebar** (left): Lists stages, connections, tools grouped by context. Clicking items updates the selection context.
- **Canvas** (center): Visual node graph with `@xyflow/svelte`. Clicking nodes/edges updates the selection context.
- **Right sidebar**: Shows a single editor view matching the current `SelectionContext`.

All files live under:
```
src/routes/(admin)/projects/[projectId]/workflows/[workflowId]/builder/
```

---

## Selection Context System

The right sidebar switches views based on a `SelectionContext` discriminated union defined in `builder/context-sidebar/context.ts`:

```typescript
export type SelectionContext =
  | { type: 'none' }
  | { type: 'stage'; stageId: string; stage: Node<StageData> }
  | { type: 'action'; actionId: string; action: Edge }
  | { type: 'field'; fieldId: string; field: FormFieldData; stageId: string }
  | { type: 'form'; formId: string; attachedTo: FormContextData['attachedTo'] }
  | { type: 'editTool'; editToolId: string; attachedTo: EditToolContextData['attachedTo'] }
  | { type: 'addTool'; attachedTo: AddToolContextData['attachedTo'] }
  | { type: 'globalTools' }
  | { type: 'automation'; automationId: string }
  | { type: 'fieldTags' };
```

Factory methods create context values:
```typescript
import { createContext } from './context-sidebar/context';

// Navigate to views:
createContext.none()                          // PreviewView (default)
createContext.stage(stageNode)                // StagePreviewView
createContext.action(edge)                    // PropertyView (edge panel)
createContext.form(formId, { type: 'connection', connectionId })  // FormEditorView
createContext.editTool(toolId, { type: 'stage', stageId })        // EditToolEditorView
createContext.globalTools()                   // GlobalToolsPanel
createContext.automation(automationId)        // AutomationEditorView
createContext.fieldTags()                     // FieldTagEditorView
```

---

## State Management

All workflow builder state flows through `WorkflowBuilderState` in `src/lib/workflow-builder/state.svelte.ts`.

### Reading State

```typescript
// Visible items (excludes soft-deleted)
state.visibleStages          // TrackedStage[]
state.visibleConnections     // TrackedConnection[]
state.visibleForms           // TrackedForm[]
state.visibleFormFields      // TrackedFormField[]
state.visibleEditTools       // TrackedEditTool[]
state.visibleAutomations     // TrackedAutomation[]

// Lookups
state.getStageById(id)
state.getConnectionById(id)
state.getFormById(id)
state.getFormsForConnection(connectionId)
state.getFormsForStage(stageId)
state.getFieldsForForm(formId)
state.getEditToolsForStage(stageId)
state.getEditToolsForConnection(connectionId)
state.getGlobalEditTools()
state.getNonGlobalEditToolsForStage(stageId)
state.getAncestorFormFields(connectionId)
state.getAncestorFormFieldsForStage(stageId)
state.getAllFormFields()
state.getAutomationById(id)
state.getTagMapping(tagType)
```

### Modifying State

All mutations go through state methods. Status tracking (`unchanged` / `new` / `modified` / `deleted`) is handled automatically:

```typescript
// Stages
state.addStage('intermediate', { x: 200, y: 150 });
state.updateStage(id, { stage_name: 'Review' });
state.deleteStage(id, cascadeConnections);

// Connections
state.addConnection(fromStageId, toStageId);
state.updateConnection(id, { action_name: 'Approve' });
state.deleteConnection(id);

// Forms
state.addForm({ connectionId: 'conn-1' });
state.addForm({ stageId: 'stage-1' });
state.updateForm(id, { name: 'Report Form' });
state.deleteForm(id);

// Form Fields
state.addFormField(formId, 'short_text', rowIndex, 'full', page);
state.updateFormField(id, { field_label: 'Full Name' });
state.deleteFormField(id);

// Edit Tools
state.addEditTool({ connectionId: 'conn-1' });
state.addEditTool({ stageId: 'stage-1' });
state.addGlobalEditTool('form_fields');
state.addGlobalEditTool('location');
state.updateEditTool(id, { name: 'Update Location' });
state.deleteEditTool(id);

// Automations
state.addAutomation('on_transition');
state.updateAutomation(id, { name: 'Auto-close' });
state.deleteAutomation(id);

// Field Tags
state.setTagMapping('filterable', fieldId, { filterBy: 'field' });
state.updateTagMappingConfig('filterable', { filterBy: 'stage' });
state.getTagMapping('filterable');
```

### Dirty Tracking and Save

```typescript
state.isDirty  // boolean -- true if any tracked item has pending changes

// Get changes grouped by type and operation:
const changes = state.getChanges();
// changes.stages.new, changes.stages.modified, changes.stages.deleted
// changes.forms.new, changes.forms.modified, ...

// After successful save:
state.markAsSaved();
```

### Item Status

Every tracked item wraps a data object with status tracking:

```typescript
type ItemStatus = 'unchanged' | 'new' | 'modified' | 'deleted';

interface TrackedItem<T> {
  data: T;
  status: ItemStatus;
  original?: T; // snapshot from server, used for deep-equal change detection
}
```

---

## Existing View Structure

Each editor view lives in its own directory under `builder/right-sidebar/views/`:

```
right-sidebar/
  RightSidebar.svelte          # The view switcher
  index.ts                     # Barrel export
  views/
    preview/
      PreviewView.svelte       # Default view (no selection)
    properties/
      PropertyView.svelte      # Edge/connection property editor
      panels/
        EdgePropertyPanel.svelte
        StagePropertyPanel.svelte
        GlobalToolsPanel.svelte
      shared/
        ConnectedToolItem.svelte
        ButtonConfigPopover.svelte
        FieldList.svelte
        PropertySection.svelte
    form-editor/
      FormEditorView.svelte    # Form field designer
      FieldTypesPalette.svelte
      FieldCard.svelte
      FieldConfigPanel.svelte
      FormPreview.svelte
      SmartDropdownConfig.svelte
      EntitySelectorConfig.svelte
      index.ts
    edit-tool-editor/
      EditToolEditorView.svelte
      AncestorFieldsPanel.svelte
      AncestorFieldGroup.svelte
      AncestorFieldItem.svelte
      FieldSelectionPreview.svelte
      index.ts
    automation-editor/
      AutomationEditorView.svelte
      TriggerCard.svelte
      StepCard.svelte
      StepBuilder.svelte
      StepConfigPanel.svelte
      ConditionBuilder.svelte
      ActionBuilder.svelte
      ActionTypePalette.svelte
      index.ts
    field-tag-editor/
      FieldTagEditorView.svelte
      TagSlot.svelte
      index.ts
    stage-preview/
      StagePreviewView.svelte
      ParticipantPreview.svelte
      AddButtonPicker.svelte
      ButtonConfigPanel.svelte
      types.ts
      index.ts
```

---

## Adding a New Right Sidebar View

### Step 1: Create the View Component

Create a directory under `views/` with your main component:

```
right-sidebar/views/my-editor/
  MyEditorView.svelte
  index.ts
```

**`MyEditorView.svelte`:**
```svelte
<script lang="ts">
  import { X, Trash2 } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';

  import type { ToolsMyTool } from '$lib/workflow-builder';

  type Props = {
    tool: ToolsMyTool;
    onNameChange?: (name: string) => void;
    onDelete?: () => void;
    onClose?: () => void;
  };

  let { tool, onNameChange, onDelete, onClose }: Props = $props();

  // Sync local state from props (handle re-selection of different item)
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
  <!-- Header with close button -->
  <div class="flex items-center justify-between border-b px-4 py-3">
    <h3 class="text-sm font-semibold">My Editor</h3>
    <Button variant="ghost" size="icon" onclick={onClose}>
      <X class="h-4 w-4" />
    </Button>
  </div>

  <!-- Scrollable content area -->
  <div class="flex-1 overflow-y-auto p-4 space-y-4">
    <div class="space-y-2">
      <Label>Name</Label>
      <Input bind:value={name} onblur={handleNameBlur} />
    </div>

    <!-- Your editor-specific content here -->
  </div>

  <!-- Optional footer (e.g., delete button) -->
  <div class="border-t px-4 py-3">
    <Button variant="destructive" size="sm" onclick={onDelete}>
      <Trash2 class="mr-2 h-4 w-4" />
      Delete
    </Button>
  </div>
</div>
```

Key patterns from existing views:

- **Header**: Title + close button (X icon), with `border-b`.
- **Content**: `flex-1 overflow-y-auto p-4` for a scrollable body.
- **Local state sync**: Track `currentId` to reset local form state when a different item is selected.
- **Blur-based updates**: Use `onblur` to commit text changes to state (not `oninput`), avoiding excessive state updates.
- **Props are data + callbacks**: Views receive the data object and callback functions. They do not import the state class directly.

**`index.ts`:**
```typescript
export { default as MyEditorView } from './MyEditorView.svelte';
```

### Step 2: Add a Selection Context Type

Update `builder/context-sidebar/context.ts`:

```typescript
// 1. Add to the SelectionContext union:
| { type: 'myEditor'; myToolId: string }

// 2. Add a factory method:
myEditor: (myToolId: string): SelectionContext => ({
  type: 'myEditor',
  myToolId
}),

// 3. Add a type guard:
export function isMyEditorContext(
  ctx: SelectionContext
): ctx is Extract<SelectionContext, { type: 'myEditor' }> {
  return ctx.type === 'myEditor';
}
```

### Step 3: Wire Into RightSidebar.svelte

The right sidebar uses a chain of `{#if}/{:else if}` blocks to switch between views. The order matters -- more specific views come first, with `PreviewView` as the final fallback.

**`RightSidebar.svelte`:**

1. Import your view:
```typescript
import { MyEditorView } from './views/my-editor';
```

2. Add props for data and callbacks:
```typescript
// In the Props type:
selectedMyTool?: ToolsMyTool | null;
onMyToolNameChange?: (id: string, name: string) => void;
onMyToolDelete?: (id: string) => void;
onMyToolClose?: () => void;
```

3. Add a derived check:
```typescript
const isMyEditor = $derived(context.type === 'myEditor' && selectedMyTool != null);
```

4. Add the conditional render. Insert it before the `{:else if hasSelection}` fallback:
```svelte
{:else if isMyEditor && selectedMyTool}
  <MyEditorView
    tool={selectedMyTool}
    onNameChange={(name) => onMyToolNameChange?.(selectedMyTool.id, name)}
    onDelete={() => onMyToolDelete?.(selectedMyTool.id)}
    onClose={onMyToolClose}
  />
```

5. Exclude your context type from the generic `hasSelection` guard:
```typescript
const hasSelection = $derived(
  context.type !== 'none'
  && context.type !== 'form'
  && context.type !== 'editTool'
  && context.type !== 'globalTools'
  && context.type !== 'automation'
  && context.type !== 'fieldTags'
  && context.type !== 'myEditor'  // <-- add
  && !isStagePreview
);
```

6. If your view needs a wider sidebar, add it to the `wide` class condition:
```svelte
<aside class="right-sidebar" class:wide={isFormEditor || isEditToolEditor || isStagePreview || isMyEditor}>
```

The sidebar widths are:
- Default: `360px`
- Wide: `520px`
- Wide + palette expanded: `650px`

### Step 4: Connect From the Page Component

The builder page component (`builder/+page.svelte`) manages the selection context and passes props to `RightSidebar`. You need to:

1. Derive the selected tool data from state + context:
```typescript
const selectedMyTool = $derived.by(() => {
  if (selectionContext.type !== 'myEditor') return null;
  return state.getMyToolById(selectionContext.myToolId)?.data ?? null;
});
```

2. Pass it and the callbacks to `RightSidebar`:
```svelte
<RightSidebar
  context={selectionContext}
  selectedMyTool={selectedMyTool}
  onMyToolNameChange={(id, name) => state.updateMyTool(id, { name })}
  onMyToolDelete={(id) => {
    state.deleteMyTool(id);
    selectionContext = createContext.none();
  }}
  onMyToolClose={() => selectionContext = createContext.none()}
  ...
/>
```

3. Trigger the context from wherever the user initiates editing (e.g., clicking a tool button in a property panel or the context sidebar):
```typescript
function handleSelectMyTool(toolId: string) {
  selectionContext = createContext.myEditor(toolId);
}
```

---

## Adding a Context Sidebar Panel

The context sidebar (left) lists tools and items grouped by the current selection. Panels live in `builder/context-sidebar/panels/`.

Existing panels:
```
panels/
  DefaultPanel.svelte    # Shown when no stage/connection is selected
  StagePanel.svelte      # Tools for a selected stage
  ActionPanel.svelte     # Tools for a selected connection/action
  FieldPanel.svelte      # Field details for a selected form field
  AddToolPanel.svelte    # Tool picker for adding new tools
```

To add a panel, create a Svelte component and add it to `ContextSidebar.svelte`'s conditional chain. Use `toolRegistry` to show available tools:

```svelte
<script lang="ts">
  import { toolRegistry } from '$lib/workflow-builder/tools/registry';
  import ToolButton from '../shared/ToolButton.svelte';
  import ToolSection from '../shared/ToolSection.svelte';

  interface Props {
    stageId: string;
    tools: Array<{ id: string; name: string; toolType: string }>;
    onSelectTool: (toolId: string, toolType: string) => void;
    onAddTool: () => void;
  }

  let { stageId, tools, onSelectTool, onAddTool }: Props = $props();
</script>

<ToolSection title="My Tools" onAdd={onAddTool}>
  {#each tools as tool}
    {@const def = toolRegistry.get(tool.toolType)}
    <ToolButton
      label={tool.name}
      icon={def?.icon}
      color={def?.defaultColor}
      onclick={() => onSelectTool(tool.id, tool.toolType)}
    />
  {/each}
</ToolSection>
```

---

## Tool Registry Integration

The `toolRegistry` from `src/lib/workflow-builder/tools/registry.ts` drives dynamic UI generation:

```typescript
import { toolRegistry } from '$lib/workflow-builder/tools/registry';

// Get all tools that can be attached to a stage
const stageTools = toolRegistry.getStageTools();

// Get all tools that can be attached to a connection
const connectionTools = toolRegistry.getConnectionTools();

// Get tools for a specific target
const globalTools = toolRegistry.getToolsFor('global');

// Get a specific tool definition
const def = toolRegistry.get('my_tool');
// def.toolType, def.displayName, def.description, def.icon, def.attachableTo, def.defaultColor
```

The tool picker (`src/lib/workflow-builder/components/tool-picker.svelte`) uses the registry to show available tools based on the attachment target. When the user picks a tool, the builder page creates the tool instance via the state class and switches the selection context to the editor view.

---

## Save Flow

When the user clicks Save:

1. `state.syncGlobalToolStages()` ensures global tools have all current stage IDs
2. `state.getChanges()` collects all new/modified/deleted items as plain objects (using `$state.snapshot()` to strip reactive proxies)
3. `saveWorkflow()` in `src/lib/workflow-builder/save.ts` creates a PocketBase batch and sends all operations atomically
4. On success, `state.markAsSaved()` resets all statuses to `unchanged`, removes deleted items, and snapshots current data as new originals

Your tool's state entries are included automatically if you added them to `getChanges()` and `markAsSaved()` in the state class.

---

## Checklist

- [ ] View component created under `right-sidebar/views/` with barrel `index.ts`
- [ ] Selection context type added to `context.ts` with factory method and type guard
- [ ] View wired into `RightSidebar.svelte` conditional chain (before `hasSelection` fallback)
- [ ] `hasSelection` guard updated to exclude your context type
- [ ] Sidebar width class updated if your view needs `wide` mode
- [ ] Props and callbacks passed through from the builder page component
- [ ] Context sidebar panel created (if listing items in the left sidebar)
- [ ] Local state synced from props using `$effect` + `currentId` pattern
