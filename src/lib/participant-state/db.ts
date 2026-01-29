/**
 * IndexedDB wrapper for participant state
 *
 * Version 6: Added files store for offline file/image blob caching.
 * Version 5: Added packages store for offline tile packages.
 * Version 4: Added tiles store for custom map tile caching.
 * The gateway is now a transparent proxy - any collection works.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { OperationLogEntry, OperationSyncStatus } from './types';

/**
 * Downloaded offline package metadata (local tracking)
 */
export interface DownloadedPackage {
	id: string; // offline_packages record ID
	name: string;
	projectId: string;
	downloadedAt: string;
	tileCount: number;
	fileSizeBytes: number;
	status: 'downloading' | 'ready' | 'failed';
	error?: string;
}

/**
 * Cached file blob for offline file/image support.
 * Files are stored separately from records because Blob objects
 * need their own store (records use structured clone for JSON-like data).
 */
export interface CachedFile {
	key: string; // "{collection}/{recordId}/{fieldName}/{fileName}"
	collection: string;
	recordId: string;
	fieldName: string;
	fileName: string;
	blob: Blob;
	mimeType: string;
	size: number;
	cachedAt: string;
	source: 'downloaded' | 'local'; // downloaded = from server, local = created offline
}

/**
 * Generic cached record - can hold any collection's data
 */
export interface CachedRecord {
	_key: string; // compound key: `${collection}/${id}`
	_collection: string; // collection name
	_status: 'unchanged' | 'new' | 'modified' | 'deleted';
	_error?: string;
	_retryCount?: number;
	id: string;
	[key: string]: unknown; // actual record data
}

/**
 * Cached map tile
 * Key format: "{sourceId}/{z}/{x}/{y}" to support multiple tile sources
 */
export interface CachedTile {
	key: string; // "{sourceId}/{z}/{x}/{y}"
	sourceId: string; // map_sources.id
	z: number;
	x: number;
	y: number;
	blob: Blob;
	urlTemplate: string; // original tile URL template for reference
	cachedAt: string;
}

/**
 * Database schema - simplified to generic stores
 */
interface ParticipantStateDB extends DBSchema {
	// Generic store for any collection's records
	records: {
		key: string; // _key (compound: collection/id)
		value: CachedRecord;
		indexes: {
			by_collection: string;
			by_status: 'unchanged' | 'new' | 'modified' | 'deleted';
			by_collection_status: [string, string];
		};
	};

	// Operation log (audit trail)
	operation_log: {
		key: string;
		value: OperationLogEntry & {
			_entityKey: string;
		};
		indexes: {
			'by-collection': string;
			'by-entity': string;
			'by-sync-status': OperationSyncStatus;
			'by-timestamp': string;
			'by-participant': string;
		};
	};

	// Map tile cache (supports multiple tile sources)
	tiles: {
		key: string; // "{sourceId}/{z}/{x}/{y}"
		value: CachedTile;
		indexes: {
			by_source: string;
			by_zoom: number;
		};
	};

	// Downloaded offline packages (v5)
	packages: {
		key: string; // package ID
		value: DownloadedPackage;
		indexes: {
			by_project: string;
			by_status: 'downloading' | 'ready' | 'failed';
		};
	};

	// Cached file blobs for offline file/image support (v6)
	files: {
		key: string; // "{collection}/{recordId}/{fieldName}/{fileName}"
		value: CachedFile;
		indexes: {
			by_collection: string;
			by_record: string; // recordId
			by_source: 'downloaded' | 'local';
		};
	};
}

const DB_NAME = 'participant-state';
const DB_VERSION = 6;

let dbInstance: IDBPDatabase<ParticipantStateDB> | null = null;

/**
 * Initialize and open the IndexedDB database
 */
export async function initDB(): Promise<IDBPDatabase<ParticipantStateDB>> {
	if (dbInstance) {
		return dbInstance;
	}

	dbInstance = await openDB<ParticipantStateDB>(DB_NAME, DB_VERSION, {
		upgrade(db, oldVersion) {
			// Delete all old stores when upgrading to v3
			if (oldVersion < 3) {
				const oldStores = [
					'pending_markers',
					'pending_surveys',
					'pending_photos',
					'workflow_progress',
					'forms',
					'markers',
					'workflow_instances',
					'workflow_instance_field_values',
					'workflow_instance_tool_usage',
					'workflows',
					'workflow_stages',
					'workflow_connections',
					'tools_forms',
					'tools_form_fields',
					'tools_edit',
					'marker_categories',
					'roles',
					'pack_metadata'
				];
				for (const storeName of oldStores) {
					if (db.objectStoreNames.contains(storeName as never)) {
						db.deleteObjectStore(storeName as never);
					}
				}
			}

			// Generic records store - holds any collection
			if (!db.objectStoreNames.contains('records')) {
				const store = db.createObjectStore('records', { keyPath: '_key' });
				store.createIndex('by_collection', '_collection');
				store.createIndex('by_status', '_status');
				store.createIndex('by_collection_status', ['_collection', '_status']);
			}

			// Operation log for audit trail
			if (!db.objectStoreNames.contains('operation_log')) {
				const store = db.createObjectStore('operation_log', { keyPath: 'id' });
				store.createIndex('by-collection', 'collection');
				store.createIndex('by-entity', '_entityKey');
				store.createIndex('by-sync-status', 'syncStatus');
				store.createIndex('by-timestamp', 'timestamp');
				store.createIndex('by-participant', 'participantId');
			}

			// Map tile cache (v4) - supports multiple tile sources
			if (!db.objectStoreNames.contains('tiles')) {
				const store = db.createObjectStore('tiles', { keyPath: 'key' });
				store.createIndex('by_source', 'sourceId');
				store.createIndex('by_zoom', 'z');
			}

			// Downloaded packages store (v5) - tracks offline tile packages
			if (!db.objectStoreNames.contains('packages')) {
				const store = db.createObjectStore('packages', { keyPath: 'id' });
				store.createIndex('by_project', 'projectId');
				store.createIndex('by_status', 'status');
			}

			// Cached file blobs store (v6) - offline file/image support
			if (!db.objectStoreNames.contains('files')) {
				const store = db.createObjectStore('files', { keyPath: 'key' });
				store.createIndex('by_collection', 'collection');
				store.createIndex('by_record', 'recordId');
				store.createIndex('by_source', 'source');
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
