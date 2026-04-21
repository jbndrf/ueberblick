# Conventions

## File Naming

| Type | Pattern | Example |
|------|---------|---------|
| Svelte components | `kebab-case.svelte` | `crud-dialogs.svelte` |
| Rune-based modules (outside `.svelte`) | `*.svelte.ts` | `gateway.svelte.ts`, `sync.svelte.ts` |
| TypeScript modules | `kebab-case.ts` | `crud-actions.ts` |
| Zod schemas | `src/lib/schemas/{feature}.ts` | `auth.ts`, `workflow.ts`, `map-sources.ts` |
| PocketBase migrations | `{timestamp}_{description}.js` | `1768150001_create_map_layers.js` |
| Tests (unit) | `*.spec.ts` or `*.test.ts` | `tile-processor.spec.ts` |
| Tests (component) | `*.svelte.spec.ts` | `button.svelte.spec.ts` |
| Tests (e2e) | `e2e/*.spec.ts` | `e2e/login.spec.ts` |

## Indentation & Formatting

**Tabs, not spaces.** Configured in `.prettierrc`:

| Setting | Value |
|---------|-------|
| `useTabs` | `true` |
| `singleQuote` | `true` |
| `trailingComma` | `"none"` |
| `printWidth` | `100` |
| Plugins | `prettier-plugin-svelte`, `prettier-plugin-tailwindcss` |

The Edit tool requires exact whitespace match -- verify with `cat -A` if edits fail (tabs show as `^I`).

## Svelte 5 Patterns

Use runes exclusively. Do **not** use `$:` reactive declarations, `writable`/`readable` stores, or `on:event` directive syntax.

### Props

```svelte
<script lang="ts">
  // Simple destructuring
  let { data } = $props();

  // Typed props
  let { data }: { data: PageData } = $props();

  // With interface
  interface Props {
    title: string;
    items: string[];
    open?: boolean;
  }
  let { title, items, open = false }: Props = $props();

  // Bindable props (two-way binding from parent)
  let { value = $bindable(), onchange }: Props = $props();
</script>
```

### State, Derived, Effects

```svelte
<script lang="ts">
  // Reactive state
  let count = $state(0);
  let items = $state<string[]>([]);

  // Derived values
  const doubled = $derived(count * 2);

  // Side effects
  $effect(() => {
    console.log('count changed:', count);
  });
</script>
```

### Event handlers

Svelte 5 uses `onclick`, `onchange` etc. (lowercase, no colon). Never `on:click`.

```svelte
<button onclick={() => count++}>Click</button>
<input onchange={handleChange} />
```

For callback props, use the same pattern:

```svelte
<!-- Parent -->
<MyComponent onchange={(val) => doSomething(val)} />

<!-- MyComponent.svelte -->
<script lang="ts">
  let { onchange }: { onchange?: (val: string) => void } = $props();
</script>
```

### Class-based reactive state in `*.svelte.ts`

For complex state outside `.svelte` files, use classes with `$state` in `*.svelte.ts` files:

```ts
// theme.svelte.ts
class ThemeStore {
  private _theme = $state<'light' | 'dark'>('light');

  get current() { return this._theme; }
  get isDark() { return this._theme === 'dark'; }

  toggle() {
    this._theme = this._theme === 'dark' ? 'light' : 'dark';
  }
}

export const themeStore = new ThemeStore();
```

Used in: `src/lib/stores/theme.svelte.ts`, `src/lib/stores/font-size.svelte.ts`, `src/lib/workflow-builder/state.svelte.ts`, `src/lib/participant-state/gateway.svelte.ts`.

## UI Components

Base components from **shadcn-svelte** live in `src/lib/components/ui/`. Import via `$lib/components/ui/*`.

Use `cn()` for conditional class merging:

```ts
import { cn } from '$lib/utils';
cn('base-class', condition && 'conditional-class');
```

Icons come from `@lucide/svelte`:

```svelte
import { Map, Users, Settings } from '@lucide/svelte';
```

## Forms (sveltekit-superforms + Zod)

Server side uses `zod` adapter, client side uses `zodClient`:

```ts
// +page.server.ts
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { mySchema } from '$lib/schemas/my-feature';

export const load = async () => {
  const form = await superValidate(zod(mySchema));
  return { form };
};

export const actions = {
  default: async ({ request }) => {
    const form = await superValidate(request, zod(mySchema));
    if (!form.valid) return fail(400, { form });
    // ... save data
    return { form };
  }
};
```

```svelte
<!-- +page.svelte -->
<script lang="ts">
  import { superForm } from 'sveltekit-superforms';
  import { zodClient } from 'sveltekit-superforms/adapters';
  import { mySchema } from '$lib/schemas/my-feature';

  let { data } = $props();

  const { form, enhance, errors, delayed } = superForm(data.form, {
    validators: zodClient(mySchema)
  });
</script>

<form method="POST" use:enhance>
  <input name="name" bind:value={$form.name} />
  {#if $errors.name}
    <p class="text-sm text-destructive">{$errors.name}</p>
  {/if}
  <button type="submit" disabled={$delayed}>Save</button>
</form>
```

Schemas live in `src/lib/schemas/` and are shared between server and client.

## i18n (Paraglide)

Messages live in `messages/en.json` and `messages/de.json`. Keys are **camelCase**, prefixed by feature area.

```json
{
  "loginTitle": "Sign In",
  "loginSubtitle": "Enter your credentials...",
  "navDashboard": "Dashboard",
  "workflowBuilderSave": "Save Workflow",
  "mapSettingsTitle": "Map Settings"
}
```

```svelte
<script lang="ts">
  import * as m from '$lib/paraglide/messages';
</script>

<h1>{m.mapSettingsTitle()}</h1>
<title>{m.loginTitle()} - Ueberblick Sector</title>
```

Messages are functions (called with `()`). Parameters use `{name}` syntax in the JSON:

```json
{ "hello_world": "Hello, {name} from en!" }
```

Always add keys to **both** language files. Middleware is set up in `src/hooks.server.ts` via `paraglideMiddleware`.

## PocketBase Migrations

Field properties are **top-level** on the `Field` constructor. Do NOT nest them inside `options`.

```js
// Correct
new Field({
  name: 'status',
  type: 'select',
  values: ['draft', 'active', 'archived'],
  maxSelect: 1,
  required: true
})

// WRONG -- do not do this
new Field({
  name: 'status',
  type: 'select',
  options: { values: ['draft', 'active', 'archived'], maxSelect: 1 }
})
```

Same applies to `min`, `max`, `maxSize`, `collectionId`, and all other field config. See `pb/pb_migrations/1768150004_restructure_map_tables.js` for a comprehensive example.

## Server-Side Auth Pattern

```ts
// In +page.server.ts or +server.ts
export const load = async ({ locals }) => {
  // locals.pb  -- PocketBase instance (authed via cookie)
  // locals.user -- current user record (or null)
  const items = await locals.pb.collection('projects').getList(1, 50);
  return { items };
};
```

Auth is set up in `src/hooks.server.ts` via cookie-based sessions. `users` collection is for admins, `participants` is for participants. Auth refresh handles both collections separately based on `collectionName`.
