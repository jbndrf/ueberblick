/**
 * Turns a project's workflow instances and markers into GeoJSON FeatureCollections
 * for external GIS clients (QGIS). Read-only.
 *
 * Single source of truth: this reuses the SAME row-building the admin data view
 * uses (`buildRowsFromInstances` + friends in `$lib/admin/workflow-rows`) and the
 * same `custom_table_selector` label resolution (`resolveFieldEntities`), so the
 * attributes QGIS sees match what an admin sees in SECTOR. The `pb` passed in is
 * already authenticated as the owning admin (see `api-token.ts`), so PocketBase's
 * own access rules scope everything — this module adds no scoping of its own.
 *
 * Geometry is emitted verbatim from `workflow_instances.geometry` (already GeoJSON,
 * WGS84 / [lon,lat], RFC 7946). Point workflows whose geometry is null fall back to
 * the derived `centroid`.
 */
import type PocketBase from 'pocketbase';
import {
	fetchFieldValuesForWorkflow,
	fetchParticipantNameMapForProject,
	buildRowsFromInstances
} from '$lib/admin/workflow-rows';
import { resolveFieldEntities } from '$lib/admin/resolve-field-entities';

export type GeoJsonGeometry = {
	type: string;
	coordinates: unknown;
};

export type GeoJsonFeature = {
	type: 'Feature';
	id: string;
	geometry: GeoJsonGeometry | null;
	properties: Record<string, unknown>;
};

export type GeoJsonFeatureCollection = {
	type: 'FeatureCollection';
	features: GeoJsonFeature[];
};

export type ProjectLayer = {
	type: 'workflow' | 'markers';
	id: string | null;
	name: string;
	geometry_type: string | null;
	feature_count: number;
	url: string;
};

type StageRec = { id: string; stage_name: string };
type FieldDefRec = { id: string; label?: string; field_type?: string; field_options?: unknown };
type NamedRec = { id: string; name: string };
type GeoPoint = { lon: number; lat: number };
type InstanceRec = {
	id: string;
	geometry?: GeoJsonGeometry | null;
	centroid?: GeoPoint | null;
	last_activity_at?: string;
};
type MarkerRec = {
	id: string;
	title?: string;
	description?: string;
	category_id?: string;
	location?: GeoPoint | null;
	properties?: Record<string, unknown> | null;
	created?: string;
	created_by?: string;
};

const SYSTEM_PROP_NAMES = [
	'id',
	'status',
	'current_stage',
	'created_by',
	'created',
	'last_activity_at'
];

function uniqueName(base: string, taken: Set<string>): string {
	const name = base || 'field';
	if (!taken.has(name)) {
		taken.add(name);
		return name;
	}
	let n = 2;
	while (taken.has(`${name}_${n}`)) n++;
	const result = `${name}_${n}`;
	taken.add(result);
	return result;
}

/**
 * Format a stored field value for a GeoJSON property:
 *  - custom_table_selector ids -> human labels (single or multi-select)
 *  - arrays -> "; "-joined
 *  - objects -> JSON string
 *  - scalars -> as-is
 */
function formatValue(
	fieldId: string,
	raw: unknown,
	relationLabelByField: Map<string, Map<string, string>>
): unknown {
	const lookup = relationLabelByField.get(fieldId);
	if (lookup && lookup.size > 0) {
		const ids = Array.isArray(raw) ? raw : [raw];
		const labels = ids
			.filter((v): v is string => typeof v === 'string' && v.length > 0)
			.map((id) => lookup.get(id) ?? id);
		return labels.join('; ');
	}
	if (Array.isArray(raw))
		return raw.map((v) => (typeof v === 'object' ? JSON.stringify(v) : v)).join('; ');
	if (raw !== null && typeof raw === 'object') return JSON.stringify(raw);
	return raw;
}

