/**
 * Network Detection with Svelte 5 Runes
 *
 * Provides reactive network status using $state.
 */

import type { NetworkStatus } from './types';

// =============================================================================
// Global Network State
// =============================================================================

// Global reactive network status
let networkState = $state<NetworkStatus>({
	online: typeof navigator !== 'undefined' ? navigator.onLine : true,
	type: 'unknown'
});

/**
 * Get reactive network status
 * This returns the reactive $state object - changes will automatically trigger updates
 */
export function getNetworkStatus(): NetworkStatus {
	return networkState;
}

// =============================================================================
// Non-Reactive Utilities
// =============================================================================

/**
 * Check if currently online (non-reactive snapshot)
 */
export function isOnline(): boolean {
	return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/**
 * Check if currently offline (non-reactive snapshot)
 */
export function isOffline(): boolean {
	return !isOnline();
}

/**
 * Get connection type if available
 */
export function getConnectionType(): string | undefined {
	if (typeof navigator === 'undefined') return undefined;
	const connection = getNetworkConnection();
	return connection?.type;
}

/**
 * Get effective connection type (4g, 3g, 2g, slow-2g)
 */
export function getEffectiveType(): '4g' | '3g' | '2g' | 'slow-2g' | undefined {
	if (typeof navigator === 'undefined') return undefined;
	const connection = getNetworkConnection();
	return connection?.effectiveType;
}

/**
 * Check if connection is considered fast (4g or wifi)
 */
export function isFastConnection(): boolean {
	const effectiveType = getEffectiveType();
	const type = getConnectionType();
	return effectiveType === '4g' || type === 'wifi' || type === 'ethernet';
}

/**
 * Check if connection is considered slow (2g or slow-2g)
 */
export function isSlowConnection(): boolean {
	const effectiveType = getEffectiveType();
	return effectiveType === '2g' || effectiveType === 'slow-2g';
}

// =============================================================================
// Event Listeners
// =============================================================================

let listenersInitialized = false;

/**
 * Initialize network event listeners (call once on app startup)
 */
export function initNetworkListeners(): () => void {
	if (typeof window === 'undefined') {
		return () => {};
	}

	if (listenersInitialized) {
		return () => {};
	}

	listenersInitialized = true;

	const updateStatus = () => {
		const connection = getNetworkConnection();

		networkState = {
			online: navigator.onLine,
			type: connection?.type || 'unknown',
			effectiveType: connection?.effectiveType
		};
	};

	// Listen for online/offline events
	window.addEventListener('online', updateStatus);
	window.addEventListener('offline', updateStatus);

	// Listen for connection changes if supported
	const connection = getNetworkConnection();
	if (connection) {
		connection.addEventListener('change', updateStatus);
	}

	// Initial update
	updateStatus();

	// Return cleanup function
	return () => {
		window.removeEventListener('online', updateStatus);
		window.removeEventListener('offline', updateStatus);
		if (connection) {
			connection.removeEventListener('change', updateStatus);
		}
		listenersInitialized = false;
	};
}

// =============================================================================
// Promise-Based Utilities
// =============================================================================

/**
 * Wait for online connection
 * Resolves immediately if already online, otherwise waits for 'online' event
 */
export function waitForOnline(timeoutMs?: number): Promise<void> {
	return new Promise((resolve, reject) => {
		if (typeof navigator === 'undefined' || navigator.onLine) {
			resolve();
			return;
		}

		let timeoutId: ReturnType<typeof setTimeout> | undefined;

		const onlineHandler = () => {
			if (timeoutId) clearTimeout(timeoutId);
			window.removeEventListener('online', onlineHandler);
			resolve();
		};

		window.addEventListener('online', onlineHandler);

		if (timeoutMs) {
			timeoutId = setTimeout(() => {
				window.removeEventListener('online', onlineHandler);
				reject(new Error('Timeout waiting for online connection'));
			}, timeoutMs);
		}
	});
}

/**
 * Execute a function when online
 * If already online, executes immediately
 * If offline, waits for connection then executes
 */
export async function whenOnline<T>(fn: () => T | Promise<T>): Promise<T> {
	await waitForOnline();
	return fn();
}

/**
 * Ping the server to verify actual connectivity
 * (navigator.onLine can be unreliable)
 */
export async function pingServer(url?: string, timeoutMs = 5000): Promise<boolean> {
	const pingUrl = url || '/api/ping';

	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		const response = await fetch(pingUrl, {
			method: 'HEAD',
			cache: 'no-store',
			signal: controller.signal
		});

		clearTimeout(timeoutId);
		return response.ok;
	} catch {
		return false;
	}
}

// =============================================================================
// Internal Helpers
// =============================================================================

interface NetworkConnection extends EventTarget {
	type?: 'wifi' | 'cellular' | 'ethernet' | 'unknown';
	effectiveType?: '4g' | '3g' | '2g' | 'slow-2g';
	downlink?: number;
	rtt?: number;
	saveData?: boolean;
}

/**
 * Get the Network Information API connection object
 * Handles vendor prefixes for different browsers
 */
function getNetworkConnection(): NetworkConnection | undefined {
	if (typeof navigator === 'undefined') return undefined;

	// Standard API
	if ('connection' in navigator) {
		return (navigator as Navigator & { connection?: NetworkConnection }).connection;
	}

	// Webkit prefix (older Safari)
	if ('webkitConnection' in navigator) {
		return (navigator as Navigator & { webkitConnection?: NetworkConnection }).webkitConnection;
	}

	// Mozilla prefix (older Firefox)
	if ('mozConnection' in navigator) {
		return (navigator as Navigator & { mozConnection?: NetworkConnection }).mozConnection;
	}

	return undefined;
}
