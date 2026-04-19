# Überblick Sector — Admin Settings Cheat Sheet

This doc explains every settable field in the Überblick Sector admin UI, for both humans and AI agents. For each field, it describes what the admin controls and, crucially, what that value actually does in the real participant-facing Überblick app. The `mcp__ueberblick__*` MCP server exposes the same entities but does not explain semantics — read this file first when you are unsure what a field controls.

## How to read this file

- One section per admin page. Page paths are shown next to the heading.
- Each field entry is formatted as: `**field_name** (type) — ≤3-sentence summary.`
- DB collection and source file are listed at the top of each page section so you can trace from field → code → behavior.
- The summary always describes participant-side effect when one exists; admin-only metadata is called out explicitly.

## Cross-cutting semantics

These rules apply everywhere in Überblick. Internalize them before relying on per-field descriptions.

**Empty-array-means-all.** Any `visible_to_roles` or `allowed_roles` field that is an empty array grants access to every participant in the project. A non-empty array restricts access to the listed roles only. This is enforced at the PocketBase rule level via the pattern `(<field>:length = 0 || @request.auth.role_id ?= <field>)`. It applies to: `workflows.visible_to_roles`, `workflows.entry_allowed_roles`, `workflow_stages.visible_to_roles`, `workflow_connections.allowed_roles`, `tools_forms.allowed_roles`, `tools_edit.allowed_roles`, `tools_protocol.allowed_roles`, `marker_categories.visible_to_roles`, `custom_tables.visible_to_roles`, `map_layers.visible_to_roles`, `offline_packages.visible_to_roles`. Note: `info_pages` has no `visible_to_roles` field -- info pages are visible to every participant in the project.

**Participant scope.** Every participant-side query is scoped by `project_id = @request.auth.project_id`. A participant can never see anything outside their assigned project, regardless of roles.

**Auth.** Admins log in to the `users` collection with email/password. Participants log in to the separate `participants` collection with their `token` — the token is used as both identity and password (`authWithPassword(token, token)`). Login fails if `is_active = false` or if `expires_at < now`.

**Status / visibility / archived.** Many collections carry a status-like field that hides rows from participants:
- `workflow_instances.status` — the server-side participant list rule filters out `archived` and `deleted` instances. Admins still see all statuses in the data viewer.
- `workflows.is_active` — when false, the workflow is hidden from the participant workflow selector.
- `workflows.private_instances` — when true, participants only see instances they themselves created.
- `offline_packages.status` — only `ready` packages are exposed to participants; `draft`, `processing`, and `failed` are admin-only.
- `participants.is_active` — blocks login.

**Icon config JSON.** `workflows.icon_config`, `workflow_stages.icon_config`, `marker_categories.icon_config`, and the `workflows.filter_value_icons` map all share the same shape: `{ template_id, color, size, badge_id?, svgContent? }`. They are edited through either `MarkerIconDesigner` or `WorkflowIconDesigner`. The participant map falls back up the chain: filter-value icon → stage icon → workflow icon.

**Offline-first.** Participants sync data into IndexedDB (version 8, index `by_layer`) via `src/lib/participant-state/**`. Tile cache keys are `{layerId}/{z}/{x}/{y}`. `map_sources` was merged into `map_layers`, so the cache key uses layer id, not source id.

**Visual config JSON.** `workflow_connections.visual_config`, `tools_forms.visual_config`, `tools_edit.visual_config`, and `tools_protocol.visual_config` all hold `{ button_label, button_color, ... }` for the participant stage toolbar. An empty label falls through to the action/tool name, and an empty color falls through to a default palette.

## Legend

- `[DONE]` appended to a page heading means every field in that section is documented.
- Each field line is `- [x] **field_name** (type) — summary.`; `- [ ]` means pending (none should remain in the final doc).

---

## Page: Projects List  `/projects`  [DONE]

File: `src/routes/(admin)/projects/+page.svelte`
Collection: `projects`
Notes: List page only. Cards are read-only; no inline field editing. The only actions here are Create, Import Schema, Export Schema, and navigating into a project. No documentable fields.

---

## Page: New Project  `/projects/new`  [DONE]

File: `src/routes/(admin)/projects/new/+page.svelte`
Collection: `projects`

- [x] **name** (text, required, max 255) — Display label for the project. Shown in the participant app layout header as a fallback when `projects.settings.display_name` is empty, and used as the project title throughout the admin UI.
- [x] **description** (text, optional, max 1000) — Admin-only metadata for documenting what the project is about. Not surfaced to participants anywhere.

---

## Page: Project Settings · General Tab  `/projects/[projectId]/settings`  [DONE]

File: `src/routes/(admin)/projects/[projectId]/settings/GeneralSettingsTab.svelte`
Collection: `projects`, `info_pages`

- [x] **display_name** (text, stored in `projects.settings.display_name`) — Overrides `projects.name` as the project title shown in the participant app header. Read in `src/routes/participant/+layout.server.ts` and passed to the layout as `projectName`; falls back to `projects.name` when empty.
- [x] **icon** (file upload, PNG/JPEG/SVG/WebP, max 2MB, stored in `projects.icon`) — Project icon displayed in the participant app header. Served via `/api/files/projects/{id}/{filename}` and fetched by the participant layout server.
- [x] **info_page.title** (text, required) — Title of an info page listed in the participant app's info pages view. Rendered as the button label in the participant settings sheet.
- [x] **info_page.content** (rich text/HTML, required) — HTML body shown when a participant opens an info page from the settings sheet. Loaded via the admin client in `src/routes/participant/+layout.server.ts` with `fields: 'id,title,content'`.
- [x] **info_page.sort_order** (integer, ≥0) — Controls the display order of info pages in the participant settings sheet. Used as the primary sort key (`sort: 'sort_order,created'`) when fetching pages.

---

## Page: Project Settings · Map Tab  `/projects/[projectId]/settings`  [DONE]

File: `src/routes/(admin)/projects/[projectId]/settings/MapSettingsTab.svelte`
Collections: `projects` (map defaults live in `projects.settings.map_defaults` JSON), `map_layers`, `offline_packages`

### Map defaults (`projects.settings.map_defaults`)

Stored as a JSON blob inside the `projects.settings` field (there is no separate `map_settings` collection). Keys documented here are the keys on that JSON object.

