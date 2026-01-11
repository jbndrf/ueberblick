# Offline-First Architecture

This directory contains the implementation of the offline-first architecture for the Karte participant frontend.

## Overview

The offline system enables participants to:
1. Download a "pack" of data for a geographic area
2. Work offline (create markers, submit surveys, take photos)
3. Automatically sync created data when back online

## Core Concepts

### Offline Pack
A downloadable bundle containing:
- Map tiles for the selected area
- Existing markers within the bounding box
- Workflows and forms for the project
- Marker categories
- Answer options and form schemas

### Sync Queue
All user-created data is:
1. Stored locally in IndexedDB immediately
2. Queued for sync to PocketBase
3. Uploaded when connection is restored
4. Retried automatically on failure (up to 3 times)

## File Structure

```
src/lib/offline/
├── types.ts              # TypeScript type definitions
├── db.ts                 # IndexedDB wrapper (using 'idb')
├── network.ts            # Network detection and monitoring
├── action-router.ts      # Action dispatcher for offline operations
├── sync.ts               # Sync queue engine
├── pack-downloader.ts    # Offline pack download logic
├── tile-cache.ts         # Map tile caching (leaflet.offline)
├── index.ts              # Barrel exports
└── README.md             # This file

src/lib/actions/
├── markers.ts            # Marker creation actions
├── surveys.ts            # Survey submission actions
└── workflows.ts          # Workflow progress actions
```

## Usage Examples

### 1. Initialize the Database

```typescript
import { initDB } from '$lib/offline';

// Initialize on app startup
await initDB();
```

### 2. Download an Offline Pack

```typescript
import { downloadPack, estimatePackSize } from '$lib/offline';

// Define the area
const bbox = {
  north: 52.52,
  south: 52.50,
  east: 13.41,
  west: 13.39
};

// Estimate size first
const estimate = await estimatePackSize({
  projectId: 'project-123',
  bbox,
  zoomLevels: [12, 13, 14, 15, 16]
});

console.log(`Will download ${estimate.markerCount} markers`);

// Download the pack
const packId = await downloadPack({
  projectId: 'project-123',
  packName: 'Berlin Center',
  bbox,
  zoomLevels: [12, 13, 14, 15, 16]
});
```

### 3. Create a Marker (Offline-First)

```typescript
import { createMarker } from '$lib/actions/markers';

// Create marker - works offline!
const markerId = await createMarker({
  categoryId: 'category-123',
  latitude: 52.5200,
  longitude: 13.4050,
  title: 'Brandenburg Gate',
  description: 'Historic landmark',
  properties: { visited: true }
});

// Marker is immediately available locally
// Will sync to server when online
```

### 4. Submit a Survey (Offline-First)

```typescript
import { submitSurvey } from '$lib/actions/surveys';

const submissionId = await submitSurvey({
  formId: 'form-123',
  markerId: 'marker-456',
  answers: {
    question1: 'Answer 1',
    question2: 42,
    question3: ['option1', 'option2']
  }
});
```

### 5. Monitor Sync Status

```typescript
import { syncState, syncProgress, processQueue } from '$lib/offline';

// Subscribe to sync state
syncState.subscribe($state => {
  console.log('Sync status:', $state.status);
  console.log('Progress:', $state.progress);
});

// Subscribe to progress percentage
syncProgress.subscribe($progress => {
  console.log(`Sync: ${$progress}%`);
});

// Manually trigger sync
await processQueue();
```

### 6. Enable Auto-Sync

```typescript
import { enableAutoSync } from '$lib/offline';

// Enable automatic syncing when connection is restored
enableAutoSync();
```

### 7. Monitor Network Status

```typescript
import { networkStatus, isOnline, waitForOnline } from '$lib/offline';

// Subscribe to network changes
networkStatus.subscribe($status => {
  console.log('Online:', $status.online);
  console.log('Connection type:', $status.type);
  console.log('Effective speed:', $status.effective_type);
});

// Check current status
if (isOnline()) {
  console.log('Connected!');
}

// Wait for connection
await waitForOnline();
console.log('Now online');
```

### 8. Download Map Tiles (requires Leaflet map)

```typescript
import { downloadTilesForPack, tileProgress } from '$lib/offline';
import L from 'leaflet';
import 'leaflet.offline'; // Import the leaflet.offline library

// In your Leaflet map component
const tileLayer = L.tileLayer.offline('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Subscribe to download progress
tileProgress.subscribe($progress => {
  if ($progress) {
    console.log(`Tiles: ${$progress.downloadedTiles}/${$progress.totalTiles}`);
  }
});

// Download tiles for the pack
await downloadTilesForPack(
  packId,
  bbox,
  [12, 13, 14, 15, 16],
  tileLayer
);
```

