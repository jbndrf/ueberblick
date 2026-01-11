<script lang="ts">
	import type { LayerElement } from '$lib/types/map-layer';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Textarea } from '$lib/components/ui/textarea';
	import { ChevronDown, Check } from 'lucide-svelte';
	import * as m from '$lib/paraglide/messages';
	import { createEventDispatcher } from 'svelte';

	interface Props {
		element: LayerElement;
		onchange?: (element: LayerElement) => void;
	}

	let { element, onchange }: Props = $props();

	// Create a local copy to avoid mutation issues
	let localElement = $state({ ...element });

	// Sync local state with prop changes
	$effect(() => {
		localElement = { ...element };
	});

	const dispatch = createEventDispatcher<{
		change: LayerElement;
	}>();

	function handleChange() {
		onchange?.(localElement);
		dispatch('change', localElement);
	}

	const positions = [
		{ value: 'topleft', label: m.mapLayerPositionTopLeft() },
		{ value: 'topright', label: m.mapLayerPositionTopRight() },
		{ value: 'bottomleft', label: m.mapLayerPositionBottomLeft() },
		{ value: 'bottomright', label: m.mapLayerPositionBottomRight() }
	];
</script>

<div class="space-y-4 p-4">
	<!-- Common Fields -->
	<div class="grid gap-4">
		<div class="space-y-2">
			<Label for="element-name">{m.mapLayerFieldName()}</Label>
			<Input
				id="element-name"
				bind:value={localElement.name}
				onchange={handleChange}
				placeholder={m.mapLayerFieldNamePlaceholder()}
			/>
		</div>

		<div class="flex items-center space-x-2">
			<Switch id="element-visible" bind:checked={localElement.visible} onchange={handleChange} />
			<Label for="element-visible">{m.mapLayerFieldVisible()}</Label>
		</div>

		{#if 'zIndex' in localElement}
			<div class="space-y-2">
				<Label for="element-zindex">{m.mapLayerFieldZIndex()}</Label>
				<Input
					id="element-zindex"
					type="number"
					bind:value={localElement.zIndex}
					onchange={handleChange}
					min="0"
				/>
			</div>
		{/if}
	</div>

	<!-- Layer-specific Fields -->
	{#if localElement.type === 'base-layer' || localElement.type === 'overlay-layer'}
		<div class="space-y-4">
			<div class="space-y-2">
				<Label for="element-url">{m.mapLayerFieldTileUrl()}</Label>
				<Input
					id="element-url"
					bind:value={localElement.url}
					onchange={handleChange}
					placeholder="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
				/>
				<p class="text-xs text-muted-foreground">{m.mapLayerFieldTileUrlHelp({ z: '{z}', x: '{x}', y: '{y}' })}</p>
			</div>

			<div class="space-y-2">
				<Label for="element-attribution">{m.mapLayerFieldAttribution()}</Label>
				<Input
					id="element-attribution"
					bind:value={localElement.attribution}
					onchange={handleChange}
					placeholder="© Map Provider"
				/>
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div class="space-y-2">
					<Label for="element-opacity">{m.mapLayerFieldOpacity()}</Label>
					<Input
						id="element-opacity"
						type="number"
						bind:value={localElement.opacity}
						onchange={handleChange}
						min="0"
						max="1"
						step="0.1"
					/>
				</div>

				<div class="space-y-2">
					<Label for="element-minzoom">{m.mapLayerFieldMinZoom()}</Label>
					<Input
						id="element-minzoom"
						type="number"
						bind:value={localElement.minZoom}
						onchange={handleChange}
						min="0"
						max="22"
					/>
				</div>
			</div>

			<div class="space-y-2">
				<Label for="element-maxzoom">{m.mapLayerFieldMaxZoom()}</Label>
				<Input
					id="element-maxzoom"
					type="number"
					bind:value={localElement.maxZoom}
					onchange={handleChange}
					min="0"
					max="22"
				/>
			</div>
		</div>
	{/if}

	{#if localElement.type === 'wms-layer'}
		<div class="space-y-4">
			<div class="space-y-2">
				<Label for="element-url">{m.mapLayerFieldWmsUrl()}</Label>
				<Input
					id="element-url"
					bind:value={localElement.url}
					onchange={handleChange}
					placeholder="https://example.com/wms"
				/>
			</div>

			<div class="space-y-2">
				<Label for="element-layers">{m.mapLayerFieldWmsLayers()}</Label>
				<Input
					id="element-layers"
					bind:value={localElement.layers}
					onchange={handleChange}
					placeholder="layer1,layer2"
				/>
				<p class="text-xs text-muted-foreground">{m.mapLayerFieldWmsLayersHelp()}</p>
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div class="space-y-2">
					<Label for="element-format">{m.mapLayerFieldWmsFormat()}</Label>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger asChild>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="outline"
									class="w-full justify-between"
									id="element-format"
								>
									{localElement.format === 'image/png' ? 'PNG' :
									 localElement.format === 'image/jpeg' ? 'JPEG' :
									 localElement.format === 'image/gif' ? 'GIF' : 'Select format'}
									<ChevronDown class="ml-2 h-4 w-4 opacity-50" />
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content class="w-full">
							<DropdownMenu.Item onclick={() => { localElement.format = 'image/png'; handleChange(); }}>
								{#if localElement.format === 'image/png'}
									<Check class="mr-2 h-4 w-4" />
								{:else}
									<span class="mr-2 h-4 w-4"></span>
								{/if}
								PNG
							</DropdownMenu.Item>
							<DropdownMenu.Item onclick={() => { localElement.format = 'image/jpeg'; handleChange(); }}>
								{#if localElement.format === 'image/jpeg'}
									<Check class="mr-2 h-4 w-4" />
								{:else}
									<span class="mr-2 h-4 w-4"></span>
								{/if}
								JPEG
							</DropdownMenu.Item>
							<DropdownMenu.Item onclick={() => { localElement.format = 'image/gif'; handleChange(); }}>
								{#if localElement.format === 'image/gif'}
									<Check class="mr-2 h-4 w-4" />
								{:else}
									<span class="mr-2 h-4 w-4"></span>
								{/if}
								GIF
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>

				<div class="flex items-center space-x-2 pt-8">
					<Switch
						id="element-transparent"
						bind:checked={localElement.transparent}
						onchange={handleChange}
					/>
					<Label for="element-transparent">{m.mapLayerFieldWmsTransparent()}</Label>
				</div>
			</div>

			<div class="space-y-2">
				<Label for="element-attribution">{m.mapLayerFieldAttribution()}</Label>
				<Input
					id="element-attribution"
					bind:value={localElement.attribution}
					onchange={handleChange}
				/>
			</div>

			<div class="space-y-2">
				<Label for="element-opacity">{m.mapLayerFieldOpacity()}</Label>
				<Input
					id="element-opacity"
					type="number"
					bind:value={localElement.opacity}
					onchange={handleChange}
					min="0"
					max="1"
					step="0.1"
				/>
			</div>
		</div>
	{/if}

	{#if localElement.type === 'geojson-layer'}
		<div class="space-y-4">
			<div class="space-y-2">
				<Label for="element-url">{m.mapLayerFieldGeojsonUrl()}</Label>
				<Input
					id="element-url"
					bind:value={localElement.url}
					onchange={handleChange}
					placeholder="https://example.com/data.geojson"
				/>
			</div>

			<div class="space-y-2">
				<Label for="element-style">{m.mapLayerFieldGeojsonStyle()}</Label>
				<Textarea
					id="element-style"
					value={JSON.stringify(localElement.style || {}, null, 2)}
					onchange={(e) => {
						try {
							localElement.style = JSON.parse(e.currentTarget.value);
							handleChange();
						} catch (error) {
							// Invalid JSON, ignore
						}
					}}
					rows={6}
					placeholder={'{\n  "color": "#3388ff",\n  "weight": 3,\n  "opacity": 1\n}'}
				/>
				<p class="text-xs text-muted-foreground">{m.mapLayerFieldGeojsonStyleHelp()}</p>
			</div>

			<div class="space-y-2">
				<Label for="element-opacity">{m.mapLayerFieldOpacity()}</Label>
				<Input
					id="element-opacity"
					type="number"
					bind:value={localElement.opacity}
					onchange={handleChange}
					min="0"
					max="1"
					step="0.1"
				/>
			</div>
		</div>
	{/if}

	{#if localElement.type === 'marker-cluster'}
		<div class="space-y-4">
			<div class="space-y-2">
				<Label for="element-radius">{m.mapLayerFieldClusterRadius()}</Label>
				<Input
					id="element-radius"
					type="number"
					bind:value={localElement.maxClusterRadius}
					onchange={handleChange}
					min="0"
					max="200"
				/>
				<p class="text-xs text-muted-foreground">{m.mapLayerFieldClusterRadiusHelp()}</p>
			</div>

			<div class="flex items-center space-x-2">
				<Switch
					id="element-spiderfy"
					bind:checked={localElement.spiderfyOnMaxZoom}
					onchange={handleChange}
				/>
				<Label for="element-spiderfy">{m.mapLayerFieldClusterSpiderfy()}</Label>
			</div>

			<div class="flex items-center space-x-2">
				<Switch
					id="element-coverage"
					bind:checked={localElement.showCoverageOnHover}
					onchange={handleChange}
				/>
				<Label for="element-coverage">{m.mapLayerFieldClusterCoverage()}</Label>
			</div>
		</div>
	{/if}

	<!-- Control-specific Fields -->
	{#if localElement.type === 'layer-control' || element.type === 'scale-control' || element.type === 'zoom-control'}
		<div class="space-y-4">
			<div class="space-y-2">
				<Label for="element-position">{m.mapLayerFieldPosition()}</Label>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger asChild>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="outline"
								class="w-full justify-between"
								id="element-position"
							>
								{positions.find((p) => p.value === localElement.position)?.label || 'Select position'}
								<ChevronDown class="ml-2 h-4 w-4 opacity-50" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content class="w-full">
						{#each positions as position}
							<DropdownMenu.Item onclick={() => { localElement.position = position.value as any; handleChange(); }}>
								{#if localElement.position === position.value}
									<Check class="mr-2 h-4 w-4" />
								{:else}
									<span class="mr-2 h-4 w-4"></span>
								{/if}
								{position.label}
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>

			{#if localElement.type === 'layer-control'}
				<div class="flex items-center space-x-2">
					<Switch id="element-collapsed" bind:checked={localElement.collapsed} onchange={handleChange} />
					<Label for="element-collapsed">{m.mapLayerFieldCollapsed()}</Label>
				</div>
			{/if}

			{#if localElement.type === 'scale-control'}
				<div class="flex items-center space-x-2">
					<Switch id="element-imperial" bind:checked={localElement.imperial} onchange={handleChange} />
					<Label for="element-imperial">{m.mapLayerFieldImperial()}</Label>
				</div>
			{/if}
		</div>
	{/if}
</div>
