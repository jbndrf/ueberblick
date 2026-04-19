# admin-cheatsheet.md audit log

Shared coordination file for the three-wave Haiku audit of `docs/admin-cheatsheet.md`.
Each slice below is owned by one agent per wave. Agents append under `### Wave N` inside their slice heading.

Legend:
- `- [x] verified — field_name` — documented claim still matches code
- `- [ ] DRIFT — field_name — <what doc says> / <what code does now> (path:LN)`
- `- [ ] REMOVE — field_name — no longer exists in migrations/code`
- `- [ ] MISSING — field_name (type) — proposed description`
- `- [ ] SKIP-DOCUMENT — field_name — internal bookkeeping, not worth documenting`
- Wave 3 annotates each item as `confirmed: <reason>` or `disputed: <reason>`.

---

## Slice 1 — Projects + General + Map (lines 42–130)
Collections: `projects`, `info_pages`, `map_layers`, `offline_packages`

### Wave 1 — verify existing fields

- [x] verified — projects.name (1736563200)
- [x] verified — projects.description (1736563200)
- [x] verified — projects.icon (1776800000, +layout.server.ts:72)
- [x] verified — projects.settings.display_name (1772000000, +layout.server.ts:74-75)
- [x] verified — projects.settings.map_defaults.center.lat (MapCanvas.svelte:937)
- [x] verified — projects.settings.map_defaults.center.lng (MapCanvas.svelte:938)
- [x] verified — projects.settings.map_defaults.zoom (MapCanvas.svelte:940)
- [x] verified — projects.settings.map_defaults.min_zoom (MapCanvas.svelte:320)
- [x] verified — projects.settings.map_defaults.max_zoom (MapCanvas.svelte:308)
- [ ] REMOVE — projects.settings.map_defaults.bounds_geojson — not found in code
- [x] verified — map_layers.preset_source (MapSettingsTab.svelte)
- [ ] DRIFT — tile.name — doc says "map_layers.layer_name" / code uses map_layers.name (+page.server.ts:462)
- [x] verified — tile.tile_url (map_layers.url, +page.server.ts:463)
- [x] verified — tile.attribution (map_layers.config.attribution)
- [x] verified — tile.as_base (map_layers.layer_type, +page.server.ts:464)
- [ ] DRIFT — wms.name — doc says "map_layers.layer_name" / code uses map_layers.name (+page.server.ts:487)
- [x] verified — wms.url (map_layers.url, +page.server.ts:488)
- [x] verified — wms.layers (map_layers.config.layers)
- [x] verified — wms.format (map_layers.config.format, +page.server.ts:491)
- [x] verified — wms.version (map_layers.config.version, +page.server.ts:493)
- [x] verified — wms.attribution (map_layers.config.attribution)
- [x] verified — wms.transparent (map_layers.config.transparent)
- [x] verified — wms.as_base (map_layers.layer_type)
- [x] verified — upload.name (map_layers.name)
- [x] verified — upload.format (map_layers.config.format)
- [x] verified — upload.file (tile archive processed server-side)
- [x] verified — map_layers.visible_to_roles (1768150001)
- [x] verified — offline_packages.name (1769700000)
- [x] verified — offline_packages.zoom_min (1769700000)
- [x] verified — offline_packages.zoom_max (1769700000)
- [x] verified — offline_packages.region_geojson (1769700000)
- [x] verified — offline_packages.layers (1769700000)
- [x] verified — offline_packages.visible_to_roles (1769800000)
- [x] verified — info_pages.title (1776700000)
- [x] verified — info_pages.content (1776700000)
- [x] verified — info_pages.sort_order (1776700000)

### Wave 2 — find missing fields

