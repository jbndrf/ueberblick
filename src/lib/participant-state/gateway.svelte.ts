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
import { generateId, cleanRecord } from './utils';

// =============================================================================
// Type Definitions
// =============================================================================

/** List options matching PocketBase SDK */
interface ListOptions {
	filter?: string;
	sort?: string;
	expand?: string;
	fields?: string;
	/** Controls when the initial IDB read fires: 'critical' = immediate, 'normal' = next microtask, 'deferred' = setTimeout */
	priority?: 'critical' | 'normal' | 'deferred';
}

/** Paginated list result matching PocketBase SDK */
interface ListResult<T> {
	page: number;
	perPage: number;
	totalItems: number;
	totalPages: number;
	items: T[];
}

/** Reactive live query -- records stay up-to-date automatically */
export interface LiveQuery<T = Record<string, unknown>> {
	readonly records: T[];
	readonly loading: boolean;
	readonly fetchProgress: { loaded: number; total: number } | null;
	destroy(): void;
}

/** Reactive live query for a single record */
export interface LiveQueryOne<T = Record<string, unknown>> {
	readonly record: T | null;
	readonly loading: boolean;
	destroy(): void;
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
	live(options?: ListOptions): LiveQuery<T>;
	liveOne(id: string, options?: { expand?: string; fields?: string }): LiveQueryOne<T>;
}

// =============================================================================
// Data Change Notification
// =============================================================================

export interface DataChangeDetail {
	collection: string;
	recordId?: string;
	action?: 'create' | 'update' | 'delete';
}

type DataChangeListener = (detail: DataChangeDetail) => void;
const dataChangeListeners = new Set<DataChangeListener>();

/**
 * Subscribe to data changes. Called when background fetch updates IndexedDB.
 * Returns unsubscribe function.
 */
export function onDataChange(listener: DataChangeListener): () => void {
	dataChangeListeners.add(listener);
	return () => dataChangeListeners.delete(listener);
}

export function notifyDataChange(collection: string, recordId?: string, action?: 'create' | 'update' | 'delete'): void {
	ensureCollectionInCache(collection);
	const detail: DataChangeDetail = { collection, recordId, action };
	for (const listener of dataChangeListeners) {
		try {
			listener(detail);
		} catch (e) {
			console.error('Data change listener error:', e);
		}
	}
}

// =============================================================================
// Live Collection Tracking
// =============================================================================

/**
 * Track which collections have active live queries.
 * Used to suppress redundant background fetches from getFullList/getOne
 * when a live query is already keeping the data fresh.
 */
const liveCollections = new Map<string, number>(); // collection name -> active live query count

function registerLiveCollection(name: string): void {
	liveCollections.set(name, (liveCollections.get(name) || 0) + 1);
}

function unregisterLiveCollection(name: string): void {
	const count = (liveCollections.get(name) || 1) - 1;
	if (count <= 0) {
		liveCollections.delete(name);
	} else {
		liveCollections.set(name, count);
	}
}

// =============================================================================
// Collection Name Cache (for expandRecords)
// =============================================================================

// Cached list of collection names present in IDB. Populated lazily on first
// expand call, then kept up-to-date via ensureCollectionInCache().
let cachedCollectionNames: string[] | null = null;

async function getKnownCollections(db: Awaited<ReturnType<typeof getDB>>): Promise<string[]> {
	if (cachedCollectionNames) return cachedCollectionNames;

	const names: string[] = [];
	const tx = db.transaction('records', 'readonly');
	const idx = tx.store.index('by_collection');
	let cursor = await idx.openKeyCursor();
	while (cursor) {
		const col = cursor.key as string;
		names.push(col);
		cursor = await idx.openKeyCursor(IDBKeyRange.lowerBound(col, true));
	}
	cachedCollectionNames = names;
	return names;
}

function ensureCollectionInCache(collection: string): void {
	if (cachedCollectionNames && !cachedCollectionNames.includes(collection)) {
		cachedCollectionNames.push(collection);
	}
}

// =============================================================================
// Offline Expand Support
// =============================================================================

/**
 * Expand relation fields on cached records by joining related records from IndexedDB.
 * Mimics PocketBase's expand functionality for offline mode.
 * Builds a one-time id->record lookup map to avoid repeated full-table scans.
 */
