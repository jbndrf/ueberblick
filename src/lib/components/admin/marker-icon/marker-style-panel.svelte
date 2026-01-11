<script lang="ts">
	import { type MarkerStyle } from '$lib/utils/marker-style-presets';
	import ShapePicker from './shape-picker.svelte';
	import ColorPresetPicker from './color-preset-picker.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { ChevronDown, ChevronUp } from 'lucide-svelte';

	interface Props {
		style: MarkerStyle;
		disabled?: boolean;
	}

	let { style = $bindable(), disabled = false }: Props = $props();

	let showAdvanced = $state(false);

	const borderWidths = [0, 1, 2, 3, 4, 5];
	const sizes = [16, 24, 32, 48, 64];

	function toggleAdvanced() {
		showAdvanced = !showAdvanced;
	}
</script>

<div class="space-y-4 rounded-lg border bg-card p-4 {disabled ? 'pointer-events-none opacity-50' : ''}">
	<!-- Header -->
	<div class="flex items-center gap-2">
		<span class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
			2
		</span>
		<h3 class="font-semibold">Style Marker</h3>
	</div>

	<div class="space-y-6">
		<!-- Shape Picker -->
		<ShapePicker bind:value={style.shape} />

		<!-- Icon Color -->
		<ColorPresetPicker bind:value={style.iconColor} label="Icon Color" type="icon" />

		<!-- Background Color -->
		<ColorPresetPicker bind:value={style.backgroundColor} label="Background Color" type="background" />

		<!-- Size Slider -->
		<div class="space-y-3">
			<Label for="size-slider">Marker Size: {style.size}px</Label>
			<div class="space-y-2">
				<input
					id="size-slider"
					type="range"
					bind:value={style.size}
					min="16"
					max="64"
					step="1"
					class="w-full"
				/>
				<div class="flex justify-between text-xs text-muted-foreground">
					{#each sizes as size}
						<button
							type="button"
							onclick={() => (style.size = size)}
							class="hover:text-foreground {style.size === size ? 'font-bold text-primary' : ''}"
						>
							{size}px
						</button>
					{/each}
				</div>
			</div>
		</div>

		<!-- Border -->
		<div class="space-y-3">
			<Label>Border Width</Label>
			<div class="flex gap-1">
				{#each borderWidths as width}
					<button
						type="button"
						onclick={() => (style.borderWidth = width)}
						class="flex h-10 flex-1 items-center justify-center rounded-md border-2 text-sm font-medium transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary {style.borderWidth ===
						width
							? 'border-primary bg-primary text-primary-foreground'
							: 'border-border bg-background hover:border-primary/50'}"
					>
						{width}
					</button>
				{/each}
			</div>

			{#if style.borderWidth > 0}
				<div class="pt-2">
					<ColorPresetPicker bind:value={style.borderColor} label="Border Color" type="icon" />
				</div>
			{/if}
		</div>

		<!-- Drop Shadow -->
		<div class="flex items-center justify-between">
			<Label>Drop Shadow</Label>
			<Switch bind:checked={style.dropShadow} />
		</div>

		<!-- Advanced Options -->
		<div class="border-t pt-4">
			<Button variant="ghost" onclick={toggleAdvanced} class="w-full justify-between">
				<span class="text-sm font-medium">Advanced Options</span>
				{#if showAdvanced}
					<ChevronUp class="h-4 w-4" />
				{:else}
					<ChevronDown class="h-4 w-4" />
				{/if}
			</Button>

			{#if showAdvanced && style.dropShadow}
				<div class="mt-4 space-y-4 rounded-lg border bg-muted/50 p-4">
					<div class="space-y-2">
						<Label for="shadow-x">Shadow Offset X: {style.shadowOffsetX || 0}px</Label>
						<input
							id="shadow-x"
							type="range"
							bind:value={style.shadowOffsetX}
							min="-10"
							max="10"
							step="1"
							class="w-full"
						/>
					</div>

					<div class="space-y-2">
						<Label for="shadow-y">Shadow Offset Y: {style.shadowOffsetY || 2}px</Label>
						<input
							id="shadow-y"
							type="range"
							bind:value={style.shadowOffsetY}
							min="-10"
							max="10"
							step="1"
							class="w-full"
						/>
					</div>

					<div class="space-y-2">
						<Label for="shadow-blur">Shadow Blur: {style.shadowBlur || 4}px</Label>
						<input
							id="shadow-blur"
							type="range"
							bind:value={style.shadowBlur}
							min="0"
							max="20"
							step="1"
							class="w-full"
						/>
					</div>

					<div class="space-y-2">
						<Label for="shadow-opacity"
							>Shadow Opacity: {((style.shadowOpacity || 0.1) * 100).toFixed(0)}%</Label
						>
						<input
							id="shadow-opacity"
							type="range"
							bind:value={style.shadowOpacity}
							min="0"
							max="1"
							step="0.05"
							class="w-full"
						/>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
