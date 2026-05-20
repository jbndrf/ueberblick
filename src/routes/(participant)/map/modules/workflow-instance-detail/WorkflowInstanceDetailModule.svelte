<script lang="ts">
	import { untrack } from 'svelte';
	import {
		commonCancel,
		mapWorkflowContinue,
		participantWorkflowInstanceDetailAdminUpdated,
		participantWorkflowInstanceDetailAttachmentAlt,
		participantWorkflowInstanceDetailConfirmAction,
		participantWorkflowInstanceDetailConfirmProceed,
		participantWorkflowInstanceDetailConflictMany,
		participantWorkflowInstanceDetailConflictOne,
		participantWorkflowInstanceDetailEntryAction,
		participantWorkflowInstanceDetailEntryConflictResolved,
		participantWorkflowInstanceDetailEntryCreated,
		participantWorkflowInstanceDetailEntryDataRecorded,
		participantWorkflowInstanceDetailEntryInspectionRecorded,
		participantWorkflowInstanceDetailEntryLocationUpdated,
		participantWorkflowInstanceDetailFieldFallback,
		participantWorkflowInstanceDetailFieldsNoun,
		participantWorkflowInstanceDetailFieldsUpdated,
		participantWorkflowInstanceDetailJustNow,
		participantWorkflowInstanceDetailLocationLabel,
		participantWorkflowInstanceDetailMovedTo,
		participantWorkflowInstanceDetailNoActivity,
		participantWorkflowInstanceDetailNoData,
		participantWorkflowInstanceDetailNoLocation,
		participantWorkflowInstanceDetailTabActivity,
		participantWorkflowInstanceDetailTabData,
		participantWorkflowInstanceDetailTabProtocols,
		participantWorkflowInstanceDetailProtocolHistoryEmpty,
		participantWorkflowInstanceDetailProtocolAutologSummary,
		participantWorkflowInstanceDetailUpdatedSuffix,
		participantWorkflowInstanceDetailVisitSuffix,
		participantWorkflowInstanceDetailLoadOlder,
		participantWorkflowInstanceDetailLoadOlderOfflineHint,
		participantWorkflowInstanceDetailYesterday
	} from '$lib/paraglide/messages';
	import ModuleShell from '$lib/components/module-shell.svelte';
	import { requireParticipantGateway } from '$lib/participant-state/context.svelte';
	import {
		createWorkflowInstanceDetailState,
		type WorkflowInstanceDetailState,
		type WorkflowConnection,
		type ToolQueueItem,
		type ToolEdit,
		type ToolProtocol,
		type ToolUsageRecord
	} from './state.svelte';
	import type { FieldValueCache } from '$lib/participant-state/field-value-cache.svelte';
	import type { FieldDef } from '$lib/participant-state/types';
	import type { WorkflowInstanceSelection } from '../types';
	import * as Tabs from '$lib/components/ui/tabs';
	import { ChevronRight } from '@lucide/svelte';
	import { FormFillTool, ViewFieldsTool, LocationEditTool, ConflictResolutionTool, ProtocolTool } from './tools';
	import { isMeaningfulValue } from './tools/form-state';
	import FieldValueImage from './FieldValueImage.svelte';
	import { getConflictsForInstance, resolveConflict } from '$lib/participant-state/sync.svelte';
	import type { SyncConflict } from '$lib/participant-state/db';
	import { getChangedFields } from './conflict-diff';
	import { getPocketBase } from '$lib/pocketbase';
	import { instanceLabel } from '$lib/utils/instance-label';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { AlertTriangle } from '@lucide/svelte';
	import type { Map as LeafletMap } from 'leaflet';
	import type { Feature, LineString, MultiLineString, Polygon, MultiPolygon } from 'geojson';
	import GeometryDrawTool from '$lib/components/map/geometry-draw-tool.svelte';
	import { deriveCentroid, deriveBBox } from '$lib/utils/instance-geometry';
	import type { InstanceGeometry } from '$lib/participant-state/types';

	// ==========================================================================
	// Props
	// ==========================================================================

	interface Props {
		selection: WorkflowInstanceSelection;
		/** Controls expanded/peek state on mobile (bindable) */
		isExpanded?: boolean;
		/** Reference to the Leaflet map (needed for location editing) */
		map?: LeafletMap | null;
		/** Exposes whether location editing is active (bindable) */
		isEditingLocation?: boolean;
		/** Optional field value cache for O(1) lookups */
		fieldValueCache?: FieldValueCache;
		/** Participant role ids — used to filter view_roles-restricted fields. */
		participantRoleIds?: string[];
		onClose: () => void;
	}

	let { selection, isExpanded = $bindable(false), map = null, isEditingLocation = $bindable(false), fieldValueCache, participantRoleIds = [], onClose }: Props = $props();

	// ==========================================================================
	// State
	// ==========================================================================

	const gateway = requireParticipantGateway();
	let detailState = $state<WorkflowInstanceDetailState | null>(null);
	let isOpen = $state(true);
	let activeTab = $state<string>('activity');

	// Tool flow state (managed internally now)
	interface ActiveToolFlow {
		instanceId: string;
		connection: WorkflowConnection;
		toolQueue: ToolQueueItem[];
		currentToolIndex: number;
	}

	let activeToolFlow = $state<ActiveToolFlow | null>(null);
	let activeEditTool = $state<ToolEdit | null>(null);
	let activeProtocolTool = $state<ToolProtocol | null>(null);
	let isLocationPickerActive = $state(false);
	let activeLocationEditTool = $state<ToolEdit | null>(null);
	let geometryDrawMode = $state<'line' | 'polygon' | null>(null);

	// Connection confirmation dialog state
	let pendingConfirmConnection = $state<WorkflowConnection | null>(null);

	// Conflict resolution state
	let pendingConflicts = $state<SyncConflict[]>([]);
	let showConflictTool = $state(false);

	// ==========================================================================
	// Field-value write helper (unified across form / edit / protocol)
	// ==========================================================================

	function serializeValue(value: unknown): string {
		if (value === null || value === undefined) return '';
		if (typeof value === 'object' && !(value instanceof File)) return JSON.stringify(value);
		return String(value);
	}

	/**
	 * Write a single field value. Storage is append-only: every write_mode
	 * inserts a new row, and "current value" is the latest by recorded_at.
	 * write_mode is recorded on the row purely as a render hint.
	 *   computed -> reject (server-evaluated).
	 *
	 * Files: when `value` is a File, write the binary into `file_value` instead.
	 */
	async function writeFieldValue(
		fieldDef: FieldDef,
		value: string | File | null,
		ctx: { instanceId: string; stageId: string; toolUsageId?: string }
	): Promise<void> {
		if (!detailState) return;
		const writeMode = fieldDef.write_mode;
		const nowIso = new Date().toISOString();

		if (writeMode === 'computed') {
			console.warn('[writeFieldValue] computed field is server-evaluated; skipping client write', fieldDef.id);
			return;
		}

		const isFile = value instanceof File;

		const buildPayload = (): Record<string, unknown> | FormData => {
			if (isFile) {
				const fd = new FormData();
				fd.append('instance_id', ctx.instanceId);
				fd.append('field_def_id', fieldDef.id);
				fd.append('write_mode', writeMode);
				fd.append('recorded_at', nowIso);
				fd.append('recorded_at_stage', ctx.stageId);
				if (ctx.toolUsageId) fd.append('recorded_by_action', ctx.toolUsageId);
				fd.append('value', '');
				fd.append('file_value', value as File);
				return fd;
			}
			return {
				instance_id: ctx.instanceId,
				field_def_id: fieldDef.id,
				write_mode: writeMode,
				recorded_at: nowIso,
				recorded_at_stage: ctx.stageId,
				recorded_by_action: ctx.toolUsageId ?? '',
				value: typeof value === 'string' ? value : serializeValue(value)
			};
		};

		// Append-only: singleton, observation and any other mode all insert a
		// new row. The read layer resolves "current value" as the latest.
		await gateway.collection('workflow_field_values').create(buildPayload() as any);
	}

	// ==========================================================================
	// Effects
	// ==========================================================================

	$effect(() => {
		const instanceId = selection.instanceId;
		const _count = selection.openCount; // Force re-run on re-click of same instance
		if (!instanceId) return;

		const previous = untrack(() => detailState);
		const newState = createWorkflowInstanceDetailState(instanceId, gateway, fieldValueCache);
		detailState = newState;
		activeTab = 'activity';
		activeToolFlow = null;
		activeEditTool = null;
		activeProtocolTool = null;
		isLocationPickerActive = false;
		activeLocationEditTool = null;
		geometryDrawMode = null;
		pendingConfirmConnection = null;
		showConflictTool = false;
		newState.load();

		// Check for pending conflicts on this instance
		loadConflicts(instanceId);

		previous?.dispose();
		return () => newState.dispose();
	});

	async function loadConflicts(instanceId: string) {
		try {
			const raw = await getConflictsForInstance(instanceId);
			// Re-fetch current server versions so "Current value" is up-to-date
			let conflicts: SyncConflict[];
			if (navigator.onLine) {
				const pb = getPocketBase();
				conflicts = await Promise.all(
					raw.map(async (conflict) => {
						try {
							const current = await pb.collection(conflict.collection).getOne(conflict.recordId);
							return { ...conflict, serverVersion: current as Record<string, unknown> };
						} catch {
							// Record may have been deleted; keep the snapshot
							return conflict;
						}
					})
				);
			} else {
				conflicts = raw;
			}
			// Drop conflicts whose user-visible diff is empty (phantoms from
			// bookkeeping-only drift) and mark them resolved so the banner
			// doesn't fire on stale IDB rows.
			const visible: SyncConflict[] = [];
			for (const conflict of conflicts) {
				if (getChangedFields(conflict).length > 0) {
					visible.push(conflict);
				} else {
					await resolveConflict(conflict.id);
				}
			}
			pendingConflicts = visible;
		} catch {
			pendingConflicts = [];
		}
	}

	// Sync internal location picker state with bindable prop
	// Use untrack on the write to avoid a bidirectional binding feedback loop
	$effect(() => {
		const active = isLocationPickerActive || geometryDrawMode !== null;
		untrack(() => { isEditingLocation = active; });
	});

	// ==========================================================================
	// Tab Configuration
	// ==========================================================================

	const tabs = [
		{ id: 'activity', label: participantWorkflowInstanceDetailTabActivity?.() ?? 'Activity' },
		{ id: 'data', label: participantWorkflowInstanceDetailTabData?.() ?? 'Data' },
		{ id: 'protocols', label: participantWorkflowInstanceDetailTabProtocols?.() ?? 'Protocols' }
	];

	let expandedProtocolEntry = $state<string | null>(null);
	function toggleProtocolEntry(id: string) {
		expandedProtocolEntry = expandedProtocolEntry === id ? null : id;
	}
	function formatTimestamp(iso: string): string {
		if (!iso) return '';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return iso;
		return d.toLocaleString();
	}
	function renderProtocolValue(v: unknown): string {
		if (v === null || v === undefined || v === '') return '—';
		if (typeof v === 'object') return JSON.stringify(v);
		return String(v);
	}

	// ==========================================================================
	// Computed Values
	// ==========================================================================

	const title = $derived.by(() => {
		if (activeToolFlow) {
			const currentTool = activeToolFlow.toolQueue[activeToolFlow.currentToolIndex];
			if (currentTool?.type === 'form') {
				return (currentTool.tool as any).name || 'Form';
			}
			if (currentTool?.type === 'edit') {
				return currentTool.tool.name || 'Edit';
			}
			if (currentTool?.type === 'protocol') {
				return currentTool.tool.name || 'Protocol';
			}
		}
		if (activeEditTool) {
			return activeEditTool.name || 'Edit';
		}
		if (activeProtocolTool) {
			return activeProtocolTool.name || 'Protocol';
		}
		if (activeLocationEditTool) {
			return activeLocationEditTool.name || 'Edit Location';
		}
		return detailState?.workflow?.name as string || 'Workflow';
	});

	const subtitle = $derived.by(() => {
		if (activeToolFlow) {
			return `Step ${activeToolFlow.currentToolIndex + 1} of ${activeToolFlow.toolQueue.length}`;
		}
		if (!detailState?.instance) return undefined;
		const inst = detailState.instance as any;
		const instanceFVs = (detailState.fieldValues ?? []).filter((fv) => fv.instance_id === inst.id);
		const formFields = (detailState.formFields ?? []).map((f) => ({
			id: f.id,
			field_type: f.field_type,
			field_order: f.field_order,
			page: f.page,
			row_index: f.row_index,
			column_position: f.column_position
		}));
		const label = instanceLabel({
			instance: { id: inst.id, updated: inst.updated, created: inst.created, current_stage_id: inst.current_stage_id },
			fieldValues: instanceFVs.map((fv) => ({ field_def_id: (fv as any).field_def_id, value: fv.value })),
			formFields,
			locale: 'de'
		});
		if (label.primary && label.timeAgo) return `${label.primary} · ${label.timeAgo}`;
		return label.primary || label.timeAgo || undefined;
	});

	// Build action buttons from available connections and stage edit tools
	const actions = $derived.by(() => {
		if (!detailState) return [];

		// Connection actions (transitions to next stage)
		const connectionActions = detailState.availableConnections.map(conn => ({
			id: conn.id,
			label: conn.visual_config?.button_label || conn.action_name,
			color: conn.visual_config?.button_color,
			disabled: false,
			onClick: () => handleConnectionClick(conn)
		}));

		// Stage edit tool actions (edit without transition)
		const editActions = detailState.availableStageEditTools.map(tool => ({
			id: `edit-${tool.id}`,
			label: tool.visual_config?.button_label || tool.name,
			color: tool.visual_config?.button_color,
			disabled: false,
			onClick: () => handleEditToolClick(tool)
		}));

		// Stage protocol tool actions
		const currentStageId = detailState.instance?.current_stage_id as string;
		const protocolActions = currentStageId
			? detailState.getProtocolToolsForStage(currentStageId).map(tool => ({
				id: `protocol-${tool.id}`,
				label: tool.visual_config?.button_label || tool.name,
				color: tool.visual_config?.button_color,
				disabled: false,
				onClick: () => handleProtocolToolClick(tool)
			}))
			: [];

		return [...editActions, ...protocolActions, ...connectionActions];
	});

	// ==========================================================================
	// Helpers
	// ==========================================================================

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleDateString('de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function relativeTime(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMin = Math.floor(diffMs / 60000);
		const diffH = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMin < 1) return (participantWorkflowInstanceDetailJustNow?.() ?? 'Just now');
		if (diffMin < 60) return `${diffMin}m ago`;
		if (diffH < 24) return `${diffH}h ago`;
		if (diffDays === 1) return (participantWorkflowInstanceDetailYesterday?.() ?? 'Yesterday');
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
	}

	function navigateToStageData(stageId: string) {
		if (detailState) {
			detailState.setActiveStageTab(stageId);
			activeTab = 'data';
		}
	}

	// ==========================================================================
	// Activity: group entries into stage sections
	// ==========================================================================

	interface ActivitySection {
		stageId: string;
		stageName: string;
		/** 1-based ordinal across visits to the same stage_id. */
		visitIndex: number;
		/** Total visits to the same stage_id across the whole timeline. */
		visitTotal: number;
		transitionEntry: ToolUsageRecord | null;
		entries: ToolUsageRecord[];
	}

	// Chronological stage-visit segmentation. Circular workflows visit the same
	// stage multiple times — each visit is its own segment so value rows
	// recorded during that visit appear under the correct visit, not collapsed
	// into a single per-stage bucket. Entries are bucketed by their own
	// `stage_id` (which is the destination for form_fills authored while
	// advancing) rather than strictly by executed_at, because form_fill is
	// written a few ms BEFORE the stage_transition it accompanies — using
	// strict time-window matching would mis-attribute it to the previous stage.
	const activitySections = $derived.by((): ActivitySection[] => {
		if (!detailState || detailState.toolUsageHistory.length === 0) return [];

		const ascending = [...detailState.toolUsageHistory].sort((a, b) =>
			a.executed_at.localeCompare(b.executed_at)
		);

		type Segment = {
			stageId: string;
			openedAt: string;
			transition: ToolUsageRecord | null;
			entries: ToolUsageRecord[];
		};
		const segments: Segment[] = [];

		// Initial segment. Resolve its stage_id from the first transition's
		// from_stage_id if available; otherwise fall back to the earliest
		// non-transition entry's stage_id; otherwise the instance's current
		// stage.
		const firstTransition = ascending.find((e) => e.metadata?.action === 'stage_transition');
		const initialStageId =
			(firstTransition?.metadata?.from_stage_id as string | undefined) ||
			(ascending.find((e) => e.metadata?.action !== 'stage_transition')?.stage_id as string | undefined) ||
			((detailState.instance?.current_stage_id as string | undefined) ?? '');
		segments.push({
			stageId: initialStageId,
			openedAt: (ascending[0]?.executed_at ?? new Date(0).toISOString()),
			transition: null,
			entries: []
		});

		for (const entry of ascending) {
			if (entry.metadata?.action === 'stage_transition') {
				const toStage =
					(entry.metadata.to_stage_id as string | undefined) ?? (entry.stage_id as string);
				if (!toStage) continue;
				segments.push({ stageId: toStage, openedAt: entry.executed_at, transition: entry, entries: [] });
			}
		}

		// Assign each non-transition entry to the segment whose stage_id matches
		// AND whose openedAt is closest to (but at most slightly later than)
		// the entry's executed_at. This handles form_fill-stamped-with-to-stage
		// written just before its transition.
		for (const entry of ascending) {
			if (entry.metadata?.action === 'stage_transition') continue;
			const entryStage = entry.stage_id as string | undefined;
			if (!entryStage) continue;
			const candidates = segments.filter((s) => s.stageId === entryStage);
			let target: Segment | null = null;
			if (candidates.length === 1) {
				target = candidates[0];
			} else if (candidates.length > 1) {
				// Prefer the segment whose openedAt is the latest value still
				// <= entry.executed_at + 5s (small skew tolerance for form_fill
				// written just before its transition).
				const SKEW_MS = 5_000;
				const entryT = Date.parse(entry.executed_at);
				let best: Segment | null = null;
				let bestDelta = Infinity;
				for (const c of candidates) {
					const openedT = Date.parse(c.openedAt);
					if (openedT - entryT > SKEW_MS) continue; // segment opens too far in the future
					const delta = Math.abs(entryT - openedT);
					if (delta < bestDelta) { best = c; bestDelta = delta; }
				}
				target = best ?? candidates[candidates.length - 1];
			}
			if (target) target.entries.push(entry);
		}

		const filtered = segments.filter((s) => s.transition || s.entries.length > 0);

		const totalsByStage = new Map<string, number>();
		for (const s of filtered) totalsByStage.set(s.stageId, (totalsByStage.get(s.stageId) ?? 0) + 1);
		const seenByStage = new Map<string, number>();

		const sections: ActivitySection[] = filtered.map((s) => {
			const idx = (seenByStage.get(s.stageId) ?? 0) + 1;
			seenByStage.set(s.stageId, idx);
			return {
				stageId: s.stageId,
				stageName: getStageName(s.stageId) || s.stageId,
				visitIndex: idx,
				visitTotal: totalsByStage.get(s.stageId) ?? 1,
				transitionEntry: s.transition,
				// Newest-first within a segment, matching the previous UX.
				entries: [...s.entries].sort((a, b) => b.executed_at.localeCompare(a.executed_at))
			};
		});

		sections.reverse();
		return sections;
	});

	function getEntryLabel(metadata: ToolUsageRecord['metadata']): string {
		if (!metadata?.action) return (participantWorkflowInstanceDetailEntryAction?.() ?? 'Action');
		switch (metadata.action) {
			case 'instance_created':
				return (participantWorkflowInstanceDetailEntryCreated?.() ?? 'Created');
			case 'form_fill':
				return (participantWorkflowInstanceDetailEntryDataRecorded?.() ?? 'Data recorded');
			case 'edit':
			case 'admin_edit': {
				if (metadata.changes?.length === 1) {
					const fieldDef = detailState?.formFields.find(f => f.id === metadata.changes![0].field_key);
					return `${fieldDef?.field_label || (participantWorkflowInstanceDetailFieldFallback?.() ?? 'Field')} ${(participantWorkflowInstanceDetailUpdatedSuffix?.() ?? 'updated')}`;
				}
				return metadata.action === 'admin_edit'
					? `${(participantWorkflowInstanceDetailAdminUpdated?.() ?? 'Admin updated')} ${metadata.changes?.length || ''} ${(participantWorkflowInstanceDetailFieldsNoun?.() ?? 'fields')}`
					: `${metadata.changes?.length || ''} ${(participantWorkflowInstanceDetailFieldsUpdated?.() ?? 'fields updated')}`;
			}
			case 'location_edit':
				return (participantWorkflowInstanceDetailEntryLocationUpdated?.() ?? 'Location updated');
			case 'protocol':
				return (participantWorkflowInstanceDetailEntryInspectionRecorded?.() ?? 'Inspection recorded');
			case 'conflict_resolution':
				return (participantWorkflowInstanceDetailEntryConflictResolved?.() ?? 'Sync conflict resolved');
			default:
				return (participantWorkflowInstanceDetailEntryAction?.() ?? 'Action');
		}
	}

	// ==========================================================================
	// Handlers
	// ==========================================================================

	function handleClose() {
		isOpen = false;
		activeToolFlow = null;
		activeEditTool = null;
		activeProtocolTool = null;
		onClose();
	}

	function handleTabChange(tabId: string) {
		activeTab = tabId;
	}

	function handleStageTabChange(stageId: string) {
		if (detailState) {
			detailState.setActiveStageTab(stageId);
		}
	}

	// ==========================================================================
	// Connection / Tool Flow Handlers
	// ==========================================================================

	async function handleConnectionClick(connection: WorkflowConnection) {
		if (!detailState) return;

		// Confirm up-front: tool submits persist incrementally, so gating here is
		// the only point where a cancel leaves zero partial state behind.
		if (connection.visual_config?.requires_confirmation) {
			pendingConfirmConnection = connection;
			return;
		}

		await proceedConnection(connection);
	}

	async function proceedConnection(connection: WorkflowConnection) {
		if (!detailState) return;

		// Get tools for this connection
		const toolQueue = detailState.getToolsForConnection(connection.id);

		if (toolQueue.length > 0) {
			// Has tools - start internal tool flow
			activeToolFlow = {
				instanceId: detailState.instanceId,
				connection,
				toolQueue,
				currentToolIndex: 0
			};
		} else {
			// No tools - log audit trail and execute transition directly
			const fromStageId = detailState.instance?.current_stage_id as string;
			await gateway.collection('workflow_instance_tool_usage').create({
				instance_id: detailState.instanceId,
				stage_id: fromStageId,
				executed_by: gateway.participantId,
				executed_at: new Date().toISOString(),
				metadata: {
					action: 'stage_transition',
					from_stage_id: fromStageId,
					to_stage_id: connection.to_stage_id,
					connection_id: connection.id
				}
			});
			await detailState.executeTransition(connection);
		}
	}

	function handleEditToolClick(editTool: ToolEdit) {
		if (editTool.edit_mode === 'location') {
			// Pick the editor based on the existing instance geometry: points
			// keep the single-marker picker; lines/polygons re-enter the same
			// draw tool used for instance creation so the user can fully replace
			// the shape (vertex-edit is out of scope).
			activeLocationEditTool = editTool;
			isOpen = false;
			const geomType = (detailState?.instance?.geometry as InstanceGeometry | null | undefined)?.type;
			if (geomType === 'LineString' || geomType === 'MultiLineString') {
				geometryDrawMode = 'line';
			} else if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
				geometryDrawMode = 'polygon';
			} else {
				isLocationPickerActive = true;
			}
		} else {
			// Form fields edit mode
			activeEditTool = editTool;
		}
	}

	// ==========================================================================
	// Helpers: resolve IDs to human-readable names for audit trail
	// ==========================================================================

	function getFieldName(fieldKey: string): string | undefined {
		return (
			detailState?.formFields.find(f => f.id === fieldKey)?.field_label
			?? detailState?.fieldDefsById.get(fieldKey)?.label
		);
	}

	function getStageName(stageId: string): string | undefined {
		return detailState?.stages.find(s => s.id === stageId)?.stage_name;
	}

	// ==========================================================================
	// Tool Flow: Form Submit
	// ==========================================================================

	async function handleToolFormSubmit(formValues: Record<string, unknown>, connectionId: string) {
		if (!activeToolFlow || !detailState || !gateway) return;

		const targetStageId = activeToolFlow.connection.to_stage_id;

		try {
			// Restrict the form submission to field defs actually referenced by
			// this connection's form(s); the formValues object may carry prior
			// instance values seeded for dependent-field resolution.
			const formIds = new Set(
				detailState.forms.filter(f => f.connection_id === connectionId).map(f => f.id)
			);
			const refDefIds = new Set(
				detailState.formFieldRefs.filter(r => formIds.has(r.form_id)).map(r => r.field_def_id)
			);

			const fieldEntries = Object.entries(formValues).filter(
				([fieldId, value]) => refDefIds.has(fieldId) && isMeaningfulValue(value)
			);

			// Only field identifiers go into the audit metadata — never values.
			// Values live exclusively in workflow_field_values (append-only), where
			// each row is gated by workflow_field_defs.view_roles. This prevents
			// the audit UI from leaking values to participants who can't see the
			// underlying field.
			const createdFields = fieldEntries.map(([fieldId]) => ({
				field_key: fieldId,
				field_name: getFieldName(fieldId) || fieldId
			}));

			// 1. Create tool_usage record with actual data (audit trail)
			const toolUsage = await gateway.collection('workflow_instance_tool_usage').create({
				instance_id: activeToolFlow.instanceId,
				stage_id: targetStageId,
				executed_by: gateway.participantId,
				executed_at: new Date().toISOString(),
				metadata: {
					action: 'form_fill',
					stage_name: getStageName(targetStageId) || targetStageId,
					created_fields: createdFields
				}
			}) as { id: string };

			// 2. Save field values through the unified write helper.
			for (const [fieldId, value] of fieldEntries) {
				const def = detailState.fieldDefsById.get(fieldId);
				if (!def) {
					console.warn('[handleToolFormSubmit] no field_def found for id', fieldId);
					continue;
				}
				if (Array.isArray(value) && value.length > 0 && value[0] instanceof File) {
					for (const file of value as File[]) {
						await writeFieldValue(def, file, {
							instanceId: activeToolFlow.instanceId,
							stageId: targetStageId,
							toolUsageId: toolUsage.id
						});
					}
				} else {
					await writeFieldValue(def, serializeValue(value), {
						instanceId: activeToolFlow.instanceId,
						stageId: targetStageId,
						toolUsageId: toolUsage.id
					});
				}
			}

			// Advance to next tool or complete transition
			advanceToolFlow();
		} catch (error) {
			console.error('Failed to submit tool flow form:', error);
			throw error;
		}
	}

	function advanceToolFlow() {
		if (!activeToolFlow) return;

		const nextIndex = activeToolFlow.currentToolIndex + 1;

		if (nextIndex >= activeToolFlow.toolQueue.length) {
			// All tools complete - execute transition
			executeToolFlowTransition();
		} else {
			// More tools to run
			activeToolFlow = { ...activeToolFlow, currentToolIndex: nextIndex };
		}
	}

	async function executeToolFlowTransition() {
		if (!activeToolFlow || !detailState || !gateway) return;

		const fromStageId = detailState.instance?.current_stage_id as string;
		const toStageId = activeToolFlow.connection.to_stage_id;

		try {
			const tt0 = performance.now();
			// Log stage transition (audit trail)
			await gateway.collection('workflow_instance_tool_usage').create({
				instance_id: activeToolFlow.instanceId,
				stage_id: fromStageId,
				executed_by: gateway.participantId,
				executed_at: new Date().toISOString(),
				metadata: {
					action: 'stage_transition',
					connection_id: activeToolFlow.connection.id,
					from_stage_id: fromStageId,
					from_stage_name: getStageName(fromStageId) || fromStageId,
					to_stage_id: toStageId,
					to_stage_name: getStageName(toStageId) || toStageId
				}
			});
			console.log(`[Transition] create tool_usage: ${(performance.now() - tt0).toFixed(1)}ms`);

			// Update instance to new stage
			const tt1 = performance.now();
			await gateway.collection('workflow_instances').update(activeToolFlow.instanceId, {
				current_stage_id: toStageId
			});
			console.log(`[Transition] update instance: ${(performance.now() - tt1).toFixed(1)}ms`);

			// Refresh state
			const tt2 = performance.now();
			await detailState.refresh();
			console.log(`[Transition] refresh: ${(performance.now() - tt2).toFixed(1)}ms`);
			console.log(`[Transition] TOTAL: ${(performance.now() - tt0).toFixed(1)}ms`);

			// Clear tool flow
			activeToolFlow = null;
		} catch (error) {
			console.error('Failed to execute transition:', error);
		}
	}

	function handleToolFlowCancel() {
		activeToolFlow = null;
	}

	// ==========================================================================
	// Edit Tool Handlers
	// ==========================================================================

	/**
	 * Determine the correct stage_id for a field based on which form it belongs to.
	 * This ensures field values are stored with the stage where the form is defined,
	 * not the current stage when editing via global edit tools.
	 */
	function getStageIdForField(fieldId: string): string | null {
		if (!detailState) return null;

		// Find the field definition
		const field = detailState.formFields.find(f => f.id === fieldId);
		if (!field) return null;

		// Find the form this field belongs to
		const form = detailState.forms.find(f => f.id === field.form_id);
		if (!form) return null;

		// If form is directly attached to a stage, use that
		if (form.stage_id) {
			return form.stage_id;
		}

		// If form is attached to a connection, use the connection's target stage
		if (form.connection_id) {
			const connection = detailState.connections.find(c => c.id === form.connection_id);
			if (connection) {
				return connection.to_stage_id;
			}
		}

		return null;
	}

	// Entity lookup maps for resolving IDs in history display
	// Keyed by field ID -> Map of entity ID -> label
	let historyEntityMaps = $state<Record<string, Map<string, string>>>({});

	// Load entity maps for all custom_table_selector fields
	$effect(() => {
		if (!detailState?.formFields || !gateway) return;
		const selectorFields = detailState.formFields.filter(
			(f) => f.field_type === 'custom_table_selector' && f.field_options
		);
		if (selectorFields.length === 0) return;

		loadHistoryEntityMaps(selectorFields);
	});

	async function loadHistoryEntityMaps(fields: any[]) {
		if (!gateway) return;

		// Group fields by unique source config to avoid duplicate fetches
		type SourceKey = string;
		const sourceGroups = new Map<SourceKey, { opts: any; fieldIds: string[] }>();

		for (const field of fields) {
			const opts = typeof field.field_options === 'string'
				? JSON.parse(field.field_options)
				: field.field_options;
			if (!opts?.source_type) continue;

			const key = `${opts.source_type}:${opts.custom_table_id || ''}:${opts.marker_category_id || ''}:${opts.display_field || ''}`;
			const existing = sourceGroups.get(key);
			if (existing) {
				existing.fieldIds.push(field.id);
			} else {
				sourceGroups.set(key, { opts, fieldIds: [field.id] });
			}
		}

		// Fetch all unique sources in parallel
		interface GenericNamedRow { id: string; name?: string; email?: string; title?: string; row_data?: unknown }

		const entries = Array.from(sourceGroups.entries());
		const results = await Promise.allSettled(
			entries.map(async ([, { opts }]) => {
				const entityMap = new Map<string, string>();

				switch (opts.source_type) {
					case 'participants': {
						const records = await gateway.collection<GenericNamedRow>('participants').getFullList();
						for (const r of records) entityMap.set(r.id, r.name || r.email || r.id);
						break;
					}
					case 'roles': {
						const records = await gateway.collection<GenericNamedRow>('roles').getFullList();
						for (const r of records) entityMap.set(r.id, r.name || r.id);
						break;
					}
					case 'custom_table': {
						if (opts.custom_table_id) {
							const records = await gateway.collection<GenericNamedRow>('custom_table_data').getFullList({
								filter: `table_id = "${opts.custom_table_id}"`
							});
							const displayField = opts.display_field || 'name';
							for (const r of records) {
								const rowData = typeof r.row_data === 'string' ? JSON.parse(r.row_data) : r.row_data;
								entityMap.set(r.id, String(rowData?.[displayField] ?? r.id));
							}
						}
						break;
					}
					case 'marker_category': {
						if (opts.marker_category_id) {
							const records = await gateway.collection<GenericNamedRow>('markers').getFullList({
								filter: `category_id = "${opts.marker_category_id}"`
							});
							for (const r of records) entityMap.set(r.id, r.title || r.id);
						}
						break;
					}
				}

				return entityMap;
			})
		);

		// Map results back to field IDs
		const maps: Record<string, Map<string, string>> = {};
		for (let i = 0; i < entries.length; i++) {
			const result = results[i];
			if (result.status === 'fulfilled') {
				for (const fieldId of entries[i][1].fieldIds) {
					maps[fieldId] = result.value;
				}
			} else {
				console.error(`Failed to load entities for source ${entries[i][0]}:`, result.reason);
			}
		}

		historyEntityMaps = maps;
	}

	// Format a history field value for display, resolving IDs where possible
	function formatHistoryValue(value: any, fieldKey?: string): string {
		if (value == null || value === '') return '(empty)';

		// Parse JSON string to array if needed
		let parsed = value;
		if (typeof parsed === 'string' && parsed.startsWith('[')) {
			try { parsed = JSON.parse(parsed); } catch { /* keep as string */ }
		}

		// Resolve entity IDs if we have a lookup map for this field
		if (fieldKey && historyEntityMaps[fieldKey]) {
			const entityMap = historyEntityMaps[fieldKey];
			if (Array.isArray(parsed)) {
				return parsed.map((id) => entityMap.get(String(id)) || String(id)).join(', ');
			}
			const resolved = entityMap.get(String(parsed));
			if (resolved) return resolved;
		}

		// For dropdown/multiple_choice, values are already labels
		if (Array.isArray(parsed)) return parsed.join(', ');
		return String(parsed);
	}

	async function handleEditSave(values: Record<string, unknown>) {
		// TODO(field-def-redesign): tools_edit removed; admin should convert to Form tool.
		// activeEditTool can never be set in the new world (availableStageEditTools
		// is empty), so this is effectively dead. Kept as a no-op so existing
		// callers (and ProtocolTool's editValues path) compile.
		if (!activeEditTool || !detailState || !gateway) return;
		console.warn('[handleEditSave] tools_edit is deprecated; received values for', Object.keys(values));
		activeEditTool = null;
	}

	function handleEditCancel() {
		activeEditTool = null;
	}

	// ==========================================================================
	// Protocol Tool Handlers
	// ==========================================================================

	function handleProtocolToolClick(tool: ToolProtocol) {
		activeProtocolTool = tool;
	}

	function handleProtocolCancel() {
		activeProtocolTool = null;
	}

	function sortedStringify(obj: unknown): string {
		if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
		if (Array.isArray(obj)) return '[' + obj.map(sortedStringify).join(',') + ']';
		const sorted = Object.keys(obj as Record<string, unknown>).sort();
		return '{' + sorted.map(k => JSON.stringify(k) + ':' + sortedStringify((obj as Record<string, unknown>)[k])).join(',') + '}';
	}

	async function sha256Hex(input: string): Promise<string> {
		const bytes = new TextEncoder().encode(input);
		const subtle = (globalThis as any).crypto?.subtle;
		if (subtle?.digest) {
			const buf = await subtle.digest('SHA-256', bytes);
			return Array.from(new Uint8Array(buf)).map((b: number) => b.toString(16).padStart(2, '0')).join('');
		}
		// Pure-JS SHA-256 fallback for insecure contexts (HTTP / LAN IP) where
		// window.crypto.subtle is unavailable. Produces the same hex digest.
		const K = new Uint32Array([
			0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
			0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
			0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
			0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
			0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
			0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
			0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
			0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
		]);
		const H = new Uint32Array([
			0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
		]);
		const l = bytes.length;
		const bitLen = l * 8;
		const padLen = ((l + 9 + 63) >> 6) << 6;
		const msg = new Uint8Array(padLen);
		msg.set(bytes);
		msg[l] = 0x80;
		const view = new DataView(msg.buffer);
		view.setUint32(padLen - 4, bitLen >>> 0);
		view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000));
		const W = new Uint32Array(64);
		const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
		for (let chunk = 0; chunk < padLen; chunk += 64) {
			for (let i = 0; i < 16; i++) W[i] = view.getUint32(chunk + i * 4);
			for (let i = 16; i < 64; i++) {
				const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
				const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
				W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
			}
			let [a, b, c, d, e, f, g, h] = H;
			for (let i = 0; i < 64; i++) {
				const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
				const ch = (e & f) ^ (~e & g);
				const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
				const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
				const mj = (a & b) ^ (a & c) ^ (b & c);
				const t2 = (S0 + mj) >>> 0;
				h = g; g = f; f = e; e = (d + t1) >>> 0;
				d = c; c = b; b = a; a = (t1 + t2) >>> 0;
			}
			H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
			H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
		}
		let hex = '';
		for (let i = 0; i < 8; i++) hex += H[i].toString(16).padStart(8, '0');
		return hex;
	}

	async function saveProtocol(
		protocolTool: ToolProtocol,
		caseValues: Record<string, unknown>,
		localValues: Record<string, unknown>
	) {
		if (!detailState || !gateway) return;

		const currentStageId = detailState.instance?.current_stage_id as string;

		// Resolve the protocol's form and its local fields.
		const protocolFormFields = protocolTool.protocol_form_id
			? detailState.getProtocolFormFields(protocolTool.protocol_form_id)
			: [];
		const localFields = detailState.getProtocolLocalFields(protocolTool.protocol_form_id);

		// 1. Build the snapshot in the canonical shape (kind: 'manual').
		const caseFieldsSnapshot: Array<Record<string, unknown>> = [];
		for (const field of protocolFormFields) {
			const value = caseValues[field.id];
			const entry: Record<string, unknown> = {
				field_def_id: field.id,
				key: (field as any).key ?? field.id,
				label: field.field_label,
				write_mode: field.write_mode ?? 'singleton'
			};
			if (Array.isArray(value) && value.length > 0 && value[0] instanceof File) {
				entry.value = null;
				entry.images_added = (value as File[]).map((f) => f.name);
			} else if (value !== null && value !== undefined && value !== '') {
				entry.value = typeof value === 'object' ? value : String(value);
			} else {
				entry.value = null;
			}
			caseFieldsSnapshot.push(entry);
		}

		const localFieldsSnapshot: Array<Record<string, unknown>> = [];
		for (const lf of localFields) {
			const value = localValues[lf.key];
			const entry: Record<string, unknown> = {
				key: lf.key,
				label: lf.label
			};
			if (Array.isArray(value) && value.length > 0 && value[0] instanceof File) {
				entry.value = null;
				entry.images_added = (value as File[]).map((f) => f.name);
			} else if (value !== null && value !== undefined && value !== '') {
				entry.value = typeof value === 'object' ? value : String(value);
			} else {
				entry.value = null;
			}
			localFieldsSnapshot.push(entry);
		}

		caseFieldsSnapshot.sort((a, b) => String(a.field_def_id).localeCompare(String(b.field_def_id)));
		localFieldsSnapshot.sort((a, b) => String(a.key).localeCompare(String(b.key)));

		const snapshot = {
			kind: 'manual' as const,
			case_fields: caseFieldsSnapshot,
			local_fields: localFieldsSnapshot,
			autolog: null
		};
		const snapshotJson = sortedStringify(snapshot);
		const hashHex = await sha256Hex(snapshotJson);

		// 2. Create the protocol entry. Files attach as multipart when present.
		const allValues: Record<string, unknown> = { ...caseValues };
		for (const [k, v] of Object.entries(localValues)) allValues[`local:${k}`] = v;
		const hasFiles = Object.values(allValues).some(
			(v) => Array.isArray(v) && v.length > 0 && v[0] instanceof File
		);

		let protocolEntry: { id: string };
		if (hasFiles) {
			const formData = new FormData();
			formData.append('instance_id', detailState.instanceId);
			formData.append('tool_id', protocolTool.id);
			formData.append('stage_id', currentStageId);
			formData.append('recorded_by', gateway.participantId);
			formData.append('recorded_at', new Date().toISOString());
			formData.append('snapshot', snapshotJson);
			formData.append('snapshot_hash', hashHex);
			for (const v of Object.values(allValues)) {
				if (Array.isArray(v) && v.length > 0 && v[0] instanceof File) {
					for (const file of v as File[]) formData.append('files', file);
				}
			}
			protocolEntry = (await gateway
				.collection('workflow_protocol_entries')
				.create(formData as any)) as { id: string };
		} else {
			protocolEntry = (await gateway.collection('workflow_protocol_entries').create({
				instance_id: detailState.instanceId,
				tool_id: protocolTool.id,
				stage_id: currentStageId,
				recorded_by: gateway.participantId,
				recorded_at: new Date().toISOString(),
				snapshot: snapshotJson,
				snapshot_hash: hashHex
			})) as { id: string };
		}

		// 3. tool_usage audit row. Only identifiers — never values.
		const changes: Array<{ field_key: string; field_name: string }> = [];
		for (const [fieldId, value] of Object.entries(caseValues)) {
			if (!isMeaningfulValue(value)) continue;
			changes.push({ field_key: fieldId, field_name: getFieldName(fieldId) || fieldId });
		}
		for (const lf of localFields) {
			if (!isMeaningfulValue(localValues[lf.key])) continue;
			changes.push({ field_key: `local:${lf.key}`, field_name: lf.label });
		}

		const toolUsage = (await gateway.collection('workflow_instance_tool_usage').create({
			instance_id: detailState.instanceId,
			stage_id: currentStageId,
			executed_by: gateway.participantId,
			executed_at: new Date().toISOString(),
			metadata: {
				action: 'protocol',
				stage_name: getStageName(currentStageId) || currentStageId,
				protocol_entry_id: protocolEntry.id,
				changes
			}
		})) as { id: string };

		// 4. Persist case-field values through the unified write path.
		//    Local fields live only in the snapshot — no writeFieldValue call.
		for (const [fieldId, value] of Object.entries(caseValues)) {
			if (!isMeaningfulValue(value)) continue;
			const def = detailState.fieldDefsById.get(fieldId);
			if (!def) {
				console.warn('[saveProtocol] no field_def found for id', fieldId);
				continue;
			}
			const stageId = getStageIdForField(fieldId) || currentStageId;
			if (Array.isArray(value) && value.length > 0 && value[0] instanceof File) {
				for (const file of value as File[]) {
					await writeFieldValue(def, file, {
						instanceId: detailState.instanceId,
						stageId,
						toolUsageId: toolUsage.id
					});
				}
			} else {
				await writeFieldValue(def, serializeValue(value), {
					instanceId: detailState.instanceId,
					stageId,
					toolUsageId: toolUsage.id
				});
			}
		}

		await detailState.refresh();
	}

	async function handleProtocolSave(
		caseValues: Record<string, unknown>,
		localValues: Record<string, unknown>
	) {
		if (!activeProtocolTool) return;
		await saveProtocol(activeProtocolTool, caseValues, localValues);
		activeProtocolTool = null;
	}

	// ==========================================================================
	// Location Edit Handlers
	// ==========================================================================

	async function handleLocationConfirm(coordinates: { lat: number; lng: number }) {
		if (!detailState || !gateway) return;

		try {
			// 1. Create tool_usage record with location change (audit trail).
			const locationStageId = detailState.instance?.current_stage_id as string | undefined;
			await gateway.collection('workflow_instance_tool_usage').create({
				instance_id: detailState.instanceId,
				stage_id: locationStageId,
				executed_by: gateway.participantId,
				executed_at: new Date().toISOString(),
				metadata: {
					action: 'location_edit',
					stage_name: locationStageId ? (getStageName(locationStageId) || locationStageId) : null,
					before: detailState.instance?.centroid
						? { lat: (detailState.instance.centroid as any).lat, lon: (detailState.instance.centroid as any).lon }
						: null,
					after: { lat: coordinates.lat, lon: coordinates.lng }
				}
			});

			// 2. Update instance geometry. Client-derived centroid/bbox go along
			//    for optimistic offline rendering; the pb_hook will recompute on
			//    the server so values stay authoritative.
			const newGeometry = { type: 'Point' as const, coordinates: [coordinates.lng, coordinates.lat] as [number, number] };
			await gateway.collection('workflow_instances').update(detailState.instanceId, {
				geometry: newGeometry,
				centroid: { lat: coordinates.lat, lon: coordinates.lng },
				bbox: {
					minLon: coordinates.lng,
					minLat: coordinates.lat,
					maxLon: coordinates.lng,
					maxLat: coordinates.lat
				}
			});

			// Close location picker (this triggers cleanup)
			isLocationPickerActive = false;
			activeLocationEditTool = null;

			// Refresh state (live queries auto-update the map via notifyDataChange)
			await detailState.refresh();
		} catch (error) {
			console.error('Failed to update location:', error);
		}
	}

	function handleLocationCancel() {
		isLocationPickerActive = false;
		activeLocationEditTool = null;
	}

	async function handleGeometryEditConfirm(
		feature: Feature<LineString | MultiLineString | Polygon | MultiPolygon>
	) {
		if (!detailState || !gateway) return;

		const newGeometry = feature.geometry as InstanceGeometry;
		const beforeGeometry = detailState.instance?.geometry as InstanceGeometry | null | undefined;
		const centroid = deriveCentroid(newGeometry);
		const bbox = deriveBBox(newGeometry);

		try {
			const locationStageId = detailState.instance?.current_stage_id as string | undefined;
			await gateway.collection('workflow_instance_tool_usage').create({
				instance_id: detailState.instanceId,
				stage_id: locationStageId,
				executed_by: gateway.participantId,
				executed_at: new Date().toISOString(),
				metadata: {
					action: 'location_edit',
					stage_name: locationStageId ? (getStageName(locationStageId) || locationStageId) : null,
					before_geometry_type: beforeGeometry?.type ?? null,
					after_geometry_type: newGeometry.type,
					before_centroid: detailState.instance?.centroid
						? { lat: (detailState.instance.centroid as any).lat, lon: (detailState.instance.centroid as any).lon }
						: null,
					after_centroid: centroid
				}
			});

			await gateway.collection('workflow_instances').update(detailState.instanceId, {
				geometry: newGeometry,
				centroid,
				bbox
			});

			geometryDrawMode = null;
			activeLocationEditTool = null;
			await detailState.refresh();
		} catch (error) {
			console.error('Failed to update geometry:', error);
		}
	}

	function handleGeometryEditCancel() {
		geometryDrawMode = null;
		activeLocationEditTool = null;
	}

	// ==========================================================================
	// Conflict Resolution Handlers
	// ==========================================================================

	async function handleConflictResolve(resolutions: Array<{ conflictId: string; action: 'keep_server' | 'reapply_local'; fieldsToReapply?: string[] }>) {
		if (!detailState || !gateway) return;

		for (const resolution of resolutions) {
			const conflict = pendingConflicts.find((c) => c.id === resolution.conflictId);
			if (!conflict) continue;

			if (resolution.action === 'reapply_local') {
				const localData = conflict.localVersion;
				const updateData: Record<string, unknown> = {};
				const allowedFields = resolution.fieldsToReapply
					? new Set(resolution.fieldsToReapply)
					: null;

				for (const [key, localVal] of Object.entries(localData)) {
					if (key === 'id' || key === 'created' || key === 'updated') continue;
					if (key === 'collectionId' || key === 'collectionName') continue;
					// Only re-apply fields the participant explicitly selected
					if (allowedFields && !allowedFields.has(key)) continue;
					if (JSON.stringify(localVal) !== JSON.stringify(conflict.serverVersion[key])) {
						updateData[key] = localVal;
					}
				}

				if (Object.keys(updateData).length > 0) {
					await gateway.collection(conflict.collection).update(conflict.recordId, updateData);

					// Create audit trail entry
					await gateway.collection('workflow_instance_tool_usage').create({
						instance_id: conflict.instanceId,
						stage_id: detailState.instance?.current_stage_id,
						executed_by: gateway.participantId,
						executed_at: new Date().toISOString(),
						metadata: {
							action: 'conflict_resolution',
							conflict_id: conflict.id,
							resolution: 'reapply_local',
							fields: Object.keys(updateData)
						}
					});
				}
			}

			// Mark conflict as resolved regardless of action
			await resolveConflict(resolution.conflictId);
		}

		// Refresh
		pendingConflicts = [];
		showConflictTool = false;
		await detailState.refresh();
	}

	function handleConflictCancel() {
		showConflictTool = false;
	}
