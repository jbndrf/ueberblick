<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import * as m from '$lib/paraglide/messages';
	import { getParticipantGateway, resetAllParticipantState } from '$lib/participant-state/context.svelte';
	import {
		getDownloadProgress,
		getDownloadCompleteSignal
	} from '$lib/participant-state';
	import { resetPocketBase } from '$lib/pocketbase';
	import { disconnectRealtime } from '$lib/participant-state';
	import { FieldValueCache } from '$lib/participant-state/field-value-cache.svelte';
	import { appLoadingMessage, downloadProgress as syncDownloadProgress, downloadAllCollections } from '$lib/participant-state/sync.svelte';
	import { Loader2 } from '@lucide/svelte';
	import { MapCanvas, BottomControlBar, LayerSheet, FilterSheet, WorkflowSelector, SettingsSheet, RecentSheet } from './components';
	import type { MapLayer, MapMarker, WorkflowInstance as CanvasWorkflowInstance, WorkflowStageInfo } from './components/MapCanvas.svelte';
	import type { FieldTag } from './components/FilterSheet.svelte';
	import GeometryDrawTool from '$lib/components/map/geometry-draw-tool.svelte';
	import InstanceGeometryLayer from '$lib/components/map/instance-geometry-layer.svelte';
	import { deriveBBox, deriveCentroid, pointGeometry } from '$lib/utils/instance-geometry';
	import type {
		FilterClause as FilterClauseType,
		InstanceGeometry,
		ToolConfigRecord,
		ViewDefinition
	} from '$lib/participant-state/types';
	import { buildPredicate } from '$lib/filter-engine/predicate';
	import { isFeatureEnabled } from '$lib/participant-state/enabled-features.svelte';
	import {
		createToolConfig,
		deleteToolConfig,
		listToolConfigs,
		updateToolConfig
	} from '$lib/participant-state/tool-configs';
	import type { BuilderContext } from './components/view-builder/types';

	const SAVED_VIEWS_KEY = 'filter.saved_views';
	const ACTIVE_VIEW_KEY = 'filter.active_view';
	const CLUSTER_CONFIG_KEY = 'tools.cluster';

	interface ClusterConfig {
		uncluster: boolean;
		uncluster_cap: number;
	}
	import type { Feature, LineString, MultiLineString, Polygon, MultiPolygon } from 'geojson';
	import { WorkflowInstanceDetailModule, MarkerDetailModule, createSelection, isMarkerSelection, type Selection, type Marker } from './modules';
	import ClusterDetailModule from './modules/cluster-detail/ClusterDetailModule.svelte';
	import type { EnhancedClusterDetail, WorkflowClusterGroup, WorkflowClusterRow, ClusterLeaf } from '$lib/components/map/supercluster-manager';
	import type { VisualKeyRegistry } from '$lib/components/map/donut-cluster-icon';
	import { FormFillTool } from './modules/workflow-instance-detail/tools';
	import ModuleShell from '$lib/components/module-shell.svelte';
	import type { Map as LeafletMap, CircleMarker, Circle } from 'leaflet';
	import { mapNavCallbacks } from './nav-store.svelte';

	interface Workflow {
		id: string;
		name: string;
		workflow_type: 'incident' | 'survey';
		geometry_type?: 'point' | 'line' | 'polygon';
		description?: string;
		entry_button_label?: string;
		entry_allowed_roles?: string[];
		filter_value_icons?: Record<string, any>;
	}

	interface PendingWorkflow {
		workflow: Workflow;
		/** Present for point workflows — legacy temp-marker flow. */
		coordinates?: { lat: number; lng: number };
		/** Present for line/polygon workflows — drawn via GeometryDrawTool. */
		geometry?: InstanceGeometry;
	}

	interface Props {
		data: {
			participant: {
				id: string;
				role_id?: string;
				[key: string]: unknown;
			};
			collectionNames?: string[];
			fileFields?: Record<string, string[]>;
			infoPages?: Array<{ id: string; title: string; content: string }>;
			legalPages?: Array<{ id: string; slug: string; title: string; content: string }>;
		};
	}

	let { data }: Props = $props();

	/** Parse a field value that might be a JSON array (multiple_choice) into individual values */
	function splitMultiValue(value: string): string[] {
		if (value.startsWith('[')) {
			try { return JSON.parse(value); } catch { /* fall through */ }
		}
		return [value];
	}

	const gateway = getParticipantGateway();

	// Map reference
	let map = $state<LeafletMap | null>(null);
	let locationMarker: CircleMarker | null = null;
	let locationAccuracy: Circle | null = null;

	// UI state
	let layerSheetOpen = $state(false);
	let filterSheetOpen = $state(false);
	let workflowSelectorOpen = $state(false);
	let isSelectingCoordinates = $state(false);
	let settingsSheetOpen = $state(false);
	// Mobile FAB state -- tri-state cycle lives in BottomControlBar, kept here
	// so the map-click handler and FilterSheet survey-tap can collapse / open it.
	let mobileSelectorOpen = $state(false);
	let recentSheetOpen = $state(false);
	let recentWorkflowFilter = $state<string | null>(null);

	// Clear per-workflow filter once the sheet is closed so the next open shows
	// all recent items unless the user explicitly enters again via FilterSheet.
	$effect(() => {
		if (!recentSheetOpen && recentWorkflowFilter !== null) {
			recentWorkflowFilter = null;
		}
	});

	// Set up navigation callbacks for header (desktop) navigation
	onMount(() => {
		// Wait for instances to finish streaming before starting field value fetch.
		// This ensures map markers (which need lat/lon from instances) load first,
		// without field values competing for bandwidth.
		let fieldValueInitStarted = false;
		const unwatchFieldValues = $effect.root(() => {
			$effect(() => {
				if (!instancesLive.loading && !instancesLive.fetchProgress && !fieldValueInitStarted) {
					fieldValueInitStarted = true;
					fieldValueCache.init();
					unwatchFieldValues();
				}
			});
		});

		// Proactively download every remaining collection into IDB. Runs AFTER
		// the live queries above have been declared (they registered themselves
		// synchronously), so downloadAllCollections will skip those names and
		// only pull collections that aren't otherwise managed -- tools_edit,
		// tools_protocol, tools_form_fields, tools_forms,
		// workflow_instance_tool_usage, etc. workflow_instance_field_values is
		// handled by FieldValueCache so we pass it as externally-managed.
		// Idempotent: re-logins short-circuit via sync_metadata.
		const names = data.collectionNames ?? [];
		downloadAllCollections(names, ['workflow_instance_field_values']).catch((e) =>
			console.warn('Initial collection download failed (non-fatal):', e)
		);

		mapNavCallbacks.set({
			onLayersClick: () => (layerSheetOpen = true),
			onFiltersClick: () => (filterSheetOpen = true),
			onLocationClick: centerOnLocation,
			onToolsClick: () => (settingsSheetOpen = true),
			onWorkflowClick: () => (workflowSelectorOpen = !workflowSelectorOpen)
		});
	});

	onDestroy(() => {
		mapNavCallbacks.set({});
	});

	// Selection state
	let selection = $state<Selection>(createSelection.none());

	// Cluster detail state (for cluster tap interaction)
	let clusterDetail = $state<EnhancedClusterDetail | null>(null);
	let clusterDetailOpen = $state(false);
	let clusterGroups = $state<WorkflowClusterGroup[]>([]);

	// Drill-down state: zoom into a subset of a cluster's markers
	let drillDownActive = $state(false);
	let drillDownSavedCenter = $state<[number, number]>([0, 0]);
	let drillDownSavedZoom = $state(0);
	let drillDownInstanceIds = $state<Set<string> | null>(null);
	let drillDownActiveRowKey = $state<string | null>(null);
	let drillDownActiveWorkflowId = $state<string | null>(null);

	// Workflow creation state (for new workflows via entry form)
	let pendingWorkflow = $state<PendingWorkflow | null>(null);
	let formFillOpen = $state(false);

	// Active draw session for line/polygon workflows. When non-null, the
	// GeometryDrawTool is mounted over the map; on confirm we hand the drawn
	// geometry to handleWorkflowSelect which opens FormFillTool as usual.
	let drawingSession = $state<{ workflow: Workflow; mode: 'line' | 'polygon' } | null>(null);

	// Shared bottom sheet expanded state (preserves peek/expanded when switching sheets)
	let sheetExpanded = $state(false);

	// Track if location editing is active (from WorkflowInstanceDetailModule)
	let isEditingLocation = $state(false);

	// ==========================================================================
	// Live Queries -- reactive, auto-updating from IndexedDB
	// ==========================================================================

	// Priority: critical = map shell, normal = map content, deferred = filtering/detail data
	// Project scoping: markers, map_layers, and workflows have direct `project_id`
	// relations, so we filter the local-first IDB read to the current project. This
	// is defense-in-depth against stale cross-project records lingering in IDB --
	// the layout already wipes IDB on participant switches, but filtering here
	// guarantees nothing from another project can ever render on the map.
	const projectScopedFilter = `project_id = "${gateway!.projectId}"`;
	const projectLive = gateway!.collection('projects').live({ priority: 'critical' });
	const layersLive = gateway!.collection<MapLayer>('map_layers').live({ filter: `is_active = true && ${projectScopedFilter}`, sort: 'display_order', priority: 'critical' });
	const markersLive = gateway!.collection<MapMarker>('markers').live({ filter: projectScopedFilter, expand: 'category_id', priority: 'normal' });
	const instancesLive = gateway!.collection<CanvasWorkflowInstance>('workflow_instances').live({ expand: 'workflow_id', priority: 'normal' });
	const workflowsLive = gateway!.collection<Workflow>('workflows').live({ filter: `is_active = true && ${projectScopedFilter}`, priority: 'normal' });
	const stagesLive = gateway!.collection<WorkflowStageInfo>('workflow_stages').live({ priority: 'deferred' });
	const fieldTagsLive = gateway!.collection<FieldTag>('tools_field_tags').live({ priority: 'deferred' });
	const fieldValueCache = new FieldValueCache();
	// Proactive full-collection download in +layout.svelte fills workflow_connections
	// on first login; realtime + delta sync handle updates. The live query here
	// is purely to keep an up-to-date reactive mirror in IDB for any consumers.
	const connectionsLive = gateway!.collection('workflow_connections').live({ priority: 'deferred' });
	// tools_forms bridges form_id -> workflow_id; tools_form_fields are the
	// field definitions. Both are already pulled by downloadAllCollections on
	// first login, but we need a reactive mirror here for the RecentSheet's
	// instance-label derivation (which picks a "primary" field per instance).
	const formsLive = gateway!.collection<{ id: string; workflow_id: string }>('tools_forms').live({ priority: 'deferred' });
	const formFieldsLive = gateway!.collection<{ id: string; form_id: string; field_label?: string; field_type?: string; field_order?: number; page?: number; row_index?: number; column_position?: 'left' | 'full' | 'right' }>('tools_form_fields').live({ priority: 'deferred' });
	// Tool usage powers the Recent sheet's last-activity label ("Erstellt",
	// "2 Felder aktualisiert", etc.) so it matches the detail module's Activity tab.
	const toolUsageLive = gateway!.collection<{ id: string; instance_id: string; executed_at: string; created: string; metadata: Record<string, unknown> }>('workflow_instance_tool_usage').live({ priority: 'deferred' });

	// Show progress in layout header while data streams in.
	// Map is interactive the whole time -- this is informational only.
	$effect(() => {
		const instProgress = instancesLive.fetchProgress;
		const dlProgress = syncDownloadProgress.current;
		if (instProgress) {
			if (instProgress.total > 0) {
				appLoadingMessage.value = (m.participantMapLoadingMarkersCount?.({ loaded: instProgress.loaded.toLocaleString(), total: instProgress.total.toLocaleString() }) ?? `Loading markers (${instProgress.loaded.toLocaleString()}/${instProgress.total.toLocaleString()})...`);
			} else {
				appLoadingMessage.value = (m.participantMapLoadingMarkers?.() ?? 'Loading markers...');
			}
		} else if (fieldValueCache.loadedCount > 0 && fieldValueCache.loading) {
			appLoadingMessage.value = (m.participantMapLoadingFieldDataCount?.({ count: fieldValueCache.loadedCount.toLocaleString() }) ?? `Loading field data (${fieldValueCache.loadedCount.toLocaleString()})...`);
		} else if (fieldValueCache.loading) {
			appLoadingMessage.value = (m.participantMapLoadingFieldData?.() ?? 'Loading field data...');
		} else if (dlProgress) {
			const label = dlProgress.currentCollection ?? 'data';
			if (dlProgress.totalRecords > 0) {
				appLoadingMessage.value = (m.participantMapLoadingCollectionCount?.({ label, loaded: dlProgress.loadedRecords.toLocaleString(), total: dlProgress.totalRecords.toLocaleString() }) ?? `Loading ${label} (${dlProgress.loadedRecords.toLocaleString()}/${dlProgress.totalRecords.toLocaleString()})...`);
			} else {
				appLoadingMessage.value = (m.participantMapLoadingCollection?.({ label }) ?? `Loading ${label}...`);
			}
		} else {
			appLoadingMessage.value = null;
		}
	});
	onDestroy(() => { appLoadingMessage.value = null; });

	// Derived data from live queries
	const project = $derived(projectLive.records[0]);
	const mapLayers = $derived(layersLive.records);
	const markers = $derived(markersLive.records);
	const workflowInstances = $derived(instancesLive.records);
	const workflowStages = $derived(stagesLive.records);
	const fieldTags = $derived(fieldTagsLive.records);
	const fieldValues = $derived(fieldValueCache.records);

	// Resolve tools_form_fields to their workflow via tools_forms. Used by the
	// RecentSheet to pick a "primary" field per instance (e.g. the Datum field
	// on an Arbeitszeit entry) so cards are distinguishable.
	const formFieldsByWorkflow = $derived.by(() => {
		const workflowByFormId = new Map<string, string>();
		for (const form of formsLive.records as any[]) {
			if (form?.id && form?.workflow_id) workflowByFormId.set(form.id, form.workflow_id);
		}
		const result = new Map<string, Array<{ id: string; field_label?: string; field_type?: string; field_order?: number; page?: number; row_index?: number; column_position?: 'left' | 'full' | 'right' }>>();
		for (const ff of formFieldsLive.records as any[]) {
			const wfId = workflowByFormId.get(ff.form_id);
			if (!wfId) continue;
			let arr = result.get(wfId);
			if (!arr) {
				arr = [];
				result.set(wfId, arr);
			}
			arr.push({
				id: ff.id,
				field_label: ff.field_label,
				field_type: ff.field_type,
				field_order: ff.field_order,
				page: ff.page,
				row_index: ff.row_index,
				column_position: ff.column_position
			});
		}
		return result;
	});

	// Icon resolution matching MapCanvas.createWorkflowInstanceIcon fallback
	// chain (filter value icon -> stage icon -> workflow icon). Keeps the
	// Recent sheet visually consistent with the map.
	const iconByInstance = $derived.by(() => {
		const workflowById = new Map((workflows as any[]).map((w) => [w.id, w]));
		const stageById = new Map((workflowStages as any[]).map((s) => [s.id, s]));
		const map = new Map<string, any>();
		for (const inst of workflowInstances as any[]) {
			const wf = workflowById.get(inst.workflow_id);
			if (!wf) continue;
			let icon: any = undefined;
			const filterValue = filterableValues.get(inst.id);
			if (filterValue && wf.filter_value_icons?.[filterValue]?.svgContent) {
				icon = wf.filter_value_icons[filterValue];
			}
			if (!icon && inst.current_stage_id) {
				const stage = stageById.get(inst.current_stage_id);
				if (stage?.visual_config?.icon_config?.svgContent) {
					icon = stage.visual_config.icon_config;
				}
			}
			if (!icon && wf.icon_config?.svgContent) {
				icon = wf.icon_config;
			}
			if (icon) map.set(inst.id, icon);
		}
		return map;
	});

	// Most recent tool_usage per instance, so the Recent sheet can display the
	// same activity label as the detail module's Activity tab.
	const latestToolUsageByInstance = $derived.by(() => {
		const map = new Map<string, { metadata: Record<string, unknown>; at: string }>();
		for (const tu of toolUsageLive.records as any[]) {
			if (!tu?.instance_id) continue;
			const at = tu.executed_at || tu.created;
			const existing = map.get(tu.instance_id);
			if (!existing || new Date(at).getTime() > new Date(existing.at).getTime()) {
				map.set(tu.instance_id, { metadata: tu.metadata || {}, at });
			}
		}
		return map;
	});

	// Map settings: base layer config takes priority, then project defaults
	const mapSettings = $derived.by(() => {
		const baseLayer = mapLayers.find((l: any) => l.layer_type === 'base');
		const baseConfig = baseLayer?.config as any;
		const projectDefaults = (project?.settings as any)?.map_defaults;

		const center_lat = baseConfig?.default_center?.lat ?? projectDefaults?.center?.lat;
		const center_lon = baseConfig?.default_center?.lng ?? projectDefaults?.center?.lng;
		const default_zoom = baseConfig?.default_zoom ?? projectDefaults?.zoom;
		const min_zoom = projectDefaults?.min_zoom;
		const max_zoom = projectDefaults?.max_zoom;

		if (center_lat == null && center_lon == null && default_zoom == null && min_zoom == null && max_zoom == null) return undefined;

		return { center_lat, center_lon, default_zoom, min_zoom, max_zoom };
	});

	// Workflows with entry labels derived from connections, filtered by participant role
	const workflows: Workflow[] = $derived.by(() => {
		const entryLabelByWorkflow = new Map<string, string>();
		for (const conn of connectionsLive.records) {
			if (conn.from_stage_id) continue;
			const label = (conn.visual_config as any)?.button_label;
			if (label) entryLabelByWorkflow.set(conn.workflow_id as string, label);
		}
		const participantRoleIds: string[] = Array.isArray(data.participant.role_id)
			? data.participant.role_id
			: data.participant.role_id ? [data.participant.role_id] : [];
		return (workflowsLive.records as any[])
			.filter(wf => {
				const roles = wf.entry_allowed_roles;
				return !roles || roles.length === 0 || participantRoleIds.some(rid => roles.includes(rid));
			})
			.map(wf => ({
				...wf,
				entry_button_label: entryLabelByWorkflow.get(wf.id) || wf.name
			}))
			.sort((a, b) => {
				const ao = typeof a.sort_order === 'number' ? a.sort_order : Number.MAX_SAFE_INTEGER;
				const bo = typeof b.sort_order === 'number' ? b.sort_order : Number.MAX_SAFE_INTEGER;
				if (ao !== bo) return ao - bo;
				return (a.name ?? '').localeCompare(b.name ?? '');
			});
	});

	// Visual key registry for cluster donut colors (shared between MapCanvas and ClusterDetailModule)
	const visualKeyRegistry: VisualKeyRegistry = $derived.by(() => {
		const reg: VisualKeyRegistry = new Map();

		// Marker category colors
		for (const m of markers) {
			const cat = (m as any).expand?.category_id;
			if (cat && !reg.has(`cat:${cat.id}`)) {
				reg.set(`cat:${cat.id}`, {
					color: cat.icon_config?.style?.color || '#3b82f6',
					label: cat.name
				});
			}
		}

		// Workflow-level colors
		for (const inst of workflowInstances) {
			const wf = (inst as any).expand?.workflow_id;
			if (wf && !reg.has(`wf:${wf.id}`)) {
				reg.set(`wf:${wf.id}`, {
					color: wf.marker_color || '#6366f1',
					label: wf.name
				});
			}
		}

		// Stage-level colors (always register so cluster detail gets labels)
		for (const stage of workflowStages) {
			const stageColor = (stage as any).visual_config?.icon_config?.style?.color || '#6366f1';
			reg.set(`stage:${stage.id}`, { color: stageColor, label: (stage as any).stage_name || (stage as any).name || stage.id });
		}

		// Filter value colors
		for (const wf of workflows) {
			const icons = wf.filter_value_icons;
			if (!icons) continue;
			for (const [value, iconConfig] of Object.entries(icons)) {
				const color = (iconConfig as any)?.style?.color;
				if (color) {
					reg.set(`fv:${value}`, { color, label: value });
				}
			}
		}

		return reg;
	});

	// Filter mode per workflow: 'stage' or 'field' based on field tag config
	const filterModeByWorkflow = $derived.by(() => {
		const map = new Map<string, 'stage' | 'field'>();
		for (const ft of fieldTags) {
			const mappings = ((ft as any).tag_mappings || []) as Array<{ tagType: string; config: Record<string, unknown> }>;
			for (const mapping of mappings) {
				if (mapping.tagType !== 'filterable') continue;
				const wfId = (ft as any).workflow_id as string;
				const filterBy = (mapping.config?.filterBy as string) || 'field';
				map.set(wfId, filterBy as 'stage' | 'field');
			}
		}
		return map;
	});

	// Loading: true until map layers are loaded (markers appear progressively)
	const isLoading = $derived(layersLive.loading);

	// Cleanup live queries on destroy
	onDestroy(() => {
		projectLive.destroy();
		layersLive.destroy();
		markersLive.destroy();
		instancesLive.destroy();
		workflowsLive.destroy();
		stagesLive.destroy();
		fieldTagsLive.destroy();
		fieldValueCache.destroy();
		connectionsLive.destroy();
		formsLive.destroy();
		formFieldsLive.destroy();
		toolUsageLive.destroy();
	});

	// Layer state
	let activeBaseLayerId = $state<string | null>(null);
	let activeOverlayIds = $state<string[]>([]);

	// Filter state - which categories/workflows are visible on map
	let visibleCategoryIds = $state<string[]>([]);
	let visibleWorkflowIds = $state<string[]>([]);

	// Tag value visibility: workflowId -> Set of visible tag values (all visible by default)
	let visibleTagValues = $state<Map<string, Set<string>>>(new Map());

	// Uncluster toggle: render individual markers/instances inside the viewport.
	// Default on — most viewports fit under the cap and users expect to see
	// individual points without flipping a switch. Persisted per participant
	// via `participant_tool_configs` (tool_key = "tools.cluster") once loaded.
	let uncluster = $state(true);
	let unclusterCap = $state(500);
	let unclusterStats = $state<{ rendered: number; total: number }>({ rendered: 0, total: 0 });
	let clusterConfigId = $state<string | null>(null);
	let clusterConfigLoaded = $state(false);

	// Advanced filter clauses live here while a view is active. When no view
	// is active, this is empty and the Simple filter (visibleWorkflowIds /
	// visibleCategoryIds / visibleTagValues) governs `filteredInstances`.
	// When a view is active these are AND-combined and REPLACE the Simple
	// filter entirely (MapCanvas bypasses the simple toggles).
	let advancedClauses = $state<FilterClauseType[]>([]);

	// Saved views (participant_tool_configs, tool_key = filter.saved_views),
	// loaded lazily once the project id is known.
	let savedViews = $state<ToolConfigRecord<ViewDefinition>[]>([]);
	let savedViewsLoaded = false;
	/** id of the view whose switch is currently on; null = Default (Simple). */
	let activeSavedViewId = $state<string | null>(null);
	/** id of the participant_tool_configs row that persists activeSavedViewId. */
	let activeViewConfigId = $state<string | null>(null);
	let activeViewLoaded = false;
	let activeViewSaving = false;

	// ==========================================================================
	// Initialization Effects (run once when data first arrives)
	// ==========================================================================

	// Initialize default base layer selection
	$effect(() => {
		if (mapLayers.length && !untrack(() => activeBaseLayerId)) {
			const firstBase = mapLayers.find((l: any) => l.layer_type === 'base');
			if (firstBase) activeBaseLayerId = firstBase.id;
		}
	});

	// Keep all categories with markers visible by default
	$effect(() => {
		if (markers.length === 0) return;
		const currentIds = untrack(() => visibleCategoryIds);
		const currentSet = new Set(currentIds);
		const allCategoryIds = [...new Set(markers.map((m: any) => m.category_id).filter(Boolean))];
		const missing = allCategoryIds.filter((id) => !currentSet.has(id));
		if (missing.length > 0) {
			visibleCategoryIds = [...currentIds, ...missing];
		}
	});

	// Keep all workflows with instances visible by default
	$effect(() => {
		if (workflowInstances.length === 0) return;
		const currentIds = untrack(() => visibleWorkflowIds);
		const currentSet = new Set(currentIds);
		const allWorkflowIds = [...new Set(workflowInstances.map((i: any) => i.workflow_id).filter(Boolean))];
		const missing = allWorkflowIds.filter((id) => !currentSet.has(id));
		if (missing.length > 0) {
			visibleWorkflowIds = [...currentIds, ...missing];
		}
	});

	// Pre-built lookup maps for O(1) access in filter derivation (avoids nested loops)
	const instancesByWorkflow = $derived.by(() => {
		const map = new Map<string, Array<any>>();
		for (const inst of workflowInstances) {
			const wfId = (inst as any).workflow_id;
			if (!wfId) continue;
			let arr = map.get(wfId);
			if (!arr) { arr = []; map.set(wfId, arr); }
			arr.push(inst);
		}
		return map;
	});

	const fieldValuesByKey = $derived(fieldValueCache.fieldValuesByKey);

	// Initialize tag value visibility - all values visible by default
	$effect(() => {
		if (fieldTags.length > 0 && untrack(() => visibleTagValues.size) === 0) {
			const newMap = new Map<string, Set<string>>();
			for (const ft of fieldTags) {
				const mappings = (ft as any).tag_mappings || [];
				for (const mapping of mappings) {
					if (mapping.tagType !== 'filterable') continue;
					const wfId = (ft as any).workflow_id;
					const filterBy = (mapping.config?.filterBy as string) || 'field';

					if (filterBy === 'stage') {
						const instances = instancesByWorkflow.get(wfId) || [];
						const vals = new Set<string>();
						for (const inst of instances) {
							if (inst.current_stage_id) vals.add(inst.current_stage_id);
						}
						if (vals.size > 0) newMap.set(wfId, vals);
					} else if (mapping.fieldId) {
						const vals = fieldValuesByKey.get(mapping.fieldId);
						if (vals && vals.size > 0) newMap.set(wfId, new Set(vals));
					}
				}
			}
			visibleTagValues = newMap;
		}
	});

	// Auto-add new filter values AND workflows as visible
	$effect(() => {
		if (fieldTags.length === 0 || workflowInstances.length === 0) return;
		const currentTagValues = untrack(() => visibleTagValues);
		const currentWorkflowIds = untrack(() => visibleWorkflowIds);

		let tagChanged = false;
		const newMap = new Map(currentTagValues);
		const newWorkflowIds = [...currentWorkflowIds];

		for (const ft of fieldTags) {
			const mappings = (ft as any).tag_mappings || [];
			for (const mapping of mappings) {
				if (mapping.tagType !== 'filterable') continue;
				const wfId = (ft as any).workflow_id;
				const filterBy = (mapping.config?.filterBy as string) || 'field';
				const existing = newMap.get(wfId) ?? new Set<string>();

				if (filterBy === 'stage') {
					const instances = instancesByWorkflow.get(wfId) || [];
					for (const inst of instances) {
						if (inst.current_stage_id && !existing.has(inst.current_stage_id)) {
							const updated = new Set(newMap.get(wfId) ?? existing);
							updated.add(inst.current_stage_id);
							newMap.set(wfId, updated);
							tagChanged = true;
						}
					}
				} else if (mapping.fieldId) {
					const allVals = fieldValuesByKey.get(mapping.fieldId);
					if (allVals) {
						for (const v of allVals) {
							if (!existing.has(v)) {
								const updated = new Set(newMap.get(wfId) ?? existing);
								updated.add(v);
								newMap.set(wfId, updated);
								tagChanged = true;
							}
						}
					}
				}

				// Ensure the workflow is in visibleWorkflowIds if it has visible tag values
				const finalSet = newMap.get(wfId);
				if (finalSet && finalSet.size > 0 && !newWorkflowIds.includes(wfId)) {
					newWorkflowIds.push(wfId);
				}
			}
		}

		if (tagChanged) {
			visibleTagValues = newMap;
		}
		if (newWorkflowIds.length !== currentWorkflowIds.length) {
			visibleWorkflowIds = newWorkflowIds;
		}
	});

	// ==========================================================================
	// Download Progress & Event Signals
	// ==========================================================================

	const downloadProgress = $derived(getDownloadProgress());

	// ==========================================================================
	// Derived Filter Data
	// ==========================================================================

	/**
	 * For each workflow with a "filterable" tag mapping, build a map:
	 * instanceId -> filter value (stage ID or field value depending on mode)
	 */
	const filterableValues = $derived.by(() => {
		const map = new Map<string, string>();
		for (const ft of fieldTags) {
			const mappings = ((ft as any).tag_mappings || []) as Array<{ tagType: string; fieldId: string | null; config: Record<string, unknown> }>;
			for (const mapping of mappings) {
				if (mapping.tagType !== 'filterable') continue;
				const filterBy = (mapping.config?.filterBy as string) || 'field';

				if (filterBy === 'stage') {
					for (const inst of workflowInstances) {
						if ((inst as any).workflow_id === (ft as any).workflow_id && (inst as any).current_stage_id) {
							map.set((inst as any).id, (inst as any).current_stage_id);
						}
					}
				} else if (mapping.fieldId) {
					for (const fv of fieldValues) {
						if ((fv as any).field_key === mapping.fieldId && (fv as any).value) {
							map.set((fv as any).instance_id, (fv as any).value);
						}
					}
				}
			}
		}
		return map;
	});

	// ==========================================================================
	// Advanced filter (Views tab) — builder context + predicate application
	// ==========================================================================

	/** Build the lookup table the predicate needs for `field_value` clauses. */
	const fieldValuesByInstance = $derived.by(() => {
		const map = new Map<string, Array<any>>();
		for (const fv of fieldValues) {
			const iid = (fv as any).instance_id;
			if (!iid) continue;
			let arr = map.get(iid);
			if (!arr) {
				arr = [];
				map.set(iid, arr);
			}
			arr.push(fv);
		}
		return map;
	});

	/**
	 * Context passed to the FilterBuilder so each clause can render its picker.
	 *
	 * Field discovery walks `tools_forms` + `tools_form_fields` and intersects
	 * with `workflows` (which is already role-scoped to the participant), so
	 * only fields the participant can see become filterable. The `filterable`
	 * tag system is intentionally not consulted — all non-file fields are
	 * offered, per product decision. Field type drives the value editor the
	 * builder renders (multi-select for select-family, contains for text,
	 * range editors for number/date).
	 */
	const builderCtx = $derived.by<BuilderContext>(() => {
		const wfList = (workflows as any[]).map((w) => ({ id: w.id, name: w.name }));
		const workflowNameById = new Map(wfList.map((w) => [w.id, w.name]));
		const accessibleWorkflowIds = new Set(wfList.map((w) => w.id));

		const stagesByWorkflow = new Map<string, { id: string; workflow_id: string; name: string }[]>();
		for (const s of workflowStages as any[]) {
			let arr = stagesByWorkflow.get(s.workflow_id);
			if (!arr) {
				arr = [];
				stagesByWorkflow.set(s.workflow_id, arr);
			}
			arr.push({ id: s.id, workflow_id: s.workflow_id, name: s.stage_name ?? s.id });
		}

		const workflowByFormId = new Map<string, string>();
		for (const f of formsLive.records as any[]) {
			if (f?.id && f?.workflow_id) workflowByFormId.set(f.id, f.workflow_id);
		}

		const filterableFields: BuilderContext['filterableFields'] = [];
		for (const ff of formFieldsLive.records as any[]) {
			const type = ff.field_type as string | undefined;
			if (!type || type === 'file') continue;

			const workflowId = workflowByFormId.get(ff.form_id);
			if (!workflowId || !accessibleWorkflowIds.has(workflowId)) continue;

			const options: { id: string; label: string }[] = [];
			const opts = ff.field_options as any | null | undefined;
			if (type === 'dropdown' || type === 'multiple_choice') {
				for (const o of (opts?.options ?? []) as Array<{ label: string }>) {
					if (o?.label) options.push({ id: o.label, label: o.label });
				}
			} else if (type === 'smart_dropdown') {
				const seen = new Set<string>();
				for (const m of (opts?.mappings ?? []) as Array<{ options?: Array<{ label: string }> }>) {
					for (const o of m?.options ?? []) {
						if (o?.label && !seen.has(o.label)) {
							seen.add(o.label);
							options.push({ id: o.label, label: o.label });
						}
					}
				}
			}
			// custom_table_selector options are dynamic (rows from another
			// collection); leave `options` empty and let the builder fall
			// back to a contains editor so the field is still filterable.

			filterableFields.push({
				workflow_id: workflowId,
				workflow_name: workflowNameById.get(workflowId) ?? workflowId,
				field_key: ff.id,
				field_label: ff.field_label ?? ff.id,
				field_type: type as BuilderContext['filterableFields'][number]['field_type'],
				options
			});
		}

		filterableFields.sort((a, b) => {
			const byWf = a.workflow_name.localeCompare(b.workflow_name);
			if (byWf !== 0) return byWf;
			return a.field_label.localeCompare(b.field_label);
		});

		const creators = new Map<string, string>();
		for (const inst of workflowInstances as any[]) {
			const id = inst.created_by;
			if (id && !creators.has(id)) creators.set(id, id.slice(0, 8));
		}

		return {
			workflows: wfList,
			stagesByWorkflow,
			filterableFields,
			creators: [...creators].map(([id, label]) => ({ id, label }))
		};
	});

	// Load saved views once the project id is known. Refresh is handled by
	// refreshSavedViews() after any mutation.
	$effect(() => {
		const pid = (project as any)?.id;
		if (!pid || savedViewsLoaded) return;
		savedViewsLoaded = true;
		refreshSavedViews(pid);
	});

	async function refreshSavedViews(projectId: string): Promise<void> {
		try {
			savedViews = await listToolConfigs<ViewDefinition>(SAVED_VIEWS_KEY, projectId);
			// After saved views are in hand, resolve which one (if any) should
			// be active and hydrate the live filter state from it.
			if (!activeViewLoaded) await loadActiveView(projectId);
		} catch (err) {
			console.warn('[saved-views] load failed', err);
		}
	}

	// Load the participant's cluster preference (global, not project-scoped).
	// Missing row = use the in-state defaults (uncluster=true, cap=500).
	$effect(() => {
		if (clusterConfigLoaded) return;
		clusterConfigLoaded = true;
		(async () => {
			try {
				const rows = await listToolConfigs<ClusterConfig>(CLUSTER_CONFIG_KEY, null);
				const row = rows[0];
				if (row) {
					clusterConfigId = row.id;
					if (typeof row.config?.uncluster === 'boolean') uncluster = row.config.uncluster;
					if (typeof row.config?.uncluster_cap === 'number') unclusterCap = row.config.uncluster_cap;
				}
			} catch (err) {
				console.warn('[cluster-config] load failed', err);
			}
		})();
	});

	let clusterConfigSaving = false;
	async function persistClusterConfig(): Promise<void> {
		if (!clusterConfigLoaded || clusterConfigSaving) return;
		clusterConfigSaving = true;
		const config: ClusterConfig = { uncluster, uncluster_cap: unclusterCap };
		try {
			if (clusterConfigId) {
				await updateToolConfig<ClusterConfig>(clusterConfigId, { config });
			} else {
				const created = await createToolConfig<ClusterConfig>(CLUSTER_CONFIG_KEY, {
					name: 'cluster',
					config,
					projectId: null
				});
				clusterConfigId = created.id;
			}
		} catch (err) {
			console.warn('[cluster-config] save failed', err);
		} finally {
			clusterConfigSaving = false;
		}
	}

	function snapshotCurrentView(): ViewDefinition {
		return {
			version: 1,
			workflow_ids: [],
			category_ids: [],
			clauses: [...advancedClauses]
		};
	}

	function applySavedView(view: ToolConfigRecord<ViewDefinition>): void {
		const def = view.config;
		advancedClauses = [...(def?.clauses ?? [])];
		activeSavedViewId = view.id;
		void persistActiveView();
	}

	function clearActiveView(): void {
		advancedClauses = [];
		activeSavedViewId = null;
		void persistActiveView();
	}

	function handleSavedViewToggle(
		view: ToolConfigRecord<ViewDefinition>,
		on: boolean
	): void {
		if (on) applySavedView(view);
		else if (activeSavedViewId === view.id) clearActiveView();
	}

	// Persist the active view pointer so it survives reloads. One row per
	// participant+project under `filter.active_view`; config = { view_id }.
	async function persistActiveView(): Promise<void> {
		if (!activeViewLoaded || activeViewSaving) return;
		const pid = (project as any)?.id;
		if (!pid) return;
		activeViewSaving = true;
		const config = { view_id: activeSavedViewId };
		try {
			if (activeViewConfigId) {
				await updateToolConfig<typeof config>(activeViewConfigId, { config });
			} else {
				const created = await createToolConfig<typeof config>(ACTIVE_VIEW_KEY, {
					name: 'active_view',
					config,
					projectId: pid
				});
				activeViewConfigId = created.id;
			}
		} catch (err) {
			console.warn('[active-view] persist failed', err);
		} finally {
			activeViewSaving = false;
		}
	}

	async function loadActiveView(projectId: string): Promise<void> {
		try {
			const rows = await listToolConfigs<{ view_id: string | null }>(
				ACTIVE_VIEW_KEY,
				projectId
			);
			const row = rows[0];
			if (row) {
				activeViewConfigId = row.id;
				const wantedId = row.config?.view_id ?? null;
				if (wantedId) {
					const match = savedViews.find((v) => v.id === wantedId);
					if (match) {
						advancedClauses = [...(match.config?.clauses ?? [])];
						activeSavedViewId = match.id;
					}
				}
			}
		} catch (err) {
			console.warn('[active-view] load failed', err);
		} finally {
			activeViewLoaded = true;
		}
	}

	async function handleSaveCurrentView(name: string): Promise<void> {
		const pid = (project as any)?.id;
		if (!pid) return;
		try {
			const created = await createToolConfig<ViewDefinition>(SAVED_VIEWS_KEY, {
				name,
				config: snapshotCurrentView(),
				projectId: pid
			});
			savedViews = [...savedViews, created];
			// Newly-saved view becomes the active one -- matches the "create and
			// apply" flow of the new editor.
			activeSavedViewId = created.id;
			void persistActiveView();
		} catch (err) {
			console.warn('[saved-views] save failed', err);
		}
	}

	/** Persist edits made to an already-active view back to its saved row. */
	async function handleUpdateActiveView(): Promise<void> {
		if (!activeSavedViewId) return;
		const view = savedViews.find((v) => v.id === activeSavedViewId);
		if (!view) return;
		try {
			const updated = await updateToolConfig<ViewDefinition>(activeSavedViewId, {
				config: snapshotCurrentView()
			});
			savedViews = savedViews.map((v) => (v.id === activeSavedViewId ? updated : v));
		} catch (err) {
			console.warn('[saved-views] update failed', err);
		}
	}

	async function handleRenameView(id: string, name: string): Promise<void> {
		try {
			const updated = await updateToolConfig<ViewDefinition>(id, { name });
			savedViews = savedViews.map((v) => (v.id === id ? updated : v));
		} catch (err) {
			console.warn('[saved-views] rename failed', err);
		}
	}

	async function handleDeleteView(id: string): Promise<void> {
		try {
			await deleteToolConfig(id);
			savedViews = savedViews.filter((v) => v.id !== id);
		} catch (err) {
			console.warn('[saved-views] delete failed', err);
		}
	}

	/**
	 * True while a saved view is selected and the Views feature is enabled.
	 * Drives the "view masters the app" behavior: MapCanvas bypasses the
	 * Simple-tab toggles so the view's filter set shows without further
	 * narrowing.
	 */
	const isViewMastered = $derived(
		isFeatureEnabled('filter.field_filters') && activeSavedViewId !== null
	);

	/**
	 * Workflow/category visibility passed to MapCanvas. Under a view we
	 * return every known id so the Simple toggles become no-ops; the view's
	 * predicate is the only narrowing left.
	 */
	const effectiveVisibleWorkflowIds = $derived.by(() => {
		if (!isViewMastered) return visibleWorkflowIds;
		const allIds = new Set<string>();
		for (const inst of workflowInstances as any[]) {
			if (inst.workflow_id) allIds.add(inst.workflow_id);
		}
		return [...allIds];
	});
	const effectiveVisibleCategoryIds = $derived.by(() => {
		if (!isViewMastered) return visibleCategoryIds;
		const allIds = new Set<string>();
		for (const mk of markers as any[]) {
			if (mk.category_id) allIds.add(mk.category_id);
		}
		return [...allIds];
	});
	const effectiveVisibleTagValues = $derived(
		isViewMastered ? new Map<string, Set<string>>() : visibleTagValues
	);

	/**
	 * Instances to render. When a view is active, its clauses + free-text
	 * filter the whole set. When no view is active, fall through to the
	 * Simple filter (workflow + tag-value visibility is handled downstream
	 * in MapCanvas, so this just returns all instances).
	 */
	const filteredInstances = $derived.by(() => {
		// When the Views feature is off, ignore any stashed clauses so hidden
		// UI can never silently filter the map.
		if (!isFeatureEnabled('filter.field_filters')) return workflowInstances;
		if (advancedClauses.length === 0) return workflowInstances;
		const predicate = buildPredicate(
			{
				version: 1,
				workflow_ids: [],
				category_ids: [],
				clauses: advancedClauses
			},
			{ now: new Date(), fieldValuesByInstance }
		);
		return (workflowInstances as any[]).filter((inst) => predicate(inst as any));
	});

	// ==========================================================================
	// Cluster Detail Helpers
	// ==========================================================================

	function buildClusterGroups(leaves: ClusterLeaf[]): WorkflowClusterGroup[] {
		// Group leaves by workflowId
		const byWorkflow = new Map<string, ClusterLeaf[]>();
		for (const leaf of leaves) {
			let arr = byWorkflow.get(leaf.workflowId);
			if (!arr) {
				arr = [];
				byWorkflow.set(leaf.workflowId, arr);
			}
			arr.push(leaf);
		}

		const groups: WorkflowClusterGroup[] = [];

		for (const [wfId, wfLeaves] of byWorkflow) {
			const wf = workflows.find((w: any) => w.id === wfId);
			const filterMode = filterModeByWorkflow.get(wfId) || 'stage';

			const countMap = new Map<string, { count: number; ids: string[] }>();
			for (const leaf of wfLeaves) {
				let key: string;
				if (filterMode === 'stage') {
					key = leaf.currentStageId || '_unknown';
				} else {
					key = leaf.filterValue || '_unset';
				}
				let entry = countMap.get(key);
				if (!entry) {
					entry = { count: 0, ids: [] };
					countMap.set(key, entry);
				}
				entry.count++;
				entry.ids.push(leaf.id);
			}

			const rows: WorkflowClusterRow[] = [...countMap.entries()]
				.map(([key, { count, ids }]) => {
					const prefixedKey = filterMode === 'stage' ? `stage:${key}` : `fv:${key}`;
					const info = visualKeyRegistry.get(prefixedKey);
					return {
						key,
						prefixedKey,
						label: info?.label || key,
						color: info?.color || '#9ca3af',
						count,
						percentage: Math.round((count / wfLeaves.length) * 100),
						leafIds: ids
					};
				})
				.sort((a, b) => b.count - a.count);

			groups.push({
				workflowId: wfId,
				workflowName: (wf as any)?.name || wfId,
				filterMode,
				totalCount: wfLeaves.length,
				rows
			});
		}

		return groups.sort((a, b) => b.totalCount - a.totalCount);
	}

	function handleClusterRowTap(workflowId: string, row: WorkflowClusterRow) {
		if (!map || !clusterDetail) return;

		// Tapping the already-active row deactivates drill-down
		if (drillDownActive && drillDownActiveRowKey === row.key && drillDownActiveWorkflowId === workflowId) {
			map.flyTo(drillDownSavedCenter, drillDownSavedZoom);
			drillDownActive = false;
			drillDownInstanceIds = null;
			drillDownActiveRowKey = null;
			drillDownActiveWorkflowId = null;
			return;
		}

		// Save map state only on first drill-down (preserve when switching rows)
		if (!drillDownActive) {
			drillDownSavedCenter = [map.getCenter().lat, map.getCenter().lng];
			drillDownSavedZoom = map.getZoom();
		}

		drillDownActive = true;
		drillDownInstanceIds = new Set(row.leafIds);
		drillDownActiveRowKey = row.key;
		drillDownActiveWorkflowId = workflowId;

		// Zoom to fit matching leaves
		const matchingLeaves = clusterDetail.leaves.filter(l => row.leafIds.includes(l.id));
		if (matchingLeaves.length > 0) {
			import('leaflet').then(L => {
				const bounds = L.latLngBounds(
					matchingLeaves.map(l => L.latLng(l.coordinates[1], l.coordinates[0]))
				);
				map!.flyToBounds(bounds, { padding: [60, 60], maxZoom: 18 });
			});
		}
	}

	function handleClusterDetailClose() {
		if (drillDownActive && map) {
			map.flyTo(drillDownSavedCenter, drillDownSavedZoom);
		}
		drillDownActive = false;
		drillDownInstanceIds = null;
		drillDownActiveRowKey = null;
		drillDownActiveWorkflowId = null;
		clusterDetail = null;
		clusterDetailOpen = false;
		clusterGroups = [];
	}

	// ==========================================================================
	// Marker Selection & Navigation
	// ==========================================================================

	const selectableMarkers = $derived(
		markers.filter((m: any) => visibleCategoryIds.includes(m.category_id) && m.location?.lat && m.location?.lon)
	);

	const currentIndex = $derived.by(() => {
		const sel = selection;
		if (!isMarkerSelection(sel)) return -1;
		return selectableMarkers.findIndex((m: any) => m.id === sel.markerId);
	});

	const canGoNext = $derived(currentIndex >= 0 && currentIndex < selectableMarkers.length - 1);
	const canGoPrevious = $derived(currentIndex > 0);

	// True while the user is in any instance-creation flow (point placement,
	// line draw, polygon draw). Taps on existing geometry must fall through to
	// the creation tool instead of opening a detail sheet.
	const isCreatingInstance = $derived(!!drawingSession || isSelectingCoordinates);

	function handleMarkerClick(marker: any) {
		if (isCreatingInstance) return;
		selection = createSelection.marker(marker.id);
	}

	function handleWorkflowInstanceClick(instance: any) {
		if (isCreatingInstance) return;
		selection = createSelection.workflowInstance(instance.id);
	}

	function handleSelectionClose() {
		selection = createSelection.none();
	}

	function handleNavigateNext() {
		if (!canGoNext) return;
		const nextMarker = selectableMarkers[currentIndex + 1];
		if (nextMarker) {
			selection = createSelection.marker(nextMarker.id);
		}
	}

	function handleNavigatePrevious() {
		if (!canGoPrevious) return;
		const prevMarker = selectableMarkers[currentIndex - 1];
		if (prevMarker) {
			selection = createSelection.marker(prevMarker.id);
		}
	}

	// ==========================================================================
	// UI Handlers
	// ==========================================================================

	function handleOverlayToggle(id: string, active: boolean) {
		if (active) {
			activeOverlayIds = [...activeOverlayIds, id];
		} else {
			activeOverlayIds = activeOverlayIds.filter((x) => x !== id);
		}
	}

	function handleCategoryToggle(categoryId: string, visible: boolean) {
		if (visible) {
			visibleCategoryIds = [...visibleCategoryIds, categoryId];
		} else {
			visibleCategoryIds = visibleCategoryIds.filter((x) => x !== categoryId);
		}
	}

	function handleWorkflowToggle(workflowId: string, visible: boolean) {
		if (visible) {
			visibleWorkflowIds = [...visibleWorkflowIds, workflowId];
		} else {
			visibleWorkflowIds = visibleWorkflowIds.filter((x) => x !== workflowId);
		}
	}

	function handleTagValueToggle(workflowId: string, tagValue: string, visible: boolean) {
		const newMap = new Map(visibleTagValues);
		const current = newMap.get(workflowId) ?? new Set<string>();
		const updated = new Set(current);
		if (visible) {
			updated.add(tagValue);
		} else {
			updated.delete(tagValue);
		}
		newMap.set(workflowId, updated);
		visibleTagValues = newMap;

		if (updated.size > 0 && !visibleWorkflowIds.includes(workflowId)) {
			visibleWorkflowIds = [...visibleWorkflowIds, workflowId];
		} else if (updated.size === 0 && visibleWorkflowIds.includes(workflowId)) {
			visibleWorkflowIds = visibleWorkflowIds.filter((x) => x !== workflowId);
		}
	}

	// ==========================================================================
	// Workflow Creation (new workflow via entry form)
	// ==========================================================================

	function handleWorkflowSelect(
		workflow: Workflow,
		coordinates?: { lat: number; lng: number },
		geometry?: InstanceGeometry
	) {
		console.log('Workflow selected:', workflow, 'Coordinates:', coordinates, 'Geometry:', !!geometry);
		pendingWorkflow = { workflow, coordinates, geometry };
		formFillOpen = true;
	}

	function handleDrawGeometry(workflow: Workflow, mode: 'line' | 'polygon') {
		drawingSession = { workflow, mode };
	}

	function handleDrawConfirm(feature: Feature<LineString | MultiLineString | Polygon | MultiPolygon>) {
		if (!drawingSession) return;
		const workflow = drawingSession.workflow;
		drawingSession = null;
		handleWorkflowSelect(workflow, undefined, feature.geometry as InstanceGeometry);
	}

	function handleDrawCancel() {
		drawingSession = null;
	}

	async function handleFormSubmit(formValues: Record<string, unknown>, connectionId: string) {
		if (!pendingWorkflow) return;
		if (!gateway) return;

		const { workflow, coordinates, geometry: drawnGeometry } = pendingWorkflow;

		// Resolve the instance geometry. Draw tool wins; otherwise fall back to the
		// tapped coordinate (legacy point flow). Survey workflows may have neither.
		const geometry: InstanceGeometry | null = drawnGeometry
			? drawnGeometry
			: coordinates
				? pointGeometry(coordinates.lng, coordinates.lat)
				: null;

		// Compute derived fields client-side for optimistic offline rendering. The
		// pb_hook will recompute server-side on write so canonical values stay in
		// lockstep.
		const centroid = deriveCentroid(geometry);
		const bbox = deriveBBox(geometry);

		const stages = workflowStages.filter((s: any) => s.workflow_id === workflow.id);
		const startStage = stages.find((s: any) => s.stage_type === 'start') || stages[0];

		if (!startStage) {
			console.error('No start stage found for workflow:', workflow.id);
			throw new Error('No start stage found');
		}

		try {
			const instance = await gateway.collection('workflow_instances').create({
				workflow_id: workflow.id,
				current_stage_id: (startStage as any).id,
				status: 'active',
				created_by: data.participant.id,
				geometry,
				centroid,
				bbox,
				files: []
			}) as { id: string };

			console.log('Workflow instance created:', instance.id);

			const fieldEntries = Object.entries(formValues).filter(([_, value]) => value !== null && value !== undefined && value !== '');

			// Fetch form field definitions to resolve human-readable names
			let fieldLabelMap: Record<string, string> = {};
			try {
				const allFields = await gateway.collection('tools_form_fields').getFullList({ filter: `form_id.workflow_id = "${workflow.id}"` });
				for (const f of allFields) {
					fieldLabelMap[(f as any).id] = (f as any).field_label;
				}
			} catch (err) { console.warn('[Map] Failed to load field labels:', err); }

			const createdFields = fieldEntries.map(([fieldId, value]) => ({
				field_key: fieldId,
				field_name: fieldLabelMap[fieldId] || fieldId,
				value: Array.isArray(value) && value[0] instanceof File
					? `[${(value as File[]).length} file(s)]`
					: typeof value === 'object' ? JSON.stringify(value) : String(value)
			}));

			const toolUsage = await gateway.collection('workflow_instance_tool_usage').create({
				instance_id: instance.id,
				stage_id: (startStage as any).id,
				executed_by: gateway.participantId,
				executed_at: new Date().toISOString(),
				metadata: {
					action: 'instance_created',
					stage_name: (startStage as any).stage_name || (startStage as any).id,
					geometry_type: geometry?.type ?? null,
					centroid,
					created_fields: createdFields
				}
			}) as { id: string };

			for (const [fieldId, value] of fieldEntries) {
				if (Array.isArray(value) && value.length > 0 && value[0] instanceof File) {
					for (const file of value as File[]) {
						const formData = new FormData();
						formData.append('instance_id', instance.id);
						formData.append('field_key', fieldId);
						formData.append('stage_id', (startStage as any).id);
						formData.append('value', '');
						formData.append('file_value', file);
						formData.append('created_by_action', toolUsage.id);

						await gateway.collection('workflow_instance_field_values').create(formData);
					}
				} else {
					const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

					await gateway.collection('workflow_instance_field_values').create({
						instance_id: instance.id,
						field_key: fieldId,
						stage_id: (startStage as any).id,
						value: stringValue,
						created_by_action: toolUsage.id
					});
				}
			}

			// Live queries auto-update via notifyDataChange from gateway.create()

			// Ensure the new workflow type is visible
			if (!visibleWorkflowIds.includes(workflow.id)) {
				visibleWorkflowIds = [...visibleWorkflowIds, workflow.id];
			}

			formFillOpen = false;
			pendingWorkflow = null;
			selection = createSelection.workflowInstance(instance.id);
		} catch (error) {
			console.error('Failed to create workflow instance:', error);
			throw error;
		}
	}

	function handleFormClose() {
		formFillOpen = false;
		pendingWorkflow = null;
	}

	// ==========================================================================
	// Map Handlers
	// ==========================================================================

	function handleMapReady(leafletMap: LeafletMap) {
		map = leafletMap;
	}

	function handleMapClick() {
		if (isEditingLocation) return;
		if (selection.type !== 'none') {
			selection = createSelection.none();
		}
		if (clusterDetailOpen) {
			handleClusterDetailClose();
		}
		if (mobileSelectorOpen || recentSheetOpen) {
			mobileSelectorOpen = false;
			recentSheetOpen = false;
		}
	}

	function flyToWithOffset(
		leaflet: LeafletMap,
		target: { lat: number; lng: number },
		zoom: number,
		offsetPx: { right?: number; bottom?: number }
	) {
		// To show `target` in the centre of the visible region (viewport minus
		// the right sheet and the bottom sheet), we shift the map centre SE by
		// half the hidden chrome -- the marker then lands in the top-left
		// quadrant of the viewport.
		const markerPx = leaflet.project([target.lat, target.lng], zoom);
		markerPx.x += (offsetPx.right ?? 0) / 2;
		markerPx.y += (offsetPx.bottom ?? 0) / 2;
		const centerLL = leaflet.unproject(markerPx, zoom);
		leaflet.flyTo(centerLL, zoom, { animate: true, duration: 0.5 });
	}

	function handleRecentInstanceTap(
		instance: { id: string; workflow_id: string; centroid?: { lat: number; lon: number } | null },
		workflow: { id: string; workflow_type: 'incident' | 'survey' }
	) {
		// Keep the RecentSheet open so the user can pick another entry; just
		// collapse the FAB popover if it was still on screen.
		mobileSelectorOpen = false;
		if (workflow.workflow_type === 'incident' && instance.centroid && map) {
			const zoom = Math.max(map.getZoom(), 17);
			const isDesktop = window.innerWidth >= 768;
			const rightPx = recentSheetOpen ? (isDesktop ? 256 : 224) : 0;
			// On mobile the detail sheet peeks from the bottom (35vh); on desktop
			// it's a right-edge overlay that doesn't eat vertical map space.
			const bottomPx = isDesktop ? 0 : Math.round(window.innerHeight * 0.35);
			flyToWithOffset(
				map,
				{ lat: instance.centroid.lat, lng: instance.centroid.lon },
				zoom,
				{ right: rightPx, bottom: bottomPx }
			);
		}
		selection = createSelection.workflowInstance(instance.id);
		sheetExpanded = false;
	}


	function centerOnLocation() {
		if ('geolocation' in navigator && map) {
			navigator.geolocation.getCurrentPosition(
				async (position) => {
					const { latitude, longitude, accuracy } = position.coords;
					const L = await import('leaflet');
					const latlng: [number, number] = [latitude, longitude];
					map?.setView(latlng, 16);

					// Remove old markers
					if (locationMarker) {
						locationMarker.remove();
					}
					if (locationAccuracy) {
						locationAccuracy.remove();
					}

					// Add accuracy circle
					locationAccuracy = L.circle(latlng, {
						radius: accuracy,
						color: '#4285F4',
						fillColor: '#4285F4',
						fillOpacity: 0.1,
						weight: 1,
						interactive: false
					}).addTo(map!);

					// Add location dot
					locationMarker = L.circleMarker(latlng, {
						radius: 8,
						color: '#fff',
						fillColor: '#4285F4',
						fillOpacity: 1,
						weight: 2,
						interactive: false
					}).addTo(map!);
				},
				(error) => {
					console.error('Geolocation error:', error);
				}
			);
		}
	}

	async function handleLogout() {
		try {
			disconnectRealtime();
			await resetAllParticipantState();
			resetPocketBase();
			await fetch('/participant/logout', {
				method: 'POST',
				redirect: 'manual'
			});
		} catch (error) {
			console.error('Logout error:', error);
		}
		window.location.href = '/participant/login';
	}
