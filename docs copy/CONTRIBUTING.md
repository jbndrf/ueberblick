# Überblick -- Contributing Guide

## Development Setup

### Prerequisites

- Node.js 20+
- Go 1.24+ (for PocketBase backend)
- Docker (optional, for production-like setup)

### Getting Running

```bash
# Install frontend dependencies
npm install

# Copy environment file
cp .env.example .env
# Set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD

# Terminal 1: Start PocketBase backend
npm run backend
# Or with live reload: npm run dev:backend

# Terminal 2: Start SvelteKit dev server
npm run dev
# Opens at https://localhost:5173 (HTTPS, needed for PWA/service worker)
```

The Vite dev server proxies specific `/api/` routes (collections, files, admins, realtime, health, batch) to PocketBase at `localhost:8090`. Tile-serving and upload routes are handled by SvelteKit itself. You don't need to set `PUBLIC_POCKETBASE_URL` for local development.

### Useful Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start SvelteKit dev server with HTTPS |
| `npm run backend` | Start PocketBase |
| `npm run dev:backend` | Start PocketBase with live reload (modd) |
| `npm run build` | Production build |
| `npm run check` | TypeScript + Svelte type checking |
| `npm run lint` | ESLint + Prettier check |
| `npm run format` | Auto-format all files |
| `npm run test:unit` | Vitest unit/component tests |
| `npm run test:e2e` | Playwright E2E tests |
| `npm run db:clear` | Delete all PocketBase data and start fresh |
| `npm run storybook` | Start Storybook on port 6006 (boilerplate stories only) |

---

## Project Structure

```
src/
  routes/
    (admin)/              # Admin interface (Sector)
      projects/[projectId]/
        participants/     # CRUD
        roles/            # CRUD
        workflows/        # List + builder
        map-settings/     # Layers + offline packages
        custom-tables/    # CRUD
        marker-categories/# CRUD
    participant/          # Participant interface
      login/
      map/                # Main participant UI
        modules/          # Detail view modules
        components/       # Map-specific components
    api/                  # SvelteKit API routes (tiles, uploads)
  lib/
    components/
      ui/                 # shadcn-svelte components (don't edit directly)
      form-renderer/      # Shared form rendering (used by builder + participant)
      module-shell.svelte # Responsive container (desktop panel / mobile drawer)
    participant-state/    # Offline-first engine (IndexedDB, sync, realtime)
    workflow-builder/     # Visual workflow editor logic
      tools/              # Tool registry and definitions
    schemas/              # Zod validation schemas
    types/                # Shared TypeScript types
    server/               # Server-only code (tile packager, auth helpers, CRUD actions)
    stores/               # Svelte stores (font-size, theme preferences)
    config/               # App config (PocketBase URL resolution)
    automation/           # Client-side automation utilities (cron-utils)
    pocketbase.ts         # Client-side PocketBase instance
    utils.ts              # cn() and type utilities
  hooks.server.ts         # Auth middleware (cookie -> PB instance)

pb/
  main.go                 # PocketBase entry point (loads SpatiaLite)
  pb_hooks/
    main.pb.js            # Server hooks (lifecycle, file serving)
    automation.js         # Automation engine (triggers, conditions, actions)
  pb_migrations/          # Database schema migrations (JavaScript)

e2e/                      # Playwright E2E tests
  pages/                  # Page objects
  fixtures/               # Test data

messages/
  en.json                 # English translations
  de.json                 # German translations
```

---

## Conventions

### File Naming

- Svelte components: `kebab-case.svelte` (e.g., `workflow-selector.svelte`)
- TypeScript modules: `kebab-case.ts` (e.g., `tile-cache.svelte.ts`)
- Svelte state files: `*.svelte.ts` (allows runes outside `.svelte` files)
- Tests: `*.spec.ts`, `*.test.ts`, or `*.svelte.spec.ts`
- Migrations: `{timestamp}_{description}.js`

### Indentation

**Tabs, not spaces.** The entire codebase uses tab indentation. If you use spaces, the Edit tool and diffs will break. Configure your editor accordingly.

### Svelte 5 Patterns

This project uses Svelte 5 runes exclusively. No `$:` reactive statements, no `writable()`/`readable()` stores.

```svelte
<script lang="ts">
  // Props
  let { data, onSubmit } = $props();

  // Reactive state
  let count = $state(0);
  let doubled = $derived(count * 2);

  // Side effects
  $effect(() => {
    console.log('count changed:', count);
  });

  // Two-way binding
  let { value = $bindable('') } = $props();
</script>
```

### UI Components

