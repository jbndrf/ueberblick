# Project History (Archaeological Notes)

Generated from analysis of all 31 commits (Jan 11 -- Mar 5, 2026).
This is an internal reference file, not user-facing documentation.

---

## Timeline of Major Milestones

### Phase 1: Foundation (Jan 11)
**Commit 1408588 -- Initial commit**
- Full project skeleton: Docker (PocketBase + SvelteKit), auth patterns, i18n (en/de)
- Included massive legacy admin frontend (~7700 lines of vanilla JS workflow builder, form builder, map tools, role management) as reference code
- SvelteKit 5 routes stubbed for `/(admin)/` and `/participant/`
- CLAUDE.md written with architecture docs

### Phase 2: Workflow Builder v1 (Jan 11--13, commits 56e36c2 through 963b498)
**Nine commits of rapid iteration building the visual workflow editor from scratch.**

Key sub-milestones:
- **56e36c2**: Map tile infrastructure (upload endpoint, tile serving, tile processor). Workflow builder canvas started with stage nodes and CSS.
- **beb77ea**: Tool system architecture introduced -- registry, schemas, types, toolbar, tool picker. ActionEdge component for visual connections.
- **94b2316**: State management landed (`state.svelte.ts`, 557 lines). Svelte 5 runes for tracking stages/connections/forms/fields with dirty status. Save/persistence layer. Database migration creates `workflow_stages`, `workflow_connections`, `tools_form`, `tools_form_fields`, `tools_edit`. Right sidebar with property panels and preview.
- **08f1a1d**: Legacy code moved to `preview-partui/admin_frontend-legacy/` for reference. Organizational commit.
- **e1f4adf through 057556f**: Form builder drag-drop iterated heavily (3 commits). Field types system centralized (`field-types.ts`). Drop zone components created then removed in favor of simpler approach.
- **534ad79**: Major feature dump -- multi-column form layout, edit tool editor with ancestor field access, entity selectors (custom tables, marker categories, participants, roles), smart conditional dropdowns, visual button config. 4 new migrations. ~5000 lines added.
- **963b498**: Custom table selector field type. Polish.

### Phase 3: Permissions & Participant Map (Jan 13--18, commits 294b056 through b118ba3)
- **294b056**: Code optimization. Removed drag-drop components (changed UI paradigm). Simplified mobile-multi-select.
- **231494b**: Massive commit (115 files, -76k lines). Deleted ALL legacy JS code. Started `src/lib/participant-state/` system (db, network, persistence, sync, tile-cache, pack-downloader -- 10 files). Three security/permission migrations. Audit/tracking prep.
- **85753a1** ("endlich permissions correctly!!!"): THE permissions milestone. 91 files, ~12k insertions. 9 new migrations fixing participant access, role inheritance, field-level view permissions, entry roles. E2E test infrastructure started (permission tests, seed database, comprehensive workflow test with page objects). Participant map UI landed: MapCanvas (558 lines), WorkflowSelector, FilterSheet, LayerSheet, BottomControlBar. Module sidebar system (later replaced by module-shell).
- **9e9957c**: Form renderer extracted to `src/lib/components/form-renderer/` (FieldRenderer, FormRenderer, MediaGallery). Module shell component. Tools consolidated under `workflow-instance-detail/tools/` (EditFieldsTool, FormFillTool, ViewFieldsTool).
- **b118ba3**: Cleanup -- removed deprecated module-sidebar (replaced by module-shell), deleted standalone FormFillModule, extracted form-state.ts.

