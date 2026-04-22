import type PocketBase from 'pocketbase';

export const ADMIN_INSTANCE_PAGE_SIZE = 200;

export type FieldValueRecord = { recordId: string; stageId: string };

export type InstanceRow = {
	id: string;
	status: string;
	current_stage_id: string;
	current_stage_name: string;
	created_by_name: string;
	/** Anchor coordinate (derived centroid) for display in admin tables. */
	centroid: { lat: number; lon: number } | null;
	/** Geometry type of the instance so admins can tell shapes apart. */
	geometry_type: 'Point' | 'LineString' | 'Polygon' | null;
	created: string;
	updated: string;
	fieldData: Record<string, any>;
	fieldValueRecords: Record<string, FieldValueRecord>;
	fileData: Record<string, Array<{ recordId: string; fileName: string }>>;
};

export type RowBuildOptions = {
	stageNameById: Map<string, string>;
	creatorNameById: Map<string, string>;
};

/**
 * Fetches all field values for a workflow in a single query. The relational
 * filter `instance_id.workflow_id = "X"` lets PocketBase evaluate the access
 * rule once against an indexed FK-joined candidate set instead of parsing and
 * re-evaluating an OR chain of per-id clauses.
 */
export async function fetchFieldValuesForWorkflow(
	pb: PocketBase,
	workflowId: string
): Promise<any[]> {
	return pb.collection('workflow_instance_field_values').getFullList({
		filter: `instance_id.workflow_id = "${workflowId}"`,
		fields: 'id,instance_id,field_key,value,file_value,stage_id',
		requestKey: null
	});
}

/**
 * Fetches display names for all participants in a project. Returns a Map
 * keyed by participant id with `name || email || id` as the label.
 */
export async function fetchParticipantNameMapForProject(
	pb: PocketBase,
	projectId: string
): Promise<Map<string, string>> {
	const participants = await pb.collection('participants').getFullList({
		filter: `project_id = "${projectId}"`,
		fields: 'id,name,email',
		requestKey: null
	});
	const map = new Map<string, string>();
	for (const p of participants as any[]) {
		map.set(p.id, p.name || p.email || p.id);
	}
	return map;
}

export function buildStageNameMap(
	stages: Array<{ id: string; stage_name: string }>
): Map<string, string> {
	const map = new Map<string, string>();
	for (const s of stages) map.set(s.id, s.stage_name);
	return map;
}

export function buildRowsFromInstances(
	instances: any[],
	fieldValues: any[],
	options: RowBuildOptions
): InstanceRow[] {
	const fieldValuesByInstance: Record<string, Record<string, any>> = {};
	const fieldValueRecords: Record<string, Record<string, FieldValueRecord>> = {};
	const filesByInstance: Record<
		string,
		Record<string, Array<{ recordId: string; fileName: string }>>
	> = {};

	for (const fv of fieldValues) {
		if (!fieldValuesByInstance[fv.instance_id]) {
			fieldValuesByInstance[fv.instance_id] = {};
			fieldValueRecords[fv.instance_id] = {};
			filesByInstance[fv.instance_id] = {};
		}

		if (fv.file_value) {
			if (!filesByInstance[fv.instance_id][fv.field_key]) {
				filesByInstance[fv.instance_id][fv.field_key] = [];
			}
			filesByInstance[fv.instance_id][fv.field_key].push({
				recordId: fv.id,
				fileName: fv.file_value
			});
			fieldValueRecords[fv.instance_id][fv.field_key] = {
				recordId: fv.id,
				stageId: fv.stage_id
			};
			continue;
		}

		let parsed = fv.value;
		if (typeof parsed === 'string' && (parsed.startsWith('[') || parsed.startsWith('{'))) {
			try {
				parsed = JSON.parse(parsed);
			} catch {
				// keep as string
			}
		}
		fieldValuesByInstance[fv.instance_id][fv.field_key] = parsed;
		fieldValueRecords[fv.instance_id][fv.field_key] = {
			recordId: fv.id,
			stageId: fv.stage_id
		};
	}

	return instances.map((inst) => ({
		id: inst.id,
		status: inst.status,
		current_stage_id: inst.current_stage_id,
		current_stage_name: options.stageNameById.get(inst.current_stage_id) || '',
		created_by_name: options.creatorNameById.get(inst.created_by) || '',
		centroid: inst.centroid ?? null,
		geometry_type: inst.geometry?.type ?? null,
		created: inst.created,
		updated: inst.updated,
		fieldData: fieldValuesByInstance[inst.id] || {},
		fieldValueRecords: fieldValueRecords[inst.id] || {},
		fileData: filesByInstance[inst.id] || {}
	}));
}
