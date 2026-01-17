/**
 * IndexedDB wrapper for participant state
 *
 * Version 3: Generic 'records' store for any collection.
 * The gateway is now a transparent proxy - any collection works.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { OperationLogEntry, OperationSyncStatus } from './types';

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
}

const DB_NAME = 'participant-state';
const DB_VERSION = 3;

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