### Phase 4: Global Tools & Offline-First (Jan 21--30, commits 9fe49a3 through b48fb03)
- **9fe49a3**: Minor -- added tool deletion from connection panels.
- **3fbbdb2** ("..."): Global edit tools system. Edit tools can now span multiple stages. LocationEditTool for editing marker positions. GlobalToolsPanel in workflow builder. Permission matrix E2E test (1080 lines testing entry permissions, stage visibility, field values, audit trail, historical data leakage).
- **2d11dd7**: Offline pack management moved from participant to admin control. PWA manifest + service worker integration. Complete rewrite of offline system: new pack-downloader, tile-cache, pwa-detection. Old `src/lib/offline/` deleted entirely.
- **16b84c9** ("pre switch to localalways"): Query builder for offline database. File caching. Tile packager (server-side zip creation). Geo utilities. Admin map settings page expanded with package-selector and region-selector. Gateway refactored.
- **0b7e290** ("offline works just fine. local first"): 69 files, -43k lines. Deleted remaining legacy code from `admin_frontend-legacy-tileupload/`. Realtime sync system (`realtime.svelte.ts`). Sync system major expansion (538 lines). ConflictResolutionTool added. Participant layout updated for offline-first paradigm.
- **b48fb03**: Fixed PWA -- nginx sw.js cache headers, vite navigateFallback set to null.

### Phase 5: Polish & Automation (Feb 2--26, commits dcf1dd0 through 25609bf)
- **dcf1dd0** ("workflow builder rebuilt!"): Stage preview showing connections/tools/forms. Stage timeline (completed/current/future). Action edge improvements. Button picker.
- **614c8b4**: Workflow/stage icon designer (307 lines). Font size selector for participant accessibility. Server-side icon persistence. Stage icon rendering chain (stage -> workflow -> colored circle fallback).
- **fab21f0**: Automation engine v1 in PocketBase hooks. Condition evaluator (8 operators). Action executor (set_instance_status, set_field_value, set_stage). Three trigger types: on_transition, on_field_change, time_based. Automation editor UI (ConditionBuilder, ActionBuilder). Field tagging system started. Filter value icons. Workflow duplication.
- **3ba153c**: ARCHITECTURAL: Merged `map_sources` into `map_layers`. Eliminated cross-collection traversal. IndexedDB version bumped to 8, index renamed from by_source to by_layer.
- **9ed4de9**: Automation engine v2. Arithmetic expression parser (+,-,*,/ with precedence, field refs via {field_key}). Field-to-field condition comparisons. time_based trigger replaced with scheduled (cron). Cron parser with 15-minute minimum intervals.
- **0247811**: QR export (qrcode + jspdf). Final legacy code deletion. Settings sheet for participant. README rewrite.
- **6a09349**: Gitignore cleanup.
- **e1943f5**: Rebrand to "Ueberblick" / "Ueberblick Sector". CI/CD via GitHub Actions (Docker build + push to GHCR).
- **25609bf**: Automation engine v3 (moved to separate `automation.js`). E2E seed for "Reinigung" demo (TAGESPLAN/RHYTHMUS workflows). Participant state context refactored.

### Phase 6: Current (Mar 5, commit 7568263)
- **7568263** ("ff"): Gateway gets `live()` and `liveOne()` methods -- reactive queries backed by IndexedDB with debouncing. Realtime simplified (PB_CONNECT triggers catch-up sync). Sync API surface reduced (removed enableAutoSync, getSyncProgress, startSyncLoop; added setSyncCollections, startPushListener, runCatchUpSync). Autodate workaround in automation.js using raw SQL.

---

## Core Architectural Decisions (Chronological)

