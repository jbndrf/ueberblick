/**
 * Participant State Management
 *
 * Central state for participant's offline-first data with status tracking.
 * Uses Svelte 5 runes for reactivity.
 */

import { generateId, deepEqual } from './utils';
import type {
	Marker,
	Survey,
	Photo,
	WorkflowProgress,
	TrackedMarker,
	TrackedSurvey,
	TrackedPhoto,
	TrackedWorkflowProgress,
	SyncProgress,
	ItemStatus
} from './types';

// =============================================================================
// State Class
// =============================================================================

export class ParticipantState {
	private initialized = false;

	// Tracked collections
	markers = $state<TrackedMarker[]>([]);
	surveys = $state<TrackedSurvey[]>([]);
	photos = $state<TrackedPhoto[]>([]);
	workflowProgress = $state<TrackedWorkflowProgress[]>([]);

	// Sync progress (overall, not per-item)
	syncProgress = $state<SyncProgress>({
		status: 'idle',
		total: 0,
		completed: 0,
		failed: 0
	});

	// Derived: dirty state (any pending changes)
	isDirty = $derived(
		this.markers.some((m) => m.status !== 'unchanged') ||
			this.surveys.some((s) => s.status !== 'unchanged') ||
			this.photos.some((p) => p.status !== 'unchanged') ||
			this.workflowProgress.some((w) => w.status !== 'unchanged')
	);

	// Derived: pending sync count (items that need syncing)
	pendingCount = $derived(
		this.markers.filter((m) => ['new', 'modified', 'deleted', 'error'].includes(m.status))
			.length +
			this.surveys.filter((s) => ['new', 'modified', 'deleted', 'error'].includes(s.status))
				.length +
			this.photos.filter((p) => ['new', 'modified', 'deleted', 'error'].includes(p.status))
				.length +
			this.workflowProgress.filter((w) =>
				['new', 'modified', 'deleted', 'error'].includes(w.status)
			).length
	);

	// Derived: visible items (exclude deleted)
	visibleMarkers = $derived(this.markers.filter((m) => m.status !== 'deleted'));
	visibleSurveys = $derived(this.surveys.filter((s) => s.status !== 'deleted'));
	visiblePhotos = $derived(this.photos.filter((p) => p.status !== 'deleted'));
	visibleWorkflowProgress = $derived(this.workflowProgress.filter((w) => w.status !== 'deleted'));

	// Derived: items currently syncing
	isSyncing = $derived(this.syncProgress.status === 'syncing');

	// Derived: sync progress percentage
	syncPercentage = $derived(
		this.syncProgress.total > 0
			? Math.round((this.syncProgress.completed / this.syncProgress.total) * 100)
			: 0
	);

	// =========================================================================
	// Initialization (from IndexedDB)
	// =========================================================================

	initFromDB(data: {
		markers?: Array<Marker & { _status?: ItemStatus; _error?: string; _retryCount?: number }>;
		surveys?: Array<Survey & { _status?: ItemStatus; _error?: string; _retryCount?: number }>;
		photos?: Array<Photo & { _status?: ItemStatus; _error?: string; _retryCount?: number }>;
		workflowProgress?: Array<
			WorkflowProgress & { _status?: ItemStatus; _error?: string; _retryCount?: number }
		>;
	}) {
		// Guard against re-initialization (prevents infinite effect loops)
		if (this.initialized) return;
		this.initialized = true;

		// Map loaded items, restoring status or defaulting to 'unchanged'
		this.markers = (data.markers || []).map((m) => {
			const { _status, _error, _retryCount, ...markerData } = m;
			return {
				data: markerData as Marker,
				status: _status || ('unchanged' as ItemStatus),
				original: structuredClone(markerData),
				error: _error,
				retryCount: _retryCount || 0
			};
		});

		this.surveys = (data.surveys || []).map((s) => {
			const { _status, _error, _retryCount, ...surveyData } = s;
			return {
				data: surveyData as Survey,
				status: _status || ('unchanged' as ItemStatus),
				original: structuredClone(surveyData),
				error: _error,
				retryCount: _retryCount || 0
			};
		});

		this.photos = (data.photos || []).map((p) => {
			const { _status, _error, _retryCount, ...photoData } = p;
			return {
				data: photoData as Photo,
				status: _status || ('unchanged' as ItemStatus),
				original: structuredClone(photoData),
				error: _error,
				retryCount: _retryCount || 0
			};
		});

		this.workflowProgress = (data.workflowProgress || []).map((w) => {
			const { _status, _error, _retryCount, ...progressData } = w;
			return {
				data: progressData as WorkflowProgress,
				status: _status || ('unchanged' as ItemStatus),
				original: structuredClone(progressData),
				error: _error,
				retryCount: _retryCount || 0
			};
		});
	}