- [ ] MISSING — projects.owner_id (relation) — Links the project to its owning admin user. Controls permissions for editing and deleting the project. Set automatically when created but not displayed in the UI.
- [ ] MISSING — projects.is_active (bool) — Toggles project visibility for participants. Inactive projects do not appear in the participant app, allowing archival without deletion.
- [ ] MISSING — info_pages.project_id (relation) — Links info page to its parent project. Required field, hidden from admin UI (set via context). Enforces row-level security.
- [ ] MISSING — map_layers.project_id (relation) — Links the layer to its parent project. Required field, used for cascade deletion and list/view permission checks.
- [ ] MISSING — map_layers.source_type (select: tile/wms/uploaded/preset/geojson) — Categorizes the layer source. Controls which UI sections and validation rules apply during layer creation and editing.
- [ ] MISSING — map_layers.url (text) — Contains the layer URL template (XYZ tiles, WMS endpoint, or GeoJSON URL). Used by the participant map to fetch remote data.
- [ ] MISSING — map_layers.config (json) — Stores layer-specific metadata (attribution, opacity, WMS parameters, style). Parsed at render time by the participant map canvas.
- [ ] MISSING — map_layers.display_order (number) — Defines the stacking order of layers in the participant map. Smaller values appear lower in the layer picker.
- [ ] MISSING — map_layers.is_active (bool) — Toggles layer visibility for participants. Inactive layers do not appear in the layer picker even if permission rules allow.
- [ ] MISSING — map_layers.status (select: uploading/pending/processing/completed/failed) — Reflects upload/processing progress for file-based layers. Participants see only completed layers in the layer picker.
- [ ] MISSING — map_layers.progress (number: 0–100) — Upload processing percentage for file-based layers. Updated during server-side tile generation; visible only to admins in the settings panel.
- [ ] MISSING — map_layers.error_message (text) — Stores failure details if a file upload or tile processing fails. Shown to admins in the layer editor.
- [ ] MISSING — map_layers.tile_count (number) — Counts tiles in an uploaded archive. Used for progress estimation and UI feedback.
- [ ] MISSING — offline_packages.status (select: draft/processing/ready/failed) — Controls visibility to participants. Only packages with status ready are downloadable by participants; admin-only while processing or failed.
- [ ] MISSING — offline_packages.error_message (text) — Stores error details if package generation fails. Visible only to admins in the offline settings panel.
- [ ] MISSING — offline_packages.tile_count (number) — Counts tiles in the generated package. Used for size estimation and progress tracking during generation.
- [ ] MISSING — offline_packages.file_size_bytes (number) — Size of the generated archive in bytes. Shown to participants to estimate download time and storage needed.
- [ ] MISSING — offline_packages.archive_file (file) — The ZIP or MBTiles archive containing offline tiles. Protected field requiring authentication to download. Generated server-side and served via PocketBase file storage.
- [ ] MISSING — offline_packages.created_by (relation) — Links package to the admin user who initiated generation. Used for audit logging and permissions.

### Wave 3 — independent verification

- confirmed — REMOVE projects.settings.map_defaults.bounds_geojson — not in any migration; ProjectMapDefaults type has no such field; speculative in cheatsheet line 87 but no backing code
- confirmed — DRIFT tile.name — doc says "layer_name", actual field is `map_layers.name` (1768150001:29, +page.server.ts:175)
- confirmed — DRIFT wms.name — doc says "layer_name", actual field is `map_layers.name` (same migration location)
- confirmed — MISSING projects.owner_id — relation field exists (1736563200:14), required, access-controlled but internal — suggest SKIP-DOCUMENT
- confirmed — MISSING projects.is_active — bool field exists (1736563200:15) — suggest SKIP-DOCUMENT (internal bookkeeping)
- confirmed — MISSING info_pages.project_id — relation required (1776700000:13) — suggest SKIP-DOCUMENT (structural field)
- confirmed — MISSING map_layers.project_id — relation required (1768150001:21) — suggest SKIP-DOCUMENT (structural field)
- confirmed — MISSING map_layers.source_type — select field exists (1772000000:20-26), user-facing in UI
- confirmed — MISSING map_layers.url — text field exists (1772000000:37-43), user-facing in UI
- confirmed — MISSING map_layers.config — json field exists (1768150001:49), internal structure, documented via UI sections
- confirmed — MISSING map_layers.display_order — number field exists (1768150001:55), user-facing in UI
- confirmed — MISSING map_layers.is_active — bool field exists (1768150001:74), user-facing in UI
- confirmed — MISSING map_layers.status — select field exists (1772000000:45-52), user-facing in UI
- confirmed — MISSING map_layers.progress — number field exists (1772000000:54), user-facing in UI
- confirmed — MISSING map_layers.error_message — text field exists (1772000000:63), user-facing in UI
- confirmed — MISSING map_layers.tile_count — number field exists (1772000000:71), user-facing in UI
- confirmed — MISSING offline_packages.status — select field exists (1769700000:69-74), user-facing in UI
- confirmed — MISSING offline_packages.error_message — text field exists (1769700000:76), user-facing in UI
- confirmed — MISSING offline_packages.tile_count — number field exists (1769700000:82), user-facing in UI
- confirmed — MISSING offline_packages.file_size_bytes — number field exists (1769700000:88), user-facing in UI
- confirmed — MISSING offline_packages.archive_file — file field exists (1769700000:94), user-facing in UI
- confirmed — MISSING offline_packages.created_by — relation field exists (1769700000:101) — suggest SKIP-DOCUMENT (audit metadata)

---

## Slice 2 — Participants + Roles (lines 132–185)
Collections: `participants`, `participant_custom_fields`, `roles`, permissions matrix