| When | Decision | Context |
|------|----------|---------|
| Jan 11 (initial) | PocketBase + SvelteKit + SpatiaLite | Full stack chosen from day one. Go backend with SQLite, not Postgres. |
| Jan 11 (initial) | Svelte 5 runes for state | No external state library. `$state`, `$derived`, `$effect` throughout. |
| Jan 11 (initial) | Two route groups: `/(admin)/` and `/participant/` | Separate layouts, separate auth (users vs participants collections). |
| Jan 12 (beb77ea) | Tool registry pattern for workflow builder | Tools (form, edit, automation) registered via central registry with metadata/schemas. |
| Jan 12 (94b2316) | Tracked item pattern for state | Every entity has a `_status` (new/modified/unchanged/deleted) for batch save. |
| Jan 14 (231494b) | Participant state as separate system | `src/lib/participant-state/` with its own db, sync, persistence, network layers. Not shared with admin. |
| Jan 17 (85753a1) | PocketBase API rules for access control | Security enforced at DB level via collection rules, not middleware. Legacy Go security middleware deleted. |
| Jan 18 (9e9957c) | Module shell pattern | Participant UI uses module-shell component as container. Replaced earlier module-sidebar. |
| Jan 23 (3fbbdb2) | Global tools (cross-stage) | Tools can be attached to multiple stages, not just one. |
| Jan 28 (2d11dd7) | Admin-controlled offline packs | Offline data packaging moved from participant self-service to admin configuration. |
| Jan 30 (0b7e290) | Local-first / offline-first | Data stored in IndexedDB first, synced to server. Not server-first with cache. |
| Feb 20 (fab21f0) | Automations in PocketBase hooks (JS) | Business logic runs server-side in pb_hooks, not in SvelteKit. |
| Feb 21 (3ba153c) | Merge map_sources into map_layers | Eliminated unnecessary indirection. Source properties inline on layer. |
| Feb 23 (9ed4de9) | Cron-based scheduled automations | Replaced simple "time_based" with full cron expression support, 15-min minimum interval. |
| Mar 5 (7568263) | Live reactive queries via gateway | `live()` returns reactive state backed by IndexedDB + background server fetch. Replaces manual polling. |

---

## Unfinished / Abandoned / Uncertain

### Definitely abandoned
- **Legacy admin frontend**: ~50k+ lines of vanilla JS (workflow builder, form builder, data flow, map tools). Used as reference, then deleted across commits 231494b, 0b7e290, and 0247811. Fully gone now.
- **Go security middleware** (`pb/security/`): Deleted in 231494b. Replaced by PocketBase collection API rules.
- **Module sidebar** (`module-sidebar.svelte`): Created in 85753a1, replaced by module-shell in 9e9957c, deleted in b118ba3.
- **Standalone FormFillModule**: Created then consolidated into workflow-instance-detail tools.
- **`src/lib/offline/` directory**: Original offline system. Completely replaced by participant-state system.
- **Separate `map_sources` collection**: Merged into `map_layers` in 3ba153c.

### Possibly unfinished
- **Field tagging system** (`tools_field_tags`, `FieldTagEditorView`): Basic framework added in fab21f0 but the editor is only ~100 lines. Unclear how much this is used in practice.
- **Filter value icons** (`filter_value_icons` collection): Infrastructure added but UI integration may be incomplete.
- **ConflictResolutionTool**: Added in 0b7e290 (238 lines). Not clear if conflict scenarios are tested or if this UI is reachable in practice.
- **E2E tests**: Infrastructure exists (permission tests, permission matrix, seed database, Reinigung demo seed) but unclear if they run in CI. The CI/CD workflow only builds Docker images.
- **Automation engine stability**: Rebuilt three times (fab21f0, 9ed4de9, 25609bf). Commit message "working?" suggests uncertainty. The autodate workaround in 7568263 (raw SQL) suggests PocketBase limitations being worked around.
- **Live query system** (7568263): Brand new, introduced in the most recent commit. `live()` and `liveOne()` on gateway. The sync API was significantly simplified alongside it. Still being integrated.

### Uncertainty flags
- Several commits have non-descriptive messages ("ggg", "...", "ff", "ansich gutes") which makes intent hard to trace. These tend to be mid-development snapshots rather than meaningful milestones.
- The participant-state system has been refactored multiple times (sync.svelte.ts, gateway.svelte.ts, realtime.svelte.ts all have had significant rewrites). The architecture is still settling.

---

## Current State of Major Modules

