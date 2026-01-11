<script lang="ts">
	import { COLOR_PRESETS } from '$lib/utils/marker-style-presets';
	import { Input } from '$lib/components/ui/input';

	interface Props {
		label: string;
		value: string;
		type?: 'icon' | 'background';
		onchange?: (color: string) => void;
	}

	let { label, value = $bindable(), type = 'icon', onchange }: Props = $props();

	const presets = type === 'icon' ? COLOR_PRESETS.icon : COLOR_PRESETS.background;

	let showCustom = $state(false);
	let customColor = $state(value);

	function handlePresetSelect(color: string) {
		value = color;
		showCustom = false;
		onchange?.(color);
	}

	function handleCustomInput(event: Event) {
		const target = event.target as HTMLInputElement;
		customColor = target.value;
		value = target.value;
		onchange?.(target.value);
	}

	function toggleCustom() {
		showCustom = !showCustom;
		if (showCustom) {
			customColor = value;
		}
	}

	// Check if current value matches any preset
	let isPresetSelected = $derived(presets.some((preset) => preset.value === value));
</script>

<div class="space-y-3">
	<div class="text-sm font-medium">{label}</div>

	<div class="space-y-2">
		<!-- Preset swatches -->
		<div class="flex flex-wrap gap-2">
			{#each presets as preset}
				<button
					type="button"
					onclick={() => handlePresetSelect(preset.value)}
					class="group relative flex h-10 w-10 items-center justify-center rounded-lg border-2 transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary {value ===
						preset.value && !showCustom
						? 'border-primary'
						: 'border-border'}"
					title={preset.name}
					aria-label={preset.name}
				>
					<span
						class="h-6 w-6 rounded-md border border-border/50 {preset.value === 'transparent'
							? 'bg-[linear-gradient(45deg,#ccc_25%,transparent_25%,transparent_75%,#ccc_75%,#ccc),linear-gradient(45deg,#ccc_25%,transparent_25%,transparent_75%,#ccc_75%,#ccc)] bg-[length:8px_8px] bg-[position:0_0,4px_4px]'
							: ''}"
						style={preset.value !== 'transparent' ? `background-color: ${preset.value}` : ''}
					></span>
					{#if value === preset.value && !showCustom}
						<span
							class="absolute inset-0 flex items-center justify-center text-xs font-bold {preset.value === '#FFFFFF' || preset.value === '#F1F5F9' || preset.value === 'transparent'
								? 'text-primary'
								: 'text-white'}"
						>
							✓
						</span>
					{/if}
				</button>
			{/each}

			<!-- Custom color button -->
			<button
				type="button"
				onclick={toggleCustom}
				class="flex h-10 w-10 items-center justify-center rounded-lg border-2 transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary {showCustom ||
				(!isPresetSelected && value)
					? 'border-primary'
					: 'border-border'}"
				title="Custom Color"
				aria-label="Custom Color"
			>
				<span class="text-sm font-medium">+</span>
			</button>
		</div>

		<!-- Custom color input -->
		{#if showCustom || (!isPresetSelected && value)}
			<div class="flex items-center gap-2">
				<div class="relative flex-1">
					<Input
						type="text"
						value={customColor}
						oninput={handleCustomInput}
						placeholder="#000000 or rgba(0,0,0,0.5)"
						class="pl-10 font-mono text-sm"
					/>
					<div
						class="absolute left-2 top-1/2 h-6 w-6 -translate-y-1/2 rounded border border-border"
						style="background-color: {value}"
					></div>
				</div>
				<input
					type="color"
					value={value.startsWith('#') ? value : '#000000'}
					oninput={handleCustomInput}
					class="h-10 w-10 cursor-pointer rounded border-2 border-border"
					title="Color Picker"
				/>
			</div>
		{/if}
	</div>
</div>
