/**
 * Sync queue engine for uploading offline data to PocketBase
 * Handles retry logic, error handling, and progress tracking
 */

import { v4 as uuidv4 } from 'uuid';
import { writable, derived, type Readable } from 'svelte/store';
import { getDB } from './db';
import { isOnline, waitForOnline } from './network';
import { markAsSynced } from './action-router';
import { getPocketBase } from '$lib/pocketbase';
import type {
	SyncQueueItem,
	PendingMarker,
	PendingSurvey,
	PendingPhoto,
	WorkflowProgress
} from './types';

/**
 * Sync status
 */
export type SyncStatus = 'idle' | 'syncing' | 'paused' | 'error';

interface SyncState {
	status: SyncStatus;
	progress: {
		total: number;
		completed: number;
		failed: number;
	};
	lastError?: string;
	lastSyncAt?: string;
}

/**
 * Sync state store
 */
const syncStateStore = writable<SyncState>({
	status: 'idle',
	progress: {
		total: 0,
		completed: 0,
		failed: 0
	}
});

export const syncState: Readable<SyncState> = { subscribe: syncStateStore.subscribe };

/**
 * Derived store for sync progress percentage
 */
export const syncProgress = derived(syncState, ($state) => {
	if ($state.progress.total === 0) return 0;
	return ($state.progress.completed / $state.progress.total) * 100;
});

/**
 * Derived store for whether sync is in progress
 */
export const isSyncing = derived(syncState, ($state) => $state.status === 'syncing');

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/**
 * Queue an item for sync
 */
export async function queueForSync(item: {
	type: SyncQueueItem['type'];
	operation: SyncQueueItem['operation'];
	data: PendingMarker | PendingSurvey | PendingPhoto | WorkflowProgress;
}): Promise<void> {
	const db = await getDB();
	const now = new Date().toISOString();

	const queueItem: SyncQueueItem = {
		id: uuidv4(),
		type: item.type,
		operation: item.operation,
		data: item.data,
		retry_count: 0,
		max_retries: MAX_RETRIES,
		created_at: now,
		updated_at: now
	};

	await db.add('sync_queue', queueItem);
}

/**
 * Get all items in the sync queue
 */
async function getQueueItems(): Promise<SyncQueueItem[]> {
	const db = await getDB();
	return await db.getAll('sync_queue');
}

/**
 * Process the sync queue
 * Uploads all pending items to PocketBase
 */
export async function processQueue(): Promise<void> {
	if (!isOnline()) {
		console.log('Offline - waiting for connection before syncing');
		await waitForOnline();
	}

	const items = await getQueueItems();

	if (items.length === 0) {
		console.log('No items to sync');
		return;
	}

	syncStateStore.update((state) => ({
		...state,
		status: 'syncing',
		progress: {
			total: items.length,
			completed: 0,
			failed: 0
		}
	}));

	const pb = getPocketBase();

	for (const item of items) {
		try {
			await syncItem(item, pb);

			// Mark as completed
			syncStateStore.update((state) => ({
				...state,
				progress: {
					...state.progress,
					completed: state.progress.completed + 1
				}
			}));

			// Remove from queue
			const db = await getDB();
			await db.delete('sync_queue', item.id);

			// Mark original item as synced
			await markAsSynced(item.type, item.data.id);
		} catch (error) {
			console.error(`Failed to sync item ${item.id}:`, error);

			// Update retry count
			const db = await getDB();
			const updatedItem = {
				...item,
				retry_count: item.retry_count + 1,
				last_error: error instanceof Error ? error.message : 'Unknown error',
				updated_at: new Date().toISOString()
			};

			if (updatedItem.retry_count >= updatedItem.max_retries) {
				// Max retries reached - mark as failed
				syncStateStore.update((state) => ({
					...state,
					progress: {
						...state.progress,
						failed: state.progress.failed + 1
					},
					lastError: updatedItem.last_error
				}));
			} else {
				// Update item in queue for retry
				await db.put('sync_queue', updatedItem);

				// Wait before retrying
				await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
			}
		}
	}

	syncStateStore.update((state) => ({
		...state,
		status: state.progress.failed > 0 ? 'error' : 'idle',
		lastSyncAt: new Date().toISOString()
	}));
}

/**
 * Sync a single item to PocketBase
 */
