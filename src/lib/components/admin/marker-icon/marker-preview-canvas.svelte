<script lang="ts">
	import { type MarkerStyle, getShapeClipPath, getShadowFilter } from '$lib/utils/marker-style-presets';
	import { sanitizeSvg } from '$lib/utils/svg-validator';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import { Label } from '$lib/components/ui/label';
	import { ZoomIn, ZoomOut, Grid3x3 } from 'lucide-svelte';

	interface Props {
		svgContent: string;
		style: MarkerStyle;
	}

	let { svgContent, style }: Props = $props();

	let zoom = $state(100);
	let showGrid = $state(true);
	const previewSizes = [16, 24, 32, 48, 64];

	function zoomIn() {
		zoom = Math.min(zoom + 25, 200);
	}

	function zoomOut() {
		zoom = Math.max(zoom - 25, 50);
	}

	function getMarkerStyle(size: number) {
		const clipPath = getShapeClipPath(style.shape);
		const filter = getShadowFilter(style);

		return `
			width: ${size}px;
			height: ${size}px;
			background-color: ${style.backgroundColor};
			${clipPath ? `clip-path: ${clipPath};` : ''}
			${style.borderWidth > 0 ? `border: ${style.borderWidth}px solid ${style.borderColor};` : ''}
			${filter ? `filter: ${filter};` : ''}
		`;
	}

	function getSvgStyle() {
		// Apply icon color to SVG
		return `color: ${style.iconColor}; fill: currentColor;`;
	}

	let sanitizedSvg = $derived(svgContent ? sanitizeSvg(svgContent) : '');
</script>

<div class="flex h-full flex-col space-y-4 rounded-lg border bg-card p-6">
	<!-- Header with controls -->
	<div class="flex items-center justify-between">
		<h3 class="font-semibold">Live Preview</h3>
		<div class="flex items-center gap-4">
			<div class="flex items-center gap-2">
				<Label class="text-xs">Grid</Label>
				<Switch bind:checked={showGrid} />
			</div>
			<div class="flex items-center gap-2">
				<Button variant="outline" size="sm" onclick={zoomOut} disabled={zoom <= 50}>
					<ZoomOut class="h-4 w-4" />
				</Button>
				<span class="w-12 text-center text-sm font-medium">{zoom}%</span>
				<Button variant="outline" size="sm" onclick={zoomIn} disabled={zoom >= 200}>
					<ZoomIn class="h-4 w-4" />
				</Button>
			</div>
		</div>
	</div>

	<!-- Multi-size preview -->
	<div class="flex-1 space-y-6 overflow-auto">
		<!-- Size comparison -->
		<div class="space-y-3">
			<p class="text-sm text-muted-foreground">Size Comparison</p>
			<div class="flex items-end justify-around gap-4 rounded-lg border bg-background p-6 {showGrid ? 'bg-[linear-gradient(rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.05)_1px,transparent_1px)] bg-[length:20px_20px]' : ''}">
				{#each previewSizes as size}
					<div class="flex flex-col items-center gap-2">
						<div
							class="relative flex items-center justify-center"
							style={getMarkerStyle(size)}
						>
							{#if sanitizedSvg}
								<div
									class="flex h-full w-full items-center justify-center p-1"
									style={getSvgStyle()}
								>
									{@html sanitizedSvg}
								</div>
							{/if}
						</div>
						<span class="text-xs text-muted-foreground">{size}px</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- Large preview -->
		<div class="space-y-3">
			<p class="text-sm text-muted-foreground">Detail View</p>
			<div class="flex items-center justify-center rounded-lg border bg-background p-12 {showGrid ? 'bg-[linear-gradient(rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.05)_1px,transparent_1px)] bg-[length:20px_20px]' : ''}">
				{#if sanitizedSvg}
					<div
						class="relative flex items-center justify-center transition-transform"
						style={`${getMarkerStyle(style.size)} transform: scale(${zoom / 100});`}
					>
						<div
							class="flex h-full w-full items-center justify-center p-2"
							style={getSvgStyle()}
						>
							{@html sanitizedSvg}
						</div>
					</div>
				{:else}
					<div class="text-center text-muted-foreground">
						<Grid3x3 class="mx-auto mb-2 h-12 w-12 opacity-20" />
						<p class="text-sm">Import an SVG to see preview</p>
					</div>
				{/if}
			</div>
		</div>

		<!-- Map context preview -->
		{#if sanitizedSvg}
			<div class="space-y-3">
				<p class="text-sm text-muted-foreground">Map Context</p>
				<div class="relative h-48 overflow-hidden rounded-lg border bg-gradient-to-br from-blue-50 to-green-50 dark:from-blue-950 dark:to-green-950">
					<!-- Fake map background -->
					<div class="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[length:40px_40px]"></div>

					<!-- Markers at different positions -->
					<div class="absolute left-1/4 top-1/3">
						<div
							class="relative flex items-center justify-center transition-transform hover:scale-110"
							style={getMarkerStyle(style.size)}
						>
							<div
								class="flex h-full w-full items-center justify-center p-2"
								style={getSvgStyle()}
							>
								{@html sanitizedSvg}
							</div>
						</div>
					</div>

					<div class="absolute right-1/3 top-1/2">
						<div
							class="relative flex items-center justify-center transition-transform hover:scale-110"
							style={getMarkerStyle(style.size)}
						>
							<div
								class="flex h-full w-full items-center justify-center p-2"
								style={getSvgStyle()}
							>
								{@html sanitizedSvg}
							</div>
						</div>
					</div>

					<div class="absolute bottom-1/4 left-1/2">
						<div
							class="relative flex items-center justify-center transition-transform hover:scale-110"
							style={getMarkerStyle(style.size)}
						>
							<div
								class="flex h-full w-full items-center justify-center p-2"
								style={getSvgStyle()}
							>
								{@html sanitizedSvg}
							</div>
						</div>
					</div>

					<p class="absolute bottom-2 right-2 text-xs text-muted-foreground/70">Preview on map</p>
				</div>
			</div>
		{/if}
	</div>
</div>
