/**
 * Offline pack downloader
 *
 * Downloads all necessary data for a geographic area to work offline.
 * Uses geoDistance filtering for location-based collections.
 * Stores data in the generic 'records' store.
 */

import { getDB, type CachedRecord } from './db';
import { getPocketBase } from '$lib/pocketbase';
import { generateId } from './utils';
import { downloadTilesForArea, type TileSource } from './tile-cache.svelte';
import { signalDownloadComplete } from './download-events.svelte';
import type {
	OfflinePackMetadata,
	DownloadProgress,
	Marker,
	WorkflowInstance,
	Workflow,
	WorkflowStage,
	WorkflowConnection,
	ToolForm,
	ToolFormField,
	ToolEdit,
	MarkerCategory,
	Role,
	MapLayer,
	MapSource,
	GeoPoint
} from './types';

// =============================================================================
// Progress State (Svelte 5 Runes)
// =============================================================================

let downloadProgressState = $state<DownloadProgress | null>(null);

/**
 * Get current download progress (reactive)
 */
export function getDownloadProgress(): DownloadProgress | null {
	return downloadProgressState;
}

/**
 * Reset download progress
 */
export function resetDownloadProgress(): void {
	downloadProgressState = null;
}

// =============================================================================
// Helper to store records in generic store
// =============================================================================

async function storeRecords<T extends { id: string }>(
	collection: string,
	records: T[]
): Promise<void> {
	const db = await getDB();

	for (const record of records) {
		const cached: CachedRecord = {
			...(record as unknown as Record<string, unknown>),
			id: record.id,
			_key: `${collection}/${record.id}`,
			_collection: collection,
			_status: 'unchanged'
		};
		await db.put('records', cached);
	}
}

async function getRecordsByCollection<T>(collection: string): Promise<T[]> {
	const db = await getDB();
	const all = await db.getAllFromIndex('records', 'by_collection', collection);
	return all.filter((r) => r._status !== 'deleted') as unknown as T[];
}

async function clearCollectionRecords(collection: string): Promise<void> {
	const db = await getDB();
	const all = await db.getAllFromIndex('records', 'by_collection', collection);
	for (const record of all) {
		// Only delete 'unchanged' records (preserve local modifications)
		if (record._status === 'unchanged') {
			await db.delete('records', record._key);
		}
	}
}

// =============================================================================
// Main Download Function
// =============================================================================

export interface DownloadPackParams {
	projectId: string;
	center: GeoPoint;
	radiusKm: number;
	zoomLevels?: number[];
	signal?: AbortSignal;
}

/**
 * Download an offline pack for a geographic area
 *
 * Downloads:
 * - Markers within radius (geo-filtered)
 * - Workflow instances within radius (geo-filtered)
 * - All project reference data (workflows, stages, connections, forms, etc.)
 * - Map layers and their tile sources
 * - Map tiles for the selected area
 */
