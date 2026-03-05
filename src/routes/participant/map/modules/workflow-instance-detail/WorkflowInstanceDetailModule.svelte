<script lang="ts">
	import ModuleShell from '$lib/components/module-shell.svelte';
	import { getParticipantGateway } from '$lib/participant-state/context.svelte';
	import {
		createWorkflowInstanceDetailState,
		type WorkflowInstanceDetailState,
		type WorkflowConnection,
		type ToolQueueItem,
		type ToolEdit,
		type ToolUsageRecord
	} from './state.svelte';
	import type { WorkflowInstanceSelection } from '../types';
	import { Separator } from '$lib/components/ui/separator';
	import * as Card from '$lib/components/ui/card';
	import * as Tabs from '$lib/components/ui/tabs';
	import { MapPin, Clock, ChevronDown } from 'lucide-svelte';
	import { FormFillTool, EditFieldsTool, ViewFieldsTool, LocationEditTool, ConflictResolutionTool } from './tools';
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
		onClose: () => void;
	}

	let { selection, isExpanded = $bindable(false), map = null, isEditingLocation = $bindable(false), onClose }: Props = $props();

	// ==========================================================================
	// State
	// ==========================================================================

	const gateway = getParticipantGateway();
	let detailState = $state<WorkflowInstanceDetailState | null>(null);
	let isOpen = $state(true);
	let activeTab = $state<string>('overview');

	// Tool flow state (managed internally now)
	interface ActiveToolFlow {
		instanceId: string;
		connection: WorkflowConnection;
		toolQueue: ToolQueueItem[];
		currentToolIndex: number;
	}

	let activeToolFlow = $state<ActiveToolFlow | null>(null);
	let activeEditTool = $state<ToolEdit | null>(null);
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

		const newState = createWorkflowInstanceDetailState(instanceId, gateway);
		detailState = newState;
		activeTab = 'overview';
		activeToolFlow = null;
		activeEditTool = null;
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
	$effect(() => {
		isEditingLocation = isLocationPickerActive;
	});

	// ==========================================================================
	// Tab Configuration
	// ==========================================================================

	const tabs = [
		{ id: 'overview', label: 'Overview' },
		{ id: 'details', label: 'Details' },
		{ id: 'history', label: 'History' }
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
		}
		if (activeEditTool) {
			return activeEditTool.name || 'Edit';
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

		return [...editActions, ...connectionActions];
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

	// ==========================================================================
	// Handlers
	// ==========================================================================

	function handleClose() {
		isOpen = false;
		activeToolFlow = null;
		activeEditTool = null;
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
			// Log stage transition (audit trail)
			await gateway.collection('workflow_instance_tool_usage').create({
				instance_id: activeToolFlow.instanceId,
				stage_id: fromStageId,
				executed_by: gateway.participantId,
				executed_at: new Date().toISOString(),
				metadata: {
					action: 'stage_transition',
					from_stage_id: fromStageId,
					to_stage_id: toStageId,
					connection_id: activeToolFlow.connection.id
				}
			});

			// Update instance to new stage
			await gateway.collection('workflow_instances').update(activeToolFlow.instanceId, {
				current_stage_id: toStageId
			});

			// Refresh state
			await detailState.refresh();

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
					changes.push({ field_key: fieldId, before: oldValue, after: newValueStr });
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
	// Location Edit Handlers
	// ==========================================================================

	async function handleLocationConfirm(coordinates: { lat: number; lng: number }) {
		if (!detailState || !gateway) return;

		try {
			// 1. Create tool_usage record with location change (audit trail)
			await gateway.collection('workflow_instance_tool_usage').create({
				instance_id: detailState.instanceId,
				stage_id: detailState.instance?.current_stage_id,
				executed_by: gateway.participantId,
				executed_at: new Date().toISOString(),
				metadata: {
					action: 'location_edit',
					before: detailState.instance?.location,
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

					<Tabs.Content value="overview" class="pt-4">
						<!-- OVERVIEW TAB -->
						<div class="space-y-4">
							<!-- Progress -->
							<div class="space-y-3">
								<h4 class="text-sm font-semibold">Progress</h4>

								<div class="space-y-2">
									{#each detailState?.stages ?? [] as stage, index}
										<div class="flex items-start gap-3">
											<!-- Dot -->
											<div class="mt-1 shrink-0">
												{#if detailState?.isStageCompleted(stage.id)}
													<div class="h-4 w-4 rounded-full bg-green-400"></div>
												{:else if detailState?.isCurrentStage(stage.id)}
													<div class="h-4 w-4 rounded-full bg-muted-foreground"></div>
												{:else}
													<div class="h-4 w-4 rounded-full border-2 border-muted-foreground"></div>
												{/if}
											</div>

											<!-- Content -->
											<div class="min-w-0 flex-1">
												<div
													class="text-sm font-medium {detailState?.isStageCompleted(stage.id)
														? 'text-foreground'
														: detailState?.isCurrentStage(stage.id)
															? 'text-foreground'
															: 'text-muted-foreground'}"
												>
													{stage.stage_name}
												</div>
											</div>
										</div>

										<!-- Connector Line -->
										{#if index < (detailState?.stages.length ?? 0) - 1}
											<div class="ml-2 h-3 w-px bg-border"></div>
										{/if}
									{/each}
								</div>
							</div>

							<Separator />

							<!-- Info Cards -->
							<div class="grid grid-cols-2 gap-2">
								{#if detailState?.instance?.location}
									{@const location = detailState.instance.location as { lat: number; lon: number }}
									<Card.Root>
										<Card.Content class="p-3">
											<div class="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
												<MapPin class="w-3 h-3" />
												Location
											</div>
											<div class="text-xs font-mono text-foreground">
												{location.lat.toFixed(5)}, {location.lon.toFixed(5)}
											</div>
										</Card.Content>
									</Card.Root>
								{/if}
								{#if detailState?.instance?.created}
									<Card.Root>
										<Card.Content class="p-3">
											<div class="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
												<Clock class="w-3 h-3" />
												Started
											</div>
											<div class="text-xs text-foreground">
												{formatDate(detailState.instance.created as string)}
											</div>
										</Card.Content>
									</Card.Root>
								{/if}
							</div>
						</div>
					</Tabs.Content>

					<Tabs.Content value="details" class="pt-4">
						<!-- DETAILS TAB with Stage Sub-tabs -->
						<div class="space-y-4">
							{#if detailState && detailState.stages.length > 0}
								<!-- Stage Sub-tabs -->
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

					<Tabs.Content value="history" class="pt-4">
						<!-- HISTORY TAB -->
						<div class="space-y-2">
							{#if !detailState || detailState.toolUsageHistory.length === 0}
								<div class="text-center py-12 text-muted-foreground">
									<Clock class="w-12 h-12 mx-auto mb-2 opacity-50" />
									<p class="text-sm">No activity yet</p>
								</div>
							{:else}
								{#each detailState.toolUsageHistory as entry, index (entry.id)}
									{@const metadata = entry.metadata}
									{@const executedBy = entry.expand?.executed_by?.name || entry.expand?.executed_by?.email || 'Unknown'}
									{@const executedAt = new Date(entry.executed_at).toLocaleString()}
									{@const itemCount = (metadata.action === 'form_fill' || metadata.action === 'instance_created') ? metadata.created_fields?.length : metadata.action === 'edit' ? metadata.changes?.length : 1}
									<details class="group border rounded-lg overflow-hidden" data-testid="history-entry">
										<summary class="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 select-none">
											<div class="flex items-center gap-2">
												<span class="text-xs font-medium px-2 py-0.5 rounded-full {metadata.action === 'instance_created' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : metadata.action === 'stage_transition' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : 'bg-muted'}">
													{#if metadata.action === 'instance_created'}
														Instance Created
													{:else if metadata.action === 'form_fill'}
														Form Submitted
													{:else if metadata.action === 'edit'}
														Fields Edited
													{:else if metadata.action === 'location_edit'}
														Location Changed
													{:else if metadata.action === 'stage_transition'}
														Stage Changed
													{:else}
														Action
													{/if}
												</span>
												{#if itemCount && itemCount > 0}
													<span class="text-xs text-muted-foreground">({itemCount} {itemCount === 1 ? 'field' : 'fields'})</span>
												{/if}
											</div>
											<div class="flex items-center gap-2">
												<span class="text-xs text-muted-foreground">{executedAt}</span>
												<ChevronDown class="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
											</div>
										</summary>
										<div class="px-3 pb-3 pt-1 border-t bg-muted/20">
											<p class="text-xs text-muted-foreground mb-2">by {executedBy}</p>

											{#if metadata.action === 'instance_created' && metadata.created_fields}
												<div class="text-sm space-y-1">
													{#if metadata.location}
														<div class="flex gap-2 mb-2">
															<span class="text-muted-foreground">Location:</span>
															<span class="font-medium">{metadata.location.lat.toFixed(5)}, {metadata.location.lon.toFixed(5)}</span>
														</div>
													{/if}
													{#each metadata.created_fields as field}
														{@const fieldDef = detailState.formFields.find(f => f.id === field.field_key)}
														<div class="flex gap-2">
															<span class="text-muted-foreground">{fieldDef?.field_label || field.field_key}:</span>
															<span class="font-medium truncate">{field.value}</span>
														</div>
													{/each}
												</div>
											{/if}

											{#if metadata.action === 'form_fill' && metadata.created_fields}
												<div class="text-sm space-y-1">
													{#each metadata.created_fields as field}
														{@const fieldDef = detailState.formFields.find(f => f.id === field.field_key)}
														<div class="flex gap-2">
															<span class="text-muted-foreground">{fieldDef?.field_label || field.field_key}:</span>
															<span class="font-medium truncate">{field.value}</span>
														</div>
													{/each}
												</div>
											{/if}

											{#if metadata.action === 'edit' && metadata.changes}
												<div class="text-sm space-y-1">
													{#each metadata.changes as change}
														{@const fieldDef = detailState.formFields.find(f => f.id === change.field_key)}
														<div class="space-y-0.5">
															<span class="text-muted-foreground">{fieldDef?.field_label || change.field_key}:</span>
															<div class="flex items-center gap-2 text-xs">
																<span class="line-through text-muted-foreground">{change.before || '(empty)'}</span>
																<span class="text-muted-foreground">-></span>
																<span class="font-medium">{change.after}</span>
															</div>
														</div>
													{/each}
												</div>
											{/if}

											{#if metadata.action === 'location_edit'}
												<div class="text-sm">
													<div class="flex items-center gap-2 text-xs">
														{#if metadata.before}
															<span class="text-muted-foreground">
																{metadata.before.lat.toFixed(5)}, {metadata.before.lon.toFixed(5)}
															</span>
														{:else}
															<span class="text-muted-foreground">(no location)</span>
														{/if}
														<span class="text-muted-foreground">-></span>
														{#if metadata.after}
															<span class="font-medium">
																{metadata.after.lat.toFixed(5)}, {metadata.after.lon.toFixed(5)}
															</span>
														{/if}
													</div>
												</div>
											{/if}

											{#if metadata.action === 'stage_transition'}
												{@const fromStage = detailState.stages.find(s => s.id === metadata.from_stage_id)}
												{@const toStage = detailState.stages.find(s => s.id === metadata.to_stage_id)}
												<div class="text-sm">
													<div class="flex items-center gap-2 text-xs">
														<span class="text-muted-foreground">{fromStage?.stage_name || 'Unknown'}</span>
														<span class="text-muted-foreground">-></span>
														<span class="font-medium">{toStage?.stage_name || 'Unknown'}</span>
													</div>
												</div>
											{/if}
										</div>
									</details>
								{/each}
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