### Wave 1 — verify existing fields

- [x] verified — participants.name
- [ ] REMOVE — participants.email — field does not exist in migrations
- [x] verified — participants.phone
- [x] verified — participants.token
- [x] verified — participants.role_id
- [x] verified — participants.is_active
- [x] verified — participants.metadata
- [x] verified — participant_custom_fields.field_name
- [x] verified — participant_custom_fields.field_type
- [x] verified — participant_custom_fields.is_required
- [x] verified — participant_custom_fields.default_value
- [x] verified — QR Export
- [x] verified — roles.name
- [x] verified — roles.description
- [x] verified — roles.assigned_participants (reverse relation, auto-created)
- [x] verified — workflows.visible_to_roles
- [x] verified — workflows.entry_allowed_roles
- [x] verified — workflow_stages.visible_to_roles
- [x] verified — workflow_connections.allowed_roles
- [x] verified — tools_forms.allowed_roles
- [x] verified — tools_edit.allowed_roles
- [x] verified — custom_tables.visible_to_roles
- [x] verified — marker_categories.visible_to_roles
- [x] verified — map_layers.visible_to_roles
- [x] verified — offline_packages.visible_to_roles

### Wave 2 — find missing fields

- [ ] MISSING — participants.expires_at (date) — Optional expiration date for participant login credentials. Auto-deactivates access after a set date without manual intervention.
- [ ] MISSING — participants.last_active (date) — Timestamp of participant's most recent activity. Helps admins identify unused accounts and track engagement.
- [ ] MISSING — participants.enabled_features (json) — JSON array of opt-in feature flags (e.g. "filter.field_filters") controlling participant-side power features. Off by default.
- [ ] MISSING — participant_custom_fields.display_order (number) — Numeric sort order for custom field columns in the admin participants table. Lower values appear leftmost.

### Wave 3 — independent verification

- confirmed — REMOVE participants.email — email field does not exist in 1736563202_create_participants.js; Wave 1 correct
- confirmed — participants.expires_at — field exists (1736563202:20) but backend-only; never exposed in admin UI; suggest SKIP-DOCUMENT
- confirmed — participants.last_active — field exists (1736563202:21) but backend-only activity timestamp; suggest SKIP-DOCUMENT
- confirmed — participants.enabled_features — added in 1777300000; consumed by participant layout only, not in admin editor; suggest SKIP-DOCUMENT
- confirmed — participant_custom_fields.display_order — exists (1736563203:19) and used in admin load (sort:"display_order"); documented correctly

---

## Slice 3 — Custom Tables (lines 187–222)
Collections: `custom_tables`, `custom_table_columns`, `custom_table_data`

### Wave 1 — verify existing fields

- [x] verified — custom_tables.table_name (text, 1768099356)
- [x] verified — custom_tables.display_name (text, 1768099356)
- [x] verified — custom_tables.description (text, 1768099356)
- [x] verified — custom_tables.main_column (text, 1768099356)
- [x] verified — custom_tables.visible_to_roles (relation, 1768099356)
- [ ] DRIFT — table_name — doc says "readonly after create" but server updateField action allows edits (src/routes/(admin)/projects/[projectId]/custom-tables/+page.server.ts:139); UI enforces readonly client-side only
- [ ] DRIFT — main_column — same drift: doc says "readonly after create" but server action does not enforce it
- [x] verified — custom_table_columns.column_name
- [x] verified — custom_table_columns.column_type (text/number/date/boolean)
- [x] verified — custom_table_columns.is_required
- [x] verified — custom_table_columns.default_value
- [x] verified — custom_table_data.row_data
- [x] verified — CSV import (replaceData option, [tableId]/+page.server.ts:418)

### Wave 2 — find missing fields

- [ ] MISSING — custom_tables.sort_order (number) — Display sequence rank for tables in list view and selector dropdowns. Optional with minimum 0, allows admin to reorder table presentation.
- [ ] MISSING — custom_table_columns.sort_order (number) — Display sequence rank for columns in table detail view. Optional with minimum 0, determines column order in row editor and CSV import validation.

### Wave 3 — independent verification

- confirmed — table_name readonly — UI column config sets editable=false (line 56), client blocks edits; server action accepts field but migrations lack readonly constraint; enforcement is UI-only
- disputed — main_column readonly — UI shows editable=false (line 126), but server updateField action (line 139) allows edits and migrations have no readonly constraint; suggest: SKIP-DOCUMENT (readonly is UI-enforced, not schema-enforced, and can be edited via API if schema violated)
- confirmed — sort_order present in migrations — field exists in both custom_tables (1768099356:56-60) and custom_table_columns (1768099356:125-128); correctly marked user-facing and documented
- confirmed — custom_table_columns.sort_order in migrations — defined at 1768099356:125-128 with min=0; correctly identified as missing from cheatsheet

