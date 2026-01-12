# Legacy Bottomsheet: Complete UI Structure Analysis

## Overview: The Module System

The bottomsheet is a **container** that loads different **modules**. Each module has its own views, tabs, and button configurations.

```
BOTTOMSHEET CONTAINER
├── HEADER (always visible)
│   ├── Drag Handle
│   ├── Title + Subtitle
│   ├── Stage Badge
│   └── Close Button
├── CONTENT AREA (scrollable)
│   └── [MODULE CONTENT] ← Different per module
└── ACTION ROLL BAR (optional, per module)
```

**Three Main Modules:**
1. **SurveyModule** - Pre-workflow form (before instance created)
2. **WorkflowModule** - Active workflow instance display
3. **MarkerDetailModule** - Full marker/instance detail with tabs

---

## Part 1: Container States (Peek vs Expanded)

### Mobile Layout

```
CLOSED                    PEEK (30vh)                 EXPANDED (70vh)
+------------------+      +------------------+        +------------------+
|                  |      |                  |        |     MAP (30%)    |
|                  |      |      MAP         |        +==================+
|      MAP         |      |                  |        |     HEADER       |
|                  |      +==================+        +------------------+
|                  |      |     HEADER       |        |                  |
|                  |      +------------------+        |    FULL TABS     |
+------------------+      |  Partial Content |        |    + CONTENT     |
                          +------------------+        |                  |
                                                      +------------------+
```

### What Shows in Each State

| Element | PEEK | EXPANDED |
|---------|------|----------|
| Header (full) | Yes | Yes |
| Drag handle | Yes | Yes |
| Close button | Yes | Yes |
| Tab navigation | Partial (may scroll) | Full |
| Content area | ~200px visible | Full scroll |
| Action roll bar | Yes (scrollable) | Yes |
| Form fields | Top fields only | All fields |
| Photo grid | 2-3 thumbnails | Full grid |

### State Transitions

```
CLOSED ──[open()]──> PEEK ──[drag up / tap expand]──> EXPANDED
                       ↑                                   │
                       └───[drag down / overscroll]────────┘

EXPANDED ──[drag down past threshold]──> PEEK ──[drag down]──> CLOSED
```

**Gesture Thresholds:**
- Drag 80px OR velocity > 0.5 to trigger state change
- Overscroll at content boundaries triggers expand/collapse

---

## Part 2: Header Section

```
┌────────────────────────────────────────────────────────────┐
│  ══════════  (drag handle - 40x4px, white 40% opacity)     │
│                                                       [X]  │
│  Title Text                                                │
│  Subtitle (date + creator)                    [Stage 2/4]  │
└────────────────────────────────────────────────────────────┘
```

### Header Elements by Module

| Module | Title | Subtitle | Stage Badge |
|--------|-------|----------|-------------|
| SurveyModule | "Survey" | Hidden | Hidden |
| WorkflowModule | Workflow name | Hidden | "Stage X/Y" |
| MarkerDetailModule | Marker title | "Created: date by name" | "Stage X/Y" |

### Header Buttons

| Button | Position | Always Visible | Action |
|--------|----------|----------------|--------|
| Close (X) | Top-right | Yes | Closes bottomsheet |
| Back | Top-left (when in sub-view) | No | Returns to previous view |

---

## Part 3: Tab Navigation System

### MarkerDetailModule Tabs (Primary Implementation)

```
┌────────────────────────────────────────────────────────────┐
│  [Overview]    [Details]    [Audit Trail]                  │
└────────────────────────────────────────────────────────────┘
```

**Tab 1: Overview**
- Quick info (location, status)
- Assignment section
- Photo preview (max 4 thumbnails)
- NO sub-tabs

**Tab 2: Details** (has sub-navigation!)
```
┌────────────────────────────────────────────────────────────┐
│  [Stage 1]  [Stage 2]  [Stage 3]  ...   ← Sub-tabs        │
├────────────────────────────────────────────────────────────┤
│  Fields collected at selected stage                        │
│  - Field Label: Value                                      │
│  - Field Label: Value                                      │
└────────────────────────────────────────────────────────────┘
```