export async function downloadPack(params: DownloadPackParams): Promise<string> {
	const { projectId, center, radiusKm, zoomLevels = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22], signal } = params;

	const packId = generateId();
	const pb = getPocketBase();

	// Initialize progress
	downloadProgressState = {
		pack_id: packId,
		status: 'downloading',
		total_items: 0,
		completed_items: 0,
		current_operation: 'Initializing...'
	};

	let markerCount = 0;
	let instanceCount = 0;
	let tileCount = 0;

	try {
		// Check for abort
		if (signal?.aborted) throw new Error('Download cancelled');

		// =================================================================
		// Step 1: Download geo-filtered data (markers + workflow instances)
		// =================================================================

		// Build geoDistance filter
		// PocketBase geoDistance: geoDistance(lonA, latA, lonB, latB) returns meters
		const radiusMeters = radiusKm * 1000;
		const geoFilter = `geoDistance(location.lon, location.lat, ${center.lon}, ${center.lat}) <= ${radiusMeters}`;

		// Download markers within radius
		updateProgress('Downloading markers...');
		const markers = await pb.collection('markers').getFullList<Marker>({
			filter: `project_id = "${projectId}" && ${geoFilter}`
		});
		await storeRecords('markers', markers);
		markerCount = markers.length;
		incrementCompleted(markers.length);

		if (signal?.aborted) throw new Error('Download cancelled');

		// Download workflow instances within radius
		updateProgress('Downloading workflow instances...');
		const instances = await pb.collection('workflow_instances').getFullList<WorkflowInstance>({
			filter: geoFilter
		});
		await storeRecords('workflow_instances', instances);
		instanceCount = instances.length;
		incrementCompleted(instances.length);

		if (signal?.aborted) throw new Error('Download cancelled');

		// Download field values for these instances
		if (instances.length > 0) {
			updateProgress('Downloading field values...');
			const instanceIds = instances.map((i) => i.id);
			// Download in batches if there are many instances
			const batchSize = 20;
			for (let i = 0; i < instanceIds.length; i += batchSize) {
				const batch = instanceIds.slice(i, i + batchSize);
				const filterParts = batch.map((id) => `instance_id = "${id}"`);
				const fieldValues = await pb.collection('workflow_instance_field_values').getFullList({
					filter: filterParts.join(' || ')
				});
				await storeRecords('workflow_instance_field_values', fieldValues);
				incrementCompleted(fieldValues.length);
			}
		}

		if (signal?.aborted) throw new Error('Download cancelled');

		// =================================================================
		// Step 2: Download all project reference data (non-geo)
		// =================================================================

		// Marker categories
		updateProgress('Downloading marker categories...');
		const categories = await pb.collection('marker_categories').getFullList<MarkerCategory>({
			filter: `project_id = "${projectId}"`
		});
		await storeRecords('marker_categories', categories);
		incrementCompleted(categories.length);

		if (signal?.aborted) throw new Error('Download cancelled');

		// Roles
		updateProgress('Downloading roles...');
		const roles = await pb.collection('roles').getFullList<Role>({
			filter: `project_id = "${projectId}"`
		});
		await storeRecords('roles', roles);
		incrementCompleted(roles.length);

		if (signal?.aborted) throw new Error('Download cancelled');

		// Workflows
		updateProgress('Downloading workflows...');
		const workflows = await pb.collection('workflows').getFullList<Workflow>({
			filter: `project_id = "${projectId}"`
		});
		await storeRecords('workflows', workflows);
		incrementCompleted(workflows.length);

		if (signal?.aborted) throw new Error('Download cancelled');

		// Workflow stages
		if (workflows.length > 0) {
			updateProgress('Downloading workflow stages...');
			const workflowIds = workflows.map((w) => w.id);
			const stageFilterParts = workflowIds.map((id) => `workflow_id = "${id}"`);
			const stages = await pb.collection('workflow_stages').getFullList<WorkflowStage>({
				filter: stageFilterParts.join(' || ')
			});
			await storeRecords('workflow_stages', stages);
			incrementCompleted(stages.length);

			if (signal?.aborted) throw new Error('Download cancelled');

			// Workflow connections
			updateProgress('Downloading workflow connections...');
			const connections = await pb.collection('workflow_connections').getFullList<WorkflowConnection>({
				filter: stageFilterParts.join(' || ')
			});
			await storeRecords('workflow_connections', connections);
			incrementCompleted(connections.length);

			if (signal?.aborted) throw new Error('Download cancelled');

			// Tools - forms
			updateProgress('Downloading forms...');
			const forms = await pb.collection('tools_forms').getFullList<ToolForm>({
				filter: stageFilterParts.join(' || ')
			});
			await storeRecords('tools_forms', forms);
			incrementCompleted(forms.length);

			if (signal?.aborted) throw new Error('Download cancelled');

			// Tools - form fields
			if (forms.length > 0) {
				updateProgress('Downloading form fields...');
				const formIds = forms.map((f) => f.id);
				const fieldFilterParts = formIds.map((id) => `form_id = "${id}"`);
				const fields = await pb.collection('tools_form_fields').getFullList<ToolFormField>({
					filter: fieldFilterParts.join(' || ')
				});
				await storeRecords('tools_form_fields', fields);
				incrementCompleted(fields.length);
			}

			if (signal?.aborted) throw new Error('Download cancelled');

			// Tools - edit (uses stage_id, not workflow_id)
			updateProgress('Downloading edit tools...');
			const stageIds = stages.map((s) => s.id);
			const stageIdFilterParts = stageIds.map((id) => `stage_id ~ "${id}"`);
			const editTools = await pb.collection('tools_edit').getFullList<ToolEdit>({
				filter: stageIdFilterParts.join(' || ')
			});
			await storeRecords('tools_edit', editTools);
			incrementCompleted(editTools.length);
		}

		if (signal?.aborted) throw new Error('Download cancelled');

		// =================================================================
		// Step 3: Download map layers and sources
		// =================================================================

		updateProgress('Downloading map layers...');
		const mapLayers = await pb.collection('map_layers').getFullList<MapLayer>({
			filter: `project_id = "${projectId}" && is_active = true`,
			expand: 'source_id'
		});
		await storeRecords('map_layers', mapLayers);
		incrementCompleted(mapLayers.length);

		console.log('[downloadPack] Map layers:', mapLayers.length);
		console.log('[downloadPack] First layer:', mapLayers[0]);
		console.log('[downloadPack] First layer expand:', mapLayers[0]?.expand);

		// Extract unique sources from layers
		const sources: MapSource[] = [];
		const seenSourceIds = new Set<string>();
		for (const layer of mapLayers) {
			const source = layer.expand?.source_id;
			if (source && !seenSourceIds.has(source.id)) {
				seenSourceIds.add(source.id);
				sources.push(source);
			}
		}
		await storeRecords('map_sources', sources);

		console.log('[downloadPack] Extracted sources:', sources.length);
		console.log('[downloadPack] Sources:', sources.map(s => ({ id: s.id, type: s.source_type, url: s.url })));

		if (signal?.aborted) throw new Error('Download cancelled');

		// =================================================================
		// Step 4: Download map tiles
		// =================================================================

		// Calculate download area bounds for intersection checks
		const latDegPerKm = 1 / 111.32;
		const lonDegPerKm = 1 / (111.32 * Math.cos((center.lat * Math.PI) / 180));
		const downloadBounds = {
			minLat: center.lat - radiusKm * latDegPerKm,
			maxLat: center.lat + radiusKm * latDegPerKm,
			minLon: center.lon - radiusKm * lonDegPerKm,
			maxLon: center.lon + radiusKm * lonDegPerKm
		};

		// Helper to check if two bounding boxes intersect
		const boundsIntersect = (
			a: { minLat: number; maxLat: number; minLon: number; maxLon: number },
			b: { minLat: number; maxLat: number; minLon: number; maxLon: number }
		): boolean => {
			return !(a.maxLon < b.minLon || a.minLon > b.maxLon || a.maxLat < b.minLat || a.minLat > b.maxLat);
		};

		// Build tile sources from map sources (only tile-based sources)
		// Include: tile (direct URL), uploaded (user-uploaded), preset (OSM, etc.)
		// Exclude: wms (not tile-based), geojson (vector data)
		const TILE_SOURCE_TYPES = ['tile', 'uploaded', 'preset'];
		const tileSources: TileSource[] = sources
			.filter((s) => {
				// Must be a tile-based source type with a URL
				if (!TILE_SOURCE_TYPES.includes(s.source_type) || !s.url) return false;
				// For uploaded sources, only include if processing completed successfully
				if (s.source_type === 'uploaded' && s.status !== 'completed') return false;
				// For uploaded sources with bounds, check if they intersect the download area
				if (s.source_type === 'uploaded' && s.config?.bounds) {
					const sourceBounds = s.config.bounds as { minLat: number; maxLat: number; minLon: number; maxLon: number };
					if (!boundsIntersect(downloadBounds, sourceBounds)) {
						console.log(`[downloadPack] Skipping source ${s.id} (${s.name}) - bounds don't intersect download area`);
						return false;
					}
				}
				return true;
			})
			.map((s) => ({
				id: s.id,
				urlTemplate: s.url,
				subdomains: s.config?.subdomains
			}));

		console.log('[downloadPack] Tile sources (filtered):', tileSources.length);
		console.log('[downloadPack] Tile sources:', tileSources);

		if (tileSources.length > 0) {
			updateProgress('Downloading map tiles...');
			tileCount = await downloadTilesForArea({
				center,
				radiusKm,
				zoomLevels,
				sources: tileSources,
				signal,
				onProgress: (progress) => {
					if (downloadProgressState) {
						downloadProgressState = {
							...downloadProgressState,
							current_operation: `Downloading tiles (${progress.downloadedTiles}/${progress.totalTiles})...`
						};
					}
				}
			});
			console.log('[downloadPack] Downloaded tiles:', tileCount);
		} else {
			console.warn('[downloadPack] No tile sources found! Skipping tile download.');
		}

		if (signal?.aborted) throw new Error('Download cancelled');

		// =================================================================
		// Step 5: Save pack metadata
		// =================================================================

		updateProgress('Finalizing pack...');
		const metadata: OfflinePackMetadata = {
			id: packId,
			project_id: projectId,
			center,
			radius_km: radiusKm,
			zoom_levels: zoomLevels,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			marker_count: markerCount,
			instance_count: instanceCount,
			tile_count: tileCount,
			download_completed: true
		};

		await storeRecords('pack_metadata', [metadata]);

		// Mark as completed
		downloadProgressState = {
			...downloadProgressState,
			status: 'completed',
			current_operation: 'Download completed'
		};

		// Signal that download is complete (triggers reactive updates in components)
		signalDownloadComplete();

		return packId;
	} catch (error) {
		console.error('Error downloading pack:', error);
		downloadProgressState = {
			...(downloadProgressState || {
				pack_id: packId,
				total_items: 0,
				completed_items: 0,
				current_operation: ''
			}),
			status: 'failed',
			error: error instanceof Error ? error.message : 'Unknown error'
		};
		throw error;
	}
}

