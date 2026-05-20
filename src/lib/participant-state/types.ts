/**
 * Participant State Type Definitions
 *
 * Types mirror PocketBase database schema for seamless local/remote sync.
 * Uses TrackedItem pattern for offline status tracking.
 */

// =============================================================================
// Common Types
// =============================================================================

/**
 * GeoPoint type matching PocketBase GeoPointField format
 */
export interface GeoPoint {
	lat: number;
	lon: number;
}

/**
 * GeoJSON geometry types a workflow instance can take.
 * Coordinates are [lon, lat] pairs, matching GeoJSON convention.
 *
 * A line-typed workflow instance is a LineString when a single line was
 * drawn, or a MultiLineString when the participant committed multiple lines
 * in one drawing session. Polygons work the same way. This mirrors the
 * legacy DrawingTool's "one instance can hold several shapes" behavior.
 */
export type InstanceGeometry =
	| { type: 'Point'; coordinates: [number, number] }
	| { type: 'LineString'; coordinates: [number, number][] }
	| { type: 'MultiLineString'; coordinates: [number, number][][] }
	| { type: 'Polygon'; coordinates: [number, number][][] }
	| { type: 'MultiPolygon'; coordinates: [number, number][][][] };

/**
 * Axis-aligned bounding box of an instance's geometry.
 * Derived server-side by the workflow_instance_geometry hook; used for cheap
 * viewport / "instances in this area" filtering without SpatiaLite.
 */
export interface GeometryBBox {
	minLon: number;
	minLat: number;
	maxLon: number;
	maxLat: number;
}

/**
 * Shape of a workflow_instance instance can take. Admin picks this per workflow;
 * participants only draw the chosen shape.
 */
export type GeometryType = 'point' | 'line' | 'polygon';

// =============================================================================
// Status Machine
// =============================================================================

/**
 * Extended status for offline items.
 * Tracks sync state for optimistic updates.
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
// Entity Types (matching PocketBase collections)
// =============================================================================

/**
 * Marker entity - matches `markers` collection
 */
export interface Marker {
	id: string;
	category_id: string;
	project_id: string;
	created_by: string;
	location: GeoPoint | null;
	title: string;
	description: string;
	properties: Record<string, unknown> | null;
	visible_to_roles: string[];
	created: string;
	updated: string;
}

/**
 * Workflow instance - matches `workflow_instances` collection
 * Represents an active workflow for a participant.
 *
 * `geometry` is the canonical shape (point / line / polygon as GeoJSON).
 * `centroid` and `bbox` are derived server-side by the
 * workflow_instance_geometry pb_hook on create/update; clients may also
 * populate them optimistically for offline rendering, and the server
 * recomputes on sync so values stay in lockstep.
 */
export interface WorkflowInstance {
	id: string;
	workflow_id: string;
	current_stage_id: string;
	status: 'active' | 'completed' | 'archived' | 'deleted';
	created_by: string;
	geometry: InstanceGeometry | null;
	centroid: GeoPoint | null;
	bbox: GeometryBBox | null;
	files: string[];
	created: string;
	updated: string;
}

/**
 * Per-field write semantics — drives whether a submission upserts (singleton),
 * always appends (observation), or is server-evaluated (computed).
 */
export type WriteMode = 'singleton' | 'observation' | 'computed';

/**
 * Field value - matches `workflow_field_values` collection.
 * One row per (instance, field_def) for singleton/computed fields (enforced by
 * a partial unique index); many rows per (instance, field_def) for observation
 * fields (append-only readings).
 */
export interface FieldValue {
	id: string;
	instance_id: string;
	field_def_id: string;
	write_mode: WriteMode;
	value: string;
	file_value: string;
	recorded_at: string;
	recorded_by_action: string;
	recorded_at_stage: string;
	created: string;
	updated: string;
}

/**
 * Tool usage - matches `workflow_instance_tool_usage` collection
 * Audit trail for tool executions within workflow instances
 */
export interface ToolUsage {
	id: string;
	instance_id: string;
	executed_by: string;
	executed_at: string;
	metadata: Record<string, unknown> | null;
	created: string;
	updated: string;
}

