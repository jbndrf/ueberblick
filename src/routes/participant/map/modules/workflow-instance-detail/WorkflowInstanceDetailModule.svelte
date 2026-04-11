<script lang="ts">
	import { untrack } from 'svelte';
	import ModuleShell from '$lib/components/module-shell.svelte';
	import { getParticipantGateway } from '$lib/participant-state/context.svelte';
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
	import type { WorkflowInstanceSelection } from '../types';
	import * as Tabs from '$lib/components/ui/tabs';
	import { ChevronRight } from 'lucide-svelte';
	import { FormFillTool, EditFieldsTool, ViewFieldsTool, LocationEditTool, ConflictResolutionTool, ProtocolTool } from './tools';
	import { getConflictsForInstance, resolveConflict } from '$lib/participant-state/sync.svelte';
	import type { SyncConflict } from '$lib/participant-state/db';
	import { getPocketBase } from '$lib/pocketbase';
	import { AlertTriangle } from 'lucide-svelte';
	import type { Map as LeafletMap } from 'leaflet';

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
		onClose: () => void;
	}

	let { selection, isExpanded = $bindable(false), map = null, isEditingLocation = $bindable(false), fieldValueCache, onClose }: Props = $props();

	// ==========================================================================
	// State
	// ==========================================================================

	const gateway = getParticipantGateway();
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

	// Conflict resolution state
	let pendingConflicts = $state<SyncConflict[]>([]);
	let showConflictTool = $state(false);

	// ==========================================================================
	// Effects
	// ==========================================================================

	$effect(() => {
		const instanceId = selection.instanceId;
		const _count = selection.openCount; // Force re-run on re-click of same instance
		if (!gateway || !instanceId) return;

		const newState = createWorkflowInstanceDetailState(instanceId, gateway, fieldValueCache);
		detailState = newState;
		activeTab = 'activity';
		activeToolFlow = null;
		activeEditTool = null;
		activeProtocolTool = null;
		isLocationPickerActive = false;
		activeLocationEditTool = null;
		showConflictTool = false;
		newState.load();

		// Check for pending conflicts on this instance
		loadConflicts(instanceId);
	});

	async function loadConflicts(instanceId: string) {
		try {
			const raw = await getConflictsForInstance(instanceId);
			// Re-fetch current server versions so "Current value" is up-to-date
			if (navigator.onLine) {
				const pb = getPocketBase();
				const refreshed = await Promise.all(
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
				pendingConflicts = refreshed;
			} else {
				pendingConflicts = raw;
			}
		} catch {
			pendingConflicts = [];
		}
	}

	// Sync internal location picker state with bindable prop
	// Use untrack on the write to avoid a bidirectional binding feedback loop
	$effect(() => {
		const active = isLocationPickerActive;
		untrack(() => { isEditingLocation = active; });
	});

	// ==========================================================================
	// Tab Configuration
	// ==========================================================================

	const tabs = [
		{ id: 'activity', label: 'Activity' },
		{ id: 'data', label: 'Data' }
	];

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
		return undefined;
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

		if (diffMin < 1) return 'Just now';
		if (diffMin < 60) return `${diffMin}m ago`;
		if (diffH < 24) return `${diffH}h ago`;
		if (diffDays === 1) return 'Yesterday';
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
		transitionEntry: ToolUsageRecord | null;
		entries: ToolUsageRecord[];
	}

	const activitySections = $derived.by((): ActivitySection[] => {
		if (!detailState || detailState.toolUsageHistory.length === 0) return [];

		const sections: ActivitySection[] = [];
		// Walk newest-first. Accumulate entries until we hit a stage_transition.
		// That transition marks the boundary -- everything collected belongs to
		// the stage that transition moved INTO (to_stage_id).
		let currentEntries: ToolUsageRecord[] = [];
		let currentStageId = detailState.instance?.current_stage_id as string;

		for (const entry of detailState.toolUsageHistory) {
			if (entry.metadata.action === 'stage_transition') {
				// Flush accumulated entries as a section for the stage we were in
				sections.push({
					stageId: currentStageId,
					stageName: getStageName(currentStageId) || currentStageId,
					transitionEntry: entry,
					entries: currentEntries
				});
				// Move backwards to the from-stage
				currentStageId = entry.metadata.from_stage_id || currentStageId;
				currentEntries = [];
			} else {
				currentEntries.push(entry);
			}
		}

		// Remaining entries belong to the initial stage (before any transitions)
		if (currentEntries.length > 0) {
			sections.push({
				stageId: currentStageId,
				stageName: getStageName(currentStageId) || currentStageId,
				transitionEntry: null,
				entries: currentEntries
			});
		}

		return sections;
	});

	function getEntryLabel(metadata: ToolUsageRecord['metadata']): string {
		switch (metadata.action) {
			case 'instance_created':
				return 'Created';
			case 'form_fill':
				return 'Data recorded';
			case 'edit':
			case 'admin_edit': {
				if (metadata.changes?.length === 1) {
					const fieldDef = detailState?.formFields.find(f => f.id === metadata.changes![0].field_key);
					return `${fieldDef?.field_label || 'Field'} updated`;
				}
				return metadata.action === 'admin_edit'
					? `Admin updated ${metadata.changes?.length || ''} fields`
					: `${metadata.changes?.length || ''} fields updated`;
			}
			case 'location_edit':
				return 'Location updated';
			case 'protocol':
				return 'Inspection recorded';
			case 'conflict_resolution':
				return 'Sync conflict resolved';
			default:
				return 'Action';
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
			// Location edit mode - show map picker
			activeLocationEditTool = editTool;
			isLocationPickerActive = true;
			// Close sheet so user has full map view for location editing
			isOpen = false;
		} else {
			// Form fields edit mode
			activeEditTool = editTool;
		}
	}

	// ==========================================================================
	// Helpers: resolve IDs to human-readable names for audit trail
	// ==========================================================================

	function getFieldName(fieldKey: string): string | undefined {
		return detailState?.formFields.find(f => f.id === fieldKey)?.field_label;
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
			// Build list of field values for audit log
			const fieldEntries = Object.entries(formValues).filter(
				([_, value]) => value !== null && value !== undefined && value !== ''
			);

			const createdFields = fieldEntries.map(([fieldId, value]) => ({
				field_key: fieldId,
				field_name: getFieldName(fieldId) || fieldId,
				value: Array.isArray(value) && value[0] instanceof File
					? `[${(value as File[]).length} file(s)]`
					: typeof value === 'object' ? JSON.stringify(value) : String(value)
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

			// 2. Save form field values with link to tool_usage

			for (const [fieldId, value] of fieldEntries) {
				if (Array.isArray(value) && value.length > 0 && value[0] instanceof File) {
					// File upload - create separate record for each file
					for (const file of value as File[]) {
						const formData = new FormData();
						formData.append('instance_id', activeToolFlow.instanceId);
						formData.append('field_key', fieldId);
						formData.append('stage_id', targetStageId);
						formData.append('value', '');
						formData.append('file_value', file);
						formData.append('created_by_action', toolUsage.id);

						await gateway.collection('workflow_instance_field_values').create(formData as any);
					}
				} else {
					// Regular value
					const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

					await gateway.collection('workflow_instance_field_values').create({
						instance_id: activeToolFlow.instanceId,
						field_key: fieldId,
						stage_id: targetStageId,
						value: stringValue,
						created_by_action: toolUsage.id
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
		const entries = Array.from(sourceGroups.entries());
		const results = await Promise.allSettled(
			entries.map(async ([, { opts }]) => {
				const entityMap = new Map<string, string>();

				switch (opts.source_type) {
					case 'participants': {
						const records = await gateway.collection('participants').getFullList();
						for (const r of records) entityMap.set(r.id, r.name || r.email || r.id);
						break;
					}
					case 'roles': {
						const records = await gateway.collection('roles').getFullList();
						for (const r of records) entityMap.set(r.id, r.name || r.id);
						break;
					}
					case 'custom_table': {
						if (opts.custom_table_id) {
							const records = await gateway.collection('custom_table_data').getFullList({
								filter: `table_id = "${opts.custom_table_id}"`
							});
							const displayField = opts.display_field || 'name';
							for (const r of records) {
								const rowData = typeof r.row_data === 'string' ? JSON.parse(r.row_data) : r.row_data;
								entityMap.set(r.id, rowData?.[displayField] || r.id);
							}
						}
						break;
					}
					case 'marker_category': {
						if (opts.marker_category_id) {
							const records = await gateway.collection('markers').getFullList({
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
		if (!activeEditTool || !detailState || !gateway) return;

		const currentStageId = detailState.instance?.current_stage_id as string;

		try {
			// Build changes array for audit log (before/after values)
			const changes: Array<{ field_key: string; before: string | null; after: string }> = [];
			for (const [fieldId, newValue] of Object.entries(values)) {
				if (newValue === null || newValue === undefined || newValue === '') continue;

				const existing = detailState.fieldValues.find(fv => fv.field_key === fieldId);
				const oldValue = existing?.value || null;
				const newValueStr = Array.isArray(newValue) && newValue[0] instanceof File
					? `[${(newValue as File[]).length} file(s)]`
					: typeof newValue === 'object' ? JSON.stringify(newValue) : String(newValue);

				// Only log if actually changed (or new)
				if (oldValue !== newValueStr) {
					changes.push({ field_key: fieldId, field_name: getFieldName(fieldId) || fieldId, before: oldValue, after: newValueStr });
				}
			}

			// 1. Create tool_usage record with actual changes (audit trail)
			const toolUsage = await gateway.collection('workflow_instance_tool_usage').create({
				instance_id: detailState.instanceId,
				stage_id: currentStageId,
				executed_by: gateway.participantId,
				executed_at: new Date().toISOString(),
				metadata: {
					action: 'edit',
					stage_name: getStageName(currentStageId) || currentStageId,
					changes: changes
				}
			}) as { id: string };

			// 2. Update or create field values with link to tool_usage
			for (const [fieldId, value] of Object.entries(values)) {
				if (value === null || value === undefined || value === '') continue;

				// Find existing field value (by field_key only - the value may have been created in an earlier stage)
				const existing = detailState.fieldValues.find(
					fv => fv.field_key === fieldId
				);

				// Determine the correct stage_id for this field (based on its form, not current stage)
				const fieldStageId = getStageIdForField(fieldId) || currentStageId;

				if (Array.isArray(value) && value.length > 0 && value[0] instanceof File) {
					// File upload - create separate record for each file
					for (const file of value as File[]) {
						const formData = new FormData();
						formData.append('instance_id', detailState.instanceId);
						formData.append('field_key', fieldId);
						formData.append('stage_id', fieldStageId);
						formData.append('value', '');
						formData.append('file_value', file);
						formData.append('created_by_action', toolUsage.id);

						await gateway.collection('workflow_instance_field_values').create(formData as any);
					}
				} else {
					// Regular value
					const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

					if (existing) {
						// Update existing - link with last_modified_by_action
						await gateway.collection('workflow_instance_field_values').update(existing.id, {
							value: stringValue,
							last_modified_by_action: toolUsage.id,
							last_modified_at: new Date().toISOString()
						});
					} else {
						// Create new - use the field's original stage, not current stage
						await gateway.collection('workflow_instance_field_values').create({
							instance_id: detailState.instanceId,
							field_key: fieldId,
							stage_id: fieldStageId,
							value: stringValue,
							created_by_action: toolUsage.id
						});
					}
				}
			}

			// Refresh state and close edit
			await detailState.refresh();
			activeEditTool = null;
		} catch (error) {
			console.error('Failed to save edit:', error);
			throw error;
		}
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

	async function saveProtocol(protocolTool: ToolProtocol, editValues: Record<string, unknown>, protocolValues: Record<string, unknown>) {
		if (!detailState || !gateway) return;

		const currentStageId = detailState.instance?.current_stage_id as string;

		// 1. Build deterministic snapshot of protocol values
		const snapshotFields: Array<Record<string, unknown>> = [];
		const protocolFormFields = protocolTool.protocol_form_id
			? detailState.getProtocolFormFields(protocolTool.protocol_form_id)
			: [];

		for (const field of protocolFormFields) {
			const value = protocolValues[field.id];
			const entry: Record<string, unknown> = {
				id: field.id,
				name: field.field_label,
				type: field.field_type
			};

			if (Array.isArray(value) && value.length > 0 && value[0] instanceof File) {
				entry.images_added = (value as File[]).map(f => f.name);
			} else if (value !== null && value !== undefined && value !== '') {
				entry.value = typeof value === 'object' ? value : String(value);
			} else {
				entry.value = null;
			}

			snapshotFields.push(entry);
		}

		// Sort by field ID for determinism
		snapshotFields.sort((a, b) => String(a.id).localeCompare(String(b.id)));

		const snapshotJson = sortedStringify(snapshotFields);
		const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(snapshotJson));
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

		// 2. Create protocol entry record
		const hasFiles = Object.values(protocolValues).some(
			v => Array.isArray(v) && v.length > 0 && v[0] instanceof File
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

			// Add protocol field values as JSON
			const cleanProtocolValues: Record<string, unknown> = {};
			for (const [fieldId, value] of Object.entries(protocolValues)) {
				if (Array.isArray(value) && value.length > 0 && value[0] instanceof File) {
					for (const file of value as File[]) {
						formData.append('files', file);
					}
				} else {
					cleanProtocolValues[fieldId] = value;
				}
			}
			formData.append('field_values', JSON.stringify(cleanProtocolValues));

			protocolEntry = await gateway.collection('workflow_protocol_entries').create(formData as any) as { id: string };
		} else {
			protocolEntry = await gateway.collection('workflow_protocol_entries').create({
				instance_id: detailState.instanceId,
				tool_id: protocolTool.id,
				stage_id: currentStageId,
				recorded_by: gateway.participantId,
				recorded_at: new Date().toISOString(),
				snapshot: snapshotJson,
				snapshot_hash: hashHex,
				field_values: protocolValues
			}) as { id: string };
		}

		// 3. Create tool_usage record (audit trail)
		const editChanges: Array<{ field_key: string; before: string | null; after: string }> = [];
		for (const [fieldId, newValue] of Object.entries(editValues)) {
			if (newValue === null || newValue === undefined || newValue === '') continue;
			const existing = detailState.fieldValues.find(fv => fv.field_key === fieldId);
			const oldValue = existing?.value || null;
			const newValueStr = Array.isArray(newValue) && newValue[0] instanceof File
				? `[${(newValue as File[]).length} file(s)]`
				: typeof newValue === 'object' ? JSON.stringify(newValue) : String(newValue);

			if (oldValue !== newValueStr) {
				editChanges.push({ field_key: fieldId, field_name: getFieldName(fieldId) || fieldId, before: oldValue, after: newValueStr });
			}
		}

		const toolUsage = await gateway.collection('workflow_instance_tool_usage').create({
			instance_id: detailState.instanceId,
			stage_id: currentStageId,
			executed_by: gateway.participantId,
			executed_at: new Date().toISOString(),
			metadata: {
				action: 'protocol',
				stage_name: getStageName(currentStageId) || currentStageId,
				protocol_entry_id: protocolEntry.id,
				changes: editChanges
			}
		}) as { id: string };

		// 4. Update field_values for edit fields that changed
		for (const [fieldId, value] of Object.entries(editValues)) {
			if (value === null || value === undefined || value === '') continue;

			const existing = detailState.fieldValues.find(fv => fv.field_key === fieldId);
			const fieldStageId = getStageIdForField(fieldId) || currentStageId;

			if (Array.isArray(value) && value.length > 0 && value[0] instanceof File) {
				for (const file of value as File[]) {
					const formData = new FormData();
					formData.append('instance_id', detailState.instanceId);
					formData.append('field_key', fieldId);
					formData.append('stage_id', fieldStageId);
					formData.append('value', '');
					formData.append('file_value', file);
					formData.append('created_by_action', toolUsage.id);
					await gateway.collection('workflow_instance_field_values').create(formData as any);
				}
			} else {
				const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

				if (existing) {
					await gateway.collection('workflow_instance_field_values').update(existing.id, {
						value: stringValue,
						last_modified_by_action: toolUsage.id,
						last_modified_at: new Date().toISOString()
					});
				} else {
					await gateway.collection('workflow_instance_field_values').create({
						instance_id: detailState.instanceId,
						field_key: fieldId,
						stage_id: fieldStageId,
						value: stringValue,
						created_by_action: toolUsage.id
					});
				}
			}
		}

		// 5. Refresh state
		await detailState.refresh();
	}

	async function handleProtocolSave(editValues: Record<string, unknown>, protocolValues: Record<string, unknown>) {
		if (!activeProtocolTool) return;
		await saveProtocol(activeProtocolTool, editValues, protocolValues);
		activeProtocolTool = null;
	}

	// ==========================================================================
	// Location Edit Handlers
	// ==========================================================================

	async function handleLocationConfirm(coordinates: { lat: number; lng: number }) {
		if (!detailState || !gateway) return;

		try {
			// 1. Create tool_usage record with location change (audit trail)
			const locationStageId = detailState.instance?.current_stage_id;
			await gateway.collection('workflow_instance_tool_usage').create({
				instance_id: detailState.instanceId,
				stage_id: locationStageId,
				executed_by: gateway.participantId,
				executed_at: new Date().toISOString(),
				metadata: {
					action: 'location_edit',
					stage_name: locationStageId ? (getStageName(locationStageId) || locationStageId) : null,
					before: detailState.instance?.location
						? { lat: detailState.instance.location.lat, lon: detailState.instance.location.lon }
						: null,
					after: { lat: coordinates.lat, lon: coordinates.lng }
				}
			});

			// 2. Update instance location
			await gateway.collection('workflow_instances').update(detailState.instanceId, {
				location: { lat: coordinates.lat, lon: coordinates.lng }
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
					onSubmit={handleToolFormSubmit}
					onCancel={handleToolFlowCancel}
				/>
			{:else if currentTool?.type === 'edit' && detailState}
				{@const editToolInFlow = currentTool.tool as ToolEdit}
				<EditFieldsTool
					editTool={editToolInFlow}
					instanceId={detailState.instanceId}
					existingFieldValues={detailState.fieldValues}
					formFields={detailState.getFormFieldsForReachedStages()}
					groupedFields={detailState.getEditableFieldsGroupedByStage(editToolInFlow.editable_fields || [])}
					initialActiveStageId={detailState.activeStageTab}
					onSave={async (values) => {
						// For edit tools in a connection flow, save and advance
						await handleEditSave(values);
						advanceToolFlow();
					}}
					onCancel={handleToolFlowCancel}
				/>
			{:else if currentTool?.type === 'protocol' && detailState}
				{@const protocolToolInFlow = currentTool.tool as ToolProtocol}
				<ProtocolTool
					protocolTool={protocolToolInFlow}
					instanceId={detailState.instanceId}
					existingFieldValues={detailState.fieldValues}
					formFields={detailState.getFormFieldsForReachedStages()}
					protocolFormFields={protocolToolInFlow.protocol_form_id ? detailState.getProtocolFormFields(protocolToolInFlow.protocol_form_id) : []}
					onSave={async (editValues, protocolValues) => {
						await saveProtocol(protocolToolInFlow, editValues, protocolValues);
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
		{:else if activeEditTool && detailState}
			<EditFieldsTool
				editTool={activeEditTool}
				instanceId={detailState.instanceId}
				existingFieldValues={detailState.fieldValues}
				formFields={detailState.getFormFieldsForReachedStages()}
				groupedFields={detailState.getEditableFieldsGroupedByStage(activeEditTool.editable_fields || [])}
				initialActiveStageId={detailState.activeStageTab}
				onSave={handleEditSave}
				onCancel={handleEditCancel}
			/>
		{:else if activeProtocolTool && detailState}
			<ProtocolTool
				protocolTool={activeProtocolTool}
				instanceId={detailState.instanceId}
				existingFieldValues={detailState.fieldValues}
				formFields={detailState.getFormFieldsForReachedStages()}
				protocolFormFields={activeProtocolTool.protocol_form_id ? detailState.getProtocolFormFields(activeProtocolTool.protocol_form_id) : []}
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
								? 'One of your changes was overridden. Tap to review.'
								: `${pendingConflicts.length} changes were overridden. Tap to review.`}
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
								<p class="text-sm">No activity yet</p>
							</div>
						{:else}
							<div class="space-y-1">
								{#each activitySections as section, sectionIndex}
									<!-- Stage header -->
									{#if section.transitionEntry}
										{@const transBy = section.transitionEntry.metadata.action === 'admin_edit' ? 'Admin' : (section.transitionEntry.expand?.executed_by?.name || section.transitionEntry.expand?.executed_by?.email || '')}
										<button
											class="w-full flex items-center gap-3 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 px-3 py-2 text-left transition-colors hover:bg-blue-100 dark:hover:bg-blue-900/50"
											class:mt-2={sectionIndex > 0}
											onclick={() => navigateToStageData(section.stageId)}
										>
											<div class="flex-1 min-w-0">
												<p class="text-sm font-semibold text-blue-900 dark:text-blue-100">
													Moved to: {section.stageName}
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
											<p class="text-sm font-semibold text-foreground">{section.stageName}</p>
										</div>
									{/if}

									<!-- Entries within this stage -->
									{#if section.entries.length > 0}
										<div class="border-l-2 border-border ml-3 pl-3 space-y-0.5">
											{#each section.entries as entry, entryIndex (entry.id)}
												{@const metadata = entry.metadata}
												{@const prevEntry = entryIndex > 0 ? section.entries[entryIndex - 1] : null}
												{@const executedBy = metadata.action === 'admin_edit' ? 'Admin' : (entry.expand?.executed_by?.name || entry.expand?.executed_by?.email || 'Unknown')}
												{@const showActor = !prevEntry || (prevEntry.expand?.executed_by?.name || prevEntry.expand?.executed_by?.email) !== (entry.expand?.executed_by?.name || entry.expand?.executed_by?.email) || prevEntry.metadata.action === 'admin_edit' !== (metadata.action === 'admin_edit')}
												{@const hasExpandableContent = (metadata.action === 'instance_created' || metadata.action === 'form_fill') && metadata.created_fields && metadata.created_fields.length > 2}
												{@const label = getEntryLabel(metadata)}

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
														<!-- instance_created -->
														{#if metadata.action === 'instance_created' && metadata.created_fields}
															{#if metadata.location}
																<div class="flex gap-1.5 text-xs mb-0.5">
																	<span class="text-muted-foreground shrink-0">Location:</span>
																	<span class="font-medium truncate">{metadata.location.lat.toFixed(5)}, {metadata.location.lon.toFixed(5)}</span>
																</div>
															{/if}
															{#each metadata.created_fields as field}
																{@const fieldDef = detailState?.formFields.find(f => f.id === field.field_key)}
																<div class="flex gap-1.5 text-xs mb-0.5">
																	<span class="text-muted-foreground shrink-0">{fieldDef?.field_label || field.field_key}:</span>
																	<span class="font-medium truncate">{formatHistoryValue(field.value, field.field_key)}</span>
																</div>
															{/each}
														{/if}

														<!-- form_fill -->
														{#if metadata.action === 'form_fill' && metadata.created_fields}
															{#each metadata.created_fields as field}
																{@const fieldDef = detailState?.formFields.find(f => f.id === field.field_key)}
																<div class="flex gap-1.5 text-xs mb-0.5">
																	<span class="text-muted-foreground shrink-0">{fieldDef?.field_label || field.field_key}:</span>
																	<span class="font-medium truncate">{formatHistoryValue(field.value, field.field_key)}</span>
																</div>
															{/each}
														{/if}

														<!-- edit / admin_edit -->
														{#if (metadata.action === 'edit' || metadata.action === 'admin_edit') && metadata.changes}
															{#each metadata.changes as change}
																{@const fieldDef = detailState?.formFields.find(f => f.id === change.field_key)}
																<div class="text-xs mb-0.5">
																	<span class="text-muted-foreground">{fieldDef?.field_label || change.field_key}: </span>
																	<span class="line-through text-muted-foreground/60">{formatHistoryValue(change.before, change.field_key)}</span>
																	<span class="text-muted-foreground mx-0.5">-></span>
																	<span class="font-medium">{formatHistoryValue(change.after, change.field_key)}</span>
																</div>
															{/each}
														{/if}

														<!-- location_edit -->
														{#if metadata.action === 'location_edit'}
															<div class="text-xs">
																{#if metadata.before}
																	<span class="line-through text-muted-foreground/60">{metadata.before.lat.toFixed(5)}, {metadata.before.lon.toFixed(5)}</span>
																{:else}
																	<span class="text-muted-foreground">(no location)</span>
																{/if}
																<span class="text-muted-foreground mx-0.5">-></span>
																{#if metadata.after}
																	<span class="font-medium">{metadata.after.lat.toFixed(5)}, {metadata.after.lon.toFixed(5)}</span>
																{/if}
															</div>
														{/if}

														<!-- protocol -->
														{#if metadata.action === 'protocol' && metadata.changes}
															{#each metadata.changes as change}
																{@const fieldDef = detailState?.formFields.find(f => f.id === change.field_key)}
																<div class="text-xs mb-0.5">
																	<span class="text-muted-foreground">{fieldDef?.field_label || change.field_key}: </span>
																	<span class="line-through text-muted-foreground/60">{formatHistoryValue(change.before, change.field_key)}</span>
																	<span class="text-muted-foreground mx-0.5">-></span>
																	<span class="font-medium">{formatHistoryValue(change.after, change.field_key)}</span>
																</div>
															{/each}
														{/if}

														<!-- Photo thumbnails -->
														{#if metadata.action === 'form_fill' || metadata.action === 'instance_created' || metadata.action === 'protocol'}
															{@const fileValues = detailState?.fieldValues.filter(fv => fv.file_value && fv.created_by_action === entry.id) ?? []}
															{#if fileValues.length > 0}
																<div class="flex gap-1.5 mt-1.5 flex-wrap">
																	{#each fileValues.slice(0, 4) as fv}
																		<img
																			src="/api/files/workflow_instance_field_values/{fv.id}/{fv.file_value}"
																			alt="Attachment"
																			class="h-12 w-12 rounded object-cover border border-border"
																			loading="lazy"
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
							</div>
						{/if}
					</Tabs.Content>

					<Tabs.Content value="data" class="pt-4">
						<!-- DATA TAB with Stage Sub-tabs -->
						<div class="space-y-4">
							{#if detailState && detailState.stages.length > 0}
								<Tabs.Root
									value={detailState.activeStageTab}
									onValueChange={(v) => handleStageTabChange(v as string)}
								>
									<Tabs.List class="w-full overflow-x-auto flex-nowrap">
										{#each detailState.stages as stage}
											<Tabs.Trigger value={stage.id} class="text-xs whitespace-nowrap">
												{stage.stage_name}
											</Tabs.Trigger>
										{/each}
									</Tabs.List>

									{#each detailState.stages as stage}
										<Tabs.Content value={stage.id} class="pt-4">
											{@const fields = detailState.getFieldsForFormRenderer(stage.id) as import('$lib/components/form-renderer').FormFieldWithValue[]}
											<ViewFieldsTool {fields} />
										</Tabs.Content>
									{/each}
								</Tabs.Root>
							{:else}
								<div class="text-center py-8 text-muted-foreground">
									<p class="text-sm">No stages available</p>
								</div>
							{/if}
						</div>
					</Tabs.Content>
				</Tabs.Root>
			</div>
		{/if}
	{/snippet}
</ModuleShell>

<!-- Location Edit Tool (rendered as map overlay) -->
{#if isLocationPickerActive && map && detailState}
	{@const location = detailState.instance?.location as { lat: number; lon: number } | null}
	{@const buttonLabel = (activeLocationEditTool?.visual_config?.button_label as string) || 'Update Location'}
	<LocationEditTool
		{map}
		initialCoordinates={location ? { lat: location.lat, lng: location.lon } : null}
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