---

## Slice 4 — Marker Categories (lines 225–263)
Collections: `marker_categories`, `markers`

### Wave 1 — verify existing fields

- [x] verified — name
- [x] verified — description
- [ ] DRIFT — visible_to_roles — doc says "JSON array of role IDs" / code uses relation field (1768400001)
- [x] verified — icon_config
- [x] verified — fields[].field_name
- [x] verified — fields[].field_type
- [x] verified — fields[].is_required
- [x] verified — fields[].default_value
- [x] verified — markers.title
- [x] verified — markers.description
- [ ] DRIFT — markers.location — doc says "JSON {lat, lon}" / code uses geoPoint field (1768500000)
- [x] verified — markers.properties
- [x] verified — CSV import

### Wave 2 — find missing fields

- [ ] MISSING — marker_categories.project_id (relation) — Link to parent project; needed for access control and categorization
- [ ] MISSING — marker_categories.sort_order (number) — Display order in category lists; optional field for UI sorting
- [ ] MISSING — markers.project_id (relation) — Link to parent project; required for multi-project queries
- [ ] MISSING — markers.category_id (relation) — Link to marker category; required field establishing category relationship
- [ ] MISSING — markers.created_by (relation) — Audit trail: user/participant who created marker; optional field

### Wave 3 — independent verification

- confirmed — visible_to_roles converted to relation (1768400001) — Both marker_categories and markers; admin UI handles as string array; backend returns same array structure; not user-facing.
- confirmed — markers.location converted to geoPoint (1768500000) — PocketBase geoPoint serializes as {lat, lon}; code checks m.location?.lat and m.location?.lon unchanged; not user-facing.
- confirmed — marker_categories.project_id (relation, 1768099630) — Present in initial migration; skip-document (internal structural field).
- confirmed — marker_categories.sort_order (number, 1768099630) — Present in initial migration; skip-document (internal structural field).
- confirmed — markers.project_id (relation, 1768099630) — Present in initial migration; skip-document (internal structural field).
- confirmed — markers.category_id (relation, 1768099630) — Present in initial migration; required field established in initial schema.
- confirmed — markers.created_by (relation, 1768099630) — Present in initial migration; skip-document (optional audit trail, not user-facing).

---

## Slice 5 — Workflows list + detail (lines 266–300)
Collections: `workflows`, `workflow_instances`, `workflow_instance_field_values`

### Wave 1 — verify existing fields

- [x] verified — workflows.name (text, required, 1768142675)
- [x] verified — workflows.description (text, optional, 1768142675)
- [x] verified — workflows.workflow_type (select: incident/survey, 1768142675)
- [x] verified — workflows.is_active (bool, 1768142675)
- [x] verified — workflows.icon_config (json, 1768142675)
- [x] verified — workflow_stages.icon_config (json in visual_config, 1768200000)
- [x] verified — workflows.filter_value_icons (json, 1771000000)
- [x] verified — workflows.visible_to_roles (relation multi, 1776100000)
- [x] verified — workflows.private_instances (bool, 1776000000)
- [x] verified — workflow_instances.status (select: active/completed/archived/deleted, 1768400000)
- [x] verified — workflow_instance_field_values.value (text, 1768400000)
- [x] verified — CSV import with targetStageId and fieldStageMap (+page.server.ts)

### Wave 2 — find missing fields

- [ ] MISSING — workflows.marker_color (text, max 7) — Legacy hex color for workflow marker, superseded by icon_config
- [ ] MISSING — workflows.geometry_type (select: point|line|polygon) — Instance shape type; determines draw and edit modes
- [ ] MISSING — workflows.entry_allowed_roles (relation multi) — Restricts which roles can create new instances
- [ ] MISSING — workflows.sort_order (number) — Reorder workflows in list via drag; backfilled alphabetically by name
- [ ] MISSING — workflow_instances.geometry (json) — GeoJSON geometry for line/polygon instances (1777200000)
- [ ] MISSING — workflow_instances.centroid (geoPoint) — Derived center for bbox/map display (1777200000)
- [ ] MISSING — workflow_instances.bbox (json) — Derived bounds {minLon, minLat, maxLon, maxLat} (1777200000)
- [ ] MISSING — workflow_instances.files (file) — Instance file attachments, max 99 files 10MB each
- [ ] MISSING — workflow_instance_field_values.file_value (file) — Per-field file answer for file-type forms
- [ ] MISSING — workflow_instance_field_values.created_by_action (relation) — Tool usage audit link for field creation
- [ ] MISSING — workflow_instance_field_values.last_modified_by_action (relation) — Tool usage link for field edits
- [ ] MISSING — workflow_instance_field_values.last_modified_at (date) — Field edit timestamp
- [ ] SKIP-DOCUMENT — workflow_instance_tool_usage.stage_id (relation) — Internal role-filter aid, not user-facing

