<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from 'svelte-sonner';
	import { X, Upload } from 'lucide-svelte';

	type MarkerShape = 'none' | 'pin';

	interface IconStyle {
		size: number;
		color: string; // This is the pin color when shape='pin', icon color when shape='none'
		borderWidth: number;
		borderColor: string;
		backgroundColor: string;
		shadow: boolean;
		shape: MarkerShape;
	}

	interface IconConfig {
		type: 'svg';
		svgContent: string;
		style: IconStyle;
		metadata?: {
			source: string;
			fileSize: number;
			filename: string;
			uploadDate: string;
		};
	}

	interface Props {
		initialConfig?: IconConfig;
		onSave?: (config: IconConfig) => Promise<void> | void;
		onCancel?: () => void;
	}

	let { initialConfig, onSave, onCancel }: Props = $props();

	const DEFAULT_STYLE: IconStyle = {
		size: 64,
		color: '#2563eb',
		borderWidth: 2,
		borderColor: '#ffffff',
		backgroundColor: '#ffffff',
		shadow: false,
		shape: 'none'
	};

	let svgContent = $state(initialConfig?.svgContent || '');
	let style = $state<IconStyle>(initialConfig?.style || { ...DEFAULT_STYLE });
	let fileInput: HTMLInputElement;
	let uploadedFilename = $state('');

	function handlePaste(event: ClipboardEvent) {
		const text = event.clipboardData?.getData('text');
		if (text && text.trim().startsWith('<svg')) {
			svgContent = text.trim();
			uploadedFilename = '';
			toast.success('SVG pasted');
		}
	}

	async function handleFileUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file) return;

		if (!file.name.endsWith('.svg')) {
			toast.error('Please upload an SVG file');
			return;
		}

		try {
			const text = await file.text();
			if (text.trim().startsWith('<svg')) {
				svgContent = text.trim();
				uploadedFilename = file.name;
				toast.success('SVG uploaded');
			} else {
				toast.error('Invalid SVG file');
			}
		} catch (error) {
			toast.error('Error reading file');
		}
	}

	async function handleSave() {
		if (!svgContent.trim()) {
			toast.error('Please provide SVG content');
			return;
		}

		const config: IconConfig = {
			type: 'svg',
			svgContent: svgContent.trim(),
			style,
			metadata: {
				source: uploadedFilename ? 'file-upload' : 'code-input',
				fileSize: svgContent.length,
				filename: uploadedFilename || 'pasted-svg.svg',
				uploadDate: new Date().toISOString()
			}
		};

		if (onSave) {
			try {
				await onSave(config);
				toast.success('Icon saved successfully');
			} catch (error) {
				toast.error('Error saving icon');
			}
		}
	}

	function getMarkerShapeSVG(shape: MarkerShape, size: number): string {
		// Scale factors based on original 32x40 viewBox
		const scaleX = size / 32;
		const scaleY = (size * 1.25) / 40;

		if (shape === 'pin') {
			// Use the exact pin shape from the example, scaled to size
			return `
				<!-- Marker shadow -->
				<ellipse cx="${16 * scaleX}" cy="${37 * scaleY}" rx="${8 * scaleX}" ry="${3 * scaleY}" fill="rgba(0,0,0,0.2)"/>

				<!-- Main marker shape -->
				<path d="M${16 * scaleX} ${2 * scaleY}
				         C${9.373 * scaleX} ${2 * scaleY} ${4 * scaleX} ${7.373 * scaleY} ${4 * scaleX} ${14 * scaleY}
				         C${4 * scaleX} ${22 * scaleY} ${16 * scaleX} ${36 * scaleY} ${16 * scaleX} ${36 * scaleY}
				         S${28 * scaleX} ${22 * scaleY} ${28 * scaleX} ${14 * scaleY}
				         C${28 * scaleX} ${7.373 * scaleY} ${22.627 * scaleX} ${2 * scaleY} ${16 * scaleX} ${2 * scaleY} Z"
				      fill="${style.color}"
				      stroke="${style.borderColor}"
				      stroke-width="${style.borderWidth}"/>

				<!-- Inner circle for icon background -->
				<circle cx="${16 * scaleX}" cy="${14 * scaleY}" r="${10 * scaleX}" fill="#ffffff" opacity="0.9"/>
			`;
		}

		return '';
	}

	function getIconPlacement(shape: MarkerShape, size: number) {
		if (shape === 'pin') {
			// Icon goes in the circular part of the pin (where the text was)
			// Original circle: cx=16, cy=14, r=10 in 32x40 viewBox
			const scaleX = size / 32;
			const scaleY = (size * 1.25) / 40;
			const iconSize = 16 * scaleX; // Diameter of circle is 20, use 80% = 16
			const x = (16 * scaleX) - (iconSize / 2);
			const y = (14 * scaleY) - (iconSize / 2);
			return { x, y, width: iconSize, height: iconSize };
		} else {
			// Default placement for other shapes
			const iconSize = size * 0.6;
			const x = (size - iconSize) / 2;
			const y = (size - iconSize) / 2;
			return { x, y, width: iconSize, height: iconSize };
		}
	}

	let isValid = $derived(svgContent.trim().length > 0);
	let previewUrl = $derived(
		svgContent ? `data:image/svg+xml;base64,${btoa(svgContent)}` : null
	);
</script>

