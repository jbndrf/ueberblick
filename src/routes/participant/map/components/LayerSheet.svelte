<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Separator } from '$lib/components/ui/separator';

	interface MapLayer {
		id: string;
		name: string;
		layer_type: 'base' | 'overlay';
		source_type: string;
	}

	interface Props {
		open: boolean;
		layers: MapLayer[];
		activeBaseLayerId: string | null;
		activeOverlayIds: string[];
		onBaseLayerChange: (id: string) => void;
		onOverlayToggle: (id: string, active: boolean) => void;
	}

	let {
		open = $bindable(),
		layers = [],
		activeBaseLayerId,
		activeOverlayIds = [],
		onBaseLayerChange,
		onOverlayToggle
	}: Props = $props();

	// Split layers into base and overlay
	const baseLayers = $derived(layers.filter((l) => l.layer_type === 'base'));
	const overlayLayers = $derived(layers.filter((l) => l.layer_type !== 'base'));

	function handleBaseLayerChange(value: string) {
		onBaseLayerChange(value);
	}

	function handleOverlayToggle(id: string, currentState: boolean) {
		onOverlayToggle(id, !currentState);
	}
</script>

<Sheet.Root bind:open>
	<Sheet.ContentNoOverlay side="left" class="w-80">
		<Sheet.Header>
			<Sheet.Title>Map Layers</Sheet.Title>
			<Sheet.Description>Select base map and overlay layers</Sheet.Description>
		</Sheet.Header>

		<div class="space-y-6 py-6">
			<!-- Base Layers -->
			{#if baseLayers.length > 0}
				<div>
					<h4 class="mb-3 text-sm font-medium">Base Layers</h4>
					<RadioGroup.Root value={activeBaseLayerId ?? ''} onValueChange={handleBaseLayerChange}>
						<div class="space-y-2">
							{#each baseLayers as layer}
								<div class="flex items-center space-x-3 rounded-lg border p-3">
									<RadioGroup.Item value={layer.id} id="base-{layer.id}" />
									<Label for="base-{layer.id}" class="flex-1 cursor-pointer text-sm font-medium">
										{layer.name}
									</Label>
								</div>
							{/each}
						</div>
					</RadioGroup.Root>
				</div>
			{/if}

			{#if baseLayers.length > 0 && overlayLayers.length > 0}
				<Separator />
			{/if}

			<!-- Overlay Layers -->
			{#if overlayLayers.length > 0}
				<div>
					<h4 class="mb-3 text-sm font-medium">Overlay Layers</h4>
					<div class="space-y-2">
						{#each overlayLayers as layer}
							{@const isActive = activeOverlayIds.includes(layer.id)}
							<div class="flex items-center justify-between space-x-3 rounded-lg border p-3">
								<Label
									for="overlay-{layer.id}"
									class="flex-1 cursor-pointer text-sm font-medium"
								>
									{layer.name}
								</Label>
								<Switch
									id="overlay-{layer.id}"
									checked={isActive}
									onCheckedChange={() => handleOverlayToggle(layer.id, isActive)}
								/>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			{#if baseLayers.length === 0 && overlayLayers.length === 0}
				<div class="py-8 text-center text-sm text-muted-foreground">
					No map layers configured for this project
				</div>
			{/if}
		</div>
	</Sheet.ContentNoOverlay>
</Sheet.Root>
