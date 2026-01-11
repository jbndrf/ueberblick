/**
 * Network detection and monitoring utilities
 * Provides online/offline status and connection quality information
 */

import { writable, type Readable } from 'svelte/store';
import type { NetworkStatus } from './types';

/**
 * Create a reactive network status store
 */
function createNetworkStore(): Readable<NetworkStatus> {
	const { subscribe, set } = writable<NetworkStatus>({
		online: navigator.onLine,
		type: 'unknown'
	});

	/**
	 * Get current network status
	 */
	function getStatus(): NetworkStatus {
		const online = navigator.onLine;

		// Try to get connection info from Network Information API
		const connection =
			(navigator as Navigator & { connection?: NetworkInformation }).connection ||
			(navigator as Navigator & { mozConnection?: NetworkInformation }).mozConnection ||
			(navigator as Navigator & { webkitConnection?: NetworkInformation }).webkitConnection;

		if (connection) {
			return {
				online,
				type: connection.type as NetworkStatus['type'],
				effective_type: connection.effectiveType as NetworkStatus['effective_type']
			};
		}

		return { online, type: 'unknown' };
	}

	/**
	 * Update the store with current status
	 */
	function updateStatus(): void {
		set(getStatus());
	}

	// Set up event listeners
	if (typeof window !== 'undefined') {
		window.addEventListener('online', updateStatus);
		window.addEventListener('offline', updateStatus);

		// Listen for connection changes if supported
		const connection =
			(navigator as Navigator & { connection?: NetworkInformation }).connection ||
			(navigator as Navigator & { mozConnection?: NetworkInformation }).mozConnection ||
			(navigator as Navigator & { webkitConnection?: NetworkInformation }).webkitConnection;

		if (connection) {
			connection.addEventListener('change', updateStatus);
		}
	}

	return { subscribe };
}

/**
 * Network Information API type (not in standard TypeScript lib)
 */
interface NetworkInformation extends EventTarget {
	type?: 'bluetooth' | 'cellular' | 'ethernet' | 'none' | 'wifi' | 'wimax' | 'other' | 'unknown';
	effectiveType?: '4g' | '3g' | '2g' | 'slow-2g';
	downlink?: number;
	rtt?: number;
	saveData?: boolean;
}

/**
 * Global network status store
 */
export const networkStatus = createNetworkStore();

/**
 * Check if currently online
 */
export function isOnline(): boolean {
	return navigator.onLine;
}

/**
 * Check if currently offline
 */
export function isOffline(): boolean {
	return !navigator.onLine;
}

/**
 * Get connection type
 */
export function getConnectionType(): NetworkStatus['type'] {
	const connection =
		(navigator as Navigator & { connection?: NetworkInformation }).connection ||
		(navigator as Navigator & { mozConnection?: NetworkInformation }).mozConnection ||
		(navigator as Navigator & { webkitConnection?: NetworkInformation }).webkitConnection;

	return (connection?.type as NetworkStatus['type']) || 'unknown';
}

/**
 * Get effective connection speed
 */
export function getEffectiveType(): NetworkStatus['effective_type'] {
	const connection =
		(navigator as Navigator & { connection?: NetworkInformation }).connection ||
		(navigator as Navigator & { mozConnection?: NetworkInformation }).mozConnection ||
		(navigator as Navigator & { webkitConnection?: NetworkInformation }).webkitConnection;

	return connection?.effectiveType as NetworkStatus['effective_type'];
}

/**
 * Check if connection is fast enough for heavy operations
 */
export function isFastConnection(): boolean {
	const effectiveType = getEffectiveType();
	return effectiveType === '4g' || effectiveType === undefined;
}

/**
 * Check if connection is slow (should avoid large downloads)
 */
export function isSlowConnection(): boolean {
	const effectiveType = getEffectiveType();
	return effectiveType === '2g' || effectiveType === 'slow-2g';
}

/**
 * Wait for online connection
 * Resolves immediately if already online, or waits for 'online' event
 */
export function waitForOnline(timeoutMs?: number): Promise<void> {
	return new Promise((resolve, reject) => {
		if (navigator.onLine) {
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
 * If offline, waits for connection before executing
 */
export async function whenOnline<T>(fn: () => T | Promise<T>): Promise<T> {
	await waitForOnline();
	return await fn();
}

/**
 * Ping server to verify actual connectivity (not just network status)
 */
export async function pingServer(url: string, timeoutMs = 5000): Promise<boolean> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(url, {
			method: 'HEAD',
			signal: controller.signal,
			cache: 'no-store'
		});
		clearTimeout(timeoutId);
		return response.ok;
	} catch {
		clearTimeout(timeoutId);
		return false;
	}
}
