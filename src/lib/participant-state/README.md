# Participant Gateway

Transparent proxy to PocketBase with offline support. Uses the same fluent API so you can swap `pb.collection()` calls with `gateway.collection()`.

**ANY collection works** - no configuration needed.

## How It Works

```
[ONLINE MODE - default]
    |
gateway.collection('markers').getFullList()      --> PocketBase API
gateway.collection('anything').create(data)      --> PocketBase API
    |
    v
User clicks "Go Offline" in Settings
    |
    v
[DOWNLOAD PHASE]
    |
    Downloads ALL collections into IndexedDB
    (collection rules filter by participant permissions)
    |
    v
[OFFLINE MODE]
    |
gateway.collection('markers').getFullList()      --> IndexedDB
gateway.collection('anything').create(data)      --> IndexedDB (marked 'new')
    |
    v
User clicks "Go Online" in Settings
    |
    v
[UPLOAD PHASE]
    |
    Pushes pending changes to PocketBase
    |
    v
[ONLINE MODE]
    |
    Back to direct PocketBase calls
```

## Quick Comparison

```typescript
// PocketBase SDK
const pb = getPocketBase();
await pb.collection('markers').create({ title: 'Test' });
await pb.collection('markers').getOne('abc123');
await pb.collection('markers').getFullList({ filter: 'active=true' });

// Gateway (same API, routes based on online/offline mode)
const gateway = getParticipantGateway();
await gateway.collection('markers').create({ title: 'Test' });
await gateway.collection('markers').getOne('abc123');
await gateway.collection('markers').getFullList({ filter: 'active=true' });

// ANY collection works - no config needed
await gateway.collection('map_layers').getFullList();
await gateway.collection('custom_table_xyz').create(data);
```

## Automatic Change Logging

**ALL write operations are automatically logged** with before/after diff:

```typescript
// This automatically logs:
// - collection: 'markers'
// - operation: 'update'
// - before: { title: 'Old Title', ... }
// - after: { title: 'New Title', ... }
await gateway.collection('markers').update('abc123', { title: 'New Title' });
```

Pass `toolCtx` to add context about which tool triggered the operation:

```typescript
const toolCtx: ToolContext = {
  tool: 'form',
  toolId: 'form_abc123',
  instanceId: 'instance_xyz',
  stageId: 'stage_456'
};

// Log includes tool context
await gateway.collection('workflow_instance_field_values').create({
  instance_id: 'instance_xyz',
  field_key: 'customer_name',
  value: 'John Doe'
}, toolCtx);
```

## Online vs Offline Behavior

### Online Mode (default)
- **Reads** go directly to PocketBase
- **Writes** go directly to PocketBase + logged
- No IndexedDB involved

### Offline Mode (after toggling in Settings)
- **Reads** come from IndexedDB (downloaded when going offline)
- **Writes** go to IndexedDB, marked as pending + logged
- Changes sync when going back online

## Setup

```svelte
<!-- +layout.svelte -->
<script lang="ts">
  import { createParticipantGateway } from '$lib/participant-state/gateway.svelte';
  import { setParticipantGateway } from '$lib/participant-state/context.svelte';

  let { data } = $props();

  const gateway = createParticipantGateway(
    data.participant.id,
    data.participant.project_id
  );
  setParticipantGateway(gateway);

  $effect(() => {
    gateway.init();
  });
</script>
```

## Usage

### Get Gateway in Components

```svelte
<script lang="ts">
  import { getParticipantGateway } from '$lib/participant-state/context.svelte';
  const gateway = getParticipantGateway();
</script>
```

### CRUD Operations

```typescript
// CREATE
const marker = await gateway.collection('markers').create({
  title: 'New Marker',
  location: { lat: 51.5, lon: -0.1 },
  category_id: 'cat123'
});

// READ (single)
const marker = await gateway.collection('markers').getOne('abc123');

// READ (all)
const markers = await gateway.collection('markers').getFullList({
  filter: 'category_id = "cat123"',
  sort: '-created'
});

// READ (paginated)
const result = await gateway.collection('markers').getList(1, 20, {
  filter: 'active = true'
});

// UPDATE
const updated = await gateway.collection('markers').update('abc123', {
  title: 'Updated Title'
});

// DELETE
await gateway.collection('markers').delete('abc123');
```

## Sync Functions

```typescript
import { downloadAll, uploadChanges } from '$lib/participant-state/sync.svelte';

// Download all collections for offline use
// collectionNames come from backend (admin auth)
await downloadAll(gateway, collectionNames);

// Upload pending changes
await uploadChanges(gateway);
```

These are called automatically by the offline toggle in Settings.

## Reactive State

```svelte
{#if gateway.pendingCount > 0}
  <Badge>{gateway.pendingCount} pending</Badge>
{/if}

{#if gateway.isOnline}
  <span>Online</span>
{:else}
  <span>Offline</span>
{/if}
```

| Property | Description |
|----------|-------------|
| `pendingCount` | Items waiting to sync |
| `isOnline` | Current mode |
| `operationLog` | Audit trail entries |

## API Reference

### Collection Methods

```typescript
gateway.collection(name).create(data, toolCtx?): Promise<T>
gateway.collection(name).update(id, data, toolCtx?): Promise<T>
gateway.collection(name).delete(id, toolCtx?): Promise<boolean>
gateway.collection(name).getOne(id, options?): Promise<T>
gateway.collection(name).getList(page?, perPage?, options?): Promise<ListResult<T>>
gateway.collection(name).getFullList(options?): Promise<T[]>
gateway.collection(name).getFirstListItem(filter, options?): Promise<T>
```

### Supported Collections

**ANY collection** - the gateway is a transparent proxy to PocketBase.

## File Structure

```
src/lib/participant-state/
  gateway.svelte.ts      # Gateway with PocketBase-like API
  sync.svelte.ts         # downloadAll(), uploadChanges()
  context.svelte.ts      # Svelte context
  db.ts                  # IndexedDB setup (generic 'records' store)
  operation-log.ts       # Audit trail
  types.ts               # TypeScript types
```
