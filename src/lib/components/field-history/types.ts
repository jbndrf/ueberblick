import type { FormField } from '$lib/components/form-renderer/types';

export interface HistoryEntry {
	id: string;
	value: unknown;
	recorded_at: string;
}

export interface FieldHistoryViewProps {
	field: FormField;
	entries: HistoryEntry[];
}
