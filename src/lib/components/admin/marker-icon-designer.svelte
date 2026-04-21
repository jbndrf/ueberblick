<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from 'svelte-sonner';
	import { X, Upload, FileCode, Shapes } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages';
	import {
		ICON_TEMPLATES,
		BADGE_TEMPLATES,
		compositeIconSvg,
		type SvgIconTemplate,
		type BadgeTemplate
	} from '$lib/utils/svg-icon-templates';
	import { validateSvg } from '$lib/utils/svg-validator';

	interface IconStyle {
		size: number;
		color: string;
		borderWidth: number;
		borderColor: string;
		backgroundColor: string;
		shadow: boolean;
		shape: string;
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

	// ── State ────────────────────────────────────────────────────────

	let sourceTab = $state<'templates' | 'custom'>('templates');
	let selectedTemplate = $state<SvgIconTemplate | null>(null);
	let iconColor = $state(initialConfig?.style?.color || '#2563eb');
	let iconSize = $state(initialConfig?.style?.size || 32);
	let selectedBadge = $state<BadgeTemplate | null>(null);

	// Custom SVG state
	let customSvgContent = $state('');
	let customFilename = $state('');

	// Init from existing config
	if (initialConfig?.svgContent) {
		sourceTab = 'custom';
		customSvgContent = initialConfig.svgContent;
	}

	// ── Derived ──────────────────────────────────────────────────────

	let hasIcon = $derived(
		sourceTab === 'templates' ? selectedTemplate !== null : customSvgContent.trim().length > 0
	);

	let previewSvg = $derived.by(() => {
		if (!hasIcon) return '';

		if (sourceTab === 'templates' && selectedTemplate) {
			return compositeIconSvg({
				mainSvg: selectedTemplate.path,
				isFullSvg: false,
				mainColor: iconColor,
				bgShape: 'none',
				bgColor: 'transparent',
				size: iconSize,
				badge: selectedBadge ?? undefined
			});
		}

		if (sourceTab === 'custom' && customSvgContent.trim()) {
			return compositeIconSvg({
				mainSvg: customSvgContent.trim(),
				isFullSvg: true,
				mainColor: iconColor,
				bgShape: 'none',
				bgColor: 'transparent',
				size: iconSize,
				badge: selectedBadge ?? undefined
			});
		}

		return '';
	});

	// ── Handlers ─────────────────────────────────────────────────────

	function selectTemplate(template: SvgIconTemplate) {
		selectedTemplate = template;
	}

	function toggleBadge(badge: BadgeTemplate) {
		if (selectedBadge?.id === badge.id) {
			selectedBadge = null;
		} else {
			selectedBadge = badge;
		}
	}

	let fileInput = $state<HTMLInputElement>();

	async function handleFileUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		if (!file.name.endsWith('.svg')) {
			toast.error(m.adminMarkerIconDesignerUploadSvgOnly());
			return;
		}

		const text = await file.text();
		const result = validateSvg(text, file.size);
		if (result.valid) {
			customSvgContent = text.trim();
			customFilename = file.name;
			toast.success(m.adminMarkerIconDesignerUploadSuccess());
		} else {
			toast.error(result.error || m.adminMarkerIconDesignerInvalidSvg());
		}
	}

	function handlePaste(event: ClipboardEvent) {
		const text = event.clipboardData?.getData('text');
		if (text && text.trim().startsWith('<svg')) {
			customSvgContent = text.trim();
			customFilename = '';
		}
	}

	async function handleSave() {
		if (!hasIcon || !previewSvg) {
			toast.error(m.adminMarkerIconDesignerNoIconSelected());
			return;
		}

		const config: IconConfig = {
			type: 'svg',
			svgContent: previewSvg,
			style: {
				size: iconSize,
				color: iconColor,
				borderWidth: 0,
				borderColor: 'transparent',
				backgroundColor: 'transparent',
				shadow: false,
				shape: 'none'
			},
			metadata: {
				source:
					sourceTab === 'templates'
						? `template:${selectedTemplate?.id}`
						: customFilename
							? 'file-upload'
							: 'code-input',
				fileSize: previewSvg.length,
				filename:
					sourceTab === 'templates'
						? `${selectedTemplate?.id}.svg`
						: customFilename || 'custom.svg',
				uploadDate: new Date().toISOString()
			}
		};

		if (onSave) {
			try {
				await onSave(config);
				toast.success(m.adminMarkerIconDesignerSaveSuccess());
			} catch {
				toast.error(m.adminMarkerIconDesignerSaveError());
			}
		}
	}
</script>

