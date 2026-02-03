<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { Switch } from '$lib/components/ui/switch';
	import { Separator } from '$lib/components/ui/separator';
	import { Badge } from '$lib/components/ui/badge';

	interface Marker {
		id: string;
		title: string;
		category_id: string;
		location?: { lat: number; lon: number };
		expand?: {
			category_id?: {
				name: string;
				icon_config?: any;
			};
		};
	}

	interface IconConfig {
		type: 'svg';
		svgContent: string;
		style?: {
			size?: number;
			color?: string;
			shape?: 'none' | 'pin';
		};
	}

	interface WorkflowInstance {
		id: string;
		status: string;
		workflow_id: string;
		location?: { lat: number; lon: number };
		expand?: {
			workflow_id?: {
				name: string;
				marker_color?: string;
				icon_config?: IconConfig;
			};
		};
	}

	function renderIcon(config: IconConfig | null | undefined, size: number = 16): string | null {
		if (!config?.svgContent) return null;
		const color = config.style?.color || '#333';
		return config.svgContent.replace(
			/(<svg[^>]*)(>)/,
			`$1 style="width: ${size}px; height: ${size}px; fill: ${color};"$2`
		);
	}

	interface Props {
		open: boolean;
		markers: Marker[];
		workflowInstances: WorkflowInstance[];
		visibleCategoryIds: string[];
		visibleWorkflowIds: string[];
		onCategoryToggle: (categoryId: string, visible: boolean) => void;
		onWorkflowToggle: (workflowId: string, visible: boolean) => void;
	}

	let {
		open = $bindable(),
		markers = [],
		workflowInstances = [],
		visibleCategoryIds = [],
		visibleWorkflowIds = [],
		onCategoryToggle,
		onWorkflowToggle
	}: Props = $props();

	// Group markers by category for display
	const markersByCategory = $derived.by(() => {
		const grouped = new Map<string, { categoryId: string; category: any; count: number }>();

		for (const marker of markers) {
			const catId = marker.category_id;
			if (!catId) continue;

			const category = marker.expand?.category_id;

			if (!grouped.has(catId)) {
				grouped.set(catId, {
					categoryId: catId,
					category: category || { name: 'Unknown' },
					count: 0
				});
			}
			grouped.get(catId)!.count++;
		}

		return Array.from(grouped.values());
	});

	// Group instances by workflow for display
	const instancesByWorkflow = $derived.by(() => {
		const grouped = new Map<string, { workflowId: string; workflow: any; count: number }>();

		for (const instance of workflowInstances) {
			const wfId = instance.workflow_id;
			if (!wfId) continue;

			const workflow = instance.expand?.workflow_id;

			if (!grouped.has(wfId)) {
				grouped.set(wfId, {
					workflowId: wfId,
					workflow: workflow || { name: 'Unknown' },
					count: 0
				});
			}
			grouped.get(wfId)!.count++;
		}

		return Array.from(grouped.values());
	});
</script>

<Sheet.Root bind:open>
	<Sheet.ContentNoOverlay side="left" class="w-80">
		<Sheet.Header>
			<Sheet.Title>Map Content</Sheet.Title>
			<Sheet.Description>Show or hide items on the map</Sheet.Description>
		</Sheet.Header>

		<div class="space-y-6 py-6 overflow-y-auto max-h-[calc(100vh-12rem)]">
			<!-- Workflow Instances grouped by Workflow -->
			{#if instancesByWorkflow.length > 0}
				<div>
					<h4 class="mb-3 text-sm font-medium">Workflow Instances</h4>
					<div class="space-y-2">
						{#each instancesByWorkflow as { workflowId, workflow, count }}
							<div class="flex items-center justify-between rounded-lg border p-3">
								<div class="flex items-center gap-2">
									{#if workflow.icon_config?.svgContent}
										<div class="flex h-5 w-5 shrink-0 items-center justify-center">
											{@html renderIcon(workflow.icon_config, 16)}
										</div>
									{:else}
										<div
											class="h-3 w-3 rounded-full"
											style:background-color={workflow.marker_color || '#6b7280'}
										></div>
									{/if}
									<span class="text-sm font-medium">{workflow.name}</span>
									<Badge variant="secondary" class="text-xs">{count}</Badge>
								</div>
								<Switch
									checked={visibleWorkflowIds.includes(workflowId)}
									onCheckedChange={(checked) => onWorkflowToggle(workflowId, checked)}
								/>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			{#if instancesByWorkflow.length > 0 && markersByCategory.length > 0}
				<Separator />
			{/if}

			<!-- Markers grouped by Category -->
			{#if markersByCategory.length > 0}
				<div>
					<h4 class="mb-3 text-sm font-medium">Markers</h4>
					<div class="space-y-2">
						{#each markersByCategory as { categoryId, category, count }}
							<div class="flex items-center justify-between rounded-lg border p-3">
								<div class="flex items-center gap-2">
									{#if category.icon_config?.svgContent}
										<div class="flex h-5 w-5 shrink-0 items-center justify-center">
											{@html renderIcon(category.icon_config, 16)}
										</div>
									{:else}
										<div class="h-3 w-3 rounded-full bg-primary"></div>
									{/if}
									<span class="text-sm font-medium">{category.name}</span>
									<Badge variant="secondary" class="text-xs">{count}</Badge>
								</div>
								<Switch
									checked={visibleCategoryIds.includes(categoryId)}
									onCheckedChange={(checked) => onCategoryToggle(categoryId, checked)}
								/>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			{#if instancesByWorkflow.length === 0 && markersByCategory.length === 0}
				<div class="py-8 text-center text-sm text-muted-foreground">
					No map content available
				</div>
			{/if}
		</div>
	</Sheet.ContentNoOverlay>
</Sheet.Root>
