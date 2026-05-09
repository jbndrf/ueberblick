<script lang="ts">
	import ModuleShell from '$lib/components/module-shell.svelte';
	import type { MarkerSelection } from '../types';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		selection: MarkerSelection;
		markers: any[];
		isExpanded?: boolean;
		onClose: () => void;
		onNext?: () => void;
		onPrevious?: () => void;
	}

	let {
		selection,
		markers,
		isExpanded = $bindable(false),
		onClose,
		onNext,
		onPrevious
	}: Props = $props();

	const marker = $derived(markers.find((m: any) => m.id === selection.markerId));
	const category = $derived(marker?.expand?.category_id);
	const fields = $derived<any[]>(
		Array.isArray(category?.fields) ? category.fields : []
	);

	function formatValue(value: unknown, fieldType: string, fieldOptions?: any): string {
		if (value == null || value === '') return '-';
		switch (fieldType) {
			case 'boolean':
				return (value ? (m.participantMarkerDetailYes?.() ?? 'Yes') : (m.participantMarkerDetailNo?.() ?? 'No'));
			case 'date': {
				const str = String(value);
				const mode = fieldOptions?.date_mode || 'date';
				if (mode === 'time') {
					const m = str.match(/^(\d{1,2}):(\d{2})/);
					return m ? `${m[1].padStart(2, '0')}:${m[2]}` : str;
				}
				const date = new Date(str);
				if (isNaN(date.getTime())) return str;
				if (mode === 'datetime') {
					return date.toLocaleString('de-DE', {
						day: '2-digit',
						month: '2-digit',
						year: 'numeric',
						hour: '2-digit',
						minute: '2-digit'
					});
				}
				return date.toLocaleDateString('de-DE', {
					day: '2-digit',
					month: '2-digit',
					year: 'numeric'
				});
			}
			default:
				return String(value);
		}
	}

	function formatFieldName(name: string): string {
		return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}
</script>

<ModuleShell
	isOpen={!!marker}
	bind:isExpanded
	title={marker?.title ?? ''}
	subtitle={category?.name ?? ''}
	{onClose}
	{onNext}
	{onPrevious}
	mobileHeightPeek={35}
	mobileHeightExpanded={80}
>
	{#snippet content()}
		{#if marker}
			<div class="flex flex-col gap-4 p-4">
				{#if marker.description}
					<p class="text-sm text-muted-foreground">{marker.description}</p>
				{/if}

				{#if fields.length > 0}
					<div class="flex flex-col gap-2">
						{#each fields as field (field.id)}
							{@const value = marker.properties?.[field.field_name]}
							<div class="flex items-baseline justify-between gap-4 rounded-lg bg-muted/50 px-3 py-2">
								<span class="text-xs font-medium text-muted-foreground">
									{formatFieldName(field.field_name)}
								</span>
								<span class="text-sm font-medium">
									{formatValue(value, field.field_type, field.field_options)}
								</span>
							</div>
						{/each}
					</div>
				{/if}

				{#if marker.location?.lat != null && marker.location?.lon != null}
					<div class="flex items-baseline justify-between gap-4 rounded-lg bg-muted/50 px-3 py-2">
						<span class="text-xs font-medium text-muted-foreground">{m.mapLocation?.() ?? 'Location'}</span>
						<span class="text-sm font-medium tabular-nums">
							{Number(marker.location.lat).toFixed(5)}, {Number(marker.location.lon).toFixed(5)}
						</span>
					</div>
				{/if}

				{#if marker.created}
					<div class="flex items-baseline justify-between gap-4 rounded-lg bg-muted/50 px-3 py-2">
						<span class="text-xs font-medium text-muted-foreground">{m.mapCreated?.() ?? 'Created'}</span>
						<span class="text-sm font-medium">
							{new Date(marker.created).toLocaleDateString()}
						</span>
					</div>
				{/if}
			</div>
		{/if}
	{/snippet}
</ModuleShell>
