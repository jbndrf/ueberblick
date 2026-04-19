/**
 * Sync Engine for Local-First Architecture
 *
 * - Push listener: debounced upload on local writes
 * - Catch-up sync: pull + deletion detection on reconnect/focus
 * - Incremental pull: only fetch records changed since last sync
 * - Conflict detection: server wins, conflicts stored for participant review
 * - No polling loop -- realtime SSE is the primary update mechanism
 */

import { getPocketBase } from '$lib/pocketbase';
import { getDB, type CachedRecord, type SyncConflict } from './db';
import { getFilesForRecord, deleteLocalFilesForRecord, deleteFilesForRecord } from './file-cache';
import { notifyDataChange, onDataChange, getLiveCollectionNames } from './gateway.svelte';
import type { ParticipantGateway } from './gateway.svelte';
import { generateId, cleanRecord, deepEqual } from './utils';

// =============================================================================
// Configuration
// =============================================================================

const PUSH_DEBOUNCE_MS = 5_000; // 5 seconds after local write

let syncInProgress = false;
let catchUpCount = 0;

// Collections to sync (set via setSyncCollections)
let syncCollections: string[] = [];

// Reactive sync progress (visible in header as "Syncing data (5/26)")
export interface SyncProgressInfo {
	done: number;
	total: number;
}

export const syncStatus = $state<{ current: SyncProgressInfo | null }>({ current: null });

// General-purpose loading message (set by pages, read by layout header)
export const appLoadingMessage = $state<{ value: string | null }>({ value: null });

// Aggregate progress for the initial full-collection download (first login).
// Surfaced in the participant map header alongside markers/field-value progress.
export interface DownloadProgressInfo {
	loadedRecords: number;
	totalRecords: number;
	currentCollection: string | null;
}

export const downloadProgress = $state<{ current: DownloadProgressInfo | null }>({
	current: null
});

// How often to run full deletion detection (every Nth catch-up sync)
const DELETION_CHECK_INTERVAL = 5;

/**
 * Set the list of collections that sync operations work with.
 * Must be called before startPushListener/runCatchUpSync/triggerSync.
 */
export function setSyncCollections(collections: string[]): void {
	syncCollections = collections;
}

// =============================================================================
// Collection Sync Rules
// =============================================================================
//
// Declarative rules for the sync push loop. Replaces the previous
// per-collection hardcoded branches (tool_usage dedup, field_values parent
// refresh). Adding a new synced collection with a parent relationship now
// means adding one entry here instead of editing the loop.
//
// priority:    Lower number = higher priority = pushed first. Parents must
//              push before children so foreign-key references resolve.
// parentRef:   If set, after a successful push of this record, the parent
//              identified by `foreignKey` will have its _serverUpdated
//              refreshed from the server (guarded by external-writer check).
//              Needed when server-side hooks bump the parent's `updated`
//              column as a side effect of child writes.
// hookColumns: Columns on the parent that server-side hooks mutate as a
//              side effect and that the external-writer guard should
//              ignore when comparing. Defaults to ['updated', 'created'].

interface SyncRule {
	priority: number;
	parentRef?: {
		collection: string;
		foreignKey: string;
	};
	hookColumns?: string[];
}

const DEFAULT_HOOK_COLUMNS = ['updated', 'created'];
const INSTANCE_HOOK_COLUMNS = ['updated', 'created', 'last_activity_at'];

const SYNC_RULES: Record<string, SyncRule> = {
	workflow_instances: {
		priority: 10,
		hookColumns: INSTANCE_HOOK_COLUMNS
	},
	workflow_protocol_entries: {
		priority: 15
	},
	workflow_instance_tool_usage: {
		priority: 20,
		parentRef: { collection: 'workflow_instances', foreignKey: 'instance_id' }
	},
	workflow_instance_field_values: {
		priority: 30,
		parentRef: { collection: 'workflow_instances', foreignKey: 'instance_id' }
	}
};

function getSyncRule(collection: string): SyncRule {
	return SYNC_RULES[collection] ?? { priority: 50 };
}

function getSyncPriority(collection: string): number {
	return getSyncRule(collection).priority;
}

