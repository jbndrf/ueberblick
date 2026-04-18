<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Progress } from '$lib/components/ui/progress';
	import { Separator } from '$lib/components/ui/separator';
	import {
		CheckCircle2,
		Circle,
		Clock,
		User,
		Calendar,
		ArrowRight,
		PlayCircle
	} from 'lucide-svelte';
	import * as m from '$lib/paraglide/messages';
	import type { WorkflowInstance as GatewayInstance } from '$lib/participant-state/types';

	// Stage from the database
	interface WorkflowStageData {
		id: string;
		workflow_id: string;
		stage_name: string;
		stage_type: 'start' | 'intermediate' | 'end';
		stage_order: number;
	}

	// Workflow from the database
	interface WorkflowData {
		id: string;
		name: string;
		workflow_type: string;
	}

	// Display stage with computed properties
	interface DisplayStage {
		id: string;
		name: string;
		description?: string;
		completed: boolean;
		current: boolean;
	}

	interface Props {
		instance: GatewayInstance;
		workflow?: WorkflowData;
		stages?: WorkflowStageData[];
		onStageAction?: (stageId: string) => void;
		onResumeWorkflow?: () => void;
	}

	let { instance, workflow, stages = [], onStageAction, onResumeWorkflow }: Props = $props();

	// Compute display stages from raw stage data
	const displayStages = $derived.by<DisplayStage[]>(() => {
		if (!stages || stages.length === 0) return [];

		// Sort by stage_order
		const sortedStages = [...stages].sort((a, b) => a.stage_order - b.stage_order);
		const currentIndex = sortedStages.findIndex((s) => s.id === instance.current_stage_id);

		return sortedStages.map((stage, index) => ({
			id: stage.id,
			name: stage.stage_name,
			completed: index < currentIndex,
			current: stage.id === instance.current_stage_id
		}));
	});

	// Compute progress
	const progressPercentage = $derived.by(() => {
		if (displayStages.length === 0) return 0;
		const completedCount = displayStages.filter((s) => s.completed).length;
		return Math.round((completedCount / displayStages.length) * 100);
	});

	// Get current stage info
	const currentStage = $derived.by(() => {
		return displayStages.find((s) => s.current);
	});

	// Map status for display
	const displayStatus = $derived.by<'in_progress' | 'completed' | 'paused'>(() => {
		switch (instance.status) {
			case 'active':
				return 'in_progress';
			case 'completed':
				return 'completed';
			case 'archived':
			case 'deleted':
				return 'paused';
			default:
				return 'in_progress';
		}
	});

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleString();
	}

	function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'outline' {
		switch (status) {
			case 'completed':
				return 'default';
			case 'in_progress':
				return 'secondary';
			case 'paused':
				return 'outline';
			default:
				return 'outline';
		}
	}

	function getStatusLabel(status: string): string {
		switch (status) {
			case 'completed':
				return 'Completed';
			case 'in_progress':
				return 'In Progress';
			case 'paused':
				return 'Paused';
			default:
				return status;
		}
	}
</script>

<div class="workflow-content p-4">
	<!-- Header -->
	<div class="mb-4 space-y-2">
		<div class="flex items-start justify-between gap-2">
			<h3 class="text-lg font-semibold">{workflow?.name || 'Workflow'}</h3>
			<Badge variant={getStatusBadgeVariant(displayStatus)}>
				{getStatusLabel(displayStatus)}
			</Badge>
		</div>

		<!-- Progress -->
		<div class="space-y-1">
			<Progress value={progressPercentage} class="h-2" />
			<div class="text-xs text-muted-foreground">{progressPercentage}% complete</div>
		</div>
	</div>

	<Separator class="my-4" />

	<!-- Current Stage -->
	{#if currentStage}
		<div class="mb-4 rounded-lg border bg-primary/5 p-3">
			<div class="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
				<Clock class="h-4 w-4" />
				Current Stage
			</div>
			<div class="font-medium">{currentStage.name}</div>
			{#if currentStage.description}
				<p class="mt-1 text-sm text-muted-foreground">{currentStage.description}</p>
			{/if}

			{#if displayStatus === 'paused' && onResumeWorkflow}
				<Button size="sm" onclick={onResumeWorkflow} class="mt-3 w-full">
					<PlayCircle class="mr-2 h-4 w-4" />
					Resume Workflow
				</Button>
			{/if}
		</div>
	{/if}

	<!-- Stage List -->
	<div class="space-y-3">
		<h4 class="text-sm font-medium">Workflow Stages</h4>

		<div class="space-y-2">
			{#each displayStages as stage, index}
				<div class="flex items-start gap-3">
					<!-- Icon -->
					<div class="mt-1 shrink-0">
						{#if stage.completed}
							<CheckCircle2 class="h-5 w-5 text-primary" />
						{:else if stage.current}
							<Clock class="h-5 w-5 text-primary" />
						{:else}
							<Circle class="h-5 w-5 text-muted-foreground" />
						{/if}
					</div>

					<!-- Content -->
					<div class="min-w-0 flex-1">
						<div
							class="font-medium {stage.completed
								? 'text-foreground'
								: stage.current
									? 'text-primary'
									: 'text-muted-foreground'}"
						>
							{stage.name}
						</div>
						{#if stage.description}
							<p class="text-xs text-muted-foreground">{stage.description}</p>
						{/if}

						<!-- Action Button -->
						{#if stage.current && !stage.completed && onStageAction}
							<Button
								size="sm"
								variant="outline"
								onclick={() => onStageAction?.(stage.id)}
								class="mt-2"
							>
								<ArrowRight class="mr-2 h-3 w-3" />
								Continue
							</Button>
						{/if}
					</div>
				</div>

				<!-- Connector Line -->
				{#if index < displayStages.length - 1}
					<div class="ml-2 h-4 w-px bg-border"></div>
				{/if}
			{/each}
		</div>
	</div>

	<Separator class="my-4" />

	<!-- Metadata -->
	<div class="space-y-2 text-sm">
		<div class="flex items-center gap-2 text-muted-foreground">
			<Calendar class="h-4 w-4" />
			<span>Started: {formatDate(instance.created)}</span>
		</div>

		{#if instance.centroid}
			<div class="flex items-center gap-2 text-muted-foreground">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
					<circle cx="12" cy="10" r="3"></circle>
				</svg>
				<span>
					{instance.centroid.lat.toFixed(5)}, {instance.centroid.lon.toFixed(5)}{instance.geometry && instance.geometry.type !== 'Point' ? ` (${instance.geometry.type})` : ''}
				</span>
			</div>
		{/if}
	</div>
</div>
