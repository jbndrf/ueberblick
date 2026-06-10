# Schema Reference

All PocketBase collections and their current fields after all migrations have been applied.

## Collection Hierarchy

```
users (built-in auth)
  +-- api_tokens  (optional -> projects)
projects
  +-- roles
  +-- participants (auth)
  +-- participant_custom_fields
  +-- workflows
  |     +-- workflow_stages
  |     +-- workflow_connections
  |     +-- workflow_field_defs
  |     +-- tools_forms
  |     |     +-- tools_form_field_refs  (-> workflow_field_defs)
  |     +-- tools_edit
  |     +-- tools_protocol  (-> tools_forms)
  |     +-- tools_automation
  |     +-- tools_field_tags
  |     +-- workflow_instances
  |           +-- workflow_instance_tool_usage
  |           +-- workflow_field_values  (-> workflow_field_defs)
  |           +-- workflow_protocol_entries  (-> tools_protocol)
  +-- marker_categories
  |     +-- markers
  +-- map_layers
  +-- custom_tables
  |     +-- custom_table_columns
  |     +-- custom_table_data
  +-- offline_packages
  +-- chat_messages  (author_id -> participants)
  +-- chat_read_state  (participant_id -> participants)
```

---

## Auth Collections

### users (built-in)

PocketBase built-in auth collection. ID: `_pb_users_auth_`. Used for admin/project owners.

### participants

Auth collection for field workers. Uses token-based login (not email/password).

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| project_id | relation -> projects | yes | maxSelect: 1 |
| name | text | yes | max: 255 |
| phone | text | no | max: 50 |
| token | text | yes | Unique. Used as identity field for login |
| is_active | bool | no | |
| expires_at | date | no | |
| last_active | date | no | |
| role_id | relation -> roles | no | maxSelect: 99 (multi-relation) |
| metadata | json | no | |
| self_joined | bool | no | True for guests minted via the public `/join/<slug>` endpoint |

Auth config: `passwordAuth.identityFields = ["token"]`, `emailAuth.enabled = false`, `authToken.duration = 7776000` (90 days; PocketBase default is 604800 = 7 days). The duration is set by migration `1780200000_participants_token_duration.js`.

Index: `CREATE UNIQUE INDEX idx_participants_token ON participants (token)`.

---

## Project & Organization

### projects

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| name | text | yes | max: 255 |
| description | text | no | max: 1000 |
| owner_id | relation -> users | yes | maxSelect: 1 |
| is_active | bool | no | |
| settings | json | no | maxSize: 100000. Map default center, zoom, etc. |
| icon | file | no | maxSelect: 1 |
| chat_enabled | bool | no | Master switch for the project chat. When false, no participant may read or post |
| chat_visible_to_roles | relation -> roles | no | maxSelect: 99. Roles allowed to use the chat. Empty = all project participants |

### roles

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| project_id | relation -> projects | yes | maxSelect: 1 |
| name | text | yes | max: 255 |
| description | text | no | max: 1000 |
| self_joinable | bool | no | When true, participants can self-enroll into this role via the public join link |
| join_slug | text | no | max: 64. Slug used in the public `/join/<slug>` endpoint |
| max_instances | number | no | min: 0. Per-participant cap on `workflow_instances` a participant in this role may create; 0/empty = unlimited. When a participant holds multiple roles, the most-permissive non-zero cap wins |

Index: `CREATE UNIQUE INDEX idx_roles_join_slug ON roles (join_slug) WHERE join_slug != ''` (sparse-unique).

### participant_custom_fields

Schema-defined custom fields for participants within a project.

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| project_id | relation -> projects | yes | maxSelect: 1 |
| field_name | text | yes | max: 255 |
| field_type | select | yes | `text`, `number`, `date`, `boolean` |
| is_required | bool | no | |
| default_value | text | no | max: 1000 |
| display_order | number | no | min: 0 |

Index: `CREATE UNIQUE INDEX idx_pcf_project_field ON participant_custom_fields (project_id, field_name)`.

---

## Workflow Definition

