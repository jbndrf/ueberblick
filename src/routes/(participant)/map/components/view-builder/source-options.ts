import type { BuilderContext } from './types';
import type { ClauseSource } from './tree';
import { sourceKey } from './tree';

/**
 * One row in the unified "+ Condition" picker.
 *
 * The same option list is used both for adding a new clause (from the
 * GroupNode `+` button) and for swapping the field of an existing clause
 * (the field pill inside ClauseRow). The `group` string is what
 * MobileMultiSelect renders as the description — small "Stage", "Date",
 * "People" labels next to the row keep the list scannable.
 */
export interface SourceOption {
	id: string;
	label: string;
	group: string;
	source: ClauseSource;
}

export function buildSourceOptions(ctx: BuilderContext): SourceOption[] {
	const out: SourceOption[] = [];

	for (const f of ctx.filterableFields) {
		const source: ClauseSource = {
			kind: 'field_value',
			workflow_id: f.workflow_id,
			workflow_name: f.workflow_name,
			field_key: f.field_key,
			field_label: f.field_label,
			field_type: f.field_type,
			options: f.options
		};
		out.push({
			id: sourceKey(source),
			label: f.field_label,
			group: f.workflow_name,
			source
		});
	}

	for (const w of ctx.workflows) {
		const source: ClauseSource = { kind: 'stage', workflow_id: w.id, workflow_name: w.name };
		out.push({
			id: sourceKey(source),
			label: `Stage (${w.name})`,
			group: 'Stage',
			source
		});
	}

	out.push({
		id: sourceKey({ kind: 'created' }),
		label: 'Created date',
		group: 'Date',
		source: { kind: 'created' }
	});
	out.push({
		id: sourceKey({ kind: 'updated' }),
		label: 'Updated date',
		group: 'Date',
		source: { kind: 'updated' }
	});
	out.push({
		id: sourceKey({ kind: 'created_by' }),
		label: 'Created by',
		group: 'People',
		source: { kind: 'created_by' }
	});

	return out;
}