</script>

<div class="relative h-full w-full">
	<MapCanvas
		layers={mapLayers}
		{activeBaseLayerId}
		{activeOverlayIds}
		{mapSettings}
		{markers}
		visibleCategoryIds={effectiveVisibleCategoryIds}
		workflowInstances={filteredInstances}
		{workflowStages}
		visibleWorkflowIds={effectiveVisibleWorkflowIds}
		{filterableValues}
		visibleTagValues={effectiveVisibleTagValues}
		{workflows}
		{visualKeyRegistry}
		{uncluster}
		{unclusterCap}
		onUnclusterStats={(rendered, total) => (unclusterStats = { rendered, total })}
		onMarkerClick={handleMarkerClick}
		onWorkflowInstanceClick={handleWorkflowInstanceClick}
		onClusterClick={(detail) => {
			// If drill-down was active from a previous cluster, restore first
			if (drillDownActive) {
				drillDownActive = false;
				drillDownInstanceIds = null;
				drillDownActiveRowKey = null;
				drillDownActiveWorkflowId = null;
			}
			clusterDetail = detail;
			clusterDetailOpen = true;
			clusterGroups = buildClusterGroups(detail.leaves);
		}}
		drillDownInstanceIds={drillDownActive ? drillDownInstanceIds : null}
		onMapReady={handleMapReady}
		onMapClick={handleMapClick}
	/>

	<BottomControlBar
		onLayersClick={() => { const next = !layerSheetOpen; filterSheetOpen = false; settingsSheetOpen = false; layerSheetOpen = next; }}
		onFiltersClick={() => { const next = !filterSheetOpen; layerSheetOpen = false; settingsSheetOpen = false; filterSheetOpen = next; }}
		onToolsClick={() => { const next = !settingsSheetOpen; layerSheetOpen = false; filterSheetOpen = false; settingsSheetOpen = next; }}
		onLocationClick={centerOnLocation}
		{workflows}
		{map}
		onWorkflowSelect={handleWorkflowSelect}
		onDrawGeometry={handleDrawGeometry}
		{isEditingLocation}
		bind:workflowSelectorOpen={mobileSelectorOpen}
		bind:recentOpen={recentSheetOpen}
	/>

	<!-- Recent Instances sheet (right side, opened by 2nd FAB click) -->
	<RecentSheet
		bind:open={recentSheetOpen}
		instances={workflowInstances as any}
		workflows={workflows as any}
		fieldValues={fieldValues as any}
		{formFieldsByWorkflow}
		{latestToolUsageByInstance}
		{iconByInstance}
		stages={workflowStages as any}
		workflowFilter={recentWorkflowFilter}
		onInstanceTap={handleRecentInstanceTap}
	/>

	<!-- Desktop Workflow Selector (mobile handled by BottomControlBar) -->
	<div class="hidden md:block">
		<WorkflowSelector
			{workflows}
			{map}
			bind:isOpen={workflowSelectorOpen}
			bind:isSelectingCoordinates
			onWorkflowSelect={handleWorkflowSelect}
			onDrawGeometry={handleDrawGeometry}
		/>
	</div>

	<!-- Line / Polygon draw session for incident workflows whose geometry_type
	     is line or polygon. Mounted on top of the map, unmounted on confirm/cancel. -->
	{#if drawingSession && map}
		<GeometryDrawTool
			{map}
			mode={drawingSession.mode}
			onConfirm={handleDrawConfirm}
			onCancel={handleDrawCancel}
		/>
	{/if}

	<!-- Non-clustered shape layer for line / polygon instances. Cluster layer
	     inside MapCanvas still represents these via their centroid so zoom-out
	     counts remain complete; this layer takes over above the zoom threshold.
	     `selectedInstanceId` triggers a halo + heavier stroke on all sub-shapes
	     of a Multi* geometry so the user can see the whole group belong to the
	     selected instance. `interactive={!drawingSession}` prevents taps from
	     opening the detail sheet mid-draw -- clicks fall through to the draw
	     tool instead. -->
	{#if map}
		<InstanceGeometryLayer
			{map}
			instances={filteredInstances}
			{workflows}
			visibleWorkflowIds={effectiveVisibleWorkflowIds}
			selectedInstanceId={selection.type === 'workflowInstance' ? selection.instanceId : null}
			interactive={!isCreatingInstance}
			onInstanceClick={(id) => (selection = createSelection.workflowInstance(id))}
		/>
	{/if}

	<LayerSheet
		bind:open={layerSheetOpen}
		layers={mapLayers}
		{activeBaseLayerId}
		{activeOverlayIds}
		onBaseLayerChange={(id) => (activeBaseLayerId = id)}
		onOverlayToggle={handleOverlayToggle}
	/>

	<FilterSheet
		bind:open={filterSheetOpen}
		{markers}
		{workflowInstances}
		{visibleCategoryIds}
		{visibleWorkflowIds}
		{fieldTags}
		{fieldValues}
		{visibleTagValues}
		{workflowStages}
		{workflows}
		onCategoryToggle={handleCategoryToggle}
		onWorkflowToggle={handleWorkflowToggle}
		onTagValueToggle={handleTagValueToggle}
		{uncluster}
		onUnclusterToggle={(next) => { uncluster = next; void persistClusterConfig(); }}
		{unclusterCap}
		onUnclusterCapChange={(next) => { unclusterCap = next; void persistClusterConfig(); }}
		{unclusterStats}
		advancedClauses={advancedClauses}
		{builderCtx}
		onAdvancedClausesChange={(next) => {
			advancedClauses = next;
			if (activeSavedViewId) void handleUpdateActiveView();
		}}
		{savedViews}
		{activeSavedViewId}
		onSavedViewToggle={handleSavedViewToggle}
		onSavedViewSave={handleSaveCurrentView}
		onSavedViewRename={handleRenameView}
		onSavedViewDelete={handleDeleteView}
		onClearActiveView={clearActiveView}
		onManageTabs={() => { filterSheetOpen = false; settingsSheetOpen = true; }}
	/>

	<!-- Workflow Instance Detail Module (handles tool flows internally) -->
	{#if selection.type === 'workflowInstance'}
		<WorkflowInstanceDetailModule
			{selection}
			{map}
			{fieldValueCache}
			bind:isExpanded={sheetExpanded}
			bind:isEditingLocation
			onClose={handleSelectionClose}
		/>
	{/if}

	<!-- Marker Detail Module -->
	{#if selection.type === 'marker'}
		<MarkerDetailModule
			{selection}
			markers={selectableMarkers}
			bind:isExpanded={sheetExpanded}
			onClose={handleSelectionClose}
			onNext={canGoNext ? () => { selection = createSelection.marker((selectableMarkers[currentIndex + 1] as any).id); } : undefined}
			onPrevious={canGoPrevious ? () => { selection = createSelection.marker((selectableMarkers[currentIndex - 1] as any).id); } : undefined}
		/>
	{/if}

	<!-- Cluster Detail Module (peek sheet with composition breakdown) -->
	{#if clusterDetailOpen && clusterDetail}
		<ClusterDetailModule
			groups={clusterGroups}
			totalCount={clusterDetail.totalCount}
			activeRowKey={drillDownActiveRowKey}
			activeWorkflowId={drillDownActiveWorkflowId}
			bind:isOpen={clusterDetailOpen}
			onRowTap={handleClusterRowTap}
			onClose={handleClusterDetailClose}
		/>
	{/if}

	<!-- Form Fill for NEW Workflow Creation (uses shared ModuleShell + FormFillTool) -->
	{#if pendingWorkflow && formFillOpen}
		{@const pw = pendingWorkflow}
		<ModuleShell
			bind:isOpen={formFillOpen}
			bind:isExpanded={sheetExpanded}
			title={pw.workflow.name}
			onClose={handleFormClose}
		>
			{#snippet content()}
				<FormFillTool
					workflowId={pw.workflow.id}
					onSubmit={handleFormSubmit}
					onCancel={handleFormClose}
				/>
			{/snippet}
		</ModuleShell>
	{/if}

	<!-- Settings Sheet -->
	<SettingsSheet
		bind:open={settingsSheetOpen}
		participant={data.participant ? {
			id: data.participant.id,
			name: String(data.participant.name || data.participant.email || (m.participantMapDefaultName?.() ?? 'Participant')),
			email: data.participant.email ? String(data.participant.email) : undefined,
			project_id: data.participant.project_id ? String(data.participant.project_id) : undefined
		} : undefined}
		roles={[]}
		collectionNames={data.collectionNames ?? []}
		fileFields={data.fileFields ?? {}}
		infoPages={data.infoPages ?? []}
		legalPages={data.legalPages ?? []}
		onLogout={handleLogout}
	/>

	<!-- Floating download progress (always visible outside modal) -->
	{#if downloadProgress && downloadProgress.status === 'downloading'}
		<div class="fixed bottom-20 left-4 right-4 z-[1200] md:left-auto md:right-4 md:w-80">
			<div class="rounded-lg bg-background/95 p-3 shadow-lg backdrop-blur-sm border">
				<div class="flex items-center gap-2 mb-2">
					<Loader2 class="h-4 w-4 animate-spin text-blue-600" />
					<span class="text-sm font-medium">{m.participantMapDownloadingOfflineData?.() ?? 'Downloading offline data...'}</span>
				</div>
				<p class="text-xs text-muted-foreground">{downloadProgress.current_operation}</p>
			</div>
		</div>
	{/if}

	{#if isLoading}
		<div class="absolute inset-0 flex items-center justify-center bg-background/50">
			<div class="text-muted-foreground">{m.participantMapLoadingMap?.() ?? 'Loading map...'}</div>
		</div>
	{/if}
</div>
