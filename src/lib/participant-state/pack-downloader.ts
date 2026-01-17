/**
 * Offline pack downloader
 *
 * Downloads all necessary data for a geographic area to work offline.
 * Uses the generic 'records' store.
 */

import { getDB, type CachedRecord } from './db';
import { getPocketBase } from '$lib/pocketbase';
import { generateId } from './utils';
import type {
	BoundingBox,
	OfflinePackMetadata,
	DownloadProgress,
	Marker,
	Workflow,
	ToolForm,
	MarkerCategory
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
	records: T[],
	packId?: string
): Promise<void> {
	const db = await getDB();

	for (const record of records) {
		const cached: CachedRecord = {
			...(record as unknown as Record<string, unknown>),
			id: record.id,
			_key: `${collection}/${record.id}`,
			_collection: collection,
			_status: 'unchanged',
			...(packId ? { pack_id: packId } : {})
		};
		await db.put('records', cached);
	}
}

async function getRecordsByCollection<T>(collection: string): Promise<T[]> {
	const db = await getDB();
	const all = await db.getAllFromIndex('records', 'by_collection', collection);
	return all.filter((r) => r._status !== 'deleted') as unknown as T[];
}

async function getRecordsByPack<T>(collection: string, packId: string): Promise<T[]> {
	const db = await getDB();
	const all = await db.getAllFromIndex('records', 'by_collection', collection);
	return all.filter(
		(r) => r._status !== 'deleted' && r.pack_id === packId
	) as unknown as T[];
}

async function deleteRecordsByPack(collection: string, packId: string): Promise<void> {
	const db = await getDB();
	const all = await db.getAllFromIndex('records', 'by_collection', collection);
	const toDelete = all.filter((r) => r.pack_id === packId);

	for (const record of toDelete) {
		await db.delete('records', record._key);
	}
}

// =============================================================================
// Main Download Function
// =============================================================================

/**
 * Start downloading an offline pack for a geographic area
 */
export async function downloadPack(params: {
	projectId: string;
	packName: string;
	bbox: BoundingBox;
	zoomLevels?: number[];
}): Promise<string> {
	const { projectId, packName, bbox, zoomLevels = [12, 13, 14, 15, 16] } = params;

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

	try {
		// Step 1: Download marker categories
		updateProgress('Downloading marker categories...');
		const categories = await pb
			.collection('marker_categories')
			.getFullList<MarkerCategory>({
				filter: `project_id = "${projectId}"`
			});

		await storeRecords('marker_categories', categories, packId);
		incrementCompleted(categories.length);

		// Step 2: Download markers in bounding box
		updateProgress('Downloading markers...');
		const markers = await pb.collection('markers').getFullList<Marker>({
			filter: `project_id = "${projectId}"`
		});

		await storeRecords('markers', markers, packId);
		incrementCompleted(markers.length);

		// Step 3: Download workflows
		updateProgress('Downloading workflows...');
		const workflows = await pb.collection('workflows').getFullList<Workflow>({
			filter: `project_id = "${projectId}"`
		});

		await storeRecords('workflows', workflows, packId);
		incrementCompleted(workflows.length);

		// Step 4: Download forms (tools_forms)
		updateProgress('Downloading forms...');
		const forms = await pb.collection('tools_forms').getFullList<ToolForm>({
			filter: `workflow_id ?~ "${workflows.map((w) => w.id).join('||')}"`
		});

		await storeRecords('tools_forms', forms, packId);
		incrementCompleted(forms.length);

		// Step 5: Create pack metadata
		updateProgress('Finalizing pack...');
		const metadata: OfflinePackMetadata = {
			id: packId,
			name: packName,
			project_id: projectId,
			bbox,
			zoom_levels: zoomLevels,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			tile_count: 0,
			estimated_size_mb: 0,
			download_completed: true
		};

		await storeRecords('pack_metadata', [metadata]);

		// Mark as completed
		if (downloadProgressState) {
			downloadProgressState = {
				...downloadProgressState,
				status: 'completed',
				current_operation: 'Pack download completed'
			};
		}

		return packId;
	} catch (error) {
		console.error('Error downloading pack:', error);
		if (downloadProgressState) {
			downloadProgressState = {
				...downloadProgressState,
				status: 'failed',
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
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
 * Delete a pack and all its data
 */
export async function deletePack(packId: string): Promise<void> {
	const db = await getDB();

	// Delete pack metadata
	await db.delete('records', `pack_metadata/${packId}`);

	// Delete all data in this pack
	await deleteRecordsByPack('markers', packId);
	await deleteRecordsByPack('workflows', packId);
	await deleteRecordsByPack('tools_forms', packId);
	await deleteRecordsByPack('marker_categories', packId);
}

/**
 * Get markers from a pack
 */
export async function getPackMarkers(packId: string): Promise<Marker[]> {
	return getRecordsByPack<Marker>('markers', packId);
}

/**
 * Get workflows from a pack
 */
export async function getPackWorkflows(packId: string): Promise<Workflow[]> {
	return getRecordsByPack<Workflow>('workflows', packId);
}

/**
 * Get forms from a pack
 */
export async function getPackForms(packId: string): Promise<ToolForm[]> {
	return getRecordsByPack<ToolForm>('tools_forms', packId);
}

/**
 * Get marker categories from a pack
 */
export async function getPackCategories(packId: string): Promise<MarkerCategory[]> {
	return getRecordsByPack<MarkerCategory>('marker_categories', packId);
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
		packName: pack.name,
		bbox: pack.bbox,
		zoomLevels: pack.zoom_levels
	});
}

/**
 * Estimate pack download size
 */
export async function estimatePackSize(params: {
	projectId: string;
	bbox: BoundingBox;
	zoomLevels?: number[];
}): Promise<{
	markerCount: number;
	workflowCount: number;
	formCount: number;
	categoryCount: number;
	estimatedDataSize: number;
}> {
	const { projectId } = params;
	const pb = getPocketBase();

	const [markerCount, workflowCount, formCount, categoryCount] = await Promise.all([
		pb
			.collection('markers')
			.getList(1, 1, { filter: `project_id = "${projectId}"` })
			.then((r) => r.totalItems),
		pb
			.collection('workflows')
			.getList(1, 1, { filter: `project_id = "${projectId}"` })
			.then((r) => r.totalItems),
		pb
			.collection('tools_forms')
			.getList(1, 1, {})
			.then((r) => r.totalItems),
		pb
			.collection('marker_categories')
			.getList(1, 1, { filter: `project_id = "${projectId}"` })
			.then((r) => r.totalItems)
	]);

	const estimatedDataSize =
		markerCount * 1024 + workflowCount * 5120 + formCount * 3072 + categoryCount * 512;

	return {
		markerCount,
		workflowCount,
		formCount,
		categoryCount,
		estimatedDataSize
	};
}