// =============================================================================
// Batched Parallel Execution
// =============================================================================

/**
 * Run an async function over items in parallel batches.
 * Returns results in the same order as the input items.
 */
async function batchedParallel<T, R>(
	items: T[],
	fn: (item: T) => Promise<R>,
	concurrency: number = 5
): Promise<PromiseSettledResult<R>[]> {
	const results: PromiseSettledResult<R>[] = [];
	for (let i = 0; i < items.length; i += concurrency) {
		const batch = items.slice(i, i + concurrency);
		const batchResults = await Promise.allSettled(batch.map(fn));
		results.push(...batchResults);
	}
	return results;
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

		// Use a single transaction for all reads + writes (10-25x faster than per-record transactions)
		const tx = db.transaction(['records', 'sync_metadata'], 'readwrite');
		const recordStore = tx.objectStore('records');

		for (const record of records) {
			const key = `${collection}/${record.id}`;
			const existing = await recordStore.get(key);

			// Don't overwrite local modifications, but update _serverUpdated
			// so conflict detection uses the latest server timestamp
			if (existing && existing._status !== 'unchanged') {
				if (record.updated && existing._serverUpdated !== (record.updated as string)) {
					existing._serverUpdated = record.updated as string;
					recordStore.put(existing);
				}
				continue;
			}

			// Skip if data hasn't actually changed
			if (existing && existing.updated === record.updated) continue;

			const cached: CachedRecord = {
				...record,
				_key: key,
				_collection: collection,
				_status: 'unchanged',
				_serverUpdated: record.updated as string
			};
			recordStore.put(cached);
			updatedCount++;

			// Track latest timestamp
			if ((record.updated as string) > latestTimestamp) {
				latestTimestamp = record.updated as string;
			}
		}

		// Update sync timestamp
		if (latestTimestamp) {
			tx.objectStore('sync_metadata').put({
				collection,
				lastSyncTimestamp: latestTimestamp
			});
		}

		await tx.done;

		return updatedCount;
	} catch (e) {
		// Collection might not be accessible - skip silently
		console.debug(`Pull failed for ${collection}:`, e);
		return 0;
	}
}

