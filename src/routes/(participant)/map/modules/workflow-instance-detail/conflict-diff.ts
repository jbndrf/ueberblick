import type { SyncConflict } from '$lib/participant-state/db';

// Columns that never show up in the conflict review UI — identity, parent
// links, audit stamps that participants don't reason about. Keep in sync
// between the cleanup check and the rendering code.
const SKIP_KEYS = new Set([
	'id', 'created', 'updated', 'collectionId', 'collectionName',
	'instance_id', 'field_key', 'stage_id',
	'created_by_action', 'last_modified_by_action', 'last_modified_at'
]);

// For workflow_instance_field_values, only these columns carry user data.
const FIELD_VALUE_DISPLAY_KEYS = new Set(['value', 'file_value']);

export interface ChangedField {
	key: string;
	localValue: unknown;
	serverValue: unknown;
}

export function getChangedFields(conflict: SyncConflict): ChangedField[] {
	const changed: ChangedField[] = [];
	const isFieldValues = conflict.collection === 'workflow_instance_field_values';

	for (const [key, localVal] of Object.entries(conflict.localVersion)) {
		if (SKIP_KEYS.has(key)) continue;
		if (isFieldValues && !FIELD_VALUE_DISPLAY_KEYS.has(key)) continue;

		const serverVal = conflict.serverVersion[key];
		if (JSON.stringify(localVal) !== JSON.stringify(serverVal)) {
			changed.push({ key, localValue: localVal, serverValue: serverVal });
		}
	}

	return changed;
}
