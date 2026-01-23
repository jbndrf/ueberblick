/**
 * Operation Log for OFFLINE Mode Audit Trail
 *
 * This module is used ONLY for offline mode to track local operations
 * that need to be synced to the server later.
 *
 * When ONLINE: Audit trail is in PocketBase's `workflow_instance_tool_usage` collection
 * When OFFLINE: Operations are logged here and synced when back online
 *
 * Note: This is currently reserved for future offline sync functionality.
 */

import { getDB } from './db';
import { generateId } from './utils';
import type {
	OperationLogEntry,
	CollectionName,
	OperationType,
	OperationSyncStatus,
	StoredOperationLogEntry
} from './types';

// =============================================================================
// Operation Log Functions
// =============================================================================

/**
 * Create an operation log entry for offline mode.
 * Used to track local operations that need to be synced to the server later.
 */
export function createOperationEntry(params: {
	collection: CollectionName;
	recordId: string;
	operation: OperationType;
	dataBefore: Record<string, unknown> | null;
	dataAfter: Record<string, unknown> | null;
	participantId: string;
	instanceId?: string;
	stageId?: string;
}): OperationLogEntry {
	const entry: OperationLogEntry = {
		id: generateId(),
		collection: params.collection,
		recordId: params.recordId,
		operation: params.operation,
		dataBefore: params.dataBefore,
		dataAfter: params.dataAfter,
		participantId: params.participantId,
		timestamp: new Date().toISOString(),
		syncStatus: 'pending',
		syncedAt: null,
		syncError: null,
		instanceId: params.instanceId,
		stageId: params.stageId
	};

	return entry;
}

/**
 * Save an operation log entry to IndexedDB
 */
export async function saveOperation(entry: OperationLogEntry): Promise<void> {
	const db = await getDB();
	const stored: StoredOperationLogEntry = {
		...entry,
		_entityKey: `${entry.collection}:${entry.recordId}`
	};
	await db.put('operation_log', stored);
}

/**
 * Get all operation log entries
 */
export async function getAllOperations(): Promise<OperationLogEntry[]> {
	const db = await getDB();
	return db.getAll('operation_log');
}

/**
 * Get operations for a specific entity
 */
export async function getOperationsForEntity(
	collection: CollectionName,
	recordId: string
): Promise<OperationLogEntry[]> {
	const db = await getDB();
	const entityKey = `${collection}:${recordId}`;
	return db.getAllFromIndex('operation_log', 'by-entity', entityKey);
}

/**
 * Get operations by collection
 */
export async function getOperationsByCollection(
	collection: CollectionName
): Promise<OperationLogEntry[]> {
	const db = await getDB();
	return db.getAllFromIndex('operation_log', 'by-collection', collection);
}

/**
 * Get pending operations (not yet synced)
 */
export async function getPendingOperations(): Promise<OperationLogEntry[]> {
	const db = await getDB();
	return db.getAllFromIndex('operation_log', 'by-sync-status', 'pending');
}

/**
 * Get failed operations
 */
export async function getFailedOperations(): Promise<OperationLogEntry[]> {
	const db = await getDB();
	return db.getAllFromIndex('operation_log', 'by-sync-status', 'failed');
}

/**
 * Get operations by participant
 */
export async function getOperationsByParticipant(
	participantId: string
): Promise<OperationLogEntry[]> {
	const db = await getDB();
	return db.getAllFromIndex('operation_log', 'by-participant', participantId);
}

/**
 * Update operation sync status
 */
export async function updateOperationStatus(
	operationId: string,
	status: OperationSyncStatus,
	error?: string
): Promise<void> {
	const db = await getDB();
	const entry = await db.get('operation_log', operationId);
	if (entry) {
		entry.syncStatus = status;
		if (status === 'synced') {
			entry.syncedAt = new Date().toISOString();
			entry.syncError = null;
		} else if (status === 'failed' && error) {
			entry.syncError = error;
		}
		await db.put('operation_log', entry);
	}
}

/**
 * Mark operation as synced
 */
export async function markOperationSynced(operationId: string): Promise<void> {
	await updateOperationStatus(operationId, 'synced');
}

/**
 * Mark operation as failed
 */
export async function markOperationFailed(operationId: string, error: string): Promise<void> {
	await updateOperationStatus(operationId, 'failed', error);
}

/**
 * Link operation to tool usage record (after sync creates tool_usage)
 */
export async function linkOperationToToolUsage(
	operationId: string,
	toolUsageId: string
): Promise<void> {
	const db = await getDB();
	const entry = await db.get('operation_log', operationId);
	if (entry) {
		entry.toolUsageId = toolUsageId;
		await db.put('operation_log', entry);
	}
}

/**
 * Delete old synced operations (cleanup)
 * Keeps operations for a specified retention period
 */
export async function cleanupSyncedOperations(retentionDays: number = 30): Promise<number> {
	const db = await getDB();
	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
	const cutoffTimestamp = cutoffDate.toISOString();

	const allOperations = await db.getAll('operation_log');
	let deletedCount = 0;

	const tx = db.transaction('operation_log', 'readwrite');
	for (const op of allOperations) {
		if (op.syncStatus === 'synced' && op.timestamp < cutoffTimestamp) {
			await tx.store.delete(op.id);
			deletedCount++;
		}
	}
	await tx.done;

	return deletedCount;
}

/**
 * Get operation count by status
 */
export async function getOperationCounts(): Promise<{
	pending: number;
	synced: number;
	failed: number;
	total: number;
}> {
	const db = await getDB();
	const all = await db.getAll('operation_log');

	const counts = {
		pending: 0,
		synced: 0,
		failed: 0,
		total: all.length
	};

	for (const op of all) {
		counts[op.syncStatus]++;
	}

	return counts;
}