// =============================================================================
// Tracked Convenience Types
// =============================================================================

export type TrackedMarker = TrackedItem<Marker>;
export type TrackedWorkflowInstance = TrackedItem<WorkflowInstance>;
export type TrackedFieldValue = TrackedItem<FieldValue>;
export type TrackedToolUsage = TrackedItem<ToolUsage>;

// =============================================================================
// Tool Context (DEPRECATED - for reference only)
// =============================================================================

/**
 * @deprecated No longer used by gateway. Audit trail is now handled by:
 * - ONLINE: Tools create `workflow_instance_tool_usage` records directly
 * - OFFLINE: Reserved for future offline sync functionality
 */
export interface ToolContext {
	/** Tool type identifier ('edit' | 'form' | future tools) */
	tool: string;
	/** ID of the tool definition record (tools_forms etc.) */
	toolId?: string;
	/** Workflow instance this operation belongs to */
	instanceId: string;
	/** Current stage ID */
	stageId?: string;
	/** Connection ID if triggered from a transition */
	connectionId?: string;
	/** Additional tool-specific metadata */
	metadata?: Record<string, unknown>;
}

// =============================================================================
// Operation Log Types (for OFFLINE mode only)
// =============================================================================

export type OperationType = 'create' | 'update' | 'delete';

// Generic - any collection name is valid
export type CollectionName = string;

export type OperationSyncStatus = 'pending' | 'synced' | 'failed';

/**
 * Operation log entry for OFFLINE mode local audit trail.
 *
 * When ONLINE: Audit is in PocketBase `workflow_instance_tool_usage` collection
 * When OFFLINE: Operations are tracked here for later sync
 *
 * Reserved for future offline sync functionality.
 */
export interface OperationLogEntry {
	id: string;
	collection: CollectionName;
	recordId: string;
	operation: OperationType;
	dataBefore: Record<string, unknown> | null;
	dataAfter: Record<string, unknown> | null;
	participantId: string;
	/** Actual timestamp when operation occurred (ISO 8601) */
	timestamp: string;
	syncStatus: OperationSyncStatus;
	syncedAt: string | null;
	syncError: string | null;

	// Context fields for linking to workflow instances
	/** Tool type that triggered this operation */
	tool?: string;
	/** ID of the tool definition record */
	toolId?: string;
	/** Workflow instance ID */
	instanceId?: string;
	/** Stage ID where operation occurred */
	stageId?: string;
	/** Connection ID if from a transition */
	connectionId?: string;

	/** PocketBase tool_usage record ID after sync */
	toolUsageId?: string;
}

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
// Reference Data Types (read-only, downloaded from server)
// =============================================================================

/**
 * Workflow definition - matches `workflows` collection
 */
export interface Workflow {
	id: string;
	name: string;
	description: string;
	project_id: string;
	workflow_type: string;
	/**
	 * Geometry shape participants draw for instances of this workflow.
	 * Defaults to 'point' on legacy rows via the migration.
	 */
	geometry_type: GeometryType;
	is_active: boolean;
	marker_color: string;
	icon_config: Record<string, unknown> | null;
	created: string;
	updated: string;
}

/**
 * Workflow stage - matches `workflow_stages` collection
 */
export interface WorkflowStage {
	id: string;
	workflow_id: string;
	stage_name: string;
	stage_type: 'start' | 'intermediate' | 'end';
	stage_order: number;
	position_x: number;
	position_y: number;
	visible_to_roles: string[];
	visual_config: Record<string, unknown> | null;
	created: string;
	updated: string;
}

/**
 * Sentry clause — a single boolean check against an instance's field values.
 * Multiple clauses on a sentry are AND-ed together. Empty/missing sentry
 * means the connection is always available.
 */
export interface SentryClause {
	field_def_id: string;
	op:
		| 'equals'
		| 'not_equals'
		| 'contains'
		| 'is_empty'
		| 'is_not_empty'
		| 'gt'
		| 'gte'
		| 'lt'
		| 'lte';
	value?: string;
}

