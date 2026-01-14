/**
 * Participant State Type Definitions
 *
 * Uses TrackedItem pattern from workflow-builder with extended status for offline sync.
 */

// =============================================================================
// Status Machine
// =============================================================================

/**
 * Extended status for offline items.
 * Adds 'syncing' and 'error' states beyond workflow-builder's ItemStatus.
 */
export type ItemStatus = 'unchanged' | 'new' | 'modified' | 'deleted' | 'syncing' | 'error';

/**
 * Generic tracked item wrapper with status machine
 */
export interface TrackedItem<T> {
	data: T;
	status: ItemStatus;
	/** Original data for comparison (only set for items loaded from DB) */
	original?: T;
	/** Error message if status is 'error' */
	error?: string;
	/** Retry count for sync failures */
	retryCount?: number;
}

// =============================================================================
// Entity Types
// =============================================================================

export interface Marker {
	id: string;
	temp_id: string;
	category_id: string;
	latitude: number;
	longitude: number;
	title?: string;
	description?: string;
	properties: Record<string, unknown>;
	created_at: string;
	updated_at?: string;
}

export interface Survey {
	id: string;
	temp_id: string;
	form_id: string;
	marker_id: string;
	workflow_instance_id?: string;
	answers: Record<string, unknown>;
	created_at: string;
}

export interface Photo {
	id: string;
	temp_id: string;
	marker_id?: string;
	survey_id?: string;
	blob: Blob;
	filename: string;
	mime_type: string;
	created_at: string;
}

export interface WorkflowProgress {
	id: string;
	workflow_id: string;
	marker_id: string;
	current_stage_id: string;
	completed_stages: string[];
	created_at: string;
	updated_at: string;
}

// =============================================================================
// Tracked Convenience Types
// =============================================================================

export type TrackedMarker = TrackedItem<Marker>;
export type TrackedSurvey = TrackedItem<Survey>;
export type TrackedPhoto = TrackedItem<Photo>;
export type TrackedWorkflowProgress = TrackedItem<WorkflowProgress>;

// =============================================================================
// Sync Progress
// =============================================================================

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'completed';

export interface SyncProgress {
	status: SyncStatus;
	total: number;
	completed: number;
	failed: number;
	currentOperation?: string;
	lastError?: string;
	lastSyncAt?: string;
}

// =============================================================================
// Network Types
// =============================================================================

export interface NetworkStatus {
	online: boolean;
	type?: 'wifi' | 'cellular' | 'ethernet' | 'unknown';
	effectiveType?: '4g' | '3g' | '2g' | 'slow-2g';
}

// =============================================================================
// Offline Pack Types (kept from original)
// =============================================================================

export interface BoundingBox {
	north: number;
	south: number;
	east: number;
	west: number;
}

export interface OfflinePackMetadata {
	id: string;
	name: string;
	project_id: string;
	bbox: BoundingBox;
	zoom_levels: number[];
	created_at: string;
	updated_at: string;
	tile_count: number;
	estimated_size_mb: number;
	download_completed: boolean;
}

export type DownloadStatus = 'idle' | 'downloading' | 'paused' | 'completed' | 'failed';

export interface DownloadProgress {
	pack_id: string;
	status: DownloadStatus;
	total_items: number;
	completed_items: number;
	current_operation: string;
	error?: string;
}

// =============================================================================
// Offline Pack Data Types (read-only, downloaded from server)
// =============================================================================

export interface OfflineMarker {
	id: string;
	category_id: string;
	latitude: number;
	longitude: number;
	title?: string;
	description?: string;
	properties: Record<string, unknown>;
	created_at: string;
	updated_at: string;
}

export interface OfflineWorkflow {
	id: string;
	name: string;
	description?: string;
	stages: OfflineWorkflowStage[];
	created_at: string;
	updated_at: string;
}

export interface OfflineWorkflowStage {
	id: string;
	name: string;
	order: number;
	form_id?: string;
	icon?: string;
	color?: string;
}

export interface OfflineForm {
	id: string;
	name: string;
	description?: string;
	fields: OfflineFormField[];
	created_at: string;
	updated_at: string;
}

export interface OfflineFormField {
	id: string;
	name: string;
	label: string;
	type: 'text' | 'number' | 'select' | 'multiselect' | 'date' | 'photo' | 'textarea';
	required: boolean;
	order: number;
	options?: OfflineFormFieldOption[];
	validation?: Record<string, unknown>;
}

export interface OfflineFormFieldOption {
	id: string;
	label: string;
	value: string;
	order: number;
}

export interface OfflineMarkerCategory {
	id: string;
	name: string;
	icon?: string;
	color?: string;
	workflow_id?: string;
	created_at: string;
	updated_at: string;
}

// =============================================================================
// IndexedDB Stored Types (with metadata for persistence)
// =============================================================================

export interface StoredItem<T> {
	data: T;
	_status: ItemStatus;
	_error?: string;
	_retryCount?: number;
}

export type StoredMarker = Marker & { _status: ItemStatus; _error?: string; _retryCount?: number };
export type StoredSurvey = Survey & { _status: ItemStatus; _error?: string; _retryCount?: number };
export type StoredPhoto = Photo & { _status: ItemStatus; _error?: string; _retryCount?: number };
export type StoredWorkflowProgress = WorkflowProgress & {
	_status: ItemStatus;
	_error?: string;
	_retryCount?: number;
};