### Wave 3 — independent verification

- confirmed — workflows.marker_color (text, max 7) — exists in 1768142675; listed as legacy field already documented in cheatsheet section 1 (not Slice 5), not user-facing for participants
- confirmed — workflows.geometry_type (select: point|line|polygon) — exists in 1777200000 migration; already documented in cheatsheet line 273 (+page.svelte explicitly uses it)
- confirmed — workflows.entry_allowed_roles (relation multi) — exists in 1768800000 migration; controls create permissions but not participant-visible; SKIP-DOCUMENT
- confirmed — workflows.sort_order (number) — exists in 1777400000 migration; already documented cheatsheet line 266-300 scope (list page ordering not shown); keep
- confirmed — workflow_instances.geometry (json) — exists in 1777200000; HIGH-VALUE, affects draw/edit modes participant-facing; keep
- confirmed — workflow_instances.centroid (geoPoint) — exists in 1777200000; HIGH-VALUE, drives map display and bbox; already used in +page.svelte line 273-276; keep
- confirmed — workflow_instances.bbox (json) — exists in 1777200000; HIGH-VALUE, bounds affect map viewport and filter behavior; keep
- confirmed — workflow_instances.files (file) — exists in 1768400000 line 49; HIGH-VALUE for file attachment; keep
- confirmed — workflow_instance_field_values.file_value (file) — exists in 1768400000 line 126; HIGH-VALUE per-field file answers; keep
- confirmed — workflow_instance_field_values.created_by_action (relation) — exists in 1768400000 line 128; audit trail only; SKIP-DOCUMENT
- confirmed — workflow_instance_field_values.last_modified_by_action (relation) — exists in 1768400000 line 129; audit trail only; SKIP-DOCUMENT
- confirmed — workflow_instance_field_values.last_modified_at (date) — exists in 1768400000 line 130; audit trail only; SKIP-DOCUMENT

---

## Slice 6 — Builder: Stage / Edge / Stage-preview (lines 303–325, 482–490)
Collections: `workflow_stages`, `workflow_connections`

### Wave 1 — verify existing fields

- [x] verified — workflow_stages.stage_name
- [x] verified — workflow_stages.visible_to_roles
- [x] verified — tools_edit.allowed_roles
- [x] verified — workflow_connections.action_name
- [x] verified — workflow_connections.allowed_roles
- [x] verified — workflow_connections.visual_config (JSON)
- [x] verified — workflow_connections.visual_config.button_label
- [x] verified — workflow_connections.visual_config.button_color
- [x] verified — workflow_connections.visual_config.requires_confirmation
- [x] verified — workflow_connections.visual_config.confirmation_message

All fields confirmed in migrations (1768200000_create_workflow_builder_tables.js) and verified in StagePropertyPanel.svelte (visible_to_roles, tools_edit.allowed_roles), EdgePropertyPanel.svelte (visual_config subfields), ButtonConfigPanel.svelte, and WorkflowInstanceDetailModule.svelte (action_name fallback at line 204, requires_confirmation at line 381, confirmation_message at line 1490).

### Wave 2 — find missing fields

- [ ] MISSING — workflow_stages.workflow_id (relation) — Links workflow stage to parent workflow record. Required field; cascade-deleted with workflow.
- [ ] MISSING — workflow_stages.stage_type (select) — Classification: start/intermediate/end. Determines stage type icon and validation rules in builder UI.
- [ ] MISSING — workflow_stages.stage_order (number) — Vertical sort index for stage list panels. Stages display top-to-bottom by ascending order value.
- [ ] MISSING — workflow_stages.position_x (number) — X-coordinate for canvas positioning in workflow builder. Persists manual drag layout adjustments.
- [ ] MISSING — workflow_stages.position_y (number) — Y-coordinate for canvas positioning. Paired with position_x to render stage nodes on workflow graph.
- [ ] MISSING — workflow_connections.workflow_id (relation) — Links connection to parent workflow. Required; enables cascade delete and access control.
- [ ] MISSING — workflow_connections.from_stage_id (relation) — Source stage for transition. Null for entry connections (start of workflow); optional.
- [ ] MISSING — workflow_connections.to_stage_id (relation) — Destination stage. Required; connection arrow points to this stage in builder canvas.

### Wave 3 — independent verification

