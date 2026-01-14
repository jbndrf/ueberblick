/**
 * Participant State Utilities
 */

/**
 * Generate a PocketBase-compatible ID (15 alphanumeric characters)
 * PocketBase accepts custom IDs in this format
 */
export function generateId(): string {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	return Array.from({ length: 15 }, () => chars[Math.floor(Math.random() * chars.length)]).join(
		''
	);
}

/**
 * Deep equality check for objects (simple implementation)
 */
export function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== typeof b) return false;
	if (a === null || b === null) return a === b;
	if (typeof a !== 'object') return false;

	// Handle arrays
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		return a.every((val, idx) => deepEqual(val, b[idx]));
	}

	// Handle objects
	const aObj = a as Record<string, unknown>;
	const bObj = b as Record<string, unknown>;

	const keysA = Object.keys(aObj);
	const keysB = Object.keys(bObj);

	if (keysA.length !== keysB.length) return false;

	return keysA.every((key) => deepEqual(aObj[key], bObj[key]));
}

/**
 * Check if two arrays have the same items (order-independent)
 */
export function arraysEqual<T>(a: T[], b: T[]): boolean {
	if (a.length !== b.length) return false;
	const sortedA = [...a].sort();
	const sortedB = [...b].sort();
	return sortedA.every((val, idx) => val === sortedB[idx]);
}
