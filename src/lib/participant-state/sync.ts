/**
 * Parallel Sync Engine with Exponential Backoff
 *
 * Syncs pending changes to PocketBase with:
 * - Parallel sync by entity type (markers, surveys, photos run simultaneously)
 * - Exponential backoff for retries (2s, 4s, 8s)
 * - Overall progress tracking
 */

import { getPocketBase } from '$lib/pocketbase';
import type { ParticipantState } from './state.svelte';
import type { Marker, Survey, Photo, WorkflowProgress } from './types';

// =============================================================================
// Constants
// =============================================================================

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000; // 2s base delay

// Collection names in PocketBase
const COLLECTIONS = {
	marker: 'markers',
	survey: 'survey_submissions',
	photo: 'photos',
	workflowProgress: 'workflow_progress'
} as const;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Calculate exponential backoff delay
 * 2s -> 4s -> 8s
 */
function getBackoffDelay(retryCount: number): number {
	return BASE_DELAY_MS * Math.pow(2, retryCount);
}

/**
 * Sleep for a given duration
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Main Sync Function
// =============================================================================

/**
 * Sync all pending changes to PocketBase
 * Uses parallel sync by entity type
 */
export async function syncAll(state: ParticipantState): Promise<void> {
	const changes = state.getChanges();

	// Calculate total items to sync
	const total =
		changes.markers.new.length +
		changes.markers.modified.length +
		changes.markers.deleted.length +
		changes.surveys.new.length +
		changes.surveys.modified.length +
		changes.surveys.deleted.length +
		changes.photos.new.length +
		changes.photos.modified.length +
		changes.photos.deleted.length +
		changes.workflowProgress.new.length +
		changes.workflowProgress.modified.length +
		changes.workflowProgress.deleted.length;

	if (total === 0) {
		return;
	}

	// Update progress
	state.syncProgress = {
		status: 'syncing',
		total,
		completed: 0,
		failed: 0
	};

	// Mark deleted items for tracking
	changes.markers.deleted.forEach((id) => state.markForDeletion('marker', id));
	changes.surveys.deleted.forEach((id) => state.markForDeletion('survey', id));
	changes.photos.deleted.forEach((id) => state.markForDeletion('photo', id));
	changes.workflowProgress.deleted.forEach((id) => state.markForDeletion('workflowProgress', id));

	// Mark all items as syncing
	const markerIds = [...changes.markers.new, ...changes.markers.modified].map((m) => m.id);
	const surveyIds = [...changes.surveys.new, ...changes.surveys.modified].map((s) => s.id);
	const photoIds = [...changes.photos.new, ...changes.photos.modified].map((p) => p.id);
	const progressIds = [...changes.workflowProgress.new, ...changes.workflowProgress.modified].map(
		(w) => w.id
	);

	state.markAsSyncing('marker', [...markerIds, ...changes.markers.deleted]);
	state.markAsSyncing('survey', [...surveyIds, ...changes.surveys.deleted]);
	state.markAsSyncing('photo', [...photoIds, ...changes.photos.deleted]);
	state.markAsSyncing('workflowProgress', [...progressIds, ...changes.workflowProgress.deleted]);

	// Parallel sync by entity type
	await Promise.all([
		syncMarkers(state, changes.markers),
		syncSurveys(state, changes.surveys),
		syncPhotos(state, changes.photos),
		syncWorkflowProgressItems(state, changes.workflowProgress)
	]);

	// Finalize progress
	const hasErrors = state.syncProgress.failed > 0;
	state.syncProgress = {
		...state.syncProgress,
		status: hasErrors ? 'error' : 'completed',
		lastSyncAt: new Date().toISOString()
	};

	// If no errors, clean up state
	if (!hasErrors) {
		state.markAllAsSynced();
	}
}

// =============================================================================
// Entity-Specific Sync Functions
// =============================================================================

/**
 * Sync all markers in parallel
 */
async function syncMarkers(
	state: ParticipantState,
	changes: { new: Marker[]; modified: Marker[]; deleted: string[] }
): Promise<void> {
	const pb = getPocketBase();
	const collection = COLLECTIONS.marker;

	const operations = [
		...changes.new.map((marker) =>
			syncSingleItem(state, 'marker', marker, () => pb.collection(collection).create(marker))
		),
		...changes.modified.map((marker) =>
			syncSingleItem(state, 'marker', marker, () =>
				pb.collection(collection).update(marker.id, marker)
			)
		),
		...changes.deleted.map((id) =>
			syncDeleteItem(state, 'marker', id, () => pb.collection(collection).delete(id))
		)
	];

	await Promise.all(operations);
}

/**
 * Sync all surveys in parallel
 */
async function syncSurveys(
	state: ParticipantState,
	changes: { new: Survey[]; modified: Survey[]; deleted: string[] }
): Promise<void> {
	const pb = getPocketBase();
	const collection = COLLECTIONS.survey;

	const operations = [
		...changes.new.map((survey) =>
			syncSingleItem(state, 'survey', survey, () => pb.collection(collection).create(survey))
		),
		...changes.modified.map((survey) =>
			syncSingleItem(state, 'survey', survey, () =>
				pb.collection(collection).update(survey.id, survey)
			)
		),
		...changes.deleted.map((id) =>
			syncDeleteItem(state, 'survey', id, () => pb.collection(collection).delete(id))
		)
	];

	await Promise.all(operations);
}