## Svelte Component Examples

### Sync Status Indicator

```svelte
<script lang="ts">
  import { syncState, syncProgress } from '$lib/offline';
</script>

{#if $syncState.status === 'syncing'}
  <div class="sync-indicator">
    <span>Syncing...</span>
    <progress value={$syncProgress} max={100} />
    <span>{$syncState.progress.completed}/{$syncState.progress.total}</span>
  </div>
{:else if $syncState.status === 'error'}
  <div class="error">
    Sync failed: {$syncState.lastError}
  </div>
{/if}
```

### Network Status Indicator

```svelte
<script lang="ts">
  import { networkStatus } from '$lib/offline';
</script>

<div class="network-status">
  {#if $networkStatus.online}
    <span class="online">Online</span>
    {#if $networkStatus.effective_type}
      <span>({$networkStatus.effective_type})</span>
    {/if}
  {:else}
    <span class="offline">Offline</span>
  {/if}
</div>
```

### Pack Download UI

```svelte
<script lang="ts">
  import { downloadProgress, downloadPack } from '$lib/offline';

  let bbox = { north: 52.52, south: 52.50, east: 13.41, west: 13.39 };

  async function startDownload() {
    await downloadPack({
      projectId: 'project-123',
      packName: 'My Area',
      bbox,
      zoomLevels: [12, 13, 14, 15, 16]
    });
  }
</script>

<button on:click={startDownload}>Download Offline Pack</button>

{#if $downloadProgress}
  <div class="download-progress">
    <p>{$downloadProgress.current_operation}</p>
    <progress
      value={$downloadProgress.completed_items}
      max={$downloadProgress.total_items}
    />
    <span>{$downloadProgress.completed_items}/{$downloadProgress.total_items}</span>
  </div>
{/if}
```

## Storage Management

### Check Available Storage

```typescript
import { checkStorageQuota } from '$lib/offline';

const quota = await checkStorageQuota();
console.log(`Available: ${quota.available / 1024 / 1024} MB`);
console.log(`Used: ${quota.percentUsed}%`);
```

### Request Persistent Storage

```typescript
import { requestPersistentStorage, isStoragePersistent } from '$lib/offline';

// Request persistent storage (prevents browser from auto-deleting)
const granted = await requestPersistentStorage();
if (granted) {
  console.log('Storage will persist');
}

// Check if storage is persistent
const persistent = await isStoragePersistent();
```

## Best Practices

1. **Initialize early**: Call `initDB()` when your app starts
2. **Enable auto-sync**: Call `enableAutoSync()` to automatically sync when online
3. **Handle errors**: Wrap offline operations in try/catch blocks
4. **Show feedback**: Subscribe to progress stores and show UI indicators
5. **Validate input**: Use the validated action functions when possible
6. **Monitor quota**: Check storage quota before downloading large packs
7. **Clean up**: Remove old packs and synced items to free space

## TypeScript Support

All functions and stores are fully typed. Import types from the main module:

```typescript
import type {
  BoundingBox,
  OfflinePackMetadata,
  NetworkStatus,
  SyncQueueItem
} from '$lib/offline';
```

## Troubleshooting

### "Database not initialized"
Make sure to call `initDB()` before using other functions.

### "Quota exceeded"
Check available storage with `checkStorageQuota()` and delete old packs.

### "Sync failed"
Check `syncState.lastError` for details. Use `retryFailedItems()` to retry.

### "Tiles not downloading"
Ensure `leaflet.offline` is imported and tile layer is initialized correctly.

## Next Steps for Integration

1. Create UI components for pack selection and download
2. Add map integration with Leaflet and leaflet.offline
3. Build forms that use the survey submission actions
4. Add sync status indicators to the app layout
5. Implement conflict resolution UI (if needed)
6. Add progress indicators for tile downloads
7. Create pack management UI (view, delete, refresh packs)

## Dependencies

- `idb`: Lightweight IndexedDB wrapper (1.3 KB)
- `leaflet.offline`: Map tile caching library
- `uuid`: UUID generation for temporary IDs
- `pocketbase`: Backend integration

## Related Documentation

- Architecture overview: `/docs/OFFLINE_ARCHITECTURE.md`
- PocketBase collections: Check PocketBase admin UI
- Leaflet.offline docs: https://github.com/allartk/leaflet.offline