Use **shadcn-svelte** components from `$lib/components/ui/`. These are pre-configured with Tailwind CSS 4 and bits-ui.

```svelte
<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Card from '$lib/components/ui/card';
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>Title</Card.Title>
  </Card.Header>
  <Card.Content>
    <Button onclick={() => {}}>Click</Button>
  </Card.Content>
</Card.Root>
```

Use `cn()` from `$lib/utils` to merge Tailwind classes:

```ts
import { cn } from '$lib/utils';
const classes = cn('text-sm font-medium', isActive && 'text-primary');
```

### Forms

Server-side forms use **sveltekit-superforms** with Zod schemas:

```ts
// src/lib/schemas/example.ts
import { z } from 'zod';
export const exampleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});
```

```ts
// +page.server.ts
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { exampleSchema } from '$lib/schemas/example';

export const load = async () => {
  const form = await superValidate(zod(exampleSchema));
  return { form };
};
```

### Translations (i18n)

All user-facing strings should be translated. Add keys to both `messages/en.json` and `messages/de.json`:

```json
{
  "workflowsTitle": "Workflows",
  "workflowsCreate": "Create Workflow",
  "workflowsDeleteConfirm": "Are you sure you want to delete this workflow?"
}
```

Use in components:

```svelte
<script lang="ts">
  import * as m from '$lib/paraglide/messages';
</script>

<h1>{m.workflowsTitle()}</h1>
```

Key naming: `camelCase`, prefixed with the feature area (e.g., `participants*`, `workflows*`, `map*`).

### PocketBase Migrations

Migrations live in `pb/pb_migrations/` as JavaScript files. Field properties are **top-level**, not nested inside `options`:

```js
// CORRECT
new Field({ name: 'status', type: 'select', values: ['active', 'inactive'], maxSelect: 1 })

// WRONG -- do NOT nest in options
new Field({ name: 'status', type: 'select', options: { values: ['active'] } })
```

See `pb/pb_migrations/1768200000_create_workflow_builder_tables.js` for a comprehensive example.

---

## Adding a New Feature

### New Admin CRUD Page

1. Create route files under `src/routes/(admin)/projects/[projectId]/your-feature/`
   - `+page.server.ts` -- load data, define form actions
   - `+page.svelte` -- render UI
2. Add a Zod schema in `src/lib/schemas/your-feature.ts`
3. Add translations to `messages/en.json` and `messages/de.json`
4. If you need a new database collection, create a migration in `pb/pb_migrations/`
5. Add navigation link in the admin sidebar layout

### New Workflow Tool Type

1. Define the tool in `src/lib/workflow-builder/tools/`:
   - Add type definition to `types.ts`
   - Register in `registry.ts` with metadata, icon, and attach targets
2. Create the editor component in the workflow builder
3. Create the participant-facing tool component in `src/routes/participant/map/modules/workflow-instance-detail/tools/`
4. Add a migration for any new database tables/fields

### New Form Field Type

1. Add the type to `src/lib/workflow-builder/field-types.ts`
2. Add rendering logic in `src/lib/components/form-renderer/FieldRenderer.svelte`
3. Add configuration UI in the workflow builder's field config panel
4. If needed, add a migration for schema changes

---

## Fixing a Bug

1. **Reproduce** -- determine if the bug is in admin (server-rendered) or participant (local-first). The data flows are very different.
2. **Check the right layer**:
   - UI rendering issue: check the `.svelte` component
   - Data not loading: check `+page.server.ts` (admin) or `gateway.svelte.ts` (participant)
   - Permissions: check PocketBase API rules in migrations
   - Sync issue: check `sync.svelte.ts` and `realtime.svelte.ts`
   - Automation: check `pb/pb_hooks/automation.js`
3. **Test with PocketBase admin UI** at `http://localhost:8090/_/` to verify data state
4. **Use curl to test API endpoints directly** if you suspect a permissions or data issue

---

## Tests

### E2E Tests (Playwright)

Located in `e2e/`. Use the Page Object pattern:

```ts
// e2e/pages/login.page.ts
export class LoginPage {
  constructor(private page: Page) {}
  async login(email: string, password: string) { ... }
}
```

Tests can seed data via the PocketBase API directly:

```ts
// e2e/api-seed.ts
const pb = new PocketBase('http://localhost:8090');
await pb.collection('users').authWithPassword(email, password);
await pb.collection('projects').create({ name: 'Test' });
```

Run: `npm run test:e2e`

### Unit/Component Tests (Vitest)

