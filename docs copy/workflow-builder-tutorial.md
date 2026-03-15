# Workflow Builder Tutorial

A guide for admins setting up workflows in Ueberblick Sector. Covers every concept, every setting, and the permission model in detail.

---

## Table of Contents

1. [Overview: What is Ueberblick?](#overview-what-is-ueberblick)
2. [Core Concepts](#core-concepts)
3. [The Permission Model](#the-permission-model)
4. [Settings Reference](#settings-reference)
5. [Navigation Cheat Sheet](#navigation-cheat-sheet)
6. [Step-by-Step: Your First Workflow](#step-by-step-your-first-workflow)
7. [Common Scenarios](#common-scenarios)
8. [Pitfalls and Tips](#pitfalls-and-tips)

---

## Overview: What is Ueberblick?

Ueberblick is a toolkit for building map-based mobile applications. In **Ueberblick Sector** (the admin interface), the application is assembled that participants then use on their phones.

### Application Building Blocks

**Map and Overlays** -- The foundation is a map view. Map layers (tile layers, overlays) are configured per project. For offline use, map packs can be created that participants download and use without internet connectivity.

**Workflows and Data Points** -- Workflows define how data points are created and processed on the map. Each workflow describes a process (e.g. "Report Incident", "Conduct Inspection") with stages, forms, permissions, and automations. For incident workflows, data points appear as markers on the map. For survey workflows, it is purely about data collection without map markers.

**Custom Tables** -- Beyond workflow data, the application can also hold regular data tables, e.g. contractors, contacts, material lists. These tables serve as data sources: one column can be used as selectable options in form fields (via the `custom_table_selector` field type), while the remaining columns (phone number, email, etc.) provide additional context.

**Roles and Permissions** -- Participants are assigned roles that control what they can see and do. The permission model runs through every aspect of the application.

### This Guide

This document focuses on the **Workflow Builder** -- the central tool for process modeling. In the builder, workflows are visually constructed: stages placed on a canvas, connections drawn, forms attached, roles assigned.

---

## Core Concepts

### The Data Model

#### The Data

A workflow defines what **attributes** a data point can have. For incident workflows, each data point appears as a **marker on the map**. For survey workflows, no map marker is created -- it is purely about data collection.

Think of it like a table: each workflow instance is a **row**, each form field is a **column**. The difference from a spreadsheet: forms render a structured UI that feels more like answering a survey than filling cells -- reducing incorrect data entry.

#### The Actions

All tools (forms, edit tools) are ultimately ways to fill or modify a row's columns. Connections define when which tools are executed and when an instance moves to the next stage. Details under [Tools](#tools) and [Connection](#connection).

#### The Role Perspective

Roles control which columns (= form data) are visible to whom. The collected data from all stages together form the columns of a row -- each row is an instance.

**Example workflow "Report Damage":** Three stages -- "Reported" (form: report date, severity), "In Progress" (form: responsible, priority), "Completed" (form: completion date, action taken). Two roles -- Guest and Janitor. Stage "In Progress" has `visible_to_roles = [Janitor]`.

**All attributes** (Janitor sees all stages):

| Current Stage | Report Date | Severity | Responsible | Priority | Completion Date | Action Taken |
|---|---|---|---|---|---|---|
| Completed | 2026-03-01 | High | Mueller | Urgent | 2026-03-05 | Pipe replaced |

**Guest view** (no access to stage "In Progress"):

| Current Stage | Report Date | Severity | Completion Date | Action Taken |
|---|---|---|---|---|
| Completed | 2026-03-01 | High | 2026-03-05 | Pipe replaced |

Same instance, fewer columns. The current stage is always visible -- the Guest knows where the process stands, but not what happens internally.

### Project

The top-level container. Workflows, roles, participants, and map layers all belong to a project. Project membership is required for any access.

### Role

Roles (e.g. "Reporter", "Inspector", "Manager") control three specific things:

1. **Who can create instances** -- via `entry_allowed_roles` on the workflow
2. **Who sees which buttons and can trigger actions** -- via `allowed_roles` on connections and tools
3. **Who can view which collected data** -- via `visible_to_roles` on stages

A participant can have **multiple roles**. When checking permissions, the system looks at all of a participant's roles: if any one of them matches a role list, access is granted. Managed on the **Roles page** in the project sidebar.

### Workflow

A process definition with name, type (`incident` or `survey`), and activation status. Only active workflows are visible to participants. Managed on the **Workflows page** in the project sidebar.

### Stage

Stages represent the lifecycle of an instance. An instance is always in exactly one stage. Stages define **what state** a data point is in (e.g. "Submitted", "Under Review", "Completed") and **who can view the data collected there** (via `visible_to_roles`).

The builder has three stage types (Start, Intermediate, End) to structure the flow -- Start as entry point, End as conclusion. For understanding the system, the type matters less than the stage's role in the process.

### Connection

Connections appear as **arrows** between stages in the builder. For participants, they render as **buttons**. Each connection defines a possible transition: who can trigger it (`allowed_roles`), how the button looks (label, color), and which tools are executed as part of it.

A special case is the **Entry Connection** -- automatically created with the start stage, not visible on the canvas, and carries the initial form for instance creation.

### Tools

Tools are the functional building blocks of a workflow. What matters most is **where** a tool is attached -- this determines its behavior:

| Attachment | Behavior | Progression |
|---|---|---|
| **Connection** | Tool executes when the participant clicks the connection button. All tools on a connection must be completed before the instance moves to the next stage. | **Yes** -- part of the progression between stages. |
| **Stage** | Tool appears as its own button on that stage. Can be executed anytime while the instance is in that stage. | **No** -- no stage change. |
| **Global** | Tool appears as a button on **every** stage in the workflow. | **No** -- no stage change. |

The available tool types:

**Form** -- Data collection via structured forms with pages and fields (text, number, date, file, dropdown, etc.). Currently only attachable to connections.

**Edit Tool** -- Editing of previously collected field values or the map location. Attachable to connection, stage, or global.

**Automation** -- Rule-based actions that fire automatically on stage transitions (`on_transition`), field changes (`on_field_change`), or on a schedule (`scheduled`). Automations check conditions and execute actions: set field values, change instance status, move to a different stage. Operate at workflow level (global).

### Workflow Instance

A concrete data point within a workflow -- a row in the conceptual table. Each instance has a current stage, a status (active, completed, archived), a map location (for incidents), and the collected field values. Instances appear as **markers on the map**. Participants can view details, progress, and available actions from there.

---

## The Permission Model

This is the most important section. The permission model is powerful and well thought out, but it has a few behaviors that are not obvious at first glance.

### The Golden Rule

> **Empty role list = ALL participants can access.**
> **Specific roles = ONLY those participants.**

This applies to every role setting in the system. When you leave a role field empty, you are saying "no restrictions -- everyone." When you add specific roles, you are restricting access to only those roles.

**Tip:** If you want to completely lock something down so nobody can access it, create a dummy role (e.g. "none") that no participant is assigned to, and set it as the only allowed role. This behavior may be reversed in a future update (empty = nobody), but for now empty means open.

### What Everyone Always Sees

Every participant in the project can always see:

| Information | Example |
|---|---|
| All stage names | "Submit", "Review", "Approved" |
| The workflow progress | "Currently at stage 2 of 4" |
| Which stage an instance is in | "Currently at: Review" |
| Instance status | "Active", "Completed" |

This is by design -- transparency for all participants. Everyone can track progress and see where things stand, even if they cannot see the details or take action.

### What is Controlled by Roles

| Setting | What it controls | Where to set it |
|---|---|---|
| `workflow.entry_allowed_roles` | Who can **create new instances** (the "+" button in the app) | Builder: entry connection permissions, or Workflow settings |
| `connection.allowed_roles` | Who sees the **action button** to trigger a transition | Builder: click connection arrow > Permissions tab |
| `stage.visible_to_roles` | Who can see **the data collected at this stage** | Builder: click stage > Properties > Permissions tab |
| `form.allowed_roles` | Who can see/fill a **stage-attached form** (connection forms inherit from the connection) | Builder: stage form settings |
| `edit_tool.allowed_roles` | Who can use an **edit tool** | Builder: edit tool settings |

### The Big Misconception: Stage Visibility

This is where most people get confused:

> **`visible_to_roles` does NOT hide the stage itself.**

As mentioned above, stage names and progress are always visible to all participants -- they are part of the communication. What `visible_to_roles` controls is whether the participant can see the **form data that was collected during the transition into that stage**. Remember: forms are attached to connections. When a participant fills a form on a connection leading to Stage X, that data is tagged as belonging to Stage X. The `visible_to_roles` on Stage X controls who can read that data.

**Example:** You have three stages: Submit, Internal Review, Resolution.

- "Internal Review" has `visible_to_roles = [Inspector, Manager]`.
- A Reporter can see that the instance is at "Internal Review" -- they see the stage name in the timeline.
- But the Reporter **cannot** see what the inspector filled in on the form that transitioned the instance into "Internal Review". The data fields are hidden.
- When the instance reaches "Resolution" (where the Reporter's role is in `visible_to_roles`), the Reporter can see the resolution data -- but still not the internal review data.


### How Data Protection Works

Field values are tagged with the stage they were collected at. When a participant requests data, the system checks each field value's stage against `visible_to_roles`. This means:

- Data stays protected even after the instance moves to a later stage.
- A Reporter who submitted data at Stage 1 cannot automatically see data from Stage 2, even though they created the instance.
- There is **no creator privilege** -- the person who created the instance follows the same rules as everyone else.

### Permission Inheritance

Forms and edit tools can be attached to either a **connection** or a **stage**. This affects how their permissions work:

| Attached to | `allowed_roles` behavior |
|---|---|
| **Connection** | The form/tool inherits the connection's `allowed_roles`. You do not set it separately. |
| **Stage** | The form/tool has its own `allowed_roles` field. You set it independently of the stage's `visible_to_roles`. |

This is an important distinction. A connection's `allowed_roles` controls who sees the action button and can click it. Forms (and other tools) attached to that connection are part of the transition -- when a participant clicks the button, they must complete **all** attached tools (e.g. fill out all forms) before the instance moves to the next stage. The connection's role setting is the single gate: if you can see the button, you do all the tools on it.

A stage's `visible_to_roles` is a separate concept entirely -- it controls who can *read* the data that was collected, not who can *fill* the form.

---

## Settings Reference

### Workflow Settings

| Setting | What it does |
|---|---|
| **Name** | Display name shown to participants and in the admin UI. |
| **Type** | `incident` or `survey`. Incidents are placed on the map; surveys may not require a location. |
| **Active** | Only active workflows appear to participants. Inactive workflows are hidden. |
| **Entry Allowed Roles** | Which roles can create new instances. Empty = everyone. This is synced from the entry connection's `allowed_roles` when you save. |
| **Marker Color** | The color of the map marker for instances of this workflow. |
| **Icon Config** | The icon shown on the map marker and in the workflow list. |

**Where:** Project sidebar > Workflows page > click workflow to edit, OR in the builder via the entry connection.

### Stage Settings

| Setting | What it does |
|---|---|
| **Name** | Display name shown in the timeline and builder canvas. |
| **Type** | `start`, `intermediate`, or `end`. Determines behavior (start = entry point, end = terminal). |
| **Order** | Controls the display order in lists and timelines. |
| **Visible to Roles** | Which roles can see the form data collected at this stage. Empty = all roles. See [The Big Misconception](#the-big-misconception-stage-visibility). |
| **Position (x, y)** | Canvas coordinates in the builder. Set by dragging. |

**Where:** Builder canvas > click a stage > right sidebar > Properties view > Permissions tab.

### Connection Settings

| Setting | What it does |
|---|---|
| **Action Name** | Internal identifier for the connection. |
| **Allowed Roles** | Which roles see the action button and can trigger this transition. Empty = all roles. |
| **Button Label** | The text shown on the action button in the participant app (e.g. "Submit", "Approve"). |
| **Button Color** | Hex color for the action button. |
| **Requires Confirmation** | If enabled, the participant must confirm before the action is executed. |
| **Confirmation Message** | Custom text shown in the confirmation dialog. |

**Where:** Builder canvas > click a connection arrow > right sidebar. Button settings in the Settings tab, permissions in the Permissions tab.

### Form Settings

| Setting | What it does |
|---|---|
| **Name** | Display name of the form. |
| **Allowed Roles** | (Stage-attached forms only) Who can see and fill this form. Connection-attached forms inherit from the connection. |
| **Pages** | Forms support multiple pages. Each page has a title and contains fields. |

**Where:** Builder > click a connection or stage > right sidebar > add a form tool > opens Form Editor view.

### Form Field Settings

| Setting | What it does |
|---|---|
| **Label** | The field label shown to participants. |
| **Type** | `short_text`, `long_text`, `number`, `email`, `date`, `file`, `dropdown`, `multiple_choice`, `smart_dropdown`, `custom_table_selector`. |
| **Required** | Whether the field must be filled before submission. |
| **Placeholder** | Hint text shown in empty fields. |
| **Help Text** | Additional explanation shown below the field. |
| **Validation Rules** | Type-specific: min/max length (text), min/max value (number), regex pattern (text), min/max selections (multiple choice), allowed file types (file), date mode (date/datetime/time). |
| **Field Options** | For dropdowns and multiple choice: the list of selectable options (label + optional description). |
| **Smart Dropdown Config** | Conditional options that change based on another field's value. |
| **Custom Table Selector Config** | Select values from existing project data (tables, marker categories, participants, roles). |
| **Page** | Which page of the form this field appears on. |
| **Row Index / Column Position** | Layout control: fields can be placed left, right, or full-width within a row. |

**Where:** Form Editor view > click a field > right sidebar shows Field Config panel.

### Edit Tool Settings

| Setting | What it does |
|---|---|
| **Edit Mode** | `form_fields` (edit previously submitted field values) or `location` (edit the instance's map position). |
| **Editable Fields** | (form_fields mode) Which specific fields from earlier forms can be edited. You pick from all fields across all previous stages. |
| **Is Global** | If enabled, the edit tool button appears on every stage, not just the one it is attached to. |
| **Allowed Roles** | Who can use this edit tool. Empty = all roles. |
| **Button Label / Color** | Appearance of the edit button in the participant app. |

**Where:** Builder > click a stage > right sidebar > add edit tool > opens Edit Tool Editor view.

### Automation Settings

| Setting | What it does |
|---|---|
| **Name** | Display name for the automation. |
| **Trigger Type** | `on_transition`, `on_field_change`, or `scheduled`. |
| **Trigger Config** | Depends on type: which stages (transition), which field (field change), cron expression + inactive days filter (scheduled). |
| **Steps** | Ordered list of steps. Each step has conditions (AND/OR logic) and actions. |
| **Enabled** | Toggle the automation on or off. |

**Step conditions:** Check field values (equals, contains, greater than, less than, is empty, etc.), instance status, or current stage.

**Step actions:** Set a field value (supports math expressions like `{quantity} * 10`), change instance status, or move the instance to a different stage.

**Where:** Builder > right sidebar > Automations view (accessible from the toolbar or sidebar navigation).

---

## Navigation Cheat Sheet

### Getting to the Builder

```
Project sidebar > Workflows > [select workflow] > Build button
```

### Builder Layout

```
+------------------+------------------------+--------------------+
|                  |                        |                    |
|  Left Sidebar    |     Canvas             |   Right Sidebar    |
|  (Context)       |     (Visual Editor)    |   (Properties/     |
|                  |                        |    Editors)         |
|  - Shows tools   |  - Drag stages         |   - Changes based  |
|    for selected  |  - Draw connections    |     on what you     |
|    element       |  - Click to select     |     selected       |
|                  |                        |                    |
+------------------+------------------------+--------------------+
```

### Where to Find Each Setting

| I want to... | Go to... |
|---|---|
| Create or manage **roles** | Project sidebar > Roles page |
| Create a new **workflow** | Project sidebar > Workflows page > New |
| Edit **workflow settings** (name, type, active) | Workflows page > click workflow |
| Open the **builder** | Workflows page > click workflow > Build |
| Add a **stage** | Drag from left sidebar onto canvas |
| Set **stage permissions** (`visible_to_roles`) | Click stage on canvas > right sidebar > Properties > Permissions tab |
| Configure the **entry connection** (initial form + who can create) | The entry connection is auto-created with the start stage. Click the start stage > Stage Preview view shows the entry action. Or: right sidebar > Properties to set roles. |
| Add a **connection** between stages | Drag from one stage's handle to another stage on the canvas |
| Set **connection permissions** (`allowed_roles`) | Click connection arrow > right sidebar > Permissions tab |
| Configure **button appearance** (label, color, confirmation) | Click connection arrow > right sidebar > Settings tab |
| Attach a **form** to a connection | Click connection > left sidebar or right sidebar > add form tool |
| Attach a **form** to a stage | Click stage > left sidebar or right sidebar > add form tool |
| Edit **form fields** | Click the form tool > opens Form Editor view in right sidebar |
| Add a **form field** | In Form Editor > drag field type from palette on the left |
| Configure a **field** | In Form Editor > click the field > right panel shows config |
| Add an **edit tool** | Click stage > right sidebar > add edit tool |
| Configure **edit tool fields** | In Edit Tool Editor > check/uncheck fields from ancestor forms |
| Set up an **automation** | Right sidebar > Automations view |
| Configure **map layers** | Project sidebar > Map Settings |

---

## Step-by-Step: Your First Workflow

This walkthrough builds a simple "Report Incident" workflow with three roles: Reporter, Inspector, and Manager.

### 1. Create Roles

Go to **Project sidebar > Roles**. Create three roles:
- **Reporter** -- will submit incidents
- **Inspector** -- will review and investigate
- **Manager** -- will approve or reject

### 2. Create the Workflow

Go to **Project sidebar > Workflows**. Click **New**.
- Name: "Report Incident"
- Type: Incident
- Pick a marker color

### 3. Open the Builder

Click the **Build** button on your new workflow.

### 4. Add Stages

Drag stages from the left sidebar onto the canvas:
1. A **Start** stage -- rename it to "Submitted" (click it > Properties > rename)
2. An **Intermediate** stage -- rename it to "Under Review"
3. Two **End** stages -- rename them to "Resolved" and "Rejected"

### 5. Connect the Stages

Draw connections by dragging from one stage's handle to another:
- **Submitted** --> **Under Review** (this will be the "Assign Inspector" action)
- **Under Review** --> **Resolved** (the "Mark Resolved" action)
- **Under Review** --> **Rejected** (the "Reject" action)

Click each connection and set the **button label** in the Settings tab (e.g. "Assign to Inspector", "Mark Resolved", "Reject").

### 6. Set Entry Permissions

The entry connection (who can create new instances) was auto-created with the start stage. To restrict it:
- Find the entry connection's permissions (click the start stage > Stage Preview view shows the entry action button > click to configure)
- Set `allowed_roles` to **Reporter** -- only Reporters can create new incidents

### 7. Attach the Entry Form

The entry connection needs a form so Reporters can describe the incident:
- Select the entry connection's form tool (or add one if not present)
- In the Form Editor, add fields:
  - "Title" (short text, required)
  - "Description" (long text, required)
  - "Photo" (file, optional)
  - "Severity" (dropdown: Low, Medium, High)

### 8. Set Connection Permissions

Click each connection arrow and set `allowed_roles` in the Permissions tab:
- **Submitted > Under Review**: allowed_roles = **Manager** (only managers can assign)
- **Under Review > Resolved**: allowed_roles = **Inspector** (only inspectors can resolve)
- **Under Review > Rejected**: allowed_roles = **Inspector** (only inspectors can reject)

### 9. Set Stage Data Visibility

Click each stage and go to Properties > Permissions tab to set `visible_to_roles`:
- **Submitted**: empty (all roles can see the initial report data)
- **Under Review**: `[Inspector, Manager]` (Reporters cannot see internal review notes)
- **Resolved**: empty (everyone can see the resolution)
- **Rejected**: empty (everyone can see the rejection reason)

### 10. Add a Review Form

The Inspector needs a form to document their review:
- Click the **Submitted > Under Review** connection
- Attach a form: "Review Notes"
- Add fields: "Findings" (long text), "Recommended Action" (dropdown)

### 11. Save and Activate

Click **Save** in the builder. Then go back to Workflows and toggle the workflow to **Active**.

### What Participants Will Experience

- **Reporter** taps the "+" button on the map > sees "Report Incident" > fills the form > instance created at "Submitted"
- **Manager** sees the instance > sees the "Assign to Inspector" button > clicks it > instance moves to "Under Review"
- **Inspector** sees the instance at "Under Review" > sees the review form and "Mark Resolved" / "Reject" buttons
- **Reporter** can see the instance is at "Under Review" (stage name visible), but cannot see the Inspector's review notes (data protected by `visible_to_roles`)
- When resolved, the Reporter can see the resolution data

---

## Common Scenarios

### "Only managers should be able to approve"

Set `allowed_roles = [Manager]` on the connection that leads to the approval stage. Only managers will see the "Approve" button.

### "Hide internal review data from reporters"

Set `visible_to_roles = [Inspector, Manager]` on the review stage. Reporters will see the stage name in the timeline but cannot see any form data collected at that stage.

### "Let everyone report, but only inspectors can review"

- Entry connection: `allowed_roles = []` (empty = everyone can create)
- Connection from "Submitted" to "Review": `allowed_roles = [Inspector]`

### "Let participants edit a field after submission"

Add an **edit tool** to the stage where you want the edit button to appear:
1. Click the stage > add edit tool
2. In the Edit Tool Editor, select `form_fields` mode
3. Check the fields you want to be editable (from any earlier form)
4. Set `allowed_roles` to control who can edit

### "Let participants update the map location"

Add an edit tool with `location` mode to the relevant stage. The participant will see an "Edit Location" button that opens a map picker.

### "Auto-complete instances that sit idle for 7 days"

Create a scheduled automation:
1. Trigger: `scheduled`, cron for daily execution
2. Set `inactive_days` filter to 7
3. Action: set instance status to "completed"

### "Calculate a total from form fields"

Create an `on_field_change` automation:
1. Trigger: `on_field_change`, watching the quantity field
2. Action: `set_field_value` on the total field with expression `{quantity} * {price}`

### "Move to a different stage based on a field value"

Create an `on_transition` automation:
1. Trigger: `on_transition` (when arriving at the decision stage)
2. Condition: field "severity" equals "Critical"
3. Action: `set_stage` to the "Escalated" stage

---

## Pitfalls and Tips

### "I set `visible_to_roles` on a stage but participants can still see the stage"

This is expected. `visible_to_roles` does NOT hide the stage from the timeline. It hides the **form data** collected at that stage. Every participant sees every stage name and the workflow progress. Only the data behind it is protected.

### "I left the role field empty and now everyone can access it"

Empty role arrays mean "all roles allowed." This is the most permissive setting. If you want to restrict access, you must add specific roles. There is no "nobody" option -- if you want to hide something from everyone, do not create it.

### "The entry connection is not visible in the builder"

Entry connections (the initial form for creating instances) are auto-created when you add a start stage. They are not drawn on the canvas. To configure the entry form and its permissions, click the start stage and look in the Stage Preview view or Properties panel.

### "I changed `visible_to_roles` but old data is still visible"

`visible_to_roles` is checked live -- it applies to all existing data immediately. If you add a role to `visible_to_roles`, participants with that role will immediately see data from that stage. If you remove a role, they will immediately lose access. There is no need to "migrate" anything.

### "The instance creator can't see their own submitted data"

There is no creator privilege. The person who created the instance follows the same role-based rules as everyone else. If the stage where they submitted data has `visible_to_roles = [Manager]`, even the creator cannot see it (unless one of their roles is Manager). If you want the creator to see their own data, make sure at least one of their roles is in `visible_to_roles` for the relevant stage.

### "I attached a form to a connection but can't set its roles separately"

Connection-attached forms inherit the connection's `allowed_roles`. You do not set permissions on the form separately -- whoever can trigger the connection can fill the form. If you need independent form permissions, attach the form to a stage instead.

### "Edit tool shows fields from stages the user hasn't reached yet"

Edit tools only show fields from stages that the instance has already passed through (current and earlier stages). Fields from future stages are not available for editing.

### Tips

- **Start simple.** Begin with empty role arrays (everyone can do everything), verify the workflow works, then add restrictions one by one.
- **Test with different roles.** Create test participants with each role and walk through the workflow to verify that permissions work as expected.
- **Use the Stage Preview view.** In the builder, click a stage and check the Stage Preview -- it simulates what a participant sees at that stage, including which buttons and tools are available.
- **Save often.** The builder keeps changes in memory until you click Save. If you close the browser, unsaved changes are lost.
- **Self-loops for edits.** If you want an edit action that does not change the stage, create a connection from a stage back to itself (a self-loop). Attach an edit tool to it.
