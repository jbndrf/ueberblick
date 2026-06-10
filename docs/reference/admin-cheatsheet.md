# Überblick Sector — Admin Settings Cheat Sheet

This doc explains every settable field in the Überblick Sector admin UI, for both humans and AI agents. For each field, it describes what the admin controls and, crucially, what that value actually does in the real participant-facing Überblick app. The `mcp__ueberblick__*` MCP server exposes the same entities but does not explain semantics — read this file first when you are unsure what a field controls.

## How to read this file

- One section per admin page. Page paths are shown next to the heading.
- Each field entry is formatted as: `**field_name** (type) — ≤3-sentence summary.`
- DB collection and source file are listed at the top of each page section so you can trace from field → code → behavior.
- The summary always describes participant-side effect when one exists; admin-only metadata is called out explicitly.

## Cross-cutting semantics

These rules apply everywhere in Überblick. Internalize them before relying on per-field descriptions.

**Empty-array-means-all.** Any `visible_to_roles` or `allowed_roles` field that is an empty array grants access to every participant in the project. A non-empty array restricts access to the listed roles only. This is enforced at the PocketBase rule level via the pattern `(<field>:length = 0 || @request.auth.role_id.id ?= <field>.id)`. The `.id ?= <field>.id` form is mandatory: a participant's `role_id` is a multi-relation array (maxSelect 99), so the bare `@request.auth.role_id ?= <field>` never matches and silently denies access (see docs/dev/db/migrations.md "Multi-relation array comparison"). It applies to: `workflows.visible_to_roles`, `workflows.entry_allowed_roles`, `workflow_connections.allowed_roles`, `tools_forms.allowed_roles`, `tools_protocol.allowed_roles`, `workflow_field_defs.view_roles`, `marker_categories.visible_to_roles`, `custom_tables.visible_to_roles`, `map_layers.visible_to_roles`, `offline_packages.visible_to_roles`. Note: `info_pages` has no `visible_to_roles` field -- info pages are visible to every participant in the project.

**No stage-level visibility.** `workflow_stages` no longer has a `visible_to_roles` field — the field-def redesign removed it (migration `1779700000_data_tab_layout.js`). Stages are not a permission boundary. Read access is now gated **per field def** via `workflow_field_defs.view_roles`; action access is gated per connection / form / tool as before.

**Field-def model.** Form fields are split across two collections. `workflow_field_defs` is the workflow-scoped registry — one row per logical field, holding the definitional bits (`label`, `field_type`, `write_mode`, `output_type`, `field_options`, `validation_rules`), the per-field read gate (`view_roles`), and the participant Data-tab layout (`display_config`). `tools_form_field_refs` links a form to a def, with all per-form presentation (layout, placeholder, help text, required, conditional logic) in a `config` JSON column — the same def can appear in several forms with different presentation. The old flat `tools_form_fields` collection no longer exists. Field VALUES live in the append-only `workflow_field_values` event log: every write inserts a new row, and the "current value" of a field is the latest row by `recorded_at`.

**One shared value pool per instance.** An instance has a single pool of field values (`workflow_field_values`, append-only; current = latest by `recorded_at` per `(instance, field_def)`). Forms, edit tools, and protocol tools are just different ways to **display** or **write** these shared values — they are not separate stores. How a given write behaves (overwrite the current value vs append a new history row vs server-computed and read-only) is governed by the field def's `write_mode`, **not** by which tool did the writing. The lone exception is a protocol tool's `local_fields`, which never reach this pool (see Protocol below).

**Edit-tool roles are an exception.** `tools_edit` does not use a single `allowed_roles` field. It uses two paired arrays — `any_edit_roles` (roles that can edit any instance) and `self_edit_roles` (roles that can edit only instances they created themselves). A role in both arrays is treated as `any` (the button renders exactly once). **Empty arrays mean nobody** (not "everyone") — the deliberate inverse of the empty-array rule above. Migration `1778100000_edit_tools_self_any_roles.js` backfilled tools whose old `allowed_roles` was empty by populating `any_edit_roles` with every project role, preserving the old "everyone" behaviour.

**Participant scope.** Every participant-side query is scoped by `project_id = @request.auth.project_id`. A participant can never see anything outside their assigned project, regardless of roles.

