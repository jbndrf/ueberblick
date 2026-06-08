import type { RequestHandler } from './$types';
import { requireApiTokenAdmin } from '$lib/server/api-token';
import { buildMarkersFeatureCollection } from '$lib/server/workflow-feature-model';
import { assertProjectAccess } from '../scope';

// GET /api/geo/projects/{projectId}/markers.geojson
// Returns the project's markers as a GeoJSON FeatureCollection (Point, WGS84).
export const GET: RequestHandler = async (event) => {
	const { pb, tokenRec } = await requireApiTokenAdmin(event);
	const projectId = event.params.projectId!;
	await assertProjectAccess(pb, tokenRec, projectId);

	const fc = await buildMarkersFeatureCollection(pb, projectId);
	return new Response(JSON.stringify(fc), {
		headers: {
			'Content-Type': 'application/geo+json; charset=utf-8',
			'Cache-Control': 'no-store'
		}
	});
};