**Tab 3: Audit Trail**
- Timeline of all actions
- Who did what, when
- NO sub-tabs

### Tab Visibility Rules

- Tabs filtered by `visible_to_roles` on stages
- If participant can't see a stage, that stage's sub-tab is hidden
- If no data in a stage, sub-tab may be hidden or show "No data"

---

## Part 4: Action Roll Bar

```
┌────────────────────────────────────────────────────────────┐
│  [icon]    [icon]    [icon]    [icon]         →  (scroll) │
│  Submit    Edit      Request   Assign                      │
│  Data      Entry     Review    Task                        │
└────────────────────────────────────────────────────────────┘
```

### Button Types in Roll Bar

| Type | Icon | Color | When Shown |
|------|------|-------|------------|
| Forward Action | Arrow/custom | Blue (default) | `from_stage != to_stage` |
| Edit Action | Pencil | Orange | `from_stage == to_stage` |
| Location Update | Map marker | Blue | Edit mode + permission |

### Edit Mode Buttons (Replace Regular Buttons)

```
NORMAL MODE:                      EDIT MODE:
[Submit] [Edit] [Request]    →    [Confirm ✓] [Discard ✕] [Update Location]
```

| Button | Icon | Color | Action |
|--------|------|-------|--------|
| Confirm | Checkmark | Green | Save edits |
| Discard | X | Red | Cancel edits |
| Update Location | Map marker | Blue | Enter location edit mode |

---

## Part 5: Content Views by Module

### A) SurveyModule Content

```
┌────────────────────────────────────────────────────────────┐
│  FORM TITLE                                                │
│  Form description text                                     │
├────────────────────────────────────────────────────────────┤
│  Field Label *                                             │
│  [________________________]                                │
│                                                            │
│  Field Label                                               │
│  [________________________]                                │
│                                                            │
│  Field Label                                               │
│  [Dropdown ▼              ]                                │
├────────────────────────────────────────────────────────────┤
│                              [Cancel]  [Start Workflow]    │
└────────────────────────────────────────────────────────────┘
```

**States:**
- Loading → Shows spinner
- Form Loaded → Shows fields
- Submitting → Buttons disabled

**Buttons:**
- Cancel (gray) → Closes bottomsheet
- Start Workflow (blue) → Creates instance, transitions to WorkflowModule

---

### B) WorkflowModule Content

```
┌────────────────────────────────────────────────────────────┐
│  WORKFLOW HEADER                                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ [Stage Icon]  Stage Name                             │  │
│  │ Progress: ████████░░░░░░░░ 50%                       │  │
│  └──────────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────┤
│  FORM SECTION (loads on action click)                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Click an action button to load form                  │  │
│  │              OR                                      │  │
│  │ [Loaded form fields here]                            │  │
│  └──────────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────┤
│  ACTION BUTTONS                                            │
│  [Submit Data]  [Edit Entry]  [Request Review]             │
├────────────────────────────────────────────────────────────┤
│  INSTANCE INFO                                             │
│  Created: 12.01.2026 14:30                                 │
│  Instance ID: abc123                                       │
└────────────────────────────────────────────────────────────┘
```

**States:**
- Default → Shows stage info + action buttons, form placeholder
- Form Loading → Shows spinner in form section
- Form Loaded → Shows form fields + submit/cancel
- Submitting → Form disabled, shows progress

**Key Behavior:** Forms load **on-demand** when action button clicked!

---

### C) MarkerDetailModule Content

#### Overview Tab
```
┌────────────────────────────────────────────────────────────┐
│  LOCATION                                                  │
│  48.123456, 11.654321                                      │
├────────────────────────────────────────────────────────────┤
│  STATUS                                                    │
│  [Open] [In Progress]                                      │
├────────────────────────────────────────────────────────────┤
│  ASSIGNMENT                                                │
│  Assigned to: User Name                     [Edit button]  │
├────────────────────────────────────────────────────────────┤
│  PHOTOS                                                    │
│  [img1] [img2] [img3] [+5 more]            [Show all →]   │
└────────────────────────────────────────────────────────────┘
```

