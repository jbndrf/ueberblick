<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import {
		MapPin,
		Calendar,
		User,
		ExternalLink,
		Navigation,
		Edit,
		Trash2
	} from 'lucide-svelte';
	import * as m from '$lib/paraglide/messages';
	import type { Marker as GatewayMarker, MarkerCategory } from '$lib/participant-state/types';

	interface Props {
		marker: GatewayMarker;
		category?: MarkerCategory;
		canEdit?: boolean;
		canDelete?: boolean;
		onEdit?: () => void;
		onDelete?: () => void;
		onNavigate?: () => void;
	}

	let {
		marker,
		category,
		canEdit = false,
		canDelete = false,
		onEdit,
		onDelete,
		onNavigate
	}: Props = $props();

	function formatDate(dateString: string | undefined): string {
		if (!dateString) return 'Unknown';
		const date = new Date(dateString);
		return date.toLocaleString();
	}

	function formatCoordinates(lat: number, lng: number): string {
		return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
	}
</script>

<div class="marker-detail p-4">
	<!-- Header with category -->
	{#if category}
		<div class="mb-3">
			<Badge variant="secondary" class="text-xs">
				<div
					class="mr-1.5 h-2 w-2 rounded-full"
					style="background-color: {category.icon_config?.color || '#6c757d'}"
				></div>
				{category.name}
			</Badge>
		</div>
	{/if}

	<!-- Title and Description -->
	<div class="mb-4">
		<h3 class="mb-2 text-lg font-semibold">{marker.title || 'Untitled Marker'}</h3>
		{#if marker.description}
			<p class="text-sm text-muted-foreground">{marker.description}</p>
		{/if}
	</div>

	<Separator class="my-4" />

	<!-- Metadata -->
	<div class="space-y-3">
		<!-- Location -->
		{#if marker.location}
			<div class="flex items-start gap-3 text-sm">
				<MapPin class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
				<div>
					<div class="font-medium">Location</div>
					<div class="text-muted-foreground">
						{formatCoordinates(marker.location.lat, marker.location.lon)}
					</div>
				</div>
			</div>
		{/if}

		<!-- Created Date -->
		{#if marker.created}
			<div class="flex items-start gap-3 text-sm">
				<Calendar class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
				<div>
					<div class="font-medium">Created</div>
					<div class="text-muted-foreground">{formatDate(marker.created)}</div>
				</div>
			</div>
		{/if}

		<!-- Created By (just ID for now) -->
		{#if marker.created_by}
			<div class="flex items-start gap-3 text-sm">
				<User class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
				<div>
					<div class="font-medium">Created by</div>
					<div class="text-muted-foreground">{marker.created_by}</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Properties (custom data) -->
	{#if marker.properties && Object.keys(marker.properties).length > 0}
		<Separator class="my-4" />
		<div>
			<h4 class="mb-3 text-sm font-medium">Additional Information</h4>
			<div class="space-y-2">
				{#each Object.entries(marker.properties) as [key, value]}
					<div class="rounded-md border bg-muted/50 p-2 text-sm">
						<div class="font-medium capitalize">{key.replace(/_/g, ' ')}</div>
						<div class="text-muted-foreground">{value}</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Actions -->
	<div class="mt-6 flex flex-wrap gap-2">
		{#if onNavigate}
			<Button variant="outline" size="sm" onclick={onNavigate} class="flex-1">
				<Navigation class="mr-2 h-4 w-4" />
				Navigate
			</Button>
		{/if}
		{#if canEdit && onEdit}
			<Button variant="outline" size="sm" onclick={onEdit} class="flex-1">
				<Edit class="mr-2 h-4 w-4" />
				Edit
			</Button>
		{/if}
		{#if canDelete && onDelete}
			<Button variant="destructive" size="sm" onclick={onDelete}>
				<Trash2 class="mr-2 h-4 w-4" />
				Delete
			</Button>
		{/if}
	</div>
</div>
