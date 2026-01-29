/**
 * Sync Engine for Participant Gateway
 *
 * - downloadAll(): Download all collections into IndexedDB (for going offline)
 * - uploadChanges(): Push pending changes to PocketBase (for going online)
 *
 * Works with the generic 'records' store - any collection is supported.
 */

import { getPocketBase } from '$lib/pocketbase';
import { getDB, type CachedRecord } from './db';
import { getFilesForRecord, deleteLocalFilesForRecord, deleteFilesForRecord } from './file-cache';
import type { ParticipantGateway } from './gateway.svelte';
import type { SyncProgress } from './types';

// =============================================================================
// Sync Progress State
// =============================================================================

let syncProgress = $state<SyncProgress>({
	status: 'idle',
	total: 0,
	completed: 0,
	failed: 0
});

export function getSyncProgress(): SyncProgress {
	return syncProgress;
}

// =============================================================================
// Download All (for going offline)
// =============================================================================

/**
 * Download all collections into IndexedDB.
 * Collection names are provided by the backend (via admin auth).
 * Each download uses participant auth - PocketBase rules filter to accessible data.
 */
export async function downloadAll(
	gateway: ParticipantGateway,
	collectionNames: string[]
): Promise<void> {
	const pb = getPocketBase();
	const db = await getDB();

	syncProgress = {
		status: 'syncing',
		total: collectionNames.length,
		completed: 0,
		failed: 0
	};

	let totalRecords = 0;

	for (const name of collectionNames) {
		try {
			// Download all records (participant auth filters to what they can see)
			const records = await pb.collection(name).getFullList();

			// Store each record in the generic store
			for (const record of records) {
				const cached: CachedRecord = {
					...record,
					_key: `${name}/${record.id}`,
					_collection: name,
					_status: 'unchanged'
				};
				await db.put('records', cached);
			}

			totalRecords += records.length;
			syncProgress.completed++;
			console.log(`Downloaded ${records.length} records from ${name}`);
		} catch (e) {
			// Collection might not be accessible to this participant - skip
			console.log(`Skipped ${name}: ${e instanceof Error ? e.message : 'Unknown error'}`);
			syncProgress.completed++;
		}
	}

	syncProgress = {
		status: 'completed',
		total: collectionNames.length,
		completed: collectionNames.length,
		failed: 0,
		lastSyncAt: new Date().toISOString()
	};

	console.log(`Downloaded ${totalRecords} total records from ${collectionNames.length} collections`);
}

// =============================================================================
// Upload Changes (for going online)
// =============================================================================

/**
 * Collection sync priority for dependency ordering.
 * Lower numbers sync first. Collections not listed get priority 50.
 *
 * Order matters when records have relations:
 * - workflow_instance_tool_usage must exist before field_values reference it
 * - workflow_instances must exist before tool_usage references them
 */
const SYNC_PRIORITY: Record<string, number> = {
	// Core entities first
	workflow_instances: 10,
	// Tool usage before field values (field values reference tool usage via last_modified_by_action)
	workflow_instance_tool_usage: 20,
	// Field values last (they reference tool usage)
	workflow_instance_field_values: 30
};

function getSyncPriority(collection: string): number {
	return SYNC_PRIORITY[collection] ?? 50;
}

/**
 * Push all pending changes from IndexedDB to PocketBase.
 * Reads from the generic 'records' store and syncs by status.
 *
 * Records are sorted by collection priority to ensure dependencies are synced first.
 */
export async function uploadChanges(gateway: ParticipantGateway): Promise<void> {
	const pb = getPocketBase();
	const db = await getDB();

	// Get all pending records (new, modified, deleted)
	const allRecords = await db.getAll('records');
	const pending = allRecords
		.filter((r) => ['new', 'modified', 'deleted'].includes(r._status))
		// Sort by collection priority (lower = sync first)
		.sort((a, b) => getSyncPriority(a._collection) - getSyncPriority(b._collection));

	if (pending.length === 0) {
		return;
	}

	syncProgress = {
		status: 'syncing',
		total: pending.length,
		completed: 0,
		failed: 0
	};

	for (const record of pending) {
		try {
			const collection = record._collection;
			const id = record.id;

			// Prepare data for sync (remove local metadata)
			const { _key, _collection, _status, _error, _retryCount, ...data } = record;

			if (record._status === 'new' || record._status === 'modified') {
				// Check for associated file blobs that need to be uploaded
				const localFiles = (await getFilesForRecord(id)).filter((f) => f.source === 'local');

				let syncData: Record<string, unknown> | FormData = data;

				if (localFiles.length > 0) {
					// Reconstruct FormData with file blobs
					const formData = new FormData();
					for (const [key, value] of Object.entries(data)) {
						if (value !== null && value !== undefined) {
							formData.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
						}
					}
					// Attach file blobs
					for (const cachedFile of localFiles) {
						const file = new File([cachedFile.blob], cachedFile.fileName, {
							type: cachedFile.mimeType
						});
						formData.append(cachedFile.fieldName, file);
					}
					syncData = formData;
				}

				if (record._status === 'new') {
					await pb.collection(collection).create(syncData);
					console.log(`Created ${collection}/${id}`);
				} else {
					await pb.collection(collection).update(id, syncData);
					console.log(`Updated ${collection}/${id}`);
				}

				// Clean up local file blobs after successful sync (downloaded ones stay)
				if (localFiles.length > 0) {
					await deleteLocalFilesForRecord(id);
				}
			} else if (record._status === 'deleted') {
				// Delete from PocketBase
				try {
					await pb.collection(collection).delete(id);
					console.log(`Deleted ${collection}/${id}`);
				} catch (e) {
					// If 404, already deleted - that's fine
					if (!(e instanceof Error && e.message.includes('404'))) {
						throw e;
					}
				}
				// Clean up all file blobs for deleted records
				await deleteFilesForRecord(id);
			}

			// Mark as synced or remove
			if (record._status === 'deleted') {
				await db.delete('records', record._key);
			} else {
				const synced: CachedRecord = {
					...record,
					_status: 'unchanged',
					_error: undefined,
					_retryCount: undefined
				};
				await db.put('records', synced);
			}

			syncProgress.completed++;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			console.error(`Failed to sync ${record._collection}/${record.id}:`, errorMessage);

			// Mark as error
			const failed: CachedRecord = {
				...record,
				_status: record._status, // Keep original status
				_error: errorMessage,
				_retryCount: (record._retryCount || 0) + 1
			};
			await db.put('records', failed);

			syncProgress.failed++;
			syncProgress.lastError = errorMessage;
		}
	}

	syncProgress = {
		...syncProgress,
		status: syncProgress.failed > 0 ? 'error' : 'completed',
		lastSyncAt: new Date().toISOString()
	};

	console.log(
		`Sync complete: ${syncProgress.completed} succeeded, ${syncProgress.failed} failed`
	);
}

// =============================================================================
// Auto-Sync (optional)
// =============================================================================

/**
 * Enable automatic sync when coming online
 */
export function enableAutoSync(gateway: ParticipantGateway): () => void {
	const handleOnline = () => {
		setTimeout(async () => {
			if (navigator.onLine && gateway.pendingCount > 0) {
				await uploadChanges(gateway);
			}
		}, 2000);
	};

	window.addEventListener('online', handleOnline);

	return () => {
		window.removeEventListener('online', handleOnline);
	};
}

/**
 * Manually trigger sync if online
 */
export async function triggerSync(gateway: ParticipantGateway): Promise<boolean> {
	if (!navigator.onLine) {
		return false;
	}

	await uploadChanges(gateway);
	return true;
}
