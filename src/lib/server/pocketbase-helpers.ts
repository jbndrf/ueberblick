/**
 * PocketBase helper functions for handling JSON data in TEXT columns
 * SQLite stores JSON as TEXT, these helpers ensure consistent parsing/serialization
 */

import type { RecordModel } from 'pocketbase';

/**
 * Fields that should be treated as JSON arrays stored in TEXT columns
 * Map: collection name -> array of field names
 */
const ARRAY_FIELDS: Record<string, string[]> = {
	participants: ['role_id'],
	markers: ['visible_to_roles'],
	marker_categories: ['visible_to_roles']
	// map_layers uses proper relation field for visible_to_roles
};

/**
 * Parse a value that might be a JSON string or already an array
 * Returns empty array if value is null, undefined, or empty string
 */
function parseArrayField(value: unknown): any[] {
	if (!value || value === '') {
		return [];
	}

	if (Array.isArray(value)) {
		return value;
	}

	if (typeof value === 'string') {
		try {
			const parsed = JSON.parse(value);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			// Not valid JSON, return empty array
			return [];
		}
	}

	return [];
}

/**
 * Normalize a single record by parsing JSON array fields
 */
function normalizeRecord<T extends RecordModel>(
	record: T,
	collectionName: string
): T {
	const arrayFields = ARRAY_FIELDS[collectionName];
	if (!arrayFields || arrayFields.length === 0) {
		return record;
	}

	const normalized = { ...record };
	for (const fieldName of arrayFields) {
		if (fieldName in normalized) {
			(normalized as any)[fieldName] = parseArrayField((normalized as any)[fieldName]);
		}
	}

	return normalized;
}

/**
 * Normalize array of records by parsing JSON array fields
 */
export function normalizeRecords<T extends RecordModel>(
	records: T[],
	collectionName: string
): T[] {
	return records.map((record) => normalizeRecord(record, collectionName));
}

/**
 * Normalize a single record from PocketBase
 * Use this after getOne() calls
 */
export function normalizeSingleRecord<T extends RecordModel>(
	record: T,
	collectionName: string
): T {
	return normalizeRecord(record, collectionName);
}

/**
 * Prepare array field for sending to PocketBase
 * Converts arrays to JSON string for TEXT columns
 * Returns JSON string for PocketBase TEXT columns (SQLite doesn't have array type)
 */
export function prepareArrayField(value: any[] | null | undefined): string {
	if (!value || value.length === 0) {
		return '[]';
	}
	// TEXT columns need JSON string, not array object
	return JSON.stringify(value);
}
