/**
 * IndexedDB wrapper for participant state
 *
 * Version 7: Added sync_metadata + conflicts stores, resolution field on files.
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
	resolution: 'original' | 'thumbnail';
}

/**
 * Sync metadata per collection - tracks last sync timestamp for delta sync.
 */
export interface SyncMetadata {
	collection: string;
	lastSyncTimestamp: string;
}

/**
 * Stored conflict when server version wins during push sync.
 * Participant can review and optionally re-apply their changes.
 *
 * type:
 *   'modified-vs-modified' (default) -- participant modified the record and
 *     the server has a newer version of the same record. serverVersion holds
 *     the server's current data.
 *   'modified-vs-deleted' -- participant modified a record that has been
 *     deleted on the server. serverVersion is an empty object; the conflict
 *     exists so the participant can decide whether to re-create or drop
 *     their edits.
 */
export interface SyncConflict {
	id: string;
	collection: string;
	recordId: string;
	instanceId: string;
	type?: 'modified-vs-modified' | 'modified-vs-deleted';
	localVersion: Record<string, unknown>;
	serverVersion: Record<string, unknown>;
	localModifiedBy: string;
	detectedAt: string;
	status: 'pending' | 'resolved';
	resolvedAt?: string;
}

/**
 * Generic cached record - can hold any collection's data
 */
export interface CachedRecord {
	_key: string; // compound key: `${collection}/${id}`
	_collection: string; // collection name
	_status: 'unchanged' | 'new' | 'modified' | 'deleted';
	_serverUpdated?: string; // server's `updated` timestamp at last pull (for conflict detection)
	// Per-field pre-edit baseline for modified records. Keys are the fields
	// the participant has locally overwritten; values are the server-side
	// values those fields held at the moment of the first local edit. The
	// sync push uses this to distinguish "server hasn't touched this field
	// since we started editing it" (safe to push) from "server has moved on"
	// (real conflict). Only fields present in this map are conflict-relevant
	// for the push -- an unrelated field drift on the same row no longer
	// demotes the push to a conflict.
	_baseline?: Record<string, unknown>;
	_syncingAt?: number; // timestamp when push started (prevents duplicate submissions)
	_error?: string;
	_retryCount?: number;
	id: string;
	[key: string]: unknown; // actual record data
}

/**
 * Cached map tile
 * Key format: "{layerId}/{z}/{x}/{y}" to support multiple tile layers
 */
export interface CachedTile {
	key: string; // "{layerId}/{z}/{x}/{y}"
	layerId: string; // map_layers.id
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

