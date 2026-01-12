# Workflow Builder - Agent Instructions

## Critical Rules - Read First

**DO NOT ASSUME. ASK FIRST.**

1. **Do not add features without explicit user request.** Even if you see something in legacy code, even if it seems obvious, even if it would "make sense" - do not add it. Ask the user first.

2. **Do not pre-populate tools/options.** If creating a panel or section that will contain tools, leave it empty with a placeholder like "Tools will be added here" until the user specifies what they want.

3. **Database changes require discussion first.** Never create a migration that adds multiple collections/fields at once. Discuss with the user what specific fields are needed for the immediate next step. Implement only those. Step by step.

4. **Small increments only.** Each task should be a few steps, not a complete feature. Build incrementally.

5. **The user provides direction.** Your job is to implement what they ask for, not to anticipate their needs.

---

## Current State

### What Exists

The workflow builder has been scaffolded with:

**Main Page:** `/src/routes/(admin)/projects/[projectId]/workflows/[workflowId]/builder/+page.svelte`
- Three-panel layout: Context Sidebar (left) | Canvas (center) | Preview Sidebar (right)
- SvelteFlow canvas with custom `StageNode` component
- Toolbar with buttons (most are stubs - not wired up yet)
- Can add stages via toolbar dropdown
- Can create connections by right-clicking nodes
- Click stage/action to select, click canvas to deselect

**Context Sidebar:** `/src/routes/(admin)/projects/[projectId]/workflows/[workflowId]/builder/context-sidebar/`
- Modular panel system that switches based on selection
- `context.ts` - Types for SelectionContext (none | stage | action | field)
- `ContextSidebar.svelte` - Shell that renders the appropriate panel
- `panels/DefaultPanel.svelte` - Shows when nothing selected (Add Stage buttons)
- `panels/StagePanel.svelte` - Shows when stage selected (has placeholder tools - USER DID NOT REQUEST THESE, they were added prematurely)
- `panels/ActionPanel.svelte` - Shows when action selected (has placeholder tools - USER DID NOT REQUEST THESE)
- `panels/FieldPanel.svelte` - Shows when field selected (has placeholder tools - USER DID NOT REQUEST THESE)
- `shared/ToolSection.svelte` - Collapsible section wrapper
- `shared/ToolButton.svelte` - Consistent button styling

**Preview Sidebar (right):**
- Participant View preview with tabs: Overview | Details | Audit
- Shows mock data and selected stage info
- Intended to preview forms as participants would see them

**Stage Node:** `/src/routes/(admin)/projects/[projectId]/workflows/[workflowId]/builder/StageNode.svelte`
- Custom xyflow node for stages
- Shows title, key, stage type (start/intermediate/end)
- Color-coded left border

**Server Load:** `/src/routes/(admin)/projects/[projectId]/workflows/[workflowId]/builder/+page.server.ts`
- Loads workflow from database
- Has `safeGetFullList` helper that returns empty arrays if collections don't exist
- Currently returns empty arrays for stages, actions, form_fields (collections don't exist yet)

### What Does NOT Exist Yet

- Database collections for `workflow_stages`, `workflow_actions`, `form_fields` (need to be discussed and created incrementally)
- Save functionality
- Stage/Action edit modals
- Form field creation
- Undo/redo
- Local state persistence (IndexedDB was discussed but not implemented)
- Most toolbar buttons are not functional

---

## Plan File Location

**Full implementation plan:** `/home/jan/.claude/plans/steady-floating-star.md`

This contains:
- User functional specification (what users can do)
- 35-step incremental implementation guide
- Database schema proposal (but remember: discuss before implementing)

---

## Architecture Decisions Made

### Local-First Approach (Discussed, Not Implemented)
The user wants:
- Local state for editing (memory + optionally IndexedDB for recovery)
- Undo/redo on local state
- Only save to database on explicit "Save" action
- Handle sync conflicts when saving

This was discussed but NOT implemented yet. The approach will be:
- New items get `temp_` prefix IDs locally
- On save: create new records, get real IDs, map temp to real
- Track item status: `unchanged`, `new`, `modified`, `deleted`

### Contextual Sidebar
- Left sidebar changes based on selection context
- Panel components are modular - each panel is independent
- Adding new tools = edit one panel file
- But remember: don't add tools without user request

---

## Tech Stack Notes

- **Svelte 5 runes mode** - Use `$state`, `$derived`, `$props()`, `$effect`
- **@xyflow/svelte** - For the canvas. Use `$state.raw<Node[]>()` for nodes/edges
- **No `svelte:component`** - Use conditional rendering instead (`{#if}...{:else}...`)
- **No `class:` directive on components** - Use template strings: `class="foo {condition ? 'bar' : ''}"`
- **PocketBase** - Backend. Collections don't exist yet for workflow builder specifics

---

## What Was Done This Session

1. Installed `@xyflow/svelte`
2. Created builder route and page
3. Created StageNode custom component
4. Added "Build" button to workflows table
5. Set up basic canvas with nodes/edges
6. Restructured layout: added Preview Sidebar on right (participant view)
7. Created contextual sidebar system on left
8. Fixed various Svelte 5 compatibility issues

**Mistake made:** Added form field type buttons to StagePanel without user request. The user wanted an empty modular structure where tools could be added individually based on their direction.

---

## How to Continue

1. **Ask the user what they want to work on next**
2. **Discuss before implementing** - especially for database changes
3. **Implement only what was requested**
4. **Leave placeholders empty** until user specifies content
5. **Small steps** - a few changes at a time, not complete features

Example of WRONG approach:
> "I'll add all the form field types to the stage panel since that's what the legacy code had."

Example of CORRECT approach:
> "The stage panel is ready. What tools would you like me to add to it?"

---

## Files Quick Reference

```
builder/
  +page.svelte              # Main builder page
  +page.server.ts           # Server data loading
  StageNode.svelte          # Custom xyflow node

  context-sidebar/
    index.ts                # Barrel export
    context.ts              # SelectionContext types
    ContextSidebar.svelte   # Panel switcher shell

    panels/
      DefaultPanel.svelte   # No selection
      StagePanel.svelte     # Stage selected (has premature tools - may need cleanup)
      ActionPanel.svelte    # Action selected (has premature tools - may need cleanup)
      FieldPanel.svelte     # Field selected (has premature tools - may need cleanup)

    shared/
      ToolSection.svelte    # Collapsible section
      ToolButton.svelte     # Tool button styling
```

---

## Remember

- The user is the product owner
- You implement their vision, not yours
- Ask before adding
- Discuss before creating database schemas
- Small incremental steps
- When in doubt, ask