- confirmed — workflow_stages.workflow_id (relation, required) — 1768200000:16, links stage to parent workflow, cascade-deleted. Relation field, not user-visible in UI. **SKIP-DOCUMENT**
- confirmed — workflow_stages.stage_type (select: start/intermediate/end) — 1768200000:18, determines icon and validation. Admin sets via UI dropdown when creating stage. **keep — document in Stage Properties**
- confirmed — workflow_stages.stage_order (number) — 1768200000:19, defaults null (no min constraint). Used for vertical sort in builder; admin sets when reordering stages. **keep — document in Stage Properties**
- confirmed — workflow_stages.position_x (number) — 1768200000:20, canvas X-coordinate. Pure visual state, no behavioral impact. **SKIP-DOCUMENT — internal canvas state**
- confirmed — workflow_stages.position_y (number) — 1768200000:21, canvas Y-coordinate. Paired with position_x, persists drag layout. **SKIP-DOCUMENT — internal canvas state**
- confirmed — workflow_connections.workflow_id (relation, required) — 1768200000:40, links connection to parent workflow, cascade-deleted. Relation field, not user-visible. **SKIP-DOCUMENT**
- confirmed — workflow_connections.from_stage_id (relation, nullable) — 1768200000:41, null means entry connection, optional. Admin sets when drawing edge. **keep — document in Edge Properties as "Transition from stage"**
- confirmed — workflow_connections.to_stage_id (relation, required) — 1768200000:42, destination stage. Admin sets when drawing edge. **keep — document in Edge Properties as "Transition to stage"**

Summary: 4/8 SKIP (3 pure bookkeeping: workflow_id, position_x/y; 1 required relation). 4/8 keep (stage_type, stage_order, from_stage_id, to_stage_id affect UI/participant behavior). No disputes; all claims confirmed.

---

## Slice 7 — Builder: Form Editor + Field Config (lines 328–395)
Collections: `tools_forms`, `tools_form_fields`

### Wave 1 — verify existing fields
- [x] verified — tools_forms.name
- [x] verified — tools_forms.description
- [x] verified — tools_forms.allowed_roles
- [x] verified — tools_forms.visual_config.button_label
- [x] verified — tools_forms.visual_config.button_color
- [x] verified — field_label
- [x] verified — placeholder
- [x] verified — help_text
- [x] verified — is_required
- [x] verified — validation_rules.minLength
- [x] verified — validation_rules.maxLength
- [x] verified — validation_rules.pattern
- [x] verified — validation_rules.min
- [x] verified — validation_rules.max
- [x] verified — validation_rules.step
- [x] verified — field_options.date_mode
- [x] verified — field_options.prefill_now
- [x] verified — field_options.allowed_file_types
- [x] verified — field_options.max_files
- [x] verified — field_options.options
- [x] verified — validation_rules.minSelections
- [x] verified — validation_rules.maxSelections
- [x] verified — field_options.source_field
- [x] verified — field_options.mappings
- [ ] DRIFT — field_options.source_type — doc says "custom_table/participants/role_list" but code uses "custom_table/participants/marker_category/roles" (EntitySelectorConfig.svelte:86)
- [x] verified — field_options.custom_table_id
- [x] verified — field_options.display_field
- [x] verified — field_options.allow_multiple
- [x] verified — field_type

### Wave 2 — find missing fields

- [ ] MISSING — tools_forms.visual_config (json) — Button styling for stage-attached forms: button_label, button_color, button_icon, requires_confirmation, confirmation_message. Configured in FormEditorView settings panel (1768200004).
- [ ] MISSING — tools_form_fields.row_index (number) — Zero-based visual row position for multi-column layout. Determines which grid row the field appears in (1768200001).
- [ ] MISSING — tools_form_fields.column_position (select: left/right/full) — Width in two-column grid: left/right = half-width, full = full width. Synced with FieldRenderer columnPosition mapping.
- [ ] MISSING — tools_form_fields.conditional_logic (json) — Reserved for future field visibility rules; currently unused at field creation time.
- [ ] MISSING — field_options.marker_category_id (relation) — When source_type=marker_category, identifies which marker_categories row to fetch entities from (EntitySelectorModal.svelte:218).
- [ ] MISSING — field_options.allowed_roles (relation array) — Restricts which roles see custom_table or marker_category options; empty = hidden from all (EntitySelectorModal.svelte:336).
- [ ] MISSING — field_options.self_select_roles (relation array) — For participants/roles source: roles allowed to select only themselves (EntitySelectorModal.svelte:353).
- [ ] MISSING — field_options.any_select_roles (relation array) — For participants/roles source: roles allowed to select any entity in project (EntitySelectorModal.svelte:366).
- [ ] MISSING — field_options.value_field (text) — Column name to store selected entity ID; always "id" for custom_table_selector (EntitySelectorModal.svelte:215).