	// Map tile cache (supports multiple tile layers)
	tiles: {
		key: string; // "{layerId}/{z}/{x}/{y}"
		value: CachedTile;
		indexes: {
			by_layer: string;
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

	// Cached file blobs for offline file/image support (v6, resolution added v7)
	files: {
		key: string; // "{collection}/{recordId}/{fieldName}/{fileName}"
		value: CachedFile;
		indexes: {
			by_collection: string;
			by_record: string; // recordId
			by_source: 'downloaded' | 'local';
			by_resolution: 'original' | 'thumbnail';
		};
	};

	// Sync metadata per collection - last sync timestamp for delta sync (v7)
	sync_metadata: {
		key: string; // collection name
		value: SyncMetadata;
	};

	// Conflict store for server-wins resolution (v7)
	conflicts: {
		key: string; // conflict ID
		value: SyncConflict;
		indexes: {
			by_instance: string;
			by_status: 'pending' | 'resolved';
		};
	};
}

// Legacy (pre-namespacing) database name. Still referenced by `deleteLegacyDb()`
// so upgrades can remove the old global DB on first boot after this change.
const LEGACY_DB_NAME = 'participant-state';
const DB_NAME_PREFIX = 'participant-state__';
const DB_VERSION = 10;

function participantDbName(participantId: string): string {
	return `${DB_NAME_PREFIX}${participantId}`;
}

// The participant whose IndexedDB is currently active. All IDB reads/writes
// go through the DB named after this id. Switching participants is "open a
// different database", not "wipe the shared one" -- physical isolation.
let activeParticipantId: string | null = null;

// Promise-based singleton for the *currently active* DB. Changing the active
// participant closes this and forces the next getDB() to re-open the new one.
let dbPromise: Promise<IDBPDatabase<ParticipantStateDB>> | null = null;

// Listeners notified whenever the active participant changes. The gateway
// module subscribes to reset its module-scoped collection-name cache, which
// would otherwise bleed collection names from the previous DB into the new
// one.
type ParticipantSwitchListener = (newId: string | null) => void;
const participantSwitchListeners = new Set<ParticipantSwitchListener>();

export function onParticipantSwitch(listener: ParticipantSwitchListener): () => void {
	participantSwitchListeners.add(listener);
	return () => participantSwitchListeners.delete(listener);
}

/**
 * Point the IndexedDB layer at a specific participant's database. Idempotent
 * when called with the same id. Drops the cached handle so the next getDB()
 * call opens a fresh connection to the right DB -- but does NOT synchronously
 * close the old handle. Synchronous close races with in-flight transactions
 * in live queries (they call getDB() then db.get() on the next microtask,
 * and closing mid-await throws "database connection is closing"). Consumers
 * that are still mid-query keep their reference to the old handle; it will
 * be closed when they release it and the garbage collector runs.
 *
 * No-op on the server. `activeParticipantId` is module-level state and
 * IndexedDB doesn't exist on the server anyway, so keeping it untouched
 * during SSR avoids cross-request leakage.
 */
export function setActiveParticipant(participantId: string | null): void {
	if (typeof window === 'undefined') return;
	if (activeParticipantId === participantId) return;
	// Drop the pointer. The old Promise/IDBPDatabase remains alive for
	// consumers that already awaited it; they'll finish their work and
	// release the handle. Next getDB() call opens a fresh connection to
	// the new participant's DB.
	dbPromise = null;
	activeParticipantId = participantId;
	for (const listener of participantSwitchListeners) {
		try { listener(participantId); } catch (e) { console.error('Participant switch listener error:', e); }
	}
}

export function getActiveParticipantId(): string | null {
	return activeParticipantId;
}

/**
 * Schema upgrade logic -- shared between primary open and recovery retry.
 */
function upgradeSchema(
	db: IDBPDatabase<ParticipantStateDB>,
	oldVersion: number,
	upgradeTransaction?: IDBTransaction | ReturnType<IDBPDatabase<ParticipantStateDB>['transaction']>
): void {
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

	// Map tile cache (v4, index renamed v8) - supports multiple tile layers
	if (!db.objectStoreNames.contains('tiles')) {
		const store = db.createObjectStore('tiles', { keyPath: 'key' });
		store.createIndex('by_layer', 'layerId');
		store.createIndex('by_zoom', 'z');
	}

	// v8: rename by_source index to by_layer (sourceId -> layerId)
	if (oldVersion >= 4 && oldVersion < 8 && db.objectStoreNames.contains('tiles')) {
		// Can't rename indexes in-place; delete and recreate the tiles store
		db.deleteObjectStore('tiles');
		const store = db.createObjectStore('tiles', { keyPath: 'key' });
		store.createIndex('by_layer', 'layerId');
		store.createIndex('by_zoom', 'z');
	}

	// Downloaded packages store (v5) - tracks offline tile packages
	if (!db.objectStoreNames.contains('packages')) {
		const store = db.createObjectStore('packages', { keyPath: 'id' });
		store.createIndex('by_project', 'projectId');
		store.createIndex('by_status', 'status');
	}

	// Cached file blobs store (v6, resolution index added v7)
	if (!db.objectStoreNames.contains('files')) {
		const store = db.createObjectStore('files', { keyPath: 'key' });
		store.createIndex('by_collection', 'collection');
		store.createIndex('by_record', 'recordId');
		store.createIndex('by_source', 'source');
		store.createIndex('by_resolution', 'resolution');
	}

	// Sync metadata store (v7) - tracks last sync timestamp per collection
	if (!db.objectStoreNames.contains('sync_metadata')) {
		db.createObjectStore('sync_metadata', { keyPath: 'collection' });
	}

	// Conflicts store (v7) - server-wins conflict records for participant review
	if (!db.objectStoreNames.contains('conflicts')) {
		const store = db.createObjectStore('conflicts', { keyPath: 'id' });
		store.createIndex('by_instance', 'instanceId');
		store.createIndex('by_status', 'status');
	}

	// v9 / v10: workflow_instances shape changed -- `location` was replaced by
	// `geometry` + `centroid` + `bbox`. v9 purged cached workflow_instances
	// rows but left child `workflow_instance_field_values` + `_tool_usage`
	// records pointing at parent IDs that will never sync, so the queued
	// child pushes fail with 400. v10 does a full family sweep:
	//   - drop cached rows for all three collections
	//   - clear their sync_metadata cursors (forces a clean refetch)
	//   - drop queued operation_log entries for those collections
	//
	// App is under construction, so this re-download cost is accepted.
	if (oldVersion >= 3 && oldVersion < 10 && upgradeTransaction) {
		try {
			const tx = upgradeTransaction as unknown as IDBTransaction;
			const staleCollections = [
				'workflow_instances',
				'workflow_instance_field_values',
				'workflow_instance_tool_usage'
			];

			// Purge records by collection via the `by_collection` index.
			const recordsStore = tx.objectStore('records');
			const collectionIdx = recordsStore.index('by_collection');
			for (const name of staleCollections) {
				const cursorReq = collectionIdx.openCursor(IDBKeyRange.only(name));
				cursorReq.onsuccess = () => {
					const cursor = cursorReq.result;
					if (cursor) {
						cursor.delete();
						cursor.continue();
					}
				};
			}

			// Clear the sync cursor so the next poll pulls these collections
			// fresh from the server.
			const syncMeta = tx.objectStore('sync_metadata');
			for (const name of staleCollections) {
				syncMeta.delete(name);
			}

			// Purge any queued operation_log entries for these collections --
			// they reference the now-gone records and would fail to replay.
			if (tx.objectStoreNames.contains('operation_log')) {
				const opLog = tx.objectStore('operation_log');
				if (opLog.indexNames.contains('by-collection')) {
					const byCollection = opLog.index('by-collection');
					for (const name of staleCollections) {
						const req = byCollection.openCursor(IDBKeyRange.only(name));
						req.onsuccess = () => {
							const cursor = req.result;
							if (cursor) {
								cursor.delete();
								cursor.continue();
							}
						};
					}
				}
			}
		} catch (err) {
			console.warn('[DB v10] Failed to purge stale workflow_instance family:', err);
		}
	}
}

/**
 * Internal: open the database with full error handling and recovery.
 */
async function doOpenDB(): Promise<IDBPDatabase<ParticipantStateDB>> {
	if (!activeParticipantId) {
		throw new Error(
			'No active participant. Call setActiveParticipant(id) before getDB().'
		);
	}
	const dbName = participantDbName(activeParticipantId);
	try {
		return await openDB<ParticipantStateDB>(dbName, DB_VERSION, {
			upgrade(db, oldVersion, _newVersion, transaction) {
				upgradeSchema(db, oldVersion, transaction);
			},
			blocked(currentVersion, blockedVersion) {
				// Another connection (old tab/SW) is preventing our upgrade.
				console.warn(
					`IndexedDB upgrade blocked (v${currentVersion} -> v${blockedVersion}). Waiting for other connections to close.`
				);
			},
			blocking(_currentVersion, _blockedVersion, _event) {
				// Our connection is blocking someone else's upgrade. We do NOT
				// close synchronously here: closing kills every in-flight
				// transaction on this handle and throws "The database
				// connection is closing" errors into live queries. The other
				// connection will just have to wait until our handle is
				// naturally released (tab close/reload).
				console.warn('IndexedDB blocking another connection upgrade. Ignoring.');
			},
			terminated() {
				// Browser closed our connection unexpectedly (e.g., storage pressure).
				// Clear the singleton so the next access re-opens.
				console.warn('IndexedDB connection terminated by browser.');
				dbPromise = null;
			}
		});
	} catch (error) {
		// DB open failed (corrupted, quota, schema mismatch, etc.).
		// Recovery: delete the database and retry once.
		console.error('IndexedDB open failed, attempting recovery:', error);
		dbPromise = null;

		await new Promise<void>((resolve, reject) => {
			const req = indexedDB.deleteDatabase(dbName);
			req.onsuccess = () => resolve();
			req.onerror = () => reject(req.error);
		});

		// Retry with a fresh database (non-recursive: calls openDB directly).
		return await openDB<ParticipantStateDB>(dbName, DB_VERSION, {
			upgrade(db, oldVersion, _newVersion, transaction) {
				upgradeSchema(db, oldVersion, transaction);
			}
		});
	}
}

/**
 * Initialize and open the IndexedDB database.
 * Safe to call concurrently -- all callers share a single openDB() call.
 */
export function initDB(): Promise<IDBPDatabase<ParticipantStateDB>> {
	if (!dbPromise) {
		dbPromise = doOpenDB();
	}
	return dbPromise;
}

/**
 * Get the database instance (initialize if needed)
 */
export function getDB(): Promise<IDBPDatabase<ParticipantStateDB>> {
	return initDB();
}

/**
 * Close the database connection
 */
export function closeDB(): void {
	if (dbPromise) {
		dbPromise.then((db) => db.close()).catch(() => {});
		dbPromise = null;
	}
}

/**
 * Clear all synced records and sync metadata (for session reset on re-auth).
 * Preserves local-only records (new/modified) and tiles/packages.
 */
export async function clearSyncedData(): Promise<void> {
	const db = await getDB();
	const tx = db.transaction(['records', 'sync_metadata', 'conflicts'], 'readwrite');

	// Delete all records that are 'unchanged' (server-synced, no local edits)
	const recordStore = tx.objectStore('records');
	let cursor = await recordStore.openCursor();
	while (cursor) {
		if (cursor.value._status === 'unchanged') {
			await cursor.delete();
		}
		cursor = await cursor.continue();
	}

	// Clear sync timestamps so next sync does a full pull
	await tx.objectStore('sync_metadata').clear();
	await tx.objectStore('conflicts').clear();

	await tx.done;
}

/**
 * Delete the currently active participant's database. Closes the handle
 * first so the delete isn't blocked by our own open connection.
 */
export async function deleteDatabase(): Promise<void> {
	const id = activeParticipantId;
	if (!id) return;
	closeDB();
	await deleteParticipantDb(id);
}

/**
 * Delete a specific participant's IndexedDB by id.
 */
export async function deleteParticipantDb(participantId: string): Promise<void> {
	const name = participantDbName(participantId);
	await new Promise<void>((resolve, reject) => {
		const request = indexedDB.deleteDatabase(name);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
		// `blocked` fires if another tab still has the DB open; the delete
		// will complete once that tab closes. Don't block here -- just resolve
		// so we don't hang the logout flow.
		request.onblocked = () => resolve();
	});
}

/**
 * List all participant-scoped IndexedDB database names currently on this
 * origin. Uses `indexedDB.databases()` where available; returns an empty
 * list on browsers that don't support it (Firefox < 126, Safari < 17).
 * Callers should treat an empty result as "unknown, don't try to prune".
 */
export async function listParticipantDbs(): Promise<string[]> {
	if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') {
		return [];
	}
	try {
		const dbs = await indexedDB.databases();
		return dbs
			.map((d) => d.name)
			.filter((n): n is string => typeof n === 'string' && n.startsWith(DB_NAME_PREFIX));
	} catch {
		return [];
	}
}

/**
 * Delete every participant-scoped DB on this origin except `keepParticipantId`.
 * Called on successful login to bound storage usage without relying on
 * explicit logout. No-op if `indexedDB.databases()` isn't supported.
 */
export async function pruneOtherParticipantDbs(keepParticipantId: string): Promise<void> {
	const keep = participantDbName(keepParticipantId);
	const names = await listParticipantDbs();
	await Promise.all(
		names
			.filter((n) => n !== keep)
			.map((n) => new Promise<void>((resolve) => {
				const req = indexedDB.deleteDatabase(n);
				req.onsuccess = () => resolve();
				req.onerror = () => resolve();
				req.onblocked = () => resolve();
			}))
	);
}

/**
 * One-shot cleanup: delete the legacy pre-namespacing `participant-state`
 * database if it still exists. Safe to call repeatedly; the delete is a
 * no-op if the DB isn't present.
 */
export async function deleteLegacyDb(): Promise<void> {
	if (typeof indexedDB === 'undefined') return;
	await new Promise<void>((resolve) => {
		const req = indexedDB.deleteDatabase(LEGACY_DB_NAME);
		req.onsuccess = () => resolve();
		req.onerror = () => resolve();
		req.onblocked = () => resolve();
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
 * Storage statistics with per-store item counts and overall quota usage.
 */
export interface StorageStats {
	quota: number;
	usage: number;
	percentUsed: number;
	persistent: boolean;
	counts: {
		records: number;
		tiles: number;
		files: number;
		operations: number;
		conflicts: number;
	};
}

/**
 * Get storage statistics: overall quota usage + per-store item counts.
 * All operations are fast (count() is O(1) in IndexedDB, estimate() is instant).
 */
export async function getStorageStats(): Promise<StorageStats> {
	const [quota, persistent, db] = await Promise.all([
		checkStorageQuota(),
		isStoragePersistent(),
		getDB()
	]);

	const [records, tiles, files, operations, conflicts] = await Promise.all([
		db.count('records'),
		db.count('tiles'),
		db.count('files'),
		db.count('operation_log'),
		db.count('conflicts')
	]);

	return {
		quota: quota.quota,
		usage: quota.usage,
		percentUsed: quota.percentUsed,
		persistent,
		counts: { records, tiles, files, operations, conflicts }
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
