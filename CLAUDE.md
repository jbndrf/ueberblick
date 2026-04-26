# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Überblick is an open-source platform for managing geo-referenced data combined with collaborative process management. It consists of two surfaces backed by the same SvelteKit app:

- **SECTOR** (`src/routes/(admin)/`) — admin UI for projects, workflows, roles, maps, custom tables, automations.
- **Participant app** (`src/routes/participant/`) — mobile-first, offline-capable PWA. The participant UI is *generated* from the project configuration (workflow stages, transitions, role permissions). Do not build per-feature participant screens; extend the config-driven engine instead.

Backend is PocketBase (Go) with SpatiaLite for geospatial queries. Participants authenticate via QR-code (no username/password); admins use the `users` collection.

## Common commands

```bash
npm run dev                 # Vite dev server (frontend, :5173)
npm run backend             # PocketBase via dev-entrypoint.sh (:8090)
npm run dev:backend         # PocketBase under modd (auto-rebuild)
npm run build:backend       # go build inside pb/

npm run check               # svelte-kit sync + svelte-check
npm run lint                # prettier --check + eslint
npm run format              # prettier --write

npm run test:unit           # vitest (watch); add -- --run for single pass
npm run test:e2e            # playwright
npm run test                # unit (run mode) + e2e

npm run db:clear            # wipe pb/pb_data
npm run docs:serve          # mkdocs serve (handbook in docs/)
```

Run a single vitest file: `npx vitest run path/to/file.spec.ts`.
Run a single Playwright test: `npx playwright test e2e/foo.spec.ts -g "name"`.

## Architecture

### Frontend stack
SvelteKit 2 + Svelte 5 (runes: `$state`, `$derived`, `$effect`, `$props`, `$bindable`), Tailwind 4, bits-ui / shadcn-svelte, Leaflet (+ markercluster, supercluster), `@xyflow/svelte` for the workflow canvas, sveltekit-superforms + Zod for forms, Paraglide (`messages/{de,en}.json`) for i18n, Sentry for error tracking.

### Route groups
- `src/routes/(admin)/` — SECTOR. Each project has `projects/[projectId]/...` sub-routes (settings, workflows, roles, participants, maps, custom tables).
- `src/routes/participant/` — participant PWA (map, forms, tools, offline pack management).
- `src/routes/api/` — internal endpoints (tile serving, sync, etc.).
- `src/routes/legal/` — public legal pages.

### `src/lib/` map (the big-picture pieces)
- `pocketbase.ts` — browser PocketBase client. Server-side use `event.locals.pb` from `hooks.server.ts`.
- `participant-state/` — IndexedDB store (`idb`) + sync queue. This is the offline core for the participant app (the README's "Offline-Pakete"). The previously documented `src/lib/offline/` does not exist.
- `automation/` — automation engine (triggers, actions, expressions) reacting to status/field/time events.
- `workflow-builder/` — admin canvas for stages, connections, forms, edit/protocol tools.
- `filter-engine/` — predicate engine used by participant map filters and access rules.
- `schemas/` — Zod schemas shared by superforms and server actions.
- `server/` — server-only helpers (auth, tile serving, layer caching).
- `components/ui/` — shadcn-svelte primitives; higher-level shared components live one level up in `components/`.
- `paraglide/` — generated; do not edit. Edit `messages/de.json` and `messages/en.json`, then import via `import * as m from '$lib/paraglide/messages'` and call `{m.key()}`.
- `workers/` — Web Workers (clustering, heavy geo work).
- `hooks/`, `stores/`, `types/`, `config/`, `utils/`, `upload/`, `sanitize-html.ts` — supporting modules.

### Backend (`pb/`)
- `main.go` — PocketBase entrypoint with custom hooks/middleware.
- `pb_hooks/` — JS hooks executed by PocketBase.
- `pb_migrations/` — schema migrations. The app is under construction; **do not write backwards-compatibility shims or data-migration fallbacks** for old data.
- `pb_data/` — local SQLite + SpatiaLite store (gitignored, wiped by `db:clear`).
- Admin UI at `/_/` (only exposed when `EXPOSE_PB_ADMIN=true`).

### Auth & request flow
1. `hooks.server.ts` reads the PocketBase cookie and populates `event.locals.pb` and `event.locals.user`.
2. `+layout.server.ts` files surface auth/project state to routes.
3. Participant requests use a separate `participants` collection and a different cookie/token; never assume `users`-shaped auth in participant routes.
4. Map tile access is gated per `(user, layer)` and cached server-side (see recent commit `cache map_layers access per (user, layer)`).

### Offline / sync model
Participant actions are written to IndexedDB first, queued, and replayed against PocketBase when online. Map tiles for a region+zoom are downloaded as "packs". When touching participant features, preserve the optimistic-write + queue path — do not call PocketBase directly from participant components.

## Working agreements

- **Database changes:** discuss schema (fields, types, rules) before adding migrations. Only add what the current task needs; further fields are added later as work continues.
- **No backwards compatibility:** the app is pre-release. Don't add fallbacks, legacy renames, or data migrations for old shapes.
- **Live data tools available:** PocketBase MCP (`mcp__pocketbase-mcp__*`) for collections/records, Überblick MCP (`mcp__ueberblick__*`) for higher-level project/workflow operations, Context7 for library docs. Prefer these over guessing. For API-level reproduction, ask the user for an access token and use `curl`.
- **Mobile UI:** use `responsive-sidebar.svelte` for desktop side-panel + mobile bottom-drawer behaviour; do not roll a parallel pattern.
- **i18n is mandatory:** any user-visible string goes through both `messages/de.json` and `messages/en.json`.

## Environment

Copy `.env.example` to `.env`. Key vars: `POCKETBASE_ADMIN_EMAIL`, `POCKETBASE_ADMIN_PASSWORD`, `PUBLIC_POCKETBASE_URL`, `EXPOSE_PB_ADMIN`. Docker: `docker-compose up --build` (frontend on :8080, PB admin at `/_/` when exposed).

## Tests

- Unit: `*.spec.ts` / `*.test.ts` via Vitest.
- Component: `*.svelte.spec.ts` via `vitest-browser-svelte` (browser mode configured in `vite.config.ts`).
- E2E: `e2e/` via Playwright (`playwright.config.ts`).