/**
 * Workflow connection - matches `workflow_connections` collection
 */
export interface WorkflowConnection {
	id: string;
	workflow_id: string;
	from_stage_id: string;
	to_stage_id: string;
	action_name: string;
	allowed_roles: string[];
	visual_config: Record<string, unknown> | null;
	/**
	 * Phase 3: AND-ed list of sentry clauses. Connection is available only
	 * when every clause matches the current instance's field values. Empty
	 * array or null means always available.
	 */
	sentry: SentryClause[] | null;
	created: string;
	updated: string;
}

/**
 * Form tool - matches `tools_forms` collection
 */
export interface ToolForm {
	id: string;
	workflow_id: string;
	connection_id: string;
	stage_id: string;
	name: string;
	description: string;
	allowed_roles: string[];
	visual_config: Record<string, unknown> | null;
	/**
	 * Protocol-local inline field defs. Populated on forms that back a
	 * protocol tool when the admin adds fields that should NOT join the
	 * workflow-wide field registry. Values land only in
	 * `workflow_protocol_entries.snapshot.local_fields`, never in
	 * `workflow_field_values`.
	 */
	local_fields: ProtocolLocalField[] | null;
	created: string;
	updated: string;
}

/**
 * Inline field definition stored on `tools_forms.local_fields`.
 * Scope is the single form. Has no stage assignment, no view_roles, no
 * cross-form reuse — the protocol tool's `allowed_roles` is the only gate.
 */
export interface ProtocolLocalField {
	key: string;
	label: string;
	field_type: Exclude<FieldType, 'instance_reference'>;
	field_options: Record<string, unknown> | null;
	required: boolean;
	placeholder: string | null;
	help_text: string | null;
	page: number;
	row_index: number;
	column_position: 'left' | 'right' | 'full';
}

/**
 * Canonical shape of `workflow_protocol_entries.snapshot`.
 * Labels are denormalized so renames don't rewrite history.
 */
export interface ProtocolEntrySnapshot {
	kind: 'manual' | 'global_autolog';
	case_fields: Array<{
		field_def_id: string;
		key: string;
		label: string;
		value: unknown;
		write_mode: WriteMode;
	}>;
	local_fields: Array<{
		key: string;
		label: string;
		value: unknown;
	}>;
	autolog: {
		from: string;
		to: string;
		entries: Array<{
			tool_usage_id: string;
			tool_id: string;
			tool_name: string;
			recorded_at: string;
			recorded_by: string;
			stage_id: string;
		}>;
	} | null;
}

export type FieldType =
	| 'short_text'
	| 'long_text'
	| 'number'
	| 'email'
	| 'date'
	| 'file'
	| 'dropdown'
	| 'multiple_choice'
	| 'smart_dropdown'
	| 'custom_table_selector'
	| 'instance_reference';

/**
 * Phase 4 — instance reference field options.
 * Stored on `workflow_field_defs.field_options` when `field_type === 'instance_reference'`.
 *
 * - `target_workflow_id`: null = any workflow; otherwise restricts the picker.
 * - `multiplicity`: 'single' = one instance id, 'many' = array of ids.
 * - `on_delete`: behavior when the target instance is deleted. Foundation
 *   only this phase — cascade enforcement is deferred to a follow-up.
 * - `relation_kind`: hint for UI (parent/child = nested rendering; peer = link).
 *
 * The value column stores a JSON array of workflow_instance ids regardless
 * of multiplicity (single = one-element array). One storage path.
 */
export interface InstanceReferenceOptions {
	target_workflow_id: string | null;
	multiplicity: 'single' | 'many';
	on_delete: 'cascade' | 'nullify' | 'block';
	relation_kind: 'peer' | 'parent' | 'child';
}

/**
 * Field definition - matches `workflow_field_defs` collection.
 * The workflow-scoped registry: each field is declared once here, then
 * referenced from any number of forms via `tools_form_field_refs`.
 */
