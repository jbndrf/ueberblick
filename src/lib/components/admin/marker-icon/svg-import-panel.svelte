<script lang="ts">
	import { Upload, FileCode, X } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { validateSvg, type SvgValidationResult } from '$lib/utils/svg-validator';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		svgContent: string;
		onimport?: (content: string, metadata: SvgValidationResult['metadata']) => void;
		onclear?: () => void;
	}

	let { svgContent, onimport, onclear }: Props = $props();

	let collapsed = $state(false);
	let activeTab = $state<'upload' | 'paste'>('upload');
	let pasteContent = $state('');
	let validationResult = $state<SvgValidationResult | null>(null);
	let isDragging = $state(false);
	let fileInputRef = $state<HTMLInputElement>();
	let fileName = $state<string | null>(null);

	function handleFileSelect(file: File) {
		if (!file.type.includes('svg')) {
			validationResult = { valid: false, error: 'Please select an SVG file' };
			return;
		}

		const reader = new FileReader();
		reader.onload = (e) => {
			const content = e.target?.result as string;
			const result = validateSvg(content, file.size);
			validationResult = result;

			if (result.valid && result.metadata) {
				fileName = file.name;
				collapsed = true;
				onimport?.(content, result.metadata);
			}
		};
		reader.readAsText(file);
	}

	function handleFileInput(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) {
			handleFileSelect(file);
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		isDragging = true;
	}

	function handleDragLeave() {
		isDragging = false;
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		isDragging = false;

		const file = event.dataTransfer?.files[0];
		if (file) {
			handleFileSelect(file);
		}
	}

	function handlePaste() {
		const result = validateSvg(pasteContent);
		validationResult = result;

		if (result.valid && result.metadata) {
			fileName = 'pasted-svg.svg';
			collapsed = true;
			onimport?.(pasteContent, result.metadata);
		}
	}

	function handleClear() {
		fileName = null;
		pasteContent = '';
		validationResult = null;
		collapsed = false;
		if (fileInputRef) {
			fileInputRef.value = '';
		}
		onclear?.();
	}

	function toggleCollapse() {
		collapsed = !collapsed;
	}
</script>

<div class="space-y-3 rounded-lg border bg-card p-4">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<span class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
				1
			</span>
			<h3 class="font-semibold">Import SVG</h3>
		</div>
		{#if svgContent}
			<Button variant="ghost" size="sm" onclick={toggleCollapse}>
				{collapsed ? '+' : '-'}
			</Button>
		{/if}
	</div>

	{#if collapsed && svgContent}
		<!-- Collapsed state showing current file -->
		<div class="flex items-center justify-between rounded-md border bg-muted/50 p-3">
			<div class="flex items-center gap-2">
				<FileCode class="h-4 w-4 text-muted-foreground" />
				<span class="text-sm font-medium">{fileName}</span>
				{#if validationResult?.metadata}
					<span class="text-xs text-muted-foreground">
						({(validationResult.metadata.size / 1024).toFixed(1)}KB)
					</span>
				{/if}
			</div>
			<Button variant="ghost" size="sm" onclick={handleClear}>
				<X class="h-4 w-4" />
			</Button>
		</div>
	{:else}
		<!-- Expanded state with import options -->
		<div class="space-y-4">
			<!-- Tab switcher -->
			<div class="flex gap-2">
				<Button
					variant={activeTab === 'upload' ? 'default' : 'outline'}
					size="sm"
					onclick={() => (activeTab = 'upload')}
				>
					<Upload class="mr-2 h-4 w-4" />
					Upload File
				</Button>
				<Button
					variant={activeTab === 'paste' ? 'default' : 'outline'}
					size="sm"
					onclick={() => (activeTab = 'paste')}
				>
					<FileCode class="mr-2 h-4 w-4" />
					Paste Code
				</Button>
			</div>

			{#if activeTab === 'upload'}
				<!-- Upload zone -->
				<div
					role="button"
					tabindex="0"
					class="cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-all {isDragging
						? 'border-primary bg-primary/5'
						: 'border-border hover:border-primary/50 hover:bg-muted/50'}"
					ondragover={handleDragOver}
					ondragleave={handleDragLeave}
					ondrop={handleDrop}
					onclick={() => fileInputRef?.click()}
					onkeydown={(e) => e.key === 'Enter' && fileInputRef?.click()}
				>
					<Upload class="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
					<p class="mb-2 text-sm font-medium">Drop SVG file here or click to browse</p>
					<p class="text-xs text-muted-foreground">Accepts .svg files up to 50KB</p>
					<input
						bind:this={fileInputRef}
						type="file"
						accept=".svg,image/svg+xml"
						class="hidden"
						onchange={handleFileInput}
					/>
				</div>
			{:else}
				<!-- Paste zone -->
				<div class="space-y-3">
					<Textarea
						bind:value={pasteContent}
						placeholder="Paste your SVG code here..."
						rows={8}
						class="font-mono text-xs"
					/>
					<Button onclick={handlePaste} class="w-full">Validate & Import</Button>
				</div>
			{/if}

			<!-- Validation feedback -->
			{#if validationResult}
				{#if validationResult.valid && validationResult.metadata}
					<div class="rounded-md border border-green-500/50 bg-green-500/10 p-3 text-sm">
						<p class="font-medium text-green-700 dark:text-green-400">Valid SVG</p>
						<div class="mt-2 space-y-1 text-xs text-green-600 dark:text-green-300">
							<p>Size: {validationResult.metadata.width}x{validationResult.metadata.height}px</p>
							<p>File size: {(validationResult.metadata.size / 1024).toFixed(1)}KB</p>
							{#if validationResult.metadata.hasColors}
								<p class="text-yellow-600 dark:text-yellow-400">
									Note: Existing colors will be replaced by your style settings
								</p>
							{/if}
							{#if validationResult.metadata.hasAnimations}
								<p class="text-yellow-600 dark:text-yellow-400">
									Warning: Animations will be removed in static markers
								</p>
							{/if}
						</div>
					</div>
				{:else if validationResult.error}
					<div class="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm">
						<p class="font-medium text-red-700 dark:text-red-400">Error</p>
						<p class="mt-1 text-xs text-red-600 dark:text-red-300">{validationResult.error}</p>
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</div>
