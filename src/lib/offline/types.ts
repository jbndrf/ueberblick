/**
 * Type definitions for the offline-first architecture
 */

/**
 * Geographic bounding box for offline pack area selection
 */
export interface BoundingBox {
	north: number;
	south: number;
	east: number;
	west: number;
}

/**
 * Metadata about a downloaded offline pack
 */
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

/**
 * Status of an offline pack download
 */
export type DownloadStatus = 'idle' | 'downloading' | 'paused' | 'completed' | 'failed';

/**
 * Progress information for pack download
 */
export interface DownloadProgress {
	pack_id: string;
	status: DownloadStatus;
	total_items: number;
	completed_items: number;
	current_operation: string;
	error?: string;
}

/**
 * Marker data stored in offline pack
 */
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

/**
 * Workflow definition stored in offline pack
 */
export interface OfflineWorkflow {
	id: string;
	name: string;
	description?: string;
	stages: WorkflowStage[];
	created_at: string;
	updated_at: string;
}

/**
 * Stage in a workflow
 */
export interface WorkflowStage {
	id: string;
	name: string;
	order: number;
	form_id?: string;
	icon?: string;
	color?: string;
}

/**
 * Form schema stored in offline pack
 */
export interface OfflineForm {
	id: string;
	name: string;
	description?: string;
	fields: FormField[];
	created_at: string;
	updated_at: string;
}

/**
 * Form field definition
 */
export interface FormField {
	id: string;
	name: string;
	label: string;
	type: 'text' | 'number' | 'select' | 'multiselect' | 'date' | 'photo' | 'textarea';
	required: boolean;
	order: number;
	options?: FormFieldOption[];
	validation?: Record<string, unknown>;
}

/**
 * Option for select/multiselect fields
 */
export interface FormFieldOption {
	id: string;
	label: string;
	value: string;
	order: number;
}

/**
 * Marker category definition
 */
export interface OfflineMarkerCategory {
	id: string;
	name: string;
	icon?: string;
	color?: string;
	workflow_id?: string;
	created_at: string;
	updated_at: string;
}

/**
 * User-created marker waiting to be synced
 */
export interface PendingMarker {
	id: string;
	temp_id: string;
	category_id: string;
	latitude: number;
	longitude: number;
	title?: string;
	description?: string;
	properties: Record<string, unknown>;
	created_at: string;
	synced: number; // 0 = not synced, 1 = synced (IndexedDB doesn't support boolean keys)
}

/**
 * Survey submission waiting to be synced
 */
export interface PendingSurvey {
	id: string;
	temp_id: string;
	form_id: string;
	marker_id: string;
	workflow_instance_id?: string;
	answers: Record<string, unknown>;
	created_at: string;
	synced: number; // 0 = not synced, 1 = synced
}

/**
 * Photo waiting to be uploaded
 */
export interface PendingPhoto {
	id: string;
	temp_id: string;
	marker_id?: string;
	survey_id?: string;
	blob: Blob;
	filename: string;
	mime_type: string;
	created_at: string;
	synced: number; // 0 = not synced, 1 = synced
}

/**
 * Workflow progress tracking
 */
export interface WorkflowProgress {
	id: string;
	workflow_id: string;
	marker_id: string;
	current_stage_id: string;
	completed_stages: string[];
	created_at: string;
	updated_at: string;
	synced: number; // 0 = not synced, 1 = synced
}

/**
 * Item in the sync queue
 */
export interface SyncQueueItem {
	id: string;
	type: 'marker' | 'survey' | 'photo' | 'workflow_progress';
	operation: 'create' | 'update' | 'delete';
	data: PendingMarker | PendingSurvey | PendingPhoto | WorkflowProgress;
	retry_count: number;
	max_retries: number;
	last_error?: string;
	created_at: string;
	updated_at: string;
}

/**
 * Network status
 */
export interface NetworkStatus {
	online: boolean;
	type?: 'wifi' | 'cellular' | 'ethernet' | 'unknown';
	effective_type?: '4g' | '3g' | '2g' | 'slow-2g';
}

/**
 * Action types for the action router
 */
export type ActionType =
	| 'CREATE_MARKER'
	| 'UPDATE_MARKER'
	| 'DELETE_MARKER'
	| 'SUBMIT_SURVEY'
	| 'UPLOAD_PHOTO'
	| 'UPDATE_WORKFLOW_PROGRESS';

/**
 * Base action interface
 */
export interface Action<T = unknown> {
	type: ActionType;
	payload: T;
	timestamp: string;
}

/**
 * Create marker action payload
 */
export interface CreateMarkerPayload {
	category_id: string;
	latitude: number;
	longitude: number;
	title?: string;
	description?: string;
	properties?: Record<string, unknown>;
}

/**
 * Submit survey action payload
 */
export interface SubmitSurveyPayload {
	form_id: string;
	marker_id: string;
	workflow_instance_id?: string;
	answers: Record<string, unknown>;
}

/**
 * Upload photo action payload
 */
export interface UploadPhotoPayload {
	file: File;
	marker_id?: string;
	survey_id?: string;
}

/**
 * Update workflow progress action payload
 */
export interface UpdateWorkflowProgressPayload {
	workflow_id: string;
	marker_id: string;
	new_stage_id: string;
}
