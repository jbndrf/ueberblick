/**
 * FieldValueCache - In-memory index for workflow_instance_field_values
 *
 * Replaces the generic live() query for field values on the map page.
 * Loads all records from IndexedDB once, then patches incrementally when
 * individual records change (via enhanced DataChangeDetail notifications).
 * Falls back to a full reload on bulk changes (sync).
 *
 * IDB remains the source of truth -- this is a read-through materialized view.
 */

import { getDB, type CachedRecord } from './db';
import { onDataChange, notifyDataChange, type DataChangeDetail } from './gateway.svelte';
import { cleanRecord } from './utils';
import { getPocketBase } from '$lib/pocketbase';

function splitMultiValue(value: string): string[] {
	if (value.startsWith('[')) {
		try { return JSON.parse(value); } catch { /* fall through */ }
	}
	return [value];
}

const COLLECTION = 'workflow_instance_field_values';

export class FieldValueCache {
	// In-memory store: record.id -> cleaned record
	private store = new Map<string, any>();

	// Generation counter: incremented on every full reload.
	// Single-record handlers check this to discard stale async reads.
	private _generation = 0;

	private unsubscribe: (() => void) | null = null;
	private bulkDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	private rebuildDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	// Reactive state consumed by components
	records = $state<any[]>([]);
	byInstanceId = $state<Map<string, any[]>>(new Map());
	fieldValuesByKey = $state<Map<string, Set<string>>>(new Map());
	loading = $state(true);
	/** Live counter updated during background fetch so the UI can show progress */
	loadedCount = $state(0);

	async init(): Promise<void> {
		await this.fullReload();

		// If IDB had no sync_metadata for this collection (fresh login),
		// keep loading=true until the background fetch from PocketBase completes.
		let needsBackgroundFetch = false;
		if (typeof window !== 'undefined' && navigator.onLine) {
			const db = await getDB();
			const meta = await db.get('sync_metadata', COLLECTION);
			if (!meta) {
				needsBackgroundFetch = true;
				this.backgroundFetchAll();
			}
		}

		if (!needsBackgroundFetch) {
			this.loading = false;
		}

		this.unsubscribe = onDataChange((detail: DataChangeDetail) => {
			if (detail.collection !== COLLECTION) return;

			if (detail.recordId && detail.action) {
				this.handleSingleChange(detail.recordId, detail.action);
			} else {
				// Bulk change (sync) -- debounced full reload
				if (this.bulkDebounceTimer) clearTimeout(this.bulkDebounceTimer);
				this.bulkDebounceTimer = setTimeout(() => this.fullReload(), 150);
			}
		});
	}

	/**
	 * Fetch all field values from PocketBase and store in IDB.
	 * Uses paginated requests so `loadedCount` updates after each page,
	 * giving the user visible progress in the header.
	 */
	private backgroundFetchAll(): void {
		const pb = getPocketBase();
		const PAGE_SIZE = 500;

		(async () => {
			try {
				const db = await getDB();
				let changed = false;
				let page = 1;
				let totalFetched = 0;

				while (true) {
					const result = await pb.collection(COLLECTION).getList(page, PAGE_SIZE);

					for (const record of result.items) {
						const key = `${COLLECTION}/${record.id}`;
						const existing = await db.get('records', key);

						if (existing && existing._status !== 'unchanged') continue;
						if (existing && existing.updated === record.updated) continue;

						const cached: CachedRecord = {
							...record,
							id: record.id as string,
							_key: key,
							_collection: COLLECTION,
							_status: 'unchanged',
							_serverUpdated: record.updated as string
						};
						await db.put('records', cached);
						changed = true;
					}

					totalFetched += result.items.length;
					this.loadedCount = totalFetched;

					if (page >= result.totalPages) break;
					page++;
				}

				if (changed) {
					await this.fullReload();
				}
				this.loading = false;
			} catch (e) {
				console.debug('FieldValueCache background fetch failed:', e);
				this.loading = false;
			}
		})();
	}

	private async fullReload(): Promise<void> {
		this._generation++;
		const t0 = performance.now();
		const db = await getDB();
		const all = await db.getAllFromIndex('records', 'by_collection', COLLECTION);
		const t1 = performance.now();

		this.store.clear();
		for (const r of all) {
			if (r._status !== 'deleted') {
				this.store.set(r.id, cleanRecord(r as CachedRecord));
			}
		}
		const t2 = performance.now();
		this.rebuildIndexes();
		const t3 = performance.now();
		console.log(`[FieldValueCache] fullReload: IDB read ${(t1-t0).toFixed(1)}ms, store build ${(t2-t1).toFixed(1)}ms, indexes ${(t3-t2).toFixed(1)}ms, ${this.store.size} records`);
	}

	private async handleSingleChange(recordId: string, action: string): Promise<void> {
		const gen = this._generation;

		if (action === 'delete') {
			this.store.delete(recordId);
		} else {
			const db = await getDB();
			const record = await db.get('records', `${COLLECTION}/${recordId}`);

			// Stale check: if a full reload happened while we were reading, discard
			if (gen !== this._generation) return;

			if (record && record._status !== 'deleted') {
				this.store.set(record.id, cleanRecord(record));
			} else {
				this.store.delete(recordId);
			}
		}

		// Debounce index rebuild for rapid successive changes
		// (e.g. form fill creating 15 field values in quick succession)
		if (this.rebuildDebounceTimer) clearTimeout(this.rebuildDebounceTimer);
		this.rebuildDebounceTimer = setTimeout(() => this.rebuildIndexes(), 50);
	}

	private rebuildIndexes(): void {
		const byInst = new Map<string, any[]>();
		const byKey = new Map<string, Set<string>>();
		const allRecords: any[] = [];

		for (const fv of this.store.values()) {
			allRecords.push(fv);

			// byInstanceId
			const instId = fv.instance_id;
			if (instId) {
				let arr = byInst.get(instId);
				if (!arr) { arr = []; byInst.set(instId, arr); }
				arr.push(fv);
			}

			// fieldValuesByKey (unique values per field)
			if (fv.field_key && fv.value) {
				let set = byKey.get(fv.field_key);
				if (!set) { set = new Set(); byKey.set(fv.field_key, set); }
				for (const v of splitMultiValue(fv.value)) {
					set.add(v);
				}
			}
		}

		this.records = allRecords;
		this.byInstanceId = byInst;
		this.fieldValuesByKey = byKey;
	}

	/** Lookup by instance ID -- reads directly from store (always fresh) */
	getForInstance(instanceId: string): any[] {
		const results: any[] = [];
		for (const fv of this.store.values()) {
			if (fv.instance_id === instanceId) {
				results.push(fv);
			}
		}
		return results;
	}

	destroy(): void {
		this.unsubscribe?.();
		if (this.bulkDebounceTimer) clearTimeout(this.bulkDebounceTimer);
		if (this.rebuildDebounceTimer) clearTimeout(this.rebuildDebounceTimer);
	}
}
