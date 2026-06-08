import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireApiTokenAdmin } from '$lib/server/api-token';
import { buildProjectLayerIndex } from '$lib/server/workflow-feature-model';
import { assertProjectAccess } from './scope';

// GET /api/geo/projects/{projectId}
// Lists the GeoJSON layers available for a project (one per workflow + markers),
// with feature counts and ready-to-paste .geojson URLs for QGIS.
export const GET: RequestHandler = async (event) => {
	const { pb, tokenRec } = await requireApiTokenAdmin(event);
	const projectId = event.params.projectId!;
	await assertProjectAccess(pb, tokenRec, projectId);

	const index = await buildProjectLayerIndex(pb, projectId, event.url.origin);
	return json(index);
};