### Workflow Builder (`src/lib/workflow-builder/`)
**Status: Functional, mature**
- Visual canvas editor with stages, connections, tools
- State management via Svelte 5 runes with tracked items
- Property panels for stages, edges, tools
- Tool types: form fill, edit fields, view fields, location edit, automation, field tags
- Global tools (cross-stage)
- Stage preview with timeline
- Workflow/stage icon designer
- Save/persistence to PocketBase
- Workflow duplication

### Participant State (`src/lib/participant-state/`)
**Status: Functional but actively evolving**
- Files: `index.ts`, `gateway.svelte.ts`, `realtime.svelte.ts`, `sync.svelte.ts`, `db.ts`, `file-cache.ts`, `tile-cache.svelte.ts`, `query.ts`, `types.ts`
- IndexedDB-backed local-first storage
- Background sync with push listener
- Realtime subscriptions via PocketBase
- Live reactive queries (newest addition, Mar 5)
- Catch-up sync on reconnect
- Tile caching for offline maps
- File caching for offline media

### Automation Engine (`pb/pb_hooks/automation.js`)
**Status: Functional, recently stabilized (3rd rewrite)**
- Trigger types: on_transition, on_field_change, scheduled (cron)
- Condition evaluator: 8+ operators, field-to-field comparison
- Action executor: set_instance_status, set_field_value, set_stage
- Arithmetic expression parser for computed values
- Cron scheduler with 15-minute minimum intervals
- Cooldown/dedup mechanisms
- Autodate workaround via raw SQL

### Map System (`src/routes/(admin)/.../map-settings/`, participant map)
**Status: Functional**
- Layers with inline source properties (tile, WMS, GeoJSON, uploaded)
- Tile upload + processing pipeline
- Tile serving endpoint
- Offline tile packaging (admin-configured regions)
- Participant map with Leaflet, filter sheet, layer sheet, workflow selector
- Cached tile layer for offline use

### Form System (`src/lib/components/form-renderer/`, workflow-builder tools)
**Status: Functional**
- Field types: short_text, long_text, number, email, date, file, dropdown, multiple_choice, smart_dropdown, custom_table_selector
- Form renderer with field renderer
- Media gallery
- Multi-column layout (left/right/full)
- Entity selectors (custom tables, marker categories, participants, roles)
- Smart dropdown with conditional mappings

### PWA / Offline (`vite.config.ts`, `nginx.conf`)
**Status: Functional**
- Service worker via vite-plugin-pwa
- Offline-first with IndexedDB
- Admin-configured offline packs (tile packages, data snapshots)
- Pack downloader for participant app
- PWA detection and install prompts

### Auth & Permissions
**Status: Functional**
- Cookie-based sessions via hooks.server.ts
- Two collections: `users` (admin), `participants`
- PocketBase API rules enforce access at DB level
- Role-based visibility on stages, fields, tools
- Entry roles for workflow initiation
- Field-level view permissions