#### Details Tab (with sub-tabs)
```
┌────────────────────────────────────────────────────────────┐
│  [Stage 1]  [Stage 2*]  [Stage 3]    ← active has underline│
├────────────────────────────────────────────────────────────┤
│  DATA FROM STAGE 2                                         │
│  ──────────────────────                                    │
│  Field Name                                                │
│  Field Value                                               │
│  ──────────────────────                                    │
│  Field Name                                                │
│  Field Value                                               │
│  ──────────────────────                                    │
│  Field Name (file)                                         │
│  [image thumbnail]                                         │
└────────────────────────────────────────────────────────────┘
```

#### Details Tab in EDIT MODE
```
┌────────────────────────────────────────────────────────────┐
│  [Stage 1]  [Stage 2*]  [Stage 3]                          │
├────────────────────────────────────────────────────────────┤
│  EDITING STAGE 2 DATA                                      │
│  ──────────────────────                                    │
│  Field Name *                                              │
│  [___prefilled value___]  ← editable input                 │
│  ──────────────────────                                    │
│  Field Name                                                │
│  [Dropdown ▼ current    ]  ← editable dropdown             │
│  ──────────────────────                                    │
│  Field Name (file)                                         │
│  [image] [Remove]  ← can delete/replace                    │
└────────────────────────────────────────────────────────────┘
```

#### Audit Trail Tab
```
┌────────────────────────────────────────────────────────────┐
│  ACTIVITY                                                  │
│                                                            │
│  ● User Name                                               │
│  │ 12.01.2026 14:30                                        │
│  │ Action: Submit Data                                     │
│  │ Notes: Updated location information                     │
│  │                                                         │
│  ● Another User                                            │
│  │ 11.01.2026 09:15                                        │
│  │ Action: Created                                         │
│  │                                                         │
│  ● System                                                  │
│    10.01.2026 08:00                                        │
│    Action: Assigned                                        │
└────────────────────────────────────────────────────────────┘
```

---

## Part 6: Multi-Page Form Display

When a form has multiple pages (`form_fields.page` > 1):

```
┌────────────────────────────────────────────────────────────┐
│  FORM TITLE                                                │
│  Page description                                          │
├────────────────────────────────────────────────────────────┤
│  Field from Page 2 *                                       │
│  [________________________]                                │
│                                                            │
│  Field from Page 2                                         │
│  [________________________]                                │
├────────────────────────────────────────────────────────────┤
│  PAGE NAVIGATION                                           │
│  [← Back]    ● ● ◉ ● ●    Page 3 of 5    [Next →]         │
│              ↑ page dots (clickable)                       │
└────────────────────────────────────────────────────────────┘
```

### Page Navigation Behavior

| Element | When Visible | Action |
|---------|--------------|--------|
| Back button | Page > 1 | Go to previous page |
| Next button | Page < total | Go to next page |
| Next button (last page) | Page == total | Changes to "Submit" |
| Page dots | Always (multi-page) | Click to jump to page |
| Progress bar | Always (multi-page) | Visual only |

### Page Transition Animation
1. Current page fades out (opacity 0.5)
2. Form becomes non-interactive
3. New page content loads
4. New page fades in
5. Duration: 0.2s

---

## Part 7: State Machine Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    BOTTOMSHEET STATES                           │
└─────────────────────────────────────────────────────────────────┘

CONTAINER STATES:
  closed → open (peek) → expanded → closed
                ↑            │
                └────────────┘

MODULE STATES (MarkerDetailModule):

  ┌─────────────┐
  │  OVERVIEW   │ ←─────────────────────────────────┐
  │    TAB      │                                   │
  └──────┬──────┘                                   │
         │ click "Details" tab                      │
         ↓                                          │
  ┌─────────────┐                                   │
  │  DETAILS    │──[click action]──┐                │
  │    TAB      │                  │                │
  │  (read-only)│                  ↓                │
  └──────┬──────┘           ┌─────────────┐         │
         │                  │  EDIT MODE  │         │
         │                  │  (editable) │         │
         │                  └──────┬──────┘         │
         │                         │                │
         │            ┌────────────┴────────────┐   │
         │            ↓                         ↓   │
         │     [Confirm]                  [Discard] │
         │         │                          │     │
         │         ↓                          │     │
         │   Save changes                     │     │
         │         │                          │     │
         │         └──────────────────────────┴─────┘
         │
         │ click "Audit Trail" tab
         ↓
  ┌─────────────┐
  │ AUDIT TRAIL │
  │    TAB      │
  └─────────────┘


