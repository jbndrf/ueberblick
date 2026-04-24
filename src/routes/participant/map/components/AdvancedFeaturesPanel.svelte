<script lang="ts">
	import { Switch } from '$lib/components/ui/switch';
	import { Badge } from '$lib/components/ui/badge';
	import { ChevronDown, ChevronRight, Sparkles } from '@lucide/svelte';
	import {
		FEATURE_REGISTRY,
		getEnabledFeatures,
		toggleFeature,
		type FeatureKey,
		type FeatureDefinition
	} from '$lib/participant-state/enabled-features.svelte';

	let expanded = $state(false);

	const enabled = $derived(getEnabledFeatures());

	// Short, user-facing labels. Keyed by feature key so copy lives next to the
	// registry. Kept here (not i18n) to stay inside the current slice; can be
	// moved to paraglide messages in a follow-up.
	const COPY: Record<FeatureKey, { name: string; description: string }> = {
		'filter.field_filters': {
			name: 'Views',
			description: 'Master filter views that replace the default filter sheet app-wide — pick fields, ranges, free-text search.'
		},
		'tools.cluster': {
			name: 'Cluster control',
			description: 'Toggle clustering and adjust the cap for individual markers in view.'
		}
	};

	const GROUP_LABELS: Record<FeatureDefinition['group'], string> = {
		filter: 'Filter sheet',
		layers: 'Layer sheet',
		tools: 'Map tools'
	};

	const grouped = $derived.by(() => {
		const out = new Map<FeatureDefinition['group'], FeatureDefinition[]>();
		for (const f of FEATURE_REGISTRY) {
			const list = out.get(f.group) ?? [];
			list.push(f);
			out.set(f.group, list);
		}
		return out;
	});

	async function onToggle(key: FeatureKey, on: boolean) {
		await toggleFeature(key, on);
	}
</script>

<div class="rounded-md border">
	<button
		class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent"
		onclick={() => (expanded = !expanded)}
	>
		<div class="flex items-center gap-2">
			<Sparkles class="h-4 w-4 text-muted-foreground" />
			<span class="text-sm font-medium">Advanced features</span>
			{#if enabled.size > 0}
				<Badge variant="secondary" class="text-xs">{enabled.size}</Badge>
			{/if}
		</div>
		{#if expanded}
			<ChevronDown class="h-4 w-4 text-muted-foreground" />
		{:else}
			<ChevronRight class="h-4 w-4 text-muted-foreground" />
		{/if}
	</button>

	{#if expanded}
		<div class="space-y-4 border-t p-3">
			<p class="text-xs text-muted-foreground">
				Turn on extra tools. Each one shows up as a new tab in its sheet.
			</p>

			{#each [...grouped.entries()] as [group, features]}
				<div class="space-y-2">
					<h5 class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
						{GROUP_LABELS[group]}
					</h5>
					<div class="space-y-1.5">
						{#each features as feat}
							{@const copy = COPY[feat.key]}
							<div class="flex items-start justify-between gap-3 rounded px-2 py-1.5 {feat.available ? '' : 'opacity-50'}">
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-1.5">
										<span class="text-sm">{copy.name}</span>
										{#if !feat.available}
											<Badge variant="outline" class="text-[10px] px-1 py-0">Coming soon</Badge>
										{/if}
									</div>
									<div class="text-xs text-muted-foreground">{copy.description}</div>
								</div>
								<Switch
									checked={enabled.has(feat.key)}
									disabled={!feat.available}
									onCheckedChange={(on) => onToggle(feat.key, on)}
								/>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
