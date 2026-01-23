/**
 * Participant Gateway - Transparent Proxy to PocketBase
 *
 * Drop-in replacement for PocketBase SDK with offline support.
 * ANY collection works - no configuration needed.
 *
 * Online mode: Routes directly to PocketBase
 * Offline mode: Routes to IndexedDB
 *
 * Audit trail is handled at the tool level via workflow_instance_tool_usage collection.
 */

import { getDB, type CachedRecord } from './db';
import { getPocketBase } from '$lib/pocketbase';

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
	create(data: Partial<T>): Promise<T>;
	update(id: string, data: Partial<T>): Promise<T>;
	delete(id: string): Promise<boolean>;
	getOne(id: string, options?: { expand?: string; fields?: string }): Promise<T>;
	getList(page?: number, perPage?: number, options?: ListOptions): Promise<ListResult<T>>;
	getFullList(options?: ListOptions): Promise<T[]>;
	getFirstListItem(filter: string, options?: { expand?: string; fields?: string }): Promise<T>;
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
// Gateway Factory
// =============================================================================

/**
 * Create the participant gateway.
 * Transparent proxy to PocketBase - any collection works.
 */
export function createParticipantGateway(participantId: string, projectId: string) {
	// Online/offline mode - starts online
	let isOnline = $state(true);

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
	// Collection Proxy Factory - Generic for ANY collection
	// =========================================================================

	function collection<T = Record<string, unknown>>(name: string): CollectionProxy<T> {
		const pb = getPocketBase();

		return {
			// -----------------------------------------------------------------
			// CREATE
			// -----------------------------------------------------------------
			async create(data: Partial<T>): Promise<T> {
				if (isOnline) {
					// ONLINE: Write directly to PocketBase
					const result = await pb.collection(name).create(data as Record<string, unknown>);
					return result as T;
				}

				// OFFLINE: Store in IndexedDB
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

				return record as unknown as T;
			},

			// -----------------------------------------------------------------
			// UPDATE
			// -----------------------------------------------------------------
			async update(id: string, data: Partial<T>): Promise<T> {
				if (isOnline) {
					// ONLINE: Write directly to PocketBase
					const result = await pb.collection(name).update(id, data as Record<string, unknown>);
					return result as T;
				}

				// OFFLINE: Update in IndexedDB
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

				return updated as unknown as T;
			},

			// -----------------------------------------------------------------
			// DELETE
			// -----------------------------------------------------------------
			async delete(id: string): Promise<boolean> {
				if (isOnline) {
					// ONLINE: Delete directly from PocketBase
					await pb.collection(name).delete(id);
					return true;
				}

				// OFFLINE: Mark for deletion or remove if new
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
			// GET ONE
			// -----------------------------------------------------------------
			async getOne(id: string, options?: { expand?: string; fields?: string }): Promise<T> {
				if (isOnline) {
					return pb.collection(name).getOne(id, options) as Promise<T>;
				}

				// OFFLINE: Get from IndexedDB
				const db = await getDB();
				const record = await db.get('records', `${name}/${id}`);

				if (!record || record._status === 'deleted') {
					throw new Error(`Record not found: ${name}/${id}`);
				}

				return record as unknown as T;
			},

			// -----------------------------------------------------------------
			// GET LIST (paginated)
			// -----------------------------------------------------------------
			async getList(
				page: number = 1,
				perPage: number = 30,
				options?: ListOptions
			): Promise<ListResult<T>> {
				if (isOnline) {
					return pb.collection(name).getList(page, perPage, options) as Promise<ListResult<T>>;
				}

				// OFFLINE: Get from IndexedDB with pagination
				const db = await getDB();
				const all = await db.getAllFromIndex('records', 'by_collection', name);
				const visible = all.filter((r) => r._status !== 'deleted');

				const totalItems = visible.length;
				const totalPages = Math.ceil(totalItems / perPage);
				const start = (page - 1) * perPage;
				const items = visible.slice(start, start + perPage);

				return {
					page,
					perPage,
					totalItems,
					totalPages,
					items: items as unknown as T[]
				};
			},

			// -----------------------------------------------------------------
			// GET FULL LIST (all records)
			// -----------------------------------------------------------------
			async getFullList(options?: ListOptions): Promise<T[]> {
				if (isOnline) {
					return pb.collection(name).getFullList(options) as Promise<T[]>;
				}

				// OFFLINE: Get all from IndexedDB
				const db = await getDB();
				const all = await db.getAllFromIndex('records', 'by_collection', name);
				return all.filter((r) => r._status !== 'deleted') as unknown as T[];
			},

			// -----------------------------------------------------------------
			// GET FIRST LIST ITEM
			// -----------------------------------------------------------------
			async getFirstListItem(
				filter: string,
				options?: { expand?: string; fields?: string }
			): Promise<T> {
				if (isOnline) {
					return pb.collection(name).getFirstListItem(filter, options) as Promise<T>;
				}

				// OFFLINE: Can't parse filter syntax, return first visible
				const db = await getDB();
				const all = await db.getAllFromIndex('records', 'by_collection', name);
				const record = all.find((r) => r._status !== 'deleted');

				if (!record) {
					throw new Error(`No records found in ${name}`);
				}

				return record as unknown as T;
			}
		};
	}

	// =========================================================================
	// Initialization
	// =========================================================================

	async function init(): Promise<void> {
		await updatePendingCount();
	}

	// =========================================================================
	// Return Gateway Interface
	// =========================================================================

	return {
		// PocketBase-like fluent API (primary interface)
		collection,

		// Lifecycle
		init,

		// Online/offline status
		get isOnline() {
			return isOnline;
		},
		setOfflineMode(offline: boolean) {
			isOnline = !offline;
		},

		// Pending changes count (for UI)
		get pendingCount() {
			return pendingCount;
		},

		// Context
		participantId,
		projectId
	};
}

// Type for the gateway
export type ParticipantGateway = ReturnType<typeof createParticipantGateway>;
