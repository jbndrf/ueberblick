# Participant Gateway Usage

What you will learn: How to use the participant gateway for offline-first data access in the participant app. The gateway provides a PocketBase-like API that reads from IndexedDB first and syncs with the server in the background.

**Key file:** `src/lib/participant-state/gateway.svelte.ts`

---

## Architecture Overview

The gateway follows a **local-first / stale-while-revalidate** pattern:

- **All reads** hit IndexedDB first (instant), then trigger a background fetch from PocketBase. If the server returns newer data, IndexedDB is updated and the UI re-renders automatically.
- **All writes** go to IndexedDB immediately (optimistic). A background sync pushes changes to PocketBase. Records that have local modifications (`_status: 'new' | 'modified'`) are never overwritten by background fetches.

Each record in IndexedDB carries internal metadata:

| Field | Purpose |
|-------|---------|
| `_key` | `{collection}/{id}` -- the IndexedDB primary key |
| `_collection` | Collection name for indexing |
| `_status` | `unchanged`, `new`, `modified`, or `deleted` |

---

## Getting the Gateway

The gateway is created in the participant layout (`src/routes/participant/+layout.svelte`) and stored in Svelte context. Retrieve it in any child component:

```svelte
<script lang="ts">
  import { getParticipantGateway } from '$lib/participant-state/context.svelte';

  const gateway = getParticipantGateway();
</script>
```

`getParticipantGateway()` returns `ParticipantGateway | null`. It is `null` only if the participant is not authenticated and no offline session exists.

---

## Collection Proxy

All data access goes through `gateway.collection(name)`, which returns a `CollectionProxy<T>`. The API mirrors the PocketBase JS SDK:

```ts
const proxy = gateway.collection('workflow_instances');
```

### Read Operations

#### `getOne(id, options?)`

Fetches a single record from IndexedDB, triggers background revalidation.

```ts
const instance = await gateway.collection('workflow_instances').getOne(instanceId, {
  expand: 'workflow_id'
});
```

If the record is not cached and the device is online, it falls back to a direct server fetch and caches the result.

#### `getFullList(options?)`

Returns all records for a collection from IndexedDB, with optional filter/sort.

```ts
const markers = await gateway.collection('markers').getFullList({
  filter: 'category_id = "abc123"',
  sort: '-created',
  expand: 'category_id'
});
```

#### `getList(page, perPage, options?)`

Paginated variant. Applies filter/sort locally, then slices.

```ts
const result = await gateway.collection('custom_table_data').getList(1, 20, {
  filter: 'table_id = "xyz"',
  sort: 'created'
});
// result.items, result.totalItems, result.totalPages
```

#### `getFirstListItem(filter, options?)`

Returns the first record matching a filter expression.

```ts
const stage = await gateway.collection('workflow_stages').getFirstListItem(
  'workflow_id = "wf1" && stage_type = "start"'
);
```

### Write Operations

All writes are **optimistic** -- they update IndexedDB immediately, notify listeners, and sync to the server in the background.

#### `create(data)`

```ts
const newInstance = await gateway.collection('workflow_instances').create({
  workflow_id: workflowId,
  current_stage_id: stageId,
  status: 'active',
  created_by: gateway.participantId,
  location: { lat: 48.2, lon: 16.3 }
});
// newInstance.id is a locally generated ID
```

#### `create(formData)` -- with file uploads

When you pass a `FormData` object, `File` entries are extracted and stored separately in the IndexedDB files store. The filename is stored on the record.

```ts
const formData = new FormData();
formData.append('instance_id', instanceId);
formData.append('field_key', 'photo');
formData.append('value', '');
formData.append('file_value', fileObject); // File blob

await gateway.collection('workflow_instance_field_values').create(formData);
```

#### `update(id, data)`

```ts
await gateway.collection('workflow_instances').update(instanceId, {
  current_stage_id: nextStageId,
  status: 'active'
});
```

Records with `_status: 'new'` stay as `new` after update. Records with `_status: 'unchanged'` become `modified`.

#### `delete(id)`

```ts
await gateway.collection('workflow_instances').delete(instanceId);
```

If the record was never synced (`_status: 'new'`), it is removed from IndexedDB entirely. Otherwise it is marked `_status: 'deleted'` and the deletion syncs to the server.

---

## Live Queries (Reactive)