/**
 * Detect records deleted on server by comparing local IDs with server IDs.
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
	// Filter out records currently being synced (in-flight lock < 60s old)
	const SYNC_LOCK_TTL = 60_000;
	const now = Date.now();
	const allRecords = await db.getAll('records');
	const pending = allRecords
		.filter((r) => ['new', 'modified', 'deleted'].includes(r._status))
		.filter((r) => !r._syncingAt || (now - r._syncingAt) > SYNC_LOCK_TTL)
		.sort((a, b) => getSyncPriority(a._collection) - getSyncPriority(b._collection));

	if (pending.length === 0) {
		return;
	}

	let completed = 0;
	let failed = 0;

	for (const record of pending) {
		try {
			const collection = record._collection;
			const id = record.id;

			// Prepare data for sync (remove local metadata)
			const data = cleanRecord(record);

			if (record._status === 'modified') {
				// --- Conflict Detection ---
				// Fetch the server's current version to check for conflicts.
				let serverRecord: Record<string, unknown> | null = null;
				let serverFetchFailed = false;
				let serverFetchWas404 = false;

				try {
					serverRecord = await pb.collection(collection).getOne(id);
				} catch (e) {
					serverFetchFailed = true;
					const msg = e instanceof Error ? e.message : '';
					if (msg.includes('404') || (e as { status?: number } | null)?.status === 404) {
						serverFetchWas404 = true;
					}
				}

				// Pillar 4: server-side delete of a record we still want to update.
				// Store a modified-vs-deleted conflict and stop retrying.
				if (serverFetchWas404) {
					await storeDeletedConflict(record, gateway.participantId);
					const resolved: CachedRecord = {
						...record,
						_status: 'unchanged',
						_syncingAt: undefined,
						_error: undefined,
						_retryCount: undefined
					};
					await db.put('records', resolved);
					completed++;
					continue;
				}

				const serverMoved =
					!!serverRecord &&
					!!record._serverUpdated &&
					serverRecord.updated !== record._serverUpdated;

				if (serverRecord && serverMoved) {
					// Field-scoped conflict detection.
					//
					// The set of fields the participant has actually touched
					// lives in record._baseline (keys = touched fields, values
					// = server-side values at the moment of the first local
					// edit). For each touched field we classify:
					//
					//   echo    -- server already holds our intended value.
					//              Nothing to push for this field.
					//   safe    -- server still holds our pre-edit baseline.
					//              Our write can proceed without data loss.
					//   real    -- server has moved this field to a third
					//              value. This is a real conflict.
					//
					// The push is a real conflict iff at least one touched
					// field is 'real'. Unrelated drift on OTHER fields (e.g.
					// server bumped last_activity_at or an admin edited a
					// field we never touched) is ignored -- we never sent a
					// value for those fields and the partial update below
					// won't touch them either.
					//
					// If _baseline is missing (record modified by older code
					// path that didn't capture baselines), fall back to the
					// pre-existing row-level echo/divergence check so we
					// don't lose conflict detection for those records.

					const baseline = record._baseline;
					const touchedKeys = baseline
						? Object.keys(baseline)
						: Object.keys(data).filter(
							(k) => !k.startsWith('_') && k !== 'id' && k !== 'created' && k !== 'updated'
						);

					let hasFile = false;
					let hasRealConflict = false;
					let allEchoes = true;
					const safeFields: string[] = [];

					for (const key of touchedKeys) {
						const value = data[key];
						if (value instanceof File || value instanceof Blob) {
							hasFile = true;
							allEchoes = false;
							safeFields.push(key);
							continue;
						}
						if (deepEqual(serverRecord[key], value)) {
							// Echo: server already has our value for this field.
							continue;
						}
						allEchoes = false;
						if (baseline && deepEqual(serverRecord[key], baseline[key])) {
							// Server still holds the pre-edit value -- safe to push.
							safeFields.push(key);
							continue;
						}
						// Server moved this field to a third value.
						hasRealConflict = true;
						break;
					}

					if (hasRealConflict) {
						// Store for participant review and flip local to server
						// version so we don't retry.
						await storeConflict(record, serverRecord, gateway.participantId);
						const merged: CachedRecord = {
							...serverRecord,
							id: serverRecord.id as string,
							_key: record._key,
							_collection: collection,
							_status: 'unchanged',
							_serverUpdated: serverRecord.updated as string
						};
						await db.put('records', merged);
						completed++;
						continue;
					}

					if (allEchoes && !hasFile) {
						// Silent no-op reconcile: every touched field already
						// matches the server.
						const reconciled: CachedRecord = {
							...serverRecord,
							id: serverRecord.id as string,
							_key: record._key,
							_collection: collection,
							_status: 'unchanged',
							_serverUpdated: serverRecord.updated as string,
							_error: undefined,
							_retryCount: undefined,
							_syncingAt: undefined
						};
						await db.put('records', reconciled);
						console.log(`Reconciled echo ${collection}/${id}`);
						completed++;
						continue;
					}

					// Fall through to push. The unconditional baseline-based
					// narrowing below takes care of trimming `data` to the
					// fields we intended to touch. safeFields is unused from
					// here but kept in the loop above as documentation of
					// the classification.
					void safeFields;
				}

				// Fetch failed for a non-404 reason (transient network, server
				// error). Fall through to the update call; any genuine error
				// surfaces via the outer catch and the record stays pending
				// for retry. serverFetchFailed / serverRecord are now unused
				// past this point.
				void serverFetchFailed;

				// Always narrow the push body when we have a baseline, even
				// if the server hasn't drifted. Sending only the fields the
				// participant actually touched keeps the semantics honest
				// (this is a patch, not a full-row write) and avoids racing
				// concurrent writers on unrelated fields in the window
				// between the conflict check and the PATCH itself.
				if (record._baseline) {
					const baseline = record._baseline;
					const partial: Record<string, unknown> = {};
					for (const key of Object.keys(baseline)) {
						if (key in data) partial[key] = data[key];
					}
					for (const key of Object.keys(data)) delete data[key];
					Object.assign(data, partial);
				}
			}

			if (record._status === 'new' || record._status === 'modified') {
				// Mark record as in-flight to prevent duplicate submissions
				record._syncingAt = Date.now();
				await db.put('records', record);

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

				// Notify listeners so in-memory copies pick up server-assigned
				// fields (e.g. file_value gets a random suffix on upload).
				notifyDataChange(collection, id, 'update');

				// If this collection has a parent relationship where server-side
				// hooks bump parent.updated as a side effect, refresh the parent's
				// cached _serverUpdated so the next push of that parent doesn't
				// see a phantom conflict. Guarded against external writers so an
				// admin or automation edit on the parent is not silently laundered.
				const rule = getSyncRule(collection);
				if (rule.parentRef) {
					await refreshParentServerUpdated(record, rule, pb, db);
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
				// Remove from local store
				await db.delete('records', record._key);
			}

			completed++;
		} catch (error) {
			// PocketBase ClientResponseError carries the structured error bag in
			// .response.data: { fieldName: { code, message } }. The top-level
			// .message is always the useless "Failed to create record." string,
			// so pull the per-field detail out explicitly.
			const pbErr = error as {
				status?: number;
				response?: { message?: string; data?: Record<string, { message?: string }> };
				message?: string;
			};
			const fieldErrors = pbErr?.response?.data ?? {};
			const fieldSummary = Object.entries(fieldErrors)
				.map(([k, v]) => `${k}: ${v?.message ?? 'invalid'}`)
				.join('; ');
			const topMessage = pbErr?.response?.message || pbErr?.message || 'Unknown error';
			const errorMessage = fieldSummary ? `${topMessage} [${fieldSummary}]` : topMessage;

			console.error(
				`Failed to sync ${record._collection}/${record.id} ` +
					`(status=${pbErr?.status ?? 0}): ${errorMessage}`
			);

			// Mark as error, clear sync lock so it can be retried
			const failedRecord: CachedRecord = {
				...record,
				_status: record._status, // Keep original status
				_syncingAt: undefined,
				_error: errorMessage,
				_retryCount: (record._retryCount || 0) + 1
			};
			await db.put('records', failedRecord);

			failed++;
		}
	}

	// Refresh gateway pending count
	await gateway.updatePendingCount();

	console.log(`Push complete: ${completed} succeeded, ${failed} failed`);
}

// =============================================================================
// Parent-Refresh Helper (for SYNC_RULES.parentRef)
// =============================================================================

/**
 * After a child record is pushed, refresh the cached parent record's
 * _serverUpdated so the next push of the parent doesn't see the hook-driven
 * timestamp bump as a phantom conflict.
 *
 * External-writer guard: before overwriting _serverUpdated, compare every
 * directly-writable field on the parent between the cached local copy and
 * the freshly fetched server copy. If any writable field differs, an admin
 * or automation has edited the parent since the last pull -- do NOT refresh;
 * let the upcoming parent push hit the real conflict-detection path so the
 * external edit is preserved (either as a conflict or by server-wins merge).
 *
 * "Writable" means "not listed in hookColumns" -- hook-driven autodate and
 * activity bumps are the noise we are trying to filter out.
 */
