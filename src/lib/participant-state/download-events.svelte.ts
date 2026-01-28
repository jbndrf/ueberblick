/**
 * Download Events - Reactive event signaling for download completion and offline mode changes
 *
 * Uses Svelte 5 runes with counters that trigger effects when incremented.
 * This allows components to react to download/offline events without polling.
 */

// =============================================================================
// Event Counters (Svelte 5 Runes)
// =============================================================================

let downloadCompleteCounter = $state(0);
let offlineModeChangeCounter = $state(0);

// =============================================================================
// Signal Functions (call these when events happen)
// =============================================================================

/**
 * Signal that a download has completed.
 * Components watching getDownloadCompleteSignal() will react.
 */
export function signalDownloadComplete(): void {
	downloadCompleteCounter++;
}

/**
 * Signal that offline mode has changed.
 * Components watching getOfflineModeChangeSignal() will react.
 */
export function signalOfflineModeChange(): void {
	offlineModeChangeCounter++;
}

// =============================================================================
// Getter Functions (use these in $derived or $effect)
// =============================================================================

/**
 * Get the current download complete signal value.
 * Use in $derived or $effect to react when downloads complete.
 */
export function getDownloadCompleteSignal(): number {
	return downloadCompleteCounter;
}

/**
 * Get the current offline mode change signal value.
 * Use in $derived or $effect to react when offline mode changes.
 */
export function getOfflineModeChangeSignal(): number {
	return offlineModeChangeCounter;
}
