/**
 * In-memory IP-based rate limiting for login form actions.
 *
 * Counts failed login attempts per client IP inside a sliding window.
 * When the threshold is exceeded, further attempts are rejected until the
 * oldest recorded failure falls out of the window.
 *
 * State lives in the Node process; acceptable because docker-compose runs a
 * single frontend container. A periodic sweep drops empty entries so the map
 * cannot grow unboundedly under a sustained scan from random spoofed IPs.
 */

import type { RequestEvent } from '@sveltejs/kit';

const MAX_FAILURES = 10;
const WINDOW_MS = 10 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

type FailureLog = number[];

// Survive HMR in dev so we don't accidentally run multiple sweepers.
const globalStore = globalThis as unknown as {
	__loginFailureStore?: Map<string, FailureLog>;
	__loginFailureSweeper?: ReturnType<typeof setInterval>;
};

const failureStore: Map<string, FailureLog> = globalStore.__loginFailureStore ?? new Map();
globalStore.__loginFailureStore = failureStore;

if (!globalStore.__loginFailureSweeper) {
	globalStore.__loginFailureSweeper = setInterval(() => {
		const cutoff = Date.now() - WINDOW_MS;
		for (const [key, log] of failureStore) {
			const trimmed = log.filter((ts) => ts > cutoff);
			if (trimmed.length === 0) {
				failureStore.delete(key);
			} else if (trimmed.length !== log.length) {
				failureStore.set(key, trimmed);
			}
		}
	}, CLEANUP_INTERVAL_MS);
	// Don't hold the event loop open just for this timer.
	globalStore.__loginFailureSweeper.unref?.();
}

export type RateLimitResult =
	| { allowed: true }
	| { allowed: false; retryAfterSec: number };

/**
 * Check whether a new login attempt from this key should be allowed.
 * Does not record anything — call recordLoginFailure / recordLoginSuccess
 * after the auth attempt finishes.
 */
export function checkLoginRateLimit(key: string): RateLimitResult {
	const now = Date.now();
	const cutoff = now - WINDOW_MS;
	const log = failureStore.get(key);

	if (!log || log.length === 0) {
		return { allowed: true };
	}

	const recent = log.filter((ts) => ts > cutoff);
	if (recent.length !== log.length) {
		failureStore.set(key, recent);
	}

	if (recent.length < MAX_FAILURES) {
		return { allowed: true };
	}

	const oldest = recent[0];
	const retryAfterMs = Math.max(0, oldest + WINDOW_MS - now);
	return { allowed: false, retryAfterSec: Math.ceil(retryAfterMs / 1000) };
}

export function recordLoginFailure(key: string): void {
	const now = Date.now();
	const cutoff = now - WINDOW_MS;
	const log = failureStore.get(key) ?? [];
	const recent = log.filter((ts) => ts > cutoff);
	recent.push(now);
	failureStore.set(key, recent);
}

export function recordLoginSuccess(key: string): void {
	failureStore.delete(key);
}

/**
 * Resolve the real client IP for rate-limit keying.
 *
 * Production traffic flows Browser -> Nginx -> SvelteKit, so Nginx's
 * X-Forwarded-For / X-Real-IP headers carry the real client address. In
 * local dev without Nginx, fall back to the socket address.
 */
export function clientIpFromEvent(event: RequestEvent): string {
	const forwardedFor = event.request.headers.get('x-forwarded-for');
	if (forwardedFor) {
		const first = forwardedFor.split(',')[0]?.trim();
		if (first) return first;
	}

	const realIp = event.request.headers.get('x-real-ip');
	if (realIp) return realIp.trim();

	try {
		return event.getClientAddress();
	} catch {
		return 'unknown';
	}
}

/**
 * Convert retryAfterSec into a human-friendly "N minutes" number for UI
 * messages. Always rounds up to at least 1.
 */
export function retryAfterMinutes(retryAfterSec: number): number {
	return Math.max(1, Math.ceil(retryAfterSec / 60));
}
