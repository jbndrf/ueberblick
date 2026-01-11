/**
 * Offline pack downloader
 * Downloads all necessary data for a geographic area to work offline
 */

import { v4 as uuidv4 } from 'uuid';
import { writable, type Readable } from 'svelte/store';
import { getDB } from './db';
import { getPocketBase } from '$lib/pocketbase';
import type {
	BoundingBox,
	OfflinePackMetadata,
	DownloadProgress,
	DownloadStatus,
	OfflineMarker,
	OfflineWorkflow,
	OfflineForm,
	OfflineMarkerCategory
} from './types';

/**
 * Download progress store
 */
const downloadProgressStore = writable<DownloadProgress | null>(null);
export const downloadProgress: Readable<DownloadProgress | null> = {
	subscribe: downloadProgressStore.subscribe
};

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

	const packId = uuidv4();
	const db = await getDB();
	const pb = getPocketBase();

	// Initialize progress
	const progress: DownloadProgress = {
		pack_id: packId,
		status: 'downloading',
		total_items: 0,
		completed_items: 0,
		current_operation: 'Initializing...'
	};
	downloadProgressStore.set(progress);

	try {
		// Step 1: Download marker categories
		updateProgress(progress, 'Downloading marker categories...');
		const categories = await pb
			.collection('marker_categories')
			.getFullList<OfflineMarkerCategory>({
				filter: `project_id = "${projectId}"`
			});

		for (const category of categories) {
			await db.put('marker_categories', { ...category, pack_id: packId } as OfflineMarkerCategory & { pack_id: string });
		}
		progress.completed_items += categories.length;
		downloadProgressStore.set(progress);

		// Step 2: Download markers in bounding box
		updateProgress(progress, 'Downloading markers...');
		const markers = await pb.collection('markers').getFullList<OfflineMarker>({
			filter: `project_id = "${projectId}" && latitude >= ${bbox.south} && latitude <= ${bbox.north} && longitude >= ${bbox.west} && longitude <= ${bbox.east}`
		});

		for (const marker of markers) {
			await db.put('markers', { ...marker, pack_id: packId } as OfflineMarker & { pack_id: string });
		}
		progress.completed_items += markers.length;
		downloadProgressStore.set(progress);

		// Step 3: Download workflows
		updateProgress(progress, 'Downloading workflows...');
		const workflows = await pb.collection('workflows').getFullList<OfflineWorkflow>({
			filter: `project_id = "${projectId}"`
		});

		for (const workflow of workflows) {
			await db.put('workflows', { ...workflow, pack_id: packId } as OfflineWorkflow & { pack_id: string });
		}
		progress.completed_items += workflows.length;
		downloadProgressStore.set(progress);

		// Step 4: Download forms
		updateProgress(progress, 'Downloading forms...');
		const forms = await pb.collection('forms').getFullList<OfflineForm>({
			filter: `project_id = "${projectId}"`
		});

		for (const form of forms) {
			await db.put('forms', { ...form, pack_id: packId } as OfflineForm & { pack_id: string });
		}
		progress.completed_items += forms.length;
		downloadProgressStore.set(progress);

		// Step 5: Create pack metadata
		updateProgress(progress, 'Finalizing pack...');
		const metadata: OfflinePackMetadata = {
			id: packId,
			name: packName,
			project_id: projectId,
			bbox,
			zoom_levels: zoomLevels,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			tile_count: 0, // Will be updated by tile downloader
			estimated_size_mb: 0, // Will be updated by tile downloader
			download_completed: true
		};

		await db.put('pack_metadata', metadata);

		// Mark as completed
		progress.status = 'completed';
		progress.current_operation = 'Pack download completed';
		downloadProgressStore.set(progress);

		return packId;
	} catch (error) {
		console.error('Error downloading pack:', error);
		progress.status = 'failed';
		progress.error = error instanceof Error ? error.message : 'Unknown error';
		downloadProgressStore.set(progress);
		throw error;
	}
}

