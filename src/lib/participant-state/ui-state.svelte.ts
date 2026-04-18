/**
 * Per-sheet UI state that should survive close/reopen and full reloads.
 *
 * Currently used to remember which tab was last active in the participant
 * map side sheets. Local-only; no server sync.
 */

const STORAGE_PREFIX = 'ueberblick:ui-tab:';

function readTab(sheetId: string): string | null {
	if (typeof window === 'undefined') return null;
	try {
		return localStorage.getItem(STORAGE_PREFIX + sheetId);
	} catch {
		return null;
	}
}

function writeTab(sheetId: string, value: string): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_PREFIX + sheetId, value);
	} catch {
		// ignore quota / privacy-mode errors
	}
}

export interface PersistedTab {
	value: string;
}

export function createPersistedTab(sheetId: string, defaultTab: string): PersistedTab {
	let current = $state(readTab(sheetId) ?? defaultTab);
	return {
		get value() {
			return current;
		},
		set value(next: string) {
			current = next;
			writeTab(sheetId, next);
		}
	};
}
