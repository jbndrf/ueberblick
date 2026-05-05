<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages';
	import { Switch } from '$lib/components/ui/switch';
	import type { ProjectStartupDefaults } from '$lib/schemas/map-settings';
	import { FEATURE_REGISTRY } from '$lib/participant-state/enabled-features.svelte';
	import SettingsSection from '../SettingsSection.svelte';

	const FEATURE_KEY = 'tools.cluster';

	let { data } = $props();

	const featureDef = $derived(FEATURE_REGISTRY.find((f) => f.key === FEATURE_KEY));
	const available = $derived(featureDef?.available ?? false);

	let enabled = $state<boolean>(
		Array.isArray(data.startupDefaults?.enabled_features)
			? data.startupDefaults!.enabled_features.includes(FEATURE_KEY)
			: false
	);
	let saving = $state(false);

	async function persist(next: boolean) {
		saving = true;
		const current = data.startupDefaults ?? {
			overlay_layer_ids: [],
			workflow_ids_visible: 'all',
			enabled_features: [],
			visible_tag_values: {}
		};
		const features = new Set<string>(current.enabled_features ?? []);
		if (next) features.add(FEATURE_KEY);
		else features.delete(FEATURE_KEY);

		const payload: ProjectStartupDefaults = {
			base_layer_id: current.base_layer_id,
			overlay_layer_ids: [...(current.overlay_layer_ids ?? [])],
			workflow_ids_visible: current.workflow_ids_visible ?? 'all',
			enabled_features: [...features],
			visible_tag_values: { ...(current.visible_tag_values ?? {}) }
		};

		try {
			const fd = new FormData();
			fd.append('payload', JSON.stringify(payload));
			const res = await fetch('?/saveStartupDefaults', { method: 'POST', body: fd });
			if (!res.ok) throw new Error(await res.text());
			toast.success(m.settingsAdvancedStartupSaved?.() ?? 'Saved');
			await invalidateAll();
		} catch (e) {
			console.error(e);
			toast.error(m.settingsAdvancedSaveFailed?.() ?? 'Save failed');
			enabled = !next;
		} finally {
			saving = false;
		}
	}

	function onToggle(next: boolean) {
		enabled = next;
		void persist(next);
	}
</script>

<SettingsSection
	name={m.settingsFeatureClusterTitle?.() ?? 'Marker clustering'}
	description={m.settingsFeatureClusterDescription?.() ??
		'Combine nearby markers on the participant map into clusters at lower zoom levels. Off by default; participants can opt in from their preferences.'}
>
	<div class="flex items-center justify-between gap-4 rounded-md border p-4">
		<div class="flex flex-col">
			<span class="font-medium">
				{m.settingsFeatureClusterEnableLabel?.() ?? 'Enabled at startup'}
			</span>
			<span class="text-xs text-muted-foreground">
				{m.settingsFeatureClusterEnableHint?.() ??
					'Adds the cluster tool to the map by default for new participants.'}
			</span>
		</div>
		<div class="flex items-center gap-2">
			{#if !available}
				<span
					class="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
					title={m.settingsFeatureUnavailable?.() ?? 'Coming soon'}
				>
					{m.settingsFeatureUnavailableBadge?.() ?? 'Soon'}
				</span>
			{/if}
			<Switch checked={enabled} disabled={!available || saving} onCheckedChange={onToggle} />
		</div>
	</div>
</SettingsSection>