export interface FieldDef {
	id: string;
	workflow_id: string;
	key: string;
	label: string;
	field_type: FieldType;
	write_mode: WriteMode;
	output_type: 'text' | 'number' | 'date' | 'json' | '';
	display_stage_id: string;
	view_roles: string[];
	placeholder: string;
	help_text: string;
	is_required: boolean;
	validation_rules: Record<string, unknown> | null;
	field_options: Record<string, unknown> | null;
	created: string;
	updated: string;
}

/**
 * Form field reference - matches `tools_form_field_refs` collection.
 * A form references field defs from the workflow's registry; per-form layout
 * and override knobs live on the reference, not the definition.
 */
export interface ToolFormFieldRef {
	id: string;
	form_id: string;
	field_def_id: string;
	field_order: number;
	page: number;
	page_title: string;
	row_index: number;
	column_position: 'left' | 'right' | 'full';
	is_required_override: boolean | null;
	placeholder_override: string;
	help_text_override: string;
	conditional_logic: Record<string, unknown> | null;
	created: string;
	updated: string;
}

/**
 * Marker category - matches `marker_categories` collection
 */
export interface MarkerCategory {
	id: string;
	name: string;
	description: string;
	project_id: string;
	sort_order: number;
	fields: Record<string, unknown> | null;
	icon_config: Record<string, unknown> | null;
	visible_to_roles: string[];
	created: string;
	updated: string;
}

/**
 * Role - matches `roles` collection
 */
export interface Role {
	id: string;
	name: string;
	project_id: string;
	max_instances?: number;
	created: string;
	updated: string;
}

/**
 * Map layer - matches `map_layers` collection (source fields merged in)
 */
export interface MapLayer {
	id: string;
	project_id: string;
	name: string;
	source_type: 'tile' | 'wms' | 'uploaded' | 'preset' | 'geojson';
	layer_type: 'base' | 'overlay';
	url: string | null;
	status: 'pending' | 'processing' | 'completed' | 'failed' | null;
	progress: number;
	error_message: string | null;
	tile_count: number | null;
	display_order: number;
	visible_to_roles: string[];
	is_active: boolean;
	config: Record<string, unknown> | null;
	created: string;
	updated: string;
}

// =============================================================================
// Offline Pack Types
// =============================================================================

export interface BoundingBox {
	north: number;
	south: number;
	east: number;
	west: number;
}

