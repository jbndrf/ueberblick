<script lang="ts">
	import type { PageData } from './$types';
	import * as Tabs from '$lib/components/ui/tabs';
	import LeafletMap from '$lib/components/map/leaflet-map.svelte';
	import InstanceGeometryLayer from '$lib/components/map/instance-geometry-layer.svelte';
	import {
		buildActivitySections,
		getEntryLabel,
		type ActivitySection,
		type ToolUsageRecord
	} from '$lib/utils/activity-sections';
	import { renderSnapshotValue } from '$lib/utils/value-formatter';
	import { ChevronLeft } from '@lucide/svelte';
	import { POCKETBASE_URL } from '$lib/config/pocketbase';
	import type { Map as LeafletMapType } from 'leaflet';
	import {
		adminInstanceDetailBack,
		adminInstanceDetailTabData,
		adminInstanceDetailTabActivity,
		adminInstanceDetailTabProtocols,
		adminInstanceDetailHeaderStage,
		adminInstanceDetailHeaderStatus,
		adminInstanceDetailHeaderCreatedBy,
		adminInstanceDetailHeaderCreated,
		adminInstanceDetailHeaderUpdated,
		adminInstanceDetailLocation,
		adminInstanceDetailNoLocation,
		adminInstanceDetailDataEmpty,
		adminInstanceDetailActivityEmpty,
		adminInstanceDetailProtocolsEmpty,
		adminInstanceDetailProtocolAutologSummary,
		adminInstanceDetailProtocolManual,
		adminInstanceDetailProtocolAuto,
		adminInstanceDetailProtocolFallback,
		adminInstanceDetailProtocolAuditLog,
		adminInstanceDetailDataTabGeneral,
		adminInstanceDetailEntryAction,
		adminInstanceDetailEntryCreated,
		adminInstanceDetailEntryDataRecorded,
		adminInstanceDetailEntryFieldFallback,
		adminInstanceDetailEntryUpdatedSuffix,
		adminInstanceDetailEntryAdminUpdated,
		adminInstanceDetailEntryFieldsNoun,
		adminInstanceDetailEntryFieldsUpdated,
		adminInstanceDetailEntryLocationUpdated,
		adminInstanceDetailEntryInspectionRecorded,
		adminInstanceDetailEntryConflictResolved
	} from '$lib/paraglide/messages';

	let { data }: { data: PageData } = $props();

	const generalLabel = adminInstanceDetailDataTabGeneral();

	function formatTimestamp(iso: string): string {
		if (!iso) return '';
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
	}

	function getStageName(stageId: string): string | undefined {
		return data.stageNameById[stageId];
	}

	// ── Header ────────────────────────────────────────────────────────────────
	const currentStageName = $derived(
		getStageName((data.instance as any).current_stage_id) ?? (data.instance as any).current_stage_id
	);
	const createdByName = $derived(
		data.participantNameMap[(data.instance as any).created_by] ??
			(data.instance as any).created_by ??
			'—'
	);

	// ── Location ──────────────────────────────────────────────────────────────
	const centroid = $derived((data.instance as any).centroid as { lat: number; lon: number } | null);
	const geometry = $derived((data.instance as any).geometry as { type?: string } | null);

	async function handleMapReady(map: LeafletMapType) {
		if (geometry?.type === 'Point' && centroid) {
			const L = await import('leaflet');
			L.marker([centroid.lat, centroid.lon]).addTo(map);
		}
	}
	let leafletMap = $state<LeafletMapType | null>(null);

	// ── Data tab: group field defs by display_config tab ──────────────────────
	interface FieldDefLite {
		id: string;
		label: string;
		field_type: string;
		display_config: unknown;
	}
	const dataGroups = $derived.by(() => {
		const groups = new Map<string, FieldDefLite[]>();
		for (const fd of data.fieldDefs as unknown as FieldDefLite[]) {
			let dc: any = fd.display_config;
			if (typeof dc === 'string') {
				try {
					dc = JSON.parse(dc);
				} catch {
					dc = null;
				}
			}
			const tab = (dc?.tab as string) || generalLabel;
			if (!groups.has(tab)) groups.set(tab, []);
			groups.get(tab)!.push(fd);
		}
		return [...groups.entries()].map(([tab, fields]) => ({ tab, fields }));
	});

	const hasData = $derived(
		Object.keys((data.row as any)?.fieldData ?? {}).length > 0 ||
			Object.keys((data.row as any)?.fileData ?? {}).length > 0
	);

	function fileUrl(recordId: string, fileName: string): string {
		return `${POCKETBASE_URL}/api/files/workflow_field_values/${recordId}/${encodeURIComponent(fileName)}`;
	}

	/** Render a field value as a display string, resolving entity IDs to labels. */
	function displayFieldValue(fd: FieldDefLite): string {
		const raw = (data.row as any)?.fieldData?.[fd.id];
		if (raw === undefined || raw === null || raw === '') return '—';
		const entities = data.resolvedEntities[fd.id];
		if (entities && entities.length > 0) {
			const labelById = new Map(entities.map((e) => [e.id, e.label]));
			const ids = Array.isArray(raw) ? raw : [raw];
			return ids.map((id) => labelById.get(String(id)) ?? String(id)).join(', ');
		}
		return renderSnapshotValue(raw);
	}

	function fieldFiles(fd: FieldDefLite): Array<{ recordId: string; fileName: string }> {
		return (data.row as any)?.fileData?.[fd.id] ?? [];
	}

	// ── Activity tab ──────────────────────────────────────────────────────────
	const activitySections = $derived<ActivitySection[]>(
		buildActivitySections(
			data.toolUsage as unknown as ToolUsageRecord[],
			(data.instance as any).current_stage_id ?? '',
			getStageName
		)
	);

	function entryLabel(metadata: ToolUsageRecord['metadata']): string {
		return getEntryLabel(metadata, {
			resolveFieldLabel: (key) =>
				(data.fieldDefs as unknown as FieldDefLite[]).find((f) => f.id === key)?.label,
			t: {
				action: adminInstanceDetailEntryAction(),
				created: adminInstanceDetailEntryCreated(),
				dataRecorded: adminInstanceDetailEntryDataRecorded(),
				fieldFallback: adminInstanceDetailEntryFieldFallback(),
				updatedSuffix: adminInstanceDetailEntryUpdatedSuffix(),
				adminUpdated: adminInstanceDetailEntryAdminUpdated(),
				fieldsNoun: adminInstanceDetailEntryFieldsNoun(),
				fieldsUpdated: adminInstanceDetailEntryFieldsUpdated(),
				locationUpdated: adminInstanceDetailEntryLocationUpdated(),
				inspectionRecorded: adminInstanceDetailEntryInspectionRecorded(),
				conflictResolved: adminInstanceDetailEntryConflictResolved()
			}
		});
	}

	function executorName(entry: ToolUsageRecord): string {
		return (
			entry.expand?.executed_by?.name ||
			data.participantNameMap[entry.executed_by] ||
			entry.expand?.executed_by?.email ||
			'—'
		);
	}

	// ── Protocols tab ─────────────────────────────────────────────────────────
	let expandedProtocol = $state<string | null>(null);
	function toggleProtocol(id: string) {
		expandedProtocol = expandedProtocol === id ? null : id;
	}

	const backHref = $derived(`/admin/projects/${data.projectId}/workflows/${data.workflowId}`);