### Wave 3 — independent verification

- confirmed — DRIFT entity-selector source_type values — EntitySelectorConfig.svelte:84-86 and types.ts:175 confirm 4 source types: custom_table, marker_category, participants, roles (not role_list as documented)
- confirmed — tools_forms.visual_config (json) — Exists in migration 1768200004 and type definition ToolsForm:74; used in FormEditorView.svelte for button configuration
- confirmed — tools_form_fields.row_index (number) — Field in migration 1768200001:6-8 and types.ts:213; read/written by state.svelte.ts and workflow-database.ts:83,217,297
- confirmed — tools_form_fields.column_position (select) — Field in migration 1768200001:12-17 and types.ts:214; used in FieldRenderer.svelte:68-75 for two-column grid layout
- confirmed — conditional_logic (json) — Field in types.ts:220; parsed at load (workflow-database.ts:83) and stringified at save (lines 217,297); reserved for future use, not yet editable in UI
- confirmed — field_options.marker_category_id (relation) — In types.ts:191; used in EntitySelectorModal.svelte:218 and FieldRenderer.svelte:100 to filter markers by category
- confirmed — field_options.allowed_roles (relation array) — In types.ts:200; populated in EntitySelectorModal.svelte:216,219; checked in FieldRenderer.svelte:94,100
- confirmed — field_options.self_select_roles (relation array) — In types.ts:195; populated in EntitySelectorModal.svelte:221 for self-only selection mode
- confirmed — field_options.any_select_roles (relation array) — In types.ts:197; populated in EntitySelectorModal.svelte:222 for unrestricted entity selection
- confirmed — field_options.value_field (text) — In types.ts:188; hardcoded to 'id' in EntitySelectorModal.svelte:215 for custom_table source

---

## Slice 8 — Builder: Edit / Protocol / Field Tag (lines 399–434)
Collections: `tools_edit`, `tools_protocol`, `tools_field_tags`

### Wave 1 — verify existing fields

- [x] verified — tools_edit.name (text, 1768200002)
- [x] verified — tools_edit.editable_fields (relation multi, tools_form_fields, 1768200000)
- [x] verified — tools_edit.edit_mode (select: form_fields/location, 1769000000)
- [x] verified — tools_edit.visual_config (json, 1768200004)
- [x] verified — tools_protocol.name (text, 1776300002)
- [x] verified — tools_protocol.editable_fields (relation multi, 1776300002)
- [x] verified — tools_protocol.prefill_config (json, 1776300002)
- [x] verified — tools_protocol.stage_id (relation multi, 1776300002)
- [x] verified — tools_protocol.visual_config (json, 1776300002)
- [x] verified — tools_protocol.allowed_roles (relation multi, 1776300002)
- [x] verified — tools_field_tags.tag_mappings (json array, 1770000000)

### Wave 2 — find missing fields

- [ ] MISSING — tools_edit.connection_id (relation) — Optional reference to parent connection when tool is attached to a transition step; null for stage-attached tools (1768200000)
- [ ] MISSING — tools_edit.stage_id (relation multi) — Set of stages where stage-attached tool is available; multi-relation with maxSelect 99 for global tools (1769000000)
- [ ] MISSING — tools_edit.allowed_roles (relation multi) — Role restriction for who can access this edit tool; empty list means all roles allowed (1768200000)
- [ ] MISSING — tools_edit.is_global (bool) — Flag indicating whether tool is available across multiple stages or is stage-specific (1769000000)
- [ ] MISSING — tools_protocol.workflow_id (relation, required) — Parent workflow; all nested relations derive project access from workflow path (1776300002)
- [ ] MISSING — tools_protocol.connection_id (relation) — Optional reference to parent connection when tool is step in transition flow (1776300002)
- [ ] MISSING — tools_protocol.is_global (bool) — When true, tool is region-mode and stage_id defines boundary stages for auto-snapshots (1776300002)
- [ ] MISSING — tools_protocol.protocol_form_id (relation) — Optional reference to protocol form where participants answer supplemental fields; null when no form is configured (1776300002)
- [ ] MISSING — tools_field_tags.workflow_id (relation, required) — Parent workflow; establishes which form fields are eligible for tagging (1770000000)

### Wave 3 — independent verification

