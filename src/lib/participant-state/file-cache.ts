/**
 * File Cache - Blob URL helper for offline file display
 *
 * Provides utilities to resolve cached file blobs into displayable URLs.
 * Maintains a URL cache to avoid repeated IndexedDB lookups and
 * duplicate blob URL allocations.
 *
 * Supports resolution-aware storage: originals (for upload) and thumbnails
 * (for offline display in full local copy mode).
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
 * Get original-resolution files for a record (for upload during sync).
 */
export async function getOriginalsForRecord(recordId: string): Promise<CachedFile[]> {
	const files = await getFilesForRecord(recordId);
	return files.filter((f) => f.resolution === 'original');
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
 * Delete original-resolution files for a record, keeping thumbnails.
 * Called after successful sync upload in full local copy mode:
 * the server has the full-res, we only need the thumbnail locally.
 */
export async function deleteOriginalsForRecord(recordId: string): Promise<void> {
	const db = await getDB();
	const files = await db.getAllFromIndex('files', 'by_record', recordId);
	for (const file of files) {
		if (file.resolution === 'original' && file.source === 'local') {
			if (blobUrlCache.has(file.key)) {
				URL.revokeObjectURL(blobUrlCache.get(file.key)!);
				blobUrlCache.delete(file.key);
			}
			await db.delete('files', file.key);
		}
	}
}

/**
 * Delete all downloaded (server-sourced) files.
 * Called when switching from full local copy to light mode.
 */
export async function deleteDownloadedFiles(): Promise<void> {
	const db = await getDB();
	const files = await db.getAllFromIndex('files', 'by_source', 'downloaded');
	for (const file of files) {
		if (blobUrlCache.has(file.key)) {
			URL.revokeObjectURL(blobUrlCache.get(file.key)!);
			blobUrlCache.delete(file.key);
		}
		await db.delete('files', file.key);
	}
}

/**
 * Create a thumbnail from a Blob using OffscreenCanvas (browser built-in).
 * Returns a new Blob at reduced resolution (~50KB per image).
 *
 * @param blob - The original image blob
 * @param maxWidth - Maximum width of the thumbnail (height scales proportionally)
 * @returns Thumbnail blob, or original blob if thumbnail creation fails
 */
export async function createThumbnail(blob: Blob, maxWidth: number = 800): Promise<Blob> {
	try {
		const bitmap = await createImageBitmap(blob);
		const scale = Math.min(1, maxWidth / bitmap.width);
		const width = Math.round(bitmap.width * scale);
		const height = Math.round(bitmap.height * scale);

		// Use OffscreenCanvas if available, fall back to regular canvas
		if (typeof OffscreenCanvas !== 'undefined') {
			const canvas = new OffscreenCanvas(width, height);
			const ctx = canvas.getContext('2d');
			if (!ctx) return blob;

			ctx.drawImage(bitmap, 0, 0, width, height);
			bitmap.close();

			return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
		}

		// Fallback: regular canvas (for browsers without OffscreenCanvas)
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) return blob;

		ctx.drawImage(bitmap, 0, 0, width, height);
		bitmap.close();

		return new Promise<Blob>((resolve) => {
			canvas.toBlob(
				(result) => resolve(result || blob),
				'image/jpeg',
				0.7
			);
		});
	} catch {
		// If thumbnail creation fails for any reason, return the original
		return blob;
	}
}

/**
 * Check if a file's MIME type is an image (for thumbnail generation).
 */
export function isImageMimeType(mimeType: string): boolean {
	return mimeType.startsWith('image/') && !mimeType.includes('svg');
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