FORM STATES (within WorkflowModule or actions):

  ┌──────────────┐
  │  PLACEHOLDER │──[click action button]──┐
  │  (no form)   │                         │
  └──────────────┘                         ↓
                                    ┌─────────────┐
                                    │   LOADING   │
                                    └──────┬──────┘
                                           │
                                           ↓
  ┌──────────────┐               ┌─────────────────┐
  │   SINGLE     │←─[pages=1]───│   FORM LOADED   │
  │    PAGE      │               └────────┬────────┘
  └──────┬───────┘                        │
         │                         [pages>1]
         │                                │
         ↓                                ↓
  ┌──────────────┐               ┌─────────────────┐
  │   SUBMIT     │               │   MULTI-PAGE    │
  │              │               │   NAVIGATION    │
  └──────────────┘               └────────┬────────┘
                                          │
                          ┌───────────────┼───────────────┐
                          ↓               ↓               ↓
                     [Page 1]        [Page 2]        [Page N]
                          │               │               │
                          └───────────────┴───────────────┘
                                          │
                                          ↓
                                   ┌─────────────┐
                                   │   SUBMIT    │
                                   └─────────────┘
```

---

## Part 8: Button Location Summary

| Location | Buttons | When Visible |
|----------|---------|--------------|
| **Header** | Close (X) | Always |
| **Header** | Back | In sub-views only |
| **Tab Bar** | Tab buttons | Module has tabs |
| **Sub-Tab Bar** | Stage tabs | Details tab active |
| **Action Roll Bar** | Action buttons | Module provides actions |
| **Action Roll Bar** | Confirm/Discard | Edit mode active |
| **Action Roll Bar** | Location Update | Edit mode + permission |
| **Form Footer** | Cancel/Submit | Form loaded |
| **Page Nav** | Back/Next | Multi-page form |
| **Photo Section** | Show All | Photos exist |
| **File Field** | Remove | File uploaded |
| **Signature Field** | Clear | Signature drawn |

---

## Part 9: Conditional Display Rules

### What Controls Visibility

| Element | Controlled By |
|---------|---------------|
| Entire module | Which marker/instance clicked |
| Tabs | Module type (MarkerDetail has 3, Survey has 0) |
| Stage sub-tabs | `workflow_stages.visible_to_roles` |
| Action buttons | `workflow_actions.from_stage_id` + `allowed_roles` |
| Form fields | `form_fields.page` + `conditional_logic` |
| Edit fields | `action_editable_fields` for the action |
| Photo section | Instance has photos |
| Audit trail entries | Actions executed on instance |
| Page navigation | Form has multiple pages |
| Stage badge | Instance has workflow context |
| Subtitle | Module sets `has-dynamic-header` |

### Role-Based Filtering

```
Participant Role: "field_worker"

Stage 1: visible_to_roles = ["field_worker", "supervisor"]  → VISIBLE
Stage 2: visible_to_roles = ["supervisor"]                  → HIDDEN
Stage 3: visible_to_roles = ["field_worker"]                → VISIBLE

Result: Details tab shows sub-tabs for Stage 1 and Stage 3 only
```

---

## Part 10: Desktop vs Mobile Differences

| Feature | Mobile | Desktop |
|---------|--------|---------|
| Position | Bottom drawer | Right sidebar |
| Width | 100% | 400px |
| Height | 30vh (peek) / 70vh (expanded) | 100vh |
| Peek state | Yes | No |
| Drag to expand | Yes | No |
| Swipe navigation | Yes (between markers) | No |
| Close gesture | Drag down | Click outside |
| Header drag handle | Visible | Hidden |
| Touch optimization | Yes | No |