</script>

<div class="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
	<!-- Header -->
	<div class="space-y-3">
		<a
			href={backHref}
			class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
		>
			<ChevronLeft class="h-4 w-4" />
			{adminInstanceDetailBack()}
		</a>
		<h1 class="text-xl font-semibold">{(data.workflow as any).name}</h1>
		<dl class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
			<div>
				<dt class="text-muted-foreground">{adminInstanceDetailHeaderStage()}</dt>
				<dd class="font-medium">{currentStageName}</dd>
			</div>
			<div>
				<dt class="text-muted-foreground">{adminInstanceDetailHeaderStatus()}</dt>
				<dd class="font-medium">{(data.instance as any).status}</dd>
			</div>
			<div>
				<dt class="text-muted-foreground">{adminInstanceDetailHeaderCreatedBy()}</dt>
				<dd class="font-medium">{createdByName}</dd>
			</div>
			<div>
				<dt class="text-muted-foreground">{adminInstanceDetailHeaderCreated()}</dt>
				<dd class="font-medium">{formatTimestamp((data.instance as any).created)}</dd>
			</div>
			<div>
				<dt class="text-muted-foreground">{adminInstanceDetailHeaderUpdated()}</dt>
				<dd class="font-medium">{formatTimestamp((data.instance as any).updated)}</dd>
			</div>
		</dl>
	</div>

	<!-- Location -->
	<div class="space-y-2">
		<h2 class="text-sm font-semibold text-muted-foreground">{adminInstanceDetailLocation()}</h2>
		{#if centroid}
			<div class="h-64 overflow-hidden rounded-lg border border-border">
				<LeafletMap
					center={[centroid.lat, centroid.lon]}
					zoom={16}
					class="h-full w-full"
					onMapReady={(m) => {
						leafletMap = m;
						handleMapReady(m);
					}}
				/>
			</div>
			{#if leafletMap && geometry && geometry.type !== 'Point'}
				<InstanceGeometryLayer
					map={leafletMap}
					instances={[data.instance as Record<string, unknown>]}
					workflows={[data.workflow as Record<string, unknown>]}
					selectedInstanceId={(data.instance as any).id}
					interactive={false}
				/>
			{/if}
			<p class="text-xs text-muted-foreground">
				{centroid.lat.toFixed(5)}, {centroid.lon.toFixed(5)}
			</p>
		{:else}
			<p class="text-sm text-muted-foreground">{adminInstanceDetailNoLocation()}</p>
		{/if}
	</div>

	<!-- Tabs -->
	<Tabs.Root value="data">
		<Tabs.List>
			<Tabs.Trigger value="data">{adminInstanceDetailTabData()}</Tabs.Trigger>
			<Tabs.Trigger value="activity">{adminInstanceDetailTabActivity()}</Tabs.Trigger>
			<Tabs.Trigger value="protocols">{adminInstanceDetailTabProtocols()}</Tabs.Trigger>
		</Tabs.List>

		<!-- Data -->
		<Tabs.Content value="data" class="pt-4">
			{#if !hasData}
				<p class="py-8 text-center text-sm text-muted-foreground">
					{adminInstanceDetailDataEmpty()}
				</p>
			{:else}
				<div class="space-y-6">
					{#each dataGroups as group (group.tab)}
						<section class="space-y-2">
							<h3 class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
								{group.tab}
							</h3>
							<dl class="divide-y divide-border rounded-lg border border-border">
								{#each group.fields as fd (fd.id)}
									{@const files = fieldFiles(fd)}
									<div class="flex justify-between gap-4 p-3 text-sm">
										<dt class="text-muted-foreground">{fd.label}</dt>
										<dd class="text-right font-medium break-all">
											{#if files.length > 0}
												<ul class="space-y-1">
													{#each files as f (f.recordId)}
														<li>
															<a
																href={fileUrl(f.recordId, f.fileName)}
																target="_blank"
																rel="noopener noreferrer"
																class="text-primary underline">{f.fileName}</a
															>
														</li>
													{/each}
												</ul>
											{:else}
												{displayFieldValue(fd)}
											{/if}
										</dd>
									</div>
								{/each}
							</dl>
						</section>
					{/each}
				</div>
			{/if}
		</Tabs.Content>

		<!-- Activity -->
		<Tabs.Content value="activity" class="pt-4">
			{#if activitySections.length === 0}
				<p class="py-8 text-center text-sm text-muted-foreground">
					{adminInstanceDetailActivityEmpty()}
				</p>
			{:else}
				<div class="space-y-5">
					{#each activitySections as section (section.stageId + section.visitIndex)}
						<section class="space-y-2">
							<h3 class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
								{section.stageName}{section.visitTotal > 1
									? ` (${section.visitIndex}/${section.visitTotal})`
									: ''}
							</h3>
							<ul class="divide-y divide-border rounded-lg border border-border">
								{#each section.entries as entry (entry.id)}
									<li class="flex items-center justify-between gap-4 p-3 text-sm">
										<div class="flex flex-col">
											<span class="font-medium">{entryLabel(entry.metadata)}</span>
											<span class="text-xs text-muted-foreground">{executorName(entry)}</span>
										</div>
										<span class="text-xs text-muted-foreground"
											>{formatTimestamp(entry.executed_at)}</span
										>
									</li>
								{/each}
							</ul>
						</section>
					{/each}
				</div>
			{/if}
		</Tabs.Content>

		<!-- Protocols -->
		<Tabs.Content value="protocols" class="pt-4">
			{#if data.protocols.length === 0}
				<p class="py-8 text-center text-sm text-muted-foreground">
					{adminInstanceDetailProtocolsEmpty()}
				</p>
			{:else}
				<div class="space-y-2">
					{#each data.protocols as entry (entry.id)}
						{@const expanded = expandedProtocol === entry.id}
						<div class="rounded-lg border border-border bg-background">
							<button
								type="button"
								class="flex w-full items-center justify-between p-3 text-left hover:bg-muted/40"
								onclick={() => toggleProtocol(entry.id)}
							>
								<div class="flex flex-col">
									<span class="text-sm font-medium">
										{entry.tool_name ??
											(entry.kind === 'global_autolog'
												? adminInstanceDetailProtocolAuditLog()
												: adminInstanceDetailProtocolFallback())}
									</span>
									<span class="text-xs text-muted-foreground"
										>{formatTimestamp(entry.recorded_at)}</span
									>
								</div>
								<span class="text-xs text-muted-foreground">
									{entry.kind === 'global_autolog'
										? adminInstanceDetailProtocolAuto()
										: adminInstanceDetailProtocolManual()}
								</span>
							</button>

							{#if expanded}
								<div class="space-y-3 border-t border-border p-3">
									{#if entry.kind === 'global_autolog' && entry.autolog}
										<p class="text-xs text-muted-foreground">
											{adminInstanceDetailProtocolAutologSummary({
												count: entry.autolog.entries.length,
												from: formatTimestamp(entry.autolog.from),
												to: formatTimestamp(entry.autolog.to)
											})}
										</p>
									{/if}

									{#if entry.case_fields.length > 0}
										<dl class="space-y-1 text-xs">
											{#each entry.case_fields as cf (cf.field_def_id)}
												<div class="flex justify-between gap-3">
													<dt class="text-muted-foreground">{cf.label}</dt>
													<dd class="text-right font-medium break-all">
														{renderSnapshotValue(cf.value)}
													</dd>
												</div>
											{/each}
										</dl>
									{/if}

									{#if entry.local_fields.length > 0}
										<dl class="space-y-1 border-t border-border pt-2 text-xs">
											{#each entry.local_fields as lf (lf.key)}
												<div class="flex justify-between gap-3">
													<dt class="text-muted-foreground italic">{lf.label}</dt>
													<dd class="text-right font-medium break-all">
														{renderSnapshotValue(lf.value)}
													</dd>
												</div>
											{/each}
										</dl>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</Tabs.Content>
	</Tabs.Root>
</div>
