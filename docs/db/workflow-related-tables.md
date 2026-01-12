# Workflow-Related Database Tables

## Overview

These tables power the workflow builder system. The hierarchy is:

```
workflows
  └── workflow_stages
  └── workflow_connections (between stages)
        └── tools_forms (form tool on connection)
        └── tools_edit (edit tool on connection)
  └── tools_forms (initial form on start stage)
        └── tools_form_fields
```

## Tables

### workflow_stages

Stages within a workflow. Each workflow has exactly one `start` stage, zero or more `intermediate` stages, and one or more `end` stages.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | auto | - | Primary key |
| workflow_id | relation -> workflows | yes | Parent workflow |
| stage_name | text (max 255) | yes | Display name |
| stage_type | select | yes | `start`, `intermediate`, or `end` |
| stage_order | number | no | Order for listing |
| position_x | number | no | Canvas X position |
| position_y | number | no | Canvas Y position |
| visible_to_roles | multi-relation -> roles | no | Which roles can see instances at this stage |
| visual_config | JSON | no | Future: styling options |

### workflow_connections

Connections (transitions) between stages. When `from_stage_id == to_stage_id`, it's an edit action (self-loop).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | auto | - | Primary key |
| workflow_id | relation -> workflows | yes | Parent workflow |
| from_stage_id | relation -> workflow_stages | yes | Source stage |
| to_stage_id | relation -> workflow_stages | yes | Target stage (same = edit action) |
| action_name | text (max 255) | yes | Internal identifier |
| allowed_roles | multi-relation -> roles | no | Who can trigger this connection |
| visual_config | JSON | no | `{ button_label, button_color }` |

### tools_forms

Form definitions. A form belongs to either:
- A **connection** (data collection during transition)
- A **stage** (initial form for start stages)

One of `connection_id` or `stage_id` should be set, not both.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | auto | - | Primary key |
| workflow_id | relation -> workflows | yes | Parent workflow |
| connection_id | relation -> workflow_connections | no | If form belongs to a connection |
| stage_id | relation -> workflow_stages | no | If form belongs to a stage (start stage initial form) |
| name | text (max 255) | yes | Form name |
| description | text (max 1000) | no | Form description |
| allowed_roles | multi-relation -> roles | no | Who can see/fill this form (subset of connection/stage roles) |

### tools_form_fields

Fields within a form. Supports multi-page forms via `page` and `page_title`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | auto | - | Primary key |
| form_id | relation -> tools_forms | yes | Parent form |
| field_label | text (max 255) | yes | Display label |
| field_type | select | yes | See field types below |
| field_order | number | no | Order within page |
| page | number | no | Page number (default 1) |
| page_title | text (max 255) | no | Page header |
| is_required | bool | no | Whether field is required |
| placeholder | text (max 255) | no | Placeholder text |
| help_text | text (max 1000) | no | Help text below field |
| validation_rules | JSON | no | Type-specific validation |
| field_options | JSON | no | Options for dropdown/multiple choice |
| conditional_logic | JSON | no | Show/hide conditions |

**Field Types:**
- `short_text` - Single-line text input
- `long_text` - Multi-line textarea
- `number` - Numeric input
- `email` - Email input with validation
- `date` - Date picker
- `file` - File upload
- `dropdown` - Single-select dropdown
- `multiple_choice` - Multi-select checkboxes
- `smart_dropdown` - Options depend on another field's value

### tools_edit

Edit tool for connections. Specifies which existing fields can be modified when triggering the connection.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | auto | - | Primary key |
| connection_id | relation -> workflow_connections | yes | Parent connection |
| editable_fields | multi-relation -> tools_form_fields | yes | Which fields can be edited |
| allowed_roles | multi-relation -> roles | no | Who can use this edit tool (subset of connection roles) |

## Role Inheritance Model

```
Stage.visible_to_roles       = who sees instances at this stage
Connection.allowed_roles     = who can trigger this connection
Tool.allowed_roles           = who sees this specific tool (subset of parent)
                               null/empty = inherit from parent
```

## Examples

### Simple Workflow

```
[Start] --submit--> [Review] --approve--> [Done]
                           \--reject---> [Rejected]
```

**Stages:**
- Start (type: start, initial form attached)
- Review (type: intermediate)
- Done (type: end)
- Rejected (type: end)

**Connections:**
- submit: Start -> Review
- approve: Review -> Done
- reject: Review -> Rejected

### Edit Action (Self-Loop)

```
[Active] --edit--> [Active]
```

A connection where `from_stage_id == to_stage_id`. Attach a `tools_edit` to specify which fields can be modified.

### Role-Based Forms

Same connection, different forms per role:

```
Connection: submit (Start -> Review)
  └── tools_forms: "Basic Report" (allowed_roles: [reporter])
  └── tools_forms: "Detailed Report" (allowed_roles: [supervisor])
```

Reporter sees Basic Report form, Supervisor sees Detailed Report form.