</script>

<ModuleShell
	bind:isOpen
	bind:isExpanded
	{title}
	{subtitle}
	isLoading={detailState?.isLoading ?? true}
	error={detailState?.loadError}
	onClose={handleClose}
>
	{#snippet content()}
		<!-- Check if we're in a tool flow or edit mode -->
		{#if activeToolFlow}
			{@const currentTool = activeToolFlow.toolQueue[activeToolFlow.currentToolIndex]}
			{#if currentTool?.type === 'form'}
				<FormFillTool
					workflowId={activeToolFlow.connection.workflow_id}
					connectionId={activeToolFlow.connection.id}
					existingFieldValues={detailState?.fieldValues}
					{participantRoleIds}
					onSubmit={handleToolFormSubmit}
					onCancel={handleToolFlowCancel}
				/>
			{:else if currentTool?.type === 'protocol' && detailState}
				{@const protocolToolInFlow = currentTool.tool as ToolProtocol}
				<ProtocolTool
					protocolTool={protocolToolInFlow}
					instanceId={detailState.instanceId}
					protocolFormFields={protocolToolInFlow.protocol_form_id ? detailState.getProtocolFormFields(protocolToolInFlow.protocol_form_id) : []}
					localFields={detailState.getProtocolLocalFields(protocolToolInFlow.protocol_form_id)}
					onSave={async (caseValues, localValues) => {
						await saveProtocol(protocolToolInFlow, caseValues, localValues);
						advanceToolFlow();
					}}
					onCancel={handleToolFlowCancel}
				/>
			{/if}
		{:else if showConflictTool && pendingConflicts.length > 0 && detailState}
			<ConflictResolutionTool
				conflicts={pendingConflicts}
				formFields={detailState.formFields}
				onResolve={handleConflictResolve}
				onCancel={handleConflictCancel}
			/>
		{:else if activeProtocolTool && detailState}
			<ProtocolTool
				protocolTool={activeProtocolTool}
				instanceId={detailState.instanceId}
				protocolFormFields={activeProtocolTool.protocol_form_id ? detailState.getProtocolFormFields(activeProtocolTool.protocol_form_id) : []}
				localFields={detailState.getProtocolLocalFields(activeProtocolTool.protocol_form_id)}
				onSave={handleProtocolSave}
				onCancel={handleProtocolCancel}
			/>
		{:else}
			<!-- Normal detail view with tabs -->
			<div class="p-4">
				<!-- Conflict Banner -->
				{#if pendingConflicts.length > 0}
					<button
						class="mb-4 flex w-full items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-left transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:hover:bg-amber-900"
						onclick={() => (showConflictTool = true)}
					>
						<AlertTriangle class="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
						<span class="text-sm text-amber-800 dark:text-amber-200">
							{pendingConflicts.length === 1
								? (participantWorkflowInstanceDetailConflictOne?.() ?? 'One of your changes was overridden. Tap to review.')
								: (participantWorkflowInstanceDetailConflictMany?.({ count: pendingConflicts.length }) ?? `${pendingConflicts.length} changes were overridden. Tap to review.`)}
						</span>
					</button>
				{/if}

				<!-- Action Roll Bar -->
				{#if actions.length > 0}
					<div class="mb-4">
						<div class="flex gap-2.5 overflow-x-auto pb-2 scrollbar-thin">
							{#each actions as action}
								<button
									class="action-btn group relative flex flex-col items-center justify-center
										min-w-[72px] max-w-[120px] min-h-[56px] px-3 py-2.5
										rounded-xl flex-shrink-0
										transition-all duration-200 ease-out
										hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98]
										disabled:opacity-50 disabled:pointer-events-none"
									class:action-btn-colored={action.color}
									class:action-btn-default={!action.color}
									style={action.color ? `--btn-color: ${action.color}` : undefined}
									disabled={action.disabled}
									onclick={action.onClick}
								>
									<span class="text-xs font-semibold text-center leading-snug line-clamp-2">
										{action.label}
									</span>
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Tabs -->
				<Tabs.Root
					value={activeTab}
					onValueChange={(v) => handleTabChange(v as string)}
					class="flex-1 flex flex-col min-h-0"
				>
					<Tabs.List
						class="grid w-full flex-shrink-0"
						style="grid-template-columns: repeat({tabs.length}, minmax(0, 1fr))"
					>
						{#each tabs as tab}
							<Tabs.Trigger value={tab.id} class="text-xs sm:text-sm" data-testid="tab-{tab.id}">
								{tab.label}
							</Tabs.Trigger>
						{/each}
					</Tabs.List>

					<Tabs.Content value="activity" class="pt-4">
						<!-- ACTIVITY TAB - Grouped by stage -->
						{#if activitySections.length === 0}
							<div class="text-center py-12 text-muted-foreground">
								<p class="text-sm">{participantWorkflowInstanceDetailNoActivity?.() ?? 'No activity yet'}</p>
							</div>
						{:else}
							<div class="space-y-1">
								{#each activitySections as section, sectionIndex}
									<!-- Stage header -->
									{#if section.transitionEntry}
										{@const transBy = section.transitionEntry.metadata?.action === 'admin_edit' ? 'Admin' : (section.transitionEntry.expand?.executed_by?.name || section.transitionEntry.expand?.executed_by?.email || '')}
										<button
											class="w-full flex items-center gap-3 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 px-3 py-2 text-left transition-colors hover:bg-blue-100 dark:hover:bg-blue-900/50"
											class:mt-2={sectionIndex > 0}
											onclick={() => navigateToStageData(section.stageId)}
										>
											<div class="flex-1 min-w-0">
												<p class="text-sm font-semibold text-blue-900 dark:text-blue-100">
													{participantWorkflowInstanceDetailMovedTo?.({ stageName: section.stageName }) ?? `Moved to: ${section.stageName}`}{section.visitTotal > 1 ? ` ${participantWorkflowInstanceDetailVisitSuffix?.({ index: section.visitIndex, total: section.visitTotal }) ?? `(visit ${section.visitIndex} of ${section.visitTotal})`}` : ''}
												</p>
												<p class="text-xs text-blue-700/70 dark:text-blue-300/70">
													{relativeTime(section.transitionEntry.executed_at)}{transBy ? ` \u00b7 ${transBy}` : ''}
												</p>
											</div>
											<ChevronRight class="w-4 h-4 text-blue-400 shrink-0" />
										</button>
									{:else}
										<!-- Initial stage (no transition into it) -->
										<div
											class="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50"
											class:mt-2={sectionIndex > 0}
										>
											<div class="h-2 w-2 rounded-full bg-green-500 shrink-0"></div>
											<p class="text-sm font-semibold text-foreground">{section.stageName}{section.visitTotal > 1 ? ` ${participantWorkflowInstanceDetailVisitSuffix?.({ index: section.visitIndex, total: section.visitTotal }) ?? `(visit ${section.visitIndex} of ${section.visitTotal})`}` : ''}</p>
										</div>
									{/if}

									<!-- Entries within this stage -->
									{#if section.entries.length > 0}
										<div class="border-l-2 border-border ml-3 pl-3 space-y-0.5">
											{#each section.entries as entry, entryIndex (entry.id)}
												{@const metadata = (entry.metadata ?? {}) as NonNullable<ToolUsageRecord['metadata']>}
												{@const prevEntry = entryIndex > 0 ? section.entries[entryIndex - 1] : null}
												{@const executedBy = metadata.action === 'admin_edit' ? 'Admin' : (entry.expand?.executed_by?.name || entry.expand?.executed_by?.email || 'Unknown')}
												{@const showActor = !prevEntry || (prevEntry.expand?.executed_by?.name || prevEntry.expand?.executed_by?.email) !== (entry.expand?.executed_by?.name || entry.expand?.executed_by?.email) || (prevEntry.metadata?.action === 'admin_edit') !== (metadata.action === 'admin_edit')}
												{@const hasExpandableContent = (metadata.action === 'instance_created' || metadata.action === 'form_fill') && Array.isArray(metadata.created_fields) && metadata.created_fields.length > 2}
												{@const label = getEntryLabel(metadata)}
												{@const valuesForEntry = detailState?.fieldValues.filter((fv) => (fv as any).recorded_by_action === entry.id) ?? []}

												<details class="group" data-testid="activity-entry">
													<summary class="flex items-baseline justify-between gap-2 py-1.5 cursor-pointer select-none hover:bg-muted/30 -mx-1 px-1 rounded">
														<div class="flex items-baseline gap-1.5 min-w-0">
															<span class="text-xs font-medium text-foreground shrink-0">{label}</span>
															{#if showActor}
																<span class="text-[11px] text-muted-foreground shrink-0">{executedBy}</span>
															{/if}
														</div>
														<span class="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
															{relativeTime(entry.executed_at)}
														</span>
													</summary>

													<div class="pb-2 pt-0.5">
														<!-- Field rows render from workflow_field_values keyed by recorded_by_action.
														     Values live exclusively there, gated row-by-row by workflow_field_defs.view_roles. -->
														<!-- instance_created -->
														{#if metadata.action === 'instance_created'}
															{#if metadata.centroid}
																<div class="flex gap-1.5 text-xs mb-0.5">
																	<span class="text-muted-foreground shrink-0">{participantWorkflowInstanceDetailLocationLabel?.() ?? 'Location'}:</span>
																	<span class="font-medium truncate">{metadata.centroid.lat.toFixed(5)}, {metadata.centroid.lon.toFixed(5)}{metadata.geometry_type && metadata.geometry_type !== 'Point' ? ` (${metadata.geometry_type})` : ''}</span>
																</div>
															{/if}
															{#each valuesForEntry as fv (fv.id)}
																{@const defId = (fv as any).field_def_id as string}
																{@const fieldDef = detailState?.formFields.find((f) => f.id === defId)}
																<div class="flex gap-1.5 text-xs mb-0.5">
																	<span class="text-muted-foreground shrink-0">{fieldDef?.field_label || detailState?.fieldDefsById.get(defId)?.label || defId}:</span>
																	<span class="font-medium truncate">{formatHistoryValue((fv as any).value, defId)}</span>
																</div>
															{/each}
														{/if}

														<!-- form_fill -->
														{#if metadata.action === 'form_fill'}
															{#each valuesForEntry as fv (fv.id)}
																{@const defId = (fv as any).field_def_id as string}
																{@const fieldDef = detailState?.formFields.find((f) => f.id === defId)}
																<div class="flex gap-1.5 text-xs mb-0.5">
																	<span class="text-muted-foreground shrink-0">{fieldDef?.field_label || detailState?.fieldDefsById.get(defId)?.label || defId}:</span>
																	<span class="font-medium truncate">{formatHistoryValue((fv as any).value, defId)}</span>
																</div>
															{/each}
														{/if}

														<!-- edit / admin_edit -->
														{#if metadata.action === 'edit' || metadata.action === 'admin_edit'}
															{#each valuesForEntry as fv (fv.id)}
																{@const defId = (fv as any).field_def_id as string}
																{@const fieldDef = detailState?.formFields.find((f) => f.id === defId)}
																<div class="text-xs mb-0.5">
																	<span class="text-muted-foreground">{fieldDef?.field_label || detailState?.fieldDefsById.get(defId)?.label || defId}: </span>
																	<span class="font-medium">{formatHistoryValue((fv as any).value, defId)}</span>
																</div>
															{/each}
														{/if}

														<!-- location_edit -->
														{#if metadata.action === 'location_edit'}
															<div class="text-xs">
																{#if metadata.before}
																	<span class="line-through text-muted-foreground/60">{metadata.before.lat.toFixed(5)}, {metadata.before.lon.toFixed(5)}</span>
																{:else}
																	<span class="text-muted-foreground">({participantWorkflowInstanceDetailNoLocation?.() ?? 'no location'})</span>
																{/if}
																<span class="text-muted-foreground mx-0.5">-></span>
																{#if metadata.after}
																	<span class="font-medium">{metadata.after.lat.toFixed(5)}, {metadata.after.lon.toFixed(5)}</span>
																{/if}
															</div>
														{/if}

														<!-- protocol -->
														{#if metadata.action === 'protocol'}
															{#each valuesForEntry as fv (fv.id)}
																{@const defId = (fv as any).field_def_id as string}
																{@const fieldDef = detailState?.formFields.find((f) => f.id === defId)}
																<div class="text-xs mb-0.5">
																	<span class="text-muted-foreground">{fieldDef?.field_label || detailState?.fieldDefsById.get(defId)?.label || defId}: </span>
																	<span class="font-medium">{formatHistoryValue((fv as any).value, defId)}</span>
																</div>
															{/each}
														{/if}

														<!-- Photo thumbnails -->
														{#if metadata.action === 'form_fill' || metadata.action === 'instance_created' || metadata.action === 'protocol'}
															{@const fileValues = detailState?.fieldValues.filter(fv => fv.file_value && (fv as any).recorded_by_action === entry.id) ?? []}
															{#if fileValues.length > 0}
																<div class="flex gap-1.5 mt-1.5 flex-wrap">
																	{#each fileValues.slice(0, 4) as fv}
																		<FieldValueImage
																			recordId={fv.id}
																			fileName={fv.file_value}
																			alt={participantWorkflowInstanceDetailAttachmentAlt?.() ?? 'Attachment'}
																			class="h-12 w-12 rounded object-cover border border-border"
																		/>
																	{/each}
																	{#if fileValues.length > 4}
																		<div class="h-12 w-12 rounded border border-border bg-muted flex items-center justify-center text-xs text-muted-foreground">
																			+{fileValues.length - 4}
																		</div>
																	{/if}
																</div>
															{/if}
														{/if}
													</div>
												</details>
											{/each}
										</div>
									{/if}
								{/each}
								{#if detailState && detailState.hasMoreOlderValues}
									<div class="pt-3 flex justify-center">
										<button
											type="button"
											class="text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
											disabled={detailState.loadingOlderValues || !navigator.onLine}
											title={navigator.onLine ? '' : (participantWorkflowInstanceDetailLoadOlderOfflineHint?.() ?? 'Online required to load older activity')}
											onclick={() => detailState && detailState.loadOlderFieldValues()}
										>
											{participantWorkflowInstanceDetailLoadOlder?.() ?? 'Load older activity'}
										</button>
									</div>
								{/if}
							</div>
						{/if}
					</Tabs.Content>

					<Tabs.Content value="data" class="pt-4">
						{@const ds = detailState}
						{@const stagesWithData = ds
							? ds.stages.filter((s) => ds.stageHasData(s.id))
							: []}
						<!-- DATA TAB with Stage Sub-tabs -->
						<div class="space-y-4">
							{#if ds && stagesWithData.length > 0}
								<Tabs.Root
									value={ds.activeStageTab}
									onValueChange={(v) => handleStageTabChange(v as string)}
								>
									<Tabs.List class="w-full overflow-x-auto flex-nowrap">
										{#each stagesWithData as stage}
											<Tabs.Trigger value={stage.id} class="text-xs whitespace-nowrap">
												{stage.stage_name}
											</Tabs.Trigger>
										{/each}
									</Tabs.List>

									{#each stagesWithData as stage}
										<Tabs.Content value={stage.id} class="pt-4">
											{@const fields = ds.getFieldsForFormRenderer(stage.id) as import('$lib/components/form-renderer').FormFieldWithValue[]}
											<ViewFieldsTool {fields} />
										</Tabs.Content>
									{/each}
								</Tabs.Root>
							{:else}
								<div class="text-center py-8 text-muted-foreground">
									<p class="text-sm">{participantWorkflowInstanceDetailNoData?.() ?? 'No data yet'}</p>
								</div>
							{/if}
						</div>
					</Tabs.Content>

					<Tabs.Content value="protocols" class="pt-4">
						{@const ds = detailState}
						{#if !ds || ds.protocolEntries.length === 0}
							<div class="text-center py-12 text-muted-foreground">
								<p class="text-sm">{participantWorkflowInstanceDetailProtocolHistoryEmpty?.() ?? 'No protocols recorded for this case yet.'}</p>
							</div>
						{:else}
							<div class="space-y-2">
								{#each ds.protocolEntries as entry (entry.id)}
									{@const expanded = expandedProtocolEntry === entry.id}
									<div class="rounded-lg border border-border bg-background">
										<button
											type="button"
											class="w-full flex items-center justify-between p-3 text-left hover:bg-muted/40"
											onclick={() => toggleProtocolEntry(entry.id)}
										>
											<div class="flex flex-col">
												<span class="text-sm font-medium">
													{entry.tool_name ?? (entry.kind === 'global_autolog' ? 'Audit log' : 'Protocol')}
												</span>
												<span class="text-xs text-muted-foreground">
													{formatTimestamp(entry.recorded_at)}
												</span>
											</div>
											<span class="text-xs text-muted-foreground">
												{entry.kind === 'global_autolog' ? 'auto' : 'manual'}
											</span>
										</button>

										{#if expanded}
											<div class="border-t border-border p-3 space-y-3">
												{#if entry.kind === 'global_autolog' && entry.autolog}
													<p class="text-xs text-muted-foreground">
														{participantWorkflowInstanceDetailProtocolAutologSummary?.({
															count: entry.autolog.entries.length,
															from: formatTimestamp(entry.autolog.from),
															to: formatTimestamp(entry.autolog.to)
														}) ?? `${entry.autolog.entries.length} audit entries between ${formatTimestamp(entry.autolog.from)} and ${formatTimestamp(entry.autolog.to)}.`}
													</p>
												{/if}

												{#if entry.case_fields.length > 0}
													<dl class="text-xs space-y-1">
														{#each entry.case_fields as cf (cf.field_def_id)}
															<div class="flex justify-between gap-3">
																<dt class="text-muted-foreground">{cf.label}</dt>
																<dd class="font-medium text-right break-all">{renderProtocolValue(cf.value)}</dd>
															</div>
														{/each}
													</dl>
												{/if}

												{#if entry.local_fields.length > 0}
													<dl class="text-xs space-y-1 pt-2 border-t border-border">
														{#each entry.local_fields as lf (lf.key)}
															<div class="flex justify-between gap-3">
																<dt class="text-muted-foreground italic">{lf.label}</dt>
																<dd class="font-medium text-right break-all">{renderProtocolValue(lf.value)}</dd>
															</div>
														{/each}
													</dl>
												{/if}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</Tabs.Content>
				</Tabs.Root>
			</div>
		{/if}
	{/snippet}
</ModuleShell>

<!-- Connection confirmation dialog (shown immediately on button click) -->
<AlertDialog.Root
	open={pendingConfirmConnection !== null}
	onOpenChange={(open) => {
		if (!open) pendingConfirmConnection = null;
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>
				{pendingConfirmConnection?.visual_config?.button_label || pendingConfirmConnection?.action_name || (participantWorkflowInstanceDetailConfirmAction?.() ?? 'Confirm action')}
			</AlertDialog.Title>
			<AlertDialog.Description>
				{pendingConfirmConnection?.visual_config?.confirmation_message || (participantWorkflowInstanceDetailConfirmProceed?.() ?? 'Are you sure you want to proceed?')}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{commonCancel?.() ?? 'Cancel'}</AlertDialog.Cancel>
			<AlertDialog.Action
				onclick={async () => {
					const connection = pendingConfirmConnection;
					pendingConfirmConnection = null;
					if (connection) await proceedConnection(connection);
				}}
			>
				{mapWorkflowContinue?.() ?? 'Continue'}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Location Edit Tool (rendered as map overlay).
     Point instances use the single-marker picker. Line/polygon instances
     redraw from scratch with the same draw tool used during creation. -->
{#if geometryDrawMode && map && detailState}
	<GeometryDrawTool
		{map}
		mode={geometryDrawMode}
		onConfirm={handleGeometryEditConfirm}
		onCancel={handleGeometryEditCancel}
	/>
{/if}
{#if isLocationPickerActive && map && detailState}
	{@const centroid = detailState.instance?.centroid as { lat: number; lon: number } | null}
	{@const buttonLabel = (activeLocationEditTool?.visual_config?.button_label as string) || 'Update Location'}
	<LocationEditTool
		{map}
		initialCoordinates={centroid ? { lat: centroid.lat, lng: centroid.lon } : null}
		confirmLabel={buttonLabel}
		bind:isActive={isLocationPickerActive}
		onConfirm={handleLocationConfirm}
		onCancel={handleLocationCancel}
	/>
{/if}

<style>
	/* Action Button - Default (no custom color) */
	.action-btn-default {
		background-color: hsl(var(--secondary));
		color: hsl(var(--secondary-foreground));
		border: 1px solid hsl(var(--border));
		box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.05), 0 1px 2px -1px rgb(0 0 0 / 0.05);
	}

	.action-btn-default:hover {
		background-color: hsl(var(--accent));
		border-color: hsl(var(--accent));
	}

	:global(.dark) .action-btn-default {
		background-color: hsl(var(--secondary) / 0.8);
		border-color: hsl(var(--border) / 0.5);
	}

	:global(.dark) .action-btn-default:hover {
		background-color: hsl(var(--accent));
		border-color: hsl(var(--accent));
	}

	/* Action Button - With custom color */
	.action-btn-colored {
		background-color: var(--btn-color);
		color: white;
		border: 1px solid transparent;
		box-shadow:
			0 2px 4px -1px color-mix(in srgb, var(--btn-color) 40%, transparent),
			0 1px 2px -1px color-mix(in srgb, var(--btn-color) 30%, transparent);
		text-shadow: 0 1px 1px rgb(0 0 0 / 0.15);
	}

	.action-btn-colored:hover {
		filter: brightness(1.08);
		box-shadow:
			0 4px 8px -2px color-mix(in srgb, var(--btn-color) 45%, transparent),
			0 2px 4px -2px color-mix(in srgb, var(--btn-color) 35%, transparent);
	}

	:global(.dark) .action-btn-colored {
		background-color: color-mix(in srgb, var(--btn-color) 85%, black);
		box-shadow:
			0 2px 6px -1px color-mix(in srgb, var(--btn-color) 35%, transparent),
			0 0 0 1px color-mix(in srgb, var(--btn-color) 50%, transparent);
	}

	:global(.dark) .action-btn-colored:hover {
		background-color: color-mix(in srgb, var(--btn-color) 95%, black);
		filter: brightness(1.1);
	}

	/* Line clamp for button text */
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
