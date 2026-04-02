<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import * as Tabs from '$lib/components/ui/tabs';
	import MapSettingsTab from './MapSettingsTab.svelte';
	import GeneralSettingsTab from './GeneralSettingsTab.svelte';

	let { data } = $props();

	let currentTab = $state('map');
</script>

<div class="flex flex-col gap-6 min-w-0 w-full">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">{m.navProjectSettings()}</h1>
	</div>

	<Tabs.Root bind:value={currentTab}>
		<Tabs.List>
			<Tabs.Trigger value="map">{m.settingsTabMap()}</Tabs.Trigger>
			<Tabs.Trigger value="general">{m.settingsTabGeneral()}</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="map">
			<MapSettingsTab {data} />
		</Tabs.Content>

		<Tabs.Content value="general">
			<GeneralSettingsTab {data} />
		</Tabs.Content>
	</Tabs.Root>
</div>