<div class="flex h-full max-h-[85vh] w-full max-w-4xl flex-col gap-4 rounded-lg border bg-background p-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-xl font-semibold">{m.adminMarkerIconDesignerTitle()}</h2>
			<p class="text-sm text-muted-foreground">{m.adminMarkerIconDesignerSubtitle()}</p>
		</div>
		{#if onCancel}
			<Button variant="ghost" size="icon" onclick={onCancel}>
				<X class="h-5 w-5" />
			</Button>
		{/if}
	</div>

	<!-- Main content -->
	<div class="grid flex-1 grid-cols-[1fr_auto] gap-6 overflow-hidden">
		<!-- Left: Controls -->
		<div class="flex flex-col gap-4 overflow-y-auto pr-2">
			<!-- Source tabs -->
			<div class="flex gap-2">
				<Button
					variant={sourceTab === 'templates' ? 'default' : 'outline'}
					size="sm"
					onclick={() => (sourceTab = 'templates')}
				>
					<Shapes class="mr-2 h-4 w-4" />
					{m.adminMarkerIconDesignerTabTemplates()}
				</Button>
				<Button
					variant={sourceTab === 'custom' ? 'default' : 'outline'}
					size="sm"
					onclick={() => (sourceTab = 'custom')}
				>
					<FileCode class="mr-2 h-4 w-4" />
					{m.adminMarkerIconDesignerTabCustomSvg()}
				</Button>
			</div>

			<!-- Templates grid -->
			{#if sourceTab === 'templates'}
				<div class="space-y-2">
					<Label>{m.adminMarkerIconDesignerChooseIcon()}</Label>
					<div class="grid grid-cols-5 gap-2">
						{#each ICON_TEMPLATES as template}
							<button
								type="button"
								onclick={() => selectTemplate(template)}
								class="flex flex-col items-center gap-1 rounded-lg border-2 p-2.5 transition-all hover:scale-105
									{selectedTemplate?.id === template.id
									? 'border-primary bg-primary/10'
									: 'border-border hover:border-primary/50'}"
								title={template.label}
							>
								<div class="h-7 w-7 text-foreground">
									<svg viewBox="0 0 24 24" width="28" height="28">
										{@html template.path}
									</svg>
								</div>
								<span class="text-[10px] text-muted-foreground">{template.label}</span>
							</button>
						{/each}
					</div>
				</div>
			{:else}
				<!-- Custom SVG -->
				<div class="space-y-3">
					<div class="flex gap-2">
						<input
							bind:this={fileInput}
							type="file"
							accept=".svg"
							onchange={handleFileUpload}
							class="hidden"
						/>
						<Button variant="outline" size="sm" onclick={() => fileInput?.click()}>
							<Upload class="mr-2 h-4 w-4" />
							{m.adminMarkerIconDesignerUploadButton()}
						</Button>
						{#if customFilename}
							<span class="flex items-center text-xs text-muted-foreground">
								{customFilename}
							</span>
						{/if}
					</div>
					<Textarea
						bind:value={customSvgContent}
						onpaste={handlePaste}
						placeholder={m.adminMarkerIconDesignerPastePlaceholder()}
						class="font-mono text-xs"
						rows={6}
					/>
				</div>
			{/if}

			<!-- Icon Color -->
			<div class="space-y-2">
				<Label>{m.adminMarkerIconDesignerIconColor()}</Label>
				<div class="flex items-center gap-2">
					<input
						type="color"
						value={iconColor}
						oninput={(e) => (iconColor = (e.target as HTMLInputElement).value)}
						class="h-9 w-12 cursor-pointer rounded border border-border"
					/>
					<Input
						type="text"
						bind:value={iconColor}
						class="h-9 w-28 font-mono text-xs"
					/>
				</div>
			</div>

			<!-- Size -->
			<div class="space-y-2">
				<Label>{m.adminMarkerIconDesignerSize()}</Label>
				<Input
					type="number"
					bind:value={iconSize}
					min={8}
					max={128}
					class="h-9 w-24"
				/>
			</div>

			<!-- Badge -->
			<div class="space-y-2">
				<Label>{m.adminMarkerIconDesignerBadgeLabel()}</Label>
				<div class="flex flex-wrap gap-1.5">
					<button
						type="button"
						onclick={() => (selectedBadge = null)}
						class="flex h-9 items-center gap-1.5 rounded-md border-2 px-2.5 text-xs font-medium transition-all
							{selectedBadge === null
							? 'border-primary bg-primary text-primary-foreground'
							: 'border-border hover:border-primary/50'}"
					>
						{m.adminMarkerIconDesignerBadgeNone()}
					</button>
					{#each BADGE_TEMPLATES as badge}
						<button
							type="button"
							onclick={() => toggleBadge(badge)}
							class="flex h-9 items-center gap-1.5 rounded-md border-2 px-2.5 text-xs font-medium transition-all
								{selectedBadge?.id === badge.id
								? 'border-primary bg-primary/10'
								: 'border-border hover:border-primary/50'}"
							title={badge.label}
						>
							<svg viewBox="0 0 24 24" width="16" height="16" style="color: {badge.color}">
								{@html badge.path}
							</svg>
							{badge.label}
						</button>
					{/each}
				</div>
			</div>
		</div>

		<!-- Right: Preview -->
		<div class="flex w-48 flex-col gap-3">
			<Label>{m.adminMarkerIconDesignerPreview()}</Label>
			<div
				class="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed bg-muted/20 p-4"
			>
				{#if previewSvg}
					{@html previewSvg}
				{:else}
					<p class="text-center text-xs text-muted-foreground">{m.adminMarkerIconDesignerPreviewEmpty()}</p>
				{/if}
			</div>
		</div>
	</div>

	<!-- Footer -->
	<div class="flex justify-end gap-3 border-t pt-3">
		{#if onCancel}
			<Button variant="outline" onclick={onCancel}>{m.adminMarkerIconDesignerCancel()}</Button>
		{/if}
		<Button onclick={handleSave} disabled={!hasIcon}>{m.adminMarkerIconDesignerSave()}</Button>
	</div>
</div>