/**
 * Update download progress
 */
function updateProgress(progress: DownloadProgress, operation: string): void {
	progress.current_operation = operation;
	downloadProgressStore.set(progress);
}

/**
 * Get all downloaded packs
 */
export async function getDownloadedPacks(): Promise<OfflinePackMetadata[]> {
	const db = await getDB();
	return await db.getAll('pack_metadata');
}

/**
 * Get a specific pack by ID
 */
export async function getPack(packId: string): Promise<OfflinePackMetadata | undefined> {
	const db = await getDB();
	return await db.get('pack_metadata', packId);
}

/**
 * Delete a pack and all its data
 */
export async function deletePack(packId: string): Promise<void> {
	const db = await getDB();

	// Delete pack metadata
	await db.delete('pack_metadata', packId);

	// Delete all markers in this pack
	const markers = await db.getAllFromIndex('markers', 'by-pack', packId);
	for (const marker of markers) {
		await db.delete('markers', marker.id);
	}

	// Delete all workflows in this pack
	const workflows = await db.getAllFromIndex('workflows', 'by-pack', packId);
	for (const workflow of workflows) {
		await db.delete('workflows', workflow.id);
	}

	// Delete all forms in this pack
	const forms = await db.getAllFromIndex('forms', 'by-pack', packId);
	for (const form of forms) {
		await db.delete('forms', form.id);
	}

	// Delete all categories in this pack
	const categories = await db.getAllFromIndex('marker_categories', 'by-pack', packId);
	for (const category of categories) {
		await db.delete('marker_categories', category.id);
	}

	// Note: Tiles will be handled by tile-cache.ts
}

/**
 * Get markers from a pack
 */
export async function getPackMarkers(packId: string): Promise<OfflineMarker[]> {
	const db = await getDB();
	return await db.getAllFromIndex('markers', 'by-pack', packId);
}

/**
 * Get workflows from a pack
 */
export async function getPackWorkflows(packId: string): Promise<OfflineWorkflow[]> {
	const db = await getDB();
	return await db.getAllFromIndex('workflows', 'by-pack', packId);
}

/**
 * Get forms from a pack
 */
export async function getPackForms(packId: string): Promise<OfflineForm[]> {
	const db = await getDB();
	return await db.getAllFromIndex('forms', 'by-pack', packId);
}

/**
 * Get marker categories from a pack
 */
export async function getPackCategories(packId: string): Promise<OfflineMarkerCategory[]> {
	const db = await getDB();
	return await db.getAllFromIndex('marker_categories', 'by-pack', packId);
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
	const { projectId, bbox, zoomLevels = [12, 13, 14, 15, 16] } = params;
	const pb = getPocketBase();

	// Count items
	const [markerCount, workflowCount, formCount, categoryCount] = await Promise.all([
		pb
			.collection('markers')
			.getList(1, 1, {
				filter: `project_id = "${projectId}" && latitude >= ${bbox.south} && latitude <= ${bbox.north} && longitude >= ${bbox.west} && longitude <= ${bbox.east}`
			})
			.then((r) => r.totalItems),
		pb
			.collection('workflows')
			.getList(1, 1, { filter: `project_id = "${projectId}"` })
			.then((r) => r.totalItems),
		pb
			.collection('forms')
			.getList(1, 1, { filter: `project_id = "${projectId}"` })
			.then((r) => r.totalItems),
		pb
			.collection('marker_categories')
			.getList(1, 1, { filter: `project_id = "${projectId}"` })
			.then((r) => r.totalItems)
	]);

	// Estimate data size (very rough estimate)
	// Assume average 1KB per marker, 5KB per workflow, 3KB per form, 0.5KB per category
	const estimatedDataSize =
		markerCount * 1024 +
		workflowCount * 5120 +
		formCount * 3072 +
		categoryCount * 512;

	return {
		markerCount,
		workflowCount,
		formCount,
		categoryCount,
		estimatedDataSize
	};
}
