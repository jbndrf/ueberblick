/**
 * PWA Detection and Install Prompt Utilities
 *
 * Detects whether the app is running as an installed PWA or in the browser,
 * and provides utilities for triggering the install prompt.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * The BeforeInstallPromptEvent interface (not in standard TypeScript lib)
 */
export interface BeforeInstallPromptEvent extends Event {
	readonly platforms: string[];
	readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
	prompt(): Promise<void>;
}

export type AppMode = 'browser' | 'pwa' | 'unknown';

// =============================================================================
// PWA Detection
// =============================================================================

/**
 * Detect if the app is running as an installed PWA
 *
 * Checks multiple signals:
 * - display-mode: standalone (Android/Desktop)
 * - navigator.standalone (iOS Safari)
 * - document.referrer contains android-app:// (TWA)
 */
export function isPWAInstalled(): boolean {
	if (typeof window === 'undefined') return false;

	// Check display-mode media query (works for Android Chrome, Desktop)
	const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

	// Check iOS Safari standalone mode
	const isIOSStandalone = (navigator as { standalone?: boolean }).standalone === true;

	// Check if running as TWA (Trusted Web Activity)
	const isTWA = document.referrer.includes('android-app://');

	return isStandalone || isIOSStandalone || isTWA;
}

/**
 * Get the current app mode
 */
export function getAppMode(): AppMode {
	if (typeof window === 'undefined') return 'unknown';

	if (isPWAInstalled()) {
		return 'pwa';
	}

	return 'browser';
}

// =============================================================================
// Install Prompt
// =============================================================================

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installPromptCallbacks: Set<(event: BeforeInstallPromptEvent) => void> = new Set();

/**
 * Set up listener for the install prompt
 *
 * The browser fires beforeinstallprompt when it determines the app can be installed.
 * We capture this event to show our own install button.
 *
 * @param callback Called when the install prompt becomes available
 * @returns Cleanup function to remove the listener
 */
export function onInstallPromptAvailable(
	callback: (event: BeforeInstallPromptEvent) => void
): () => void {
	if (typeof window === 'undefined') return () => {};

	installPromptCallbacks.add(callback);

	// If we already have a deferred prompt, call immediately
	if (deferredPrompt) {
		callback(deferredPrompt);
	}

	return () => {
		installPromptCallbacks.delete(callback);
	};
}

/**
 * Check if the install prompt is available
 */
export function isInstallPromptAvailable(): boolean {
	return deferredPrompt !== null;
}

/**
 * Trigger the install prompt
 *
 * @returns Promise that resolves to true if user accepted, false if dismissed
 */
export async function showInstallPrompt(): Promise<boolean> {
	if (!deferredPrompt) {
		console.warn('Install prompt not available');
		return false;
	}

	// Show the prompt
	await deferredPrompt.prompt();

	// Wait for user choice
	const { outcome } = await deferredPrompt.userChoice;

	// Clear the deferred prompt - can only be used once
	deferredPrompt = null;

	return outcome === 'accepted';
}

/**
 * Initialize PWA install prompt listeners
 *
 * Call this once on app startup (e.g., in root layout).
 */
export function initPWAInstallListeners(): void {
	if (typeof window === 'undefined') return;

	// Listen for the beforeinstallprompt event
	window.addEventListener('beforeinstallprompt', (e) => {
		// Prevent Chrome's default mini-infobar
		e.preventDefault();

		// Store the event for later use
		deferredPrompt = e as BeforeInstallPromptEvent;

		// Notify all callbacks
		for (const callback of installPromptCallbacks) {
			callback(deferredPrompt);
		}
	});

	// Listen for successful install
	window.addEventListener('appinstalled', () => {
		// Clear the deferred prompt
		deferredPrompt = null;

		console.log('PWA was installed');
	});
}

// =============================================================================
// Reactive State (for Svelte components)
// =============================================================================

/**
 * Create a reactive store-like object for PWA state
 *
 * Usage in Svelte 5:
 * ```svelte
 * <script>
 *   import { pwaState } from '$lib/utils/pwa-detection';
 *   const state = pwaState();
 * </script>
 *
 * {#if state.canInstall}
 *   <button onclick={state.install}>Install App</button>
 * {/if}
 * ```
 */
export function createPWAState() {
	let mode = $state<AppMode>(getAppMode());
	let canInstall = $state(false);
	let swStatus = $state<'checking' | 'registered' | 'error' | 'unsupported'>('checking');
	let swError = $state<string | null>(null);

	// Set up install prompt listener
	if (typeof window !== 'undefined') {
		onInstallPromptAvailable(() => {
			canInstall = true;
		});

		// Listen for display mode changes (e.g., user installs while app is open)
		const mediaQuery = window.matchMedia('(display-mode: standalone)');
		mediaQuery.addEventListener('change', () => {
			mode = getAppMode();
			if (mode === 'pwa') {
				canInstall = false;
			}
		});

		// Check service worker status
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.getRegistration().then((reg) => {
				if (reg) {
					swStatus = 'registered';
				} else {
					swStatus = 'checking';
				}
			}).catch((err) => {
				swStatus = 'error';
				swError = err.message;
			});

			// Listen for SW registration
			navigator.serviceWorker.ready.then(() => {
				swStatus = 'registered';
			}).catch((err) => {
				swStatus = 'error';
				swError = err.message;
			});
		} else {
			swStatus = 'unsupported';
		}
	}

	return {
		get mode() {
			return mode;
		},
		get canInstall() {
			return canInstall;
		},
		get isPWA() {
			return mode === 'pwa';
		},
		get isBrowser() {
			return mode === 'browser';
		},
		get swStatus() {
			return swStatus;
		},
		get swError() {
			return swError;
		},
		async install() {
			const accepted = await showInstallPrompt();
			if (accepted) {
				canInstall = false;
				mode = 'pwa';
			}
			return accepted;
		}
	};
}