async function refreshParentServerUpdated(
	childRecord: CachedRecord,
	rule: SyncRule,
	pb: ReturnType<typeof getPocketBase>,
	db: Awaited<ReturnType<typeof getDB>>
): Promise<void> {
	if (!rule.parentRef) return;

	const parentId = childRecord[rule.parentRef.foreignKey] as string | undefined;
	if (!parentId) return;

	const parentKey = `${rule.parentRef.collection}/${parentId}`;
	const cachedParent = await db.get('records', parentKey);
	if (!cachedParent) return;

	let serverParent: Record<string, unknown>;
	try {
		serverParent = await pb.collection(rule.parentRef.collection).getOne(parentId);
	} catch {
		// Parent not on server yet (still pending) or inaccessible -- nothing
		// to refresh against. Leave _serverUpdated alone.
		return;
	}

	// Compare writable fields between cached parent and server parent.
	// Skip local metadata keys (prefixed with _) and hook-mutated columns.
	const parentRule = getSyncRule(rule.parentRef.collection);
	const hookColumns = new Set(parentRule.hookColumns ?? DEFAULT_HOOK_COLUMNS);

	for (const key of Object.keys(cachedParent)) {
		if (key.startsWith('_')) continue;
		if (hookColumns.has(key)) continue;
		if (!deepEqual(cachedParent[key], serverParent[key])) {
			// An external writer touched the parent. Do not refresh --
			// let the real conflict-detection path handle it.
			console.log(
				`[sync] parent-refresh skipped for ${parentKey}: ` +
				`external writer changed field "${key}"`
			);
			return;
		}
	}

	// All writable fields match -- the bump is hook-only, safe to refresh.
	cachedParent._serverUpdated = serverParent.updated as string;
	await db.put('records', cachedParent);
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
		type: 'modified-vs-modified',
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
 * Store a conflict for a locally modified record whose server-side record
 * has been deleted. The participant can later decide whether to re-create
 * the record or discard their edits. Flips the local record to 'unchanged'
 * so the sync loop stops retrying the doomed update.
 */
async function storeDeletedConflict(
	localRecord: CachedRecord,
	participantId: string
): Promise<void> {
	const db = await getDB();
	const localData = cleanRecord(localRecord);
	const instanceId =
		(localRecord.instance_id as string) ||
		(localRecord._collection === 'workflow_instances' ? localRecord.id : '');

	const conflict: SyncConflict = {
		id: generateId(),
		collection: localRecord._collection,
		recordId: localRecord.id,
		instanceId,
		type: 'modified-vs-deleted',
		localVersion: localData,
		serverVersion: {},
		localModifiedBy: participantId,
		detectedAt: new Date().toISOString(),
		status: 'pending'
	};

	await db.put('conflicts', conflict);
	console.log(
		`Deleted-on-server conflict stored for ${localRecord._collection}/${localRecord.id}`
	);
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
// Push Listener (replaces sync loop's push-on-write behavior)
// =============================================================================

/**
 * Listen for local data changes and push to server after a debounce.
 * Returns cleanup function.
 */
export function startPushListener(gateway: ParticipantGateway): () => void {
	let pushDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	const unsubDataChange = onDataChange(() => {
		if (pushDebounceTimer) clearTimeout(pushDebounceTimer);
		pushDebounceTimer = setTimeout(() => {
			if (navigator.onLine && !syncInProgress) {
				uploadChanges(gateway);
			}
		}, PUSH_DEBOUNCE_MS);
	});

	return () => {
		if (pushDebounceTimer) {
			clearTimeout(pushDebounceTimer);
			pushDebounceTimer = null;
		}
		unsubDataChange();
	};
}

// =============================================================================
// Catch-Up Sync (on reconnect / tab focus)
// =============================================================================

/**
 * Run a catch-up sync: push pending changes, pull remote changes, detect deletions.
 * Called on PB_CONNECT reconnect and on tab regaining focus.
 */
export async function runCatchUpSync(gateway: ParticipantGateway): Promise<void> {
	if (syncInProgress || !navigator.onLine) return;

	syncInProgress = true;
	catchUpCount++;

	try {
		const total = syncCollections.length;

		// 1. Push local changes to server
		syncStatus.current = { done: 0, total };
		await uploadChanges(gateway);

		// 2. Pull remote changes in batches of 5, updating progress after each batch
		let totalPulled = 0;
		const changedCollections: string[] = [];
		const concurrency = 5;

		for (let i = 0; i < total; i += concurrency) {
			const batch = syncCollections.slice(i, i + concurrency);
			const batchResults = await Promise.allSettled(batch.map(pullChanges));

			for (let j = 0; j < batch.length; j++) {
				const result = batchResults[j];
				if (result.status === 'fulfilled' && result.value > 0) {
					changedCollections.push(batch[j]);
					totalPulled += result.value;
				}
			}

			syncStatus.current = { done: Math.min(i + concurrency, total), total };
		}

		if (totalPulled > 0) {
			console.log(`Catch-up pulled ${totalPulled} changed records`);
			for (const collection of changedCollections) {
				notifyDataChange(collection);
			}
		}

		// 3. Detect server deletions -- only for changed collections,
		//    or all collections every Nth catch-up as a full integrity check
		const fullDeletionCheck = catchUpCount % DELETION_CHECK_INTERVAL === 0;
		const collectionsToCheckDeletions = fullDeletionCheck
			? syncCollections
			: changedCollections;

		if (collectionsToCheckDeletions.length > 0) {
			const deleteResults = await batchedParallel(collectionsToCheckDeletions, detectServerDeletions, 5);

			let totalDeleted = 0;
			const deletedCollections: string[] = [];
			for (let i = 0; i < collectionsToCheckDeletions.length; i++) {
				const result = deleteResults[i];
				if (result.status === 'fulfilled' && result.value > 0) {
					deletedCollections.push(collectionsToCheckDeletions[i]);
					totalDeleted += result.value;
				}
			}

			if (totalDeleted > 0) {
				console.log(`Catch-up detected ${totalDeleted} server-side deletions`);
				for (const collection of deletedCollections) {
					notifyDataChange(collection);
				}
			}
		}
	} catch (error) {
		console.error('Catch-up sync failed:', error);
	} finally {
		syncInProgress = false;
		syncStatus.current = null;
	}
}

// =============================================================================
// Manual Sync (Sync Now button)
// =============================================================================

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

		// 3. Pull all records in parallel (full pull since timestamps are cleared)
		const pullResults = await batchedParallel(syncCollections, pullChanges, 5);
		let totalPulled = 0;
		for (let i = 0; i < syncCollections.length; i++) {
			const result = pullResults[i];
			if (result.status === 'fulfilled' && result.value > 0) {
				totalPulled += result.value;
				notifyDataChange(syncCollections[i]);
			}
		}
		if (totalPulled > 0) {
			console.log(`Full resync pulled ${totalPulled} records`);
		}

		// 4. Always detect deletions in parallel (removes records no longer accessible)
		const deleteResults = await batchedParallel(syncCollections, detectServerDeletions, 5);
		let totalDeleted = 0;
		for (let i = 0; i < syncCollections.length; i++) {
			const result = deleteResults[i];
			if (result.status === 'fulfilled' && result.value > 0) {
				totalDeleted += result.value;
				notifyDataChange(syncCollections[i]);
			}
		}
		if (totalDeleted > 0) {
			console.log(`Full resync removed ${totalDeleted} records no longer on server`);
		}
	} catch (error) {
		console.error('Full resync failed:', error);
	} finally {
		syncInProgress = false;
	}

	return true;
}

