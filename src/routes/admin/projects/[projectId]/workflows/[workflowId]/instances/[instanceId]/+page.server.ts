import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	buildRowsFromInstances,
	buildStageNameMap,
	fetchParticipantNameMapForProject
} from '$lib/admin/workflow-rows';
import { resolveFieldEntities } from '$lib/admin/resolve-field-entities';
import {
	adminInstanceDetailNotFound,
	adminInstanceDetailLoadFailed
} from '$lib/paraglide/messages';

/** Parsed protocol-entry snapshot for admin display. */
export interface AdminProtocolEntry {
	id: string;
	tool_id: string;
	tool_name: string | null;
	recorded_at: string;
	recorded_by: string;
	kind: 'manual' | 'global_autolog';
	case_fields: Array<{ field_def_id: string; label: string; value: unknown }>;
	local_fields: Array<{ key: string; label: string; value: unknown }>;
	autolog: { from: string; to: string; entries: Array<Record<string, unknown>> } | null;
}

export const load: PageServerLoad = async ({ params, locals: { pbAdmin: pb } }) => {
	const { projectId, workflowId, instanceId } = params;

	try {
		const instance = await pb.collection('workflow_instances').getOne(instanceId);
		if (instance.workflow_id !== workflowId) {
			throw error(404, adminInstanceDetailNotFound?.() ?? 'Instance not found');
		}

		const [
			workflow,
			stages,
			fieldDefs,
			fieldValues,
			toolUsage,
			protocolEntries,
			roles,
			protocolTools
		] = await Promise.all([
			pb.collection('workflows').getOne(workflowId, {
				fields: 'id,name,project_id,marker_color,geometry_type'
			}),
			pb.collection('workflow_stages').getFullList({
				filter: `workflow_id = "${workflowId}"`,
				fields: 'id,stage_name,stage_type,stage_order',
				sort: 'stage_order'
			}),
			pb.collection('workflow_field_defs').getFullList({
				filter: `workflow_id = "${workflowId}"`,
				fields: 'id,label,field_type,field_options,display_config,write_mode'
			}),
			pb.collection('workflow_field_values').getFullList({
				filter: `instance_id = "${instanceId}"`,
				fields:
					'id,instance_id,field_def_id,value,file_value,recorded_at_stage,recorded_at,recorded_by_action',
				sort: 'recorded_at',
				requestKey: null
			}),
			pb.collection('workflow_instance_tool_usage').getFullList({
				filter: `instance_id = "${instanceId}"`,
				sort: 'executed_at',
				expand: 'executed_by',
				requestKey: null
			}),
			pb.collection('workflow_protocol_entries').getFullList({
				filter: `instance_id = "${instanceId}"`,
				sort: '-recorded_at',
				requestKey: null
			}),
			pb.collection('roles').getFullList({
				filter: `project_id = "${projectId}"`,
				fields: 'id,name',
				sort: 'name',
				requestKey: null
			}),
			pb.collection('tools_protocol').getFullList({
				filter: `workflow_id = "${workflowId}"`,
				fields: 'id,name',
				requestKey: null
			})
		]);

		if (workflow.project_id !== projectId) {
			throw error(404, adminInstanceDetailNotFound?.() ?? 'Instance not found');
		}

		const participantNameMap = await fetchParticipantNameMapForProject(pb, projectId);
		const stageNameById = buildStageNameMap(stages as any);
		const [row] = buildRowsFromInstances([instance], fieldValues, {
			stageNameById,
			creatorNameById: participantNameMap
		});

		const resolvedEntities = await resolveFieldEntities(
			pb,
			fieldDefs as any,
			projectId,
			roles as any
		);

		const toolNameById = new Map<string, string>();
		for (const t of protocolTools) toolNameById.set(t.id, (t as any).name ?? '');

		const protocols: AdminProtocolEntry[] = (protocolEntries as any[]).map((rec) => {
			let snapshot: any = {};
			const raw = rec.snapshot;
			if (typeof raw === 'string') {
				try {
					snapshot = JSON.parse(raw);
				} catch {
					snapshot = {};
				}
			} else if (raw && typeof raw === 'object') {
				snapshot = raw;
			}
			return {
				id: rec.id,
				tool_id: rec.tool_id ?? '',
				tool_name: toolNameById.get(rec.tool_id) ?? null,
				recorded_at: rec.recorded_at,
				recorded_by: rec.recorded_by,
				kind: (snapshot.kind as 'manual' | 'global_autolog') ?? 'manual',
				case_fields: Array.isArray(snapshot.case_fields) ? snapshot.case_fields : [],
				local_fields: Array.isArray(snapshot.local_fields) ? snapshot.local_fields : [],
				autolog: snapshot.autolog ?? null
			};
		});

		return {
			projectId,
			workflowId,
			instance,
			workflow,
			stages,
			fieldDefs,
			row,
			toolUsage,
			protocols,
			resolvedEntities,
			participantNameMap: Object.fromEntries(participantNameMap),
			stageNameById: Object.fromEntries(stageNameById)
		};
	} catch (err: any) {
		if (err?.status) throw err;
		console.error('Error loading instance detail:', err);
		throw error(500, adminInstanceDetailLoadFailed?.() ?? 'Failed to load instance');
	}
};
