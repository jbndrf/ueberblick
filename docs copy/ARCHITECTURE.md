# Überblick -- Architecture Guide

## System Overview

```
+--------------------------------------------------+
|                   NGINX (port 80/8080)            |
|   reverse proxy: /* -> SvelteKit, /api/ -> PB     |
+----------+--------------------+-------------------+
           |                    |
   +-------v--------+  +-------v--------+
   |   SvelteKit     |  |   PocketBase    |
   |   (Node.js)     |  |   (Go + SQLite) |
   |   port 3000     |  |   port 8090     |
   |                 |  |                 |
   | /(admin)/ routes|  | REST API        |
   | /participant/   |  | Realtime SSE    |
   | Server hooks    |  | Auth            |
   | SSR + API proxy |  | File storage    |
   +--------+--------+  | SpatiaLite      |
            |            | JS Hooks        |
            |            +--------+--------+
            |                     |
            |              +------v-------+
            |              |   SQLite DB   |
            |              |  + SpatiaLite |
            |              +--------------+
            |
   +--------v------------------+
   |   Browser (Participant)   |
   |                           |
   |  Svelte 5 SPA             |
   |  IndexedDB (local-first)  |
   |  Service Worker (PWA)     |
   |  Leaflet Map              |
   +---------------------------+
```

---

## Major Modules

### 1. SvelteKit Frontend (`src/`)

Two completely separate interfaces sharing the same SvelteKit app:

**Admin -- Sector (`src/routes/(admin)/`)**
- Server-rendered pages with `+page.server.ts` load functions
- Uses PocketBase SDK server-side via `event.locals.pb`
- CRUD for projects, participants, roles, workflows, map layers, custom tables, marker categories
- Workflow builder (canvas-based visual editor)
- No offline capability -- requires network

**Participant (`src/routes/participant/`)**
- Single-page app after initial load
- Local-first: reads from IndexedDB, writes optimistically, syncs in background
- Map interface with Leaflet
- Module shell pattern for detail views (workflow instance, form fill, field edit)
- PWA with service worker for offline access

### 2. Participant State System (`src/lib/participant-state/`)

The offline-first engine. This is the most architecturally significant subsystem.

| File | Responsibility |
|------|---------------|
| `gateway.svelte.ts` | PocketBase-compatible API that reads/writes IndexedDB. Provides `collection(name)` with `.create()`, `.update()`, `.delete()`, `.getFullList()`, `.live()`, `.liveOne()`. |
| `db.ts` | IndexedDB schema (v8). Stores: `records`, `sync_metadata`, `conflicts`, `files`, `tiles`, `packages`, `operation_log`. |
| `sync.svelte.ts` | Push (upload local changes) and pull (delta sync from server). Conflict detection with server-wins strategy. |
| `realtime.svelte.ts` | SSE subscriptions to PocketBase. Updates IndexedDB on remote changes. Triggers catch-up sync on reconnect. |
| `file-cache.ts` | Blob storage for images/files. Generates thumbnails via OffscreenCanvas. |
| `tile-cache.svelte.ts` | Map tile storage keyed by `{layerId}/{z}/{x}/{y}`. Supports ZIP extraction for offline packages. |
| `index.ts` | Public API surface: `setSyncCollections`, `startPushListener`, `runCatchUpSync`, etc. |

### 3. Workflow Builder (`src/lib/workflow-builder/`)

Visual editor for designing multi-stage workflows.

| File | Responsibility |
|------|---------------|
| `state.svelte.ts` | Central state using Svelte 5 runes. Tracks stages, connections, forms, fields, tools with dirty status (`new`/`modified`/`unchanged`/`deleted`). |
| `save.ts` | Batch persistence -- separates creates, updates, deletes and sends to PocketBase. |
| `tools/registry.ts` | Tool registration system. Each tool type (form, edit, automation, field tags) registers with metadata, icon, and attach targets. |
| `tools/types.ts` | `ToolDefinition` interface. Tools declare what they can attach to (stages, connections). |
| `types.ts` | All workflow types: stages, connections, fields, visual config, validation rules, entity selectors. |
| `field-types.ts` | Central registry of form field types with icons and metadata. |

### 4. PocketBase Backend (`pb/`)