### CI/CD & Deployment
**Status: Basic**
- GitHub Actions builds Docker images on release
- Docker Compose for local dev and deployment
- No automated testing in CI (tests exist but aren't wired up)

### i18n
**Status: Functional**
- Paraglide with en/de message files
- Used throughout admin and participant interfaces

---

## Commit Frequency & Development Patterns

- Jan 11--13: Intense burst (10 commits in 3 days) -- workflow builder from zero to functional
- Jan 14--17: Permissions and participant map (3 commits, larger)
- Jan 18--21: Tool architecture consolidation (3 commits)
- Jan 23--30: Offline-first transition (5 commits, massive deletions of legacy code)
- Feb 2--4: Polish (2 commits)
- Feb 20--25: Automation engine + map refactor + QR + rebrand (6 commits)
- Mar 5: Latest -- live queries and sync simplification

The project shows a pattern of building features rapidly, then consolidating/rewriting. The automation engine is the clearest example (3 rewrites in 6 days). The participant-state/sync system has also been significantly refactored multiple times.

---

## Audit Log

Documentation audit performed against current source code (2026-03-05). Every claim in `docs/README.md`, `docs/ARCHITECTURE.md`, and `docs/CONTRIBUTING.md` was verified against the actual codebase. Corrections listed below.

### Corrections Made

**Go version (README.md, CONTRIBUTING.md)**
- Claim: "Go 1.21+" -- Actual: `go.mod` specifies Go 1.24.0. Fixed to "Go 1.24+".

**Vite proxy description (README.md, CONTRIBUTING.md, ARCHITECTURE.md)**
- Claim: "Vite proxies `/api/*` to PocketBase" -- Actual: Vite proxies only specific routes (`/api/collections`, `/api/files`, `/api/admins`, `/api/realtime`, `/api/health`, `/api/batch`). Tile-serving and upload routes are handled by SvelteKit API routes, not proxied to PocketBase. Fixed to describe specific routes.

**E2E seed code example (CONTRIBUTING.md)**
- Claim: `pb.collection('_superusers').authWithPassword(...)` -- Actual: `e2e/api-seed.ts` uses `pb.collection('users').authWithPassword(...)`. Fixed.

**Storybook (CONTRIBUTING.md)**
- Listed `npm run storybook` without context. Added note that only boilerplate stories exist (Button, Header, Page). No project-specific component stories.

### Missing Systems Added

**ARCHITECTURE.md -- two new sections added:**
- Section 7: SvelteKit API Routes (`src/routes/api/`) -- three endpoints for tile serving, upload, and status polling.
- Section 8: Server Utilities (`src/lib/server/`) -- six modules for tile processing, CRUD actions, auth helpers, workflow operations.
- Participant map settings sheet noted.

**CONTRIBUTING.md -- project structure expanded:**
- Added `src/routes/api/` to project tree.
- Added `src/lib/stores/`, `src/lib/config/`, `src/lib/automation/` to project tree.
- Expanded `src/lib/server/` description.
- Added "Undocumented Areas (TODO)" section listing: admin base components, API routes, server utilities, responsive sidebar, PocketBase URL resolution, client hooks.
- Added notes on Sentry (installed but unconfigured) and Storybook (boilerplate only).

### Claims Verified Correct (No Changes Needed)

- All 30 file paths referenced in documentation exist and match described content.
- Gateway API: `collection(name)` with `.create()`, `.update()`, `.delete()`, `.getFullList()`, `.getOne()`, `.getList()`, `.getFirstListItem()`, `.live()`, `.liveOne()` -- all confirmed.
- Sync: 5-second push debounce, delta sync filter, ghost push recovery -- all confirmed.
- Automation: `parseJsonField()`, `bumpUpdatedTimestamp()`, expression parser, trigger types, action types, field references, tool usage logging -- all confirmed.
- IndexedDB v8 with all 7 stores -- confirmed.
- `setSyncCollections`, `startPushListener`, `runCatchUpSync` exports -- confirmed.
- CSRF disabled in svelte.config.js -- confirmed.
- Manual service worker registration -- confirmed.
- All 12 documented features (QR export, workflow duplication, icon designer, font size selector, offline packages, WMS layers, smart dropdown, custom table selector, location edit tool, conflict resolution tool, pack downloader, settings sheet) -- all have end-to-end implementations.
- shadcn-svelte import patterns, Paraglide import path, superforms usage pattern -- all confirmed.
- Tab indentation convention -- confirmed.

---

## Audit Log

| Date | Scope | Change |
|------|-------|--------|
| 2026-03-05 | Initial audit | Full documentation suite created from codebase analysis of all 31 commits. Corrections applied (Go version, Vite proxy specifics, E2E seed auth collection). Missing systems documented (SvelteKit API routes, server utilities). |
| 2026-03-05 | Branding fix (README, ARCHITECTURE, CONTRIBUTING) | Replaced "Ueberblick" with "Überblick" throughout all three docs to match actual source code branding (see commit e1943f5). |