- [x] **center.lat** (number, latitude) — Latitude of the initial map center when a participant opens the map. Passed to the Leaflet map constructor in `MapCanvas.svelte`. In the `update_map_settings` MCP tool this is exposed as the `center_lat` parameter, which is persisted under `map_defaults.center.lat`.
- [x] **center.lng** (number, longitude) — Longitude of the initial map center, paired with `center.lat`. Exposed as `center_lng` in the MCP tool; must be set together with `center.lat`.
- [x] **zoom** (integer, 0–22) — Initial zoom level applied when the participant map loads. Clamped by `min_zoom` / `max_zoom`. Note: the field is literally named `zoom` on the JSON object (not `default_zoom`).
- [x] **min_zoom** (integer, 0–22) — Lower bound on how far out a participant can zoom. Enforced via `map.setMinZoom()` in the participant map canvas.
- [x] **max_zoom** (integer, 0–22) — Upper bound on how far in a participant can zoom. Applied to tile layers and the map's `maxZoom` option.
- [x] **bounds_geojson** (GeoJSON polygon via RegionSelector) — Optional polygon defining the project's map region. Stored but currently not enforced on the participant map; reserved for future region-restriction use.

### Map layer — Preset source

- [x] **preset_source** (select from `PRESET_SOURCES`) — Picks one of the built-in map sources (OSM, CartoDB, ESRI, NRW) defined in `src/lib/types/map-layer.ts`. Creates a `map_layers` row with URL, attribution and WMS config pre-filled from the preset.

### Map layer — Tile URL

- [x] **tile.name** (text, required) — Display name for the layer, shown in the participant map layer picker (`LayerSheet.svelte`). Stored as `map_layers.layer_name`.
- [x] **tile.tile_url** (text, XYZ template) — XYZ tile URL template (e.g. `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`). Used by the participant map's tile layer and by the offline tile cache keyed as `{layerId}/{z}/{x}/{y}`.
- [x] **tile.attribution** (text, optional) — Attribution string displayed in the map's attribution control. Passed to Leaflet's tile layer options when the layer renders.
- [x] **tile.as_base** (boolean, base vs overlay) — If true, the layer is a mutually-exclusive base layer (rendered as radio buttons); if false, it's an overlay the participant can toggle independently.

### Map layer — WMS

- [x] **wms.name** (text, required) — Display name for the WMS layer in the participant map layer picker. Stored as `map_layers.layer_name` alongside the WMS config.
- [x] **wms.url** (text, WMS endpoint) — Base WMS service URL (e.g. `https://www.wms.nrw.de/geobasis/wms_nw_dop`). Used by the participant map's WMS tile loader as the GetMap endpoint.
- [x] **wms.layers** (text, comma-separated layer list) — Comma-separated WMS layer names sent as the `LAYERS` parameter. Determines which server-side layers are composited into the returned image.
- [x] **wms.format** (select: image/png, image/jpeg, …) — Image format the WMS server returns. Sent as the `FORMAT` parameter; PNG supports transparency, JPEG is smaller.
- [x] **wms.version** (select: 1.1.1, 1.3.0) — WMS protocol version, affecting axis order and parameter naming in GetMap requests. Forwarded to the Leaflet WMS layer.
- [x] **wms.attribution** (text, optional) — Attribution text shown in the participant map's attribution control. Stored alongside the other WMS config on the layer.
- [x] **wms.transparent** (boolean) — If true, requests a transparent background (`TRANSPARENT=true`) so the layer can be stacked as an overlay. If false, the WMS image is opaque and better suited as a base layer.
- [x] **wms.as_base** (boolean) — If true, the layer is treated as a mutually-exclusive base layer; if false, as a toggleable overlay in the participant layer picker.

### Map layer — Upload

- [x] **upload.name** (text, required) — Display name for an admin-uploaded tile archive layer. Shown in the participant layer picker once the upload is processed.
- [x] **upload.format** (select: png/jpg/webp) — Tile image format inside the uploaded archive. Determines how the participant map decodes and renders the tiles.
- [x] **upload.file** (file upload, tile archive) — ZIP archive containing an XYZ tile tree or MBTiles. Processed server-side and served to participants via the cached tile layer using the same `{layerId}/{z}/{x}/{y}` key scheme as online tiles.

### Map layer — row-level

- [x] **map_layers.visible_to_roles** (relation multi, roles) — Restricts which participant roles can see and toggle the layer in the map layer picker. Empty array means visible to everyone in the project.

### Offline package

- [x] **offline_package.name** (text, required) — Display name for a downloadable tile package in the participant map's offline settings. Only packages with `status = "ready"` appear to participants.
- [x] **offline_package.zoom_min** (integer) — Lowest zoom level included when tiles are generated into the archive. Controls the coarsest detail available offline.
- [x] **offline_package.zoom_max** (integer) — Highest zoom level included when tiles are generated into the archive. Controls the finest detail available offline; higher values produce much larger packages.
- [x] **offline_package.region_geojson** (GeoJSON polygon via RegionSelector) — Polygon defining the geographic area to download. Tile generation walks this polygon at every zoom level between `zoom_min` and `zoom_max`.
- [x] **offline_package.layers** (relation multi, `map_layers`) — Which map layers are packaged into the offline archive. Participants downloading the package get cached tiles for exactly these layers.
- [x] **offline_package.visible_to_roles** (relation multi, roles) — Restricts which participant roles can download this package. Empty array means all roles in the project can see the package once it reaches `status = "ready"`.

---

## Page: Participants  `/projects/[projectId]/participants`  [DONE]

File: `src/routes/(admin)/projects/[projectId]/participants/+page.svelte`
Collections: `participants`, `participant_custom_fields`

- [x] **name** (text, required, max 255) — Human-readable participant label, shown in the admin table and embedded into generated QR-code labels. Not used for authentication.
- [x] **email** (email, optional) — Optional contact email. PocketBase auth is configured to use `token` as the identity field, so email is purely informational; a placeholder is auto-generated on create when left blank.
- [x] **phone** (text, optional) — Optional contact phone number. Admin-only metadata with no participant-side effect.
- [x] **token** (text, unique, readonly in UI, auto-generated on create) — The participant's login credential. PocketBase auth uses `token` as both identity and password (`authWithPassword(token, token)` in `src/routes/participant/login/+page.server.ts`), and it is embedded in generated QR codes.
- [x] **role_id** (relation multi, `roles`) — The participant's assigned roles. Every `visible_to_roles` / `allowed_roles` check across workflows, stages, forms, edit tools, marker categories, custom tables, map layers, and offline packages compares against this array.
- [x] **is_active** (boolean, toggled via status button) — If false, login fails with "This account is inactive" in `src/routes/participant/login/+page.server.ts` even when the token is correct. Used to temporarily disable a participant without deleting them.
- [x] **metadata.{custom_field}** (per-field value stored in JSON) — Per-participant values for any `participant_custom_fields` defined on the project. Stored as a JSON object keyed by `field_name`; values are preserved even if the field definition is later removed.

