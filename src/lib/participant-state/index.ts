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
	isStoragePersistent
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
} from './pack-downloader';

// =============================================================================
// Tile Cache
// =============================================================================

export {
	getTileProgress,
	resetTileProgress,
	updateTileProgress,
	calculateTileCount,
	estimateTileSize,
	getTileCoordinates,
	downloadTilesForPack,
	areTilesAvailable,
	clearPackTiles,
	getTileCacheStats,
	type TileDownloadProgress
} from './tile-cache';

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
	BatchResult
} from './types';
