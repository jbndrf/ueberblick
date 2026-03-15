# Adding a View to the Participant App

What you will learn: How to add a new view or module to the participant (mobile) app. This covers the module pattern, how to use the gateway for data, and how to present content using the responsive `ModuleShell` component.

**Reference implementation:** `src/routes/participant/map/` and its `modules/` directory.

---

## Architecture Overview

The participant app has a single main route at `src/routes/participant/map/+page.svelte`. All content is presented as **modules** -- self-contained components that display inside a `ModuleShell`. The shell handles the responsive layout:

- **Desktop:** A 450px sidebar panel on the right side of the screen.
- **Mobile:** A bottom drawer with two states: "peek" (35vh) and "expanded" (90vh), controlled by swipe gestures.

The data layer is the **participant gateway** (see `gateway-usage.md`), which provides offline-first reads and optimistic writes through IndexedDB.

---

## Files Involved

For a new module (e.g. a "Notes" viewer), you create:

```
src/routes/participant/map/modules/notes/
  NotesModule.svelte       # The module component
  state.svelte.ts          # (Optional) Reactive state management
  index.ts                 # Re-export for clean imports
```

Then wire it into the map page:

```
src/routes/participant/map/+page.svelte   # Add selection state + render the module
src/routes/participant/map/modules/index.ts  # Re-export from the barrel
```

---

## Step 1: Define the Module Component

A module wraps its content in `ModuleShell`, which provides the responsive sidebar/drawer behavior.

```svelte
<!-- src/routes/participant/map/modules/notes/NotesModule.svelte -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import ModuleShell from '$lib/components/module-shell.svelte';
  import { getParticipantGateway } from '$lib/participant-state/context.svelte';

  interface Props {
    /** Controls the expanded/peek state (bindable) */
    isExpanded?: boolean;
    /** Close handler */
    onClose: () => void;
  }

  let { isExpanded = $bindable(false), onClose }: Props = $props();

  const gateway = getParticipantGateway();

  // Live query -- reactive, auto-updates from IndexedDB
  const notesLive = gateway.collection('notes').live({
    sort: '-created'
  });
  const notes = $derived(notesLive.records);
  const isLoading = $derived(notesLive.loading);

  // Cleanup on unmount
  onDestroy(() => notesLive.destroy());

  let isOpen = $state(true);

  function handleClose() {
    isOpen = false;
    onClose();
  }
</script>

<ModuleShell
  bind:isOpen
  bind:isExpanded
  title="Notes"
  isLoading={isLoading}
  onClose={handleClose}
>
  {#snippet content()}
    <div class="p-4 space-y-3">
      {#each notes as note}
        <div class="rounded-lg border p-3">
          <p class="text-sm">{note.text}</p>
          <p class="text-xs text-muted-foreground mt-1">{note.created}</p>
        </div>
      {:else}
        <p class="text-sm text-muted-foreground">No notes yet.</p>
      {/each}
    </div>
  {/snippet}
</ModuleShell>
```

---

## Step 2: ModuleShell Props Reference