### Participant custom field definitions

- [x] **participant_custom_fields.field_name** (text, unique per project) — Internal key used to store and read values in `participants.metadata`. Also rendered as the admin table column header.
- [x] **participant_custom_fields.field_type** (select: text/number/date/boolean) — Determines the editor widget in the admin table and how the value is interpreted when read back out of `metadata`.
- [x] **participant_custom_fields.is_required** (boolean) — If true, the field cannot be blank when a participant is created or updated through the admin UI.
- [x] **participant_custom_fields.default_value** (text) — Value pre-filled into new participant rows when no explicit value is provided. Stored as text and coerced to the field type on read.

### Bulk actions

- [x] **QR Export** (generates QR codes containing participant tokens) — Generates a multi-page PDF of QR codes for selected participants, each encoding the participant's token for scan-to-login. Used to bulk-distribute login credentials in the field.

---

## Page: Roles · Roles Tab  `/projects/[projectId]/roles`  [DONE]

File: `src/routes/(admin)/projects/[projectId]/roles/+page.svelte`
Collection: `roles`

- [x] **roles.name** (text, required, max 255) — Display name for the role, shown in role pickers, the permissions matrix, and the participant edit dialog. Core identifier used for assignment.
- [x] **roles.description** (text, optional) — Admin-only note describing what the role is for. Not surfaced to participants.
- [x] **roles.assigned_participants** (reverse relation; edits `participants.role_id`) — Convenience editor that writes back to `participants.role_id` for every selected participant. Changing it immediately affects what each participant can see once they reload.

---

## Page: Roles · Permissions Tab  `/projects/[projectId]/roles`  [DONE]

File: `src/routes/(admin)/projects/[projectId]/roles/+page.svelte` (permissions section)
Action: `?/toggleRole` — toggles a role in/out of a `visible_to_roles` or `allowed_roles` array on a target collection.

- [x] **workflows.visible_to_roles** (relation multi, read toggle) — Controls whether a role can see the workflow at all in the participant app. Empty array = visible to everyone in the project; non-empty = only listed roles.
- [x] **workflows.entry_allowed_roles** (relation multi, create toggle) — Controls whether a role can create new instances of the workflow. Independent from `visible_to_roles`: a role can be allowed to see existing instances without being allowed to create new ones.
- [x] **workflow_stages.visible_to_roles** (relation multi, read toggle) — Controls whether a role sees a given stage in the participant workflow view. Instances currently sitting in a hidden stage vanish from the role's view.
- [x] **workflow_connections.allowed_roles** (relation multi, update/trigger toggle) — Controls whether a role can trigger the transition (tap the action button) that moves an instance across this connection. Hiding the connection also hides any buttons attached to it.
- [x] **tools_forms.allowed_roles** (relation multi, submit toggle) — Controls whether a role can open and submit the form. Forms gated off this way disappear from the participant stage toolbar for that role.
- [x] **tools_edit.allowed_roles** (relation multi, update toggle) — Controls whether a role can open an edit tool and modify the fields it exposes. Also applies to global (non-stage-attached) edit tools.
- [x] **custom_tables.visible_to_roles** (relation multi, read toggle) — Controls whether a role can read rows from the custom table, including when it's referenced from a `custom_table_selector` form field. Empty array = readable to all participants.
- [x] **marker_categories.visible_to_roles** (relation multi, read toggle) — Controls whether a role sees markers from this category on the map and in the filter sheet. Markers inherit visibility from their category.
- [x] **map_layers.visible_to_roles** (relation multi, read toggle) — Controls whether a role sees the layer in the participant map layer picker. Empty array = all roles see it.
- [x] **offline_packages.visible_to_roles** (relation multi, read toggle) — Controls whether a role can download a ready offline package. Combined with `status = "ready"`: hidden packages never appear even if processing succeeded.

---

## Page: Custom Tables List  `/projects/[projectId]/custom-tables`  [DONE]

File: `src/routes/(admin)/projects/[projectId]/custom-tables/+page.svelte`
Collection: `custom_tables`

- [x] **table_name** (text, snake_case, readonly after create) — Unique internal identifier enforcing lowercase letters, numbers, and underscores; locked after creation. Participants never see this field.
- [x] **display_name** (text, required) — Human-readable name displayed in the admin UI and form field labels when tables are used as custom_table_selector field sources. Required field with max 255 characters.
- [x] **description** (text, optional) — Admin-facing documentation stored up to 1000 characters; not displayed to participants. Contextual field for table purpose.
- [x] **main_column** (text, required, readonly after create) — The primary display column in snake_case format; when this table is used in custom_table_selector fields, this column's value becomes the selectable label. Locked after creation.
- [x] **visible_to_roles** (relation multi, roles) — Controls which participant roles can read/query this table and use it in form field selectors. Empty array = visible to all roles. Toggled via permissions tab.

---

## Page: Custom Table Detail  `/projects/[projectId]/custom-tables/[tableId]`  [DONE]

File: `src/routes/(admin)/projects/[projectId]/custom-tables/[tableId]/+page.svelte`
Collections: `custom_tables` (meta), `custom_table_columns`, `custom_table_data`

### Table meta (via `DataViewerHeader`)

- [x] **custom_tables.display_name** (text) — Human-readable name displayed in the admin UI and form field labels when tables are used as custom_table_selector field sources. Required field with max 255 characters.
- [x] **custom_tables.description** (text) — Admin-facing documentation stored up to 1000 characters; not displayed to participants. Contextual field for table purpose.
- [x] **custom_tables.visible_to_roles** (relation multi) — Controls which participant roles can read/query this table and use it in form field selectors. Empty array = visible to all roles. Toggled via permissions tab.

### Column definitions

- [x] **custom_table_columns.column_name** (text, snake_case, readonly after create) — Unique internal identifier per table enforcing lowercase letters, numbers, and underscores; becomes the key in row_data JSON. Locked after creation; renaming triggers data migration.
- [x] **custom_table_columns.column_type** (select: text/number/date/boolean) — Defines the data type for validation and rendering in the admin UI. Cannot be changed after creation; affects how values are interpreted in row_data cells.
- [x] **custom_table_columns.is_required** (boolean) — If true, rows cannot be created/updated without a value in this column. Enforced at the API level for data consistency.
- [x] **custom_table_columns.default_value** (text) — Optional fallback value (stored as text, max 1000 chars) applied when creating new rows if no value is provided; must match column_type semantics.

