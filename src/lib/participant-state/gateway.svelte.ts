/**
 * Participant Gateway - Local-First Architecture
 *
 * All reads go to IndexedDB first (instant). When online, a background fetch
 * updates IndexedDB and notifies the UI if data changed.
 *
 * All writes go to IndexedDB immediately (optimistic). Background sync pushes
 * changes to PocketBase.
 *
 * Audit trail is handled at the tool level via workflow_instance_tool_usage collection.
 */

import { getDB, initDB, type CachedRecord, requestPersistentStorage } from './db';
import { getPocketBase } from '$lib/pocketbase';
import { query } from './query';
import { storeFileBlob, buildFileKey } from './file-cache';

// =============================================================================
// Type Definitions
// =============================================================================

/** List options matching PocketBase SDK */
interface ListOptions {
	filter?: string;
	sort?: string;
	expand?: string;
	fields?: string;
}

/** Paginated list result matching PocketBase SDK */
interface ListResult<T> {
	page: number;
	perPage: number;
	totalItems: number;
	totalPages: number;
	items: T[];
}

/** Collection proxy interface (matches PocketBase SDK) */
export interface CollectionProxy<T = Record<string, unknown>> {
	create(data: Partial<T> | FormData): Promise<T>;
	update(id: string, data: Partial<T> | FormData): Promise<T>;
	delete(id: string): Promise<boolean>;
	getOne(id: string, options?: { expand?: string; fields?: string }): Promise<T>;
	getList(page?: number, perPage?: number, options?: ListOptions): Promise<ListResult<T>>;
	getFullList(options?: ListOptions): Promise<T[]>;
	getFirstListItem(filter: string, options?: { expand?: string; fields?: string }): Promise<T>;
}

// =============================================================================
// Data Change Notification
// =============================================================================

type DataChangeListener = (collection: string) => void;
const dataChangeListeners = new Set<DataChangeListener>();

/**
 * Subscribe to data changes. Called when background fetch updates IndexedDB.
 * Returns unsubscribe function.
 */
export function onDataChange(listener: DataChangeListener): () => void {
	dataChangeListeners.add(listener);
	return () => dataChangeListeners.delete(listener);
}

function notifyDataChange(collection: string): void {
	for (const listener of dataChangeListeners) {
		try {
			listener(collection);
		} catch (e) {
			console.error('Data change listener error:', e);
		}
	}
}

// =============================================================================
// ID Generation
// =============================================================================