<div class="flex h-full max-h-[85vh] w-full max-w-7xl flex-col gap-6 rounded-lg border bg-background p-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-2xl font-semibold">Marker Icon Designer</h2>
			<p class="text-sm text-muted-foreground">Paste SVG code and configure display properties</p>
		</div>
		{#if onCancel}
			<Button variant="ghost" size="icon" onclick={onCancel}>
				<X class="h-5 w-5" />
			</Button>
		{/if}
	</div>

	<!-- Main Content -->
	<div class="grid flex-1 grid-cols-2 gap-6 overflow-hidden">
		<!-- Left: SVG Input & Style Controls -->
		<div class="flex flex-col gap-4 overflow-auto">
			<!-- SVG Import Options -->
			<div class="space-y-3">
				<Label>Import SVG</Label>

				<!-- File Upload -->
				<div class="flex gap-2">
					<input
						bind:this={fileInput}
						type="file"
						accept=".svg"
						onchange={handleFileUpload}
						class="hidden"
					/>
					<Button
						type="button"
						variant="outline"
						onclick={() => fileInput.click()}
						class="flex-1"
					>
						<Upload class="mr-2 h-4 w-4" />
						Upload SVG File
					</Button>
					{#if uploadedFilename}
						<div class="flex items-center gap-2 text-xs text-muted-foreground">
							{uploadedFilename}
						</div>
					{/if}
				</div>

				<!-- SVG Code Textarea -->
				<Textarea
					id="svg-input"
					bind:value={svgContent}
					onpaste={handlePaste}
					placeholder="Or paste your SVG code here..."
					class="font-mono text-xs"
					rows={8}
				/>
				<p class="text-xs text-muted-foreground">Upload a file or paste SVG code directly</p>
			</div>

			<!-- Display Mode -->
			<div class="space-y-2">
				<Label for="shape">Display Mode</Label>
				<select
					id="shape"
					bind:value={style.shape}
					class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				>
					<option value="none">Standalone SVG</option>
					<option value="pin">Icon in Pin Marker</option>
				</select>
			</div>

			<!-- Style Controls -->
			<div class="grid grid-cols-2 gap-4">
				<div class="space-y-2">
					<Label for="size">Size (px)</Label>
					<Input id="size" type="number" bind:value={style.size} min={16} max={256} />
				</div>

				{#if style.shape === 'pin'}
					<div class="space-y-2">
						<Label for="color">Pin Color</Label>
						<div class="flex gap-2">
							<Input id="color" type="color" bind:value={style.color} class="h-10 w-20" />
							<Input type="text" bind:value={style.color} class="flex-1 font-mono text-xs" />
						</div>
					</div>

					<div class="space-y-2">
						<Label for="border-width">Border Width (px)</Label>
						<Input
							id="border-width"
							type="number"
							bind:value={style.borderWidth}
							min={0}
							max={10}
						/>
					</div>

					<div class="space-y-2">
						<Label for="border-color">Border Color</Label>
						<div class="flex gap-2">
							<Input
								id="border-color"
								type="color"
								bind:value={style.borderColor}
								class="h-10 w-20"
							/>
							<Input type="text" bind:value={style.borderColor} class="flex-1 font-mono text-xs" />
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Right: Live Preview -->
		<div class="flex flex-col gap-4">
			<Label>Preview</Label>
			<div
				class="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed bg-muted/20 p-8"
			>
				{#if previewUrl}
					{#if style.shape === 'none'}
						<!-- Standalone SVG -->
						<div
							class="flex items-center justify-center"
							style:width="{style.size}px"
							style:height="{style.size}px"
						>
							<img src={previewUrl} alt="Icon preview" style:width="100%" style:height="100%" />
						</div>
					{:else}
						<!-- Icon in Marker Shape -->
						{@const placement = getIconPlacement(style.shape, style.size)}
						<svg
							width={style.size}
							height={style.shape === 'pin' ? style.size * 1.25 : style.size}
							viewBox="0 0 {style.size} {style.shape === 'pin' ? style.size * 1.25 : style.size}"
						>
							{@html getMarkerShapeSVG(style.shape, style.size)}
							<image
								href={previewUrl}
								x={placement.x}
								y={placement.y}
								width={placement.width}
								height={placement.height}
							/>
						</svg>
					{/if}
				{:else}
					<p class="text-sm text-muted-foreground">Upload or paste SVG to see preview</p>
				{/if}
			</div>

			<!-- Preview at different sizes -->
			{#if previewUrl}
				<div class="space-y-2">
					<Label>Preview at Different Sizes</Label>
					<div class="flex items-end gap-4 rounded-lg border bg-muted/10 p-4">
						{#each [24, 32, 48, 64] as previewSize}
							<div class="flex flex-col items-center gap-1">
								{#if style.shape === 'none'}
									<!-- Standalone SVG at different sizes -->
									<div
										class="flex items-center justify-center"
										style:width="{previewSize}px"
										style:height="{previewSize}px"
									>
										<img src={previewUrl} alt="Icon {previewSize}px" style:width="100%" style:height="100%" />
									</div>
								{:else}
									<!-- Icon in Marker at different sizes -->
									{@const smallPlacement = getIconPlacement(style.shape, previewSize)}
									<svg
										width={previewSize}
										height={style.shape === 'pin' ? previewSize * 1.25 : previewSize}
										viewBox="0 0 {previewSize} {style.shape === 'pin' ? previewSize * 1.25 : previewSize}"
									>
										{@html getMarkerShapeSVG(style.shape, previewSize)}
										<image
											href={previewUrl}
											x={smallPlacement.x}
											y={smallPlacement.y}
											width={smallPlacement.width}
											height={smallPlacement.height}
										/>
									</svg>
								{/if}
								<span class="text-xs text-muted-foreground">{previewSize}px</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Footer Actions -->
	<div class="flex justify-end gap-3 border-t pt-4">
		{#if onCancel}
			<Button variant="outline" onclick={onCancel}>Cancel</Button>
		{/if}
		<Button onclick={handleSave} disabled={!isValid}>Save Icon</Button>
	</div>
</div>