// =============================================================================
// Progress Helpers
// =============================================================================

function updateProgress(operation: string): void {
	if (downloadProgressState) {
		downloadProgressState = {
			...downloadProgressState,
			current_operation: operation
		};
	}
}

function incrementCompleted(count: number): void {
	if (downloadProgressState) {
		downloadProgressState = {
			...downloadProgressState,
			completed_items: downloadProgressState.completed_items + count
		};
	}
}

// =============================================================================
// Pack Management Functions
// =============================================================================

/**
 * Get all downloaded packs
 */
export async function getDownloadedPacks(): Promise<OfflinePackMetadata[]> {
	return getRecordsByCollection<OfflinePackMetadata>('pack_metadata');
}

/**
 * Get a specific pack by ID
 */
export async function getPack(packId: string): Promise<OfflinePackMetadata | undefined> {
	const db = await getDB();
	const record = await db.get('records', `pack_metadata/${packId}`);
	if (!record || record._status === 'deleted') return undefined;
	return record as unknown as OfflinePackMetadata;
}

/**
 * Delete a pack and all its cached data
 */
export async function deletePack(packId: string): Promise<void> {
	const db = await getDB();

	// Delete pack metadata
	await db.delete('records', `pack_metadata/${packId}`);

	// Clear all cached records (preserving local modifications)
	const collections = [
		'markers',
		'workflow_instances',
		'workflow_instance_field_values',
		'marker_categories',
		'roles',
		'workflows',
		'workflow_stages',
		'workflow_connections',
		'tools_forms',
		'tools_form_fields',
		'tools_edit',
		'map_layers',
		'map_sources'
	];

	for (const collection of collections) {
		await clearCollectionRecords(collection);
	}

	// Clear tiles (all tiles, since we only support one pack at a time)
	const { clearAllTiles } = await import('./tile-cache.svelte');
	await clearAllTiles();
}