function generateId(): string {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	let id = '';
	for (let i = 0; i < 15; i++) {
		id += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return id;
}

// =============================================================================
// Offline Expand Support
// =============================================================================

/**
 * Find a related record by ID across all collections in IndexedDB.
 */
async function findRelatedRecord(
	db: Awaited<ReturnType<typeof getDB>>,
	id: string
): Promise<CachedRecord | null> {
	// Get all records and find by ID (records are stored with _key = `${collection}/${id}`)
	const allRecords = await db.getAll('records');
	return allRecords.find((r) => r.id === id && r._status !== 'deleted') || null;
}

/**
 * Expand relation fields on cached records by joining related records from IndexedDB.
 * Mimics PocketBase's expand functionality for offline mode.
 */
async function expandRecords<T>(
	records: T[],
	expandParam: string | undefined
): Promise<T[]> {
	if (!expandParam) return records;

	const db = await getDB();
	const fieldsToExpand = expandParam.split(',').map((f) => f.trim());

	return Promise.all(
		records.map(async (record) => {
			const expanded: Record<string, unknown> = {};

			for (const field of fieldsToExpand) {
				const relationValue = (record as Record<string, unknown>)[field];

				if (!relationValue) continue;

				// Handle single relation (string ID)
				if (typeof relationValue === 'string') {
					const relatedRecord = await findRelatedRecord(db, relationValue);
					if (relatedRecord) {
						// Remove internal fields from expanded record
						const { _key, _collection, _status, _serverUpdated, _error, _retryCount, ...cleanRecord } =
							relatedRecord;
						expanded[field] = cleanRecord;
					}
				}
				// Handle multi-relation (array of IDs)
				else if (Array.isArray(relationValue)) {
					const relatedRecords = await Promise.all(
						relationValue.map(async (id) => {
							if (typeof id !== 'string') return null;
							const relatedRecord = await findRelatedRecord(db, id);
							if (relatedRecord) {
								const { _key, _collection, _status, _serverUpdated, _error, _retryCount, ...cleanRecord } =
									relatedRecord;
								return cleanRecord;
							}
							return null;
						})
					);
					expanded[field] = relatedRecords.filter(Boolean);
				}
			}

			// Return record with expand object if any relations were found
			if (Object.keys(expanded).length > 0) {
				return {
					...record,
					expand: expanded
				};
			}

			return record;
		})
	);
}

// =============================================================================
// Clean Record Helper
// =============================================================================

/**
 * Strip internal fields from a CachedRecord for returning to callers.
 */
function cleanRecord(record: CachedRecord): Record<string, unknown> {
	const { _key, _collection, _status, _serverUpdated, _error, _retryCount, ...clean } = record;
	return clean;
}

// =============================================================================
// Gateway Factory
// =============================================================================

/**
 * Create the participant gateway.
 * Local-first proxy - all reads from IndexedDB, writes are optimistic.
 */
export function createParticipantGateway(participantId: string, projectId: string) {
	// Pending count for UI (offline records awaiting sync)
	let pendingCount = $state(0);

	// =========================================================================
	// Update Pending Count
	// =========================================================================

	async function updatePendingCount(): Promise<void> {
		if (typeof window === 'undefined') return;
		const db = await getDB();
		const pending = await db.getAllFromIndex('records', 'by_status', 'new');
		const modified = await db.getAllFromIndex('records', 'by_status', 'modified');
		const deleted = await db.getAllFromIndex('records', 'by_status', 'deleted');
		pendingCount = pending.length + modified.length + deleted.length;
	}

	// =========================================================================
	// FormData Helpers (extract File blobs -> files store, rest -> record)
	// =========================================================================

	/**
	 * Extract fields from FormData, separating File entries from plain values.
	 * File blobs are stored in the files store; filenames go into the record.
	 */
	async function extractFormData(
		collectionName: string,
		recordId: string,
		formData: FormData
	): Promise<Record<string, unknown>> {
		const plainData: Record<string, unknown> = {};
		const now = new Date().toISOString();

		for (const [key, value] of formData.entries()) {
			if (value instanceof File) {
				// Store the file blob separately
				const fileName = value.name;
				await storeFileBlob({
					key: buildFileKey(collectionName, recordId, key, fileName),
					collection: collectionName,
					recordId,
					fieldName: key,
					fileName,
					blob: value,
					mimeType: value.type,
					size: value.size,
					cachedAt: now,
					source: 'local',
					resolution: 'original'
				});
				// Store the filename in the record (PocketBase stores filenames as strings)
				plainData[key] = fileName;
			} else {
				plainData[key] = value;
			}
		}

		return plainData;
	}

	async function createFromFormData<T>(
		collectionName: string,
		formData: FormData
	): Promise<T> {
		const id = (formData.get('id') as string) || generateId();
		const now = new Date().toISOString();

		const plainData = await extractFormData(collectionName, id, formData);

		const record: CachedRecord = {
			...plainData,
			id,
			created: now,
			updated: now,
			_key: `${collectionName}/${id}`,
			_collection: collectionName,
			_status: 'new'
		};

		const db = await getDB();
		await db.put('records', record);
		await updatePendingCount();

		return cleanRecord(record) as unknown as T;
	}

	async function updateFromFormData<T>(
		collectionName: string,
		id: string,
		formData: FormData
	): Promise<T> {
		const db = await getDB();
		const key = `${collectionName}/${id}`;
		const existing = await db.get('records', key);

		if (!existing) {
			throw new Error(`Record not found: ${collectionName}/${id}`);
		}

		const now = new Date().toISOString();
		const plainData = await extractFormData(collectionName, id, formData);

		const updated: CachedRecord = {
			...existing,
			...plainData,
			updated: now,
			_status: existing._status === 'new' ? 'new' : 'modified'
		};

		await db.put('records', updated);
		await updatePendingCount();

		return cleanRecord(updated) as unknown as T;
	}

	// =========================================================================
	// Background Fetch (stale-while-revalidate pattern)
	// =========================================================================

	/**
	 * Fetch from PocketBase in background and update IndexedDB if data changed.
	 * This is fire-and-forget -- errors are logged but not thrown.
	 */
	function backgroundFetchFullList(name: string, options?: ListOptions): void {
		if (typeof window === 'undefined' || !navigator.onLine) return;

		const pb = getPocketBase();
		pb.collection(name)
			.getFullList(options)
			.then(async (serverRecords) => {
				const db = await getDB();
				let changed = false;

				for (const record of serverRecords) {
					const key = `${name}/${record.id}`;
					const existing = await db.get('records', key);

					// Skip if we have local modifications (don't overwrite pending changes)
					if (existing && existing._status !== 'unchanged') continue;

					// Check if data actually changed
					if (existing && existing.updated === record.updated) continue;

					const cached: CachedRecord = {
						...record,
						_key: key,
						_collection: name,
						_status: 'unchanged',
						_serverUpdated: record.updated as string
					};
					await db.put('records', cached);
					changed = true;
				}

				if (changed) {
					notifyDataChange(name);
				}
			})
			.catch((e) => {
				// Silent fail for background fetches
				console.debug(`Background fetch failed for ${name}:`, e);
			});
	}

	/**
	 * Background fetch for a single record.
	 */
	function backgroundFetchOne(name: string, id: string, options?: { expand?: string; fields?: string }): void {
		if (typeof window === 'undefined' || !navigator.onLine) return;

		const pb = getPocketBase();
		pb.collection(name)
			.getOne(id, options)
			.then(async (record) => {
				const db = await getDB();
				const key = `${name}/${record.id}`;
				const existing = await db.get('records', key);

				// Skip if we have local modifications
				if (existing && existing._status !== 'unchanged') return;

				// Check if data actually changed
				if (existing && existing.updated === record.updated) return;

				const cached: CachedRecord = {
					...record,
					_key: key,
					_collection: name,
					_status: 'unchanged',
					_serverUpdated: record.updated as string
				};
				await db.put('records', cached);
				notifyDataChange(name);
			})
			.catch((e) => {
				console.debug(`Background fetch one failed for ${name}/${id}:`, e);
			});
	}

	// =========================================================================
	// Collection Proxy Factory - Local-First for ANY collection
	// =========================================================================

	function collection<T = Record<string, unknown>>(name: string): CollectionProxy<T> {
		return {
			// -----------------------------------------------------------------
			// CREATE - Always optimistic (write to IndexedDB first)
			// -----------------------------------------------------------------
			async create(data: Partial<T> | FormData): Promise<T> {
				// Handle FormData (contains File objects that can't be stored directly)
				if (data instanceof FormData) {
					return await createFromFormData(name, data);
				}

				const id = (data as { id?: string }).id || generateId();
				const now = new Date().toISOString();

				const record: CachedRecord = {
					...(data as Record<string, unknown>),
					id,
					created: now,
					updated: now,
					_key: `${name}/${id}`,
					_collection: name,
					_status: 'new'
				};

				const db = await getDB();
				await db.put('records', record);
				await updatePendingCount();

				return cleanRecord(record) as unknown as T;
			},

			// -----------------------------------------------------------------
			// UPDATE - Always optimistic (write to IndexedDB first)
			// -----------------------------------------------------------------
			async update(id: string, data: Partial<T> | FormData): Promise<T> {
				// Handle FormData (contains File objects)
				if (data instanceof FormData) {
					return await updateFromFormData(name, id, data);
				}

				const db = await getDB();
				const key = `${name}/${id}`;
				const existing = await db.get('records', key);

				if (!existing) {
					throw new Error(`Record not found: ${name}/${id}`);
				}

				const now = new Date().toISOString();
				const updated: CachedRecord = {
					...existing,
					...(data as Record<string, unknown>),
					updated: now,
					_status: existing._status === 'new' ? 'new' : 'modified'
				};

				await db.put('records', updated);
				await updatePendingCount();

				return cleanRecord(updated) as unknown as T;
			},

			// -----------------------------------------------------------------
			// DELETE - Always optimistic (mark in IndexedDB first)
			// -----------------------------------------------------------------
			async delete(id: string): Promise<boolean> {
				const db = await getDB();
				const key = `${name}/${id}`;
				const existing = await db.get('records', key);

				if (!existing) {
					throw new Error(`Record not found: ${name}/${id}`);
				}

				if (existing._status === 'new') {
					// Never synced - remove entirely
					await db.delete('records', key);
				} else {
					// Mark for deletion (will sync delete to server)
					const deleted: CachedRecord = {
						...existing,
						_status: 'deleted'
					};
					await db.put('records', deleted);
				}

				await updatePendingCount();

				return true;
			},

			// -----------------------------------------------------------------
			// GET ONE - Local-first with background revalidation
			// -----------------------------------------------------------------
			async getOne(id: string, options?: { expand?: string; fields?: string }): Promise<T> {
				const db = await getDB();
				const record = await db.get('records', `${name}/${id}`);

				if (record && record._status !== 'deleted') {
					// Trigger background revalidation
					backgroundFetchOne(name, id, options);

					// Process expand parameter if present
					if (options?.expand) {
						const [expanded] = await expandRecords([record], options.expand);
						return cleanRecord(expanded as unknown as CachedRecord) as unknown as T;
					}

					return cleanRecord(record) as unknown as T;
				}

				// Not in cache -- try server directly (first load scenario)
				if (navigator.onLine) {
					const pb = getPocketBase();
					const serverRecord = await pb.collection(name).getOne(id, options);

					// Cache it
					const cached: CachedRecord = {
						...serverRecord,
						_key: `${name}/${serverRecord.id}`,
						_collection: name,
						_status: 'unchanged',
						_serverUpdated: serverRecord.updated as string
					};
					await db.put('records', cached);

					return serverRecord as T;
				}

				throw new Error(`Record not found: ${name}/${id}`);
			},

			// -----------------------------------------------------------------
			// GET LIST (paginated) - Local-first with background revalidation
			// -----------------------------------------------------------------
			async getList(
				page: number = 1,
				perPage: number = 30,
				options?: ListOptions
			): Promise<ListResult<T>> {
				const db = await getDB();
				const all = await db.getAllFromIndex('records', 'by_collection', name);
				const visible = all.filter((r) => r._status !== 'deleted');

				// Apply filter and sort using query module
				const filtered = query(visible, {
					filter: options?.filter,
					sort: options?.sort
				});

				const totalItems = filtered.length;
				const totalPages = Math.ceil(totalItems / perPage);
				const start = (page - 1) * perPage;
				let items = filtered.slice(start, start + perPage);

				// Process expand parameter if present
				if (options?.expand) {
					items = (await expandRecords(items, options.expand)) as CachedRecord[];
				}

				// Trigger background revalidation
				backgroundFetchFullList(name, options);

				return {
					page,
					perPage,
					totalItems,
					totalPages,
					items: items.map((r) => cleanRecord(r)) as unknown as T[]
				};
			},

			// -----------------------------------------------------------------
			// GET FULL LIST - Local-first with background revalidation
			// -----------------------------------------------------------------
			async getFullList(options?: ListOptions): Promise<T[]> {
				const db = await getDB();
				const all = await db.getAllFromIndex('records', 'by_collection', name);
				const visible = all.filter((r) => r._status !== 'deleted');

				// Apply filter and sort using query module
				const result = query(visible, {
					filter: options?.filter,
					sort: options?.sort
				});

				// Trigger background revalidation
				backgroundFetchFullList(name, options);

				// Process expand parameter if present
				if (options?.expand) {
					const expanded = await expandRecords(result, options.expand);
					return expanded.map((r) => cleanRecord(r as unknown as CachedRecord)) as unknown as T[];
				}

				return result.map((r) => cleanRecord(r)) as unknown as T[];
			},

			// -----------------------------------------------------------------
			// GET FIRST LIST ITEM - Local-first with background revalidation
			// -----------------------------------------------------------------
			async getFirstListItem(
				filter: string,
				options?: { expand?: string; fields?: string }
			): Promise<T> {
				const db = await getDB();
				const all = await db.getAllFromIndex('records', 'by_collection', name);
				const visible = all.filter((r) => r._status !== 'deleted');

				// Apply filter using query module
				const filtered = query(visible, { filter });
				const record = filtered[0];

				if (record) {
					// Trigger background revalidation
					backgroundFetchFullList(name, { filter, ...options });

					// Process expand parameter if present
					if (options?.expand) {
						const [expanded] = await expandRecords([record], options.expand);
						return cleanRecord(expanded as unknown as CachedRecord) as unknown as T;
					}

					return cleanRecord(record) as unknown as T;
				}

				// Not in cache -- try server directly
				if (navigator.onLine) {
					const pb = getPocketBase();
					const serverRecord = await pb.collection(name).getFirstListItem(filter, options);

					// Cache it
					const cached: CachedRecord = {
						...serverRecord,
						_key: `${name}/${serverRecord.id}`,
						_collection: name,
						_status: 'unchanged',
						_serverUpdated: serverRecord.updated as string
					};
					await db.put('records', cached);

					return serverRecord as T;
				}

				throw new Error(`No records found in ${name} matching filter: ${filter}`);
			}
		};
	}

	// =========================================================================
	// Initialization
	// =========================================================================

	async function init(): Promise<void> {
		await initDB();
		await updatePendingCount();
		await requestPersistentStorage();
	}

	// =========================================================================
	// Return Gateway Interface
	// =========================================================================

	return {
		// PocketBase-like fluent API (primary interface)
		collection,

		// Lifecycle
		init,

		// Pending changes count (for UI)
		get pendingCount() {
			return pendingCount;
		},

		// Refresh pending count (called after sync)
		updatePendingCount,

		// Context
		participantId,
		projectId
	};
}

// Type for the gateway
export type ParticipantGateway = ReturnType<typeof createParticipantGateway>;
