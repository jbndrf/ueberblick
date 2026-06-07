/**
 * Data-freshness helpers.
 *
 * `lastSuccessfulSyncAt` (a wall-clock ISO string, see db.ts) records the last
 * sync that actually reached the server. These pure functions turn it into the
 * "your data is N days old" decision so a participant is never silently working
 * on dangerously stale data. Kept framework-free so it's unit-testable.
 */

/** Default age past which offline data is flagged as stale to the participant. */
export const STALE_THRESHOLD_DAYS = 7;

/**
 * Whole days between `nowMs` and the last successful sync, or null if there has
 * never been one. Negative inputs (clock skew / future timestamp) clamp to 0.
 */
export function daysSinceSync(lastSyncedAtIso: string | null, nowMs: number): number | null {
	if (!lastSyncedAtIso) return null;
	const then = new Date(lastSyncedAtIso).getTime();
	if (Number.isNaN(then)) return null;
	const days = Math.floor((nowMs - then) / 86_400_000);
	return days < 0 ? 0 : days;
}

/**
 * True when the local data is at least `thresholdDays` old. A device that has
 * never synced is NOT "stale" here (there's nothing to be stale) -- that state
 * is surfaced separately as "never synced".
 */
export function isStaleSync(
	lastSyncedAtIso: string | null,
	nowMs: number,
	thresholdDays: number = STALE_THRESHOLD_DAYS
): boolean {
	const days = daysSinceSync(lastSyncedAtIso, nowMs);
	return days !== null && days >= thresholdDays;
}
