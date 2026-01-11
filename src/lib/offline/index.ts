/**
 * Offline-first architecture barrel exports
 * Central entry point for offline functionality
 */

// Database
export { initDB, getDB, closeDB, deleteDatabase, checkStorageQuota, requestPersistentStorage, isStoragePersistent } from './db';

// Network detection
export { networkStatus, isOnline, isOffline, getConnectionType, getEffectiveType, isFastConnection, isSlowConnection, waitForOnline, whenOnline, pingServer } from './network';

// Action router
export { dispatch, createAction, getPendingItems, getPendingCount, markAsSynced, clearSyncedItems } from './action-router';

// Sync engine
export { syncState, syncProgress, isSyncing, queueForSync, processQueue, enableAutoSync, getPendingSyncCount, clearFailedItems, retryFailedItems } from './sync';

// Pack downloader
export { downloadProgress, downloadPack, getDownloadedPacks, getPack, deletePack, getPackMarkers, getPackWorkflows, getPackForms, getPackCategories, refreshPack, estimatePackSize } from './pack-downloader';

// Tile cache
export { tileProgress, calculateTileCount, estimateTileSize, getTileCoordinates, downloadTilesForPack, updateTileProgress, areTilesAvailable, clearPackTiles, getTileCacheStats } from './tile-cache';

// Types
export type { BoundingBox, OfflinePackMetadata, DownloadStatus, DownloadProgress, OfflineMarker, OfflineWorkflow, OfflineForm, OfflineMarkerCategory, PendingMarker, PendingSurvey, PendingPhoto, WorkflowProgress, SyncQueueItem, NetworkStatus, ActionType, Action, CreateMarkerPayload, SubmitSurveyPayload, UploadPhotoPayload, UpdateWorkflowProgressPayload } from './types';
