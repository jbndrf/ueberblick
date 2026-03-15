# Gotchas

Known quirks, workarounds, and things that will bite you.

---

## PocketBase JSON fields return byte arrays

In `pb_hooks` (goja VM), `record.get()` on JSON-type fields returns an **array of char codes**, not a parsed object or string. Always use the helper:

```js
const auto = require(`${__hooks}/automation.js`);
const config = auto.parseJsonField(record.get('trigger_config'));
```

The helper handles all three cases (byte array, string, already-parsed object). It lives in `pb/pb_hooks/automation.js`. This affects `trigger_config`, `conditions`, `actions`, `steps`, and any other JSON field read in hooks.

## Autodate fields cannot be set via record.set()

PocketBase silently ignores `record.set("updated", ...)` on autodate fields. After `unsafeWithoutHooks().save()`, use raw SQL:

```js
// In pb_hooks
function bumpUpdatedTimestamp(collectionName, recordId) {
  var now = new Date().toISOString();
  $app.db().newQuery(
    'UPDATE "' + collectionName + '" SET updated = {:now} WHERE id = {:id}'
  ).bind({ now: now, id: recordId }).execute();
}
```

Defined in `pb/pb_hooks/automation.js`.

## PocketBase migration field properties are top-level

`new Field({ options: { values: [...] } })` does **nothing** -- properties like `values`, `maxSelect`, `min`, `max`, `collectionId` must be at the top level. See the conventions doc for examples.

## IndexedDB version is 8

Defined in `src/lib/participant-state/db.ts` as `DB_VERSION = 8`. If you add/remove stores or indexes, **bump this number**. The tile cache index is named `by_layer` (keyed on `layerId`).

Version history is documented at the top of `db.ts`.

## CSRF is disabled

`svelte.config.js` sets `csrf: { checkOrigin: false }`. The app runs behind NGINX reverse proxy which handles origin validation.

## Service worker registration is manual

The participant layout (`src/routes/participant/+layout.svelte`) registers the service worker manually with `navigator.serviceWorker.register('/sw.js')` instead of using `virtual:pwa-register`. Reason: the virtual module generates a relative `./sw.js` path that breaks on sub-paths like `/participant/map`.

The `@vite-pwa/sveltekit` plugin is still used for workbox config and manifest generation, but `injectRegister` is set to `false`.

## superforms: different adapters for server vs client

Server-side validation uses `zod` from `sveltekit-superforms/adapters`. Client-side validation uses `zodClient` from the same package. Mixing them up produces confusing type errors.

```ts
// Server (+page.server.ts)
import { zod } from 'sveltekit-superforms/adapters';
const form = await superValidate(zod(schema));

// Client (+page.svelte)
import { zodClient } from 'sveltekit-superforms/adapters';
superForm(data.form, { validators: zodClient(schema) });
```

## Auth refresh handles two collections

`hooks.server.ts` checks `collectionName` to decide whether to call `participants.authRefresh()` or `users.authRefresh()`. If you add a third auth collection, you must add a branch here or refresh will silently skip it.

## Vite proxy is route-specific

The dev server does NOT proxy all `/api/*` requests. Only these routes go to PocketBase:

```
/api/collections  /api/files  /api/admins  /api/realtime  /api/health  /api/batch  /_/
```

SvelteKit API routes (`/api/tiles/*`, `/api/map-layers/*`) are served by Vite directly. Adding a catch-all `/api` proxy will break them.

## Vitest has two projects

Tests are split into `client` (browser environment via Playwright, for `*.svelte.spec.ts`) and `server` (Node environment, for all other `*.spec.ts`). Both share the same Vite config.

## No backward compatibility

The app is under construction. No migration of old data, no fallback code for deprecated schemas. If a schema changes, wipe and recreate.

## Storybook: boilerplate only

Storybook is installed (`@storybook/sveltekit`) and runs on port 6006, but only contains boilerplate stories. Not used for development yet.

## Sentry: installed but not configured

`@sentry/sveltekit` is a dependency but is not wired up with a DSN. No error reporting is active.

## E2E tests not in CI

Playwright tests exist in `e2e/` but GitHub Actions only builds Docker images. Tests are run locally.

## Edit tool whitespace matching

When editing `.svelte` or `.ts` files with AI tools that require exact string matching, be aware that all indentation is tabs. If an edit fails with "old_string not found", the usual cause is spaces vs tabs mismatch. Run `cat -A filename` to inspect -- tabs appear as `^I`.

---

## Project Structure

```
punktstudio/
  docker-compose.yaml
  vite.config.ts
  svelte.config.js
  .prettierrc
  .env.example
  messages/
    en.json
    de.json
  pb/
    main.go
    dev-entrypoint.sh
    entrypoint.sh
    modd.conf
    pb_hooks/
      main.pb.js
      automation.js
    pb_migrations/
      1736563200_create_projects.js
      ...
    pb_data/
      data.db
  src/
    hooks.server.ts
    app.d.ts
    routes/
      (admin)/
        +layout.svelte
        login/
        projects/
          [projectId]/
            custom-tables/[tableId]/
            marker-categories/[categoryId]/
            map-settings/
            participants/
            roles/
            workflows/[workflowId]/
              builder/
        admin/
      participant/
        +layout.svelte
        login/
        map/
          modules/
      api/
        tiles/[tilesetId]/[z]/[x]/[y]/
        map-layers/
          upload/
          [id]/status/
    lib/
      schemas/           (shared Zod schemas)
      participant-state/
        gateway.svelte.ts
        db.ts
        sync.svelte.ts
        realtime.svelte.ts
        file-cache.ts
        tile-cache.svelte.ts
        persistence.svelte.ts
        pack-downloader.svelte.ts
        context.svelte.ts
        network.svelte.ts
        types.ts
      workflow-builder/
        state.svelte.ts
        save.ts
        tools/
          registry.ts
          types.ts
          schemas.ts
          tag-types.ts
        field-types.ts
        components/
      stores/
        theme.svelte.ts
        font-size.svelte.ts
      components/
        ui/           (shadcn-svelte base)
        admin/         (admin-specific)
        form-renderer/ (FormRenderer, FieldRenderer, MediaGallery)
      server/
        auth.ts
        admin-auth.ts
        crud-actions.ts
        tile-processor.ts
        tile-packager.ts
        pocketbase-helpers.ts
        workflow-database.ts
      paraglide/       (generated i18n)
  e2e/
  stress-tests/
```
