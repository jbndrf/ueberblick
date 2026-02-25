/**
 * Sync Engine for Local-First Architecture
 *
 * - Background sync loop: push local changes, pull remote changes
 * - Incremental pull: only fetch records changed since last sync
 * - Conflict detection: server wins, conflicts stored for participant review
 * - Exponential backoff on failure
 */

import { getPocketBase } from '$lib/pocketbase';
import { getDB, type CachedRecord, type SyncConflict } from './db';
import { getFilesForRecord, deleteLocalFilesForRecord, deleteFilesForRecord } from './file-cache';
import { notifyDataChange, onDataChange } from './gateway.svelte';
import type { ParticipantGateway } from './gateway.svelte';
import type { SyncProgress } from './types';
import { generateId, cleanRecord } from './utils';

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
// Sync Loop Configuration
// =============================================================================

const BASE_INTERVAL_MS = 30_000; // 30 seconds
const MAX_INTERVAL_MS = 120_000; // 2 minutes
const PUSH_DEBOUNCE_MS = 5_000; // 5 seconds after local write

let syncLoopTimer: ReturnType<typeof setTimeout> | null = null;
let currentInterval = BASE_INTERVAL_MS;
let syncInProgress = false;
let pushDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let syncCycleCount = 0;

// Collections to sync (set during startSyncLoop)
let syncCollections: string[] = [];

// =============================================================================
// Collection Sync Priority
// =============================================================================

const SYNC_PRIORITY: Record<string, number> = {
	workflow_instances: 10,
	workflow_instance_tool_usage: 20,
	workflow_instance_field_values: 30
};

function getSyncPriority(collection: string): number {
	return SYNC_PRIORITY[collection] ?? 50;
}

// =============================================================================
// Incremental Pull (Delta Sync)
// =============================================================================

/**
 * Pull changes from server for a single collection since last sync.
 * Only fetches records with `updated > lastSyncTimestamp`.
 */
async function pullChanges(collection: string): Promise<number> {
	const pb = getPocketBase();
	const db = await getDB();

	// Read last sync timestamp
	const meta = await db.get('sync_metadata', collection);
	const lastSync = meta?.lastSyncTimestamp;

	let filter: string | undefined;
	if (lastSync) {
		filter = `updated > "${lastSync}"`;
	}

	try {
		const records = await pb.collection(collection).getFullList({
			filter,
			sort: 'updated'
		});

		let updatedCount = 0;
		let latestTimestamp = lastSync || '';

		for (const record of records) {
			const key = `${collection}/${record.id}`;
			const existing = await db.get('records', key);

			// Don't overwrite local modifications
			if (existing && existing._status !== 'unchanged') continue;

			// Skip if data hasn't actually changed
			if (existing && existing.updated === record.updated) continue;

			const cached: CachedRecord = {
				...record,
				_key: key,
				_collection: collection,
				_status: 'unchanged',
				_serverUpdated: record.updated as string
			};
			await db.put('records', cached);
			updatedCount++;

			// Track latest timestamp
			if ((record.updated as string) > latestTimestamp) {
				latestTimestamp = record.updated as string;
			}
		}

		// Update sync timestamp
		if (latestTimestamp) {
			await db.put('sync_metadata', {
				collection,
				lastSyncTimestamp: latestTimestamp
			});
		}

		return updatedCount;
	} catch (e) {
		// Collection might not be accessible - skip silently
		console.debug(`Pull failed for ${collection}:`, e);
		return 0;
	}
}

/**
 * Detect records deleted on server by comparing local IDs with server IDs.
 * Only runs every Nth sync cycle to reduce load.
 */
async function detectServerDeletions(collection: string): Promise<number> {
	const pb = getPocketBase();
	const db = await getDB();

	try {
		// Get all server record IDs
		const serverRecords = await pb.collection(collection).getFullList({
			fields: 'id'
		});
		const serverIds = new Set(serverRecords.map((r) => r.id));

		// Get all local unchanged records for this collection
		const localRecords = await db.getAllFromIndex('records', 'by_collection', collection);
		const toDelete = localRecords.filter(
			(r) => r._status === 'unchanged' && !serverIds.has(r.id)
		);

		for (const record of toDelete) {
			await db.delete('records', record._key);
		}

		return toDelete.length;
	} catch (e) {
		console.debug(`Deletion detection failed for ${collection}:`, e);
		return 0;
	}
}

// =============================================================================
// Upload Changes (Push)
// =============================================================================

/**
 * Push all pending changes from IndexedDB to PocketBase.
 * Includes conflict detection: if server has changed since our last pull,
 * server wins and the conflict is stored for participant review.
 */