**Auth.** Admins log in to the `users` collection with email/password. Participants log in to the separate `participants` collection with their `token` — the token is used as both identity and password (`authWithPassword(token, token)`). Login fails if `is_active = false` or if `expires_at < now`. The participant session uses a 90-day auth token (`authToken.duration = 7776000`, set by migration `1780200000_participants_token_duration.js`; PocketBase's default is 604800 = 7 days), renewed on every online open. The participant cookie's `maxAge` is matched to the same 90 days in `src/hooks.server.ts`.

**Status / visibility / archived.** Many collections carry a status-like field that hides rows from participants:
- `workflow_instances.status` — the server-side participant list rule filters out `archived` and `deleted` instances. Admins still see all statuses in the data viewer.
- `workflows.is_active` — when false, the workflow is hidden from the participant workflow selector.
- `workflows.private_instances` — when true, participants only see instances they themselves created.
- `offline_packages.status` — only `ready` packages are exposed to participants; `draft`, `processing`, and `failed` are admin-only.
- `participants.is_active` — blocks login.

**Icon config JSON.** `workflows.icon_config`, `workflow_stages.icon_config`, `marker_categories.icon_config`, and the `workflows.filter_value_icons` map all share the same shape: `{ template_id, color, size, badge_id?, svgContent? }`. They are edited through either `MarkerIconDesigner` or `WorkflowIconDesigner`. The participant map falls back up the chain: filter-value icon → stage icon → workflow icon.

**Offline-first.** Participants sync data into IndexedDB (version 8, index `by_layer`) via `src/lib/participant-state/**`. Tile cache keys are `{layerId}/{z}/{x}/{y}`. `map_sources` was merged into `map_layers`, so the cache key uses layer id, not source id.

**Visual config JSON.** `workflow_connections.visual_config`, `tools_forms.visual_config`, `tools_edit.visual_config`, and `tools_protocol.visual_config` all hold `{ button_label, button_color, ... }` for the participant stage toolbar. An empty label falls through to the action/tool name, and an empty color falls through to a default palette.

**Instance ownership.** The `/instance` admin page is restricted to the instance owner -- the user whose email matches the `POCKETBASE_ADMIN_EMAIL` env var. All other admins are redirected to `/` by the page load. The underlying `instance_settings` and `instance_legal_pages` collections are publicly readable (the participant login page and `/legal/<slug>` need unauthenticated access) and writable by any authenticated admin at the collection level, but the write UI is only reachable through the owner-gated page. Helper: `src/lib/server/is-owner.ts`.

## Legend

- `[DONE]` appended to a page heading means every field in that section is documented.
- Each field line is `- [x] **field_name** (type) — summary.`; `- [ ]` means pending (none should remain in the final doc).

---

## Page: Projects List  `/projects`  [DONE]

File: `src/routes/admin/projects/+page.svelte`
Collection: `projects`
Notes: List page only. Cards are read-only; no inline field editing. Actions here are Create, Import Schema, Export Schema, two data-export actions, and navigating into a project. The data exports are: "Export full project (ZIP)" — a full, re-importable archive that keeps raw-ID columns (import matches columns by name); and "Export data (CSV)" — human-readable, adding companion `*_name` columns (current_stage_name; protocol & tool-usage stage_name; marker category_name + visible_to_roles_names; participant role_names) and resolving custom_table_selector values to `; `-joined labels. The CSV is for reading; the ZIP intentionally keeps raw IDs for re-import. No documentable fields.

---

## Page: New Project  `/projects/new`  [DONE]

File: `src/routes/admin/projects/new/+page.svelte`
Collection: `projects`

<!-- --8<-- [start:projects-name] -->
- [x] **name** (text, required, max 255) — Display label for the project. Shown in the participant app layout header as a fallback when `projects.settings.display_name` is empty, and used as the project title throughout the admin UI.
<!-- --8<-- [end:projects-name] -->
<!-- --8<-- [start:projects-description] -->
- [x] **description** (text, optional, max 1000) — Admin-only metadata for documenting what the project is about. Not surfaced to participants anywhere.
<!-- --8<-- [end:projects-description] -->

---

## Page: Project Settings  `/projects/[projectId]/settings`  [DONE]

File: `src/routes/admin/projects/[projectId]/settings/+page.svelte` (shell) + `sections/*.svelte`

**Not tabs — a sidebar with grouped sections.** The settings page renders a left `SettingsSidebar` (`SettingsSidebar.svelte`) plus one section component at a time; the active section is chosen via the `?section=<id>` URL param (default `branding`). Sections are organised into five groups (German captions in the UI):

- **Allgemein** (General): `branding`, `startup`.
- **Karte** (Map): `layers`, `map-defaults`.
- **Funktionen** (Features): `chat`, `info-pages`, `offline-packs`, `field-filters`, `cluster`.
- **Integrationen** (Integrations): `api-tokens` (labelled "GIS-Zugang").
- **Gefahrenzone** (Danger zone): `danger-zone`.

The field-level docs below mirror this structure. "General fields" and "Map fields" collect the per-field content; the **Chat** (Funktionen) and **GIS Access** (Integrationen) subsections document the chat and API-token features.

### General fields (Allgemein group: `branding`, `startup`)

Sections: `BrandingSection.svelte`, `StartupSection.svelte`
Collections: `projects`, `info_pages`

- [x] **display_name** (text, stored in `projects.settings.display_name`) — Overrides `projects.name` as the project title shown in the participant app header. Read in `src/routes/(participant)/+layout.server.ts` and passed to the layout as `projectName`; falls back to `projects.name` when empty.
- [x] **icon** (file upload, PNG/JPEG/SVG/WebP, max 2MB, stored in `projects.icon`) — Project icon displayed in the participant app header. Served via `/api/files/projects/{id}/{filename}` and fetched by the participant layout server.
- [x] **info_page.title** (text, required) — Title of an info page listed in the participant app's info pages view. Rendered as the button label in the participant settings sheet.
- [x] **info_page.content** (rich text/HTML, required) — HTML body shown when a participant opens an info page from the settings sheet. Loaded via the admin client in `src/routes/(participant)/+layout.server.ts` with `fields: 'id,title,content'`. Supports per-participant template markers rendered by `src/lib/info-page-render.ts`: `$token` / `$loginlink` (inline text) and the QR markers `$qrtoken` (QR of the access token) and `$qrloginlink` (QR of a one-click login link). QR markers become standalone QR images; markers are dropped silently when no participant token is in scope.
- [x] **info_page.sort_order** (integer, ≥0) — Controls the display order of info pages in the participant settings sheet. Used as the primary sort key (`sort: 'sort_order,created'`) when fetching pages.

---

### Map fields (Karte group: `layers`, `map-defaults`)

Sections: `LayersSection.svelte`, `MapDefaultsSection.svelte`
Collections: `projects` (map defaults live in `projects.settings.map_defaults` JSON), `map_layers`, `offline_packages`

### Map defaults (`projects.settings.map_defaults`)

Stored as a JSON blob inside the `projects.settings` field (there is no separate `map_settings` collection). Keys documented here are the keys on that JSON object.

- [x] **center.lat** (number, latitude) — Latitude of the initial map center when a participant opens the map. Passed to the Leaflet map constructor in `MapCanvas.svelte`. In the `update_map_settings` MCP tool this is exposed as the `center_lat` parameter, which is persisted under `map_defaults.center.lat`.
- [x] **center.lng** (number, longitude) — Longitude of the initial map center, paired with `center.lat`. Exposed as `center_lng` in the MCP tool; must be set together with `center.lat`.
- [x] **zoom** (integer, 0–22) — Initial zoom level applied when the participant map loads. Clamped by `min_zoom` / `max_zoom`. Note: the field is literally named `zoom` on the JSON object (not `default_zoom`).
- [x] **min_zoom** (integer, 0–22) — Lower bound on how far out a participant can zoom. Enforced via `map.setMinZoom()` in the participant map canvas.
- [x] **max_zoom** (integer, 0–22) — Upper bound on how far in a participant can zoom. Applied to tile layers and the map's `maxZoom` option.
### Map layer — Preset source

- [x] **preset_source** (select from `PRESET_SOURCES`) — Picks one of the built-in map sources (OSM, CartoDB, ESRI, NRW) defined in `src/lib/types/map-layer.ts`. Creates a `map_layers` row with URL, attribution and WMS config pre-filled from the preset.

### Map layer — Tile URL

- [x] **tile.name** (text, required) — Display name for the layer, shown in the participant map layer picker (`LayerSheet.svelte`). Stored as `map_layers.name`.
- [x] **tile.tile_url** (text, XYZ template) — XYZ tile URL template (e.g. `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`). Used by the participant map's tile layer and by the offline tile cache keyed as `{layerId}/{z}/{x}/{y}`.
- [x] **tile.attribution** (text, optional) — Attribution string displayed in the map's attribution control. Passed to Leaflet's tile layer options when the layer renders.
- [x] **tile.as_base** (boolean, base vs overlay) — If true, the layer is a mutually-exclusive base layer (rendered as radio buttons); if false, it's an overlay the participant can toggle independently.

### Map layer — WMS

- [x] **wms.name** (text, required) — Display name for the WMS layer in the participant map layer picker. Stored as `map_layers.name` alongside the WMS config.
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
- [x] **map_layers.source_type** (select: tile/wms/uploaded/preset/geojson) — Categorises the layer and selects which editor fields and participant-side loader apply. Written implicitly when picking the preset/tile/WMS/upload variant; participants never see it directly.
- [x] **map_layers.url** (text) — Layer source URL: XYZ tile template, WMS endpoint, or GeoJSON location depending on `source_type`. Same field is used by all non-uploaded layer types and is read by the participant map to fetch remote data.
- [x] **map_layers.config** (json) — Source-specific JSON blob holding attribution, WMS parameters (`layers`, `format`, `version`, `transparent`), upload format, and similar metadata. The tile/WMS/upload field entries above are really sub-keys of this object.
- [x] **map_layers.display_order** (integer) — Stacking order in the participant layer picker. Lower values render beneath higher ones; controls both the on-map z-order and the list position.
- [x] **map_layers.is_active** (boolean) — Master switch: when false the layer disappears from the participant layer picker regardless of role permissions, so admins can stage layers without exposing them.
- [x] **map_layers.status** (select: uploading/pending/processing/completed/failed) — Pipeline state for uploaded tile archives. Only `completed` layers are served to participants; other states are admin-only while processing or triaging failures.
- [x] **map_layers.progress** (integer, 0–100) — Upload/tile-generation progress percentage. Shown in the admin Map tab while an uploaded layer is still being processed.
- [x] **map_layers.error_message** (text) — Populated when `status = "failed"` to explain why tile extraction died. Admin-only diagnostic.
- [x] **map_layers.tile_count** (integer) — Number of tiles found inside the uploaded archive. Used for progress estimation and as an admin sanity check after upload.

### Offline package

- [x] **offline_package.name** (text, required) — Display name for a downloadable tile package in the participant map's offline settings. Only packages with `status = "ready"` appear to participants.
- [x] **offline_package.zoom_min** (integer) — Lowest zoom level included when tiles are generated into the archive. Controls the coarsest detail available offline.
- [x] **offline_package.zoom_max** (integer) — Highest zoom level included when tiles are generated into the archive. Controls the finest detail available offline; higher values produce much larger packages.
- [x] **offline_package.region_geojson** (GeoJSON polygon via RegionSelector) — Polygon defining the geographic area to download. Tile generation walks this polygon at every zoom level between `zoom_min` and `zoom_max`.
- [x] **offline_package.layers** (relation multi, `map_layers`) — Which map layers are packaged into the offline archive. Participants downloading the package get cached tiles for exactly these layers.
- [x] **offline_package.visible_to_roles** (relation multi, roles) — Restricts which participant roles can download this package. Empty array means all roles in the project can see the package once it reaches `status = "ready"`.
- [x] **offline_package.status** (select: draft/processing/ready/failed) — Pipeline state gating participant visibility. Only `ready` packages appear in the participant offline list; the other states are admin-only while the server is still building or has failed.
- [x] **offline_package.error_message** (text) — Populated when `status = "failed"`. Admin-only diagnostic shown in the package row.
- [x] **offline_package.tile_count** (integer) — Number of tiles written into the archive. Used for size estimation and a progress read-out in the admin package list.
- [x] **offline_package.file_size_bytes** (integer) — Archive size in bytes. Displayed to participants in the offline download list so they can estimate bandwidth and local storage.
- [x] **offline_package.archive_file** (file, auth-protected) — The generated ZIP / MBTiles archive. Served as the participant download target; not directly uploaded by admins — the server writes it after region + layer selection.

### Chat (Funktionen group: `chat`)

Section: `ChatSection.svelte` (saves via the `?/saveChatSettings` action in `+page.server.ts`)
Collections: `projects` (toggle + allowlist), `chat_messages`, `chat_read_state`; hooks in `pb/pb_hooks/chat.pb.js`

**Behavior.** One project-wide chat room shared among **participants** — there are no DMs and no admin chat UI; admins only configure it here. `@`-mentions are populated from `GET /api/custom/chat/mentionable-participants?project_id=<id>` (participant auth only; returns `{ id, name }` for the participants the caller is allowed to mention). Unread state is "soft" (a gray dot) until you are `@`-mentioned, which raises a red badge. Messages stream in realtime over the participant gateway and are mirrored into IndexedDB so the room is readable offline.

- [x] **projects.chat_enabled** (bool toggle) — Project-wide kill switch. When false the room is unavailable to everyone regardless of `chat_visible_to_roles`. Enforced in every `chat_messages` rule (`project_id.chat_enabled = true`).
- [x] **projects.chat_visible_to_roles** (relation multi → `roles`, maxSelect 99) — Role allowlist for chat membership. **Empty = all participants** in the project; non-empty restricts the room to participants whose `role_id` intersects the list (`chat_visible_to_roles:length = 0 || @request.auth.role_id.id ?= chat_visible_to_roles.id`). Both fields are written together by `?/saveChatSettings`.

#### Collection: `chat_messages`

- [x] **project_id** (relation → `projects`, required, cascade delete) — Owning project; scopes the room and drives the chat-enabled / role-allowlist rule checks.
- [x] **author_id** (relation → `participants`, required) — The participant who sent the message. Create/update/delete require `author_id = @request.auth.id`, so participants can only write as themselves.
- [x] **body** (text, required, max 4000) — Message text. Mentions are written as `@<15-char participant id>` tokens inside the body.
- [x] **mentions** (json) — Server-authoritative array of mentioned participant ids. **Never trusted from the client**: `chat.pb.js` re-extracts it from `body` on every create/update (regex `@([a-z0-9]{15})`), dropping ids that don't resolve to a participant in the same project.
- [x] **created / updated** (autodate) — Standard timestamps. `created` also anchors the 5-minute edit/delete window.
- **Rules.** list/view = project owner **OR** a participant member (project match + `chat_enabled` + role allowlist). create/update/delete = the same membership **AND** `author_id = @request.auth.id` (author-only). Edits and deletes are additionally blocked once the message is older than 5 minutes — enforced in `pb/pb_hooks/chat.pb.js` (`onRecordUpdateExecute` / `onRecordDeleteExecute` throw `BadRequestError` past the window).

#### Collection: `chat_read_state`

- [x] **participant_id** (relation → `participants`, required, cascade delete) — Owner of the read-state row. **All five rules** = `participant_id = @request.auth.id` (each participant manages only their own).
- [x] **project_id** (relation → `projects`, required, cascade delete) — The room this read-state tracks. A unique index on `(participant_id, project_id)` guarantees one row per participant per project.
- [x] **last_read_at** (date, required) — High-water mark for "everything up to here is read"; drives the soft (gray-dot) unread indicator.
- [x] **last_mention_seen_at** (date, optional) — High-water mark for mentions; drives the red mention badge.
- **Timestamps cannot regress.** `chat.pb.js` (`onRecordUpdateExecute` on `chat_read_state`) clamps `last_read_at` / `last_mention_seen_at` back to their previous values if an update tries to move them backwards.

### GIS Access (Integrationen group: `api-tokens`, labelled "GIS-Zugang")

Section: `ApiTokensSection.svelte` (actions `?/createApiToken`, `?/revokeApiToken` in `+page.server.ts`)
Collection: `api_tokens`; endpoints under `src/routes/api/geo/**`; helper `src/lib/server/api-token.ts`

Read-only personal access tokens that let external GIS clients (e.g. QGIS) pull a project's data as GeoJSON.

#### Collection: `api_tokens`

- [x] **user_id** (relation → `users`, required, cascade delete) — The owning admin. **All five rules** = `user_id = @request.auth.id && @request.auth.collectionName = "users"` (owner-only; participants can never touch this collection).
- [x] **project_id** (relation → `projects`, optional, cascade delete) — Project scope. **Empty = all of the owner's projects**; when set, the token is rejected (403) for any other project.
- [x] **label** (text, optional, max 255) — Human-readable note shown in the token list.
- [x] **token_hash** (text, required, max 64) — sha256 **hex** of the raw token (unique index `idx_api_tokens_token_hash`). The raw token is never stored.
- [x] **last_four** (text, max 8) — Last 4 chars of the raw token, for identifying a row in the UI.
- [x] **expires_at** (date, optional) — Expiry. A token past `expires_at` resolves as invalid (401) at request time.
- [x] **last_used_at** (date, optional) — Best-effort, throttled (≥60 s) timestamp bumped by the resolver on use.
- [x] **revoked** (bool) — Soft-revoke flag checked by the resolver. Note the UI `?/revokeApiToken` action **hard-deletes** the row rather than setting this.
- [x] **created / updated** (autodate) — Standard timestamps.

**Token lifecycle.** `?/createApiToken` mints a raw token `ubk_` + `base64url(32 random bytes)`, stores only its sha256 hash + `last_four`, and returns the raw value **once** (shown to the admin a single time). `?/revokeApiToken` hard-deletes the token row (ownership enforced by the collection deleteRule).

#### Read-only GeoJSON endpoints (SvelteKit routes under `/api/geo/...`)

Bearer-token auth via `requireApiTokenAdmin` (`src/lib/server/api-token.ts`). A token may be supplied as `Authorization: Bearer <token>`, as HTTP Basic with the token in the **username** field (QGIS-friendly), or as a `?token=` query param (discouraged — leaks into logs/URLs).

- [x] **GET `/api/geo/projects/{projectId}`** — Layer index JSON: one entry per workflow plus a markers entry, with feature counts and ready-to-paste `.geojson` URLs.
- [x] **GET `/api/geo/projects/{projectId}/markers.geojson`** — `FeatureCollection` of marker **Point** features (geometry from `markers.location`).
- [x] **GET `/api/geo/projects/{projectId}/workflows/{workflowId}.geojson`** — `FeatureCollection` of that workflow's instances (instance geometry, or centroid fallback for point workflows).

**Auth model.** The presented token's sha256 hash is looked up with a **superuser** client (the row holds only a hash + owner ref, no project data); the request then **impersonates the owning admin**, so every read runs under that admin's `owner_id` rules. Errors: **401** missing/invalid/expired token, **403** token scoped to a different project, **404** project/workflow not found (or not readable by the owner). Coordinates are WGS84 `[lon, lat]` (RFC 7946); `custom_table_selector` / multi-select ids are resolved to human labels in feature properties.

---

## Page: Participants  `/projects/[projectId]/participants`  [DONE]

File: `src/routes/admin/projects/[projectId]/participants/+page.svelte`
Collections: `participants`, `participant_custom_fields`

<!-- --8<-- [start:participants-name] -->
- [x] **name** (text, required, max 255) — Human-readable participant label, shown in the admin table and embedded into generated QR-code labels. Not used for authentication.
<!-- --8<-- [end:participants-name] -->
<!-- --8<-- [start:participants-phone] -->
- [x] **phone** (text, optional) — Optional contact phone number. Admin-only metadata with no participant-side effect.
<!-- --8<-- [end:participants-phone] -->
<!-- --8<-- [start:participants-token] -->
- [x] **token** (text, unique, readonly in UI, auto-generated on create) — The participant's login credential. PocketBase auth uses `token` as both identity and password (`authWithPassword(token, token)` in `src/routes/(participant)/login/+page.server.ts`), and it is embedded in generated QR codes.
<!-- --8<-- [end:participants-token] -->
<!-- --8<-- [start:participants-role_id] -->
- [x] **role_id** (relation multi, `roles`) — The participant's assigned roles. Every `visible_to_roles` / `allowed_roles` check across workflows, stages, forms, edit tools, marker categories, custom tables, map layers, and offline packages compares against this array.
<!-- --8<-- [end:participants-role_id] -->
<!-- --8<-- [start:participants-is_active] -->
- [x] **is_active** (boolean, toggled via status button) — If false, login fails with "This account is inactive" in `src/routes/(participant)/login/+page.server.ts` even when the token is correct. Used to temporarily disable a participant without deleting them.
<!-- --8<-- [end:participants-is_active] -->
- [x] **metadata.{custom_field}** (per-field value stored in JSON) — Per-participant values for any `participant_custom_fields` defined on the project. Stored as a JSON object keyed by `field_name`; values are preserved even if the field definition is later removed.

### Participant custom field definitions

- [x] **participant_custom_fields.field_name** (text, unique per project) — Internal key used to store and read values in `participants.metadata`. Also rendered as the admin table column header.
- [x] **participant_custom_fields.field_type** (select: text/number/date/boolean) — Determines the editor widget in the admin table and how the value is interpreted when read back out of `metadata`.
- [x] **participant_custom_fields.is_required** (boolean) — If true, the field cannot be blank when a participant is created or updated through the admin UI.
- [x] **participant_custom_fields.default_value** (text) — Value pre-filled into new participant rows when no explicit value is provided. Stored as text and coerced to the field type on read.

### Bulk actions

- [x] **QR Export** (generates QR codes containing participant tokens) — Generates a multi-page PDF of QR codes for selected participants, each encoding the participant's token for scan-to-login. Used to bulk-distribute login credentials in the field.

### Guest participants (self-join)

- [x] **participants.self_joined** (boolean) — Set to `true` only by the public `/join/[slug]` endpoint when a guest mints their own account; `false`/null for admin-created participants. Surfaced by `participants.listRule`/`viewRule` (a participant can read its own row but not other guests') and used by the janitor cron. Guest rows are auto-deactivated (`is_active = false`, not deleted) by the `self_join_janitor` cron once the account is older than 90 days (runs daily at 03:17, `pb/pb_hooks/self_join_janitor.pb.js`).
- [x] **Show guests** (toggle, URL param `?showGuests=true`) — By default the participants list hides `self_joined` rows (server filter `self_joined = false || self_joined = null` in `+page.server.ts`). Turning it on flips `showGuests` and lists guest participants alongside admin-created ones.

---

## Page: Roles · Roles Tab  `/projects/[projectId]/roles`  [DONE]

File: `src/routes/admin/projects/[projectId]/roles/+page.svelte`
Collection: `roles`

<!-- --8<-- [start:roles-name] -->
- [x] **roles.name** (text, required, max 255) — Display name for the role, shown in role pickers, the permissions matrix, and the participant edit dialog. Core identifier used for assignment.
<!-- --8<-- [end:roles-name] -->
<!-- --8<-- [start:roles-description] -->
- [x] **roles.description** (text, optional) — Admin-only note describing what the role is for. Not surfaced to participants.
<!-- --8<-- [end:roles-description] -->
- [x] **roles.assigned_participants** (reverse relation; edits `participants.role_id`) — Convenience editor that writes back to `participants.role_id` for every selected participant. Changing it immediately affects what each participant can see once they reload.
- [x] **roles.self_joinable** (boolean toggle, action `?/toggleSelfJoinable`) — When enabled, anyone with the role's public link can mint their own guest account (no admin invite). On the *first* enable the action auto-generates a unique `join_slug`; toggling off keeps the existing slug. A "Show join URL & defaults" row action opens a dialog with the `/join/<slug>` link (copy button) and the defaults applied to each guest: name **Guest**, placeholder email (`p-…@placeholder.local`), `is_active = true`, lands on `/map`, auto-deactivated after 90 days. Requires `self_joinable` to be on before a join URL exists.
- [x] **roles.join_slug** (text, globally unique, unguessable) — Random `base64url` slug generated on first self-join enable. Backs the public link `/join/<slug>`; rotated only by clearing/regenerating server-side. Not edited directly in the UI.
- [x] **roles.max_instances** (numeric, action `?/updateRoleInstanceQuota`) — Per-participant cap on how many `workflow_instances` a holder of this role may have. `0` (or empty) = unlimited. For a multi-role participant the **most-permissive non-zero** cap across their roles wins (if no role caps, unlimited). The count is live (`created_by = <participant>`), so admin deletions free it up. Enforced server-side by `pb/pb_hooks/participant_instance_quota.pb.js`, which rejects over-quota creates with HTTP 400 `quota_exceeded:instances`. Admin (`users`) auth bypasses entirely.
- **Participant-side quota gating:** when a participant has reached `max_instances`, the participant map's "create" buttons render disabled with a hint (`WorkflowSelector` props `quotaReached` / `quotaHint`); a direct create attempt still returns the 400 `quota_exceeded:instances` from the hook.

---

## Page: Self-join  `/join/[slug]`  [DONE]

File: `src/routes/(participant)/join/[slug]/+server.ts`
Auth: **public, participant-facing — no login required.** This is the endpoint behind a role's `self_joinable` join URL.

- [x] **GET `/join/<slug>`** — Mints a guest participant for the role whose `join_slug` matches `<slug>` and logs them straight in:
  - Rate-limited per client IP (shares the login rate-limiter; HTTP 429 with a retry hint when exceeded).
  - Consent-gated: if the instance has `require_consent_before_login`, an un-consented visitor is bounced to `/login?returnTo=/join/<slug>` (the consent modal) and returns here after accepting.
  - **404** if the slug is unknown **or** the matched role has `self_joinable = false`.
  - On success creates a `participants` row with `self_joined = true`, name `Guest`, placeholder email, `is_active = true`, `role_id = [role]`; authenticates it (sets the `pb_auth_participant` cookie) and redirects to `/map` (or `?next=` when it is a local `/…` path).
  - If already authenticated as a participant in the same project, it skips minting and just redirects to `/map`.

---

## Page: Roles · Permissions Tab  `/projects/[projectId]/roles`  [DONE]

File: `src/routes/admin/projects/[projectId]/roles/+page.svelte` (permissions section)
Action: `?/toggleRole` — toggles a role in/out of a `visible_to_roles` or `allowed_roles` array on a target collection.

- [x] **workflows.visible_to_roles** (relation multi, read toggle) — Controls whether a role can see the workflow at all in the participant app. Empty array = visible to everyone in the project; non-empty = only listed roles.
- [x] **workflows.entry_allowed_roles** (relation multi, create toggle) — Controls whether a role can create new instances of the workflow. Independent from `visible_to_roles`: a role can be allowed to see existing instances without being allowed to create new ones.
- [x] **workflow_connections.allowed_roles** (relation multi, update/trigger toggle) — Controls whether a role can trigger the transition (tap the action button) that moves an instance across this connection. Hiding the connection also hides any buttons attached to it.
- [x] **workflow_field_defs.view_roles** (relation multi, read toggle) — Per-field read gate. Controls whether a role can see a field's values in the participant instance-detail Data view. Empty array = every role can read it. This replaces stage-level visibility as the field-level read boundary. **UI gap:** there is no admin control for `view_roles` on the Roles permissions tab yet (and stage visibility was removed from it) — set it per field def in the Field Library, or via the MCP `set_entity_visibility` tool.
- [x] **tools_forms.allowed_roles** (relation multi, submit toggle) — Controls whether a role can open and submit the form. Forms gated off this way disappear from the participant stage toolbar for that role.
- [x] **tools_edit.any_edit_roles** (relation multi, update toggle) — Roles in this list can use the edit tool on *any* instance. Toggling on the project Roles page edits this array (not `self_edit_roles`). Applies equally to stage-attached and global tools.
- [x] **tools_edit.self_edit_roles** (relation multi, update toggle) — Roles in this list can use the edit tool only on instances they themselves created (`workflow_instances.created_by = @request.auth.id`). Set per tool in the workflow builder (StagePropertyPanel / GlobalToolsPanel / ButtonConfigPanel). A role in both arrays resolves to `any` and renders one button.
- [x] **custom_tables.visible_to_roles** (relation multi, read toggle) — Controls whether a role can read rows from the custom table, including when it's referenced from a `custom_table_selector` form field. Empty array = readable to all participants.
- [x] **marker_categories.visible_to_roles** (relation multi, read toggle) — Controls whether a role sees markers from this category on the map and in the filter sheet. Markers inherit visibility from their category.
- [x] **map_layers.visible_to_roles** (relation multi, read toggle) — Controls whether a role sees the layer in the participant map layer picker. Empty array = all roles see it.
- [x] **offline_packages.visible_to_roles** (relation multi, read toggle) — Controls whether a role can download a ready offline package. Combined with `status = "ready"`: hidden packages never appear even if processing succeeded.

---

## Page: Custom Tables List  `/projects/[projectId]/custom-tables`  [DONE]

File: `src/routes/admin/projects/[projectId]/custom-tables/+page.svelte`
Collection: `custom_tables`

- [x] **table_name** (text, snake_case) — Unique internal identifier enforcing lowercase letters, numbers, and underscores. The admin UI locks the input after creation, but the underlying PocketBase schema has no readonly constraint, so direct API edits can still rename it — treat as "change with care". Participants never see this field.
- [x] **display_name** (text, required) — Human-readable name displayed in the admin UI and form field labels when tables are used as custom_table_selector field sources. Required field with max 255 characters.
- [x] **description** (text, optional) — Admin-facing documentation stored up to 1000 characters; not displayed to participants. Contextual field for table purpose.
- [x] **main_column** (text, required, snake_case) — The primary display column; when this table is used in custom_table_selector fields, this column's value becomes the selectable label. The admin UI marks it as non-editable after creation, but (like `table_name`) the schema does not enforce readonly — renaming via API will leave stored values orphaned.
- [x] **visible_to_roles** (relation multi, roles) — Controls which participant roles can read/query this table and use it in form field selectors. Empty array = visible to all roles. Toggled via permissions tab.
- [x] **sort_order** (integer, ≥0) — Display rank for tables in the admin list and in form-field selector dropdowns. Admin-only; lets admins pin frequently-used tables to the top.

---

## Page: Custom Table Detail  `/projects/[projectId]/custom-tables/[tableId]`  [DONE]

File: `src/routes/admin/projects/[projectId]/custom-tables/[tableId]/+page.svelte`
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
- [x] **custom_table_columns.sort_order** (integer, ≥0) — Display order of columns in the admin row editor and CSV import/export. Admin-only UI affordance.

### Row data

- [x] **custom_table_data.row_data.{column}** (per-cell value, typed by column) — JSON object (max 100KB) where each key is a column_name and value is typed by column_type (text/number/date/boolean). Participants query and display this data via form field selectors.
- [x] **CSV import** (bulk row insert, replace-or-append option) — Admin action to parse CSV, validate headers against table schema, optionally clear existing data (replaceData=true), and batch-insert rows. Supports typed values per column_type.

---

## Page: Marker Categories List  `/projects/[projectId]/marker-categories`  [DONE]

File: `src/routes/admin/projects/[projectId]/marker-categories/+page.svelte`
Collection: `marker_categories`

- [x] **name** (text, required, max 255) — Display name of the marker category, shown next to the icon in the participant map's filter sheet (`FilterSheet.svelte` groups markers by category and labels each row with `category.name`). Also used as the column header in the admin list and as the heading on the category detail page.
- [x] **description** (text, optional, max 1000) — Admin-facing note describing what the category is for. Not surfaced anywhere on the participant map.
- [x] **visible_to_roles** (relation multi, roles) — Restricts which participant roles see markers from this category on the map and in the filter sheet. Empty array means all roles in the project see the category; markers inherit visibility from their category.
- [x] **icon_config** (JSON via `MarkerIconDesigner`: `svgContent`, `color`, `size`, optional badge) — Defines the pin appearance for every marker in the category. The participant map and filter sheet render the inline `svgContent` recolored with `color` at `size` pixels for both individual pins and donut cluster slices.

---

## Page: Marker Category Detail  `/projects/[projectId]/marker-categories/[categoryId]`  [DONE]

File: `src/routes/admin/projects/[projectId]/marker-categories/[categoryId]/+page.svelte`
Collections: `marker_categories` (meta + fields schema), `markers`

### Category meta (via `DataViewerHeader`)

- [x] **marker_categories.name** (text, required, max 255) — Display name of the category, shown in the participant map's filter sheet beside the icon and used as the page heading in the admin detail view. Same field surfaced on the list page.
- [x] **marker_categories.description** (text, optional, max 1000) — Admin-only context describing the category. Never displayed to participants.
- [x] **marker_categories.visible_to_roles** (relation multi, roles) — Controls which participant roles can see markers belonging to this category on the map and in the filter sheet. Empty array means visible to every role in the project.
- [x] **marker_categories.icon_config** (JSON via `MarkerIconDesigner`: `svgContent`, `color`, `size`, optional badge) — Drives how every marker in this category is drawn on the participant map, including the inline SVG recolored with `color` at `size` pixels. The same icon is rendered next to the category name in the filter sheet and in donut cluster slices.

### Custom field definitions (stored inside `marker_categories.fields` JSON array)

- [x] **fields[].field_name** (text, snake_case) — Internal key used to store and read per-marker values in `markers.properties`. The participant marker detail module reads `marker.properties?.[field.field_name]` and renders the formatted key as the row label.
- [x] **fields[].field_type** (select: text/number/date/boolean) — Determines how the value is interpreted and formatted in the participant marker detail view (`formatValue(value, field.field_type, …)` in `MarkerDetailModule.svelte`). Also controls the editor widget when admins fill marker rows.
- [x] **fields[].is_required** (boolean) — If true, the field cannot be left blank when creating or updating a marker through the admin UI or CSV import. Enforced at the form level in the category detail page.
- [x] **fields[].default_value** (text) — Value pre-filled into new marker rows when no explicit value is provided. Stored as text and coerced to `field_type` on read.

### Marker rows

- [x] **markers.title** (text, required, max 500) — Primary label of the marker, shown as the heading in the participant marker detail module and used in marker lists. Required on every row.
- [x] **markers.description** (text, optional, max 5000) — Long-form text shown in the participant marker detail module below the title. Optional and rendered only when set.
- [x] **markers.location** (geoPoint `{lat, lon}`, required) — Geographic position used to place the pin on the participant Leaflet map. The map filter and renderer in `src/routes/(participant)/map/+page.svelte` keep markers with `m.location?.lat` and `m.location?.lon` and feed them to the supercluster manager.
- [x] **markers.properties.{field}** (JSON object keyed by `field_name`) — Per-marker values for the custom fields defined on the parent category. Read in `MarkerDetailModule.svelte` as `marker.properties?.[field.field_name]` and formatted by `field_type` for display.
- [x] **CSV import** (bulk marker insert, replace-or-append) — Admin action on the category detail page that parses CSV, maps columns to title/description/location/custom fields, and batch-creates marker rows via the `?/importCSV` form action. Supports clearing existing markers in the category before import.

---

## Page: Workflows List  `/projects/[projectId]/workflows`  [DONE]

File: `src/routes/admin/projects/[projectId]/workflows/+page.svelte`
Collection: `workflows`

<!-- --8<-- [start:workflows-name] -->
- [x] **workflows.name** (text, required) — Display name of the workflow shown in the participant `WorkflowSelector` menu and on the bottom control bar entry button. Also used as the row label on the admin workflows list table.
<!-- --8<-- [end:workflows-name] -->
<!-- --8<-- [start:workflows-description] -->
- [x] **workflows.description** (text, optional) — Short subtitle shown under the workflow name in the participant workflow picker. Surfaces verbatim to participants when they pick which workflow to start.
<!-- --8<-- [end:workflows-description] -->
<!-- --8<-- [start:workflows-workflow_type] -->
- [x] **workflows.workflow_type** (select: incident/survey) — Determines the entry flow in the participant app: `incident` puts the user into coordinate-selection mode to drop a map marker before the form opens, while `survey` skips coordinate selection and opens the form directly without placing a marker (`WorkflowSelector.svelte` line 77).
<!-- --8<-- [end:workflows-workflow_type] -->
<!-- --8<-- [start:workflows-is_active] -->
- [x] **workflows.is_active** (boolean, toggle) — Master switch that gates all participant access to the workflow. The `workflows` listRule only returns rows where `is_active = true` to participants, so toggling it off makes the workflow and all its instances vanish from the participant app.
<!-- --8<-- [end:workflows-is_active] -->
- [x] **workflows.icon_config** (JSON, via `WorkflowIconDesigner`) — Default marker icon used on the participant map for instances of this workflow. `MapCanvas.createWorkflowInstanceIcon` falls back to this icon when no filter-value or stage icon is set.
- [x] **workflow_stages.icon_config** (per-stage JSON, edited from same designer) — Stored on `workflow_stages.visual_config.icon_config`; overrides the workflow icon for instances currently sitting in that stage. Second step in the `MapCanvas` icon fallback chain (filter value -> stage -> workflow -> default circle).
- [x] **workflows.filter_value_icons** (JSON map from field value to icon config) — Map keyed by a filterable form-field value; `MapCanvas` looks up the instance's current filter value and uses the matching icon as the highest-priority entry in the fallback chain. `FilterSheet.svelte` also reads it to render the per-value icons in the filter list.
<!-- --8<-- [start:workflows-geometry_type] -->
- [x] **workflows.geometry_type** (select: point/line/polygon) — Shape the participant draws when starting an instance. `point` keeps the classic single-coordinate behaviour; `line`/`polygon` switch the participant app into sketch-mode (multi-vertex) and populate `workflow_instances.geometry` instead of (or in addition to) `location`.
<!-- --8<-- [end:workflows-geometry_type] -->

---

## Page: Workflow Detail / Data Viewer  `/projects/[projectId]/workflows/[workflowId]`  [DONE]

File: `src/routes/admin/projects/[projectId]/workflows/[workflowId]/+page.svelte`
Collections: `workflows` (meta), `workflow_instances`, `workflow_field_values`

### Workflow meta (via `DataViewerHeader`)

- [x] **workflows.name** (text, inline editable) — Same field as on the list page; editing it here renames the workflow everywhere it is shown to participants (`WorkflowSelector`, bottom control bar). Persisted via the `updateWorkflowMeta` action with `field = 'name'`.
- [x] **workflows.description** (text, inline editable) — Same field as on the list page; the inline edit posts to `updateWorkflowMeta` and updates the subtitle shown under the workflow name in the participant picker.
- [x] **workflows.visible_to_roles** (relation multi) — Restricts which participant roles can see the workflow and its instances. Enforced in the `workflow_instances` / `workflow_field_values` listRules: empty array means visible to all, otherwise the participant's `role_id` must be in the list. Field-value reads are additionally gated per field def by `workflow_field_defs.view_roles`.
- [x] **workflows.is_active** (boolean toggle) — Header-level toggle (lines 559-635 of `+page.svelte`) wired to `updateWorkflowMeta`. Same effect as on the list page: when false, the workflow disappears entirely from the participant app via the `workflows` listRule.
<!-- --8<-- [start:workflows-private_instances] -->
- [x] **workflows.private_instances** (boolean toggle) — When true, participants can only see instances they themselves created. The `workflow_instances` listRule adds `(workflow_id.private_instances != true || created_by = @request.auth.id)`, so other participants' instances of the same workflow stay hidden.
<!-- --8<-- [end:workflows-private_instances] -->

### Instance rows

- [x] **workflow_instances.is_active** (boolean) — Conceptual flag backed by the `workflow_instances.status` select field (values `active`/`completed`/`archived`/`deleted`). Participant listRules in `1776200000_filter_instance_status_for_participants.js` filter out rows where `status = "deleted" || status = "archived"`, so marking an instance inactive removes it from the participant map and detail views while admins keep seeing it.
- [x] **workflow_instances.is_archived** (boolean) — Conceptual flag backed by `workflow_instances.status = "archived"`. Archived instances are explicitly excluded from participants by the listRule status filter (`status != "archived"`), so they remain visible to admins in the data viewer but disappear from the participant app.
- [x] **workflow_field_values.value** (per-instance, per-field value; typed by the field def) — A row in the append-only value log: `(instance_id, field_def_id, write_mode, value, recorded_at, recorded_at_stage, recorded_by_action)`. Every submission via a form, edit tool, protocol tool, or automation **inserts a new row** — values are never updated in place. The "current value" of a field is the latest row by `recorded_at` per `(instance, field_def)`; `observation` write-mode fields keep the whole series as history. The data viewer renders one column per field def.
- [x] **workflow_field_values.file_value** (file, max 1 × 10MB, images only) — File attachment for `file`-type field defs. Participant uploads land here instead of in `value`.
- [x] **workflow_field_values.write_mode** (select: singleton/observation/computed) — Denormalized from the field def at write time, for audit. `singleton` = latest row wins; `observation` = every row is meaningful history; `computed` = produced by an automation, not entered by hand.
- [x] **workflow_instances.geometry** (GeoJSON, optional) — The full drawn geometry when the parent workflow's `geometry_type` is `line` or `polygon`. The participant map renders this as a polyline/polygon overlay; for `point` workflows it stays empty and only `location` is used.
- [x] **workflow_instances.centroid** (geoPoint, derived) — Center point derived from `geometry` when present. Used as the fallback pin coordinate and as the anchor for map clustering when the shape is not a point.
- [x] **workflow_instances.bbox** (JSON `{minLon, minLat, maxLon, maxLat}`, derived) — Bounding box derived from `geometry`. Used by the participant map to fit the viewport when zooming to a line/polygon instance and as a spatial pre-filter server-side.
- [x] **workflow_instances.files** (file multi, max 99 × 10MB) — Instance-level file attachments independent of any form field (e.g. photos attached from the detail view's generic upload slot).
- [x] **CSV import** (bulk create instances into a selectable start stage) — The `importCSV` action parses uploaded rows, optionally wipes existing instances, then creates one `workflow_instances` row per CSV row at the chosen target stage (defaulting to the workflow's `start` stage). `lat`/`lon` columns become the instance `location`, and remaining columns are appended as `workflow_field_values` rows keyed by `field_def_id`, with `recorded_at_stage` set to the target stage.

---

## Page: Workflow Builder · Properties · Stage  `/projects/[projectId]/workflows/[workflowId]/builder`  [DONE]

File: `src/routes/admin/projects/[projectId]/workflows/[workflowId]/builder/right-sidebar/views/properties/panels/StagePropertyPanel.svelte`
Collection: `workflow_stages`

Stages are no longer a permission boundary — `workflow_stages.visible_to_roles` was removed in the field-def redesign. The panel has two tabs: **Permissions** (edit-tool role splits) and **Tools** (connected-tool visual config).

- [x] **workflow_stages.stage_name** (text) — Display label for the stage shown in the participant workflow instance detail header and breadcrumb. Edited inline via the panel header input and persisted through the `onRename` callback.
- [x] **workflow_stages.stage_type** (select: start/intermediate/end) — Semantic role of the stage. `start` is the entry point a new instance lands in after creation; `end` marks terminal stages the automation engine treats as "completed" signals; `intermediate` covers everything in between. Drives the stage icon and a few validation rules in the builder. Displayed as a badge in the panel; not editable here.
- [x] **workflow_stages.stage_order** (integer) — Sort order of stages in the participant stage timeline and in list views. Set when the admin reorders stages on the canvas.
- [x] **tools_edit.any_edit_roles / tools_edit.self_edit_roles** (relation multi each — stage-attached edit tool permission, Permissions tab) — Paired arrays. `any_edit_roles` allows editing any instance; `self_edit_roles` restricts to instances the participant created. Both empty = nobody can use the tool (the inverse of the empty-array convention). The participant detail module hides the button when neither array matches the participant's role, or when only `self_edit_roles` matches and the participant did not create the instance.

---

## Page: Workflow Builder · Properties · Connection (Edge)  `/projects/[projectId]/workflows/[workflowId]/builder`  [DONE]

File: `src/routes/admin/projects/[projectId]/workflows/[workflowId]/builder/right-sidebar/views/properties/panels/EdgePropertyPanel.svelte`
Collection: `workflow_connections`

- [x] **workflow_connections.action_name** (text) — Internal name of the transition, used as the fallback button label when `visual_config.button_label` is empty (`conn.visual_config?.button_label || conn.action_name` in `WorkflowInstanceDetailModule.svelte` line 198). Also shown in the edge header in the builder.
- [x] **workflow_connections.from_stage_id** (relation, nullable) — Source stage of the transition, set when the admin draws an edge on the canvas. `null` marks an "entry connection" — the transition that spawns new instances at the `start` stage, with no predecessor.
- [x] **workflow_connections.to_stage_id** (relation, required) — Destination stage the transition moves the instance to. Always required; set by drawing the edge head onto a stage node in the builder canvas.
- [x] **workflow_connections.allowed_roles** (relation multi) — Restricts which participant roles can trigger this transition by tapping its action button in the workflow detail panel. Empty array allows all roles; hiding the connection also hides any buttons attached to it.
- [x] **workflow_connections.visual_config.button_label** (text) — Overrides `action_name` as the visible label on the stage action button in the participant workflow detail. Stored under the connections JSON `visual_config` and applied on Settings tab edit via `syncSettings`.
- [x] **workflow_connections.visual_config.button_color** (color) — Hex background color applied to the stage action button rendered in the participant detail toolbar. Configured via a color picker plus paired text input that both write into `visual_config.button_color`.
- [x] **workflow_connections.visual_config.requires_confirmation** (boolean) — When true, tapping the action button in the participant app opens a confirmation dialog before the transition runs (`if (connection.visual_config?.requires_confirmation)` in `WorkflowInstanceDetailModule.svelte` line 375). When false the transition fires immediately.
- [x] **workflow_connections.visual_config.confirmation_message** (text) — Body text shown inside that confirmation dialog. Only displayed when `requires_confirmation` is enabled; defaults to "Are you sure you want to proceed".
- [x] **workflow_connections.sentry** (JSON array — conditional availability, edited via `SentryEditor.svelte`) — A list of clauses, all AND-ed together, that gate whether participants see this connection at all. Each clause is `{ field_def_id, op, value? }` where `op` is one of `equals`, `not_equals`, `contains`, `is_empty`, `is_not_empty`, `gt`, `gte`, `lt`, `lte` (`value` is omitted for the unary `is_empty`/`is_not_empty`). Empty / missing = always available. Evaluation is client-side: the participant module reads the instance's current field values and hides any connection whose sentry doesn't match. The `allowed_roles` gate still applies on top. Edited in the EdgePropertyPanel **Settings → Availability** sub-section.

---

## Page: Workflow Builder · Form Editor  `/projects/[projectId]/workflows/[workflowId]/builder`  [DONE]

File: `src/routes/admin/projects/[projectId]/workflows/[workflowId]/builder/right-sidebar/views/form-editor/FormEditorView.svelte`
Collection: `tools_forms`

A form is a container; its fields are `tools_form_field_refs` rows pointing at `workflow_field_defs` (see Form Field Config below). A form can be attached three ways: **stage-attached** (`stage_id` set), **connection-attached** (`connection_id` set), or **global** (neither `connection_id` nor `stage_id` set). The Settings panel appears for **stage-attached and global** forms — both carry their own `allowed_roles` and `visual_config`. Connection-attached forms have no Settings panel; they inherit roles and `visual_config` from the connection.

**Global forms.** A global form is available on *every* stage of the workflow, gated only by its own `allowed_roles` (same empty-array-means-all rule, enforced by the `connection_id = "" && stage_id = ""` branch of the `tools_forms` listRule). It gets the same Settings panel as a stage-attached form (its own roles + `visual_config`). Admin-side, global forms are added via the **Global Tools** panel (not per-stage). Participant-side, a global form renders as a normal uniform form button on each stage's toolbar — no special section, badge, or sorting that distinguishes it from a stage-attached form.

- [x] **tools_forms.name** (text) — Internal label for the form, edited inline at the top of the Form Editor. For stage-attached forms it doubles as the fallback identifier when no `visual_config.button_label` is set.
- [x] **tools_forms.description** (text) — Admin-only metadata describing what the form is for. Not surfaced anywhere in the participant app.
- [x] **tools_forms.allowed_roles** (relation multi, stage-attached & global forms) — Restricts which participant roles can open and submit this form. Applies to both stage-attached and global forms (each gated by its own array); connection-attached forms instead inherit from the connection. Empty array means all roles in the project can use it.
- [x] **tools_forms.visual_config.button_label** (text, stage-attached & global forms) — Text shown on the button that opens the form in the participant stage toolbar. Falls back to the form name when blank. A global form's button appears on every stage with this same label.
- [x] **tools_forms.visual_config.button_color** (color, stage-attached & global forms) — Background color of the form's launch button in the participant stage toolbar. Defaults to `#3b82f6`.
- [x] **tools_forms.visual_config.requires_confirmation / confirmation_message** (boolean + text, stage-attached & global forms) — When true, a confirmation dialog with `confirmation_message` is shown before the form submits.
- [x] **tools_forms.pages** (JSON array — multi-page forms) — Array of `{ page, title, description }`. A field is placed on a page via the `page` number in its form-field-ref `config`; this array carries the per-page heading + sub-text the participant sees at the top of each page. Edited via the page tabs in the form preview (add / rename / delete page). A form with no `pages` entry renders as a single untitled page.
- [x] **tools_forms.local_fields** (JSON array — protocol-owned forms only) — Inline, protocol-only field definitions (`{ key, label, field_type, field_options, required, placeholder, help_text, page, row_index, column_position }`). They exist only on this form, are NOT in the `workflow_field_defs` registry, and their values land only in the protocol entry snapshot — never in `workflow_field_values`. Only present on the form owned by a protocol tool; see the Protocol Tool Editor section.

---

## Page: Workflow Builder · Field Library  `/projects/[projectId]/workflows/[workflowId]/builder`  [DONE]

File: `src/routes/admin/projects/[projectId]/workflows/[workflowId]/builder/right-sidebar/views/field-library/FieldLibraryView.svelte`
Collection: `workflow_field_defs`

The Field Library is the workflow-scoped field registry — the single source of truth for every logical field. Forms reference these defs (via `tools_form_field_refs`); the same def can appear on several forms. Definitional changes here apply everywhere the def is used.

- [x] **workflow_field_defs.label** (text, unique per workflow) — The field's name and identity. Shown to participants on forms and in the Data view, and used for cross-project import matching. Must be unique within the workflow.
- [x] **workflow_field_defs.field_type** (select) — Input widget type. One of `short_text`, `long_text`, `number`, `email`, `date`, `file`, `dropdown`, `multiple_choice`, `smart_dropdown`, `custom_table_selector` (the DB enum also includes `instance_reference`, a deferred feature). Determines which `field_options` / `validation_rules` shape applies (see Form Field Config below). Chosen at create time and effectively locked afterwards.
- [x] **workflow_field_defs.write_mode** (select: singleton/observation/computed) — Storage/UI semantics. `singleton`: one current value, each submission overwrites (the default). `observation`: append-only time series — every submission is kept as history. `computed`: value is produced by an automation, read-only to the participant. Storage is append-only regardless; `write_mode` only changes how the "current value" is interpreted. **In a form:** `singleton` shows the current value as context and submitting writes a new latest row (effective overwrite); `observation` starts blank for that field and each submit appends a new history row; `computed` renders read-only and server-derived — client writes to it are rejected.
- [x] **workflow_field_defs.output_type** (select: text/number/date/json, optional) — Optional hint for the type of value the field produces; used mainly by `computed` fields.
- [x] **workflow_field_defs.view_roles** (relation multi) — Per-field read gate. When non-empty, only the listed roles can see this field's values in the participant Data view; empty = every role can read it. This is the **only** field-level read boundary (there is no stage-level visibility).
- [x] **workflow_field_defs.field_options** (JSON) — Type-specific options (dropdown choices, smart-dropdown mappings, entity-selector source, date mode, file limits). Edited through the Form Field Config panel; shapes documented there.
- [x] **workflow_field_defs.validation_rules** (JSON) — Intrinsic data constraints (min/max length, regex, number bounds, selection counts). Edited through the Form Field Config panel.
- [x] **workflow_field_defs.display_config** (JSON: `{ tab, tabOrder, row, column }`) — Placement of the field's value on the participant instance-detail "Data" view. Tabs are *emergent*: the set of tabs is the distinct `tab` values across the workflow's field defs; empty `tab` = the default "Data" tab. Configured in the builder's **Preview → Details** tab via the Data-Tabs editor, which creates tabs and assigns each field's `tab`/`tabOrder`/`row`/`column` (the MCP `set_field_display` tool remains an alternative). Until set, a def renders in the default Data tab ordered by creation.

---

## Page: Workflow Builder · Form Field Config  `/projects/[projectId]/workflows/[workflowId]/builder`  [DONE]

File: `src/routes/admin/projects/[projectId]/workflows/[workflowId]/builder/right-sidebar/views/form-editor/FieldConfigPanel.svelte`
Collections: `tools_form_field_refs` (per-form presentation, the `config` JSON) + `workflow_field_defs` (the field def it points at)

Each field on a form is a `tools_form_field_refs` row: `{ form_id, field_def_id, config }`. The panel edits two layers at once — **per-form presentation** (written into the ref's `config` JSON) and **definitional bits** (written through to the underlying `workflow_field_defs` row, affecting every form that uses the def). Field-type-specific options below live on the field def. To add a field to a form: drag an existing def from the **Library Fields Palette** (creates a ref only) or a type tile from the **Field Types Palette** (creates a new def + ref).

### Common field properties

- [x] **config.placeholder** (text — per-form) — Greyed-out hint text shown inside the empty input in the participant `FieldRenderer.svelte`. Per-form: the same def can have a different placeholder on each form.
- [x] **config.help_text** (text — per-form) — Small explanatory text rendered beneath the input. Per-form.
- [x] **config.is_required** (boolean — per-form) — If true, the participant must provide a value before this form can be submitted, and the label gains a red asterisk. Per-form: a def can be required on one form and optional on another.
- [x] **config.conditional_logic** (JSON — per-form) — Optional per-field show/hide rules, evaluated **live** against the in-progress form values (also settable on `tools_forms.local_fields`). Shape `{ show_if: { op, field, value } }`, where `field` is a `workflow_field_defs` id (local fields use `local:<key>`). Leaf ops: `equals` / `not_equals` / `includes` / `not_includes` / `is_empty` / `is_not_empty` (the empty ops take no `value`), plus `{ op: 'and'|'or', conds: [...] }` combinators. A hidden field is **not rendered and not submitted** (its value is pruned), and a hidden required field skips validation. Currently configured via the Form Editor's JSON view (paste per-field), not the FieldConfigPanel UI. Contrast with `workflow_connections.sentry`: `conditional_logic` answers "is this **field** shown right now?" (live, in-form); `sentry` answers "is this **transition** available?" (against the instance's persisted latest values) — different op set, never conflate them.
- [x] **workflow_field_defs.label** (text — definitional) — The field label; editing it here renames the def everywhere it is used.

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

- [x] **field_options.source_field** (`workflow_field_defs` id whose value drives this dropdown) — Id of an earlier `dropdown`, `multiple_choice`, or `smart_dropdown` field def whose chosen value gates this field. Smart dropdowns may chain (Category → Subtype → Model). While that source field is empty, `FieldRenderer.svelte` shows a "Select a value in the dependent field first" placeholder instead of the picker.
- [x] **field_options.mappings** (source value → option list map) — Array of `{ when, options }` entries: when the source field's value matches `when`, the participant sees that entry's `options` list inside `MobileMultiSelect`. Edited via the "Configure Options" modal that creates one tab per source option. When the source is multi-valued (multiple_choice or another smart_dropdown with `allow_multiple`), the participant sees the union of every matching mapping's options, deduped by label and ordered by the source array.
- [x] **field_options.allow_multiple** (boolean) — If true, the smart dropdown renders as a multi-select (`MobileMultiSelect` with `singleSelect: false`) and stores the value as a string array. Lets `validation_rules.minSelections`/`maxSelections` apply, the same way they do for `multiple_choice`. Defaults to false.

### Entity selector / custom_table_selector

- [x] **field_options.source_type** (select: custom_table/marker_category/participants/roles) — Picks where the selectable entities come from in `FieldRenderer.svelte`'s `loadCustomEntities`: `custom_table` queries `custom_table_data` rows, `marker_category` queries `markers` filtered by category, `participants` queries `participants` (gated by `self_select_roles`/`any_select_roles`), and `roles` queries the `roles` collection.
- [x] **field_options.custom_table_id** (relation: custom_tables) — When `source_type = custom_table`, identifies which `custom_tables` row the entities are pulled from. Each row in that table becomes a selectable option in the participant's `MobileMultiSelect`.
- [x] **field_options.marker_category_id** (relation: marker_categories) — When `source_type = marker_category`, identifies which marker category's markers become the selectable options. Each marker in that category shows up as one picker entry.
- [x] **field_options.display_field** (text: column to show as label) — Name of the column inside `custom_table_data.row_data` whose value becomes the option label shown to participants. Falls back to `"name"` if unset and to the row id when the column value is missing.
- [x] **field_options.allow_multiple** (boolean) — If true, the participant can pick more than one entity (`MobileMultiSelect` runs in multi-select mode and the value is stored as an array); if false, exactly one is allowed and the value is stored as a single ID.
- [x] **field_options.allowed_roles** (relation multi, optional) — For `custom_table` and `marker_category` sources: restricts which participant roles see this selector at all. Empty means every role that can see the form can use it.
- [x] **field_options.self_select_roles** (relation multi, optional) — For `participants` and `roles` sources: the listed roles may only pick themselves (their own participant row or their own role). Useful for "sign off" patterns where a user confirms their own identity.
- [x] **field_options.any_select_roles** (relation multi, optional) — For `participants` and `roles` sources: the listed roles may pick any entity in the project. Pair with `self_select_roles` to implement "everyone picks themselves, supervisors pick anyone".

> Note: `field_options` and `validation_rules` documented above are **definitional** — they live on `workflow_field_defs` and are shared by every form that references the def. Only the Common field properties (`placeholder`, `help_text`, `is_required`, `conditional_logic`) and the layout below are per-form (`tools_form_field_refs.config`).

### Grid layout (per-form — `tools_form_field_refs.config`)

- [x] **config.row_index** (integer, ≥0) — Zero-based row the field occupies in the form's two-column grid. Two refs on the same form with the same `row_index` sit side-by-side. Set automatically when the admin drops fields into rows in the builder.
- [x] **config.column_position** (select: left/right/full) — Horizontal placement within a row. `left` and `right` each take half the row width, `full` spans the entire row. Together with `row_index` this drives the responsive grid in `FieldRenderer.svelte`.
- [x] **config.field_order** (integer) — Order of the field within the form. Denormalized from the visual row/column position.
- [x] **config.page** (integer, 1-based) — Which page of a multi-page form the field appears on. Page titles/descriptions live on `tools_forms.pages` (see Form Editor).

### Field type palette

- [x] **field_type** (on `workflow_field_defs`) — Determines which input widget `FieldRenderer.svelte` renders and which `field_options`/`validation_rules` shape applies. Dragging a tile from the **Field Types Palette** creates a brand-new `workflow_field_defs` row of that type plus a `tools_form_field_refs` row binding it to the form. Dragging from the **Library Fields Palette** instead reuses an existing def (ref only). Chosen at create time and effectively locked afterwards because changing it would invalidate stored values.

### Instance reference field (deferred feature)

`instance_reference` exists in the `workflow_field_defs.field_type` DB enum but is a **deferred feature**: there is no participant picker and no cascade/integrity enforcement yet (`InstanceReferenceField.svelte` is a stub, on-delete behaviour is foundation-only). The value column stores a JSON array of `workflow_instances` ids regardless of multiplicity (single = one-element array — one storage path). When the feature ships, `field_options` carries:

- [x] **field_options.target_workflow_id** (relation id | null) — Restricts the picker to instances of this workflow. `null` = any workflow in the project.
- [x] **field_options.multiplicity** (select: single/many) — `single` stores one instance id, `many` an array of ids (both stored as a JSON array under the hood).
- [x] **field_options.on_delete** (select: cascade/nullify/block) — Intended behaviour when a referenced target instance is deleted. Foundation only — enforcement is deferred to a follow-up.
- [x] **field_options.relation_kind** (select: peer/parent/child) — UI hint: `parent`/`child` drive nested rendering, `peer` renders as a plain link.

---

## Page: Workflow Builder · Edit Tool Editor  `/projects/[projectId]/workflows/[workflowId]/builder`  [DONE]

File: `src/routes/admin/projects/[projectId]/workflows/[workflowId]/builder/right-sidebar/views/edit-tool-editor/EditToolEditorView.svelte`
Collection: `tools_edit`

`tools_edit` was dropped and recreated during the field-def redesign (migration `1779800000_recreate_tools_edit.js`). The edit tool is an in-place "edit mode" on the participant instance detail view.

**Form vs edit tool — behavioral difference.** A FORM opens its own sheet (paginated, required-field validation, conditional-logic-aware); at a connection it is part of advancing the workflow, while a stage-attached or global form saves without advancing. An EDIT tool (`edit_mode = form_fields`) does **not** open a separate sheet — it flips the instance detail's **Data tab** into editable mode in place. Only the explicitly chosen `editable_fields` are editable, prefilled with their **current** values; only the fields the participant actually changed are written; there is **no** required-field gating and **no** workflow advance. Both paths write the **same** `workflow_field_values` (so overwrite-vs-append is still the field's `write_mode`, not the tool). `edit_mode = location` writes only the instance geometry — no field values.

- [x] **tools_edit.name** (text) — Internal label for the edit tool, used as the fallback button label in the participant instance detail view when no `visual_config.button_label` is set.
- [x] **tools_edit.workflow_id** (relation) — The workflow the tool belongs to. Set on creation.
- [x] **tools_edit.editable_fields** (relation multi, `workflow_field_defs`) — In `form_fields` mode, the subset of workflow field defs participants can change when they open this tool; only these fields appear in the edit sheet, all other values stay locked. References field defs (the registry), **not** the old `tools_form_fields`. `computed` write-mode defs are filtered out of the picker.
- [x] **tools_edit.edit_mode** (select: form_fields/location) — Switches the tool between editing field values (opens an inline edit form) and editing the instance's geolocation (opens a map picker so participants can move the geometry).
- [x] **tools_edit.is_global** (boolean) — When true, the tool appears across every stage in the listed `stage_id` set, and `add_stage` auto-appends new stages to it; when false it is pinned to a single stage (or connection).
- [x] **tools_edit.stage_id** (relation multi, up to 99 stages) — Stages at which the edit tool is offered. A non-global tool usually lists one stage; a global tool lists every stage.
- [x] **tools_edit.connection_id** (relation, optional) — When set, the edit tool is attached to a workflow connection (transition step) instead of a stage.
- [x] **tools_edit.self_edit_roles / tools_edit.any_edit_roles** (relation multi each) — `any_edit_roles` may edit any instance; `self_edit_roles` may edit only instances they created. A role in both resolves to `any`. **Empty arrays mean nobody** can use the tool. Edited from StagePropertyPanel / GlobalToolsPanel / ButtonConfigPanel, not this editor.
- [x] **tools_edit.visual_config.button_label / button_color** (text / color) — Label and background color of the edit tool's button in the participant instance detail view; label falls back to `tools_edit.name` when empty.

---

## Page: Workflow Builder · Protocol Tool Editor  `/projects/[projectId]/workflows/[workflowId]/builder`  [DONE]

File: `src/routes/admin/projects/[projectId]/workflows/[workflowId]/builder/right-sidebar/views/protocol-tool-editor/ProtocolToolEditorView.svelte`
Collection: `tools_protocol`

The redesign removed `tools_protocol.editable_fields`. A protocol tool now owns a form (`protocol_form_id`); the lifecycle-vs-snapshot distinction is expressed by what kind of field sits on that form — a registry field def (a `tools_form_field_refs` row → values append to `workflow_field_values`, part of the instance record) or a `local_field` (protocol-only, snapshot only). Each submission writes an immutable row to `workflow_protocol_entries` whose `snapshot` JSON has shape `{ kind, case_fields[], local_fields[], autolog }`.

**What is frozen.** Running/submitting a protocol creates **one** immutable `workflow_protocol_entries` row (the snapshot JSON plus a `snapshot_hash` = sha256 of that JSON; participants can create but not update/delete the entry — update/delete are admin-only). The **instance itself is not frozen** — it continues normally, keeps its fields, and can still be edited and transitioned afterwards. Only the protocol **entry** is immutable. Case fields (registry field defs referenced by the protocol form) are written to **both** the snapshot **and** `workflow_field_values` (normal shared values); protocol-local fields (`tools_forms.local_fields`) live **only** in the snapshot/log — never in `workflow_field_values` and never in the field library.

- [x] **tools_protocol.name** (text) — Internal label for the protocol tool (or for the protocol region when `is_global` is true), used as the fallback button label when no `visual_config.button_label` is set.
- [x] **tools_protocol.protocol_form_id** (relation: `tools_forms`) — The form OWNED by the protocol tool — created with empty `connection_id`/`stage_id` so it never shows as a standalone stage button. Its registry field refs write to `workflow_field_values`; its `tools_forms.local_fields` are protocol-only (snapshot only). Edit its fields through the form editor.
- [x] **tools_protocol.prefill_config** (JSON `{ field_def_id: boolean }`) — Per-field-def on/off map deciding whether each registry field starts pre-filled with the instance's current value when the participant opens the protocol; turn off for fields that should always be entered fresh (e.g. measurement readings).
- [x] **tools_protocol.stage_id** (relation multi) — When `is_global` is true, the set of stages making up the protocol region; the system auto-snapshots whenever an instance leaves that stage set. For non-global tools, the stage the button is pinned to.
- [x] **tools_protocol.is_global** (boolean) — Toggles "per-stage" mode (false; a button on a stage) vs "region" mode (true; spans the stages in `stage_id` with automatic snapshots on exit).
- [x] **tools_protocol.connection_id** (relation, optional) — When set, the protocol tool is attached to a workflow connection (transition step) rather than a stage.
- [x] **tools_protocol.allowed_roles** (relation multi) — Roles that may launch this protocol tool; empty = every role. Enforced by the PocketBase access rules too.
- [x] **tools_protocol.visual_config.button_label / button_color** (text / color) — Label and background color of the protocol tool's button; label falls back to `tools_protocol.name`.

> **UI gap:** the ProtocolToolEditorView panel currently exposes only the name, the region stages (global mode), and a link out to the form editor. `prefill_config`, `allowed_roles`, and `visual_config` exist on the collection and are honoured at runtime, but are not all editable from this panel yet — the MCP `add_protocol_tool` / `update_protocol_tool` tools set them directly.

---

## Page: Workflow Builder · Field Tag Editor  `/projects/[projectId]/workflows/[workflowId]/builder`  [DONE]

File: `src/routes/admin/projects/[projectId]/workflows/[workflowId]/builder/right-sidebar/views/field-tag-editor/FieldTagEditorView.svelte`
Collection: `tools_field_tags`

- [x] **tag_mappings[].tagType** (string) — Semantic role assigned to a field so its value can be reused outside the form. `filterable` is currently the only registered type — it exposes the field as a filter in the participant map filter sheet.
- [x] **tag_mappings[].fieldId** (relation: `workflow_field_defs`) — The field def whose value drives the tag (null for stage-based tags). The picker only shows defs whose `field_type` is compatible with the tag type (for `filterable`: `dropdown` and `multiple_choice`). **UI gap:** the FieldTagEditorView / TagSlot still carry legacy comments and behaviour referencing the old `tools_form_fields` id model — the runtime and the MCP treat `fieldId` as a `workflow_field_defs` id, which is the correct end-state.
- [x] **tag_mappings[].config** (per-tag JSON, e.g. `filterable.filterBy = stage|field`) — Free-form JSON validated by the tag type's Zod schema; for `filterable` it stores `filterBy: 'stage' | 'field'`, switching the participant map filter between filtering by workflow stage or by the chosen dropdown field's values.

---

## Page: Workflow Builder · Automation Editor  `/projects/[projectId]/workflows/[workflowId]/builder`  [DONE]

File: `src/routes/admin/projects/[projectId]/workflows/[workflowId]/builder/right-sidebar/views/automation-editor/AutomationEditorView.svelte`
Collection: `tools_automation`

Every `field_key` below (in triggers, conditions and `set_field_value` actions, and `{...}` expression references) is a **`workflow_field_defs` id**. The `automation.js` runtime resolves field values from the append-only `workflow_field_values` log by `field_def_id`. **UI gap:** the builder's TriggerCard / ConditionBuilder still carry `// TODO: field_key → field_def_id` comments — the panels have not been renamed, but the value stored and the runtime behaviour are the field-def-id end-state described here.

- [x] **tools_automation.name** (text) — Admin label for the automation, shown in the automation list in the workflow builder and recorded in `workflow_instance_tool_usage.metadata.automation_name` whenever the automation fires (`logAutomationExecution` in `pb/pb_hooks/automation.js`). Participants never see this name; it is purely for admin identification and audit logs.
- [x] **tools_automation.is_enabled** (boolean) — Master on/off switch. The hooks in `pb/pb_hooks/main.pb.js` filter automations with `is_enabled = true` for every trigger type (`on_transition`, `on_field_change`, scheduled cron); when false the automation is fully skipped at runtime even if it remains saved.
- [x] **tools_automation.execution_mode** (select: run_all/first_match) — Controls how multiple steps in `steps[]` are evaluated by `runAutomation()`. `run_all` executes every step whose conditions match in order (later steps see DB writes from earlier ones); `first_match` stops after the first step whose conditions evaluate true.
- [x] **tools_automation.last_run_at** (date, auto-maintained) — Timestamp of the most recent scheduled execution. The scheduler in `main.pb.js` reads this field to enforce a 50-second deduplication window, so a `scheduled` automation cannot fire twice within one minute even if the cron tick overlaps with a manual run. Admins do not set this directly.

### Trigger

- [x] **trigger_type** (select: on_transition/on_field_change/scheduled) — Selects which runtime hook fires the automation. `on_transition` runs after `workflow_instances.current_stage_id` changes, `on_field_change` runs after a new `workflow_field_values` row is inserted (the value log is append-only — every write is an insert), and `scheduled` is evaluated every minute by the `automation_scheduled_check` cron in `main.pb.js`.
- [x] **trigger_config.from_stage_id** (on_transition) — Optional filter limiting the trigger to transitions leaving this specific stage. Matched in `main.pb.js` via `!config.from_stage_id || config.from_stage_id === oldStageId`, so leaving it empty means "any source stage".
- [x] **trigger_config.to_stage_id** (on_transition) — Optional filter limiting the trigger to transitions arriving at this specific stage. Same loose-match rule as `from_stage_id`: empty means any destination.
- [x] **trigger_config.stage_id** (on_field_change) — Optional filter restricting the trigger to field-value rows whose `recorded_at_stage` matches. Empty means the automation fires regardless of which stage the value was recorded at.
- [x] **trigger_config.field_key** (on_field_change) — Optional filter restricting the trigger to changes on a specific field def (matched against `workflow_field_values.field_def_id`). Empty means any field change on the workflow fires it.
- [x] **trigger_config.cron** (scheduled) — Standard 5-field cron expression (`minute hour dom month dow`) parsed by `cronMatchesNow()`; supports `*`, ranges, lists, and `*/step`. The scheduler tick runs every minute and executes the automation against every active workflow instance whenever the expression matches the current time.
- [x] **trigger_config.target_stage_id** (scheduled) — Optional filter narrowing the scheduled run to instances currently sitting in this stage (`current_stage_id = {:targetStage}` in `main.pb.js`). Empty means the cron sweeps all active, non-archived instances of the workflow.
- [x] **trigger_config.inactive_days** (number, scheduled, optional) — When set, the scheduled run only picks up instances whose `last_activity_at` is older than this many days. Useful for "nag if nothing has happened for N days" patterns. Zero or unset disables the filter so every matching instance fires on every tick.

### Step

- [x] **steps[].name** (text) — Human label for the step, recorded back in execution logs as `step_name` on each action result entry. Falls back to "Step N" when blank; used only for debugging and the tool-usage audit trail.
- [x] **steps[].conditions.operator** (select: AND/OR) — Combines the step's individual conditions into one guard. `evaluateConditions()` returns true only if every condition passes (`AND`) or any condition passes (`OR`); a step with no conditions always runs.

### Condition

- [x] **condition.type** (select: field_value/instance_status/current_stage) — Picks which property of the instance is inspected. `field_value` looks up `workflow_field_values` via `lookupFieldValue()`, `instance_status` reads `workflow_instances.status`, and `current_stage` reads `workflow_instances.current_stage_id`.
- [x] **condition.params.field_key** (field_value) — The field def (`workflow_field_defs` id) whose latest value is fetched for comparison. Resolved by querying `workflow_field_values` by `field_def_id` ordered by `-recorded_at` so the most recent value wins.
- [x] **condition.params.operator** (select: equals/not_equals/gt/lt/contains/…) — Comparison operator applied to the resolved field value. Supports `equals`, `not_equals`, `is_empty`, `is_not_empty`, `contains`, and `gt/gte/lt/lte` which auto-detect ISO date strings (`YYYY-MM-DD…`) versus numbers in `evaluateConditions()`.
- [x] **condition.params.value** (static compared value) — Literal value the field is compared against. Supports the special placeholders `$today`, `$today+N`, and `$today-N` which `resolveCompareValue()` expands into ISO dates at evaluation time, enabling date-relative checks like "due_date lt $today".
- [x] **condition.params.compare_field_key** (alternative: compare against another field) — When set, the comparison value is pulled from another field def on the same instance instead of the literal `value`. Lets a step compare two fields directly (e.g. `actual_count equals planned_count`).
- [x] **condition.params.status** (instance_status) — The status string the instance must equal for the condition to pass. Compared with strict `===` against `workflow_instances.status` in `evaluateConditions()`.
- [x] **condition.params.stage_id** (current_stage) — The stage the instance must (or must not, with operator `not_equals`) currently sit in. Compared with strict equality against `workflow_instances.current_stage_id`.

### Action

- [x] **action.type** (select: set_instance_status/set_field_value/set_stage) — Picks the mutation to perform when the step's conditions pass. All three are implemented in `executeActions()` and saved through `unsafeWithoutHooks()` so they cannot recursively re-trigger the same automation.
- [x] **action.params.status** (set_instance_status) — New value written to `workflow_instances.status`. Visible to participants on the workflow instance detail view and used by status-based filters and conditions in other automations.
- [x] **action.params.field_key** (set_field_value) — The field def (`workflow_field_defs` id) to write into. The write **always inserts a new `workflow_field_values` row** (the log is append-only — values are never updated in place); the row carries the def's `write_mode` and `recorded_at_stage` = the instance's current stage. The new row becomes the field's current value.
- [x] **action.params.value** (set_field_value expression) — The value to write. Plain strings are stored as-is; strings containing `{field_key}` references or function calls are detected by `isExpression()` and evaluated by `evaluateExpression()`, which supports arithmetic and the `FUNCTIONS` registry (`count`, `min`, `max`, `sum`, `avg`, `round`, `today`, `date_add`, `days_until`, etc.).
- [x] **action.params.stage_id** (set_stage) — Target stage the instance is moved to. The action also bumps `last_activity_at` and records the previous stage as `from_stage_id` in the action result for the audit log.

---

## Page: Workflow Builder · Stage Preview Button Config  `/projects/[projectId]/workflows/[workflowId]/builder`  [DONE]

File: `src/routes/admin/projects/[projectId]/workflows/[workflowId]/builder/right-sidebar/views/stage-preview/ButtonConfigPanel.svelte`
Collection: `workflow_connections` (visual config for stage buttons)

- [x] **workflow_connections.visual_config.button_label** (text — duplicate editor, same field as edge panel) — Same JSON field as the edge panels button label, edited here from the stage previews per-button drawer with a live preview of the colored pill. Drives the action button label rendered in the participant workflow detail.
- [x] **workflow_connections.visual_config.button_color** (color) — Same `visual_config.button_color` hex value, edited via a color picker plus text input with a live preview swatch. Sets the background color of the stage action button shown to participants.
- [x] **workflow_connections.allowed_roles** (relation multi) — Same connection-level role gate as the edge panel, exposed here so the admin can restrict who sees and can press this specific button without leaving the stage preview. Empty means all roles allowed.

---

## Page: Instance Settings  `/instance`  [DONE]

File: `src/routes/admin/instance/+page.svelte`
Server: `src/routes/admin/instance/+page.server.ts`
Collections: `instance_settings` (single-row), `instance_legal_pages` (one row per page)
Access: Instance-owner only. The page load redirects non-owner admins to `/`. Owner is the user whose email matches `POCKETBASE_ADMIN_EMAIL` (see `src/lib/server/is-owner.ts`). This is the only admin page that is instance-wide rather than project-scoped.

### Cookie Consent Banner  (writes to `instance_settings`)

- [x] **require_consent_before_login** (bool) — When true, the participant login page renders a blocking consent modal before the token field becomes usable; the login form action also refuses submissions without a consent cookie. When false, participants log in directly. Gating is enforced in `src/routes/(participant)/login/+page.server.ts`. The single settings row is seeded with `false` on migration.
- [x] **consent_banner_title** (text, max 255) — Heading shown at the top of the consent modal rendered by `src/lib/components/consent-modal.svelte`. Plain text.
- [x] **consent_banner_body** (editor / HTML) — Body copy inside the consent modal. Stored as HTML and rendered as-is, so admins can include paragraphs, links to legal pages, and lists. A legal-page footer is appended automatically from `instance_legal_pages` rows with `show_in_consent_footer = true`.
- [x] **consent_accept_label** (text, max 100) — Label on the button that accepts consent, closes the modal, and reveals the login form. Defaults to `Accept` on the seeded row; on an empty string the modal shows the raw key as a fallback, so keep it populated.
- [x] **consent_reject_label** (text, max 100) — Label on the button that rejects consent and keeps the login form hidden. Defaults to `Reject` on the seeded row. Rejecting does not persist a cookie, so the modal re-appears on the next visit.

### Legal Pages  (writes to `instance_legal_pages`, one row per page)

Pages are served publicly at `/legal/<slug>` and listed at `/legal`. A subset is also rendered inside the consent modal's footer links. The admin UI supports create (`?/createPage`), per-row update (`?/updatePage`), and delete (`?/deletePage`) form actions.

- [x] **title** (text, required, max 255) — Page heading shown on `/legal/<slug>`, label text used in the `/legal` index, and the link label inside the consent-modal footer. Required on create.
- [x] **slug** (text, required, max 100, unique) — URL segment; the public page lives at `/legal/<slug>`. Unique across the whole instance (enforced by a unique index). If the admin leaves the slug empty when creating a new page, the create action auto-slugifies the title (lowercased, non-alphanumerics stripped, spaces collapsed to `-`).
- [x] **content** (editor / HTML, optional) — Page body. Rendered as HTML on the public `/legal/<slug>` page and also inside the consent modal when the participant opens a footer link, so keep content self-contained (don't rely on site chrome).
- [x] **sort_order** (number, min 0) — Ascending display order used both in the `/legal` index and in the consent-modal footer. Ties fall back to `created` ascending.
- [x] **show_in_consent_footer** (bool) — When true, this legal page is linked from the footer of the consent modal on the participant login page. When false, the page is still reachable via `/legal/<slug>` but is not surfaced in the consent flow. The create form defaults this to true.

---