// =============================================================================
// Full Collection Download (first login, idempotent)
// =============================================================================

/**
 * Proactively pull every listed collection into IndexedDB. Runs on first
 * login (from the map page, after live queries have been declared) so the
 * participant has the complete project data available before opening any
 * detail view -- matches what Settings -> Sync Now does, but silent and
 * automatic.
 *
 * Deduplication: collections that already have a `sync_metadata` entry are
 * skipped (delta catch-up + realtime keep them fresh), and collections
 * currently being watched by a live query are ALSO skipped -- the live
 * query's own paginated background fetch is already handling them, and
 * running both paths in parallel would fetch every row twice. Callers can
 * pass `externallyManaged` for collections handled outside the normal live
 * query path (e.g. `FieldValueCache`).
 *
 * Paginated with PAGE_SIZE 500 so `downloadProgress` can tick forward
 * record-by-record for the header indicator.
 */
const DOWNLOAD_PAGE_SIZE = 500;

export async function downloadAllCollections(
	collectionNames: string[],
	externallyManaged: string[] = []
): Promise<void> {
	if (typeof window === 'undefined' || !navigator.onLine) return;
	if (collectionNames.length === 0) return;

	const pb = getPocketBase();
	const db = await getDB();

	// Anything currently watched by a live query, handled externally (e.g.
	// FieldValueCache), or already marked synced is handled elsewhere.
	const skip = new Set<string>([
		...getLiveCollectionNames(),
		...externallyManaged
	]);

	const pending: string[] = [];
	for (const name of collectionNames) {
		if (skip.has(name)) continue;
		const meta = await db.get('sync_metadata', name);
		if (!meta) pending.push(name);
	}

	if (pending.length === 0) {
		// Nothing to do -- keep downloadProgress null so the header stays quiet.
		return;
	}

	downloadProgress.current = {
		loadedRecords: 0,
		totalRecords: 0,
		currentCollection: null
	};

	try {
		for (const name of pending) {
			downloadProgress.current = {
				loadedRecords: downloadProgress.current?.loadedRecords ?? 0,
				totalRecords: downloadProgress.current?.totalRecords ?? 0,
				currentCollection: name
			};

			try {
				let page = 1;
				let totalPages = 1;
				let latestTimestamp = '';

				do {
					const result = await pb.collection(name).getList(page, DOWNLOAD_PAGE_SIZE, {
						sort: 'updated'
					});
					totalPages = result.totalPages;

					// Batch-write this page in a single IDB transaction.
					const tx = db.transaction('records', 'readwrite');
					const store = tx.objectStore('records');

					for (const record of result.items) {
						const key = `${name}/${record.id}`;
						const existing = await store.get(key);

						if ((record.updated as string) > latestTimestamp) {
							latestTimestamp = record.updated as string;
						}

						// Never clobber local modifications -- only bump
						// _serverUpdated so conflict detection sees the latest
						// server timestamp.
						if (existing && existing._status !== 'unchanged') {
							if (record.updated && existing._serverUpdated !== (record.updated as string)) {
								existing._serverUpdated = record.updated as string;
								store.put(existing);
							}
							continue;
						}

						// Skip unchanged rows we already have.
						if (existing && existing.updated === record.updated) continue;

						const cached: CachedRecord = {
							...record,
							id: record.id as string,
							_key: key,
							_collection: name,
							_status: 'unchanged',
							_serverUpdated: record.updated as string
						};
						store.put(cached);
					}

					await tx.done;

					// Update aggregate progress. First page of a collection
					// fills in its row count; later pages just bump loaded.
					const prev: DownloadProgressInfo = downloadProgress.current!;
					const newTotal = page === 1
						? prev.totalRecords + result.totalItems
						: prev.totalRecords;
					downloadProgress.current = {
						loadedRecords: prev.loadedRecords + result.items.length,
						totalRecords: newTotal,
						currentCollection: name
					};

					// Notify so live queries / FieldValueCache re-read the new rows.
					notifyDataChange(name);

					page++;
				} while (page <= totalPages);

				// Stamp sync_metadata so subsequent logins skip this collection
				// and delta catch-up can use lastSyncTimestamp going forward.
				if (latestTimestamp) {
					await db.put('sync_metadata', {
						collection: name,
						lastSyncTimestamp: latestTimestamp
					});
				}
			} catch (e) {
				console.debug(`downloadAllCollections: skipped ${name}:`, e);
			}
		}
	} finally {
		downloadProgress.current = null;
	}
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

	let totalRecords = 0;

	for (const name of collectionNames) {
		try {
			const records = await pb.collection(name).getFullList();

			let latestTimestamp = '';

			// Batch all writes in a single IDB transaction
			const tx = db.transaction(['records', 'sync_metadata'], 'readwrite');

			for (const record of records) {
				const cached: CachedRecord = {
					...record,
					_key: `${name}/${record.id}`,
					_collection: name,
					_status: 'unchanged',
					_serverUpdated: record.updated as string
				};
				tx.objectStore('records').put(cached);

				if ((record.updated as string) > latestTimestamp) {
					latestTimestamp = record.updated as string;
				}
			}

			// Set initial sync timestamp
			if (latestTimestamp) {
				tx.objectStore('sync_metadata').put({
					collection: name,
					lastSyncTimestamp: latestTimestamp
				});
			}

			await tx.done;

			totalRecords += records.length;
			console.log(`Downloaded ${records.length} records from ${name}`);
		} catch (e) {
			console.log(`Skipped ${name}: ${e instanceof Error ? e.message : 'Unknown error'}`);
		}
	}

	console.log(`Downloaded ${totalRecords} total records from ${collectionNames.length} collections`);
}