### workflows

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| project_id | relation -> projects | yes | maxSelect: 1, cascadeDelete |
| name | text | yes | max: 255 |
| description | text | no | max: 1000 |
| workflow_type | select | yes | `incident`, `survey` |
| marker_color | text | no | max: 7 (hex color) |
| icon_config | json | no | |
| is_active | bool | no | |
| entry_allowed_roles | relation -> roles | no | maxSelect: 99. Who can create new instances |
| private_instances | bool | no | When true, participants only see own instances |
| visible_to_roles | relation -> roles | no | maxSelect: 99. Which roles can see this workflow's instances |
| filter_value_icons | json | no | `Record<string, IconConfig>` for map filter icons |

### workflow_stages

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| workflow_id | relation -> workflows | yes | maxSelect: 1 |
| stage_name | text | yes | max: 255 |
| stage_type | select | yes | `start`, `intermediate`, `end` |
| stage_order | number | no | min: 0 |
| position_x | number | no | Canvas position |
| position_y | number | no | Canvas position |
| visual_config | json | no | |

Stage visibility is not a stored field: `workflow_stages` has no `visible_to_roles`. Per-stage role gating is no longer modelled here.

### workflow_connections

Transitions between stages. Self-loops (`from_stage_id == to_stage_id`) are edit actions.

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| workflow_id | relation -> workflows | yes | maxSelect: 1 |
| from_stage_id | relation -> workflow_stages | no | Null = entry connection |
| to_stage_id | relation -> workflow_stages | yes | maxSelect: 1 |
| action_name | text | yes | max: 255 |
| allowed_roles | relation -> roles | no | maxSelect: 99. Empty = all roles |
| visual_config | json | no | `{ button_label, button_color, button_icon, requires_confirmation, confirmation_message }` |
| sentry | json | no | CMMN-style conditional availability. See below. |

**sentry** — array of clauses, AND-ed together. The connection is available only when every clause matches; an empty/null array means always available. Evaluated client-side; `allowed_roles` gating still applies on top (a connection hidden by `allowed_roles` is never shown regardless of its sentry). Each clause:

```ts
{
  field_def_id: string;  // workflow_field_defs id; matched against the latest workflow_field_values row
  op: 'equals' | 'not_equals' | 'contains' | 'is_empty' | 'is_not_empty'
    | 'gt' | 'gte' | 'lt' | 'lte';
  value?: string;        // omitted for is_empty / is_not_empty
}
```

The clause reads the *latest* value for `field_def_id` on the instance (by `recorded_at`). `gt/gte/lt/lte` coerce both sides to numbers and fail if either is non-numeric; `contains` is case-insensitive.

---

## Workflow Tools

### tools_forms