Live queries are the primary way to bind data to the UI. They read from IndexedDB, subscribe to change notifications, and re-read automatically when data changes.

### `live(options?)` -- list query

Returns a reactive object with `records` (array) and `loading` (boolean).

```svelte
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { getParticipantGateway } from '$lib/participant-state/context.svelte';

  const gateway = getParticipantGateway();

  const markersLive = gateway.collection('markers').live({
    expand: 'category_id'
  });

  const markers = $derived(markersLive.records);
  const isLoading = $derived(markersLive.loading);

  onDestroy(() => markersLive.destroy());
</script>

{#if isLoading}
  <p>Loading...</p>
{:else}
  {#each markers as marker}
    <div>{marker.id}</div>
  {/each}
{/if}
```

Options work the same as `getFullList`:

```ts
const instancesLive = gateway.collection('workflow_instances').live({
  filter: 'status = "active"',
  sort: '-created',
  expand: 'workflow_id'
});
```

### `liveOne(id, options?)` -- single record query

Returns a reactive object with `record` (single item or null) and `loading`.

```ts
const instanceLive = gateway.collection('workflow_instances').liveOne(instanceId, {
  expand: 'workflow_id'
});

const instance = $derived(instanceLive.record);
```

### Cleanup

Always call `.destroy()` in `onDestroy` to unsubscribe from change notifications:

```ts
onDestroy(() => {
  markersLive.destroy();
  instancesLive.destroy();
});
```

---

## Real-World Example: Map Page

The map page (`src/routes/participant/map/+page.svelte`) demonstrates the full pattern. Here is a condensed version:

```svelte
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { getParticipantGateway } from '$lib/participant-state/context.svelte';

  const gateway = getParticipantGateway();

  // Set up live queries
  const layersLive = gateway.collection('map_layers').live({
    filter: 'is_active = true',
    sort: 'display_order'
  });
  const markersLive = gateway.collection('markers').live({ expand: 'category_id' });
  const instancesLive = gateway.collection('workflow_instances').live({ expand: 'workflow_id' });

  // Derive reactive values
  const mapLayers = $derived(layersLive.records);
  const markers = $derived(markersLive.records);
  const workflowInstances = $derived(instancesLive.records);

  // Loading state
  const isLoading = $derived(layersLive.loading && markersLive.loading);

  // Cleanup
  onDestroy(() => {
    layersLive.destroy();
    markersLive.destroy();
    instancesLive.destroy();
  });
</script>
```

---

## Change Notifications

The gateway uses `notifyDataChange(collection)` internally after every write. You can also subscribe to changes manually:

```ts
import { onDataChange } from '$lib/participant-state/gateway.svelte';

const unsubscribe = onDataChange((collection) => {
  if (collection === 'workflow_instances') {
    console.log('Instances changed');
  }
});

// Later:
unsubscribe();
```

Live queries use this internally -- you rarely need `onDataChange` directly.

---

## Pending Count

The gateway tracks how many local records are awaiting sync:

```svelte
<script lang="ts">
  const gateway = getParticipantGateway();
</script>

{#if gateway.pendingCount > 0}
  <span>{gateway.pendingCount} changes pending sync</span>
{/if}
```

---

## Offline Expand

The gateway supports `expand` for both online and offline mode. When offline, it resolves relation fields by looking up related records across all collections in IndexedDB. This works for both single relations (string ID) and multi-relations (array of IDs).

```ts
// Works offline -- category_id is resolved from IndexedDB
const markers = await gateway.collection('markers').getFullList({
  expand: 'category_id'
});
// markers[0].expand.category_id contains the full category record
```

---

## Summary

| Task | Method | Returns |
|------|--------|---------|
| Reactive list | `.live(options)` | `{ records, loading, destroy() }` |
| Reactive single | `.liveOne(id, options)` | `{ record, loading, destroy() }` |
| Fetch all | `.getFullList(options)` | `Promise<T[]>` |
| Fetch paginated | `.getList(page, perPage, options)` | `Promise<ListResult<T>>` |
| Fetch one | `.getOne(id, options)` | `Promise<T>` |
| Fetch first match | `.getFirstListItem(filter, options)` | `Promise<T>` |
| Create | `.create(data \| FormData)` | `Promise<T>` |
| Update | `.update(id, data \| FormData)` | `Promise<T>` |
| Delete | `.delete(id)` | `Promise<boolean>` |