`ModuleShell` (`src/lib/components/module-shell.svelte`) accepts:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isOpen` | `boolean` (bindable) | `false` | Controls visibility |
| `isExpanded` | `boolean` (bindable) | `false` | Peek vs expanded on mobile |
| `title` | `string` | `'Details'` | Header title |
| `subtitle` | `string` | -- | Smaller text below title |
| `badge` | `string` | -- | Badge next to title (e.g. stage name) |
| `isLoading` | `boolean` | `false` | Shows loading spinner |
| `error` | `string \| null` | `null` | Shows error state |
| `onClose` | `() => void` | -- | Called when user closes |
| `onNext` / `onPrevious` | `() => void` | -- | Horizontal swipe navigation |
| `content` | `Snippet` | -- | Main scrollable content area |
| `footer` | `Snippet` | -- | Fixed footer (buttons, pagination) |
| `headerActions` | `Snippet` | -- | Extra buttons in the header |
| `mobileHeightPeek` | `number` | `35` | Peek height in vh |
| `mobileHeightExpanded` | `number` | `90` | Expanded height in vh |

Content is passed via Svelte 5 snippets:

```svelte
<ModuleShell title="My Module" {onClose}>
  {#snippet content()}
    <!-- Scrollable content here -->
  {/snippet}

  {#snippet footer()}
    <div class="p-3">
      <Button onclick={handleSave}>Save</Button>
    </div>
  {/snippet}
</ModuleShell>
```

---

## Step 3: Wire into the Map Page

The map page manages a `selection` state that determines which module is shown. Add your module's selection type and render it conditionally.

### 3a. Add selection type

In `src/routes/participant/map/modules/types.ts` (or wherever your selection types live), add a new variant:

```ts
// Extend the Selection union type
export type Selection =
  | { type: 'none' }
  | { type: 'marker'; markerId: string }
  | { type: 'workflowInstance'; instanceId: string; openCount: number }
  | { type: 'notes' };  // New
```

### 3b. Render the module in the map page

In `src/routes/participant/map/+page.svelte`, add a conditional block:

```svelte
<script lang="ts">
  import { NotesModule } from './modules';

  // ... existing state ...

  // Shared bottom sheet expanded state
  let sheetExpanded = $state(false);
</script>

<!-- Existing modules -->
{#if selection.type === 'workflowInstance'}
  <WorkflowInstanceDetailModule
    {selection}
    bind:isExpanded={sheetExpanded}
    onClose={handleSelectionClose}
  />
{/if}

<!-- Your new module -->
{#if selection.type === 'notes'}
  <NotesModule
    bind:isExpanded={sheetExpanded}
    onClose={handleSelectionClose}
  />
{/if}
```

### 3c. Trigger opening your module

From a button, map click handler, or control bar:

```ts
function handleOpenNotes() {
  selection = { type: 'notes' };
}
```

---

## Step 4: (Optional) Add State Management

For complex modules, extract reactive state into a separate `.svelte.ts` file. This is the pattern used by `WorkflowInstanceDetailModule`:

```ts
// src/routes/participant/map/modules/notes/state.svelte.ts
import type { ParticipantGateway } from '$lib/participant-state/gateway.svelte';

export function createNotesState(gateway: ParticipantGateway) {
  const notesLive = gateway.collection('notes').live({ sort: '-created' });

  let selectedNoteId = $state<string | null>(null);

  const selectedNote = $derived(
    notesLive.records.find((n: any) => n.id === selectedNoteId) ?? null
  );

  async function createNote(text: string) {
    await gateway.collection('notes').create({
      text,
      created_by: gateway.participantId
    });
  }

  async function deleteNote(id: string) {
    await gateway.collection('notes').delete(id);
  }

  return {
    get notes() { return notesLive.records; },
    get loading() { return notesLive.loading; },
    get selectedNote() { return selectedNote; },
    set selectedNoteId(id: string | null) { selectedNoteId = id; },
    createNote,
    deleteNote,
    destroy: () => notesLive.destroy()
  };
}
```

Use it in the module:

```svelte
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { getParticipantGateway } from '$lib/participant-state/context.svelte';
  import { createNotesState } from './state.svelte';

  const gateway = getParticipantGateway();
  const state = createNotesState(gateway);

  onDestroy(() => state.destroy());
</script>
```

---

## Real-World Example: WorkflowInstanceDetailModule

The existing `WorkflowInstanceDetailModule` (`src/routes/participant/map/modules/workflow-instance-detail/WorkflowInstanceDetailModule.svelte`) demonstrates the full pattern:

1. Receives a `selection` prop with the instance ID.
2. Creates reactive state via `createWorkflowInstanceDetailState(instanceId, gateway)`.
3. Wraps everything in `ModuleShell` with title, subtitle, and badge derived from the instance data.
4. Renders different **tools** (FormFillTool, EditFieldsTool, ViewFieldsTool, LocationEditTool) as sub-views within the module based on the current tool flow state.

Tools are child components rendered inside the module's content snippet. They receive the gateway (or state object) and callbacks for completion/cancellation. This keeps each tool focused on a single responsibility.

---

## Key Patterns

### Gateway access

Always get the gateway from context. Never create a new one in a module:

```ts
const gateway = getParticipantGateway();
```

### Live queries for reactive UI

Use `.live()` for lists that should auto-update:

```ts
const notesLive = gateway.collection('notes').live({ sort: '-created' });
const notes = $derived(notesLive.records);
```

### Optimistic writes

Writes update the UI instantly via IndexedDB. No need to refetch:

```ts
await gateway.collection('notes').create({ text: 'Hello' });
// notesLive.records already includes the new note
```

### Shared expanded state

All modules should bind `isExpanded` to a shared state in the map page so that switching modules preserves the user's peek/expanded preference.

### Cleanup

Always destroy live queries in `onDestroy`:

```ts
onDestroy(() => {
  notesLive.destroy();
});
```

---

## Checklist

1. Create your module component in `src/routes/participant/map/modules/<name>/`
2. Wrap content in `ModuleShell`, using `{#snippet content()}` for the body
3. Use `gateway.collection().live()` for reactive data binding
4. Add a selection type and wire the module into the map page
5. Destroy all live queries in `onDestroy`
6. (Optional) Extract complex logic into a `state.svelte.ts` factory function