export interface OfflinePackMetadata {
	id: string;
	project_id: string;
	center: GeoPoint;
	radius_km: number;
	zoom_levels: number[];
	created_at: string;
	updated_at: string;
	marker_count: number;
	instance_count: number;
	tile_count: number;
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
// Offline Pack Content Types (data downloaded for offline use)
// =============================================================================

/**
 * Marker data for offline packs
 */
export type OfflineMarker = Marker;

/**
 * Workflow data for offline packs
 */
export type OfflineWorkflow = Workflow;

/**
 * Form data for offline packs. The form's field-refs are resolved against the
 * workflow's field-def registry; both lists travel together so the participant
 * can render forms while offline.
 */
export type OfflineForm = ToolForm & {
	field_refs: ToolFormFieldRef[];
};

/**
 * Marker category data for offline packs
 */
export type OfflineMarkerCategory = MarkerCategory;

// =============================================================================
// IndexedDB Stored Types (with metadata for persistence)
// =============================================================================

export type StoredMarker = Marker & {
	_status: ItemStatus;
	_error?: string;
	_retryCount?: number;
	/** Optional pack ID for offline packs */
	pack_id?: string;
};
export type StoredWorkflowInstance = WorkflowInstance & {
	_status: ItemStatus;
	_error?: string;
	_retryCount?: number;
};
export type StoredFieldValue = FieldValue & {
	_status: ItemStatus;
	_error?: string;
	_retryCount?: number;
};
export type StoredToolUsage = ToolUsage & {
	_status: ItemStatus;
	_error?: string;
	_retryCount?: number;
};
export type StoredOperationLogEntry = OperationLogEntry & {
	/** Index for querying by entity */
	_entityKey: string;
};

// Reference data with optional pack_id for offline packs
export type StoredWorkflow = Workflow & { pack_id?: string };
export type StoredMarkerCategory = MarkerCategory & { pack_id?: string };
export type StoredToolForm = ToolForm & { pack_id?: string };

// =============================================================================
// Gateway Result Types
// =============================================================================

export interface GatewayResult<T> {
	success: boolean;
	data?: T;
	operationId: string;
	error?: string;
}

export interface BatchResult {
	success: boolean;
	results: GatewayResult<unknown>[];
	failedCount: number;
}

// =============================================================================
// Participant Tool Configs (generic per-tool user-saved configuration)
// =============================================================================

/**
 * A single saved configuration entry for a participant-side tool.
 * `tool_key` names the owning tool; `config` shape is defined by that tool.
 * Backed by the `participant_tool_configs` collection.
 */
export interface ToolConfigRecord<T = unknown> {
	id: string;
	participant_id: string;
	project_id: string | null;
	tool_key: string;
	name: string;
	config: T;
	sort_order: number;
	created: string;
	updated: string;
}

// =============================================================================
// Filter Engine (saved views)
// =============================================================================

/**
 * A single filter clause. Clauses are AND-combined inside a ViewDefinition;
 * within one `in`-clause, `values` behave as OR.
 *
 * `stage` and `field_value` are scoped to a specific workflow because stage
 * ids and field_def_ids only make sense in that workflow's context.
 *
 * `field_value` supports multiple ops so a single clause type covers every
 * form-field flavour: `in` for dropdown/multiple-choice, `contains` for
 * text, `number_range` for numeric fields, `date_range` for date fields.
 *
 * `aggregate` controls how observation-mode fields are evaluated:
 *   - `latest` (default): only the most recent observation must match.
 *   - `any`:    at least one observation in the history must match.
 *   - `all`:    every observation must match.
 *   - `count`:  number of matching observations (combined with min/max).
 * For singleton/computed fields the aggregate is ignored (there's one value).
 */
export type FieldValueAggregate = 'latest' | 'any' | 'all' | 'count';

export type FilterClause =
	| { field: 'stage'; workflow_id: string; op: 'in'; values: string[] }
	| {
			field: 'field_value';
			workflow_id: string;
			field_def_id: string;
			aggregate?: FieldValueAggregate;
			op: 'in';
			values: string[];
	  }
	| {
			field: 'field_value';
			workflow_id: string;
			field_def_id: string;
			aggregate?: FieldValueAggregate;
			op: 'contains';
			text: string;
	  }
	| {
			field: 'field_value';
			workflow_id: string;
			field_def_id: string;
			aggregate?: FieldValueAggregate;
			op: 'number_range';
			min: number | null;
			max: number | null;
	  }
	| {
			field: 'field_value';
			workflow_id: string;
			field_def_id: string;
			aggregate?: FieldValueAggregate;
			op: 'date_range';
			from: string | null;
			to: string | null;
	  }
	| {
			field: 'created' | 'updated';
			op: 'between';
			from: string | null;
			to: string | null;
	  }
	| {
			field: 'created' | 'updated';
			op: 'older_than_days' | 'newer_than_days';
			days: number;
	  }
	| { field: 'created_by'; op: 'in'; values: string[] };

/**
 * Full definition of a filter view: top-level scope plus a list of clauses.
 * Persisted as `config` in a `participant_tool_configs` row with
 * `tool_key = 'filter.saved_views'`.
 */
export interface ViewDefinition {
	version: 1;
	/** Empty = all workflows visible */
	workflow_ids: string[];
	/** Empty = all categories visible */
	category_ids: string[];
	clauses: FilterClause[];
	/**
	 * Free-text "contains anywhere" search. Matches if any field value on
	 * the instance contains this substring (case-insensitive). Empty/absent
	 * = no global filter.
	 */
	free_text?: string;
	uncluster?: boolean;
	uncluster_cap?: number;
}

// =============================================================================
// Cached Session (for offline authentication)
// =============================================================================

/**
 * Cached participant session for offline mode.
 * Stored in IndexedDB when user toggles to offline mode.
 */
export interface CachedSession {
	participantId: string;
	projectId: string;
	email: string;
	cachedAt: string;
	expiresAt: string;
}