Form definitions. A form can be attached three ways: (1) to a connection (transition form — set `connection_id`, gated by `connection.allowed_roles`); (2) to a stage (initial form — set `stage_id`, gated by the form's own `allowed_roles`); (3) **global** — leave both `connection_id` and `stage_id` empty, making the form available on every stage, gated by the form's own `allowed_roles`. Set at most one of `connection_id` or `stage_id`. The "empty `allowed_roles` = all roles" convention applies in all three cases. (Protocol-owned forms also leave both empty but are excluded from standalone form buttons — see `local_fields` below and `tools_protocol`.)

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| workflow_id | relation -> workflows | yes | maxSelect: 1 |
| connection_id | relation -> workflow_connections | no | maxSelect: 1 |
| stage_id | relation -> workflow_stages | no | maxSelect: 1 |
| name | text | yes | max: 255 |
| description | text | no | max: 1000 |
| allowed_roles | relation -> roles | no | maxSelect: 99 |
| visual_config | json | no | |
| tool_order | number | no | Ordering among tools attached to the same stage/connection |
| pages | json | no | `FormPage[]` — per-page metadata (`{ page, title, description }`) for multi-page forms |
| local_fields | json | no | `ProtocolLocalField[]` — inline protocol-only field defs. See below |

**local_fields** (`ProtocolLocalField[]` | null) — inline field definitions that live *only* on this form and never join the `workflow_field_defs` registry. Populated on forms that back a protocol tool when the admin adds fields that must not become workflow-wide. Their submitted values land only in `workflow_protocol_entries.snapshot.local_fields`, never in `workflow_field_values`. Scope is this single form: no stage assignment, no `view_roles`, no cross-form reuse — the owning protocol tool's `allowed_roles` is the only gate.

```ts
{
  key: string;
  label: string;
  field_type: Exclude<FieldType, 'instance_reference'>;
  field_options: Record<string, unknown> | null;
  required: boolean;
  placeholder: string | null;
  help_text: string | null;
  page: number;
  row_index: number;
  column_position: 'left' | 'right' | 'full';
  conditional_logic?: ConditionalLogic | null;
}
```

### workflow_field_defs

Canonical per-workflow field registry. Every data field lives here exactly once; forms, edit tools and field tags reference defs rather than redefining fields. **Identity is `label`, unique per workflow** (`idx_field_defs_workflow_label` on `(workflow_id, label)`) — this is what cross-project import matching keys on.

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| workflow_id | relation -> workflows | yes | maxSelect: 1, cascadeDelete |
| label | text | yes | max: 255. Field identity; unique per workflow |
| field_type | select | yes | See values below |
| write_mode | select | yes | `singleton`, `observation`, `computed`. See below |
| output_type | select | no | `text`, `number`, `date`, `json`. Declared result type (mainly for `computed`) |
| display_config | json | no | Participant "Data" view layout. See below |
| view_roles | relation -> roles | no | maxSelect: 99. Roles allowed to *read* this field's values. Empty = all roles. Enforced by `workflow_field_values` list/view rules |
| validation_rules | json | no | Per-field-type validation (e.g. `{ minLength, maxLength, pattern }`, `{ min, max, step }`, `{ minSelections, maxSelections }`) |
| field_options | json | no | Per-field-type options. See below |

**field_type values:** `short_text`, `long_text`, `number`, `email`, `date`, `file`, `dropdown`, `multiple_choice`, `smart_dropdown`, `custom_table_selector`, `instance_reference`.

**write_mode** — how values accumulate in `workflow_field_values`:

- `singleton` — one logical current value; re-saving appends a new row that supersedes the previous one (latest-by-`recorded_at` wins).
- `observation` — every write is kept as history; all rows are meaningful (time series of observations).
- `computed` — server-derived, read-only to participants; the engine appends the recomputed value.

Storage is append-only for all three (see `workflow_field_values`); `write_mode` is the semantic discriminator for how the current value and history are interpreted.

**display_config** (`FieldDisplayConfig` | null) — placement on the participant detail "Data" view. Null/empty = default "Data" tab, ordered by `created`. Tabs are emergent: the tab set is the distinct `tab` values across a workflow's defs.

```ts
{
  tab: string;        // tab name + identity; "" = default "Data" tab
  tabOrder: number;   // tab ordering (denormalized across defs in the tab)
  row: number;        // visual row within the tab (0-based)
  column: 'left' | 'right' | 'full';
}
```

**field_options** — shape depends on `field_type`:

- `dropdown` / `multiple_choice`: `{ options: { label, description? }[] }`
- `smart_dropdown`: `{ source_field, source_stage_id?, mappings: { when, options[] }[], allow_multiple? }`
- `date`: `{ date_mode: 'date' | 'datetime' | 'time', prefill_now? }`
- `file`: `{ allowed_file_types?: string[], max_files? }`
- `custom_table_selector`: `{ source_type: 'custom_table' | 'marker_category' | 'participants' | 'roles', allow_multiple?, custom_table_id?, display_field?, value_field?, marker_category_id?, self_select_roles?, any_select_roles?, allowed_roles? }`
- `instance_reference` (`InstanceReferenceOptions`):

  ```ts
  {
    target_workflow_id: string | null;  // null = any workflow; else restricts the picker
    multiplicity: 'single' | 'many';    // value column always stores a JSON array of instance ids
    on_delete: 'cascade' | 'nullify' | 'block';   // behavior when the referenced instance is deleted
    relation_kind: 'peer' | 'parent' | 'child';   // UI hint (parent/child = nested, peer = link)
  }
  ```

### tools_form_field_refs

Places a `workflow_field_defs` entry into a `tools_forms` form. The definitional side (label, type, options, validation) lives on the def; this join row carries only *per-form presentation*, collapsed into a single `config` JSON column. The same def can appear in multiple forms with different `config`. Unique per `(form_id, field_def_id)` (`idx_form_field_refs_unique`).

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| form_id | relation -> tools_forms | yes | maxSelect: 1, cascadeDelete |
| field_def_id | relation -> workflow_field_defs | yes | maxSelect: 1, cascadeDelete |
| config | json | no | Per-form layout & overrides. See below |

**config** (`FormFieldConfig`) — all layout and per-form overrides:

```ts
{
  field_order?: number;
  page?: number;                              // multi-page forms
  row_index?: number;                         // visual row (0-based)
  column_position?: 'left' | 'right' | 'full';
  is_required?: boolean;                      // per-form required override
  placeholder?: string;
  help_text?: string;
  conditional_logic?: ConditionalLogic | null; // show/hide conditions
}
```

### tools_edit

Edit tools. Let participants modify existing instances — either an inline edit of a subset of fields, or a map picker to move the instance's geometry. Attached to a connection or one-or-more stages. When `is_global = true` and `stage_id` holds multiple stages, the tool appears at all those stages.

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| workflow_id | relation -> workflows | yes | maxSelect: 1 |
| connection_id | relation -> workflow_connections | no | maxSelect: 1 |
| stage_id | relation -> workflow_stages | no | maxSelect: 99 (multi-relation for global tools) |
| name | text | yes | max: 255 |
| edit_mode | select | yes | `form_fields`, `location`. See below |
| editable_fields | relation -> workflow_field_defs | no | maxSelect: 99. The def subset this tool may edit (only used in `form_fields` mode) |
| self_edit_roles | relation -> roles | no | maxSelect: 99. Roles that may edit only instances they created |
| any_edit_roles | relation -> roles | no | maxSelect: 99. Roles that may edit any instance |
| is_global | bool | no | |
| tool_order | number | no | min: 0 |
| visual_config | json | no | |

**edit_mode**:

- `form_fields` — inline edit of the `editable_fields` subset. The field picker references `workflow_field_defs`; `computed` defs are filtered out (they are server-derived and not participant-editable).
- `location` — opens a map picker to move the instance geometry. No instance-type / field gate; `editable_fields` is ignored.

**Edit permission** is the union of `self_edit_roles` and `any_edit_roles`. `self_edit_roles` may edit only instances the participant created; `any_edit_roles` may edit any instance — "any" wins on overlap. Both empty = nobody may use the tool (these fields do *not* follow the "empty = all roles" convention).

Access control: list/view = the workflow owner, **or** a participant in the project whose role is in `any_edit_roles ∪ self_edit_roles`. create/update/delete = workflow owner only.

### tools_protocol

Protocol tools. A protocol tool **owns a form** (`protocol_form_id`) and records immutable log entries against an instance (see `workflow_protocol_entries`). Attached to a connection or one-or-more stages. When `is_global = true` and `stage_id` holds multiple stages, the tool appears at all of them.

A protocol tool's submission splits by where each field is declared: the owned form's **registry field-refs** (`tools_form_field_refs` -> `workflow_field_defs`) write through to `workflow_field_values` like any other form, while the form's **`local_fields`** are protocol-only and write to the entry snapshot only.

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| workflow_id | relation -> workflows | yes | maxSelect: 1, cascadeDelete |
| connection_id | relation -> workflow_connections | no | maxSelect: 1 |
| stage_id | relation -> workflow_stages | no | maxSelect: 99 (multi-relation for global tools) |
| is_global | bool | no | |
| name | text | yes | max: 255 |
| prefill_config | json | no | Prefill rules for the owned form |
| protocol_form_id | relation -> tools_forms | no | maxSelect: 1. The form this protocol tool owns |
| allowed_roles | relation -> roles | no | maxSelect: 99. Empty = all roles |
| visual_config | json | no | |
| tool_order | number | no | Ordering among tools at the same stage/connection |

### tools_automation

Automation rules triggered by workflow events.

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| workflow_id | relation -> workflows | yes | maxSelect: 1 |
| name | text | yes | max: 200 |
| trigger_type | select | yes | `on_transition`, `on_field_change`, `scheduled` |
| trigger_config | json | yes | |
| steps | json | yes | Sequential array of condition/action steps |
| is_enabled | bool | no | |
| last_run_at | date | no | Prevents double-execution for scheduled triggers |

### tools_field_tags

Semantic field tagging for filtering and display.

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| workflow_id | relation -> workflows | yes | maxSelect: 1 |
| tag_mappings | json | no | Array of `{ tagType, fieldId, config }` |

---

## Workflow Runtime

### workflow_instances

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| workflow_id | relation -> workflows | yes | maxSelect: 1 |
| current_stage_id | relation -> workflow_stages | yes | maxSelect: 1 |
| status | select | yes | `active`, `completed`, `archived`, `deleted` |
| created_by | relation -> participants | yes | maxSelect: 1 |
| location | geoPoint | no | |
| files | file | no | maxSelect: 99, maxSize: 10MB |
| last_activity_at | date | no | |

### workflow_instance_tool_usage

Audit trail of actions taken on an instance.

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| instance_id | relation -> workflow_instances | yes | maxSelect: 1 |
| executed_by | relation -> participants | no | Null for automations |
| executed_at | date | yes | |
| stage_id | relation -> workflow_stages | no | Stage where the action occurred |
| metadata | json | no | |

### workflow_protocol_entries

**Immutable, append-only** log of protocol entries recorded by a `tools_protocol` tool. Each row is a frozen snapshot of one submission and is never updated or deleted in normal operation (no participant update/delete rule).

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| instance_id | relation -> workflow_instances | yes | maxSelect: 1, cascadeDelete |
| stage_id | relation -> workflow_stages | yes | maxSelect: 1. Stage at which the entry was recorded |
| tool_id | relation -> tools_protocol | no | maxSelect: 1. The protocol tool that produced the entry |
| recorded_by | relation -> participants | no | maxSelect: 1. Null for automations |
| recorded_at | date | yes | Logical timestamp of the entry |
| snapshot | json | yes | Frozen `ProtocolEntrySnapshot`. See below |
| snapshot_hash | text | no | sha256 of the snapshot for integrity / dedup |
| files | file | no | maxSelect: 99, maxSize: 10MB |

**snapshot** (`ProtocolEntrySnapshot`) — self-contained record of the submission. Labels are denormalized so later renames don't rewrite history. `case_fields` are the values that also wrote through to `workflow_field_values` (registry-backed), `local_fields` are the form's protocol-only values. `kind` is `manual` for a recorded form submission or `global_autolog` for an auto-generated digest of tool-usage activity (in which case `autolog` carries the window and the rolled-up entries).

```ts
{
  kind: 'manual' | 'global_autolog';
  case_fields: Array<{
    field_def_id: string;
    key: string;
    label: string;
    value: unknown;
    write_mode: 'singleton' | 'observation' | 'computed';
  }>;
  local_fields: Array<{
    key: string;
    label: string;
    value: unknown;
  }>;
  autolog: {
    from: string;
    to: string;
    entries: Array<{
      tool_usage_id: string;
      tool_id: string;
      tool_name: string;
      recorded_at: string;
      recorded_by: string;
      stage_id: string;
    }>;
  } | null;   // null for kind: 'manual'
}
```

### workflow_field_values

**Append-only event log** of field values. Every write inserts a new row; rows are never updated in place. The **current value** of a field on an instance is the row with the latest `recorded_at` for that `(instance_id, field_def_id)` pair; full history is the ordered set of rows. This holds for all `write_modes` — `singleton`/`computed` are interpreted as "latest row wins" while `observation` treats every row as meaningful.

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| instance_id | relation -> workflow_instances | yes | maxSelect: 1, cascadeDelete |
| field_def_id | relation -> workflow_field_defs | yes | maxSelect: 1, cascadeDelete |
| write_mode | select | yes | `singleton`, `observation`, `computed`. Denormalized from the field def at write time |
| value | text | no | String value (instance_reference stores a JSON array of instance ids) |
| file_value | file | no | maxSelect: 1 |
| recorded_at | date | yes | Logical timestamp; ordering key for "latest wins" and history |
| recorded_by_action | relation -> workflow_instance_tool_usage | no | maxSelect: 1. Null for automations/computed |
| recorded_at_stage | relation -> workflow_stages | yes | maxSelect: 1. Stage where the value was recorded |

Indexes: `idx_field_values_instance` on `(instance_id)`; `idx_field_values_obs_history` on `(instance_id, field_def_id, recorded_at DESC)` — serves both "latest per field" and "last N per field" reads; `idx_field_values_stage` on `(recorded_at_stage)`.

Participant read access is gated per field def: the list/view rules require `field_def_id.view_roles` to be empty (all roles) or to include the participant's role, on top of project membership and `instance_id.status` not being `deleted`/`archived`. Every audit-trail / history UI inherits this field-level leak prevention for free.

---

## Map

### map_layers

Combined layer + source. The `map_sources` collection was merged into this one.

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| project_id | relation -> projects | yes | maxSelect: 1, cascadeDelete |
| name | text | yes | max: 255 |
| source_type | select | yes | `tile`, `wms`, `uploaded`, `preset`, `geojson` |
| layer_type | select | yes | `base`, `overlay` |
| url | text | no | max: 2000. Tile URL template or WMS endpoint |
| config | json | no | maxSize: 50000. `{ attribution, opacity, min_zoom, max_zoom, ... }` |
| display_order | number | no | min: 0 |
| visible_to_roles | relation -> roles | no | maxSelect: 99. Empty = all roles |
| is_active | bool | no | |
| status | select | no | `pending`, `processing`, `completed`, `failed` |
| progress | number | no | 0-100 |
| error_message | text | no | max: 5000 |
| tile_count | number | no | |

SpatiaLite geometry: `bounds` column (POLYGON, SRID 4326) with spatial index.

---

## Markers

### marker_categories

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| project_id | relation -> projects | yes | maxSelect: 1 |
| name | text | yes | max: 255 |
| description | text | no | max: 1000 |
| icon_config | json | no | maxSize: 50000. Includes SVG content |
| visible_to_roles | relation -> roles | no | maxSelect: 99. Empty = all roles |
| fields | json | no | maxSize: 100000. Custom field definitions |
| sort_order | number | no | min: 0 |

### markers

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| project_id | relation -> projects | yes | maxSelect: 1 |
| category_id | relation -> marker_categories | yes | maxSelect: 1, cascadeDelete |
| title | text | yes | max: 500 |
| description | text | no | max: 5000 |
| location | geoPoint | no | |
| properties | json | no | maxSize: 100000. Custom field values |
| visible_to_roles | relation -> roles | no | maxSelect: 99. Inherits from category in rules |
| created_by | relation -> users | no | maxSelect: 1 |

---

## Custom Tables

### custom_tables

User-defined data tables within a project.

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| project_id | relation -> projects | yes | maxSelect: 1 |
| table_name | text | yes | max: 100. Pattern: `^[a-z][a-z0-9_]*$` |
| display_name | text | yes | max: 255 |
| description | text | no | max: 1000 |
| main_column | text | yes | max: 100. Pattern: `^[a-z][a-z0-9_]*$` |
| sort_order | number | no | min: 0 |
| visible_to_roles | relation -> roles | no | maxSelect: 999. Empty = all roles |

### custom_table_columns

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| table_id | relation -> custom_tables | yes | maxSelect: 1, cascadeDelete |
| column_name | text | yes | max: 100. Pattern: `^[a-z][a-z0-9_]*$` |
| column_type | select | yes | `text`, `number`, `date`, `boolean` |
| is_required | bool | no | |
| default_value | text | no | max: 1000 |
| sort_order | number | no | min: 0 |

### custom_table_data

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| table_id | relation -> custom_tables | yes | maxSelect: 1, cascadeDelete |
| row_data | json | yes | maxSize: 100000. Key-value pairs matching column definitions |

---

## Offline

### offline_packages

Admin-managed tile packages for offline use.

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| name | text | yes | max: 255 |
| project_id | relation -> projects | yes | maxSelect: 1, cascadeDelete |
| region_geojson | json | yes | maxSize: 500000. GeoJSON polygon |
| zoom_min | number | no | 0-22 |
| zoom_max | number | no | 0-22 |
| layers | relation -> map_layers | no | maxSelect: 99 |
| status | select | yes | `draft`, `processing`, `ready`, `failed` |
| error_message | text | no | max: 5000 |
| tile_count | number | no | |
| file_size_bytes | number | no | |
| archive_file | file | no | maxSelect: 1, maxSize: 1GB. **Protected** (requires auth token) |
| visible_to_roles | relation -> roles | no | maxSelect: 99. Empty = all roles |
| created_by | relation -> users | no | maxSelect: 1 |

---

## Communication

### chat_messages

Project-level chat. One flat thread per project; messages are authored by participants and read by participants and the project owner.

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| project_id | relation -> projects | yes | maxSelect: 1, cascadeDelete |
| author_id | relation -> participants | yes | maxSelect: 1 |
| body | text | yes | max: 4000 |
| mentions | json | no | Server-authoritative. Re-extracted from `body` by `pb_hooks/chat.pb.js` on create/update; never trusted from the client |
| created | autodate | -- | |
| updated | autodate | -- | |

Indexes: `idx_chat_messages_project_created` on `(project_id, created DESC)` (thread read order); `idx_chat_messages_author` on `(author_id)`.

**Access rules** (identical for list/view/create/update/delete, with the author/membership additions noted):

- **list / view** — project owner (`project_id.owner_id = @request.auth.id`) **OR** a participant who is a member of the project (`@request.auth.collectionName = "participants" && project_id = @request.auth.project_id`) for whom chat is enabled and their role is allowed:

  ```
  project_id.chat_enabled = true
  && (project_id.chat_visible_to_roles:length = 0
      || @request.auth.role_id.id ?= project_id.chat_visible_to_roles.id)
  ```

- **create / update / delete** — the same membership + chat-enabled + role-allowed condition **AND** `author_id = @request.auth.id` (you may only act on your own messages). The owner branch still grants full access.

Edit/delete are additionally time-boxed: `pb_hooks/chat.pb.js` blocks updates and deletes more than 5 minutes after the message was created.

### chat_read_state

Per-participant, per-project read cursor. Drives unread counts and mention badges.

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| participant_id | relation -> participants | yes | maxSelect: 1, cascadeDelete |
| project_id | relation -> projects | yes | maxSelect: 1, cascadeDelete |
| last_read_at | date | yes | High-water mark for messages read |
| last_mention_seen_at | date | no | High-water mark for mentions acknowledged |
| created | autodate | -- | |
| updated | autodate | -- | |

Index: `CREATE UNIQUE INDEX idx_chat_read_state_participant_project ON chat_read_state (participant_id, project_id)` (one row per participant per project).

**Access rules** — all of list/view/create/update/delete are `participant_id = @request.auth.id`: a participant can only read and write their own cursor. `pb_hooks/chat.pb.js` enforces that `last_read_at` and `last_mention_seen_at` are monotonic (the timestamps cannot regress).

---

## API Access

### api_tokens

Personal access tokens for the GeoJSON export API and other GIS-client integrations. Owned by a `users` record (project owner); never used by participants.

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| user_id | relation -> users | yes | maxSelect: 1, cascadeDelete |
| project_id | relation -> projects | no | maxSelect: 1, cascadeDelete. Scopes the token to one project. **Empty = all of the owner's projects** |
| label | text | no | max: 255. Human-readable name |
| token_hash | text | yes | max: 64. sha256 hex (64 chars) of the raw token. Unique |
| last_four | text | no | max: 8. Last few chars of the raw token, for display |
| expires_at | date | no | Optional expiry |
| last_used_at | date | no | Updated on each successful API call |
| revoked | bool | no | Soft revocation flag |
| created | autodate | -- | |
| updated | autodate | -- | |

Indexes: `CREATE UNIQUE INDEX idx_api_tokens_token_hash ON api_tokens (token_hash)`; `idx_api_tokens_user` on `(user_id)`.

**Token format & storage** — the raw token is `ubk_` + base64url(32 random bytes) and is shown to the user **once** at creation. Only its sha256 hex digest is persisted in `token_hash`; the raw token is never stored and cannot be recovered.

**Access rules** — all of list/view/create/update/delete are:

```
user_id = @request.auth.id && @request.auth.collectionName = "users"
```

Only the owning user (an admin from the `users` collection) may manage their own tokens. Note: the GeoJSON export API does not read records through these collection rules — it authenticates the raw token, then runs the export impersonating the token's owner, so data visibility follows the owner's normal collection access, not the `api_tokens` rules.

---

## Deleted Collections

These collections existed in earlier migrations but have been removed:

| Collection | Removed In | Replaced By |
|-----------|-----------|-------------|
| `map_settings` | `1768150004` | `map_layers` config + `projects.settings` |
| `map_sources` | `1772000000` | Fields merged into `map_layers` |
| `tools_form_fields` | `1779000000` | `workflow_field_defs` (definition) + `tools_form_field_refs` (per-form placement) |
| `workflow_instance_field_values` | `1779000000` | `workflow_field_values` (append-only event log) |

---

## Access Control Summary

The "empty array = all roles" convention applies to all role-based fields (`visible_to_roles`, `allowed_roles`, `entry_allowed_roles`). When the field is empty, access is granted to all participants in the project.

| Collection | Admin Access | Participant Read | Participant Write |
|-----------|-------------|-----------------|-------------------|
| projects | Owner | Own project only | -- |
| roles | Owner | Project members | -- |
| participants | Owner (all) | Admin-minted: all authenticated users in scope; self_joined=true: owner only | -- |
| workflows | Owner | Active + visible_to_roles | -- |
| workflow_stages | Owner | Project members | -- |
| workflow_connections | Owner | allowed_roles | -- |
| workflow_instances | Owner | visible_to_roles + privacy check | entry_allowed_roles (create), stage roles (update) |
| workflow_field_defs | Owner | Project members; values readable per field-def view_roles | -- |
| workflow_field_values | Owner | field_def view_roles (+ instance not deleted/archived) | entry_allowed_roles |
| workflow_protocol_entries | Owner (read/update/delete) | Owner only — participants cannot list or view | Participants create-only (visible workflow + privacy + active/non-deleted instance) |
| tools_forms | Owner | connection-attached: connection.allowed_roles; stage-attached or global (neither set): form.allowed_roles (empty = all) | -- |
| tools_form_field_refs | Owner | inherited from owning form's role gating | -- |
| tools_edit | Owner | any_edit_roles ∪ self_edit_roles (empty = nobody) | -- |
| tools_protocol | Owner | allowed_roles (per attached stage/connection) | Participants create when visible (owner check) |
| marker_categories | Owner | visible_to_roles | -- |
| markers | Owner | category visible_to_roles | Project members (create), category roles (update/delete) |
| map_layers | Owner | visible_to_roles | -- |
| custom_tables | Owner | visible_to_roles | -- |
| offline_packages | Owner | visible_to_roles + status=ready | -- |
| chat_messages | Owner | Member where `chat_enabled` && (chat_visible_to_roles empty or includes role) | Same membership check **AND** `author_id = self` (create/update/delete); edit/delete blocked >5 min after create |
| chat_read_state | `participant_id = self` (all ops) | `participant_id = self` | `participant_id = self`; `last_read_at` / `last_mention_seen_at` monotonic |
| api_tokens | `user_id = self && collectionName = "users"` (all ops) | -- (no participant access) | -- |

`participants` listRule/viewRule:
`@request.auth.collectionName = 'users' || self_joined = false || self_joined = null || id = @request.auth.id`.
Admins (the `users` collection) see every participant. Ordinary admin-minted participants
(`self_joined` false/null) are visible to any authenticated requester in scope. Self-joined guests
(`self_joined = true`) are visible only to their own record (`id = @request.auth.id`).

The `api_tokens` rules only govern token *management*. The GeoJSON export API itself does not read
project data through the `api_tokens` collection rules — it validates the raw token, then performs the
export impersonating the token's owner, so the data returned follows that owner's normal collection
access.