	/**
	 * Reset initialization flag (for testing or re-init scenarios)
	 */
	resetInitialized() {
		this.initialized = false;
	}

	// =========================================================================
	// Marker Operations
	// =========================================================================

	addMarker(
		payload: Omit<Marker, 'id' | 'temp_id' | 'created_at' | 'properties'> & {
			properties?: Record<string, unknown>;
		}
	): Marker {
		const id = generateId();
		const now = new Date().toISOString();

		const marker: Marker = {
			id,
			temp_id: id,
			...payload,
			properties: payload.properties || {},
			created_at: now
		};

		this.markers.push({
			data: marker,
			status: 'new'
		});

		return marker;
	}

	updateMarker(id: string, updates: Partial<Marker>) {
		const tracked = this.markers.find((m) => m.data.id === id);
		if (!tracked) return;

		Object.assign(tracked.data, updates, { updated_at: new Date().toISOString() });

		if (tracked.status === 'unchanged') {
			if (!deepEqual(tracked.data, tracked.original)) {
				tracked.status = 'modified';
			}
		}
	}

	deleteMarker(id: string) {
		const tracked = this.markers.find((m) => m.data.id === id);
		if (!tracked) return;

		if (tracked.status === 'new') {
			// Never synced - remove entirely
			this.markers = this.markers.filter((m) => m.data.id !== id);
		} else {
			// Mark for deletion on sync
			tracked.status = 'deleted';
		}
	}

	getMarkerById(id: string): TrackedMarker | undefined {
		return this.markers.find((m) => m.data.id === id);
	}

	// =========================================================================
	// Survey Operations
	// =========================================================================

	addSurvey(payload: Omit<Survey, 'id' | 'temp_id' | 'created_at'>): Survey {
		const id = generateId();
		const now = new Date().toISOString();

		const survey: Survey = {
			id,
			temp_id: id,
			...payload,
			created_at: now
		};

		this.surveys.push({
			data: survey,
			status: 'new'
		});

		return survey;
	}

	updateSurvey(id: string, updates: Partial<Survey>) {
		const tracked = this.surveys.find((s) => s.data.id === id);
		if (!tracked) return;

		Object.assign(tracked.data, updates);

		if (tracked.status === 'unchanged') {
			if (!deepEqual(tracked.data, tracked.original)) {
				tracked.status = 'modified';
			}
		}
	}

	deleteSurvey(id: string) {
		const tracked = this.surveys.find((s) => s.data.id === id);
		if (!tracked) return;

		if (tracked.status === 'new') {
			this.surveys = this.surveys.filter((s) => s.data.id !== id);
		} else {
			tracked.status = 'deleted';
		}
	}

	getSurveyById(id: string): TrackedSurvey | undefined {
		return this.surveys.find((s) => s.data.id === id);
	}

	getSurveysForMarker(markerId: string): TrackedSurvey[] {
		return this.visibleSurveys.filter((s) => s.data.marker_id === markerId);
	}

	// =========================================================================
	// Photo Operations
	// =========================================================================

	addPhoto(payload: Omit<Photo, 'id' | 'temp_id' | 'created_at'>): Photo {
		const id = generateId();
		const now = new Date().toISOString();

		const photo: Photo = {
			id,
			temp_id: id,
			...payload,
			created_at: now
		};

		this.photos.push({
			data: photo,
			status: 'new'
		});

		return photo;
	}

	deletePhoto(id: string) {
		const tracked = this.photos.find((p) => p.data.id === id);
		if (!tracked) return;

		if (tracked.status === 'new') {
			this.photos = this.photos.filter((p) => p.data.id !== id);
		} else {
			tracked.status = 'deleted';
		}
	}

	getPhotoById(id: string): TrackedPhoto | undefined {
		return this.photos.find((p) => p.data.id === id);
	}

	getPhotosForMarker(markerId: string): TrackedPhoto[] {
		return this.visiblePhotos.filter((p) => p.data.marker_id === markerId);
	}

	getPhotosForSurvey(surveyId: string): TrackedPhoto[] {
		return this.visiblePhotos.filter((p) => p.data.survey_id === surveyId);
	}

