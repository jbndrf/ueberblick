/**
 * PocketBase Realtime Subscriptions
 *
 * When online, subscribes to realtime events for near-instant sync.
 * Updates IndexedDB directly and notifies the UI of changes.
 * Falls back to periodic sync loop when offline or on missed events.
 */

import { getPocketBase } from '$lib/pocketbase';
import { getDB, type CachedRecord } from './db';
import { onDataChange } from './gateway.svelte';

// =============================================================================
// State
// =============================================================================

let subscribedCollections: string[] = [];
let unsubscribeFns: Array<() => void> = [];
let isConnected = $state(false);

export function getRealtimeConnected(): boolean {
	return isConnected;
}

// =============================================================================
// Record Handling
// =============================================================================

/**
 * Handle a realtime event: upsert or delete record in IndexedDB.
 */
async function handleRealtimeEvent(
	collection: string,
	event: { action: string; record: Record<string, unknown> }
): Promise<void> {
	const db = await getDB();
	const key = `${collection}/${event.record.id}`;

	if (event.action === 'create' || event.action === 'update') {
		const existing = await db.get('records', key);

		// Don't overwrite local modifications
		if (existing && existing._status !== 'unchanged') return;

		// Don't re-write if nothing changed
		if (existing && existing.updated === event.record.updated) return;

		const cached: CachedRecord = {
			...event.record,
			id: event.record.id as string,
			_key: key,
			_collection: collection,
			_status: 'unchanged',
			_serverUpdated: event.record.updated as string
		};
		await db.put('records', cached);

		// Notify listeners that data changed
		notifyRealtimeChange(collection);
	} else if (event.action === 'delete') {
		const existing = await db.get('records', key);

		// Only delete if it's an unchanged record (don't delete local modifications)
		if (existing && existing._status === 'unchanged') {
			await db.delete('records', key);
			notifyRealtimeChange(collection);
		}
	}
}

// Re-use the gateway's data change notification system
function notifyRealtimeChange(collection: string): void {
	// The gateway's onDataChange listeners will be notified
	// We call the same notification mechanism
	for (const listener of realtimeChangeListeners) {
		try {
			listener(collection);
		} catch (e) {
			console.error('Realtime change listener error:', e);
		}
	}
}

type RealtimeChangeListener = (collection: string) => void;
const realtimeChangeListeners = new Set<RealtimeChangeListener>();

/**
 * Subscribe to realtime data changes.
 * Returns unsubscribe function.
 */
export function onRealtimeChange(listener: RealtimeChangeListener): () => void {
	realtimeChangeListeners.add(listener);
	return () => realtimeChangeListeners.delete(listener);
}

// =============================================================================
// Connection Management
// =============================================================================

/**
 * Connect to PocketBase realtime for the given collections.
 * Subscribes to create/update/delete events for each collection.
 */
export async function connect(collections: string[]): Promise<void> {
	// Disconnect any existing subscriptions first
	disconnect();

	subscribedCollections = collections;
	const pb = getPocketBase();

	for (const collection of collections) {
		try {
			// PocketBase SDK subscribe returns an unsubscribe function
			await pb.collection(collection).subscribe('*', (event) => {
				handleRealtimeEvent(collection, event).catch((e) => {
					console.error(`Realtime event handling failed for ${collection}:`, e);
				});
			});

			unsubscribeFns.push(() => {
				pb.collection(collection).unsubscribe('*').catch(() => {
					// Ignore unsubscribe errors (connection may already be closed)
				});
			});
		} catch (e) {
			console.debug(`Realtime subscription failed for ${collection}:`, e);
		}
	}

	isConnected = true;
	console.log(`Realtime connected to ${collections.length} collections`);
}

/**
 * Disconnect all realtime subscriptions.
 */
export function disconnect(): void {
	for (const unsub of unsubscribeFns) {
		try {
			unsub();
		} catch {
			// Ignore cleanup errors
		}
	}
	unsubscribeFns = [];
	subscribedCollections = [];
	isConnected = false;
}

/**
 * Reconnect after network restore.
 * Re-subscribes to all previously connected collections.
 */
export async function reconnect(): Promise<void> {
	if (subscribedCollections.length === 0) return;

	const collections = [...subscribedCollections];
	disconnect();
	await connect(collections);
}

// =============================================================================
// Network-Aware Lifecycle
// =============================================================================

/**
 * Set up realtime with automatic reconnection on network changes.
 * Returns cleanup function.
 */
export function setupRealtime(collections: string[]): () => void {
	// Connect immediately if online
	if (navigator.onLine) {
		connect(collections);
	}

	const handleOnline = () => {
		console.log('Network restored, reconnecting realtime');
		connect(collections);
	};

	const handleOffline = () => {
		console.log('Network lost, realtime subscriptions will auto-drop');
		isConnected = false;
	};

	window.addEventListener('online', handleOnline);
	window.addEventListener('offline', handleOffline);

	return () => {
		disconnect();
		window.removeEventListener('online', handleOnline);
		window.removeEventListener('offline', handleOffline);
	};
}
