/**
 * IndexedDB Persistence via $effect
 *
 * Automatically syncs ParticipantState to IndexedDB when state changes.
 */

import { getDB } from './db';
import type { ParticipantState } from './state.svelte';
import type {
	Marker,
	Survey,
	Photo,
	WorkflowProgress,
	TrackedMarker,
	TrackedSurvey,
	TrackedPhoto,
	TrackedWorkflowProgress
} from './types';

// =============================================================================
// Persistence Setup
// =============================================================================

/**
 * Set up $effect-based persistence for a ParticipantState instance.
 * Call this once after creating the state, typically in a component's script.
 *
 * Usage in a Svelte component:
 * ```svelte
 * <script>
 *   import { createParticipantState } from '$lib/participant-state';
 *   import { setupPersistence } from '$lib/participant-state/persistence.svelte';
 *
 *   const state = createParticipantState();
 *   setupPersistence(state);
 * </script>
 * ```
 */
export function setupPersistence(state: ParticipantState) {
	// Persist markers when they change
	$effect(() => {
		const markers = state.markers;
		if (markers.length > 0 || hasExistingData('pending_markers')) {
			persistMarkers(markers);
		}
	});

	// Persist surveys when they change
	$effect(() => {
		const surveys = state.surveys;
		if (surveys.length > 0 || hasExistingData('pending_surveys')) {
			persistSurveys(surveys);
		}
	});

	// Persist photos when they change
	$effect(() => {
		const photos = state.photos;
		if (photos.length > 0 || hasExistingData('pending_photos')) {
			persistPhotos(photos);
		}
	});

	// Persist workflow progress when it changes
	$effect(() => {
		const progress = state.workflowProgress;
		if (progress.length > 0 || hasExistingData('workflow_progress')) {
			persistWorkflowProgress(progress);
		}
	});
}

// Track which stores have existing data (to handle deletions)
const storesWithData = new Set<string>();

function hasExistingData(store: string): boolean {
	return storesWithData.has(store);
}

// =============================================================================
// Persist Functions
// =============================================================================

async function persistMarkers(markers: TrackedMarker[]) {
	try {
		const db = await getDB();
		const tx = db.transaction('pending_markers', 'readwrite');

		// Clear existing and add all current
		await tx.store.clear();

		for (const tracked of markers) {
			await tx.store.put({
				...tracked.data,
				_status: tracked.status,
				_error: tracked.error,
				_retryCount: tracked.retryCount
			});
		}

		await tx.done;

		if (markers.length > 0) {
			storesWithData.add('pending_markers');
		} else {
			storesWithData.delete('pending_markers');
		}
	} catch (error) {
		console.error('Failed to persist markers:', error);
	}
}

async function persistSurveys(surveys: TrackedSurvey[]) {
	try {
		const db = await getDB();
		const tx = db.transaction('pending_surveys', 'readwrite');

		await tx.store.clear();

		for (const tracked of surveys) {
			await tx.store.put({
				...tracked.data,
				_status: tracked.status,
				_error: tracked.error,
				_retryCount: tracked.retryCount
			});
		}

		await tx.done;

		if (surveys.length > 0) {
			storesWithData.add('pending_surveys');
		} else {
			storesWithData.delete('pending_surveys');
		}
	} catch (error) {
		console.error('Failed to persist surveys:', error);
	}
}

async function persistPhotos(photos: TrackedPhoto[]) {
	try {
		const db = await getDB();
		const tx = db.transaction('pending_photos', 'readwrite');

		await tx.store.clear();

		for (const tracked of photos) {
			await tx.store.put({
				...tracked.data,
				_status: tracked.status,
				_error: tracked.error,
				_retryCount: tracked.retryCount
			});
		}

		await tx.done;

		if (photos.length > 0) {
			storesWithData.add('pending_photos');
		} else {
			storesWithData.delete('pending_photos');
		}
	} catch (error) {
		console.error('Failed to persist photos:', error);
	}
}

async function persistWorkflowProgress(progress: TrackedWorkflowProgress[]) {
	try {
		const db = await getDB();
		const tx = db.transaction('workflow_progress', 'readwrite');

		await tx.store.clear();

		for (const tracked of progress) {
			await tx.store.put({
				...tracked.data,
				_status: tracked.status,
				_error: tracked.error,
				_retryCount: tracked.retryCount
			});
		}

		await tx.done;

		if (progress.length > 0) {
			storesWithData.add('workflow_progress');
		} else {
			storesWithData.delete('workflow_progress');
		}
	} catch (error) {
		console.error('Failed to persist workflow progress:', error);
	}
}

// =============================================================================
// Load Functions
// =============================================================================

/**
 * Load all state from IndexedDB on startup
 */
export async function loadFromDB(): Promise<{
	markers: Array<Marker & { _status?: string; _error?: string; _retryCount?: number }>;
	surveys: Array<Survey & { _status?: string; _error?: string; _retryCount?: number }>;
	photos: Array<Photo & { _status?: string; _error?: string; _retryCount?: number }>;
	workflowProgress: Array<
		WorkflowProgress & { _status?: string; _error?: string; _retryCount?: number }
	>;
}> {
	const db = await getDB();

	const [markers, surveys, photos, progress] = await Promise.all([
		db.getAll('pending_markers'),
		db.getAll('pending_surveys'),
		db.getAll('pending_photos'),
		db.getAll('workflow_progress')
	]);

	// Track which stores have data
	if (markers.length > 0) storesWithData.add('pending_markers');
	if (surveys.length > 0) storesWithData.add('pending_surveys');
	if (photos.length > 0) storesWithData.add('pending_photos');
	if (progress.length > 0) storesWithData.add('workflow_progress');

	return {
		markers,
		surveys,
		photos,
		workflowProgress: progress
	};
}

/**
 * Clear all pending data from IndexedDB
 */
export async function clearAllPendingData(): Promise<void> {
	const db = await getDB();

	await Promise.all([
		db.clear('pending_markers'),
		db.clear('pending_surveys'),
		db.clear('pending_photos'),
		db.clear('workflow_progress')
	]);

	storesWithData.clear();
}
