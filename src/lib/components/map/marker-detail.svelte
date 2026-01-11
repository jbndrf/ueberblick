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

	interface Marker {
		id: string;
		title: string;
		description?: string;
		category?: {
			name: string;
			color: string;
		};
		location: {
			lat: number;
			lng: number;
		};
		created_at?: string;
		created_by?: {
			name: string;
		};
		images?: Array<{
			url: string;
			filename: string;
		}>;
		custom_data?: Record<string, any>;
	}

	interface Props {
		marker: Marker;
		canEdit?: boolean;
		canDelete?: boolean;
		onEdit?: () => void;
		onDelete?: () => void;
		onNavigate?: () => void;
	}

	let {
		marker,
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
	{#if marker.category}
		<div class="mb-3">
			<Badge variant="secondary" class="text-xs">
				<div
					class="mr-1.5 h-2 w-2 rounded-full"
					style="background-color: {marker.category.color}"
				></div>
				{marker.category.name}
			</Badge>
		</div>
	{/if}

	<!-- Title and Description -->
	<div class="mb-4">
		<h3 class="mb-2 text-lg font-semibold">{marker.title}</h3>
		{#if marker.description}
			<p class="text-sm text-muted-foreground">{marker.description}</p>
		{/if}
	</div>

	<Separator class="my-4" />

	<!-- Metadata -->
	<div class="space-y-3">
		<!-- Location -->
		<div class="flex items-start gap-3 text-sm">
			<MapPin class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
			<div>
				<div class="font-medium">Location</div>
				<div class="text-muted-foreground">
					{formatCoordinates(marker.location.lat, marker.location.lng)}
				</div>
			</div>
		</div>

		<!-- Created Date -->
		{#if marker.created_at}
			<div class="flex items-start gap-3 text-sm">
				<Calendar class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
				<div>
					<div class="font-medium">Created</div>
					<div class="text-muted-foreground">{formatDate(marker.created_at)}</div>
				</div>
			</div>
		{/if}

		<!-- Created By -->
		{#if marker.created_by}
			<div class="flex items-start gap-3 text-sm">
				<User class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
				<div>
					<div class="font-medium">Created by</div>
					<div class="text-muted-foreground">{marker.created_by.name}</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Images -->
	{#if marker.images && marker.images.length > 0}
		<Separator class="my-4" />
		<div>
			<h4 class="mb-3 text-sm font-medium">Images</h4>
			<div class="grid grid-cols-2 gap-2">
				{#each marker.images as image}
					<a href={image.url} target="_blank" rel="noopener noreferrer" class="group relative">
						<img
							src={image.url}
							alt={image.filename}
							class="aspect-square w-full rounded-md border object-cover transition-opacity group-hover:opacity-75"
						/>
						<div
							class="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
						>
							<ExternalLink class="h-5 w-5 text-white drop-shadow-lg" />
						</div>
					</a>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Custom Data -->
	{#if marker.custom_data && Object.keys(marker.custom_data).length > 0}
		<Separator class="my-4" />
		<div>
			<h4 class="mb-3 text-sm font-medium">Additional Information</h4>
			<div class="space-y-2">
				{#each Object.entries(marker.custom_data) as [key, value]}
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
