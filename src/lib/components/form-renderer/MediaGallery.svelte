<script lang="ts">
	import { FileText, Camera, ImagePlus, X, ChevronLeft, ChevronRight } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as m from '$lib/paraglide/messages';
	import * as Carousel from '$lib/components/ui/carousel';
	import type { CarouselAPI } from '$lib/components/ui/carousel/context';
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
	let cameraInput: HTMLInputElement | undefined = $state();
	let lightboxOpen = $state(false);
	let lightboxIndex = $state(0);
	let carouselApi: CarouselAPI | undefined = $state();
	let carouselContainer: HTMLDivElement | undefined = $state();
	let swipeStartX = 0;
	let swipeStartY = 0;
	let swipeStartIndex = 0;

	// ==========================================================================
	// Derived
	// ==========================================================================

	const canAdd = $derived(mode !== 'view' && files.length < maxFiles);
	const imageFiles = $derived(files.filter((f) => f.isImage));
	const currentLightboxFile = $derived(imageFiles[lightboxIndex]);
	const acceptTypes = $derived(
		allowedTypes?.join(',') || 'image/png,image/jpeg,image/webp,image/gif'
	);

	const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
	const acceptsImages = $derived.by(() => {
		if (!allowedTypes || allowedTypes.length === 0) return true;
		return allowedTypes.some(
			(t) => IMAGE_EXTENSIONS.includes(t.toLowerCase()) || t.startsWith('image/')
		);
	});

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

	function handleFileClick() {
		fileInput?.click();
	}

	function handleCameraClick() {
		cameraInput?.click();
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

	// ==========================================================================
	// Re-init carousel when it becomes visible (e.g. hidden tab panel)
	// ResizeObserver is used instead of IntersectionObserver because the latter
	// fails on mobile inside CSS-transformed fixed containers (module-shell).
	// ==========================================================================

	$effect(() => {
		const api = carouselApi;
		const el = carouselContainer;
		if (!api || !el) return;

		let didReInit = false;
		const ro = new ResizeObserver((entries) => {
			if (didReInit) return;
			if (entries[0].contentRect.width > 0) {
				didReInit = true;
				api.reInit();
				ro.disconnect();
			}
		});
		ro.observe(el);

		return () => ro.disconnect();
	});

	// ==========================================================================
	// Mousewheel scrolling (desktop)
	// ==========================================================================

	$effect(() => {
		const api = carouselApi;
		const el = carouselContainer;
		if (!api || !el) return;

		let wheelTimer: ReturnType<typeof setTimeout> | null = null;

		function onWheel(e: WheelEvent) {
			if (!api) return;
			const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
			if (delta === 0) return;

			const forward = delta > 0;
			if (forward ? !api.canScrollNext() : !api.canScrollPrev()) return;

			e.preventDefault();
			if (wheelTimer) return;

			forward ? api.scrollNext() : api.scrollPrev();
			wheelTimer = setTimeout(() => {
				wheelTimer = null;
			}, 300);
		}

		el.addEventListener('wheel', onWheel, { passive: false });
		return () => {
			el.removeEventListener('wheel', onWheel);
			if (wheelTimer) clearTimeout(wheelTimer);
		};
	});

	// ==========================================================================
	// Custom swipe detection (bypasses Embla's drag which fails on Chrome mobile
	// because Chrome's compositor makes touchmove non-cancelable inside scroll containers)
	// ==========================================================================

	function handleSwipeStart(e: TouchEvent) {
		swipeStartX = e.touches[0].clientX;
		swipeStartY = e.touches[0].clientY;
		swipeStartIndex = carouselApi?.selectedScrollSnap() ?? 0;
	}

	function handleSwipeEnd(e: TouchEvent) {
		if (!carouselApi) return;
		// If Embla already handled this gesture (Firefox, desktop), do nothing
		if (carouselApi.selectedScrollSnap() !== swipeStartIndex) return;
		const deltaX = e.changedTouches[0].clientX - swipeStartX;
		const deltaY = e.changedTouches[0].clientY - swipeStartY;
		if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 30) {
			if (deltaX > 0) carouselApi.scrollPrev();
			else carouselApi.scrollNext();
		}
	}

</script>

<svelte:window onkeydown={lightboxOpen ? handleLightboxKeydown : undefined} />

{#if files.length > 0 || canAdd}
	<div class="space-y-2">
		<!-- Carousel Gallery -->
		{#if files.length > 0}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				bind:this={carouselContainer}
				class="touch-pan-y"
				ontouchstart={handleSwipeStart}
				ontouchend={handleSwipeEnd}
			>
			<Carousel.Root
				class="w-full"
				opts={{
					align: 'start',
					containScroll: 'trimSnaps',
					dragFree: false
				}}
				setApi={(api) => (carouselApi = api)}
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
			</div>
		{/if}

		<!-- Add Buttons (fill/edit mode only) -->
		{#if canAdd}
			<div class="flex gap-2 mt-2 w-1/2">
				{#if acceptsImages}
					<Button variant="outline" size="sm" class="flex-1" onclick={handleCameraClick}>
						<Camera class="w-4 h-4 mr-1" />
						{m.mediaGalleryCamera()}
					</Button>
				{/if}
				<Button variant="outline" size="sm" class="flex-1" onclick={handleFileClick}>
					<ImagePlus class="w-4 h-4 mr-1" />
					{m.mediaGalleryFiles()}
				</Button>
			</div>
		{/if}

		<!-- Hidden Camera Input (capture forces camera on mobile) -->
		{#if acceptsImages}
			<input
				bind:this={cameraInput}
				type="file"
				accept="image/*"
				capture="environment"
				class="hidden"
				onchange={handleFileSelect}
			/>
		{/if}

		<!-- Hidden File/Gallery Input -->
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
