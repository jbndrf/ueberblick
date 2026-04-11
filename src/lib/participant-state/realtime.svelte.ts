/**
 * PocketBase Realtime Subscriptions
 *
 * When online, subscribes to realtime events for near-instant sync.
 * Updates IndexedDB directly and notifies the UI of changes.
 * On reconnect (PB_CONNECT), triggers a catch-up sync to fill gaps.
 */

import { getPocketBase } from '$lib/pocketbase';
import { getDB, type CachedRecord } from './db';
import { notifyDataChange } from './gateway.svelte';

// =============================================================================
// State
// =============================================================================

let subscribedCollections: string[] = [];
let unsubscribeFns: Array<() => void> = [];
let isConnected = $state(false);

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

		// Don't overwrite local modifications, but track the latest server
		// timestamp so conflict detection doesn't flag server-side hook updates
		// (e.g. bumpLastActivity) as conflicts.
		if (existing && existing._status !== 'unchanged') {
			if (event.record.updated && existing._serverUpdated !== event.record.updated) {
				existing._serverUpdated = event.record.updated as string;
				await db.put('records', existing);
			}
			return;
		}

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

		// Notify gateway listeners (map page etc.) that data changed
		notifyDataChange(collection, event.record.id as string, event.action as 'create' | 'update');
	} else if (event.action === 'delete') {
		const existing = await db.get('records', key);

		// Only delete if it's an unchanged record (don't delete local modifications)
		if (existing && existing._status === 'unchanged') {
			await db.delete('records', key);
			notifyDataChange(collection, event.record.id as string, 'delete');
		}
	}
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

// =============================================================================
// Network-Aware Lifecycle
// =============================================================================

/**
 * Set up realtime with automatic reconnection on network changes.
 * Subscribes to PB_CONNECT for catch-up sync on reconnect.
 * Returns cleanup function.
 */
export function setupRealtime(
	collections: string[],
	onReconnect?: () => void
): () => void {
	const pb = getPocketBase();

	// Subscribe to PB_CONNECT for reconnect detection
	// PB_CONNECT fires on initial connect AND on every reconnect
	let pbConnectCount = 0;
	pb.realtime.subscribe('PB_CONNECT', () => {
		pbConnectCount++;
		console.log(`PB_CONNECT received (count: ${pbConnectCount})`);
		isConnected = true;
		// Skip the very first connect (initial load), only catch up on reconnects
		if (pbConnectCount > 1 && onReconnect) {
			onReconnect();
		}
	});

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
		pb.realtime.unsubscribe('PB_CONNECT').catch(() => {});
		window.removeEventListener('online', handleOnline);
		window.removeEventListener('offline', handleOffline);
	};
}