/** Build the FeatureCollection for one workflow. Assumes `workflowId` belongs to `projectId`. */
export async function buildWorkflowFeatureCollection(
	pb: PocketBase,
	projectId: string,
	workflowId: string
): Promise<GeoJsonFeatureCollection> {
	const [stages, defs, roles, instances, fieldValues, creatorNameById] = await Promise.all([
		pb.collection('workflow_stages').getFullList<StageRec>({
			filter: `workflow_id = "${workflowId}"`,
			fields: 'id,stage_name',
			requestKey: null
		}),
		pb.collection('workflow_field_defs').getFullList<FieldDefRec>({
			filter: `workflow_id = "${workflowId}"`,
			sort: 'created',
			requestKey: null
		}),
		pb.collection('roles').getFullList<NamedRec>({
			filter: `project_id = "${projectId}"`,
			fields: 'id,name',
			requestKey: null
		}),
		pb.collection('workflow_instances').getFullList<InstanceRec>({
			filter: `workflow_id = "${workflowId}"`,
			sort: 'created',
			requestKey: null
		}),
		fetchFieldValuesForWorkflow(pb, workflowId),
		fetchParticipantNameMapForProject(pb, projectId)
	]);

	const stageNameById = new Map<string, string>();
	for (const s of stages) stageNameById.set(s.id, s.stage_name);

	const relationsResolved = await resolveFieldEntities(
		pb,
		defs.map((d) => ({ id: d.id, field_type: d.field_type, field_options: d.field_options })),
		projectId,
		roles.map((r) => ({ id: r.id, name: r.name }))
	);
	const relationLabelByField = new Map<string, Map<string, string>>();
	for (const [fieldId, ents] of Object.entries(relationsResolved)) {
		relationLabelByField.set(fieldId, new Map(ents.map((e) => [e.id, e.label])));
	}

	// Stable property-name per field def (computed once so every feature shares one
	// schema, which QGIS expects). Disambiguate colliding labels and system names.
	const taken = new Set<string>(SYSTEM_PROP_NAMES);
	const propNameByFieldId = new Map<string, string>();
	for (const d of defs) {
		propNameByFieldId.set(d.id, uniqueName((d.label || '').trim(), taken));
	}

	const rows = buildRowsFromInstances(instances, fieldValues, {
		stageNameById,
		creatorNameById
	});
	const instById = new Map(instances.map((i) => [i.id, i]));

	const features: GeoJsonFeature[] = rows.map((row) => {
		const inst = instById.get(row.id);
		let geometry: GeoJsonGeometry | null = inst?.geometry ?? null;
		if (!geometry && inst?.centroid) {
			geometry = { type: 'Point', coordinates: [inst.centroid.lon, inst.centroid.lat] };
		}

		const properties: Record<string, unknown> = {
			id: row.id,
			status: row.status,
			current_stage: row.current_stage_name,
			created_by: row.created_by_name,
			created: row.created,
			last_activity_at: inst?.last_activity_at ?? null
		};

		for (const [fieldId, raw] of Object.entries(row.fieldData)) {
			const name = propNameByFieldId.get(fieldId) ?? fieldId;
			properties[name] = formatValue(fieldId, raw, relationLabelByField);
		}
		for (const [fieldId, files] of Object.entries(row.fileData)) {
			const name = propNameByFieldId.get(fieldId) ?? fieldId;
			properties[name] = files.map((f) => f.fileName).join('; ');
		}

		return { type: 'Feature', id: row.id, geometry, properties };
	});

	return { type: 'FeatureCollection', features };
}

/** Build the markers FeatureCollection for a project (Point geometry from `location`). */
export async function buildMarkersFeatureCollection(
	pb: PocketBase,
	projectId: string
): Promise<GeoJsonFeatureCollection> {
	const [markers, categories] = await Promise.all([
		pb.collection('markers').getFullList<MarkerRec>({
			filter: `project_id = "${projectId}"`,
			sort: 'created',
			requestKey: null
		}),
		pb.collection('marker_categories').getFullList<NamedRec>({
			filter: `project_id = "${projectId}"`,
			fields: 'id,name',
			requestKey: null
		})
	]);
	const catNameById = new Map<string, string>();
	for (const c of categories) catNameById.set(c.id, c.name);

	const features: GeoJsonFeature[] = [];
	for (const m of markers) {
		if (!m.location || typeof m.location.lon !== 'number' || typeof m.location.lat !== 'number')
			continue;
		const properties: Record<string, unknown> = {
			id: m.id,
			title: m.title ?? '',
			description: m.description ?? '',
			category: (m.category_id && catNameById.get(m.category_id)) || '',
			created: m.created,
			created_by: m.created_by ?? ''
		};
		if (m.properties && typeof m.properties === 'object') {
			for (const [k, v] of Object.entries(m.properties)) {
				if (k in properties) continue;
				properties[k] = v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
			}
		}
		features.push({
			type: 'Feature',
			id: m.id,
			geometry: { type: 'Point', coordinates: [m.location.lon, m.location.lat] },
			properties
		});
	}

	return { type: 'FeatureCollection', features };
}

/** List the GeoJSON layers available for a project, with feature counts + URLs. */
export async function buildProjectLayerIndex(
	pb: PocketBase,
	projectId: string,
	baseUrl: string
): Promise<{ project_id: string; layers: ProjectLayer[] }> {
	const root = `${baseUrl.replace(/\/$/, '')}/api/geo/projects/${projectId}`;
	const workflows = await pb
		.collection('workflows')
		.getFullList<{ id: string; name: string; geometry_type?: string }>({
			filter: `project_id = "${projectId}"`,
			fields: 'id,name,geometry_type',
			requestKey: null
		});

	const layers: ProjectLayer[] = [];
	for (const wf of workflows) {
		const count = await pb
			.collection('workflow_instances')
			.getList(1, 1, { filter: `workflow_id = "${wf.id}"`, fields: 'id', requestKey: null });
		layers.push({
			type: 'workflow',
			id: wf.id,
			name: wf.name,
			geometry_type: wf.geometry_type ?? null,
			feature_count: count.totalItems,
			url: `${root}/workflows/${wf.id}.geojson`
		});
	}

	const markerCount = await pb
		.collection('markers')
		.getList(1, 1, { filter: `project_id = "${projectId}"`, fields: 'id', requestKey: null });
	layers.push({
		type: 'markers',
		id: null,
		name: 'Markers',
		geometry_type: 'Point',
		feature_count: markerCount.totalItems,
		url: `${root}/markers.geojson`
	});

	return { project_id: projectId, layers };
}