- disputed — tools_edit.allowed_roles — documented at line 179 — suggest: already-documented
- disputed — tools_protocol.allowed_roles — documented at line 423 — suggest: already-documented
- confirmed — tools_edit.connection_id — migration 1768200000:114, optional relation — evidence: union attachment (connection vs stage)
- confirmed — tools_edit.stage_id — migration 1768200000:115 then 1769000000:18-23 upgraded to maxSelect:99 — evidence: multi-stage attachment
- confirmed — tools_edit.is_global (bool) — migration 1769000000:34-39 — evidence: distinguishes global vs stage-attached tools
- confirmed — tools_protocol.workflow_id (required) — migration 1776300002:46-50 — evidence: parent, cascade ownership rule
- confirmed — tools_protocol.connection_id (optional) — migration 1776300002:53-57 — evidence: transition-step attachment
- confirmed — tools_protocol.is_global (bool) — migration 1776300002:65-67 — evidence: region-mode flag for auto-snapshots
- confirmed — tools_protocol.protocol_form_id (optional) — migration 1776300002:85-89 — evidence: supplemental form reference
- confirmed — tools_field_tags.workflow_id (required) — migration 1770000000:18 — evidence: parent scope for tagging eligibility

Summary: Two claimed-MISSING fields already documented (allowed_roles on both); all nine verified in migrations. Structure and runtime behavior intact.

---

## Slice 9 — Builder: Automation (lines 438–479)
Collection: `tools_automation` + hooks in `pb/pb_hooks/automation.js`, `main.pb.js`

### Wave 1 — verify existing fields

- [x] verified — tools_automation.name (recorded in workflow_instance_tool_usage via logAutomationExecution)
- [x] verified — tools_automation.is_enabled (filters all triggers: main.pb.js:170,412,453,491)
- [x] verified — tools_automation.execution_mode (select: run_all/first_match, controls step loop at automation.js:821,837)
- [x] verified — trigger_type (on_transition/on_field_change/scheduled per 1773000000; runtime at main.pb.js)
- [x] verified — trigger_config.from_stage_id (on_transition filter via main.pb.js:181)
- [x] verified — trigger_config.to_stage_id (on_transition filter via main.pb.js:182)
- [x] verified — trigger_config.stage_id (on_field_change filter via main.pb.js:423)
- [x] verified — trigger_config.field_key (on_field_change filter via main.pb.js:424)
- [x] verified — trigger_config.cron (5-field parsed by cronMatchesNow at automation.js:854-897)
- [x] verified — trigger_config.target_stage_id (scheduled filter at main.pb.js:520-522)
- [x] verified — steps[].name (fallback "Step N" at automation.js:834)
- [x] verified — steps[].conditions.operator (AND/OR via automation.js:671-674)
- [x] verified — condition.type (field_value/instance_status/current_stage at automation.js:584-594)
- [x] verified — condition.params.field_key (lookupFieldValue at automation.js:595-598)
- [x] verified — condition.params.operator (equals/not_equals/is_empty/is_not_empty/contains/gt/gte/lt/lte at automation.js:607-665)
- [x] verified — condition.params.value (supports $today/$today+N/$today-N via resolveCompareValue at automation.js:545-554)
- [x] verified — condition.params.compare_field_key (field-to-field at automation.js:601-602)
- [x] verified — condition.params.status (strict === at automation.js:586)
- [x] verified — condition.params.stage_id (equality check at automation.js:588-592)
- [x] verified — action.type (set_instance_status/set_field_value/set_stage at automation.js:695-776)
- [x] verified — action.params.status (writes workflow_instances.status at automation.js:697)
- [x] verified — action.params.field_key (upserts workflow_instance_field_values at automation.js:728-761)
- [x] verified — action.params.value (expression eval via evaluateExpression, supports {field_key} and function registry)
- [x] verified — action.params.stage_id (records from_stage_id in result at automation.js:774)

### Wave 2 — find missing fields

- [ ] MISSING — tools_automation.last_run_at (date) — Tracks last execution of scheduled automations; prevents duplicate runs within 50-second windows (main.pb.js:509-514). Added in 1773000000.
- [ ] MISSING — trigger_config.inactive_days (number, scheduled) — Filters scheduled runs to instances inactive for at least this duration; zero or null disables. In code (main.pb.js:524), UI (TriggerCard.svelte), and types.ts.

### Wave 3 — independent verification

- confirmed — tools_automation.last_run_at (date) — migration 1773000000:20-24 defines field for cron double-execution prevention; main.pb.js:509,549 implement 50-second guard to prevent redundant runs
- disputed — trigger_config.inactive_days (number) — used in main.pb.js:524-528 for filtering scheduled runs to inactive instances; documented in types.ts:311 and TriggerCard.svelte:262,265; however NOT defined as separate field in any migration schema, only as JSON property within trigger_config object; suggest: SKIP-DOCUMENT (internal JSON payload field, not schema-level collection field)

Summary: One fully confirmed field (last_run_at). One disputed claim (inactive_days is code-only property, not a schema field). Suggest documenting last_run_at; skip inactive_days as internal payload structure.
