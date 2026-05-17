/**
 * Generate a human-readable label for a workflow_instance_tool_usage entry.
 *
 * Mirrors the activity-tab labels in WorkflowInstanceDetailModule so surfaces
 * like the Recent sheet can show the same "Erstellt / Daten erfasst / 2 Felder
 * aktualisiert" text instead of inventing their own phrasing.
 *
 * Callers pass the i18n strings explicitly so this module stays framework-agnostic.
 */
export type ToolUsageAction =
	| 'instance_created'
	| 'form_fill'
	| 'edit'
	| 'admin_edit'
	| 'location_edit'
	| 'stage_transition'
	| 'protocol'
	| 'conflict_resolution';

export interface ToolUsageMetadata {
	action?: ToolUsageAction;
	changes?: Array<{ field_def_id: string; field_name?: string }>;
	to_stage_name?: string;
	[key: string]: unknown;
}

/**
 * Minimal field-def shape used to label a field by id. The full FieldDef lives
 * in `$lib/participant-state/types`; we only need id + label here.
 */
export interface FieldDefLike {
	id: string;
	label?: string;
}

export interface ToolUsageLabelStrings {
	action: string;
	created: string;
	dataRecorded: string;
	fieldFallback: string;
	updatedSuffix: string;
	adminUpdated: string;
	fieldsNoun: string;
	fieldsUpdated: string;
	locationUpdated: string;
	inspectionRecorded: string;
	conflictResolved: string;
	stageTransition: string;
}

export function toolUsageLabel(
	metadata: ToolUsageMetadata | null | undefined,
	strings: ToolUsageLabelStrings,
	fieldDefById?: Map<string, FieldDefLike>
): string {
	if (!metadata?.action) return strings.action;
	switch (metadata.action) {
		case 'instance_created':
			return strings.created;
		case 'form_fill':
			return strings.dataRecorded;
		case 'edit':
		case 'admin_edit': {
			const changes = metadata.changes ?? [];
			if (changes.length === 1) {
				const change = changes[0];
				const fromName = change.field_name;
				const fromDef = fieldDefById?.get(change.field_def_id);
				const label =
					fromName || fromDef?.label || change.field_def_id || strings.fieldFallback;
				return `${label} ${strings.updatedSuffix}`;
			}
			const count = changes.length || '';
			return metadata.action === 'admin_edit'
				? `${strings.adminUpdated} ${count} ${strings.fieldsNoun}`.trim()
				: `${count} ${strings.fieldsUpdated}`.trim();
		}
		case 'location_edit':
			return strings.locationUpdated;
		case 'protocol':
			return strings.inspectionRecorded;
		case 'conflict_resolution':
			return strings.conflictResolved;
		case 'stage_transition':
			return metadata.to_stage_name
				? `${strings.stageTransition}: ${metadata.to_stage_name}`
				: strings.stageTransition;
		default:
			return strings.action;
	}
}