### Row data

- [x] **custom_table_data.row_data.{column}** (per-cell value, typed by column) — JSON object (max 100KB) where each key is a column_name and value is typed by column_type (text/number/date/boolean). Participants query and display this data via form field selectors.
- [x] **CSV import** (bulk row insert, replace-or-append option) — Admin action to parse CSV, validate headers against table schema, optionally clear existing data (replaceData=true), and batch-insert rows. Supports typed values per column_type.

---

## Page: Marker Categories List  `/projects/[projectId]/marker-categories`  [DONE]

File: `src/routes/(admin)/projects/[projectId]/marker-categories/+page.svelte`
Collection: `marker_categories`

- [x] **name** (text, required, max 255) — Display name of the marker category, shown next to the icon in the participant map's filter sheet (`FilterSheet.svelte` groups markers by category and labels each row with `category.name`). Also used as the column header in the admin list and as the heading on the category detail page.
- [x] **description** (text, optional, max 1000) — Admin-facing note describing what the category is for. Not surfaced anywhere on the participant map.
- [x] **visible_to_roles** (JSON array of role IDs) — Restricts which participant roles see markers from this category on the map and in the filter sheet. Empty array means all roles in the project see the category; markers inherit visibility from their category.
- [x] **icon_config** (JSON via `MarkerIconDesigner`: `svgContent`, `color`, `size`, optional badge) — Defines the pin appearance for every marker in the category. The participant map and filter sheet render the inline `svgContent` recolored with `color` at `size` pixels for both individual pins and donut cluster slices.

---

## Page: Marker Category Detail  `/projects/[projectId]/marker-categories/[categoryId]`  [DONE]

File: `src/routes/(admin)/projects/[projectId]/marker-categories/[categoryId]/+page.svelte`
Collections: `marker_categories` (meta + fields schema), `markers`

### Category meta (via `DataViewerHeader`)

- [x] **marker_categories.name** (text, required, max 255) — Display name of the category, shown in the participant map's filter sheet beside the icon and used as the page heading in the admin detail view. Same field surfaced on the list page.
- [x] **marker_categories.description** (text, optional, max 1000) — Admin-only context describing the category. Never displayed to participants.
- [x] **marker_categories.visible_to_roles** (JSON array of role IDs) — Controls which participant roles can see markers belonging to this category on the map and in the filter sheet. Empty array means visible to every role in the project.
- [x] **marker_categories.icon_config** (JSON via `MarkerIconDesigner`: `svgContent`, `color`, `size`, optional badge) — Drives how every marker in this category is drawn on the participant map, including the inline SVG recolored with `color` at `size` pixels. The same icon is rendered next to the category name in the filter sheet and in donut cluster slices.

### Custom field definitions (stored inside `marker_categories.fields` JSON array)

- [x] **fields[].field_name** (text, snake_case) — Internal key used to store and read per-marker values in `markers.properties`. The participant marker detail module reads `marker.properties?.[field.field_name]` and renders the formatted key as the row label.
- [x] **fields[].field_type** (select: text/number/date/boolean) — Determines how the value is interpreted and formatted in the participant marker detail view (`formatValue(value, field.field_type, …)` in `MarkerDetailModule.svelte`). Also controls the editor widget when admins fill marker rows.
- [x] **fields[].is_required** (boolean) — If true, the field cannot be left blank when creating or updating a marker through the admin UI or CSV import. Enforced at the form level in the category detail page.
- [x] **fields[].default_value** (text) — Value pre-filled into new marker rows when no explicit value is provided. Stored as text and coerced to `field_type` on read.

### Marker rows

- [x] **markers.title** (text, required, max 500) — Primary label of the marker, shown as the heading in the participant marker detail module and used in marker lists. Required on every row.
- [x] **markers.description** (text, optional, max 5000) — Long-form text shown in the participant marker detail module below the title. Optional and rendered only when set.
- [x] **markers.location** (JSON `{lat, lon}`, required) — Geographic position used to place the pin on the participant Leaflet map. The map filter and renderer in `participant/map/+page.svelte` keep markers with `m.location?.lat` and `m.location?.lon` and feed them to the supercluster manager.
- [x] **markers.properties.{field}** (JSON object keyed by `field_name`) — Per-marker values for the custom fields defined on the parent category. Read in `MarkerDetailModule.svelte` as `marker.properties?.[field.field_name]` and formatted by `field_type` for display.
- [x] **CSV import** (bulk marker insert, replace-or-append) — Admin action on the category detail page that parses CSV, maps columns to title/description/location/custom fields, and batch-creates marker rows via the `?/importCSV` form action. Supports clearing existing markers in the category before import.

---

## Page: Workflows List  `/projects/[projectId]/workflows`  [DONE]

File: `src/routes/(admin)/projects/[projectId]/workflows/+page.svelte`
Collection: `workflows`

- [x] **workflows.name** (text, required) — Display name of the workflow shown in the participant `WorkflowSelector` menu and on the bottom control bar entry button. Also used as the row label on the admin workflows list table.
- [x] **workflows.description** (text, optional) — Short subtitle shown under the workflow name in the participant workflow picker. Surfaces verbatim to participants when they pick which workflow to start.
- [x] **workflows.workflow_type** (select: incident/survey) — Determines the entry flow in the participant app: `incident` puts the user into coordinate-selection mode to drop a map marker before the form opens, while `survey` skips coordinate selection and opens the form directly without placing a marker (`WorkflowSelector.svelte` line 77).
- [x] **workflows.is_active** (boolean, toggle) — Master switch that gates all participant access to the workflow. The `workflows` listRule only returns rows where `is_active = true` to participants, so toggling it off makes the workflow and all its instances vanish from the participant app.
- [x] **workflows.icon_config** (JSON, via `WorkflowIconDesigner`) — Default marker icon used on the participant map for instances of this workflow. `MapCanvas.createWorkflowInstanceIcon` falls back to this icon when no filter-value or stage icon is set.
- [x] **workflow_stages.icon_config** (per-stage JSON, edited from same designer) — Stored on `workflow_stages.visual_config.icon_config`; overrides the workflow icon for instances currently sitting in that stage. Second step in the `MapCanvas` icon fallback chain (filter value -> stage -> workflow -> default circle).
- [x] **workflows.filter_value_icons** (JSON map from field value to icon config) — Map keyed by a filterable form-field value; `MapCanvas` looks up the instance's current filter value and uses the matching icon as the highest-priority entry in the fallback chain. `FilterSheet.svelte` also reads it to render the per-value icons in the filter list.

