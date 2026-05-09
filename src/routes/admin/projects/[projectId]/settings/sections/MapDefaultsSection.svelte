<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { projectMapDefaultsSchema } from '$lib/schemas/map-settings';
	import * as m from '$lib/paraglide/messages';
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import type { MapLayerConfig } from '$lib/types/map-layer';
	import SettingsSection from '../SettingsSection.svelte';

	let { data } = $props();

	let isSavingDefaults = $state(false);

	const { form: defaultsForm, enhance: defaultsEnhance } = superForm(data.defaultsForm, {
		validators: zod4Client(projectMapDefaultsSchema),
		dataType: 'json',
		onSubmit: () => {
			isSavingDefaults = true;
		},
		onResult: ({ result }) => {
			isSavingDefaults = false;
			if (result.type === 'success') {
				toast.success(m.mapSettingsDefaultsSaved?.() ?? 'Map defaults saved');
				invalidateAll();
			} else if (result.type === 'failure') {
				toast.error(
					(result.data as { message?: string } | undefined)?.message ??
						m.mapSettingsDefaultsSaveError?.() ??
						'Failed to save map defaults'
				);
			}
		}
	});

	const effectiveDefaults = $derived(() => {
		if (data.baseLayer?.config) {
			const config = data.baseLayer.config as MapLayerConfig;
			if (config.default_zoom !== undefined && config.default_center) {
				return {
					zoom: config.default_zoom,
					center: config.default_center,
					source: 'base-layer' as const
				};
			}
		}
		return { ...data.mapDefaults, source: 'project' as const };
	});
</script>

<SettingsSection
	name={m.mapSettingsDefaultViewTitle?.() ?? 'Map Default View'}
	description={m.mapSettingsDefaultViewDescription?.() ??
		'Fallback settings when no base layer is configured'}
>
	<div class="rounded-md border bg-muted/30 px-4 py-3 text-sm">
		<div class="font-medium">
			{m.mapSettingsDefaultViewLabel?.() ?? 'Default view'}
		</div>
		<div class="mt-0.5 text-muted-foreground">
			{m.mapSettingsZoomLabel?.() ?? 'Zoom'}
			{effectiveDefaults().zoom}, {m.mapSettingsCenterLabel?.() ?? 'Center'}
			{effectiveDefaults().center.lat.toFixed(4)}, {effectiveDefaults().center.lng.toFixed(4)}
		</div>
		{#if effectiveDefaults().source === 'base-layer'}
			<div class="mt-1 text-xs text-muted-foreground">
				{m.mapSettingsDefaultsSourceBaseLayer?.() ??
					'Using base layer defaults. Edit values below to override when no base layer is set.'}
			</div>
		{/if}
	</div>

	<form method="POST" action="?/saveDefaults" use:defaultsEnhance class="space-y-4">
		<div class="space-y-2">
			<Label for="default_zoom">{m.mapSettingsDefaultZoom?.() ?? 'Default Zoom'}</Label>
			<Input
				id="default_zoom"
				name="zoom"
				type="number"
				min="0"
				max="22"
				bind:value={$defaultsForm.zoom}
			/>
		</div>

		<div class="grid grid-cols-2 gap-4">
			<div class="space-y-2">
				<Label for="min_zoom">{m.mapSettingsMinZoom?.() ?? 'Min Zoom'}</Label>
				<Input
					id="min_zoom"
					name="min_zoom"
					type="number"
					min="0"
					max="22"
					bind:value={$defaultsForm.min_zoom}
				/>
			</div>
			<div class="space-y-2">
				<Label for="max_zoom">{m.mapSettingsMaxZoom?.() ?? 'Max Zoom'}</Label>
				<Input
					id="max_zoom"
					name="max_zoom"
					type="number"
					min="0"
					max="22"
					bind:value={$defaultsForm.max_zoom}
				/>
			</div>
		</div>

		<div class="grid grid-cols-2 gap-4">
			<div class="space-y-2">
				<Label for="center_lat">{m.mapSettingsCenterLat?.() ?? 'Center Latitude'}</Label>
				<Input
					id="center_lat"
					name="center.lat"
					type="number"
					step="0.0001"
					min="-90"
					max="90"
					bind:value={$defaultsForm.center.lat}
				/>
			</div>
			<div class="space-y-2">
				<Label for="center_lng">{m.mapSettingsCenterLng?.() ?? 'Center Longitude'}</Label>
				<Input
					id="center_lng"
					name="center.lng"
					type="number"
					step="0.0001"
					min="-180"
					max="180"
					bind:value={$defaultsForm.center.lng}
				/>
			</div>
		</div>

		<div>
			<Button type="submit" disabled={isSavingDefaults}>
				{isSavingDefaults
					? (m.mapSettingsSaving?.() ?? 'Saving...')
					: (m.mapSettingsSaveDefaults?.() ?? 'Save Defaults')}
			</Button>
		</div>
	</form>
</SettingsSection>
