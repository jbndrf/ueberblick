/**
 * Participant State - Offline-first data management
 *
 * Main entry point for the participant-state module.
 * Provides a unified gateway for all participant data operations.
 */

// =============================================================================
// Gateway (Primary Interface)
// =============================================================================

export { createParticipantGateway, type ParticipantGateway } from './gateway.svelte';

// =============================================================================
// Context (for sharing gateway across components)
// =============================================================================

export {
	getParticipantGateway,
	setParticipantGateway,
	getReferenceData,
	setReferenceData,
	initializeParticipantState,
	// Session caching for offline mode
	cacheSession,
	getCachedSession,
	clearCachedSession,
	type ReferenceData
} from './context.svelte';

// =============================================================================
// Persistence
// =============================================================================

export {
	setupPersistence,
	saveReferenceData,
	loadReferenceData,
	clearAllRecords,
	clearCollection,
	clearAllData
} from './persistence.svelte';

// =============================================================================
// Sync Engine
// =============================================================================

export { downloadAll, uploadChanges, enableAutoSync, triggerSync, getSyncProgress } from './sync.svelte';

// =============================================================================
// Operation Log
// =============================================================================

export {
	createOperationEntry,
	saveOperation,
	getAllOperations,
	getOperationsForEntity,
	getOperationsByCollection,
	getPendingOperations,
	getFailedOperations,
	getOperationsByParticipant,
	markOperationSynced,
	markOperationFailed,
	linkOperationToToolUsage,
	cleanupSyncedOperations,
	getOperationCounts
} from './operation-log';

// =============================================================================
// Network Detection
// =============================================================================

export {
	getNetworkStatus,
	isOnline,
	isOffline,
	getConnectionType,
	getEffectiveType,
	isFastConnection,
	isSlowConnection,
	initNetworkListeners,
	waitForOnline,
	whenOnline,
	pingServer
} from './network.svelte';

// =============================================================================
// Database
// =============================================================================

export {
	initDB,
	getDB,
	closeDB,
	deleteDatabase,
	checkStorageQuota,
	requestPersistentStorage,
	isStoragePersistent,
	type CachedTile
} from './db';

// =============================================================================
// Pack Downloader
// =============================================================================

export {
	getDownloadProgress,
	resetDownloadProgress,
	downloadPack,
	getDownloadedPacks,
	getPack,
	deletePack,
	getPackMarkers,
	getPackWorkflows,
	getPackForms,
	getPackCategories,
	refreshPack,
	estimatePackSize
} from './pack-downloader.svelte';

// =============================================================================
// Download Events (reactive signaling)
// =============================================================================

export {
	signalDownloadComplete,
	signalOfflineModeChange,
	getDownloadCompleteSignal,
	getOfflineModeChangeSignal
} from './download-events.svelte';

// =============================================================================
// Tile Cache
// =============================================================================

export {
	// Progress tracking
	getTileProgress,
	resetTileProgress,
	// Tile calculations
	calculateTileCount,
	estimateTileSize,
	getTileCoordinates,
	radiusToBbox,
	// Tile storage
	storeTile,
	getTile,
	hasTile,
	getTilesForSource,
	deleteTilesForSource,
	clearAllTiles,
	getTileCacheStats,
	// Download
	downloadTilesForArea,
	// Types
	type TileSource,
	type TileDownloadProgress,
	type DownloadOptions
} from './tile-cache.svelte';

// =============================================================================
// Utilities
// =============================================================================

export { generateId, deepEqual, arraysEqual } from './utils';

// =============================================================================
// Types
// =============================================================================

export type {
	// Common
	GeoPoint,

	// Status tracking
	ItemStatus,
	TrackedItem,
	SyncStatus,
	SyncProgress,

	// Core entity types (matching PocketBase)
	Marker,
	WorkflowInstance,
	FieldValue,
	ToolUsage,

	// Tracked entity types
	TrackedMarker,
	TrackedWorkflowInstance,
	TrackedFieldValue,
	TrackedToolUsage,

	// Operation log
	OperationType,
	CollectionName,
	OperationSyncStatus,
	OperationLogEntry,

	// Reference data types
	Workflow,
	WorkflowStage,
	WorkflowConnection,
	ToolForm,
	ToolFormField,
	ToolEdit,
	MarkerCategory,
	Role,
	MapSource,
	MapLayer,

	// Network
	NetworkStatus,

	// Offline packs
	BoundingBox,
	OfflinePackMetadata,
	DownloadStatus,
	DownloadProgress,

	// Storage types
	StoredMarker,
	StoredWorkflowInstance,
	StoredFieldValue,
	StoredToolUsage,
	StoredOperationLogEntry,

	// Offline pack content types
	OfflineMarker,
	OfflineWorkflow,
	OfflineForm,
	OfflineMarkerCategory,

	// Gateway result types
	GatewayResult,
	BatchResult,

	// Session caching
	CachedSession
} from './types';