---

## Page: Workflow Detail / Data Viewer  `/projects/[projectId]/workflows/[workflowId]`  [DONE]

File: `src/routes/(admin)/projects/[projectId]/workflows/[workflowId]/+page.svelte`
Collections: `workflows` (meta), `workflow_instances`, `workflow_instance_field_values`

### Workflow meta (via `DataViewerHeader`)

- [x] **workflows.name** (text, inline editable) — Same field as on the list page; editing it here renames the workflow everywhere it is shown to participants (`WorkflowSelector`, bottom control bar). Persisted via the `updateWorkflowMeta` action with `field = 'name'`.
- [x] **workflows.description** (text, inline editable) — Same field as on the list page; the inline edit posts to `updateWorkflowMeta` and updates the subtitle shown under the workflow name in the participant picker.
- [x] **workflows.visible_to_roles** (relation multi) — Restricts which participant roles can see the workflow and its instances. Enforced in the `workflow_instances`/`workflow_instance_field_values` listRules (`1776200000_filter_instance_status_for_participants.js`): empty array means visible to all, otherwise the participant's `role_id` must be in the list.
- [x] **workflows.is_active** (boolean toggle) — Header-level toggle (lines 559-635 of `+page.svelte`) wired to `updateWorkflowMeta`. Same effect as on the list page: when false, the workflow disappears entirely from the participant app via the `workflows` listRule.
- [x] **workflows.private_instances** (boolean toggle) — When true, participants can only see instances they themselves created. The `workflow_instances` listRule adds `(workflow_id.private_instances != true || created_by = @request.auth.id)`, so other participants' instances of the same workflow stay hidden.

### Instance rows

