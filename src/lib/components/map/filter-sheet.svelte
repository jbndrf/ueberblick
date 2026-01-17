<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Separator } from '$lib/components/ui/separator';
	import * as m from '$lib/paraglide/messages';

	interface TileLayer {
		id: string;
		name: string;
		url: string;
		active: boolean;
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

	interface MarkerCategory {
		id: string;
		name: string;
		visible: boolean;
		icon_config?: IconConfig | null;
	}

	interface Props {
		open: boolean;
		onClose?: () => void;
		tileLayers?: TileLayer[];
		markerCategories?: MarkerCategory[];
		onTileLayerChange?: (layerId: string, active: boolean) => void;
		onCategoryVisibilityChange?: (categoryId: string, visible: boolean) => void;
	}

	let {
		open = $bindable(),
		onClose,
		tileLayers = [],
		markerCategories = [],
		onTileLayerChange,
		onCategoryVisibilityChange
	}: Props = $props();

	function handleClose() {
		open = false;
		onClose?.();
	}

	function toggleTileLayer(layerId: string, currentState: boolean) {
		onTileLayerChange?.(layerId, !currentState);
	}

	function toggleCategoryVisibility(categoryId: string, currentState: boolean) {
		onCategoryVisibilityChange?.(categoryId, !currentState);
	}

	function renderIcon(config: IconConfig | null | undefined, size: number = 24): string | null {
		if (!config?.svgContent) return null;
		const color = config.style?.color || '#333';
		return config.svgContent.replace(
			/(<svg[^>]*)(>)/,
			`$1 style="width: ${size}px; height: ${size}px; fill: ${color};"$2`
		);
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="left" class="w-80">
		<Sheet.Header>
			<Sheet.Title>Filters</Sheet.Title>
			<Sheet.Description>Filter map layers and markers</Sheet.Description>
		</Sheet.Header>

		<div class="space-y-6 py-6">
			<!-- Tile Layers -->
			{#if tileLayers.length > 0}
				<div>
					<h4 class="mb-3 text-sm font-medium">Map Layers</h4>
					<div class="space-y-3">
						{#each tileLayers as layer}
							<div class="flex items-center justify-between space-x-2">
								<Label for="tile-{layer.id}" class="flex-1 cursor-pointer text-sm font-normal">
									{layer.name}
								</Label>
								<Switch
									id="tile-{layer.id}"
									checked={layer.active}
									onCheckedChange={() => toggleTileLayer(layer.id, layer.active)}
								/>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			{#if tileLayers.length > 0 && markerCategories.length > 0}
				<Separator />
			{/if}

			<!-- Marker Categories -->
			{#if markerCategories.length > 0}
				<div>
					<h4 class="mb-3 text-sm font-medium">Marker Categories</h4>
					<div class="space-y-2">
						{#each markerCategories as category}
							<div class="flex items-center gap-3 rounded-lg border p-3">
								<!-- Icon -->
								<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted/50">
									{#if category.icon_config?.svgContent}
										{@html renderIcon(category.icon_config, 20)}
									{:else}
										<div class="h-4 w-4 rounded-full bg-muted-foreground/30"></div>
									{/if}
								</div>

								<!-- Name -->
								<Label
									for="category-{category.id}"
									class="min-w-0 flex-1 cursor-pointer truncate text-sm font-medium"
								>
									{category.name}
								</Label>

								<!-- Toggle -->
								<Switch
									id="category-{category.id}"
									checked={category.visible}
									onCheckedChange={() => toggleCategoryVisibility(category.id, category.visible)}
								/>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			{#if tileLayers.length === 0 && markerCategories.length === 0}
				<div class="py-8 text-center text-sm text-muted-foreground">No filters available</div>
			{/if}
		</div>
	</Sheet.Content>
</Sheet.Root>