async function expandRecords<T>(
	records: T[],
	expandParam: string | undefined
): Promise<T[]> {
	if (!expandParam) return records;

	const db = await getDB();
	const fieldsToExpand = expandParam.split(',').map((f) => f.trim());

	// Collect only the unique IDs we actually need to expand
	// (e.g. 20 category IDs from 3200 markers, instead of loading ALL records)
	const neededIds = new Set<string>();
	for (const record of records) {
		for (const field of fieldsToExpand) {
			const relationValue = (record as Record<string, unknown>)[field];
			if (!relationValue) continue;
			if (typeof relationValue === 'string') {
				neededIds.add(relationValue);
			} else if (Array.isArray(relationValue)) {
				for (const id of relationValue) {
					if (typeof id === 'string') neededIds.add(id);
				}
			}
		}
	}

	if (neededIds.size === 0) return records;

	// Build lookup map using direct key lookups.
	// IDB keys are "{collection}/{id}" but we only have bare ids.
	// Use cached collection names (populated once, updated incrementally)
	// to try direct db.get() for each needed ID.
	const recordById = new Map<string, CachedRecord>();
	const knownCollections = await getKnownCollections(db);

	if (knownCollections.length > 0) {
		const lookupPromises: Promise<void>[] = [];
		for (const id of neededIds) {
			lookupPromises.push((async () => {
				for (const col of knownCollections) {
					const r = await db.get('records', `${col}/${id}`);
					if (r && r._status !== 'deleted') {
						recordById.set(r.id, r);
						break;
					}
				}
			})());
		}
		await Promise.all(lookupPromises);
	}

	return records.map((record) => {
		const expanded: Record<string, unknown> = {};

		for (const field of fieldsToExpand) {
			const relationValue = (record as Record<string, unknown>)[field];

			if (!relationValue) continue;

			// Handle single relation (string ID)
			if (typeof relationValue === 'string') {
				const relatedRecord = recordById.get(relationValue);
				if (relatedRecord) {
					expanded[field] = cleanRecord(relatedRecord);
				}
			}
			// Handle multi-relation (array of IDs)
			else if (Array.isArray(relationValue)) {
				const relatedRecords = relationValue
					.filter((id): id is string => typeof id === 'string')
					.map((id) => {
						const relatedRecord = recordById.get(id);
						return relatedRecord ? cleanRecord(relatedRecord) : null;
					})
					.filter(Boolean);
				expanded[field] = relatedRecords;
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
	});
}

/** Strip the custom `priority` field before passing options to PocketBase SDK */
function toPbOptions(options?: ListOptions): Omit<ListOptions, 'priority'> | undefined {
	if (!options) return undefined;
	const { priority: _, ...rest } = options;
	return rest;
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
		// Use count() instead of getAll().length to avoid deserializing all records
		const tx = db.transaction('records', 'readonly');
		const idx = tx.store.index('by_status');
		const [p, m, d] = await Promise.all([
			idx.count('new'),
			idx.count('modified'),
			idx.count('deleted')
		]);
		pendingCount = p + m + d;
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
		notifyDataChange(collectionName, id, 'create');

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
		notifyDataChange(collectionName, id, 'update');

		return cleanRecord(updated) as unknown as T;
	}

	// =========================================================================
	// Background Fetch (stale-while-revalidate pattern)
	// =========================================================================

	type PageCallback = (loaded: number, total: number) => void;

	/**
	 * Fetch from PocketBase in background and update IndexedDB if data changed.
	 * This is fire-and-forget -- errors are logged but not thrown.
	 * Fetches page-by-page so data appears progressively on the map.
	 */
	function backgroundFetchFullList(name: string, options?: ListOptions, onPage?: PageCallback): void {
		if (typeof window === 'undefined' || !navigator.onLine) return;

		// Skip if a live query is active for this collection and we already have sync data.
		// The live query's own background fetch + realtime SSE keep data fresh.
		if (liveCollections.has(name)) {
			getDB().then(db => db.get('sync_metadata', name)).then(meta => {
				if (meta) return; // Already synced, live query handles updates
				doBackgroundFetchFullList(name, options, onPage);
			});
			return;
		}

		doBackgroundFetchFullList(name, options, onPage);
	}

	async function doBackgroundFetchFullList(name: string, options?: ListOptions, onPage?: PageCallback): Promise<void> {
		const pb = getPocketBase();
		const perPage = 500;
		let page = 1;
		let totalPages = 1;
		let latestTimestamp = '';
		const t0 = performance.now();

		try {
			do {
				const result = await pb.collection(name).getList(page, perPage, toPbOptions(options));
				totalPages = result.totalPages;
				console.log(`[BgFetch:${name}] page ${page}/${totalPages}: ${result.items.length} items (total: ${result.totalItems})`);

				// Batch write this page into IDB in a single transaction
				const db = await getDB();
				const tx = db.transaction('records', 'readwrite');
				const store = tx.objectStore('records');
				let changed = false;

				for (const record of result.items) {
					const key = `${name}/${record.id}`;
					const existing = await store.get(key);

					// Track latest timestamp for sync_metadata
					if ((record.updated as string) > latestTimestamp) {
						latestTimestamp = record.updated as string;
					}

					// Don't overwrite local modifications, but update _serverUpdated
					if (existing && existing._status !== 'unchanged') {
						if (record.updated && existing._serverUpdated !== (record.updated as string)) {
							existing._serverUpdated = record.updated as string;
							store.put(existing);
						}
						continue;
					}

					// Check if data actually changed
					if (existing && existing.updated === record.updated) continue;

					const cached: CachedRecord = {
						...record,
						_key: key,
						_collection: name,
						_status: 'unchanged',
						_serverUpdated: record.updated as string
					};
					store.put(cached);
					changed = true;
				}

				await tx.done;

				// Notify after each page so live queries re-read from IDB
				// and markers appear progressively on the map
				if (changed) {
					console.log(`[BgFetch:${name}] page ${page} changed, notifying`);
					notifyDataChange(name);
				}

				onPage?.(Math.min(page * perPage, result.totalItems), result.totalItems);
				page++;
			} while (page <= totalPages);

			// Write sync_metadata so subsequent page refreshes skip the background fetch
			// and delta sync can use lastSyncTimestamp for efficient updates
			if (latestTimestamp) {
				const db = await getDB();
				await db.put('sync_metadata', {
					collection: name,
					lastSyncTimestamp: latestTimestamp
				});
			}

			console.log(`[BgFetch:${name}] complete in ${(performance.now() - t0).toFixed(0)}ms`);
			// Final notification ensures loading state clears even if last page had no changes
			notifyDataChange(name);
			onPage?.(0, 0); // Signal completion (0,0 = done)
		} catch (e) {
			notifyDataChange(name);
			onPage?.(0, 0);
			console.debug(`Background fetch failed for ${name}:`, e);
		}
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

				// Don't overwrite local modifications, but update _serverUpdated
				if (existing && existing._status !== 'unchanged') {
					if (record.updated && existing._serverUpdated !== (record.updated as string)) {
						existing._serverUpdated = record.updated as string;
						await db.put('records', existing);
					}
					return;
				}

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
				notifyDataChange(name, record.id as string, 'update');
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
					...JSON.parse(JSON.stringify(data)),
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
				notifyDataChange(name, id, 'create');

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
					...JSON.parse(JSON.stringify(data)),
					updated: now,
					_status: existing._status === 'new' ? 'new' : 'modified'
				};

				await db.put('records', updated);
				await updatePendingCount();
				notifyDataChange(name, id, 'update');

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
				notifyDataChange(name, id, 'delete');

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
			},

			// -----------------------------------------------------------------
			// LIVE - Reactive query that auto-updates from IndexedDB
			// -----------------------------------------------------------------
			live(options?: ListOptions): LiveQuery<T> {
				let records = $state<T[]>([]);
				let loading = $state(true);
				let fetchProgress = $state<{ loaded: number; total: number } | null>(null);
				let debounceTimer: ReturnType<typeof setTimeout> | null = null;

				// Track this collection as having an active live query
				registerLiveCollection(name);

				async function readFromDB() {
					const t0 = performance.now();
					const db = await getDB();
					const all = await db.getAllFromIndex('records', 'by_collection', name);
					const t1 = performance.now();
					const visible = all.filter((r) => r._status !== 'deleted');

					const result = query(visible, {
						filter: options?.filter,
						sort: options?.sort
					});

					let processed: T[];
					if (options?.expand) {
						const expanded = await expandRecords(result, options.expand);
						processed = expanded.map((r) => cleanRecord(r as unknown as CachedRecord)) as unknown as T[];
					} else {
						processed = result.map((r) => cleanRecord(r)) as unknown as T[];
					}
					const t2 = performance.now();

					records = processed;
					loading = false;
					if (t2 - t0 > 5) {
						console.log(`[LiveQuery:${name}] readFromDB: IDB ${(t1-t0).toFixed(1)}ms, process ${(t2-t1).toFixed(1)}ms, ${all.length} raw / ${processed.length} results`);
					}
				}

				// Initial read from IndexedDB (skip on server -- no IndexedDB)
				if (typeof window !== 'undefined') {
					const priority = options?.priority ?? 'critical';
					const scheduleRead = () => {
						(async () => {
							const db = await getDB();
							const meta = await db.get('sync_metadata', name);
							// Always read from IDB first (may be empty on fresh login, that's OK)
							await readFromDB();
							// If fresh collection, start paginated fetch -- data arrives progressively
							if (!meta && navigator.onLine) {
								// Set progress immediately so consumers know a fetch is in flight
								fetchProgress = { loaded: 0, total: 0 };
								backgroundFetchFullList(name, options, (loaded, total) => {
									if (loaded === 0 && total === 0) {
										// Signal completion
										fetchProgress = null;
									} else {
										fetchProgress = { loaded, total };
									}
								});
							}
						})();
					};

					if (priority === 'critical') {
						scheduleRead();
					} else if (priority === 'normal') {
						queueMicrotask(scheduleRead);
					} else {
						// 100ms delay lets critical/normal queries run first
						setTimeout(scheduleRead, 100);
					}
				}

				// Incremental single-record patch: read one record from IDB,
				// update it in the existing array, and re-expand only that record.
				// Avoids re-reading all 3218 records for a single-record change.
				async function patchSingleRecord(recordId: string, action: string) {
					const db = await getDB();

					if (action === 'delete') {
						const idx = records.findIndex((r: any) => r.id === recordId);
						if (idx !== -1) {
							records = [...records.slice(0, idx), ...records.slice(idx + 1)] as T[];
						}
						return;
					}

					const cached = await db.get('records', `${name}/${recordId}`);
					if (!cached || cached._status === 'deleted') {
						// Record deleted or not found -- remove from array
						const idx = records.findIndex((r: any) => r.id === recordId);
						if (idx !== -1) {
							records = [...records.slice(0, idx), ...records.slice(idx + 1)] as T[];
						}
						return;
					}

					// Check if record passes the filter
					const [filtered] = query([cached], { filter: options?.filter });
					if (!filtered) {
						// Record no longer matches filter -- remove if present
						const idx = records.findIndex((r: any) => r.id === recordId);
						if (idx !== -1) {
							records = [...records.slice(0, idx), ...records.slice(idx + 1)] as T[];
						}
						return;
					}

					// Expand if needed
					let processed: T;
					if (options?.expand) {
						const [expanded] = await expandRecords([filtered], options.expand);
						processed = cleanRecord(expanded as unknown as CachedRecord) as unknown as T;
					} else {
						processed = cleanRecord(filtered) as unknown as T;
					}

					// Patch or append
					const idx = records.findIndex((r: any) => r.id === recordId);
					if (idx !== -1) {
						const updated = [...records];
						updated[idx] = processed;
						records = updated as T[];
					} else {
						// New record matching filter -- append (sort will be off, but
						// next full readFromDB on reconnect/focus will fix order)
						records = [...records, processed] as T[];
					}
				}

				// Subscribe to data changes for this collection
				const unsubscribe = onDataChange((detail) => {
					if (detail.collection !== name) return;

					// Single-record change: patch incrementally (fast)
					if (detail.recordId && detail.action) {
						if (debounceTimer) clearTimeout(debounceTimer);
						debounceTimer = setTimeout(() => {
							patchSingleRecord(detail.recordId!, detail.action!);
						}, 16);
						return;
					}

					// Bulk change: full re-read (debounced)
					if (debounceTimer) clearTimeout(debounceTimer);
					debounceTimer = setTimeout(() => {
						console.log(`[LiveQuery:${name}] bulk re-read triggered`);
						readFromDB();
					}, 100);
				});

				return {
					get records() { return records; },
					get loading() { return loading; },
					get fetchProgress() { return fetchProgress; },
					destroy() {
						unregisterLiveCollection(name);
						unsubscribe();
						if (debounceTimer) clearTimeout(debounceTimer);
					}
				};
			},

			// -----------------------------------------------------------------
			// LIVE ONE - Reactive single-record query
			// -----------------------------------------------------------------
			liveOne(id: string, options?: { expand?: string; fields?: string }): LiveQueryOne<T> {
				let record = $state<T | null>(null);
				let loading = $state(true);
				let debounceTimer: ReturnType<typeof setTimeout> | null = null;

				async function readFromDB() {
					const db = await getDB();
					const cached = await db.get('records', `${name}/${id}`);

					if (cached && cached._status !== 'deleted') {
						if (options?.expand) {
							const [expanded] = await expandRecords([cached], options.expand);
							record = cleanRecord(expanded as unknown as CachedRecord) as unknown as T;
						} else {
							record = cleanRecord(cached) as unknown as T;
						}
					} else {
						record = null;
					}
					loading = false;
				}

				// Initial read (skip on server -- no IndexedDB)
				if (typeof window !== 'undefined') {
					readFromDB();

					// Background fetch if no sync_metadata
					(async () => {
						const db = await getDB();
						const meta = await db.get('sync_metadata', name);
						if (!meta) {
							backgroundFetchOne(name, id, options);
						}
					})();
				}

				// Subscribe to data changes
				const unsubscribe = onDataChange((detail) => {
					if (detail.collection !== name) return;
					if (debounceTimer) clearTimeout(debounceTimer);
					debounceTimer = setTimeout(() => {
						readFromDB();
					}, 100);
				});

				return {
					get record() { return record; },
					get loading() { return loading; },
					destroy() {
						unsubscribe();
						if (debounceTimer) clearTimeout(debounceTimer);
					}
				};
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
