/**
 * File Cache - Blob URL helper for offline file display
 *
 * Provides utilities to resolve cached file blobs into displayable URLs.
 * Maintains a URL cache to avoid repeated IndexedDB lookups and
 * duplicate blob URL allocations.
 */

import { getDB, type CachedFile } from './db';

const blobUrlCache = new Map<string, string>();

/**
 * Build the standard file key used in the files store.
 */
export function buildFileKey(
	collection: string,
	recordId: string,
	fieldName: string,
	fileName: string
): string {
	return `${collection}/${recordId}/${fieldName}/${fileName}`;
}

/**
 * Get a displayable URL for a cached file.
 * Returns a blob: URL if the file is in IndexedDB, or null if not cached.
 */
export async function getCachedFileUrl(
	collection: string,
	recordId: string,
	fieldName: string,
	fileName: string
): Promise<string | null> {
	const fileKey = buildFileKey(collection, recordId, fieldName, fileName);

	if (blobUrlCache.has(fileKey)) {
		return blobUrlCache.get(fileKey)!;
	}

	const db = await getDB();
	const cached = await db.get('files', fileKey);
	if (!cached) return null;

	const url = URL.createObjectURL(cached.blob);
	blobUrlCache.set(fileKey, url);
	return url;
}

/**
 * Get a displayable URL for a cached file, looking up by record ID + fileName.
 * Use this when you don't know the PocketBase field name (e.g., in FieldRenderer
 * which doesn't know the underlying PocketBase column name for each collection).
 */
export async function getCachedFileUrlByRecord(
	recordId: string,
	fileName: string
): Promise<string | null> {
	const db = await getDB();
	const files = await db.getAllFromIndex('files', 'by_record', recordId);
	const match = files.find((f) => f.fileName === fileName);
	if (!match) return null;

	if (blobUrlCache.has(match.key)) {
		return blobUrlCache.get(match.key)!;
	}

	const url = URL.createObjectURL(match.blob);
	blobUrlCache.set(match.key, url);
	return url;
}

/**
 * Store a file blob in the files store.
 */
export async function storeFileBlob(entry: CachedFile): Promise<void> {
	const db = await getDB();
	await db.put('files', entry);
}

/**
 * Get all cached files for a specific record.
 */
export async function getFilesForRecord(recordId: string): Promise<CachedFile[]> {
	const db = await getDB();
	return db.getAllFromIndex('files', 'by_record', recordId);
}

/**
 * Delete all cached files for a specific record.
 */
export async function deleteFilesForRecord(recordId: string): Promise<void> {
	const db = await getDB();
	const files = await db.getAllFromIndex('files', 'by_record', recordId);
	for (const file of files) {
		// Revoke blob URL if cached
		if (blobUrlCache.has(file.key)) {
			URL.revokeObjectURL(blobUrlCache.get(file.key)!);
			blobUrlCache.delete(file.key);
		}
		await db.delete('files', file.key);
	}
}

/**
 * Delete only locally-created file blobs for a record (after successful sync).
 * Downloaded blobs are kept for continued offline viewing.
 */
export async function deleteLocalFilesForRecord(recordId: string): Promise<void> {
	const db = await getDB();
	const files = await db.getAllFromIndex('files', 'by_record', recordId);
	for (const file of files) {
		if (file.source === 'local') {
			if (blobUrlCache.has(file.key)) {
				URL.revokeObjectURL(blobUrlCache.get(file.key)!);
				blobUrlCache.delete(file.key);
			}
			await db.delete('files', file.key);
		}
	}
}

/**
 * Revoke all blob URLs and clear the URL cache.
 * Call this when clearing all data or on cleanup.
 */
export function revokeAllBlobUrls(): void {
	for (const url of blobUrlCache.values()) {
		URL.revokeObjectURL(url);
	}
	blobUrlCache.clear();
}
