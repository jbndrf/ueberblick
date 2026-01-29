/**
 * Offline pack downloader utilities
 *
 * Provides helpers for downloading and managing offline data packages.
 * Data is downloaded based on the region defined in offline_packages collection.
 */

import { getDB, type CachedRecord } from './db';
import { storeFileBlob, buildFileKey } from './file-cache';
import { POCKETBASE_URL } from '$lib/config/pocketbase';
import type {
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

/**
 * Update download progress
 */
export function updateDownloadProgress(update: Partial<DownloadProgress>): void {
	if (downloadProgressState) {
		downloadProgressState = { ...downloadProgressState, ...update };
	} else {
		downloadProgressState = {
			pack_id: update.pack_id || '',
			status: update.status || 'downloading',
			total_items: update.total_items || 0,
			completed_items: update.completed_items || 0,
			current_operation: update.current_operation || ''
		};
	}
}

// =============================================================================
// Record Storage Helpers (exported for use by package-selector)
// =============================================================================

/**
 * Store records in IndexedDB generic records store
 */
export async function storeRecords<T extends { id: string }>(
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

/**
 * Get all records from a collection
 */
export async function getRecordsByCollection<T>(collection: string): Promise<T[]> {
	const db = await getDB();
	const all = await db.getAllFromIndex('records', 'by_collection', collection);
	return all.filter((r) => r._status !== 'deleted') as unknown as T[];
}

/**
 * Clear all records from a collection (preserving local modifications)
 */
export async function clearCollectionRecords(collection: string): Promise<void> {
	const db = await getDB();
	const all = await db.getAllFromIndex('records', 'by_collection', collection);
	for (const record of all) {
		if (record._status === 'unchanged') {
			await db.delete('records', record._key);
		}
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

	// Clear tiles
	const { clearAllTiles } = await import('./tile-cache.svelte');
	await clearAllTiles();
}

/**
 * Get markers from cache
 */
export async function getPackMarkers(packId: string): Promise<Marker[]> {
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

// =============================================================================
// Project Data Sync (for offline toggle)
// =============================================================================

/**
 * Sync all project data to IndexedDB for offline use.
 * Downloads ALL collections that the participant has access to,
 * plus file blobs for collections with file fields.
 * PocketBase security rules automatically filter to accessible records.
 *
 * @param collectionNames - List of all collection names (from server)
 * @param pb - PocketBase instance (must be authenticated as participant)
 * @param fileFields - Map of collection name -> array of file field names (auto-detected from schema)
 */
export async function syncProjectData(
	collectionNames: string[],
	pb: { collection: (name: string) => { getFullList: (options?: Record<string, unknown>) => Promise<Array<{ id: string; [key: string]: unknown }>> } },
	fileFields: Record<string, string[]> = {}
): Promise<void> {
	// Extra step for file downloads if there are file fields
	const hasFileFields = Object.keys(fileFields).length > 0;
	const totalSteps = collectionNames.length + (hasFileFields ? 1 : 0);
	let currentStep = 0;
	let totalRecords = 0;

	// Keep track of downloaded records per collection (for file download pass)
	const downloadedRecords: Record<string, Array<{ id: string; [key: string]: unknown }>> = {};

	try {
		// Pass 1: Download all collection records
		for (const collectionName of collectionNames) {
			currentStep++;
			updateDownloadProgress({
				pack_id: 'sync',
				status: 'downloading',
				total_items: totalSteps,
				completed_items: currentStep - 1,
				current_operation: `Downloading ${collectionName}...`
			});

			try {
				// Download all records (PocketBase security rules filter to what participant can see)
				const records = await pb.collection(collectionName).getFullList();

				if (records.length > 0) {
					await storeRecords(collectionName, records);
					totalRecords += records.length;
					console.log(`Downloaded ${records.length} records from ${collectionName}`);

					// Track for file download pass
					if (fileFields[collectionName]) {
						downloadedRecords[collectionName] = records;
					}
				}
			} catch (e) {
				// Collection might not be accessible to this participant - skip silently
				// This is expected for collections the participant doesn't have read access to
				console.log(`Skipped ${collectionName}: ${e instanceof Error ? e.message : 'No access'}`);
			}
		}

		// Pass 2: Download file blobs for collections with file fields
		if (hasFileFields) {
			currentStep++;
			let totalFiles = 0;
			let downloadedFiles = 0;

			// Count total files to download
			for (const [collectionName, fields] of Object.entries(fileFields)) {
				const records = downloadedRecords[collectionName];
				if (!records) continue;
				for (const record of records) {
					for (const fieldName of fields) {
						const fileValue = record[fieldName];
						if (!fileValue) continue;
						// File fields can be a single filename string or an array of filenames
						const fileNames = Array.isArray(fileValue) ? fileValue : [fileValue];
						totalFiles += fileNames.filter((f) => typeof f === 'string' && f.length > 0).length;
					}
				}
			}

			updateDownloadProgress({
				pack_id: 'sync',
				status: 'downloading',
				total_items: totalSteps,
				completed_items: currentStep - 1,
				current_operation: `Downloading files (0/${totalFiles})...`
			});

			const db = await getDB();

			for (const [collectionName, fields] of Object.entries(fileFields)) {
				const records = downloadedRecords[collectionName];
				if (!records) continue;

				for (const record of records) {
					for (const fieldName of fields) {
						const fileValue = record[fieldName];
						if (!fileValue) continue;

						const fileNames = Array.isArray(fileValue) ? fileValue : [fileValue];

						for (const fileName of fileNames) {
							if (typeof fileName !== 'string' || fileName.length === 0) continue;

							const fileKey = buildFileKey(collectionName, record.id, fieldName, fileName);

							// Skip if already cached
							const existing = await db.get('files', fileKey);
							if (existing) {
								downloadedFiles++;
								continue;
							}

							try {
								const url = `${POCKETBASE_URL}/api/files/${collectionName}/${record.id}/${fileName}`;
								const response = await fetch(url);
								if (!response.ok) {
									console.log(`Skipped file ${fileName}: HTTP ${response.status}`);
									downloadedFiles++;
									continue;
								}

								const blob = await response.blob();
								await storeFileBlob({
									key: fileKey,
									collection: collectionName,
									recordId: record.id,
									fieldName,
									fileName,
									blob,
									mimeType: blob.type,
									size: blob.size,
									cachedAt: new Date().toISOString(),
									source: 'downloaded'
								});

								downloadedFiles++;
								updateDownloadProgress({
									pack_id: 'sync',
									status: 'downloading',
									total_items: totalSteps,
									completed_items: currentStep - 1,
									current_operation: `Downloading files (${downloadedFiles}/${totalFiles})...`
								});
							} catch (e) {
								// Non-fatal: file just won't display offline
								console.log(`Failed to download file ${fileName}:`, e);
								downloadedFiles++;
							}
						}
					}
				}
			}

			console.log(`Downloaded ${downloadedFiles} files`);
		}

		// Mark sync complete
		updateDownloadProgress({
			pack_id: 'sync',
			status: 'complete' as 'downloading',
			total_items: totalSteps,
			completed_items: totalSteps,
			current_operation: `Sync complete (${totalRecords} records)`
		});

		console.log(`Sync complete: ${totalRecords} records from ${collectionNames.length} collections`);
	} catch (error) {
		updateDownloadProgress({
			pack_id: 'sync',
			status: 'error' as 'downloading',
			total_items: totalSteps,
			completed_items: currentStep,
			current_operation: error instanceof Error ? error.message : 'Sync failed'
		});
		throw error;
	}
}