/**
 * Get markers from cache
 */
export async function getPackMarkers(packId: string): Promise<Marker[]> {
	// packId is ignored since we only support one pack
	return getRecordsByCollection<Marker>('markers');
}

/**
 * Get workflows from cache
 */
export async function getPackWorkflows(packId: string): Promise<Workflow[]> {
	return getRecordsByCollection<Workflow>('workflows');
}

/**
 * Get forms from cache
 */
export async function getPackForms(packId: string): Promise<ToolForm[]> {
	return getRecordsByCollection<ToolForm>('tools_forms');
}

/**
 * Get marker categories from cache
 */
export async function getPackCategories(packId: string): Promise<MarkerCategory[]> {
	return getRecordsByCollection<MarkerCategory>('marker_categories');
}

/**
 * Refresh a pack (re-download all data)
 */
export async function refreshPack(packId: string): Promise<void> {
	const pack = await getPack(packId);
	if (!pack) {
		throw new Error('Pack not found');
	}

	// Delete old data
	await deletePack(packId);

	// Re-download with same parameters
	await downloadPack({
		projectId: pack.project_id,
		center: pack.center,
		radiusKm: pack.radius_km,
		zoomLevels: pack.zoom_levels
	});
}

/**
 * Estimate pack download size (queries server for counts)
 */
export async function estimatePackSize(params: {
	projectId: string;
	center: GeoPoint;
	radiusKm: number;
}): Promise<{
	markerCount: number;
	instanceCount: number;
	workflowCount: number;
	formCount: number;
	categoryCount: number;
	estimatedDataSizeKB: number;
}> {
	const { projectId, center, radiusKm } = params;
	const pb = getPocketBase();

	// Build geo filter
	const radiusMeters = radiusKm * 1000;
	const geoFilter = `geoDistance(location.lon, location.lat, ${center.lon}, ${center.lat}) <= ${radiusMeters}`;

	const [markerCount, instanceCount, workflowCount, formCount, categoryCount] = await Promise.all([
		pb
			.collection('markers')
			.getList(1, 1, { filter: `project_id = "${projectId}" && ${geoFilter}` })
			.then((r) => r.totalItems)
			.catch(() => 0),
		pb
			.collection('workflow_instances')
			.getList(1, 1, { filter: geoFilter })
			.then((r) => r.totalItems)
			.catch(() => 0),
		pb
			.collection('workflows')
			.getList(1, 1, { filter: `project_id = "${projectId}"` })
			.then((r) => r.totalItems)
			.catch(() => 0),
		pb
			.collection('tools_forms')
			.getList(1, 1, {})
			.then((r) => r.totalItems)
			.catch(() => 0),
		pb
			.collection('marker_categories')
			.getList(1, 1, { filter: `project_id = "${projectId}"` })
			.then((r) => r.totalItems)
			.catch(() => 0)
	]);

	// Rough estimate: 1KB per marker, 2KB per instance, 5KB per workflow, 3KB per form, 0.5KB per category
	const estimatedDataSizeKB =
		markerCount * 1 + instanceCount * 2 + workflowCount * 5 + formCount * 3 + categoryCount * 0.5;

	return {
		markerCount,
		instanceCount,
		workflowCount,
		formCount,
		categoryCount,
		estimatedDataSizeKB
	};
}