export async function uploadChanges(gateway: ParticipantGateway): Promise<void> {
	const pb = getPocketBase();
	const db = await getDB();

	// Get all pending records (new, modified, deleted)
	const allRecords = await db.getAll('records');
	const pending = allRecords
		.filter((r) => ['new', 'modified', 'deleted'].includes(r._status))
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
			const data = cleanRecord(record);

			if (record._status === 'modified') {
				// --- Conflict Detection ---
				// Fetch the server's current version to check for conflicts
				try {
					const serverRecord = await pb.collection(collection).getOne(id);

					if (
						record._serverUpdated &&
						serverRecord.updated !== record._serverUpdated
					) {
						// Server was modified by someone else since our last pull.
						// Server wins: store conflict for participant review.
						await storeConflict(record, serverRecord, gateway.participantId);

						// Accept server version
						const merged: CachedRecord = {
							...serverRecord,
							_key: record._key,
							_collection: collection,
							_status: 'unchanged',
							_serverUpdated: serverRecord.updated as string
						};
						await db.put('records', merged);
						syncProgress.completed++;
						continue;
					}
				} catch (e) {
					// If we can't fetch (e.g. 404 = deleted on server), continue with update
					// which will fail and be handled below
				}
			}

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

				let serverResult: Record<string, unknown>;
				if (record._status === 'new') {
					serverResult = await pb.collection(collection).create(syncData);
					console.log(`Created ${collection}/${id}`);
				} else {
					serverResult = await pb.collection(collection).update(id, syncData);
					console.log(`Updated ${collection}/${id}`);
				}

				// Clean up local file blobs after successful sync (downloaded ones stay)
				if (localFiles.length > 0) {
					await deleteLocalFilesForRecord(id);
				}

				// Update local record with server response (gets server-assigned timestamps)
				const synced: CachedRecord = {
					...serverResult,
					id: serverResult.id as string,
					_key: record._key,
					_collection: collection,
					_status: 'unchanged',
					_serverUpdated: serverResult.updated as string,
					_error: undefined,
					_retryCount: undefined
				};
				await db.put('records', synced);
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
				// Remove from local store
				await db.delete('records', record._key);
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

	// Refresh gateway pending count
	await gateway.updatePendingCount();

	console.log(
		`Push complete: ${syncProgress.completed} succeeded, ${syncProgress.failed} failed`
	);
}

// =============================================================================
// Conflict Storage
// =============================================================================

async function storeConflict(
	localRecord: CachedRecord,
	serverRecord: Record<string, unknown>,
	participantId: string
): Promise<void> {
	const db = await getDB();

	// Strip internal fields from local version
	const localData = cleanRecord(localRecord);

	// Determine the parent workflow instance ID
	// Field values and tool_usage have instance_id, workflow_instances are their own instance
	const instanceId =
		(localRecord.instance_id as string) ||
		(localRecord._collection === 'workflow_instances' ? localRecord.id : '');

	const conflict: SyncConflict = {
		id: generateId(),
		collection: localRecord._collection,
		recordId: localRecord.id,
		instanceId,
		localVersion: localData,
		serverVersion: serverRecord as Record<string, unknown>,
		localModifiedBy: participantId,
		detectedAt: new Date().toISOString(),
		status: 'pending'
	};

	await db.put('conflicts', conflict);
	console.log(`Conflict stored for ${localRecord._collection}/${localRecord.id}`);
}

/**
 * Get pending conflicts for a specific workflow instance.
 */
export async function getConflictsForInstance(instanceId: string): Promise<SyncConflict[]> {
	const db = await getDB();
	const all = await db.getAllFromIndex('conflicts', 'by_instance', instanceId);
	return all.filter((c) => c.status === 'pending');
}

/**
 * Get all pending conflicts.
 */
export async function getPendingConflicts(): Promise<SyncConflict[]> {
	const db = await getDB();
	return db.getAllFromIndex('conflicts', 'by_status', 'pending');
}

/**
 * Mark a conflict as resolved.
 */
export async function resolveConflict(conflictId: string): Promise<void> {
	const db = await getDB();
	const conflict = await db.get('conflicts', conflictId);
	if (conflict) {
		conflict.status = 'resolved';
		conflict.resolvedAt = new Date().toISOString();
		await db.put('conflicts', conflict);
	}
}

// =============================================================================
// Full Sync Cycle (Push + Pull)
// =============================================================================

/**
 * Run a full sync cycle: push local changes, then pull remote changes.
 */
async function runSyncCycle(gateway: ParticipantGateway): Promise<void> {
	if (syncInProgress || !navigator.onLine) return;

	syncInProgress = true;
	syncCycleCount++;

	try {
		// 1. Push local changes to server
		await uploadChanges(gateway);

		// 2. Pull remote changes per collection
		let totalPulled = 0;
		const changedCollections: string[] = [];
		for (const collection of syncCollections) {
			const count = await pullChanges(collection);
			if (count > 0) changedCollections.push(collection);
			totalPulled += count;
		}

		if (totalPulled > 0) {
			console.log(`Pulled ${totalPulled} changed records`);
			// Notify UI that data changed so map markers etc. update
			for (const collection of changedCollections) {
				notifyDataChange(collection);
			}
		}

		// 3. Every 10th cycle, do full deletion detection
		if (syncCycleCount % 10 === 0) {
			let totalDeleted = 0;
			for (const collection of syncCollections) {
				const count = await detectServerDeletions(collection);
				totalDeleted += count;
			}
			if (totalDeleted > 0) {
				console.log(`Detected ${totalDeleted} server-side deletions`);
			}
		}

		// Success: reset backoff
		currentInterval = BASE_INTERVAL_MS;
	} catch (error) {
		console.error('Sync cycle failed:', error);
		// Increase backoff interval
		currentInterval = Math.min(currentInterval * 2, MAX_INTERVAL_MS);
	} finally {
		syncInProgress = false;
	}
}

