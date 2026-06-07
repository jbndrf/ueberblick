import { describe, it, expect } from 'vitest';
import { daysSinceSync, isStaleSync, STALE_THRESHOLD_DAYS } from './freshness';

const DAY = 86_400_000;
const NOW = new Date('2026-06-07T12:00:00.000Z').getTime();

describe('daysSinceSync', () => {
	it('returns null when never synced', () => {
		expect(daysSinceSync(null, NOW)).toBeNull();
	});

	it('returns null for an unparseable timestamp', () => {
		expect(daysSinceSync('not-a-date', NOW)).toBeNull();
	});

	it('counts whole elapsed days', () => {
		expect(daysSinceSync(new Date(NOW).toISOString(), NOW)).toBe(0);
		expect(daysSinceSync(new Date(NOW - 3 * DAY).toISOString(), NOW)).toBe(3);
		expect(daysSinceSync(new Date(NOW - 9 * DAY).toISOString(), NOW)).toBe(9);
	});

	it('floors partial days', () => {
		expect(daysSinceSync(new Date(NOW - (DAY + DAY / 2)).toISOString(), NOW)).toBe(1);
	});

	it('clamps a future timestamp (clock skew) to 0 rather than going negative', () => {
		expect(daysSinceSync(new Date(NOW + 5 * DAY).toISOString(), NOW)).toBe(0);
	});
});

describe('isStaleSync', () => {
	it('is false when never synced (nothing to be stale)', () => {
		expect(isStaleSync(null, NOW)).toBe(false);
	});

	it('is false below the threshold and true at/above it', () => {
		const below = new Date(NOW - (STALE_THRESHOLD_DAYS - 1) * DAY).toISOString();
		const at = new Date(NOW - STALE_THRESHOLD_DAYS * DAY).toISOString();
		const above = new Date(NOW - (STALE_THRESHOLD_DAYS + 5) * DAY).toISOString();
		expect(isStaleSync(below, NOW)).toBe(false);
		expect(isStaleSync(at, NOW)).toBe(true);
		expect(isStaleSync(above, NOW)).toBe(true);
	});

	it('honours a custom threshold', () => {
		const threeDaysAgo = new Date(NOW - 3 * DAY).toISOString();
		expect(isStaleSync(threeDaysAgo, NOW, 2)).toBe(true);
		expect(isStaleSync(threeDaysAgo, NOW, 5)).toBe(false);
	});
});
