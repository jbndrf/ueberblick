import type PocketBase from 'pocketbase';

export const ADMIN_INSTANCE_PAGE_SIZE = 200;

export type FieldValueRecord = { recordId: string; stageId: string };

export type InstanceRow = {
	id: string;
	status: string;
	current_stage_id: string;
	current_stage_name: string;
	created_by_name: string;
	location: any;
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
 * Fetches field values for a set of instance IDs.
 * Chunks the OR-filter into batches so the PocketBase filter parser stays
 * within its expression limits, but batches run in parallel to minimise
 * wall-clock latency. Relies on the `idx_wifv_instance_id` index for each
 * per-id seek.
 */
const FIELD_VALUES_CHUNK_SIZE = 100;

export async function fetchFieldValuesForInstances(
	pb: PocketBase,
	instanceIds: string[]
): Promise<any[]> {
	if (instanceIds.length === 0) return [];
	const chunks: string[][] = [];
	for (let i = 0; i < instanceIds.length; i += FIELD_VALUES_CHUNK_SIZE) {
		chunks.push(instanceIds.slice(i, i + FIELD_VALUES_CHUNK_SIZE));
	}
	const results = await Promise.all(
		chunks.map((chunk) => {
			const filter = chunk.map((id) => `instance_id = "${id}"`).join(' || ');
			return pb.collection('workflow_instance_field_values').getFullList({
				filter,
				fields: 'id,instance_id,field_key,value,file_value,stage_id',
				requestKey: null
			});
		})
	);
	return results.flat();
}

/**
 * Fetches display names for the participants that created a set of instances.
 * Returns a Map keyed by participant id. Missing or duplicate ids are handled.
 */
export async function fetchCreatorNameMap(
	pb: PocketBase,
	creatorIds: Iterable<string>
): Promise<Map<string, string>> {
	const uniqueIds = Array.from(new Set(Array.from(creatorIds).filter(Boolean)));
	const map = new Map<string, string>();
	if (uniqueIds.length === 0) return map;
	const chunks: string[][] = [];
	for (let i = 0; i < uniqueIds.length; i += FIELD_VALUES_CHUNK_SIZE) {
		chunks.push(uniqueIds.slice(i, i + FIELD_VALUES_CHUNK_SIZE));
	}
	const results = await Promise.all(
		chunks.map((chunk) => {
			const filter = chunk.map((id) => `id = "${id}"`).join(' || ');
			return pb.collection('participants').getFullList({
				filter,
				fields: 'id,name,email',
				requestKey: null
			});
		})
	);
	for (const p of results.flat() as any[]) {
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
		location: inst.location,
		created: inst.created,
		updated: inst.updated,
		fieldData: fieldValuesByInstance[inst.id] || {},
		fieldValueRecords: fieldValueRecords[inst.id] || {},
		fileData: filesByInstance[inst.id] || {}
	}));
}