Two test environments configured:
- **Client** (browser): for `.svelte.spec.ts` and `.svelte.test.ts` files
- **Server** (Node.js): for all other test files

Run: `npm run test:unit`

### What's Tested

The E2E suite covers:
- Permission matrix (entry permissions, stage visibility, field access, audit trail)
- Workflow lifecycle (create instance, fill forms, transition stages)
- Database seeding (test data setup, "Reinigung" demo scenario)

Unit test coverage is minimal. Most testing is E2E.

### Running Tests

```bash
# All tests
npm run test

# Just unit tests
npm run test:unit

# Just E2E (requires running dev server + PocketBase)
npm run test:e2e

# E2E with UI
npx playwright test --ui
```

Note: E2E tests require both the SvelteKit dev server and PocketBase to be running. The Playwright config auto-starts the dev server but not PocketBase.

---

## Gotchas

### PocketBase JSON Fields Return Byte Arrays

In `pb_hooks`, reading a JSON field with `record.get('field')` returns a byte array (array of char codes), not a parsed object. Use the `parseJsonField()` helper from `automation.js`:

```js
function parseJsonField(raw) {
  if (!raw) return null;
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
    return JSON.parse(String.fromCharCode(...raw));
  }
  if (typeof raw === 'string') return JSON.parse(raw);
  return raw;
}
```

### IndexedDB Version

The current IndexedDB version is **8**. If you change the schema in `db.ts`, you must bump this version. The tile cache index is `by_layer` (was `by_source` before the map_sources merge).

### Automation Autodate Workaround

PocketBase's autodate fields don't update when using `unsafeWithoutHooks()`. The automation engine uses raw SQL (`bumpUpdatedTimestamp()`) to work around this. If you add new hooks that modify records, be aware of this pattern.

### CSRF is Disabled

`svelte.config.js` sets `csrf: { checkOrigin: false }` because the app runs behind nginx reverse proxy. This is intentional.

### Service Worker Registration

The PWA service worker is registered manually in the participant layout, not via the vite-plugin-pwa virtual module. This was necessary to fix sub-path routing issues.

### No Backward Compatibility

The app is under construction. You don't need migration paths for old data, fallback code for previous schemas, or backward-compatible APIs. Change what you need to change.

---

## Incomplete / Future Work

These areas are partially implemented and would benefit from contribution:

- **Conflict resolution UI** -- conflicts are detected and stored in IndexedDB (`conflicts` store) but there is no participant-facing screen to review or resolve them. The `ConflictResolutionTool.svelte` exists but may not be reachable.
- **Offline pack download UI** -- the admin can create packages and the `pack-downloader.svelte.ts` has download logic, but the participant app has no browse/download interface.
- **Field tag editor** -- `FieldTagEditorView.svelte` is ~100 lines. The database collection exists but the editor needs expansion.
- **Filter value icons** -- `filter_value_icons` collection exists, admin can set icons, but participant map integration is uncertain.
- **CI test pipeline** -- E2E and unit tests exist but GitHub Actions only builds Docker images. Wiring tests into CI would be valuable.
- **Unit test coverage** -- most testing is E2E. Individual modules (sync engine, automation expression parser, gateway) would benefit from unit tests.
- **Storybook** -- `npm run storybook` works but only has boilerplate stories (Button, Header, Page). No project-specific component stories exist yet.
- **Sentry** -- `@sentry/sveltekit` is in package.json but no initialization code exists in the source. Not configured.

---

## Undocumented Areas (TODO)

These systems exist in the codebase but lack dedicated documentation:

- **Admin base components** -- `BaseTable`, `CrudDialogs`, `CustomFieldManagerGeneric` in the admin routes provide reusable CRUD patterns. No guide for reusing them.
- **SvelteKit API routes** -- three routes under `src/routes/api/` handle tile serving, tile upload, and upload status. Not covered in a how-to.
- **Server utilities** (`src/lib/server/`) -- `crud-actions.ts` provides generic CRUD action handlers, `auth.ts`/`admin-auth.ts` handle server-side auth. These are reused across admin pages but not documented as patterns.
- **Responsive sidebar** (`src/lib/components/responsive-sidebar.svelte`) -- provides desktop right-panel / mobile bottom-drawer layout. Referenced in CLAUDE.md but not explained in these docs.
- **PocketBase URL resolution** (`src/lib/config/pocketbase.ts`) -- handles URL routing for dev (proxy), mobile testing (direct), and Docker (nginx). Not documented.
- **Client hooks** (`src/hooks.ts`) -- handles Paraglide i18n URL delocalization via `reroute()`. Minimal but present.
