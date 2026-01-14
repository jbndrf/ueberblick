/**
 * IndexedDB wrapper for participant state
 *
 * Updated schema to store status metadata with items.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
	OfflinePackMetadata,
	OfflineMarker,
	OfflineWorkflow,
	OfflineForm,
	OfflineMarkerCategory,
	Marker,
	Survey,
	Photo,
	WorkflowProgress,
	ItemStatus
} from './types';

/**
 * Database schema definition with status tracking
 */
interface ParticipantStateDB extends DBSchema {
	// Downloaded pack data (read-only)
	pack_metadata: {
		key: string;
		value: OfflinePackMetadata & { pack_id?: string };
		indexes: { 'by-project': string };
	};
	markers: {
		key: string;
		value: OfflineMarker & { pack_id?: string };
		indexes: { 'by-pack': string; 'by-category': string };
	};
	workflows: {
		key: string;
		value: OfflineWorkflow & { pack_id?: string };
		indexes: { 'by-pack': string };
	};
	forms: {
		key: string;
		value: OfflineForm & { pack_id?: string };
		indexes: { 'by-pack': string };
	};
	marker_categories: {
		key: string;
		value: OfflineMarkerCategory & { pack_id?: string };
		indexes: { 'by-pack': string };
	};

	// User-created data (pending sync) - with status tracking
	pending_markers: {
		key: string;
		value: Marker & {
			_status: ItemStatus;
			_error?: string;
			_retryCount?: number;
		};
		indexes: { 'by-status': ItemStatus; 'by-created': string };
	};
	pending_surveys: {
		key: string;
		value: Survey & {
			_status: ItemStatus;
			_error?: string;
			_retryCount?: number;
		};
		indexes: { 'by-status': ItemStatus; 'by-marker': string; 'by-created': string };
	};
	pending_photos: {
		key: string;
		value: Photo & {
			_status: ItemStatus;
			_error?: string;
			_retryCount?: number;
		};
		indexes: { 'by-status': ItemStatus; 'by-marker': string; 'by-created': string };
	};
	workflow_progress: {
		key: string;
		value: WorkflowProgress & {
			_status: ItemStatus;
			_error?: string;
			_retryCount?: number;
		};
		indexes: { 'by-status': ItemStatus; 'by-marker': string; 'by-workflow': string };
	};
}

const DB_NAME = 'participant-state';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<ParticipantStateDB> | null = null;

/**
 * Initialize and open the IndexedDB database
 */
export async function initDB(): Promise<IDBPDatabase<ParticipantStateDB>> {
	if (dbInstance) {
		return dbInstance;
	}

	dbInstance = await openDB<ParticipantStateDB>(DB_NAME, DB_VERSION, {
		upgrade(db) {
			// Pack metadata store
			if (!db.objectStoreNames.contains('pack_metadata')) {
				const packStore = db.createObjectStore('pack_metadata', { keyPath: 'id' });
				packStore.createIndex('by-project', 'project_id');
			}

			// Downloaded markers store
			if (!db.objectStoreNames.contains('markers')) {
				const markersStore = db.createObjectStore('markers', { keyPath: 'id' });
				markersStore.createIndex('by-pack', 'pack_id');
				markersStore.createIndex('by-category', 'category_id');
			}

			// Workflows store
			if (!db.objectStoreNames.contains('workflows')) {
				const workflowsStore = db.createObjectStore('workflows', { keyPath: 'id' });
				workflowsStore.createIndex('by-pack', 'pack_id');
			}

			// Forms store
			if (!db.objectStoreNames.contains('forms')) {
				const formsStore = db.createObjectStore('forms', { keyPath: 'id' });
				formsStore.createIndex('by-pack', 'pack_id');
			}

			// Marker categories store
			if (!db.objectStoreNames.contains('marker_categories')) {
				const categoriesStore = db.createObjectStore('marker_categories', { keyPath: 'id' });
				categoriesStore.createIndex('by-pack', 'pack_id');
			}

			// Pending markers store - with status index
			if (!db.objectStoreNames.contains('pending_markers')) {
				const pendingMarkersStore = db.createObjectStore('pending_markers', { keyPath: 'id' });
				pendingMarkersStore.createIndex('by-status', '_status');
				pendingMarkersStore.createIndex('by-created', 'created_at');
			}

			// Pending surveys store - with status index
			if (!db.objectStoreNames.contains('pending_surveys')) {
				const pendingSurveysStore = db.createObjectStore('pending_surveys', { keyPath: 'id' });
				pendingSurveysStore.createIndex('by-status', '_status');
				pendingSurveysStore.createIndex('by-marker', 'marker_id');
				pendingSurveysStore.createIndex('by-created', 'created_at');
			}

			// Pending photos store - with status index
			if (!db.objectStoreNames.contains('pending_photos')) {
				const pendingPhotosStore = db.createObjectStore('pending_photos', { keyPath: 'id' });
				pendingPhotosStore.createIndex('by-status', '_status');
				pendingPhotosStore.createIndex('by-marker', 'marker_id');
				pendingPhotosStore.createIndex('by-created', 'created_at');
			}

			// Workflow progress store - with status index
			if (!db.objectStoreNames.contains('workflow_progress')) {
				const progressStore = db.createObjectStore('workflow_progress', { keyPath: 'id' });
				progressStore.createIndex('by-status', '_status');
				progressStore.createIndex('by-marker', 'marker_id');
				progressStore.createIndex('by-workflow', 'workflow_id');
			}
		}
	});

	return dbInstance;
}

/**
 * Get the database instance (initialize if needed)
 */
export async function getDB(): Promise<IDBPDatabase<ParticipantStateDB>> {
	if (!dbInstance) {
		return await initDB();
	}
	return dbInstance;
}

/**
 * Close the database connection
 */
export function closeDB(): void {
	if (dbInstance) {
		dbInstance.close();
		dbInstance = null;
	}
}

/**
 * Delete the entire database (for testing or reset)
 */
export async function deleteDatabase(): Promise<void> {
	closeDB();
	await new Promise<void>((resolve, reject) => {
		const request = indexedDB.deleteDatabase(DB_NAME);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

/**
 * Check available storage quota
 */
export async function checkStorageQuota(): Promise<{
	quota: number;
	usage: number;
	available: number;
	percentUsed: number;
}> {
	if ('storage' in navigator && 'estimate' in navigator.storage) {
		const estimate = await navigator.storage.estimate();
		const quota = estimate.quota || 0;
		const usage = estimate.usage || 0;
		const available = quota - usage;
		const percentUsed = quota > 0 ? (usage / quota) * 100 : 0;

		return { quota, usage, available, percentUsed };
	}

	// Fallback if API not supported
	return {
		quota: 0,
		usage: 0,
		available: Infinity,
		percentUsed: 0
	};
}

/**
 * Request persistent storage (prevents auto-eviction)
 */
export async function requestPersistentStorage(): Promise<boolean> {
	if ('storage' in navigator && 'persist' in navigator.storage) {
		return await navigator.storage.persist();
	}
	return false;
}

/**
 * Check if storage is persistent
 */
export async function isStoragePersistent(): Promise<boolean> {
	if ('storage' in navigator && 'persisted' in navigator.storage) {
		return await navigator.storage.persisted();
	}
	return false;
}

// =============================================================================
// Type exports for external use
// =============================================================================

export type { ParticipantStateDB };
