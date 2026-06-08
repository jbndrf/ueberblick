import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireApiTokenAdmin } from '$lib/server/api-token';
import { buildWorkflowFeatureCollection } from '$lib/server/workflow-feature-model';
import { assertProjectAccess } from '../../scope';

// GET /api/geo/projects/{projectId}/workflows/{workflowId}.geojson
// Returns the workflow's instances as a GeoJSON FeatureCollection (WGS84).
export const GET: RequestHandler = async (event) => {
	const { pb, tokenRec } = await requireApiTokenAdmin(event);
	const projectId = event.params.projectId!;
	const workflowId = event.params.workflowId!;
	await assertProjectAccess(pb, tokenRec, projectId);

	let workflow: { project_id?: string };
	try {
		workflow = await pb
			.collection('workflows')
			.getOne(workflowId, { fields: 'id,project_id', requestKey: null });
	} catch {
		throw error(404, 'Workflow not found');
	}
	if (workflow.project_id !== projectId) throw error(404, 'Workflow not found');

	const fc = await buildWorkflowFeatureCollection(pb, projectId, workflowId);
	return new Response(JSON.stringify(fc), {
		headers: {
			'Content-Type': 'application/geo+json; charset=utf-8',
			'Cache-Control': 'no-store'
		}
	});
};