/**
 * Sync all photos in parallel
 * Photos require special handling for blob/file upload
 */
async function syncPhotos(
	state: ParticipantState,
	changes: { new: Photo[]; modified: Photo[]; deleted: string[] }
): Promise<void> {
	const pb = getPocketBase();
	const collection = COLLECTIONS.photo;

	const operations = [
		...changes.new.map((photo) =>
			syncSingleItem(state, 'photo', photo, () => uploadPhoto(pb, collection, photo, 'create'))
		),
		...changes.modified.map((photo) =>
			syncSingleItem(state, 'photo', photo, () => uploadPhoto(pb, collection, photo, 'update'))
		),
		...changes.deleted.map((id) =>
			syncDeleteItem(state, 'photo', id, () => pb.collection(collection).delete(id))
		)
	];

	await Promise.all(operations);
}

/**
 * Sync all workflow progress items in parallel
 */
async function syncWorkflowProgressItems(
	state: ParticipantState,
	changes: { new: WorkflowProgress[]; modified: WorkflowProgress[]; deleted: string[] }
): Promise<void> {
	const pb = getPocketBase();
	const collection = COLLECTIONS.workflowProgress;

	const operations = [
		...changes.new.map((progress) =>
			syncSingleItem(state, 'workflowProgress', progress, () =>
				pb.collection(collection).create(progress)
			)
		),
		...changes.modified.map((progress) =>
			syncSingleItem(state, 'workflowProgress', progress, () =>
				pb.collection(collection).update(progress.id, progress)
			)
		),
		...changes.deleted.map((id) =>
			syncDeleteItem(state, 'workflowProgress', id, () => pb.collection(collection).delete(id))
		)
	];

	await Promise.all(operations);
}

// =============================================================================
// Single Item Sync with Retry
// =============================================================================

/**
 * Sync a single item with retry logic and exponential backoff
 */
async function syncSingleItem<T extends { id: string }>(
	state: ParticipantState,
	type: 'marker' | 'survey' | 'photo' | 'workflowProgress',
	item: T,
	operation: () => Promise<unknown>,
	retryCount = 0
): Promise<void> {
	try {
		await operation();

		state.markAsSynced(type, item.id);
		state.syncProgress = {
			...state.syncProgress,
			completed: state.syncProgress.completed + 1
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';

		if (retryCount < MAX_RETRIES) {
			// Wait with exponential backoff
			await sleep(getBackoffDelay(retryCount));
			// Retry
			return syncSingleItem(state, type, item, operation, retryCount + 1);
		} else {
			// Max retries reached
			state.markAsError(type, item.id, errorMessage);
			state.syncProgress = {
				...state.syncProgress,
				failed: state.syncProgress.failed + 1,
				lastError: errorMessage
			};
		}
	}
}

/**
 * Sync a delete operation with retry logic
 */
async function syncDeleteItem(
	state: ParticipantState,
	type: 'marker' | 'survey' | 'photo' | 'workflowProgress',
	id: string,
	operation: () => Promise<unknown>,
	retryCount = 0
): Promise<void> {
	try {
		await operation();

		state.markAsSynced(type, id);
		state.syncProgress = {
			...state.syncProgress,
			completed: state.syncProgress.completed + 1
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';

		// Check if it's a "not found" error (already deleted on server)
		if (errorMessage.includes('404') || errorMessage.includes('not found')) {
			// Consider it synced if already deleted
			state.markAsSynced(type, id);
			state.syncProgress = {
				...state.syncProgress,
				completed: state.syncProgress.completed + 1
			};
			return;
		}

		if (retryCount < MAX_RETRIES) {
			await sleep(getBackoffDelay(retryCount));
			return syncDeleteItem(state, type, id, operation, retryCount + 1);
		} else {
			state.markAsError(type, id, errorMessage);
			state.syncProgress = {
				...state.syncProgress,
				failed: state.syncProgress.failed + 1,
				lastError: errorMessage
			};
		}
	}
}

// =============================================================================
// Photo Upload Helper
// =============================================================================

/**
 * Upload a photo with blob conversion to File
 */
async function uploadPhoto(
	pb: ReturnType<typeof getPocketBase>,
	collection: string,
	photo: Photo,
	mode: 'create' | 'update'
): Promise<unknown> {
	// Convert blob to File for FormData
	const file = new File([photo.blob], photo.filename, { type: photo.mime_type });

	const formData = new FormData();
	formData.append('file', file);

	if (photo.marker_id) {
		formData.append('marker_id', photo.marker_id);
	}
	if (photo.survey_id) {
		formData.append('survey_id', photo.survey_id);
	}

	if (mode === 'create') {
		return pb.collection(collection).create(formData);
	} else {
		return pb.collection(collection).update(photo.id, formData);
	}
}

// =============================================================================
// Auto-Sync Setup
// =============================================================================

/**
 * Enable automatic sync when coming online
 * Returns cleanup function
 */
export function enableAutoSync(state: ParticipantState): () => void {
	const handleOnline = () => {
		// Small delay to ensure stable connection
		setTimeout(() => {
			if (navigator.onLine && state.pendingCount > 0) {
				syncAll(state);
			}
		}, 2000);
	};

	window.addEventListener('online', handleOnline);

	return () => {
		window.removeEventListener('online', handleOnline);
	};
}