	// =========================================================================
	// Workflow Progress Operations
	// =========================================================================

	addWorkflowProgress(
		payload: Omit<WorkflowProgress, 'id' | 'created_at' | 'updated_at'>
	): WorkflowProgress {
		const id = generateId();
		const now = new Date().toISOString();

		const progress: WorkflowProgress = {
			id,
			...payload,
			created_at: now,
			updated_at: now
		};

		this.workflowProgress.push({
			data: progress,
			status: 'new'
		});

		return progress;
	}

	updateWorkflowProgress(id: string, updates: Partial<WorkflowProgress>) {
		const tracked = this.workflowProgress.find((w) => w.data.id === id);
		if (!tracked) return;

		Object.assign(tracked.data, updates, { updated_at: new Date().toISOString() });

		if (tracked.status === 'unchanged') {
			if (!deepEqual(tracked.data, tracked.original)) {
				tracked.status = 'modified';
			}
		}
	}

	deleteWorkflowProgress(id: string) {
		const tracked = this.workflowProgress.find((w) => w.data.id === id);
		if (!tracked) return;

		if (tracked.status === 'new') {
			this.workflowProgress = this.workflowProgress.filter((w) => w.data.id !== id);
		} else {
			tracked.status = 'deleted';
		}
	}

	getWorkflowProgressById(id: string): TrackedWorkflowProgress | undefined {
		return this.workflowProgress.find((w) => w.data.id === id);
	}

	getWorkflowProgressForMarker(markerId: string): TrackedWorkflowProgress[] {
		return this.visibleWorkflowProgress.filter((w) => w.data.marker_id === markerId);
	}

	// =========================================================================
	// Change Extraction for Sync
	// =========================================================================

	/**
	 * Get all changes grouped by operation type.
	 * Uses $state.snapshot() to convert reactive proxies to plain objects for API calls.
	 */
	getChanges() {
		return {
			markers: {
				new: this.markers.filter((m) => m.status === 'new').map((m) => $state.snapshot(m.data)),
				modified: this.markers
					.filter((m) => m.status === 'modified')
					.map((m) => $state.snapshot(m.data)),
				deleted: this.markers.filter((m) => m.status === 'deleted').map((m) => m.data.id),
				error: this.markers.filter((m) => m.status === 'error')
			},
			surveys: {
				new: this.surveys.filter((s) => s.status === 'new').map((s) => $state.snapshot(s.data)),
				modified: this.surveys
					.filter((s) => s.status === 'modified')
					.map((s) => $state.snapshot(s.data)),
				deleted: this.surveys.filter((s) => s.status === 'deleted').map((s) => s.data.id),
				error: this.surveys.filter((s) => s.status === 'error')
			},
			photos: {
				new: this.photos.filter((p) => p.status === 'new').map((p) => $state.snapshot(p.data)),
				modified: this.photos
					.filter((p) => p.status === 'modified')
					.map((p) => $state.snapshot(p.data)),
				deleted: this.photos.filter((p) => p.status === 'deleted').map((p) => p.data.id),
				error: this.photos.filter((p) => p.status === 'error')
			},
			workflowProgress: {
				new: this.workflowProgress
					.filter((w) => w.status === 'new')
					.map((w) => $state.snapshot(w.data)),
				modified: this.workflowProgress
					.filter((w) => w.status === 'modified')
					.map((w) => $state.snapshot(w.data)),
				deleted: this.workflowProgress
					.filter((w) => w.status === 'deleted')
					.map((w) => w.data.id),
				error: this.workflowProgress.filter((w) => w.status === 'error')
			}
		};
	}

	// =========================================================================
	// Status Updates (called by sync engine)
	// =========================================================================

	/**
	 * Mark items as currently syncing
	 */
	markAsSyncing(type: 'marker' | 'survey' | 'photo' | 'workflowProgress', ids: string[]) {
		const collection = this.getCollection(type);
		for (const tracked of collection) {
			if (
				ids.includes(tracked.data.id) &&
				['new', 'modified', 'deleted', 'error'].includes(tracked.status)
			) {
				tracked.status = 'syncing';
			}
		}
	}