| File | Responsibility |
|------|---------------|
| `main.go` | Entry point. Loads SpatiaLite, registers hooks directory. |
| `pb_hooks/main.pb.js` | Request lifecycle hooks. File serving, batch endpoints, tile processing triggers. |
| `pb_hooks/automation.js` | Automation engine: trigger evaluation, condition checking, action execution, cron scheduler, expression parser. |
| `pb_migrations/*.js` | Database schema as JavaScript migrations. ~35 migration files. |

### 5. Form Renderer (`src/lib/components/form-renderer/`)

Shared component used by both the workflow builder preview and the participant app.

- `FormRenderer.svelte` -- multi-page form container
- `FieldRenderer.svelte` -- renders individual fields by type (text, number, date, file, dropdown, smart dropdown, entity selector, etc.)
- `MediaGallery.svelte` -- image/file display grid
- Three modes: `fill` (create), `edit` (modify), `view` (read-only)

### 6. Map System

**Admin side** (`src/routes/(admin)/.../map-settings/`):
- Layer management (presets, custom tile URLs, WMS, uploaded ZIPs)
- Offline package creation with region drawing and zoom level selection
- Server-side tile packager (`src/lib/server/tile-packager.ts`)

**Participant side** (`src/routes/participant/map/`):
- Leaflet map with cached tile layer for offline
- Filter sheet, layer sheet, workflow selector
- Bottom control bar for creating new workflow instances
- Settings sheet (offline packages, sync status, PWA install, font/theme/language)

### 7. SvelteKit API Routes (`src/routes/api/`)

Three server-side API endpoints handled by SvelteKit (not proxied to PocketBase):

- `/api/tiles/[tilesetId]/[z]/[x]/[y]` -- serves uploaded map tiles from PocketBase storage with auth
- `/api/map-layers/upload` -- handles ZIP file upload of pre-rendered tile sets
- `/api/map-layers/[id]/status` -- polling endpoint for tile upload processing progress

### 8. Server Utilities (`src/lib/server/`)

Shared server-only code used by API routes and page server load functions:

- `tile-processor.ts` -- extracts tiles from ZIPs, computes bounds and statistics
- `tile-packager.ts` -- creates downloadable offline tile packages
- `crud-actions.ts` -- generic CRUD action handlers for admin pages
- `auth.ts` / `admin-auth.ts` -- server-side PocketBase auth helpers
- `pocketbase-helpers.ts` -- PocketBase utility functions
- `workflow-database.ts` -- workflow data operations

---

## Data Flow

### Admin: Server-Rendered Request

```
Browser request
  -> SvelteKit server hook (hooks.server.ts)
     -> Loads PocketBase auth from cookie
     -> Sets event.locals.pb and event.locals.user
  -> +layout.server.ts / +page.server.ts
     -> Fetches data via event.locals.pb
     -> Returns data to component
  -> +page.svelte renders with data from $props()
  -> Client-side mutations via getPocketBase() from $lib/pocketbase.ts
     -> POST/PATCH/DELETE to PocketBase API (proxied via Vite in dev, nginx in prod)
     -> Invalidate SvelteKit load to refresh
```

### Participant: Local-First

```
Component calls gateway.collection('workflow_instances').getFullList()
  -> IndexedDB query (instant, returns cached data)
  -> Background: fetch from PocketBase API (if online)
  -> If new data: update IndexedDB, notify listeners
  -> Component re-renders with fresh data

Component calls gateway.collection('workflow_instances').create(data)
  -> Generate local ID
  -> Write to IndexedDB with _status: 'new'
  -> Notify listeners (UI updates immediately)
  -> Push listener (5s debounce) uploads to server
     -> If conflict: server wins, conflict stored
     -> If success: update _status to 'unchanged'
```

### Realtime Updates

```
PocketBase SSE event (create/update/delete)
  -> realtime.svelte.ts receives event
  -> Checks: is record locally modified? If yes, skip
  -> Updates IndexedDB with server data
  -> Notifies data change listeners
  -> Components with live() queries re-render
```

### Automation Engine (Server-Side)

