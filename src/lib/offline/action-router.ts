/**
 * Lightweight action router for offline-first operations
 * Dispatches actions to appropriate handlers and queues for sync
 */

import { v4 as uuidv4 } from 'uuid';
import { getDB } from './db';
import { isOnline } from './network';
import { queueForSync } from './sync';
import type {
	Action,
	CreateMarkerPayload,
	SubmitSurveyPayload,
	UploadPhotoPayload,
	UpdateWorkflowProgressPayload,
	PendingMarker,
	PendingSurvey,
	PendingPhoto,
	WorkflowProgress
} from './types';

/**
 * Dispatch an action through the router
 * Handles offline-first logic: store locally, queue for sync, update UI
 */
export async function dispatch<T>(action: Action<T>): Promise<string> {
	switch (action.type) {
		case 'CREATE_MARKER':
			return await createMarker(action.payload as CreateMarkerPayload);
		case 'SUBMIT_SURVEY':
			return await submitSurvey(action.payload as SubmitSurveyPayload);
		case 'UPLOAD_PHOTO':
			return await uploadPhoto(action.payload as UploadPhotoPayload);
		case 'UPDATE_WORKFLOW_PROGRESS':
			return await updateWorkflowProgress(action.payload as UpdateWorkflowProgressPayload);
		default:
			throw new Error(`Unknown action type: ${action.type}`);
	}
}

/**
 * Create a new marker (offline-first)
 */
async function createMarker(payload: CreateMarkerPayload): Promise<string> {
	const db = await getDB();
	const id = uuidv4();
	const now = new Date().toISOString();

	const marker: PendingMarker = {
		id,
		temp_id: id, // Use same ID as temp until synced
		category_id: payload.category_id,
		latitude: payload.latitude,
		longitude: payload.longitude,
		title: payload.title,
		description: payload.description,
		properties: payload.properties || {},
		created_at: now,
		synced: 0 // 0 = not synced
	};

	// Store in local database
	await db.put('pending_markers', marker);

	// Queue for sync
	await queueForSync({
		type: 'marker',
		operation: 'create',
		data: marker
	});

	return id;
}

/**
 * Submit a survey (offline-first)
 */
async function submitSurvey(payload: SubmitSurveyPayload): Promise<string> {
	const db = await getDB();
	const id = uuidv4();
	const now = new Date().toISOString();

	const survey: PendingSurvey = {
		id,
		temp_id: id,
		form_id: payload.form_id,
		marker_id: payload.marker_id,
		workflow_instance_id: payload.workflow_instance_id,
		answers: payload.answers,
		created_at: now,
		synced: 0
	};

	// Store in local database
	await db.put('pending_surveys', survey);

	// Queue for sync
	await queueForSync({
		type: 'survey',
		operation: 'create',
		data: survey
	});

	return id;
}

/**
 * Upload a photo (offline-first)
 */
async function uploadPhoto(payload: UploadPhotoPayload): Promise<string> {
	const db = await getDB();
	const id = uuidv4();
	const now = new Date().toISOString();

	// Convert File to Blob for storage
	const blob = new Blob([await payload.file.arrayBuffer()], { type: payload.file.type });

	const photo: PendingPhoto = {
		id,
		temp_id: id,
		marker_id: payload.marker_id,
		survey_id: payload.survey_id,
		blob,
		filename: payload.file.name,
		mime_type: payload.file.type,
		created_at: now,
		synced: 0
	};

	// Store in local database
	await db.put('pending_photos', photo);

	// Queue for sync
	await queueForSync({
		type: 'photo',
		operation: 'create',
		data: photo
	});

	return id;
}

/**
 * Update workflow progress (offline-first)
 */
async function updateWorkflowProgress(payload: UpdateWorkflowProgressPayload): Promise<string> {
	const db = await getDB();
	const now = new Date().toISOString();

	// Check if progress already exists
	const existingProgress = await db
		.getAllFromIndex('workflow_progress', 'by-marker', payload.marker_id)
		.then((items) => items.find((p) => p.workflow_id === payload.workflow_id));

	let progress: WorkflowProgress;
	let operation: 'create' | 'update';

	if (existingProgress) {
		// Update existing progress
		operation = 'update';
		progress = {
			...existingProgress,
			current_stage_id: payload.new_stage_id,
			completed_stages: [...new Set([...existingProgress.completed_stages, payload.new_stage_id])],
			updated_at: now,
			synced: 0
		};
	} else {
		// Create new progress
		operation = 'create';
		progress = {
			id: uuidv4(),
			workflow_id: payload.workflow_id,
			marker_id: payload.marker_id,
			current_stage_id: payload.new_stage_id,
			completed_stages: [payload.new_stage_id],
			created_at: now,
			updated_at: now,
			synced: 0
		};
	}

	// Store in local database
	await db.put('workflow_progress', progress);

	// Queue for sync
	await queueForSync({
		type: 'workflow_progress',
		operation,
		data: progress
	});

	return progress.id;
}

/**
 * Helper to create a timestamped action
 */
export function createAction<T>(type: Action['type'], payload: T): Action<T> {
	return {
		type,
		payload,
		timestamp: new Date().toISOString()
	};
}

/**
 * Get all pending items waiting to be synced
 */
export async function getPendingItems(): Promise<{
	markers: PendingMarker[];
	surveys: PendingSurvey[];
	photos: PendingPhoto[];
	progress: WorkflowProgress[];
}> {
	const db = await getDB();

	const [markers, surveys, photos, progress] = await Promise.all([
		db.getAllFromIndex('pending_markers', 'by-synced', 0),
		db.getAllFromIndex('pending_surveys', 'by-synced', 0),
		db.getAllFromIndex('pending_photos', 'by-synced', 0),
		db.getAllFromIndex('workflow_progress', 'by-synced', 0)
	]);

	return { markers, surveys, photos, progress };
}

/**
 * Get count of pending items
 */
export async function getPendingCount(): Promise<number> {
	const pending = await getPendingItems();
	return (
		pending.markers.length +
		pending.surveys.length +
		pending.photos.length +
		pending.progress.length
	);
}

/**
 * Mark an item as synced
 */
export async function markAsSynced(
	type: 'marker' | 'survey' | 'photo' | 'workflow_progress',
	id: string
): Promise<void> {
	const db = await getDB();

	const storeMap = {
		marker: 'pending_markers',
		survey: 'pending_surveys',
		photo: 'pending_photos',
		workflow_progress: 'workflow_progress'
	} as const;

	const store = storeMap[type];
	const item = await db.get(store, id);

	if (item) {
		await db.put(store, { ...item, synced: 1 });
	}
}

/**
 * Clear all synced items (cleanup)
 */
export async function clearSyncedItems(): Promise<void> {
	const db = await getDB();

	const stores = ['pending_markers', 'pending_surveys', 'pending_photos', 'workflow_progress'] as const;

	for (const store of stores) {
		const syncedItems = await db.getAllFromIndex(store, 'by-synced', 1);
		for (const item of syncedItems) {
			await db.delete(store, item.id);
		}
	}
}
