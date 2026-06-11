/**
 * Change-tracking core for builder collections.
 *
 * Every collection item is wrapped as `{ data, status, original }` (see the
 * `Tracked*` aliases in ../types). These helpers implement the shared status
 * transitions; the semantics are load-bearing for `getChanges()`/save:
 *  - loaded rows start `unchanged` with a structuredClone original
 *  - edits flip `unchanged` → `modified` only when data actually differs
 *  - deleting a `new` item removes it outright; otherwise it is soft-marked
 *    `deleted` so the save action can issue the delete.
 */

import { deepEqual } from '../utils';
import type { ItemStatus } from '../types';

export interface TrackedItem<T> {
	data: T;
	status: ItemStatus;
	original?: T;
}

/** Wrap server rows as unchanged tracked items. */
export function loadTracked<T>(rows: T[]): TrackedItem<T>[] {
	return rows.map((row) => ({
		data: row,
		status: 'unchanged' as ItemStatus,
		original: structuredClone(row)
	}));
}

/** Object.assign updates onto a tracked item and flip its status if it now differs. */
export function applyUpdate<T extends object>(item: TrackedItem<T>, updates: Partial<T>): void {
	Object.assign(item.data, updates);
	markModifiedIfChanged(item);
}

/** Flip `unchanged` → `modified` when data no longer matches the original. */
export function markModifiedIfChanged<T>(item: TrackedItem<T>): void {
	if (item.status === 'unchanged' && !deepEqual(item.data, item.original)) {
		item.status = 'modified';
	}
}