// =============================================================================
// Sync Loop Management
// =============================================================================

/**
 * Start the background sync loop.
 * Call this once during gateway initialization.
 */
export function startSyncLoop(
	gateway: ParticipantGateway,
	collections: string[]
): () => void {
	syncCollections = collections;
	currentInterval = BASE_INTERVAL_MS;
	syncCycleCount = 0;

	function scheduleNext() {
		syncLoopTimer = setTimeout(async () => {
			await runSyncCycle(gateway);
			scheduleNext();
		}, currentInterval);
	}

	// Start the loop
	scheduleNext();

	// Listen for online events to trigger immediate sync
	const handleOnline = () => {
		console.log('Network restored, triggering immediate sync');
		// Cancel scheduled sync and run immediately
		if (syncLoopTimer) clearTimeout(syncLoopTimer);
		runSyncCycle(gateway).then(scheduleNext);
	};

	window.addEventListener('online', handleOnline);

	// Listen for local writes to trigger push within 5 seconds
	const unsubDataChange = onDataChange(() => {
		if (pushDebounceTimer) clearTimeout(pushDebounceTimer);
		pushDebounceTimer = setTimeout(() => {
			if (navigator.onLine && !syncInProgress) {
				uploadChanges(gateway);
			}
		}, PUSH_DEBOUNCE_MS);
	});

	// Return cleanup function
	return () => {
		if (syncLoopTimer) {
			clearTimeout(syncLoopTimer);
			syncLoopTimer = null;
		}
		if (pushDebounceTimer) {
			clearTimeout(pushDebounceTimer);
			pushDebounceTimer = null;
		}
		window.removeEventListener('online', handleOnline);
		unsubDataChange();
	};
}

/**
 * Trigger a full resync (for manual "Sync Now" button).
 * Pushes local changes, resets sync timestamps so all data is re-pulled,
 * and runs deletion detection to remove records the participant can no
 * longer access.
 */
export async function triggerSync(gateway: ParticipantGateway): Promise<boolean> {
	if (!navigator.onLine) {
		return false;
	}

	if (syncInProgress) return false;
	syncInProgress = true;

	try {
		// 1. Push local changes to server
		await uploadChanges(gateway);

		// 2. Clear sync timestamps so pullChanges fetches everything
		const db = await getDB();
		const allMeta = await db.getAll('sync_metadata');
		for (const meta of allMeta) {
			await db.delete('sync_metadata', meta.collection);
		}

		// 3. Pull all records (full pull since timestamps are cleared)
		let totalPulled = 0;
		for (const collection of syncCollections) {
			const count = await pullChanges(collection);
			totalPulled += count;
		}
		if (totalPulled > 0) {
			console.log(`Full resync pulled ${totalPulled} records`);
		}

		// 4. Always detect deletions (removes records no longer accessible)
		let totalDeleted = 0;
		for (const collection of syncCollections) {
			const count = await detectServerDeletions(collection);
			totalDeleted += count;
		}
		if (totalDeleted > 0) {
			console.log(`Full resync removed ${totalDeleted} records no longer on server`);
		}

		currentInterval = BASE_INTERVAL_MS;
	} catch (error) {
		console.error('Full resync failed:', error);
		currentInterval = Math.min(currentInterval * 2, MAX_INTERVAL_MS);
	} finally {
		syncInProgress = false;
	}

	return true;
}

// =============================================================================
// Initial Data Load (first sync after login)
// =============================================================================

/**
 * Download all collections into IndexedDB for first-time data population.
 * After this, incremental sync takes over.
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
			const records = await pb.collection(name).getFullList();

			let latestTimestamp = '';

			for (const record of records) {
				const cached: CachedRecord = {
					...record,
					_key: `${name}/${record.id}`,
					_collection: name,
					_status: 'unchanged',
					_serverUpdated: record.updated as string
				};
				await db.put('records', cached);

				if ((record.updated as string) > latestTimestamp) {
					latestTimestamp = record.updated as string;
				}
			}

			// Set initial sync timestamp
			if (latestTimestamp) {
				await db.put('sync_metadata', {
					collection: name,
					lastSyncTimestamp: latestTimestamp
				});
			}

			totalRecords += records.length;
			syncProgress.completed++;
			console.log(`Downloaded ${records.length} records from ${name}`);
		} catch (e) {
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
// Legacy Compat (kept for tools-menu)
// =============================================================================

export function enableAutoSync(gateway: ParticipantGateway): () => void {
	// In the new architecture, sync is always running via startSyncLoop.
	// This is a no-op shim for backward compatibility.
	return () => {};
}