async function syncItem(item: SyncQueueItem, pb: ReturnType<typeof getPocketBase>): Promise<void> {
	switch (item.type) {
		case 'marker':
			await syncMarker(item.data as PendingMarker, item.operation, pb);
			break;
		case 'survey':
			await syncSurvey(item.data as PendingSurvey, item.operation, pb);
			break;
		case 'photo':
			await syncPhoto(item.data as PendingPhoto, item.operation, pb);
			break;
		case 'workflow_progress':
			await syncWorkflowProgress(item.data as WorkflowProgress, item.operation, pb);
			break;
		default:
			throw new Error(`Unknown sync type: ${item.type}`);
	}
}

/**
 * Sync marker to PocketBase
 */
async function syncMarker(
	marker: PendingMarker,
	operation: 'create' | 'update' | 'delete',
	pb: ReturnType<typeof getPocketBase>
): Promise<void> {
	if (operation === 'delete') {
		await pb.collection('markers').delete(marker.id);
		return;
	}

	const data = {
		category_id: marker.category_id,
		latitude: marker.latitude,
		longitude: marker.longitude,
		title: marker.title || '',
		description: marker.description || '',
		properties: marker.properties
	};

	if (operation === 'create') {
		await pb.collection('markers').create(data);
	} else {
		await pb.collection('markers').update(marker.id, data);
	}
}

/**
 * Sync survey to PocketBase
 */
async function syncSurvey(
	survey: PendingSurvey,
	operation: 'create' | 'update' | 'delete',
	pb: ReturnType<typeof getPocketBase>
): Promise<void> {
	if (operation === 'delete') {
		await pb.collection('survey_submissions').delete(survey.id);
		return;
	}

	const data = {
		form_id: survey.form_id,
		marker_id: survey.marker_id,
		workflow_instance_id: survey.workflow_instance_id,
		answers: survey.answers
	};

	if (operation === 'create') {
		await pb.collection('survey_submissions').create(data);
	} else {
		await pb.collection('survey_submissions').update(survey.id, data);
	}
}

/**
 * Sync photo to PocketBase
 */
async function syncPhoto(
	photo: PendingPhoto,
	operation: 'create' | 'update' | 'delete',
	pb: ReturnType<typeof getPocketBase>
): Promise<void> {
	if (operation === 'delete') {
		await pb.collection('photos').delete(photo.id);
		return;
	}

	// Convert blob back to File for upload
	const file = new File([photo.blob], photo.filename, { type: photo.mime_type });

	const formData = new FormData();
	formData.append('file', file);
	if (photo.marker_id) formData.append('marker_id', photo.marker_id);
	if (photo.survey_id) formData.append('survey_id', photo.survey_id);

	if (operation === 'create') {
		await pb.collection('photos').create(formData);
	} else {
		await pb.collection('photos').update(photo.id, formData);
	}
}

/**
 * Sync workflow progress to PocketBase
 */
async function syncWorkflowProgress(
	progress: WorkflowProgress,
	operation: 'create' | 'update' | 'delete',
	pb: ReturnType<typeof getPocketBase>
): Promise<void> {
	if (operation === 'delete') {
		await pb.collection('workflow_progress').delete(progress.id);
		return;
	}

	const data = {
		workflow_id: progress.workflow_id,
		marker_id: progress.marker_id,
		current_stage_id: progress.current_stage_id,
		completed_stages: progress.completed_stages
	};

	if (operation === 'create') {
		await pb.collection('workflow_progress').create(data);
	} else {
		await pb.collection('workflow_progress').update(progress.id, data);
	}
}

/**
 * Auto-sync when coming online
 */
export function enableAutoSync(): void {
	if (typeof window !== 'undefined') {
		window.addEventListener('online', () => {
			console.log('Connection restored - starting auto-sync');
			processQueue().catch(console.error);
		});
	}
}

/**
 * Get pending sync count
 */
export async function getPendingSyncCount(): Promise<number> {
	const items = await getQueueItems();
	return items.length;
}

/**
 * Clear all failed items from queue
 */
export async function clearFailedItems(): Promise<void> {
	const db = await getDB();
	const items = await getQueueItems();
	const failedItems = items.filter((item) => item.retry_count >= item.max_retries);

	for (const item of failedItems) {
		await db.delete('sync_queue', item.id);
	}

	syncStateStore.update((state) => ({
		...state,
		progress: {
			...state.progress,
			failed: 0
		},
		lastError: undefined
	}));
}

/**
 * Retry all failed items
 */
export async function retryFailedItems(): Promise<void> {
	const db = await getDB();
	const items = await getQueueItems();
	const failedItems = items.filter((item) => item.retry_count >= item.max_retries);

	for (const item of failedItems) {
		await db.put('sync_queue', {
			...item,
			retry_count: 0,
			last_error: undefined,
			updated_at: new Date().toISOString()
		});
	}

	await processQueue();
}
