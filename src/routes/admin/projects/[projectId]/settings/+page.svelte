<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';
	import {
		Image,
		Rocket,
		Layers,
		Map,
		MessageSquare,
		FileText,
		Package,
		Filter,
		CircleDot,
		AlertTriangle
	} from '@lucide/svelte';
	import SettingsSidebar, { type SidebarGroup, type SidebarStatus } from './SettingsSidebar.svelte';
	import BrandingSection from './sections/BrandingSection.svelte';
	import StartupSection from './sections/StartupSection.svelte';
	import LayersSection from './sections/LayersSection.svelte';
	import MapDefaultsSection from './sections/MapDefaultsSection.svelte';
	import ChatSection from './sections/ChatSection.svelte';
	import InfoPagesSection from './sections/InfoPagesSection.svelte';
	import OfflinePacksSection from './sections/OfflinePacksSection.svelte';
	import FieldFiltersSection from './sections/FieldFiltersSection.svelte';
	import ClusterSection from './sections/ClusterSection.svelte';
	import DangerZoneSection from './sections/DangerZoneSection.svelte';

	let { data } = $props();

	const DEFAULT_SECTION = 'branding';
	const VALID_SECTIONS = new Set([
		'branding',
		'startup',
		'layers',
		'map-defaults',
		'chat',
		'info-pages',
		'offline-packs',
		'field-filters',
		'cluster',
		'danger-zone'
	]);

	const currentSection = $derived.by(() => {
		const requested = page.url.searchParams.get('section') ?? DEFAULT_SECTION;
		return VALID_SECTIONS.has(requested) ? requested : DEFAULT_SECTION;
	});

	function selectSection(id: string) {
		const url = new URL(page.url);
		if (id === DEFAULT_SECTION) {
			url.searchParams.delete('section');
		} else {
			url.searchParams.set('section', id);
		}
		void goto(url, { keepFocus: true, noScroll: true, replaceState: false });
	}

	// Status helpers
	const enabledFeatures = $derived<string[]>(
		Array.isArray(data.startupDefaults?.enabled_features)
			? data.startupDefaults!.enabled_features
			: []
	);

	const chatStatus = $derived<SidebarStatus>(
		(data.project as { chat_enabled?: boolean })?.chat_enabled ? 'on' : 'off'
	);
	const infoPagesStatus = $derived<SidebarStatus>((data.infoPages?.length ?? 0) > 0 ? 'on' : 'off');
	const offlinePacksStatus = $derived<SidebarStatus>(
		(data.offlinePackages?.length ?? 0) > 0 ? 'on' : 'off'
	);
	const fieldFiltersStatus = $derived<SidebarStatus>(
		enabledFeatures.includes('filter.field_filters') ? 'on' : 'off'
	);
	const clusterStatus = $derived<SidebarStatus>(
		enabledFeatures.includes('tools.cluster') ? 'on' : 'off'
	);

	const groups = $derived<SidebarGroup[]>([
		{
			caption: m.settingsGroupGeneral?.() ?? 'Allgemein',
			items: [
				{
					id: 'branding',
					label: m.settingsNavBranding?.() ?? 'Branding',
					icon: Image
				},
				{
					id: 'startup',
					label: m.settingsNavStartup?.() ?? 'Erststart',
					icon: Rocket
				}
			]
		},
		{
			caption: m.settingsGroupMap?.() ?? 'Karte',
			items: [
				{
					id: 'layers',
					label: m.settingsNavLayers?.() ?? 'Kartenebenen',
					icon: Layers
				},
				{
					id: 'map-defaults',
					label: m.settingsNavMapDefaults?.() ?? 'Standardansicht',
					icon: Map
				}
			]
		},
		{
			caption: m.settingsGroupFeatures?.() ?? 'Funktionen',
			items: [
				{
					id: 'chat',
					label: m.settingsNavChat?.() ?? 'Chat',
					icon: MessageSquare,
					status: chatStatus
				},
				{
					id: 'info-pages',
					label: m.settingsNavInfoPages?.() ?? 'Info-Seiten',
					icon: FileText,
					status: infoPagesStatus
				},
				{
					id: 'offline-packs',
					label: m.settingsNavOfflinePacks?.() ?? 'Offline-Pakete',
					icon: Package,
					status: offlinePacksStatus
				},
				{
					id: 'field-filters',
					label: m.settingsNavFieldFilters?.() ?? 'Filter & Felder',
					icon: Filter,
					status: fieldFiltersStatus
				},
				{
					id: 'cluster',
					label: m.settingsNavCluster?.() ?? 'Cluster',
					icon: CircleDot,
					status: clusterStatus
				}
			]
		},
		{
			caption: m.settingsGroupDanger?.() ?? 'Gefahrenzone',
			items: [
				{
					id: 'danger-zone',
					label: m.settingsNavDangerZone?.() ?? 'Projekt löschen',
					icon: AlertTriangle,
					tone: 'destructive'
				}
			]
		}
	]);
</script>

<div class="flex w-full min-w-0 flex-col gap-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">
			{m.navProjectSettings?.() ?? 'Project Settings'}
		</h1>
	</div>

	<div class="flex flex-col gap-8 md:flex-row md:items-start md:gap-10">
		<aside class="md:sticky md:top-6 md:shrink-0 md:self-start">
			<SettingsSidebar {groups} current={currentSection} onSelect={selectSection} />
		</aside>

		<div class="min-w-0 flex-1">
			{#if currentSection === 'branding'}
				<BrandingSection {data} />
			{:else if currentSection === 'startup'}
				<StartupSection {data} />
			{:else if currentSection === 'layers'}
				<LayersSection {data} />
			{:else if currentSection === 'map-defaults'}
				<MapDefaultsSection {data} />
			{:else if currentSection === 'chat'}
				<ChatSection {data} />
			{:else if currentSection === 'info-pages'}
				<InfoPagesSection {data} />
			{:else if currentSection === 'offline-packs'}
				<OfflinePacksSection {data} />
			{:else if currentSection === 'field-filters'}
				<FieldFiltersSection {data} />
			{:else if currentSection === 'cluster'}
				<ClusterSection {data} />
			{:else if currentSection === 'danger-zone'}
				<DangerZoneSection {data} />
			{/if}
		</div>
	</div>
</div>
