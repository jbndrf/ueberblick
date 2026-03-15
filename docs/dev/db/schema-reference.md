# Schema Reference

All PocketBase collections and their current fields after all migrations have been applied.

## Collection Hierarchy

```
users (built-in auth)
projects
  +-- roles
  +-- participants (auth)
  +-- participant_custom_fields
  +-- workflows
  |     +-- workflow_stages
  |     +-- workflow_connections
  |     +-- tools_forms
  |     |     +-- tools_form_fields
  |     +-- tools_edit
  |     +-- tools_automation
  |     +-- tools_field_tags
  |     +-- workflow_instances
  |           +-- workflow_instance_tool_usage
  |           +-- workflow_instance_field_values
  +-- marker_categories
  |     +-- markers
  +-- map_layers
  +-- custom_tables
  |     +-- custom_table_columns
  |     +-- custom_table_data
  +-- offline_packages
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

Auth config: `passwordAuth.identityFields = ["token"]`, `emailAuth.enabled = false`.

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

### roles

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| project_id | relation -> projects | yes | maxSelect: 1 |
| name | text | yes | max: 255 |
| description | text | no | max: 1000 |

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
| visible_to_roles | relation -> roles | no | maxSelect: 99. Empty = all roles |
| visual_config | json | no | |

### workflow_connections

Transitions between stages. Self-loops (`from_stage_id == to_stage_id`) are edit actions.

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| workflow_id | relation -> workflows | yes | maxSelect: 1 |
| from_stage_id | relation -> workflow_stages | no | Null = entry connection |
| to_stage_id | relation -> workflow_stages | yes | maxSelect: 1 |
| action_name | text | yes | max: 255 |
| allowed_roles | relation -> roles | no | maxSelect: 99. Empty = all roles |
| visual_config | json | no | `{ button_label, button_color }` |

---

## Workflow Tools

### tools_forms

Form definitions. Attached to either a connection (transition form) or a stage (initial form). Set one of `connection_id` or `stage_id`, not both.

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| workflow_id | relation -> workflows | yes | maxSelect: 1 |
| connection_id | relation -> workflow_connections | no | maxSelect: 1 |
| stage_id | relation -> workflow_stages | no | maxSelect: 1 |
| name | text | yes | max: 255 |
| description | text | no | max: 1000 |
| allowed_roles | relation -> roles | no | maxSelect: 99 |
| visual_config | json | no | |

### tools_form_fields

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| form_id | relation -> tools_forms | yes | maxSelect: 1 |
| field_label | text | yes | max: 255 |
| field_type | select | yes | See values below |
| field_order | number | no | min: 0 |
| page | number | no | min: 1. For multi-page forms |
| page_title | text | no | max: 255 |
| is_required | bool | no | |
| placeholder | text | no | max: 255 |
| help_text | text | no | max: 1000 |
| validation_rules | json | no | |
| field_options | json | no | Options for dropdown/multiple choice |
| conditional_logic | json | no | Show/hide conditions |
| row_index | number | no | min: 0. Layout row |
| column_position | select | no | `left`, `right`, `full` |

**field_type values:** `short_text`, `long_text`, `number`, `email`, `date`, `file`, `dropdown`, `multiple_choice`, `smart_dropdown`, `custom_table_selector`.

### tools_edit

Edit tools. Attached to a connection or one-or-more stages. When `is_global = true` and `stage_id` has multiple stages, the tool appears at all those stages.

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| connection_id | relation -> workflow_connections | no | maxSelect: 1 |
| stage_id | relation -> workflow_stages | no | maxSelect: 99 (multi-relation for global tools) |
| name | text | yes | max: 255 |
| editable_fields | relation -> tools_form_fields | no | maxSelect: 99 |
| allowed_roles | relation -> roles | no | maxSelect: 99 |
| edit_mode | select | yes | `form_fields`, `location` |
| is_global | bool | no | |
| visual_config | json | no | |

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

### workflow_instance_field_values

Stores submitted form data. One record per field per instance.

| Field | Type | Required | Notes |
|-------|------|:---:|-------|
| instance_id | relation -> workflow_instances | yes | maxSelect: 1 |
| field_key | text | yes | max: 255. References tools_form_fields ID |
| value | text | no | String value |
| file_value | file | no | maxSelect: 1, maxSize: 10MB |
| stage_id | relation -> workflow_stages | yes | maxSelect: 1. Stage where data was entered |
| created_by_action | relation -> workflow_instance_tool_usage | no | maxSelect: 1 |
| last_modified_by_action | relation -> workflow_instance_tool_usage | no | maxSelect: 1 |
| last_modified_at | date | no | |

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

## Deleted Collections

These collections existed in earlier migrations but have been removed:

| Collection | Removed In | Replaced By |
|-----------|-----------|-------------|
| `map_settings` | `1768150004` | `map_layers` config + `projects.settings` |
| `map_sources` | `1772000000` | Fields merged into `map_layers` |

---

## Access Control Summary

The "empty array = all roles" convention applies to all role-based fields (`visible_to_roles`, `allowed_roles`, `entry_allowed_roles`). When the field is empty, access is granted to all participants in the project.

| Collection | Admin Access | Participant Read | Participant Write |
|-----------|-------------|-----------------|-------------------|
| projects | Owner | Own project only | -- |
| roles | Owner | Project members | -- |
| participants | Owner | Self only | -- |
| workflows | Owner | Active + visible_to_roles | -- |
| workflow_stages | Owner | Project members | -- |
| workflow_connections | Owner | allowed_roles | -- |
| workflow_instances | Owner | visible_to_roles + privacy check | entry_allowed_roles (create), stage roles (update) |
| workflow_instance_field_values | Owner | stage visible_to_roles | stage visible_to_roles |
| tools_forms | Owner | connection.allowed_roles or form.allowed_roles | -- |
| tools_form_fields | Owner | Project members | -- |
| tools_edit | Owner | connection.allowed_roles or tool.allowed_roles | -- |
| marker_categories | Owner | visible_to_roles | -- |
| markers | Owner | category visible_to_roles | Project members (create), category roles (update/delete) |
| map_layers | Owner | visible_to_roles | -- |
| custom_tables | Owner | visible_to_roles | -- |
| offline_packages | Owner | visible_to_roles + status=ready | -- |
