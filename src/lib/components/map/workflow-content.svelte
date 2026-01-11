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

	interface WorkflowStage {
		id: string;
		name: string;
		description?: string;
		completed: boolean;
		current: boolean;
	}

	interface WorkflowInstance {
		id: string;
		workflow_name: string;
		workflow_type: string;
		current_stage?: {
			name: string;
			description?: string;
		};
		progress_percentage: number;
		status: 'in_progress' | 'completed' | 'paused';
		created_at: string;
		created_by?: {
			name: string;
		};
		stages: WorkflowStage[];
	}

	interface Props {
		instance: WorkflowInstance;
		onStageAction?: (stageId: string) => void;
		onResumeWorkflow?: () => void;
	}

	let { instance, onStageAction, onResumeWorkflow }: Props = $props();

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
			<h3 class="text-lg font-semibold">{instance.workflow_name}</h3>
			<Badge variant={getStatusBadgeVariant(instance.status)}>
				{getStatusLabel(instance.status)}
			</Badge>
		</div>

		<!-- Progress -->
		<div class="space-y-1">
			<Progress value={instance.progress_percentage} class="h-2" />
			<div class="text-xs text-muted-foreground">{instance.progress_percentage}% complete</div>
		</div>
	</div>

	<Separator class="my-4" />

	<!-- Current Stage -->
	{#if instance.current_stage}
		<div class="mb-4 rounded-lg border bg-primary/5 p-3">
			<div class="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
				<Clock class="h-4 w-4" />
				Current Stage
			</div>
			<div class="font-medium">{instance.current_stage.name}</div>
			{#if instance.current_stage.description}
				<p class="mt-1 text-sm text-muted-foreground">{instance.current_stage.description}</p>
			{/if}

			{#if instance.status === 'paused' && onResumeWorkflow}
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
			{#each instance.stages as stage, index}
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
				{#if index < instance.stages.length - 1}
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
			<span>Started: {formatDate(instance.created_at)}</span>
		</div>

		{#if instance.created_by}
			<div class="flex items-center gap-2 text-muted-foreground">
				<User class="h-4 w-4" />
				<span>Created by: {instance.created_by.name}</span>
			</div>
		{/if}
	</div>
</div>
