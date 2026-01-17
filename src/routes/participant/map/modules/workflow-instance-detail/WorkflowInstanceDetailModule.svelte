<script lang="ts">
	import ModuleSidebar from '$lib/components/module-sidebar.svelte';
	import { getParticipantGateway } from '$lib/participant-state/context.svelte';
	import { POCKETBASE_URL } from '$lib/config/pocketbase';
	import {
		createWorkflowInstanceDetailState,
		type WorkflowInstanceDetailState,
		type WorkflowConnection,
		type ToolQueueItem,
		type ToolEdit
	} from './state.svelte';
	import type { WorkflowInstanceSelection } from '../types';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { Progress } from '$lib/components/ui/progress';
	import * as Card from '$lib/components/ui/card';
	import * as Tabs from '$lib/components/ui/tabs';
	import { MapPin, Clock, CheckCircle2, Circle, PlayCircle, ArrowRight, FileText, Image, Pencil } from 'lucide-svelte';

	// ==========================================================================
	// Props
	// ==========================================================================

	interface Props {
		selection: WorkflowInstanceSelection;
		onClose: () => void;
		onStartToolFlow?: (instanceId: string, connection: WorkflowConnection, toolQueue: ToolQueueItem[]) => void;
		onStartEditTool?: (instanceId: string, editTool: ToolEdit) => void;
	}

	let { selection, onClose, onStartToolFlow, onStartEditTool }: Props = $props();

	// ==========================================================================
	// State
	// ==========================================================================

	const gateway = getParticipantGateway();
	let detailState = $state<WorkflowInstanceDetailState | null>(null);
	let isOpen = $state(true);
	let activeTab = $state<string>('overview');

	// ==========================================================================
	// Effects
	// ==========================================================================

	$effect(() => {
		const instanceId = selection.instanceId;
		if (!gateway || !instanceId) return;

		const newState = createWorkflowInstanceDetailState(instanceId, gateway);
		detailState = newState;
		activeTab = 'overview';
		newState.load();
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

	const title = $derived(detailState?.workflow?.name as string || 'Workflow');

	const subtitle = $derived.by(() => {
		if (!detailState?.instance) return undefined;
		return getStatusLabel(detailState.instance.status as string);
	});

	const badge = $derived.by(() => {
		if (!detailState) return undefined;
		const current = detailState.currentStageIndex;
		const total = detailState.stages.length;
		if (current > 0 && total > 0) {
			return `Stage ${current}/${total}`;
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
			icon: ArrowRight,
			color: conn.visual_config?.button_color,
			disabled: false,
			onClick: () => handleConnectionClick(conn)
		}));

		// Stage edit tool actions (edit without transition)
		const editActions = detailState.availableStageEditTools.map(tool => ({
			id: `edit-${tool.id}`,
			label: tool.visual_config?.button_label || tool.name,
			icon: Pencil,
			color: tool.visual_config?.button_color,
			disabled: false,
			onClick: () => handleEditToolClick(tool)
		}));

		return [...editActions, ...connectionActions];
	});

	// Convert to the format expected by ModuleSidebar
	const sidebarActions = $derived.by(() => {
		return actions.map(action => ({
			id: action.id,
			label: action.label,
			icon: actionIconSnippet,
			color: action.color,
			disabled: action.disabled,
			onClick: action.onClick
		}));
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

	function getStatusLabel(status: string): string {
		switch (status) {
			case 'active':
				return 'In Progress';
			case 'completed':
				return 'Completed';
			case 'archived':
				return 'Archived';
			case 'deleted':
				return 'Deleted';
			default:
				return status;
		}
	}

	function getStatusVariant(status: string): 'default' | 'secondary' | 'outline' | 'destructive' {
		switch (status) {
			case 'completed':
				return 'default';
			case 'active':
				return 'secondary';
			case 'archived':
				return 'outline';
			case 'deleted':
				return 'destructive';
			default:
				return 'outline';
		}
	}

	function getFileUrl(fileValue: string, collectionName: string, recordId: string): string {
		// PocketBase file URL pattern
		return `${POCKETBASE_URL}/api/files/${collectionName}/${recordId}/${fileValue}`;
	}

	// ==========================================================================
	// Handlers
	// ==========================================================================

	function handleClose() {
		isOpen = false;
		onClose();
	}

	function handleTabChange(tabId: string) {
		activeTab = tabId;
	}

	async function handleConnectionClick(connection: WorkflowConnection) {
		if (!detailState) return;

		// Get tools for this connection
		const toolQueue = detailState.getToolsForConnection(connection.id);

		if (toolQueue.length > 0 && onStartToolFlow) {
			// Has tools - let parent handle the tool flow
			onStartToolFlow(detailState.instanceId, connection, toolQueue);
		} else {
			// No tools - execute transition directly
			await detailState.executeTransition(connection);
		}
	}

	function handleEditToolClick(editTool: ToolEdit) {
		if (!detailState) return;

		if (onStartEditTool) {
			onStartEditTool(detailState.instanceId, editTool);
		}
	}

	function handleStageTabChange(stageId: string) {
		if (detailState) {
			detailState.setActiveStageTab(stageId);
		}
	}
</script>

{#snippet actionIconSnippet()}
	<ArrowRight class="w-4 h-4" />
{/snippet}

<ModuleSidebar
	bind:isOpen
	{title}
	{subtitle}
	{badge}
	{tabs}
	bind:activeTab
	actions={sidebarActions}
	isLoading={detailState?.isLoading ?? true}
	error={detailState?.loadError}
	onClose={handleClose}
	onTabChange={handleTabChange}
>
	{#snippet tabContent(tabId)}
		{#if tabId === 'overview'}
			<!-- OVERVIEW TAB -->
			<div class="space-y-4">
				<!-- Status Badge -->
				{#if detailState?.instance}
					<Badge variant={getStatusVariant(detailState.instance.status as string)}>
						{getStatusLabel(detailState.instance.status as string)}
					</Badge>
				{/if}

				<!-- Progress -->
				<div class="space-y-2">
					<div class="flex items-center justify-between text-sm">
						<span class="text-muted-foreground">Progress</span>
						<span class="font-medium">{detailState?.progressPercentage ?? 0}%</span>
					</div>
					<Progress value={detailState?.progressPercentage ?? 0} class="h-2" />
				</div>

				<Separator />

				<!-- Stage List -->
				<div class="space-y-3">
					<h4 class="text-sm font-semibold">Workflow Stages</h4>

					<div class="space-y-2">
						{#each detailState?.stages ?? [] as stage, index}
							<div class="flex items-start gap-3">
								<!-- Icon -->
								<div class="mt-0.5 shrink-0">
									{#if detailState?.isStageCompleted(stage.id)}
										<CheckCircle2 class="h-5 w-5 text-primary" />
									{:else if detailState?.isCurrentStage(stage.id)}
										<PlayCircle class="h-5 w-5 text-primary" />
									{:else}
										<Circle class="h-5 w-5 text-muted-foreground" />
									{/if}
								</div>

								<!-- Content -->
								<div class="min-w-0 flex-1">
									<div
										class="text-sm font-medium {detailState?.isStageCompleted(stage.id)
											? 'text-foreground'
											: detailState?.isCurrentStage(stage.id)
												? 'text-primary'
												: 'text-muted-foreground'}"
									>
										{stage.stage_name}
									</div>
								</div>
							</div>

							<!-- Connector Line -->
							{#if index < (detailState?.stages.length ?? 0) - 1}
								<div class="ml-2.5 h-3 w-px bg-border"></div>
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
		{:else if tabId === 'details'}
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
								{@const fieldValues = detailState.getFieldValuesForStage(stage.id)}
								{#if fieldValues.length > 0}
									<div class="space-y-3">
										{#each fieldValues as field}
											<div class="border-b border-border pb-3 last:border-0">
												<div class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
													{field.label}
												</div>
												{#if field.fileValue}
													<!-- File field - show thumbnail or link -->
													{#if field.type === 'file'}
														{@const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(field.fileValue)}
														{#if isImage}
															<div class="mt-1">
																<img
																	src={getFileUrl(field.fileValue, 'workflow_instance_field_values', field.id)}
																	alt={field.label}
																	class="max-w-full h-auto rounded-md max-h-48 object-cover"
																/>
															</div>
														{:else}
															<div class="flex items-center gap-2 text-sm text-foreground">
																<FileText class="w-4 h-4" />
																<span>{field.fileValue}</span>
															</div>
														{/if}
													{/if}
												{:else if field.value}
													<!-- Regular value -->
													<div class="text-sm text-foreground">
														{#if field.value.startsWith('[')}
															<!-- JSON array - try to parse and display nicely -->
															{@const parsed = (() => { try { return JSON.parse(field.value); } catch { return null; } })()}
															{#if Array.isArray(parsed)}
																<span>{parsed.join(', ')}</span>
															{:else}
																<span>{field.value}</span>
															{/if}
														{:else}
															{field.value}
														{/if}
													</div>
												{:else}
													<div class="text-sm text-muted-foreground italic">No value</div>
												{/if}
											</div>
										{/each}
									</div>
								{:else}
									<div class="text-center py-8 text-muted-foreground">
										<p class="text-sm">No data collected for this stage</p>
									</div>
								{/if}
							</Tabs.Content>
						{/each}
					</Tabs.Root>
				{:else}
					<div class="text-center py-8 text-muted-foreground">
						<p class="text-sm">No stages available</p>
					</div>
				{/if}
			</div>
		{:else if tabId === 'history'}
			<!-- HISTORY TAB -->
			<div class="space-y-4">
				<h3 class="font-semibold text-foreground">Activity History</h3>
				<div class="text-center py-12 text-muted-foreground">
					<Clock class="w-12 h-12 mx-auto mb-2 opacity-50" />
					<p class="text-sm">Activity history coming soon</p>
				</div>
			</div>
		{/if}
	{/snippet}
</ModuleSidebar>
