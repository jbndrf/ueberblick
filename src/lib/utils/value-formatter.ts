/**
 * Display formatter for raw stored values (protocol snapshots, field values).
 * Objects are JSON-stringified; null/undefined/empty render as an em-dash.
 */
export function renderSnapshotValue(v: unknown): string {
	if (v === null || v === undefined || v === '') return '—';
	if (typeof v === 'object') return JSON.stringify(v);
	return String(v);
}
