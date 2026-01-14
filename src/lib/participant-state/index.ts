/**
 * Participant State - Offline-first data management
 *
 * Main entry point for the participant-state module.
 * Provides offline-first state management with Svelte 5 runes.
 */

// =============================================================================
// State Management
// =============================================================================

export { ParticipantState, createParticipantState } from './state.svelte';

// =============================================================================
// Persistence
// =============================================================================

export { setupPersistence, loadFromDB, clearAllPendingData } from './persistence.svelte';

// =============================================================================
// Sync Engine
// =============================================================================

export { syncAll, enableAutoSync } from './sync';

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
	// Status tracking
	ItemStatus,
	TrackedItem,
	SyncStatus,
	SyncProgress,

	// Entity types
	Marker,
	Survey,
	Photo,
	WorkflowProgress,

	// Tracked entity types
	TrackedMarker,
	TrackedSurvey,
	TrackedPhoto,
	TrackedWorkflowProgress,

	// Network
	NetworkStatus,

	// Offline packs
	BoundingBox,
	OfflinePackMetadata,
	DownloadStatus,
	DownloadProgress,

	// Offline pack data
	OfflineMarker,
	OfflineWorkflow,
	OfflineWorkflowStage,
	OfflineForm,
	OfflineFormField,
	OfflineFormFieldOption,
	OfflineMarkerCategory,

	// Storage types
	StoredItem,
	StoredMarker,
	StoredSurvey,
	StoredPhoto,
	StoredWorkflowProgress
} from './types';