- [x] **workflow_instances.is_active** (boolean) — Conceptual flag backed by the `workflow_instances.status` select field (values `active`/`completed`/`archived`/`deleted`). Participant listRules in `1776200000_filter_instance_status_for_participants.js` filter out rows where `status = "deleted" || status = "archived"`, so marking an instance inactive removes it from the participant map and detail views while admins keep seeing it.
- [x] **workflow_instances.is_archived** (boolean) — Conceptual flag backed by `workflow_instances.status = "archived"`. Archived instances are explicitly excluded from participants by the listRule status filter (`status != "archived"`), so they remain visible to admins in the data viewer but disappear from the participant app.
- [x] **workflow_instance_field_values.value** (per-instance, per-field value; typed by the form field definition) — One row per (instance, field_key, stage_id) holding the answer a participant submitted via a form, edit tool, or protocol tool. The data viewer renders one column per form field and inline edits go through the `updateFieldValue` action, which also writes a `workflow_instance_tool_usage` audit row.
- [x] **CSV import** (bulk create instances into a selectable start stage, fields filtered by stage reachability) — The `importCSV` action parses uploaded rows, optionally wipes existing instances, then creates one `workflow_instances` row per CSV row at the chosen target stage (defaulting to the workflow's `start` stage). `lat`/`lon` columns become the instance `location`, and remaining columns are written as `workflow_instance_field_values` keyed by the form field id, each tagged with the field's owning stage from `fieldStageMap`.

---

## Page: Workflow Builder · Properties · Stage  `/projects/[projectId]/workflows/[workflowId]/builder`  [DONE]

File: `src/routes/(admin)/projects/[projectId]/workflows/[workflowId]/builder/right-sidebar/views/properties/panels/StagePropertyPanel.svelte`
Collection: `workflow_stages`

- [x] **workflow_stages.stage_name** (text) — Display label for the stage shown in the participant workflow instance detail header and breadcrumb (`{stage.stage_name}` in `WorkflowInstanceDetailModule.svelte` line 1434). Edited inline via the panel header input and persisted through the `onRename` callback.
- [x] **workflow_stages.visible_to_roles** (relation multi) — Restricts which participant roles see this stage in the workflow view; instances sitting in a hidden stage vanish from those roles detail panels. Empty selection means visible to all participants in the project.
- [x] **tools_edit.allowed_roles** (relation multi — attached-to-stage edit tool permission) — Per-tool override on the Permissions tab limiting which roles can open the stages edit tool and modify its fields. Empty means all roles allowed; the participant detail module hides the tools button when the participants role is not listed.

---

## Page: Workflow Builder · Properties · Connection (Edge)  `/projects/[projectId]/workflows/[workflowId]/builder`  [DONE]

File: `src/routes/(admin)/projects/[projectId]/workflows/[workflowId]/builder/right-sidebar/views/properties/panels/EdgePropertyPanel.svelte`
Collection: `workflow_connections`

- [x] **workflow_connections.action_name** (text) — Internal name of the transition, used as the fallback button label when `visual_config.button_label` is empty (`conn.visual_config?.button_label || conn.action_name` in `WorkflowInstanceDetailModule.svelte` line 198). Also shown in the edge header in the builder.
- [x] **workflow_connections.allowed_roles** (relation multi) — Restricts which participant roles can trigger this transition by tapping its action button in the workflow detail panel. Empty array allows all roles; hiding the connection also hides any buttons attached to it.
- [x] **workflow_connections.visual_config.button_label** (text) — Overrides `action_name` as the visible label on the stage action button in the participant workflow detail. Stored under the connections JSON `visual_config` and applied on Settings tab edit via `syncSettings`.
- [x] **workflow_connections.visual_config.button_color** (color) — Hex background color applied to the stage action button rendered in the participant detail toolbar. Configured via a color picker plus paired text input that both write into `visual_config.button_color`.
- [x] **workflow_connections.visual_config.requires_confirmation** (boolean) — When true, tapping the action button in the participant app opens a confirmation dialog before the transition runs (`if (connection.visual_config?.requires_confirmation)` in `WorkflowInstanceDetailModule.svelte` line 375). When false the transition fires immediately.
- [x] **workflow_connections.visual_config.confirmation_message** (text) — Body text shown inside that confirmation dialog (line 1472 in the detail module). Only displayed when `requires_confirmation` is enabled; defaults to Are you sure you want to proceed.

---

## Page: Workflow Builder · Form Editor  `/projects/[projectId]/workflows/[workflowId]/builder`  [DONE]

File: `src/routes/(admin)/projects/[projectId]/workflows/[workflowId]/builder/right-sidebar/views/form-editor/FormEditorView.svelte`
Collection: `tools_forms`

- [x] **tools_forms.name** (text) — Internal label for the form, edited inline at the top of the Form Editor and shown to admins in the workflow builder. For stage-attached forms it doubles as the fallback identifier when no `visual_config.button_label` is set.
- [x] **tools_forms.description** (text) — Admin-only metadata describing what the form is for. Not surfaced anywhere in the participant app.
- [x] **tools_forms.allowed_roles** (relation multi) — Restricts which participant roles can open and submit this form. Only editable here for stage-attached forms (connection-attached forms inherit from the connection); empty array means all roles in the project can use it.
- [x] **tools_forms.visual_config.button_label** (text) — Text shown on the button that opens the form in the participant stage toolbar. Defaults to "Submit" when blank; only edited from the Form Editor settings panel for stage-attached forms.
- [x] **tools_forms.visual_config.button_color** (color) — Background color of the form's launch button in the participant stage toolbar, picked via a native color input or hex text. Defaults to `#3b82f6`.

---

## Page: Workflow Builder · Form Field Config  `/projects/[projectId]/workflows/[workflowId]/builder`  [DONE]

File: `src/routes/(admin)/projects/[projectId]/workflows/[workflowId]/builder/right-sidebar/views/form-editor/FieldConfigPanel.svelte`
Collection: `tools_form_fields`

### Common field properties

- [x] **field_label** (text) — The label displayed above the input in the participant form renderer (`FieldRenderer.svelte`), uppercased and styled as a small caption. Also used as the title of the field in admin previews and as the column header in CSV exports.
- [x] **placeholder** (text) — Greyed-out hint text shown inside empty inputs in the participant `FieldRenderer.svelte`. Applies to text, number, email, date, dropdown, smart dropdown, and custom table selector inputs; ignored in view mode.
- [x] **help_text** (text) — Small explanatory text rendered beneath the input when a participant fills or edits the field. Hidden in view mode so submitted records stay compact.
- [x] **is_required** (boolean) — If true, the participant must provide a value before the form can be submitted, and the label gains a red asterisk in `FieldRenderer.svelte`. Enforced by superforms validation on the workflow instance submit action.

### Text / long_text validation

- [x] **validation_rules.minLength** (integer) — Minimum number of characters the participant must type into a `short_text` or `long_text` input before the form will accept the submission. Enforced by the form validator wrapping `FieldRenderer.svelte`.
- [x] **validation_rules.maxLength** (integer) — Hard cap on the number of characters allowed in a `short_text` or `long_text` input. Submissions exceeding this length are rejected with a validation error under the field.
- [x] **validation_rules.pattern** (regex, short_text only) — JavaScript-flavoured regex the typed value must fully match before submission is allowed. Only offered for `short_text` (the panel hides this field for `long_text`); typical use is enforcing things like postal codes or IDs.

### Number validation

- [x] **validation_rules.min** (number) — Lowest numeric value the participant can submit for a `number` field. Passed straight through to the HTML `<input type="number">` `min` attribute in `FieldRenderer.svelte` and re-checked by the form validator.
- [x] **validation_rules.max** (number) — Highest numeric value the participant can submit for a `number` field. Passed through to the input's `max` attribute and re-checked at submit time.
- [x] **validation_rules.step** (number) — Increment for the number input's stepper buttons and the granularity validation accepts (e.g. `0.1` for one-decimal precision, `1` for integers). Forwarded to the HTML number input's `step` attribute.

### Date field

- [x] **field_options.date_mode** (select: date/datetime/time) — Picks which native HTML input type the participant sees: `date` renders `<input type="date">`, `datetime` renders `datetime-local`, and `time` renders `<input type="time">` (used in `FieldRenderer.svelte`). Also drives how the value is formatted when displayed in view mode (German locale day/month/year, with or without time).
- [x] **field_options.prefill_now** (boolean) — If true, new instances open with the field auto-filled to the current date/time when the form first loads. Useful for incident reports where the timestamp should default to "now".

### File field

- [x] **field_options.allowed_file_types** (select: all/images/documents) — Preset filter applied to the participant `MediaGallery` upload picker: "images" expands to `.jpg/.jpeg/.png/.gif/.webp`, "documents" to `.pdf/.doc/.docx/.txt`, "all" leaves the picker unrestricted. Stored as the resolved extension array on `field_options`.
- [x] **field_options.max_files** (integer) — Maximum number of files the participant can attach to this field. Enforced in `FieldRenderer.svelte`'s `handleFileAdd` (slices off any extra files) and passed to `MediaGallery` so its add button hides once the limit is reached. Defaults to 10 when unset.

### Dropdown / multiple_choice

- [x] **field_options.options** (array of label/value objects) — The selectable choices shown to the participant in `MobileMultiSelect` for `dropdown` and `multiple_choice` fields. Edited in the panel as one option per line; an optional comma after the label adds a description shown beneath the option in the picker.
- [x] **validation_rules.minSelections** (integer, multiple_choice only) — Minimum number of options the participant must tick before the `multiple_choice` field is considered valid. Enforced at submit time by the form validator.
- [x] **validation_rules.maxSelections** (integer, multiple_choice only) — Maximum number of options the participant may tick. Enforced at submit time and used to cap how many badges can show in view mode.

### Smart dropdown

- [x] **field_options.source_field** (form field ID whose value drives this dropdown) — ID of an earlier `dropdown` or `multiple_choice` field (from a prior stage, prior connection, or earlier in the current form) whose chosen value gates this field. While that source field is empty, `FieldRenderer.svelte` shows a "Select a value in the dependent field first" placeholder instead of the picker.
- [x] **field_options.mappings** (source value → option list map) — Array of `{ when, options }` entries: when the source field's value matches `when`, the participant sees that entry's `options` list inside `MobileMultiSelect`. Edited via the "Configure Options" modal that creates one tab per source option.

### Entity selector / custom_table_selector

- [x] **field_options.source_type** (select: custom_table/participants/role_list) — Picks where the selectable entities come from in `FieldRenderer.svelte`'s `loadCustomEntities`: `custom_table` queries `custom_table_data` rows, `marker_category` queries `markers` filtered by category, `participants` queries `participants` (gated by `self_select_roles`/`any_select_roles`), and `roles` queries the `roles` collection.
- [x] **field_options.custom_table_id** (relation: custom_tables) — When `source_type = custom_table`, identifies which `custom_tables` row the entities are pulled from. Each row in that table becomes a selectable option in the participant's `MobileMultiSelect`.
- [x] **field_options.display_field** (text: column to show as label) — Name of the column inside `custom_table_data.row_data` whose value becomes the option label shown to participants. Falls back to `"name"` if unset and to the row id when the column value is missing.
- [x] **field_options.allow_multiple** (boolean) — If true, the participant can pick more than one entity (`MobileMultiSelect` runs in multi-select mode and the value is stored as an array); if false, exactly one is allowed and the value is stored as a single ID.

### Field type palette

- [x] **field_type** (select from palette: short_text/long_text/number/date/file/dropdown/multiple_choice/smart_dropdown/custom_table_selector/…) — Determines which input widget `FieldRenderer.svelte` renders for the participant and which `field_options`/`validation_rules` shape applies. Picked by dragging a tile from the Field Types Palette onto the form preview; chosen at create time and effectively locked afterwards because changing it would invalidate any stored values.

---

## Page: Workflow Builder · Edit Tool Editor  `/projects/[projectId]/workflows/[workflowId]/builder`  [DONE]

File: `src/routes/(admin)/projects/[projectId]/workflows/[workflowId]/builder/right-sidebar/views/edit-tool-editor/EditToolEditorView.svelte`
Collection: `tools_edit`

- [x] **tools_edit.name** (text) — Internal label for the edit tool, used as the fallback button label in the participant instance detail view when no `visual_config.button_label` is set.
- [x] **tools_edit.editable_fields** (relation multi, `tools_form_fields`) — In `form_fields` mode, the exact subset of ancestor form fields that participants can change when they open this tool; only these fields appear in the edit sheet, all other field values stay locked.
- [x] **tools_edit.edit_mode** (select: form_fields/location) — Switches the tool between editing form field values (opens an inline edit form on the instance) and editing the instance's geolocation (opens a map picker so participants can drag the pin to a new spot).
- [x] **tools_edit.visual_config.button_label** (text) — Custom label shown on the edit tool's button inside the participant instance detail view; falls back to `tools_edit.name` when empty.
- [x] **tools_edit.visual_config.button_color** (color) — Custom background color for the edit tool's button in the participant instance detail view, letting admins make critical edits visually distinct.

---

## Page: Workflow Builder · Protocol Tool Editor  `/projects/[projectId]/workflows/[workflowId]/builder`  [DONE]

File: `src/routes/(admin)/projects/[projectId]/workflows/[workflowId]/builder/right-sidebar/views/protocol-tool-editor/ProtocolToolEditorView.svelte`
Collection: `tools_protocol`

- [x] **tools_protocol.name** (text) — Internal label for the protocol tool (or for the protocol region when `is_global` is true), used as the fallback button label in the participant instance detail view when no `visual_config.button_label` is set.
- [x] **tools_protocol.editable_fields** (relation multi) — Ancestor form fields that participants can revise inside the protocol sheet alongside the protocol form; values are pre-filled from the current instance state (subject to `prefill_config`) and saved back to the underlying form fields when the protocol is submitted.
- [x] **tools_protocol.prefill_config** (JSON prefill rules) — Per-field on/off map (`{ fieldId: boolean }`) that decides whether each editable field starts pre-filled with the instance's current value when the participant opens the protocol; turn it off for fields that should always be entered fresh (e.g. measurement readings).
- [x] **tools_protocol.stage_id** (relation multi, region boundary stages when is_global) — When `is_global` is true, defines the set of stages that make up the protocol region; the system automatically snapshots the audit trail whenever a participant moves an instance out of that stage set. For non-global tools it instead pins the tool to the listed stages.
- [x] **tools_protocol.visual_config.button_label** (text) — Custom label shown on the protocol tool's button inside the participant instance detail view; falls back to `tools_protocol.name` when empty.
- [x] **tools_protocol.visual_config.button_color** (color) — Custom background color for the protocol tool's button in the participant instance detail view, useful for highlighting recurring inspection or check-in actions.
- [x] **tools_protocol.allowed_roles** (relation multi) — Restricts which participant roles may launch this protocol tool; an empty list means every participant on the project can use it. The PocketBase access rules enforce the same check on the API layer.

---

## Page: Workflow Builder · Field Tag Editor  `/projects/[projectId]/workflows/[workflowId]/builder`  [DONE]

File: `src/routes/(admin)/projects/[projectId]/workflows/[workflowId]/builder/right-sidebar/views/field-tag-editor/FieldTagEditorView.svelte`
Collection: `tools_field_tags`

- [x] **tag_mappings[].tagType** (select: title/subtitle/filterable/map_label/…) — Semantic role assigned to a form field so its value can be reused outside the form (e.g. as the instance title, subtitle, map label, or — currently the only registered type — `filterable`, which exposes the field as a map filter).
- [x] **tag_mappings[].fieldId** (relation: `tools_form_fields`) — The specific form field whose value drives the tag; the picker only shows fields whose `field_type` is compatible with the chosen tag type (for `filterable` that means dropdown and multiple-choice fields).
- [x] **tag_mappings[].config** (per-tag JSON, e.g. `filterable.filterBy = stage|field`) — Free-form JSON validated by the tag type's Zod schema; for `filterable` it stores `filterBy: 'stage' | 'field'`, switching the participant map filter between filtering by workflow stage or by the chosen dropdown field's values.

---

## Page: Workflow Builder · Automation Editor  `/projects/[projectId]/workflows/[workflowId]/builder`  [DONE]

File: `src/routes/(admin)/projects/[projectId]/workflows/[workflowId]/builder/right-sidebar/views/automation-editor/AutomationEditorView.svelte`
Collection: `tools_automation`

- [x] **tools_automation.name** (text) — Admin label for the automation, shown in the automation list in the workflow builder and recorded in `workflow_instance_tool_usage.metadata.automation_name` whenever the automation fires (`logAutomationExecution` in `pb/pb_hooks/automation.js`). Participants never see this name; it is purely for admin identification and audit logs.
- [x] **tools_automation.is_enabled** (boolean) — Master on/off switch. The hooks in `pb/pb_hooks/main.pb.js` filter automations with `is_enabled = true` for every trigger type (`on_transition`, `on_field_change`, scheduled cron); when false the automation is fully skipped at runtime even if it remains saved.
- [x] **tools_automation.execution_mode** (select: run_all/first_match) — Controls how multiple steps in `steps[]` are evaluated by `runAutomation()`. `run_all` executes every step whose conditions match in order (later steps see DB writes from earlier ones); `first_match` stops after the first step whose conditions evaluate true.

### Trigger

- [x] **trigger_type** (select: on_transition/on_field_change/scheduled) — Selects which runtime hook fires the automation. `on_transition` runs after `workflow_instances.current_stage_id` changes, `on_field_change` runs after a `workflow_instance_field_values` create or update, and `scheduled` is evaluated every minute by the `automation_scheduled_check` cron in `main.pb.js`.
- [x] **trigger_config.from_stage_id** (on_transition) — Optional filter limiting the trigger to transitions leaving this specific stage. Matched in `main.pb.js` via `!config.from_stage_id || config.from_stage_id === oldStageId`, so leaving it empty means "any source stage".
- [x] **trigger_config.to_stage_id** (on_transition) — Optional filter limiting the trigger to transitions arriving at this specific stage. Same loose-match rule as `from_stage_id`: empty means any destination.
- [x] **trigger_config.stage_id** (on_field_change) — Optional filter restricting the trigger to field changes on field values whose `stage_id` matches. Empty means the automation fires regardless of which stage the changed field belongs to.
- [x] **trigger_config.field_key** (on_field_change) — Optional filter restricting the trigger to changes on a specific form field (matched against `workflow_instance_field_values.field_key`). Empty means any field change on the workflow fires it.
- [x] **trigger_config.cron** (scheduled) — Standard 5-field cron expression (`minute hour dom month dow`) parsed by `cronMatchesNow()`; supports `*`, ranges, lists, and `*/step`. The scheduler tick runs every minute and executes the automation against every active workflow instance whenever the expression matches the current time.
- [x] **trigger_config.target_stage_id** (scheduled) — Optional filter narrowing the scheduled run to instances currently sitting in this stage (`current_stage_id = {:targetStage}` in `main.pb.js`). Empty means the cron sweeps all active, non-archived instances of the workflow.

### Step

- [x] **steps[].name** (text) — Human label for the step, recorded back in execution logs as `step_name` on each action result entry. Falls back to "Step N" when blank; used only for debugging and the tool-usage audit trail.
- [x] **steps[].conditions.operator** (select: AND/OR) — Combines the step's individual conditions into one guard. `evaluateConditions()` returns true only if every condition passes (`AND`) or any condition passes (`OR`); a step with no conditions always runs.

### Condition

- [x] **condition.type** (select: field_value/instance_status/current_stage) — Picks which property of the instance is inspected. `field_value` looks up `workflow_instance_field_values` via `lookupFieldValue()`, `instance_status` reads `workflow_instances.status`, and `current_stage` reads `workflow_instances.current_stage_id`.
- [x] **condition.params.field_key** (field_value) — The form field whose latest value is fetched for comparison. Resolved by querying `workflow_instance_field_values` ordered by `-updated` so the most recent value wins.
- [x] **condition.params.operator** (select: equals/not_equals/gt/lt/contains/…) — Comparison operator applied to the resolved field value. Supports `equals`, `not_equals`, `is_empty`, `is_not_empty`, `contains`, and `gt/gte/lt/lte` which auto-detect ISO date strings (`YYYY-MM-DD…`) versus numbers in `evaluateConditions()`.
- [x] **condition.params.value** (static compared value) — Literal value the field is compared against. Supports the special placeholders `$today`, `$today+N`, and `$today-N` which `resolveCompareValue()` expands into ISO dates at evaluation time, enabling date-relative checks like "due_date lt $today".
- [x] **condition.params.compare_field_key** (alternative: compare against another field) — When set, the comparison value is pulled from another field on the same instance instead of the literal `value`. Lets a step compare two form fields directly (e.g. `actual_count equals planned_count`).
- [x] **condition.params.status** (instance_status) — The status string the instance must equal for the condition to pass. Compared with strict `===` against `workflow_instances.status` in `evaluateConditions()`.
- [x] **condition.params.stage_id** (current_stage) — The stage the instance must (or must not, with operator `not_equals`) currently sit in. Compared with strict equality against `workflow_instances.current_stage_id`.

### Action

- [x] **action.type** (select: set_instance_status/set_field_value/set_stage) — Picks the mutation to perform when the step's conditions pass. All three are implemented in `executeActions()` and saved through `unsafeWithoutHooks()` so they cannot recursively re-trigger the same automation.
- [x] **action.params.status** (set_instance_status) — New value written to `workflow_instances.status`. Visible to participants on the workflow instance detail view and used by status-based filters and conditions in other automations.
- [x] **action.params.field_key** (set_field_value) — The form field to write into. If a `workflow_instance_field_values` row already exists it is updated in place; otherwise a new row is created with `stage_id` resolved from the field's parent form (or the instance's current stage as fallback).
- [x] **action.params.value** (set_field_value expression) — The value to write. Plain strings are stored as-is; strings containing `{field_key}` references or function calls are detected by `isExpression()` and evaluated by `evaluateExpression()`, which supports arithmetic and the `FUNCTIONS` registry (`count`, `min`, `max`, `sum`, `avg`, `round`, `today`, `date_add`, `days_until`, etc.).
- [x] **action.params.stage_id** (set_stage) — Target stage the instance is moved to. The action also bumps `last_activity_at` and records the previous stage as `from_stage_id` in the action result for the audit log.

---

## Page: Workflow Builder · Stage Preview Button Config  `/projects/[projectId]/workflows/[workflowId]/builder`  [DONE]

File: `src/routes/(admin)/projects/[projectId]/workflows/[workflowId]/builder/right-sidebar/views/stage-preview/ButtonConfigPanel.svelte`
Collection: `workflow_connections` (visual config for stage buttons)

- [x] **workflow_connections.visual_config.button_label** (text — duplicate editor, same field as edge panel) — Same JSON field as the edge panels button label, edited here from the stage previews per-button drawer with a live preview of the colored pill. Drives the action button label rendered in the participant workflow detail.
- [x] **workflow_connections.visual_config.button_color** (color) — Same `visual_config.button_color` hex value, edited via a color picker plus text input with a live preview swatch. Sets the background color of the stage action button shown to participants.
- [x] **workflow_connections.allowed_roles** (relation multi) — Same connection-level role gate as the edge panel, exposed here so the admin can restrict who sees and can press this specific button without leaving the stage preview. Empty means all roles allowed.

---