	/**
	 * Mark an item as successfully synced
	 */
	markAsSynced(type: 'marker' | 'survey' | 'photo' | 'workflowProgress', id: string) {
		const collection = this.getCollection(type);
		const tracked = collection.find((item) => item.data.id === id);
		if (!tracked) return;

		// Check if it was marked for deletion
		const wasDeleted = tracked.original !== undefined && tracked.status === 'syncing';

		// If it was a deleted item that's now synced, remove it entirely
		if (wasDeleted && this.wasMarkedForDeletion(type, id)) {
			this.removeFromCollection(type, id);
		} else {
			tracked.status = 'unchanged';
			tracked.original = $state.snapshot(tracked.data);
			tracked.error = undefined;
			tracked.retryCount = 0;
		}
	}

	/**
	 * Mark an item as failed to sync
	 */
	markAsError(type: 'marker' | 'survey' | 'photo' | 'workflowProgress', id: string, error: string) {
		const collection = this.getCollection(type);
		const tracked = collection.find((item) => item.data.id === id);
		if (!tracked) return;

		tracked.status = 'error';
		tracked.error = error;
		tracked.retryCount = (tracked.retryCount || 0) + 1;
	}

	/**
	 * Track which items were marked for deletion (for post-sync cleanup)
	 */
	private deletedIds = new Map<string, Set<string>>();

	markForDeletion(type: 'marker' | 'survey' | 'photo' | 'workflowProgress', id: string) {
		if (!this.deletedIds.has(type)) {
			this.deletedIds.set(type, new Set());
		}
		this.deletedIds.get(type)!.add(id);
	}

	private wasMarkedForDeletion(
		type: 'marker' | 'survey' | 'photo' | 'workflowProgress',
		id: string
	): boolean {
		return this.deletedIds.get(type)?.has(id) || false;
	}

	clearDeletionTracking() {
		this.deletedIds.clear();
	}

	// =========================================================================
	// Helper Methods
	// =========================================================================

	private getCollection(
		type: 'marker' | 'survey' | 'photo' | 'workflowProgress'
	): Array<TrackedMarker | TrackedSurvey | TrackedPhoto | TrackedWorkflowProgress> {
		switch (type) {
			case 'marker':
				return this.markers;
			case 'survey':
				return this.surveys;
			case 'photo':
				return this.photos;
			case 'workflowProgress':
				return this.workflowProgress;
		}
	}

	private removeFromCollection(
		type: 'marker' | 'survey' | 'photo' | 'workflowProgress',
		id: string
	) {
		switch (type) {
			case 'marker':
				this.markers = this.markers.filter((m) => m.data.id !== id);
				break;
			case 'survey':
				this.surveys = this.surveys.filter((s) => s.data.id !== id);
				break;
			case 'photo':
				this.photos = this.photos.filter((p) => p.data.id !== id);
				break;
			case 'workflowProgress':
				this.workflowProgress = this.workflowProgress.filter((w) => w.data.id !== id);
				break;
		}
	}

	// =========================================================================
	// Post-Sync Cleanup
	// =========================================================================

	/**
	 * Call after successful sync to clean up state
	 */
	markAllAsSynced() {
		// Remove deleted items
		this.markers = this.markers.filter((m) => m.status !== 'deleted');
		this.surveys = this.surveys.filter((s) => s.status !== 'deleted');
		this.photos = this.photos.filter((p) => p.status !== 'deleted');
		this.workflowProgress = this.workflowProgress.filter((w) => w.status !== 'deleted');

		// Mark all as unchanged and update originals
		for (const marker of this.markers) {
			if (marker.status === 'syncing') {
				marker.status = 'unchanged';
				marker.original = $state.snapshot(marker.data);
				marker.error = undefined;
				marker.retryCount = 0;
			}
		}
		for (const survey of this.surveys) {
			if (survey.status === 'syncing') {
				survey.status = 'unchanged';
				survey.original = $state.snapshot(survey.data);
				survey.error = undefined;
				survey.retryCount = 0;
			}
		}
		for (const photo of this.photos) {
			if (photo.status === 'syncing') {
				photo.status = 'unchanged';
				photo.original = $state.snapshot(photo.data);
				photo.error = undefined;
				photo.retryCount = 0;
			}
		}
		for (const progress of this.workflowProgress) {
			if (progress.status === 'syncing') {
				progress.status = 'unchanged';
				progress.original = $state.snapshot(progress.data);
				progress.error = undefined;
				progress.retryCount = 0;
			}
		}

		// Clear deletion tracking
		this.clearDeletionTracking();
	}
}

// =============================================================================
// Factory Function
// =============================================================================

export function createParticipantState(): ParticipantState {
	return new ParticipantState();
}
