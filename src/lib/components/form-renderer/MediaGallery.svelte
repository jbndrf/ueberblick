<script lang="ts">
	import { FileText, Plus, X, ChevronLeft, ChevronRight } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Carousel from '$lib/components/ui/carousel';
	import type { MediaFile, FormMode } from './types';

	// ==========================================================================
	// Props
	// ==========================================================================

	interface Props {
		mode: FormMode;
		files: MediaFile[];
		onAdd?: (files: File[]) => void;
		onRemove?: (index: number) => void;
		allowedTypes?: string[];
		maxFiles?: number;
		columnPosition?: 'full' | 'half' | 'third' | 'quarter';
	}

	let {
		mode,
		files,
		onAdd,
		onRemove,
		allowedTypes,
		maxFiles = 10,
		columnPosition = 'full'
	}: Props = $props();

	// ==========================================================================
	// State
	// ==========================================================================

	let fileInput: HTMLInputElement | undefined = $state();
	let lightboxOpen = $state(false);
	let lightboxIndex = $state(0);

	// ==========================================================================
	// Derived
	// ==========================================================================

	const canAdd = $derived(mode !== 'view' && files.length < maxFiles);
	const imageFiles = $derived(files.filter((f) => f.isImage));
	const currentLightboxFile = $derived(imageFiles[lightboxIndex]);
	const acceptTypes = $derived(allowedTypes?.join(',') || 'image/*,.pdf,.doc,.docx,.txt');

	// Calculate carousel item basis based on columnPosition (same for all modes)
	const itemBasisClass = $derived.by(() => {
		switch (columnPosition) {
			case 'full':
				return 'basis-1/3'; // 3 visible items
			case 'half':
				return 'basis-2/3'; // ~1.5 visible items
			case 'third':
			case 'quarter':
			default:
				return 'basis-full'; // 1 visible item
		}
	});

	// Number of visible items for showing/hiding navigation arrows
	const visibleItemCount = $derived.by(() => {
		switch (columnPosition) {
			case 'full':
				return 3;
			case 'half':
				return 1; // 1.5 rounds down
			default:
				return 1;
		}
	});

	// ==========================================================================
	// Handlers
	// ==========================================================================

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			const newFiles = Array.from(input.files);
			onAdd?.(newFiles);
			input.value = '';
		}
	}

	function handleAddClick() {
		fileInput?.click();
	}

	function handleRemove(index: number) {
		onRemove?.(index);
	}

	function openLightbox(file: MediaFile) {
		const idx = imageFiles.findIndex((f) => f.url === file.url);
		if (idx >= 0) {
			lightboxIndex = idx;
			lightboxOpen = true;
		}
	}

	function lightboxPrev() {
		if (lightboxIndex > 0) {
			lightboxIndex--;
		}
	}

	function lightboxNext() {
		if (lightboxIndex < imageFiles.length - 1) {
			lightboxIndex++;
		}
	}

	function handleLightboxKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowLeft') lightboxPrev();
		if (e.key === 'ArrowRight') lightboxNext();
		if (e.key === 'Escape') lightboxOpen = false;
	}
</script>

<svelte:window onkeydown={lightboxOpen ? handleLightboxKeydown : undefined} />

{#if files.length > 0 || canAdd}
	<div class="space-y-2">
		<!-- Carousel Gallery -->
		{#if files.length > 0}
			<Carousel.Root
				class="w-full"
				opts={{
					align: 'start',
					containScroll: 'trimSnaps',
					dragFree: false
				}}
			>
				<Carousel.Content class="-ml-2">
					{#each files as file, index}
						<Carousel.Item class="{itemBasisClass} pl-2">
							<div class="relative group aspect-[2/3]">
								{#if file.isImage}
									<!-- Image Thumbnail -->
									<button
										type="button"
										class="block w-full h-full rounded-md overflow-hidden border border-border hover:border-primary transition-colors cursor-pointer"
										onclick={() => openLightbox(file)}
									>
										<img src={file.url} alt={file.name} class="w-full h-full object-cover" />
									</button>
								{:else}
									<!-- File Icon -->
									<div
										class="w-full h-full rounded-md border border-border bg-muted flex flex-col items-center justify-center p-2"
									>
										<FileText class="w-8 h-8 text-muted-foreground mb-2" />
										<span class="text-xs text-muted-foreground truncate w-full text-center">
											{file.name}
										</span>
									</div>
								{/if}

								<!-- Remove Button (fill/edit mode only) -->
								{#if mode !== 'view'}
									<button
										type="button"
										class="absolute top-1 right-1 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 md:group-hover:opacity-100 transition-opacity touch:opacity-100"
										style="opacity: 1;"
										onclick={() => handleRemove(index)}
									>
										<X class="w-3.5 h-3.5" />
									</button>
								{/if}
							</div>
						</Carousel.Item>
					{/each}
				</Carousel.Content>

				<!-- Navigation arrows (only show if more items than visible) -->
				{#if files.length > visibleItemCount}
					<Carousel.Previous class="left-0 -translate-x-1/2" />
					<Carousel.Next class="right-0 translate-x-1/2" />
				{/if}
			</Carousel.Root>
		{/if}

		<!-- Add Button (fill/edit mode only) -->
		{#if canAdd}
			<Button variant="outline" size="sm" class="mt-2" onclick={handleAddClick}>
				<Plus class="w-4 h-4 mr-1" />
				Add
			</Button>
		{/if}

		<!-- Hidden File Input -->
		<input
			bind:this={fileInput}
			type="file"
			accept={acceptTypes}
			multiple={maxFiles > 1}
			class="hidden"
			onchange={handleFileSelect}
		/>
	</div>
{/if}

<!-- Lightbox Dialog -->
<Dialog.Root bind:open={lightboxOpen}>
	<Dialog.Content class="max-w-4xl p-0 bg-black/95 border-none">
		{#if currentLightboxFile}
			<div class="relative flex items-center justify-center min-h-[50vh]">
				<!-- Image -->
				<img
					src={currentLightboxFile.url}
					alt={currentLightboxFile.name}
					class="max-w-full max-h-[80vh] object-contain"
				/>

				<!-- Navigation -->
				{#if imageFiles.length > 1}
					<!-- Previous -->
					<Button
						variant="ghost"
						size="icon"
						class="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white"
						disabled={lightboxIndex === 0}
						onclick={lightboxPrev}
					>
						<ChevronLeft class="w-6 h-6" />
					</Button>

					<!-- Next -->
					<Button
						variant="ghost"
						size="icon"
						class="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white"
						disabled={lightboxIndex === imageFiles.length - 1}
						onclick={lightboxNext}
					>
						<ChevronRight class="w-6 h-6" />
					</Button>

					<!-- Counter -->
					<div
						class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 px-3 py-1 rounded-full text-white text-sm"
					>
						{lightboxIndex + 1} / {imageFiles.length}
					</div>
				{/if}

				<!-- Close -->
				<Button
					variant="ghost"
					size="icon"
					class="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white"
					onclick={() => (lightboxOpen = false)}
				>
					<X class="w-5 h-5" />
				</Button>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