```
PocketBase hook fires (on record create/update)
  -> automation.js checks: any automations for this workflow?
  -> For each automation:
     -> Check trigger type matches event
     -> Evaluate conditions (field comparisons, expressions)
     -> If conditions pass: execute actions
        -> set_field_value (supports {field} * {field} expressions)
        -> set_stage (move instance to different stage)
        -> set_instance_status
     -> Log to workflow_instance_tool_usage
  -> Scheduled automations: cron runs every 15 minutes
```

---

## Key Architectural Decisions

| Decision | Why |
|----------|-----|
| **PocketBase + SQLite** (not Postgres) | Single-binary backend with built-in auth, file storage, realtime SSE, and admin UI. SpatiaLite adds geospatial queries without a separate service. Simplifies deployment to a single container. |
| **Svelte 5 runes for state** (no Redux/Zustand) | Runes (`$state`, `$derived`, `$effect`) provide fine-grained reactivity without an external library. The workflow builder state is ~600 lines of pure rune-based logic. |
| **Two separate auth collections** (`users` vs `participants`) | Admins and participants have fundamentally different permissions, data access, and UI. Separate collections let PocketBase API rules handle authorization at the database level without middleware. |
| **Local-first with IndexedDB** (not server-first with cache) | Participants work in the field with unreliable connectivity. IndexedDB is the source of truth for the participant app; the server is synced to, not read from. This was a deliberate shift from an earlier server-first approach (Jan 30 commit). |
| **PocketBase API rules for authorization** (not middleware) | Security rules are defined per-collection in migrations. This replaced a custom Go security middleware that was deleted early in development. Every query is filtered at the database level. |
| **Automations in PocketBase JS hooks** (not SvelteKit) | Business logic (triggers, conditions, actions) must run server-side regardless of which client initiated the change. PocketBase hooks intercept record events before response, ensuring consistency. |
| **map_sources merged into map_layers** | Originally separate collections. Merged to eliminate cross-collection joins in API rules and simplify the data model. Source properties (URL, type, tile format) are now inline on the layer record. |
| **Module shell pattern** for participant UI | Detail views (workflow instance, form fill) are rendered inside a `module-shell` component that provides consistent desktop (right panel) and mobile (bottom drawer) layouts. Replaced an earlier module-sidebar approach. |
| **Tool registry pattern** for workflow builder | Tools (form, edit, automation, field tags) register themselves with metadata. The UI discovers available tools dynamically. This makes the system extensible without modifying the builder core. |

---

## Patterns Used Throughout

**Tracked Items** -- Entities in the workflow builder carry a `_status` field (`new`, `modified`, `unchanged`, `deleted`). The save function batches operations by status. This is essentially an in-memory unit-of-work pattern.

**Stale-While-Revalidate** -- The participant gateway returns cached IndexedDB data immediately, then fetches fresh data in the background. If the data changed, listeners are notified and UI updates. Similar to SWR/React Query but built on IndexedDB + Svelte reactivity.

**Live Queries** -- `gateway.collection(name).live(options)` returns a reactive `$state` that auto-updates when the underlying IndexedDB data changes. Built on `notifyDataChange()` events + debounced re-queries.

**Server-Wins Conflict Resolution** -- On push, the sync engine compares timestamps. If the server record was modified since last sync, the server version is kept and the local version is stored in a `conflicts` table. (No participant-facing resolution UI yet.)

**Delta Sync** -- Pull requests include `filter: 'updated > "{lastSync}"'` to only fetch changed records. Timestamps are stored per-collection in `sync_metadata`.

---

## Entry Points

| What | Where |
|------|-------|
| SvelteKit app entry | `src/routes/+layout.svelte` |
| Server auth hook | `src/hooks.server.ts` |
| Admin layout & nav | `src/routes/(admin)/+layout.svelte` |
| Participant layout & sync init | `src/routes/participant/+layout.svelte` |
| Participant map (main UI) | `src/routes/participant/map/+page.svelte` |
| Workflow builder page | `src/routes/(admin)/projects/[projectId]/workflows/[workflowId]/builder/+page.svelte` |
| PocketBase main hook | `pb/pb_hooks/main.pb.js` |
| Automation engine | `pb/pb_hooks/automation.js` |
| PocketBase Go entry | `pb/main.go` |
| Docker Compose | `docker-compose.yaml` |
